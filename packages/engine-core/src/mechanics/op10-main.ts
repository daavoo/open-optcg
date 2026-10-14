/**
 * OP10 `[Main]` Events and `[Activate: Main]` abilities.
 *
 * Two clause tables rather than two files, the split OP14-OP17 use: both are
 * main-phase activations the player goes looking for, and the difference is only
 * whether the source is an Event in hand or a card on the field.
 */
import {
  SOURCE_BINDING,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  millTwo,
  opponentDiscardsAtFive,
  restSelfAndDressrosaLeaderOrStage,
} from "./op10-shared.js";
import { lookAndAdd, peekLife } from "./shared.js";

/** "Up to 1 of your Leader or Character cards" -- OP10's Red/Purple buff target. */
const ownLeaderOrCharacter = {
  player: "self",
  zone: "board",
  includeLeader: true,
} as const;

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 * -- the Green removal template OP10-040 and OP10-041 share, and the second half
 * of OP10-024.
 */
const koRestedUpToCost = (cost: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    rested: true,
    maxCost: cost,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});

/**
 * The `[Main]` programs of the two OP10 Events whose `[Trigger]` reads "[printed text omitted -- pnpm card:text <card>]", so `op10-triggers.ts` can point at the same
 * program rather than restate it. Keyed by card number for the same reason the
 * registry is.
 */
export const op10EventPrograms: Record<string, MechanicProgram> = {
  // OP10-059 Fo...llow...Me...and...I...Will...Gui...de...You: "[printed text omitted -- pnpm card:text OP10-059]"
  "OP10-059": lookAndAdd(5, "op10-follow-look", {
    type: "Dressrosa",
    category: "character",
  }),
  // OP10-060 Barrier-Barrier Pistol: "[printed text omitted -- pnpm card:text OP10-060]"
  //
  // Current power, so a body pumped past 6000 for the turn is out of reach --
  // and the bottom of the deck, which no recursion answers.
  "OP10-060": {
    effect: {
      kind: "choose",
      selector: {
        player: "opponent",
        zone: "board",
        category: "character",
        maxCurrentPower: 6_000,
      },
      bind: "op10-barrier-bury",
      min: 0,
      max: 1,
      effect: {
        kind: "move",
        binding: "op10-barrier-bury",
        to: { player: "owner", zone: "deck", position: "bottom" },
      },
    },
  },
};

