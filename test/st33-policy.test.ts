import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import {
  policiesForDeck,
  policyContext,
  RegistryRulesAgent,
} from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * ST-33's play ordering, which issue #170 moved out of the ladder.
 *
 * It was a twelve-entry array of card numbers consulted in order, with no
 * reference to the board anywhere in it. It is now five named rules, and these
 * pin the three that carry a board condition.
 *
 * Asserted at each rule's own *contribution* rather than only at the chosen
 * action, for the reason `archetype-rules.test.ts` gives at length: ST33's
 * policy passed seventeen tests through a 22.8pt collapse, because the fault was
 * in which branch classified an option and every test watched only the outcome.
 * A contribution check fails when a rule stops firing; an outcome check does
 * not.
 */
function contribution(
  state: Parameters<typeof observe>[0],
  moduleId: string,
  cardInstanceId: string,
): { score: number; reason: string | undefined } | undefined {
  const observation = observe(state, "p1");
  const context = policyContext(observation);
  const module = policiesForDeck(observation.self.leader.cardNumber).find(
    (candidate) => candidate.id === moduleId,
  );
  if (!module) throw new Error(`no module ${moduleId}`);
  return observation.legalActions.flatMap((action: LegalAction) => {
    if (action.type !== "play-card") return [];
    if (action.cardInstanceId !== cardInstanceId) return [];
    const ranked = module.rank?.(context, action);
    if (ranked === undefined) return [];
    const score = typeof ranked === "number" ? ranked : ranked.score;
    const reason = typeof ranked === "object" ? ranked.reason : undefined;
    return [{ score, reason }];
  })[0];
}

/** ST-33 in a posed turn-6 main phase with all ten DON!! active. */
function st33Turn(
  options: {
    opponentBoard?: ReturnType<typeof character>[];
    hand?: ReturnType<typeof instance>[];
  } = {},
) {
  return scenario()
    .decks(
      "(Blue) Kuzan - Starter Deck 33",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    )
    .seed("st33-play-rules")
    .bareTable()
    .atTurn(6, { active: "p1" })
    .withLife("p1", copies(4, "OP11-003", "p1-life"))
    .withLife("p2", copies(4, "OP11-003", "p2-life"))
    .withBoard("p2", options.opponentBoard ?? [])
    .withHand("p1", options.hand ?? [])
    .build();
}

