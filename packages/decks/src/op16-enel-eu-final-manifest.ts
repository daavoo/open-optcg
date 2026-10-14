import type { DeckManifest } from "./index.js";

/**
 * Purple Enel, the list that won the Europe Championship 26-27 Season 1 Final
 * (Utrecht, 5-6 September 2026), transcribed from the tournament record.
 *
 * Source: onepiecetopdecks.com's OP-17 deck-list page, retrieved 19 Sep 2026,
 * whose `deckgen` link for the "1st Place, EU Final, Bandai (Utrecht)" entry
 * (pilot handle "Frle", dated 6 Sep 2026) encodes the whole 50 as machine-
 * readable card counts rather than a transcription from an image. Bandai's own
 * BCG Fest Utrecht decklist graphic shows the same seventeen identities at
 * the same counts, which is the second reading the list was checked against.
 * Card text for every identity is stamped from Bandai's own cardlist pages by
 * `pnpm reference:audit`; no identity here is new to the pool, so the deck
 * needs no entry of its own in the audit's community pass.
 *
 * Same Leader as `op16-enel-manifest.ts` and the same twenty-four-card thunder
 * suite, so `op16-enel-policy.ts` pilots it unchanged; where the two lists
 * differ is the body count, and the differences are what the OP-17 field
 * moved the deck toward:
 *
 * - **3 OP15-071 Holly.** Every [Ohm] and Holly itself gain [Double Attack],
 *   and on the opponent's turn their base power becomes 6000. Four Ohm plus
 *   three Holly turn the Leader's four rested DON!! into a 6000 two-damage
 *   swing on turn 2, which is the pressure line the feature deck bought with
 *   Blockers instead.
 * - **3 ST10-010 Trafalgar Law** and **1 OP07-064 Sanji** are the Blockers,
 *   replacing 4 Franky and 4 Reiju. Law's [On Play] trashes two cards from a
 *   seven-card opposing hand; Sanji comes down for 3 when this deck's six-card
 *   field is two DON!! behind, which it almost always is by turn 4.
 * - **3 OP10-067 Senor Pink**, up from 1: with three copies the recursion is
 *   a plan rather than a recovery, a 5-cost 6000 body that returns an Event
 *   and refunds a DON!!.
 * - **2 OP15-118 Enel**, down from 4, and **1 OP13-076 Divine Departure** plus
 *   **1 OP09-077 Gum-Gum Lightning** as the flex slots: a −8000 the given DON!!
 *   unlock and a DON!! −2 K.O. that pays for itself under this Leader.
 * - **3 Varie** rather than 4, and 4 Charlotte Pudding.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op16EnelEuFinalManifest: DeckManifest = {
  id: "(Purple) Enel - 1st Place EU Championship 26-27 S1",
  format: "standard",
  leader: "OP15-058",
  cards: {
    "OP12-071": 4,
    "OP15-061": 4,
    "OP15-066": 2,
    "OP15-067": 4,
    "OP15-071": 3,
    "ST10-010": 3,
    "OP10-067": 3,
    "OP07-064": 1,
    "OP15-118": 2,
    "OP13-076": 1,
    "OP15-074": 3,
    "OP15-075": 4,
    "OP15-076": 4,
    "OP15-077": 4,
    "OP15-078": 4,
    "OP05-077": 3,
    "OP09-077": 1,
  },
};
