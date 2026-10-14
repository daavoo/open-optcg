import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";

import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * The (Yellow) Monkey.D.Luffy feature deck: the clauses its fifty brings into
 * the coverage gate -- the OP15-098 Leader's Life-for-a-body replacement,
 * OP15-119 Luffy's [Rush] and reveal, and OP15-116's two halves.
 *
 * Built on the Luffy deck against the (Blue) Rebecca deck, with `bareTable()`
 * emptying both, so each position holds only the cards its clause needs.
 */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(
      "(Yellow) Monkey.D.Luffy - Official Feature Deck",
      "(Blue) Rebecca - Official Feature Deck",
    )
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Take the apply branch of an `optional` prompt, if one is open. */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/** Answer every open prompt by declining it, or with its first option. */
function settleDeclining(game: Game) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 60) throw new Error("pending effect never settled");
    const options = effectOptions(game.state);
    const decline =
      options.find((optionId) => optionId === "skip" || optionId === "done") ??
      options[0]!;
    game.play({ type: "resolve-effect", optionId: decline });
  }
}

/** p2's Character swinging at one of p1's, already in its Counter step. */
const attackOn = (targetInstanceId: string, attackPower = 9000) =>
  ({
    attackerPlayerId: "p2",
    defenderPlayerId: "p1",
    attackerInstanceId: "attacker",
    targetInstanceId,
    attackPower,
    counterPower: 0,
  }) as const;

const replacementOption = (game: Game) =>
  effectOptions(game.state).find((option) => option.startsWith("mechanic:"));

describe("OP15-098 Monkey.D.Luffy (Leader)", () => {
  covers("OP15-098", "static");

  it("keeps a {Sky Island} 6000 in play after a lost battle, for the top Life card", () => {
    const game = table("op15-098-battle", "p2")
      .withBoard("p1", [character("zoro", "OP15-113", { rested: true })])
      .withBoard("p2", [character("attacker", "OP10-054")])
      .withLife("p1", [
        instance("life-top", "OP15-108"),
        instance("life-next", "OP15-107"),
      ])
      .withActiveAttack(attackOn("zoro"), "counter")
      .build();

    game.pass(); // no Counter; the battle resolves

    const replacement = replacementOption(game);
    expect(replacement).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replacement! });
    settleDeclining(game);

    expect(ids(game.state.players.p1.board)).toContain("zoro");
    expect(ids(game.state.players.p1.hand)).toContain("life-top");
    expect(ids(game.state.players.p1.life)).toEqual(["life-next"]);
  });

  it("answers the opponent's removal effect as well as a battle", () => {
    const game = table("op15-098-effect", "p2")
      .withHand("p2", [instance("thread", "OP10-079")])
      .withBoard("p1", [character("wyper", "OP15-114")])
      .withLife("p1", [instance("life-top", "OP15-108")])
      .build();

    game.play({ summary: "God Thread" });
    game.play({ type: "resolve-effect", optionId: "wyper" });

    const replacement = effectOptions(game.state).find((option) =>
      option.startsWith("replace:"),
    );
    expect(replacement).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replacement! });
    settleDeclining(game);

    expect(ids(game.state.players.p1.board)).toEqual(["wyper"]);
    expect(ids(game.state.players.p1.hand)).toContain("life-top");
  });

  it("does not guard a Character outside {Sky Island}, or one under 6000 base power", () => {
    for (const [label, cardNumber] of [
      // 8000 power, but {Straw Hat Crew} only.
      ["robin", "EB03-055"],
      // {Sky Island}, but 4000 printed power.
      ["ganfall", "OP15-102"],
    ] as const) {
      const game = table(`op15-098-outside-${label}`, "p2")
        .withBoard("p1", [character(label, cardNumber, { rested: true })])
        .withBoard("p2", [character("attacker", "OP10-054")])
        .withLife("p1", [instance("life-top", "OP15-108")])
        .withActiveAttack(attackOn(label, 12_000), "counter")
        .build();

      game.pass();
      expect(replacementOption(game), label).toBeUndefined();
      settleDeclining(game);
      expect(ids(game.state.players.p1.board), label).not.toContain(label);
    }
  });

  it("offers nothing on 0 Life", () => {
    const game = table("op15-098-no-life", "p2")
      .withBoard("p1", [character("zoro", "OP15-113", { rested: true })])
      .withBoard("p2", [character("attacker", "OP10-054")])
      .withLife("p1", [])
      .withActiveAttack(attackOn("zoro"), "counter")
      .build();

    game.pass();
    expect(replacementOption(game)).toBeUndefined();
    settleDeclining(game);
    expect(ids(game.state.players.p1.board)).not.toContain("zoro");
  });
});

