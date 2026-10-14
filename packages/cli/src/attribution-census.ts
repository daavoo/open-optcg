/**
 * Which policy module decides each of a deck's decisions, over a whole
 * benchmark run.
 *
 * The benchmark says a deck wins 28.6% of its games. It does not say whether
 * that deck has a policy of its own, or is running the format fundamentals and
 * the generic ladder against eleven decks that do. `moduleId` has recorded the
 * answer per decision since the module resolver was written, but only ever into
 * a single-game trace -- so the question "where is this deck unpiloted?" has
 * been a code read, one deck at a time.
 *
 * This aggregates that attribution across every game of a benchmark field. Three
 * findings in this repository's own history are shapes in this data:
 *
 * - **A deck with no policy.** Four of the fifteen selectable decks have no
 *   deck-scoped registration at all; three of those four are in the bottom six
 *   of the standings. Reads as a high `generic` and `format` share.
 * - **A branch swallowing a phase.** ST33 lost 22.8pt to one branch classifying
 *   96% of its effect decisions, with all seventeen of its tests still passing.
 *   Reads as one module taking an implausible share of one action type.
 * - **A module that never fires.** `st32-into-st31` was 700 hand-tuned lines
 *   measuring as a wash. A module registered for a deck in the field and never
 *   reached is dead weight, and `silentModules` names it without a run of
 *   `deck:ab` per module.
 *
 * The census is a *locator*, not a verdict: it says where a deck is unpiloted,
 * never whether a rule would help. Every candidate it surfaces still has to be
 * measured with `deck:ab` or `heuristic:ab` -- a rule everyone agrees on has
 * measured as large and negative here before.
 */
import {
  moduleScopes,
  policiesForDeck,
  type ModuleScope,
} from "@one-piece-sim/agents/local";
import { requireSupportedDeck } from "@one-piece-sim/decks";
import type { BenchmarkDecision, BenchmarkDeckId } from "./deck-benchmark.js";

export const CENSUS_SCHEMA_VERSION = 1;

/**
 * What decided one decision: a registered module's scope, or `generic` for the
 * fallthrough to `chooseGenericRules`.
 */
export type AttributionClass = ModuleScope | "narrowed" | "generic";

/**
 * Narrowest first. `narrowed` sits between the scopes and `generic`: a module
 * shaped the decision without owning it, which is neither "this deck's policy
 * chose" nor "no rule applied".
 */
export const ATTRIBUTION_CLASSES: readonly AttributionClass[] = [
  "matchup",
  "deck",
  "strategy",
  "format",
  "narrowed",
  "generic",
];

/** Decisions split by whether the deck's own policy was reached. */
export interface SliceCounts {
  decisions: number;
  /**
   * Of the *unforced* ones, how many fell through to `chooseGenericRules`.
   *
   * Unforced, because every reader of this field divides it by
   * `decisions - forced` -- a share of the real decisions is the only figure
   * that describes the policy. Counting forced moves in the numerator and not
   * the denominator is what made the block column print `'8253.3% of 30'`.
   */
  generic: number;
  /**
   * Of those, the ones the engine offered a single legal action for.
   *
   * A forced move is not a decision, and counting it as one makes a coverage
   * figure describe the engine instead of the policy. An OP-14 Mihawk census
   * read its block phase as 99.4% unpiloted over 1693 decisions; 1622 of them
   * offered only `pass`, because every attack against a seat raises a block
   * decision whether or not it holds a [Blocker]. Subtract these before
   * believing a gap is a gap.
   */
  forced: number;
}

export interface DeckCensus {
  deck: BenchmarkDeckId;
  leader: string;
  decisions: number;
  /**
   * One class per decision, so these sum to `decisions`. A decision decided by
   * several scoring modules at once is counted at the narrowest scope among its
   * contributors, which is the claim that actually distinguished the action.
   */
  byClass: Record<AttributionClass, number>;
  /**
   * Raw `moduleId` as recorded, so a combined score decision appears under its
   * `a+b` id rather than being split. Sums to `decisions` less `byClass.generic`.
   */
  byModule: Record<string, number>;
  /**
   * For the `narrowed` decisions, the narrowest scope among the modules that
   * narrowed them. A deck whose own policy narrowed the candidates is piloted;
   * one where only the format fundamentals did is not.
   */
  byNarrowedScope: Record<ModuleScope, number>;
  byPhase: Record<string, SliceCounts>;
  byActionType: Record<string, SliceCounts>;
  /**
   * Decisions keyed `<phase>:<actionType>` -- the deck's *decision surface*.
   *
   * `byPhase` and `byActionType` each answer half of "where do this deck's
   * decisions live", and neither ranks them by volume. A policy improvement is
   * worth (how often the decision occurs) x (how much a better answer is
   * worth), and the first factor is measurable up front. For OP-14 Mihawk,
   * `main:resolve-effect` ran at 34.6 per game against 13.0 for the next
   * largest class and had one rule covering it -- biggest surface, thinnest
   * coverage, which is where its 3.3pt was.
   */
  bySurface: Record<string, SliceCounts>;
  /**
   * Modules registered for this deck that never decided or narrowed one of its
   * decisions. Dead weight, or a rule whose `applies` gate never opened -- both
   * worth knowing, and neither visible from the registry.
   *
   * Counts narrowing, not just deciding: a `rank`-only module that hid a
   * candidate has done its work, and calling it silent was this instrument's
   * first bug.
   */
  silentModules: string[];
}

