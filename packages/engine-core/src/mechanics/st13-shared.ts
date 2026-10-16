/**
 * The face-up Life economy ST-13 is built on, as program fragments.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content (`pnpm card:text
 * ST13-0xx` prints it from the local cache).
 *
 * Every other product in the pool treats Life as a counter that occasionally
 * hands back a card. This one treats it as a second board: cards go *in* from
 * the deck, the hand and the field, they are turned face-up and face-down, the
 * whole stack is read and re-ordered, and one Leader trashes every face-up card
 * in it at end of turn. Seven of the nineteen cards print one of the four
 * fragments below.
 */
import { type MechanicEffect, type MechanicCondition } from "../mechanics.js";

/** The three brothers, whom half the product names one at a time. */
export const BROTHERS = ["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy"] as const;

/** "If you have 1 or more Life cards" -- the gate every Life cost needs. */
export const hasLife: MechanicCondition = {
  kind: "zone-count",
  player: "self",
  zone: "life",
  operator: "gte",
  value: 1,
};

/**
 * "Place the rest back in your Life area in any order."
 *
 * `order-to-bottom` into `zone: "life"` rather than into a deck, which is the
 * reason the node's summary had to stop assuming the deck's bottom: the offer
 * now carries where the cards land, so a caller reordering it re-words the same
 * sentence. Cards bound by a `look-at` that have since left the stack are no
 * longer in the zone, so the selector drops them and only "the rest" is placed.
 */
export const restBackIntoLife = (bind: string): MechanicEffect => ({
  kind: "select",
  selector: { player: "self", zone: "life", binding: bind },
  bind: `${bind}-back`,
  count: "all",
  effect: {
    kind: "order-to-bottom",
    binding: `${bind}-back`,
    to: { player: "self", zone: "life", position: "bottom" },
  },
});

/**
 * "Look at all your Life cards; place 1 card at the top of your deck and place
 * the rest back in your Life area in any order" -- ST13-004 and ST13-016.
 *
 * The clause is card advantage in the shape of a trade: the stack shrinks by
 * one and the deck's next draw is a card its owner picked out of it. `count:
 * "all"` is what `look-at` gained for this -- a Life stack is 0 to 5 cards and
 * no printed number stands in for it.
 */
export const readLifeAndBankOne = (bind: string): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "look-at", player: "self", count: "all", bind, zone: "life" },
    {
      kind: "choose",
      selector: { player: "self", zone: "life", binding: bind },
      bind: `${bind}-deck`,
      min: 1,
      max: 1,
      effect: {
        kind: "move",
        binding: `${bind}-deck`,
        to: { player: "self", zone: "deck", position: "top" },
      },
    },
    restBackIntoLife(bind),
  ],
});

/**
 * "You may trash this Character: reveal the top Life card, and if it is a
 * <name> with a cost of 5, you may play it" -- the three 2-cost brothers.
 *
 * One card each, identical but for the name, and the whole reason the deck
 * spends its turns putting 5-cost brothers onto Life face-up: this is how they
 * come back off it, for no DON!! at all. The body trashes itself as the cost,
 * a `move` rather than a `knock-out`: the printed word is trash.
 *
 * The reveal is mandatory and the play is not, which is the printed shape: a
 * miss still shows the opponent the top of your Life, and that is the price of
 * asking.
 */
export const revealLifeAndPlayBrother = (
  name: string,
  bind: string,
  sourceBinding: string,
): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "sequence",
    effects: [
      {
        kind: "move",
        binding: sourceBinding,
        to: { player: "owner", zone: "trash" },
      },
      { kind: "look-at", player: "self", count: 1, bind, zone: "life" },
      { kind: "reveal", binding: bind },
      {
        kind: "if",
        condition: {
          kind: "selector-count",
          player: "self",
          selector: {
            zone: "life",
            binding: bind,
            name,
            minCost: 5,
            maxCost: 5,
          },
          operator: "gte",
          value: 1,
        },
        then: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              { kind: "play", binding: bind },
              {
                kind: "choose",
                selector: { player: "self", zone: [], includeLeader: true },
                bind: `${bind}-buff`,
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: `${bind}-buff`,
                  amount: 2_000,
                  expiresAfterTurns: 1,
                },
              },
            ],
          },
        },
      },
    ],
  },
});

/**
 * "Look at 5 cards from the top of your deck; reveal up to 1 [Sabo],
 * [Portgas.D.Ace] or [Monkey.D.Luffy] with a cost of 5 or less and add it to
 * your hand. Then, place the rest at the bottom of your deck in any order" --
 * ST13-013 and ST13-019, the same sentence on a 1-cost body and a 1-cost Event.
 *
 * `anyOf` because the printed filter is three names, which no single `name`
 * field can say. The ceiling is 5, which is the cost of every brother the deck
 * wants to find and also of the three 2-cost ones it plays to fetch them.
 */
export const digForABrother = (bind: string): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "look-at", player: "self", count: 5, bind },
    {
      kind: "choose",
      selector: {
        player: "self",
        zone: "deck",
        binding: bind,
        maxCost: 5,
        anyOf: BROTHERS.map((name) => ({ name })),
      },
      bind: `${bind}-add`,
      min: 0,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [
          { kind: "reveal", binding: `${bind}-add` },
          {
            kind: "move",
            binding: `${bind}-add`,
            to: { player: "self", zone: "hand" },
          },
        ],
      },
    },
    {
      kind: "select",
      selector: { player: "self", zone: "deck", binding: bind },
      bind: `${bind}-rest`,
      count: "all",
      effect: {
        kind: "order-to-bottom",
        binding: `${bind}-rest`,
        to: { player: "self", zone: "deck", position: "bottom" },
      },
    },
  ],
});

/**
 * "You may trash 1 card from the top or bottom of your Life cards: <effect>"
 * -- ST13-005 and ST13-008.
 *
 * `position: "edge"` is the printed "top or bottom", and the choice is real:
 * the top card is the one the deck has been stacking on purpose, so the bottom
 * is usually what pays. The gate is outermost so a seat with no Life is never
 * offered a cost it cannot meet.
 */
export const trashLifeFor = (
  bind: string,
  payoff: MechanicEffect,
): MechanicEffect => ({
  kind: "if",
  condition: hasLife,
  then: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: { player: "self", zone: "life", position: "edge" },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [
          {
            kind: "move",
            binding: bind,
            to: { player: "self", zone: "trash" },
          },
          payoff,
        ],
      },
    },
  },
});

/**
 * "You may add 1 card from the top or bottom of your Life cards to your hand:
 * Add up to 1 card from your hand to the top of your Life cards" -- the
 * `[Trigger]` both Counter Events print.
 *
 * A swap, not a gain: the stack is the size it was and the hand is too, and
 * what changed is *which* card is on top. In a deck whose whole plan is what
 * sits on Life, that is the point -- and it arrives on the opponent's turn, for
 * free, off a card they chose to hit.
 */
export const swapTopOfLife = (bind: string): MechanicEffect => ({
  kind: "if",
  condition: hasLife,
  then: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: { player: "self", zone: "life", position: "edge" },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [
          {
            kind: "move",
            binding: bind,
            to: { player: "self", zone: "hand" },
          },
          {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: `${bind}-bank`,
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: `${bind}-bank`,
              to: { player: "self", zone: "life", position: "top" },
            },
          },
        ],
      },
    },
  },
});
