/**
 * OP-18's red cards, OP18-001 to OP18-020: every timed clause they print, plus
 * OP18-017's removal replacement. Their continuous text is in
 * `op18-red-static.ts` and the Leader's K.O. draw in `op18-red-reactions.ts`.
 */
import { type CardSelector, type MechanicEffect } from "../mechanics.js";
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { payFromHand } from "./shared.js";

/**
 * "Your Characters with both the {Animal} and {Alabasta} types" -- the
 * archetype's own subject. A single-branch `anyOf` is the conjunction of two
 * exact types: `type` and each branch's `type` are both exact matches on the
 * card's derived identity, and the branch is ANDed with everything else.
 */
export const ANIMAL_ALABASTA: Omit<CardSelector, "player" | "zone"> = {
  category: "character",
  type: "Animal",
  anyOf: [{ type: "Alabasta" }],
};

/** "Up to 1 of your {Alabasta} type Characters gains [Rush] during this turn." */
const alabastaRush = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "self",
    zone: "board",
    category: "character",
    type: "Alabasta",
  },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "grant-keyword",
    binding: bind,
    keyword: "Rush",
    expiresAfterTurns: 0,
  },
});

/**
 * "You may trash 1 Character card with 5000 power or less from your hand: Draw
 * 2 cards and <payoff>" -- OP18-008 Chaka and OP18-013 Pell. The payoff is
 * inside the paid trash, so a hand that cannot pay never reaches it.
 */
const trashFiveThousandThenDraw = (
  bind: string,
  payoff: MechanicEffect,
): MechanicEffect => ({
  kind: "optional",
  effect: payFromHand(
    { player: "self", zone: "hand", category: "character", maxPower: 5_000 },
    bind,
    1,
    {
      kind: "sequence",
      effects: [{ kind: "draw", player: "self", count: 2 }, payoff],
    },
  ),
});

