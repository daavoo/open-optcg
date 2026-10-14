/**
 * One module per action type, and the table `applyAction` dispatches through.
 *
 * `applyAction` is now preconditions (finished / stale revision / is the action
 * actually offered) plus one call into this table, and each action's transition
 * is a named function that can be read -- and tested -- on its own.
 */
import { applyActivateCounterEvent } from "./activate-counter-event.js";
import { applyActivateMain } from "./activate-main.js";
import { applyAttachDon } from "./attach-don.js";
import { applyAttack } from "./attack.js";
import { applyBlock } from "./block.js";
import { applyCounter } from "./counter.js";
import { applyMulliganDecision } from "./mulligan-decision.js";
import { applyPass } from "./pass.js";
import { applyPlayCard } from "./play-card.js";
import { applyResolveEffect } from "./resolve-effect.js";
import { applyResolveTrigger } from "./resolve-trigger.js";
import type { ActionHandlers } from "./context.js";

export type {
  ActionContext,
  ActionHandler,
  ActionHandlers,
} from "./context.js";

export const ACTION_HANDLERS: ActionHandlers = {
  "mulligan-decision": applyMulliganDecision,
  "play-card": applyPlayCard,
  "resolve-effect": applyResolveEffect,
  "attach-don": applyAttachDon,
  "activate-main": applyActivateMain,
  attack: applyAttack,
  block: applyBlock,
  counter: applyCounter,
  "activate-counter-event": applyActivateCounterEvent,
  "resolve-trigger": applyResolveTrigger,
  pass: applyPass,
};
