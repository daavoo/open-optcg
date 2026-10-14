/**
 * ST-30 `[On Play]` and `[On K.O.]` programs.
 *
 * The starter is 17 cards and splits the same way the main sets do, by the
 * timing window a clause fires in: this file, `st30-main.ts`,
 * `st30-battle.ts`, `st30-triggers.ts` and `st30-replacements.ts`. Three of
 * its identities were in the pool before the product was, played by lists the
 * community pass reads: ST30-001's Leader is two rows in
 * `../static-abilities.ts`, and ST30-012 and ST30-014 are in
 * `op17-luffy-ace.ts` and `st-main.ts`. Nothing here re-registers them. See
 * `mechanics/README.md`.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST30-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { payFromHand } from "./shared.js";
import {
  digForSixThousand,
  restDonForRush,
  sixThousandBody,
} from "./st30-shared.js";

export const st30OnPlayMechanics: SetMechanics = {
  onPlay: [
    // ST30-002 Inazuma: a 1-cost body that digs five deep for one of the
    // product's 6000s. The same program its `[Main]` Event prints.
    ["ST30-002", digForSixThousand("st30-inazuma")],
    [
      // ST30-004 Emporio.Ivankov: show two 6000s and the hand turns over three
      // for two.
      //
      // The cards are revealed, not spent, so the cost is a `choose` that
      // leaves them in hand -- and the payout is nested inside it, because a
      // `choose` whose zone cannot fill its `min` is skipped and the queue
      // continues, which would hand three cards to a player who showed
      // nothing.
      //
      // Net +1 on the hand, and the two trashed are chosen after the draw, so
      // the cards that go are the ones the deck did not want.
      "ST30-004",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { ...sixThousandBody, player: "self", zone: "hand" },
            bind: "st30-ivankov-reveal",
            min: 2,
            max: 2,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "reveal", binding: "st30-ivankov-reveal" },
                { kind: "draw", player: "self", count: 3 },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "st30-ivankov-trash",
                  min: 2,
                  max: 2,
                  effect: {
                    kind: "move",
                    binding: "st30-ivankov-trash",
                    to: { player: "self", zone: "trash" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // ST30-006 Jinbe: one of the 6000s out of hand buys two cards.
      //
      // A real cost, so the whole clause is `optional`: a hand with no spare
      // 6000 declines rather than being asked to pay what it has not got.
      "ST30-006",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { ...sixThousandBody, player: "self", zone: "hand" },
            "st30-jinbe-cost",
            1,
            { kind: "draw", player: "self", count: 2 },
          ),
        },
      },
    ],
    // ST30-007 Portgas.D.Ace pays a rested DON!! for [Rush]; the fragment is in
    // `st30-shared.ts`, and its `[When Attacking]` half is in `st30-battle.ts`.
    ["ST30-007", { effect: restDonForRush }],
    [
      // ST30-010 Crocodile: a 6-cost [Blocker] that holds an already-rested
      // body down through the opponent's Refresh Phase.
      //
      // `rested: true` rather than the `canRest` a "rest up to 1" clause
      // filters on: this rests nothing itself, it keeps down a body the deck's
      // own attacks have already turned over. `cannot-refresh` at
      // `expiresAfterTurns: 1` is how the pool writes that duration.
      //
      // No cost ceiling at all, unlike the Green rest-lock package this shares
      // a node with -- the printed clause names any rested Character.
      "ST30-010",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
          },
          bind: "st30-crocodile-lock",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "st30-crocodile-lock",
            restriction: "cannot-refresh",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
  ],
  onKo: [
    [
      // ST30-008 Marco: dying is not the end while the hand still holds a
      // 6000.
      //
      // Rested, so the body that comes back cannot block again this turn --
      // which is the price of a [Blocker] that answers its own removal. The
      // play is nested inside the `choose` that pays for it, for the reason
      // `payFromHand` gives.
      //
      // `play` on `SOURCE_BINDING` reaches the card wherever the K.O. left it,
      // which is its controller's trash.
      "ST30-008",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { ...sixThousandBody, player: "self", zone: "hand" },
            "st30-marco-cost",
            1,
            { kind: "play", binding: SOURCE_BINDING, rested: true },
          ),
        },
      },
    ],
  ],
};
