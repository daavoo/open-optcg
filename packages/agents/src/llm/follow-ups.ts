/**
 * The effect choices an action drags behind it, offered with the action itself.
 *
 * A `play-card`, an `activate-main` or an `attack` frequently suspends into the
 * seat's own `resolve-effect` decisions: the On Play that names a target, the
 * When Attacking that asks for a cost, the mode a card offers before it acts.
 * Each of those cost a separate model call, and they are the same thought as
 * the action that caused them -- nobody decides to play a removal Character
 * without knowing what they mean to remove.
 *
 * These are not guesses about what the engine might offer. `simulateLine`
 * applies the very action being considered to a copy of the state, so the
 * follow-up it reports is the one the engine will produce, down to the action
 * IDs: they embed a revision, and the simulated revision advances exactly as
 * the real one will. `test/llm-follow-ups.test.ts` holds that to be true rather
 * than trusting the argument.
 *
 * Two things bound what is offered:
 *
 * 1. **Nothing that reveals what the action was going to teach you.** An option
 *    naming a card in the deck, in Life, or in the revealed zone exists only
 *    because the effect looked there. Folding that choice into the parent means
 *    either printing the search result before the card is played -- lookahead
 *    the seat has not paid for -- or asking for a blind commitment. Those
 *    chains are dropped whole and cost their calls.
 * 2. **A budget.** Deeper than one step the option sets multiply, and a prompt
 *    that lists every reachable *sequence* is far larger than one that lists
 *    every reachable *choice*: one recorded attack expands to 109 sequences and
 *    9KB, or to 13 choices and 238 bytes. Steps are offered as choices, and the
 *    union is capped per action and per request.
 */
import type {
  GameObservation,
  LegalAction,
  PlayerId,
} from "@one-piece-sim/protocol";
import type { Plan, SimulatedLine } from "@one-piece-sim/engine-core";

/** One option the model may name for a follow-up step. */
export interface FollowUpOption {
  actionId: string;
  summary: string;
}

/** One decision that follows the parent action, as offered to the model. */
export interface FollowUpStep {
  /** 1-based position in the sequence after the parent action. */
  step: number;
  /** What is being decided, e.g. `"[On Play] of OP17-054"`. */
  choose: string;
  /**
   * True when the options depend on what was picked at an earlier step.
   *
   * Two thirds of the deeper steps offer the same options whichever sibling
   * preceded them; the rest do not -- trashing a card changes what the rest of
   * the hand can offer. For those the list is the union, so it can name an
   * option that will not be available in the branch actually taken. The model
   * is told, and a step that misses simply costs the call it would have cost.
   */
  conditional?: true;
  options: FollowUpOption[];
}

/** The follow-up chain of one legal action. */
export interface FollowUpOffer {
  actionId: string;
  then: FollowUpStep[];
}

export interface FollowUpLimits {
  /** Options one action may add to the request. */
  perAction: number;
  /** Options every offer together may add to the request. */
  perRequest: number;
  /** Steps deep the chain is followed. */
  maxDepth: number;
  /** Simulated nodes walked per action, before the offer is abandoned. */
  maxNodes: number;
}

export const defaultFollowUpLimits: FollowUpLimits = {
  perAction: 16,
  perRequest: 24,
  maxDepth: 4,
  maxNodes: 256,
};

/**
 * Zones an option must not name for the chain to be foldable.
 *
 * `deck`, `revealed` and `life` are the zones an effect looks into. What it
 * finds there is the information the play was made to buy, and it does not
 * exist until the play happens.
 */
const CONCEALED_ZONES = new Set(["deck", "revealed", "life"]);

/** Action types whose follow-up chain is worth simulating. */
const EXPANDABLE = new Set(["play-card", "activate-main", "attack"]);

function isOwnEffectNode(line: SimulatedLine, viewer: PlayerId): boolean {
  const legal = line.observation.legalActions;
  return (
    line.decidingPlayer === viewer &&
    legal.length > 0 &&
    legal.every((action) => action.type === "resolve-effect")
  );
}

/**
 * Steps past decisions that cost nothing to reach.
 *
 * A node with one legal action is taken by the caller without asking anyone --
 * `LlmAgent.chooseAction` returns it before it would spend a call -- so it is
 * not a step the model needs to name, and leaving it in the sequence would put
 * an ID in the plan that the runner has already consumed.
 */
