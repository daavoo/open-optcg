/**
 * ST-29 `[Main]` programs: the two `[Activate: Main]` DON!! gifts and the one
 * `[Main]` Event.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST29-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { payFromHand } from "./shared.js";

export const st29MainMechanics: SetMechanics = {
  activateMain: [
    [
      // ST29-012 Monkey.D.Luffy: once a turn, a rested DON!! moves onto one of
      // its controller's [Monkey.D.Luffy] cards -- the Leader included.
      //
      // `give-rested-don` rather than `attach-don`, because the printed clause
      // names the Leader as a legal recipient and `attach-don`'s binding lookup
      // only searches the board. `restedDon` on the offer is the whole gate: a
      // player whose DON!! are all active would spend the turn's one use on
      // nothing.
      //
      // A 1-cost 0-power body whose only job is this, which is why the deck
      // runs it at all.
      "ST29-012",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "give-rested-don",
            player: "self",
            count: 1,
            name: "Monkey.D.Luffy",
          },
        },
      },
    ],
    [
      // ST29-014 Roronoa Zoro: a [Trigger] card out of hand buys a card and a
      // rested DON!! onto anything its controller has.
      //
      // `handCardsMatching` on the offer rather than a hand-size floor: a hand
      // of three cards none of which carry a [Trigger] cannot pay, and taking
      // the prompt would spend the `[Once Per Turn]` on a `choose` that finds
      // nothing.
      //
      // The gift reaches the Leader too, so it is `give-rested-don` for the
      // reason ST29-012 above gives. Its printed [Rush: Character] is an
      // unconditional keyword and needs no entry.
      "ST29-014",
      {
        oncePerTurn: true,
        requires: {
          handCardsMatching: { match: { hasTrigger: true }, count: 1 },
          restedDon: 1,
        },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand", hasTrigger: true },
              "st29-zoro-cost",
              1,
              {
                kind: "sequence",
                effects: [
                  { kind: "draw", player: "self", count: 1 },
                  { kind: "give-rested-don", player: "self", count: 1 },
                ],
              },
            ),
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // ST29-016: the Leader attacks unblockable for the turn, but only while
      // it answers to the name the clause gives.
      //
      // `grant-keyword` on a Leader is held on the player rather than on a
      // board card, which is what `leaderUnblockableUntilTurn` is;
      // `expiresAfterTurns: 0` is "during this turn". Its `[Counter]` half is
      // in `st29-battle.ts` -- one card, two windows, two tables.
      "ST29-016",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Monkey.D.Luffy",
            },
            then: {
              kind: "select",
              selector: { player: "self", zone: [], includeLeader: true },
              bind: "st29-kizaru-leader",
              count: 1,
              effect: {
                kind: "grant-keyword",
                binding: "st29-kizaru-leader",
                keyword: "Unblockable",
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
  ],
};
