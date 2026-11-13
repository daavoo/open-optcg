import { describe, expect, it } from "vitest";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's OP-18 card Q&A for the Green cards and the Black cards OP18-089
 * Dorry and OP18-119 Saint Shamrock, one case per ruling, named by its Q
 * number. Rulings an existing case in op18-green.test.ts or
 * op18-black.test.ts already pins are not repeated here.
 */

const GREEN_LUFFY = "OP18-022";
const FRANKY_LEADER = "OP18-021";

/** p1's turn on a bare table, with every DON!! it has active. */
const ownTurn = (seed: string, turn = 5) =>
  scenario()
    .seed(seed)
    .atTurn(turn, { active: "p1" })
    .bareTable()
    .withLife("p1", copies(3, "OP18-035", "p1-life"))
    .withLife("p2", copies(3, "OP18-035", "p2-life"))
    .withDeckTop("p1", copies(6, "OP18-035", "p1-deck"))
    .withDeckTop("p2", copies(6, "OP18-035", "p2-deck"));

/** p2's turn on a bare table: p1 is the defender. */
const theirTurn = (seed: string, turn = 4) =>
  scenario()
    .seed(seed)
    .atTurn(turn, { active: "p2" })
    .bareTable()
    .withLife("p1", copies(3, "OP18-035", "p1-life"))
    .withLife("p2", copies(3, "OP18-035", "p2-life"))
    .withDeckTop("p1", copies(6, "OP18-035", "p1-deck"))
    .withDeckTop("p2", copies(6, "OP18-035", "p2-deck"));

function offers(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId: string }).optionId);
}

/** Passes the block and Counter steps until the battle is over. */
function finishBattle(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the battle never ended");
    game.pass();
  }
}

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);
const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

/** p2 casts OP09-058 Special Muggy Ball at `target`. */
const muggyBall = (game: Game, target: string) => {
  game.play({ summary: "Activate Special Muggy Ball" });
  game.play({ type: "resolve-effect", optionId: target });
};

describe("OP-18 Q&A: OP18-021 Franky (Leader)", () => {
  covers(FRANKY_LEADER, "static");

  it("Q1513: a Stage's +3000 Counter is used from hand like a Character's, on a Character too", () => {
    const game = theirTurn("q1513")
      .withLeader("p1", FRANKY_LEADER)
      .withHand("p1", [instance("sunny", "EB02-009")])
      .withBoard("p1", [character("body", "OP18-035", { rested: true })])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 2 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    if (game.state.phase === "block") game.pass();
    const counter = game.action({
      type: "counter",
      cardInstanceId: "sunny",
    }) as { counterPower: number };
    expect(counter.counterPower).toBe(3000);
    game.submit(counter as never);

    expect(game.state.activeAttack?.targetInstanceId).toBe("body");
    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(ids(game.state.players.p1.trash)).toEqual(["sunny"]);
  });
});

describe("OP-18 Q&A: a card held through its next Refresh that is already active", () => {
  covers(GREEN_LUFFY, "[When Attacking]");
  covers("OP18-029", "[When Attacking]");

  /** Ends p1's turn and p2's, landing in p1's next Main Phase. */
  const nextOwnTurn = (game: Game) => {
    game.pass();
    game.pass();
    expect(game.state.turnPlayerId).toBe("p1");
  };

  it("Q1514: a Luffy Leader still active at its next Refresh stays active, and refreshes as usual after", () => {
    const game = ownTurn("q1514")
      .withLeader("p1", GREEN_LUFFY)
      .withGivenDon("p1", "p1-leader", 3)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    finishBattle(game);
    expect(game.state.players.p1.leaderRested).toBe(false);

    // Not attacking again: the Leader meets its next Refresh active.
    nextOwnTurn(game);
    expect(game.state.players.p1.leaderRested).toBe(false);

    // The hold was spent on that Refresh: rested now, it stands at the next.
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    if (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "skip" });
    }
    finishBattle(game);
    expect(game.state.players.p1.leaderRested).toBe(true);
    nextOwnTurn(game);
    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("Q1516: a Chopper still active at its next Refresh stays active, and refreshes as usual after", () => {
    const game = ownTurn("q1516")
      .withBoard("p1", [character("chopper", "OP18-029")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });
    if (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "p1-leader" });
    }
    finishBattle(game);
    expect(boardCard(game, "p1", "chopper")?.rested).toBe(false);

    nextOwnTurn(game);
    expect(boardCard(game, "p1", "chopper")?.rested).toBe(false);

    // [Once Per Turn] is fresh, so this swing restands it again; let the
    // battle end, then rest it by attacking once more.
    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });
    if (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "p1-leader" });
    }
    finishBattle(game);
    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });
    finishBattle(game);
    expect(boardCard(game, "p1", "chopper")?.rested).toBe(true);
    // The second restand's hold holds it through this Refresh, and only that.
    nextOwnTurn(game);
    expect(boardCard(game, "p1", "chopper")?.rested).toBe(true);
    nextOwnTurn(game);
    expect(boardCard(game, "p1", "chopper")?.rested).toBe(false);
  });
});