function settle(line: SimulatedLine, viewer: PlayerId): SimulatedLine {
  let node = line;
  for (let guard = 0; guard < 16; guard += 1) {
    if (!isOwnEffectNode(node, viewer)) return node;
    const legal = node.observation.legalActions;
    if (legal.length !== 1) return node;
    const next = node.advance(legal[0]!.actionId);
    if (!next) return node;
    node = next;
  }
  return node;
}

function optionsOf(line: SimulatedLine): LegalAction[] {
  return line.observation.legalActions;
}

function namesConcealedZone(action: LegalAction): boolean {
  if (action.type !== "resolve-effect") return false;
  const { option } = action;
  return option.kind === "card" && CONCEALED_ZONES.has(option.zone);
}

/**
 * Whether the line has privately looked at a card since the parent position.
 *
 * The concealed-zone test above only sees a look through the options that name
 * what was found. A decision taken *after* a look can name nothing of it:
 * OP17-050 Streusen looks at two cards and then asks only which end of the
 * deck both go to. Folding that into the parent is the blind commitment rule 1
 * refuses, so a private `card-revealed` for the viewer ends the chain too.
 */
function looksPrivately(
  node: SimulatedLine,
  viewer: PlayerId,
  eventsBefore: number,
): boolean {
  return node.observation.publicEvents
    .slice(eventsBefore)
    .some(
      (event) => event.type === "card-revealed" && event.visibleTo === viewer,
    );
}

function describeStep(action: LegalAction): string {
  return action.type === "resolve-effect"
    ? `${action.effectKind} of ${action.sourceCardNumber}`
    : "effect";
}

interface Collected {
  /** Options per depth, deduplicated by action ID. */
  steps: Map<string, FollowUpOption>[];
  /** Per depth, the distinct option sets seen across sibling branches. */
  shapes: Set<string>[];
  labels: string[];
}

/**
 * Walks one action's follow-up chain, collecting the options at each depth.
 *
 * Returns undefined when the chain must not be offered: an option naming a
 * concealed zone, or a tree too large to walk. Identical subtrees are walked
 * once -- two thirds of the deeper nodes repeat -- which is what keeps a chain
 * that reaches hundreds of sequences down to a couple of dozen nodes.
 */
function collect(
  line: SimulatedLine,
  viewer: PlayerId,
  limits: FollowUpLimits,
  eventsBefore: number,
): Collected | undefined {
  const collected: Collected = { steps: [], shapes: [], labels: [] };
  const seen = new Set<string>();
  let walked = 0;

  const visit = (node: SimulatedLine, depth: number): boolean => {
    const settled = settle(node, viewer);
    if (!isOwnEffectNode(settled, viewer) || depth >= limits.maxDepth) {
      return true;
    }
    if (looksPrivately(settled, viewer, eventsBefore)) return false;
    walked += 1;
    if (walked > limits.maxNodes) return false;
    const legal = optionsOf(settled);
    const signature = `${depth}:${legal.map((action) => action.actionId).join(",")}`;
    (collected.shapes[depth] ??= new Set()).add(signature);
    if (seen.has(signature)) return true;
    seen.add(signature);
    const step = (collected.steps[depth] ??= new Map());
    collected.labels[depth] ??= describeStep(legal[0]!);
    for (const action of legal) {
      if (namesConcealedZone(action)) return false;
      step.set(action.actionId, {
        actionId: action.actionId,
        summary: action.summary,
      });
    }
    for (const action of legal) {
      const next = settled.advance(action.actionId);
      if (next && !visit(next, depth + 1)) return false;
    }
    return true;
  };

  return visit(line, 0) && collected.steps.length > 0 ? collected : undefined;
}

/**
 * Turns a collected chain into the steps offered, trimmed to the budget.
 *
 * Depth is dropped from the bottom: the first step is the one the parent action
 * was chosen for, and a chain whose first step alone will not fit is not worth
 * offering at all.
 */
function toSteps(
  collected: Collected,
  perAction: number,
): FollowUpStep[] | undefined {
  const steps: FollowUpStep[] = [];
  let total = 0;
  // Depths are filled from 0 upward -- a node at depth d is only reached
  // through d-1 -- so the list has no holes to skip.
  for (const [depth, options] of collected.steps.entries()) {
    if (total + options.size > perAction) break;
    total += options.size;
    steps.push({
      step: depth + 1,
      choose: collected.labels[depth] ?? "effect",
      ...((collected.shapes[depth]?.size ?? 1) > 1
        ? { conditional: true as const }
        : {}),
      options: [...options.values()],
    });
  }
  return steps.length > 0 ? steps : undefined;
}

