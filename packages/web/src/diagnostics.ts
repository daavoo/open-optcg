import type { RulesStamp } from "@one-piece-sim/engine-core";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import type { MatchConfig, MatchTrace, SavedMatch } from "./controller.js";

/**
 * The single exported artefact for a match: engine trace and LLM calls joined.
 *
 * There used to be two downloads -- a trace and an "LLM diagnostics" file that
 * embedded a byte-identical copy of that same trace -- and reading them meant
 * cross-referencing `llmCalls[i].actionId` against `trace.actions[j]`, then
 * hand-diffing cumulative event arrays to discover what an action actually did.
 * The v2 format is JSONL: one header line carrying everything constant for the
 * match, then one line per decision holding the state, the events that decision
 * produced, and the model exchange that produced it. One line is one complete
 * decision, which is the unit anybody debugging a bad turn actually wants.
 */
export const DIAGNOSTICS_VERSION = 2;

export interface DiagnosticsLlmHeader {
  model?: string;
  /** Sent once as the first system message; identical for every later call. */
  systemPrompt?: string;
  /** The structured-output schema, re-echoed by the provider on every call. */
  responseSchema?: unknown;
  /**
   * Card text for everything either player has seen.
   *
   * Repeated verbatim inside every observation -- 275KB of a 459KB payload in
   * the export that motivated this format -- so it is hoisted here and stripped
   * from the per-decision observations.
   */
  cardFacts?: unknown;
}

export interface DiagnosticsHeader {
  kind: "header";
  version: number;
  exportedAt: string;
  config: MatchConfig;
  /** The rules the game was played under, so a stale trace says so on load. */
  rules?: RulesStamp;
  /** Setup events, which belong to no action. See `MatchTrace.initialEvents`. */
  events: readonly PublicEvent[];
  llm?: DiagnosticsLlmHeader;
}

export interface DiagnosticsLlmCall {
  timestamp: string;
  model?: string;
  responseId?: string;
  /** The observation, parsed. It arrives as a JSON string nested in the request. */
  observation?: unknown;
  chosen?: readonly string[];
  /** What the model wrote in its answer, ahead of the actions it named. */
  reasoning?: string;
  plan?: readonly string[];
  /** The provider's own thinking summary, when it returned one. */
  reasoningSummary?: string;
  usage?: unknown;
  /** Present only when the exchange did not match the expected shape. */
  rawRequest?: unknown;
  rawResponse?: unknown;
}

export interface DiagnosticsDecision {
  kind: "decision";
  revision: number;
  actionId: string;
  turn: number;
  player: PlayerId;
  stateHash: string;
  /** Only what this action added to the public log. */
  events: readonly PublicEvent[];
  /**
   * Derived triage labels, so a bad turn can be found by grep rather than by
   * reading the match. See {@link decisionFlags} for what each one means.
   */
  flags?: readonly string[];
  llm?: DiagnosticsLlmCall;
}

export interface DiagnosticsLlmError {
  kind: "llm-error";
  timestamp: string;
  turn: number;
  player: PlayerId;
  error: string;
  reasoningSummary?: string;
  rawRequest?: unknown;
  rawResponse?: unknown;
}

export type DiagnosticsLine =
  DiagnosticsHeader | DiagnosticsDecision | DiagnosticsLlmError;

/** What the web app records for one model call, before this module reshapes it. */
export interface RawLlmRecord {
  timestamp: string;
  turn: number;
  player: PlayerId;
  actionId?: string;
  error?: string;
  reasoning?: string;
  rawExchange?: { request: unknown; response: unknown };
  payloadSource?: "exact" | "normalized";
  /**
   * The 1-based index of the action this call was deciding: the key the match
   * history joins a call onto the step it produced. A failed call carries the
   * index it was asked about, so it is read next to the move that was made
   * instead. Absent only on a trace exported before the two were shown
   * together.
   */
  actionCount?: number;
}

export interface InspectedMatch {
  match: SavedMatch;
  llmRecords: RawLlmRecord[];
}

