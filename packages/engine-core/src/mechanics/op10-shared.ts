/**
 * Program fragments printed on more than one OP10 card.
 *
 * OP10 is built around two repeated templates rather than around one archetype:
 * the Dressrosa package pays for ten of its clauses by resting a Leader or a
 * Stage, and the Yellow Supernovas package spends and refills Life from both
 * ends of the pile. Written once here, each is one shape to get right.
 */
import {
  SOURCE_BINDING,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 *
 * Printed on OP10-043, 044, 048, 056, 081, 083, 087, 088, 091 and 095 -- the
 * whole Blue/Black Dressrosa shell, which is what makes OP10-021-style Stages
 * and a {Dressrosa} Leader the deck's real cost line.
 *
 * The payoff is nested inside the cost's `choose` for the reason `payFromHand`
 * documents: a `choose` with nothing to fill it is skipped and the queue
 * continues, so sequencing the two would hand the effect over for free to a
 * player with no active Dressrosa Leader or Stage. `canRest: true` is what
 * makes "rest" a real payment -- an already-rested Leader cannot pay again.
 *
 * `zone: ["stage"]` plus `includeLeader` is the "Leader or Stage cards" pair.
 * A Stage is a zone of at most one card, and a Leader sits in no zone at all.
 */
export const restDressrosaLeaderOrStage = (
  bind: string,
  effect: MechanicEffect,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: {
        player: "self",
        zone: ["stage"],
        includeLeader: true,
        type: "Dressrosa",
        canRest: true,
      },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [{ kind: "rest", binding: bind }, effect],
      },
    },
  },
});

/**
 * The same template with no type on the cost -- "[printed text omitted -- pnpm card:text <card>]" (OP10-057 Leo), which is every Leader rather than a
 * {Dressrosa} one. Leo checks the Leader's *name* in its payoff instead, so
 * filtering the cost by type as well would ask the same question twice and
 * refuse a Stage on a turn the Leader is already rested.
 */
export const restOwnLeaderOrStage = (
  bind: string,
  effect: MechanicEffect,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: {
        player: "self",
        zone: ["stage"],
        includeLeader: true,
        canRest: true,
      },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [{ kind: "rest", binding: bind }, effect],
      },
    },
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP10-103 Capone"Gang"Bege and OP10-107 Jewelry Bonney.
 *
 * Both ends, as a `choice` between two branches rather than one selector:
 * `position: "edge"` offers the pair as targets, but the printed text is a
 * decision between two *known* places, and a face-down Life card is not
 * something the player can tell apart by looking. So the branch is the choice
 * and the card follows from it.
 *
 * The cost is not optional once the branch is taken -- `min: 1` -- which is why
 * the whole thing is wrapped in `optional`: "you may" is the decision to pay at
 * all, and a player with no Life cards is offered nothing.
 */
export const lifeEndToHand = (
  bind: string,
  effect: MechanicEffect,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: {
      kind: "choice",
      branches: [
        {
          id: "top",
          label: "Add the top card of your Life cards to your hand",
          effect: lifeCardToHand("top", bind, effect),
        },
        {
          id: "bottom",
          label: "Add the bottom card of your Life cards to your hand",
          effect: lifeCardToHand("bottom", bind, effect),
        },
      ],
    },
  },
});

const lifeCardToHand = (
  position: "top" | "bottom",
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "life", position },
  bind,
  min: 1,
  max: 1,
  effect: {
    kind: "sequence",
    effects: [
      { kind: "move", binding: bind, to: { player: "self", zone: "hand" } },
      effect,
    ],
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP10-109
 * Basil Hawkins' `[On K.O.]` and OP10-112 Eustass"Captain"Kid's `[On Play]`.
 *
 * Yellow's own way of attacking Life: the card is trashed rather than dealt as
 * damage, so no `[Trigger]` on it fires and the opponent gets nothing for it.
 * That is why this is a `move` to the trash and not `deal-damage`.
 *
 * `to: { player: "owner" }` -- the card is the opponent's, and a Life card
 * trashed goes to its own owner's trash.
 */
/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the `[Activate: Main]` half of the same package, printed
 * on OP10-083, OP10-087, OP10-088 and OP10-091.
 *
 * Two rests, both mandatory once the "you may" is taken. The source's own rest
 * is gated by `requires: { sourceActive: true }` at the registry entry rather
 * than here, because that is what keeps the activation from being *offered* to a
 * Character that has already been spent.
 */
export const restSelfAndDressrosaLeaderOrStage = (
  bind: string,
  effect: MechanicEffect,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: {
        player: "self",
        zone: ["stage"],
        includeLeader: true,
        type: "Dressrosa",
        canRest: true,
      },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [
          { kind: "rest", binding: SOURCE_BINDING },
          { kind: "rest", binding: bind },
          effect,
        ],
      },
    },
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the tail Black's OP10
 * Dressrosa package all prints, and what stocks the trash its own recursion and
 * OP10-097's [Banish] clause read back.
 */
export const millTwo: MechanicEffect = {
  kind: "trash-top",
  player: "self",
  count: 2,
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP10-087 Tony Tony.Chopper's `[Activate: Main]` and
 * OP10-118 Monkey.D.Luffy's `[When Attacking]` print the same clause.
 *
 * The card leaves *their* hand, so they pick it: `chooser: "opponent"`, the rule
 * for anything discarded out of a hand.
 */
export const opponentDiscardsAtFive = (
  bind: string,
  /** A "Then, ..." that shares the hand-size gate rather than following it. */
  then?: MechanicEffect,
): MechanicEffect => {
  const discard: MechanicEffect = {
    kind: "choose",
    selector: { player: "opponent", zone: "hand" },
    chooser: "opponent",
    bind,
    min: 1,
    max: 1,
    effect: {
      kind: "move",
      binding: bind,
      to: { player: "owner", zone: "trash" },
    },
  };
  return {
    kind: "if",
    condition: {
      kind: "zone-count",
      player: "opponent",
      zone: "hand",
      operator: "gte",
      value: 5,
    },
    then: then ? { kind: "sequence", effects: [discard, then] } : discard,
  };
};

export const trashOpponentLifeTop = (bind: string): MechanicEffect => ({
  kind: "select",
  selector: { player: "opponent", zone: "life", position: "top" },
  bind,
  count: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "owner", zone: "trash" },
  },
});
