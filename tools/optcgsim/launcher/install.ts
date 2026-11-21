/**
 * Installing the bridge into a player's copy of OPTCGSim.
 *
 * What the README makes a person do by hand -- download BepInEx, extract it
 * beside the sim, edit `run_bepinex.sh`, build the plugin, copy the DLL into
 * `BepInEx/plugins/` -- is what this does, in the order the sim needs it:
 *
 *   1. BepInEx 5.4.23.6, extracted into the sim folder (skipped if present).
 *   2. `run_bepinex.sh`'s `executable_name`, set to the sim's own name, and
 *      the script made executable.
 *   3. The plugin DLL for the platform, from the newest `bridge-*` release.
 *
 * Nothing here touches the sim's own files: BepInEx adds files beside them,
 * and removing them is the whole uninstall.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import { Github, type ReleaseClient } from "../github.js";
import { launcherStatePath } from "../paths.js";
import {
  bepinexAsset,
  bepinexUrl,
  executableName,
  hasBepInEx,
  isSimDir,
  platformOf,
  pluginAsset,
  pluginPath,
  runScript,
  type Platform,
} from "./platform.js";

/** The tag prefix the bridge's own releases carry. */
export const BRIDGE_TAG_PREFIX = "bridge-";

export interface InstallOptions {
  /** The folder holding the sim executable. */
  simDir: string;
  platform?: Platform;
  /** Pin a release; defaults to the newest `bridge-*`. */
  release?: string;
  /** A local DLL, for a checkout that has not cut a release yet. */
  pluginDll?: string;
  github?: ReleaseClient;
  /** Where the install record is written; defaults to the app-support folder. */
  statePath?: string;
  log?: (line: string) => void;
  /** Report what would happen without writing anything. */
  dryRun?: boolean;
}

export interface InstallResult {
  simDir: string;
  platform: Platform;
  /** The `bridge-*` release installed, or `"local"` for a pinned DLL. */
  bridge: string;
  bepinexInstalled: boolean;
  pluginInstalled: boolean;
  runScript: string | null;
}

export async function installSim(
  options: InstallOptions,
): Promise<InstallResult> {
  const log = options.log ?? ((): void => {});
  const platform = options.platform ?? platformOf();
  const simDir = options.simDir;
  if (!options.dryRun && !isSimDir(simDir, platform)) {
    throw new Error(
      `NOT_A_SIM_FOLDER: ${simDir} has no ${executableName(platform)}`,
    );
  }

  const github = options.github ?? new Github("daavoo/open-optcg");
  let bridge = "local";
  let plugin: Uint8Array | undefined;
  if (options.pluginDll) {
    plugin = new Uint8Array(readFileSync(options.pluginDll));
  } else {
    const release = options.release
      ? await github.release(options.release)
      : await github.newest(BRIDGE_TAG_PREFIX);
    if (!release) {
      throw new Error(
        `BRIDGE_NOT_FOUND: no ${BRIDGE_TAG_PREFIX}* release on GitHub`,
      );
    }
    bridge = release.tag;
    const asset = release.assets.find(
      (candidate) => candidate.name === pluginAsset(platform),
    );
    if (!asset) {
      throw new Error(
        `BRIDGE_NOT_FOUND: ${release.tag} has no ${pluginAsset(platform)}`,
      );
    }
    plugin = await github.download(asset.url);
  }

  const bepinexInstalled = await installBepInEx({
    simDir,
    platform,
    github,
    log,
    dryRun: options.dryRun ?? false,
  });
  const script = runScript(platform);
  if (script) {
    await setExecutableName({
      simDir,
      platform,
      script,
      log,
      dryRun: options.dryRun ?? false,
    });
  }
  const pluginInstalled = await installPlugin({
    simDir,
    plugin,
    log,
    dryRun: options.dryRun ?? false,
  });
  if (!options.dryRun) {
    const statePath = options.statePath ?? launcherStatePath();
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(
      statePath,
      `${JSON.stringify(
        {
          simDir,
          platform,
          bridge,
          plugin: pluginPath(simDir),
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
  }
  return {
    simDir,
    platform,
    bridge,
    bepinexInstalled,
    pluginInstalled,
    runScript: script,
  };
}

async function installBepInEx(options: {
  simDir: string;
  platform: Platform;
  github: ReleaseClient;
  log: (line: string) => void;
  dryRun: boolean;
}): Promise<boolean> {
  const { simDir, platform, github, log, dryRun } = options;
  if (hasBepInEx(simDir)) {
    log(`BepInEx already in ${simDir}`);
    return false;
  }
  log(`BepInEx ${bepinexAsset(platform)} -> ${simDir}`);
  if (dryRun) return false;
  const bytes = await github.download(bepinexUrl(platform));
  const entries = unzipSync(bytes);
  for (const [name, contents] of Object.entries(entries)) {
    if (name.endsWith("/")) continue;
    const path = join(simDir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
  // macOS keeps BepInEx's doorstop library beside the executable; the
  // quarantine bit a browser download adds would stop the loader loading it.
  const script = runScript(platform);
  if (script) chmodSync(join(simDir, script), 0o755);
  return true;
}

/**
 * Points `run_bepinex.sh` at the sim.
 *
 * The script ships with `executable_name=""` and refuses to start until it is
 * filled in. It is edited in place rather than regenerated: BepInEx's own
 * script does more than launch the app, and a later BepInEx update should not
 * be undone by this.
 */
async function setExecutableName(options: {
  simDir: string;
  platform: Platform;
  script: string;
  log: (line: string) => void;
  dryRun: boolean;
}): Promise<void> {
  const { simDir, platform, script, log, dryRun } = options;
  const path = join(simDir, script);
  if (!existsSync(path)) {
    log(`${script} is missing; BepInEx may not be installed`);
    return;
  }
  const text = readFileSync(path, "utf8");
  const wanted = executableName(platform);
  const filled = text.replace(
    /^executable_name=.*$/m,
    `executable_name="${wanted}"`,
  );
  if (filled === text) return;
  log(`${script}: executable_name="${wanted}"`);
  if (dryRun) return;
  writeFileSync(path, filled);
  chmodSync(path, 0o755);
}

async function installPlugin(options: {
  simDir: string;
  plugin: Uint8Array;
  log: (line: string) => void;
  dryRun: boolean;
}): Promise<boolean> {
  const { simDir, plugin, log, dryRun } = options;
  const path = pluginPath(simDir);
  log(`plugin -> ${path}`);
  if (dryRun) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, plugin);
  return true;
}

/** What the launcher recorded last time, or nothing. */
export function installedState(path = launcherStatePath()):
  | {
      simDir: string;
      platform: Platform;
      bridge: string;
    }
  | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as {
      simDir: string;
      platform: Platform;
      bridge: string;
    };
  } catch {
    return undefined;
  }
}
