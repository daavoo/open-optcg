/**
 * The version string `createGame` stamps into every state.
 *
 * Alone in a module that imports nothing, because it is read from two places
 * that cannot import each other: `provenance.ts`, which stamps it onto a
 * trace, and `model.ts`, which types `GameState.rulesVersion` as exactly this
 * string. `model.ts` importing `provenance.ts` would be a cycle -- provenance
 * reaches the static-ability table, which reads the model -- and the
 * alternative is what this replaces: the same literal written out in both
 * files, which a version bump had to remember to change twice.
 *
 * Bumped to 1.1 when the "place these cards at the bottom of your deck" clause
 * became one action carrying the whole order instead of one action per card:
 * the cards, the text and the programs are all unchanged, so neither hash in
 * `provenance.ts` moves, and a trace recorded against the old action ids would
 * otherwise fail as illegal halfway through with nothing to say why.
 */
export const RULES_VERSION = "st31-st32-st33-st34-st35-st36-1.1";
