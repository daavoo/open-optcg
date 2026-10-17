/**
 * The predicates continuous text reads -- "the controller's Leader has this
 * type", "this many DON!! are given across the field" -- shared by the
 * `*-static.ts` modules the way `shared.ts` is shared by the program modules.
 */
import {
  hasCardName,
  hasCardType,
  hasCardTypeIncluding,
} from "@one-piece-sim/cards";
import { storedBasePower } from "../base-power.js";
import { fieldDonCount } from "../don.js";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { BoardCard, GameState } from "../model.js";
import {
  type AbilityContext,
  baseEffectiveCost,
  costOf,
  leaderEffectsNegated,
  opponentOf,
  staticPower,
  trashEventCount,
} from "../static-abilities.js";

export function totalGivenDon(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  return (
    player.leaderAttachedDon.length +
    player.board.reduce(
      (total, card) => total + (card.attachedDon?.length ?? 0),
      0,
    )
  );
}

export const attachedDon = (context: AbilityContext): number =>
  context.isLeader
    ? context.state.players[context.playerId].leaderAttachedDon.length
    : ((context.card as BoardCard).attachedDon?.length ?? 0);

export const leaderHasType = (context: AbilityContext, type: string): boolean =>
  hasCardType(context.state.players[context.playerId].leaderCardNumber, type);

/**
 * The controller's Leader's current power, for a clause gated on it --
 * OP09-017 Wire. Base power (or a live override), plus this turn's modifiers
 * and the DON!! given to the Leader -- the same three parts `currentPower`
 * folds, written out here because `queries.ts` imports this module and reaching
 * back the other way would be a cycle. Static layers on a Leader's power are
 * deliberately not read: a keyword predicate that asked for them could recurse
 * through the very layer it is being evaluated for.
 */
export const currentLeaderPower = (context: AbilityContext): number => {
  const player = context.state.players[context.playerId];
  const override = storedBasePower(player.leaderBasePowers, context.state.turn);
  const base =
    override ?? context.db.require(player.leaderCardNumber).power ?? 0;
  const modifiers = player.leaderPowerModifiers
    .filter((modifier) => modifier.expiresAtTurn >= context.state.turn)
    .reduce((total, modifier) => total + modifier.amount, 0);
  return base + modifiers + player.leaderAttachedDon.length * 1000;
};

/**
 * The *opposing* Leader's current power, for a clause that copies it --
 * OP16-036 and OP16-055 Bon Kurei. Unlike `currentLeaderPower` above this does
 * fold the Leader's own static layers, because that is where the number the
 * clause names usually comes from: EB04-001 Jewelry Bonney is printed at 5000
 * and defends at 7000 under her own `[Opponent's Turn]` +2000, and a copy that
 * read printed power would answer 5000 at the exact moment the clause exists to
 * beat.
 *
 * Reading them is safe here where a keyword predicate could not: only a `self`
 * layer keyed to the Leader's own card number, and a `controller-aura` from the
 * cards beside it, are evaluated for a Leader, and every such layer in the table
 * reads its own side of the board. Nothing routes back to the attacking
 * Character whose power is being asked for.
 *
 * DON!! given to that Leader is counted only during its controller's turn, the
 * same rule `donPowerApplies` states in `queries.ts` -- a given DON!! grants
 * +1000 on its controller's turn alone, so it adds nothing to the Leader being
 * attacked.
 */
export const opposingLeaderPower = (context: AbilityContext): number =>
  leaderPowerWithLayers(context, opponentOf(context.playerId));

/**
 * The controller's own Leader's power with its static layers folded, as
 * {@link opposingLeaderPower} reads the other side's -- for a hand cost layer
 * gated on it (OP15-013 Pincers), which no power layer reads back.
 */
export const ownLeaderPower = (context: AbilityContext): number =>
  leaderPowerWithLayers(context, context.playerId);

