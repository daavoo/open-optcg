/**
 * Continuous text printed on OP-07: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName, hasCardType, cards } from "@one-piece-sim/cards";
import {
  type StaticAbility,
  costOf,
  opponentOf,
  type RemovalImmunity,
} from "../static-abilities.js";
import { leaderHasType, turnPlayer } from "./static-shared.js";
import { fieldDonCount } from "../don.js";

export const op07StaticAbilities: readonly StaticAbility[] = [
  // OP07-023 Caribou: "[printed text omitted -- pnpm card:text OP07-023]"
  //
  // Rested DON!! in the cost area, which is a threshold only a deck that spends
  // its whole turn reaches -- so this is a 5000 body that blocks at 6000 on the
  // turn after it has been paid for, and at 5000 on the turn it lands.
  {
    cardNumber: "OP07-023",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].restedDon.length >= 6
          ? 1_000
          : 0,
    },
  },
  // OP07-029 Basil Hawkins: "[printed text omitted -- pnpm card:text OP07-029]"
  //
  // A keyword the card only has behind its own archetype's Leader, so it is a
  // layer here rather than a printed keyword `hasStaticKeyword` would read off
  // the text. Its `[Once Per Turn]` replacement is in
  // `mechanics/op07-replacements.ts`.
  {
    cardNumber: "OP07-029",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader && leaderHasType(context, "Supernovas"),
    },
  },
  // OP07-030 Pappag: "[printed text omitted -- pnpm card:text OP07-030]"
  //
  // Gated on a *named partner* being on the board rather than on the Leader,
  // which is the narrowest [Blocker] condition in the set: a 2-cost 0-power
  // body that does nothing at all until the deck has found its other half.
  {
    cardNumber: "OP07-030",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].board.some(
          (card) =>
            context.db.require(card.cardNumber).category === "character" &&
            hasCardName(card.cardNumber, "Camie"),
        ),
    },
  },
  // OP07-032 Fisher Tiger: "[printed text omitted -- pnpm card:text OP07-032]"
  //
  // The printed sentence is [Rush: Character] written out longhand, which is
  // the keyword the engine already models -- so it is a layer rather than a new
  // rule. Unconditional, which is what a 5-cost 6000 with an `[On Play]` rest
  // is paying for. That `[On Play]` is in `mechanics/op07-on-play.ts`.
  {
    cardNumber: "OP07-032",
    scope: "self",
    keyword: {
      keyword: "Rush: Character",
      when: (context) => !context.isLeader,
    },
  },
  // OP07-064 Sanji: two or more DON!! behind the opponent makes this card
  // in hand 3 cheaper.
  //
  // The price paid to play it is `hand-price.ts`'s entry for the same clause;
  // this layer is the other half, which "cost N or less" clauses reading a
  // hand see -- ST10-001 Trafalgar Law's activation plays it as a cost-3
  // card (Bandai's OP07-064#1). `costZone: "hand"`, so the body on the field
  // is priced at its printed 6 again.
  {
    cardNumber: "OP07-064",
    scope: "self",
    costZone: "hand",
    readsDon: ["own-ceiling", "opponent"],
    cost: (context) =>
      fieldDonCount(context.state, context.playerId) <=
      fieldDonCount(context.state, opponentOf(context.playerId)) - 2
        ? -3
        : 0,
  },
  // OP07-071 Foxy: "[printed text omitted -- pnpm card:text OP07-071]"
  //
  // Read for the *opponent's* Characters, so it is an `opponent-board-aura`:
  // the scope filter finds a Foxy across the table and this predicate asks
  // whose turn it is and what that player's Leader is. `[Opponent's Turn]` is
  // relative to Foxy's controller, which from here is the opponent of the
  // player being asked about -- so the layer is live on *this* player's turn.
  //
  // A board-wide -1000 on the defending turn is what makes the Purple deck's
  // own removal reach: every "power N or less" answer it plays is a size wider
  // while this stands.
  {
    cardNumber: "OP07-071",
    scope: "opponent-board-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) === context.playerId &&
        hasCardType(
          context.state.players[opponentOf(context.playerId)].leaderCardNumber,
          "Foxy Pirates",
        )
          ? -1_000
          : 0,
    },
  },
  // OP07-081 Kalifa: "[printed text omitted -- pnpm card:text OP07-081]"
  //
  // The same shape OP08-083 Sheepshead established: an `opponent-board-aura`
  // whose predicate asks whether the copy across the table carries the DON!!
  // its `[DON!! x1]` names, and whose `[Your Turn]` is that copy's controller's
  // turn rather than this player's.
  //
  // A board at -1 cost is a board Black's "cost N or less" removal can finally
  // see, which is the whole plan of the OP07 Black package.
  {
    cardNumber: "OP07-081",
    scope: "opponent-board-aura",
    cost: (context) =>
      !context.isLeader &&
      turnPlayer(context) !== context.playerId &&
      context.state.players[opponentOf(context.playerId)].board.some(
        (card) =>
          card.cardNumber === "OP07-081" &&
          (card.attachedDon?.length ?? 0) >= 1,
      )
        ? -1
        : 0,
  },
  // OP07-087 Baskerville: "[printed text omitted -- pnpm card:text OP07-087]"
  //
  // A 3-cost 2000 that swings for 5000 the turn Black has shrunk something to
  // nothing, which is what the set's cost debuffs are for. Either board counts:
  // the printed clause says "your opponent has", and `anyCharacterAtZeroCost`
  // is the existing reading of the same question -- narrowed here to the
  // opponent's side, which is what this card's wording adds to OP14's.
  {
    cardNumber: "OP07-087",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => {
        if (context.isLeader) return 0;
        if (turnPlayer(context) !== context.playerId) return 0;
        const opponentId = opponentOf(context.playerId);
        return context.state.players[opponentId].board.some(
          (card) => costOf(context.state, opponentId, card, context.db) <= 0,
        )
          ? 3_000
          : 0;
      },
    },
  },
  // OP07-098 Atlas: "[printed text omitted -- pnpm card:text OP07-098]"
  //
  // `battleKoImmune`, not a removal immunity: the clause names a battle and
  // says nothing about an effect, so a 5-cost 6000 that cannot be fought
  // through is still answered by every K.O. in the format. The gate is Yellow's
  // "only from behind" trade, and it is read live -- a player who climbs back
  // level on Life loses the protection mid-turn. Its `[Trigger]` is in
  // `mechanics/op07-triggers.ts`.
  {
    cardNumber: "OP07-098",
    scope: "self",
    battleKoImmune: (context) =>
      !context.isLeader &&
      context.state.players[context.playerId].life.length <
        context.state.players[opponentOf(context.playerId)].life.length,
  },
];

export const op07RemovalImmunities: readonly RemovalImmunity[] = [
  // OP07-033 Monkey.D.Luffy: with three Characters out, every other 3-cost or
  // less Character cannot be K.O.'d by the opponent's effects. `koOnly`: the
  // printed word is K.O., and reading it as the wider clause would make a
  // board of cheap bodies unanswerable by the format's bounce as well.
  {
    cardNumber: "OP07-033",
    from: "opponent",
    koOnly: true,
    protects: (definition) =>
      definition.category === "character" &&
      (definition.cost ?? 0) <= 3 &&
      !hasCardName(definition.cardNumber, "Monkey.D.Luffy"),
    when: (state, ownerId) =>
      state.players[ownerId].board.filter(
        (card) => cards.require(card.cardNumber).category === "character",
      ).length >= 3,
  },
  // OP07-069 Pickles: the other {Foxy Pirates} Characters cannot be K.O.'d by
  // the opponent's effects while its controller has no more DON!! than the
  // opponent -- a ceiling on both counts, so returning DON!! on either side
  // switches it.
  {
    cardNumber: "OP07-069",
    from: "opponent",
    koOnly: true,
    readsDon: ["own-ceiling", "opponent"],
    protects: (definition) =>
      definition.category === "character" &&
      definition.types.includes("Foxy Pirates") &&
      !hasCardName(definition.cardNumber, "Pickles"),
    when: (state, ownerId) =>
      fieldDonCount(state, ownerId) <=
      fieldDonCount(state, opponentOf(ownerId)),
  },
];
