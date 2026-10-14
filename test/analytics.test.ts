import { describe, expect, it } from "vitest";
import type { Agent } from "@one-piece-sim/agents/local";
import {
  ANALYTICS_DECK_IDS,
  buildMatrix,
  deckSummaries,
  firstPlayerWinRate,
  headToHead,
  isAnalyticsReport,
  matchupPairs,
  matchupRecord,
  matchupSeed,
  mergeCardImpact,
  MIN_CARD_HELD_GAMES,
  mergeReports,
  playAnalyticsGame,
  reportGames,
  summarizeGames,
  sweepPairs,
  stuckRows,
  useWhenHeld,
  usageRows,
  winRateBand,
  type AnalyticsGame,
  type CardImpact,
} from "../packages/web/src/analytics.js";
import baseline from "../packages/web/src/analytics-baseline.json" with { type: "json" };

function game(
  firstDeck: string,
  secondDeck: string,
  winner: AnalyticsGame["winner"],
  overrides: Partial<AnalyticsGame> = {},
): AnalyticsGame {
  return {
    firstDeck,
    secondDeck,
    seed: `${firstDeck}-${secondDeck}`,
    winner,
    reason: winner === null ? null : "life",
    turns: 10,
    actions: 100,
    cardsUsed: { first: [], second: [] },
    ...overrides,
  };
}

