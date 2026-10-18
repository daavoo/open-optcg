/**
 * OP05 `[Trigger]` and `[End of Your Turn]` programs.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP05-0xx` prints it from the local cache).
 *
 * OP05-077 Gamma Knife's Trigger was in the pool before the set was, in
 * `op16-enel.ts`, and is not registered here. An Event's `[Trigger]` that
 * reads "activate this card's [Main] effect" is the same program registered
 * twice -- the shape `op17-kaido.ts` established.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { payFromHand } from "./shared.js";
import { playFromHand } from "./op08-shared.js";
import { buffOwnCardForTurn, restCostAtMost } from "./op07-shared.js";
import {
  bounceEitherCostAtMost,
  koCostAtMostOpponentLife,
  koRestedCostAtMost,
  multicoloredLeader,
  revolutionaryArmyBody,
  trashToPlaySelfBehindMulticolor,
} from "./op05-shared.js";
import { fireFist, hinoBirdZap, wanoSearch } from "./op05-main.js";

/** "Add up to 1 DON!! card from your DON!! deck and set it as active." */
const rampActive: MechanicEffect = {
  kind: "add-don",
  player: "self",
  count: 1,
  rested: false,
};

/** "If your Leader is multicolored, play this card." -- OP05-011's Trigger. */
const playSelfBehindMulticolor: MechanicEffect = {
  kind: "if",
  condition: multicoloredLeader,
  then: { kind: "play", binding: SOURCE_BINDING },
};

