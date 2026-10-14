/**
 * Plays one match and prints the decision-by-decision trace for review.
 *
 * `pnpm deck:benchmark` answers "who wins"; this answers "why", which is what a
 * new deck needs before its win rate means anything. A 100% matchup is far more
 * likely to be an implementation flaw than a real matchup, and the only way to
 * tell is to read what actually happened.
 *
 * Usage:
 *   pnpm trace:match --p1 OP16-NAMI-6738 --p2 ST32 --seed s-0
 *   pnpm trace:match --p1 OP16-NAMI-6738 --p2 ST32 --seed s-0 --events-only
 */
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import { GameService } from "@one-piece-sim/engine-core";
import { acceptsSimulator } from "@one-piece-sim/agents/local";

import { resolveDeck } from "@one-piece-sim/decks";

const flags = new Map<string, string>();
for (let index = 0; index < process.argv.length; index += 1) {
  const argument = process.argv[index]!;
  if (!argument.startsWith("--")) continue;
  const [key, inline] = argument.slice(2).split("=", 2);
  if (!key) continue;
  const next = process.argv[index + 1];
  if (inline !== undefined) flags.set(key, inline);
  else if (next && !next.startsWith("--")) flags.set(key, next);
  else flags.set(key, "true");
}

const p1Deck = flags.get("p1") ?? "(Blue/Yellow) Nami - Official Feature Deck";
const p2Deck = flags.get("p2") ?? "(Green) Roronoa Zoro - Starter Deck 32";
const seed = flags.get("seed") ?? "trace-0";
const eventsOnly = flags.has("events-only");
const maxActions = Number(flags.get("max-actions") ?? "800");

const service = new GameService();
let observation = service.create({
  p1: resolveDeck(p1Deck),
  p2: resolveDeck(p2Deck),
  seed,
  startingPlayer: "random",
});
const agents = {
  p1: createRulesAgent(p1Deck),
  p2: createRulesAgent(p2Deck),
} as const;
const label = { p1: p1Deck, p2: p2Deck } as const;

console.log(`${p1Deck} (p1) vs ${p2Deck} (p2), seed ${seed}`);
console.log(`starting player: ${observation.activePlayer}\n`);

let actions = 0;
let turn = -1;
let seen = 0;
const counts = new Map<string, number>();

while (observation.phase !== "finished" && actions < maxActions) {
  const seat = observation.activePlayer;
  const agent = agents[seat];
  if (acceptsSimulator(agent)) {
    agent.useSimulator(service.simulatorFor(observation.gameId, seat));
    agent.usePlanner?.(service.plannerFor(observation.gameId, seat));
  }
  if (observation.turn !== turn) {
    turn = observation.turn;
    console.log(
      `--- turn ${turn} (${label[observation.activePlayer]}) | life ${observation.self.lifeCount}-${observation.opponent.lifeCount} ---`,
    );
  }
  const action = await agent.chooseAction(observation);
  const decision = (
    agent as { lastDecision?: { reasons: string[]; moduleId?: string } }
  ).lastDecision;
  if (!eventsOnly) {
    console.log(
      `  ${label[seat]} ${action.type.padEnd(22)} ${action.summary}` +
        (decision?.moduleId ? `   [${decision.moduleId}]` : ""),
    );
  }
  observation = service.act(
    observation.gameId,
    observation.revision,
    action.actionId,
  );
  for (const event of observation.publicEvents.slice(seen)) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    if (
      eventsOnly ||
      [
        "character-ko",
        "damage-taken",
        "game-ended",
        "event-activated",
      ].includes(event.type)
    ) {
      console.log(`      * ${JSON.stringify(event)}`);
    }
  }
  seen = observation.publicEvents.length;
  actions += 1;
}

console.log(
  `\nresult: ${observation.winner ? `${label[observation.winner]} wins` : "incomplete"} by ${observation.resultReason ?? "n/a"} on turn ${observation.turn} after ${actions} actions`,
);
console.log("event counts:", Object.fromEntries([...counts].sort()));
