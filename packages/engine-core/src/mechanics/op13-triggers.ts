/**
 * OP13 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { op13EventPrograms, restOpponentUpToCost } from "./op13-main.js";
import { op13OnPlayMechanics } from "./op13-on-play.js";
import { snakeShotEffect } from "./op13-battle.js";
import { filmOrStrawHatLeader, setDonActive } from "./op13-shared.js";
import { asOnPlayTrigger, payFromHand } from "./shared.js";

/** "Draw 1 card." -- the Trigger four OP13 Events share. */
const drawOne: MechanicEffect = { kind: "draw", player: "self", count: 1 };

/** OP13-113 Lilith's `[On Play]`, which its own `[Trigger]` activates. */
const lilithOnPlay = (op13OnPlayMechanics.onPlay ?? []).find(
  ([cardNumber]) => cardNumber === "OP13-113",
)![1];

export const op13TriggerMechanics: SetMechanics = {
  onKo: [
    [
      // OP13-023 Uta: "[printed text omitted -- pnpm card:text OP13-023]"
      //
      // Rested, so the body it brings cannot block this turn -- but its own
      // `[On Play]` still runs, which is what makes trading Uta off worth it.
      "OP13-023",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            maxCost: 5,
          },
          bind: "op13-uta-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op13-uta-play", rested: true },
        },
      },
    ],
    [
      // OP13-033 Franky: "[printed text omitted -- pnpm card:text OP13-033]"
      //
      // "Cards", not "Characters": the Leader and the Stage are inside it too --
      // which is what `OWN_CARDS_ZONES` plus `includeLeader` reaches, aimed across
      // the table. A rested Leader cannot attack, so on a 3-cost body traded in
      // battle this is a turn taken off the opponent.
      "OP13-033",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: ["board", "stage"],
            includeLeader: true,
            canRest: true,
          },
          bind: "op13-franky-rest",
          min: 0,
          max: 2,
          effect: { kind: "rest", binding: "op13-franky-rest" },
        },
      },
    ],
    [
      // OP13-044 Curiel: "[On K.O.] Draw 1 card." Its `[When Attacking]` half is in
      // `op13-battle.ts`.
      "OP13-044",
      { effect: drawOne },
    ],
    [
      // OP13-051 Boa Hancock: "[printed text omitted -- pnpm card:text OP13-051]"
      //
      // Two Leaders qualify for different reasons -- the name and the colour count
      // -- which is what makes this playable in both the Blue Kuja list and the
      // two-colour ones.
      "OP13-051",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              {
                kind: "leader-has-name",
                player: "self",
                name: "Boa Hancock",
              },
              { kind: "leader-multicolored", player: "self" },
            ],
          },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP13-089 St. Topman Warcury: "[On K.O.] Draw 1 card." Its trash-gated
      // immunity and [Blocker] are static abilities.
      "OP13-089",
      { effect: drawOne },
    ],
    [
      // OP13-104 Kouzuki Hiyori: "[printed text omitted -- pnpm card:text OP13-104]"
      //
      // Life from the deck: a 0-power Blocker that trades itself for a Life card is
      // exactly what the Yellow shell wants, because its own payoffs read Life.
      "OP13-104",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op13-hiyori-cost",
            1,
            {
              kind: "if",
              condition: { kind: "leader-multicolored", player: "self" },
              then: {
                kind: "select",
                selector: { player: "self", zone: "deck", position: "top" },
                bind: "op13-hiyori-life",
                count: 1,
                effect: {
                  kind: "move",
                  binding: "op13-hiyori-life",
                  to: { player: "self", zone: "life", position: "top" },
                },
              },
            },
          ),
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP13-027 Sanji: "[printed text omitted -- pnpm card:text OP13-027]"
      "OP13-027",
      {
        effect: {
          kind: "if",
          condition: filmOrStrawHatLeader,
          then: setDonActive(1),
        },
      },
    ],
    [
      // OP13-035 Bepo: "[printed text omitted -- pnpm card:text OP13-035]"
      //
      // A real choice between two different resources: the body comes back to
      // block, or the DON!! comes back to pay for a Counter.
      "OP13-035",
      {
        effect: {
          kind: "choice",
          branches: [
            {
              id: "self",
              label: "Set this Character as active",
              effect: {
                kind: "update",
                binding: SOURCE_BINDING,
                rested: false,
              },
            },
            {
              id: "don",
              label: "Set 1 of your DON!! cards as active",
              effect: setDonActive(1),
            },
          ],
        },
      },
    ],
    [
      // OP13-037 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP13-037]"
      //
      // No choice and no gate: a 4-cost body that attacks every turn and blocks
      // every turn, which is what the Green FILM deck is built to keep on the
      // board.
      "OP13-037",
      { effect: { kind: "update", binding: SOURCE_BINDING, rested: false } },
    ],
  ],
  trigger: [
    [
      // OP13-014 Portgas.D.Rouge: "[printed text omitted -- pnpm card:text OP13-014]"
      //
      // "Cards", so the OP13-002 Leader qualifies -- which is the deck this is
      // printed for.
      "OP13-014",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
            name: "Portgas.D.Ace",
          },
          bind: "op13-rouge-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op13-rouge-buff",
            amount: 3_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP13-020 Meteor Fist: "[printed text omitted -- pnpm card:text OP13-020]"
      "OP13-020",
      op13EventPrograms["OP13-020"]!,
    ],
    [
      // OP13-038 Gum-Gum Elephant Gun: "[printed text omitted -- pnpm card:text OP13-038]"
      //
      // Narrower than its own `[Main]`, which also books DON!! for the end of the
      // turn, so the two are written separately.
      "OP13-038",
      { effect: restOpponentUpToCost(5, "op13-elephant-trigger") },
    ],
    [
      // OP13-039 Gum-Gum Snake Shot: "[printed text omitted -- pnpm card:text OP13-039]"
      "OP13-039",
      { effect: snakeShotEffect },
    ],
    [
      // OP13-059 Brilliant Punk: "[Trigger] Draw 1 card."
      "OP13-059",
      { effect: drawOne },
    ],
    [
      // OP13-096 "[printed text omitted -- pnpm card:text OP13-096]": "[printed text omitted -- pnpm card:text OP13-096]"
      "OP13-096",
      op13EventPrograms["OP13-096"]!,
    ],
    [
      // OP13-102 Edison: "[printed text omitted -- pnpm card:text OP13-102]"
      //
      // The same pair its `[Activate: Main]` prints, without the Life comparison --
      // off a Trigger the draw is unconditional.
      "OP13-102",
      {
        effect: {
          kind: "sequence",
          effects: [drawOne, restOpponentUpToCost(3, "op13-edison-trigger")],
        },
      },
    ],
    [
      // OP13-106 Conney: "[Trigger] Play this card." Its "[Opponent's Turn] when a
      // [Trigger] activates, this Character gains [Blocker]" half is a
      // signal-driven reaction in `card-mechanics.ts`.
      "OP13-106",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP13-108 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP13-108]"
      //
      // A Trigger that only fires from the last Life card or the one before it,
      // which is where Yellow deliberately plays from.
      "OP13-108",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 1,
          },
          then: restOpponentUpToCost(7, "op13-bonney-trigger"),
        },
      },
    ],
    [
      // OP13-109 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP13-109]" Its removal replacement is declared in `unimplemented-clauses.ts`.
      "OP13-109",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op13-bonney-trash",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op13-bonney-trash",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP13-113 Lilith: "[printed text omitted -- pnpm card:text OP13-113]" One
      // program, two dispatch points -- read back out of the `[On Play]` table
      // rather than restated.
      "OP13-113",
      asOnPlayTrigger(lilithOnPlay),
    ],
    [
      // OP13-114 S-Snake: "[printed text omitted -- pnpm card:text OP13-114]"
      //
      // A 4-cost body off a Life card for one card in hand, and playing it runs its
      // own `[On Play]` -- the debuff in `op13-on-play.ts`.
      "OP13-114",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op13-snake-trigger-cost",
            1,
            { kind: "play", binding: SOURCE_BINDING },
          ),
        },
      },
    ],
    [
      // OP13-115 Paper Art Afterimage: "[Trigger] Draw 1 card."
      "OP13-115",
      { effect: drawOne },
    ],
    [
      // OP13-117 Gum-Gum Dawn Stamp: "[Trigger] Draw 1 card."
      "OP13-117",
      { effect: drawOne },
    ],
  ],
};
