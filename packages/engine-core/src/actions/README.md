# actions/ and legal-actions/

One module per `GameAction` type: what that action does to the state.

`applyAction` in `engine.ts` is now preconditions — the game is not finished, the
revision is current, the engine itself offered this action — plus one call
through `ACTION_HANDLERS`. Each handler gets an `ActionContext` holding the
cloned state, the event log for this transition, the acting player, the typed
action and the matching legal action the engine offered.

Two things this buys over the `if/else if` chain it replaced:

- **Exhaustiveness.** The table is a mapped type over `GameAction["type"]`, so a
  new action type without a handler is a compile error. The chain could not fail
  that way: an unhandled type fell through, did nothing, and still bumped the
  revision.
- **Reviewable units.** `attack.ts` is 230 lines about declaring an attack rather
  than lines 4174–4405 of a 5,000-line file, and two branches touching different
  action types no longer conflict.

Handlers read resolved ids and typed descriptors off `offered` rather than
re-deriving them from the state — that is what keeps legality and application
from disagreeing about what an action meant.

`../legal-actions/` is the other half of the same seam: one module per phase for
what the engine _offers_, where `actions/` is what it _does_. `getLegalActions`
is now the ordering (a pending effect outranks the phase, because nothing else
may happen until it resolves) and the generators live in `legal-actions/main.ts`,
`block.ts`, `counter.ts`, `trigger.ts`, `mulligan.ts` and `pending-effect.ts`.

They import shared transition helpers (`resolveBattle`, `endTurn`, `attachDon`,
…) from the layer below `engine.ts` — `../board.js`, `../pending.js`,
`../battle.js` and `../turn.js` — and no longer from `engine.ts` itself.

That used to be a deliberate import cycle: `engine.ts` held the battle and turn
machinery as well as the dispatch table, so a handler could not reach one
without importing the module that imports it. Splitting those four modules out
retired it, and the kernel's dependency order is now acyclic — `board.js`
imports none of its siblings, `engine.ts` imports all of them. A handler's
imports now name the layer it depends on instead of pointing back at the top.
