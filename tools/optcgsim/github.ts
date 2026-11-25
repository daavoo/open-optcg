/**
 * The GitHub releases the bridge installs from: the project's own
 * (`bridge-*` for the plugin and the server, `model-*` for the weights) and
 * BepInEx's, which every BepInEx plugin is loaded by.
 *
 * One client, so the token handling and the rate-limit story live in one
 * place. Reading public releases needs no account; `GITHUB_TOKEN`, when set,
 * only lifts the anonymous rate limit (60 requests an hour), which a launcher
 * checking for updates on every start can otherwise reach.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface GithubAsset {
  name: string;
  url: string;
  size: number;
}

export interface GithubRelease {
  tag: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  assets: GithubAsset[];
}

interface ApiAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface ApiRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: ApiAsset[];
}

/**
 * The slice of the releases API the installer and the launcher use, so a test
 * can stand in for GitHub without a network.
 */
export interface ReleaseClient {
  releases(): Promise<GithubRelease[]>;
  newest(prefix: string): Promise<GithubRelease | undefined>;
  release(tag: string): Promise<GithubRelease | undefined>;
  download(url: string): Promise<Uint8Array>;
}

export class Github implements ReleaseClient {
  readonly #repository: string;
  readonly #headers: Record<string, string>;
  #cache: Promise<GithubRelease[]> | undefined;

  constructor(repository: string, token = process.env.GITHUB_TOKEN) {
    this.#repository = repository;
    this.#headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "open-optcg-bridge",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /** Every published release, newest first. One request, reused per run. */
  async releases(): Promise<GithubRelease[]> {
    this.#cache ??= this.#list();
    return this.#cache;
  }

  /** The newest published release whose tag starts with `prefix`. */
  async newest(prefix: string): Promise<GithubRelease | undefined> {
    return (await this.releases()).find((release) =>
      release.tag.startsWith(prefix),
    );
  }

  async release(tag: string): Promise<GithubRelease | undefined> {
    const response = await fetch(
      `https://api.github.com/repos/${this.#repository}/releases/tags/${tag}`,
      { headers: this.#headers },
    );
    if (response.status === 404) return undefined;
    if (!response.ok) throw await httpError(response);
    return toRelease((await response.json()) as ApiRelease);
  }

  /** An asset's bytes. */
  async download(url: string): Promise<Uint8Array> {
    const response = await fetch(url, { headers: this.#headers });
    if (!response.ok) throw await httpError(response);
    return new Uint8Array(await response.arrayBuffer());
  }

  /** An asset's bytes, written to `path` (making its folder first). */
  async downloadTo(url: string, path: string): Promise<number> {
    const bytes = await this.download(url);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return bytes.byteLength;
  }

  async #list(): Promise<GithubRelease[]> {
    const response = await fetch(
      `https://api.github.com/repos/${this.#repository}/releases?per_page=100`,
      { headers: this.#headers },
    );
    if (!response.ok) throw await httpError(response);
    return ((await response.json()) as ApiRelease[])
      .filter((release) => !release.draft)
      .map(toRelease);
  }
}

function toRelease(release: ApiRelease): GithubRelease {
  return {
    tag: release.tag_name,
    name: release.name ?? release.tag_name,
    body: release.body ?? "",
    draft: release.draft,
    prerelease: release.prerelease,
    assets: release.assets.map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
    })),
  };
}

async function httpError(response: Response): Promise<Error> {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const hint =
    response.status === 403 && remaining === "0"
      ? " (GitHub's anonymous rate limit; set GITHUB_TOKEN to lift it)"
      : "";
  return new Error(
    `${response.url}: ${response.status} ${response.statusText}${hint}`,
  );
}
