/**
 * The learned model, fetched by the page rather than carried in it.
 *
 * The hosted page is built with `--external-model`: the pack is published
 * beside it as `learned-model.json`, and the page asks for it once it has
 * drawn, so the first screen does not wait on twelve megabytes it may never
 * use. The text is kept in the browser's Cache Storage under the build's
 * content hash, so later visits read it from disk without asking the network,
 * and a page built with a new model fetches the new file and drops the old.
 * The workers get the text by message (`learned-model-source.ts`).
 *
 * A default build inlines the pack instead and never comes here:
 * `__LEARNED_MODEL__` is null.
 */

/** Where the model is and which build of it; null when it is inlined or absent. */
declare const __LEARNED_MODEL__: { url: string; version: string } | null;

const CACHE_NAME = "open-optcg-learned-model";

let loading: Promise<string | null> | null = null;

/** Whether this page fetches the model rather than carrying it. */
export function learnedModelIsFetched(): boolean {
  return __LEARNED_MODEL__ !== null;
}

/**
 * The model file's text, from the cache or the network, fetched once per page
 * however many workers ask; null where the page carries none or it could not
 * be had.
 */
export function learnedModelText(): Promise<string | null> {
  loading ??= load();
  return loading;
}

async function load(): Promise<string | null> {
  const model = __LEARNED_MODEL__;
  if (!model) return null;
  const url = new URL(model.url, location.href);
  url.searchParams.set("v", model.version);
  const cache = await openCache();
  try {
    const kept = await cache?.match(url);
    if (kept) return await kept.text();
    const response = await fetch(url);
    if (!response.ok) return null;
    const text = await response.clone().text();
    if (cache) {
      await cache.put(url, response).catch(() => undefined);
      await dropOlderVersions(cache, url);
    }
    return text;
  } catch {
    return null;
  }
}

/** Cache Storage, or null where the browser offers none (an insecure page). */
async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function dropOlderVersions(cache: Cache, current: URL): Promise<void> {
  try {
    for (const request of await cache.keys()) {
      if (request.url !== current.href) await cache.delete(request);
    }
  } catch {
    // An old copy left behind costs space, not correctness.
  }
}

/** Posts the model to a worker once it is in hand; a no-op where it is inlined. */
export function sendLearnedModel(worker: Worker): void {
  if (!learnedModelIsFetched()) return;
  void learnedModelText().then((text) => {
    worker.postMessage({ learnedModel: text });
  });
}
