import { describe, expect, it } from "vitest";
import {
  GameService,
  applyAction,
  createGame,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { cardRegistry } from "@one-piece-sim/cards";
import { SeededRandomAgent } from "@one-piece-sim/agents/local";
import { resolveDeck } from "@one-piece-sim/decks";
import type { GameObservation } from "@one-piece-sim/protocol";
import {
  CARD_PAD,
  CARD_TABLE_SIZE,
  CARD_UNKNOWN,
  cardRow,
  cardTableFingerprint,
  missingCardIndexEntries,
} from "../ml/bridge/card-table.js";
import {
  ACTION_FEATURE_SIZE,
  CARD_FEATURE_SIZE,
  GLOBAL_SIZE,
  MAX_PRIVILEGED_TOKENS,
  MAX_TOKENS,
  TOKEN_WIRE_SIZE,
  cardFeatureTable,
  encodeActionPointer,
  encodeGlobal,
  encodePrivilegedTokens,
  encodeTokens,
  tokenWire,
} from "../ml/bridge/tokens.js";

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST33 = "(Blue) Kuzan - Starter Deck 33";

/** Plays a real game, collecting every observation the engine produces. */
async function playObservations(
  p1Deck: string,
  p2Deck: string,
  seed: string,
  limit = 250,
): Promise<GameObservation[]> {
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed,
    startingPlayer: "random",
  });
  const agents = {
    p1: new SeededRandomAgent(`${seed}-p1`),
    p2: new SeededRandomAgent(`${seed}-p2`),
  };
  const seen: GameObservation[] = [];
  let steps = 0;
  while (observation.phase !== "finished" && steps < limit) {
    seen.push(observation);
    const action =
      await agents[observation.activePlayer].chooseAction(observation);
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
    steps += 1;
  }
  return seen;
}

/** Plays `steps` random actions on a raw state, for the privileged encoding. */
async function playState(seed: string, steps: number): Promise<GameState> {
  let state = createGame({
    gameId: `tokens-${seed}`,
    p1: resolveDeck(ST31),
    p2: resolveDeck(ST33),
    seed,
    startingPlayer: "random",
  });
  const agents = {
    p1: new SeededRandomAgent(`${seed}-p1`),
    p2: new SeededRandomAgent(`${seed}-p2`),
  };
  for (let index = 0; index < steps && state.phase !== "finished"; index += 1) {
    const observation = observe(state, state.activePlayer);
    const action = await agents[state.activePlayer].chooseAction(observation);
    const legal = getLegalActions(state, state.activePlayer).find(
      (candidate) => candidate.actionId === action.actionId,
    )!;
    state = applyAction(state, { ...legal, revision: state.revision }).state;
  }
  return state;
}

describe("card table", () => {
  it("has a row for every registered card", () => {
    expect(missingCardIndexEntries()).toEqual([]);
    expect(CARD_TABLE_SIZE).toBe(cardRegistry.size + 2);
  });

  it("reserves the pad and unknown rows", () => {
    expect(CARD_PAD).toBe(0);
    expect(CARD_UNKNOWN).toBe(1);
    for (const cardNumber of cardRegistry.keys()) {
      expect(cardRow(cardNumber)).toBeGreaterThanOrEqual(2);
    }
    expect(cardRow("NOT-A-CARD")).toBe(CARD_UNKNOWN);
  });

  it("fingerprints the table by content and order", () => {
    expect(cardTableFingerprint()).toMatch(/^fnv1a:[0-9a-f]{8}:\d+$/);
    const table = cardFeatureTable();
    expect(table).toHaveLength(CARD_TABLE_SIZE);
    for (const row of table) {
      expect(row).toHaveLength(CARD_FEATURE_SIZE);
      for (const value of row) expect(Number.isFinite(value)).toBe(true);
    }
    // The reserved rows carry no facts.
    expect(table[CARD_PAD]!.every((value) => value === 0)).toBe(true);
    expect(table[CARD_UNKNOWN]!.every((value) => value === 0)).toBe(true);
  });
});

