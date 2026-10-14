import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import {
  RegistryRulesAgent,
  chooseWithModules,
  policiesForDeck,
} from "@one-piece-sim/agents/local";
import { character, instance, scenario } from "./support/index.js";

/**
 * EB04-001 Jewelry Bonney spends Life on purpose, and the generic Counter
 * policy does not know that.
 *
 * The Leader reads "[Opponent's Turn] If you have 1 or less Life cards, this
 * Leader gains +2000 power", so the hit that takes this deck from 2 Life to 1
 * is the hit that turns a 5000 Leader into a 7000 one. Bandai's own page for
 * the list says to gather Counter in hand "instead of needlessly defending"
 * until Life is 1 or less; `mustPreventCurrentLeaderHit` says the opposite at
 * 2 Life, because it widens its horizon to the refreshed board there.
 *
 * These tests pose the Counter window rather than playing a game, and assert
 * the action -- which is the decision `eb04-bonney-life-floor` owns.
 */
describe("EB04-001 holds its Life floor at 1 instead of Countering to 2", () => {
  /** The deck's own 1000-Counter body, held as Counter fodder in hand. */
  const BONNEY_ONE_DROP = "EB04-002";

  /**
   * A Leader hit in front of the Bonney seat, with Counter in hand to pay it.
   *
   * `attackPower` 6000 against a 5000 Leader is a 1001 shortfall -- two
   * 1000-Counter cards, a line `counter-budget` allows at any Life total, so
   * what these tests separate is this rule and not that one.
   */
  function counterWindow(options: {
    life: number;
    attackPower?: number;
    /** An attacker with [Double Attack], which makes `lifeCost` read 2. */
    doubleAttack?: boolean;
  }) {
    return scenario()
      .decks(
        "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed(
        `bonney-life-floor-${options.life}-${options.doubleAttack ?? false}`,
      )
      .atTurn(6, { active: "p2" })
      .withLife("p1", options.life)
      .withBoard("p2", [
        // OP13-118 carries [Double Attack]; the engine resolves printed text
        // globally, so a card the opposing deck does not run is still a legal
        // way to pose the attacker this test needs.
        character("attacker-a", options.doubleAttack ? "OP13-118" : "ST31-003"),
      ])
      .withHand("p1", [
        instance("held-0", BONNEY_ONE_DROP),
        instance("held-1", BONNEY_ONE_DROP),
        instance("held-2", BONNEY_ONE_DROP),
      ])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker-a",
          targetInstanceId: "p1-leader",
          attackPower: options.attackPower ?? 6_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();
  }

  const agent = () => new RegistryRulesAgent("EB04-001");

  it("takes the hit at 2 Life, holding the Counter cards it was offered", async () => {
    const game = counterWindow({ life: 2 });
    const observation = observe(game.state, "p1");
    // The position is only interesting if the generic policy had a line to take.
    expect(
      observation.legalActions.some((action) => action.type === "counter"),
    ).toBe(true);

    const action = await agent().chooseAction(observation);

    expect(action.type).toBe("pass");
  });

  it("takes the hit at 3 Life as well: the floor is 1, not 2", async () => {
    const game = counterWindow({ life: 3 });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).toBe("pass");
  });

  it("defends at 1 Life, where the trade is over and the +2000 is already on", async () => {
    // The Leader is 7000 here, so a 6000 attack no longer connects and there is
    // nothing to pay. 9000 is the hit that still needs Counter at the floor.
    const game = counterWindow({ life: 1, attackPower: 9_000 });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).toBe("counter");
  });

  it("defends a [Double Attack] at 2 Life rather than decline into an empty Life stack", async () => {
    // The rule prices the hit with `battle.lifeCost`, not at 1: two Life at 2
    // Life is the last Life card, and the floor is what keeps the rule from
    // ever spending it.
    const game = counterWindow({ life: 2, doubleAttack: true });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).toBe("counter");
  });
});

