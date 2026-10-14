import { heuristicModules, type Heuristic } from "../heuristics.js";
import type { Archetype, PolicyModule } from "../policy-module.js";

/**
 * Inheritable deck strategy: an archetype's plan, written once, retuned by the
 * decks that pilot it.
 *
 * ## What it is for
 *
 * Elsewhere in the package "archetype" is a label on the *opponent's* Leader,
 * used to gate matchup modules -- `forArchetype` demands a self-Leader by card
 * number. That leaves no notion of a seat piloting an archetype, and so no place
 * to write archetype knowledge once: it ends up restated in each deck's
 * first-match-wins ladder. A profile is that place. `docs/proposals/archetype-
 * strategy-layer.md` records the decisions behind its shape.
 *
 * ## Inheritance is two mechanisms, deliberately
 *
 *  - **Parameters merge**, child over parent, across the whole chain -- and the
 *    *merged* set is handed to every profile's `rules`, the parent's included.
 *    That is what makes a deck profile cheap: `red-aggro-luffy-st31` can override
 *    `leaderCounterBudget` and change how its inherited `aggro` rules behave
 *    without restating one of them.
 *  - **Rules concatenate.** A child adds rules; it never edits or removes a
 *    parent's. If a parent rule is wrong for one child, the fix is a parameter,
 *    or the rule was registered a level too wide -- which is the same judgement
 *    `.claude/skills/audit-deck-policy` already asks for, and the pressure to
 *    subtract is the signal that it was got wrong. Rule subtraction is how a
 *    hierarchy becomes unreadable, so there is no mechanism for it.
 *
 * ## Profiles never `decide`
 *
 * A profile contributes only `rank` and `veto`, enforced by `rules` yielding
 * `Heuristic` (which compiles to nothing else) and by a registry test. This is
 * the property that makes the layer safe to add to a package whose eight deck
 * policies are whole-turn `decide` ladders: every layer narrows, none replaces,
 * so the deck policy keeps the final say and an archetype rule can never blank
 * out a decision point. It is also what makes adoption incremental -- a ladder
 * can be dissolved into profile rules a few at a time.
 *
 * ## One module per rule
 *
 * `compileProfile` returns one `PolicyModule` per *named rule*, id
 * `strategy:<profile>#<rule>`, plus one module per layer for whatever is left
 * unnamed. `RegistryRulesAgent` treats a `--disable` entry as a prefix, so both
 * granularities are addressable:
 *
 * ```sh
 * pnpm deck:ab --deck ST31 --disable strategy:red-aggro            # the layer
 * pnpm deck:ab --deck ST31 --disable strategy:aggro#press-leader   # one rule
 * ```
 *
 * Both matter, and for different reasons. The layer answers "is this archetype
 * worth having?"; the rule answers "which part of it earned the number?" --
 * without which a layer that measures well can be three rules, one of which
 * is quietly costing more than the other two make. Expect a layer-level
 * number to hide exactly that: a large gain on one deck alongside a loss on
 * another, with significantly negative matchups inside it, is a question no
 * layer-level number can answer.
 */

/**
 * The knobs a child profile retunes instead of restating a parent's rules.
 *
 * Every field is a number a rule reads, never a switch that turns a rule off:
 * a parameter that only ever enables or disables a rule is a rule that belongs
 * one level down the tree. Keeping them numeric is what makes an override
 * legible as a *degree* of the same plan rather than a different plan.
 */
export interface StrategyParams {
  /**
   * Counter cards worth spending on one Leader hit that is not itself lethal.
   *
   * The format-wide `counter-budget` module fixes this at 2, which is the right
   * default for a deck that is not racing. A racing deck wants it lower: its
   * cards are pressure and its Life is the resource it is spending to buy them.
   */
  leaderCounterBudget: number;
  /**
   * Life at or below which Life stops being a resource and starts being the
   * clock.
   *
   * Above it, absorb: a Leader hit taken moves a Life card into hand, so
   * absorbing is close to card-neutral and a multi-card Counter line is not. At
   * or below it, the buffer being spent is the last one and the cards bought
   * with it will not be spendable either.
   */
  lifeFloor: number;
  /** Turn the plan wants the game to be over by. */
  targetCloseTurn: number;
  /** Bodies the plan wants on the field before quality beats quantity. */
  targetBoardWidth: number;
  /**
   * Turns behind on the clock before the race is treated as lost.
   *
   * Passed to `race()` as its abandon margin. A deck whose only plan is the race
   * should abandon it later than one that has another way to win.
   */
  raceAbandonMargin: number;
}

