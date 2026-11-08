/**
 * The learned opponent, as published in `open-optcg-model`.
 *
 * The package carries the code that plays; the weights are a separate download
 * (a `model-*` release's `scorer-model.json`, plus any `scorer-adapter-*.json`
 * deck adapters), because they are retrained far more often than the engine
 * changes and are ~12 MB. `loadModel` takes either the parsed packs or URLs to
 * them, and a pack built for an encoding this code cannot read is refused by
 * `loadCompact` rather than played badly.
 */
import {
  adapterFor,
  CompactScorerAgent,
  loadCompact,
  type CompactAdapter,
  type CompactPack,
} from "@one-piece-sim/agents/scorer";
import type { Agent } from "@one-piece-sim/protocol";

export type { CompactAdapter, CompactPack };

export interface LearnedModel {
  /** Where the base weights came from: the checkpoint named in the pack. */
  readonly source: string;
  /**
   * The agent for a seat playing `deck`. It uses the deck adapter trained on
   * that list's Leader when one was loaded, and the base model otherwise; the
   * deck's own cards tell it what it has yet to draw.
   */
  agentFor(deck: { leader: string; cards: Record<string, number> }): Agent;
}

type Source<T> = T | string | URL;

export async function loadModel(
  pack: Source<CompactPack>,
  options: { adapters?: readonly Source<CompactAdapter>[] } = {},
): Promise<LearnedModel> {
  const base = await read(pack);
  const adapters = await Promise.all((options.adapters ?? []).map(read));
  // One model per adapter, decoded once and shared by every seat that uses it.
  const models = new Map<CompactAdapter | undefined, CompactScorerAgent>();
  const modelFor = (adapter: CompactAdapter | undefined) => {
    let model = models.get(adapter);
    if (!model) {
      model = new CompactScorerAgent(loadCompact(base, adapter));
      models.set(adapter, model);
    }
    return model;
  };
  modelFor(undefined);
  return {
    source: base.source,
    agentFor(deck) {
      return modelFor(adapterFor(adapters, deck)).withDeck(deck.cards);
    },
  };
}

async function read<T>(source: Source<T>): Promise<T> {
  if (typeof source !== "string" && !(source instanceof URL)) return source;
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`MODEL_FETCH_FAILED: ${response.status} ${String(source)}`);
  }
  return (await response.json()) as T;
}
