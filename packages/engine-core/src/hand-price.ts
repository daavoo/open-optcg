import {
  cards,
  hasCardName,
  hasCardTypeIncluding,
  type CardDatabase,
} from "@one-piece-sim/cards";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { BoardCard, GameState } from "./model.js";
import { fieldDonCount } from "./don.js";
import {
  boardCardPower,
  staticHandCostDelta,
  staticHandPlayDiscount,
} from "./static-abilities.js";
import { donPowerApplies } from "./queries.js";

/**
 * What a card in hand costs to play, in one place.
 *
 * Split out of `don.ts` so a hand price can read a Character's *current* power:
 * `boardCardPower` lives on the far side of `static-abilities.ts`, which imports
 * `don.ts`, so the conditions below could not reach it from there. Nothing in
 * the engine imports this module back, which is what keeps that edge one-way.
 */

/**
 * Power as an "N power or more" clause reads it off the board: every static
 * layer applied, and the DON!! given to the card counted only while its
 * controller is the turn player -- the same pair `canBeTargeted` uses in
 * `queries.ts`, and the reason a Character whose own text debuffs it (OP16-017
 * LittleOars Jr. at 8000 printed, 4000 without an 8-cost Whitebeard Pirate out)
 * does not satisfy a clause its printed power would.
 */
function boardPower(
  state: GameState,
  playerId: PlayerId,
  card: BoardCard,
  db: CardDatabase,
): number {
  return boardCardPower(
    state,
    playerId,
    card,
    donPowerApplies(state, playerId),
    db,
  );
}

/**
 * The DON!! cost of playing `cardNumber` from `playerId`'s hand right now.
 *
 * One place, because the cost is asked twice -- once to decide whether the play
 * is legal and once to pay for it -- and the two answers drifting apart would
 * let a player play a card they cannot afford, or pay twice for a discount.
 * `spend` is what separates the two calls: the legality check reads the price,
 * the payment consumes the discount that produced it.
 */
/**
 * A card's own printed "give this card in your hand −N cost" clause, gated on
 * a fixed condition rather than a discount another effect granted.
 *
 * Separate from `player.playDiscount`: that field is a temporary grant one
 * effect gives another card, consumed by the first qualifying play. Each card
 * below instead prints its own static hand-price clause, always live while its
 * condition holds and never consumed.
 *
 * `playCostFromHand` below is what both `mainActions` and `applyPlayCard`
 * read. A clause that prices a card in hand may instead be a `StaticAbility`
 * `cost` layer with `costZone: "hand"`, which `effectiveCost` reads for the
 * hand card and `staticHandCostDelta` folds into the price here; a plain `self`
 * cost layer would not do, because it is read only on the field and would make
 * the played body read as cheaper than it is to every "cost N or less" removal
 * pointed at it. OP16-015 was written as such a layer and moved here for
 * exactly that.
 *
 * Each entry carries its own predicate because the four conditions have nothing
 * in common: two read the opponent's board, one reads the player's own, and one
 * reads the Leader's name and the DON!! count.
 */
