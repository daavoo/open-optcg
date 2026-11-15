import type { DeckManifest } from "./index.js";

/**
 * Red Portgas.D.Ace (OP16-001): the list pilot "Hideyoshi" took to 9-2, without
 * a top-cut placing, at FlameFlame, a Bandai-hosted event in Japan on 4 Oct
 * 2026.
 *
 * Source: onepiecetopdecks.com's Japan OP-17 deck-list page,
 * https://onepiecetopdecks.com/deck-list/japan-op17-deck-list-the-worlds-strongest-warriors/
 * (entry "Red Ace", Hideyoshi, NA (9-2), FlameFlame, Bandai, 10/4/2026; the
 * fifty is the entry's deck-generator link), retrieved 2026-11-15. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Portgas.D.Ace builds in the
 * learned model's training pool it is the one that model wins most with
 * against the meta field. It takes the Leader's Community shelf from
 * "(Red) Portgas.D.Ace - Open OPTCG" -- a shelf carries one list per Leader --
 * and that list stays a training list in `ml/bridge/decks.ts` under its id.
 * "(Red) Portgas.D.Ace - Official Feature Deck" keeps its own shelf, and the
 * same rules policy pilots all three.
 *
 * Against the Open OPTCG list it adds 1 OP08-118 Silvers Rayleigh, 2 OP16-020
 * If You're Coming with Me... Kiss Your Lives Goodbye!!. It drops 3 OP10-005
 * Sanji, 2 OP17-016 Rakuyo, 2 EB01-002 Izo. It changes the count of OP16-003
 * Edward.Newgate 3 to 4, OP16-014 Marco 3 to 4, OP17-005 Edward.Newgate 3 to 4,
 * OP17-017 Ga Ha Ha Ha!! 3 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op16AceFlameflameManifest: DeckManifest = {
  id: "(Red) Portgas.D.Ace - FlameFlame 2026-10-04",
  format: "standard",
  leader: "OP16-001",
  recommended: true,
  cards: {
    "OP08-118": 1,
    "OP13-016": 4,
    "OP16-003": 4,
    "OP16-004": 4,
    "OP16-011": 3,
    "OP16-014": 4,
    "OP16-015": 4,
    "OP16-017": 4,
    "OP16-020": 2,
    "OP16-021": 4,
    "OP16-118": 4,
    "OP17-005": 4,
    "OP17-006": 4,
    "OP17-017": 4,
  },
};
