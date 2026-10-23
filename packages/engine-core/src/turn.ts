/**
 * The turn: the Refresh, Draw and DON!! steps that open one, ending one, and
 * handing over to the next.
 *
 * Split out of `engine.ts` so the action handlers can reach it without
 * importing the module that dispatches them; see `board.ts`.
 */
import { callTimeIfDue, endOnTimeIfDue } from "./time-limit.js";
import {
  cards as defaultCardDatabase,
  type CardDatabase,
} from "@one-piece-sim/cards";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import {
  dispatchMechanicSignals,
  getOnEndOfYourTurnMechanicProgram,
  getOnStartOfYourTurnMechanicProgram,
} from "./card-mechanics.js";
import {
  clearExpiredNegations,
  donPhaseGivesLeaderDon,
  effectsNegated,
  leaderEffectsNegated,
  refreshBlocked,
} from "./static-abilities.js";
import {
  addDonFromDeck,
  donReturnHasChoice,
  fieldDonIds,
  fieldDonCount,
  returnDonToDeck,
} from "./don.js";

import {
  createOnEndOfYourTurnResult,
  runEndOfTurnProgram,
  createOnStartOfYourTurnResult,
  mechanicPendingEffect,
} from "./effects.js";
import { withoutBasePowerSetters } from "./base-power.js";
import type { MechanicSignal } from "./mechanics.js";
import type { GameState, PlayerState } from "./model.js";
import {
  opponentOf,
  leaderInstanceId,
  survivesEmptyDeck,
  winsOnEmptyDeck,
} from "./board.js";

/**
 * Sets a player's rested DON!! active for their Refresh Phase, less any that an
 * effect has held back -- OP10-033 Nami's "[printed text omitted -- pnpm card:text OP10-033]".
 *
 * The held DON!! stays rested and the hold is spent here, so it can never reach
 * a second turn. Written once because the refresh happens in two places: the
 * ordinary draw, and the OP15-022 Brook path that survives an empty deck.
 */
export function activateRestedDonForRefresh(player: PlayerState): void {
  const held = player.donHeldFromRefresh ?? 0;
  delete player.donHeldFromRefresh;
  player.activeDon.push(
    ...player.restedDon.splice(0, player.restedDon.length - held),
  );
}