export interface ParsedExchange {
  model?: string;
  systemPrompt?: string;
  responseSchema?: unknown;
  observation?: Record<string, unknown>;
  cardFacts?: unknown;
  responseId?: string;
  chosen?: readonly string[];
  reasoning?: string;
  plan?: readonly string[];
  usage?: unknown;
  /** True when every field above was read successfully. */
  recognised: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The text of one request message, which is either a bare string or the array
 * form the provider requires when a prompt-cache breakpoint is attached.
 */
function messageText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .map((part) => (isRecord(part) ? asString(part["text"]) : undefined))
    .filter((text): text is string => text !== undefined);
  return parts.length > 0 ? parts.join("") : undefined;
}

/**
 * The five things a decision's exchange carries, whichever API produced it.
 *
 * Three transports now reach the same agent -- OpenAI Responses, an
 * OpenAI-compatible `/chat/completions` proxy, and Gemini's `generateContent`
 * -- and every one of them spells these differently. Reading only the Responses
 * spelling did not fail loudly; it returned `recognised: false`, and a run's
 * traces silently lost the observation, the chosen action, the reasoning and
 * the token usage that every analysis of a match reads.
 */
interface ExchangeFields {
  systemPrompt?: string | undefined;
  observationText?: string | undefined;
  schema?: unknown;
  outputText?: string | undefined;
  usage?: unknown;
  responseId?: string | undefined;
}

