import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { chooseGenericRules, type PolicyDecision } from "./generic-policy.js";
import { patternOf } from "./strategy/patterns.js";

/**
 * Broad play pattern of a deck, so a matchup module can say "against aggro"
 * once instead of naming every Leader that happens to be aggressive.
 */
export type Archetype = "aggro" | "midrange" | "control" | "unknown";

/**
 * The broad play pattern of a Leader.
 *
 * The table moved to `strategy/patterns.ts`, which is where the strategy
 * profiles that say the same thing can also read it. See that file for why the
 * table is the authority and the profiles are checked against it.
 */
export function archetypeOf(leaderCardNumber: string): Archetype {
  return patternOf(leaderCardNumber);
}

/** Everything a module needs to judge a decision, derived once per turn. */
export interface PolicyContext {
  observation: GameObservation;
  actions: readonly LegalAction[];
  selfLeader: string;
  opponentLeader: string;
  selfArchetype: Archetype;
  opponentArchetype: Archetype;
}

export function policyContext(observation: GameObservation): PolicyContext {
  const selfLeader = observation.self.leader.cardNumber;
  const opponentLeader = observation.opponent.leader.cardNumber;
  return {
    observation,
    actions: observation.legalActions,
    selfLeader,
    opponentLeader,
    selfArchetype: archetypeOf(selfLeader),
    opponentArchetype: archetypeOf(opponentLeader),
  };
}

/** A score contribution, optionally carrying the reason it was applied. */
export type ScoreContribution =
  number | { score: number; reason: string } | undefined;

/**
 * One composable unit of deck knowledge.
 *
 * A module contributes in three ways, in increasing order of bluntness:
 *
 *  - `rank` / `rankAmong` express a preference *within one kind of action* and
 *             let the deck policy keep the decision. This is the tier to reach
 *             for first; `heuristics.ts` compiles `prefer`/`avoid` to it.
 *  - `veto`   removes an action outright, with a reason.
 *  - `decide` takes the decision over completely. Kept because whole-turn
 *             policies exist and are hard to express as scores, but it defeats
 *             composition, so prefer `rank` for new work.
 *
 * There is deliberately no additive scoring tier that competes across action
 * types. Every deck in the registry is a `decide` module that answers nearly
 * every decision point, so a scoring module could only take effect by claiming
 * the whole decision -- at which point it has to score *every* action type,
 * including the ones it knows nothing about, and an attack it never priced
 * loses to a DON!! attachment it did. `analysis/architecture-refactor-2026-08-07.md`
 * records that failure. Every tier here is subtractive for that reason: a
 * module narrows what the chooser sees and can never be silently outvoted on
 * a type it never looked at. `mustAct` in `heuristics.ts` is the one additive
 * rule, and it is a veto on `pass`.
 *
 * ## Why `rank` exists
 *
 * `veto` is *subtractive*: it narrows the candidate set and lets the deck
 * policy choose its own next-best line from what survives. `rank` is that same
 * mechanism generalised from a boolean to an ordering. Contributions are
 * summed per action, grouped by action type, and every candidate that scores
 * below the best in its own group is hidden. So "prefer a Blocker here"
 * removes the non-Blocker plays and leaves the deck policy to decide whether
 * to play at all, attack, or attach DON!! instead.
 *
 * Three properties make it safe to add heuristics this way:
 *
 *  - **It cannot silence a whole decision.** Grouping is per action type and
 *    the best candidate in each group always survives, so no policy is ever
 *    left choosing between nothing.
 *  - **It cannot reach outside its subject.** A module that only ranks plays
 *    leaves attacks, Counters and effects untouched.
 *  - **It degrades to a no-op.** If every candidate in a group scores the same,
 *    nothing is hidden and behaviour is bit-identical.
 */