/**
 * The follow-up chains worth offering with this observation's legal actions.
 *
 * Silent when no planner is available: the offer is an optimisation, and an
 * agent without lookahead simply answers one action at a time as before.
 */
export function expandFollowUps(
  observation: GameObservation,
  plan: Plan,
  limits: FollowUpLimits = defaultFollowUpLimits,
): FollowUpOffer[] {
  if (observation.legalActions.length < 2) return [];
  const viewer = observation.viewer;
  const offers: FollowUpOffer[] = [];
  let budget = limits.perRequest;
  for (const action of observation.legalActions) {
    if (budget <= 0) break;
    if (!EXPANDABLE.has(action.type)) continue;
    const line = plan(action.actionId);
    if (!line) continue;
    const collected = collect(
      line,
      viewer,
      limits,
      observation.publicEvents.length,
    );
    if (!collected) continue;
    const steps = toSteps(collected, Math.min(limits.perAction, budget));
    if (!steps) continue;
    budget -= steps.reduce((total, step) => total + step.options.length, 0);
    offers.push({ actionId: action.actionId, then: steps });
  }
  return offers;
}

/**
 * Whether the offer really put this ID in front of the model at this step.
 *
 * `collect` merges the options of every branch reachable at one depth into a
 * single step and marks the step `conditional`, so a step's option list is a
 * union: an ID can be genuinely offered there and still be unreachable once the
 * earlier picks have chosen a branch. That is the difference between a model
 * that misread the chain and a model that read exactly what it was sent.
 */
function wasOffered(
  offered: FollowUpOffer | undefined,
  index: number,
  actionId: string,
): boolean {
  return (
    offered?.then[index]?.options.some(
      (option) => option.actionId === actionId,
    ) ?? false
  );
}

/**
 * Validates a returned sequence by walking it, and returns the steps to replay.
 *
 * The walk is the check: every ID after the first has to be legal at the node
 * the ones before it produce, so a sequence that misreads the chain is rejected
 * with the options it should have chosen from rather than replayed into an
 * action nobody asked for.
 *
 * ## Truncating rather than rejecting, when the offer is what misled the model
 *
 * A `conditional` step lists the options of every branch, and the instructions
 * promise what happens when the branch taken does not contain the one named:
 * "the sequence stops there and the decision comes back to you". That was
 * implemented in the prose and not here -- the walk threw, and because the offer
 * is deterministic the correction round re-offered the same union and the model
 * named the same ID again, so the second failure ended the game. Two runs of
 * `traces/myst31-xebec`'s matchup died that way on the same board, one of them
 * on `main` with none of this branch's changes, at
 * `LLM_INVALID_FOLLOW_UP: r45:effect:apply is not offered at step 3` where the
 * branch actually offered `r46:effect:apply`.
 *
 * So an ID the offer listed for that step truncates the sequence: the leading
 * action is taken, and every step from there is asked as an ordinary decision,
 * which is the same path a shorter answer would already have taken. An ID the
 * offer never listed is still rejected with a correction round -- that one is a
 * hallucination, and telling the model so is worth a round.
 */
export function followUpSequence(
  observation: GameObservation,
  plan: Plan,
  action: LegalAction,
  followUpIds: readonly string[],
  offered?: FollowUpOffer,
): string[] {
  const viewer = observation.viewer;
  let line = plan(action.actionId);
  if (!line) {
    throw new Error(
      `LLM_INVALID_ACTION_RESPONSE: ${action.actionId} has no follow-up decision, so it must be the only action ID.`,
    );
  }
  const steps: string[] = [];
  for (const [index, actionId] of followUpIds.entries()) {
    line = settle(line, viewer);
    if (!isOwnEffectNode(line, viewer)) {
      if (wasOffered(offered, index, actionId)) return steps;
      throw new Error(
        `LLM_INVALID_ACTION_RESPONSE: the chain after ${action.actionId} ends before ${actionId}; it has ${steps.length} step(s) to answer, not ${followUpIds.length}.`,
      );
    }
    const legal = optionsOf(line);
    const chosen = legal.find((option) => option.actionId === actionId);
    if (!chosen) {
      if (wasOffered(offered, index, actionId)) return steps;
      throw new Error(
        `LLM_INVALID_FOLLOW_UP: ${actionId} is not offered at step ${steps.length + 1} of ${action.actionId}. Choose from ${JSON.stringify(legal.map((option) => option.actionId))}.`,
      );
    }
    steps.push(chosen.actionId);
    line = line.advance(chosen.actionId)!;
  }
  return steps;
}
