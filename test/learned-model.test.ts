import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The page's fetch of the learned model (`learned-model.ts`) and the workers'
 * side of it (`learned-model-source.ts`). The build's constants are free
 * identifiers in the modules, so they are set on the global object here before
 * each fresh import.
 */
type Globals = Record<string, unknown>;

/** A Cache Storage stand-in: one cache, keyed by URL. */
function fakeCaches() {
  const entries = new Map<string, string>();
  const cache = {
    match: async (url: URL | string) => {
      const text = entries.get(String(url));
      return text === undefined ? undefined : new Response(text);
    },
    put: async (url: URL | string, response: Response) => {
      entries.set(String(url), await response.text());
    },
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
    delete: async (request: Request) => entries.delete(request.url),
  };
  return { entries, caches: { open: async () => cache } };
}

async function freshLoader(version: string) {
  (globalThis as Globals).__LEARNED_MODEL__ = {
    url: "learned-model.json",
    version,
  };
  vi.resetModules();
  return import("../packages/web/src/learned-model.js");
}

describe("the page's learned model", () => {
  let store: ReturnType<typeof fakeCaches>;
  let fetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = fakeCaches();
    fetch = vi.fn(async () => new Response('{"pack":{},"adapters":[]}'));
    vi.stubGlobal("caches", store.caches);
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("location", { href: "https://example.test/open-optcg/" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as Globals).__LEARNED_MODEL__;
  });

  it("is fetched once, beside the page, under its version", async () => {
    const loader = await freshLoader("v1");
    const [first, second] = await Promise.all([
      loader.learnedModelText(),
      loader.learnedModelText(),
    ]);
    expect(first).toBe('{"pack":{},"adapters":[]}');
    expect(second).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe(
      "https://example.test/open-optcg/learned-model.json?v=v1",
    );
    expect([...store.entries.keys()]).toEqual([
      "https://example.test/open-optcg/learned-model.json?v=v1",
    ]);
  });

  it("comes from the cache on the next visit, with no request", async () => {
    await (await freshLoader("v1")).learnedModelText();
    fetch.mockClear();
    expect(await (await freshLoader("v1")).learnedModelText()).toBe(
      '{"pack":{},"adapters":[]}',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is fetched again for a new model, and the old copy dropped", async () => {
    await (await freshLoader("v1")).learnedModelText();
    await (await freshLoader("v2")).learnedModelText();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect([...store.entries.keys()]).toEqual([
      "https://example.test/open-optcg/learned-model.json?v=v2",
    ]);
  });

  it("is null when it cannot be had, and nothing is kept", async () => {
    fetch.mockRejectedValue(new Error("offline"));
    expect(await (await freshLoader("v1")).learnedModelText()).toBeNull();
    fetch.mockResolvedValue(new Response("", { status: 404 }));
    expect(await (await freshLoader("v1")).learnedModelText()).toBeNull();
    expect(store.entries.size).toBe(0);
  });

  it("still loads where the browser has no Cache Storage", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await (await freshLoader("v1")).learnedModelText()).toBe(
      '{"pack":{},"adapters":[]}',
    );
  });
});

describe("a worker's learned model", () => {
  async function freshSource(globals: Globals) {
    Object.assign(globalThis as Globals, {
      __SCORER_PACK__: null,
      __SCORER_ADAPTERS__: [],
      __SCORER_PACK_BY_MESSAGE__: false,
      ...globals,
    });
    vi.resetModules();
    return import("../packages/web/src/learned-model-source.js");
  }
  afterEach(() => {
    for (const name of [
      "__SCORER_PACK__",
      "__SCORER_ADAPTERS__",
      "__SCORER_PACK_BY_MESSAGE__",
    ]) {
      Reflect.deleteProperty(globalThis, name);
    }
  });

  it("is the inlined pack where the build carries one", async () => {
    const source = await freshSource({ __SCORER_PACK__: { kind: "x" } });
    expect(await source.learnedModel()).toEqual({
      pack: { kind: "x" },
      adapters: [],
    });
  });

  it("waits for the page's message where the page fetches it", async () => {
    const source = await freshSource({ __SCORER_PACK_BY_MESSAGE__: true });
    const waiting = source.learnedModel();
    source.receiveLearnedModel({
      learnedModel: '{"pack":{"kind":"y"},"adapters":[]}',
    });
    expect(await waiting).toEqual({ pack: { kind: "y" }, adapters: [] });
  });

  it("fails the seat, not the worker, when the page could not get it", async () => {
    const source = await freshSource({ __SCORER_PACK_BY_MESSAGE__: true });
    source.receiveLearnedModel({ learnedModel: null });
    await expect(source.learnedModel()).rejects.toThrow(
      "could not be downloaded",
    );
  });

  it("fails at once in a build without a model", async () => {
    const source = await freshSource({});
    await expect(source.learnedModel()).rejects.toThrow("SCORER_PACK_MISSING");
  });
});
