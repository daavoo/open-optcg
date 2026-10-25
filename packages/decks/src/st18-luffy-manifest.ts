import type { DeckManifest } from "./index.js";

/**
 * ST-18 "Monkey.D.Luffy", Bandai's Purple Land of Wano starter deck, exactly
 * as sold.
 *
 * Source: Bandai's own card list for the product
 * (https://en.onepiece-cardgame.com/cardlist/?series=569018), which is the 15
 * identities below and nothing else, and the deck's per-slot counts from the
 * structure-deck list in the egman secondary source the audit already reads.
 * Both are in the 2026-08-22 reference snapshot. The five ST18 prints and the
 * P-041 promo come through the audit's community pass; the Leader and the
 * eight OP-05 slots are stamped by the OP-05 set pass, so every one of the 15
 * is `sourceMatch: true`.
 *
 * The Leader is a *reprint*, OP05-060, which is why the product numbers only
 * five exclusives where ST-26 numbers five plus its own Leader. Like ST-26 it
 * is not part of the format `packages/decks/src/generated.ts` is built from,
 * so this is a hand-authored manifest. No slot in it is a judgement call: it
 * is a precon, and the point of shipping it is to have a deck in the catalog a
 * player can buy in a shop and recognise slot for slot.
 *
 * ## What the deck does
 *
 * It is built around one number. Nine of the fifteen identities read "if you
 * have 8 or more DON!! cards on your field", and below that line most of them
 * are vanilla: O-Robi is a 4-cost 5000 that K.O.s nothing, Hone-Kichi a 4-cost
 * 6000 that debuffs nothing, Fra-Nosuke a 5-cost 4000 with no [Rush]. A
 * ten-DON!! field is turn eight on the natural curve, and the deck does not
 * want to wait that long.
 *
 * OP05-060 is how it does not have to. "[Activate: Main] [Once Per Turn] You
 * may add 1 card from the top of your Life cards to your hand: If you have 0
 * or 3 or more DON!! cards on your field, add up to 1 DON!! card from your
 * DON!! deck and set it as active" pays a Life card for a DON!! that is active
 * *now*, every turn from turn two. Taken every turn it reaches eight DON!! two
 * turns early and hands the extra Life cards to a deck whose Counters are
 * OP05-061 and OP05-070 at 2000. The cost is the deck's own clock: it is
 * spending the Life it will later have to defend.
 *
 * ST18-005 Luffy-Tarou is the one card that argues with the plan. Its `DON!!
 * −1` free play is the deck's only way to put two bodies down in a turn, and
 * paying it is what drops the field below eight -- so the turn it is cast is
 * usually a turn nothing else fires.
 *
 * ## What it is not
 *
 * A precon, not a tuned list, and here as a shipped deck rather than as a
 * benchmark target: expect it to sit near the bottom of the
 * starter decks' win rates. What deck knowledge it has is in
 * `st18-luffy-policy.ts`, and both of its in-game rules are about the Leader's
 * activation: take it before the turn's plays, and stop taking it at the
 * bottom of the Life stack. Everything else falls to the generic rules ladder,
 * the Counter phase in particular: `pnpm census` reads 6.55 decisions a game
 * there at 100.0% no rule.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other community manifests do: `deck-provenance.ts` reads the card
 * list and `index.ts` re-exports from `deck-provenance.ts`, so the reverse
 * import would be a cycle.
 */
export const st18LuffyManifest: DeckManifest = {
  id: "(Purple) Monkey.D.Luffy - Starter Deck 18",
  leader: "OP05-060",
  cards: {
    "OP05-061": 4,
    "OP05-063": 4,
    "OP05-066": 4,
    "OP05-067": 4,
    "OP05-068": 4,
    "OP05-070": 4,
    "OP05-072": 4,
    "OP05-076": 4,
    "P-041": 4,
    "ST18-001": 2,
    "ST18-002": 4,
    "ST18-003": 4,
    "ST18-004": 2,
    "ST18-005": 2,
  },
};
