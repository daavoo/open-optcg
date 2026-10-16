/**
 * Which offered attacks are doomed, by a cheap rule and by the engine itself.
 *
 * A Character attack that cannot land and triggers nothing is strictly worse
 * than not attacking: the defender spends nothing, and the attacker ends up
 * rested -- unable to block, and a legal target itself. The cheap rule, which a
 * seat can apply from its observation alone, is:
 *
 *   not the Leader  (a Leader loses nothing by declaring; see `attackerIsLeader`)
 *   `counterShortfall === 0`  (fails against the board as it stands)
 *   the attacker's derived rules print no `[When Attacking]` clause
 *
 * The rule cannot see every source of a declaration trigger -- the engine keeps
 * several tables of them, and some cards run imperative code -- so this also
 * asks the engine: it declares the attack on a copy of the state and reports
 * whether anything happened beyond the declaration itself. The two answers side
 * by side say whether the rule would ever prune an attack that does something.
 */
import {
  applyAction,
  observe,
  toGameAction,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { isDoomedAttack } from "../../packages/agents/src/scorer/dominance.js";

export interface AttackAuditEntry {
  /** Index into the legal actions. */
  index: number;
  /** The cheap rule says doomed. */
  rule: boolean;
  /** The engine says something fired on declaration, or the attack now lands. */
  fired: boolean;
  events: string[];
  /** Why `fired`, for inspecting the rule's false positives. */
  reason?: string;
  attacker?: string;
}

const PLAIN = new Set([
  "attack-declared",
  "phase-changed",
  "battle-started",
  "attacker-rested",
]);

export function attackAudit(
  state: GameState,
  observation: GameObservation,
  /** The actions offered to the seat, whose indices the entries use. */
  offered: readonly LegalAction[] = observation.legalActions,
): AttackAuditEntry[] {
  const out: AttackAuditEntry[] = [];
  offered.forEach((action, index) => {
    if (action.type !== "attack" || action.attackerIsLeader) return;
    if ((action.counterShortfall ?? 1) !== 0) return;
    const attacker = observation.self.board.find(
      (card) => card.instanceId === action.attackerInstanceId,
    );
    const rule = isDoomedAttack(action, observation);
    let fired: boolean;
    let events: string[] = [];
    let reason: string | undefined;
    try {
      const result = applyAction(state, toGameAction(action, state.revision));
      events = result.events.map((event) => event.type);
      const battle = observe(result.state, state.activePlayer).activeBattle;
      const pendingForAttacker =
        result.state.activePlayer === state.activePlayer &&
        result.state.phase !== "main";
      const reasons = [
        events.some((type) => !PLAIN.has(type)) ? "events" : "",
        pendingForAttacker ? `pending:${result.state.phase}` : "",
        battle != null && battle.counterShortfall > 0 ? "now-lands" : "",
      ].filter(Boolean);
      fired = reasons.length > 0;
      if (fired) reason = reasons.join(",");
    } catch {
      // An attack the engine refuses to declare is not one the rule may prune.
      fired = true;
      reason = "threw";
    }
    out.push({
      index,
      rule,
      fired,
      events,
      ...(reason ? { reason } : {}),
      ...(attacker ? { attacker: attacker.cardNumber } : {}),
    });
  });
  return out;
}