const STATIC_HAND_DISCOUNTS: readonly {
  cardNumber: string;
  amount: number;
  when: (state: GameState, playerId: PlayerId, db: CardDatabase) => boolean;
}[] = [
  // OP17-005 Edward.Newgate and OP17-013 Portgas.D.Ace: "[printed text omitted -- pnpm card:text OP17-013]"
  //
  // Power as the board reads it now, not as the card prints it: see
  // `boardPower`.
  {
    cardNumber: "OP17-005",
    amount: 4,
    when: opponentHasHighPowerCharacter,
  },
  {
    cardNumber: "OP17-013",
    amount: 2,
    when: opponentHasHighPowerCharacter,
  },
  // OP16-005 Thatch: "[printed text omitted -- pnpm card:text OP16-005]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP16-005]"
  //
  // "a type including", so `hasCardTypeIncluding` rather than `hasCardType`:
  // {Whitebeard Pirates Allies} qualifies, which in the Red Ace list means
  // OP16-017 LittleOars Jr. is the card the clause is written for -- but only
  // once something else on the board has switched its own -4000 off, since at
  // 4000 it is under this floor. Current power, not printed, for exactly that.
  {
    cardNumber: "OP16-005",
    amount: 3,
    when: (state, playerId, db) =>
      state.players[playerId].board.some(
        (card) =>
          hasCardTypeIncluding(card.cardNumber, "Whitebeard Pirates") &&
          boardPower(state, playerId, card, db) >= 8000,
      ),
  },
  // OP16-015 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP16-015]"Ace"[printed text omitted -- pnpm card:text OP16-015]"
  //
  // "Includes", not "is": a substring of the printed name, which is how this
  // reaches OP16-001 Portgas.D.Ace and any other Ace Leader without naming
  // them. Every other name check in the engine is an equality through
  // `hasCardName`, so this one is spelled out rather than routed through it.
  {
    cardNumber: "OP16-015",
    amount: 2,
    when: (state, playerId, db) =>
      db
        .require(state.players[playerId].leaderCardNumber)
        .name.includes("Ace") && fieldDonCount(state, playerId) >= 6,
  },
];

function opponentHasHighPowerCharacter(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase,
): boolean {
  const opponentId = playerId === "p1" ? "p2" : "p1";
  return state.players[opponentId].board.some(
    (card) => boardPower(state, opponentId, card, db) >= 10_000,
  );
}

function staticHandDiscount(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  db: CardDatabase,
): number {
  const entry = STATIC_HAND_DISCOUNTS.find(
    (candidate) => candidate.cardNumber === cardNumber,
  );
  const own =
    (entry && entry.when(state, playerId, db) ? entry.amount : 0) -
    staticHandCostDelta(state, playerId, cardNumber, db);
  // A discount another card's continuous text grants -- OP05-097 Mary Geoise
  // pricing every {Celestial Dragons} body in the hand -- lives in the static
  // table, where the aura scopes already know which Stage is out.
  return own + staticHandPlayDiscount(state, playerId, cardNumber, db);
}

export function playCostFromHand(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  printedCost: number,
  options: { spend: boolean } = { spend: false },
  db: CardDatabase = cards,
): number {
  const player = state.players[playerId];
  // ST33-004 Bepo, whose own text prices itself at 3 for the turn its
  // controller's hand was trashed by an effect. Predates the general discount
  // and stays a special case because it replaces the price rather than
  // reducing it.
  const base =
    cardNumber === "ST33-004" && player.handTrashedByEffectTurn === state.turn
      ? 3
      : printedCost;
  const staticDiscount = staticHandDiscount(state, playerId, cardNumber, db);
  const discount = player.playDiscount;
  if (
    !discount ||
    discount.turn !== state.turn ||
    printedCost < discount.minCost ||
    !hasCardName(cardNumber, discount.name)
  ) {
    return Math.max(0, base - staticDiscount);
  }
  if (options.spend) delete player.playDiscount;
  return Math.max(0, base - staticDiscount - discount.amount);
}

/**
 * What it costs to activate an Event out of `playerId`'s hand right now.
 *
 * The Event arm of {@link playCostFromHand}: an Event is activated rather than
 * played, and its DON!! price comes from the mechanic table's `cost` rather
 * than from `CardDefinition.cost` (the two agree for every Event in the table,
 * which is what makes the discounts above applicable to it). Both the offer in
 * `legal-actions` and the payment in `actions` read this, for the same reason
 * `playCostFromHand` is one function: a price read one way and paid another
 * lets a player activate an Event they cannot afford.
 *
 * `player.playDiscount` is deliberately not applied. That grant names a card to
 * *play* -- the OP12-061 Leader's is the only one in the format -- and an Event
 * is never played.
 */
export function eventActivationCost(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  programCost: number,
  db: CardDatabase = cards,
): number {
  return Math.max(
    0,
    programCost - staticHandDiscount(state, playerId, cardNumber, db),
  );
}
