import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Blue) Buggy feature deck, played through its own list.
 *
 * Its OP-09 and promo cards were already tested on neutral boards in
 * `op09.test.ts` and `promo.test.ts`. What this file adds is the five ST-25
 * cards, which arrived with the deck, PRB02-009 Mr.3's rested-by-the-opponent
 * clause, and the line Bandai's write-up builds the deck around: four
 * 5-cost bodies, three of them ST-25 4-costs counting as 5, so OP09-051
 * Buggy played through the Leader stays on the field.
 */
const DECK = "(Blue) Buggy - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

const table = (seed: string) =>
  scenario().decks(DECK, OPPONENT).seed(seed).atTurn(11, { active: "p1" });

const defending = (seed: string) =>
  scenario().decks(DECK, OPPONENT).seed(seed).atTurn(12, { active: "p2" });

/** A Blue Leader that is not [Buggy], for the Leader-gated clauses. */
const NOT_BUGGY = "OP14-040";

type Game = ReturnType<ReturnType<typeof table>["build"]>;

const effectOptions = (game: Game): string[] =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId?: string }).optionId ?? "");

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

/** Take an `optional` prompt, which the engine elides when it has no decline. */
const applyIfOffered = (game: Game) => {
  if (effectOptions(game).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const boardCard = (state: GameState, playerId: "p1" | "p2", id: string) =>
  state.players[playerId].board.find((card) => card.instanceId === id);

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const costOn = (game: Game, id: string) =>
  effectiveCost(game.state, "p1", boardCard(game.state, "p1", id)!);

describe("ST25-001 Alvida", () => {
  covers("ST25-001", "static", "[On Play]");

  it("costs 5 beside two Characters printed at 5 or more", () => {
    const game = table("st25-001-cost")
      .withBoard("p1", [
        character("alvida", "ST25-001"),
        character("croc", "OP09-046"),
        character("mihawk", "OP09-048"),
      ])
      .build();

    expect(costOn(game, "alvida")).toBe(5);
  });

  it("counts printed cost, so a second Alvida does not lift the first", () => {
    const game = table("st25-001-printed")
      .withBoard("p1", [
        character("alvida", "ST25-001"),
        character("alvida-2", "ST25-001"),
        character("croc", "OP09-046"),
      ])
      .build();

    expect(costOn(game, "alvida")).toBe(4);
    expect(costOn(game, "alvida-2")).toBe(4);
  });

  it("draws three and trashes two behind a Buggy Leader", () => {
    const game = table("st25-001-draw")
      .withHand("p1", [
        instance("alvida", "ST25-001"),
        instance("a", "OP09-057"),
      ])
      .withDeckTop("p1", copies(3, "OP09-056", "drawn"))
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "ST25-001" });
    answer(game);

    // One left in hand, three drawn, two trashed.
    expect(game.state.players.p1.hand).toHaveLength(2);
    expect(game.state.players.p1.trash).toHaveLength(trashBefore + 2);
  });

  it("draws nothing behind another Leader", () => {
    const game = table("st25-001-other")
      .withLeader("p1", NOT_BUGGY)
      .withHand("p1", [
        instance("alvida", "ST25-001"),
        instance("a", "OP09-057"),
      ])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "ST25-001" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["a"]);
    expect(game.state.players.p1.trash).toHaveLength(trashBefore);
  });
});

describe("ST25-002 Cabaji", () => {
  covers("ST25-002", "static", "[Opponent's Turn]");

  it("gains [Blocker] and +1 cost beside two Characters printed at 5 or more", () => {
    const game = table("st25-002-on")
      .withBoard("p1", [
        character("cabaji", "ST25-002"),
        character("croc", "OP09-046"),
        character("mihawk", "OP09-048"),
      ])
      .build();

    expect(costOn(game, "cabaji")).toBe(5);
    expect(hasKeyword(game.state, "p1", "cabaji", "Blocker")).toBe(true);
  });

  it("is a 4-cost with no [Blocker] beside only one", () => {
    const game = table("st25-002-off")
      .withBoard("p1", [
        character("cabaji", "ST25-002"),
        character("croc", "OP09-046"),
      ])
      .build();

    expect(costOn(game, "cabaji")).toBe(4);
    expect(hasKeyword(game.state, "p1", "cabaji", "Blocker")).toBe(false);
  });

  it("is +5000 on the opponent's turn and printed power on its own", () => {
    const theirs = defending("st25-002-theirs")
      .withBoard("p1", [character("cabaji", "ST25-002")])
      .build();
    expect(currentPower(theirs.state, "p1", "cabaji")).toBe(6_000);

    const ours = table("st25-002-ours")
      .withBoard("p1", [character("cabaji", "ST25-002")])
      .build();
    expect(currentPower(ours.state, "p1", "cabaji")).toBe(1_000);
  });
});

