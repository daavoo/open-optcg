import type { DeckManifest } from "./index.js";

/**
 * OP-17 Blue Rocks D. Xebec, the format's draw-engine deck.
 *
 * Source: Bandai's own featured deck for this Leader,
 * https://en.onepiece-cardgame.com/feature/deck/deck_111.php, retrieved
 * 30 Aug 2026. The publisher's list, so the counts below are the primary
 * record rather than a transcription of somebody's read of the archetype.
 *
 * It replaces the OPDeckGuide pre-release list this deck shipped with
 * (https://opdeckguide.com/deck-guides/rocks-d-xebec-op17/). Two differences
 * matter:
 *
 *  - **OP08-051 Buckin is gone.** The guide's 50 spent three slots on a 1-cost
 *    Blue body whose printed type is "Former Rocks Pirates" -- not
 *    "Rocks Pirates" -- so it answered to nothing in the deck: not the Leader's
 *    reveal, not OP17-118's tribal deploy, not any {Rocks Pirates} buff. Its
 *    card definition stays in `packages/cards/src/op17-meta.ts`, since the
 *    registry stamps provenance per card and its clause tests still run.
 *  - **OP17-057 Fullalead comes in, four wide.** The set's one {Rocks Pirates}
 *    Stage, and a repeatable answer to the problem below: rest it and trash a
 *    card for +1000 during a battle, on a deck whose Characters print no
 *    Counter. It is also a reveal hit, so swapping the off-tribe Buckin for it
 *    raises the Leader's hit rate rather than leaving it flat.
 *
 * ## What the deck does
 *
 * The Leader turns a card in hand into two on top of the deck, whenever the
 * reveal hits {Rocks Pirates}: trash 1, reveal 1, draw 2 on a hit. That is why
 * the list is all-in on the tribe -- it is the hit rate, not a theme -- and why
 * the two 0-cost Events (OP17-055, OP17-056) matter twice, as Counters and as
 * things the Leader is happy to trash. OP17-118 Rocks D. Xebec is the payoff at
 * 10 DON!!: draw 1, then deploy two different Rocks Pirates cards totalling 9
 * or less out of the hand the Leader has been filling.
 *
 * The tension the archetype is built around is that most of the tribe prints no
 * Counter, so a large hand is not the same as a safe board -- OP17-118's own
 * "[printed text omitted -- pnpm card:text OP17-118]" is the printed acknowledgement of it, and Fullalead is the
 * official list's second one.
 */
export const op17XebecManifest: DeckManifest = {
  id: "(Blue) Rocks.D.Xebec - Official Feature Deck",
  featuredOn: { page: 111, posted: "2026-08-28" },
  format: "standard",
  leader: "OP17-039",
  cards: {
    "OP17-050": 2,
    "OP17-045": 2,
    "OP17-052": 2,
    "OP17-054": 4,
    "OP17-042": 4,
    "OP17-044": 4,
    "OP17-046": 4,
    "OP17-049": 4,
    "OP17-040": 4,
    "OP17-048": 4,
    "OP17-118": 4,
    "OP17-055": 4,
    "OP17-056": 4,
    "OP17-057": 4,
  },
};
