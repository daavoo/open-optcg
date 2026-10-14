/**
 * OP12 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { op12EventPrograms, koOpponentUpToCost } from "./op12-main.js";
import { revealTwoEvents } from "./op12-shared.js";
import { donMinus } from "./shared.js";

/** "If your Leader has the {Revolutionary Army} type" -- Black's gate. */
const revolutionaryArmyLeader = {
  kind: "leader-has-type",
  player: "self",
  type: "Revolutionary Army",
} as const;

/**
 * "[printed text omitted -- pnpm card:text <card>]" --
 * OP12-107 Doflamingo and OP12-119 Kuma both print it on an `[Opponent's Turn]`
 * `[On K.O.]`, which is Yellow's way of buying a turn back when a body dies.
 */
const deckTopToLife = (bind: string): MechanicEffect => ({
  kind: "select",
  selector: { player: "self", zone: "deck", position: "top" },
  bind,
  count: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "self", zone: "life", position: "top" },
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the Trigger OP12-109 Pacifista and OP12-113 Roronoa
 * Zoro share.
 *
 * The card that was damaged goes to the hand rather than being lost, which makes
 * this the rare Trigger that costs the attacker a Character *and* leaves the
 * defender a card up.
 */
const koAndKeep = (bind: string): MechanicEffect => ({
  kind: "sequence",
  effects: [
    koOpponentUpToCost(1, bind),
    {
      kind: "move",
      binding: SOURCE_BINDING,
      to: { player: "self", zone: "hand" },
    },
  ],
});

export const op12TriggerMechanics: SetMechanics = {
  onKo: [
    [
      // OP12-003 Crocus: "[printed text omitted -- pnpm card:text OP12-003]"
      //
      // A body that replaces itself when it dies, paid for with information -- the
      // Red Rayleigh deck's whole engine in one card.
      "OP12-003",
      revealTwoEvents("op12-crocus-reveal", {
        kind: "choose",
        selector: {
          player: "self",
          zone: "hand",
          category: "character",
          color: "Red",
          maxPower: 3_000,
        },
        bind: "op12-crocus-play",
        min: 0,
        max: 1,
        effect: { kind: "play", binding: "op12-crocus-play" },
      }),
    ],
    [
      // OP12-065 Emporio.Ivankov: "[printed text omitted -- pnpm card:text OP12-065]" Its trash-count [Blocker] is a static ability.
      "OP12-065",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "trash", category: "event" },
          bind: "op12-ivankov-recur",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op12-ivankov-recur",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP12-089 Hack: "[printed text omitted -- pnpm card:text OP12-089]"
      "OP12-089",
      {
        effect: {
          kind: "if",
          condition: revolutionaryArmyLeader,
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxBaseCost: 4,
            },
            bind: "op12-hack-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op12-hack-ko" },
          },
        },
      },
    ],
    [
      // OP12-107 Donquixote Doflamingo: "[printed text omitted -- pnpm card:text OP12-107]"
      //
      // Only on their turn: a Doflamingo the controller trashes themselves gives
      // nothing back. Its behind-only [Rush] is a static ability.
      "OP12-107",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "opponent" },
          then: deckTopToLife("op12-doflamingo-life"),
        },
      },
    ],
    [
      // OP12-119 Bartholomew Kuma: the same `[Opponent's Turn]` `[On K.O.]`. Its
      // `[On Play]` half is in `op12-on-play.ts`.
      "OP12-119",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "opponent" },
          then: deckTopToLife("op12-kuma-ko-life"),
        },
      },
    ],
  ],
  trigger: [
    [
      // OP12-058 "I Will Make Whitebeard the King of the Pirates": "[Trigger] Draw
      // 1 card." A 9-cost Event's consolation prize off a Life card.
      "OP12-058",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP12-075 Ms. All Sunday: "[printed text omitted -- pnpm card:text OP12-075]"
      //
      // A 4-cost body for one DON!! off a Life card -- and playing it runs its own
      // `[On Play]`, which is the K.O. in `op12-on-play.ts`.
      "OP12-075",
      { effect: donMinus(1, { kind: "play", binding: SOURCE_BINDING }) },
    ],
    [
      // OP12-080 Baratie: "[Trigger] Play this card."
      //
      // The only clause in the pool that plays a *Stage*, which is why the `play`
      // node has a Stage branch at all: a Stage goes to the Stage area, is bound by
      // neither the five-Character limit nor a "cannot play Characters"
      // restriction, and replaces whatever Stage was there.
      "OP12-080",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP12-096 Ursa Shock: "[printed text omitted -- pnpm card:text OP12-096]"
      //
      // Off the *deck*, not the hand: the trash is Black's resource and this fills
      // it while replacing the card.
      "OP12-096",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            { kind: "trash-top", player: "self", count: 1 },
          ],
        },
      },
    ],
    [
      // OP12-097 "Captains Assembled": "[printed text omitted -- pnpm card:text OP12-097]"
      "OP12-097",
      op12EventPrograms["OP12-097"]!,
    ],
    [
      // OP12-101 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP12-101]" Its `[Activate: Main]` half is in `op12-main.ts`.
      "OP12-101",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Supernovas",
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    [
      // OP12-104 Sentomaru: "[printed text omitted -- pnpm card:text OP12-104]" A vanilla 4-cost body whose whole text is this.
      "OP12-104",
      { effect: koOpponentUpToCost(4, "op12-sentomaru-ko") },
    ],
    [
      // OP12-109 Pacifista: "[printed text omitted -- pnpm card:text OP12-109]"
      "OP12-109",
      { effect: koAndKeep("op12-pacifista-ko") },
    ],
    [
      // OP12-116 "We'll Ring the Bell Waiting for You!!": "[Trigger] Draw 1 card."
      "OP12-116",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
  ],
};

export { koAndKeep };
