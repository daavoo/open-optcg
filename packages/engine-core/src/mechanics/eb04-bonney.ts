/**
 * EB-04 Red/Yellow Jewelry Bonney: the Egghead low-Life package.
 *
 * Card data for these identities lives in `packages/cards/src/eb04-bonney.ts`.
 *
 * Every clause here reads the controller's own Life total, and each one reads a
 * different threshold: the Leader's give-back stops at 2, EB04-052 and EB04-054
 * pay out at 2 or less, OP07-107 at 1 or less. Written as `zone-count` on the
 * `life` zone rather than as a shared helper, because the numbers are what
 * separate the cards -- collapsing them behind one name would hide the ladder
 * the deck is built on. `life-versus` is the wrong condition for all of them:
 * it compares the two players, and none of this text mentions the opponent's
 * Life at all.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, payFromHand } from "./shared.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- EB04-007 Roronoa Zoro's `[On Play]`, and the payoff half of
 * EB04-061 Monkey.D.Luffy's.
 *
 * `{ zone: [], includeLeader: true }` is the handle on the Leader itself: it
 * sits in no zone, so this is the only selector shape that reaches it, and
 * `count: "all"` over a one-card selection is how mandatory text with no choice
 * in it is written. `expiresAfterTurns: 1` is the "[printed text omitted -- pnpm card:text EB04-061]" duration, so the buff is still up while the
 * opponent attacks into it -- which for Zoro is the point, and for Luffy is
 * what the card from hand is being traded for.
 */
const leaderPlusTwoThousand: MechanicEffect = {
  kind: "select",
  selector: { player: "self", zone: [], includeLeader: true },
  bind: "eb04-leader-buff",
  count: "all",
  effect: {
    kind: "modify-power",
    binding: "eb04-leader-buff",
    amount: 2000,
    expiresAfterTurns: 1,
  },
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" --
 * EB04-054 Bartholomew Kuma's `[On Play]`, behind its own Life gate.
 *
 * Face-down, because a card added from the deck has never been seen: `faceUp`
 * defaults that way, and it is written out here for the same reason OP16-119's
 * copy is -- the flag is the difference between a Life card whose `[Trigger]`
 * the opponent can plan around and one they cannot.
 */
const deckTopToLife = (bind: string): MechanicEffect => ({
  kind: "select",
  selector: { player: "self", zone: "deck", position: "top" },
  bind,
  count: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "self", zone: "life", position: "top" },
    faceUp: false,
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- EB04-054's `[On K.O.]`.
 *
 * The opponent's Life goes *down* by one and their hand up by one, which is the
 * yellow trade in reverse: this deck is happy to shorten the race, and a Kuma
 * that trades in combat still moves the clock a turn closer on the way out.
 * `to.player: "opponent"` rather than `"owner"` because the card was never this
 * player's -- it is in the opponent's Life zone, so the two readings agree, and
 * naming the side is what the printed "the owner's hand" means here.
 */
const opponentLifeToTheirHand = (bind: string): MechanicEffect => ({
  kind: "select",
  selector: { player: "opponent", zone: "life", position: "top" },
  bind,
  count: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "opponent", zone: "hand" },
  },
});

