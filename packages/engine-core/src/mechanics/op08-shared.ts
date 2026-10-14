/**
 * OP08 program fragments more than one of its cards prints.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP08-0xx` prints it from the local cache).
 */
import { donMinus } from "./shared.js";
import {
  type CardSelector,
  type MechanicCondition,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";

/**
 * "Up to N of your opponent's rested Characters with a cost of C or less will
 * not become active in your opponent's next Refresh Phase."
 *
 * The Green Minks package prints it on five cards and OP08-036's Event prints
 * the "all of" reading; they differ only in the ceiling and the count. The
 * target must *already* be rested -- `rested: true`, not the `canRest` a
 * "rest up to 1" clause filters on -- because the clause rests nothing itself:
 * it holds down a body the deck's own attacks already turned over.
 * `cannot-refresh` at `expiresAfterTurns: 1` is how the pool writes "will not
 * become active in your opponent's next Refresh Phase".
 */
export const restLock = (
  maxCost: number,
  bind: string,
  max = 1,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    rested: true,
    maxCost,
  },
  bind,
  min: 0,
  max,
  effect: {
    kind: "restrict",
    binding: bind,
    restriction: "cannot-refresh",
    expiresAfterTurns: 1,
  },
});

/** "Add up to 1 DON!! card from your DON!! deck and rest it." */
export const rampRested: MechanicEffect = {
  kind: "add-don",
  player: "self",
  count: 1,
  rested: true,
};

/** "Add up to 1 DON!! card from your DON!! deck and set it as active." */
export const rampActive: MechanicEffect = {
  kind: "add-don",
  player: "self",
  count: 1,
  rested: false,
};

/**
 * "If your Leader's type includes 'Whitebeard Pirates'" -- the Blue package's
 * gate, printed as a substring rather than as an exact type so that
 * {Former Whitebeard Pirates} satisfies it too.
 */
export const whitebeardLeader: MechanicCondition = {
  kind: "leader-type-including",
  player: "self",
  text: "Whitebeard Pirates",
};

/**
 * "You may reveal 2 cards with a type including 'Whitebeard Pirates' from your
 * hand: <effect>."
 *
 * The cards are revealed, not spent, so this is a `choose` that shows them and
 * leaves them in hand. The payoff is nested *inside* the choose for the reason
 * `payFromHand` gives: a `choose` whose zone cannot fill its `min` is skipped
 * and the queue continues, so sequencing the two would hand the payoff to a
 * player who cannot pay.
 */
export const revealTwoWhitebeard = (
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "hand",
      typeIncluding: "Whitebeard Pirates",
    },
    bind,
    min: 2,
    max: 2,
    effect: {
      kind: "sequence",
      effects: [{ kind: "reveal", binding: bind }, effect],
    },
  },
});

/** "K.O. up to 1 of your opponent's Characters with a cost of C or less." */
export const koCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});

/** "Give up to 1 of your opponent's Characters −N cost during this turn." */
export const costDebuff = (amount: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-cost",
    binding: bind,
    amount: -amount,
    expiresAfterTurns: 0,
  },
});

/** "Give up to 1 of your opponent's Characters −N power during this turn." */
export const powerDebuff = (amount: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount: -amount,
    expiresAfterTurns: 0,
  },
});

/**
 * "Play up to 1 <selector> from your hand" -- the Big Mom package's recursion
 * out of hand, printed on the two officers that trade themselves for a bigger
 * body.
 */
export const playFromHand = (
  selector: Omit<CardSelector, "player" | "zone">,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: { ...selector, player: "self", zone: "hand" },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "play", binding: bind },
});

/**
 * "Add up to 1 card from the top of your deck to the top of your Life cards."
 *
 * "Up to", so the whole thing is declinable -- which matters on a full Life
 * total, where the card is better left on the deck.
 */
export const deckTopToLife = (bind: string): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "select",
    selector: { player: "self", zone: "deck", position: "top" },
    bind,
    count: 1,
    effect: {
      kind: "move",
      binding: bind,
      to: { player: "self", zone: "life", position: "top" },
    },
  },
});

/**
 * OP08-007 Tony Tony.Chopper's dig, printed on `[On Play]` and
 * `[When Attacking]` alike: one program, registered from both tables.
 *
 * `[Your Turn]` is not free even on the `[On Play]` half -- a Character can
 * reach the board on the other player's turn through a Counter or a Trigger,
 * and this clause does nothing there. The body it finds arrives rested, and
 * the power ceiling is printed power because the card is still in the deck.
 */
export const chopperDig: MechanicProgram = {
  effect: {
    kind: "if",
    condition: { kind: "turn-player", player: "self" },
    then: {
      kind: "sequence",
      effects: [
        { kind: "look-at", player: "self", count: 5, bind: "op08-chopper-dig" },
        {
          kind: "choose",
          selector: {
            player: "self",
            zone: "deck",
            binding: "op08-chopper-dig",
            category: "character",
            type: "Animal",
            maxPower: 4_000,
          },
          bind: "op08-chopper-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op08-chopper-play", rested: true },
        },
        {
          kind: "select",
          selector: {
            player: "self",
            zone: "deck",
            binding: "op08-chopper-dig",
          },
          bind: "op08-chopper-rest",
          count: "all",
          effect: {
            kind: "order-to-bottom",
            binding: "op08-chopper-rest",
            to: { player: "self", zone: "deck", position: "bottom" },
          },
        },
      ],
    },
  },
};

/**
 * "Up to 1 of your opponent's Characters with a cost of 6 or less other than
 * [Monkey.D.Luffy] cannot attack until the end of your opponent's next turn."
 *
 * OP08-112 S-Snake prints it on its `[On Play]`; its `[Trigger]` re-runs the
 * same clause, so both tables register this one program.
 */
export const snakeAttackLock: MechanicProgram = {
  effect: {
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      maxCost: 6,
      excludeName: "Monkey.D.Luffy",
    },
    bind: "op08-snake-lock",
    min: 0,
    max: 1,
    effect: {
      kind: "restrict",
      binding: "op08-snake-lock",
      restriction: "cannot-attack",
      expiresAfterTurns: 1,
    },
  },
};

/** `DON!! −1: <effect>`, the Purple package's price on eleven clauses. */
export const donMinusOne = (effect: MechanicEffect): MechanicEffect =>
  donMinus(1, effect);
