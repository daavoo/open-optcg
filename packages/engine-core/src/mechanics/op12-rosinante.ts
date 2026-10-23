/**
 * The Purple/Yellow [Trafalgar Law] package around OP12-061 Donquixote
 * Rosinante: the Leader, the Laws that ramp while behind on DON!!, and the
 * Events that name them. The identities come in with their own sets (OP-09,
 * OP-10, OP-12, OP-13, OP-14, EB-03, EB-04, ST-10, ST-18); this module holds
 * their behaviour in one place because the clauses read each other.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, trashFromOpponentHandBlind } from "./shared.js";

export const op12RosinanteMechanics: SetMechanics = {
  eventMain: [
    [
      // OP12-077 The "Extinguishes All Sound Created by Your Influence"
      // Technique: "[printed text omitted -- pnpm card:text OP12-077]"
      //
      // Modelled as [Unblockable] for the turn. The two are not the same words --
      // one switches the keyword off, the other says the attack cannot be blocked
      // -- but the engine's only consumer of either is the Blocker step, and every
      // Blocker in the format is a printed keyword rather than a granted one, so
      // no line of play distinguishes them. If a card ever grants or removes
      // [Blocker] in response to an attack, this needs its own flag.
      "OP12-077",
      {
        cost: 2,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              name: "Trafalgar Law",
            },
            bind: "silencing-target",
            min: 0,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "modify-power",
                  binding: "silencing-target",
                  amount: 2_000,
                  expiresAfterTurns: 0,
                },
                {
                  kind: "grant-keyword",
                  binding: "silencing-target",
                  keyword: "Unblockable",
                  expiresAfterTurns: 0,
                },
              ],
            },
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP12-115 I Love You!!: "[printed text omitted -- pnpm card:text OP12-115]"
      //
      // "[printed text omitted -- pnpm card:text OP12-115]" always covers the battle's target -- an
      // attack resolves against the Leader or against a blocking Character -- so
      // unlike the [Enel]-only Counters there is no illegal target to check for.
      //
      // The recursion half is what the guide values it for: at 2 Life the deck is
      // usually buying back a Blocker Law, and the Leader's own protection has
      // been trading Life for hand all game to get there.
      "OP12-115",
      {
        cost: 1,
        power: 2_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 2,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                name: "Trafalgar Law",
              },
              bind: "i-love-you-target",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "i-love-you-target",
                to: { player: "self", zone: "hand" },
              },
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // OP14-061 Vergo: "[printed text omitted -- pnpm card:text OP14-061]"
      //
      // The `DON!! −1` is wrapped in `optional` and gated on having a DON!! to
      // return, because a [When Attacking] fires whether or not its controller
      // wants to pay: an unconditional `return-don` would tax every Vergo attack.
      "OP14-061",
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
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "vergo-target",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "vergo-target",
                    amount: -2_000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  activateMain: [
    [
      // OP12-061 Donquixote Rosinante, the Leader: "[printed text omitted -- pnpm card:text OP12-061]"
      //
      // The one entry in this table sourced from a Leader rather than a board
      // Character. The offering loop walks the board, so it is never picked up
      // there; `getLegalActions` looks it up by Leader card number and dispatches
      // it with the Leader as source.
      //
      // `handCardsMatching` is what keeps this off the table with nothing to
      // discount: the DON!! −1 is real and permanent -- the card goes back to the
      // DON!! deck -- so an activation with no qualifying Law in hand is a
      // strictly losing move a rules agent is otherwise free to take, and one an
      // LLM seat would have to be talked out of in prose. It used to be a
      // hardcoded branch in `legal-actions/main.ts` saying the same thing, which
      // left the card offered twice under two once-per-turn keys once the generic
      // Leader path started reading this table.
      "OP12-061",
      {
        oncePerTurn: true,
        requires: {
          fieldDon: 1,
          handCardsMatching: {
            // `minBaseCost`, not `minCost`: `playCostFromHand` measures the
            // discount's own "cost of 4 or more" against the printed cost, so a
            // gate on the effective one would offer the activation for a Law
            // the discount then declines to reduce.
            match: {
              category: "character",
              name: "Trafalgar Law",
              minBaseCost: 4,
            },
            count: 1,
          },
        },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "return-don", player: "self", count: 1 },
              {
                kind: "discount-next-play",
                player: "self",
                name: "Trafalgar Law",
                minCost: 4,
                amount: 2,
              },
            ],
          },
        },
      },
    ],
    [
      // OP10-065 Sugar: "[printed text omitted -- pnpm card:text OP10-065]"
      //
      // Not once per turn -- nothing printed says so -- but every activation rests
      // an active DON!! card, which is the real limit and is what `requires`
      // enforces so a repeatable activation always changes something. Resting
      // Sugar herself is the printed "may" and stays optional, which is why the
      // guide calls her a pseudo-Blocker: leaving her active invites the attack
      // that a rested searcher would not draw.
      "OP10-065",
      {
        oncePerTurn: false,
        requires: { activeDon: 1 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 1 },
              {
                kind: "optional",
                effect: {
                  kind: "update",
                  binding: SOURCE_BINDING,
                  rested: true,
                },
              },
              lookAndAdd(5, "sugar-looked", { type: "Donquixote Pirates" })
                .effect,
            ],
          },
        },
      },
    ],
    [
      // EB03-062 Trafalgar Law: "[printed text omitted -- pnpm card:text EB03-062]"
      //
      // The cost trashes the Character, so the play that follows always has room
      // even from a full board -- the guide's line is to attack with the Rush body
      // first and only then cash it in for OP12-073.
      //
      // `name: "Trafalgar Law"` matches EB04-038 Rosinante & Law too, through the
      // alias clause it prints; that is the deck's best target for this and the
      // reason `cardNames` exists.
      "EB03-062",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "law-discard",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "law-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
              {
                kind: "move",
                binding: SOURCE_BINDING,
                to: { player: "self", zone: "trash" },
              },
              {
                kind: "select",
                selector: { player: "self", zone: "deck", position: "top" },
                bind: "law-life",
                count: 1,
                effect: {
                  kind: "move",
                  binding: "law-life",
                  to: { player: "self", zone: "life", position: "top" },
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  name: "Trafalgar Law",
                  maxCost: 7,
                },
                bind: "law-cheat",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "law-cheat" },
              },
            ],
          },
        },
      },
    ],
  ],
  onPlay: [
    [
      // OP09-069 Trafalgar Law: "[printed text omitted -- pnpm card:text OP09-069]"
      //
      // "or" is the reason `anyOf` exists: the two types are alternatives, while
      // the cost floor applies to whichever one is found.
      "OP09-069",
      lookAndAdd(4, "op09-law-looked", {
        anyOf: [{ type: "Straw Hat Crew" }, { type: "Heart Pirates" }],
        minCost: 2,
      }),
    ],
    [
      // OP12-108 Donquixote Rosinante: "[printed text omitted -- pnpm card:text OP12-108]"
      "OP12-108",
      lookAndAdd(5, "op12-rosi-looked", { name: "Trafalgar Law" }),
    ],
    [
      // OP12-073 Trafalgar Law: "[printed text omitted -- pnpm card:text OP12-073]"
      //
      // The catch-up condition gates both sentences: ahead on DON!!, neither
      // the DON!! nor the +1000 happens (Bandai's OP12-073#1 ruling).
      //
      // The buff is one `select` over a disjunction rather than two selects, so a
      // Character that is both a [Donquixote Rosinante] and a {Heart Pirates} --
      // which nothing in this list is today, but the pool allows -- gains +1000
      // once rather than twice. Law is already on the field when its own [On Play]
      // runs, so it buffs itself.
      "OP12-073",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don-versus",
            player: "self",
            operator: "lte",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "add-don",
                player: "self",
                count: 1,
                rested: false,
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  anyOf: [
                    { name: "Donquixote Rosinante" },
                    { type: "Heart Pirates" },
                  ],
                },
                bind: "op12-073-buff",
                count: "all",
                effect: {
                  kind: "modify-power",
                  binding: "op12-073-buff",
                  amount: 1_000,
                  expiresAfterTurns: 1,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB04-038 Rosinante & Law: "[printed text omitted -- pnpm card:text EB04-038]"
      //
      // Two sentences, two scopes: only the draw is behind the catch-up clause.
      // The DON!! always arrives, which is what makes this a 6-cost Blocker that
      // pays for part of itself.
      "EB04-038",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "if",
              condition: {
                kind: "field-don-versus",
                player: "self",
                operator: "lte",
              },
              then: { kind: "draw", player: "self", count: 1 },
            },
            { kind: "add-don", player: "self", count: 1, rested: false },
          ],
        },
      },
    ],
    [
      // ST10-010 Trafalgar Law: "[printed text omitted -- pnpm card:text ST10-010]"
      //
      // Gated before the cost, not after it: the `DON!! −1` is permanent -- the
      // DON!! goes back to the DON!! deck -- so offering it against a hand already
      // under seven would offer a strictly losing move.
      //
      // Law's controller picks the two, face-down (Bandai's ST10-010#1). The
      // gate above guarantees there are at least two to take.
      "ST10-010",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "hand",
            operator: "gte",
            value: 7,
          },
          then: {
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
                  trashFromOpponentHandBlind(2, "law-hand-trash"),
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
      // OP12-112 Baby 5: "[printed text omitted -- pnpm card:text OP12-112]"
      //
      // Live under this Leader, which is Purple/Yellow. The guide is blunt that
      // the deck cannot choose when it happens -- nothing in the list stacks Life
      // -- so Baby 5 is played as a searchable 2000 Counter that occasionally
      // refunds two cards.
      "OP12-112",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-multicolored", player: "self" },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP12-077 The "Extinguishes All Sound Created by Your Influence"
      // Technique: "[Trigger] Draw 1 card."
      "OP12-077",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
  ],
};
