/**
 * ST-22 `[Main]` programs: three `[Activate: Main]` -- the Leader, Oden and
 * Squard -- and two `[Main]` Events.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST22-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { revealTwoWhitebeard, whitebeardLeader } from "./op08-shared.js";
import { lifeToHandCost } from "./shared.js";
import { revealTopWhitebeard } from "./st22-shared.js";

/** "Up to 1 of your Leader gains +N power", for `expiresAfterTurns`. */
const buffLeader = (
  bind: string,
  amount: number,
  expiresAfterTurns: number,
): MechanicEffect => ({
  kind: "select",
  selector: { player: "self", zone: [], includeLeader: true },
  bind,
  count: 1,
  effect: { kind: "modify-power", binding: bind, amount, expiresAfterTurns },
});

export const st22MainMechanics: SetMechanics = {
  activateMain: [
    [
      // ST22-001 Ace & Newgate (Leader): show an on-type card, draw one, and
      // the shown card goes back on top -- a filter that trades a card you
      // hold for the one under it, and sets up the next top-of-deck reveal
      // with a known hit.
      //
      // The draw comes first, as printed, so the card drawn is the one that
      // was on top before the shown card is placed there. `handCardsMatching`
      // keeps the turn's one use from being spent with nothing to show.
      "ST22-001",
      {
        oncePerTurn: true,
        requires: {
          handCardsMatching: {
            match: { typeIncluding: "Whitebeard Pirates" },
            count: 1,
          },
        },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                typeIncluding: "Whitebeard Pirates",
              },
              bind: "st22-leader-reveal",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "reveal", binding: "st22-leader-reveal" },
                  { kind: "draw", player: "self", count: 1 },
                  {
                    kind: "move",
                    binding: "st22-leader-reveal",
                    to: { player: "self", zone: "deck", position: "top" },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // ST22-005 Kouzuki Oden: three active DON!! and a Character of your own
      // back to hand set Oden active again -- a second attack, or a Blocker
      // body for the opponent's turn, and a way to replay an [On Play].
      //
      // The returned Character is chosen first and the DON!! rested inside
      // it, so the two halves of the cost are paid together or not at all.
      // The outer `if` withholds the offer on a board with nothing else to
      // return, and `sourceRested` withholds it while Oden is already active,
      // where the payout would set nothing.
      "ST22-005",
      {
        oncePerTurn: true,
        requires: { activeDon: 3, sourceRested: true },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                excludeSource: true,
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  excludeSource: true,
                },
                bind: "st22-oden-return",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "rest-don", player: "self", count: 3 },
                    {
                      kind: "move",
                      binding: "st22-oden-return",
                      to: { player: "owner", zone: "hand" },
                    },
                    {
                      kind: "update",
                      binding: SOURCE_BINDING,
                      rested: false,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
    [
      // ST22-007 Squard: once a turn, a top-of-deck reveal that hands out a
      // rested DON!! on a hit. `restedDon` is the gate: with every DON!!
      // active the payout can move nothing, and the reveal alone would spend
      // the turn's use.
      "ST22-007",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: revealTopWhitebeard("st22-squard-top", {
            kind: "give-rested-don",
            player: "self",
            count: 1,
          }),
        },
      },
    ],
  ],
  eventMain: [
    [
      // ST22-015 I Am Whitebeard!!: an [Edward.Newgate] out of hand behind a
      // {Whitebeard Pirates} Leader, then a Life card for +2000 on the Leader
      // through the opponent's next turn.
      //
      // The Leader condition governs the play alone; the Life half is its own
      // "Then" sentence and is paid behind any Leader. "If you do" nests the
      // buff inside the Life cost, so declining the cost declines the buff.
      "ST22-015",
      {
        cost: 8,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "if",
                condition: whitebeardLeader,
                then: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    category: "character",
                    name: "Edward.Newgate",
                  },
                  bind: "st22-whitebeard-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "st22-whitebeard-play" },
                },
              },
              lifeToHandCost(buffLeader("st22-whitebeard-buff", 2_000, 1))
                .effect,
            ],
          },
        },
      },
    ],
    [
      // ST22-017 Fire Fist: two on-type cards shown from hand for a card and
      // a cost-5-or-less Character to the bottom of its owner's deck. Both
      // halves sit behind the reveal: the "Then" continues the payout the
      // colon introduced. "Up to 1 Character" names neither side, so the
      // selector reaches both and the card goes to its owner.
      "ST22-017",
      {
        cost: 5,
        program: {
          effect: revealTwoWhitebeard("st22-fire-fist-reveal", {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "either",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                },
                bind: "st22-fire-fist-bury",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "st22-fire-fist-bury",
                  to: { player: "owner", zone: "deck", position: "bottom" },
                },
              },
            ],
          }),
        },
      },
    ],
  ],
};