export function drawForTurn(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): PublicEvent[] {
  const player = state.players[playerId];
  // Two things hold a rested Character down through its Refresh Phase: a
  // turn-scoped `cannot-refresh` an effect wrote onto it, and a continuous
  // clause read off the table -- OP05-040 Birdcage's "all Characters with a
  // cost of 5 or less do not become active in your and your opponent's Refresh
  // Phases", which is live for as long as the Stage is and so cannot be a flag.
  const staysRested = (card: (typeof player.board)[number]): boolean =>
    (card.cannotRefreshUntilTurn ?? -1) >= state.turn ||
    refreshBlocked(state, playerId, card, db);
  const refreshed = player.board
    .filter((card) => card.rested && !staysRested(card))
    .map((card) => card.instanceId);
  // OP07-059 Foxy's Leader holds the other Leader down through one Refresh
  // Phase. Read here rather than folded into the board loop below because a
  // Leader is in no zone: the flag is on the player.
  if ((player.leaderCannotRefreshUntilTurn ?? -1) < state.turn) {
    player.leaderRested = false;
  }
  if (player.stage) player.stage.rested = false;
  player.activeDon.push(...player.leaderAttachedDon.splice(0));
  for (const boardCard of player.board) {
    if (!staysRested(boardCard)) boardCard.rested = false;
    player.activeDon.push(...(boardCard.attachedDon ?? []).splice(0));
  }
  const card = player.deck.shift();
  if (!card) {
    // OP15-022 Brook: "[printed text omitted -- pnpm card:text OP15-022]" The draw simply draws nothing; the loss is deferred to
    // the end of the turn, in `completeEndTurn`.
    if (survivesEmptyDeck(state, playerId)) {
      activateRestedDonForRefresh(player);
      const donForTurn = state.turn === 2 ? 1 : 2;
      const given = placeDonForTurn(state, playerId, donForTurn, db);
      return [
        ...(refreshed.length === 0
          ? []
          : [
              {
                type: "characters-refreshed" as const,
                playerId,
                cardInstanceIds: refreshed,
              },
            ]),
        ...given,
      ];
    }
    // P-117 Nami reads the same empty deck the other way round. Checked here
    // rather than deferred the way `survivesEmptyDeck` is: that clause says the
    // player does not lose *yet*, and this one says they have already won, so
    // there is nothing to wait for.
    const winner = winsOnEmptyDeck(state, playerId)
      ? playerId
      : opponentOf(playerId);
    state.phase = "finished";
    state.winner = winner;
    state.resultReason = "deck-exhaustion";
    return [{ type: "game-ended", winner, reason: "deck-exhaustion" }];
  }
  player.hand.push(card);
  activateRestedDonForRefresh(player);
  const donToDraw = state.turn === 2 ? 1 : 2;
  const given = placeDonForTurn(state, playerId, donToDraw, db);
  // "…rests N of their active DON!! cards at the start of their next Main
  // Phase" (PRB02-005). Read here, after the refresh and the turn's new DON!!,
  // because that pool is what the printed timing names -- holding it back at
  // the refresh instead would cap the clause at whatever happened to be rested
  // when it resolved, which is the turn before.
  const restedAtMain = Math.min(
    player.donRestedAtNextMain ?? 0,
    player.activeDon.length,
  );
  delete player.donRestedAtNextMain;
  player.restedDon.push(...player.activeDon.splice(0, restedAtMain));
  return [
    ...(refreshed.length === 0
      ? []
      : [
          {
            type: "characters-refreshed" as const,
            playerId,
            cardInstanceIds: refreshed,
          },
        ]),
    ...given,
  ];
}

/**
 * The DON!! Phase: `count` DON!! from the DON!! deck onto the field, active.
 *
 * OP13-003 Gol.D.Roger's Leader takes one of them instead, when the field held
 * any DON!! before the phase placed these. That test is read first because
 * afterwards the field is never empty, and Bandai's own write-up of the deck
 * reads it the same way: the player who goes second has no DON!! on turn 2 and
 * keeps both, and every later turn gives one up.
 */
function placeDonForTurn(
  state: GameState,
  playerId: PlayerId,
  count: number,
  db: CardDatabase,
): PublicEvent[] {
  const player = state.players[playerId];
  // Both players start the game with one DON!! active (`createGame`), which
  // for the player going second is the first of their turn-2 DON!! Phase
  // rather than a DON!! that was already there. So on turn 2 it is not
  // counted, and a second player's first phase gives nothing up.
  const preplaced = state.turn === 2 ? 1 : 0;
  const hadDon = fieldDonCount(state, playerId) - preplaced > 0;
  const placed = player.donDeck.splice(0, count);
  const [toLeader, ...rest] = placed;
  if (!toLeader || !hadDon || !donPhaseGivesLeaderDon(state, playerId, db)) {
    player.activeDon.push(...placed);
    return [];
  }
  player.activeDon.push(...rest);
  player.leaderAttachedDon.push(toLeader);
  return [
    {
      type: "don-attached",
      playerId,
      targetInstanceId: leaderInstanceId(playerId),
      count: 1,
      sourceCardNumber: player.leaderCardNumber,
    },
  ];
}