describe("token encoding", () => {
  it("emits fixed-width rows within the caps at every decision", async () => {
    const observations = await playObservations(ST31, ST33, "tokens-width");
    expect(observations.length).toBeGreaterThan(50);
    for (const observation of observations) {
      const { tokens, refs } = encodeTokens(observation);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.length).toBeLessThanOrEqual(MAX_TOKENS);
      for (const token of tokens) {
        const row = tokenWire(token);
        expect(row).toHaveLength(TOKEN_WIRE_SIZE);
        for (const value of row) expect(Number.isFinite(value)).toBe(true);
        expect(token.card).toBeGreaterThanOrEqual(CARD_UNKNOWN);
        expect(token.card).toBeLessThan(CARD_TABLE_SIZE);
      }
      for (const index of refs.values()) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(tokens.length);
      }
      expect(encodeGlobal(observation)).toHaveLength(GLOBAL_SIZE);
      for (const action of observation.legalActions) {
        const pointer = encodeActionPointer(observation, action, tokens, refs);
        expect(pointer.features).toHaveLength(ACTION_FEATURE_SIZE);
        for (const ref of pointer.refs) {
          expect(ref).toBeGreaterThanOrEqual(-1);
          expect(ref).toBeLessThan(tokens.length);
        }
        expect(pointer.card).toBeLessThan(CARD_TABLE_SIZE);
      }
    }
  });

  it("points attacks and plays at the tokens they touch", async () => {
    const observations = await playObservations(ST31, ST33, "tokens-refs");
    let attacks = 0;
    let plays = 0;
    for (const observation of observations) {
      const { tokens, refs } = encodeTokens(observation);
      for (const action of observation.legalActions) {
        const pointer = encodeActionPointer(observation, action, tokens, refs);
        if (action.type === "attack") {
          attacks += 1;
          const [attacker, target] = pointer.refs;
          expect(tokens[attacker]?.owner).toBe("self");
          expect(tokens[target]?.owner).toBe("opponent");
        }
        if (action.type === "play-card") {
          plays += 1;
          const [hand] = pointer.refs;
          expect(tokens[hand]?.zone).toBe("hand");
          expect(tokens[hand]?.owner).toBe("self");
          expect(pointer.card).toBe(tokens[hand]!.card);
        }
      }
    }
    expect(attacks).toBeGreaterThan(0);
    expect(plays).toBeGreaterThan(0);
  });

  it("names the opponent's hand and face-down Life without identifying them", async () => {
    const observations = await playObservations(ST31, ST33, "tokens-hidden");
    const sample = observations.find(
      (observation) =>
        observation.opponent.handCount > 0 &&
        observation.opponent.lifeCount > 0,
    )!;
    const { tokens } = encodeTokens(sample);
    const opponentHand = tokens.filter(
      (token) => token.zone === "hand" && token.owner === "opponent",
    );
    expect(opponentHand).toHaveLength(Math.min(sample.opponent.handCount, 12));
    for (const token of opponentHand) expect(token.card).toBe(CARD_UNKNOWN);
    for (const token of tokens.filter((token) => token.zone === "life")) {
      if (token.state[8] === 0) expect(token.card).toBe(CARD_UNKNOWN);
    }
  });

  /**
   * The actor's encoding is a function of the viewer's projection and nothing
   * else. Rearranging the cards the viewer cannot see -- the opponent's hand,
   * their deck order, the face-down Life on both sides -- must leave every
   * public token, every global scalar and every action pointer untouched,
   * while the critic's privileged tokens do move. This is the guarantee that
   * makes an asymmetric critic safe: the actor could not learn from the hidden
   * zones even if it wanted to, because nothing of them reaches it.
   */
  it("does not move when the hidden zones do; the privileged tokens do", async () => {
    const state = await playState("tokens-leak", 40);
    const viewer = state.activePlayer;
    const opponent = viewer === "p1" ? "p2" : "p1";
    const shuffled: GameState = structuredClone(state);
    const hidden = shuffled.players[opponent];
    hidden.hand.reverse();
    hidden.deck.reverse();
    // Swap the top hidden Life card of each side with the bottom of its deck.
    for (const seat of ["p1", "p2"] as const) {
      const player = shuffled.players[seat];
      const faceDown = player.life.findIndex((card) => !card.faceUp);
      if (faceDown < 0 || player.deck.length === 0) continue;
      const life = player.life[faceDown]!;
      const bottom = player.deck[player.deck.length - 1]!;
      player.life[faceDown] = { ...bottom, faceUp: false };
      player.deck[player.deck.length - 1] = {
        instanceId: life.instanceId,
        cardNumber: life.cardNumber,
      };
    }
    expect(hidden.hand.length).toBeGreaterThan(1);

    const before = observe(state, viewer);
    const after = observe(shuffled, viewer);
    const encodedBefore = encodeTokens(before);
    const encodedAfter = encodeTokens(after);
    expect(encodedAfter.tokens.map(tokenWire)).toEqual(
      encodedBefore.tokens.map(tokenWire),
    );
    expect(encodeGlobal(after)).toEqual(encodeGlobal(before));
    expect(
      after.legalActions.map((action) =>
        encodeActionPointer(
          after,
          action,
          encodedAfter.tokens,
          encodedAfter.refs,
        ),
      ),
    ).toEqual(
      before.legalActions.map((action) =>
        encodeActionPointer(
          before,
          action,
          encodedBefore.tokens,
          encodedBefore.refs,
        ),
      ),
    );

    const privilegedBefore = encodePrivilegedTokens(state, viewer).map(
      tokenWire,
    );
    const privilegedAfter = encodePrivilegedTokens(shuffled, viewer).map(
      tokenWire,
    );
    expect(privilegedBefore.length).toBeLessThanOrEqual(MAX_PRIVILEGED_TOKENS);
    expect(privilegedAfter).not.toEqual(privilegedBefore);
  });

  it("reveals the opponent's hand to the critic with identities", async () => {
    const state = await playState("tokens-privileged", 30);
    const viewer = state.activePlayer;
    const opponent = viewer === "p1" ? "p2" : "p1";
    const tokens = encodePrivilegedTokens(state, viewer);
    const hand = tokens.filter(
      (token) => token.zone === "hand" && token.owner === "opponent",
    );
    expect(hand.map((token) => token.card)).toEqual(
      state.players[opponent].hand
        .slice(-12)
        .map((card) => cardRow(card.cardNumber)),
    );
    for (const token of tokens) expect(token.card).not.toBe(CARD_UNKNOWN);
  });
});
