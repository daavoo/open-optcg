import { describe, expect, it } from "vitest";
import { deckManifests } from "@one-piece-sim/decks";
import {
  winRateRange,
  type AnalyticsGame,
} from "../packages/web/src/analytics.js";
import {
  emptyState,
  forgetSimulated,
  render,
  DEFAULT_RUN_GAMES,
  RUN_GAME_OPTIONS,
  type AnalyticsContext,
} from "../packages/web/src/screens/analytics.js";

const LUFFY = "(Red) Monkey.D.Luffy - Starter Deck 31";
const KID = "(Yellow) Eustass Kid - Starter Deck 36";

function stubContext(
  overrides: Partial<AnalyticsContext> = {},
): AnalyticsContext {
  return {
    setupDecks: { p1: LUFFY, p2: KID },
    savedDecks: {},
    renderCardDetailDialog: () => "",
    bindCardDetailDialog: () => {},
    rerender: () => {},
    goToSetup: () => {},
    randomSeed: () => "seed",
    scorerAvailable: () => false,
    ...overrides,
  };
}

/** A finished run: `count` games, both turn orders, the first deck winning
    every game it went first in. */
function finishedRun(count: number): AnalyticsGame[] {
  return Array.from({ length: count }, (_, index) => {
    const luffyFirst = index % 2 === 0;
    return {
      firstDeck: luffyFirst ? LUFFY : KID,
      secondDeck: luffyFirst ? KID : LUFFY,
      seed: `seed-${index}`,
      winner: "first",
      reason: "life",
      turns: 12,
      actions: 180,
      cardsUsed: { first: [], second: [] },
    };
  });
}

