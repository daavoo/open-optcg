import {
  FirstLegalAgent,
  GenericRulesAgent,
  LearnedSealedAgent,
  RegistryRulesAgent,
  SeededRandomAgent,
  type Agent,
  type LearnedSealedPolicyWeights,
} from "@one-piece-sim/agents/local";
import {
  LlmAgent,
  type LlmChatClient,
  type LlmChatResponse,
} from "@one-piece-sim/agents/llm";
import { llmMatchContext } from "@one-piece-sim/agents/llm-dossiers";
import {
  CompactBatcher,
  CompactGpu,
  CompactScorerAgent,
  GpuEncoder,
  ScorerAgent,
  adapterFor,
  isCompactPack,
  loadCompact,
  loadScorer,
  requestGpuDevice,
  type CompactAdapter,
  type CompactPack,
  type ScorerPack,
} from "@one-piece-sim/agents/scorer";
import { loadPrintedText, type PrintedText } from "@one-piece-sim/cards";
import { deckManifests, type DeckManifest } from "@one-piece-sim/decks";
import type { GameObservation } from "@one-piece-sim/protocol";
import type { ControllerKind } from "./controller.js";
import { rulesSeatLeader } from "./rules-seat.js";

/**
 * Baked in at build time by `tools/build-web.ts` from
 * `ml/python/export_web_policy.py`'s output, so the worker (bundled
 * separately from the main app, see `buildWorker`) needs no network fetch to
 * play a sealed match against the trained model.
 */
declare const __LEARNED_SEALED_POLICY__: LearnedSealedPolicyWeights;

/**
 * The System-1 scorer's model pack, baked in by `tools/build-web.ts` from
 * `packages/web/src/scorer-model.json` when that file exists; null otherwise,
 * and the setup screen then never offers the seat.
 */
declare const __SCORER_PACK__: ScorerPack | CompactPack | null;

/**
 * Deck adapters over the small scorer's pack, baked in by `tools/build-web.ts`
 * from `packages/web/src/scorer-adapters/*.json`; empty when there are none.
 * A seat whose deck matches one (`adapterFor`) plays the adapted model.
 */
declare const __SCORER_ADAPTERS__: CompactAdapter[];

/**
 * One loaded scorer shared by every seat that asks for it: the pack decodes
 * to megabytes of weights, and the text scorer's GPU upload is done once. The
 * small scorer's pack (`kind: "compact"`) runs on the CPU and needs no GPU.
 * Each deck adapter is its own model over the same pack, loaded once too.
 */
const scorers = new Map<string, Promise<Agent>>();
/** One WebGPU device per worker, asked for once; null where there is none. */
let gpuDevice: ReturnType<typeof requestGpuDevice> | undefined;

function loadedScorer(adapter?: CompactAdapter): Promise<Agent> {
  const key = adapter?.deck.id ?? "";
  const cached = scorers.get(key);
  if (cached) return cached;
  const loading = (async () => {
    if (!__SCORER_PACK__) throw new Error("SCORER_PACK_MISSING");
    if (isCompactPack(__SCORER_PACK__)) {
      if (adapter)
        console.info(`Learned model: the ${adapter.deck.id} deck adapter`);
      const model = loadCompact(__SCORER_PACK__, adapter);
      // The blocks on the GPU where the browser has one: a decision in a few
      // milliseconds rather than ~150 on the CPU.
      const device = await (gpuDevice ??= requestGpuDevice());
      return new CompactScorerAgent(
        device
          ? new CompactBatcher(model, new CompactGpu(device, model))
          : model,
      );
    }
    const loaded = loadScorer(__SCORER_PACK__);
    // Seconds a decision on the CPU; milliseconds on WebGPU where the
    // browser has it. Both give the same answers.
    const device = await requestGpuDevice();
    if (device) loaded.model.useGpu(new GpuEncoder(device, loaded.model));
    return new ScorerAgent(loaded);
  })();
  scorers.set(key, loading);
  return loading;
}

interface ChooseRequest {
  id: number;
  agentKey: string;
  controller: Exclude<ControllerKind, "human">;
  deckId: string;
  opponentDeckId: string;
  /** The deck whose dossier each seat is piloted with, where that is not the
      deck it plays -- a deck the player built borrows one. See
      `MatchConfig.p1Dossier`. */
  dossierDeckId?: string;
  opponentDossierDeckId?: string;
  deckManifest?: DeckManifest;
  opponentDeckManifest?: DeckManifest;
  llmProxyUrl: string;
  seed: string;
  observation: GameObservation;
}

