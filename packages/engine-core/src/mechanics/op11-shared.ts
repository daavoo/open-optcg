/**
 * Program fragments printed on more than one OP11 card.
 *
 * OP11 "A Fist of Divine Speed" runs two engines that repeat a cost: Yellow's
 * Fish-Man Island package pays by turning a Life card over, and the Navy/SWORD
 * package hands one attacker the right to attack an active Character.
 */
import { type MechanicEffect, type MechanicProgram } from "../mechanics.js";

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
