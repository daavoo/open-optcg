/**
 * Reviewing a replayed game for misplays, and saving what the reviewer said.
 *
 * A trace written by the System-1 trainer (`ml/sys1/traces.py`)
 * carries, on every decision its model made, the probability the model gave
 * each option it was offered and its estimate of its own chance to win. The
 * replay shows those beside the move, and whoever is watching can flag a
 * move as a misplay and name the one it should have been. The flags download
 * as one file, self-contained: the match's config, rules stamp and whole
 * action list travel with them, so the trainer rebuilds each flagged position
 * from the file alone.
 *
 * Any decision can be flagged, not only annotated ones: a trace downloaded
 * from a match against the in-browser model carries no annotations, and its
 * misplays are just as real.
 */
import type { RulesStamp } from "@one-piece-sim/engine-core";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { MatchConfig } from "./controller.js";

export interface ScorerOption {
  actionId: string;
  /** The probability the model gave this option. */
  p: number;
}

export interface ScorerNote {
  options: readonly ScorerOption[];
  /** The model's estimate, before this move, that its seat wins. */
  winProbability: number;
  /**
   * How far that estimate fell by its next decision, or against the result
   * after its last: large where the model's own judgement says the game
   * turned.
   */
  drop: number;
}

export interface ScorerReview {
  /** The checkpoint that played, as the trainer named it. */
  checkpoint: string | null;
  seat: PlayerId | null;
  /** One entry per action in the file, null where the model did not decide. */
  notes: readonly (ScorerNote | null)[];
}

export interface ReviewFlag {
  /** Which action of the file, from 0: the position is the one before it. */
  actionIndex: number;
  player: PlayerId;
  /** The move that was made. */
  actionId: string;
  /** The move the reviewer would have made, or null when they only know it was wrong. */
  preferred: string | null;
  note: string;
}

export const FEEDBACK_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function note(value: unknown): ScorerNote | null {
  if (!isRecord(value) || !Array.isArray(value["options"])) return null;
  const options = value["options"].flatMap((option: unknown) =>
    isRecord(option) &&
    typeof option["actionId"] === "string" &&
    typeof option["p"] === "number"
      ? [{ actionId: option["actionId"], p: option["p"] }]
      : [],
  );
  const winProbability = value["winProbability"];
  const drop = value["drop"];
  if (typeof winProbability !== "number" || typeof drop !== "number")
    return null;
  return { options, winProbability, drop };
}

/**
 * The model's annotations in an exported trace, aligned with its actions;
 * null for a trace with none. Decision lines are counted exactly as
 * `parseExportedMatch` counts them, so entry `i` belongs to action `i`.
 */
export function parseScorerReview(text: string): ScorerReview | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let header: unknown;
  try {
    header = JSON.parse(lines[0] ?? "");
  } catch {
    return null;
  }
  if (!isRecord(header) || header["kind"] !== "header") return null;
  const notes: (ScorerNote | null)[] = [];
  let any = false;
  for (const line of lines.slice(1)) {
    const parsed: unknown = JSON.parse(line);
    if (
      !isRecord(parsed) ||
      parsed["kind"] !== "decision" ||
      typeof parsed["actionId"] !== "string"
    )
      continue;
    const entry = note(parsed["scorer"]);
    any ||= entry !== null;
    notes.push(entry);
  }
  if (!any) return null;
  const about = isRecord(header["scorer"]) ? header["scorer"] : {};
  const seat = about["seat"];
  return {
    checkpoint:
      typeof about["checkpoint"] === "string" ? about["checkpoint"] : null,
    seat: seat === "p1" || seat === "p2" ? seat : null,
    notes,
  };
}

/** The flags as a JSONL file: one header line, then one line per flag. */
export function feedbackJsonl(input: {
  config: MatchConfig;
  rules?: RulesStamp;
  actions: readonly string[];
  checkpoint: string | null;
  flags: readonly ReviewFlag[];
  exportedAt: string;
}): string {
  const header = {
    kind: "feedback-header",
    version: FEEDBACK_VERSION,
    exportedAt: input.exportedAt,
    config: input.config,
    ...(input.rules ? { rules: input.rules } : {}),
    checkpoint: input.checkpoint,
    actions: input.actions,
  };
  const flags = [...input.flags]
    .sort((a, b) => a.actionIndex - b.actionIndex)
    .map((flag) => ({ kind: "flag", ...flag }));
  return `${[header, ...flags].map((line) => JSON.stringify(line)).join("\n")}\n`;
}

/** Adds a flag, or replaces the one already on the same action. */
export function withFlag(
  flags: readonly ReviewFlag[],
  flag: ReviewFlag,
): ReviewFlag[] {
  return [
    ...flags.filter((existing) => existing.actionIndex !== flag.actionIndex),
    flag,
  ];
}
