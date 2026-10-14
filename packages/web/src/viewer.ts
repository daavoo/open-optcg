/**
 * Which seat the board is drawn from.
 *
 * One rule, in one place, because two things read it and they must not
 * disagree: the board, which lays the viewer's own mat at the bottom and their
 * hand in front of it, and the theme, which paints the two halves of the table
 * in the two Leaders' colours. When those two answered the question
 * separately, a match with a person in both seats drew the second player's
 * board on the first player's colours.
 */
import type { PlayerId } from "@one-piece-sim/protocol";
import type { MatchConfig } from "./controller.js";

export function boardViewer(
  config: Pick<MatchConfig, "p1Controller" | "p2Controller">,
  /**
   * The fixed side a spectator is watching from, or null while somebody at
   * the table is playing. A watched game has no seat of its own -- neither a
   * replayed file's nor a simulation's -- so the side is chosen and held
   * rather than derived, and a control swaps it.
   */
  spectatorViewer: PlayerId | null,
  activePlayer: PlayerId,
): PlayerId {
  if (spectatorViewer) return spectatorViewer;
  const humans = (["p1", "p2"] as const).filter(
    (player) => config[`${player}Controller`] === "human",
  );
  // One person at the screen: their seat, whoever's turn it is, so the board
  // does not turn round under them while they wait.
  if (humans.length === 1) return humans[0]!;
  // Two people at one screen, and the board belongs to whoever is playing:
  // their mat at the bottom, their hand in front of them, their colours under
  // both. The screen changes hands at the turn, so the board does too.
  //
  // Nobody at all -- an agent-versus-agent match being watched without a
  // spectator viewer set -- takes the same answer, which is the one the board
  // had before it could be watched at all.
  return activePlayer;
}
