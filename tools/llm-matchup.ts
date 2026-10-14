/**
 * Runs a fixed number of games between two decks with an LLM in both seats.
 *
 * Either seat can also be piloted by a rules agent, so the same tool answers
 * both "does the model beat the policy in this matchup" and "how do two
 * arbitrary decks play out when the same model pilots both". A new matchup
 * needs only deck ids. Seats alternate so a deck's record cannot be a
 * first-player record in disguise.
 *
 * Each game writes one v2 diagnostics JSONL -- the same artefact the web app
 * exports, built by the same function. That format exists because a trace and a
 * separate LLM log meant joining two files on revision to answer "why did it do
 * that"; here one line is one decision, carrying the events it produced and the
 * exchange that produced it, and the shared prompt and card text are hoisted
 * into the header instead of repeating in every call.
 *
 * Usage:
 *   tsx tools/llm-matchup.ts --left ST31 --right OP16-ENEL-SHONEN \
 *     --games 10 --out traces/st31-vs-op16-enel
 *
 * Pilots are addressable per deck or per seat, and the two forms may not be
 * mixed. Per deck follows the deck as it alternates seats, which is what a series
 * with one deck under test wants:
 *   tsx tools/llm-matchup.ts --left ST36 --right ST31 \
 *     --left-pilot rules --right-pilot llm --games 4
 *
 * A `rules` seat can have modules switched off, which is how an LLM series gets a
 * control arm: run the same `--seed-prefix` twice, once with the layer on and once
 * without it.
 *   tsx tools/llm-matchup.ts --left ST36 --right ST31 \
 *     --left-pilot rules --right-pilot llm --games 4 \
 *     --left-disable strategy:midrange,strategy:midrange-kid-st36
 *
 * Either seat can play a custom deck from a file instead of a registered id.
 * The file is a plain deck list in the deck editor's export format (one
 * "Nx CARD-NUMBER" per line, Leader first). `--left`/`--right` then name the
 * custom deck; when omitted the name is the file's base name.
 *   tsx tools/llm-matchup.ts --left MyST31 --left-file decks/my-st31.txt \
 *     --right OP16-NAMI-6738 --games 3
 *
 * A custom deck has no dossier of its own, so an LLM seat playing one is given
 * the plan of a shipped deck with `--<side>-dossier`, the batch-runner form of
 * the web app's dossier picker:
 *   tsx tools/llm-matchup.ts --left MyST31 --left-file decks/my-st31.txt \
 *     --left-dossier "(Red) Monkey.D.Luffy - Starter Deck 31" --right ST35
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  LlmAgent,
  type LlmChatClient,
  type LlmChatResponse,
  type ReasoningEffort,
} from "@one-piece-sim/agents/llm";
import {
  FirstLegalAgent,
  RegistryRulesAgent,
  SeededRandomAgent,
  type Agent,
} from "@one-piece-sim/agents/local";
import { createChatClient } from "@one-piece-sim/agents/chat-client";
import {
  DOSSIER_DECK_IDS,
  llmMatchContext,
} from "@one-piece-sim/agents/llm-dossiers";
import {
  deckManifests,
  requireSupportedDeck,
  resolveMatchDecks,
  type DeckManifest,
} from "@one-piece-sim/decks";
import { GameService, rulesStamp } from "@one-piece-sim/engine-core";
import {
  buildDiagnosticsJsonl,
  type RawLlmRecord,
} from "../packages/web/src/diagnostics.js";
import {
  parseDeckList,
  toManifest,
  validateDeck,
} from "../packages/web/src/deck-editor.js";
import type {
  MatchConfig,
  TraceCheckpoint,
} from "../packages/web/src/controller.js";
import type {
  GameObservation,
  PlayerId,
  PublicEvent,
} from "@one-piece-sim/protocol";
import { loadDotEnv } from "./load-env.js";

// Before `LLM_MODEL` and the transport selection are read below.
loadDotEnv();

const flags = new Map<string, string>();
for (let index = 0; index < process.argv.length; index += 1) {
  const argument = process.argv[index]!;
  if (!argument.startsWith("--")) continue;
  const [key, inline] = argument.slice(2).split("=", 2);
  if (!key) continue;
  const next = process.argv[index + 1];
  if (inline !== undefined) flags.set(key, inline);
  else if (next && !next.startsWith("--")) flags.set(key, next);
  else flags.set(key, "true");
}

let leftDeck = flags.get("left") ?? "(Red) Monkey.D.Luffy - Starter Deck 31";
let rightDeck = flags.get("right") ?? "(Purple) Enel - Official Feature Deck";
const selectedIndices = flags.get("indices")
  ? flags
      .get("indices")!
      .split(",")
      .map((value) => Number(value.trim()))
  : undefined;
const games = selectedIndices?.length ?? Number(flags.get("games") ?? "10");
const maxSteps = Number(flags.get("max-steps") ?? "1000");
const seedPrefix = flags.get("seed-prefix") ?? "llm-matchup";
const fixedSeed = flags.get("seed");
const concurrency = Number(flags.get("concurrency") ?? "1");
const pilotKinds = ["llm", "rules", "random", "first"] as const;
type PilotKind = (typeof pilotKinds)[number];

function requirePilotKind(flag: string, value: string): PilotKind {
  if (!pilotKinds.includes(value as PilotKind)) {
    throw new Error(
      `INVALID_${flag.toUpperCase().replace("-", "_")}: ${value}`,
    );
  }
  return value as PilotKind;
}

/**
 * Who pilots a seat, addressable by **seat** or by **side**.
 *
 * `--p1-pilot` / `--p2-pilot` name a seat and never move. `--left-pilot` /
 * `--right-pilot` name a *deck*, and therefore follow it as it alternates seats
 * every game -- which is what a series with one deck under test needs, and what
 * `--left-disable` already meant.
 *
 * Both forms exist because the mix of the two is a genuine foot-gun: every other
 * deck-scoped flag here is side-named (`--left`, `--left-file`, `--left-disable`),
 * so `--left-pilot rules` reads as though it must work. Before this it was
 * silently ignored and both seats defaulted to `llm`, which produced a
 * model-versus-model series that looked exactly like the intended
 * rules-versus-model one -- 16 games deep, the only tell was `p1Controller` in
 * the trace header. Naming both forms and rejecting their combination is cheaper
 * than the next reader losing an afternoon the same way.
 */
