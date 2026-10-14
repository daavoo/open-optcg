/**
 * The "when X happens" clauses ST-10 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import type { ReactionRule } from "../reaction-rules.js";
import { drawOneTrashOne } from "./reaction-shared.js";

export const st10ReactionRules: readonly ReactionRule[] = [
  {
    cardNumber: "ST10-006",
    controller: "board",
    signal: { kind: "blocker-activated", activatedBy: "opponent" },
    ownTurn: false,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxCurrentPower: 8_000,
        },
        bind: "st10-luffy-ko",
        min: 0,
        max: 1,
        effect: { kind: "knock-out", binding: "st10-luffy-ko" },
      },
    },
  },
  {
    // ST10-007 Killer: on its controller's turn, once, a DON!! going back to
    // the DON!! deck K.O.s a rested Character of cost 3 or less.
    //
    // The same `don-returned` signal OP11-077 Randolph and EB04-035 Hitokiri
    // Kamazo watch, and for the same reason it has no printed marker. In this
    // product the thing that pays it is the deck's own `DON!! −N` costs, which
    // three of its Characters and both its Leaders print.
    //
    // `rested: true` rather than `canRest`: the clause reaches a body that is
    // already turned over, which after the deck has attacked is most of the
    // opposing board. It rests nothing itself.
    cardNumber: "ST10-007",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          rested: true,
          maxCost: 3,
        },
        bind: "st10-killer-ko",
        min: 0,
        max: 1,
        effect: { kind: "knock-out", binding: "st10-killer-ko" },
      },
    },
  },
  {
    // ST10-011 Heat: the same DON!!-returned watcher, paying the source itself
    // +2000 that survives the opponent's turn.
    //
    // `expiresAfterTurns: 1` is what "until the start of your next turn" means
    // in player-turns, and it is the whole card: a 3-cost 4000 that defends at
    // 6000 on the turn after its controller spent DON!!.
    cardNumber: "ST10-011",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "modify-power",
        binding: SOURCE_BINDING,
        amount: 2_000,
        expiresAfterTurns: 1,
      },
    },
  },
  {
    // ST10-014 Wire: the same watcher again, cycling a card.
    //
    // No turn gate, unlike the two above it: this one prints no `[Your Turn]`,
    // so a DON!! returned to pay for a Counter Event on the opponent's turn
    // cycles too -- which is what makes a 3-cost [Blocker] worth the slot.
    // Its [Blocker] is an unconditional printed keyword and needs no entry.
    cardNumber: "ST10-014",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: false,
    oncePerTurn: true,
    program: { effect: drawOneTrashOne },
  },
];
