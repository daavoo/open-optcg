/**
 * EB-03's `[Activate: Main]` abilities and its `[Main]` Events.
 *
 * The set's activations are almost all paid for by the source itself -- seven
 * of the thirteen rest or trash the Character printing them -- which is why
 * nearly every entry here sets `requires.sourceActive` and opens with a `rest`
 * or a `move` of `SOURCE_BINDING`. See `mechanics/README.md`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import type { MechanicEffect, MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd } from "./shared.js";
import { bankDeckTopOnLife } from "./eb03-on-play.js";

/** "Give up to 1 of your opponent's Characters −N power during this turn." */
export const shrinkOne = (amount: number, bind: string): MechanicEffect => ({
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
 * EB03-060's search: "look at 4 cards from the top of your deck; reveal up to 1
 * card with a cost of 2 to 8 and add it to your hand", behind the [Nami]
 * Leader gate the clause prints.
 *
 * The cost band is the whole card -- it deliberately reaches neither a 1-cost
 * body nor a 9-cost one -- so the bounds are stated on the selector rather than
 * approximated by a type. Shared with the `[Trigger]` in `eb03-triggers.ts`,
 * which reads "activate this card's [Main] effect" and so is the same program
 * rather than a copy of it.
 */
export const namiServantSearch: MechanicProgram = {
  effect: {
    kind: "if",
    condition: { kind: "leader-has-name", player: "self", name: "Nami" },
    then: lookAndAdd(4, "eb03-060-looked", { minCost: 2, maxCost: 8 }).effect,
  },
};

/** "You may trash this Character: …" -- the cost three of the set's Characters pay. */
const trashSelf: MechanicEffect = {
  kind: "move",
  binding: SOURCE_BINDING,
  to: { player: "self", zone: "trash" },
};

export const eb03MainMechanics: SetMechanics = {
  activateMain: [
    [
      // EB03-001 Nefeltari Vivi (Leader): "[printed text omitted -- pnpm card:text EB03-001]"
      //
      // The Leader rests to pay, which is a real price on a Red deck: a rested
      // Leader cannot attack for the turn. Both halves are unconditional "up
      // to"s, so the [Rush] still lands on a board with nothing worth shrinking.
      //
      // "Without a [When Attacking] effect" is the printed restriction and it is
      // `lacksClause`: the clause hands the keyword to a body that has no attack
      // trigger of its own, so a Character that would rather attack later is not
      // a legal target for it.
      "EB03-001",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                shrinkOne(2_000, "eb03-vivi-shrink"),
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    lacksClause: "[When Attacking]",
                  },
                  bind: "eb03-vivi-rush",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "grant-keyword",
                    binding: "eb03-vivi-rush",
                    keyword: "Rush",
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-006 Nami: "[printed text omitted -- pnpm card:text EB03-006]"
      //
      // `[Once Per Turn]` and no cost at all beyond the {Alabasta} Leader, so
      // the gate is the whole price -- and the activation is withheld from a
      // deck led by anything else rather than offered and resolving to nothing.
      "EB03-006",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Alabasta",
            },
            then: shrinkOne(1_000, "eb03-nami-shrink"),
          },
        },
      },
    ],
    [
      // EB03-008 Hibari: "[printed text omitted -- pnpm card:text EB03-008]"
      "EB03-008",
      {
        oncePerTurn: true,
        program: { effect: shrinkOne(1_000, "eb03-hibari-shrink") },
      },
    ],
    [
      // EB03-009 Makino: "[printed text omitted -- pnpm card:text EB03-009]"
      //
      // A 0-power body that rests itself to make a vanilla Character bigger --
      // `noBaseEffect` is the printed target filter, and it is what stops this
      // from being a general-purpose buff.
      "EB03-009",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    noBaseEffect: true,
                  },
                  bind: "eb03-makino-buff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "eb03-makino-buff",
                    amount: 2_000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-012 Otama: "[printed text omitted -- pnpm card:text EB03-012]"
      //
      // One node rather than a `choice`, because the printed clause is a single
      // "up to 1" spanning two resources: `rest-opponent-cards` offers each
      // eligible Character plus a DON!! while the opponent has an active one.
      // The `match` is what keeps the Character half as narrow as the text --
      // {Animal} or {SMILE}, cost 3 and under -- while the DON!! half stays
      // unconditional.
      "EB03-012",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "rest-opponent-cards",
                  player: "opponent",
                  count: 1,
                  match: {
                    category: "character",
                    maxCost: 3,
                    anyOf: [{ type: "Animal" }, { type: "SMILE" }],
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-013 Carrot: "[printed text omitted -- pnpm card:text EB03-013]"
      //
      // The K.O. only answers a *rested* body, so this is a punish for an
      // opponent who attacked rather than removal on demand -- and it has to
      // happen on the turn Carrot arrives, which is what `source-played-this-turn`
      // asks. The Stage play is inside the same gate: the printed "Then"
      // continues that sentence.
      "EB03-013",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: { kind: "source-played-this-turn" },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    rested: true,
                    maxCost: 5,
                  },
                  bind: "eb03-carrot-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "eb03-carrot-ko" },
                },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand", name: "Zou" },
                  bind: "eb03-carrot-stage",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "eb03-carrot-stage" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-014 Kuina: "[printed text omitted -- pnpm card:text EB03-014]"
      //
      // The DON!! goes to the Leader and only to the Leader, so `attach-don`
      // rather than `give-rested-don` -- and only to a <Slash> Leader, which is
      // an attribute rather than a type and so cannot ride on the node's own
      // filter.
      //
      // The gate is the program's outermost node rather than a step inside the
      // cost, which is what keeps the *offer* honest: `bareGateCondition`
      // withholds an activation whose whole clause sits behind a failed gate,
      // so a deck led by another attribute is never asked to rest a body for
      // nothing.
      "EB03-014",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, restedDon: 1 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-attribute",
              player: "self",
              attribute: "Slash",
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: SOURCE_BINDING },
                  {
                    kind: "attach-don",
                    player: "self",
                    from: "rested",
                    count: 2,
                    target: "leader",
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // EB03-015 Camie: "[printed text omitted -- pnpm card:text EB03-015]"
      //
      // The rest at the end names Characters only -- no DON!! half -- so it is a
      // `choose` and a `rest` rather than the `rest-opponent-cards` node
      // EB03-012 uses. `canRest` is what keeps an already-rested body and one
      // held active by a "cannot be rested" clause out of the offer.
      "EB03-015",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, restedDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "give-rested-don",
                  player: "self",
                  count: 1,
                  anyOfTypes: ["Fish-Man", "Merfolk"],
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 2,
                    canRest: true,
                  },
                  bind: "eb03-camie-rest",
                  min: 0,
                  max: 1,
                  effect: { kind: "rest", binding: "eb03-camie-rest" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-016 Kouzuki Hiyori: "[printed text omitted -- pnpm card:text EB03-016]"
      //
      // Trashes itself rather than resting, so this is a one-shot ramp: the
      // 1-cost body is the DON!!'s delivery vehicle and nothing else.
      "EB03-016",
      {
        oncePerTurn: false,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Land of Wano",
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  trashSelf,
                  {
                    kind: "attach-don",
                    player: "self",
                    from: "rested",
                    count: 1,
                    target: "leader",
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // EB03-026 Boa Hancock: "[printed text omitted -- pnpm card:text EB03-026]"
      //
      // The cost is one of the controller's own Characters going to the bottom
      // of their deck, and the payout is two DON!! spread across the Leader and
      // one Character. Paying with Hancock herself is legal and is the one line
      // that has to be reachable: the `choose` does not exclude the source,
      // because the printed text does not.
      "EB03-026",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "board", category: "character" },
            bind: "eb03-hancock-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "eb03-hancock-cost",
                  to: { player: "owner", zone: "deck", position: "bottom" },
                },
                {
                  kind: "attach-don",
                  player: "self",
                  from: "rested",
                  count: 1,
                  target: "leader",
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                  },
                  bind: "eb03-hancock-give",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "attach-don",
                    player: "self",
                    from: "rested",
                    count: 1,
                    target: { binding: "eb03-hancock-give" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-028 Yu: "[printed text omitted -- pnpm card:text EB03-028]"
      //
      // Yu leaves the *board*, so trashing it cannot change the hand count the
      // gate reads -- which is what lets the gate be the outermost node and the
      // offer be withheld from a full hand. The printed order is cost then
      // check; with nothing in between able to move the hand, the two readings
      // are the same state and only one of them is offered honestly.
      "EB03-028",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "hand",
              operator: "lte",
              value: 4,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  trashSelf,
                  { kind: "draw", player: "self", count: 2 },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // EB03-052 Shirahoshi: "[printed text omitted -- pnpm card:text EB03-052]"
      //
      // Both halves sit inside the Leader gate: the printed "Then" continues
      // that sentence, so a deck led by anything else would trash a body for
      // nothing. The gate is the outermost node, so that deck is not offered
      // the activation at all.
      "EB03-052",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Shirahoshi",
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  trashSelf,
                  bankDeckTopOnLife("eb03-shirahoshi-bank"),
                  {
                    kind: "select",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      type: "Neptunian",
                    },
                    bind: "eb03-shirahoshi-buff",
                    count: "all",
                    effect: {
                      kind: "modify-power",
                      binding: "eb03-shirahoshi-buff",
                      amount: 1_000,
                      expiresAfterTurns: 0,
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
      // EB03-061 Uta: "[printed text omitted -- pnpm card:text EB03-061]"
      //
      // The DON!! it sets active is its own controller's, and the rest that
      // follows spans the opponent's DON!! and their small bodies in one printed
      // "up to 1" -- the same node EB03-012 uses, with a wider `match`. Both
      // halves are "up to", so a cost area with no rested DON!! does not gate
      // the activation: the rest still lands (EB03-061#1 Q&A).
      "EB03-061",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "activate-don", player: "self", count: 1 },
              {
                kind: "rest-opponent-cards",
                player: "opponent",
                count: 1,
                match: { category: "character", maxCost: 4 },
              },
            ],
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // EB03-060 "Will You Be My Servant?": "[printed text omitted -- pnpm card:text EB03-060]"
      //
      // One of the six identities that were in the pool before the set was, and
      // the only one that reached it with a clause the engine dropped: its
      // `[Main]` was a hand-written pair of branches and its `[Trigger]` --
      // "activate this card's [Main] effect" -- was nothing at all, which
      // `LEGACY_IMPERATIVE_CARDS` hid, because that list exempts a whole card
      // rather than a clause. Migrating the card is what lets both halves be
      // claimed, and it is the register's own instruction for this case.
      "EB03-060",
      { cost: 1, program: namiServantSearch },
    ],
    [
      // EB03-029 "Insolent Fool!! Stand Down!!": "[printed text omitted -- pnpm card:text EB03-029]"
      //
      // Four rested DON!! on top of the Event's own cost, so this is a turn's
      // whole DON!! spent to put a 6-cost body down -- and only behind the
      // [Boa Hancock] Leader. `restDon` is declared on the entry rather than
      // inside the program so the *offer* can check the price is payable.
      "EB03-029",
      {
        cost: 1,
        restDon: 4,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Boa Hancock",
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                maxCost: 6,
                anyOf: [{ type: "Amazon Lily" }, { type: "Kuja Pirates" }],
              },
              bind: "eb03-hancock-event-body",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb03-hancock-event-body" },
            },
          },
        },
      },
    ],
    [
      // EB03-038 "Thanks for the Treat. ♡": "[printed text omitted -- pnpm card:text EB03-038]"
      //
      // A catch-up ramp: it pays out only while the controller is behind on
      // DON!! and their board is pure GERMA. Two DON!! arrive *rested*, so the
      // turn it is cast is not the turn it is spent.
      //
      // The all-GERMA board condition needs at least one Character on the
      // field (EB03-038#1 Q&A): `every-character-matches` is vacuously true on
      // an empty board, so the count beside it is what rules that board out.
      "EB03-038",
      {
        cost: 1,
        restDon: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "field-don-versus", player: "self", operator: "lte" },
                {
                  kind: "selector-count",
                  player: "self",
                  selector: { zone: "board", category: "character" },
                  operator: "gte",
                  value: 1,
                },
                {
                  kind: "every-character-matches",
                  player: "self",
                  selector: { zone: "board", typeIncluding: "GERMA" },
                },
              ],
            },
            then: { kind: "add-don", player: "self", count: 2, rested: true },
          },
        },
      },
    ],
    [
      // EB03-049 "I Knew You People Were Behind This.": "[printed text omitted -- pnpm card:text EB03-049]"
      //
      // Seven rested DON!! is the whole turn, and what it buys is two bodies at
      // once out of the hand *or* the trash -- which is why the Thriller Bark
      // deck spends the early game filling that trash. The two `choose` nodes
      // carry different ceilings because the printed clause does.
      "EB03-049",
      {
        cost: 1,
        restDon: 7,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Perona",
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: ["hand", "trash"],
                    category: "character",
                    type: "Thriller Bark Pirates",
                    maxCost: 6,
                  },
                  bind: "eb03-perona-event-big",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "eb03-perona-event-big" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: ["hand", "trash"],
                    category: "character",
                    type: "Thriller Bark Pirates",
                    maxCost: 4,
                  },
                  bind: "eb03-perona-event-small",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "eb03-perona-event-small" },
                },
              ],
            },
          },
        },
      },
    ],
  ],
};
