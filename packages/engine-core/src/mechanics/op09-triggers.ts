/**
 * OP09 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs.
 *
 * OP09-057's Trigger re-runs its own `[Main]` and OP09-102's re-runs its own
 * `[On Play]`, so both read that program back
 * out of the other table rather than restating it -- one program, two dispatch
 * points, and no chance of the two drifting.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  asOnPlayTrigger,
  donMinusOrMore,
  lifeToHandCost,
  payFromHand,
} from "./shared.js";
import { threeRestedCharacters, twoRestedCharacters } from "./op09-shared.js";
import { op09MainMechanics } from "./op09-main.js";
import { op09OnPlayMechanics } from "./op09-on-play.js";

const eventMainProgram = (cardNumber: string) =>
  (op09MainMechanics.eventMain ?? []).find(
    ([number]) => number === cardNumber,
  )![1].program;

const onPlayProgram = (cardNumber: string) =>
  (op09OnPlayMechanics.onPlay ?? []).find(
    ([number]) => number === cardNumber,
  )![1];

/** "Draw 1 card", the Trigger five of the set's Events share. */
const drawOne: MechanicProgramLike = {
  effect: { kind: "draw", player: "self", count: 1 },
};
type MechanicProgramLike = { effect: MechanicEffect };

/** "Add up to 1 DON!! card from your DON!! deck and set it as active." */
const rampOne: MechanicProgramLike = {
  effect: { kind: "add-don", player: "self", count: 1, rested: false },
};

/** "Rest up to 1 of your opponent's Characters with a cost of 4 or less." */
const restCostFour = (bind: string): MechanicProgramLike => ({
  effect: {
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      maxCost: 4,
      canRest: true,
      rested: false,
    },
    bind,
    min: 0,
    max: 1,
    effect: { kind: "rest", binding: bind },
  },
});

/**
 * "Negate the effect of up to 1 of your opponent's Leader or Character cards
 * during this turn" -- printed on both Black Events' Triggers.
 */
const negateOne = (bind: string): MechanicProgramLike => ({
  effect: {
    kind: "choose",
    selector: { player: "opponent", zone: "board", includeLeader: true },
    bind,
    min: 0,
    max: 1,
    effect: { kind: "negate", binding: bind, expiresAfterTurns: 0 },
  },
});

/**
 * "If your Leader has the {Revolutionary Army} type and you and your opponent
 * have a total of 5 or less Life cards, play this card."
 *
 * Three of the Yellow Characters print it exactly, which is what makes the
 * archetype's Life spending pay for itself off the top of the deck.
 */
const playIfBehind = (leaderType?: string): MechanicProgramLike => ({
  effect: {
    kind: "if",
    condition: leaderType
      ? {
          kind: "all-of",
          conditions: [
            { kind: "leader-has-type", player: "self", type: leaderType },
            { kind: "combined-life", operator: "lte", value: 5 },
          ],
        }
      : { kind: "combined-life", operator: "lte", value: 5 },
    then: { kind: "play", binding: SOURCE_BINDING },
  },
});

/** "Play up to 1 <selector> Character card from your hand." */
const playFromHand = (
  bind: string,
  match: { type?: string; color?: string; maxCost: number },
): MechanicProgramLike => ({
  effect: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "hand",
      category: "character",
      ...match,
    },
    bind,
    min: 0,
    max: 1,
    effect: { kind: "play", binding: bind },
  },
});

/** "Set this Character as active", the ODYSSEY end-of-turn refresh. */
const refreshSelf: MechanicProgramLike = {
  effect: { kind: "update", binding: SOURCE_BINDING, rested: false },
};

