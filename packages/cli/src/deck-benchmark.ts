import { acceptsSimulator, type Agent } from "@one-piece-sim/agents/local";
import { createRulesAgent } from "./agent-factory.js";
import {
  GameService,
  hashState,
  type Callback,
  type GameState,
  type GameTransitionEvent,
} from "@one-piece-sim/engine-core";
import {
  DECK_VARIANT_OF,
  FORMAT_DECK_IDS,
  isDeckVariantPair,
  requireSupportedDeck,
  resolveDeck,
  SELECTABLE_DECK_IDS,
} from "@one-piece-sim/decks";
import type {
  GameObservation,
  GameResultReason,
  LegalAction,
  PlayerId,
  PublicEvent,
} from "@one-piece-sim/protocol";

export const BENCHMARK_SCHEMA_VERSION = 2;
/**
 * Decks a benchmark run may include: every deck a 1v1 game can be set up with.
 *
 * This used to be the six format decks plus a hand-picked three, which meant the
 * benchmark's field and the app's field were different sets and a deck could be
 * playable for months without ever being measured -- the OP14 and OP17
 * tournament lists were in exactly that state, and `registry.ts` records a
 * rejected heuristic whose own trace came from a deck the instrument could not
 * see. Deriving it from `SELECTABLE_DECK_IDS` makes "shipped in the app" and
 * "benchmarked" the same claim.
 */
export const BENCHMARK_DECK_IDS = SELECTABLE_DECK_IDS;
export type BenchmarkDeckId = (typeof BENCHMARK_DECK_IDS)[number];

export interface CardGameMetrics {
  openingCopies: number;
  seenCopies: number;
  plays: number;
  activations: number;
  counters: number;
  attacks: number;
  blocks: number;
}

/**
 * One decision a rules agent made, as the attribution census reads them.
 *
 * `moduleId` is `undefined` exactly when no registered module decided and the
 * agent fell through to `chooseGenericRules` -- which is the signal the census
 * exists to count, so it is carried as-is rather than defaulted to a label here.
 */
export interface BenchmarkDecision {
  deck: BenchmarkDeckId;
  opponentDeck: BenchmarkDeckId;
  seat: PlayerId;
  phase: string;
  actionType: string;
  moduleId: string | undefined;
  /** Modules that narrowed the candidates without owning the choice. */
  narrowedBy: readonly string[];
  /** Legal actions offered. See {@link PlayedDecision.candidates}. */
  candidates: number;
}

/**
 * Observer for every decision of a benchmark run.
 *
 * A hook rather than a field on `BenchmarkGame`: a 2100-game run makes roughly
 * 380,000 decisions, so a report that carried them would be two orders of
 * magnitude larger than the one anybody reads. The census aggregates as they
 * arrive and keeps counters.
 *
 * Cannot cross a shard boundary -- a callback is not IPC-serializable -- so a
 * caller that passes one gets the single-process path. `tools/attribution-census.ts`
 * shards by calling `runBenchmark` once per worker and merging the counters.
 */
export type BenchmarkDecisionObserver = (decision: BenchmarkDecision) => void;

export interface BenchmarkGame {
  seed: string;
  p1Deck: BenchmarkDeckId;
  p2Deck: BenchmarkDeckId;
  startingPlayer: PlayerId;
  winnerPlayer: PlayerId | null;
  winnerDeck: BenchmarkDeckId | null;
  resultReason: GameResultReason | null;
  turns: number;
  actions: number;
  completed: boolean;
  stateHash: string;
  /**
   * Hash of the ordered engine event stream for the whole game. Unlike
   * `stateHash` this ignores the shape of `GameState`, so a refactor that adds
   * or renames state fields leaves it untouched while any change to what
   * actually happened in the game changes it. Use it to tell a behaviour-
   * preserving refactor apart from a behaviour change.
   */
  eventHash: string;
  cardMetrics: Record<PlayerId, Record<string, CardGameMetrics>>;
}

