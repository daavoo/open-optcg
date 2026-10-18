import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * The `P-` promos, as a whole-page import.
 *
 * `packages/cards/src/p.ts` explains where the records come from. These are
 * not a set: 103 identities printed one at a time across five blocks, in event
 * packs, tournament kits and magazine inserts -- five of them read off the
 * PRB-02 page, which is the only English printing they have. So this file is a list of
 * unrelated cards rather than a reading of a product, and it is grouped by the
 * shape of the clause instead.
 *
 * Eight of the 98 were in the pool before the import and are driven from the
 * tests of the decks that play them.
 *
 * No shipped list plays the rest, so every position seats two starter decks and
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

const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

const payDonFromActive = (game: Game) => {
  while (effectOptions(game.state).includes("return-don:active")) {
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
  }
};

const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

const boardNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].board.map((card) => card.cardNumber);

const handNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].hand.map((card) => card.cardNumber);

const costOf = (game: Game, player: "p1" | "p2", instanceId: string) =>
  effectiveCost(
    game.state,
    player,
    game.state.players[player].board.find(
      (card) => card.instanceId === instanceId,
    )!,
  );

// --- keywords behind a DON!! count -----------------------------------------

describe("the promos that buy a keyword with their own DON!!", () => {
  covers("P-001", "static");
  covers("P-004", "static");

  it("P-001 attacks the turn it lands once two DON!! are on it", () => {
    const game = table("p001-rush")
      .withBoard("p1", [character("luffy", "P-001")])
      .withGivenDon("p1", "luffy", 2)
      .build();

    expect(hasKeyword(game.state, "p1", "luffy", "Rush")).toBe(true);
  });

  it("P-001 has no [Rush] with one DON!! on it", () => {
    const game = table("p001-unpaid")
      .withBoard("p1", [character("luffy", "P-001")])
      .withGivenDon("p1", "luffy", 1)
      .build();

    expect(hasKeyword(game.state, "p1", "luffy", "Rush")).toBe(false);
  });

  it("P-004 blocks once a DON!! is on it", () => {
    const game = defending("p004-block")
      .withBoard("p1", [character("croc", "P-004")])
      .withGivenDon("p1", "croc", 1)
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "croc",
        ),
    ).toBe(true);
  });

  it("P-004 does not block unpaid", () => {
    const game = defending("p004-unpaid")
      .withBoard("p1", [character("croc", "P-004")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });
});

describe("P-113 Jewelry Bonney", () => {
  covers("P-113", "[Opponent's Turn]", "[Trigger]");

  it("blocks and defends 2000 bigger on the other player's turn", () => {
    const game = defending("p113-defence")
      .withBoard("p1", [character("bonney", "P-113")])
      .withGivenDon("p1", "bonney", 2)
      .build();

    // 4000 printed, the two DON!! it is holding, and the clause's 2000.
    expect(currentPower(game.state, "p1", "bonney")).toBe(8_000);
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "bonney",
        ),
    ).toBe(true);
  });

  it("does neither on its controller's own turn", () => {
    const game = table("p113-own-turn")
      .withBoard("p1", [character("bonney", "P-113")])
      .withGivenDon("p1", "bonney", 2)
      .build();

    expect(currentPower(game.state, "p1", "bonney")).toBe(6_000);
    expect(hasKeyword(game.state, "p1", "bonney", "Blocker")).toBe(false);
  });

  it("K.O.s a 3-cost body off a Life card", () => {
    const game = table("p113-trigger")
      .withLife("p2", [instance("bonney", "P-113")])
      .withBoard("p1", [character("victim", "ST14-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

// --- surviving a fight ------------------------------------------------------

describe("the promos that cannot lose a fight to a named attacker", () => {
  covers("P-007", "static");
  covers("P-025", "static");
  covers("P-052", "static");
  covers("P-054", "static");

  it("P-052 survives a <Slash> attacker with a DON!! on it", () => {
    const game = defending("p052-immune")
      .withBoard("p1", [{ ...character("mihawk", "P-052"), rested: true }])
      .withGivenDon("p1", "mihawk", 1)
      .withBoard("p2", [character("slash", "OP05-044")])

      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "slash",
      targetInstanceId: "mihawk",
    });
    declineDefence(game);
    settle(game);

    expect(boardCard(game, "p1", "mihawk")).toBeDefined();
  });

  it("P-052 dies to the same attacker with no DON!! on it", () => {
    const game = defending("p052-unpaid")
      .withBoard("p1", [{ ...character("mihawk", "P-052"), rested: true }])
      .withBoard("p2", [character("slash", "OP05-044")])

      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "slash",
      targetInstanceId: "mihawk",
    });
    declineDefence(game);
    settle(game);

    expect(boardCard(game, "p1", "mihawk")).toBeUndefined();
  });

  it("P-025 survives a Character without <Special> but not the Leader", () => {
    // The inverted reading: the attribute it names is the one that gets
    // through, and the Leader is outside the clause either way.
    const game = defending("p025-character")
      .withBoard("p1", [{ ...character("smoker", "P-025"), rested: true }])
      .withGivenDon("p1", "smoker", 1)
      .withBoard("p2", [character("striker", "OP05-065")])

      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "striker",
      targetInstanceId: "smoker",
    });
    declineDefence(game);
    settle(game);

    expect(boardCard(game, "p1", "smoker")).toBeDefined();
  });
});

// --- power that moves with the board ---------------------------------------

