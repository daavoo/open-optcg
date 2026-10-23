import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rulesStamp } from "@one-piece-sim/engine-core";
import {
  STANDINGS_DIVISIONS,
  STANDINGS_PATHS,
  STANDINGS_SEEDS,
  STANDINGS_TOLERANCE,
  compareStandings,
  divisionDecks,
  parseCsvLine,
  parseStandings,
  parseStandingsOptions,
  readShardReports,
  renderStandings,
  seedsFor,
  standingsDiff,
  standingsFromReport,
  type ShardReports,
  type StandingsRun,
} from "../tools/deck-standings.js";
import {
  BENCHMARK_SCHEMA_VERSION,
  defaultBenchmarkDecks,
  type BenchmarkDeckId,
  type BenchmarkGame,
  type BenchmarkReport,
} from "../packages/cli/src/deck-benchmark.js";

/**
 * The committed files are the field-wide instrument's answer, and the only
 * thing that makes them usable in a diff is that regenerating them is a no-op.
 * These pin the two ways that can break: a wall-clock or otherwise unstable
 * value leaking into the render, and the ranking reordering on a tie.
 *
 * They do not re-run the benchmark -- `pnpm standings:check` does, in its own CI
 * job, because it takes minutes rather than milliseconds.
 */
function deck(
  name: string,
  overrides: Partial<BenchmarkReport["summary"]["decks"][number]> = {},
): BenchmarkReport["summary"]["decks"][number] {
  return {
    deck: name as never,
    games: 20,
    wins: 10,
    losses: 10,
    incomplete: 0,
    winRate: 0.5,
    p1Games: 10,
    p1Wins: 5,
    p2Games: 10,
    p2Wins: 5,
    startedGames: 10,
    startedWins: 5,
    averageTurns: 12,
    averageActions: 100,
    cards: [],
    ...overrides,
  };
}

function report(
  decks: BenchmarkReport["summary"]["decks"],
  createdAt = "2026-08-25T00:00:00.000Z",
): BenchmarkReport {
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    rulesVersion: "current",
    createdAt,
    configuration: {
      mode: "all-vs-all",
      focusDeck: null,
      decks: decks.map((row) => row.deck),
      seedsPerMatchup: 10,
      pairedSeats: true,
      seedPrefix: "rules-benchmark",
      maxActions: 800,
    },
    summary: {
      games: 20 * decks.length,
      completed: 20 * decks.length,
      incomplete: 0,
      averageTurns: 13.5,
      averageActions: 120,
      decks,
      matchups: [],
    },
    games: [],
  };
}

/** One division's CSV, rendered from a synthetic report. */
function csv(
  decks: BenchmarkReport["summary"]["decks"],
  division: (typeof STANDINGS_DIVISIONS)[number] = "featured",
): string {
  return renderStandings(standingsFromReport(division, report(decks)));
}

/** A row's cells, by column name, from a rendered CSV. */
function cells(rendered: string, deckName: string): Record<string, string> {
  const lines = rendered.split("\n").filter((line) => line.trim() !== "");
  const header = parseCsvLine(lines[0] ?? "");
  const row = lines
    .slice(1)
    .map(parseCsvLine)
    .find((values) => values[0] === deckName);
  if (!row) throw new Error(`no row for ${deckName}`);
  return Object.fromEntries(
    header.map((name, index) => [name, row[index] ?? ""]),
  );
}

