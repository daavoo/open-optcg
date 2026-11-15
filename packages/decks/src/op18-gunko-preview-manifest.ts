import type { DeckManifest } from "./index.js";

/**
 * Purple/Black Saint Gunko (OP18-060): the pre-release build the YouTube
 * channel "heartpiratestcg" posted on 8 Nov 2026, ahead of OP-18's release. No
 * event stands behind it -- the set is not tournament legal until 27 Nov 2026.
 *
 * Source: the video's description, https://www.youtube.com/watch?v=5w_Q8Yixgdg
 * ("Is OP18 Gunko the best deck in the game?", heartpiratestcg, 2026-11-08),
 * retrieved 2026-11-15. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Saint Gunko builds in the
 * learned model's training pool it is the one that model wins most with
 * against the meta field. It is the first shipped list behind this Leader, and
 * a pre-release build, which a tournament list replaces once the set has
 * results.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18GunkoPreviewManifest: DeckManifest = {
  id: "(Purple/Black) Saint Gunko - heartpiratestcg OP-18 Pre-release",
  format: "standard",
  leader: "OP18-060",
  recommended: true,
  cards: {
    "OP15-078": 3,
    "OP17-095": 4,
    "OP18-064": 4,
    "OP18-065": 3,
    "OP18-083": 4,
    "OP18-084": 4,
    "OP18-085": 4,
    "OP18-088": 4,
    "OP18-093": 4,
    "OP18-095": 4,
    "OP18-096": 4,
    "OP18-097": 4,
    "OP18-119": 4,
  },
};
