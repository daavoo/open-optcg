import { describe, expect, it } from "vitest";
import {
  impactRows,
  runSealedAnalysis,
  summarizeCardPicks,
  usageRows,
} from "../packages/cli/src/sealed-analysis.js";

describe("sealed pick-rate analysis", () => {
  it("plays seeded rules-vs-rules sealed games and records both pools' decks", async () => {
    const { games, failures } = await runSealedAnalysis({
      seeds: 3,
      seedPrefix: "sealed-analysis-test",
    });

    expect(failures).toHaveLength(0);
    expect(games).toHaveLength(3);
    for (const game of games) {
      expect(game.seed).toContain("sealed-analysis-test-");
      expect(Object.keys(game.pool.p1).length).toBeGreaterThan(0);
      expect(Object.keys(game.pool.p2).length).toBeGreaterThan(0);
      expect(Object.keys(game.deck.p1).length).toBeGreaterThan(0);
      expect(Object.keys(game.deck.p2).length).toBeGreaterThan(0);
      // Every card the auto-builder kept had to come from that seat's own pool.
      for (const cardNumber of Object.keys(game.deck.p1))
        expect(game.pool.p1[cardNumber] ?? 0).toBeGreaterThan(0);
      for (const cardNumber of Object.keys(game.deck.p2))
        expect(game.pool.p2[cardNumber] ?? 0).toBeGreaterThan(0);
    }
    // Rules-vs-rules sealed games reliably finish well inside the default action ceiling.
    expect(games.every((game) => game.completed)).toBe(true);
  });

  it("is reproducible from its seed prefix", async () => {
    const first = await runSealedAnalysis({
      seeds: 1,
      seedPrefix: "sealed-analysis-repro",
    });
    const second = await runSealedAnalysis({
      seeds: 1,
      seedPrefix: "sealed-analysis-repro",
    });
    expect(second).toEqual(first);
  });

  it("keeps going past a seed whose game throws instead of losing the whole batch", async () => {
    // "op17-pick-rates-114" is a real crash found while running this tool at
    // scale (MISSING_CARD in `currentPower`, an engine bug unrelated to this
    // analysis code). Kept as a live regression check for the runner's
    // resilience, not the engine bug itself: if the underlying bug is ever
    // fixed, `failures` here simply goes back to empty and the
    // batch-completion invariant still holds.
    const { games, failures } = await runSealedAnalysis({
      seeds: 115,
      seedPrefix: "op17-pick-rates",
    });
    expect(games.length + failures.length).toBe(115);
    for (const failure of failures) {
      expect(failure.seed).toBeTruthy();
      expect(failure.message).toBeTruthy();
    }
    // 115 seeded sealed games, because seed 114 is the one that reproduces the
    // crash above -- the batch cannot be shortened without losing the
    // regression. 30s was a unit-test budget for whole-format simulation work:
    // it measures 36s isolated on a developer machine, so it had no margin at
    // all and went red on CI under parallel load. 120s is margin, which is the
    // point -- this test gets slower every time the card pool grows.
  }, 120_000);

  it("aggregates kept-vs-cut win rates per card", async () => {
    const { games } = await runSealedAnalysis({
      seeds: 6,
      seedPrefix: "sealed-analysis-summary-test",
    });
    const summary = summarizeCardPicks(games);

    expect(summary.games).toBe(6);
    expect(summary.cards.length).toBeGreaterThan(0);
    for (const card of summary.cards) {
      expect(card.deckGames).toBeLessThanOrEqual(card.poolGames);
      expect(card.pickRate).toBeGreaterThanOrEqual(0);
      expect(card.pickRate).toBeLessThanOrEqual(1);
      expect(card.deckGamesDecided).toBeLessThanOrEqual(card.deckGames);
      expect(card.cutGamesDecided).toBeLessThanOrEqual(
        card.poolGames - card.deckGames,
      );
    }

    const impact = impactRows(summary.cards, 1);
    for (const card of impact) {
      expect(card.deckGamesDecided).toBeGreaterThanOrEqual(1);
      expect(card.cutGamesDecided).toBeGreaterThanOrEqual(1);
    }
    for (let index = 1; index < impact.length; index += 1)
      expect(impact[index - 1]!.delta).toBeGreaterThanOrEqual(
        impact[index]!.delta,
      );

    const usage = usageRows(summary.cards);
    for (let index = 1; index < usage.length; index += 1)
      expect(usage[index - 1]!.deckGamesDecided).toBeGreaterThanOrEqual(
        usage[index]!.deckGamesDecided,
      );
  });
});
