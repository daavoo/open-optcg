/**
 * The bridge the OPTCGSim plugin calls: plain HTTP on the loopback interface,
 * because every Unity build can speak it without a library.
 *
 *   GET  /health  -> {"ok":true,"model":"<checkpoint>","release":"model-vN"}
 *   GET  /decks   -> {"decks":[{"name","lines"}]}: the catalog's decks as
 *                    the sim's deck files, for the plugin to write out
 *   POST /decide  <- TableSnapshot   -> Decision (`decide.ts`); a snapshot of
 *                    a recorded game (`record`) also gets `record`, how its
 *                    record stands (`recorder.ts`)
 *   POST /observe <- TableSnapshot of a recorded game, at a decision of the
 *                    person's: the engine's game follows their move, and no
 *                    move is sent back
 *   POST /finish  <- {"game":"<id>","winner":"p1"|"p2"|null}, when a recorded
 *                    game ends in the sim, or {"game","abandoned":"<why>"}
 *                    when the plugin gives it up -> its record's final standing
 *   POST /check   <- {"decks":{"p1":[card numbers],"p2":[...]}}
 *                 -> {"missing":{"p1":[...],"p2":[...]}}, the cards the engine lacks
 *
 * Binds 127.0.0.1 only: the sim is on this machine, and nothing else should be
 * able to ask it to move.
 *
 * `server.ts` is the command-line entry; the launcher calls this directly, so
 * the model it resolves and the port it picks can be shown in its own window.
 */
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { deckManifests, SELECTABLE_DECK_IDS } from "@one-piece-sim/decks";
import { Decider, type Decision } from "./decide.js";
import { resolveModel } from "./model-source.js";
import { modelCacheDir } from "./paths.js";
import { unknownCards } from "./position.js";
import { Recorder, type RecordStatus } from "./recorder.js";
import { SNAPSHOT_VERSION, type TableSnapshot } from "./snapshot.js";

export interface BridgeOptions {
  /** Defaults to 7788, the port the plugin is configured with. */
  port?: number;
  /** A pinned pack; without it the newest `model-*` release is used. */
  modelPath?: string;
  adapterDir?: string;
  /** Where recorded games are written. Defaults to `analysis/optcgsim`. */
  recordDir?: string;
  /** Keep one seat's moves out of the record, as a person's are. */
  blind?: "p1" | "p2";
  /** Never touch the network; use the model cache as it stands. */
  offline?: boolean;
  cacheDir?: string;
  log?: (line: string) => void;
}

export interface BridgeInfo {
  port: number;
  url: string;
  /** The checkpoint the pack was exported from. */
  model: string;
  /** The `model-*` release it came from, or `"local"`. */
  release: string;
}

export interface Bridge {
  info: BridgeInfo;
  close(): Promise<void>;
}

/**
 * Resolves the model, starts the server and resolves once it is listening.
 *
 * The model is resolved before the socket opens: a bridge that is listening
 * but cannot play would have the plugin waiting on a decision that never
 * comes, and the launcher has a place to show the error instead.
 */
