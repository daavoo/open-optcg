/**
 * EB-02's `[Trigger]`s, its two `[On K.O.]` clauses and the one replacement the
 * set prints.
 *
 * Six of the nine Triggers are the {Music} cycle's "activate this card's
 * `[Main]` effect", which is the same program the Event's own `[Main]` runs --
 * see `musicSearch` in `eb02-shared.ts`.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd } from "./shared.js";
import { musicSearch } from "./eb02-shared.js";
import { peekAtLife, restOpponentCostFour } from "./eb02-on-play.js";

export const eb02TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // EB02-007 Cloven Rose Blizzard: the `[Trigger]` half.
      //
      // One power band above the `[Main]` half's -- 4000 rather than 3000 --
      // and with none of the buff beside it. That is the whole card: the
      // Trigger is the better removal and the Main is the one you can choose to
      // cast.
      "EB02-007",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCurrentPower: 4_000,
          },
          bind: "eb02-007-trigger-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "eb02-007-trigger-ko" },
        },
      },
    ],
    // "[Trigger] Activate this card's [Main] effect" -- the {Music} cycle, one
    // per colour. The same program the `[Main]` half runs, registered rather
    // than copied: a fix to the search reaches both windows.
    ["EB02-008", musicSearch],
    ["EB02-020", musicSearch],
    ["EB02-031", musicSearch],
    ["EB02-040", musicSearch],
    ["EB02-050", musicSearch],
    ["EB02-058", musicSearch],
    [
      // EB02-018 Buggy: the `[Trigger]` half. Its `[On Play]` is in
      // `eb02-on-play.ts`.
      "EB02-018",
      { effect: restOpponentCostFour("eb02-018-trigger-rest") },
    ],
    [
      // EB02-021 Gum-Gum Giant Pistol: the `[Trigger]` half. Its `[Main]` is in
      // `eb02-main.ts`.
      "EB02-021",
      { effect: restOpponentCostFour("eb02-021-trigger-rest") },
    ],
    [
      // EB02-030 And That's When Somebody Makes Fun of Their Friend's
      // Dream!!!!: the `[Trigger]` half. Its `[Counter]` is in
      // `eb02-battle.ts`, and the protection it installs is the replacement
      // below.
      "EB02-030",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // EB02-055 Jinbe.
      //
      // A Trigger that plays its own card, gated on the Leader and on the Life
      // total: a 4-cost 5000 body with a 2000 Counter arriving free off a
      // damaged Life card is what makes the Fish-Man deck's Life a resource
      // rather than a clock. `play` of `SOURCE_BINDING` is the shape every
      // "play this card" Trigger uses -- the card is in no zone while its own
      // program runs, and the node reads its identity off the execution's
      // source.
      //
      // Both halves of the gate are printed and neither is redundant: the
      // Leader type is the deck, and "2 or less Life cards" is the turn.
      "EB02-055",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "any-of",
                conditions: [
                  { kind: "leader-has-type", player: "self", type: "Fish-Man" },
                  { kind: "leader-has-type", player: "self", type: "Merfolk" },
                ],
              },
              {
                kind: "zone-count",
                player: "self",
                zone: "life",
                operator: "lte",
                value: 2,
              },
            ],
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    [
      // EB02-056 Vegapunk: the `[Trigger]` half. Its `[On Play]` is in
      // `eb02-on-play.ts`.
      "EB02-056",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
  ],
  onKo: [
    [
      // EB02-036 Nico Robin.
      //
      // `DON!! −1` on an `[On K.O.]` is Purple paying for its own removal: the
      // 3-cost Blocker trades, and the card it finds costs a DON!! off the
      // field. `donMinus` gates on actually having one, so a player at zero
      // DON!! neither pays nor searches -- declining and being unable to pay
      // must not be the same thing.
      "EB02-036",
      {
        effect: donMinus(
          1,
          lookAndAdd(3, "eb02-036-look", { type: "Straw Hat Crew" }).effect,
        ),
      },
    ],
    [
      // EB02-048 Brook: the `[On K.O.]` half. Its `[On Play]` put a [Laboon] in
      // the hand -- see `eb02-on-play.ts` -- so the two halves are one plan:
      // the body that dies replaces itself with the card it fetched.
      //
      // The cost ceiling is printed and it matters: the pool has [Laboon] at 1
      // and at 4, and both are inside it.
      "EB02-048",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            name: "Laboon",
            maxCost: 4,
          },
          bind: "eb02-048-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "eb02-048-play" },
        },
      },
    ],
    [
      // EB02-053 Myskina Olga: one printed clause on two timings -- see
      // `eb02-on-play.ts` for the shared fragment and what each decision is.
      "EB02-053",
      peekAtLife,
    ],
  ],
  replacement: [
    [
      // EB02-030's protection, bought by its `[Counter]` in `eb02-battle.ts`.
      //
      // The only entry in the registry that is not printed on a card sitting on
      // the field: the Event installs a booking on the player
      // (`PlayerState.installedReplacements`) and `eligibleReplacements` reads
      // that booking as a protector of its own.
      //
      // `battleOnly` is the printed "would be K.O.'d **in battle**", which is
      // the exact complement of every `effectOnly` entry: an effect's K.O. is
      // not answered, and a lost fight is. `protects` is "any of your
      // Characters" -- the whole board, which is what makes one card worth
      // more than one Counter on a turn with several attacks left -- and the
      // cost is repeatable, with no `[Once Per Turn]`, because what limits it
      // is the hand.
      "EB02-030",
      {
        label: "Trash 1 card from your hand",
        opponentEffectOnly: false,
        battleOnly: true,
        oncePerTurn: false,
        protects: { category: "character" },
        cost: { kind: "trash-from-hand", count: 1 },
      },
    ],
  ],
};
