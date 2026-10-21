import { describe, expect, it } from "vitest";
import {
  currentPower,
  fieldDonCount,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Red/Purple) Gol.D.Roger feature deck, played through its own list.
 *
 * OP13-003's two clauses are what the fifty are built around: the DON!! the
 * Leader takes every DON!! Phase is what turns on the "any DON!! cards given"
 * gates across the list, and its -2000 below ten DON!! is what OP13-064
 * switches off. The Leader's tests reach the DON!! Phase by playing turns out;
 * the rest pin the printed clauses no other file claims, one test each.
 */
const DECK = "(Red/Purple) Gol.D.Roger - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

type Game = ReturnType<ReturnType<typeof table>["build"]>;

/** Answer the pending effect with `optionId`, or its first offer if absent. */
function answer(game: Game, ...preferred: string[]): void {
  while (game.state.pendingEffect) {
    const options = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect");
    const wanted =
      preferred
        .map((id) =>
          options.find(
            (action) => (action as { optionId?: string }).optionId === id,
          ),
        )
        .find(Boolean) ?? options[0]!;
    game.submit(wanted);
  }
}

const canAttackWith = (game: Game, attackerInstanceId: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" &&
        (action as { attackerInstanceId?: string }).attackerInstanceId ===
          attackerInstanceId,
    );

const boardIds = (state: GameState, playerId: "p1" | "p2") =>
  state.players[playerId].board.map((card) => card.instanceId);

const trashIds = (state: GameState, playerId: "p1" | "p2") =>
  state.players[playerId].trash.map((card) => card.instanceId);

