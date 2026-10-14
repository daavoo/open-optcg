/**
 * The referee: one online match, as a plain class.
 *
 * Deliberately knows nothing about how its two seats are connected. The
 * Durable Object that will host it is an adapter that calls `apply` and pushes
 * what `observe` returns; the in-memory transport in `transport.ts` is the same
 * adapter without a network, which is what makes the session layer testable
 * without Cloudflare, and what would let this class run on plain Node if the
 * hosting choice ever changes.
 *
 * Two rules hold the design together:
 *
 * - **Every frame is `observe(state, seat)`.** There is no other projection.
 *   The referee never hands a seat a state it computed some other way, which is
 *   what makes the hidden-information boundary one function rather than a
 *   convention.
 * - **Time arrives as an argument.** Nothing here reads a clock. A session test
 *   advances an hour by passing a bigger number, and a replay of the action
 *   list cannot depend on how long anyone thought.
 */
import {
  EngineError,
  GameService,
  rulesStamp,
  type RulesStamp,
} from "@one-piece-sim/engine-core";
import { resolveDeck, type DeckManifest } from "@one-piece-sim/decks";
import type {
  ClockView,
  GameObservation,
  MatchResult,
  PlayerId,
  SessionErrorCode,
} from "@one-piece-sim/protocol";
import {
  chargeAndAdvance,
  chargeExpiry,
  deadlineMs,
  DEFAULT_CLOCK,
  hasExpired,
  outOfDecisions,
  outOfTime,
  startClock,
  type ClockRules,
  type ClockState,
} from "./clock.js";

export class RefereeError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RefereeError";
  }
}

export interface SeatConfig {
  /** The catalog id. Resolved here, server-side; a client never sends a list. */
  deckId: string;
  /**
   * A manifest for a deck the catalog does not ship (a saved build). Still
   * validated by `resolveDeck`, which is what rejects an illegal size or a card
   * the registry has never heard of -- the point being that a
   * client-submitted manifest is checked, not trusted.
   */
  customDeck?: DeckManifest;
}

export interface RefereeOptions {
  matchId: string;
  seed: string;
  seats: Record<PlayerId, SeatConfig>;
  startingPlayer?: PlayerId | "random";
  clock?: ClockRules;
}

/** One seat's view of the match, and the clock as of that view. */
export interface SessionFrame {
  observation: GameObservation;
  clock: ClockView;
}

export interface MatchSnapshot {
  matchId: string;
  seed: string;
  deckIds: Record<PlayerId, string>;
  startingPlayer: PlayerId | "random";
  /**
   * The rules the match is being played under, fixed at `start()`.
   *
   * Pinned rather than re-read per join, which is the answer to §6.4: a client
   * on a different build is refused by *this* match, and a new match gets
   * whatever the deploy stamps. The alternative -- refusing against the
   * deploy's current stamp -- would silently change the legal lines of a game
   * already in progress the moment a card fix lands.
   */
  rulesStamp: RulesStamp;
  /** Everything played, in order. With the three fields above, the whole match. */
  actions: string[];
  result: MatchResult | null;
}

/** What a timeout did, for the session layer to relay and for tests to assert. */
export interface TimeoutOutcome {
  seat: PlayerId;
  /**
   * `pass` when a pass was legal and taken; `loss` when the mercy ran out;
   * `time-limit` when the match itself ran out, which is nobody's loss and so
   * names the seat that happened to be on the clock only for the record.
   */
  effect: "pass" | "loss" | "time-limit";
  actionId?: string;
}

export class Referee {
  readonly #options: RefereeOptions;
  readonly #service = new GameService();
  readonly #actions: string[] = [];
  #gameId: string | null = null;
  #stamp: RulesStamp | null = null;
  #clock: ClockState | null = null;
  #result: MatchResult | null = null;
  /**
   * Whether the clock is counting yet.
   *
   * A friend match is a link someone sends, so the match exists for as long as
   * it takes the other person to open it. Charging that wait to whoever the
   * deal put on the clock would decide games by how fast a friend reads their
   * messages, so the session starts the clock when both seats are first
   * connected (`startClockWhenReady`) rather than when the match is dealt.
   */
  #clockRunning = false;

  constructor(options: RefereeOptions) {
    this.#options = options;
  }

  get matchId(): string {
    return this.#options.matchId;
  }

