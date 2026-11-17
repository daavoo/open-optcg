/**
 * A `TableSnapshot` as an engine position the model can be asked about.
 *
 * The position is rebuilt from scratch at every decision rather than kept in
 * step with the sim: the sim owns the game -- its shuffles, its draws, its
 * rulings -- and the engine is only ever asked "what would you do here". That
 * costs the engine whatever the snapshot cannot say (a once-per-turn already
 * spent, a "this turn" grant the sim tracks somewhere the plugin does not
 * read), and in exchange the two can never drift apart.
 *
 * Built the way `test/support/scenario.ts` builds a test position: a seeded
 * game played through its own actions to the right turn and seat, so DON!!
 * phases and refreshes are real, then each zone replaced by the snapshot's.
 */
import {
  applyAction,
  assertGameStateInvariants,
  createGame,
  currentPower,
  getLegalActions,
  type BoardCard,
  type CardInstance,
  type GameState,
} from "@one-piece-sim/engine-core";
import { cards } from "@one-piece-sim/cards";
import { deckManifests, recommendedDeckFor } from "@one-piece-sim/decks";
import type { PlayerId, ResolvedDeck } from "@one-piece-sim/protocol";
import type { SimFieldCard, SimSide, TableSnapshot } from "./snapshot.js";

const SEATS = ["p1", "p2"] as const;

export interface ImportedPosition {
  state: GameState;
  /** Engine instance id to the sim's id, for every card a move can name. */
  simIds: Map<string, string>;
  /** The model seat's deck, as the scorer reads its unseen cards. */
  ownDeck: Record<string, number>;
}

function other(player: PlayerId): PlayerId {
  return player === "p1" ? "p2" : "p1";
}

function deckListFor(side: SimSide): string[] {
  if (side.deckList) return side.deckList;
  const leader = side.leader.cardNumber;
  const deckId = recommendedDeckFor(leader);
  const manifest =
    (deckId ? deckManifests[deckId] : undefined) ??
    Object.values(deckManifests).find((list) => list.leader === leader);
  if (!manifest) {
    throw new Error(
      `no deck list for ${leader} and no catalog list for that Leader`,
    );
  }
  return Object.entries(manifest.cards).flatMap(([card, copies]) =>
    Array<string>(copies).fill(card),
  );
}

function countCards(cards: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const card of cards) counts[card] = (counts[card] ?? 0) + 1;
  return counts;
}

/**
 * Plays the seeded game to `turn` with `turnPlayer` to act, through the
 * engine's own `pass`, so the DON!! and draws on the way are the engine's.
 */
function advanceTo(
  state: GameState,
  turn: number,
  turnPlayer: PlayerId,
): GameState {
  let guard = 0;
  while (state.turn < turn || state.activePlayer !== turnPlayer) {
    if (guard++ > 4 * turn + 8) throw new Error(`could not reach turn ${turn}`);
    const action = getLegalActions(state, state.activePlayer).find(
      (candidate) =>
        candidate.type === "pass" ||
        (candidate.type === "mulligan-decision" &&
          candidate.decision === "keep"),
    );
    if (!action) throw new Error(`no pass on the way to turn ${turn}`);
    state = applyAction(state, { ...action, revision: state.revision }).state;
  }
  return state;
}

/**
 * Hands out the cards a zone needs from what is left of a deck list: named
 * cards by number, hidden ones from whatever remains. A card the sim names
 * that the list has run out of is still placed -- the sim is the authority
 * on what is on its table -- so a list that disagrees cannot block a decision.
 */
class CardPool {
  readonly #remaining: string[];
  #next = 1;

  constructor(
    readonly player: PlayerId,
    list: readonly string[],
  ) {
    this.#remaining = [...list];
  }

  named(cardNumber: string): CardInstance {
    const index = this.#remaining.indexOf(cardNumber);
    if (index >= 0) this.#remaining.splice(index, 1);
    return this.#instance(cardNumber);
  }

