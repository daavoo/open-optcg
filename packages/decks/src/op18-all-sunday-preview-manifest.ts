import type { DeckManifest } from "./index.js";

/**
 * Blue Ms. All Sunday (OP18-041): the pre-release {Baroque Works} build Card
 * Kaizoku published on 10 Nov 2026, shared through the Card Kaizoku deck
 * builder and the cardkaizoku YouTube channel. OP-18 is not tournament legal
 * until 27 Nov 2026, so the list has no event or placing.
 *
 * Source: Card Kaizoku's deck builder,
 * https://www.cardkaizoku.com/deckbuilder?deck=1xOP18-041%7C4xOP09-056%7C4xOP16-056%7C4xOP18-044%7C4xOP18-046%7C2xOP18-047%7C4xOP18-048%7C4xOP18-049%7C4xOP18-050%7C4xOP18-051%7C4xOP18-052%7C4xOP18-053%7C4xOP18-054%7C4xOP18-059&rotation=1&game=onepiece
 * (the URL's `deck` parameter encodes the whole list, Leader and counts),
 * retrieved 2026-11-15. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Ms. All Sunday builds in the
 * learned model's training pool it is the one that model wins most with
 * against the meta field. It is the first shipped list behind this Leader, and
 * a pre-release build, which a tournament list replaces once the set has
 * results.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18AllSundayPreviewManifest: DeckManifest = {
  id: "(Blue) Ms. All Sunday - Card Kaizoku OP-18 Pre-release",
  format: "standard",
  leader: "OP18-041",
  recommended: true,
  cards: {
    "OP09-056": 4,
    "OP16-056": 4,
    "OP18-044": 4,
    "OP18-046": 4,
    "OP18-047": 2,
    "OP18-048": 4,
    "OP18-049": 4,
    "OP18-050": 4,
    "OP18-051": 4,
    "OP18-052": 4,
    "OP18-053": 4,
    "OP18-054": 4,
    "OP18-059": 4,
  },
};
