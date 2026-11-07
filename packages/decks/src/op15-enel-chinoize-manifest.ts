import type { DeckManifest } from "./index.js";

/**
 * Purple Enel (OP15-058): the list pilot "Wortaxx" took to 2nd, 5-1, at a
 * 64-player ChinoizeCup on the simulator on 25 Aug 2026. The same pilot is
 * listed with the same fifty for a top 8 at a 128-player ChinoizeCup on
 * 18 Aug 2026.
 *
 * Source: onepiecetopdecks.com's English OP-17 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/
 * (entry "P Enel", 2nd (5-1), sim, ChinoizeCup(64), 8/25/2026), whose
 * `deckgen` link encodes the whole fifty as card counts, retrieved 2026-11-07.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Enel builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. It replaces "(Purple) Enel - 1st Place Store Battle 2026-04-11"
 * as the Leader's Community list -- a shelf carries one list per Leader -- and
 * that list stays a training list in `ml/bridge/decks.ts` under its id.
 * Bandai's feature deck shares the Leader, so `op16-enel-policy.ts` pilots all
 * of them.
 *
 * Against that list it adds 3 OP05-077 Gamma Knife, 2 OP09-072 Franky, 2
 * OP10-067 Senor Pink. It drops 4 OP07-064 Sanji, 3 OP15-060 Enel, 4 OP15-066
 * Satori. It changes the count of OP12-071 Charlotte Pudding 2 to 4, OP15-074
 * Varie 2 to 3, OP15-075 El Thor 3 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op15EnelChinoizeManifest: DeckManifest = {
  id: "(Purple) Enel - 2nd Place ChinoizeCup 2026-08-25",
  format: "standard",
  leader: "OP15-058",
  recommended: true,
  cards: {
    "OP05-077": 3,
    "OP09-072": 2,
    "OP10-067": 2,
    "OP12-063": 3,
    "OP12-071": 4,
    "OP13-076": 1,
    "OP15-061": 4,
    "OP15-067": 4,
    "OP15-071": 4,
    "OP15-074": 3,
    "OP15-075": 4,
    "OP15-076": 4,
    "OP15-077": 4,
    "OP15-078": 4,
    "OP15-118": 4,
  },
};
