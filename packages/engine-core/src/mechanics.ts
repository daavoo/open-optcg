import { dealDamage, flipLife } from "./life.js";
import {
  boardCardNames,
  eligibleReplacements,
  replacementCoveredTargets,
  replacementCostEffect,
} from "./replacement-eligibility.js";
import {
  cards as defaultCardDatabase,
  hasCardName,
  hasCardType,
  type CardDatabase,
} from "@one-piece-sim/cards";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import {
  type BoardCard,
  type CardInstance,
  type GameState,
  retargetAttack,
} from "./model.js";
import {
  currentPower,
  donPowerApplies,
  effectiveCost,
  recordDeckTopKnowledge,
  searchRevealIsPublic,
} from "./queries.js";
import { knockOut } from "./removal.js";
import {
  charactersArriveRested,
  trashPlayGrantsRush,
  isRemovalImmune,
  negateEffects,
} from "./static-abilities.js";
import { activeDonOwner, fieldDonCount, returnDonToDeck } from "./don.js";
import { nextInt, shuffle } from "./rng.js";
import {
  type PlayerRef,
  type CardZone,
  type ZonePosition,
  type MechanicContext,
  battleParticipant,
  battleTargetMatches,
  type MechanicEffect,
  type MechanicProgram,
  type MechanicProgramInvocation,
  type MechanicExecution,
  type MechanicPendingChoice,
  type MechanicResult,
  type MechanicSignal,
} from "./mechanic-dsl.js";
import {
  givenDonOfBinding,
  printedCostOfBinding,
  stagePlay,
  eventPlay,
  selectCards,
  baseCardPower,
  addBasePowerSetter,
  setBaseCardPower,
  conditionMatches,
} from "./mechanic-conditions.js";
import {
  getMechanicChoiceOptions,
  takeForcedChoices,
} from "./mechanic-choices.js";
export {
  getMechanicChoiceOptions,
  resolveMechanicChoice,
} from "./mechanic-choices.js";
export {
  whenRestedCards,
  registerWhenRestedCards,
  effectSelectsNothing,
  programBuffsOwnPowerForTheTurn,
  programKeywordGrant,
  programRestedDonGift,
  programUsesBattlePower,
  programRedirectSelectors,
  programBattlePower,
} from "./program-analysis.js";
export {
  boardCardAttributes,
  selectCards,
  conditionMatches,
  bareGateCondition,
  programSelectsNothing,
} from "./mechanic-conditions.js";
export {
  registerReplacementPrograms,
  type EligibleReplacement,
  type RemovalCause,
  eligibleReplacements,
  replacementCostEffect,
} from "./replacement-eligibility.js";
export {
  type PlayerRef,
  leaderBattledCharacterKey,
  type MoveDestination,
  describeMoveDestination,
  type CardZone,
  type ZonePosition,
  OWN_CARDS_ZONES,
  restableCards,
  type MechanicContext,
  type CardSelector,
  type BattleTargetFilter,
  type BattleParticipant,
  battleParticipant,
  battleTargetMatches,
  type MechanicCondition,
  type MechanicEffect,
  type MechanicProgram,
  type MechanicProgramInvocation,
  type OnPlayHandlerInvocation,
  type MechanicInvocation,
  type MechanicPendingChoice,
  type MechanicResult,
  type MechanicSignal,
} from "./mechanic-dsl.js";

export const opponentOf = (playerId: PlayerId): PlayerId =>
  playerId === "p1" ? "p2" : "p1";

export function resolvePlayer(
  context: MechanicContext,
  ref: PlayerRef,
): PlayerId {
  return ref === "self"
    ? context.sourcePlayerId
    : opponentOf(context.sourcePlayerId);
}

export function zoneCards(
  state: GameState,
  playerId: PlayerId,
  zone: CardZone,
): CardInstance[] {
  // A Stage is a single optional field, not an array zone -- OP17-018/116's
  // "[printed text omitted -- pnpm card:text OP17-018]" is the first clause to select
  // over it, so it reads as a zone holding 0 or 1 cards rather than growing
  // its own selector shape.
  if (zone === "stage") {
    const stage = state.players[playerId].stage;
    return stage ? [stage] : [];
  }
  return state.players[playerId][zone];
}

/**
 * The prefix an `order-to-bottom` option carries its payload behind.
 *
 * That payload is a list of indices into the node's own cards rather than a
 * list of instance ids: the ids are private to the player holding the
 * decision, and an index list is short enough that a caller composing its own
 * order writes one by hand.
 */
const ORDER_OPTION_PREFIX = "order:";

/** The `order-to-bottom` option that places the node's cards in `order`. */
export function formatOrderOption(order: readonly number[]): string {
  return `${ORDER_OPTION_PREFIX}${order.join(",")}`;
}

/**
 * The placement order an option names, or `undefined` unless it is a
 * permutation of `count` indices.
 *
 * Every caller-composed order comes through here, so this is the only thing
 * standing between a hand-written action id and a deck the engine could never
 * have produced: a repeated index would place one card twice and lose another.
 */
/**
 * The same option with a split point: the first `atPrimary` cards of `order`
 * go to the node's own destination and the rest to its `alternate`.
 *
 * Written as one payload rather than as a second action because the two halves
 * are one decision -- EB03-023 Kaya's five cards are ordered *and* divided in
 * the same breath -- and because an option id is the only thing a caller can
 * compose by hand.
 */
export function formatSplitOrderOption(
  order: readonly number[],
  atPrimary: number,
): string {
  return `${formatOrderOption(order)}|${atPrimary}`;
}

/** The split point an option names, or `undefined` when it carries none. */
export function parseOrderSplit(
  optionId: string,
  count: number,
): number | undefined {
  const separator = optionId.lastIndexOf("|");
  if (separator === -1) return undefined;
  const payload = optionId.slice(separator + 1);
  if (!/^\d+$/.test(payload)) return undefined;
  const atPrimary = Number(payload);
  return atPrimary <= count ? atPrimary : undefined;
}

export function parseOrderOption(
  optionId: string,
  count: number,
): number[] | undefined {
  if (!optionId.startsWith(ORDER_OPTION_PREFIX)) return undefined;
  const separator = optionId.lastIndexOf("|");
  const body = separator === -1 ? optionId : optionId.slice(0, separator);
  const parts = body.slice(ORDER_OPTION_PREFIX.length).split(",");
  if (parts.length !== count) return undefined;
  // Digits only, rather than `Number` alone: `Number("")` is 0 and
  // `Number(" 1")` is 1, so a malformed list would otherwise coerce into a
  // valid-looking permutation instead of being rejected.
  if (!parts.every((part) => /^\d+$/.test(part))) return undefined;
  const order = parts.map((part) => Number(part));
  if (order.some((index) => index >= count)) return undefined;
  if (new Set(order).size !== count) return undefined;
  return order;
}

/**
 * The `blind-hand-pick` option for the card at `index` of the node's drawn
 * order. A position rather than an id, for the reason the order options above
 * carry indices: the id belongs to the hand's owner, not to the picker.
 */
const FACE_DOWN_OPTION_PREFIX = "face-down:";

export function faceDownOption(index: number): string {
  return `${FACE_DOWN_OPTION_PREFIX}${index}`;
}

/** The position a `face-down:` option names, if it is one of `count`. */
export function parseFaceDownOption(
  optionId: string,
  count: number,
): number | undefined {
  if (!optionId.startsWith(FACE_DOWN_OPTION_PREFIX)) return undefined;
  const payload = optionId.slice(FACE_DOWN_OPTION_PREFIX.length);
  if (!/^\d+$/.test(payload)) return undefined;
  const index = Number(payload);
  return index < count ? index : undefined;
}

/**
 * The card number behind an instance id, wherever it currently sits.
 *
 * `order-to-bottom` needs identities rather than instances -- it skips the
 * prompt while every unplaced card is the same card -- and its binding names
 * cards in a deck, which no selector is being evaluated against at that point.
 */
export function findInstanceCardNumber(
  state: GameState,
  instanceId: string,
): string | undefined {
  const zones: readonly CardZone[] = [
    "deck",
    "hand",
    "life",
    "board",
    "trash",
    "stage",
  ];
  for (const playerId of ["p1", "p2"] as const) {
    for (const zone of zones) {
      const found = zoneCards(state, playerId, zone).find(
        (card) => card.instanceId === instanceId,
      );
      if (found) return found.cardNumber;
    }
  }
  return undefined;
}

/**
 * The `[Main]` Event registry, injected at startup for the same reason the
 * replacement one is: the set modules import this file, so importing
 * `mechanics/index.ts` back would close a cycle through every set.
 */
let eventMainRegistry: ReadonlyMap<
  string,
  {
    cost: number;
    donMinus?: number;
    restDon?: number;
    program: MechanicProgram;
  }
> = new Map();

export function registerEventMainPrograms(
  registry: ReadonlyMap<
    string,
    {
      cost: number;
      donMinus?: number;
      restDon?: number;
      program: MechanicProgram;
    }
  >,
): void {
  eventMainRegistry = registry;
}

/**
 * Every zone a card can be taken out of, in search order.
 *
 * `stage` is last and is the one that is not an array on the state: it is a
 * single optional field, which is why `removeCard` cannot splice it and needs a
 * branch of its own. It belongs in the list all the same -- OP16-021 Moby Dick's
 * "[printed text omitted -- pnpm card:text OP16-021]" moves `SOURCE_BINDING` out of it,
 * and without the entry that move threw `MISSING_MECHANIC_CARD` rather than
 * trashing anything.
 */
export const REMOVABLE_ZONES = [
  "deck",
  "hand",
  "life",
  "board",
  "trash",
  "stage",
] as const;

/** Locates a card without removing it. Undefined when it is in no zone. */
export function findCardZone(
  state: GameState,
  instanceId: string,
): { playerId: PlayerId; zone: CardZone } | undefined {
  for (const playerId of ["p1", "p2"] as const) {
    for (const zone of REMOVABLE_ZONES) {
      if (
        zoneCards(state, playerId, zone).some(
          (card) => card.instanceId === instanceId,
        )
      ) {
        return { playerId, zone };
      }
    }
  }
  return undefined;
}

function removeCard(
  state: GameState,
  instanceId: string,
): { card: CardInstance; playerId: PlayerId; zone: CardZone } {
  for (const playerId of ["p1", "p2"] as const) {
    for (const zone of REMOVABLE_ZONES) {
      // `zoneCards` synthesises a fresh array for the Stage, so splicing it
      // would drop the card into the void and leave the Stage in play. Clear
      // the field instead.
      if (zone === "stage") {
        const stage = state.players[playerId].stage;
        if (!stage || stage.instanceId !== instanceId) continue;
        state.players[playerId].stage = null;
        return { card: stage, playerId, zone };
      }
      const cards = zoneCards(state, playerId, zone);
      const index = cards.findIndex((card) => card.instanceId === instanceId);
      if (index < 0) continue;
      const [card] = cards.splice(index, 1);
      if (!card) throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
      if (zone === "board") {
        state.players[playerId].restedDon.push(
          ...((card as BoardCard).attachedDon ?? []),
        );
      }
      return { card, playerId, zone };
    }
  }
  throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
}

function insertCard(
  state: GameState,
  playerId: PlayerId,
  zone: CardZone,
  card: CardInstance,
  position: ZonePosition,
): void {
  const cards = zoneCards(state, playerId, zone);
  if (position === "top") cards.unshift(card);
  else cards.push(card);
}

/**
 * How much of a moved card's identity the step may name, from where it lands.
 *
 * The destination decides it, not the origin: once a card is on the board or in
 * a trash it is public no matter where it came from, and once it is in a deck or
 * a face-down Life stack it is hidden no matter how public it just was. A hand
 * is the one in-between case -- its owner may read it, the opponent may not --
 * so that one is redacted per viewer rather than dropped.
 */
/** Which end of `deck` or `life` a card currently sits at, if it is in one. */
function orderedZonePositionOf(
  state: GameState,
  instanceId: string,
): "top" | "bottom" | undefined {
  for (const playerId of ["p1", "p2"] as const) {
    for (const zone of ["deck", "life"] as const) {
      const cards = zoneCards(state, playerId, zone);
      const index = cards.findIndex((card) => card.instanceId === instanceId);
      if (index >= 0) return index === 0 ? "top" : "bottom";
    }
  }
  return undefined;
}

/**
 * The `position` a move step reports, which end of *which* zone depending on
 * the move.
 *
 * A card landing in Life or a deck is described by where it lands ("on the
 * bottom of the deck"); a card leaving one is described by where it came from
 * ("the top Life card"). Reporting the destination end for a Life-to-hand move
 * is how the log came to claim EB03-053 Nami took the *bottom* Life card when
 * the effect names the top. Moves between unordered zones report nothing.
 */