const seatPilots = {
  p1: flags.get("p1-pilot"),
  p2: flags.get("p2-pilot"),
} as const;
const sidePilots = {
  left: flags.get("left-pilot"),
  right: flags.get("right-pilot"),
} as const;
if (
  (sidePilots.left !== undefined || sidePilots.right !== undefined) &&
  (seatPilots.p1 !== undefined || seatPilots.p2 !== undefined)
) {
  throw new Error(
    "PILOT_FLAG_CONFLICT: use --left-pilot/--right-pilot (per deck) or --p1-pilot/--p2-pilot (per seat), not both.",
  );
}
const usesSidePilots =
  sidePilots.left !== undefined || sidePilots.right !== undefined;

/** The seat assignment for one game index; the left deck starts in p1. */
function seatOfSide(index: number): { left: PlayerId; right: PlayerId } {
  return index % 2 === 0
    ? { left: "p1", right: "p2" }
    : { left: "p2", right: "p1" };
}

function pilotsForGame(index: number): Record<PlayerId, PilotKind> {
  if (!usesSidePilots) {
    return {
      p1: requirePilotKind("p1-pilot", seatPilots.p1 ?? "llm"),
      p2: requirePilotKind("p2-pilot", seatPilots.p2 ?? "llm"),
    };
  }
  const seats = seatOfSide(index);
  return {
    [seats.left]: requirePilotKind("left-pilot", sidePilots.left ?? "llm"),
    [seats.right]: requirePilotKind("right-pilot", sidePilots.right ?? "llm"),
  } as Record<PlayerId, PilotKind>;
}

