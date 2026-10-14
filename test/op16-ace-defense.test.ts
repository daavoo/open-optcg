import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, instance, scenario } from "./support/index.js";

/**
 * OP-16 Red Ace's defence: the Counter phase, and the one clause the seat pays
 * for out of hand while defending.
 *
 * Each judgement is pinned twice: once as the decision the seat makes, and once
 * with the module disabled, so each test states the default the rule is
 * overriding as well as the rule itself.
 *
 * Every case asserts the chosen *action*. What is at stake is which card leaves
 * the hand and whether a body survives, and neither is worth pinning through
 * the game that follows.
 */

const ACE = "(Red) Portgas.D.Ace - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP16-001";
const MODULE = "op16-ace-defense";
/** The deck's main module, which owns the 7000 clause's price. */
const MAIN_MODULE = "op16-ace";

async function chosen(
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
  disable: readonly string[] = [],
) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

/**
 * p2 swings a 10000 at p1's OP16-003 Edward.Newgate, also 10000, so the
 * shortfall is the 1 the attacker's tie-break creates and a single 1000 Counter
 * closes it. p1 holds exactly one: OP16-017 LittleOars Jr.
 *
 * `threat` adds a second active 10000 that has not swung yet, which is what
 * puts the Leader in danger for the turn; `hand` and `attackerDon` are how the
 * multi-card case widens the gap the save has to close.
 */
function newgateUnderAttack(
  seed: string,
  options: {
    life: number;
    threat?: boolean;
    hand?: readonly string[];
    attackerDon?: number;
  },
) {
  const board = [
    character("attacker", "OP14-101", { playedTurn: 1 }),
    ...(options.threat === true
      ? [character("threat", "OP14-101", { playedTurn: 1 })]
      : []),
  ];
  const scene = scenario()
    .decks(ACE, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .withRestedLeader("p2")
    // Only a rested Character may be attacked, so Newgate has already swung --
    // which is also the position the deck is in every turn it attacks with the
    // body it just played.
    .withBoard("p1", [
      character("newgate", "OP16-003", { playedTurn: 10, rested: true }),
    ])
    .withBoard("p2", board)
    .withHand(
      "p1",
      (options.hand ?? ["OP16-017"]).map((cardNumber, index) =>
        instance(index === 0 ? "oars" : `counter-${index}`, cardNumber),
      ),
    )
    .withLife("p1", options.life);
  if (options.attackerDon !== undefined) {
    scene.withGivenDon("p2", "attacker", options.attackerDon);
  }
  const game = scene.build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "newgate",
  });
  // OP16-003 is no [Blocker] and p1 has none out, so the block phase is `pass`.
  while (game.state.phase === "block") game.pass();
  return game;
}

describe("OP-16 Ace spends a Counter to keep its own big body", () => {
  it("saves Newgate with the 1000 while the turn is survivable", async () => {
    const game = newgateUnderAttack("ace-save", { life: 3 });
    expect(game.state.phase).toBe("counter");

    const action = await chosen(game);
    expect(action.type).toBe("counter");
    if (action.type !== "counter") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("oars");
  });

  it("lets Newgate die once the module is off, which is the bug", async () => {
    // `chooseGenericCounter`'s protected set is empty, so every Character this
    // deck ever plays is "replaceable" to it.
    const game = newgateUnderAttack("ace-save-off", { life: 3 });

    const action = await chosen(game, [MODULE]);
    expect(action.type).toBe("pass");
  });
});

describe("OP-16 Ace defends its body while the Leader is still in danger", () => {
  /**
   * One Life, and a second active 10000 body that has not swung yet, so the
   * turn can still end the game. The generic price refuses every Character save
   * in that position; this deck pays anyway, because the body it is holding is
   * an attack every turn it survives and the Leader's grant is freed for the
   * next card out of hand.
   */
  const posed = (seed: string) =>
    newgateUnderAttack(seed, { life: 1, threat: true });

  it("spends the Counter on Newgate anyway", async () => {
    const game = posed("ace-unsaveable");
    expect(game.state.phase).toBe("counter");

    const action = await chosen(game);
    expect(action.type).toBe("counter");
    if (action.type !== "counter") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("oars");
  });

  it("takes the K.O. once the module is off", async () => {
    const game = posed("ace-unsaveable-off");

    const action = await chosen(game, [MODULE]);
    expect(action.type).toBe("pass");
  });
});

