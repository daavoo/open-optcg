export interface DeckStrategyDossier {
  version: 1;
  deckId: string;
  archetype: string;
  gamePlan: readonly string[];
  mulligan: readonly string[];
  priorities: readonly string[];
  commonVariants: readonly string[];
  commonCombos: readonly string[];
  keyCardNumbers: readonly string[];
  counterplay: readonly string[];
  sources: readonly { url: string; retrievedAt: string; note: string }[];
}
