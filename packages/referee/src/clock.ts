/**
 * The match clock: a chess-clock bank per seat, with a per-decision delay.
 *
 * The engine forbids wall-clock reads, so time lives here and every function
 * in this file takes `atMs` from its caller. That is not only a rule to
 * satisfy: a replay must not depend on think time, and a session test must be
 * able to advance an hour without waiting one.
 *
 * Why this shape rather than the two obvious ones:
 *
 * - A **per-decision timer alone** (Hearthstone's 90 seconds) cannot see the
 *   whole-game budget, and this engine stops at *every* decision -- a card with
 *   six small prompts would hand a stalling player six fresh timers.
 * - A **bank alone** (MTGO's 25 minutes, SolForge's 20) is what paper OPTCG
 *   approximates with a 25-30 minute round, but it charges those trivial
 *   prompts to the bank, so a many-prompt board drains a seat for playing its
 *   own cards. It also rewards sitting AFK to run an opponent out.
 *
 * A bank plus a delay is the standard answer to exactly that pair: the first
 * `delayMs` of each decision is free, so trivial prompts cost nothing, and
 * anything past it comes off the one budget a seat has for the game.
 */
import type { PlayerId } from "@one-piece-sim/protocol";

export interface ClockRules {
  /** Chess-clock bank per seat. */
  bankMs: number;
  /**
   * Free time at the start of every decision, not charged to the bank.
   *
   * Simple delay, not a Fischer increment: an increment *adds* to the bank for
   * each decision made, which in a game that prompts this often would let a
   * seat farm time by playing cards with many clauses.
   */
  delayMs: number;
  /**
   * Consecutive expired decisions before the seat loses the match.
   *
   * An expiry auto-passes where a pass is legal (see `Referee`), which keeps a
   * momentary disconnect from ending a game. Without a cap that mercy is a
   * stall: a seat that never returns would auto-pass forever.
   */
  expiredDecisionLimit: number;
  /**
   * How long one match may run, from the moment both seats are connected.
   *
   * The banks alone do not bound this. The first `delayMs` of every decision is
   * free, and this engine stops at every decision, so a seat that answers each
   * prompt just inside its free time spends nothing and the game runs as long
   * as it likes -- which is a Durable Object and an alarm held indefinitely,
   * and an opponent whose only exit is to resign.
   *
   * A resource ceiling, and deliberately **not** a tiebreak: reaching it ends
   * the match with no winner, the same void ending a deploy gives a match it
   * cannot finish. Awarding it to someone would be inventing a rules verdict --
   * paper OPTCG calls time with a procedure of its own, and a rated ladder
   * would need that real rule rather than a guess here.
   */
  matchMs: number;
}

/**
 * 15 minutes a seat, mirroring paper OPTCG's ~30-minute round; 20 free seconds
 * a decision, which covers every prompt nobody has to think about; three
 * expiries in a row -- roughly a full turn of silence -- to lose; and 90
 * minutes for the whole match, which is three times the banks and far past any
 * game two people are actually playing.
 */
export const DEFAULT_CLOCK: ClockRules = {
  bankMs: 15 * 60 * 1000,
  delayMs: 20 * 1000,
  expiredDecisionLimit: 3,
  matchMs: 90 * 60 * 1000,
};

export interface ClockState {
  rules: ClockRules;
  bankMs: Record<PlayerId, number>;
  /** The seat on the clock, and when its current decision started. */
  onClock: PlayerId | null;
  decisionStartedMs: number;
  expiredDecisions: number;
  /**
   * When the clock started running, for `matchMs` to be measured from.
   *
   * Absolute, like every other time here, so it survives an eviction; null
   * until both seats are connected, which is when the clock starts and
   * therefore when the match's own limit starts.
   */
  startedMs: number | null;
}

