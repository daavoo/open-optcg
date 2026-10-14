/**
 * ST-14 `[Main]` programs: the three `[Activate: Main]` cost buffs and the two
 * `[Main]` Events.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST14-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { koCostAtMost } from "./op08-shared.js";
import { buffOwnCardForTurn } from "./op07-shared.js";
import { ownBodyAtCost, raiseStrawHatCost } from "./st14-shared.js";

/**
 * "You may rest this Character: <effect>" -- the cost two of the product's
 * 1-drops pay for the same cost buff.
 *
 * `optional` around the rest and the payout together, so declining leaves the
 * body active to block. `sourceActive` on the offer is what keeps a rested
 * copy from being asked at all.
 */
const restSelfFor = (effect: MechanicEffect): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "sequence",
    effects: [{ kind: "rest", binding: SOURCE_BINDING }, effect],
  },
});

export const st14MainMechanics: SetMechanics = {
  activateMain: [
    [
      // ST14-004 Jinbe: once a turn, +2 cost on a black {Straw Hat Crew} body
      // for free.
      //
      // Free and repeatable-looking, so the `[Once Per Turn]` is the whole
      // price. `handCards` and the DON!! fields cannot gate this offer -- it
      // spends nothing -- so the only thing that makes it honest is that the
      // selector finds a body, which the engine checks before offering.
      "ST14-004",
      {
        oncePerTurn: true,
        program: { effect: raiseStrawHatCost("st14-jinbe-cost") },
      },
    ],
    [
      // ST14-008 Haredas: the same buff for the price of resting a 0-power
      // 1-drop, and a cycle behind the 8-cost gate on top.
      //
      // "Then" opens a new sentence with its own condition, so the draw does
      // not hang off the buff having found a body -- but both sit inside the
      // rest, which is one cost for the whole clause. No `[Once Per Turn]`:
      // the rest is what limits it to once, and `sourceActive` is what keeps
      // the offer off an already-rested copy.
      "ST14-008",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: restSelfFor({
            kind: "sequence",
            effects: [
              raiseStrawHatCost("st14-haredas-cost"),
              {
                kind: "if",
                condition: ownBodyAtCost(8),
                then: {
                  kind: "sequence",
                  effects: [
                    { kind: "draw", player: "self", count: 1 },
                    {
                      kind: "choose",
                      selector: { player: "self", zone: "hand" },
                      bind: "st14-haredas-trash",
                      min: 1,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "st14-haredas-trash",
                        to: { player: "self", zone: "trash" },
                      },
                    },
                  ],
                },
              },
            ],
          }),
        },
      },
    ],
    [
      // ST14-011 Heracles: the same rest for the buff alone, with no cycle
      // behind it -- the cheaper half of the pair ST14-008 completes.
      "ST14-011",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: restSelfFor(raiseStrawHatCost("st14-heracles-cost")),
        },
      },
    ],
  ],
  eventMain: [
    [
      // ST14-015: +3000 for the turn, and behind the 8-cost gate a K.O. of a
      // 2-cost body on top.
      //
      // The buff is unconditional and the K.O. is not, so the gate wraps only
      // the second half -- "Then" opens a sentence that carries its own "if".
      // Turn-scoped rather than battle-scoped, because a `[Main]` Event is
      // played with no battle open at all.
      "ST14-015",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              buffOwnCardForTurn(3_000, "st14-phoenix-buff"),
              {
                kind: "if",
                condition: ownBodyAtCost(8),
                then: koCostAtMost(2, "st14-phoenix-ko"),
              },
            ],
          },
        },
      },
    ],
    [
      // ST14-016 I Have My Crew!!: a card, then +3 cost on one of the
      // controller's own Characters.
      //
      // The buff is not narrowed to the black {Straw Hat Crew} the product's
      // other three cost clauses name -- this one reaches any Character its
      // controller has, which is what makes it the one that can push an
      // off-type body over an 8-cost line.
      "ST14-016",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                },
                bind: "st14-crew-cost",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-cost",
                  binding: "st14-crew-cost",
                  amount: 3,
                  expiresAfterTurns: 1,
                },
              },
            ],
          },
        },
      },
    ],
  ],
};