describe("analytics matrix", () => {
  it("covers every ordered pair of decks, mirrors included", () => {
    const pairs = matchupPairs(ANALYTICS_DECK_IDS);
    expect(pairs).toHaveLength(ANALYTICS_DECK_IDS.length ** 2);
    expect(pairs).toContainEqual([
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    ]);
    expect(pairs).toContainEqual([
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
    ]);
    expect(pairs).toContainEqual([
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    ]);
    expect(new Set(pairs.map((pair) => pair.join("|"))).size).toBe(
      pairs.length,
    );
    expect(
      matchupSeed(
        "analytics",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
        2,
      ),
    ).toBe(
      "analytics-(Red) Monkey.D.Luffy - Starter Deck 31-(Yellow) Eustass Kid - Starter Deck 36-2",
    );
  });

  it("sweeps a new deck against both seats of every deck, plus its mirror", () => {
    const pairs = sweepPairs("CUSTOM", [
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
    ]);
    expect(pairs).toEqual([
      ["CUSTOM", "(Red) Monkey.D.Luffy - Starter Deck 31"],
      ["(Red) Monkey.D.Luffy - Starter Deck 31", "CUSTOM"],
      ["CUSTOM", "(Yellow) Eustass Kid - Starter Deck 36"],
      ["(Yellow) Eustass Kid - Starter Deck 36", "CUSTOM"],
      ["CUSTOM", "CUSTOM"],
    ]);
    // A deck already in the matrix is not played against itself twice.
    expect(
      sweepPairs("(Red) Monkey.D.Luffy - Starter Deck 31", [
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
      ]),
    ).toEqual([
      [
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
      ],
      [
        "(Yellow) Eustass Kid - Starter Deck 36",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      ],
      [
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      ],
    ]);
  });

  it("keeps the two turn orders apart", () => {
    const report = summarizeGames(
      [
        game(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Yellow) Eustass Kid - Starter Deck 36",
          "first",
        ),
        game(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Yellow) Eustass Kid - Starter Deck 36",
          "first",
        ),
        game(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Yellow) Eustass Kid - Starter Deck 36",
          "second",
        ),
        game(
          "(Yellow) Eustass Kid - Starter Deck 36",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "second",
        ),
      ],
      {
        decks: [
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Yellow) Eustass Kid - Starter Deck 36",
        ],
      },
    );

    expect(
      matchupRecord(
        report,
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
      ),
    ).toMatchObject({
      games: 3,
      firstWins: 2,
      secondWins: 1,
      firstWinRate: 0.6667,
      unfinished: 0,
    });
    expect(
      matchupRecord(
        report,
        "(Yellow) Eustass Kid - Starter Deck 36",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      ),
    ).toMatchObject({
      games: 1,
      firstWins: 0,
      secondWins: 1,
    });

    const matrix = buildMatrix(report, [
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
    ]);
    expect(matrix[0]![1]!.firstWinRate).toBe(0.6667);
    expect(matrix[1]![0]!.firstWinRate).toBe(0);
    expect(matrix[0]![0]!.firstWinRate).toBeNull();
    expect(reportGames(report)).toBe(4);
  });

  it("leaves undecided games out of every rate but not the game count", () => {
    const report = summarizeGames([
      game(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
        "first",
      ),
      game(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
        null,
        { reason: null },
      ),
    ]);
    expect(
      matchupRecord(
        report,
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
      ),
    ).toMatchObject({
      games: 2,
      unfinished: 1,
      firstWinRate: 1,
    });
    expect(
      deckSummaries(report, ["(Red) Monkey.D.Luffy - Starter Deck 31"])[0],
    ).toMatchObject({
      games: 1,
      wins: 1,
      winRate: 1,
    });
  });

  it("summarizes a deck across both seats and excludes its mirror", () => {
    const report = summarizeGames([
      game(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
        "first",
      ),
      game(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
        "second",
      ),
      game(
        "(Green) Roronoa Zoro - Starter Deck 32",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "second",
      ),
      game(
        "(Yellow) Eustass Kid - Starter Deck 36",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "first",
      ),
      game(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "first",
      ),
    ]);
    expect(
      deckSummaries(report, ["(Red) Monkey.D.Luffy - Starter Deck 31"])[0],
    ).toMatchObject({
      deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      games: 4,
      wins: 2,
      winRate: 0.5,
      firstGames: 2,
      firstWins: 1,
      firstWinRate: 0.5,
      secondGames: 2,
      secondWins: 1,
      secondWinRate: 0.5,
    });
    // The mirror is excluded from the standings but counts for turn order.
    expect(firstPlayerWinRate(report)).toBe(0.6);
    expect(firstPlayerWinRate(summarizeGames([]))).toBeNull();
  });

  it("bands win rates symmetrically around an even matchup", () => {
    expect(winRateBand(null)).toBe("empty");
    expect(winRateBand(0.2)).toBe("cold-3");
    expect(winRateBand(0.4)).toBe("cold-2");
    expect(winRateBand(0.49)).toBe("cold-1");
    expect(winRateBand(0.5)).toBe("warm-1");
    expect(winRateBand(0.6)).toBe("warm-2");
    expect(winRateBand(0.8)).toBe("warm-3");
  });

  it("lays a sweep over the baseline as extra rows and columns", () => {
    const base = summarizeGames(
      [
        game(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Yellow) Eustass Kid - Starter Deck 36",
          "first",
        ),
        game(
          "(Yellow) Eustass Kid - Starter Deck 36",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "first",
        ),
      ],
      {
        decks: [
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Yellow) Eustass Kid - Starter Deck 36",
        ],
      },
    );
    const sweep = summarizeGames(
      [
        game("CUSTOM", "(Red) Monkey.D.Luffy - Starter Deck 31", "first"),
        game("(Red) Monkey.D.Luffy - Starter Deck 31", "CUSTOM", "second"),
        // Re-measuring a pair the baseline already has replaces it.
        game(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Yellow) Eustass Kid - Starter Deck 36",
          "second",
        ),
      ],
      { decks: ["CUSTOM"] },
    );
    const merged = mergeReports(base, sweep);

    expect(merged.decks).toEqual([
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
      "CUSTOM",
    ]);
    expect(
      matchupRecord(merged, "CUSTOM", "(Red) Monkey.D.Luffy - Starter Deck 31")
        .firstWins,
    ).toBe(1);
    expect(
      matchupRecord(
        merged,
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
      ).firstWinRate,
    ).toBe(0);
    expect(
      merged.matchups.filter(
        (record) =>
          record.firstDeck === "(Red) Monkey.D.Luffy - Starter Deck 31" &&
          record.secondDeck === "(Yellow) Eustass Kid - Starter Deck 36",
      ),
    ).toHaveLength(1);
    expect(
      matchupRecord(merged, "(Yellow) Eustass Kid - Starter Deck 36", "CUSTOM")
        .games,
    ).toBe(0);
  });
});

