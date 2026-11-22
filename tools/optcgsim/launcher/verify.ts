/**
 * Whether a published bridge release is complete enough to install.
 *
 * A `bridge-*` release is built in two places: CI publishes the launcher and
 * the manifest, and the maintainer uploads the plugin DLLs from a machine with
 * the sim (they cannot be compiled in CI). That split is easy to get half
 * right, and the symptom is a player whose launcher installs a plugin that is
 * not there. This checks the release against its own manifest:
 *
 *   - `launcher.mjs` and `bridge-manifest.json` are present;
 *   - every platform the manifest names has its `OpenOptcgBridge-<platform>.dll`;
 *   - each asset's bytes hash to the sha256 the manifest recorded.
 */
import { createHash } from "node:crypto";
import type { GithubRelease, ReleaseClient } from "../github.js";
import {
  appAsset,
  binaryAsset,
  pluginAsset,
  type Platform,
} from "./platform.js";

export interface BridgeManifest {
  tag: string;
  builtAt: string;
  model: string | null;
  launcher: { asset: string; sha256: string };
  plugin: Partial<Record<Platform, { asset: string; sha256: string }>>;
  binary: Partial<Record<Platform, { asset: string; sha256: string }>>;
  /** The zipped macOS applications; absent on releases built without one. */
  app?: Partial<Record<Platform, { asset: string; sha256: string }>>;
}

export interface VerifyResult {
  ok: boolean;
  problems: string[];
  manifest?: BridgeManifest;
}

export async function verifyRelease(
  github: ReleaseClient,
  release: GithubRelease,
): Promise<VerifyResult> {
  const problems: string[] = [];
  const manifestAsset = release.assets.find(
    (asset) => asset.name === "bridge-manifest.json",
  );
  if (!manifestAsset)
    return { ok: false, problems: ["no bridge-manifest.json"] };
  const manifest = JSON.parse(
    new TextDecoder().decode(await github.download(manifestAsset.url)),
  ) as BridgeManifest;

  const digest = async (name: string): Promise<string | undefined> => {
    const asset = release.assets.find((candidate) => candidate.name === name);
    if (!asset) return undefined;
    return createHash("sha256")
      .update(await github.download(asset.url))
      .digest("hex");
  };
  const check = async (name: string, expected: string): Promise<void> => {
    const actual = await digest(name);
    if (actual === undefined) {
      problems.push(`missing asset ${name}`);
      return;
    }
    if (actual !== expected) {
      problems.push(`${name}: sha256 ${actual} != manifest ${expected}`);
    }
  };

  await check(manifest.launcher.asset, manifest.launcher.sha256);
  for (const [platform, entry] of Object.entries(manifest.plugin)) {
    const expected = pluginAsset(platform as Platform);
    if (entry.asset !== expected) {
      problems.push(
        `${platform}: manifest names ${entry.asset}, expected ${expected}`,
      );
    }
    await check(expected, entry.sha256);
  }
  if (Object.keys(manifest.plugin).length === 0) {
    problems.push(
      "the manifest names no plugin DLL: was it built without --plugin?",
    );
  }
  for (const [platform, entry] of Object.entries(manifest.binary)) {
    const expected = binaryAsset(platform as Platform);
    if (entry.asset !== expected) {
      problems.push(
        `${platform}: manifest names ${entry.asset}, expected ${expected}`,
      );
    }
    await check(expected, entry.sha256);
  }
  if (Object.keys(manifest.binary).length === 0) {
    problems.push(
      "the manifest names no launcher binary: was it built without --binary?",
    );
  }
  for (const [platform, entry] of Object.entries(manifest.app ?? {})) {
    const expected = appAsset(platform as Platform);
    if (!expected) continue;
    if (entry.asset !== expected) {
      problems.push(
        `${platform}: manifest names ${entry.asset}, expected ${expected}`,
      );
    }
    await check(expected, entry.sha256);
  }
  return { ok: problems.length === 0, problems, manifest };
}
