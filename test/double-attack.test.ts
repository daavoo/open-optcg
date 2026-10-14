import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  STATIC_ABILITIES,
  hasKeyword,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { tactics } from "@one-piece-sim/agents/local";
import {
  Game,
  character,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * [Double Attack], from every source the format prints it from.
 *
 * This file exists because a trace showed the keyword working in the engine and
 * nowhere else. `resolveBattle` pays the second point of damage correctly; every
 * layer above it counted *attacks* and assumed an attack was a Life. That
 * assumption is wrong for the eight cards below, and it was wrong in four places
 * at once -- the observation never reported an aura-granted keyword, the battle
 * never stated what a hit would cost, `turnBrief` counted swings, and `tactics`
 * decided lethal by swing count for every deck policy in the repo.
 *
 * So these tests are built the other way round from a card test: the *engine* is
 * the ground truth -- an opponent at 1 Life either loses to the hit or does not
 * -- and each layer above is then asked whether it says the same thing. The
 * per-source table is what makes this systematic rather than a fix for OP16-003:
 * "every source in the format is exercised here" derives its list from the card
 * database and fails when a set prints a ninth.
 *
 * ## What the engine's ground truth turned out to be
 *
 * When this file was written it answered "loses to the hit", and said so in
 * nine places. That was wrong. Bandai's rules Q&A, under Keyword Effects:
 * "If my opponent has 1 Life card, can I win the game by using a [Double
 * Attack] to deal 2 damage? -- No, you cannot." Each point of the damage checks
 * a Life card, and against a defender on 1 Life the second point has none to
 * check.
 *
 * The reasoning the file recorded -- "the second point lands on a Leader
 * already at 0 Life", so it wins the way any damage at 0 Life wins -- conflates
 * two rules. An attack *declared* against a player already on 0 Life ends the
 * game; the tail of a battle that has already resolved does not. Both readings
 * are now tested, per source, which is the useful shape a per-source table has:
 * being wrong in nine places at once is also being fixed in nine places at
 * once.
 */

/** p1 acting, both boards bare, all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(
      "(Red) Portgas.D.Ace - Official Feature Deck",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    )
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** Life as named cards; `bareTable()` empties the deck `withLife(n)` draws from. */
const life = (count: number, owner: string) =>
  Array.from({ length: count }, (_, index) =>
    instance(`${owner}-life-${index}`, "OP01-016"),
  );

/**
 * One way the format switches [Double Attack] on, and who ends up holding it.
 *
 * `holder` is deliberately not always the card named: four of these give the
 * keyword to a *different* card, which is the whole reason the observation had
 * to change. `reach` returns a game sitting in its Main Phase with the keyword
 * in force and nothing pending.
 */
interface Source {
  readonly cardNumber: string;
  readonly shape: string;
  readonly holder: string;
  readonly reach: (seed: string, opponentLife: number) => Game;
}

