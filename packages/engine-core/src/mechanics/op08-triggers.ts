/**
 * OP08 `[Trigger]` and `[On K.O.]` programs.
 *
 * OP08-094's Trigger re-runs its own `[Main]`, OP08-106's and OP08-112's
 * re-run their own `[On Play]`, so all three read that program back out of the
 * other table rather than restating it -- one program, two dispatch points, and
 * no chance of the two drifting.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { asOnPlayTrigger, payFromHand } from "./shared.js";
import {
  donMinusOne,
  koCostAtMost,
  playFromHand,
  rampActive,
  rampRested,
  snakeAttackLock,
} from "./op08-shared.js";
import { imperialFlame } from "./op08-main.js";
import { op08OnPlayMechanics } from "./op08-on-play.js";

const onPlayProgram = (cardNumber: string) =>
  (op08OnPlayMechanics.onPlay ?? []).find(
    ([number]) => number === cardNumber,
  )![1];

/** "Draw 1 card", the Trigger two of the set's Events share. */
const drawOne = { effect: { kind: "draw", player: "self", count: 1 } } as const;

/**
 * "Draw 2 cards and trash 1 card from your hand" -- printed on OP08-105's
 * Trigger and on OP08-115's, and as the whole of OP08-105's own reaction.
 */
export const drawTwoTrashOne: MechanicEffect = {
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count: 2 },
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind: "op08-draw-two-trash",
      min: 1,
      max: 1,
      effect: {
        kind: "move",
        binding: "op08-draw-two-trash",
        to: { player: "self", zone: "trash" },
      },
    },
  ],
};

/**
 * "You may trash 1 card from your hand: If you have 2 or less Life cards, play
 * this card (and <effect>)."
 *
 * The Seraphim's Trigger, printed on three of the four. The Life gate is read
 * *inside* the paid cost, which is where the printed sentence puts it: the card
 * is spent whether or not the body lands, and a player on three Life who takes
 * the offer has paid for nothing. Nesting is what keeps a hand that cannot pay
 * from reaching the play.
 */
const seraphimTrigger = (bind: string, then?: MechanicEffect) => ({
  effect: {
    kind: "optional" as const,
    effect: payFromHand({ player: "self", zone: "hand" }, bind, 1, {
      kind: "if",
      condition: {
        kind: "zone-count",
        player: "self",
        zone: "life",
        operator: "lte",
        value: 2,
      },
      then: then
        ? {
            kind: "sequence",
            effects: [{ kind: "play", binding: SOURCE_BINDING }, then],
          }
        : { kind: "play", binding: SOURCE_BINDING },
    }),
  },
});

/**
 * "DON!! −1: Play up to 1 [<name>] with a cost of C or less from your deck.
 * Then, shuffle your deck."
 *
 * The Big Mom officers' chain: each one's `[On K.O.]` fetches the other
 * straight out of the deck, so answering one body puts the next on the board.
 * A whole-deck search, which is what makes the trailing shuffle load-bearing --
 * see the `shuffle-deck` node.
 */
const fetchFromDeck = (
  name: string,
  maxCost: number,
  bind: string,
): MechanicEffect =>
  donMinusOne({
    kind: "sequence",
    effects: [
      {
        kind: "choose",
        selector: {
          player: "self",
          zone: "deck",
          category: "character",
          name,
          maxCost,
        },
        bind,
        min: 0,
        max: 1,
        effect: { kind: "play", binding: bind },
      },
      { kind: "shuffle-deck", player: "self" },
    ],
  });

/** "[Opponent's Turn] [On K.O.] …" -- the gate both officers print. */
const onOpponentTurn = (effect: MechanicEffect): MechanicEffect => ({
  kind: "if",
  condition: { kind: "turn-player", player: "opponent" },
  then: effect,
});

