/**
 * ST-17's five-card {The Seven Warlords of the Sea} supplement.
 *
 * Comments paraphrase what each clause has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content (`pnpm card:text
 * ST17-0xx` prints it from the local cache).
 *
 * Four [On Play] clauses and one activation, and four of the five are the same
 * card: a Blue deck pays for its selection by putting cards back, so three of
 * these look at the top of the deck and the fourth puts a card there. ST17-004's
 * [Blocker] is derived from the printed keyword and needs no program.
 */
import { type MechanicCondition } from "../mechanics.js";
import { lookAndReplace } from "./shared.js";
import { type SetMechanics } from "./registry.js";

const WARLORDS = "The Seven Warlords of the Sea";

/** "If your Leader has the {The Seven Warlords of the Sea} type". */
const warlordLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: WARLORDS,
};

export const st17Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST17-001 Crocodile: a reveal off the top that pays two cards when it
      // hits the deck's own type, and costs one back.
      //
      // The revealed card is never moved -- a look is not a draw -- so it is
      // still the top card when the hand card is placed above it. That ordering
      // is the clause's restraint: the two cards drawn arrive before the choice
      // of what to bury, so the card put back can be one of them.
      //
      // The gate reads the binding rather than the deck, which is the only way
      // to ask a question about "that card" once the look has bound it.
      "ST17-001",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 1,
              bind: "st17-crocodile",
            },
            { kind: "reveal", binding: "st17-crocodile" },
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "self",
                selector: {
                  zone: "deck",
                  binding: "st17-crocodile",
                  type: WARLORDS,
                },
                operator: "gte",
                value: 1,
              },
              then: {
                kind: "sequence",
                effects: [
                  { kind: "draw", player: "self", count: 2 },
                  {
                    kind: "choose",
                    selector: { player: "self", zone: "hand" },
                    bind: "st17-crocodile-back",
                    min: 1,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "st17-crocodile-back",
                      to: {
                        player: "self",
                        zone: "deck",
                        position: "top",
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    [
      // ST17-002 Trafalgar Law: one of your own Characters back to hand buys a
      // bounce of anything at cost 4 or less.
      //
      // The cost is never unpayable -- this card is itself on the board by the
      // time the clause resolves, and "1 of your Characters" includes it -- so
      // there is no outer gate, and returning itself is a legal, sometimes
      // correct, way to pay. The payoff names no side, so `player: "either"`:
      // taking back your own [On Play] body is the line the deck is built on.
      //
      // The Leader gate sits on the payoff alone, exactly where the printed
      // "If" does: the cost is paid first, and it is paid even outside a
      // Warlords deck.
      "ST17-002",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
            },
            bind: "st17-law-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "st17-law-cost",
                  to: { player: "owner", zone: "hand" },
                },
                {
                  kind: "if",
                  condition: warlordLeader,
                  then: {
                    kind: "choose",
                    selector: {
                      player: "either",
                      zone: "board",
                      category: "character",
                      maxCost: 4,
                    },
                    bind: "st17-law-bounce",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "st17-law-bounce",
                      to: { player: "owner", zone: "hand" },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // ST17-003 Buggy: a three-card look that puts every card back on top.
      //
      // No bottom: the cards all return above the deck, so this is a sort of
      // the next three draws rather than a dig past them. At 1 cost with a 2000
      // Counter that is the whole card, and it is what makes the deck's other
      // top-of-deck reads -- ST17-001's, and its own Leader's -- answerable.
      "ST17-003",
      { effect: lookAndReplace(3, "st17-buggy", false) },
    ],
    [
      // ST17-004 Boa Hancock: the same look, top or bottom this time, and then
      // a rested DON!! onto anything of the deck's own type.
      //
      // `give-rested-don` with a `type`, which is what the printed target list
      // is: the Leader qualifies through the same filter, and `attach-don`
      // could not reach it. Together with the printed [Blocker] this is a body
      // that sets the next draw up, pays for the turn after it, and still
      // defends.
      "ST17-004",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndReplace(3, "st17-hancock", true),
            {
              kind: "give-rested-don",
              player: "self",
              count: 1,
              type: WARLORDS,
            },
          ],
        },
      },
    ],
  ],
  activateMain: [
    [
      // ST17-005 Marshall.D.Teach: once a turn, a card off the top of the hand
      // onto the top of the deck buys two rested DON!!.
      //
      // Two DON!! for one card is the largest rate in the product, and what
      // holds it in check is that the card is not trashed but stacked: it is
      // the next draw, so the cost is a turn of tempo rather than a card. The
      // `requires` gate is on the hand having a card to place at all, so the
      // activation is withheld rather than offered and then wasted.
      "ST17-005",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "st17-teach-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st17-teach-cost",
                    to: { player: "self", zone: "deck", position: "top" },
                  },
                  { kind: "give-rested-don", player: "self", count: 2 },
                ],
              },
            },
          },
        },
      },
    ],
  ],
};
