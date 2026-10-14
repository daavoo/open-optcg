/**
 * OP14's K.O. replacements: "if <a Character> would be K.O.'d, you may <pay>
 * instead."
 *
 * Four of them, and between them they use every cost shape the registry knows
 * that is not a hand trash -- which is why the set is what added three of those
 * shapes. OP14-061 Vergo is the fifth and is deliberately not here: it predates
 * the registry and lives as a hand-written pair of branches in `removal.ts` and
 * `resolve-effect/removal.ts`, in a deck whose replay hashes rewriting it would
 * move.
 *
 * Two of these read "removed from the field" rather than "K.O.'d", which also
 * covers a bounce or a deck-bottom. Like OP15-052 Leo and OP14-061 before them
 * they only see the K.O. path, because `knockOut` is still the only removal
 * with a replacement hook. What would let that widen is a replacement offer on
 * the `move` node for a card leaving `board`.
 */
import { type SetMechanics } from "./registry.js";

export const op14ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP14-016 X.Drake: "[printed text omitted -- pnpm card:text OP14-016]"
      //
      // The cheapest protection in the set and the only one that spends no
      // card, which is what the `[Once Per Turn]` and the `[Opponent's Turn]`
      // together are paying for: on your own turn, and after the first save,
      // your Supernovas are as removable as anyone's.
      "OP14-016",
      {
        opponentEffectOnly: true,
        opponentTurnOnly: true,
        oncePerTurn: true,
        protects: { category: "character", type: "Supernovas" },
        label: "Give your Leader −2000 power",
        cost: { kind: "leader-power-penalty", amount: -2000 },
      },
    ],
    [
      // OP14-029 Tashigi: "[printed text omitted -- pnpm card:text OP14-029]"
      //
      // No `protects`, so it guards only its own printing -- "if *this*
      // Character". No `[Once Per Turn]` either: Tashigi survives as many
      // removals in a turn as its controller has active cards to rest, which is
      // what makes the 5-cost body a wall rather than a one-shot.
      "OP14-029",
      {
        opponentEffectOnly: true,
        opponentTurnOnly: true,
        oncePerTurn: false,
        label: "Rest 1 of your cards",
        cost: { kind: "rest-own-cards", count: 1 },
      },
    ],
    [
      // OP14-034 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP14-034]"
      //
      // "Your Characters", not "your cards", so the Leader cannot pay -- which
      // is the difference from OP14-029 above and the reason `match` is set.
      // No `[Opponent's Turn]`, so this also answers removal on its own turn.
      // Luffy's other clause, the green Straw Hat aura, is a static layer.
      "OP14-034",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        protects: { category: "character", type: "Straw Hat Crew" },
        label: "Rest 1 of your Characters",
        cost: {
          kind: "rest-own-cards",
          count: 1,
          match: { category: "character" },
        },
      },
    ],
    [
      // OP14-092 Mr.3(Galdino): "[printed text omitted -- pnpm card:text OP14-092]"
      //
      // The only replacement in the pool with no "by your opponent's effect"
      // clause, so `opponentEffectOnly` is false: battle destruction is answered
      // too, which is what makes a 4-cost 6000 body with no Counter worth
      // attacking into. Black fills its own trash fast enough that the cost is
      // usually free, and paying it un-fills it, which its own trash-count
      // payoffs (OP14-086, OP14-096) then feel.
      "OP14-092",
      {
        opponentEffectOnly: false,
        opponentTurnOnly: true,
        oncePerTurn: true,
        label: "Place 3 cards from your trash at the bottom of your deck",
        cost: { kind: "bury-from-trash", count: 3 },
      },
    ],
  ],
};
