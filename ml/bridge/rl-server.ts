/**
 * NDJSON stdio server exposing the engine as a stepped RL environment.
 *
 * One line in, one line out, same as `packages/cli/src/jsonl.ts`. That existing
 * process API is the right shape but the wrong payload for training: it returns
 * a full `GameObservation`, which is ~23 KB and would have a Python trainer
 * spending its budget in `json.loads` rather than on gradients. This server
 * returns an encoded position, the legal actions, and the terminal reward, and
 * keeps the raw observation on this side.
 *
 * It holds many concurrent environments in one process, addressed by integer
 * `env` id, so a vectorised trainer amortises process startup across all of
 * them. Each environment owns a raw `GameState` rather than a `GameService`:
 * the service keeps every game it creates in a private map and would leak
 * across episodes, and the stage-2 critic needs the true state for its
 * privileged tokens, which a service deliberately never hands out.
 *
 * Two encodings, chosen per environment at `reset`:
 *
 *   `flat`   -- `encode.ts`: the fixed-width observation, the frozen action
 *               table's mask and the pointer rows. What the shipped sealed
 *               checkpoint was trained on; the default, byte-for-byte what this
 *               server returned before tokens existed.
 *   `token`  -- `tokens.ts`: card tokens, action pointers, and the critic-only
 *               privileged tokens. `action` in a `step` is then an index into
 *               the legal list sorted by `actionId`, not a table index.
 *
 * Protocol
 *   -> {"cmd":"spec"}
 *   <- {"obsSize":..,"actionSize":..,"token":{..},"decks":[..]}
 *
 *   -> {"cmd":"reset","env":0,"p1Deck":"..","p2Deck":"..","seed":"s0","encoding":"token"}
 *   -> {"cmd":"step","env":0,"action":3}
 *   <- {"env":0,"toPlay":"p1","done":false,...}
 *
 *   -> {"cmd":"reset_all","resets":[{...},{...}]}     <- {"results":[..]}
 *   -> {"cmd":"step_all","steps":[{"env":0,"action":3},..]}  <- {"results":[..]}
 *
 *   -> {"cmd":"close","env":0}
 *
 * The batched commands exist because the per-step cost that matters is the
 * pipe round trip, not the engine: `step_all` pays it once per vector step
 * rather than once per environment.
 */
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  applyAction,
  createGame,
  observe,
  simulateAction,
  toGameAction,
  type GameState,
} from "@one-piece-sim/engine-core";
import {
  FORMAT_DECK_IDS,
  SEALED_EXPANSIONS,
  autoBuildSealedDeck,
  sealedDeckManifest,
  SEALED_LEADER,
  resolveDeck,
} from "@one-piece-sim/decks";
import {
  acceptsSimulator,
  FirstLegalAgent,
  RegistryRulesAgent,
  SeededRandomAgent,
  type Agent,
} from "@one-piece-sim/agents/local";
import { createRulesAgent } from "../../packages/cli/src/agent-factory.js";
import { openSeatPool } from "../../packages/cli/src/sealed-analysis.js";
import type {
  GameObservation,
  LegalAction,
  PlayerId,
} from "@one-piece-sim/protocol";
import {
  ACTION_FEATURE_SIZE,
  actionKey,
  encodeAction,
  encodeObservation,
  OBSERVATION_SIZE,
} from "./encode.js";
import {
  ACTION_FEATURE_SIZE as POINTER_FEATURE_SIZE,
  CARD_FEATURE_SIZE,
  GLOBAL_SIZE,
  MAX_PRIVILEGED_TOKENS,
  MAX_TOKENS,
  TOKEN_WIRE_SIZE,
  cardFeatureTable,
  encodeActionPointer,
  encodeGlobal,
  encodePrivilegedTokens,
  encodeTokens,
  tokenWire,
} from "./tokens.js";
import {
  CARD_TABLE_SIZE,
  cardTableFingerprint,
  missingCardIndexEntries,
} from "./card-table.js";

