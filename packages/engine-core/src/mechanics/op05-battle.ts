/**
 * OP05 battle-window clauses: `[Counter]` Events, `[When Attacking]`,
 * `[On Your Opponent's Attack]` and `[On Block]`.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP05-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, payFromHand, trashForBattlePower } from "./shared.js";
import {
  costDebuff,
  koCostAtMost,
  playFromHand,
  powerDebuff,
} from "./op08-shared.js";
import { buryCostAtMost, lifeAtMost, restCostAtMost } from "./op07-shared.js";
import {
  bounceEitherCostAtMost,
  debuffLeaderOrCharacter,
  donBehindStrict,
  eightFieldDon,
  koPowerAtMost,
  koRestedCostAtMost,
  revolutionaryArmyBody,
  sourceAtLeast7000,
  sourceHasDon,
} from "./op05-shared.js";
import { lookAndAdd } from "./shared.js";

/**
 * OP05-099 Amazon's dilemma for the attacker: trash the top of their Life, or
 * take −2000 on one of their cards. The *opponent* picks the branch, and a
 * player with no Life left has no first branch to pick -- the debuff simply
 * lands, which is what "if they do not" means when they cannot.
 */
const amazonDilemma: MechanicEffect = {
  kind: "if",
  condition: {
    kind: "zone-count",
    player: "opponent",
    zone: "life",
    operator: "gte",
    value: 1,
  },
  then: {
    kind: "choice",
    chooser: "opponent",
    branches: [
      {
        id: "trash-life",
        label: "Trash the top card of your Life",
        effect: {
          kind: "select",
          selector: { player: "opponent", zone: "life", position: "top" },
          bind: "op05-amazon-life",
          count: 1,
          effect: {
            kind: "move",
            binding: "op05-amazon-life",
            to: { player: "opponent", zone: "trash" },
          },
        },
      },
      {
        id: "take-debuff",
        label: "Keep the Life card and let Amazon give −2000 power",
        effect: debuffLeaderOrCharacter(2_000, "op05-amazon-debuff"),
      },
    ],
  },
  else: debuffLeaderOrCharacter(2_000, "op05-amazon-debuff"),
};

