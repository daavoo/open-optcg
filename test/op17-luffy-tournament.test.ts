import { describe, expect, it } from "vitest";
import { effectiveCost, hasKeyword } from "@one-piece-sim/engine-core";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The OP-17 Black Monkey.D.Luffy tournament list.
 *
 * The feature deck drives every card the two lists share, `test/st14.test.ts`
 * drives ST14-017 Thousand Sunny and `test/op15.test.ts` OP15-092 on their
 * own. What this file holds is the interaction the list is built around: the
 * Stage's +1 cost is what lifts OP15-088 Pirates Docking Six from 11 to 12,
 * and 12 is the line the OP17-079 Leader's [Blocker] aura reads.
 */

const LIST = "(Black) Monkey.D.Luffy - Open OPTCG";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

const table = (seed: string) =>
  scenario()
    .decks(LIST, OPPONENT)
    .seed(seed)
    .atTurn(6, { active: "p1" })
    .bareTable()
    .withBoard("p1", [character("docking", "OP15-088")]);

describe("the OP17 tournament list", () => {
  it("is a legal 50 under the OP17-079 Leader, shelved under Tournaments", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP17-079");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});

describe("ST14-017 Thousand Sunny with OP15-088 Pirates Docking Six", () => {
  covers("ST14-017", "static");
  covers("OP15-088", "static");

  it("leaves Docking Six at 11 and without [Blocker] with no Stage out", () => {
    const game = table("op17-luffy-tournament-no-sunny").build();
    const docking = game.state.players.p1.board[0]!;

    expect(effectiveCost(game.state, "p1", docking)).toBe(11);
    expect(hasKeyword(game.state, "p1", "docking", "Blocker")).toBe(false);
  });

  it("lifts Docking Six to 12, a [Blocker] under the Leader's aura", () => {
    const game = table("op17-luffy-tournament-sunny")
      .withStage("p1", instance("sunny", "ST14-017"))
      .build();
    const docking = game.state.players.p1.board[0]!;

    expect(effectiveCost(game.state, "p1", docking)).toBe(12);
    expect(hasKeyword(game.state, "p1", "docking", "Blocker")).toBe(true);
  });
});