export interface PolicyModule {
  id: string;
  /** Narrower modules should sort later; ties resolve in registration order. */
  applies?(context: PolicyContext): boolean;
  /**
   * Preference among candidates of the same action type. Higher wins; anything
   * below the best in its group is hidden from the rest of the resolver.
   */
  rank?(context: PolicyContext, action: LegalAction): ScoreContribution;
  /**
   * Preference among *only the candidates this module scored*.
   *
   * The difference from {@link rank} is what happens to a candidate the module
   * said nothing about. `rank` compares against the best score in the whole
   * action type, so an unscored candidate sits at 0 and is hidden the moment
   * anything scores above it -- which makes a rule that names two cards and
   * shrugs at the rest a whitelist rather than a preference. That is the
   * documented shape of 64 of the 72 `prefer`/`avoid` rules in the repo and it
   * is usually what their author meant, because the gate they carry keeps the
   * whitelist narrow. It is not always what their author meant: a rule taken
   * straight from a deck guide can hide the deck's own finishers this way.
   *
   * This hook hides a candidate only when the module scored it *and* scored
   * something else in the same action type higher. Silence leaves a candidate
   * exactly where it was, so the rule reads "if you take one of these, take the
   * best one" rather than "take one of these".
   *
   * Scoped per module rather than per rule: `heuristics()` sums a module's
   * rules into one contribution, so the subset is the union of what any of its
   * `preferAmong` rules had an opinion about. Two such rules in one module
   * therefore still compete with each other -- which is the point of them being
   * in one module -- while leaving the rest of the candidates alone.
   */
  rankAmong?(context: PolicyContext, action: LegalAction): ScoreContribution;
  veto?(context: PolicyContext, action: LegalAction): string | undefined;
  decide?(context: PolicyContext): PolicyDecision | undefined;
}

function contribution(value: ScoreContribution): {
  score: number;
  reason?: string;
} {
  if (value === undefined) return { score: 0 };
  if (typeof value === "number") return { score: value };
  return { score: value.score, reason: value.reason };
}

/**
 * Hides every candidate that a `rank` module scored below the best candidate of
 * the same action type.
 *
 * `pass` is excluded from ranking for the same reason it is excluded from
 * vetoes: it is the escape hatch, and ending the turn is a different kind of
 * decision from choosing between two plays.
 *
 * No action type is ever hidden entirely -- see {@link keepOnePerType}, which
 * enforces that rather than leaving it to be argued from the shape of one pass.
 */
