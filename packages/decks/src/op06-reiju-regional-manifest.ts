import type { DeckManifest } from "./index.js";

/**
 * Blue/Purple Vinsmoke Reiju (OP06-042): the list pilot "Svinci" took to the
 * top 32 of a 1024-player VictoryRoad Regional in Europe on 27 Sep 2025.
 *
 * Source: onepiecetopdecks.com's English OP-12 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op-12-deck-list-legacy-of-the-master/
 * (entry "Reiju", T32, Regional, VictoryRoad(1024), 9/27/2025), whose
 * `deckgen` link encodes the whole fifty as card counts, retrieved 2026-11-06.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Vinsmoke Reiju builds in the
 * learned model's training pool it is the one that model wins most with
 * against the meta field. It replaces "(Blue/Purple) Vinsmoke Reiju - 1st Place
 * Store Battle" as the Leader's Community list -- a shelf carries one list per
 * Leader -- and that list stays a training list in `ml/bridge/decks.ts` under
 * its id. The same rules policy pilots both.
 *
 * Against that list it adds 3 OP06-072 Cosette, 2 OP11-043 Vinsmoke Ichiji. It
 * drops 1 OP06-047 Charlotte Pudding, 2 OP06-064 Vinsmoke Niji, 2 OP06-065
 * Vinsmoke Niji, 1 OP06-078 GERMA 66, 1 OP11-045 Vinsmoke Niji. It changes the
 * count of OP06-063 Vinsmoke Sora 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op06ReijuRegionalManifest: DeckManifest = {
  id: "(Blue/Purple) Vinsmoke Reiju - Top 32 Regional 2025-09-27",
  format: "standard",
  leader: "OP06-042",
  recommended: true,
  cards: {
    "OP06-060": 4,
    "OP06-061": 4,
    "OP06-062": 1,
    "OP06-063": 4,
    "OP06-068": 4,
    "OP06-069": 4,
    "OP06-072": 3,
    "OP06-079": 4,
    "OP07-066": 4,
    "OP07-072": 4,
    "OP08-074": 4,
    "OP10-063": 4,
    "OP11-043": 2,
    "OP11-047": 4,
  },
};