describe("deck standings", () => {
  it("drops createdAt so two runs of the same build render identically", () => {
    const decks = [deck("alpha"), deck("beta")];
    const early = renderStandings(
      standingsFromReport("featured", report(decks, "2020")),
    );
    const late = renderStandings(
      standingsFromReport("featured", report(decks, "2026")),
    );
    expect(late).toBe(early);
    expect(early).not.toContain("2020");
  });

  it("stamps the rules that produced the numbers on every row", () => {
    // The stamp is per row rather than in a header block, which is what lets a
    // file be read without its sibling and what makes a hand-edited row show up
    // as rows that disagree about the run that produced them.
    const stamp = rulesStamp();
    const rendered = csv([deck("a"), deck("b")]);
    for (const name of ["a", "b"]) {
      expect(cells(rendered, name)).toMatchObject({
        rulesVersion: stamp.rulesVersion,
        cardDataHash: stamp.cardDataHash,
        programHash: stamp.programHash,
      });
    }
  });

  it("records the configuration the numbers are reproducible from", () => {
    expect(cells(csv([deck("a")]), "a")).toMatchObject({
      division: "featured",
      seedsPerMatchup: "10",
      seedPrefix: "rules-benchmark",
      maxActions: "800",
      benchmarkRulesVersion: "current",
    });
    expect(parseStandings(csv([deck("a")])).fields.get("decks")).toBe("1");
  });

  it("names its own division, so a file cannot be read as the other one", () => {
    expect(cells(csv([deck("a")], "starter"), "a").division).toBe("starter");
    expect(
      compareStandings(
        csv([deck("a")], "featured"),
        csv([deck("a")], "starter"),
      ).report,
    ).toContain("division: featured -> starter");
  });

  it("ranks by win rate and breaks ties on deck id", () => {
    // Without the tiebreak, two decks on the same win rate could swap rows
    // between runs and turn a no-op regeneration into a diff.
    const standings = standingsFromReport(
      "featured",
      report([
        deck("zulu", { winRate: 0.5 }),
        deck("alpha", { winRate: 0.5 }),
        deck("mike", { winRate: 0.9 }),
      ]),
    );
    expect(standings.rows.map((row) => row.deck)).toEqual([
      "mike",
      "alpha",
      "zulu",
    ]);
  });

  it("carries the incomplete count as a tracked column, not a failure", () => {
    const standings = standingsFromReport(
      "featured",
      report([deck("a", { incomplete: 3, games: 20, wins: 9, losses: 8 })]),
    );
    expect(standings.rows[0]?.incomplete).toBe(3);
    expect(cells(renderStandings(standings), "a").incomplete).toBe("3");
  });

  it("rounds every percentage to one decimal place", () => {
    const rendered = csv([deck("a", { winRate: 0.123456 })]);
    expect(cells(rendered, "a").winRatePct).toBe("12.3");
    expect(rendered).not.toContain("12.34");
  });

  it("quotes a deck name that would otherwise add a column", () => {
    // No shipped id contains a comma, but one pasted from somebody's list is a
    // paste away from doing so, and a silently widened row is unparseable.
    const rendered = csv([deck('Luffy, Red "aggro"')]);
    expect(rendered).toContain('"Luffy, Red ""aggro"""');
    expect(parseStandings(rendered).rows.has('Luffy, Red "aggro"')).toBe(true);
  });

  it("names the moved rows in a stale diff", () => {
    const diff = standingsDiff(
      csv([deck("a", { winRate: 0.3 })]),
      csv([deck("a", { winRate: 0.6 })]),
    );
    expect(diff).toContain("-a,30.0");
    expect(diff).toContain("+a,60.0");
  });

  it("runs every division by default and one on --group", () => {
    expect(parseStandingsOptions([]).divisions).toEqual(STANDINGS_DIVISIONS);
    expect(parseStandingsOptions(["--group", "starter"]).divisions).toEqual([
      "starter",
    ]);
    expect(parseStandingsOptions(["--group=featured"]).divisions).toEqual([
      "featured",
    ]);
    expect(() => parseStandingsOptions(["--group", "precons"])).toThrow(
      "--group must be one of featured, starter",
    );
  });

  it("defaults each division to its own seed count and rejects a bad one", () => {
    // Read off the constant rather than repeated as a literal: the counts are a
    // judgement someone may revisit, and a test that hardcodes them fails for
    // the wrong reason when they do.
    expect(parseStandingsOptions([]).seeds).toBeUndefined();
    for (const division of STANDINGS_DIVISIONS)
      expect(seedsFor(division, undefined)).toBe(STANDINGS_SEEDS[division]);
    expect(seedsFor("starter", 4)).toBe(4);
    expect(parseStandingsOptions(["--seeds", "4"]).seeds).toBe(4);
    expect(parseStandingsOptions(["--seeds=4"]).seeds).toBe(4);
    expect(parseStandingsOptions(["--check"]).check).toBe(true);
    expect(() => parseStandingsOptions(["--seeds", "0"])).toThrow(
      "positive integer",
    );
  });

  it("holds each division near the games per deck the single field gave", () => {
    // What has to stay comparable across the two files is a row's precision,
    // which is games per deck, not seeds per matchup. The single 27-deck field
    // gave every deck 260 games. The ceiling is 440 because seeds come in
    // whole numbers: at fifty-six featured decks 4 seeds is 440 games a deck
    // and 3 is 330. The count stays at 4, since a seed less costs every row
    // precision and a seed more costs only run time.
    for (const division of STANDINGS_DIVISIONS) {
      const decks = divisionDecks(division).length;
      const gamesPerDeck = (decks - 1) * STANDINGS_SEEDS[division] * 2;
      expect(gamesPerDeck).toBeGreaterThanOrEqual(240);
      expect(gamesPerDeck).toBeLessThanOrEqual(440);
    }
  });

  it("splits the whole roster into divisions exactly once", () => {
    // A deck that fell outside every division would simply never be measured,
    // and nothing else in the sweep would say so.
    const roster = [...defaultBenchmarkDecks("all-vs-all")];
    const split = STANDINGS_DIVISIONS.flatMap((division) => [
      ...divisionDecks(division),
    ]);
    expect([...split].sort()).toEqual([...roster].sort());
    expect(new Set(split).size).toBe(split.length);
    for (const division of STANDINGS_DIVISIONS)
      expect(divisionDecks(division).length).toBeGreaterThan(2);
  });

  it("rejects a shard output that is not a shard, or a merge that is", () => {
    // `--shard-out` names this machine's slice. Without `--shard` it would name
    // a whole-division run's games, and merging that with real shards would
    // count every matchup twice.
    expect(
      parseStandingsOptions(["--shard", "1/8", "--shard-out", "s.json"])
        .shardOut,
    ).toBe("s.json");
    expect(parseStandingsOptions(["--merge", "shards"]).merge).toBe("shards");
    expect(() => parseStandingsOptions(["--shard-out", "s.json"])).toThrow(
      "--shard-out requires --shard",
    );
    expect(() =>
      parseStandingsOptions(["--merge", "shards", "--shard", "1/8"]),
    ).toThrow("does not run one");
  });

  it("keeps each committed file's stamp matching this build", () => {
    // The cheap half of `pnpm standings:check`: it cannot tell whether the
    // numbers are current, but a stamp mismatch is proof they are not, and it
    // costs no games to find out.
    const stamp = rulesStamp();
    for (const division of STANDINGS_DIVISIONS) {
      const committed = readFileSync(STANDINGS_PATHS[division], "utf8");
      const parsed = parseStandings(committed);
      expect(parsed.fields.get("cardDataHash")).toBe(stamp.cardDataHash);
      expect(parsed.fields.get("programHash")).toBe(stamp.programHash);
      expect(parsed.fields.get("rulesVersion")).toBe(stamp.rulesVersion);
      expect(parsed.fields.get("division")).toBe(division);
      expect(parsed.fields.get("seedsPerMatchup")).toBe(
        String(STANDINGS_SEEDS[division]),
      );
      expect(parsed.rows.size).toBe(divisionDecks(division).length);
    }
  });
});

