import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  type GithubRelease,
  type ReleaseClient,
} from "../tools/optcgsim/github.js";
import {
  installedState,
  installSim,
} from "../tools/optcgsim/launcher/install.js";
import {
  appAsset,
  bepinexAsset,
  binaryAsset,
  findSimDir,
  isSimDir,
  pluginAsset,
  simMarker,
} from "../tools/optcgsim/launcher/platform.js";
import { verifyRelease } from "../tools/optcgsim/launcher/verify.js";

const PLUGIN = new TextEncoder().encode("PLUGIN-BYTES");

/** The BepInEx archive as a release carries it: the loader and the run script. */
function bepinexZip(): Uint8Array {
  const encoder = new TextEncoder();
  return zipSync({
    "BepInEx/core/BepInEx.dll": encoder.encode("BEPINEX"),
    "run_bepinex.sh": encoder.encode(
      '#!/bin/sh\n# BepInEx\n\nexecutable_name=""\n\n./doorstop\n',
    ),
  });
}

interface Fake extends ReleaseClient {
  downloads: string[];
}

function fakeClient(): Fake {
  const releases: GithubRelease[] = [
    {
      tag: "bridge-v1",
      name: "Bridge v1",
      body: "",
      draft: false,
      prerelease: false,
      assets: [
        { name: pluginAsset("macos"), url: "plugin-url", size: PLUGIN.length },
        { name: pluginAsset("windows"), url: "plugin-win-url", size: 1 },
      ],
    },
  ];
  const client: Fake = {
    downloads: [],
    async releases() {
      return releases;
    },
    async newest(prefix) {
      return releases.find((release) => release.tag.startsWith(prefix));
    },
    async release(tag) {
      return releases.find((release) => release.tag === tag);
    },
    async download(url) {
      client.downloads.push(url);
      if (url === "plugin-url") return PLUGIN;
      if (url.includes("BepInEx")) return bepinexZip();
      throw new Error(`unexpected download ${url}`);
    },
  };
  return client;
}

function simFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "optcgsim-sim-"));
  // The launcher only looks for the marker; the app itself is the player's.
  mkdirSync(join(folder, "OPTCGSim.app"), { recursive: true });
  return folder;
}

describe("installSim", () => {
  it("installs BepInEx, the plugin and the run script's executable name", async () => {
    const simDir = simFolder();
    const statePath = join(
      mkdtempSync(join(tmpdir(), "optcgsim-state-")),
      "bridge.json",
    );
    const client = fakeClient();

    const result = await installSim({
      simDir,
      platform: "macos",
      github: client,
      statePath,
    });

    expect(result.bridge).toBe("bridge-v1");
    expect(result.bepinexInstalled).toBe(true);
    expect(result.pluginInstalled).toBe(true);
    expect(existsSync(join(simDir, "BepInEx", "core", "BepInEx.dll"))).toBe(
      true,
    );
    const plugin = join(simDir, "BepInEx", "plugins", "OpenOptcgBridge.dll");
    expect(new Uint8Array(readFileSync(plugin))).toEqual(PLUGIN);
    const script = readFileSync(join(simDir, "run_bepinex.sh"), "utf8");
    expect(script).toContain('executable_name="OPTCGSim.app"');
    // Everything else BepInEx's script does is left alone.
    expect(script).toContain("./doorstop");
    expect(installedState(statePath)).toMatchObject({
      simDir,
      bridge: "bridge-v1",
    });
  });

  it("keeps an existing BepInEx install", async () => {
    const simDir = simFolder();
    const statePath = join(
      mkdtempSync(join(tmpdir(), "optcgsim-state-")),
      "bridge.json",
    );
    const client = fakeClient();
    await installSim({ simDir, platform: "macos", github: client, statePath });
    const before = client.downloads.length;

    const result = await installSim({
      simDir,
      platform: "macos",
      github: client,
      statePath,
    });

    expect(result.bepinexInstalled).toBe(false);
    expect(result.pluginInstalled).toBe(true);
    // Only the plugin was fetched the second time.
    expect(client.downloads.length).toBe(before + 1);
    expect(client.downloads.at(-1)).toBe("plugin-url");
  });

  it("writes nothing on a dry run", async () => {
    const simDir = simFolder();
    const statePath = join(
      mkdtempSync(join(tmpdir(), "optcgsim-state-")),
      "bridge.json",
    );

    const result = await installSim({
      simDir,
      platform: "macos",
      github: fakeClient(),
      statePath,
      dryRun: true,
    });

    expect(result.bridge).toBe("bridge-v1");
    expect(result.bepinexInstalled).toBe(false);
    expect(result.pluginInstalled).toBe(false);
    expect(existsSync(join(simDir, "BepInEx"))).toBe(false);
    expect(existsSync(statePath)).toBe(false);
  });

  it("installs a local DLL with no release at all", async () => {
    const simDir = simFolder();
    const statePath = join(
      mkdtempSync(join(tmpdir(), "optcgsim-state-")),
      "bridge.json",
    );
    const dll = join(
      mkdtempSync(join(tmpdir(), "optcgsim-dll-")),
      "OpenOptcgBridge.dll",
    );
    writeFileSync(dll, "LOCAL");

    const result = await installSim({
      simDir,
      platform: "macos",
      pluginDll: dll,
      statePath,
      github: fakeClient(),
    });

    expect(result.bridge).toBe("local");
    const plugin = join(simDir, "BepInEx", "plugins", "OpenOptcgBridge.dll");
    expect(readFileSync(plugin, "utf8")).toBe("LOCAL");
  });

  it("refuses a folder that is not a sim install", async () => {
    const folder = mkdtempSync(join(tmpdir(), "optcgsim-empty-"));

    await expect(
      installSim({ simDir: folder, platform: "macos", github: fakeClient() }),
    ).rejects.toThrow(/NOT_A_SIM_FOLDER/);
  });
});