function movePosition(
  from: CardZone,
  to: CardZone,
  toPosition: ZonePosition | undefined,
  originPosition: "top" | "bottom" | undefined,
): { position?: "top" | "bottom" } {
  if (to === "life" || to === "deck") {
    // `insertCard` treats everything that is not "top" as the bottom, and
    // "edge" is a selector-only position, so the step reports the same.
    return { position: toPosition === "top" ? "top" : "bottom" };
  }
  if ((from === "life" || from === "deck") && originPosition) {
    return { position: originPosition };
  }
  return {};
}

function visibilityOf(
  card: CardInstance,
  from: CardZone,
  zone: CardZone,
  destinationPlayerId: PlayerId,
  faceUp: boolean | undefined,
): {
  cardInstanceId: string | null;
  cardNumber: string | null;
  identityVisibleTo?: PlayerId;
} {
  const { instanceId: cardInstanceId, cardNumber } = card;
  // A card that was face-up in a public zone stays public knowledge when it
  // leaves for a hidden one: both players watched OP17-046 Gloriosa send a
  // named Character to the bottom of a deck, and redacting the step left the
  // log saying only that "a card" went there. Only a card that was already
  // hidden -- in a deck, a hand, or face-down Life -- is redacted on arrival.
  const wasHidden = from === "deck" || from === "hand" || from === "life";
  if (wasHidden && (zone === "deck" || (zone === "life" && faceUp !== true))) {
    return { cardInstanceId: null, cardNumber: null };
  }
  if (zone === "hand") {
    return {
      cardInstanceId,
      cardNumber,
      identityVisibleTo: destinationPlayerId,
    };
  }
  return { cardInstanceId, cardNumber };
}

export function flatten(effect: MechanicEffect, queue: MechanicEffect[]): void {
  if (effect.kind === "sequence") queue.unshift(...effect.effects);
  else queue.unshift(effect);
}

/**
 * Put one card onto its owner's Character area as a play.
 *
 * Shared by the `play` effect and by the five-Character replacement it can
 * suspend on, so both routes emit the same steps. A Trigger resolving "play this
 * card" names a card the engine is holding outside every zone while the Trigger
 * is pending, so there is nothing to remove: that case is played straight from
 * the program's source.
 */
/**
 * How a `play` node's play happened, for the `card-played` signal.
 *
 * The category of the card whose effect is doing the playing, which is what
 * "[printed text omitted -- pnpm card:text <card>]" (OP12-081 Koala's Leader) asks
 * about. A play out of hand raises its signal elsewhere and carries no source.
 */
function playSource(
  context: MechanicContext,
  db: CardDatabase,
): { bySourceCategory?: string } {
  const category = db.get(context.source.cardNumber)?.category;
  return category === undefined ? {} : { bySourceCategory: category };
}

export function playOntoBoard(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  rested: boolean,
  context: MechanicContext,
  db: CardDatabase = defaultCardDatabase,
): { events: PublicEvent[]; signals: MechanicSignal[] } {
  const player = state.players[playerId];
  const located = findCardZone(state, instanceId);
  if (!located && instanceId === context.source.instanceId) {
    player.board.push({
      instanceId: context.source.instanceId,
      cardNumber: context.source.cardNumber,
      rested,
      playedTurn: state.turn,
      attachedDon: [],
      powerModifiers: [],
    });
    return {
      events: [
        {
          type: "card-played",
          playerId,
          cardInstanceId: context.source.instanceId,
          cardNumber: context.source.cardNumber,
        },
      ],
      signals: [
        {
          kind: "card-played",
          card: context.source,
          playerId,
          ...playSource(context, db),
        },
      ],
    };
  }
  const { card, playerId: ownerId, zone: from } = removeCard(state, instanceId);
  if (ownerId !== playerId)
    throw new Error(`INVALID_PLAY_OWNER: ${instanceId}`);
  player.board.push({
    instanceId: card.instanceId,
    cardNumber: card.cardNumber,
    rested,
    playedTurn: state.turn,
    attachedDon: [],
    powerModifiers: [],
    ...(from === "trash" &&
    trashPlayGrantsRush(state, playerId, card.cardNumber, db)
      ? { rushUntilTurn: state.turn }
      : {}),
  });
  const movedCard = {
    instanceId: card.instanceId,
    cardNumber: card.cardNumber,
  };
  return {
    events: [
      // Where the card came from, which `card-played` alone does not say. A
      // Character recurred out of trash and one cast from hand were
      // indistinguishable in the log, to the opponent and to the analytics.
      // Hand is the default a play already implies, so only the other origins
      // are worth a step of their own.
      ...(from === "hand"
        ? []
        : [
            {
              type: "card-moved" as const,
              playerId,
              cardInstanceId: card.instanceId,
              cardNumber: card.cardNumber,
              from,
              to: "board" as const,
              sourceCardNumber: context.source.cardNumber,
            },
          ]),
      {
        type: "card-played",
        playerId,
        cardInstanceId: card.instanceId,
        cardNumber: card.cardNumber,
      },
    ],
    signals: [
      { kind: "card-moved", card: movedCard, ownerId, from, to: "board" },
      {
        kind: "card-played",
        card: movedCard,
        playerId,
        ...playSource(context, db),
      },
    ],
  };
}

