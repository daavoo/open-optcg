/**
 * Captures the exact requests an LLM seat would send at real decisions, so a
 * transport can be measured against the prompt it actually serves.
 *
 * A latency comparison is only worth reading if both transports are asked the
 * same question, and the question has to be a real one: the system prompt is a
 * whole dossier and deck list, and the user message is a whole board. Hand
 * writing either would measure a prompt shape the agent never sends.
 *
 * So this replays a recorded match the way `trace:shadow` does and, at each
 * decision of `--seat`, lets `LlmAgent` build its request and captures it
 * instead of sending it. No API call is made; the recording client throws a
 * sentinel once it has the request, which also stops the agent's correction
 * round from asking a second question about an answer that never came.
 *
 * Usage:
 *   pnpm llm:fixture --file=open-optcg-trace.jsonl --seat=p2 --count=3
 *   pnpm llm:fixture --file=open-optcg-trace.jsonl --seat=p2 --from-turn=14
 */
import { readFileSync, writeFileSync } from "node:fs";
import { GameService } from "@one-piece-sim/engine-core";
import { resolveMatchDecks, deckManifests } from "@one-piece-sim/decks";
import { LlmAgent } from "@one-piece-sim/agents/llm";
import { llmMatchContext } from "@one-piece-sim/agents/llm-dossiers";
import { parseExportedMatch } from "../packages/web/src/diagnostics.js";
import type { LlmChatClient, LlmChatRequest } from "@one-piece-sim/agents/llm";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { DeckManifest } from "@one-piece-sim/decks";

const flags = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith("--")) continue;
  const [k, v] = arg.slice(2).split("=", 2);
  flags.set(k!, v ?? "true");
}
const file = flags.get("file")!;
const seat = (flags.get("seat") ?? "p2") as PlayerId;
const count = Number(flags.get("count") ?? 3);
const out = flags.get("out") ?? "llm-prompt-fixture.json";
/** Skip the opening turns: they are small boards with few legal actions. */
const minOptions = Number(flags.get("min-options") ?? 8);
/**
 * Skip everything before this turn, for looking at a position by name.
 *
 * A prompt bug is usually reported as "turn 14", and without this the only
 * knobs were `--count` and `--min-options`: reaching a late decision meant
 * capturing every earlier one that happened to be as wide.
 */
const fromTurn = Number(flags.get("from-turn") ?? 0);

const CAPTURED = "PROMPT_FIXTURE_CAPTURED";

class RecordingClient implements LlmChatClient {
  request: LlmChatRequest | undefined;
  async complete(request: LlmChatRequest): Promise<never> {
    this.request = request;
    throw new Error(CAPTURED);
  }
}

const match = parseExportedMatch(readFileSync(file, "utf8"));
const { config } = match;
const service = new GameService();
let observation = service.create({
  ...resolveMatchDecks(config),
  seed: config.seed,
  ...(config.seedMode ? { seedMode: config.seedMode } : {}),
  startingPlayer: config.startingPlayer,
  ...(config.timeLimit ? { timeLimit: config.timeLimit } : {}),
});

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
const selfDossier =
  (seat === "p1" ? config.p1Dossier : config.p2Dossier) ?? selfDeck;
const oppDossier =
  (seat === "p1" ? config.p2Dossier : config.p1Dossier) ?? oppDeck;

const recorder = new RecordingClient();
const llm = new LlmAgent(
  recorder,
  llmMatchContext(selfDossier, selfManifest, oppDossier, oppManifest),
);

interface Captured {
  revision: number;
  turn: number;
  phase: string;
  options: number;
  messages: LlmChatRequest["messages"];
  promptCacheKey: string | undefined;
  allowedActionIds: readonly string[] | undefined;
}
const captured: Captured[] = [];

for (const actionId of match.actions) {
  if (captured.length >= count) break;
  const acting = observation.activePlayer;
  if (
    acting === seat &&
    observation.turn >= fromTurn &&
    observation.legalActions.length >= minOptions
  ) {
    llm.reset();
    llm.usePlanner(service.plannerFor(observation.gameId, seat));
    try {
      await llm.chooseAction(observation);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes(CAPTURED)) {
        throw error;
      }
    }
    const request = recorder.request;
    if (request) {
      captured.push({
        revision: observation.revision + 1,
        turn: observation.turn,
        phase: observation.phase,
        options: observation.legalActions.length,
        messages: request.messages,
        promptCacheKey: request.promptCacheKey,
        allowedActionIds: request.allowedActionIds,
      });
    }
  }
  observation = service.act(observation.gameId, observation.revision, actionId);
}

const chars = (text: string) => `${(text.length / 1024).toFixed(1)}KB`;
for (const item of captured) {
  console.log(
    `r${item.revision} t${item.turn} ${item.phase}: ${item.options} options; ` +
      `system ${chars(item.messages[0]!.content)}, ` +
      `position ${chars(item.messages[1]?.content ?? "")}`,
  );
}
writeFileSync(
  out,
  JSON.stringify({ file, seat, deck: selfDeck, captured }, null, 2),
);
console.log(`\n${captured.length} decisions -> ${out}`);
