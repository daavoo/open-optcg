import { cards, hasCardType, type CardDatabase } from "@one-piece-sim/cards";
import type { KnownCardRef, PlayerId } from "@one-piece-sim/protocol";
import type { BoardCard, CardInstance, GameState } from "./model.js";
import { storedBasePower } from "./base-power.js";
import {
  boardCardPower,
  cardBasePower,
  costOf,
  staticPower,
} from "./static-abilities.js";

/**
 * Records that `knower` has legitimately seen the top card of `deckOwner`'s
 * deck. The caller separately decides whether the accompanying `card-revealed`
 * event is a private look (`visibleTo` set) or a public reveal.
 */
export function recordDeckTopKnowledge(
  state: GameState,
  knower: PlayerId,
  deckOwner: PlayerId,
): void {
  const card = state.players[deckOwner].deck[0];
  if (!card) return;
  const seen: CardInstance = {
    instanceId: card.instanceId,
    cardNumber: card.cardNumber,
  };
  if (knower === deckOwner) state.players[knower].knownOwnDeckTop = seen;
  else state.players[knower].knownOpponentDeckTop = seen;
}

/**
 * Whether a search card's printed "reveal" makes the found card public.
 *
 * "Look at N cards from the top of your deck; reveal up to 1 X and add it to
 * your hand" (Nami OP01-016, Thousand Sunny ST31-005, Sengoku OP12-047, the
 * Sugar/Law look-and-adds, ...) exposes the added card to both players, so the
 * `card-revealed` event carries no `visibleTo`. "Look at N cards ... and add up
 * to 1 card to your hand" with no reveal -- OP15-118 Enel -- is a private look:
 * only the searcher learns the card, so the event must be tagged with the
 * searcher's `visibleTo` and filtered from the opponent's observation.
 *
 * Every search site decides publicity through this text check rather than a
 * per-card list, so the two shapes stay right when a new card is added.
 */
export function searchRevealIsPublic(
  sourceCardNumber: string,
  db: CardDatabase = cards,
): boolean {
  return db.require(sourceCardNumber).rules.searchRevealPublic;
}

/**
 * Resolves remembered deck-top knowledge against live state. Returns null once
 * the remembered instance is no longer on top, so a draw, search, mill or bury
 * invalidates the memory without any explicit bookkeeping at those sites.
 */
export function resolveDeckTopKnowledge(
  state: GameState,
  deckOwner: PlayerId,
  remembered: CardInstance | undefined,
  db: CardDatabase = cards,
): KnownCardRef | null {
  if (!remembered) return null;
  const top = state.players[deckOwner].deck[0];
  if (!top || top.instanceId !== remembered.instanceId) return null;
  const definition = db.require(top.cardNumber);
  return {
    instanceId: top.instanceId,
    cardNumber: top.cardNumber,
    name: definition.name,
    category: definition.category,
    cost: definition.cost,
    power: definition.power,
    counter: definition.counter,
  };
}

/**
 * A card's cost as seen by targeting and by "cost N or less" conditions:
 * printed cost, plus static text from {@link STATIC_ABILITIES}, plus temporary
 * `costModifiers`.
 *
 * This is deliberately not the cost paid to play a card from hand; see
 * `playCost` in engine.ts. The two differ because the format's cost-raising
 * text ("this Character gains +3 cost") applies on the field only.
 */
export function effectiveCost(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = cards,
): number {
  return costOf(state, playerId, card, db);
}

/**
 * Whether DON!! attached to `playerId`'s cards is currently granting power.
 *
 * A given DON!! card gives +1000 power *during its controller's turn* only, but
 * it stays attached until that controller's next Refresh Phase -- so on the
 * opponent's turn it still counts toward [DON!! xN] conditions while granting
 * nothing. Callers that evaluate a card's power outside its controller's turn
 * must pass this rather than letting `currentPower` default to counting it.
 *
 * Targeting read the stale DON!! as power and made "[printed text omitted -- pnpm card:text <card>]" (OP15-075 El Thor) refuse a
 * 3000-power Sanji that had been given 2 DON!! the turn before: the selector
 * saw 5000, offered no target, and the KO half of the Event was silently
 * skipped. Every "X power or less/or more" clause shared the defect.
 *
 * `turnPlayerId`, not `activePlayer`: the two differ for the whole of every
 * Block and Counter step and every pending effect the engine hands across the
 * table, which is exactly when a battle is being measured. Read off the seat
 * holding the decision, both sides came out inverted -- the defender's DON!!,
 * which pays out on their own turn only, counted while they answered an attack,
 * and the attacker's DON!!, which is paying out right now, did not.
 */
