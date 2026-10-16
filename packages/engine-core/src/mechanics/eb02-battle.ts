/**
 * EB-02's battle-window clauses: its two `[Counter]` Events and its four
 * `[When Attacking]` abilities.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { payFromHand } from "./shared.js";
import { frankyRamp } from "./eb02-on-play.js";

export const eb02BattleMechanics: SetMechanics = {
  counterEvent: [
    [
      // EB02-030 And That's When Somebody Makes Fun of Their Friend's
      // Dream!!!! (2).
      //
      // `power: 0`, because this Counter adds nothing to the battle it is
      // played in: what it buys is a permission that lasts the rest of the turn
      // -- any of the controller's Characters that would be K.O.'d in battle
      // may be saved by trashing a card from hand instead. On a turn the
      // opponent has three attacks left that is three saves for one card, and
      // on a turn they have one it is a worse Counter than a 1000.
      //
      // The permission is a `install-replacement` booking on the *player*
      // rather than an entry the board walk can find: the Event is in the trash
      // before the first Character is threatened. What the save costs and what
      // it answers live in the replacement registry, in
      // `eb02-triggers.ts`. Its `[Trigger]` half is there too.
      "EB02-030",
      {
        cost: 2,
        power: 0,
        program: {
          effect: {
            kind: "install-replacement",
            player: "self",
            cardNumber: "EB02-030",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // EB02-059 Without Your Help I Can't Become the King of the
      // Pirates!!!! (4).
      //
      // The +1000 is the registry's number, so the attacker's forecast reads
      // the same field the resolution will. The body that follows is what makes
      // a 4-cost Counter worth the slot: a blocker arriving mid-battle on a
      // board at one Life, which is the position Yellow plays to reach.
      //
      // The `anyOf` is the printed "your yellow {Straw Hat Crew} type Character
      // cards **or** [Sanji]", and "yellow" qualifies both branches: Bandai's
      // Q&A (EB02-059#1) rules out a [Sanji] of any other colour. The cost
      // ceiling is conjunctive with both too.
      "EB02-059",
      {
        cost: 4,
        power: 1_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 1,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                maxCost: 5,
                anyOf: [
                  { color: "Yellow", type: "Straw Hat Crew" },
                  { color: "Yellow", name: "Sanji" },
                ],
              },
              bind: "eb02-059-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb02-059-play" },
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // EB02-037 Franky: one printed clause on two timings -- see
      // `eb02-on-play.ts`, which registers the same fragment for the
      // `[On Play]` half. Its value on this timing is the same ramp bought a
      // turn later, on a body that is already on the board.
      "EB02-037",
      frankyRamp,
    ],
    [
      // EB02-052 Enel.
      //
      // The card from hand is the cost and both sentences are what it buys, so
      // they are nested inside it: an empty hand gets neither the Life card nor
      // the +1000. Only the Life half carries the printed "if you have 1 or
      // less Life cards" -- the buff is unconditional, which is what keeps the
      // clause worth paying on a turn the controller is at four.
      //
      // The banked card goes on **face-down**: a Life card added by an effect
      // has never been seen, which is why nothing here sets `faceUp`.
      //
      // `modify-power` rather than `battle-power`, because the printed sentence
      // says "during this turn": an 11000 body that attacks and then defends
      // keeps the thousand. Its [Rush] gate is continuous and is a row in
      // `static-abilities.ts`.
      "EB02-052",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "eb02-052-cost",
              1,
              {
                kind: "sequence",
                effects: [
                  {
                    kind: "if",
                    condition: {
                      kind: "zone-count",
                      player: "self",
                      zone: "life",
                      operator: "lte",
                      value: 1,
                    },
                    then: {
                      kind: "select",
                      selector: {
                        player: "self",
                        zone: "deck",
                        position: "top",
                      },
                      bind: "eb02-052-bank",
                      count: 1,
                      effect: {
                        kind: "move",
                        binding: "eb02-052-bank",
                        to: { player: "self", zone: "life", position: "top" },
                      },
                    },
                  },
                  {
                    kind: "modify-power",
                    binding: SOURCE_BINDING,
                    amount: 1_000,
                    expiresAfterTurns: 0,
                  },
                ],
              },
            ),
          },
        },
      },
    ],
    [
      // EB02-057 Mad Treasure.
      //
      // A Life card into the hand is the cost, and `position: "edge"` is the
      // printed "from the top or bottom of your Life cards" -- exactly those
      // two, and a one-card stack resolves to that card rather than to nothing.
      // The trade is Yellow's own: a Life total for a body off the board.
      //
      // The Character does not die -- it becomes one of the opponent's Life
      // cards, **face-up**, so both players know what their next damage turns
      // over. Which end it goes on is the controller's choice and it is a real
      // one: on top it is the next card the opponent draws off an attack, on
      // the bottom it is gone for the game. So the end is asked after the
      // Character is picked, which is the order printed.
      "EB02-057",
      {
        oncePerTurn: false,
        // `lifeCardsMatching` rather than a plain count, because the cost names
        // particular cards: `position: "edge"` is the printed "top or bottom",
        // which is the only pair the clause may spend.
        requires: {
          lifeCardsMatching: { match: { position: "edge" }, count: 1 },
        },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "edge" },
              bind: "eb02-057-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "eb02-057-cost",
                    to: { player: "self", zone: "hand" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxCost: 3,
                    },
                    bind: "eb02-057-target",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "choice",
                      branches: [
                        {
                          id: "top",
                          label: "Add it to the top of their Life cards",
                          effect: {
                            kind: "move",
                            binding: "eb02-057-target",
                            to: {
                              player: "opponent",
                              zone: "life",
                              position: "top",
                            },
                            faceUp: true,
                          },
                        },
                        {
                          id: "bottom",
                          label: "Add it to the bottom of their Life cards",
                          effect: {
                            kind: "move",
                            binding: "eb02-057-target",
                            to: {
                              player: "opponent",
                              zone: "life",
                              position: "bottom",
                            },
                            faceUp: true,
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
    [
      // EB02-061 Monkey.D.Luffy.
      //
      // `from: "active"` is printed and is the whole price: the default return
      // order takes rested DON!! first, and a rested DON!! on this timing is
      // one already spent on the attack -- so the cheapest reading would buy
      // the restand for nothing. `requires.activeDon` gates the offer on the
      // same pile, so the `[Once Per Turn]` is never spent on a cost that
      // cannot be paid.
      //
      // What it buys is two things at once: the body attacks again, and a Life
      // card joins the hand. Its [Rush] gate is continuous and is a row in
      // `static-abilities.ts`.
      "EB02-061",
      {
        oncePerTurn: true,
        requires: { activeDon: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "return-don",
                  player: "self",
                  count: 2,
                  from: "active",
                },
                { kind: "update", binding: SOURCE_BINDING, rested: false },
                {
                  kind: "select",
                  selector: { player: "self", zone: "life", position: "top" },
                  bind: "eb02-061-life",
                  count: 1,
                  effect: {
                    kind: "move",
                    binding: "eb02-061-life",
                    to: { player: "self", zone: "hand" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
};
