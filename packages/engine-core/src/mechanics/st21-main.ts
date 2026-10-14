/**
 * ST-21 `[Main]` programs the whole-product import added: one
 * `[Activate: Main]` and one `[Main]` Event.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST21-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { buffOwnCardForTurn } from "./op07-shared.js";

export const st21MainMechanics: SetMechanics = {
  activateMain: [
    [
      // ST21-009 Nami: once a turn, up to two rested DON!! move onto a
      // {Straw Hat Crew} Leader or Character.
      //
      // `give-rested-don` with a `type`, because the Leader is a legal
      // recipient and `attach-don` cannot reach it. `restedDon` on the offer is
      // the whole gate: with every DON!! active the activation would spend the
      // turn's one use and move nothing.
      //
      // Unlike the Leader's own version of this clause it carries no DON!!
      // requirement, which is what makes a 1-cost body worth a slot.
      "ST21-009",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "give-rested-don",
            player: "self",
            count: 2,
            type: "Straw Hat Crew",
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // ST21-016 Gum-Gum Dawn Whip: +1000 for the turn, and a small body loses
      // its [Blocker] for the turn.
      //
      // "Then" opens a second sentence with its own "up to", so the two halves
      // sequence and either can resolve to nothing. `cannot-block` is the
      // printed restriction and is aimed at one Character rather than at the
      // player, which is what separates it from the Leader-wide silencing
      // ST21-003 grants as [Unblockable].
      "ST21-016",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              buffOwnCardForTurn(1_000, "st21-whip-buff"),
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCurrentPower: 4_000,
                },
                bind: "st21-whip-silence",
                min: 0,
                max: 1,
                effect: {
                  kind: "restrict",
                  binding: "st21-whip-silence",
                  restriction: "cannot-block",
                  expiresAfterTurns: 0,
                },
              },
            ],
          },
        },
      },
    ],
  ],
};