export function startClock(
  rules: ClockRules,
  atMs: number,
  onClock: PlayerId,
): ClockState {
  return {
    rules,
    bankMs: { p1: rules.bankMs, p2: rules.bankMs },
    onClock,
    decisionStartedMs: atMs,
    expiredDecisions: 0,
    // Not running yet: the clock waits for the second seat, and so does the
    // match's own limit. `Referee.startClockWhenReady` sets this.
    startedMs: null,
  };
}

/** When the current decision runs out, or null once nobody is on the clock. */
export function deadlineMs(clock: ClockState): number | null {
  if (!clock.onClock) return null;
  return (
    clock.decisionStartedMs + clock.rules.delayMs + clock.bankMs[clock.onClock]
  );
}

export function hasExpired(clock: ClockState, atMs: number): boolean {
  const deadline = deadlineMs(clock);
  return deadline !== null && atMs >= deadline;
}

/** When this match runs out, however either seat is spending its bank. */
export function matchDeadlineMs(clock: ClockState): number | null {
  return clock.startedMs === null
    ? null
    : clock.startedMs + clock.rules.matchMs;
}

export function outOfTime(clock: ClockState, atMs: number): boolean {
  const deadline = matchDeadlineMs(clock);
  return deadline !== null && atMs >= deadline;
}

/**
 * The next moment a host has to wake up for: the decision, or the match.
 *
 * One number, because a host has one alarm. `deadlineMs` stays the decision's
 * alone -- it is what a seat is shown counting down.
 */
export function nextDeadlineMs(clock: ClockState): number | null {
  const decision = deadlineMs(clock);
  const match = matchDeadlineMs(clock);
  if (decision === null) return match;
  if (match === null) return decision;
  return Math.min(decision, match);
}

/**
 * Charge the seat on the clock for the time it just spent and move the clock to
 * whoever decides next.
 *
 * `next` is the engine's own answer to "who decides now", which is not the same
 * as "whose turn it is": a Block or Counter step puts the other seat on the
 * clock without the turn changing hands.
 */
export function chargeAndAdvance(
  clock: ClockState,
  atMs: number,
  next: PlayerId | null,
): ClockState {
  const spent = clock.onClock
    ? Math.max(0, atMs - clock.decisionStartedMs - clock.rules.delayMs)
    : 0;
  const bankMs = { ...clock.bankMs };
  if (clock.onClock) {
    bankMs[clock.onClock] = Math.max(0, bankMs[clock.onClock] - spent);
  }
  return {
    ...clock,
    bankMs,
    onClock: next,
    decisionStartedMs: atMs,
    // A decision that was actually made clears the streak, including for the
    // seat that had let earlier ones expire.
    expiredDecisions: 0,
  };
}

/**
 * Record an expiry: the bank is gone by definition, and the streak grows.
 *
 * The streak is what the auto-pass mercy is bounded by, so it counts expiries
 * rather than seats -- an alternating pair of expiries is still nobody playing.
 *
 * The next decision starts at the deadline that just passed, not at the moment
 * the caller noticed. Otherwise how long a seat may be absent depends on how
 * punctually the host fires its timer: a Durable Object waking five minutes
 * late would hand the missing player a fresh delay for every one of those
 * minutes. Dating the expiry from the deadline makes the outcome a function of
 * elapsed time alone, which is also what makes `Referee.tick` safe to call late
 * and only once.
 */
export function chargeExpiry(
  clock: ClockState,
  next: PlayerId | null,
): ClockState {
  const bankMs = { ...clock.bankMs };
  if (clock.onClock) bankMs[clock.onClock] = 0;
  return {
    ...clock,
    bankMs,
    onClock: next,
    decisionStartedMs: deadlineMs(clock) ?? clock.decisionStartedMs,
    expiredDecisions: clock.expiredDecisions + 1,
  };
}

export function outOfDecisions(clock: ClockState): boolean {
  return clock.expiredDecisions >= clock.rules.expiredDecisionLimit;
}
