/**
 * EB-05 `[On Play]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type SetMechanics } from "./registry.js";
import { donMinus, drawAndDiscard, lookAndAdd, payFromHand } from "./shared.js";

export const eb05OnPlayMechanics: SetMechanics = {
  onPlay: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-021 Alvida. Printed text: `pnpm card:text EB05-021`.
      //
      // Three steps in printed order, and the lock is last on purpose: the
      // free play happens first, so the ban cannot stop it, and the ban is
      // written before any [On Play] of the played card resolves -- that
      // card's own clause waits for this program to finish, which is Bandai's
      // EB05-021#1 ruling (ST25-003's free play finds the ban already up).
      // `maxCost` rather than the printed cost, because a discount the board
      // is applying is real and the free play is the payoff.
      "EB05-021",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                type: "Cross Guild",
                maxCost: 8,
              },
              bind: "eb05-021-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb05-021-play" },
            },
            {
              kind: "restrict-player",
              player: "self",
              restriction: "cannot-play-characters",
              expiresAfterTurns: 0,
            },
          ],
        },
      },
    ],
    [
      // EB05-023 Osome. Printed text: `pnpm card:text EB05-023`.
      //
      // The two Events are a cost, so the draw is nested inside the cost's
      // `choose` (`payFromHand`): a hand with one Event cannot pay, and the
      // draw is then unreachable rather than free.
      "EB05-023",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand", category: "event" },
            "eb05-023-cost",
            2,
            { kind: "draw", player: "self", count: 3 },
          ),
        },
      },
    ],
    [
      // EB05-025 Domino. Printed text: `pnpm card:text EB05-025`.
      //
      // The house look-three shape. The same program is the card's
      // `[Trigger]` in `eb05-triggers.ts`, which prints only "activate this
      // card's [On Play]".
      "EB05-025",
      lookAndAdd(3, "eb05-025-look", { type: "Impel Down" }),
    ],
    [
      // EB05-027 Hibari. Printed text: `pnpm card:text EB05-027`.
      //
      // The refill is mandatory and comes first, then the bury. The bury
      // names no side, so `player: "either"` and `to.player: "owner"`: a
      // small Character of this player's own is a legal answer, and it goes
      // under its owner's deck rather than this player's.
      "EB05-027",
      {
        effect: {
          kind: "sequence",
          effects: [
            drawAndDiscard(3, 2, "eb05-027-trash"),
            {
              kind: "choose",
              selector: {
                player: "either",
                zone: "board",
                category: "character",
                maxCost: 2,
              },
              bind: "eb05-027-bury",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb05-027-bury",
                to: { player: "owner", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // EB05-028 Boa Hancock. Printed text: `pnpm card:text EB05-028`.
      //
      // The opponent trashes, so the opponent picks (`chooser`) -- Bandai's
      // EB05-028#1 ruling, and the rule for anything leaving a hand. Exactly
      // four: the gate guarantees nine cards behind the pick, so `min` and
      // `max` agree.
      "EB05-028",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "hand",
            operator: "gte",
            value: 9,
          },
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            chooser: "opponent",
            bind: "eb05-028-discard",
            min: 4,
            max: 4,
            effect: {
              kind: "move",
              binding: "eb05-028-discard",
              to: { player: "owner", zone: "trash" },
            },
          },
        },
      },
    ],
    [
      // EB05-031 Vinsmoke Reiju. Printed text: `pnpm card:text EB05-031`.
      //
      // `DON!! −1` is the cost and the Leader gate is read after it, in
      // printed order: a Purple deck can want the return for its own sake,
      // so paying under the wrong Leader is a legal (if empty) line. The mill
      // is mandatory once the gate holds.
      "EB05-031",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "The Vinsmoke Family",
          },
          then: { kind: "trash-top", player: "self", count: 10 },
        }),
      },
    ],
    [
      // EB05-033 Nico Robin. Printed text: `pnpm card:text EB05-033`.
      //
      // One condition over the whole clause, "Then" sentence included --
      // Bandai's EB05-033#1 ruling: a failed gate adds no DON!! either.
      // `field-don-versus` with `by: 6` is "at least 6 fewer than the
      // opponent". The DON!! go in rested and "up to 4" is however many the
      // DON!! deck still holds.
      "EB05-033",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "leader-has-type",
                player: "self",
                type: "Straw Hat Crew",
              },
              {
                kind: "field-don-versus",
                player: "self",
                operator: "lt",
                by: 6,
              },
            ],
          },
          then: {
            kind: "sequence",
            effects: [
              drawAndDiscard(3, 2, "eb05-033-trash"),
              { kind: "add-don", player: "self", count: 4, rested: true },
            ],
          },
        },
      },
    ],
    [
      // EB05-034 Sugar. Printed text: `pnpm card:text EB05-034`.
      //
      // The DON!! count is read inside `donMinus`, after the two DON!! have
      // gone back -- Bandai's EB05-034#1 ruling: seven or eight on the field
      // before paying is six or fewer after, and the debuff does not happen.
      "EB05-034",
      {
        effect: donMinus(2, {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 7,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "eb05-034-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "eb05-034-debuff",
              amount: -4_000,
              expiresAfterTurns: 0,
            },
          },
        }),
      },
    ],
    [
      // EB05-035 Speed. Printed text: `pnpm card:text EB05-035`.
      //
      // Both halves sit behind the one `DON!! −1`: the dig finds up to two
      // {SMILE} cards, and the play that follows reads the hand the dig
      // produced, so a card found here can be played in the same clause.
      // `maxPower` is base power, which is what a card in hand has.
      "EB05-035",
      {
        effect: donMinus(1, {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "eb05-035-look", { type: "SMILE" }, 2).effect,
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                type: "SMILE",
                maxPower: 5_000,
              },
              bind: "eb05-035-play",
              min: 0,
              max: 2,
              effect: { kind: "play", binding: "eb05-035-play" },
            },
          ],
        }),
      },
    ],
    [
      // EB05-036 Tsuru. Printed text: `pnpm card:text EB05-036`.
      //
      // Both payouts behind the {Navy} gate; the DON!! comes in rested, so it
      // is ramp for next turn and not a play this turn.
      "EB05-036",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-has-type", player: "self", type: "Navy" },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              { kind: "add-don", player: "self", count: 1, rested: true },
            ],
          },
        },
      },
    ],
    [
      // EB05-037 Black Maria. Printed text: `pnpm card:text EB05-037`.
      "EB05-037",
      lookAndAdd(3, "eb05-037-look", { type: "Animal Kingdom Pirates" }),
    ],
    [
      // EB05-038 Russian. Printed text: `pnpm card:text EB05-038`.
      //
      // "Your [Senor Pink] cards" reaches the Leader as well as the board, so
      // `includeLeader`; `name` reads the derived identity, so an alias
      // answers too.
      "EB05-038",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
            name: "Senor Pink",
          },
          bind: "eb05-038-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "eb05-038-buff",
            amount: 3_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
