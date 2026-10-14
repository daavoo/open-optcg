import type { GameObservation } from "@one-piece-sim/protocol";

type BoardCard = GameObservation["self"]["board"][number];

/**
 * Whether this body may attack Characters but not a Leader this turn.
 *
 * [Rush: Character] buys the attack on the turn the Character lands and buys
 * only the half of it aimed at Characters, so a body holding it and nothing
 * else is not an attacker on the opposing Leader -- on this turn. Next turn it
 * attacks like any other Character, which is why the test is the printed
 * restriction *and* `playedTurn`, mirroring `characterRushOnly` in
 * `legal-actions/main/attacks.ts`. Keep the two in step: this is the reading a
 * caller does against the board, and that one is the reading the engine does
 * when it decides which attacks to offer.
 *
 * A recorded game is what this exists for. An LLM seat with two identical
 * 9000-power Zoros -- one on the board since last turn, one played that turn
 * with the keyword granted -- counted both among the attacks that could reach
 * the opposing Leader, spent the one that could on a Character, and ended the
 * turn one Leader hit short of the win it had called for.
 */
export function attacksCharactersOnly(card: BoardCard, turn: number): boolean {
  return (
    card.playedTurn === turn &&
    !card.effectiveKeywords.includes("Rush") &&
    card.effectiveKeywords.includes("Rush: Character")
  );
}