export interface CardStatistics {
  cardNumber: string;
  copies: number;
  games: number;
  wins: number;
  gamesSeen: number;
  seenWins: number;
  seenWinRate: number;
  gamesNotSeen: number;
  notSeenWins: number;
  notSeenWinRate: number;
  winRateDelta: number;
  gamesUsed: number;
  winsUsed: number;
  winUsageRate: number;
  lossesUsed: number;
  lossUsageRate: number;
  openingCopies: number;
  seenCopies: number;
  plays: number;
  activations: number;
  counters: number;
  attacks: number;
  blocks: number;
}

export interface DeckStatistics {
  deck: BenchmarkDeckId;
  games: number;
  wins: number;
  losses: number;
  incomplete: number;
  winRate: number;
  p1Games: number;
  p1Wins: number;
  p2Games: number;
  p2Wins: number;
  startedGames: number;
  startedWins: number;
  averageTurns: number;
  averageActions: number;
  cards: CardStatistics[];
}

export interface MatchupStatistics {
  decks: [BenchmarkDeckId, BenchmarkDeckId];
  games: number;
  incomplete: number;
  wins: Record<string, number>;
  winRates: Record<string, number>;
}

export interface BenchmarkReport {
  schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  rulesVersion: string;
  createdAt: string;
  configuration: {
    mode: "one-vs-all" | "all-vs-all";
    focusDeck: BenchmarkDeckId | null;
    decks: BenchmarkDeckId[];
    seedsPerMatchup: number;
    pairedSeats: true;
    seedPrefix: string;
    maxActions: number;
  };
  summary: {
    games: number;
    completed: number;
    incomplete: number;
    averageTurns: number;
    averageActions: number;
    decks: DeckStatistics[];
    matchups: MatchupStatistics[];
  };
  games: BenchmarkGame[];
}

export interface RunBenchmarkOptions {
  mode: "one-vs-all" | "all-vs-all";
  /** Called for every decision, in play order. See {@link BenchmarkDecisionObserver}. */
  onDecision?: BenchmarkDecisionObserver;
  focusDeck?: BenchmarkDeckId;
  decks?: readonly BenchmarkDeckId[];
  /** Opponent field for `one-vs-all`; ignored when `decks` is given. */
  field?: BenchmarkField;
  seedsPerMatchup: number;
  seedPrefix: string;
  rulesVersion: string;
  maxActions?: number;
  /**
   * Play only the matchups at positions `index, index + count, ...` of the pair
   * list, for running one slice of a benchmark in its own process.
   *
   * Every game is a pure function of (decks, seed, seat) -- the engine RNG is
   * seeded and nothing reads the clock -- so a slice's rows are identical to the
   * rows the same games produce in a whole-field run. That is what makes
   * {@link mergeShardedReports} exact rather than approximate, and it is why the
   * unit of a shard is a whole matchup: a pair's two seats share a seed, and
   * keeping them together keeps a shard's rows in the order the merge expects.
   */
  shard?: { index: number; count: number };
  onProgress?: (completed: number, total: number) => void;
}

export interface BenchmarkFilter {
  deck?: BenchmarkDeckId;
  opponent?: BenchmarkDeckId;
  seat?: PlayerId;
  winner?: BenchmarkDeckId;
  incompleteOnly?: boolean;
}