export function completeEndTurn(state: GameState, events: PublicEvent[]): void {
  // The turn that is ending belongs to the turn player, which is not always who
  // is acting: an end-of-turn effect can hand the decision across the table --
  // OP16-073 Borsalino's is one -- and finish the turn from there. Reading
  // `activePlayer` here handed the next turn to the wrong seat in exactly those
  // positions.
  const activePlayer = state.turnPlayerId;
  const endingPlayer = state.players[activePlayer];
  const activateCount = Math.min(
    endingPlayer.activateDonAtEndOfTurn,
    endingPlayer.restedDon.length,
  );
  endingPlayer.activeDon.push(
    ...endingPlayer.restedDon.splice(0, activateCount),
  );
  endingPlayer.activateDonAtEndOfTurn = 0;
  // "Add up to N DON!! cards from your DON!! deck ... at the end of this turn"
  // (OP13-066 Silvers Rayleigh). Booked earlier in the turn and paid here, next
  // to the un-rest above, so the DON!! arrives after the turn's spending.
  if (endingPlayer.addDonAtEndOfTurn) {
    addDonFromDeck(
      state,
      activePlayer,
      endingPlayer.addDonAtEndOfTurn,
      "active",
    );
    delete endingPlayer.addDonAtEndOfTurn;
  }
  // Debts an earlier clause booked against particular cards -- OP11-107's
  // "[printed text omitted -- pnpm card:text OP11-107]". Paid here, and dropped rather than carried: a debt
  // whose card has already left the field is simply forgotten, which is what
  // "that Character" means once there is no such Character.
  for (const owed of endingPlayer.endOfTurnCardActions ?? []) {
    if (owed.turn !== state.turn) continue;
    const card = endingPlayer.board.find(
      (candidate) => candidate.instanceId === owed.instanceId,
    );
    if (card) card.rested = false;
  }
  delete endingPlayer.endOfTurnCardActions;
  // A booked step `endTurn` did not reach -- one made for a turn that has
  // passed. Dropped so two otherwise identical positions do not hash apart.
  delete endingPlayer.endOfTurnPrograms;
  // OP08-101 Charlotte Angel's booked Life card, paid before the DON!! is
  // squared up below so the two orders of the same turn's bookings stay the
  // order the cards are printed in: the Life card comes off the deck first,
  // and Black Maria's DON!! goes back after it.
  for (const owed of endingPlayer.endOfTurnLifeFromDeck ?? []) {
    if (owed.turn !== state.turn) continue;
    for (let paid = 0; paid < owed.count; paid += 1) {
      const card = endingPlayer.deck.shift();
      // An empty deck simply pays nothing: losing on an empty deck is the draw
      // step's rule, and this clause is not a draw.
      if (!card) break;
      endingPlayer.life.unshift({
        instanceId: card.instanceId,
        cardNumber: card.cardNumber,
      });
      events.push({
        type: "card-moved",
        playerId: activePlayer,
        cardInstanceId: card.instanceId,
        cardNumber: card.cardNumber,
        from: "deck",
        to: "life",
        position: "top",
      });
    }
  }
  delete endingPlayer.endOfTurnLifeFromDeck;
  // A booking `endTurn` did not reach -- one made for a turn that has passed.
  // Dropped so that two otherwise identical positions do not hash apart.
  delete endingPlayer.endOfTurnDonEqualize;
  // An unspent play discount dies with the turn that granted it. `playCostFromHand`
  // already checks the turn, so this is about state rather than pricing: leaving
  // the field behind would make two otherwise identical positions hash apart.
  delete endingPlayer.playDiscount;
  clearExpiredNegations(state);
  for (const player of Object.values(state.players)) {
    player.leaderPowerModifiers = player.leaderPowerModifiers.filter(
      (modifier) => modifier.expiresAtTurn > state.turn,
    );
    // Dropped rather than left to expire by comparison, for the same reason the
    // spent play discount is: `storedBasePower` already ignores a stale setter,
    // so keeping one would only make two identical positions hash apart. Only
    // the lapsed ones go -- a lower setter that outlasts a higher one is the
    // base the card falls back to (rule 4-9-2-1).
    const leaderBasePowers = withoutBasePowerSetters(
      player.leaderBasePowers,
      (setter) => setter.expiresAtTurn <= state.turn,
    );
    if (leaderBasePowers) player.leaderBasePowers = leaderBasePowers;
    else delete player.leaderBasePowers;
    for (const card of player.board) {
      const basePowerOverrides = withoutBasePowerSetters(
        card.basePowerOverrides,
        (setter) => setter.expiresAtTurn <= state.turn,
      );
      if (basePowerOverrides) card.basePowerOverrides = basePowerOverrides;
      else delete card.basePowerOverrides;
      card.powerModifiers = (card.powerModifiers ?? []).filter(
        (modifier) => modifier.expiresAtTurn > state.turn,
      );
      card.costModifiers = (card.costModifiers ?? []).filter(
        (modifier) => modifier.expiresAtTurn > state.turn,
      );
    }
  }
  // OP15-022 Brook's other half: "[printed text omitted -- pnpm card:text OP15-022]" Checked here, at the end of every turn, because the
  // deck can empty on either player's -- Brook mills its own on its turn, and an
  // opponent's mill empties it on theirs. Both players are checked so a mirror
  // resolves, and the survivor wins.
  const decked = (["p1", "p2"] as const).filter(
    (playerId) =>
      (state.players[playerId].deck.length === 0 ||
        state.players[playerId].deckEmptiedOnTurn === state.turn) &&
      survivesEmptyDeck(state, playerId),
  );
  if (decked.length > 0) {
    // A simultaneous double deck-out is a draw under the comprehensive rules
    // and the protocol has no way to say so, so the player whose turn just
    // ended is the one who loses: they are the one who chose to end there.
    const loser = decked.includes(activePlayer) ? activePlayer : decked[0]!;
    const winner = opponentOf(loser);
    state.phase = "finished";
    state.winner = winner;
    state.resultReason = "deck-exhaustion";
    events.push({ type: "game-ended", winner, reason: "deck-exhaustion" });
    return;
  }
  // The third turn after time was called ends the game (§8.2). After the
  // deck-out check, because a game the rules have already decided is not
  // "not finished" and goes to no procedure.
  if (endOnTimeIfDue(state, events)) return;
  // "Take an extra turn after this one" (OP05-119): the next turn goes back to
  // the seat that booked it, and the booking is spent. Everything else about
  // the handover is the ordinary one -- the same Refresh, Draw and DON!! steps,
  // and `turn` still advances, so every `${turn}:` once-per-turn key and every
  // "until the end of your next turn" expiry reads the extra turn as a turn.
  const extra = endingPlayer.extraTurns ?? 0;
  const nextPlayerId = extra > 0 ? activePlayer : opponentOf(activePlayer);
  if (extra > 0) {
    if (extra === 1) delete endingPlayer.extraTurns;
    else endingPlayer.extraTurns = extra - 1;
  }
  state.activePlayer = nextPlayerId;
  state.turnPlayerId = nextPlayerId;
  state.turn += 1;
  pruneOncePerTurn(state);
  events.push({ type: "turn-ended", playerId: activePlayer, nextPlayerId });
  callTimeIfDue(state, events);
  if (askStartOfTurn(state, nextPlayerId, events)) return;
  events.push(...drawForTurn(state, nextPlayerId));
}