export const op05BattleMechanics: SetMechanics = {
  counterEvent: [
    [
      // OP05-018 Emporio Energy Hormone (3): +3000, then a small Revolutionary
      // Army body out of hand -- on the opponent's turn, so it arrives as a
      // Blocker or a body for the next attack.
      "OP05-018",
      {
        cost: 3,
        power: 3_000,
        program: {
          effect: playFromHand(revolutionaryArmyBody, "op05-hormone-play"),
        },
      },
    ],
    [
      // OP05-037 Because the Side of Justice Will Be Whichever Side Wins!! (0):
      // a hand card for +3000. The trash may be declined, and then nothing
      // gains power, so the power is inside the paid program, not on the entry.
      // `trashFromHand` keeps the offer to a hand that can pay.
      "OP05-037",
      {
        cost: 0,
        trashFromHand: 1,
        power: 0,
        program: trashForBattlePower(3000, "op05-justice-cost"),
      },
    ],
    [
      // OP05-038 Charlestone (2): +4000, then a hand card may buy three DON!!
      // back active -- on the opponent's turn, which is what makes it a Counter
      // the Green deck can afford after blocking.
      "OP05-038",
      {
        cost: 2,
        power: 4_000,
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op05-charlestone-cost",
              1,
              { kind: "activate-don", player: "self", count: 3 },
            ),
          },
        },
      },
    ],
    [
      // OP05-039 Stick-Stickem Meteora (2): +4000, then a rested cost-3 K.O.
      "OP05-039",
      {
        cost: 2,
        power: 4_000,
        program: { effect: koRestedCostAtMost(3, "op05-meteora-ko") },
      },
    ],
    [
      // OP05-095 Dragon Claw (2): +4000, and at fifteen trash a cost-4 K.O.
      "OP05-095",
      {
        cost: 2,
        power: 4_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "trash",
              operator: "gte",
              value: 15,
            },
            then: koCostAtMost(4, "op05-dragon-claw-ko"),
          },
        },
      },
    ],
    [
      // OP05-114 El Thor (1): +2000, and +2000 more once the opponent is down
      // to two Life. The second half is the same battle scalar again, so it is
      // a `battle-power` in the program and the forecast resolves the gate.
      "OP05-114",
      {
        cost: 1,
        power: 2_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "opponent",
              zone: "life",
              operator: "lte",
              value: 2,
            },
            then: { kind: "battle-power", player: "self", amount: 2_000 },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // OP05-005 Karasu: at 7000 or more, −1000 across the table, Leader
      // included -- the same clause its `[On Play]` prints behind a different
      // gate.
      "OP05-005",
      {
        effect: {
          kind: "if",
          condition: sourceAtLeast7000,
          then: debuffLeaderOrCharacter(1_000, "op05-karasu-attack-debuff"),
        },
      },
    ],
    [
      // OP05-014 Pell: with a DON!! on it, −2000 on one Character.
      "OP05-014",
      {
        effect: {
          kind: "if",
          condition: sourceHasDon,
          then: powerDebuff(2_000, "op05-pell-debuff"),
        },
      },
    ],
    [
      // OP05-016 Morley: at 7000 or more, no Blockers this battle. Battle-scoped,
      // so it lives on the attack rather than on the cards -- see
      // `disable-blockers`.
      "OP05-016",
      {
        effect: {
          kind: "if",
          condition: sourceAtLeast7000,
          then: { kind: "disable-blockers" },
        },
      },
    ],
    [
      // OP05-017 Lindbergh: at 7000 or more, a K.O. at 3000 current power.
      "OP05-017",
      {
        effect: {
          kind: "if",
          condition: sourceAtLeast7000,
          then: koPowerAtMost(3_000, "op05-lindbergh-ko"),
        },
      },
    ],
    [
      // OP05-023 Vergo: with a DON!! on it, a rested cost-3 K.O.
      "OP05-023",
      {
        effect: {
          kind: "if",
          condition: sourceHasDon,
          then: koRestedCostAtMost(3, "op05-vergo-ko"),
        },
      },
    ],
    [
      // OP05-026 Sarquiss: with a DON!! on it, once a turn, another Character of
      // cost 3 or more rests so that this one stands back up mid-attack. Nested:
      // no body to rest, no stand.
      "OP05-026",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: sourceHasDon,
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  minCost: 3,
                  rested: false,
                  canRest: true,
                  excludeSource: true,
                },
                bind: "op05-sarquiss-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "rest", binding: "op05-sarquiss-cost" },
                    { kind: "update", binding: SOURCE_BINDING, rested: false },
                  ],
                },
              },
            },
          },
        },
      },
    ],
    [
      // OP05-031 Buffalo: once a turn, with two or more rested Characters, one
      // rested 1-cost stands up. Cost exactly 1: `minCost` and `maxCost`
      // together are how the pool writes an exact figure.
      "OP05-031",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: { zone: "board", category: "character", rested: true },
              operator: "gte",
              value: 2,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                rested: true,
                minCost: 1,
                maxCost: 1,
              },
              bind: "op05-buffalo-stand",
              min: 0,
              max: 1,
              effect: {
                kind: "update",
                binding: "op05-buffalo-stand",
                rested: false,
              },
            },
          },
        },
      },
    ],
    // OP05-041 Sakazuki (Leader): −1 cost on one Character each attack, which
    // is what puts Blue's cost-based bounces and buries one step further.
    ["OP05-041", { effect: costDebuff(1, "op05-sakazuki-debuff") }],
    [
      // OP05-048 Bastille: with a DON!! on it, a cost-2 bury on either side.
      "OP05-048",
      {
        effect: {
          kind: "if",
          condition: sourceHasDon,
          then: buryCostAtMost(2, "op05-bastille-bury"),
        },
      },
    ],
    [
      // OP05-049 Haccha: with a DON!! on it, a cost-3 bounce on either side.
      "OP05-049",
      {
        effect: {
          kind: "if",
          condition: sourceHasDon,
          then: bounceEitherCostAtMost(3, "op05-haccha-bounce"),
        },
      },
    ],
    [
      // OP05-061 Uso-Hachi: with a DON!! on it and eight on the field, a cost-4
      // rest. One `all-of` rather than two `if`s, so the offer gate reads the
      // whole condition.
      "OP05-061",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [sourceHasDon, eightFieldDon],
          },
          then: restCostAtMost(4, "op05-usohachi-rest"),
        },
      },
    ],
    [
      // OP05-067 Zoro-Juurou: at three Life or less, an active DON!! from the
      // DON!! deck on every attack.
      "OP05-067",
      {
        effect: {
          kind: "if",
          condition: lifeAtMost(3),
          then: { kind: "add-don", player: "self", count: 1, rested: false },
        },
      },
    ],
    [
      // OP05-069 Trafalgar Law: behind on DON!!, a five-deep dig for a Heart
      // Pirates card.
      "OP05-069",
      {
        effect: {
          kind: "if",
          condition: donBehindStrict,
          then: lookAndAdd(5, "op05-law-look", { type: "Heart Pirates" })
            .effect,
        },
      },
    ],
    [
      // OP05-071 Bepo: behind on DON!!, −2000 on one Character.
      "OP05-071",
      {
        effect: {
          kind: "if",
          condition: donBehindStrict,
          then: powerDebuff(2_000, "op05-bepo-debuff"),
        },
      },
    ],
    [
      // OP05-080 Elizabello II: once a turn, twenty trash cards shuffled back
      // into the deck buy [Double Attack] and +10000 for the battle. The
      // keyword is granted for the turn, which is the same battle: a Character
      // attacks once. Which twenty is the player's, so it is a `choose`; the
      // shuffle afterwards is what keeps the order they went back in from
      // mattering.
      "OP05-080",
      {
        oncePerTurn: true,
        program: {
          effect: {
            // The outer gate keeps the "you may" off a trash that cannot pay:
            // an `optional` is offered whatever its inner `choose` can find,
            // and taking it would spend the `[Once Per Turn]` on nothing.
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "trash",
              operator: "gte",
              value: 20,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: { player: "self", zone: "trash" },
                bind: "op05-elizabello-cost",
                min: 20,
                max: 20,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op05-elizabello-cost",
                      to: { player: "self", zone: "deck", position: "bottom" },
                    },
                    { kind: "shuffle-deck", player: "self" },
                    {
                      kind: "grant-keyword",
                      binding: SOURCE_BINDING,
                      keyword: "Double Attack",
                      expiresAfterTurns: 0,
                    },
                    { kind: "battle-power", player: "self", amount: 10_000 },
                  ],
                },
              },
            },
          },
        },
      },
    ],
    [
      // OP05-087 Hakuba: with a DON!! on it, one of the controller's other
      // Characters dies for −5 cost on an opposing one -- the Black deck's own
      // bodies are the fuel. Nested: nothing to K.O., no debuff. The K.O. is
      // the cost, so a Character that cannot be K.O.'d, or that a replacement
      // keeps on the field, pays nothing and buys nothing (Bandai's OP05-087#1
      // and #2): the debuff waits for the chosen card to reach the trash.
      "OP05-087",
      {
        effect: {
          kind: "if",
          condition: sourceHasDon,
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
              bind: "op05-hakuba-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "knock-out", binding: "op05-hakuba-cost" },
                  {
                    kind: "if",
                    condition: {
                      kind: "selector-count",
                      player: "self",
                      selector: { zone: "trash", binding: "op05-hakuba-cost" },
                      operator: "gte",
                      value: 1,
                    },
                    then: costDebuff(5, "op05-hakuba-debuff"),
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP05-029 Donquixote Doflamingo: once a turn, a DON!! rested for a cost-6
      // rest on the attacker's side -- Green's answer to a second attacker.
      "OP05-029",
      {
        oncePerTurn: true,
        requires: { activeDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                restCostAtMost(6, "op05-doflamingo-rest"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP05-075 Mr.1(Daz.Bonez): once a turn, `DON!! −1` for a Baroque Works
      // body of cost 3 or less out of hand, mid-attack -- a Blocker arriving
      // exactly when it is needed.
      "OP05-075",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: donMinus(
            1,
            playFromHand(
              { category: "character", type: "Baroque Works", maxCost: 3 },
              "op05-mr1-play",
            ),
          ),
        },
      },
    ],
    [
      // OP05-099 Amazon: rests itself to put the attacker to a choice -- their
      // top Life card, or −2000 on one of their cards.
      "OP05-099",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                amazonDilemma,
              ],
            },
          },
        },
      },
    ],
  ],
  onBlock: [
    [
      // OP05-036 Monet: a cost-4 rest when it blocks, which stops the second
      // attack the block just absorbed the first of.
      "OP05-036",
      {
        oncePerTurn: false,
        program: { effect: restCostAtMost(4, "op05-monet-rest") },
      },
    ],
    [
      // OP05-047 Basil Hawkins: with three or fewer in hand when it blocks, a
      // card and +1000 for the battle. The hand gate covers both halves --
      // at four or more neither happens (Bandai's OP05-047#1) -- and is read
      // once, on the block, not again in the Counter Step (OP05-047#2).
      "OP05-047",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "hand",
              operator: "lte",
              value: 3,
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "draw", player: "self", count: 1 },
                { kind: "battle-power", player: "self", amount: 1_000 },
              ],
            },
          },
        },
      },
    ],
  ],
};
