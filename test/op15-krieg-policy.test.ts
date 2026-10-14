import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Red/Green) Krieg's Counter phase.
 *
 * The deck ships one policy module and this is it, pinned twice: once as the
 * decision the seat makes, and once with the module disabled, so the test
 * states the default as well as the rule. A rule that quietly stopped firing
 * would otherwise leave both halves green.
 */

const KRIEG = "(Red/Green) Krieg - Official Feature Deck";
/** Katakuri, so nothing in the field intercepts ahead of the deck module. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP15-001";

async function chosen(
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
  disable: readonly string[] = [],
) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

/** The chosen action together with which module chose it. */
async function decided(
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
  disable: readonly string[] = [],
) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  const action = await agent.chooseAction(observe(game.state, "p1"));
  return { action, moduleId: agent.lastDecision?.moduleId };
}

/**
 * Takes the seat's own decisions until its Main phase ends.
 *
 * A sequencing rule is about the whole turn rather than one action, and the
 * ladder's free rungs -- an `[Activate: Main]` that costs no DON!! -- sit
 * between the veto and the action it is making room for.
 */
async function playOutTurn(
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
) {
  const agent = new RegistryRulesAgent(LEADER);
  for (let step = 0; step < 20; step += 1) {
    const action = await agent.chooseAction(observe(game.state, "p1"));
    if (action.type === "pass" || action.type === "attack") return;
    game.submit(action);
  }
  throw new Error("turn did not end");
}

/**
 * p2 swings at Krieg's Leader with `attacker`, stopping in the block window
 * rather than passing through it.
 *
 * Turn 12 with p2 active is what puts OP15-011 Pearl's conditional [Blocker]
 * and its +2000 in force: both halves read "the opponent's turn" and an East
 * Blue Leader, which is what Krieg is.
 *
 * `life` decides which side of the block rules' gate the position sits on. At 2
 * the Counter window would pay for this hit, so a cheaper way to stop it is
 * worth having; at 3 it would take the Life instead, and both rules stand down.
 *
 * `hand` is named per position because these rules are priced in whole Counter
 * cards: what a hand can close the gap *with* is the arithmetic under test, and
 * two 1000s and a 2000-plus-1000 answer the same shortfall differently.
 */
const leaderUnderAttack = (
  seed: string,
  defender: string,
  defenderCard: string,
  attackerCard: string,
  hand: readonly string[] = ["OP15-028", "OP15-011"],
  life = 2,
) => {
  const game = scenario()
    .decks(KRIEG, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withBoard("p1", [character(defender, defenderCard)])
    .withHand(
      "p1",
      hand.map((cardNumber, index) =>
        instance(`counter-${index + 1}`, cardNumber),
      ),
    )
    .withBoard("p2", [character("attacker", attackerCard)])
    .withLife(
      "p1",
      [
        instance("life-1", "OP15-009"),
        instance("life-2", "OP15-009"),
        instance("life-3", "OP15-009"),
      ].slice(0, life),
    )
    .build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  return game;
};

describe("Krieg spends a card on the body that keeps paying", () => {
  /**
   * p2 attacks Morgan, the [Blocker] whose activation hands over a DON!! every
   * turn, with a body of the same size: 6000 into 6000, which a single 1000
   * Counter answers. `chooseGenericCounter` saves a Character only when 1000
   * reaches, so this is the position the protected set is read in.
   */
  const morganUnderAttack = (seed: string) => {
    const game = scenario()
      .decks(KRIEG, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("morgan", "OP15-017", { rested: true })])
      .withHand("p1", [instance("counter", "OP15-011")])
      .withBoard("p2", [character("attacker", "OP15-003")])
      // `bareTable` empties the deck as well as the table, and `withLife`
      // deals off the deck -- so the Life cards are named. The economical save
      // asks whether the Life stack can afford the turn, and at 0 it never can.
      .withLife("p1", [
        instance("life-1", "OP15-009"),
        instance("life-2", "OP15-009"),
        instance("life-3", "OP15-009"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "morgan",
    });
    while (game.state.phase === "block") game.pass();
    return game;
  };

  it("counters to keep Morgan on the field", async () => {
    const game = morganUnderAttack("krieg-counter-morgan");
    expect(game.state.phase).toBe("counter");

    const action = await chosen(game);
    expect(action.type).toBe("counter");
  });

  it("lets the same body die once the rule is off", async () => {
    // `chooseGenericCounter`'s protected set is empty by default, and for a
    // battle over a Character that set is the whole test -- so the unpiloted
    // seat keeps the card and loses the body.
    const game = morganUnderAttack("krieg-counter-morgan-off");

    const action = await chosen(game, ["op15-krieg-counter"]);
    expect(action.type).toBe("pass");
  });

  it("does not spend a card on a body that pays as it dies", async () => {
    // OP15-023 Arlong's [On K.O.] holds two of the opponent's rested cards
    // down through their Refresh Phase, so it is worth as much dead as alive
    // and is deliberately outside the protected set.
    const game = scenario()
      .decks(KRIEG, OPPONENT)
      .seed("krieg-counter-arlong")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("arlong", "OP15-023", { rested: true })])
      .withHand("p1", [instance("counter", "OP15-011")])
      // A 5000 attacker into Arlong's 5000, so 1000 of Counter saves it here
      // exactly as it saves Morgan above: the protected set is the only reason
      // the two positions are answered differently.
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withLife("p1", [
        instance("life-1", "OP15-009"),
        instance("life-2", "OP15-009"),
        instance("life-3", "OP15-009"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "arlong",
    });
    while (game.state.phase === "block") game.pass();

    const action = await chosen(game);
    expect(action.type).toBe("pass");
  });
});