export async function runBenchmark(
  options: RunBenchmarkOptions,
): Promise<BenchmarkReport> {
  // `one-vs-all` plays the whole app roster unless `--field format` asks for
  // the six starter decks; `all-vs-all` is the field-wide sweep. Either way a
  // variant of the focus deck is dropped, because playing a deck against a
  // variant of itself compares a deck with itself. See `BenchmarkField`.
  const decks = [
    ...(options.decks ??
      defaultBenchmarkDecks(options.mode, options.focusDeck, options.field)),
  ];
  const maxActions = options.maxActions ?? 800;
  const allPairs = buildPairs(options.mode, decks, options.focusDeck);
  const shard = options.shard;
  if (
    shard &&
    (shard.count < 1 || shard.index < 0 || shard.index >= shard.count)
  )
    throw new Error("Benchmark shard index must be within [0, count)");
  const pairs = shard
    ? allPairs.filter((_, index) => index % shard.count === shard.index)
    : allPairs;
  const total = pairs.length * options.seedsPerMatchup * 2;
  const games: BenchmarkGame[] = [];

  for (const [left, right] of pairs) {
    for (let index = 0; index < options.seedsPerMatchup; index += 1) {
      const seed = `${options.seedPrefix}-${seedDeckId(left)}-${seedDeckId(right)}-${index}`;
      games.push(
        await playGame(left, right, seed, maxActions, options.onDecision),
      );
      options.onProgress?.(games.length, total);
      games.push(
        await playGame(right, left, seed, maxActions, options.onDecision),
      );
      options.onProgress?.(games.length, total);
    }
  }

  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    rulesVersion: options.rulesVersion,
    createdAt: new Date().toISOString(),
    configuration: {
      mode: options.mode,
      focusDeck: options.focusDeck ?? null,
      decks,
      seedsPerMatchup: options.seedsPerMatchup,
      pairedSeats: true,
      seedPrefix: options.seedPrefix,
      maxActions,
    },
    summary: summarizeGames(games),
    games,
  };
}

/**
 * The name a deck contributes to a seed string.
 *
 * A variant seeds as the deck it varies, so its matchups play the same
 * shuffles as the deck it varies and the two are directly comparable -- that
 * comparison is the whole point of shipping the variant.
 */
function seedDeckId(deck: BenchmarkDeckId): string {
  return DECK_VARIANT_OF[deck] ?? deck;
}

export function filterReport(
  report: BenchmarkReport,
  filter: BenchmarkFilter,
): BenchmarkReport {
  const games = report.games.filter((game) => {
    if (filter.deck && !hasDeck(game, filter.deck)) return false;
    if (filter.opponent) {
      if (!filter.deck || filter.opponent === filter.deck) return false;
      if (!hasDeck(game, filter.opponent)) return false;
    }
    if (
      filter.seat &&
      filter.deck &&
      game[`${filter.seat}Deck`] !== filter.deck
    )
      return false;
    if (filter.winner && game.winnerDeck !== filter.winner) return false;
    if (filter.incompleteOnly && game.completed) return false;
    return true;
  });
  return { ...report, summary: summarizeGames(games), games };
}

export function summarizeGames(
  games: readonly BenchmarkGame[],
): BenchmarkReport["summary"] {
  const completed = games.filter((game) => game.completed);
  const deckIds = [
    ...new Set(games.flatMap((game) => [game.p1Deck, game.p2Deck])),
  ].sort();
  const decks = deckIds.map((deck) => summarizeDeck(deck, games));
  const matchupGroups = new Map<string, BenchmarkGame[]>();
  for (const game of games) {
    const pair = [game.p1Deck, game.p2Deck].sort() as [
      BenchmarkDeckId,
      BenchmarkDeckId,
    ];
    const key = pair.join(":");
    const group = matchupGroups.get(key) ?? [];
    group.push(game);
    matchupGroups.set(key, group);
  }
  const matchups = [...matchupGroups.values()].map(summarizeMatchup);
  return {
    games: games.length,
    completed: completed.length,
    incomplete: games.length - completed.length,
    averageTurns: average(games.map((game) => game.turns)),
    averageActions: average(games.map((game) => game.actions)),
    decks,
    matchups,
  };
}

/**
 * The matchups a run plays, in the order it plays them.
 *
 * Exported so a caller that splits a run across processes can compute the same
 * ordering the shards were cut from, which is what {@link mergeShardedReports}
 * reassembles against.
 */
export function benchmarkPairs(
  mode: RunBenchmarkOptions["mode"],
  decks: readonly BenchmarkDeckId[],
  focusDeck?: BenchmarkDeckId,
): Array<[BenchmarkDeckId, BenchmarkDeckId]> {
  return buildPairs(mode, decks, focusDeck);
}

/**
 * The decks a run plays when the caller names none, for the given mode.
 *
 * Shard workers are handed an explicit deck list so that the parent's field and
 * the children's fields cannot drift apart between processes; this is how the
 * parent works out what to hand them.
 */
