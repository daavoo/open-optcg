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
 * STARTER DECK -Yellow Charlotte Katakuri- [ST-30], as a whole-product import.
 *
 * `packages/cards/src/st30.ts` explains where the records come from; this file
 * holds the behaviour. The product is a wall of Characters printed at exactly
 * 6000: nine of its seventeen cards name that number, as a search target, as a
 * cost, as a condition or as the board a protection covers.
 *
 * Three identities were in the pool before the product was and are tested with
 * the lists that play them -- the Leader, ST30-012 and ST30-014 -- so what is
 * here is the other fourteen.
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

const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
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

const handNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].hand.map((card) => card.cardNumber);

/** One of the product's 6000s, as a plain body with no text of its own. */
const sixThousand = (id: string) => character(id, "ST30-005");

describe("ST30-002 Inazuma", () => {
  covers("ST30-002", "[On Play]");

  it("digs five deep for a 6000-power Character", () => {
    const game = table("st30-002-dig")
      .withHand("p1", [instance("inazuma", "ST30-002")])
      .withDeckTop("p1", [instance("prize", "ST30-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-002" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("ST30-005");
  });

  it("offers nothing off a 7000 -- the clause names one power, not a floor", () => {
    const game = table("st30-002-exact")
      .withHand("p1", [instance("inazuma", "ST30-002")])
      .withDeckTop("p1", [instance("big", "ST29-006")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-002" });

    expect(effectOptions(game.state)).not.toContain("big");
  });
});

describe("ST30-003 Edward.Newgate", () => {
  covers("ST30-003", "[Your Turn]");

  it("gives every 6000 on its own board +1000, itself included", () => {
    const game = table("st30-003-aura")
      .withBoard("p1", [
        character("newgate", "ST30-003"),
        sixThousand("mate"),
        character("small", "FIX-002"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "newgate")).toBe(7_000);
    expect(currentPower(game.state, "p1", "mate")).toBe(7_000);
    expect(currentPower(game.state, "p1", "small")).toBe(4_000);
  });

  it("gives nothing on the opponent's turn", () => {
    const game = defending("st30-003-defending")
      .withBoard("p1", [character("newgate", "ST30-003"), sixThousand("mate")])
      .build();

    expect(currentPower(game.state, "p1", "mate")).toBe(6_000);
  });
});

describe("ST30-004 Emporio.Ivankov", () => {
  covers("ST30-004", "[On Play]");

  it("shows two 6000s to turn the hand over three for two", () => {
    const game = table("st30-004-dig")
      .withHand("p1", [
        instance("ivankov", "ST30-004"),
        instance("show1", "ST30-005"),
        instance("show2", "ST30-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-004" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "show1" });
    game.play({ type: "resolve-effect", optionId: "show2" });
    settle(game);

    // Two shown and kept, three drawn, two trashed: net +1 on a hand of two.
    expect(game.state.players.p1.hand).toHaveLength(3);
    expect(game.state.players.p1.trash).toHaveLength(2);
  });

  it("does nothing on a hand with only one 6000 to show", () => {
    const game = table("st30-004-one-only")
      .withHand("p1", [
        instance("ivankov", "ST30-004"),
        instance("show1", "ST30-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-004" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });
});

describe("ST30-006 Jinbe", () => {
  covers("ST30-006", "[On Play]");

  it("trades a 6000 from hand for two cards", () => {
    const game = table("st30-006-draw")
      .withHand("p1", [
        instance("jinbe", "ST30-006"),
        instance("fuel", "ST30-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-006" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(2);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("ST30-005");
  });

  it("draws nothing with no 6000 to spend", () => {
    const game = table("st30-006-no-fuel")
      .withHand("p1", [
        instance("jinbe", "ST30-006"),
        instance("small", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-006" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("ST30-007 Portgas.D.Ace", () => {
  covers("ST30-007", "[On Play]", "[When Attacking]");

  it("rests a DON!! to attack the turn it lands", () => {
    const game = table("st30-007-rush")
      .withHand("p1", [instance("ace", "ST30-007")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-007" });
    applyOptional(game);
    settle(game);

    const attacker = game.state.players.p1.board.at(-1)!;
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === attacker.instanceId,
        ),
    ).toBe(true);
  });

  it("cannot attack the turn it lands when the cost is declined", () => {
    const game = table("st30-007-declined")
      .withHand("p1", [instance("ace", "ST30-007")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-007" });
    if (effectOptions(game.state).includes("skip")) {
      game.play({ type: "resolve-effect", optionId: "skip" });
    }
    settle(game);

    const attacker = game.state.players.p1.board.at(-1)!;
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === attacker.instanceId,
        ),
    ).toBe(false);
  });

  it("takes 1000 off a body on the swing", () => {
    const game = table("st30-007-debuff")
      .withBoard("p1", [character("ace", "ST30-007")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "ace",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(before - 1_000);
  });
});

describe("ST30-008 Marco", () => {
  covers("ST30-008", "[Blocker]", "[On K.O.]");

  it("blocks", () => {
    const game = defending("st30-008-block")
      .withBoard("p1", [character("marco", "ST30-008")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "marco",
        ),
    ).toBe(true);
  });

  it("comes back rested for a 6000 out of hand when it dies", () => {
    const game = table("st30-008-return")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("marco", "ST30-008")])
      .withHand("p2", [instance("fuel", "ST30-005")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "marco" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    settle(game);

    const returned = game.state.players.p2.board.find(
      (card) => card.cardNumber === "ST30-008",
    );
    expect(returned?.rested).toBe(true);
  });

  it("stays dead with no 6000 to spend", () => {
    const game = table("st30-008-no-fuel")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("marco", "ST30-008")])
      .withHand("p2", [instance("small", "FIX-001")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "marco" });
    settle(game);

    expect(
      game.state.players.p2.board.some(
        (card) => card.cardNumber === "ST30-008",
      ),
    ).toBe(false);
  });
});

describe("ST30-009 LittleOars Jr.", () => {
  covers("ST30-009", "static");

  it("dies in a 6000's place and draws off it", () => {
    const game = table("st30-009-save")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("oars", "ST30-009"), sixThousand("saved")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "saved" });
    game.play({ type: "resolve-effect", optionId: "replace:oars" });
    settle(game);

    expect(boardCard(game, "p2", "saved")).toBeDefined();
    expect(boardCard(game, "p2", "oars")).toBeUndefined();
    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
  });

  it("does not answer a removal aimed at a body that is not a 6000", () => {
    const game = table("st30-009-off-band")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [
        character("oars", "ST30-009"),
        character("small", "FIX-002"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(boardCard(game, "p2", "small")).toBeUndefined();
    expect(boardCard(game, "p2", "oars")).toBeDefined();
  });
});

describe("ST30-010 Crocodile", () => {
  covers("ST30-010", "[Blocker]", "[On Play]");

  it("blocks", () => {
    const game = defending("st30-010-block")
      .withBoard("p1", [character("croc", "ST30-010")])
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

  it("keeps a rested body down through the opponent's Refresh", () => {
    const game = table("st30-010-lock")
      .withHand("p1", [instance("croc", "ST30-010")])
      .withBoard("p2", [{ ...character("held", "FIX-002"), rested: true }])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-010" });
    game.play({ type: "resolve-effect", optionId: "held" });
    settle(game);
    game.pass();

    expect(boardCard(game, "p2", "held")?.rested).toBe(true);
  });

  it("reaches no active body -- it rests nothing itself", () => {
    const game = table("st30-010-active")
      .withHand("p1", [instance("croc", "ST30-010")])
      .withBoard("p2", [character("active", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-010" });

    expect(effectOptions(game.state)).not.toContain("active");
  });
});

describe("ST30-011 Buggy", () => {
  covers("ST30-011", "[Blocker]", "static");

  it("blocks", () => {
    const game = defending("st30-011-block")
      .withBoard("p1", [character("buggy", "ST30-011")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "buggy",
        ),
    ).toBe(true);
  });

  it("rests itself instead of a 6000 being removed", () => {
    const game = table("st30-011-save")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("buggy", "ST30-011"), sixThousand("saved")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "saved" });
    game.play({ type: "resolve-effect", optionId: "replace:buggy" });
    settle(game);

    expect(boardCard(game, "p2", "saved")).toBeDefined();
    // The protector survives paying -- the only cost in the registry that
    // leaves it on the board -- but it has spent its turn, so it cannot block.
    expect(boardCard(game, "p2", "buggy")?.rested).toBe(true);
  });

  it("cannot pay once it is already rested", () => {
    const game = table("st30-011-spent")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [
        { ...character("buggy", "ST30-011"), rested: true },
        sixThousand("saved"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "saved" });
    settle(game);

    expect(boardCard(game, "p2", "saved")).toBeUndefined();
  });
});

describe("ST30-015 The Name of This Era", () => {
  covers("ST30-015", "[Counter]", "[Trigger]");

  it("adds 4000 off a board of two 6000s", () => {
    const game = defending("st30-015-counter")
      .withBoard("p1", [sixThousand("one"), sixThousand("two")])
      .withHand("p1", [instance("era", "ST30-015")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST30-015" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
  });

  it("is not offered off a board of one", () => {
    const game = defending("st30-015-one-body")
      .withBoard("p1", [sixThousand("one")])
      .withHand("p1", [instance("era", "ST30-015")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-counter-event" &&
            action.sourceCardNumber === "ST30-015",
        ),
    ).toBe(false);
  });

  it("K.O.s a 6000 off a Life card", () => {
    const game = table("st30-015-trigger")
      .withLife("p2", [instance("era", "ST30-015")])
      .withBoard("p1", [sixThousand("victim")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

describe("ST30-016 Can You Still Fight, Luffy?!", () => {
  covers("ST30-016", "[Counter]");

  it("adds 3000 and draws behind both names at 6000", () => {
    const game = defending("st30-016-counter")
      .withBoard("p1", [
        character("ace", "ST30-007"),
        character("luffy", "ST30-012"),
      ])
      .withHand("p1", [instance("fight", "ST30-016")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST30-016" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    // One Event spent and one card drawn: the hand is one smaller.
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("adds the power but no card with only one of the two names", () => {
    const game = defending("st30-016-one-name")
      .withBoard("p1", [character("ace", "ST30-007")])
      .withHand("p1", [instance("fight", "ST30-016")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST30-016" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });
});

describe("ST30-017 And You Get Yourself in Big Trouble!!", () => {
  covers("ST30-017", "[Main]", "[Trigger]");

  it("digs five deep for a 6000", () => {
    const game = table("st30-017-main")
      .withHand("p1", [instance("trouble", "ST30-017")])
      .withDeckTop("p1", [instance("prize", "ST30-005")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST30-017" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("ST30-005");
  });

  it("runs the same search off a Life card", () => {
    const game = table("st30-017-trigger")
      .withLife("p2", [instance("trouble", "ST30-017")])
      .withDeckTop("p2", [instance("prize", "ST30-005")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(handNumbers(game, "p2")).toContain("ST30-005");
  });
});
