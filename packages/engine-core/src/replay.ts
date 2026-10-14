import type {
  PlayerId,
  PublicEvent,
  ResolvedDeck,
} from "@one-piece-sim/protocol";
import { GameService } from "./service.js";
import { findOfferedAction } from "./offered-action.js";
import { describeStampMismatch, type RulesStamp } from "./provenance.js";

export interface ReplayFixture {
  version: number;
  seed: string;
  /**
   * Deck ids, which is what a stored fixture can carry: an id is the stable
   * public handle, a decklist would go stale the moment the catalog changed.
   * `replayActions` is handed the resolver that turns them into decks.
   */
  decks: { p1: string; p2: string };
  actions: readonly string[];
  /**
   * The rules this game was recorded under. See `provenance.ts`.
   *
   * Optional so fixtures recorded before stamping still load; absent, an action
   * that has gone illegal is reported as possibly-stale rather than as a bug.
   */
  rules?: RulesStamp;
}

export interface ReplayCheckpoint {
  revision: number;
  events: readonly PublicEvent[];
  stateHash: string;
  winner: PlayerId | null;
  resultReason: string | null;
}

/**
 * Replay a recorded fixture.
 *
 * `resolveDeck` is injected rather than imported because the engine does not
 * know what decks exist -- callers pass `resolveDeck` from
 * `@one-piece-sim/decks`, or their own resolver for a deck the catalog has
 * never heard of.
 */
export function replayActions(
  fixture: ReplayFixture,
  resolveDeck: (deckId: string) => ResolvedDeck,
): ReplayCheckpoint[] {
  if (fixture.version !== 1) throw new Error("UNSUPPORTED_REPLAY_VERSION");
  // Incompatibility first, and by name: a stale recording used to surface as an
  // illegal action at whatever revision diverged, which reads as an engine bug.
  const mismatch = describeStampMismatch(fixture.rules);
  if (mismatch) {
    throw new Error(
      `REPLAY_RULES_MISMATCH: ${mismatch} Re-record it with \`pnpm fixtures:record\`.`,
    );
  }
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(fixture.decks.p1),
    p2: resolveDeck(fixture.decks.p2),
    seed: fixture.seed,
  });
  const checkpoints: ReplayCheckpoint[] = [];
  for (const actionId of fixture.actions) {
    if (!findOfferedAction(observation.legalActions, actionId)) {
      throw new Error(
        fixture.rules
          ? `REPLAY_ILLEGAL_ACTION: ${actionId}`
          : `REPLAY_ILLEGAL_ACTION: ${actionId} (this recording carries no rules stamp, so it may predate a rules change; re-record it with \`pnpm fixtures:record\`)`,
      );
    }
    observation = service.act(
      observation.gameId,
      observation.revision,
      actionId,
    );
    checkpoints.push({
      revision: observation.revision,
      events: structuredClone(observation.publicEvents),
      stateHash: observation.stateHash,
      winner: observation.winner,
      resultReason: observation.resultReason,
    });
  }
  return checkpoints;
}