/** Every pilot kind this run can use, for the model check and the banner. */
const pilotKindsInUse: readonly PilotKind[] = usesSidePilots
  ? [
      requirePilotKind("left-pilot", sidePilots.left ?? "llm"),
      requirePilotKind("right-pilot", sidePilots.right ?? "llm"),
    ]
  : [
      requirePilotKind("p1-pilot", seatPilots.p1 ?? "llm"),
      requirePilotKind("p2-pilot", seatPilots.p2 ?? "llm"),
    ];
/**
 * Modules to switch off in a `rules` seat, by side rather than by seat.
 *
 * `--left-disable strategy:midrange,strategy:midrange-kid-st36` is the control
 * arm of an LLM series: run the same seeds twice, once with the layer on and once
 * with it off, and the deck under test is the only thing that differs. Named by
 * side because the deck alternates seats every game, so `--left-disable` follows
 * the deck rather than the seat -- which is what a comparison across the two runs
 * needs.
 *
 * Matched by `RegistryRulesAgent` as a prefix as well as exactly, so one entry can
 * name a whole strategy layer or a single rule inside it, exactly as
 * `pnpm deck:ab --disable` does.
 *
 * This is not a paired A/B. The model's own choices differ between the two runs,
 * so the seed does not pin the whole game the way it does in `deck:ab` -- it pins
 * the shuffle and the deck under test, and nothing more. See
 * `docs/proposals/rules-ai-next-steps.md` for what a series this size can and
 * cannot show.
 */
const disableBySide = {
  left: (flags.get("left-disable") ?? "").split(",").filter(Boolean),
  right: (flags.get("right-disable") ?? "").split(",").filter(Boolean),
} as const;
/**
 * The deck a seat is piloted *as*, when that is not the deck it is playing.
 *
 * A custom deck from `--left-file` has no dossier and never can, so without
 * this an LLM seat playing one gets the generic profile -- and a series against
 * a home-brew list then measures the model with no plan against a model with
 * one. The web app already carries the same override as
 * `MatchConfig.p1Dossier`; this is that flag for the batch runner, and it names
 * a *side* for the same reason `--left-disable` does. Both seats read it: the
 * deck's own dossier when it is piloting, and its scouting profile when it is
 * across the table.
 */
const dossierBySide = {
  left: flags.get("left-dossier"),
  right: flags.get("right-dossier"),
} as const;
for (const [side, deckId] of Object.entries(dossierBySide)) {
  if (deckId !== undefined && !DOSSIER_DECK_IDS.has(deckId)) {
    throw new Error(
      `UNKNOWN_DOSSIER: --${side}-dossier ${deckId} is not a deck with a dossier`,
    );
  }
}
/** Turn banners only; the default also prints every decision the model makes. */
const quiet = flags.has("quiet");
/**
 * Ask for a reasoning summary per call. Off by default here: summarising is the
 * bulk of the output tokens, output tokens are what decide latency, and a batch
 * run of ten games is not read summary by summary. The reasoning the answer
 * itself carries still lands in every trace, so `--reasoning-summary` is only
 * needed when the provider's account of its own thinking is wanted too.
 */
const reasoningSummary = flags.has("reasoning-summary") ? "auto" : null;
/**
 * Provider reasoning effort, e.g. `--reasoning-effort low`. Unset leaves the
 * provider default, which every recorded run used; lowering it trades play
 * strength for latency, so it belongs on a flag rather than in the default.
 */
const reasoningEffort = flags.get("reasoning-effort") as
  ReasoningEffort | undefined;

/**
 * A seat takes `--<seat>-file` to play a custom deck from disk. `--left` and
 * `--right` keep their registered-id meaning; when a file is present the flag
 * becomes that deck's name and the registered id is not consulted. Files are
 * loaded and validated up front so a bad deck fails before any game is
 * spawned, and the manifest travels with the game the same way the web app
 * carries a custom deck: through `p1CustomDeck`/`p2CustomDeck`.
 */
const customDeckManifests = new Map<string, DeckManifest>();
if (flags.get("left-file")) {
  leftDeck = registerDeckFile(
    "left",
    flags.get("left-file")!,
    flags.get("left"),
  );
}
if (flags.get("right-file")) {
  rightDeck = registerDeckFile(
    "right",
    flags.get("right-file")!,
    flags.get("right"),
  );
}

