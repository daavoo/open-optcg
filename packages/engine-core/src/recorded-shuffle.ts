/**
 * Shuffles whose outcome was decided somewhere else.
 *
 * A game replays from its seed because every shuffle draws on the serialized
 * RNG. A game that was dealt by another table -- another simulator, a deck of
 * real cards -- has no seed that reproduces it, so its record carries the
 * order each shuffle left the cards in, and the engine deals that order
 * instead of drawing one. Everything else about the game is unchanged: the
 * same actions are legal, and the record still replays action by action.
 *
 * The RNG is advanced by every shuffle whether or not a recorded order
 * replaces its outcome, so supplying an order for one shuffle leaves every
 * other random outcome of the game where it was.
 */
import type { PlayerId, RecordedShuffles } from "@one-piece-sim/protocol";
import type { GameState } from "./model.js";
import { shuffle, type RngState } from "./rng.js";

interface Shuffled<T> {
  items: T[];
  state: RngState;
}

/**
 * `cards` in the recorded order: for each card number in turn, the first card
 * of that number not yet placed. Which copy lands where is not something a
 * record can know, and two copies of a card are the same card to the rules.
 */
function inRecordedOrder<T extends { cardNumber: string }>(
  cards: readonly T[],
  recorded: readonly string[],
): T[] {
  const left = [...cards];
  const ordered = recorded.map((cardNumber) => {
    const index = left.findIndex((card) => card.cardNumber === cardNumber);
    if (index < 0) {
      throw new Error(
        `RECORDED_SHUFFLE_MISMATCH: the recorded order names ${cardNumber}, which is not among the cards being shuffled`,
      );
    }
    return left.splice(index, 1)[0]!;
  });
  if (left.length > 0) {
    throw new Error(
      `RECORDED_SHUFFLE_MISMATCH: the recorded order names ${recorded.length} cards and ${cards.length} are being shuffled`,
    );
  }
  return ordered;
}

/**
 * One shuffle of `playerId`'s cards: the next recorded order when the game
 * has one for it, the RNG's otherwise.
 */
export function shuffleRecorded<T extends { cardNumber: string }>(
  cards: readonly T[],
  rng: RngState,
  recorded: readonly string[] | undefined,
): Shuffled<T> {
  const drawn = shuffle(cards, rng);
  return recorded
    ? { items: inRecordedOrder(cards, recorded), state: drawn.state }
    : drawn;
}

/** The state `createGame` keeps for a game given recorded shuffles. */
export function initialRecordedShuffles(
  recorded: RecordedShuffles | undefined,
  opening: Record<PlayerId, readonly { instanceId: string }[]>,
): GameState["recordedShuffles"] {
  if (!recorded) return undefined;
  return {
    orders: {
      p1: recorded.p1.map((order) => [...order]),
      p2: recorded.p2.map((order) => [...order]),
    },
    dealt: {
      p1: [opening.p1.map((card) => card.instanceId)],
      p2: [opening.p2.map((card) => card.instanceId)],
    },
  };
}

/** A shuffle during the game, of cards that are `playerId`'s. */
export function shuffleCards<
  T extends { instanceId: string; cardNumber: string },
>(state: GameState, playerId: PlayerId, cards: readonly T[]): T[] {
  const recording = state.recordedShuffles;
  const shuffled = shuffleRecorded(
    cards,
    state.rngState,
    recording?.orders[playerId][recording.dealt[playerId].length],
  );
  state.rngState = shuffled.state;
  recording?.dealt[playerId].push(
    shuffled.items.map((card) => card.instanceId),
  );
  return shuffled.items;
}
