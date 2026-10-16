import {
  FirstLegalAgent,
  RegistryRulesAgent,
  SeededRandomAgent,
  type Agent,
} from "@one-piece-sim/agents/local";
import { requireSupportedDeck, type FormatDeckId } from "@one-piece-sim/decks";

export type { FormatDeckId };
export type ControllerKind = "human" | "rules" | "first" | "random";

/**
 * The rules agent for a deck, resolved through its Leader.
 *
 * This used to be an if-ladder over the six format deck ids, which meant adding
 * a deck to a trial meant editing this function, the benchmark's deck-id union,
 * and the agent class list. Going through the manifest's Leader instead means a
 * deck that has a registered policy is playable the moment its manifest exists,
 * and a deck that has none still runs on `chooseGenericRules` rather than
 * failing.
 */
export function createRulesAgent(deckId: string): Agent {
  return new RegistryRulesAgent(requireSupportedDeck(deckId).leader);
}

export function createAgent(
  kind: Exclude<ControllerKind, "human">,
  deckId: FormatDeckId,
  seed: string,
): Agent {
  switch (kind) {
    case "rules":
      return createRulesAgent(deckId);
    case "first":
      return new FirstLegalAgent();
    case "random":
      return new SeededRandomAgent(seed);
  }
}
