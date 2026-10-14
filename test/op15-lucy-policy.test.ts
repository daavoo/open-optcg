import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Red/Blue) Lucy's four policy modules.
 *
 * Each rule is pinned twice -- once as the decision the seat makes and once
 * with the module disabled, so the test states the default it replaces as well
 * as the rule. A rule that quietly stopped firing would otherwise leave both
 * halves green.
 */

const LUCY = "(Red/Blue) Lucy - Official Feature Deck";
/** Katakuri, so nothing in the field intercepts ahead of the deck module. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP15-002";

async function chosen(
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
  disable: readonly string[] = [],
) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

/** The Life stack, named: `bareTable` empties the deck `withLife` deals from. */
const LIFE = [
  instance("life-1", "OP15-040"),
  instance("life-2", "OP15-040"),
  instance("life-3", "OP15-040"),
];

/** Their Life stack, so a scenario can keep the opponent off their last Life. */
const THEIR_LIFE = [
  instance("their-life-1", "OP15-040"),
  instance("their-life-2", "OP15-040"),
  instance("their-life-3", "OP15-040"),
];

/** One Life card: the hit in front of the Leader is the one that has to be stopped. */
const LAST_LIFE = [instance("life-1", "OP15-040")];

describe("Lucy pitches Events only where the power decides the battle", () => {
  /**
   * p2 attacks the Leader with `attackPower`, and the Leader's own clause is
   * the first thing the defender is asked about. The hand is one Event the
   * Counter window cannot use, so the pitch is the only defence in it.
   */
  const attacked = (
    seed: string,
    attacker: string,
    life: readonly ReturnType<typeof instance>[] = LAST_LIFE,
  ) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("bulls", "OP15-019")])
      .withBoard("p2", [character("attacker", attacker)])
      .withLife("p1", [...life])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    return game;
  };

  it("takes the hit at full Life, as the Counter window would", async () => {
    // The same 1-short battle as below, at 3 Life: `chooseGenericCounter`
    // absorbs a nonlethal Leader hit, and a card trashed here is a Counter
    // card that buys half as much -- so the clause absorbs it too, and the
    // Life card comes to hand.
    const game = attacked("lucy-pitch-absorbs", "OP15-048", LIFE);

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });

  it("trashes an Event for the 1000 that turns the attack away", async () => {
    // OP15-048 is a 5000 body against the 5000 Leader: the attacker wins ties,
    // so the shortfall is 1 and one card covers it.
    const game = attacked("lucy-pitch-pays", "OP15-048");

    const action = await chosen(game);
    expect(action.type).toBe("resolve-effect");
    expect(action.summary).toContain("Barrier Bulls");
  });

  it("keeps the card when the attack already fails", async () => {
    // ST31-003 is a 2000 body into a 5000 Leader: the offer is still made and
    // the 1000 still lands, it simply changes nothing.
    const game = attacked("lucy-pitch-pointless", "ST31-003");

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });

  it("keeps the card when the whole hand still loses the battle", async () => {
    // OP15-046 is a 9000 body: 4001 short, against one Event worth 1000 and a
    // hand with no Counter value at all.
    const game = attacked("lucy-pitch-hopeless", "OP15-046");

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });

  it("pitches the whole hand once the rule is off", async () => {
    // `chooseGenericRules` answers the offer as "resolve a legal beneficial
    // effect", which takes it whether or not the power does anything.
    const game = attacked("lucy-pitch-default", "ST31-003");

    const action = await chosen(game, ["op15-lucy-pitch"]);
    expect(action.summary).toContain("Barrier Bulls");
  });

  it("pays with the Event the Counter window does not want", async () => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed("lucy-pitch-order")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withHand("p1", [
        // OP15-021 is a [Counter] Event worth -3000 one step later, so it is
        // pitched last however cheap it is; OP15-020 is the deck's 7-cost
        // removal ceiling, so it is pitched after the 3-cost draw spell.
        instance("ace", "OP15-021"),
        instance("fire", "OP15-020"),
        instance("bulls", "OP15-019"),
      ])
      .withBoard("p2", [character("attacker", "OP15-048")])
      .withLife("p1", LAST_LIFE)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    const action = await chosen(game);
    expect(action.summary).toContain("Barrier Bulls");
  });

  /**
   * The same board as {@link attacked}, plus Counter value in hand: the cards
   * the old reading counted towards the save and the Counter window never
   * spends.
   */
  const attackedHoldingCounters = (
    seed: string,
    attacker: string,
    life: readonly ReturnType<typeof instance>[],
  ) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withHand("p1", [
        instance("bulls", "OP15-019"),
        instance("viola", "OP15-040"),
      ])
      .withBoard("p2", [character("attacker", attacker)])
      .withLife("p1", [...life])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    return game;
  };

  it("keeps the card when the 1000 leaves the attack 1 short and the Counter window will not pay", async () => {
    // OP15-014 is a 6000 body into the 5000 Leader, so the shortfall is 1001
    // and the single Event on offer reaches 1000 of it. The last 1 has to come
    // from the Counter step, which passes a nonlethal Leader hit at 3 Life --
    // so the Event would be trashed for nothing and the Life taken anyway.
    const game = attackedHoldingCounters(
      "lucy-pitch-one-short",
      "OP15-014",
      LIFE,
    );

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });

  it("trashes it when the Counter window is the one that finishes the job", async () => {
    // The same 1001, with the Leader at 1 Life: the hit is lethal, so the
    // Counter step pays, and Viola's 2000 closes the 1 the Event cannot.
    const game = attackedHoldingCounters("lucy-pitch-lethal", "OP15-014", [
      instance("life-1", "OP15-040"),
    ]);

    const action = await chosen(game);
    expect(action.summary).toContain("Barrier Bulls");
  });

  it("trashes it into the same 1001 once the rule is off", async () => {
    const game = attackedHoldingCounters(
      "lucy-pitch-one-short-default",
      "OP15-014",
      LIFE,
    );

    const action = await chosen(game, ["op15-lucy-pitch"]);
    expect(action.summary).toContain("Barrier Bulls");
  });

  it("leaves the shortfall to the Stage, which buys 2000 for the same card", async () => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed("lucy-pitch-stage-credit")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withStage("p1", instance("kingdom", "OP15-057"))
      .withHand("p1", [
        instance("bulls", "OP15-019"),
        instance("luffy", "OP15-055"),
      ])
      // 7000 into a 5000 Leader: 2001 short, which two cards at 1000 would
      // reach and one card at the Stage's 2000 reaches on its own.
      .withBoard("p2", [character("attacker", "OP15-014")])
      .withDon("p2", { leaderAttached: 1 })
      .withLife("p1", LAST_LIFE)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });
});

