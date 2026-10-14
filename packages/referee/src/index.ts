/**
 * The online session layer: one match, refereed server-side.
 *
 * Nothing in here is rules behaviour -- the engine is untouched -- and nothing
 * in here knows about Cloudflare. See `referee.ts` for why those two sentences
 * are the design.
 */
export {
  Referee,
  RefereeError,
  opponentOf,
  type MatchSnapshot,
  type RefereeOptions,
  type SeatConfig,
  type SessionFrame,
  type TimeoutOutcome,
} from "./referee.js";
export { MatchSession, type SessionOptions } from "./session.js";
export {
  createMemoryPair,
  deliver,
  type ClientSocket,
  type Connection,
  type MemoryPair,
  type Outbound,
} from "./transport.js";
// The hosted half: the Durable Object adapter and the types it is declared
// against. The Worker entry (`worker.ts`) is not re-exported -- it is a deploy
// target, not a library, and importing it would pull the platform's globals in.
export {
  MatchObject,
  type InitRequest,
  type MatchRecord,
} from "./durable-object.js";
export {
  rateLimit,
  type RateLimiter,
  type RateLimitEnv,
  type RateLimitVerdict,
} from "./rate-limit.js";
export {
  recordEvent,
  type AnalyticsDataset,
  type TelemetryEnv,
  type TelemetryEvent,
} from "./telemetry.js";
export type {
  AlarmStorage,
  HibernatableSocket,
  MatchObjectState,
} from "./cloudflare.js";
export {
  DEFAULT_CLOCK,
  deadlineMs,
  hasExpired,
  matchDeadlineMs,
  nextDeadlineMs,
  outOfTime,
  type ClockRules,
  type ClockState,
} from "./clock.js";