describe("OP15-119 Monkey.D.Luffy", () => {
  covers("OP15-119", "static");

  it("has [Rush] at 6 or more DON!! on the field and not at 5, and is never a [Blocker]", () => {
    const at = (field: number) =>
      table(`op15-119-rush-${field}`)
        .withDonDeck("p1", 10 - field)
        .withBoard("p1", [character("luffy", "OP15-119", { playedTurn: 11 })])
        .build();

    const six = at(6);
    expect(hasKeyword(six.state, "p1", "luffy", "Rush")).toBe(true);
    // The [Blocker] its text names is the opponent's.
    expect(hasKeyword(six.state, "p1", "luffy", "Blocker")).toBe(false);
    expect(
      six
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "luffy",
        ),
    ).toBe(true);

    const five = at(5);
    expect(five.state.players.p1.activeDon).toHaveLength(5);
    expect(hasKeyword(five.state, "p1", "luffy", "Rush")).toBe(false);
    expect(
      five
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "luffy",
        ),
    ).toBe(false);
  });

  it("grows by the revealed Life card's cost when the opponent blocks", () => {
    const game = table("op15-119-blocker")
      .withBoard("p1", [character("luffy", "OP15-119")])
      // A 7-cost on top of Life: +7000.
      .withLife("p1", [instance("life-top", "OP15-109")])
      .withBoard("p2", [character("blocker", "OP06-032")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "blocker" });
    applyOptional(game);

    expect(currentPower(game.state, "p1", "luffy")).toBe(14_000);
    // A reveal moves nothing: the card is still the top of Life.
    expect(ids(game.state.players.p1.life)).toEqual(["life-top"]);
  });

  it("grows again for each Event, and stays unchanged on 0 Life", () => {
    const game = table("op15-119-event")
      .withBoard("p1", [character("luffy", "OP15-119")])
      // A 1-cost on top of Life: +1000 an answer.
      .withLife("p1", [instance("life-top", "OP15-108")])
      .withHand("p2", [
        instance("counter-a", "OP06-038"),
        instance("counter-b", "OP06-038"),
      ])
      .withDon("p1", { active: 3 })
      .withDon("p2", { active: 2 })
      .build();

    for (let i = 0; i < 3; i++) {
      game.play({ type: "attach-don", targetInstanceId: "luffy" });
    }
    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    if (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP06-038" });
    // The reveal is Luffy's controller's to take, though the defender's Event
    // raised it -- and the battle goes back to the defender's Counter step.
    expect(game.state.activePlayer).toBe("p1");
    applyOptional(game);
    settleDeclining(game);
    expect(game.state.activePlayer).toBe("p2");
    expect(game.state.phase).toBe("counter");
    expect(currentPower(game.state, "p1", "luffy")).toBe(11_000);

    game.play({ type: "activate-counter-event", cardNumber: "OP06-038" });
    applyOptional(game);
    settleDeclining(game);
    // No `[Once Per Turn]`: the second Event pays again.
    expect(currentPower(game.state, "p1", "luffy")).toBe(12_000);

    const empty = table("op15-119-no-life")
      .withBoard("p1", [character("luffy", "OP15-119")])
      .withLife("p1", [])
      .withBoard("p2", [character("blocker", "OP06-032")])
      .build();
    empty.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    empty.play({ type: "block", blockerInstanceId: "blocker" });
    applyOptional(empty);
    expect(currentPower(empty.state, "p1", "luffy")).toBe(7000);
  });
});

describe("OP15-116 Gum-Gum Golden Rifle", () => {
  it("[Main] trashes the top Life card, banks the deck top, and trashes a card from hand", () => {
    covers("OP15-116", "[Main]");
    const game = table("op15-116-main")
      .withHand("p1", [
        instance("rifle", "OP15-116"),
        instance("fodder", "OP15-107"),
      ])
      .withLife("p1", [
        instance("life-top", "OP15-108"),
        instance("life-next", "OP15-113"),
      ])
      .withDeckTop("p1", [instance("banked", "OP15-114")])
      .build();

    game.play({ summary: "Gum-Gum Golden Rifle" });
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 20) throw new Error("pending effect never settled");
      const options = effectOptions(game.state);
      const pick = ["banked", "fodder", "apply"].find((id) =>
        options.includes(id),
      );
      game.play({ type: "resolve-effect", optionId: pick ?? options[0]! });
    }

    expect(ids(game.state.players.p1.life)).toEqual(["banked", "life-next"]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["life-top", "fodder", "rifle"]),
    );
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("[Counter] gives the Leader +4000 for the battle", () => {
    covers("OP15-116", "[Counter]");
    const game = table("op15-116-counter", "p2")
      .withHand("p1", [instance("rifle", "OP15-116")])
      .withDon("p1", { active: 1 })
      .withBoard("p2", [character("attacker", "OP10-054")])
      .withActiveAttack(attackOn("p1-leader", 6000), "counter")
      .build();

    game.play({ type: "activate-counter-event", cardNumber: "OP15-116" });
    settleDeclining(game);

    expect(game.state.activeAttack?.counterPower ?? 0).toBe(4000);
  });
});
