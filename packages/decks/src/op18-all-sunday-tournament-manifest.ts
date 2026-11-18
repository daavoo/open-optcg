import type { DeckManifest } from "./index.js";

/**
 * Blue Ms. All Sunday (OP18-041): the list pilot "Tsaams" took to 4th of 121
 * (6-1) at [OP18] ChinoizeCup #136 MONDAY, an online OPTCGSim event played on
 * 16 Nov 2026 that allowed OP-18 cards ahead of their release.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6af5879bdcbca32da6c4f034/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-11-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It keeps OP-18's {Baroque Works} pairs and adds the OP-16 Impel Down package:
 * OP16-045 Crocodile, a [Blocker] that returns one of your Characters to hand
 * to play a 2-cost Impel Down Character, and the OP16-054 Mr.1 and OP16-055
 * Mr.2 that draw when they land, with one EB05-028 Boa Hancock against a full
 * hand.
 *
 * It is the Leader's `recommended` list: of the Ms. All Sunday builds the
 * learned model was trained on, played into the meta field on the same seeds,
 * it is the one that model wins most with, ahead of "(Blue) Ms. All Sunday -
 * Card Kaizoku OP-18 Pre-release", which it replaces on the shelf and which
 * stays a training-only list in `ml/bridge/decks.ts`.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18AllSundayTournamentManifest: DeckManifest = {
  id: "(Blue) Ms. All Sunday - 4th Place ChinoizeCup #136",
  format: "standard",
  leader: "OP18-041",
  recommended: true,
  cards: {
    "EB05-028": 1,
    "OP09-056": 4,
    "OP16-045": 4,
    "OP16-054": 4,
    "OP16-055": 2,
    "OP16-056": 3,
    "OP18-046": 4,
    "OP18-047": 2,
    "OP18-048": 4,
    "OP18-049": 4,
    "OP18-050": 4,
    "OP18-051": 2,
    "OP18-052": 4,
    "OP18-053": 2,
    "OP18-054": 4,
    "OP18-059": 2,
  },
};
