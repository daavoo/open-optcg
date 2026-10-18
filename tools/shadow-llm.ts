/**
 * Replays an exported match on rails and asks an LLM what it would have played
 * at every decision of one seat.
 *
 * `pnpm trace:compare` answers "what would the *rules* have done here" and joins
 * whatever LLM exchanges the file already recorded. It cannot ask a model
 * anything, so a match where a human played one seat and the rules the other --
 * which is what a bug report from the app looks like -- has no model opinion in
 * it to read.
 *
 * `pnpm matchup:llm` can put a model in a seat, but it plays its own games: a
 * position a reader is asking about will not occur in them.
 *
 * This asks the model about the *recorded* positions. Every action from the file
 * is applied in order, so each state is exactly the one the recorded controller
 * held, and at each decision of `--seat` the model is asked the same question
 * from a fresh context before the recorded action is applied. The game therefore
 * never diverges, which is the point and also the limit: it reports what a model
 * would choose in the positions that actually arose, not how the game would have
 * gone had the model piloted the seat from the start.
 *
 * A fresh context per decision (`LlmAgent.reset`) is deliberate. Keeping the
 * conversation would fill it with the model's own rejected suggestions followed
 * by states that do not follow from them, and the comparison is per-decision
 * anyway -- the cost is that a turn-long plan is re-derived at every step.
 *
 * `--repeat` asks the same decision several times. The model is not
 * deterministic, and a single answer read off one position says nothing about
 * whether a change helped: the position that prompted this tool's DON!!-plan
 * reporting is one the shipped prompt gets right about three times in four, so
 * an n=1 before-and-after will happily show an improvement that is not there.
 *
 * `--recorded-context` answers the other half of that question. Instead of
 * asking afresh it re-sends the provider request the trace recorded, history
 * and all, which separates "the prompt never says this" from "the conversation
 * had already decided it".
 *
 * Usage:
 *   pnpm trace:shadow --file=open-optcg-trace.jsonl --seat=p2
 *   pnpm trace:shadow --file=exported.jsonl --seat=p1 --revisions=25,26
 *   pnpm trace:shadow --file=exported.jsonl --revisions=195 --repeat=20
 *   pnpm trace:shadow --file=exported.jsonl --revisions=195 --recorded-context
 *   pnpm trace:shadow --file=exported.jsonl --provider-summary
 */
import { readFileSync } from "node:fs";
import { GameService } from "@one-piece-sim/engine-core";
import { resolveMatchDecks, deckManifests } from "@one-piece-sim/decks";
import { LlmAgent } from "@one-piece-sim/agents/llm";
import { createChatClient } from "@one-piece-sim/agents/chat-client";
import { llmMatchContext } from "@one-piece-sim/agents/llm-dossiers";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { rulesSeatLeader } from "../packages/web/src/rules-seat.js";
import { parseExportedMatch } from "../packages/web/src/diagnostics.js";
import { loadDotEnv } from "./load-env.js";
import type { GameObservation, PlayerId } from "@one-piece-sim/protocol";
import type { DeckManifest } from "@one-piece-sim/decks";

loadDotEnv();

const flags = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith("--")) continue;
  const [k, v] = arg.slice(2).split("=", 2);
  flags.set(k!, v ?? "true");
}
const file = flags.get("file")!;
const seat = (flags.get("seat") ?? "p2") as PlayerId;
const onlyRevisions = flags.get("revisions")?.split(",").map(Number);
const repeats = Number(flags.get("repeat") ?? 1);
const recordedContext = flags.get("recorded-context") === "true";
const effort = flags.get("effort");

const text = readFileSync(file, "utf8");
const match = parseExportedMatch(text);
const { config } = match;

const service = new GameService();
let observation = service.create({
  ...resolveMatchDecks(config),
  seed: config.seed,
  ...(config.seedMode ? { seedMode: config.seedMode } : {}),
  startingPlayer: config.startingPlayer,
  ...(config.timeLimit ? { timeLimit: config.timeLimit } : {}),
});

/**
 * The manifest the dossier prompt is built from.
 *
 * A custom deck is carried in the export header rather than in the registry, so
 * a match against one still has a real list to scout -- which is the whole point
 * of asking the model about a recorded position.
 */
function manifestFor(deckId: string, custom?: DeckManifest): DeckManifest {
  return custom ?? deckManifests[deckId]!;
}
const selfDeck = seat === "p1" ? config.p1Deck : config.p2Deck;
const oppDeck = seat === "p1" ? config.p2Deck : config.p1Deck;
const selfManifest = manifestFor(
  selfDeck,
  seat === "p1" ? config.p1CustomDeck : config.p2CustomDeck,
);
const oppManifest = manifestFor(
  oppDeck,
  seat === "p1" ? config.p2CustomDeck : config.p1CustomDeck,
);

