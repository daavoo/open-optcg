import { describe, expect, it } from "vitest";
import { SELECTABLE_DECK_IDS } from "@one-piece-sim/decks";
import { deckGroups } from "../packages/web/src/deck-select.js";
import {
  orderByWinRate,
  parseDeckStandings,
  type DeckStandings,
} from "../packages/web/src/deck-standings.js";

const standings = (rates: Record<string, number>): DeckStandings => ({
  model: "model-test",
  decks: Object.fromEntries(
    Object.entries(rates).map(([id, winRate]) => [id, { winRate, games: 10 }]),
  ),
});

const shelf = (key: string, ranked: DeckStandings | null): string[] =>
  deckGroups({}, SELECTABLE_DECK_IDS, [], ranked).find(
    (group) => group.key === key,
  )!.deckIds;

describe("orderByWinRate", () => {
  it("puts ranked decks first, best first, and the rest after in their order", () => {
    expect(
      orderByWinRate(
        ["a", "b", "c", "d", "e"],
        standings({ d: 0.4, b: 0.7, e: 0.55 }),
      ),
    ).toEqual(["b", "e", "d", "a", "c"]);
  });

  it("keeps ties, and everything without a file, in the order given", () => {
    expect(
      orderByWinRate(["a", "b", "c"], standings({ c: 0.5, a: 0.5 })),
    ).toEqual(["a", "c", "b"]);
    expect(orderByWinRate(["c", "a", "b"], null)).toEqual(["c", "a", "b"]);
  });
});

describe("the Community shelf by the model's standings", () => {
  const today = {
    meta: shelf("meta", null),
    official: shelf("official", null),
    starter: shelf("starter", null),
  };

  it("keeps today's order with no standings in the build", () => {
    expect(shelf("meta", standings({}))).toEqual(today.meta);
  });

  it("leads with the ranked lists by win rate, unranked lists after in today's order", () => {
    const [first, second, third, ...rest] = today.meta;
    const ranked = standings({ [third!]: 0.62, [first!]: 0.48 });
    expect(shelf("meta", ranked)).toEqual([third, first, second, ...rest]);
  });

  it("orders only the Community shelf", () => {
    // Rank every shipped deck so that each shelf, read by the standings,
    // would come out reversed.
    const reversed = standings(
      Object.fromEntries(
        Object.values(today).flatMap((deckIds) =>
          deckIds.map((id, index) => [id, (index + 1) / (deckIds.length + 1)]),
        ),
      ),
    );
    expect(shelf("official", reversed)).toEqual(today.official);
    expect(shelf("starter", reversed)).toEqual(today.starter);
    expect(shelf("meta", reversed)).toEqual([...today.meta].reverse());
  });
});

describe("parseDeckStandings", () => {
  it("reads the release asset, dropping rows it cannot sort on", () => {
    const parsed = parseDeckStandings(
      JSON.stringify({
        model: "model-v10",
        decks: {
          good: { winRate: 0.61, games: 120 },
          over: { winRate: 1.4, games: 120 },
          none: { winRate: 0.5, games: 0 },
          text: { winRate: "0.5", games: 10 },
        },
      }),
    );
    expect(parsed).toEqual({
      model: "model-v10",
      decks: { good: { winRate: 0.61, games: 120 } },
    });
  });

  it("refuses a file with no decks", () => {
    expect(() => parseDeckStandings('{"model":"x"}')).toThrow(/decks/);
  });
});