interface ActionTable {
  actions: string[];
  oovIndex: number;
  observationSize: number;
}

const tablePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "action-table.json",
);

let table: ActionTable;
try {
  table = JSON.parse(readFileSync(tablePath, "utf8")) as ActionTable;
} catch {
  process.stderr.write(
    `rl-server: missing ${tablePath}. Run \`pnpm rl:action-table\` first.\n`,
  );
  process.exit(1);
}

if (table.observationSize !== OBSERVATION_SIZE) {
  // A checkpoint trained against a different feature layout silently produces
  // nonsense rather than an error, so this refuses to start instead.
  process.stderr.write(
    `rl-server: action-table.json was built for observationSize=${table.observationSize}, ` +
      `encode.ts now produces ${OBSERVATION_SIZE}. Rebuild the table.\n`,
  );
  process.exit(1);
}

{
  // Same reasoning for the token encoding: a registered card with no row would
  // embed as "unknown", and the policy could not tell it from a hidden card.
  const missing = missingCardIndexEntries();
  if (missing.length > 0) {
    process.stderr.write(
      `rl-server: card-index.ts lacks ${missing.length} registered cards ` +
        `(${missing.slice(0, 3).join(", ")}...). Run \`pnpm rl:card-index\`.\n`,
    );
    process.exit(1);
  }
}

const ACTION_INDEX = new Map(table.actions.map((key, index) => [key, index]));
/** One past the real actions, for a key no rollout produced. */
const ACTION_SIZE = table.actions.length + 1;

type Encoding = "flat" | "token";

interface Env {
  state: GameState;
  encoding: Encoding;
  /** Actions taken this episode, to cut off a game that cannot terminate. */
  steps: number;
  oov: number;
  /**
   * A seat played inside this process rather than by the trainer.
   *
   * Fast-forwarding the opponent here rather than in Python is worth roughly
   * half the IPC on the training path: both seats decide about equally often,
   * so a round trip per opponent move would double the per-episode cost of the
   * one thing that is actually expensive. It also means the baseline the policy
   * trains against is the *same* rules agent the repo already ships and
   * benchmarks, rather than a reimplementation of it.
   */
  opponent?: { seat: PlayerId; agent: Agent } | undefined;
}

type OpponentKind = "none" | "rules" | "random" | "first";

function createOpponent(
  kind: OpponentKind,
  deckId: string,
  seed: string,
  /** Set for a sealed episode: the opponent's Leader is always the wildcard, not `deckId`. */
  sealedLeader?: string,
): Agent | undefined {
  switch (kind) {
    case "rules":
      return sealedLeader
        ? new RegistryRulesAgent(sealedLeader)
        : createRulesAgent(deckId);
    case "random":
      return new SeededRandomAgent(seed);
    case "first":
      return new FirstLegalAgent();
    default:
      return undefined;
  }
}

const envs = new Map<number, Env>();
const MAX_STEPS = 800;
let gameSequence = 0;

function indexOf(observation: GameObservation, action: LegalAction): number {
  return ACTION_INDEX.get(actionKey(observation, action)) ?? table.oovIndex;
}

/**
 * The legal actions for the current decision, sorted by `actionId`.
 *
 * Sorted so that when two legal actions share a table index -- two copies of
 * the same card in hand, two equivalent DON!! attachments -- the one this server
 * picks is a function of the game state alone, and so that the token encoding's
 * "index into the legal list" means the same thing on every replay. Without the
 * sort it would depend on the engine's internal generation order.
 */
function sortedLegal(observation: GameObservation): LegalAction[] {
  return [...observation.legalActions].sort((left, right) =>
    left.actionId.localeCompare(right.actionId),
  );
}

function legalFor(observation: GameObservation) {
  return sortedLegal(observation).map((action) => ({
    action,
    index: indexOf(observation, action),
  }));
}

function observationOf(env: Env): GameObservation {
  return observe(env.state, env.state.activePlayer);
}

