/**
 * ST-22 battle-window programs: one `[On Your Opponent's Attack]`, one
 * `[When Attacking]` and one `[Counter]` Event.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST22-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { drawThenBottom } from "./op05-on-play.js";
import { type SetMechanics } from "./registry.js";
import { revealTopWhitebeard } from "./st22-shared.js";

export const st22BattleMechanics: SetMechanics = {
  onOpponentAttack: [
    [
      // ST22-002 Izo: the body itself pays for a filter -- a card drawn and one
      // put under the deck. No `[Once Per Turn]` and none needed: the cost is
      // the Character, so it is once per copy by construction.
      //
      // `trashedNotKoed`, because the printed word is trash: a cost paid with
      // the source's own body is not a K.O.
      "ST22-002",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                  trashedNotKoed: true,
                },
                drawThenBottom(1, "st22-izo-bottom"),
              ],
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // ST22-012 Marco: a hit on the top of the deck is +1000 that outlasts
      // the attack -- it holds through the opponent's next turn, so the body
      // that swung defends at 6000. Its K.O. replacement is in
      // `st22-replacements.ts`.
      "ST22-012",
      {
        effect: revealTopWhitebeard("st22-marco-top", {
          kind: "modify-power",
          binding: SOURCE_BINDING,
          amount: 1_000,
          expiresAfterTurns: 1,
        }),
      },
    ],
  ],
  counterEvent: [
    [
      // ST22-016 Take That Back!!: +4000 on a top-of-deck hit.
      //
      // `power: 0` with the buff in the program, because the payout hangs on a
      // card nobody has seen yet -- a fixed number would promise the defender
      // power a miss will not deliver. Its `[Trigger]` is in
      // `st22-triggers.ts`.
      "ST22-016",
      {
        cost: 1,
        power: 0,
        program: {
          effect: revealTopWhitebeard("st22-take-back-top", {
            kind: "battle-power",
            player: "self",
            amount: 4_000,
          }),
        },
      },
    ],
  ],
};
