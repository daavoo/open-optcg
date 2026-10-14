/**
 * Replays an exported diagnostics JSONL and asks the rules agent for each seat
 * what it would have chosen at every recorded decision, then reports where the
 * rules differ from the LLM (and from the human).
 *
 * The JSONL records the full action stream, so replaying it through GameService
 * with the same config reproduces the exact states (verified by stateHash).
 * At each decision point the rules agent for the acting seat is run against the
 * same observation the controller held, and its choice is compared to the
 * recorded action.
 *
 * Usage:
 *   pnpm trace:compare --file=exported-match.jsonl
 *   pnpm trace:compare --file=exported-match.jsonl --summary
 */
import { readFileSync } from "node:fs";
import { GameService, describeStampMismatch } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { resolveMatchDecks } from "@one-piece-sim/decks";
import { rulesSeatLeader } from "../packages/web/src/rules-seat.js";
import { parseExportedMatch } from "../packages/web/src/diagnostics.js";
import type { GameObservation, PlayerId } from "@one-piece-sim/protocol";
import type { Agent } from "@one-piece-sim/agents/local";
import type { ControllerKind } from "../packages/web/src/controller.js";
import type { DiagnosticsLine } from "../packages/web/src/diagnostics.js";

/** The observation shape as exported in an LLM call record: a JSON blob whose
 * structure follows `GameObservation`, but nothing guarantees that at the
 * type level since it round-tripped through `unknown` in `DiagnosticsLlmCall`. */
interface ExportedObservation {
  state?: { revision?: number };
  legalActions?: readonly { actionId: string; summary?: string }[];
}

/** The `lastDecision` getter that every `createRulesAgent` result actually
 * exposes at runtime (see `ComposedRulesAgent` in `packages/agents/src/local.ts`),
 * which the plain `Agent` interface does not declare. */
