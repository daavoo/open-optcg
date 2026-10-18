/**
 * Sealed pick-rate analysis — rules agent vs rules agent over random OP17 pools.
 *
 * Each game opens two independently-seeded pools (one per seat, following
 * `play-sealed.ts`'s `${seed}:p1`/`${seed}:p2` convention and the same pack-count
 * escalation ladder), auto-builds a 40-card deck from each with the configured
 * `deckBuilder` (default `autoBuildSealedDeck`; see {@link DECK_BUILDERS} for
 * `autoBuildSealedDeckGrape`), and plays a full rules-vs-rules game under the
 * shared Rainbow Luffy Leader both sealed seats use. The point isn't the win
 * itself — it's recording, per card, whether it was in the opened pool,
 * whether the auto-builder kept it, and whether that seat won, so a human who
 * just opened a real booster can ask "is this card usually worth keeping."
 *
 * That question is answered as an association, not a pick order, the same
 * caveat `packages/web/src/analytics.ts`'s `cardImpact` documents: a card that
 * only survives the auto-builder's curve heuristic in decks that were already
 * strong inherits whatever those decks were worth. `impactRows`/`usageRows`
 * mirror that module's shape for the same reason. Read it as full-pool
 * coverage bought cheaply, not as a causal per-card estimate.
 */
import {
  acceptsSimulator,
  RegistryRulesAgent,
} from "@one-piece-sim/agents/local";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  GameService,
  type Callback,
  type GameState,
  type GameTransitionEvent,
} from "@one-piece-sim/engine-core";
import {
  autoBuildSealedDeck,
  autoBuildSealedDeckGrape,
  openPacks,
  poolCounts,
  sealedDeckManifest,
  sealedPoolIsBuildable,
  DEFAULT_SEALED_EXPANSION,
  SEALED_LEADER,
  SEALED_PACK_COUNT,
  type SealedDeck,
  type SealedPool,
  resolveDeck,
} from "@one-piece-sim/decks";
import type {
  GameResultReason,
  PlayerId,
  PublicEvent,
} from "@one-piece-sim/protocol";

export const SEALED_ANALYSIS_SCHEMA_VERSION = 1;
/** Below this a bucket's win rate is noise, so the impact split leaves it out. */
export const MIN_CARD_SAMPLE_GAMES = 3;

/** Which auto-builder's kept/cut split this run measures. Both seats always use the same one. */
export type SealedDeckBuilder = (pool: SealedPool) => SealedDeck;

export const DECK_BUILDERS: Readonly<Record<string, SealedDeckBuilder>> = {
  heuristic: autoBuildSealedDeck,
  grape: autoBuildSealedDeckGrape,
};

const PACK_COUNT_ESCALATION: readonly number[] = [
  SEALED_PACK_COUNT,
  8,
  10,
  14,
  20,
  28,
  40,
];

export interface OpenedSeatPool {
  pool: SealedPool;
  packsOpened: number;
}

/** Same escalation ladder `play-sealed.ts` uses, so both tools open identical pools for the same seed. */
export function openSeatPool(
  seed: string,
  expansion: string = DEFAULT_SEALED_EXPANSION,
): OpenedSeatPool {
  let attempt: OpenedSeatPool | undefined;
  for (const packCount of PACK_COUNT_ESCALATION) {
    const pool = openPacks(seed, packCount, expansion);
    attempt = { pool, packsOpened: packCount };
    if (sealedPoolIsBuildable(pool).buildable) return attempt;
  }
  return attempt!;
}

export interface CardUsage {
  plays: number;
  activations: number;
  counters: number;
  attacks: number;
  blocks: number;
}

export interface SealedAnalysisGame {
  seed: string;
  p1PacksOpened: number;
  p2PacksOpened: number;
  winnerPlayer: PlayerId | null;
  resultReason: GameResultReason | null;
  turns: number;
  actions: number;
  completed: boolean;
  /** Card number -> copies opened in that seat's pool. */
  pool: Record<PlayerId, Record<string, number>>;
  /** Card number -> copies in the 40-card deck the auto-builder kept. */
  deck: Record<PlayerId, Record<string, number>>;
  /** Card number -> in-game usage, only present for cards actually played. */
  usage: Record<PlayerId, Record<string, CardUsage>>;
}

/**
 * A seed whose game threw instead of finishing, kept separate from
 * {@link SealedAnalysisGame} rather than folded into `completed: false` — an
 * action-ceiling stalemate is expected noise the summary already accounts for,
 * while a thrown error is an engine bug a bulk run should surface, not swallow.
 */
export interface SealedAnalysisFailure {
  seed: string;
  message: string;
}

export interface SealedAnalysisRun {
  games: SealedAnalysisGame[];
  failures: SealedAnalysisFailure[];
}