/** OpenAI Responses: `input` blocks in, `output_text` out. */
function responsesFields(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ExchangeFields {
  const input = Array.isArray(request["input"]) ? request["input"] : [];
  let systemPrompt: string | undefined;
  let observationText: string | undefined;
  for (const item of input) {
    if (!isRecord(item)) continue;
    const text = messageText(item["content"]);
    if (text === undefined) continue;
    if (item["role"] === "system") systemPrompt = text;
    else observationText = text;
  }
  const textFormat = isRecord(request["text"]) ? request["text"] : undefined;
  const format = isRecord(textFormat?.["format"])
    ? textFormat["format"]
    : undefined;
  return {
    ...(systemPrompt === undefined ? {} : { systemPrompt }),
    ...(observationText === undefined ? {} : { observationText }),
    ...(format?.["schema"] === undefined ? {} : { schema: format["schema"] }),
    ...(asString(response["output_text"]) === undefined
      ? {}
      : { outputText: asString(response["output_text"]) }),
    ...(response["usage"] === undefined ? {} : { usage: response["usage"] }),
    ...(asString(response["id"]) === undefined
      ? {}
      : { responseId: asString(response["id"]) }),
  };
}

/** Chat Completions: `messages` in, `choices[0].message.content` out. */
function chatCompletionsFields(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ExchangeFields {
  const messages = Array.isArray(request["messages"])
    ? request["messages"]
    : [];
  let systemPrompt: string | undefined;
  let observationText: string | undefined;
  for (const item of messages) {
    if (!isRecord(item)) continue;
    const text = messageText(item["content"]);
    if (text === undefined) continue;
    if (item["role"] === "system") systemPrompt = text;
    else if (item["role"] === "user") observationText = text;
  }
  const format = isRecord(request["response_format"])
    ? request["response_format"]
    : undefined;
  const jsonSchema = isRecord(format?.["json_schema"])
    ? format["json_schema"]
    : undefined;
  const choices = Array.isArray(response["choices"]) ? response["choices"] : [];
  const message = isRecord(choices[0]) ? choices[0]["message"] : undefined;
  const outputText = isRecord(message)
    ? messageText(message["content"])
    : undefined;
  return {
    ...(systemPrompt === undefined ? {} : { systemPrompt }),
    ...(observationText === undefined ? {} : { observationText }),
    ...(jsonSchema?.["schema"] === undefined
      ? {}
      : { schema: jsonSchema["schema"] }),
    ...(outputText === undefined ? {} : { outputText }),
    ...(response["usage"] === undefined ? {} : { usage: response["usage"] }),
    ...(asString(response["id"]) === undefined
      ? {}
      : { responseId: asString(response["id"]) }),
  };
}

/**
 * Gemini `generateContent`: `contents` in, `candidates[].content.parts` out.
 *
 * The system prompt is its own field rather than a turn, and when it has been
 * uploaded as an explicit cache it is not in the request at all -- the request
 * names the cache instead, which is what the debug view shows in its place.
 */
function geminiFields(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ExchangeFields {
  const instruction = isRecord(request["systemInstruction"])
    ? messageText(request["systemInstruction"]["parts"])
    : undefined;
  const cached = asString(request["cachedContent"]);
  const contents = Array.isArray(request["contents"])
    ? request["contents"]
    : [];
  let observationText: string | undefined;
  for (const item of contents) {
    if (!isRecord(item)) continue;
    if (item["role"] === "model") continue;
    const text = messageText(item["parts"]);
    if (text !== undefined) observationText = text;
  }
  const generationConfig = isRecord(request["generationConfig"])
    ? request["generationConfig"]
    : undefined;
  const candidates = Array.isArray(response["candidates"])
    ? response["candidates"]
    : [];
  const content = isRecord(candidates[0])
    ? candidates[0]["content"]
    : undefined;
  const outputText = isRecord(content)
    ? messageText(content["parts"])
    : undefined;
  const systemPrompt =
    instruction ??
    (cached === undefined ? undefined : `(cached system prompt: ${cached})`);
  return {
    ...(systemPrompt === undefined ? {} : { systemPrompt }),
    ...(observationText === undefined ? {} : { observationText }),
    ...(generationConfig?.["responseSchema"] === undefined
      ? {}
      : { schema: generationConfig["responseSchema"] }),
    ...(outputText === undefined ? {} : { outputText }),
    ...(response["usageMetadata"] === undefined
      ? {}
      : { usage: response["usageMetadata"] }),
    ...(asString(response["responseId"]) === undefined
      ? {}
      : { responseId: asString(response["responseId"]) }),
  };
}

/** The transport a recorded request came from, by the field only it sends. */
function exchangeFields(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ExchangeFields {
  if (Array.isArray(request["contents"]))
    return geminiFields(request, response);
  if (Array.isArray(request["messages"])) {
    return chatCompletionsFields(request, response);
  }
  return responsesFields(request, response);
}

export function parseExchange(exchange: {
  request: unknown;
  response: unknown;
}): ParsedExchange {
  const request = isRecord(exchange.request) ? exchange.request : undefined;
  const response = isRecord(exchange.response) ? exchange.response : undefined;
  if (!request || !response) return { recognised: false };

  const fields = exchangeFields(request, response);
  let observation: Record<string, unknown> | undefined;
  if (fields.observationText !== undefined) {
    try {
      const parsed: unknown = JSON.parse(fields.observationText);
      if (isRecord(parsed)) observation = parsed;
    } catch {
      observation = undefined;
    }
  }

  const decision = parseDecisionJson(fields.outputText);
  const model = asString(request["model"]);

  return {
    recognised: observation !== undefined,
    ...(model === undefined ? {} : { model }),
    ...(fields.systemPrompt === undefined
      ? {}
      : { systemPrompt: fields.systemPrompt }),
    ...(fields.schema === undefined ? {} : { responseSchema: fields.schema }),
    ...(observation === undefined ? {} : { observation }),
    ...(fields.responseId === undefined
      ? {}
      : { responseId: fields.responseId }),
    ...decision,
    ...(fields.usage === undefined ? {} : { usage: fields.usage }),
  };
}

function parseDecisionJson(outputText: string | undefined): {
  chosen?: readonly string[];
  reasoning?: string;
  plan?: readonly string[];
} {
  if (!outputText) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const chosen = Array.isArray(parsed["actionIds"])
    ? parsed["actionIds"].filter((id): id is string => typeof id === "string")
    : undefined;
  // `turnPlan` is the field the answer carries: the steps of the turn still to
  // come, which the request reads back to the seat on its own later decisions.
  // `plan` is the same thing under an older name, still read so an older trace
  // shows its plan too.
  const plan = asStepList(parsed["turnPlan"]) ?? asStepList(parsed["plan"]);
  // One `reasoning` field now. A trace from when it was a `turnPlan` beside a
  // one-sentence `rationale` still reads, joined plan-first: the plan is what
  // the sentence was written to serve.
  const reasoning =
    asString(parsed["reasoning"]) ??
    joinLegacyReasoning(
      asString(parsed["turnPlan"]),
      asString(parsed["rationale"]),
    );
  return {
    ...(chosen === undefined ? {} : { chosen }),
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(plan === undefined ? {} : { plan }),
  };
}

/** A list of plan steps, with anything that is not a step dropped. */
function asStepList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.filter(
    (step): step is string => typeof step === "string",
  );
  return steps.length > 0 ? steps : undefined;
}

function joinLegacyReasoning(
  ...parts: (string | undefined)[]
): string | undefined {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join("\n\n") : undefined;
}

/** Strips the observation fields hoisted into the header. */
function trimObservation(
  observation: Record<string, unknown>,
): Record<string, unknown> {
  const state = isRecord(observation["state"])
    ? { ...observation["state"] }
    : undefined;
  if (!state) return observation;
  delete state["cardFacts"];
  return { ...observation, state };
}

function observationCardFacts(observation: Record<string, unknown>): unknown {
  const state = isRecord(observation["state"])
    ? observation["state"]
    : undefined;
  return state?.["cardFacts"];
}

function legalAction(
  observation: Record<string, unknown> | undefined,
  actionId: string,
): Record<string, unknown> | undefined {
  const actions = isRecord(observation)
    ? observation["legalActions"]
    : undefined;
  if (!Array.isArray(actions)) return undefined;
  return actions.find(
    (action): action is Record<string, unknown> =>
      isRecord(action) && action["actionId"] === actionId,
  );
}

/**
 * Cheap labels for the mistakes that are expensive to find by reading.
 *
 * `attack-no-shortfall` and `attacked-with-blocker` between them describe the
 * decision this format was built to surface: a 6000 Blocker declared into a
 * 7000 Leader at 1 Life, which cost the defender nothing and rested the only
 * body that could have blocked on the following turn.
 */
export function decisionFlags(
  actionId: string,
  observation: Record<string, unknown> | undefined,
  laterEvents: readonly PublicEvent[],
): string[] {
  const flags: string[] = [];
  const chosen = legalAction(observation, actionId);
  const kind = asString(chosen?.["type"]);

  if (kind === "attack") {
    if (chosen?.["counterShortfall"] === 0) flags.push("attack-no-shortfall");
    if (chosen?.["attackerIsBlocker"] === true) {
      flags.push("attacked-with-blocker");
    }
    const resolved = laterEvents.find(
      (event) => event.type === "battle-resolved",
    );
    if (
      resolved?.type === "battle-resolved" &&
      resolved.outcome === "defended"
    ) {
      flags.push("attack-failed");
    }
  }

  if (kind === "pass") {
    const state = isRecord(observation) ? observation["state"] : undefined;
    const self = isRecord(state) ? state["self"] : undefined;
    const activeDon = isRecord(self) ? self["activeDon"] : undefined;
    if (typeof activeDon === "number" && activeDon > 0) {
      flags.push("passed-with-active-don");
    }
    const actions = isRecord(observation)
      ? observation["legalActions"]
      : undefined;
    if (
      Array.isArray(actions) &&
      actions.some((action) => isRecord(action) && action["type"] === "attack")
    ) {
      flags.push("passed-with-attack-available");
    }
    if (
      Array.isArray(actions) &&
      actions.some(
        (action) =>
          isRecord(action) &&
          action["type"] === "attack" &&
          action["attackerIsLeader"] === true,
      )
    ) {
      flags.push("passed-with-free-leader-attack");
    }
  }

  return flags;
}

export interface BuildDiagnosticsInput {
  trace: MatchTrace;
  llmRecords: readonly RawLlmRecord[];
  exportedAt: string;
}

/**
 * Serialises the match as JSONL: one header line, then one line per decision,
 * with any failed model call emitted in place as its own line.
 */
export function buildDiagnosticsJsonl(input: BuildDiagnosticsInput): string {
  const parsed = new Map<RawLlmRecord, ParsedExchange>();
  for (const record of input.llmRecords) {
    if (record.rawExchange) {
      parsed.set(record, parseExchange(record.rawExchange));
    }
  }

  const header: DiagnosticsHeader = {
    kind: "header",
    version: DIAGNOSTICS_VERSION,
    exportedAt: input.exportedAt,
    config: input.trace.config,
    ...(input.trace.rules ? { rules: input.trace.rules } : {}),
    events: input.trace.initialEvents,
  };
  const llmHeader: DiagnosticsLlmHeader = {};
  for (const exchange of parsed.values()) {
    if (!llmHeader.model && exchange.model) llmHeader.model = exchange.model;
    if (!llmHeader.systemPrompt && exchange.systemPrompt) {
      llmHeader.systemPrompt = exchange.systemPrompt;
    }
    if (llmHeader.responseSchema === undefined && exchange.responseSchema) {
      llmHeader.responseSchema = exchange.responseSchema;
    }
    if (llmHeader.cardFacts === undefined && exchange.observation) {
      const facts = observationCardFacts(exchange.observation);
      if (facts !== undefined) llmHeader.cardFacts = facts;
    }
  }
  if (Object.keys(llmHeader).length > 0) header.llm = llmHeader;

  // Errors carry no action ID, so they are keyed by turn and player and flushed
  // before the next decision that turn -- which is where they happened.
  const errors = input.llmRecords.filter((record) => record.error);
  const byActionId = new Map<string, RawLlmRecord>();
  for (const record of input.llmRecords) {
    if (record.actionId && !byActionId.has(record.actionId)) {
      byActionId.set(record.actionId, record);
    }
  }

  const flattened: PublicEvent[] = [...input.trace.initialEvents];
  for (const checkpoint of input.trace.checkpoints) {
    flattened.push(...checkpoint.events);
  }

  const lines: DiagnosticsLine[] = [header];
  let emittedErrors = 0;
  let eventCursor = input.trace.initialEvents.length;
  for (const checkpoint of input.trace.checkpoints) {
    while (
      emittedErrors < errors.length &&
      errors[emittedErrors]!.turn <= checkpoint.turn
    ) {
      lines.push(toErrorLine(errors[emittedErrors]!));
      emittedErrors += 1;
    }

    const record = byActionId.get(checkpoint.actionId);
    const exchange = record ? parsed.get(record) : undefined;
    const observation = exchange?.observation;
    const laterEvents = flattened.slice(eventCursor);
    eventCursor += checkpoint.events.length;
    const flags = decisionFlags(checkpoint.actionId, observation, laterEvents);

    const decision: DiagnosticsDecision = {
      kind: "decision",
      revision: checkpoint.revision,
      actionId: checkpoint.actionId,
      turn: checkpoint.turn,
      player: checkpoint.player,
      stateHash: checkpoint.stateHash,
      events: checkpoint.events,
      ...(flags.length > 0 ? { flags } : {}),
      ...(record ? { llm: toLlmCall(record, exchange) } : {}),
    };
    lines.push(decision);
  }
  for (; emittedErrors < errors.length; emittedErrors += 1) {
    lines.push(toErrorLine(errors[emittedErrors]!));
  }

  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

function toLlmCall(
  record: RawLlmRecord,
  exchange: ParsedExchange | undefined,
): DiagnosticsLlmCall {
  if (!exchange?.recognised) {
    return {
      timestamp: record.timestamp,
      ...(record.reasoning ? { reasoningSummary: record.reasoning } : {}),
      ...(record.rawExchange
        ? {
            rawRequest: record.rawExchange.request,
            rawResponse: record.rawExchange.response,
          }
        : {}),
    };
  }
  return {
    timestamp: record.timestamp,
    ...(exchange.model ? { model: exchange.model } : {}),
    ...(exchange.responseId ? { responseId: exchange.responseId } : {}),
    ...(exchange.observation
      ? { observation: trimObservation(exchange.observation) }
      : {}),
    ...(exchange.chosen ? { chosen: exchange.chosen } : {}),
    ...(exchange.reasoning ? { reasoning: exchange.reasoning } : {}),
    ...(exchange.plan ? { plan: exchange.plan } : {}),
    ...(record.reasoning ? { reasoningSummary: record.reasoning } : {}),
    ...(exchange.usage === undefined ? {} : { usage: exchange.usage }),
    ...(record.rawExchange
      ? {
          rawRequest: record.rawExchange.request,
          rawResponse: record.rawExchange.response,
        }
      : {}),
  };
}

function toErrorLine(record: RawLlmRecord): DiagnosticsLlmError {
  return {
    kind: "llm-error",
    timestamp: record.timestamp,
    turn: record.turn,
    player: record.player,
    error: record.error ?? "unknown",
    ...(record.reasoning ? { reasoningSummary: record.reasoning } : {}),
    ...(record.rawExchange
      ? {
          rawRequest: record.rawExchange.request,
          rawResponse: record.rawExchange.response,
        }
      : {}),
  };
}

/**
 * Recovers a replayable match from an exported trace.
 *
 * Accepts the v2 JSONL export, the v1 `{trace, llmCalls}` diagnostics object,
 * and a bare `MatchTrace` object. A bare save -- config and actions with no
 * event history -- is rejected, because loading a match requires a trace.
 */
export function parseExportedMatch(text: string): SavedMatch {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("UNRECOGNISED_MATCH_FILE");

  // A v2 export is identified by its header line, not by line count: a match
  // exported after a single action is one header plus one decision.
  let head: unknown;
  try {
    head = JSON.parse(lines[0]!);
  } catch {
    head = undefined;
  }
  if (!isRecord(head) || head["kind"] !== "header") {
    return legacyMatch(JSON.parse(text));
  }
  if (!isRecord(head["config"])) throw new Error("UNRECOGNISED_MATCH_FILE");
  const config = head["config"] as unknown as MatchConfig;

  const actions: string[] = [];
  for (const line of lines.slice(1)) {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed)) continue;
    if (
      parsed["kind"] === "decision" &&
      typeof parsed["actionId"] === "string"
    ) {
      actions.push(parsed["actionId"]);
    }
  }
  return {
    version: 1,
    config,
    actions,
    ...(isRecord(head["rules"])
      ? { rules: head["rules"] as unknown as RulesStamp }
      : {}),
  };
}

/**
 * Loads a replay and the model exchanges embedded in a diagnostics JSONL file.
 *
 * Version 2 traces written before raw payload retention are reconstructed from
 * their normalized observation and response fields. The caller labels those
 * records so they cannot be mistaken for exact provider payloads.
 */
export function inspectExportedMatch(text: string): InspectedMatch {
  const match = parseExportedMatch(text);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { match, llmRecords: [] };

  let header: unknown;
  try {
    header = JSON.parse(lines[0]!);
  } catch {
    return { match, llmRecords: [] };
  }
  if (!isRecord(header) || header["kind"] !== "header") {
    return { match, llmRecords: [] };
  }
  const llmHeader = isRecord(header["llm"]) ? header["llm"] : undefined;
  const llmRecords: RawLlmRecord[] = [];
  // Decision lines are written in checkpoint order, so counting them recovers
  // the action index each call belongs to -- which is what lets the history
  // show a call under the step it chose. A failed call is written before the
  // decision of its turn, so it belongs to the action still to come.
  //
  // Every decision counts, not only the ones a model chose. Counting just the
  // calls put each one under the step whose index matched its *position among
  // the calls*: in any trace with a second seat that is not a model -- a human
  // game, an LLM against a rules agent -- that is a step from much earlier in
  // the match, and it read as the model explaining somebody else's move. Only
  // a trace where every action was a model call was ever joined correctly.
  let decisions = 0;

  for (const source of lines.slice(1)) {
    const parsed: unknown = JSON.parse(source);
    if (!isRecord(parsed)) continue;
    const llm = isRecord(parsed["llm"]) ? parsed["llm"] : undefined;
    if (parsed["kind"] === "decision") decisions += 1;
    if (parsed["kind"] === "decision" && llm) {
      const timestamp = asString(llm["timestamp"]);
      const actionId = asString(parsed["actionId"]);
      const player = parsed["player"];
      const turn = parsed["turn"];
      if (
        !timestamp ||
        !actionId ||
        (player !== "p1" && player !== "p2") ||
        typeof turn !== "number"
      ) {
        continue;
      }
      const rawRequest = llm["rawRequest"];
      const rawResponse = llm["rawResponse"];
      const exact = rawRequest !== undefined && rawResponse !== undefined;
      const reasoning = asString(llm["reasoningSummary"]);
      llmRecords.push({
        timestamp,
        turn,
        player,
        actionId,
        actionCount: decisions,
        ...(reasoning ? { reasoning } : {}),
        rawExchange: exact
          ? { request: rawRequest, response: rawResponse }
          : normalizedExchange(llmHeader, llm),
        payloadSource: exact ? "exact" : "normalized",
      });
      continue;
    }
    if (parsed["kind"] === "llm-error") {
      const timestamp = asString(parsed["timestamp"]);
      const error = asString(parsed["error"]);
      const player = parsed["player"];
      const turn = parsed["turn"];
      if (
        !timestamp ||
        !error ||
        (player !== "p1" && player !== "p2") ||
        typeof turn !== "number"
      ) {
        continue;
      }
      const rawRequest = parsed["rawRequest"];
      const rawResponse = parsed["rawResponse"];
      const reasoning = asString(parsed["reasoningSummary"]);
      llmRecords.push({
        timestamp,
        turn,
        player,
        error,
        actionCount: decisions + 1,
        ...(reasoning ? { reasoning } : {}),
        ...(rawRequest !== undefined && rawResponse !== undefined
          ? { rawExchange: { request: rawRequest, response: rawResponse } }
          : {}),
        payloadSource: "exact",
      });
    }
  }

  return { match, llmRecords };
}

function normalizedExchange(
  header: Record<string, unknown> | undefined,
  call: Record<string, unknown>,
): { request: unknown; response: unknown } {
  const observation = isRecord(call["observation"])
    ? structuredClone(call["observation"])
    : call["observation"];
  if (isRecord(observation) && isRecord(observation["state"])) {
    const state = observation["state"];
    if (
      state["cardFacts"] === undefined &&
      header?.["cardFacts"] !== undefined
    ) {
      state["cardFacts"] = structuredClone(header["cardFacts"]);
    }
  }
  return {
    request: {
      note: "Normalized from a legacy trace; this is not the exact provider request body.",
      ...(header?.["model"] === undefined ? {} : { model: header["model"] }),
      ...(header?.["systemPrompt"] === undefined
        ? {}
        : { systemPrompt: header["systemPrompt"] }),
      ...(header?.["responseSchema"] === undefined
        ? {}
        : { responseSchema: header["responseSchema"] }),
      observation,
    },
    response: {
      note: "Normalized from a legacy trace; this is not the exact provider response body.",
      ...(call["responseId"] === undefined ? {} : { id: call["responseId"] }),
      ...(call["chosen"] === undefined ? {} : { chosen: call["chosen"] }),
      ...(call["reasoning"] === undefined
        ? {}
        : { reasoning: call["reasoning"] }),
      ...(call["turnPlan"] === undefined ? {} : { turnPlan: call["turnPlan"] }),
      // The plan a call stated, under the key the answer itself uses, so a
      // reloaded trace without exact payloads still shows it in the history.
      // Last of the two: a legacy `turnPlan` was one string folded into the
      // reasoning, and this is the list, so the list wins where both appear.
      ...(call["plan"] === undefined ? {} : { turnPlan: call["plan"] }),
      ...(call["rationale"] === undefined
        ? {}
        : { rationale: call["rationale"] }),
      ...(call["reasoningSummary"] === undefined
        ? {}
        : { reasoningSummary: call["reasoningSummary"] }),
      ...(call["usage"] === undefined ? {} : { usage: call["usage"] }),
    },
  };
}

function legacyMatch(value: unknown): SavedMatch {
  if (!isRecord(value)) throw new Error("UNRECOGNISED_MATCH_FILE");
  // A match is only loadable from a trace: either the v1 `{trace, ...}`
  // wrapper or a bare `MatchTrace` carrying its event history. A bare save has
  // no checkpoints, so it is rejected rather than silently treated as a trace.
  const source = isRecord(value["trace"]) ? value["trace"] : value;
  if (
    !isRecord(source["config"]) ||
    !Array.isArray(source["actions"]) ||
    (value["trace"] === undefined &&
      (!Array.isArray(source["checkpoints"]) ||
        !Array.isArray(source["initialEvents"])))
  ) {
    throw new Error("UNRECOGNISED_MATCH_FILE");
  }
  return {
    version: 1,
    config: source["config"] as unknown as MatchConfig,
    actions: source["actions"].filter(
      (action): action is string => typeof action === "string",
    ),
    ...(isRecord(source["rules"])
      ? { rules: source["rules"] as unknown as RulesStamp }
      : {}),
  };
}
