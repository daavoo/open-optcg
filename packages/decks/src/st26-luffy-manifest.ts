import type { DeckManifest } from "./index.js";

/**
 * ST-26 "Monkey.D.Luffy", Bandai's Purple/Black starter deck, exactly as sold.
 *
 * Source: Bandai's own card list for the product
 * (https://en.onepiece-cardgame.com/cardlist/?series=569026), which is the 15
 * identities below and nothing else, and the deck's per-slot counts from the
 * structure-deck list in the egman secondary source the audit already reads.
 * Both are in the 2026-08-22 reference snapshot, and every one of the 15 is
 * stamped `sourceMatch: true` -- the ST-26 page carries all of them, reprints
 * included.
 *
 * Unlike ST31-36 this is not part of the format `packages/decks/src/generated.ts`
 * is built from, so it is a hand-authored manifest and its identities come
 * through the audit's community pass. Nothing about the list is a judgement
 * call: it is a precon, and the point of shipping it is to have one deck in the
 * catalog that a player can buy in a shop and recognise slot for slot.
 *
 * ## What the deck does
 *
 * It spends DON!! as a resource rather than as a clock. The Leader, OP09-061,
 * prints two clauses that only make sense together: "[DON!! x1] All of your
 * Characters gain +1 cost", which is pure downside, and "[Your Turn] [Once Per
 * Turn] When 2 or more DON!! cards on your field are returned to your DON!!
 * deck, add up to 1 DON!! card from your DON!! deck and set it as active, and
 * add up to 1 additional DON!! card and rest it." Ten of the fifty main-deck
 * cards pay a `DON!! −2` or a "return 1 or more DON!!" cost, so the refund is
 * available almost every turn from turn four on, and the deck's real curve is
 * the printed one minus what the Leader hands back.
 *
 * That is why the two vanillas are in the list. OP05-065 San-Gorou (6/8000) and
 * ST14-010 Brook (5/7000) do nothing on their own, and San-Gorou is what
 * switches on ST26-001 Soba Mask's "give this card in your hand −5 cost" -- a
 * 7-cost 9000 for 2, whose own [On Play] then returns San-Gorou to hand to be
 * replayed. The deck's biggest turns are that loop plus the Leader's refund.
 *
 * ST26-005 Monkey.D.Luffy is the defensive half: its Leader is multicoloured,
 * so on any turn the opponent has five or more DON!! it sets the Leader's base
 * power to 7000 until the end of their next End Phase, from the board or off an
 * attack. OP05-066 Jinbe's +1000 needs all ten DON!! on the field, which for
 * this deck is late but reachable -- the returns feed the DON!! deck back.
 *
 * ## What it is not
 *
 * It is a precon, not a tuned list, and it is here as a shipped deck rather
 * than as a benchmark target: expect it to sit near the bottom of the
 * starter decks' win rates. What deck knowledge it has is in
 * `st26-luffy-policy.ts`: an opening-hand rule, and the one in-game rule the
 * deck cannot do without -- how many DON!! a "return 1 or more" clause sends
 * back, and whether the Leader's refund is still there to answer it.
 * Everything else falls to the generic rules ladder, and the Counter phase in
 * particular is still wholly unpiloted: `pnpm census` reads 4.89 decisions a
 * game there at 100.0% no rule.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other community manifests do: `deck-provenance.ts` reads the card
 * list and `index.ts` re-exports from `deck-provenance.ts`, so the reverse
 * import would be a cycle.
 */
export const st26LuffyManifest: DeckManifest = {
  id: "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
  leader: "OP09-061",
  cards: {
    "OP05-065": 4,
    "OP05-066": 4,
    "OP05-070": 4,
    "OP09-063": 4,
    "OP09-070": 4,
    "OP09-076": 4,
    "OP09-077": 4,
    "OP09-078": 2,
    "ST14-010": 4,
    "ST26-001": 4,
    "ST26-002": 4,
    "ST26-003": 2,
    "ST26-004": 4,
    "ST26-005": 2,
  },
};
