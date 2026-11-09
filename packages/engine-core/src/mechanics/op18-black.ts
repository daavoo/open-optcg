/**
 * OP-18's Black cards (OP18-080 to OP18-097, OP18-119 Saint Shamrock and the
 * Red/Black Event OP18-095): every timed clause, one module for the colour.
 *
 * The set is provisional: the records come from an English rendering of the
 * Japanese cards (see `packages/cards/src/op18.ts`). Where that rendering and
 * the Japanese text disagree on what a card does, these programs follow the
 * Japanese text, and the entry says so.
 */
import {
  SOURCE_BINDING,
  type CardSelector,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  lookAndAdd,
  lookAndAddOrTrash,
  payFromHand,
  playThrillerBarkFromTrashRested,
} from "./shared.js";

/** "{Holy Knights of God} type Character card with a cost of 6 or less from your trash". */
const holyKnightInTrash: CardSelector = {
  player: "self",
  zone: "trash",
  category: "character",
  type: "Holy Knights of God",
  maxCost: 6,
};

const playHolyKnightFromTrash = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: holyKnightInTrash,
  bind,
  min: 0,
  max: 1,
  effect: { kind: "play", binding: bind },
});

/**
 * "You may trash N cards from your hand: play this Character card from your
 * trash" -- the [On K.O.] the Holy Knights print, at one or two cards.
 *
 * The card is in the trash by the time an [On K.O.] dispatches, so
 * `SOURCE_BINDING` finds it there (OP16-014 Marco's shape). Gated on the hand
 * holding the price first, so a player who cannot pay is not asked.
 */
const replayFromTrash = (
  count: number,
  bind: string,
  payoff: MechanicEffect = { kind: "play", binding: SOURCE_BINDING },
): MechanicProgram => ({
  effect: {
    kind: "if",
    condition: {
      kind: "zone-count",
      player: "self",
      zone: "hand",
      operator: "gte",
      value: count,
    },
    then: {
      kind: "optional",
      effect: payFromHand(
        { player: "self", zone: "hand" },
        bind,
        count,
        payoff,
      ),
    },
  },
});

/**
 * OP18-095's search: [Sleeptids] or a {Holy Knights of God} card, behind a
 * {Celestial Dragons} Leader. The Leader condition is in the Japanese text
 * (自分のリーダーが特徴《天竜人》を持つ場合) and missing from the provisional
 * English rendering. Shared by the [Main] and the [Trigger], which activates
 * that same effect.
 */
const lateSearch: MechanicProgram = {
  effect: {
    kind: "if",
    condition: {
      kind: "leader-has-type",
      player: "self",
      type: "Celestial Dragons",
    },
    then: lookAndAdd(5, "op18-095-look", {
      anyOf: [{ name: "Sleeptids" }, { type: "Holy Knights of God" }],
    }).effect,
  },
};

