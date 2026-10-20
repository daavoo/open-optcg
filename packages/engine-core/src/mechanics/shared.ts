/**
 * Program fragments shared by more than one card.
 *
 * A printed template that several cards repeat -- "look at N, add 1 match",
 * "DON!! -N: <effect>", the Thriller Bark recursion target -- is written once
 * here and referenced from each set module, so a fix to the shape reaches every
 * card that prints it.
 */
import {
  type BattleTargetFilter,
  type CardSelector,
  type MechanicCondition,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";

/**
 * "You may add 1 card from the top (or bottom) of your Life cards to your
 * hand: <effect>".
 *
 * `position` is which Life card pays: `"edge"` offers the top and the bottom,
 * for the "top or bottom" printings; `"top"` is the card that prints only the
 * top one.
 */
export const lifeToHandCost = (
  effect: MechanicProgram["effect"],
  position: "top" | "edge" = "edge",
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: { player: "self", zone: "life", position },
      bind: "life-cost",
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [
          {
            kind: "move",
            binding: "life-cost",
            to: { player: "self", zone: "hand" },
          },
          effect,
        ],
      },
    },
  },
});

export const preventCostSixAttack: MechanicProgram = {
  effect: {
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      maxCost: 6,
    },
    bind: "prevent-attack-target",
    min: 0,
    max: 1,
    effect: {
      kind: "restrict",
      binding: "prevent-attack-target",
      restriction: "cannot-attack",
      expiresAfterTurns: 1,
    },
  },
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the target the deck's whole recursion package shares, printed on
 * Kumacy's, Dr. Hogback's and Perona's Triggers and on Gecko Moria's [On Play].
 */
export const thrillerBarkInTrash: CardSelector = {
  player: "self",
  zone: "trash",
  category: "character",
  type: "Thriller Bark Pirates",
  maxCost: 4,
  excludeSource: true,
};

export const playThrillerBarkFromTrashRested: MechanicProgram = {
  effect: {
    kind: "choose",
    selector: thrillerBarkInTrash,
    bind: "free-play",
    min: 0,
    max: 1,
    effect: { kind: "play", binding: "free-play", rested: true },
  },
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the gate the whole
 * OP17 Elbaph package shares, printed on seven Characters and two Events.
 *
 * Either field counts, because the text does not say "you have". Cost is
 * effective cost, which is the only reading that works: the giants the clause is
 * written about reach 12 through a static `+12 cost` layer.
 */
/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the Kurozumi pair's
 * gate. `player: "self"` because this text *does* say "you have", unlike the
 * Elbaph clause below.
 */
export const ownCostTenBody: MechanicCondition = {
  kind: "selector-count",
  player: "self",
  selector: { zone: "board", category: "character", minCost: 10 },
  operator: "gte",
  value: 1,
};

export const elbaphGiantOut: MechanicCondition = {
  kind: "selector-count",
  player: "either",
  selector: { zone: "board", category: "character", minCost: 12 },
  operator: "gte",
  value: 1,
};

export const rayleighRemoval: MechanicProgram = {
  effect: {
    kind: "if",
    condition: { kind: "leader-multicolored", player: "self" },
    then: {
      kind: "if",
      condition: {
        kind: "zone-count",
        player: "opponent",
        zone: "life",
        operator: "lte",
        value: 3,
      },
      then: {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxPower: 7000,
        },
        bind: "rayleigh-target",
        min: 0,
        max: 1,
        effect: { kind: "knock-out", binding: "rayleigh-target" },
      },
    },
  },
};

/**
 * Paying `DON!! −N` for an optional effect.
 *
 * The printed template is "DON!! −N: <effect>", which is a cost you may decline.
 * Gated on actually having the DON!! so that declining and being unable to pay
 * are not silently the same thing -- without the gate, a player at zero DON!!
 * would get the effect for free.
 */
/**
 * "Look at N cards from the top of your deck; reveal up to 1 <selector> and add
 * it to your hand. Then, place the rest at the bottom of your deck in any
 * order."
 *
 * The Rosinante deck runs three of these at 1 cost each and they differ only in
 * how deep they dig and what they are allowed to find, so the shape is written
 * once. The looked-at cards stay in the deck and are reached through the
 * binding, which is what makes "the rest" nameable after one of them leaves.
 */