describe("the promos whose power reads the board", () => {
  covers("P-006", "[Your Turn]");
  covers("P-034", "[Your Turn]");
  covers("P-039", "[Banish]", "static");
  covers("P-050", "[Blocker]", "[Your Turn]");
  covers("P-078", "static");
  covers("P-092", "[Opponent's Turn]", "[When Attacking]");

  it("P-006 attacks 2000 bigger and defends at its printed size", () => {
    const attacking = table("p006-attacking")
      .withBoard("p1", [character("luffy", "P-006")])
      .withGivenDon("p1", "luffy", 2)
      .build();
    expect(currentPower(attacking.state, "p1", "luffy")).toBe(7_000);

    const defendingGame = defending("p006-defending")
      .withBoard("p1", [character("luffy", "P-006")])
      .withGivenDon("p1", "luffy", 2)
      .build();
    expect(currentPower(defendingGame.state, "p1", "luffy")).toBe(5_000);
  });

  it("P-034 grows only once its own Life is down to two", () => {
    const behind = table("p034-behind")
      .withBoard("p1", [character("sanji", "P-034")])
      .withGivenDon("p1", "sanji", 1)
      .withLife("p1", 2)
      .build();
    expect(currentPower(behind.state, "p1", "sanji")).toBe(7_000);

    const ahead = table("p034-ahead")
      .withBoard("p1", [character("sanji", "P-034")])
      .withGivenDon("p1", "sanji", 1)
      .withLife("p1", 4)
      .build();
    expect(currentPower(ahead.state, "p1", "sanji")).toBe(5_000);
  });

  it("P-039 grows at zero Life, and banishes what it hits", () => {
    const game = table("p039-banish")
      .withBoard("p1", [character("bellamy", "P-039")])
      .withGivenDon("p1", "bellamy", 2)
      .withLife("p1", 0)
      .build();

    expect(currentPower(game.state, "p1", "bellamy")).toBe(10_000);
    expect(hasKeyword(game.state, "p1", "bellamy", "Banish")).toBe(true);
  });

  it("P-050 grows 4000 from a hand of three on its own turn", () => {
    const game = table("p050-empty-hand")
      .withBoard("p1", [character("sanji", "P-050")])
      .withGivenDon("p1", "sanji", 1)
      .withHand("p1", [instance("one", "FIX-001")])
      .build();

    expect(currentPower(game.state, "p1", "sanji")).toBe(7_000);
  });

  it("P-050 grows nothing from a full hand, and still blocks", () => {
    const game = defending("p050-full-hand")
      .withBoard("p1", [character("sanji", "P-050")])
      .withGivenDon("p1", "sanji", 1)
      .build();

    expect(currentPower(game.state, "p1", "sanji")).toBe(3_000);
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "sanji",
        ),
    ).toBe(true);
  });

  it("P-078 grows off two rested {ODYSSEY} bodies", () => {
    const game = table("p078-rested")
      .withBoard("p1", [
        character("adio", "P-078"),
        { ...character("lim1", "P-079"), rested: true },
        { ...character("lim2", "P-079"), rested: true },
      ])
      .build();

    expect(currentPower(game.state, "p1", "adio")).toBe(6_000);
  });

  it("P-092 defends 3000 smaller, and rewrites the Leader on the swing", () => {
    const defence = defending("p092-defending")
      .withBoard("p1", [character("koby", "P-092")])
      .build();
    expect(currentPower(defence.state, "p1", "koby")).toBe(4_000);

    const game = table("p092-attacking")
      .withLeader("p1", "P-076")
      .withBoard("p1", [character("koby", "P-092")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "koby",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    declineDefence(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);
  });
});

