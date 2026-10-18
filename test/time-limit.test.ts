/**
 * The tournament time limit: Bandai's "Sanctioned Tournaments Floor Rules"
 * (Ver. 1.6.0, §8.2). Time is called as a set turn begins, that turn is turn 0,
 * three more are played, and a game still going is decided by more Life cards,
 * then more cards in the deck, then more Characters, then whoever last drew
 * from their Life area.
 */
import { describe, expect, it } from "vitest";
import {
  GameService,
  observe,
  replayActions,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";
import type { PublicEvent, TimeLimit } from "@one-piece-sim/protocol";
import { BrowserGameController } from "../packages/web/src/controller.js";
import { character, scenario, type Game } from "./support/index.js";

const P1_DECK = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2_DECK = "(Green) Roronoa Zoro - Starter Deck 32";

/** Ends turns until the game is over, collecting every step on the way. */
function passToTheEnd(game: Game): PublicEvent[] {
  const events: PublicEvent[] = [];
  for (let guard = 0; game.state.phase !== "finished"; guard += 1) {
    if (guard > 40) throw new Error("the game did not end");
    game.pass();
    events.push(...game.events);
  }
  return events;
}

/**
 * Declares a Leader-on-Leader attack and lets it land: no block, no Counter,
 * and the damaged Life card added to hand rather than its Trigger activated.
 */
function hitLeader(game: Game): void {
  const attacker = game.state.turnPlayerId;
  game.play({
    type: "attack",
    attackerInstanceId: `${attacker}-leader`,
    targetInstanceId: `${attacker === "p1" ? "p2" : "p1"}-leader`,
  });
  while (
    game.state.phase !== "finished" &&
    game.state.turnPlayerId === attacker &&
    game.player !== attacker
  ) {
    if (game.state.phase === "trigger") {
      game.play({ type: "resolve-trigger", optionId: "skip" });
    } else {
      game.pass();
    }
  }
}

describe("time limit (floor rules §8.2)", () => {
  it("calls time as turn N begins and ends the game when the third turn after it ends", () => {
    const game = scenario()
      .timeLimit(5)
      .startingPlayer("p1")
      .keepBothHands()
      .build();
    expect(observe(game.state, "p2").timeLimit).toEqual({
      calledOnTurn: 5,
      finalTurn: 8,
      called: false,
      turnsLeft: null,
      decidedBy: null,
    });

    const turnsLeft: (number | null)[] = [];
    const events: PublicEvent[] = [];
    while (game.state.phase !== "finished") {
      game.pass();
      events.push(...game.events);
      turnsLeft.push(observe(game.state, "p1").timeLimit!.turnsLeft);
    }

    const called = events.filter((event) => event.type === "time-called");
    // Turn 5 is the first player's: their turn becomes turn 0.
    expect(called).toEqual([
      { type: "time-called", turn: 5, turnPlayerId: "p1", finalTurn: 8 },
    ]);
    // Passing out of turns 1-7 starts turns 2-8; passing out of 8 ends it all.
    expect(turnsLeft).toEqual([null, null, null, 3, 2, 1, 0, 0]);
    expect(game.state.turn).toBe(8);
    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.state.resultReason).toBe("time");
    const ended = events.filter((event) => event.type === "game-ended");
    expect(ended).toHaveLength(1);
    expect(events.at(-1)).toEqual(ended[0]);
    // No turn began after the last one.
    expect(
      events.filter((event) => event.type === "turn-ended").at(-1),
    ).toMatchObject({ playerId: "p1", nextPlayerId: "p2" });
    expect(observe(game.state, "p2").timeLimit).toMatchObject({
      called: true,
      turnsLeft: 0,
    });
  });

  it("counts from the active player's turn when the second player's turn is turn 0", () => {
    const game = scenario()
      .timeLimit(4)
      .startingPlayer("p1")
      .keepBothHands()
      .build();
    const events = passToTheEnd(game);
    expect(events.find((event) => event.type === "time-called")).toEqual({
      type: "time-called",
      turn: 4,
      turnPlayerId: "p2",
      finalTurn: 7,
    });
    expect(game.state.turn).toBe(7);
    expect(game.state.turnPlayerId).toBe("p1");
  });

  it("procedure 1: more Life cards wins", () => {
    const game = scenario()
      .timeLimit(3)
      .startingPlayer("p1")
      .atTurn(3, { active: "p1" })
      .withLife("p1", 2)
      .withLife("p2", 3)
      .build();
    const events = passToTheEnd(game);
    expect(events.at(-1)).toEqual({
      type: "game-ended",
      winner: "p2",
      reason: "time",
      procedure: "life",
    });
    expect(game.state.winner).toBe("p2");
    expect(observe(game.state, "p1").timeLimit?.decidedBy).toBe("life");
  });

  it("procedure 2: on equal Life, more cards left in the deck wins", () => {
    const game = scenario()
      .timeLimit(3)
      .startingPlayer("p1")
      .atTurn(3, { active: "p1" })
      .withLife("p1", 4)
      .withLife("p2", 4)
      .withDraw("p1", 3)
      .build();
    passToTheEnd(game);
    const { p1, p2 } = game.state.players;
    expect(p1.life.length).toBe(p2.life.length);
    expect(p2.deck.length).toBeGreaterThan(p1.deck.length);
    expect(game.state.winner).toBe("p2");
    expect(game.state.timeLimit?.decidedBy).toBe("deck");
  });

  it("procedure 3: on equal Life and deck, more Characters wins", () => {
    const game = scenario()
      .timeLimit(3)
      .startingPlayer("p1")
      .atTurn(3, { active: "p1" })
      .withLife("p1", 4)
      .withLife("p2", 4)
      // The first player skipped the draw on turn 1 and the second player has
      // one more draw to come before turn 6 ends: one card evens the decks.
      .withDraw("p1", 1)
      .withBoard("p1", [character("body", "ST31-003")])
      .build();
    passToTheEnd(game);
    const { p1, p2 } = game.state.players;
    expect(p1.deck.length).toBe(p2.deck.length);
    expect(game.state.winner).toBe("p1");
    expect(game.state.timeLimit?.decidedBy).toBe("characters");
  });

  it("procedure 4: with everything else equal, whoever last drew from their Life area wins", () => {
    // Each Leader hits the other once, so both stand on equal Life -- and the
    // second hit, on the first player, is the last card drawn from Life.
    const game = scenario()
      .timeLimit(3)
      .startingPlayer("p1")
      .atTurn(3, { active: "p1" })
      .withDraw("p1", 1)
      .build();
    hitLeader(game);
    game.pass();
    expect(game.state.timeLimit?.lifeDrawnLast).toBe("p2");
    hitLeader(game);
    expect(game.state.timeLimit?.lifeDrawnLast).toBe("p1");
    passToTheEnd(game);
    const { p1, p2 } = game.state.players;
    expect(p1.life.length).toBe(p2.life.length);
    expect(p1.deck.length).toBe(p2.deck.length);
    expect(p1.board.length).toBe(p2.board.length);
    expect(game.state.winner).toBe("p1");
    expect(game.state.timeLimit?.decidedBy).toBe("life-drawn");
  });

  it("a tie on every procedure with no Life card ever drawn goes against the player whose turn ended the game", () => {
    const game = scenario()
      .timeLimit(3)
      .startingPlayer("p1")
      .atTurn(3, { active: "p1" })
      .withDraw("p1", 1)
      .build();
    passToTheEnd(game);
    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.state.winner).toBe("p1");
    expect(game.state.timeLimit?.decidedBy).toBe("final-turn");
  });

  it("a game that ends on Life before the last turn is over never goes to time", () => {
    const game = scenario()
      .timeLimit(3)
      .startingPlayer("p1")
      .atTurn(3, { active: "p1" })
      .withLife("p2", 0)
      .build();
    hitLeader(game);
    expect(game.state.phase).toBe("finished");
    expect(game.state.resultReason).toBe("life");
    expect(game.state.winner).toBe("p1");
    expect(game.state.timeLimit?.decidedBy).toBeUndefined();
  });

  it("changes nothing when the setting is off", () => {
    // The same game twice, once under a limit too far off to reach: the
    // untimed one carries no trace of the setting, and both play out alike.
    const untimed = scenario().startingPlayer("p1").keepBothHands().build();
    const distant = scenario()
      .timeLimit(100)
      .startingPlayer("p1")
      .keepBothHands()
      .build();
    for (let turn = 0; turn < 12; turn += 1) {
      untimed.pass();
      distant.pass();
    }
    expect(untimed.state.phase).not.toBe("finished");
    expect(untimed.state.turn).toBe(13);
    expect(untimed.state).not.toHaveProperty("timeLimit");
    expect(observe(untimed.state, "p1")).not.toHaveProperty("timeLimit");
    expect(
      untimed.state.events.some((event) => event.type === "time-called"),
    ).toBe(false);
    expect(untimed.state.events).toEqual(distant.state.events);
    const { timeLimit, ...rest } = distant.state;
    expect(timeLimit).toEqual({ turns: 100 });
    expect(rest).toEqual(untimed.state);
  });

  it("a limit of one turn calls time as the game is created", () => {
    const game = scenario().timeLimit(1).startingPlayer("p2").build();
    expect(game.state.events).toContainEqual({
      type: "time-called",
      turn: 1,
      turnPlayerId: "p2",
      finalTurn: 4,
    });
    expect(game.state.eventSequence).toBe(game.state.events.length);
  });

  it("rejects a limit that is not a positive whole number of turns", () => {
    expect(() => scenario().timeLimit(0).build()).toThrow(/INVALID_TIME_LIMIT/);
    expect(() => scenario().timeLimit(2.5).build()).toThrow(
      /INVALID_TIME_LIMIT/,
    );
  });

  it("replays a timed game to the same final hash, and only with the setting", () => {
    const timeLimit: TimeLimit = { turns: 4 };
    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck(P1_DECK),
      p2: resolveDeck(P2_DECK),
      seed: "time-limit-replay",
      timeLimit,
    });
    const actions: string[] = [];
    while (observation.phase !== "finished") {
      const action =
        observation.legalActions.find(
          (offer) =>
            offer.type === "mulligan-decision" && offer.decision === "keep",
        ) ?? observation.legalActions.find((offer) => offer.type === "pass")!;
      actions.push(action.actionId);
      observation = service.act(
        observation.gameId,
        observation.revision,
        action.actionId,
      );
    }
    expect(observation.resultReason).toBe("time");

    const fixture = {
      version: 1,
      seed: "time-limit-replay",
      decks: { p1: P1_DECK, p2: P2_DECK },
      actions,
    };
    const replayed = replayActions({ ...fixture, timeLimit }, resolveDeck);
    const last = replayed.at(-1)!;
    expect(last.stateHash).toBe(observation.stateHash);
    expect(last.winner).toBe(observation.winner);
    expect(last.resultReason).toBe("time");

    // The setting is part of the game: without it the same actions leave the
    // game running past the turn that decided it.
    const untimed = replayActions(fixture, resolveDeck).at(-1)!;
    expect(untimed.resultReason).toBeNull();
    expect(untimed.stateHash).not.toBe(observation.stateHash);
  });

  it("a trace's config carries the limit, so the app plays the game under it", () => {
    const controller = new BrowserGameController({
      p1Deck: P1_DECK,
      p2Deck: P2_DECK,
      p1Controller: "human",
      p2Controller: "human",
      seed: "time-limit-app",
      startingPlayer: "p1",
      timeLimit: { turns: 2 },
    });
    let observation = controller.activeObservation;
    while (observation.phase !== "finished") {
      const action =
        observation.legalActions.find(
          (offer) =>
            offer.type === "mulligan-decision" && offer.decision === "keep",
        ) ?? observation.legalActions.find((offer) => offer.type === "pass")!;
      observation = controller.act(action.actionId);
    }
    expect(observation.turn).toBe(5);
    expect(observation.resultReason).toBe("time");
    expect(controller.trace().config.timeLimit).toEqual({ turns: 2 });
  });
});