function applyRanking(
  context: PolicyContext,
  modules: readonly PolicyModule[],
): {
  survivors: LegalAction[];
  reasons: Map<string, string[]>;
  narrowers: Set<string>;
} {
  const rankers = modules.filter((module) => module.rank !== undefined);
  const subsetRankers = modules.filter(
    (module) => module.rankAmong !== undefined,
  );
  const reasons = new Map<string, string[]>();
  // Which rankers actually expressed a preference. A `rank`-only module never
  // owns a decision -- `moduleId` names whoever chose from the survivors -- so
  // this is the only record that it shaped one. Without it, a deck whose whole
  // policy is `rank` reads as unpiloted; see `op16-nami-policy.ts`.
  const narrowers = new Set<string>();
  if (rankers.length === 0 && subsetRankers.length === 0) {
    return { survivors: [...context.actions], reasons, narrowers };
  }

  // The subset pass, first and independently: a `rankAmong` module hides a
  // candidate only against the others *it* scored, so its verdict cannot depend
  // on what any `rank` module thought of a card it never looked at.
  const subsetHidden = new Set<string>();
  // Each subset ranker's own best candidate, which no *other* module may hide.
  //
  // `rankAmong`'s contract is that it hides a candidate only when it scored that
  // candidate and scored something else higher. Unioning the hidden sets breaks
  // that promise the moment two modules disagree: each hides the other's winner
  // and the whole action type disappears. Two search rankers meet exactly this
  // way -- `search-blocker` is registered format-wide and every deck with search
  // knowledge ranks its own results -- so the fix is to honour the contract per
  // module. Where they disagree, both winners survive and whoever decides picks
  // between them; where they agree, the narrowing is unchanged.
  const protectedIds = new Set<string>();
  for (const module of subsetRankers) {
    const scored = new Map<string, number>();
    const bestOfSubsetByType = new Map<string, number>();
    const worstOfSubsetByType = new Map<string, number>();
    for (const action of context.actions) {
      if (action.type === "pass") continue;
      const { score, reason } = contribution(
        module.rankAmong?.(context, action),
      );
      if (score === 0 && reason === undefined) continue;
      narrowers.add(module.id);
      scored.set(action.actionId, score);
      if (reason) {
        reasons.set(action.actionId, [
          ...(reasons.get(action.actionId) ?? []),
          reason,
        ]);
      }
      const best = bestOfSubsetByType.get(action.type);
      if (best === undefined || score > best) {
        bestOfSubsetByType.set(action.type, score);
      }
      const worst = worstOfSubsetByType.get(action.type);
      if (worst === undefined || score < worst) {
        worstOfSubsetByType.set(action.type, score);
      }
    }
    for (const [actionId, score] of scored) {
      const action = context.actions.find(
        (candidate) => candidate.actionId === actionId,
      );
      if (!action) continue;
      const best = bestOfSubsetByType.get(action.type);
      if (best === undefined) continue;
      // A module that scored every candidate of a type the same has expressed no
      // preference between them, so it neither hides nor *protects* any of them.
      // Protecting them would be worse than doing nothing: it would undo another
      // module's narrowing on the strength of an opinion this one never held.
      // `search-blocker` is exactly this case whenever no castable Blocker is on
      // offer, and without this guard it erased every deck search table.
      if (worstOfSubsetByType.get(action.type) === best) continue;
      if (score < best) subsetHidden.add(actionId);
      else protectedIds.add(actionId);
    }
  }
  for (const actionId of protectedIds) subsetHidden.delete(actionId);

  if (rankers.length === 0) {
    const survivors = keepOnePerType(context, subsetHidden);
    return { survivors, reasons, narrowers };
  }

  const scores = new Map<string, number>();
  const bestByType = new Map<string, number>();
  let anyOpinion = false;
  for (const action of context.actions) {
    if (action.type === "pass") continue;
    let total = 0;
    const because: string[] = [];
    for (const module of rankers) {
      const { score, reason } = contribution(module.rank?.(context, action));
      if (score === 0 && reason === undefined) continue;
      anyOpinion = true;
      narrowers.add(module.id);
      total += score;
      if (reason) because.push(reason);
    }
    scores.set(action.actionId, total);
    if (because.length > 0) reasons.set(action.actionId, because);
    const best = bestByType.get(action.type);
    if (best === undefined || total > best) bestByType.set(action.type, total);
  }
  if (!anyOpinion) {
    const survivors = keepOnePerType(context, subsetHidden);
    return { survivors, reasons, narrowers };
  }

  const hidden = new Set(
    context.actions
      .filter((action) => {
        if (action.type === "pass") return false;
        if (subsetHidden.has(action.actionId)) return true;
        const best = bestByType.get(action.type);
        return best !== undefined && (scores.get(action.actionId) ?? 0) < best;
      })
      .map((action) => action.actionId),
  );
  const survivors = keepOnePerType(context, hidden, scores);
  return { survivors, reasons, narrowers };
}

/**
 * Hide `hidden`, except where that would leave an action type with nothing.
 *
 * A single ranker cannot empty a group: it keeps whatever it scored highest. Two
 * cannot promise that between them, and neither can a `rank` module stacked on a
 * `rankAmong` one -- each is computed independently and the hidden sets are
 * unioned, so two rules that disagree about the same action type can hide all of
 * it. That leaves the deck policy choosing between nothing for that type, which
 * for a `resolve-effect` is a decision the engine is *waiting on*.
 *
 * The safety property {@link applyRanking} documents is therefore enforced here
 * rather than argued from the shape of one pass: any type that would be emptied
 * keeps its best-scoring member, ties going to the earliest in `legalActions`
 * order so the resolver stays deterministic. With one ranker this changes
 * nothing, because that member was never hidden in the first place.
 */
