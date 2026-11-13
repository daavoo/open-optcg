/**
 * A sealed Swiss event: the player and AI players, each with a pool of their
 * own, paired by record.
 *
 * The field sets the rounds: as many as it takes to leave one player
 * undefeated, log2 of the field rounded up -- one against 1 AI player, three
 * against 4, four against 8. An odd field gives one AI player a bye each round
 * (a win, the lowest-placed one without a bye yet); the person always plays.
 * Every round pairs players on the same record and, where the field allows,
 * never pairs two players a second time. The
 * player's table is a match on the board; the other tables are AI against AI,
 * played out by the engine off the main thread (see `playTables` in
 * `SealedContext`), so the standings are games that happened rather than a
 * draw of results.
 *
 * Everything here is DOM-free and deterministic in the event's seed.
 */
import {
  autoBuildSealedDeckBest,
  sealedDeckManifest,
  type DeckManifest,
  type SealedPool,
} from "@one-piece-sim/decks";
import { seedRng, shuffle } from "@one-piece-sim/protocol";
import { openSealedPool } from "./sealed-mode.js";

/** How many AI players an event seats when none is chosen. */
export const SWISS_BOTS = 4;
/** The fields the pre-release page offers, in AI players. */
export const SWISS_BOT_OPTIONS = [1, 4, 8] as const;
/** The most AI players an event seats: a round's AI tables are played out in
    the background, and a bigger field keeps the person waiting on them. */
export const SWISS_MAX_BOTS = 31;

/** The rounds a field of `players` runs: until one player can be unbeaten. */
export function swissRounds(players: number): number {
  return Math.max(1, Math.ceil(Math.log2(players)));
}
/** The opponent seat of a bye table: no one, and the table's seat wins it. */
export const BYE = -2;
/** The player's seat in {@link SwissEvent.players}. */
export const YOU = 0;

export interface SwissPlayer {
  readonly name: string;
  /** The deck the player brings; the person's is the one they built. */
  readonly deck: DeckManifest;
}

/** One table of one round, by seat index into {@link SwissEvent.players}. */
export interface SwissTable {
  readonly a: number;
  readonly b: number;
  /**
   * The seat that won, or null while the table is still playing. A game that
   * reaches the action ceiling without a winner is a loss for both, so `-1`.
   */
  winner: number | null;
}

export interface SwissEvent {
  readonly seed: string;
  readonly expansion: string;
  readonly players: readonly SwissPlayer[];
  /** How many rounds the event runs. */
  readonly roundCount: number;
  /** Rounds paired so far, oldest first; the last may still be playing. */
  readonly rounds: SwissTable[][];
}

/**
 * Seats the person's deck beside `bots` AI players, each opening six packs of
 * the same set and bringing the auto-builder's deck, as the single-match
 * opponent does.
 */
export function createSwissEvent(
  seed: string,
  pool: SealedPool,
  deck: Record<string, number>,
  bots: number = SWISS_BOTS,
): SwissEvent {
  if (!Number.isInteger(bots) || bots < 1 || bots > SWISS_MAX_BOTS)
    throw new Error(
      `A Swiss event seats 1 to ${SWISS_MAX_BOTS} AI players, not ${bots}.`,
    );
  const you: SwissPlayer = {
    name: "You",
    deck: sealedDeckManifest({ cards: deck }, pool),
  };
  const others = Array.from({ length: bots }, (_, index) => {
    const { pool: aiPool } = openSealedPool(
      `${seed}:seat-${index + 1}`,
      pool.expansion,
    );
    return {
      name: `AI player ${index + 1}`,
      deck: sealedDeckManifest(autoBuildSealedDeckBest(aiPool), aiPool),
    };
  });
  const event: SwissEvent = {
    seed,
    expansion: pool.expansion,
    roundCount: swissRounds(bots + 1),
    players: [you, ...others],
    rounds: [],
  };
  event.rounds.push(pairRound(event));
  return event;
}

export function wins(event: SwissEvent, seat: number): number {
  return event.rounds.flat().filter((table) => table.winner === seat).length;
}

export function losses(event: SwissEvent, seat: number): number {
  return event.rounds
    .flat()
    .filter(
      (table) =>
        (table.a === seat || table.b === seat) &&
        table.winner !== null &&
        table.winner !== seat,
    ).length;
}

/** Who the seat has finished a match against; a table still playing has not
    yet given either side a result to be weighed by, and a bye has no one. */
function opponents(event: SwissEvent, seat: number): number[] {
  return event.rounds
    .flat()
    .filter((table) => table.winner !== null && table.b !== BYE)
    .flatMap((table) =>
      table.a === seat ? [table.b] : table.b === seat ? [table.a] : [],
    );
}

