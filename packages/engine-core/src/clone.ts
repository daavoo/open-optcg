/**
 * A deep copy of the plain data a `GameState` is made of.
 *
 * `applyAction` clones the state before its handlers touch it -- that clone is
 * what lets the engine be written as mutations while every caller keeps an
 * immutable value -- so this runs once per transition and is the single most
 * executed piece of code in the project. `structuredClone` was doing it, and
 * costs about twice as much as a copy that knows the shape it is copying: it
 * walks a general object graph, tracking cycles and transferables a game state
 * has never contained.
 *
 * The fast path is deliberately narrow. Arrays and objects whose prototype is
 * `Object.prototype` (or null) are copied field by field; *anything* else --
 * a `Map`, a `Date`, a class instance -- falls back to `structuredClone` for
 * that subtree rather than being copied wrongly by a loop that does not
 * understand it. So the day a state grows a field this does not know about,
 * the result is a slower clone and not a corrupt one.
 *
 * Keys whose value is `undefined` are preserved, matching `structuredClone`:
 * `delete state.negatedEffects` and `field: undefined` are different states to
 * the engine's own invariants, and a copy that conflated them would be a
 * behaviour change hiding inside a performance change.
 *
 * `test/engine-clone.test.ts` holds this to `structuredClone`'s own output
 * over a whole simulated game, which is what makes the narrow path checkable
 * rather than merely claimed.
 */
export function cloneGameData<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const length = value.length;
    const copy = new Array<unknown>(length);
    for (let index = 0; index < length; index += 1)
      copy[index] = cloneGameData(value[index]);
    return copy as T;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null)
    return structuredClone(value);
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value))
    copy[key] = cloneGameData((value as Record<string, unknown>)[key]);
  return copy as T;
}