export async function startBridge(
  options: BridgeOptions = {},
): Promise<Bridge> {
  const log = options.log ?? ((): void => {});
  const port = options.port ?? 7788;
  const model = await resolveModel({
    ...(options.modelPath ? { modelPath: options.modelPath } : {}),
    ...(options.adapterDir ? { adapterDir: options.adapterDir } : {}),
    cacheDir: options.cacheDir ?? modelCacheDir(),
    offline: options.offline ?? false,
    ...(options.modelPath ? {} : { fallbackPath: checkoutPack() }),
    log: (line) => {
      log(`model: ${line}`);
    },
  });
  const decider = new Decider(model);
  const recorder = new Recorder(
    options.recordDir ?? join(process.cwd(), "analysis/optcgsim"),
    decider,
    undefined,
    options.blind,
  );

  const server = createServer((request, response) => {
    const reply = (status: number, body: unknown): void => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.method === "GET" && request.url === "/health") {
      reply(200, { ok: true, model: decider.source, release: decider.release });
      return;
    }
    if (request.method === "GET" && request.url === "/decks") {
      reply(200, { decks: simDecks() });
      return;
    }
    if (
      request.method !== "POST" ||
      (request.url !== "/decide" &&
        request.url !== "/observe" &&
        request.url !== "/check" &&
        request.url !== "/finish")
    ) {
      reply(404, {
        error: "POST /decide, /observe, /check or /finish, or GET /health",
      });
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      let body: { version?: unknown };
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          version?: unknown;
        };
      } catch {
        reply(400, { error: "the body is not JSON" });
        return;
      }
      if (request.url === "/check") {
        const decks = (body as { decks?: Record<string, unknown> }).decks ?? {};
        const missing = (seat: string): string[] => {
          const list = decks[seat];
          return Array.isArray(list) ? unknownCards(list.map(String)) : [];
        };
        reply(200, { missing: { p1: missing("p1"), p2: missing("p2") } });
        return;
      }
      if (request.url === "/finish") {
        const { game, winner, abandoned } = body as {
          game?: unknown;
          winner?: unknown;
          abandoned?: unknown;
        };
        const standing = recorder.finish(
          String(game),
          winner === "p1" || winner === "p2" ? winner : null,
          typeof abandoned === "string" ? abandoned : undefined,
        );
        if (standing) {
          log(
            `game over: ${standing.why} (${standing.actions} actions, ${standing.file})`,
          );
        }
        reply(200, standing ?? { error: "no recorded game by that name" });
        return;
      }
      if (body.version !== SNAPSHOT_VERSION) {
        reply(400, {
          error: `snapshot version ${String(body.version)}, this bridge reads ${SNAPSHOT_VERSION}`,
        });
        return;
      }
      const snapshot = body as TableSnapshot;
      if (request.url === "/observe") {
        reply(200, snapshot.record ? recorder.observe(snapshot) : {});
        return;
      }
      const deciding: Promise<Decision & { record?: RecordStatus }> =
        snapshot.record ? recorder.decide(snapshot) : decider.decide(snapshot);
      deciding.then(
        (decision) => {
          log(
            `turn ${snapshot.turn} ${snapshot.seat} ${snapshot.step.kind}: ${decision.summary.slice(0, 100)}${decision.record?.status === "diverged" ? ` [not recorded: ${decision.record.why ?? ""}]` : ""}`,
          );
          reply(200, decision);
        },
        (error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          log(`turn ${snapshot.turn} ${snapshot.step.kind}: ${message}`);
          // A position the engine will not accept is the plugin's cue to hand
          // the decision back to the person, not a reason to stop the game.
          reply(200, {
            move: { kind: "defer", reason: message },
            summary: "",
            offered: [],
          });
        },
      );
    });
  });

  await listen(server, port);
  const info: BridgeInfo = {
    port,
    url: `http://127.0.0.1:${port}`,
    model: decider.source,
    release: decider.release,
  };
  log(`listening on ${info.url} with ${info.model} (${info.release})`);
  return {
    info,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** A port already in use is the one failure a launcher has to name clearly. */
function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `BRIDGE_PORT_IN_USE: ${port} is taken -- another bridge is running, or pass --port`,
          ),
        );
        return;
      }
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      resolve();
    });
  });
}

/** The development checkout's pack, when the launcher runs from one. */
function checkoutPack(): string {
  return join(process.cwd(), "packages/web/src/scorer-model.json");
}

/**
 * The catalog's decks as the sim's deck files: a name the sim can use as a
 * file name, and its lines, the Leader first.
 */
function simDecks(): { name: string; lines: string[] }[] {
  return SELECTABLE_DECK_IDS.flatMap((id) => {
    const manifest = deckManifests[id];
    if (!manifest) return [];
    return [
      {
        name: `open-optcg ${id}`.replace(/[^A-Za-z0-9 ().&'-]/g, "-"),
        lines: [
          `1x${manifest.leader}`,
          ...Object.entries(manifest.cards).map(
            ([card, copies]) => `${copies}x${card}`,
          ),
        ],
      },
    ];
  });
}
