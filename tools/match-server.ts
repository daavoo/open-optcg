/**
 * The match server, running locally.
 *
 * Split from `referee-local.ts` so that starting a server does not drag the
 * agents package in behind it. The Playwright specs import this and only this:
 * the agents pull in the LLM client, whose generated module Playwright's loader
 * cannot resolve, and a browser test has no business loading either.
 */
import { Miniflare } from "miniflare";
import type { PlayerId } from "@one-piece-sim/protocol";
import { buildMatchWorker } from "./build-match-worker.js";

export interface LocalServer {
  origin: string;
  createMatch(config: {
    p1Deck: string;
    p2Deck: string;
    seed?: string;
    startingPlayer?: PlayerId | "random";
  }): Promise<CreatedMatch>;
  stop(): Promise<void>;
}

export interface CreatedMatch {
  matchId: string;
  seats: Record<PlayerId, { token: string; url: string }>;
}

/**
 * Boot the Worker on a port.
 *
 * `port: 0` by default so two of these can run at once -- a test on a fixed port
 * is a test that fails when someone is playing.
 */
export async function serveMatchWorker(options?: {
  port?: number;
  /**
   * A built web app to serve in front of the API, the way the deploy does.
   *
   * With it, the app and the server it talks to are one origin, which is what
   * lets two browser windows open the seat links with nothing configured.
   */
  appDirectory?: string;
}): Promise<LocalServer> {
  const contents = await buildMatchWorker();
  const mf = new Miniflare({
    modules: [{ type: "ESModule", path: "match-worker.mjs", contents }],
    compatibilityDate: "2026-08-01",
    // A local server and the tests want a match they can reproduce from a
    // seed. The deploy does not bind this, and refuses a caller that asks --
    // choosing the seed is choosing both opening hands.
    bindings: { ALLOW_FIXED_DEAL: "1" },
    durableObjects: {
      MATCH: { className: "MatchObject", useSQLite: true },
    },
    ...(options?.appDirectory
      ? {
          assets: {
            directory: options.appDirectory,
            // The Worker owns its own routes and the assets take everything
            // else, which is the order `wrangler.toml` sets up too.
            routerConfig: { has_user_worker: true },
            assetConfig: { not_found_handling: "single-page-application" },
          },
        }
      : {}),
    host: "127.0.0.1",
    port: options?.port ?? 0,
  });
  const url = await mf.ready;
  const origin = url.origin;
  return {
    origin,
    async createMatch(config) {
      const response = await fetch(`${origin}/match`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok)
        throw new Error(`CREATE_MATCH_FAILED: ${await response.text()}`);
      return (await response.json()) as CreatedMatch;
    },
    stop: () => mf.dispose(),
  };
}
