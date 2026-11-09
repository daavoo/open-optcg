import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP-18's Green cards, OP18-021 through OP18-040 and OP18-118, one block per
 * card and per printed clause. Most of the colour exists to set the Green
 * Luffy Leader active again, so many of these cases are about a rested Leader
 * standing back up and about what holds it down through a Refresh Phase.
 *
 * OP18-035 Michael and Hoichael prints no text and has nothing to test.
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

/** The ids of the open decision's options. */
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

/** Ends the turn and answers nothing else on the way. */
function endTurn(game: Game): void {
  game.pass();
}

const boardIds = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].board.map((card) => card.instanceId);
const zoneIds = (
  game: Game,
  player: "p1" | "p2",
  zone: "hand" | "trash" | "deck",
) => game.state.players[player][zone].map((card) => card.instanceId);
const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

describe("OP18-021 Franky (Leader)", () => {
  covers(FRANKY_LEADER, "static");

  it("gives a Stage in hand a +3000 Counter", () => {
    const game = theirTurn("op18-021-counter")
      .withLeader("p1", FRANKY_LEADER)
      .withHand("p1", [instance("sunny", "EB02-009")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 2 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    if (game.state.phase === "block") game.pass();
    const counter = game.action({
      type: "counter",
      cardInstanceId: "sunny",
    }) as { counterPower: number };
    expect(counter.counterPower).toBe(3000);
    game.submit(counter as never);
    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(zoneIds(game, "p1", "trash")).toEqual(["sunny"]);
  });

  it("leaves a Character's printed Counter as it is", () => {
    const game = theirTurn("op18-021-counter-character")
      .withLeader("p1", FRANKY_LEADER)
      .withHand("p1", [instance("nami", "OP18-030")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 2 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    if (game.state.phase === "block") game.pass();
    const counter = game.action({
      type: "counter",
      cardInstanceId: "nami",
    }) as { counterPower: number };
    expect(counter.counterPower).toBe(2000);
  });

  it("gives a Stage nothing under any other Leader", () => {
    const game = theirTurn("op18-021-counter-other")
      .withLeader("p1", GREEN_LUFFY)
      .withHand("p1", [instance("sunny", "EB02-009")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 2 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    if (game.state.phase === "block") game.pass();
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "counter" && action.cardInstanceId === "sunny",
        ),
    ).toBe(false);
  });
});

describe("OP18-021 Franky (Leader) [Activate: Main]", () => {
  covers(FRANKY_LEADER, "[Activate: Main]");

  it("returns 1 DON!! to play a Stage with a cost of 5 or less from hand, once per turn", () => {
    const game = ownTurn("op18-021-activate")
      .withLeader("p1", FRANKY_LEADER)
      .withDon("p1", { active: 3 })
      .withHand("p1", [
        instance("sunny", "EB02-009"),
        instance("merry", "EB02-060"),
      ])
      .build();
    const donBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    game.play({ type: "activate-main", summary: "[OP18-021]" });
    game.play({ type: "resolve-effect", optionId: "sunny" });

    expect(game.state.players.p1.stage?.instanceId).toBe("sunny");
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(donBefore - 1);
    // [Once Per Turn]: the second Stage in hand is not a second offer.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("[OP18-021]"),
        ),
    ).toBe(false);
  });

  it("is not offered with no Stage in hand", () => {
    const game = ownTurn("op18-021-no-stage")
      .withLeader("p1", FRANKY_LEADER)
      .withDon("p1", { active: 3 })
      .withHand("p1", [instance("body", "OP18-035")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("[OP18-021]"),
        ),
    ).toBe(false);
  });
});

describe("OP18-022 Monkey.D.Luffy (Leader) [When Attacking]", () => {
  covers(GREEN_LUFFY, "[When Attacking]");

  const leaderTable = (seed: string, given: number) =>
    ownTurn(seed)
      .withLeader("p1", GREEN_LUFFY)
      .withGivenDon("p1", "p1-leader", given)
      .build();

  it("restands with 3 DON!! given, attacks again, and stays rested through its next Refresh", () => {
    const game = leaderTable("op18-022-restand", 3);

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.players.p1.leaderRested).toBe(false);
    finishBattle(game);

    // A second attack: [Once Per Turn] asks nothing this time.
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
    finishBattle(game);
    expect(game.state.players.p1.leaderRested).toBe(true);

    endTurn(game);
    endTurn(game);
    expect(game.state.turnPlayerId).toBe("p1");
    expect(game.state.players.p1.leaderRested).toBe(true);
    // Held for one Refresh only.
    endTurn(game);
    endTurn(game);
    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("may decline, and then refreshes as usual", () => {
    const game = leaderTable("op18-022-decline", 3);

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "skip" });
    finishBattle(game);
    expect(game.state.players.p1.leaderRested).toBe(true);

    endTurn(game);
    endTurn(game);
    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("asks nothing with only 2 DON!! given", () => {
    const game = leaderTable("op18-022-two-don", 2);

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.leaderRested).toBe(true);
  });
});

describe("OP18-023 Gaimon [On Play]", () => {
  covers("OP18-023", "[On Play]");

  it("gives an {East Blue} Character [Banish] until the end of the turn", () => {
    const game = ownTurn("op18-023-banish")
      .withDon("p1", { active: 1 })
      .withHand("p1", [instance("gaimon", "OP18-023")])
      .withBoard("p1", [
        character("buggy", "OP18-032"),
        character("body", "OP18-035"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-023" });
    // Gaimon is {East Blue} too; the Character without the type is not offered.
    expect(offers(game)).toEqual(expect.arrayContaining(["buggy", "gaimon"]));
    expect(offers(game)).not.toContain("body");
    game.play({ type: "resolve-effect", optionId: "buggy" });

    expect(hasKeyword(game.state, "p1", "buggy", "Banish")).toBe(true);
    endTurn(game);
    expect(hasKeyword(game.state, "p1", "buggy", "Banish")).toBe(false);
  });
});

describe("OP18-024 Kokoro", () => {
  covers("OP18-024", "[End of Your Turn]");

  it("may trash itself at the end of the turn to set the Leader active", () => {
    const game = ownTurn("op18-024-end")
      .withRestedLeader("p1")
      .withBoard("p1", [character("kokoro", "OP18-024")])
      .build();

    endTurn(game);
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(zoneIds(game, "p1", "trash")).toEqual(["kokoro"]);
    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("stays on the field when declined, and the Leader stays rested", () => {
    const game = ownTurn("op18-024-decline")
      .withRestedLeader("p1")
      .withBoard("p1", [character("kokoro", "OP18-024")])
      .build();

    endTurn(game);
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(boardIds(game, "p1")).toEqual(["kokoro"]);
    expect(game.state.players.p1.leaderRested).toBe(true);
  });
});

describe("OP18-025 Gonbe [End of Your Turn]", () => {
  covers("OP18-025", "[End of Your Turn]");

  it("sets the Leader active while it is rested", () => {
    const game = ownTurn("op18-025-rested")
      .withRestedLeader("p1")
      .withBoard("p1", [character("gonbe", "OP18-025", { rested: true })])
      .build();

    endTurn(game);

    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("does nothing while it is active", () => {
    const game = ownTurn("op18-025-active")
      .withRestedLeader("p1")
      .withBoard("p1", [character("gonbe", "OP18-025")])
      .build();

    endTurn(game);

    expect(game.state.players.p1.leaderRested).toBe(true);
  });
});

describe("OP18-026 Sanji", () => {
  covers("OP18-026", "static");

  /** p2 casts OP09-058 Special Muggy Ball at `target`. */
  const muggyBall = (game: Game, target: string) => {
    game.play({ summary: "Activate Special Muggy Ball" });
    game.play({ type: "resolve-effect", optionId: target });
  };

  it("is trashed in place of a {Straw Hat Crew} Character the opponent bounces", () => {
    const game = theirTurn("op18-026-save")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [
        character("usopp", "OP11-003"),
        character("sanji", "OP18-026"),
      ])
      .build();

    muggyBall(game, "usopp");
    expect(offers(game)).toContain("replace:sanji");
    game.play({ type: "resolve-effect", optionId: "replace:sanji" });

    expect(boardIds(game, "p1")).toEqual(["usopp"]);
    expect(zoneIds(game, "p1", "trash")).toEqual(["sanji"]);
  });

  it("covers itself: trashed instead of returned to hand", () => {
    const game = theirTurn("op18-026-self")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [character("sanji", "OP18-026")])
      .build();

    muggyBall(game, "sanji");
    game.play({ type: "resolve-effect", optionId: "replace:sanji" });

    expect(zoneIds(game, "p1", "hand")).not.toContain("sanji");
    expect(zoneIds(game, "p1", "trash")).toEqual(["sanji"]);
  });

  it("is not offered for a Character outside the crew", () => {
    const game = theirTurn("op18-026-other")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [
        character("body", "OP18-035"),
        character("sanji", "OP18-026"),
      ])
      .build();

    muggyBall(game, "body");

    expect(offers(game)).not.toContain("replace:sanji");
  });
});

describe("OP18-027 Zoro & Sogeking", () => {
  covers("OP18-027", "[Opponent's Turn]");

  const leaderPower = (game: Game) =>
    currentPower(game.state, "p1", "p1-leader", false);

  it("makes an active Luffy Leader with 3 DON!! given a 7000 on the opponent's turn", () => {
    const game = theirTurn("op18-027-static")
      .withLeader("p1", GREEN_LUFFY)
      .withGivenDon("p1", "p1-leader", 3)
      .withBoard("p1", [character("zoro", "OP18-027")])
      .build();

    expect(leaderPower(game)).toBe(7000);
  });

  it.each([
    ["only 2 DON!! given", 2, false, GREEN_LUFFY, 5000],
    ["a rested Leader", 3, true, GREEN_LUFFY, 5000],
    ["a Leader of another name", 3, false, FRANKY_LEADER, 5000],
  ])(
    "leaves %s at its printed power",
    (_label, given, rested, leader, expected) => {
      let builder = theirTurn(`op18-027-static-${String(given)}-${leader}`)
        .withLeader("p1", leader)
        .withGivenDon("p1", "p1-leader", given)
        .withBoard("p1", [character("zoro", "OP18-027")]);
      if (rested) builder = builder.withRestedLeader("p1");
      expect(leaderPower(builder.build())).toBe(expected);
    },
  );

  it("does nothing on its controller's own turn", () => {
    const game = ownTurn("op18-027-own-turn")
      .withLeader("p1", GREEN_LUFFY)
      .withGivenDon("p1", "p1-leader", 3)
      .withBoard("p1", [character("zoro", "OP18-027")])
      .build();

    // Printed 5000: no 7000 base on its controller's own turn.
    expect(leaderPower(game)).toBe(5000);
  });
});

describe("OP18-027 Zoro & Sogeking [On Play]", () => {
  covers("OP18-027", "[On Play]");

  it("sets 2 DON!! active, and a cost-6-or-less Character cannot be rested through the opponent's turn", () => {
    const game = ownTurn("op18-027-on-play", 7)
      .withDon("p1", { active: 5 })
      .withHand("p1", [instance("zoro", "OP18-027")])
      .withBoard("p2", [
        character("small", "ST31-002"),
        character("big", "OP18-118"),
      ])
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "play-card", cardNumber: "OP18-027" });
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 5 + 2);
    expect(offers(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(boardCard(game, "p2", "small")?.cannotRestUntilTurn).toBe(
      game.state.turn + 1,
    );
    expect(boardCard(game, "p2", "big")?.cannotRestUntilTurn).toBeUndefined();
  });
});

describe("OP18-028 Chimney [Activate: Main]", () => {
  covers("OP18-028", "[Activate: Main]");

  it("rests Gonbe and itself to set a Luffy Leader active", () => {
    const game = ownTurn("op18-028-activate")
      .withLeader("p1", GREEN_LUFFY)
      .withRestedLeader("p1")
      .withBoard("p1", [
        character("chimney", "OP18-028"),
        character("gonbe", "OP18-025"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[OP18-028]" });
    game.play({ type: "resolve-effect", optionId: "gonbe" });

    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(boardCard(game, "p1", "chimney")?.rested).toBe(true);
    expect(boardCard(game, "p1", "gonbe")?.rested).toBe(true);
  });

  it("is not offered without an active Gonbe", () => {
    const game = ownTurn("op18-028-no-gonbe")
      .withLeader("p1", GREEN_LUFFY)
      .withRestedLeader("p1")
      .withBoard("p1", [
        character("chimney", "OP18-028"),
        character("gonbe", "OP18-025", { rested: true }),
      ])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("[OP18-028]"),
        ),
    ).toBe(false);
  });

  it("pays but sets nothing active under a Leader of another name", () => {
    const game = ownTurn("op18-028-other-leader")
      .withLeader("p1", FRANKY_LEADER)
      .withRestedLeader("p1")
      .withBoard("p1", [
        character("chimney", "OP18-028"),
        character("gonbe", "OP18-025"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[OP18-028]" });
    game.play({ type: "resolve-effect", optionId: "gonbe" });

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(boardCard(game, "p1", "gonbe")?.rested).toBe(true);
  });
});

describe("OP18-029 Tony Tony.Chopper", () => {
  covers("OP18-029", "[When Attacking]", "[Rush]");

  it("attacks the turn it is played", () => {
    const game = ownTurn("op18-029-rush", 11)
      .withDon("p1", { active: 9 })
      .withHand("p1", [instance("chopper", "OP18-029")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-029" });
    expect(
      game.action({
        type: "attack",
        attackerInstanceId: "chopper",
        targetInstanceId: "p2-leader",
      }),
    ).toBeDefined();
  });

  it("gives 3 rested DON!! to the Leader, restands, and skips its next Refresh", () => {
    const game = ownTurn("op18-029-attack")
      .withDon("p1", { rested: 3 })
      .withBoard("p1", [character("chopper", "OP18-029")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(3);
    expect(boardCard(game, "p1", "chopper")?.rested).toBe(false);
    finishBattle(game);

    // The second swing asks nothing: [Once Per Turn].
    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
    finishBattle(game);

    endTurn(game);
    endTurn(game);
    expect(game.state.turnPlayerId).toBe("p1");
    expect(boardCard(game, "p1", "chopper")?.rested).toBe(true);
  });

  it("still restands with no rested DON!! to give", () => {
    const game = ownTurn("op18-029-no-don")
      .withBoard("p1", [character("chopper", "OP18-029")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(boardCard(game, "p1", "chopper")?.rested).toBe(false);
  });
});

describe("OP18-030 Nami", () => {
  covers("OP18-030", "[Opponent's Turn]");

  it.each([
    ["rested on the opponent's turn", false, true, 4000],
    ["active on the opponent's turn", false, false, 6000],
    ["rested on its own turn", true, true, 6000],
  ])("is %s", (_label, ownTurnNow, rested, expected) => {
    const builder = ownTurnNow
      ? ownTurn(`op18-030-${String(rested)}-own`)
      : theirTurn(`op18-030-${String(rested)}-theirs`);
    const game = builder
      .withBoard("p1", [character("nami", "OP18-030", { rested })])
      .build();

    expect(currentPower(game.state, "p1", "nami")).toBe(expected);
  });
});

describe("OP18-031 Nico Robin", () => {
  covers("OP18-031", "[Opponent's Turn]");

  const muggyBall = (game: Game, target: string) => {
    game.play({ summary: "Activate Special Muggy Ball" });
    game.play({ type: "resolve-effect", optionId: target });
  };

  it("rests in place of a Character the opponent bounces", () => {
    const game = theirTurn("op18-031-save")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [
        character("body", "OP18-035"),
        character("robin", "OP18-031"),
      ])
      .build();

    muggyBall(game, "body");
    game.play({ type: "resolve-effect", optionId: "replace:robin" });

    expect(boardIds(game, "p1")).toEqual(["body", "robin"]);
    expect(boardCard(game, "p1", "robin")?.rested).toBe(true);
  });

  it("may rest to keep itself on the field", () => {
    const game = theirTurn("op18-031-self")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [character("robin", "OP18-031")])
      .build();

    muggyBall(game, "robin");
    game.play({ type: "resolve-effect", optionId: "replace:robin" });

    expect(boardIds(game, "p1")).toEqual(["robin"]);
    expect(boardCard(game, "p1", "robin")?.rested).toBe(true);
  });

  it("cannot pay once it is rested", () => {
    const game = theirTurn("op18-031-rested")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [
        character("body", "OP18-035"),
        character("robin", "OP18-031", { rested: true }),
      ])
      .build();

    muggyBall(game, "body");

    expect(offers(game)).not.toContain("replace:robin");
  });
});

describe("OP18-031 Nico Robin [End of Your Turn]", () => {
  covers("OP18-031", "[End of Your Turn]");

  it("sets a {Water Seven} card and a DON!! active", () => {
    const game = ownTurn("op18-031-end")
      .withDon("p1", { rested: 2 })
      .withBoard("p1", [
        character("robin", "OP18-031"),
        character("chimney", "OP18-028", { rested: true }),
        character("usopp", "OP11-003", { rested: true }),
      ])
      .build();
    const restedBefore = game.state.players.p1.restedDon.length;

    endTurn(game);
    // Usopp is not {Water Seven}.
    expect(offers(game)).toContain("chimney");
    expect(offers(game)).not.toContain("usopp");
    game.play({ type: "resolve-effect", optionId: "chimney" });

    expect(boardCard(game, "p1", "chimney")?.rested).toBe(false);
    expect(boardCard(game, "p1", "usopp")?.rested).toBe(true);
    expect(game.state.players.p1.restedDon.length).toBeLessThan(restedBefore);
  });
});

describe("OP18-032 Buggy", () => {
  covers("OP18-032", "[On Play]");

  it("[On Play] holds a rested 8000-or-less Character down through the opponent's Refresh", () => {
    const game = ownTurn("op18-032-on-play", 7)
      .withDon("p1", { active: 5 })
      .withHand("p1", [instance("buggy", "OP18-032")])
      .withBoard("p2", [
        character("held", "ST31-002", { rested: true }),
        character("big", "OP18-118", { rested: true }),
        character("free", "OP18-035", { rested: true }),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-032" });
    expect(offers(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "held" });
    endTurn(game);

    expect(game.state.turnPlayerId).toBe("p2");
    expect(boardCard(game, "p2", "held")?.rested).toBe(true);
    expect(boardCard(game, "p2", "free")?.rested).toBe(false);
  });
});

describe("OP18-032 Buggy [On K.O.]", () => {
  covers("OP18-032", "[On K.O.]");

  it("K.O.'d on the opponent's turn, holds their attacker through their next Refresh", () => {
    const game = theirTurn("op18-032-on-ko")
      .withBoard("p1", [character("buggy", "OP18-032", { rested: true })])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 2 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "buggy",
    });
    finishBattle(game);
    expect(zoneIds(game, "p1", "trash")).toEqual(["buggy"]);
    game.play({ type: "resolve-effect", optionId: "attacker" });
    finishBattle(game);

    endTurn(game); // p2's turn ends
    endTurn(game); // p1's turn ends
    expect(game.state.turnPlayerId).toBe("p2");
    expect(boardCard(game, "p2", "attacker")?.rested).toBe(true);
  });
});

describe("OP-18 Green Blockers", () => {
  covers("OP18-024", "[Blocker]");
  covers("OP18-033", "[Blocker]");
  covers("OP18-037", "[Blocker]");

  it.each(["OP18-024", "OP18-033", "OP18-037"])(
    "%s blocks a declared attack",
    (cardNumber) => {
      const game = theirTurn(`op18-blocker-${cardNumber}`)
        .withBoard("p1", [character("blocker", cardNumber)])
        .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 2 })])
        .build();

      game.play({
        type: "attack",
        attackerInstanceId: "attacker",
        targetInstanceId: "p1-leader",
      });
      game.play({ type: "block", blockerInstanceId: "blocker" });

      expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
    },
  );
});

describe("OP18-033 Banban [End of Your Turn]", () => {
  covers("OP18-033", "[End of Your Turn]");

  it("may trash itself to set one of its Characters active", () => {
    const game = ownTurn("op18-033-end")
      .withBoard("p1", [
        character("banban", "OP18-033"),
        character("usopp", "OP11-003", { rested: true }),
      ])
      .build();

    endTurn(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "usopp" });

    expect(zoneIds(game, "p1", "trash")).toEqual(["banban"]);
    expect(boardCard(game, "p1", "usopp")?.rested).toBe(false);
  });

  it("stays when declined", () => {
    const game = ownTurn("op18-033-decline")
      .withBoard("p1", [
        character("banban", "OP18-033"),
        character("usopp", "OP11-003", { rested: true }),
      ])
      .build();

    endTurn(game);
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(boardIds(game, "p1")).toEqual(["banban", "usopp"]);
    expect(boardCard(game, "p1", "usopp")?.rested).toBe(true);
  });
});

describe("OP18-034 Franky [On Play]", () => {
  covers("OP18-034", "[On Play]");

  it("plays a crew card from hand, and with a 5-cost Stage out rests a cost-6-or-less Character", () => {
    const game = ownTurn("op18-034-stage", 9)
      .withDon("p1", { active: 6 })
      .withStage("p1", instance("big-sunny", "OP18-075"))
      .withHand("p1", [
        instance("franky", "OP18-034"),
        instance("usopp", "OP11-003"),
        instance("body", "OP18-035"),
      ])
      .withBoard("p2", [character("target", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-034" });
    // OP18-035 is {Water Seven} only.
    expect(offers(game)).not.toContain("body");
    game.play({ type: "resolve-effect", optionId: "usopp" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(boardIds(game, "p1")).toEqual(["franky", "usopp"]);
    expect(boardCard(game, "p2", "target")?.rested).toBe(true);
  });

  it("plays a Stage, and without a 5-cost Stage rests nothing", () => {
    const game = ownTurn("op18-034-no-stage", 9)
      .withDon("p1", { active: 6 })
      .withHand("p1", [
        instance("franky", "OP18-034"),
        instance("sunny", "EB02-009"),
      ])
      .withBoard("p2", [character("target", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-034" });
    game.play({ type: "resolve-effect", optionId: "sunny" });

    expect(game.state.players.p1.stage?.instanceId).toBe("sunny");
    expect(game.state.pendingEffect).toBeNull();
    expect(boardCard(game, "p2", "target")?.rested).toBe(false);
  });
});

describe("OP18-036 Monkey.D.Luffy [End of Your Turn]", () => {
  covers("OP18-036", "[End of Your Turn]");

  it("may trash itself to draw 1 and set the Leader active", () => {
    const game = ownTurn("op18-036-end")
      .withRestedLeader("p1")
      .withBoard("p1", [character("luffy", "OP18-036")])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    endTurn(game);
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(zoneIds(game, "p1", "trash")).toEqual(["luffy"]);
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("does nothing when declined", () => {
    const game = ownTurn("op18-036-decline")
      .withRestedLeader("p1")
      .withBoard("p1", [character("luffy", "OP18-036")])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    endTurn(game);
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
    expect(game.state.players.p1.leaderRested).toBe(true);
  });
});

describe("OP18-037 Yokozuna [On K.O.]", () => {
  covers("OP18-037", "[On K.O.]");

  it("rests one of the opponent's cards when K.O.'d in battle", () => {
    const game = theirTurn("op18-037-on-ko")
      .withBoard("p1", [character("yokozuna", "OP18-037", { rested: true })])
      .withBoard("p2", [
        character("attacker", "OP11-003", { playedTurn: 2 }),
        character("bystander", "OP18-035"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "yokozuna",
    });
    finishBattle(game);
    expect(offers(game)).toContain("bystander");
    game.play({ type: "resolve-effect", optionId: "bystander" });

    expect(boardCard(game, "p2", "bystander")?.rested).toBe(true);
  });
});

describe("OP18-038 Shoot Down That Flag", () => {
  covers("OP18-038", "[Main]");

  it("adds a {Straw Hat Crew} card from the top 5 and bottoms the rest", () => {
    const game = ownTurn("op18-038-main")
      .withHand("p1", [instance("flag", "OP18-038")])
      .withDeckTop("p1", [
        instance("miss-1", "OP18-035"),
        instance("hit", "OP11-003"),
        instance("miss-2", "OP18-025"),
        instance("miss-3", "OP18-028"),
        instance("miss-4", "OP18-035"),
        instance("untouched", "OP18-030"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[OP18-038]" });
    expect(offers(game)).not.toContain("miss-1");
    game.play({ type: "resolve-effect", optionId: "hit" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(zoneIds(game, "p1", "hand")).toEqual(["hit"]);
    expect(zoneIds(game, "p1", "deck")[0]).toBe("untouched");
  });
});

describe("OP18-038 Shoot Down That Flag [Trigger]", () => {
  covers("OP18-038", "[Trigger]");

  it("draws 1 card when revealed from Life", () => {
    const game = theirTurn("op18-038-trigger")
      .withLife("p1", [instance("flag", "OP18-038")])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 2 })])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    finishBattle(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    while (game.state.pendingEffect && game.state.activePlayer === "p1") {
      game.play({ type: "resolve-effect" });
    }

    expect(zoneIds(game, "p1", "trash")).toContain("flag");
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });
});

describe("OP18-039 Gum-Gum Giant Axe [Counter]", () => {
  covers("OP18-039", "[Counter]");

  const counterOn = (seed: string, rested: boolean) => {
    let builder = theirTurn(seed)
      .withLeader("p1", GREEN_LUFFY)
      .withHand("p1", [instance("axe", "OP18-039")])
      .withBoard("p2", [character("attacker", "ST31-002")]);
    if (rested) builder = builder.withRestedLeader("p1");
    return builder
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();
  };

  it("gives a Luffy Leader +2000 and draws while the Leader is active", () => {
    const game = counterOn("op18-039-active", false);
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "activate-counter-event", eventInstanceId: "axe" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.activeAttack?.counterPower).toBe(2000);
    // The Event left the hand and one card came in.
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("draws nothing while the Leader is rested", () => {
    const game = counterOn("op18-039-rested", true);
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "activate-counter-event", eventInstanceId: "axe" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.activeAttack?.counterPower).toBe(2000);
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });
});

describe("OP18-040 Diable Jambe Flambé Shot", () => {
  covers("OP18-040", "[Main]");

  it("K.O.s a rested Character with a cost of 7 or less", () => {
    const game = ownTurn("op18-040-main", 9)
      .withDon("p1", { active: 4 })
      .withHand("p1", [instance("shot", "OP18-040")])
      .withBoard("p2", [
        character("rested", "ST31-002", { rested: true }),
        character("active", "OP11-003"),
        character("big", "OP18-118", { rested: true }),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[OP18-040]" });
    expect(offers(game)).not.toContain("active");
    expect(offers(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "rested" });

    expect(boardIds(game, "p2")).toEqual(["active", "big"]);
  });
});

describe("OP18-040 Diable Jambe Flambé Shot [Trigger]", () => {
  covers("OP18-040", "[Trigger]");

  it("rests the attacker's side's cost-7-or-less Character from Life", () => {
    const game = theirTurn("op18-040-trigger")
      .withLife("p1", [instance("shot", "OP18-040")])
      .withBoard("p2", [
        character("attacker", "OP11-003", { playedTurn: 2 }),
        character("bystander", "ST31-002"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    finishBattle(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "bystander" });

    expect(boardCard(game, "p2", "bystander")?.rested).toBe(true);
  });
});

describe("OP18-118 Monkey.D.Luffy [On Play]", () => {
  covers("OP18-118", "[On Play]");

  it("sets 3 DON!! active, and any opposing Character cannot be rested", () => {
    const game = ownTurn("op18-118-on-play", 11)
      .withDon("p1", { active: 9 })
      .withHand("p1", [instance("luffy", "OP18-118")])
      .withBoard("p2", [character("big", "OP18-118")])
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "play-card", cardNumber: "OP18-118" });
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 9 + 3);
    game.play({ type: "resolve-effect", optionId: "big" });

    expect(boardCard(game, "p2", "big")?.cannotRestUntilTurn).toBe(
      game.state.turn + 1,
    );
  });
});

describe("OP18-118 Monkey.D.Luffy [End of Your Turn]", () => {
  covers("OP18-118", "[End of Your Turn]");

  it("sets a rested {Water Seven} Leader active", () => {
    const game = ownTurn("op18-118-end")
      .withLeader("p1", GREEN_LUFFY)
      .withRestedLeader("p1")
      .withBoard("p1", [character("luffy", "OP18-118")])
      .build();

    endTurn(game);
    expect(offers(game)).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(game.state.players.p1.leaderRested).toBe(false);
  });
});
