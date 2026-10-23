import { describe, expect, it } from "vitest";

import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP17's Whitebeard and Rocks packages print "a type including \"X\"", not
 * "{X} type": a {Whitebeard Pirates Allies}, {Former Whitebeard Pirates} or
 * {Former Rocks Pirates} card qualifies as much as a printed {X}. Each case
 * here uses one of those compound-typed bodies, which an exact type match
 * misses.
 */

/** A bare table on turn 5, `active` to act, every DON!! active. */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario().seed(seed).atTurn(5, { active }).bareTable();

function offers(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** p2's Character attacks `target` on p1's side; p1 declines to block. */
function attackedInCounterStep(game: Game, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: target,
  });
  expect(game.state.phase).toBe("block");
  game.pass();
  expect(game.state.phase).toBe("counter");
}

describe("OP17-017 Ga Ha Ha Ha!! reaches a {Whitebeard Pirates Allies} body", () => {
  covers("OP17-017", "[Counter]");

  it("gives +2000 to an attacked OP17-014 Whitey Bay", () => {
    const game = table("op17-017-allies", "p2")
      .withBoard("p1", [character("whitey", "OP17-014", { rested: true })])
      .withHand("p1", [instance("gura", "OP17-017")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();
    attackedInCounterStep(game, "whitey");

    game.play({ type: "activate-counter-event", eventInstanceId: "gura" });
    // The debuff half is a free choice; decline it so only the buff is read.
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "done" });
    }

    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });
});

describe("OP17-055 / OP17-056 reach a {Former Rocks Pirates} body", () => {
  covers("OP17-055", "[Counter]");
  covers("OP17-056", "[Counter]");

  it.each(["OP17-055", "OP17-056"])(
    "%s gives +2000 to an attacked OP08-051 Buckin",
    (cardNumber) => {
      const game = table(`${cardNumber}-former-rocks`, "p2")
        .withBoard("p1", [character("buckin", "OP08-051", { rested: true })])
        .withHand("p1", [instance("event", cardNumber)])
        .withBoard("p2", [character("attacker", "ST31-002")])
        .build();
      attackedInCounterStep(game, "buckin");

      game.play({ type: "activate-counter-event", eventInstanceId: "event" });

      expect(game.state.activeAttack?.counterPower).toBe(2000);
    },
  );
});

describe("OP17-057 Fullalead reaches a {Former Rocks Pirates} body", () => {
  covers("OP17-057", "[On Your Opponent's Attack]");

  it("is offered, and pays +1000, when OP08-079 Kaido is attacked", () => {
    const game = table("op17-057-former-rocks", "p2")
      .withStage("p1", instance("fullalead", "OP17-057"))
      .withBoard("p1", [character("kaido", "OP08-079", { rested: true })])
      .withHand("p1", [instance("pitch", "FIX-002")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "kaido",
    });

    expect(game.state.pendingEffect?.sourceInstanceId).toBe("fullalead");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch" });

    expect(game.state.activeAttack?.counterPower).toBe(1000);
    expect(game.state.players.p1.stage?.rested).toBe(true);
  });
});

describe("OP17-019 searches for a {Whitebeard Pirates Allies} card", () => {
  covers("OP17-019", "[Main]");

  it("offers OP17-014 Whitey Bay from the top five", () => {
    const game = table("op17-019-allies")
      .withHand("p1", [instance("search", "OP17-019")])
      .withDeckTop("p1", [
        instance("whitey", "OP17-014"),
        instance("x1", "FIX-002"),
        instance("x2", "FIX-002"),
        instance("x3", "FIX-002"),
        instance("x4", "FIX-002"),
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP17-019" });

    expect(offers(game)).toContain("whitey");
    game.play({ type: "resolve-effect", optionId: "whitey" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "whitey",
    ]);
  });
});

describe("OP17-048 Shiki pays with a {Former Rocks Pirates} card", () => {
  covers("OP17-048", "[When Attacking]");

  it("is offered with only OP08-069 Charlotte Linlin in hand, and trashes it", () => {
    const game = table("op17-048-former-rocks")
      .withBoard("p1", [character("shiki", "OP17-048")])
      .withHand("p1", [instance("linlin", "OP08-069")])
      .withBoard("p2", [character("target", "ST31-002")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "shiki",
      targetInstanceId: "p2-leader",
    });

    expect(game.state.pendingEffect?.sourceInstanceId).toBe("shiki");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "linlin" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "linlin",
    ]);
  });
});

describe("OP17-039 Rocks.D.Xebec reads a {Former Rocks Pirates} reveal", () => {
  covers("OP17-039", "[When Attacking]");

  it("draws 2 when the revealed card is OP07-082 Captain John", () => {
    const game = table("op17-039-former-rocks")
      .withLeader("p1", "OP17-039")
      .withHand("p1", [instance("pitch", "FIX-002")])
      .withDeckTop("p1", [
        instance("john", "OP07-082"),
        instance("d1", "FIX-002"),
        instance("d2", "FIX-002"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });

    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.hand.map((card) => card.instanceId).sort(),
    ).toEqual(["d1", "john"]);
  });
});

describe("OP13-044 Curiel gives DON!! to a {Former Whitebeard Pirates} body", () => {
  covers("OP13-044", "[When Attacking]");

  it("offers PRB02-008 Marco as a recipient", () => {
    const game = table("op13-044-former-wb")
      .withBoard("p1", [
        character("curiel", "OP13-044"),
        character("marco", "PRB02-008"),
      ])
      .withDon("p1", { active: 0, rested: 2 })
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "curiel",
      targetInstanceId: "p2-leader",
    });

    expect(offers(game)).toContain("marco");
  });
});
