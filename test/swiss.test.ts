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
  SWISS_PLAYERS,
  SWISS_ROUNDS,
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
  it("seats seven AI players with legal 40-card decks from their own pools", () => {
    const event = newEvent();
    expect(event.players).toHaveLength(SWISS_PLAYERS);
    expect(new Set(event.players.map((player) => player.deck.id)).size).toBe(
      SWISS_PLAYERS,
    );
    for (const player of event.players.slice(1)) {
      const total = Object.values(player.deck.cards).reduce((a, b) => a + b, 0);
      expect(total).toBe(40);
    }
    const round = event.rounds[0]!;
    expect(round).toHaveLength(SWISS_PLAYERS / 2);
    expect(new Set(round.flatMap((table) => [table.a, table.b])).size).toBe(
      SWISS_PLAYERS,
    );
    expect(pendingAiTables(event)).toHaveLength(SWISS_PLAYERS / 2 - 1);
  });

  it("pairs three rounds with no rematch and leaves exactly one player 3-0", () => {
    const event = newEvent();
    for (let round = 0; round < SWISS_ROUNDS; round += 1) playRound(event);
    expect(event.rounds).toHaveLength(SWISS_ROUNDS);
    expect(eventComplete(event)).toBe(true);
    const meetings = event.rounds
      .flat()
      .map((table) => [table.a, table.b].sort().join("-"));
    expect(new Set(meetings).size).toBe(meetings.length);
    // Every round after the first pairs equal records.
    for (const [index, round] of event.rounds.entries()) {
      if (index === 0) continue;
      const before = { ...event, rounds: event.rounds.slice(0, index) };
      for (const table of round)
        expect(wins(before, table.a)).toBe(wins(before, table.b));
    }
    const undefeated = event.players
      .map((_, seat) => seat)
      .filter((seat) => wins(event, seat) === SWISS_ROUNDS);
    expect(undefeated).toHaveLength(1);
    expect(standings(event)[0]).toBe(undefeated[0]);
  });

  it.each([1, 5])(
    "runs a %i-round event to its end with no rematch",
    (count) => {
      const { pool } = openSealedPool("rounds:you", "OP18");
      const event = createSwissEvent(
        "rounds",
        pool,
        autoBuildSealedDeckGrape(pool).cards,
        count,
      );
      for (let round = 0; round < count; round += 1) {
        expect(eventComplete(event)).toBe(false);
        playRound(event);
      }
      expect(event.rounds).toHaveLength(count);
      expect(eventComplete(event)).toBe(true);
      const meetings = event.rounds
        .flat()
        .map((table) => [table.a, table.b].sort().join("-"));
      expect(new Set(meetings).size).toBe(meetings.length);
    },
  );

  it("refuses a round count eight players cannot fill", () => {
    const { pool } = openSealedPool("rounds:you", "OP18");
    const deck = autoBuildSealedDeckGrape(pool).cards;
    expect(() => createSwissEvent("rounds", pool, deck, 0)).toThrow();
    expect(() => createSwissEvent("rounds", pool, deck, 8)).toThrow();
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
    for (let round = 0; round < SWISS_ROUNDS; round += 1) playRound(event);
    state.event = event;
    const html = renderEvent(state);
    // The person is seat 0, so the lower-seat-wins rule makes them 3-0.
    expect(html).toContain("You finished 1st of 8, 3&ndash;0");
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