describe("verifyRelease", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);
  const sha = (text: string) =>
    createHash("sha256").update(bytes(text)).digest("hex");

  function releaseWith(
    manifest: unknown,
    files: Record<string, string>,
  ): { github: ReleaseClient; release: GithubRelease } {
    const contents: Record<string, string> = {
      "bridge-manifest.json": JSON.stringify(manifest),
      ...files,
    };
    const assets = Object.keys(contents).map((name) => ({
      name,
      url: `asset:${name}`,
      size: contents[name]!.length,
    }));
    return {
      github: {
        async releases() {
          return [];
        },
        async newest() {
          return undefined;
        },
        async release() {
          return undefined;
        },
        async download(url) {
          return bytes(contents[url.replace(/^asset:/, "")]!);
        },
      },
      release: {
        tag: "bridge-v1",
        name: "Bridge v1",
        body: "",
        draft: false,
        prerelease: false,
        assets,
      },
    };
  }

  const manifest = (plugin: string, pluginSha: string) => ({
    tag: "bridge-v1",
    builtAt: "2026-11-21T00:00:00.000Z",
    model: "model-v12",
    launcher: { asset: "launcher.mjs", sha256: sha("LAUNCHER") },
    plugin: { macos: { asset: plugin, sha256: pluginSha } },
    binary: {
      macos: { asset: binaryAsset("macos"), sha256: sha("BINARY") },
    },
    app: { macos: { asset: appAsset("macos")!, sha256: sha("APPZIP") } },
  });
  const files = {
    "launcher.mjs": "LAUNCHER",
    "OpenOptcgBridge-macos.dll": "PLUGIN",
    "open-optcg-bridge-macos": "BINARY",
    "open-optcg-bridge-macos.app.zip": "APPZIP",
  };
  const without = (
    record: Record<string, string>,
    key: string,
  ): Record<string, string> =>
    Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

  it("accepts a release whose assets match its manifest", async () => {
    const { github, release } = releaseWith(
      manifest(pluginAsset("macos"), sha("PLUGIN")),
      files,
    );

    const result = await verifyRelease(github, release);

    expect(result.ok).toBe(true);
    expect(result.manifest?.model).toBe("model-v12");
  });

  it("catches a plugin that was never uploaded", async () => {
    const { github, release } = releaseWith(
      manifest(pluginAsset("macos"), sha("PLUGIN")),
      without(files, "OpenOptcgBridge-macos.dll"),
    );

    const result = await verifyRelease(github, release);

    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain(
      "missing asset OpenOptcgBridge-macos.dll",
    );
  });

  it("catches a launcher binary that was never uploaded", async () => {
    const { github, release } = releaseWith(
      manifest(pluginAsset("macos"), sha("PLUGIN")),
      without(files, "open-optcg-bridge-macos"),
    );

    const result = await verifyRelease(github, release);

    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain(
      "missing asset open-optcg-bridge-macos",
    );
  });

  it("catches a macOS app that was never uploaded", async () => {
    const { github, release } = releaseWith(
      manifest(pluginAsset("macos"), sha("PLUGIN")),
      without(files, "open-optcg-bridge-macos.app.zip"),
    );

    const result = await verifyRelease(github, release);

    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain(
      "missing asset open-optcg-bridge-macos.app.zip",
    );
  });

  it("catches an asset that does not hash to the manifest", async () => {
    const { github, release } = releaseWith(
      manifest(pluginAsset("macos"), sha("OTHER")),
      files,
    );

    const result = await verifyRelease(github, release);

    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/sha256/);
  });

  it("catches a release with no manifest at all", async () => {
    const { github, release } = releaseWith({}, { "launcher.mjs": "LAUNCHER" });
    const withoutManifest: GithubRelease = {
      ...release,
      assets: release.assets.filter(
        (asset) => asset.name !== "bridge-manifest.json",
      ),
    };

    const result = await verifyRelease(github, withoutManifest);

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["no bridge-manifest.json"]);
  });
});

describe("platform", () => {
  it("names the BepInEx asset the README pins", () => {
    expect(bepinexAsset("macos")).toBe("BepInEx_macos_universal_5.4.23.6.zip");
    expect(bepinexAsset("windows")).toBe("BepInEx_win_x64_5.4.23.6.zip");
    expect(bepinexAsset("linux")).toBe("BepInEx_linux_x64_5.4.23.6.zip");
  });

  it("looks for the platform's own executable", () => {
    expect(simMarker("macos")).toBe("OPTCGSim.app");
    expect(simMarker("windows")).toBe("OPTCGSim.exe");
    expect(isSimDir(simFolder(), "macos")).toBe(true);
  });

  it("finds a sim in the first default folder that has one", () => {
    // The real machine's /Applications may or may not hold one; the contract
    // is that whatever it returns is a real install.
    const found = findSimDir("macos");
    if (found !== undefined) expect(isSimDir(found, "macos")).toBe(true);
  });
});