/**
 * The block half of the same doctrine, and the neighbouring position it must
 * say nothing about.
 *
 * `eb04-bonney-dying-block` exists because `eb04-bonney-life-floor` left the
 * block window declining for someone else's reason:
 * `counter-over-dying-block` passes a dying block on the strength of a Counter
 * line, and the life floor refuses that line. These tests pin the veto's own
 * boundary -- it removes a block whose Blocker dies, and leaves a block whose
 * Blocker survives for `free-block` to take.
 */
describe("EB04-001 declines the dying block but not the surviving one", () => {
  /**
   * A Leader hit with one of this deck's own Blockers standing.
   *
   * EB04-058 Borsalino is a 6000 [Blocker], so `attackPower` is what decides
   * whether the offered block survives: 7000 kills it, 5000 does not.
   */
  /**
   * A Leader hit with one of this deck's own Blockers standing, and nothing in
   * hand.
   *
   * The empty hand is what makes these tests discriminate.
   * `counter-over-dying-block` declines a dying block only when the hand can
   * pay the shortfall instead, so with cards in hand it would pass the block
   * for its own reason and a `pass` assertion would hold whether or not this
   * deck has a rule at all. With no hand that module says nothing, and
   * `chooseGenericBlock` at 2 Life against an attacker that can still swing
   * would block -- so `pass` here is this rule or nothing.
   *
   * EB04-058 Borsalino is a 6000 [Blocker], so `attackPower` decides whether
   * the offered block survives: 7000 kills it, 5000 does not.
   */
  function blockWindow(options: { life: number; attackPower: number }) {
    return scenario()
      .decks(
        "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed(`bonney-dying-block-${options.life}-${options.attackPower}`)
      .atTurn(6, { active: "p2" })
      .withLife("p1", options.life)
      .withHand("p1", [])
      .withBoard("p1", [character("blocker", "EB04-058")])
      .withBoard("p2", [character("attacker-a", "ST31-003")])
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "attacker-a",
        targetInstanceId: "p1-leader",
        attackPower: options.attackPower,
        counterPower: 0,
      })
      .build();
  }

  /** The registered stack for this Leader, so the test reads what ships. */
  const decide = (game: ReturnType<typeof blockWindow>) =>
    chooseWithModules(observe(game.state, "p1"), policiesForDeck("EB04-001"));

  it("declines a block the Blocker does not survive, at 2 Life", () => {
    // 7000 against the 6000 Borsalino: blocking gives up the body to stop a
    // Life card this deck is spending on purpose.
    const decision = decide(blockWindow({ life: 2, attackPower: 7_000 }));

    expect(decision.action.type).toBe("pass");
    expect(decision.narrowedBy ?? []).toContain("eb04-bonney-dying-block");
  });

  it("leaves a block the Blocker survives to `free-block`", () => {
    // 5000 against 6000: the body absorbs the hit and lives, so this is not a
    // Life-for-body trade and the rule must say nothing about it.
    const decision = decide(blockWindow({ life: 2, attackPower: 5_000 }));

    expect(decision.narrowedBy ?? []).not.toContain("eb04-bonney-dying-block");
  });

  it("says nothing at 1 Life, where the floor is reached", () => {
    const decision = decide(blockWindow({ life: 1, attackPower: 7_000 }));

    expect(decision.narrowedBy ?? []).not.toContain("eb04-bonney-dying-block");
  });
});

/**
 * Which card in hand pays a cost that trashes one.
 *
 * The decision `hand-cost-choice` owns, posed rather than played. Read off
 * `open-optcg-trace(14).jsonl`, turn 7: the Bonney seat paid OP12-119
 * Bartholomew Kuma's `[On Play]` with EB04-061 Monkey.D.Luffy, the 10-drop a
 * list with no ramp spends its opening finding, because the options reach a
 * policy as "Choose <name>" and first offered is hand order.
 */
