import { describe, expect, it } from "vitest";
import {
  AttributionCensus,
  deckPolicyShare,
  genericShare,
  sharedRuleShare,
  type CensusReport,
} from "../packages/cli/src/attribution-census.js";
import { moduleScopes } from "@one-piece-sim/agents/local";
import type {
  BenchmarkDecision,
  BenchmarkDeckId,
} from "../packages/cli/src/deck-benchmark.js";

const DECK = "(Green) Roronoa Zoro - Starter Deck 32" as BenchmarkDeckId;
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31" as BenchmarkDeckId;

/** A scope table that does not depend on what happens to be registered. */
const scopes = new Map(
  Object.entries({
    "matchup-rule": "matchup",
    st32: "deck",
    "strategy:aggro#press": "strategy",
    "counter-budget": "format",
  }) as [
    string,
    ReturnType<typeof moduleScopes> extends Map<string, infer V> ? V : never,
  ][],
);

function decision(
  overrides: Partial<BenchmarkDecision> = {},
): BenchmarkDecision {
  return {
    deck: DECK,
    opponentDeck: OPPONENT,
    seat: "p1",
    phase: "main",
    actionType: "play-card",
    moduleId: undefined,
    narrowedBy: [],
    candidates: 2,
    ...overrides,
  };
}

const configuration: CensusReport["configuration"] = {
  mode: "all-vs-all",
  decks: [DECK, OPPONENT],
  seedsPerMatchup: 1,
  seedPrefix: "test",
  maxActions: 800,
};

const only = (report: CensusReport) => report.decks[0]!;

describe("attribution classification", () => {
  it("separates a decision no module touched from one a rank module narrowed", () => {
    const census = new AttributionCensus(scopes);
    expect(census.classify(undefined, [])).toBe("generic");
    // The bug this instrument shipped with: a `rank`-only deck policy hides
    // every candidate but its preferred line and leaves the choice to
    // `chooseGenericRules`, which reports no module. Counting that as "no rule"
    // made Blue/Yellow Nami read as unpiloted.
    expect(census.classify(undefined, ["st32"])).toBe("narrowed");
  });

  it("classifies a decided decision at the module's registered scope", () => {
    const census = new AttributionCensus(scopes);
    expect(census.classify("st32")).toBe("deck");
    expect(census.classify("matchup-rule")).toBe("matchup");
    expect(census.classify("strategy:aggro#press")).toBe("strategy");
    expect(census.classify("counter-budget")).toBe("format");
  });

  it("classifies a combined score decision at its narrowest contributor", () => {
    const census = new AttributionCensus(scopes);
    expect(census.classify("counter-budget+st32")).toBe("deck");
    expect(census.classify("counter-budget+strategy:aggro#press")).toBe(
      "strategy",
    );
  });

  it("puts an unregistered module in the widest class rather than throwing", () => {
    const census = new AttributionCensus(scopes);
    expect(census.classify("don-lookahead")).toBe("format");
  });

  it("credits a deck's own rules for narrowing as well as deciding", () => {
    const census = new AttributionCensus(scopes);
    census.observe(decision({ moduleId: "st32" }));
    census.observe(decision({ narrowedBy: ["st32"] }));
    census.observe(decision({ narrowedBy: ["counter-budget"] }));
    census.observe(decision());
    const deck = only(census.report(configuration, "test"));
    expect(deck.decisions).toBe(4);
    // Decided by st32, plus narrowed by st32: both are a rule written for this
    // deck being present at the decision.
    expect(deckPolicyShare(deck)).toBeCloseTo(0.5);
    expect(sharedRuleShare(deck)).toBeCloseTo(0.25);
    expect(genericShare(deck)).toBeCloseTo(0.25);
  });

  it("counts only untouched decisions as the fallthrough, per phase", () => {
    const census = new AttributionCensus(scopes);
    census.observe(decision({ phase: "counter" }));
    census.observe(decision({ phase: "counter", narrowedBy: ["st32"] }));
    census.observe(decision({ phase: "main", moduleId: "st32" }));
    const deck = only(census.report(configuration, "test"));
    expect(deck.byPhase.counter).toEqual({
      decisions: 2,
      generic: 1,
      forced: 0,
    });
    expect(deck.byPhase.main).toEqual({
      decisions: 1,
      generic: 0,
      forced: 0,
    });
  });
});

describe("silent modules", () => {
  it("does not call a module silent for narrowing rather than deciding", () => {
    const census = new AttributionCensus(scopes);
    census.observe(decision({ narrowedBy: ["st32"] }));
    const deck = only(census.report(configuration, "test"));
    expect(deck.silentModules).not.toContain("st32");
  });

  it("names a module registered for the deck that never appears", () => {
    const census = new AttributionCensus(scopes);
    census.observe(decision({ moduleId: "st32" }));
    const deck = only(census.report(configuration, "test"));
    // Whatever else is registered for ST32's Leader, `st32` itself decided, so
    // it is the one module that cannot be silent.
    expect(deck.silentModules).not.toContain("st32");
    expect(deck.silentModules).toEqual([...deck.silentModules].sort());
  });
});

