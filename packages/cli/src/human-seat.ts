/**
 * The human seat: what a person is shown, and how they pick a move.
 *
 * Kept apart from the match loop in `setup-match.ts`, which only has to hand
 * it an observation.
 *
 * Takes an observation and returns one of its own legal actions, or null for
 * "I am done". It knows nothing about where either came from.
 */
import type { createInterface } from "node:readline/promises";
import type {
  GameObservation,
  LegalAction,
  PlayerId,
} from "@one-piece-sim/protocol";

export type Prompt = ReturnType<typeof createInterface>;

export function formatBoard(
  board:
    GameObservation["self"]["board"] | GameObservation["opponent"]["board"],
): string[] {
  return board.length === 0
    ? ["    (empty)"]
    : board.map(
        (card) =>
          `    ${card.name} [${card.cardNumber}] cost ${card.cost}, ${card.currentPower} power, ${card.rested ? "rested" : "active"}, DON!! x${card.attachedDon}`,
      );
}

export function printHumanObservation(
  observation: GameObservation,
  labels: Record<PlayerId, string>,
): void {
  const opponentId: PlayerId = observation.viewer === "p1" ? "p2" : "p1";
  console.log(`\nTurn ${observation.turn} | ${observation.phase}`);
  console.log(
    `${labels[observation.viewer]}: Life ${observation.self.lifeCount} | Hand ${observation.self.hand.length} | Deck ${observation.self.deckCount} | Active DON!! ${observation.self.activeDon}`,
  );
  console.log(
    `  Leader: ${observation.self.leader.name} [${observation.self.leader.cardNumber}] ${observation.self.leader.currentPower} power, ${observation.self.leader.rested ? "rested" : "active"}, DON!! x${observation.self.leader.attachedDon}`,
  );
  console.log("  Board:");
  for (const line of formatBoard(observation.self.board)) console.log(line);
  console.log(
    `${labels[opponentId]}: Life ${observation.opponent.lifeCount} | Hand ${observation.opponent.handCount} | Deck ${observation.opponent.deckCount} | Active DON!! ${observation.opponent.activeDon}`,
  );
  console.log(
    `  Leader: ${observation.opponent.leader.name} [${observation.opponent.leader.cardNumber}] ${observation.opponent.leader.currentPower} power, ${observation.opponent.leader.rested ? "rested" : "active"}, DON!! x${observation.opponent.leader.attachedDon}`,
  );
  console.log("  Board:");
  for (const line of formatBoard(observation.opponent.board)) console.log(line);
  console.log("Hand:");
  for (const card of observation.self.hand) {
    // The price the engine will charge, with the printed one in brackets when
    // the two differ -- a discount a card grants itself is otherwise invisible
    // until the play the terminal says you cannot afford turns out to be legal.
    const cost =
      card.currentCost === card.cost
        ? `${card.cost}`
        : `${card.currentCost} (printed ${card.cost})`;
    console.log(
      `  ${card.name} [${card.cardNumber}] cost ${cost}, counter ${card.counter}`,
    );
  }
  if (observation.activeBattle) {
    console.log(
      `Battle: ${observation.activeBattle.attackPower} attack vs ${observation.activeBattle.targetPower + observation.activeBattle.counterPower} defense`,
    );
  }
}

export async function chooseHumanAction(
  observation: GameObservation,
  prompt: Prompt,
  labels: Record<PlayerId, string>,
): Promise<LegalAction | null> {
  printHumanObservation(observation, labels);
  console.log("Legal actions:");
  observation.legalActions.forEach((action, index) => {
    console.log(`  ${index + 1}. ${action.summary}`);
  });
  for (;;) {
    const answer = (
      await prompt.question("Choose an action (or q to quit): ")
    ).trim();
    if (answer.toLowerCase() === "q") return null;
    const selected = observation.legalActions.at(Number(answer) - 1);
    if (selected !== undefined) return selected;
    console.log(`Enter a number from 1 to ${observation.legalActions.length}.`);
  }
}
