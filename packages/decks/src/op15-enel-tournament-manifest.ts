import type { DeckManifest } from "./index.js";

/**
 * Purple Enel (OP15-058): the list pilot "Bloodya" took to 1st, 6-0, at a Store
 * Battle in Argentina on 11 Apr 2026.
 *
 * Source: onepiecetopdecks.com's English OP-15/EB-04 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/
 * (entry "Purple Enel", 1st Place, SB(6-0), 4/11/2026), retrieved 2026-10-17.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Enel builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. It takes the Community shelf from the EU Championship 26-27 S1
 * winner, "(Purple) Enel - 1st Place EU Championship 26-27 S1", which the
 * learned model still trains on and meets in its meta field under that id
 * (`ml/bridge/decks.ts`). Bandai's feature deck shares the Leader, so
 * `op16-enel-policy.ts` pilots all three.
 *
 * Against that list it adds 3 OP12-063 Vinsmoke Reiju, 3 OP15-060 Enel. It
 * drops 3 ST10-010 Trafalgar Law, 3 OP10-067 Senor Pink, 3 OP05-077 Gamma
 * Knife, 1 OP09-077 Gum-Gum Lightning. It changes the count of OP07-064 Sanji 1
 * to 4, OP12-071 Charlotte Pudding 4 to 2, OP15-066 Satori 2 to 4, OP15-071
 * Holly 3 to 4, OP15-074 Varie 3 to 2, OP15-075 El Thor 4 to 3, OP15-118 Enel 2
 * to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op15EnelTournamentManifest: DeckManifest = {
  id: "(Purple) Enel - 1st Place Store Battle 2026-04-11",
  format: "standard",
  leader: "OP15-058",
  recommended: true,
  cards: {
    "OP07-064": 4,
    "OP12-063": 3,
    "OP12-071": 2,
    "OP13-076": 1,
    "OP15-060": 3,
    "OP15-061": 4,
    "OP15-066": 4,
    "OP15-067": 4,
    "OP15-071": 4,
    "OP15-074": 2,
    "OP15-075": 3,
    "OP15-076": 4,
    "OP15-077": 4,
    "OP15-078": 4,
    "OP15-118": 4,
  },
};