describe("ST33 play ordering", () => {
  it("prefers Garp only when its free play has a body to bring with it", () => {
    // ST33-005 Garp plays a second blue {Navy} Character of 8000 power or less
    // out of hand, so with a follow-up it is two bodies for one play and without
    // one it is a 6-cost 6000 with no text. The old order had it first
    // unconditionally, and gating it is one of this file's larger rules.
    const withFollowUp = st33Turn({
      hand: [instance("garp", "ST33-005"), instance("saul", "OP12-050")],
    });
    expect(
      contribution(withFollowUp.state, "st33#garp-follow-up", "garp")?.score,
    ).toBeGreaterThan(0);

    // OP12-045 Jango is a red-less blue vanilla at 8000, and is a legal
    // follow-up; ST33-003 Smoker is 3000 and also legal. So the negative case
    // needs a hand whose only other card the clause cannot name at all -- an
    // Event.
    const alone = st33Turn({
      hand: [instance("garp", "ST33-005"), instance("ice", "EB04-028")],
    });
    expect(
      contribution(alone.state, "st33#garp-follow-up", "garp"),
    ).toBeUndefined();
  });

  it("prefers Borsalino only while its discount is actually applied", () => {
    // ST33-004 is a 6-cost 6000 [Blocker] that reads `-3 cost` during a turn an
    // effect trashed a card from this hand. The rule compares the price the
    // engine will charge against the printed cost, so it fires on exactly the
    // turns the discount is live. Small, because those turns are a minority,
    // and right every time it fires.
    const undiscounted = st33Turn({
      hand: [instance("borsalino", "ST33-004")],
    });
    expect(
      contribution(undiscounted.state, "st33#borsalino-discount", "borsalino"),
    ).toBeUndefined();
  });

  it("scores a two-for-one bottoming above a one-for-one", () => {
    // ST33-003 Smoker bottoms up to two Characters at cost 2 or less; EB04-026
    // Bluegrass bottoms one at cost 1 or less. With two cost-1 bodies opposite,
    // both clauses are live and Smoker takes both.
    const posed = st33Turn({
      opponentBoard: [
        character("cheap-a", "ST31-003"),
        character("cheap-b", "ST31-003"),
      ],
      hand: [instance("smoker", "ST33-003"), instance("bluegrass", "EB04-026")],
    });

    const smoker = contribution(posed.state, "st33#bottoming-target", "smoker");
    const bluegrass = contribution(
      posed.state,
      "st33#bottoming-target",
      "bluegrass",
    );

    expect(smoker?.score ?? 0).toBeGreaterThan(bluegrass?.score ?? 0);
  });

  it("does not commit the turn to the big Kuzan just because the board is not empty", () => {
    // A `kuzan-lock-target` rule preferring OP12-043 whenever the opponent
    // has anything on the board is a clear loss:
    // that gate is open on nearly every turn after the third, so a
    // `WEIGHT.deck` preference behind it stopped being a preference and became
    // "play this and nothing else". A control deck wants the [Blocker] and the
    // card draw more. Price a gate by how often it is *shut*.
    const posed = st33Turn({
      opponentBoard: [character("body", "ST31-002")],
      hand: [instance("kuzan", "OP12-043"), instance("saul", "OP12-050")],
    });

    expect(
      policiesForDeck(observe(posed.state, "p1").self.leader.cardNumber).map(
        (module) => module.id,
      ),
    ).not.toContain("st33#kuzan-lock-target");

    // And with it gone, nothing in this file has an opinion about OP12-043 at
    // all: the play falls to `develop-by-value`, where the card's old priority
    // still puts it high without committing the turn to it.
    expect(
      contribution(posed.state, "st33#develop-by-value", "kuzan")?.score,
    ).toBeGreaterThan(0);
  });
});

describe("ST33 Counter window", () => {
  /** OP12-057 Ice Block: a [Counter] Event worth +4000. */
  const ICE_BLOCK = "OP12-057";
  /** ST33-004 Borsalino: 6000, one of the protected bodies. */
  const BORSALINO = "ST33-004";
  /** OP12-045 Jango: a vanilla body with a 1000 Counter. */
  const JANGO = "OP12-045";

  function borsalinoUnderAttack(attackPower: number) {
    return scenario()
      .decks(
        "(Blue) Kuzan - Starter Deck 33",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("st33-counter")
      .bareTable()
      .atTurn(8, { active: "p2" })
      .withLife("p1", copies(4, "OP11-003", "p1-life"))
      .withLife("p2", copies(4, "OP11-003", "p2-life"))
      .withBoard("p1", [character("threatened", BORSALINO)])
      .withBoard("p2", [character("attacker", "ST31-004")])
      .withHand("p1", [
        instance("ice", ICE_BLOCK),
        instance("j1", JANGO),
        instance("j2", JANGO),
      ])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "threatened",
          attackPower,
          counterPower: 0,
        },
        "counter",
      )
      .build();
  }

  it("spends Ice Block to keep a protected body 3001 short", async () => {
    // The generic price of a protected save is one 1000 Counter card. Ice
    // Block closes a 3001 gap on its own, so the save still costs one card.
    const game = borsalinoUnderAttack(9_000);
    const agent = new RegistryRulesAgent("OP12-040");

    const action = await agent.chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-counter-event",
      eventInstanceId: "ice",
    });
  });

  it("lets it go once no single card closes the gap", async () => {
    // 5001 short: Ice Block and a Jango would do it, but that is two cards
    // for a body, from the same hand that defends the Leader.
    const game = borsalinoUnderAttack(11_000);
    const agent = new RegistryRulesAgent("OP12-040");

    const action = await agent.chooseAction(observe(game.state, "p1"));

    expect(action.type).toBe("pass");
    expect(agent.lastDecision?.reasons.join(" ")).toMatch(
      /replaceable Character/,
    );
  });
});
