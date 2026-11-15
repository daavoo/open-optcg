import type { DeckManifest } from "./index.js";

/**
 * Green/Purple Franky (OP18-021): the "Straw Hat package" build content creator
 * Sunny_OPTCG tested in a YouTube video on 16 Sep 2026, a pre-release fan list
 * with no event or placing behind it. It was built in September 2026, before
 * most of OP-18's support for this Leader was revealed, so it plays only four
 * OP-18 cards -- the four OP18-078 Mini-Merry -- and fills the rest with the
 * ST-18 purple Straw Hats, EB02-041 Merry Go and OP05-040 Birdcage from older
 * sets.
 *
 * Source: Sunny_OPTCG's video, https://www.youtube.com/watch?v=VBPnhuFmRE8
 * (two lists in one video: this is the Straw Hat one, the other a Ramp
 * package), retrieved 2026-11-15. Every identity is stamped from Bandai's
 * cardlist pages already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Franky builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. It is the first shipped list behind this Leader, and a
 * pre-release build, which a tournament list replaces once the set has
 * results.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18FrankyPreviewManifest: DeckManifest = {
  id: "(Green/Purple) Franky - Sunny_OPTCG OP-18 Pre-release",
  format: "standard",
  leader: "OP18-021",
  recommended: true,
  cards: {
    "EB02-017": 4,
    "EB02-041": 4,
    "OP05-040": 4,
    "OP07-064": 4,
    "OP09-078": 4,
    "OP17-022": 3,
    "OP17-023": 2,
    "OP17-074": 2,
    "OP18-078": 4,
    "PRB02-012": 4,
    "ST18-001": 4,
    "ST18-003": 4,
    "ST18-004": 3,
    "ST18-005": 4,
  },
};
