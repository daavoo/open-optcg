import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { character, copies, instance, scenario } from "./support/index.js";

const LUFFY_LEADER = "OP17-079";
const LUFFY_DECK = "(Black) Monkey.D.Luffy - Official Feature Deck";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const SAUL = "OP17-089";
const LOKI = "OP17-119";
const ZORO = "OP17-095";
const GERD = "OP17-081";
const USOPP = "OP17-080";

const agent = (disableModules: string[] = []) =>
  new RegistryRulesAgent(LUFFY_LEADER, { disableModules });

/**
 * The opponent's turn, with an attack already declared at one of this seat's
 * Characters. Life 4 on both sides so no Leader hit this turn is anywhere near
 * lethal, which keeps the generic Leader-defence gates out of the picture.
 */
function luffyUnderAttack(options: {
  hand?: ReturnType<typeof instance>[];
  selfBoard?: ReturnType<typeof character>[];
  opponentBoard?: ReturnType<typeof character>[];
  target: string;
  attackPower: number;
  phase?: "block" | "counter";
}) {
  return scenario()
    .decks(LUFFY_DECK, OPPONENT)
    .seed("op17-luffy-policy")
    .bareTable()
    .atTurn(8, { active: "p2" })
    .withLife("p1", copies(4, ZORO, "p1-life"))
    .withLife("p2", copies(4, "ST34-002", "p2-life"))
    .withBoard("p1", options.selfBoard ?? [])
    .withBoard(
      "p2",
      options.opponentBoard ?? [character("attacker", "ST34-002")],
    )
    .withHand("p1", options.hand ?? [])
    .withActiveAttack(
      {
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "attacker",
        targetInstanceId: options.target,
        attackPower: options.attackPower,
        counterPower: 0,
      },
      options.phase ?? "block",
    )
    .build();
}

describe("the block window", () => {
  it("blocks with Loki to save Saul when Loki outpowers the attack", async () => {
    // Both of `chooseGenericBlock`'s tests and the format's `free-block` open
    // with `targetInstanceId.endsWith("-leader")`, so an attack on a Character
    // had no block rule at all: the seat watched its only giant die with an
    // active 11000 Loki beside it. Loki reads 8000 + 3000 during the opponent's
    // turn and its own +12 cost puts it under the Leader's [Blocker] grant, so
    // it stops a 7000 attack, survives, and Saul keeps the board at 5000.
    const game = luffyUnderAttack({
      selfBoard: [character("saul", SAUL), character("loki", LOKI)],
      target: "saul",
      attackPower: 7_000,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "block", blockerInstanceId: "loki" });
    // The same board without the module passes, which is what pins the branch
    // rather than the outcome: nothing else in the registry blocks here.
    const without = await agent(["op17-luffy-block"]).chooseAction(
      observe(game.state, "p1"),
    );
    expect(without.type).not.toBe("block");
  });

  it("leaves a 2-drop to die rather than resting Loki", async () => {
    // The discriminating half: the six 2-drops are the bodies the giants buff,
    // not bodies that buff anything, and the deck runs twenty of them. Resting
    // Loki for one gives up the block that saves a giant later this turn.
    const game = luffyUnderAttack({
      selfBoard: [character("zoro", ZORO), character("loki", LOKI)],
      target: "zoro",
      attackPower: 7_000,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).not.toBe("block");
  });

  it("does not block for a giant the attack cannot beat", async () => {
    // 6000 into Saul at 6000: the attacker wins ties, so Saul dies -- but at
    // 5000 the attack falls short and there is nothing to save. Blocking here
    // would only rest Loki.
    const game = luffyUnderAttack({
      selfBoard: [character("saul", SAUL), character("loki", LOKI)],
      target: "saul",
      attackPower: 5_000,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).not.toBe("block");
  });
});

describe("the Counter window", () => {
  it("spends one 2000 Counter card to keep the only giant alive", async () => {
    // `chooseGenericCounter` caps a Character save at a 1000 shortfall, one
    // ordinary Counter card in a field priced on 1000s. Saul at 6000 against a
    // 7000 attack is a 1001 shortfall, so under the default the seat passes and
    // the whole board falls back to its printed 2000s. With the cap off, Gerd's
    // 2000 is the one-card line that closes it.
    const game = luffyUnderAttack({
      selfBoard: [character("saul", SAUL)],
      hand: [instance("gerd", GERD), instance("usopp", USOPP)],
      target: "saul",
      attackPower: 7_000,
      phase: "counter",
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "counter", cardInstanceId: "gerd" });
    const without = await agent(["op17-luffy-counter"]).chooseAction(
      observe(game.state, "p1"),
    );
    expect(without.type).not.toBe("counter");
  });

  it("does not spend Counter on a 2-drop", async () => {
    const game = luffyUnderAttack({
      selfBoard: [character("saul", SAUL), character("zoro", ZORO)],
      hand: [instance("gerd", GERD), instance("usopp", USOPP)],
      target: "zoro",
      attackPower: 6_000,
      phase: "counter",
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).not.toBe("counter");
  });
});

describe("the tournament list's conditional giants", () => {
  const TOURNAMENT = "(Black) Monkey.D.Luffy - Open OPTCG";
  const DOCKING_SIX = "OP15-088";
  const SUNNY = "ST14-017";

  const dockingSixUnderAttack = (withSunny: boolean) => {
    const builder = scenario()
      .decks(TOURNAMENT, OPPONENT)
      .seed("op17-luffy-policy-docking-six")
      .bareTable()
      .atTurn(8, { active: "p2" })
      .withLife("p1", copies(4, ZORO, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [character("docking", DOCKING_SIX)])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withHand("p1", [instance("gerd", GERD), instance("usopp", USOPP)]);
    return (
      withSunny ? builder.withStage("p1", instance("sunny", SUNNY)) : builder
    )
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "docking",
          attackPower: 8_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();
  };

  it("defends Docking Six as a giant once Thousand Sunny makes it a 12", async () => {
    // 7000 into an 8000 attack is a 1001 shortfall, past the field's one-card
    // cap. With the Stage out Docking Six is the "+12 cost" the team reads, so
    // Gerd's 2000 is spent to keep it.
    const game = dockingSixUnderAttack(true);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "counter", cardInstanceId: "gerd" });
  });

  it("leaves Docking Six at 11 to the ordinary price", async () => {
    // Without the Stage it buffs nothing, so it is an ordinary body and the
    // uncapped save does not apply.
    const game = dockingSixUnderAttack(false);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).not.toBe("counter");
  });
});

describe("the pitch order", () => {
  it("pays Sanji's trash cost with a Nami before a Loki", async () => {
    // Loki sits first in hand, so hand order -- the answer with no rule --
    // trashes the best giant in the list. Nami is a cost-1 Straw Hat the
    // trash-recursion clauses play again.
    const game = scenario()
      .decks(LUFFY_DECK, OPPONENT)
      .seed("op17-luffy-policy-pitch")
      .bareTable()
      .atTurn(8, { active: "p1" })
      .withHand("p1", [
        instance("loki", LOKI),
        instance("nami", "OP17-086"),
        instance("sanji", "OP17-082"),
      ])
      .withDeckTop("p1", copies(2, SAUL, "drawn"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-082" });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionCardNumber: "OP17-086",
    });
    const without = await agent(["op17-luffy-pitch"]).chooseAction(
      observe(game.state, "p1"),
    );
    expect(without).toMatchObject({ optionCardNumber: LOKI });
  });
});
