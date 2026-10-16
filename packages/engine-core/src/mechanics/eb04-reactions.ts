/**
 * The "when X happens" clauses EB-04 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const eb04ReactionRules: readonly ReactionRule[] = [
  {
    // EB04-035 Hitokiri Kamazo. Printed text: `pnpm card:text EB04-035`.
    //
    // The same `don-returned` signal OP11-077 Randolph watches, and for the
    // same reason it has no printed marker: "when a DON!! card on your field is
    // returned to your DON!! deck" is a thing that happens, not a window. In a
    // Kid deck the thing that happens is this deck's own `DON!! −N` costs --
    // EB04-040's Counter among them -- so the ramp is paid for by the card that
    // spent the DON!! in the first place.
    //
    // Rested, so the replacement DON!! is next turn's: this converts a spent
    // DON!! into a kept one rather than into tempo. `[Your Turn]` is the
    // printed marker and is what keeps it off the Counters the opponent's turn
    // would otherwise trigger it from.
    //
    // Its printed [Blocker] needs no entry -- an unconditional keyword is a
    // derived fact, not a program.
    cardNumber: "EB04-035",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "if",
        condition: {
          kind: "leader-has-type",
          player: "self",
          type: "Kid Pirates",
        },
        then: { kind: "add-don", player: "self", count: 1, rested: true },
      },
    },
  },
  {
    // EB04-044 Koby. Printed text: `pnpm card:text EB04-044`.
    //
    // `movedOwner: "opponent"` is the first of its kind, and the field was
    // widened for it: every earlier `card-moved` rule watches its own
    // controller's cards, and this one watches the other side's. Read as
    // OP10-042's does -- a K.O. is an exit from the board to the trash -- which
    // is the only reading the signal stream can offer.
    //
    // `[Your Turn]` is what makes it a reward for attacking rather than a
    // reward for being attacked: on this player's turn an opponent's Character
    // reaching the trash is a body that lost a battle Koby's team declared, or
    // one this deck's own removal answered.
    //
    // Its `[Once Per Turn]` removal replacement is in
    // `mechanics/eb04-replacements.ts`, and the two keys are separate -- the
    // replacement's is `:replacement`-suffixed -- so paying one does not spend
    // the other. That is right: they are two printed clauses that happen to
    // share a marker.
    cardNumber: "EB04-044",
    controller: "board",
    signal: {
      kind: "card-moved",
      from: "board",
      to: "trash",
      ko: true,
      movedOwner: "opponent",
    },
    ownTurn: true,
    oncePerTurn: true,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
];
