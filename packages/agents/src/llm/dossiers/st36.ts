import type { DeckStrategyDossier } from "./types.js";

export const st36Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Eustass Kid - Starter Deck 36",
  archetype: "Black control with cost manipulation and removal",
  gamePlan: [
    "Develop value bodies while making opposing characters valid removal targets.",
    "Sequence cost reduction before KO effects and reserve DON!! for the complete line.",
    "Stabilize the board before turning durable characters into Life pressure.",
  ],
  mulligan: [
    "Prefer a playable early curve containing both development and interaction.",
    "Avoid hands whose removal cannot reach a target without missing cost-reduction pieces.",
  ],
  priorities: [
    "Remove engines and threatening attackers before low-impact rested searchers.",
    "Account for face-up and face-down Life effects before committing an attack sequence.",
    "Do not use a cost reducer without a concrete payoff in the current or next planned line.",
  ],
  commonVariants: [],
  commonCombos: [],
  keyCardNumbers: [],
  counterplay: [
    "Prioritize the largest Rush attacker in searches and put it on the board before starting the attack sequence: it lands damage in the turn it arrives, and a high-cost body sits outside cost-gated removal until the cost reducers have been spent on it.",
    "Spend the smallest non-finisher attack first to consume the Blocker or Kid's Life redirection, then send the finishers into a defense that has already answered once.",
    "Check for a face-up Life card before committing a finisher; it is the resource Kid's redirection reads, so the same attack is safe with the Life stack face-down and redirected with it face-up.",
  ],
  sources: [],
};