describe("Lucy rests the Stage for the battle it decides", () => {
  const attacked = (
    seed: string,
    attacker: string,
    life: readonly ReturnType<typeof instance>[] = LAST_LIFE,
  ) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withStage("p1", instance("kingdom", "OP15-057"))
      .withHand("p1", [instance("bulls", "OP15-019")])
      .withBoard("p2", [character("attacker", attacker)])
      .withLife("p1", [...life])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    // The Leader's own clause is asked first; it declines, leaving the Stage.
    while (
      game
        .legalActions()
        .some((action) => action.summary.includes("no more cards"))
    ) {
      game.play({ summary: "no more cards" });
    }
    return game;
  };

  it("keeps the card at full Life, as the Counter window would", async () => {
    // The same 1001 at 3 Life: a nonlethal hit the Counter step absorbs, so
    // the Stage's card -- a 2000 Counter by another route -- is kept too.
    const game = attacked("lucy-stage-absorbs", "OP15-014", LIFE);

    const action = await chosen(game);
    expect(action.summary).toContain("Don't apply");
  });

  it("applies the clause when the 2000 saves the Leader", async () => {
    // OP15-014 is a 6000 body: 1001 short, inside the Stage's 2000, and the
    // Leader's last Life is behind it.
    const game = attacked("lucy-stage-pays", "OP15-014");

    const action = await chosen(game);
    expect(action.summary).toContain("Activate Dressrosa Kingdom");
  });

  it("declines when the attack already fails", async () => {
    const game = attacked("lucy-stage-pointless", "ST31-003");

    const action = await chosen(game);
    expect(action.type === "resolve-effect" && action.optionId).toBe("skip");
  });

  /**
   * A shortfall past the Stage's own 2000, with the Counter cards that would
   * have to cover the rest sitting in hand.
   */
  const attackedPastTheStage = (seed: string) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withStage("p1", instance("kingdom", "OP15-057"))
      .withHand("p1", [
        instance("bulls", "OP15-019"),
        instance("viola", "OP15-040"),
        instance("leo", "OP15-052"),
      ])
      // OP15-046 is a 9000 body: 4001 short, which the Stage's 2000 and two
      // 2000-Counters reach between them and the Stage cannot reach alone.
      .withBoard("p2", [character("attacker", "OP15-046")])
      .withLife("p1", LIFE)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (
      game
        .legalActions()
        .some((action) => action.summary.includes("no more cards"))
    ) {
      game.play({ summary: "no more cards" });
    }
    return game;
  };

  it("declines when the 2000 needs a Counter line the window will not open", async () => {
    const game = attackedPastTheStage("lucy-stage-promise");

    const action = await chosen(game);
    expect(action.type === "resolve-effect" && action.optionId).toBe("skip");
  });

  it("applies it anyway once the rule is off", async () => {
    const game = attacked("lucy-stage-default", "ST31-003");

    const action = await chosen(game, ["op15-lucy-stage"]);
    expect(action.summary).toContain("Activate Dressrosa Kingdom");
  });
});

