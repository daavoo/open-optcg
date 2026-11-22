/**
 * The launcher's command line.
 *
 *   bridge            set up if needed, start the bridge, start the sim
 *   bridge play       the same (this is what a double-clicked app runs)
 *   bridge page       the local control page at http://127.0.0.1:7787
 *   bridge install    put BepInEx and the plugin beside the sim, and stop
 *   bridge status     what is installed, and where
 *
 * `play` is the default with no arguments because that is what the app is for:
 * a player double-clicks it and gets the sim, not a web page. The page is
 * still there for the times a person has to decide something -- no sim found,
 * a folder to change -- and it is what `bridge page` opens.
 *
 * The body is one async function rather than top-level awaits, because the
 * single-file binary (`launcher/sea.ts`) embeds this in Node's
 * CommonJS-only SEA runtime, where a top-level await is a syntax error.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { ensureBridge } from "../bridge.js";
import { modelCacheDir } from "../paths.js";
import { installedState, installSim } from "./install.js";
import {
  bundledPluginPath,
  findSimDir,
  isSimDir,
  launchSim,
  platformOf,
  pluginPath,
  simIsRunning,
  simMarker,
  waitForSimExit,
  waitForSimStart,
} from "./platform.js";
import { startLauncher, LAUNCHER_PORT } from "./launcher.js";

function log(line: string): void {
  console.log(line);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // No arguments is the app being opened: play. A bare flag is aimed at the
  // page, whose flags these are, so it lands there rather than on a command.
  const command =
    args[0] === undefined ? "play" : args[0].startsWith("-") ? "page" : args[0];
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const has = (name: string): boolean => args.includes(`--${name}`);

  const platform = platformOf();
  const bridgePort = Number(flag("bridge-port") ?? 7788);

  /** Serves the control page and opens the browser at it. */
  async function page(): Promise<void> {
    const launcher = await startLauncher({
      ...(flag("sim-dir") ? { simDir: flag("sim-dir")! } : {}),
      port: Number(flag("port") ?? LAUNCHER_PORT),
      bridgePort,
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
  }

  if (command === "install") {
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
    console.log(`sim running: ${simIsRunning(state.platform)}`);
    return;
  }

  if (command === "play") {
    const simDir =
      flag("sim-dir") ?? installedState()?.simDir ?? findSimDir(platform);
    if (!simDir) {
      console.log(
        "OPTCGSim was not found; opening the page so you can point at its folder",
      );
      await page();
      return;
    }
    const state = installedState();
    if (!state || state.simDir !== simDir || !existsSync(pluginPath(simDir))) {
      const bundled = bundledPluginPath();
      await installSim({
        simDir,
        platform,
        ...(bundled ? { bundledPlugin: bundled } : {}),
        log,
      });
    }
    const ensured = await ensureBridge({
      port: bridgePort,
      cacheDir: modelCacheDir(),
      log,
    });
    if (simIsRunning(platform)) {
      console.log("OPTCGSim is already running; the bridge is up");
    } else {
      launchSim(simDir, platform);
      if (!(await waitForSimStart(platform))) {
        console.error("OPTCGSim did not start; opening the page for details");
        await page();
        return;
      }
      console.log("OPTCGSim is up");
    }
    console.log("close the sim to stop the bridge");
    await waitForSimExit(platform);
    if (ensured.owned) await ensured.bridge.close();
    return;
  }

  if (command === "page" || command === "launch") {
    await page();
    return;
  }

  console.error("usage: bridge [play | page | install | status]");
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