describe("ST25-003 Crocodile & Mihawk", () => {
  covers("ST25-003", "[On Play]");

  it("draws two, trashes one, then plays a Cross Guild body of cost 4 or less from hand", () => {
    const game = table("st25-003-play")
      .withHand("p1", [
        instance("cm", "ST25-003"),
        instance("buggy", "ST25-004"),
        instance("big", "OP09-051"),
      ])
      .withDeckTop("p1", [
        instance("event", "OP09-057"),
        instance("galdino", "OP09-056"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST25-003" });
    game.play({ type: "resolve-effect", optionId: "event" });

    // The 10-cost Buggy is a Cross Guild Character too, and is not offered.
    const offered = effectOptions(game);
    expect(offered).toContain("buggy");
    expect(offered).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "buggy" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["cm", "buggy"]);
    expect(ids(game.state.players.p1.trash)).toContain("event");
    expect(ids(game.state.players.p1.hand).sort()).toEqual(["big", "galdino"]);
  });

  it("trashes a card from hand instead of a Cross Guild Character leaving the field, once a turn", () => {
    const game = defending("st25-003-replace")
      .withBoard("p1", [
        character("cm", "ST25-003"),
        character("alvida", "ST25-001"),
      ])
      .withHand("p1", [instance("f1", "OP09-057"), instance("f2", "OP09-057")])
      .withHand("p2", [
        instance("gatling-1", "ST10-016"),
        instance("gatling-2", "ST10-016"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "alvida" });
    game.play({ type: "resolve-effect", optionId: "replace:cm" });
    answer(game, "f1");

    expect(boardCard(game.state, "p1", "alvida")).toBeDefined();
    expect(ids(game.state.players.p1.hand)).toHaveLength(1);

    // The second removal the same turn is not answered.
    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "alvida" });
    expect(effectOptions(game)).not.toContain("replace:cm");
    answer(game);

    expect(boardCard(game.state, "p1", "alvida")).toBeUndefined();
    expect(ids(game.state.players.p1.hand)).toHaveLength(1);
  });
});

describe("ST25-004 Buggy", () => {
  covers("ST25-004", "[Activate: Main]");

  it("trashes a card and itself to play a Cross Guild body of cost 6 or less", () => {
    const game = table("st25-004-play")
      .withBoard("p1", [character("buggy", "ST25-004")])
      .withHand("p1", [
        instance("fodder", "OP09-057"),
        instance("mihawk", "OP09-048"),
        instance("big", "OP09-051"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "buggy" });
    applyIfOffered(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });

    const offered = effectOptions(game);
    expect(offered).toContain("mihawk");
    expect(offered).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "mihawk" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["mihawk"]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["buggy", "fodder"]),
    );
  });

  it("still pays behind another Leader, and plays nothing", () => {
    const game = table("st25-004-other")
      .withLeader("p1", NOT_BUGGY)
      .withBoard("p1", [character("buggy", "ST25-004")])
      .withHand("p1", [
        instance("fodder", "OP09-057"),
        instance("mihawk", "OP09-048"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "buggy" });
    applyIfOffered(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    answer(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["mihawk"]);
  });
});

describe("ST25-005 Mohji", () => {
  covers("ST25-005", "static", "[On K.O.]");

  it("gains [Blocker] and +1 cost beside two Characters printed at 5 or more", () => {
    const on = table("st25-005-on")
      .withBoard("p1", [
        character("mohji", "ST25-005"),
        character("croc", "OP09-046"),
        character("mihawk", "OP09-048"),
      ])
      .build();
    expect(costOn(on, "mohji")).toBe(5);
    expect(hasKeyword(on.state, "p1", "mohji", "Blocker")).toBe(true);

    const off = table("st25-005-off")
      .withBoard("p1", [character("mohji", "ST25-005")])
      .build();
    expect(costOn(off, "mohji")).toBe(4);
    expect(hasKeyword(off.state, "p1", "mohji", "Blocker")).toBe(false);
  });

  const koMohji = (seed: string, handSize: number) => {
    const game = defending(seed)
      .withBoard("p1", [character("mohji", "ST25-005", { rested: true })])
      .withHand("p1", copies(handSize, "OP09-057", "held"))
      .withBoard("p2", [character("attacker", "OP09-046")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "mohji",
    });
    declineDefence(game);
    answer(game);
    expect(boardCard(game.state, "p1", "mohji")).toBeUndefined();
    return game;
  };

  it("draws a card when K.O.'d with 3 or less in hand", () => {
    const game = koMohji("st25-005-draw", 3);
    expect(game.state.players.p1.hand).toHaveLength(4);
  });

  it("draws nothing with 4 in hand", () => {
    const game = koMohji("st25-005-full", 4);
    expect(game.state.players.p1.hand).toHaveLength(4);
  });
});

describe("PRB02-009 Mr.3(Galdino)", () => {
  covers("PRB02-009", "[Blocker]", "static");

  it("blocks", () => {
    const game = defending("prb02-009-block")
      .withBoard("p1", [character("mr3", "PRB02-009")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "mr3",
        ),
    ).toBe(true);
  });

  it("trashes itself for two cards when an opposing Event rests it", () => {
    const game = defending("prb02-009-event")
      .withBoard("p1", [character("mr3", "PRB02-009")])
      .withHand("p1", [])
      .withDeckTop("p1", copies(2, "OP09-057", "drawn"))
      .withHand("p2", [instance("vise", "ST10-017")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-017" });
    game.play({ type: "resolve-effect", optionId: "mr3" });
    answer(game, "apply");

    expect(boardCard(game.state, "p1", "mr3")).toBeUndefined();
    expect(ids(game.state.players.p1.trash)).toContain("mr3");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn-1", "drawn-2"]);
  });

  it("answers an opposing Character's effect too, and may stay", () => {
    const game = defending("prb02-009-character")
      .withBoard("p1", [character("mr3", "PRB02-009")])
      .withHand("p1", [])
      .withBoard("p2", [character("drill", "OP14-032")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "drill",
      targetInstanceId: "p1-leader",
    });
    // Humandrill's own rest-on-rest clause is the opposing Character effect.
    game.play({ type: "resolve-effect", optionId: "mr3" });
    expect(effectOptions(game)).toContain("skip");
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(boardCard(game.state, "p1", "mr3")?.rested).toBe(true);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("is not offered when it rests itself to attack", () => {
    const game = table("prb02-009-attack")
      .withBoard("p1", [character("mr3", "PRB02-009")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "mr3",
      targetInstanceId: "p2-leader",
    });

    expect(game.state.pendingEffect).toBeFalsy();
    expect(boardCard(game.state, "p1", "mr3")?.rested).toBe(true);
  });
});

describe("OP09-042 Buggy: the 10-cost Buggy for five DON!!", () => {
  covers("OP09-042", "[Activate: Main]");
  covers("OP09-051", "[On Play]");

  const landBuggy = (seed: string, fourth: string) => {
    const game = table(seed)
      .withBoard("p1", [
        character("cm", "ST25-003"),
        character("mihawk", "OP09-048"),
        character("cabaji", "ST25-002"),
        character("fourth", fourth),
      ])
      .withHand("p1", [
        instance("fodder", "OP09-057"),
        instance("buggy", "OP09-051"),
      ])
      .withBoard("p2", [character("target", "OP09-056")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    applyIfOffered(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "buggy" });
    answer(game, "target");
    return game;
  };

  it("stays on a board where two ST-25 4-costs count as 5", () => {
    // Crocodile & Mihawk and Mihawk are the two printed 5-or-mores; Cabaji and
    // Alvida count as 5 beside them, and Buggy makes five.
    const game = landBuggy("op09-buggy-stays", "ST25-001");

    expect(boardCard(game.state, "p1", "buggy")).toBeDefined();
    expect(boardCard(game.state, "p2", "target")).toBeUndefined();
  });

  it("goes to the bottom of the deck one 5-cost short", () => {
    const game = landBuggy("op09-buggy-short", "OP09-056");

    expect(boardCard(game.state, "p1", "buggy")).toBeUndefined();
    expect(boardCard(game.state, "p2", "target")).toBeUndefined();
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("buggy");
  });
});
