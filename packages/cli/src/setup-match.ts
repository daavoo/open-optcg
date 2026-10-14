import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { GameService, type Plan } from "@one-piece-sim/engine-core";
import type {
  GameObservation,
  LegalAction,
  PlayerId,
} from "@one-piece-sim/protocol";
import {
  St31RulesAgent,
  St32RulesAgent,
  St33RulesAgent,
  St34RulesAgent,
  St35RulesAgent,
  St36RulesAgent,
} from "@one-piece-sim/agents/local";
import { LlmAgent } from "@one-piece-sim/agents/llm";
import {
  createAgent,
  type FormatDeckId,
  type ControllerKind,
} from "./agent-factory.js";
import { FORMAT_DECK_IDS, resolveDeck } from "@one-piece-sim/decks";
import { chooseHumanAction } from "./human-seat.js";
import { TraceRecorder, type TraceController } from "./trace.js";
import { defaultLlmLogPath, LlmJsonlRecorder } from "./llm-jsonl.js";

interface MatchController {
  kind: ControllerKind;
  reasoning?: () => string | undefined;
  decision?: () => { reasons: string[] } | undefined;
  /** Lookahead for the decision about to be made, when the seat can use one. */
  usePlanner?: (plan: Plan) => void;
  chooseAction(
    observation: GameObservation,
    prompt: ReturnType<typeof createInterface>,
    labels: Record<PlayerId, string>,
  ): Promise<LegalAction | null>;
}

const deckOptions: Array<{ label: string; value: FormatDeckId }> =
  FORMAT_DECK_IDS.map((id) => ({ label: id, value: id }));

const controllerOptions: Array<{ label: string; value: ControllerKind }> = [
  { label: "Human", value: "human" },
  { label: "Rules agent (deck-specific)", value: "rules" },
  { label: "LLM", value: "llm" },
  { label: "First legal action agent", value: "first" },
  { label: "Seeded random agent", value: "random" },
];

async function select<T>(
  prompt: ReturnType<typeof createInterface>,
  title: string,
  options: Array<{ label: string; value: T }>,
): Promise<T> {
  console.log(`\n${title}`);
  options.forEach((option, index) => {
    console.log(`  ${index + 1}. ${option.label}`);
  });
  for (;;) {
    const answer = (await prompt.question("Select: ")).trim();
    const selected = options.at(Number(answer) - 1);
    if (selected !== undefined) return selected.value;
    console.log(`Enter a number from 1 to ${options.length}.`);
  }
}

function makeController(
  kind: ControllerKind,
  deckId: FormatDeckId,
  opponentDeckId: FormatDeckId,
  seed: string,
  recorder: LlmJsonlRecorder | undefined,
  playerId: PlayerId,
): MatchController {
  if (kind === "human") {
    return {
      kind,
      chooseAction: chooseHumanAction,
    };
  }
  const agent = createAgent(
    kind,
    deckId,
    opponentDeckId,
    seed,
    recorder,
    playerId,
  );
  if (agent instanceof LlmAgent) {
    return {
      kind,
      async chooseAction(observation) {
        return agent.chooseAction(observation);
      },
      usePlanner(plan) {
        agent.usePlanner(plan);
      },
      reasoning() {
        return agent.lastReasoning;
      },
    };
  }
  if (
    agent instanceof St31RulesAgent ||
    agent instanceof St32RulesAgent ||
    agent instanceof St33RulesAgent ||
    agent instanceof St34RulesAgent ||
    agent instanceof St35RulesAgent ||
    agent instanceof St36RulesAgent
  ) {
    return {
      kind,
      async chooseAction(observation) {
        return agent.chooseAction(observation);
      },
      decision() {
        return agent.lastDecision;
      },
    };
  }
  return {
    kind,
    async chooseAction(observation) {
      return agent.chooseAction(observation);
    },
  };
}

function traceController(kind: ControllerKind): TraceController {
  if (kind === "human" || kind === "llm") {
    return kind === "llm" ? "llm-agent" : "human";
  }
  return "rules-agent";
}

const prompt = createInterface({ input, output });
let trace: TraceRecorder | null = null;
let observation: GameObservation | null = null;
let quit = false;

try {
  console.log("One Piece Simulator - Match Setup");
  const p1Deck = await select(prompt, "Deck A (P1)", deckOptions);
  const p1Kind = await select(prompt, "Controller A (P1)", controllerOptions);
  const p2Deck = await select(prompt, "Deck B (P2)", deckOptions);
  const p2Kind = await select(prompt, "Controller B (P2)", controllerOptions);
  const seed =
    (await prompt.question("\nSeed [interactive-match]: ")).trim() ||
    "interactive-match";
  const tracePath = (await prompt.question("Trace JSON path [none]: ")).trim();
  const llmLogPath =
    process.env.LLM_LOG_PATH || (tracePath ? defaultLlmLogPath(tracePath) : "");
  const hasLlmController = p1Kind === "llm" || p2Kind === "llm";
  const llmRecorder =
    hasLlmController && llmLogPath
      ? new LlmJsonlRecorder(llmLogPath)
      : undefined;

  const labels: Record<PlayerId, string> = {
    p1: `${p1Deck} (P1)`,
    p2: `${p2Deck} (P2)`,
  };
  const controllers: Record<PlayerId, MatchController> = {
    p1: makeController(
      p1Kind,
      p1Deck,
      p2Deck,
      `${seed}:p1-agent`,
      llmRecorder,
      "p1",
    ),
    p2: makeController(
      p2Kind,
      p2Deck,
      p1Deck,
      `${seed}:p2-agent`,
      llmRecorder,
      "p2",
    ),
  };
  trace = tracePath
    ? new TraceRecorder(tracePath, seed, { p1: p1Deck, p2: p2Deck })
    : null;
  const service = new GameService({ callbacks: trace ? [trace] : [] });
  observation = service.create({
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed,
  });
  trace?.setInitialObservation(observation);

  console.log(
    `\nStarting ${p1Deck} (${p1Kind}) vs ${p2Deck} (${p2Kind})${trace ? `; trace: ${trace.filePath}` : ""}`,
  );
  if (llmRecorder) console.log(`LLM JSONL: ${llmRecorder.filePath}`);

  while (observation.phase !== "finished" && !quit) {
    const controller = controllers[observation.activePlayer];
    const forcedPass =
      observation.phase === "block" &&
      observation.legalActions.length === 1 &&
      observation.legalActions[0]?.type === "pass";
    controller.usePlanner?.(
      service.plannerFor(observation.gameId, observation.activePlayer),
    );
    const action = forcedPass
      ? observation.legalActions[0]!
      : await controller.chooseAction(observation, prompt, labels);
    if (!action) {
      quit = true;
      continue;
    }
    if (forcedPass) {
      console.log(
        `\n${labels[observation.activePlayer]} automatic: ${action.summary} (no active Blocker available)`,
      );
    } else if (controller.kind !== "human") {
      console.log(
        `\n${labels[observation.activePlayer]} ${controller.kind}: ${action.summary}`,
      );
      const reasoning = controller.reasoning?.();
      if (reasoning) console.log(`  Reasoning summary: ${reasoning}`);
    }
    trace?.setController(
      forcedPass ? "automatic" : traceController(controller.kind),
    );
    trace?.setDecision(forcedPass ? undefined : controller.decision?.());
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
  }
} finally {
  prompt.close();
  if (trace && observation) trace.finish(observation, quit);
}

if (observation.phase === "finished") {
  console.log(
    `\nGame over: ${observation.winner?.toUpperCase()} wins by ${observation.resultReason}.`,
  );
} else {
  console.log("Match ended.");
}