export interface RunSealedAnalysisOptions {
  seeds: number;
  seedPrefix?: string;
  maxActions?: number;
  /** Which builder both seats use. Default `autoBuildSealedDeck`, unchanged from before this option existed. */
  deckBuilder?: SealedDeckBuilder;
  onProgress?: (completed: number, total: number) => void;
}

export async function runSealedAnalysis(
  options: RunSealedAnalysisOptions,
): Promise<SealedAnalysisRun> {
  const seedPrefix = options.seedPrefix ?? "sealed-analysis";
  const maxActions = options.maxActions ?? 800;
  const deckBuilder = options.deckBuilder ?? autoBuildSealedDeck;
  const games: SealedAnalysisGame[] = [];
  const failures: SealedAnalysisFailure[] = [];
  for (let index = 0; index < options.seeds; index += 1) {
    const seed = `${seedPrefix}-${index}`;
    try {
      games.push(await playSealedGame(seed, maxActions, deckBuilder));
    } catch (error) {
      failures.push({ seed, message: (error as Error).message });
    }
    options.onProgress?.(index + 1, options.seeds);
  }
  return { games, failures };
}

async function playSealedGame(
  seed: string,
  maxActions: number,
  deckBuilder: SealedDeckBuilder,
): Promise<SealedAnalysisGame> {
  const p1Seat = openSeatPool(`${seed}:p1`);
  const p2Seat = openSeatPool(`${seed}:p2`);
  const p1BuiltDeck = deckBuilder(p1Seat.pool);
  const p2BuiltDeck = deckBuilder(p2Seat.pool);
  const p1Manifest = sealedDeckManifest(p1BuiltDeck, p1Seat.pool);
  const p2Manifest = sealedDeckManifest(p2BuiltDeck, p2Seat.pool);

  const collector = new SealedCardCollector();
  const service = new GameService({ callbacks: [collector] });
  let observation = service.create({
    p1: resolveDeck(p1Manifest.id, p1Manifest),
    p2: resolveDeck(p2Manifest.id, p2Manifest),
    seed,
    startingPlayer: "random",
  });
  const agents = {
    p1: new RegistryRulesAgent(SEALED_LEADER),
    p2: new RegistryRulesAgent(SEALED_LEADER),
  } as const;
  let actions = 0;
  while (observation.phase !== "finished" && actions < maxActions) {
    const seat = observation.activePlayer;
    const agent = agents[seat];
    if (acceptsSimulator(agent)) {
      agent.useSimulator(service.simulatorFor(observation.gameId, seat));
    }
    const action = await agent.chooseAction(observation);
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
    actions += 1;
  }
  const completed =
    observation.phase === "finished" && observation.winner !== null;
  return {
    seed,
    p1PacksOpened: p1Seat.packsOpened,
    p2PacksOpened: p2Seat.packsOpened,
    winnerPlayer: completed ? observation.winner : null,
    resultReason: completed ? observation.resultReason : null,
    turns: observation.turn,
    actions,
    completed,
    pool: {
      p1: Object.fromEntries(poolCounts(p1Seat.pool)),
      p2: Object.fromEntries(poolCounts(p2Seat.pool)),
    },
    deck: { p1: { ...p1BuiltDeck.cards }, p2: { ...p2BuiltDeck.cards } },
    usage: collector.usage(),
  };
}