interface RulesAgentWithDecision extends Agent {
  lastDecision?: { reasons?: readonly string[]; moduleId?: string } | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const args = process.argv.slice(2);
const file = args.find((arg) => arg.startsWith("--file="))?.slice(7);
const summaryOnly = args.includes("--summary");

if (!file) {
  console.error("Usage: pnpm trace:compare --file=<path> [--summary]");
  process.exit(1);
}

const text = readFileSync(file, "utf8");
const match = parseExportedMatch(text);
const { config } = match;
const lines = text
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
const llmByRevision = new Map<
  number,
  { reasoning?: string; chosen?: readonly string[] }
>();
for (const line of lines.slice(1)) {
  const parsed = JSON.parse(line) as DiagnosticsLine;
  if (parsed.kind === "decision" && parsed.llm) {
    llmByRevision.set(parsed.revision, {
      ...(parsed.llm.reasoning !== undefined && {
        reasoning: parsed.llm.reasoning,
      }),
      ...(parsed.llm.chosen !== undefined && { chosen: parsed.llm.chosen }),
    });
  }
}

/**
 * Stop on a trace this build can no longer replay, and say why.
 *
 * Without this the replay below runs until the first action that has stopped
 * existing and dies as `ILLEGAL_ACTION: Unknown action: r59:effect:done` --
 * which reads as an engine bug when it is a recording made before the engine
 * stopped offering that choice. The stamp is the answer the trace already
 * carries; `--force` replays anyway, since a mismatch is proof of a change and
 * only strong evidence of a break.
 */
const staleReason = describeStampMismatch(match.rules);
if (staleReason && !args.includes("--force")) {
  console.error(`${file}: ${staleReason}`);
  console.error(
    "Its actions may no longer be legal. Re-run with --force to replay anyway.",
  );
  process.exit(2);
}

const service = new GameService();
let observation = service.create({
  ...resolveMatchDecks(config),
  seed: config.seed,
  ...(config.seedMode ? { seedMode: config.seedMode } : {}),
  startingPlayer: config.startingPlayer,
});
/**
 * The rules agent whose opinion this seat is compared against.
 *
 * Resolved through the Leader on the trace's own manifest rather than through
 * the deck id, the same way `worker.ts` resolves a rules seat in the browser.
 * A deck id is not enough: a trace exported after a game against a deck the
 * player built carries `CUSTOM-*` as its id and the list itself in
 * `p1CustomDeck`, and looking the id up in the registry threw
 * `UNSUPPORTED_DECK` -- so the one kind of match a player is most likely to
 * report, their own list, was the one this tool could not read.
 */
function rulesAgentForSeat(seat: PlayerId): RulesAgentWithDecision {
  const deckId = seat === "p1" ? config.p1Deck : config.p2Deck;
  const custom = seat === "p1" ? config.p1CustomDeck : config.p2CustomDeck;
  const leader = rulesSeatLeader(deckId, custom);
  if (!leader) throw new Error(`NO_LEADER_FOR_SEAT: ${seat} ${deckId}`);
  return new RegistryRulesAgent(leader);
}

const agents: Record<PlayerId, RulesAgentWithDecision> = {
  p1: rulesAgentForSeat("p1"),
  p2: rulesAgentForSeat("p2"),
};

interface Row {
  revision: number;
  turn: number;
  player: PlayerId;
  deck: string;
  controller: ControllerKind;
  recorded: string;
  rules: string;
  same: boolean;
  reasoning: string | undefined;
  rulesReasons: readonly string[];
  moduleId: string | undefined;
  phase: string;
  stateHashVerified: boolean;
  forced: boolean;
  /** Compact snapshot of the observation the decision was made from. */
  snapshot: string;
}

function snapshot(observation: GameObservation): string {
  type Side = GameObservation["self"] | GameObservation["opponent"];
  const side = (s: Side) =>
    `L${s.lifeCount} D${s.activeDon}/${s.restedDon} deck${s.deckCount} h${
      "hand" in s && Array.isArray(s.hand)
        ? `[${s.hand.map((c) => `${c.cardNumber}@${c.cost}`).join(",")}]`
        : `${(s as { handCount?: number }).handCount ?? "?"}`
    } b[${s.board
      .map(
        (c) =>
          `${c.cardNumber}=${c.currentPower}${c.rested ? "r" : "a"}${
            c.attachedDon ? `+${c.attachedDon}don` : ""
          }`,
      )
      .join(",")}] leader ${s.leader.currentPower}${
      s.leader.attachedDon ? `+${s.leader.attachedDon}don` : ""
    }${s.leader.rested ? "r" : ""}`;
  const battle = observation.activeBattle
    ? ` battle ${observation.activeBattle.attackPower}->${observation.activeBattle.targetPower} shortfall${observation.activeBattle.counterShortfall}`
    : "";
  return `${observation.turn} ${observation.activePlayer} ${observation.phase} | self ${side(observation.self)} | opp ${side(observation.opponent)}${battle}`;
}

const rows: Row[] = [];

// stateHash verification: recorded hash for revision N is the state AFTER the
// action at revision N, which is what the replay produced at that point.
const recordedHashes = new Map<number, string>();
for (const line of lines.slice(1)) {
  const parsed = JSON.parse(line) as DiagnosticsLine;
  if (parsed.kind === "decision")
    recordedHashes.set(parsed.revision, parsed.stateHash);
}

let hashOk = 0;
let hashBad = 0;

for (const actionId of match.actions) {
  const acting: PlayerId = observation.activePlayer;
  const recordedController = config[`${acting}Controller` as const];
  const forced =
    observation.legalActions.length === 1
      ? observation.legalActions[0]!.actionId
      : undefined;
  const rulesAgent = agents[acting];
  const rulesAction = await rulesAgent.chooseAction(observation);
  const decision = rulesAgent.lastDecision;

  const llm = llmByRevision.get(observation.revision + 1);
  rows.push({
    revision: observation.revision + 1,
    turn: observation.turn,
    player: acting,
    deck: acting === "p1" ? config.p1Deck : config.p2Deck,
    controller: recordedController,
    recorded: actionId,
    rules: rulesAction.actionId,
    same: rulesAction.actionId === actionId,
    reasoning: llm?.reasoning,
    rulesReasons: decision?.reasons ?? [],
    moduleId: decision?.moduleId,
    phase: observation.phase,
    stateHashVerified: true,
    forced: forced !== undefined,
    snapshot: snapshot(observation),
  });

  observation = service.act(observation.gameId, observation.revision, actionId);
  const recorded = recordedHashes.get(observation.revision);
  if (recorded === undefined) continue;
  if (recorded === observation.stateHash) hashOk += 1;
  else hashBad += 1;
}
/** One row is one line, and the model's reasoning is now a paragraph. */
function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
}

