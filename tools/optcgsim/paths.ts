/**
 * Where the bridge keeps things between runs, per platform.
 *
 * The model cache and the launcher's install record live under the user's
 * application-support folder rather than beside the checkout: a launcher that
 * a player double-clicks has no checkout to write into, and one copy of a
 * twelve-megabyte pack should serve every checkout on the machine.
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** `~/Library/Application Support/open-optcg` and its Windows/Linux peers. */
export function appSupportDir(): string {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Application Support", "open-optcg");
    case "win32":
      return join(
        process.env.APPDATA ?? join(home, "AppData", "Roaming"),
        "open-optcg",
      );
    default:
      return join(
        process.env.XDG_DATA_HOME ?? join(home, ".local", "share"),
        "open-optcg",
      );
  }
}

/** The `model-*` releases downloaded so far, one folder per tag. */
export function modelCacheDir(): string {
  return join(appSupportDir(), "models");
}

/** The launcher's own state: which sim folder it installed into, and when. */
export function launcherStatePath(): string {
  return join(appSupportDir(), "bridge.json");
}
