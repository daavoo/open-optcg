/**
 * OP18's Yellow cards, OP18-098 to OP18-117, and the Black/Yellow OP18-079
 * Spandam Leader they are built around.
 *
 * Comments paraphrase; printed text is `pnpm card:text OP18-0NN`.
 *
 * The CP package is a face-up Life economy: bodies go from the hand into Life
 * face-up, and almost every card's [Trigger] is gated on a Leader whose type
 * includes "CP" -- {CP9}, {CP7}, {CP6} and {CP0} all qualify.
 */
import {
  SOURCE_BINDING,
  type CardSelector,
  type MechanicCondition,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { koCostAtMost } from "./op08-shared.js";
import { type SetMechanics } from "./registry.js";
import {
  lookAndAdd,
  payFromHand,
  restCostAtMost,
  trashForBattlePower,
} from "./shared.js";
import { restBackIntoLife } from "./st13-shared.js";

/** "If your Leader has a type including "CP"" -- every CP Trigger's gate. */
const cpLeader: MechanicCondition = {
  kind: "leader-type-including",
  player: "self",
  text: "CP",
};

const cpCard = { typeIncluding: "CP" } as const;

const draw1: MechanicEffect = { kind: "draw", player: "self", count: 1 };

const cpTrigger = (effect: MechanicEffect): MechanicProgram => ({
  effect: { kind: "if", condition: cpLeader, then: effect },
});

/**
 * "Add up to 1 CP card from your hand to the top or bottom of your Life cards
 * face-up" -- OP18-099, OP18-100 and OP18-101.
 *
 * The end is the player's choice, so it is a `choice` of two moves after the
 * card is picked. Face-up is the point: the card's own [Trigger] is now public,
 * and it is what OP18-105 and the Leader's Life gain are feeding.
 *
 * The end is asked only once a card is bound: a `choose` that finds nothing,
 * or is declined, still runs its body with an empty binding.
 */
const cpHandToLifeFaceUp = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { ...cpCard, player: "self", zone: "hand" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "if",
    condition: {
      kind: "selector-count",
      player: "self",
      selector: { zone: "hand", binding: bind },
      operator: "gte",
      value: 1,
    },
    then: cpLifeEnd(bind),
  },
});

const cpLifeEnd = (bind: string): MechanicEffect => ({
  kind: "choice",
  branches: [
    {
      id: "life-top",
      label: "Add it to the top of your Life cards face-up",
      effect: {
        kind: "move",
        binding: bind,
        to: { player: "self", zone: "life", position: "top" },
        faceUp: true,
      },
    },
    {
      id: "life-bottom",
      label: "Add it to the bottom of your Life cards face-up",
      effect: {
        kind: "move",
        binding: bind,
        to: { player: "self", zone: "life", position: "bottom" },
        faceUp: true,
      },
    },
  ],
});

/**
 * "Place up to 1 Character with a cost of N or less at the bottom of the
 * owner's deck."
 *
 * Either side's Character: the cards name no owner for the target (OP18-099,
 * 103, 107, 113, 114, 115).
 */
const anyCharacterToDeckBottom = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "either", zone: "board", category: "character", maxCost },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "owner", zone: "deck", position: "bottom" },
  },
});

/** "Trash up to 1 card from the top of your opponent's Life cards." */
const trashOpponentTopLife = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "life", position: "top" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "opponent", zone: "trash" },
  },
});

/**
 * "Add up to 1 card from the top of your deck to the top of your Life cards."
 * A `choose` over the one top card, so the "up to" can keep Life where it is.
 */
const deckTopToLife = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "deck", position: "top" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "self", zone: "life", position: "top" },
  },
});

const opponentCharacter = (maxCost?: number): CardSelector => ({
  player: "opponent",
  zone: "board",
  category: "character",
  ...(maxCost === undefined ? {} : { maxCost }),
});

/**
 * One printed "K.O. or rest" (OP18-101, OP18-109): a `choice` of two branches over the
 * same ceiling, asked only when there is a Character to aim it at.
 */
const koOrRestCostAtMost = (maxCost: number, bind: string): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "selector-count",
    player: "opponent",
    selector: { zone: "board", category: "character", maxCost },
    operator: "gte",
    value: 1,
  },
  then: {
    kind: "choice",
    branches: [
      {
        id: "ko",
        label: `K.O. a Character with a cost of ${maxCost} or less`,
        effect: koCostAtMost(maxCost, `${bind}-ko`),
      },
      {
        id: "rest",
        label: `Rest a Character with a cost of ${maxCost} or less`,
        effect: restCostAtMost(maxCost, `${bind}-rest`),
      },
    ],
  },
});

