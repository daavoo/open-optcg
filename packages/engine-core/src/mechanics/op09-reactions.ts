/**
 * The "when X happens" clauses OP-09 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import type { ReactionRule } from "../reaction-rules.js";

export const op09ReactionRules: readonly ReactionRule[] = [
  {
    // OP09-061 Monkey.D.Luffy (Leader): pays a ramp refund for a *large* DON!!
    // payment -- two or more at once, which is why the signal carries a count.
    // One DON!! comes back active and pays for the turn, the second comes back
    // rested and pays for the next one. Its `[DON!! x1]` +1 cost aura is a
    // static layer.
    cardNumber: "OP09-061",
    controller: "leader",
    signal: { kind: "don-returned", returnedBy: "self", minCount: 2 },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "sequence",
        effects: [
          { kind: "add-don", player: "self", count: 1, rested: false },
          { kind: "add-don", player: "self", count: 1, rested: true },
        ],
      },
    },
  },
  {
    // OP09-074 Bepo: the same trigger one step smaller -- any DON!! returned
    // buys 1000 power somewhere, which is what makes Purple's costs free on the
    // turn it attacks.
    cardNumber: "OP09-074",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "choose",
        selector: { player: "self", zone: "board", includeLeader: true },
        bind: "op09-bepo-buff",
        min: 0,
        max: 1,
        effect: {
          kind: "modify-power",
          binding: "op09-bepo-buff",
          amount: 1_000,
          expiresAfterTurns: 0,
        },
      },
    },
  },
  {
    // OP09-080 Thousand Sunny: a Stage that turns the opponent's removal into
    // DON!!. Resting it is the cost, so the whole clause is skipped while it is
    // already rested -- a `selector-count` over the Stage zone is how a program
    // asks about its own source's state, since no condition reads it directly.
    //
    // The signal cannot say *whose* effect moved the card, which is what
    // `opponentTurn` covers: on the other player's turn a Straw Hat body
    // leaving this board is their doing or a battle K.O.
    cardNumber: "OP09-080",
    controller: "stage",
    signal: {
      kind: "card-moved",
      from: "board",
      movedType: "Straw Hat Crew",
      movedOwner: "self",
    },
    ownTurn: false,
    opponentTurn: true,
    oncePerTurn: false,
    program: {
      effect: {
        kind: "if",
        condition: {
          kind: "selector-count",
          player: "self",
          selector: { zone: "stage", rested: false },
          operator: "gte",
          value: 1,
        },
        then: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest", binding: SOURCE_BINDING },
              { kind: "add-don", player: "self", count: 1, rested: true },
            ],
          },
        },
      },
    },
  },
];
