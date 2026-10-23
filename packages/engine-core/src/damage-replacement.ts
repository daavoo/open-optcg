import type { PlayerId } from "@one-piece-sim/protocol";
import type { BoardCard, GameState } from "./model.js";
import { effectsNegated } from "./static-abilities.js";

/**
 * "If you would take damage, you may <pay> instead" -- a replacement on the
 * *player* rather than on a card, which the removal-replacement registry
 * cannot express: every entry there answers a Character leaving the field.
 *
 * EB05-052 Gloriosa is the only printing, and Bandai's EB-05 Q&A rules what it
 * reaches: a lost battle on the Leader at 0 Life (the game is not lost), both
 * points of a [Double Attack], and damage an effect deals (EB05-052#1 to #3).
 * So it is asked at the two places damage is dealt -- `resolveBattle` before a
 * Life card is checked, and the DSL's `deal-damage` node -- and both read the
 * protectors from here.
 */
export interface DamageReplacementProgram {
  /**
   * What the protector pays instead of the damage. `"trash-self"` is the
   * printed "trash this Character", which is not a K.O.: no `[On K.O.]` and no
   * K.O. watcher answers it.
   */
  cost: "trash-self";
}

let registry: ReadonlyMap<string, DamageReplacementProgram> = new Map();

/**
 * Hands the merged registry over once, at init. `mechanics.ts` runs the
 * `deal-damage` node and cannot import `mechanics/index.ts`, whose set modules
 * import it back -- the same seam `registerReplacementPrograms` is.
 */
export function registerDamageReplacements(
  programs: ReadonlyMap<string, DamageReplacementProgram>,
): void {
  registry = programs;
}

/**
 * The Characters `playerId` controls that may take damage in their place, in
 * board order. A Character whose effects are negated prints nothing to offer.
 */
export function damageReplacementProtectors(
  state: GameState,
  playerId: PlayerId,
): BoardCard[] {
  return state.players[playerId].board.filter(
    (card) =>
      registry.has(card.cardNumber) && !effectsNegated(state, card.instanceId),
  );
}

/** The option id that pays `instanceId`'s replacement. */
export const damageReplacementOption = (instanceId: string): string =>
  `replace:${instanceId}`;
