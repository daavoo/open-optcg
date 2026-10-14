/**
 * ST-29 `[Trigger]` programs.
 *
 * Eight of the product's seventeen cards print one, which is the deck: its
 * Life stack is a second hand, and four of those Triggers put the card itself
 * on the board for free.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST29-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { koCostAtMost } from "./op08-shared.js";
import { playSelfBehindLuffy } from "./st29-shared.js";

/**
 * "Draw 1 card and trash 1 card from your hand" -- the cycle the Leader's
 * `[When Attacking]` and one of the Events' `[Trigger]`s both pay out.
 *
 * A bind per caller, because two programs can be queued in one turn and a
 * shared name would let the second read the first's selection.
 */
export const drawOneTrashOne = (bind: string): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count: 1 },
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "move",
        binding: bind,
        to: { player: "self", zone: "trash" },
      },
    },
  ],
});

export const st29TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // ST29-003 Kaku: off a Life card, a K.O. of anything at cost 3 or less.
      // Its continuous power clause is a row in `../static-abilities.ts`.
      "ST29-003",
      { effect: koCostAtMost(3, "st29-kaku-ko") },
    ],
    [
      // ST29-004 Sanji: a card out of hand plays this one off the Life stack.
      //
      // A real cost rather than a Leader gate, so the whole clause is
      // `optional` and the play sits inside the `choose` that pays for it: a
      // `choose` whose zone cannot fill its `min` is skipped and the queue
      // continues, which would otherwise hand the body to a player with an
      // empty hand.
      "ST29-004",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "st29-sanji-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "st29-sanji-cost",
                  to: { player: "self", zone: "trash" },
                },
                { kind: "play", binding: SOURCE_BINDING },
              ],
            },
          },
        },
      },
    ],
    // Three of the product's bodies print the same free play behind the named
    // Leader; the program is in `st29-shared.ts`.
    ["ST29-005", { effect: playSelfBehindLuffy }],
    ["ST29-008", { effect: playSelfBehindLuffy }],
    ["ST29-009", { effect: playSelfBehindLuffy }],
    [
      // ST29-007 Tony Tony.Chopper: off a Life card, +2000 for the turn on one
      // of its controller's [Monkey.D.Luffy] cards -- the Leader included.
      //
      // The name filter is what makes a Trigger revealed mid-attack worth
      // anything: the card being attacked is nearly always the Leader, and the
      // Leader is what the deck names. Its `[On K.O.]` half is in
      // `st29-on-play.ts`.
      "ST29-007",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
            name: "Monkey.D.Luffy",
          },
          bind: "st29-chopper-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "st29-chopper-buff",
            amount: 2_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // ST29-012 Monkey.D.Luffy: off a Life card, this body plays itself for
      // free, with no gate at all -- the cheapest of the product's four
      // self-plays and the one that feeds its own `[Activate: Main]`.
      "ST29-012",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // ST29-013 Rob Lucci: off a Life card, a K.O. whose ceiling is both Life
      // totals added together.
      //
      // `maxCostFromZoneCount` with `"either"` is the sum, which is the only
      // reading of "the total of your and your opponent's Life cards" -- and it
      // is the product's widest removal early, closing as the game goes on.
      "ST29-013",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCostFromZoneCount: { player: "either", zone: "life" },
          },
          bind: "st29-lucci-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "st29-lucci-ko" },
        },
      },
    ],
    [
      // ST29-015 Raw Heat Strike: off a Life card, one card.
      "ST29-015",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // ST29-017 Iai Death Lion Song: off a Life card, two cards for one.
      //
      // A net +1 on the hand, unlike the Leader's own one-for-one cycle: the
      // Event is the deck's only Trigger that grows the hand as well as
      // filtering it.
      "ST29-017",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "st29-iai-trash",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "st29-iai-trash",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
  ],
};