describe("Krieg holds a gift the opponent's cost area cannot pay", () => {
  /**
   * The deck's own first turn, from the trace this rule came out of: one DON!!,
   * Higuma in hand, nothing on either board. Both halves of its `[On Play]`
   * name an opposing Character, and there is none.
   */
  const emptyBoard = (seed: string, hand: readonly string[] = ["OP15-015"]) =>
    scenario()
      .decks(KRIEG, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand(
        "p1",
        hand.map((cardNumber, index) =>
          instance(`held-${index + 1}`, cardNumber),
        ),
      )
      .withDon("p1", { rested: 9 })
      .build();

  it("does not play Higuma into an empty board", async () => {
    const game = emptyBoard("krieg-higuma-empty");
    expect(game.state.players.p1.activeDon).toHaveLength(1);

    const action = await chosen(game);
    expect(action.type).not.toBe("play-card");
  });

  it("plays it once the rule is off", async () => {
    // The ladder develops the dearest legal card, and on this turn Higuma is
    // the only one -- which is the line this rule exists to remove.
    const action = await chosen(emptyBoard("krieg-higuma-empty-off"), [
      "op15-krieg-dead-gift",
    ]);
    expect(action.type).toBe("play-card");
  });

  it("prefers the 2000 body over Higuma in the same cost band", async () => {
    // OP15-009 Koby is the same cost with twice the power, and Higuma's clause
    // is the only thing that could pay for the difference.
    const game = emptyBoard("krieg-higuma-band", ["OP15-015", "OP15-009"]);

    const action = await chosen(game);
    expect(action.type).toBe("play-card");
    if (action.type !== "play-card") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("held-2");
  });

  it("plays Higuma once their cost area can pay the gift", async () => {
    // A Character to receive it and a rested DON!! of theirs to move: both
    // halves of the clause now resolve, which is what the card is for.
    const game = scenario()
      .decks(KRIEG, OPPONENT)
      .seed("krieg-higuma-live")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("higuma", "OP15-015")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p1", { rested: 9 })
      .withDon("p2", { rested: 1 })
      .build();

    const action = await chosen(game);
    expect(action.type).toBe("play-card");
    if (action.type !== "play-card") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("higuma");
  });

  /**
   * The trace's other half: Jango standing, a Character of theirs already
   * carrying a given DON!! -- so `op15-krieg-jango` is satisfied and would
   * trash it -- and an opposing cost area with nothing rested in it. The
   * activation emits `don-attached ... count: 0`.
   */
  const emptyCostArea = (seed: string) =>
    scenario()
      .decks(KRIEG, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("jango", "OP15-026")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withGivenDon("p2", "victim", 1)
      .build();

  it("keeps Jango when there is no rested DON!! of theirs to move", async () => {
    const action = await chosen(emptyCostArea("krieg-jango-empty-area"));
    expect(action.type).not.toBe("activate-main");
  });

  it("trashes it for nothing once the rule is off", async () => {
    const action = await chosen(emptyCostArea("krieg-jango-empty-area-off"), [
      "op15-krieg-dead-gift",
    ]);
    expect(action.type).toBe("activate-main");
  });
});

describe("Krieg keeps Jango until the gift can be cashed", () => {
  /**
   * The deck's own first turn: Jango on the board, one opposing Character, and
   * no DON!! given to anything yet. Its `[Activate: Main]` trashes Jango to
   * hand that Character a DON!! -- the second one is what the Leader's rest
   * needs, and there is no first one.
   */
  const firstTurn = (seed: string) =>
    scenario()
      .decks(KRIEG, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("jango", "OP15-026")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p2", { rested: 1 })
      .build();

  it("declines the activation with nothing on their board to finish", async () => {
    const action = await chosen(firstTurn("krieg-jango-fresh"));
    expect(action.type).not.toBe("activate-main");
  });

  it("trashes it once a body is one DON!! short of the rest", async () => {
    const game = scenario()
      .decks(KRIEG, OPPONENT)
      .seed("krieg-jango-loaded")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("jango", "OP15-026")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withGivenDon("p2", "victim", 1)
      .withDon("p2", { rested: 1 })
      .build();

    const action = await chosen(game);
    expect(action.type).toBe("activate-main");
  });

  it("takes it on the empty board once the rule is off", async () => {
    // The generic ladder fires the first activation it is offered, which is
    // the line this rule exists to remove.
    const action = await chosen(firstTurn("krieg-jango-off"), [
      "op15-krieg-jango",
    ]);
    expect(action.type).toBe("activate-main");
  });
});

describe("Krieg keeps a DON!! under its Leader for the opponent's turn", () => {
  /**
   * Five DON!! and a 4-cost body in hand: the turn can pay for the body and
   * still leave one DON!! under the Leader, which is the headroom that makes
   * this an ordering rather than a trade.
   */
  const spareDon = (seed: string) =>
    scenario()
      .decks(KRIEG, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("pearl", "OP15-011")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p1", { rested: 5 })
      .build();

  it("attaches to the Leader before developing", async () => {
    const game = spareDon("krieg-aura-first");
    expect(game.state.players.p1.activeDon).toHaveLength(5);

    const action = await chosen(game);
    expect(action.type).toBe("attach-don");
    if (action.type !== "attach-don") throw new Error("unreachable");
    expect(action.targetInstanceId).toBe("p1-leader");
  });

  it("develops first once the rule is off", async () => {
    // The ladder runs plays before attachments, so without this rule the body
    // takes the DON!! and the aura is off on the turn it is needed.
    const action = await chosen(spareDon("krieg-aura-off"), [
      "op15-krieg-aura",
    ]);
    expect(action.type).toBe("play-card");
  });

  it("does not let a cheap Event spend the DON!! it is reserving", async () => {
    // The trace's turn 5: five DON!!, a 1-cost Event and a 4-cost body in
    // hand. Vetoing only the play drops the ladder onto the Event, which pays
    // out of the same pool -- and the headroom gate then reads 4 DON!! against
    // the 4-cost body, stands down, and the Leader ends the turn bare.
    const game = scenario()
      .decks(KRIEG, OPPONENT)
      .seed("krieg-aura-event")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("search", "OP15-037"),
        instance("arlong", "OP15-023"),
      ])
      // The Event looks at the top of the deck, so it needs one: an empty deck
      // makes it inert and the format's own rule would decline it instead.
      .withDeckTop("p1", [
        instance("deck-1", "OP15-009"),
        instance("deck-2", "OP15-017"),
        instance("deck-3", "OP15-011"),
        instance("deck-4", "OP15-025"),
      ])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p1", { rested: 5 })
      .build();

    expect(game.state.players.p1.activeDon).toHaveLength(5);

    // Driven to the end of the turn rather than pinned on one action: the
    // Leader's own free activation legitimately goes first, and what the rule
    // is about is where the five DON!! end up.
    await playOutTurn(game);
    const after = observe(game.state, "p1");
    expect(after.self.leader.attachedDon).toBe(1);
    expect(after.self.board.map((card) => card.cardNumber)).toContain(
      "OP15-023",
    );
  });

  it("does not buy the aura with the DON!! the body needs", async () => {
    // Exactly enough for the 4-cost: attaching first would leave it uncastable,
    // which is the trade the headroom gate refuses to make.
    const game = scenario()
      .decks(KRIEG, OPPONENT)
      .seed("krieg-aura-headroom")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("arlong", "OP15-023")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p1", { rested: 6 })
      .build();

    expect(game.state.players.p1.activeDon).toHaveLength(4);
    const action = await chosen(game);
    expect(action.type).toBe("play-card");
  });
});

describe("Krieg leads with Jango among its 1-cost bodies", () => {
  /** Two 1-cost 2000s and nothing dearer affordable: the guide's own case. */
  const oneCostBand = (seed: string) =>
    scenario()
      .decks(KRIEG, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("koby", "OP15-009"),
        instance("jango", "OP15-026"),
      ])
      .withDon("p1", { rested: 9 })
      .build();

  it("plays the searcher rather than the other 2000", async () => {
    const game = oneCostBand("krieg-jango-first");
    expect(game.state.players.p1.activeDon).toHaveLength(1);

    const action = await chosen(game);
    expect(action.type).toBe("play-card");
    if (action.type !== "play-card") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("jango");
  });

  it("takes hand order once the rule is off", async () => {
    // `equal-cost-play` separates the band by what a body is worth standing
    // there, and these two are both 2000 -- so the tie falls to hand order.
    const action = await chosen(oneCostBand("krieg-jango-first-off"), [
      "op15-krieg-jango-first",
    ]);
    expect(action.type).toBe("play-card");
    if (action.type !== "play-card") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("koby");
  });
});

describe("Krieg blocks when the block is cheaper than the pass", () => {
  /**
   * OP15-025 Kuro's 7000 into the 5000 Leader, with OP15-011 Pearl standing.
   *
   * Pearl defends at 6000 here, so it dies to the attack either way -- but the
   * Leader's shortfall is 2001 and Pearl's is 1001, and Pearl's `[On K.O.]`
   * K.O.s a 6000-base-power body on the way out. Blocking costs no Life, no
   * card, and cashes a removal clause; passing costs two Counter cards.
   */
  const pearlOffered = (seed: string) =>
    leaderUnderAttack(seed, "pearl", "OP15-011", "OP15-025", [
      "OP15-028",
      "OP15-011",
    ]);

  it("spends the body whose K.O. is its own payoff", async () => {
    const game = pearlOffered("krieg-block-pearl");
    expect(game.state.phase).toBe("block");

    const { action, moduleId } = await decided(game);
    expect(action.type).toBe("block");
    expect(moduleId).toBe("block-payoff-ko");
  });

  it("keeps it and pays two cards once the rule is off", async () => {
    // `counter-over-dying-block` owns the position without this rule: Pearl
    // dies to the attack and the hand can close 2001, so it declines the block
    // and promises the Counter line instead.
    const { action } = await decided(pearlOffered("krieg-block-pearl-off"), [
      "block-payoff-ko",
    ]);
    expect(action.type).toBe("pass");
  });

  it("blocks with a protected body when that cuts the Counter bill", async () => {
    // OP15-003 Alvida's 6000 into the 5000 Leader, answered by OP15-017
    // Morgan's 6000. The Leader is 1001 short and Morgan is 1 short, so the
    // same Life costs one card behind the block and two in front of it -- and
    // Morgan is in the protected set, so the Counter window will pay it.
    const game = leaderUnderAttack(
      "krieg-block-morgan",
      "morgan",
      "OP15-017",
      "OP15-003",
      ["OP15-011", "OP15-011"],
    );

    const { action, moduleId } = await decided(game);
    expect(action.type).toBe("block");
    expect(moduleId).toBe("block-discount");
  });

  it("leaves a body that is neither protected nor a payoff alone", async () => {
    // OP15-013 Pincers blocks at 2000 and dies to the same 6000 attack having
    // bought nothing: the Counter window will not spend on it and its K.O.
    // prints no clause, so the block is a body given away for one Life.
    const game = leaderUnderAttack(
      "krieg-block-pincers",
      "pincers",
      "OP15-013",
      "OP15-003",
    );

    const { action, moduleId } = await decided(game);
    expect(moduleId).not.toBe("block-discount");
    expect(action.type).toBe("pass");
  });

  it("stays out of a block the body survives", async () => {
    // OP15-023 Arlong's 5000 into the Leader with Pearl at 6000 in front of
    // it: the block costs nothing but a rest, which is `free-block`'s question
    // and not this rule's. Gating on a body that dies keeps the two disjoint.
    const game = leaderUnderAttack(
      "krieg-block-survivor",
      "pearl",
      "OP15-011",
      "OP15-023",
    );

    const { moduleId } = await decided(game);
    expect(moduleId).not.toBe("block-payoff-ko");
  });
});
