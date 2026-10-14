import { describe, expect, it } from "vitest";
import {
  avoid,
  chooseGenericRules,
  decideModule,
  heuristics,
  mustAct,
  policyContext,
  prefer,
  preferAmong,
  resolveWithModules,
  tactics,
  type Heuristic,
  type PolicyModule,
} from "@one-piece-sim/agents/local";
import {
  applyAction,
  createGame,
  getLegalActions,
  observe,
  toGameAction,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";

/**
 * Drives a real game to the first state where the active player is offered more
 * than one `play-card`, so the ranking tier is exercised against genuine legal
 * actions rather than a hand-built observation.
 */
function firstMultiPlayState(
  p1Deck: string,
  p2Deck: string,
  seed: string,
): GameObservation {
  let state: GameState = createGame({
    gameId: "heuristics-1",
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed,
  });
  for (let step = 0; step < 400; step += 1) {
    const seat = state.activePlayer;
    const actions = getLegalActions(state, seat);
    const plays = actions.filter((action) => action.type === "play-card");
    if (plays.length > 1) return observe(state, seat);
    const next = actions[0];
    if (!next || state.phase === "finished") break;
    state = applyAction(state, toGameAction(next, state.revision)).state;
  }
  throw new Error("no multi-play decision point found");
}

const alwaysPlaysFirst: PolicyModule = decideModule("greedy", (observation) => {
  const play = observation.legalActions.find(
    (action) => action.type === "play-card",
  );
  return play ? { action: play, reasons: ["First offered play."] } : undefined;
});

describe("heuristic ranking", () => {
  const observation = firstMultiPlayState(
    "(Red) Monkey.D.Luffy - Starter Deck 31",
    "(Blue) Kuzan - Starter Deck 33",
    "heuristics-seed-1",
  );

  it("finds a decision point with several plays on the table", () => {
    expect(
      observation.legalActions.filter((action) => action.type === "play-card")
        .length,
    ).toBeGreaterThan(1);
  });

  it("narrows a decide module to the preferred play without replacing it", () => {
    const costs = new Map(
      observation.self.hand.map((card) => [card.instanceId, card.cost]),
    );
    const plays = observation.legalActions.filter(
      (action) => action.type === "play-card",
    );
    const dearest = Math.max(
      ...plays.map((action) => costs.get(action.cardInstanceId) ?? 0),
    );

    const ranked = resolveWithModules(observation, [
      heuristics("test", [
        prefer("commit the most DON!! available").play((card) => card.cost),
      ]),
      alwaysPlaysFirst,
    ]);

    expect(ranked.action.type).toBe("play-card");
    // The decide module still made the call, but only saw the top-ranked plays.
    expect(ranked.moduleId).toBe("greedy");
    if (ranked.action.type !== "play-card") throw new Error("wrong type");
    expect(costs.get(ranked.action.cardInstanceId)).toBe(dearest);
    expect(ranked.reasons).toContain("commit the most DON!! available");
  });

  it("is a no-op when no rule has an opinion", () => {
    const plain = resolveWithModules(observation, [alwaysPlaysFirst]);
    const withInertRules = resolveWithModules(observation, [
      heuristics("inert", [
        prefer("never applies")
          .when(() => false)
          .play(() => true),
      ]),
      alwaysPlaysFirst,
    ]);
    expect(withInertRules.action.actionId).toBe(plain.action.actionId);
  });

  it("leaves other action types untouched", () => {
    const before = observation.legalActions.filter(
      (action) => action.type !== "play-card",
    );
    const seen: string[] = [];
    const spy: PolicyModule = {
      id: "spy",
      decide: (context) => {
        seen.push(...context.actions.map((action) => action.type));
        return undefined;
      },
    };
    resolveWithModules(observation, [
      heuristics("test", [prefer("dearest").play((card) => card.cost)]),
      spy,
      alwaysPlaysFirst,
    ]);
    for (const action of before) expect(seen).toContain(action.type);
  });

  it("keeps the least-bad candidate when every option is discouraged", () => {
    const decision = resolveWithModules(observation, [
      heuristics("test", [avoid("everything is bad").play(() => true)]),
      alwaysPlaysFirst,
    ]);
    // All plays score the same negative value, so nothing is hidden.
    expect(decision.action.type).toBe("play-card");
  });

  it("preferAmong orders the candidates it scored and hides nothing else", () => {
    // The distinction the tier exists for. A `prefer` rule that names some
    // candidates and stays silent on the rest reads that silence as a score of
    // 0 and hides them; `preferAmong` compares only what it scored.
    const costs = new Map(
      observation.self.hand.map((card) => [card.instanceId, card.cost]),
    );
    const plays = observation.legalActions.filter(
      (action) => action.type === "play-card",
    );
    const cheapest = Math.min(
      ...plays.map((action) => costs.get(action.cardInstanceId) ?? 0),
    );
    const named = plays.filter(
      (action) => (costs.get(action.cardInstanceId) ?? 0) === cheapest,
    );
    expect(named.length).toBeLessThan(plays.length);

    const seenByChooser: string[] = [];
    const spy: PolicyModule = {
      id: "spy",
      decide: (context) => {
        seenByChooser.push(
          ...context.actions
            .filter((action) => action.type === "play-card")
            .map((action) => action.actionId),
        );
        return undefined;
      },
    };

    resolveWithModules(observation, [
      heuristics("among", [
        preferAmong("only compare the cheapest plays").play((card) =>
          card.cost === cheapest ? 1 : false,
        ),
      ]),
      spy,
      alwaysPlaysFirst,
    ]);

    // Every play is still on the table: the rule scored one group and had no
    // opinion about the others, so the others are untouched.
    for (const play of plays) expect(seenByChooser).toContain(play.actionId);
  });

  it("prefer, on the same rule, hides every candidate it did not name", () => {
    // The counterpart of the test above, pinning the behaviour `preferAmong`
    // exists to offer an alternative to rather than to replace.
    const costs = new Map(
      observation.self.hand.map((card) => [card.instanceId, card.cost]),
    );
    const plays = observation.legalActions.filter(
      (action) => action.type === "play-card",
    );
    const cheapest = Math.min(
      ...plays.map((action) => costs.get(action.cardInstanceId) ?? 0),
    );

    const seenByChooser: string[] = [];
    const spy: PolicyModule = {
      id: "spy",
      decide: (context) => {
        seenByChooser.push(
          ...context.actions
            .filter((action) => action.type === "play-card")
            .map((action) => action.actionId),
        );
        return undefined;
      },
    };

    resolveWithModules(observation, [
      heuristics("whitelist", [
        prefer("only the cheapest plays").play((card) =>
          card.cost === cheapest ? 1 : false,
        ),
      ]),
      spy,
      alwaysPlaysFirst,
    ]);

    const dearer = plays.filter(
      (action) => (costs.get(action.cardInstanceId) ?? 0) !== cheapest,
    );
    for (const play of dearer) {
      expect(seenByChooser).not.toContain(play.actionId);
    }
  });

  it("preferAmong still picks the best of the group it scored", () => {
    const costs = new Map(
      observation.self.hand.map((card) => [card.instanceId, card.cost]),
    );
    const plays = observation.legalActions.filter(
      (action) => action.type === "play-card",
    );
    const dearest = Math.max(
      ...plays.map((action) => costs.get(action.cardInstanceId) ?? 0),
    );

    const decision = resolveWithModules(observation, [
      // Scores every play, so the subset is the whole group and the tier
      // behaves exactly as `prefer` would.
      heuristics("among-all", [
        preferAmong("commit the most DON!! available").play(
          (card) => card.cost,
        ),
      ]),
      alwaysPlaysFirst,
    ]);

    if (decision.action.type !== "play-card") throw new Error("wrong type");
    expect(costs.get(decision.action.cardInstanceId)).toBe(dearest);
  });

  it("never hides pass", () => {
    const decision = resolveWithModules(observation, [
      heuristics("test", [
        prefer("anything at all").action((action) =>
          action.type === "play-card" ? 5 : false,
        ),
      ]),
      {
        id: "passer",
        decide: (context) => {
          const passAction = context.actions.find(
            (action) => action.type === "pass",
          );
          return passAction
            ? { action: passAction, reasons: ["Pass."] }
            : undefined;
        },
      },
    ]);
    expect(decision.action.type).toBe("pass");
  });
});

describe("tactics vocabulary", () => {
  const observation = firstMultiPlayState(
    "(Red) Monkey.D.Luffy - Starter Deck 31",
    "(Blue) Kuzan - Starter Deck 33",
    "heuristics-seed-1",
  );
  const t = tactics(observation);

  it("prices Counter demand with the attacker winning ties", () => {
    // A 5000 attack into a 5000 defender still connects, so the defender needs
    // to exceed, not match.
    expect(t.counterDemand(5_000, 5_000)).toBe(1);
    expect(t.counterDemand(7_000, 5_000)).toBe(2_001);
    expect(t.counterDemand(4_000, 5_000)).toBe(0);
  });

  it("prices attacks in Counter cards rather than power", () => {
    expect(t.counterCardsNeeded(t.counterDemand(5_000, 5_000))).toBe(1);
    expect(t.counterCardsNeeded(t.counterDemand(6_000, 5_000))).toBe(1);
    // 7000 into a 5000 Leader needs 2001, which no single Counter card covers.
    expect(t.counterCardsNeeded(t.counterDemand(7_000, 5_000))).toBe(2);
    expect(t.counterCardsNeeded(0)).toBe(0);
  });

  it("joins the hand with printed card facts", () => {
    expect(t.hand).toHaveLength(observation.self.hand.length);
    for (const card of t.hand) {
      expect(card.facts.cardNumber).toBe(card.cardNumber);
    }
    expect(t.counterPower).toBe(
      observation.self.hand.reduce((total, card) => total + card.counter, 0),
    );
  });
});

describe("the veto tier resolves development first", () => {
  /**
   * The deadlock this ordering exists to break, in its smallest form.
   *
   * `never` rules are collected in one subtractive pass, so a rule that hides
   * an attachment in order to promote a play cannot see that the play is
   * already vetoed by someone else. Both candidates go and the ladder falls
   * through to whatever is next -- which is how the seat in
   * `open-optcg-trace(19).jsonl` swung its Leader at 5000 while holding the
   * DON!! that would have made it 6000.
   *
   * Written with two synthetic modules rather than the real pair, because what
   * is being pinned is the resolver's ordering rather than either rule's
   * judgement. `format-heuristics.test.ts` drives the real
   * `stage-replacement` x `don-reservation` position.
   */
  const observation = firstMultiPlayState(
    "(Red) Monkey.D.Luffy - Starter Deck 31",
    "(Blue) Kuzan - Starter Deck 33",
    "heuristics-seed-1",
  );

  /** Hides every play, the way a Stage-over-itself or full-board rule does. */
  const noPlays: PolicyModule = {
    id: "no-plays",
    veto: (_context, action) =>
      action.type === "play-card" ? "no play is worth making" : undefined,
  };

  /** Hides every attachment *because* a play is available, and only then. */
  const developFirst: PolicyModule = {
    id: "develop-first",
    veto: (context, action) =>
      action.type === "attach-don" &&
      tactics(context.observation).affordablePlays.length > 0
        ? "develop before powering up"
        : undefined,
  };

  const attachesOrPasses: PolicyModule = decideModule("chooser", (seen) => {
    const attach = seen.legalActions.find(
      (action) => action.type === "attach-don",
    );
    const passAction = seen.legalActions.find(
      (action) => action.type === "pass",
    );
    return attach
      ? { action: attach, reasons: ["Attach."] }
      : passAction
        ? { action: passAction, reasons: ["Nothing left."] }
        : undefined;
  });

  it("finds a position holding both a play and an attachment", () => {
    expect(
      observation.legalActions.some((action) => action.type === "attach-don"),
    ).toBe(true);
  });

  it("lets the attachment through once every play it reserved DON!! for is gone", () => {
    const decision = resolveWithModules(observation, [
      noPlays,
      developFirst,
      attachesOrPasses,
    ]);

    expect(decision.action.type).toBe("attach-don");
    expect(decision.narrowedBy).toContain("no-plays");
    // The rule that would have hidden it never fired: its premise was false
    // once the play vetoes had been applied.
    expect(decision.narrowedBy).not.toContain("develop-first");
  });

  it("still hides the attachment while a play actually survives", () => {
    const decision = resolveWithModules(observation, [
      developFirst,
      attachesOrPasses,
    ]);

    expect(decision.action.type).not.toBe("attach-don");
    expect(decision.narrowedBy).toContain("develop-first");
  });

  it("judges plays against the unnarrowed set, so the order cannot reverse", () => {
    // The ordering is only sound because no veto on a play asks whether an
    // attachment is available. A rule that did would see the original set.
    const seen: number[] = [];
    const countsAttachments: PolicyModule = {
      id: "counts-attachments",
      veto: (context, action) => {
        if (action.type !== "play-card") return undefined;
        seen.push(
          context.actions.filter((candidate) => candidate.type === "attach-don")
            .length,
        );
        return undefined;
      },
    };
    const offered = observation.legalActions.filter(
      (action) => action.type === "attach-don",
    ).length;

    resolveWithModules(observation, [
      countsAttachments,
      developFirst,
      attachesOrPasses,
    ]);

    expect(seen.length).toBeGreaterThan(0);
    for (const count of seen) expect(count).toBe(offered);
  });
});

/**
 * Plays one game under the generic ladder and keeps the first observation that
 * offered each kind of action, so a terminal can be checked against the real
 * shape of the decision it is for rather than against a hand-built action.
 */
function observationsByActionType(
  p1Deck: string,
  p2Deck: string,
  seed: string,
): Map<LegalAction["type"], GameObservation> {
  let state: GameState = createGame({
    gameId: "heuristics-terminals",
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed,
  });
  const found = new Map<LegalAction["type"], GameObservation>();
  for (let step = 0; step < 1_500; step += 1) {
    if (state.phase === "finished") break;
    const seat = state.activePlayer;
    const actions = getLegalActions(state, seat);
    if (actions.length === 0) break;
    const observation = observe(state, seat);
    for (const action of actions) {
      if (!found.has(action.type)) found.set(action.type, observation);
    }
    const next = chooseGenericRules(observation).action;
    state = applyAction(state, toGameAction(next, state.revision)).state;
  }
  return found;
}

describe("typed terminals", () => {
  const found = observationsByActionType(
    "(Red) Monkey.D.Luffy - Starter Deck 31",
    "(Blue) Kuzan - Starter Deck 33",
    "heuristics-seed-1",
  );

  /** Each terminal, keyed by the action type it narrows to. */
  const terminals: Partial<
    Record<LegalAction["type"], (rule: ReturnType<typeof prefer>) => Heuristic>
  > = {
    "play-card": (rule) => rule.play(() => true),
    attack: (rule) => rule.attack(() => true),
    "attach-don": (rule) => rule.attachDon(() => true),
    "activate-main": (rule) => rule.activate(() => true),
    "resolve-effect": (rule) => rule.effect(() => true),
    counter: (rule) => rule.counter(() => true),
    block: (rule) => rule.block(() => true),
    "resolve-trigger": (rule) => rule.trigger(() => true),
  };

  it("reaches a decision offering each kind of action the terminals cover", () => {
    // The sweep is seed-deterministic, so this pins which terminals the tests
    // below actually exercise rather than letting a missing one pass silently.
    for (const type of Object.keys(terminals))
      expect([...found.keys()]).toContain(type);
  });

  for (const [type, build] of Object.entries(terminals)) {
    it(`\`${type}\` scores only actions of its own type`, () => {
      const observation = found.get(type as LegalAction["type"]);
      if (!observation) throw new Error(`no decision offering ${type}`);
      const t = tactics(observation);
      const rule = build(prefer("typed"));
      // A pending effect or [Trigger] offers only its own options, so the
      // "leaves other types alone" half is exercised by the Main-phase
      // terminals, where plays, attacks, attachments and `pass` share a
      // decision.
      let scored = 0;
      for (const action of observation.legalActions) {
        const contribution = rule.contribute(t, action);
        if (action.type === type) {
          expect(contribution).toBe(10);
          scored += 1;
        } else {
          expect(contribution).toBeUndefined();
        }
      }
      expect(scored).toBeGreaterThan(0);
    });
  }

  it("hands the subject the narrowed action, so a card check needs no guard", () => {
    const observation = found.get("activate-main");
    if (!observation) throw new Error("no activation offered");
    const offered = observation.legalActions.find(
      (action) => action.type === "activate-main",
    );
    if (offered?.type !== "activate-main") throw new Error("wrong type");
    const t = tactics(observation);
    const rule = prefer("this card's ability").activate(
      (action) => action.sourceCardNumber === offered.sourceCardNumber,
    );
    expect(rule.contribute(t, offered)).toBe(10);
    expect(t.activationOffered(offered.sourceCardNumber)).toBe(true);
  });
});

describe("rule gates", () => {
  const observation = firstMultiPlayState(
    "(Red) Monkey.D.Luffy - Starter Deck 31",
    "(Blue) Kuzan - Starter Deck 33",
    "heuristics-seed-1",
  );
  const context = policyContext(observation);
  const play = observation.legalActions.find(
    (action) => action.type === "play-card",
  );
  if (!play) throw new Error("no play offered");

  it("narrows with a second `when` rather than replacing the first", () => {
    const both = heuristics("both", [
      prefer("gated twice")
        .when(() => true)
        .when(() => true)
        .play(() => true),
    ]);
    expect(both.rank?.(context, play)).toEqual({
      score: 10,
      reason: "gated twice",
    });

    const second = heuristics("second", [
      prefer("second gate closed")
        .when(() => true)
        .when(() => false)
        .play(() => true),
    ]);
    expect(second.rank?.(context, play)).toBeUndefined();

    const first = heuristics("first", [
      prefer("first gate closed")
        .when(() => false)
        .when(() => true)
        .play(() => true),
    ]);
    expect(first.rank?.(context, play)).toBeUndefined();
  });

  it("compiles `mustAct` to a named veto on `pass` alone", () => {
    const rule = mustAct("keep going")
      .as("go")
      .when(() => true)
      .insteadOfPass(() => true);
    expect(rule.tier).toBe("veto");
    expect(rule.name).toBe("go");
    const t = tactics(observation);
    for (const action of observation.legalActions) {
      const contribution = rule.contribute(t, action);
      if (action.type === "pass") expect(contribution).toBe(1);
      else expect(contribution).toBeUndefined();
    }
  });
});
