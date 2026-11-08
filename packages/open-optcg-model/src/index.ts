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

/**
 * The newest published model: the most recent `model-*` release of the
 * project's GitHub repository, its base pack and every deck adapter on it.
 *
 * Reads the public GitHub API, which allows 60 anonymous requests an hour and
 * serves release assets without CORS headers -- so this is for Node and other
 * servers. A browser app downloads the pack once, hosts it itself, and passes
 * its URL to `loadModel`.
 */
export async function fetchLatestModel(
  repository = "daavoo/open-optcg",
): Promise<LearnedModel & { readonly release: string }> {
  const releases = await read<
    {
      tag_name: string;
      draft: boolean;
      assets: { name: string; browser_download_url: string }[];
    }[]
  >(`https://api.github.com/repos/${repository}/releases?per_page=100`);
  // Newest first, which is the order the API lists them in.
  const release = releases.find(
    (candidate) => !candidate.draft && candidate.tag_name.startsWith("model-"),
  );
  if (!release) throw new Error(`MODEL_NOT_FOUND: no model-* release`);
  const pack = release.assets.find(
    (asset) => asset.name === "scorer-model.json",
  );
  if (!pack) throw new Error(`MODEL_NOT_FOUND: ${release.tag_name}`);
  const adapters = release.assets
    .filter((asset) => /^scorer-adapter-.+\.json$/.test(asset.name))
    .map((asset) => asset.browser_download_url);
  const model = await loadModel(pack.browser_download_url, { adapters });
  return { ...model, release: release.tag_name };
}

async function read<T>(source: Source<T>): Promise<T> {
  if (typeof source !== "string" && !(source instanceof URL)) return source;
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`MODEL_FETCH_FAILED: ${response.status} ${String(source)}`);
  }
  return (await response.json()) as T;
}
