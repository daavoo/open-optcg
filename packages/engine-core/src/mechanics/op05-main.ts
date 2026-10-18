/**
 * OP05 `[Main]` Events and `[Activate: Main]` abilities.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP05-0xx` prints it from the local cache).
 *
 * OP05-077 Gamma Knife was in the pool before the set was, played by the Enel
 * deck; its `[Main]` stays in `op16-enel.ts`.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lifeToHandCost, lookAndAdd, payFromHand } from "./shared.js";
import {
  costDebuff,
  koCostAtMost,
  playFromHand,
  powerDebuff,
} from "./op08-shared.js";
import {
  buffOwnCardForTurn,
  buryCostAtMost,
  lifeAtMost,
  restCostAtMost,
} from "./op07-shared.js";
import {
  blackCharacterFromTrash,
  bounceEitherCostAtMost,
  koCostAtMostOpponentLife,
  koPowerAtMost,
  koRestedCostAtMost,
  multicoloredLeader,
  opponentCharacterToLife,
  restAndBuryTwoFromTrash,
  revolutionaryArmyBody,
  sourceAtLeast7000,
  sourceHasDon,
} from "./op05-shared.js";

/** "You may trash this Character: <effect>" -- OP05-027, OP05-028, OP05-081. */
const trashSelfFor = (effect: MechanicEffect): MechanicEffect => ({
  kind: "sequence",
  effects: [
    {
      kind: "move",
      binding: SOURCE_BINDING,
      to: { player: "self", zone: "trash" },
    },
    effect,
  ],
});

/**
 * "➀ You may rest this Character: <effect>" -- the Donquixote Pirates' two
 * Baby 5s (OP05-033, OP05-034). One DON!! rested and the body rested, then the
 * payoff; the offer's `requires` is what guarantees both halves are payable.
 */
const restDonAndSelfFor = (effect: MechanicEffect): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "rest-don", player: "self", count: 1 },
    { kind: "rest", binding: SOURCE_BINDING },
    effect,
  ],
});

/**
 * OP05-019 Fire Fist: −4000 on one Character, then at two or fewer Life a K.O.
 * of anything at 0 -- which after the debuff is a 4000 body. Its `[Trigger]`
 * re-runs the same program.
 */
export const fireFist: MechanicEffect = {
  kind: "sequence",
  effects: [
    powerDebuff(4_000, "op05-fire-fist-debuff"),
    {
      kind: "if",
      condition: lifeAtMost(2),
      then: koPowerAtMost(0, "op05-fire-fist-ko"),
    },
  ],
};

/**
 * OP05-076 When You're at Sea You Fight against Pirates!!: a three-deep dig for
 * any of the Purple Wano package's three crews. Its `[Trigger]` is the same.
 */
export const wanoSearch = lookAndAdd(3, "op05-wano-look", {
  anyOf: [
    { type: "Straw Hat Crew" },
    { type: "Kid Pirates" },
    { type: "Heart Pirates" },
  ],
});

/** OP05-116 Hino Bird Zap: the Sky Island removal alone; its Trigger re-runs it. */
export const hinoBirdZap: MechanicEffect =
  koCostAtMostOpponentLife("op05-hino-bird-ko");

