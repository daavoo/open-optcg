/**
 * Times the LLM transports against each other on real decision prompts.
 *
 * The two paths do not send the same request even when handed the same
 * `LlmChatRequest`, and the differences are all latency-relevant: the Responses
 * transport forwards the agent's per-decision `reasoningEffort` and marks a
 * cache breakpoint on the system message, while the Gemini transport forwards
 * neither. This measures what those differences cost, one arm per combination,
 * against prompts captured from a recorded match by `pnpm llm:fixture`.
 *
 * Arms that are not the shipped code -- a thinking level Gemini is never asked
 * for today -- are produced by wrapping the client's injected `fetch` and
 * editing the body on its way out, rather than by editing the client. The point
 * is to find out whether the change is worth making before making it, and a
 * wrapper cannot accidentally leave the measurement in the shipped path.
 *
 * Every call is reported, because the first call of an arm is a cold cache and
 * an average over a cold call and two warm ones hides exactly the thing the
 * cache arms exist to show.
 *
 * Usage:
 *   pnpm llm:bench --fixture=llm-prompt-fixture.json --repeat=2
 *   pnpm llm:bench --arms=gemini,gemini-low --repeat=3
 */
import { readFileSync } from "node:fs";
import { OpenAiChatClient } from "@one-piece-sim/agents/llm";
import { GeminiChatClient } from "@one-piece-sim/agents/gemini";
import { loadDotEnv } from "./load-env.js";
import type {
  LlmChatClient,
  LlmChatRequest,
  ReasoningEffort,
} from "@one-piece-sim/agents/llm";

loadDotEnv();

const flags = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith("--")) continue;
  const [k, v] = arg.slice(2).split("=", 2);
  flags.set(k!, v ?? "true");
}
const fixtureFile = flags.get("fixture") ?? "llm-prompt-fixture.json";
const repeat = Number(flags.get("repeat") ?? 2);
const openAiModel = flags.get("openai-model") ?? "gpt-5.6-terra";
const geminiModel = flags.get("gemini-model") ?? "gemini-3.7-flash";

interface Fixture {
  deck: string;
  captured: {
    revision: number;
    turn: number;
    phase: string;
    options: number;
    messages: LlmChatRequest["messages"];
    promptCacheKey?: string;
    allowedActionIds?: string[];
  }[];
}
const fixture = JSON.parse(readFileSync(fixtureFile, "utf8")) as Fixture;

/**
 * A `fetch` that edits the generation request before it goes out.
 *
 * The Gemini client has no way to ask for a thinking level -- that is the gap
 * being measured -- so the arm that would exist after the fix is built here.
 *
 * Only `:generateContent` is touched. The client posts to `/cachedContents`
 * too, and that endpoint has no `generationConfig` field: patching it blindly
 * makes every cache creation a 400, which the client absorbs as "caching
 * unavailable" and reports nowhere the summary can see. The first run of this
 * harness did exactly that, and the arm meant to test both changes together
 * silently tested only one of them.
 */
function patchingFetch(
  patch: (body: Record<string, unknown>) => void,
): typeof globalThis.fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (typeof init?.body !== "string" || !url.includes(":generateContent")) {
      return globalThis.fetch(input, init);
    }
    const body = JSON.parse(init.body) as Record<string, unknown>;
    patch(body);
    return globalThis.fetch(input, { ...init, body: JSON.stringify(body) });
  };
}

function geminiThinking(
  level: "low" | "high",
): (body: Record<string, unknown>) => void {
  return (body) => {
    const config = (body["generationConfig"] ??= {}) as Record<string, unknown>;
    config["thinkingConfig"] = {
      ...(config["thinkingConfig"] as object),
      thinkingLevel: level,
    };
  };
}

/** Tokens read off whichever provider's usage block the response carries. */
interface Usage {
  input: number;
  cached: number;
  output: number;
  thinking: number;
}
function usageOf(response: unknown): Usage {
  const record = (response ?? {}) as Record<string, unknown>;
  const gemini = record["usageMetadata"] as Record<string, number> | undefined;
  if (gemini) {
    return {
      input: gemini["promptTokenCount"] ?? 0,
      cached: gemini["cachedContentTokenCount"] ?? 0,
      output: gemini["candidatesTokenCount"] ?? 0,
      thinking: gemini["thoughtsTokenCount"] ?? 0,
    };
  }
  const openai = record["usage"] as Record<string, unknown> | undefined;
  const inputDetails = openai?.["input_tokens_details"] as
    Record<string, number> | undefined;
  const outputDetails = openai?.["output_tokens_details"] as
    Record<string, number> | undefined;
  return {
    input: (openai?.["input_tokens"] as number | undefined) ?? 0,
    cached: inputDetails?.["cached_tokens"] ?? 0,
    output: (openai?.["output_tokens"] as number | undefined) ?? 0,
    thinking: outputDetails?.["reasoning_tokens"] ?? 0,
  };
}

interface Arm {
  name: string;
  note: string;
  effort?: ReasoningEffort;
  client: () => LlmChatClient;
}

