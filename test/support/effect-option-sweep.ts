import { expect } from "vitest";
import { GameService } from "@one-piece-sim/engine-core";
import { SELECTABLE_DECK_IDS, resolveDeck } from "@one-piece-sim/decks";
import { createRulesAgent } from "../../packages/cli/src/agent-factory.js";

/**
 * How many test files the effect-option sweep is split across.
 *
 * The sweep plays every ordered pair of selectable decks -- 68 decks is 4556
 * games -- and Vitest runs a file's tests one after another on one worker,
 * however many workers sit idle. As one test it was the whole suite's wall
 * clock. Each shard is its own `effect-options-NN.test.ts`, so the workers
 * share it; `test/effect-options-shards.test.ts` checks that a file exists
 * for every shard and no pair is left out.
 */
export const EFFECT_OPTION_SHARDS = 12;

/** Every ordered pair of distinct selectable decks, in a fixed order. */
export function effectOptionPairs(): [string, string][] {
  const pairs: [string, string][] = [];
  for (const left of SELECTABLE_DECK_IDS) {
    for (const right of SELECTABLE_DECK_IDS) {
      if (left !== right) pairs.push([left, right]);
    }
  }
  return pairs;
}

/**
 * The pairs shard `index` plays: every `EFFECT_OPTION_SHARDS`-th one.
 *
 * Interleaved rather than cut into runs, so each shard gets every deck in
 * both seats and the shards finish at about the same time -- a run of pairs
 * all led by one deck is as slow as that deck's games.
 */
export function effectOptionShard(index: number): [string, string][] {
  return effectOptionPairs().filter(
    (_, position) => position % EFFECT_OPTION_SHARDS === index,
  );
}

/**
 * Plays one shard's games with the rules agents and asserts that every
 * `resolve-effect` option they were offered has a typed descriptor.
 *
 * A descriptor that falls through to "other" means a policy is forced back to
 * parsing option-id strings, which is exactly what the descriptors replace.
 */
export async function sweepEffectOptions(index: number): Promise<void> {
  const kinds = new Map<string, number>();
  const unresolved: string[] = [];

  for (const [left, right] of effectOptionShard(index)) {
    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck(left),
      p2: resolveDeck(right),
      seed: `effect-options-${left}-${right}`,
      startingPlayer: "random",
    });
    const agents = {
      p1: createRulesAgent(left),
      p2: createRulesAgent(right),
    } as const;
    let actions = 0;
    while (observation.phase !== "finished" && actions < 800) {
      for (const action of observation.legalActions) {
        if (action.type !== "resolve-effect") continue;
        kinds.set(action.option.kind, (kinds.get(action.option.kind) ?? 0) + 1);
        if (action.option.kind === "other") {
          unresolved.push(`${action.effectKind}::${action.optionId}`);
        }
      }
      const chosen =
        await agents[observation.activePlayer].chooseAction(observation);
      observation = service.act(
        observation.gameId,
        observation.revision,
        chosen.actionId,
      );
      actions += 1;
    }
    // Hand the event loop back between pairs. Every await in the loop above
    // resolves on a microtask -- the rules agents are async in signature only
    // -- so the worker never reaches its timer or I/O phases, and Vitest's
    // reporter RPC times out mid-test with "Timeout calling onTaskUpdate".
    // That surfaces as an unhandled error and a non-zero exit even when every
    // assertion here passes.
    await new Promise((resolve) => setImmediate(resolve));
  }

  const total = [...kinds.values()].reduce((sum, count) => sum + count, 0);
  expect(total).toBeGreaterThan(100);
  expect([...new Set(unresolved)]).toEqual([]);
  expect(kinds.get("card") ?? 0).toBeGreaterThan(0);
}
