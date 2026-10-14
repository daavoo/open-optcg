/**
 * Plays two decks against each other over paired seats.
 *
 * `deck:benchmark` runs a focus deck against the format six; this answers the
 * narrower question of how two specific decks match up, which is what two meta
 * profiles in the same repository need.
 */
import { GameService } from "@one-piece-sim/engine-core";
import { acceptsSimulator } from "@one-piece-sim/agents/local";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import type { PlayerId } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";

const [
  left = "(Purple) Enel - Official Feature Deck",
  right = "(Blue/Yellow) Nami - Official Feature Deck",
  seedArg = "100",
] = process.argv.slice(2);
const seeds = Number(seedArg);
const wins = new Map<string, number>([
  [left, 0],
  [right, 0],
]);
let incomplete = 0;

for (let index = 0; index < seeds; index += 1) {
  for (const [p1Deck, p2Deck] of [
    [left, right],
    [right, left],
  ] as const) {
    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck(p1Deck),
      p2: resolveDeck(p2Deck),
      seed: `head-to-head-${index}`,
      startingPlayer: "random",
    });
    const agents: Record<PlayerId, ReturnType<typeof createRulesAgent>> = {
      p1: createRulesAgent(p1Deck),
      p2: createRulesAgent(p2Deck),
    };
    let actions = 0;
    while (observation.phase !== "finished" && actions < 800) {
      const seat = observation.activePlayer;
      const agent = agents[seat];
      if (acceptsSimulator(agent)) {
        agent.useSimulator(service.simulatorFor(observation.gameId, seat));
      }
      const action = await agent.chooseAction(observation);
      observation = service.act(
        observation.gameId,
        observation.revision,
        action.actionId,
      );
      actions += 1;
    }
    if (!observation.winner) {
      incomplete += 1;
      continue;
    }
    const winner = observation.winner === "p1" ? p1Deck : p2Deck;
    wins.set(winner, (wins.get(winner) ?? 0) + 1);
  }
}

const leftWins = wins.get(left) ?? 0;
const rightWins = wins.get(right) ?? 0;
const games = leftWins + rightWins;
console.log(`${left} vs ${right}: ${games} games, ${incomplete} incomplete`);
console.log(
  `  ${left}: ${leftWins} (${((100 * leftWins) / games).toFixed(1)}%)`,
);
console.log(
  `  ${right}: ${rightWins} (${((100 * rightWins) / games).toFixed(1)}%)`,
);