function act(env: Env, action: LegalAction): void {
  env.state = applyAction(
    env.state,
    toGameAction(action, env.state.revision),
  ).state;
  env.steps += 1;
}

function sharedPayload(id: number, env: Env, observation: GameObservation) {
  const done = observation.phase === "finished" || env.steps >= MAX_STEPS;
  return {
    env: id,
    toPlay: observation.activePlayer,
    viewer: observation.viewer,
    // Viewer-relative counts for dense reward shaping. The observation is the
    // player to move's, and this server only returns when that seat is the
    // trainer's, so `self` is always the learner's own side.
    selfLife: observation.self.lifeCount,
    oppLife: observation.opponent.lifeCount,
    selfPower: observation.self.board.reduce(
      (sum, card) => sum + card.currentPower,
      0,
    ),
    oppPower: observation.opponent.board.reduce(
      (sum, card) => sum + card.currentPower,
      0,
    ),
    // Hand *count* is public in this game (the cards themselves are redacted
    // from the opponent view). Card advantage is the strongest known predictor
    // in the genre, so it feeds the dense-reward potential.
    selfHand: observation.self.hand.length,
    oppHand: observation.opponent.handCount,
    done,
    winner: observation.winner,
    resultReason: observation.resultReason,
    truncated: env.steps >= MAX_STEPS && observation.phase !== "finished",
    turn: observation.turn,
    steps: env.steps,
    oov: env.oov,
  };
}

function flatPayload(id: number, env: Env) {
  const observation = observationOf(env);
  const shared = sharedPayload(id, env, observation);
  const legal = shared.done ? [] : legalFor(observation);

  // Deduplicate onto the table index, keeping the first under the sort above.
  const mask: number[] = [];
  const actionFeatures: number[][] = [];
  const seen = new Set<number>();
  for (const entry of legal) {
    if (seen.has(entry.index)) continue;
    seen.add(entry.index);
    mask.push(entry.index);
    actionFeatures.push(encodeAction(observation, entry.action));
  }

  return {
    ...shared,
    obs: encodeObservation(observation),
    mask,
    actionFeatures,
  };
}

/**
 * The token payload. Rows are sent unpadded -- the trainer pads to the spec's
 * maxima -- because a decision has about forty tokens against a cap of eighty,
 * and zeros are the one thing not worth serialising.
 */
function tokenPayload(id: number, env: Env) {
  const observation = observationOf(env);
  const shared = sharedPayload(id, env, observation);
  const { tokens, refs } = encodeTokens(observation);
  const legal = shared.done ? [] : sortedLegal(observation);
  const pointers = legal.map((action) =>
    encodeActionPointer(observation, action, tokens, refs),
  );
  return {
    ...shared,
    global: encodeGlobal(observation),
    tokens: tokens.map(tokenWire),
    actions: pointers.map((pointer) => pointer.features),
    actionRefs: pointers.map((pointer) => pointer.refs),
    actionCards: pointers.map((pointer) => pointer.card),
    privileged: encodePrivilegedTokens(env.state, observation.viewer).map(
      tokenWire,
    ),
    legalCount: legal.length,
  };
}

function payload(id: number, env: Env) {
  return env.encoding === "token"
    ? tokenPayload(id, env)
    : flatPayload(id, env);
}

/** One decision by an in-process agent, with the simulator it may ask for. */
async function agentAct(env: Env, agent: Agent, seat: PlayerId): Promise<void> {
  const observation = observationOf(env);
  if (acceptsSimulator(agent)) {
    const state = env.state;
    agent.useSimulator((actionId) => simulateAction(state, actionId, seat));
  }
  const action = await agent.chooseAction(observation);
  act(env, action);
}

/** Plays the in-process seat until the trainer is to move, or the game ends. */
async function fastForward(env: Env): Promise<void> {
  const opponent = env.opponent;
  if (!opponent) return;
  while (
    env.state.phase !== "finished" &&
    env.state.activePlayer === opponent.seat &&
    env.steps < MAX_STEPS
  ) {
    await agentAct(env, opponent.agent, opponent.seat);
  }
}

