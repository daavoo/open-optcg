/**
 * ST-10 `[Main]` programs: the two Leaders' `[Activate: Main]` and the two
 * `[Main]` Events.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST10-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { donMinus } from "./shared.js";
import { rampActive, rampRested } from "./st10-shared.js";

export const st10MainMechanics: SetMechanics = {
  activateMain: [
    [
      // ST10-001 Trafalgar Law (Leader): three DON!! back to the DON!! deck
      // bounces a small body to the bottom of its owner's deck and replaces it
      // with a 4-cost or cheaper Character out of hand.
      //
      // `to: { player: "owner" }` rather than `"opponent"`: the printed clause
      // says the owner's deck, and the two only agree while the target is the
      // opponent's own card. Bottom of the deck rather than the trash is what
      // makes this removal the Leader is worth three DON!! for -- the body does
      // not come back through a trash-recursion clause.
      //
      // `maxCurrentPower` reads the board, so a Character debuffed under the
      // line this turn is reachable and one carrying a DON!! is not.
      //
      // The two halves are one sentence joined by "and", so they sequence
      // inside the one payment; both are "up to", so either can resolve to
      // nothing without wasting the other.
      "ST10-001",
      {
        oncePerTurn: true,
        requires: { fieldDon: 3 },
        program: {
          effect: donMinus(3, {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCurrentPower: 3_000,
                },
                bind: "st10-law-bounce",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "st10-law-bounce",
                  to: { player: "owner", zone: "deck", position: "bottom" },
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  maxCost: 4,
                },
                bind: "st10-law-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "st10-law-play" },
              },
            ],
          }),
        },
      },
    ],
    [
      // ST10-002 Monkey.D.Luffy (Leader): one active DON!! out of the DON!!
      // deck, at the two ends of the curve.
      //
      // The gate is a disjunction of the empty cost area and the full one, and
      // that shape is the card: it pays the turn the deck has spent everything
      // and again once the deck is ahead, and does nothing in between. Neither
      // half is expressible as a single `field-don` comparison, so it is an
      // `any-of` of two.
      //
      // No `requires`: nothing in the offer gate can ask a disjunction, and the
      // activation is `[Once Per Turn]`, so an offer taken on a board that
      // fails the gate costs the turn's use rather than standing all turn.
      "ST10-002",
      {
        oncePerTurn: true,
        program: {
          effect: {
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
                  value: 8,
                },
              ],
            },
            then: rampActive,
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // ST10-016 Gum-Gum Kong Gatling: 5 DON!! to K.O. a Character up to 7000.
      //
      // `maxCurrentPower`, because the ceiling is read off the board: the
      // Event is the deck's answer to a body the opponent has already pumped,
      // and a debuff played first is meant to bring one inside the line.
      "ST10-016",
      {
        cost: 5,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 7_000,
            },
            bind: "st10-gatling-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "st10-gatling-ko" },
          },
        },
      },
    ],
    [
      // ST10-017 Punk Vise: 3 DON!! to rest a cheap body and take a rested
      // DON!! out of the DON!! deck.
      //
      // `canRest` rather than `rested: false` on the selector: the question the
      // clause asks is whether the Character can be rested at all, which is
      // what a protection clause on the other side answers. The ramp is rested,
      // so the Event costs three now and hands one back next turn.
      "ST10-017",
      {
        cost: 3,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 2,
                  canRest: true,
                },
                bind: "st10-punk-vise-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "st10-punk-vise-rest" },
              },
              rampRested,
            ],
          },
        },
      },
    ],
  ],
};
