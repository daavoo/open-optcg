import { describe, expect, it } from "vitest";
import { effectiveCost, type GameState } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Black) Crocodile feature deck, played through its own list.
 *
 * Every printed clause of the fifty already has a test in `op14.test.ts`, on a
 * neutral ST31/ST32 board. What this file adds is the lines Bandai's write-up
 * builds the deck around, each driven through OP14-079's [Activate: Main]:
 * the Leader K.O.s one of your own {Baroque Works} Characters to drop an
 * opposing Character to 0 cost, and the rest of the list reads that 0.
 */
const DECK = "(Black) Crocodile - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP14-079");

type Game = ReturnType<ReturnType<typeof table>["build"]>;

function effectOptions(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId?: string }).optionId ?? "");
}

/** Answer the pending effect with `optionId`, or its first offer if absent. */
function answer(game: Game, ...preferred: string[]): void {
  while (game.state.pendingEffect) {
    const options = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect");
    const wanted =
      preferred
        .map((id) =>
          options.find(
            (action) => (action as { optionId?: string }).optionId === id,
          ),
        )
        .find(Boolean) ?? options[0]!;
    game.submit(wanted);
  }
}

/** Spend `fodder` on the Leader to give `target` -10 cost, milling two. */
function drain(game: Game, fodder: string, target: string): void {
  game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
  game.play({ type: "resolve-effect", optionId: "apply" });
  game.play({ type: "resolve-effect", optionId: fodder });
  game.play({ type: "resolve-effect", optionId: target });
  game.play({ type: "resolve-effect", optionId: "apply" });
}

const attackTargets = (game: Game, attackerInstanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "attack" &&
        (action as { attackerInstanceId?: string }).attackerInstanceId ===
          attackerInstanceId,
    )
    .map(
      (action) => (action as { targetInstanceId?: string }).targetInstanceId,
    );

const boardIds = (state: GameState, playerId: "p1" | "p2") =>
  state.players[playerId].board.map((card) => card.instanceId);

/** A card's cost where it stands, printed cost plus every modifier. */
const costOn = (game: Game, playerId: "p1" | "p2", instanceId: string) => {
  const card = game.state.players[playerId].board.find(
    (entry) => entry.instanceId === instanceId,
  );
  if (!card) throw new Error(`${instanceId} is not on ${playerId}'s board`);
  return effectiveCost(game.state, playerId, card);
};

const handIds = (state: GameState, playerId: "p1" | "p2") =>
  state.players[playerId].hand.map((card) => card.instanceId);

