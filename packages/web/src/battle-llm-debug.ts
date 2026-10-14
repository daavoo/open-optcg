/**
 * What a model call says, for the match history to show under the step it chose.
 *
 * A call's full request and response are large -- a 400KB observation, the whole
 * conversation replayed -- and the question a reader brings to a step is "why
 * that move?". So this reads out the parts that answer it and leaves the bodies
 * to the exported trace, which is the artefact for a bug report anyway.
 *
 * Pure: a record in, a value out, so it can be unit-tested without a match.
 */
import { parseExchange } from "./diagnostics.js";
import type { LlmDebugRecord } from "./llm-settings.js";

/** The part of a call worth reading beside the move it produced. */
export interface LlmCallSummary {
  turn: number;
  player: string;
  actionId?: string;
  error?: string;
  /** What the model wrote in its answer before naming the action. */
  reasoning?: string;
  /**
   * The turn plan the answer carried: the steps of that turn still to come.
   *
   * Worth reading beside the sentence rather than instead of it, because the
   * two answer different questions -- the plan is the turn the seat believes it
   * is playing, and the reasoning is why this step of it is the one being taken
   * now. A turn that went wrong usually shows it as a plan that changed between
   * consecutive steps with nothing on the board to explain the change, which is
   * only visible if both are in the history.
   */
  plan?: readonly string[];
  /** The provider's own thinking summary, when it returned one. */
  reasoningSummary?: string;
}

/** What a call says, without its payloads. */
export function callSummary(record: LlmDebugRecord): LlmCallSummary {
  const parsed = record.rawExchange
    ? parseExchange(record.rawExchange)
    : undefined;
  // A legacy trace's normalized response carries the fields at its top level,
  // where the provider-shaped parse does not look for them. `rationale` and
  // `turnPlan` are what the one reasoning field was split across before; a
  // trace exported then still reads, with the plan ahead of the sentence it
  // was written to support.
  const response = debugObject(record.rawExchange?.response);
  const written =
    parsed?.reasoning ??
    debugString(response?.["reasoning"]) ??
    joinLegacy(
      debugString(response?.["turnPlan"]),
      debugString(response?.["rationale"]),
    );
  // A trace recorded while the two shared one field carries the answer's own
  // reasoning in the summary slot. Showing it once is what it always was.
  // `written` comes from the answer's `reasoning` field, which every call
  // carries now; the summary slot is left for a run that asked for one.
  const summary = record.reasoning === written ? undefined : record.reasoning;
  // The provider-shaped parse first; the top level of the response covers a
  // normalized trace, where the answer's fields sit where the parse does not
  // look. A legacy `turnPlan` was one string, and `joinLegacy` above has
  // already folded that into the reasoning, so only a list reaches here.
  const plan = parsed?.plan ?? debugStepList(response?.["turnPlan"]);
  return {
    turn: record.turn,
    player: record.player,
    ...(record.actionId ? { actionId: record.actionId } : {}),
    ...(record.error ? { error: record.error } : {}),
    ...(plan ? { plan } : {}),
    ...(written ? { reasoning: written } : {}),
    ...(summary ? { reasoningSummary: summary } : {}),
  };
}

function joinLegacy(...parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join("\n\n") : undefined;
}

/**
 * Whether any of these calls carries a reconstructed payload rather than the
 * provider's own body. The history says so once, in its header: what it read the
 * rationale out of is not what the provider actually returned.
 */
export function hasNormalizedPayloads(
  records: readonly LlmDebugRecord[],
): boolean {
  return records.some((record) => record.payloadSource === "normalized");
}

function debugObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function debugString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function debugStepList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.filter(
    (step): step is string => typeof step === "string",
  );
  return steps.length > 0 ? steps : undefined;
}
