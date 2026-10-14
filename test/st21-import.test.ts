import { describe, expect, it } from "vitest";
import { currentPower, getLegalActions } from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * STARTER DECK -EX Gear Fifth- [ST-21], the half of the product the format
 * decks did not already play.
 *
 * `packages/cards/src/st21.ts` explains where the records come from. Five of
 * its identities were in the pool before the product was and are driven from
 * the tests of the decks that ship them; what is here is the other eight.
 *
 * The deck's currency is rested DON!!: three of its cards move it onto a body,
 * and three more read how much of it is sitting there. Rested DON!! cannot be
 * spent on the turn it arrives, so what every one of these clauses buys is the
 * turn after.
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter -- the documented
 * shape for a card outside a manifest, and why nothing here asserts on a win
 * rate.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" });

const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" });

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

describe("ST21-002 Usopp", () => {
  covers("ST21-002", "[Opponent's Turn]");

  it("defends 2000 bigger with two DON!! on it", () => {
    const game = defending("st21-002-defence")
      .withBoard("p1", [character("usopp", "ST21-002")])
      .withGivenDon("p1", "usopp", 2)
      .build();

    // 3000 printed plus the two DON!! plus the clause's 2000. `currentPower`
    // counts the DON!! on either turn; what the printed marker gates is the
    // 2000 that separates this case from the next.
    expect(currentPower(game.state, "p1", "usopp")).toBe(7_000);
  });

  it("adds nothing on its controller's own turn", () => {
    const game = table("st21-002-own-turn")
      .withBoard("p1", [character("usopp", "ST21-002")])
      .withGivenDon("p1", "usopp", 2)
      .build();

    expect(currentPower(game.state, "p1", "usopp")).toBe(5_000);
  });

  it("adds nothing with only one DON!! on it", () => {
    const game = defending("st21-002-one-don")
      .withBoard("p1", [character("usopp", "ST21-002")])
      .withGivenDon("p1", "usopp", 1)
      .build();

    expect(currentPower(game.state, "p1", "usopp")).toBe(4_000);
  });
});

describe("ST21-004 Jewelry Bonney", () => {
  covers("ST21-004", "[On K.O.]");

  it("draws when it dies carrying two DON!!", () => {
    const game = table("st21-004-draw")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("bonney", "ST21-004")])
      .withGivenDon("p2", "bonney", 2)
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "bonney" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
  });

  it("draws nothing when it dies bare", () => {
    // The gate reads the DON!! that were on the body as it left the field, so
    // a copy the opponent answered before its controller committed to it pays
    // nothing.
    const game = table("st21-004-bare")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("bonney", "ST21-004")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "bonney" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(handBefore);
  });
});

describe("ST21-007 Sentomaru", () => {
  covers("ST21-007", "[Blocker]");

  it("blocks", () => {
    const game = defending("st21-007-block")
      .withBoard("p1", [character("sentomaru", "ST21-007")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "sentomaru",
        ),
    ).toBe(true);
  });
});

describe("ST21-009 Nami", () => {
  covers("ST21-009", "[Activate: Main]");

  it("moves two rested DON!! onto a Straw Hat body", () => {
    const game = table("st21-009-gift")
      .withBoard("p1", [
        character("nami", "ST21-009"),
        character("mate", "ST21-005"),
      ])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "activate-main", cardNumber: "ST21-009" });
    game.play({ type: "resolve-effect", optionId: "mate" });
    settle(game);

    expect(boardCard(game, "p1", "mate")?.attachedDon).toHaveLength(2);
  });

  it("reaches the Leader, which an attach cannot", () => {
    const game = table("st21-009-leader")
      .withBoard("p1", [character("nami", "ST21-009")])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "activate-main", cardNumber: "ST21-009" });

    expect(effectOptions(game.state)).toContain("p1-leader");
  });

  it("is not offered with no rested DON!! to move", () => {
    const game = table("st21-009-nothing-rested")
      .withBoard("p1", [character("nami", "ST21-009")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST21-009",
        ),
    ).toBe(false);
  });

  it("only fires once in a turn", () => {
    const game = table("st21-009-once")
      .withBoard("p1", [
        character("nami", "ST21-009"),
        character("mate", "ST21-005"),
      ])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", cardNumber: "ST21-009" });
    game.play({ type: "resolve-effect", optionId: "mate" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST21-009",
        ),
    ).toBe(false);
  });
});

describe("ST21-010 Nico Robin", () => {
  covers("ST21-010", "[When Attacking]");

  it("K.O.s a 4000 on the swing with two DON!! on it", () => {
    const game = table("st21-010-ko")
      .withBoard("p1", [character("robin", "ST21-010")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .withGivenDon("p1", "robin", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "robin",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("K.O.s nothing with one DON!! on it", () => {
    const game = table("st21-010-one-don")
      .withBoard("p1", [character("robin", "ST21-010")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .withGivenDon("p1", "robin", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "robin",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    declineDefence(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });
});

describe("ST21-011 Franky", () => {
  covers("ST21-011", "[Opponent's Turn]");

  it("lifts every small Straw Hat body its controller has", () => {
    const game = defending("st21-011-aura")
      .withBoard("p1", [
        character("franky", "ST21-011"),
        character("small", "ST21-005"),
      ])
      .withGivenDon("p1", "franky", 2)
      .build();

    expect(currentPower(game.state, "p1", "small")).toBe(5_000);
  });

  it("lifts nothing while the granting copy is unpaid", () => {
    const game = defending("st21-011-unpaid")
      .withBoard("p1", [
        character("franky", "ST21-011"),
        character("small", "ST21-005"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "small")).toBe(4_000);
  });

  it("lifts nothing on its controller's own turn", () => {
    const game = table("st21-011-own-turn")
      .withBoard("p1", [
        character("franky", "ST21-011"),
        character("small", "ST21-005"),
      ])
      .withGivenDon("p1", "franky", 2)
      .build();

    expect(currentPower(game.state, "p1", "small")).toBe(4_000);
  });
});

describe("ST21-012 Brook", () => {
  covers("ST21-012", "[When Attacking]");

  it("moves two rested DON!! on the swing, Leader included", () => {
    const game = table("st21-012-gift")
      .withBoard("p1", [character("brook", "ST21-012")])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "brook",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(2);
  });
});

describe("ST21-016 Gum-Gum Dawn Whip", () => {
  covers("ST21-016", "[Main]", "[Trigger]");

  it("buffs for the turn and silences a small [Blocker]", () => {
    const game = table("st21-016-main")
      .withHand("p1", [instance("whip", "ST21-016")])
      .withBoard("p1", [character("attacker", "ST21-005")])
      .withBoard("p2", [character("blocker", "ST21-007")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST21-016" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    game.play({ type: "resolve-effect", optionId: "blocker" });
    settle(game);

    expect(currentPower(game.state, "p1", "attacker")).toBe(5_000);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    expect(
      game.legalActions("p2").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("K.O.s a 4000 off a Life card", () => {
    const game = table("st21-016-trigger")
      .withLife("p2", [instance("whip", "ST21-016")])
      .withBoard("p1", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});