describe("OP13-003 Gol.D.Roger: -2000 power at nine DON!! or fewer", () => {
  covers("OP13-003", "static");

  it("is a 5000 Leader at nine DON!! and a 7000 one at ten", () => {
    const nine = table("op13-003-nine").withDonDeck("p1", 1).build();
    expect(fieldDonCount(nine.state, "p1")).toBe(9);
    expect(currentPower(nine.state, "p1", "p1-leader")).toBe(5000);

    const ten = table("op13-003-ten").build();
    expect(fieldDonCount(ten.state, "p1")).toBe(10);
    expect(currentPower(ten.state, "p1", "p1-leader")).toBe(7000);
  });

  it("counts DON!! given to the Leader and rested DON!! as on the field", () => {
    const game = table("op13-003-given")
      .withDonDeck("p1", 3)
      .withDon("p1", { rested: 0 })
      .build();
    game.play({ type: "attach-don", targetInstanceId: "p1-leader" });

    // Seven on the field, one of them on the Leader: still under ten, so the
    // Leader is 5000 plus the 1000 its own DON!! gives on its turn.
    expect(fieldDonCount(game.state, "p1")).toBe(7);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  it("is back to 7000 at nine DON!! while OP13-064 negates it", () => {
    const game = table("op13-003-negated")
      .withDonDeck("p1", 1)
      .withBoard("p1", [character("roger", "OP13-064")])
      .build();

    expect(fieldDonCount(game.state, "p1")).toBe(9);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });
});

describe("OP13-003 Gol.D.Roger: a DON!! of each DON!! Phase goes to the Leader", () => {
  const opening = (seed: string) => scenario().decks(DECK, OPPONENT).seed(seed);

  it("takes nothing on turn 1, when the field held no DON!! before the phase", () => {
    const game = opening("op13-003-turn-1").atTurn(1, { active: "p1" }).build();

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(game.state.players.p1.activeDon).toHaveLength(1);
  });

  it("takes one of turn 3's two DON!! -- going first, two to spend", () => {
    const game = opening("op13-003-turn-3").atTurn(3, { active: "p1" }).build();

    // Bandai's own write-up: going first, the second turn has two DON!! to
    // spend and the third on the Leader.
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(2);
    expect(
      game.state.events.some(
        (event) =>
          event.type === "don-attached" &&
          event.playerId === "p1" &&
          event.targetInstanceId === "p1-leader" &&
          event.sourceCardNumber === "OP13-003",
      ),
    ).toBe(true);
  });

  it("going second keeps turn 2's DON!!, and gives one up from turn 4", () => {
    const second = scenario()
      .decks(OPPONENT, DECK)
      .seed("op13-003-second")
      .atTurn(2, { active: "p2" })
      .build();
    expect(second.state.players.p2.leaderAttachedDon).toHaveLength(0);

    const fourth = scenario()
      .decks(OPPONENT, DECK)
      .seed("op13-003-fourth")
      .atTurn(4, { active: "p2" })
      .build();
    expect(fourth.state.players.p2.leaderAttachedDon).toHaveLength(1);
    // The Zoro Leader across the table takes nothing.
    expect(fourth.state.players.p1.leaderAttachedDon).toHaveLength(0);
  });

  /** p1 at eight DON!! with two left in the DON!! deck, two turns from now. */
  const nextDonPhase = (seed: string) =>
    table(seed)
      .withDonDeck("p1", 2)
      .withDeckTop("p1", copies(2, "OP13-065", "p1-draw"))
      .withDeckTop("p2", copies(2, "ST32-005", "p2-draw"));

  it("gives one of the two to the Leader on a later turn", () => {
    const game = nextDonPhase("op13-003-later").build();
    game.pass();
    game.pass();

    expect(game.state.turnPlayerId).toBe("p1");
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(9);
  });

  it("keeps both while OP13-064 negates the Leader", () => {
    const game = nextDonPhase("op13-003-later-negated")
      .withBoard("p1", [character("roger", "OP13-064")])
      .build();
    game.pass();
    game.pass();

    expect(game.state.turnPlayerId).toBe("p1");
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(game.state.players.p1.activeDon).toHaveLength(10);
  });
});

describe("OP13-060 Amatsuki Toki", () => {
  covers("OP13-060", "static");

  /** p2 about to K.O. a 4000-or-less Character of p1's with OP16-006. */
  const opponentRemoval = (seed: string) =>
    table(seed)
      .withHand("p2", [instance("shanks", "OP16-006")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"));

  const trashToki = (game: Game) =>
    game
      .legalActions()
      .find((action) => action.summary.includes("Trash Amatsuki Toki"));

  it("trashes herself instead of a Roger Pirates Character the opponent's effect would K.O.", () => {
    const game = opponentRemoval("op13-060-save")
      .withBoard("p1", [
        character("toki", "OP13-060"),
        character("buggy", "OP13-072"),
      ])
      .build();

    game.pass();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "buggy" });

    const trade = trashToki(game);
    expect(trade, "Toki's replacement should be offered").toBeDefined();
    game.submit(trade!);

    expect(boardIds(game.state, "p1")).toEqual(["buggy"]);
    expect(trashIds(game.state, "p1")).toEqual(["toki"]);
  });

  it("reaches a Former Roger Pirates body, a type that only includes the words", () => {
    const game = opponentRemoval("op13-060-former")
      // Seven DON!! keeps Douglas Bullet at its printed 4000, inside the reach
      // of OP16-006's K.O.
      .withDonDeck("p1", 3)
      .withBoard("p1", [
        character("toki", "OP13-060"),
        character("bullet", "OP13-068"),
      ])
      .build();

    game.pass();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "bullet" });

    expect(trashToki(game)).toBeDefined();
  });

  it("can be declined, and the K.O. goes through", () => {
    const game = opponentRemoval("op13-060-decline")
      .withBoard("p1", [
        character("toki", "OP13-060"),
        character("buggy", "OP13-072"),
      ])
      .build();

    game.pass();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "buggy" });
    expect(trashToki(game)).toBeDefined();

    const decline = game
      .legalActions()
      .find(
        (action) =>
          action.type === "resolve-effect" &&
          !action.summary.includes("Trash Amatsuki Toki"),
      );
    game.submit(decline!);

    expect(boardIds(game.state, "p1")).toEqual(["toki"]);
    expect(trashIds(game.state, "p1")).toEqual(["buggy"]);
  });

  it("does not cover a Character without the type", () => {
    const offType = opponentRemoval("op13-060-offtype")
      .withBoard("p1", [
        character("toki", "OP13-060"),
        character("brook", "ST31-003"),
      ])
      .build();
    offType.pass();
    offType.play({ type: "play-card", cardNumber: "OP16-006" });
    offType.play({ type: "resolve-effect", optionId: "apply" });
    offType.play({ type: "resolve-effect", optionId: "brook" });
    expect(trashToki(offType)).toBeUndefined();
    expect(trashIds(offType.state, "p1")).toEqual(["brook"]);
  });

  // Bandai's OP-13 Q&A (OP13-060#1): Toki may trash herself in place of her
  // own K.O., and is then trashed rather than K.O.'d.
  it("covers herself", () => {
    const self = opponentRemoval("op13-060-self")
      .withBoard("p1", [character("toki", "OP13-060")])
      .build();
    self.pass();
    self.play({ type: "play-card", cardNumber: "OP16-006" });
    self.play({ type: "resolve-effect", optionId: "apply" });
    self.play({ type: "resolve-effect", optionId: "toki" });
    const offer = trashToki(self);
    expect(offer).toBeDefined();
    self.submit(offer!);
    expect(trashIds(self.state, "p1")).toEqual(["toki"]);
    expect(
      self.state.events.some((event) => event.type === "character-ko"),
    ).toBe(false);
  });
});

