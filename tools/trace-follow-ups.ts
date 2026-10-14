/**
 * Measures follow-up sequences against the decisions of a recorded match.
 *
 * `trace:shadow` asks what a model would play at every recorded decision;
 * this asks a narrower question about the decisions this feature touches: at
 * each position where an action drags its own effect choices behind it, what
 * does the seat pay to answer them, and does it answer them the same way?
 *
 * Both arms see the identical position, because the trace is replayed on rails
 * and every recorded action is applied in order. The baseline arm answers the
 * chain the way the seat used to -- one call for the action, then one call per
 * effect choice, each from a fresh context -- and the treatment arm answers the
 * whole chain in one call. What is compared is the sequence of actions each arm
 * ends up taking and the calls it spent getting there.
 *
 * Usage:
 *   pnpm trace:follow-ups --file=open-optcg-trace.jsonl --seat=p2
 *   pnpm trace:follow-ups --file=... --seat=p2 --arm=treatment --limit=3
 */
import { readFileSync } from "node:fs";
import { GameService, type Plan } from "@one-piece-sim/engine-core";
import { resolveMatchDecks, deckManifests } from "@one-piece-sim/decks";
import { LlmAgent, expandFollowUps } from "@one-piece-sim/agents/llm";
import { createChatClient } from "@one-piece-sim/agents/chat-client";
import { llmMatchContext } from "@one-piece-sim/agents/llm-dossiers";
import { parseExportedMatch } from "../packages/web/src/diagnostics.js";
import { loadDotEnv } from "./load-env.js";
import type { GameObservation, PlayerId } from "@one-piece-sim/protocol";
import type { DeckManifest } from "@one-piece-sim/decks";

loadDotEnv();

const flags = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith("--")) continue;
  const [key, value] = arg.slice(2).split("=", 2);
  flags.set(key!, value ?? "true");
}
const file = flags.get("file");
if (!file) throw new Error("USAGE: --file=<exported trace> [--seat=p2]");
const seat = (flags.get("seat") ?? "p2") as PlayerId;
const arms = (flags.get("arm") ?? "baseline,treatment").split(",");
const limit = Number(flags.get("limit") ?? Infinity);

const match = parseExportedMatch(readFileSync(file, "utf8"));
const { config } = match;

function manifestFor(deckId: string, custom?: DeckManifest): DeckManifest {
  return custom ?? deckManifests[deckId]!;
}
const selfDeck = seat === "p1" ? config.p1Deck : config.p2Deck;
const oppDeck = seat === "p1" ? config.p2Deck : config.p1Deck;
const matchContext = llmMatchContext(
  selfDeck,
  manifestFor(
    selfDeck,
    seat === "p1" ? config.p1CustomDeck : config.p2CustomDeck,
  ),
  oppDeck,
  manifestFor(
    oppDeck,
    seat === "p1" ? config.p2CustomDeck : config.p1CustomDeck,
  ),
);
const model = process.env.LLM_MODEL!;

/** An agent whose provider calls are counted, which is what is being compared. */
function agentFor(label: string): { agent: LlmAgent; calls: () => number } {
  // No provider reasoning summary: what is being compared is the call count,
  // and asking for one makes Gemini generate thinking text that nothing here
  // reads. See the note in `shadow-llm.ts`.
  const client = createChatClient({
    model,
    sessionLabel: `follow-ups:${label}`,
    reasoningSummary: null,
  });
  let calls = 0;
  const agent = new LlmAgent(
    {
      complete(request) {
        calls += 1;
        return client.complete(request);
      },
    },
    matchContext,
  );
  return { agent, calls: () => calls };
}

/**
 * A position where the seat's own effect choices follow the action it takes.
 *
 * Recorded rather than answered as the replay passes it, because both arms have
 * to be asked about the same position and the replay may only be walked once.
 */
interface Chain {
  revision: number;
  turn: number;
  observation: GameObservation;
  /** The service state is behind the observation; the planner is bound to it. */
  plan: Plan;
  recorded: string[];
  steps: number;
  offeredOptions: number;
}

const service = new GameService();
let observation = service.create({
  ...resolveMatchDecks(config),
  seed: config.seed,
  ...(config.seedMode ? { seedMode: config.seedMode } : {}),
  startingPlayer: config.startingPlayer,
});