describe("head to head", () => {
  // ST31 takes three of four on the play and two of four on the draw, so the
  // combined rate sits between two seats that do not read alike.
  const report = summarizeGames([
    game(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
      "first",
      { turns: 8 },
    ),
    game(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
      "first",
      { turns: 8 },
    ),
    game(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
      "first",
      { turns: 8 },
    ),
    game(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
      "second",
      { turns: 8, reason: "deck-exhaustion" },
    ),
    game(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "first",
      { turns: 12 },
    ),
    game(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "first",
      { turns: 12 },
    ),
    game(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "second",
      { turns: 12 },
    ),
    game(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "second",
      { turns: 12 },
    ),
  ]);

  it("counts the reverse record's losses as this deck's wins", () => {
    const head = headToHead(
      report,
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
    );
    expect(head).toMatchObject({
      mirror: false,
      games: 8,
      selfWins: 5,
      opponentWins: 3,
      winRate: 0.625,
      onPlay: 0.75,
      onDraw: 0.5,
      turnOrderSwing: 0.25,
      decidedByLife: 7,
      decidedByDeckOut: 1,
    });
    // Averages of the two orders re-weighted by how many games each held.
    expect(head.averageTurns).toBe(10);
    // The same games read from the other seat: every rate is the complement.
    expect(
      headToHead(
        report,
        "(Yellow) Eustass Kid - Starter Deck 36",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      ),
    ).toMatchObject({
      selfWins: 3,
      winRate: 0.375,
      onPlay: 0.5,
      onDraw: 0.25,
      turnOrderSwing: 0.25,
    });
  });

  it("collapses a mirror to what taking the first turn is worth", () => {
    const mirror = summarizeGames([
      game(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "first",
      ),
      game(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "first",
      ),
      game(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "second",
      ),
      game(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "second",
      ),
    ]);
    expect(
      headToHead(
        mirror,
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      ),
    ).toMatchObject({
      mirror: true,
      games: 4,
      winRate: 0.5,
      onPlay: 0.5,
      onDraw: 0.5,
      turnOrderSwing: 0,
    });
  });

  it("reads a pairing with no games as null rather than even", () => {
    const head = headToHead(
      summarizeGames([]),
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
    );
    expect(head).toMatchObject({
      games: 0,
      winRate: null,
      onPlay: null,
      onDraw: null,
      turnOrderSwing: null,
    });
    expect(head.cards.self).toEqual([]);
  });

  it("pools each side's card impact over both turn orders", () => {
    const used = (
      firstDeck: string,
      secondDeck: string,
      winner: AnalyticsGame["winner"],
      seat: "first" | "second",
    ) =>
      game(firstDeck, secondDeck, winner, {
        cardsUsed: { first: [], second: [], [seat]: ["ST31-001"] },
      });
    const pooled = headToHead(
      summarizeGames([
        // ST31 plays the card and wins in both seats; sits it out and loses.
        used(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Yellow) Eustass Kid - Starter Deck 36",
          "first",
          "first",
        ),
        game(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Yellow) Eustass Kid - Starter Deck 36",
          "second",
        ),
        used(
          "(Yellow) Eustass Kid - Starter Deck 36",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "second",
          "second",
        ),
        game(
          "(Yellow) Eustass Kid - Starter Deck 36",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "first",
        ),
      ]),
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
    );
    expect(pooled.cards.self).toEqual([
      {
        cardNumber: "ST31-001",
        gamesUsed: 2,
        winsUsed: 2,
        winRateUsed: 1,
        gamesUnused: 2,
        winsUnused: 0,
        winRateUnused: 0,
        delta: 1,
      },
    ]);
    expect(pooled.cards.opponent).toEqual([]);
  });

  it("pools counts before it recomputes rates, not the rates themselves", () => {
    const impact = (
      gamesUsed: number,
      winsUsed: number,
      gamesUnused: number,
      winsUnused: number,
    ) => ({
      cardNumber: "ST31-001",
      gamesUsed,
      winsUsed,
      winRateUsed: winsUsed / gamesUsed,
      gamesUnused,
      winsUnused,
      winRateUnused: winsUnused / gamesUnused,
      delta: 0,
    });
    // 1/1 and 1/9 is 2/10, not the 0.55 an average of the two rates would give.
    expect(mergeCardImpact([impact(1, 1, 2, 0)], [impact(9, 1, 2, 2)])).toEqual(
      [
        {
          cardNumber: "ST31-001",
          gamesUsed: 10,
          winsUsed: 2,
          winRateUsed: 0.2,
          gamesUnused: 4,
          winsUnused: 2,
          winRateUnused: 0.5,
          delta: -0.3,
        },
      ],
    );
  });
});

