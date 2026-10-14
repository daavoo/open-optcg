/**
 * One module per phase: what the engine offers the player to act on.
 *
 * `getLegalActions` in `engine.ts` is now the ordering -- a pending effect
 * outranks the phase, because nothing else may happen until it resolves -- and
 * these are the generators. Splitting them apart makes the Main-phase generator
 * (a thousand lines, since that is where every optional ability, cost and target
 * lives) stop sharing a file with the sixty lines of the Blocker window.
 *
 * Every offer they produce carries the ids and typed descriptors the matching
 * handler in `actions/` reads back, which is what keeps legality and application
 * from disagreeing about what an action meant.
 *
 * ## Do not cache this on the state object
 *
 * Deriving the offers is a real cost -- it is the second most expensive thing
 * an observation does -- and a `WeakMap` keyed on the `GameState` looks like
 * the obvious fix, since a state is treated as an immutable value and
 * `applyAction` returns a new one. It is not safe, for a reason that is not
 * visible from this directory: some three dozen test files build a position by
 * assigning into a state that already exists (`state.players.p1.board = [...]`),
 * so the same object identity can hold two different positions. A cache keyed
 * on identity would answer the second with the first's offers, and the tests
 * that do this are the ones about unusual board states -- exactly where a
 * stale offer would be least obvious and most damaging.
 *
 * The way to earn the cache is to move those tests onto `test/support/`'s
 * builder first, which is already the rule for new tests. Until then, the
 * cheaper wins are the ones the callers control: `applyOfferedAction` lets a
 * caller that has already derived the list apply an action without a second
 * derivation.
 */
export { blockActions } from "./block.js";
export { counterActions } from "./counter.js";
export { mainActions } from "./main/index.js";
export { mulliganActions } from "./mulligan.js";
export { pendingEffectActions } from "./pending-effect.js";
export { triggerActions } from "./trigger.js";