describe("sharding", () => {
  /**
   * The claim `tools/attribution-census.ts` makes for `--jobs`: a worker
   * aggregates its own counters and the parent adds them, so the split cannot
   * change the numbers.
   */
  it("merges shard snapshots into the single-process result exactly", () => {
    const decisions = [
      decision({ moduleId: "st32", phase: "main" }),
      decision({ narrowedBy: ["counter-budget"], phase: "counter" }),
      decision({ phase: "counter", actionType: "pass" }),
      decision({ moduleId: "counter-budget+st32", phase: "block" }),
      decision({ deck: OPPONENT, opponentDeck: DECK, moduleId: "st32" }),
    ];

    const whole = new AttributionCensus(scopes);
    for (const entry of decisions) whole.observe(entry);

    const first = new AttributionCensus(scopes);
    const second = new AttributionCensus(scopes);
    decisions.forEach((entry, index) => {
      (index % 2 === 0 ? first : second).observe(entry);
    });
    const merged = new AttributionCensus(scopes);
    merged.absorb(first.snapshot());
    merged.absorb(second.snapshot());

    expect(merged.report(configuration, "test")).toEqual(
      whole.report(configuration, "test"),
    );
  });

  it("survives a snapshot round trip through JSON, as IPC does", () => {
    const census = new AttributionCensus(scopes);
    census.observe(decision({ moduleId: "st32" }));
    census.observe(decision({ narrowedBy: ["st32", "counter-budget"] }));
    const restored = new AttributionCensus(scopes);
    restored.absorb(
      JSON.parse(JSON.stringify(census.snapshot())) as ReturnType<
        AttributionCensus["snapshot"]
      >,
    );
    expect(restored.report(configuration, "test")).toEqual(
      census.report(configuration, "test"),
    );
  });
});

describe("report shape", () => {
  it("ranks the least-piloted deck first", () => {
    const census = new AttributionCensus(scopes);
    census.observe(decision({ moduleId: "st32" }));
    census.observe(decision({ deck: OPPONENT, opponentDeck: DECK }));
    const report = census.report(configuration, "test");
    expect(report.decks.map((deck) => deck.deck)).toEqual([OPPONENT, DECK]);
    expect(report.totals.decisions).toBe(2);
  });

  it("orders serialised keys so two runs produce the same bytes", () => {
    const forwards = new AttributionCensus(scopes);
    const backwards = new AttributionCensus(scopes);
    const phases = ["main", "counter", "block"];
    for (const phase of phases) forwards.observe(decision({ phase }));
    for (const phase of [...phases].reverse())
      backwards.observe(decision({ phase }));
    expect(JSON.stringify(forwards.report(configuration, "test"))).toBe(
      JSON.stringify(backwards.report(configuration, "test")),
    );
  });
});

describe("forced moves", () => {
  it("counts a single-candidate decision separately from a real one", () => {
    // Every attack against a seat raises a block decision whether or not it
    // holds a [Blocker], so a coverage figure that counts them describes the
    // engine rather than the policy.
    const census = new AttributionCensus(scopes);
    census.observe(decision({ phase: "block", candidates: 1 }));
    census.observe(decision({ phase: "block", candidates: 2 }));
    const deck = only(census.report(configuration, "test"));

    expect(deck.byPhase.block).toEqual({
      decisions: 2,
      generic: 1,
      forced: 1,
    });
  });

  it("keeps the unpiloted share a share, with every move forced", () => {
    // `generic` is read as a fraction of `decisions - forced`, so a forced move
    // counted in the numerator and not the denominator printed shares above
    // 100% -- `'8253.3% of 30'` for one deck's block phase, which made the
    // column unreadable rather than merely wrong.
    const census = new AttributionCensus(scopes);
    for (let index = 0; index < 5; index += 1) {
      census.observe(decision({ phase: "block", candidates: 1 }));
    }
    const block = only(census.report(configuration, "test")).byPhase.block;

    expect(block).toEqual({ decisions: 5, generic: 0, forced: 5 });
  });

  it("keys the decision surface by phase and action type", () => {
    const census = new AttributionCensus(scopes);
    census.observe(decision({ phase: "main", actionType: "resolve-effect" }));
    census.observe(decision({ phase: "main", actionType: "resolve-effect" }));
    census.observe(decision({ phase: "main", actionType: "attack" }));
    const deck = only(census.report(configuration, "test"));

    expect(deck.bySurface["main:resolve-effect"]?.decisions).toBe(2);
    expect(deck.bySurface["main:attack"]?.decisions).toBe(1);
  });
});
