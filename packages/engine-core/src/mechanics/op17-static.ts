/**
 * Continuous text printed on OP-17: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { type StaticAbility, costOf } from "../static-abilities.js";
import {
  always,
  anyCharacterWithCost,
  ELBAPH_COST,
  leaderHasType,
  turnPlayer,
} from "./static-shared.js";

export const op17StaticAbilities: readonly StaticAbility[] = [
  // OP17-002 Atmos / OP17-009 Haruta: "[printed text omitted -- pnpm card:text OP17-009]" Same defensive layer as OP10-011, one archetype later.
  {
    cardNumber: "OP17-002",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (turnPlayer(context) !== context.playerId ? 3000 : 0),
    },
  },
  {
    cardNumber: "OP17-009",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (turnPlayer(context) !== context.playerId ? 3000 : 0),
    },
  },
  // OP17's Elbaph Commons: "[printed text omitted -- pnpm card:text OP17-009]" A 2-cost 2000-power body that becomes a
  // 5000 once the set's `+12 cost` giants are out, which is the whole point of
  // the archetype -- the giants are the enabler, these are the payoff.
  {
    cardNumber: "OP17-082",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        anyCharacterWithCost(context, ELBAPH_COST) ? 3000 : 0,
    },
  },
  {
    cardNumber: "OP17-090",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        anyCharacterWithCost(context, ELBAPH_COST) ? 3000 : 0,
    },
  },
  {
    cardNumber: "OP17-095",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        anyCharacterWithCost(context, ELBAPH_COST) ? 3000 : 0,
    },
  },
  {
    cardNumber: "OP17-091",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        anyCharacterWithCost(context, ELBAPH_COST) ? 3000 : 0,
    },
  },
  {
    // OP17-087 Nico Robin: same static clause, printed alongside an [On Play]
    // debuff also gated on the same condition -- see `card-mechanics.ts`.
    cardNumber: "OP17-087",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        anyCharacterWithCost(context, ELBAPH_COST) ? 3000 : 0,
    },
  },
  // OP17-083 Jinbe: the same clause, plus [Blocker] on the same condition.
  // Both halves are one printed sentence, so they share one condition here.
  {
    cardNumber: "OP17-083",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        anyCharacterWithCost(context, ELBAPH_COST) ? 3000 : 0,
    },
    keyword: {
      keyword: "Blocker",
      when: (context) => anyCharacterWithCost(context, ELBAPH_COST),
    },
  },
  // OP17-080 Usopp: same +3000 power clause, alongside an [On Play] search --
  // see `card-mechanics.ts`.
  {
    cardNumber: "OP17-080",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        anyCharacterWithCost(context, ELBAPH_COST) ? 3000 : 0,
    },
  },
  // OP17-093 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP17-093]" The condition form of the giants'
  // own printed [Rush], rather than a grant -- so a negated 093 loses it too.
  {
    cardNumber: "OP17-093",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) => anyCharacterWithCost(context, ELBAPH_COST),
    },
  },
  // OP17's Elbaph giants: "[printed text omitted -- pnpm card:text OP17-093]"
  //
  // These are the enablers the rest of the archetype is written about -- they
  // are what makes "[printed text omitted -- pnpm card:text OP17-093]" true --
  // so the cost layer is registered here independently of their own [On Play]
  // clauses, which are programs in `mechanics/op17.ts`. Unconditional,
  // unlike OP17-081 and OP17-094 below, which want an {Elbaph} Leader.
  {
    cardNumber: "OP17-085",
    scope: "self",
    cost: () => 12,
  },
  {
    cardNumber: "OP17-089",
    scope: "self",
    cost: () => 12,
  },
  {
    cardNumber: "OP17-092",
    scope: "self",
    cost: () => 12,
  },
  // OP17-119 Loki also gains +3000 power on the opponent's turn, in the same
  // printed sentence.
  {
    cardNumber: "OP17-119",
    scope: "self",
    cost: () => 12,
    power: {
      kind: "add",
      value: (context) => (turnPlayer(context) !== context.playerId ? 3000 : 0),
    },
  },
  // OP17-081 Gerd: the conditional form, same as Rodo below.
  {
    cardNumber: "OP17-081",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Elbaph") ? 12 : 0),
  },
  // OP17-094 Rodo: "[printed text omitted -- pnpm card:text OP17-094]" Cost layers are static exactly like the format's other
  // conditional cost text.
  {
    cardNumber: "OP17-094",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Elbaph") ? 12 : 0),
  },
  // OP17-112 Charlotte Linlin: "[printed text omitted -- pnpm card:text OP17-112]"
  //
  // A `board-aura` rather than `controller-aura`: 112 is a Character, not a
  // Leader, so the aura is live only while an un-negated copy sits on its
  // controller's board, not while it is their Leader (which it never can be).
  // "4000 base power" reads printed power, matching how every other layer in
  // this table treats "cost N or more"/"power N or less" gates on the same
  // simplification.
  {
    cardNumber: "OP17-112",
    scope: "board-aura",
    power: {
      kind: "set-base",
      value: (context) => {
        if (context.isLeader) return undefined;
        if (turnPlayer(context) !== context.playerId) return undefined;
        const definition = context.db.require(context.card.cardNumber);
        if (!definition.rules.hasTrigger) return undefined;
        if ((definition.power ?? 0) !== 4000) return undefined;
        return 8000;
      },
    },
  },
  // OP17-079 Monkey.D.Luffy, the Leader: "[printed text omitted -- pnpm card:text OP17-079]"
  //
  // A `controller-aura`, not `board-aura`: this text is on the Leader, so it
  // is live exactly while OP17-079 is the player's Leader, the same as every
  // other aura in the table before OP17-112. Distinct from `SEALED-LUFFY`'s
  // wildcard identity clause -- that promo answers to the same printed name,
  // "Monkey.D.Luffy", but every layer here is keyed on the exact card
  // number, so the two never collide.
  {
    cardNumber: "OP17-079",
    scope: "controller-aura",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader &&
        costOf(context.state, context.playerId, context.card) >= 12,
    },
  },
  // OP17-003 Izo and OP17-027 Benn.Beckman: "[Rush: Character]", unconditional.
  {
    cardNumber: "OP17-003",
    scope: "self",
    keyword: { keyword: "Rush: Character", when: always },
  },
  {
    cardNumber: "OP17-027",
    scope: "self",
    keyword: { keyword: "Rush: Character", when: always },
  },
];