/**
 * Plays both seats with their rules agents until `turn` is reached, so an
 * episode can start from a mid-game position rather than the opening.
 *
 * The data-augmented-starts idea from the roadmap in its cheapest honest form:
 * the position is one the engine produced by play, so it passes every
 * invariant a dealt game does, and it is a pure function of the seed, so the
 * episode still replays. The warm-up actions do not count against `steps`.
 */
async function warmUp(
  env: Env,
  turn: number,
  agents: Record<PlayerId, Agent>,
): Promise<void> {
  while (env.state.phase !== "finished" && env.state.turn < turn) {
    const seat = env.state.activePlayer;
    await agentAct(env, agents[seat], seat);
  }
  env.steps = 0;
}

/**
 * Opens one random pool and mirrors the same auto-built deck to both seats, so
 * a sealed episode's outcome is a function of piloting alone -- the confounder
 * a fixed decklist ("ST31 vs ST32") never had to eliminate is exactly what a
 * random per-episode pool would introduce otherwise. The pool is opened from
 * `${seed}:pool`, kept separate from the `seed` the engine uses for shuffles
 * and starting player, so the two randomness sources do not correlate.
 *
 * `expansion` picks the set; `"any"` draws one from the seed, so a token policy
 * can train across every expansion the engine supports rather than OP17 alone.
 */
