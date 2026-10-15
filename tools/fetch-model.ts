/**
 * Download the published learned model into `packages/web/src/`, where
 * `pnpm web:build` inlines it.
 *
 * The model is a release asset, not a committed file: a ~12 MB pack would weigh
 * down every clone and every commit that retrains it. The newest release whose
 * tag starts with `model-` is the published one; it carries `scorer-model.json`
 * and any deck adapters over it as `scorer-adapter-<deck>.json`.
 *
 *   pnpm model:fetch            # the newest model-* release
 *   pnpm model:fetch model-v6   # a named one
 *
 * Reads the public GitHub API, so no account is needed; `GITHUB_TOKEN`, when
 * set (CI), only lifts the anonymous rate limit.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = process.env.GITHUB_REPOSITORY ?? "daavoo/open-optcg";
const TAG_PREFIX = "model-";
const webRoot = join(process.cwd(), "packages/web/src");

interface Release {
  tag_name: string;
  draft: boolean;
  assets: { name: string; browser_download_url: string }[];
}

const headers: Record<string, string> = {
  Accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function download(url: string, path: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  return bytes.byteLength;
}

const wanted = process.argv[2];
const release = wanted
  ? await getJson<Release>(
      `https://api.github.com/repos/${REPO}/releases/tags/${wanted}`,
    )
  : // Newest first, which is the order the API lists them in.
    (
      await getJson<Release[]>(
        `https://api.github.com/repos/${REPO}/releases?per_page=100`,
      )
    ).find((r) => !r.draft && r.tag_name.startsWith(TAG_PREFIX));
if (!release) {
  throw new Error(`No ${TAG_PREFIX}* release on ${REPO}`);
}

const pack = release.assets.find((a) => a.name === "scorer-model.json");
if (!pack) {
  throw new Error(`${release.tag_name} has no scorer-model.json asset`);
}
const packBytes = await download(
  pack.browser_download_url,
  join(webRoot, "scorer-model.json"),
);
console.log(
  `${release.tag_name}: scorer-model.json (${Math.round(packBytes / 1024)} KB)`,
);

const adaptersRoot = join(webRoot, "scorer-adapters");
await mkdir(adaptersRoot, { recursive: true });
for (const asset of release.assets) {
  const deck = /^scorer-adapter-(.+\.json)$/.exec(asset.name)?.[1];
  if (!deck) continue;
  const bytes = await download(
    asset.browser_download_url,
    join(adaptersRoot, deck),
  );
  console.log(
    `${release.tag_name}: ${asset.name} (${Math.round(bytes / 1024)} KB)`,
  );
}
