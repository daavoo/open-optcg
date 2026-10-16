/**
 * OP13 `[On Play]` programs.
 *
 * OP13 "Carrying On His Will" is a whole 120-card series -- the one set in the
 * pool with a third Secret rather than the standard two -- split by timing window
 * the way OP10-OP12 and OP14-OP17 are.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  addRestedDon,
  anyGivenDon,
  filmOrStrawHatLeader,
  opponentLifeToTheirHand,
  setDonActive,
} from "./op13-shared.js";
import { turnLifeFaceUp } from "./op11-shared.js";
import {
  donMinus,
  lookAndAdd,
  lookAndAddOrTrash,
  payFromHand,
} from "./shared.js";

/** "Give up to N rested DON!! cards to 1 of your [X] cards." */
const giveRestedDonToNamed = (
  name: string,
  count: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "board", includeLeader: true, name },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "attach-don",
    player: "self",
    from: "rested",
    count,
    target: { binding: bind },
  },
});

/** "Play up to 1 [Boa Hancock] with a cost of N or less from your hand." */
const playHancock = (maxCost: number, bind: string): MechanicEffect => ({
  kind: "if",
  condition: { kind: "leader-has-name", player: "self", name: "Boa Hancock" },
  then: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "hand",
      category: "character",
      name: "Boa Hancock",
      maxCost,
    },
    bind,
    min: 0,
    max: 1,
    effect: { kind: "play", binding: bind },
  },
});

