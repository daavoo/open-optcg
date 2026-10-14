/**
 * The wire between one online seat and the match that referees it.
 *
 * Separate from `requestSchema` above it on purpose. The JSONL protocol is a
 * request/response pipe to a process that trusts its caller: `game.create`
 * takes whatever decks it is asked for and `game.act` acts for whoever is on
 * the clock. An online match trusts neither -- a seat may only act for itself,
 * only on the rules build the match started under -- so the two have different
 * messages even where they carry the same words.
 *
 * Client messages get a schema because they arrive from the network; server
 * messages are types, because the server is the one producing them.
 */
import { z } from "zod";
import type { GameObservation, PlayerId } from "./index.js";
import { PROTOCOL_VERSION } from "./version.js";

/** Rules identity a client claims, matched against the match's own. See §4. */
export const rulesStampSchema = z.object({
  rulesVersion: z.string().min(1),
  cardDataHash: z.string().min(1),
  programHash: z.string().min(1),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal("join"),
    /**
     * Which seat this connection claims, and the secret that entitles it.
     *
     * The token is minted per seat when the match is created, so it is also
     * what makes a reconnect a reconnect rather than a third spectator: the
     * seat is not a field the client gets to pick freely.
     */
    seat: z.enum(["p1", "p2"]),
    token: z.string().min(1),
    /** Refused unless it matches the stamp the match started under. */
    rulesStamp: rulesStampSchema,
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal("act"),
    /** The revision the client was looking at; the engine rejects a stale one. */
    revision: z.number().int().nonnegative(),
    actionId: z.string().min(1),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal("resign"),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Why a match stopped. The first two are the engine's; the rest are the session's. */
export type MatchEndReason =
  | "life"
  | "deck-exhaustion"
  | "resign"
  | "timeout"
  /**
   * A seat never arrived.
   *
   * The clock does not start until both seats are connected, so a match whose
   * second player closed their tab would otherwise sit there forever with the
   * one who showed up staring at "waiting for your opponent". This ends it: the
   * seat that turned up wins, and if neither did there is no winner.
   */
  | "no-show"
  /**
   * The match hit its own wall-clock ceiling.
   *
   * The banks do not bound how long a game runs: the first seconds of every
   * decision are free, and this engine stops at every decision, so a seat
   * answering each prompt just inside its free time spends nothing. Void
   * rather than awarded -- it is a resource ceiling, not paper's time-called
   * procedure, and inventing a winner would be inventing a rules verdict. See
   * `ClockRules.matchMs`.
   */
  | "time-limit"
  /**
   * The server cannot finish the game it started.
   *
   * A match is pinned to the rules build it was dealt under, and a deploy
   * replaces that build -- so a match in progress across one cannot be replayed
   * and cannot go on. Void rather than awarded: the alternative is inventing a
   * winner for a game nobody lost.
   */
  | "superseded";

export interface MatchResult {
  winner: PlayerId | null;
  reason: MatchEndReason;
}

/** What each seat has left on its clock, as of the frame carrying it. */
export interface ClockView {
  /**
   * Whether the clock is counting.
   *
   * False while a match is still short a player -- the second seat's link not
   * yet opened, or its page still loading.
   * Stated rather than left to be inferred from a null `deadlineMs`, which is
   * also null for a finished match: a client that guessed would show "waiting
   * for your opponent" over a game that had ended.
   */
  running: boolean;
  /** Remaining chess-clock bank per seat, in milliseconds. */
  bankMs: Record<PlayerId, number>;
  /**
   * When the seat now on the clock runs out of the current decision, in the
   * session's own epoch milliseconds -- absolute rather than a countdown so a
   * frame that arrives late does not extend the deadline it describes.
   */
  deadlineMs: number | null;
  /** Consecutive decisions the seat on the clock has let expire. */
  expiredDecisions: number;
}

export type ServerMessage =
  | {
      v: typeof PROTOCOL_VERSION;
      type: "welcome";
      matchId: string;
      seat: PlayerId;
      /**
       * What this match is, in what a seat may know while it is being played:
       * which decks are being piloted, and which rules build is refereeing.
       *
       * **The seed is deliberately not here.** The deal is a pure function of
       * the seed, the two decks and the starting player, so a seat holding all
       * four can reconstruct the opponent's hand and both deck orders in full
       * -- every card either player will draw, before the mulligan. That is the
       * entire hidden state of the game, and handing it out would make
       * `observe()`'s withholding decorative. The seed arrives with `finished`,
       * where it is a trace of a game already over rather than a crib sheet for
       * one still being played.
       */
      opening: {
        deckIds: Record<PlayerId, string>;
        rulesStamp: z.infer<typeof rulesStampSchema>;
      };
    }
  | {
      v: typeof PROTOCOL_VERSION;
      type: "frame";
      /** Always `observe(state, seat)`; never a projection built any other way. */
      observation: GameObservation;
      clock: ClockView;
    }
  | {
      v: typeof PROTOCOL_VERSION;
      type: "finished";
      result: MatchResult;
      /**
       * Everything played, in order -- the other half of a trace, sent once the
       * match is over.
       *
       * Only at the end, and this is why it is not a hidden-information leak:
       * with the deal below these ids replay the whole game, both hands
       * included, and a seat is entitled to that about a match that has
       * finished. The server keeps nothing (see `KEEP_FINISHED_MS`), so this is
       * also the only way a bug report from a real online game can exist.
       */
      actions: readonly string[];
      /**
       * The other two things a replay needs, held back until now.
       *
       * The seed and the starting player are what turn the action list into a
       * position: with them `createGame` deals the same game the players
       * played. They are sent here rather than with `welcome` because the same
       * two facts, delivered at the start, are the opponent's hand and both
       * deck orders -- see the note there. `startingPlayer` is sent as the
       * match recorded it, `"random"` included, because that is what resolves
       * off the seed.
       */
      deal: {
        seed: string;
        startingPlayer: PlayerId | "random";
      };
    }
  | {
      v: typeof PROTOCOL_VERSION;
      type: "error";
      code: SessionErrorCode;
      message: string;
    };

export type SessionErrorCode =
  | "VERSION_MISMATCH"
  | "BAD_TOKEN"
  | "BAD_MESSAGE"
  | "NOT_YOUR_DECISION"
  | "NOT_CONNECTED"
  | "MATCH_FINISHED"
  | "STALE_ACTION"
  | "ILLEGAL_ACTION";
