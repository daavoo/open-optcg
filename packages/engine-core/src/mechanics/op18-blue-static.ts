/**
 * Continuous text on OP-18's Blue cards: the rows `static-abilities.ts` folds
 * into power queries. A clause with a timing marker is a program in
 * `op18-blue.ts`.
 */
import { type StaticAbility } from "../static-abilities.js";
import { attachedDon, trashEventCountOf } from "./static-shared.js";

/**
 * The Baroque Works pairs that print a bare `[DON!! x1]` +1000 on themselves:
 * one DON!! given to the Character, and it is a 1000 bigger on either turn.
 */
const DON_ONE_PAIRS = [
  "OP18-044",
  "OP18-051",
  "OP18-052",
  "OP18-053",
  "OP18-054",
  "OP18-055",
  "OP18-056",
] as const;

export const op18BlueStaticAbilities: readonly StaticAbility[] = [
  ...DON_ONE_PAIRS.map((cardNumber): StaticAbility => ({
    cardNumber,
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader && attachedDon(context) >= 1 ? 1_000 : 0,
    },
  })),
  // OP18-045 Mr. Prince: +1000 per *completed* five Events in its
  // controller's trash -- nine pay 1000, ten pay 2000. Its name alias
  // ([Sanji]) is derived into `rules.nameAliases` and needs no row.
  {
    cardNumber: "OP18-045",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader
          ? 0
          : Math.floor(trashEventCountOf(context) / 5) * 1_000,
    },
  },
];