export const op13OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP13-006 Woop Slap: "[printed text omitted -- pnpm card:text OP13-006]"
      //
      // "Cards", so the Leader qualifies -- and behind the OP13-001 Leader it is
      // usually the target, because a Leader that carries DON!! attacks for more
      // every turn rather than for one.
      "OP13-006",
      { effect: giveRestedDonToNamed("Monkey.D.Luffy", 2, "op13-woop-slap") },
    ],
    [
      // OP13-012 Nefeltari Vivi: "[printed text omitted -- pnpm card:text OP13-012]"
      "OP13-012",
      lookAndAdd(4, "op13-vivi-look", {
        anyOf: [{ type: "Alabasta" }, { type: "Straw Hat Crew" }],
        minCost: 2,
      }),
    ],
    [
      // OP13-013 Higuma: "[printed text omitted -- pnpm card:text OP13-013]"
      //
      // Current power, so this only ever reaches a body something else has
      // already shrunk -- which in Red is what OP13-020 Meteor Fist and OP13-021
      // Gum-Gum Gatling Gun are for.
      "OP13-013",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCurrentPower: 0,
          },
          bind: "op13-higuma-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op13-higuma-ko" },
        },
      },
    ],
    [
      // OP13-023 Uta: "[printed text omitted -- pnpm card:text OP13-023]" Its `[On K.O.]` half is in `op13-triggers.ts`.
      //
      // The refund is real tempo and the ban is what pays for it: a cost floor,
      // so the cheap half of the hand is still playable.
      "OP13-023",
      {
        effect: {
          kind: "sequence",
          effects: [
            setDonActive(2),
            {
              kind: "restrict-player",
              player: "self",
              restriction: "cannot-play-characters",
              minBaseCost: 5,
              expiresAfterTurns: 0,
            },
          ],
        },
      },
    ],
    [
      // OP13-024 Gordon: "[printed text omitted -- pnpm card:text OP13-024]"
      //
      // At the *end* of the turn, so the DON!! comes back after it has been
      // spent -- which is what makes a 1-cost body a ramp card rather than a
      // refund.
      "OP13-024",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              anyOf: [{ type: "Music" }, { type: "FILM" }],
            },
            bind: "op13-gordon-reveal",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "reveal", binding: "op13-gordon-reveal" },
                {
                  kind: "activate-don-at-end-of-turn",
                  player: "self",
                  count: 2,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP13-025 Koby: "[printed text omitted -- pnpm card:text OP13-025]"
      //
      // A type *or* an attribute, which is unusual enough to be worth stating:
      // the clause is written so the Green FILM deck and the Red/Green
      // Monkey.D.Luffy deck can both play it.
      "OP13-025",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              { kind: "leader-has-type", player: "self", type: "FILM" },
              {
                kind: "leader-has-attribute",
                player: "self",
                attribute: "Strike",
              },
            ],
          },
          then: setDonActive(1),
        },
      },
    ],
    [
      // OP13-027 Sanji: "[printed text omitted -- pnpm card:text OP13-027]" Its
      // `[End of Your Turn]` half is in `op13-triggers.ts`.
      "OP13-027",
      { effect: setDonActive(2) },
    ],
    [
      // OP13-028 Shanks: "[printed text omitted -- pnpm card:text OP13-028]"
      //
      // A 10-cost body that refunds the whole turn and then bars spending it --
      // every category, not only Characters, which is what
      // `cannot-play-from-hand` is for. `activate-don` with a count of ten is
      // "all": the node takes what is there.
      "OP13-028",
      {
        effect: {
          kind: "sequence",
          effects: [
            setDonActive(10),
            {
              kind: "restrict-player",
              player: "self",
              restriction: "cannot-play-from-hand",
              expiresAfterTurns: 0,
            },
          ],
        },
      },
    ],
    [
      // OP13-030 Tony Tony.Chopper: "[printed text omitted -- pnpm card:text OP13-030]"
      "OP13-030",
      { effect: setDonActive(2) },
    ],
    [
      // OP13-032 Nico Robin: "[printed text omitted -- pnpm card:text OP13-032]"
      //
      // A Character that cannot rest can neither attack nor block, so this is
      // removal that leaves the body -- and it lasts through the turn its
      // controller would have used it on.
      "OP13-032",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 8,
          },
          bind: "op13-robin-lock",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "op13-robin-lock",
            restriction: "cannot-rest",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP13-034 Brook: "[printed text omitted -- pnpm card:text OP13-034]"
      "OP13-034",
      {
        effect: {
          kind: "if",
          condition: filmOrStrawHatLeader,
          then: setDonActive(1),
        },
      },
    ],
    [
      // OP13-037 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP13-037]" Its
      // `[End of Your Turn]` half is in `op13-triggers.ts`.
      "OP13-037",
      {
        effect: {
          kind: "if",
          condition: filmOrStrawHatLeader,
          then: setDonActive(2),
        },
      },
    ],
    [
      // OP13-041 Izo: "[On Play] Draw 2 cards." A 6-cost body that replaces
      // itself, which is what the Blue Whitebeard deck pays six DON!! for.
      "OP13-041",
      { effect: { kind: "draw", player: "self", count: 2 } },
    ],
    [
      // OP13-043 Otama: "[printed text omitted -- pnpm card:text OP13-043]"
      "OP13-043",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 3,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op13-otama-trash",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op13-otama-trash",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP13-050 Boa Sandersonia: "[printed text omitted -- pnpm card:text OP13-050]"
      "OP13-050",
      { effect: playHancock(3, "op13-sandersonia-play") },
    ],
    [
      // OP13-052 Boa Marigold: the same clause, six costs deep.
      "OP13-052",
      { effect: playHancock(6, "op13-marigold-play") },
    ],
    [
      // OP13-061 Inuarashi: "[printed text omitted -- pnpm card:text OP13-061]"
      //
      // Both halves are behind the gate -- "Then" continues the conditional
      // sentence -- which is what makes the Purple package's own DON!!-attaching
      // clauses load-bearing rather than incidental.
      "OP13-061",
      {
        effect: {
          kind: "if",
          condition: anyGivenDon,
          then: {
            kind: "sequence",
            effects: [
              addRestedDon,
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 1,
                },
                bind: "op13-inuarashi-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op13-inuarashi-ko" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP13-062 Crocus: "[printed text omitted -- pnpm card:text OP13-062]" Its
      // `[When Attacking]` half is in `op13-battle.ts`.
      //
      // *Active*, unlike the rest of the package: this one pays on the turn it
      // lands.
      "OP13-062",
      {
        effect: {
          kind: "if",
          condition: anyGivenDon,
          then: { kind: "add-don", player: "self", count: 1, rested: false },
        },
      },
    ],
    [
      // OP13-063 Kouzuki Oden: "[printed text omitted -- pnpm card:text OP13-063]"
      "OP13-063",
      { effect: { kind: "if", condition: anyGivenDon, then: addRestedDon } },
    ],
    [
      // OP13-064 Gol.D.Roger: "[printed text omitted -- pnpm card:text OP13-064]"
      //
      // Both halves outlive the turn, which is what a 10-cost body buys: the
      // Leader defends at +2000 through the opponent's swing back, and their
      // whole board is 2000 smaller for it. Its continuous negation aura is a
      // static ability.
      "OP13-064",
      {
        effect: donMinus(3, {
          kind: "sequence",
          effects: [
            {
              kind: "select",
              selector: { player: "self", zone: [], includeLeader: true },
              bind: "op13-roger-leader",
              count: "all",
              effect: {
                kind: "modify-power",
                binding: "op13-roger-leader",
                amount: 2_000,
                expiresAfterTurns: 1,
              },
            },
            {
              kind: "select",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op13-roger-debuff",
              count: "all",
              effect: {
                kind: "modify-power",
                binding: "op13-roger-debuff",
                amount: -2_000,
                expiresAfterTurns: 1,
              },
            },
          ],
        }),
      },
    ],
    [
      // OP13-065 Shanks: "[printed text omitted -- pnpm card:text OP13-065]"Roger Pirates"[printed text omitted -- pnpm card:text OP13-065]"
      //
      // "A type including", so {Former Roger Pirates} qualifies -- which is half
      // the package.
      "OP13-065",
      lookAndAdd(5, "op13-shanks-look", {
        typeIncluding: "Roger Pirates",
        excludeName: "Shanks",
      }),
    ],
    [
      // OP13-066 Silvers Rayleigh: "[printed text omitted -- pnpm card:text OP13-066]"
      //
      // The DON!! is booked for the end of the turn, so an 8-cost [Rush] body
      // attacks now and pays for the *next* turn -- see `add-don-at-end-of-turn`.
      "OP13-066",
      {
        effect: {
          kind: "if",
          condition: anyGivenDon,
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                  canRest: true,
                },
                bind: "op13-rayleigh-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "op13-rayleigh-rest" },
              },
              { kind: "add-don-at-end-of-turn", player: "self", count: 1 },
            ],
          },
        },
      },
    ],
    [
      // OP13-067 Scopper Gaban: "[printed text omitted -- pnpm card:text OP13-067]"Roger
      // Pirates"[printed text omitted -- pnpm card:text OP13-067]"
      "OP13-067",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-type-including",
            player: "self",
            text: "Roger Pirates",
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op13-gaban-trash",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op13-gaban-trash",
                  to: { player: "self", zone: "trash" },
                },
              },
              addRestedDon,
            ],
          },
        },
      },
    ],
    [
      // OP13-068 Douglas Bullet: "[printed text omitted -- pnpm card:text OP13-068]"Roger
      // Pirates"[printed text omitted -- pnpm card:text OP13-068]" Its
      // own +2000 at eight DON!! is a static ability.
      "OP13-068",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-type-including",
            player: "self",
            text: "Roger Pirates",
          },
          then: addRestedDon,
        },
      },
    ],
    [
      // OP13-069 Tom: "[printed text omitted -- pnpm card:text OP13-069]"
      //
      // The only Stage recursion in the set, and what the Black Imu deck's Stage
      // package is played with.
      "OP13-069",
      {
        effect: donMinus(1, {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "stage",
            maxCost: 3,
          },
          bind: "op13-tom-recur",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op13-tom-recur",
            to: { player: "self", zone: "hand" },
          },
        }),
      },
    ],
    [
      // OP13-071 Nekomamushi: "[printed text omitted -- pnpm card:text OP13-071]"
      "OP13-071",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 8,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxPower: 3_000,
            },
            bind: "op13-nekomamushi-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op13-nekomamushi-ko" },
          },
        },
      },
    ],
    [
      // OP13-072 Buggy: "[printed text omitted -- pnpm card:text OP13-072]"Roger Pirates"[printed text omitted -- pnpm card:text OP13-072]"
      "OP13-072",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "leader-type-including",
                player: "self",
                text: "Roger Pirates",
              },
              anyGivenDon,
            ],
          },
          then: addRestedDon,
        },
      },
    ],
    [
      // OP13-074 Hera: "[printed text omitted -- pnpm card:text OP13-074]"
      "OP13-074",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            type: "Homies",
            maxPower: 3_000,
          },
          bind: "op13-hera-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op13-hera-play" },
        },
      },
    ],
    [
      // OP13-083 St. Jaygarcia Saturn: "[printed text omitted -- pnpm card:text OP13-083]" Its
      // trash-gated removal immunity is a static ability.
      "OP13-083",
      lookAndAdd(5, "op13-saturn-look", { type: "Five Elders" }),
    ],
    [
      // OP13-086 Saint Shalria: "[printed text omitted -- pnpm card:text OP13-086]"
      //
      // Two trashes, which is the point: the Black deck's own payoffs read the
      // trash at seven cards and again at ten.
      "OP13-086",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAddOrTrash(3, "op13-shalria-look", {
              type: "Celestial Dragons",
              excludeName: "Saint Shalria",
            }).effect,
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op13-shalria-trash",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op13-shalria-trash",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP13-087 Saint Charlos: "[Blocker] [On Play] Trash 1 card from the top of
      // your deck."
      "OP13-087",
      { effect: { kind: "trash-top", player: "self", count: 1 } },
    ],
    [
      // OP13-091 St. Marcus Mars: "[printed text omitted -- pnpm card:text OP13-091]"
      "OP13-091",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op13-mars-cost",
            1,
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxBaseCost: 5,
              },
              bind: "op13-mars-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op13-mars-ko" },
            },
          ),
        },
      },
    ],
    [
      // OP13-092 Saint Mjosgard: "[printed text omitted -- pnpm card:text OP13-092]"
      //
      // A Stage played by an effect, which is the second such clause in the pool
      // after OP12-080 Baratie's own Trigger.
      "OP13-092",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 3,
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              category: "stage",
              type: "Mary Geoise",
              minBaseCost: 1,
              maxBaseCost: 1,
            },
            bind: "op13-mjosgard-stage",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op13-mjosgard-stage" },
          },
        },
      },
    ],
    [
      // OP13-093 Morgans: "[printed text omitted -- pnpm card:text OP13-093]"
      "OP13-093",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op13-morgans-trash",
              min: 2,
              max: 2,
              effect: {
                kind: "move",
                binding: "op13-morgans-trash",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP13-094 York: "[printed text omitted -- pnpm card:text OP13-094]"
      "OP13-094",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "Celestial Dragons",
          },
          bind: "op13-york-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op13-york-buff",
            amount: 2_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP13-095 Saint Rosward: "[printed text omitted -- pnpm card:text OP13-095]"
      //
      // "Only" is a universal -- see `every-character-matches` -- and it is what
      // the Black deck pays for playing nothing off-type.
      "OP13-095",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op13-rosward-cost",
            1,
            {
              kind: "if",
              condition: {
                kind: "every-character-matches",
                player: "self",
                selector: { zone: "board", type: "Celestial Dragons" },
              },
              then: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxBaseCost: 3,
                },
                bind: "op13-rosward-ko",
                min: 0,
                max: 2,
                effect: { kind: "knock-out", binding: "op13-rosward-ko" },
              },
            },
          ),
        },
      },
    ],
    [
      // OP13-105 Kouzuki Momonosuke: "[printed text omitted -- pnpm card:text OP13-105]"
      //
      // Information plus one real decision: which cards go to the bottom. The
      // look is private (see `look-at`'s `zone`), and every card the player picks
      // moves to the bottom of the pile in the order they pick them -- which is
      // how "in any order" is reachable through a choice the engine can offer.
      // Five is the Life ceiling in this format, so the look sees the whole pile.
      "OP13-105",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 5,
              bind: "op13-momonosuke",
              zone: "life",
            },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "life",
                binding: "op13-momonosuke",
              },
              bind: "op13-momonosuke-bottom",
              min: 0,
              max: 5,
              effect: {
                kind: "move",
                binding: "op13-momonosuke-bottom",
                to: { player: "self", zone: "life", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP13-108 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP13-108]"
      //
      // The opponent's Life-to-hand is the "Then" of the {Egghead} Leader
      // condition, not a sentence of its own: Bandai's OP-13 Q&A (OP13-108#1)
      // has no card handed over behind any other Leader.
      "OP13-108",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Egghead",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "grant-keyword",
                binding: SOURCE_BINDING,
                keyword: "Rush",
                expiresAfterTurns: 0,
              },
              opponentLifeToTheirHand("op13-bonney-life"),
            ],
          },
        },
      },
    ],
    [
      // OP13-110 Stussy: "[printed text omitted -- pnpm card:text OP13-110]"
      //
      // `hasTrigger` is a printed fact, which is what makes the Yellow Egghead
      // deck's Trigger-heavy build a resource rather than a coincidence.
      "OP13-110",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Egghead",
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              maxCost: 5,
              hasTrigger: true,
            },
            bind: "op13-stussy-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op13-stussy-play" },
          },
        },
      },
    ],
    [
      // OP13-113 Lilith: "[printed text omitted -- pnpm card:text OP13-113]"
      // Its `[Trigger]` activates the same clause.
      "OP13-113",
      lookAndAdd(4, "op13-lilith-look", {
        hasTrigger: true,
        excludeName: "Lilith",
      }),
    ],
    [
      // OP13-114 S-Snake: "[printed text omitted -- pnpm card:text OP13-114]" The `[When Attacking]` half is the same
      // program, in `op13-battle.ts`.
      "OP13-114",
      turnLifeFaceUp("op13-snake-cost", {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
        },
        bind: "op13-snake-debuff",
        min: 0,
        max: 1,
        effect: {
          kind: "modify-power",
          binding: "op13-snake-debuff",
          amount: -2_000,
          expiresAfterTurns: 0,
        },
      }),
    ],
    [
      // OP13-118 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP13-118]"
      "OP13-118",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-multicolored", player: "self" },
          then: {
            kind: "sequence",
            effects: [
              setDonActive(4),
              {
                kind: "restrict-player",
                player: "self",
                restriction: "cannot-play-characters",
                minBaseCost: 5,
                expiresAfterTurns: 0,
              },
            ],
          },
        },
      },
    ],
    [
      // OP13-119 Portgas.D.Ace: "[printed text omitted -- pnpm card:text OP13-119]"
      //
      // The compensation is the *opponent's* play, off their own hand and onto
      // their own board -- which is what `play`'s `player` field is for, and why
      // the choice of card is theirs (`chooser`). "If you do" is what makes it a
      // consequence rather than a gift: declining the bounce gives them nothing.
      "OP13-119",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "attach-don",
              player: "self",
              from: "rested",
              count: 1,
              target: "leader",
            },
            {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                },
                bind: "op13-ace-bounce",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op13-ace-bounce",
                      to: { player: "owner", zone: "hand" },
                    },
                    {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "hand",
                        category: "character",
                        maxCost: 4,
                      },
                      chooser: "opponent",
                      bind: "op13-ace-their-play",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "play",
                        binding: "op13-ace-their-play",
                        player: "opponent",
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ],
  ],
};

export { giveRestedDonToNamed };
