/**
 * The two off-set identities the OP-17 Red Ace list reaches for.
 *
 * Card data lives in `packages/cards/src/op16-ace.ts`. One clause each, and
 * between them they are the deck's whole consistency package: everything else
 * in the list is an 8000-power body whose text is already in `op16-*.ts` or
 * `op17-*.ts`.
 */
import { SOURCE_BINDING, type MechanicProgram } from "../mechanics.js";
import { lookAndAdd } from "./shared.js";
import { type SetMechanics } from "./registry.js";

export const op16AceMechanics: SetMechanics = {
  onPlay: [
    [
      // OP13-016 Monkey.D.Garp: "[printed text omitted -- pnpm card:text OP13-016]"
      //
      // `leader-has-name` under `any-of` rather than one entry per name: the
      // three names are a disjunction over one question, and the card is
      // printed for whichever of the three Leaders is playing it. In this list
      // that is always [Portgas.D.Ace], but the clause is implemented as
      // printed -- OP13-004 Sabo fronts two other shipped decks, and a Garp
      // that only answered to Ace would be silently wrong there.
      //
      // "a cost of 3 or more" is `minCost`, which reads the *effective* cost,
      // asked here of a card sitting in the deck: nothing modifies a deck
      // card's cost, so printed and effective agree. The filter is wide on
      // purpose -- every card in this deck but Garp itself and OP13-007 costs 3
      // or more, which is what makes a 1-cost body a four-deep dig for the
      // exact 8000-power Character the turn needs.
      "OP13-016",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              { kind: "leader-has-name", player: "self", name: "Sabo" },
              {
                kind: "leader-has-name",
                player: "self",
                name: "Portgas.D.Ace",
              },
              {
                kind: "leader-has-name",
                player: "self",
                name: "Monkey.D.Luffy",
              },
            ],
          },
          then: lookAndAdd(4, "op13-garp-look", { minCost: 3 }).effect,
        },
      } satisfies MechanicProgram,
    ],
  ],
  activateMain: [
    [
      // OP13-007 Ace & Sabo & Luffy: "[printed text omitted -- pnpm card:text OP13-007]"
      //
      // Two costs joined by "and", so both are paid or neither is, and the
      // `optional` wrapper is the printed "You may". The DON!! is given before
      // the trash so the body is still on the field while it is the thing being
      // paid with.
      //
      // `from: "active"` is what separates this from OP16-021 Moby Dick's "give
      // up to 1 *rested* DON!! card": an active DON!! moved onto a card is
      // still active and still attached, so this is a +1000 power buff that
      // survives to the attack step rather than a rested-DON!! parking spot.
      //
      // `requires: { activeDon: 1 }` because the ability has no
      // `[Once Per Turn]`: without the gate a player at zero active DON!! is
      // offered an activation that resolves to nothing, and a repeatable no-op
      // action is one a rules policy will take forever.
      "OP13-007",
      {
        oncePerTurn: false,
        requires: { activeDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "give-rested-don",
                  player: "self",
                  count: 1,
                  from: "active",
                },
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op13-asl-debuff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op13-asl-debuff",
                    amount: -3000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
};
