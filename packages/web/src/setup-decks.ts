/**
 * The deck each lobby seat was last set to, remembered across visits, so a
 * returning player finds the matchup they left rather than the two starter
 * decks.
 *
 * `Storage` is a parameter, as in match-resume.ts, so the module runs and is
 * tested without a browser; every access is guarded for the same reason.
 */
import type { PlayerId } from "@one-piece-sim/protocol";
import type { StorageLike } from "./match-resume.js";

export const SETUP_DECKS_KEY = "open-optcg.setup-decks";

/**
 * The remembered picks, each seat falling back to `defaults` when nothing is
 * stored or the stored id fails `exists` -- a deleted save, or a list dropped
 * from the build since the last visit.
 */
export function rememberedSetupDecks(
  storage: Pick<StorageLike, "getItem">,
  defaults: Record<PlayerId, string>,
  exists: (deckId: string) => boolean,
): Record<PlayerId, string> {
  const decks = { ...defaults };
  try {
    const raw = storage.getItem(SETUP_DECKS_KEY);
    if (!raw) return decks;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return decks;
    for (const seat of ["p1", "p2"] as const) {
      const id = (parsed as Record<string, unknown>)[seat];
      if (typeof id === "string" && exists(id)) decks[seat] = id;
    }
  } catch {
    // Unreadable or blocked storage: start from the defaults.
  }
  return decks;
}

export function rememberSetupDecks(
  storage: Pick<StorageLike, "setItem">,
  decks: Record<PlayerId, string>,
): void {
  try {
    storage.setItem(
      SETUP_DECKS_KEY,
      JSON.stringify({ p1: decks.p1, p2: decks.p2 }),
    );
  } catch {
    // Storage full or blocked -- the picks still hold for this session.
  }
}