describe("OP13-061 Inuarashi", () => {
  covers("OP13-061", "[On Play]");

  it("with a DON!! given, ramps one rested DON!! and K.O.s a 1-cost", () => {
    const game = table("op13-061")
      .withDonDeck("p1", 2)
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [instance("inuarashi", "OP13-061")])
      .withBoard("p2", [
        character("small", "ST32-005"),
        character("big", "ST32-004"),
      ])
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({ type: "play-card", cardNumber: "OP13-061" });
    answer(game, "apply", "small");

    // Three rested to pay for Inuarashi, one more from the DON!! deck.
    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore + 4);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(boardIds(game.state, "p2")).toEqual(["big"]);
  });

  it("does nothing without a DON!! given", () => {
    const game = table("op13-061-none")
      .withDonDeck("p1", 2)
      .withHand("p1", [instance("inuarashi", "OP13-061")])
      .withBoard("p2", [character("small", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-061" });
    answer(game, "small");

    expect(game.state.players.p1.donDeck).toHaveLength(2);
    expect(boardIds(game.state, "p2")).toEqual(["small"]);
  });
});

describe("OP13-062 Crocus", () => {
  covers("OP13-062", "[On Play]", "[When Attacking]");

  it("[On Play] with a DON!! given adds one DON!! active", () => {
    const game = table("op13-062-on-play")
      .withDonDeck("p1", 2)
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [instance("crocus", "OP13-062")])
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP13-062" });
    answer(game, "apply");

    // Five paid, one back active.
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 5 + 1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("[On Play] adds nothing without a DON!! given", () => {
    const game = table("op13-062-on-play-none")
      .withDonDeck("p1", 2)
      .withHand("p1", [instance("crocus", "OP13-062")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-062" });
    answer(game);

    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("[When Attacking] returns a 3000-base-power Character to its owner's hand", () => {
    const game = table("op13-062-attacking")
      .withBoard("p1", [character("crocus", "OP13-062", { playedTurn: 1 })])
      .withBoard("p2", [
        character("small", "ST31-003"),
        character("big", "ST32-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "crocus",
      targetInstanceId: "p2-leader",
    });
    const offered = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => (action as { optionId?: string }).optionId);
    // 5000 printed power is out of reach.
    expect(offered).not.toContain("big");
    answer(game, "apply", "small");

    expect(boardIds(game.state, "p2")).toEqual(["big"]);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "small",
    ]);
  });
});

describe("OP13-063 Kouzuki Oden", () => {
  covers("OP13-063", "[On Play]", "[Blocker]");

  it("[On Play] with a DON!! given adds one DON!! rested", () => {
    const game = table("op13-063-on-play")
      .withDonDeck("p1", 1)
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [instance("oden", "OP13-063")])
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({ type: "play-card", cardNumber: "OP13-063" });
    answer(game, "apply");

    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore + 6);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("[Blocker] becomes the target of a declared attack and rests", () => {
    const game = scenario()
      .decks(OPPONENT, DECK)
      .seed("op13-063-blocker")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "ST32-005")])
      .withBoard("p2", [character("oden", "OP13-063")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "oden" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("oden");
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });
});

describe("OP13-065 Shanks", () => {
  covers("OP13-065", "[On Play]");

  it("adds a Roger Pirates card other than Shanks from the top 5 and bottoms the rest", () => {
    const game = table("op13-065")
      .withHand("p1", [instance("shanks", "OP13-065")])
      .withDeckTop("p1", [
        instance("other-shanks", "OP13-065"),
        instance("brook", "ST31-003"),
        instance("rayleigh", "OP13-066"),
        instance("zoro", "ST32-005"),
        instance("former", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-065" });
    const offered = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => (action as { optionId?: string }).optionId);
    expect(offered).toEqual(expect.arrayContaining(["rayleigh", "former"]));
    expect(offered).not.toContain("other-shanks");
    expect(offered).not.toContain("brook");
    answer(game, "rayleigh");

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "rayleigh",
    ]);
    expect(game.state.players.p1.deck).toHaveLength(4);
  });
});

describe("OP13-066 Silvers Rayleigh", () => {
  covers("OP13-066", "[Rush]");

  it("attacks the turn it is played", () => {
    const game = table("op13-066-rush")
      .withHand("p1", [instance("rayleigh", "OP13-066")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-066" });
    answer(game);

    expect(hasKeyword(game.state, "p1", "rayleigh", "Rush")).toBe(true);
    expect(canAttackWith(game, "rayleigh")).toBe(true);
  });
});

describe("OP13-067 Scopper Gaban", () => {
  covers("OP13-067", "[On Play]");

  it("draws 2, trashes 1 and ramps a rested DON!! behind a Roger Pirates Leader", () => {
    const game = table("op13-067")
      .withDonDeck("p1", 1)
      .withHand("p1", [instance("gaban", "OP13-067")])
      .withDeckTop("p1", [
        instance("draw-1", "OP13-065"),
        instance("draw-2", "OP13-072"),
      ])
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({ type: "play-card", cardNumber: "OP13-067" });
    answer(game, "draw-2");

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw-1",
    ]);
    expect(trashIds(game.state, "p1")).toEqual(["draw-2"]);
    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore + 7);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("op13-067-no-leader")
      .withLeader("p1", "ST31-001")
      .withDonDeck("p1", 1)
      .withHand("p1", [instance("gaban", "OP13-067")])
      .withDeckTop("p1", copies(2, "OP13-065", "draw"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-067" });
    answer(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP13-068 Douglas Bullet", () => {
  covers("OP13-068", "[On Play]", "static");

  it("[On Play] ramps a rested DON!! behind a Roger Pirates Leader", () => {
    const game = table("op13-068-on-play")
      .withDonDeck("p1", 1)
      .withHand("p1", [instance("bullet", "OP13-068")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-068" });
    answer(game, "apply");

    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("is 6000 at eight DON!! on the field and 4000 at seven", () => {
    const eight = table("op13-068-eight")
      .withDonDeck("p1", 2)
      .withBoard("p1", [character("bullet", "OP13-068")])
      .build();
    expect(currentPower(eight.state, "p1", "bullet")).toBe(6000);

    const seven = table("op13-068-seven")
      .withDonDeck("p1", 3)
      .withBoard("p1", [character("bullet", "OP13-068")])
      .build();
    expect(currentPower(seven.state, "p1", "bullet")).toBe(4000);
  });
});

describe("OP13-071 Nekomamushi", () => {
  covers("OP13-071", "[On Play]");

  it("K.O.s a 3000-base-power Character at eight DON!!", () => {
    const game = table("op13-071")
      .withHand("p1", [instance("neko", "OP13-071")])
      .withBoard("p2", [
        character("small", "ST31-003"),
        character("big", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-071" });
    const offered = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => (action as { optionId?: string }).optionId);
    expect(offered).not.toContain("big");
    answer(game, "small");

    expect(boardIds(game.state, "p2")).toEqual(["big"]);
  });

  it("does nothing at seven DON!!", () => {
    const game = table("op13-071-seven")
      .withDonDeck("p1", 3)
      .withHand("p1", [instance("neko", "OP13-071")])
      .withBoard("p2", [character("small", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-071" });
    answer(game, "small");

    expect(boardIds(game.state, "p2")).toEqual(["small"]);
  });
});

describe("OP13-072 Buggy", () => {
  covers("OP13-072", "[On Play]");

  it("ramps a rested DON!! behind a Roger Pirates Leader with a DON!! given", () => {
    const game = table("op13-072")
      .withDonDeck("p1", 1)
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [instance("buggy", "OP13-072")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-072" });
    answer(game, "apply");

    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("does nothing with no DON!! given", () => {
    const game = table("op13-072-none")
      .withDonDeck("p1", 1)
      .withHand("p1", [instance("buggy", "OP13-072")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-072" });
    answer(game);

    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP13-075 Guess We'll Have Another Scrap", () => {
  covers("OP13-075", "[Main]", "[Counter]");

  it("[Main] rests a DON!! to ramp one behind Gol.D.Roger with a DON!! given", () => {
    const game = table("op13-075-main")
      .withDonDeck("p1", 1)
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [instance("scrap", "OP13-075")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP13-075" });
    answer(game, "apply");

    expect(game.state.players.p1.donDeck).toHaveLength(0);
    // One for the Event, one for its price, and the ramped one arrives rested.
    expect(game.state.players.p1.restedDon).toHaveLength(3);
  });

  it("[Main] is not offered behind a Leader other than Gol.D.Roger, where it would do nothing", () => {
    const game = table("op13-075-main-other")
      .withLeader("p1", "ST31-001")
      .withDonDeck("p1", 1)
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [instance("scrap", "OP13-075")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP13-075"),
        ),
    ).toBe(false);
  });

  it("[Main] is not offered with no DON!! given, where it would do nothing", () => {
    const game = table("op13-075-main-none")
      .withDonDeck("p1", 1)
      .withHand("p1", [instance("scrap", "OP13-075")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP13-075"),
        ),
    ).toBe(false);
  });

  it("[Counter] gives the Leader +3000 during the battle", () => {
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("op13-075-counter")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("scrap", "OP13-075")])
      .withBoard("p2", [character("attacker", "ST32-005")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 9000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "scrap" });
    answer(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("the (Red/Purple) Gol.D.Roger list", () => {
  it("is the fifty on Bandai's page", async () => {
    const { deckManifests } = await import("@one-piece-sim/decks");
    const manifest = deckManifests[DECK]!;
    expect(manifest.leader).toBe("OP13-003");
    expect(
      Object.values(manifest.cards).reduce((total, count) => total + count, 0),
    ).toBe(50);
    expect(manifest.cards["OP13-060"]).toBe(2);
  });
});