function leaderPowerWithLayers(
  context: AbilityContext,
  leaderPlayerId: PlayerId,
): number {
  const leaderPlayer = context.state.players[leaderPlayerId];
  const override = storedBasePower(
    leaderPlayer.leaderBasePowers,
    context.state.turn,
  );
  const printed =
    override ?? context.db.require(leaderPlayer.leaderCardNumber).power ?? 0;
  const modifiers = leaderPlayer.leaderPowerModifiers
    .filter((modifier) => modifier.expiresAtTurn >= context.state.turn)
    .reduce((total, modifier) => total + modifier.amount, 0);
  const don =
    context.state.turnPlayerId === leaderPlayerId
      ? leaderPlayer.leaderAttachedDon.length * 1000
      : 0;
  return (
    staticPower(
      context.state,
      leaderPlayerId,
      {
        instanceId: `${leaderPlayerId}-leader`,
        cardNumber: leaderPlayer.leaderCardNumber,
      },
      true,
      printed,
      context.db,
      override !== undefined,
    ) +
    modifiers +
    don
  );
}

/**
 * "All of your [X] cards and this Character" -- the shape OP15-070 Fuza and
 * OP15-071 Holly print, where a board aura reaches a named group *and* the card
 * granting it, which is not a member of that group by name.
 */
export const isNamedOrSelf = (
  context: AbilityContext,
  name: string,
  self: string,
): boolean =>
  hasCardName(context.card.cardNumber, name) ||
  context.card.cardNumber === self;

export const always = (): boolean => true;

/**
 * Whether the asked-about player's Leader prints more than one colour.
 *
 * Two EB-03 Characters gate on it -- EB03-004 Carina's +4000 and EB03-044 Black
 * Maria's [Blocker] -- and it reads the Leader's printed colours rather than
 * the deck's, which is the same reading `leader-multicolored` uses in the
 * mechanic DSL.
 */
export const leaderMulticolored = (context: AbilityContext): boolean =>
  (
    context.db.require(context.state.players[context.playerId].leaderCardNumber)
      .colors ?? []
  ).length > 1;

export const turnPlayer = (context: AbilityContext): PlayerId =>
  context.state.turnPlayerId;

export const fieldDon = (context: AbilityContext): number =>
  fieldDonCount(context.state, context.playerId);

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP17's Elbaph clause.
 *
 * Either field counts: the printed text does not say "you have", and an
 * opposing giant switches these on exactly as your own does. Cost is read
 * through {@link costOf} because the giants get to 12 via a static `+12 cost`
 * over a much lower printed cost.
 */
/** The player's own rested Characters -- OP10's Green ODYSSEY package counts them. */
export const restedCharacters = (context: AbilityContext): number =>
  context.state.players[context.playerId].board.filter(
    (card) =>
      card.rested &&
      context.db.require(card.cardNumber).category === "character",
  ).length;

/**
 * "If you have N or more cards in your trash" -- the Five Elders' own gate,
 * printed at 7 for their removal immunity, at 10 for their power payoff and at 19
 * for their Stage.
 */
export const trashAtLeastCount = (
  context: AbilityContext,
  count: number,
): boolean => context.state.players[context.playerId].trash.length >= count;

/** "If you have N or less Life cards" -- Yellow's behind-only gate. */
export const lowLife = (context: AbilityContext, ceiling: number): boolean =>
  context.state.players[context.playerId].life.length <= ceiling;

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP12-087 Nico Robin, which
 * two different Black decks play behind two different Leaders.
 */
/**
 * "If you have 2 or more Characters with a base cost of 5 or more": OP12-042
 * Alvida's condition, reprinted across ST-25. Printed cost on both sides of
 * the question, so a `+1 cost` layer gated on it cannot lift a 4-cost body into
 * its own condition -- and reading another card's *effective* cost from a cost
 * layer would recurse (see `costOf`).
 */
export const twoBaseCostFiveCharacters = (context: AbilityContext): boolean =>
  context.state.players[context.playerId].board.filter(
    (card) => (context.db.require(card.cardNumber).cost ?? 0) >= 5,
  ).length >= 2;

