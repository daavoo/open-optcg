/**
 * The Swiss event's AI-against-AI tables, played out by the engine in the
 * analytics worker -- the same headless loop the analytics screen sweeps
 * matchups with -- so the page stays responsive while the person plays their
 * own table.
 */
import type { DeckManifest } from "@one-piece-sim/decks";
import { DEFAULT_MAX_ACTIONS, type Seat } from "./analytics.js";
import type {
  AnalyticsPilot,
  AnalyticsRequest,
  AnalyticsResponse,
} from "./analytics-worker.js";
import { sendLearnedModel } from "./learned-model.js";

/** One table: the first deck takes the first turn. */
export interface HeadlessTable {
  readonly first: DeckManifest;
  readonly second: DeckManifest;
}

let runs = 0;

/**
 * Each table's winning seat, or null for a game that hit the action ceiling,
 * in the order given. Rejects when the worker reports an error, so the caller
 * can fall back to another pilot.
 */
export function playHeadlessTables(
  tables: readonly HeadlessTable[],
  seedPrefix: string,
  pilot: AnalyticsPilot,
): Promise<Array<Seat | null>> {
  const worker = new Worker(
    URL.createObjectURL(
      new Blob([__ANALYTICS_WORKER_SOURCE__], { type: "text/javascript" }),
    ),
  );
  if (pilot === "scorer") sendLearnedModel(worker);
  runs += 1;
  const runId = runs;
  const results = new Map<string, Seat | null>();
  const key = (first: string, second: string) => `${first}\u0000${second}`;
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      worker.terminate();
      if (error) reject(error);
      else
        resolve(
          tables.map(
            (table) =>
              results.get(key(table.first.id, table.second.id)) ?? null,
          ),
        );
    };
    worker.addEventListener(
      "message",
      (event: MessageEvent<AnalyticsResponse>) => {
        const response = event.data;
        if (response.runId !== runId) return;
        if (response.type === "game")
          results.set(
            key(response.game.firstDeck, response.game.secondDeck),
            response.game.winner,
          );
        else if (response.type === "error") finish(new Error(response.message));
        else if (response.type === "done") finish();
      },
    );
    worker.addEventListener("error", () => {
      finish(new Error("The tables' worker stopped unexpectedly."));
    });
    const request: AnalyticsRequest = {
      type: "run",
      runId,
      pairs: tables.map((table) => [table.first.id, table.second.id]),
      seeds: 1,
      seedPrefix,
      maxActions: DEFAULT_MAX_ACTIONS,
      customDecks: Object.fromEntries(
        tables.flatMap((table) => [
          [table.first.id, table.first],
          [table.second.id, table.second],
        ]),
      ),
      pilot,
    };
    worker.postMessage(request);
  });
}
