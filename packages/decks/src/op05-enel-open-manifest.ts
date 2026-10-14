import type { DeckManifest } from "./index.js";

/**
 * OP-05 Yellow Enel, a list built for the OP-17 field.
 *
 * Source: supplied as a card list by the project maintainer on 28 Sep 2026,
 * without an event or pilot, which is why it ships as "- Open OPTCG" rather
 * than under a placing. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * ## What the deck does
 *
 * The Leader's one clause is a reprieve: once per opponent's turn, when the
 * seat's Life reaches 0, the top of the deck becomes a Life card again and a
 * hand card pays for it. The deck treats Life as a resource around that
 * floor. EB01-056 Charlotte Flampe and OP11-106 Zeus take a Life card into
 * hand for a draw or a K.O., EB01-059 Kingdom Come trashes Life down to 1 for
 * an unconditional K.O., and OP15-113 Zoro, EB04-058 Borsalino, OP16-119
 * Teach, OP17-106 Smoothie, OP17-114 Sweet 3 Generals and OP17-112 Linlin put
 * cards from the deck back on top of it.
 *
 * What goes back on top is mostly OP-17 Big Mom Pirates with a
 * "[Trigger] Play this card", so a Life card the opponent takes is often a
 * Character, and OP17-112 turns every one of those 4000 bodies into an 8000 on
 * its controller's turn. OP06-115 is the Counter that also refills a Life at
 * 0, and OP06-117 The Ark Maxim rests beside the Leader to clear every 2-cost
 * or less on the other board.
 *
 * Lives in its own module for the same reason the other community manifests
 * do: `deck-provenance.ts` reads the card list and `index.ts` re-exports from
 * it, so inlining the list would be a cycle.
 */
export const op05EnelOpenManifest: DeckManifest = {
  id: "(Yellow) Enel - Open OPTCG",
  format: "standard",
  leader: "OP05-098",
  cards: {
    "EB01-056": 2,
    "OP11-106": 4,
    "OP17-107": 4,
    "OP17-109": 4,
    "OP15-113": 4,
    "OP17-102": 4,
    "EB04-058": 4,
    "OP17-106": 3,
    "OP17-114": 3,
    "OP16-119": 4,
    "OP17-112": 4,
    "OP06-115": 4,
    "EB01-059": 4,
    "OP06-117": 2,
  },
};
