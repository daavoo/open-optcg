import type { DeckStrategyDossier } from "./types.js";

/**
 * The fallback for a deck with no curated dossier: printed facts and legal
 * actions only, no archetype-specific plan.
 */
export function genericDossier(deckId: string): DeckStrategyDossier {
  return {
    version: 1,
    deckId,
    archetype: "No curated strategy available",
    gamePlan: [
      "Use printed card facts and legal actions to build a coherent full-turn line.",
    ],
    mulligan: [
      "Prefer a balanced playable curve over situational or redundant cards.",
    ],
    priorities: ["Maximize board development, useful attacks, and survival."],
    commonVariants: [],
    commonCombos: [],
    keyCardNumbers: [],
    counterplay: [],
    sources: [],
  };
}
