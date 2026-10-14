import { describe, expect, it } from "vitest";
import {
  resolveWithModules,
  type PolicyModule,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";

import { instance, scenario } from "./support/index.js";

/**
 * A ranking pass must never hide every candidate of an action type.
 *
 * One ranker cannot: it keeps whatever it scored highest. Two cannot promise it
 * between them, because each is computed independently and the hidden sets are
 * unioned -- so two rules that disagree about the same action type can hide all
 * of it, leaving the deck policy to choose between nothing for a decision the
 * engine is waiting on.
 *
 * Two search rankers is not hypothetical. `search-blocker` is registered
 * format-wide, and every deck with search knowledge ranks its own search
 * results, so the pair meets on the same `resolve-effect` at every search.
 */

const DECK = "(Red/Green) Luffy & Ace - Starter Deck 30";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

/** A search offering three cards, driven through the engine. */
function searchOptions() {
  const game = scenario()
    .decks(DECK, OPPONENT)
    .seed("ranking-safety")
    .atTurn(9, { active: "p1" })
    .bareTable()
    .withHand("p1", [instance("searcher", "OP01-016")])
    .withDeckTop("p1", [
      instance("sunny", "ST31-005"),
      instance("luffy4", "OP12-015"),
      instance("luffy5", "ST21-014"),
    ])
    .build();
  game.play({ type: "play-card", cardInstanceId: "searcher" });
  return observe(game.state, "p1");
}

const named = (action: LegalAction): string =>
  action.type === "resolve-effect" && action.option.kind === "card"
    ? action.option.card.instanceId
    : action.type;

/** Ranks `wanted` above every other search option, and says nothing else. */
function ranker(id: string, wanted: string): PolicyModule {
  return {
    id,
    rankAmong: (_context, action) => {
      if (action.type !== "resolve-effect") return undefined;
      if (action.option.kind !== "card") return undefined;
      return action.option.card.instanceId === wanted ? 1 : -1;
    },
  };
}

describe("ranking safety", () => {
  it("keeps a candidate when two rankers would hide every one of them", () => {
    const observation = searchOptions();
    // Two modules that agree on nothing: one wants `sunny` and hides the rest,
    // the other wants `luffy4` and hides the rest. Unioned, that is every
    // option the engine offered.
    const decision = resolveWithModules(observation, [
      ranker("wants-sunny", "sunny"),
      ranker("wants-luffy4", "luffy4"),
    ]);

    expect(decision.action.type).toBe("resolve-effect");
    expect(["sunny", "luffy4"]).toContain(named(decision.action));
  });

  it("still narrows to the single winner when the rankers agree", () => {
    const observation = searchOptions();
    const decision = resolveWithModules(observation, [
      ranker("wants-luffy5", "luffy5"),
      ranker("also-wants-luffy5", "luffy5"),
    ]);

    // The guard is a floor, not a widening: wherever a survivor exists the pass
    // behaves exactly as it did before.
    expect(named(decision.action)).toBe("luffy5");
  });

  it("leaves a single ranker's verdict untouched", () => {
    const observation = searchOptions();
    const decision = resolveWithModules(observation, [
      ranker("wants-sunny", "sunny"),
    ]);

    expect(named(decision.action)).toBe("sunny");
  });
});
