import { describe, expect, it } from "vitest";
import { currentPower, type GameState } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Black/Yellow) Gecko Moria feature deck, played through its own list.
 *
 * Every printed clause of the fifty already has a test, most of them on a
 * neutral board or behind OP16 Nami. What this file adds is the lines Bandai's
 * write-up builds the deck around, each behind OP14-080: the Leader K.O.ing a
 * {Thriller Bark Pirates} body whose [On K.O.] puts something back, and the
 * [Trigger]s and Gecko Morias that play the trash back out.
 */
const DECK = "(Black/Yellow) Gecko Moria - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP14-080");

type Game = ReturnType<ReturnType<typeof table>["build"]>;

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

/** Spend `fodder` on the Leader's [Activate: Main]. */
function spend(game: Game, fodder: string): void {
  game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
  game.play({ type: "resolve-effect", optionId: "apply" });
  game.play({ type: "resolve-effect", optionId: fodder });
}

const boardCard = (state: GameState, playerId: "p1" | "p2", id: string) =>
  state.players[playerId].board.find((card) => card.instanceId === id);

const boardIds = (state: GameState, playerId: "p1" | "p2") =>
  state.players[playerId].board.map((card) => card.instanceId);

const trashIds = (state: GameState, playerId: "p1" | "p2") =>
  state.players[playerId].trash.map((card) => card.instanceId);

/** Is `id` barred from attacking through the opponent's next turn? */
const locked = (game: Game, id: string) =>
  (boardCard(game.state, "p2", id)?.cannotAttackUntilTurn ?? 0) >
  game.state.turn;

describe("OP14-080 Gecko Moria: K.O. a Thriller Bark body that puts one back", () => {
  covers("OP14-080", "[Activate: Main]");
  covers("OP14-110", "[On K.O.]");
  covers("OP14-111", "[On Play]", "[On K.O.]");

  it("K.O.s Dr. Hogback, whose [On K.O.] plays Perona from the trash, and Perona's [On Play] locks an attacker", () => {
    const game = table("op14-moria-hogback")
      .withBoard("p1", [character("hogback", "OP14-110")])
      .withTrash("p1", [instance("perona", "OP14-111")])
      .withBoard("p2", [character("killer", "ST32-002")])
      .build();

    spend(game, "hogback");
    answer(game, "perona", "killer");

    // The board did not shrink: Hogback went, Perona came back, active.
    expect(boardIds(game.state, "p1")).toEqual(["perona"]);
    expect(boardCard(game.state, "p1", "perona")?.rested).toBe(false);
    expect(trashIds(game.state, "p1")).toEqual(["hogback"]);
    expect(locked(game, "killer")).toBe(true);
    // Hogback's [On K.O.] is an automatic effect raised while the Leader's
    // clause was resolving, so it waits for that clause to finish: the +1000
    // went to the board as it stood after the K.O., which Perona was not on.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
    expect(currentPower(game.state, "p1", "perona")).toBe(5000);
  });

  it("finds nothing to play when the trash holds no [Trigger] Character", () => {
    const game = table("op14-moria-hogback-empty")
      .withBoard("p1", [character("hogback", "OP14-110")])
      // Spider Mice prints no [Trigger], so Hogback cannot reach it.
      .withTrash("p1", [instance("mice", "OP14-081")])
      .build();

    spend(game, "hogback");
    answer(game);

    expect(boardIds(game.state, "p1")).toEqual([]);
    expect(trashIds(game.state, "p1")).toEqual(
      expect.arrayContaining(["mice", "hogback"]),
    );
  });

  it("plays Perona to lock one attacker, then K.O.s her to lock a second", () => {
    const game = table("op14-moria-perona-twice")
      .withHand("p1", [instance("perona", "OP14-111")])
      .withBoard("p2", [
        character("killer", "ST32-002"),
        character("second", "ST32-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-111" });
    answer(game, "killer");
    expect(locked(game, "killer")).toBe(true);
    expect(locked(game, "second")).toBe(false);

    spend(game, "perona");
    answer(game, "second");

    expect(locked(game, "killer")).toBe(true);
    expect(locked(game, "second")).toBe(true);
    expect(boardIds(game.state, "p1")).toEqual([]);
  });
});

describe("The Thriller Bark [Trigger]: a Life card plays a body back from the trash", () => {
  covers("OP14-102", "[Trigger]");

  const takeLife = (seed: string, trash: ReturnType<typeof instance>[]) => {
    const game = table(seed)
      .withLife("p1", [
        instance("kumacy", "OP14-102"),
        instance("life-spare", "OP14-109"),
      ])
      .withTrash("p1", trash)
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    return game;
  };

  it("plays Dr. Hogback rested out of the trash off Kumacy", () => {
    const game = takeLife("op14-moria-kumacy", [
      instance("hogback", "OP14-110"),
    ]);

    game.play({ type: "resolve-trigger", optionId: "activate" });
    answer(game, "hogback");

    expect(boardCard(game.state, "p1", "hogback")?.rested).toBe(true);
    expect(trashIds(game.state, "p1")).toEqual(["kumacy"]);
  });

  it("does not reach a Thriller Bark Character above cost 4", () => {
    const game = takeLife("op14-moria-kumacy-big", [
      instance("moria", "PRB02-013"),
    ]);

    game.play({ type: "resolve-trigger", optionId: "activate" });
    answer(game);

    expect(boardIds(game.state, "p1")).toEqual([]);
    expect(trashIds(game.state, "p1")).toContain("moria");
  });
});

describe("The Gecko Morias behind OP14-080", () => {
  covers("PRB02-013", "[On Play]");
  covers("OP14-104", "[On Play]");

  it("PRB02-013 plays Dr. Hogback rested from the trash and hands a rested DON!! to the Leader", () => {
    const game = table("op14-moria-prb02")
      .withHand("p1", [instance("moria", "PRB02-013")])
      .withTrash("p1", [instance("hogback", "OP14-110")])
      .withDon("p1", { active: 6, rested: 2 })
      .build();

    const attachedBefore = game.state.players.p1.leaderAttachedDon.length;
    game.play({ type: "play-card", cardNumber: "PRB02-013" });
    game.play({ type: "resolve-effect", optionId: "hogback" });
    // Hogback is a legal recipient too, now that it is on the field.
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(boardCard(game.state, "p1", "hogback")?.rested).toBe(true);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(
      attachedBefore + 1,
    );
  });

  it("OP14-104 adds a Thriller Bark body face-up to the top of Life instead of playing it", () => {
    const game = table("op14-moria-104-life")
      .withHand("p1", [instance("moria", "OP14-104")])
      .withTrash("p1", [instance("perona", "OP14-111")])
      .withLife("p1", [instance("life", "OP14-109")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-104" });
    answer(game, "life", "perona");

    const top = game.state.players.p1.life[0];
    expect(top?.instanceId).toBe("perona");
    expect(top?.faceUp).toBe(true);
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(boardIds(game.state, "p1")).toEqual(["moria"]);
  });

  it("OP14-104 plays the body instead, active", () => {
    const game = table("op14-moria-104-play")
      .withHand("p1", [instance("moria", "OP14-104")])
      .withTrash("p1", [instance("perona", "OP14-111")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-104" });
    answer(game, "play", "perona");

    expect(boardIds(game.state, "p1")).toEqual(["moria", "perona"]);
    expect(boardCard(game.state, "p1", "perona")?.rested).toBe(false);
  });
});
