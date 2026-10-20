/**
 * The rules kernel's spine: build a game, ask what is legal, apply one action,
 * and project the result down to one seat.
 *
 * What is left here is only what needs the whole picture. Everything a
 * transition *consults* or *does* now lives one layer down, in modules this one
 * imports and nothing imports back:
 *
 * | module       | what it owns                                          |
 * | ------------ | ----------------------------------------------------- |
 * | `errors.ts`  | `EngineError`                                         |
 * | `board.ts`   | keyword and attack legality, battle arithmetic, labels|
 * | `pending.ts` | the pending slot and the Trigger window                |
 * | `battle.ts`  | attack reactions, and resolving a battle               |
 * | `turn.ts`    | Refresh/Draw/DON!!, ending a turn, starting the next   |
 *
 * That order is the dependency order, and it is acyclic: `board.ts` imports
 * none of the others, `engine.ts` imports all of them. It is also what let
 * `actions/` and `legal-actions/` stop importing this file -- they reach the
 * helpers directly now, so the cycle `actions/README.md` used to have to
 * excuse is gone.
 */
import {
  cards as defaultCardDatabase,
  type CardDatabase,
} from "@one-piece-sim/cards";
import {
  PROTOCOL_VERSION,
  type GameObservation,
  type CardKeyword,
  type DormantAbilityObservation,
  type GrantableKeyword,
  type GrantedKeywordObservation,
  type LegalAction,
  type LifeCardObservation,
  type PlayerId,
  type PublicEvent,
  type ResolvedDeck,
  type TimeLimit,
} from "@one-piece-sim/protocol";
import {
  applyMechanicReactions,
  getMechanicSignalInvocations,
  leaderReactionSpent,
} from "./card-mechanics.js";
import { ACTION_HANDLERS, type ActionHandler } from "./actions/index.js";
import {
  blockActions,
  counterActions,
  mainActions,
  mulliganActions,
  pendingEffectActions,
  triggerActions,
} from "./legal-actions/index.js";
import { storedBasePower } from "./base-power.js";
import { hashState } from "./canonical.js";
import { findOfferedAction } from "./offered-action.js";
import { cloneGameData } from "./clone.js";
import { RULES_VERSION } from "./provenance.js";
import {
  conditionalSelfKeywords,
  effectsNegated,
  handCounterPower,
  onPlayEffectsNegated,
  staticPowerContributions,
} from "./static-abilities.js";
import { playCostFromHand } from "./hand-price.js";
import { dormantActivation } from "./ability-availability.js";
import { assertTransitionInvariants } from "./invariants.js";
import {
  battleAttackPower,
  currentPower,
  effectiveCost,
  resolveDeckTopKnowledge,
} from "./queries.js";
import {
  drainPendingContinuations,
  mechanicPendingEffect,
  queuePendingContinuations,
  releaseDamageReactions,
} from "./effects.js";
import type {
  BoardCard,
  GameAction,
  GameState,
  PlayerState,
  TransitionResult,
} from "./model.js";
import { nextInt, seedRng, shuffle } from "./rng.js";
import { endBattleIfTargetLeftField } from "./battle.js";
import {
  opponentOf,
  leaderInstanceId,
  hasRush,
  hasRushCharacter,
  counterShortfall,
  recordEventActivation,
  canBlock,
  couldAttackThisTurn,
  hasKeyword,
  survivesEmptyDeck,
} from "./board.js";
import { EngineError } from "./errors.js";
import {
  settleDoubleAttackDamage,
  settleEffectDamage,
  clearBattleScopedPower,
  handOverPendingEffect,
} from "./pending.js";
import { offerDonReturnChoice, resumeStartOfTurn } from "./turn.js";
import {
  callTimeIfDue,
  initialTimeLimit,
  noteLifeDrawn,
  observeTimeLimit,
} from "./time-limit.js";

export interface Callback<T> {
  handle(event: T): void;
  /**
   * The callback only reads the event, so it may be handed the engine's own
   * objects rather than a copy. The default is a private copy per callback, so
   * an observer cannot edit the engine's state or another observer's view;
   * a collector that copies out the few numbers it keeps has no use for one,
   * and a benchmark run makes two such copies of two whole game states on
   * every action.
   */
  readonly readOnly?: boolean;
}

export interface GameTransitionEvent {
  previousState: GameState;
  action: GameAction;
  legalAction: LegalAction;
  result: TransitionResult;
}

/**
 * Delivers `event` to every callback, each on its own copy, and collects what
 * they threw rather than letting one observer's failure reach the next or the
 * caller.
 *
 * `clone` is how that copy is made. It defaults to `structuredClone`, which is
 * correct for any `T`; a caller that knows the event's shape passes something
 * cheaper, and {@link cloneTransitionEvent} is the one for the engine's own
 * transitions.
 */