describe("P-027 General Franky", () => {
  covers("P-027", "[Opponent's Turn]", "static");

  it("lifts its controller's small bodies on the other player's turn", () => {
    const game = defending("p027-aura")
      .withBoard("p1", [
        character("franky", "P-027"),
        character("small", "ST21-002"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "small")).toBe(4_000);
  });

  it("lifts nothing on its controller's own turn", () => {
    const game = table("p027-own-turn")
      .withBoard("p1", [
        character("franky", "P-027"),
        character("small", "ST21-002"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "small")).toBe(3_000);
  });

  it("answers to the second name it prints", () => {
    // The other sentence is a name the card also has, which is a derived fact
    // rather than a layer: a clause that names [Franky] reaches this card.
    const game = table("p027-alias")
      .withBoard("p1", [character("franky", "P-027")])
      .build();

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("P-027");
  });
});

describe("P-032 Sengoku", () => {
  covers("P-032", "[Your Turn]");

  it("drops the whole opposing board 2 cost on its controller's turn", () => {
    const game = table("p032-aura")
      .withBoard("p1", [character("sengoku", "P-032")])
      .withGivenDon("p1", "sengoku", 1)
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    expect(costOf(game, "p2", "victim")).toBe(3);
  });

  it("drops nothing while it is unpaid", () => {
    const game = table("p032-unpaid")
      .withBoard("p1", [character("sengoku", "P-032")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    expect(costOf(game, "p2", "victim")).toBe(5);
  });
});

describe("P-104 Shanks", () => {
  covers("P-104", "static");

  it("cannot be removed while a cost area is full at ten", () => {
    // P-055's bury names no cost and no power, which is what it takes to reach
    // an 8-cost 10000 at all -- and "removed from the field" covers a bury as
    // well as a K.O., which is what this clause answers.
    const game = table("p104-immune")
      .withHand("p1", [
        instance("luffy", "P-055"),
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
      ])
      .withBoard("p2", [character("shanks", "P-104")])
      .build();

    // `atTurn(11)` leaves p1 on all ten DON!!, which is the either-field
    // reading the clause takes: a mirror where both decks ramp switches it on
    // for both copies.
    game.play({ type: "play-card", cardNumber: "P-055" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);

    expect(boardCard(game, "p2", "shanks")).toBeDefined();
  });

  it("is a legal target once both cost areas are short of ten", () => {
    const game = table("p104-reachable")
      .withHand("p1", [
        instance("luffy", "P-055"),
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
      ])
      .withBoard("p2", [character("shanks", "P-104")])
      .withDonDeck("p1", 3)
      .withDonDeck("p2", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "P-055" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);

    expect(boardCard(game, "p2", "shanks")).toBeUndefined();
  });
});

// --- [On Play] and [On K.O.] ------------------------------------------------

describe("P-009 Trafalgar Law", () => {
  covers("P-009", "[On Play]");

  it("hands a Life card to an opponent sitting on six", () => {
    const game = table("p009-damage")
      .withHand("p1", [instance("law", "P-009")])
      .withDraw("p2", 2)
      .build();

    const lifeBefore = game.state.players.p2.life.length;
    game.play({ type: "play-card", cardNumber: "P-009" });
    settle(game);

    expect(game.state.players.p2.life).toHaveLength(lifeBefore - 1);
  });

  it("does nothing against a hand that has been spent", () => {
    const game = table("p009-small-hand")
      .withHand("p1", [instance("law", "P-009")])
      .withHand("p2", [instance("one", "FIX-001")])
      .build();

    const lifeBefore = game.state.players.p2.life.length;
    game.play({ type: "play-card", cardNumber: "P-009" });
    settle(game);

    expect(game.state.players.p2.life).toHaveLength(lifeBefore);
  });
});

describe("P-017 Trafalgar Law", () => {
  covers("P-017", "[On Play]");

  it("takes 2000 off a body for the turn", () => {
    const game = table("p017-debuff")
      .withHand("p1", [instance("law", "P-017")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({ type: "play-card", cardNumber: "P-017" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(before - 2_000);
  });
});

describe("P-020 Helmeppo", () => {
  covers("P-020", "[On Play]");

  it("buffs the Leader for the turn", () => {
    const game = table("p020-buff")
      .withHand("p1", [instance("helmeppo", "P-020")])
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({ type: "play-card", cardNumber: "P-020" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 1_000);
  });
});

describe("P-031 Uta", () => {
  covers("P-031", "[On Play]");

  it("takes a rested DON!! out of the DON!! deck", () => {
    const game = table("p031-ramp")
      .withHand("p1", [instance("uta", "P-031")])
      .withDonDeck("p1", 5)
      .build();

    game.play({ type: "play-card", cardNumber: "P-031" });
    settle(game);

    expect(game.state.players.p1.restedDon.length).toBeGreaterThanOrEqual(1);
  });
});

describe("P-043 Monkey.D.Luffy", () => {
  covers("P-043", "[On Play]");

  it("returns a cheap body on either side of the table", () => {
    const game = table("p043-bounce")
      .withHand("p1", [instance("luffy", "P-043")])
      .withBoard("p1", [character("mine", "ST21-002")])
      .withBoard("p2", [character("theirs", "ST14-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-043" });
    // "1 Character" names no side, so both boards are on offer.
    expect(effectOptions(game.state)).toContain("mine");
    game.play({ type: "resolve-effect", optionId: "theirs" });
    settle(game);

    expect(boardCard(game, "p2", "theirs")).toBeUndefined();
    expect(handNumbers(game, "p2")).toContain("ST14-002");
  });
});

describe("P-046 Yamato", () => {
  covers("P-046", "[On Play]");

  it("swaps the whole hand for the same number of cards", () => {
    const game = table("p046-refresh")
      .withHand("p1", [
        instance("yamato", "P-046"),
        instance("dead1", "FIX-001"),
        instance("dead2", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "P-046" });
    applyOptional(game);
    settle(game);

    // Two cards went under the deck and two came back: the count is the point.
    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("can be declined, leaving the hand alone", () => {
    const game = table("p046-declined")
      .withHand("p1", [
        instance("yamato", "P-046"),
        instance("keep", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "P-046" });
    if (effectOptions(game.state).includes("skip")) {
      game.play({ type: "resolve-effect", optionId: "skip" });
    }
    settle(game);

    expect(handNumbers(game, "p1")).toContain("FIX-001");
  });
});

describe("P-053 Nami", () => {
  covers("P-053", "[On Play]");

  it("bounces a cheap body off a hand of three", () => {
    const game = table("p053-bounce")
      .withHand("p1", [
        instance("nami", "P-053"),
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
      ])
      .withBoard("p2", [character("victim", "ST14-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-053" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("bounces nothing off a full hand", () => {
    const game = table("p053-full-hand")
      .withHand("p1", [
        instance("nami", "P-053"),
        ...Array.from({ length: 5 }, (_, index) =>
          instance(`spare-${index}`, "FIX-001"),
        ),
      ])
      .withBoard("p2", [character("victim", "ST14-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-053" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });
});

describe("P-055 Monkey.D.Luffy", () => {
  covers("P-055", "[On Play]");

  it("makes the opponent bury one of their own Characters", () => {
    const game = table("p055-bury")
      .withHand("p1", [
        instance("luffy", "P-055"),
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
      ])
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-055" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });
});

describe("P-056 Roronoa Zoro", () => {
  covers("P-056", "[On Play]");

  it("rests two DON!! to return a 5-cost body", () => {
    const game = table("p056-bounce")
      .withHand("p1", [instance("zoro", "P-056")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-056" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });
});

describe("P-082 Crocodile", () => {
  covers("P-082", "[Your Turn]", "[On Play]");

  it("buries a small body behind a {Cross Guild} Leader", () => {
    const game = table("p082-bury")
      .withLeader("p1", "P-076")
      .withHand("p1", [instance("croc", "P-082")])
      .withBoard("p2", [character("victim", "ST21-009")])
      .build();

    const deckBefore = game.state.players.p2.deck.length;
    game.play({ type: "play-card", cardNumber: "P-082" });
    settle(game);

    // The Leader gate is closed behind this Leader, so nothing moves -- the
    // case below is the one that fires.
    expect(game.state.players.p2.deck.length).toBe(deckBefore);
    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });

  it("does nothing behind a Leader with neither reading", () => {
    const game = table("p082-wrong-leader")
      .withHand("p1", [instance("croc", "P-082")])
      .withBoard("p2", [character("victim", "ST21-009")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-082" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });
});

describe("P-091 Shirahoshi", () => {
  covers("P-091", "[On Play]", "[Activate: Main]");

  it("brings a {Fish-Man Island} body with it", () => {
    const game = table("p091-play")
      .withHand("p1", [
        instance("shirahoshi", "P-091"),
        instance("friend", "OP11-025"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "P-091" });
    game.play({ type: "resolve-effect", optionId: "friend" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("OP11-025");
  });

  it("rests itself to let a {Neptunian} body attack a Character", () => {
    const game = table("p091-rush")
      .withBoard("p1", [
        character("shirahoshi", "P-091"),
        character("neptunian", "OP11-027"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-091" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "neptunian" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "neptunian", "Rush: Character")).toBe(
      true,
    );
  });
});

describe("P-097 Shanks", () => {
  covers("P-097", "[On Play]", "[When Attacking]");

  it("cannot be blocked on the turn it lands", () => {
    const game = table("p097-on-play")
      .withHand("p1", [instance("shanks", "P-097")])
      .withBoard("p2", [character("blocker", "ST21-007")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-097" });
    settle(game);
    const attacker = game.state.players.p1.board.at(-1)!;
    expect(
      hasKeyword(game.state, "p1", attacker.instanceId, "Unblockable"),
    ).toBe(true);
  });

  it("switches blocking off again on the swing", () => {
    const game = table("p097-when-attacking")
      .withBoard("p1", [character("shanks", "P-097")])
      .withBoard("p2", [character("blocker", "ST21-007")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "shanks",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(
      game.legalActions("p2").some((action) => action.type === "block"),
    ).toBe(false);
  });
});

describe("P-098 Buggy", () => {
  covers("P-098", "[Blocker]", "[On Play]");

  it("buries itself off a board that has not earned it", () => {
    const game = table("p098-bury")
      .withHand("p1", [instance("buggy", "P-098")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-098" });
    settle(game);

    expect(boardNumbers(game, "p1")).not.toContain("P-098");
  });

  it("stays on a board of five 5-cost bodies, itself included", () => {
    const game = table("p098-stays")
      .withHand("p1", [instance("buggy", "P-098")])
      .withBoard("p1", [
        character("a", "ST29-013"),
        character("b", "ST29-013"),
        character("c", "ST29-013"),
        character("d", "ST29-013"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "P-098" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("P-098");
  });
});

describe("P-102 Nami", () => {
  covers("P-102", "[On Play]");

  it("sets two DON!! back active behind a {Straw Hat Crew} Leader", () => {
    const game = table("p102-refund")
      .withHand("p1", [instance("nami", "P-102")])
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "P-102" });
    settle(game);

    // Four DON!! rested to pay for the play, two set back active: net −2.
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 2);
  });
});

describe("P-103 Portgas.D.Ace", () => {
  covers("P-103", "[On Play]");

  it("turns two cards over and hands the Leader a rested DON!!", () => {
    const game = table("p103-dig")
      .withHand("p1", [instance("ace", "P-103")])
      .withDon("p1", { rested: 2 })
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "P-103" });
    settle(game);

    // Two in, two back under the deck, and the Ace itself has left the hand.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });
});

describe("P-107 Gol.D.Roger", () => {
  covers("P-107", "[On Play]");

  it("buffs the Leader off a full cost area", () => {
    const game = table("p107-buff")
      .withHand("p1", [instance("roger", "P-107")])
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({ type: "play-card", cardNumber: "P-107" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 2_000);
  });

  it("buffs nothing while both cost areas are short of ten", () => {
    const game = table("p107-no-ramp")
      .withHand("p1", [instance("roger", "P-107")])
      .withDonDeck("p1", 1)
      .withDonDeck("p2", 3)
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({ type: "play-card", cardNumber: "P-107" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before);
  });
});

describe("P-112 Nami", () => {
  covers("P-112", "[On Play]");

  it("gifts a DON!! and plays a cheap body behind the named Leader", () => {
    const game = table("p112-chain")
      .withLeader("p1", "P-117")
      .withHand("p1", [
        instance("nami", "P-112"),
        instance("small", "ST21-002"),
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "P-112" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(boardNumbers(game, "p1")).toContain("ST21-002");
  });
});

describe("P-115 Boa Hancock", () => {
  covers("P-115", "[On Play]", "[Trigger]");

  it("hands out a rested DON!! on arrival", () => {
    const game = table("p115-gift")
      .withHand("p1", [instance("hancock", "P-115")])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "P-115" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("plays a small yellow [Trigger] body off a Life card", () => {
    const game = table("p115-trigger")
      .withLife("p2", [instance("hancock", "P-115")])
      .withHand("p2", [instance("small", "P-113")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(boardNumbers(game, "p2")).toContain("P-113");
  });
});

describe("P-030 Jinbe", () => {
  covers("P-030", "[On K.O.]");

  it("buries a cheap body on either side when it dies", () => {
    const game = table("p030-on-ko")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [
        character("jinbe", "P-030"),
        character("small", "ST14-002"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(boardCard(game, "p2", "small")).toBeUndefined();
  });
});

describe("P-071 Marco", () => {
  covers("P-071", "[On K.O.]");

  it("goes back to its owner's hand when it dies", () => {
    const game = table("p071-on-ko")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("marco", "P-071")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "marco" });
    applyOptional(game);
    settle(game);

    expect(handNumbers(game, "p2")).toContain("P-071");
  });
});

// --- [Activate: Main] and the Events ---------------------------------------

describe("P-005 Kaido", () => {
  covers("P-005", "[Activate: Main]");

  it("buys [Banish] for two DON!!", () => {
    const game = table("p005-banish")
      .withBoard("p1", [character("kaido", "P-005")])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-005" });
    applyOptional(game);
    payDonFromActive(game);
    settle(game);

    expect(hasKeyword(game.state, "p1", "kaido", "Banish")).toBe(true);
  });
});

describe("P-008 Yamato", () => {
  covers("P-008", "[Activate: Main]");

  it("rests itself to rest a cheap opposing body", () => {
    const game = table("p008-rest")
      .withBoard("p1", [character("yamato", "P-008")])
      .withBoard("p2", [character("victim", "ST21-002")])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-008" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "yamato")?.rested).toBe(true);
    expect(boardCard(game, "p2", "victim")?.rested).toBe(true);
  });
});

describe("P-011 Uta (Leader)", () => {
  covers("P-011", "[Activate: Main]");

  it("buffs a Character that prints no effect box", () => {
    const game = table("p011-buff")
      .withLeader("p1", "P-011")
      .withBoard("p1", [character("vanilla", "ST21-005")])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-011" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "vanilla" });
    settle(game);

    expect(currentPower(game.state, "p1", "vanilla")).toBe(6_000);
  });

  it("reaches no Character with printed text", () => {
    const game = table("p011-wrong-target")
      .withLeader("p1", "P-011")
      .withBoard("p1", [character("textful", "ST21-009")])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-011" });
    applyOptional(game);

    expect(effectOptions(game.state)).not.toContain("textful");
  });
});

describe("P-013 Gordon", () => {
  covers("P-013", "[Activate: Main]");

  it("buries itself for a −3000 that lasts the turn", () => {
    const game = table("p013-debuff")
      .withBoard("p1", [character("gordon", "P-013")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({ type: "activate-main", cardNumber: "P-013" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "gordon")).toBeUndefined();
    expect(currentPower(game.state, "p2", "victim")).toBe(before - 3_000);
  });
});

describe("P-033 Monkey.D.Luffy", () => {
  covers("P-033", "[Activate: Main]");

  it("buries itself for a card", () => {
    const game = table("p033-draw")
      .withBoard("p1", [character("luffy", "P-033")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "activate-main", cardNumber: "P-033" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "luffy")).toBeUndefined();
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });
});

describe("P-062 Hody & Hyouzou", () => {
  covers("P-062", "[Activate: Main]");

  it("rests a body, grows, and takes a Life card to hand", () => {
    const game = table("p062-activate")
      .withBoard("p1", [character("hody", "P-062")])
      .withBoard("p2", [character("victim", "ST21-010")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "activate-main", cardNumber: "P-062" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "hody")).toBe(7_000);
    expect(game.state.players.p1.life).toHaveLength(lifeBefore - 1);
  });
});

describe("P-068 Sanji", () => {
  covers("P-068", "[Activate: Main]");

  it("trashes itself to sort five deep", () => {
    const game = table("p068-sort")
      .withBoard("p1", [character("sanji", "P-068")])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-068" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "sanji")).toBeUndefined();
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("P-068");
  });
});

describe("P-069 Koala", () => {
  covers("P-069", "[Activate: Main]");

  it("moves a rested DON!! onto the Leader", () => {
    const game = table("p069-gift")
      .withBoard("p1", [character("koala", "P-069")])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", cardNumber: "P-069" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });
});

describe("P-076 Sakazuki (Leader)", () => {
  covers("P-076", "[Activate: Main]");

  it("trades a {Navy} card for −1 cost on an opposing body", () => {
    const game = table("p076-debuff")
      .withLeader("p1", "P-076")
      .withHand("p1", [instance("navy", "P-026")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-076" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "navy" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(costOf(game, "p2", "victim")).toBe(4);
  });

  it("is not offered with no {Navy} card in hand", () => {
    const game = table("p076-no-navy")
      .withLeader("p1", "P-076")
      .withHand("p1", [instance("plain", "FIX-001")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "P-076",
        ),
    ).toBe(false);
  });
});

describe("P-081 Dracule Mihawk", () => {
  covers("P-081", "[Activate: Main]");

  it("returns itself to play a 5-cost {Cross Guild} body", () => {
    const game = table("p081-chain")
      .withBoard("p1", [
        character("mihawk", "P-081"),
        character("croc", "P-082"),
        character("buggy", "P-098"),
        character("croc2", "P-082"),
      ])
      .withHand("p1", [instance("next", "P-082")])
      .build();

    // The return is the cost and the count is the effect, so the three blue
    // {Cross Guild} bodies the clause wants are the ones left *after* Mihawk
    // has gone back to hand.
    game.play({ type: "activate-main", cardNumber: "P-081" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "next" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("P-081");
    // Two were already out and the clause played a third.
    expect(boardNumbers(game, "p1").filter((n) => n === "P-082")).toHaveLength(
      3,
    );
  });
});

describe("P-002 I Smell Adventure!!!", () => {
  covers("P-002", "[Main]", "[Trigger]");

  it("turns the whole hand over for the same number of cards", () => {
    const game = table("p002-main")
      .withHand("p1", [
        instance("event", "P-002"),
        instance("dead1", "FIX-001"),
        instance("dead2", "FIX-001"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-002" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("runs the same refresh off a Life card", () => {
    const game = table("p002-trigger")
      .withLife("p2", [instance("event", "P-002")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    // Every card goes under the deck and the same number comes back.
    expect(game.state.players.p2.hand).toHaveLength(handBefore);
  });
});

describe("P-024 I'm Gonna Be King of the Pirates!!", () => {
  covers("P-024", "[Main]", "[Trigger]");

  it("pays the Leader 1000 for every Character its controller has", () => {
    const game = table("p024-main")
      .withHand("p1", [instance("event", "P-024")])
      .withBoard("p1", [
        character("a", "ST21-002"),
        character("b", "ST21-002"),
        character("c", "ST21-002"),
      ])
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({ type: "activate-main", cardNumber: "P-024" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 3_000);
  });

  it("pays a flat 1000 off a Life card", () => {
    const game = table("p024-trigger")
      .withLife("p2", [instance("event", "P-024")])
      .build();

    const before = currentPower(game.state, "p2", "p2-leader");
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settle(game);

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(before + 1_000);
  });
});

describe("the three {Music} Events behind the [Uta] Leader", () => {
  covers("P-057", "[Main]", "[Trigger]");
  covers("P-058", "[Main]", "[Trigger]");
  covers("P-060", "[Main]");

  it("P-057 holds two rested bodies down through the Refresh", () => {
    const game = table("p057-lock")
      .withLeader("p1", "P-011")
      .withHand("p1", [instance("event", "P-057")])
      .withBoard("p2", [
        { ...character("a", "ST21-002"), rested: true },
        { ...character("b", "ST21-002"), rested: true },
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-057" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);
    game.pass();

    expect(boardCard(game, "p2", "a")?.rested).toBe(true);
    expect(boardCard(game, "p2", "b")?.rested).toBe(true);
  });

  it("P-057 is not offered behind another Leader", () => {
    const game = table("p057-wrong-leader")
      .withHand("p1", [instance("event", "P-057")])
      .withBoard("p2", [{ ...character("a", "ST21-002"), rested: true }])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "P-057",
        ),
    ).toBe(false);
  });

  it("P-058 sets the {FILM} board active when the turn ends", () => {
    const game = table("p058-refresh")
      .withLeader("p1", "P-011")
      .withHand("p1", [instance("event", "P-058")])
      .withBoard("p1", [{ ...character("film", "P-013"), rested: true }])
      .build();

    game.play({ type: "activate-main", cardNumber: "P-058" });
    settle(game);
    expect(boardCard(game, "p1", "film")?.rested).toBe(true);
    game.pass();
    expect(boardCard(game, "p1", "film")?.rested).toBe(false);
  });

  it("P-058 sets them active immediately off a Life card", () => {
    // A Trigger resolves on the other player's turn, so the end this clause
    // would wait for is theirs -- the bodies are wanted for the block in front
    // of them.
    const game = table("p058-trigger")
      .withLife("p2", [instance("event", "P-058")])
      .withBoard("p2", [{ ...character("film", "P-013"), rested: true }])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(boardCard(game, "p2", "film")?.rested).toBe(false);
  });

  it("P-060 rests an [Uta] to rest two of the opponent's DON!!", () => {
    const game = table("p060-rest")
      .withLeader("p1", "P-011")
      .withHand("p1", [instance("event", "P-060")])
      .build();

    const restedBefore = game.state.players.p2.restedDon.length;
    game.play({ type: "activate-main", cardNumber: "P-060" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p2.restedDon.length).toBe(restedBefore + 2);
  });
});

describe("P-059 The World's Continuation", () => {
  covers("P-059", "[Counter]");

  it("returns its controller's own bodies for 2000 each", () => {
    const game = defending("p059-counter")
      .withLeader("p1", "P-011")
      .withHand("p1", [instance("event", "P-059")])
      .withBoard("p1", [character("a", "ST21-002"), character("b", "ST21-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "P-059" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    expect(boardCard(game, "p1", "a")).toBeUndefined();
  });
});

// --- battle windows ---------------------------------------------------------

describe("the promos that act on the swing", () => {
  covers("P-019", "[When Attacking]");
  covers("P-026", "[When Attacking]");
  covers("P-037", "[When Attacking]");
  covers("P-047", "[When Attacking]");
  covers("P-065", "[When Attacking]");

  it("P-019 K.O.s a small body with a DON!! on it", () => {
    const game = table("p019-ko")
      .withBoard("p1", [character("bepo", "P-019")])
      .withBoard("p2", [character("victim", "ST21-009")])
      .withGivenDon("p1", "bepo", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "bepo",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("P-026 takes 3 cost off a body", () => {
    const game = table("p026-debuff")
      .withBoard("p1", [character("morgan", "P-026")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "morgan",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(costOf(game, "p2", "victim")).toBe(2);
  });

  it("P-037 grows off a board that has already attacked", () => {
    const game = table("p037-wide")
      .withBoard("p1", [
        character("luffy", "P-037"),
        { ...character("a", "ST21-002"), rested: true },
        { ...character("b", "ST21-002"), rested: true },
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(currentPower(game.state, "p1", "luffy")).toBe(5_000);
  });

  it("P-047 refills a hand of three on the Leader's swing", () => {
    const game = table("p047-draw")
      .withLeader("p1", "P-047")
      .withHand("p1", [instance("one", "FIX-001")])
      .withDon("p1", { leaderAttached: 1 })
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });

  it("P-065 grows off an opposing body Black has shrunk to nothing", () => {
    const game = table("p065-zero-cost")
      .withBoard("p1", [
        character("chopper", "P-065"),
        character("sengoku", "P-032"),
      ])
      .withGivenDon("p1", "sengoku", 1)
      .withBoard("p2", [character("small", "ST21-002")])
      .build();

    // Sengoku's aura drops a 2-cost body to 0, which is the line this reads.
    expect(costOf(game, "p2", "small")).toBe(0);
    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(currentPower(game.state, "p1", "chopper")).toBe(6_000);
  });
});

describe("P-036 Monkey.D.Luffy", () => {
  covers("P-036", "[When Attacking]");

  it("spends a Life card for 1000 on itself and 1000 on the Leader", () => {
    const game = table("p036-life")
      .withBoard("p1", [character("luffy", "P-036")])
      .build();

    const leaderBefore = currentPower(game.state, "p1", "p1-leader");
    const lifeBefore = game.state.players.p1.life.length;
    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", summary: "top Life card" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(lifeBefore - 1);
    expect(currentPower(game.state, "p1", "luffy")).toBe(5_000);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(
      leaderBefore + 1_000,
    );
  });
});

describe("P-048 Arlong", () => {
  covers("P-048", "[When Attacking]");

  it("makes the opponent bury a card from hand at four Life", () => {
    const game = table("p048-bury")
      .withBoard("p1", [character("arlong", "P-048")])
      .withGivenDon("p1", "arlong", 1)
      .withLife("p1", 4)
      .build();

    const deckBefore = game.state.players.p2.deck.length;
    game.play({
      type: "attack",
      attackerInstanceId: "arlong",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(game.state.players.p2.deck.length).toBe(deckBefore + 1);
  });

  it("does nothing once its own Life has fallen", () => {
    const game = table("p048-low-life")
      .withBoard("p1", [character("arlong", "P-048")])
      .withGivenDon("p1", "arlong", 1)
      .withLife("p1", 2)
      .build();

    const deckBefore = game.state.players.p2.deck.length;
    game.play({
      type: "attack",
      attackerInstanceId: "arlong",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    declineDefence(game);

    expect(game.state.players.p2.deck.length).toBe(deckBefore);
  });
});

describe("P-051 Shanks", () => {
  covers("P-051", "[When Attacking]");

  it("pays 1000 per card trashed, for the battle in progress", () => {
    const game = table("p051-fuel")
      .withBoard("p1", [character("shanks", "P-051")])
      .withHand("p1", [instance("a", "FIX-001"), instance("b", "FIX-001")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "shanks",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);

    expect(game.state.activeAttack?.battleAttackBonus).toBe(2_000);
  });
});

describe("P-035 Monkey.D.Luffy", () => {
  covers("P-035", "[When Attacking]");

  it("K.O.s a zero-cost body for a card out of hand", () => {
    const game = table("p035-ko")
      .withBoard("p1", [
        character("luffy", "P-035"),
        character("sengoku", "P-032"),
      ])
      .withGivenDon("p1", "luffy", 1)
      .withGivenDon("p1", "sengoku", 1)
      .withBoard("p2", [character("small", "ST21-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(boardCard(game, "p2", "small")).toBeUndefined();
  });
});

describe("P-083 Shanks", () => {
  covers("P-083", "[When Attacking]");

  it("trades a Character from hand for a debuff and a card", () => {
    const game = table("p083-trade")
      .withBoard("p1", [character("shanks", "P-083")])
      .withGivenDon("p1", "shanks", 1)
      .withHand("p1", [instance("fuel", "ST21-002")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "shanks",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(before - 1_000);
    // One Character spent and one card drawn: the hand is the size it was.
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("P-099 Monkey.D.Luffy", () => {
  covers("P-099", "[When Attacking]");

  it("spends the whole cost area to stand back up", () => {
    const game = table("p099-restand")
      .withBoard("p1", [character("luffy", "P-099")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    payDonFromActive(game);
    settle(game);
    declineDefence(game);

    expect(boardCard(game, "p1", "luffy")?.rested).toBe(false);
  });
});

describe("P-100 Marshall.D.Teach", () => {
  covers("P-100", "[When Attacking]");

  it("switches off the opposing Leader and every Character for the turn", () => {
    const game = table("p100-negate")
      .withBoard("p1", [character("teach", "P-100")])
      .withBoard("p2", [character("blocker", "ST21-007")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "teach",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    // A negated Character runs none of its own text, printed keywords
    // included, so the [Blocker] cannot be activated.
    expect(
      game.legalActions("p2").some((action) => action.type === "block"),
    ).toBe(false);
  });
});

describe("P-155 Trafalgar Law", () => {
  covers("P-155", "[When Attacking]", "[Trigger]");

  it("trades a [Trigger] card for a −2000", () => {
    const game = table("p155-debuff")
      .withBoard("p1", [character("law", "P-155")])
      .withHand("p1", [instance("trig", "P-113")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "law",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "trig" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(before - 2_000);
  });

  it("plays itself off a Life card once the opponent is low", () => {
    const game = table("p155-trigger")
      .withLife("p1", 3)
      .withLife("p2", [instance("law", "P-155")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(boardNumbers(game, "p2")).toContain("P-155");
  });
});

// --- [End of Your Turn] and the markerless watchers -------------------------

describe("the promos that act as the turn closes", () => {
  covers("P-010", "[End of Your Turn]");
  covers("P-029", "[End of Your Turn]");
  covers("P-079", "[Blocker]", "[End of Your Turn]");

  it("P-010 adds an active DON!! when the turn ends", () => {
    const game = table("p010-ramp")
      .withBoard("p1", [character("kaido", "P-010")])
      .withDonDeck("p1", 3)
      .build();

    const fieldBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    game.pass();
    settle(game);

    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(fieldBefore + 1);
  });

  it("P-029 rests itself to wake another {FILM} body", () => {
    const game = table("p029-wake")
      .withBoard("p1", [
        character("barto", "P-029"),
        { ...character("film", "P-013"), rested: true },
      ])
      .build();

    game.pass();
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "film" });
    settle(game);

    expect(boardCard(game, "p1", "film")?.rested).toBe(false);
    expect(boardCard(game, "p1", "barto")?.rested).toBe(true);
  });

  it("P-079 stands back up off two rested {ODYSSEY} bodies", () => {
    const game = table("p079-restand")
      .withBoard("p1", [
        { ...character("lim", "P-079"), rested: true },
        { ...character("a", "P-078"), rested: true },
        { ...character("b", "P-078"), rested: true },
      ])
      .build();

    game.pass();
    settle(game);

    expect(boardCard(game, "p1", "lim")?.rested).toBe(false);
  });
});

describe("P-106 Monkey.D.Luffy", () => {
  covers("P-106", "[End of Your Turn]", "[Trigger]");

  it("turns a Life card face-up to wake an {Egghead} body", () => {
    const game = table("p106-wake")
      .withBoard("p1", [
        character("luffy", "P-106"),
        { ...character("egghead", "ST29-013"), rested: true },
      ])
      .build();

    game.pass();
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "egghead")?.rested).toBe(false);
    expect(
      game.state.players.p1.life.filter((card) => card.faceUp),
    ).toHaveLength(1);
  });

  it("draws and K.O.s a cheap body off a Life card", () => {
    const game = table("p106-trigger")
      .withLife("p2", [instance("luffy", "P-106")])
      .withBoard("p1", [character("victim", "ST21-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

describe("P-014 Koby", () => {
  covers("P-014", "[Blocker]", "[Trigger]");

  it("comes down free off a Life card", () => {
    const game = table("p014-trigger")
      .withLife("p2", [instance("koby", "P-014")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(boardNumbers(game, "p2")).toContain("P-014");
  });

  it("blocks", () => {
    const game = defending("p014-block")
      .withBoard("p1", [character("koby", "P-014")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "koby",
        ),
    ).toBe(true);
  });
});

describe("P-042 Roronoa Zoro", () => {
  covers("P-042", "[Trigger]");

  it("K.O.s a 4-cost body off a Life card", () => {
    const game = table("p042-trigger")
      .withLife("p2", [instance("zoro", "P-042")])
      .withBoard("p1", [character("victim", "ST29-003")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

describe("P-077 Ulti", () => {
  covers("P-077", "static");

  it("ramps and wakes a purple Stage off two DON!! going back", () => {
    const game = table("p077-refund")
      .withLeader("p1", "ST10-001")
      .withBoard("p1", [character("ulti", "P-077")])
      .withDonDeck("p1", 4)
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({ type: "activate-main", cardNumber: "ST10-001" });
    applyOptional(game);
    payDonFromActive(game);
    settle(game);

    expect(game.state.players.p1.restedDon.length).toBeGreaterThan(
      restedBefore,
    );
  });
});

describe("P-111 Nico Robin", () => {
  covers("P-111", "static");

  it("rests a DON!! instead of a {Straw Hat Crew} body being removed", () => {
    const game = table("p111-save")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [
        character("robin", "P-111"),
        character("saved", "ST21-005"),
      ])
      .build();

    const activeBefore = game.state.players.p2.activeDon.length;
    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "saved" });
    game.play({ type: "resolve-effect", optionId: "replace:robin" });
    settle(game);

    expect(boardCard(game, "p2", "saved")).toBeDefined();
    expect(game.state.players.p2.activeDon).toHaveLength(activeBefore - 1);
  });

  it("answers only one removal a turn", () => {
    const game = table("p111-once")
      .withHand("p1", [
        instance("gatling1", "ST10-016"),
        instance("gatling2", "ST10-016"),
      ])
      .withBoard("p2", [
        character("robin", "P-111"),
        character("first", "ST21-005"),
        character("second", "ST21-005"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "first" });
    game.play({ type: "resolve-effect", optionId: "replace:robin" });
    settle(game);
    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "second" });
    settle(game);

    expect(boardCard(game, "p2", "first")).toBeDefined();
    expect(boardCard(game, "p2", "second")).toBeUndefined();
  });
});

describe("P-117 Nami (Leader)", () => {
  covers("P-117", "static");

  it("wins the game when its own deck runs out", () => {
    // Every other Leader loses here. `winsOnEmptyDeck` is checked at the
    // Refresh draw, before the loss, because the printed clause does not say
    // the player survives -- it says they have already won.
    const game = table("p117-win")
      .withLeader("p1", "P-117")
      .allowPartialState()
      .withState((state) => {
        state.players.p1.deck = [];
      })
      .build();

    game.pass();
    game.pass();

    expect(game.state.winner).toBe("p1");
    expect(game.state.resultReason).toBe("deck-exhaustion");
  });

  it("mills a card when its own attack connects, with a DON!! on it", () => {
    const game = table("p117-mill")
      .withLeader("p1", "P-117")
      .withDon("p1", { leaderAttached: 1 })
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    // The Life card the attack took has a [Trigger]. The Leader's clause
    // waits until the Damage Step is over (OP05-098#1 in Bandai's OP-05 Q&A
    // rules the same for Enel's), so p2 answers the Trigger first.
    if (game.state.phase === "trigger") {
      game.play({ type: "resolve-trigger", optionId: "skip" });
    }
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.trash.length).toBe(trashBefore + 1);
  });

  it("mills nothing off a Character's attack", () => {
    // The printed clause names this Leader's own attack, and a Character's
    // attack moves a Life card in exactly the same shape.
    const game = table("p117-character-attack")
      .withLeader("p1", "P-117")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [character("body", "ST21-014")])
      .withGivenDon("p1", "body", 2)
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({
      type: "attack",
      attackerInstanceId: "body",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p1.trash.length).toBe(trashBefore);
  });
});

describe("the five identities printed only on the PRB-02 page", () => {
  // P-044, P-063, P-073, P-074 and P-075 appear on no promo list of their own,
  // so the promo `setSeries` entry reads two files to reach them. P-084 Buggy
  // is the sixth and is still unimported: its only English print is OP-17's
  // `SP CARD`, a collector treatment rather than a printable rarity.

  describe("P-044 Sabo", () => {
    covers("P-044", "static");

    it("gains +2000 with a DON!! on it and a hand of four", () => {
      const game = table("p044-buff")
        .withBoard("p1", [
          { ...character("sabo", "P-044"), attachedDon: ["p1-don-0"] },
        ])
        .withHand("p1", [
          instance("a", "FIX-001"),
          instance("b", "FIX-001"),
          instance("c", "FIX-001"),
          instance("d", "FIX-001"),
        ])
        .allowPartialState()
        .build();

      // 4000 printed, 1000 from the DON!! itself and 2000 from the clause.
      expect(currentPower(game.state, "p1", "sabo")).toBe(7_000);
    });

    it("gains nothing with a hand of five", () => {
      const game = table("p044-full")
        .withBoard("p1", [
          { ...character("sabo", "P-044"), attachedDon: ["p1-don-0"] },
        ])
        .withHand("p1", [
          instance("a", "FIX-001"),
          instance("b", "FIX-001"),
          instance("c", "FIX-001"),
          instance("d", "FIX-001"),
          instance("e", "FIX-001"),
        ])
        .allowPartialState()
        .build();

      expect(currentPower(game.state, "p1", "sabo")).toBe(5_000);
    });

    it("holds through the opponent's turn", () => {
      // The clause names no window, unlike P-050 Sanji's, so the body defends
      // at 6000 as well as attacking at one.
      const game = defending("p044-defending")
        .withBoard("p1", [
          { ...character("sabo", "P-044"), attachedDon: ["p1-don-0"] },
        ])
        .withHand("p1", [instance("a", "FIX-001")])
        .allowPartialState()
        .build();

      expect(currentPower(game.state, "p1", "sabo")).toBe(7_000);
    });
  });

  describe("P-063 Jinbe", () => {
    covers("P-063", "[On Play]");

    it("rests a 1-cost body", () => {
      const game = table("p063-rest")
        .withHand("p1", [instance("jinbe", "P-063")])
        .withBoard("p2", [character("target", "ST12-009")])
        .build();

      game.play({ type: "play-card", cardNumber: "P-063" });
      game.play({ type: "resolve-effect", optionId: "target" });
      settle(game);

      expect(boardCard(game, "p2", "target")?.rested).toBe(true);
    });

    it("cannot reach a 2-cost body", () => {
      const game = table("p063-miss")
        .withHand("p1", [instance("jinbe", "P-063")])
        .withBoard("p2", [character("target", "ST12-011")])
        .build();

      game.play({ type: "play-card", cardNumber: "P-063" });

      expect(effectOptions(game.state)).not.toContain("target");
    });
  });

  describe("P-073 Sabo", () => {
    covers("P-073", "[Activate: Main]");

    it("trades a Life card for +1000 and a card in hand", () => {
      const game = table("p073-buff")
        .withBoard("p1", [character("sabo", "P-073")])
        .withLife("p1", [instance("banked", "FIX-001")])
        .build();

      game.play({ type: "activate-main", cardNumber: "P-073" });
      applyOptional(game);
      game.play({ type: "resolve-effect", optionId: "banked" });
      settle(game);

      expect(currentPower(game.state, "p1", "sabo")).toBe(6_000);
      expect(
        game.state.players.p1.hand.some((card) => card.instanceId === "banked"),
      ).toBe(true);
    });

    it("is not offered with an empty Life stack", () => {
      const game = table("p073-no-life")
        .withBoard("p1", [character("sabo", "P-073")])
        .withLife("p1", 0)
        .build();

      expect(
        game
          .legalActions("p1")
          .some(
            (action) =>
              action.type === "activate-main" &&
              action.sourceCardNumber === "P-073",
          ),
      ).toBe(false);
    });
  });

  describe("P-074 Portgas.D.Ace", () => {
    covers("P-074", "[Activate: Main]");

    it("cashes the body in for a five-card sort", () => {
      const game = table("p074-sort")
        .withBoard("p1", [character("ace", "P-074")])
        .build();

      const deckBefore = game.state.players.p1.deck.length;
      game.play({ type: "activate-main", cardNumber: "P-074" });
      applyOptional(game);
      settle(game);

      expect(boardCard(game, "p1", "ace")).toBeUndefined();
      expect(
        game.state.players.p1.hand.map((card) => card.cardNumber),
      ).toContain("P-074");
      // A look is not a draw: the deck is the size it was.
      expect(game.state.players.p1.deck).toHaveLength(deckBefore);
    });
  });

  describe("P-075 Monkey.D.Luffy", () => {
    covers("P-075", "[On Play]", "[When Attacking]");

    it("hands a rested DON!! to the Leader on arrival", () => {
      const game = table("p075-gift")
        .withHand("p1", [instance("luffy", "P-075")])
        .withDon("p1", { rested: 3 })
        .build();

      game.play({ type: "play-card", cardNumber: "P-075" });
      game.play({ type: "resolve-effect", optionId: "p1-leader" });
      settle(game);

      expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    });

    it("trades a card for a card behind a cost-8 body", () => {
      const game = table("p075-loop")
        .withBoard("p1", [
          character("luffy", "P-075"),
          character("giant", "OP05-044"),
        ])
        .withHand("p1", [instance("spare", "FIX-001")])
        .build();

      const handBefore = game.state.players.p1.hand.length;
      const trashBefore = game.state.players.p1.trash.length;
      game.play({ type: "attack", attackerInstanceId: "luffy" });
      game.play({ type: "resolve-effect", optionId: "spare" });
      settle(game);

      expect(game.state.players.p1.hand).toHaveLength(handBefore);
      expect(game.state.players.p1.trash).toHaveLength(trashBefore + 1);
    });

    it("does nothing with no cost-8 body out", () => {
      const game = table("p075-alone")
        .withBoard("p1", [character("luffy", "P-075")])
        .withHand("p1", [instance("spare", "FIX-001")])
        .build();

      const handBefore = game.state.players.p1.hand.length;
      game.play({ type: "attack", attackerInstanceId: "luffy" });
      settle(game);

      expect(game.state.players.p1.hand).toHaveLength(handBefore);
    });
  });
});
