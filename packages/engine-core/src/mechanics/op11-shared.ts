/**
 * Program fragments printed on more than one OP11 card.
 *
 * OP11 "A Fist of Divine Speed" runs two engines that repeat a cost: Yellow's
 * Fish-Man Island package pays by turning a Life card over, and the Navy/SWORD
 * package hands one attacker the right to attack an active Character.
 */
import {
  type CardSelector,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 *
 * OP11-100 Otohime, OP11-104 Shirley, OP11-107 Topknot Neptunian and OP11-108
 * Neptune. The cost is *information*, not a card: the Life total does not move,
 * and what the opponent loses is knowing what is under their next attack -- which
 * is the whole point of a package whose Leader turns them face-up.
 *
 * `faceUp: true` on the selector is what makes it a payment: a card that is
 * already face-down cannot be turned face-down again, so a player with nothing
 * face-up is offered a cost they cannot pay and the payoff stays out of reach.
 */
export const turnLifeFaceDown = (
  bind: string,
  effect: MechanicEffect,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: {
        player: "self",
        zone: "life",
        position: "top",
        faceUp: true,
      },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [{ kind: "update", binding: bind, faceUp: false }, effect],
      },
    },
  },
});

/**
 * The mirror: "[printed text omitted -- pnpm card:text <card>]"
 * (OP11-022 Shirahoshi's Leader, OP11-117 Fish-Man Island).
 *
 * The same trade in the other direction, and the reason both exist on the same
 * archetype: face-up is what the Leader's own payoffs read, and face-down is
 * what hides a `[Trigger]` again.
 */
export const turnLifeFaceUp = (
  bind: string,
  effect: MechanicEffect,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: {
        player: "self",
        zone: "life",
        position: "top",
        faceUp: false,
      },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [{ kind: "update", binding: bind, faceUp: true }, effect],
      },
    },
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP11-010 Hibari, OP11-014 Borsalino,
 * OP11-082 Aramaki and OP11-084 Kuzan.
 *
 * `type` is dropped for OP11-119 Koby, whose clause reads "up to 1 of your
 * Characters" with no type and no Leader.
 */
export const grantAttackActive = (
  bind: string,
  options: { type?: string; includeLeader?: boolean } = {},
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "self",
    zone: "board",
    ...(options.includeLeader ? { includeLeader: true } : {}),
    ...(options.type === undefined ? {} : { type: options.type }),
  },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "grant-attack-active",
    binding: bind,
    expiresAfterTurns: 0,
  },
});

/**
 * "Place them at the top or bottom of the deck in any order": every card bound
 * to `binding`, each to either end, in an order the player picks -- OP11-049
 * Carrot's look, and the rest of OP11-040 Monkey.D.Luffy's and OP11-104
 * Shirley's searches.
 */
export const placeAtTopOrBottom = (
  binding: string,
  bind: string,
): MechanicEffect => ({
  kind: "select",
  selector: { player: "self", zone: "deck", binding },
  bind,
  count: "all",
  effect: {
    kind: "order-to-bottom",
    binding: bind,
    to: { player: "self", zone: "deck", position: "top" },
    alternate: { player: "self", zone: "deck", position: "bottom" },
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP11-072 Charlotte
 * Mont-d'or's two trash cards and OP11-091 Berry Good's three Events: the
 * opponent places `count` of their own cards at the bottom of their deck.
 *
 * The cards are theirs, so they pick which and in what order, one at a time.
 * Holding fewer than `count`, they place as many as they can (rule 8-4-4-1, the
 * reading Bandai's OP-17 Q&A gives OP17-049's fixed "trashes 2"): a single
 * `choose` with `min: count` would place nothing at all. So the clause asks for
 * the largest count the zone can fill, stepping down one at a time, which keeps
 * the order theirs at every size -- an `exhaustive` pick would take a short
 * zone whole and decide the order for them.
 */
export const opponentPlacesAtBottom = (
  selector: Omit<CardSelector, "player">,
  count: number,
  bind: string,
): MechanicEffect => {
  const place = (size: number): MechanicEffect => ({
    kind: "choose",
    selector: { player: "opponent", ...selector },
    chooser: "opponent",
    bind,
    min: size,
    max: size,
    effect: {
      kind: "move",
      binding: bind,
      to: { player: "owner", zone: "deck", position: "bottom" },
    },
  });
  let effect = place(1);
  for (let size = 2; size <= count; size += 1) {
    effect = {
      kind: "if",
      condition: {
        kind: "selector-count",
        player: "opponent",
        selector,
        operator: "gte",
        value: size,
      },
      then: place(size),
      else: effect,
    };
  }
  return effect;
};