export const robinLeader = (context: AbilityContext): boolean => {
  const leader = context.state.players[context.playerId].leaderCardNumber;
  return hasCardName(leader, "Koala") || hasCardName(leader, "Monkey.D.Luffy");
};

/**
 * [Shirahoshi] cards with a printed cost of 2 on the player's board.
 *
 * OP12-102's aura is live only while there is "[printed text omitted -- pnpm card:text OP12-102]" -- and "other" is relative to the card *granting* the aura, not to
 * the card being buffed. An `AbilityContext` names the buffed card, so the
 * question is asked as a total instead: exactly one such Shirahoshi on the board
 * is the source alone, and two means each sees the other and neither aura is
 * live. That is the only clause in the pool that penalises its own duplicate.
 */
export const shirahoshiCount = (context: AbilityContext): number =>
  context.state.players[context.playerId].board.filter(
    (card) =>
      hasCardName(card.cardNumber, "Shirahoshi") &&
      context.db.require(card.cardNumber).cost === 2,
  ).length;

export const anyCharacterWithCost = (
  context: AbilityContext,
  minimum: number,
): boolean =>
  (["p1", "p2"] as const).some((playerId) =>
    context.state.players[playerId].board.some(
      (card) => costOf(context.state, playerId, card, context.db) >= minimum,
    ),
  );

/**
 * "If you have a Character with a cost of N or more" -- ST-14's own gate,
 * printed at 6, 8 and 10 across the product.
 *
 * The controller's own board alone, which is what separates it from
 * {@link anyCharacterWithCost} above: that one reads "if there is", the
 * Elbaph wording, and answers an opposing giant too. Effective cost, so the
 * product's own cost buffs are what carry a board over the line.
 */
export const ownCharacterWithCost = (
  context: AbilityContext,
  minimum: number,
): boolean =>
  context.state.players[context.playerId].board.some(
    (card) =>
      costOf(context.state, context.playerId, card, context.db) >= minimum,
  );

/**
 * "If you have N or more rested cards" -- ST-16's and ST-24's gate.
 *
 * Everything the Refresh Phase rule enumerates: the Leader, the Characters, the
 * Stage and the cost area. A rested DON!! counts, which is the same reading
 * `rested-cards` takes in `mechanics.ts` and the reason the threshold is
 * reachable at all -- no board of Characters alone gets to six.
 */
export const restedCardCount = (context: AbilityContext): number => {
  const player = context.state.players[context.playerId];
  return (
    (player.leaderRested ? 1 : 0) +
    player.board.filter((card) => card.rested).length +
    (player.stage?.rested ? 1 : 0) +
    player.restedDon.length
  );
};

/** "If there is a Character with a cost of 0" -- OP14's Black package. */
export const anyCharacterAtZeroCost = (context: AbilityContext): boolean =>
  (["p1", "p2"] as const).some((playerId) =>
    context.state.players[playerId].board.some(
      (card) => costOf(context.state, playerId, card, context.db) <= 0,
    ),
  );

/**
 * "[printed text omitted -- pnpm card:text <card>]" --
 * OP14-045 Kuroobi and OP14-049 Jinbe. See `handTrashedByEffectOnTurn`.
 */
export const handTrashedThisTurn = (context: AbilityContext): boolean =>
  context.state.handTrashedByEffectOnTurn?.[context.playerId] ===
  context.state.turn;

/** "If you have [<name>] in your trash" -- OP08-006's pair of names. */
export const trashHasName = (context: AbilityContext, name: string): boolean =>
  context.state.players[context.playerId].trash.some((card) =>
    hasCardName(card.cardNumber, name),
  );

/**
 * OP08-114 S-Hawk's gate, shared by its two layers: a DON!! on the card and
 * fewer Life cards than the opponent.
 */
export const hawkArmed = (context: AbilityContext): boolean =>
  !context.isLeader &&
  attachedDon(context) >= 1 &&
  context.state.players[context.playerId].life.length <
    context.state.players[opponentOf(context.playerId)].life.length;