describe("card impact", () => {
  const withCard = (
    winner: AnalyticsGame["winner"],
    cards: string[],
    overrides: Partial<AnalyticsGame> = {},
  ) =>
    game(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
      winner,
      { cardsUsed: { first: cards, second: [] }, ...overrides },
    );
  const games = [
    withCard("first", ["ST31-001"]),
    withCard("first", ["ST31-001"]),
    withCard("first", ["ST31-001"]),
    withCard("second", ["ST31-002"]),
    withCard("second", ["ST31-002"]),
    withCard("second", ["ST31-002"]),
  ];
  const record = matchupRecord(
    summarizeGames(games),
    "(Red) Monkey.D.Luffy - Starter Deck 31",
    "(Yellow) Eustass Kid - Starter Deck 36",
  );

  it("splits a seat's win rate by whether the card was used", () => {
    expect(
      record.cards.first.find((card) => card.cardNumber === "ST31-001"),
    ).toMatchObject({
      gamesUsed: 3,
      winsUsed: 3,
      winRateUsed: 1,
      gamesUnused: 3,
      winsUnused: 0,
      winRateUnused: 0,
      delta: 1,
    });
    expect(record.cards.second).toEqual([]);
  });

  it("ranks cards by usage, so a staple with no comparison group still shows", () => {
    const staples = matchupRecord(
      summarizeGames(
        games.map((entry) => ({
          ...entry,
          cardsUsed: {
            first: ["ST31-004", ...entry.cardsUsed.first],
            second: [],
          },
        })),
      ),
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Yellow) Eustass Kid - Starter Deck 36",
    );
    expect(usageRows(staples.cards.first)[0]).toMatchObject({
      cardNumber: "ST31-004",
      gamesUsed: 6,
      gamesUnused: 0,
    });
  });

  describe("held in hand", () => {
    const tracked = (
      winner: AnalyticsGame["winner"],
      held: string[],
      used: string[],
      countered: string[] = [],
    ) =>
      withCard(winner, used, {
        cardsHeld: { first: held, second: [] },
        cardsPlayed: {
          first: used.filter((card) => !countered.includes(card)),
          second: [],
        },
        cardsCountered: { first: countered, second: [] },
      });

    it("lists a card that was drawn and never used", () => {
      const cards = matchupRecord(
        summarizeGames([
          tracked(
            "first",
            ["ST31-001", "ST31-002"],
            ["ST31-001"],
            ["ST31-001"],
          ),
          tracked("second", ["ST31-001", "ST31-002"], []),
        ]),
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
      ).cards.first;
      expect(
        cards.find((card) => card.cardNumber === "ST31-002"),
      ).toMatchObject({
        gamesUsed: 0,
        gamesHeld: 2,
        gamesUsedWhenHeld: 0,
      });
      expect(
        cards.find((card) => card.cardNumber === "ST31-001"),
      ).toMatchObject({
        gamesUsed: 1,
        gamesPlayed: 0,
        winsPlayed: 0,
        gamesCountered: 1,
        winsCountered: 1,
        gamesHeld: 2,
        gamesUsedWhenHeld: 1,
      });
    });

    it("leaves the held counts out when any game predates them", () => {
      const cards = matchupRecord(
        summarizeGames([
          tracked("first", ["ST31-001"], ["ST31-001"]),
          withCard("second", ["ST31-001"]),
        ]),
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Yellow) Eustass Kid - Starter Deck 36",
      ).cards.first;
      expect(cards[0]!.gamesHeld).toBeUndefined();
      expect(useWhenHeld(cards[0]!)).toBeNull();
      expect(stuckRows(cards)).toEqual([]);
    });

    it("pools held counts only when both sides tracked them", () => {
      const row = (gamesHeld?: number): CardImpact => ({
        cardNumber: "ST31-001",
        gamesUsed: 1,
        winsUsed: 1,
        winRateUsed: 1,
        gamesUnused: 1,
        winsUnused: 0,
        winRateUnused: 0,
        delta: 1,
        ...(gamesHeld === undefined
          ? {}
          : {
              gamesHeld,
              gamesUsedWhenHeld: 1,
              gamesPlayed: 1,
              gamesCountered: 0,
            }),
      });
      expect(mergeCardImpact([row(2)], [row(3)])[0]).toMatchObject({
        gamesHeld: 5,
        gamesUsedWhenHeld: 2,
        gamesPlayed: 2,
      });
      expect(mergeCardImpact([row(2)], [row()])[0]!.gamesHeld).toBeUndefined();
    });

    it("ranks the stuck cards by how rarely they were used when held", () => {
      const row = (
        cardNumber: string,
        gamesHeld: number,
        gamesUsedWhenHeld: number,
      ): CardImpact => ({
        cardNumber,
        gamesUsed: gamesUsedWhenHeld,
        winsUsed: 0,
        winRateUsed: 0,
        gamesUnused: 0,
        winsUnused: 0,
        winRateUnused: 0,
        delta: 0,
        gamesHeld,
        gamesUsedWhenHeld,
        gamesCountered: 0,
      });
      const cards = [
        row("busy", 40, 36),
        row("idle", 40, 4),
        row("dead", 30, 0),
        row("rare", MIN_CARD_HELD_GAMES - 1, 0),
      ];
      // "busy" was used in 90% of the games it was held: not stuck at all.
      expect(stuckRows(cards).map((card) => card.cardNumber)).toEqual([
        "dead",
        "idle",
      ]);
    });
  });

  it("records how the games ended alongside the pace", () => {
    expect(record).toMatchObject({
      averageTurns: 10,
      averageActions: 100,
      decidedByLife: 6,
      decidedByDeckOut: 0,
    });
  });
});

