/**
 * The bridge the OPTCGSim plugin calls: plain HTTP on the loopback interface,
 * because every Unity build can speak it without a library.
 *
 *   pnpm optcgsim:bridge [--port 7788] [--model path] [--adapters dir] [--record dir]
 *
 *   GET  /health  -> {"ok":true,"model":"<checkpoint>"}
 *   POST /decide  <- TableSnapshot   -> Decision (`decide.ts`); a snapshot of
 *                    a recorded game (`record`) also gets `record`, how its
 *                    record stands (`recorder.ts`)
 *   POST /finish  <- {"game":"<id>","winner":"p1"|"p2"|null}, when a recorded
 *                    game ends in the sim, or {"game","abandoned":"<why>"}
 *                    when the plugin gives it up -> its record's final standing
 *   POST /check   <- {"decks":{"p1":[card numbers],"p2":[...]}}
 *                 -> {"missing":{"p1":[...],"p2":[...]}}, the cards the engine lacks
 *
 * Binds 127.0.0.1 only: the sim is on this machine, and nothing else should be
 * able to ask it to move.
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Decider, type Decision } from "./decide.js";
import { unknownCards } from "./position.js";
import { Recorder, type RecordStatus } from "./recorder.js";
import { SNAPSHOT_VERSION, type TableSnapshot } from "./snapshot.js";

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]! : fallback;
}

const port = Number(flag("port", "7788"));
const modelPath = flag(
  "model",
  join(process.cwd(), "packages/web/src/scorer-model.json"),
);
const adapterDir = flag(
  "adapters",
  join(process.cwd(), "packages/web/src/scorer-adapters"),
);
if (!existsSync(modelPath)) {
  console.error(`No model at ${modelPath}: run \`pnpm model:fetch\` first.`);
  process.exit(1);
}
const decider = new Decider(
  modelPath,
  existsSync(adapterDir) ? adapterDir : undefined,
);

// Recorded games are written under `analysis/`, which the repository ignores.
const recorder = new Recorder(
  flag("record", join(process.cwd(), "analysis/optcgsim")),
  decider,
);

const server = createServer((request, response) => {
  const reply = (status: number, body: unknown): void => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method === "GET" && request.url === "/health") {
    reply(200, { ok: true, model: decider.source });
    return;
  }
  if (
    request.method !== "POST" ||
    (request.url !== "/decide" &&
      request.url !== "/check" &&
      request.url !== "/finish")
  ) {
    reply(404, {
      error: "POST /decide, POST /check, POST /finish or GET /health",
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
        console.log(
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
    const deciding: Promise<Decision & { record?: RecordStatus }> =
      snapshot.record ? recorder.decide(snapshot) : decider.decide(snapshot);
    deciding.then(
      (decision) => {
        console.log(
          `turn ${snapshot.turn} ${snapshot.seat} ${snapshot.step.kind}: ${decision.summary.slice(0, 100)}${decision.record?.status === "diverged" ? ` [not recorded: ${decision.record.why ?? ""}]` : ""}`,
        );
        reply(200, decision);
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `turn ${snapshot.turn} ${snapshot.step.kind}: ${message}`,
        );
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

server.listen(port, "127.0.0.1", () => {
  console.log(
    `OPTCGSim bridge on http://127.0.0.1:${port} with ${decider.source}`,
  );
});
