import { describe, expect, it } from "vitest";
import {
  BUILT_IN_STRATEGY_PROFILES,
  compileProfile,
  DEFAULT_STRATEGY_PARAMS,
  LEADERS,
  leadersWithPattern,
  patternOf,
  policiesForDeck,
  prefer,
  registerStrategyProfile,
  resolveProfile,
  strategyProfile,
  type StrategyParams,
} from "@one-piece-sim/agents/local";

/**
 * The inheritance mechanism, tested without a game.
 *
 * These are the tests that make the hierarchy safe to extend: they pin what
 * "extends" *means* -- chain order, whose parameters win, and which layer's rules
 * see the merged set -- so a later profile cannot quietly change the semantics
 * for every profile above it.
 */
/** Every key a compiled profile module is allowed to carry. */
const TIERS = new Set(["id", "rank", "veto"]);

describe("strategy profiles", () => {
  it("resolves a chain root-first", () => {
    const { chain } = resolveProfile("red-aggro-luffy-st31");
    expect(chain.map((profile) => profile.id)).toEqual([
      "aggro",
      "red-aggro",
      "red-aggro-luffy-st31",
    ]);
  });

  it("merges parameters child-over-parent, over the root defaults", () => {
    const { params } = resolveProfile("red-aggro-luffy-st31");
    // From the root defaults, untouched by any layer.
    expect(params.raceAbandonMargin).toBe(
      DEFAULT_STRATEGY_PARAMS.raceAbandonMargin,
    );
    // Set by `aggro` against the format's default of 2.
    expect(params.leaderCounterBudget).toBe(1);
    // Set by `red-aggro`, overriding `aggro`'s 6.
    expect(params.targetCloseTurn).toBe(5);
    expect(params.targetBoardWidth).toBe(4);
    // The deck profile overrides nothing, so `aggro`'s value survives two levels
    // of inheritance. It used to set `lifeFloor: 1`; that was an unmeasured guess
    // and widening that rule's window costs ST31 games.
    expect(params.lifeFloor).toBe(2);
    expect(strategyProfile("red-aggro-luffy-st31")?.params).toBeUndefined();
  });

  it("hands a parent's rules the merged parameters, not its own", () => {
    // This is the whole point of parameters-as-inheritance: a child retunes a
    // parent's behaviour without restating one of its rules. If the parent saw
    // only its own params, an override would be silently inert.
    let seen: StrategyParams | undefined;
    registerStrategyProfile({
      id: "test-parent",
      summary: "records what it was given",
      params: { lifeFloor: 9 },
      rules: (params) => {
        seen = params;
        return [prefer("noop").play(() => false)];
      },
    });
    registerStrategyProfile({
      id: "test-child",
      extends: "test-parent",
      summary: "overrides it",
      params: { lifeFloor: 4 },
    });
    compileProfile("test-child");
    expect(seen?.lifeFloor).toBe(4);
  });

  it("compiles one module per layer that has rules", () => {
    // `red-aggro-luffy-st31` carries parameter overrides only, so it contributes
    // no module of its own -- and `--disable` never names a module that could not
    // have done anything.
    expect(compileProfile("red-aggro-luffy-st31").map((m) => m.id)).toEqual([
      "strategy:aggro#press-leader",
      "strategy:aggro#counter-budget",
      "strategy:aggro#board-width",
      "strategy:aggro#don-threshold",
      "strategy:aggro#keep-attacking",
      "strategy:aggro#stabilise",
      "strategy:red-aggro#prefer-rush",
      "strategy:red-aggro#press-unless-lost",
      "strategy:red-aggro#no-late-development",
    ]);
    // The two profiles that exist only to claim a Leader's pattern compile to
    // nothing at all, which is what makes claiming an unmeasurable deck free.
    expect(compileProfile("midrange-unenrolled")).toEqual([]);
    expect(compileProfile("control-unenrolled")).toEqual([]);
  });

  it("never contributes a `decide`, so a deck policy keeps the final say", () => {
    // The contract that makes this layer safe to add to a package whose deck
    // policies are whole-turn ladders: every layer narrows, none replaces.
    for (const profile of BUILT_IN_STRATEGY_PROFILES) {
      for (const module of compileProfile(profile.id)) {
        // Asserted on the *keys*, not on the values: `heuristics()` builds the
        // module with conditional spreads, so a tier it does not implement is
        // absent rather than undefined -- and reading a method off its object to
        // compare it is what `@typescript-eslint/unbound-method` exists to stop.
        const tiers = Object.keys(module);
        expect(tiers, `${module.id} must not decide`).not.toContain("decide");
        expect(tiers, `${module.id} must not claim`).not.toContain("owns");
        expect(tiers.every((tier) => TIERS.has(tier))).toBe(true);
      }
    }
  });

  it("rejects an unknown parent rather than truncating the chain", () => {
    registerStrategyProfile({
      id: "test-orphan",
      extends: "nobody",
      summary: "has no parent",
    });
    expect(() => resolveProfile("test-orphan")).toThrow(
      "UNKNOWN_STRATEGY_PROFILE",
    );
  });

  it("agrees with the Leader pattern table for every Leader it claims", () => {
    // `strategy/patterns.ts` is the authority, because deriving it from the
    // profiles would make `archetypeOf` depend on an import cycle. This is the
    // check that keeps the two from drifting apart.
    for (const profile of BUILT_IN_STRATEGY_PROFILES) {
      if (profile.pattern === undefined) continue;
      for (const leader of profile.leaders ?? []) {
        expect(patternOf(leader), `${leader} via ${profile.id}`).toBe(
          profile.pattern,
        );
      }
    }
  });

  it("claims every Leader in the format exactly once", () => {
    const claims = BUILT_IN_STRATEGY_PROFILES.flatMap(
      (profile) => profile.leaders ?? [],
    );
    expect(new Set(claims).size).toBe(claims.length);
    for (const leader of Object.values(LEADERS)) {
      expect(claims, `${leader} has no strategy profile`).toContain(leader);
    }
  });

  it("claims every Leader the pattern table declares", () => {
    // The other direction of the same cross-check, and the one that was
    // missing. Running it only from the profiles to the table let OP14-020
    // Mihawk sit in `patterns.ts` with a reasoned "control" entry and no
    // profile claiming it, so the deck piloted itself on the format
    // fundamentals alone while looking, from the table, like a declared deck.
    // `LEADERS` above cannot catch that: it lists the format Leaders, and every
    // deck this misses is by definition outside the format.
    const claims = new Set(
      BUILT_IN_STRATEGY_PROFILES.flatMap((profile) => profile.leaders ?? []),
    );
    for (const leader of leadersWithPattern()) {
      expect([...claims], `${leader} has a pattern but no profile`).toContain(
        leader,
      );
    }
  });

  it("registers the compiled layers against the decks that pilot them", () => {
    const ids = policiesForDeck(LEADERS.ST31).map((module) => module.id);
    expect(ids).toContain("strategy:aggro#press-leader");
    expect(ids).toContain("strategy:red-aggro#prefer-rush");
    // A control deck gets neither of the aggro layers, and gets its own two:
    // the `control` root plus the deck profile that knows what its answers do.
    const st33 = policiesForDeck(LEADERS.ST33).map((module) => module.id);
    expect(st33).not.toContain("strategy:aggro#press-leader");
    expect(st33).toContain("strategy:control#preserve-life");
    expect(st33).toContain("strategy:control-kuzan-st33#stop-the-attacker");
    // And a deck outside the measured format is claimed without inheriting
    // anything, which is the whole point of the `*-unmeasured` profiles.
    expect(
      policiesForDeck(LEADERS.NAMI).filter((module) =>
        module.id.startsWith("strategy:"),
      ),
    ).toEqual([]);
    // ST32 goes through its own deck profile, which restores the broad
    // no-development rule the archetype narrowed.
    expect(policiesForDeck(LEADERS.ST32).map((module) => module.id)).toContain(
      "strategy:red-aggro-zoro-st32#no-development-in-kill-range",
    );
  });

  it("builds a fresh module per agent, so the Tactics cache cannot leak", () => {
    // `heuristics()` memoises the derived `Tactics` under `gameId:revision`, and
    // both seats of a game observe the same revision during a Counter step. A
    // shared instance would hand one seat the other's position -- which is the
    // failure the registry's factory contract exists for.
    const [first] = policiesForDeck(LEADERS.ST31).filter((module) =>
      module.id.startsWith("strategy:"),
    );
    const [second] = policiesForDeck(LEADERS.ST31).filter((module) =>
      module.id.startsWith("strategy:"),
    );
    expect(first).toBeDefined();
    expect(first).not.toBe(second);
  });

  it("names every rule, so each is addressable by --disable", () => {
    // An unnamed rule is measurable only by its position in its profile's list,
    // which changes the moment a rule is inserted above it. The layer-level
    // module id is the fallback, and its presence here means a rule went
    // unnamed.
    for (const profile of BUILT_IN_STRATEGY_PROFILES) {
      const ids = compileProfile(profile.id).map((module) => module.id);
      expect(ids.filter((id) => !id.includes("#"))).toEqual([]);
    }
  });

  it("names every built-in profile with a summary", () => {
    for (const profile of BUILT_IN_STRATEGY_PROFILES) {
      expect(strategyProfile(profile.id)).toBe(profile);
      expect(profile.summary.length).toBeGreaterThan(0);
    }
  });
});
