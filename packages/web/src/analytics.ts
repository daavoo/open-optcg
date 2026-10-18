/**
 * Deck analytics — rules agent vs rules agent.
 *
 * One game is one ordered pair: a deck going *first* against a deck going
 * *second*. Turn order is fixed rather than seeded, because that is the axis the
 * matrix reads on — rows go first, columns go second — and averaging the two
 * orders together is exactly what hides the first-player effect.
 *
 * The unit that crosses process boundaries is an {@link AnalyticsReport}: one
 * record per ordered pair, already aggregated. `tools/analytics-baseline.ts`
 * writes one for the six format decks, and the app's Simulate matchup page
 * aggregates its own run into the same shape; {@link mergeReports} lays one
 * report over another.
 * Raw {@link AnalyticsGame} rows never leave the process that ran them — they
 * are an order of magnitude larger than the aggregate and nothing reads them
 * twice.
 *
 * Everything here is browser-safe and free of DOM access.
 */
import { RegistryRulesAgent, type Agent } from "@one-piece-sim/agents/local";
import { GameService } from "@one-piece-sim/engine-core";
import {
  FORMAT_DECK_IDS,
  requireSupportedDeck,
  resolveDeck,
  type DeckManifest,
} from "@one-piece-sim/decks";
import type {
  GameResultReason,
  PlayerId,
  PublicEvent,
} from "@one-piece-sim/protocol";

export const ANALYTICS_DECK_IDS = FORMAT_DECK_IDS;
export const ANALYTICS_REPORT_VERSION = 1;
export const DEFAULT_MAX_ACTIONS = 800;
export type Seat = "first" | "second";

export interface AnalyticsGame {
  firstDeck: string;
  secondDeck: string;
  seed: string;
  /** Null when the game hit the action ceiling without a winner. */
  winner: Seat | null;
  reason: GameResultReason | null;
  turns: number;
  actions: number;
  /** Card numbers each side played, activated, or countered with. */
  cardsUsed: Record<Seat, readonly string[]>;
  /** The subset of {@link cardsUsed} each side played or activated. */
  cardsPlayed?: Record<Seat, readonly string[]>;
  /** The subset of {@link cardsUsed} each side used as a Counter. */
  cardsCountered?: Record<Seat, readonly string[]>;
  /**
   * Card numbers each side had in hand at one of its own decisions after the
   * mulligan: every chance it had to play or counter with the card. Absent on
   * games recorded before it was kept.
   */
  cardsHeld?: Record<Seat, readonly string[]>;
  /**
   * Every action the game took, in order: with the seed, all a replay needs.
   * Present only when the matchup asked for it ({@link AnalyticsMatchup.recordActions}).
   */
  actionIds?: readonly string[];
}

export interface CardImpact {
  cardNumber: string;
  gamesUsed: number;
  winsUsed: number;
  winRateUsed: number;
  gamesUnused: number;
  winsUnused: number;
  winRateUnused: number;
  /** Win rate with the card used minus win rate without it. */
  delta: number;
  /**
   * Games the card was played or activated, and games it was used as a
   * Counter. One game can hold both, so the two need not sum to gamesUsed.
   */
  gamesPlayed?: number;
  gamesCountered?: number;
  /**
   * The seat's wins among {@link gamesPlayed} and {@link gamesCountered}: a
   * card that wins when it is countered with and loses when it is cast is
   * telling the pilot where it belongs.
   */
  winsPlayed?: number;
  winsCountered?: number;
  /**
   * Games a copy sat in hand at one of the seat's decisions, and how many of
   * those the card was used in. Their ratio is the dead-card signal: drawing
   * is random, so unlike the win-rate split it does not lean on how the game
   * went. Absent when any pooled game predates {@link AnalyticsGame.cardsHeld}.
   */
  gamesHeld?: number;
  gamesUsedWhenHeld?: number;
}

