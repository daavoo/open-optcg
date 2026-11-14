import { describe, expect, it } from "vitest";
import { currentPower } from "@one-piece-sim/engine-core";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP18-060 Saint Gunko (Leader), clause by clause and edge by edge.
 *
 * `op18-purple.test.ts` holds the first cases of each clause; this file pins
 * the rest: which plays out of the trash the watcher answers (an Event's, an
 * [On K.O.]'s on the opponent's turn, the opponent's own), the two
 * [Once Per Turn] uses being independent, the draw-then-trash order, and the
 * activation's base-power gate, DON!! deck and negation edges.
 *
 * Fillers: OP11-003 (a 6000 vanilla), OP18-062 (a 10000 vanilla), OP18-073 (a
 * 7000 vanilla), OP18-103 Jabra (8000 base, only an [On K.O.] and a
 * [Trigger]).
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";
const GUNKO = "OP18-060";

/** p1 in its own Main Phase on a bare table, ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", GUNKO);

/** p2 in its own Main Phase, for plays out of the trash on p1's off-turn. */
const defending = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withLeader("p1", GUNKO);

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const effectOptions = (game: Game): string[] =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId: string }).optionId);

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

/** Resolve the open effect, taking a preferred option wherever one is offered. */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("the effect never settled");
    const options = effectOptions(game);
    const wanted = preferred.find((id) => options.includes(id));
    if (wanted) pick(game, wanted);
    else game.play({ type: "resolve-effect" });
  }
}

/** `answer`, stopping at the first prompt that offers `stopAt`. */
function answerUntil(game: Game, stopAt: string, ...preferred: string[]) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("the effect never settled");
    const options = effectOptions(game);
    if (options.includes(stopAt)) return;
    const wanted = preferred.find((id) => options.includes(id));
    if (wanted) pick(game, wanted);
    else game.play({ type: "resolve-effect" });
  }
  throw new Error(`no prompt offered ${stopAt}`);
}

const leaderActivations = (game: Game) =>
  game
    .legalActions("p1")
    .filter(
      (action) =>
        action.type === "activate-main" && action.sourceCardNumber === GUNKO,
    );

/** p2 attacks `target` with `attacker` and p1 takes no defensive step. */
function koInBattle(game: Game, attacker: string, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    !game.state.pendingEffect
  ) {
    game.pass();
  }
}

