import {
  cards as defaultCardDatabase,
  clauseParts,
  clauseText,
  cardAttributes,
  hasCardType,
  type CardDatabase,
} from "@one-piece-sim/cards";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import {
  dispatchMechanicInvocations,
  getMechanicSignalInvocations,
  getOnEndOfYourTurnMechanicProgram,
  getOnKoMechanicProgram,
  isClauseOpeningOptional,
  optionalClauseMarker,
  getOnPlayMechanicProgram,
  getTriggerMechanicProgram,
} from "./card-mechanics.js";
import {
  EFFECT_RESOLVERS,
  type EffectResolver,
} from "./resolve-effect/index.js";
import {
  describeMoveDestination,
  executeMechanicProgram,
  getMechanicChoiceOptions,
  parseOrderOption,
  parseOrderSplit,
  type MechanicEffect,
  type MechanicInvocation,
  type MechanicProgramInvocation,
  type MechanicPendingChoice,
} from "./mechanics.js";
import type { CardInstance, GameState, PendingEffect } from "./model.js";
import {} from "./removal.js";
import { orderSummary } from "./offered-action.js";
import {
  charactersArriveRested,
  effectsNegated,
  isRemovalImmune,
  onPlayEffectsNegated,
} from "./static-abilities.js";
import {
  DON_POOL_ACTIVE,
  DON_POOL_RESTED,
  donPoolSize,
  donReturnPools,
  fieldDonCount,
} from "./don.js";
import { effectiveCost } from "./queries.js";
import { noOnPlay, runOnPlayHandler } from "./on-play-handlers.js";
export {
  onPlayHandlerCards,
  hasOnPlayHandler,
  runOnPlayHandler,
} from "./on-play-handlers.js";

export interface OnPlayResult {
  pending: PendingEffect | null;
  events: PublicEvent[];
}

export function placeCharacter(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  rested = false,
  db: CardDatabase = defaultCardDatabase,
): OnPlayResult {
  const player = state.players[playerId];
  // "Your Character cards are played rested" (OP09-022 Lim's Leader) is a rule
  // about arrival, so it is applied here rather than at each call site: every
  // Character that reaches a board through this function is covered, whether it
  // was played from hand, out of the trash, or by another card's effect. A
  // clause that already plays its card rested stays rested.
  rested = rested || charactersArriveRested(state, playerId, db);
  if (player.board.length >= 5) {
    return {
      pending: {
        kind: "character-area-replacement",
        playerId,
        sourceCardNumber: card.cardNumber,
        sourceInstanceId: card.instanceId,
        eligibleInstanceIds: player.board.map(
          (character) => character.instanceId,
        ),
        card,
        rested,
      },
      events: [],
    };
  }
  player.board.push({
    ...card,
    rested,
    playedTurn: state.turn,
    attachedDon: [],
    powerModifiers: [],
  });
  const onPlay = createOnPlayEffect(state, playerId, card, db);
  return {
    pending: onPlay.pending,
    events: [
      {
        type: "card-played",
        playerId,
        cardInstanceId: card.instanceId,
        cardNumber: card.cardNumber,
      },
      ...onPlay.events,
    ],
  };
}

/**
 * The apply/skip prompt for an optional effect, named.
 *
 * "Apply optional effect" was the label on every one of these, on the theory
 * that an ability its controller went looking for needs no naming -- they
 * clicked the activation, so they know what they clicked. Most of these are
 * not clicked. An `[On Your Opponent's Attack]` arrives unasked in the middle
 * of the opponent's attack; a `[When Attacking]` fires off an attack already
 * declared; a `[Trigger]` fires off a Life card. For those the generic label
 * says neither what the ability does, nor that it costs a card, nor even which
 * card is asking -- and a seat reading nothing but text has no other source.
 *
 * Two recorded games are why. An LLM held two OP15-060 Enel back for a whole
 * turn without activating an ability whose action said only "Activate Enel".
 * And one declined OP09-062 Nico Robin's `[When Attacking]` -- the deck's whole
 * ramp, named three times over in its own dossier -- reasoning about an effect
 * it had invented, because "Apply optional effect" gave it nothing to
 * recognise.
 *
 * Three labels, in descending order of what is known:
 *   - the clause, quoted, when the process holds a printed-text pack;
 *   - the card and the marker, when it does not -- which is the shipped build,
 *     since printed text is a runtime asset rather than repo data, and is
 *     enough to find the clause in a dossier that describes it;
 *   - the card alone, for the 26 cards whose marker cannot be resolved
 *     unambiguously (see `optionalClauseMarker`).
 *
 * Never `undefined`: naming the card is the floor, and it beats what this
 * replaced in every case.
 */
function optionalEffectSummary(
  cardNumber: string,
  optional: MechanicEffect | undefined,
  db: CardDatabase,
): string {
  const card = `${db.require(cardNumber).name} [${cardNumber}]`;
  const marker = optionalClauseMarker(cardNumber);
  if (optional && !isClauseOpeningOptional(cardNumber, optional)) {
    // An "up to" step inside a clause already paid for. Naming the clause and
    // its cost again reads as being asked to pay again -- OP08-119 Kaido &
    // Linlin's two Life steps read "DON!! −10" three times over -- so this
    // names the step, and the clause only as where it comes from.
    const clause = marker === undefined ? card : `${card} ${marker}`;
    return `Continue ${clause}: ${describeOptionalStep(optional) ?? "apply the next step"}`;
  }
  if (marker === undefined) return `Apply ${card}'s optional effect`;
  const clause = clauseText(cardNumber, marker);
  if (clause) return `Activate ${card}: ${clause}`;
  // Without the text, the committed clause summary still knows the cost, which
  // is the half a player is deciding about: the effect is why the clause was
  // offered, the cost is why it might be declined.
  const cost = clauseParts(cardNumber, marker)?.cost;
  return cost
    ? `Activate ${card} ${marker}: ${cost}`
    : `Activate ${card} ${marker}`;
}

/**
 * One "up to" step in words, for the shapes that can be said exactly: a card
 * off the top or bottom of a deck or Life pile, moved somewhere. Anything else
 * is `undefined`, and the caller says "the next step" rather than guess.
 */
function describeOptionalStep(effect: MechanicEffect): string | undefined {
  if (effect.kind !== "select" || effect.count !== 1) return undefined;
  const { selector, effect: inner } = effect;
  if (inner.kind !== "move" || inner.binding !== effect.bind) return undefined;
  const filtered = Object.keys(selector).some(
    (key) => key !== "player" && key !== "zone" && key !== "position",
  );
  if (
    filtered ||
    (selector.zone !== "deck" && selector.zone !== "life") ||
    (selector.position !== "top" && selector.position !== "bottom") ||
    (selector.player !== "self" && selector.player !== "opponent")
  ) {
    return undefined;
  }
  const whose = selector.player === "self" ? "your" : "their";
  const pile = selector.zone === "life" ? "Life cards" : "deck";
  const taken = `the ${selector.position} card of ${whose} ${pile}`;
  return inner.to.zone === "trash"
    ? `trash ${taken}`
    : `add ${taken} to ${describeMoveDestination(inner.to)}`;
}

export function mechanicPendingEffect(
  invocation: MechanicInvocation,
  choice: MechanicPendingChoice,
  continuations: MechanicInvocation[],
  /** Marks a choice raised by an `[End of Your Turn]` program. */
  endOfTurn = false,
  /**
   * The controller of an `[Activate: Main]` the player clicked, when this
   * choice came from one. Carried rather than read off `playerId`, which a
   * later step of the same program can hand to the opponent.
   */
  activatedBy?: PlayerId,
): PendingEffect {
  return {
    kind: "mechanic-choice",
    // A `choose`/`choice` may name someone else as the answering player --
    // ST10-010 trashes cards out of the opponent's hand and the opponent
    // picks them, OP17-049/OP17-099 hand the branch itself to the opponent --
    // and `pendingEffect.playerId` is what the engine hands control to.
    playerId:
      (choice.kind === "cards" ||
      choice.kind === "choice" ||
      choice.kind === "optional"
        ? choice.chooserPlayerId
        : undefined) ?? invocation.context.sourcePlayerId,
    sourceCardNumber: invocation.context.source.cardNumber,
    sourceInstanceId: invocation.context.source.instanceId,
    choice,
    ...(continuations.length > 0 ? { continuations } : {}),
    ...(endOfTurn ? { endOfTurn: true as const } : {}),
    ...(activatedBy ? { activatedBy } : {}),
  };
}