describe("analytics games", () => {
  it("plays a deterministic game with the row deck on the play", async () => {
    const matchup = {
      firstDeck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      secondDeck: "(Yellow) Eustass Kid - Starter Deck 36",
      seed: "analytics-test-0",
    };
    const first = await playAnalyticsGame(matchup);
    const repeat = await playAnalyticsGame(matchup);

    expect(first.winner).not.toBeNull();
    expect(first.reason).not.toBeNull();
    expect(first).toEqual(repeat);
    expect(first.cardsUsed.first.length).toBeGreaterThan(0);
  });

  it("records the cards each seat held, and which uses were Counters", async () => {
    const played = await playAnalyticsGame({
      firstDeck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      secondDeck: "(Yellow) Eustass Kid - Starter Deck 36",
      seed: "analytics-test-0",
    });
    for (const seat of ["first", "second"] as const) {
      expect(played.cardsHeld![seat].length).toBeGreaterThan(0);
      // A Counter comes out of the hand at the defender's own decision.
      for (const card of played.cardsCountered![seat]) {
        expect(played.cardsUsed[seat]).toContain(card);
        expect(played.cardsHeld![seat]).toContain(card);
      }
      // Every use is a play or a Counter, and both are uses.
      expect(
        [
          ...new Set([
            ...played.cardsPlayed![seat],
            ...played.cardsCountered![seat],
          ]),
        ].sort(),
      ).toEqual(played.cardsUsed[seat]);
    }
  });

  it("sweeps a deck the deck registry has never heard of", async () => {
    const swept = await playAnalyticsGame({
      firstDeck: "CUSTOM",
      secondDeck: "(Yellow) Eustass Kid - Starter Deck 36",
      seed: "sweep-test-0",
      customDecks: {
        CUSTOM: {
          id: "CUSTOM",
          leader: "ST21-001",
          cards: {
            "ST31-005": 4,
            "ST31-004": 4,
            "ST31-001": 4,
            "ST31-002": 4,
            "ST31-003": 4,
            "OP01-016": 4,
            "OP11-003": 4,
            "OP11-009": 4,
            "OP11-012": 4,
            "OP14-015": 4,
            "ST23-004": 2,
            "P-101": 4,
            "OP04-016": 4,
          },
        },
      },
    });

    expect(swept.firstDeck).toBe("CUSTOM");
    expect(swept.winner).not.toBeNull();
  });

  it("lets the agent a deck is given play it, and the rules agent the other", async () => {
    const asked: number[] = [];
    const counting: Agent = {
      chooseAction(observation) {
        asked.push(observation.turn);
        expect(observation.activePlayer).toBe("p1");
        return Promise.resolve(observation.legalActions[0]!);
      },
    };
    const game = await playAnalyticsGame({
      firstDeck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      secondDeck: "(Yellow) Eustass Kid - Starter Deck 36",
      seed: "analytics-agents",
      maxActions: 40,
      agents: { first: counting },
    });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.length).toBeLessThan(game.actions);
  });

  it("stops at the action ceiling instead of running forever", async () => {
    const stalled = await playAnalyticsGame({
      firstDeck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      secondDeck: "(Yellow) Eustass Kid - Starter Deck 36",
      seed: "analytics-cap",
      maxActions: 4,
    });
    expect(stalled.actions).toBe(4);
    expect(stalled.winner).toBeNull();
    expect(stalled.reason).toBeNull();
  });
});

describe("precomputed baseline", () => {
  it("covers the format at the documented sample size", () => {
    expect(isAnalyticsReport(baseline)).toBe(true);
    const report = baseline as unknown as Parameters<typeof reportGames>[0];
    expect(report.decks).toEqual([...ANALYTICS_DECK_IDS]);
    expect(report.matchups).toHaveLength(ANALYTICS_DECK_IDS.length ** 2);
    expect(reportGames(report)).toBe(
      report.seedsPerMatchup * ANALYTICS_DECK_IDS.length ** 2,
    );
    for (const record of report.matchups) {
      expect(record.games).toBe(report.seedsPerMatchup);
      expect(record.unfinished).toBe(0);
      expect(record.firstWins + record.secondWins).toBe(record.games);
    }
  });
});
