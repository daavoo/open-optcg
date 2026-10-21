import { describe, expect, it } from "vitest";
import {
  assertGameStateInvariants,
  createGame,
  dispatchMechanicInvocations,
  GameInvariantError,
  hashState,
  resolveEffect,
  seedRng,
  sha256Hex,
  walkLegalActions,
  type MechanicInvocation,
} from "@one-piece-sim/engine-core";

import { resolveDeck } from "@one-piece-sim/decks";

const formatDecks = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
  "(Blue) Kuzan - Starter Deck 33",
  "(Purple) Charlotte Katakuri - Starter Deck 34",
  "(Red/Black) Sabo - Starter Deck 35",
  "(Yellow) Eustass Kid - Starter Deck 36",
] as const;

describe("Milestone 1 core hardening", () => {
  it("preserves browser-safe SHA-256 and RNG compatibility vectors", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(seedRng("walk-seed")).toEqual({ value: 2780893740 });
  });

  it("rejects duplicate card identities and invalid DON!! conservation", () => {
    const state = createGame({
      gameId: "invalid-invariant",
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "invalid-invariant",
    });
    state.players.p1.hand.push(state.players.p1.hand[0]!);
    expect(() => {
      assertGameStateInvariants(state);
    }).toThrow(GameInvariantError);

    state.players.p1.hand.pop();
    state.players.p1.donDeck.pop();
    expect(() => {
      assertGameStateInvariants(state);
    }).toThrow(GameInvariantError);
  });

  it("replays a seeded legal-action walk deterministically", () => {
    for (const deckId of formatDecks) {
      const input = {
        gameId: `deterministic-walk-${deckId}`,
        p1: resolveDeck(deckId),
        p2: resolveDeck(deckId),
        seed: `deterministic-walk-${deckId}-game`,
      };
      const left = walkLegalActions(createGame(input), "walk-seed", 100);
      const right = walkLegalActions(createGame(input), "walk-seed", 100);

      expect(left.actions, deckId).toEqual(right.actions);
      expect(hashState(left.state), deckId).toBe(hashState(right.state));
    }
  });

  it("resumes nested reactions before later queued effects", () => {
    const state = createGame({
      gameId: "scheduler-continuations",
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "scheduler-continuations",
    });
    state.players.p1.leaderCardNumber = "OP11-041";
    state.players.p1.life.push(state.players.p1.deck.shift()!);
    const startingHandSize = state.players.p1.hand.length;
    const invocations: MechanicInvocation[] = [
      {
        context: {
          sourcePlayerId: "p1",
          source: { instanceId: "source-one", cardNumber: "FIX-001" },
        },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "select",
              selector: { player: "self", zone: "life", position: "top" },
              bind: "life",
              count: 1,
              effect: {
                kind: "move",
                binding: "life",
                to: { player: "self", zone: "hand" },
              },
            },
          },
        },
      },
      {
        context: {
          sourcePlayerId: "p1",
          source: { instanceId: "source-two", cardNumber: "FIX-002" },
        },
        program: { effect: { kind: "draw", player: "self", count: 2 } },
      },
    ];
    const dispatched = dispatchMechanicInvocations(state, invocations);
    expect(dispatched.pending).not.toBeNull();
    state.pendingEffect = {
      kind: "mechanic-choice",
      playerId: "p1",
      sourceCardNumber: "FIX-001",
      sourceInstanceId: "source-one",
      choice: dispatched.pending!,
      continuations: dispatched.continuations,
    };

    resolveEffect(state, "apply");
    // The Leader's [Once Per Turn] reaction to the Life card leaving asks
    // whether to apply it before the scheduler settles.
    expect(state.pendingEffect).toMatchObject({ sourceCardNumber: "OP11-041" });
    resolveEffect(state, "apply");

    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.hand).toHaveLength(startingHandSize + 4);
    expect(state.oncePerTurn).toContain("1:p1:OP11-041:reaction");
  });

  it("walks every format-deck unordered pairing without stalling", () => {
    for (let left = 0; left < formatDecks.length; left += 1) {
      for (let right = left; right < formatDecks.length; right += 1) {
        const p1Deck = formatDecks[left]!;
        const p2Deck = formatDecks[right]!;
        const seed = `milestone-one-${p1Deck}-${p2Deck}`;
        const result = walkLegalActions(
          createGame({
            gameId: seed,
            p1: resolveDeck(p1Deck),
            p2: resolveDeck(p2Deck),
            seed,
          }),
          `${seed}-actions`,
          100,
        );
        assertGameStateInvariants(result.state);
        expect(result.actions.length).toBeGreaterThan(0);
      }
    }
  });
});
