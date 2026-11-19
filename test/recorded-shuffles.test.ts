/**
 * Recorded shuffles: a game dealt somewhere else is dealt the same way here.
 * `createGame` is given the order each shuffle left the cards in, and deals
 * that order in place of the seed's.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  type GameState,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";
import type { RecordedShuffles } from "@one-piece-sim/protocol";
import { BrowserGameController } from "../packages/web/src/controller.js";

const P1_DECK = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2_DECK = "(Green) Roronoa Zoro - Starter Deck 32";

function game(recordedShuffles?: RecordedShuffles): GameState {
  return createGame({
    gameId: "recorded",
    p1: resolveDeck(P1_DECK),
    p2: resolveDeck(P2_DECK),
    seed: "recorded-shuffles",
    startingPlayer: "p1",
    ...(recordedShuffles ? { recordedShuffles } : {}),
  });
}

function decide(state: GameState, decision: "keep" | "mulligan"): GameState {
  const action = getLegalActions(state, state.activePlayer).find(
    (offered) =>
      offered.type === "mulligan-decision" && offered.decision === decision,
  )!;
  return applyAction(state, { ...action, revision: state.revision }).state;
}

const numbers = (cards: readonly { cardNumber: string }[]): string[] =>
  cards.map((card) => card.cardNumber);

/** A deck's cards in an order no seed was asked for: the list, reversed. */
const reversed = (deckId: string): string[] =>
  [...resolveDeck(deckId).cards].reverse();

describe("recorded shuffles", () => {
  it("deals the opening hand and deck in the recorded order", () => {
    const order = reversed(P1_DECK);
    const state = game({ p1: [order], p2: [] });
    expect(numbers(state.players.p1.hand)).toEqual(order.slice(0, 5));
    expect(numbers(state.players.p1.deck)).toEqual(order.slice(5));
  });

  it("leaves a player with no recorded order on the seed's deal", () => {
    const seeded = game();
    const state = game({ p1: [reversed(P1_DECK)], p2: [] });
    expect(numbers(state.players.p2.hand)).toEqual(
      numbers(seeded.players.p2.hand),
    );
    expect(numbers(state.players.p2.deck)).toEqual(
      numbers(seeded.players.p2.deck),
    );
  });

  it("deals a mulligan in its recorded order, and Life from it", () => {
    const opening = reversed(P1_DECK);
    const mulligan = resolveDeck(P1_DECK).cards;
    let state = game({ p1: [opening, mulligan], p2: [] });
    state = decide(state, "mulligan");
    expect(numbers(state.players.p1.hand)).toEqual(mulligan.slice(0, 5));
    state = decide(state, "keep");
    // Life is dealt off the top one card at a time, so the deck's top card is
    // the bottom of Life.
    expect(numbers(state.players.p1.life)).toEqual(
      mulligan.slice(5, 10).reverse(),
    );
    expect(numbers(state.players.p1.deck)).toEqual(mulligan.slice(10));
  });

  it("records how every shuffle came out, recorded order or not", () => {
    let state = game({ p1: [], p2: [] });
    const dealt = state.recordedShuffles!.dealt;
    expect(dealt.p1).toEqual([
      [...state.players.p1.hand, ...state.players.p1.deck].map(
        (card) => card.instanceId,
      ),
    ]);
    state = decide(state, "mulligan");
    expect(state.recordedShuffles!.dealt.p1).toHaveLength(2);
    expect(state.recordedShuffles!.dealt.p1[1]).toEqual(
      [...state.players.p1.hand, ...state.players.p1.deck].map(
        (card) => card.instanceId,
      ),
    );
  });

  it("keeps the seed's other shuffles where they were", () => {
    // P2's mulligan draws on the RNG after P1's shuffles. Recording P1's must
    // not move it.
    const seeded = decide(
      decide(game({ p1: [], p2: [] }), "mulligan"),
      "mulligan",
    );
    const recorded = decide(
      decide(
        game({ p1: [reversed(P1_DECK), reversed(P1_DECK)], p2: [] }),
        "mulligan",
      ),
      "mulligan",
    );
    expect(numbers(recorded.players.p2.hand)).toEqual(
      numbers(seeded.players.p2.hand),
    );
  });

  it("refuses an order that is not the cards being shuffled", () => {
    const order = reversed(P1_DECK);
    order[0] = resolveDeck(P2_DECK).cards[0]!;
    expect(() => game({ p1: [order], p2: [] })).toThrow(
      /RECORDED_SHUFFLE_MISMATCH/,
    );
  });

  it("deals a seeded game as it always has", () => {
    const state = game();
    expect(state.recordedShuffles).toBeUndefined();
    expect("recordedShuffles" in state).toBe(false);
  });

  it("is dealt again by a match loaded from its config", () => {
    const order = reversed(P1_DECK);
    const controller = new BrowserGameController({
      p1Deck: P1_DECK,
      p2Deck: P2_DECK,
      p1Controller: "human",
      p2Controller: "human",
      seed: "recorded-shuffles",
      startingPlayer: "p1",
      recordedShuffles: { p1: [order], p2: [] },
    });
    const hand = controller.observe("p1").self.hand;
    expect(hand.map((card) => card.cardNumber)).toEqual(order.slice(0, 5));
  });
});
