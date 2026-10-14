/**
 * ST-18 "Monkey.D.Luffy", the Purple Land of Wano starter deck.
 *
 * Card data for the five ST18 identities and the P-041 promo the product ships
 * with lives in `packages/cards/src/generated-community.ts`, stamped by the
 * audit's community pass; the deck's Leader and its eight reprinted slots are
 * OP-05 records and their programs live in `op05-*.ts`. Printed text for any
 * card here is `pnpm card:text <CARD>`.
 *
 * Three of the four declarative cards gate on "8 or more DON!! cards on your
 * field", which is the whole shape of the deck: an OP05-060 Leader that costs
 * DON!! to use and a curve built to still be holding eight when the payoffs
 * land. The number is the *field* count, not the active one, so a turn that
 * has already spent every DON!! on attacks still turns them on.
 *
 * ST18-002's `[Blocker]` is a printed keyword and so is a fact on the record
 * rather than a program; P-041 prints no effect at all.
 */
import { type MechanicEffect, type MechanicCondition } from "../mechanics.js";
import { donMinus, lookAndAdd } from "./shared.js";
import { type SetMechanics } from "./registry.js";

/** "If you have 8 or more DON!! cards on your field" -- ST18-001/002/003. */
const eightDon: MechanicCondition = {
  kind: "field-don",
  player: "self",
  operator: "gte",
  value: 8,
};

/**
 * "Trash 1 card from your hand and draw 2 cards." -- ST18-002 O-Nami's payoff.
 *
 * Printed order, and it is load-bearing: the trash happens first, so the two
 * cards drawn can never be the one discarded. Both halves are mandatory, which
 * is why the trash is a `choose` with `min: 1` -- *which* card goes is the only
 * decision in the clause.
 *
 * The two are siblings of a `sequence` rather than the payoff nested inside the
 * `choose`, which is the opposite of what a printed cost would need: this is
 * one mandatory effect, not "pay, then receive". A player with an empty hand
 * trashes nothing and still draws, which is what "do as much as you can" gives
 * them.
 */
const trashOneDrawTwo: MechanicEffect = {
  kind: "sequence",
  effects: [
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind: "st18-002-trash",
      min: 1,
      max: 1,
      effect: {
        kind: "move",
        binding: "st18-002-trash",
        to: { player: "self", zone: "trash" },
      },
    },
    { kind: "draw", player: "self", count: 2 },
  ],
};

export const st18Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST18-001 Uso-Hachi.
      //
      // `canRest: true` so a Character already rested is not offered: the
      // clause is "up to 1", and resting a rested body is the one pick that
      // spends the effect on nothing.
      "ST18-001",
      {
        effect: {
          kind: "if",
          condition: eightDon,
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 5,
              canRest: true,
            },
            bind: "uso-hachi-target",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "uso-hachi-target" },
          },
        },
      },
    ],
    [
      // ST18-002 O-Nami.
      "ST18-002",
      { effect: { kind: "if", condition: eightDon, then: trashOneDrawTwo } },
    ],
    [
      // ST18-004 Zoro-Juurou, the deck's only search.
      //
      // Both printed filters are read, and neither is redundant: the pool
      // carries {Straw Hat Crew} cards in every colour, and the purple ones
      // are the only cards this deck can cast.
      "ST18-004",
      lookAndAdd(5, "st18-004-look", {
        color: "Purple",
        type: "Straw Hat Crew",
      }),
    ],
    [
      // ST18-005 Luffy-Tarou.
      //
      // `maxCost: 5` rather than a printed-cost read, for the reason every
      // other free-play clause gives: a cost the board has already moved is
      // the cost the clause sees, and the free play is the whole payoff.
      //
      // "Up to 1" sits *inside* the `DON!! −1`, so a player may pay and then
      // play nothing. That is what the card prints -- the cost is paid to
      // resolve the clause, not to take the option -- and `donMinus` makes the
      // payment itself optional, so nobody is charged without choosing to be.
      "ST18-005",
      {
        effect: donMinus(1, {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            color: "Purple",
            type: "Straw Hat Crew",
            maxCost: 5,
          },
          bind: "st18-005-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "st18-005-play" },
        }),
      },
    ],
  ],
  whenAttacking: [
    [
      // ST18-003 San-Gorou.
      //
      // The printed "if you have 8 or more DON!! cards on your field" is a
      // `requires` rather than an `if` inside the program: the dispatch site
      // books the `[Once Per Turn]` on any program that resolves without
      // asking anything, so a gate written inside the program would spend the
      // turn's use on an attack that drew nothing.
      "ST18-003",
      {
        oncePerTurn: true,
        requires: { fieldDon: 8 },
        program: { effect: { kind: "draw", player: "self", count: 1 } },
      },
    ],
  ],
};