describe("Lucy casts the Event the free activation exists to pay for", () => {
  const saboWithChoices = (seed: string, opponentBoard: string[]) =>
    scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("sabo", "OP15-046"),
        instance("bulls", "OP15-019"),
        instance("fire", "OP15-020"),
      ])
      .withBoard(
        "p2",
        opponentBoard.map((cardNumber, index) =>
          character(`body-${index}`, cardNumber),
        ),
      )
      .withLife("p1", LIFE)
      .build();

  it("casts the 7-cost removal Event while they have a body", async () => {
    const game = saboWithChoices("lucy-free-removal", ["OP15-014"]);
    game.play({ type: "play-card", cardNumber: "OP15-046" });

    const action = await chosen(game);
    expect(action.summary).toContain("Fire Fist");
  });

  it("casts the draw spell into an empty board", async () => {
    // "Up to 1" target, and there is none, so the removal Event would resolve
    // for nothing.
    const game = saboWithChoices("lucy-free-draw", []);
    game.play({ type: "play-card", cardNumber: "OP15-046" });

    const action = await chosen(game);
    expect(action.summary).toContain("Barrier Bulls");
  });

  it("takes hand order once the rule is off", async () => {
    const game = saboWithChoices("lucy-free-default", ["OP15-014"]);
    game.play({ type: "play-card", cardNumber: "OP15-046" });

    const action = await chosen(game, ["op15-lucy-free-event"]);
    expect(action.summary).toContain("Barrier Bulls");
  });
});