/**
 * Runs the new turn player's Leader's start-of-turn program, if it has one,
 * before the Refresh Phase. Returns whether it ran: the turn is then suspended,
 * and {@link resumeStartOfTurn} finishes it at the end of the action that
 * leaves nothing to answer -- this one, when the program asked nothing.
 *
 * Before the Refresh rather than after the draw because that is where the
 * comprehensive rules resolve "at the start of your turn" effects -- so a
 * DON!! still given to a card from last turn is on the field and counts, and
 * the turn's own DON!! Phase has not added any yet.
 */
function askStartOfTurn(
  state: GameState,
  playerId: PlayerId,
  events: PublicEvent[],
): boolean {
  const leader = state.players[playerId].leaderCardNumber;
  if (
    !getOnStartOfYourTurnMechanicProgram(leader) ||
    leaderEffectsNegated(state, playerId)
  ) {
    return false;
  }
  const result = createOnStartOfYourTurnResult(state, playerId, {
    instanceId: leaderInstanceId(playerId),
    cardNumber: leader,
  });
  events.push(...result.events);
  state.startOfTurnSuspended = true;
  if (result.pending) {
    state.pendingEffect = result.pending;
    state.activePlayer = result.pending.playerId;
  }
  return true;
}

/**
 * The Refresh, Draw and DON!! steps a start-of-turn program was run ahead of,
 * once nothing it started is left to answer.
 *
 * Asked at the end of every action rather than by the handler of any one kind
 * of answer: the program can stop on its own picks, on a `DON!! −N` return
 * choice, on a replacement offer or on the opponent's Trigger, and the action
 * that settles the last of them is the one that resumes the turn.
 */
