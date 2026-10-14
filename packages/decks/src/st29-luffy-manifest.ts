import type { DeckManifest } from "./index.js";

/**
 * ST-29 "Monkey.D.Luffy", Bandai's Yellow Egghead starter deck, exactly as sold.
 *
 * Source: Bandai's own card list for the product
 * (https://en.onepiece-cardgame.com/cardlist/?series=569029), which is the 17
 * identities below and nothing else, and the deck's per-slot counts from the
 * structure-deck list in the egman secondary source the audit already reads.
 * Both are in the 2026-08-22 reference snapshot, and every one of the 17 is
 * stamped `sourceMatch: true`.
 *
 * Unlike ST31-36 this is not part of the format `packages/decks/src/generated.ts`
 * is built from, so it is a hand-authored manifest. Nothing about the list is a
 * judgement call: it is a precon, and every slot in it is printed on the
 * product. Unusually for a starter, the whole list is its own set -- no reprint
 * from a booster, no identity shared with another shipped deck except ST29-010
 * Franky, a vanilla.
 *
 * ## What the deck does
 *
 * It is Yellow, so it is built to be behind. Nine of the seventeen identities
 * read the Life counter, and every one of them wants that number to be *low*:
 * the Leader draws only at 2 or less Life, ST29-003 Kaku is +1000 while its
 * controller's Life is at or below the opponent's, ST29-015 Raw Heat Strike
 * adds a −2000 debuff at 1 or less Life and ST29-017 Iai Death Lion Song adds a
 * 3-cost K.O. at 2 or less. A deck that is winning on Life is playing a worse
 * version of itself, which is the thing about the archetype a cost-and-power
 * ladder cannot infer.
 *
 * The [Trigger] half is the other axis, and it is why the list runs four
 * Life-shaped payoffs rather than card draw. Four identities -- ST29-005 Jinbe,
 * ST29-008 Nami, ST29-009 Nico Robin and ST29-012 Monkey.D.Luffy -- print
 * "play this card" off a [Trigger], so Life taken is not only a clock against
 * this deck but its way of deploying a body for nothing. ST29-007 Tony
 * Tony.Chopper is the piece that makes that a plan rather than a hope: its
 * [On K.O.] trades a Life card for a card from hand placed back on top of Life,
 * which both refills the [Trigger] deck and buys a turn.
 *
 * ST29-014 Roronoa Zoro is the payoff the deck builds toward -- a 6-cost 8000
 * [Rush: Character] whose [Activate: Main] turns a spare [Trigger] card into a
 * draw plus a rested DON!! on any body -- and ST29-012's own [Activate: Main]
 * is the cheap version of the same DON!!-gift.
 *
 * ## What it is not
 *
 * A tuned list. It is a precon, and it is here as a shipped deck rather than as
 * a benchmark target: expect it near the bottom of
 * `docs/rules-map/deck-standings-starter.csv`, beside ST-26 and ST-27.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason every other hand-authored manifest does: `deck-provenance.ts` reads
 * the card list and `index.ts` re-exports from `deck-provenance.ts`, so the
 * reverse import would be a cycle.
 */
export const st29LuffyManifest: DeckManifest = {
  id: "(Yellow) Monkey.D.Luffy - Starter Deck 29",
  leader: "ST29-001",
  cards: {
    "ST29-002": 4,
    "ST29-003": 4,
    "ST29-004": 2,
    "ST29-005": 2,
    "ST29-006": 4,
    "ST29-007": 2,
    "ST29-008": 2,
    "ST29-009": 2,
    "ST29-010": 4,
    "ST29-011": 4,
    "ST29-012": 4,
    "ST29-013": 4,
    "ST29-014": 2,
    "ST29-015": 4,
    "ST29-016": 2,
    "ST29-017": 4,
  },
};
