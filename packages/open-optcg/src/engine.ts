/**
 * The rules engine, as published in `open-optcg/engine`.
 *
 * Deliberately narrower than `@one-piece-sim/engine-core`. `GameService` is the
 * front door: it creates a game, shows the seat to act what it may do, and
 * advances by the opaque `actionId` of one offered action. The functions under
 * it are here for callers that hold the state themselves; `observe` is what
 * withholds what a seat cannot see, either way. Anything a
 * caller needs beyond that is a request to widen this file, made on purpose.
 */
export {
  applyAction,
  createGame,
  describeStampMismatch,
  donCountReaders,
  EngineError,
  GameService,
  getLegalActions,
  hashState,
  observe,
  replayActions,
  RULES_VERSION,
  rulesStamp,
  type DonCountReaders,
  type GameState,
  type GameTransitionEvent,
  type ReplayCheckpoint,
  type ReplayFixture,
  type RulesStamp,
} from "@one-piece-sim/engine-core";