export function donPowerApplies(state: GameState, playerId: PlayerId): boolean {
  return state.turnPlayerId === playerId;
}

export function currentPower(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  includeAttachedDon = true,
  db: CardDatabase = cards,
): number {
  const player = state.players[playerId];
  if (instanceId === `${playerId}-leader`) {
    const override = storedBasePower(player.leaderBasePowers, state.turn);
    const printed = override ?? db.require(player.leaderCardNumber).power ?? 0;
    const modifiers = player.leaderPowerModifiers
      .filter((modifier) => modifier.expiresAtTurn >= state.turn)
      .reduce((total, modifier) => total + modifier.amount, 0);
    return (
      staticPower(
        state,
        playerId,
        { instanceId, cardNumber: player.leaderCardNumber },
        true,
        printed,
        db,
        override !== undefined,
      ) +
      modifiers +
      (includeAttachedDon ? player.leaderAttachedDon.length * 1000 : 0)
    );
  }

  // A Stage carries no power at all -- `canBeTargeted` still evaluates this
  // unconditionally for anything with a `rested` field, which a Stage has, so
  // OP17-018/116's plain "your opponent's Stages" selector (no power criteria
  // at all) would otherwise crash here rather than simply never filtering on
  // it.
  if (player.stage?.instanceId === instanceId) return 0;
  const card = player.board.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (!card) throw new Error(`MISSING_CARD: ${instanceId}`);
  // The body lives in `static-abilities.ts` so a static layer can read another
  // card's power without reaching back into this module -- see `boardCardPower`.
  return boardCardPower(state, playerId, card, includeAttachedDon, db);
}

export function boardOwner(
  state: GameState,
  card: BoardCard,
): PlayerId | undefined {
  return (["p1", "p2"] as const).find((playerId) =>
    state.players[playerId].board.some(
      (candidate) => candidate.instanceId === card.instanceId,
    ),
  );
}

export interface TargetCriteria {
  category?: string;
  type?: string;
  maxCost?: number;
  /**
   * A cost floor, for "[printed text omitted -- pnpm card:text <card>]".
   *
   * Evaluated against {@link effectiveCost} exactly as `maxCost` is. That
   * matters more here than it looks: OP17's Elbaph giants reach cost 12 through
   * a static `+12 cost` layer over a much lower printed cost, so a printed-cost
   * floor would never find the very cards the clause is written about.
   */
  minCost?: number;
  /** A base-power ceiling, read through `cardBasePower`. */
  maxPower?: number;
  /** A base-power floor. Paired with `maxPower` it states an exact power. */
  minPower?: number;
  maxCurrentPower?: number;
  minCurrentPower?: number;
  rested?: boolean;
  faceUp?: boolean;
  excludeInstanceId?: string;
}

/**
 * Whether `card` is rested, answering for a Leader as well as a board card.
 *
 * A Leader reached through a selector's `includeLeader` is a synthetic
 * `CardInstance` -- an id and a card number, built in `selectCards` -- with no
 * `rested` field, so `"rested" in card` is false for it and every `rested`
 * question read "active". A "rest N of your cards" cost therefore offered a
 * Leader that was already rested, which is a payment that costs nothing: the
 * trace this came from had OP14-038 listing a Leader that had paid ST32-001
 * Kin'emon's cost four decisions earlier. The mirror case is just as wrong --
 * an effect that asks for a *rested* card could never name the Leader.
 *
 * The seat is in the instance id, and `leaderRested` is the state's own answer.
 */
export function isRested(state: GameState, card: CardInstance): boolean {
  const leaderSeat = (["p1", "p2"] as const).find(
    (seat) => card.instanceId === `${seat}-leader`,
  );
  if (leaderSeat) return state.players[leaderSeat].leaderRested;
  return "rested" in card ? Boolean(card.rested) : false;
}

/**
 * A Leader has no printed cost, so a cost bound never restricts one.
 *
 * "Rest up to 1 of your opponent's Leader or Character cards with a cost of 3
 * or less" is two target classes, not one: the ceiling is there to bound the
 * Characters, and the Leader -- which prints no cost at all -- is always a
 * legal target. Bandai templates every such clause this way, which is why
 * naming the Leader beside a cost bound is not a contradiction.
 *
 * The engine read it as one class because a Leader's record does carry a
 * `cost`: the audit lands Bandai's *Life* figure in that field, so every Leader
 * in the pool prices at 2 to 5. Cards whose ceiling sat at or above 5 were
 * therefore right by accident (OP10-035 at 5, OP15-024 at 7), and OP05-038
 * Charlestone, whose ceiling is 3, could never reach the Leader its text names
 * -- the clause a Green Trigger is played for. Same shape as {@link isRested}
 * above: a synthetic Leader instance answering a question that was never asked
 * of it.
 *
 * Fixing it here rather than in {@link effectiveCost} keeps it to the one
 * question that is wrong. `effectiveCost` is also what prices a Leader for
 * `costOf` and the static layers, and a Leader only ever reaches these criteria
 * through a selector's `includeLeader`, so no clause that meant Characters
 * alone can widen.
 */
