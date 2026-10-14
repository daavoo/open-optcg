/**
 * EB-04 battle-window programs: `[Counter]` Events, `[When Attacking]`,
 * `[On Block]` and `[On Your Opponent's Attack]`.
 *
 * Seven of the booster's nine Events print a `[Counter]` half beside the
 * `[Main]` half in `eb04-main.ts`, and five of those seven are a flat +3000 on
 * a filtered target -- so the interesting entries here are the two that are
 * not: EB04-020 buys a restand after the buff, and EB04-040 pays `DON!! −1`
 * for a bigger number.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { payFromHand, rayleighOrCharacter, donMinus } from "./shared.js";
import { restOpponentCharacterUpToCost } from "./eb04-on-play.js";

/**
 * "Set up to 1 of your {Fish-Man} type Characters as active."
 *
 * The second sentence of EB04-020's `[Counter]`. A restand bought on the
 * opponent's turn is a second blocker, which is what makes a 1-cost Counter
 * worth more than the 3000 it prints -- and `min: 0` is the printed "up to",
 * so a board with nothing rested still resolves the buff.
 */
const setFishManActive: MechanicEffect = {
  kind: "choose",
  selector: {
    player: "self",
    zone: "board",
    category: "character",
    type: "Fish-Man",
  },
  bind: "eb04-020-active",
  min: 0,
  max: 1,
  effect: { kind: "update", binding: "eb04-020-active", rested: false },
};

