import type { CardDatabase } from "@one-piece-sim/cards";
import type {
  LegalAction,
  PlayerId,
  PublicEvent,
} from "@one-piece-sim/protocol";
import type { GameAction, GameState } from "../model.js";

/**
 * What every action handler is given.
 *
 * `state` is already a clone of the caller's state and is mutated in place;
 * `events` is the public log for this transition, which `applyAction` appends to
 * the state afterwards. `offered` is the engine's own legal action for this
 * `actionId` -- handlers read the resolved ids and typed descriptors off it
 * rather than re-deriving them, which is what keeps legality and application
 * from disagreeing.
 */
export interface ActionContext<
  T extends GameAction["type"] = GameAction["type"],
> {
  state: GameState;
  events: PublicEvent[];
  /** `state.activePlayer` at the start of the transition: whoever is acting. */
  activePlayer: PlayerId;
  action: Extract<GameAction, { type: T }>;
  offered: Extract<LegalAction, { type: T }>;
  db: CardDatabase;
}

export type ActionHandler<T extends GameAction["type"]> = (
  ctx: ActionContext<T>,
) => void;

/**
 * The dispatch table's type.
 *
 * Mapped over `GameAction["type"]`, so adding a member to the union without
 * writing its handler is a compile error. The `if/else if` chain this replaced
 * could not fail that way: an unhandled action type fell through the chain, did
 * nothing, and still bumped the revision.
 */
export type ActionHandlers = {
  [K in GameAction["type"]]: ActionHandler<K>;
};
