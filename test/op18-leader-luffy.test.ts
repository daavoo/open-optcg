import { describe, expect, it } from "vitest";

import {
  character,
  copies,
  covers,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP18-022 Monkey.D.Luffy, the Green Leader: the edges of its `[DON!! x3]
 * [When Attacking] [Once Per Turn]` restand and the one Refresh Phase it
 * gives up for it. The headline cases (accept, decline, 2 DON!!) live in
 * op18-green.test.ts and Q1514 in op18-faq-green-black.test.ts; these pin
 * what those leave open.
 */

const GREEN_LUFFY = "OP18-022";

/** p1's turn on a bare table, with a Green Luffy Leader. */
const ownTurn = (seed: string, turn = 5) =>
  scenario()
    .seed(seed)
    .atTurn(turn, { active: "p1" })
    .bareTable()
    .withLeader("p1", GREEN_LUFFY)
    .withLife("p1", copies(3, "OP18-035", "p1-life"))
    .withLife("p2", copies(5, "OP18-035", "p2-life"))
    .withDeckTop("p1", copies(8, "OP18-035", "p1-deck"))
    .withDeckTop("p2", copies(8, "OP18-035", "p2-deck"));

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

/** Ends p1's turn and p2's, landing in p1's next Main Phase. */
function nextOwnTurn(game: Game): void {
  game.pass();
  if (game.state.pendingEffect) {
    throw new Error("an end-of-turn decision was left open");
  }
  game.pass();
  expect(game.state.turnPlayerId).toBe("p1");
}

const attackLeader = (game: Game) =>
  game.play({
    type: "attack",
    attackerInstanceId: "p1-leader",
    targetInstanceId: "p2-leader",
  });

const resolveOptions = (game: Game) =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId: string }).optionId);

describe("OP18-022 Monkey.D.Luffy (Leader): [DON!! x3]", () => {
  covers(GREEN_LUFFY, "[When Attacking]");

  it("is offered with more than 3 DON!! given", () => {
    const game = ownTurn("op18-022-four-don")
      .withGivenDon("p1", "p1-leader", 4)
      .build();

    attackLeader(game);
    expect(resolveOptions(game)).toEqual(
      expect.arrayContaining(["apply", "skip"]),
    );
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("an attack with too few DON!! does not spend [Once Per Turn]", () => {
    // [DON!! x3] is a condition on the ability: with 2 given it never
    // activates, so a later attack this turn with 3 given may still use it.
    const game = ownTurn("op18-022-condition-unmet")
      .withGivenDon("p1", "p1-leader", 2)
      .withDon("p1", { active: 1 })
      .withBoard("p1", [
        character("chimney", "OP18-028"),
        character("gonbe", "OP18-025"),
      ])
      .build();

    attackLeader(game);
    expect(game.state.pendingEffect).toBeNull();
    finishBattle(game);
    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(
      game.state.oncePerTurn.filter((key) => key.includes("p1-leader")),
    ).toEqual([]);

    // Chimney stands the Leader up; a third DON!! meets [DON!! x3].
    game.play({ type: "activate-main", summary: "[OP18-028]" });
    if (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "gonbe" });
    }
    expect(game.state.players.p1.leaderRested).toBe(false);
    game.play({ type: "attach-don", targetInstanceId: "p1-leader" });
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(3);

    attackLeader(game);
    expect(resolveOptions(game)).toContain("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.players.p1.leaderRested).toBe(false);
  });
});

describe("OP18-022 Monkey.D.Luffy (Leader): the restand", () => {
  covers(GREEN_LUFFY, "[When Attacking]");

  it("restands on declaration and the same attack still resolves", () => {
    const game = ownTurn("op18-022-same-attack")
      .withGivenDon("p1", "p1-leader", 3)
      .build();

    attackLeader(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(game.state.activeAttack?.attackerInstanceId).toBe("p1-leader");
    expect(game.state.activeAttack?.targetInstanceId).toBe("p2-leader");
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(3);

    finishBattle(game);
    expect(game.state.activeAttack).toBeFalsy();
    expect(game.state.players.p2.life).toHaveLength(4);
    // Standing up returns none of its DON!!: the second swing has them too.
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(3);

    attackLeader(game);
    expect(game.state.pendingEffect).toBeNull();
    finishBattle(game);
    expect(game.state.players.p2.life).toHaveLength(3);
    expect(game.state.players.p1.leaderRested).toBe(true);
  });

  it("a declined offer keeps the Leader rested and is not spent", () => {
    // "You may" declined: nothing resolved, so the use is still there for a
    // later attack this turn once something else stands the Leader up.
    const game = ownTurn("op18-022-decline-unspent")
      .withGivenDon("p1", "p1-leader", 3)
      .withBoard("p1", [
        character("chimney", "OP18-028"),
        character("gonbe", "OP18-025"),
      ])
      .build();

    attackLeader(game);
    game.play({ type: "resolve-effect", optionId: "skip" });
    expect(game.state.players.p1.leaderRested).toBe(true);
    finishBattle(game);

    game.play({ type: "activate-main", summary: "[OP18-028]" });
    if (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "gonbe" });
    }
    attackLeader(game);
    expect(resolveOptions(game)).toContain("apply");
  });

  it("is not offered while the Leader's effects are negated", () => {
    // OP13-064 Gol.D.Roger negates its controller's Leader.
    const game = ownTurn("op18-022-negated")
      .withGivenDon("p1", "p1-leader", 3)
      .withBoard("p1", [character("roger", "OP13-064")])
      .build();

    attackLeader(game);
    expect(game.state.pendingEffect).toBeNull();
    finishBattle(game);
    expect(game.state.players.p1.leaderRested).toBe(true);
    nextOwnTurn(game);
    // No hold was written, so it refreshes as usual.
    expect(game.state.players.p1.leaderRested).toBe(false);
  });
});

