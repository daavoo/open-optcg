/**
 * The "when X happens" clauses OP-12 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import type { ReactionRule } from "../reaction-rules.js";
import { koalaLifeToHand } from "./reaction-shared.js";

export const op12ReactionRules: readonly ReactionRule[] = [
  {
    // OP12-040 Kuzan (Leader): "When a card is trashed from your hand by your
    // {Navy} type card's effect, draw cards equal to the number of cards
    // trashed."
    //
    // One draw per card, so no `oncePerTurn` -- the signal fires once per card
    // the `move` node sends, and OP12-046 Zephyr's "trash 2 cards from your
    // hand" is the clause that makes the difference visible.
    //
    // `resolveNavyDiscard` and `resolveDrawTrash` read the same sentence for
    // the imperative hand-trash paths, which this signal cannot reach; the two
    // readings sit side by side for the reason the `don-returned` note gives,
    // and the imperative half retires when those pending effects do.
    cardNumber: "OP12-040",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "hand",
      to: "trash",
      movedOwner: "self",
      sourceType: "Navy",
    },
    // Both false is "any turn": the flags restrict rather than permit, and this
    // clause prints no turn marker -- a {Navy} Counter Event trashing a card on
    // the opponent's turn pays it too.
    ownTurn: false,
    opponentTurn: false,
    oncePerTurn: false,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
  {
    // OP12-081 Koala (Leader), second clause: "[printed text omitted -- pnpm card:text OP12-081]"
    //
    // A punishment for the opponent's own tempo: they gain a card and lose a
    // Life, which is a trade this Leader wants. Two rules for one printed clause,
    // because the trigger is a disjunction of two unrelated facts; they share the
    // once-per-turn key (which is keyed by card number), so the clause still
    // fires once a turn however it was reached.
    //
    // The Leader's *first* clause is a `[When Attacking]` program -- see
    // `op12-battle.ts`.
    cardNumber: "OP12-081",
    controller: "leader",
    signal: {
      kind: "card-played",
      category: "character",
      playedBy: "opponent",
      minBaseCost: 8,
    },
    ownTurn: false,
    oncePerTurn: true,
    optionalActivation: true,
    program: { effect: koalaLifeToHand },
  },
  {
    cardNumber: "OP12-081",
    controller: "leader",
    signal: {
      kind: "card-played",
      category: "character",
      playedBy: "opponent",
      bySourceCategory: "character",
    },
    ownTurn: false,
    oncePerTurn: true,
    optionalActivation: true,
    program: { effect: koalaLifeToHand },
  },
  {
    // OP12-099 Kalgara: "[printed text omitted -- pnpm card:text OP12-099]"
    //
    // A free card the first time Life moves on its controller's turn, and the
    // reason it is only the first: the draw lock it sets bars this very node from
    // paying out again, which is what the printed "Then" buys. Not
    // `[Once Per Turn]` -- the restriction is the limit, and it also switches off
    // every *other* draw effect for the turn.
    //
    // Either side's Life counts, which is why `movedOwner` is left open: Yellow
    // spends its own Life as readily as it takes the opponent's.
    cardNumber: "OP12-099",
    controller: "board",
    signal: { kind: "card-moved", from: "life" },
    ownTurn: true,
    oncePerTurn: false,
    program: {
      effect: {
        kind: "sequence",
        effects: [
          { kind: "draw", player: "self", count: 1 },
          {
            kind: "restrict-player",
            player: "self",
            restriction: "cannot-draw-by-effect",
            expiresAfterTurns: 0,
          },
        ],
      },
    },
  },
  {
    // OP12-072 Zeff: [Rush] for the turn whenever a DON!! on your field goes
    // back to your DON!! deck, behind a [Sanji] Leader.
    //
    // The same `don-returned` watcher, and in the Blue/Purple Sanji deck the
    // return is the Leader's own `DON!! −1` or a Gum-Gum Event's `DON!! −2`, so
    // a Zeff played after paying one attacks that turn. No `[Your Turn]` is
    // printed, but [Rush] granted on the opponent's turn expires before it can
    // do anything, so only the own-turn half is wired. `oncePerTurn` because a
    // second grant of the same keyword changes nothing.
    cardNumber: "OP12-072",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "if",
        condition: { kind: "leader-has-name", player: "self", name: "Sanji" },
        then: {
          kind: "grant-keyword",
          binding: SOURCE_BINDING,
          keyword: "Rush",
          expiresAfterTurns: 0,
        },
      },
    },
  },
];