describe("OP-16 Ace pays more than one card for its own 10000", () => {
  /**
   * Three DON!! on the attacker puts it at 13000 against Newgate's 10000, so
   * the gap is 3001 and no single Counter in this list can close it. p1 holds
   * two 2000s and the 1000, which can.
   *
   * This is the case `economicalCharacterDefense` exists to refuse: on, the
   * save is declined for costing more than one card, whatever the body is.
   */
  const posed = (seed: string) =>
    newgateUnderAttack(seed, {
      life: 3,
      hand: ["OP16-017", "OP13-007", "OP17-016"],
      attackerDon: 3,
    });

  it("opens a multi-card Counter line to keep it", async () => {
    const game = posed("ace-multi");
    expect(game.state.phase).toBe("counter");

    const action = await chosen(game);
    expect(action.type).toBe("counter");
  });

  it("declines the whole line once the module is off", async () => {
    const game = posed("ace-multi-off");

    const action = await chosen(game, [MODULE]);
    expect(action.type).toBe("pass");
  });
});

/**
 * OP16-015 Monkey.D.Luffy's `[On Your Opponent's Attack]`, twice in one turn.
 *
 * The clause writes a base power that lasts the turn, and prints no
 * `[Once Per Turn]` -- so a turn's second attack is offered a trade whose
 * goods the first attack already bought. p2 swings two 6000 bodies, the second
 * with a DON!! on it, into a 5000 Leader:
 *
 *  - the first is a 1001 shortfall the 7000 closes, and paying is right;
 *  - the second is a 1001 shortfall against a Leader that is *already* 7000,
 *    so the clause adds nothing and the 8000-power Character out of hand is
 *    the whole price of nothing.
 *
 * The rule reads the Leader's live base rather than its printed power, which
 * is the difference between those two positions; read printed, they are the
 * same 2000 gain and the seat pays twice.
 */
function twoAttacksAtTheLeader(seed: string, secondDon = 1) {
  return (
    scenario()
      .decks(ACE, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .withRestedLeader("p2")
      .withBoard("p1", [character("luffy", "OP16-015", { playedTurn: 10 })])
      .withBoard("p2", [
        character("first", "ST31-002", { playedTurn: 1 }),
        character("second", "ST31-002", { playedTurn: 1 }),
      ])
      // Marco: 8000 power and no Counter, so it is what the clause asks for and
      // nothing the Counter step would rather have.
      .withHand("p1", [
        instance("marco-1", "OP16-014"),
        instance("marco-2", "OP16-014"),
      ])
      // 6000 + 1000, so the second attack is the same 1001 shortfall against a
      // Leader the first attack has already put at 7000.
      .withGivenDon("p2", "second", secondDon)
      .withLife("p1", 3)
      .build()
  );
}

/**
 * Declares one attack and plays p1's side of it with the agent, answering
 * every decision the battle puts to the defender.
 *
 * Returns the option the seat took on the 7000 clause's offer -- `"apply"` or
 * `"skip"` -- which is the whole subject of these two tests.
 */
async function defend(
  game: ReturnType<typeof twoAttacksAtTheLeader>,
  attacker: string,
  disable: readonly string[] = [],
): Promise<string | undefined> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: "p1-leader",
  });
  let offered: string | undefined;
  while (game.state.activeAttack && game.state.activePlayer === "p1") {
    const action = await agent.chooseAction(observe(game.state, "p1"));
    if (
      offered === undefined &&
      action.type === "resolve-effect" &&
      action.sourceCardNumber === "OP16-015"
    ) {
      offered = action.optionId;
    }
    game.submit(action);
  }
  return offered;
}

describe("OP-16 Ace pays for the 7000 once a turn, not once an attack", () => {
  it("pays on the first attack and declines on the second", async () => {
    const game = twoAttacksAtTheLeader("ace-7000-twice");

    expect(await defend(game, "first")).toBe("apply");
    expect(game.state.players.p1.leaderBasePowers?.[0]?.value).toBe(7000);

    expect(await defend(game, "second")).toBe("skip");
    // The second 8000-power Character is still in hand, which is the card the
    // traced game threw away.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "marco-2",
    );
  });

  it("declines against an attack the 7000 has already turned away", async () => {
    // The same position with the DON!! off the second body: 6000 into a Leader
    // the first attack put at 7000 is an attack that already fails, which the
    // engine still offers the trade against. `counterShortfall` reads 0, and a
    // rule phrased only as "the gain has to cover the shortfall" reads 0 >= 0
    // as a bargain and pays for a battle nobody can lose.
    const game = twoAttacksAtTheLeader("ace-7000-already-safe", 0);

    expect(await defend(game, "first")).toBe("apply");
    expect(await defend(game, "second")).toBe("skip");
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "marco-2",
    );
  });

  it("pays a second time once the module is off, which is the bug", async () => {
    const game = twoAttacksAtTheLeader("ace-7000-twice-off");

    expect(await defend(game, "first", [MAIN_MODULE])).toBe("apply");
    expect(await defend(game, "second", [MAIN_MODULE])).toBe("apply");
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("marco-2");
  });
});
