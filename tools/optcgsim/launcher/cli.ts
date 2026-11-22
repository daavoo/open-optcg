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
 *
 * The body is one async function rather than top-level awaits, because the
 * single-file binary (`tools/bridge-binary.ts`) embeds this in Node's
 * CommonJS-only SEA runtime, where a top-level await is a syntax error.
 */
import { spawn } from "node:child_process";
import { installedState, installSim } from "./install.js";
import {
  bundledPluginPath,
  findSimDir,
  isSimDir,
  platformOf,
  simMarker,
} from "./platform.js";
import { startLauncher, LAUNCHER_PORT } from "./launcher.js";

function log(line: string): void {
  console.log(line);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // A bare flag means the default command, so `open --args --no-open` and a
  // double-click both land on `launch` rather than on an unknown command.
  const command =
    args[0] === undefined || args[0].startsWith("-") ? "launch" : args[0];
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const has = (name: string): boolean => args.includes(`--${name}`);

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
    const release = flag("release");
    // A macOS `.app` carries its plugin, so this works with no release at all.
    const bundled = bundledPluginPath();
    const result = await installSim({
      simDir,
      platform,
      ...(plugin ? { pluginDll: plugin } : {}),
      ...(bundled ? { bundledPlugin: bundled } : {}),
      ...(release ? { release } : {}),
      dryRun: has("dry-run"),
      log,
    });
    console.log(
      `${has("dry-run") ? "would install" : "installed"} ${result.bridge} into ${result.simDir}`,
    );
    return;
  }

  if (command === "status") {
    const state = installedState();
    if (!state) {
      console.log("not installed");
      return;
    }
    console.log(`installed: ${state.bridge}`);
    console.log(`sim folder: ${state.simDir}`);
    console.log(`sim folder exists: ${isSimDir(state.simDir, state.platform)}`);
    return;
  }

  if (command === "launch") {
    const launcher = await startLauncher({
      ...(flag("sim-dir") ? { simDir: flag("sim-dir")! } : {}),
      port: Number(flag("port") ?? LAUNCHER_PORT),
      bridgePort: Number(flag("bridge-port") ?? 7788),
      log,
    });
    console.log(`open ${launcher.url}`);
    if (!has("no-open")) open(launcher.url);
    // The launcher owns the bridge; keep this process alive until it is
    // killed. A `.app` gets SIGTERM when it is quit, a terminal Ctrl-C SIGINT.
    const stop = (): void => {
      void launcher.close().then(() => process.exit(0));
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    await new Promise(() => {});
    return;
  }

  console.error("usage: bridge launch | install | status");
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

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
