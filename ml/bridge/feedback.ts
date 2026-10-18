/**
 * Flagged misplays, from the replay's "Download flags" files, as training
 * records for `sys1.ppo --feedback`.
 *
 *   pnpm exec tsx ml/bridge/feedback.ts <feedback.jsonl ...> --out <records.jsonl>
 *
 * Each file carries a match's config, rules stamp and action list
 * (`packages/web/src/scorer-review.ts`), so every flagged position is rebuilt
 * here from the file alone: the game is dealt from its seed and played to
 * the flagged action, and the position is rendered from the flagged player's
 * `observe()` exactly as the trainer sees a decision -- dominated actions
 * pruned, as in play. A record names the flagged move (`bad`) and the one the
 * reviewer preferred (`good`, or -1) by their index in that offered list.
 *
 * A flag is skipped, and said so, when its position cannot be what the
 * reviewer saw: a file recorded under different rules, a move that is not
 * legal where the file says it was made, or a move the dominance rules prune,
 * which the scorer is never offered.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  applyAction,
  createGame,
  describeStampMismatch,
  getLegalActions,
  observe,
  toGameAction,
  type GameState,
  type RulesStamp,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";
import type { PlayerId } from "@one-piece-sim/protocol";
import { renderDecision } from "../../packages/agents/src/scorer/render.js";
import { prunedActions } from "../../packages/agents/src/scorer/dominance.js";
import type { MatchConfig } from "../../packages/web/src/controller.js";
import type { ReviewFlag } from "../../packages/web/src/scorer-review.js";

interface FeedbackFile {
  config: MatchConfig;
  rules?: RulesStamp;
  actions: string[];
  flags: ReviewFlag[];
}

function read(path: string): FeedbackFile {
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const header = lines[0];
  if (header?.["kind"] !== "feedback-header")
    throw new Error(`${path}: not a feedback file`);
  return {
    config: header["config"] as MatchConfig,
    ...(header["rules"] ? { rules: header["rules"] as RulesStamp } : {}),
    actions: header["actions"] as string[],
    flags: lines
      .slice(1)
      .filter((line) => line["kind"] === "flag") as unknown as ReviewFlag[],
  };
}

function advance(state: GameState, actionId: string): GameState {
  const legal = getLegalActions(state, state.activePlayer).find(
    (action) => action.actionId === actionId,
  );
  if (!legal)
    throw new Error(`${actionId} is not legal at revision ${state.revision}`);
  return applyAction(state, toGameAction(legal, state.revision)).state;
}

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
if (outAt < 0 || !args[outAt + 1])
  throw new Error("--out <records.jsonl> is required");
const out = args[outAt + 1]!;
const inputs = args.filter((_, i) => i !== outAt && i !== outAt + 1);

const records: string[] = [];
let skipped = 0;
for (const path of inputs) {
  const file = read(path);
  const mismatch = describeStampMismatch(file.rules);
  if (mismatch) {
    console.warn(`${path}: skipped, recorded under other rules: ${mismatch}`);
    skipped += file.flags.length;
    continue;
  }
  let state = createGame({
    gameId: "feedback",
    p1: resolveDeck(file.config.p1Deck),
    p2: resolveDeck(file.config.p2Deck),
    seed: file.config.seed,
    ...(file.config.seedMode ? { seedMode: file.config.seedMode } : {}),
    startingPlayer: file.config.startingPlayer,
    ...(file.config.timeLimit ? { timeLimit: file.config.timeLimit } : {}),
  });
  let applied = 0;
  for (const flag of [...file.flags].sort(
    (a, b) => a.actionIndex - b.actionIndex,
  )) {
    while (applied < flag.actionIndex)
      state = advance(state, file.actions[applied++]!);
    const player: PlayerId = state.activePlayer;
    const where = `${path} action ${flag.actionIndex}`;
    if (
      player !== flag.player ||
      file.actions[flag.actionIndex] !== flag.actionId
    ) {
      console.warn(
        `${where}: skipped, the file does not reach the flagged move`,
      );
      skipped += 1;
      continue;
    }
    const observation = observe(state, player);
    const pruned = prunedActions(observation);
    const offered = observation.legalActions.filter((_, i) => !pruned.has(i));
    const index = (id: string | null) =>
      id === null ? -1 : offered.findIndex((action) => action.actionId === id);
    const bad = index(flag.actionId);
    const good = index(flag.preferred);
    if (bad < 0 || (flag.preferred !== null && good < 0)) {
      console.warn(
        `${where}: skipped, a move in the flag is pruned as dominated`,
      );
      skipped += 1;
      continue;
    }
    const rendered = renderDecision(observation);
    records.push(
      JSON.stringify({
        state: rendered.state,
        actions: rendered.actions.filter((_, i) => !pruned.has(i)),
        bad,
        good,
        source: path,
        actionIndex: flag.actionIndex,
        note: flag.note,
      }),
    );
  }
}
writeFileSync(out, records.length ? `${records.join("\n")}\n` : "");
console.log(
  `${records.length} flag${records.length === 1 ? "" : "s"} written to ${out}, ${skipped} skipped`,
);
