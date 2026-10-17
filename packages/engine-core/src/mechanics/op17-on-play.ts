/**
 * OP17 `[On Play]` programs.
 *
 * OP17 is the largest set in the pool by a wide margin, so its programs are
 * split by the timing window they fire in rather than kept in one module; every
 * other set fits in one file. See `mechanics/README.md`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  donMinus,
  elbaphGiantOut,
  lookAndAdd,
  lookAndAddOrTrash,
  ownCostTenBody,
} from "./shared.js";

export const op17OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP17-009 Haruta: "[printed text omitted -- pnpm card:text OP17-009]"
      //
      // "Base power", so `maxPower` -- the same bound the rest of the format
      // uses for base-power removal.
      "OP17-009",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxPower: 2_000,
          },
          bind: "op17-haruta-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op17-haruta-ko" },
        },
      },
    ],
    [
      // OP17-016 Rakuyo: "[printed text omitted -- pnpm card:text OP17-016]"
      //
      // The `choose` max of 2 makes the "up to 2" a real choice: each pick is
      // offered one at a time and the player may stop early, exactly like the
      // other multi-K.O. On Plays in the pool.
      "OP17-016",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxPower: 2_000,
          },
          bind: "op17-rakuyo-ko",
          min: 0,
          max: 2,
          effect: { kind: "knock-out", binding: "op17-rakuyo-ko" },
        },
      },
    ],
    [
      // OP17-014 Whitey Bay: "[printed text omitted -- pnpm card:text OP17-014]"
      //
      // "Up to 1", so `min: 0`: the K.O. can be declined with a target on the
      // board. `maxPower` is the base-power ceiling the text names.
      "OP17-014",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxPower: 2_000,
          },
          bind: "op17-whitey-bay-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op17-whitey-bay-ko" },
        },
      },
    ],
    [
      // OP17-113 Streusen: "[printed text omitted -- pnpm card:text OP17-113]"
      //
      // The standard look-and-add search, one type deeper.
      "OP17-113",
      lookAndAdd(3, "op17-streusen-looked", { type: "Big Mom Pirates" }),
    ],
    [
      // OP17-082 Sanji: "[printed text omitted -- pnpm card:text OP17-082]"
      //
      // The trash is not optional and not a cost -- it is the second half of the
      // draw -- so it is a mandatory `choose` of exactly 2 after the draw lands.
      // Drawing first matters: the two cards just drawn are legal discards.
      "OP17-082",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op17-sanji-discard",
              min: 2,
              max: 2,
              effect: {
                kind: "move",
                binding: "op17-sanji-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP17-084 Tony Tony.Chopper: "[printed text omitted -- pnpm card:text OP17-084]"
      "OP17-084",
      {
        effect: {
          kind: "if",
          condition: elbaphGiantOut,
          then: {
            kind: "choose",
            selector: { player: "self", zone: "board", category: "character" },
            bind: "op17-chopper-target",
            min: 0,
            max: 1,
            effect: {
              kind: "grant-keyword",
              binding: "op17-chopper-target",
              keyword: "Unblockable",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP17-090 Franky: "[printed text omitted -- pnpm card:text OP17-090]"
      "OP17-090",
      {
        effect: {
          kind: "if",
          condition: elbaphGiantOut,
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 2,
            },
            bind: "op17-franky-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op17-franky-ko" },
          },
        },
      },
    ],
    [
      // OP17-091 Brook: "[printed text omitted -- pnpm card:text OP17-091]"
      //
      // The opponent chooses which card, so this is a `choose` resolved by them.
      "OP17-091",
      {
        effect: {
          kind: "if",
          condition: elbaphGiantOut,
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            bind: "op17-brook-discard",
            min: 1,
            max: 1,
            chooser: "opponent",
            effect: {
              kind: "move",
              binding: "op17-brook-discard",
              to: { player: "opponent", zone: "trash" },
            },
          },
        },
      },
    ],
    [
      // OP17-080 Usopp: "[printed text omitted -- pnpm card:text OP17-080]" Its own +3000 power clause is registered in
      // `static-abilities.ts` alongside the rest of the Elbaph Commons.
      "OP17-080",
      lookAndAddOrTrash(3, "op17-usopp-looked", { type: "Elbaph" }),
    ],
    [
      // OP17-049 Charlotte Linlin: "[printed text omitted -- pnpm card:text OP17-049]" Its
      // `[On Your Opponent's Attack]` half is `onOpponentAttackPrograms`,
      // below.
      //
      // The same "opponent picks the lesser evil" shape as OP17-099: `choice`
      // with `chooser: "opponent"` hands the branch itself to the other
      // player, who is also the one who loses 2 cards in the second branch --
      // "[printed text omitted -- pnpm card:text OP17-099]" reads the same as
      // OP17-091 Brook's "your opponent trashes 1 card", the opponent picking
      // which of their own cards go, so `chooser: "opponent"` on the inner
      // `choose` too.
      //
      // `exhaustive` rather than `min: 2`: Bandai's Q&A has an opponent who
      // picks this branch holding one card trash that one, and `min: 2` would
      // skip the clause whole against a hand of one (rule 8-4-4-1).
      "OP17-049",
      {
        effect: {
          kind: "choice",
          chooser: "opponent",
          branches: [
            {
              id: "draw",
              label: "Draw 2 cards",
              effect: { kind: "draw", player: "self", count: 2 },
            },
            {
              id: "opponent-discards",
              label: "Your opponent trashes 2 cards from their hand",
              effect: {
                kind: "choose",
                selector: { player: "opponent", zone: "hand" },
                bind: "op17-linlin049-discard",
                min: 0,
                max: 2,
                exhaustive: true,
                chooser: "opponent",
                effect: {
                  kind: "move",
                  binding: "op17-linlin049-discard",
                  to: { player: "opponent", zone: "trash" },
                },
              },
            },
          ],
        },
      },
    ],
    [
      // OP17-045 Kyo: "[On Play] Draw 1 card." Its removal-replacement clause
      // ("[printed text omitted -- pnpm card:text OP17-045]") is
      // `hand-trash-replacement`, the new pending kind in `effects.ts`, offered
      // through `replacementOptionsFor` in `removal.ts`.
      "OP17-045",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP17-086 Nami: "[printed text omitted -- pnpm card:text OP17-086]"
      //
      // Gated on an {Elbaph} card actually being in hand before the `optional`
      // is even offered: `choose`'s own `min: 1` only skips *itself* when
      // nothing qualifies, and the `draw` chained after it in the same
      // `sequence` would still fire for free if the cost silently failed to
      // pay.
      "OP17-086",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "hand", type: "Elbaph" },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand", type: "Elbaph" },
                  bind: "op17-nami086-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-nami086-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                { kind: "draw", player: "self", count: 2 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-089 Jaguar.D.Saul: the same search, over the giants' `+12 cost`
      // static clause registered in `static-abilities.ts`.
      "OP17-089",
      lookAndAddOrTrash(3, "op17-saul-looked", { type: "Elbaph" }),
    ],
    [
      // OP17-085 Dorry: "[printed text omitted -- pnpm card:text OP17-085]" Its own `+12 cost` is registered in
      // `static-abilities.ts` alongside the rest of the Elbaph giants.
      //
      // "hand or trash" is `zone`'s array form. `maxCost` reads effective
      // cost, and Brogy's own `+12 cost` is read only on the field, so a copy
      // in hand or trash is the printed 5 the clause asks for. The
      // restriction is the new `restrict-player` node -- the first in the pool scoped to the
      // player rather than to one card instance, since it shuts off every
      // Character play for the rest of the turn, not just this one.
      "OP17-085",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Elbaph",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: ["hand", "trash"],
                  name: "Brogy",
                  maxCost: 5,
                },
                bind: "op17-dorry-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op17-dorry-play" },
              },
              {
                kind: "restrict-player",
                player: "self",
                restriction: "cannot-play-characters",
                expiresAfterTurns: 0,
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-092 Brogy: the mirror image of OP17-085 Dorry.
      "OP17-092",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Elbaph",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: ["hand", "trash"],
                  name: "Dorry",
                  maxCost: 5,
                },
                bind: "op17-brogy-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op17-brogy-play" },
              },
              {
                kind: "restrict-player",
                player: "self",
                restriction: "cannot-play-characters",
                expiresAfterTurns: 0,
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-093 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP17-093]" Its
      // conditional [Rush] is registered in `static-abilities.ts`.
      "OP17-093",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                category: "character",
                maxCost: 2,
              },
              bind: "op17-luffy-recur",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op17-luffy-recur" },
            },
          ],
        },
      },
    ],
    [
      // OP17-030 Monkey D. Luffy: "[printed text omitted -- pnpm card:text OP17-030]"
      //
      // The cost rests an active DON!! rather than returning it, so the DON!! stays
      // on the field and still counts for [DON!! xN] conditions -- and it has to be
      // *active* to be rested, which is what `active-don` asks and `field-don`,
      // counting rested and given DON!! too, did not.
      "OP17-030",
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
                {
                  kind: "grant-keyword",
                  binding: SOURCE_BINDING,
                  keyword: "Rush",
                  expiresAfterTurns: 0,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-022 Shanks: "[printed text omitted -- pnpm card:text OP17-022]" [Rush] is
      // printed keyword text and needs no program. "All" is `select`'s
      // dedicated `"all"` count, so every opposing Character is bound and
      // `rest`'s generic per-binding loop rests every one of them.
      "OP17-022",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "activate-don", player: "self", count: 2 },
            {
              kind: "select",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op17-shanks022-rest",
              count: "all",
              effect: { kind: "rest", binding: "op17-shanks022-rest" },
            },
          ],
        },
      },
    ],
    [
      // OP17-031 Yasopp: "[printed text omitted -- pnpm card:text OP17-031]" Its "[printed text omitted -- pnpm card:text OP17-031]" half is `onEndOfYourTurnPrograms`, below.
      "OP17-031",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              // `canRest` for the same reason every other "rest up to 1 of
              // your opponent's Characters" in the pool carries it: resting a
              // rested Character does nothing, and a Character under a
              // "cannot be rested" effect is not a target the clause has.
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 8,
                canRest: true,
              },
              bind: "op17-yasopp-rest",
              min: 0,
              max: 1,
              effect: { kind: "rest", binding: "op17-yasopp-rest" },
            },
          ],
        },
      },
    ],
    [
      // OP17-046 Gloriosa: "[printed text omitted -- pnpm card:text OP17-046]" [Blocker] is
      // printed keyword text and needs no program.
      //
      // "A Character" names no side, so either board is eligible -- but
      // `CardSelector.player` only ever reads one side at a time, unlike
      // `MechanicCondition`'s `"either"`. A `choice` between the two boards
      // reads the same as one combined pick: at most one card total moves,
      // because each branch's own `choose` caps at 1 and only one branch is
      // ever taken.
      "OP17-046",
      {
        effect: {
          kind: "choice",
          branches: [
            {
              id: "self",
              label: "Bottom your own cost-5-or-less Character",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                },
                bind: "op17-gloriosa-self",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op17-gloriosa-self",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
              },
            },
            {
              id: "opponent",
              label: "Bottom your opponent's cost-5-or-less Character",
              effect: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                },
                bind: "op17-gloriosa-opponent",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op17-gloriosa-opponent",
                  to: { player: "opponent", zone: "deck", position: "bottom" },
                },
              },
            },
          ],
        },
      },
    ],
    [
      // OP17-004 Inuarashi & Nekomamushi: "[printed text omitted -- pnpm card:text OP17-004]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP17-004]"
      //
      // `anyOf` is exactly this shape: two alternative types, one target.
      "OP17-004",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            // "{Land of Wano} type" names one type exactly; "a type including
            // \"Whitebeard Pirates\"" is the substring form and also reaches
            // {Whitebeard Pirates Allies}. Two different printed restrictions in
            // one clause, and reading the second as the first dropped OP16-016
            // Ramba and OP16-017 LittleOars Jr. from a grant they qualify for.
            anyOf: [
              { type: "Land of Wano" },
              { typeIncluding: "Whitebeard Pirates" },
            ],
          },
          bind: "op17-minks-rush",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "op17-minks-rush",
            keyword: "Rush",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP17-028 Bonk Punch & Monster: "[printed text omitted -- pnpm card:text OP17-028]" [Blocker] is
      // printed keyword text and needs no program.
      "OP17-028",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            // "A cost of 6 or less" is the cost the Character has now.
            maxCost: 6,
            rested: true,
          },
          bind: "op17-bonk-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op17-bonk-ko" },
        },
      },
    ],
    [
      // OP17-066 Kurozumi Orochi: "[printed text omitted -- pnpm card:text OP17-066]"
      //
      // Draw before discard, so the drawn cards are legal discards.
      "OP17-066",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: ownCostTenBody,
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op17-orochi-discard",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op17-orochi-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        }),
      },
    ],
    [
      // OP17-067 Kurozumi Kanjuro: "[printed text omitted -- pnpm card:text OP17-067]"
      "OP17-067",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: ownCostTenBody,
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              canRest: true,
            },
            bind: "op17-kanjuro-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op17-kanjuro-rest" },
          },
        }),
      },
    ],
    [
      // OP17-069 Jack: "[printed text omitted -- pnpm card:text OP17-069]"
      "OP17-069",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Animal Kingdom Pirates",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op17-jack-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op17-jack-debuff",
              amount: -2_000,
              expiresAfterTurns: 0,
            },
          },
        }),
      },
    ],
    [
      // OP17-071 Who's.Who: "[printed text omitted -- pnpm card:text OP17-071]"
      "OP17-071",
      {
        effect: donMinus(1, {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 2,
          },
          bind: "op17-whoswho-ko",
          min: 0,
          max: 2,
          effect: { kind: "knock-out", binding: "op17-whoswho-ko" },
        }),
      },
    ],
    [
      // OP17-075 X.Drake: "[printed text omitted -- pnpm card:text OP17-075]"
      //
      // X.Drake's controller picks, face-down (Bandai's OP-17 Q&A): a position
      // in the opponent's hand, never a look at it, which is `pick-from-hand`'s
      // `"blind"`. Compare OP17-091 Brook, which prints "your opponent trashes"
      // and so leaves the pick with the hand's owner.
      "OP17-075",
      {
        effect: donMinus(2, {
          kind: "pick-from-hand",
          player: "opponent",
          pick: "blind",
          bind: "op17-drake-discard",
          effect: {
            kind: "move",
            binding: "op17-drake-discard",
            to: { player: "opponent", zone: "trash" },
          },
        }),
      },
    ],
    [
      // OP17-105 Charlotte Chiffon: "[printed text omitted -- pnpm card:text OP17-105]"
      //
      // A declinable cost that is itself filtered -- only a Trigger card pays --
      // and a target filtered the same way. `hasTrigger` covers both.
      "OP17-105",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand", hasTrigger: true },
            bind: "op17-chiffon-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op17-chiffon-cost",
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    hasTrigger: true,
                  },
                  bind: "op17-chiffon-bounce",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-chiffon-bounce",
                    to: { player: "opponent", zone: "hand" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-024 Howling Gab: "[printed text omitted -- pnpm card:text OP17-024]" [Banish] is printed keyword text and needs no program.
      "OP17-024",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            canRest: true,
          },
          bind: "op17-gab-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op17-gab-rest" },
        },
      },
    ],
    [
      // OP17-052 Don Marlon: "[printed text omitted -- pnpm card:text OP17-052]"
      "OP17-052",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "event",
            color: "Blue",
            maxCost: 0,
          },
          bind: "op17-marlon-recur",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op17-marlon-recur",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP17-050 Streusen: "[printed text omitted -- pnpm card:text OP17-050]"
      //
      // One end for both cards: Bandai's Q&A rules out putting one on top and
      // the other at the bottom. So the end is a `choice` asked once, after the
      // look, and `order-to-bottom` then asks the order at that end. It has no
      // `alternate`, because that field is what lets the node split the cards
      // between two ends.
      "OP17-050",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 2,
              bind: "op17-streusen-look",
            },
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "self",
                selector: { zone: "deck", binding: "op17-streusen-look" },
                operator: "gte",
                value: 1,
              },
              then: {
                kind: "choice",
                branches: (["top", "bottom"] as const).map((position) => ({
                  id: position,
                  label:
                    position === "top"
                      ? "Place them at the top of your deck"
                      : "Place them at the bottom of your deck",
                  effect: {
                    kind: "select",
                    selector: {
                      player: "self",
                      zone: "deck",
                      binding: "op17-streusen-look",
                    },
                    bind: "op17-streusen-place",
                    count: "all",
                    effect: {
                      kind: "order-to-bottom",
                      binding: "op17-streusen-place",
                      to: { player: "self", zone: "deck", position },
                    },
                  },
                })),
              },
            },
            { kind: "draw", player: "self", count: 1 },
          ],
        },
      },
    ],
    [
      // OP17-106 Charlotte Smoothie: "[printed text omitted -- pnpm card:text OP17-106]"
      //
      // `[Your Turn]` is not decoration here: this Character can arrive on the
      // opponent's turn, off its own Trigger, and the clause does not fire then.
      //
      // The cost is gated on `active-don` rather than `field-don`: `rest-don` rests
      // whatever is active and does not fail, so a player with two rested DON!!
      // and none active would otherwise pay nothing and gain a Life card.
      "OP17-106",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: {
            kind: "if",
            condition: {
              kind: "active-don",
              player: "self",
              operator: "gte",
              value: 2,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest-don", player: "self", count: 2 },
                  {
                    kind: "select",
                    selector: { player: "self", zone: "deck", position: "top" },
                    bind: "op17-smoothie-life",
                    count: 1,
                    effect: {
                      kind: "move",
                      binding: "op17-smoothie-life",
                      to: { player: "self", zone: "life", position: "top" },
                    },
                  },
                  {
                    kind: "choose",
                    selector: { player: "opponent", zone: "hand" },
                    bind: "op17-smoothie-discard",
                    min: 1,
                    max: 1,
                    chooser: "opponent",
                    effect: {
                      kind: "move",
                      binding: "op17-smoothie-discard",
                      to: { player: "opponent", zone: "trash" },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP17-003 Izo: "[printed text omitted -- pnpm card:text OP17-003]" Its
      // `[Rush: Character]` keyword is registered in `static-abilities.ts`.
      "OP17-003",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Edward.Newgate",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
            },
            bind: "op17-izo-target",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op17-izo-target",
              amount: -6_000,
              expiresAfterTurns: 0,
            },
          },
          else: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Land of Wano",
            },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                rested: true,
              },
              bind: "op17-izo-target",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op17-izo-target",
                amount: -6_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP17-005 Edward.Newgate: "[printed text omitted -- pnpm card:text OP17-005]"
      //
      // "Monocolored" gates the clause on the Leader *not* being multicolored --
      // the DSL has no negation combinator, so this reads as `if multicolored:
      // do nothing` with the real effect in `else`, the mirror image of every
      // other card that gates positively on `leader-multicolored`. Its own
      // hand-price clause ("[printed text omitted -- pnpm card:text OP17-005]") is a static hand-price
      // clause, not a mechanic program; see `STATIC_HAND_DISCOUNTS` in `don.ts`.
      "OP17-005",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-multicolored", player: "self" },
          then: { kind: "sequence", effects: [] },
          else: {
            kind: "set-leader-base-power",
            player: "self",
            value: 8_000,
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP17-013 Portgas.D.Ace: "[printed text omitted -- pnpm card:text OP17-013]"
      //
      // Its printed Trigger -- "[printed text omitted -- pnpm card:text OP17-013]" -- is a
      // static hand-price clause, not a mechanic program; see
      // `STATIC_HAND_DISCOUNTS` in `don.ts`.
      "OP17-013",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Edward.Newgate",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
            },
            bind: "op17-ace-target",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op17-ace-target",
              amount: -6_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP17-007 Kouzuki Oden: "[printed text omitted -- pnpm card:text OP17-007]"
      "OP17-007",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Edward.Newgate",
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              anyOf: [{ type: "Land of Wano" }, { type: "Whitebeard Pirates" }],
              maxPower: 6_000,
            },
            bind: "op17-oden-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op17-oden-play" },
          },
          else: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Land of Wano",
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                anyOf: [
                  { type: "Land of Wano" },
                  { type: "Whitebeard Pirates" },
                ],
                maxPower: 6_000,
              },
              bind: "op17-oden-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op17-oden-play" },
            },
          },
        },
      },
    ],
    [
      // OP17-043 Ganzui: "[printed text omitted -- pnpm card:text OP17-043]" Unlike OP17-008, this one
      // carries no Leader-name restriction.
      "OP17-043",
      {
        effect: {
          kind: "set-leader-base-power",
          player: "self",
          value: 6_000,
          expiresAfterTurns: 1,
        },
      },
    ],
    [
      // OP17-008 Jozu: "[printed text omitted -- pnpm card:text OP17-008]"
      "OP17-008",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Edward.Newgate",
          },
          then: {
            kind: "set-leader-base-power",
            player: "self",
            value: 8_000,
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP17-027 Benn.Beckman: "[printed text omitted -- pnpm card:text OP17-027]"
      "OP17-027",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Red-Haired Pirates",
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: { player: "opponent", zone: "board" },
                bind: "op17-beckman-rest",
                min: 0,
                max: 2,
                effect: { kind: "rest", binding: "op17-beckman-rest" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-029 Hongo: "[printed text omitted -- pnpm card:text OP17-029]"
      "OP17-029",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "activate-don", player: "self", count: 1 },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 2,
              },
              bind: "op17-hongo-rest",
              min: 0,
              max: 2,
              effect: { kind: "rest", binding: "op17-hongo-rest" },
            },
          ],
        },
      },
    ],
    [
      // OP17-032 Limejuice: "[printed text omitted -- pnpm card:text OP17-032]"Red-Haired Pirates"[printed text omitted -- pnpm card:text OP17-032]"
      "OP17-032",
      lookAndAdd(3, "op17-032-look", { type: "Red-Haired Pirates" }),
    ],
    [
      // OP17-033 Lucky Roux: "[printed text omitted -- pnpm card:text OP17-033]"Red-Haired Pirates"[printed text omitted -- pnpm card:text OP17-033]" Its `[On Your Opponent's Attack]` half is registered
      // separately in `onOpponentAttackPrograms`.
      "OP17-033",
      lookAndAdd(3, "op17-033-look", { type: "Red-Haired Pirates" }),
    ],
    [
      // OP17-040 Edward.Newgate: "[On Play] Draw 1 card." Its watcher clause --
      // "[printed text omitted -- pnpm card:text OP17-040]" -- is
      // registered separately in `leaderWatcherPrograms`, below.
      "OP17-040",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP17-041 Wang Zhi: "[printed text omitted -- pnpm card:text OP17-041]"
      //
      // "In any order" is `select`+`move`, the engine's existing convention for
      // an unconstrained reorder (see `lookAndAdd`'s own "place the rest" step):
      // nothing in the format's bottom-of-deck placements makes the order
      // observable, so there is nothing to choose between.
      "OP17-041",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op17-wangzhi-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op17-wangzhi-cost",
                  to: { player: "self", zone: "trash" },
                },
              },
              {
                kind: "select",
                // "a base cost of 1" is exact and printed, so it is
                // `minBaseCost`/`maxBaseCost` together, the same shape the
                // OP16 Whitebeard shell uses for "[printed text omitted -- pnpm card:text <card>]". `maxCost: 1` got both halves wrong: it read the
                // *effective* cost, which the OP-17 Elbaph giants move by +12,
                // and it read "1 or less", which also swept up a cost-0 body.
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  minBaseCost: 1,
                  maxBaseCost: 1,
                },
                bind: "op17-wangzhi-bottom",
                count: "all",
                effect: {
                  kind: "move",
                  binding: "op17-wangzhi-bottom",
                  to: { player: "opponent", zone: "deck", position: "bottom" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-042 Kaido: "[printed text omitted -- pnpm card:text OP17-042]"
      //
      // "Reveal" as a cost, not "trash": the chosen cards stay in hand. The
      // `choose` still gates the effect on 3 qualifying cards actually being
      // there, which is the clause's whole gameplay weight; only the cosmetic
      // reveal-to-the-opponent event is not modelled.
      "OP17-042",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              type: "Rocks Pirates",
            },
            bind: "op17-kaido-reveal",
            min: 3,
            max: 3,
            effect: {
              kind: "choose",
              selector: { player: "opponent", zone: "board" },
              bind: "op17-kaido-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op17-kaido-debuff",
                amount: -3_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP17-059 Aramaki: "[printed text omitted -- pnpm card:text OP17-059]"
      "OP17-059",
      {
        effect: donMinus(1, {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 2,
              },
              bind: "op17-aramaki-ko",
              min: 0,
              max: 2,
              effect: { kind: "knock-out", binding: "op17-aramaki-ko" },
            },
          ],
        }),
      },
    ],
    [
      // OP17-065 Queen: "[printed text omitted -- pnpm card:text OP17-065]"
      "OP17-065",
      {
        effect: donMinus(1, {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 5,
              },
              bind: "op17-queen-prevent",
              min: 0,
              max: 2,
              effect: {
                kind: "restrict",
                binding: "op17-queen-prevent",
                restriction: "cannot-attack",
                expiresAfterTurns: 1,
              },
            },
          ],
        }),
      },
    ],
    [
      // OP17-073 Basil Hawkins: "[printed text omitted -- pnpm card:text OP17-073]"
      "OP17-073",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op17-hawkins-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op17-hawkins-cost",
                  to: { player: "self", zone: "trash" },
                },
              },
              {
                kind: "if",
                condition: {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Animal Kingdom Pirates",
                },
                then: {
                  kind: "add-don",
                  player: "self",
                  count: 1,
                  rested: false,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-054 Miss Buckingham Stussy: "[printed text omitted -- pnpm card:text OP17-054]" Its `[Activate: Main]` half is
      // registered separately in `activateMainPrograms`.
      // OP17-054 Miss Buckingham Stussy: "[printed text omitted -- pnpm card:text OP17-054]"
      //
      // `maxBaseCost`, not `maxCost`: the clause prints "base cost", which is
      // the printed number, where `maxCost` reads the effective one. The
      // difference is the whole OP-17 Elbaph package -- OP17-089 Jaguar.D.Saul
      // is printed at 4 and sits on the field at 16 -- so with the effective
      // filter this clause could not touch a single giant, which is exactly the
      // matchup the card is wanted in. See `maxBaseCost` in `mechanics.ts`.
      "OP17-054",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxBaseCost: 6,
          },
          bind: "op17-stussy-onplay-target",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "op17-stussy-onplay-target",
            restriction: "cannot-attack",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP17-060 Ulti & Page One: "[printed text omitted -- pnpm card:text OP17-060]"
      "OP17-060",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Animal Kingdom Pirates",
              },
              then: {
                kind: "add-don",
                player: "self",
                count: 1,
                rested: false,
              },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxPower: 3_000,
              },
              bind: "op17-ulti-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op17-ulti-ko" },
            },
          ],
        },
      },
    ],
    [
      // OP17-061 Lead Performers: "[printed text omitted -- pnpm card:text OP17-061]" Its `[Activate: Main]` half is
      // registered separately in `activateMainPrograms`.
      "OP17-061",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Animal Kingdom Pirates",
          },
          then: {
            kind: "choose",
            selector: { player: "self", zone: "deck", position: "top" },
            bind: "op17-lead-performers-life",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op17-lead-performers-life",
              to: { player: "self", zone: "life", position: "top" },
            },
          },
        }),
      },
    ],
    [
      // OP17-074 Yamato: "[printed text omitted -- pnpm card:text OP17-074]"
      "OP17-074",
      {
        effect: { kind: "add-don", player: "self", count: 1, rested: true },
      },
    ],
    [
      // OP17-081 Gerd: "[printed text omitted -- pnpm card:text OP17-081]"
      "OP17-081",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op17-gerd-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op17-gerd-cost",
                  to: { player: "self", zone: "trash" },
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "trash",
                  category: "character",
                  maxCost: 8,
                  excludeName: "Gerd",
                },
                bind: "op17-gerd-recur",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op17-gerd-recur",
                  to: { player: "self", zone: "hand" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-087 Nico Robin: "[printed text omitted -- pnpm card:text OP17-087]" Its static +3000 power is registered in
      // `static-abilities.ts`, alongside the Elbaph Commons it shares the clause
      // with.
      "OP17-087",
      {
        effect: {
          kind: "if",
          condition: elbaphGiantOut,
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "board" },
            bind: "op17-robin-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op17-robin-debuff",
              amount: -3_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP17-103 Charlotte Katakuri: "[printed text omitted -- pnpm card:text OP17-103]"
      "OP17-103",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Big Mom Pirates",
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: { player: "self", zone: "deck", position: "top" },
                  bind: "op17-katakuri-life",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-katakuri-life",
                    to: { player: "self", zone: "life", position: "top" },
                  },
                },
                {
                  kind: "choose",
                  selector: { player: "opponent", zone: "board" },
                  bind: "op17-katakuri-debuff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op17-katakuri-debuff",
                    amount: -3_000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-104 Charlotte Cracker: "[printed text omitted -- pnpm card:text OP17-104]"
      "OP17-104",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: {
            kind: "if",
            condition: {
              kind: "active-don",
              player: "self",
              operator: "gte",
              value: 2,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest-don", player: "self", count: 2 },
                  {
                    kind: "if",
                    condition: {
                      kind: "leader-has-type",
                      player: "self",
                      type: "Big Mom Pirates",
                    },
                    then: {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "deck",
                        position: "top",
                      },
                      bind: "op17-cracker-life",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "op17-cracker-life",
                        to: { player: "self", zone: "life", position: "top" },
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
    [
      // OP17-109 Charlotte Pudding: "[printed text omitted -- pnpm card:text OP17-109]"
      "OP17-109",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand", hasTrigger: true },
                bind: "op17-pudding-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op17-pudding-cost",
                  to: { player: "self", zone: "trash" },
                },
              },
              { kind: "draw", player: "self", count: 3 },
            ],
          },
        },
      },
    ],
    [
      // OP17-110 Charlotte Perospero: "[printed text omitted -- pnpm card:text OP17-110]"
      "OP17-110",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  type: "Big Mom Pirates",
                  maxBaseCost: 6,
                },
                bind: "op17-perospero-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op17-perospero-play" },
              },
              {
                kind: "grant-keyword",
                binding: SOURCE_BINDING,
                keyword: "Rush",
                expiresAfterTurns: 0,
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-111 Charlotte Mont-d'or: "[printed text omitted -- pnpm card:text OP17-111]"
      //
      // Same reveal-as-cost simplification as OP17-042: the two cards stay in
      // hand, and the `choose` gates the K.O. on 2 qualifying cards existing.
      "OP17-111",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand", hasTrigger: true },
            bind: "op17-montdor-reveal",
            min: 2,
            max: 2,
            effect: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 1,
              },
              bind: "op17-montdor-ko",
              min: 0,
              max: 2,
              effect: { kind: "knock-out", binding: "op17-montdor-ko" },
            },
          },
        },
      },
    ],
    [
      // OP17-114 Sweet 3 Generals: "[printed text omitted -- pnpm card:text OP17-114]"
      "OP17-114",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: {
            kind: "if",
            condition: {
              kind: "active-don",
              player: "self",
              operator: "gte",
              value: 2,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest-don", player: "self", count: 2 },
                  { kind: "draw", player: "self", count: 1 },
                  {
                    kind: "choose",
                    selector: { player: "self", zone: "deck", position: "top" },
                    bind: "op17-sweet3-life",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op17-sweet3-life",
                      to: { player: "self", zone: "life", position: "top" },
                    },
                  },
                  {
                    kind: "choose",
                    selector: { player: "opponent", zone: "board" },
                    bind: "op17-sweet3-debuff",
                    min: 0,
                    max: 2,
                    effect: {
                      kind: "modify-power",
                      binding: "op17-sweet3-debuff",
                      amount: -3_000,
                      expiresAfterTurns: 0,
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP17-118 Rocks.D.Xebec: "[printed text omitted -- pnpm card:text OP17-118]"
      //
      // `choose`'s new `maxTotalCost`/`distinctNames` fields exist for this
      // clause: a running cost cap across the whole pick, and an exclusion on
      // names already taken so the same card cannot be played twice toward the
      // total. Its own conditional Counter clause ("[printed text omitted -- pnpm card:text OP17-118]") is
      // `handCounterPower` in `static-abilities.ts`, read at the Counter step
      // rather than through a mechanic program.
      "OP17-118",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              // `category: "character"` is load-bearing, not decoration. Both
              // of this deck's 0-cost Events print `types: ["Rocks Pirates"]`,
              // so a type-only filter reaches them, and `play` puts whatever it
              // is handed onto the board -- "A `play` node always lands on the
              // board, which is the Character area", as `mechanics.ts` says. An
              // Event is never played, it is activated and trashed, so without
              // this a traced game had OP17-056 sitting on the field as a
              // 0-power permanent that had eaten one of the two deploy slots.
              //
              // This also excludes OP17-057, the one {Rocks Pirates} Stage,
              // which the printed "cards" does cover. Nothing is lost today --
              // the deck does not run it -- and a `play` node could not put it
              // in the Stage area anyway. Widen this to `anyOf` character/stage
              // once `play` can place a Stage.
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                type: "Rocks Pirates",
              },
              bind: "op17-xebec-play",
              min: 0,
              max: 2,
              maxTotalCost: 9,
              distinctNames: true,
              effect: { kind: "play", binding: "op17-xebec-play" },
            },
          ],
        },
      },
    ],
    [
      // OP17-119 Loki: "[printed text omitted -- pnpm card:text OP17-119]" No printed "up to" on the count, so the
      // cap is entirely the cost budget: `max` is set high enough that
      // `choose`'s own min/max never binds before the budget does (a board
      // holds 5 Characters). Not `exhaustive`: Bandai's OP-17 Q&A reads the
      // clause as "choose any number of your opponent's Characters whose total
      // cost is 4 or less and K.O. them", and with no number printed, rule
      // 8-4-4-1's "as many as they can" has nothing to bind -- any number
      // includes 0, so the player may stop after any pick, or before the
      // first. Its "+12 cost, and if it is your opponent's turn, +3000 power"
      // static clause is registered in `static-abilities.ts` alongside the
      // rest of the Elbaph giants.
      "OP17-119",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op17-loki-ko",
          min: 0,
          max: 5,
          maxTotalCost: 4,
          effect: { kind: "knock-out", binding: "op17-loki-ko" },
        },
      },
    ],
    [
      // OP17-112 Charlotte Linlin: "[printed text omitted -- pnpm card:text OP17-112]"
      //
      // Both branches are the player's own choice, so `choice` takes its
      // default `chooser: "self"`. Its "[Your Turn] the base power of ..."
      // static clause is the `board-aura` entry in `static-abilities.ts`.
      "OP17-112",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choice",
              branches: [
                {
                  id: "life",
                  label:
                    "Add a card from the top of your deck to the top of your Life cards",
                  effect: {
                    kind: "choose",
                    selector: { player: "self", zone: "deck", position: "top" },
                    bind: "op17-linlin-life",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op17-linlin-life",
                      to: { player: "self", zone: "life", position: "top" },
                    },
                  },
                },
                {
                  id: "steal",
                  label:
                    "Add a card from the top of your opponent's Life cards to their hand",
                  effect: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "life",
                      position: "top",
                    },
                    bind: "op17-linlin-steal",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op17-linlin-steal",
                      to: { player: "opponent", zone: "hand" },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  ],
};
