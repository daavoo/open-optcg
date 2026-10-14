/**
 * The "when X happens" clauses the `P-` promos prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const promoReactionRules: readonly ReactionRule[] = [
  {
    // ST10-006 Monkey.D.Luffy: once a turn, the opponent activating a
    // [Blocker] costs them a Character of 8000 power or less.
    //
    // Printed with no timing marker beyond the once-per-turn, so it is a rule
    // here rather than an entry in any clause registry -- and the signal it
    // watches is the one OP09-118 Gol.D.Roger's alternate win condition reads,
    // from the same side of the table.
    //
    // No turn gate: the printed sentence carries none. A [Blocker] is nearly
    // always activated on this card's controller's turn, because that is when
    // they attack, but a Character played off a Trigger can block on the other
    // one -- and nothing in the text excludes it.
    //
    // `maxCurrentPower` reads the board, which is the point: the Character that
    // just blocked is usually the one inside the ceiling, and a debuff played
    // earlier in the turn brings a bigger one inside it.
    // P-117 Nami (Leader): with a DON!! on it, a connecting Leader attack mills
    // its controller's own deck.
    //
    // The mill is the deck's engine, not a cost: this Leader wins the game when
    // its deck runs out, so every card off the top is progress. `[DON!! x1]` is
    // `leaderAttachedDon`, the Leader's own pile -- the same reading every
    // other Leader-scoped DON!! gate in this table takes.
    //
    // `byLeaderAttack` is what narrows the signal from "a Life card of theirs
    // reached their hand" to "this Leader's attack connected": a Character's
    // attack raises the same shape, and the printed clause names the Leader.
    cardNumber: "P-117",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "life",
      to: "hand",
      movedOwner: "opponent",
      byLeaderAttack: true,
    },
    ownTurn: true,
    oncePerTurn: false,
    leaderAttachedDon: 1,
    program: {
      effect: {
        kind: "optional",
        effect: { kind: "trash-top", player: "self", count: 1 },
      },
    },
  },
  {
    // P-077 Ulti: once a turn, two or more DON!! going back to the DON!! deck
    // buy a rested DON!! and set a purple Stage active again.
    //
    // Printed with no timing marker beyond the once-per-turn, so it is a rule
    // here rather than an entry in any clause registry -- the same `don-returned`
    // signal OP11-077 Randolph and EB04-035 Hitokiri Kamazo watch.
    //
    // `minCount: 2` is load-bearing: a `DON!! −1` must not fire it, and the
    // Purple deck it belongs to pays most of its costs one DON!! at a time.
    // The replacement DON!! arrives rested, so what the clause converts is a
    // spent DON!! into a kept one; the Stage half is what makes it more than
    // that, because a purple Stage is the thing that spends DON!! again.
    //
    // No turn gate: the printed sentence carries none, so a Counter Event's
    // `DON!! −2` on the opponent's turn pays it too.
    cardNumber: "P-077",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self", minCount: 2 },
    ownTurn: false,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "sequence",
        effects: [
          { kind: "add-don", player: "self", count: 1, rested: true },
          {
            kind: "choose",
            selector: {
              player: "self",
              zone: "stage",
              color: "Purple",
              rested: true,
            },
            bind: "p077-stage",
            min: 0,
            max: 1,
            effect: { kind: "update", binding: "p077-stage", rested: false },
          },
        ],
      },
    },
  },
];
