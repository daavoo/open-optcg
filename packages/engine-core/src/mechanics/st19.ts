/**
 * ST-19's five-card Black {Navy} supplement.
 *
 * Comments paraphrase what each clause has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content (`pnpm card:text
 * ST19-0xx` prints it from the local cache).
 *
 * The product is one idea printed five ways: every clause here is bought with
 * a card the deck already has somewhere it cannot use it. Two pay out of hand,
 * two pay out of the trash, and the fifth pays with having been played this
 * turn. ST19-004's `[DON!! x1] [Opponent's Turn]` +4 cost is continuous and is
 * a `StaticAbility` row rather than a program.
 */
import { type MechanicEffect, type MechanicCondition } from "../mechanics.js";
import { costDebuff } from "./op08-shared.js";
import { type SetMechanics } from "./registry.js";

const NAVY = "Navy";

/** "1 black {Navy} type card" in hand, as the cost's selector. */
const blackNavyInHand = {
  player: "self",
  zone: "hand",
  color: "Black",
  type: NAVY,
} as const;

/** How many of those the hand holds, for the gate that withholds the offer. */
const blackNavyInHandAtLeast = (count: number): MechanicCondition => ({
  kind: "selector-count",
  player: "self",
  selector: { zone: "hand", color: "Black", type: NAVY },
  operator: "gte",
  value: count,
});

/**
 * "You may place 1 card from your trash at the bottom of your deck: <effect>"
 * -- the activation ST19-004 and ST19-005 share at different payouts.
 *
 * The bottom of the deck, not the top: the card is not coming back this game in
 * any deck that does not deck out, so the cost is the card and nothing else.
 * The gate is outermost so a player with an empty trash is never offered the
 * activation at all, rather than offered it and asked to pay from nothing.
 */
const payFromTrash = (
  bind: string,
  payoff: MechanicEffect,
): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "zone-count",
    player: "self",
    zone: "trash",
    operator: "gte",
    value: 1,
  },
  then: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: { player: "self", zone: "trash" },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [
          {
            kind: "move",
            binding: bind,
            to: { player: "self", zone: "deck", position: "bottom" },
          },
          payoff,
        ],
      },
    },
  },
});

export const st19Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST19-001 Smoker: a card out of hand locks two small bodies out of
      // attacking for a full round.
      //
      // `expiresAfterTurns: 1` is the printed "until the end of your opponent's
      // next turn": the lock has to survive this turn and the whole of theirs,
      // which is what makes it a tempo play rather than a combat trick. Two
      // targets from one payment, and `min: 0` on the choose because the text
      // says "up to".
      //
      // The cost names a colour as well as a type. In this deck they coincide,
      // but the filter is what the card prints, and an off-colour {Navy} card
      // cannot pay it.
      "ST19-001",
      {
        effect: {
          kind: "if",
          condition: blackNavyInHandAtLeast(1),
          then: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: blackNavyInHand,
              bind: "st19-smoker-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st19-smoker-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxCost: 4,
                    },
                    bind: "st19-smoker-lock",
                    min: 0,
                    max: 2,
                    effect: {
                      kind: "restrict",
                      binding: "st19-smoker-lock",
                      restriction: "cannot-attack",
                      expiresAfterTurns: 1,
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // ST19-002 Sengoku: two cards out of hand for three off the top.
      //
      // Net plus one card for one DON!!, and the cost is what keeps it honest:
      // the two cards must both be black {Navy}, which in practice means the
      // deck's own bodies, so the refill is paid for with the board it is not
      // building. The Leader gate is on the draw alone, exactly where the
      // printed "If" sits -- the cards are trashed either way.
      "ST19-002",
      {
        effect: {
          kind: "if",
          condition: blackNavyInHandAtLeast(2),
          then: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: blackNavyInHand,
              bind: "st19-sengoku-cost",
              min: 2,
              max: 2,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st19-sengoku-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "if",
                    condition: {
                      kind: "leader-has-type",
                      player: "self",
                      type: NAVY,
                    },
                    then: { kind: "draw", player: "self", count: 3 },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // ST19-003 Tashigi: −4 cost on an opposing body for the turn, behind the
      // named Leader.
      //
      // The number is the largest cost debuff the deck prints and it is aimed
      // at its own second clause: a 4-cost dropped to 0 is exactly what the
      // activation below can trash. Both halves are on one card on purpose, so
      // the removal needs no second body -- and both are spent on the turn this
      // one arrives.
      "ST19-003",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Smoker",
          },
          then: costDebuff(4, "st19-tashigi-debuff"),
        },
      },
    ],
  ],
  activateMain: [
    [
      // ST19-003 Tashigi: on the turn it lands, a cost-0 body goes to the
      // trash.
      //
      // A `move` to the owner's trash, not a `knock-out`: the printed word is
      // trash, and the pool spells the two differently -- OP09-009 Benn.Beckman
      // is the same sentence and is written the same way.
      //
      // "a cost of 0" is effective cost, which is what makes the clause reach
      // anything at all: almost nothing is printed at 0, and the card that gets
      // a body there is this one's own [On Play]. `source-played-this-turn` is
      // the printed window, so the pair fires once, on arrival, and the body is
      // a 6000 afterwards.
      "ST19-003",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: { kind: "source-played-this-turn" },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 0,
              },
              bind: "st19-tashigi-trash",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "st19-tashigi-trash",
                to: { player: "owner", zone: "trash" },
              },
            },
          },
        },
      },
    ],
    [
      // ST19-004 Hina: a card out of the trash buys a rested DON!! every turn.
      //
      // `give-rested-don` rather than `attach-don`, because the Leader is one of
      // the printed recipients and `attach-don` reaches only a board Character.
      // Repeatable across turns rather than within one -- the printed
      // `[Once Per Turn]` -- so the trash empties slowly and the DON!! keeps
      // arriving. Its continuous half, +4 cost on the opponent's turn with a
      // DON!! on it, is a `StaticAbility` row: that is what makes this 6000
      // awkward to remove on the turn it matters.
      "ST19-004",
      {
        oncePerTurn: true,
        program: {
          effect: payFromTrash("st19-hina-cost", {
            kind: "give-rested-don",
            player: "self",
            count: 1,
          }),
        },
      },
    ],
    [
      // ST19-005 Monkey.D.Garp: the same trash payment, for −1 cost on an
      // opposing body for the turn.
      //
      // One cost is small on its own and the reason it is worth a card is the
      // rest of the list: ST19-003's activation reads a cost of 0, and Hina and
      // Garp together are two of them a turn. The printed [Blocker] is derived
      // from the keyword and needs no program.
      "ST19-005",
      {
        oncePerTurn: true,
        program: {
          effect: payFromTrash(
            "st19-garp-cost",
            costDebuff(1, "st19-garp-debuff"),
          ),
        },
      },
    ],
  ],
};
