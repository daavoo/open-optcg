/**
 * The "when X happens" clauses EB-02 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const eb02ReactionRules: readonly ReactionRule[] = [
  {
    // EB02-023 Crocodile: "[Your Turn] [Once Per Turn] When your opponent's
    // Character is returned to the owner's hand by your effect, look at 3 cards
    // from the top of your deck and place them at the top or bottom of the deck
    // in any order."
    //
    // Every half of that sentence is a filter on the signal and none is
    // redundant: `movedOwner: "opponent"` is whose Character, `to: "hand"` is
    // the bounce rather than any exit, and `bySource: "self"` is "by your
    // effect" -- so an opponent bouncing their own body to re-use it pays
    // nothing. `[Your Turn]` on top of that, because a Counter can bounce on
    // either turn.
    //
    // The payoff is a look with no card taken: the cards stay in the deck and
    // only the order changes, which is why it is an `order-to-bottom` with an
    // `alternate` rather than a search. Three cards of different identities is
    // three real decisions, and a run of one identity is skipped.
    cardNumber: "EB02-023",
    controller: "board",
    signal: {
      kind: "card-moved",
      from: "board",
      to: "hand",
      movedOwner: "opponent",
      bySource: "self",
    },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "sequence",
        effects: [
          {
            kind: "look-at",
            player: "self",
            count: 3,
            bind: "eb02-023-look",
          },
          {
            kind: "select",
            selector: {
              player: "self",
              zone: "deck",
              binding: "eb02-023-look",
            },
            bind: "eb02-023-place",
            count: "all",
            effect: {
              kind: "order-to-bottom",
              binding: "eb02-023-place",
              to: { player: "self", zone: "deck", position: "bottom" },
              alternate: { player: "self", zone: "deck", position: "top" },
            },
          },
        ],
      },
    },
  },
  {
    // EB02-035 Sanji & Pudding: "[Your Turn] [Once Per Turn] When 2 or more
    // DON!! cards on your field are returned to your DON!! deck, add up to 1
    // DON!! card from your DON!! deck and set it as active."
    //
    // `minCount: 2` is the printed floor and it rides on the signal rather than
    // being read off the board: a `DON!! −1` must not fire it, and after the
    // payment the field says nothing about how many went back at once. Purple
    // pays for its tempo by returning DON!! , so the refund is what makes the
    // expensive returns affordable -- and the floor is what makes the cheap
    // ones not count.
    //
    // Active, not rested: the DON!! comes back spendable on the same turn it
    // was paid. Its `[On Play]` is in `mechanics/eb02-on-play.ts`.
    cardNumber: "EB02-035",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self", minCount: 2 },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: { kind: "add-don", player: "self", count: 1, rested: false },
    },
  },
];