describe("OP-18 Q&A: OP18-031 Nico Robin", () => {
  covers("OP18-031", "[Opponent's Turn]");

  it("Q1518: a rested Robin cannot replace its own removal", () => {
    const game = theirTurn("q1518")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [character("robin", "OP18-031", { rested: true })])
      .build();

    muggyBall(game, "robin");

    expect(offers(game)).not.toContain("replace:robin");
    expect(ids(game.state.players.p1.board)).toEqual([]);
    expect(ids(game.state.players.p1.hand)).toContain("robin");
  });

  it("OPTCGSim 1.43a: Robin does not replace a battle K.O.", () => {
    const game = theirTurn("optcgsim-143a-robin")
      .withBoard("p1", [
        character("body", "OP18-035", { rested: true }),
        character("robin", "OP18-031"),
      ])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 2 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    let guard = 0;
    while (game.state.phase === "block" || game.state.phase === "counter") {
      if (guard++ > 10) throw new Error("the battle never ended");
      expect(offers(game)).not.toContain("replace:robin");
      game.pass();
    }

    expect(ids(game.state.players.p1.board)).toEqual(["robin"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["body"]);
    expect(boardCard(game, "p1", "robin")?.rested).toBe(false);
  });
});

describe("OP-18 Q&A: OP18-031 Nico Robin [End of Your Turn]", () => {
  covers("OP18-031", "[End of Your Turn]");

  it("Q1519: sets only its controller's DON!! active, never the opponent's", () => {
    const game = ownTurn("q1519")
      .withDon("p1", { rested: 2 })
      .withDon("p2", { rested: 3 })
      .withBoard("p1", [character("robin", "OP18-031")])
      .build();

    // Ending the turn runs the [End of Your Turn] and p2's Refresh in one
    // step; the events tell the two DON!! movements apart.
    game.pass();
    const activations = game.events.filter(
      (event) => event.type === "don-activated",
    ) as readonly { playerId: string }[];
    expect(activations.length).toBeGreaterThan(0);
    expect(activations.every((event) => event.playerId === "p1")).toBe(true);
  });
});

describe("OP-18 Q&A: OP18-037 Yokozuna [On K.O.]", () => {
  covers("OP18-037", "[On K.O.]");

  const koYokozuna = (seed: string) => {
    const game = theirTurn(seed)
      .withStage("p2", instance("their-stage", "EB02-009"))
      .withBoard("p1", [character("yokozuna", "OP18-037", { rested: true })])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 2 })])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "yokozuna",
    });
    finishBattle(game);
    return game;
  };

  it("Q1521: may rest the opponent's Leader", () => {
    const game = koYokozuna("q1521-leader");
    expect(offers(game)).toContain("p2-leader");
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    expect(game.state.players.p2.leaderRested).toBe(true);
  });

  it("Q1521: may rest the opponent's Stage", () => {
    const game = koYokozuna("q1521-stage");
    expect(offers(game)).toContain("their-stage");
    game.play({ type: "resolve-effect", optionId: "their-stage" });
    expect(game.state.players.p2.stage?.rested).toBe(true);
  });

  it("Q1521: may rest one of the opponent's DON!!", () => {
    const game = koYokozuna("q1521-don");
    const activeDon = [...game.state.players.p2.activeDon];
    const donOption = offers(game).find((option) => activeDon.includes(option));
    expect(donOption).toBeDefined();
    game.play({ type: "resolve-effect", optionId: donOption! });
    expect(game.state.players.p2.restedDon).toContain(donOption);
    expect(game.state.players.p2.activeDon).toHaveLength(activeDon.length - 1);
  });
});

describe("OP-18 Q&A: OP18-119 Saint Shamrock", () => {
  covers("OP18-119", "[On K.O.]", "[Activate: Main]");

  it("Q1540: played from the trash by its [On K.O.] on its own turn, it may [Activate: Main] that turn", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("q1540")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", copies(1, "ST32-004", "hand"))
      .withLife("p2", copies(3, "ST32-004", "p2-life"))
      .withBoard("p1", [
        character("hakuba", "OP05-087"),
        character("shamrock", "OP18-119", { playedTurn: 9 }),
      ])
      .withGivenDon("p1", "hakuba", 1)
      .withTrash("p1", [instance("cerberus", "OP18-085")])
      .build();

    // OP05-087 Hakuba K.O.s Shamrock as it attacks, on p1's own turn.
    game.play({
      type: "attack",
      attackerInstanceId: "hakuba",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "shamrock" });
    // Shamrock's [On K.O.]: a card from hand plays it back from the trash.
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 10) throw new Error("the effect never settled");
      const options = offers(game);
      const wanted =
        ["apply", "hand-1"].find((id) => options.includes(id)) ?? options[0]!;
      game.play({ type: "resolve-effect", optionId: wanted });
    }
    expect(ids(game.state.players.p1.board)).toContain("shamrock");
    finishBattle(game);
    expect(game.state.phase).toBe("main");

    game.play({ type: "activate-main", cardNumber: "OP18-119" });
    game.play({ type: "resolve-effect", optionId: "cerberus" });
    expect(ids(game.state.players.p1.board)).toContain("cerberus");
  });
});
