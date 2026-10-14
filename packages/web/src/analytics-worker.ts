/**
 * Runs an analytics sweep off the main thread and streams one message per
 * finished game, so the page can move a progress bar while the run goes on.
 *
 * The loop yields to the event loop between games. Awaiting the agent only
 * drains microtasks, which would leave a `cancel` message queued until the whole
 * sweep finished; a macrotask gap lets it land, and it also keeps the worker
 * responsive enough to report progress evenly.
 */
import type { Agent } from "@one-piece-sim/agents/local";
import {
  CompactBatcher,
  CompactGpu,
  CompactScorerAgent,
  adapterFor,
  isCompactPack,
  loadCompact,
  requestGpuDevice,
  type CompactAdapter,
  type CompactPack,
  type ScorerPack,
} from "@one-piece-sim/agents/scorer";
import { deckManifests, type DeckManifest } from "@one-piece-sim/decks";
import {
  matchupSeed,
  offerSample,
  playAnalyticsGame,
  type AnalyticsGame,
  type SampleGame,
} from "./analytics.js";

/**
 * The learned model's pack and deck adapters, baked in by `tools/build-web.ts`
 * exactly as they are into the game worker (`worker.ts`); null and empty in a
 * build without them, where every run is played by the rules agents.
 */
declare const __SCORER_PACK__: ScorerPack | CompactPack | null;
declare const __SCORER_ADAPTERS__: CompactAdapter[];

/** Who plays both decks of a run: the rules agents or the learned model. */
export type AnalyticsPilot = "rules" | "scorer";

interface RunRequest {
  type: "run";
  runId: number;
  /** Ordered pairs to play; the caller decides what a sweep covers. */
  pairs: Array<[string, string]>;
  seeds: number;
  seedPrefix: string;
  maxActions: number;
  customDecks?: Record<string, DeckManifest>;
  pilot?: AnalyticsPilot;
  /**
   * This worker's share of the run when several play it: the games whose
   * place in the run's order is `index` modulo `count`. Every game keeps the
   * seed it has in an unsplit run, so the split changes how fast, not what.
   */
  shard?: { index: number; count: number };
}

interface CancelRequest {
  type: "cancel";
}

export type AnalyticsRequest = RunRequest | CancelRequest;

export type AnalyticsResponse =
  | { type: "started"; runId: number; total: number }
  | {
      type: "game";
      runId: number;
      /** The game's summary; never carries its action list. */
      game: AnalyticsGame;
      completed: number;
      /**
       * The game whole, when it is the earliest win in its sample slot this
       * worker has seen. The page keeps the earliest across workers.
       */
      sample?: SampleGame;
    }
  | { type: "done"; runId: number; cancelled: boolean }
  | { type: "error"; runId: number; message: string };

let activeRunId = 0;

self.addEventListener("message", (event: MessageEvent<AnalyticsRequest>) => {
  if (event.data.type === "cancel") {
    activeRunId = 0;
    return;
  }
  void run(event.data);
});

/** One model a deck adapter (or none) makes, decoded once per worker. */
const models = new Map<string, CompactScorerAgent>();
/** This worker's WebGPU device, asked for by the first learned-model run. */
let gpu: Awaited<ReturnType<typeof requestGpuDevice>> | undefined;
/**
 * Games a worker plays at once on a GPU, their decisions scored in one batch.
 * A batch of a few already costs about what one decision does, and more games
 * at once only make them finish together, at the end of the run -- the
 * progress bar would sit still and then jump. On the CPU each decision costs
 * the same however they are interleaved, so one at a time.
 */
const GPU_CONCURRENT_GAMES = 6;

/**
 * The learned model as one deck's seat: the deck adapter its list matches,
 * if any, over the pack, reading the deck's own list as the game worker's
 * seat does.
 */
