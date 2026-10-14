/**
 * ST-29 battle-window programs: `[When Attacking]` and the three `[Counter]`
 * Events.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST29-0xx` prints it from the local cache).
 */
import { type MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { koCostAtMost } from "./op08-shared.js";
import { drawOneTrashOne } from "./st29-triggers.js";

/**
 * ST29-002 Usopp: rest an opposing Character whose cost is inside the
 * opponent's own Life total.
 *
 * A Yellow reading in both directions: the clause is at its widest against a
 * seat still on five Life and closes as they take damage, so it is early
 * interaction that stops mattering exactly when the deck's own Life payoffs
 * start. Printed on the `[On Play]` and the `[When Attacking]` alike, so it is
 * one program registered from both tables.
 *
 * `canRest` rather than `rested: false`: the question is whether the Character
 * can be rested at all, which a protection clause on the other side answers.
 */
export const restByOpponentLife: MechanicProgram = {
  effect: {
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      canRest: true,
      maxCostFromZoneCount: { player: "opponent", zone: "life" },
    },
    bind: "st29-usopp-rest",
    min: 0,
    max: 1,
    effect: { kind: "rest", binding: "st29-usopp-rest" },
  },
};

export const st29BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // ST29-001 Monkey.D.Luffy (Leader): once its own Life is down to two, the
      // swing cycles a card.
      //
      // Not `[Once Per Turn]`, so a second attack with the Leader is not
      // possible anyway -- attacking rests it. The Life ceiling is the
      // product's shape: every payoff here opens as the deck falls behind.
      "ST29-001",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 2,
            },
            then: drawOneTrashOne("st29-luffy-leader-trash"),
          },
        },
      },
    ],
    ["ST29-002", restByOpponentLife],
  ],
  counterEvent: [
    [
      // ST29-015 Raw Heat Strike: 2000 Counter, and from one Life a −2000 on
      // the other side as well.
      //
      // The debuff reaches the opposing Leader as well as a Character, which is
      // what makes it more than a trade: a Leader 2000 smaller is a Leader that
      // stops being lethal this turn. Turn-scoped rather than battle-scoped,
      // because the printed words are "during this turn".
      "ST29-015",
      {
        cost: 1,
        power: 2_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 1,
            },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                includeLeader: true,
              },
              bind: "st29-raw-heat-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "st29-raw-heat-debuff",
                amount: -2_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // ST29-016: 3000 Counter on the Leader alone.
      //
      // `target` is what restricts it: the engine's Counter power is one scalar
      // added to whatever is being attacked, so without the filter this would
      // pay out while a Character was blocking, which the printed clause does
      // not say. Its `[Main]` half is in `st29-main.ts`.
      "ST29-016",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // ST29-017 Iai Death Lion Song: 4000 Counter, and from two Life a K.O. of
      // anything at cost 3 or less.
      //
      // The biggest Counter in the product and the one that answers a board as
      // well as a swing -- which is what two DON!! buys over ST29-015's one.
      "ST29-017",
      {
        cost: 2,
        power: 4_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 2,
            },
            then: koCostAtMost(3, "st29-iai-ko"),
          },
        },
      },
    ],
  ],
};