export function defaultBenchmarkDecks(
  mode: RunBenchmarkOptions["mode"],
  focusDeck?: BenchmarkDeckId,
  field: BenchmarkField = "roster",
): readonly BenchmarkDeckId[] {
  if (mode === "all-vs-all") return BENCHMARK_DECK_IDS;
  const opponents = field === "format" ? FORMAT_DECK_IDS : BENCHMARK_DECK_IDS;
  if (!focusDeck) return opponents;
  return [
    focusDeck,
    ...opponents.filter(
      (deck) => deck !== focusDeck && !isDeckVariantPair(deck, focusDeck),
    ),
  ];
}

/**
 * Which opponents a `one-vs-all` run plays.
 *
 * `roster` is every deck the app ships, and is the default because it is the
 * field a deck is actually asked to beat. `format` is the six starter decks,
 * kept because several measurements in this repository's comments were taken
 * against them and are only reproducible against them.
 *
 * The default used to be `format`, justified in a comment as comparability with
 * baselines in `analysis/` -- which is gitignored, and which
 * `.claude/skills/audit-deck-policy` records as never committed. That cost more
 * than it bought: OP-14 Green Mihawk reads 68.9% against the six and 53.9%
 * against the roster, and the two matchups it loses worst -- OP-17 Ace and
 * OP-17 Sabo Elbaph -- are not in the six at all, so the instrument every deck
 * audit ran could not see the games the deck was losing.
 */
export type BenchmarkField = "format" | "roster";

/**
 * Reassembles sharded reports into the report a single-process run would have
 * produced, byte for byte.
 *
 * The ordering is recovered from the pair list rather than from the shards: for
 * each matchup in canonical order, take that matchup's rows from whichever shard
 * played it, in that shard's own order (which is seed order, then seat). A row
 * carries both deck ids, so "that matchup's rows" needs no extra bookkeeping in
 * the wire format, and a shard that silently played the wrong pairs shows up as a
 * game-count mismatch instead of a reordered report.
 */
export function mergeShardedReports(
  reports: readonly BenchmarkReport[],
  pairs: readonly [BenchmarkDeckId, BenchmarkDeckId][],
): BenchmarkGame[] {
  const byMatchup = new Map<string, BenchmarkGame[]>();
  for (const report of reports)
    for (const game of report.games) {
      const key = matchupKey(game.p1Deck, game.p2Deck);
      const rows = byMatchup.get(key) ?? [];
      rows.push(game);
      byMatchup.set(key, rows);
    }
  const merged = pairs.flatMap(
    ([left, right]) => byMatchup.get(matchupKey(left, right)) ?? [],
  );
  const expected = reports.reduce(
    (total, report) => total + report.games.length,
    0,
  );
  if (merged.length !== expected)
    throw new Error(
      `Sharded benchmark merge lost rows: ${merged.length} of ${expected}`,
    );
  return merged;
}

function matchupKey(left: BenchmarkDeckId, right: BenchmarkDeckId): string {
  return [left, right].sort().join("|");
}

function buildPairs(
  mode: RunBenchmarkOptions["mode"],
  decks: readonly BenchmarkDeckId[],
  focusDeck?: BenchmarkDeckId,
): Array<[BenchmarkDeckId, BenchmarkDeckId]> {
  if (new Set(decks).size !== decks.length || decks.length < 2)
    throw new Error(
      "Benchmark decks must contain at least two unique deck IDs",
    );
  if (mode === "one-vs-all") {
    if (!focusDeck || !decks.includes(focusDeck))
      throw new Error(
        "one-vs-all requires a focus deck in the benchmark deck list",
      );
    return decks
      .filter((deck) => deck !== focusDeck)
      .map((deck) => [focusDeck, deck]);
  }
  const pairs: Array<[BenchmarkDeckId, BenchmarkDeckId]> = [];
  for (let left = 0; left < decks.length; left += 1) {
    for (let right = left + 1; right < decks.length; right += 1) {
      // A deck and its own variant share a Leader, and so a policy: the pair
      // measures a decklist change, not a matchup, and averaging it into either
      // deck's win rate makes the weakest-deck ranking read the wrong thing.
      if (isDeckVariantPair(decks[left]!, decks[right]!)) continue;
      pairs.push([decks[left]!, decks[right]!]);
    }
  }
  return pairs;
}

