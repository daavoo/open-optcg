/**
 * ST-10 `[On Play]` programs.
 *
 * The Ultra Deck is 17 cards and splits the same way the main sets do, by the
 * timing window a clause fires in: this file, `st10-main.ts`, `st10-battle.ts`
 * and `st10-triggers.ts`. See `mechanics/README.md`.
 *
 * One identity was in the pool before the product was: ST10-010 Trafalgar Law,
 * whose `[On Play]` is in `op12-rosinante.ts` because that is the deck that
 * plays it. Nothing here re-registers it. Four more of the set's clauses have
 * no printed timing marker at all and are `ReactionRule`s in
 * `../card-mechanics.ts`, and one is a row in `../static-abilities.ts`.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST10-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { bepoRamp, kidLeaderBuff, rampActive } from "./st10-shared.js";

export const st10OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // ST10-004 Sanji: a 6-cost 6000 that arrives able to attack, but only
      // while the opponent already has a body worth hitting.
      //
      // `minCurrentPower` rather than `minPower`: the clause reads the board,
      // where a Character's DON!! and this turn's modifiers are part of what it
      // has. A 5000 printed body carrying a DON!! satisfies it, and so does a
      // 6000 one that has been debuffed below the line -- in the other
      // direction -- which is what "has a Character with 5000 or more power"
      // means once the game has started.
      //
      // `expiresAfterTurns: 0` is "during this turn": the grant is spent on
      // the attack it buys and nothing carries over.
      "ST10-004",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "opponent",
            selector: {
              zone: "board",
              category: "character",
              minCurrentPower: 5_000,
            },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "grant-keyword",
            binding: SOURCE_BINDING,
            keyword: "Rush",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // ST10-008 Shachi & Penguin: two rested DON!! out of the DON!! deck,
      // but only from behind.
      //
      // The ceiling is on the whole cost area rather than on active DON!!: the
      // clause is a catch-up rule for a deck that has spent its turn, and a
      // player sitting on four rested DON!! is not behind. Rested, so the pair
      // is next turn's -- which is what makes a 4-cost body worth two DON!!.
      "ST10-008",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "lte",
            value: 3,
          },
          then: { kind: "add-don", player: "self", count: 2, rested: true },
        },
      },
    ],
    [
      // ST10-009 Jean Bart: rest one DON!! in the cost area to take a fresh
      // active one out of the DON!! deck.
      //
      // A net-zero trade this turn and a net gain next turn, so the whole
      // clause is `optional`: the cost is real, and a player who would rather
      // keep the DON!! active for a Counter declines it. `rest-don` is the
      // printed ➀ cost and takes an active DON!! out of the cost area without
      // it leaving the field, which is what separates it from `DON!! −N`.
      "ST10-009",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                rampActive,
              ],
            },
          },
        },
      },
    ],
    // ST10-012 Bepo and ST10-013 Eustass"Captain"Kid print one clause for two
    // windows, so the programs live in `st10-shared.ts` and are registered
    // from here and from `st10-battle.ts` alike.
    ["ST10-012", bepoRamp],
    ["ST10-013", kidLeaderBuff],
  ],
};
