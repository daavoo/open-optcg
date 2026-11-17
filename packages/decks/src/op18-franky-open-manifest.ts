import type { DeckManifest } from "./index.js";

/**
 * Green/Purple Franky (OP18-021): the maintainer's build, supplied to the
 * project directly on 16 Nov 2026 with no event or placing behind it, and
 * shipped under the project's own "- Open OPTCG" id.
 *
 * It is built on OP-18's own support for this Leader: all four {Straw Hat
 * Crew} 5-cost Stages (OP18-075 Thousand Sunny, OP18-076 Shark Submerge 3,
 * OP18-077 White Hobby Horse 1, OP18-078 Mini-Merry), OP18-061 Iceburg and
 * OP18-070 Tom to find and recover them, OP18-074 as a Counter that needs a
 * 5-cost Stage on the field, and OP08-067 Charlotte Pudding to refund the
 * DON!! the Leader and Tom return. The Characters are 6-cost Straw Hats the
 * Stages set active again, ST30-012 Luffy and two OP17-022 Shanks.
 *
 * It is the Leader's `recommended` list: of the Franky builds the learned
 * model was trained on, played into the meta field on the same seeds, it is
 * the one that model wins most with, clearly ahead of "(Green/Purple) Franky -
 * Sunny_OPTCG OP-18 Pre-release", which it replaces on the shelf and which
 * stays a training-only list in `ml/bridge/decks.ts`. A tournament list
 * replaces it once the set has results.
 *
 * Every identity is stamped from Bandai's cardlist pages already, so the
 * audit needs no entry for it.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18FrankyOpenManifest: DeckManifest = {
  id: "(Green/Purple) Franky - Open OPTCG",
  format: "standard",
  leader: "OP18-021",
  recommended: true,
  cards: {
    "EB02-061": 4,
    "OP08-067": 4,
    "OP13-118": 4,
    "OP15-032": 4,
    "OP17-022": 2,
    "OP18-040": 2,
    "OP18-061": 2,
    "OP18-070": 4,
    "OP18-074": 4,
    "OP18-075": 4,
    "OP18-076": 4,
    "OP18-077": 4,
    "OP18-078": 4,
    "ST30-012": 4,
  },
};