const SOURCES: readonly Source[] = [
  {
    cardNumber: "OP16-003",
    shape: "aura onto the Leader, [Your Turn]",
    holder: "p1-leader",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [character("newgate", "OP16-003")])
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    cardNumber: "OP15-071",
    shape: "aura onto a named group, reaching the source itself",
    holder: "holly",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [
          character("holly", "OP15-071"),
          character("ohm", "OP15-061"),
        ])
        // 4000 and 2000 printed against a 5000 Leader: DON!! is what makes the
        // hit connect at all, and an attack that bounces never reaches the
        // damage step this file is about.
        .withGivenDon("p1", "holly", 2)
        .withGivenDon("p1", "ohm", 4)
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    cardNumber: "OP15-071",
    shape:
      "aura onto a named group, reaching the [Ohm] card rather than the source",
    holder: "ohm",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [
          character("holly", "OP15-071"),
          character("ohm", "OP15-061"),
        ])
        // 4000 and 2000 printed against a 5000 Leader: DON!! is what makes the
        // hit connect at all, and an attack that bounces never reaches the
        // damage step this file is about.
        .withGivenDon("p1", "holly", 2)
        .withGivenDon("p1", "ohm", 4)
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    // The ninth source, and the only one printed on a *Leader*: OP06-022
    // Yamato. `table()` leads p1 with a different deck, so the position states
    // the Leader the way the two Event entries below do -- and a Leader needs
    // no DON!! to reach 5000, which is what makes this the cheapest source in
    // the table.
    cardNumber: "OP06-022",
    shape: "printed on the Leader",
    holder: "p1-leader",
    reach: (seed, opponentLife) =>
      table(seed)
        .withLeader("p1", "OP06-022")
        .withGivenDon("p1", "p1-leader", 2)
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    cardNumber: "OP13-046",
    shape: "printed on the card",
    holder: "printed",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [character("printed", "OP13-046")])
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    cardNumber: "OP13-118",
    shape: "printed on the card",
    holder: "printed",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [character("printed", "OP13-118")])
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    // EB04-023 Chaka & Pell, the extra booster's own printed source. Nothing
    // conditional about the keyword, so the position is the bare body -- what
    // it adds to the table is a ninth source arriving with a *set* import
    // rather than with a deck, which is the case the derived list below exists
    // to catch.
    cardNumber: "EB04-023",
    shape: "printed on the card",
    holder: "printed",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [character("printed", "EB04-023")])
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    // OP07-009 Dogura & Magura: the only source in the pool that hands the
    // keyword to a card picked by its *cost and colour* rather than by name,
    // type or DON!!. A red 1-drop is a 2000 body, so the position pays four
    // DON!! into it -- an attack that bounces off a 5000 Leader never reaches
    // the damage step this file is about.
    cardNumber: "OP07-009",
    shape: "[On Play] granting it to a red 1-cost Character for the turn",
    holder: "deuce",
    reach: (seed, opponentLife) => {
      const game = table(seed)
        .withBoard("p1", [character("deuce", "OP07-013")])
        .withGivenDon("p1", "deuce", 4)
        .withHand("p1", [instance("dogura", "OP07-009")])
        .withLife("p2", life(opponentLife, "p2"))
        .build();
      game.play({ type: "play-card", cardNumber: "OP07-009" });
      game.play({ type: "resolve-effect", optionId: "deuce" });
      while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      return game;
    },
  },
  {
    // OP09-047 Kouzuki Oden, OP-09's printed source. A 10000 body needs no
    // DON!! to get through a 5000 Leader, so the position is the card alone.
    cardNumber: "OP09-047",
    shape: "printed on the card",
    holder: "printed",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [character("printed", "OP09-047")])
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    // OP09-084 Catarina Devon: the only source in the pool a card hands to
    // *itself* out of a choice of three keywords, so the position states the
    // Blackbeard Leader its clause is gated on and takes the first branch.
    cardNumber: "OP09-084",
    shape: "[Activate: Main] choosing between three keywords",
    holder: "devon",
    reach: (seed, opponentLife) => {
      const game = table(seed)
        .withLeader("p1", "OP09-081")
        .withBoard("p1", [character("devon", "OP09-084", { playedTurn: 1 })])
        .withLife("p2", life(opponentLife, "p2"))
        .build();
      game.play({ type: "activate-main", optionId: "mechanic-main:devon" });
      game.play({ type: "resolve-effect", optionId: "double-attack" });
      while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      return game;
    },
  },
  {
    cardNumber: "OP10-094",
    shape: "conditional on its own [DON!! x1]",
    holder: "donned",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [character("donned", "OP10-094")])
        .withGivenDon("p1", "donned", 1)
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    cardNumber: "OP13-009",
    shape: "conditional on another Character's type",
    holder: "dadan",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [
          character("dadan", "OP13-009"),
          character("higuma", "OP13-013"),
        ])
        .withGivenDon("p1", "dadan", 4)
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    cardNumber: "OP15-056",
    shape: "[Main] Event granting it to the Leader for the turn",
    holder: "p1-leader",
    reach: (seed, opponentLife) => {
      // "your [Lucy] Leader": the clause names the Leader it can reach, and no
      // shipped deck is led by OP15-002, so the position states the Leader.
      const game = table(seed)
        .withLeader("p1", "OP15-002")
        .withHand("p1", [instance("plan", "OP15-056")])
        .withDeckTop("p1", [
          instance("draw-a", "OP01-016"),
          instance("draw-b", "OP01-016"),
        ])
        .withLife("p2", life(opponentLife, "p2"))
        .build();
      game.play({ summary: "[OP15-056]" });
      while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      return game;
    },
  },
  {
    cardNumber: "OP16-039",
    shape: "[Main] Event granting it to a named Character for the turn",
    holder: "luffy",
    reach: (seed, opponentLife) => {
      const game = table(seed)
        .withHand("p1", [instance("plan", "OP16-039")])
        // OP16-015 Monkey.D.Luffy: the [Monkey.D.Luffy] card the Event names.
        .withBoard("p1", [character("luffy", "OP16-015", { playedTurn: 1 })])
        .withLife("p2", life(opponentLife, "p2"))
        .build();
      game.play({ summary: "[OP16-039]" });
      game.play({ type: "resolve-effect", optionId: "luffy" });
      while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      return game;
    },
  },
  {
    // EB02-018 Buggy: the keyword lands on the *Leader*, and only while this is
    // the controller's only [Buggy] Character -- the one source in the pool
    // whose gate is an identity the controller can spoil for themselves. The
    // Leader is a 5000 against a 5000, so the hit needs a DON!! behind it; an
    // attack that bounces never reaches the damage step this file is about.
    cardNumber: "EB02-018",
    shape: "[On Play] granting it to the Leader for the turn",
    holder: "p1-leader",
    reach: (seed, opponentLife) => {
      const game = table(seed)
        .withHand("p1", [instance("buggy", "EB02-018")])
        .withDon("p1", { active: 2 })
        .withLife("p2", life(opponentLife, "p2"))
        .build();
      game.play({ type: "play-card", cardInstanceId: "buggy" });
      game.play({ type: "resolve-effect", optionId: "p1-leader" });
      while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      game.play({ type: "attach-don", targetInstanceId: "p1-leader" });
      return game;
    },
  },
  {
    // The tenth source, from the EB-03 import: an `[On Play]` rather than an
    // Event, and gated on a *type* rather than on a name.
    cardNumber: "EB03-050",
    shape: "[On Play] granting it to a {Sky Island} Character for the turn",
    holder: "zoro",
    reach: (seed, opponentLife) => {
      const game = table(seed)
        .withHand("p1", [instance("conis", "EB03-050")])
        // OP15-113 Roronoa Zoro: a 6000 {Sky Island} body, which reaches the
        // 5000 Leader without any DON!! behind it.
        .withBoard("p1", [character("zoro", "OP15-113", { playedTurn: 1 })])
        .withLife("p2", life(opponentLife, "p2"))
        .build();
      game.play({ type: "play-card", cardInstanceId: "conis" });
      while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      return game;
    },
  },
  {
    // A promo that simply prints the keyword, with no condition at all -- the
    // plainest source in the table and the one the rest are measured against.
    // Six DON!! carry a 6000 past a 5000 Leader, which is what gets the attack
    // to the damage step this file is about.
    cardNumber: "P-028",
    shape: "printed on the Character, unconditional",
    holder: "ace",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [character("ace", "P-028")])
        .withGivenDon("p1", "ace", 6)
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    // ST-22's Edward.Newgate prints the keyword unconditionally on a 10000
    // body, which clears a 5000 Leader with no DON!! behind it.
    cardNumber: "ST22-003",
    shape: "printed on the Character, unconditional, 10000",
    holder: "newgate",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [character("newgate", "ST22-003")])
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
  {
    // The same keyword behind a DON!! count on the card's own pile, which is
    // the other way the pool switches it on. The two DON!! the gate wants are
    // among the six that carry the body past the Leader, so one set of DON!!
    // pays for both halves.
    cardNumber: "P-003",
    shape: "granted by the card's own [DON!! x2]",
    holder: "kid",
    reach: (seed, opponentLife) =>
      table(seed)
        .withBoard("p1", [character("kid", "P-003")])
        .withGivenDon("p1", "kid", 6)
        .withLife("p2", life(opponentLife, "p2"))
        .build(),
  },
];