export const leaderInstanceId = (playerId: PlayerId): string =>
  `${playerId}-leader`;
export const opponentOf = (playerId: PlayerId): PlayerId =>
  playerId === "p1" ? "p2" : "p1";

export const isSlash = (cardNumber: string, db: CardDatabase): boolean =>
  cardAttributes(db.require(cardNumber)).includes("Slash");

/** The card a pending effect came from, in the shape `returnDonToDeck` wants. */
export const effectSource = (effect: {
  sourceCardNumber: string;
  sourceInstanceId: string;
}): CardInstance => ({
  instanceId: effect.sourceInstanceId,
  cardNumber: effect.sourceCardNumber,
});

/**
 * `sourceCardNumber` names the card that caused the draw. Pass it whenever one
 * is in scope: without it the log cannot tell a Leader's passive draw from the
 * ordinary draw-phase draw, and a player has no way to notice their trigger
 * fired.
 */
export function drawCards(
  state: GameState,
  playerId: PlayerId,
  count: number,
  sourceCardNumber?: string,
): PublicEvent[] {
  const player = state.players[playerId];
  let drawn = 0;
  while (drawn < count) {
    const card = player.deck.shift();
    if (!card) break;
    player.hand.push(card);
    drawn += 1;
  }
  return drawn > 0
    ? [
        {
          type: "cards-drawn",
          playerId,
          count: drawn,
          ...(sourceCardNumber ? { sourceCardNumber } : {}),
        },
      ]
    : [];
}

export function applyPowerModifier(
  state: GameState,
  playerId: PlayerId,
  targetInstanceId: string,
  amount: number,
  expiresAtTurn: number,
  source?: CardInstance,
): void {
  const modifier = {
    amount,
    expiresAtTurn,
    ...(source
      ? {
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
        }
      : {}),
  };
  const player = state.players[playerId];
  if (targetInstanceId === leaderInstanceId(playerId)) {
    player.leaderPowerModifiers.push(modifier);
    return;
  }
  const target = player.board.find(
    (card) => card.instanceId === targetInstanceId,
  );
  if (!target) throw new Error(`MISSING_POWER_TARGET: ${targetInstanceId}`);
  target.powerModifiers ??= [];
  target.powerModifiers.push(modifier);
}

export function fieldStrawHatCount(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase,
): number {
  const player = state.players[playerId];
  return (
    (hasCardType(player.leaderCardNumber, "Straw Hat Crew") ? 1 : 0) +
    player.board.filter((card) =>
      db.require(card.cardNumber).types.includes("Straw Hat Crew"),
    ).length +
    (player.stage &&
    db.require(player.stage.cardNumber).types.includes("Straw Hat Crew")
      ? 1
      : 0)
  );
}

export function searchTopFive(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  excludeName: string | undefined,
  db: CardDatabase,
): PendingEffect {
  const player = state.players[playerId];
  const revealed = player.deck.splice(0, 5);
  return {
    kind: "search-top-five",
    playerId,
    sourceCardNumber: source.cardNumber,
    sourceInstanceId: source.instanceId,
    revealed,
    eligibleInstanceIds: revealed
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          definition.types.includes("Straw Hat Crew") &&
          definition.name !== excludeName
        );
      })
      .map((card) => card.instanceId),
  };
}

export function searchBigMomTopThree(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  db: CardDatabase,
): PendingEffect {
  const player = state.players[playerId];
  const revealed = player.deck.splice(0, 3);
  return {
    kind: "search-top-five",
    playerId,
    sourceCardNumber: source.cardNumber,
    sourceInstanceId: source.instanceId,
    revealed,
    eligibleInstanceIds: revealed
      .filter((card) =>
        db.require(card.cardNumber).types.includes("Big Mom Pirates"),
      )
      .map((card) => card.instanceId),
  };
}

export function searchImpelDownTopThree(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  db: CardDatabase,
): PendingEffect {
  const player = state.players[playerId];
  const revealed = player.deck.splice(0, 3);
  return {
    kind: "search-top-five",
    playerId,
    sourceCardNumber: source.cardNumber,
    sourceInstanceId: source.instanceId,
    revealed,
    eligibleInstanceIds: revealed
      .filter((card) =>
        db.require(card.cardNumber).types.includes("Impel Down"),
      )
      .map((card) => card.instanceId),
  };
}

export function createSupernovaSearch(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  charactersOnly: boolean,
  db: CardDatabase = defaultCardDatabase,
): Extract<PendingEffect, { kind: "search-top-five" }> {
  const player = state.players[playerId];
  const revealed = player.deck.splice(0, 5);
  return {
    kind: "search-top-five",
    playerId,
    sourceCardNumber: source.cardNumber,
    sourceInstanceId: source.instanceId,
    revealed,
    eligibleInstanceIds: revealed
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          definition.types.includes("Supernovas") &&
          (!charactersOnly || definition.category === "character") &&
          (source.cardNumber !== "OP10-111" ||
            definition.name !== "Monkey.D.Luffy")
        );
      })
      .map((card) => card.instanceId),
  };
}

/**
 * OP12-071 Charlotte Pudding: look at 4, reveal up to 1 [Sanji] or Event card.
 */
export function createPuddingSearch(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  db: CardDatabase = defaultCardDatabase,
): PendingEffect {
  const revealed = state.players[playerId].deck.splice(0, 4);
  return {
    kind: "search-top-five",
    playerId,
    sourceCardNumber: source.cardNumber,
    sourceInstanceId: source.instanceId,
    revealed,
    eligibleInstanceIds: revealed
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return definition.name === "Sanji" || definition.category === "event";
      })
      .map((card) => card.instanceId),
  };
}

/**
 * OP15-118 Enel: look at 5, add up to 1 to hand, rest to the bottom, then trash
 * 1 card from hand.
 *
 * `thenTrash` chains the trailing cost onto the existing search machinery rather
 * than duplicating it; without it the card would be a strict upgrade on its
 * printed text.
 */
export function createEnelSearch(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
): PendingEffect {
  const revealed = state.players[playerId].deck.splice(0, 5);
  return {
    kind: "search-top-five",
    playerId,
    sourceCardNumber: source.cardNumber,
    sourceInstanceId: source.instanceId,
    revealed,
    eligibleInstanceIds: revealed.map((card) => card.instanceId),
    thenTrash: 1,
  };
}

export function createHiyoriSearch(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  db: CardDatabase = defaultCardDatabase,
): PendingEffect {
  const revealed = state.players[playerId].deck.splice(0, 5);
  return {
    kind: "search-top-five",
    playerId,
    sourceCardNumber: source.cardNumber,
    sourceInstanceId: source.instanceId,
    revealed,
    eligibleInstanceIds: revealed
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          cardAttributes(definition).includes("Slash") ||
          (definition.category === "event" && card.cardNumber === "OP12-039")
        );
      })
      .map((card) => card.instanceId),
  };
}

