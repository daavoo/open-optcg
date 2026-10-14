import { cards, type CardDatabase } from "@one-piece-sim/cards";

import type { CardInstance, GameState, PlayerState } from "./model.js";
import { pendingEffectChain } from "./model.js";

export class GameInvariantError extends Error {
  constructor(message: string) {
    super(`GAME_INVARIANT: ${message}`);
  }
}

function fail(message: string): never {
  throw new GameInvariantError(message);
}

function pendingCards(state: GameState, playerId: "p1" | "p2"): CardInstance[] {
  const cards: CardInstance[] = [];
  for (const pending of pendingEffectChain(state.pendingEffect)) {
    if (
      (pending.kind === "search-top-five" || pending.kind === "navy-search") &&
      pending.playerId === playerId
    ) {
      cards.push(...pending.revealed);
    }
    if (
      pending.kind === "character-area-replacement" &&
      pending.playerId === playerId
    ) {
      cards.push(pending.card);
    }
  }
  if (state.pendingTrigger?.playerId === playerId) {
    cards.push(state.pendingTrigger.card);
  }
  return cards;
}

function ownedCards(state: GameState, playerId: "p1" | "p2"): CardInstance[] {
  const player = state.players[playerId];
  const heldPendingCards = pendingCards(state, playerId);
  return [
    ...player.deck,
    ...player.hand,
    ...player.life,
    ...player.board,
    ...(player.stage ? [player.stage] : []),
    ...player.trash,
    ...heldPendingCards,
  ];
}

function ownedDon(player: PlayerState): string[] {
  return [
    ...player.donDeck,
    ...player.activeDon,
    ...player.restedDon,
    ...player.leaderAttachedDon,
    ...player.board.flatMap((card) => card.attachedDon ?? []),
  ];
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length)
    fail(`${label} contains duplicates`);
}

function assertSameIdentities(
  before: readonly string[],
  after: readonly string[],
  label: string,
): void {
  const left = [...before].sort();
  const right = [...after].sort();
  if (
    left.length !== right.length ||
    left.some((value, index) => value !== right[index])
  ) {
    fail(`${label} identities changed`);
  }
}

export function assertGameStateInvariants(
  state: GameState,
  options: { exactDonCount?: boolean; uniqueIdentities?: boolean } = {},
  db: CardDatabase = cards,
): void {
  if (!Number.isInteger(state.turn) || state.turn < 1)
    fail("turn must be positive");
  if (!Number.isInteger(state.revision) || state.revision < 0) {
    fail("revision must be non-negative");
  }
  if (state.eventSequence !== state.events.length) {
    fail("event sequence must equal the public event count");
  }
  if (state.phase === "finished" && !state.winner) {
    fail("finished games must have a winner");
  }
  if (state.phase !== "finished" && state.winner) {
    fail("unfinished games cannot have a winner");
  }

  const allCardIds: string[] = [];
  for (const playerId of ["p1", "p2"] as const) {
    const player = state.players[playerId];
    if (player.board.length > 5) fail(`${playerId} board exceeds five cards`);
    const cardIds = ownedCards(state, playerId).map((card) => card.instanceId);
    const donIds = ownedDon(player);
    if (options.uniqueIdentities ?? true) {
      assertUnique(cardIds, `${playerId} cards`);
      assertUnique(donIds, `${playerId} DON!!`);
    }
    // A Leader may print its own DON!! deck size -- OP15-058 Enel deals six --
    // so the total is read off the Leader rather than fixed at ten. Hard-coding
    // ten made every Enel position fail the check and pushed those tests out of
    // the scenario builder entirely.
    const donTotal = db.facts(player.leaderCardNumber).donDeckSize;
    if ((options.exactDonCount ?? true) && donIds.length !== donTotal) {
      fail(`${playerId} must own exactly ${donTotal} DON!!`);
    }
    allCardIds.push(...cardIds, `${playerId}-leader`);

    const modifiers = [
      ...player.leaderPowerModifiers,
      ...player.board.flatMap((card) => card.powerModifiers ?? []),
    ];
    if (modifiers.some((modifier) => modifier.expiresAtTurn < state.turn)) {
      fail(`${playerId} has an expired power modifier`);
    }
    if (
      player.board
        .flatMap((card) => card.costModifiers ?? [])
        .some((modifier) => modifier.expiresAtTurn < state.turn)
    ) {
      fail(`${playerId} has an expired cost modifier`);
    }
  }
  if (options.uniqueIdentities ?? true) assertUnique(allCardIds, "game cards");
}

export function assertTransitionInvariants(
  previous: GameState,
  next: GameState,
): void {
  assertGameStateInvariants(next, {
    exactDonCount: false,
    uniqueIdentities: false,
  });
  for (const playerId of ["p1", "p2"] as const) {
    assertSameIdentities(
      ownedCards(previous, playerId).map((card) => card.instanceId),
      ownedCards(next, playerId).map((card) => card.instanceId),
      `${playerId} card`,
    );
    assertSameIdentities(
      ownedDon(previous.players[playerId]),
      ownedDon(next.players[playerId]),
      `${playerId} DON!!`,
    );
  }
}