export const lookAndAdd = (
  count: number,
  bind: string,
  match: Omit<CardSelector, "player" | "zone" | "binding">,
  /**
   * How many of the looked-at cards may be added. Defaults to the "up to 1"
   * every earlier caller prints; OP10's search package prints "up to 2" on five
   * cards, and the only difference is this number.
   */
  max = 1,
): MechanicProgram => ({
  effect: {
    kind: "sequence",
    effects: [
      { kind: "look-at", player: "self", count, bind },
      {
        kind: "choose",
        selector: { ...match, player: "self", zone: "deck", binding: bind },
        bind: `${bind}-add`,
        min: 0,
        max,
        effect: {
          kind: "move",
          binding: `${bind}-add`,
          to: { player: "self", zone: "hand" },
        },
      },
      {
        kind: "select",
        selector: { player: "self", zone: "deck", binding: bind },
        bind: `${bind}-rest`,
        count: "all",
        // "in any order" is the player's, not the order the look happened to
        // reveal them in. `order-to-bottom` asks for it a card at a time, and
        // skips asking while the cards left are all the same card.
        effect: {
          kind: "order-to-bottom",
          binding: `${bind}-rest`,
          to: { player: "self", zone: "deck", position: "bottom" },
        },
      },
    ],
  },
});

/**
 * The same "look N, reveal up to 1 match, add it to hand" shape as
 * `lookAndAdd`, but for the OP17 Elbaph pair (`080`, `089`) that trash the
 * leftovers instead of returning them to the bottom of the deck. A different
 * disposal for "the rest", not a different search, so it shares everything
 * but the final `move`'s destination.
 */
export const lookAndAddOrTrash = (
  count: number,
  bind: string,
  match: Omit<CardSelector, "player" | "zone" | "binding">,
): MechanicProgram => ({
  effect: {
    kind: "sequence",
    effects: [
      { kind: "look-at", player: "self", count, bind },
      {
        kind: "choose",
        selector: { ...match, player: "self", zone: "deck", binding: bind },
        bind: `${bind}-add`,
        min: 0,
        max: 1,
        effect: {
          kind: "move",
          binding: `${bind}-add`,
          to: { player: "self", zone: "hand" },
        },
      },
      {
        kind: "select",
        selector: { player: "self", zone: "deck", binding: bind },
        bind: `${bind}-rest`,
        count: "all",
        effect: {
          kind: "move",
          binding: `${bind}-rest`,
          to: { player: "self", zone: "trash" },
        },
      },
    ],
  },
});

export const donMinus = (
  count: number,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "field-don",
    player: "self",
    operator: "gte",
    value: count,
  },
  then: {
    kind: "optional",
    effect: {
      kind: "sequence",
      effects: [{ kind: "return-don", player: "self", count }, effect],
    },
  },
});

/**
 * "You may return 1 or more DON!! cards from your field to your DON!! deck:
 * <effect>" -- the template six OP-09 Characters print.
 *
 * The difference from {@link donMinus} is the whole point: that one is the
 * fixed "DON!! −N" and settles the count for the player, and this one leaves
 * the count to them. All six were written with `donMinus(1, ...)` until the
 * `return-don-choice` node existed, which returned exactly one DON!! -- legal,
 * and the one count that can never pay OP09-061's Leader, whose refund needs
 * "2 or more DON!! cards ... returned" and whose deck is built out of these
 * six cards.
 *
 * The gate is on `min` rather than on the count the player will pick: a player
 * who cannot afford the floor is never offered the clause at all, and one who
 * can is offered every count they can pay.
 */
export const donMinusOrMore = (
  min: number,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "field-don",
    player: "self",
    operator: "gte",
    value: min,
  },
  then: {
    kind: "optional",
    effect: { kind: "return-don-choice", player: "self", min, effect },
  },
});

/** OP15-061/066/067 Skypiea vassals: "[On Play] DON!! −1: Draw 1 card." */
export const skypieaDrawOnPlay: MechanicProgram = {
  effect: donMinus(1, { kind: "draw", player: "self", count: 1 }),
};

