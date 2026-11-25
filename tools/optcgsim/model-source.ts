/**
 * Where the bridge's weights come from.
 *
 * The learned model is a release asset, not a file in the repository: it is
 * retrained far more often than the engine changes, and a ~12 MB pack would
 * weigh down every clone and every commit that touches it. `pnpm model:fetch`
 * and the hosted page read the newest `model-*` GitHub release the same way;
 * this is the bridge's version of that, plus a disk cache so a launch is not a
 * twelve-megabyte download and an offline launch still works.
 *
 * Resolution order, first hit wins:
 *
 *   1. `--model <path>` (and `--adapters <dir>`): a pinned or local pack.
 *   2. The newest `model-*` release, from the cache or downloaded into it.
 *   3. The newest `model-*` tag already in the cache, when GitHub cannot be
 *      reached (or `--offline` was asked for).
 *   4. `packages/web/src/scorer-model.json`, when the checkout has one.
 *
 * A release that carries no `scorer-model.json`, or a pack built for an
 * encoding this build cannot read, is refused rather than played badly.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type CompactAdapter,
  type CompactPack,
  isCompactPack,
} from "@one-piece-sim/agents/scorer";
import { Github, type ReleaseClient } from "./github.js";

/** The tag prefix every published model release carries (`ml/README.md`). */
export const MODEL_TAG_PREFIX = "model-";
const PACK_ASSET = "scorer-model.json";
const ADAPTER_ASSET = /^scorer-adapter-.+\.json$/;

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface ReleaseInfo {
  tag: string;
  assets: ReleaseAsset[];
}

/**
 * The GitHub releases the bridge reads. Injectable so the resolution tests
 * need no network, and so a mirror or a local folder can stand in later.
 */
export interface ReleaseSource {
  /** The newest non-draft release whose tag starts with `prefix`, or none. */
  newest(prefix: string): Promise<ReleaseInfo | undefined>;
  /** Every release tag with the prefix, newest first. */
  tags(prefix: string): Promise<string[]>;
  /** An asset's bytes. */
  download(url: string): Promise<Uint8Array>;
}

export interface ModelLocation {
  pack: CompactPack;
  adapters: CompactAdapter[];
  /** The `model-*` release tag, or `"local"` for a pack read off disk. */
  release: string;
}

export interface ResolveModelOptions {
  /** `--model`: a pack file to use instead of the newest release. */
  modelPath?: string;
  /** `--adapters`: the directory of adapters that goes with `modelPath`. */
  adapterDir?: string;
  /** Where downloaded releases are kept (one folder per tag). */
  cacheDir: string;
  /** Defaults to the public GitHub API for this repository. */
  source?: ReleaseSource;
  /** Skip the network; use only what the cache already holds. */
  offline?: boolean;
  /**
   * A pack to fall back on when nothing is cached, so a development checkout
   * keeps working with no release and no network. Defaults to
   * `packages/web/src/scorer-model.json`.
   */
  fallbackPath?: string;
  log?: (line: string) => void;
}

/**
 * The model the bridge should play, and which release it came from.
 *
 * Never returns without weights: a caller that gets here either has a pack or
 * an error naming what to fix.
 */
export async function resolveModel(
  options: ResolveModelOptions,
): Promise<ModelLocation> {
  const log = options.log ?? ((): void => {});
  if (options.modelPath) {
    return {
      ...readModelFiles(options.modelPath, options.adapterDir),
      release: "local",
    };
  }
  const source = options.source ?? githubReleaseSource();
  if (!options.offline) {
    let newest: ReleaseInfo | undefined;
    try {
      newest = await source.newest(MODEL_TAG_PREFIX);
    } catch (error) {
      log(
        `could not read the release list (${message(error)}); using the cache`,
      );
    }
    if (newest) {
      const cached = await readCache(options.cacheDir, newest.tag);
      if (cached) {
        log(`${newest.tag}: from the cache`);
        return cached;
      }
      try {
        const downloaded = await downloadRelease(
          options.cacheDir,
          newest,
          source,
        );
        log(`${newest.tag}: downloaded`);
        return downloaded;
      } catch (error) {
        log(`could not download ${newest.tag}: ${message(error)}`);
      }
    }
  }
  const cached = await newestCachedRelease(options.cacheDir);
  if (cached) {
    log(`${cached.release}: newest release in the cache`);
    return cached;
  }
  const fallback =
    options.fallbackPath ??
    join(process.cwd(), "packages/web/src/scorer-model.json");
  if (existsSync(fallback)) {
    log("no release and nothing cached; using the checkout's pack");
    return { ...readModelFiles(fallback, undefined), release: "local" };
  }
  throw new Error(
    "MODEL_NOT_FOUND: no model-* release, nothing in the cache, and no " +
      "packages/web/src/scorer-model.json -- pass --model <path>",
  );
}

/**
 * What the launcher shows about the model without downloading it: the newest
 * published `model-*` tag and the newest one already on disk.
 */