/** One ordered pair, aggregated. This is what the matrix and detail read. */
export interface MatchupRecord {
  firstDeck: string;
  secondDeck: string;
  games: number;
  firstWins: number;
  secondWins: number;
  unfinished: number;
  /** Share of decided games won by the deck going first, or null with none. */
  firstWinRate: number | null;
  averageTurns: number;
  averageActions: number;
  decidedByLife: number;
  decidedByDeckOut: number;
  /**
   * Every card either side used, unfiltered and in card-number order. The
   * minimum-sample rule belongs to the reader, not to the file, so a report
   * built at 25 games stays usable if that threshold ever changes.
   */
  cards: Record<Seat, CardImpact[]>;
}

export interface AnalyticsReport {
  version: typeof ANALYTICS_REPORT_VERSION;
  createdAt: string;
  /** Label for the policy stack that produced it, as deck benchmarks use. */
  rulesVersion: string;
  seedPrefix: string;
  seedsPerMatchup: number;
  maxActions: number;
  /** Matrix order: rows and columns both follow this list. */
  decks: string[];
  matchups: MatchupRecord[];
}

export interface DeckSummary {
  deck: string;
  games: number;
  wins: number;
  winRate: number | null;
  firstGames: number;
  firstWins: number;
  firstWinRate: number | null;
  secondGames: number;
  secondWins: number;
  secondWinRate: number | null;
}

/**
 * Diverging scale for the matrix: two hues either side of an even matchup, with
 * a near-neutral middle band. Bands rather than a continuous gradient because
 * six steps are what a reader can actually tell apart, and because the fill is
 * never the only channel — every cell also carries its number.
 */
export type MatrixBand =
  "cold-3" | "cold-2" | "cold-1" | "warm-1" | "warm-2" | "warm-3" | "empty";

export function winRateBand(winRate: number | null): MatrixBand {
  if (winRate === null) return "empty";
  if (winRate >= 0.65) return "warm-3";
  if (winRate >= 0.575) return "warm-2";
  if (winRate >= 0.5) return "warm-1";
  if (winRate >= 0.425) return "cold-1";
  if (winRate >= 0.35) return "cold-2";
  return "cold-3";
}

/**
 * The 95% range a win rate's true value plausibly lies in, given `wins` of
 * `decided` games: a Wilson score interval, which stays inside 0-1 and does not
 * collapse to a point at a clean sweep the way the textbook p ± 1.96·SE does.
 *
 * A single run is a sample, and at a hundred games two runs of one matchup
 * routinely land ten points apart; the range is what lets a reader tell a
 * matchup from a lucky run.
 */