export const op18BlackMechanics: SetMechanics = {
  onPlay: [
    [
      // OP18-083 Saint Killingham: [Your Turn] [On Play]. A Character played
      // on the opponent's turn (a Trigger, a Counter) gets nothing.
      "OP18-083",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              category: "character",
              name: "Sleeptids",
            },
            bind: "op18-083-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op18-083-play" },
          },
        },
      },
    ],
    [
      // OP18-084 Saint Gunko: look at 4, keep a {Holy Knights of God}, and the
      // rest go to the trash -- which is where its own [Activate: Main] and
      // the set's other Holy Knights recur from.
      "OP18-084",
      lookAndAddOrTrash(4, "op18-084-look", { type: "Holy Knights of God" }),
    ],
    [
      // OP18-088 Saint Sommers: [Your Turn] [On Play], a K.O. by *base* cost
      // behind 6 DON!! on the field.
      "OP18-088",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "turn-player", player: "self" },
              {
                kind: "field-don",
                player: "self",
                operator: "gte",
                value: 6,
              },
            ],
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxBaseCost: 4,
            },
            bind: "op18-088-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op18-088-ko" },
          },
        },
      },
    ],
    [
      // OP18-089 Dorry: one card from hand for one from the opponent's. They
      // choose which of theirs goes, as any discard from a hand is chosen by
      // its owner; `exhaustive` so an opponent holding one card still loses
      // it rather than the clause being skipped.
      "OP18-089",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "hand",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op18-089-cost",
              1,
              {
                kind: "choose",
                selector: { player: "opponent", zone: "hand" },
                bind: "op18-089-discard",
                min: 1,
                max: 1,
                chooser: "opponent",
                effect: {
                  kind: "move",
                  binding: "op18-089-discard",
                  to: { player: "opponent", zone: "trash" },
                },
              },
            ),
          },
        },
      },
    ],
    [
      // OP18-097 Abyss (Stage): draw first, then mill 2 -- both mandatory.
      "OP18-097",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            { kind: "trash-top", player: "self", count: 2 },
          ],
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // OP18-091 Brogy: a card from hand buys back a Character of cost 2 or
      // less from the trash -- the card just paid may be that Character.
      "OP18-091",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "hand",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op18-091-cost",
              1,
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "trash",
                  category: "character",
                  maxCost: 2,
                },
                bind: "op18-091-return",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op18-091-return",
                  to: { player: "self", zone: "hand" },
                },
              },
            ),
          },
        },
      },
    ],
    [
      // OP18-082 Catarina Devon: EB04-052 Sanji's clause -- the Japanese text
      // is the same sentence. The copy is taken once, as the attack is
      // declared, and lasts the turn.
      "OP18-082",
      {
        effect: {
          kind: "select",
          selector: { player: "opponent", zone: [], includeLeader: true },
          bind: "op18-082-leader",
          count: "all",
          effect: {
            kind: "copy-power",
            from: "op18-082-leader",
            to: SOURCE_BINDING,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
  ],
  onKo: [
    // OP18-080 Van Augur: the [On K.O.] half; its [Your Turn] watcher is in
    // `op18-black-reactions.ts`.
    ["OP18-080", { effect: { kind: "draw", player: "self", count: 1 } }],
    [
      // OP18-082 Catarina Devon: the card is paid before the Leader is
      // checked, so behind a non-{Blackbeard Pirates} Leader the card is spent
      // for nothing -- the order the clause prints. The Japanese text plays
      // it active (no レスト); the provisional English rendering says rested.
      "OP18-082",
      replayFromTrash(1, "op18-082-cost", {
        kind: "if",
        condition: {
          kind: "leader-has-type",
          player: "self",
          type: "Blackbeard Pirates",
        },
        then: { kind: "play", binding: SOURCE_BINDING },
      }),
    ],
    ["OP18-083", replayFromTrash(2, "op18-083-cost")],
    [
      // OP18-086 Goldberg: a parting K.O., by current cost.
      "OP18-086",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 4,
          },
          bind: "op18-086-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op18-086-ko" },
        },
      },
    ],
    ["OP18-088", replayFromTrash(2, "op18-088-cost")],
    ["OP18-119", replayFromTrash(1, "op18-119-cost")],
  ],
  activateMain: [
    [
      // OP18-084 Saint Gunko: four DON!! rested for a Holy Knight out of the
      // trash. No [Once Per Turn]: the DON!! is the only limit.
      "OP18-084",
      {
        oncePerTurn: false,
        requires: { activeDon: 4 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 4 },
              playHolyKnightFromTrash("op18-084-play"),
            ],
          },
        },
      },
    ],
    [
      // OP18-085 Cerberus: bounce itself, then one [Saint Shamrock] gets one
      // of three keywords for the turn -- the player picks which.
      "OP18-085",
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
                  to: { player: "owner", zone: "hand" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    name: "Saint Shamrock",
                  },
                  bind: "op18-085-shamrock",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "choice",
                    branches: (["Rush", "Banish", "Unblockable"] as const).map(
                      (keyword) => ({
                        id: keyword.toLowerCase(),
                        label: `Gain [${keyword}]`,
                        effect: {
                          kind: "grant-keyword",
                          binding: "op18-085-shamrock",
                          keyword,
                          expiresAfterTurns: 0,
                        } satisfies MechanicEffect,
                      }),
                    ),
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP18-119 Saint Shamrock: only the turn it was played -- which
      // includes the turn its own [On K.O.] brought it back.
      "OP18-119",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: { kind: "source-played-this-turn" },
            then: playHolyKnightFromTrash("op18-119-play"),
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      "OP18-094",
      {
        cost: 1,
        program: lookAndAdd(5, "op18-094-look", { type: "Elbaph" }),
      },
    ],
    ["OP18-095", { cost: 1, program: lateSearch }],
    [
      // OP18-096 I'll Make the Call: the three rested DON!! are declared on
      // the offer, so the Event is not offered to a player who cannot rest
      // them.
      "OP18-096",
      {
        cost: 1,
        restDon: 3,
        program: { effect: playHolyKnightFromTrash("op18-096-play") },
      },
    ],
  ],
  counterEvent: [
    [
      // OP18-096: +4000 behind a trash of 10, read before the offer so the
      // summary never promises power the resolution will not add.
      "OP18-096",
      {
        cost: 1,
        power: 4_000,
        powerWhen: {
          kind: "zone-count",
          player: "self",
          zone: "trash",
          operator: "gte",
          value: 10,
        },
      },
    ],
  ],
  trigger: [
    ["OP18-081", playThrillerBarkFromTrashRested],
    ["OP18-094", { effect: { kind: "draw", player: "self", count: 1 } }],
    ["OP18-095", lateSearch],
  ],
};