/**
 * One decision of a benchmark game, in the shape a diagnostics trace needs.
 *
 * Structural on purpose: `TraceCheckpoint` is declared in `packages/web`, and
 * this package must not import from there (the browser-boundary job exists to
 * keep that direction one-way). The fields are the same ones, so a caller in
 * `tools/` can pass a sink that collects straight into a `MatchTrace`.
 */
export interface BenchmarkCheckpoint {
  revision: number;
  actionId: string;
  turn: number;
  player: PlayerId;
  stateHash: string;
  events: readonly PublicEvent[];
}

/**
 * Where a caller collects the game as it is played, for a replayable trace.
 *
 * `pnpm trace:dump` exists because the report this benchmark writes says *who
 * won* 3600 times and nothing about *how*, while `pnpm trace:audit` -- the
 * instrument that answers "how" -- reads diagnostics JSONL, which nothing here
 * produced. The join was the missing piece, not either end of it.
 *
 * The sink hangs off this loop rather than off a re-simulation in the tool,
 * because a trace of a *slightly different* game is worse than no trace: the
 * agents, the simulator wiring and the create call all have to match the run
 * that produced the row being explained, and the cheapest way to guarantee that
 * is to have one loop.
 */
export interface BenchmarkTraceSink {
  /** The events the engine emitted while creating the game, before any action. */
  onCreate(initialEvents: readonly PublicEvent[]): void;
  onCheckpoint(checkpoint: BenchmarkCheckpoint): void;
}

/** One decision as `playOut` reports it, before a caller adds deck labels. */
export interface PlayedDecision {
  seat: PlayerId;
  phase: GameObservation["phase"];
  actionType: LegalAction["type"];
  moduleId: string | undefined;
  narrowedBy: readonly string[];
  /**
   * Legal actions the engine offered at this decision.
   *
   * One means there was nothing to decide, and counting those as decisions
   * makes a coverage figure describe the engine rather than the policy: an
   * OP-14 Mihawk census read its block phase as 99.4% unpiloted over 1693
   * decisions, of which 1622 offered only `pass`. Every attack against a seat
   * raises a block decision whether or not it holds a [Blocker].
   */
  candidates: number;
}

/**
 * Drives two agents from an observation to the end of the game.
 *
 * Extracted from `playGame` so that a caller holding a *mid-game* state can
 * finish it the same way a benchmark game is finished. `pnpm trace:regret`
 * needs exactly that: to answer "would another action here have won this game"
 * it applies the alternative and plays the rest out, and a rollout played by a
 * loop that differs from the benchmark's -- a missing simulator, a different
 * action cap -- answers a question about a different agent.
 *
 * Behaviour-preserving by construction: `playGame` now calls this and does
 * nothing else in the loop. The check is that a `pnpm trace:dump` replay still
 * reproduces the winner and turn count of the report row it came from, which is
 * a full-game state-hash comparison in all but name.
 */
