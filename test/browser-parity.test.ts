import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  replayActions as replayInNode,
  type ReplayCheckpoint,
  type ReplayFixture,
  type ResolvedDeck,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";

interface StoredReplayFixture extends ReplayFixture {
  final: {
    revision: number;
    stateHash: string;
    winner: string;
    resultReason: string;
  };
}

type Replay = (
  fixture: ReplayFixture,
  resolve: (deckId: string) => ResolvedDeck,
) => ReplayCheckpoint[];

async function loadBrowserReplay(): Promise<Replay> {
  const result = await build({
    stdin: {
      contents: 'export { replayActions } from "@one-piece-sim/engine-core";',
      resolveDir: process.cwd(),
      sourcefile: "browser-replay-entry.ts",
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    logLevel: "silent",
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error("MISSING_BROWSER_REPLAY_BUNDLE");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.contents).toString("base64")}`;
  const browserModule: unknown = await import(moduleUrl);
  if (
    typeof browserModule !== "object" ||
    browserModule === null ||
    !("replayActions" in browserModule) ||
    typeof browserModule.replayActions !== "function"
  ) {
    throw new Error("MISSING_BROWSER_REPLAY_EXPORT");
  }
  return browserModule.replayActions as Replay;
}

describe("Node/browser replay parity", () => {
  // This was skipped for a while because the fixture had gone illegal at r43
  // after a rules change, with no way to refresh it. `pnpm fixtures:record`
  // re-records it, and each fixture now carries the rules stamp it was recorded
  // under, so a stale one says so instead of failing mid-replay.
  it("produces identical events and hashes for the shared complete-game replay", async () => {
    const fixture = JSON.parse(
      await readFile(
        join(process.cwd(), "fixtures/replay/browser-parity-v1.json"),
        "utf8",
      ),
    ) as StoredReplayFixture;
    const browserReplay = await loadBrowserReplay();
    const nodeCheckpoints = replayInNode(fixture, resolveDeck);
    const browserCheckpoints = browserReplay(fixture, resolveDeck);

    expect(browserCheckpoints).toEqual(nodeCheckpoints);
    expect(nodeCheckpoints).toHaveLength(fixture.actions.length);
    expect(nodeCheckpoints.at(-1)).toMatchObject(fixture.final);
  });

  it("reports a fixture recorded under other rules as incompatible", () => {
    const stale: ReplayFixture = {
      version: 1,
      seed: "browser-parity-v1",
      decks: {
        p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
        p2: "(Green) Roronoa Zoro - Starter Deck 32",
      },
      actions: [],
      rules: {
        rulesVersion: "st31-st32-1.0",
        cardDataHash: "0".repeat(64),
        programHash: "0".repeat(64),
      },
    };

    // The failure a trace from an older build should produce: named, and with
    // the command that fixes it -- not `REPLAY_ILLEGAL_ACTION` at r43.
    expect(() => replayInNode(stale, resolveDeck)).toThrow(
      /REPLAY_RULES_MISMATCH.*pnpm fixtures:record/s,
    );
  });
});