export interface CensusReport {
  schemaVersion: typeof CENSUS_SCHEMA_VERSION;
  rulesVersion: string;
  configuration: {
    mode: "one-vs-all" | "all-vs-all";
    decks: BenchmarkDeckId[];
    seedsPerMatchup: number;
    seedPrefix: string;
    maxActions: number;
  };
  totals: {
    decisions: number;
    byClass: Record<AttributionClass, number>;
  };
  /** Ranked by generic share descending: the least-piloted deck first. */
  decks: DeckCensus[];
}

/**
 * A census as plain data, for crossing a process boundary.
 *
 * The accumulator holds `Map`s and `Set`s, and `child_process` messaging turns
 * those into `{}` rather than refusing to send them -- a silent zero rather than
 * an error. So a shard ships this instead, and the parent restores and merges.
 */
export interface CensusSnapshot {
  decks: {
    deck: BenchmarkDeckId;
    decisions: number;
    byClass: Record<AttributionClass, number>;
    byNarrowedScope: Record<ModuleScope, number>;
    byModule: Record<string, number>;
    byPhase: Record<string, SliceCounts>;
    byActionType: Record<string, SliceCounts>;
    bySurface: Record<string, SliceCounts>;
    contributors: string[];
  }[];
}

const emptyClassCounts = (): Record<AttributionClass, number> => ({
  matchup: 0,
  deck: 0,
  strategy: 0,
  format: 0,
  narrowed: 0,
  generic: 0,
});

const SCOPES: readonly ModuleScope[] = [
  "matchup",
  "deck",
  "strategy",
  "format",
];

/** Narrowest first, matching {@link moduleScopes}. */
const SCOPE_RANK: Record<ModuleScope, number> = {
  matchup: 0,
  deck: 1,
  strategy: 2,
  format: 3,
};

const emptyScopeCounts = (): Record<ModuleScope, number> => ({
  matchup: 0,
  deck: 0,
  strategy: 0,
  format: 0,
});

interface DeckAccumulator {
  decisions: number;
  byClass: Record<AttributionClass, number>;
  byNarrowedScope: Record<ModuleScope, number>;
  byModule: Map<string, number>;
  byPhase: Map<string, SliceCounts>;
  byActionType: Map<string, SliceCounts>;
  bySurface: Map<string, SliceCounts>;
  /** Every module id seen deciding, including each part of a combined id. */
  contributors: Set<string>;
}

/**
 * Accumulates attribution counters as decisions arrive.
 *
 * Counters rather than rows: a 2100-game run makes roughly 380,000 decisions,
 * and every question this answers is a share. Counters are also why the census
 * shards -- `merge` is addition, so a worker's partial census is a partial sum
 * rather than a partial answer.
 */
export class AttributionCensus {
  readonly #decks = new Map<BenchmarkDeckId, DeckAccumulator>();
  readonly #scopes: Map<string, ModuleScope>;

  constructor(scopes: Map<string, ModuleScope> = moduleScopes()) {
    this.#scopes = scopes;
  }

  observe(decision: BenchmarkDecision): void {
    const deck = this.#deck(decision.deck);
    deck.decisions += 1;
    const classification = this.classify(
      decision.moduleId,
      decision.narrowedBy,
    );
    deck.byClass[classification] += 1;
    // Only a decision no module touched at all counts as a fallthrough. A
    // `rank`-only policy that narrowed the candidates did its job.
    const isGeneric = classification === "generic";
    if (classification === "narrowed")
      deck.byNarrowedScope[this.narrowestScope(decision.narrowedBy)] += 1;
    if (decision.moduleId !== undefined) {
      deck.byModule.set(
        decision.moduleId,
        (deck.byModule.get(decision.moduleId) ?? 0) + 1,
      );
      for (const part of decision.moduleId.split("+"))
        deck.contributors.add(part);
    }
    for (const id of decision.narrowedBy) deck.contributors.add(id);
    const isForced = decision.candidates < 2;
    bump(deck.byPhase, decision.phase, isGeneric, isForced);
    bump(deck.byActionType, decision.actionType, isGeneric, isForced);
    bump(
      deck.bySurface,
      `${decision.phase}:${decision.actionType}`,
      isGeneric,
      isForced,
    );
  }

