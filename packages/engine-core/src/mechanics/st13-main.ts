/**
 * ST-13's three Leaders and its `[Activate: Main]` clauses, plus the one
 * `[Main]` Event.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST13-0xx` prints it from the local cache).
 *
 * `[DON!! xN]` is an `if` on `source-attached-don`, which reaches a Leader's own
 * DON!! pile as well as a Character's.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  BROTHERS,
  digForABrother,
  hasLife,
  revealLifeAndPlayBrother,
} from "./st13-shared.js";

/** `[DON!! xN]`: the clause only fires with N DON!! given to the source. */
const withDon = (count: number, then: MechanicEffect): MechanicEffect => ({
  kind: "if",
  condition: { kind: "source-attached-don", operator: "gte", value: count },
  then,
});

export const st13MainMechanics: SetMechanics = {
  activateMain: [
    [
      // ST13-001 Sabo, the Leader: a big body of your own onto the top of Life
      // face-up, and +2000 somewhere for the round.
      //
      // The cost is the product in one clause. A Character at cost 3 or more
      // and 7000 power or more leaves the board -- it is not K.O.'d, it becomes
      // a Life card -- so the board shrinks, the Life stack grows, and the card
      // is public. What that buys directly is small; what it buys indirectly is
      // everything else this deck does with a face-up 5-cost brother sitting on
      // top of Life.
      //
      // Both bounds read the card on the field, so the power is current power:
      // a 5000 body with two DON!! on it qualifies on your own turn and not on
      // theirs.
      "ST13-001",
      {
        oncePerTurn: true,
        program: {
          effect: withDon(1, {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                minCost: 3,
                minCurrentPower: 7_000,
              },
              bind: "st13-sabo-bank",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st13-sabo-bank",
                    to: { player: "self", zone: "life", position: "top" },
                    faceUp: true,
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                    },
                    bind: "st13-sabo-buff",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-power",
                      binding: "st13-sabo-buff",
                      amount: 2_000,
                      expiresAfterTurns: 1,
                    },
                  },
                ],
              },
            },
          }),
        },
      },
    ],
    [
      // ST13-002 Portgas.D.Ace, the Leader: five deep for a 5-cost Character,
      // banked face-up on top of Life.
      //
      // Two DON!! and no card out of hand, so this is the cheapest way the
      // product loads its Life stack -- and the [End of Your Turn] half in
      // `st13-triggers.ts` is the price: everything face-up burns at the end of
      // the turn it is not used. The two clauses together make this Leader a
      // one-turn setup rather than a stockpile.
      //
      // A cost of exactly 5, not "5 or less": the deck is built with a shelf of
      // 5-cost brothers for the 2-cost bodies to find, and a 4-cost is as much
      // a miss as a 6-cost.
      "ST13-002",
      {
        oncePerTurn: true,
        program: {
          effect: withDon(2, {
            kind: "sequence",
            effects: [
              {
                kind: "look-at",
                player: "self",
                count: 5,
                bind: "st13-ace-dig",
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "st13-ace-dig",
                  category: "character",
                  minCost: 5,
                  maxCost: 5,
                },
                bind: "st13-ace-dig-bank",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "st13-ace-dig-bank",
                  to: { player: "self", zone: "life", position: "top" },
                  faceUp: true,
                },
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "st13-ace-dig",
                },
                bind: "st13-ace-dig-rest",
                count: "all",
                effect: {
                  kind: "order-to-bottom",
                  binding: "st13-ace-dig-rest",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
              },
            ],
          }),
        },
      },
    ],
    [
      // ST13-003 Monkey.D.Luffy, the Leader: at 0 Life, two 5-cost Characters
      // out of hand or trash onto the top of Life face-up.
      //
      // The only clause in the pool that *rebuilds* a Life stack from nothing,
      // and the gate is what makes it a Leader rather than a broken card: it
      // pays exactly once the player would otherwise be dead to the next
      // attack. The two Characters are not blockers and they are not on the
      // board -- they are two more attacks this Leader has to survive, and the
      // three 2-cost brothers are how they come back off.
      //
      // Its continuous half is a `StaticAbility` row and is a real price: under
      // it a face-up Life card hit by damage is gone to the bottom of the deck
      // instead of joining the hand.
      "ST13-003",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: withDon(2, {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "st13-luffy-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st13-luffy-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "if",
                    condition: {
                      kind: "zone-count",
                      player: "self",
                      zone: "life",
                      operator: "lte",
                      value: 0,
                    },
                    then: {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: ["hand", "trash"],
                        category: "character",
                        minCost: 5,
                        maxCost: 5,
                      },
                      bind: "st13-luffy-bank",
                      min: 0,
                      max: 2,
                      effect: {
                        kind: "move",
                        binding: "st13-luffy-bank",
                        to: { player: "self", zone: "life", position: "top" },
                        faceUp: true,
                      },
                    },
                  },
                ],
              },
            },
          }),
        },
      },
    ],
    ...BROTHERS.map(
      (name, index) =>
        [
          // ST13-007 Sabo, ST13-010 Portgas.D.Ace, ST13-014 Monkey.D.Luffy: one
          // 2-cost body each, and the only difference between them is the name
          // they read off the top of Life. See `revealLifeAndPlayBrother`.
          //
          // Repeatable rather than `[Once Per Turn]`, because the clause limits
          // itself -- the source trashes itself to pay. `requires.lifeCards`
          // withholds the activation from an empty Life stack, where the reveal
          // would find nothing and the body would be spent for it.
          ["ST13-007", "ST13-010", "ST13-014"][index]!,
          {
            oncePerTurn: false,
            requires: { lifeCards: 1 },
            program: {
              effect: revealLifeAndPlayBrother(
                name,
                `st13-${name.toLowerCase().replaceAll(".", "")}-reveal`,
                SOURCE_BINDING,
              ),
            },
          },
        ] as const,
    ),
    [
      // ST13-015 Monkey.D.Luffy: +2000 for the round, and then a card drawn for
      // a card off the top of Life.
      //
      // The draw is not free and the Life card is not a cost paid to someone
      // else: it is trashed, so it never comes back and never fires a Trigger.
      // In this deck that is sometimes the *point* -- a face-down Life card
      // that ST13-002's Leader is about to burn anyway is worth more as a draw
      // -- and the `if` is the printed floor that stops the clause killing its
      // own controller at 0 Life.
      "ST13-015",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "modify-power",
                binding: SOURCE_BINDING,
                amount: 2_000,
                expiresAfterTurns: 1,
              },
              {
                kind: "if",
                condition: hasLife,
                then: {
                  kind: "sequence",
                  effects: [
                    { kind: "draw", player: "self", count: 1 },
                    {
                      kind: "select",
                      selector: {
                        player: "self",
                        zone: "life",
                        position: "top",
                      },
                      bind: "st13-luffy-burn",
                      count: 1,
                      effect: {
                        kind: "move",
                        binding: "st13-luffy-burn",
                        to: { player: "self", zone: "trash" },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // ST13-019 The Three Brothers' Bond: the same five-deep dig ST13-013
      // prints, on an Event at the same cost. The `[Trigger]` re-registers the
      // fragment in `st13-triggers.ts` -- the printed words are "activate this
      // card's [Main] effect", which is one fragment registered twice rather
      // than a node reaching across registries.
      "ST13-019",
      { cost: 1, program: { effect: digForABrother("st13-bond") } },
    ],
  ],
};