/**
 * Sources that hand the keyword over *inside* the attack they use it in, so no
 * `reach` can return a Main Phase position with it already in force.
 *
 * OP05-080 Elizabello II: "[When Attacking] [Once Per Turn] You may return 20
 * cards from your trash to your deck and shuffle it: This Character gains
 * [Double Attack] and +10000 power during this battle." The grant is the
 * attack's own clause, so the per-source table cannot hold it; it is exercised
 * by the dedicated test below, and listed here so the derived check still
 * demands a scenario for it.
 */
const BATTLE_SCOPED_SOURCES: readonly string[] = ["OP05-080"];

/** Twenty trash cards for Elizabello to shuffle back. */
const elizabelloTrash = () =>
  Array.from({ length: 20 }, (_, index) =>
    instance(`elizabello-trash-${index}`, "OP01-016"),
  );

/** Swings `holder` at the opposing Leader, with both sides declining to defend. */
function swing(game: Game, holder: string): GameState {
  game.play({
    type: "attack",
    attackerInstanceId: holder,
    targetInstanceId: "p2-leader",
  });
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
  return game.state;
}

describe("[Double Attack], every source in the format", () => {
  covers("OP16-003", "[Your Turn]");
  covers("OP15-056", "[Main]");
  covers("OP16-039", "[Main]");
  covers("EB03-050", "[On Play]");

  it.each(
    SOURCES.map(
      (source, index) =>
        [`${source.cardNumber}: ${source.shape}`, index, source] as const,
    ),
  )(
    "%s is reported by the observation, not only known to the engine",
    (_label, index, source) => {
      const state = source.reach(`double-attack-observed-${index}`, 3).state;
      expect(hasKeyword(state, "p1", source.holder, "Double Attack")).toBe(
        true,
      );

      // The layer the trace was missing. `hasKeyword` was already right; the
      // observation is what an agent, a policy and the UI actually read.
      const view = observe(state, "p1");
      const holder =
        source.holder === "p1-leader"
          ? view.self.leader
          : view.self.board.find((card) => card.instanceId === source.holder);
      expect(holder?.effectiveKeywords).toContain("Double Attack");
    },
  );

  it.each(
    SOURCES.map(
      (source, index) =>
        [`${source.cardNumber}: ${source.shape}`, index, source] as const,
    ),
  )("%s takes two Life, and does not win from one", (_label, index, source) => {
    const after = swing(
      source.reach(`double-attack-two-${index}`, 3),
      source.holder,
    );
    expect(after.players.p2.life).toHaveLength(1);
    expect(after.winner).toBeNull();

    // Bandai's rules Q&A, under Keyword Effects: "If my opponent has 1 Life
    // card, can I win the game by using a [Double Attack] to deal 2 damage?"
    // -- "No, you cannot." Each point checks a Life card, and the second has
    // none to check.
    //
    // This file used to assert the opposite for all nine sources, and said so
    // in its own comment. It was wrong, and being wrong in nine places at
    // once is what a per-source table is for.
    const notLethal = swing(
      source.reach(`double-attack-lethal-${index}`, 1),
      source.holder,
    );
    expect(notLethal.winner).toBeNull();
    expect(notLethal.players.p2.life).toEqual([]);
    // The one card it did take is in hand, as ordinary damage.
    expect(notLethal.players.p2.hand).toHaveLength(1);
  });

  it.each(
    SOURCES.map(
      (source, index) =>
        [`${source.cardNumber}: ${source.shape}`, index, source] as const,
    ),
  )(
    "%s wins from zero, where the attack itself is the kill",
    (_label, index, source) => {
      // The complement, and the reason the rule lives in
      // `settleDoubleAttackDamage` rather than in `dealDamage`: an attack
      // *declared* against a player already on 0 Life ends the game, for every
      // attacker in the format. What cannot win is the tail of a battle that has
      // already resolved.
      const lethal = swing(
        source.reach(`double-attack-from-zero-${index}`, 0),
        source.holder,
      );
      expect(lethal.winner).toBe("p1");
    },
  );

  it("OP05-080: granted mid-attack, takes two Life and does not win from one", () => {
    covers("OP05-080", "[When Attacking]");
    const swingElizabello = (seed: string, opponentLife: number) => {
      const game = table(seed)
        .withBoard("p1", [character("elizabello", "OP05-080")])
        .withTrash("p1", elizabelloTrash())
        .withLife("p2", life(opponentLife, "p2"))
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "elizabello",
        targetInstanceId: "p2-leader",
      });
      game.play({ type: "resolve-effect", optionId: "apply" });
      // Twenty picks, one per trash card: the order does not matter to a deck
      // that is shuffled a moment later.
      let guard = 0;
      while (
        game.state.pendingEffect &&
        game.state.phase !== "block" &&
        game.state.phase !== "counter"
      ) {
        if (guard++ > 40) throw new Error("Elizabello's cost never settled");
        game.play({ type: "resolve-effect" });
      }
      expect(hasKeyword(game.state, "p1", "elizabello", "Double Attack")).toBe(
        true,
      );
      expect(
        observe(game.state, "p1").self.board.find(
          (card) => card.instanceId === "elizabello",
        )?.effectiveKeywords,
      ).toContain("Double Attack");
      expect(game.state.players.p1.trash).toHaveLength(0);
      expect(game.state.players.p1.deck).toHaveLength(20);
      while (game.state.phase === "block" || game.state.phase === "counter") {
        game.pass();
      }
      while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      return game.state;
    };

    const two = swingElizabello("double-attack-elizabello-two", 3);
    expect(two.players.p2.life).toHaveLength(1);
    expect(two.winner).toBeNull();

    const notLethal = swingElizabello("double-attack-elizabello-one", 1);
    expect(notLethal.winner).toBeNull();
    expect(notLethal.players.p2.life).toEqual([]);
    expect(notLethal.players.p2.hand).toHaveLength(1);

    const lethal = swingElizabello("double-attack-elizabello-zero", 0);
    expect(lethal.winner).toBe("p1");
  });

  it("states what a hit will cost the defender, in the battle they must answer", () => {
    const game = SOURCES[0]!.reach("double-attack-life-cost", 2);
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    // Read from the defender's seat, which is the one deciding whether to spend
    // Counters: two Life at 2 Life is the whole hand's worth of decision.
    expect(observe(game.state, "p2").activeBattle?.lifeCost).toBe(2);
  });

  it("caps that cost at the Life the defender actually holds", () => {
    // At 1 Life the hit takes one card, not two: the second point has no Life
    // card to check. `lifeCost` is what the Counter and Block gates in
    // `generic-policy.ts` price a hit at, so an uncapped 2 here is a defender
    // told it is facing twice the damage it is.
    const game = SOURCES[0]!.reach("double-attack-life-cost-capped", 1);
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });

    expect(observe(game.state, "p2").activeBattle?.lifeCost).toBe(1);
  });

  it("says what the attack really does, in the summary both seats read", () => {
    // The `summary` on a legal action is what the web UI prints and what an
    // LLM reads for each option. At 1 opposing Life it
    // claimed the game, which is the ruling this change corrects; the truth is
    // that it takes the one card there is.
    const game = SOURCES[0]!.reach("double-attack-summary", 1);
    const attack = game
      .legalActions()
      .find(
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "p1-leader" &&
          action.targetInstanceId === "p2-leader",
      );
    expect(attack?.summary).toContain(
      "the defender loses 1 of their 1 Life card",
    );
    expect(attack?.summary).not.toContain("wins the game");

    // At 0 Life it is the game, and the summary says so -- the declared attack
    // rather than the second point of damage is what wins.
    const kill = SOURCES[0]!.reach("double-attack-summary-0", 0);
    expect(
      kill
        .legalActions()
        .find(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p1-leader" &&
            action.targetInstanceId === "p2-leader",
        )?.summary,
    ).toContain("the attacker wins the game");

    // At 2 Life the same attack empties the Life stack without winning, and the
    // summary says so in Life rather than in hits.
    const survivable = SOURCES[0]!.reach("double-attack-summary-2", 2);
    const nonLethal = survivable
      .legalActions()
      .find(
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "p1-leader" &&
          action.targetInstanceId === "p2-leader",
      );
    expect(nonLethal?.summary).toContain(
      "the defender loses 2 of their 2 Life cards",
    );
  });

  it("every source in the format is exercised here", () => {
    const printed = [...cardRegistry]
      .filter(([, definition]) =>
        definition.rules.tokens.includes("[Double Attack]"),
      )
      .map(([cardNumber]) => cardNumber)
      .sort();
    const covered = [
      ...new Set([
        ...SOURCES.map((source) => source.cardNumber),
        ...BATTLE_SCOPED_SOURCES,
      ]),
    ].sort();

    // Derived from the card database rather than listed, so a set that prints a
    // ninth source fails here until it has a scenario -- the same reason the
    // clause gate derives its list from printed text.
    expect(covered).toEqual(printed);
  });
});