describe("Lucy plays Dressrosa Kingdom before the bodies", () => {
  const openingTurn = (seed: string) =>
    scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("kingdom", "OP15-057"),
        instance("sabo", "OP15-046"),
        instance("barto", "OP15-014"),
      ])
      .withLife("p1", LIFE)
      .withLife("p2", THEIR_LIFE)
      .build();

  it("takes the 1-cost Stage ahead of a 7-cost body", async () => {
    const game = openingTurn("lucy-stage-first");

    const action = await chosen(game);
    expect(action.type).toBe("play-card");
    expect(action.summary).toContain("Dressrosa Kingdom");
  });

  it("develops the highest-cost card once the rule is off", async () => {
    // `chooseGenericRules` sorts plays by cost descending, so the 1-cost Stage
    // is the last thing the turn reaches and the first thing it runs out of
    // DON!! for.
    const game = openingTurn("lucy-stage-first-off");

    const action = await chosen(game, ["op15-lucy-stage-first"]);
    expect(action.summary).toContain("Sabo");
  });

  it("stops preferring it once a Stage is already out", async () => {
    // A second copy replaces the first for nothing but its [On Play] draw,
    // which is not worth the card plus the DON!!.
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed("lucy-stage-occupied")
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withStage("p1", instance("standing", "OP15-057"))
      .withHand("p1", [
        instance("kingdom", "OP15-057"),
        instance("sabo", "OP15-046"),
      ])
      .withLife("p1", LIFE)
      .withLife("p2", THEIR_LIFE)
      .build();

    const action = await chosen(game);
    expect(action.summary).toContain("Sabo");
  });
});

describe("Lucy spends a card on the body its Events are cast off", () => {
  const underAttack = (seed: string, defender: string) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("body", defender, { rested: true })])
      .withHand("p1", [instance("counter", "OP15-006")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withLife("p1", LIFE)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    while (game.state.phase === "block") game.pass();
    return game;
  };

  it("counters to keep Bartolomeo on the field", async () => {
    // A 6000 attacker into Bartolomeo's 6000, which one 2000 Counter answers.
    const game = underAttack("lucy-counter-barto", "OP15-014");
    expect(game.state.phase).toBe("counter");

    const action = await chosen(game);
    expect(action.type).toBe("counter");
  });

  it("lets a searcher that has already drawn its card die", async () => {
    // OP15-040 Viola's [On Play] has resolved by the time anything attacks it,
    // so it is deliberately outside the protected set.
    const game = underAttack("lucy-counter-viola", "OP15-040");

    const action = await chosen(game);
    expect(action.type).toBe("pass");
  });

  it("lets Bartolomeo die once the rule is off", async () => {
    const game = underAttack("lucy-counter-off", "OP15-014");

    const action = await chosen(game, ["op15-lucy-counter"]);
    expect(action.type).toBe("pass");
  });
});

describe("Lucy searches for the body that casts its Events", () => {
  const searching = (seed: string) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(3, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("viola", "OP15-040")])
      .withDeckTop("p1", [
        instance("chinjao", "OP15-048"),
        instance("barto", "OP15-014"),
        instance("fire", "OP15-020"),
      ])
      .withLife("p1", LIFE)
      .build();
    game.play({ type: "play-card", cardInstanceId: "viola" });
    return game;
  };

  it("takes Bartolomeo over the 4-cost offered ahead of it", async () => {
    const game = searching("lucy-search-barto");

    const action = await chosen(game);
    expect(action.summary).toContain("Bartolomeo");
  });

  it("takes the first card offered once the table is off", async () => {
    const game = searching("lucy-search-default");

    const action = await chosen(game, ["search:op15-lucy"]);
    expect(action.summary).toContain("Chinjao");
  });
});