export function continueExecution(
  state: GameState,
  execution: MechanicExecution,
  db: CardDatabase = defaultCardDatabase,
): MechanicResult {
  const events: PublicEvent[] = [];
  const signals: MechanicSignal[] = [];
  while (execution.queue.length > 0) {
    const effect = execution.queue.shift()!;
    if (effect.kind === "sequence") {
      execution.queue.unshift(...effect.effects);
      continue;
    }
    if (effect.kind === "if") {
      const selected = conditionMatches(
        state,
        execution.context,
        effect.condition,
        execution.bindings,
        db,
      )
        ? effect.then
        : effect.else;
      if (selected) flatten(selected, execution.queue);
      continue;
    }
    if (effect.kind === "optional") {
      const chooserPlayerId =
        effect.chooser === undefined || effect.chooser === "self"
          ? undefined
          : resolvePlayer(execution.context, effect.chooser);
      return {
        pending: {
          kind: "optional",
          execution,
          effect: effect.effect,
          ...(chooserPlayerId ? { chooserPlayerId } : {}),
        },
        events,
        signals,
      };
    }
    if (effect.kind === "choice") {
      const chooserPlayerId =
        effect.chooser === undefined || effect.chooser === "self"
          ? undefined
          : resolvePlayer(execution.context, effect.chooser);
      return {
        pending: {
          kind: "choice",
          execution,
          branches: effect.branches,
          ...(chooserPlayerId ? { chooserPlayerId } : {}),
        },
        events,
        signals,
      };
    }
    if (effect.kind === "select") {
      const eligible = selectCards(
        state,
        execution.context,
        effect.selector,
        execution.bindings,
        db,
      );
      execution.bindings[effect.bind] = (
        effect.count === "all" ? eligible : eligible.slice(0, effect.count)
      ).map((card) => card.instanceId);
      flatten(effect.effect, execution.queue);
      continue;
    }
    if (effect.kind === "look-at") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const pile = zoneCards(state, playerId, effect.zone ?? "deck");
      const looked =
        effect.count === "all" ? [...pile] : pile.slice(0, effect.count);
      execution.bindings[effect.bind] = looked.map((card) => card.instanceId);
      events.push(
        ...looked.map((card) => ({
          type: "card-revealed" as const,
          playerId,
          cardNumber: card.cardNumber,
          sourceCardNumber: execution.context.source.cardNumber,
          // A look, not a reveal: only the player looking learns the cards.
          visibleTo: execution.context.sourcePlayerId,
        })),
      );
      continue;
    }
    if (effect.kind === "deal-damage") {
      const targetPlayerId = resolvePlayer(execution.context, effect.player);
      events.push(...dealDamage(state, targetPlayerId));
      // A card leaving Life is what OP11-041 Nami's Leader reacts to, whether it
      // left to battle damage or to an effect.
      const damaged = state.pendingTrigger?.card;
      if (damaged) {
        signals.push({
          kind: "card-moved",
          card: damaged,
          ownerId: targetPlayerId,
          from: "life",
          to: "hand",
        });
      }
      continue;
    }
    if (effect.kind === "choose") {
      const eligible = selectCards(
        state,
        execution.context,
        effect.selector,
        execution.bindings,
        db,
      );
      if (eligible.length < effect.min) continue;
      if (
        eligible.length === 0 ||
        // An "up to" choice whose only outcome is a play the player cannot make
        // is the same as declining it, so it is not offered. The `play` node
        // below is what enforces the restriction; this only keeps a decision
        // that cannot change the game out of the trace, where "Choose Dorry"
        // followed by nothing reads exactly like the unbounded chain
        // OP17-085/092's restriction exists to stop.
        (effect.min === 0 &&
          effect.effect.kind === "play" &&
          (state.players[execution.context.sourcePlayerId]
            .cannotPlayCharactersUntilTurn ?? -1) >= state.turn &&
          // A cost floor on the ban leaves cheaper plays legal, so the choice
          // is still worth offering. See `cannotPlayCharactersMinCost`.
          eligible.every(
            (card) =>
              (db.require(card.cardNumber).cost ?? 0) >=
              (state.players[execution.context.sourcePlayerId]
                .cannotPlayCharactersMinCost ?? 0),
          ))
      ) {
        execution.bindings[effect.bind] = [];
        flatten(effect.effect, execution.queue);
        continue;
      }
      const chooserPlayerId =
        effect.chooser === undefined || effect.chooser === "self"
          ? undefined
          : resolvePlayer(execution.context, effect.chooser);
      const pending: MechanicPendingChoice = {
        kind: "cards",
        execution,
        selector: effect.selector,
        bind: effect.bind,
        min: effect.min,
        max: effect.max,
        selected: [],
        ...(chooserPlayerId ? { chooserPlayerId } : {}),
        ...(effect.maxTotalCost !== undefined
          ? { maxTotalCost: effect.maxTotalCost }
          : {}),
        ...(effect.maxTotalPower !== undefined
          ? { maxTotalPower: effect.maxTotalPower }
          : {}),
        ...(effect.distinctNames ? { distinctNames: true } : {}),
        ...(effect.exhaustive ? { exhaustive: true } : {}),
        effect: effect.effect,
      };
      takeForcedChoices(state, pending, db);
      // A cost budget can rule out every eligible card -- Loki's "total cost of
      // 4 or less" against a board of 5-cost Characters -- which leaves "choose
      // no more cards" as the only option. That is not a decision, so it is
      // resolved here instead of being asked.
      if (
        !getMechanicChoiceOptions(state, pending, db).some(
          (option) => option !== "done",
        )
      ) {
        // `takeForcedChoices` may already have made every pick an `exhaustive`
        // clause left the player no say in, so what resolves here is whatever
        // it took -- empty for the "no candidate fits" case this started as.
        execution.bindings[effect.bind] = [...pending.selected];
        flatten(effect.effect, execution.queue);
        continue;
      }
      return { pending, events, signals };
    }
    if (effect.kind === "draw") {
      // "[printed text omitted -- pnpm card:text <card>]"
      // (OP12-099 Kalgara). The turn's own draw is a rule rather than an
      // effect, so only this node is barred -- and only for the player whose
      // own effect it is, which is what "your own" says.
      if (
        resolvePlayer(execution.context, effect.player) ===
          execution.context.sourcePlayerId &&
        (state.players[execution.context.sourcePlayerId]
          .cannotDrawByEffectUntilTurn ?? -1) >= state.turn
      ) {
        continue;
      }
      const playerId = resolvePlayer(execution.context, effect.player);
      const player = state.players[playerId];
      const perCards = effect.perCards;
      const count =
        effect.count +
        (perCards
          ? (execution.bindings[perCards.binding] ?? []).length * perCards.each
          : 0);
      const drawn = player.deck.splice(0, count);
      player.hand.push(...drawn);
      if (drawn.length > 0) {
        events.push({
          type: "cards-drawn",
          playerId,
          count: drawn.length,
          sourceCardNumber: execution.context.source.cardNumber,
        });
        signals.push({ kind: "card-drawn", playerId, count: drawn.length });
      }
      continue;
    }
    if (effect.kind === "install-replacement") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const player = state.players[playerId];
      const expiresAtTurn = state.turn + effect.expiresAfterTurns;
      // Replaced rather than appended when the same card books it twice: the
      // printed clause is a permission for the window, and two permissions for
      // one window are one. Appending would also double the offer the defender
      // sees for a single K.O.
      //
      // No step of its own. Every other effect on this list is reported because
      // nothing else would show it, and this one is shown twice over already:
      // the Event's own `event-activated` says it was played, and the
      // protection itself arrives as a replacement offer the defender answers.
      player.installedReplacements = [
        ...(player.installedReplacements ?? []).filter(
          (entry) => entry.cardNumber !== effect.cardNumber,
        ),
        { cardNumber: effect.cardNumber, expiresAtTurn },
      ];
      continue;
    }
    if (effect.kind === "extra-turn") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const player = state.players[playerId];
      player.extraTurns = (player.extraTurns ?? 0) + 1;
      events.push({
        type: "extra-turn-granted",
        playerId,
        sourceCardNumber: execution.context.source.cardNumber,
      });
      continue;
    }
    if (effect.kind === "trash-top") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const player = state.players[playerId];
      const trashed = player.deck.splice(0, effect.count);
      player.trash.push(...trashed);
      for (const card of trashed) {
        // One signal per card, because a `card-moved` signal is what an
        // [On K.O.]-style watcher and the trash-count payoffs are written
        // against; a single "milled 5" event would be invisible to them.
        signals.push({
          kind: "card-moved",
          card: { instanceId: card.instanceId, cardNumber: card.cardNumber },
          ownerId: playerId,
          from: "deck",
          to: "trash",
        });
        events.push({
          type: "card-moved",
          playerId,
          // The trash is a public zone, so a milled card is public knowledge
          // the moment it lands -- unlike a look, which stays private.
          cardInstanceId: card.instanceId,
          cardNumber: card.cardNumber,
          from: "deck",
          to: "trash",
          position: "top",
          sourceCardNumber: execution.context.source.cardNumber,
        });
      }
      continue;
    }
    if (effect.kind === "attach-don") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const player = state.players[playerId];
      // A "given" source is not a pile of its own: the DON!! is spread over the
      // Leader's stack and every Character's, so it is gathered into a holding
      // array here and the rest of the node treats that array as the pile. The
      // target is excluded while gathering, because moving DON!! from a card to
      // itself changes nothing.
      const givenPool: string[] = [];
      if (effect.from === "given") {
        if (effect.target !== "leader" && effect.target.each) {
          throw new Error("ATTACH_DON_GIVEN_EACH_UNSUPPORTED");
        }
        const excluded =
          effect.target === "leader"
            ? `${playerId}-leader`
            : (execution.bindings[effect.target.binding]?.[0] ?? "");
        // Nothing is gathered for a target that is not on the field: the "put
        // it back" path below unshifts into `sourceZone`, which for this source
        // is a holding array nobody reads again, and DON!! that went into it
        // would leave the game.
        if (
          excluded !== `${playerId}-leader` &&
          !player.board.some((card) => card.instanceId === excluded)
        ) {
          continue;
        }
        let remaining = effect.count;
        const take = (pile: string[]) => {
          givenPool.push(...pile.splice(0, Math.min(remaining, pile.length)));
          remaining = effect.count - givenPool.length;
        };
        for (const card of player.board) {
          if (remaining <= 0) break;
          if (card.instanceId === excluded) continue;
          take(card.attachedDon ?? []);
        }
        if (remaining > 0 && excluded !== `${playerId}-leader`) {
          take(player.leaderAttachedDon);
        }
      }
      // The piles this node may draw from, in the order it drains them. Only
      // `"cost-area"` has two, and active comes first there; see the node's own
      // documentation for why that order is the one the card wants.
      const sourcePiles =
        effect.from === "given"
          ? [givenPool]
          : effect.from === "active"
            ? [player.activeDon]
            : effect.from === "rested"
              ? [player.restedDon]
              : [player.activeDon, player.restedDon];
      // Which pile each card came out of, so the two put-back paths below
      // restore it rather than making a rested DON!! active.
      const cameFrom = new Map<string, string[]>();
      const takeDon = (count: number): string[] => {
        const taken: string[] = [];
        for (const pile of sourcePiles) {
          if (taken.length >= count) break;
          const share = pile.splice(0, count - taken.length);
          for (const card of share) cameFrom.set(card, pile);
          taken.push(...share);
        }
        return taken;
      };
      const putDonBack = (cards: readonly string[]): void => {
        for (const card of [...cards].reverse()) {
          (cameFrom.get(card) ?? sourcePiles[0]!).unshift(card);
        }
      };
      const moved = takeDon(effect.count);
      if (effect.target === "leader") {
        player.leaderAttachedDon.push(...moved);
        events.push({
          type: "don-attached",
          playerId,
          targetInstanceId: `${playerId}-leader`,
          count: moved.length,
        });
      } else if (effect.target.each) {
        // `moved` was taken for one card; put it back and pay per target
        // instead, so a binding of four Characters is not handed one card's
        // worth of DON!! between them.
        putDonBack(moved);
        for (const instanceId of execution.bindings[effect.target.binding] ??
          []) {
          const target = player.board.find(
            (card) => card.instanceId === instanceId,
          );
          const pile =
            instanceId === `${playerId}-leader`
              ? player.leaderAttachedDon
              : target && (target.attachedDon ??= []);
          if (!pile) continue;
          const share = takeDon(effect.count);
          if (share.length === 0) break;
          pile.push(...share);
          events.push({
            type: "don-attached",
            playerId,
            targetInstanceId: instanceId,
            count: share.length,
          });
        }
      } else {
        const targetId = execution.bindings[effect.target.binding]?.[0];
        // A selector with `includeLeader` binds the Leader by its instance id,
        // and the Leader's DON!! is a pile of its own rather than a board
        // entry's -- "give 1 active DON!! card to 1 of your [Silvers
        // Rayleigh]" names the OP12-001 Leader as often as a Character.
        const target = player.board.find(
          (card) => card.instanceId === targetId,
        );
        const pile =
          targetId === `${playerId}-leader`
            ? player.leaderAttachedDon
            : target && (target.attachedDon ??= []);
        if (!pile) {
          putDonBack(moved);
          continue;
        }
        pile.push(...moved);
        events.push({
          type: "don-attached",
          playerId,
          targetInstanceId: targetId!,
          count: moved.length,
        });
      }
      continue;
    }
    if (effect.kind === "order-to-bottom") {
      const instanceIds = execution.bindings[effect.binding] ?? [];
      const placeAll = () => {
        execution.queue.unshift({
          kind: "move",
          binding: effect.binding,
          to: effect.to,
        });
      };
      // One card has no order to decide -- but it still has an *end* to decide
      // when there are two destinations, and that is the whole of EB02-053
      // Myskina Olga's clause: one Life card, left on top or put underneath.
      // So the same `alternate` guard the identity test below carries applies
      // here too; without it a single-card split was buried with no prompt, and
      // half the printed sentence went missing.
      if (instanceIds.length <= 1 && !effect.alternate) {
        placeAll();
        continue;
      }
      if (instanceIds.length === 0) {
        placeAll();
        continue;
      }
      const identities = new Set(
        instanceIds.map(
          (instanceId) => findInstanceCardNumber(state, instanceId) ?? "",
        ),
      );
      // One identity means every order produces the same deck, so there is
      // nothing to decide. See the node's own comment. A node with two
      // destinations is asked anyway: which end the cards go to is a decision
      // even when they are indistinguishable from each other.
      if (identities.size <= 1 && !effect.alternate) {
        placeAll();
        continue;
      }
      return {
        pending: {
          kind: "order-to-bottom",
          execution,
          binding: effect.binding,
          to: effect.to,
          ...(effect.alternate ? { alternate: effect.alternate } : {}),
          instanceIds: [...instanceIds],
        },
        events,
        signals,
      };
    }
    if (effect.kind === "rest-opponent-cards") {
      const targetPlayerId = resolvePlayer(execution.context, effect.player);
      const target = state.players[targetPlayerId];
      // The same eligibility `rest-opponent-card` applies for OP12-037: a body
      // already rested has nothing to give, and one held active by a
      // "cannot be rested" clause is not a legal target for one.
      const eligible = effect.match
        ? new Set(
            selectCards(
              state,
              execution.context,
              { ...effect.match, player: effect.player, zone: "board" },
              execution.bindings,
              db,
            ).map((card) => card.instanceId),
          )
        : undefined;
      const eligibleInstanceIds = (effect.donOnly === true ? [] : target.board)
        .filter(
          (card) =>
            !card.rested &&
            (card.cannotRestUntilTurn ?? -1) < state.turn &&
            (effect.maxCost === undefined ||
              effectiveCost(state, targetPlayerId, card, db) <=
                effect.maxCost) &&
            (eligible === undefined || eligible.has(card.instanceId)),
        )
        .map((card) => card.instanceId);
      // "Up to": nothing to rest in either pool is not a failure, it is the
      // clause doing nothing. Falling through keeps the printed "Then, ..."
      // running, which is the whole reason this node exists.
      if (eligibleInstanceIds.length === 0 && target.activeDon.length === 0) {
        continue;
      }
      return {
        pending: {
          kind: "rest-opponent-cards",
          execution,
          targetPlayerId,
          eligibleInstanceIds,
          remaining: effect.count,
        },
        events,
        signals,
      };
    }
    if (effect.kind === "give-rested-don") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const from = effect.from ?? "rested";
      // "From the cost area" is satisfied by either pile, so the gate asks
      // whether the area holds anything at all rather than whether one half
      // does.
      const available = (ownerId: PlayerId): number => {
        const owner = state.players[ownerId];
        return from === "cost-area"
          ? owner.activeDon.length + owner.restedDon.length
          : from === "active"
            ? owner.activeDon.length
            : owner.restedDon.length;
      };
      const typeMatches = (cardNumber: string): boolean =>
        (effect.type === undefined || hasCardType(cardNumber, effect.type)) &&
        (effect.name === undefined || hasCardName(cardNumber, effect.name)) &&
        (effect.anyOfTypes === undefined ||
          effect.anyOfTypes.some((type) => hasCardType(cardNumber, type)));
      // `player`'s cards first: it is the side each of these cards was written
      // for, so a pilot that takes the first offer keeps doing so.
      const owners: PlayerId[] = effect.eitherOwner
        ? [playerId, opponentOf(playerId)]
        : [playerId];
      const eligibleInstanceIds = owners
        .filter((ownerId) => available(ownerId) > 0)
        .flatMap((ownerId) => {
          const owner = state.players[ownerId];
          return [
            ...(typeMatches(owner.leaderCardNumber)
              ? [`${ownerId}-leader`]
              : []),
            ...owner.board
              .filter((card) => typeMatches(card.cardNumber))
              .map((card) => card.instanceId),
          ];
        });
      if (owners.every((ownerId) => available(ownerId) === 0)) continue;
      return {
        pending: {
          kind: "give-rested-don",
          execution,
          playerId,
          eligibleInstanceIds,
          count: effect.count,
          ...(effect.type === undefined ? {} : { type: effect.type }),
          ...(from === "rested" ? {} : { from }),
          ...(effect.eitherOwner ? { eitherOwner: true as const } : {}),
        },
        events,
        signals,
      };
    }
    if (effect.kind === "return-don") {
      signals.push({
        kind: "don-returned",
        playerId: resolvePlayer(execution.context, effect.player),
        count: effect.count,
      });
      returnDonToDeck(
        state,
        resolvePlayer(execution.context, effect.player),
        effect.count,
        execution.context.source,
        events,
        effect.from,
      );
      continue;
    }
    if (effect.kind === "return-don-choice") {
      const playerId = resolvePlayer(execution.context, effect.player);
      // Below the printed floor the clause simply does not happen. It cannot be
      // an error and it must not run the payoff for free: the `optional` above
      // has already been answered "apply", and this is where the payment turns
      // out to be unaffordable.
      if (fieldDonCount(state, playerId) < effect.min) continue;
      return {
        pending: {
          kind: "return-don-choice",
          execution,
          player: effect.player,
          min: effect.min,
          effect: effect.effect,
        },
        events,
        signals,
      };
    }
    if (effect.kind === "shuffle-deck") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const player = state.players[playerId];
      const shuffled = shuffle(player.deck, state.rngState);
      player.deck = shuffled.items;
      state.rngState = shuffled.state;
      delete player.knownOwnDeckTop;
      delete state.players[opponentOf(playerId)].knownOpponentDeckTop;
      continue;
    }
    if (effect.kind === "pick-from-hand") {
      const targetPlayerId = resolvePlayer(execution.context, effect.player);
      const hand = state.players[targetPlayerId].hand;
      if (hand.length <= 1 || effect.pick === "random") {
        let picked = hand.map((card) => card.instanceId);
        if (hand.length > 1) {
          const drawn = nextInt(state.rngState, hand.length);
          state.rngState = drawn.state;
          picked = [hand[drawn.value]!.instanceId];
        }
        execution.bindings[effect.bind] = picked;
        flatten(effect.effect, execution.queue);
        continue;
      }
      const shuffled = shuffle(
        hand.map((card) => card.instanceId),
        state.rngState,
      );
      state.rngState = shuffled.state;
      return {
        pending: {
          kind: "blind-hand-pick",
          execution,
          targetPlayerId,
          bind: effect.bind,
          instanceIds: shuffled.items,
          effect: effect.effect,
        },
        events,
        signals,
      };
    }
    if (effect.kind === "rest-don") {
      const player =
        state.players[resolvePlayer(execution.context, effect.player)];
      player.restedDon.push(...player.activeDon.splice(0, effect.count));
      continue;
    }
    if (effect.kind === "return-given-don") {
      const player =
        state.players[resolvePlayer(execution.context, effect.player)];
      // Characters first, then the Leader: the printed cost says "N total" and
      // leaves the pick to the player, and DON!! are interchangeable, so the
      // only thing this order decides is which card loses power. Taking from
      // the Characters first is the reading that keeps the Leader's attack
      // intact, which is what the card paying the cost is for.
      let remaining = effect.count;
      const take = (pile: string[]) => {
        const moved = pile.splice(0, Math.min(remaining, pile.length));
        player.restedDon.push(...moved);
        remaining -= moved.length;
      };
      for (const card of player.board) {
        if (remaining <= 0) break;
        take(card.attachedDon ?? []);
      }
      if (remaining > 0) take(player.leaderAttachedDon);
      continue;
    }
    if (effect.kind === "activate-don") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const player = state.players[playerId];
      // "[printed text omitted -- pnpm card:text <card>]" -- OP10-030 Smoker. The restriction is on the player, and
      // this node is the only way a Character effect sets DON!! active in the
      // declarative path, so the guard belongs here rather than at each caller.
      // A Leader's or an Event's activation is untouched, which is what the
      // clause names.
      const fromCharacter =
        db.get(execution.context.source.cardNumber)?.category === "character";
      if (
        fromCharacter &&
        (player.cannotActivateDonByCharacterUntilTurn ?? -1) >= state.turn
      ) {
        continue;
      }
      // "Up to": take what is there rather than failing on a short pool.
      const activated = player.restedDon.splice(0, effect.count);
      player.activeDon.push(...activated);
      // Reported because this node is the payoff of every declarative "set N
      // DON!! as active", and it moved the DON!! in silence: OP14-020 Dracule
      // Mihawk's Leader rested a card, locked the turn's plays and stood three
      // DON!! back up, and only the first two of those had a step anywhere.
      if (activated.length > 0) {
        events.push({
          type: "don-activated",
          playerId,
          count: activated.length,
          sourceCardNumber: execution.context.source.cardNumber,
        });
      }
      continue;
    }
    if (effect.kind === "add-don-at-end-of-turn") {
      const target =
        state.players[resolvePlayer(execution.context, effect.player)];
      target.addDonAtEndOfTurn = (target.addDonAtEndOfTurn ?? 0) + effect.count;
      continue;
    }
    if (effect.kind === "equalize-don-at-end-of-turn") {
      const target =
        state.players[resolvePlayer(execution.context, effect.player)];
      target.endOfTurnDonEqualize = [
        ...(target.endOfTurnDonEqualize ?? []),
        {
          turn: state.turn,
          sourceCardNumber: execution.context.source.cardNumber,
          sourceInstanceId: execution.context.source.instanceId,
        },
      ];
      continue;
    }
    if (effect.kind === "deck-top-to-life-at-end-of-turn") {
      const target =
        state.players[resolvePlayer(execution.context, effect.player)];
      target.endOfTurnLifeFromDeck = [
        ...(target.endOfTurnLifeFromDeck ?? []),
        { turn: state.turn, count: effect.count },
      ];
      continue;
    }
    if (effect.kind === "restrict-player") {
      const targetPlayerId = resolvePlayer(execution.context, effect.player);
      const target = state.players[targetPlayerId];
      const until = state.turn + effect.expiresAfterTurns;
      if (effect.restriction === "cannot-activate-don-by-character") {
        target.cannotActivateDonByCharacterUntilTurn = until;
      } else if (effect.restriction === "leader-cannot-attack-characters") {
        target.leaderCannotAttackCharactersUntilTurn = until;
        if (effect.maxBaseCost === undefined) {
          delete target.leaderCannotAttackCharactersMaxBaseCost;
        } else {
          target.leaderCannotAttackCharactersMaxBaseCost = effect.maxBaseCost;
        }
      } else if (effect.restriction === "cannot-attack-leaders") {
        target.cannotAttackLeadersUntilTurn = until;
      } else if (effect.restriction === "cannot-life-to-hand") {
        target.cannotLifeToHandUntilTurn = until;
      } else if (effect.restriction === "cannot-draw-by-effect") {
        target.cannotDrawByEffectUntilTurn = until;
      } else if (effect.restriction === "cannot-play-from-hand") {
        target.cannotPlayFromHandUntilTurn = until;
      } else if (effect.restriction === "on-play-negated") {
        target.onPlayNegatedUntilTurn = until;
      } else {
        target.cannotPlayCharactersUntilTurn = until;
        if (effect.minBaseCost !== undefined) {
          target.cannotPlayCharactersMinCost = effect.minBaseCost;
        } else {
          delete target.cannotPlayCharactersMinCost;
        }
      }
      // Announced, because a flag on a player is the one kind of effect
      // nothing on the board can show. `triggerProgramCanAct` also dry-runs a
      // Trigger and offers it only if it produced an event, so a `[Trigger]`
      // whose whole clause is a restriction was judged inert.
      events.push({
        type: "player-restricted",
        playerId: targetPlayerId,
        restriction: effect.restriction,
        untilTurn: until,
        ...(effect.minBaseCost === undefined
          ? {}
          : { minBaseCost: effect.minBaseCost }),
        ...(effect.maxBaseCost === undefined
          ? {}
          : { maxBaseCost: effect.maxBaseCost }),
        sourceCardNumber: execution.context.source.cardNumber,
      });
      continue;
    }
    if (effect.kind === "rest-don-at-next-main") {
      const target =
        state.players[resolvePlayer(execution.context, effect.player)];
      target.donRestedAtNextMain =
        (target.donRestedAtNextMain ?? 0) + effect.count;
      continue;
    }
    if (effect.kind === "hold-don-from-refresh") {
      const target =
        state.players[resolvePlayer(execution.context, effect.player)];
      // "Up to N": never more than there is rested to hold back, so the count
      // cannot promise a refresh penalty the DON!! pool will not deliver.
      target.donHeldFromRefresh = Math.min(
        effect.count,
        target.restedDon.length,
      );
      continue;
    }
    if (effect.kind === "discount-next-play") {
      state.players[
        resolvePlayer(execution.context, effect.player)
      ].playDiscount = {
        name: effect.name,
        minCost: effect.minCost,
        amount: effect.amount,
        turn: state.turn,
      };
      continue;
    }
    if (effect.kind === "add-don") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const player = state.players[playerId];
      const moved = player.donDeck.splice(0, effect.count);
      if (effect.rested) player.restedDon.push(...moved);
      else player.activeDon.push(...moved);
      // Only when DON!! actually moved: an empty DON!! deck makes this a
      // no-op, and `triggerProgramCanAct` reads the emitted events to decide
      // whether a Trigger is worth offering at all.
      if (moved.length > 0) {
        events.push({
          type: "don-added",
          playerId,
          count: moved.length,
          rested: effect.rested,
          sourceCardNumber: execution.context.source.cardNumber,
        });
      }
      continue;
    }
    if (effect.kind === "battle-power") {
      const attack = state.activeAttack;
      const playerId = resolvePlayer(execution.context, effect.player);
      const participant = battleParticipant(state, playerId);
      if (
        !attack ||
        !participant ||
        !battleTargetMatches(effect.target, participant)
      ) {
        // The printed text is "up to 1", so a battle whose card the buff cannot
        // reach resolves to nothing rather than failing. Anything that offered
        // the program is expected to have said so first -- see
        // `pendingDefenseBoost` in `engine.ts`.
        continue;
      }
      const amount =
        effect.perCard === undefined
          ? effect.amount
          : effect.amount * (execution.bindings[effect.perCard]?.length ?? 0);
      if (amount === 0) continue;
      if (playerId === attack.attackerPlayerId) {
        attack.battleAttackBonus += amount;
      } else {
        attack.counterPower += amount;
      }
      events.push({
        type: "power-changed",
        playerId,
        targetInstanceId: participant.instanceId,
        amount,
        expiresAtTurn: state.turn,
        sourceCardNumber: execution.context.source.cardNumber,
        sourceInstanceId: execution.context.source.instanceId,
      });
      continue;
    }
    if (effect.kind === "copy-power") {
      const sourceId = (execution.bindings[effect.from] ?? [])[0];
      if (sourceId === undefined) continue;
      // The copied-from card may be a Leader: EB04-052 Sanji's "[printed text omitted -- pnpm card:text EB04-052]" is the first clause in the pool to
      // read a power off one. A Leader sits in no zone, so the board scan below
      // cannot find it -- `{ zone: [], includeLeader: true }` binds it under
      // the `<player>-leader` pseudo-id `resolveSelector` mints, and
      // `currentPower` is the one reader that already understands that id.
      // `copy-power` takes current power, so this picks up the Leader's own
      // static layers and its modifiers -- pumping a Leader hands the number
      // straight to the Sanji pointed at it.
      const sourceLeaderPlayerId = (["p1", "p2"] as const).find(
        (candidate) => sourceId === `${candidate}-leader`,
      );
      const sourceOwner =
        sourceLeaderPlayerId ??
        (["p1", "p2"] as const).find((candidate) =>
          state.players[candidate].board.some(
            (card) => card.instanceId === sourceId,
          ),
        );
      if (!sourceOwner) continue;
      // `baseCardPower` answers for a Leader and a Character alike, and reads
      // an override an earlier "becomes" clause wrote -- which is the base
      // power, so a swap copies what the board says rather than the printed
      // figure.
      //
      // A given DON!! grants its +1000 during its owner's turn only (CR
      // 6-5-5-2) while the DON!! *card* lingers under the card until their next
      // Refresh (CR 6-2-3), so "current power" is not the same number on both
      // turns. Sanji attacking a Leader that still carries the two DON!! it was
      // given on its own last turn copies 5000, not 7000 -- `donPowerApplies`
      // is the same gate a battle prices a defender with, and reading
      // `currentPower`'s `includeAttachedDon: true` default here is what made
      // this clause copy a number nothing on the board would defend with.
      const copied = effect.base
        ? (baseCardPower(state, sourceId, db) ?? 0)
        : currentPower(
            state,
            sourceOwner,
            sourceId,
            donPowerApplies(state, sourceOwner),
            db,
          );
      for (const instanceId of execution.bindings[effect.to] ?? []) {
        const owner = (["p1", "p2"] as const).find((candidate) =>
          state.players[candidate].board.some(
            (card) => card.instanceId === instanceId,
          ),
        );
        if (!owner) continue;
        const target = state.players[owner].board.find(
          (card) => card.instanceId === instanceId,
        );
        if (!target) continue;
        addBasePowerSetter(
          state,
          instanceId,
          {
            value: copied,
            expiresAtTurn: state.turn + effect.expiresAfterTurns,
          },
          db,
        );
      }
      continue;
    }
    if (effect.kind === "set-base-power") {
      const expiresAtTurn = state.turn + effect.expiresAfterTurns;
      for (const instanceId of execution.bindings[effect.binding] ?? []) {
        // "up to 1 of your **Leader** or Character cards' base power becomes
        // 7000" -- OP16-106 Sanjuan.Wolf lets the chosen card be the Leader,
        // which `set-leader-base-power` cannot express: that one names a player,
        // and this one has to honour whichever card the choice bound. The same
        // setters either way, so rule 4-9-2-1 weighs it against the Leader's
        // other "becomes" clauses.
        const written = addBasePowerSetter(
          state,
          instanceId,
          { value: effect.value, expiresAtTurn },
          db,
        );
        if (!written) continue;
        // Said out loud, for the reason the Leader-side node says it: a
        // "becomes N" that writes only state leaves the board at a number no
        // event in the stream accounts for, and every reader of that stream --
        // the app's battle panel, an agent replaying its own turn -- is left to
        // infer it from a `battle-resolved` several revisions later.
        events.push({
          type: "base-power-set",
          playerId: written.owner,
          targetInstanceId: instanceId,
          basePower: effect.value,
          ...(written.outrankedBy === undefined
            ? {}
            : { outrankedBy: written.outrankedBy }),
          expiresAtTurn,
          sourceCardNumber: execution.context.source.cardNumber,
          sourceInstanceId: execution.context.source.instanceId,
        });
      }
      continue;
    }
    if (effect.kind === "activate-don-at-end-of-turn") {
      const playerId = resolvePlayer(execution.context, effect.player);
      state.endOfTurnDonActivation = [
        ...(state.endOfTurnDonActivation ?? []),
        { playerId, turn: state.turn, count: effect.count },
      ];
      continue;
    }
    if (effect.kind === "trash-life-down-to") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const excess = state.players[playerId].life.length - effect.size;
      if (excess <= 0) continue;
      flatten(
        {
          kind: "select",
          selector: {
            player: effect.player,
            zone: "life",
            position: "top",
            positionCount: excess,
          },
          bind: "trash-life-down-to",
          count: "all",
          effect: {
            kind: "move",
            binding: "trash-life-down-to",
            to: { player: effect.player, zone: "trash" },
          },
        },
        execution.queue,
      );
      continue;
    }
    if (effect.kind === "trash-hand-down-to") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const excess = state.players[playerId].hand.length - effect.size;
      if (excess <= 0) continue;
      flatten(
        {
          kind: "choose",
          selector: {
            player: effect.player,
            zone: "hand",
          },
          bind: "trash-hand-down-to",
          min: excess,
          max: excess,
          // Cards leaving a hand are chosen by that hand's owner: OP05-058 is
          // the first printing that trims the *opponent's* hand this way, and
          // without this the source player would be picking their discards.
          ...(effect.player === "opponent"
            ? { chooser: "opponent" as const }
            : {}),
          effect: {
            kind: "move",
            binding: "trash-hand-down-to",
            to: { player: effect.player, zone: "trash" },
          },
        },
        execution.queue,
      );
      continue;
    }
    if (effect.kind === "bind-battle-target") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const participant = battleParticipant(state, playerId);
      execution.bindings[effect.bind] = participant
        ? [participant.instanceId]
        : [];
      flatten(effect.effect, execution.queue);
      continue;
    }
    if (effect.kind === "swap-base-power") {
      const first = execution.bindings[effect.first]?.[0];
      const second =
        effect.second === undefined
          ? execution.bindings[effect.first]?.[1]
          : execution.bindings[effect.second]?.[0];
      // "Select 2 …" with only one eligible card selects nothing, and the
      // clause then has nothing to swap -- the same reading an "up to" gets.
      if (!first || !second || first === second) continue;
      const firstBase = baseCardPower(state, first, db);
      const secondBase = baseCardPower(state, second, db);
      if (firstBase === undefined || secondBase === undefined) continue;
      setBaseCardPower(state, first, secondBase, effect.scope, db);
      setBaseCardPower(state, second, firstBase, effect.scope, db);
      continue;
    }
    if (effect.kind === "reveal-deck-top") {
      const ownerId = resolvePlayer(execution.context, effect.player);
      const top = state.players[ownerId].deck[0];
      if (top) {
        // Public, unlike `look-at`: both players learn the card, and both learn
        // it *is* the top card -- which is what a guess needs to be a fair bet.
        recordDeckTopKnowledge(
          state,
          execution.context.sourcePlayerId,
          ownerId,
        );
        recordDeckTopKnowledge(state, ownerId, ownerId);
        events.push({
          type: "card-revealed",
          playerId: ownerId,
          cardNumber: top.cardNumber,
          sourceCardNumber: execution.context.source.cardNumber,
        });
      }
      continue;
    }
    if (effect.kind === "disable-blockers") {
      // No battle means nothing to switch off. The clause only fires from a
      // `[When Attacking]` window, so this is the "the attack has already
      // ended" case rather than a card played in the Main Phase.
      if (state.activeAttack) state.activeAttack.blockersDisabled = true;
      continue;
    }
    if (effect.kind === "set-leader-base-power") {
      const playerId = resolvePlayer(execution.context, effect.player);
      const expiresAtTurn = state.turn + effect.expiresAfterTurns;
      const written = addBasePowerSetter(
        state,
        `${playerId}-leader`,
        { value: effect.value, expiresAtTurn },
        db,
      );
      events.push({
        type: "base-power-set",
        playerId,
        targetInstanceId: `${playerId}-leader`,
        basePower: effect.value,
        ...(written?.outrankedBy === undefined
          ? {}
          : { outrankedBy: written.outrankedBy }),
        expiresAtTurn,
        sourceCardNumber: execution.context.source.cardNumber,
        sourceInstanceId: execution.context.source.instanceId,
      });
      continue;
    }
    const instanceIds = execution.bindings[effect.binding] ?? [];
    if (effect.kind === "reveal") {
      for (const instanceId of instanceIds) {
        // Any zone, not just hand: OP15-065 Goro reveals the top card of its own
        // deck, and the card stays where it is either way -- a reveal moves
        // nothing, it only makes an identity public.
        const located = findCardZone(state, instanceId);
        if (!located) continue;
        const owner = located.playerId;
        const card = zoneCards(state, owner, located.zone).find(
          (candidate) => candidate.instanceId === instanceId,
        );
        if (!card) continue;
        events.push({
          type: "card-revealed",
          playerId: owner,
          cardNumber: card.cardNumber,
          sourceCardNumber: execution.context.source.cardNumber,
        });
      }
      continue;
    }
    if (effect.kind === "play") {
      const playerId = resolvePlayer(
        execution.context,
        effect.player ?? "self",
      );
      const player = state.players[playerId];
      // "[printed text omitted -- pnpm card:text <card>]" (OP13-028)
      // binds an effect-driven play out of hand as well as the main-phase
      // action, the same way the Character ban below does.
      if (
        (player.cannotPlayFromHandUntilTurn ?? -1) >= state.turn &&
        instanceIds.every(
          (instanceId) => findCardZone(state, instanceId)?.zone === "hand",
        )
      ) {
        continue;
      }
      // "[printed text omitted -- pnpm card:text <card>]" (OP17-085
      // Dorry, OP17-092 Brogy) binds every play, not only the main-phase action
      // `legal-actions/main.ts` gates -- an effect-driven play is still a play.
      // Without this, the two giants play each other without bound: Dorry's
      // [On Play] plays Brogy, Brogy's plays a Dorry, and with a full Character
      // area the copy trashed to make room is a legal target again, so the pool
      // never drains. A `play` node always lands on the board, which is the
      // Character area, so there is no Stage half to exempt the way the
      // main-phase gate has to.
      if (
        (player.cannotPlayCharactersUntilTurn ?? -1) >= state.turn &&
        instanceIds.every((instanceId) => {
          const located = findCardZone(state, instanceId);
          const card = located
            ? zoneCards(state, located.playerId, located.zone).find(
                (candidate) => candidate.instanceId === instanceId,
              )
            : undefined;
          const cost = card ? (db.require(card.cardNumber).cost ?? 0) : 0;
          return cost >= (player.cannotPlayCharactersMinCost ?? 0);
        })
      ) {
        continue;
      }
      for (const instanceId of instanceIds) {
        // An Event is activated, never played, so a `play` that lands on one
        // leaves it where it is. OP07-097 Vegapunk's selector admits any
        // {Egghead} card -- the deck runs two {Egghead} Events -- and its
        // "play it" branch put the Event on the board as a Character; the
        // other branch, face-up on Life, is the one an Event can take.
        if (eventPlay(state, instanceId, db)) continue;
        // A Stage is played into the Stage area, not the Character area: it is
        // subject to neither the five-Character limit nor the Character ban
        // above. OP12-080 Baratie's "[Trigger] Play this card" is the only
        // clause in the pool that plays one, and before this it landed on the
        // board as if it were a Character.
        if (stagePlay(state, instanceId, execution.context, db)) {
          const previous = player.stage;
          if (previous) {
            player.trash.push({
              instanceId: previous.instanceId,
              cardNumber: previous.cardNumber,
            });
          }
          // A Trigger's card is in no zone, so there is nothing to remove: its
          // identity comes off the source the same way `stagePlay` read it.
          const located = findCardZone(state, instanceId);
          const card = located
            ? removeCard(state, instanceId).card
            : {
                instanceId: execution.context.source.instanceId,
                cardNumber: execution.context.source.cardNumber,
              };
          player.stage = {
            instanceId: card.instanceId,
            cardNumber: card.cardNumber,
            rested: effect.rested ?? false,
          };
          events.push({
            type: "card-moved",
            playerId,
            cardInstanceId: card.instanceId,
            cardNumber: card.cardNumber,
            from: "hand",
            to: "stage",
          });
          continue;
        }
        if (player.board.length >= 5) {
          const located = findCardZone(state, instanceId);
          // A Trigger's own card is held outside every zone while its program
          // runs, so suspending on it would leave the card unaccounted for by
          // the zone invariants. That corner keeps the old behaviour; every
          // other play -- the trash recursion this matters for -- suspends on
          // the replacement choice instead of being silently dropped.
          if (!located) break;
          return {
            pending: {
              kind: "area-replacement",
              execution,
              playerId,
              card: {
                instanceId,
                cardNumber: zoneCards(
                  state,
                  located.playerId,
                  located.zone,
                ).find((card) => card.instanceId === instanceId)!.cardNumber,
              },
              rested: effect.rested ?? false,
            },
            events,
            signals,
          };
        }
        const placed = playOntoBoard(
          state,
          playerId,
          instanceId,
          // "Your Character cards are played rested" reaches an effect-driven
          // play too; `placeCharacter` applies the same rule on the other path.
          (effect.rested ?? false) ||
            charactersArriveRested(state, playerId, db),
          execution.context,
        );
        events.push(...placed.events);
        signals.push(...placed.signals);
      }
      continue;
    }
    if (effect.kind === "move") {
      const destination = effect.to.player;
      // "You cannot add Life cards to your hand using your own effects during
      // this turn" -- the OP06-020 Hody Jones Leader's own price, which reaches
      // every clause that would move one, not just the ones printed alongside
      // it. Gated here for the same reason `cannot-draw-by-effect` is gated in
      // the `draw` node: this is the one place a declarative clause does it.
      //
      // Only the restricted player's *own* effect, and only their own Life:
      // an opponent's clause that hands them a Life card is not "using your own
      // effects", which is what the printed sentence says.
      if (effect.to.zone === "hand") {
        const moverId = execution.context.sourcePlayerId;
        const barred =
          (state.players[moverId].cannotLifeToHandUntilTurn ?? -1) >=
          state.turn;
        if (
          barred &&
          instanceIds.some((instanceId) =>
            state.players[moverId].life.some(
              (card) => card.instanceId === instanceId,
            ),
          )
        ) {
          continue;
        }
      }
      for (const [index, instanceId] of instanceIds.entries()) {
        // "…and add this card to your hand" -- OP07-102 Jinbe and OP07-103
        // Tony Tony.Chopper, whose `[Trigger]`s put themselves in the hand
        // instead of the trash.
        //
        // A Trigger's own card is held outside every zone while its program
        // runs (see `resolveBattle`), so `removeCard` below has nothing to
        // find and would throw. The `play` node already carries the same
        // fallback for the same reason: the identity comes off the execution's
        // source, and `applyResolveTrigger` skips its usual trip to the trash
        // once the card has landed somewhere.
        if (
          instanceId === execution.context.source.instanceId &&
          findCardZone(state, instanceId) === undefined
        ) {
          const playerId =
            destination === "owner" || destination === "self"
              ? execution.context.sourcePlayerId
              : resolvePlayer(execution.context, destination);
          const card: CardInstance = {
            instanceId,
            cardNumber: execution.context.source.cardNumber,
            ...(effect.faceUp === undefined ? {} : { faceUp: effect.faceUp }),
          };
          insertCard(
            state,
            playerId,
            effect.to.zone,
            card,
            effect.to.position ?? "bottom",
          );
          events.push({
            type: "card-moved",
            playerId,
            cardInstanceId: instanceId,
            cardNumber: card.cardNumber,
            from: "life",
            to: effect.to.zone,
          });
          continue;
        }
        // "If <a Character> would be removed from the field by your opponent's
        // effect, you may <pay> instead." Ten cards across OP10-OP13 print that
        // wider reading, and a `move` off the board is exactly what it covers
        // that a K.O. does not: a bounce to hand, a bury to the deck, a card
        // pushed into Life. The prompt is built the same way the `knock-out`
        // node's is, and for the same reason -- every such removal in the
        // declarative path goes through this node.
        //
        // Only a Character leaving its *owner's* board to somebody else's effect
        // qualifies: a player moving their own card is not a removal the clause
        // answers, and a card in hand or deck is not on the field at all.
        if (!effect.skipReplacements) {
          const boardOwner = (["p1", "p2"] as const).find((candidate) =>
            state.players[candidate].board.some(
              (card) => card.instanceId === instanceId,
            ),
          );
          const threatened = boardOwner
            ? state.players[boardOwner].board.find(
                (card) => card.instanceId === instanceId,
              )
            : undefined;
          // A continuous "cannot be removed from the field" immunity, read the
          // same way the `knock-out` node reads its own -- and for the same
          // reason: a move that cannot land is skipped rather than suppressed
          // later, so no replacement is offered for it either.
          //
          // The `knock-out` node has always asked; this one never did, so every
          // "cannot be removed from the field" clause in the pool answered a
          // K.O. and let a bounce or a bury through. P-104 Shanks is the card
          // that surfaced it.
          if (
            boardOwner &&
            threatened &&
            isRemovalImmune(
              state,
              boardOwner,
              threatened,
              execution.context.sourcePlayerId,
              execution.context.source.cardNumber,
              db,
              "off-field",
              execution.context.source.instanceId,
            )
          ) {
            continue;
          }
          const eligible =
            boardOwner && threatened
              ? eligibleReplacements(
                  state,
                  execution.context.sourcePlayerId,
                  boardOwner,
                  threatened,
                  db,
                  "effect",
                  "off-field",
                )
              : [];
          if (boardOwner && threatened && eligible.length > 0) {
            // The rest of this node's targets ride on each branch, the same
            // shape `knock-out` uses: one accepted replacement saves every
            // other target it protects.
            const remaining = instanceIds.slice(index + 1);
            const thenRest = (
              effectNow: MechanicEffect,
              restBind: string,
              rest: readonly string[],
            ): MechanicEffect => {
              if (rest.length === 0) return effectNow;
              execution.bindings[restBind] = [...rest];
              return {
                kind: "sequence",
                effects: [effectNow, { ...effect, binding: restBind }],
              };
            };
            const targetName = db.require(threatened.cardNumber).name;
            const moveBind = `${effect.binding}-move-${instanceId}`;
            execution.bindings[moveBind] = [instanceId];
            return {
              pending: {
                kind: "choice",
                execution,
                chooserPlayerId: boardOwner,
                branches: [
                  {
                    id: `remove:${instanceId}`,
                    label: `Remove ${targetName} from the field`,
                    effect: thenRest(
                      {
                        ...effect,
                        binding: moveBind,
                        skipReplacements: true,
                      },
                      `${effect.binding}-after-replacement`,
                      remaining,
                    ),
                  },
                  ...eligible.map(({ protector, entry }) => {
                    const bind = `${effect.binding}-replace-${protector.instanceId}`;
                    execution.bindings[bind] = [protector.instanceId];
                    execution.bindings[`${bind}-threatened`] = [instanceId];
                    const covered = replacementCoveredTargets(
                      state,
                      execution.context.sourcePlayerId,
                      boardOwner,
                      { protector, entry },
                      remaining,
                      db,
                      "off-field",
                    );
                    return {
                      id: `replace:${protector.instanceId}`,
                      label: `${entry.label} instead of removing ${boardCardNames(state, boardOwner, [instanceId, ...covered], db)}`,
                      effect: thenRest(
                        replacementCostEffect(
                          { protector, entry },
                          boardOwner === execution.context.sourcePlayerId,
                          bind,
                        ),
                        `${bind}-after-replacement`,
                        remaining.filter((rest) => !covered.includes(rest)),
                      ),
                    };
                  }),
                ],
              },
              events,
              signals,
            };
          }
        }
        // Which end of an ordered zone the card sat at, read before the removal
        // that would otherwise lose it.
        const originPosition = orderedZonePositionOf(state, instanceId);
        const {
          card,
          playerId: ownerId,
          zone: from,
        } = removeCard(state, instanceId);
        // Per card, not per node: an `"either"` selector can hand this binding
        // one card from each side, and "the owner's hand" is a different hand
        // for each of them.
        const playerId =
          destination === "owner"
            ? ownerId
            : resolvePlayer(execution.context, destination);
        const moved = {
          instanceId: card.instanceId,
          cardNumber: card.cardNumber,
          // Face-down is the absence of the flag, the same representation
          // `addToLife` documents: writing `faceUp: false` would make a card put
          // into Life by an effect hash differently from one dealt at setup.
          ...(effect.faceUp === true ? { faceUp: true } : {}),
          ...(effect.to.zone === "board"
            ? {
                rested: effect.rested ?? false,
                playedTurn: state.turn,
                attachedDon: [],
                powerModifiers: [],
              }
            : {}),
        };
        insertCard(
          state,
          playerId,
          effect.to.zone,
          moved,
          effect.to.position ?? "bottom",
        );
        // "[printed text omitted -- pnpm card:text <card>]" -- OP14-045,
        // OP14-049 and OP14-056. Every hand trash in the declarative path is
        // this node, whether it is the owner's own cost or an opponent's
        // discard, and the printed clause draws no distinction between them.
        if (from === "hand" && effect.to.zone === "trash") {
          state.handTrashedByEffectOnTurn = {
            ...state.handTrashedByEffectOnTurn,
            [ownerId]: state.turn,
          };
        }
        signals.push({
          kind: "card-moved",
          card: { instanceId: card.instanceId, cardNumber: card.cardNumber },
          ownerId,
          from,
          to: effect.to.zone,
          sourceCardNumber: execution.context.source.cardNumber,
          sourcePlayerId: execution.context.sourcePlayerId,
        });
        events.push({
          type: "card-moved",
          playerId,
          ...visibilityOf(card, from, effect.to.zone, playerId, effect.faceUp),
          from,
          to: effect.to.zone,
          ...movePosition(
            from,
            effect.to.zone,
            effect.to.position,
            originPosition,
          ),
          ...(effect.faceUp === undefined ? {} : { faceUp: effect.faceUp }),
          sourceCardNumber: execution.context.source.cardNumber,
        });
        // A search that prints "reveal up to 1 X and add it to your hand"
        // (Sugar OP10-065, Law OP09-069, Rosinante OP12-108) makes the added
        // card public knowledge, and `look-at` only ever emitted the private
        // look steps. The move to hand is the reveal: emit the public event
        // here so the opponent learns which card joined the hand. A "look at
        // ... add" with no reveal stays private -- `visibilityOf` redacts the
        // `card-moved` identity and no public event is added.
        if (
          from === "deck" &&
          effect.to.zone === "hand" &&
          searchRevealIsPublic(execution.context.source.cardNumber, db)
        ) {
          events.push({
            type: "card-revealed" as const,
            playerId,
            cardNumber: card.cardNumber,
            sourceCardNumber: execution.context.source.cardNumber,
          });
        }
      }
      continue;
    }
    if (effect.kind === "restrict") {
      for (const instanceId of instanceIds) {
        // A Leader has no `BoardCard` to write the flag onto, so its own hold
        // lives on the player -- the same split `rest` and `update` already
        // make for `leaderRested`. Only `cannot-refresh` names a Leader in the
        // pool: OP07-059 Foxy's Leader selects "your opponent's rested Leader
        // and up to 1 Character card", and a Leader that comes back active
        // anyway is the whole of what that clause buys.
        const leaderPlayerId = (["p1", "p2"] as const).find(
          (candidate) => instanceId === `${candidate}-leader`,
        );
        if (leaderPlayerId) {
          if (
            effect.restriction !== "cannot-refresh" &&
            effect.restriction !== "cannot-attack"
          ) {
            throw new Error(`LEADER_RESTRICTION_UNSUPPORTED: ${instanceId}`);
          }
          const expiresAtTurn = state.turn + effect.expiresAfterTurns;
          // OP06-023 Arlong names "your opponent's rested Leader" and stops it
          // attacking, which is the second Leader-scoped restriction in the
          // pool and needs its own field for the same reason the first did.
          if (effect.restriction === "cannot-attack") {
            state.players[leaderPlayerId].leaderCannotAttackUntilTurn =
              expiresAtTurn;
            events.push({
              type: "attack-prevented",
              playerId: leaderPlayerId,
              targetInstanceId: instanceId,
              targetCardNumber: state.players[leaderPlayerId].leaderCardNumber,
              expiresAtTurn,
              sourceCardNumber: execution.context.source.cardNumber,
            });
            continue;
          }
          state.players[leaderPlayerId].leaderCannotRefreshUntilTurn =
            expiresAtTurn;
          events.push({
            type: "refresh-prevented",
            playerId: leaderPlayerId,
            targetInstanceId: instanceId,
            targetCardNumber: state.players[leaderPlayerId].leaderCardNumber,
            expiresAtTurn,
            sourceCardNumber: execution.context.source.cardNumber,
          });
          continue;
        }
        const ownerId = (["p1", "p2"] as const).find((candidate) =>
          state.players[candidate].board.some(
            (card) => card.instanceId === instanceId,
          ),
        );
        const target = ownerId
          ? state.players[ownerId].board.find(
              (card) => card.instanceId === instanceId,
            )
          : undefined;
        if (!ownerId || !target) {
          throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
        }
        const expiresAtTurn = state.turn + effect.expiresAfterTurns;
        // Each restriction is invisible on the board -- the Character keeps its
        // printed text, its power and, for `cannot-refresh`, the ordinary look
        // of a Character rested this turn. The step is the only record of it.
        if (effect.restriction === "cannot-attack") {
          target.cannotAttackUntilTurn = expiresAtTurn;
          target.cannotAttackSourceCardNumber =
            execution.context.source.cardNumber;
          events.push({
            type: "attack-prevented",
            playerId: ownerId,
            targetInstanceId: instanceId,
            targetCardNumber: target.cardNumber,
            expiresAtTurn,
            sourceCardNumber: execution.context.source.cardNumber,
          });
        } else if (effect.restriction === "cannot-rest") {
          target.cannotRestUntilTurn = expiresAtTurn;
          target.cannotRestSourceCardNumber =
            execution.context.source.cardNumber;
          events.push({
            type: "rest-prevented",
            playerId: ownerId,
            targetInstanceId: instanceId,
            targetCardNumber: target.cardNumber,
            expiresAtTurn,
            sourceCardNumber: execution.context.source.cardNumber,
          });
        } else if (effect.restriction === "attack-taxed") {
          target.attackTaxUntilTurn = expiresAtTurn;
          target.attackTaxHandCards = effect.handTrashCost ?? 1;
          target.attackTaxSourceCardNumber =
            execution.context.source.cardNumber;
          events.push({
            type: "attack-prevented",
            playerId: ownerId,
            targetInstanceId: instanceId,
            targetCardNumber: target.cardNumber,
            expiresAtTurn,
            sourceCardNumber: execution.context.source.cardNumber,
          });
        } else if (effect.restriction === "cannot-block") {
          target.blockerDisabledUntilTurn = expiresAtTurn;
        } else if (effect.restriction === "battle-ko-immune") {
          // No event either: nothing has been prevented until a battle is
          // actually lost, and `resolveBattle` reads it back off the card then.
          target.battleKoImmuneUntilTurn = expiresAtTurn;
        } else if (effect.restriction === "ko-immune") {
          // No event: nothing has been prevented yet, and the protection is
          // read back off the card when a K.O. is attempted.
          target.koImmuneToOpponentEffectsUntilTurn = expiresAtTurn;
        } else if (effect.restriction === "effect-ko-immune") {
          // No event, for the reason `ko-immune` above gives.
          target.koImmuneToEffectsUntilTurn = expiresAtTurn;
        } else {
          target.cannotRefreshUntilTurn = expiresAtTurn;
          events.push({
            type: "refresh-prevented",
            playerId: ownerId,
            targetInstanceId: instanceId,
            targetCardNumber: target.cardNumber,
            expiresAtTurn,
            sourceCardNumber: execution.context.source.cardNumber,
          });
        }
      }
      continue;
    }
    if (effect.kind === "rest") {
      for (const instanceId of instanceIds) {
        // A DON!! chosen as one of "your cards" (`includeActiveDon`): it rests
        // where it lies, in the cost area, and -- like every DON!! movement
        // -- raises no event of its own.
        const donOwner = activeDonOwner(state, instanceId);
        if (donOwner) {
          const player = state.players[donOwner];
          player.activeDon = player.activeDon.filter((id) => id !== instanceId);
          player.restedDon.push(instanceId);
          continue;
        }
        // A Leader has no BoardCard, so "[printed text omitted -- pnpm card:text <card>]" (OP17-033) needs its own branch -- the same
        // shape granted keywords already use to find a Leader instance id.
        const leaderPlayerId = (["p1", "p2"] as const).find(
          (playerId) => instanceId === `${playerId}-leader`,
        );
        if (leaderPlayerId) {
          state.players[leaderPlayerId].leaderRested = true;
          continue;
        }
        // The Stage is searched alongside the boards because a Stage can be the
        // thing that rests: OP17-057 Fullalead pays for its own ability by
        // resting itself, and its instance is in `stage`, not in `board`.
        const ownerId = (["p1", "p2"] as const).find(
          (candidate) =>
            state.players[candidate].board.some(
              (card) => card.instanceId === instanceId,
            ) || state.players[candidate].stage?.instanceId === instanceId,
        );
        const target = ownerId
          ? (state.players[ownerId].board.find(
              (card) => card.instanceId === instanceId,
            ) ??
            (state.players[ownerId].stage?.instanceId === instanceId
              ? state.players[ownerId].stage
              : undefined))
          : undefined;
        if (!ownerId || !target) {
          throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
        }
        target.rested = true;
        // `character-rested` is what OP10-036 Perona's DON!! refund watches for,
        // and a Stage is not a Character: reporting one as rested would pay that
        // out for a card that never was on the board. The Stage's own rested
        // flag is in the observation either way.
        if (state.players[ownerId].stage?.instanceId !== instanceId) {
          events.push({
            type: "character-rested",
            playerId: ownerId,
            cardInstanceId: target.instanceId,
            cardNumber: target.cardNumber,
            sourceCardNumber: execution.context.source.cardNumber,
          });
          signals.push({
            kind: "card-rested",
            card: {
              instanceId: target.instanceId,
              cardNumber: target.cardNumber,
            },
            ownerId,
            sourcePlayerId: execution.context.sourcePlayerId,
            sourceIsCharacter:
              db.get(execution.context.source.cardNumber)?.category ===
              "character",
          });
        }
      }
      continue;
    }
    if (effect.kind === "grant-attack-active") {
      const expiresAtTurn = state.turn + effect.expiresAfterTurns;
      for (const instanceId of instanceIds) {
        const leaderPlayerId = (["p1", "p2"] as const).find(
          (playerId) => instanceId === `${playerId}-leader`,
        );
        if (leaderPlayerId) {
          state.players[leaderPlayerId].leaderAttacksActiveUntilTurn =
            expiresAtTurn;
          events.push({
            type: "attack-active-granted",
            playerId: leaderPlayerId,
            targetInstanceId: instanceId,
            targetCardNumber: state.players[leaderPlayerId].leaderCardNumber,
            expiresAtTurn,
            sourceCardNumber: execution.context.source.cardNumber,
          });
          continue;
        }
        const target = [
          ...state.players.p1.board,
          ...state.players.p2.board,
        ].find((card) => card.instanceId === instanceId);
        if (!target) throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
        target.attacksActiveUntilTurn = expiresAtTurn;
        events.push({
          type: "attack-active-granted",
          playerId: state.players.p1.board.includes(target) ? "p1" : "p2",
          targetInstanceId: target.instanceId,
          targetCardNumber: target.cardNumber,
          expiresAtTurn,
          sourceCardNumber: execution.context.source.cardNumber,
        });
      }
      continue;
    }
    if (effect.kind === "at-end-of-turn") {
      const playerId = execution.context.sourcePlayerId;
      const player = state.players[playerId];
      player.endOfTurnCardActions = [
        ...(player.endOfTurnCardActions ?? []),
        ...instanceIds.map((instanceId) => ({
          kind: effect.action,
          instanceId,
          turn: state.turn,
        })),
      ];
      continue;
    }
    if (effect.kind === "grant-keyword") {
      for (const instanceId of instanceIds) {
        // A Leader has no BoardCard to write the flag on, so it keeps its
        // granted keywords on the player -- see `leaderUnblockableUntilTurn`.
        // Three are reachable: [Unblockable] (OP17-115), [Double Attack]
        // (OP15-056, OP16-003) and [Banish] (ST28-002). [Blocker] and [Rush]
        // are Character-only in the printed pool, and one reaching here would
        // be silently dropped, so it throws instead.
        const leaderPlayerId = (["p1", "p2"] as const).find(
          (playerId) => instanceId === `${playerId}-leader`,
        );
        if (leaderPlayerId) {
          const expiresAtTurn = state.turn + effect.expiresAfterTurns;
          if (effect.keyword === "Unblockable") {
            state.players[leaderPlayerId].leaderUnblockableUntilTurn =
              expiresAtTurn;
          } else if (effect.keyword === "Double Attack") {
            state.players[leaderPlayerId].leaderDoubleAttackUntilTurn =
              expiresAtTurn;
          } else if (effect.keyword === "Banish") {
            state.players[leaderPlayerId].leaderBanishUntilTurn = expiresAtTurn;
          } else {
            throw new Error(`LEADER_KEYWORD_UNSUPPORTED: ${effect.keyword}`);
          }
          events.push({
            type: "keyword-granted",
            playerId: leaderPlayerId,
            targetInstanceId: instanceId,
            targetCardNumber: state.players[leaderPlayerId].leaderCardNumber,
            keyword: effect.keyword,
            expiresAtTurn,
            sourceCardNumber: execution.context.source.cardNumber,
          });
          continue;
        }
        const target = [
          ...state.players.p1.board,
          ...state.players.p2.board,
        ].find((card) => card.instanceId === instanceId);
        // The card can have left the field between this program's own steps:
        // OP17-110 Perospero's `[On Play]` plays a Character and then grants
        // itself [Rush], and when the play lands on a full board the
        // replacement choice it suspends on may name Perospero as the body to
        // give up. A keyword granted to a card no longer on the field does
        // nothing -- there is no card for it to be on -- so the step is
        // skipped rather than failing the action, which is what made every
        // pilot that answered the choice by anything but the first offer
        // crash the match.
        if (!target) continue;
        const expiresAtTurn = state.turn + effect.expiresAfterTurns;
        if (effect.keyword === "Unblockable") {
          target.unblockableUntilTurn = expiresAtTurn;
        } else if (effect.keyword === "Rush") {
          target.rushUntilTurn = expiresAtTurn;
        } else if (effect.keyword === "Double Attack") {
          target.doubleAttackUntilTurn = expiresAtTurn;
        } else if (effect.keyword === "Rush: Character") {
          target.rushCharacterUntilTurn = expiresAtTurn;
        } else if (effect.keyword === "Banish") {
          target.banishUntilTurn = expiresAtTurn;
        } else {
          target.blockerUntilTurn = expiresAtTurn;
        }
        const targetOwnerId = state.players.p1.board.includes(target)
          ? "p1"
          : "p2";
        events.push({
          type: "keyword-granted",
          playerId: targetOwnerId,
          targetInstanceId: target.instanceId,
          targetCardNumber: target.cardNumber,
          keyword: effect.keyword,
          expiresAtTurn,
          sourceCardNumber: execution.context.source.cardNumber,
        });
      }
      continue;
    }
    if (effect.kind === "activate-event") {
      const eventId = instanceIds[0];
      if (eventId === undefined) continue;
      const playerId = execution.context.sourcePlayerId;
      const player = state.players[playerId];
      // Hand first, then trash: the two zones a printed clause reaches for an
      // Event in, and an instance is only ever in one of them.
      const zone = (["hand", "trash"] as const).find((candidate) =>
        player[candidate].some((card) => card.instanceId === eventId),
      );
      if (!zone) continue;
      const index = player[zone].findIndex(
        (card) => card.instanceId === eventId,
      );
      const [eventCard] = player[zone].splice(index, 1);
      if (!eventCard) continue;
      const entry = eventMainRegistry.get(eventCard.cardNumber);
      player.trash.push(eventCard);
      events.push({
        type: "event-activated",
        playerId,
        cardNumber: eventCard.cardNumber,
        ...(effect.mainOnly === true ? { mainOnly: true as const } : {}),
      });
      if (!entry) continue;
      // The Event's own printed costs still apply; only its cost line is waived.
      if (entry.donMinus) {
        returnDonToDeck(state, playerId, entry.donMinus, eventCard, events);
      }
      if (entry.restDon) {
        player.restedDon.push(...player.activeDon.splice(0, entry.restDon));
      }
      const nested = executeMechanicProgram(
        state,
        { sourcePlayerId: playerId, source: eventCard },
        entry.program,
        db,
      );
      events.push(...nested.events);
      signals.push(...nested.signals);
      if (nested.pending) return { pending: nested.pending, events, signals };
      continue;
    }
    if (effect.kind === "remember-target") {
      const remembered = instanceIds[0];
      const owner = state.players[execution.context.sourcePlayerId].board.find(
        (card) => card.instanceId === execution.context.source.instanceId,
      );
      if (owner && remembered !== undefined) {
        owner.rememberedTarget = { instanceId: remembered, turn: state.turn };
      }
      continue;
    }
    if (effect.kind === "redirect-attack") {
      const attack = state.activeAttack;
      const target = instanceIds[0];
      // Re-naming the card already under attack changes nothing, so it reports
      // nothing: `excludeAttackTarget` keeps it off the menu, and this is the
      // floor under that. A redirect is not a block -- nothing rests and the
      // new target may be a Leader -- so it carries its own event.
      if (
        attack &&
        target !== undefined &&
        target !== attack.targetInstanceId
      ) {
        retargetAttack(attack, target);
        events.push({
          type: "attack-redirected",
          playerId: attack.defenderPlayerId,
          targetInstanceId: target,
          sourceCardNumber: execution.context.source.cardNumber,
        });
      }
      continue;
    }
    if (effect.kind === "grant-attribute") {
      const expiresAtTurn = state.turn + effect.expiresAfterTurns;
      for (const instanceId of instanceIds) {
        const target = [
          ...state.players.p1.board,
          ...state.players.p2.board,
        ].find((card) => card.instanceId === instanceId);
        if (!target) continue;
        const live =
          (target.grantedAttributes?.expiresAtTurn ?? -1) >= state.turn
            ? (target.grantedAttributes?.attributes ?? [])
            : [];
        target.grantedAttributes = {
          attributes: [...new Set([...live, effect.attribute])],
          expiresAtTurn,
        };
      }
      continue;
    }
    if (effect.kind === "negate") {
      for (const instanceId of instanceIds) {
        // A Leader is a legal target: OP09-093 Marshall.D.Teach negates "[printed text omitted -- pnpm card:text OP09-093]". It sits in no zone, so it is found by its
        // synthetic instance id and its card number read off the player rather
        // than off a `CardInstance`. `leaderEffectsNegated` is what reads the
        // result back.
        const leaderPlayerId = (["p1", "p2"] as const).find(
          (candidate) => instanceId === `${candidate}-leader`,
        );
        const ownerId =
          leaderPlayerId ??
          (["p1", "p2"] as const).find((candidate) =>
            state.players[candidate].board.some(
              (card) => card.instanceId === instanceId,
            ),
          );
        const target = leaderPlayerId
          ? {
              instanceId,
              cardNumber: state.players[leaderPlayerId].leaderCardNumber,
            }
          : ownerId
            ? state.players[ownerId].board.find(
                (card) => card.instanceId === instanceId,
              )
            : undefined;
        if (!ownerId || !target) {
          throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
        }
        const expiresAtTurn = state.turn + effect.expiresAfterTurns;
        negateEffects(state, instanceId, expiresAtTurn);
        events.push({
          type: "effect-negated",
          playerId: ownerId,
          targetInstanceId: instanceId,
          targetCardNumber: target.cardNumber,
          expiresAtTurn,
          sourceCardNumber: execution.context.source.cardNumber,
        });
      }
      continue;
    }
    if (effect.kind === "modify-power") {
      const multiplier =
        effect.perGivenDonOf === undefined
          ? 1
          : givenDonOfBinding(state, execution, effect.perGivenDonOf);
      const steps =
        effect.perCards === undefined
          ? 1
          : Math.floor(
              (execution.bindings[effect.perCards.binding]?.length ?? 0) /
                effect.perCards.each,
            );
      const costOf =
        effect.perCostOf === undefined
          ? 1
          : printedCostOfBinding(state, execution, effect.perCostOf, db);
      const amount = effect.amount * multiplier * steps * costOf;
      if (amount === 0) continue;
      const expiresAtTurn = state.turn + effect.expiresAfterTurns;
      const sourceCardNumber = execution.context.source.cardNumber;
      const sourceInstanceId = execution.context.source.instanceId;
      for (const instanceId of instanceIds) {
        const modifier = {
          amount,
          expiresAtTurn,
          sourceCardNumber,
          sourceInstanceId,
        };
        const leaderPlayerId = (["p1", "p2"] as const).find(
          (playerId) => instanceId === `${playerId}-leader`,
        );
        let owner: PlayerId;
        if (leaderPlayerId) {
          state.players[leaderPlayerId].leaderPowerModifiers.push(modifier);
          owner = leaderPlayerId;
        } else {
          const onP1 = state.players.p1.board.find(
            (card) => card.instanceId === instanceId,
          );
          const target =
            onP1 ??
            state.players.p2.board.find(
              (card) => card.instanceId === instanceId,
            );
          if (!target) throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
          target.powerModifiers ??= [];
          target.powerModifiers.push(modifier);
          owner = onP1 ? "p1" : "p2";
        }
        // The step the legacy imperative resolvers have always reported and
        // this path never did: the modifier was written and nothing was said,
        // so a buff or a debuff that decided a battle was missing from the
        // trace, from the match history and from what an agent is told
        // happened -- and an automatic clause whose whole payload is a power
        // change never raised `ability-triggered` either, since that marker is
        // gated on the clause producing an event.
        events.push({
          type: "power-changed",
          playerId: owner,
          targetInstanceId: instanceId,
          amount,
          expiresAtTurn,
          sourceCardNumber,
          sourceInstanceId,
        });
      }
      continue;
    }
    if (effect.kind === "modify-cost") {
      for (const instanceId of instanceIds) {
        const target = [
          ...state.players.p1.board,
          ...state.players.p2.board,
        ].find((card) => card.instanceId === instanceId);
        if (!target) throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
        target.costModifiers ??= [];
        target.costModifiers.push({
          amount: effect.amount,
          expiresAtTurn: state.turn + effect.expiresAfterTurns,
        });
      }
      continue;
    }
    if (effect.kind === "update") {
      for (const instanceId of instanceIds) {
        // A Leader has no card instance to update, so its rested flag lives on
        // the player. "[printed text omitted -- pnpm card:text <card>]" (OP15-033) is
        // the first clause to name one here; `rest` already carries the mirror
        // branch for the same reason.
        const leaderPlayerId = (["p1", "p2"] as const).find(
          (candidate) => instanceId === `${candidate}-leader`,
        );
        if (leaderPlayerId) {
          if (effect.rested !== undefined) {
            state.players[leaderPlayerId].leaderRested = effect.rested;
          }
          continue;
        }
        const target = [
          ...state.players.p1.life,
          ...state.players.p1.board,
          ...(state.players.p1.stage ? [state.players.p1.stage] : []),
          ...state.players.p2.life,
          ...state.players.p2.board,
          ...(state.players.p2.stage ? [state.players.p2.stage] : []),
        ].find((card) => card.instanceId === instanceId);
        if (!target) throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
        if (effect.faceUp !== undefined) {
          // Life is the only zone where face-up is a visible state change worth
          // a step, and `flipLife` is what knows how to report it.
          const owner = (["p1", "p2"] as const).find((candidate) =>
            state.players[candidate].life.some(
              (card) => card.instanceId === instanceId,
            ),
          );
          if (owner) {
            events.push(
              ...flipLife(
                state,
                owner,
                instanceId,
                effect.faceUp,
                execution.context.source.cardNumber,
              ),
            );
          } else {
            target.faceUp = effect.faceUp;
          }
        }
        if (effect.rested !== undefined && "rested" in target) {
          target.rested = effect.rested;
        }
      }
      continue;
    }
    // One effect K.O.ing several Characters K.O.s them at once, so a protector
    // that is itself among the targets can still pay for another of them:
    // Bandai's OP10-032#2 ruling lets an active Tashigi rest to save a green
    // Character K.O.'d alongside it, and Tashigi is still K.O.'d. Taken in
    // chosen order, a protector picked first would be gone before the other
    // target was asked about, so the targets with a replacement on offer are
    // asked about before the ones without; each group keeps its chosen order.
    const koOrder = (() => {
      if (effect.skipReplacements || instanceIds.length < 2) return instanceIds;
      const offered = instanceIds.filter((instanceId) => {
        const ownerId = (["p1", "p2"] as const).find((candidate) =>
          state.players[candidate].board.some(
            (card) => card.instanceId === instanceId,
          ),
        );
        const threatened = ownerId
          ? state.players[ownerId].board.find(
              (card) => card.instanceId === instanceId,
            )
          : undefined;
        return (
          ownerId !== undefined &&
          threatened !== undefined &&
          eligibleReplacements(
            state,
            execution.context.sourcePlayerId,
            ownerId,
            threatened,
            db,
          ).length > 0
        );
      });
      return [
        ...offered,
        ...instanceIds.filter((instanceId) => !offered.includes(instanceId)),
      ];
    })();
    for (const [index, instanceId] of koOrder.entries()) {
      const ownerId = (["p1", "p2"] as const).find((candidate) =>
        state.players[candidate].board.some(
          (card) => card.instanceId === instanceId,
        ),
      );
      if (ownerId) {
        // Removal immunity, read with the source card in hand: OP14-003
        // Capone"Gang"Bege turns aside a small Character's effect and nothing
        // else, and the OP14-079 Crocodile Leader turns aside its own
        // controller's. A K.O. that cannot land is skipped rather than
        // suppressed later, so no replacement is offered for it either.
        const immuneTarget = state.players[ownerId].board.find(
          (card) => card.instanceId === instanceId,
        );
        if (
          immuneTarget &&
          isRemovalImmune(
            state,
            ownerId,
            immuneTarget,
            execution.context.sourcePlayerId,
            execution.context.source.cardNumber,
            db,
            "ko",
            execution.context.source.instanceId,
          )
        ) {
          continue;
        }
        // "If <a Character> would be K.O.'d, you may <pay> instead." The offer
        // belongs here rather than only on the engine's older `ko-character`
        // pending effect: every K.O. an OP15 or OP16 card deals goes through
        // this node, and a replacement that only answered the legacy path would
        // be printed text the modern cards silently ignore.
        const threatened = state.players[ownerId].board.find(
          (card) => card.instanceId === instanceId,
        );
        const eligible =
          effect.skipReplacements || !threatened
            ? []
            : eligibleReplacements(
                state,
                execution.context.sourcePlayerId,
                ownerId,
                threatened,
                db,
              );
        if (eligible.length > 0 && threatened) {
          // The rest of this node's targets ride on each branch, because
          // answering the prompt returns through the queue rather than back
          // into this loop -- and because what is left of them depends on the
          // answer: one accepted replacement saves every other target it
          // protects (see `replacementCoveredTargets`).
          const remaining = koOrder.slice(index + 1);
          const thenRest = (
            effectNow: MechanicEffect,
            restBind: string,
            rest: readonly string[],
          ): MechanicEffect => {
            if (rest.length === 0) return effectNow;
            execution.bindings[restBind] = [...rest];
            return {
              kind: "sequence",
              effects: [
                effectNow,
                { kind: "knock-out", binding: restBind, remainder: true },
              ],
            };
          };
          const targetName = db.require(threatened.cardNumber).name;
          const koBind = `${effect.binding}-ko-${instanceId}`;
          execution.bindings[koBind] = [instanceId];
          // A prevention (OP10-118) leaves its controller no K.O. to pick.
          const prevented = eligible.some(({ entry }) => entry.mandatory);
          return {
            pending: {
              kind: "choice",
              execution,
              chooserPlayerId: ownerId,
              branches: [
                ...(prevented
                  ? []
                  : [
                      {
                        id: `ko:${instanceId}`,
                        label: `K.O. ${targetName}`,
                        effect: thenRest(
                          {
                            kind: "knock-out",
                            binding: koBind,
                            skipReplacements: true,
                          },
                          `${effect.binding}-after-replacement`,
                          remaining,
                        ),
                      },
                    ]),
                ...eligible.map(({ protector, entry }) => {
                  const bind = `${effect.binding}-replace-${protector.instanceId}`;
                  execution.bindings[bind] = [protector.instanceId];
                  // The threatened card too, for the one entry shape whose
                  // "instead" moves *it* rather than paying something (OP11-101).
                  execution.bindings[`${bind}-threatened`] = [instanceId];
                  const covered = replacementCoveredTargets(
                    state,
                    execution.context.sourcePlayerId,
                    ownerId,
                    { protector, entry },
                    remaining,
                    db,
                    "ko",
                  );
                  return {
                    id: `replace:${protector.instanceId}`,
                    label: `${entry.label} instead of K.O. ${boardCardNames(state, ownerId, [instanceId, ...covered], db)}`,
                    effect: thenRest(
                      replacementCostEffect(
                        { protector, entry },
                        ownerId === execution.context.sourcePlayerId,
                        bind,
                      ),
                      `${bind}-after-replacement`,
                      remaining.filter((rest) => !covered.includes(rest)),
                    ),
                  };
                }),
              ],
            },
            events,
            signals,
          };
        }
        const removed = knockOut(
          state,
          ownerId,
          instanceId,
          execution.context.source.cardNumber,
        );
        if (!removed) throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
        signals.push({
          kind: "card-moved",
          // The whole board entry: a `[DON!! xN]` gate on the dead card's own
          // `[On K.O.]` reads the DON!! it was carrying, which only survives
          // here. See `source-attached-don`.
          card: removed.card,
          ownerId,
          from: "board",
          to: "trash",
          ko: true,
          sourceCardNumber: execution.context.source.cardNumber,
          sourcePlayerId: execution.context.sourcePlayerId,
        });
        events.push(...removed.events);
        continue;
      }
      // "[printed text omitted -- pnpm card:text <card>]" (OP17-018/116) -- the only
      // Stage removal in the format. A Stage carries no attached DON!!, is
      // never subject to the 5-Character replacement limit, and nothing here
      // has an `[On K.O.]` keyed off a Stage, so this is a direct move to
      // trash rather than a call into `knockOut`, which is written for
      // Characters specifically.
      const stageOwnerId = (["p1", "p2"] as const).find(
        (candidate) =>
          state.players[candidate].stage?.instanceId === instanceId,
      );
      if (!stageOwnerId) {
        // Gone since the node was queued: nothing is left to K.O.
        if (effect.remainder) continue;
        throw new Error(`INVALID_KO_SOURCE_ZONE: ${instanceId}`);
      }
      const stage = state.players[stageOwnerId].stage;
      if (!stage) throw new Error(`MISSING_MECHANIC_CARD: ${instanceId}`);
      state.players[stageOwnerId].stage = null;
      state.players[stageOwnerId].trash.push({
        instanceId: stage.instanceId,
        cardNumber: stage.cardNumber,
      });
      signals.push({
        kind: "card-moved",
        card: { instanceId: stage.instanceId, cardNumber: stage.cardNumber },
        ownerId: stageOwnerId,
        from: "board",
        to: "trash",
        ko: true,
      });
      // Reuses `character-ko` rather than adding a new protocol event kind
      // for the format's one Stage removal: every consumer of the event
      // (logs, hashing, the browser UI) only reads it for "a card was
      // removed by an effect", which this still is.
      events.push({
        type: "character-ko",
        playerId: stageOwnerId,
        cardInstanceId: stage.instanceId,
        cardNumber: stage.cardNumber,
        sourceCardNumber: execution.context.source.cardNumber,
      });
    }
  }
  return { pending: null, events, signals };
}

