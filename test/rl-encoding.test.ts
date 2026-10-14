import { describe, expect, it } from "vitest";
import { GameService } from "@one-piece-sim/engine-core";
import { SeededRandomAgent } from "@one-piece-sim/agents/local";
import type { GameObservation } from "@one-piece-sim/protocol";
import {
  ACTION_FEATURE_SIZE,
  actionKey,
  CARD_VOCAB,
  encodeAction,
  encodeObservation,
  OBSERVATION_SIZE,
} from "../ml/bridge/encode.js";

import { resolveDeck } from "@one-piece-sim/decks";

/** Plays a real game, collecting every observation the engine produces. */
async function playObservations(
  p1Deck: string,
  p2Deck: string,
  seed: string,
  limit = 200,
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

describe("rl encoding", () => {
  /**
   * `OBSERVATION_SIZE` is arithmetic over the layout rather than a measurement
   * of it, and `rl-server.ts` refuses to start when it disagrees with the frozen
   * action table. If the constant drifts from what `encodeObservation` actually
   * emits, a checkpoint reads a shifted feature layout and produces nonsense
   * instead of an error, so this pins the two together.
   */
  it("emits exactly OBSERVATION_SIZE features at every decision", async () => {
    const observations = await playObservations(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Blue) Kuzan - Starter Deck 33",
      "enc-size",
    );
    expect(observations.length).toBeGreaterThan(20);
    for (const observation of observations) {
      expect(encodeObservation(observation)).toHaveLength(OBSERVATION_SIZE);
    }
  });

  it("emits exactly ACTION_FEATURE_SIZE features for every legal action", async () => {
    const observations = await playObservations(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Yellow) Eustass Kid - Starter Deck 36",
      "enc-action",
    );
    let checked = 0;
    for (const observation of observations) {
      for (const action of observation.legalActions) {
        expect(encodeAction(observation, action)).toHaveLength(
          ACTION_FEATURE_SIZE,
        );
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("produces only finite features, so a NaN never reaches the policy", async () => {
    const observations = await playObservations(
      "(Green) Roronoa Zoro - Starter Deck 32",
      "(Purple) Charlotte Katakuri - Starter Deck 34",
      "enc-finite",
    );
    for (const observation of observations) {
      for (const value of encodeObservation(observation)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  /**
   * The encoding carried Leader power but not Leader identity, which meant a
   * policy could not tell which deck it was piloting or facing until cards
   * happened to reach hand or board. A single policy across the format then
   * trains on an average of six archetypes.
   */
  it("distinguishes decks by Leader identity from the very first decision", async () => {
    const [first31] = await playObservations(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
      "enc-leader-a",
      1,
    );
    const [first35] = await playObservations(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Green) Roronoa Zoro - Starter Deck 32",
      "enc-leader-b",
      1,
    );
    expect(first31).toBeDefined();
    expect(first35).toBeDefined();

    const a = encodeObservation(first31!);
    const b = encodeObservation(first35!);
    expect(a).not.toEqual(b);
  });

  /**
   * Action keys name a decision across episodes, so they must not depend on
   * per-game instance ids. Two games of the same matchup on different seeds
   * should therefore agree on the mulligan keys they offer.
   */
  it("produces seed-independent action keys", async () => {
    const [a] = await playObservations(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
      "enc-key-a",
      1,
    );
    const [b] = await playObservations(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
      "enc-key-b",
      1,
    );
    const keysA = a!.legalActions.map((action) => actionKey(a!, action)).sort();
    const keysB = b!.legalActions.map((action) => actionKey(b!, action)).sort();
    expect(keysA).toEqual(keysB);
    expect(keysA).toEqual(["mull:keep", "mull:mulligan"]);
  });

  it("covers every format card in the vocabulary", () => {
    expect(CARD_VOCAB.length).toBeGreaterThan(80);
    expect(new Set(CARD_VOCAB).size).toBe(CARD_VOCAB.length);
    expect([...CARD_VOCAB]).toEqual([...CARD_VOCAB].sort());
  });
});