export const op10MainMechanics: SetMechanics = {
  activateMain: [
    [
      // OP10-114 X.Drake: `pnpm card:text OP10-114`.
      //
      // Migrated off the hand-written activation register in
      // `legal-actions/main/activations.ts`.
      //
      // The Life comparison is the program's outermost `if`, so a seat that is
      // ahead on Life is never offered a rest that resolves to nothing --
      // `bareGateCondition` reads exactly this shape. `canRest` is what keeps a
      // Character the opponent has protected off the target list, and the rest
      // is a `rest` node rather than `update` so OP10-036 Perona's refund sees
      // it.
      "OP10-114",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "if",
            condition: { kind: "life-versus", player: "self", operator: "lte" },
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
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 4,
                    rested: false,
                    canRest: true,
                  },
                  bind: "op10-drake-rest",
                  min: 0,
                  max: 1,
                  effect: { kind: "rest", binding: "op10-drake-rest" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP10-001 Smoker (Leader): "[printed text omitted -- pnpm card:text OP10-001]"
      //
      // `restedDon: 1` is what keeps the once-per-turn use from being spent on a
      // board with nothing rested to set active. Current power, not printed: the
      // Leader's own `[Opponent's Turn]` aura and any DON!! given both count
      // toward the 7000, which is what a Punk Hazard board reaches it with.
      "OP10-001",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                minCurrentPower: 7_000,
              },
              operator: "gte",
              value: 1,
            },
            then: { kind: "activate-don", player: "self", count: 2 },
          },
        },
      },
    ],
    [
      // OP10-022 Trafalgar Law (Leader): "[printed text omitted -- pnpm card:text OP10-022]"
      //
      // The gate is one `all-of` so `bareGateCondition` reads all of it: a turn
      // without the DON!! or without five cost on the board must not spend the
      // once-per-turn use. `selector-cost-total` is the sum, which no count can
      // express.
      //
      // The Life card is revealed and then *played out of the Life zone* -- so
      // the second `choose` selects over `zone: "life"` restricted to the card
      // the reveal bound. A card that is not a cheap Supernova simply stays where
      // it is, face-up, which is what the printed text leaves behind.
      "OP10-022",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "source-attached-don", operator: "gte", value: 1 },
                {
                  kind: "selector-cost-total",
                  player: "self",
                  selector: { zone: "board", category: "character" },
                  operator: "gte",
                  value: 5,
                },
              ],
            },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                },
                bind: "op10-law-leader-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op10-law-leader-cost",
                      to: { player: "owner", zone: "hand" },
                    },
                    {
                      kind: "select",
                      selector: {
                        player: "self",
                        zone: "life",
                        position: "top",
                      },
                      bind: "op10-law-leader-life",
                      count: 1,
                      effect: {
                        kind: "sequence",
                        effects: [
                          { kind: "reveal", binding: "op10-law-leader-life" },
                          {
                            kind: "choose",
                            selector: {
                              player: "self",
                              zone: "life",
                              binding: "op10-law-leader-life",
                              category: "character",
                              type: "Supernovas",
                              maxCost: 5,
                            },
                            bind: "op10-law-leader-play",
                            min: 0,
                            max: 1,
                            effect: {
                              kind: "play",
                              binding: "op10-law-leader-play",
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
      },
    ],
    [
      // OP10-030 Smoker: "[printed text omitted -- pnpm card:text OP10-030]"
      //
      // The restriction is the price, and it is written *after* the DON!! is set
      // active so this use is not blocked by it. `donActivationAllowed` keeps the
      // activation off the table once the ban is up, which matters because the
      // ability is not `[Once Per Turn]`: without it a repeatable action that
      // provably does nothing stays on offer all turn.
      "OP10-030",
      {
        oncePerTurn: false,
        requires: { restedDon: 1, donActivationAllowed: true },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "activate-don", player: "self", count: 1 },
              {
                kind: "restrict-player",
                player: "self",
                restriction: "cannot-activate-don-by-character",
                expiresAfterTurns: 0,
              },
            ],
          },
        },
      },
    ],
    [
      // OP10-016 Monet: "[printed text omitted -- pnpm card:text OP10-016]"
      //
      // The debuff is not conditional on the DON!! having moved, so it is
      // sequenced after rather than nested: a player with no rested DON!! still
      // rests Monet and still gets the −1000.
      "OP10-016",
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
                { kind: "give-rested-don", player: "self", count: 2 },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op10-monet-debuff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op10-monet-debuff",
                    amount: -1_000,
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
      // OP10-021 Punk Hazard (Stage): "[printed text omitted -- pnpm card:text OP10-021]"
      //
      // `restedDon: 1` for the same reason Smoker's activation carries it: with
      // nothing rested the Stage would rest itself for nothing, and a Stage rests
      // once.
      "OP10-021",
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
                  kind: "if",
                  condition: {
                    kind: "leader-has-name",
                    player: "self",
                    name: "Caesar Clown",
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
      // OP10-026 Kin'emon: "[printed text omitted -- pnpm card:text OP10-026]"
      //
      // The 2-cost pair (OP10-026 at 1000 power and OP10-027 at 0) exists to
      // assemble the 6-cost Kin'emon: each names the other by printed power, so
      // the two costs cannot be paid with two copies of the same body. Printed
      // power, hence `minPower`/`maxPower` -- a power *modifier* does not make a
      // Kin'emon into the other one.
      "OP10-026",
      {
        oncePerTurn: false,
        requires: {
          handCardsMatching: {
            match: { name: "Kin'emon", minBaseCost: 6, maxBaseCost: 6 },
            count: 1,
          },
        },
        program: kinemonAssembly(0, "op10-kinemon-026"),
      },
    ],
    [
      // OP10-027 Kin'emon: the mirror, naming the 1000-power printing.
      "OP10-027",
      {
        oncePerTurn: false,
        requires: {
          handCardsMatching: {
            match: { name: "Kin'emon", minBaseCost: 6, maxBaseCost: 6 },
            count: 1,
          },
        },
        program: kinemonAssembly(1_000, "op10-kinemon-027"),
      },
    ],
    [
      // OP10-028 Kouzuki Momonosuke: "[printed text omitted -- pnpm card:text OP10-028]"
      //
      // The DON!! is rested rather than returned, so it comes back next Refresh:
      // a 1-cost body that turns two DON!! and itself into two Akazaya cards.
      "OP10-028",
      {
        oncePerTurn: false,
        requires: { activeDon: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 2 },
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                lookAndAdd(
                  5,
                  "op10-momonosuke-look",
                  { type: "The Akazaya Nine" },
                  2,
                ).effect,
              ],
            },
          },
        },
      },
    ],
    [
      // OP10-075 Foxy: "[printed text omitted -- pnpm card:text OP10-075]"
      //
      // The trash is paid before the condition is read, which is what the printed
      // order says -- a Foxy trashed on a turn the player is ahead on DON!! draws
      // nothing. That is a real cost of playing it, not a bug.
      "OP10-075",
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
                    kind: "field-don-versus",
                    player: "self",
                    operator: "lte",
                  },
                  then: { kind: "draw", player: "self", count: 1 },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP10-082 Kuzan: "[printed text omitted -- pnpm card:text OP10-082]"
      //
      // Kuzan is in the trash by the time the recursion runs, so "other than
      // [Kuzan]" is doing real work: without `excludeName` the card would play
      // itself back for free. Its "[printed text omitted -- pnpm card:text OP10-082]" half is a static ability, in `static-abilities.ts`.
      "OP10-082",
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
                { kind: "draw", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "trash",
                    category: "character",
                    type: "Blackbeard Pirates",
                    maxCost: 5,
                    excludeName: "Kuzan",
                  },
                  bind: "op10-kuzan-recur",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "op10-kuzan-recur" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP10-083 Kouzuki Momonosuke: "[printed text omitted -- pnpm card:text OP10-083]"
      //
      // Cost, not power: −2 cost is what puts a body inside the reach of the
      // package's own "cost N or less" K.O.s, which is what the clause is for.
      "OP10-083",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: restSelfAndDressrosaLeaderOrStage("op10-momo-cost", {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op10-momo-target",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-cost",
            binding: "op10-momo-target",
            amount: -2,
            expiresAfterTurns: 0,
          },
        }),
      },
    ],
    [
      // OP10-086 Shiryu: "[printed text omitted -- pnpm card:text OP10-086]"
      //
      // Written as one `all-of` rather than two nested `if`s so `bareGateCondition`
      // can read the whole gate: a turn where either half is false must not offer
      // -- and therefore must not spend -- the once-per-turn use.
      "OP10-086",
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
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxBaseCost: 3,
              },
              bind: "op10-shiryu-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op10-shiryu-ko" },
            },
          },
        },
      },
    ],
    [
      // OP10-087 Tony Tony.Chopper: "[printed text omitted -- pnpm card:text OP10-087]"
      //
      // The card leaves their hand, so they pick it -- `chooser: "opponent"`,
      // the rule for anything discarded out of a hand.
      "OP10-087",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: restSelfAndDressrosaLeaderOrStage("op10-chopper-cost", {
          kind: "sequence",
          effects: [opponentDiscardsAtFive("op10-chopper-discard"), millTwo],
        }),
      },
    ],
    [
      // OP10-088 Nami: the same cost, for "[printed text omitted -- pnpm card:text OP10-088]"
      "OP10-088",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: restSelfAndDressrosaLeaderOrStage("op10-nami-cost", {
          kind: "sequence",
          effects: [{ kind: "draw", player: "self", count: 1 }, millTwo],
        }),
      },
    ],
    [
      // OP10-091 Brook: the same cost, for "[printed text omitted -- pnpm card:text OP10-091]"
      "OP10-091",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: restSelfAndDressrosaLeaderOrStage("op10-brook-cost", {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 1,
              },
              bind: "op10-brook-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op10-brook-ko" },
            },
            millTwo,
          ],
        }),
      },
    ],
    [
      // OP10-092 Perona: "[printed text omitted -- pnpm card:text OP10-092]"
      //
      // The cost is paid out of the trash, so the deck it refills is the resource
      // the rest of Thriller Bark spends. "Other than [Perona]" excludes every
      // Perona on the board, not only this instance -- `excludeName` is the name
      // filter, which is what the printed bracket means.
      "OP10-092",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                type: "Thriller Bark Pirates",
              },
              bind: "op10-perona-cost",
              min: 2,
              max: 2,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op10-perona-cost",
                    to: { player: "self", zone: "deck", position: "bottom" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      excludeName: "Perona",
                    },
                    bind: "op10-perona-buff",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-power",
                      binding: "op10-perona-buff",
                      amount: 2_000,
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
      // OP10-093 Saint Homing: "[printed text omitted -- pnpm card:text OP10-093]"
      //
      // +3 cost is protection, not a buff: it lifts a body out of the reach of
      // "cost N or less" removal, and it lasts through the opponent's next turn
      // rather than only this one -- `expiresAfterTurns: 1`.
      "OP10-093",
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
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    color: "Black",
                  },
                  bind: "op10-homing-target",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-cost",
                    binding: "op10-homing-target",
                    amount: 3,
                    expiresAfterTurns: 1,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP10-102 Emporio.Ivankov: "[printed text omitted -- pnpm card:text OP10-102]"
      //
      // The Life card is not a cost -- it comes after, and it is mandatory --
      // which is Yellow's whole shape: the payoff spends Life and the Life is
      // what the deck's other cards read.
      "OP10-102",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "Revolutionary Army",
                },
                bind: "op10-ivankov-buff",
                min: 0,
                max: 3,
                effect: {
                  kind: "modify-power",
                  binding: "op10-ivankov-buff",
                  amount: 1_000,
                  expiresAfterTurns: 0,
                },
              },
              {
                kind: "select",
                selector: { player: "self", zone: "life", position: "top" },
                bind: "op10-ivankov-life",
                count: 1,
                effect: {
                  kind: "move",
                  binding: "op10-ivankov-life",
                  to: { player: "self", zone: "hand" },
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
      // OP10-019 Divine Departure (1): "[printed text omitted -- pnpm card:text OP10-019]"
      //
      // `restDon: 5` is declared on the offer rather than left inside the
      // program: the rest is the whole price of a 1-cost card that answers an
      // 8000 body, and an Event offered without it would hand the K.O. over for
      // free. Its `[Counter]` half is in `op10-battle.ts`.
      "OP10-019",
      {
        cost: 1,
        restDon: 5,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 8_000,
            },
            bind: "op10-divine-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op10-divine-ko" },
          },
        },
      },
    ],
    [
      // OP10-020 Gum-Gum UFO (2): "[printed text omitted -- pnpm card:text OP10-020]"
      "OP10-020",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "op10-ufo-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op10-ufo-debuff",
                  amount: -4_000,
                  expiresAfterTurns: 0,
                },
              },
              {
                kind: "if",
                condition: {
                  kind: "zone-count",
                  player: "self",
                  zone: "life",
                  operator: "lte",
                  value: 2,
                },
                then: {
                  kind: "choose",
                  selector: ownLeaderOrCharacter,
                  bind: "op10-ufo-buff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op10-ufo-buff",
                    amount: 1_000,
                    expiresAfterTurns: 0,
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP10-039 Gum-Gum Dragon Fire Pistol Twister Star (3): "[printed text omitted -- pnpm card:text OP10-039]"
      "OP10-039",
      {
        cost: 3,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "ODYSSEY",
            },
            then: lookAndAdd(
              5,
              "op10-twister-look",
              { type: "ODYSSEY", category: "character" },
              2,
            ).effect,
          },
        },
      },
    ],
    [
      // OP10-040 The Weak Do Not Have the Right to Choose How They Die (5):
      // "[printed text omitted -- pnpm card:text OP10-040]" Both halves run the same program; the `[Counter]`
      // entry is in `op10-battle.ts`.
      "OP10-040",
      {
        cost: 5,
        program: { effect: koRestedUpToCost(7, "op10-weak-ko") },
      },
    ],
    [
      // OP10-041 Radio Knife (4): "[printed text omitted -- pnpm card:text OP10-041]"
      //
      // The rest feeds the K.O., which is why the two are printed in this order
      // and why they resolve in it.
      "OP10-041",
      {
        cost: 4,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 6,
                  canRest: true,
                },
                bind: "op10-radio-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "op10-radio-rest" },
              },
              koRestedUpToCost(5, "op10-radio-ko"),
            ],
          },
        },
      },
    ],
    [
      // OP10-059 Fo...llow...Me...and...I...Will...Gui...de...You (1): "[printed text omitted -- pnpm card:text OP10-059]"
      "OP10-059",
      { cost: 1, program: op10EventPrograms["OP10-059"]! },
    ],
    [
      // OP10-060 Barrier-Barrier Pistol (5): "[printed text omitted -- pnpm card:text OP10-060]"
      //
      // Current power, so a body pumped past 6000 for the turn is out of reach --
      // and the bottom of the deck, which no recursion answers.
      "OP10-060",
      { cost: 5, program: op10EventPrograms["OP10-060"]! },
    ],
    [
      // OP10-061 Special Long-Range Attack!! Bagworm (3): "[printed text omitted -- pnpm card:text OP10-061]"
      "OP10-061",
      {
        cost: 3,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 2,
                },
                bind: "op10-bagworm-bounce",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op10-bagworm-bounce",
                  to: { player: "owner", zone: "hand" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP10-078 I Do Not Forgive Those Who Laugh at My Family!!! (1):
      // "[printed text omitted -- pnpm card:text OP10-078]"
      //
      // The exclusion is of its own name: a Counter that only ever finds another
      // copy of itself is not a Counter.
      "OP10-078",
      {
        cost: 1,
        program: lookAndAdd(3, "op10-forgive-look", {
          type: "Donquixote Pirates",
          excludeName: "I Do Not Forgive Those Who Laugh at My Family!!!",
        }),
      },
    ],
    [
      // OP10-079 God Thread (5): "[printed text omitted -- pnpm card:text OP10-079]"
      //
      // The DON!! comes back after the K.O., which is what makes a 5-cost removal
      // Event cost 4 on the turn it is played.
      "OP10-079",
      {
        cost: 5,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                },
                bind: "op10-god-thread-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op10-god-thread-ko" },
              },
              { kind: "add-don", player: "self", count: 1, rested: false },
            ],
          },
        },
      },
    ],
    [
      // OP10-096 There's No Longer Any Need for the Seven Warlords of the
      // Sea!!! (4): "[printed text omitted -- pnpm card:text OP10-096]"
      "OP10-096",
      {
        cost: 4,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              type: "The Seven Warlords of the Sea",
              maxCost: 8,
            },
            bind: "op10-warlords-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op10-warlords-ko" },
          },
        },
      },
    ],
    [
      // OP10-097 Gum-Gum Rhino Schneider (1): "[printed text omitted -- pnpm card:text OP10-097]"
      //
      // "That card" is the one the buff landed on, so both effects hang off the
      // same binding. The trash threshold is what the package's own self-mill is
      // for: ten cards deep, a 1-cost Event turns a Dressrosa body into a card
      // the opponent cannot trade Life for hand against.
      "OP10-097",
      {
        cost: 1,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "Dressrosa",
            },
            bind: "op10-rhino-target",
            min: 0,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "modify-power",
                  binding: "op10-rhino-target",
                  amount: 2_000,
                  expiresAfterTurns: 0,
                },
                {
                  kind: "if",
                  condition: {
                    kind: "zone-count",
                    player: "self",
                    zone: "trash",
                    operator: "gte",
                    value: 10,
                  },
                  then: {
                    kind: "grant-keyword",
                    binding: "op10-rhino-target",
                    keyword: "Banish",
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
      // OP10-116 Damned Punk (4): "[printed text omitted -- pnpm card:text OP10-116]"
      //
      // Two decisions in the first half -- whose Life, and which end it goes back
      // to -- so it is a `choice` of a `choice`. Looking is a private reveal (see
      // `look-at`'s `zone`), and the card is put back rather than taken: what the
      // clause buys is knowing what the next hit turns over, and being able to
      // bury a Trigger the opponent was about to get.
      "OP10-116",
      {
        cost: 4,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choice",
                branches: [
                  {
                    id: "own-life",
                    label: "Look at the top card of your Life cards",
                    effect: peekLife("self", "op10-damned-own"),
                  },
                  {
                    id: "opponent-life",
                    label: "Look at the top card of your opponent's Life cards",
                    effect: peekLife("opponent", "op10-damned-theirs"),
                  },
                ],
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                },
                bind: "op10-damned-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op10-damned-ko" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP10-098 Liberation (6): "[printed text omitted -- pnpm card:text OP10-098]"
      //
      // A comeback card, gated on being two bodies behind -- see
      // `character-count-versus`'s `by`. Two separate "up to 1"s rather than one
      // choice of two, because the two ceilings differ.
      "OP10-098",
      {
        cost: 6,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "character-count-versus",
              player: "self",
              operator: "lt",
              by: 2,
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
                    maxBaseCost: 6,
                  },
                  bind: "op10-liberation-ko-six",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "knock-out",
                    binding: "op10-liberation-ko-six",
                  },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxBaseCost: 4,
                  },
                  bind: "op10-liberation-ko-four",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "knock-out",
                    binding: "op10-liberation-ko-four",
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