const geminiKey = process.env.GEMINI_API_KEY ?? process.env.OPENAI_API_KEY;
const arms: Arm[] = [
  {
    name: "openai",
    note: "Responses, no effort set -- the shipped default",
    client: () => new OpenAiChatClient({ model: openAiModel }),
  },
  {
    name: "openai-low",
    note: "Responses, reasoningEffort=low -- what the agent sends when told to",
    effort: "low",
    client: () => new OpenAiChatClient({ model: openAiModel }),
  },
  {
    name: "gemini",
    note: "generateContent as shipped: no thinking control, implicit cache",
    client: () =>
      new GeminiChatClient({
        model: geminiModel,
        ...(geminiKey ? { apiKey: geminiKey } : {}),
        reasoningSummary: null,
      }),
  },
  {
    name: "gemini-low",
    note: "as shipped plus thinkingLevel=low -- the proposed effort mapping",
    client: () =>
      new GeminiChatClient({
        model: geminiModel,
        ...(geminiKey ? { apiKey: geminiKey } : {}),
        reasoningSummary: null,
        fetch: patchingFetch(geminiThinking("low")),
      }),
  },
  {
    name: "gemini-thoughts",
    note: "as shipped plus includeThoughts -- what trace tools ask for",
    client: () =>
      new GeminiChatClient({
        model: geminiModel,
        ...(geminiKey ? { apiKey: geminiKey } : {}),
        reasoningSummary: "auto",
      }),
  },
  {
    name: "gemini-cache",
    note: "as shipped plus LLM_EXPLICIT_CACHE=true",
    client: () =>
      new GeminiChatClient({
        model: geminiModel,
        ...(geminiKey ? { apiKey: geminiKey } : {}),
        reasoningSummary: null,
        explicitCache: true,
      }),
  },
  {
    name: "gemini-low-cache",
    note: "both proposed changes together",
    client: () =>
      new GeminiChatClient({
        model: geminiModel,
        ...(geminiKey ? { apiKey: geminiKey } : {}),
        reasoningSummary: null,
        explicitCache: true,
        fetch: patchingFetch(geminiThinking("low")),
      }),
  },
];

const selected = (flags.get("arms")?.split(",") ?? arms.map((a) => a.name))
  .map((name) => arms.find((arm) => arm.name === name)!)
  .filter(Boolean);

interface Row extends Usage {
  arm: string;
  revision: number;
  run: number;
  ms: number;
  error?: string;
}
const rows: Row[] = [];

/**
 * One client per arm, held for the whole run, as a game holds one: an explicit
 * cache is created on the first call and reused, which is the behaviour under
 * test.
 */
const clients = new Map(selected.map((arm) => [arm.name, arm.client()]));

/**
 * Every call, arms interleaved rather than run one arm at a time.
 *
 * Provider latency drifts with load over the minutes a run takes, so an arm
 * measured start to finish is partly measuring when it was scheduled. The first
 * run of this harness put two accidentally identical configurations 4.7s apart
 * in the mean that way. Interleaving spreads that drift across every arm
 * instead of concentrating it in whichever went last.
 */
const schedule: {
  arm: Arm;
  run: number;
  decision: Fixture["captured"][number];
}[] = [];
for (let run = 1; run <= repeat; run += 1) {
  for (const decision of fixture.captured) {
    for (const arm of selected) schedule.push({ arm, run, decision });
  }
}

for (const { arm, run, decision } of schedule) {
  const client = clients.get(arm.name)!;
  const request: LlmChatRequest = {
    messages: decision.messages,
    ...(decision.promptCacheKey
      ? { promptCacheKey: decision.promptCacheKey }
      : {}),
    ...(decision.allowedActionIds
      ? { allowedActionIds: decision.allowedActionIds }
      : {}),
    ...(arm.effort ? { reasoningEffort: arm.effort } : {}),
  };
  const started = performance.now();
  try {
    const response = await client.complete(request);
    const ms = performance.now() - started;
    rows.push({
      arm: arm.name,
      revision: decision.revision,
      run,
      ms,
      ...usageOf(response.rawExchange?.response),
    });
  } catch (error) {
    rows.push({
      arm: arm.name,
      revision: decision.revision,
      run,
      ms: performance.now() - started,
      input: 0,
      cached: 0,
      output: 0,
      thinking: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const last = rows.at(-1)!;
  console.log(
    `  ${arm.name.padEnd(17)} r${String(last.revision).padEnd(4)} run${last.run}  ` +
      (last.error
        ? `ERROR ${last.error.slice(0, 120)}`
        : `${(last.ms / 1000).toFixed(1)}s  in ${last.input} (${last.cached} cached)  out ${last.output}  think ${last.thinking}`),
  );
}
for (const client of clients.values()) {
  if (client instanceof GeminiChatClient) await client.deleteCache();
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);

console.log(
  `\n${"arm".padEnd(17)} ${"n".padEnd(3)} ${"median".padEnd(8)} ${"mean".padEnd(8)} ${"in".padEnd(8)} ${"cached".padEnd(8)} ${"out".padEnd(7)} think`,
);
for (const arm of selected) {
  const armRows = rows.filter((row) => row.arm === arm.name && !row.error);
  const failures = rows.filter((row) => row.arm === arm.name && row.error);
  if (armRows.length === 0) {
    console.log(`${arm.name.padEnd(17)} all ${failures.length} calls failed`);
    continue;
  }
  const times = armRows.map((row) => row.ms / 1000);
  const per = (pick: (row: Row) => number) =>
    Math.round(sum(armRows.map(pick)) / armRows.length);
  console.log(
    `${arm.name.padEnd(17)} ${String(armRows.length).padEnd(3)} ` +
      `${`${median(times).toFixed(1)}s`.padEnd(8)} ` +
      `${`${(sum(times) / times.length).toFixed(1)}s`.padEnd(8)} ` +
      `${String(per((row) => row.input)).padEnd(8)} ` +
      `${String(per((row) => row.cached)).padEnd(8)} ` +
      `${String(per((row) => row.output)).padEnd(7)} ` +
      `${per((row) => row.thinking)}` +
      (failures.length ? `   (${failures.length} failed)` : ""),
  );
}
for (const arm of selected) console.log(`  ${arm.name}: ${arm.note}`);
