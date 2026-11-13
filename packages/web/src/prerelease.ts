/**
 * The pre-release page: the same app, built by `pnpm web:build --prerelease`
 * into a page of its own that opens on one set's sealed lobby and stays there.
 *
 * A pre-release is a sealed event for a set that is not out yet, so the page
 * offers nothing else: six packs of that set, a 40-card deck under the sealed
 * Leader, and a match against the learned model trained for that set when the
 * build was given one (`--model`). The ordinary build defines this as null and
 * is unchanged.
 */
declare const __PRERELEASE__: string | null;

/** The set code the page is locked to, or null for the ordinary app. */
export function prereleaseExpansion(): string | null {
  return typeof __PRERELEASE__ !== "undefined" ? __PRERELEASE__ : null;
}