describe("Lucy pays a card cost with the card it can most afford to lose", () => {
  /** Chinjao's [On Play] asks for an Event; the hand holds the Counter one and a cheaper one. */
  const chinjaoPaying = (seed: string) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("chinjao", "OP15-048"),
        instance("ace", "OP15-021"),
        instance("bulls", "OP15-019"),
      ])
      .withLife("p1", LIFE)
      .build();
    game.play({ type: "play-card", cardInstanceId: "chinjao" });
    game.play({ summary: "Trash 1 Event from your hand" });
    return game;
  };

  it("pays Chinjao with the Counter-less Event, not the [Counter] one", async () => {
    const game = chinjaoPaying("lucy-pay-bulls");

    const action = await chosen(game);
    expect(action.summary).toContain("Barrier Bulls");
  });

  it("pays with the first card offered once the rule is off", async () => {
    const game = chinjaoPaying("lucy-pay-default");

    const action = await chosen(game, ["op15-lucy-hand-payment"]);
    expect(action.summary).toContain("Just Watch Me, Ace!!!");
  });

  /**
   * OP15-054 cast off Sabo: draw two, trash one, then play a {Dressrosa}
   * Character of cost 4 or less. The engine attributes every step to Sabo.
   */
  const mementoOffSabo = (seed: string) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("sabo", "OP15-046"),
        instance("memento", "OP15-054"),
        instance("cavendish", "OP15-006"),
        instance("barto", "OP15-014"),
      ])
      .withDeckTop("p1", [
        instance("draw-1", "OP15-019"),
        instance("draw-2", "OP15-019"),
      ])
      .withLife("p1", LIFE)
      .build();
    game.play({ type: "play-card", cardInstanceId: "sabo" });
    game.play({ summary: "And No One Else Can Have It" });
    game.play({ summary: "Draw 2, trash 1" });
    return game;
  };

  it("trashes the drawn Event rather than a body", async () => {
    const game = mementoOffSabo("lucy-memento-trash");

    const action = await chosen(game);
    expect(action.summary).toContain("Barrier Bulls");
  });

  it("then puts Bartolomeo down with the free play", async () => {
    const game = mementoOffSabo("lucy-memento-play");
    game.play({ summary: "Barrier Bulls" });

    const action = await chosen(game);
    expect(action.summary).toContain("Bartolomeo");
  });
});

describe("Lucy pays Fire Fist's rider only for a body worth two cards", () => {
  /** Fire Fist paid for in DON!!, its −8000 aimed at the one body across the table. */
  const fireFistInto = (seed: string, body: string) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(13, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("fire", "OP15-020"),
        instance("bulls", "OP15-019"),
        instance("sabo", "OP15-046"),
      ])
      .withBoard("p2", [character("target", body)])
      .withLife("p1", LIFE)
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP15-020" });
    game.play({ type: "resolve-effect", optionId: "target" });
    return game;
  };

  it("trashes two cards to K.O. a 4-cost put at 0", async () => {
    // OP15-048 is a 4-cost 5000: −8000 leaves it at −3000.
    const game = fireFistInto("lucy-fire-ko", "OP15-048");

    const action = await chosen(game);
    expect(action.type === "resolve-effect" && action.optionId).toBe("apply");
  });

  it("then pays with the Event, not the 7-cost body", async () => {
    const game = fireFistInto("lucy-fire-pay", "OP15-048");
    game.play({ type: "resolve-effect", optionId: "apply" });

    const action = await chosen(game);
    expect(action.summary).toContain("Barrier Bulls");
  });

  it("keeps the cards when the body at 0 is a 1-cost", async () => {
    // OP15-040 is a 1-cost 2000: the −8000 already holds it for their turn.
    const game = fireFistInto("lucy-fire-keep", "OP15-040");

    const action = await chosen(game);
    expect(action.type === "resolve-effect" && action.optionId).toBe("skip");
  });

  it("pays for the 1-cost once the rule is off", async () => {
    const game = fireFistInto("lucy-fire-default", "OP15-040");

    const action = await chosen(game, ["op15-lucy-fire-fist"]);
    expect(action.type === "resolve-effect" && action.optionId).toBe("apply");
  });
});