function buildMirroredSealedDeck(seed: string, expansion: string) {
  const chosen =
    expansion === "any"
      ? SEALED_EXPANSIONS[hashSeed(seed) % SEALED_EXPANSIONS.length]!.code
      : expansion;
  const { pool } = openSeatPool(`${seed}:pool`, chosen);
  const deck = autoBuildSealedDeck(pool);
  return sealedDeckManifest(deck, pool);
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * Accepts the short codes the trainer's flags use (`ST31`) as well as full
 * manifest ids. The six format decks are the only ones with a code, and their
 * order in `FORMAT_DECK_IDS` is ST31 through ST36.
 */
function deckIdFor(deckId: string): string {
  const match = /^ST3([1-6])$/.exec(deckId);
  if (!match) return deckId;
  return FORMAT_DECK_IDS[Number(match[1]) - 1]!;
}

interface ResetParams {
  env: number;
  p1Deck: string;
  p2Deck: string;
  seed: string;
  startingPlayer?: PlayerId | "random";
  opponentSeat?: PlayerId;
  opponentKind?: OpponentKind;
  sealed?: boolean;
  /** Sealed expansion, `"any"` for one drawn from the seed. Default OP17. */
  sealedExpansion?: string;
  encoding?: Encoding;
  /**
   * Player-turn to start the episode at; the turns before it are played by the
   * rules agents on both seats. Omit or 1 for the opening.
   */
  startTurn?: number;
}

async function reset(raw: ResetParams) {
  const params = {
    ...raw,
    p1Deck: deckIdFor(raw.p1Deck),
    p2Deck: deckIdFor(raw.p2Deck),
  };
  const sealedManifest = params.sealed
    ? buildMirroredSealedDeck(params.seed, params.sealedExpansion ?? "OP17")
    : undefined;
  const p1 = sealedManifest
    ? resolveDeck(sealedManifest.id, sealedManifest)
    : resolveDeck(params.p1Deck);
  const p2 = sealedManifest
    ? resolveDeck(sealedManifest.id, sealedManifest)
    : resolveDeck(params.p2Deck);
  const state = createGame({
    gameId: `rl-${++gameSequence}`,
    p1,
    p2,
    seed: params.seed,
    startingPlayer: params.startingPlayer ?? "random",
  });

  const seat = params.opponentSeat;
  const kind = params.opponentKind ?? "none";
  const agent =
    seat && kind !== "none"
      ? createOpponent(
          kind,
          seat === "p1" ? params.p1Deck : params.p2Deck,
          `${params.seed}-opp`,
          sealedManifest ? SEALED_LEADER : undefined,
        )
      : undefined;

  const env: Env = {
    state,
    encoding: params.encoding ?? "flat",
    steps: 0,
    oov: 0,
    opponent: seat && agent ? { seat, agent } : undefined,
  };
  envs.set(params.env, env);

  if ((params.startTurn ?? 1) > 1) {
    const rules = (deckId: string) =>
      sealedManifest
        ? new RegistryRulesAgent(SEALED_LEADER)
        : createRulesAgent(deckId);
    await warmUp(env, params.startTurn!, {
      p1: rules(params.p1Deck),
      p2: rules(params.p2Deck),
    });
  }
  await fastForward(env);
  return payload(params.env, env);
}

async function step(params: { env: number; action: number }) {
  const env = envs.get(params.env);
  if (!env) throw new Error(`Unknown env ${params.env}`);
  if (env.state.phase === "finished")
    throw new Error(`env ${params.env} is finished; reset it`);

  const observation = observationOf(env);
  let chosen: LegalAction | undefined;
  if (env.encoding === "token") {
    const legal = sortedLegal(observation);
    chosen = legal[params.action] ?? legal[0];
  } else {
    const legal = legalFor(observation);
    const entry =
      legal.find((candidate) => candidate.index === params.action) ?? legal[0];
    if (entry?.index === table.oovIndex) env.oov += 1;
    chosen = entry?.action;
  }
  if (!chosen) throw new Error(`env ${params.env} has no legal actions`);

  act(env, chosen);
  await fastForward(env);
  return payload(params.env, env);
}

function spec() {
  return {
    obsSize: OBSERVATION_SIZE,
    actionSize: ACTION_SIZE,
    actionFeatureSize: ACTION_FEATURE_SIZE,
    oovIndex: table.oovIndex,
    decks: [...FORMAT_DECK_IDS],
    sealedExpansions: SEALED_EXPANSIONS.map((expansion) => expansion.code),
    token: {
      globalSize: GLOBAL_SIZE,
      tokenWireSize: TOKEN_WIRE_SIZE,
      maxTokens: MAX_TOKENS,
      maxPrivilegedTokens: MAX_PRIVILEGED_TOKENS,
      actionFeatureSize: POINTER_FEATURE_SIZE,
      cardFeatureSize: CARD_FEATURE_SIZE,
      cardTableSize: CARD_TABLE_SIZE,
      cardTableFingerprint: cardTableFingerprint(),
      cardFeatures: cardFeatureTable(),
    },
  };
}

async function dispatch(request: Record<string, unknown>): Promise<unknown> {
  switch (request.cmd) {
    case "spec":
      return spec();
    case "reset":
      return await reset(request as never);
    case "step":
      return await step(request as never);
    case "reset_all": {
      const results = [];
      for (const params of request.resets as ResetParams[]) {
        results.push(await reset(params));
      }
      return { results };
    }
    case "step_all": {
      const results = [];
      for (const params of request.steps as { env: number; action: number }[]) {
        results.push(await step(params));
      }
      return { results };
    }
    case "close":
      envs.delete(Number(request.env));
      return { ok: true };
    default:
      throw new Error(`Unknown cmd ${String(request.cmd)}`);
  }
}

/**
 * Requests are handled one at a time, in arrival order.
 *
 * `fastForward` made the handler async, and readline emits `line` on its own
 * schedule rather than waiting for the previous handler to settle. Without this
 * chain two in-flight requests would race and the client -- which pairs replies
 * to requests purely by order -- would read the wrong reply for a step.
 */
let queue: Promise<void> = Promise.resolve();

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  if (!line.trim()) return;
  queue = queue.then(async () => {
    try {
      const request = JSON.parse(line) as Record<string, unknown>;
      const result = await dispatch(request);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        })}\n`,
      );
    }
  });
});
