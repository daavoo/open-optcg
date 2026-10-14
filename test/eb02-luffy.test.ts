import { describe, expect, it } from "vitest";
import { getLegalActions } from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's (Green/Purple) Monkey.D.Luffy feature deck, behind EB02-010.
 *
 * Every card in the fifty but one was already programmed and tested by the
 * EB-02, OP-05 and ST-18 imports. OP03-072 Gum-Gum Jet Gatling is the one the
 * list brought into the pool, and its two clauses are tested here, beside the
 * line Bandai builds the deck around: the Leader's DON!! −2 refunded by
 * Sanji & Pudding, which leaves the field DON!! at or under the opponent's so
 * Franky's ramp turns on.
 */

const P1 = "(Green/Purple) Monkey.D.Luffy - Official Feature Deck";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" });

/** p2 acting, so p1 is the defender. */
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

const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

const fieldDon = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].activeDon.length +
  game.state.players[player].restedDon.length;

describe("OP03-072 Gum-Gum Jet Gatling", () => {
  covers("OP03-072", "[Counter]", "[Trigger]");

  it("trashes a hand card for +3000 in the battle", () => {
    const game = defending("op03-072-counter")
      .bareTable()
      .withHand("p1", [
        instance("gatling", "OP03-072"),
        instance("filler", "EB02-017"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", 2)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP03-072" });
    game.play({ type: "resolve-effect", optionId: "filler" });

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId).sort(),
    ).toEqual(["filler", "gatling"]);
  });

  it("is not offered with no other card in hand to trash", () => {
    const game = defending("op03-072-bare")
      .bareTable()
      .withHand("p1", [instance("gatling", "OP03-072")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", 2)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();

    expect(
      game
        .legalActions()
        .some((action) => action.type === "activate-counter-event"),
    ).toBe(false);
  });

  it("adds an active DON!! off Life", () => {
    const game = defending("op03-072-trigger")
      .bareTable()
      .withLife("p1", [instance("life-card", "OP03-072")])
      .withDonDeck("p1", 3)
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore + 1);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });
});

describe("the deck's DON!! return line", () => {
  covers("EB02-010", "[Activate: Main]");
  covers("EB02-035", "[Your Turn]");
  covers("EB02-037", "[On Play]");

  it("Leader −2, Sanji & Pudding refunds one, and Franky ramps from under", () => {
    const game = table("eb02-luffy-return-line")
      .bareTable()
      .withLeader("p1", "EB02-010")
      .withBoard("p1", [character("pair", "EB02-035")])
      .withHand("p1", [instance("franky", "EB02-037")])
      // Eight DON!! on p1's field against seven: Franky's "equal to or less"
      // is off until the Leader gives two back.
      .withDonDeck("p1", 2)
      .withDonDeck("p2", 3)
      .build();
    expect(fieldDon(game, "p1")).toBe(8);
    expect(fieldDon(game, "p2")).toBe(7);

    game.play({ type: "activate-main", cardNumber: "EB02-010" });
    applyOptional(game);
    settle(game);
    // Two back to the DON!! deck, one refunded active by Sanji & Pudding.
    expect(fieldDon(game, "p1")).toBe(7);

    game.play({ type: "play-card", cardNumber: "EB02-037" });
    applyOptional(game);
    settle(game);
    // Franky paid three and added one more, rested.
    expect(fieldDon(game, "p1")).toBe(8);
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });
});
