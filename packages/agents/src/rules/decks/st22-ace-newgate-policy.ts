import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * ## The deck's engine, in one paragraph
 *
 * ST-22's currency is the "Whitebeard Pirates" type, and every main-deck card
 * in the fifty carries it, so the type is never the constraint. What the deck
 * spends it on is information: five cards reveal the top of the deck for a
 * payout on a hit, four more ask for on-type cards shown from hand, which
 * costs nothing, and the Leader trades a card in hand for the top card and
 * puts the shown one back where the next reveal will find it.
 *
 * ## Sources
 *
 * None. ST-22 is a precon with no tournament record and no Bandai feature-deck
 * write-up, so every claim here is read off the fifty rather than cited, and
 * restated in `packages/agents/src/llm/dossiers/st22.ts`.
 */

/**
 * The cards a keepable hand holds: the four 2-to-4-cost Characters, and
 * ST22-002 Izo, which looks five deep for one.
 */
const KEEPERS: ReadonlySet<string> = new Set([
  "ST22-002",
  "ST22-004",
  "ST22-008",
  "ST22-012",
  "ST22-014",
]);

/**
 * The opening hand: a body for turns two to four, or the card that finds one.
 *
 * The generic keep -- any card costing 2 or less -- keeps nearly every hand
 * here, because eighteen of the fifty cost 2 or less. Most of those cannot
 * pressure anything when they land: ST22-007 Squard, ST22-009 Vista and
 * ST22-011 Whitey Bay are 0-to-2000-power bodies whose value is their text, and
 * ST22-016 is a [Counter] Event. What the deck needs on curve is a Character
 * that can attack a 5000 Leader with the turn's DON!! behind it -- ST22-008 at
 * 2, ST22-004 at 3, ST22-012 and ST22-014 at 4 -- or Izo, which digs five deep
 * for one.
 */
export function createSt22AceNewgateMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st22-ace-newgate-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => KEEPERS.has(card.cardNumber)),
    keepBecause:
      "Keep a hand with a 2-to-4-cost body or ST22-002 Izo: the deck's curve needs something that can attack on turns two to four.",
    mulliganBecause:
      "Mulligan a hand with no 2-to-4-cost body and no Izo: its cheap cards are text, not pressure.",
  });
}
