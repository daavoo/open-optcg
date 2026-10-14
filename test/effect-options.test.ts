import { describe, expect, it } from "vitest";
import { GameService } from "@one-piece-sim/engine-core";
import { SELECTABLE_DECK_IDS, resolveDeck } from "@one-piece-sim/decks";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";

describe("typed effect-option descriptors", () => {
  // Swept over every *selectable* deck, not just the six format decks. The
  // narrower sweep left the Enel, Nami and OP16-Luffy option ids unguarded --
  // several of the shipped decks -- which is exactly where a new card is most
  // likely to introduce an id shape nothing classifies.
  it("classifies every effect option offered by every selectable deck", async () => {
    const kinds = new Map<string, number>();
    const unresolved: string[] = [];

    for (const left of SELECTABLE_DECK_IDS) {
      for (const right of SELECTABLE_DECK_IDS) {
        if (left === right) continue;
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
            kinds.set(
              action.option.kind,
              (kinds.get(action.option.kind) ?? 0) + 1,
            );
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
        // resolves on a microtask -- the rules agents are async in signature
        // only -- so the worker never reaches its timer or I/O phases, and
        // Vitest's reporter RPC times out mid-test with "Timeout calling
        // onTaskUpdate". That surfaces as an unhandled error and a non-zero
        // exit even when every assertion here passes.
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    const total = [...kinds.values()].reduce((sum, count) => sum + count, 0);
    expect(total).toBeGreaterThan(1000);
    // A descriptor that falls through to "other" means a policy is forced back
    // to parsing option-id strings, which is exactly what this replaces.
    expect([...new Set(unresolved)]).toEqual([]);
    expect(kinds.get("card") ?? 0).toBeGreaterThan(0);
    expect(kinds.get("cost") ?? 0).toBeGreaterThan(0);
    // Eleven decks is 110 ordered pairs, not the 30 this swept as a
    // format-only test, so it no longer fits the 5s default under load. It
    // measures 74s isolated on a developer machine and timed out on CI at the
    // 60s it used to declare, so the budget is the same as `sealed-analysis`
    // and for the same reason: this walks every selectable deck, and so grows
    // with the format.
    //
    // Every whole-set import both lengthens the deck list and the games
    // themselves -- a card that resolves is a card that asks questions -- so
    // this keeps tipping over its old budget between imports. 24 decks is 552
    // ordered pairs and measures ~652s isolated after EB-03, the OP-09 Robin
    // deck and OP16 Sengoku landed together, which is why the budget jumped to
    // 900s rather than the smaller bumps earlier imports needed one at a time.
    // Raised rather than narrowed: the sweep's breadth is the point, and it is
    // deliberately the widest thing the suite does.
  }, 900_000);
});
