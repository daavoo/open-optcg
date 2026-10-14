/**
 * ST21 cards used by the format decks.
 *
 * Card data for these identities lives in `packages/cards/src/st21-cards.ts`.
 */
import { type SetMechanics } from "./registry.js";

export const st21Mechanics: SetMechanics = {
  activateMain: [
    [
      // ST21-001 Monkey.D.Luffy (Leader): `pnpm card:text ST21-001`.
      //
      // Migrated off the hand-written activation register. `[DON!! x1]` is
      // `source-attached-don`, which reads the Leader's own pile -- `givenDon`
      // in `requires` counts the whole board's DON!! and would answer yes to a
      // Leader with none.
      //
      // "1 of your Characters", so a `choose` feeding `attach-don` rather than
      // `give-rested-don`, whose offer would include the Leader.
      //
      // The register offered a separate action per DON!! count, 1 or 2. That
      // choice is gone, and taking the maximum is what remains: rested DON!!
      // cannot be spent this turn, so moving both onto a Character is never
      // worse than moving one, and `attach-don` already gives what the pile
      // holds when it holds less than the count.
      "ST21-001",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "source-attached-don",
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
              },
              bind: "st21-luffy-gift",
              min: 0,
              max: 1,
              effect: {
                kind: "attach-don",
                player: "self",
                from: "rested",
                count: 2,
                target: { binding: "st21-luffy-gift" },
              },
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // ST21-014 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text ST21-014]"
      //
      // The `give-rested-don` node: the target choice -- Leader or any Character
      // -- suspends, and declining resolves to nothing. A [When Attacking] fires
      // whether or not its controller wants the gift, but with no rested DON!!
      // the node offers no choice at all, which is the "up to" doing its job.
      "ST21-014",
      {
        effect: {
          kind: "give-rested-don",
          player: "self",
          count: 1,
        },
      },
    ],
  ],
  onPlay: [
    [
      // ST21-003 Sanji: "[printed text omitted -- pnpm card:text ST21-003]"
      //
      // Modelled as [Unblockable] for the turn, exactly like OP12-077: the
      // engine's only consumer of either is the Blocker step, and no line of
      // play distinguishes the two phrasings.
      "ST21-003",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "Straw Hat Crew",
            minCurrentPower: 6_000,
          },
          bind: "st21-003-silencing-target",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "st21-003-silencing-target",
            keyword: "Unblockable",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
  ],
  onKo: [
    [
      // ST21-015 Roronoa Zoro: "[printed text omitted -- pnpm card:text ST21-015]"
      //
      // Read from the hand, so `maxPower` (printed power) is the right bound --
      // hand cards carry no modifiers -- matching EB03-053 Nami's identical
      // 6000-power-or-less hand play. The `color` and `excludeName` filters
      // follow the printed text exactly; "up to 1" is the `min: 0, max: 1`
      // choice, so declining and no eligible target both resolve to nothing.
      "ST21-015",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            color: "Red",
            maxPower: 6000,
            excludeName: "Roronoa Zoro",
          },
          bind: "st21-015-free-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "st21-015-free-play" },
        },
      },
    ],
  ],
};
