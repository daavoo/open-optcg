import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  nextInt,
  seedRng,
  type Plan,
  type RngState,
  type Simulate,
} from "@one-piece-sim/engine-core";
import { chooseGenericRules, type PolicyDecision } from "./generic-policy.js";
import { chooseWithModules, type RulesPolicy } from "./policy-chain.js";
import { createDonLookaheadModule } from "./modules/lookahead-module.js";
import { createDonSequenceModule } from "./modules/don-sequence-module.js";
import { decideModule, type PolicyModule } from "./policy-module.js";
import { LEADERS, policiesForDeck } from "./registry.js";
import { withoutAsideCounters } from "../aside-counters.js";

export { isAsideCounter, withoutAsideCounters } from "../aside-counters.js";

export interface Agent {
  chooseAction(
    observation: GameObservation,
    signal?: AbortSignal,
  ): Promise<LegalAction>;
}

/**
 * Runners call this before each decision when they can offer lookahead. Agents
 * that do not implement it are unaffected, so this is additive.
 */
export interface SimulatingAgent {
  useSimulator(simulate: Simulate | undefined): void;
  /** Optional deeper hook, for agents that search more than one action ahead. */
  usePlanner?(plan: Plan | undefined): void;
}

export function acceptsSimulator(agent: object): agent is SimulatingAgent {
  return typeof (agent as SimulatingAgent).useSimulator === "function";
}

export class FirstLegalAgent implements Agent {
  async chooseAction(observation: GameObservation): Promise<LegalAction> {
    const action = observation.legalActions[0];
    if (!action) throw new Error("NO_LEGAL_ACTION");
    return action;
  }
}

export class SeededRandomAgent implements Agent {
  #rng: RngState;

  constructor(seed: string) {
    this.#rng = seedRng(seed);
  }

  async chooseAction(observation: GameObservation): Promise<LegalAction> {
    if (observation.legalActions.length === 0)
      throw new Error("NO_LEGAL_ACTION");
    const result = nextInt(this.#rng, observation.legalActions.length);
    this.#rng = result.state;
    return observation.legalActions[result.value]!;
  }
}

export class GenericRulesAgent implements Agent {
  async chooseAction(observation: GameObservation): Promise<LegalAction> {
    return chooseGenericRules(withoutAsideCounters(observation)).action;
  }
}

export class RulesFirstAgent extends GenericRulesAgent {}

abstract class ComposedRulesAgent implements Agent, SimulatingAgent {
  #lastDecision: PolicyDecision | undefined;
  #simulate: Simulate | undefined;
  #plan: Plan | undefined;

  useSimulator(simulate: Simulate | undefined): void {
    this.#simulate = simulate;
  }

  usePlanner(plan: Plan | undefined): void {
    this.#plan = plan;
  }

  protected simulate(): Simulate | undefined {
    return this.#simulate;
  }

  protected plan(): Plan | undefined {
    return this.#plan;
  }

  /** Legacy hook. Subclasses that use the registry override `modules` instead. */
  protected policies(): readonly RulesPolicy[] {
    return [];
  }

  protected modules(): readonly PolicyModule[] {
    return this.policies().map((policy, index) =>
      decideModule(`policy-${index}`, policy),
    );
  }

  async chooseAction(observation: GameObservation): Promise<LegalAction> {
    const policyDecision = chooseWithModules(
      withoutAsideCounters(observation),
      this.modules(),
    );
    this.#lastDecision = policyDecision;
    return policyDecision.action;
  }

