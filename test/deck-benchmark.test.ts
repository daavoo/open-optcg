import { describe, expect, it } from "vitest";
import {
  BENCHMARK_DECK_IDS,
  benchmarkPairs,
  filterReport,
  mergeShardedReports,
  runBenchmark,
} from "../packages/cli/src/deck-benchmark.js";
import { SELECTABLE_DECK_IDS } from "@one-piece-sim/decks";

describe("deck benchmark", () => {
  it("benchmarks every deck a 1v1 game can be set up with", () => {
    // The gate that keeps the app's field and the measured field the same set.
    // They were different for months, which is how the OP14 and OP17 tournament
    // decks came to be playable but never benchmarked.
    expect([...BENCHMARK_DECK_IDS]).toEqual([...SELECTABLE_DECK_IDS]);
  });

  it("runs paired seats and aggregates deterministic matchup results", async () => {
    const report = await runBenchmark({
      mode: "one-vs-all",
      focusDeck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      decks: [
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      ],
      seedsPerMatchup: 1,
      seedPrefix: "benchmark-test",
      rulesVersion: "test-v1",
    });

    expect(report.games).toHaveLength(2);
    expect(report.games.map((game) => [game.p1Deck, game.p2Deck])).toEqual([
      [
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      ],
      [
        "(Green) Roronoa Zoro - Starter Deck 32",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      ],
    ]);
    expect(report.games.every((game) => game.completed)).toBe(true);
    expect(report.summary.completed).toBe(2);
    expect(report.summary.decks).toHaveLength(2);
    expect(report.summary.matchups).toHaveLength(1);
    expect(report.summary.decks[0]?.cards).not.toHaveLength(0);
    expect(report.summary.decks[0]?.cards[0]?.winUsageRate).toBeTypeOf(
      "number",
    );
    expect(report.games[0]?.cardMetrics.p1).toBeDefined();
  });

  it("reassembles sharded runs into the rows a single run produces", async () => {
    // What makes `--jobs` safe to leave on by default: a shard is a slice of the
    // pair list, every game is a pure function of (decks, seed, seat), and the
    // merge restores canonical matchup order. If any of those stopped holding,
    // a parallel run would silently stop being comparable with a serial one.
    const decks = [
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
      "(Blue) Kuzan - Starter Deck 33",
    ] as const;
    const configuration = {
      mode: "all-vs-all",
      decks,
      seedsPerMatchup: 1,
      seedPrefix: "benchmark-shard-test",
      rulesVersion: "test-v1",
    } as const;
    const whole = await runBenchmark(configuration);
    const shards = await Promise.all(
      [0, 1].map((index) =>
        runBenchmark({ ...configuration, shard: { index, count: 2 } }),
      ),
    );

    expect(shards.map((shard) => shard.games.length)).toEqual([4, 2]);
    expect(
      mergeShardedReports(shards, benchmarkPairs("all-vs-all", decks)),
    ).toEqual(whole.games);
  });

  it("filters game rows and recomputes the summary", async () => {
    const report = await runBenchmark({
      mode: "one-vs-all",
      focusDeck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      decks: [
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      ],
      seedsPerMatchup: 1,
      seedPrefix: "benchmark-filter-test",
      rulesVersion: "test-v1",
    });
    const filtered = filterReport(report, {
      deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      seat: "p1",
    });

    expect(filtered.games).toHaveLength(1);
    expect(filtered.games[0]?.p1Deck).toBe(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    expect(filtered.summary.games).toBe(1);
  });

  it("runs each all-vs-all pair in both seat assignments", async () => {
    const report = await runBenchmark({
      mode: "all-vs-all",
      decks: [
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
        "(Blue) Kuzan - Starter Deck 33",
      ],
      seedsPerMatchup: 1,
      seedPrefix: "benchmark-matrix-test",
      rulesVersion: "test-v1",
    });

    expect(report.games).toHaveLength(6);
    expect(report.summary.matchups).toHaveLength(3);
    expect(report.summary.incomplete).toBe(0);
  });
});
