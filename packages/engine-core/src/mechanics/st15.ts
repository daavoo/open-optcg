/**
 * ST-15's five-card Whitebeard supplement.
 *
 * Comments paraphrase what each clause has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content (`pnpm card:text
 * ST15-0xx` prints it from the local cache).
 *
 * Five identities and six programs, and three of the five read the Leader:
 * two by the {Whitebeard Pirates} type and one by name. The continuous halves
 * -- ST15-003's [Blocker] and ST15-005's conditional [Rush] -- are not timed
 * and so are a derived keyword and a `StaticAbility` row rather than programs
 * here.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type MechanicCondition } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";

/** "If your Leader's type includes 'Whitebeard Pirates'". */
const whitebeardLeader: MechanicCondition = {
  kind: "leader-type-including",
  player: "self",
  text: "Whitebeard Pirates",
};

export const st15Mechanics: SetMechanics = {
  whenAttacking: [
    [
      // ST15-001 Atmos: attacking behind the named Leader shuts the deck's own
      // Life-to-hand engine off for the turn.
      //
      // A price with no payout on the card, which is unusual enough to be worth
      // saying out loud: what it is priced against is the rest of the product.
      // ST15-004 and the Newgate Leader both convert Life into cards, so the
      // clause costs a real turn's worth of that and nothing else -- which is
      // why the body is under rate for its cost.
      //
      // `restrict-player` rather than a `restrict` on a card: the subject is
      // the player, and no binding names "every effect you control".
      "ST15-001",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Edward.Newgate",
            },
            then: {
              kind: "restrict-player",
              player: "self",
              restriction: "cannot-life-to-hand",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
  ],
  onPlay: [
    [
      // ST15-002 Edward.Newgate: arriving hands a rested DON!! to the Leader or
      // to a Character.
      //
      // `give-rested-don` rather than `attach-don`, because the printed target
      // list includes the Leader and `attach-don`'s binding lookup only reaches
      // a board Character. Nothing is gated: at 7 cost the body is the card and
      // the DON!! is what makes the turn after it playable.
      "ST15-002",
      { effect: { kind: "give-rested-don", player: "self", count: 1 } },
    ],
    [
      // ST15-004 Thatch: a 1-cost that shrinks a body and then buys a card off
      // the top of Life.
      //
      // The two halves are one sentence and the second is unconditional on the
      // first -- "then" here means order, not dependency -- but both sit inside
      // the Leader gate, which is what the printed "If" covers. The Life card
      // goes to hand, so this is the clause ST15-001 turns off.
      "ST15-004",
      {
        effect: {
          kind: "if",
          condition: whitebeardLeader,
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "st15-thatch-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "st15-thatch-debuff",
                  amount: -2_000,
                  expiresAfterTurns: 0,
                },
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "life",
                  position: "top",
                },
                bind: "st15-thatch-life",
                count: 1,
                effect: {
                  kind: "move",
                  binding: "st15-thatch-life",
                  to: { player: "self", zone: "hand" },
                },
              },
            ],
          },
        },
      },
    ],
  ],
  activateMain: [
    [
      // ST15-002 Edward.Newgate: resting the body K.O.s anything at 5000 power
      // or less.
      //
      // Repeatable rather than `[Once Per Turn]`, and `sourceActive` is what
      // keeps the offer honest once it has rested -- the body refreshes each
      // turn, so the clause fires again every turn it survives. Current power,
      // which is the only reading that works on a card already on the field:
      // DON!! pay power for their controller alone, so the same body is inside
      // the ceiling on one turn and outside it on the next.
      "ST15-002",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCurrentPower: 5_000,
                  },
                  bind: "st15-newgate-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "st15-newgate-ko" },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  onKo: [
    [
      // ST15-003 Kingdew: dying to an effect on the opponent's turn buys the
      // Leader +2000 for that turn.
      //
      // The pairing with its [Blocker] is the whole card: the block invites the
      // removal, and the removal pays for the Leader to survive the next swing.
      // `opponentEffectOnly` is the printed "by an effect" read in the window
      // the clause names -- a battle K.O. is not an effect, and the opponent's
      // turn is the only turn their effects resolve in combat.
      "ST15-003",
      {
        opponentEffectOnly: true,
        program: {
          effect: {
            kind: "choose",
            selector: { player: "self", zone: [], includeLeader: true },
            bind: "st15-kingdew-buff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "st15-kingdew-buff",
              amount: 2_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
  ],
  replacement: [
    [
      // ST15-005 Portgas.D.Ace: once a turn, shrinking by 2000 instead of
      // leaving the field.
      //
      // `removal: "off-field"`, not `"ko"`: the printed words are "removed from
      // the field", which a bounce and a bury answer as well as a K.O. The cost
      // lands on the body being saved, so a second removal the same turn finds
      // a 4000 -- which is what stops the save being free, and why the printed
      // `[Once Per Turn]` is on it as well.
      //
      // Its conditional [Rush] is the card's other half and is continuous, so
      // it is a `StaticAbility` row rather than a program.
      "ST15-005",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        label: "Give it −2000 power instead",
        cost: { kind: "power-penalty", amount: -2_000 },
      },
    ],
  ],
};
