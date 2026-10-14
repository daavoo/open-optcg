/**
 * Replaying a trace as a spectator: the board plays the file's actions back
 * one at a time, both hands face up, and the person watching can pause it,
 * jump about in it, or sit down at a seat and pilot the rest.
 *
 * The match itself is an ordinary `BrowserGameController` holding the actions
 * applied so far; the file's whole action list lives beside it, so how far the
 * replay has got is simply how many actions the controller holds. These
 * helpers are the pure part: where the turns start, and what a take-over
 * changes in the config.
 */
import type { PlayerId } from "@one-piece-sim/protocol";
import type { MatchConfig, TraceCheckpoint } from "./controller.js";
import type { ReviewFlag, ScorerReview } from "./scorer-review.js";

/** Where a turn begins, as the number of actions applied before its first. */
export interface ReplayTurnStart {
  turn: number;
  player: PlayerId;
  actionCount: number;
}

/**
 * The state the board keeps while a trace is being replayed; null while a
 * match is being played.
 */
export interface ReplayState {
  /** Every action in the file, in order. */
  actions: readonly string[];
  /** Where each turn starts, for jumping straight to one. */
  turns: readonly ReplayTurnStart[];
  /** Whether the replay is advancing on its own. */
  playing: boolean;
  /**
   * The seat drawn at the bottom of the table, and the one a take-over sits
   * at. Fixed rather than following the active player, so the mat does not
   * swap sides every turn.
   */
  viewer: PlayerId;
  /** The model's annotations, when the trace carries them. See `scorer-review.ts`. */
  review: ScorerReview | null;
  /** The moves the person watching has flagged as misplays. */
  flags: ReviewFlag[];
  /**
   * Whether the far hand is drawn face down, as the seat to move saw it: a
   * move judged with both hands in view is judged on cards its player could
   * not see.
   */
  hideOtherHand: boolean;
  /** The action whose flag dialog is open, by index into `actions`. */
  flagging: number | null;
}

/** Between one action landing and the next while the replay plays itself. */
export const REPLAY_PACE_MS = 700;

/**
 * The first action of every turn, from a full replay's checkpoints.
 *
 * Each checkpoint carries the turn and player as they were when its action was
 * chosen, so a turn begins at the first checkpoint that names it. The setup
 * decisions (mulligans) are made on turn 1 before it is anyone's turn to play
 * and are folded into turn 1's entry rather than listed as a turn of their own.
 */
export function replayTurnStarts(
  checkpoints: readonly Pick<TraceCheckpoint, "turn" | "player">[],
): ReplayTurnStart[] {
  const starts: ReplayTurnStart[] = [];
  checkpoints.forEach((checkpoint, index) => {
    if (starts.at(-1)?.turn === checkpoint.turn) return;
    starts.push({
      turn: checkpoint.turn,
      player: checkpoint.player,
      actionCount: index,
    });
  });
  return starts;
}

/**
 * The seat the replay is watched from: the file's human seat when it has
 * exactly one, since that is the side the trace was recorded from; else its
 * one System-1 seat, the side a trace is reviewed from; and p1 otherwise --
 * an agent-versus-agent trace has no side of its own.
 */
export function replayViewer(config: MatchConfig): PlayerId {
  for (const kind of ["human", "scorer"] as const) {
    const seats = (["p1", "p2"] as const).filter(
      (player) => config[`${player}Controller`] === kind,
    );
    if (seats.length === 1) return seats[0]!;
  }
  return "p1";
}

/**
 * The config of the match a spectator takes over at `seat`.
 *
 * That seat becomes the human one. The other keeps its controller, except that
 * a seat the file recorded as a person over the network cannot be reconnected
 * from a replay, so a rules agent takes it -- and a second human seat, which
 * this page cannot pilot two of, is handed to a rules agent too.
 */
export function takeoverConfig(
  config: MatchConfig,
  seat: PlayerId,
): MatchConfig {
  const other: PlayerId = seat === "p1" ? "p2" : "p1";
  const otherController = config[`${other}Controller`];
  return {
    ...config,
    [`${seat}Controller`]: "human",
    [`${other}Controller`]:
      otherController === "online" || otherController === "human"
        ? "rules"
        : otherController,
  };
}
