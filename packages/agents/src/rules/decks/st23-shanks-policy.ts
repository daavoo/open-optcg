import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * ## The deck's engine, in one paragraph
 *
 * ST-23 is a Red Red-Haired Pirates curve: twelve 3-cost and fourteen 4-cost
 * Characters, a pair of 5-cost bodies, and power cuts -- the Leader's on the
 * opponent's attack, Hongo's, Yasopp's and ST23-004 Luffy's on its own turn --
 * that let a 5000 or 6000 body win the battle it starts. The game is decided
 * by having those bodies on the board on turns three to five.
 *
 * ## Sources
 *
 * None. ST-23 is a precon with no tournament record and no Bandai feature-deck
 * write-up, so every claim here is read off the fifty rather than cited, and
 * restated in `packages/agents/src/llm/dossiers/st23.ts`.
 */

/**
 * The cards a keepable hand holds: the 3- and 4-cost Characters, and
 * OP09-020, which looks five deep for one.
 */
const KEEPERS: ReadonlySet<string> = new Set([
  "OP09-010",
  "OP09-011",
  "OP09-012",
  "OP09-014",
  "OP09-015",
  "OP09-016",
  "OP09-020",
  "ST23-003",
]);

/**
 * The opening hand: a body for turns three and four, or the card that finds
 * one.
 *
 * The generic keep -- any card costing 2 or less -- keeps nearly every hand
 * here, because twelve of the fifty cost 1: ST23-004 Luffy and ST23-005
 * Yasopp are text (a power cut, a rested DON!!) on a 1000-to-2000 body, and
 * OP09-020 is a search. What the curve needs is the 3-and-4-cost slot that
 * carries the deck's attacks, or the Event that digs for it.
 */
export function createSt23ShanksMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st23-shanks-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => KEEPERS.has(card.cardNumber)),
    keepBecause:
      "Keep a hand with a 3-or-4-cost Character or OP09-020: the deck's attacks come from that slot on turns three and four.",
    mulliganBecause:
      "Mulligan a hand with no 3-or-4-cost Character and no OP09-020: its cheap cards are text, not pressure.",
  });
}