describe("OP18-060 Saint Gunko (Leader) watcher: which plays it answers", () => {
  covers(GUNKO, "static");

  it("answers a Character an Event plays from the trash, drawing before it trashes", () => {
    const game = table("gunko-event")
      .withDeckTop("p1", copies(3, "OP11-003", "drawn"))
      .withHand("p1", [
        instance("event", "OP18-096"),
        instance("kept", "OP11-003"),
      ])
      .withTrash("p1", [instance("knight", "OP18-083")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP18-096" });
    answerUntil(game, "drawn-1", "apply", "knight");

    // Both drawn cards are in hand before the trash is asked for, so the
    // trash may take either of them: draw 2, then trash 1.
    expect(ids(game.state.players.p1.board)).toEqual(["knight"]);
    const hand = ids(game.state.players.p1.hand);
    expect(hand).toEqual(["kept", "drawn-1", "drawn-2"]);
    expect(effectOptions(game).sort()).toEqual(
      ["drawn-1", "drawn-2", "kept"].sort(),
    );

    pick(game, "drawn-2");
    expect(game.state.pendingEffect).toBeFalsy();
    expect(ids(game.state.players.p1.hand)).toEqual(["kept", "drawn-1"]);
    expect(ids(game.state.players.p1.trash)).toContain("drawn-2");
    expect(ids(game.state.players.p1.trash)).toContain("event");
    expect(ids(game.state.players.p1.deck)[0]).toBe("drawn-3");
  });

  it("answers a Character that plays itself from the trash on the opponent's turn", () => {
    // OP18-083's [On K.O.]: trash 2 from hand to come back. A play from the
    // trash, on p2's turn, which the Leader's clause does not exclude.
    const game = defending("gunko-off-turn")
      .withDeckTop("p1", copies(3, "OP11-003", "drawn"))
      .withHand("p1", copies(2, "OP11-003", "hand"))
      .withBoard("p1", [character("knight", "OP18-083", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-062", { playedTurn: 1 })])
      .build();

    koInBattle(game, "attacker", "knight");
    answer(game, "apply", "hand-1", "hand-2");

    expect(ids(game.state.players.p1.board)).toEqual(["knight"]);
    // Two from hand for the [On K.O.], two drawn, one of those trashed.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(ids(game.state.players.p1.deck)[0]).toBe("drawn-3");
    expect(
      ids(game.state.players.p1.trash).filter((id) => id.startsWith("drawn")),
    ).toHaveLength(1);
  });

  it("does not answer the opponent playing a Character from their own trash", () => {
    // "From your trash": p2's Event playing p2's Character is not p1's play
    // out of p1's trash.
    const game = defending("gunko-their-trash")
      .withDeckTop("p1", copies(3, "OP11-003", "drawn"))
      .withHand("p2", [instance("event", "OP18-096")])
      .withTrash("p2", [instance("knight", "OP18-083")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP18-096" });
    answer(game, "apply", "knight");

    expect(ids(game.state.players.p2.board)).toEqual(["knight"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)[0]).toBe("drawn-1");
  });

  it("does not answer a Character played from hand on the opponent's turn either", () => {
    const game = defending("gunko-their-hand")
      .withDeckTop("p1", copies(3, "OP11-003", "drawn"))
      .withHand("p2", [instance("body", "OP11-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-003" });
    answer(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)[0]).toBe("drawn-1");
  });

  it("does not answer while the Leader's effects are negated", () => {
    const game = table("gunko-watch-negated")
      .withNegated("p1-leader")
      .withDeckTop("p1", copies(3, "OP11-003", "drawn"))
      .withHand("p1", [instance("event", "OP18-096")])
      .withTrash("p1", [instance("knight", "OP18-083")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP18-096" });
    answer(game, "apply", "knight");

    expect(ids(game.state.players.p1.board)).toEqual(["knight"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)[0]).toBe("drawn-1");
  });
});

describe("OP18-060 Saint Gunko (Leader): the two [Once Per Turn] uses are separate", () => {
  covers(GUNKO, "static", "[Activate: Main]");

  it("activates after the watcher has answered this turn", () => {
    const game = table("gunko-watch-then-activate")
      .withDeckTop("p1", copies(3, "OP11-003", "drawn"))
      .withHand("p1", [instance("event", "OP18-096")])
      .withTrash("p1", [instance("knight", "OP18-083")])
      .withBoard("p1", [character("oimo", "OP18-062")])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "activate-main", cardNumber: "OP18-096" });
    answer(game, "apply", "knight", "drawn-1");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn-2"]);

    expect(leaderActivations(game)).toHaveLength(1);
    const active = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", sourceCardNumber: GUNKO });
    answer(game, "drawn-2");
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.activeDon).toHaveLength(active + 1);
  });

  it("still answers a play from the trash after the activation is spent", () => {
    const game = table("gunko-activate-then-watch")
      .withDeckTop("p1", copies(3, "OP11-003", "drawn"))
      .withHand("p1", [
        instance("fuel", "OP11-003"),
        instance("event", "OP18-096"),
      ])
      .withTrash("p1", [instance("knight", "OP18-083")])
      .withBoard("p1", [character("oimo", "OP18-062")])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "activate-main", sourceCardNumber: GUNKO });
    answer(game, "fuel");
    expect(leaderActivations(game)).toHaveLength(0);

    game.play({ type: "activate-main", cardNumber: "OP18-096" });
    answer(game, "apply", "knight", "drawn-1");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn-2"]);
  });

  it("answers again on the next turn", () => {
    // Spent on p2's turn by OP18-083's [On K.O.] bringing it back, and
    // answered again on p1's own next turn by OP18-096 playing a second copy.
    const game = defending("gunko-next-turn")
      .withDeckTop("p1", copies(8, "OP11-003", "drawn"))
      .withHand("p1", [
        instance("event", "OP18-096"),
        ...copies(2, "OP11-003", "hand"),
      ])
      .withBoard("p1", [character("knight-1", "OP18-083", { rested: true })])
      .withTrash("p1", [instance("knight-2", "OP18-083")])
      .withBoard("p2", [character("attacker", "OP18-062", { playedTurn: 1 })])
      .build();

    koInBattle(game, "attacker", "knight-1");
    answer(game, "apply", "hand-1", "hand-2", "drawn-1");
    expect(ids(game.state.players.p1.hand)).toEqual(["event", "drawn-2"]);

    game.pass();
    answer(game);
    expect(game.state.turnPlayerId).toBe("p1");
    // p1's Draw Phase took drawn-3.
    expect(ids(game.state.players.p1.deck)[0]).toBe("drawn-4");

    game.play({ type: "activate-main", cardNumber: "OP18-096" });
    answer(game, "apply", "knight-2", "drawn-2");
    expect(ids(game.state.players.p1.board).sort()).toEqual([
      "knight-1",
      "knight-2",
    ]);
    expect(ids(game.state.players.p1.hand)).toEqual([
      "drawn-3",
      "drawn-4",
      "drawn-5",
    ]);
  });
});

describe("OP18-060 Saint Gunko (Leader) activation edges", () => {
  covers(GUNKO, "[Activate: Main]");

  it("qualifies on a Character of exactly 8000 base power", () => {
    const game = table("gunko-8000")
      .withBoard("p1", [character("jabra", "OP18-103")])
      .withHand("p1", [instance("fuel", "OP11-003")])
      .withDonDeck("p1", 1)
      .build();
    const active = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", sourceCardNumber: GUNKO });
    answer(game, "fuel");

    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
    expect(game.state.players.p1.activeDon).toHaveLength(active + 1);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("does not count a 7000 Character raised to 8000 by a given DON!!", () => {
    const game = table("gunko-buffed")
      .withBoard("p1", [character("tbone", "OP18-073")])
      .withGivenDon("p1", "tbone", 1)
      .withHand("p1", [instance("fuel", "OP11-003")])
      .withDonDeck("p1", 1)
      .build();

    expect(currentPower(game.state, "p1", "tbone")).toBe(8000);
    expect(leaderActivations(game)).toHaveLength(0);
  });

  it("does not count the opponent's 8000-base-power Character", () => {
    const game = table("gunko-their-body")
      .withBoard("p2", [character("oimo", "OP18-062")])
      .withHand("p1", [instance("fuel", "OP11-003")])
      .withDonDeck("p1", 1)
      .build();

    expect(leaderActivations(game)).toHaveLength(0);
  });

  it("asks which card of the hand pays, and trashes only that one", () => {
    const game = table("gunko-which-card")
      .withBoard("p1", [character("oimo", "OP18-062")])
      .withHand("p1", [instance("a", "OP11-003"), instance("b", "OP18-073")])
      .withDonDeck("p1", 1)
      .build();

    game.play({ type: "activate-main", sourceCardNumber: GUNKO });
    expect(
      effectOptions(game)
        .filter((id) => id !== "done")
        .sort(),
    ).toEqual(["a", "b"]);
    pick(game, "b");
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["a"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["b"]);
  });

  it("with an empty DON!! deck the cost can still be paid, for no DON!!", () => {
    // The cost precedes the colon, and a cost may be paid for an effect that
    // then does nothing; the gate the engine checks before offering is the
    // 8000-power Character, which is met.
    const game = table("gunko-empty-don-deck")
      .withBoard("p1", [character("oimo", "OP18-062")])
      .withHand("p1", [instance("fuel", "OP11-003")])
      .build();
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    const active = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", sourceCardNumber: GUNKO });
    answer(game, "fuel");

    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
    expect(game.state.players.p1.activeDon).toHaveLength(active);
    expect(leaderActivations(game)).toHaveLength(0);
  });

  it("is not offered while the Leader's effects are negated", () => {
    const game = table("gunko-activate-negated")
      .withNegated("p1-leader")
      .withBoard("p1", [character("oimo", "OP18-062")])
      .withHand("p1", [instance("fuel", "OP11-003")])
      .withDonDeck("p1", 1)
      .build();

    expect(leaderActivations(game)).toHaveLength(0);
  });
});