export const SOURCE_BINDING = "source";

export function executeMechanicProgram(
  state: GameState,
  context: MechanicContext,
  program: MechanicProgram,
  db: CardDatabase = defaultCardDatabase,
  /** Bindings the program starts with; see `MechanicProgramInvocation.bindings`. */
  initialBindings: Record<string, string[]> = {},
): MechanicResult {
  const queue: MechanicEffect[] = [];
  flatten(program.effect, queue);
  return continueExecution(
    state,
    {
      context,
      bindings: {
        ...initialBindings,
        [SOURCE_BINDING]: [context.source.instanceId],
      },
      queue,
    },
    db,
  );
}

/**
 * One `reaction:<instanceId>` per distinct card among `reactions`, in queue
 * order.
 *
 * Per card rather than per copy: two copies of one card run the same clause,
 * so which of them goes first is not a decision. The id names the first copy,
 * which is the one `pickOrderedReaction` resolves.
 */
export function orderReactionOptions(
  reactions: readonly MechanicProgramInvocation[],
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const reaction of reactions) {
    const { cardNumber, instanceId } = reaction.context.source;
    if (seen.has(cardNumber)) continue;
    seen.add(cardNumber);
    options.push(`reaction:${instanceId}`);
  }
  return options;
}

/**
 * Splits `reactions` into the one `optionId` names and the rest, in order.
 * Throws on an id `orderReactionOptions` would not have offered.
 */
export function pickOrderedReaction(
  reactions: readonly MechanicProgramInvocation[],
  optionId: string,
): {
  chosen: MechanicProgramInvocation;
  rest: MechanicProgramInvocation[];
} {
  if (!orderReactionOptions(reactions).includes(optionId)) {
    throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
  }
  const instanceId = optionId.slice("reaction:".length);
  const index = reactions.findIndex(
    (reaction) => reaction.context.source.instanceId === instanceId,
  );
  return {
    chosen: reactions[index]!,
    rest: reactions.filter((_, other) => other !== index),
  };
}
