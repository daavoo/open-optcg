/**
 * The format rules every deck runs, and the map of where each one lives.
 *
 * This file is both the index and the import path: `registry.ts`, `local.ts`
 * and the deck policies import from here, so a rule moving between the files
 * below is invisible to them. It is the same shape `card-mechanics.ts` has over
 * `mechanics/<set>.ts`, and `styles/index.css` over the stylesheets.
 *
 * The split is **by decision, not by deck**. A format rule is registered for
 * whichever Leaders have measured it, so grouping by deck would put the same
 * rule in several files and leave nowhere for a rule that is scoped to one
 * deck today and to the field tomorrow. Grouping by the decision it answers is
 * stable under that, and it is what a reader arriving from a trace has in hand:
 * they know the seat attacked into a Blocker, not which module they want.
 *
 *  - `format/don.ts`          what to attach DON!! to, and what to spend it on
 *  - `format/attacks.ts`      whether to declare, at what, and in what order
 *  - `format/defence.ts`      Counter, block, and what to hold back for them
 *  - `format/triggers.ts`     [Trigger]s and turn-scoped effects
 *  - `format/replacement.ts`  choices that give a card up
 *  - `format/selection.ts`    choices that pick a card out of a set
 *  - `format/shared.ts`       helpers read by more than one of the above, and
 *                             deliberately not re-exported here: they were
 *                             private to this file before the split and the
 *                             public surface is unchanged by it
 *
 * A new rule goes in the file its decision belongs to and is re-exported here;
 * nothing else changes. Splitting these apart is also why two rules written in
 * the same week stopped colliding in one 3,400-line file.
 */
export * from "./format/don.js";
export * from "./format/attacks.js";
export * from "./format/defence.js";
export * from "./format/triggers.js";
export * from "./format/replacement.js";
export * from "./format/selection.js";
