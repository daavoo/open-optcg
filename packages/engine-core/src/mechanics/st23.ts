/**
 * ST-23 "Shanks", the Red Red-Haired Pirates starter deck.
 *
 * Card data for the four ST23 identities nothing else carries lives in
 * `packages/cards/src/generated-community.ts`, stamped by the audit's community
 * pass; the deck's Leader OP09-001 and its nine reprinted slots are OP-09
 * records with their programs in `op09-*.ts`, and ST23-004 arrived earlier
 * with the ST-31 list. Printed text for any card here is
 * `pnpm card:text <CARD>`.
 *
 * Both hand-cost reductions (ST23-001, ST23-002) are continuous text and so are
 * rows in `st23-static.ts`; ST23-001's `[Blocker]` is a printed keyword and so
 * a fact on the record.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { payFromHand } from "./shared.js";
import { type SetMechanics } from "./registry.js";

/** "Your Leader gains +N power" for `expiresAfterTurns` turns. */
const buffLeader = (
  bind: string,
  amount: number,
  expiresAfterTurns: number,
): MechanicEffect => ({
  kind: "select",
  selector: { player: "self", zone: [], includeLeader: true },
  bind,
  count: 1,
  effect: { kind: "modify-power", binding: bind, amount, expiresAfterTurns },
});

export const st23Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST23-002 Shanks: the Leader buff, gated on a {Red-Haired Pirates}
      // Leader or one named Uta -- `any-of`, since either is enough.
      //
      // `expiresAfterTurns: 1` is "until the end of your opponent's next End
      // Phase" counted in player-turns from this one, the reading PRB02-017
      // Hancock's lock takes: the +2000 is a defence for the turn it is the
      // opponent's to attack.
      "ST23-002",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              {
                kind: "leader-has-type",
                player: "self",
                type: "Red-Haired Pirates",
              },
              { kind: "leader-has-name", player: "self", name: "Uta" },
            ],
          },
          then: buffLeader("st23-shanks-leader", 2000, 1),
        },
      },
    ],
    [
      // ST23-003 Benn.Beckman: a hand card paid for a K.O. that only lands
      // behind a {Red-Haired Pirates} Leader.
      //
      // The trash is the cost and the Leader check sits after it, as printed:
      // the card can be paid under any Leader and then does nothing, which is a
      // choice the clause leaves to the player. "Base power" is printed power,
      // which is what `maxPower` reads, so DON!! given to a 3000 body and this
      // turn's boosts do not lift it out of reach.
      "ST23-003",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "st23-beckman-cost",
            1,
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Red-Haired Pirates",
              },
              then: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxPower: 4000,
                },
                bind: "st23-beckman-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "st23-beckman-ko" },
              },
            },
          ),
        },
      },
    ],
  ],
  activateMain: [
    [
      // ST23-004 Monkey.D.Luffy: rest a DON!! and this Character to give up to
      // 1 opposing Character −1000 power this turn.
      //
      // Two costs in one sentence, so two nodes in the sequence before the
      // payoff; `requires` gates both, or the activation is offered to a player
      // who can pay neither.
      "ST23-004",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, activeDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "st23-luffy-debuff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "st23-luffy-debuff",
                    amount: -1000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // ST23-005 Yasopp: once a turn, up to 1 rested DON!! to the Leader or a
      // Character. `restedDon: 1` keeps the offer honest -- with nothing rested
      // the activation would spend the turn's use on no DON!! at all.
      "ST23-005",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: { kind: "give-rested-don", player: "self", count: 1 },
        },
      },
    ],
  ],
};