const model = flags.get("model") ?? process.env.LLM_MODEL!;
/**
 * The provider's own account of its thinking, off unless asked for.
 *
 * The answer carries its own `reasoning`, written before the action IDs, and
 * `LlmAgent` prefers it -- so the provider summary is a second opinion that is
 * printed nowhere this tool reads. It is not free to ask for: on Gemini it sets
 * `includeThoughts`, which makes the model write its thinking out, where on the
 * Responses path the same request usually returns nothing at all. Asking for it
 * unconditionally meant the two transports were never doing the same work.
 */
const client = createChatClient({
  model,
  sessionLabel: `shadow:${selfDeck}`,
  reasoningSummary: flags.has("provider-summary") ? "auto" : null,
});
// The deck each seat is piloted *as*, when the trace says so. A custom deck has
// no dossier of its own, so without this a shadowed seat facing a player-built
// list scouts it with the generic profile while the recorded seat had the
// dossier the app gave it -- and the two answers are then not comparable.
const selfDossier =
  (seat === "p1" ? config.p1Dossier : config.p2Dossier) ?? selfDeck;
const oppDossier =
  (seat === "p1" ? config.p2Dossier : config.p1Dossier) ?? oppDeck;
const llm = new LlmAgent(
  client,
  llmMatchContext(selfDossier, selfManifest, oppDossier, oppManifest),
  effort
    ? { reasoningEffort: { default: effort as "low" | "medium" | "high" } }
    : undefined,
);
// Resolved through the Leader on the trace's own manifest, so a seat playing a
// deck the player built is compared against the policy that deck's Leader has
// rather than throwing `UNSUPPORTED_DECK`.
const rulesLeader = rulesSeatLeader(selfDeck, selfManifest);
const rules = (rulesLeader
  ? new RegistryRulesAgent(rulesLeader)
  : createRulesAgent(selfDeck)) as never as {
  chooseAction: (o: GameObservation) => Promise<{ actionId: string }>;
  lastDecision?: { reasons?: string[]; moduleId?: string };
};

/**
 * A second game replayed to one revision, for walking a plan on.
 *
 * The recorded line must not move -- a shadowed decision is only worth reading
 * because the position it answers is the position that arose -- so a plan that
 * needs its own attachments applied gets its own game to apply them in.
 */
function replayTo(revision: number): GameObservation {
  let scratch = service.create({
    ...resolveMatchDecks(config),
    seed: config.seed,
    ...(config.seedMode ? { seedMode: config.seedMode } : {}),
    startingPlayer: config.startingPlayer,
    ...(config.timeLimit ? { timeLimit: config.timeLimit } : {}),
  });
  for (const actionId of match.actions) {
    if (scratch.revision === revision) break;
    scratch = service.act(scratch.gameId, scratch.revision, actionId);
  }
  return scratch;
}

/**
 * Everything the model committed to at one decision, not only its first action.
 *
 * A DON!! allocation is "attach N times, then attack", and the N is the whole
 * question -- reporting the first action alone shows an attachment and hides
 * the size of it. The queued plan replays without further API calls, so
 * following it out costs local engine work and nothing else.
 *
 * The same is true of a defence, and it used to be reported as nothing at all:
 * the walk ran only while the phase was `main`, so every Counter step, Block
 * step and [Trigger] fell straight past it and printed `?` -- which the diff
 * column then counted as a disagreement with the recorded action. A shadow run
 * over one recorded seat reported 26 differences of which 7 were this, every
 * one of them a defensive decision, which is the half a change to the
 * Defending instructions has to be measured on. A Counter plan arrives as one
 * response -- ordered hand counters, then pass-counter -- and replays out of
 * the same queue, so following it out is again local work.
 */
async function walkPlan(revision: number) {
  let scratch = replayTo(revision);
  const before = scratch.self.activeDon;
  const names = new Map(
    scratch.self.board.map((c) => [c.instanceId, c.cardNumber]),
  );
  const attachments = new Map<string, number>();
  let first: string | undefined;
  let attack: string | undefined;
  const defence: string[] = [];
  // A plan is finite -- attachments are bounded by the DON!! in the cost area
  // and a defence by the hand -- but this walk applies the model's own answers
  // rather than the recorded ones, so it is capped rather than trusted.
  for (let step = 0; step < 40 && scratch.activePlayer === seat; step += 1) {
    llm.usePlanner(service.plannerFor(scratch.gameId, seat));
    const chosen = await llm.chooseAction(scratch);
    first ??= chosen.actionId;
    if (chosen.type === "attach-don") {
      const id = (chosen as { targetInstanceId: string }).targetInstanceId;
      attachments.set(id, (attachments.get(id) ?? 0) + 1);
    }
    if (chosen.type === "attack") {
      const a = chosen as unknown as {
        attackPower: number;
        counterShortfall: number;
      };
      attack = `attack at ${a.attackPower} (needs ${a.counterShortfall} Counter)`;
      break;
    }
    if (
      chosen.type === "counter" ||
      chosen.type === "activate-counter-event" ||
      chosen.type === "block"
    ) {
      // Every one of those three carries a summary, and it is the whole point
      // of the row: "Counter with Tony Tony.Chopper [P-101] (+1000 ...)".
      defence.push(chosen.summary);
    }
    // `pass-counter` carries the type `pass`, so this ends a defence as well as
    // a main phase, and after either there is nothing left to follow.
    if (chosen.type === "pass") {
      if (scratch.phase !== "main") defence.push("no further counters");
      break;
    }
    scratch = service.act(scratch.gameId, scratch.revision, chosen.actionId);
  }
  const given = [...attachments]
    .map(
      ([id, n]) =>
        `${id === `${seat}-leader` ? "Leader" : (names.get(id) ?? id)} x${n}`,
    )
    .join(", ");
  const spent = [...attachments.values()].reduce((sum, n) => sum + n, 0);
  // A defensive decision spends cards, not DON!!, so the DON!! line would read
  // "no DON!! given; no attack" for every one of them.
  if (defence.length > 0) {
    return { first: first ?? "?", line: defence.join(" then ") };
  }
  return {
    first: first ?? "?",
    line: [
      given ? `DON!! ${given}` : "no DON!! given",
      attack ?? "no attack",
      `${before - spent} DON!! left`,
    ].join("; "),
  };
}