function keepOnePerType(
  context: PolicyContext,
  hidden: ReadonlySet<string>,
  scores?: ReadonlyMap<string, number>,
): LegalAction[] {
  const survivors = context.actions.filter(
    (action) => !hidden.has(action.actionId),
  );
  const survivingTypes = new Set(survivors.map((action) => action.type));
  const rescued: LegalAction[] = [];
  for (const action of context.actions) {
    if (action.type === "pass") continue;
    if (survivingTypes.has(action.type)) continue;
    const best = rescued.find((candidate) => candidate.type === action.type);
    if (!best) {
      rescued.push(action);
      continue;
    }
    const score = (candidate: LegalAction): number =>
      scores?.get(candidate.actionId) ?? 0;
    if (score(action) > score(best)) {
      rescued.splice(rescued.indexOf(best), 1, action);
    }
  }
  if (rescued.length === 0) return survivors;
  // Rebuilt in `legalActions` order rather than appended, so a rescued action
  // sits where the engine offered it and the resolver's tie-breaking is
  // unchanged.
  const keep = new Set([...survivors, ...rescued].map((a) => a.actionId));
  return context.actions.filter((action) => keep.has(action.actionId));
}

/**
 * The context the veto tier judges everything except plays against.
 *
 * Vetoes are collected from every applicable module in one subtractive pass, so
 * no module can see that another one removed the option it was arguing for. A
 * rule that hides A in order to promote B therefore fails silently when B is
 * vetoed elsewhere, and the ladder falls past both to whatever is next --
 * usually `attack` or `pass`.
 *
 * Three rules argue exactly that way about development, and all three read the
 * question off `legalActions` through `Tactics`: `don-reservation`
 * ("this DON!! is the last one that can pay for a play",
 * `attachmentBlocksAllDevelopment`), midrange's `develop-before-power` and
 * `aura-before-bodies` (both `affordablePlays.length`). Each refuses an
 * attachment so that a play can happen instead, and each counts plays the
 * engine offered rather than plays the seat would actually make.
 *
 * Two rules then deadlock over the same DON!!: `aura-before-bodies` hides the
 * last cheap play and `don-reservation` hides the attachment it was freeing the
 * DON!! for. The same shape reaches a Stage -- `stage-replacement` vetoes a
 * second copy of a Stage already on the field while `don-reservation` reserves
 * the turn's last DON!! for that very play -- and the Leader then swings without
 * the attachment, which is taken after the battle where +1000 buys nothing.
 *
 * So the play vetoes are collected first and their survivors are what the rest
 * of the tier is judged against. The ordering is sound rather than arbitrary:
 * no veto on a play reads whether an attachment or an attack is available, so
 * there is no cycle to break -- the dependency runs one way, from development
 * to everything that reasons about it.
 *
 * Deliberately confined to the veto tier. `rank`, `decide` and `score` still
 * see the original observation, because a play vetoed here is already absent
 * from the candidate set they are handed, and widening the substitution would
 * change what every module in the registry derives rather than the three that
 * ask this question.
 *
 * ## Measuring it
 *
 * Not a registered module and so not switchable with `pnpm deck:ab`: the
 * ordering is the resolver's, the way `attackerPower` in `generic-policy.ts` is
 * shared arithmetic. Both arms are whole builds, and the instrument has to be
 * chosen before the benchmark, because the wrong deck cannot see it.
 *
 * The position is rare -- a Main phase in which every offered play is vetoed --
 * so most of the field reads flat. Read it on a deck whose policy most often
 * holds a play it will not make: one that fills the Character area *and* runs a
 * Stage, which is both of the ways a hand can be retired whole, and so the deck
 * where `board-replacement-cost` and `stage-replacement` meet.
 *
 *   pnpm deck:benchmark run --deck "<that deck>" --seeds 100
 */
function withoutVetoedPlays(
  context: PolicyContext,
  vetoed: ReadonlySet<string>,
): PolicyContext {
  const survivors = context.actions.filter(
    (action) => !vetoed.has(action.actionId),
  );
  if (survivors.length === context.actions.length) return context;
  return {
    ...context,
    actions: survivors,
    // A fresh object, which is what makes `deriveTactics` recompute: its cache
    // is keyed on observation identity.
    observation: { ...context.observation, legalActions: survivors },
  };
}

