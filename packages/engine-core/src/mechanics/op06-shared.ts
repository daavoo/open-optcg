/**
 * OP06 fragments more than one of its cards prints.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP06-0xx` prints it from the local cache).
 */
import {
  SOURCE_BINDING,
  type CardSelector,
  type MechanicCondition,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import type { ActivateMainProgram } from "./types.js";
import { lookAndAdd } from "./shared.js";

/** "If your Leader has the {FILM} type" -- the Red/Uta package's gate. */
export const filmLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "FILM",
};

/** "…1 {FILM} type card", as a target filter. */
export const filmCard: Omit<CardSelector, "player" | "zone"> = {
  type: "FILM",
};

/** "If your Leader has the {New Fish-Man Pirates} type" -- printed on four. */
export const newFishManLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "New Fish-Man Pirates",
};

/** "If your Leader has the {Thriller Bark Pirates} type." */
export const thrillerBarkLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "Thriller Bark Pirates",
};

/** "If your Leader has the {GERMA 66} type" -- printed on five. */
export const germaLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "GERMA 66",
};

/**
 * "Then, add 1 card from the top of your Life cards to your hand."
 *
 * The New Fish-Man Pirates package's own price, printed as the tail of six
 * clauses: the payoff is real and the Life card is what pays for it. Mandatory,
 * so it is a `select` rather than a `choose` -- the printed sentence names the
 * top card and offers no decision -- and it resolves to nothing on an empty
 * Life area, which is the same reading "add 1 card" gets everywhere else.
 *
 * `position: "top"` and not `"edge"`: the top of the Life area is `life[0]`,
 * the card the next hit takes, and `"edge"` would offer both ends of a stack
 * the clause never names the bottom of.
 */
export const lifeTopToHand: MechanicEffect = {
  kind: "select",
  selector: { player: "self", zone: "life", position: "top" },
  bind: "op06-life-tail",
  count: 1,
  effect: {
    kind: "move",
    binding: "op06-life-tail",
    to: { player: "self", zone: "hand" },
  },
};

/**
 * "Look at N cards from the top of your deck and play up to 1 <match>. Then,
 * place the rest at the bottom of your deck in any order."
 *
 * The play-side twin of `lookAndAdd` in `shared.ts`, which adds the card to the
 * hand instead. The remainder is selected out of the *deck* after the play, so
 * a card that left for the board is not put back under the deck as well.
 */
export const lookAndPlay = (
  count: number,
  bind: string,
  match: Omit<CardSelector, "player" | "zone" | "binding">,
  rested = false,
): MechanicProgram => ({
  effect: {
    kind: "sequence",
    effects: [
      { kind: "look-at", player: "self", count, bind },
      {
        kind: "choose",
        selector: { ...match, player: "self", zone: "deck", binding: bind },
        bind: `${bind}-play`,
        min: 0,
        max: 1,
        effect: { kind: "play", binding: `${bind}-play`, rested },
      },
      {
        kind: "select",
        selector: { player: "self", zone: "deck", binding: bind },
        bind: `${bind}-rest`,
        count: "all",
        effect: {
          kind: "order-to-bottom",
          binding: `${bind}-rest`,
          to: { player: "self", zone: "deck", position: "bottom" },
        },
      },
    ],
  },
});

/**
 * "You may place 1 Stage with a cost of 1 at the bottom of the owner's deck:
 * <effect>."
 *
 * The Sky Island package's currency, printed on three cards, and the reason
 * that deck runs two 1-cost Stages it never needs on the field. `player:
 * "either"` because the printed clause names no side -- an opposing 1-cost
 * Stage is a legal payment, and the destination is the *owner's* deck for the
 * same reason.
 *
 * The payoff is nested inside the cost's `choose` for the reason `payFromHand`
 * gives: a `choose` that cannot fill its `min` is skipped and the queue carries
 * on, so sequencing the two would hand the payoff to a player who paid nothing.
 */
export const payWithStage = (
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "choose",
    selector: { player: "either", zone: "stage", maxCost: 1 },
    bind,
    min: 1,
    max: 1,
    effect: {
      kind: "sequence",
      effects: [
        {
          kind: "move",
          binding: bind,
          to: { player: "owner", zone: "deck", position: "bottom" },
        },
        effect,
      ],
    },
  },
});

