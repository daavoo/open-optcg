/**
 * ST-22 `[On Play]` programs.
 *
 * The starter is 17 cards and splits the same way the main sets do, by the
 * timing window a clause fires in: this file, `st22-main.ts`,
 * `st22-battle.ts` and `st22-triggers.ts`. Two of the product's clauses are
 * replacements with no window to fire in, in `st22-replacements.ts`. See
 * `mechanics/README.md`.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST22-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { revealTwoWhitebeard } from "./op08-shared.js";
import { lookAndAdd } from "./shared.js";
import { revealTopWhitebeard } from "./st22-shared.js";

export const st22OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // ST22-002 Izo: five deep for any {Whitebeard Pirates} card but another
      // Izo. The card added is any category -- the deck's Events carry the type
      // too. Its `[On Your Opponent's Attack]` is in `st22-battle.ts`.
      "ST22-002",
      lookAndAdd(5, "st22-izo", {
        typeIncluding: "Whitebeard Pirates",
        excludeName: "Izo",
      }),
    ],
    [
      // ST22-003 Edward.Newgate: two cards when the top of the deck is on-type.
      // The revealed card stays on top, so a hit draws it. [Double Attack] is
      // a printed keyword the battle rules read from the record.
      "ST22-003",
      {
        effect: revealTopWhitebeard("st22-newgate-top", {
          kind: "draw",
          player: "self",
          count: 2,
        }),
      },
    ],
    [
      // ST22-006 Jozu: the same reveal, paying out two cards and one back. The
      // discard is part of the payout, so a miss keeps the hand whole.
      "ST22-006",
      {
        effect: revealTopWhitebeard("st22-jozu-top", {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "st22-jozu-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "st22-jozu-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        }),
      },
    ],
    [
      // ST22-011 Whitey Bay: two on-type cards shown from hand for +2000 on a
      // {Whitebeard Pirates} Leader this turn.
      //
      // The [Your Turn] marker is a real gate: a Character played off a
      // [Trigger] arrives on the opponent's turn, and then this resolves to
      // nothing. The Leader filter is printed on the recipient, not as a
      // condition on the clause, so the reveal can be paid behind another
      // Leader and buy nothing -- which is why it is a "you may".
      "ST22-011",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: revealTwoWhitebeard("st22-whitey-reveal", {
            kind: "select",
            selector: {
              player: "self",
              zone: [],
              includeLeader: true,
              typeIncluding: "Whitebeard Pirates",
            },
            bind: "st22-whitey-buff",
            count: 1,
            effect: {
              kind: "modify-power",
              binding: "st22-whitey-buff",
              amount: 2_000,
              expiresAfterTurns: 0,
            },
          }),
        },
      },
    ],
  ],
};
