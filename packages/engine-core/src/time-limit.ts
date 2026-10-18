/**
 * The tournament time limit: Bandai's "Sanctioned Tournaments Floor Rules"
 * (Ver. 1.6.0, §8.2).
 *
 * "If a time limit is set for a match and the game is not finished within that
 * time, players play an additional three turns, with the current (active)
 * player's turn becoming turn 0. If the game is not finished after those
 * additional turns", it is decided by four procedures in order: more Life
 * cards, more cards left in the deck, more Characters, and finally whoever last
 * drew from their Life area.
 *
 * The engine has no clock, and must not read one: a game replays from its seed
 * and its actions. So time is called when a set turn begins (`TimeLimit.turns`)
 * rather than when minutes have run out, and a timed game is as deterministic
 * as any other. The setting lives on the state, so a replay that creates the
 * game with the same setting reaches the same end.
 */
import {
  TIME_LIMIT_ADDITIONAL_TURNS,
  type PlayerId,
  type PublicEvent,
  type TimeLimit,
  type TimeLimitObservation,
  type TimeLimitProcedure,
} from "@one-piece-sim/protocol";
import type { GameState } from "./model.js";

/** The state's time-limit record for a new game, or nothing for an untimed one. */
export function initialTimeLimit(
  limit: TimeLimit | undefined,
): GameState["timeLimit"] {
  if (limit === undefined) return undefined;
  if (!Number.isInteger(limit.turns) || limit.turns < 1) {
    throw new Error(
      `INVALID_TIME_LIMIT: turns must be a positive integer, got ${String(limit.turns)}`,
    );
  }
  return { turns: limit.turns };
}

function finalTurnOf(limit: NonNullable<GameState["timeLimit"]>): number {
  return limit.turns + TIME_LIMIT_ADDITIONAL_TURNS;
}

/**
 * Remembers who last moved a card from their own Life area into their hand,
 * for the fourth procedure.
 *
 * "Drew from their Life area" is read as exactly that move, whatever caused it:
 * battle damage, effect damage, a declined [Trigger], or an effect -- either
 * player's -- that adds a Life card to hand (OP12-061 Rosinante's protection).
 * A card only ever goes to its owner's hand, so the step's player is the one
 * whose Life it left. A Life card that never reaches the hand is not
 * drawn: a [Trigger] activated instead of adding the card, a card trashed by
 * [Banish] or by an effect, and a face-up card ST13-003's Leader sends to the
 * bottom of the deck. That is the rules' own line -- a Trigger is activated
 * *instead of* adding the card to hand (rule 10-1-5).
 *
 * Read off the step stream rather than recorded at each site that moves a Life
 * card, because every such move emits a `card-moved` from `life` to `hand`
 * naming the card's owner, and there are a dozen sites. The stream is read in
 * order, so the last such step wins; reading the same steps twice -- once by
 * `endOnTimeIfDue` mid-action and again when the action finishes -- changes
 * nothing.
 */
export function noteLifeDrawn(
  state: GameState,
  events: readonly PublicEvent[],
): void {
  const limit = state.timeLimit;
  if (!limit) return;
  for (const event of events) {
    if (
      event.type === "card-moved" &&
      event.from === "life" &&
      event.to === "hand"
    ) {
      limit.lifeDrawnLast = event.playerId;
    }
  }
}

/**
 * Calls time if the turn that just began is the one the limit names. Run once
 * the turn counter has advanced, before anything of the new turn happens.
 */
export function callTimeIfDue(state: GameState, events: PublicEvent[]): void {
  const limit = state.timeLimit;
  if (!limit || state.turn !== limit.turns) return;
  events.push({
    type: "time-called",
    turn: state.turn,
    turnPlayerId: state.turnPlayerId,
    finalTurn: finalTurnOf(limit),
  });
}

/**
 * Decides the game on time if the turn now ending is the third additional
 * one. Returns whether it did; the caller must then not start another turn.
 *
 * `events` are the steps of the action ending the turn, read first so that a
 * Life card drawn by that same action counts.
 */
export function endOnTimeIfDue(
  state: GameState,
  events: PublicEvent[],
): boolean {
  const limit = state.timeLimit;
  if (!limit || state.turn !== finalTurnOf(limit)) return false;
  noteLifeDrawn(state, events);
  const { winner, procedure } = timeLimitWinner(state);
  limit.decidedBy = procedure;
  state.phase = "finished";
  state.winner = winner;
  state.resultReason = "time";
  events.push({
    type: "game-ended",
    winner,
    reason: "time",
    procedure,
  });
  return true;
}

/** §8.2's procedures, in order; the first that separates the players decides. */
function timeLimitWinner(state: GameState): {
  winner: PlayerId;
  procedure: TimeLimitProcedure;
} {
  const { p1, p2 } = state.players;
  const counts: [TimeLimitProcedure, number, number][] = [
    ["life", p1.life.length, p2.life.length],
    ["deck", p1.deck.length, p2.deck.length],
    ["characters", p1.board.length, p2.board.length],
  ];
  for (const [procedure, mine, theirs] of counts) {
    if (mine !== theirs)
      return { winner: mine > theirs ? "p1" : "p2", procedure };
  }
  const drawn = state.timeLimit?.lifeDrawnLast;
  if (drawn) return { winner: drawn, procedure: "life-drawn" };
  // Every procedure tied and nobody ever took a Life card into hand. The floor
  // rules stop here and the protocol has no draw, so the player whose turn
  // ended the game loses, as in a simultaneous deck-out (`completeEndTurn`).
  return {
    winner: state.turnPlayerId === "p1" ? "p2" : "p1",
    procedure: "final-turn",
  };
}

/** The limit as both seats see it; every part of it is public. */
export function observeTimeLimit(
  state: GameState,
  limit: NonNullable<GameState["timeLimit"]>,
): TimeLimitObservation {
  const finalTurn = finalTurnOf(limit);
  const called = state.turn >= limit.turns;
  return {
    calledOnTurn: limit.turns,
    finalTurn,
    called,
    turnsLeft: called ? Math.max(0, finalTurn - state.turn) : null,
    decidedBy: limit.decidedBy ?? null,
  };
}
