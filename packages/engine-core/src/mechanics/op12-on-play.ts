/**
 * OP12 `[On Play]` programs.
 *
 * OP12 "Legacy of the Master" is a whole 119-card series, split by timing window
 * the way OP10, OP11 and OP14-OP17 are: see `mechanics/README.md`.
 *
 * Twenty-four of its identities predate the import, played by
 * `OP12-ROSINANTE-AYASHIZO`; their programs stay in `op12-rosinante.ts`, and
 * twelve more are `LEGACY_IMPERATIVE_CARDS` in `test/card-support.test.ts` with
 * a branch in `engine.ts`/`effects.ts` each. Neither group is re-registered here.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { revealTwoEvents } from "./op12-shared.js";
import { lookAndAdd, lookAndAddOrTrash, payFromHand } from "./shared.js";

/** "If your Leader has the {Revolutionary Army} type" -- Black's gate. */
const revolutionaryArmyLeader = {
  kind: "leader-has-type",
  player: "self",
  type: "Revolutionary Army",
} as const;

/** "Your opponent trashes N cards from their hand", at a hand-size floor. */
const opponentDiscards = (
  floor: number,
  count: number,
  bind: string,
): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "zone-count",
    player: "opponent",
    zone: "hand",
    operator: "gte",
    value: floor,
  },
  then: {
    kind: "choose",
    selector: { player: "opponent", zone: "hand" },
    chooser: "opponent",
    bind,
    min: count,
    max: count,
    effect: {
      kind: "move",
      binding: bind,
      to: { player: "owner", zone: "trash" },
    },
  },
});