export function createOnKoEffect(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  resumePlayerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): PendingEffect | null {
  const player = state.players[playerId];
  if (source.cardNumber === "ST34-001") {
    const eligibleInstanceIds = player.hand
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          definition.category === "character" &&
          (definition.power ?? 99_999) <= 8000
        );
      })
      .map((card) => card.instanceId);
    return eligibleInstanceIds.length > 0
      ? {
          kind: "free-play",
          playerId,
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
          eligibleInstanceIds,
          resumePhase: "main",
          resumePlayerId,
        }
      : null;
  }
  if (
    source.cardNumber === "P-090" &&
    fieldDonCount(state, playerId) > 0 &&
    state.turnPlayerId !== playerId
  ) {
    const opponentDon = fieldDonCount(state, opponentOf(playerId));
    const eligibleInstanceIds = player.hand
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          definition.category === "character" &&
          definition.types.includes("Big Mom Pirates") &&
          (definition.cost ?? 99) <= opponentDon
        );
      })
      .map((card) => card.instanceId);
    return eligibleInstanceIds.length > 0
      ? {
          kind: "free-play",
          playerId,
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
          eligibleInstanceIds,
          returnDon: 1,
          resumePhase: "main",
          resumePlayerId,
        }
      : null;
  }
  if (source.cardNumber === "ST33-002") {
    const eligibleInstanceIds = player.hand
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          definition.category === "character" &&
          definition.colors?.includes("Blue") === true &&
          definition.types.includes("Navy") &&
          (definition.cost ?? 99) <= 4
        );
      })
      .map((card) => card.instanceId);
    return eligibleInstanceIds.length > 0
      ? {
          kind: "free-play",
          playerId,
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
          eligibleInstanceIds,
          resumePhase: "main",
          resumePlayerId,
        }
      : null;
  }
  if (
    source.cardNumber === "ST36-001" &&
    player.hand.length > 0 &&
    player.deck.length > 0
  ) {
    return {
      kind: "discard-for-life",
      playerId,
      sourceCardNumber: source.cardNumber,
      sourceInstanceId: source.instanceId,
      eligibleInstanceIds: player.hand.map((card) => card.instanceId),
      resumePhase: "main",
      resumePlayerId,
    };
  }
  if (
    source.cardNumber === "OP10-109" &&
    state.players[opponentOf(playerId)].life.length > 0
  ) {
    return {
      kind: "trash-opponent-life",
      playerId,
      targetPlayerId: opponentOf(playerId),
      sourceCardNumber: source.cardNumber,
      sourceInstanceId: source.instanceId,
      resumePhase: "main",
      resumePlayerId,
    };
  }
  if (
    source.cardNumber === "OP12-113" &&
    hasCardType(player.leaderCardNumber, "Supernovas")
  ) {
    const eligibleInstanceIds = player.hand
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          definition.category === "character" &&
          definition.types.includes("Supernovas") &&
          (definition.cost ?? 99) <= 4
        );
      })
      .map((card) => card.instanceId);
    return eligibleInstanceIds.length > 0
      ? {
          kind: "free-play-rested",
          playerId,
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
          eligibleInstanceIds,
          resumePhase: "main",
          resumePlayerId,
        }
      : null;
  }
  return null;
}

export function createOnKoResult(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  resumePlayerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
  /**
   * How the Character died. Only `[On K.O.]` text that names the cause reads
   * it -- see `OnKoProgram` -- and every caller but the battle one is an
   * effect, which is why that is the default.
   */
  cause: "battle" | "effect" = "effect",
): OnPlayResult {
  // OP16-119 Marshall.D.Teach's Trigger can switch a Character off for the turn,
  // and a Character K.O.'d while negated takes its [On K.O.] with it.
  if (effectsNegated(state, source.instanceId)) {
    return { pending: null, events: [] };
  }
  // A Character leaving the board is a `card-moved` signal in its own right, and
  // some clauses watch for one without being the dead card's own [On K.O.]:
  // OP16-041 Buggy replays a Prisoner "[printed text omitted -- pnpm card:text OP16-041]". Battle destruction and the imperative
  // removal paths splice the board themselves and raise no signal, so it is
  // synthesised here, where every K.O. already converges. `includeOnKo` is off
  // inside `applyMechanicReactions`, so the dead card's own [On K.O.] is not
  // dispatched twice.
  const removalWatchers = getMechanicSignalInvocations(
    state,
    [
      {
        kind: "card-moved",
        card: source,
        ownerId: playerId,
        from: "board",
        to: "trash",
      },
    ],
    false,
  );
  const mechanicProgram = getOnKoMechanicProgram(source.cardNumber, cause);
  if (mechanicProgram) {
    const invocation = {
      context: { sourcePlayerId: playerId, source },
      program: mechanicProgram,
    };
    const result = executeMechanicProgram(
      state,
      invocation.context,
      mechanicProgram,
      db,
    );
    const continuations = [
      ...getMechanicSignalInvocations(state, result.signals),
      ...removalWatchers,
    ];
    if (result.pending) {
      return {
        pending: mechanicPendingEffect(
          invocation,
          result.pending,
          continuations,
        ),
        events: result.events,
      };
    }
    const dispatched = dispatchMechanicInvocations(state, continuations, db);
    return {
      pending:
        dispatched.pending && dispatched.invocation
          ? mechanicPendingEffect(
              dispatched.invocation,
              dispatched.pending,
              dispatched.continuations,
            )
          : null,
      events: [...result.events, ...dispatched.events],
    };
  }
  const legacy = createOnKoEffect(state, playerId, source, resumePlayerId, db);
  if (legacy || removalWatchers.length === 0) {
    return { pending: legacy, events: [] };
  }
  // No [On K.O.] of its own, but something else was watching the board.
  const dispatched = dispatchMechanicInvocations(state, removalWatchers, db);
  return {
    pending:
      dispatched.pending && dispatched.invocation
        ? mechanicPendingEffect(
            dispatched.invocation,
            dispatched.pending,
            dispatched.continuations,
          )
        : null,
    events: dispatched.events,
  };
}

/**
 * `[End of Your Turn]` dispatch for cards on the board, one instance at a time.
 *
 * There is no priority ladder here the way `[On Your Opponent's Attack]` needs
 * one -- a Character's End of Turn ability is unconditional on its owner rather
 * than offered, so `endTurn` just asks each un-negated, not-yet-fired instance
 * in turn and re-enters after each resolves, the same shape `borsalino-end-turn`
 * already uses for OP16-073. Returns `null` when the card has no such program or
 * its condition (e.g. OP17-047's hand-size check) does not hold.
 */
export function createOnEndOfYourTurnResult(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  db: CardDatabase = defaultCardDatabase,
): OnPlayResult {
  if (effectsNegated(state, source.instanceId)) {
    return { pending: null, events: [] };
  }
  const mechanicProgram = getOnEndOfYourTurnMechanicProgram(source.cardNumber);
  if (!mechanicProgram) return { pending: null, events: [] };
  const invocation = {
    context: { sourcePlayerId: playerId, source },
    program: mechanicProgram,
  };
  const result = executeMechanicProgram(
    state,
    invocation.context,
    mechanicProgram,
    db,
  );
  const continuations = getMechanicSignalInvocations(state, result.signals);
  if (result.pending) {
    return {
      pending: mechanicPendingEffect(
        invocation,
        result.pending,
        continuations,
        true,
      ),
      events: result.events,
    };
  }
  const dispatched = dispatchMechanicInvocations(state, continuations, db);
  return {
    pending:
      dispatched.pending && dispatched.invocation
        ? mechanicPendingEffect(
            dispatched.invocation,
            dispatched.pending,
            dispatched.continuations,
          )
        : null,
    events: [...result.events, ...dispatched.events],
  };
}