  /**
   * The class of one recorded `moduleId`.
   *
   * An id absent from the registry classifies as `format` rather than throwing:
   * a module can be constructed outside `registerPolicy` -- the DON!! lookahead
   * and sequencing modules are, when a runner enables them -- and a census that
   * refused to run for that reason would be less useful than one that puts the
   * decision in its widest class.
   */
  classify(
    moduleId: string | undefined,
    narrowedBy: readonly string[] = [],
  ): AttributionClass {
    if (moduleId === undefined)
      return narrowedBy.length > 0 ? "narrowed" : "generic";
    let narrowest: ModuleScope = "format";
    for (const part of moduleId.split("+")) {
      const scope = this.#scopes.get(part);
      if (scope && SCOPE_RANK[scope] < SCOPE_RANK[narrowest]) narrowest = scope;
    }
    return narrowest;
  }

  /** The narrowest scope among a set of module ids. */
  narrowestScope(ids: readonly string[]): ModuleScope {
    let narrowest: ModuleScope = "format";
    for (const id of ids) {
      const scope = this.#scopes.get(id);
      if (scope && SCOPE_RANK[scope] < SCOPE_RANK[narrowest]) narrowest = scope;
    }
    return narrowest;
  }

  /** Folds another census in place. Addition, per counter. */
  merge(other: AttributionCensus): void {
    for (const [deckId, source] of other.#decks) {
      const target = this.#deck(deckId);
      target.decisions += source.decisions;
      for (const key of ATTRIBUTION_CLASSES)
        target.byClass[key] += source.byClass[key];
      for (const key of SCOPES)
        target.byNarrowedScope[key] += source.byNarrowedScope[key];
      for (const [id, count] of source.byModule)
        target.byModule.set(id, (target.byModule.get(id) ?? 0) + count);
      for (const [key, counts] of source.byPhase)
        add(target.byPhase, key, counts);
      for (const [key, counts] of source.byActionType)
        add(target.byActionType, key, counts);
      for (const [key, counts] of source.bySurface)
        add(target.bySurface, key, counts);
      for (const id of source.contributors) target.contributors.add(id);
    }
  }

  /** This census as plain data. See {@link CensusSnapshot}. */
  snapshot(): CensusSnapshot {
    return {
      decks: [...this.#decks.entries()].map(([deck, accumulator]) => ({
        deck,
        decisions: accumulator.decisions,
        byClass: { ...accumulator.byClass },
        byNarrowedScope: { ...accumulator.byNarrowedScope },
        byModule: sortedRecord(accumulator.byModule),
        byPhase: sortedSlices(accumulator.byPhase),
        byActionType: sortedSlices(accumulator.byActionType),
        bySurface: sortedSlices(accumulator.bySurface),
        contributors: [...accumulator.contributors].sort(),
      })),
    };
  }

  /** Folds a snapshot in, as {@link merge} folds a census. */
  absorb(snapshot: CensusSnapshot): void {
    for (const source of snapshot.decks) {
      const target = this.#deck(source.deck);
      target.decisions += source.decisions;
      for (const key of ATTRIBUTION_CLASSES)
        target.byClass[key] += source.byClass[key];
      for (const key of SCOPES)
        target.byNarrowedScope[key] += source.byNarrowedScope[key];
      for (const [id, count] of Object.entries(source.byModule))
        target.byModule.set(id, (target.byModule.get(id) ?? 0) + count);
      for (const [key, counts] of Object.entries(source.byPhase))
        add(target.byPhase, key, counts);
      for (const [key, counts] of Object.entries(source.byActionType))
        add(target.byActionType, key, counts);
      for (const [key, counts] of Object.entries(source.bySurface))
        add(target.bySurface, key, counts);
      for (const id of source.contributors) target.contributors.add(id);
    }
  }

  report(
    configuration: CensusReport["configuration"],
    rulesVersion: string,
  ): CensusReport {
    const decks = [...this.#decks.entries()]
      .map(([deck, accumulator]) => this.#deckReport(deck, accumulator))
      .sort(
        (left, right) =>
          genericShare(right) - genericShare(left) ||
          left.deck.localeCompare(right.deck),
      );
    const byClass = emptyClassCounts();
    let decisions = 0;
    for (const deck of decks) {
      decisions += deck.decisions;
      for (const key of ATTRIBUTION_CLASSES) byClass[key] += deck.byClass[key];
    }
    return {
      schemaVersion: CENSUS_SCHEMA_VERSION,
      rulesVersion,
      configuration,
      totals: { decisions, byClass },
      decks,
    };
  }

  #deckReport(deck: BenchmarkDeckId, accumulator: DeckAccumulator): DeckCensus {
    const leader = requireSupportedDeck(deck).leader;
    const silentModules = policiesForDeck(leader)
      .map((module) => module.id)
      .filter((id) => !accumulator.contributors.has(id))
      .sort();
    return {
      deck,
      leader,
      decisions: accumulator.decisions,
      byClass: { ...accumulator.byClass },
      byNarrowedScope: { ...accumulator.byNarrowedScope },
      byModule: sortedRecord(accumulator.byModule),
      byPhase: sortedSlices(accumulator.byPhase),
      byActionType: sortedSlices(accumulator.byActionType),
      bySurface: sortedSlices(accumulator.bySurface),
      silentModules,
    };
  }

  #deck(deck: BenchmarkDeckId): DeckAccumulator {
    const existing = this.#decks.get(deck);
    if (existing) return existing;
    const created: DeckAccumulator = {
      decisions: 0,
      byClass: emptyClassCounts(),
      byNarrowedScope: emptyScopeCounts(),
      byModule: new Map(),
      bySurface: new Map(),
      byPhase: new Map(),
      byActionType: new Map(),
      contributors: new Set(),
    };
    this.#decks.set(deck, created);
    return created;
  }
}