describe("Lucy pitches into a Leader attack only to put it past their last hand", () => {
  /** The Leader swings at theirs; what varies is their Life, their hand and their board. */
  const swinging = (
    seed: string,
    options: {
      theirLife?: readonly ReturnType<typeof instance>[];
      theirHand?: readonly ReturnType<typeof instance>[];
      theirBoard?: readonly ReturnType<typeof character>[];
    } = {},
  ) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("bulls", "OP15-019"),
        instance("luffy", "OP15-055"),
      ])
      .withHand("p2", [...(options.theirHand ?? [])])
      .withBoard("p2", [...(options.theirBoard ?? [])])
      .withLife("p1", LIFE)
      // `bareTable` empties the deck `withLife` deals from, so their Life is
      // named too.
      .withLife("p2", [
        ...(options.theirLife ?? [instance("their-life-1", "ST34-003")]),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    return game;
  };

  it("trashes the one card that puts the hit past an empty hand", async () => {
    // 5000 into 5000 with nothing to Counter it: the tie goes to the attacker
    // only at +1, so one card decides their last Life.
    const game = swinging("lucy-lethal-pitch");

    const action = await chosen(game);
    expect(action.summary).toContain("Barrier Bulls");
  });

  it("stops once the attack is past what they hold", async () => {
    const game = swinging("lucy-lethal-stop");
    game.play({ summary: "Barrier Bulls" });

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });

  it("keeps the cards while they have Life to spare", async () => {
    const game = swinging("lucy-lethal-early", {
      theirLife: [
        instance("their-life-1", "ST34-003"),
        instance("their-life-2", "ST34-003"),
        instance("their-life-3", "ST34-003"),
      ],
    });

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });

  it("keeps the cards when the hand cannot clear their Counter", async () => {
    // Two cards in their hand price at 4000; two Events reach 2000 of the
    // 4001 needed, so pitching buys a smaller loss and nothing else.
    const game = swinging("lucy-lethal-short", {
      theirHand: [instance("c-1", "ST34-003"), instance("c-2", "ST34-003")],
    });

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });

  it("keeps the cards when an active Blocker can take the attack", async () => {
    const game = swinging("lucy-lethal-blocker", {
      theirBoard: [character("blocker", "OP15-046")],
    });

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });
});

describe("Lucy free-casts the Counter Event only into a body", () => {
  const saboHoldingAce = (seed: string, opponentBoard: string[]) => {
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("sabo", "OP15-046"),
        instance("ace", "OP15-021"),
      ])
      .withBoard(
        "p2",
        opponentBoard.map((cardNumber, index) =>
          character(`body-${index}`, cardNumber),
        ),
      )
      .withLife("p1", LIFE)
      .build();
    game.play({ type: "play-card", cardInstanceId: "sabo" });
    return game;
  };

  it("casts it off Sabo while they have a Character to shrink", async () => {
    // Free, it is still a base-cost-4 Event activated this turn -- the Leader's
    // draw -- and the -3000 lands on the one body across the table.
    const game = saboHoldingAce("lucy-free-ace", ["OP15-014"]);

    const action = await chosen(game);
    expect(action.summary).toContain("Just Watch Me, Ace!!!");
  });

  it("keeps it for the Counter window into an empty board", async () => {
    const game = saboHoldingAce("lucy-free-ace-empty", []);

    const action = await chosen(game);
    expect(action.summary).toContain("no more cards");
  });
});

