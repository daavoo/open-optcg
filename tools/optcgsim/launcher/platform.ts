/**
 * Where OPTCGSim lives, and which BepInEx build goes beside it.
 *
 * The launcher installs into the folder that holds the sim's executable --
 * `OPTCGSim.app` on macOS, `OPTCGSim.exe` on Windows -- because that is where
 * BepInEx's loader looks for `BepInEx/` and its doorstop library. The plugin
 * is built against BepInEx 5.4.23.6 (the version the README pins), so that is
 * the build the launcher installs.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Platform = "macos" | "windows" | "linux";

/** The BepInEx build every plugin here is compiled against. */
export const BEPINEX_VERSION = "5.4.23.6";
const BEPINEX_TAG = `v${BEPINEX_VERSION}`;

export function platformOf(value: string = process.platform): Platform {
  if (value === "darwin") return "macos";
  if (value === "win32") return "windows";
  return "linux";
}

/** The file whose presence says a folder is a sim install. */
export function simMarker(platform: Platform): string {
  switch (platform) {
    case "macos":
      return "OPTCGSim.app";
    case "windows":
      return "OPTCGSim.exe";
    default:
      return "OPTCGSim.x86_64";
  }
}

/** The folder BepInEx is extracted into, and the script that starts the sim. */
export function runScript(platform: Platform): string | null {
  return platform === "windows" ? null : "run_bepinex.sh";
}

/** The name the run script must hand the loader on this platform. */
export function executableName(platform: Platform): string {
  return simMarker(platform);
}

/** Every folder the sim is installed into by default, in the order to try. */
export function simCandidates(platform: Platform = platformOf()): string[] {
  const home = homedir();
  switch (platform) {
    case "macos":
      return ["/Applications/OPTCGSim", join(home, "Applications", "OPTCGSim")];
    case "windows":
      return [
        join(process.env["ProgramFiles"] ?? "C:\\Program Files", "OPTCGSim"),
        join(
          process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
          "OPTCGSim",
        ),
        join(
          process.env["LOCALAPPDATA"] ?? join(home, "AppData", "Local"),
          "OPTCGSim",
        ),
      ];
    default:
      return [
        join(home, ".steam/steam/steamapps/common/OPTCGSim"),
        join(home, ".local/share/Steam/steamapps/common/OPTCGSim"),
        join(home, "OPTCGSim"),
      ];
  }
}

/** The first default folder that holds a sim install, or undefined. */
export function findSimDir(
  platform: Platform = platformOf(),
): string | undefined {
  return simCandidates(platform).find((folder) =>
    existsSync(join(folder, simMarker(platform))),
  );
}

/** Whether `folder` looks like a sim install on this platform. */
export function isSimDir(
  folder: string,
  platform: Platform = platformOf(),
): boolean {
  return existsSync(join(folder, simMarker(platform)));
}

/** BepInEx's release asset for the platform. */
export function bepinexAsset(platform: Platform): string {
  switch (platform) {
    case "macos":
      return `BepInEx_macos_universal_${BEPINEX_VERSION}.zip`;
    case "windows":
      return `BepInEx_win_x64_${BEPINEX_VERSION}.zip`;
    default:
      return `BepInEx_linux_x64_${BEPINEX_VERSION}.zip`;
  }
}

/** BepInEx's release asset URL, which the launcher downloads. */
export function bepinexUrl(platform: Platform): string {
  return `https://github.com/BepInEx/BepInEx/releases/download/${BEPINEX_TAG}/${bepinexAsset(platform)}`;
}

/** The plugin asset the bridge release carries for the platform. */
export function pluginAsset(platform: Platform): string {
  return `OpenOptcgBridge-${platform}.dll`;
}

/** The single-file launcher the release carries for the platform. */
export function binaryAsset(platform: Platform): string {
  return platform === "windows"
    ? "open-optcg-bridge-windows.exe"
    : `open-optcg-bridge-${platform}`;
}

/**
 * The zipped macOS application, which is what a macOS player downloads: a
 * bare executable arrives quarantined and iconless, and a `.app` is a folder.
 */
export function appAsset(platform: Platform): string | null {
  return platform === "macos" ? "open-optcg-bridge-macos.app.zip" : null;
}

/** Where the plugin goes once extracted. */
export function pluginPath(simDir: string): string {
  return join(simDir, "BepInEx", "plugins", "OpenOptcgBridge.dll");
}

/**
 * The sim's process name, for asking the OS whether it is running.
 *
 * Matched exactly, not as a command-line substring: `pgrep -f OPTCGSim.app`
 * also matches any shell whose command line happens to mention the path, which
 * made the launcher think a sim was up when none was.
 */
export function simProcessName(platform: Platform = platformOf()): string {
  switch (platform) {
    case "macos":
      return "OPTCGSim";
    case "windows":
      return "OPTCGSim.exe";
    default:
      return "OPTCGSim.x86_64";
  }
}

/**
 * Whether the sim is already running.
 *
 * A launcher that starts a second copy on top of a running one is worse than
 * one that does nothing, and the plugin of a sim that is already up will reach
 * a bridge started now just as well, so the launcher attaches instead.
 */
export function simIsRunning(platform: Platform = platformOf()): boolean {
  try {
    if (platform === "windows") {
      const out = execFileSync(
        "tasklist",
        ["/FI", `IMAGENAME eq ${simProcessName(platform)}`, "/NH"],
        { encoding: "utf8" },
      );
      return out.includes(simProcessName(platform));
    }
    execFileSync("pgrep", ["-x", simProcessName(platform)], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** Resolves when the sim is no longer running; polls, because nothing signals it. */
export async function waitForSimExit(
  platform: Platform = platformOf(),
): Promise<void> {
  while (simIsRunning(platform)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** Whether the sim has appeared within `timeoutMs` of being started. */
export async function waitForSimStart(
  platform: Platform = platformOf(),
  timeoutMs = 15000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (simIsRunning(platform)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Starts the sim the way BepInEx expects: through its own run script.
 *
 * The script is handed to `sh` rather than executed directly so a missing
 * executable bit does not matter, and it is detached so the launcher can exit
 * without taking the sim with it.
 */
export function launchSim(
  simDir: string,
  platform: Platform = platformOf(),
): void {
  const script = runScript(platform);
  const command = script
    ? join(simDir, script)
    : join(simDir, simMarker(platform));
  const child = script
    ? spawn("/bin/sh", [command], {
        cwd: simDir,
        detached: true,
        stdio: "ignore",
      })
    : spawn(command, [], { cwd: simDir, detached: true, stdio: "ignore" });
  child.unref();
}

/** Whether BepInEx is already installed in `folder`. */
export function hasBepInEx(folder: string): boolean {
  return existsSync(join(folder, "BepInEx", "core", "BepInEx.dll"));
}

/**
 * The plugin DLL shipped inside the launcher's own macOS `.app`, when it is
 * running from one.
 *
 * Bundling it is what makes a download self-sufficient: the installer can put
 * the plugin in place with no `bridge-*` release and no network, and the
 * release page is left to updates rather than to first run. The DLL sits in
 * `Contents/Resources`, one level up from the executable in `Contents/MacOS`.
 * A raw SEA binary has no `Resources`, and under `tsx` the executable is Node,
 * so both return undefined.
 */
export function bundledPluginPath(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  if (!process.execPath.endsWith("/Contents/MacOS/open-optcg-bridge")) {
    return undefined;
  }
  const path = join(
    process.execPath,
    "..",
    "..",
    "Resources",
    "OpenOptcgBridge.dll",
  );
  return existsSync(path) ? path : undefined;
}