/**
 * Share of a deck's decisions that no registered module touched -- neither
 * decided nor narrowed. This is the gap: the generic ladder answering alone.
 */
export function genericShare(deck: DeckCensus): number {
  return deck.decisions === 0 ? 0 : deck.byClass.generic / deck.decisions;
}

/** Share where a module narrowed the candidates but did not own the choice. */
export function narrowedShare(deck: DeckCensus): number {
  return deck.decisions === 0 ? 0 : deck.byClass.narrowed / deck.decisions;
}

/**
 * Share of a deck's decisions its own policy shaped -- decided outright, or
 * narrowed to the candidates something else then chose from.
 *
 * The two are one number here because they are one question: was there a rule
 * written for *this deck* at this decision? `byClass` and `byNarrowedScope`
 * separate them for anyone who needs to know which.
 */
export function deckPolicyShare(deck: DeckCensus): number {
  return deck.decisions === 0
    ? 0
    : (deck.byClass.deck +
        deck.byClass.matchup +
        deck.byNarrowedScope.deck +
        deck.byNarrowedScope.matchup) /
        deck.decisions;
}

/** Share shaped only by rules shared with other decks: strategy or format. */
export function sharedRuleShare(deck: DeckCensus): number {
  return deck.decisions === 0
    ? 0
    : (deck.byClass.strategy +
        deck.byClass.format +
        deck.byNarrowedScope.strategy +
        deck.byNarrowedScope.format) /
        deck.decisions;
}

function bump(
  slices: Map<string, SliceCounts>,
  key: string,
  isGeneric: boolean,
  isForced: boolean,
): void {
  const existing = slices.get(key) ?? emptySlice();
  existing.decisions += 1;
  if (isGeneric && !isForced) existing.generic += 1;
  if (isForced) existing.forced += 1;
  slices.set(key, existing);
}

const emptySlice = (): SliceCounts => ({
  decisions: 0,
  generic: 0,
  forced: 0,
});

function add(
  slices: Map<string, SliceCounts>,
  key: string,
  counts: SliceCounts,
): void {
  const existing = slices.get(key) ?? emptySlice();
  existing.decisions += counts.decisions;
  existing.generic += counts.generic;
  existing.forced += counts.forced;
  slices.set(key, existing);
}

/**
 * Records with keys in a fixed order.
 *
 * Insertion order of a `Map` filled during play depends on which game happened
 * to reach a phase first, so serialising it directly would make two runs of the
 * same configuration produce different bytes for the same counts.
 */
function sortedRecord(counts: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...counts.entries()].sort((left, right) =>
      left[0].localeCompare(right[0]),
    ),
  );
}

function sortedSlices(
  counts: Map<string, SliceCounts>,
): Record<string, SliceCounts> {
  return Object.fromEntries(
    [...counts.entries()].sort((left, right) =>
      left[0].localeCompare(right[0]),
    ),
  );
}
