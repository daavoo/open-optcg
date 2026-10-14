/**
 * Program fragments more than one signal-driven reaction resolves, shared by
 * the `*-reactions.ts` modules.
 */
import { type MechanicProgram, SOURCE_BINDING } from "../mechanics.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]" --
 * OP12-081 Koala's punishment, shared by the two rules that can raise it.
 */
export const koalaLifeToHand: MechanicProgram["effect"] = {
  kind: "select",
  selector: { player: "opponent", zone: "life", position: "top" },
  bind: "op12-koala-life",
  count: 1,
  effect: {
    kind: "move",
    binding: "op12-koala-life",
    to: { player: "owner", zone: "hand" },
  },
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" --
 * OP11-102 Camie's clause, shared by the two signals that can raise it.
 *
 * Gated on the opponent holding two or more Life cards, so it never takes their
 * last one: this is a race card, not a finisher.
 */
export const camieTrashBothLives: MechanicProgram["effect"] = {
  kind: "if",
  condition: {
    kind: "zone-count",
    player: "opponent",
    zone: "life",
    operator: "gte",
    value: 2,
  },
  then: {
    kind: "sequence",
    effects: [
      {
        kind: "select",
        selector: { player: "self", zone: "life", position: "top" },
        bind: "op11-camie-own",
        count: 1,
        effect: {
          kind: "move",
          binding: "op11-camie-own",
          to: { player: "owner", zone: "trash" },
        },
      },
      {
        kind: "select",
        selector: { player: "opponent", zone: "life", position: "top" },
        bind: "op11-camie-theirs",
        count: 1,
        effect: {
          kind: "move",
          binding: "op11-camie-theirs",
          to: { player: "owner", zone: "trash" },
        },
      },
    ],
  },
};

/**
 * "Draw 2 cards and trash 1 card from your hand" -- OP08-105 Jewelry Bonney's
 * clause, which its own `[Trigger]` prints again; the Trigger registers the
 * copy in `mechanics/op08-triggers.ts`.
 */
export const bonneyDrawTwoTrashOne: MechanicProgram["effect"] = {
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count: 2 },
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind: "op08-bonney-trash",
      min: 1,
      max: 1,
      effect: {
        kind: "move",
        binding: "op08-bonney-trash",
        to: { player: "self", zone: "trash" },
      },
    },
  ],
};

/**
 * "Draw 1 card and trash 1 card from your hand" -- OP07-031 Bartolomeo's
 * reaction, and the same sentence OP08-105 prints one card wider.
 */
export const drawOneTrashOne: MechanicProgram["effect"] = {
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count: 1 },
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind: "op07-bartolomeo-trash",
      min: 1,
      max: 1,
      effect: {
        kind: "move",
        binding: "op07-bartolomeo-trash",
        to: { player: "self", zone: "trash" },
      },
    },
  ],
};

/**
 * OP06-048 Zeff's optional four-card mill, behind its Leader gate.
 *
 * Shared by the card's two rules, which are the two signals its one printed
 * sentence names.
 */
export const zeffMill: MechanicProgram["effect"] = {
  kind: "if",
  condition: { kind: "leader-has-type", player: "self", type: "East Blue" },
  then: {
    kind: "optional",
    effect: { kind: "trash-top", player: "self", count: 4 },
  },
};

/**
 * OP15-119 Monkey.D.Luffy's answer to an Event or a [Blocker]: reveal the top
 * Life card, and grow by its printed cost for the turn.
 *
 * Shared by the card's two rules, the two signals its one sentence names.
 * "Up to 1" is the `optional`: the reveal gives the opponent the card, and the
 * power is only worth that while this Character still has a battle to win.
 */
export const op15LuffyReveal: MechanicProgram["effect"] = {
  kind: "optional",
  effect: {
    kind: "select",
    selector: { player: "self", zone: "life", position: "top" },
    bind: "op15-119-reveal",
    count: 1,
    effect: {
      kind: "sequence",
      effects: [
        { kind: "reveal", binding: "op15-119-reveal" },
        {
          kind: "modify-power",
          binding: SOURCE_BINDING,
          amount: 1000,
          expiresAfterTurns: 0,
          perCostOf: "op15-119-reveal",
        },
      ],
    },
  },
};
