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
 *
 * Bumped to 1.8 for Bandai's OP-12 Q&A: two OP12-027 Koushirou can each save
 * the other from one K.O., the [Silvers Rayleigh] Events are not offered
 * without their price, and the OP12-041 Sanji Leader, OP12-057, OP12-059,
 * OP12-073 and OP12-078 read their gates as printed. A recorded action list
 * can meet offers that changed.
 *
 * Bumped to 1.9 for Bandai's OP-13 Q&A: OP13 K.O. replacements answer
 * every K.O. including their own card's, an empty board fails "the only
 * Characters on your field are ...", a battle ends when its attacker leaves
 * the field, opening Stages are played in turn order, and OP13-119's return
 * must land for the opponent's play. A recorded action list can meet offers
 * that changed.
 *
 * Bumped to 1.10 when every `[Once Per Turn]` reaction became optional, with
 * the use kept on a decline and a clause that would do nothing passed over
 * (Bandai's OP07-038#1 and OP12-081#3). A recorded action list meets an
 * apply/skip question it never answered.
 *
 * Bumped to 1.11 for the rest of Bandai's OP-15 Q&A: a "top or bottom"
 * placement sends every card to the same end, "if you have [name]" counts
 * the Leader and Stage, a [Trigger]'s own card is not in the trash while its
 * effect resolves, OP15-080 is played only from the trash, and OP15-114's
 * flip needs a face-down top Life card. A recorded action list can meet
 * offers that changed.
 *
 * Bumped to 1.12 for Bandai's OP-16 Q&A: "if you have [name]" counts the
 * Leader and Stage on every card that prints it (OP16-025/029, OP16-057,
 * OP05-103, OP08-004, OP11-109), OP16-058 sets an every-name Leader's base
 * power too, OP16-081 counts either side's 8-cost, OP16-103's [Trigger] keeps
 * its [Opponent's Turn] gate, OP16-045 may return itself, and Slave Arrow's
 * and Crocodile's returns are seen by "removed from the field" watchers. A recorded action list can meet offers
 * that changed.
 *
 * Bumped to 1.13 for Bandai's PRB-02 and promotion-card Q&As: copies of a
 * Character's aura each apply, cost auras reach only Characters on the
 * field, a [Trigger] is a base effect, every [On Your Opponent's Attack]
 * source is offered after one that asked nothing, a [When Attacking] choice
 * the defender makes is theirs to answer, P-058 reads the board at the end
 * of the turn, PRB02-014's discount is a cost layer, and PRB02-006 cannot
 * swap with a Character that cannot be rested. A recorded action list can
 * meet offers that changed.
 *
 * Bumped to 1.14 for Bandai's ST-01 to ST-14 Q&As: a [Once Per Turn]
 * reaction is optional only when it prints "This effect can be activated
 * when ..." or a "you may", "trash N cards from your opponent's hand" is a
 * face-down pick by the effect's user, and under ST13-003's Leader a
 * face-up Life card cannot trigger and goes to the bottom of the deck even
 * when an effect adds it to the hand -- leaving a "Life card to hand" cost
 * unpaid. A recorded action list can meet offers that changed.
 *
 * Bumped to 1.15 for Bandai's ST-15 to ST-28 Q&As: a power, cost or keyword
 * grant lasting into a later turn counts from its controller's turn (an
 * off-turn "until the end of your opponent's next turn" ends that turn),
 * "base power" reads a base an effect set, ST24-004 may lock an
 * already-rested Character, OP10-030 stops ST24-005's end-of-turn
 * activation, and ST28-004 picks which cards give back its two DON!!. A
 * recorded action list can meet offers that changed.
 */
export const RULES_VERSION = "st31-st32-st33-st34-st35-st36-1.15";
