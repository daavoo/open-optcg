/**
 * Watching two agents play: a match neither seat is a person's, run in front
 * of whoever asked for it at a pace they set.
 *
 * The match itself is an ordinary local match -- the board already pilots any
 * seat whose controller is not `human`, so nothing here plays the game. What a
 * simulation adds is the spectator's half of it: a fixed side to watch from,
 * both hands face up, and a beat between one agent's action and the next being
 * asked for, so the board can be read instead of flickering.
 *
 * That is the same half a trace replay needs (`replay.ts`), and the board
 * treats the two the same wherever the reason is "nobody here is playing".
 * They part on what advances the board: a replay reads its next action out of
 * a file and can therefore go backwards in it, while a simulation asks an
 * agent for one and can only go forwards.
 */
import type { PlayerId } from "@one-piece-sim/protocol";
import type { MatchConfig } from "./controller.js";

/**
 * The state the board keeps while a simulated match is being watched; null
 * whenever a seat at the table is a person's.
 */
export interface SimulationState {
  /**
   * The seat drawn at the bottom of the table, and the one a take-over sits
   * at. Fixed rather than following the active player, so the mat does not
   * swap sides every turn.
   */
  viewer: PlayerId;
  /** Whether the agents are being asked for their next action on their own. */
  playing: boolean;
  /** Between one action landing and the next being asked for. */
  paceMs: number;
}

/**
 * The beats a watcher can pick between, slowest first.
 *
 * Measured from the action landing rather than from the request, so these are
 * reading time and not the agent's thinking time -- a slow seat is slower than
 * its pace says, and no pace makes it faster.
 *
 * Two of them, and neither is "no wait at all": the board is repainted by
 * every action, so a beat short enough to repaint continuously is one the
 * controls cannot be used during and the cards cannot be read during. A game
 * to be got to the end of is a game to leave running, not one to speed past
 * the point of watching.
 */
export const SIMULATION_PACES: readonly { label: string; ms: number }[] = [
  { label: "1x", ms: 900 },
  { label: "2x", ms: 380 },
];

/** The beat a simulation starts at: slow enough to follow a turn. */
export const DEFAULT_SIMULATION_PACE_MS = SIMULATION_PACES[0]!.ms;

/**
 * Whether this match is one nobody at the table is playing.
 *
 * Read off the config rather than set by the lobby, so every route into a
 * match -- the lobby, a resumed match, a trace taken over -- gets the same
 * answer from the same place.
 */
export function isSimulation(config: MatchConfig): boolean {
  return (["p1", "p2"] as const).every((player) => {
    const controller = config[`${player}Controller`];
    return controller !== "human";
  });
}

/** The state a simulation of `config` begins in: p1's side, playing, slow. */
export function beginSimulation(config: MatchConfig): SimulationState | null {
  if (!isSimulation(config)) return null;
  return { viewer: "p1", playing: true, paceMs: DEFAULT_SIMULATION_PACE_MS };
}

/** The next beat in the ring, so one control cycles all of them. */
export function nextPaceMs(paceMs: number): number {
  const index = SIMULATION_PACES.findIndex((pace) => pace.ms === paceMs);
  return SIMULATION_PACES[(index + 1) % SIMULATION_PACES.length]!.ms;
}

/** What to print on the pace control for the beat it is set to. */
export function paceLabel(paceMs: number): string {
  return (
    SIMULATION_PACES.find((pace) => pace.ms === paceMs)?.label ??
    SIMULATION_PACES[0]!.label
  );
}