export function createTriggerResult(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  db: CardDatabase = defaultCardDatabase,
  /**
   * Programs to run once the Trigger's own has settled -- the "when a
   * [Trigger] activates" watchers (OP13-106 Conney, OP05-109 Pagaya).
   *
   * Handed in rather than dispatched by the caller because a watcher can stop
   * to ask something: Pagaya draws two and then chooses two to trash. A
   * dispatch that keeps only the events drops that question on the floor, and
   * the continuation queue behind a pending choice is the one place the engine
   * already knows how to hold a second program while the first is answered.
   */
  reactions: readonly MechanicInvocation[] = [],
): OnPlayResult {
  const mechanicProgram = getTriggerMechanicProgram(source.cardNumber);
  if (!mechanicProgram) return { pending: null, events: [] };
  // A Trigger that runs the card's [On Play] is an [On Play] effect, so a
  // negation of those empties it (OP09-081#1); the "when a [Trigger]
  // activates" watchers still answer, because it was activated.
  if (mechanicProgram.runsOnPlay && onPlayEffectsNegated(state, playerId, db)) {
    const dispatched = dispatchMechanicInvocations(state, [...reactions], db);
    return {
      pending:
        dispatched.pending && dispatched.invocation
          ? mechanicPendingEffect(
              dispatched.invocation,
              dispatched.pending,
              dispatched.continuations,
            )
          : null,
      events: dispatched.events,
    };
  }
  const invocation = {
    context: { sourcePlayerId: playerId, source },
    program: mechanicProgram,
  };
  const result = executeMechanicProgram(
    state,
    invocation.context,
    mechanicProgram,
    db,
  );
  const continuations = [
    ...reactions,
    ...getMechanicSignalInvocations(state, result.signals),
  ];
  if (result.pending) {
    return {
      pending: mechanicPendingEffect(invocation, result.pending, continuations),
      events: result.events,
    };
  }
  const dispatched = dispatchMechanicInvocations(state, continuations, db);
  return {
    pending:
      dispatched.pending && dispatched.invocation
        ? mechanicPendingEffect(
            dispatched.invocation,
            dispatched.pending,
            dispatched.continuations,
          )
        : null,
    events: [...result.events, ...dispatched.events],
  };
}

function activeRestTargets(
  state: GameState,
  playerId: PlayerId,
  maxCost: number,
): string[] {
  return state.players[opponentOf(playerId)].board
    .filter(
      (card) =>
        !card.rested &&
        (card.cannotRestUntilTurn ?? -1) < state.turn &&
        effectiveCost(state, opponentOf(playerId), card) <= maxCost,
    )
    .map((card) => card.instanceId);
}

export function restEffect(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  maxCost: number,
  remaining = 1,
  afterRest?: "give-three-don-to-leader" | "schedule-active-don",
): PendingEffect | null {
  const eligibleInstanceIds = activeRestTargets(state, playerId, maxCost);
  return eligibleInstanceIds.length > 0
    ? {
        kind: "rest-character",
        playerId,
        targetPlayerId: opponentOf(playerId),
        sourceCardNumber: source.cardNumber,
        sourceInstanceId: source.instanceId,
        eligibleInstanceIds,
        remaining,
        ...(afterRest ? { afterRest } : {}),
      }
    : null;
}

/**
 * OP10-036 Perona: "[printed text omitted -- pnpm card:text OP10-036]"
 *
 * The single implementation of the refund, called from every place a Character
 * comes to rest by its controller's own effect. `[Once Per Turn]` is per copy, so
 * the key names the Perona that pays out rather than the card number: keyed by
 * number, the four copies ST32 runs shared one refund per turn between them.
 */
export function triggerPerona(
  state: GameState,
  playerId: PlayerId,
): PublicEvent[] {
  const player = state.players[playerId];
  if (state.activePlayer !== playerId || player.restedDon.length === 0) {
    return [];
  }
  const perona = player.board.find(
    (card) =>
      card.cardNumber === "OP10-036" &&
      !state.oncePerTurn.includes(
        `${state.turn}:${playerId}:${card.instanceId}:perona`,
      ),
  );
  if (!perona) return [];
  player.activeDon.push(...player.restedDon.splice(0, 1));
  state.oncePerTurn.push(
    `${state.turn}:${playerId}:${perona.instanceId}:perona`,
  );
  return [];
}

export function applyAfterRest(
  state: GameState,
  playerId: PlayerId,
  afterRest: "give-three-don-to-leader" | "schedule-active-don" | undefined,
): PublicEvent[] {
  const player = state.players[playerId];
  if (afterRest === "give-three-don-to-leader") {
    const moved = player.restedDon.splice(0, 3);
    player.leaderAttachedDon.push(...moved);
    return [
      {
        type: "don-attached",
        playerId,
        targetInstanceId: leaderInstanceId(playerId),
        count: moved.length,
      },
    ];
  }
  if (afterRest === "schedule-active-don") {
    player.activateDonAtEndOfTurn += 1;
  }
  return [];
}

/**
 * Parks reactions behind a pending effect that cannot carry them itself.
 *
 * Appends rather than replaces: a second clause can suspend while a first one's
 * watchers are still waiting, and the earlier ones are still owed their turn.
 */
export function queuePendingContinuations(
  state: GameState,
  invocations: readonly MechanicInvocation[],
): void {
  if (invocations.length === 0) return;
  state.pendingContinuations = [
    ...(state.pendingContinuations ?? []),
    ...invocations,
  ];
}

/**
 * Runs whatever was parked, once nothing is pending.
 *
 * Called from the end of every action -- the one place that both owns the
 * pending slot and is reached however the action got here. An effect still in
 * flight defers the whole queue to the next action, which is the same rule the
 * `[Event]` watchers a few lines above it follow: the thing the player is
 * already answering comes first.
 */
export function drainPendingContinuations(
  state: GameState,
  db: CardDatabase = defaultCardDatabase,
): PublicEvent[] {
  const events: PublicEvent[] = [];
  while (
    state.pendingContinuations &&
    state.pendingContinuations.length > 0 &&
    !state.pendingEffect
  ) {
    const next = state.pendingContinuations.shift()!;
    if ("program" in next) {
      // A group waiting to be ordered goes as one, or the dispatcher would
      // see a group of one and run it without asking.
      const batch = [next];
      while (
        next.orderGroup !== undefined &&
        state.pendingContinuations[0] !== undefined &&
        "program" in state.pendingContinuations[0] &&
        state.pendingContinuations[0].orderGroup === next.orderGroup
      ) {
        batch.push(state.pendingContinuations.shift() as typeof next);
      }
      const dispatched = dispatchMechanicInvocations(state, batch, db);
      events.push(...dispatched.events);
      // Whatever that program queued behind itself keeps its place at the head.
      if (dispatched.continuations.length > 0) {
        state.pendingContinuations.unshift(...dispatched.continuations);
      }
      if (dispatched.pending && dispatched.invocation) {
        state.pendingEffect = mechanicPendingEffect(
          dispatched.invocation,
          dispatched.pending,
          [],
        );
      }
      continue;
    }
    const result = runOnPlayHandler(
      state,
      next.context.sourcePlayerId,
      next.context.source,
      db,
    );
    events.push(...result.events);
    state.pendingEffect = result.pending;
  }
  if (state.pendingContinuations?.length === 0) {
    delete state.pendingContinuations;
  }
  return events;
}