export const op18RedMechanics: SetMechanics = {
  onPlay: [
    [
      // OP18-002 Igaram: `pnpm card:text OP18-002`. Any {Alabasta} card pays,
      // not only a Character.
      "OP18-002",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand", type: "Alabasta" },
            "op18-igaram-cost",
            1,
            { kind: "draw", player: "self", count: 2 },
          ),
        },
      },
    ],
    [
      // OP18-008 Chaka: `pnpm card:text OP18-008`. Its [Rush] behind an
      // {Alabasta} Leader is a static row.
      "OP18-008",
      {
        effect: trashFiveThousandThenDraw("op18-chaka-cost", {
          kind: "grant-keyword",
          binding: SOURCE_BINDING,
          keyword: "Banish",
          expiresAfterTurns: 0,
        }),
      },
    ],
    [
      // OP18-013 Pell: `pnpm card:text OP18-013`. "Trash", not K.O.: the body
      // goes straight to the trash, so no [On K.O.] answers it. "Base power" is
      // `maxPower`, the printed-or-set base the rest of the pool reads.
      "OP18-013",
      {
        effect: trashFiveThousandThenDraw("op18-pell-cost", {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxPower: 3_000,
          },
          bind: "op18-pell-target",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op18-pell-target",
            to: { player: "owner", zone: "trash" },
          },
        }),
      },
    ],
  ],
  onKo: [
    [
      // OP18-010 Tony Tony.Chopper: `pnpm card:text OP18-010`. Printed power,
      // since nothing in the trash can be modified.
      "OP18-010",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            maxPower: 4_000,
          },
          bind: "op18-chopper-return",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op18-chopper-return",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP18-016 Monkey.D.Luffy: `pnpm card:text OP18-016`. Not optional
      // beyond the "up to 1": the play itself is the whole clause.
      "OP18-016",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            type: "Alabasta",
            maxPower: 6_000,
          },
          bind: "op18-luffy-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op18-luffy-play" },
        },
      },
    ],
  ],
  activateMain: [
    [
      // OP18-009 Super Spot-Billed Duck Troops: `pnpm card:text OP18-009`.
      // Trashing itself is the cost and is paid whatever the DON!! count; the
      // nine-DON!! gate is on the payoff only, the same shape as OP16-084.
      "OP18-009",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "field-don",
                    player: "self",
                    operator: "gte",
                    value: 9,
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "hand",
                      category: "character",
                      name: "Karoo",
                    },
                    bind: "op18-duck-troops-play",
                    min: 0,
                    max: 1,
                    effect: { kind: "play", binding: "op18-duck-troops-play" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // OP18-012 Pincers: `pnpm card:text OP18-012`.
      "OP18-012",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", ...ANIMAL_ALABASTA },
          bind: "op18-pincers-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op18-pincers-buff",
            amount: 1_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP18-014 Portgas.D.Ace: `pnpm card:text OP18-014`. What it buys is a
      // second attacker from a Character played this turn.
      "OP18-014",
      { effect: alabastaRush("op18-ace-rush") },
    ],
    [
      // OP18-017 Roronoa Zoro: `pnpm card:text OP18-017`. The replacement half
      // is in `replacement`, below.
      "OP18-017",
      { effect: alabastaRush("op18-zoro-rush") },
    ],
  ],
  onOpponentAttack: [
    [
      // OP18-015 Eyelashes: `pnpm card:text OP18-015`. The Leader gate is on
      // the offer: behind any other Leader the trash buys nothing, and a
      // prompt that pays a Character for nothing is not one to make mid-battle.
      "OP18-015",
      {
        oncePerTurn: false,
        requires: { leaderTypeIncluding: "Alabasta" },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Alabasta",
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      includeLeader: true,
                    },
                    bind: "op18-eyelashes-debuff",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-power",
                      binding: "op18-eyelashes-debuff",
                      amount: -3_000,
                      expiresAfterTurns: 0,
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // OP18-018 Let's Go, Karoo!!: `pnpm card:text OP18-018`.
      "OP18-018",
      {
        cost: 1,
        program: {
          effect: {
            kind: "select",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "Alabasta",
            },
            bind: "op18-lets-go-buff",
            count: "all",
            effect: {
              kind: "modify-power",
              binding: "op18-lets-go-buff",
              amount: 1_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP18-019 Quack!!!: `pnpm card:text OP18-019`. "Base power" of a
      // Character on the field, which `maxPower`/`minPower` read.
      "OP18-019",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                minPower: 7_000,
              },
              operator: "eq",
              value: 0,
            },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op18-quack-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op18-quack-debuff",
                amount: -3_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP18-019 Quack!!!: the [Counter] half, for the Leader only.
      "OP18-019",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP18-020 Stop Fighting!!!: `pnpm card:text OP18-020`.
      //
      // No Counter power: the payoff is a −5000 across the attacker's side,
      // which shrinks the attacker itself. The Life is the cost and is taken
      // whatever the Leader; the payoff wants a [Nefeltari Vivi] Leader. A
      // player with no Life has nothing to pay "all of your Life" with, so the
      // cost is gated on at least one card.
      "OP18-020",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "select",
                    selector: { player: "self", zone: "life" },
                    bind: "op18-stop-fighting-life",
                    count: "all",
                    effect: {
                      kind: "move",
                      binding: "op18-stop-fighting-life",
                      to: { player: "self", zone: "hand" },
                    },
                  },
                  {
                    kind: "if",
                    condition: {
                      kind: "leader-has-name",
                      player: "self",
                      name: "Nefeltari Vivi",
                    },
                    then: {
                      kind: "select",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        includeLeader: true,
                      },
                      bind: "op18-stop-fighting-debuff",
                      count: "all",
                      effect: {
                        kind: "modify-power",
                        binding: "op18-stop-fighting-debuff",
                        amount: -5_000,
                        expiresAfterTurns: 0,
                      },
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
  trigger: [
    [
      // OP18-018 Let's Go, Karoo!!: the [Trigger] half.
      "OP18-018",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", includeLeader: true },
          bind: "op18-lets-go-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op18-lets-go-trigger",
            amount: 2_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
  ],
  replacement: [
    [
      // OP18-017 Roronoa Zoro: `pnpm card:text OP18-017`. "Removed from the
      // field" answers a bounce or a bury as well as a K.O., on either player's
      // turn. Zoro protects itself too: it is an
      // {Alabasta} Character.
      "OP18-017",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        protects: { category: "character", type: "Alabasta" },
        label: "Leader takes −2000",
        cost: { kind: "leader-power-penalty", amount: -2000 },
      },
    ],
  ],
};