const differed = rows.filter((row) => !row.same);
console.log(
  `\n${file}: ${rows.length} decisions, ${differed.length} differ from rules, ${hashBad} hash anomalies\n`,
);

if (!summaryOnly) {
  for (const row of rows) {
    const mark = row.same ? "  " : "!!";
    const llm = row.reasoning ? `  llm: ${oneLine(row.reasoning)}` : "";
    const reasons = row.rulesReasons.length
      ? `  [${row.moduleId ?? "?"}] ${row.rulesReasons.join(" | ")}`
      : "";
    const forced = row.forced ? " (forced)" : "";
    console.log(
      `${mark} r${row.revision} t${row.turn} ${row.player} ${row.controller} ${row.phase.padEnd(10)}${forced} recorded=${row.recorded} rules=${row.rules}${llm}${reasons}`,
    );
  }
}

console.log(`\n=== Summary of differences ===`);
const byType = new Map<string, number>();
for (const row of differed) {
  const key = `${row.controller}:${row.phase}`;
  byType.set(key, (byType.get(key) ?? 0) + 1);
}
for (const [key, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`);
}

console.log(
  `\nReplay stateHash verified: ${hashOk} matched, ${hashBad} mismatched of ${rows.length} decisions.`,
);

// Print the differing rows with context for analysis
console.log(`\n=== Differing rows (recorded vs rules) ===`);
for (const row of differed) {
  const llm = row.reasoning ? `\n    llm: ${oneLine(row.reasoning)}` : "";
  const reasons = row.rulesReasons.length
    ? `\n    rules: [${row.moduleId ?? "?"}] ${row.rulesReasons.join(" | ")}`
    : "";
  console.log(
    `  r${row.revision} t${row.turn} ${row.player}(${row.deck}) ${row.phase} recorded=${row.recorded} rules=${row.rules}${llm}${reasons}`,
  );
}

if (args.includes("--context")) {
  console.log(`\n=== State snapshots at differing rows ===`);
  for (const row of differed) {
    console.log(`  r${row.revision} ${row.snapshot}`);
  }
}

// When --context-actions is given, dump the full legal actions at each
// differing row so the divergence can be judged.
if (args.includes("--context-actions")) {
  console.log(`\n=== Legal actions at differing rows ===`);
  const actionLines = new Map<string, string[]>();
  for (const line of lines.slice(1)) {
    const parsed = JSON.parse(line) as DiagnosticsLine;
    if (
      parsed.kind === "decision" &&
      parsed.llm?.observation &&
      isRecord(parsed.llm.observation)
    ) {
      const obs = parsed.llm.observation as ExportedObservation;
      const key = `${obs.state?.revision}`;
      if (actionLines.has(key)) continue;
      actionLines.set(
        key,
        (obs.legalActions ?? []).map(
          (a) => `    ${a.actionId} :: ${a.summary ?? ""}`,
        ),
      );
    }
  }
  for (const row of differed) {
    const actions = actionLines.get(String(row.revision - 1));
    if (!actions) continue;
    console.log(
      `  r${row.revision} recorded=${row.recorded} rules=${row.rules}`,
    );
    console.log(actions.join("\n"));
  }
}
