/**
 * The "when X happens" clause OP-18's Blue Leader prints with no timing
 * marker, as a reaction rule `card-mechanics.ts` dispatches off the signal
 * stream.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const op18BlueReactionRules: readonly ReactionRule[] = [
  {
    // OP18-041 Ms. All Sunday (Leader): each K.O. of one of its own Baroque
    // Works Characters printed at 3000 base power or more draws a card and
    // makes the opponent discard one of their choosing.
    //
    // `ko` because the text says K.O.'d: a bounce or a bury of the same body
    // pays nothing. Neither turn-gated nor once per turn, so a Character lost
    // in battle on the opponent's turn and one K.O.'d on its own controller's
    // turn both pay. `movedMinPower` reads base power as the card stood on
    // the field.
    cardNumber: "OP18-041",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "board",
      to: "trash",
      ko: true,
      movedOwner: "self",
      movedTypeIncluding: "Baroque Works",
      movedMinPower: 3000,
    },
    ownTurn: false,
    oncePerTurn: false,
    program: {
      effect: {
        kind: "sequence",
        effects: [
          { kind: "draw", player: "self", count: 1 },
          {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            chooser: "opponent",
            bind: "op18-041-discard",
            min: 1,
            max: 1,
            effect: {
              kind: "move",
              binding: "op18-041-discard",
              to: { player: "owner", zone: "trash" },
            },
          },
        ],
      },
    },
  },
];
