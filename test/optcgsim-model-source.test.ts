import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MODEL_TAG_PREFIX,
  resolveModel,
  type ReleaseInfo,
  type ReleaseSource,
} from "../tools/optcgsim/model-source.js";

const pack = (source: string) => ({ kind: "compact", source });
const adapter = (base: string) => ({
  kind: "compact-adapter",
  base,
  source: "adapter",
});

function cacheDir(): string {
  return mkdtempSync(join(tmpdir(), "optcgsim-model-"));
}

/** A release source that counts every call, so a cache hit is provable. */
function fakeSource(
  releases: ReleaseInfo[],
  options: { fail?: boolean } = {},
): ReleaseSource & { downloads: number; listings: number } {
  const source = {
    downloads: 0,
    listings: 0,
    async newest(prefix: string) {
      source.listings += 1;
      if (options.fail) throw new Error("offline");
      return releases.find((release) => release.tag.startsWith(prefix));
    },
    async tags(prefix: string) {
      if (options.fail) throw new Error("offline");
      return releases
        .map((release) => release.tag)
        .filter((tag) => tag.startsWith(prefix));
    },
    async download(url: string) {
      source.downloads += 1;
      // The bytes a real release serves: the pack for the pack asset, an
      // adapter whose base matches it for an adapter asset.
      const body = url.includes("adapter") ? adapter("base") : pack("base");
      return new TextEncoder().encode(JSON.stringify(body));
    },
  };
  return source;
}

describe("resolveModel", () => {
  it("reads an explicit pack and the adapters over it", async () => {
    const directory = cacheDir();
    writeFileSync(
      join(directory, "scorer-model.json"),
      JSON.stringify(pack("base")),
    );
    writeFileSync(
      join(directory, "scorer-adapter-op09.json"),
      JSON.stringify(adapter("base")),
    );
    // An adapter over another pack is ignored, not misapplied.
    writeFileSync(
      join(directory, "scorer-adapter-other.json"),
      JSON.stringify(adapter("other")),
    );

    const model = await resolveModel({
      modelPath: join(directory, "scorer-model.json"),
      adapterDir: directory,
      cacheDir: directory,
    });

    expect(model.release).toBe("local");
    expect(model.pack.source).toBe("base");
    expect(model.adapters.map((entry) => entry.source)).toEqual(["adapter"]);
  });

  it("downloads the newest release once and serves it from the cache after", async () => {
    const directory = cacheDir();
    const source = fakeSource([
      {
        tag: "model-v2",
        assets: [
          { name: "scorer-model.json", url: "pack-url" },
          { name: "scorer-adapter-op09.json", url: "adapter-url" },
          { name: "deck-standings.json", url: "ignored" },
        ],
      },
    ]);

    const first = await resolveModel({ cacheDir: directory, source });
    expect(first.release).toBe("model-v2");
    expect(first.pack.source).toBe("base");
    expect(source.downloads).toBe(2);
    expect(first.adapters).toHaveLength(1);

    const second = await resolveModel({ cacheDir: directory, source });
    expect(second.release).toBe("model-v2");
    // The listing happens every launch (that is how a new release is found);
    // the twelve-megabyte pack does not.
    expect(source.downloads).toBe(2);
  });

  it("falls back to the newest cached tag when GitHub cannot be reached", async () => {
    const directory = cacheDir();
    for (const tag of ["model-v1", "model-v2", "model-v10"]) {
      mkdirSync(join(directory, tag), { recursive: true });
      writeFileSync(
        join(directory, tag, "scorer-model.json"),
        JSON.stringify(pack(tag)),
      );
    }
    const source = fakeSource([], { fail: true });

    const model = await resolveModel({ cacheDir: directory, source });

    // Numeric run order, not string order: v10 is newer than v2.
    expect(model.release).toBe("model-v10");
    expect(source.downloads).toBe(0);
  });

  it("skips a tag whose cached pack is unreadable", async () => {
    const directory = cacheDir();
    mkdirSync(join(directory, "model-v3"), { recursive: true });
    writeFileSync(join(directory, "model-v3", "scorer-model.json"), "{}");
    mkdirSync(join(directory, "model-v2"), { recursive: true });
    writeFileSync(
      join(directory, "model-v2", "scorer-model.json"),
      JSON.stringify(pack("model-v2")),
    );

    const model = await resolveModel({
      cacheDir: directory,
      source: fakeSource([], { fail: true }),
    });

    expect(model.release).toBe("model-v2");
  });

  it("refuses a text-scorer pack", async () => {
    const directory = cacheDir();
    // The text scorer's pack carries no `kind`; the compact one's does.
    writeFileSync(
      join(directory, "scorer-model.json"),
      JSON.stringify({ version: 1, source: "text-scorer" }),
    );

    await expect(
      resolveModel({
        modelPath: join(directory, "scorer-model.json"),
        cacheDir: directory,
      }),
    ).rejects.toThrow(/compact/);
  });

  it("names what to fix when there is no model anywhere", async () => {
    const directory = cacheDir();

    await expect(
      resolveModel({
        cacheDir: directory,
        source: fakeSource([]),
        fallbackPath: join(directory, "absent.json"),
      }),
    ).rejects.toThrow(/MODEL_NOT_FOUND/);
  });

  it("never asks the network when offline", async () => {
    const directory = cacheDir();
    const source = fakeSource(
      [{ tag: "model-v9", assets: [{ name: "scorer-model.json", url: "x" }] }],
      { fail: true },
    );

    await expect(
      resolveModel({
        cacheDir: directory,
        source,
        offline: true,
        fallbackPath: join(directory, "absent.json"),
      }),
    ).rejects.toThrow(/MODEL_NOT_FOUND/);
    expect(source.listings).toBe(0);
  });

  it("falls back to a checkout's pack when nothing is published or cached", async () => {
    const directory = cacheDir();
    const fallback = join(directory, "scorer-model.json");
    writeFileSync(fallback, JSON.stringify(pack("checkout")));

    const model = await resolveModel({
      cacheDir: directory,
      source: fakeSource([], { fail: true }),
      fallbackPath: fallback,
    });

    expect(model.release).toBe("local");
    expect(model.pack.source).toBe("checkout");
  });
});

describe("MODEL_TAG_PREFIX", () => {
  it("is the prefix the published releases use", () => {
    expect(MODEL_TAG_PREFIX).toBe("model-");
  });
});