export function canBeTargeted(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  criteria: TargetCriteria,
  db: CardDatabase = cards,
): boolean {
  const definition = db.require(card.cardNumber);
  const rested = isRested(state, card);
  const evaluatedPower =
    "rested" in card
      ? currentPower(
          state,
          playerId,
          card.instanceId,
          donPowerApplies(state, playerId),
          db,
        )
      : (definition.power ?? 0);
  // Base power, not printed: a "base power becomes N" effect or layer moves a
  // card into or out of a "base power N or less" bound (OP17-112 Q&A). Lazy,
  // because it folds the static table and most criteria never ask.
  const basePower = () => cardBasePower(state, playerId, card, db);
  return (
    (criteria.category === undefined ||
      definition.category === criteria.category) &&
    (criteria.type === undefined ||
      hasCardType(card.cardNumber, criteria.type)) &&
    (criteria.maxCost === undefined ||
      definition.category === "leader" ||
      effectiveCost(state, playerId, card, db) <= criteria.maxCost) &&
    (criteria.minCost === undefined ||
      definition.category === "leader" ||
      effectiveCost(state, playerId, card, db) >= criteria.minCost) &&
    (criteria.maxPower === undefined ||
      (basePower() ?? Number.POSITIVE_INFINITY) <= criteria.maxPower) &&
    (criteria.minPower === undefined ||
      (basePower() ?? Number.NEGATIVE_INFINITY) >= criteria.minPower) &&
    (criteria.maxCurrentPower === undefined ||
      evaluatedPower <= criteria.maxCurrentPower) &&
    (criteria.minCurrentPower === undefined ||
      evaluatedPower >= criteria.minCurrentPower) &&
    (criteria.rested === undefined || rested === criteria.rested) &&
    (criteria.faceUp === undefined ||
      Boolean(card.faceUp) === criteria.faceUp) &&
    (criteria.excludeInstanceId === undefined ||
      card.instanceId !== criteria.excludeInstanceId)
  );
}

/**
 * The attacker's power for the battle in progress.
 *
 * The mirror of how `resolveBattle` reads the defender: `currentPower` of the
 * card, live, plus the battle-scoped delta the battle itself has accumulated
 * (`counterPower` on the defending side, {@link ActiveAttack.battleAttackBonus}
 * here). Both halves of a battle are therefore recomputed from the board every
 * time they are read, and nothing that changes a card's power between the
 * declaration and the resolution can go missing from one side only.
 *
 * It used to be a scalar frozen at declaration, and a turn-scoped `modify-power`
 * landing on the attacker mid-battle -- OP17-048 Shiki's "[On Your Opponent's
 * Attack] ... Give up to 1 of your opponent's Characters -3000 power during this
 * turn", the whole point of that timing -- moved the card's `currentPower` and
 * left the battle arithmetic at the old number. The defender was then quoted a
 * `counterShortfall` for an attack that could no longer connect, and paid it.
 * Two cards kept the frozen scalar honest by hand (`triggerFranky`, and DON!!
 * moving on or off the attacker); both are gone, because there is no longer a
 * second copy of the number to keep in step.
 *
 * Returns the bonus alone when the attacker has left the field: `observe` and
 * `endBattleIfTargetLeftField` can both run while a battle whose attacker
 * trashed itself as its own cost is still being torn down, and a `MISSING_CARD`
 * throw there would be for a battle that is about to end anyway.
 */
export function battleAttackPower(
  state: GameState,
  db: CardDatabase = cards,
): number {
  const attack = state.activeAttack;
  if (!attack) return 0;
  const attackerIsLeader =
    attack.attackerInstanceId === `${attack.attackerPlayerId}-leader`;
  const onField =
    attackerIsLeader ||
    state.players[attack.attackerPlayerId].board.some(
      (card) => card.instanceId === attack.attackerInstanceId,
    );
  if (!onField) return attack.battleAttackBonus;
  return (
    currentPower(
      state,
      attack.attackerPlayerId,
      attack.attackerInstanceId,
      true,
      db,
    ) + attack.battleAttackBonus
  );
}