describe("simulate matchup screen", () => {
  it("shows the lobby's two decks and one button, with no results yet", () => {
    const html = render(emptyState(), stubContext());
    expect(html).toContain("Simulate matchup");
    expect(html).toContain(LUFFY);
    expect(html).toContain(KID);
    expect(DEFAULT_RUN_GAMES).toBe(100);
    expect(html).toMatch(/id="sim-run">.*Run 100 games<\/button>/s);
    // The three sizes, the default pressed.
    for (const games of RUN_GAME_OPTIONS) {
      expect(html).toContain(`data-run-games="${games}"`);
    }
    expect(html).toMatch(/data-run-games="100" aria-pressed="true"/);
    expect(html).toMatch(/data-run-games="500" aria-pressed="false"/);
    // The decks are the lobby's: nothing here changes them.
    expect(html).not.toContain('id="p1-deck"');
    expect(html).not.toContain("<select");
    // The deck's name alone: no Leader, number, colours or format under it.
    expect(html).not.toContain("Standard");
    expect(html).not.toContain("matchup-verdict");
  });

  it("names the picked size on the button", () => {
    const state = emptyState();
    state.runGames = 500;
    const html = render(state, stubContext());
    expect(html).toMatch(/id="sim-run">.*Run 500 games<\/button>/s);
    expect(html).toMatch(/data-run-games="500" aria-pressed="true"/);
  });

  it("shows only progress while a run is going, never a partial result", () => {
    const state = emptyState();
    state.running = true;
    state.progress = { completed: 50, total: 100 };
    // Half the games are in -- one whole turn order -- and still none is shown.
    state.pending = finishedRun(50);
    const html = render(state, stubContext());
    expect(html).toContain("50 / 100");
    expect(html).not.toContain('id="sim-run"');
    expect(html).not.toContain("matchup-verdict");
    expect(html).not.toContain("turn-order");
  });

  it("reads a finished run: the win rate, turn order and card rows", () => {
    const state = emptyState();
    state.result = { pair: `${LUFFY}|${KID}|rules`, games: finishedRun(100) };
    const html = render(state, stubContext());
    expect(html).toContain("ST31 against ST36");
    expect(html).toContain(
      "50–50 in 100 games · likely 40–60% · 12.0 turns on average",
    );
    expect(html).toContain('class="turn-order"');
    expect(html).toContain('class="impact-columns"');
    // The sections the page no longer carries.
    expect(html).not.toContain("matchup-facts");
    expect(html).not.toContain("How it ends");
    expect(html).not.toContain("field-strip");
    expect(html).not.toContain("Simulated in this browser");
    expect(html).not.toContain("Turn-order swing");
    expect(html).not.toContain("biggest win-rate split");
    // Run again is the same button.
    expect(html).toContain('id="sim-run"');
  });

  it("lists every card, with the wins of each way it was used", () => {
    const state = emptyState();
    // Luffy's ST31-001: cast in the 50 games it goes first (all won), used as
    // a Counter in 10 of those and in the 50 it goes second (all lost).
    state.result = {
      pair: `${LUFFY}|${KID}|rules`,
      games: finishedRun(100).map((game, index) => {
        const luffy = game.firstDeck === LUFFY ? "first" : "second";
        const played = luffy === "first" ? ["ST31-001"] : [];
        const countered =
          luffy === "second" || index % 5 === 0 ? ["ST31-001"] : [];
        const none = { first: [], second: [] };
        return {
          ...game,
          cardsUsed: { ...none, [luffy]: ["ST31-001"] },
          cardsPlayed: { ...none, [luffy]: played },
          cardsCountered: { ...none, [luffy]: countered },
          cardsHeld: { ...none, [luffy]: ["ST31-001", "ST31-002"] },
        };
      }),
    };
    const html = render(state, stubContext());
    expect(html).toContain(
      "played in 50, won 100% · as a Counter in 60, won 17% · both in 10",
    );
    // The card held and never used is in the full list, not only the top.
    const all = html.slice(html.indexOf('class="impact-all"'));
    expect(all).toContain("Every card <small>2 drawn or used</small>");
    expect(all).toContain('data-inspect-card="ST31-002"');
  });

  it("labels the matchup by the end of its range nearest an even game", () => {
    const chip = (luffyWins: number, games: number): string => {
      const state = emptyState();
      state.result = {
        pair: `${LUFFY}|${KID}|rules`,
        games: finishedRun(games).map((game, index) => ({
          ...game,
          winner:
            index < luffyWins === (game.firstDeck === LUFFY)
              ? "first"
              : "second",
        })),
      };
      return /class="verdict-chip">([^<]*)</.exec(
        render(state, stubContext()),
      )![1]!;
    };
    // 66% is the top band's point estimate, but its range's near end is not:
    // 59-72% over a 200-game run, and 56-75% over 100.
    expect(chip(132, 200)).toBe("Favoured");
    expect(chip(66, 100)).toBe("Slight edge");
    // 58% of 100 still reaches below an even game.
    expect(chip(58, 100)).toBe("Too close to call");
    // The same rate over four times the games has picked a side.
    expect(chip(232, 400)).toBe("Slight edge");
    expect(chip(80, 100)).toBe("Strongly favoured");
    expect(chip(20, 100)).toBe("Heavily unfavoured");
  });

  it("does not show a run of a different pairing", () => {
    const state = emptyState();
    state.result = { pair: `${LUFFY}|${KID}|rules`, games: finishedRun(100) };
    const html = render(
      state,
      stubContext({ setupDecks: { p1: KID, p2: LUFFY } }),
    );
    expect(html).not.toContain("matchup-verdict");
  });

  it("gives a win rate's 95% range, inside 0-1 even at a sweep", () => {
    const even = winRateRange(100, 200)!;
    expect(even.low).toBeCloseTo(0.431, 3);
    expect(even.high).toBeCloseTo(0.569, 3);
    const sweep = winRateRange(50, 50)!;
    expect(sweep.high).toBe(1);
    expect(sweep.low).toBeGreaterThan(0.9);
    expect(sweep.low).toBeLessThan(1);
    expect(winRateRange(0, 0)).toBeNull();
  });

  it("forgets a run once a deck it played is invalidated", () => {
    const state = emptyState();
    state.result = { pair: `${LUFFY}|${KID}|rules`, games: finishedRun(10) };
    forgetSimulated(state, (game) => game.firstDeck === "CUSTOM-9");
    expect(state.result).not.toBeNull();
    forgetSimulated(state, (game) => game.firstDeck === KID);
    expect(state.result).toBeNull();
  });

  it("surfaces a message set by an errored run", () => {
    const state = emptyState();
    state.message = "The simulation stopped unexpectedly.";
    const html = render(state, stubContext());
    expect(html).toContain("The simulation stopped unexpectedly.");
  });

  it("labels decks by their saved name, not their id", () => {
    const ctx = stubContext({
      setupDecks: { p1: "CUSTOM-1", p2: KID },
      savedDecks: {
        "CUSTOM-1": {
          name: "My Zoro deck",
          deck: deckManifests[LUFFY]!,
        },
      },
    });
    expect(render(emptyState(), ctx)).toContain("My Zoro deck");
  });

  it("plays a run with the learned model where the build has one, and says so", () => {
    const ctx = stubContext({ scorerAvailable: () => true });
    expect(render(emptyState(), ctx)).not.toContain("Heuristics");
    const state = emptyState();
    // A run the rules agents played is not the learned model's result.
    state.result = { pair: `${LUFFY}|${KID}|rules`, games: finishedRun(100) };
    expect(render(state, ctx)).not.toContain("matchup-verdict");
    state.result = { pair: `${LUFFY}|${KID}|scorer`, games: finishedRun(100) };
    expect(render(state, ctx)).toContain(
      "50–50 in 100 games, both decks played by the learned model",
    );
  });
});