/**
 * "You may trash 1 card from your hand: <this> gains +N power during this
 * battle."
 *
 * Four OP17 cards print this template and differ only in the number and in
 * which battle card the buff may land on, so it is written once. The trash is a
 * `choose` over the whole hand rather than a fixed card: which card to spend is
 * the real decision, and a Counter in hand is worth more than a blank.
 */
export const trashForBattlePower = (
  amount: number,
  bind: string,
  target?: BattleTargetFilter,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: payFromHand({ player: "self", zone: "hand" }, bind, 1, {
      kind: "battle-power",
      player: "self",
      amount,
      ...(target ? { target } : {}),
    }),
  },
});

/**
 * "Draw N cards and trash M cards from your hand", the Blue/Green refill that
 * OP-09 and ST-25 both print. The trash is mandatory: `min` equals `max`.
 */
export const drawAndDiscard = (
  draw: number,
  discard: number,
  bind: string,
): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count: draw },
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind,
      min: discard,
      max: discard,
      effect: {
        kind: "move",
        binding: bind,
        to: { player: "self", zone: "trash" },
      },
    },
  ],
});

/**
 * "You may trash N cards matching <selector> from your hand: <effect>."
 *
 * The payoff is nested *inside* the cost's `choose` rather than sequenced after
 * it, and that placement is the whole point. A `choose` whose zone holds fewer
 * cards than its `min` is skipped and the queue continues, so writing the two as
 * a sequence hands the payoff over for free to a player who cannot pay -- which
 * is exactly what "you may pay: get" must never do. Nesting makes an unpayable
 * cost mean an unreachable payoff, the same shape `lifeToHandCost` has always
 * had.
 */
export const payFromHand = (
  selector: CardSelector,
  bind: string,
  count: number,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "choose",
  selector,
  bind,
  min: count,
  max: count,
  effect: {
    kind: "sequence",
    effects: [
      { kind: "move", binding: bind, to: { player: "self", zone: "trash" } },
      effect,
    ],
  },
});

/**
 * OP17-117 Maser Saber's consequence for its opponent declining (or being
 * unable to afford) the trash-3 cost: "[printed text omitted -- pnpm card:text OP17-117]" Shared between the
 * `choice` branch reached by an explicit decline and the `if`/`else` reached
 * when the opponent cannot pay at all -- see `triggerPrograms`, below.
 */
export const maserSaberKo: MechanicEffect = {
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost: 6,
  },
  bind: "op17-maser-saber-ko",
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: "op17-maser-saber-ko" },
};

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 *
 * OP11's Big Mom package prints this on six cards and OP13 prints it on two
 * more. The printed "choose a cost" is a decision between eleven known answers,
 * so that is exactly what it is written as: a `choice` of eleven branches, each
 * one revealing the card and then asking `deck-top-cost` about its own number.
 *
 * The reveal is inside every branch rather than before the choice on purpose --
 * the card must not be public *before* the guess is made, or there is no guess.
 * A cost above 10 exists in the pool only through cost buffs, which cannot reach
 * a card in a deck, so the printed range is 0-10.
 */
export const guessDeckTopCost = (
  effect: MechanicEffect,
  player: "opponent" | "self" = "opponent",
): MechanicEffect => ({
  kind: "choice",
  branches: Array.from({ length: 11 }, (_, cost) => ({
    id: `cost-${cost}`,
    label: `Guess a cost of ${cost}`,
    effect: {
      kind: "sequence" as const,
      effects: [
        { kind: "reveal-deck-top" as const, player },
        {
          kind: "if" as const,
          condition: { kind: "deck-top-cost" as const, player, value: cost },
          then: effect,
        },
      ],
    },
  })),
});

/**
 * "You may give N active DON!! cards to 1 of your [Silvers Rayleigh]:
 * <effect>." -- and the battle target its `[Counter]` half names.
 *
 * Both moved here from `op12-shared.ts` when EB-04 printed them a second time:
 * EB04-009 is a fourth 0-cost Event on the same Rayleigh chassis, and a
 * fragment two sets print is what this file is for. The reading each encodes is
 * unchanged -- see the doc comments below.
 */