function learnedSeat(
  deckId: string,
  custom: Readonly<Record<string, DeckManifest>>,
): Agent {
  if (!__SCORER_PACK__ || !isCompactPack(__SCORER_PACK__))
    throw new Error("SCORER_PACK_MISSING");
  const manifest = custom[deckId] ?? deckManifests[deckId];
  const adapter = manifest
    ? adapterFor(__SCORER_ADAPTERS__, manifest)
    : undefined;
  const key = adapter?.deck.id ?? "";
  let model = models.get(key);
  if (!model) {
    if (adapter)
      console.info(`Learned model: the ${adapter.deck.id} deck adapter`);
    const compact = loadCompact(__SCORER_PACK__, adapter);
    model = new CompactScorerAgent(
      gpu ? new CompactBatcher(compact, new CompactGpu(gpu, compact)) : compact,
    );
    models.set(key, model);
  }
  return manifest ? model.withDeck(manifest.cards) : model;
}

async function run(request: RunRequest): Promise<void> {
  activeRunId = request.runId;
  const shard = request.shard ?? { index: 0, count: 1 };
  const custom = request.customDecks ?? {};
  post({
    type: "started",
    runId: request.runId,
    total: request.pairs.length * request.seeds,
  });
  const learned = request.pilot === "scorer";
  if (learned && gpu === undefined) gpu = await requestGpuDevice();
  // This worker's share of the run, in the run's order.
  const games: Array<{
    firstDeck: string;
    secondDeck: string;
    index: number;
    order: number;
  }> = [];
  let order = 0;
  for (const [firstDeck, secondDeck] of request.pairs)
    for (let index = 0; index < request.seeds; index += 1) {
      if (order % shard.count === shard.index)
        games.push({ firstDeck, secondDeck, index, order });
      order += 1;
    }
  // Only a game that could fill a sample slot crosses to the page with its
  // action list; the rest leave theirs here, so a 500-game run never holds
  // 500 of them on the page's side.
  const samples = new Map<string, SampleGame>();
  const cancelled = () => activeRunId !== request.runId;
  let completed = 0;
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < games.length && !cancelled()) {
      const { firstDeck, secondDeck, index, order } = games[next]!;
      next += 1;
      const { actionIds, ...game }: AnalyticsGame = await playAnalyticsGame({
        firstDeck,
        secondDeck,
        seed: matchupSeed(request.seedPrefix, firstDeck, secondDeck, index),
        maxActions: request.maxActions,
        recordActions: true,
        ...(request.customDecks ? { customDecks: request.customDecks } : {}),
        ...(learned
          ? {
              agents: {
                first: learnedSeat(firstDeck, custom),
                second: learnedSeat(secondDeck, custom),
              },
            }
          : {}),
      });
      if (cancelled()) return;
      completed += 1;
      const sample: SampleGame | undefined =
        game.winner && actionIds
          ? {
              firstDeck,
              secondDeck,
              seed: game.seed,
              winner: game.winner,
              order,
              actionIds,
            }
          : undefined;
      post({
        type: "game",
        runId: request.runId,
        game,
        completed,
        ...(sample && offerSample(samples, sample) ? { sample } : {}),
      });
      await yieldToEventLoop();
    }
  };
  try {
    const lanes = learned && gpu ? GPU_CONCURRENT_GAMES : 1;
    await Promise.all(Array.from({ length: lanes }, lane));
    post({ type: "done", runId: request.runId, cancelled: cancelled() });
  } catch (error) {
    post({
      type: "error",
      runId: request.runId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * A macrotask gap through a message port rather than `setTimeout(0)`: each
 * yield is scheduled from inside the previous one, and browsers clamp a timer
 * nested five deep to 4 ms -- a tenth of a rules-agent game, every game.
 */
const yieldChannel = new MessageChannel();
const yieldWaiters: Array<() => void> = [];
yieldChannel.port1.onmessage = () => yieldWaiters.shift()?.();

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    yieldWaiters.push(resolve);
    yieldChannel.port2.postMessage(null);
  });
}

function post(response: AnalyticsResponse): void {
  self.postMessage(response);
}