export const op05MainMechanics: SetMechanics = {
  eventMain: [
    ["OP05-019", { cost: 2, program: { effect: fireFist } }],
    [
      // OP05-020 Four Thousand-Brick Fist: +2000 on one of the controller's
      // cards for the turn, then a K.O. at 2000 current power.
      "OP05-020",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              buffOwnCardForTurn(2_000, "op05-brick-fist-buff"),
              koPowerAtMost(2_000, "op05-brick-fist-ko"),
            ],
          },
        },
      },
    ],
    [
      // OP05-057 Hound Blaze: +3000 for the turn, then a cost-2 bury on either
      // side.
      "OP05-057",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              buffOwnCardForTurn(3_000, "op05-hound-blaze-buff"),
              buryCostAtMost(2, "op05-hound-blaze-bury"),
            ],
          },
        },
      },
    ],
    [
      // OP05-058 It's a Waste of Human Life!!: every cost-3-or-less Character on
      // *both* boards under its owner's deck, then both hands trimmed to five.
      // The bury is a `select` -- "all" leaves nothing to choose -- and each
      // player picks their own discards.
      "OP05-058",
      {
        cost: 8,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "select",
                selector: {
                  player: "either",
                  zone: "board",
                  category: "character",
                  maxCost: 3,
                },
                bind: "op05-waste-bury",
                count: "all",
                effect: {
                  kind: "order-to-bottom",
                  binding: "op05-waste-bury",
                  byOwner: true,
                  to: { player: "owner", zone: "deck", position: "bottom" },
                },
              },
              { kind: "trash-hand-down-to", player: "self", size: 5 },
              { kind: "trash-hand-down-to", player: "opponent", size: 5 },
            ],
          },
        },
      },
    ],
    [
      // OP05-059 Let Us Begin the World of Violence!!!: a card behind a
      // multicolour Leader, then a cost-5 bounce on either side.
      "OP05-059",
      {
        cost: 5,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "if",
                condition: multicoloredLeader,
                then: { kind: "draw", player: "self", count: 1 },
              },
              bounceEitherCostAtMost(5, "op05-violence-bounce"),
            ],
          },
        },
      },
    ],
    ["OP05-076", { cost: 1, program: wanoSearch }],
    [
      // OP05-078 Punk Rotten: `DON!! −1` for +5000 on a Kid Pirates card, Leader
      // included. The `DON!! −1` is declared on the entry, which is how the
      // offer knows the price.
      "OP05-078",
      {
        cost: 2,
        donMinus: 1,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              type: "Kid Pirates",
            },
            bind: "op05-punk-rotten-buff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op05-punk-rotten-buff",
              amount: 5_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP05-094 Haute Couture Patch★Work: −3 cost on one Character, then a
      // Character already at cost 0 held down through its next Refresh Phase.
      // The second target is read *after* the first resolves, so the card the
      // debuff just took to 0 is a legal answer -- which is the play.
      "OP05-094",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              costDebuff(3, "op05-patchwork-debuff"),
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 0,
                },
                bind: "op05-patchwork-lock",
                min: 0,
                max: 1,
                effect: {
                  kind: "restrict",
                  binding: "op05-patchwork-lock",
                  restriction: "cannot-refresh",
                  expiresAfterTurns: 1,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP05-096 I Bid 500 Million!!: one of three answers to a cost-1 body --
      // K.O., bounce, or into the opponent's Life face-up -- then a card beside
      // a {Celestial Dragons} Character.
      "OP05-096",
      {
        cost: 3,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choice",
                branches: [
                  {
                    id: "ko",
                    label: "K.O. a Character with a cost of 1 or less",
                    effect: koCostAtMost(1, "op05-bid-ko"),
                  },
                  {
                    id: "bounce",
                    label:
                      "Return a Character with a cost of 1 or less to hand",
                    effect: {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                        maxCost: 1,
                      },
                      bind: "op05-bid-bounce",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "op05-bid-bounce",
                        to: { player: "owner", zone: "hand" },
                      },
                    },
                  },
                  {
                    id: "life",
                    label:
                      "Place a Character with a cost of 1 or less into their Life face-up",
                    effect: opponentCharacterToLife(1, "op05-bid-life"),
                  },
                ],
              },
              {
                kind: "if",
                condition: {
                  kind: "selector-count",
                  player: "self",
                  selector: {
                    zone: "board",
                    category: "character",
                    type: "Celestial Dragons",
                  },
                  operator: "gte",
                  value: 1,
                },
                then: { kind: "draw", player: "self", count: 1 },
              },
            ],
          },
        },
      },
    ],
    [
      // OP05-115 Two-Hundred Million Volts Amaru: +3000 for the turn, and at one
      // Life or less a cost-4 rest.
      "OP05-115",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              buffOwnCardForTurn(3_000, "op05-amaru-buff"),
              {
                kind: "if",
                condition: lifeAtMost(1),
                then: restCostAtMost(4, "op05-amaru-rest"),
              },
            ],
          },
        },
      },
    ],
    ["OP05-116", { cost: 2, program: { effect: hinoBirdZap } }],
  ],
  activateMain: [
    [
      // OP05-002 Belo Betty (Leader): a Revolutionary Army card from hand buys
      // +3000 on up to three of the controller's Characters that are either
      // Revolutionary Army or carry a [Trigger] -- a disjunction across identity
      // and the Trigger box, which is what `anyOf.hasTrigger` is for.
      "OP05-002",
      {
        oncePerTurn: true,
        requires: {
          handCardsMatching: {
            match: { type: "Revolutionary Army" },
            count: 1,
          },
        },
        program: {
          effect: payFromHand(
            { player: "self", zone: "hand", type: "Revolutionary Army" },
            "op05-betty-leader-cost",
            1,
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                anyOf: [{ type: "Revolutionary Army" }, { hasTrigger: true }],
              },
              bind: "op05-betty-leader-buff",
              min: 0,
              max: 3,
              effect: {
                kind: "modify-power",
                binding: "op05-betty-leader-buff",
                amount: 3_000,
                expiresAfterTurns: 0,
              },
            },
          ),
        },
      },
    ],
    [
      // OP05-004 Emporio.Ivankov: at 7000 or more -- three DON!! on a 4-cost --
      // a small Revolutionary Army body out of hand for free, other than another
      // Ivankov. The gate is the program's outermost `if`, which is what keeps
      // the `[Once Per Turn]` from being offered, and spent, on a 5000.
      "OP05-004",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: sourceAtLeast7000,
            then: playFromHand(
              { ...revolutionaryArmyBody, excludeName: "Emporio.Ivankov" },
              "op05-ivankov-play",
            ),
          },
        },
      },
    ],
    [
      // OP05-008 Chaka: with a DON!! on it, up to two rested DON!! onto the
      // Leader or one Character. `restedDon` gates the offer so it is never
      // taken on a field with nothing to give.
      "OP05-008",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "if",
            condition: sourceHasDon,
            then: { kind: "give-rested-don", player: "self", count: 2 },
          },
        },
      },
    ],
    [
      // OP05-021 Revolutionary Army HQ (Stage): a hand card and its own rest for
      // a three-deep look. `sourceActive` in place of `[Once Per Turn]`: the
      // Stage rests to pay, so it cannot be asked twice.
      "OP05-021",
      {
        oncePerTurn: false,
        requires: { handCards: 1, sourceActive: true },
        program: {
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op05-hq-cost",
            1,
            {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                lookAndAdd(3, "op05-hq-look", { type: "Revolutionary Army" })
                  .effect,
              ],
            },
          ),
        },
      },
    ],
    [
      // OP05-025 Gladius: rests itself to rest a cost-3-or-less Character.
      "OP05-025",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest", binding: SOURCE_BINDING },
              restCostAtMost(3, "op05-gladius-rest"),
            ],
          },
        },
      },
    ],
    [
      // OP05-027 Trafalgar Law: trashes itself to rest a cost-3-or-less
      // Character -- a 1-drop that is really a Main Event with a body.
      "OP05-027",
      {
        oncePerTurn: false,
        program: { effect: trashSelfFor(restCostAtMost(3, "op05-law-rest")) },
      },
    ],
    [
      // OP05-028 Donquixote Doflamingo: trashes itself to K.O. a rested
      // cost-2-or-less Character.
      "OP05-028",
      {
        oncePerTurn: false,
        program: {
          effect: trashSelfFor(koRestedCostAtMost(2, "op05-doflamingo-ko")),
        },
      },
    ],
    [
      // OP05-033 Baby 5: a DON!! and its own rest for a small Donquixote body
      // out of hand.
      "OP05-033",
      {
        oncePerTurn: false,
        requires: { activeDon: 1, sourceActive: true },
        program: {
          effect: restDonAndSelfFor(
            playFromHand(
              { category: "character", type: "Donquixote Pirates", maxCost: 2 },
              "op05-baby5-play",
            ),
          ),
        },
      },
    ],
    [
      // OP05-034 Baby 5: the same price for a five-deep dig.
      "OP05-034",
      {
        oncePerTurn: false,
        requires: { activeDon: 1, sourceActive: true },
        program: {
          effect: restDonAndSelfFor(
            lookAndAdd(5, "op05-baby5-look", { type: "Donquixote Pirates" })
              .effect,
          ),
        },
      },
    ],
    [
      // OP05-041 Sakazuki (Leader): a hand card for a card. Its `[When
      // Attacking]` half is in `op05-battle.ts`.
      "OP05-041",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op05-sakazuki-cost",
            1,
            { kind: "draw", player: "self", count: 1 },
          ),
        },
      },
    ],
    [
      // OP05-045 Stainless: a hand card and its own rest for a cost-2 bury on
      // either side.
      "OP05-045",
      {
        oncePerTurn: false,
        requires: { handCards: 1, sourceActive: true },
        program: {
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op05-stainless-cost",
            1,
            {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                buryCostAtMost(2, "op05-stainless-bury"),
              ],
            },
          ),
        },
      },
    ],
    [
      // OP05-060 Monkey.D.Luffy (Leader): a Life card into hand, and at zero or
      // at three-plus DON!! on the field an active DON!! from the DON!! deck.
      // The Life is the price and is paid whether or not the count fits, which
      // is what the printed colon-then-"if" says; `lifeCards` keeps the offer
      // off an empty Life stack.
      "OP05-060",
      {
        oncePerTurn: true,
        requires: { lifeCards: 1 },
        program: lifeToHandCost(
          {
            kind: "if",
            condition: {
              kind: "any-of",
              conditions: [
                {
                  kind: "field-don",
                  player: "self",
                  operator: "lte",
                  value: 0,
                },
                {
                  kind: "field-don",
                  player: "self",
                  operator: "gte",
                  value: 3,
                },
              ],
            },
            then: { kind: "add-don", player: "self", count: 1, rested: false },
          },
          "top",
        ),
      },
    ],
    [
      // OP05-081 One-Legged Toy Soldier: trashes itself for −3 cost on a
      // Character, the Black removal enabler.
      "OP05-081",
      {
        oncePerTurn: false,
        program: {
          effect: trashSelfFor(costDebuff(3, "op05-toy-soldier-debuff")),
        },
      },
    ],
    [
      // OP05-082 Shirahoshi: its rest and two trash cards under the deck make
      // an opponent holding six or more discard one -- their pick.
      "OP05-082",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: restAndBuryTwoFromTrash("op05-shirahoshi-cost", {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "opponent",
              zone: "hand",
              operator: "gte",
              value: 6,
            },
            then: {
              kind: "choose",
              selector: { player: "opponent", zone: "hand" },
              bind: "op05-shirahoshi-discard",
              min: 1,
              max: 1,
              chooser: "opponent",
              effect: {
                kind: "move",
                binding: "op05-shirahoshi-discard",
                to: { player: "opponent", zone: "trash" },
              },
            },
          }),
        },
      },
    ],
    [
      // OP05-088 Mansherry: a DON!!, its rest and two trash cards under the deck
      // for a black 3-to-5 back from the trash.
      "OP05-088",
      {
        oncePerTurn: false,
        requires: { activeDon: 1, sourceActive: true },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 1 },
              restAndBuryTwoFromTrash(
                "op05-mansherry-cost",
                blackCharacterFromTrash(3, 5, "op05-mansherry-recover"),
              ),
            ],
          },
        },
      },
    ],
    [
      // OP05-089 Saint Mjosgard: a DON!!, its own rest and another Character's
      // for a black 1-cost back from the trash. The outer `if` is what keeps
      // the repeatable activation off a board with no other active body: an
      // offer that rests nothing and recovers nothing is a legal no-op a rules
      // agent would take forever.
      "OP05-089",
      {
        oncePerTurn: false,
        requires: { activeDon: 1, sourceActive: true },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                rested: false,
                canRest: true,
                excludeSource: true,
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                rested: false,
                canRest: true,
                excludeSource: true,
              },
              bind: "op05-mjosgard-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest-don", player: "self", count: 1 },
                  { kind: "rest", binding: SOURCE_BINDING },
                  { kind: "rest", binding: "op05-mjosgard-cost" },
                  blackCharacterFromTrash(1, 1, "op05-mjosgard-recover"),
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP05-119 Monkey.D.Luffy: a rested DON!! for an active one from the DON!!
      // deck -- net, the field grows by one each turn. Its `[On Play]` is in
      // `op05-on-play.ts`.
      "OP05-119",
      {
        oncePerTurn: true,
        requires: { activeDon: 1 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 1 },
              { kind: "add-don", player: "self", count: 1, rested: false },
            ],
          },
        },
      },
    ],
  ],
};