export const op12OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP12-046 Zephyr(Navy): "[On Play] Trash 2 cards from your hand."
      //
      // Migrated with the card's `[Activate: Main]`: the debt register exempts
      // a card as a whole, so a card leaves it only once every clause is
      // declarative.
      //
      // One `choose` of two rather than two of one, because the trash has to
      // land as a single step: OP12-040 Kuzan's Leader draws "cards equal to
      // the number of cards trashed", and two separate moves would pay it
      // twice with a draw visible between them. `exhaustive` is what makes a
      // hand of one still trash that one -- `min: 2` would be skipped whole
      // and trash nothing, which is not what "trash 2" means to a player who
      // holds one.
      "OP12-046",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "hand" },
          bind: "op12-zephyr-cost",
          min: 0,
          max: 2,
          exhaustive: true,
          effect: {
            kind: "move",
            binding: "op12-zephyr-cost",
            to: { player: "self", zone: "trash" },
          },
        },
      },
    ],
    [
      // OP12-006 Shakuyaku: "[printed text omitted -- pnpm card:text OP12-006]"
      //
      // A name or a colour-and-category, which is what `anyOf` is for: the
      // second branch is two facts at once and `color` alone would take a red
      // Character too.
      "OP12-006",
      lookAndAdd(5, "op12-shakuyaku-look", {
        anyOf: [
          { name: "Monkey.D.Luffy" },
          { color: "Red", category: "event" },
        ],
      }),
    ],
    [
      // OP12-007 Shanks: "[printed text omitted -- pnpm card:text OP12-007]"Roger Pirates"[printed text omitted -- pnpm card:text OP12-007]"
      //
      // "A type including" reaches {Former Roger Pirates} as well as {Roger
      // Pirates}, which is most of the deck; the name exclusion is what stops it
      // pointing at itself or a second copy.
      "OP12-007",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            typeIncluding: "Roger Pirates",
            excludeName: "Shanks",
          },
          bind: "op12-shanks-rush",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "op12-shanks-rush",
            keyword: "Rush",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP12-009 Jinbe: "[printed text omitted -- pnpm card:text OP12-009]"
      //
      // The buff outlives the turn -- `expiresAfterTurns: 1` -- so a Jinbe that
      // attacks the turn it lands is still a 5000 body on the way back.
      "OP12-009",
      revealTwoEvents("op12-jinbe-reveal", {
        kind: "sequence",
        effects: [
          {
            kind: "grant-keyword",
            binding: SOURCE_BINDING,
            keyword: "Rush",
            expiresAfterTurns: 0,
          },
          {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 1_000,
            expiresAfterTurns: 1,
          },
        ],
      }),
    ],
    [
      // OP12-012 Buggy: "[printed text omitted -- pnpm card:text OP12-012]"Roger Pirates"[printed text omitted -- pnpm card:text OP12-012]"
      //
      // A granted [Blocker] that survives into the opponent's turn, which is the
      // only turn a Blocker matters on.
      "OP12-012",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            typeIncluding: "Roger Pirates",
            excludeName: "Buggy",
          },
          bind: "op12-buggy-blocker",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "op12-buggy-blocker",
            keyword: "Blocker",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP12-014 Boa Hancock: "[printed text omitted -- pnpm card:text OP12-014]" Its
      // `[Activate: Main]` half is in `op12-main.ts`.
      "OP12-014",
      lookAndAdd(5, "op12-hancock-look", {
        anyOf: [
          { name: "Monkey.D.Luffy" },
          { color: "Red", category: "event" },
        ],
      }),
    ],
    [
      // OP12-015 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP12-015]"
      //
      // Printed power on the play target, and the DON!! is sequenced after rather
      // than nested: it lands whether or not the play found something.
      "OP12-015",
      revealTwoEvents("op12-luffy-reveal", {
        kind: "sequence",
        effects: [
          {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              color: "Red",
              maxPower: 3_000,
            },
            bind: "op12-luffy-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op12-luffy-play" },
          },
          { kind: "give-rested-don", player: "self", count: 1 },
        ],
      }),
    ],
    [
      // OP12-029 Shimotsuki Kouzaburou: "[printed text omitted -- pnpm card:text OP12-029]"
      //
      // The rest feeds the K.O., as OP10-041 Radio Knife's two halves do -- and
      // the K.O. reads *printed* cost where the rest reads the effective one, so
      // a 1-drop pushed to 2 cost is still K.O.-able once rested.
      "OP12-029",
      {
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
              bind: "op12-kouzaburou-rest",
              min: 0,
              max: 1,
              effect: { kind: "rest", binding: "op12-kouzaburou-rest" },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                rested: true,
                maxBaseCost: 1,
              },
              bind: "op12-kouzaburou-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op12-kouzaburou-ko" },
            },
          ],
        },
      },
    ],
    [
      // OP12-030 Dracule Mihawk: "[printed text omitted -- pnpm card:text OP12-030]"
      //
      // An 8-cost Blocker that refunds half its own price, and pays for it by
      // barring the expensive plays that DON!! could have bought. The floor is
      // what makes the ban partial -- see `restrict-player`'s `minBaseCost`.
      "OP12-030",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "activate-don", player: "self", count: 4 },
            {
              kind: "restrict-player",
              player: "self",
              restriction: "cannot-play-characters",
              minBaseCost: 7,
              expiresAfterTurns: 0,
            },
          ],
        },
      },
    ],
    [
      // OP12-042 Alvida: "[printed text omitted -- pnpm card:text OP12-042]" Its own
      // cost buff is a static ability.
      "OP12-042",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxBaseCost: 1,
          },
          bind: "op12-alvida-bury",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op12-alvida-bury",
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // OP12-044 Sakazuki: "[printed text omitted -- pnpm card:text OP12-044]" Its `[Activate: Main]` half is in `op12-main.ts`.
      "OP12-044",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-has-type", player: "self", type: "Navy" },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP12-054 Marshall.D.Teach: "[printed text omitted -- pnpm card:text OP12-054]"
      //
      // Either board, and "other than this Character" is an instance question
      // rather than a name one -- a second Teach is a legal target, which is what
      // `excludeSource` says and `excludeName` would not.
      "OP12-054",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "The Seven Warlords of the Sea",
          },
          then: {
            kind: "choose",
            selector: {
              player: "either",
              zone: "board",
              category: "character",
              maxCost: 1,
              excludeSource: true,
            },
            bind: "op12-teach-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op12-teach-bounce",
              to: { player: "owner", zone: "hand" },
            },
          },
        },
      },
    ],
    [
      // OP12-056 Monkey.D.Garp: "[printed text omitted -- pnpm card:text OP12-056]"
      "OP12-056",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op12-garp-cost",
            1,
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                color: "Blue",
                type: "Navy",
                maxPower: 8_000,
                excludeName: "Monkey.D.Garp",
              },
              bind: "op12-garp-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op12-garp-play" },
            },
          ),
        },
      },
    ],
    [
      // OP12-062 Vinsmoke Sora: "[printed text omitted -- pnpm card:text OP12-062]"
      //
      // The draw is inside the gate -- "Then" continues the same conditional
      // sentence -- so a Sora played while ahead on DON!! is a 0-power body and
      // nothing else.
      "OP12-062",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "leader-has-name", player: "self", name: "Sanji" },
              { kind: "field-don-versus", player: "self", operator: "lte" },
            ],
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "add-don", player: "self", count: 1, rested: true },
              { kind: "draw", player: "self", count: 1 },
            ],
          },
        },
      },
    ],
    [
      // OP12-074 Patty: "[printed text omitted -- pnpm card:text OP12-074]"
      "OP12-074",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand", category: "event" },
            "op12-patty-cost",
            1,
            {
              kind: "if",
              condition: {
                kind: "leader-has-name",
                player: "self",
                name: "Sanji",
              },
              then: {
                kind: "add-don",
                player: "self",
                count: 1,
                rested: false,
              },
            },
          ),
        },
      },
    ],
    [
      // OP12-075 Ms. All Sunday: "[printed text omitted -- pnpm card:text OP12-075]"
      //
      // The compensation is the opponent's decision, not the controller's -- see
      // `optional`'s `chooser`. It is a real decision: a DON!! taken now is a
      // DON!! not drawn later, and a player at ten on the field gains nothing.
      "OP12-075",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 3,
              },
              bind: "op12-sunday-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op12-sunday-ko" },
            },
            {
              kind: "optional",
              chooser: "opponent",
              effect: {
                kind: "add-don",
                player: "opponent",
                count: 1,
                rested: false,
              },
            },
          ],
        },
      },
    ],
    [
      // OP12-084 Emporio.Ivankov: "[printed text omitted -- pnpm card:text OP12-084]"
      "OP12-084",
      {
        effect: {
          kind: "if",
          condition: revolutionaryArmyLeader,
          then: { kind: "trash-top", player: "self", count: 3 },
        },
      },
    ],
    [
      // OP12-086 Koala: "[printed text omitted -- pnpm card:text OP12-086]"
      //
      // The name exclusion applies to the type branch only, which `anyOf` gets
      // right by construction: a [Nico Robin] qualifies through the second branch
      // whether or not it is Revolutionary Army, and a second Koala qualifies
      // through neither.
      "OP12-086",
      {
        effect: {
          kind: "if",
          condition: revolutionaryArmyLeader,
          then: lookAndAddOrTrash(3, "op12-koala-look", {
            anyOf: [{ type: "Revolutionary Army" }, { name: "Nico Robin" }],
            excludeName: "Koala",
          }).effect,
        },
      },
    ],
    [
      // OP12-087 Nico Robin: "[printed text omitted -- pnpm card:text OP12-087]" Its Leader-gated keyword and cost are static.
      "OP12-087",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op12-robin-cost",
            1,
            opponentDiscards(5, 2, "op12-robin-discard"),
          ),
        },
      },
    ],
    [
      // OP12-094 Monkey.D.Dragon: "[printed text omitted -- pnpm card:text OP12-094]"
      "OP12-094",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              type: "Revolutionary Army",
            },
            bind: "op12-dragon-cost",
            min: 3,
            max: 3,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op12-dragon-cost",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
                {
                  kind: "if",
                  condition: revolutionaryArmyLeader,
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "trash",
                      category: "character",
                      maxCost: 6,
                    },
                    bind: "op12-dragon-play",
                    min: 0,
                    max: 1,
                    effect: { kind: "play", binding: "op12-dragon-play" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP12-095 Lindbergh: "[printed text omitted -- pnpm card:text OP12-095]" Its cost buff is a static ability.
      "OP12-095",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op12-lindbergh-trash",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op12-lindbergh-trash",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP12-100 Sabo: "[printed text omitted -- pnpm card:text OP12-100]"
      //
      // Life for cards, which is Yellow's trade -- and the Life spent is what
      // switches this card's own [Blocker] on (its static half reads "3 or less
      // Life cards").
      "OP12-100",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "life", position: "top" },
            bind: "op12-sabo-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op12-sabo-cost",
                  to: { player: "self", zone: "hand" },
                },
                { kind: "draw", player: "self", count: 2 },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op12-sabo-trash",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op12-sabo-trash",
                    to: { player: "self", zone: "trash" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP12-105 Trafalgar Lammy: "[printed text omitted -- pnpm card:text OP12-105]"
      //
      // `[Your Turn]` on an `[On Play]` is not redundant: a Character played off a
      // Trigger or a Counter lands on the *opponent's* turn, and this clause does
      // nothing then.
      "OP12-105",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              name: "Trafalgar Law",
            },
            bind: "op12-lammy-buff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op12-lammy-buff",
              amount: 2_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP12-118 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP12-118]"
      //
      // Eight rested cards counts the cost area too, which is the only way a board
      // reaches it: this is a card for the turn its controller has spent
      // everything.
      "OP12-118",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "rested-cards",
            player: "self",
            operator: "gte",
            value: 8,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op12-bonney-trash",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op12-bonney-trash",
                  to: { player: "self", zone: "trash" },
                },
              },
              { kind: "activate-don", player: "self", count: 1 },
            ],
          },
        },
      },
    ],
    [
      // OP12-119 Bartholomew Kuma: "[printed text omitted -- pnpm card:text OP12-119]" Its `[On K.O.]` half is in `op12-triggers.ts`.
      //
      // Life from the deck rather than from hand, and the +2 cost is protection
      // that lasts through the turn the opponent would answer it on.
      "OP12-119",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op12-kuma-cost",
            1,
            {
              kind: "sequence",
              effects: [
                {
                  kind: "select",
                  selector: { player: "self", zone: "deck", position: "top" },
                  bind: "op12-kuma-life",
                  count: 1,
                  effect: {
                    kind: "move",
                    binding: "op12-kuma-life",
                    to: { player: "self", zone: "life", position: "top" },
                  },
                },
                {
                  kind: "modify-cost",
                  binding: SOURCE_BINDING,
                  amount: 2,
                  expiresAfterTurns: 1,
                },
              ],
            },
          ),
        },
      },
    ],
  ],
};

export { opponentDiscards, revolutionaryArmyLeader };
