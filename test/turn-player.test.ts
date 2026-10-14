import { describe, expect, it } from "vitest";
import { effectiveCost, observe } from "@one-piece-sim/engine-core";

import { character, instance, scenario } from "./support/index.js";

/**
 * Who owns the current turn, as every turn-scoped rule has to ask it.
 *
 * `state.activePlayer` answers "who acts next", not "whose turn is it": the
 * Block and Counter steps hand it to the defender, and a pending effect hands
 * it to whoever must resolve it. The engine used to reconstruct the turn owner
 * as `activeAttack?.attackerPlayerId ?? activePlayer`, which is right for as
 * long as a battle is open and wrong the moment one closes with the defender
 * still holding a decision -- an [On K.O.] reaction being the everyday case.
 */
const table = (seed: string) =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/**
 * p1 attacks into a Van Augur whose [On K.O.] hands p2 a choice. The attack is
 * over by the time that choice is offered, so nothing but a stored turn owner
 * can still say the turn is p1's.
 */
const afterOnKoHandsTheTurnOver = (seed: string) =>
  table(seed)
    .withLeader("p2", "OP16-080")
    .withBoard("p2", [
      character("augur", "OP16-103", { rested: true }),
      character("body", "ST32-004"),
    ])
    .withBoard("p1", [
      character("attacker", "ST32-002"),
      character("chopper", "P-101", { playedTurn: 9 }),
    ])
    .withGivenDon("p1", "chopper", 2)
    .withDeckTop("p2", [instance("p2-draw", "ST32-005")])
    .build();

describe("the turn owner outlives the battle that hid it", () => {
  it("keeps the attacker's DON!! bonus visible while the defender resolves an [On K.O.]", () => {
    const game = afterOnKoHandsTheTurnOver("turn-player-on-ko-power");

    // Mid-battle the open attack names the turn owner, so the 2 given DON!!
    // count and Chopper reads 7000.
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "augur",
    });
    const midBattle = observe(game.state, "p2");
    expect(
      midBattle.opponent.board.find((card) => card.instanceId === "chopper")
        ?.currentPower,
    ).toBe(7000);

    // Resolve the battle. Van Augur dies and its [On K.O.] hands p2 a decision
    // with no attack left to read the turn owner off.
    game.pass();
    game.pass();

    expect(game.state.pendingEffect?.playerId).toBe("p2");
    const afterBattle = observe(game.state, "p2");
    expect(afterBattle.turnPlayer).toBe("p1");
    // The same Chopper, the same 2 given DON!!, one action later.
    expect(
      afterBattle.opponent.board.find((card) => card.instanceId === "chopper")
        ?.currentPower,
    ).toBe(7000);
  });

  it("keeps an [Opponent's Turn] static layer switched on across the same window", () => {
    const game = afterOnKoHandsTheTurnOver("turn-player-on-ko-static");

    // OP16-080's aura raises its own Characters' cost by 1 during the
    // opponent's turn, so a 4-cost body reads 5 for as long as the turn is p1's.
    const body = () =>
      game.state.players.p2.board.find((card) => card.instanceId === "body")!;
    expect(effectiveCost(game.state, "p2", body())).toBe(5);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "augur",
    });
    game.pass();
    game.pass();

    expect(game.state.pendingEffect?.playerId).toBe("p2");
    expect(effectiveCost(game.state, "p2", body())).toBe(5);
  });
});
