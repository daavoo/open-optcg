import { describe, expect, it } from "vitest";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";
import { hasKeyword } from "@one-piece-sim/engine-core";
import { character, covers, scenario } from "./support/index.js";

/**
 * The OP-08 Purple/Yellow Charlotte Pudding Open OPTCG list.
 *
 * `op08.test.ts`, `st34.test.ts` and the OP-17 Linlin and Robin decks' tests
 * drive every card the list shares with them. OP11-067 Charlotte Katakuri is
 * the one identity with a clause no other shipped deck plays, so its two are
 * driven here.
 */

const LIST = "(Purple/Yellow) Charlotte Pudding - Open OPTCG";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

describe("the Charlotte Pudding Open OPTCG list", () => {
  it("is a legal 50 under the OP08-058 Leader, shelved under Tournaments", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP08-058");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});

describe("OP11-067 Charlotte Katakuri", () => {
  covers("OP11-067", "[End of Your Turn]");
  it("sets two rested {Big Mom Pirates} of cost 3 or more active, then adds a rested DON!!", () => {
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("op11-067-end-of-turn")
      .atTurn(6, { active: "p1" })
      .bareTable()
      .withDonDeck("p1", 5)
      .withBoard("p1", [
        character("katakuri", "OP11-067"),
        character("cracker", "ST34-002", { rested: true }),
        character("smoothie", "OP17-104", { rested: true }),
        character("daifuku", "OP17-107", { rested: true }),
        character("small", "OP08-062", { rested: true }),
      ])
      .build();

    game.pass();
    // The 2-cost OP08-062 is below the cost floor and is never offered.
    expect(
      game
        .legalActions()
        .map((action) =>
          action.type === "resolve-effect" ? action.optionId : action.type,
        ),
    ).toEqual(["cracker", "smoothie", "daifuku", "done"]);
    game.play({ type: "resolve-effect", optionId: "cracker" });
    game.play({ type: "resolve-effect", optionId: "smoothie" });
    while (game.state.activePlayer === "p1") game.pass();

    const rested = Object.fromEntries(
      game.state.players.p1.board.map((card) => [card.instanceId, card.rested]),
    );
    expect(rested).toEqual({
      katakuri: false,
      cracker: false,
      smoothie: false,
      daifuku: true,
      small: true,
    });
    expect(game.state.players.p1.activeDon).toHaveLength(5);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.donDeck).toHaveLength(4);
  });

  covers("OP11-067", "[Blocker]");
  it("blocks a declared attack and rests doing it", () => {
    const game = scenario()
      .decks(OPPONENT, LIST)
      .seed("op11-067-blocker")
      .atTurn(6, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withBoard("p2", [character("katakuri", "OP11-067")])
      .build();

    expect(hasKeyword(game.state, "p2", "katakuri", "Blocker")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "katakuri" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("katakuri");
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });
});
