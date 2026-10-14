import type { DeckManifest } from "./index.js";

/**
 * OP-16 Purple Enel, transcribed from top-placing tournament lists.
 *
 * Sources: two 1st-place OP-16 lists under this Leader, retrieved 15 Aug 2026 --
 * https://gumgum.gg/one-piece/decklists/deck/east/op16/8f5df5d8-9eb6-4497-9f8e-1a0a7cbc5c93
 * (Standard Battle) and
 * https://gumgum.gg/one-piece/decklists/deck/east/op16/48825c89-39af-4c09-8038-e7fc11e2f5dc
 * (Extra Grand Battle, 5-0). They are the same 49 cards and differ only in one
 * slot: OP07-064 Sanji in the first, OP10-067 Senor Pink in the second. This
 * list takes the second. Card text for every identity is stamped from Bandai's
 * own cardlist pages by `pnpm reference:audit`'s community-deck pass.
 *
 * This replaces a list built from the shonentcg.com guide's published *core*,
 * which the guide itself called a core rather than a 50 -- it points readers at
 * limitlesstcg for exact lists. Where the guide's core and the tournament lists
 * agree, nothing moved: 4 El Thor, 4 Lightning Beast Kiten, 4 Lightning Dragon,
 * 4 Mamaragan, 4 Varie, 3 Gamma Knife, 4 Vinsmoke Reiju, 4 OP15-118 and the Ohm
 * and Shura vassals. Four changes come from the tournament lists:
 *
 * - 4 OP12-071 Charlotte Pudding. A 1-cost body that digs 4 for a [Sanji] *or
 *   an Event*, which in a list running twenty Events is the consistency engine
 *   the guide's core left out.
 * - 4 OP09-072 Franky. A 4-cost 5000 [Blocker] whose [On Play] converts DON!!
 *   and a dead card into two live ones. Added to the card pool for this list.
 * - Satori to 2 and Gedatsu to 0. The tournament lists spend the vassal slots
 *   the guide called flex on Pudding and Franky instead.
 * - OP15-060 to 0 and Senor Pink to 1. Both lists run a single 6-drop identity,
 *   OP15-118, and neither runs OP15-060 at all -- which is what the previous
 *   list's own comment recorded the transcribed lists doing, before splitting
 *   the difference at 4 and 2 anyway.
 *
 * Borsalino (OP16-073) stays out, as before and for the same reason: the guide
 * calls it a supplementary DON!! source, but it costs 7 and this Leader's DON!!
 * deck is 6 cards, so the field can never hold the DON!! to pay for it.
 * `test/op16-enel.test.ts` pins both halves of that -- the 6 DON!! ceiling and
 * Borsalino's absence from the legal plays at that ceiling. The card is
 * implemented and in the registry, so a Purple deck without the six-card rule
 * can still run it.
 *
 * Every identity in both lists is now in the pool -- OP09-072 was added for
 * this transcription, and OP07-064, the other list's flex slot, was already
 * there -- so either list can be built without substitution. See
 * `deckStrategyDossier("(Purple) Enel - Official Feature Deck")`, whose `commonVariants` carries the
 * divergences to the LLM seat.
 *
 * Lives in its own module, rather than inline in `index.ts`, so that
 * `deck-provenance.ts` can read the card list without importing `index.ts` --
 * `index.ts` re-exports from `deck-provenance.ts`, and the reverse import
 * would be a cycle.
 */
export const op16EnelManifest: DeckManifest = {
  id: "(Purple) Enel - Official Feature Deck",
  format: "standard",
  leader: "OP15-058",
  cards: {
    "OP12-071": 4,
    "OP15-061": 4,
    "OP15-066": 2,
    "OP15-067": 4,
    "OP09-072": 4,
    "OP12-063": 4,
    "OP10-067": 1,
    "OP15-118": 4,
    "OP15-074": 4,
    "OP15-075": 4,
    "OP15-076": 4,
    "OP15-077": 4,
    "OP15-078": 4,
    "OP05-077": 3,
  },
};