export const eb04BonneyMechanics: SetMechanics = {
  activateMain: [
    [
      // EB04-001 Jewelry Bonney, the Leader: "[printed text omitted -- pnpm card:text EB04-001]"
      //
      // The two halves are sequenced, not nested. The debuff is mandatory text
      // with an "up to 1" target, so declining it is the `min: 0` rather than a
      // prompt, and the Life half still resolves on an empty board -- which is
      // the activation this deck takes most turns, because the card is what it
      // is for.
      //
      // The "2 or more Life cards" gate is what makes this a ladder rather than
      // a loop: the Leader trades Life for cards until it is down to one, and
      // at one the trade stops and the `[Opponent's Turn]` +2000 in
      // `static-abilities.ts` switches on. So the two printed clauses share one
      // threshold from opposite sides and the card can never dig itself to
      // zero.
      //
      // `position: "edge"` rather than `"top"`: the printed text says "the top
      // of your Life cards", and `edge` is the shape every other Life-to-hand
      // clause in the pool uses, so a one-card Life stack resolves to that card
      // rather than to nothing.
      "EB04-001",
      {
        oncePerTurn: true,
        program: {
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
                bind: "eb04-001-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "eb04-001-debuff",
                  amount: -1000,
                  expiresAfterTurns: 0,
                },
              },
              {
                kind: "if",
                condition: {
                  kind: "zone-count",
                  player: "self",
                  zone: "life",
                  operator: "gte",
                  value: 2,
                },
                then: {
                  kind: "optional",
                  effect: {
                    kind: "select",
                    selector: {
                      player: "self",
                      zone: "life",
                      position: "edge",
                    },
                    bind: "eb04-001-life",
                    count: 1,
                    effect: {
                      kind: "move",
                      binding: "eb04-001-life",
                      to: { player: "self", zone: "hand" },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB04-007 Roronoa Zoro: "[printed text omitted -- pnpm card:text EB04-007]"
      //
      // [Rush: Character] rather than [Rush], so the 9000 body can answer the
      // 8000 that turned the clause on and cannot be pointed at the Leader --
      // this is removal that happens to be a Character, not a second attacker.
      //
      // `minCurrentPower` rather than `minPower`: "8000 power or more" is read
      // after modifiers, so a 6000 body carrying two DON!! turns the activation
      // on, and a printed 8000 that has been debuffed below the line turns it
      // off. That reading is what makes the clause live against every deck in
      // the field rather than only against the ones that print big bodies.
      //
      // The condition is the program's whole gate, which `bareGateCondition`
      // reads in `legal-actions/main.ts`: an activation offered against a board
      // with nothing at 8000 would spend the once-per-turn budget for nothing.
      "EB04-007",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "opponent",
              selector: {
                zone: "board",
                category: "character",
                minCurrentPower: 8000,
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "grant-keyword",
              binding: SOURCE_BINDING,
              keyword: "Rush: Character",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
  ],
  onPlay: [
    [
      // EB04-007 Roronoa Zoro: "[printed text omitted -- pnpm card:text EB04-007]" Its `[Activate: Main]` half
      // is registered above.
      "EB04-007",
      { effect: leaderPlusTwoThousand },
    ],
    [
      // EB04-054 Bartholomew Kuma: "[printed text omitted -- pnpm card:text EB04-054]" Its `[On K.O.]` half is in `onKo` below.
      //
      // A 7-cost 7000 that only refills Life once the deck has spent it, which
      // is the shape every yellow body in this list shares: nothing here rewards
      // a full Life total.
      "EB04-054",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 2,
          },
          then: deckTopToLife("eb04-054-life"),
        },
      },
    ],
    [
      // EB04-061 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text EB04-061]"
      //
      // `payFromHand` nests the payoff inside the cost's `choose`, so a player
      // with an empty hand gets neither half rather than the buff for free.
      // Both halves last through the opponent's turn -- a 12000 [Blocker] in
      // front of a Leader that is already at 7000 from its own low-Life clause
      // is what the deck is paying ten DON!! and a card for.
      //
      // The `[Blocker]` is granted, not printed: it exists only as turn-scoped
      // board state, which is what `grant-keyword` is for, and it expires on the
      // same schedule as the Leader buff it is sequenced with.
      "EB04-061",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "eb04-061-cost",
            1,
            {
              kind: "sequence",
              effects: [
                leaderPlusTwoThousand,
                {
                  kind: "grant-keyword",
                  binding: SOURCE_BINDING,
                  keyword: "Blocker",
                  expiresAfterTurns: 1,
                },
              ],
            },
          ),
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // EB04-052 Sanji: "[printed text omitted -- pnpm card:text EB04-052]"
      //
      // A 4-cost 4000 that attacks as whatever the opponent's Leader currently
      // is -- 5000 normally, and more against a Leader that has pumped itself,
      // which is the half that makes this a real card rather than a +1000.
      //
      // `copy-power` reads *current* power and takes the value once, when this
      // resolves, which is both what "becomes" means and what makes the clause
      // scale: DON!! the opponent gave their own Leader is copied too. This is
      // the first clause in the pool to copy from a Leader rather than from a
      // board Character -- see the Leader branch in `copy-power`'s resolver.
      //
      // Base power, so the DON!! given to Sanji herself stacks on top of the
      // copied number rather than being replaced by it.
      "EB04-052",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "select",
              selector: { player: "opponent", zone: [], includeLeader: true },
              bind: "eb04-052-leader",
              count: "all",
              effect: {
                kind: "copy-power",
                from: "eb04-052-leader",
                to: SOURCE_BINDING,
                expiresAfterTurns: 0,
              },
            },
          ],
        },
      },
    ],
  ],
  onKo: [
    [
      // EB04-052 Sanji: "[printed text omitted -- pnpm card:text EB04-052]" Its
      // `[When Attacking]` half is registered above.
      //
      // Free, and with no cost to decline -- the "up to 1" is the `min: 0`. The
      // colour filter is printed and matters in a two-colour deck: the red half
      // of this list, EB04-002 and EB04-007, is not eligible.
      //
      // `maxPower` rather than `maxCurrentPower`: the card is in hand, where
      // there is nothing but the printed number to read.
      "EB04-052",
      {
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
              zone: "hand",
              category: "character",
              color: "Yellow",
              maxPower: 6000,
            },
            bind: "eb04-052-free-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "eb04-052-free-play" },
          },
        },
      },
    ],
    [
      // EB04-054 Bartholomew Kuma: "[printed text omitted -- pnpm card:text EB04-054]" Its `[On Play]` half is
      // registered above.
      //
      // Unconditional, unlike the `[On Play]`: this half fires whatever the
      // controller's own Life total is, which is why the two are separate
      // entries rather than one gated program.
      "EB04-054",
      { effect: opponentLifeToTheirHand("eb04-054-opponent-life") },
    ],
  ],
  eventMain: [
    [
      // OP07-114 "[printed text omitted -- pnpm card:text OP07-114]": "[printed text omitted -- pnpm card:text OP07-114]"
      //
      // The standard search template at five deep. The "other than" exclusion is
      // by name and is not decoration -- the Event is itself {Egghead}, so
      // without it the card would find copies of itself.
      //
      // 46 of this deck's 50 slots carry the type, which is what makes a 1-cost
      // dig-five close to a guaranteed hit rather than a gamble.
      "OP07-114",
      {
        cost: 1,
        program: lookAndAdd(5, "op07-114-look", {
          type: "Egghead",
          excludeName: "He Possesses the World's Most Brilliant Mind",
        }),
      },
    ],
  ],
  trigger: [
    [
      // OP07-107 Franky: "[printed text omitted -- pnpm card:text OP07-107]"
      //
      // The draw is unconditional and the body is not, so the two are sequenced
      // rather than nested. Read the pair against the deck it is in: four copies
      // in a list that spends its own Life means the last two Life cards can each
      // arrive as a card *and* a free 5000 body, which is the reason this deck
      // treats damage as a resource rather than as a cost.
      //
      // `play` on `SOURCE_BINDING` is the "play this card" idiom -- the Trigger
      // card itself, from wherever the Life flip left it.
      "OP07-107",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "if",
              condition: {
                kind: "zone-count",
                player: "self",
                zone: "life",
                operator: "lte",
                value: 1,
              },
              then: { kind: "play", binding: SOURCE_BINDING },
            },
          ],
        },
      },
    ],
    [
      // OP07-114 "[printed text omitted -- pnpm card:text OP07-114]": "[Trigger] Draw
      // 1 card." Its `[Main]` half is registered above.
      "OP07-114",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
  ],
};
