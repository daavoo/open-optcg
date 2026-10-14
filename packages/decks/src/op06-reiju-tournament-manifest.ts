import type { DeckManifest } from "./index.js";

/**
 * Blue/Purple Vinsmoke Reiju, the {GERMA 66} deck that wins by staying at or
 * under the opponent's DON!! count: the list that went 4-0 and took 1st at a
 * Store Battle at goodgames (Australia) on 9 Jun 2025, pilot handle
 * "TheKlet_OPTCG".
 *
 * Source: onepiecetopdecks.com's English EB-02 deck-list page, retrieved
 * 9 Oct 2026, whose `deckgen` link for the entry (`hs=goodgames`,
 * `tn=SB(4-0)`) encodes the whole 50 as machine-readable card counts. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * Why this list: of the 105 Reiju lists on the aggregator, every one with a
 * placing is from 2024-2025, and the deck has not been rebuilt since block 1
 * rotated. This is one of two 1st-place lists that are wholly Standard-legal
 * under OP-17 and play seventeen identities no other shipped deck does -- the
 * {GERMA 66} pool the catalog otherwise never deals.
 *
 * ## What the deck does
 *
 * The Leader draws a card the first time each turn a DON!! card returns to the
 * DON!! deck, and most of the list pays DON!! −1 to do something, so DON!!
 * returned is cards drawn. OP06-060 Ichiji, OP06-064 Niji and OP06-068 Reiju
 * each return a DON!! and trash themselves to play their bigger namesake from
 * hand or trash: OP06-061 Ichiji (7 cost, −2000 and [Rush]), OP06-065 Niji (5
 * cost, K.O. a 2 or bounce a 4) and OP06-069 Reiju (4 cost, draw two). Each of
 * those [On Play]s, and OP06-063 Sora's and OP07-066 Chopper's, only work while
 * the deck has no more DON!! than the opponent, which is the other reason to
 * keep returning them. OP06-062 Judge returns one more to replay four
 * {GERMA 66} bodies from the trash.
 *
 * OP08-074 Black Maria is the release valve: five rested DON!! for the turn,
 * handed back at the end of it until the counts match again -- which triggers
 * the Leader's draw. OP07-072 Porche, OP10-063 Sanji, OP11-047 Reiju, the
 * GERMA 66 Event and the Kingdom of GERMA Stage dig for pieces, and OP06-047
 * Pudding resets the opponent's hand.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op06ReijuTournamentManifest: DeckManifest = {
  id: "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle",
  format: "standard",
  leader: "OP06-042",
  cards: {
    "OP06-063": 2,
    "OP10-063": 4,
    "OP06-068": 4,
    "OP07-066": 4,
    "OP06-064": 2,
    "OP07-072": 4,
    "OP08-074": 4,
    "OP06-060": 4,
    "OP06-069": 4,
    "OP06-065": 2,
    "OP06-061": 4,
    "OP06-062": 1,
    "OP06-047": 1,
    "OP11-047": 4,
    "OP11-045": 1,
    "OP06-078": 1,
    "OP06-079": 4,
  },
};