export function resumeStartOfTurn(
  state: GameState,
  events: PublicEvent[],
): void {
  if (!state.startOfTurnSuspended) return;
  if (state.phase !== "finished") {
    if (state.pendingEffect || state.pendingTrigger || state.donReturn) return;
    state.activePlayer = state.turnPlayerId;
    events.push(...drawForTurn(state, state.turnPlayerId));
  }
  delete state.startOfTurnSuspended;
}

/**
 * Drop the once-per-turn marks that can no longer match anything.
 *
 * Every key in `oncePerTurn` is written `${turn}:...` and every lookup asks
 * about `state.turn`, so a mark from an earlier turn is unreachable the moment
 * the turn advances. Nothing was dropping them, so the list grew for the whole
 * game -- and it is cloned on every transition, hashed in every observation,
 * and scanned linearly by the thirty-odd `includes` calls that gate an
 * ability. By the late turns of a long game that is a few hundred dead strings
 * carried through every action.
 *
 * A key whose first segment is not a turn number is kept, whatever it is. That
 * is not a case the engine has today -- the rule holds for all thirty-four
 * sites that write one -- but it makes this prune safe for a key that does not
 * follow the convention rather than silently dropping it.
 */
function pruneOncePerTurn(state: GameState): void {
  state.oncePerTurn = state.oncePerTurn.filter((key) => {
    const stamped = /^(\d+):/.exec(key);
    return stamped === null || Number(stamped[1]) >= state.turn;
  });
}

/**
 * OP08-074 Black Maria's borrowed DON!!, handed back down to the opponent's
 * field count. Read now rather than when the clause resolved, because
 * everything the turn spent it on has already happened.
 *
 * Paid whether or not Black Maria is still on the field -- the booking is the
 * player's, and Bandai's OP-08 Q&A says the DON!! still go back after she is
 * removed. And paid here, inside `endTurn`, rather than in `completeEndTurn`:
 * the return is a return like any other, so "when a DON!! card on your field
 * is returned to your DON!! deck" answers it (the same Q&A, and OP09-061's),
 * and those reactions can stop for a choice, which only `endTurn` can wait on.
 * The booking is cleared before anything is dispatched, so re-entering after
 * that choice does not pay it twice.
 *
 * Returns whether a reaction is now waiting on a decision.
 */
function payDonEqualize(
  state: GameState,
  playerId: PlayerId,
  events: PublicEvent[],
  db: CardDatabase,
): boolean {
  const player = state.players[playerId];
  const owed = (player.endOfTurnDonEqualize ?? []).filter(
    (booking) => booking.turn === state.turn,
  );
  delete player.endOfTurnDonEqualize;
  const signals: MechanicSignal[] = [];
  for (const booking of owed) {
    const excess =
      fieldDonCount(state, playerId) -
      fieldDonCount(state, opponentOf(playerId));
    if (excess <= 0) continue;
    const returned = returnDonToDeck(
      state,
      playerId,
      excess,
      {
        cardNumber: booking.sourceCardNumber,
        instanceId: booking.sourceInstanceId,
      },
      events,
    );
    if (returned > 0) {
      signals.push({ kind: "don-returned", playerId, count: returned });
    }
  }
  if (signals.length === 0) return false;
  const dispatched = dispatchMechanicSignals(state, signals, db);
  events.push(...dispatched.events);
  if (!dispatched.pending || !dispatched.invocation) return false;
  state.pendingEffect = mechanicPendingEffect(
    dispatched.invocation,
    dispatched.pending,
    dispatched.continuations,
    true,
  );
  return true;
}