describe("Lucy casts OP15-054 before paying for the body it plays", () => {
  /**
   * Four DON!!, and a hand that can spend them two ways: Bartolomeo for 4, or
   * OP15-054 for 4 with Bartolomeo arriving through its play half. The Stage
   * is already out so `op15-lucy-stage-first` has nothing to say.
   */
  const fourDon = (
    seed: string,
    hand: readonly ReturnType<typeof instance>[],
  ) =>
    scenario()
      .decks(LUCY, OPPONENT)
      .seed(seed)
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withDonDeck("p1", 6)
      .withStage("p1", instance("standing", "OP15-057"))
      .withHand("p1", [...hand])
      .withLife("p1", LIFE)
      .withLife("p2", THEIR_LIFE)
      .build();

  const line = [
    instance("cavendish", "OP15-006"),
    instance("memento", "OP15-054"),
    instance("barto", "OP15-014"),
  ];

  it("casts the Event rather than paying for Bartolomeo", async () => {
    const game = fourDon("lucy-memento-line", line);

    const action = await chosen(game);
    expect(action.type).toBe("activate-main");
    expect(action.summary).toContain("And No One Else Can Have It");
  });

  it("develops the 4-cost body once the rule is off", async () => {
    // `chooseGenericRules` develops before it activates, and the two 4-costs
    // tie on cost, so hand order gives it Cavendish.
    const game = fourDon("lucy-memento-line-off", line);

    const action = await chosen(game, ["op15-lucy-memento-line"]);
    expect(action.type).toBe("play-card");
  });

  it("leaves the Events in hand order when the Event has nothing to put down", async () => {
    // Sabo costs 7: OP15-054's play half cannot reach it, so the gate is shut
    // and the ladder takes the first Event offered, which is Barrier Bulls.
    const game = fourDon("lucy-memento-no-body", [
      instance("bulls", "OP15-019"),
      instance("memento", "OP15-054"),
      instance("sabo", "OP15-046"),
    ]);

    const action = await chosen(game);
    expect(action.type).toBe("activate-main");
    expect(action.summary).toContain("Barrier Bulls");
  });
});

describe("Lucy spends the turn on attacks once they are on their last Life", () => {
  /** Bonney: at 1 Life its Leader is 7000 on Lucy's turn, above every body here. */
  const BONNEY = "(Red/Yellow) Jewelry Bonney - Official Feature Deck";

  const pressTurn = (seed: string, opponentLife: number) =>
    scenario()
      .decks(LUCY, BONNEY)
      .seed(seed)
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withDonDeck("p1", 4)
      .withBoard("p1", [character("barto", "OP15-014")])
      .withHand("p1", [
        instance("cavendish", "OP15-006"),
        instance("bulls", "OP15-019"),
      ])
      .withLife("p1", LIFE)
      .withLife(
        "p2",
        Array.from({ length: opponentLife }, (_, i) =>
          instance(`their-life-${i}`, "EB04-002"),
        ),
      )
      .build();

  it("gives the first DON!! to the body nearest their Leader", async () => {
    // Six DON!!. Bartolomeo at 6000 is one DON!! short of the 7000 Leader;
    // the 5000 Leader is two. Cavendish and Barrier Bulls are both affordable
    // and both held.
    const game = pressTurn("lucy-press", 1);

    const action = await chosen(game);
    expect(action.type).toBe("attach-don");
    expect(action.summary).toContain("Bartolomeo");
  });

  it("develops first once the rule is off", async () => {
    const game = pressTurn("lucy-press-off", 1);

    const action = await chosen(game, ["op15-lucy-press"]);
    expect(action.type).toBe("play-card");
  });

  it("develops when only one attack can be brought up to their Leader", async () => {
    // No body on the field: the Leader alone reaches 7000 with two of the six
    // DON!!, but
    // one hit is a decision they can answer by taking it, so the turn builds
    // the second attacker instead.
    const game = scenario()
      .decks(LUCY, BONNEY)
      .seed("lucy-press-lone")
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withDonDeck("p1", 4)
      .withHand("p1", [
        instance("cavendish", "OP15-006"),
        instance("bulls", "OP15-019"),
      ])
      .withLife("p1", LIFE)
      .withLife("p2", [instance("their-life-1", "EB04-002")])
      .build();

    const action = await chosen(game);
    expect(action.type).toBe("play-card");
  });

  it("develops while they still have Life to trade", async () => {
    // At 2 Life a Leader hit is absorbed, and their Leader is back to 5000.
    const game = pressTurn("lucy-press-shut", 2);

    const action = await chosen(game);
    expect(action.type).toBe("play-card");
  });
});