  hidden(count: number): CardInstance[] {
    return this.#remaining
      .splice(0, Math.min(count, this.#remaining.length))
      .map((card) => this.#instance(card));
  }

  rest(): CardInstance[] {
    return this.hidden(this.#remaining.length);
  }

  #instance(cardNumber: string): CardInstance {
    return {
      instanceId: `${this.player}-card-${this.#next++}`,
      cardNumber,
    };
  }
}

/**
 * The engine's number for a sim card id. The sim names a card by its printed
 * number, with a suffix for an alternate printing; the rules are the base
 * card's either way.
 */
export function engineCardNumber(simCardNumber: string): string {
  const number = simCardNumber.trim().toUpperCase().split("_")[0]!;
  if (!cards.get(number)) {
    throw new Error(`${simCardNumber} is not a card this engine knows`);
  }
  return number;
}

function normalized(snapshot: TableSnapshot): TableSnapshot {
  const card = <T extends { cardNumber: string }>(entry: T): T => ({
    ...entry,
    cardNumber: engineCardNumber(entry.cardNumber),
  });
  const side = (entry: SimSide): SimSide => ({
    ...entry,
    ...(entry.deckList
      ? { deckList: entry.deckList.map(engineCardNumber) }
      : {}),
    leader: card(entry.leader),
    hand: Array.isArray(entry.hand) ? entry.hand.map(card) : entry.hand,
    characters: entry.characters.map(card),
    stage: entry.stage ? card(entry.stage) : null,
    trash: entry.trash.map(card),
  });
  return {
    ...snapshot,
    players: { p1: side(snapshot.players.p1), p2: side(snapshot.players.p2) },
  };
}

export function importPosition(simSnapshot: TableSnapshot): ImportedPosition {
  const snapshot = normalized(simSnapshot);
  const lists = {
    p1: deckListFor(snapshot.players.p1),
    p2: deckListFor(snapshot.players.p2),
  };
  const deck = (player: PlayerId): ResolvedDeck => ({
    leader: snapshot.players[player].leader.cardNumber,
    cards: lists[player],
  });
  // Turn 1 is the first player's, so the seat to act on an odd turn went first.
  const startingPlayer =
    snapshot.turn % 2 === 1 ? snapshot.turnPlayer : other(snapshot.turnPlayer);
  let state = createGame({
    gameId: "optcgsim",
    p1: deck("p1"),
    p2: deck("p2"),
    seed: "optcgsim",
    startingPlayer,
  });
  if (snapshot.step.kind !== "mulligan") {
    state = advanceTo(state, snapshot.turn, snapshot.turnPlayer);
  }

  const simIds = new Map<string, string>();
  for (const player of SEATS) {
    placeSide(state, player, snapshot.players[player], lists[player], simIds);
  }
  // Power last: a [Your Turn] or Leader-wide static reads the whole table.
  for (const player of SEATS) {
    carryPower(state, player, snapshot.players[player], simIds);
  }

  state.pendingEffect = null;
  state.pendingTrigger = null;
  state.activeAttack = null;
  state.turnPlayerId = snapshot.turnPlayer;
  const step = snapshot.step;
  if (step.kind === "mulligan") {
    if (state.activePlayer !== snapshot.seat) {
      const keep = getLegalActions(state, state.activePlayer).find(
        (action) => action.type === "mulligan-decision",
      );
      if (keep) {
        state = applyAction(state, { ...keep, revision: state.revision }).state;
      }
    }
  } else if (step.kind === "main") {
    state.phase = "main";
    state.activePlayer = snapshot.turnPlayer;
  } else {
    const engineId = (simId: string): string => {
      for (const [id, sim] of simIds) if (sim === simId) return id;
      throw new Error(`the attack names ${simId}, which is not on the table`);
    };
    const attacker = engineId(step.attacker);
    const attackerPlayer = snapshot.turnPlayer;
    state.phase = step.kind;
    state.activePlayer = other(attackerPlayer);
    state.activeAttack = {
      attackerPlayerId: attackerPlayer,
      defenderPlayerId: other(attackerPlayer),
      attackerInstanceId: attacker,
      targetInstanceId: engineId(step.target),
      battleAttackBonus:
        step.attackPower - currentPower(state, attackerPlayer, attacker),
      counterPower: step.counterPower ?? 0,
    };
  }

  // Partial DON!!: a Leader with a smaller DON!! deck, or a sim that counts
  // DON!! the engine would not, still yields a position worth asking about.
  assertGameStateInvariants(state, { exactDonCount: false });
  return {
    state,
    simIds,
    ownDeck: countCards(lists[snapshot.seat]),
  };
}

function placeSide(
  state: GameState,
  player: PlayerId,
  side: SimSide,
  list: readonly string[],
  simIds: Map<string, string>,
): void {
  const target = state.players[player];
  const pool = new CardPool(player, list);
  const named = (card: { id: string; cardNumber: string }): CardInstance => {
    const instance = pool.named(card.cardNumber);
    simIds.set(instance.instanceId, card.id);
    return instance;
  };

  const don = [
    ...target.donDeck,
    ...target.activeDon,
    ...target.restedDon,
    ...target.leaderAttachedDon,
    ...target.board.flatMap((card) => card.attachedDon ?? []),
  ];
  const takeDon = (count: number): string[] => don.splice(0, count);

  const field = (card: SimFieldCard): BoardCard => ({
    ...named(card),
    rested: card.rested,
    attachedDon: takeDon(card.don),
    // Played on an earlier turn unless the sim says otherwise: that is the
    // only thing `playedTurn` decides, whether the card may attack yet.
    playedTurn: card.playedThisTurn ? state.turn : state.turn - 1,
  });

  target.leaderCardNumber = side.leader.cardNumber;
  target.leaderRested = side.leader.rested;
  target.leaderAttachedDon = takeDon(side.leader.don);
  target.leaderPowerModifiers = [];
  simIds.set(`${player}-leader`, side.leader.id);
  target.board = side.characters.map(field);
  target.stage = side.stage
    ? { ...named(side.stage), rested: side.stage.rested }
    : null;
  target.trash = side.trash.map(named);
  target.hand = Array.isArray(side.hand)
    ? side.hand.map(named)
    : pool.hidden(side.hand);
  target.life = pool.hidden(side.life);
  target.deck = pool.rest().slice(0, side.deckCount);
  target.activeDon = takeDon(side.don.active);
  target.restedDon = takeDon(side.don.rested);
  target.donDeck = don;
}

function carryPower(
  state: GameState,
  player: PlayerId,
  side: SimSide,
  simIds: Map<string, string>,
): void {
  const target = state.players[player];
  const engineIdOf = new Map(
    [...simIds].map(([engineId, simId]) => [simId, engineId]),
  );
  const fields = [side.leader, ...side.characters];
  for (const card of fields) {
    if (card.power === undefined) continue;
    const instanceId = engineIdOf.get(card.id);
    if (!instanceId) continue;
    const difference = card.power - currentPower(state, player, instanceId);
    if (difference === 0) continue;
    const modifier = { amount: difference, expiresAtTurn: state.turn };
    if (instanceId === `${player}-leader`) {
      target.leaderPowerModifiers.push(modifier);
    } else {
      const boardCard = target.board.find(
        (candidate) => candidate.instanceId === instanceId,
      );
      if (boardCard) {
        boardCard.powerModifiers = [
          ...(boardCard.powerModifiers ?? []),
          modifier,
        ];
      }
    }
  }
}
