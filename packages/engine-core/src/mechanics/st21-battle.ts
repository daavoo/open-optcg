/**
 * ST-21 `[When Attacking]` programs the whole-product import added.
 *
 * `st21.ts` holds the identities that were in the pool before the product was,
 * played by the format decks that ship them -- ST21-001, ST21-003, ST21-014 and
 * ST21-015, plus ST21-017 in `op17-luffy-ace.ts`. Nothing here re-registers
 * them, the same split every earlier whole-product import kept. See
 * `mechanics/README.md`.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST21-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { koPowerAtMost } from "./st21-shared.js";

export const st21BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // ST21-010 Nico Robin: with two DON!! on it, the swing K.O.s anything at
      // 4000 power or less.
      //
      // `[DON!! x2]` is an `if` on `source-attached-don`, which is how the pool
      // expresses the printed marker. The two DON!! are usually the ones this
      // Character is attacking with, so the clause is the reason to point them
      // here rather than at the Leader.
      "ST21-010",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "source-attached-don",
            operator: "gte",
            value: 2,
          },
          then: koPowerAtMost(4_000, "st21-robin-ko"),
        },
      },
    ],
    [
      // ST21-012 Brook: the swing moves up to two rested DON!! onto the Leader
      // or a Character.
      //
      // `give-rested-don` rather than `attach-don`, because the printed clause
      // names the Leader as a legal recipient and `attach-don`'s binding lookup
      // only reaches the board. Two rather than ST21-014's one, and with no
      // DON!! gate of its own -- which is what makes this the product's engine
      // rather than a bonus on a [Rush] body.
      "ST21-012",
      { effect: { kind: "give-rested-don", player: "self", count: 2 } },
    ],
  ],
};