export function notifyCallbacks<T>(
  callbacks: readonly Callback<T>[],
  event: T,
  clone: (event: T) => T = structuredClone,
): unknown[] {
  const errors: unknown[] = [];
  for (const callback of callbacks) {
    try {
      callback.handle(callback.readOnly ? event : clone(event));
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

/**
 * A private copy of a transition for one callback.
 *
 * Both states in the event carry the game's whole event log, and every
 * transition is delivered to every callback, so cloning the event generically
 * deep-copied the log twice per callback per action -- O(game length) work
 * that grew with the game, and a third of a benchmark transition's time. The
 * log is the one part of a state a transition never edits (see
 * `applyOfferedAction`), so each state's log is copied one level deep: the
 * callback gets its own array to push to, and the engine's log cannot be
 * extended through it. Everything else is copied to the same depth
 * `structuredClone` copied it.
 */
export function cloneTransitionEvent(
  event: GameTransitionEvent,
): GameTransitionEvent {
  return {
    previousState: cloneStateSharingLog(event.previousState),
    action: cloneGameData(event.action),
    legalAction: cloneGameData(event.legalAction),
    result: {
      state: cloneStateSharingLog(event.result.state),
      events: cloneGameData(event.result.events),
    },
  };
}

function cloneStateSharingLog(state: GameState): GameState {
  const { events, ...position } = state;
  return { ...cloneGameData(position), events: [...events] };
}

function makePlayer(
  deck: ResolvedDeck,
  playerId: PlayerId,
  seed: string,
  seedSlot: PlayerId,
  db: CardDatabase,
): { player: PlayerState; rngValue: number } {
  const instances = deck.cards.map((cardNumber, index) => ({
    instanceId: `${playerId}-card-${index + 1}`,
    cardNumber,
  }));
  const openingStage = openingStageOf(deck.leader, instances, db);
  const shuffled = shuffle(
    instances.filter((card) => card !== openingStage),
    seedRng(`${seed}:${seedSlot}`),
  );
  return {
    player: {
      leaderCardNumber: deck.leader,
      deck: shuffled.items.slice(5),
      hand: shuffled.items.slice(0, 5),
      life: [],
      board: [],
      stage: openingStage ? { ...openingStage, rested: false } : null,
      trash: [],
      // The DON!! deck is normally ten. A Leader may print its own size --
      // OP15-058 Enel runs six -- so it is read off the Leader's text rather
      // than hardcoded. One DON!! starts active, as it always has.
      donDeck: Array.from(
        {
          length: Math.max(0, db.facts(deck.leader).donDeckSize - 1),
        },
        (_, index) => `${playerId}-don-${index + 2}`,
      ),
      activeDon: [`${playerId}-don-1`],
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
      activateDonAtEndOfTurn: 0,
      mulliganDecision: "pending",
    },
    rngValue: shuffled.state.value,
  };
}

/**
 * The Stage a Leader plays from its deck at the start of the game, if any.
 *
 * OP13-079 Imu plays up to one {Mary Geoise} Stage this way. The rules place
 * it before the opening hand is drawn, so the card leaves the deck before the
 * shuffle and the hand, the mulligan and Life are all dealt from what is left.
 *
 * The engine takes the play rather than offering it. Nothing is hidden yet
 * when it happens -- the deck is the player's own list and the hand is not
 * drawn -- and a Stage in play for nothing has no downside, so declining it is
 * never the better line. When the deck holds more than one eligible Stage the
 * dearest is played, because the Leader's play is what saves its cost; the pool
 * has two, OP05-097 at 1 and OP13-099 at 7. A deck that ran both and wanted the
 * cheaper one would need this to become a setup decision.
 */
function openingStageOf<T extends { instanceId: string; cardNumber: string }>(
  leader: string,
  instances: readonly T[],
  db: CardDatabase,
): T | undefined {
  const type = db.facts(leader).rules.openingStageType;
  if (!type) return undefined;
  let best: T | undefined;
  for (const card of instances) {
    const facts = db.facts(card.cardNumber);
    if (facts.category !== "stage" || !facts.types.includes(type)) continue;
    if (!best || facts.cost > db.facts(best.cardNumber).cost) best = card;
  }
  return best;
}

/**
 * The identity `seedMode: "matchup"` orders the two seats by. A deck resolved
 * from the catalog carries its id; anything else falls back to its contents, so
 * the order is still total and still a pure function of the decks.
 */
function seedKeyOf(deck: ResolvedDeck): string {
  return deck.seedKey ?? `${deck.leader}:${deck.cards.join(",")}`;
}

export function createGame(input: {
  gameId: string;
  /**
   * The decks to deal, already resolved. The engine does not know what decks
   * exist: a caller that starts from a deck id turns it into a `ResolvedDeck`
   * with `resolveDeck` from `@one-piece-sim/decks` first.
   */
  p1: ResolvedDeck;
  p2: ResolvedDeck;
  seed: string;
  seedMode?: "seat" | "matchup";
  startingPlayer?: PlayerId | "random";
  /**
   * The card pool this game is played against. Defaults to the shipped pool;
   * a caller with a third-party set or a test that wants to scope the card
   * universe passes its own. Not stored on `GameState` -- a `CardDatabase` is
   * not serializable and must not affect the state hash -- so every later
   * call that needs to know what a card is (`getLegalActions`, `applyAction`,
   * `observe`) takes the same database again.
   */
  cards?: CardDatabase;
  /**
   * The tournament time limit, off when absent; see `time-limit.ts`. Kept on
   * the state, so it is part of what a replay must pass to reproduce the game.
   */
  timeLimit?: TimeLimit;
}): GameState {
  const db = input.cards ?? defaultCardDatabase;
  const timeLimit = initialTimeLimit(input.timeLimit);
  const swapSeedSlots =
    input.seedMode === "matchup" && seedKeyOf(input.p1) > seedKeyOf(input.p2);
  const p1SeedSlot: PlayerId = swapSeedSlots ? "p2" : "p1";
  const p2SeedSlot: PlayerId = swapSeedSlots ? "p1" : "p2";
  const p1 = makePlayer(input.p1, "p1", input.seed, p1SeedSlot, db);
  const p2 = makePlayer(input.p2, "p2", input.seed, p2SeedSlot, db);
  const randomStartingSlot =
    nextInt(seedRng(`${input.seed}:starting-player`), 2).value === 0
      ? "p1"
      : "p2";
  const startingPlayer =
    input.startingPlayer === "random"
      ? input.seedMode === "matchup"
        ? p1SeedSlot === randomStartingSlot
          ? "p1"
          : "p2"
        : randomStartingSlot
      : (input.startingPlayer ?? "p1");
  const events: PublicEvent[] = [
    { type: "game-created", activePlayer: startingPlayer },
    ...openingStageEvents(p1.player, "p1"),
    ...openingStageEvents(p2.player, "p2"),
  ];
  const state: GameState = {
    protocolVersion: PROTOCOL_VERSION,
    rulesVersion: RULES_VERSION,
    gameId: input.gameId,
    revision: 0,
    seed: input.seed,
    rngState: { value: p1.rngValue ^ p2.rngValue },
    turn: 1,
    activePlayer: startingPlayer,
    turnPlayerId: startingPlayer,
    phase: "mulligan",
    players: { p1: p1.player, p2: p2.player },
    winner: null,
    resultReason: null,
    ...(timeLimit ? { timeLimit } : {}),
    pendingEffect: null,
    pendingEffectResume: null,
    donReturn: null,
    activeAttack: null,
    pendingTrigger: null,
    oncePerTurn: [],
    eventSequence: 0,
    events,
  };
  // A limit of one turn calls time as the game begins: turn 1 is already
  // under way, and nothing else ever starts it.
  callTimeIfDue(state, events);
  state.eventSequence = events.length;
  return state;
}

function openingStageEvents(
  player: PlayerState,
  playerId: PlayerId,
): PublicEvent[] {
  if (!player.stage) return [];
  return [
    {
      type: "card-played",
      playerId,
      cardInstanceId: player.stage.instanceId,
      cardNumber: player.stage.cardNumber,
    },
  ];
}

export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): LegalAction[] {
  if (state.phase === "finished" || playerId !== state.activePlayer) return [];
  // Order matters and is the rules' own: a pending effect outranks the phase,
  // because nothing else may happen until it resolves. Each generator lives in
  // its own module under `legal-actions/`.
  if (state.phase === "mulligan") return mulliganActions(state);
  if (state.pendingEffect) return pendingEffectActions(state, playerId, db);
  if (state.phase === "block") return blockActions(state, playerId, db);
  if (state.phase === "counter") return counterActions(state, playerId, db);
  if (state.phase === "trigger") return triggerActions(state);
  return mainActions(state, playerId, db);
}

export function canActivate(
  state: GameState,
  playerId: PlayerId,
  sourceInstanceId: string,
): boolean {
  return getLegalActions(state, playerId).some(
    (action) =>
      action.type === "activate-main" &&
      action.optionId.split(":").includes(sourceInstanceId),
  );
}

/**
 * Whether `playerId`'s Leader rewrites the deck-out rule.
 *
 * OP15-022 Brook: "[printed text omitted -- pnpm card:text OP15-022]" Read off the printed text rather than a card-number list, the same way
 * "this Leader cannot attack" is -- both are clauses that change the rules
 * rather than doing anything, so nothing dispatches them and every question has
 * to route through here.
 */

export function applyAction(
  current: GameState,
  action: GameAction,
  db: CardDatabase = defaultCardDatabase,
): TransitionResult {
  assertActionable(current, action);
  const offered = findOfferedAction(
    getLegalActions(current, current.activePlayer, db),
    action.actionId,
  );
  return applyOfferedAction(current, action, offered, db);
}

function assertActionable(current: GameState, action: GameAction): void {
  if (current.phase === "finished")
    throw new EngineError("GAME_FINISHED", "The game has already ended.");
  if (action.revision !== current.revision)
    throw new EngineError(
      "STALE_ACTION",
      "The action was generated for an older revision.",
    );
}

/**
 * `applyAction` for a caller that has just derived `current`'s legal actions
 * itself and found `offered` among them.
 *
 * `GameService.act` and the one-ply simulator both have to look the action up
 * to build it, so going through `applyAction` derived every legal action a
 * second time -- a fifth of a transition's cost in a CPU profile, spent
 * re-answering a question the caller had the answer to. The preconditions are
 * unchanged: `offered` must be one of `getLegalActions(current)` and match
 * `action`, and this is only sound because both callers take `offered` from
 * that call on the same `current`, moments before. A caller holding a legal
 * action from any other state has no business here; `applyAction` is the
 * public path and re-derives on purpose.
 */
export function applyOfferedAction(
  current: GameState,
  action: GameAction,
  offered: LegalAction | undefined,
  db: CardDatabase = defaultCardDatabase,
): TransitionResult {
  assertActionable(current, action);
  if (!offered || offered.type !== action.type)
    throw new EngineError(
      "ILLEGAL_ACTION",
      "The action is not currently legal.",
    );

  // The event log is the one part of a state that only grows, and the one part
  // a transition never reads or edits: handlers append to their own `events`
  // list, and the log is extended once, at the end. So it is carried over by
  // reference rather than deep-copied -- the copy was O(game length) on every
  // action -- and replaced, never pushed to, below. A handler that pushed to
  // `state.events` directly would corrupt the caller's state; none does, and
  // the invariant on `eventSequence` fails the transition that first tries.
  const { events: history, ...position } = current;
  const state: GameState = { ...cloneGameData(position), events: history };
  const events: PublicEvent[] = [];
  const activePlayer = state.activePlayer;
  // The dispatch is a table rather than an `if/else if` chain on
  // `action.type`: the chain could not fail to compile when a new action
  // type appeared, so a missing handler was a silent no-op that still
  // bumped the revision. `ACTION_HANDLERS` is keyed by every member of the
  // union, so the same mistake is now a type error.
  //
  // `offered` is the engine's own legal action, already matched to
  // `action.type` above, so each handler gets both narrowed to its case.
  // The cast is the correlated-union limitation, not a loosening: TS cannot
  // see that the handler picked by `action.type` is the one whose parameter
  // matches this `action`, though the table's type guarantees it.
  const handler = ACTION_HANDLERS[action.type] as ActionHandler<
    GameAction["type"]
  >;
  // An Event whose [Trigger] resolves out of the Life area has not been
  // activated as an Event: Bandai's OP10-003#2 ruling denies Sugar's "when you
  // activate an Event" off one. The hand-written Trigger paths still report
  // the card in the event stream for the log, so it is told apart here, by the
  // card the Trigger step was holding when the action started.
  const triggeredEvent =
    action.type === "resolve-trigger"
      ? state.pendingTrigger?.card.cardNumber
      : undefined;
  handler({ state, events, activePlayer, action, offered, db });
  // OP15-022 Brook's loss belongs to the turn the deck *became* 0, even if a
  // card is put back under it later that turn (OP15-022 Q1), so the moment is
  // noted here, after every action, where `completeEndTurn` can read it.
  for (const playerId of ["p1", "p2"] as const) {
    const player = state.players[playerId];
    if (player.deck.length === 0 && survivesEmptyDeck(state, playerId, db)) {
      player.deckEmptiedOnTurn = state.turn;
    }
  }
  // "If you have activated an Event with a base cost of N or more during this
  // turn" is read off the event stream rather than recorded at each of the ten
  // sites that activate one -- the `[Main]` table, the eight hand-written
  // branches, and the `[Counter]` path, all of which emit `event-activated`.
  const activations: { playerId: PlayerId }[] = [];
  for (const event of events) {
    if (event.type !== "event-activated") continue;
    // Only the Event's [Main] was used, by another card's effect: not an Event
    // activation (EB03-031#1), though the history still shows it resolving.
    if (event.mainOnly === true) continue;
    // Nor is an Event resolving as a [Trigger] (OP10-003#2).
    if (event.cardNumber === triggeredEvent) continue;
    recordEventActivation(
      state,
      event.playerId,
      db.require(event.cardNumber).cost ?? 0,
    );
    activations.push({ playerId: event.playerId });
  }
  // "When you activate an Event" (OP10-003 Sugar's Leader) and "[printed text omitted -- pnpm card:text OP10-003]" (OP11-102 Camie). Raised here, from the event
  // stream, for the same reason the recording above is: all ten activation sites
  // converge on it, and a watcher wired at each of them would drift.
  const activationSignals = activations.map((activation) => ({
    kind: "event-activated" as const,
    playerId: activation.playerId,
  }));
  if (activations.length > 0 && state.pendingEffect) {
    // The Event is still resolving -- it stopped to ask for a target or a
    // payment -- so its watchers wait their turn behind it. Run now, one that
    // needs an answer of its own had nowhere to put it and was lost: OP15-119
    // Monkey.D.Luffy never revealed against an Event that chose a target.
    // `drainPendingContinuations` runs them once the Event settles, and hands
    // each to its controller.
    queuePendingContinuations(
      state,
      getMechanicSignalInvocations(state, activationSignals),
    );
  } else if (activations.length > 0) {
    const reacted = applyMechanicReactions(state, activationSignals, db);
    events.push(...reacted.events);
    // The Event has settled, so a watcher that needs an answer takes the
    // pending slot.
    if (reacted.pending) {
      state.pendingEffect = mechanicPendingEffect(
        {
          context: reacted.pending.execution.context,
          program: { effect: { kind: "sequence", effects: [] } },
        },
        reacted.pending,
        [],
      );
      // The watcher's controller answers it, not whoever activated the Event:
      // a defender's [Counter] Event is what OP15-119 Monkey.D.Luffy and
      // OP06-048 Zeff watch from the attacker's side, and without the hand-over
      // the defender chose the attacker's optional reveal or mill.
      handOverPendingEffect(state);
    }
  }
  // Before `settleEffectDamage`, so a second point of [Double Attack] damage
  // gets its own Trigger window opened by that step in the same transition.
  settleDoubleAttackDamage(state, events);
  settleEffectDamage(state, events);
  endBattleIfTargetLeftField(state);
  clearBattleScopedPower(state);
  // An `[On Play]` the mechanic DSL could not run inline, plus whatever was
  // queued behind it. Here rather than at each dispatch site because this is
  // the only point that is both past every one of them and in charge of the
  // pending slot; see `drainPendingContinuations`.
  releaseDamageReactions(state);
  const pendingBeforeDrain = state.pendingEffect;
  events.push(...drainPendingContinuations(state, db));
  // A clause drained here belongs to whoever owns the card, which is not
  // necessarily whoever owns the turn: ST21-015 Zoro's [On K.O.] fires on the
  // opponent's turn and can put ST31-001 Sanji on the field, and Sanji's own
  // "play up to 1" is then a choice out of Zoro's controller's hand. Every
  // other site that raises a pending effect hands it over before the action
  // ends; the parked ones take the slot after that, and after the resolution
  // that restored the interrupted turn -- so without this the prompt is
  // offered to the turn player, who answers it out of the other hand.
  //
  // Only a pending the drain itself raised. One that was already there was
  // handed over at its own site, and stamping a second `pendingEffectResume`
  // over it would send the turn back to whoever held it then.
  if (state.pendingEffect && state.pendingEffect !== pendingBeforeDrain) {
    handOverPendingEffect(state);
  }
  offerDonReturnChoice(state);
  // Last, so a start-of-turn program's every loose end -- the return choice
  // just offered, a Trigger its damage opened, a reaction drained above -- is
  // answered before the turn it was run ahead of goes on.
  resumeStartOfTurn(state, events);
  // Last, so the Life cards every step above moved -- a Trigger's damage
  // settled after the handler, say -- are all counted.
  noteLifeDrawn(state, events);
  state.revision += 1;
  state.eventSequence += events.length;
  state.events = [...history, ...events];
  assertTransitionInvariants(current, state);
  return { state, events };
}

/**
 * Turn-scoped keyword grants still in force on a Character, for the observation.
 *
 * Printed keywords are deliberately left out: they are on the card, and a
 * viewer can read them. These are the ones that exist nowhere but board state,
 * which is why a Character with granted [Rush] otherwise reads as an ordinary
 * body that inexplicably attacked the turn it landed.
 */
function grantedKeywords(
  state: GameState,
  card: BoardCard,
): GrantedKeywordObservation[] {
  const grants: Array<[GrantableKeyword, number | undefined]> = [
    ["Rush", card.rushUntilTurn],
    ["Rush: Character", card.rushCharacterUntilTurn],
    ["Blocker", card.blockerUntilTurn],
    ["Unblockable", card.unblockableUntilTurn],
    ["Double Attack", card.doubleAttackUntilTurn],
    ["Banish", card.banishUntilTurn],
  ];
  return grants
    .filter(([, until]) => (until ?? -1) >= state.turn)
    .map(([keyword, until]) => ({ keyword, expiresAtTurn: until! }));
}

/**
 * The whole keyword vocabulary, in the order the observation reports it.
 *
 * Written as the keys of an exhaustive record rather than as a plain array, so a
 * seventh keyword added to `CardKeyword` is a type error here instead of
 * silently going unreported to every consumer.
 */
const ALL_KEYWORDS = Object.keys({
  Blocker: null,
  Rush: null,
  "Rush: Character": null,
  Unblockable: null,
  "Double Attack": null,
  Banish: null,
} satisfies Record<CardKeyword, null>) as readonly CardKeyword[];

/**
 * Every keyword in force on one card right now, whatever its source.
 *
 * `grantedKeywords` above reports only the turn-scoped grants, on the stated
 * grounds that a printed keyword can be read off the card. That reasoning has a
 * hole an aura falls straight through: OP16-003 Edward.Newgate gives *its
 * controller's Leader* [Double Attack], and OP15-071 Holly gives every [Ohm]
 * card the same, so the keyword is printed on a card that is not the one
 * carrying it and no amount of reading the target reveals it. The trace that
 * prompted this had an Ace Leader swinging for 2 Life while the observation
 * showed the +2000 from that very clause and said nothing about the keyword.
 *
 * So this reads the engine's own answer -- `hasKeyword`, the query legality and
 * `resolveBattle` use -- rather than any one of the several places a keyword can
 * come from. Printed, conditional (`[DON!! x1]`), turn-scoped and aura-granted
 * all arrive through the same door, which is the only version of this that a
 * future set cannot quietly break. Keywords are public knowledge, so this is on
 * both seats' cards.
 */
function effectiveKeywords(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  db: CardDatabase,
): CardKeyword[] {
  return ALL_KEYWORDS.filter((keyword) =>
    hasKeyword(state, playerId, instanceId, keyword, db),
  );
}

function visibleBoard(
  state: GameState,
  playerId: PlayerId,
  includeAttachedDon: boolean,
  db: CardDatabase,
  // Own side only: a dormant ability's reason can name cards in hand, so the
  // opponent's copy of this block would be answering a question about theirs.
  reportDormant: boolean,
) {
  return state.players[playerId].board.map((instance) => {
    const definition = db.require(instance.cardNumber);
    // A Character normally can't attack the turn it's played -- the same
    // restriction `canAttack` enforces below -- but that base rule left no
    // trace in the observation: a policy had to notice `playedTurn === turn`
    // and separately recall from cardFacts that the card lacks Rush, instead
    // of reading one field. Kept separate from `cannotAttackUntilTurn`, which
    // the web UI already treats as "an effect is holding this down" -- this
    // is the ordinary, no-effect-involved case.
    const summoningSick =
      (instance.playedTurn ?? 0) >= state.turn &&
      !hasRush(state, playerId, instance, db) &&
      !hasRushCharacter(state, playerId, instance, db);
    const grants = grantedKeywords(state, instance);
    // A live "base power becomes N" override stands in for printed power, and
    // the static layer is conditioned on it -- `boardCardPower` reads the same
    // order. Passing the printed figure here left a power-gated aura measured
    // against a base the engine had already replaced.
    const storedBase = storedBasePower(instance.basePowerOverrides, state.turn);
    const basePower = storedBase ?? definition.power ?? 0;
    return {
      instanceId: instance.instanceId,
      cardNumber: instance.cardNumber,
      name: definition.name,
      cost: definition.cost ?? 0,
      currentCost: effectiveCost(state, playerId, instance, db),
      power: definition.power ?? 0,
      rested: instance.rested,
      blocker: canBlock(state, playerId, instance, db),
      // The engine's own answer, rather than the three fields below and a
      // recollection of the base rules. Every stand-in written from them has
      // stopped short of some bar -- see `couldAttack` in the protocol.
      couldAttack: couldAttackThisTurn(
        state,
        playerId,
        instance.instanceId,
        db,
      ),
      playedTurn: instance.playedTurn ?? 0,
      ...(summoningSick ? { summoningSick: true } : {}),
      ...(instance.cannotAttackUntilTurn === undefined
        ? {}
        : { cannotAttackUntilTurn: instance.cannotAttackUntilTurn }),
      ...(instance.cannotAttackSourceCardNumber === undefined
        ? {}
        : {
            cannotAttackSourceCardNumber: instance.cannotAttackSourceCardNumber,
          }),
      ...(instance.cannotRestUntilTurn === undefined
        ? {}
        : { cannotRestUntilTurn: instance.cannotRestUntilTurn }),
      ...(instance.cannotRestSourceCardNumber === undefined
        ? {}
        : {
            cannotRestSourceCardNumber: instance.cannotRestSourceCardNumber,
          }),
      ...(instance.cannotRefreshUntilTurn === undefined
        ? {}
        : { cannotRefreshUntilTurn: instance.cannotRefreshUntilTurn }),
      ...(effectsNegated(state, instance.instanceId) ? { negated: true } : {}),
      ...(grants.length ? { grantedKeywords: grants } : {}),
      ...((instance.attacksActiveUntilTurn ?? -1) >= state.turn
        ? { attacksActiveUntilTurn: instance.attacksActiveUntilTurn }
        : {}),
      effectiveKeywords: effectiveKeywords(
        state,
        playerId,
        instance.instanceId,
        db,
      ),
      // What the card's own text can switch on, met or not. `keywords: none`
      // on a Character whose [Rush] is one DON!! placement away is true and
      // useless, and the summoning-sick line above says the same thing more
      // firmly.
      ...(conditionalSelfKeywords(instance.cardNumber).length
        ? { conditionalKeywords: conditionalSelfKeywords(instance.cardNumber) }
        : {}),
      ...(reportDormant
        ? ((): { dormantAbility?: DormantAbilityObservation } => {
            const dormant = dormantActivation(state, playerId, instance, db);
            return dormant ? { dormantAbility: dormant } : {};
          })()
        : {}),
      attachedDon: instance.attachedDon?.length ?? 0,
      currentPower: currentPower(
        state,
        playerId,
        instance.instanceId,
        includeAttachedDon,
        db,
      ),
      // See the Leader's field of the same name: present only when it differs
      // from the printed power the rest of the block is deltas off.
      ...(basePower === (definition.power ?? 0) ? {} : { basePower }),
      powerModifiers: (instance.powerModifiers ?? [])
        .filter((modifier) => modifier.expiresAtTurn >= state.turn)
        .map((modifier) => ({ ...modifier })),
      staticPowerModifiers: staticPowerContributions(
        state,
        playerId,
        instance,
        false,
        basePower,
        db,
        storedBase !== undefined,
      ).map(({ cardNumber, amount }) => ({
        sourceCardNumber: cardNumber,
        amount,
      })),
    };
  });
}

function visibleStage(
  state: GameState,
  playerId: PlayerId,
  stage: PlayerState["stage"],
  db: CardDatabase,
  reportDormant: boolean,
) {
  if (!stage) return null;
  const definition = db.require(stage.cardNumber);
  const dormant = reportDormant
    ? dormantActivation(state, playerId, stage, db)
    : undefined;
  return {
    instanceId: stage.instanceId,
    cardNumber: stage.cardNumber,
    name: definition.name,
    cost: definition.cost ?? 0,
    rested: stage.rested,
    ...(dormant ? { dormantAbility: dormant } : {}),
  };
}

/**
 * The live half of `PlayerState.installedReplacements`, as the observation
 * carries it.
 *
 * Filtered by expiry here rather than cleaned up when the turn ends, the same
 * way every other turn-scoped flag on the state is read: a booking whose window
 * has closed is simply not returned. Absent when there is none, so an
 * observation of a game that never plays EB02-030 is unchanged.
 */
function installedReplacementsView(
  state: GameState,
  player: GameState["players"][PlayerId],
): { installedReplacements?: readonly string[] } {
  const live = (player.installedReplacements ?? [])
    .filter((entry) => entry.expiresAtTurn >= state.turn)
    .map((entry) => entry.cardNumber);
  return live.length > 0 ? { installedReplacements: live } : {};
}

function visibleLeader(
  state: GameState,
  playerId: PlayerId,
  includeAttachedDon: boolean,
  db: CardDatabase,
  reportDormant: boolean,
) {
  const player = state.players[playerId];
  const definition = db.require(player.leaderCardNumber);
  const storedBase = storedBasePower(player.leaderBasePowers, state.turn);
  const printed = storedBase ?? definition.power ?? 0;
  const leaderGrants: GrantedKeywordObservation[] = (
    [
      ["Unblockable", player.leaderUnblockableUntilTurn],
      ["Double Attack", player.leaderDoubleAttackUntilTurn],
      ["Blocker", player.leaderBlockerUntilTurn],
    ] as Array<[GrantableKeyword, number | undefined]>
  )
    .filter(([, until]) => (until ?? -1) >= state.turn)
    .map(([keyword, until]) => ({ keyword, expiresAtTurn: until! }));
  return {
    cardNumber: player.leaderCardNumber,
    name: definition.name,
    power: definition.power ?? 0,
    rested: player.leaderRested,
    // A Leader's `!rested` is the reading that looks complete and is not: the
    // two first turns of the game bar every battle, and three more bars are
    // printed on the Leader or held over it. See `couldAttack` in the protocol.
    couldAttack: couldAttackThisTurn(
      state,
      playerId,
      leaderInstanceId(playerId),
      db,
    ),
    ...((player.leaderCannotRefreshUntilTurn ?? -1) >= state.turn
      ? { cannotRefreshUntilTurn: player.leaderCannotRefreshUntilTurn }
      : {}),
    attachedDon: player.leaderAttachedDon.length,
    currentPower: currentPower(
      state,
      playerId,
      leaderInstanceId(playerId),
      includeAttachedDon,
      db,
    ),
    // Only when it actually replaces the printed figure: every other consumer
    // of this block reads deltas off a base, and without this one the base they
    // start from is the wrong number by the whole "becomes N".
    ...(printed === (definition.power ?? 0) ? {} : { basePower: printed }),
    leaderReactionSpent: leaderReactionSpent(state, playerId),
    powerModifiers: structuredClone(
      player.leaderPowerModifiers.filter(
        (modifier) => modifier.expiresAtTurn >= state.turn,
      ),
    ),
    staticPowerModifiers: staticPowerContributions(
      state,
      playerId,
      {
        instanceId: leaderInstanceId(playerId),
        cardNumber: player.leaderCardNumber,
      },
      true,
      printed,
      db,
      storedBase !== undefined,
    ).map(({ cardNumber, amount }) => ({
      sourceCardNumber: cardNumber,
      amount,
    })),
    // A Leader has no BoardCard, so its turn-scoped grants live on the
    // player -- see `leaderUnblockableUntilTurn`.
    ...(leaderGrants.length ? { grantedKeywords: leaderGrants } : {}),
    ...((player.leaderAttacksActiveUntilTurn ?? -1) >= state.turn
      ? { attacksActiveUntilTurn: player.leaderAttacksActiveUntilTurn }
      : {}),
    effectiveKeywords: effectiveKeywords(
      state,
      playerId,
      leaderInstanceId(playerId),
      db,
    ),
    ...(conditionalSelfKeywords(player.leaderCardNumber).length
      ? {
          conditionalKeywords: conditionalSelfKeywords(player.leaderCardNumber),
        }
      : {}),
    ...(reportDormant
      ? ((): { dormantAbility?: DormantAbilityObservation } => {
          const dormant = dormantActivation(
            state,
            playerId,
            {
              instanceId: leaderInstanceId(playerId),
              cardNumber: player.leaderCardNumber,
            },
            db,
          );
          return dormant ? { dormantAbility: dormant } : {};
        })()
      : {}),
  };
}

/**
 * Card numbers the viewer may legitimately identify in the current state.
 *
 * Deliberately built from the observation's own visible surfaces rather than
 * from the deck manifests: a policy learns what a card *is* only once it can
 * see it, so the facts dictionary can never answer "what is still in the
 * opponent's deck".
 */
function visibleCardNumbers(
  state: GameState,
  viewer: PlayerId,
  actions: readonly LegalAction[],
): Set<string> {
  const numbers = new Set<string>();
  for (const playerId of ["p1", "p2"] as const) {
    const player = state.players[playerId];
    numbers.add(player.leaderCardNumber);
    for (const card of player.board) numbers.add(card.cardNumber);
    for (const card of player.trash) numbers.add(card.cardNumber);
    if (player.stage) numbers.add(player.stage.cardNumber);
    for (const card of player.life)
      if (card.faceUp) numbers.add(card.cardNumber);
    // Own hand only; the opponent's hand stays a count.
    if (playerId === viewer)
      for (const card of player.hand) numbers.add(card.cardNumber);
  }
  const knowledge = [
    state.players[viewer].knownOwnDeckTop,
    state.players[viewer].knownOpponentDeckTop,
  ];
  for (const known of knowledge) if (known) numbers.add(known.cardNumber);
  // The Life card a Trigger window is offering, for the player deciding about
  // it. Not for the attacker: until it is activated they are not entitled to
  // its identity, and an entry in `cardFacts` is that identity.
  if (
    state.pendingTrigger &&
    (state.pendingTrigger.playerId === viewer ||
      state.pendingTrigger.card.faceUp === true)
  ) {
    numbers.add(state.pendingTrigger.card.cardNumber);
  }
  // Anything an offered action names is by definition something the viewer is
  // being asked to decide about, e.g. a card revealed by a search.
  for (const action of actions) {
    if (action.type === "resolve-effect") {
      numbers.add(action.sourceCardNumber);
      if (action.optionCardNumber) numbers.add(action.optionCardNumber);
      if (action.option.kind === "card") {
        numbers.add(action.option.card.cardNumber);
        if (action.option.via) numbers.add(action.option.via.cardNumber);
      }
    }
  }
  return numbers;
}

export function observe(
  state: GameState,
  viewer: PlayerId,
  db: CardDatabase = defaultCardDatabase,
  /**
   * `getLegalActions(state, viewer, db)`, when the caller has already derived
   * it. `GameService` derives a state's legal actions once and hands the same
   * list to the observation that offers them and to the `act` that consumes
   * one; without this the list was built twice per transition.
   */
  legalActions: LegalAction[] = getLegalActions(state, viewer, db),
): GameObservation {
  const self = state.players[viewer];
  const opponent = state.players[opponentOf(viewer)];
  const turnPlayer = state.turnPlayerId;
  let stateHash: string | undefined;
  // The whole stack, top-first, with identities on the face-up cards only. A
  // face-down Life card is hidden from its owner too, so both sides project the
  // same way.
  const visibleLife = (player: PlayerState): LifeCardObservation[] =>
    player.life.map((instance) =>
      instance.faceUp
        ? {
            instanceId: instance.instanceId,
            faceUp: true,
            cardNumber: instance.cardNumber,
            name: db.require(instance.cardNumber).name,
          }
        : { faceUp: false },
    );
  return {
    gameId: state.gameId,
    revision: state.revision,
    viewer,
    turn: state.turn,
    activePlayer: state.activePlayer,
    turnPlayer,
    phase: state.phase,
    winner: state.winner,
    resultReason: state.resultReason,
    ...(state.timeLimit
      ? { timeLimit: observeTimeLimit(state, state.timeLimit) }
      : {}),
    self: {
      hand: self.hand.map((instance) => {
        const card = db.require(instance.cardNumber);
        const printedCost = card.cost ?? 0;
        return {
          instanceId: instance.instanceId,
          cardNumber: instance.cardNumber,
          name: card.name,
          cost: printedCost,
          // The price `mainActions` and `applyPlayCard` will charge, read
          // through the same function they read -- never re-derived here, or
          // the observation would be a second opinion on what a card costs.
          // `spend: false`: this is a look, and a discount is consumed by
          // playing the card, not by watching it.
          currentCost: playCostFromHand(
            state,
            viewer,
            instance.cardNumber,
            printedCost,
            { spend: false },
            db,
          ),
          counter: card.counter ?? 0,
          // Read through the same helper `counterActions` reads, for the
          // reason `currentCost` above is read through `playCostFromHand`: a
          // second opinion here is a policy defending on arithmetic the
          // engine disagrees with.
          currentCounter:
            (card.counter ?? 0) +
            handCounterPower(state, viewer, instance.cardNumber, db),
        };
      }),
      onPlayNegated: onPlayEffectsNegated(state, viewer, db),
      deckCount: self.deck.length,
      lifeCount: self.life.length,
      life: visibleLife(self),
      activeDon: self.activeDon.length,
      restedDon: self.restedDon.length,
      donDeckCount: self.donDeck.length,
      ...(self.donHeldFromRefresh
        ? { donHeldFromRefresh: self.donHeldFromRefresh }
        : {}),
      ...(self.donRestedAtNextMain
        ? { donRestedAtNextMain: self.donRestedAtNextMain }
        : {}),
      ...(self.extraTurns ? { extraTurns: self.extraTurns } : {}),
      ...installedReplacementsView(state, self),
      trash: self.trash.map((instance) => ({
        cardNumber: instance.cardNumber,
        name: db.require(instance.cardNumber).name,
      })),
      leader: visibleLeader(state, viewer, viewer === turnPlayer, db, true),
      board: visibleBoard(state, viewer, viewer === turnPlayer, db, true),
      stage: visibleStage(state, viewer, self.stage, db, true),
      knowledge: {
        ownDeckTop: resolveDeckTopKnowledge(
          state,
          viewer,
          self.knownOwnDeckTop,
        ),
        opponentDeckTop: resolveDeckTopKnowledge(
          state,
          opponentOf(viewer),
          self.knownOpponentDeckTop,
        ),
      },
    },
    opponent: {
      handCount: opponent.hand.length,
      onPlayNegated: onPlayEffectsNegated(state, opponentOf(viewer), db),
      deckCount: opponent.deck.length,
      lifeCount: opponent.life.length,
      life: visibleLife(opponent),
      activeDon: opponent.activeDon.length,
      restedDon: opponent.restedDon.length,
      donDeckCount: opponent.donDeck.length,
      ...(opponent.donHeldFromRefresh
        ? { donHeldFromRefresh: opponent.donHeldFromRefresh }
        : {}),
      ...(opponent.donRestedAtNextMain
        ? { donRestedAtNextMain: opponent.donRestedAtNextMain }
        : {}),
      ...(opponent.extraTurns ? { extraTurns: opponent.extraTurns } : {}),
      ...installedReplacementsView(state, opponent),
      trash: opponent.trash.map((instance) => ({
        cardNumber: instance.cardNumber,
        name: db.require(instance.cardNumber).name,
      })),
      leader: visibleLeader(
        state,
        opponentOf(viewer),
        opponentOf(viewer) === turnPlayer,
        db,
        false,
      ),
      board: visibleBoard(
        state,
        opponentOf(viewer),
        opponentOf(viewer) === turnPlayer,
        db,
        false,
      ),
      stage: visibleStage(state, opponentOf(viewer), opponent.stage, db, false),
    },
    activeBattle: state.activeAttack
      ? ((): GameObservation["activeBattle"] => {
          const attack = state.activeAttack;
          // The target can already be gone here even though `activeAttack`
          // hasn't been cleared yet: `endBattleIfTargetLeftField` defers
          // ending the battle while a pending effect owns the phase (e.g.
          // OP17-033 Lucky Roux trashing itself as its own reactive-ability
          // cost, mid-battle, then immediately offering a follow-up choice),
          // and `observe` runs before that deferred cleanup gets a chance to
          // run. Reporting 0 rather than calling `currentPower` avoids a
          // MISSING_CARD throw for a battle that is about to end anyway.
          const targetIsLeader =
            attack.targetInstanceId ===
            leaderInstanceId(attack.defenderPlayerId);
          const targetStillOnField =
            targetIsLeader ||
            state.players[attack.defenderPlayerId].board.some(
              (card) => card.instanceId === attack.targetInstanceId,
            );
          const targetPower = targetStillOnField
            ? currentPower(
                state,
                attack.defenderPlayerId,
                attack.targetInstanceId,
                false,
                db,
              )
            : 0;
          const offense = battleAttackPower(state, db);
          return {
            attackerInstanceId: attack.attackerInstanceId,
            targetInstanceId: attack.targetInstanceId,
            attackPower: offense,
            targetPower,
            counterPower: attack.counterPower,
            counterShortfall: counterShortfall(
              offense,
              targetPower + attack.counterPower,
            ),
            // Life this hit takes if it lands: 2 for a [Double Attack]
            // attacker, 1 otherwise, 0 against a Character -- and never more
            // than the defender actually holds. The cap is the rule, not
            // presentation: each point of [Double Attack] damage checks a Life
            // card, so against a defender on 1 Life the hit takes one card and
            // the second point does nothing (see `settleDoubleAttackDamage`).
            //
            // Stated because the defender's whole decision turns on it, and
            // every consumer that assumed one Life per hit -- `turnBrief`,
            // `tactics`, the prompt's Lethal section, and the Counter and Block
            // gates in `generic-policy.ts` -- read this number instead.
            lifeCost: targetIsLeader
              ? Math.min(
                  hasKeyword(
                    state,
                    attack.attackerPlayerId,
                    attack.attackerInstanceId,
                    "Double Attack",
                    db,
                  )
                    ? 2
                    : 1,
                  state.players[attack.defenderPlayerId].life.length,
                )
              : 0,
          };
        })()
      : null,
    // Which Life card is being offered is the owner's information until they
    // activate it, the same secret the private `card-revealed` above keeps.
    pendingTriggerCardNumber:
      state.pendingTrigger &&
      (state.pendingTrigger.playerId === viewer ||
        state.pendingTrigger.card.faceUp === true)
        ? state.pendingTrigger.card.cardNumber
        : null,
    cardFacts: Object.fromEntries(
      [...visibleCardNumbers(state, viewer, legalActions)]
        .sort()
        .map((cardNumber) => [cardNumber, db.facts(cardNumber)]),
    ),
    legalActions,
    // A private look must not leak through the event log to the player whose
    // deck was looked at, so filter rather than exposing the raw stream.
    //
    // A private *gain* is different: when a face-down Life card goes to its
    // owner's hand, both players are entitled to know the step happened -- it is
    // why the Life total dropped -- and only the owner is entitled to the card's
    // name. Those are redacted rather than dropped, so the opponent still sees
    // "a card moved from Life to hand" with no name on it.
    publicEvents: state.events
      .filter(
        (event) =>
          event.type !== "card-revealed" ||
          event.visibleTo === undefined ||
          event.visibleTo === viewer,
      )
      .map((event) =>
        event.type === "card-moved" &&
        event.identityVisibleTo !== undefined &&
        event.identityVisibleTo !== viewer
          ? { ...event, cardInstanceId: null, cardNumber: null }
          : event,
      ),
    // Hashed on first read: serializing and hashing the whole position is
    // the most expensive step of an observation, and most readers -- every
    // rules agent, and a simulation that only wants the result -- never look
    // at it. A replay check or a seat that sends it still gets it, from the
    // same position: the service never mutates a state it has handed out.
    get stateHash(): string {
      return (stateHash ??= hashState(hashedPosition(state)));
    },
  };
}

/**
 * What `stateHash` covers: the position, not the history that reached it.
 *
 * The hash used to cover the whole state, event log included, which made
 * hashing both the most expensive step of an observation and one that grew
 * with every action taken -- the log only ever gets longer. What the hash is
 * *for* is unchanged: confirming that a replay reproduced the recorded game.
 * Two states that agree on every zone, `revision`, `eventSequence` and
 * `rngState` were reached by the same actions under the same rules, so a
 * divergence shows up here just as it did before -- and `publicEvents` travels
 * beside the hash in the same observation, so a caller that wants to compare
 * the narration still can.
 *
 * Changing what is hashed changes every hash: `pnpm fixtures:record` re-records
 * the replay fixtures, and traces recorded by an older build report as
 * incompatible rather than silently mismatching, which is what
 * `provenance.ts` is for.
 */
export function hashedPosition(state: GameState): Partial<GameState> {
  const position: Partial<GameState> = { ...state };
  delete position.events;
  return position;
}
