/**
 * Fragments more than one promo prints.
 *
 * The promos are not a set and share no design, so this file is short by
 * nature: what is here are the three shapes that genuinely repeat across
 * cards printed years apart.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text P-0xx` prints it from the local cache).
 */
import {
  SOURCE_BINDING,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";

/**
 * "You may place this Character at the bottom of the owner's deck: <effect>."
 *
 * A cost that spends the body without trashing it, printed on two 1- and
 * 4-cost promos. Bottom of the deck rather than the trash matters in both
 * directions: nothing recurs it, and nothing keyed on a K.O. or on a trash
 * fires.
 */
export const buryCost = (effect: MechanicEffect): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "sequence",
    effects: [
      {
        kind: "move",
        binding: SOURCE_BINDING,
        to: { player: "owner", zone: "deck", position: "bottom" },
      },
      effect,
    ],
  },
});

/**
 * "Look at 5 cards from the top of your deck and place them at the top or
 * bottom of the deck in any order."
 *
 * A pure sort rather than a search -- nothing is added to hand -- printed on
 * two Blue promos. `order-to-bottom` asks the player a card at a time and
 * skips asking while the cards left are all the same card; `alternate` lets
 * the same placement split the five between the top and the bottom, the way
 * EB03-023 Kaya's identical text does.
 */
export const sortFiveDeep = (bind: string): MechanicProgram => ({
  effect: {
    kind: "sequence",
    effects: [
      { kind: "look-at", player: "self", count: 5, bind },
      {
        kind: "select",
        selector: { player: "self", zone: "deck", binding: bind },
        bind: `${bind}-order`,
        count: "all",
        effect: {
          kind: "order-to-bottom",
          binding: `${bind}-order`,
          to: { player: "self", zone: "deck", position: "top" },
          alternate: { player: "self", zone: "deck", position: "bottom" },
        },
      },
    ],
  },
});

/**
 * "Your opponent cannot activate [Blocker] during this turn."
 *
 * Modelled as [Unblockable] on the card that printed it, the reading ST21-003
 * and OP12-077 already take: the engine's only consumer of either phrasing is
 * the Blocker step, and no line of play tells the two apart.
 */
export const silenceBlockers: MechanicEffect = {
  kind: "grant-keyword",
  binding: SOURCE_BINDING,
  keyword: "Unblockable",
  expiresAfterTurns: 0,
};