export function createOnPlayEffect(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  db: CardDatabase = defaultCardDatabase,
): OnPlayResult {
  // A negated Character contributes nothing but its body. Reachable for an
  // [On Play] only through a Character that is negated on the field and then
  // returned to it in the same turn; the [On K.O.] case below is the live one.
  if (effectsNegated(state, source.instanceId)) {
    return noOnPlay();
  }
  // "Your [On Play] effects are negated" -- OP09-081's Leader on its own side,
  // permanently, and on the other side for a turn when it pays for it. The card
  // still arrives and still watches: only its own clause is dropped, which is
  // why this returns after the watchers have been collected below rather than
  // instead of them.
  const onPlayNegated = onPlayEffectsNegated(state, playerId, db);
  // Every play is watched, whether or not the played card has an `[On Play]` of
  // its own: OP12-081 Koala's Leader answers "[printed text omitted -- pnpm card:text OP12-081]", and a vanilla 8-drop is exactly
  // what that is about. `includeOnPlay: false` is what keeps this from
  // dispatching the played card's own clause a second time -- that is the
  // program and handler branches below.
  const watchers = getMechanicSignalInvocations(
    state,
    [{ kind: "card-played", card: source, playerId }],
    true,
    db,
    false,
  );
  const mechanicProgram = onPlayNegated
    ? undefined
    : getOnPlayMechanicProgram(source.cardNumber);
  if (mechanicProgram) {
    const invocation = {
      context: { sourcePlayerId: playerId, source },
      program: mechanicProgram,
    };
    const result = executeMechanicProgram(
      state,
      invocation.context,
      mechanicProgram,
      db,
    );
    const continuations = [
      ...getMechanicSignalInvocations(state, result.signals),
      ...watchers,
    ];
    if (result.pending) {
      return {
        pending: mechanicPendingEffect(
          invocation,
          result.pending,
          continuations,
        ),
        events: result.events,
      };
    }
    const dispatched = dispatchMechanicInvocations(state, continuations, db);
    return {
      pending:
        dispatched.pending && dispatched.invocation
          ? mechanicPendingEffect(
              dispatched.invocation,
              dispatched.pending,
              dispatched.continuations,
            )
          : null,
      events: [...result.events, ...dispatched.events],
    };
  }
  // The card's own clause first, watchers behind it -- the order the program
  // branch above has always used. This branch used to dispatch the watchers
  // first and *return* if one of them suspended, which dropped the played
  // card's own `[On Play]` on the floor; parking the watchers instead is what
  // `pendingContinuations` is for.
  const own = onPlayNegated
    ? noOnPlay()
    : runOnPlayHandler(state, playerId, source, db);
  if (own.pending) {
    queuePendingContinuations(state, watchers);
    return own;
  }
  if (watchers.length === 0) return own;
  const dispatched = dispatchMechanicInvocations(state, watchers, db);
  return {
    pending:
      dispatched.pending && dispatched.invocation
        ? mechanicPendingEffect(
            dispatched.invocation,
            dispatched.pending,
            dispatched.continuations,
          )
        : null,
    events: [...own.events, ...dispatched.events],
  };
}

/**
 * Every zone visible to whichever player is choosing, across both players —
 * everywhere a resolve-effect option's instance ID can legitimately be named.
 * A player choosing among these IDs already knows which cards they are, so
 * resolving across hand, board, stage, trash, deck, and leaders is not a
 * hidden-information leak: an option built from the deck exists only because
 * some "look at the top N cards" effect already revealed it (that reveal is
 * what the choice is), and the rest are open outright (hand to its own
 * owner, everything else to both). Life is the one exception, and the one
 * left out here — a card there stays hidden even from its own owner until an
 * effect explicitly turns it face up, so no printed "look" ever grants
 * knowing one blind. `describeCardOption` below is what handles that case.
 */
function findCardByInstanceId(
  state: GameState,
  instanceId: string,
): CardInstance | null {
  for (const playerId of ["p1", "p2"] as const) {
    const player = state.players[playerId];
    // A Leader is not a CardInstance in any zone array — it is one field on
    // the player — but effects name it the same way everything else does:
    // `${playerId}-leader`, per leaderInstanceId above.
    if (instanceId === `${playerId}-leader`) {
      return { instanceId, cardNumber: player.leaderCardNumber };
    }
    const zones: readonly (CardInstance | null)[] = [
      ...player.deck,
      ...player.hand,
      ...player.life.filter((card) => card.faceUp === true),
      ...player.board,
      player.stage,
      ...player.trash,
    ];
    const found = zones.find((card) => card?.instanceId === instanceId);
    if (found) return found;
  }
  return null;
}

/**
 * A resolve-effect option's card, described for display without ever
 * naming a card its own owner has not legitimately seen. Everything
 * `findCardByInstanceId` can resolve is named outright. A face-down Life
 * card — the one exception — is described by position instead: "top" and
 * "bottom" are the only positions any printed effect in this pool picks
 * blindly from, and naming the card here would let the choice itself reveal
 * what the effect's own wording has not yet.
 */
function reactionSourceName(
  reactions: readonly MechanicProgramInvocation[],
  optionId: string,
  db: CardDatabase,
): string {
  const instanceId = optionId.slice("reaction:".length);
  const source = reactions.find(
    (reaction) => reaction.context.source.instanceId === instanceId,
  )?.context.source;
  if (!source) throw new Error(`MISSING_EFFECT_TARGET: ${instanceId}`);
  return `${db.require(source.cardNumber).name} [${source.cardNumber}]`;
}

function describeCardOption(
  state: GameState,
  instanceId: string,
  db: CardDatabase,
): string {
  const visible = findCardByInstanceId(state, instanceId);
  if (visible) return db.require(visible.cardNumber).name;
  for (const playerId of ["p1", "p2"] as const) {
    const life = state.players[playerId].life;
    if (life[0]?.instanceId === instanceId) return "your top Life card";
    if (life.at(-1)?.instanceId === instanceId) return "your bottom Life card";
    if (life.some((card) => card.instanceId === instanceId))
      return "a face-down Life card";
  }
  throw new Error(`MISSING_EFFECT_TARGET: ${instanceId}`);
}

/** `optionId` as the client already unwraps it: the instance ID after any
    `prefix:` a compound option (`top:`, `bottom:`, `search-select:`) adds. */
function rawInstanceId(optionId: string): string {
  return optionId.split(":").at(-1) ?? optionId;
}

interface EffectOption {
  optionId: string;
  summary: string;
  optionCardNumber?: string;
}

/**
 * Every resolve-effect option that names one specific card instance, so the
 * client can render its face rather than a bare ID — not just the branches
 * below that already resolve a name into their summary text, but every
 * option from any effect kind, including ones added after this comment.
 * Individual branches still set `optionCardNumber` themselves where the
 * instance came from a hidden zone the option's own text already reveals
 * (search and navy-search); this only fills in what they left unset.
 */
export function getEffectOptions(
  state: GameState,
  db: CardDatabase = defaultCardDatabase,
): EffectOption[] {
  return computeEffectOptions(state, db).map((option) => {
    const optionCardNumber =
      option.optionCardNumber ??
      findCardByInstanceId(state, rawInstanceId(option.optionId))?.cardNumber;
    return { ...option, ...(optionCardNumber ? { optionCardNumber } : {}) };
  });
}