describe("EB04-001 pays a hand cost with the card that defends nothing", () => {
  /**
   * Kuma's `[On Play]` accepted, with the hand it may pay from.
   *
   * `fatty` first in hand on purpose: it is the option the engine offers first,
   * so a test that passed on offer order alone would not discriminate.
   */
  function handCostWindow() {
    return scenario()
      .decks(
        "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("bonney-hand-cost-choice")
      .atTurn(13, { active: "p1" })
      .withLife("p1", 1)
      .withHand("p1", [
        instance("kuma", "OP12-119"),
        // 10-cost 12000, no [Counter]: the payoff the deck dug for.
        instance("fatty", "EB04-061"),
        // 4-cost 5000 with a 2000 [Counter]: Life the seat has not spent yet.
        instance("counter", "OP07-107"),
        // 1-cost Event, no [Counter]: what the rule should reach for.
        instance("cheap", "OP07-114"),
      ])
      .build();
  }

  const agent = () => new RegistryRulesAgent("EB04-001");

  it("spends the cheapest card with no [Counter], not the first one offered", async () => {
    const game = handCostWindow();
    game.play({ type: "play-card", cardInstanceId: "kuma" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    const observation = observe(game.state, "p1");
    // Only interesting while the 10-drop is still on offer.
    expect(
      observation.legalActions.some(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "fatty",
      ),
    ).toBe(true);

    const action = await agent().chooseAction(observation);

    expect(action.type).toBe("resolve-effect");
    expect(action.type === "resolve-effect" && action.optionId).toBe("cheap");
  });
});

/**
 * Which body makes room, while the wall is one hit from switching on.
 *
 * The decision `eb04-bonney-wall` owns, posed rather than played. Read off
 * `open-optcg-trace(14).jsonl`, turn 7: at 1 Life the Bonney seat played
 * OP12-119 Bartholomew Kuma onto a full board and gave up a Pacifista, leaving
 * a spent EB04-002 Jewelry Bonney -- whose `[On Play]` had resolved six turns
 * earlier -- standing beside it.
 */
describe("EB04-001 keeps its Pacifista wall at 1 Life", () => {
  /**
   * The full board from that trace: three Pacifista, the spent one-drop, and a
   * body the deck would rather keep than either.
   */
  function fullBoard(life: number) {
    return scenario()
      .decks(
        "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed(`bonney-wall-${life}`)
      .atTurn(13, { active: "p1" })
      .withLife("p1", life)
      .withBoard("p1", [
        // Offered first, so a test that passed on offer order would not
        // discriminate: this is the body the trace actually gave up.
        character("wall-a", "EB04-056", { playedTurn: 1 }),
        character("wall-b", "EB04-056", { playedTurn: 1 }),
        character("wall-c", "EB04-056", { playedTurn: 1 }),
        character("spent", "EB04-002", { playedTurn: 1 }),
        character("big", "ST29-010", { playedTurn: 1 }),
      ])
      .withHand("p1", [instance("incoming", "OP12-119")])
      .build();
  }

  const agent = () => new RegistryRulesAgent("EB04-001");

  it("gives up the spent one-drop instead of a Pacifista at 1 Life", async () => {
    const game = fullBoard(1);
    game.play({ type: "play-card", cardInstanceId: "incoming" });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).toBe("resolve-effect");
    expect(action.type === "resolve-effect" && action.optionId).toBe("spent");
  });

  it("still gives up a Pacifista at 2 Life, where the wall is two hits away", async () => {
    // The gate is the whole of the rule's restraint: at 2 Life a 1000-power
    // body with no block available really is the least of this board, and
    // `area-replacement-choice` is left to say so.
    const game = fullBoard(2);
    game.play({ type: "play-card", cardInstanceId: "incoming" });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).toBe("resolve-effect");
    expect(action.type === "resolve-effect" && action.optionId).toBe("wall-a");
  });

  it("never gives up the big body to keep the wall", async () => {
    // The mirror of the fault this fixes: the credit prices the block, not the
    // Blocker, so it must not reach past the board's largest body.
    const game = fullBoard(1);
    game.play({ type: "play-card", cardInstanceId: "incoming" });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type === "resolve-effect" && action.optionId).not.toBe("big");
  });
});