/**
 * Resolves a decision from a set of modules.
 *
 * Order of operations:
 *
 *  1. Vetoes from every applicable module are collected and the offending
 *     actions are hidden. This is the composition path for "same deck,
 *     different matchup": a narrow module removes an option and the broad deck
 *     policy then picks its own next-best line, with no fork of that policy.
 *     Plays go first and everything else is judged against what survives them,
 *     because several rules refuse an attachment in order to promote a play --
 *     see {@link withoutVetoedPlays}.
 *  2. `rank` contributions are summed per action and, within each action type,
 *     everything below that type's best score is hidden as well. Same
 *     containment as a veto, finer instrument.
 *  3. `decide` modules are consulted in order against what survives, so an
 *     existing whole-turn policy behaves exactly as before when nothing vetoes
 *     or ranks.
 *  4. Otherwise the generic ladder chooses from what survives. It is
 *     deterministic, so the resolver is.
 *
 * Steps 1 and 2 both explain themselves into the resulting decision's `reasons`,
 * because the module that ends up deciding never learns that an option existed
 * and was removed.
 */
export function resolveWithModules(
  observation: GameObservation,
  modules: readonly PolicyModule[],
): PolicyDecision {
  const fullContext = policyContext(observation);
  const active = modules.filter(
    (module) => module.applies?.(fullContext) ?? true,
  );

  const vetoed = new Set<string>();
  // Why an option was taken off the table explains the resulting decision as
  // much as the decision's own reason does, and it is otherwise invisible: the
  // deck policy that ends up choosing never knows the option existed.
  const vetoReasons = new Set<string>();
  // `pass` vetoes are collected separately and applied only if something else
  // survives, rather than exempting `pass` outright. A policy is never left
  // choosing between nothing either way, but a blanket exemption makes a whole
  // class of rule inexpressible: nothing could cause an action to be *taken*
  // that the deck policy had declined. "The race is lost, block this hit rather
  // than absorb it" is the motivating case, because `chooseGenericBlock` answers
  // a survivable hit with `pass`. See `mustAct`.
  const passVetoReasons = new Set<string>();
  const passIds = new Set<string>();
  // Companion to `vetoReasons`, by module rather than by reason. See
  // `narrowers` in `applyRanking`.
  const vetoers = new Set<string>();
  const passVetoers = new Set<string>();
  const sweep = (context: PolicyContext, plays: boolean): void => {
    for (const action of context.actions) {
      if ((action.type === "play-card") !== plays) continue;
      for (const module of active) {
        const reason = module.veto?.(context, action);
        if (reason === undefined) continue;
        if (action.type === "pass") {
          passIds.add(action.actionId);
          passVetoReasons.add(reason);
          passVetoers.add(module.id);
          continue;
        }
        vetoed.add(action.actionId);
        vetoReasons.add(reason);
        vetoers.add(module.id);
      }
    }
  };
  sweep(fullContext, true);
  sweep(withoutVetoedPlays(fullContext, vetoed), false);
  if (passIds.size > 0) {
    const othersSurvive = fullContext.actions.some(
      (action) => action.type !== "pass" && !vetoed.has(action.actionId),
    );
    if (othersSurvive) {
      for (const id of passIds) vetoed.add(id);
      for (const reason of passVetoReasons) vetoReasons.add(reason);
      for (const id of passVetoers) vetoers.add(id);
    }
  }
  const vetoSurvivors = fullContext.actions.filter(
    (action) => !vetoed.has(action.actionId),
  );
  const afterVeto: PolicyContext =
    vetoSurvivors.length > 0 &&
    vetoSurvivors.length < fullContext.actions.length
      ? { ...fullContext, actions: vetoSurvivors }
      : fullContext;

  const {
    survivors,
    reasons: rankReasons,
    narrowers,
  } = applyRanking(afterVeto, active);
  const narrowedBy = [...new Set([...vetoers, ...narrowers])].sort();
  const context: PolicyContext =
    survivors.length < afterVeto.actions.length
      ? { ...afterVeto, actions: survivors }
      : afterVeto;
  const visible = new Set(context.actions.map((action) => action.actionId));
  // A vetoed `pass` is hidden from `visible` -- a policy that chooses it is
  // overruled -- but it is *not* hidden from the policies themselves. Eight of
  // the ten deck policies are first-match-wins ladders that call `pass(actions)`
  // directly and throw `NO_LEGAL_ACTION` when it is absent, so handing them a
  // candidate set with no `pass` in it crashes the match rather than producing
  // the decision the rule was asking for.
  //
  // So `decide` modules see `pass`, choosing it is rejected, and the fallback
  // below sees the narrowed set. The net effect is exactly the intent: the turn
  // cannot end here, and whichever policy wanted it to simply does not get the
  // last word.
  const vetoedPass = fullContext.actions.filter(
    (action) => action.type === "pass" && vetoed.has(action.actionId),
  );
  const decideActions = [...context.actions, ...vetoedPass];
  const decideContext: PolicyContext =
    vetoedPass.length > 0 ? { ...context, actions: decideActions } : context;
  const decideObservation =
    context === fullContext
      ? observation
      : { ...observation, legalActions: [...decideActions] };
  // The generic fallback is given the narrowed set: it does not need `pass` to
  // exist and reads its absence as "act".
  const fallbackObservation =
    context === fullContext
      ? observation
      : { ...observation, legalActions: [...context.actions] };

  for (const module of active) {
    const decided = module.decide?.({
      ...decideContext,
      observation: decideObservation,
    });
    if (!decided) continue;
    // This is a trust boundary: `decided` comes from an arbitrary registered
    // module, and `PolicyDecision.action` being declared non-optional is a
    // promise the type system cannot enforce here. Several policies build a
    // decision as `decision(actions[0]!, …)`, and `no-non-null-assertion` is off
    // repo-wide, so a policy whose guard is wrong hands back an undefined action
    // that types as present. Every current call site was checked and is guarded,
    // which is why the rule below fires -- but falling through to the next
    // module is strictly better than a TypeError mid-match, and the next module
    // to be registered has not been checked yet.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!decided.action) continue;
    const chosen = decided.action;
    if (!visible.has(chosen.actionId)) continue;
    // Attribution goes in `moduleId`, not into `reasons`: the reason strings
    // are a stable contract for tests, traces and the LLM prompt. Ranking and
    // veto reasons are appended because they explain why this candidate was the
    // one still on the table, which is otherwise invisible in a trace.
    const narrowing = [
      ...vetoReasons,
      ...(rankReasons.get(chosen.actionId) ?? []),
    ];
    return {
      ...decided,
      ...(narrowing.length > 0
        ? { reasons: [...decided.reasons, ...narrowing] }
        : {}),
      moduleId: module.id,
      ...(narrowedBy.length > 0 ? { narrowedBy } : {}),
    };
  }

  return generic(fallbackObservation, narrowedBy);
}

