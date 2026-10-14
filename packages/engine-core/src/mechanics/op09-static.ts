/**
 * Continuous text printed on OP-09: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName } from "@one-piece-sim/cards";
import {
  type StaticAbility,
  type RemovalImmunity,
} from "../static-abilities.js";
import {
  attachedDon,
  currentLeaderPower,
  leaderHasType,
} from "./static-shared.js";

export const op09StaticAbilities: readonly StaticAbility[] = [
  // OP09-004 Shanks: an aura across the table -- every one of the *other*
  // player's Characters is 1000 smaller while this 10-drop is out, which is
  // what turns Red's whole removal suite one step up. `opponent-board-aura` is
  // the scope for a Character debuffing the far side; its printed [Rush] is
  // read off the card by `hasStaticKeyword`.
  {
    cardNumber: "OP09-004",
    scope: "opponent-board-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        context.db.require(context.card.cardNumber).category === "character"
          ? -1000
          : 0,
    },
  },
  // OP09-017 Wire: [Rush] only behind a Kid Pirates Leader that is already
  // 7000 or bigger, and only with a DON!! on this body. The Leader's *current*
  // power, so the Leader's own buffs count -- which is the board the clause is
  // written for.
  {
    cardNumber: "OP09-017",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) =>
        !context.isLeader &&
        attachedDon(context) >= 1 &&
        leaderHasType(context, "Kid Pirates") &&
        currentLeaderPower(context) >= 7000,
    },
  },
  // OP09-022 Lim (Leader): the ODYSSEY rule its whole archetype is built on --
  // a board that arrives rested is a board its own cards then read back as
  // "2 or more rested Characters". Its `[Activate: Main]` is in
  // `mechanics/op09-main.ts`.
  {
    cardNumber: "OP09-022",
    scope: "self",
    charactersPlayRested: () => true,
  },
  // OP09-025 Crocodile: survives a Leader's attack behind an ODYSSEY Leader.
  // A Character's attack still kills it, and so does any removal effect.
  {
    cardNumber: "OP09-025",
    scope: "self",
    battleKoImmune: (context, attacker) =>
      attacker.isLeader && leaderHasType(context, "ODYSSEY"),
  },
  // OP09-045 Cabaji: the same protection without the attacker clause, paid for
  // by needing one of two named bodies on the board beside it.
  {
    cardNumber: "OP09-045",
    scope: "self",
    battleKoImmune: (context) =>
      context.state.players[context.playerId].board.some(
        (card) =>
          hasCardName(card.cardNumber, "Buggy") ||
          hasCardName(card.cardNumber, "Mohji"),
      ),
  },
  // OP09-061 Monkey.D.Luffy (Leader): +1 cost on its own Characters with a
  // DON!! given to the Leader. Protection rather than a tax -- it lifts the
  // board out of "cost N or less" removal -- and the ramp half is a reaction
  // rule in `card-mechanics.ts`.
  {
    cardNumber: "OP09-061",
    scope: "controller-aura",
    cost: (context) =>
      !context.isLeader &&
      context.db.require(context.card.cardNumber).category === "character" &&
      context.state.players[context.playerId].leaderAttachedDon.length >= 1
        ? 1
        : 0,
  },
  // OP09-081 Marshall.D.Teach (Leader): its own side never gets an [On Play],
  // which is the price of the `[Activate: Main]` that switches the other
  // side's off for a turn. See `onPlayEffectsNegated`.
  {
    cardNumber: "OP09-081",
    scope: "self",
    onPlayNegated: () => true,
  },
  // OP09-118 Gol.D.Roger: the pool's one alternate win condition. Either
  // player at 0 Life is enough -- the printed clause does not say whose -- and
  // its own [Rush] is read off the card by `hasStaticKeyword`, which is what
  // makes the 10-drop able to force the block it wins on.
  {
    cardNumber: "OP09-118",
    scope: "self",
    winsOnOpponentBlock: (context) =>
      context.state.players.p1.life.length === 0 ||
      context.state.players.p2.life.length === 0,
  },
  // OP09-086 Jesus Burgess: "[printed text omitted -- pnpm card:text OP09-086]"
  //
  // The K.O. immunity is the other half of the same printed line and lives in
  // `isRemovalImmune` above, because immunity is not a power/cost/keyword layer.
  // "for every 4" floors: a trash of 7 is +1000, not +1750. Nothing gates this
  // on a turn, so a blocking Burgess is as big as an attacking one -- which is
  // the whole reason the Champion list runs four of him over a fourth Sanjuan.
  {
    cardNumber: "OP09-086",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader && leaderHasType(context, "Blackbeard Pirates")
          ? Math.floor(
              context.state.players[context.playerId].trash.length / 4,
            ) * 1000
          : 0,
    },
  },
];

export const op09RemovalImmunities: readonly RemovalImmunity[] = [
  // OP09-086 Jesus Burgess: "[printed text omitted -- pnpm card:text OP09-086]"
  // K.O. only -- an opponent can still place him at the bottom of the deck or
  // move him into Life.
  { cardNumber: "OP09-086", from: "opponent", koOnly: true },
];