describe("a keyword an aura hands over is reported, whatever the keyword", () => {
  /**
   * The generalisation of the OP16-003 bug: an aura gives a keyword to a card
   * whose own text does not mention it, so no amount of reading the holder
   * reveals it. Every such ability in the table gets a position here, and the
   * list is derived from the table so the next one is caught by this file rather
   * than by a trace.
   */
  const auraKeywordSources = STATIC_ABILITIES.filter(
    (ability) => ability.keyword && ability.scope.endsWith("aura"),
  ).map((ability) => ability.cardNumber);

  interface AuraCase {
    readonly build: () => GameState;
    /** The holder the aura reaches, and the keyword it hands over. */
    readonly holder: string;
    readonly keyword: string;
  }

  const CASES: Record<string, AuraCase> = {
    // OP16-003 Edward.Newgate: [Double Attack] onto its controller's Leader.
    "OP16-003": {
      build: () =>
        table("aura-op16-003")
          .withBoard("p1", [character("source", "OP16-003")])
          .build().state,
      holder: "p1-leader",
      keyword: "Double Attack",
    },
    // OP15-071 Holly: [Double Attack] onto every [Ohm] card, and itself.
    "OP15-071": {
      build: () =>
        table("aura-op15-071")
          .withBoard("p1", [
            character("source", "OP15-071"),
            character("ohm", "OP15-061"),
          ])
          .build().state,
      holder: "ohm",
      keyword: "Double Attack",
    },
    // OP15-070 Fuza: [Unblockable] onto every [Shura] card, and itself.
    "OP15-070": {
      build: () =>
        table("aura-op15-070")
          .withBoard("p1", [
            character("source", "OP15-070"),
            character("shura", "OP15-067"),
          ])
          .build().state,
      holder: "shura",
      keyword: "Unblockable",
    },
    // OP11-001 Koby (Leader): [Rush: Character] onto its {SWORD} Characters.
    "OP11-001": {
      build: () =>
        table("aura-op11-001")
          .withLeader("p1", "OP11-001")
          .withBoard("p1", [character("sword", "OP11-004", { playedTurn: 11 })])
          .build().state,
      holder: "sword",
      keyword: "Rush: Character",
    },
    // OP04-096 Corrida Coliseum: [Rush: Character] onto its controller's
    // {Dressrosa} Characters while the Leader is {Dressrosa}, from the Stage.
    "OP04-096": {
      build: () =>
        table("aura-op04-096")
          .withLeader("p1", "OP10-042")
          .withStage("p1", instance("source", "OP04-096"))
          .withBoard("p1", [character("zoro", "OP10-095", { playedTurn: 11 })])
          .build().state,
      holder: "zoro",
      keyword: "Rush: Character",
    },
    // OP17-079 Monkey.D.Luffy (Leader): [Blocker] onto cost-12-or-more bodies.
    "OP17-079": {
      build: () =>
        table("aura-op17-079")
          .withLeader("p1", "OP17-079")
          .withBoard("p1", [character("giant", "OP17-089")])
          .build().state,
      holder: "giant",
      keyword: "Blocker",
    },
  };

  it("has a position for every aura in the table", () => {
    expect(Object.keys(CASES).sort()).toEqual([...auraKeywordSources].sort());
  });

  it.each(Object.keys(CASES))(
    "%s: the observation agrees with the engine on every keyword",
    (cardNumber) => {
      const { build, holder, keyword } = CASES[cardNumber]!;
      const state = build();
      const view = observe(state, "p1");

      const reported = new Map<string, readonly string[]>([
        ["p1-leader", view.self.leader.effectiveKeywords],
        ...view.self.board.map(
          (card) =>
            [card.instanceId, card.effectiveKeywords] as [
              string,
              readonly string[],
            ],
        ),
      ]);

      // Parity rather than a named expectation: whatever `hasKeyword` answers
      // for each card is what the observation has to report. That is the
      // invariant the aura broke, and it holds for keywords nobody has printed
      // yet.
      for (const [instanceId, keywords] of reported) {
        for (const candidate of [
          "Blocker",
          "Rush",
          "Rush: Character",
          "Unblockable",
          "Double Attack",
          "Banish",
        ] as const) {
          expect(
            keywords.includes(candidate),
            `${cardNumber}: ${instanceId} ${candidate}`,
          ).toBe(hasKeyword(state, "p1", instanceId, candidate));
        }
      }

      // And the specific thing the parity check would still pass without: the
      // aura's own target holds the keyword the source, not the target, prints.
      expect(reported.get(holder)).toContain(keyword);
    },
  );
});