function computeEffectOptions(
  state: GameState,
  db: CardDatabase = defaultCardDatabase,
): EffectOption[] {
  const effect = state.pendingEffect;
  if (!effect) return [];
  if (effect.kind === "return-don") {
    const remaining = effect.origins.length;
    const ordinal = remaining > 1 ? ` (${remaining} left)` : "";
    return donReturnPools(
      state,
      effect.playerId,
      effect.origins,
      effect.onFieldAtPayment,
    ).map((pool) => {
      const held = donPoolSize(
        state,
        effect.playerId,
        pool,
        effect.onFieldAtPayment,
      );
      // A pool the automatic pick already emptied still has to be offered --
      // it is where the DON!! came from -- so the count it reports is what it
      // held before the cost was paid.
      const available =
        held + effect.origins.filter((origin) => origin === pool).length;
      if (pool === DON_POOL_ACTIVE || pool === DON_POOL_RESTED) {
        const posture = pool === DON_POOL_ACTIVE ? "an active" : "a rested";
        return {
          optionId: `return-don:${pool}`,
          summary: `Return ${posture} DON!! (${available} there)${ordinal}`,
        };
      }
      return {
        optionId: `return-don:${pool}`,
        summary: `Return a DON!! given to ${describeCardOption(state, pool, db)} (${available} given)${ordinal}`,
      };
    });
  }
  if (effect.kind === "character-area-replacement") {
    return effect.eligibleInstanceIds.map((optionId) => ({
      optionId,
      summary: `Trash ${describeCardOption(state, optionId, db)} to make room for ${db.require(effect.card.cardNumber).name}`,
    }));
  }
  if (effect.kind === "p105-life-cost") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Add ${describeCardOption(state, optionId, db)} to hand`,
      })),
      { optionId: "skip", summary: "Skip card effect" },
    ];
  }
  if (effect.kind === "st35-attack-cost") {
    return [
      ...(state.players[effect.playerId].deck.length >= 2
        ? [
            {
              optionId: "apply",
              summary: "Trash 2 cards from the top of your deck",
            },
          ]
        : []),
      { optionId: "skip", summary: "Skip card effect" },
    ];
  }
  if (effect.kind === "reduce-cost") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Reduce ${describeCardOption(state, optionId, db)}'s cost`,
      })),
      { optionId: "skip", summary: "Choose no Character" },
    ];
  }
  /**
   * A `MoveDestination` as the end of a pile, for an offer that has to name which
   * end it means.
   *
   * Only the two positions a split can name are worded; a destination with no
   * `position` is the pile itself. The possessive is left off for
   * `player: "owner"` -- the cards go back to whoever owns them, which for the one
   * clause that prints it (EB02-053) is settled by the branch the player already
   * picked, and "their" would be a guess.
   */

  if (
    effect.kind === "mechanic-choice" &&
    effect.choice.kind === "order-to-bottom"
  ) {
    const choice = effect.choice;
    const { instanceIds } = choice;
    // Named in full rather than one at a time: the option *is* the order, and
    // a summary that said "place a card at the bottom" would leave the only
    // thing being decided out of the sentence a text-only caller reads.
    //
    // The destinations go in too when there are two of them, because then the
    // *end* is what is being decided and the order may not be: EB02-053
    // Myskina Olga places one Life card, so the two options differ in nothing
    // else at all.
    return getMechanicChoiceOptions(state, choice, db).map((optionId) => {
      const order = parseOrderOption(optionId, instanceIds.length) ?? [];
      const names = order.map((index) =>
        describeCardOption(state, instanceIds[index]!, db),
      );
      if (!choice.alternate) {
        // The deck's bottom is the destination almost every ordering clause
        // prints, and `orderSummary`'s default says it. ST-13 puts Life cards
        // back in the Life area, so anything else has to be named -- and named
        // on the offer too, so a caller reordering it re-words the same
        // ending.
        const destination =
          choice.to.zone === "deck" && choice.to.position === "bottom"
            ? undefined
            : describeMoveDestination(choice.to);
        return {
          optionId,
          summary: orderSummary(
            names,
            destination === undefined ? undefined : { primary: destination },
          ),
        };
      }
      return {
        optionId,
        summary: orderSummary(names, {
          primary: describeMoveDestination(choice.to),
          alternate: describeMoveDestination(choice.alternate),
          atPrimary: parseOrderSplit(optionId, names.length) ?? names.length,
        }),
      };
    });
  }
  if (
    effect.kind === "mechanic-choice" &&
    effect.choice.kind === "blind-hand-pick"
  ) {
    // Named by position alone -- see `blind-hand-pick`. The whose-hand half is
    // relative to whoever answers, which is the source player.
    const { instanceIds, targetPlayerId } = effect.choice;
    const whose =
      targetPlayerId === effect.playerId ? "your" : "your opponent's";
    return getMechanicChoiceOptions(state, effect.choice, db).map(
      (optionId, index) => ({
        optionId,
        summary: `Choose face-down card ${index + 1} of ${instanceIds.length} from ${whose} hand`,
      }),
    );
  }
  if (effect.kind === "mechanic-choice") {
    const choice = effect.choice;
    return getMechanicChoiceOptions(state, choice, db).map((optionId) => ({
      optionId,
      summary:
        choice.kind === "choice"
          ? (choice.branches.find((branch) => branch.id === optionId)?.label ??
            optionId)
          : choice.kind === "area-replacement"
            ? `Trash ${describeCardOption(state, optionId, db)} to make room for ${
                db.require(choice.card.cardNumber).name
              }`
            : choice.kind === "rest-opponent-cards"
              ? optionId === "skip"
                ? "Rest no more cards"
                : optionId === "don"
                  ? "Rest 1 opponent DON!!"
                  : `Rest ${describeCardOption(state, optionId, db)}`
              : choice.kind === "return-don-choice"
                ? // The count *is* the decision here, so the summary says what
                  // it costs rather than naming a card: nothing is being
                  // targeted, and a seat planning off these strings needs to
                  // see that two is what switches OP09-061's refund on.
                  `Return ${optionId.slice("return:".length)} DON!! to your DON!! deck`
                : choice.kind === "order-reactions"
                  ? // Named off the reaction rather than the board: a Leader
                    // is in no zone, and the source may have moved since.
                    `Resolve ${reactionSourceName(choice.reactions, optionId, db)}'s effect first`
                  : choice.kind === "give-rested-don"
                    ? optionId === "skip"
                      ? "Give no DON!!"
                      : // OP13-007 gives an *active* DON!! and the given card stays
                        // active, so it buys power for the rest of the turn rather
                        // than parking a spent DON!!. Calling both "rested" told a
                        // reader -- and an LLM seat, which plans off these summaries
                        // -- the opposite of what the card does.
                        `Give 1 ${choice.from === "active" ? "active" : "rested"} DON!! to ${describeCardOption(state, optionId, db)}`
                    : optionId === "apply"
                      ? optionalEffectSummary(
                          effect.sourceCardNumber,
                          choice.kind === "optional"
                            ? choice.effect
                            : undefined,
                          db,
                        )
                      : optionId === "skip" &&
                          choice.kind === "optional" &&
                          !isClauseOpeningOptional(
                            effect.sourceCardNumber,
                            choice.effect,
                          )
                        ? `Skip this step of ${db.require(effect.sourceCardNumber).name} [${effect.sourceCardNumber}]'s effect`
                        : optionId === "skip"
                          ? `Don't apply ${db.require(effect.sourceCardNumber).name} [${effect.sourceCardNumber}]'s effect`
                          : optionId === "done"
                            ? "Choose no more cards"
                            : `Choose ${describeCardOption(state, optionId, db)}`,
    }));
  }
  if (effect.kind === "add-top-deck-to-life") {
    return [
      { optionId: "apply", summary: "Add the top deck card to Life" },
      { optionId: "skip", summary: "Skip card effect" },
    ];
  }
  if (effect.kind === "search-top-five") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => {
        const card = effect.revealed.find(
          (candidate) => candidate.instanceId === optionId,
        );
        if (!card) throw new Error(`MISSING_SEARCH_CARD: ${optionId}`);
        return {
          optionId: `search-select:${optionId}`,
          optionCardNumber: card.cardNumber,
          summary: `Add ${db.require(card.cardNumber).name} to hand`,
        };
      }),
      { optionId: "search-select:skip", summary: "Add no card" },
    ];
  }
  if (effect.kind === "free-play") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => {
        const card = state.players[effect.playerId].hand.find(
          (candidate) => candidate.instanceId === optionId,
        );
        if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
        return {
          optionId,
          summary: `Play ${db.require(card.cardNumber).name} for free`,
        };
      }),
      { optionId: "skip", summary: "Play no card" },
    ];
  }
  if (effect.kind === "navy-discard") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => {
        const card = state.players[effect.playerId].hand.find(
          (candidate) => candidate.instanceId === optionId,
        );
        if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
        return {
          optionId,
          summary: `Trash ${db.require(card.cardNumber).name}`,
        };
      }),
      ...(effect.optional
        ? [{ optionId: "skip", summary: "Skip card effect" }]
        : []),
    ];
  }
  if (effect.kind === "hand-trash-replacement") {
    return effect.eligibleInstanceIds.map((optionId) => {
      const card = state.players[effect.playerId].hand.find(
        (candidate) => candidate.instanceId === optionId,
      );
      if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
      return {
        optionId,
        summary: `Trash ${db.require(card.cardNumber).name}`,
      };
    });
  }
  if (
    effect.kind === "bottom-deck-character" ||
    effect.kind === "prevent-attack"
  ) {
    return [
      ...effect.eligibleInstanceIds
        .filter((optionId) => {
          // Placing a Character at the bottom of the deck removes it from the
          // field, so text that reads "[printed text omitted -- pnpm card:text <card>]" applies here too, not only to K.O. Preventing an
          // attack is not removal and is unaffected.
          if (effect.kind !== "bottom-deck-character") return true;
          const target = state.players[effect.targetPlayerId].board.find(
            (card) => card.instanceId === optionId,
          );
          return (
            !target ||
            !isRemovalImmune(
              state,
              effect.targetPlayerId,
              target,
              effect.playerId,
              undefined,
              db,
              "off-field",
            )
          );
        })
        .map((optionId) => ({
          optionId,
          summary:
            effect.kind === "bottom-deck-character"
              ? `Place ${describeCardOption(state, optionId, db)} at the bottom of its owner's deck`
              : `Prevent ${describeCardOption(state, optionId, db)} from attacking`,
        })),
      { optionId: "skip", summary: "Choose no more Characters" },
    ];
  }
  if (effect.kind === "battle-ko-replacement") {
    return [
      ...(effect.lifeProtection === false
        ? []
        : [
            {
              optionId: "apply",
              summary:
                "Add the top Life card to your hand instead of losing this Character",
            },
          ]),
      ...(effect.mechanicOptions ?? []),
      { optionId: "skip", summary: "Let the Character be K.O.'d" },
    ];
  }
  if (effect.kind === "opponent-discard") {
    return effect.eligibleInstanceIds.map((optionId) => {
      const card = state.players[effect.playerId].hand.find(
        (candidate) => candidate.instanceId === optionId,
      );
      if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
      return {
        optionId,
        summary: `Trash ${db.require(card.cardNumber).name}`,
      };
    });
  }
  if (effect.kind === "navy-search") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => {
        const card = effect.revealed.find(
          (candidate) => candidate.instanceId === optionId,
        );
        if (!card) throw new Error(`MISSING_SEARCH_CARD: ${optionId}`);
        return {
          optionId,
          optionCardNumber: card.cardNumber,
          summary: `Add ${db.require(card.cardNumber).name} to hand`,
        };
      }),
      { optionId: "skip", summary: "Choose no more cards" },
    ];
  }
  if (effect.kind === "free-play-rested") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => {
        const card = state.players[effect.playerId].hand.find(
          (candidate) => candidate.instanceId === optionId,
        );
        if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
        return {
          optionId,
          summary: `Play ${db.require(card.cardNumber).name} rested`,
        };
      }),
      { optionId: "skip", summary: "Play no card" },
    ];
  }
  if (
    effect.kind === "discard-for-life" ||
    effect.kind === "discard-supernova-draw-two"
  ) {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => {
        const card = state.players[effect.playerId].hand.find(
          (candidate) => candidate.instanceId === optionId,
        );
        if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
        return {
          optionId,
          summary: `Trash ${db.require(card.cardNumber).name}`,
        };
      }),
      { optionId: "skip", summary: "Skip card effect" },
    ];
  }
  if (effect.kind === "bege-life-swap") {
    if (effect.stage === "take-life") {
      return [
        { optionId: "top", summary: "Take the top Life card" },
        ...(state.players[effect.playerId].life.length > 1
          ? [{ optionId: "bottom", summary: "Take the bottom Life card" }]
          : []),
        { optionId: "skip", summary: "Skip card effect" },
      ];
    }
    return [
      ...effect.eligibleInstanceIds.map((optionId) => {
        const card = state.players[effect.playerId].hand.find(
          (candidate) => candidate.instanceId === optionId,
        );
        if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
        return {
          optionId,
          summary: `Place ${db.require(card.cardNumber).name} on Life face-up`,
        };
      }),
      { optionId: "skip", summary: "Place no card" },
    ];
  }
  if (effect.kind === "move-character-to-life") {
    return [
      // Moving a Character into Life takes it off the field, so removal immunity
      // applies here as well.
      ...effect.eligibleInstanceIds
        .filter((optionId) => {
          const target = state.players[effect.targetPlayerId].board.find(
            (card) => card.instanceId === optionId,
          );
          return (
            !target ||
            !isRemovalImmune(
              state,
              effect.targetPlayerId,
              target,
              effect.playerId,
              undefined,
              db,
              "off-field",
            )
          );
        })
        .flatMap((optionId) => [
          {
            optionId: `top:${optionId}`,
            summary: `Move ${describeCardOption(state, optionId, db)} to the top of Life face-up`,
          },
          {
            optionId: `bottom:${optionId}`,
            summary: `Move ${describeCardOption(state, optionId, db)} to the bottom of Life face-up`,
          },
        ]),
      { optionId: "skip", summary: "Move no Character" },
    ];
  }
  if (effect.kind === "trash-opponent-life") {
    return [
      { optionId: "apply", summary: "Trash the top Life card" },
      { optionId: "skip", summary: "Trash no Life card" },
    ];
  }
  if (effect.kind === "kid-leader-end-turn") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Set ${describeCardOption(state, optionId, db)} active and give it Blocker`,
      })),
      { optionId: "skip", summary: "Skip Leader effect" },
    ];
  }
  if (effect.kind === "borsalino-end-turn") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `DON!! −2: set ${describeCardOption(state, optionId, db)} active and give it Blocker`,
      })),
      { optionId: "skip", summary: "Skip Borsalino effect" },
    ];
  }
  if (effect.kind === "reduce-power") {
    const amount = effect.applyAllAtOnce
      ? effect.amount * effect.remaining
      : effect.amount;
    return [
      ...state.players[effect.targetPlayerId].board.map((card) => ({
        optionId: card.instanceId,
        summary: `Give ${db.require(card.cardNumber).name} ${amount} power`,
      })),
      { optionId: "skip", summary: "Stop reducing power" },
    ];
  }
  if (effect.kind === "give-rested-don") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Give rested DON!! to ${optionId.endsWith("-leader") ? "Leader" : db.require(state.players[effect.playerId].board.find((card) => card.instanceId === optionId)!.cardNumber).name}`,
      })),
      { optionId: "skip", summary: "Give no DON!!" },
    ];
  }
  if (effect.kind === "gatling-gun") {
    if (effect.stage === "give-don") {
      return [
        ...effect.eligibleInstanceIds.map((optionId) => {
          const name =
            optionId === leaderInstanceId(effect.playerId)
              ? db.require(state.players[effect.playerId].leaderCardNumber).name
              : db.require(
                  state.players[effect.playerId].board.find(
                    (card) => card.instanceId === optionId,
                  )!.cardNumber,
                ).name;
          return {
            optionId,
            summary: `Give 1 rested DON!! to ${name}`,
          };
        }),
        { optionId: "skip", summary: "Give no DON!!" },
      ];
    }
    return [
      ...effect.eligibleInstanceIds.map((optionId) => {
        const target = state.players[opponentOf(effect.playerId)].board.find(
          (card) => card.instanceId === optionId,
        );
        if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
        return {
          optionId,
          summary: `Give ${db.require(target.cardNumber).name} -2000 power this turn`,
        };
      }),
      { optionId: "skip", summary: "Reduce no Character's power" },
    ];
  }
  if (effect.kind === "bad-manners-counter") {
    const seenCardNumbers = new Set<string>();
    return effect.eligibleInstanceIds.flatMap((optionId) => {
      const card = state.players[effect.playerId].hand.find(
        (candidate) => candidate.instanceId === optionId,
      );
      if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
      if (seenCardNumbers.has(card.cardNumber)) return [];
      seenCardNumbers.add(card.cardNumber);
      const definition = db.require(card.cardNumber);
      return [
        {
          optionId,
          summary: `Trash ${definition.name} [${definition.cardNumber}]`,
        },
      ];
    });
  }
  if (effect.kind === "draw-trash") {
    return state.players[effect.playerId].hand.map((card) => ({
      optionId: card.instanceId,
      summary: `Trash ${db.require(card.cardNumber).name}`,
    }));
  }
  if (effect.kind === "kinemon-cost") {
    const player = state.players[effect.playerId];
    return [
      ...(!player.leaderRested
        ? [{ optionId: "leader", summary: "Rest your Leader" }]
        : []),
      ...(player.activeDon.length > 0
        ? [{ optionId: "don", summary: "Rest 1 DON!!" }]
        : []),
      { optionId: "skip", summary: "Skip card effect" },
    ];
  }
  if (effect.kind === "prevent-rest") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Prevent ${describeCardOption(state, optionId, db)} from being rested`,
      })),
      { optionId: "skip", summary: "Skip card effect" },
    ];
  }
  if (effect.kind === "rest-opponent-card") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Rest ${db.require(state.players[effect.targetPlayerId].board.find((card) => card.instanceId === optionId)!.cardNumber).name}`,
      })),
      ...(state.players[effect.targetPlayerId].activeDon.length > 0
        ? [{ optionId: "don", summary: "Rest 1 opponent DON!!" }]
        : []),
      { optionId: "skip", summary: "Rest no more cards" },
    ];
  }
  if (effect.kind === "prevent-refresh") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Prevent ${db.require(state.players[effect.targetPlayerId].board.find((card) => card.instanceId === optionId)!.cardNumber).name} from becoming active`,
      })),
      { optionId: "skip", summary: "Choose no more Characters" },
    ];
  }
  if (effect.kind === "st34-discard") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Trash ${db.require(state.players[effect.playerId].hand.find((card) => card.instanceId === optionId)!.cardNumber).name}`,
      })),
      { optionId: "skip", summary: "Skip card effect" },
    ];
  }
  if (effect.kind === "st34-guess-cost") {
    return Array.from({ length: 11 }, (_, cost) => ({
      optionId: `cost:${cost}`,
      summary: `Choose cost ${cost}`,
    }));
  }
  if (effect.kind === "set-base-power-zero") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Set ${describeCardOption(state, optionId, db)}'s base power to 0`,
      })),
      { optionId: "skip", summary: "Choose no Character" },
    ];
  }
  if (effect.kind === "st34-don-minus-ko") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Return 1 DON!! and K.O. ${describeCardOption(state, optionId, db)}`,
      })),
      { optionId: "skip", summary: "Skip card effect" },
    ];
  }
  if (effect.kind === "katakuri-leader") {
    return [
      { optionId: "apply", summary: "Return 1 DON!! and gain +1000 power" },
      { optionId: "skip", summary: "Skip Leader effect" },
    ];
  }
  if (effect.kind === "nami-leader") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Trash ${describeCardOption(state, optionId, db)} to give this Leader +2000 power`,
      })),
      { optionId: "skip", summary: "Skip Leader effect" },
    ];
  }
  if (effect.kind === "st34-power-boost") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Give ${describeCardOption(state, optionId, db)} +2000 power`,
      })),
      { optionId: "skip", summary: "Choose no Katakuri" },
    ];
  }
  if (effect.kind === "return-own-for-free-play") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Return ${db.require(state.players[effect.playerId].board.find((card) => card.instanceId === optionId)!.cardNumber).name} to hand`,
      })),
      { optionId: "skip", summary: "Skip card effect" },
    ];
  }
  if (effect.kind === "grant-prisoner-blocker") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Give ${describeCardOption(state, optionId, db)} Blocker for this turn`,
      })),
      { optionId: "skip", summary: "Give no card Blocker" },
    ];
  }
  if (effect.kind === "replacement-choice") {
    return [
      ...effect.options,
      {
        optionId: "skip",
        summary: `Allow ${
          db.require(
            state.players[effect.playerId].board.find(
              (card) => card.instanceId === effect.targetInstanceId,
            )?.cardNumber ?? effect.sourceCardNumber,
          ).name
        } to be K.O.'d`,
      },
    ];
  }
  if (effect.kind === "slave-arrow-cost") {
    return [
      ...effect.eligibleInstanceIds.map((optionId) => ({
        optionId,
        summary: `Return ${db.require(state.players[effect.playerId].board.find((card) => card.instanceId === optionId)!.cardNumber).name} to hand for +${effect.power} power`,
      })),
      { optionId: "skip", summary: "Pay no cost, so Slave Arrow adds nothing" },
    ];
  }
  const targetPlayer = state.players[effect.targetPlayerId];
  return [
    ...effect.eligibleInstanceIds.flatMap((optionId) => {
      const target = targetPlayer.board.find(
        (card) => card.instanceId === optionId,
      );
      if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
      // A Character that cannot be removed by the opponent's effects is not
      // offered as a K.O. target. Every bespoke K.O. effect in the engine builds
      // its own eligibility list, so this is the one place all of them pass
      // through; resting is unaffected, as the printed text only covers removal.
      if (
        effect.kind === "ko-character" &&
        isRemovalImmune(state, effect.targetPlayerId, target, effect.playerId)
      ) {
        return [];
      }
      // Replacement options are deliberately not offered here. They belong to
      // the target's controller, and `resolveEffect` hands the decision over in
      // a second step once this player has picked the target.
      return [
        {
          optionId,
          summary:
            effect.kind === "ko-character"
              ? `K.O. ${db.require(target.cardNumber).name}`
              : `Rest ${db.require(target.cardNumber).name}`,
        },
      ];
    }),
    { optionId: "skip", summary: "Skip card effect" },
  ];
}