export async function playOut(input: {
  service: GameService;
  observation: GameObservation;
  agents: Readonly<Record<PlayerId, Agent>>;
  maxActions: number;
  onDecision?: (decision: PlayedDecision) => void;
  traceSink?: BenchmarkTraceSink;
}): Promise<{ observation: GameObservation; actions: number }> {
  const { service, agents, maxActions, onDecision, traceSink } = input;
  let observation = input.observation;
  let actions = 0;
  while (observation.phase !== "finished" && actions < maxActions) {
    const seat = observation.activePlayer;
    const agent = agents[seat];
    if (acceptsSimulator(agent)) {
      agent.useSimulator(service.simulatorFor(observation.gameId, seat));
    }
    const action = await agent.chooseAction(observation);
    if (onDecision) {
      // `lastDecision` is on `ComposedRulesAgent`, which every `createRulesAgent`
      // result is, but the `Agent` interface does not declare it -- the same
      // narrowing `tools/compare-llm-vs-rules.ts` does for the same reason.
      const decided = (
        agent as {
          lastDecision?: { moduleId?: string; narrowedBy?: readonly string[] };
        }
      ).lastDecision;
      onDecision({
        seat,
        phase: observation.phase,
        actionType: action.type,
        moduleId: decided?.moduleId,
        narrowedBy: decided?.narrowedBy ?? [],
        candidates: observation.legalActions.length,
      });
    }
    const before = observation;
    const seen = before.publicEvents.length;
    observation = service.act(before.gameId, before.revision, action.actionId);
    // Deltas rather than the cumulative log, for the reason `TraceCheckpoint`
    // documents: `publicEvents` is cumulative, so cloning all of it per action
    // makes the trace quadratic.
    traceSink?.onCheckpoint({
      revision: observation.revision,
      actionId: action.actionId,
      turn: before.turn,
      player: before.activePlayer,
      stateHash: observation.stateHash,
      events: structuredClone(observation.publicEvents.slice(seen)),
    });
    actions += 1;
  }
  return { observation, actions };
}

export async function playGame(
  p1Deck: BenchmarkDeckId,
  p2Deck: BenchmarkDeckId,
  seed: string,
  maxActions: number,
  onDecision?: BenchmarkDecisionObserver,
  traceSink?: BenchmarkTraceSink,
): Promise<BenchmarkGame> {
  const cardCollector = new BenchmarkCardCollector();
  const eventCollector = new BenchmarkEventCollector();
  const service = new GameService({
    callbacks: [cardCollector, eventCollector],
  });
  let observation = service.create({
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed,
    startingPlayer: "random",
  });
  const startingPlayer = observation.activePlayer;
  traceSink?.onCreate(structuredClone(observation.publicEvents));
  const agents = {
    p1: createRulesAgent(p1Deck),
    p2: createRulesAgent(p2Deck),
  } as const;
  const played = await playOut({
    service,
    observation,
    agents,
    maxActions,
    ...(onDecision
      ? {
          onDecision: (event: PlayedDecision) => {
            onDecision({
              deck: event.seat === "p1" ? p1Deck : p2Deck,
              opponentDeck: event.seat === "p1" ? p2Deck : p1Deck,
              seat: event.seat,
              phase: event.phase,
              actionType: event.actionType,
              moduleId: event.moduleId,
              narrowedBy: event.narrowedBy,
              candidates: event.candidates,
            });
          },
        }
      : {}),
    ...(traceSink ? { traceSink } : {}),
  });
  observation = played.observation;
  const actions = played.actions;
  const completed =
    observation.phase === "finished" && observation.winner !== null;
  return {
    seed,
    p1Deck,
    p2Deck,
    startingPlayer,
    winnerPlayer: completed ? observation.winner : null,
    winnerDeck: completed
      ? observation.winner === "p1"
        ? p1Deck
        : p2Deck
      : null,
    resultReason: observation.resultReason,
    turns: observation.turn,
    actions,
    completed,
    stateHash: observation.stateHash,
    eventHash: eventCollector.hash(),
    cardMetrics: cardCollector.metrics(),
  };
}

class BenchmarkEventCollector implements Callback<GameTransitionEvent> {
  readonly readOnly = true;
  readonly #events: PublicEvent[] = [];

  handle(event: GameTransitionEvent): void {
    this.#events.push(...event.result.events);
  }

  hash(): string {
    return hashState(this.#events);
  }
}

class BenchmarkCardCollector implements Callback<GameTransitionEvent> {
  readonly readOnly = true;
  readonly #opening = playerMetricSets();
  readonly #seen = playerMetricSets();
  readonly #usage = {
    p1: new Map<
      string,
      Omit<CardGameMetrics, "openingCopies" | "seenCopies">
    >(),
    p2: new Map<
      string,
      Omit<CardGameMetrics, "openingCopies" | "seenCopies">
    >(),
  };
  #initialized = false;