/**
 * "You may give N active DON!! cards to 1 of your [Silvers Rayleigh]: <effect>."
 *
 * OP12-016, OP12-017 and OP12-019 -- the three 0-cost Events. The DON!! is not
 * spent but *given*, so it stays on the field as power on the card it is given
 * to: a 0-cost Event that pays two DON!! into a Character is closer to an
 * attach than to a cost, and the Leader's own restriction (no cards costing 5 or
 * more) is what makes a hand full of them viable.
 *
 * The payoff is nested inside the cost's `choose` so a board with no
 * [Silvers Rayleigh] cannot buy it, and the whole clause sits behind a gate on
 * N active DON!! and a [Silvers Rayleigh] on the field: `attach-don` moves as
 * many as there are, zero included, and the payoff after it in the sequence
 * would otherwise resolve for nothing. Outermost, so the Event is not offered
 * at all when the price cannot be met -- Bandai's OP12-016#1/#2, OP12-017#1/#2
 * and OP12-019#1/#2 rulings say it cannot be activated then.
 */
const rayleighOnField = {
  zone: "board",
  includeLeader: true,
  name: "Silvers Rayleigh",
} as const;

export const giveDonToRayleigh = (
  count: number,
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "all-of",
    conditions: [
      { kind: "active-don", player: "self", operator: "gte", value: count },
      {
        kind: "selector-count",
        player: "self",
        selector: rayleighOnField,
        operator: "gte",
        value: 1,
      },
    ],
  },
  then: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: { player: "self", ...rayleighOnField },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [
          {
            kind: "attach-don",
            player: "self",
            from: "active",
            count,
            target: { binding: bind },
          },
          effect,
        ],
      },
    },
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the battle target all
 * three 0-cost Events' `[Counter]` halves share.
 *
 * A disjunction rather than one filter: any Character qualifies, and the Leader
 * only if it is that one. Behind the OP12-001 Leader the second branch is always
 * true, which is the deck these cards are printed for -- but behind any other
 * Leader the Counter reaches only a Character, and the offer's own forecast says
 * so.
 */
export const rayleighOrCharacter = {
  anyOf: [{ isLeader: false }, { isLeader: true, name: "Silvers Rayleigh" }],
} as const;

/**
 * "…play up to 1 Character card with 6000 power or less and no base effect
 * from your <zone>" -- EB03-003 Uta, EB03-007 Baccarat, EB03-039 Ulti and
 * EB02-022 Usopp.
 *
 * The four differ only in the zone the body comes from, so the target is
 * written once. `noBaseEffect` reads the effect box rather than the card: a
 * vanilla body with a `[Trigger]` is a legal target, which is what makes this
 * a real choice in a deck that plays any.
 */
const vanillaBody = (zone: "hand" | "trash") =>
  ({
    player: "self",
    zone,
    category: "character",
    maxPower: 6_000,
    noBaseEffect: true,
  }) as const;

/** The free play those four clauses end on. */
export const playVanillaBody = (zone: "hand" | "trash", bind: string) =>
  ({
    kind: "choose",
    selector: vanillaBody(zone),
    bind,
    min: 0,
    max: 1,
    effect: { kind: "play", binding: bind },
  }) as const;

/**
 * "Look at up to 1 card from the top of <player>'s Life cards and place it at
 * the top or bottom of the Life cards" -- OP10-116 Damned Punk prints it as one side of a
 * [Main] Event, ST20-003 Charlotte Brulee as the whole of a [Trigger].
 *
 * The look is private to the player doing it, which is what `look-at` emits; the
 * placement is a `move` back into the same pile, so "top" is deliberately a
 * no-op and "bottom" is the whole point. `player: "owner"` on the destination
 * keeps an opponent's Life card in their own pile.
 */
