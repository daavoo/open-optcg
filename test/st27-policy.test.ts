import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, instance, scenario } from "./support/index.js";

/**
 * ST-27's deck policy.
 *
 * Four judgements, and each is pinned twice: once as the decision the seat
 * makes, and once with the rule disabled, so the test states the default as
 * well as the rule. A rule that quietly stopped firing would otherwise leave
 * both halves green -- which is the failure `audit-deck-policy` records ST-33
 * collapsing 22.8pt through, with all seventeen of its tests passing.
 *
 * Every case asserts the *chosen action* rather than the game it leads to. All
 * four rules are worth points, and none of them is worth points because of any
 * single game.
 */

const ST27 = "(Black) Marshall.D.Teach - Starter Deck 27";
/** Katakuri, so nothing in the field intercepts ahead of the deck module. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP09-081";

/** What the deck's own agent picks from the options actually on offer. */
async function chosen(
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
  disable: readonly string[] = [],
) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

const table = (seed: string) =>
  scenario().decks(ST27, OPPONENT).seed(seed).atTurn(11, { active: "p1" });

describe("ST-27 does not spend its Leader's negation down to an empty hand", () => {
  /** A hand of exactly `size` cards, none of them castable for free. */
  const handOf = (size: number) =>
    Array.from({ length: size }, (_, index) =>
      instance(`hand-${index}`, "ST27-003"),
    );

  it("declines the activation at the hand floor", async () => {
    const game = table("st27-floor-at")
      .withHand("p1", handOf(4))
      .withDon("p1", { rested: 10 })
      .build();

    const action = await chosen(game);
    expect(
      action.type === "activate-main" && action.sourceCardNumber === "OP09-081",
    ).toBe(false);
  });

  it("takes it with a hand above the floor", async () => {
    // Every DON!! rested, so no play is affordable and the activation is what
    // the seat is actually choosing between taking and passing on. With DON!!
    // available the ladder develops first, which is right and is not what this
    // case is about.
    const game = table("st27-floor-above")
      .withHand("p1", handOf(5))
      .withDon("p1", { rested: 10 })
      .build();

    const action = await chosen(game);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(action.sourceCardNumber).toBe("OP09-081");
  });

  it("takes it on an empty hand once the rule is off, which is the bug", async () => {
    // Not merely "would take it": with the rule disabled the generic ladder
    // takes this free repeatable activation at every Main-phase decision, which
    // is how the seat reached 9.4 of them a game.
    const game = table("st27-floor-off")
      .withHand("p1", handOf(2))
      .withDon("p1", { rested: 10 })
      .build();

    const action = await chosen(game, ["st27-teach#leader-negation-price"]);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(action.sourceCardNumber).toBe("OP09-081");
  });
});

/**
 * How many times the seat pays for the Leader's negation in one Main phase.
 *
 * Stops at the first decision that is not the seat's own Main phase -- an
 * attack hands the phase to the defender, and the count is about what the seat
 * spends before it gets there.
 */
async function negationsPaidInOneTurn(
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
  disable: readonly string[] = [],
): Promise<number> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  let paid = 0;
  for (let step = 0; step < 24; step += 1) {
    const observation = observe(game.state, "p1");
    if (observation.phase !== "main") break;
    if (observation.legalActions.length === 0) break;
    const action = await agent.chooseAction(observation);
    if (action.type === "pass") break;
    if (action.type === "activate-main" && action.sourceCardNumber === LEADER) {
      paid += 1;
    }
    game.submit(action);
  }
  return paid;
}

describe("ST-27 does not pay again for a negation that is already up", () => {
  /** Eight cards, so the hand floor alone would allow four payments. */
  const bigHand = () =>
    Array.from({ length: 8 }, (_, index) =>
      instance(`hand-${index}`, "ST27-003"),
    );

  it("pays once, then leaves the clause alone for the rest of the turn", async () => {
    const game = table("st27-negation-up")
      .withHand("p1", bigHand())
      .withDon("p1", { rested: 10 })
      .build();

    expect(await negationsPaidInOneTurn(game)).toBe(1);
  });

  it("pays down to the hand floor once the rule is off, which is the bug", async () => {
    // Every payment after the first writes the same expiry the first one did,
    // so the extra cards buy nothing at all -- and before this rule the only
    // thing bounding them was the hand floor.
    const game = table("st27-negation-up-off")
      .withHand("p1", bigHand())
      .withDon("p1", { rested: 10 })
      .build();

    expect(
      await negationsPaidInOneTurn(game, ["st27-teach#negation-already-up"]),
    ).toBeGreaterThan(1);
  });
});

