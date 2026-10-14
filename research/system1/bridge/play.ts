/**
 * Play the System-1 scorer in the browser app.
 *
 *   pnpm web:build:server                       # once, builds dist/pages
 *   pnpm exec tsx research/system1/bridge/play.ts [--p1 <deck>] [--p2 <deck>]
 *       [--checkpoint research/system1/checkpoints/play] [--seed s]
 *
 * Boots the local match server with the app (the same one `pnpm referee:local
 * --app` runs), prints the link for seat p1 -- yours -- and pilots p2 with the
 * scorer over the same WebSocket protocol the rules agents use. The scorer
 * sees exactly what `observe()` gives its seat and answers with one of the
 * offered legal actions, the highest-probability one.
 *
 * Decks default to a random distinct pair from the selectable catalog, drawn
 * from the seed, so each run is a different matchup.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Agent } from "@one-piece-sim/agents/local";
import { SELECTABLE_DECK_IDS } from "@one-piece-sim/decks";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { playMatch, serveMatchWorker } from "../../../tools/referee-local.js";
import {
  RENDER_VERSION,
  renderDecision,
} from "../../../packages/agents/src/scorer/render.js";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const research = resolve(here, "..");
const repoRoot = resolve(research, "../..");

/** The scorer behind the one-method seat interface, via `sys1.serve`. */
export class ScorerAgent implements Agent {
  readonly #process: ChildProcessWithoutNullStreams;
  readonly #lines: AsyncIterator<string>;
  lastValue: number | undefined;

  constructor(checkpoint: string) {
    const config = JSON.parse(
      readFileSync(join(research, checkpoint, "config.json"), "utf8"),
    ) as { render?: number };
    if (config.render !== RENDER_VERSION)
      throw new Error(
        `${checkpoint} reads render version ${config.render ?? 1}; this build writes ${RENDER_VERSION}`,
      );
    this.#process = spawn(
      join(research, ".venv/bin/python"),
      ["-m", "sys1.serve", checkpoint],
      { cwd: research, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.#lines = createInterface({ input: this.#process.stdout })[
      Symbol.asyncIterator
    ]();
  }

  async ready(): Promise<void> {
    await this.#read();
  }

  async #read(): Promise<Record<string, unknown>> {
    const next = await this.#lines.next();
    if (next.done) throw new Error("the scorer process exited");
    return JSON.parse(next.value) as Record<string, unknown>;
  }

  async chooseAction(observation: GameObservation): Promise<LegalAction> {
    const legal = observation.legalActions;
    if (legal.length === 1) return legal[0]!;
    const decision = renderDecision(observation);
    this.#process.stdin.write(`${JSON.stringify(decision)}\n`);
    const reply = (await this.#read()) as { probs: number[]; value: number };
    this.lastValue = reply.value;
    let best = 0;
    reply.probs.forEach((probability, index) => {
      if (probability > reply.probs[best]!) best = index;
    });
    return legal[best]!;
  }

  close(): void {
    this.#process.kill();
  }
}

function pick(seed: string, salt: number, other?: string): string {
  let hash = salt;
  for (const character of seed)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const pool = SELECTABLE_DECK_IDS.filter((deck) => deck !== other);
  return pool[hash % pool.length]!;
}

const { values } = parseArgs({
  options: {
    p1: { type: "string" },
    p2: { type: "string" },
    seed: { type: "string", default: `play-${Date.now()}` },
    checkpoint: { type: "string", default: "checkpoints/play" },
    port: { type: "string", default: "8787" },
  },
});

const appDirectory = join(repoRoot, "dist/pages");
if (!existsSync(join(appDirectory, "index.html"))) {
  process.stderr.write(
    `No app build at ${appDirectory}. Run \`pnpm web:build:server\` first.\n`,
  );
  process.exit(1);
}

const seed = values.seed;
const p1Deck = values.p1 ?? pick(seed, 1);
const p2Deck = values.p2 ?? pick(seed, 2, p1Deck);

process.stdout.write("loading the scorer...\n");
const scorer = new ScorerAgent(values.checkpoint);
await scorer.ready();

const server = await serveMatchWorker({
  port: Number(values.port),
  appDirectory,
});
const match = await server.createMatch({
  p1Deck,
  p2Deck,
  seed,
  startingPlayer: "random",
});
process.stdout.write(
  `\nYou:     ${p1Deck}\nScorer:  ${p2Deck}\n\nOpen your seat:\n  ${match.seats.p1.url}\n\n`,
);

const played = await playMatch(server, match, {
  agents: { p2: scorer },
  onAction: (entry) => {
    if (entry.seat !== "p2") return;
    const value =
      scorer.lastValue === undefined
        ? ""
        : `  (thinks it wins ${Math.round(((scorer.lastValue + 1) / 2) * 100)}%)`;
    process.stdout.write(
      `t${String(entry.turn).padStart(2)} scorer  ${entry.summary}${value}\n`,
    );
  },
});
process.stdout.write(
  `\n${played.result?.winner === "p1" ? "You win" : played.result?.winner === "p2" ? "The scorer wins" : "No result"} (${played.result?.reason ?? "unfinished"}).\n`,
);
scorer.close();
await server.stop();
