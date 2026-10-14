import {
  FirstLegalAgent,
  RegistryRulesAgent,
  SeededRandomAgent,
  type Agent,
} from "@one-piece-sim/agents/local";
import { llmMatchContext } from "@one-piece-sim/agents/llm-dossiers";
import {
  deckManifests,
  requireSupportedDeck,
  type FormatDeckId,
} from "@one-piece-sim/decks";
import { loadPrintedTextCache } from "@one-piece-sim/cards/node";
import { LlmAgent } from "@one-piece-sim/agents/llm";
import { createChatClient } from "@one-piece-sim/agents/chat-client";
import type { LlmJsonlRecorder } from "./llm-jsonl.js";

export type { FormatDeckId };
export type ControllerKind = "human" | "rules" | "llm" | "first" | "random";

/**
 * The rules agent for a deck, resolved through its Leader.
 *
 * This used to be an if-ladder over the six format deck ids, which meant adding
 * a deck to a trial meant editing this function, the benchmark's deck-id union,
 * and the agent class list. Going through the manifest's Leader instead means a
 * deck that has a registered policy is playable the moment its manifest exists,
 * and a deck that has none still runs on `chooseGenericRules` rather than
 * failing.
 */
export function createRulesAgent(deckId: string): Agent {
  return new RegistryRulesAgent(requireSupportedDeck(deckId).leader);
}

export function createLlmAgent(
  deckId: FormatDeckId,
  opponentDeckId: FormatDeckId,
  recorder?: LlmJsonlRecorder,
  controller = "llm",
): LlmAgent {
  const model = process.env.LLM_MODEL;
  if (!model) throw new Error("LLM_MODEL is required for an LLM controller");
  // The prompt's deck list is printed text, and under Node that text is the
  // gitignored reference cache. Nothing else on the play path loads it, so
  // without this a terminal or benchmark seat was piloting its own deck from
  // names and stats. Absent on a fresh clone, where this is a no-op and the
  // seat plays text-free -- the same way the browser does with no pack.
  loadPrintedTextCache();
  const client = createChatClient({
    model,
    sessionLabel: `open-optcg:${deckId}-vs-${opponentDeckId}:${controller}`,
  });
  return new LlmAgent(
    recorder ? recorder.wrap(client, controller, model) : client,
    llmMatchContext(
      deckId,
      deckManifests[deckId]!,
      opponentDeckId,
      deckManifests[opponentDeckId]!,
    ),
  );
}

export function createAgent(
  kind: Exclude<ControllerKind, "human">,
  deckId: FormatDeckId,
  opponentDeckId: FormatDeckId,
  seed: string,
  recorder?: LlmJsonlRecorder,
  controller?: string,
): Agent {
  switch (kind) {
    case "rules":
      return createRulesAgent(deckId);
    case "llm":
      return createLlmAgent(deckId, opponentDeckId, recorder, controller);
    case "first":
      return new FirstLegalAgent();
    case "random":
      return new SeededRandomAgent(seed);
  }
}