const chains: Chain[] = [];
let open: Chain | undefined;
for (const actionId of match.actions) {
  const acting = observation.activePlayer;
  const decisions = observation.legalActions.length;
  if (open) {
    // The recorded actions that answered the chain, however many there were.
    if (
      acting === seat &&
      observation.legalActions.every((a) => a.type === "resolve-effect")
    ) {
      open.recorded.push(actionId);
      if (decisions > 1) open.steps += 1;
    } else {
      if (open.steps > 0) chains.push(open);
      open = undefined;
    }
  }
  if (!open && acting === seat && decisions > 1) {
    const plan = service.plannerFor(observation.gameId, seat);
    const offer = expandFollowUps(observation, plan).find(
      (candidate) => candidate.actionId === actionId,
    );
    if (offer) {
      open = {
        revision: observation.revision + 1,
        turn: observation.turn,
        observation,
        plan,
        recorded: [actionId],
        steps: 0,
        offeredOptions: offer.then.reduce(
          (n, step) => n + step.options.length,
          0,
        ),
      };
    }
  }
  observation = service.act(observation.gameId, observation.revision, actionId);
}
if (open && open.steps > 0) chains.push(open);

const selected = chains.slice(0, limit);
console.log(
  `model ${model}; seat ${seat} = ${selfDeck}\n` +
    `${selected.length} foldable chain(s), ${selected.reduce((n, c) => n + c.steps, 0)} effect decisions\n`,
);

interface ArmResult {
  calls: number;
  actions: string[];
  seconds: number;
}

/**
 * Answers one chain end to end, with or without the planner.
 *
 * The two arms differ in exactly one thing -- whether the seat is handed
 * lookahead -- so the conversation, the context and the position are shared and
 * the comparison is of the feature rather than of two different harnesses.
 */
async function run(chain: Chain, withPlanner: boolean): Promise<ArmResult> {
  const { agent, calls } = agentFor(withPlanner ? "treatment" : "baseline");
  const local = new GameService();
  let node = replay(local, chain);
  const actions: string[] = [];
  const startedAt = Date.now();
  for (let step = 0; step <= chain.steps; step += 1) {
    if (withPlanner) {
      agent.usePlanner(local.plannerFor(node.gameId, seat));
    }
    const action = await agent.chooseAction(node);
    actions.push(action.actionId);
    node = local.act(node.gameId, node.revision, action.actionId);
    if (node.activePlayer !== seat) break;
    if (!node.legalActions.every((a) => a.type === "resolve-effect")) break;
  }
  return { calls: calls(), actions, seconds: (Date.now() - startedAt) / 1000 };
}

/** Rebuilds the recorded position in a private service, up to the chain. */
function replay(local: GameService, chain: Chain): GameObservation {
  let node = local.create({
    ...resolveMatchDecks(config),
    seed: config.seed,
    ...(config.seedMode ? { seedMode: config.seedMode } : {}),
    startingPlayer: config.startingPlayer,
  });
  for (const actionId of match.actions) {
    if (node.revision + 1 === chain.revision) break;
    node = local.act(node.gameId, node.revision, actionId);
  }
  return node;
}

const totals = new Map<string, { calls: number; seconds: number }>();
for (const chain of selected) {
  const label = chain.observation.legalActions.find(
    (a) => a.actionId === chain.recorded[0],
  )?.summary;
  console.log(
    `r${chain.revision} t${chain.turn}: ${label?.slice(0, 70)}\n` +
      `   recorded: ${chain.recorded.join(" ")}  (${chain.steps} effect decision(s), ${chain.offeredOptions} options offered)`,
  );
  for (const arm of arms) {
    const result = await run(chain, arm === "treatment");
    const total = totals.get(arm) ?? { calls: 0, seconds: 0 };
    total.calls += result.calls;
    total.seconds += result.seconds;
    totals.set(arm, total);
    const same =
      JSON.stringify(result.actions) === JSON.stringify(chain.recorded)
        ? "== recorded"
        : "!= recorded";
    console.log(
      `   ${arm.padEnd(9)} ${result.calls} call(s) ${result.seconds.toFixed(1)}s ${same}\n` +
        `      ${result.actions.join(" ")}`,
    );
  }
  console.log();
}
console.log("totals");
for (const [arm, total] of totals) {
  console.log(
    `  ${arm.padEnd(9)} ${total.calls} calls ${total.seconds.toFixed(1)}s`,
  );
}
