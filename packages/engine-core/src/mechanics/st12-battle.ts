/**
 * ST-12 battle-window programs: `[When Attacking]` and the two `[Counter]`
 * halves.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST12-0xx` prints it from the local cache).
 *
 * `[DON!! xN]` is an `if` on `source-attached-don`, which is how the pool
 * expresses it: the engine has no generic gate for the printed marker, and
 * `donRequirement` on the record is read by the agents rather than by the
 * rules.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { restCostAtMost, restOrKoCostAtMost } from "./shared.js";
import { revealAndPlayCostTwo } from "./st12-shared.js";
import { restLeaderOrCharacterAtFour } from "./st12-main.js";
import { type SetMechanics } from "./registry.js";

/** "[DON!! x1]" on a Character's or a Leader's own clause. */
const withOneDon = (effect: MechanicEffect): MechanicEffect => ({
  kind: "if",
  condition: { kind: "source-attached-don", operator: "gte", value: 1 },
  then: effect,
});

export const st12BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // ST12-001 Roronoa Zoro & Sanji, the Leader: a Character back to hand
      // buys a second attack out of a body that has already swung.
      //
      // The cost is the restraint and it is priced twice over -- the body has
      // to cost 2 or more, so a 1-cost cannot be the fuel, and the Character
      // set active has to be at 7000 power or less, so the biggest attacker on
      // the board is never the one that restands. Together that makes this a
      // Leader that converts a spent 2-drop into a second swing from a 5000,
      // not a way to attack twice with a 9000.
      //
      // The cost is paid before the payoff is chosen, so returning the body you
      // were going to restand is a legal, losing, line. Current power on the
      // ceiling, which on the attacker's own turn is the only power there is.
      "ST12-001",
      {
        oncePerTurn: true,
        program: {
          effect: withOneDon({
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                minCost: 2,
              },
              bind: "st12-leader-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st12-leader-cost",
                    to: { player: "owner", zone: "hand" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      maxCurrentPower: 7_000,
                      rested: true,
                    },
                    bind: "st12-leader-refresh",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "update",
                      binding: "st12-leader-refresh",
                      rested: false,
                    },
                  },
                ],
              },
            },
          }),
        },
      },
    ],
    [
      // ST12-006 Yosaku & Johnny: with a DON!! on it, each attack rests a
      // 2-cost or finishes one that is already rested.
      //
      // Repeatable rather than `[Once Per Turn]`, which is what makes a 2-cost
      // 3000 worth a slot: the clause fires on every attack the body makes, so
      // it pays again on the turns after the one it arrived.
      "ST12-006",
      {
        oncePerTurn: false,
        program: {
          effect: withOneDon(restOrKoCostAtMost(2, "st12-yosaku")),
        },
      },
    ],
    [
      // ST12-008 Roronoa Zoro: with a DON!! on it, each attack rests a body at
      // cost 6 or less.
      //
      // The widest rest in the product and the reason it prints no Counter: a
      // 4-cost 6000 that takes the best blocker out of the way before the swing
      // resolves is the card the Leader's restand is aimed at.
      "ST12-008",
      {
        oncePerTurn: false,
        program: { effect: withOneDon(restCostAtMost(6, "st12-zoro-rest")) },
      },
    ],
    [
      // ST12-010 Emporio.Ivankov: once a turn, a card back off the top while
      // the hand is not already full.
      //
      // The hand ceiling is what stops it being a free draw every turn: a deck
      // holding seven cards is not offered it, which in practice means the
      // clause pays exactly when the deck has been spending.
      "ST12-010",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "hand",
              operator: "lte",
              value: 6,
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // ST12-011 Sanji: with a DON!! on it and a hand of 5 or less, +2000 that
      // survives into the opponent's turn.
      //
      // `expiresAfterTurns: 1` is the printed "until the start of your next
      // turn", which is a different window from every other buff here: the body
      // attacks as a 5000 and then blocks as one. The hand ceiling is the same
      // reading ST12-010 prints from the other side -- this product pays a deck
      // that has emptied its hand, not one that is holding it.
      "ST12-011",
      {
        oncePerTurn: false,
        program: {
          effect: withOneDon({
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "hand",
              operator: "lte",
              value: 5,
            },
            then: {
              kind: "modify-power",
              binding: SOURCE_BINDING,
              amount: 2_000,
              expiresAfterTurns: 1,
            },
          }),
        },
      },
    ],
    [
      // ST12-013 Zeff: each attack reveals the top card and plays it rested if
      // it is a 2-cost body.
      //
      // `rested` is the only thing that separates this printing from
      // ST12-010's, and it is a real restraint: the body arrives too late to
      // attack and too rested to block, so what it buys is a Counter and a
      // board presence next turn. Repeatable, so a Zeff that survives keeps
      // digging.
      "ST12-013",
      {
        oncePerTurn: false,
        program: { effect: revealAndPlayCostTwo("st12-zeff-reveal", true) },
      },
    ],
  ],
  counterEvent: [
    [
      // ST12-016 Lion Strike: the [Counter] half of the same rest the [Main]
      // half prints.
      //
      // `power: 0` because the Event adds no power -- it is a Counter that
      // changes the board rather than the battle, and resting the attacker
      // before it connects is what it is for. The same fragment is registered
      // for `[Main]` in `st12-main.ts` and for `[Trigger]` in
      // `st12-triggers.ts`.
      "ST12-016",
      {
        cost: 2,
        power: 0,
        program: { effect: restLeaderOrCharacterAtFour("st12-lion-counter") },
      },
    ],
    [
      // ST12-017 Plastic Surgery Shot: +2000 in the battle, and then the same
      // top-of-deck reveal the rest of the product runs on.
      //
      // 2000 at 1 cost is the rate a printed Counter card carries, so what the
      // Event really costs is the card -- and the reveal is what pays it back.
      "ST12-017",
      {
        cost: 1,
        power: 2_000,
        program: { effect: revealAndPlayCostTwo("st12-surgery-reveal") },
      },
    ],
  ],
};
