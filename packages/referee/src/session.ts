/**
 * The session: the referee, two connections, and the rules about who may say
 * what.
 *
 * Everything a client sends arrives here as `unknown` and is parsed before it
 * is believed, including the seat it claims to be. Everything a client receives
 * leaves here as a frame the referee projected, so a bug in this file can drop
 * a message but cannot invent one that shows a seat something it should not see.
 *
 * Nothing here writes to a socket. Every public method returns the messages it
 * wants sent and the caller sends them, because the caller is the one that
 * knows whether the match has been stored yet: telling a seat its move landed
 * before the record is durable is how both players end up ahead of the server.
 * The one exception is superseding a socket -- a reconnect closing the tab it
 * replaces -- which is about the connection rather than the game and depends on
 * nothing being saved. A refusal that hangs up travels *with* its message, so
 * the seat reads why before the socket goes.
 */
import {
  clientMessageSchema,
  PROTOCOL_VERSION,
  type ClientMessage,
  type PlayerId,
  type ServerMessage,
  type SessionErrorCode,
} from "@one-piece-sim/protocol";
import type { RulesStamp } from "@one-piece-sim/engine-core";
import { Referee, RefereeError } from "./referee.js";
import type { Connection, Outbound } from "./transport.js";

export interface SessionOptions {
  /**
   * The per-seat secret minted with the match.
   *
   * This is what makes "which seat are you" a claim the server can check rather
   * than a field the client fills in, and it is also what a reconnect presents:
   * a seat is identified by its token, not by its socket.
   */
  tokens: Record<PlayerId, string>;
}

export class MatchSession {
  readonly #referee: Referee;
  /** What this call wants sent, drained by whichever public method started it. */
  #outbound: Outbound[] = [];
  readonly #tokens: Record<PlayerId, string>;
  /** Live connections by seat. A seat has at most one; a second supersedes it. */
  readonly #seats = new Map<PlayerId, Connection>();
  readonly #joined = new Map<Connection, PlayerId>();

  constructor(referee: Referee, options: SessionOptions) {
    this.#referee = referee;
    this.#tokens = options.tokens;
  }

  get referee(): Referee {
    return this.#referee;
  }