export const op08TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // OP08-017 I'd Never Shoot You!!!!: the small half of its own Counter.
      "OP08-017",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", includeLeader: true },
          bind: "op08-never-shoot-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op08-never-shoot-trigger",
            amount: 1_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP08-018 Cloven Rose: a debuff that reaches the Leader, which is what
      // makes it an answer to a Leader swing rather than only to a body.
      "OP08-018",
      {
        effect: {
          kind: "choose",
          selector: { player: "opponent", zone: "board", includeLeader: true },
          bind: "op08-cloven-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op08-cloven-trigger",
            amount: -3_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP08-019 Munch-Munch Mutation: current power, so a body this deck has
      // already debuffed is inside the ceiling.
      "OP08-019",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCurrentPower: 5_000,
          },
          bind: "op08-munch-trigger",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op08-munch-trigger" },
        },
      },
    ],
    ["OP08-037", drawOne],
    ["OP08-053", drawOne],
    [
      // OP08-038 We Would Never Sell a Comrade to an Enemy!!!: the rest lands
      // on their turn, which is when a Trigger fires -- so it takes a body out
      // of their attack step rather than out of a Refresh Phase.
      "OP08-038",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 3,
            canRest: true,
            rested: false,
          },
          bind: "op08-comrade-trigger",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op08-comrade-trigger" },
        },
      },
    ],
    [
      // OP08-056 Moby Dick: a Stage that puts itself down off the Life card,
      // which is the only way this deck ever plays it on the opponent's turn.
      "OP08-056",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP08-068 Charlotte Perospero: a DON!! back to put the body down, and
      // the body's own `[On K.O.]` hands the DON!! straight back.
      "OP08-068",
      { effect: donMinusOne({ kind: "play", binding: SOURCE_BINDING }) },
    ],
    ["OP08-075", { effect: rampActive }],
    ["OP08-076", { effect: rampActive }],
    ["OP08-091", { effect: koCostAtMost(3, "op08-whoswho-trigger") }],
    ["OP08-097", { effect: koCostAtMost(3, "op08-helice-trigger") }],
    [
      // OP08-094 Imperial Flame: the printed "activate this card's [Main]
      // effect" -- the same program, read back out of the other table.
      "OP08-094",
      { effect: imperialFlame },
    ],
    [
      // OP08-095 Iron Body Fang Flash: reaches the Leader, unlike its own
      // `[Main]` half.
      "OP08-095",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", includeLeader: true },
          bind: "op08-iron-body-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op08-iron-body-trigger",
            amount: 2_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP08-096 People's Dreams Don't Ever End!!: a free body out of the
      // trash, and the colour filter is printed rather than implied.
      "OP08-096",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            color: "Black",
            maxCost: 3,
          },
          bind: "op08-dreams-trigger",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op08-dreams-trigger" },
        },
      },
    ],
    [
      // OP08-104 Charlotte Poire: a 1-cost body that replaces itself, so the
      // Trigger costs nothing but the card that pays for it.
      "OP08-104",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op08-poire-cost",
            1,
            {
              kind: "sequence",
              effects: [
                { kind: "play", binding: SOURCE_BINDING },
                { kind: "draw", player: "self", count: 1 },
              ],
            },
          ),
        },
      },
    ],
    ["OP08-105", { effect: drawTwoTrashOne }],
    ["OP08-115", { effect: drawTwoTrashOne }],
    [
      // OP08-106 Nami: the printed "activate this card's [On Play] effect".
      "OP08-106",
      asOnPlayTrigger(onPlayProgram("OP08-106")),
    ],
    [
      // OP08-111 S-Hawk's sibling and the rest of the Seraphim: a body out of
      // the Life card, but only from behind.
      "OP08-111",
      seraphimTrigger("op08-shark-trigger"),
    ],
    ["OP08-114", seraphimTrigger("op08-hawk-trigger")],
    [
      "OP08-113",
      seraphimTrigger("op08-bear-trigger", koCostAtMost(3, "op08-bear-ko")),
    ],
    [
      // OP08-112 S-Snake: the printed "activate this card's [On Play] effect".
      "OP08-112",
      asOnPlayTrigger(snakeAttackLock),
    ],
    [
      // OP08-117 Burn Blade: a Life card into the hand and a card back on top
      // of Life -- a swap rather than a gain, which is how Yellow chooses what
      // its next Trigger will be.
      "OP08-117",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "life", position: "top" },
            bind: "op08-burn-blade-trigger",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op08-burn-blade-trigger",
                  to: { player: "self", zone: "hand" },
                },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op08-burn-blade-stack",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op08-burn-blade-stack",
                    to: { player: "self", zone: "life", position: "top" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  onKo: [
    [
      // OP08-030 Pedro: a [Blocker] that charges for answering it, either way.
      // "Rest up to 1 of your opponent's DON!! cards" is `rest-don` pointed at
      // the other player -- DON!! sit in the cost area, which no `CardZone` can
      // name.
      "OP08-030",
      {
        effect: {
          kind: "choice",
          branches: [
            {
              id: "rest-don",
              label: "Rest 1 of their DON!! cards",
              effect: { kind: "rest-don", player: "opponent", count: 1 },
            },
            {
              id: "ko",
              label: "K.O. 1 of their rested Characters (cost 6 or less)",
              effect: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  rested: true,
                  maxCost: 6,
                },
                bind: "op08-pedro-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op08-pedro-ko" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP08-066 Charlotte Brulee: a [Blocker] whose death is ramp.
      "OP08-066",
      { effect: rampRested },
    ],
    ["OP08-068", { effect: rampRested }],
    [
      // OP08-070 Baron Tamago: the chain's hand half.
      "OP08-070",
      {
        effect: donMinusOne(
          playFromHand(
            { name: "Viscount Hiyoko", maxCost: 5 },
            "op08-tamago-hiyoko",
          ),
        ),
      },
    ],
    [
      // OP08-071 Count Niwatori: the deck half, and only on their turn -- these
      // are answers to removal, not to the controller's own trades.
      "OP08-071",
      {
        effect: onOpponentTurn(
          fetchFromDeck("Baron Tamago", 4, "op08-niwatori-fetch"),
        ),
      },
    ],
    [
      "OP08-073",
      {
        effect: onOpponentTurn(
          fetchFromDeck("Count Niwatori", 6, "op08-hiyoko-fetch"),
        ),
      },
    ],
  ],
};