  get result(): MatchResult | null {
    return this.#result;
  }

  /** The stamp this match is pinned to. Null until `start()`. */
  get rulesStamp(): RulesStamp | null {
    return this.#stamp;
  }

  /** Whose decision it is, or null once the match is over. */
  get onClock(): PlayerId | null {
    return this.#clock?.onClock ?? null;
  }

  /** Whether the clock is counting. False while a match waits for its second seat. */
  get clockRunning(): boolean {
    return this.#clockRunning;
  }

  /**
   * The clock, for a host that has to survive being evicted mid-match.
   *
   * `snapshot()` is the match record and deliberately has no clock in it -- an
   * action list replays the same however long anyone thought. A Durable Object
   * using the WebSocket Hibernation API is evicted between moves as a matter of
   * course, though, so it has to put the clock back exactly as it was rather
   * than starting a fresh one every time a player takes 40 seconds. The two are
   * separate because they are answers to different questions: what was played,
   * and how much time is left.
   */
  clockState(): (ClockState & { running: boolean }) | null {
    return this.#clock ? { ...this.#clock, running: this.#clockRunning } : null;
  }

  /**
   * Start the clock, once. Called when both seats are first connected.
   *
   * Idempotent: a reconnect later in the match must not reset the decision
   * currently being timed.
   */
  startClockWhenReady(atMs: number): void {
    if (this.#clockRunning || !this.#clock) return;
    this.#clockRunning = true;
    // Both the decision and the match's own limit start counting here.
    this.#clock = { ...this.#clock, decisionStartedMs: atMs, startedMs: atMs };
  }

  /**
   * Deal the match and start the clock.
   *
   * Deck resolution happens here rather than at construction so that an
   * unsupported deck fails one caller -- the matchmaker -- rather than every
   * caller that merely holds a match id.
   */
  start(atMs: number): void {
    if (this.#gameId)
      throw new RefereeError("BAD_MESSAGE", "Match already started");
    const p1 = resolveDeck(
      this.#options.seats.p1.deckId,
      this.#options.seats.p1.customDeck,
    );
    const p2 = resolveDeck(
      this.#options.seats.p2.deckId,
      this.#options.seats.p2.customDeck,
    );
    const opening = this.#service.create({
      p1,
      p2,
      seed: this.#options.seed,
      ...(this.#options.startingPlayer
        ? { startingPlayer: this.#options.startingPlayer }
        : {}),
    });
    this.#gameId = opening.gameId;
    this.#stamp = rulesStamp();
    this.#clock = startClock(
      this.#options.clock ?? DEFAULT_CLOCK,
      atMs,
      opening.activePlayer,
    );
  }

  observe(seat: PlayerId): SessionFrame {
    return {
      observation: this.#service.observe(this.#requireGame(), seat),
      clock: this.#clockView(),
    };
  }

  /**
   * Play one action for `seat`.
   *
   * The seat check is the whole reason this method exists rather than exposing
   * `GameService.act`: the service acts for whoever the engine has on the
   * clock, and over a network that is a seat playing its opponent's Counter
   * step. Legality itself stays the engine's -- an unknown or stale `actionId`
   * comes back as the engine's own error, translated.
   */
  apply(
    seat: PlayerId,
    action: { revision: number; actionId: string },
    atMs: number,
  ): void {
    const gameId = this.#requireGame();
    if (this.#result)
      throw new RefereeError("MATCH_FINISHED", "The match is over");
    if (this.onClock !== seat) {
      throw new RefereeError(
        "NOT_YOUR_DECISION",
        `It is ${String(this.onClock)}'s decision`,
      );
    }
    // The revision is checked here rather than left to the engine, even though
    // `applyAction` has the same check. Action ids are revision-prefixed, so a
    // client that resubmits a message after the state has moved -- a laggy
    // double-click, a retry after a dropped socket -- names an id that is no
    // longer in `legalActions`, and the service reports it as illegal. That is
    // the wrong word for it: a client told its move was illegal has reason to
    // think it desynced, when all that happened was that it was late.
    const current = this.#service.observe(gameId, seat).revision;
    if (action.revision !== current) {
      throw new RefereeError(
        "STALE_ACTION",
        `The action was generated for revision ${action.revision}; the match is at ${current}`,
      );
    }
    let observation: GameObservation;
    try {
      observation = this.#service.act(gameId, action.revision, action.actionId);
    } catch (error) {
      throw asRefereeError(error);
    }
    this.#actions.push(action.actionId);
    this.#settle(observation, (clock, next) =>
      chargeAndAdvance(clock, atMs, next),
    );
  }