/**
 * The gate's tolerance. A matchup is ten-odd games, so a byte gate fails on
 * movement the instrument itself calls noise; these pin where the line between
 * noise and a stale file sits, and that nothing structural crosses it.
 */
describe("standings tolerance", () => {
  const table = (
    decks: BenchmarkReport["summary"]["decks"],
    incomplete = 0,
  ): string => {
    const built = report(decks);
    return renderStandings(
      standingsFromReport("featured", {
        ...built,
        summary: { ...built.summary, incomplete },
      }),
    );
  };

  it("passes a win rate that moved less than the tolerance", () => {
    const comparison = compareStandings(
      table([deck("a", { winRate: 0.5 })]),
      table([deck("a", { winRate: 0.54 })]),
    );
    expect(comparison.stale).toBe(false);
    expect(comparison.report).toContain("win rate 50.0% -> 54.0%");
    expect(comparison.report).toContain("within tolerance");
  });

  it("fails a win rate that moved more than the tolerance", () => {
    const comparison = compareStandings(
      table([deck("a", { winRate: 0.5 })]),
      table([deck("a", { winRate: 0.58 })]),
    );
    expect(comparison.stale).toBe(true);
    expect(comparison.report).toContain("win rate 50.0% -> 58.0%");
  });

  it("honours a tolerance of zero, which is the byte gate again", () => {
    const comparison = compareStandings(
      table([deck("a", { winRate: 0.5 })]),
      table([deck("a", { winRate: 0.501 })]),
      0,
    );
    expect(comparison.stale).toBe(true);
  });

  it("reports no movement at all when the files agree", () => {
    const rendered = table([deck("a")]);
    expect(compareStandings(rendered, rendered)).toEqual({
      stale: false,
      report: "",
    });
  });

  it("tolerates a seat rate and a turn average inside the same bound", () => {
    const seat = { p1Games: 100, averageTurns: 12 };
    const inside = compareStandings(
      table([deck("a", { ...seat, p1Wins: 50 })]),
      table([deck("a", { ...seat, p1Wins: 54, averageTurns: 12.5 })]),
    );
    expect(inside.stale).toBe(false);
    const outside = compareStandings(
      table([deck("a", { ...seat, p1Wins: 50 })]),
      table([deck("a", { ...seat, p1Wins: 58, averageTurns: 20 })]),
    );
    expect(outside.stale).toBe(true);
  });

  it("reads a record as a rate, so the action cap's few games are noise", () => {
    // Three games of 280 flipping to incomplete is the case the byte gate
    // failed on and that nobody could act on.
    const comparison = compareStandings(
      table([deck("a", { wins: 140, losses: 140, incomplete: 0 })]),
      table([deck("a", { wins: 139, losses: 138, incomplete: 3 })]),
    );
    expect(comparison.stale).toBe(false);
  });

  it("is stale on a rules stamp that no longer matches", () => {
    const committed = table([deck("a")]).replace(
      rulesStamp().programHash,
      "deadbeef",
    );
    const comparison = compareStandings(committed, table([deck("a")]));
    expect(comparison.stale).toBe(true);
    expect(comparison.report).toContain("programHash");
  });

  it("is stale on rows that disagree about the run that produced them", () => {
    // What a hand-edited file looks like: the stamp is per row, so a row
    // rewritten on its own no longer matches its neighbours.
    const rendered = table([deck("a"), deck("b")]);
    const lines = rendered.split("\n");
    lines[2] = (lines[2] ?? "").replace(rulesStamp().programHash, "deadbeef");
    const comparison = compareStandings(lines.join("\n"), rendered);
    expect(comparison.stale).toBe(true);
    expect(comparison.report).toContain("programHash");
  });

  it("is stale on a deck entering or leaving the division", () => {
    const gone = compareStandings(
      table([deck("a"), deck("b")]),
      table([deck("a")]),
    );
    expect(gone.stale).toBe(true);
    expect(gone.report).toContain("no longer in the division");
    const added = compareStandings(
      table([deck("a")]),
      table([deck("a"), deck("b")]),
    );
    expect(added.stale).toBe(true);
    expect(added.report).toContain("new to the division");
  });

  it("is stale on a configuration the numbers cannot be reproduced from", () => {
    const comparison = compareStandings(
      table([deck("a")]).replace(",10,rules-benchmark,", ",4,rules-benchmark,"),
      table([deck("a")]),
    );
    expect(comparison.stale).toBe(true);
    expect(comparison.report).toContain("seedsPerMatchup");
  });

  it("reads back every column it renders", () => {
    const rendered = table([
      deck("a", {
        winRate: 0.42,
        wins: 120,
        losses: 160,
        incomplete: 2,
        averageTurns: 13.4,
      }),
    ]);
    expect(parseStandings(rendered).rows.get("a")).toMatchObject({
      deck: "a",
      winRate: 0.42,
      wins: 120,
      losses: 160,
      incomplete: 2,
      averageTurns: 13.4,
    });
  });

  it("derives the aggregates from the rows that carry them", () => {
    // A game is counted by both of its decks, so the division's game count is
    // half the rows' own total; storing it again would be a number that could
    // disagree with the rows beside it.
    const fields = parseStandings(
      table([
        deck("a", { wins: 12, losses: 6, incomplete: 2, averageTurns: 10 }),
        deck("b", { wins: 6, losses: 12, incomplete: 2, averageTurns: 14 }),
      ]),
    ).fields;
    expect(fields.get("games")).toBe("20");
    expect(fields.get("incomplete")).toBe("2");
    expect(fields.get("average turns")).toBe("12.0");
  });

  it("takes a tolerance from the command line and rejects a bad one", () => {
    expect(parseStandingsOptions([]).tolerance).toBe(STANDINGS_TOLERANCE);
    expect(parseStandingsOptions(["--tolerance", "0.1"]).tolerance).toBe(0.1);
    expect(parseStandingsOptions(["--tolerance=0"]).tolerance).toBe(0);
    expect(() => parseStandingsOptions(["--tolerance", "-1"])).toThrow(
      "non-negative",
    );
  });

  it("says somewhere a reader will find it what the gate tolerates", () => {
    // A CSV has nowhere to put prose, so whoever reads a passing check has to
    // be able to find out what it let through without reading the tool.
    const guidance = readFileSync("docs/theorycrafting.md", "utf8");
    expect(guidance).toContain("reads the numbers rather than the bytes");
    for (const division of STANDINGS_DIVISIONS)
      expect(guidance).toContain(
        STANDINGS_PATHS[division].replace("docs/", ""),
      );
  });
});

