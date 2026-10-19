/** OP15 `[On Play]` programs. */
import { SOURCE_BINDING, restableCards } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lifeToHandCost, lookAndAdd } from "./shared.js";

export const op15OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP15-032 Brook: "[On Play] Rest up to 1 of your opponent's cards."
      //
      // Migrated with the card's `[Activate: Main]`, for the reason OP12-046's
      // `[On Play]` was: the debt register is per card.
      //
      // "Your opponent's cards" is every active card on their side -- Leader,
      // Characters, Stage and DON!! -- which `restableCards` names.
      "OP15-032",
      {
        effect: {
          kind: "choose",
          selector: restableCards("opponent"),
          bind: "op15-brook-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op15-brook-rest" },
        },
      },
    ],
    [
      // OP15-004 Sea Cat: "[printed text omitted -- pnpm card:text OP15-004]"
      //
      // The gate is on the Leader's *current* power, which is what
      // `leader-power` reads -- a Leader is in no zone, so `selector-count`
      // cannot ask about it. Red/Alabasta prints several ways to push a Leader
      // that low, and the printed "0 or less" is inclusive.
      "OP15-004",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-power",
            player: "self",
            operator: "lte",
            value: 0,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op15-sea-cat-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op15-sea-cat-debuff",
              amount: -3000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP15-007 Gin: "[printed text omitted -- pnpm card:text OP15-007]"
      //
      // A free play rather than a discount, so the cost ceiling is the only
      // limit and no DON!! is spent.
      "OP15-007",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "East Blue",
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              maxCost: 5,
            },
            bind: "op15-gin-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op15-gin-play" },
          },
        },
      },
    ],
    [
      // OP15-028 Meowban Brothers: "[printed text omitted -- pnpm card:text OP15-028]"
      //
      // Green/East Blue's signature trick: DON!! given to a Character is DON!!
      // the opponent cannot spend this turn, and it turns their board into
      // targets for the set's "with a DON!! card given" removal. The cost area
      // is both piles, which is what `cost-area` says -- five other cards in
      // this set name the rested pile outright, and this one does not. It is
      // their DON!! moving onto their own Character, so `player: "opponent"` on
      // both halves.
      "OP15-028",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "East Blue",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op15-meowban-target",
            min: 0,
            max: 1,
            effect: {
              kind: "attach-don",
              player: "opponent",
              from: "cost-area",
              count: 1,
              target: { binding: "op15-meowban-target" },
            },
          },
        },
      },
    ],
    [
      // OP15-026 Jango: "[printed text omitted -- pnpm card:text OP15-026]" Its
      // `[Activate: Main]` half is in `op15-main.ts`.
      "OP15-026",
      lookAndAdd(3, "op15-jango-look", { type: "East Blue" }),
    ],
    [
      // OP15-033 Hody Jones: "[printed text omitted -- pnpm card:text OP15-033]"
      //
      // The type is a condition on the Leader, not a target filter with a
      // fallback: under a Leader without {Fish-Man} nothing is set active, and
      // the Life card is still added, because the printed "Then" does not
      // depend on the first sentence succeeding.
      //
      // `{ zone: [], includeLeader: true }` is the handle on the Leader itself;
      // `update` un-rests it without the visible resting event `rest` emits.
      "OP15-033",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Fish-Man",
              },
              then: {
                kind: "select",
                selector: { player: "self", zone: [], includeLeader: true },
                bind: "op15-hody-leader",
                count: "all",
                effect: {
                  kind: "update",
                  binding: "op15-hody-leader",
                  rested: false,
                },
              },
            },
            {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "edge" },
              bind: "op15-hody-life",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op15-hody-life",
                to: { player: "self", zone: "hand" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP15-029 Bartholomew Kuma: "[printed text omitted -- pnpm card:text OP15-029]"
      //
      // `expiresAfterTurns: 1` is that window: the restriction has to survive
      // the opponent's whole turn, which is one turn boundary away. Same shape
      // as OP16-032 Magellan, bounded by cost instead of by name.
      "OP15-029",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 5,
          },
          bind: "op15-kuma-lock",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "op15-kuma-lock",
            restriction: "cannot-rest",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP15-040 Viola: "[printed text omitted -- pnpm card:text OP15-040]"
      "OP15-040",
      lookAndAdd(3, "op15-viola-look", { type: "Dressrosa" }),
    ],
    [
      // OP15-043 Kelly Funk: "[printed text omitted -- pnpm card:text OP15-043]" The two halves of the Funk brothers, printed as a pair.
      "OP15-043",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            name: "Bobby Funk",
          },
          bind: "op15-kelly-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op15-kelly-play" },
        },
      },
    ],
    [
      // OP15-045 Sai: "[printed text omitted -- pnpm card:text OP15-045]"
      //
      // The trash is the cost, so the draw only happens on the branch that pays
      // it: `optional` over a sequence, not two independent choices. A hand with
      // no Event has nothing to pick, and the `choose` at `min: 1` is what makes
      // the whole branch resolve to nothing rather than drawing for free.
      "OP15-045",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "event",
                },
                bind: "op15-sai-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op15-sai-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    { kind: "draw", player: "self", count: 2 },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-053 Rebecca: "[printed text omitted -- pnpm card:text OP15-053]"
      //
      // The [DON!! x1] [Blocker] is a conditional keyword layer, so it lives in
      // `static-abilities.ts` rather than here: it is read continuously, not
      // dispatched.
      "OP15-053",
      lookAndAdd(3, "op15-rebecca-look", { type: "Dressrosa" }),
    ],
    [
      // OP15-087 Nico Robin: "[printed text omitted -- pnpm card:text OP15-087]"
      //
      // "Draw 2 and trash 2" is a refill, not a cost, so the trash is mandatory
      // and happens after the draw -- the drawn cards are eligible to be the
      // ones discarded. `min: 2` with a hand that cannot reach two is the
      // engine's ordinary shortfall handling, not a decline.
      //
      // The trash-count [Blocker] is in `static-abilities.ts`, for the same
      // reason Rebecca's is.
      "OP15-087",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op15-robin-discard",
              min: 2,
              max: 2,
              effect: {
                kind: "move",
                binding: "op15-robin-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP15-008 Krieg: "[printed text omitted -- pnpm card:text OP15-008]"
      //
      // The Character it names is remembered, because its own `[Activate: Main]`
      // half refers back to it as "that Character" -- the only back-reference
      // between two clauses of one card in the pool. See `op15-main.ts`.
      "OP15-008",
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
              },
              bind: "op15-krieg-mark",
              min: 0,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "attach-don",
                    player: "opponent",
                    from: "rested",
                    count: 3,
                    target: { binding: "op15-krieg-mark" },
                  },
                  {
                    kind: "remember-target",
                    binding: "op15-krieg-mark",
                  },
                ],
              },
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
    ],
    [
      // OP15-014 Bartolomeo: "[printed text omitted -- pnpm card:text OP15-014]"
      //
      // The Event's cost line is waived, which is the whole point -- a 4-cost
      // body that also fires a 3-cost Event. `maxCost` reads effective cost
      // while the printed text says *base* cost, so OP15-021's own −3 discount
      // cannot smuggle a 4-cost Event in; that is a deliberate narrowing, and
      // the printed reading is the one on the card. Its K.O. replacement is in
      // `op16-replacements.ts`.
      "OP15-014",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "event",
            type: "Dressrosa",
            maxCost: 3,
          },
          bind: "op15-bartolomeo-event",
          min: 0,
          max: 1,
          effect: {
            kind: "activate-event",
            binding: "op15-bartolomeo-event",
          },
        },
      },
    ],
    [
      // OP15-046 Sabo: "[printed text omitted -- pnpm card:text OP15-046]"
      //
      // The same free activation with no cost ceiling at all -- a 7-cost body
      // that fires the deck's biggest Event for nothing.
      "OP15-046",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Dressrosa",
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "event",
              type: "Dressrosa",
            },
            bind: "op15-sabo-event",
            min: 0,
            max: 1,
            effect: { kind: "activate-event", binding: "op15-sabo-event" },
          },
        },
      },
    ],
    [
      // OP15-015 Higuma: "[printed text omitted -- pnpm card:text OP15-015]"
      //
      // The two halves are one combo: the first creates the target the second
      // needs. They stay separate choices because the printed text is two "up
      // to" clauses -- the second may name a Character that already carried a
      // DON!!, including one the first half did not touch.
      "OP15-015",
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
              },
              bind: "op15-higuma-give",
              min: 0,
              max: 1,
              effect: {
                kind: "attach-don",
                player: "opponent",
                from: "rested",
                count: 1,
                target: { binding: "op15-higuma-give" },
              },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                minGivenDon: 1,
              },
              bind: "op15-higuma-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op15-higuma-debuff",
                amount: -1000,
                expiresAfterTurns: 0,
              },
            },
          ],
        },
      },
    ],
    [
      // OP15-065 Goro: "[printed text omitted -- pnpm card:text OP15-065]"
      //
      // A reveal, not a look: the card stays on top of the deck and both players
      // see it, which is why `reveal` emits a public `card-revealed` where
      // `look-at` emits a private one. The condition then reads the same card
      // back through a `selector-count` bound to the top of the deck.
      "OP15-065",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "select",
              selector: { player: "self", zone: "deck", position: "top" },
              bind: "op15-goro-reveal",
              count: "all",
              effect: { kind: "reveal", binding: "op15-goro-reveal" },
            },
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "self",
                selector: {
                  zone: "deck",
                  binding: "op15-goro-reveal",
                  maxCost: 2,
                },
                operator: "gte",
                value: 1,
              },
              then: {
                kind: "add-don",
                player: "self",
                count: 1,
                rested: true,
              },
            },
          ],
        },
      },
    ],
    [
      // OP15-025 Kuro: "[printed text omitted -- pnpm card:text OP15-025]"
      //
      // The delayed half is registered as an `[End of Your Turn]` program gated
      // on `source-played-this-turn`, which is what "at the end of this turn"
      // means for a clause set up on the way in: it fires once, on Kuro's own
      // turn, and never again.
      "OP15-025",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op15-kuro-give",
          min: 0,
          max: 1,
          effect: {
            kind: "attach-don",
            player: "opponent",
            from: "cost-area",
            count: 2,
            target: { binding: "op15-kuro-give" },
          },
        },
      },
    ],
    [
      // OP15-027 Dracule Mihawk: "[printed text omitted -- pnpm card:text OP15-027]"
      //
      // The clean statement of the set's Green/East Blue plan: the opponent's
      // own DON!! marks the target. `canRest` keeps it off a Character another
      // effect has protected, which the printed "rest" cannot reach.
      "OP15-027",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            minGivenDon: 1,
            canRest: true,
          },
          bind: "op15-mihawk-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op15-mihawk-rest" },
        },
      },
    ],
    [
      // OP15-034 Yorki: "[printed text omitted -- pnpm card:text OP15-034]"
      //
      // `[Your Turn]` on an `[On Play]` is all but redundant -- a Character is
      // played on its controller's turn -- but it is printed, so it is checked:
      // an effect that plays a Character during the opponent's turn would
      // otherwise fire it.
      "OP15-034",
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
              name: "Brook",
            },
            bind: "op15-yorki-buff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op15-yorki-buff",
              amount: 2000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP15-081 Sanji: "[printed text omitted -- pnpm card:text OP15-081]"
      //
      // Black's self-mill: the cards are fuel, and the archetype's payoffs
      // (OP15-083 at 15 in the trash, OP15-087 at 10) read the count back.
      "OP15-081",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Straw Hat Crew",
          },
          then: { kind: "trash-top", player: "self", count: 5 },
        },
      },
    ],
    [
      // OP15-082 Charlotte Lola: "[printed text omitted -- pnpm card:text OP15-082]" Its `[On K.O.]` half is registered in `op15-triggers.ts`.
      "OP15-082",
      { effect: { kind: "trash-top", player: "self", count: 3 } },
    ],
    [
      // OP15-083 Spoil: "[printed text omitted -- pnpm card:text OP15-083]"
      // Its `[Activate: Main]` half is registered in `op15-main.ts`.
      "OP15-083",
      { effect: { kind: "trash-top", player: "self", count: 3 } },
    ],
    [
      // OP15-084 Dr. Hogback: "[printed text omitted -- pnpm card:text OP15-084]"
      "OP15-084",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Thriller Bark Pirates",
          },
          then: { kind: "trash-top", player: "self", count: 5 },
        },
      },
    ],
    [
      // OP15-085 Tony Tony.Chopper: "[printed text omitted -- pnpm card:text OP15-085]" Its `[Activate: Main]` half is in `op15-main.ts`.
      "OP15-085",
      { effect: { kind: "trash-top", player: "self", count: 3 } },
    ],
    [
      // OP15-088 Pirates Docking Six: "[printed text omitted -- pnpm card:text OP15-088]"
      //
      // The mill is the cost, so it happens on the paying branch only -- and it
      // happens *before* the search, which is the point: the three cards it
      // buries are themselves eligible targets. The printed "+6 cost" is a
      // static layer in `static-abilities.ts`.
      "OP15-088",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              { kind: "trash-top", player: "self", count: 3 },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "trash",
                  category: "character",
                  type: "Straw Hat Crew",
                  maxCost: 2,
                },
                bind: "op15-docking-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op15-docking-play" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-042 Kyros: "[printed text omitted -- pnpm card:text OP15-042]"
      // Its `[On K.O.]` half is in `op15-triggers.ts`.
      //
      // The discard is paid whether or not the Leader matches -- the printed
      // colon puts the condition *after* the cost, so a player who pays under
      // the wrong Leader has spent the card. That is faithful, and it is why
      // the `if` sits inside the paying branch rather than around it.
      "OP15-042",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op15-kyros-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op15-kyros-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    {
                      kind: "if",
                      condition: {
                        kind: "leader-has-name",
                        player: "self",
                        name: "Rebecca",
                      },
                      then: {
                        kind: "grant-keyword",
                        binding: SOURCE_BINDING,
                        keyword: "Rush",
                        expiresAfterTurns: 0,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-048 Chinjao: "[printed text omitted -- pnpm card:text OP15-048]" Its `[Opponent's Turn] [On K.O.]` half is in
      // `op15-triggers.ts`. Same template as OP15-045 Sai, one clause richer.
      "OP15-048",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand", category: "event" },
                bind: "op15-chinjao-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op15-chinjao-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    { kind: "draw", player: "self", count: 2 },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-057 Dressrosa Kingdom: "[printed text omitted -- pnpm card:text OP15-057]" Its `[On Your Opponent's Attack]` half
      // is in `op15-battle.ts`.
      "OP15-057",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Dressrosa",
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP15-073 Yama: "[printed text omitted -- pnpm card:text OP15-073]"
      //
      // Two halves that are one choice: the printed "or" offers a single play,
      // and `anyOf` is what keeps a card that is both from being offered twice.
      // "A cost of 1" is exact on both halves, so the bound is two-sided.
      "OP15-073",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            anyOf: [{ name: "Heavenly Warriors" }, { type: "Vassals" }],
            minCost: 1,
            maxCost: 1,
          },
          bind: "op15-yama-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op15-yama-play" },
        },
      },
    ],
    [
      // OP15-086 Nami: "[printed text omitted -- pnpm card:text OP15-086]"
      //
      // The [Rush] lands on the *revived* Character, not on Nami: the binding
      // the play used is what names it, which is why the grant reads the same
      // binding rather than the source.
      "OP15-086",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Straw Hat Crew",
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              category: "character",
              type: "Straw Hat Crew",
              maxCost: 7,
            },
            bind: "op15-nami-revive",
            min: 0,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "play", binding: "op15-nami-revive" },
                {
                  kind: "grant-keyword",
                  binding: "op15-nami-revive",
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
      // OP15-100 Kamakiri: "[printed text omitted -- pnpm card:text OP15-100]"
      //
      // Two costs, both mandatory on the paying branch, and the Life card is
      // the one that gates it: a player at zero Life cannot pay, which
      // `lifeToHandCost` expresses as a `choose` at `min: 1` over an empty zone.
      // Kamakiri trashes itself, so the K.O. resolves with it already gone.
      "OP15-100",
      lifeToHandCost(
        {
          kind: "sequence",
          effects: [
            {
              kind: "move",
              binding: SOURCE_BINDING,
              to: { player: "self", zone: "trash" },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 6,
              },
              bind: "op15-kamakiri-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op15-kamakiri-ko" },
            },
          ],
        },
        "top",
      ),
    ],
    [
      // OP15-031 Purinpurin: "[printed text omitted -- pnpm card:text OP15-031]"
      //
      // Printed as a check after the selection; written as a filter on it,
      // because nothing else reads the selection and offering a choice that
      // provably does nothing is a legal action a rules agent will take.
      "OP15-031",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
            costEqualsGivenDon: true,
          },
          bind: "op15-purinpurin-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op15-purinpurin-ko" },
        },
      },
    ],
    [
      // OP15-099 Urouge: "[printed text omitted -- pnpm card:text OP15-099]" Its
      // `[Activate: Main]` half is in `op15-main.ts`.
      "OP15-099",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  type: "Supernovas",
                },
                bind: "op15-urouge-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op15-urouge-cost",
                      to: { player: "self", zone: "trash" },
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
            ],
          },
        },
      },
    ],
    [
      // OP15-101 Kalgara: "[printed text omitted -- pnpm card:text OP15-101]"
      //
      // "Up to a total of 2" across both halves of the "or", which is what
      // `anyOf` gives for free: one `choose` at `max: 2` over the union, rather
      // than two searches that could each find two.
      "OP15-101",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op15-kalgara-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op15-kalgara-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    {
                      kind: "look-at",
                      player: "self",
                      count: 5,
                      bind: "op15-kalgara-look",
                    },
                    {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "deck",
                        binding: "op15-kalgara-look",
                        anyOf: [
                          { name: "Mont Blanc Noland" },
                          { type: "Shandian Warrior" },
                        ],
                      },
                      bind: "op15-kalgara-add",
                      min: 0,
                      max: 2,
                      effect: {
                        kind: "move",
                        binding: "op15-kalgara-add",
                        to: { player: "self", zone: "hand" },
                      },
                    },
                    {
                      kind: "select",
                      selector: {
                        player: "self",
                        zone: "deck",
                        binding: "op15-kalgara-look",
                      },
                      bind: "op15-kalgara-rest",
                      count: "all",
                      effect: {
                        kind: "order-to-bottom",
                        binding: "op15-kalgara-rest",
                        to: {
                          player: "self",
                          zone: "deck",
                          position: "bottom",
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-102 Gan.Fall: "[printed text omitted -- pnpm card:text OP15-102]"
      //
      // A ceiling that moves with the game rather than a printed constant, which
      // is what `maxCostFromZoneCount` exists for -- and it cuts both ways: the
      // card is at its weakest exactly when the opponent is closest to losing.
      // Its printed hand-cost discount is a static layer.
      "OP15-102",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCostFromZoneCount: { player: "opponent", zone: "life" },
            canRest: true,
          },
          bind: "op15-ganfall-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op15-ganfall-rest" },
        },
      },
    ],
    [
      // OP15-109 Nico Robin: "[printed text omitted -- pnpm card:text OP15-109]"
      //
      // The Life card is the cost and it is paid first, so the Life it replaces
      // is a different card -- that swap is the point, since the card taken is
      // known and the one banked is not. Both halves after the colon sit inside
      // the Leader check: the printed "Then" continues the same sentence.
      "OP15-109",
      lifeToHandCost(
        {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Straw Hat Crew",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "deck", position: "top" },
                bind: "op15-robin109-bank",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op15-robin109-bank",
                  to: { player: "self", zone: "life", position: "top" },
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  type: "Sky Island",
                  maxCost: 5,
                },
                bind: "op15-robin109-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op15-robin109-play" },
              },
            ],
          },
        },
        "top",
      ),
    ],
    [
      // OP15-104 Conis: "[printed text omitted -- pnpm card:text OP15-104]"
      //
      // Yellow's behind-only refill. The discard happens after the draw, so the
      // drawn cards are eligible -- the same reading OP15-087 Nico Robin gets.
      "OP15-104",
      {
        effect: {
          kind: "if",
          condition: { kind: "life-versus", player: "self", operator: "lt" },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op15-conis-discard",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op15-conis-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-112 Raki: "[printed text omitted -- pnpm card:text OP15-112]"
      "OP15-112",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            type: "Shandian Warrior",
            maxCost: 3,
          },
          bind: "op15-raki-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op15-raki-play" },
        },
      },
    ],
    [
      // OP15-091 Margarita: "[printed text omitted -- pnpm card:text OP15-091]"
      //
      // "The owner's deck" is the opponent's: a card in their trash is theirs,
      // however it got there. Graveyard hate aimed at the set's own trash
      // recursion.
      "OP15-091",
      {
        effect: {
          kind: "choose",
          selector: { player: "opponent", zone: "trash" },
          bind: "op15-margarita-bury",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op15-margarita-bury",
            to: { player: "opponent", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // OP15-108 Nami: "[printed text omitted -- pnpm card:text OP15-108]"
      "OP15-108",
      lookAndAdd(3, "op15-nami-look", { type: "Sky Island" }),
    ],
  ],
};