const outputDirectory = resolve(
  flags.get("out") ??
    `traces/${leftDeck.toLowerCase()}-vs-${rightDeck.toLowerCase()}`,
);

if (!Number.isInteger(games) || games < 1) {
  throw new Error(`INVALID_GAMES: ${flags.get("games")}`);
}
if (
  selectedIndices &&
  (new Set(selectedIndices).size !== selectedIndices.length ||
    selectedIndices.some((index) => !Number.isInteger(index) || index < 0))
) {
  throw new Error(`INVALID_INDICES: ${flags.get("indices")}`);
}
if (!Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error(`INVALID_CONCURRENCY: ${flags.get("concurrency")}`);
}
if (!customDeckManifests.has(leftDeck)) requireSupportedDeck(leftDeck);
if (!customDeckManifests.has(rightDeck)) requireSupportedDeck(rightDeck);

/**
 * Reads a deck list from `--<seat>-file` and registers it under its deck id,
 * so `requireSupportedDeck` is skipped for that seat and the manifest is found
 * by `manifestFor` and passed to the engine as the seat's custom deck.
 */
function registerDeckFile(
  seat: "left" | "right",
  filePath: string,
  name: string | undefined,
): string {
  const deckId = name ?? basename(filePath).replace(/\.[^.]+$/, "");
  if (deckManifests[deckId]) {
    throw new Error(
      `DECK_ID_TAKEN: ${deckId} is a registered deck; choose a different --${seat} name or drop --${seat}-file`,
    );
  }
  if (customDeckManifests.has(deckId)) {
    throw new Error(`DUPLICATE_DECK_ID: ${deckId} is used by both seats`);
  }
  const deck = parseDeckList(readFileSync(resolve(filePath), "utf8"));
  const validation = validateDeck(deck);
  if (validation.errors.length > 0) {
    throw new Error(
      `INVALID_DECK: ${filePath}\n${validation.errors.join("\n")}`,
    );
  }
  const manifest = toManifest(deck, deckId);
  customDeckManifests.set(deckId, manifest);
  return deckId;
}

/** The registered manifest, or the file-loaded custom deck when one exists. */
function manifestFor(deckId: string): DeckManifest {
  return customDeckManifests.get(deckId) ?? deckManifests[deckId]!;
}

const model = process.env.LLM_MODEL;
if (pilotKindsInUse.includes("llm") && !model) {
  throw new Error("LLM_MODEL is required for an LLM pilot");
}

interface GameResult {
  index: number;
  seed: string;
  /** Which deck sat in which seat, so deck record and seat record stay separable. */
  seats: Record<PlayerId, string>;
  startingPlayer: PlayerId | null;
  winner: PlayerId | null;
  winnerDeck: string | null;
  reason: GameObservation["resultReason"];
  turns: number;
  revisions: number;
  /** Model calls versus steps the runner took itself, so cost per game is readable. */
  llmDecisions: number;
  automaticActions: number;
  durationSeconds: number;
  /**
   * API calls, which is not `llmDecisions`: one call can answer a whole Counter
   * plan and be replayed across several decisions, and a rejected answer costs
   * a second call for one decision.
   */
  llmCalls: number;
  tracePath: string;
  error?: string;
}

interface CapturedCall {
  timestamp: string;
  rawExchange?: LlmChatResponse["rawExchange"];
  error?: string;
  /** Set when this call is the re-ask, naming what the previous answer got wrong. */
  correctionReason?: string;
}

/**
 * `LlmAgent` answers an unusable response with a bare re-ask carrying the
 * complaint and the legal IDs. Recognising it is what lets the rejected attempt
 * be recorded as the failure it was, instead of standing as the decision while
 * the answer that was actually played goes unrecorded.
 */
function correctionReason(content: string | undefined): string | undefined {
  if (!content) return undefined;
  return /^(.*?) Choose again, copying action IDs exactly/s.exec(content)?.[1];
}

