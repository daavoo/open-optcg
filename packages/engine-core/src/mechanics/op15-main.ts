/** OP15 `[Activate: Main]` programs and `[Main]` Events. */
import {
  OWN_CARDS_ZONES,
  SOURCE_BINDING,
  type CardSelector,
  type MechanicCondition,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { embarrassingLock, impactDialKo } from "./op15-shared.js";
import { lookAndAdd, trashForBattlePower } from "./shared.js";

/**
 * "If you have [name]" counts every card you have on the field -- Leader,
 * Characters and Stage -- so a Leader that has every name meets it (Bandai's
 * OP15-064#1 and OP15-072#1).
 */
const haveNamed = (name: string): CardSelector => ({
  player: "self",
  zone: OWN_CARDS_ZONES,
  includeLeader: true,
  name,
});

/**
 * OP15-021 "Just Watch Me, Ace!!!": "[printed text omitted -- pnpm card:text OP15-021]"
 *
 * One printed clause on two timings, so one program registered twice.
 */
const aceDebuff: MechanicProgram = {
  effect: {
    kind: "choose",
    selector: { player: "opponent", zone: "board", category: "character" },
    bind: "op15-ace-debuff",
    min: 0,
    max: 1,
    effect: {
      kind: "modify-power",
      binding: "op15-ace-debuff",
      amount: -3000,
      expiresAfterTurns: 0,
    },
  },
};

/**
 * The price OP15-003 Alvida, OP15-017 Morgan and OP15-023 Arlong print:
 * moving one of the opponent's rested DON!! onto one of the opponent's
 * Characters. It needs both an opposing Character and an opposing rested
 * DON!!, and Bandai rules the ability unusable without either (OP15-003 Q4).
 *
 * The outermost condition, so `bareGateCondition` withholds the offer rather
 * than letting the payoff run with the price unpaid. That is also why the
 * printed "you may" is not an `optional` around the body: activating is the
 * yes, and an `optional` under the gate would ask a second time.
 */
const OPPONENT_CAN_PAY_DON_PRICE: MechanicCondition = {
  kind: "all-of",
  conditions: [
    { kind: "rested-don", player: "opponent", operator: "gte", value: 1 },
    {
      kind: "selector-count",
      player: "opponent",
      selector: { zone: "board", category: "character" },
      operator: "gte",
      value: 1,
    },
  ],
};

export const op15MainMechanics: SetMechanics = {
  activateMain: [
    [
      // OP15-032 Brook: `pnpm card:text OP15-032`.
      //
      // Migrated off the hand-written activation register. The {Straw Hat Crew}
      // Leader gate is outermost, so a Leader outside the type is not offered a
      // Character to trash for nothing; the register checked the same thing
      // before building its per-target actions.
      //
      // "A base cost of 8 or less", so `maxBaseCost` -- the register read the
      // printed cost off the card database too. `rested: true` is the printed
      // "set ... as active": there is nothing to set active otherwise.
      "OP15-032",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Straw Hat Crew",
            },
            then: {
              // No `optional` around the body, though the text reads "you
              // may": the gate has to be the program's outermost node for
              // `bareGateCondition` to withhold the offer, and
              // `alreadyOptedIn` unwraps only an `optional` that *is* the whole
              // program. Wrapping the body would ask "apply?" the instant the
              // player clicks the activation -- a question with no new
              // information behind it, and one the branch this replaces never
              // asked. Clicking the activation is the yes.
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    maxBaseCost: 8,
                    rested: true,
                  },
                  bind: "op15-brook-active",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "update",
                    binding: "op15-brook-active",
                    rested: false,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP15-008 Krieg: "[printed text omitted -- pnpm card:text OP15-008]"
      //
      // "That Character" is the one its own `[On Play]` pushed DON!! onto, which
      // is why that clause notes it -- `remembered` is the selector that reads
      // the note back. The debuff is board-wide and scales with the DON!! on the
      // marked Character alone, which `perGivenDonOf` expresses: three DON!!
      // there is −3000 across their whole board.
      "OP15-008",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: { kind: "source-played-this-turn" },
            then: {
              kind: "select",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                remembered: true,
              },
              bind: "op15-krieg-marked",
              count: "all",
              effect: {
                kind: "select",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "op15-krieg-sweep",
                count: "all",
                effect: {
                  kind: "modify-power",
                  binding: "op15-krieg-sweep",
                  amount: -1000,
                  perGivenDonOf: "op15-krieg-marked",
                  expiresAfterTurns: 0,
                },
              },
            },
          },
        },
      },
    ],
    [
      // OP15-010 Nezumi: "[printed text omitted -- pnpm card:text OP15-010]"
      //
      // "Its owner's" is the owner of the rested DON!!, which may be either
      // player (OP15-010 Q1): your own spent DON!! onto your own board, where
      // it still adds power, or one of the opponent's onto theirs, which is
      // what the East Blue cards that read given DON!! on opposing Characters
      // want. `eitherOwner` is that choice; the gate withholds the activation
      // when neither cost area holds a rested DON!! to move.
      "OP15-010",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "any-of",
              conditions: [
                {
                  kind: "rested-don",
                  player: "self",
                  operator: "gte",
                  value: 1,
                },
                {
                  kind: "rested-don",
                  player: "opponent",
                  operator: "gte",
                  value: 1,
                },
              ],
            },
            then: {
              kind: "give-rested-don",
              player: "self",
              count: 1,
              eitherOwner: true,
            },
          },
        },
      },
    ],
    [
      // OP15-001 Krieg (Leader): "[printed text omitted -- pnpm card:text OP15-001]"
      //
      // The payoff half of the Leader whose static aura shrinks the same board;
      // both halves read the DON!! the deck has pushed across.
      "OP15-001",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              minGivenDon: 2,
              canRest: true,
            },
            bind: "op15-krieg-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op15-krieg-rest" },
          },
        },
      },
    ],
    [
      // OP15-093 The Risky Brothers: "[printed text omitted -- pnpm card:text OP15-093]"
      //
      // The Character trashes itself first, so it is one of the 15. Both grants
      // land on the same chosen Luffy: [Rush: Character] lets it attack a
      // Character the turn it landed, and the attribute is what the Black
      // {Land of Wano} shell's <Slash> clauses read.
      "OP15-093",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "zone-count",
                    player: "self",
                    zone: "trash",
                    operator: "gte",
                    value: 15,
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      name: "Monkey.D.Luffy",
                    },
                    bind: "op15-risky-grant",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "sequence",
                      effects: [
                        {
                          kind: "grant-keyword",
                          binding: "op15-risky-grant",
                          keyword: "Rush: Character",
                          expiresAfterTurns: 0,
                        },
                        {
                          kind: "grant-attribute",
                          binding: "op15-risky-grant",
                          attribute: "Slash",
                          expiresAfterTurns: 0,
                        },
                      ],
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
      // OP15-002 Lucy (Leader): "[printed text omitted -- pnpm card:text OP15-002]"
      //
      // The reward for the Dressrosa Event shell actually spending its Events,
      // which is also what its battle clause below trashes them for. Its
      // `[When Attacking]`/`[On Your Opponent's Attack]` half is in
      // `op15-battle.ts`.
      "OP15-002",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "event-activated-this-turn",
              player: "self",
              minBaseCost: 3,
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // OP15-039 Rebecca (Leader): "[printed text omitted -- pnpm card:text OP15-039]"
      //
      // A Leader that develops instead of attacking -- the printed "cannot
      // attack" is enforced in `canAttack`, which reads it off the text. Resting
      // it costs nothing while it never attacks, so the real price is the
      // Character returned to hand, and the bounce is what makes the free
      // cost-3 play a trade rather than a gift. "A cost of 3" is exact.
      "OP15-039",
      {
        oncePerTurn: false,
        // Not printed [Once Per Turn], so the cost is the only limit on it: a
        // rested Leader cannot pay "rest this Leader", and with no {Dressrosa}
        // Character on the board there is nothing to return. Without both gates
        // the activation stays on offer after it has been paid, and a rules
        // agent bounces and replays the same body until the game's action cap.
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                type: "Dressrosa",
              },
              operator: "gte",
              value: 1,
            },
            // No `optional` for the printed "You may": activating is the yes.
            // `alreadyOptedIn` strips an `optional` only when it is the whole
            // program, so one under this gate would ask a second time.
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "select",
                  selector: { player: "self", zone: [], includeLeader: true },
                  bind: "op15-rebecca-leader",
                  count: "all",
                  effect: {
                    kind: "update",
                    binding: "op15-rebecca-leader",
                    rested: true,
                  },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    type: "Dressrosa",
                  },
                  bind: "op15-rebecca-bounce",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "move",
                        binding: "op15-rebecca-bounce",
                        to: { player: "self", zone: "hand" },
                      },
                      {
                        kind: "choose",
                        selector: {
                          player: "self",
                          zone: "hand",
                          category: "character",
                          type: "Dressrosa",
                          minCost: 3,
                          maxCost: 3,
                        },
                        bind: "op15-rebecca-play",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "play",
                          binding: "op15-rebecca-play",
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
    ],
    [
      // OP15-003 Alvida: the same "[printed text omitted -- pnpm card:text OP15-003]" that OP15-017 Morgan prints, on a body whose K.O.
      // replacement is registered in `op16-replacements.ts`.
      "OP15-003",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: OPPONENT_CAN_PAY_DON_PRICE,
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op15-alvida-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "attach-don",
                    player: "opponent",
                    from: "rested",
                    count: 1,
                    target: { binding: "op15-alvida-cost" },
                  },
                  {
                    kind: "give-rested-don",
                    player: "self",
                    count: 1,
                    eitherOwner: true,
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP15-017 Morgan: "[printed text omitted -- pnpm card:text OP15-017]"
      //
      // Both halves move *rested* DON!! onto a board: the cost buries one of
      // the opponent's on a Character of theirs, and the payoff gives a rested
      // DON!! of either player to a card of its owner's (OP15-017 Q1, Q3).
      // The price is the opponent's DON!!, which `requires` cannot gate, so
      // the outermost `if` withholds the activation when it cannot be paid --
      // without it the payoff ran on its own (OP15-017 Q4).
      "OP15-017",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: OPPONENT_CAN_PAY_DON_PRICE,
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op15-morgan-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "attach-don",
                    player: "opponent",
                    from: "rested",
                    count: 1,
                    target: { binding: "op15-morgan-cost" },
                  },
                  {
                    kind: "give-rested-don",
                    player: "self",
                    count: 1,
                    eitherOwner: true,
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP15-023 Arlong: "[printed text omitted -- pnpm card:text OP15-023]"
      //
      // The cost buries one of the opponent's rested DON!! on a Character of
      // theirs; the payoff gives a DON!! out of either player's cost area,
      // active or rested, to a card of its owner's (OP15-023 Q1, Q2, Q4) --
      // out of the opponent's area an active one first, which is the one that
      // costs them tempo, and their cards are the ones listed first. Gated
      // like OP15-017 Morgan (OP15-023 Q5).
      "OP15-023",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: OPPONENT_CAN_PAY_DON_PRICE,
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op15-arlong-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "attach-don",
                    player: "opponent",
                    from: "rested",
                    count: 1,
                    target: { binding: "op15-arlong-cost" },
                  },
                  {
                    kind: "give-rested-don",
                    player: "opponent",
                    count: 1,
                    from: "cost-area",
                    eitherOwner: true,
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP15-099 Urouge: "[printed text omitted -- pnpm card:text OP15-099]" Its `[On Play]` half is in
      // `op15-on-play.ts`.
      //
      // Turning a Life card face-down is not a cost a player can always pay: it
      // needs a *face-up* one, which only an effect puts there. `faceUp: true`
      // on the selector is that gate, and `update` is what flips it back --
      // `flipLife` reports the change so the opponent sees the card go dark.
      "OP15-099",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "life",
                    position: "top",
                    faceUp: true,
                  },
                  bind: "op15-urouge-life",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "update",
                        binding: "op15-urouge-life",
                        faceUp: false,
                      },
                      { kind: "give-rested-don", player: "self", count: 1 },
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
      // OP15-022 Brook (Leader): "[printed text omitted -- pnpm card:text OP15-022]"
      //
      // The payoff for the rule its other half rewrites: a Leader that mills
      // itself out on purpose and gets an extra attack for arriving at zero. It
      // loses at the end of that turn -- see `survivesEmptyDeck` in `engine.ts`
      // -- so this is a one-turn burst, not an engine.
      "OP15-022",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "trash-top", player: "self", count: 4 },
              {
                kind: "if",
                condition: {
                  kind: "zone-count",
                  player: "self",
                  zone: "deck",
                  operator: "eq",
                  value: 0,
                },
                then: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    rested: true,
                  },
                  bind: "op15-brook-refresh",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "update",
                    binding: "op15-brook-refresh",
                    rested: false,
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-026 Jango: "[printed text omitted -- pnpm card:text OP15-026]" Its `[On Play]` search is in `op15-on-play.ts`.
      //
      // No `[Once Per Turn]` and none needed: the cost removes the source.
      "OP15-026",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op15-jango-give",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "attach-don",
                    player: "opponent",
                    from: "rested",
                    count: 1,
                    target: { binding: "op15-jango-give" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP15-041 Orlumbus: "[printed text omitted -- pnpm card:text OP15-041]" Its `[On K.O.]` draw is in
      // `op15-triggers.ts`.
      //
      // Orlumbus is itself an eligible cost -- the printed text says "1 of your
      // Characters" with no exclusion -- and paying with it is simply bad, not
      // illegal, so the selector does not exclude the source.
      "OP15-041",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op15-orlumbus-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "move",
                        binding: "op15-orlumbus-cost",
                        to: {
                          player: "self",
                          zone: "deck",
                          position: "bottom",
                        },
                      },
                      {
                        kind: "grant-keyword",
                        binding: SOURCE_BINDING,
                        keyword: "Rush",
                        expiresAfterTurns: 0,
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
      // OP15-064 Kotori: "[printed text omitted -- pnpm card:text OP15-064]"
      //
      // Half of the Skypiea priest trio, each of which checks for the other two
      // by name. `selector-count` at `gte: 1` per name is the check: the two
      // conditions are separate because one Character cannot be both, and
      // `anyOf` would let a pair of Satori satisfy it.
      //
      // The DON!! −2 and the rest are both costs and both come before the
      // condition, which is what the printed comma and colon say.
      "OP15-064",
      {
        oncePerTurn: false,
        requires: { fieldDon: 2, sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 2 },
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "if",
                  condition: {
                    kind: "selector-count",
                    player: "self",
                    selector: haveNamed("Satori"),
                    operator: "gte",
                    value: 1,
                  },
                  then: {
                    kind: "if",
                    condition: {
                      kind: "selector-count",
                      player: "self",
                      selector: haveNamed("Hotori"),
                      operator: "gte",
                      value: 1,
                    },
                    then: {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                        maxCurrentPower: 5000,
                        canRest: true,
                      },
                      bind: "op15-kotori-rest",
                      min: 0,
                      max: 1,
                      effect: { kind: "rest", binding: "op15-kotori-rest" },
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
      // OP15-072 Hotori: "[printed text omitted -- pnpm card:text OP15-072]" Kotori's twin, one
      // name swapped and a debuff instead of a rest.
      "OP15-072",
      {
        oncePerTurn: false,
        requires: { fieldDon: 2, sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 2 },
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "if",
                  condition: {
                    kind: "selector-count",
                    player: "self",
                    selector: haveNamed("Kotori"),
                    operator: "gte",
                    value: 1,
                  },
                  then: {
                    kind: "if",
                    condition: {
                      kind: "selector-count",
                      player: "self",
                      selector: haveNamed("Satori"),
                      operator: "gte",
                      value: 1,
                    },
                    then: {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                      },
                      bind: "op15-hotori-debuff",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "modify-power",
                        binding: "op15-hotori-debuff",
                        amount: -3000,
                        expiresAfterTurns: 0,
                      },
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
      // OP15-083 Spoil: "[printed text omitted -- pnpm card:text OP15-083]"
      //
      // The trash is the cost and it is paid first, so Spoil itself is one of
      // the 15 -- the printed order is "trash this Character: if you have 15".
      // No `[Once Per Turn]`, and none is needed: the cost removes the source.
      "OP15-083",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "zone-count",
                    player: "self",
                    zone: "trash",
                    operator: "gte",
                    value: 15,
                  },
                  then: {
                    kind: "give-rested-don",
                    player: "self",
                    count: 1,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP15-085 Tony Tony.Chopper: "[printed text omitted -- pnpm card:text OP15-085]"
      //
      // Chopper trashes itself first, so it is in the trash when the search
      // runs -- which is exactly why the printed text excludes its own name.
      // No `sourceActive`: the cost trashes Chopper rather than resting it, so
      // a Chopper that has already attacked can still pay it.
      "OP15-085",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Straw Hat Crew",
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "trash",
                      category: "character",
                      type: "Straw Hat Crew",
                      excludeName: "Tony Tony.Chopper",
                    },
                    bind: "op15-chopper-recur",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op15-chopper-recur",
                      to: { player: "self", zone: "hand" },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // OP15-019 Barrier Bulls: "[printed text omitted -- pnpm card:text OP15-019]"
      //
      // `expiresAfterTurns: 1` is that window, and it is the whole point of the
      // card: a +1000 that survives into the opponent's turn is defence, not a
      // push. `{ zone: [], includeLeader: true }` names the Leader alone.
      "OP15-019",
      {
        cost: 3,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "select",
                selector: { player: "self", zone: [], includeLeader: true },
                bind: "op15-barrier-leader",
                count: "all",
                effect: {
                  kind: "modify-power",
                  binding: "op15-barrier-leader",
                  amount: 1000,
                  expiresAfterTurns: 1,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-020 Fire Fist: "[printed text omitted -- pnpm card:text OP15-020]"
      //
      // Three clauses, and the third is what makes the second more than a
      // one-turn tempo play: −8000 that survives into the opponent's turn puts
      // most bodies at or below 0, and `maxCurrentPower: 0` is the K.O. that
      // collects them. `trashFromHand` declares the optional cost so the offer
      // can tell whether it is payable at all.
      "OP15-020",
      {
        cost: 7,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "select",
                selector: { player: "self", zone: [], includeLeader: true },
                bind: "op15-fire-fist-leader",
                count: "all",
                effect: {
                  kind: "modify-power",
                  binding: "op15-fire-fist-leader",
                  amount: 3000,
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
                bind: "op15-fire-fist-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op15-fire-fist-debuff",
                  amount: -8000,
                  expiresAfterTurns: 1,
                },
              },
              {
                kind: "optional",
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      // "As much as possible" (OP15-020#1): one card in hand is
                      // still trashed, but the K.O. needs both.
                      kind: "if",
                      condition: {
                        kind: "selector-count",
                        player: "self",
                        selector: { zone: "hand" },
                        operator: "gte",
                        value: 2,
                      },
                      then: {
                        kind: "choose",
                        selector: { player: "self", zone: "hand" },
                        bind: "op15-fire-fist-cost",
                        min: 2,
                        max: 2,
                        effect: {
                          kind: "sequence",
                          effects: [
                            {
                              kind: "move",
                              binding: "op15-fire-fist-cost",
                              to: { player: "self", zone: "trash" },
                            },
                            {
                              kind: "choose",
                              selector: {
                                player: "opponent",
                                zone: "board",
                                category: "character",
                                maxCurrentPower: 0,
                              },
                              bind: "op15-fire-fist-ko",
                              min: 0,
                              max: 1,
                              effect: {
                                kind: "knock-out",
                                binding: "op15-fire-fist-ko",
                              },
                            },
                          ],
                        },
                      },
                      else: {
                        kind: "choose",
                        selector: { player: "self", zone: "hand" },
                        bind: "op15-fire-fist-cost",
                        min: 1,
                        max: 1,
                        effect: {
                          kind: "move",
                          binding: "op15-fire-fist-cost",
                          to: { player: "self", zone: "trash" },
                        },
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
    [
      // OP15-021 "Just Watch Me, Ace!!!": "[printed text omitted -- pnpm card:text OP15-021]" Its printed
      // "[printed text omitted -- pnpm card:text OP15-021]" is a static cost layer.
      "OP15-021",
      { cost: 4, program: aceDebuff },
    ],
    [
      // OP15-056 "Would You Let Me Eat the Flame-Flame Fruit?": "[printed text omitted -- pnpm card:text OP15-056]"
      //
      // The Leader must actually be named [Lucy] -- OP15-002 -- so under any
      // other Leader this is a 7-cost draw two. Both halves land on the Leader,
      // which `{ zone: [], includeLeader: true }` is the handle for.
      "OP15-056",
      {
        cost: 7,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "if",
                condition: {
                  kind: "leader-has-name",
                  player: "self",
                  name: "Lucy",
                },
                then: {
                  kind: "select",
                  selector: { player: "self", zone: [], includeLeader: true },
                  bind: "op15-flame-leader",
                  count: "all",
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "grant-keyword",
                        binding: "op15-flame-leader",
                        keyword: "Double Attack",
                        expiresAfterTurns: 0,
                      },
                      {
                        kind: "modify-power",
                        binding: "op15-flame-leader",
                        amount: 3000,
                        expiresAfterTurns: 0,
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-095 Gum-Gum Storm: "[printed text omitted -- pnpm card:text OP15-095]"
      "OP15-095",
      {
        cost: 1,
        restDon: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "trash",
              operator: "gte",
              value: 15,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                includeLeader: true,
                type: "Straw Hat Crew",
              },
              bind: "op15-storm-buff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op15-storm-buff",
                amount: 3000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP15-116 Gum-Gum Golden Rifle: "[printed text omitted -- pnpm card:text OP15-116]"
      //
      // A Life swap that costs a card: the Life card trashed is known, the one
      // banked is not, and the hand discard is what pays for the look. Every
      // step sits inside the Leader check, which is where the printed sentence
      // puts them.
      "OP15-116",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Straw Hat Crew",
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "select",
                  selector: {
                    player: "self",
                    zone: "life",
                    position: "top",
                  },
                  bind: "op15-rifle-burn",
                  count: "all",
                  effect: {
                    kind: "move",
                    binding: "op15-rifle-burn",
                    to: { player: "self", zone: "trash" },
                  },
                },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "deck", position: "top" },
                  bind: "op15-rifle-bank",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op15-rifle-bank",
                    to: { player: "self", zone: "life", position: "top" },
                  },
                },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op15-rifle-discard",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op15-rifle-discard",
                    to: { player: "self", zone: "trash" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP15-037 "[printed text omitted -- pnpm card:text OP15-037]":
      // "[printed text omitted -- pnpm card:text OP15-037]"
      //
      // The self-exclusion is printed because the Event is itself {East Blue}:
      // without it the card would search up copies of itself.
      "OP15-037",
      {
        cost: 1,
        program: lookAndAdd(5, "op15-outcome-look", {
          type: "East Blue",
          excludeName: "The Outcome Will Tell Us Who's Strong and Who's Weak",
        }),
      },
    ],
    [
      // OP15-038 "It's an Order! Do Not Defy Me!!!": "[printed text omitted -- pnpm card:text OP15-038]"
      //
      // Three filters on one Character, and the DON!! one is what the rest of
      // the Green/East Blue package exists to satisfy. Its `[Counter]` half is
      // registered below.
      "OP15-038",
      {
        cost: 1,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
              maxCost: 8,
              minGivenDon: 2,
            },
            bind: "op15-order-lock",
            min: 0,
            max: 1,
            effect: {
              kind: "restrict",
              binding: "op15-order-lock",
              restriction: "cannot-refresh",
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // OP15-054 "And No One Else Can Have It! It's Our Memento of Him":
      // "[printed text omitted -- pnpm card:text OP15-054]"
      //
      // The Leader check gates the whole card, branches included -- under any
      // other Leader the Event is spent for nothing, which is what the printed
      // "If ... choose one" says.
      //
      // The second branch returns *any* Stage, either player's, so it is two
      // selectors' worth of candidates offered as one choice; written as a
      // `choice` of its own would be wrong, because the printed text is one
      // "up to 1 Stage".
      "OP15-054",
      {
        cost: 4,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Lucy",
            },
            then: {
              kind: "choice",
              branches: [
                {
                  id: "draw-and-play",
                  label:
                    "Draw 2, trash 1, then play a Dressrosa Character with a cost of 4 or less",
                  effect: {
                    kind: "sequence",
                    effects: [
                      { kind: "draw", player: "self", count: 2 },
                      {
                        kind: "choose",
                        selector: { player: "self", zone: "hand" },
                        bind: "op15-memento-discard",
                        min: 1,
                        max: 1,
                        effect: {
                          kind: "move",
                          binding: "op15-memento-discard",
                          to: { player: "self", zone: "trash" },
                        },
                      },
                      {
                        kind: "choose",
                        selector: {
                          player: "self",
                          zone: "hand",
                          category: "character",
                          type: "Dressrosa",
                          maxCost: 4,
                        },
                        bind: "op15-memento-play",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "play",
                          binding: "op15-memento-play",
                        },
                      },
                    ],
                  },
                },
                {
                  id: "bounce-stage",
                  label: "Return a Stage to its owner's hand",
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "choose",
                        selector: { player: "self", zone: "stage" },
                        bind: "op15-memento-own-stage",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "move",
                          binding: "op15-memento-own-stage",
                          to: { player: "self", zone: "hand" },
                        },
                      },
                      {
                        kind: "choose",
                        selector: { player: "opponent", zone: "stage" },
                        bind: "op15-memento-their-stage",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "move",
                          binding: "op15-memento-their-stage",
                          to: { player: "opponent", zone: "hand" },
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
    ],
    [
      // OP15-055 "Go Ahead and Use 'Em, Mr. Luffy!!!": "[printed text omitted -- pnpm card:text OP15-055]"
      //
      // A real either/or, which is what `choice` is for: chaining two
      // `optional`s would let a player take both halves.
      "OP15-055",
      {
        cost: 3,
        program: {
          effect: {
            kind: "choice",
            branches: [
              {
                id: "draw",
                label: "Draw 2 cards",
                effect: { kind: "draw", player: "self", count: 2 },
              },
              {
                id: "blocker",
                label: "Give a Dressrosa Character [Blocker]",
                effect: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    type: "Dressrosa",
                  },
                  bind: "op15-mr-luffy-blocker",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "grant-keyword",
                    binding: "op15-mr-luffy-blocker",
                    keyword: "Blocker",
                    expiresAfterTurns: 1,
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-096 "Swallow Bond en Avant": "[printed text omitted -- pnpm card:text OP15-096]"
      //
      // A 0-cost Event whose only cost is the rested DON!!, declared as
      // `restDon` so the offer can check it is payable. Black pays a DON!! to
      // dig its own graveyard, which is the resource its payoffs read.
      "OP15-096",
      {
        cost: 0,
        restDon: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Straw Hat Crew",
            },
            then: { kind: "trash-top", player: "self", count: 5 },
          },
        },
      },
    ],
    [
      // OP15-097 "I Find It Embarrassing as a Human Being", shared with its
      // `[Trigger]` in `op15-triggers.ts`.
      "OP15-097",
      { cost: 1, program: embarrassingLock },
    ],
    [
      // OP15-115 Impact Dial: "[printed text omitted -- pnpm card:text OP15-115]"
      //
      // The Life card is not a cost -- it comes after the K.O. and is
      // mandatory -- so this is a `sequence`, not `lifeToHandCost`. Yellow
      // spending Life to turn on its own behind-only payoffs.
      "OP15-115",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              impactDialKo,
              {
                kind: "choose",
                selector: { player: "self", zone: "life", position: "edge" },
                bind: "op15-impact-dial-life",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op15-impact-dial-life",
                  to: { player: "self", zone: "hand" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-117 "Heso!!": "[printed text omitted -- pnpm card:text OP15-117]"
      //
      // `give-rested-don`'s `type` filter restricts both halves of the printed
      // "Leader or Character", which is exactly what it was added for.
      "OP15-117",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "give-rested-don",
                player: "self",
                count: 1,
                type: "Sky Island",
              },
            ],
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP15-021 "Just Watch Me, Ace!!!": the same debuff on the `[Counter]`
      // side. `power: 0` because it adds no Counter power at all -- what it does
      // is shrink the attacker, which the program half does.
      "OP15-021",
      { cost: 4, power: 0, program: aceDebuff },
    ],
    [
      // OP15-095 Gum-Gum Storm: "[printed text omitted -- pnpm card:text OP15-095]"
      //
      // `power: 0` with the whole buff in the program, because the printed
      // clause is conditional: a fixed `power` would promise the defender 4000
      // in the offer summary that a shallow trash will not deliver.
      "OP15-095",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "trash",
              operator: "gte",
              value: 15,
            },
            then: { kind: "battle-power", player: "self", amount: 4000 },
          },
        },
      },
    ],
    [
      // OP15-116 Gum-Gum Golden Rifle: "[printed text omitted -- pnpm card:text OP15-116]" Unconditional, so it is a plain `power` with the
      // Leader filter -- against a blocking Character it correctly adds nothing.
      "OP15-116",
      { cost: 1, power: 4000, target: { isLeader: true } },
    ],
    [
      // OP15-038 "It's an Order! Do Not Defy Me!!!": "[printed text omitted -- pnpm card:text OP15-038]"
      //
      // The name filter is what makes it a Krieg card rather than a generic
      // Counter: against a battle whose defender is not a [Krieg], the offer and
      // the resolution both read 0, so nothing promises power it will not add.
      "OP15-038",
      { cost: 1, power: 4000, target: { name: "Krieg" } },
    ],
    [
      // OP15-096 "Swallow Bond en Avant": "[printed text omitted -- pnpm card:text OP15-096]"
      //
      // `power: 0` because the buff is conditional on a cost the player may
      // decline -- the offer must not promise power the resolution will not
      // add, so all of it lands in the program.
      "OP15-096",
      {
        cost: 0,
        power: 0,
        program: trashForBattlePower(3000, "op15-swallow-counter"),
      },
    ],
  ],
};