  get lastDecision(): PolicyDecision | undefined {
    return this.#lastDecision ? structuredClone(this.#lastDecision) : undefined;
  }
}

/**
 * Agent whose behaviour comes entirely from the policy registry. Adding a
 * matchup means adding one `registerPolicy` entry, not editing this class.
 */
export interface RegistryAgentOptions {
  /**
   * Enable one-ply DON!! lookahead.
   *
   * Off by default: it changes most games it touches and moves no deck. The
   * simulator and the module are kept because the mechanism is sound and
   * cheap; what is missing is a better objective than "count the viable
   * attacks after this attachment". Turn it on to iterate on that.
   */
  donLookahead?: boolean;
  /**
   * Enable multi-ply DON!! sequencing, which replaces that objective with the
   * Counter-card demand of the whole resulting attack sequence. Requires a
   * runner that supplies a planner via `usePlanner`.
   *
   * Also off by default: deeper search and a resource-based objective still
   * do not beat the deck policies' own attachment heuristics. The shortfall
   * is scope, not scalar -- the playout prices only this turn's *attacks* and
   * never branches over further attachments or `[Activate: Main]` abilities.
   */
  donSequence?: boolean;
  /**
   * Registered module ids to leave out of this agent.
   *
   * This exists for measurement. A format-wide heuristic makes *both* seats play
   * better, so a symmetric benchmark cannot see it: the win rates move together
   * and the delta reads as zero even when the rule is a real improvement. Being
   * able to switch one module off for one seat turns that into a direct A/B, which
   * is what `pnpm heuristic:ab` does.
   *
   * An entry also matches as a prefix before a `#`, so `strategy:red-aggro`
   * disables every rule compiled from that profile layer while
   * `strategy:red-aggro#prefer-rush` disables just the one.
   */
  disableModules?: readonly string[];
}

export class RegistryRulesAgent extends ComposedRulesAgent {
  readonly #modules: readonly PolicyModule[];

  constructor(leaderCardNumber: string, options: RegistryAgentOptions = {}) {
    super();
    const disabled = new Set(options.disableModules ?? []);
    // Matched as a prefix as well as exactly, so one `--disable` entry can name a
    // whole strategy layer (`strategy:red-aggro`) or a single rule inside it
    // (`strategy:aggro#press-leader`). Every other module id has no `#`, so this
    // is inert for them.
    const isDisabled = (id: string): boolean =>
      disabled.has(id) ||
      [...disabled].some((entry) => id.startsWith(`${entry}#`));
    this.#modules = [
      // Placed first so its veto is collected before any policy decides. Inert
      // unless a runner has supplied a simulator.
      ...(options.donLookahead
        ? [createDonLookaheadModule(() => this.simulate())]
        : []),
      ...(options.donSequence
        ? [createDonSequenceModule(() => this.plan())]
        : []),
      ...policiesForDeck(leaderCardNumber),
    ].filter((module) => !isDisabled(module.id));
  }

  protected override modules(): readonly PolicyModule[] {
    return this.#modules;
  }
}

export class St31RulesAgent extends RegistryRulesAgent {
  constructor(options?: RegistryAgentOptions) {
    super(LEADERS.ST31, options);
  }
}

export class St32RulesAgent extends RegistryRulesAgent {
  constructor(options?: RegistryAgentOptions) {
    super(LEADERS.ST32, options);
  }
}

export class St33RulesAgent extends RegistryRulesAgent {
  constructor(options?: RegistryAgentOptions) {
    super(LEADERS.ST33, options);
  }
}

export class St34RulesAgent extends RegistryRulesAgent {
  constructor(options?: RegistryAgentOptions) {
    super(LEADERS.ST34, options);
  }
}

export class St35RulesAgent extends RegistryRulesAgent {
  constructor(options?: RegistryAgentOptions) {
    super(LEADERS.ST35, options);
  }
}

export class St36RulesAgent extends RegistryRulesAgent {
  constructor(options?: RegistryAgentOptions) {
    super(LEADERS.ST36, options);
  }
}

export class Op16LuffyRulesAgent extends RegistryRulesAgent {
  constructor(options?: RegistryAgentOptions) {
    super(LEADERS.OP16_LUFFY, options);
  }
}

export class NamiRulesAgent extends RegistryRulesAgent {
  constructor(options?: RegistryAgentOptions) {
    super(LEADERS.NAMI, options);
  }
}

export class EnelRulesAgent extends RegistryRulesAgent {
  constructor(options?: RegistryAgentOptions) {
    super(LEADERS.ENEL, options);
  }
}

