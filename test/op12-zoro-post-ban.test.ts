import { describe, expect, it } from "vitest";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The OP12-020 Green Zoro list built for the OP-17 field after the OP14-020
 * ban.
 *
 * Every other card it plays is driven by another deck's or set's tests: the
 * Leader, Tashigi, Hiyori and the ST-32 bodies by the Starter Deck 32 suites,
 * Law by the OP-17 meta lists, Arlong and the Events by their sets'. OP13-037
 * Zoro is the one identity no shipped deck played before this one, so its two
 * clauses are covered here.
 */

const LIST = "(Green) Roronoa Zoro - OP17 Post-Ban List";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

describe("the Green Zoro OP17 post-ban list", () => {
  it("is a legal 50 under the OP12-020 Leader, shelved under Community", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP12-020");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});

describe("OP13-037 Roronoa Zoro", () => {
  covers("OP13-037", "[On Play]");

  it("sets two DON!! active under the Straw Hat Crew OP12-020 Leader", () => {
    // Six active DON!!: the 4-cost play rests four, leaving two active.
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("op13-037-on-play")
      .atTurn(6, { active: "p1" })
      .bareTable()
      .withDonDeck("p1", 4)
      .withHand("p1", [instance("zoro", "OP13-037")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-037" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "zoro",
    ]);
    expect(game.state.players.p1.activeDon).toHaveLength(4);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("does nothing under a Leader that is neither {FILM} nor {Straw Hat Crew}", () => {
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("op13-037-on-play-gate")
      .atTurn(6, { active: "p1" })
      .withLeader("p1", "OP14-020")
      .bareTable()
      .withDonDeck("p1", 4)
      .withHand("p1", [instance("zoro", "OP13-037")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-037" });

    expect(game.state.players.p1.activeDon).toHaveLength(2);
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  covers("OP13-037", "[End of Your Turn]");

  it("sets itself active at the end of its controller's turn", () => {
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("op13-037-end-of-turn")
      .atTurn(6, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("zoro", "OP13-037", { rested: true })])
      .build();

    while (game.state.activePlayer === "p1") game.pass();

    expect(game.state.activePlayer).toBe("p2");
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "zoro")
        ?.rested,
    ).toBe(false);
  });
});
