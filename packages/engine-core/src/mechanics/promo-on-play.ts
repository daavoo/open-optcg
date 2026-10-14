/**
 * `[On Play]` and `[On K.O.]` programs for the `P-` promos.
 *
 * The promos are not a set: they are printed one at a time in event packs,
 * tournament kits and magazine inserts, so this file is a list of unrelated
 * cards rather than a design. It splits by timing window like every other
 * import all the same -- `promo-main.ts`, `promo-battle.ts`,
 * `promo-triggers.ts` and `promo-replacements.ts` are the rest. See
 * `mechanics/README.md`.
 *
 * Seven promos were in the pool before this import, read off the page for the
 * decks that play them: P-085, P-088, P-090, P-096, P-101, P-105 and P-135.
 * Nothing here re-registers them.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text P-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { buffOwnCardForTurn } from "./op07-shared.js";
import { powerDebuff } from "./op08-shared.js";
import { payFromHand, restCostAtMost } from "./shared.js";
import { silenceBlockers, sortFiveDeep } from "./promo-shared.js";

export const promoOnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // P-063 Jinbe: arriving rests a 1-cost body.
      //
      // The narrowest rest in the pool and the whole of a 4-cost 5000 with a
      // 2000 Counter, which is what a promo reprint of a starter common looks
      // like: the body is the card, and the clause is a tempo rounding error
      // that occasionally catches a searcher before it blocks.
      "P-063",
      { effect: restCostAtMost(1, "p063-rest") },
    ],
    [
      // P-075 Monkey.D.Luffy: arriving hands a rested DON!! to the Leader or to
      // a Character.
      //
      // `give-rested-don` rather than `attach-don`, because the Leader is one of
      // the printed recipients and `attach-don`'s binding lookup reaches only a
      // board Character. At 7 cost the DON!! is what makes the turn after this
      // body playable; the [When Attacking] half is in `promo-battle.ts`.
      "P-075",
      { effect: { kind: "give-rested-don", player: "self", count: 1 } },
    ],
    [
      // P-009 Trafalgar Law: against a full grip, the opponent is *given* a
      // Life card.
      //
      // Not a benefit: the card joins their hand and their Life total drops by
      // one, which is a point of damage they cannot Counter and cannot Trigger
      // off. The hand floor is what stops it being a gift -- an opponent
      // sitting on six cards is one who has not spent them.
      "P-009",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "hand",
            operator: "gte",
            value: 6,
          },
          then: {
            kind: "select",
            selector: { player: "opponent", zone: "life", position: "top" },
            bind: "p009-life",
            count: 1,
            effect: {
              kind: "move",
              binding: "p009-life",
              to: { player: "opponent", zone: "hand" },
            },
          },
        },
      },
    ],
    [
      // P-017 Trafalgar Law: −2000 on an opposing body for the turn.
      "P-017",
      { effect: powerDebuff(2_000, "p017-debuff") },
    ],
    [
      // P-020 Helmeppo: +1000 on the Leader or a Character for the turn.
      "P-020",
      { effect: buffOwnCardForTurn(1_000, "p020-buff") },
    ],
    [
      // P-031 Uta: one rested DON!! out of the DON!! deck.
      "P-031",
      { effect: { kind: "add-don", player: "self", count: 1, rested: true } },
    ],
    [
      // P-043 Monkey.D.Luffy: a cheap body goes back to its owner's hand.
      //
      // "1 Character" names no side, so the selector is `"either"` and the
      // destination is the owner's hand rather than a fixed one -- the two only
      // agree while the target is the opponent's.
      "P-043",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 3,
          },
          bind: "p043-bounce",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "p043-bounce",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    [
      // P-046 Yamato: the whole hand goes under the deck and comes back the
      // same size.
      //
      // A filter rather than card advantage: the count is preserved, so what it
      // buys is a fresh hand with the dead cards buried. `optional`, because on
      // a hand the player wants it does nothing but shuffle their answers away
      // -- and the second half is conditional on the first ("if you do"), which
      // is what the nesting says.
      "P-046",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "select",
            selector: { player: "self", zone: "hand" },
            bind: "p046-hand",
            count: "all",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "order-to-bottom",
                  binding: "p046-hand",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
                {
                  kind: "draw",
                  player: "self",
                  count: 0,
                  perCards: { binding: "p046-hand", each: 1 },
                },
              ],
            },
          },
        },
      },
    ],
    // P-049 Usopp: a five-deep sort, the same program P-068 Sanji buys with its
    // own body in `promo-main.ts`.
    ["P-049", sortFiveDeep("p049-sort")],
    [
      // P-053 Nami: from a hand of three or fewer, a cheap opposing body goes
      // home.
      //
      // The hand ceiling is read *after* Nami has left the hand to be played,
      // which is what makes a 1-cost body reach it at all.
      "P-053",
      {
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
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 3,
            },
            bind: "p053-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "p053-bounce",
              to: { player: "owner", zone: "hand" },
            },
          },
        },
      },
    ],
    [
      // P-055 Monkey.D.Luffy: two cards out of hand and the *opponent* buries
      // one of their own Characters.
      //
      // `chooser: "opponent"` is what the printed clause says: the cards leave
      // their board and they pick which, so the choice is not the controller's.
      // No cost ceiling and no "up to" -- a board with a Character loses one,
      // whichever they least mind losing.
      "P-055",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "p055-cost",
            2,
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "p055-bury",
              chooser: "opponent",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "p055-bury",
                to: { player: "owner", zone: "deck", position: "bottom" },
              },
            },
          ),
        },
      },
    ],
    [
      // P-056 Roronoa Zoro: two DON!! turned over buy a bounce that reaches a
      // 5-cost body.
      //
      // `rest-don` is the printed cost and takes two active DON!! out of the
      // cost area without them leaving the field, which is what separates it
      // from `DON!! −2`. "1 Character" names no side, so the selector reaches
      // both boards.
      "P-056",
      {
        effect: {
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
                  kind: "choose",
                  selector: {
                    player: "either",
                    zone: "board",
                    category: "character",
                    maxCost: 5,
                  },
                  bind: "p056-bounce",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "p056-bounce",
                    to: { player: "owner", zone: "hand" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // P-082 Crocodile: behind either of the two Leader readings it names, a
      // small opposing body is buried.
      //
      // Bottom of the deck rather than the trash, so nothing recurs it -- which
      // is what a 5-cost 7000 with no Counter is paying for. `[Your Turn]`
      // needs no gate: a Character is played in its controller's Main Phase, so
      // an `[On Play]` never resolves on the other one. The two Leader readings
      // are a disjunction because one is an exact type and the other a
      // substring.
      "P-082",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              {
                kind: "leader-has-type",
                player: "self",
                type: "Cross Guild",
              },
              {
                kind: "leader-type-including",
                player: "self",
                text: "Baroque Works",
              },
            ],
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 2_000,
            },
            bind: "p082-bury",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "p082-bury",
              to: { player: "owner", zone: "deck", position: "bottom" },
            },
          },
        },
      },
    ],
    [
      // P-091 Shirahoshi: a 0-power 4-cost that brings a real body with it.
      //
      // The two types are a disjunction -- `anyOf`, because `type` alone is
      // conjunctive and could only ask for one. Its `[Activate: Main]` half is
      // in `promo-main.ts`.
      "P-091",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            maxCost: 5,
            anyOf: [{ type: "Neptunian" }, { type: "Fish-Man Island" }],
          },
          bind: "p091-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "p091-play" },
        },
      },
    ],
    // P-097 Shanks: the opponent cannot block this turn, printed on the
    // `[On Play]` and the `[When Attacking]` alike -- one program, two tables.
    ["P-097", { effect: silenceBlockers }],
    [
      // P-098 Buggy: a 10-cost 12000 [Blocker] that will not stay on a board
      // that has not earned it.
      //
      // The condition is a *floor of five* bodies at cost 5 or more, and the
      // clause fires when it is not met -- so the `if` reads the count at four
      // or fewer. The Buggy itself is one of them, which is what makes the line
      // reachable at all. It buries itself rather than being trashed, so its
      // own [Blocker] is not what the opponent gets to answer.
      "P-098",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "board", category: "character", minCost: 5 },
            operator: "lte",
            value: 4,
          },
          then: {
            kind: "move",
            binding: SOURCE_BINDING,
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // P-102 Nami: behind a {Straw Hat Crew} Leader, two DON!! come back
      // active.
      //
      // `activate-don` rather than `add-don`: the DON!! is already on the
      // field, so what this buys is the turn's tempo back rather than a
      // bigger cost area -- a 4-cost body that costs almost nothing.
      "P-102",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Straw Hat Crew",
          },
          then: { kind: "activate-don", player: "self", count: 2 },
        },
      },
    ],
    [
      // P-103 Portgas.D.Ace: two cards in, two cards back onto the deck, and a
      // rested DON!! onto the Leader.
      //
      // The hand size is unchanged, so what the first half buys is choice: the
      // two that go back are picked after the two that came in. "Top or bottom
      // in any order" is `order-to-bottom`, which asks a card at a time.
      "P-103",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "p103-back",
              min: 2,
              max: 2,
              effect: {
                kind: "order-to-bottom",
                binding: "p103-back",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
            {
              kind: "attach-don",
              player: "self",
              from: "rested",
              count: 1,
              target: "leader",
            },
          ],
        },
      },
    ],
    [
      // P-107 Gol.D.Roger: with a full cost area on either side, the Leader
      // gains 2000 that survives the opponent's turn.
      //
      // Either field, the Elbaph reading rather than "you have": a mirror where
      // both decks have ramped switches it on. `expiresAfterTurns: 1` is what
      // "until the end of your opponent's next End Phase" means in
      // player-turns, so the buff is still there when they attack into it.
      "P-107",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              {
                kind: "field-don",
                player: "self",
                operator: "gte",
                value: 10,
              },
              {
                kind: "field-don",
                player: "opponent",
                operator: "gte",
                value: 10,
              },
            ],
          },
          then: {
            kind: "select",
            selector: { player: "self", zone: [], includeLeader: true },
            bind: "p107-leader",
            count: 1,
            effect: {
              kind: "modify-power",
              binding: "p107-leader",
              amount: 2_000,
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // P-112 Nami: behind the Leader that shares its name, a rested DON!! and
      // a cheap body out of hand.
      //
      // "Then" opens a second sentence, but both sit inside the Leader gate --
      // the printed "If your Leader is [Nami]" heads the whole clause.
      "P-112",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Nami",
          },
          then: {
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
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  maxCost: 2,
                },
                bind: "p112-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "p112-play" },
              },
            ],
          },
        },
      },
    ],
    [
      // P-115 Boa Hancock: a rested DON!! onto the Leader or a Character. Its
      // `[Trigger]` is in `promo-triggers.ts`.
      "P-115",
      { effect: { kind: "give-rested-don", player: "self", count: 1 } },
    ],
  ],
  onKo: [
    [
      // P-030 Jinbe: dying buries a cheap body, on either side of the table.
      //
      // "1 Character" names no side, so this can answer the removal that killed
      // it or clear one of its controller's own bodies out of the way. Bottom
      // of the deck, so nothing recurs what it takes.
      "P-030",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 3,
          },
          bind: "p030-bury",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "p030-bury",
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // P-071 Marco: dying puts the card back in its owner's hand.
      //
      // `play` on `SOURCE_BINDING` is the idiom for reaching a card wherever
      // the K.O. left it; this is the same handle with a different
      // destination, so the body comes back as a card to cast rather than as a
      // board presence. "You may", so the whole clause is `optional`.
      "P-071",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "move",
            binding: SOURCE_BINDING,
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
  ],
};
