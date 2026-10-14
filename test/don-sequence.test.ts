import { describe, expect, it } from "vitest";
import {
  acceptsSimulator,
  St31RulesAgent,
  St35RulesAgent,
} from "@one-piece-sim/agents/local";
import { GameService } from "@one-piece-sim/engine-core";
import type { PlayerId } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";

/**
 * Runs a whole game with the sequence objective on one seat.
 *
 * The unit under test is a search, so the property worth pinning is not which
 * attachment it picks in one hand-built position but that it stays inside the
 * rules and terminates: a planner that mutated live state or offered an illegal
 * action would fail here and nowhere else.
 */
async function playWithSequencing(
  seed: string,
  sequencingSeat: PlayerId,
): Promise<{ winner: PlayerId | null; actions: number }> {
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Red/Black) Sabo - Starter Deck 35"),
    seed,
  });
  const agents = {
    p1: new St31RulesAgent(
      sequencingSeat === "p1" ? { donSequence: true } : {},
    ),
    p2: new St35RulesAgent(
      sequencingSeat === "p2" ? { donSequence: true } : {},
    ),
  } as const;
  let actions = 0;
  while (observation.phase !== "finished" && actions < 800) {
    const seat = observation.activePlayer;
    const agent = agents[seat];
    if (acceptsSimulator(agent)) {
      agent.useSimulator(service.simulatorFor(observation.gameId, seat));
      agent.usePlanner(service.plannerFor(observation.gameId, seat));
    }
    const action = await agent.chooseAction(observation);
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
    actions += 1;
  }
  return { winner: observation.winner, actions };
}

describe("sequence-valued DON!! objective", () => {
  it("completes games from either seat", async () => {
    for (const seat of ["p1", "p2"] as const) {
      const result = await playWithSequencing(`sequence-${seat}`, seat);
      expect(result.winner).not.toBeNull();
      expect(result.actions).toBeLessThan(800);
    }
  });

  it("is inert without a planner", async () => {
    // No runner-supplied planner means the module must contribute nothing, so an
    // agent constructed with the option behaves exactly like one without it.
    const service = new GameService();
    const withOption = new St31RulesAgent({ donSequence: true });
    const withoutOption = new St31RulesAgent();
    let observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Red/Black) Sabo - Starter Deck 35"),
      seed: "sequence-inert",
    });
    for (
      let step = 0;
      step < 60 && observation.phase !== "finished";
      step += 1
    ) {
      if (observation.activePlayer === "p1") {
        const a = await withOption.chooseAction(observation);
        const b = await withoutOption.chooseAction(observation);
        expect(a.actionId).toBe(b.actionId);
      }
      const seat = observation.activePlayer;
      const agent = seat === "p1" ? withOption : new St35RulesAgent();
      const action = await agent.chooseAction(observation);
      observation = service.act(
        observation.gameId,
        observation.revision,
        action.actionId,
      );
    }
  });

  it("does not disturb the live game while planning", async () => {
    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Red/Black) Sabo - Starter Deck 35"),
      seed: "sequence-purity",
    });
    const agent = new St31RulesAgent({ donSequence: true });
    for (
      let step = 0;
      step < 40 && observation.phase !== "finished";
      step += 1
    ) {
      const seat = observation.activePlayer;
      if (seat === "p1") {
        agent.useSimulator(service.simulatorFor(observation.gameId, seat));
        agent.usePlanner(service.plannerFor(observation.gameId, seat));
        const before = observation.stateHash;
        await agent.chooseAction(observation);
        // Choosing must not have advanced the real game.
        expect(service.observe(observation.gameId, seat).stateHash).toBe(
          before,
        );
      }
      const actor = seat === "p1" ? agent : new St35RulesAgent();
      const action = await actor.chooseAction(observation);
      observation = service.act(
        observation.gameId,
        observation.revision,
        action.actionId,
      );
    }
  });
});
