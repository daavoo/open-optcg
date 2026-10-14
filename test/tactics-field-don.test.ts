import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { tactics } from "@one-piece-sim/agents/local";

import { character, scenario } from "./support/index.js";

/**
 * `Tactics.fieldDon` against `Tactics.donOnField`.
 *
 * The two answer different questions and the printed clauses ask the second:
 * "the number of DON!! cards on your field" counts DON!! given to a Leader or
 * Character, which the spendable pool does not. Rosinante's catch-up ramp was
 * gated on the wrong one for weeks because the vocabulary had only the pool.
 */
describe("Tactics counts DON!! the way the cards do", () => {
  it("includes DON!! given to the Leader and to Characters in fieldDon only", () => {
    const game = scenario()
      .decks(
        "(Purple) Enel - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("tactics-field-don")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withBoard("p1", [character("law", "ST10-010", { playedTurn: 5 })])
      .withDon("p1", { active: 3, rested: 2, leaderAttached: 1 })
      .withGivenDon("p1", "law", 2)
      .withDon("p2", { active: 5 })
      .build();

    const observation = observe(game.state, "p1");
    const t = tactics(observation);

    // `bareTable()` starts every DON!! active, so the pool is whatever the
    // setters left in it; the claim is about what each count includes.
    expect(t.donOnField).toBe(
      observation.self.activeDon + observation.self.restedDon,
    );
    expect(observation.self.leader.attachedDon).toBe(1);
    expect(t.fieldDon).toBe(t.donOnField + 1 + 2);
    expect(t.opponentFieldDon).toBe(
      observation.opponent.activeDon + observation.opponent.restedDon,
    );
  });
});