export function endTurn(
  state: GameState,
  events: PublicEvent[],
  db: CardDatabase = defaultCardDatabase,
): void {
  // The turn being ended is the turn player's, and it is re-entered after each
  // end-of-turn choice -- which may have been the opponent's to answer
  // (OP17-047 Shiki has them pick their own card), so control comes back to
  // the turn player here before the next card is asked.
  const playerId = state.turnPlayerId;
  state.activePlayer = playerId;
  const player = state.players[playerId];
  if (payDonEqualize(state, playerId, events, db)) return;
  if (
    player.leaderCardNumber === "OP10-099" &&
    !leaderEffectsNegated(state, playerId) &&
    player.life.length > 0 &&
    player.life[0]?.faceUp !== true
  ) {
    const eligibleInstanceIds = player.board
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          definition.types.includes("Supernovas") &&
          definition.cost !== null &&
          definition.cost >= 3 &&
          definition.cost <= 8
        );
      })
      .map((card) => card.instanceId);
    if (eligibleInstanceIds.length > 0) {
      state.pendingEffect = {
        kind: "kid-leader-end-turn",
        playerId,
        sourceCardNumber: "OP10-099",
        sourceInstanceId: leaderInstanceId(playerId),
        eligibleInstanceIds,
      };
      return;
    }
  }
  // OP14-031 Nami's booked DON!! refund, paid before the `[End of Your Turn]`
  // registry so a card that reads its controller's DON!! at end of turn sees
  // the refunded pile. Only this turn's bookings pay out, and the list is
  // dropped either way -- a booking whose turn has passed was made by a Nami
  // that has since been answered mid-turn, and nothing should carry it over.
  if (state.endOfTurnDonActivation) {
    for (const booking of state.endOfTurnDonActivation) {
      if (booking.turn !== state.turn || booking.playerId !== playerId)
        continue;
      const booked = state.players[booking.playerId];
      booked.activeDon.push(...booked.restedDon.splice(0, booking.count));
    }
    delete state.endOfTurnDonActivation;
  }
  // Steps a clause booked for the end of this turn (OP06-006 Saga's price),
  // one at a time and re-entered after each, like the registry below.
  const booked = player.endOfTurnPrograms?.find(
    (booking) => booking.turn === state.turn,
  );
  if (booked) {
    player.endOfTurnPrograms = player.endOfTurnPrograms!.filter(
      (booking) => booking !== booked,
    );
    const onField = (instanceId: string) =>
      player.board.some((card) => card.instanceId === instanceId);
    const bindings = Object.fromEntries(
      Object.entries(booked.bindings ?? {}).map(([name, instanceIds]) => [
        name,
        instanceIds.filter(onField),
      ]),
    );
    const result = runEndOfTurnProgram(
      state,
      playerId,
      booked.source,
      { effect: booked.effect },
      db,
      bindings,
    );
    events.push(...result.events);
    if (result.pending) {
      state.pendingEffect = result.pending;
      state.activePlayer = result.pending.playerId;
      return;
    }
    endTurn(state, events, db);
    return;
  }
  // Declarative `[End of Your Turn]` registry (currently just OP17-047 Shiki).
  // One instance at a time, oldest board position first; `endTurn` re-enters
  // after each resolves, the same re-entry `borsalino-end-turn` below uses, so
  // a second copy on the board gets its own prompt before the turn ends.
  // The Stage is walked alongside the board because a Stage can print the
  // clause: OP14-039 Coffin Boat is the first, and a Stage is not a Character,
  // so a board-only loop simply never saw it. The Leader is walked too, for the
  // same reason: OP05-022 Donquixote Rosinante is the first Leader to print
  // one, and a Leader is in no zone at all.
  for (const card of [
    {
      instanceId: leaderInstanceId(playerId),
      cardNumber: player.leaderCardNumber,
    },
    ...player.board,
    ...(player.stage ? [player.stage] : []),
  ]) {
    if (
      !getOnEndOfYourTurnMechanicProgram(card.cardNumber) ||
      state.oncePerTurn.includes(`${state.turn}:${card.instanceId}:end-of-turn`)
    ) {
      continue;
    }
    const result = createOnEndOfYourTurnResult(state, playerId, card, db);
    state.oncePerTurn.push(`${state.turn}:${card.instanceId}:end-of-turn`);
    if (result.pending) {
      state.pendingEffect = result.pending;
      // The answering player is whoever the program names: Bandai's OP-17
      // Q&A (OP17-047#1) has Shiki's opponent choose the card from their own
      // hand, so the decision is handed across the table.
      state.activePlayer = result.pending.playerId;
      events.push(...result.events);
      return;
    }
    if (result.events.length > 0) events.push(...result.events);
  }
  // OP16-073 Borsalino: "[printed text omitted -- pnpm card:text OP16-073]"
  //
  // Gated on being able to pay, and on this copy not having already fired this
  // turn. Without the second gate a player holding DON!! could re-answer the
  // same prompt until the DON!! ran out, which is neither what the timing
  // window means nor a line worth offering.
  if (fieldDonCount(state, playerId) >= 2) {
    const borsalinoInstanceIds = player.board
      .filter(
        (card) =>
          card.cardNumber === "OP16-073" &&
          !effectsNegated(state, card.instanceId) &&
          !state.oncePerTurn.includes(
            `${state.turn}:${playerId}:${card.instanceId}:borsalino-end-turn`,
          ),
      )
      .map((card) => card.instanceId);
    if (borsalinoInstanceIds.length > 0) {
      state.pendingEffect = {
        kind: "borsalino-end-turn",
        playerId,
        sourceCardNumber: "OP16-073",
        sourceInstanceId: borsalinoInstanceIds[0]!,
        eligibleInstanceIds: borsalinoInstanceIds,
      };
      return;
    }
  }
  completeEndTurn(state, events);
}

