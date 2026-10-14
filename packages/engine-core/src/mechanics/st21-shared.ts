/**
 * ST-21 program fragments more than one of its cards prints.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST21-0xx` prints it from the local cache).
 */
import { type MechanicEffect } from "../mechanics.js";

/**
 * "K.O. up to 1 of your opponent's Characters with N power or less" -- printed
 * at 4000 on a Character and on an Event's `[Trigger]`, and at 2000 on the
 * other Event.
 *
 * `maxCurrentPower`, not `maxPower`: these resolve on a live board, where a
 * body's DON!! and this turn's modifiers are part of what it has. The product's
 * own Events hand out −5000 for exactly that reason.
 */
export const koPowerAtMost = (
  maxCurrentPower: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCurrentPower,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});
