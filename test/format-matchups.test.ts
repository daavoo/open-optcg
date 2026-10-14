import { describe, expect, it } from "vitest";
import { GameService } from "@one-piece-sim/engine-core";
import {
  St31RulesAgent,
  St32RulesAgent,
  St33RulesAgent,
  St34RulesAgent,
  St35RulesAgent,
  St36RulesAgent,
  type Agent,
} from "@one-piece-sim/agents/local";

import { resolveDeck } from "@one-piece-sim/decks";

const deckIds = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
  "(Blue) Kuzan - Starter Deck 33",
  "(Purple) Charlotte Katakuri - Starter Deck 34",
  "(Red/Black) Sabo - Starter Deck 35",
  "(Yellow) Eustass Kid - Starter Deck 36",
] as const;
type DeckId = (typeof deckIds)[number];

function createAgent(deckId: DeckId): Agent {
  if (deckId === "(Red) Monkey.D.Luffy - Starter Deck 31")
    return new St31RulesAgent();
  if (deckId === "(Green) Roronoa Zoro - Starter Deck 32")
    return new St32RulesAgent();
  if (deckId === "(Blue) Kuzan - Starter Deck 33") return new St33RulesAgent();
  if (deckId === "(Purple) Charlotte Katakuri - Starter Deck 34")
    return new St34RulesAgent();
  if (deckId === "(Red/Black) Sabo - Starter Deck 35")
    return new St35RulesAgent();
  return new St36RulesAgent();
}

async function play(p1Deck: DeckId, p2Deck: DeckId, seed: string) {
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed,
  });
  const agents = { p1: createAgent(p1Deck), p2: createAgent(p2Deck) };
  let actionCount = 0;
  while (observation.phase !== "finished" && actionCount < 500) {
    const action =
      await agents[observation.activePlayer].chooseAction(observation);
    expect(
      observation.legalActions.some(
        (legalAction) => legalAction.actionId === action.actionId,
      ),
      `${seed}: agent selected an illegal action`,
    ).toBe(true);
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
    actionCount += 1;
  }
  expect(observation.phase, seed).toBe("finished");
  expect(observation.winner, seed).not.toBeNull();
  expect(actionCount, seed).toBeLessThan(500);
}

describe("format six-deck matchup matrix", () => {
  it("completes every pairing in both seat assignments", async () => {
    for (let leftIndex = 0; leftIndex < deckIds.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex;
        rightIndex < deckIds.length;
        rightIndex += 1
      ) {
        const left = deckIds[leftIndex]!;
        const right = deckIds[rightIndex]!;
        await play(left, right, `format-${left}-${right}-a`);
        await play(right, left, `format-${left}-${right}-b`);
      }
    }
    // 42 full games. Vitest's 5s default is a unit-test budget, and this ran
    // inside it on a developer machine and outside it on a two-core CI runner,
    // which is a red main rather than a real failure. Same allowance as the
    // other whole-format simulations here (effect-options, sealed-analysis).
  }, 60_000);
});