describe("OP18-022 Monkey.D.Luffy (Leader): the skipped Refresh Phase", () => {
  covers(GREEN_LUFFY, "[When Attacking]");

  it("writes the hold on the Leader, reported as refresh-prevented", () => {
    const game = ownTurn("op18-022-event")
      .withGivenDon("p1", "p1-leader", 3)
      .build();

    attackLeader(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "refresh-prevented",
          playerId: "p1",
          targetInstanceId: "p1-leader",
        }),
      ]),
    );
  });

  it("returns the given DON!! to the cost area at the skipped Refresh", () => {
    const game = ownTurn("op18-022-don-return")
      .withGivenDon("p1", "p1-leader", 3)
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;
    const newDon = Math.min(2, game.state.players.p1.donDeck.length);

    attackLeader(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    finishBattle(game);
    attackLeader(game);
    finishBattle(game);

    nextOwnTurn(game);
    const p1 = game.state.players.p1;
    expect(p1.leaderRested).toBe(true);
    // Only the Leader stays down: its 3 DON!! come back active, beside the
    // ones the turn adds.
    expect(p1.leaderAttachedDon).toHaveLength(0);
    expect(p1.activeDon).toHaveLength(activeBefore + 3 + newDon);
  });

  it("a rested Leader set active at the end of the turn starts the next turn active, and may restand again", () => {
    // Kokoro's End of Your Turn sets the Leader active; the hold only stops
    // the Refresh from doing so, it does not rest an active Leader. The new
    // turn's [Once Per Turn] is fresh.
    const game = ownTurn("op18-022-kokoro")
      .withGivenDon("p1", "p1-leader", 3)
      .withBoard("p1", [character("kokoro", "OP18-024")])
      .build();

    attackLeader(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    finishBattle(game);
    attackLeader(game);
    finishBattle(game);
    expect(game.state.players.p1.leaderRested).toBe(true);

    game.pass();
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.players.p1.leaderRested).toBe(false);
    game.pass();
    expect(game.state.turnPlayerId).toBe("p1");
    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);

    for (let given = 0; given < 3; given += 1) {
      game.play({ type: "attach-don", targetInstanceId: "p1-leader" });
    }
    attackLeader(game);
    expect(resolveOptions(game)).toContain("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.players.p1.leaderRested).toBe(false);
    finishBattle(game);
    attackLeader(game);
    finishBattle(game);

    // This turn's use holds it through the following Refresh, and only that.
    nextOwnTurn(game);
    expect(game.state.players.p1.leaderRested).toBe(true);
    nextOwnTurn(game);
    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("does not hold the Leader through the opponent's Refresh Phase", () => {
    // "your next Refresh Phase" is p1's own; p2's turn in between leaves the
    // Leader as it was, and nothing stops p2's own cards refreshing.
    const game = ownTurn("op18-022-opponent-refresh")
      .withGivenDon("p1", "p1-leader", 3)
      .withBoard("p2", [character("body", "OP18-035", { rested: true })])
      .build();

    attackLeader(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    finishBattle(game);
    game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "body")
        ?.rested,
    ).toBe(false);
  });
});
