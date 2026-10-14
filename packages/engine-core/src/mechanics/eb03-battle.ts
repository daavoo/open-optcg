/**
 * EB-03's battle-window clauses: its five `[Counter]` Events and the
 * `[When Attacking]` half of EB03-008 Hibari.
 *
 * Four of the five Counters are the format's plain "gains +N power during this
 * battle" behind a gate, which the registry expresses as a number plus a
 * condition rather than as a program -- that is what keeps the attacker's
 * forecast honest, because the offer and the resolution read the same field.
 * See `mechanics/README.md`.
 */
import { type SetMechanics } from "./registry.js";
import { swordAttacksActive } from "./eb03-on-play.js";

export const eb03BattleMechanics: SetMechanics = {
  counterEvent: [
    [
      // EB03-011 "But If We Ever See Each Other Again... Will You Call Me Your
      // Shipmate?!!": "[printed text omitted -- pnpm card:text EB03-011]"
      //
      // +4000 is the biggest Counter Event in the set and the Leader gate is
      // what pays for it. `powerWhen` rather than a program: the answer is
      // known from board state before the offer is made, so a deck led by
      // anyone else reads "adds nothing to this battle" instead of being
      // offered a blank.
      "EB03-011",
      {
        cost: 1,
        power: 4_000,
        powerWhen: {
          kind: "leader-has-name",
          player: "self",
          name: "Nefeltari Vivi",
        },
      },
    ],
    [
      // EB03-020 "There You Are, Sore Loser!": "[printed text omitted -- pnpm card:text EB03-020]"
      //
      // The base +2000 is the registry's number and the conditional second half
      // is a `battle-power` node in the program, which runs after the first
      // lands -- so the two do not double-count. Written this way rather than as
      // a single `powerWhen`-gated 4000 because the printed floor is 2000: the
      // Event is still playable, and still worth playing, with one {FILM} body
      // out.
      "EB03-020",
      {
        cost: 1,
        power: 2_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: { zone: "board", category: "character", type: "FILM" },
              operator: "gte",
              value: 2,
            },
            then: { kind: "battle-power", player: "self", amount: 2_000 },
          },
        },
      },
    ],
    [
      // EB03-029 "Insolent Fool!! Stand Down!!": "[printed text omitted -- pnpm card:text EB03-029]"
      //
      // The buff names a card rather than a side, so it only helps while a
      // [Boa Hancock] is the thing being attacked -- `target` is the same filter
      // the offer reads, which is what stops the summary promising power the
      // resolution will not add. The `[Main]` half is in `eb03-main.ts`.
      "EB03-029",
      { cost: 1, power: 3_000, target: { name: "Boa Hancock" } },
    ],
    [
      // EB03-038 "Thanks for the Treat. ♡": "[printed text omitted -- pnpm card:text EB03-038]"
      "EB03-038",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // EB03-049 "I Knew You People Were Behind This.": "[printed text omitted -- pnpm card:text EB03-049]"
      "EB03-049",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
  ],
  whenAttacking: [
    [
      // EB03-008 Hibari: "[printed text omitted -- pnpm card:text EB03-008]"
      //
      // The `[On Play]`/`[When Attacking]` pair is one printed clause, so both
      // registries take the same fragment -- see `eb03-on-play.ts`. Its value on
      // this timing is different from the other: the permission arrives while
      // Hibari's own side is already attacking, so it retargets a swing that
      // has not been declared yet rather than setting up next turn.
      "EB03-008",
      swordAttacksActive,
    ],
  ],
};
