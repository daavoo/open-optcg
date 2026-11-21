/**
 * The launcher's command line, for the checkout and for anyone who prefers a
 * terminal to the page.
 *
 *   pnpm bridge:launch  [--port 7787] [--bridge-port 7788] [--sim-dir <path>] [--no-open]
 *   pnpm bridge:install [--sim-dir <path>] [--plugin <dll>] [--dry-run]
 *   pnpm bridge:status
 *
 * The page and the commands share one implementation: `install` is
 * `installSim`, `launch` is `startLauncher`, and the page's buttons call the
 * same functions over HTTP.
 */
import { spawn } from "node:child_process";
import { installedState, installSim } from "./install.js";
import { findSimDir, isSimDir, platformOf, simMarker } from "./platform.js";
import { startLauncher, LAUNCHER_PORT } from "./launcher.js";

const args = process.argv.slice(2);
const command = args[0] ?? "launch";
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const has = (name: string): boolean => args.includes(`--${name}`);

function log(line: string): void {
  console.log(line);
}

if (command === "install") {
  const platform = platformOf();
  const simDir =
    flag("sim-dir") ?? findSimDir(platform) ?? installedState()?.simDir;
  if (!simDir) {
    console.error(
      `no sim folder found; pass --sim-dir (looked for ${simMarker(platform)})`,
    );
    process.exit(1);
  }
  const plugin = flag("plugin");
  const result = await installSim({
    simDir,
    platform,
    ...(plugin ? { pluginDll: plugin } : {}),
    ...(flag("release") ? { release: flag("release")! } : {}),
    dryRun: has("dry-run"),
    log,
  });
  console.log(
    `${has("dry-run") ? "would install" : "installed"} ${result.bridge} into ${result.simDir}`,
  );
} else if (command === "status") {
  const state = installedState();
  if (!state) {
    console.log("not installed");
    process.exit(0);
  }
  console.log(`installed: ${state.bridge}`);
  console.log(`sim folder: ${state.simDir}`);
  console.log(`sim folder exists: ${isSimDir(state.simDir, state.platform)}`);
} else if (command === "launch") {
  const launcher = await startLauncher({
    ...(flag("sim-dir") ? { simDir: flag("sim-dir")! } : {}),
    port: Number(flag("port") ?? LAUNCHER_PORT),
    bridgePort: Number(flag("bridge-port") ?? 7788),
    log,
  });
  console.log(`open ${launcher.url}`);
  if (!has("no-open")) open(launcher.url);
  // The launcher owns the bridge; keep this process alive until it is killed.
  process.on("SIGINT", () => {
    void launcher.close().then(() => process.exit(0));
  });
  await new Promise(() => {});
} else {
  console.error("usage: pnpm bridge:launch | bridge:install | bridge:status");
  process.exit(1);
}

/** Opens a URL in the platform's browser, best-effort. */
function open(url: string): void {
  const [command, ...rest] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    spawn(command, rest, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // A machine with no browser still has the URL on stdout.
  }
}