export const op05TriggerMechanics: SetMechanics = {
  trigger: [
    // OP05-011 Bartholomew Kuma: a 2-cost body off a Life card behind a
    // multicolour Leader.
    ["OP05-011", { effect: playSelfBehindMulticolor }],
    // OP05-016 Morley and OP05-017 Lindbergh: the same arrival, priced at a
    // hand card.
    [
      "OP05-016",
      { effect: trashToPlaySelfBehindMulticolor("op05-morley-trigger") },
    ],
    [
      "OP05-017",
      { effect: trashToPlaySelfBehindMulticolor("op05-lindbergh-trigger") },
    ],
    // OP05-018 Emporio Energy Hormone: the body half of its Counter, for free.
    [
      "OP05-018",
      { effect: playFromHand(revolutionaryArmyBody, "op05-hormone-trigger") },
    ],
    // OP05-019 Fire Fist: its own `[Main]`.
    ["OP05-019", { effect: fireFist }],
    // OP05-020 Four Thousand-Brick Fist: the buff alone, at +1000.
    [
      "OP05-020",
      { effect: buffOwnCardForTurn(1_000, "op05-brick-fist-trigger") },
    ],
    // OP05-037: a cost-4 rest off a Life card.
    ["OP05-037", { effect: restCostAtMost(4, "op05-justice-trigger") }],
    [
      // OP05-038 Charlestone: a cost-3 rest, Leader included -- the only Trigger
      // in the set that can rest the opposing Leader. The ceiling bounds the
      // Characters only; a Leader prints no cost, and `canBeTargeted` exempts
      // it from the bound rather than pricing it at its Life figure.
      "OP05-038",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            includeLeader: true,
            maxCost: 3,
            canRest: true,
          },
          bind: "op05-charlestone-trigger",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op05-charlestone-trigger" },
        },
      },
    ],
    // OP05-039 Stick-Stickem Meteora: a rested cost-5 K.O.
    ["OP05-039", { effect: koRestedCostAtMost(5, "op05-meteora-trigger") }],
    // OP05-057 Hound Blaze: a cost-3 bounce on either side.
    [
      "OP05-057",
      { effect: bounceEitherCostAtMost(3, "op05-hound-blaze-trigger") },
    ],
    [
      // OP05-058 It's a Waste of Human Life!!: every cost-2-or-less Character on
      // both boards under its owner's deck -- the Main's bury one step narrower,
      // and without the hand trim.
      "OP05-058",
      {
        effect: {
          kind: "select",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 2,
          },
          bind: "op05-waste-trigger",
          count: "all",
          effect: {
            kind: "order-to-bottom",
            binding: "op05-waste-trigger",
            byOwner: true,
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // OP05-059 Let Us Begin the World of Violence!!!: two cards behind a
      // multicolour Leader.
      "OP05-059",
      {
        effect: {
          kind: "if",
          condition: multicoloredLeader,
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP05-073 Miss Doublefinger(Zala): `DON!! −1` to arrive off a Life card.
      // Gated on having the DON!!, as every `DON!! −N` in the pool is.
      "OP05-073",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 1 },
                { kind: "play", binding: SOURCE_BINDING },
              ],
            },
          },
        },
      },
    ],
    // OP05-076: its own `[Main]`.
    ["OP05-076", wanoSearch],
    // OP05-078 Punk Rotten: the Purple package's DON!! back, active.
    ["OP05-078", { effect: rampActive }],
    [
      // OP05-094 Haute Couture Patch★Work: two in, one out.
      "OP05-094",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            payFromHand(
              { player: "self", zone: "hand" },
              "op05-patchwork-trigger",
              1,
              {
                kind: "sequence",
                effects: [],
              },
            ),
          ],
        },
      },
    ],
    [
      // OP05-096 I Bid 500 Million!!: a cost-6 body K.O.'d or bounced, the
      // controller's pick once the target is named.
      "OP05-096",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 6,
          },
          bind: "op05-bid-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "choice",
            branches: [
              {
                id: "ko",
                label: "K.O. it",
                effect: { kind: "knock-out", binding: "op05-bid-trigger" },
              },
              {
                id: "bounce",
                label: "Return it to the owner's hand",
                effect: {
                  kind: "move",
                  binding: "op05-bid-trigger",
                  to: { player: "owner", zone: "hand" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP05-105 Satori: a hand card to arrive off a Life card -- a 5-cost
      // 5000 with a 2000 Counter, which is the whole card.
      "OP05-105",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op05-satori-trigger",
            1,
            {
              kind: "play",
              binding: SOURCE_BINDING,
            },
          ),
        },
      },
    ],
    // OP05-106 Shura: a 2-cost body off a Life card, no gate.
    ["OP05-106", { effect: { kind: "play", binding: SOURCE_BINDING } }],
    // OP05-114 El Thor: the Sky Island removal off a Life card.
    ["OP05-114", { effect: koCostAtMostOpponentLife("op05-el-thor-trigger") }],
    [
      // OP05-115 Two-Hundred Million Volts Amaru: two hand cards for the top of
      // the deck onto the top of Life -- Yellow buying its Life back.
      "OP05-115",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op05-amaru-trigger",
            2,
            {
              kind: "select",
              selector: { player: "self", zone: "deck", position: "top" },
              bind: "op05-amaru-life",
              count: 1,
              effect: {
                kind: "move",
                binding: "op05-amaru-life",
                to: { player: "self", zone: "life", position: "top" },
              },
            },
          ),
        },
      },
    ],
    // OP05-116 Hino Bird Zap: its own `[Main]`.
    ["OP05-116", { effect: hinoBirdZap }],
  ],
  onEndOfYourTurn: [
    [
      // OP05-022 Donquixote Rosinante (Leader): stands back up at the end of
      // the turn while the hand is at six or fewer -- so its printed [Blocker]
      // is live on every opposing turn. The first Leader in the pool to print
      // this window, which is why `endTurn` walks the Leader.
      "OP05-022",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "hand",
            operator: "lte",
            value: 6,
          },
          then: {
            kind: "select",
            selector: { player: "self", zone: [], includeLeader: true },
            bind: "op05-rosinante-leader-stand",
            count: "all",
            effect: {
              kind: "update",
              binding: "op05-rosinante-leader-stand",
              rested: false,
            },
          },
        },
      },
    ],
    [
      // OP05-032 Pica: one DON!! rested at the end of the turn for the body to
      // stand up -- a 6000 Blocker on every opposing turn. Its replacement is
      // in `op05-replacements.ts`.
      "OP05-032",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                { kind: "update", binding: SOURCE_BINDING, rested: false },
              ],
            },
          },
        },
      },
    ],
    [
      // OP05-040 Birdcage (Stage): at ten DON!! on the field, every rested
      // Character of cost 5 or less on either board dies and the cage comes
      // down. Its continuous refresh lock is a row in `static-abilities.ts`.
      "OP05-040",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 10,
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "select",
                selector: {
                  player: "either",
                  zone: "board",
                  category: "character",
                  rested: true,
                  maxCost: 5,
                },
                bind: "op05-birdcage-ko",
                count: "all",
                effect: { kind: "knock-out", binding: "op05-birdcage-ko" },
              },
              {
                kind: "move",
                binding: SOURCE_BINDING,
                to: { player: "self", zone: "trash" },
              },
            ],
          },
        },
      },
    ],
  ],
};
