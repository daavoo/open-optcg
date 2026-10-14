/**
 * ST-14 program fragments more than one of its cards prints.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST14-0xx` prints it from the local cache).
 */
import {
  type CardSelector,
  type MechanicCondition,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";

/**
 * "If you have a Character with a cost of N or more" -- the gate the whole
 * product is built on, printed at 6, 8 and 10 on nine of its cards.
 *
 * `minCost` is the *effective* cost, which is the reading that makes the deck
 * work: its Leader, its Stage and three of its Characters raise their own
 * board's costs, and those buffs are what carry a 5-cost body over an 8-cost
 * line. Read of the controller's own board alone, because that is what "you
 * have" says.
 */
export const ownBodyAtCost = (minimum: number): MechanicCondition => ({
  kind: "selector-count",
  player: "self",
  selector: { zone: "board", category: "character", minCost: minimum },
  operator: "gte",
  value: 1,
});

/**
 * "Up to 1 of your black {Straw Hat Crew} type Characters" -- the target three
 * of the product's cost buffs share.
 */
export const blackStrawHat: CardSelector = {
  player: "self",
  zone: "board",
  category: "character",
  color: "Black",
  type: "Straw Hat Crew",
};

/**
 * "Up to 1 of your black {Straw Hat Crew} type Characters gains +2 cost until
 * the end of your opponent's next turn."
 *
 * `expiresAfterTurns: 1` is what that duration means in player-turns: the buff
 * has to survive the opponent's whole turn, which is when the removal it is
 * protection against would be pointed at the body. It is also the deck's own
 * engine -- every payoff here reads a cost line, so +2 is offence as much as
 * defence.
 */
export const raiseStrawHatCost = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: blackStrawHat,
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-cost",
    binding: bind,
    amount: 2,
    expiresAfterTurns: 1,
  },
});

/**
 * ST14-007 Nico Robin: behind the 8-cost gate, an opposing Character loses 5
 * cost for the turn.
 *
 * Cost rather than power, so the card removes nothing by itself -- it drops a
 * body into the reach of the "cost N or less" K.O.s the rest of the product
 * prints. Printed on the `[On Play]` and the `[When Attacking]` alike, so it
 * is one program registered from both tables.
 */
export const robinCostDrop: MechanicProgram = {
  effect: {
    kind: "if",
    condition: ownBodyAtCost(8),
    then: {
      kind: "choose",
      selector: { player: "opponent", zone: "board", category: "character" },
      bind: "st14-robin-drop",
      min: 0,
      max: 1,
      effect: {
        kind: "modify-cost",
        binding: "st14-robin-drop",
        amount: -5,
        expiresAfterTurns: 0,
      },
    },
  },
};
