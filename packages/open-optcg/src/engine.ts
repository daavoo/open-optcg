/**
 * The rules engine, as published in `open-optcg/engine`.
 *
 * Deliberately narrower than `@one-piece-sim/engine-core`: a game is created,
 * asked what each seat may do, advanced by one offered action, and shown to a
 * seat through `observe`, which withholds what that seat cannot see. Anything a
 * caller needs beyond that is a request to widen this file, made on purpose.
 */
export {
  applyAction,
  createGame,
  describeStampMismatch,
  donCountReaders,
  EngineError,
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