/** The removal half OP18-099, OP18-103 and OP18-113 share. */
const drawAndBottomEight = (bind: string): MechanicProgram =>
  cpTrigger({
    kind: "sequence",
    effects: [draw1, anyCharacterToDeckBottom(8, bind)],
  });

export const op18YellowMechanics: SetMechanics = {
  activateMain: [
    [
      // OP18-079 Spandam (Leader): two DON!!, the Leader itself and a CP card
      // from hand buy one card off the deck onto Life. Not [Once Per Turn];
      // resting the Leader is what holds it to once.
      //
      // No `optional`: activating is the yes, and the `requires` gate keeps
      // the offer to a player who can pay all three parts.
      "OP18-079",
      {
        oncePerTurn: false,
        requires: {
          sourceActive: true,
          activeDon: 2,
          handCardsMatching: { match: cpCard, count: 1 },
        },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 2 },
              { kind: "rest", binding: SOURCE_BINDING },
              payFromHand(
                { ...cpCard, player: "self", zone: "hand" },
                "op18-079-cost",
                1,
                deckTopToLife("op18-079-life"),
              ),
            ],
          },
        },
      },
    ],
    [
      // OP18-108 Funkfreed: rests itself for +1000 on a Spandam -- the Leader
      // or OP18-105 on the board.
      "OP18-108",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest", binding: SOURCE_BINDING },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  includeLeader: true,
                  name: "Spandam",
                },
                bind: "op18-108-buff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op18-108-buff",
                  amount: 1000,
                  expiresAfterTurns: 0,
                },
              },
            ],
          },
        },
      },
    ],
  ],
  onPlay: [
    // OP18-099 Kaku.
    ["OP18-099", { effect: cpHandToLifeFaceUp("op18-099-life") }],
    [
      // OP18-100 Kalifa: the draw comes first, so the card drawn can be the
      // one placed.
      "OP18-100",
      {
        effect: {
          kind: "sequence",
          effects: [draw1, cpHandToLifeFaceUp("op18-100-life")],
        },
      },
    ],
    [
      // OP18-108 Funkfreed: a CP card from hand for two.
      "OP18-108",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { ...cpCard, player: "self", zone: "hand" },
            "op18-108-cost",
            1,
            { kind: "draw", player: "self", count: 2 },
          ),
        },
      },
    ],
    [
      // OP18-110 Blueno: a four-deep look for a CP card other than itself.
      "OP18-110",
      lookAndAdd(4, "op18-110-look", { ...cpCard, excludeName: "Blueno" }),
    ],
    // OP18-113 Rob Lucci: one off the top of the opponent's Life.
    ["OP18-113", { effect: trashOpponentTopLife("op18-113-play") }],
    [
      // OP18-114 Wanze: the whole Life stack read and put back in an order the
      // player picks, which keeps each card's face as it was.
      "OP18-114",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: "all",
              bind: "op18-114-life",
              zone: "life",
            },
            restBackIntoLife("op18-114-life"),
          ],
        },
      },
    ],
  ],
  onKo: [
    // OP18-101 Kumadori.
    ["OP18-101", { effect: cpHandToLifeFaceUp("op18-101-life") }],
    [
      // OP18-103 Jabra: one onto its own Life, then one off the opponent's --
      // independent "up to"s, so either may be declined.
      "OP18-103",
      {
        effect: {
          kind: "sequence",
          effects: [
            deckTopToLife("op18-103-life"),
            trashOpponentTopLife("op18-103-trash"),
          ],
        },
      },
    ],
    // OP18-113 Rob Lucci: the same clause as its [On Play].
    ["OP18-113", { effect: trashOpponentTopLife("op18-113-ko") }],
  ],
  trigger: [
    ["OP18-099", drawAndBottomEight("op18-099-trigger")],
    [
      // OP18-100 Kalifa: a draw, then rest the opponent's Leader or a
      // Character.
      "OP18-100",
      cpTrigger({
        kind: "sequence",
        effects: [
          draw1,
          {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              // The board holds only Characters, and a `category` filter
              // would drop the Leader `includeLeader` adds.
              includeLeader: true,
              canRest: true,
            },
            bind: "op18-100-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op18-100-rest" },
          },
        ],
      }),
    ],
    ["OP18-101", cpTrigger(koOrRestCostAtMost(6, "op18-101-trigger"))],
    ["OP18-103", drawAndBottomEight("op18-103-trigger")],
    [
      // OP18-105 Spandam: reveal another CP card from hand and run its
      // [Trigger] as if it had come off Life -- see `activate-trigger`. The
      // revealed card stays in hand unless its own Trigger moves it.
      "OP18-105",
      cpTrigger({
        kind: "choose",
        selector: {
          ...cpCard,
          player: "self",
          zone: "hand",
          excludeName: "Spandam",
          hasTrigger: true,
        },
        bind: "op18-105-reveal",
        min: 0,
        max: 1,
        effect: {
          kind: "sequence",
          effects: [
            { kind: "reveal", binding: "op18-105-reveal" },
            { kind: "activate-trigger", binding: "op18-105-reveal" },
          ],
        },
      }),
    ],
    ["OP18-107", cpTrigger(anyCharacterToDeckBottom(5, "op18-107-trigger"))],
    ["OP18-109", cpTrigger(koOrRestCostAtMost(6, "op18-109-trigger"))],
    [
      // OP18-110 Blueno: no Leader gate.
      "OP18-110",
      {
        effect: {
          kind: "sequence",
          effects: [draw1, koCostAtMost(2, "op18-110-trigger")],
        },
      },
    ],
    ["OP18-113", drawAndBottomEight("op18-113-trigger")],
    ["OP18-114", cpTrigger(anyCharacterToDeckBottom(5, "op18-114-trigger"))],
    [
      "OP18-115",
      cpTrigger({
        kind: "sequence",
        effects: [draw1, anyCharacterToDeckBottom(7, "op18-115-trigger")],
      }),
    ],
    [
      "OP18-116",
      cpTrigger({
        kind: "choose",
        selector: { ...opponentCharacter(), canRest: true },
        bind: "op18-116-trigger",
        min: 0,
        max: 1,
        effect: { kind: "rest", binding: "op18-116-trigger" },
      }),
    ],
  ],
  eventMain: [
    // OP18-115 Ten Finger Pistol.
    [
      "OP18-115",
      { cost: 4, program: { effect: koCostAtMost(5, "op18-115-ko") } },
    ],
    [
      // OP18-117 Buster Call: the whole Life stack for a rebuilt board. "All
      // Characters" is both sides' (the card names no owner), and the
      // Vice Admirals come out of the deck or the trash in one pick, five
      // names at most, which is why the deck is shuffled after.
      //
      // The trash of Life is the cost and is paid under any Leader; only the
      // payoff reads Spandam. With no Life there is nothing to trash, so the
      // cost is unpaid and the Event resolves to nothing (Bandai's OP18-117
      // Q&A) -- the outer gate, not a wipe on an empty trash.
      "OP18-117",
      {
        cost: 10,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "select",
                    selector: { player: "self", zone: "life" },
                    bind: "op18-117-life",
                    count: "all",
                    effect: {
                      kind: "move",
                      binding: "op18-117-life",
                      to: { player: "self", zone: "trash" },
                    },
                  },
                  {
                    kind: "if",
                    condition: {
                      kind: "leader-has-name",
                      player: "self",
                      name: "Spandam",
                    },
                    then: {
                      kind: "sequence",
                      effects: [
                        {
                          kind: "select",
                          selector: {
                            player: "either",
                            zone: "board",
                            category: "character",
                          },
                          bind: "op18-117-wipe",
                          count: "all",
                          effect: {
                            kind: "move",
                            binding: "op18-117-wipe",
                            to: { player: "owner", zone: "trash" },
                          },
                        },
                        {
                          kind: "choose",
                          selector: {
                            player: "self",
                            zone: ["deck", "trash"],
                            category: "character",
                            type: "Vice Admiral",
                          },
                          bind: "op18-117-play",
                          min: 0,
                          max: 5,
                          distinctNames: true,
                          effect: { kind: "play", binding: "op18-117-play" },
                        },
                        { kind: "shuffle-deck", player: "self" },
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
  counterEvent: [
    [
      // OP18-116 Iron Body Empty Tree: a hand card for +3000. Declining the
      // trash leaves nothing gaining power, so the power is in the program.
      "OP18-116",
      {
        cost: 0,
        trashFromHand: 1,
        power: 0,
        program: trashForBattlePower(3000, "op18-116-cost"),
      },
    ],
  ],
};
