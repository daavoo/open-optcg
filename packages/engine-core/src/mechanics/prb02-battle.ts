/**
 * PRB-02 `[When Attacking]` and `[On Your Opponent's Attack]` programs.
 *
 * The battle half of the set's clauses; the `[On Play]`s are in
 * `prb02-on-play.ts`, the `[Trigger]`s in `prb02-triggers.ts` and the
 * replacements in `prb02-replacements.ts`. See `mechanics/README.md`.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";

export const prb02BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // PRB02-001 Koby: "[When Attacking] K.O. up to 1 of your opponent's
      // Characters with 3000 base power or less. Then, if you have 6 or less
      // cards in your hand, draw 1 card."
      //
      // "base power" is the printed number, so `maxPower` rather than
      // `maxCurrentPower`: a 2000 body handed +2000 for the turn is still a
      // legal target, which is the whole reason the text says "base".
      //
      // The draw is not inside the K.O.'s `choose`: "Then" starts a new
      // sentence with its own condition, so a player who declines the K.O. --
      // or has nothing to K.O. -- still draws on a small enough hand.
      "PRB02-001",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxPower: 3_000,
              },
              bind: "prb02-koby-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "prb02-koby-ko" },
            },
            {
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
          ],
        },
      },
    ],
    [
      // PRB02-002 Trafalgar Law: "[When Attacking] Give up to 1 of your
      // opponent's Characters −2000 power during this turn."
      //
      // `expiresAfterTurns: 0` is "during this turn": the debuff is gone before
      // the opponent's own turn starts, so it cannot be banked against their
      // next attack.
      "PRB02-002",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "prb02-law-debuff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "prb02-law-debuff",
            amount: -2_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // PRB02-007 Jinbe: "[When Attacking] Place up to 1 Character with a cost
      // of 1 or less at the bottom of the owner's deck."
      //
      // `player: "either"` because the printed text names no side: the clause
      // reaches the controller's own 1-drops as well as the opponent's, which
      // is a real choice on a board where a small body is worth recycling. The
      // companion is `to.player: "owner"` -- a Character taken from either side
      // goes to *its* owner's deck, not the source player's.
      "PRB02-007",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 1,
          },
          bind: "prb02-jinbe-bounce",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "prb02-jinbe-bounce",
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
  ],
  whenRested: [
    [
      // PRB02-009 Mr.3(Galdino): rested by an opposing effect, it may leave
      // for two cards. The printed clause has no timing bracket -- it names
      // its own window -- and that window is the one this table opens. Any
      // opposing effect counts, Leader and Event included, hence the wider
      // `opponent-effect` source rather than Buffalo's Character-only one; a
      // rest it pays itself, to attack or to block, is not an effect at all.
      // Both turns: an opposing Counter can rest it on its controller's turn.
      "PRB02-009",
      {
        yourTurnOnly: false,
        source: "opponent-effect",
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "owner", zone: "trash" },
                },
                { kind: "draw", player: "self", count: 2 },
              ],
            },
          },
        },
      },
    ],
    [
      // PRB02-006 Roronoa Zoro: "[Opponent's Turn] If this Character would be
      // rested by your opponent's Character's effect, you may rest 1 of your
      // other Characters instead."
      //
      // A replacement in wording, and the replacement registry cannot carry it:
      // that table answers a card being *removed* -- `removal` is "ko" or
      // "off-field" -- and nothing in it reaches a rest. The `whenRested` table
      // is the one window the rules engine opens on this event, and it already
      // carries the exact filter the printed sentence needs:
      // `source: "opponent-character-effect"` excludes the controller's own
      // effects and an opposing *Leader* or Event, which is what "your
      // opponent's Character's effect" names.
      //
      // So the clause is written as an undo: the rest lands, and taking the
      // offer sets this Character active again and rests another in its place.
      // The board a player can see and act on afterwards is the board the
      // printed "instead" describes. What it is not is a true replacement --
      // for the width of this program the Character is rested -- and moving it
      // would mean giving `eligibleReplacements` a rest cause and a prompt at
      // the `rest` node, which is the change to make if a second card ever
      // prints this.
      //
      // `yourTurnOnly: false` admits both turns and the `turn-player` gate
      // narrows it to the opponent's, because `[Opponent's Turn]` has no field
      // of its own here: an opposing Character's Counter can rest a Character
      // on its controller's own turn, and this clause does not answer that.
      //
      // `excludeSource` is "1 of your *other* Characters": without it Zoro
      // would be offered as his own replacement, which pays nothing.
      "PRB02-006",
      {
        yourTurnOnly: false,
        source: "opponent-character-effect",
        program: {
          effect: {
            kind: "if",
            condition: { kind: "turn-player", player: "opponent" },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  excludeSource: true,
                  rested: false,
                },
                bind: "prb02-zoro-instead",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "rest", binding: "prb02-zoro-instead" },
                    {
                      kind: "update",
                      binding: SOURCE_BINDING,
                      rested: false,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // PRB02-004 Jewelry Bonney: "[On Your Opponent's Attack] [Once Per Turn]
      // Set up to 1 of your DON!! cards as active."
      //
      // No `requires`: the clause costs nothing, so there is no payment an
      // offer could be gated on. `activate-don` is already "up to" -- a
      // defender with no rested DON!! sets none rather than erroring -- so the
      // printed "up to 1" needs no wrapper of its own.
      //
      // The DON!! this hands back is Counter money: it arrives inside the
      // opponent's attack, before the Counter step.
      "PRB02-004",
      {
        oncePerTurn: true,
        program: {
          effect: { kind: "activate-don", player: "self", count: 1 },
        },
      },
    ],
  ],
};
