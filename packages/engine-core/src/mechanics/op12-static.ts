/**
 * Continuous text printed on OP-12: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardType } from "@one-piece-sim/cards";
import {
  leaderHasType,
  lowLife,
  robinLeader,
  shirahoshiCount,
  totalGivenDon,
  trashEventCountOf,
  turnPlayer,
  twoBaseCostFiveCharacters,
} from "./static-shared.js";
import type { StaticAbility, RemovalImmunity } from "../static-abilities.js";

export const op12StaticAbilities: readonly StaticAbility[] = [
  // OP12-063 Vinsmoke Reiju: +2000 power and +5 cost with 4 or more Events in
  // the trash. The cost half matters because it lifts Reiju out of range of
  // "cost N or less" removal.
  {
    cardNumber: "OP12-063",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (trashEventCountOf(context) >= 4 ? 2000 : 0),
    },
  },
  {
    cardNumber: "OP12-063",
    scope: "self",
    cost: (context) => (trashEventCountOf(context) >= 4 ? 5 : 0),
  },
  // OP12-042 Alvida: "[printed text omitted -- pnpm card:text OP12-042]"
  {
    cardNumber: "OP12-042",
    scope: "self",
    cost: (context) => (twoBaseCostFiveCharacters(context) ? 1 : 0),
  },
  // OP12-053 Borsalino: "[printed text omitted -- pnpm card:text OP12-053]" Its replacement clause is
  // declared in `unimplemented-clauses.ts`.
  {
    cardNumber: "OP12-053",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        leaderHasType(context, "Navy")
          ? 1000
          : 0,
    },
  },
  {
    cardNumber: "OP12-053",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        turnPlayer(context) !== context.playerId &&
        leaderHasType(context, "Navy"),
    },
  },
  // OP12-065 Emporio.Ivankov: "[printed text omitted -- pnpm card:text OP12-065]" The Events its own [On K.O.] recurs are what
  // fill that trash.
  {
    cardNumber: "OP12-065",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => trashEventCountOf(context) >= 4,
    },
  },
  // OP12-066 Carne: [Blocker] with 4 or more Events in the trash -- the same
  // count and keyword OP12-065 Emporio.Ivankov reads above.
  {
    cardNumber: "OP12-066",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => trashEventCountOf(context) >= 4,
    },
  },
  // OP12-070 Sanji: +1000 power for every 5 Events in the trash. Its other
  // sentence, the DON!! paid instead of leaving the field, is a replacement in
  // `mechanics/op12-replacements.ts`.
  {
    cardNumber: "OP12-070",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => Math.floor(trashEventCountOf(context) / 5) * 1000,
    },
  },
  // OP12-085 Karasu: "[printed text omitted -- pnpm card:text OP12-085]" Cost, not power: it lifts the body out of "cost N
  // or less" removal, which is what the Black deck is answering.
  {
    cardNumber: "OP12-085",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Revolutionary Army") ? 3 : 0),
  },
  // OP12-087 Nico Robin: "[printed text omitted -- pnpm card:text OP12-087]"
  {
    cardNumber: "OP12-087",
    scope: "self",
    cost: (context) => (robinLeader(context) ? 3 : 0),
  },
  {
    cardNumber: "OP12-087",
    scope: "self",
    keyword: { keyword: "Blocker", when: robinLeader },
  },
  // OP12-089 Hack: "[printed text omitted -- pnpm card:text OP12-089]"
  {
    cardNumber: "OP12-089",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Revolutionary Army") ? 4 : 0),
  },
  {
    cardNumber: "OP12-089",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => leaderHasType(context, "Revolutionary Army"),
    },
  },
  // OP12-095 Lindbergh: "[printed text omitted -- pnpm card:text OP12-095]"
  {
    cardNumber: "OP12-095",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Revolutionary Army") ? 4 : 0),
  },
  // OP12-100 Sabo: "[printed text omitted -- pnpm card:text OP12-100]" Behind-only defence, and its own [On Play] spends a
  // Life card to get there.
  {
    cardNumber: "OP12-100",
    scope: "self",
    cost: (context) => (lowLife(context, 3) ? 3 : 0),
  },
  {
    cardNumber: "OP12-100",
    scope: "self",
    keyword: { keyword: "Blocker", when: (context) => lowLife(context, 3) },
  },
  // OP12-102 Shirahoshi: "[printed text omitted -- pnpm card:text OP12-102]"
  //
  // A board aura from a Character rather than a Leader, and one that switches
  // *off* when a second copy of itself is out -- which is the only clause in the
  // pool that penalises its own duplicate. "Other" is an instance question, so
  // the count excludes the card granting the aura.
  {
    cardNumber: "OP12-102",
    scope: "board-aura",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        hasCardType(context.card.cardNumber, "Neptunian") &&
        shirahoshiCount(context) === 1
          ? 2000
          : 0,
    },
  },
  // OP12-107 Donquixote Doflamingo: "[printed text omitted -- pnpm card:text OP12-107]"
  {
    cardNumber: "OP12-107",
    scope: "self",
    keyword: { keyword: "Rush", when: (context) => lowLife(context, 2) },
  },
  // OP12-015 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP12-015]"
  //
  // The card's `[On Play]` is in `mechanics/op12-on-play.ts` with the rest of
  // the set; this clause had no handler until a shipped deck played the card,
  // which is what brought it under `pnpm coverage:clauses`.
  //
  // "a total of ... given DON!! cards" is every DON!! given anywhere on the
  // player's field -- their Leader and all their Characters -- not the DON!!
  // given to this Character, which is what `attachedDon` would read. Two DON!!
  // on the Leader switch it on exactly as two on this body do.
  {
    cardNumber: "OP12-015",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader && totalGivenDon(context.state, context.playerId) >= 2
          ? 2000
          : 0,
    },
  },
  // Cost-modifying static text. These raise the card's cost on the field so it
  // counts for "cost 8 or more"; they deliberately do not change the play cost.
  {
    cardNumber: "OP12-043",
    scope: "self",
    cost: (context) =>
      context.state.players[context.playerId].hand.length >= 5 ? 1 : 0,
  },
  {
    cardNumber: "OP12-093",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Revolutionary Army") ? 4 : 0),
  },
];

export const op12RemovalImmunities: readonly RemovalImmunity[] = [
  // OP12-024 Gyukimaru: "[printed text omitted -- pnpm card:text OP12-024]"
  // Resting it is the answer, which is why the Green deck it plays in also
  // rests the opponent's board.
  {
    cardNumber: "OP12-024",
    from: "opponent",
    when: (state, ownerId, card) =>
      state.players[ownerId].board.some(
        (candidate) =>
          candidate.instanceId === card.instanceId && !candidate.rested,
      ),
  },
];