/**
 * "[Trigger] If your opponent has 3 or less Life cards, play this card."
 *
 * The Land of Wano package's Trigger, printed on six of its bodies: a Life card
 * that arrives as a Character once the race is on. Shared with
 * `op06-yamato.ts`, which registers the two identities that deck ships.
 */
export const playSelfWhenOpponentBehind: MechanicProgram = {
  effect: {
    kind: "if",
    condition: {
      kind: "zone-count",
      player: "opponent",
      zone: "life",
      operator: "lte",
      value: 3,
    },
    then: { kind: "play", binding: SOURCE_BINDING },
  },
};

/**
 * "[Trigger] If you have 2 or less Life cards, play this card."
 *
 * The Sky Island half of the same idea, and the mirror of it: Shandia bodies
 * come off a Life area the controller has been spending, so the gate reads
 * their own Life rather than the opponent's.
 */
export const playSelfWhenBehind: MechanicProgram = {
  effect: {
    kind: "if",
    condition: {
      kind: "zone-count",
      player: "self",
      zone: "life",
      operator: "lte",
      value: 2,
    },
    then: { kind: "play", binding: SOURCE_BINDING },
  },
};

/**
 * "[Activate: Main] DON!! −1. You may trash this Character: if your Leader has
 * the {GERMA 66} type, play up to 1 [<name>] with a cost of C from your hand or
 * trash."
 *
 * Four of the Vinsmoke siblings print exactly this, each naming its own larger
 * self, and the shape is the archetype in one clause: the DON!! that goes back
 * puts the deck *behind* on DON!!, which is the condition the rest of the set
 * pays out on.
 *
 * The cost ceiling is exact rather than a maximum -- the printed clause names
 * one cost, and the pool prints two Vinsmoke Reiju Characters -- so it is
 * written as `minCost` and `maxCost` together. Zones are hand *and* trash,
 * which is one selector rather than two: the sibling that was traded in earlier
 * comes back the same way it would out of hand.
 */
export const germaSwapUp = (
  name: string,
  cost: number,
  bind: string,
): ActivateMainProgram => ({
  oncePerTurn: false,
  requires: { fieldDon: 1 },
  program: {
    effect: {
      kind: "if",
      condition: {
        kind: "field-don",
        player: "self",
        operator: "gte",
        value: 1,
      },
      then: {
        kind: "optional",
        effect: {
          kind: "sequence",
          effects: [
            { kind: "return-don", player: "self", count: 1 },
            {
              kind: "move",
              binding: SOURCE_BINDING,
              to: { player: "self", zone: "trash" },
            },
            {
              kind: "if",
              condition: germaLeader,
              then: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: ["hand", "trash"],
                  name,
                  minCost: cost,
                  maxCost: cost,
                },
                bind,
                min: 0,
                max: 1,
                effect: { kind: "play", binding: bind },
              },
            },
          ],
        },
      },
    },
  },
});

/**
 * "K.O. up to 1 of your opponent's Characters with N power or less."
 *
 * The ceiling is read after DON!! and every other layer, which is what
 * `maxCurrentPower` says: a card on the field is worth what the board says it
 * is worth, so a body the opponent has spent DON!! on climbs out of reach.
 */
export const koPowerAtMost = (
  maxPower: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCurrentPower: maxPower,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});

/** "K.O. up to 1 of your opponent's rested Characters with a cost of C or less." */
export const koRestedCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    rested: true,
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});

/**
 * "Place up to 1 of your opponent's Characters with a cost of C or less at the
 * bottom of the owner's deck."
 *
 * The narrower twin of `buryCostAtMost` in `op07-shared.ts`, which reaches
 * either side: OP06-056 and OP06-077 both name the opponent's board, and a
 * clause that named no side would offer the controller their own Characters.
 */
export const buryOpponentCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "owner", zone: "deck", position: "bottom" },
  },
});

/** "Trash N cards from your hand", as a payment with no payoff nested in it. */
export const trashFromHand = (count: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "hand" },
  bind,
  min: count,
  max: count,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "self", zone: "trash" },
  },
});

/**
 * OP06-013 Monkey.D.Luffy's dig, printed on its `[On Play]` and re-run by its
 * own `[Trigger]`: one program, registered from both tables.
 */
export const filmSearch: MechanicProgram = lookAndAdd(3, "op06-film-look", {
  type: "FILM",
});
