import { describe, expect, it } from "vitest";
import { getLegalActions, hasKeyword } from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * ST-18 "Monkey.D.Luffy", the Purple Land of Wano starter deck.
 *
 * Fifteen identities, and five of them are new: the Leader OP05-060 and the
 * eight OP-05 slots came into the pool with the set and are driven by
 * `test/op05.test.ts`, and P-041 prints nothing at all. What is here is the
 * five ST18 exclusives, ST18-001 excepted -- it reached the pool with the
 * OP-12 [Trafalgar Law] package and is driven by
 * `test/op12-rosinante-clauses.test.ts`,
 * which is where the interaction it was written for lives.
 *
 * Every position seats the deck itself. That matters more here than usual:
 * four of the five clauses below read "8 or more DON!! cards on your field",
 * and the number a position leaves on the field is the whole test. `table()`
 * is ten DON!! out and `shortOfEight()` is seven, so each case says which side
 * of the line it is on.
 */

const ST18 = "(Purple) Monkey.D.Luffy - Starter Deck 18";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

/** ST-18 in its own Main Phase with all ten DON!! on the field. */
const table = (seed: string) =>
  scenario()
    .decks(ST18, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** The same turn with three DON!! back in the DON!! deck: seven on the field. */
const shortOfEight = (seed: string) => table(seed).withDonDeck("p1", 3);

/** The opponent acting, for the [Blocker] window. */
const defending = (seed: string) =>
  scenario()
    .decks(ST18, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Take the apply branch of an `optional` prompt, if one is open. */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

describe("ST18-002 O-Nami", () => {
  covers("ST18-002", "[On Play]", "[Blocker]");

  it("trashes one and draws two with eight or more DON!! out", () => {
    const game = table("st18-002-on-play")
      .withHand("p1", [
        instance("o-nami", "ST18-002"),
        instance("spare", "P-041"),
      ])
      .withDeckTop("p1", [
        instance("drawn-a", "OP05-068"),
        instance("drawn-b", "OP05-072"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST18-002" });
    // The trash comes first, so the only card it can name is the one the hand
    // already held -- neither drawn card is in hand yet to be discarded.
    expect(effectOptions(game.state)).toEqual(["spare"]);
    game.play({ type: "resolve-effect", optionId: "spare" });
    settle(game);

    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "spare",
    ]);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn-a",
      "drawn-b",
    ]);
  });

  it("does nothing at seven DON!! on the field", () => {
    const game = shortOfEight("st18-002-short")
      .withHand("p1", [
        instance("o-nami", "ST18-002"),
        instance("spare", "P-041"),
      ])
      .withDeckTop("p1", [instance("untouched", "OP05-068")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST18-002" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "spare",
    ]);
    expect(game.state.players.p1.trash).toEqual([]);
  });

  it("blocks a declared attack and rests doing it", () => {
    const game = defending("st18-002-blocker")
      .withBoard("p1", [character("o-nami", "ST18-002")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    expect(hasKeyword(game.state, "p1", "o-nami", "Blocker")).toBe(true);
    game.play({ type: "attack" });
    game.play({ summary: "Block with O-Nami" });

    const blocker = game.state.players.p1.board.find(
      (card) => card.instanceId === "o-nami",
    );
    expect(blocker?.rested).toBe(true);
    expect(game.state.activeAttack?.targetInstanceId).toBe("o-nami");
  });
});

describe("ST18-003 San-Gorou", () => {
  covers("ST18-003", "[When Attacking]");

  it("draws once when it attacks with eight or more DON!! out", () => {
    const game = table("st18-003-attack")
      .withBoard("p1", [character("san-gorou", "ST18-003")])
      .withDeckTop("p1", [instance("drawn", "OP05-072")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "san-gorou" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
  });

  it("draws nothing at seven DON!! on the field", () => {
    const game = shortOfEight("st18-003-short")
      .withBoard("p1", [character("san-gorou", "ST18-003")])
      .withDeckTop("p1", [instance("untouched", "OP05-072")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "san-gorou" });

    expect(game.state.players.p1.hand).toEqual([]);
  });
});

describe("ST18-004 Zoro-Juurou", () => {
  covers("ST18-004", "[On Play]");

  it("takes the one purple Straw Hat off the top five and bottoms the rest", () => {
    const game = table("st18-004-search")
      .withHand("p1", [instance("zoro-juurou", "ST18-004")])
      .withDeckTop("p1", [
        instance("d1", "ST32-004"),
        instance("d2", "ST32-004"),
        instance("d3", "OP05-072"),
        instance("d4", "ST32-004"),
        instance("d5", "ST32-004"),
        instance("d6", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST18-004" });
    // Only the purple {Straw Hat Crew} card among the five is offered; the
    // green bodies beside it are the right category and the wrong colour.
    expect(effectOptions(game.state)).toEqual(["d3", "done"]);
    game.play({ type: "resolve-effect", optionId: "d3" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "d3",
    ]);
    // The sixth card was never looked at, so it is still the top of the deck
    // and the other four are underneath it.
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("d6");
    expect(game.state.players.p1.deck).toHaveLength(5);
  });
});

describe("ST18-005 Luffy-Tarou", () => {
  covers("ST18-005", "[On Play]");

  it("returns a DON!! to play a cost-5-or-less purple Straw Hat from hand", () => {
    const game = table("st18-005-free-play")
      .withHand("p1", [
        instance("luffy-tarou", "ST18-005"),
        instance("cheap", "OP05-068"),
        instance("too-big", "P-041"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST18-005" });
    applyOptional(game);
    // Seven of the ten were spent on Luffy-Tarou itself, so the DON!! -1 is
    // paid out of the rested pile.
    game.play({ type: "resolve-effect", optionId: "return-don:rested" });
    // P-041 is a purple {Straw Hat Crew} Character too, and costs 10.
    expect(effectOptions(game.state)).toEqual(["cheap", "done"]);
    game.play({ type: "resolve-effect", optionId: "cheap" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "luffy-tarou",
      "cheap",
    ]);
    // Seven paid for Luffy-Tarou and one returned to the DON!! deck.
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("keeps the DON!! when the free play is declined", () => {
    const game = table("st18-005-decline")
      .withHand("p1", [
        instance("luffy-tarou", "ST18-005"),
        instance("cheap", "OP05-068"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST18-005" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "luffy-tarou",
    ]);
    expect(game.state.players.p1.donDeck).toEqual([]);
  });
});