export {
  chooseGenericBlock,
  chooseGenericCounter,
  chooseGenericRules,
  chooseGenericTrigger,
  chooseKeywordGrantTarget,
  isSearchResult,
  nonSkipEffects,
  type CounterPolicyOptions,
} from "./generic-policy.js";
export {
  chooseWithModules,
  chooseWithPolicies,
  type RulesPolicy,
} from "./policy-chain.js";
export {
  avoid,
  avoidAmong,
  heuristics,
  never,
  prefer,
  preferAmong,
  type Heuristic,
  mustAct,
  WEIGHT,
} from "./heuristics.js";
export {
  anyEarlyPlay,
  createMulliganModule,
  DECKS_ON_THE_GENERIC_MULLIGAN,
  type MulliganRule,
} from "./mulligan.js";
export { DEFAULT_ABANDON_MARGIN, race, type Race, type Role } from "./race.js";
export { BUILT_IN_STRATEGY_PROFILES } from "./strategy/archetypes.js";
export {
  clearStrategyProfiles,
  compileProfile,
  DEFAULT_STRATEGY_PARAMS,
  registeredStrategyProfiles,
  registerStrategyProfile,
  resolveProfile,
  strategyModuleId,
  strategyProfile,
  type ResolvedProfile,
  type StrategyParams,
  type StrategyProfile,
} from "./strategy/profile.js";
export { leadersWithPattern, patternOf } from "./strategy/patterns.js";
export {
  createSearchValueModule,
  REJECTED_SEARCH_TABLES,
  SEARCH_TABLES,
  tabledCards,
  type SearchTable,
  type SearchTier,
  type SearchValues,
} from "./search-values.js";
export {
  createAreaReplacementChoiceModule,
  createSearchBlockerModule,
  createAttackOrderModule,
  createClauseSwingModule,
  createAuraAttachmentModule,
  createBoardReplacementModule,
  createReplacementBlockerModule,
  createCounterOverDyingBlockModule,
  createCounterBudgetModule,
  donThresholdRule,
  createCounterEventReserveModule,
  createDeadAttachmentModule,
  createPreCombatAttachmentModule,
  createDeadOpeningPlayModule,
  createRestedDonGiftModule,
  createPressThroughBlockersModule,
  createDeadBuffTriggerModule,
  createDeadTriggerModule,
  createDeadKeywordGrantModule,
  createDeadRampModule,
  createCappedRampModule,
  createInertActivationModule,
  createInertTriggerModule,
  createDeadRampTriggerModule,
  createDonReservationModule,
  createDonThresholdModule,
  createKoReachAttachmentModule,
  createKoMarginAttachmentModule,
  createLethalCloseModule,
  createNoHopelessAttackModule,
  createKoPayoffTargetModule,
  createThreatRemovalModule,
  createTriggerDebuffTargetModule,
  createMainDebuffTargetModule,
  createStageReplacementModule,
} from "./format-heuristics.js";
export {
  tactics,
  tacticsFor,
  type ActivateMainAction,
  type AttachDonAction,
  type BlockAction,
  type CounterAction,
  type HandCard,
  type PlayAction,
  type Tactics,
  type TriggerAction,
} from "./tactics.js";
export {
  archetypeOf,
  decideModule,
  forArchetype,
  forMatchup,
  policyContext,
  resolveWithModules,
  type Archetype,
  type PolicyContext,
  type PolicyModule,
  type ScoreContribution,
} from "./policy-module.js";
export {
  attacksAreLethal,
  counterCardsNeeded,
  counterDemand,
  incomingLeaderAttacks,
  incomingLeaderDamage,
  incomingLeaderDamages,
  leaderHitDamage,
  nextTurnLeaderDamage,
  nextTurnLeaderThreats,
  opponentCanStillAttack,
  ownAttackerLeaderDamage,
} from "./combat.js";
export {
  EVERY_DECK,
  LEADERS,
  moduleScopes,
  policiesForDeck,
  registerPolicy,
  registeredDecks,
  type ModuleScope,
  type Registration,
} from "./registry.js";
export { createDonLookaheadModule } from "./modules/lookahead-module.js";
export { createDonSequenceModule } from "./modules/don-sequence-module.js";
export { chooseSt31Rules } from "./decks/st31-policy.js";
export { createSt32RulesPolicy } from "./decks/st32-policy.js";
export { createSt33RulesPolicy } from "./decks/st33-policy.js";
export { createSt34RulesPolicy } from "./decks/st34-policy.js";
export { createSt35DefensePolicy, ST35_RULES } from "./decks/st35-policy.js";
export { createSt36RulesPolicy } from "./decks/st36-policy.js";
export { createOp16LuffyRulesPolicy } from "./decks/op16-luffy-policy.js";
export { OP16_NAMI_RULES } from "./decks/op16-nami-policy.js";
export { createOp16EnelRulesPolicy } from "./decks/op16-enel-policy.js";
