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
 *
 * Bumped to 1.2 when setup started dealing Life so the deck's top card is the
 * bottom Life card (Bandai's rules Q&A, Basic Rules 2). No card or program
 * changed, so again neither hash moves, but every seeded game holds its Life
 * in the opposite order and a recorded action list diverges at the first
 * damage.
 *
 * Bumped to 1.3 when clauses that trigger together started being ordered by
 * their controller, turn player first, and a clause triggered while another
 * resolves started waiting behind the ones already waiting (Bandai's OP-10
 * Q&A, OP10-042 and OP10-058). A recorded action list meets an ordering
 * question it never answered, or answers one that is no longer asked.
 *
 * Bumped to 1.4 when the clauses watching for a Life card leaving on battle
 * damage started waiting for the end of the Damage Step -- after the Trigger
 * and every [Double Attack] point (Bandai's OP-05 Q&A, OP05-098). A recorded
 * action list answers the Trigger and the watcher in the other order.
 *
 * Bumped to 1.5 when cards placed at the bottom of a deck "in any order" by
 * OP05-058, OP14-010, OP15-101, OP16-059, OP16-077 and OP17-041 started being
 * ordered by a player -- by each owner for OP05-058 and OP17-041 (Bandai's
 * OP05-058#2). A recorded action list meets an order prompt it never
 * answered.
 *
 * Bumped to 1.6 for Bandai's OP-06 Q&A: what a program sets off before it
 * stops for a choice is held until it finishes and ordered with the rest
 * (OP06-042#2); OP06-056 and OP06-058 ask the owner to order the Characters
 * they bury; and OP06-006 Saga chooses the {FILM} Character it trashes when
 * the turn ends. A recorded action list meets prompts it never answered.
 *
 * Bumped to 1.7 for Bandai's OP-11 Q&A: OP11-012 Franky's +2000 waits for
 * the Event it answers, a K.O. of several Characters reads each one's
 * replacements before any of them leaves (OP11-001#3), OP11-066 Oven's DON!!
 * needs the guess to land, and OP11-022 Shirahoshi's Leader is not offered
 * with its top Life card face-up. A recorded action list can meet an offer
 * that is no longer made.
 */
export const RULES_VERSION = "st31-st32-st33-st34-st35-st36-1.7";