/**
 * The generic ladder's decision, carrying whatever narrowed its candidates.
 *
 * `moduleId` stays absent, because no module chose. `narrowedBy` is the
 * difference between "no rule applied to this decision" and "a `rank`-only deck
 * policy picked the candidates and the generic ladder chose among them" -- which
 * are the same thing in `moduleId` and very different findings.
 */
function generic(
  observation: GameObservation,
  narrowedBy: readonly string[],
): PolicyDecision {
  const decision = chooseGenericRules(observation);
  return narrowedBy.length > 0 ? { ...decision, narrowedBy } : decision;
}

/** Wraps a legacy whole-turn policy function as a `decide`-only module. */
export function decideModule(
  id: string,
  policy: (observation: GameObservation) => PolicyDecision | undefined,
): PolicyModule {
  return { id, decide: (context) => policy(context.observation) };
}

/** Restricts a module to a specific self-Leader / opponent-Leader pairing. */
export function forMatchup(
  module: PolicyModule,
  selfLeader: string,
  opponentLeader?: string,
): PolicyModule {
  return {
    ...module,
    applies: (context) =>
      context.selfLeader === selfLeader &&
      (opponentLeader === undefined ||
        context.opponentLeader === opponentLeader) &&
      (module.applies?.(context) ?? true),
  };
}

/** Restricts a module to a self-Leader facing a whole opponent archetype. */
export function forArchetype(
  module: PolicyModule,
  selfLeader: string,
  opponentArchetype: Archetype,
): PolicyModule {
  return {
    ...module,
    applies: (context) =>
      context.selfLeader === selfLeader &&
      context.opponentArchetype === opponentArchetype &&
      (module.applies?.(context) ?? true),
  };
}
