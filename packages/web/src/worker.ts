import {
  FirstLegalAgent,
  GenericRulesAgent,
  RegistryRulesAgent,
  SeededRandomAgent,
  type Agent,
} from "@one-piece-sim/agents/local";
import {
  isLearnedModelMessage,
  learnedModel,
  receiveLearnedModel,
  type LearnedModelMessage,
} from "./learned-model-source.js";
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
import { deckManifests, type DeckManifest } from "@one-piece-sim/decks";
import type { GameObservation } from "@one-piece-sim/protocol";
import type { ControllerKind } from "./controller.js";
import { rulesSeatLeader } from "./rules-seat.js";

/**
 * One loaded scorer shared by every seat that asks for it: the pack decodes
 * to megabytes of weights, and the text scorer's GPU upload is done once. The
 * small scorer's pack (`kind: "compact"`) runs on the CPU and needs no GPU.
 * Each deck adapter is its own model over the same pack, loaded once too.
 */
const scorers = new Map<string, Promise<Agent>>();
/** One WebGPU device per worker, asked for once; null where there is none. */
let gpuDevice: ReturnType<typeof requestGpuDevice> | undefined;

function loadedScorer(
  pack: ScorerPack | CompactPack,
  adapter?: CompactAdapter,
): Promise<Agent> {
  const key = adapter?.deck.id ?? "";
  const cached = scorers.get(key);
  if (cached) return cached;
  const loading = (async () => {
    if (isCompactPack(pack)) {
      if (adapter)
        console.info(`Learned model: the ${adapter.deck.id} deck adapter`);
      const model = loadCompact(pack, adapter);
      // The blocks on the GPU where the browser has one: a decision in a few
      // milliseconds rather than ~150 on the CPU.
      const device = await (gpuDevice ??= requestGpuDevice());
      return new CompactScorerAgent(
        device
          ? new CompactBatcher(model, new CompactGpu(device, model))
          : model,
      );
    }
    const loaded = loadScorer(pack);
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
  deckManifest?: DeckManifest;
  seed: string;
  observation: GameObservation;
}

type WorkerMessage = ChooseRequest | LearnedModelMessage;

const agents = new Map<string, Agent>();

function createAgent(request: ChooseRequest): Agent {
  if (request.controller === "first") return new FirstLegalAgent();
  if (request.controller === "random") {
    return new SeededRandomAgent(`${request.seed}:${request.agentKey}`);
  }
  if (request.controller === "scorer") {
    // The small scorer reads its own deck list: the cards it has yet to draw.
    const manifest = request.deckManifest ?? deckManifests[request.deckId];
    const own = manifest?.cards;
    return {
      async chooseAction(observation) {
        // Waits for the pack where the page fetches it after drawing; see
        // `learned-model-source.ts`.
        const { pack, adapters } = await learnedModel();
        const adapter =
          manifest && isCompactPack(pack)
            ? adapterFor(adapters, manifest)
            : undefined;
        const scorer = await loadedScorer(pack, adapter);
        const seat =
          own && scorer instanceof CompactScorerAgent
            ? scorer.withDeck(own)
            : scorer;
        return seat.chooseAction(observation);
      },
    };
  }
  // Every rules seat resolves its policy through its Leader, the same way
  // `createRulesAgent` does for the CLI and the benchmark. See
  // `rules-seat.ts` for what this replaced and why it is not inline here.
  const leader = rulesSeatLeader(request.deckId, request.deckManifest);
  return leader ? new RegistryRulesAgent(leader) : new GenericRulesAgent();
}

self.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  if (isLearnedModelMessage(event.data)) {
    receiveLearnedModel(event.data);
    return;
  }
  const request = event.data;
  const agent = agents.get(request.agentKey) ?? createAgent(request);
  agents.set(request.agentKey, agent);
  void agent
    .chooseAction(request.observation)
    .then((action) => {
      self.postMessage({ id: request.id, actionId: action.actionId });
    })
    .catch((error: unknown) => {
      self.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
});
