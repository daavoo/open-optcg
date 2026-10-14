import { describe, expect, it } from "vitest";
import { effectiveCost } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Blue/Black) Usopp feature deck, played through its own list.
 *
 * Bandai's write-up builds the deck on keeping {Dressrosa} bodies on the
 * board -- the Leader's +1 cost, two Sabos and Franky -- and on resting the
 * Leader or the Stage to dig and to K.O. Each clause is driven behind
 * OP10-042, the Leader the rest costs and Corrida Coliseum's gate read.
 */
const DECK = "(Blue/Black) Usopp - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active })
    .bareTable()
    .withLeader("p1", "OP10-042");

type Game = ReturnType<ReturnType<typeof table>["build"]>;

/** Answer the pending effect with `optionId`, or its first offer if absent. */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 20) throw new Error("the effect never settled");
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

/** The ids of the open decision's options. */
const offers = (game: Game): string[] =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId: string }).optionId);

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

/** Whether `attacker` is offered an attack on `target`. */
const canSwing = (game: Game, attacker: string, target: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" &&
        (action as { attackerInstanceId?: string }).attackerInstanceId ===
          attacker &&
        (action as { targetInstanceId?: string }).targetInstanceId === target,
    );

/** Pass the Block and Counter windows without defending. */
function noDefence(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

describe("OP04-077 Ideo", () => {
  covers("OP04-077", "[Blocker]");

  it("is offered as a blocker against an attack on the Leader", () => {
    const game = table("op04-077-block", "p2")
      .withBoard("p1", [character("ideo", "OP04-077")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "ideo" });

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
  });
});

describe("OP04-083 Sabo", () => {
  covers("OP04-083", "[Blocker]");

  it("is offered as a blocker against an attack on the Leader", () => {
    const game = table("op04-083-block", "p2")
      .withBoard("p1", [character("sabo", "OP04-083")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "sabo" });

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
  });

  covers("OP04-083", "[On Play]");

  it("draws 2 and trashes 2, and may trash the cards just drawn", () => {
    const game = table("op04-083-draw")
      .withHand("p1", [
        instance("sabo", "OP04-083"),
        instance("kept", "OP10-046"),
      ])
      .withDeckTop("p1", [
        instance("drawn-a", "OP10-057"),
        instance("drawn-b", "OP10-058"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP04-083" });
    expect(offers(game)).toEqual(
      expect.arrayContaining(["kept", "drawn-a", "drawn-b"]),
    );
    answer(game, "drawn-a", "drawn-b");

    expect(ids(game.state.players.p1.hand)).toEqual(["kept"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "drawn-a",
      "drawn-b",
    ]);
  });

  it("protects the Characters on the field from K.O. by effects through the opponent's turn", () => {
    const game = table("op04-083-protect")
      .withBoard("p1", [character("ideo", "OP04-077")])
      .withHand("p1", [
        instance("sabo", "OP04-083"),
        instance("late", "OP15-052"),
      ])
      .withHand("p2", [instance("seal", "OP06-019")])
      // `bareTable` empties the deck, and p2 draws on the way into its turn.
      .withDeckTop("p2", [instance("p2-draw", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP04-083" });
    answer(game);
    // A body played after the clause resolved is not one it named.
    game.play({ type: "play-card", cardNumber: "OP15-052" });
    answer(game);
    const turn = game.state.turn;
    for (const id of ["ideo", "sabo"]) {
      // Through the opponent's turn, and no player named: the controller's
      // own K.O. effects are stopped too, which Trebol's field does not say.
      expect(
        game.state.players.p1.board.find((card) => card.instanceId === id)
          ?.koImmuneToEffectsUntilTurn,
      ).toBe(turn + 1);
    }

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "late")
        ?.koImmuneToEffectsUntilTurn,
    ).toBeUndefined();

    game.pass();
    // Ideo is a legal target for the Event, but the K.O. does nothing to it.
    game.play({ summary: "Activate Blue Dragon Seal Water Stream" });
    game.play({ type: "resolve-effect", optionId: "ideo" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toContain("ideo");
    expect(ids(game.state.players.p1.trash)).toEqual([]);
    expect(ids(game.state.players.p2.trash)).toEqual(["seal"]);
  });
});

describe("OP04-096 Corrida Coliseum", () => {
  covers("OP04-096", "static");

  const coliseum = (seed: string, leader = "OP10-042", stage = true) => {
    let builder = table(seed)
      .withLeader("p1", leader)
      .withHand("p1", [instance("zoro", "OP10-095")])
      .withBoard("p2", [character("oden", "ST32-002", { rested: true })]);
    if (stage)
      builder = builder.withStage("p1", instance("coliseum", "OP04-096"));
    const game = builder.build();
    game.play({ type: "play-card", cardNumber: "OP10-095" });
    answer(game, "skip", "done");
    return game;
  };

  it("lets a {Dressrosa} Character attack a Character the turn it is played", () => {
    const game = coliseum("op04-096-rush");

    expect(canSwing(game, "zoro", "oden")).toBe(true);
    // Characters only -- not the Leader.
    expect(canSwing(game, "zoro", "p2-leader")).toBe(false);
  });

  it("does nothing without the Stage", () => {
    const game = coliseum("op04-096-no-stage", "OP10-042", false);

    expect(canSwing(game, "zoro", "oden")).toBe(false);
  });

  it("does nothing behind a Leader without the {Dressrosa} type", () => {
    // ST32-001 is a {Land of Wano} Leader.
    const game = coliseum("op04-096-other-leader", "ST32-001");

    expect(canSwing(game, "zoro", "oden")).toBe(false);
  });
});

describe("OP10-049 Sabo", () => {
  covers("OP10-049", "static");

  it("returns itself to hand instead of a base-cost-7 Character leaving the field", () => {
    const game = table("op10-049-save", "p2")
      .withBoard("p1", [
        character("sabo", "OP10-049"),
        character("kyros", "OP10-046"),
      ])
      .withHand("p2", [instance("kingdom", "EB01-059")])
      .build();
    // The Leader's +1 puts Kyros at 8; the clause reads base cost.
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[1]!),
    ).toBe(8);

    game.play({ summary: "Activate Kingdom Come" });
    game.play({ type: "resolve-effect", optionId: "kyros" });
    expect(offers(game)).toContain("replace:sabo");
    game.play({ type: "resolve-effect", optionId: "replace:sabo" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["kyros"]);
    expect(ids(game.state.players.p1.hand)).toContain("sabo");
    expect(ids(game.state.players.p1.trash)).not.toContain("sabo");
  });

  it("answers a bounce as well as a K.O.", () => {
    const game = table("op10-049-bounce", "p2")
      .withBoard("p1", [
        character("sabo", "OP10-049"),
        character("franky", "OP10-090"),
      ])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ summary: "Activate Special Muggy Ball" });
    game.play({ type: "resolve-effect", optionId: "franky" });
    expect(offers(game)).toContain("replace:sabo");
    game.play({ type: "resolve-effect", optionId: "replace:sabo" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["franky"]);
    expect(ids(game.state.players.p1.hand)).toContain("sabo");
  });

  it("does not save a [Sabo], itself included", () => {
    const game = table("op10-049-other-sabo", "p2")
      .withBoard("p1", [
        character("sabo", "OP10-049"),
        character("sabo-04", "OP04-083"),
      ])
      .withHand("p2", [instance("kingdom", "EB01-059")])
      .build();

    game.play({ summary: "Activate Kingdom Come" });
    game.play({ type: "resolve-effect", optionId: "sabo-04" });

    expect(offers(game).some((id) => id.startsWith("replace:"))).toBe(false);
  });

  it("is not offered for a K.O. in battle", () => {
    const game = table("op10-049-battle", "p2")
      .withBoard("p1", [
        character("sabo", "OP10-049"),
        character("leo", "OP10-057", { rested: true }),
      ])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "leo",
    });
    noDefence(game);
    expect(offers(game).some((id) => id.startsWith("replace:"))).toBe(false);
    answer(game);

    expect(ids(game.state.players.p1.trash)).toContain("leo");
  });
});

describe("OP10-057 Leo", () => {
  covers("OP10-057", "[On Play]");

  it("rests the Leader to add up to 2 {Dressrosa} cards from the top 5, then trashes 1", () => {
    const game = table("op10-057-dig")
      .withHand("p1", [
        instance("leo", "OP10-057"),
        instance("spare", "ST32-002"),
      ])
      .withDeckTop("p1", [
        instance("kyros", "OP10-046"),
        instance("oden", "ST32-002"),
        instance("rebecca", "OP10-058"),
        instance("other-leo", "OP10-057"),
        instance("zoro", "OP10-095"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-057" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    // "Other than [Leo]", and {Dressrosa} only: neither the second Leo nor
    // Oden is offered.
    expect(offers(game)).toEqual(["kyros", "rebecca", "zoro", "done"]);
    game.play({ type: "resolve-effect", optionId: "kyros" });
    game.play({ type: "resolve-effect", optionId: "rebecca" });
    // The bottom-of-deck order, then the trash from hand.
    game.play((action) => action.type === "resolve-effect");
    game.play({ type: "resolve-effect", optionId: "spare" });

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "kyros",
      "rebecca",
    ]);
    expect(ids(game.state.players.p1.trash)).toEqual(["spare"]);
  });
});

describe("OP10-058 Rebecca", () => {
  covers("OP10-058", "[On Play]");

  it("plays one revealed {Dressrosa} Character, and the other rested at cost 4 or less", () => {
    const game = table("op10-058-play")
      .withHand("p1", [
        instance("rebecca", "OP10-058"),
        instance("kyros", "OP10-046"),
        instance("ideo", "OP04-077"),
      ])
      .build();

    // The Leader's +1 is for Characters on the field: in hand Kyros is still
    // 7, so "a cost of 7 or less" reaches the card Rebecca is played for.
    const kyros = game.state.players.p1.hand.find(
      (card) => card.instanceId === "kyros",
    )!;
    expect(effectiveCost(game.state, "p1", kyros)).toBe(7);

    game.play({ type: "play-card", cardNumber: "OP10-058" });
    // Reveal both, then play Kyros active; Ideo follows rested.
    game.play({ type: "resolve-effect", optionId: "kyros" });
    game.play({ type: "resolve-effect", optionId: "ideo" });
    game.play({ type: "resolve-effect", optionId: "kyros" });
    // Kyros's own [On Play] may bounce any Character, Ideo included.
    game.play({ type: "resolve-effect", optionId: "done" });

    const board = game.state.players.p1.board;
    expect(ids(board).sort()).toEqual(["ideo", "kyros", "rebecca"]);
    expect(board.find((card) => card.instanceId === "ideo")?.rested).toBe(true);
    expect(board.find((card) => card.instanceId === "kyros")?.rested).toBe(
      false,
    );
  });
});

describe("OP10-083 Kouzuki Momonosuke", () => {
  covers("OP10-083", "[Activate: Main]");

  it("rests itself and the Leader to give an opponent's Character −2 cost", () => {
    const game = table("op10-083-debuff")
      .withBoard("p1", [character("momo", "OP10-083")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();
    const before = effectiveCost(
      game.state,
      "p2",
      game.state.players.p2.board[0]!,
    );

    game.play({ type: "activate-main", sourceInstanceId: "momo" });
    answer(game, "apply", "p1-leader", "oden");

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(Math.max(0, before - 2));
  });
});

describe("OP10-090 Franky", () => {
  covers("OP10-090", "[Blocker]");

  it("is offered as a blocker", () => {
    const game = table("op10-090-block", "p2")
      .withBoard("p1", [character("franky", "OP10-090")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "franky" });

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
  });

  covers("OP10-090", "[On K.O.]");

  it("plays a cost-3-or-less {Dressrosa} Character from the trash rested", () => {
    const game = table("op10-090-ko", "p2")
      .withBoard("p1", [character("franky", "OP10-090")])
      .withTrash("p1", [
        instance("ideo", "OP04-077"),
        instance("kyros", "OP10-046"),
      ])
      .withHand("p2", [instance("kingdom", "EB01-059")])
      .build();

    game.play({ summary: "Activate Kingdom Come" });
    answer(game, "franky", "ideo");

    const board = game.state.players.p1.board;
    expect(ids(board)).toEqual(["ideo"]);
    expect(board[0]?.rested).toBe(true);
    expect(ids(game.state.players.p1.trash)).toContain("kyros");
  });
});

describe("OP10-095 Roronoa Zoro", () => {
  covers("OP10-095", "[On Play]");

  it("rests the Leader to K.O. a cost-4-or-less Character, then trashes 2 from the deck", () => {
    const game = table("op10-095-ko")
      .withHand("p1", [instance("zoro", "OP10-095")])
      .withBoard("p2", [character("oden", "ST32-004")])
      .withDeckTop("p1", [
        instance("top-a", "OP10-057"),
        instance("top-b", "OP10-058"),
      ])
      .build();
    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBeLessThanOrEqual(4);

    game.play({ type: "play-card", cardNumber: "OP10-095" });
    answer(game, "apply", "p1-leader", "oden");

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["top-a", "top-b"]);
  });
});

describe("OP10-118 Monkey.D.Luffy", () => {
  covers("OP10-118", "[When Attacking]");

  it("buries 3 from the trash to make a 5-card hand trash 1", () => {
    const game = table("op10-118-attack")
      .withBoard("p1", [character("luffy", "OP10-118")])
      .withTrash("p1", copies(3, "OP10-057", "dead"))
      .withHand("p2", copies(5, "ST32-002", "held"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    answer(game, "apply");

    expect(game.state.players.p1.trash).toEqual([]);
    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(game.state.players.p2.trash).toHaveLength(1);
  });
});
