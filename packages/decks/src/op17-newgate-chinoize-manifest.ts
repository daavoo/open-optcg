import type { DeckManifest } from "./index.js";

/**
 * Red Edward.Newgate (OP17-001): the list pilot "Maciasoptcg" registered for
 * [OP17] ChinoizeCup #115, an online event of 128 played on Monday 28 Sep
 * 2026; the pilot dropped at 4-2 after six of the seven Swiss rounds, so the
 * list has no placing.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6ab4e5b8f127b1b52c28101c/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-11-15. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Edward.Newgate builds in the
 * learned model's training pool it is the one that model wins most with
 * against the meta field. Same Leader as "(Red) Edward.Newgate - Official
 * Feature Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 2 OP09-118 Gol.D.Roger, 4 OP12-002 Edward.Newgate,
 * 4 PRB02-003 Lucky.Roux, 4 ST30-004 Emporio.Ivankov, 4 ST30-005 Jozu. It
 * drops 4 OP17-004 Inuarashi & Nekomamushi, 4 OP17-016 Rakuyo, 2 OP17-009
 * Haruta, 2 OP17-015 Marco, 2 OP17-013 Portgas.D.Ace, 4 OP17-006 Kingdew, 4
 * OP17-007 Kouzuki Oden. It changes the count of OP17-002 Atmos 2 to 4 and
 * OP17-017 Ga Ha Ha Ha!! 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op17NewgateChinoizeManifest: DeckManifest = {
  id: "(Red) Edward.Newgate - ChinoizeCup #115",
  format: "standard",
  leader: "OP17-001",
  recommended: true,
  cards: {
    "OP09-118": 2,
    "OP12-002": 4,
    "OP16-021": 4,
    "OP16-118": 4,
    "OP17-002": 4,
    "OP17-003": 4,
    "OP17-005": 4,
    "OP17-008": 4,
    "OP17-017": 4,
    "OP17-019": 4,
    "PRB02-003": 4,
    "ST30-004": 4,
    "ST30-005": 4,
  },
};
