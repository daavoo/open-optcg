/**
 * "Base power becomes N" as stored state, and the rule that reads it.
 *
 * Comprehensive Rules 4-9-2-1: when several effects set the same card's base
 * power and the values differ, the highest value applies. So a card does not
 * hold one overwritten number but every setter still in force, each with its
 * own expiry: OP17-043 Ganzui's 6000 resolving over a 7000 leaves the Leader at
 * 7000, and when that 7000 lapses before Ganzui's does, the 6000 is what the
 * Leader falls back to rather than its printed power. Bandai's OP17 Q&A rules
 * both directions (OP17-008 Jozu's 8000 over a 7000 applies; Ganzui's 6000
 * does not).
 *
 * Imports nothing but types, so `model.ts`, `static-abilities.ts`,
 * `queries.ts` and `mechanics.ts` can all read it without a cycle.
 */
import type { BasePowerSetter } from "./model.js";

/**
 * The highest base power a live setter gives, or `undefined` when none is in
 * force -- which is the caller's cue to use printed power.
 */
export function storedBasePower(
  setters: readonly BasePowerSetter[] | undefined,
  turn: number,
): number | undefined {
  let highest: number | undefined;
  for (const setter of setters ?? []) {
    if (setter.expiresAtTurn < turn) continue;
    if (highest === undefined || setter.value > highest) highest = setter.value;
  }
  return highest;
}

/** Whether `a` is still in force whenever `b` is. */
function outlasts(a: BasePowerSetter, b: BasePowerSetter): boolean {
  if (a.expiresAtTurn !== b.expiresAtTurn)
    return a.expiresAtTurn > b.expiresAtTurn;
  return !a.battleScoped || Boolean(b.battleScoped);
}

/**
 * `setters` with `added` taken into account, for writing back to the card.
 *
 * Every setter stays, in resolution order, except one that can never apply
 * again: already expired, or matched or beaten by another that lasts at least
 * as long. Dropping those is what keeps a position that two equal setters
 * reached hashing the same as one that only saw the longer of them.
 */
export function withBasePowerSetter(
  setters: readonly BasePowerSetter[] | undefined,
  added: BasePowerSetter,
  turn: number,
): BasePowerSetter[] {
  const live = [...(setters ?? []), added].filter(
    (setter) => setter.expiresAtTurn >= turn,
  );
  return live.filter(
    (setter, index) =>
      !live.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.value >= setter.value &&
          outlasts(other, setter) &&
          // Of two identical setters, keep the earlier one.
          !(
            otherIndex > index &&
            other.value === setter.value &&
            outlasts(setter, other)
          ),
      ),
  );
}

/**
 * `setters` without the ones `drop` names, or `undefined` once none is left --
 * so a card that no longer carries a setter hashes as one that never did.
 */
export function withoutBasePowerSetters(
  setters: readonly BasePowerSetter[] | undefined,
  drop: (setter: BasePowerSetter) => boolean,
): BasePowerSetter[] | undefined {
  const kept = (setters ?? []).filter((setter) => !drop(setter));
  return kept.length > 0 ? kept : undefined;
}