/**
 * Holds each model call until the runner knows which action it produced.
 *
 * `LlmAgent.lastRawExchange` clones on read, so the agent cannot say whether it
 * has answered since the last look -- two reads of one call are indistinguish-
 * able from two calls. Capturing at the client counts calls exactly, which also
 * catches the retries and failures that never become an action at all.
 */
class CallCollector {
  #pending: CapturedCall[] = [];

  wrap(client: LlmChatClient): LlmChatClient {
    return {
      complete: async (request) => {
        const timestamp = new Date().toISOString();
        const correction = correctionReason(request.messages.at(-1)?.content);
        try {
          const response = await client.complete(request);
          this.#pending.push({
            timestamp,
            ...(correction ? { correctionReason: correction } : {}),
            ...(response.rawExchange
              ? { rawExchange: response.rawExchange }
              : {}),
          });
          return response;
        } catch (error) {
          this.#pending.push({
            timestamp,
            ...(correction ? { correctionReason: correction } : {}),
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    } satisfies LlmChatClient;
  }

  take(): CapturedCall[] {
    const calls = this.#pending;
    this.#pending = [];
    return calls;
  }
}

function createLlm(
  deckId: string,
  opponentDeckId: string,
  collector: CallCollector,
  seat: PlayerId,
  dossierDeckId: string | undefined,
  opponentDossierDeckId: string | undefined,
): LlmAgent {
  const client = createChatClient({
    model: model!,
    sessionLabel: `open-optcg:${deckId}-vs-${opponentDeckId}:${seat}`,
    reasoningSummary,
  });
  return new LlmAgent(
    collector.wrap(client),
    // Ids and manifests come apart here, exactly as they do in the web
    // worker: the dossier is looked up by the deck the seat is piloted *as*,
    // while the list and the card text in the prompt are the deck it plays.
    llmMatchContext(
      dossierDeckId ?? deckId,
      manifestFor(deckId),
      opponentDossierDeckId ?? opponentDeckId,
      manifestFor(opponentDeckId),
    ),
    reasoningEffort ? { reasoningEffort: { default: reasoningEffort } } : {},
  );
}

function createPilot(
  kind: PilotKind,
  deckId: string,
  opponentDeckId: string,
  collector: CallCollector,
  seat: PlayerId,
  seed: string,
  disableModules: readonly string[] = [],
  dossierDeckId?: string,
  opponentDossierDeckId?: string,
): Agent {
  switch (kind) {
    case "llm":
      return createLlm(
        deckId,
        opponentDeckId,
        collector,
        seat,
        dossierDeckId,
        opponentDossierDeckId,
      );
    case "rules":
      return new RegistryRulesAgent(manifestFor(deckId).leader, {
        ...(disableModules.length > 0
          ? { disableModules: [...disableModules] }
          : {}),
      });
    case "random":
      return new SeededRandomAgent(`${seed}:${seat}`);
    case "first":
      return new FirstLegalAgent();
  }
}

const runStartedAt = Date.now();