/**
 * Kinds whose resolver runs with `state.pendingEffect` still set.
 *
 * Every one of them suspends again -- an optional cost to accept, a replacement
 * to choose, the mechanic DSL's own pending choice -- and reads or rewrites the
 * effect it is amending.
 */
const KEEPS_EFFECT_PENDING: ReadonlySet<PendingEffect["kind"]> = new Set([
  "character-area-replacement",
  "p105-life-cost",
  "st35-attack-cost",
  "reduce-cost",
  "replacement-choice",
  "mechanic-choice",
  "return-own-for-free-play",
  "slave-arrow-cost",
  "grant-prisoner-blocker",
  "rest-opponent-card",
  "prevent-refresh",
]);

export function resolveEffect(
  state: GameState,
  optionId: string,
  db: CardDatabase = defaultCardDatabase,
): PublicEvent[] {
  const effect = state.pendingEffect;
  if (!effect) throw new Error("NO_PENDING_EFFECT");
  // Answering an effect ends it, unless its resolver is one of the few that
  // runs with it still pending -- because it suspends again for a second
  // question (a cost, a replacement, the mechanic DSL's own choice) and needs
  // the effect it is amending to still be there. A resolver that chains to a
  // *different* effect assigns `state.pendingEffect` itself.
  //
  // This used to be positional: a bare `state.pendingEffect = null` sat between
  // the eleventh and twelfth branches of the chain, so whether an effect stayed
  // pending depended on where its branch happened to be written, and nothing
  // said so. Naming the set is the same rule, stated.
  if (!KEEPS_EFFECT_PENDING.has(effect.kind)) state.pendingEffect = null;
  // Dispatch by kind rather than a chain of forty-five `if`s: the table is
  // keyed by every member of `PendingEffect`, so a new kind without a
  // resolver is a compile error instead of an effect that resolves to
  // nothing. The cast is the correlated-union limitation -- TS cannot see
  // that the resolver picked by `effect.kind` is the one whose parameter
  // matches this `effect`, though the table's type guarantees it.
  const resolve = EFFECT_RESOLVERS[effect.kind] as EffectResolver<
    PendingEffect["kind"]
  >;
  return resolve({ state, effect, optionId, db });
}
