/**
 * What the server says about itself.
 *
 * There were no logs and no counters: the first report of a broken server would
 * have been a person saying so. This is the smallest thing that fixes that, and
 * it is deliberately two halves with different costs.
 *
 * A structured `console.log` line is written always. `wrangler tail` reads it,
 * no dashboard is needed, and it costs a deploy nothing to have. A data point
 * is written only when the deploy binds an Analytics Engine dataset -- optional
 * in exactly the way `RATE_LIMITER` is optional, so tests, Miniflare and the
 * local server configure nothing and behave the same.
 *
 * **No per-player analytics.** Nothing here records an IP or a seat token. What
 * it records is what a match does -- why one was refused, how it ended and how
 * long it was -- which is what an argument about replay cost needs to be
 * settled with a number instead of a benchmark.
 */

/** The one method of Cloudflare's Analytics Engine binding this uses. */
export interface AnalyticsDataset {
  writeDataPoint(point: {
    indexes?: string[];
    blobs?: string[];
    doubles?: number[];
  }): void;
}

/** Any host that may have a dataset bound. The match object and the Worker do. */
export interface TelemetryEnv {
  ANALYTICS?: AnalyticsDataset;
}

/**
 * The things worth counting, as the two places that already know them see them.
 *
 * A closed union rather than free-form fields, because a dataset's columns are
 * positional: `blobs[0]` means whatever the first string of an event happened
 * to be. Naming every event here is what keeps that stable -- add fields at the
 * end, never in the middle, and never reorder one.
 */
export type TelemetryEvent =
  /** `reason` is why, in the server's own words: maintenance, a missing limiter. */
  | { event: "match.refused"; reason: string }
  | { event: "match.dealt"; matchId: string }
  | {
      event: "match.finished";
      matchId: string;
      reason: string;
      actions: number;
      /** How long the object took to rebuild the match before this message. */
      lastHydrateMs?: number;
    };

/**
 * Say that something happened.
 *
 * Never throws: a dataset that refuses a write, or a runtime with no `console`,
 * must not be able to fail a move. Telemetry that can break the game it watches
 * is worse than none.
 */
export function recordEvent(
  env: TelemetryEnv | undefined,
  event: TelemetryEvent,
): void {
  const { event: name, ...fields } = event;
  try {
    console.log(JSON.stringify({ event: name, ...fields }));
  } catch {
    // Nothing to do about it, and nothing that depends on it.
  }
  const dataset = env?.ANALYTICS;
  if (!dataset) return;
  const values = Object.values(fields);
  try {
    dataset.writeDataPoint({
      indexes: [name],
      blobs: values.filter(
        (value): value is string => typeof value === "string",
      ),
      doubles: values.filter(
        (value): value is number => typeof value === "number",
      ),
    });
  } catch {
    // Same: a counter is not worth a match.
  }
}
