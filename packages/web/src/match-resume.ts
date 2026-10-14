/**
 * The match in progress, remembered across a page reload.
 *
 * A phone browser discards a background tab whenever it wants the memory, and
 * a board that lived only in the page's own variables went with it: switch to
 * another app, come back, and the match was gone. So a local match is written
 * to `localStorage` after every action, as the same `SavedMatch` a trace
 * carries -- the seed and the action list -- which is all a deterministic
 * engine needs to deal the same game and replay it to the same position.
 * The home screen offers it back as "Resume".
 *
 * One match, not a history: the key is overwritten by the next match and
 * cleared when the game reaches a result. Online matches are not kept here at
 * all -- the server holds the position, and the seat is remembered by
 * online.ts -- and neither is anything the engine has finished.
 *
 * `Storage` is a parameter rather than `window.localStorage` so the module
 * runs, and is tested, without a browser. Every access is guarded: a private
 * window, a full quota or a browser that blocks site data all throw from the
 * accessor, and none of them should take the board down with them.
 */
import type { BrowserGameController, SavedMatch } from "./controller.js";

export const MATCH_IN_PROGRESS_KEY = "open-optcg.match-in-progress";

/** The subset of `Storage` this module uses; `localStorage` satisfies it. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ResumableMatch {
  version: 1;
  save: SavedMatch;
  /** The turn the position is on, so the offer can say how far in it is. */
  turn: number;
}

/**
 * Remember this match if it is still being played, and forget it once it is
 * not: a finished game offered back as "Resume" would open on its own result.
 */
export function rememberMatch(
  storage: StorageLike,
  game: BrowserGameController,
): void {
  const active = game.activeObservation;
  if (active.phase === "finished" || active.winner !== null) {
    forgetMatch(storage);
    return;
  }
  const record: ResumableMatch = {
    version: 1,
    save: game.save(),
    turn: active.turn,
  };
  try {
    storage.setItem(MATCH_IN_PROGRESS_KEY, JSON.stringify(record));
  } catch {
    // Storage full or forbidden. The match is still on screen; it is only the
    // reload that will not find it.
  }
}

export function forgetMatch(storage: StorageLike): void {
  try {
    storage.removeItem(MATCH_IN_PROGRESS_KEY);
  } catch {
    // Nothing to remove, or nowhere to remove it from.
  }
}

/**
 * The remembered match, if there is one this code recognises.
 *
 * Anything that does not parse, or does not carry the shape written above, is
 * treated as absent rather than thrown: the alternative is a home screen that
 * cannot render because of a stale key.
 */
export function resumableMatch(storage: StorageLike): ResumableMatch | null {
  let raw: string | null;
  try {
    raw = storage.getItem(MATCH_IN_PROGRESS_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isResumableMatch(parsed)) return null;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isResumableMatch(value: unknown): value is ResumableMatch {
  if (!isRecord(value)) return false;
  if (value.version !== 1 || typeof value.turn !== "number") return false;
  const save = value.save;
  if (!isRecord(save)) return false;
  if (save.version !== 1 || !Array.isArray(save.actions)) return false;
  const config = save.config;
  return (
    isRecord(config) &&
    typeof config.p1Deck === "string" &&
    typeof config.p2Deck === "string" &&
    typeof config.seed === "string" &&
    // An attempt at a puzzle, saved by a build that had puzzle mode: its
    // actions were taken from a constructed position this build cannot set up.
    !("puzzleId" in config)
  );
}