/**
 * Printed card text, which this realm cannot read for itself.
 *
 * The pack is a runtime asset the player loads on the main thread, and a
 * worker is a separate realm with its own module state, so `printedText()`
 * here answers nothing until the main thread hands the pack over. An LLM
 * seat's own deck list is built here, from the manifest, and without this it
 * went out as names and stats while the engine's `cardFacts` -- built on the
 * main thread, where the pack is -- carried the words.
 */
interface PrintedTextMessage {
  printedText: Record<string, PrintedText>;
}

type WorkerMessage = ChooseRequest | PrintedTextMessage;

const agents = new Map<string, Agent>();

function proxyClient(url: string): LlmChatClient {
  return {
    async complete(request): Promise<LlmChatResponse> {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: request.messages,
          ...(request.promptCacheKey
            ? { promptCacheKey: request.promptCacheKey }
            : {}),
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      });
      const result = (await response.json()) as LlmChatResponse & {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.message ?? `LLM_PROXY_${response.status}`);
      }
      return result;
    },
  };
}

function createAgent(request: ChooseRequest): Agent {
  if (request.controller === "first") return new FirstLegalAgent();
  if (request.controller === "random") {
    return new SeededRandomAgent(`${request.seed}:${request.agentKey}`);
  }
  if (request.controller === "learned") {
    return new LearnedSealedAgent(__LEARNED_SEALED_POLICY__);
  }
  if (request.controller === "scorer") {
    // The small scorer reads its own deck list: the cards it has yet to draw.
    const manifest = request.deckManifest ?? deckManifests[request.deckId];
    const own = manifest?.cards;
    const adapter =
      manifest && __SCORER_PACK__ && isCompactPack(__SCORER_PACK__)
        ? adapterFor(__SCORER_ADAPTERS__, manifest)
        : undefined;
    return {
      async chooseAction(observation) {
        const scorer = await loadedScorer(adapter);
        const seat =
          own && scorer instanceof CompactScorerAgent
            ? scorer.withDeck(own)
            : scorer;
        return seat.chooseAction(observation);
      },
    };
  }
  if (request.controller === "llm") {
    const selfManifest = request.deckManifest ?? deckManifests[request.deckId];
    const opponentManifest =
      request.opponentDeckManifest ?? deckManifests[request.opponentDeckId];
    if (!selfManifest || !opponentManifest) {
      throw new Error("LLM_DECK_MANIFEST_MISSING");
    }
    return new LlmAgent(
      proxyClient(request.llmProxyUrl),
      // Ids and manifests come apart here: the dossier is looked up by the
      // deck the seat is piloted *as*, while the list, the Leader and the card
      // text in the prompt are the deck it is actually playing.
      llmMatchContext(
        request.dossierDeckId ?? request.deckId,
        selfManifest,
        request.opponentDossierDeckId ?? request.opponentDeckId,
        opponentManifest,
      ),
    );
  }
  // Every rules seat resolves its policy through its Leader, the same way
  // `createRulesAgent` does for the CLI and the benchmark. See
  // `rules-seat.ts` for what this replaced and why it is not inline here.
  const leader = rulesSeatLeader(request.deckId, request.deckManifest);
  return leader ? new RegistryRulesAgent(leader) : new GenericRulesAgent();
}

self.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  if ("printedText" in event.data) {
    // The pack the player loaded, handed over from the main thread. It has to
    // arrive before the first decision of a match, because `LlmAgent` renders
    // its deck list once in its constructor -- see `postPrintedText`.
    loadPrintedText(event.data.printedText);
    return;
  }
  const request = event.data;
  const agent = agents.get(request.agentKey) ?? createAgent(request);
  agents.set(request.agentKey, agent);
  void agent
    .chooseAction(request.observation)
    .then((action) => {
      const llm = agent instanceof LlmAgent ? agent : null;
      self.postMessage({
        id: request.id,
        actionId: action.actionId,
        ...(llm?.lastReasoningSummary
          ? { reasoning: llm.lastReasoningSummary }
          : {}),
        ...(llm?.lastRawExchange ? { rawExchange: llm.lastRawExchange } : {}),
      });
    })
    .catch((error: unknown) => {
      const llm = agent instanceof LlmAgent ? agent : null;
      self.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
        ...(llm?.lastReasoningSummary
          ? { reasoning: llm.lastReasoningSummary }
          : {}),
        ...(llm?.lastRawExchange ? { rawExchange: llm.lastRawExchange } : {}),
      });
    });
});