  /**
   * Enforce the clock. Idempotent, and safe to call from a timer that fired
   * late: it acts only if the current decision has actually expired.
   *
   * Auto-pass rather than auto-concede on the first expiry, and concede only
   * once `expiredDecisionLimit` in a row have gone by, is the §6.1 answer: this
   * engine stops at decisions a player has no reason to think about, and losing
   * a match to a trivial prompt during a ten-second network hiccup would be a
   * balance decision made by accident. A seat that never comes back still
   * loses; it just takes a turn's worth of silence rather than one prompt.
   */
  tick(atMs: number): TimeoutOutcome[] {
    const outcomes: TimeoutOutcome[] = [];
    if (!this.#clockRunning) return outcomes;
    // The match's own ceiling, checked before the decision's: past it there is
    // no decision left to enforce. Void rather than awarded -- see `matchMs`.
    if (this.#result === null && this.#clock && outOfTime(this.#clock, atMs)) {
      // Read before the clock is cleared, not after: nobody is on the clock
      // once the match has ended, so the line below is what this names.
      const seat = this.#clock.onClock ?? "p1";
      this.#result = { winner: null, reason: "time-limit" };
      this.#clock = { ...this.#clock, onClock: null };
      outcomes.push({ seat, effect: "time-limit" });
      return outcomes;
    }
    // A loop, because one auto-pass can hand the clock straight back to the
    // same absent seat, and a DO waking from hibernation may be minutes late.
    while (
      this.#result === null &&
      this.#clock &&
      hasExpired(this.#clock, atMs)
    ) {
      const seat = this.#clock.onClock;
      if (!seat) break;
      const pass = this.#service
        .observe(this.#requireGame(), seat)
        .legalActions.find((legal) => legal.type === "pass");
      if (!pass || outOfDecisions(this.#clock)) {
        this.#result = { winner: opponentOf(seat), reason: "timeout" };
        this.#clock = { ...this.#clock, onClock: null };
        outcomes.push({ seat, effect: "loss" });
        break;
      }
      const observation = this.#service.act(
        this.#requireGame(),
        this.#service.observe(this.#requireGame(), seat).revision,
        pass.actionId,
      );
      this.#actions.push(pass.actionId);
      this.#settle(observation, chargeExpiry);
      outcomes.push({ seat, effect: "pass", actionId: pass.actionId });
    }
    return outcomes;
  }

  /**
   * End a match whose seats did not both arrive.
   *
   * `connected` is who is actually here. The seat that turned up wins; if that
   * is nobody, the match ends with no winner, which is the only honest answer
   * and keeps a dead object from holding a clock forever.
   *
   * Refuses to do anything once the clock is running: by then both seats have
   * been here, and leaving is a disconnect, which burns your own clock rather
   * than ending the game.
   */
  noShow(connected: readonly PlayerId[]): MatchResult | null {
    if (this.#result || this.#clockRunning) return this.#result;
    const present = connected.length === 1 ? connected[0] : null;
    this.#result = { winner: present ?? null, reason: "no-show" };
    if (this.#clock) this.#clock = { ...this.#clock, onClock: null };
    return this.#result;
  }

  /** A seat gives up. Not an engine action -- the engine has no concede. */
  resign(seat: PlayerId): MatchResult {
    if (this.#result) return this.#result;
    this.#result = { winner: opponentOf(seat), reason: "resign" };
    if (this.#clock) this.#clock = { ...this.#clock, onClock: null };
    return this.#result;
  }

  /**
   * The match as the four things that reconstruct it, plus the clock-independent
   * result. Small enough to keep in DO storage after every action and to archive
   * to R2 when the match ends.
   *
   * The clock is deliberately absent: `restore` replays the action list, and
   * time spent thinking is not part of what a replay must reproduce. A resumed
   * match starts its clocks fresh, which is the honest reading of a server that
   * was not running.
   */
  snapshot(): MatchSnapshot {
    return {
      matchId: this.#options.matchId,
      seed: this.#options.seed,
      deckIds: {
        p1: this.#options.seats.p1.deckId,
        p2: this.#options.seats.p2.deckId,
      },
      startingPlayer: this.#options.startingPlayer ?? "p1",
      rulesStamp: this.#stamp ?? rulesStamp(),
      actions: [...this.#actions],
      result: this.#result,
    };
  }

  /**
   * Rebuild a match from its snapshot by replaying it.
   *
   * Refuses a snapshot recorded under different rules instead of replaying it
   * into a divergence: an action list is only legal against the rules that
   * produced it, which is the same argument `describeStampMismatch` makes for
   * traces.
   */
  static restore(
    snapshot: MatchSnapshot,
    atMs: number,
    options?: {
      clock?: ClockRules;
      seats?: Record<PlayerId, SeatConfig>;
      /**
       * The clock as it stood, for a host resuming rather than re-dealing. Its
       * absolute timestamps are what make this exact across an eviction; see
       * `clockState`.
       */
      clockState?: ClockState & { running: boolean };
    },
  ): Referee {
    const current = rulesStamp();
    if (
      current.rulesVersion !== snapshot.rulesStamp.rulesVersion ||
      current.cardDataHash !== snapshot.rulesStamp.cardDataHash ||
      current.programHash !== snapshot.rulesStamp.programHash
    ) {
      throw new RefereeError(
        "VERSION_MISMATCH",
        `Snapshot was recorded under rules ${snapshot.rulesStamp.rulesVersion}, this build runs ${current.rulesVersion}`,
      );
    }
    const referee = new Referee({
      matchId: snapshot.matchId,
      seed: snapshot.seed,
      seats: options?.seats ?? {
        p1: { deckId: snapshot.deckIds.p1 },
        p2: { deckId: snapshot.deckIds.p2 },
      },
      startingPlayer: snapshot.startingPlayer,
      ...(options?.clock ? { clock: options.clock } : {}),
    });
    referee.start(atMs);
    for (const actionId of snapshot.actions) {
      const seat = referee.onClock;
      if (!seat) break;
      referee.apply(
        seat,
        { revision: referee.observe(seat).observation.revision, actionId },
        atMs,
      );
    }
    if (options?.clockState) {
      const { running, ...clock } = options.clockState;
      referee.#clock = clock;
      referee.#clockRunning = running;
    }
    if (snapshot.result) referee.#result = snapshot.result;
    return referee;
  }

  /**
   * Fold one applied action into the result and the clock.
   *
   * The engine's `winner` is read off the observation rather than tracked here,
   * so "the match is over" has exactly one source.
   */
  #settle(
    observation: GameObservation,
    charge: (clock: ClockState, next: PlayerId | null) => ClockState,
  ): void {
    const finished =
      observation.phase === "finished" || observation.resultReason !== null;
    const next = finished ? null : observation.activePlayer;
    if (this.#clock) this.#clock = charge(this.#clock, next);
    if (finished && observation.resultReason) {
      this.#result = {
        winner: observation.winner,
        reason: observation.resultReason,
      };
    }
  }

  #clockView(): ClockView {
    const clock = this.#clock;
    if (!clock) {
      return {
        running: false,
        bankMs: { p1: 0, p2: 0 },
        deadlineMs: null,
        expiredDecisions: 0,
      };
    }
    return {
      running: this.#clockRunning,
      bankMs: { ...clock.bankMs },
      deadlineMs: this.#clockRunning ? deadlineMs(clock) : null,
      expiredDecisions: clock.expiredDecisions,
    };
  }

  #requireGame(): string {
    if (!this.#gameId)
      throw new RefereeError("BAD_MESSAGE", "Match has not started");
    return this.#gameId;
  }
}

export function opponentOf(seat: PlayerId): PlayerId {
  return seat === "p1" ? "p2" : "p1";
}

/**
 * The engine's error codes are already the right distinctions -- a stale
 * revision is not an illegal action -- so this maps rather than reinterprets.
 */
function asRefereeError(error: unknown): RefereeError {
  if (error instanceof EngineError) {
    if (error.code === "STALE_ACTION")
      return new RefereeError("STALE_ACTION", error.message);
    if (error.code === "GAME_FINISHED")
      return new RefereeError("MATCH_FINISHED", error.message);
    return new RefereeError("ILLEGAL_ACTION", error.message);
  }
  return new RefereeError(
    "ILLEGAL_ACTION",
    error instanceof Error ? error.message : String(error),
  );
}