function elapsed(): string {
  const seconds = Math.round((Date.now() - runStartedAt) / 1000);
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * One seat's counters, read from whichever half of the observation holds them.
 *
 * The observation is written from the active player's side, so the same seat is
 * `self` on its own turn and `opponent` on the other, and a progress line that
 * did not normalise that would swap its two columns every turn.
 */
function sideStats(observation: GameObservation, seat: PlayerId): string {
  if (seat === observation.viewer) {
    const view = observation.self;
    return `life ${view.lifeCount} hand ${view.hand.length} board ${view.board.length} don ${view.activeDon}+${view.restedDon} deck ${view.deckCount}`;
  }
  const view = observation.opponent;
  return `life ${view.lifeCount} hand ${view.handCount} board ${view.board.length} don ${view.activeDon}+${view.restedDon} deck ${view.deckCount}`;
}

function firstReason(decision: { reasons: string[] } | undefined): string {
  const reason = decision?.reasons[0];
  if (!reason) return "";
  return reason.length > 90 ? `${reason.slice(0, 89)}...` : reason;
}

async function runGame(index: number): Promise<GameResult> {
  // The left deck starts in p1 and swaps every game, so ten games are five from
  // each seat rather than ten reads of the same seat assignment.
  const { left: leftSeat, right: rightSeat } = seatOfSide(index);
  const seats = {
    [leftSeat]: leftDeck,
    [rightSeat]: rightDeck,
  } as Record<PlayerId, string>;
  const seed = fixedSeed ?? `${seedPrefix}-${index}`;
  const stem = `game-${String(index).padStart(2, "0")}-${leftDeck.toLowerCase()}-${leftSeat}`;
  const tracePath = resolve(outputDirectory, `${stem}.jsonl`);
  const collector = new CallCollector();
  const service = new GameService();
  const disableForSeat = (seat: PlayerId): readonly string[] =>
    seat === leftSeat ? disableBySide.left : disableBySide.right;
  const dossierForSeat = (seat: PlayerId): string | undefined =>
    seat === leftSeat ? dossierBySide.left : dossierBySide.right;
  const pilots = pilotsForGame(index);
  const agents = {
    p1: createPilot(
      pilots.p1,
      seats.p1,
      seats.p2,
      collector,
      "p1",
      seed,
      disableForSeat("p1"),
      dossierForSeat("p1"),
      dossierForSeat("p2"),
    ),
    p2: createPilot(
      pilots.p2,
      seats.p2,
      seats.p1,
      collector,
      "p2",
      seed,
      disableForSeat("p2"),
      dossierForSeat("p2"),
      dossierForSeat("p1"),
    ),
  } as const;

  const p1CustomDeck = customDeckManifests.get(seats.p1);
  const p2CustomDeck = customDeckManifests.get(seats.p2);
  const config: MatchConfig = {
    p1Deck: seats.p1,
    p2Deck: seats.p2,
    p1Controller: pilots.p1,
    p2Controller: pilots.p2,
    seed,
    seedMode: "matchup",
    startingPlayer: "random",
    ...(p1CustomDeck ? { p1CustomDeck } : {}),
    ...(p2CustomDeck ? { p2CustomDeck } : {}),
    ...(dossierForSeat("p1") ? { p1Dossier: dossierForSeat("p1")! } : {}),
    ...(dossierForSeat("p2") ? { p2Dossier: dossierForSeat("p2")! } : {}),
  };
  let observation = service.create({
    ...resolveMatchDecks(config),
    seed: config.seed,
    seedMode: "matchup",
    startingPlayer: config.startingPlayer,
  });
  const startingPlayer = observation.activePlayer;
  const initialEvents: readonly PublicEvent[] = structuredClone(
    observation.publicEvents,
  );
  const checkpoints: TraceCheckpoint[] = [];
  const llmRecords: RawLlmRecord[] = [];
  const actions: string[] = [];

  /**
   * Attaches the calls made since the last action to the action they chose.
   *
   * Only the last call of a drain produced the action: anything before it was
   * re-asked, and the call that follows says why. The format holds one exchange
   * per decision, so a rejected attempt is recorded as its own failure line
   * rather than silently taking the decision's place.
   */
  function drainCalls(
    turn: number,
    player: PlayerId,
    actionId?: string,
    reasoningSummary?: string,
  ): void {
    const calls = collector.take();
    for (const [position, call] of calls.entries()) {
      const error = call.error ?? calls[position + 1]?.correctionReason;
      llmRecords.push({
        timestamp: call.timestamp,
        turn,
        player,
        ...(actionId && !error ? { actionId } : {}),
        ...(reasoningSummary && !error ? { reasoning: reasoningSummary } : {}),
        ...(error ? { error } : {}),
        ...(call.rawExchange ? { rawExchange: call.rawExchange } : {}),
      });
    }
  }

  function writeTrace(): void {
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(
      tracePath,
      buildDiagnosticsJsonl({
        trace: {
          version: 1,
          config,
          actions: [...actions],
          initialEvents,
          checkpoints: [...checkpoints],
          // The same stamp the app writes into an exported trace. Without it a
          // batch run's traces are the only ones in the repo that cannot say
          // which rules produced them, so a replay of one that has gone stale
          // fails as an illegal action rather than as a stale recording.
          rules: rulesStamp(),
        },
        llmRecords,
        exportedAt: new Date().toISOString(),
      }),
    );
  }

  const tag = `g${index}`;
  const gameStartedAt = Date.now();
  console.log(
    `[${tag}] start ${seats.p1}(p1) vs ${seats.p2}(p2) seed=${seed} first=${startingPlayer} (${elapsed()})`,
  );

  let decisions = 0;
  let automatic = 0;
  let reportedTurn = -1;
  try {
    for (let step = 0; step < maxSteps && observation.phase !== "finished";) {
      const player = observation.activePlayer;
      const agent = agents[player];
      if (observation.turn !== reportedTurn) {
        reportedTurn = observation.turn;
        console.log(
          `[${tag}] turn ${reportedTurn} ${seats[player]}(${player}) | ` +
            `${leftDeck} ${sideStats(observation, leftSeat)} | ` +
            `${rightDeck} ${sideStats(observation, rightSeat)} | ` +
            `${decisions} decisions ${automatic} auto (${elapsed()})`,
        );
      }
      const forcedAction =
        observation.legalActions.length === 1
          ? observation.legalActions[0]
          : undefined;
      // Rebound per decision: a planner is bound to the state it was made for,
      // and it is what lets the seat answer an action's effect choices in the
      // same call as the action itself.
      if (agent instanceof LlmAgent) {
        agent.usePlanner(service.plannerFor(observation.gameId, player));
      }
      const startedAt = Date.now();
      let action;
      try {
        action = forcedAction ?? (await agent.chooseAction(observation));
      } catch (error) {
        // The failed calls are the whole point of the record here: without them
        // the trace would end with no sign of why.
        drainCalls(observation.turn, player);
        writeTrace();
        throw error;
      }
      if (forcedAction) automatic += 1;
      else {
        const llmAgent = agent instanceof LlmAgent ? agent : undefined;
        if (llmAgent) decisions += 1;
        drainCalls(
          observation.turn,
          player,
          action.actionId,
          llmAgent?.lastReasoningSummary,
        );
        if (!quiet) {
          // The reasoning is what makes a line worth reading -- the action
          // alone says what happened, not why the model thinks it helps.
          const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
          console.log(
            `[${tag}] t${observation.turn} ${player} ${observation.phase} ` +
              `${action.type} :: ${action.summary} [${seconds}s]` +
              (firstReason(llmAgent?.lastDecision)
                ? `\n[${tag}]     ${firstReason(llmAgent?.lastDecision)}`
                : ""),
          );
        }
      }
      const before = observation;
      const seen = before.publicEvents.length;
      observation = service.act(
        before.gameId,
        before.revision,
        action.actionId,
      );
      actions.push(action.actionId);
      checkpoints.push({
        revision: observation.revision,
        actionId: action.actionId,
        turn: before.turn,
        player: before.activePlayer,
        stateHash: observation.stateHash,
        events: structuredClone(observation.publicEvents.slice(seen)),
      });
      step += 1;
      // Rebuilding the whole file is O(n) in a growing document, so it happens
      // periodically rather than per action; a killed game still leaves a
      // readable trace of everything up to the last checkpoint written.
      if (step % 25 === 0) writeTrace();
    }
  } catch (error) {
    writeTrace();
    throw error;
  }

  const stopped = observation.phase !== "finished";
  writeTrace();
  if (stopped) throw new Error(`STEP_LIMIT: ${stem}`);
  return {
    index,
    seed,
    seats,
    startingPlayer,
    winner: observation.winner,
    winnerDeck: observation.winner ? seats[observation.winner] : null,
    reason: observation.resultReason,
    turns: observation.turn,
    revisions: observation.revision,
    llmDecisions: decisions,
    automaticActions: automatic,
    durationSeconds: Math.round((Date.now() - gameStartedAt) / 1000),
    llmCalls: llmRecords.length,
    tracePath,
  };
}

const results: GameResult[] = [];
const summaryPath = resolve(outputDirectory, "summary.json");

function tally(): Record<string, number> {
  const wins: Record<string, number> = { [leftDeck]: 0, [rightDeck]: 0 };
  for (const result of results) {
    const deck = result.winnerDeck;
    if (deck) wins[deck] = (wins[deck] ?? 0) + 1;
  }
  return wins;
}

function writeSummary(): void {
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        model,
        matchup: { left: leftDeck, right: rightDeck },
        methodology: {
          controllers: usesSidePilots
            ? {
                left: sidePilots.left ?? "llm",
                right: sidePilots.right ?? "llm",
              }
            : { p1: seatPilots.p1 ?? "llm", p2: seatPilots.p2 ?? "llm" },
          disabled: disableBySide,
          seedMode: "matchup",
          seats: "left deck starts in p1 and alternates each game",
        },
        games,
        completed: results.filter((result) => !result.error).length,
        failed: results.filter((result) => result.error).length,
        wins: tally(),
        results,
      },
      null,
      2,
    )}\n`,
  );
}

console.log(
  `${leftDeck} vs ${rightDeck}: ${games} games, ` +
    (usesSidePilots
      ? `${sidePilots.left ?? "llm"} on ${leftDeck} vs ${sidePilots.right ?? "llm"} on ${rightDeck}`
      : `${seatPilots.p1 ?? "llm"} in p1 vs ${seatPilots.p2 ?? "llm"} in p2`) +
    (pilotKindsInUse.includes("llm") ? ` (${model})` : ""),
);
console.log(`Writing to ${outputDirectory}`);

async function playGame(index: number): Promise<void> {
  const leftSeat = index % 2 === 0 ? "p1" : "p2";
  try {
    const result = await runGame(index);
    results.push(result);
    const done = results.filter((entry) => !entry.error).length;
    const wins = tally();
    console.log(
      `[g${index}] DONE winner=${result.winnerDeck} (${result.winner}) reason=${result.reason} ` +
        `turns=${result.turns} decisions=${result.llmDecisions} ${result.durationSeconds}s | ` +
        `running ${leftDeck} ${wins[leftDeck]} - ${wins[rightDeck]} ${rightDeck} after ${done}/${games} (${elapsed()})`,
    );
  } catch (error) {
    // A game that dies is one lost data point, not a lost run; its trace and
    // JSONL are already on disk for whatever killed it.
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      index,
      seed: fixedSeed ?? `${seedPrefix}-${index}`,
      seats: {
        [leftSeat]: leftDeck,
        [leftSeat === "p1" ? "p2" : "p1"]: rightDeck,
      } as Record<PlayerId, string>,
      startingPlayer: null,
      winner: null,
      winnerDeck: null,
      reason: null,
      turns: 0,
      revisions: 0,
      llmDecisions: 0,
      automaticActions: 0,
      durationSeconds: 0,
      llmCalls: 0,
      tracePath: resolve(
        outputDirectory,
        `game-${String(index).padStart(2, "0")}-${leftDeck.toLowerCase()}-${leftSeat}.jsonl`,
      ),
      error: message,
    });
    console.error(`[g${index}] FAILED: ${message} (${elapsed()})`);
  }
  // Written after every game so an interrupted run still leaves what finished.
  writeSummary();
}

// Games share nothing but the output directory, and each one is mostly spent
// waiting on the model, so a small pool turns hours of wall clock into one hour
// without changing any result. Default 1 -- concurrency is opt-in because the
// provider's rate limit, not this process, decides how many are safe.
const queue =
  selectedIndices ?? Array.from({ length: games }, (_, index) => index);
await Promise.all(
  Array.from({ length: Math.min(concurrency, games) }, async () => {
    for (
      let index = queue.shift();
      index !== undefined;
      index = queue.shift()
    ) {
      await playGame(index);
    }
  }),
);
results.sort((left, right) => left.index - right.index);
writeSummary();

const wins = tally();
const failed = results.filter((result) => result.error).length;
console.log(
  `\n${leftDeck}: ${wins[leftDeck]}  ${rightDeck}: ${wins[rightDeck]}  (${results.length - failed}/${games} completed)`,
);
console.log(`Summary: ${summaryPath}`);
if (failed > 0) process.exitCode = 1;