/**
 * The recorded exchange, sent again exactly as it was.
 *
 * A trace stores the provider request verbatim and the agent keeps no
 * server-side state, so the decision can be re-asked in the conversation it was
 * originally asked in rather than a clean one.
 */
async function askRecorded(revision: number) {
  const entry = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find(
      (candidate) =>
        candidate["revision"] === revision + 1 &&
        (candidate["llm"] as { rawRequest?: unknown } | undefined)?.rawRequest,
    );
  if (!entry)
    return { first: "?", line: `no recorded request at r${revision}` };
  const raw = (entry["llm"] as { rawRequest: unknown }).rawRequest;
  // The recorded body is already provider-shaped, so it is posted as it stands
  // rather than rebuilt through a client that would normalise it.
  const response = await fetch(
    `${process.env.LLM_BASE_URL ?? "https://api.openai.com/v1"}/responses`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(raw),
    },
  );
  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    error?: { message?: string };
  };
  if (body.error) return { first: "?", line: `ERROR ${body.error.message}` };
  const text =
    body.output_text ??
    body.output?.flatMap((o) => o.content ?? []).find((c) => c.text)?.text ??
    "{}";
  const parsed = JSON.parse(text) as { actionIds?: string[] };
  return {
    first: parsed.actionIds?.[0] ?? "?",
    line: parsed.actionIds?.join(" + ") ?? "?",
  };
}

function board(side: GameObservation["self"] | GameObservation["opponent"]) {
  return side.board
    .map(
      (c) =>
        `${c.cardNumber}(${c.currentPower}${c.rested ? "r" : "a"}${c.attachedDon ? `+${c.attachedDon}don` : ""})`,
    )
    .join(" ");
}

console.log(`model ${model}; seat ${seat} = ${selfDeck}\n`);

for (const actionId of match.actions) {
  const acting = observation.activePlayer;
  const revision = observation.revision + 1;
  const shouldAsk =
    acting === seat &&
    observation.legalActions.length > 1 &&
    (!onlyRevisions || onlyRevisions.includes(revision));
  if (shouldAsk) {
    const rulesAction = await rules.chooseAction(observation);
    const rulesWhy = rules.lastDecision;
    console.log(
      `     r${revision} t${observation.turn} ${observation.phase} (${observation.legalActions.length} options)`,
    );
    console.log(
      `      board self[${board(observation.self)}] opp[${board(observation.opponent)}] don ${observation.self.activeDon}a/${observation.self.restedDon}r life ${observation.self.lifeCount}-${observation.opponent.lifeCount} hand[${observation.self.hand.map((c) => c.cardNumber).join(",")}]`,
    );
    const label = (id: string) =>
      observation.legalActions.find((a) => a.actionId === id)?.summary ?? id;
    console.log(`      recorded(rules): ${actionId}  ${label(actionId)}`);
    if (rulesAction.actionId !== actionId)
      console.log(`      rules-now:       ${rulesAction.actionId}`);
    if (rulesWhy?.reasons?.length)
      console.log(
        `      rules why:       [${rulesWhy.moduleId ?? "?"}] ${rulesWhy.reasons.join(" | ")}`,
      );
    for (let run = 1; run <= repeats; run += 1) {
      llm.reset();
      let plan: { first: string; line: string };
      try {
        plan = recordedContext
          ? await askRecorded(revision - 1)
          : await walkPlan(revision - 1);
      } catch (error) {
        console.log(
          `      llm ${run}:  ERROR ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      const mark = plan.first === actionId ? "==" : "!!";
      console.log(`      llm ${mark} ${run}: ${plan.first}  ${plan.line}`);
      // Every sample, not only a lone one. `--repeat` exists because the model
      // is not deterministic, and the reasoning is how a reader tells two
      // samples that chose differently apart -- suppressing it at repeat > 1
      // withheld the text exactly when there was something to compare.
      console.log(`      llm why ${run}:       ${llm.lastReasoning ?? "-"}`);
    }
    console.log();
  }
  observation = service.act(observation.gameId, observation.revision, actionId);
}
console.log("replay complete");