describe("the rules layer prices a hit in Life rather than in swings", () => {
  it("calls one [Double Attack] swing lethal against an opponent at 2 Life", () => {
    const state = table("tactics-lethal")
      .withBoard("p1", [character("newgate", "OP16-003")])
      .withLife("p1", life(4, "p1"))
      .withLife("p2", life(2, "p2"))
      .build().state;
    const read = tactics(observe(state, "p1"));

    // Two attacks -- the Leader and Newgate itself -- but three Life, because
    // the Leader's is worth two. At 2 Life the swing count decided lethal on
    // `2 >= 2` here; the number that matters is 3.
    expect(read.maxLeaderHits).toBe(2);
    expect(read.maxLeaderDamage).toBe(3);
    expect(read.lethalInRange).toBe(true);
  });

  it("still reads one Life per swing when nothing grants the keyword", () => {
    const state = table("tactics-plain")
      .withLife("p1", life(4, "p1"))
      .withLife("p2", life(2, "p2"))
      .build().state;
    const read = tactics(observe(state, "p1"));

    expect(read.maxLeaderDamage).toBe(read.maxLeaderHits);
    expect(read.lethalInRange).toBe(false);
  });

  it("prices the Life it is facing, not the attacks", () => {
    // p2's turn, and p2 holds the Newgate that makes their Leader swing for two.
    const state = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Portgas.D.Ace - Official Feature Deck",
      )
      .seed("tactics-facing")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p2", [character("newgate", "OP16-003", { playedTurn: 1 })])
      .withLife("p1", life(2, "p1"))
      .withLife("p2", life(4, "p2"))
      .build().state;
    const read = tactics(observe(state, "p1"));

    // Newgate itself is a 10000 body that also reaches, so the swing count is
    // 2 and the Life at stake is 3: the Leader's hit is worth two of it.
    expect(read.incomingLeaderAttacks).toBe(2);
    expect(read.incomingLeaderDamage).toBe(3);
    expect(read.facingLethal).toBe(true);
  });
});