  handle(event: GameTransitionEvent): void {
    if (!this.#initialized) {
      this.captureHands(event.previousState, this.#opening);
      this.#initialized = true;
    }
    this.captureHands(event.previousState, this.#seen);
    this.captureHands(event.result.state, this.#seen);
    for (const publicEvent of event.result.events)
      this.captureEvent(publicEvent, event.previousState);
  }

  metrics(): Record<PlayerId, Record<string, CardGameMetrics>> {
    return Object.fromEntries(
      (["p1", "p2"] as const).map((playerId) => {
        const cardNumbers = new Set([
          ...this.#opening[playerId].keys(),
          ...this.#seen[playerId].keys(),
          ...this.#usage[playerId].keys(),
        ]);
        return [
          playerId,
          Object.fromEntries(
            [...cardNumbers].sort().map((cardNumber) => [
              cardNumber,
              {
                openingCopies:
                  this.#opening[playerId].get(cardNumber)?.size ?? 0,
                seenCopies: this.#seen[playerId].get(cardNumber)?.size ?? 0,
                ...(this.#usage[playerId].get(cardNumber) ?? emptyUsage()),
              },
            ]),
          ),
        ];
      }),
    ) as Record<PlayerId, Record<string, CardGameMetrics>>;
  }

  private captureHands(
    state: GameState,
    target: Record<PlayerId, Map<string, Set<string>>>,
  ): void {
    for (const playerId of ["p1", "p2"] as const) {
      for (const card of state.players[playerId].hand) {
        const instances = target[playerId].get(card.cardNumber) ?? new Set();
        instances.add(card.instanceId);
        target[playerId].set(card.cardNumber, instances);
      }
    }
  }

  private captureEvent(event: PublicEvent, state: GameState): void {
    if (event.type === "card-played" || event.type === "stage-played")
      this.increment(event.playerId, event.cardNumber, "plays");
    else if (event.type === "event-activated")
      this.increment(event.playerId, event.cardNumber, "activations");
    else if (event.type === "counter-used")
      this.increment(event.playerId, event.cardNumber, "counters");
    else if (event.type === "attack-declared") {
      const cardNumber = findCardNumber(
        state,
        event.playerId,
        event.attackerInstanceId,
      );
      if (cardNumber) this.increment(event.playerId, cardNumber, "attacks");
    } else if (event.type === "attack-blocked") {
      const cardNumber = findCardNumber(
        state,
        event.playerId,
        event.blockerInstanceId,
      );
      if (cardNumber) this.increment(event.playerId, cardNumber, "blocks");
    }
  }

  private increment(
    playerId: PlayerId,
    cardNumber: string,
    metric: keyof Omit<CardGameMetrics, "openingCopies" | "seenCopies">,
  ): void {
    const usage = this.#usage[playerId].get(cardNumber) ?? emptyUsage();
    usage[metric] += 1;
    this.#usage[playerId].set(cardNumber, usage);
  }
}

function summarizeDeck(
  deck: BenchmarkDeckId,
  allGames: readonly BenchmarkGame[],
): DeckStatistics {
  const games = allGames.filter((game) => hasDeck(game, deck));
  const completed = games.filter((game) => game.completed);
  const wins = completed.filter((game) => game.winnerDeck === deck).length;
  const p1Games = games.filter((game) => game.p1Deck === deck);
  const p2Games = games.filter((game) => game.p2Deck === deck);
  const started = games.filter(
    (game) => game[`${game.startingPlayer}Deck`] === deck,
  );
  return {
    deck,
    games: games.length,
    wins,
    losses: completed.length - wins,
    incomplete: games.length - completed.length,
    winRate: rate(wins, completed.length),
    p1Games: p1Games.length,
    p1Wins: p1Games.filter((game) => game.winnerDeck === deck).length,
    p2Games: p2Games.length,
    p2Wins: p2Games.filter((game) => game.winnerDeck === deck).length,
    startedGames: started.length,
    startedWins: started.filter((game) => game.winnerDeck === deck).length,
    averageTurns: average(games.map((game) => game.turns)),
    averageActions: average(games.map((game) => game.actions)),
    cards: summarizeCards(deck, games),
  };
}

function summarizeCards(
  deck: BenchmarkDeckId,
  games: readonly BenchmarkGame[],
): CardStatistics[] {
  return Object.entries(requireSupportedDeck(deck).cards)
    .map(([cardNumber, copies]) => {
      const rows = games.map((game) => {
        const playerId = game.p1Deck === deck ? "p1" : "p2";
        return {
          won: game.winnerDeck === deck,
          metrics: game.cardMetrics[playerId][cardNumber] ?? emptyCardMetrics(),
        };
      });
      const seen = rows.filter((row) => row.metrics.seenCopies > 0);
      const notSeen = rows.filter((row) => row.metrics.seenCopies === 0);
      const seenWins = seen.filter((row) => row.won).length;
      const notSeenWins = notSeen.filter((row) => row.won).length;
      const used = rows.filter((row) => wasUsed(row.metrics));
      const wins = rows.filter((row) => row.won);
      const losses = rows.filter((row) => !row.won);
      const winsUsed = used.filter((row) => row.won).length;
      const lossesUsed = used.length - winsUsed;
      return {
        cardNumber,
        copies,
        games: rows.length,
        wins: rows.filter((row) => row.won).length,
        gamesSeen: seen.length,
        seenWins,
        seenWinRate: rate(seenWins, seen.length),
        gamesNotSeen: notSeen.length,
        notSeenWins,
        notSeenWinRate: rate(notSeenWins, notSeen.length),
        winRateDelta: Number(
          (
            rate(seenWins, seen.length) - rate(notSeenWins, notSeen.length)
          ).toFixed(4),
        ),
        gamesUsed: used.length,
        winsUsed,
        winUsageRate: rate(winsUsed, wins.length),
        lossesUsed,
        lossUsageRate: rate(lossesUsed, losses.length),
        openingCopies: sum(rows.map((row) => row.metrics.openingCopies)),
        seenCopies: sum(rows.map((row) => row.metrics.seenCopies)),
        plays: sum(rows.map((row) => row.metrics.plays)),
        activations: sum(rows.map((row) => row.metrics.activations)),
        counters: sum(rows.map((row) => row.metrics.counters)),
        attacks: sum(rows.map((row) => row.metrics.attacks)),
        blocks: sum(rows.map((row) => row.metrics.blocks)),
      };
    })
    .sort((left, right) => left.winRateDelta - right.winRateDelta);
}

function summarizeMatchup(games: readonly BenchmarkGame[]): MatchupStatistics {
  const decks = [games[0]!.p1Deck, games[0]!.p2Deck].sort() as [
    BenchmarkDeckId,
    BenchmarkDeckId,
  ];
  const completed = games.filter((game) => game.completed);
  const wins = Object.fromEntries(
    decks.map((deck) => [
      deck,
      completed.filter((game) => game.winnerDeck === deck).length,
    ]),
  );
  return {
    decks,
    games: games.length,
    incomplete: games.length - completed.length,
    wins,
    winRates: Object.fromEntries(
      decks.map((deck) => [deck, rate(wins[deck] ?? 0, completed.length)]),
    ),
  };
}

function hasDeck(game: BenchmarkGame, deck: BenchmarkDeckId): boolean {
  return game.p1Deck === deck || game.p2Deck === deck;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
  );
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function playerMetricSets(): Record<PlayerId, Map<string, Set<string>>> {
  return { p1: new Map(), p2: new Map() };
}

function emptyUsage(): Omit<CardGameMetrics, "openingCopies" | "seenCopies"> {
  return { plays: 0, activations: 0, counters: 0, attacks: 0, blocks: 0 };
}

function emptyCardMetrics(): CardGameMetrics {
  return { openingCopies: 0, seenCopies: 0, ...emptyUsage() };
}

function wasUsed(metrics: CardGameMetrics): boolean {
  return (
    metrics.plays +
      metrics.activations +
      metrics.counters +
      metrics.attacks +
      metrics.blocks >
    0
  );
}

function findCardNumber(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): string | undefined {
  const player = state.players[playerId];
  return [player.stage, ...player.board]
    .filter((card) => card !== null)
    .find((card) => card.instanceId === instanceId)?.cardNumber;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}