describe("OP14-079 Crocodile: K.O. a Baroque Works body, drain a Character to 0", () => {
  covers("OP14-079", "[Activate: Main]", "static");
  covers("OP14-091", "[On K.O.]");
  covers("OP14-090", "[On Play]", "static");

  it("K.O.s Mr.2, whose [On K.O.] plays Mr.1, which rests the drained Character and attacks it", () => {
    const game = table("op14-crocodile-mr2-mr1")
      .withBoard("p1", [character("bentham", "OP14-091")])
      .withHand("p1", [instance("mr1", "OP14-090")])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .withDeckTop("p1", copies(2, "OP14-085", "milled"))
      .build();

    drain(game, "bentham", "rayleigh");
    // Effective cost is not floored, so a 4-cost reads -6; every "cost of 0"
    // selector the deck prints is a `maxCost: 0` and takes it.
    expect(costOn(game, "p2", "rayleigh")).toBeLessThanOrEqual(0);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["bentham", "milled-1", "milled-2"]),
    );

    // Mr.2's [On K.O.] reaches both hand and trash, and not Mr.2 itself.
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["mr1", "milled-1", "milled-2"]),
    );
    expect(effectOptions(game)).not.toContain("bentham");
    game.play({ type: "resolve-effect", optionId: "mr1" });
    game.play({ type: "resolve-effect", optionId: "rayleigh" });

    expect(boardIds(game.state, "p1")).toEqual(["mr1"]);
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
    // Played this turn, and still offered the rested 0-cost Character -- not
    // the Leader, since the permission is to attack Characters only.
    expect(attackTargets(game, "mr1")).toEqual(["rayleigh"]);

    game.play({
      type: "attack",
      attackerInstanceId: "mr1",
      targetInstanceId: "rayleigh",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    // A battle K.O. is not removal by an effect, so the Leader's ban leaves it.
    expect(boardIds(game.state, "p2")).toEqual([]);
  });

  it("gives Mr.1 nothing to attack the turn it lands without a drained Character", () => {
    const game = table("op14-crocodile-mr1-alone")
      .withHand("p1", [instance("mr1", "OP14-090")])
      .withBoard("p2", [character("rayleigh", "ST32-004", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-090" });
    answer(game);

    expect(boardIds(game.state, "p1")).toEqual(["mr1"]);
    expect(attackTargets(game, "mr1")).toEqual([]);
  });
});

describe("OP14-120 Crocodile under the Leader: K.O.'d as the cost, back out of the trash", () => {
  covers("OP14-120", "[On Play]", "[On K.O.]");

  it("replays itself for a card from hand and locks and draws off the drained Character", () => {
    const game = table("op14-crocodile-120-loop")
      .withBoard("p1", [character("croc", "OP14-120")])
      .withHand("p1", [instance("fodder", "OP14-085")])
      .withBoard("p2", [character("oars", "OP14-101")])
      .withDeckTop("p1", [
        ...copies(2, "OP14-088", "milled"),
        instance("drawn", "OP14-083"),
      ])
      .build();

    drain(game, "croc", "oars");
    expect(costOn(game, "p2", "oars")).toBeLessThanOrEqual(0);

    // [On K.O.]: trash one from hand to play this Character card from the
    // trash, and its [On Play] runs again.
    answer(game, "apply", "fodder", "oars");

    expect(boardIds(game.state, "p1")).toEqual(["croc"]);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
    expect(game.state.players.p2.board[0]?.cannotAttackUntilTurn).toBe(
      game.state.turn + 1,
    );
    // The opponent now has a 0-cost Character, so the [On Play] draws.
    expect(handIds(game.state, "p1")).toEqual(["drawn"]);
  });
});

describe("OP14-096 Ground Death reaches a drained Character of any printed cost", () => {
  covers("OP14-096", "[Main]");

  it("negates an 8-cost Character once the Leader has drained it", () => {
    const game = table("op14-crocodile-ground-death")
      // Mr.3 has no [On K.O.] to answer, and its replacement is only live on
      // the opponent's turn, so the Leader's K.O. of it goes through.
      .withBoard("p1", [character("galdino", "OP14-092")])
      .withHand("p1", [instance("event", "OP14-096")])
      .withBoard("p2", [character("oars", "OP14-101")])
      .withDeckTop("p1", copies(2, "OP14-088", "milled"))
      .build();

    drain(game, "galdino", "oars");
    expect(boardIds(game.state, "p1")).toEqual([]);

    game.play({ summary: "Ground Death" });
    expect(effectOptions(game)).toContain("oars");
    game.play({ type: "resolve-effect", optionId: "oars" });

    expect(game.state.negatedEffects).toContainEqual(
      expect.objectContaining({ instanceId: "oars" }),
    );
  });

  it("cannot negate the same 8-cost Character undrained", () => {
    const game = table("op14-crocodile-ground-death-undrained")
      .withHand("p1", [instance("event", "OP14-096")])
      .withBoard("p2", [character("oars", "OP14-101")])
      .build();

    game.play({ summary: "Ground Death" });
    expect(effectOptions(game)).not.toContain("oars");
  });
});

describe("OP14-094 Mr.5 reads the Character the Leader drained", () => {
  covers("OP14-094", "[On Play]");

  it("draws two and trashes one beside a 0-cost Character", () => {
    const game = table("op14-crocodile-mr5")
      .withBoard("p1", [character("drophy", "OP14-088")])
      .withHand("p1", [instance("gem", "OP14-094")])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .withDeckTop("p1", copies(5, "OP14-085", "deck"))
      .build();

    drain(game, "drophy", "rayleigh");
    // MerryChristmas' [On K.O.] draws one; the opponent has no Stage.
    answer(game);
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "OP14-094" });
    answer(game);

    // -1 for Mr.5 itself, +2 drawn, -1 trashed.
    expect(game.state.players.p1.hand.length).toBe(handBefore);
    expect(boardIds(game.state, "p1")).toEqual(["gem"]);
  });
});

describe("OP14-086 Miss Doublefinger raises cost on the field only", () => {
  covers("OP14-086", "static");

  it("leaves Mr.1 in hand at 5, so Mr.2's [On K.O.] still reaches it at 7 trash", () => {
    const game = table("op14-crocodile-doublefinger")
      .withBoard("p1", [
        character("zala", "OP14-086"),
        character("bentham", "OP14-091"),
      ])
      .withHand("p1", [instance("mr1", "OP14-090")])
      .withTrash("p1", copies(7, "OP14-099", "trash"))
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .withDeckTop("p1", copies(2, "OP14-085", "milled"))
      .build();

    expect(costOn(game, "p1", "bentham")).toBe(6);
    drain(game, "bentham", "rayleigh");

    // Mr.2 plus the two milled cards make ten in the trash.
    expect(game.state.players.p1.trash.length).toBe(10);
    expect(effectOptions(game)).toContain("mr1");
    game.play({ type: "resolve-effect", optionId: "mr1" });
    answer(game, "rayleigh");

    expect(boardIds(game.state, "p1")).toEqual(["zala", "mr1"]);
    expect(costOn(game, "p1", "mr1")).toBe(7);
  });

  it("leaves a 4-cost in the trash at 4, inside Ms. All Sunday's reach", () => {
    const game = table("op14-crocodile-doublefinger-sunday")
      .withBoard("p1", [character("zala", "OP14-086")])
      .withHand("p1", [instance("sunday", "OP14-084")])
      .withTrash("p1", [
        instance("bentham", "OP14-091"),
        ...copies(6, "OP14-099", "trash"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-084" });
    expect(effectOptions(game)).toContain("bentham");
    answer(game, "bentham", "done");

    expect(boardIds(game.state, "p1")).toEqual(["zala", "sunday", "bentham"]);
  });
});