/** Wins over games played, floored at a third as tournament tiebreakers are,
    so one opponent's bad day does not sink everyone who played them. */
function winRate(event: SwissEvent, seat: number): number {
  const played = wins(event, seat) + losses(event, seat);
  return played ? Math.max(1 / 3, wins(event, seat) / played) : 1 / 3;
}

/** Opponents' mean win rate: the usual first tiebreaker between equal records. */
export function opponentWinRate(event: SwissEvent, seat: number): number {
  const faced = opponents(event, seat);
  if (!faced.length) return 0;
  return (
    faced.reduce((sum, opponent) => sum + winRate(event, opponent), 0) /
    faced.length
  );
}

/** Seats ranked by wins, then fewest losses (mid-round, a table still playing
    has one fewer result in), then opponents' win rate, then seat order. */
export function standings(event: SwissEvent): number[] {
  return event.players
    .map((_, seat) => seat)
    .sort(
      (x, y) =>
        wins(event, y) - wins(event, x) ||
        losses(event, x) - losses(event, y) ||
        opponentWinRate(event, y) - opponentWinRate(event, x) ||
        x - y,
    );
}

export function roundComplete(round: readonly SwissTable[]): boolean {
  return round.every((table) => table.winner !== null);
}

export function eventComplete(event: SwissEvent): boolean {
  return (
    event.rounds.length === event.roundCount &&
    roundComplete(event.rounds.at(-1)!)
  );
}

/** The person's table in the current round. */
export function yourTable(event: SwissEvent): SwissTable {
  return event.rounds
    .at(-1)!
    .find((table) => table.a === YOU || table.b === YOU)!;
}

export function yourOpponent(event: SwissEvent): number {
  const table = yourTable(event);
  return table.a === YOU ? table.b : table.a;
}

/**
 * The next round's tables. The first round is a seeded shuffle; later ones go
 * down the standings pairing each player with the highest-placed player they
 * have not met, backing up when that would strand someone at the bottom with
 * only rematches left. An odd field first sets aside a bye, from the bottom
 * up; a small field that has run out of new pairings takes rematches rather
 * than stopping.
 */
export function pairRound(event: SwissEvent): SwissTable[] {
  const round = event.rounds.length;
  const order =
    round === 0
      ? shuffle(
          event.players.map((_, seat) => seat),
          seedRng(`${event.seed}:round-1`),
        ).items
      : standings(event);
  const met = new Set(
    event.rounds
      .flat()
      .flatMap((table) => [`${table.a}:${table.b}`, `${table.b}:${table.a}`]),
  );
  const pair = (left: number[], rematches: boolean): SwissTable[] | null => {
    if (!left.length) return [];
    const [first, ...rest] = left;
    for (const other of rest) {
      if (!rematches && met.has(`${first}:${other}`)) continue;
      const tail = pair(
        rest.filter((seat) => seat !== other),
        rematches,
      );
      if (tail) return [{ a: first!, b: other, winner: null }, ...tail];
    }
    return null;
  };
  const hadBye = new Set(
    event.rounds
      .flat()
      .filter((table) => table.b === BYE)
      .map((table) => table.a),
  );
  const byes =
    order.length % 2 === 0
      ? [null]
      : [...order]
          .reverse()
          .filter((seat) => seat !== YOU)
          .sort((x, y) => Number(hadBye.has(x)) - Number(hadBye.has(y)));
  for (const rematches of [false, true]) {
    for (const bye of byes) {
      const tables = pair(
        order.filter((seat) => seat !== bye),
        rematches,
      );
      if (!tables) continue;
      return bye === null
        ? tables
        : [...tables, { a: bye, b: BYE, winner: bye }];
    }
  }
  throw new Error(`Round ${round + 1} cannot be paired.`);
}

/** Records a table's result and, once the round is in and rounds remain,
    pairs the next one. Returns whether a new round was paired. */
export function recordResult(
  event: SwissEvent,
  table: SwissTable,
  winner: number,
): boolean {
  table.winner = winner;
  const current = event.rounds.at(-1)!;
  if (!roundComplete(current) || event.rounds.length >= event.roundCount)
    return false;
  event.rounds.push(pairRound(event));
  return true;
}

/** The current round's AI-against-AI tables that still need playing. */
export function pendingAiTables(event: SwissEvent): SwissTable[] {
  return event.rounds
    .at(-1)!
    .filter(
      (table) => table.winner === null && table.a !== YOU && table.b !== YOU,
    );
}
