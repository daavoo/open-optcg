/**
 * OP-16 Black/Yellow Marshall.D.Teach -- the five OP-09/EB-04 identities.
 *
 * Card data for these lives in `packages/cards/src/op16-teach.ts`. The rest of
 * the list's behaviour is OP-16's and sits in the `op16-*` modules; OP09-086
 * Jesus Burgess prints only untimed text and so has no program here at all --
 * both halves of its line are static layers in `static-abilities.ts`.
 */
import { SOURCE_BINDING, type MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, lookAndAddOrTrash, payFromHand } from "./shared.js";

/**
 * OP09-096 My Era...Begins!!: "[printed text omitted -- pnpm card:text OP09-096]"
 *
 * Written once because the `[Trigger]` is literally "[printed text omitted -- pnpm card:text OP09-096]" -- the same program, reached from the damage window.
 *
 * `excludeName` is the printed "other than", and it is not redundant: the Event
 * has the {Blackbeard Pirates} type itself, so without it the deck's own copies
 * would be legal finds and the card would dig for nothing. Trashing the leftovers
 * rather than bottoming them is what makes this the deck's *fast* searcher and
 * OP09-099 Fullalead the repeatable one -- and it feeds OP09-086 Jesus Burgess,
 * whose power counts the trash in fours.
 */
const myEraBegins: MechanicProgram = lookAndAddOrTrash(3, "op09-my-era", {
  type: "Blackbeard Pirates",
  excludeName: "My Era...Begins!!",
});

export const op16TeachMechanics: SetMechanics = {
  activateMain: [
    [
      // OP09-093 Marshall.D.Teach: "[printed text omitted -- pnpm card:text OP09-093]"
      //
      // `[Blocker]` is printed and needs no program: `hasStaticKeyword` reads it
      // off the card text.
      //
      // Two readings had to be settled, and the printed text is the only
      // authority for either:
      //
      //  - "[printed text omitted -- pnpm card:text OP09-093]" makes the clause a *play*
      //    payoff rather than a repeatable one. It is the reason the deck spends
      //    OP16-116 Zehahahahaha! to put this body down at all: played and
      //    activated on the same turn, it switches the opponent's Leader off for
      //    their swing-back turn.
      //  - the duration on the second sentence is shared. The negation names no
      //    window of its own, and "[printed text omitted -- pnpm card:text OP16-116]"
      //    closes the sentence both halves are in -- the same construction the JP
      //    text puts up front. So both the negation and the attack ban run to the
      //    end of the opponent's next turn, which is `expiresAfterTurns: 1`; the
      //    Leader negation says "during this turn" and so is 0.
      //
      // Both targets are "up to 1", so both are `min: 0` -- a board with nothing
      // worth switching off still gets the Leader half.
      "OP09-093",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Blackbeard Pirates",
                },
                { kind: "source-played-this-turn" },
              ],
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: [],
                    includeLeader: true,
                  },
                  bind: "op09-teach-leader",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "negate",
                    binding: "op09-teach-leader",
                    expiresAfterTurns: 0,
                  },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op09-teach-character",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "negate",
                        binding: "op09-teach-character",
                        expiresAfterTurns: 1,
                      },
                      {
                        kind: "restrict",
                        binding: "op09-teach-character",
                        restriction: "cannot-attack",
                        expiresAfterTurns: 1,
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-099 Fullalead: "[printed text omitted -- pnpm card:text OP09-099]"
      //
      // The first Stage in the pool with an `[Activate: Main]`, which is why
      // `legal-actions/main.ts` looks at the Stage as an activation source at all.
      //
      // Not once per turn -- nothing printed says so -- but resting itself is the
      // real limit, and `requires.sourceActive` is what stops a rested Stage
      // being offered an activation it cannot pay for. `requires.handCards`
      // does the same for the discard; the payoff is nested inside the cost's
      // `choose` (see `payFromHand`) so an unpayable cost cannot hand over a free
      // search.
      //
      // Reads "and add it to your hand" with no cost floor and no name
      // exclusion, unlike OP09-096: this one may find the Leader's own Event
      // package, which is the difference that makes it the deck's grindier
      // searcher.
      "OP09-099",
      {
        oncePerTurn: false,
        requires: { handCards: 1, sourceActive: true },
        program: {
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op09-fullalead-cost",
            1,
            {
              kind: "sequence",
              effects: [
                { kind: "update", binding: SOURCE_BINDING, rested: true },
                lookAndAdd(3, "op09-fullalead-looked", {
                  type: "Blackbeard Pirates",
                }).effect,
              ],
            },
          ),
        },
      },
    ],
  ],
  eventMain: [
    ["OP09-096", { cost: 1, program: myEraBegins }],
    [
      // EB04-059 Black Rope Dragon Twister: "[printed text omitted -- pnpm card:text EB04-059]"
      //
      // The Life card is a cost, so the payoff is nested inside the `choose` that
      // pays it: a player at 0 Life gets nothing rather than a free double K.O.
      // Turning a Life card face-up is not damage and does not take it -- it just
      // makes the card public, which is a real price in a deck that stacks Life
      // with OP16-108 Shiryu and OP16-119.
      //
      // The behind-on-board gate is checked *after* the cost, which is the
      // printed order ("You may pay: If <condition>, <effect>") and means a
      // player who is ahead can still pay and get nothing. `character-count-versus`
      // exists for this clause.
      //
      // Two separate `choose` steps rather than one for two: the cost ceilings
      // differ, and the first K.O. leaves the board before the second is offered,
      // so the same body cannot answer both.
      "EB04-059",
      {
        cost: 6,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "top" },
              bind: "eb04-twister-life",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "update",
                    binding: "eb04-twister-life",
                    faceUp: true,
                  },
                  {
                    kind: "if",
                    condition: {
                      kind: "character-count-versus",
                      player: "self",
                      operator: "lt",
                    },
                    then: {
                      kind: "sequence",
                      effects: [
                        {
                          kind: "choose",
                          selector: {
                            player: "opponent",
                            zone: "board",
                            category: "character",
                            maxCost: 6,
                          },
                          bind: "eb04-twister-six",
                          min: 0,
                          max: 1,
                          effect: {
                            kind: "knock-out",
                            binding: "eb04-twister-six",
                          },
                        },
                        {
                          kind: "choose",
                          selector: {
                            player: "opponent",
                            zone: "board",
                            category: "character",
                            maxCost: 5,
                          },
                          bind: "eb04-twister-five",
                          min: 0,
                          max: 1,
                          effect: {
                            kind: "knock-out",
                            binding: "eb04-twister-five",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ],
  trigger: [
    // "[printed text omitted -- pnpm card:text <card>]"
    ["OP09-096", myEraBegins],
    [
      // EB04-059 Black Rope Dragon Twister: "[printed text omitted -- pnpm card:text EB04-059]" The same Trigger OP16-116 Zehahahahaha! prints, and
      // the reason both Events are live cards to lose off the top of Life rather
      // than dead weight in the Life stack this Leader spends its turns building.
      "EB04-059",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "eb04-twister-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb04-twister-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
  ],
};