export const op09TriggerMechanics: SetMechanics = {
  trigger: [
    // The five plain draws.
    ["OP09-019", drawOne],
    ["OP09-020", drawOne],
    ["OP09-059", drawOne],
    ["OP09-115", drawOne],
    ["OP09-117", drawOne],
    [
      // OP09-039: K.O.s a *rested* Character, which is the one the ODYSSEY
      // mirror leaves lying around.
      "OP09-039",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 4,
            rested: true,
          },
          bind: "op09-bazooka-trigger-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op09-bazooka-trigger-ko" },
        },
      },
    ],
    ["OP09-040", restCostFour("op09-thunder-trigger-rest")],
    ["OP09-041", restCostFour("op09-solid-trigger-rest")],
    // The two Events whose Trigger re-runs their own [Main].
    ["OP09-057", eventMainProgram("OP09-057")],
    [
      // OP09-058: either side's Character, which is what "1 Character" without
      // an owner means -- and the card goes back to *its* owner's hand.
      "OP09-058",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 3,
          },
          bind: "op09-muggy-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op09-muggy-trigger",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    ["OP09-077", rampOne],
    ["OP09-079", rampOne],
    ["OP09-097", negateOne("op09-vortex-trigger")],
    ["OP09-098", negateOne("op09-black-hole-trigger")],
    ["OP09-100", playIfBehind("Revolutionary Army")],
    ["OP09-108", playIfBehind("Revolutionary Army")],
    ["OP09-114", playIfBehind()],
    ["OP09-102", asOnPlayTrigger(onPlayProgram("OP09-102"))],
    [
      // OP09-104 Sabo: the Trigger pays out only off a two-colour Leader, which
      // in this set is the Robin deck and the Luffy deck.
      "OP09-104",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-multicolored", player: "self" },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP09-105 Sanji: buys a Life card back off the top of the deck, and pays
      // two cards for it.
      "OP09-105",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Egghead",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "select",
                selector: { player: "self", zone: "deck", position: "top" },
                bind: "op09-sanji-life",
                count: 1,
                effect: {
                  kind: "move",
                  binding: "op09-sanji-life",
                  to: { player: "self", zone: "life", position: "top" },
                },
              },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op09-sanji-discard",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op09-sanji-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP09-106 Nico Olvia: the Robin deck's refuel, three cards deep.
      "OP09-106",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Nico Robin",
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 3 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op09-olvia-discard",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op09-olvia-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      "OP09-107",
      playFromHand("op09-robin-trigger-play", { color: "Yellow", maxCost: 3 }),
    ],
    [
      // OP09-109 Jaguar.D.Saul: a free 5000 blocker off a damaged Life card,
      // which is the Robin Leader's own reason to run Triggers.
      "OP09-109",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Nico Robin",
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    ["OP09-110", { effect: { kind: "play", binding: SOURCE_BINDING } }],
    [
      // OP09-111 Brook: hand attack off the top of a Life stack.
      "OP09-111",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "leader-has-type", player: "self", type: "Egghead" },
              {
                kind: "zone-count",
                player: "opponent",
                zone: "hand",
                operator: "gte",
                value: 6,
              },
            ],
          },
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            bind: "op09-brook-trigger-discard",
            min: 2,
            max: 2,
            chooser: "opponent",
            effect: {
              kind: "move",
              binding: "op09-brook-trigger-discard",
              to: { player: "opponent", zone: "trash" },
            },
          },
        },
      },
    ],
    [
      "OP09-116",
      playFromHand("op09-miracles-trigger-play", {
        type: "Revolutionary Army",
        maxCost: 4,
      }),
    ],
  ],
  onKo: [
    [
      // OP09-052 Marco: the only `[On K.O.]` in the pool that names *how* the
      // body died, so its entry carries `opponentEffectOnly` and a lost fight
      // does not bring it back. `[Opponent's Turn]` is the other half of the
      // printed gate; by the time this dispatches Marco is already in the
      // trash, which is where `play` on the source finds it.
      "OP09-052",
      {
        opponentEffectOnly: true,
        program: {
          effect: {
            kind: "if",
            condition: { kind: "turn-player", player: "opponent" },
            then: {
              kind: "optional",
              effect: payFromHand(
                { player: "self", zone: "hand" },
                "op09-marco-cost",
                1,
                { kind: "play", binding: SOURCE_BINDING, rested: true },
              ),
            },
          },
        },
      },
    ],
    [
      // OP09-015 Lucky.Roux: trades itself for a body up to 6000 printed.
      "OP09-015",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Red-Haired Pirates",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxPower: 6000,
            },
            bind: "op09-roux-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op09-roux-ko" },
          },
        },
      },
    ],
    [
      // OP09-028 Sanji: a Life card buys a body back out of the trash rested.
      "OP09-028",
      lifeToHandCost({
        kind: "choose",
        selector: {
          player: "self",
          zone: "trash",
          category: "character",
          maxCost: 4,
          anyOf: [{ type: "ODYSSEY" }, { type: "Straw Hat Crew" }],
        },
        bind: "op09-sanji-recur",
        min: 0,
        max: 1,
        effect: { kind: "play", binding: "op09-sanji-recur", rested: true },
      }),
    ],
    [
      // OP09-043 Alvida: dies into another Cross Guild body.
      "OP09-043",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Cross Guild",
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              maxCost: 5,
              excludeName: "Alvida",
            },
            bind: "op09-alvida-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op09-alvida-play" },
          },
        },
      },
    ],
    [
      // OP09-047 Kouzuki Oden: the 9-drop refills as it dies.
      "OP09-047",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op09-oden-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op09-oden-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    ["OP09-083", { effect: { kind: "draw", player: "self", count: 1 } }],
    ["OP09-090", { effect: { kind: "draw", player: "self", count: 1 } }],
  ],
  onEndOfYourTurn: [
    [
      // OP09-029 Tony Tony.Chopper: stands an ODYSSEY body back up for the
      // opponent's turn, which is how a deck that rests its own board blocks.
      "OP09-029",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "ODYSSEY",
            maxCost: 4,
            rested: true,
          },
          bind: "op09-chopper-refresh",
          min: 0,
          max: 1,
          effect: {
            kind: "update",
            binding: "op09-chopper-refresh",
            rested: false,
          },
        },
      },
    ],
    [
      // OP09-031 Donquixote Doflamingo: a Blocker that attacks and blocks in
      // the same round.
      "OP09-031",
      {
        effect: {
          kind: "if",
          condition: twoRestedCharacters,
          then: refreshSelf.effect,
        },
      },
    ],
    [
      // OP09-037 Lim: the same refresh one body deeper into the gate.
      "OP09-037",
      {
        effect: {
          kind: "if",
          condition: threeRestedCharacters,
          then: refreshSelf.effect,
        },
      },
    ],
    [
      // OP09-068 Tony Tony.Chopper: Purple pays DON!! for the same trick, and
      // buys [Blocker] with it.
      "OP09-068",
      {
        effect: donMinusOrMore(1, {
          kind: "sequence",
          effects: [
            refreshSelf.effect,
            {
              kind: "grant-keyword",
              binding: SOURCE_BINDING,
              keyword: "Blocker",
              expiresAfterTurns: 1,
            },
          ],
        }),
      },
    ],
  ],
};
