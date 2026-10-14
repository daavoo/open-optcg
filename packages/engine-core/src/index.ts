/**
 * The rules kernel's public surface.
 *
 * This file used to be nineteen unqualified `export *` lines, which meant every
 * symbol in every module -- including internal helpers that exist only to keep
 * `effects.ts` readable -- was reachable from `packages/web`, `packages/agents`
 * and every tool. Nothing inside the kernel could be renamed or moved without
 * the possibility that something outside it had bound to the old name.
 *
 * The exports below are the symbols consumers actually use. They are grouped by
 * the question they answer, and each group states what it is for, so an agent
 * adding a feature can tell at a glance whether the thing it needs is already
 * public -- and, if it is not, has to make a deliberate decision to widen the
 * surface rather than getting it by accident.
 *
 * Adding an export is fine. Do it in the group it belongs to, and only for
 * something a consumer outside this package genuinely needs.
 */

// --- Core state and transitions ---------------------------------------------
// The engine proper: build a game, ask what is legal, apply one action, and
// project the result down to what a single player is allowed to see.
export { EngineError } from "./errors.js";
export {
  applyAction,
  applyOfferedAction,
  createGame,
  getLegalActions,
  observe,
  type Callback,
  type GameTransitionEvent,
} from "./engine.js";
export {
  canAttack,
  counterEventPower,
  couldAttackThisTurn,
  hasKeyword,
} from "./board.js";
// Re-exported from `protocol` because it is part of `createGame`'s signature:
// a caller building a game should not have to know which package the shape of a
// deck is declared in. Ids are turned into one of these by `resolveDeck` in
// `@one-piece-sim/decks`.
export type { ResolvedDeck } from "@one-piece-sim/protocol";
export type {
  ActiveAttack,
  BoardCard,
  CardInstance,
  GameState,
  RngState,
} from "./model.js";

// --- Session façade ----------------------------------------------------------
// `GameService` owns game ids, revisions and callbacks. Prefer it over calling
// `applyAction` directly unless you are writing a simulation.
export { GameService } from "./service.js";

// --- Derived rules queries ---------------------------------------------------
// Continuous rules -- what a card costs and how strong it is right now, after
// every modifier and static ability has been folded in.
export {
  battleAttackPower,
  currentPower,
  donPowerApplies,
  effectiveCost,
  recordDeckTopKnowledge,
  searchRevealIsPublic,
} from "./queries.js";
// `playCostFromHand` is the one place a hand price is decided, and the only
// way a test can assert a printed "give this card in your hand -N cost" clause
// without paying for the play: the price is not on the card and the summary
// only shows it once the play is legal.
export { fieldDonCount, returnDonToDeck } from "./don.js";
export { playCostFromHand } from "./hand-price.js";

// --- Effects and the mechanic DSL --------------------------------------------
// The declarative path for card behaviour. `mechanics.ts` is the language,
// `card-mechanics.ts` the registry of programs written in it, and `effects.ts`
// the runtime that schedules them against the game's timing windows.
export {
  createOnKoEffect,
  createOnKoResult,
  createOnPlayEffect,
  hasOnPlayHandler,
  onPlayHandlerCards,
  runOnPlayHandler,
  createTriggerResult,
  getEffectOptions,
  resolveEffect,
} from "./effects.js";
export {
  executeMechanicProgram,
  getMechanicChoiceOptions,
  resolveMechanicChoice,
  programBuffsOwnPowerForTheTurn,
  type MechanicInvocation,
  type MechanicProgram,
} from "./mechanics.js";
export {
  dispatchMechanicInvocations,
  donCountReaders,
  type DonCountReaders,
  mechanicProgramCards,
  mechanicProgramsByClause,
  mechanicProgramEffects,
  getOnKoMechanicProgram,
  getOnPlayMechanicProgram,
} from "./card-mechanics.js";
// The per-set registry modules and their merge. Exported so a test -- or a third
// party adding a set -- can build a registry of its own rather than reaching
// into `src/mechanics/`.
export {
  mergeSetMechanics,
  type MergedMechanics,
  type SetMechanics,
} from "./mechanics/registry.js";
export { leaderEffectsNegated, STATIC_ABILITIES } from "./static-abilities.js";
export { knockOut, replacementOptionsFor } from "./removal.js";

// --- Determinism -------------------------------------------------------------
// Serialized randomness, canonical encoding and hashing. These are what make a
// game reproducible from its seed and comparable across runs.
// Engine events as prose, shared by the app's history modal and the LLM's
// request. See `event-text.ts` for why it lives here.
export {
  cardLabel,
  collectCardInstances,
  eventText,
  formatCompactStat,
  restrictionClause,
  seat,
  seatOwns,
  sourceSuffix,
  GRANTED_KEYWORD_CONSEQUENCE,
  type CardInstanceNames,
} from "./event-text.js";
export { canonicalJson, hashState } from "./canonical.js";
export { cloneGameData } from "./clone.js";
// What rules a recording was made under, so a stale trace reports itself as
// stale rather than as an illegal action halfway through.
export {
  RULES_VERSION,
  describeStampMismatch,
  rulesStamp,
  type RulesStamp,
} from "./provenance.js";
export { nextInt, seedRng } from "./rng.js";
export { sha256Hex } from "./sha256.js";

// `findOfferedAction` is how an `actionId` becomes the offer it names -- the
// lookup every seat's `act` does -- and `reorderAction` composes the one action
// whose payload the caller writes rather than picks.
export { findOfferedAction, reorderAction } from "./offered-action.js";

// --- Replay and simulation ---------------------------------------------------
// Re-running recorded games, and looking one or more plies ahead from a live
// position. `toGameAction` is shared so simulation and the live service can
// never disagree about what an offered action means.
export {
  replayActions,
  type ReplayCheckpoint,
  type ReplayFixture,
} from "./replay.js";
export {
  simulateAction,
  simulateLine,
  toGameAction,
  type Plan,
  type Simulate,
  type SimulatedLine,
} from "./simulate.js";
export { walkLegalActions } from "./random-walk.js";

// --- Consistency checks ------------------------------------------------------
// Card and DON!! conservation. Cheap enough to run inside tests and tools.
export { GameInvariantError, assertGameStateInvariants } from "./invariants.js";