describe("ST-27 pays a trash cost with the smallest body in hand", () => {
  /**
   * A hand holding the deck's cheapest engine piece and its biggest body, so
   * hand order and the rule disagree: OP09-093 is offered first and is a 12000,
   * OP09-095 Laffitte is a 1000.
   */
  const mixedHand = () => [
    instance("finisher", "OP09-093"),
    instance("laffitte", "OP09-095"),
    instance("kuzan", "ST27-003"),
    instance("burgess", "OP09-086"),
    instance("shiryu", "PRB02-015"),
    instance("sabo", "PRB02-014"),
  ];

  it("pitches the 1000-power searcher, not the 12000 finisher", async () => {
    const game = table("st27-pitch").withHand("p1", mixedHand()).build();
    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });

    const action = await chosen(game);
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    if (action.option.kind !== "card") throw new Error("expected a card");
    expect(action.option.card.cardNumber).toBe("OP09-095");
  });

  it("pitches whatever hand order offers first once the rule is off", async () => {
    const game = table("st27-pitch-off").withHand("p1", mixedHand()).build();
    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });

    const action = await chosen(game, ["st27-teach-pitch"]);
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    if (action.option.kind !== "card") throw new Error("expected a card");
    // The 10-cost 12000, because it is the first card in hand and nothing else
    // was choosing. This is the default the pitch rule replaces.
    expect(action.option.card.cardNumber).toBe("OP09-093");
  });
});

describe("ST-27 does not spend a cost debuff with nothing to convert it", () => {
  /** A Laboon to debuff with, and a body worth debuffing. */
  const posed = (seed: string, own: ReturnType<typeof character>[]) =>
    table(seed)
      .withBoard("p1", own)
      .withBoard("p2", [character("target", "OP09-083")])
      .withHand("p1", [])
      .build();

  it("declines Laboon while no K.O. clause is standing", async () => {
    const game = posed("st27-debuff-alone", [character("laboon", "EB01-048")]);

    const action = await chosen(game);
    expect(
      action.type === "activate-main" && action.sourceCardNumber === "EB01-048",
    ).toBe(false);
  });

  it("declines it with the K.O. clause out but already rested", async () => {
    // The gate reads *active*, not merely present: both K.O. clauses pay by
    // resting themselves, so a rested one cannot convert the debuff this turn.
    const game = posed("st27-debuff-rested-killer", [
      character("laboon", "EB01-048"),
      character("teach", "ST27-005", { rested: true }),
    ]);

    const action = await chosen(game);
    expect(
      action.type === "activate-main" && action.sourceCardNumber === "EB01-048",
    ).toBe(false);
  });

  it("spends it once a K.O. clause is standing to convert it", async () => {
    const game = posed("st27-debuff-with-killer", [
      character("laboon", "EB01-048"),
      character("teach", "ST27-005"),
    ]);

    const action = await chosen(game);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(["EB01-048", "ST27-005"]).toContain(action.sourceCardNumber);
  });

  it("covers OP09-089 Stronger too, which the narrow arm exempted", async () => {
    // Exempting Stronger costs half of what the rule is worth: its draw is a
    // replacement, not a profit.
    const game = posed("st27-debuff-stronger", [
      character("stronger", "OP09-089"),
    ]);

    const action = await chosen(game);
    expect(
      action.type === "activate-main" && action.sourceCardNumber === "OP09-089",
    ).toBe(false);
  });

  it("spends the debuff once the rule is off, which is the bug", async () => {
    const game = posed("st27-debuff-off", [character("laboon", "EB01-048")]);

    const action = await chosen(game, ["st27-teach#debuff-needs-a-killer"]);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(action.sourceCardNumber).toBe("EB01-048");
  });
});

describe("ST-27 does not feed its own bodies to a Counter", () => {
  /**
   * p2 swings at the Leader while p1 holds two 2000 Counters: a PRB02-014 Sabo,
   * which is also the 6000 [Blocker] the deck wants to cast, and an OP09-089
   * Stronger, which is a 1-cost with no body at all.
   */
  const underAttack = (seed: string) => {
    const game = scenario()
      .decks(ST27, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .withHand("p1", [
        instance("sabo", "PRB02-014"),
        instance("stronger", "OP09-089"),
      ])
      .withBoard("p2", [character("attacker", "OP09-083")])
      // One Life left, so the hit is lethal and countering is not optional --
      // otherwise the generic policy takes the damage and this case never
      // reaches the question it is about.
      .withLife("p1", 1)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    // p1 has no [Blocker] out, so the block phase has only `pass` in it.
    while (game.state.phase === "block") game.pass();
    return game;
  };

  it("spends Stronger and keeps Sabo, though both print 2000", async () => {
    const game = underAttack("st27-counter");
    expect(game.state.phase).toBe("counter");

    const action = await chosen(game);
    expect(action.type).toBe("counter");
    if (action.type !== "counter") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("stronger");
  });

  it("has no preference between them once the rule is off", async () => {
    // The generic fallback ships an empty protected set, so the two 2000s are
    // interchangeable to it and it takes whichever comes first -- which here is
    // the 6-cost Blocker the deck is trying to cast.
    const game = underAttack("st27-counter-off");

    const action = await chosen(game, ["st27-teach-defense"]);
    expect(action.type).toBe("counter");
    if (action.type !== "counter") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("sabo");
  });
});
