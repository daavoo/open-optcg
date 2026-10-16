/**
 * OP10's K.O. replacements: "If <this Character> would be K.O.'d, you may <pay>
 * instead."
 *
 * Three cards, and each one reads the clause differently -- which is why they
 * are worth reading together. OP10-034 Franky names *battle* and nothing else,
 * OP10-074 Pica names the opponent's effects, and OP10-118 Monkey.D.Luffy names
 * no cost at all and pays with its once-per-turn budget.
 */
import { type SetMechanics } from "./registry.js";

export const op10ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP10-034 Franky: "[printed text omitted -- pnpm card:text OP10-034]"
      //
      // `battleOnly` is the exact complement of every other entry in this
      // registry: losing a fight is not an effect, so a clause that names battle
      // must not answer a removal Event -- and `opponentEffectOnly` would exclude
      // the one case this covers. The Life card is not lost: it joins the hand,
      // which is what the damage it saves would have done anyway.
      "OP10-034",
      {
        opponentEffectOnly: false,
        battleOnly: true,
        oncePerTurn: true,
        label: "Add the top card of your Life cards to your hand",
        cost: { kind: "life-to-hand", count: 1 },
      },
    ],
    [
      // OP10-074 Pica: "[printed text omitted -- pnpm card:text OP10-074]"
      //
      // Paid out of the cost area, which no other replacement in the pool
      // touches: DON!! sits in no `CardZone`, so `rest-own-cards` cannot reach
      // it. Active DON!! only -- resting a rested DON!! is not a payment -- and
      // the DON!! comes back next Refresh, which makes this the cheapest
      // protection in the set on any turn its controller has spent nothing.
      "OP10-074",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        label: "Rest 2 of your DON!! cards",
        cost: { kind: "rest-don", count: 2 },
      },
    ],
    [
      // OP10-118 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP10-118]"
      //
      // Not a "you may pay: instead" at all -- the prevention is outright, and
      // the once-per-turn budget is the whole price. It is a replacement rather
      // than an entry in `isRemovalImmune` because that budget has to be *spent*:
      // a continuous immunity would answer every removal in the turn, and this
      // answers one. `cost: { kind: "none" }` is what says so.
      "OP10-118",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        label: "Prevent the K.O.",
        cost: { kind: "none" },
        mandatory: true,
      },
    ],
    [
      // OP10-049 Sabo: "[printed text omitted -- pnpm card:text OP10-049]"
      //
      // "Removed from the field by your opponent's effect", so `off-field`
      // with `opponentEffectOnly`: a bounce or a bury is answered as well as a
      // K.O., and a lost fight is not. "Base cost" is the printed one, which
      // matters behind the OP10-042 Usopp Leader: its +1 lifts a 7-cost Kyros
      // or Rebecca to 8, and the save must still reach them. `excludeName`
      // is the printed "other than [Sabo]" -- no copy saves another, or
      // itself.
      "OP10-049",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: {
          category: "character",
          maxBaseCost: 7,
          excludeName: "Sabo",
        },
        label: "Return Sabo to the owner's hand",
        cost: { kind: "return-self-to-hand" },
      },
    ],
  ],
};
