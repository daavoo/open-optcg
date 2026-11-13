import { describe, expect, it } from "vitest";
import {
  validateSealedDeck,
  autoBuildSealedDeckGrape,
} from "@one-piece-sim/decks";
import { openSealedPool } from "../packages/web/src/sealed-mode.js";
import {
  createSwissEvent,
  eventComplete,
  losses,
  pendingAiTables,
  recordResult,
  standings,
  wins,
  yourTable,
  BYE,
  SWISS_BOTS,
  SWISS_MAX_BOTS,
  YOU,
  type SwissEvent,
} from "../packages/web/src/swiss.js";
import {
  emptyState,
  finishRound,
  playingEventRound,
  renderEvent,
  type SealedContext,
} from "../packages/web/src/screens/sealed.js";

function newEvent(seed = "swiss-test"): SwissEvent {
  const { pool } = openSealedPool(`${seed}:you`, "OP18");
  return createSwissEvent(seed, pool, autoBuildSealedDeckGrape(pool).cards);
}

/** Plays every open table of the current round, the lower seat winning. */
function playRound(event: SwissEvent): void {
  for (const table of [...event.rounds.at(-1)!])
    if (table.winner === null)
      recordResult(event, table, Math.min(table.a, table.b));
}

describe("a sealed Swiss event", () => {
  it("seats four AI players with legal 40-card decks from their own pools", () => {
    const event = newEvent();
    expect(event.players).toHaveLength(SWISS_BOTS + 1);
    expect(new Set(event.players.map((player) => player.deck.id)).size).toBe(
      SWISS_BOTS + 1,
    );
    for (const player of event.players.slice(1)) {
      const total = Object.values(player.deck.cards).reduce((a, b) => a + b, 0);
      expect(total).toBe(40);
    }
    // Five players: two tables and a bye, never the person's.
    const round = event.rounds[0]!;
    expect(round.filter((table) => table.b !== BYE)).toHaveLength(2);
    const bye = round.find((table) => table.b === BYE)!;
    expect(bye.a).not.toBe(YOU);
    expect(bye.winner).toBe(bye.a);
    expect(pendingAiTables(event)).toHaveLength(1);
  });

  it.each([
    [1, 1],
    [4, 3],
    [8, 4],
  ])(
    "against %i AI players runs %i rounds: the person plays each, no rematch, a bye at most once each",
    (bots, rounds) => {
      const { pool } = openSealedPool("bots:you", "OP18");
      const event = createSwissEvent(
        "bots",
        pool,
        autoBuildSealedDeckGrape(pool).cards,
        bots,
      );
      expect(event.players).toHaveLength(bots + 1);
      expect(event.roundCount).toBe(rounds);
      for (let round = 0; round < rounds; round += 1) {
        expect(eventComplete(event)).toBe(false);
        expect(yourTable(event).b).not.toBe(BYE);
        playRound(event);
      }
      expect(event.rounds).toHaveLength(rounds);
      expect(eventComplete(event)).toBe(true);
      const tables = event.rounds.flat();
      const meetings = tables
        .filter((table) => table.b !== BYE)
        .map((table) => [table.a, table.b].sort().join("-"));
      expect(new Set(meetings).size).toBe(meetings.length);
      const byes = tables
        .filter((table) => table.b === BYE)
        .map((table) => table.a);
      expect(new Set(byes).size).toBe(byes.length);
      expect(byes).toHaveLength(bots % 2 === 1 ? 0 : rounds);
      // Seat 0 wins every match under the lower-seat rule.
      expect(standings(event)[0]).toBe(YOU);
      expect(wins(event, YOU)).toBe(rounds);
    },
  );

  it("refuses a field outside 1 to the most it seats", () => {
    const { pool } = openSealedPool("bots:you", "OP18");
    const deck = autoBuildSealedDeckGrape(pool).cards;
    expect(() => createSwissEvent("bots", pool, deck, 0)).toThrow();
    expect(() =>
      createSwissEvent("bots", pool, deck, SWISS_MAX_BOTS + 1),
    ).toThrow();
  });

  it("counts a game with no winner as a loss for both seats", () => {
    const event = newEvent();
    const table = pendingAiTables(event)[0]!;
    recordResult(event, table, -1);
    expect(losses(event, table.a)).toBe(1);
    expect(losses(event, table.b)).toBe(1);
    expect(wins(event, table.a) + wins(event, table.b)).toBe(0);
  });
});

describe("the Swiss event screen", () => {
  function context(played: string[]): SealedContext {
    return {
      renderCardDetailDialog: () => "",
      bindCardDetailDialog: () => {},
      renderImportDialog: () => "",
      bindImportDialog: () => {},
      openImportDialog: () => {},
      applyTheme: () => {},
      beginMatch: () => {},
      randomSeed: () => "screen-test",
      scorerAvailable: () => false,
      rerender: () => {},
      goHome: () => {},
      playTables: (tables, seedPrefix) => {
        played.push(seedPrefix);
        return Promise.resolve(tables.map(() => "second" as const));
      },
    };
  }

  it("records the person's match and pairs the next round once every table is in", async () => {
    const played: string[] = [];
    const ctx = context(played);
    const state = emptyState();
    const event = newEvent("screen-test");
    state.event = event;
    for (const table of pendingAiTables(event))
      recordResult(event, table, table.a);
    state.playingTable = yourTable(event);
    expect(playingEventRound(state)).toBe(true);
    finishRound(state, ctx, "p1");
    expect(playingEventRound(state)).toBe(false);
    expect(wins(event, YOU)).toBe(1);
    expect(event.rounds).toHaveLength(2);
    // Round two's AI tables go to the worker as soon as it is paired.
    expect(played).toEqual(["screen-test:round-2"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pendingAiTables(event)).toHaveLength(0);
    const html = renderEvent(state);
    expect(html).toContain("Round 2 of 3");
    expect(html).toContain('id="swiss-play"');
  });

  it("concedes a round's match left before it ends", () => {
    const state = emptyState();
    const event = newEvent("concede-test");
    state.event = event;
    state.playingTable = yourTable(event);
    finishRound(state, context([]), null);
    expect(losses(event, YOU)).toBe(1);
  });

  it("ends on the final standings after three rounds", () => {
    const state = emptyState();
    const event = newEvent("final-test");
    for (let round = 0; round < event.roundCount; round += 1) playRound(event);
    state.event = event;
    const html = renderEvent(state);
    // The person is seat 0, so the lower-seat-wins rule makes them 3-0.
    expect(html).toContain("You finished 1st of 5, 3&ndash;0");
    expect(html).toContain('id="swiss-new"');
  });

  it("keeps the AI players' decks inside their own pools", () => {
    const event = newEvent();
    for (const [index, player] of event.players.slice(1).entries()) {
      const { pool } = openSealedPool(`swiss-test:seat-${index + 1}`, "OP18");
      expect(
        validateSealedDeck({ cards: player.deck.cards }, pool).errors,
      ).toEqual([]);
    }
  });
});