export function peekLife(
  player: "self" | "opponent",
  bind: string,
): MechanicEffect {
  return {
    kind: "sequence",
    effects: [
      { kind: "look-at", player, count: 1, bind, zone: "life" },
      {
        kind: "choice",
        branches: [
          {
            id: "top",
            label: "Place it on top of the Life cards",
            effect: {
              kind: "move",
              binding: bind,
              to: { player: "owner", zone: "life", position: "top" },
            },
          },
          {
            id: "bottom",
            label: "Place it at the bottom of the Life cards",
            effect: {
              kind: "move",
              binding: bind,
              to: { player: "owner", zone: "life", position: "bottom" },
            },
          },
        ],
      },
    ],
  };
}

/**
 * "Reveal 1 card from the top of your deck and place it at the top or bottom
 * of your deck" -- the Blue peek, printed on
 * OP-08's Whitebeard package and again across ST-12.
 *
 * A `look-at` of 1 rather than `reveal-deck-top`, because both callers ask a
 * question *about* the card afterwards and then place it: the binding is what
 * makes it nameable at both steps. The reveal is its own node, so the card is
 * public before anything reads it.
 */
export const revealTopThen = (
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "look-at", player: "self", count: 1, bind },
    { kind: "reveal", binding: bind },
    effect,
    {
      kind: "select",
      selector: { player: "self", zone: "deck", binding: bind },
      bind: `${bind}-place`,
      count: "all",
      effect: {
        kind: "order-to-bottom",
        binding: `${bind}-place`,
        to: { player: "self", zone: "deck", position: "top" },
        alternate: { player: "self", zone: "deck", position: "bottom" },
      },
    },
  ],
});

/**
 * "Look at N cards from the top of your deck and place them back in any order"
 * -- the Blue look, printed at three cards on four identities across ST-12 and
 * ST-17 and differing only in whether the bottom of the deck is a legal
 * destination.
 *
 * `order-to-bottom` is the node for "in any order": it asks a card at a time,
 * and skips asking once the cards left are all the same card. With no
 * `alternate` every card goes back on top, which is a sort of the next N draws
 * rather than a dig past them.
 */
export const lookAndReplace = (
  count: number,
  bind: string,
  bottomAllowed: boolean,
): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "look-at", player: "self", count, bind },
    {
      kind: "select",
      selector: { player: "self", zone: "deck", binding: bind },
      bind: `${bind}-place`,
      count: "all",
      effect: {
        kind: "order-to-bottom",
        binding: `${bind}-place`,
        to: { player: "self", zone: "deck", position: "top" },
        ...(bottomAllowed
          ? {
              alternate: {
                player: "self" as const,
                zone: "deck" as const,
                position: "bottom" as const,
              },
            }
          : {}),
      },
    },
  ],
});

/**
 * "Rest up to 1 of your opponent's Characters with a cost of N or less" -- printed
 * across ST-11 and ST-12 at four different ceilings.
 *
 * `canRest` keeps a Character the opponent has protected from being offered,
 * and the ceiling is effective cost, which is what "a cost of N or less" means
 * about a card already on the field.
 */
export const restCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost,
    canRest: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

/**
 * "Choose one: rest a small body, or K.O. one that is already rested" -- the
 * printed pair ST11-003 also carries, here at a cost ceiling of 2.
 *
 * One printed "choose one", so it is a `choice` rather than two clauses: the
 * K.O. branch is strictly the better half when the board offers it, and the
 * rest branch is what sets it up a turn earlier.
 */
export const restOrKoCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choice",
  branches: [
    {
      id: "rest",
      label: `Rest a Character with a cost of ${maxCost} or less`,
      effect: restCostAtMost(maxCost, `${bind}-rest`),
    },
    {
      id: "ko",
      label: `K.O. a rested Character with a cost of ${maxCost} or less`,
      effect: {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxCost,
          rested: true,
        },
        bind: `${bind}-ko`,
        min: 0,
        max: 1,
        effect: { kind: "knock-out", binding: `${bind}-ko` },
      },
    },
  ],
});

/**
 * A `[Trigger]` that activates its card's `[On Play]`: the same program,
 * marked so that a negation of [On Play] effects reaches it too (see
 * `MechanicProgram.runsOnPlay`).
 */
export const asOnPlayTrigger = (program: MechanicProgram): MechanicProgram => ({
  ...program,
  runsOnPlay: true,
});
