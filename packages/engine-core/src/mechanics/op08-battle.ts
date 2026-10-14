/**
 * OP08 battle-window programs: `[Counter]` Events and `[When Attacking]`.
 *
 * The set prints no `[On Your Opponent's Attack]` and no `[On Block]`, so
 * those two tables are absent.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus } from "./shared.js";
import {
  chopperDig,
  deckTopToLife,
  donMinusOne,
  koCostAtMost,
  playFromHand,
  powerDebuff,
  rampRested,
  restLock,
} from "./op08-shared.js";
import { playRevealedWhitebeard } from "./op08-on-play.js";
import { imperialFlame, munchMunchMutation } from "./op08-main.js";

/** `DON!! -10`, printed once in the set: OP08-119's board wipe. */
const donMinusTen = (effect: MechanicEffect): MechanicEffect =>
  donMinus(10, effect);

/** `[DON!! x N]` on the card carrying the clause. */
const givenDon = (value: number) =>
  ({ kind: "source-attached-don", operator: "gte", value }) as const;

export const op08BattleMechanics: SetMechanics = {
  counterEvent: [
    [
      // OP08-017 I'd Never Shoot You!!!!: the biggest Counter in Red at 2, and
      // the debuff outlives the battle -- "during this turn", so it is a
      // `modify-power` on a chosen card rather than the battle scalar.
      "OP08-017",
      {
        cost: 2,
        power: 4_000,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              includeLeader: true,
            },
            bind: "op08-never-shoot-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op08-never-shoot-debuff",
              amount: -1_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP08-019 Munch-Munch Mutation: the same program its `[Main]` half runs.
      // Both numbers are turn-scoped `modify-power`, so `power` adds nothing to
      // the battle itself -- the buff may land on a Character that is not in
      // the fight.
      "OP08-019",
      { cost: 3, power: 0, program: { effect: munchMunchMutation } },
    ],
    [
      // OP08-054 You Can't Take Our King This Early in the Game.: a Counter
      // that also develops, off the top of the deck.
      "OP08-054",
      {
        cost: 3,
        power: 3_000,
        program: { effect: playRevealedWhitebeard(3, "op08-king-counter") },
      },
    ],
    [
      // OP08-094 Imperial Flame: the same program its `[Main]` half runs.
      "OP08-094",
      { cost: 2, power: 0, program: { effect: imperialFlame } },
    ],
    [
      // OP08-096 People's Dreams Don't Ever End!!: the payout depends on a card
      // nobody has seen yet, so `power` promises nothing and the buff is added
      // by the program once the flip is known. A forecast that said +5000
      // before the trash would be a lie half the time.
      "OP08-096",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "look-at",
                player: "self",
                count: 1,
                bind: "op08-dreams-top",
              },
              { kind: "reveal", binding: "op08-dreams-top" },
              {
                kind: "if",
                condition: {
                  kind: "selector-count",
                  player: "self",
                  selector: {
                    zone: "deck",
                    binding: "op08-dreams-top",
                    minCost: 6,
                  },
                  operator: "gte",
                  value: 1,
                },
                then: { kind: "battle-power", player: "self", amount: 5_000 },
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op08-dreams-top",
                },
                bind: "op08-dreams-trash",
                count: "all",
                effect: {
                  kind: "move",
                  binding: "op08-dreams-trash",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP08-115 The Earth Will Not Lose!: both halves sit behind the Leader
      // gate, so the forecast reads 0 behind any other Leader -- `powerWhen`,
      // which is deterministic from what the defender can already see.
      "OP08-115",
      {
        cost: 1,
        power: 3_000,
        powerWhen: {
          kind: "leader-has-type",
          player: "self",
          type: "Shandian Warrior",
        },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Shandian Warrior",
            },
            then: playFromHand({ name: "Upper Yard" }, "op08-earth-stage"),
          },
        },
      },
    ],
    [
      // OP08-116 Burn Bazooka: a Counter that trades a Life card for a card in
      // hand and then puts a {Shandian Warrior} back on top of Life face-up --
      // which is the Yellow deck's way of choosing what its own Life gives it.
      // Either end of the Life stack may be taken, which is what `edge` names.
      "OP08-116",
      {
        cost: 2,
        power: 4_000,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "edge" },
              bind: "op08-bazooka-life",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op08-bazooka-life",
                    to: { player: "self", zone: "hand" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "hand",
                      type: "Shandian Warrior",
                    },
                    bind: "op08-bazooka-stack",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op08-bazooka-stack",
                      to: { player: "self", zone: "life", position: "top" },
                      faceUp: true,
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // OP08-007 Tony Tony.Chopper: the same program its `[On Play]` runs.
      "OP08-007",
      chopperDig,
    ],
    [
      // OP08-012 Lapins: two DON!! and the right Leader for a kill on attack.
      "OP08-012",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              givenDon(2),
              {
                kind: "leader-has-type",
                player: "self",
                type: "Drum Kingdom",
              },
            ],
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 4_000,
            },
            bind: "op08-lapins-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op08-lapins-ko" },
          },
        },
      },
    ],
    [
      // OP08-014 Wapol: a debuff now and a buff that holds through the
      // opponent's turn, so the body it leaves behind blocks bigger than it
      // attacked.
      "OP08-014",
      {
        effect: {
          kind: "if",
          condition: givenDon(1),
          then: {
            kind: "sequence",
            effects: [
              powerDebuff(2_000, "op08-wapol-debuff"),
              {
                kind: "modify-power",
                binding: SOURCE_BINDING,
                amount: 2_000,
                expiresAfterTurns: 1,
              },
            ],
          },
        },
      },
    ],
    [
      // OP08-024 Concelot: the lock on attack, at cost 4.
      "OP08-024",
      { effect: restLock(4, "op08-concelot-lock") },
    ],
    [
      // OP08-026 Giovanni: the same lock for a DON!!, at cost 1.
      "OP08-026",
      {
        effect: {
          kind: "if",
          condition: givenDon(1),
          then: restLock(1, "op08-giovanni-lock"),
        },
      },
    ],
    [
      // OP08-042 Edward Weevil: "1 Character", so it reaches either side --
      // bouncing one of its own is how the deck re-buys an [On Play].
      "OP08-042",
      {
        effect: {
          kind: "if",
          condition: givenDon(1),
          then: {
            kind: "choose",
            selector: {
              player: "either",
              zone: "board",
              category: "character",
              maxCost: 3,
            },
            bind: "op08-weevil-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op08-weevil-bounce",
              to: { player: "owner", zone: "hand" },
            },
          },
        },
      },
    ],
    [
      // OP08-058 Charlotte Pudding (Leader): ramp bought with information. The
      // two cards are the top two -- the next two the opponent's attacks turn
      // over -- which is what `positionCount` names, and only a face-down card
      // can be turned face-up, so the cost is payable at most twice.
      "OP08-058",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "life",
              position: "top",
              positionCount: 2,
              faceUp: false,
            },
            bind: "op08-pudding-life",
            min: 2,
            max: 2,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "update",
                  binding: "op08-pudding-life",
                  faceUp: true,
                },
                rampRested,
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-061 Charlotte Oven: a DON!! back for a kill, every attack.
      "OP08-061",
      { effect: donMinusOne(koCostAtMost(3, "op08-oven-ko")) },
    ],
    [
      // OP08-081 Guernica: a 1-cost body that answers a Character the SMILE
      // package has already pushed to zero cost, paid for out of a trash full
      // of {CP} cards.
      "OP08-081",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              typeIncluding: "CP",
            },
            bind: "op08-guernica-bury",
            min: 3,
            max: 3,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "order-to-bottom",
                  binding: "op08-guernica-bury",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 0,
                  },
                  bind: "op08-guernica-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op08-guernica-ko" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-085 Jinbe: the kill is paid for by having a big body out, which in
      // Black means the 7-cost Jack or the 9-cost Kaido has already landed.
      "OP08-085",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              givenDon(1),
              {
                kind: "selector-count",
                player: "self",
                selector: {
                  zone: "board",
                  category: "character",
                  minCost: 8,
                },
                operator: "gte",
                value: 1,
              },
            ],
          },
          then: koCostAtMost(4, "op08-jinbe-ko"),
        },
      },
    ],
    [
      // OP08-098 Kalgara (Leader): a free body priced off the DON!! on the
      // field, and the Life card only if one actually lands -- "if you do",
      // which is why the second half is nested inside the `choose`.
      "OP08-098",
      {
        effect: {
          kind: "if",
          condition: givenDon(1),
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              type: "Shandian Warrior",
              maxCostFromFieldDon: "self",
            },
            bind: "op08-kalgara-play",
            min: 0,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "play", binding: "op08-kalgara-play" },
                {
                  kind: "select",
                  selector: { player: "self", zone: "life", position: "top" },
                  bind: "op08-kalgara-life",
                  count: 1,
                  effect: {
                    kind: "move",
                    binding: "op08-kalgara-life",
                    to: { player: "self", zone: "hand" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-111 S-Shark: written as [Unblockable] on the attacker rather than
      // as a `cannot-block` sweep of their board, because the printed clause is
      // scoped to *this battle* and a board-wide lock would also cover every
      // later attack in the turn. The attacker is in one battle, so the two
      // readings differ only in what they would do to a second attack this card
      // never makes.
      "OP08-111",
      {
        effect: {
          kind: "if",
          condition: givenDon(1),
          then: {
            kind: "grant-keyword",
            binding: SOURCE_BINDING,
            keyword: "Unblockable",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP08-119 Kaido & Linlin: ten DON!! back for the board, both sides of
      // it. `excludeSource` is the printed "other than this Character", and the
      // two Life clauses are the payment coming home.
      "OP08-119",
      {
        effect: donMinusTen({
          kind: "sequence",
          effects: [
            {
              kind: "select",
              selector: {
                player: "either",
                zone: "board",
                category: "character",
                excludeSource: true,
              },
              bind: "op08-kaidolinlin-wipe",
              count: "all",
              effect: { kind: "knock-out", binding: "op08-kaidolinlin-wipe" },
            },
            deckTopToLife("op08-kaidolinlin-life"),
            {
              kind: "optional",
              effect: {
                kind: "select",
                selector: { player: "opponent", zone: "life", position: "top" },
                bind: "op08-kaidolinlin-burn",
                count: 1,
                effect: {
                  kind: "move",
                  binding: "op08-kaidolinlin-burn",
                  to: { player: "owner", zone: "trash" },
                },
              },
            },
          ],
        }),
      },
    ],
  ],
};