export function winRateRange(
  wins: number,
  decided: number,
): { low: number; high: number } | null {
  if (decided === 0) return null;
  const z = 1.96;
  const p = wins / decided;
  const z2n = (z * z) / decided;
  const centre = (p + z2n / 2) / (1 + z2n);
  const half =
    (z * Math.sqrt((p * (1 - p)) / decided + z2n / (4 * decided))) / (1 + z2n);
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/* ---------------------------------------------------------------------------
   Playing games
   ------------------------------------------------------------------------ */

export interface AnalyticsMatchup {
  firstDeck: string;
  secondDeck: string;
  seed: string;
  maxActions?: number;
  /**
   * Manifests for deck IDs the shared deck registry does not know, keyed by ID.
   * This is how a deck built in the editor gets swept without being installed
   * anywhere.
   */
  customDecks?: Readonly<Record<string, DeckManifest>>;
  /** Who plays each deck; a deck without one is played by its rules agent. */
  agents?: Partial<Record<"first" | "second", Agent>>;
  /** Keep the game's action list, so it can be replayed as a trace later. */
  recordActions?: boolean;
}

/** Every ordered pair, mirrors included — a mirror measures turn order alone. */
export function matchupPairs(
  decks: readonly string[] = ANALYTICS_DECK_IDS,
): Array<[string, string]> {
  return decks.flatMap((first) =>
    decks.map((second) => [first, second] as [string, string]),
  );
}

/**
 * The pairs a custom deck adds to an existing matrix: both turn orders against
 * every deck already there, plus its own mirror. The rest of the matrix is
 * unchanged by the new deck, so re-running it would only burn time.
 */
export function sweepPairs(
  deck: string,
  against: readonly string[] = ANALYTICS_DECK_IDS,
): Array<[string, string]> {
  const opponents = against.filter((opponent) => opponent !== deck);
  return [
    ...opponents.flatMap(
      (opponent) =>
        [
          [deck, opponent],
          [opponent, deck],
        ] as Array<[string, string]>,
    ),
    [deck, deck],
  ];
}

export function matchupSeed(
  prefix: string,
  firstDeck: string,
  secondDeck: string,
  index: number,
): string {
  return `${prefix}-${firstDeck}-${secondDeck}-${index}`;
}

export async function playAnalyticsGame(
  matchup: AnalyticsMatchup,
): Promise<AnalyticsGame> {
  const { firstDeck, secondDeck, seed } = matchup;
  const maxActions = matchup.maxActions ?? DEFAULT_MAX_ACTIONS;
  const custom = matchup.customDecks ?? {};
  const service = new GameService();
  // p1 always takes the first turn, so the seat is the turn order.
  let observation = service.create({
    p1: resolveDeck(firstDeck, custom[firstDeck]),
    p2: resolveDeck(secondDeck, custom[secondDeck]),
    seed,
    startingPlayer: "p1",
  });
  const agents: Record<PlayerId, Agent> = {
    p1:
      matchup.agents?.first ??
      new RegistryRulesAgent(leaderOf(firstDeck, custom)),
    p2:
      matchup.agents?.second ??
      new RegistryRulesAgent(leaderOf(secondDeck, custom)),
  };
  let actions = 0;
  const actionIds: string[] = [];
  // The deciding player's own hand, which is all an observation shows: a card
  // that can be played or countered with is in hand at one of its owner's
  // decisions, so this sees every chance to use it.
  const held: Record<PlayerId, Set<string>> = { p1: new Set(), p2: new Set() };
  while (observation.phase !== "finished" && actions < maxActions) {
    if (observation.phase !== "mulligan")
      for (const card of observation.self.hand)
        held[observation.activePlayer].add(card.cardNumber);
    const action =
      await agents[observation.activePlayer].chooseAction(observation);
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
    actions += 1;
    if (matchup.recordActions) actionIds.push(action.actionId);
  }
  const decided =
    observation.phase === "finished" && observation.winner !== null;
  const used = cardsUsed(observation.publicEvents);
  const played = cardsUsed(observation.publicEvents, PLAY_EVENTS);
  const countered = cardsUsed(observation.publicEvents, ["counter-used"]);
  return {
    firstDeck,
    secondDeck,
    seed,
    winner: decided ? (observation.winner === "p1" ? "first" : "second") : null,
    reason: decided ? observation.resultReason : null,
    turns: observation.turn,
    actions,
    cardsUsed: { first: used.p1, second: used.p2 },
    cardsPlayed: { first: played.p1, second: played.p2 },
    cardsCountered: { first: countered.p1, second: countered.p2 },
    cardsHeld: { first: [...held.p1].sort(), second: [...held.p2].sort() },
    ...(matchup.recordActions ? { actionIds } : {}),
  };
}

/**
 * A custom deck's policy comes from its Leader, exactly as a registered deck's
 * does, so a sweep deck whose Leader has a policy is piloted by it and one
 * whose Leader has none still runs on the generic rules.
 */
function leaderOf(
  deckId: string,
  custom: Readonly<Record<string, DeckManifest>>,
): string {
  return (custom[deckId] ?? requireSupportedDeck(deckId)).leader;
}

const PLAY_EVENTS = ["card-played", "stage-played", "event-activated"] as const;
const USE_EVENTS = [...PLAY_EVENTS, "counter-used"] as const;

function cardsUsed(
  events: readonly PublicEvent[],
  types: readonly (typeof USE_EVENTS)[number][] = USE_EVENTS,
): Record<PlayerId, string[]> {
  const seen: Record<PlayerId, Set<string>> = { p1: new Set(), p2: new Set() };
  for (const event of events) {
    if ((types as readonly string[]).includes(event.type))
      seen[(event as { playerId: PlayerId }).playerId].add(
        (event as { cardNumber: string }).cardNumber,
      );
  }
  return { p1: [...seen.p1].sort(), p2: [...seen.p2].sort() };
}

/* ---------------------------------------------------------------------------
   Sample games
   ------------------------------------------------------------------------ */

/**
 * One slot of a run's sample: a deck, and the seat it won from. A sample holds
 * at most one game per slot, so a reader gets each deck's win on the play and
 * its win on the draw rather than whichever wins happened to come first.
 */
export interface SampleSlot {
  deck: string;
  seat: Seat;
}

/**
 * A won game kept whole, so it can be replayed as a trace. `order` is the
 * game's place in the run -- the same for any split of the run over workers
 * -- and the lowest order wins a slot, so which game a slot holds does not
 * depend on which worker happened to finish first.
 */
export interface SampleGame {
  firstDeck: string;
  secondDeck: string;
  seed: string;
  winner: Seat;
  order: number;
  actionIds: readonly string[];
}

export function sampleSlotKey(slot: SampleSlot): string {
  return `${slot.seat}|${slot.deck}`;
}

/** The slot a game fills: its winner's deck and seat, or none if undecided. */
export function sampleSlotOf(game: {
  firstDeck: string;
  secondDeck: string;
  winner: Seat | null;
}): SampleSlot | null {
  if (game.winner === null) return null;
  return {
    deck: game.winner === "first" ? game.firstDeck : game.secondDeck,
    seat: game.winner,
  };
}

/**
 * The slots a matchup's sample can fill, in the order they are listed: each
 * deck going first, then going second. A mirror has one deck, so two slots.
 */
export function sampleSlots(self: string, opponent: string): SampleSlot[] {
  const decks = self === opponent ? [self] : [self, opponent];
  return decks.flatMap((deck) =>
    (["first", "second"] as const).map((seat) => ({ deck, seat })),
  );
}

/**
 * Offer a won game to the sample, keyed by slot. It is kept when its slot is
 * empty or holds a game later in the run; returns whether it was kept, which
 * is what lets a caller drop the action list of a game that was not.
 */
export function offerSample(
  samples: Map<string, SampleGame>,
  game: SampleGame,
): boolean {
  const slot = sampleSlotOf(game);
  if (!slot) return false;
  const key = sampleSlotKey(slot);
  const held = samples.get(key);
  if (held && held.order <= game.order) return false;
  samples.set(key, game);
  return true;
}

/** The sample laid out by slot: what fills each, and which stayed empty. */
export function sampleContents(
  samples: readonly SampleGame[],
  self: string,
  opponent: string,
): {
  filled: Array<{ slot: SampleSlot; game: SampleGame }>;
  missing: SampleSlot[];
} {
  const bySlot = new Map<string, SampleGame>();
  for (const game of samples) offerSample(bySlot, game);
  const filled: Array<{ slot: SampleSlot; game: SampleGame }> = [];
  const missing: SampleSlot[] = [];
  for (const slot of sampleSlots(self, opponent)) {
    const game = bySlot.get(sampleSlotKey(slot));
    if (game) filled.push({ slot, game });
    else missing.push(slot);
  }
  return { filled, missing };
}

/* ---------------------------------------------------------------------------
   Games in, report out
   ------------------------------------------------------------------------ */

export interface SummarizeOptions {
  decks?: readonly string[];
  rulesVersion?: string;
  seedPrefix?: string;
  seedsPerMatchup?: number;
  maxActions?: number;
  createdAt?: string;
}

export function summarizeGames(
  games: readonly AnalyticsGame[],
  options: SummarizeOptions = {},
): AnalyticsReport {
  const decks =
    options.decks ??
    [
      ...new Set(games.flatMap((game) => [game.firstDeck, game.secondDeck])),
    ].sort();
  const pairs = [
    ...new Set(games.map((game) => `${game.firstDeck}|${game.secondDeck}`)),
  ];
  return {
    version: ANALYTICS_REPORT_VERSION,
    createdAt: options.createdAt ?? new Date().toISOString(),
    rulesVersion: options.rulesVersion ?? "current",
    seedPrefix: options.seedPrefix ?? "analytics",
    seedsPerMatchup: options.seedsPerMatchup ?? 0,
    maxActions: options.maxActions ?? DEFAULT_MAX_ACTIONS,
    decks: [...decks],
    matchups: pairs.map((pair) => {
      const [firstDeck, secondDeck] = pair.split("|") as [string, string];
      return summarizeMatchup(games, firstDeck, secondDeck);
    }),
  };
}

function summarizeMatchup(
  games: readonly AnalyticsGame[],
  firstDeck: string,
  secondDeck: string,
): MatchupRecord {
  const played = games.filter(
    (game) => game.firstDeck === firstDeck && game.secondDeck === secondDeck,
  );
  const decided = played.filter((game) => game.winner !== null);
  const firstWins = decided.filter((game) => game.winner === "first").length;
  return {
    firstDeck,
    secondDeck,
    games: played.length,
    firstWins,
    secondWins: decided.length - firstWins,
    unfinished: played.length - decided.length,
    firstWinRate: rate(firstWins, decided.length),
    averageTurns: average(played.map((game) => game.turns)),
    averageActions: average(played.map((game) => game.actions)),
    decidedByLife: played.filter((game) => game.reason === "life").length,
    decidedByDeckOut: played.filter((game) => game.reason === "deck-exhaustion")
      .length,
    cards: {
      first: cardImpact(played, "first"),
      second: cardImpact(played, "second"),
    },
  };
}

/**
 * Win rate of a seat's games split by whether a card was used, per card.
 *
 * This is an association, not a cause: a card that only comes down in long
 * games inherits whatever long games are worth. It answers "which cards show up
 * in the wins" and needs the sample sizes beside it to mean anything, which is
 * why both buckets are always reported.
 */
export function cardImpact(
  games: readonly AnalyticsGame[],
  seat: Seat,
): CardImpact[] {
  const decided = games.filter((game) => game.winner !== null);
  const tracked = decided.every((game) => game.cardsHeld !== undefined);
  // A card drawn and never used is the row this most needs to show, so the
  // list covers every card held as well as every card used.
  const cardNumbers = [
    ...new Set(
      decided.flatMap((game) => [
        ...game.cardsUsed[seat],
        ...(game.cardsHeld?.[seat] ?? []),
      ]),
    ),
  ].sort();
  return cardNumbers.map((cardNumber) => {
    const used = decided.filter((game) =>
      game.cardsUsed[seat].includes(cardNumber),
    );
    const unused = decided.filter(
      (game) => !game.cardsUsed[seat].includes(cardNumber),
    );
    const winsUsed = used.filter((game) => game.winner === seat).length;
    const winsUnused = unused.filter((game) => game.winner === seat).length;
    const winRateUsed = rate(winsUsed, used.length) ?? 0;
    const winRateUnused = rate(winsUnused, unused.length) ?? 0;
    const held = decided.filter((game) =>
      game.cardsHeld?.[seat].includes(cardNumber),
    );
    const played = used.filter((game) =>
      game.cardsPlayed?.[seat].includes(cardNumber),
    );
    const countered = used.filter((game) =>
      game.cardsCountered?.[seat].includes(cardNumber),
    );
    return {
      cardNumber,
      gamesUsed: used.length,
      winsUsed,
      winRateUsed,
      gamesUnused: unused.length,
      winsUnused,
      winRateUnused,
      delta: round(winRateUsed - winRateUnused),
      ...(tracked
        ? {
            gamesPlayed: played.length,
            winsPlayed: played.filter((game) => game.winner === seat).length,
            gamesCountered: countered.length,
            winsCountered: countered.filter((game) => game.winner === seat)
              .length,
            gamesHeld: held.length,
            gamesUsedWhenHeld: held.filter((game) =>
              game.cardsUsed[seat].includes(cardNumber),
            ).length,
          }
        : {}),
    };
  });
}

/* ---------------------------------------------------------------------------
   Reading a report
   ------------------------------------------------------------------------ */

export function emptyReport(
  decks: readonly string[] = ANALYTICS_DECK_IDS,
): AnalyticsReport {
  return summarizeGames([], { decks, createdAt: "" });
}

export function matchupRecord(
  report: AnalyticsReport,
  firstDeck: string,
  secondDeck: string,
): MatchupRecord {
  return (
    report.matchups.find(
      (record) =>
        record.firstDeck === firstDeck && record.secondDeck === secondDeck,
    ) ?? summarizeMatchup([], firstDeck, secondDeck)
  );
}

/**
 * One matchup read from both sides of the table.
 *
 * The matrix stores ordered pairs because turn order is the axis it reads on,
 * but a reader asking "how does my deck do against theirs" means both orders at
 * once: the games where their deck went first are the same matchup with the
 * seats swapped, so the reverse record's *losses* are this deck's wins. Keeping
 * that arithmetic here rather than in the page means the turn-order split and
 * the combined rate can never drift apart.
 *
 * A mirror has only one record and no meaningful "self", so it collapses to the
 * one thing it can measure: `self` is the deck on the play, and `winRate` is
 * what taking the first turn is worth with the decks held equal.
 */
export interface HeadToHead {
  selfDeck: string;
  opponentDeck: string;
  mirror: boolean;
  games: number;
  selfWins: number;
  opponentWins: number;
  unfinished: number;
  /** Share of decided games this deck won in either seat, or null with none. */
  winRate: number | null;
  /** This deck's win rate in the games it took the first turn. */
  onPlay: number | null;
  /** This deck's win rate in the games it took the second turn. */
  onDraw: number | null;
  /** `onPlay` minus `onDraw`: what the first turn is worth in this matchup. */
  turnOrderSwing: number | null;
  averageTurns: number;
  decidedByLife: number;
  decidedByDeckOut: number;
  /** Each side's card impact with both turn orders pooled. */
  cards: { self: CardImpact[]; opponent: CardImpact[] };
}

export function headToHead(
  report: AnalyticsReport,
  selfDeck: string,
  opponentDeck: string,
): HeadToHead {
  const forward = matchupRecord(report, selfDeck, opponentDeck);
  const mirror = selfDeck === opponentDeck;
  if (mirror) {
    const onPlay = forward.firstWinRate;
    return {
      selfDeck,
      opponentDeck,
      mirror,
      games: forward.games,
      selfWins: forward.firstWins,
      opponentWins: forward.secondWins,
      unfinished: forward.unfinished,
      winRate: onPlay,
      onPlay,
      onDraw: onPlay === null ? null : round(1 - onPlay),
      turnOrderSwing: onPlay === null ? null : round(onPlay - (1 - onPlay)),
      averageTurns: forward.averageTurns,
      decidedByLife: forward.decidedByLife,
      decidedByDeckOut: forward.decidedByDeckOut,
      cards: { self: forward.cards.first, opponent: forward.cards.second },
    };
  }
  const reverse = matchupRecord(report, opponentDeck, selfDeck);
  const selfWins = forward.firstWins + reverse.secondWins;
  const opponentWins = forward.secondWins + reverse.firstWins;
  const onPlay = forward.firstWinRate;
  const onDraw =
    reverse.firstWinRate === null ? null : round(1 - reverse.firstWinRate);
  return {
    selfDeck,
    opponentDeck,
    mirror,
    games: forward.games + reverse.games,
    selfWins,
    opponentWins,
    unfinished: forward.unfinished + reverse.unfinished,
    winRate: rate(selfWins, selfWins + opponentWins),
    onPlay,
    onDraw,
    turnOrderSwing:
      onPlay === null || onDraw === null ? null : round(onPlay - onDraw),
    averageTurns: weightedAverage([
      [forward.averageTurns, forward.games],
      [reverse.averageTurns, reverse.games],
    ]),
    decidedByLife: forward.decidedByLife + reverse.decidedByLife,
    decidedByDeckOut: forward.decidedByDeckOut + reverse.decidedByDeckOut,
    cards: {
      self: mergeCardImpact(forward.cards.first, reverse.cards.second),
      opponent: mergeCardImpact(forward.cards.second, reverse.cards.first),
    },
  };
}

/**
 * Pool card impact across records that share no games — the two turn orders of
 * one matchup, in practice. The four counts each row carries are additive over
 * disjoint game sets, so the pooled rates are the rates of the pooled games and
 * not an average of two averages.
 */
export function mergeCardImpact(
  ...lists: ReadonlyArray<readonly CardImpact[]>
): CardImpact[] {
  const totals = new Map<string, CardImpact>();
  for (const card of lists.flat()) {
    const running = totals.get(card.cardNumber);
    if (!running) {
      totals.set(card.cardNumber, { ...card });
      continue;
    }
    const {
      gamesPlayed,
      winsPlayed,
      gamesCountered,
      winsCountered,
      gamesHeld,
      gamesUsedWhenHeld,
      ...rest
    } = running;
    totals.set(card.cardNumber, {
      ...rest,
      gamesUsed: running.gamesUsed + card.gamesUsed,
      winsUsed: running.winsUsed + card.winsUsed,
      gamesUnused: running.gamesUnused + card.gamesUnused,
      winsUnused: running.winsUnused + card.winsUnused,
      // The held and use-split counts are recorded together or not at all,
      // and a count pooled with one that was never recorded is not a count.
      ...(gamesHeld === undefined || card.gamesHeld === undefined
        ? {}
        : {
            gamesPlayed: (gamesPlayed ?? 0) + (card.gamesPlayed ?? 0),
            winsPlayed: (winsPlayed ?? 0) + (card.winsPlayed ?? 0),
            gamesCountered: (gamesCountered ?? 0) + (card.gamesCountered ?? 0),
            winsCountered: (winsCountered ?? 0) + (card.winsCountered ?? 0),
            gamesHeld: gamesHeld + card.gamesHeld,
            gamesUsedWhenHeld:
              (gamesUsedWhenHeld ?? 0) + (card.gamesUsedWhenHeld ?? 0),
          }),
    });
  }
  return [...totals.values()]
    .map((card) => {
      const winRateUsed = rate(card.winsUsed, card.gamesUsed) ?? 0;
      const winRateUnused = rate(card.winsUnused, card.gamesUnused) ?? 0;
      return {
        ...card,
        winRateUsed,
        winRateUnused,
        delta: round(winRateUsed - winRateUnused),
      };
    })
    .sort((left, right) => left.cardNumber.localeCompare(right.cardNumber));
}

export function buildMatrix(
  report: AnalyticsReport,
  decks: readonly string[] = report.decks,
): MatchupRecord[][] {
  return decks.map((first) =>
    decks.map((second) => matchupRecord(report, first, second)),
  );
}

export function deckSummaries(
  report: AnalyticsReport,
  decks: readonly string[] = report.decks,
): DeckSummary[] {
  return decks.map((deck) => {
    const asFirst = report.matchups.filter(
      (record) => record.firstDeck === deck && record.secondDeck !== deck,
    );
    const asSecond = report.matchups.filter(
      (record) => record.secondDeck === deck && record.firstDeck !== deck,
    );
    const firstWins = sum(asFirst.map((record) => record.firstWins));
    const firstGames = firstWins + sum(asFirst.map((r) => r.secondWins));
    const secondWins = sum(asSecond.map((record) => record.secondWins));
    const secondGames = secondWins + sum(asSecond.map((r) => r.firstWins));
    return {
      deck,
      games: firstGames + secondGames,
      wins: firstWins + secondWins,
      winRate: rate(firstWins + secondWins, firstGames + secondGames),
      firstGames,
      firstWins,
      firstWinRate: rate(firstWins, firstGames),
      secondGames,
      secondWins,
      secondWinRate: rate(secondWins, secondGames),
    };
  });
}

/**
 * Share of decided games won by whoever took the first turn.
 *
 * Mirrors are excluded from the deck standings above, because a deck cannot
 * gain or lose against itself, but they belong here: a mirror is the cleanest
 * possible reading of turn order, with the decks held equal.
 */
export function firstPlayerWinRate(report: AnalyticsReport): number | null {
  const firstWins = sum(report.matchups.map((record) => record.firstWins));
  const secondWins = sum(report.matchups.map((record) => record.secondWins));
  return rate(firstWins, firstWins + secondWins);
}

export function reportGames(report: AnalyticsReport): number {
  return sum(report.matchups.map((record) => record.games));
}

/**
 * A seat's cards ordered by how often they were used: what the deck actually
 * did, which needs no comparison group and so says something at any sample
 * size.
 */
export function usageRows(cards: readonly CardImpact[]): CardImpact[] {
  return [...cards].sort((left, right) => right.gamesUsed - left.gamesUsed);
}

/**
 * Below this many games held, a card's used-when-held rate is not ranked: a
 * card drawn three times and used once is not evidence of a dead slot.
 */
export const MIN_CARD_HELD_GAMES = 10;

/**
 * A card used in at least this share of the games it was in hand is doing its
 * job, so it is not listed as stuck however it ranks against the rest.
 */
export const MAX_STUCK_USE_RATE = 0.5;

/** How often a card was used of the games it was in hand, or null untracked. */
export function useWhenHeld(card: CardImpact): number | null {
  if (card.gamesHeld === undefined || card.gamesUsedWhenHeld === undefined)
    return null;
  return rate(card.gamesUsedWhenHeld, card.gamesHeld);
}

/**
 * The cards that sat in hand: held in enough games, ordered by how rarely they
 * were used when they were. A low rate says the pilot had the card and chose
 * something else -- in this matchup, which is why it is read per matchup and
 * compared across them rather than pooled.
 */
export function stuckRows(cards: readonly CardImpact[]): CardImpact[] {
  return cards
    .filter(
      (card) =>
        (card.gamesHeld ?? 0) >= MIN_CARD_HELD_GAMES &&
        (useWhenHeld(card) ?? 1) < MAX_STUCK_USE_RATE,
    )
    .sort(
      (left, right) =>
        useWhenHeld(left)! - useWhenHeld(right)! ||
        right.gamesHeld! - left.gamesHeld!,
    );
}

/**
 * Lay `extra` over `base`: decks it introduces are appended so they read as
 * added rows and columns, and any pair it re-measures replaces the old record
 * rather than being averaged into it. Re-running a matchup is a correction, not
 * more evidence — the two runs may not even share a rules version.
 */
export function mergeReports(
  base: AnalyticsReport,
  extra: AnalyticsReport,
): AnalyticsReport {
  const replaced = new Set(
    extra.matchups.map((record) => `${record.firstDeck}|${record.secondDeck}`),
  );
  return {
    ...base,
    decks: [
      ...base.decks,
      ...extra.decks.filter((deck) => !base.decks.includes(deck)),
    ],
    matchups: [
      ...base.matchups.filter(
        (record) => !replaced.has(`${record.firstDeck}|${record.secondDeck}`),
      ),
      ...extra.matchups,
    ],
  };
}

export function isAnalyticsReport(value: unknown): value is AnalyticsReport {
  if (typeof value !== "object" || value === null) return false;
  const report = value as Partial<AnalyticsReport>;
  return (
    report.version === ANALYTICS_REPORT_VERSION &&
    Array.isArray(report.decks) &&
    Array.isArray(report.matchups)
  );
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : round(numerator / denominator);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number((sum(values) / values.length).toFixed(2));
}

/** Averages of subsets, re-weighted by how many games each subset held. */
function weightedAverage(parts: ReadonlyArray<[number, number]>): number {
  const games = sum(parts.map(([, count]) => count));
  if (games === 0) return 0;
  return Number(
    (sum(parts.map(([value, count]) => value * count)) / games).toFixed(2),
  );
}
