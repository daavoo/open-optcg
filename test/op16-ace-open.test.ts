import { describe, expect, it } from "vitest";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";
import { currentPower } from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The OP-16 Red Portgas.D.Ace Open OPTCG list.
 *
 * The feature deck's tests and the OP-17 Newgate deck's drive every card the
 * lists share. OP10-005 Sanji is the one identity no other shipped deck
 * plays, so its two clauses are driven here.
 */

const LIST = "(Red) Portgas.D.Ace - Open OPTCG";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

describe("the Red Ace Open OPTCG list", () => {
  it("is a legal 50 under the OP16-001 Leader, shelved under Tournaments", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP16-001");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});

describe("OP10-005 Sanji", () => {
  covers("OP10-005", "[Your Turn]");
  it("is a 6000 on its controller's turn and a 3000 on the opponent's", () => {
    const own = scenario()
      .decks(LIST, OPPONENT)
      .seed("op10-005-own-turn")
      .atTurn(6, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("sanji", "OP10-005")])
      .build();
    expect(currentPower(own.state, "p1", "sanji")).toBe(6000);

    const theirs = scenario()
      .decks(LIST, OPPONENT)
      .seed("op10-005-their-turn")
      .atTurn(6, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("sanji", "OP10-005")])
      .build();
    expect(currentPower(theirs.state, "p1", "sanji")).toBe(3000);
  });

  covers("OP10-005", "[On K.O.]");
  it("draws a card when it is K.O.'d in battle", () => {
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("op10-005-on-ko")
      .atTurn(6, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("sanji", "OP10-005", { rested: true })])
      .withDeckTop("p1", [instance("drawn", "OP17-006")])
      .withBoard("p2", [character("attacker", "OP16-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "sanji",
    });
    // No Blocker and no Counter in hand: the battle resolves as it stands.
    while (game.state.activePlayer === "p1") game.pass();

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
  });
});