class SealedCardCollector implements Callback<GameTransitionEvent> {
  readonly #usage: Record<PlayerId, Map<string, CardUsage>> = {
    p1: new Map(),
    p2: new Map(),
  };

  handle(event: GameTransitionEvent): void {
    for (const publicEvent of event.result.events)
      this.captureEvent(publicEvent, event.previousState);
  }

  usage(): Record<PlayerId, Record<string, CardUsage>> {
    return {
      p1: Object.fromEntries(this.#usage.p1),
      p2: Object.fromEntries(this.#usage.p2),
    };
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
    metric: keyof CardUsage,
  ): void {
    const usage = this.#usage[playerId].get(cardNumber) ?? emptyUsage();
    usage[metric] += 1;
    this.#usage[playerId].set(cardNumber, usage);
  }
}

function emptyUsage(): CardUsage {
  return { plays: 0, activations: 0, counters: 0, attacks: 0, blocks: 0 };
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

/* ---------------------------------------------------------------------------
   Games in, per-card pick-rate report out
   ------------------------------------------------------------------------ */

export interface CardPickStatistics {
  cardNumber: string;
  /** Games where this seat's pool opened at least one copy. */
  poolGames: number;
  averageCopiesInPool: number;
  /** Of those, games where the auto-builder kept it in the 40. */
  deckGames: number;
  pickRate: number;
  deckGamesDecided: number;
  winsIncluded: number;
  winRateIncluded: number;
  cutGamesDecided: number;
  winsCut: number;
  winRateCut: number;
  /** Win rate kept minus win rate cut. An association, not a pick order. */
  delta: number;
  plays: number;
  activations: number;
  counters: number;
  attacks: number;
  blocks: number;
}

export interface SealedAnalysisSummary {
  games: number;
  completed: number;
  incomplete: number;
  averageTurns: number;
  averageActions: number;
  cards: CardPickStatistics[];
}

interface CardRow {
  playerId: PlayerId;
  game: SealedAnalysisGame;
}

export function summarizeCardPicks(
  games: readonly SealedAnalysisGame[],
): SealedAnalysisSummary {
  const completed = games.filter((game) => game.completed);
  const rows: CardRow[] = games.flatMap((game) =>
    (["p1", "p2"] as const).map((playerId) => ({ playerId, game })),
  );
  const cardNumbers = new Set<string>();
  for (const { playerId, game } of rows)
    for (const cardNumber of Object.keys(game.pool[playerId])) {
      if (cardRegistry.get(cardNumber)?.category === "leader") continue;
      cardNumbers.add(cardNumber);
    }
  return {
    games: games.length,
    completed: completed.length,
    incomplete: games.length - completed.length,
    averageTurns: average(games.map((game) => game.turns)),
    averageActions: average(games.map((game) => game.actions)),
    cards: [...cardNumbers]
      .sort()
      .map((cardNumber) => summarizeCard(cardNumber, rows)),
  };
}

function summarizeCard(
  cardNumber: string,
  rows: readonly CardRow[],
): CardPickStatistics {
  const inPool = rows.filter(
    ({ playerId, game }) => (game.pool[playerId][cardNumber] ?? 0) > 0,
  );
  const inDeck = inPool.filter(
    ({ playerId, game }) => (game.deck[playerId][cardNumber] ?? 0) > 0,
  );
  const cut = inPool.filter(
    ({ playerId, game }) => (game.deck[playerId][cardNumber] ?? 0) === 0,
  );
  const decidedIn = inDeck.filter(({ game }) => game.winnerPlayer !== null);
  const decidedCut = cut.filter(({ game }) => game.winnerPlayer !== null);
  const winsIncluded = decidedIn.filter(
    ({ playerId, game }) => game.winnerPlayer === playerId,
  ).length;
  const winsCut = decidedCut.filter(
    ({ playerId, game }) => game.winnerPlayer === playerId,
  ).length;
  const winRateIncluded = rate(winsIncluded, decidedIn.length);
  const winRateCut = rate(winsCut, decidedCut.length);
  const usage = inDeck.reduce(
    (total, { playerId, game }) =>
      addUsage(total, game.usage[playerId][cardNumber]),
    emptyUsage(),
  );
  return {
    cardNumber,
    poolGames: inPool.length,
    averageCopiesInPool: average(
      inPool.map(({ playerId, game }) => game.pool[playerId][cardNumber]!),
    ),
    deckGames: inDeck.length,
    pickRate: rate(inDeck.length, inPool.length),
    deckGamesDecided: decidedIn.length,
    winsIncluded,
    winRateIncluded,
    cutGamesDecided: decidedCut.length,
    winsCut,
    winRateCut,
    delta: round(winRateIncluded - winRateCut),
    ...usage,
  };
}

function addUsage(total: CardUsage, extra: CardUsage | undefined): CardUsage {
  if (!extra) return total;
  return {
    plays: total.plays + extra.plays,
    activations: total.activations + extra.activations,
    counters: total.counters + extra.counters,
    attacks: total.attacks + extra.attacks,
    blocks: total.blocks + extra.blocks,
  };
}

/** Rows worth showing as a pick signal: both buckets deep enough, biggest split first. */
export function impactRows(
  cards: readonly CardPickStatistics[],
  minimumGames: number = MIN_CARD_SAMPLE_GAMES,
): CardPickStatistics[] {
  return cards
    .filter(
      (card) =>
        card.deckGamesDecided >= minimumGames &&
        card.cutGamesDecided >= minimumGames,
    )
    .sort((left, right) => right.delta - left.delta);
}

/**
 * The same rows without the split, ordered by how often the card was kept.
 *
 * A card the auto-builder always keeps (or always cuts) has no comparison
 * group, so {@link impactRows} drops it correctly — there is nothing to compare
 * against. This is what a small run falls back to so it still says something.
 */
export function usageRows(
  cards: readonly CardPickStatistics[],
): CardPickStatistics[] {
  return [...cards].sort(
    (left, right) => right.deckGamesDecided - left.deckGamesDecided,
  );
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number(
    (values.reduce((total, value) => total + value, 0) / values.length).toFixed(
      2,
    ),
  );
}
