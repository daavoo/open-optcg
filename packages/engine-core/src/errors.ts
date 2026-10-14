/**
 * The error every rejected action raises.
 *
 * Its own module because it is the one thing in the kernel that both the
 * layers below `engine.ts` and every caller above it need, and importing it
 * from either direction must not drag a dependency along.
 */

export class EngineError extends Error {
  constructor(
    public readonly code: "STALE_ACTION" | "ILLEGAL_ACTION" | "GAME_FINISHED",
    message: string,
  ) {
    super(message);
  }
}