/**
 * Hands the controller the `DON!! −N` choice their cost just made for them.
 *
 * Runs once per action, after everything else has settled, so the paying effect
 * has already finished and whatever decision it queued is still intact in
 * `pendingEffect` -- that decision is parked in `displaced` and restored when
 * the last returned DON!! has been placed.
 *
 * Stays silent when the choice is not one: a controller whose DON!! all sit in a
 * single pool, or who returned every DON!! they had, has nothing to decide, and
 * raising a prompt there would put a decision point into every replay that pays
 * this cost for no gain.
 */
export function offerDonReturnChoice(state: GameState): void {
  const record = state.donReturn;
  state.donReturn = null;
  if (!record || state.phase === "finished") return;
  const onField = fieldDonIds(state, record.playerId);
  const onFieldAtPayment = onField.every((don) =>
    record.onFieldAtPayment.includes(don),
  )
    ? undefined
    : record.onFieldAtPayment;
  if (
    !donReturnHasChoice(
      state,
      record.playerId,
      record.origins,
      onFieldAtPayment,
    )
  ) {
    return;
  }
  state.pendingEffect = {
    kind: "return-don",
    playerId: record.playerId,
    sourceCardNumber: record.sourceCardNumber,
    sourceInstanceId: record.sourceInstanceId,
    origins: record.origins,
    ...(onFieldAtPayment ? { onFieldAtPayment } : {}),
    resumePhase: state.phase,
    resumePlayerId: state.activePlayer,
    displaced: state.pendingEffect,
  };
  state.activePlayer = record.playerId;
}
