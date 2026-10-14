import { describe, expect, it } from "vitest";
import { effectiveCost, hasKeyword } from "@one-piece-sim/engine-core";
import { requireKnownCard } from "@one-piece-sim/cards";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * Bandai's OP-17 Q&A rulings on where a card's own printed text stops and
 * another card's begins (issue #405):
 *
 *  - "This Character gains +N cost" is read only on the field; in hand, trash
 *    or deck the card is its printed cost.
 *  - OP17-118's "only have Characters without a Counter" needs at least one
 *    Character.
 *  - Negation strips a Character's own text, not the [Blocker] the OP17-079
 *    Leader gives it.
 */

const ELBAPH = "(Black) Monkey.D.Luffy - Official Feature Deck";
const XEBEC = "(Blue) Rocks.D.Xebec - Official Feature Deck";
const RED = "(Red) Monkey.D.Luffy - Starter Deck 31";

const elbaphTable = (seed: string) =>
  scenario()
    .decks(ELBAPH, RED)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

describe("OP17 Elbaph +12 cost: on the field only", () => {
  covers("OP17-081", "static");
  covers("OP17-085", "static");
  covers("OP17-089", "static");
  covers("OP17-092", "static");
  covers("OP17-094", "static");
  covers("OP17-119", "static");

  it.each([
    "OP17-081",
    "OP17-085",
    "OP17-089",
    "OP17-092",
    "OP17-094",
    "OP17-119",
  ])(
    "%s reads its printed cost in hand, trash and deck, and +12 on the field",
    (cardNumber) => {
      const printed = requireKnownCard(cardNumber).cost ?? 0;
      const game = elbaphTable(`op17-zones-${cardNumber}`)
        .withHand("p1", [instance("in-hand", cardNumber)])
        .withTrash("p1", [instance("in-trash", cardNumber)])
        .withDeckTop("p1", [instance("in-deck", cardNumber)])
        .withBoard("p1", [character("on-field", cardNumber)])
        .build();
      const p1 = game.state.players.p1;

      expect(effectiveCost(game.state, "p1", p1.hand[0]!)).toBe(printed);
      expect(effectiveCost(game.state, "p1", p1.trash[0]!)).toBe(printed);
      expect(effectiveCost(game.state, "p1", p1.deck[0]!)).toBe(printed);
      expect(effectiveCost(game.state, "p1", p1.board[0]!)).toBe(printed + 12);
    },
  );

  it("OP17-081 Gerd recovers a +12 giant from the trash as a cost-8-or-less Character", () => {
    const game = elbaphTable("op17-081-giant-from-trash")
      .withHand("p1", [
        instance("gerd", "OP17-081"),
        instance("spare", "ST31-002"),
      ])
      .withTrash("p1", [instance("brogy", "OP17-092")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-081" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "spare" });
    game.play({ type: "resolve-effect", optionId: "brogy" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "brogy",
    ]);
  });
});

describe("OP15 +N cost Characters: on the field only", () => {
  covers("OP15-088", "static");
  covers("OP15-092", "static");

  it("OP15-088 is its printed cost in the trash and +6 on the field", () => {
    const game = elbaphTable("op15-088-zones")
      .withTrash("p1", [instance("in-trash", "OP15-088")])
      .withBoard("p1", [character("on-field", "OP15-088")])
      .build();
    const printed = requireKnownCard("OP15-088").cost ?? 0;
    const p1 = game.state.players.p1;

    expect(effectiveCost(game.state, "p1", p1.trash[0]!)).toBe(printed);
    expect(effectiveCost(game.state, "p1", p1.board[0]!)).toBe(printed + 6);
  });

  it("OP15-092 takes its +10 cost at 10 trash only on the field", () => {
    const game = elbaphTable("op15-092-zones")
      .withHand("p1", [instance("in-hand", "OP15-092")])
      .withTrash("p1", copies(10, "ST31-002", "milled"))
      .withBoard("p1", [character("on-field", "OP15-092")])
      .build();
    const printed = requireKnownCard("OP15-092").cost ?? 0;
    const p1 = game.state.players.p1;

    expect(effectiveCost(game.state, "p1", p1.hand[0]!)).toBe(printed);
    expect(effectiveCost(game.state, "p1", p1.board[0]!)).toBe(printed + 10);
  });
});

describe("OP17-118 Rocks.D.Xebec hand Counter with no Characters", () => {
  covers("OP17-118", "static");

  it("is not a Counter card while its controller has no Characters at all", () => {
    const game = scenario()
      .decks(XEBEC, RED)
      .seed("op17-118-empty-board")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("xebec", "OP17-118")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect(
      game.legalActions("p1").filter((action) => action.type === "counter"),
    ).toEqual([]);
  });
});

describe("OP17-079 Monkey.D.Luffy (Leader) [Blocker] on a negated Character", () => {
  covers("OP17-079", "static");

  it("still gives [Blocker] to a negated Character whose cost is 12 or more", () => {
    // OP13-082 Five Elders is a printed 10 with no [Blocker]; OP10-093 Saint
    // Homing's +3 cost is another card's effect and lasts through the
    // opponent's turn, so the body is still a 13 once OP09-098 Black Hole has
    // negated its own text there.
    const game = elbaphTable("op17-079-negated-blocker")
      .withBoard("p1", [
        character("elders", "OP13-082"),
        character("homing", "OP10-093"),
      ])
      .withLeader("p2", "OP09-081")
      .withHand("p2", [instance("black-hole", "OP09-098")])
      .withDeckTop("p2", copies(2, "ST31-002", "p2-draw"))
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({ summary: "Saint Homing" });
    game.play({ type: "resolve-effect", optionId: "elders" });
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(13);
    expect(hasKeyword(game.state, "p1", "elders", "Blocker")).toBe(true);

    game.pass();
    game.play({ summary: "[OP09-098]" });
    game.play({ type: "resolve-effect", optionId: "elders" });

    // Cost 13 is out of Black Hole's K.O. reach, so the body stays, negated.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "elders",
    ]);
    expect(hasKeyword(game.state, "p1", "elders", "Blocker")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "elders" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("elders");
  });
});
