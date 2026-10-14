/**
 * The Blocker window: rest a [Blocker] to take the attack, or let it through.
 *
 * One of the per-phase offer generators `getLegalActions` dispatches to.
 *
 * Nothing here moves an attack without resting something. A card that changes
 * an attack's target -- ST36-005 Kid, OP16-080 Teach, OP14-060 Doflamingo --
 * does it from the `[On Your Opponent's Attack]` ladder, which runs before this
 * window and spends its own `[Once Per Turn]` budget.
 */
import {
  actionCardLabel,
  canBlock,
  canLeaderBlock,
  isUnblockableAttack,
  leaderInstanceId,
} from "../board.js";
import { type GameState } from "../model.js";
import {
  cards as defaultCardDatabase,
  type CardDatabase,
} from "@one-piece-sim/cards";
import { type LegalAction, type PlayerId } from "@one-piece-sim/protocol";

export function blockActions(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): LegalAction[] {
  if (isUnblockableAttack(state, db)) {
    return [
      {
        actionId: `r${state.revision}:pass-block`,
        type: "pass",
        summary: "Attack is unblockable",
      },
    ];
  }
  return [
    // A Leader printing [Blocker] (OP05-022) is offered beside the board: the
    // attack is redirected onto the Leader and the damage, if the block loses,
    // is Life damage exactly as if the Leader had been attacked.
    ...(canLeaderBlock(state, playerId, db)
      ? [
          {
            actionId: `r${state.revision}:block:${leaderInstanceId(playerId)}`,
            type: "block" as const,
            blockerInstanceId: leaderInstanceId(playerId),
            summary: `Block with ${actionCardLabel(state, playerId, leaderInstanceId(playerId), true, db)}`,
          },
        ]
      : []),
    ...state.players[playerId].board
      .filter((card) => canBlock(state, playerId, card, db))
      .map((card) => ({
        actionId: `r${state.revision}:block:${card.instanceId}`,
        type: "block" as const,
        blockerInstanceId: card.instanceId,
        summary: `Block with ${actionCardLabel(state, playerId, card.instanceId, false, db)}`,
      })),
    {
      actionId: `r${state.revision}:pass-block`,
      type: "pass",
      summary: "Do not block",
    },
  ];
}
