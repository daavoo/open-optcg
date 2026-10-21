/**
 * NDJSON stdio server: many concurrent games, stepped by a Python trainer,
 * each decision returned as rendered text (`render.ts`).
 *
 * Per game, either seat can be played in this process by a rules agent; the
 * server then fast-forwards through that seat's decisions and returns only
 * when a seat Python plays is to move. Decisions with a single legal action
 * are taken here too -- they carry no choice, and a round trip each would be
 * a fifth of all traffic. Python sees `seat` on every decision, so self-play
 * against a snapshot is the same protocol with no in-process seat.
 *
 *   -> {"cmd":"reset","games":[{"id":0,"p1":"<deck id>","p2":"<deck id>","seed":"s","rules":"p2"}]}
 *   -> {"cmd":"step","actions":[{"id":0,"action":3,"next":{"id":0,...reset spec}}]}
 *   <- {"results":[{"id":0,"seat":"p1","state":"..","actions":[..],"done":false}, ...]}
 *
 *   -> {"cmd":"fork","forks":[{"from":0,"actions":[0,2,3]}]}
 *   <- {"results":[{"from":0,"outcomes":[{"action":0,"winner":"p1","truncated":false}, ...]}]}
 *
 * `fork` plays each listed offered action on a copy of a game waiting on
 * Python, and has both seats' rules agents finish every copy; the game itself
 * is left as it was. The engine's randomness lives in its state, so every copy
 * draws the same cards in the same order until the copies' choices diverge:
 * the outcomes differ by what the action changed, not by the draws.
 *
 * A finished game reports `done`, `winner` and `truncated` instead of a
 * decision, and `capped` when the action cap cut it off; Python resets it with
 * a new pairing when it wants another. A game reset with `"record": true` also
 * reports `trace`: every action taken, in the app's trace format less the
 * header, with the offered list on each decision Python made, so a caller can
 * join what its model thought onto the move. The trace carries the game's
 * `timeLimit`, which the header's config needs for the app to replay it.
 */
import { writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { createInterface } from "node:readline";
import {
  applyOfferedAction,
  createGame,
  observe,
  rulesStamp,
  simulateAction,
  toGameAction,
  type GameState,
} from "@one-piece-sim/engine-core";
import { acceptsSimulator, type Agent } from "@one-piece-sim/agents/local";
import {
  STANDARD_TIME_LIMIT,
  type LegalAction,
  type PlayerId,
} from "@one-piece-sim/protocol";
import {
  TRAINING_DECK_IDS,
  createTrainingRulesAgent,
  resolveTrainingDeck,
  trainingDeckDivision,
  TRAINING_DECK_VARIANTS,
} from "./decks.js";
import {
  RENDER_VERSION,
  renderDecision,
} from "../../packages/agents/src/scorer/render.js";
import { attackAudit } from "./attack-audit.js";
import { DecisionTokenizer } from "./decision-tokens.js";
import {
  compactDecision,
  type CompactDecision,
} from "../../packages/agents/src/scorer/compact.js";
import { prunedActions } from "../../packages/agents/src/scorer/dominance.js";
import { privilegedFeatures } from "./privileged.js";

/** `SYS1_AUDIT=1` attaches `attackAudit` to every decision; see there. */
const AUDIT = process.env.SYS1_AUDIT === "1";
// The PPO critic's view of the whole state (`privileged.ts`), sent beside each
// decision for the trainer's value head alone.
const PRIVILEGED = process.env.SYS1_PRIVILEGED === "1";
/**
 * With `SYS1_TOKENIZER` (the tokenizer.json path) and `SYS1_CARDS` (cards.json)
 * set, decisions go out as token ids and card rows instead of text: the
 * tokenising moves off the Python process that also drives the GPU, and the
 * messages shrink. `bpe.ts` is exact against the reference tokenizer.
 */
const TOKENS =
  process.env.SYS1_TOKENIZER && process.env.SYS1_CARDS
    ? new DecisionTokenizer(process.env.SYS1_TOKENIZER, process.env.SYS1_CARDS)
    : undefined;

/**
 * `SYS1_RENDERS=4,2` renders every decision in each listed version: the first
 * is `tokens` (or `state`/`actions`) and named by `render`, each other
 * `tokens_v<n>`. A game between a model reading one version and one reading
 * another -- a teacher and its student, or a head-to-head across a render
 * change -- then sends each the text it was trained on. `none` sends no text,
 * for games only the compact scorer plays.
 */
const RENDERS =
  process.env.SYS1_RENDERS === "none"
    ? []
    : (process.env.SYS1_RENDERS ?? String(RENDER_VERSION))
        .split(",")
        .map(Number);

/**
 * `SYS1_COMPACT=1` (with `SYS1_CARDS`) adds each decision's compact encoding
 * (`compact.ts`), the small scorer's input, beside the text, packed by `pack`.
 */
const COMPACT = process.env.SYS1_COMPACT === "1";

/**
 * `SYS1_PROFILE=1` has every reply carry `profile`: milliseconds this worker
 * spent per stage since its previous reply -- `engine` (transitions, legal
 * actions, observe, pruning), `rules` (in-process rules agents), `compact`
 * (the encoding), `pack`, `privileged`, `parse` and `stringify` (JSON both
 * ways) and `write` (stdout); the trainer counts the rest of its wall time as
 * idle. A reply's own stringify and write are counted on the next one. Read
 * by `sys1/env.py`.
 */
const PROFILE = process.env.SYS1_PROFILE === "1";
let spent: Record<string, number> = {};

function timed<T>(stage: string, run: () => T): T {
  if (!PROFILE) return run();
  const start = performance.now();
  try {
    return run();
  } finally {
    spent[stage] = (spent[stage] ?? 0) + performance.now() - start;
  }
}

async function timedAsync<T>(stage: string, run: () => Promise<T>): Promise<T> {
  if (!PROFILE) return run();
  const start = performance.now();
  try {
    return await run();
  } finally {
    spent[stage] = (spent[stage] ?? 0) + performance.now() - start;
  }
}

/** `spent` so far, cleared, with `engine` as what the other stages leave of `handled`. */
function takeProfile(handled: number): Record<string, number> {
  const inside = ["rules", "compact", "pack", "privileged"].reduce(
    (sum, stage) => sum + (spent[stage] ?? 0),
    0,
  );
  const out = { ...spent, engine: handled - inside };
  spent = {};
  return out;
}

/**
 * A compact decision as one base64 run of raw-deflated little-endian
 * float32s -- global, then each card row, then each option row -- with the
 * row counts beside it; `env.py` unpacks it. As JSON numbers its ~700 values cost Python an object
 * each to parse, which capped collection; the trainer keeps them as float32
 * or narrower, so nothing is lost.
 */
function pack(decision: CompactDecision) {
  const values = [
    ...decision.global,
    ...decision.cards.flat(),
    ...decision.options.flat(),
  ];
  return {
    cards: decision.cards.length,
    options: decision.options.length,
    // Deflated first: six values in seven are zero, so the run shrinks about
    // tenfold, and every byte saved is a byte the trainer's single process
    // does not read off a pipe and parse.
    deflated: deflateRawSync(new Float32Array(values), { level: 1 }).toString(
      "base64",
    ),
  };
}

/** `values` as base64 little-endian float32s, which `env.py` decodes in one call. */
function floats(values: number[]): string {
  return Buffer.from(new Float32Array(values).buffer).toString("base64");
}

/**
 * The tournament time limit every training and evaluation game is played
 * under (`TimeLimit`, Bandai's floor rules §8.2): time is called when turn 20
 * begins, three more turns are played, and a game still going is decided on
 * Life, then deck, then Characters, then who last drew from Life.
 *
 * It gives a game that would otherwise run to the action cap a real winner, so
 * a seat that is behind gains nothing by stalling. 20 is past where natural
 * games end: time is called in about 1% of rules-agent games and about 2.5% of
 * the learned model's self-play, so it is a safety net and not a new way games
 * usually end. Counted in the engine's turns, where each player's turn is one.
 * It is the app's `STANDARD_TIME_LIMIT`, so the model plays the app's games
 * under the limit it was trained under.
 */
const TRAINING_TIME_LIMIT = STANDARD_TIME_LIMIT;

/**
 * The last resort for a turn that never ends, which the time limit cannot
 * reach: a loop inside one turn. A game cut off here reports `capped`, the
 * seat whose turn it was, which the trainer scores as that seat's loss.
 */
const MAX_ACTIONS = 1500;

/**
 * `SYS1_LAST_STEP=<path>` has each worker overwrite `<path>.<pid>` with the
 * game it is about to advance and what it is doing, before every step. A
 * hang or an out-of-memory inside the engine or a rules agent cannot be
 * caught the way a throw is (see `guarded`); this leaves the game that did
 * it on disk, replayable with replay-failed.ts.
 */
const LAST_STEP = process.env.SYS1_LAST_STEP
  ? `${process.env.SYS1_LAST_STEP}.${process.pid}`
  : undefined;

let lastStepBroken = false;

function markStep(game: Game, doing: string): void {
  if (!LAST_STEP || lastStepBroken) return;
  try {
    writeFileSync(
      LAST_STEP,
      JSON.stringify({
        error: `last step: ${doing}`,
        spec: game.spec,
        taken: game.taken,
      }),
    );
  } catch (error) {
    // A diagnostic that cannot be written must not end the game it is
    // watching: said once, then off.
    lastStepBroken = true;
    process.stderr.write(
      `SYS1_LAST_STEP: ${error instanceof Error ? error.message : String(error)}; not writing it\n`,
    );
  }
}

interface Game {
  state: GameState;
  actions: number;
  rules: Partial<Record<PlayerId, Agent>>;
  /** The actions offered to Python, in its index order: legal minus pruned. */
  pending: LegalAction[];
  /** Every action taken, when the game was reset with `record`. */
  log?: RecordedAction[];
  /** How the game was made and every action id taken: enough to replay it. */
  spec: ResetSpec & {
    p1: string;
    p2: string;
    timeLimit: typeof TRAINING_TIME_LIMIT;
  };
  taken: string[];
}

interface RecordedAction {
  revision: number;
  actionId: string;
  turn: number;
  player: PlayerId;
  /** On a decision Python made: the ids it chose among, in its index order. */
  offered?: string[];
}

interface ResetSpec {
  id: number;
  p1: string;
  p2: string;
  seed: string;
  /** Seats played in this process by their deck's rules agent. */
  rules?: PlayerId | "both" | "none";
  record?: boolean;
}

const games = new Map<number, Game>();

function act(game: Game, action: LegalAction, offered?: LegalAction[]): void {
  game.log?.push({
    revision: game.state.revision,
    actionId: action.actionId,
    turn: game.state.turn,
    player: game.state.activePlayer,
    ...(offered ? { offered: offered.map((a) => a.actionId) } : {}),
  });
  game.taken.push(action.actionId);
  // Every action played here was offered by `observe` on this very state --
  // the rules agent's pick, the one forced action, or `pending` -- so the
  // engine is spared deriving the legal actions a second time to find it.
  game.state = applyOfferedAction(
    game.state,
    toGameAction(action, game.state.revision),
    action,
  ).state;
  game.actions += 1;
}

/** Plays every in-process and forced decision, then reports the next real one. */
async function advance(id: number, game: Game) {
  while (game.state.phase !== "finished" && game.actions < MAX_ACTIONS) {
    const seat = game.state.activePlayer;
    const observation = observe(game.state, seat);
    const agent = game.rules[seat];
    markStep(game, agent ? `rules agent ${seat} choosing` : "offering");
    if (agent) {
      if (acceptsSimulator(agent)) {
        const frozen = game.state;
        agent.useSimulator((actionId) =>
          simulateAction(frozen, actionId, seat),
        );
      }
      const picked = await timedAsync("rules", () =>
        agent.chooseAction(observation),
      );
      markStep(game, `rules agent ${seat} applying ${picked.actionId}`);
      // The offered action itself, whatever object the agent handed back.
      const chosen = observation.legalActions.find(
        (offer) => offer.actionId === picked.actionId,
      );
      if (!chosen)
        throw new Error(
          `rules agent ${seat} chose unoffered ${picked.actionId}`,
        );
      act(game, chosen);
      continue;
    }
    // Provably dominated actions (see `dominance.ts`) are never offered, so
    // the scorer neither plays nor trains on them.
    const pruned = prunedActions(observation);
    const offered = observation.legalActions.filter((_, i) => !pruned.has(i));
    if (offered.length === 1) {
      act(game, offered[0]!);
      continue;
    }
    game.pending = offered;
    const [primary, ...others] = RENDERS.map((version) => {
      const rendered = renderDecision(observation, version);
      return {
        version,
        state: rendered.state,
        actions: rendered.actions.filter((_, i) => !pruned.has(i)),
      };
    });
    return {
      id,
      seat,
      turn: observation.turn,
      ...(primary
        ? {
            render: primary.version,
            ...(TOKENS
              ? { tokens: TOKENS.decision(primary.state, primary.actions) }
              : { state: primary.state, actions: primary.actions }),
          }
        : {}),
      ...Object.fromEntries(
        others.map((other) => [
          `tokens_v${other.version}`,
          TOKENS!.decision(other.state, other.actions),
        ]),
      ),
      done: false,
      ...(COMPACT && TOKENS
        ? {
            compact: ((rows) => timed("pack", () => pack(rows)))(
              timed("compact", () =>
                compactDecision(observation, offered, TOKENS.rows, {
                  ownDeck: deckList(game.spec[seat]),
                }),
              ),
            ),
          }
        : {}),
      ...(AUDIT
        ? { audit: attackAudit(game.state, observation, offered) }
        : {}),
      ...(PRIVILEGED
        ? {
            privileged: timed("privileged", () => ({
              packed: floats(privilegedFeatures(game.state, seat)),
            })),
          }
        : {}),
    };
  }
  game.pending = [];
  const truncated = game.state.phase !== "finished";
  return {
    id,
    done: true,
    winner: game.state.winner,
    truncated,
    ...(truncated ? { capped: game.state.turnPlayerId } : {}),
    turn: game.state.turn,
    ...(game.log
      ? {
          trace: {
            rules: rulesStamp(),
            timeLimit: TRAINING_TIME_LIMIT,
            actions: game.log,
          },
        }
      : {}),
  };
}

async function reset(spec: ResetSpec) {
  const p1 = spec.p1 === "random" ? pick(spec.seed, 1) : spec.p1;
  const p2 = spec.p2 === "random" ? pick(spec.seed, 2, p1) : spec.p2;
  const seats: PlayerId[] =
    spec.rules === "both"
      ? ["p1", "p2"]
      : spec.rules && spec.rules !== "none"
        ? [spec.rules]
        : [];
  const game: Game = {
    state: createGame({
      gameId: `sys1-rl-${spec.id}-${spec.seed}`,
      p1: resolveTrainingDeck(p1),
      p2: resolveTrainingDeck(p2),
      seed: spec.seed,
      startingPlayer: "random",
      timeLimit: TRAINING_TIME_LIMIT,
    }),
    actions: 0,
    rules: Object.fromEntries(
      seats.map((seat) => [
        seat,
        createTrainingRulesAgent(seat === "p1" ? p1 : p2),
      ]),
    ),
    pending: [],
    ...(spec.record ? { log: [] } : {}),
    spec: { ...spec, p1, p2, timeLimit: TRAINING_TIME_LIMIT },
    taken: [],
  };
  games.set(spec.id, game);
  return { ...(await advance(spec.id, game)), p1, p2 };
}

const deckLists = new Map<string, Record<string, number>>();

/** A deck's list as copies per card number: what its pilot knows of it. */
function deckList(deckId: string): Record<string, number> {
  let list = deckLists.get(deckId);
  if (!list) {
    list = {};
    for (const number of resolveTrainingDeck(deckId).cards)
      list[number] = (list[number] ?? 0) + 1;
    deckLists.set(deckId, list);
  }
  return list;
}

/** A deck drawn from the seed, distinct from `other`: pairings stay replayable. */
function pick(seed: string, salt: number, other?: string): string {
  let hash = salt;
  for (let index = 0; index < seed.length; index += 1)
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  const pool = TRAINING_DECK_IDS.filter((deck) => deck !== other);
  return pool[hash % pool.length]!;
}

/**
 * A game the engine threw on ends there, rather than failing the whole
 * batch: it comes back done and truncated, with `failed` carrying the error
 * and what replays it (`createGame` from the spec, then `taken` in order).
 */
async function guarded(
  id: number,
  run: () => Promise<Record<string, unknown>>,
  requested?: ResetSpec,
): Promise<Record<string, unknown>> {
  try {
    return await run();
  } catch (error) {
    const game = games.get(id);
    games.delete(id);
    return {
      id,
      done: true,
      winner: null,
      truncated: true,
      failed: {
        error: error instanceof Error ? error.message : String(error),
        ...(game
          ? { spec: game.spec, taken: game.taken }
          : { spec: requested, taken: [] }),
      },
    };
  }
}

async function step(id: number, action: number) {
  const game = games.get(id);
  if (!game) throw new Error(`Unknown game ${id}`);
  const chosen = game.pending[action];
  if (!chosen) throw new Error(`game ${id}: no pending action ${action}`);
  markStep(game, `applying ${chosen.actionId}`);
  act(game, chosen, game.pending);
  return advance(id, game);
}

/** Each of `actions` played on a copy of game `from`, finished by both seats' rules agents. */
async function fork(from: number, actions: number[]) {
  const game = games.get(from);
  if (!game) throw new Error(`Unknown game ${from}`);
  const outcomes = [];
  for (const action of actions) {
    const chosen = game.pending[action];
    if (!chosen) throw new Error(`game ${from}: no pending action ${action}`);
    const copy: Game = {
      state: game.state,
      actions: game.actions,
      rules: {
        p1: createTrainingRulesAgent(game.spec.p1),
        p2: createTrainingRulesAgent(game.spec.p2),
      },
      pending: [],
      spec: game.spec,
      taken: [...game.taken],
    };
    act(copy, chosen);
    const result = await advance(-1, copy);
    outcomes.push({
      action,
      // Both seats are rules agents, so the copy only returns once it ends.
      winner: "winner" in result ? result.winner : null,
      truncated: "truncated" in result ? result.truncated : true,
    });
  }
  return { from, outcomes };
}

async function dispatch(request: Record<string, unknown>): Promise<unknown> {
  switch (request.cmd) {
    case "decks":
      return {
        decks: [...TRAINING_DECK_IDS],
        divisions: Object.fromEntries(
          TRAINING_DECK_IDS.map((deck) => [deck, trainingDeckDivision(deck)]),
        ),
        variants: TRAINING_DECK_VARIANTS,
      };
    case "reset": {
      const results = [];
      for (const spec of request.games as ResetSpec[])
        results.push(await guarded(spec.id, () => reset(spec), spec));
      return { results };
    }
    case "step": {
      // An entry may carry `next`, the game to start in that slot if this
      // move ends the one there: it comes back as `next` on the finished
      // result, so a caller keeping several requests in flight never has to
      // send a reset between them.
      const results = [];
      for (const entry of request.actions as {
        id: number;
        action: number;
        next?: ResetSpec;
      }[]) {
        const result = await guarded(entry.id, () =>
          step(entry.id, entry.action),
        );
        const next = entry.next;
        results.push(
          result.done && next
            ? {
                ...result,
                next: await guarded(next.id, () => reset(next), next),
              }
            : result,
        );
      }
      return { results };
    }
    case "fork": {
      const results = [];
      for (const entry of request.forks as {
        from: number;
        actions: number[];
      }[])
        results.push(await fork(entry.from, entry.actions));
      return { results };
    }
    default:
      throw new Error(`Unknown cmd ${String(request.cmd)}`);
  }
}

// Requests are handled strictly in arrival order: the client pairs replies to
// requests by position, and an async handler would otherwise interleave them.
let queue: Promise<void> = Promise.resolve();
createInterface({ input: process.stdin, crlfDelay: Infinity }).on(
  "line",
  (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      try {
        const request = timed(
          "parse",
          () => JSON.parse(line) as Record<string, unknown>,
        );
        const handled = performance.now();
        const result = await dispatch(request);
        if (PROFILE && result && typeof result === "object")
          (result as Record<string, unknown>).profile = takeProfile(
            performance.now() - handled,
          );
        const text = timed("stringify", () => JSON.stringify(result));
        timed("write", () => process.stdout.write(`${text}\n`));
      } catch (error) {
        process.stdout.write(
          `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
        );
      }
    });
  },
);