/**
 * OP10-026 and OP10-027 Kin'emon: "[printed text omitted -- pnpm card:text OP10-027]"
 *
 * One shape, two printings, differing only in the power of the Kin'emon the cost
 * names. Both moves are nested inside the cost's `choose`, so a trash with no
 * matching Kin'emon in it cannot pay -- and the 6-cost body is never played for
 * free.
 */
function kinemonAssembly(
  trashPower: number,
  bind: string,
): { effect: MechanicEffect } {
  return {
    effect: {
      kind: "optional",
      effect: {
        kind: "choose",
        selector: {
          player: "self",
          zone: "trash",
          name: "Kin'emon",
          minPower: trashPower,
          maxPower: trashPower,
        },
        bind,
        min: 1,
        max: 1,
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "move",
              binding: SOURCE_BINDING,
              to: { player: "self", zone: "deck", position: "bottom" },
            },
            {
              kind: "move",
              binding: bind,
              to: { player: "self", zone: "deck", position: "bottom" },
            },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                name: "Kin'emon",
                minBaseCost: 6,
                maxBaseCost: 6,
              },
              bind: `${bind}-play`,
              min: 0,
              max: 1,
              effect: { kind: "play", binding: `${bind}-play` },
            },
          ],
        },
      },
    },
  };
}
