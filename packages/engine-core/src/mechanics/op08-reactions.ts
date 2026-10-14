/**
 * The "when X happens" clauses OP-08 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import type { ReactionRule } from "../reaction-rules.js";
import { bonneyDrawTwoTrashOne } from "./reaction-shared.js";

export const op08ReactionRules: readonly ReactionRule[] = [
  {
    // OP08-046 Shakuyaku: "[printed text omitted -- pnpm card:text OP08-046]"
    //
    // "By your effect", which is what `bySource` answers -- on the controller's
    // own turn a Character can also leave the board to the other player's
    // Counter, and a battle K.O. raises no move signal at all, so the two
    // readings the gate has to keep out are covered from different directions.
    //
    // The self-rest is the price and is inside the program, so a Shakuyaku that
    // has already rested still pays it and gets nothing back.
    cardNumber: "OP08-046",
    controller: "board",
    signal: { kind: "card-moved", from: "board", bySource: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "if",
        condition: {
          kind: "zone-count",
          player: "opponent",
          zone: "hand",
          operator: "gte",
          value: 5,
        },
        then: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              chooser: "opponent",
              selector: { player: "opponent", zone: "hand" },
              bind: "op08-shakuyaku-bury",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op08-shakuyaku-bury",
                to: { player: "owner", zone: "deck", position: "bottom" },
              },
            },
            { kind: "rest", binding: SOURCE_BINDING },
          ],
        },
      },
    },
  },
  {
    // OP08-056 Moby Dick: "[printed text omitted -- pnpm card:text OP08-056]"
    //
    // A Stage, so `controller: "stage"`. "By an effect" needs no side filter:
    // a battle K.O. splices the board without raising a move signal, so the
    // only thing that reaches this rule is an effect -- either player's, which
    // is what the printed clause says.
    cardNumber: "OP08-056",
    controller: "stage",
    signal: {
      kind: "card-moved",
      from: "board",
      movedTypeIncluding: "Whitebeard Pirates",
      movedOwner: "self",
    },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "sequence",
        effects: [
          { kind: "draw", player: "self", count: 1 },
          {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "op08-moby-back",
            min: 1,
            max: 1,
            effect: {
              kind: "order-to-bottom",
              binding: "op08-moby-back",
              to: { player: "self", zone: "deck", position: "top" },
              alternate: { player: "self", zone: "deck", position: "bottom" },
            },
          },
        ],
      },
    },
  },
  {
    // OP08-067 Charlotte Pudding: "[printed text omitted -- pnpm card:text OP08-067]"
    //
    // The refund that makes the Purple package's `DON!! -N` costs affordable:
    // every payment this deck makes hands one card straight back, rested.
    cardNumber: "OP08-067",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: { kind: "add-don", player: "self", count: 1, rested: true },
    },
  },
  {
    // OP08-105 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP08-105]"
    //
    // A card leaving the opponent's Life is what an attack that connects does,
    // so this is the Yellow deck's reward for pushing damage through on its own
    // turn. `sourceAttachedDon` is the printed `[DON!! x1]`, read on the copy
    // that would react rather than on the player.
    cardNumber: "OP08-105",
    controller: "board",
    signal: { kind: "card-moved", from: "life", movedOwner: "opponent" },
    ownTurn: true,
    oncePerTurn: true,
    sourceAttachedDon: 1,
    program: { effect: bonneyDrawTwoTrashOne },
  },
];