/**
 * The matrix run's safety net.
 *
 * Splitting the sweep across machines buys back most of half an hour, and the
 * way it could quietly go wrong is a shard that never arrives: a cancelled job,
 * an artifact that failed to upload. Merged without complaint, the missing
 * matchups read as decks that simply were not played, and a file would be wrong
 * in exactly the direction nobody checks. So the merge counts.
 */
describe("shard report merge", () => {
  const DECKS = ["deck-a", "deck-b"] as unknown as BenchmarkDeckId[];
  const common: StandingsRun = {
    mode: "all-vs-all",
    decks: DECKS,
    seedsPerMatchup: 1,
    seedPrefix: "rules-benchmark",
    rulesVersion: "current",
    maxActions: 800,
  };
  const pairs: [BenchmarkDeckId, BenchmarkDeckId][] = [[DECKS[0]!, DECKS[1]!]];

  function game(seed: string): BenchmarkGame {
    return {
      seed,
      p1Deck: DECKS[0]!,
      p2Deck: DECKS[1]!,
      startingPlayer: "p1",
      winnerPlayer: "p1",
      winnerDeck: DECKS[0]!,
      resultReason: "life",
      turns: 10,
      actions: 80,
      completed: true,
      stateHash: seed,
      eventHash: seed,
      cardMetrics: { p1: {}, p2: {} },
    };
  }

  function divisionReport(
    overrides: Partial<BenchmarkReport>,
  ): BenchmarkReport {
    return {
      ...report([]),
      configuration: {
        mode: "all-vs-all",
        focusDeck: null,
        decks: DECKS,
        seedsPerMatchup: 1,
        pairedSeats: true,
        seedPrefix: "rules-benchmark",
        maxActions: 800,
      },
      ...overrides,
    };
  }

  function shardDirectory(shards: Record<string, ShardReports>): string {
    const directory = mkdtempSync(join(tmpdir(), "standings-shards-"));
    for (const [name, payload] of Object.entries(shards))
      writeFileSync(join(directory, `${name}.json`), JSON.stringify(payload));
    return directory;
  }

  it("assembles a division's games from the shards that played them", async () => {
    const directory = shardDirectory({
      "0": { featured: divisionReport({ games: [game("a")] }) },
      "1": { featured: divisionReport({ games: [game("b")] }) },
    });
    const games = await readShardReports(
      directory,
      "featured",
      common,
      pairs,
      2,
    );
    expect(games.map((row) => row.seed)).toEqual(["a", "b"]);
  });

  it("refuses a shard that is missing the division being merged", async () => {
    // A shard that played only one division, merged as though it played both,
    // would leave the other division's file covering part of its round-robin.
    const directory = shardDirectory({
      "0": { featured: divisionReport({ games: [game("a")] }) },
      "1": {
        featured: divisionReport({ games: [game("b")] }),
        starter: divisionReport({ games: [game("c")] }),
      },
    });
    await expect(
      readShardReports(directory, "starter", common, pairs, 2),
    ).rejects.toThrow("no starter report");
  });

  it("refuses a merge that is short a shard", async () => {
    const directory = shardDirectory({
      "0": { featured: divisionReport({ games: [game("a")] }) },
    });
    await expect(
      readShardReports(directory, "featured", common, pairs, 2),
    ).rejects.toThrow("a shard is missing or overlaps another");
  });

  it("refuses an empty directory rather than rendering an empty file", async () => {
    const directory = shardDirectory({});
    await expect(
      readShardReports(directory, "featured", common, pairs, 2),
    ).rejects.toThrow("nothing to merge");
  });

  it("refuses to add up shards that measured different things", async () => {
    // Two machines on different seed counts are not two halves of one sweep.
    const directory = shardDirectory({
      "0": { featured: divisionReport({ games: [game("a")] }) },
      "1": {
        featured: divisionReport({
          games: [game("b")],
          configuration: {
            mode: "all-vs-all",
            focusDeck: null,
            decks: DECKS,
            seedsPerMatchup: 5,
            pairedSeats: true,
            seedPrefix: "rules-benchmark",
            maxActions: 800,
          },
        }),
      },
    });
    await expect(
      readShardReports(directory, "featured", common, pairs, 2),
    ).rejects.toThrow("5 seeds per matchup, expected 1");
  });

  it("refuses a shard that played a different deck field", async () => {
    const directory = shardDirectory({
      "0": { featured: divisionReport({ games: [game("a")] }) },
      "1": {
        featured: divisionReport({
          games: [game("b")],
          configuration: {
            mode: "all-vs-all",
            focusDeck: null,
            decks: [DECKS[0]!],
            seedsPerMatchup: 1,
            pairedSeats: true,
            seedPrefix: "rules-benchmark",
            maxActions: 800,
          },
        }),
      },
    });
    await expect(
      readShardReports(directory, "featured", common, pairs, 2),
    ).rejects.toThrow("a different deck field");
  });
});