/**
 * Root defaults, so `StrategyParams` is total and a profile only states what it
 * changes.
 *
 * These are the *format's* defaults rather than any archetype's: a Counter budget
 * of 2 matching the shipped `counter-budget` module, a Life floor of 2 matching
 * `mustPreventCurrentLeaderHit`'s low-Life clause, and a close turn of 6 matching
 * the turn by which all ten DON!! are normally down. A profile that overrides
 * none of them therefore behaves exactly as the format fundamentals already do.
 */
export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  leaderCounterBudget: 2,
  lifeFloor: 2,
  targetCloseTurn: 6,
  targetBoardWidth: 3,
  raceAbandonMargin: 1,
};

export interface StrategyProfile {
  /** Kebab-case, and the suffix of the compiled module id. */
  id: string;
  /** Parent profile id. Absent for a root archetype. */
  extends?: string;
  /** One line on what the plan is. Shows up in nothing; read by people. */
  summary: string;
  /**
   * How *opponents* should read a deck piloting this profile.
   *
   * Cross-checked against `strategy/patterns.ts` by test rather than used to
   * build it; see that file for why.
   */
  pattern?: Archetype;
  /** Leaders that pilot this profile directly, by card number. */
  leaders?: readonly string[];
  /** Overrides, merged child-over-parent across the chain. */
  params?: Partial<StrategyParams>;
  /**
   * The layer's rules, given the *merged* parameters of the whole chain.
   *
   * A function rather than a list so a child's override reaches a parent's rules.
   * Omit it for a profile that exists only to name a pattern or to carry
   * parameters -- registering such a profile is then a measurable no-op.
   */
  rules?: (params: StrategyParams) => readonly Heuristic[];
}

const profiles = new Map<string, StrategyProfile>();

export function registerStrategyProfile(profile: StrategyProfile): void {
  const existing = profiles.get(profile.id);
  if (existing && existing !== profile) {
    throw new Error(`DUPLICATE_STRATEGY_PROFILE: ${profile.id}`);
  }
  profiles.set(profile.id, profile);
}

export function strategyProfile(id: string): StrategyProfile | undefined {
  return profiles.get(id);
}

export function registeredStrategyProfiles(): readonly StrategyProfile[] {
  return [...profiles.values()];
}

export interface ResolvedProfile {
  /** Root first, so a reader sees the plan before its refinements. */
  readonly chain: readonly StrategyProfile[];
  /** Every layer's overrides merged over {@link DEFAULT_STRATEGY_PARAMS}. */
  readonly params: StrategyParams;
}

/**
 * Walks a profile's `extends` chain and merges its parameters.
 *
 * Root-first, because that is the order a person reads a hierarchy in and the
 * order overrides have to be applied in. Throws on an unknown parent or a cycle
 * rather than silently truncating the chain: a profile that quietly loses its
 * parent is a deck that quietly loses its archetype, which is exactly the class
 * of failure this layer exists to stop.
 */
export function resolveProfile(id: string): ResolvedProfile {
  const chain: StrategyProfile[] = [];
  const seen = new Set<string>();
  let current: string | undefined = id;
  while (current !== undefined) {
    if (seen.has(current)) {
      throw new Error(`STRATEGY_PROFILE_CYCLE: ${current}`);
    }
    seen.add(current);
    const profile = profiles.get(current);
    if (!profile) throw new Error(`UNKNOWN_STRATEGY_PROFILE: ${current}`);
    chain.unshift(profile);
    current = profile.extends;
  }
  const params = chain.reduce<StrategyParams>(
    (merged, profile) => ({ ...merged, ...profile.params }),
    DEFAULT_STRATEGY_PARAMS,
  );
  return { chain, params };
}

/** The module id a profile compiles to. */
export function strategyModuleId(profileId: string): string {
  return `strategy:${profileId}`;
}

/**
 * Compiles a profile chain into one `PolicyModule` per named rule, plus one per
 * layer for the rules that were not named.
 *
 * Layers with no rules are dropped rather than compiled to an empty module, so
 * `--disable` never names a module that could not have done anything, and the
 * module list reads as the claims that actually contribute.
 *
 * Within a layer the unnamed rules come first as one module, then each named rule
 * in declaration order. The order is cosmetic -- `rank` and `veto` are collected
 * from every applicable module rather than raced -- but it keeps a trace's module
 * list stable as rules are named.
 */
export function compileProfile(id: string): PolicyModule[] {
  const { chain, params } = resolveProfile(id);
  return chain.flatMap((profile) => {
    const rules = profile.rules?.(params) ?? [];
    if (rules.length === 0) return [];
    return heuristicModules(strategyModuleId(profile.id), rules);
  });
}

/** Reset hook for tests that register throwaway profiles. */
export function clearStrategyProfiles(): void {
  profiles.clear();
}