export async function modelStatus(options: {
  cacheDir: string;
  source?: ReleaseSource;
  offline?: boolean;
}): Promise<{ published: string | null; cached: string | null }> {
  let published: string | null = null;
  if (!options.offline) {
    try {
      published =
        (
          await (options.source ?? githubReleaseSource()).newest(
            MODEL_TAG_PREFIX,
          )
        )?.tag ?? null;
    } catch {
      // Offline or rate-limited: the cached tag is still worth showing.
    }
  }
  const cached = (await newestCachedRelease(options.cacheDir))?.release ?? null;
  return { published, cached };
}

/** The public GitHub releases, read without an account (a token only lifts the rate limit). */
export function githubReleaseSource(
  repository = process.env.GITHUB_REPOSITORY ?? "daavoo/open-optcg",
): ReleaseSource {
  return releaseSourceOf(new Github(repository));
}

/** The model source's view of a shared releases client. */
export function releaseSourceOf(github: ReleaseClient): ReleaseSource {
  return {
    async newest(prefix) {
      const release = await github.newest(prefix);
      return release
        ? {
            tag: release.tag,
            assets: release.assets.map((asset) => ({
              name: asset.name,
              url: asset.url,
            })),
          }
        : undefined;
    },
    async tags(prefix) {
      return (await github.releases())
        .filter((release) => release.tag.startsWith(prefix))
        .map((release) => release.tag);
    },
    download: (url) => github.download(url),
  };
}

/** Writes a release's pack and adapters into `<cacheDir>/<tag>/` and reads them back. */
async function downloadRelease(
  cacheDir: string,
  release: ReleaseInfo,
  source: ReleaseSource,
): Promise<ModelLocation> {
  const pack = release.assets.find((asset) => asset.name === PACK_ASSET);
  if (!pack)
    throw new Error(`MODEL_NOT_FOUND: ${release.tag} has no ${PACK_ASSET}`);
  const directory = join(cacheDir, release.tag);
  await mkdir(directory, { recursive: true });
  const adapters = release.assets.filter((asset) =>
    ADAPTER_ASSET.test(asset.name),
  );
  // The pack last: a half-written cache is a folder with no pack, which
  // `readCache` refuses and the next launch downloads again.
  for (const asset of adapters) {
    await writeFile(
      join(directory, asset.name),
      await source.download(asset.url),
    );
  }
  await writeFile(join(directory, PACK_ASSET), await source.download(pack.url));
  return {
    ...readModelFiles(join(directory, PACK_ASSET), directory),
    release: release.tag,
  };
}

/** A tag's cached pack and adapters, or undefined when the folder holds no pack. */
async function readCache(
  cacheDir: string,
  tag: string,
): Promise<ModelLocation | undefined> {
  const directory = join(cacheDir, tag);
  const pack = join(directory, PACK_ASSET);
  if (!existsSync(pack)) return undefined;
  try {
    return { ...readModelFiles(pack, directory), release: tag };
  } catch {
    // A pack this build cannot read is worse than a fetch: drop it and let the
    // caller fall through to the network or a newer cached tag.
    return undefined;
  }
}

/**
 * The newest tag the cache holds, by release-tag order.
 *
 * Tags are `model-<run>` and runs only grow, so the numeric suffix is the
 * order; a tag that does not match sorts below every one that does.
 */
async function newestCachedRelease(
  cacheDir: string,
): Promise<ModelLocation | undefined> {
  if (!existsSync(cacheDir)) return undefined;
  const tags = (await readdir(cacheDir, { withFileTypes: true }))
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith(MODEL_TAG_PREFIX),
    )
    .map((entry) => entry.name)
    .sort((left, right) => runNumber(right) - runNumber(left));
  for (const tag of tags) {
    const cached = await readCache(cacheDir, tag);
    if (cached) return cached;
  }
  return undefined;
}

function runNumber(tag: string): number {
  const match = /(\d+)\s*$/.exec(tag);
  return match ? Number(match[1]) : -1;
}

/** Reads a pack and its adapters off disk, refusing a text-scorer pack. */
export function readModelFiles(
  modelPath: string,
  adapterDir: string | undefined,
): { pack: CompactPack; adapters: CompactAdapter[] } {
  const pack = JSON.parse(readFileSync(modelPath, "utf8")) as unknown;
  if (!isCompactPack(pack as never)) {
    throw new Error(
      `${modelPath} is not a compact pack; the bridge plays the compact one`,
    );
  }
  const compact = pack as CompactPack;
  const adapters = adapterDir
    ? readdirSync(adapterDir)
        .filter((file) => file.endsWith(".json"))
        .map(
          (file) =>
            JSON.parse(
              readFileSync(join(adapterDir, file), "utf8"),
            ) as CompactAdapter,
        )
        // An adapter is a low-rank update over one base pack: over any other it
        // is meaningless, and `adapterFor` would silently ignore it anyway.
        .filter((adapter) => adapter.base === compact.source)
    : [];
  return { pack: compact, adapters };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