/** "If you have 7 or more cards in your trash" -- OP14-086's own gate. */
export const fullBaroqueTrash = (context: AbilityContext): boolean =>
  context.state.players[context.playerId].trash.length >= 7;

/** The Elbaph threshold, printed on every card in that package. */
export const ELBAPH_COST = 12;

/**
 * EB04-048 Rob Lucci's "for every 5 cards in your trash", as one number both
 * of its layers read.
 *
 * Integer division, and shared rather than written twice so the power and the
 * cost can never disagree about the same trash -- which is the failure a second
 * copy of `Math.floor(... / 5)` invites.
 */
export const lucciSteps = (context: AbilityContext): number =>
  hasCardTypeIncluding(
    context.state.players[context.playerId].leaderCardNumber,
    "CP",
  )
    ? Math.floor(context.state.players[context.playerId].trash.length / 5)
    : 0;

export const trashEventCountOf = (context: AbilityContext): number =>
  trashEventCount(context.state, context.playerId, context.db);

// --- negation ---------------------------------------------------------------

/** "If you have a [X]" -- a Character on the controller's own board. */
export function boardHasName(context: AbilityContext, name: string): boolean {
  return context.state.players[context.playerId].board.some((card) =>
    hasCardName(card.cardNumber, name),
  );
}

/**
 * "If you have [X] on your field" -- the board *and* the Stage area.
 *
 * Wider than `boardHasName` because the printed phrase is wider: a Stage is on
 * its controller's field and is in no zone the board walk reaches. EB02-033
 * Klabautermann is the card that needs it, and for that card the Stage area is
 * the only half that can match.
 */
export function fieldHasName(context: AbilityContext, name: string): boolean {
  const player = context.state.players[context.playerId];
  return (
    boardHasName(context, name) ||
    (player.stage !== null && hasCardName(player.stage.cardNumber, name))
  );
}

/** "If your opponent has N or more Characters." */
export function opponentCharacters(context: AbilityContext): number {
  return context.state.players[opponentOf(context.playerId)].board.filter(
    (card) => context.db.require(card.cardNumber).category === "character",
  ).length;
}

/**
 * OP05-084 / OP05-092: the aura's controller is the turn player and fields
 * nothing but {Celestial Dragons} Characters. Read from the debuffed side's
 * context, so the source board is the opponent's.
 */
export function celestialDragonsCourt(context: AbilityContext): boolean {
  if (context.isLeader) return false;
  if (context.db.require(context.card.cardNumber).category !== "character") {
    return false;
  }
  const sourceId = opponentOf(context.playerId);
  if (turnPlayer(context) !== sourceId) return false;
  const board = context.state.players[sourceId].board;
  return (
    board.length > 0 &&
    board.every((card) => hasCardType(card.cardNumber, "Celestial Dragons"))
  );
}

/** OP05-040 Birdcage's gate, with `stageOwner` the seat the Stage sits on. */
export function birdcageHolds(
  context: AbilityContext,
  stageOwner: PlayerId,
): boolean {
  if (context.isLeader) return false;
  if (context.db.require(context.card.cardNumber).category !== "character") {
    return false;
  }
  if (
    !hasCardName(
      context.state.players[stageOwner].leaderCardNumber,
      "Donquixote Doflamingo",
    )
  ) {
    return false;
  }
  return costOf(context.state, context.playerId, context.card, context.db) <= 5;
}

/**
 * Sabo's aura. Split out because it recurses into cost evaluation, which must
 * not itself consult the aura or the two would call each other forever.
 */
export function saboAura(context: AbilityContext): boolean {
  const player = context.state.players[context.playerId];
  return (
    player.leaderCardNumber === "OP13-004" &&
    // The aura is Sabo's text, not the Character's, so negating the Leader
    // turns it off everywhere it is read.
    !leaderEffectsNegated(context.state, context.playerId) &&
    player.leaderAttachedDon.length >= 1 &&
    player.board.some(
      (card) =>
        baseEffectiveCost(context.state, context.playerId, card, context.db) >=
        8,
    )
  );
}