export const eb04BattleMechanics: SetMechanics = {
  counterEvent: [
    [
      // EB04-008 Distorted Future (1). Printed text:
      // `pnpm card:text EB04-008`.
      //
      // Unconditional, unlike its `[Main]` half in `eb04-main.ts`: no Life gate
      // on defence, which is what keeps the slot live on the turns this deck is
      // still at four Life.
      "EB04-008",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // EB04-009 It's My Student's Farewell. I Want It to Be Proper. (0).
      // Printed text: `pnpm card:text EB04-009`.
      //
      // `rayleighOrCharacter` -- the same disjunction OP12-016, OP12-017 and
      // OP12-019 print, now shared from `shared.ts`. Any Character qualifies,
      // and the Leader only if it is the named one: behind that Leader the
      // second branch is always true, and behind any other this reaches only a
      // Character.
      "EB04-009",
      { cost: 0, power: 2_000, target: rayleighOrCharacter },
    ],
    [
      // EB04-019 Eleclaw (1). Printed text: `pnpm card:text EB04-019`.
      //
      // `target: { type: "Minks" }` covers both halves of the printed "Leader
      // or Character cards": a `BattleTargetFilter` with a type and no
      // `isLeader` matches whichever of the two the attack is pointed at, so
      // long as it carries the type. Its `[Main]` half is in `eb04-main.ts`.
      "EB04-019",
      { cost: 1, power: 3_000, target: { type: "Minks" } },
    ],
    [
      // EB04-020 Shark Brick Fist (1). Printed text:
      // `pnpm card:text EB04-020`.
      //
      // The only Counter in the set with a second sentence, so it is the only
      // one carrying a `program` alongside its `power`: the buff is declarative
      // and the restand is not. Both resolve whether or not the other found
      // anything. Its `[Trigger]` half is in `eb04-triggers.ts`.
      "EB04-020",
      {
        cost: 1,
        power: 3_000,
        target: { type: "Fish-Man" },
        program: { effect: setFishManActive },
      },
    ],
    [
      // EB04-029 I Heard the Sound...of a Lady's Teardrops Falling (1).
      // Printed text: `pnpm card:text EB04-029`.
      //
      // `power: 0` with the buff inside the program, because the payout is
      // bought: a card out of hand for +4000 is a different offer from a free
      // +4000, and the forecast an agent reads has to say so. Its `[Main]` half
      // is in `eb04-main.ts`.
      "EB04-029",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "eb04-029-counter-cost",
              1,
              {
                kind: "battle-power",
                player: "self",
                amount: 4_000,
                target: { name: "Sanji" },
              },
            ),
          },
        },
      },
    ],
    [
      // EB04-040 Flame Dragon Torch (1). Printed text:
      // `pnpm card:text EB04-040`.
      //
      // `DON!! −1` on a `[Counter]`, so the buff sits inside `donMinus` rather
      // than on the offer's `power`: the DON!! goes back to the DON!! deck,
      // which is a real cost on the following turn and is what a Purple deck
      // pays for +4000 at 1 cost. `power: 0` for the same reason EB04-029's is.
      //
      // Its `[Main]` half is in `eb04-main.ts`.
      "EB04-040",
      {
        cost: 1,
        power: 0,
        program: {
          effect: donMinus(1, {
            kind: "battle-power",
            player: "self",
            amount: 4_000,
            target: { isLeader: true },
          }),
        },
      },
    ],
    [
      // EB04-050 I'll Whip You Into Shape. ♡ (1). Printed text:
      // `pnpm card:text EB04-050`.
      //
      // A flat Leader +3000 at 1 cost -- the half that makes the slot a Counter
      // first and a trick second. Its `[Main]` half is in `eb04-main.ts`.
      "EB04-050",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
  ],
  whenAttacking: [
    [
      // EB04-004 Zeff. Printed text: `pnpm card:text EB04-004`.
      //
      // `set-leader-base-power` rather than a +N: "becomes 7000" is a
      // replacement, so a 5000 Leader gains 2000 and a 6000 Leader gains 1000 --
      // and DON!! given to the Leader still stacks on top. That is the whole
      // reason a 7-cost 8000 with no keyword is playable: it turns every
      // Leader in the format into the same defensive number.
      //
      // `expiresAfterTurns: 1` is the printed "until the end of your opponent's
      // next End Phase", so the 7000 is up while the opponent attacks into it --
      // which is what the clause is for.
      "EB04-004",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "set-leader-base-power",
            player: "self",
            value: 7_000,
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // EB04-016 Bird Neptunian. Printed text: `pnpm card:text EB04-016`.
      //
      // The three-body count includes this card, which is attacking -- so the
      // gate is on the board as it stands when the attack is declared, not on
      // some earlier state. Its `[Activate: Main]` half is in `eb04-main.ts`,
      // and the two are why this is a 5-cost 7000: the activation makes DON!!
      // and the attack makes room.
      "EB04-016",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                type: "Neptunian",
              },
              operator: "gte",
              value: 3,
            },
            then: restOpponentCharacterUpToCost("eb04-016-rest", 8),
          },
        },
      },
    ],
    [
      // EB04-022 Issho. Printed text: `pnpm card:text EB04-022`.
      //
      // `[DON!! x1]` reads the DON!! given to *this* Character, which is
      // `source-attached-don` -- not the field total. A 5-cost 7000 that has to
      // be pushed to 8000 before its trick is live, so the DON!! is paying
      // twice.
      //
      // Its `[On Play]` half is in `eb04-on-play.ts`.
      "EB04-022",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "source-attached-don",
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: payFromHand(
                { player: "self", zone: "hand" },
                "eb04-022-attack-cost",
                1,
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "eb04-022-debuff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "eb04-022-debuff",
                    amount: -2_000,
                    expiresAfterTurns: 0,
                  },
                },
              ),
            },
          },
        },
      },
    ],
  ],
  onBlock: [
    [
      // EB04-053 Sentomaru. Printed text: `pnpm card:text EB04-053`.
      //
      // A 2-cost [Blocker] that replaces itself once this deck is low, which is
      // the yellow trade: blocking is how the Life gets spent, and the gate
      // reads the total *after* it has been. Mandatory -- no "you may" -- so a
      // block at three Life simply draws nothing.
      "EB04-053",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 2,
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // EB04-034 Charlotte Pudding. Printed text:
      // `pnpm card:text EB04-034`.
      //
      // Four Events in the trash is a real deckbuilding requirement rather
      // than a rider, and the gate is *inside* the cost: "you may trash: if you
      // have 4 or more" pays first and checks second, so a player who
      // miscounts has spent the card. That ordering is printed and is the
      // difference between this and a free +2000.
      //
      // `requires: { handCards: 1 }` keeps the window from opening with an
      // empty hand -- the once-per-turn budget is the scarce part of a 2-cost
      // 1000 [Blocker].
      "EB04-034",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "eb04-034-cost",
              1,
              {
                kind: "if",
                condition: {
                  kind: "selector-count",
                  player: "self",
                  selector: { zone: "trash", category: "event" },
                  operator: "gte",
                  value: 4,
                },
                then: {
                  kind: "battle-power",
                  player: "self",
                  amount: 2_000,
                },
              },
            ),
          },
        },
      },
    ],
  ],
};