  /** Seats with a live connection right now. */
  get connectedSeats(): readonly PlayerId[] {
    return [...this.#seats.keys()];
  }

  receive(raw: unknown, connection: Connection, atMs: number): Outbound[] {
    this.#handle(raw, connection, atMs);
    return this.#drain();
  }

  #handle(raw: unknown, connection: Connection, atMs: number): void {
    const parsed = clientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.#error(
        connection,
        "BAD_MESSAGE",
        parsed.error.issues[0]?.message ?? "Unparseable",
      );
      return;
    }
    const message = parsed.data;
    if (message.type === "join") {
      this.#join(message, connection, atMs);
      return;
    }
    const seat = this.#joined.get(connection);
    if (!seat) {
      this.#error(connection, "NOT_CONNECTED", "Join before acting");
      return;
    }
    if (message.type === "resign") {
      this.#referee.resign(seat);
      this.#broadcast();
      return;
    }
    this.#act(seat, message, connection, atMs);
  }

  /**
   * Re-register a socket that was already joined, without re-opening the match.
   *
   * For a host that was evicted while its connections stayed up: a Durable
   * Object using the WebSocket Hibernation API comes back with live sockets and
   * no session in memory. The client is not told anything, because from its side
   * nothing happened -- it is holding the last frame it was sent, and the state
   * it describes has not moved.
   */
  attach(seat: PlayerId, connection: Connection): void {
    this.#seats.set(seat, connection);
    this.#joined.set(connection, seat);
  }

  /**
   * A connection went away.
   *
   * The seat is freed but nothing else happens: the clock keeps running, which
   * is the §6.1 answer to "does a disconnect on your own turn burn your clock".
   * It has to -- the alternative is that pulling the plug pauses a losing
   * position indefinitely.
   */
  disconnect(connection: Connection): void {
    const seat = this.#joined.get(connection);
    this.#joined.delete(connection);
    if (seat && this.#seats.get(seat) === connection) this.#seats.delete(seat);
  }

  /**
   * Give up on a match whose seats never both arrived, and say so.
   *
   * Called by the host on a deadline set when the match was created; see
   * `MatchObject`. Does nothing once the match is under way.
   */
  abandonIfUnjoined(): Outbound[] {
    const result = this.#referee.noShow(this.connectedSeats);
    if (result) this.#broadcast();
    return this.#drain();
  }

  /**
   * The current position, to every seat that is here.
   *
   * For a host that has just discovered its last write did not land: the
   * session it was serving is gone, this one was rebuilt from what storage
   * actually holds, and the seats are holding a frame from a future that did
   * not happen. Its revision is lower than theirs, which is the client's cue to
   * take the server's word.
   */
  resync(): Outbound[] {
    for (const [seat, connection] of this.#seats)
      this.#sendFrame(seat, connection);
    return this.#drain();
  }

  /**
   * Advance the clock and tell both seats what it did.
   *
   * The caller owns the timer -- `setTimeout` in a plain host, an alarm in a
   * Durable Object -- and this is the only place session state moves without a
   * client saying anything.
   */
  tick(atMs: number): Outbound[] {
    this.#tick(atMs);
    return this.#drain();
  }

  #tick(atMs: number): void {
    const outcomes = this.#referee.tick(atMs);
    if (outcomes.length > 0) this.#broadcast();
  }

  #join(
    message: Extract<ClientMessage, { type: "join" }>,
    connection: Connection,
    atMs: number,
  ): void {
    if (!sameToken(this.#tokens[message.seat], message.token)) {
      this.#error(
        connection,
        "BAD_TOKEN",
        `Not the token for ${message.seat}`,
        "BAD_TOKEN",
      );
      return;
    }
    const pinned = this.#referee.rulesStamp;
    if (pinned && !sameStamp(pinned, message.rulesStamp)) {
      this.#error(
        connection,
        "VERSION_MISMATCH",
        `This match runs rules ${pinned.rulesVersion}/${pinned.cardDataHash.slice(0, 8)}`,
        "VERSION_MISMATCH",
      );
      return;
    }
    // A reconnect supersedes the socket it replaces rather than being refused:
    // the seat is the token's, and a stale socket is usually a tab that is
    // already gone. Closing it explicitly keeps a genuine second viewer from
    // sitting on the seat's frames.
    const existing = this.#seats.get(message.seat);
    if (existing && existing !== connection) {
      this.#joined.delete(existing);
      existing.close("SUPERSEDED");
    }
    this.#seats.set(message.seat, connection);
    this.#joined.set(connection, message.seat);
    // The clock starts when the match has both its players and not before, so
    // the time a friend takes to open a link is nobody's to lose.
    if (this.#seats.size === 2) this.#referee.startClockWhenReady(atMs);
    const snapshot = this.#referee.snapshot();
    this.#emit(connection, {
      v: PROTOCOL_VERSION,
      type: "welcome",
      matchId: snapshot.matchId,
      seat: message.seat,
      // No seed, and no starting player. Those two plus the deck ids are the
      // deal, and the deal is the opponent's hand and both deck orders; they
      // go out with `finished`. See the note on the protocol's `welcome`.
      opening: {
        deckIds: snapshot.deckIds,
        rulesStamp: snapshot.rulesStamp,
      },
    });
    // Catching a reconnect up is the same thing as opening: the current frame
    // is the whole state a seat is entitled to, so there is no replay to send.
    this.#sendFrame(message.seat, connection);
    if (this.#referee.result) this.#sendFinished(connection);
    // A seat that reconnected onto an expired clock finds out immediately.
    this.#tick(atMs);
    // And everyone already sitting here hears that the seat filled. Without
    // this, the player who arrived first is left holding a frame that says the
    // clock is not running, with nothing ever contradicting it -- both windows
    // wait for each other forever.
    for (const [seat, other] of this.#seats) {
      if (other !== connection) this.#sendFrame(seat, other);
    }
  }

  #act(
    seat: PlayerId,
    message: Extract<ClientMessage, { type: "act" }>,
    connection: Connection,
    atMs: number,
  ): void {
    try {
      this.#referee.apply(
        seat,
        { revision: message.revision, actionId: message.actionId },
        atMs,
      );
    } catch (error) {
      if (error instanceof RefereeError) {
        // Only the offending seat hears about it; a rejected action is not
        // something the opponent is entitled to know they tried.
        this.#error(connection, error.code, error.message);
        return;
      }
      throw error;
    }
    this.#broadcast();
  }

  #broadcast(): void {
    for (const [seat, connection] of this.#seats)
      this.#sendFrame(seat, connection);
    if (!this.#referee.result) return;
    for (const connection of this.#seats.values())
      this.#sendFinished(connection);
  }

  #sendFrame(seat: PlayerId, connection: Connection): void {
    const frame = this.#referee.observe(seat);
    this.#emit(connection, {
      v: PROTOCOL_VERSION,
      type: "frame",
      observation: frame.observation,
      clock: frame.clock,
    });
  }

  /**
   * The result, and the action list that produced it.
   *
   * The list goes out with the ending rather than being kept: this object is
   * not an archive and the record it lives in is dropped minutes later, so the
   * end of the match is the only moment a player can be handed a trace of it.
   */
  #sendFinished(connection: Connection): void {
    const snapshot = this.#referee.snapshot();
    if (!snapshot.result) return;
    this.#emit(connection, {
      v: PROTOCOL_VERSION,
      type: "finished",
      result: snapshot.result,
      actions: snapshot.actions,
      // The half of the trace that was held back while the match was live.
      deal: {
        seed: snapshot.seed,
        startingPlayer: snapshot.startingPlayer,
      },
    });
  }

  #error(
    connection: Connection,
    code: SessionErrorCode,
    message: string,
    close?: string,
  ): void {
    this.#emit(
      connection,
      { v: PROTOCOL_VERSION, type: "error", code, message },
      close,
    );
  }

  #emit(connection: Connection, message: ServerMessage, close?: string): void {
    this.#outbound.push({
      connection,
      message,
      ...(close === undefined ? {} : { close }),
    });
  }

  #drain(): Outbound[] {
    const outbound = this.#outbound;
    this.#outbound = [];
    return outbound;
  }
}

/**
 * Whether a claimed token is the seat's, in time that does not depend on how
 * much of it was right.
 *
 * `!==` returns on the first differing character, which a textbook calls a
 * timing oracle: guess a token one character at a time, keeping whichever
 * guess took longest. Against twenty-four random bytes over the internet that
 * is not a practical attack and never was -- but this is the cheap end of
 * "never write the comparison that has to be argued about", and the argument
 * costs more to keep having than the loop costs to run.
 *
 * The iteration count is the *server's* token length, so nothing about the
 * claim changes how long this takes. A length mismatch is folded in rather
 * than returned early, for the same reason.
 */
function sameToken(expected: string | undefined, given: string): boolean {
  if (expected === undefined) return false;
  let differences = expected.length ^ given.length;
  for (let index = 0; index < expected.length; index += 1) {
    const claimed = index < given.length ? given.charCodeAt(index) : 0;
    differences |= expected.charCodeAt(index) ^ claimed;
  }
  return differences === 0;
}

function sameStamp(left: RulesStamp, right: RulesStamp): boolean {
  return (
    left.rulesVersion === right.rulesVersion &&
    left.cardDataHash === right.cardDataHash &&
    left.programHash === right.programHash
  );
}
