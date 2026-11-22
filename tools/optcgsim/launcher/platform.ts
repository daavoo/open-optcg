/**
 * Where OPTCGSim lives, and which BepInEx build goes beside it.
 *
 * The launcher installs into the folder that holds the sim's executable --
 * `OPTCGSim.app` on macOS, `OPTCGSim.exe` on Windows -- because that is where
 * BepInEx's loader looks for `BepInEx/` and its doorstop library. The plugin
 * is built against BepInEx 5.4.23.6 (the version the README pins), so that is
 * the build the launcher installs.
 */
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

/** Where the plugin goes once extracted. */
export function pluginPath(simDir: string): string {
  return join(simDir, "BepInEx", "plugins", "OpenOptcgBridge.dll");
}

/** Whether BepInEx is already installed in `folder`. */
export function hasBepInEx(folder: string): boolean {
  return existsSync(join(folder, "BepInEx", "core", "BepInEx.dll"));
}
