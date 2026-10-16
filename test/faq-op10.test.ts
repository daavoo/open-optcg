import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  fieldDonCount,
  hasKeyword,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-10 "Royal Blood", one case per ruling, named by
 * the Q&A id (`<card>#<n>`, in the order the PDF prints them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. A ruling the engine disagrees with is an `it.fails`
 * that says what the engine does instead: it turns green -- and so red under
 * `it.fails` -- the day the engine is fixed, which is the prompt to promote it.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op10.pdf
 */

/** Rulings with no engine decision and no observable consequence to assert. */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {
  "OP10-098#1":
    "Negating a deck-construction clause has no effect on a match in progress; deck legality is checked before the game, not by the engine's negation.",
  "OP10-098#2":
    "The Leader the ruling negates (OP03-040 Nami, who wins instead of losing on an empty deck) is not in the card pool, so the position cannot be built.",
};

const DECK = "FIXTURE-RED";
const OPPONENT = "FIXTURE-BLUE";

/**
 * p1 to act in its Main Phase on a bare table, all ten DON!! active. p2 keeps
 * a deck to draw from, so a test that passes the turn does not end the game.
 */
const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(5, { active: "p1" })
    .bareTable()
    .withDeckTop("p2", copies(3, "FIX-001", "p2-deck"));

/** p2 to act in its Main Phase on a bare table: p1 is the defender. */
const theirTurn = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(6, { active: "p2" })
    .bareTable();

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("the effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Answers each step with the first listed option on offer, else the first. */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("the effect never settled");
    const options = effectOptions(game);
    const wanted = preferred.find((id) => options.includes(id));
    game.play({ type: "resolve-effect", optionId: wanted ?? options[0] });
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const activations = (game: Game, instanceId: string): string[] =>
  game
    .legalActions()
    .flatMap((action) =>
      action.type === "activate-main" && action.optionId.includes(instanceId)
        ? [action.optionId]
        : [],
    );

/** Passes Block and Counter without defending. */
function noDefence(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    !game.state.pendingEffect
  ) {
    if (guard++ > 10) throw new Error("the battle never resolved");
    game.pass();
  }
}

describe("OP10-003 Sugar", () => {
  /** p2's Leader swings at p1's Sugar Leader; p1 holds `hand`. */
  const sugarDefends = (seed: string, hand: ReturnType<typeof instance>[]) =>
    theirTurn(seed)
      .withLeader("p1", "OP10-003")
      .withHand("p1", hand)
      .withDonDeck("p1", 2)
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "p2-leader",
          targetInstanceId: "p1-leader",
          attackPower: 5000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

  // The ruling names OP04-016, whose hand-written [Counter] path only offers
  // the Event with its trash cost paid. OP06-017 Meteor-Strike of Love is the
  // same shape -- a [Counter] behind a "you may" cost -- on the declarative path
  // that offers the decline, so it stands in for it here.
  it("OP10-003#1: a [Counter] Event whose optional cost was declined still adds the DON!!", () => {
    const game = sugarDefends("faq-op10-003-1", [
      instance("kick", "OP06-017"),
      instance("spare", "FIX-001"),
    ]);
    const before = fieldDonCount(game.state, "p1");
    game.play({ type: "activate-counter-event" });
    // Decline the optional cost: no Life card goes to hand, so no +3000.
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["kick"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["spare"]);
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(fieldDonCount(game.state, "p1")).toBe(before + 1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("OP10-003#2: an Event's [Trigger] on the opponent's turn is not activating an Event", () => {
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("faq-op10-003-2")
      .atTurn(6, { active: "p2" })
      .bareTable()
      .withLeader("p1", "OP10-003")
      .withDonDeck("p1", 2)
      .withLife("p1", [
        instance("kick", "OP04-016"),
        instance("p1-life-2", "FIX-001"),
      ])
      .build();
    const before = fieldDonCount(game.state, "p1");
    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    noDefence(game);
    expect(game.state.phase).toBe("trigger");
    game.play({ type: "resolve-trigger", optionId: "p2-leader" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toContain("kick");
    expect(fieldDonCount(game.state, "p1")).toBe(before);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  /** Baby 5 (4000) is a 6000 {Donquixote Pirates} body only with `pump`. */
  const sugarEndOfTurn = (seed: string, pump: boolean) => {
    const game = table(seed)
      .withLeader("p1", "OP10-003")
      .withBoard("p1", [character("baby5", "OP12-111")])
      .withHand("p1", [instance("fist", "OP05-020")])
      .withDon("p1", { rested: 1 })
      .build();
    if (pump) {
      game.play({ type: "activate-main", sourceCardNumber: "OP05-020" });
      answer(game, "baby5");
      expect(currentPower(game.state, "p1", "baby5")).toBe(6000);
    }
    const rested = game.state.players.p1.restedDon.length;
    game.pass();
    settle(game);
    return { game, rested };
  };

  it("OP10-003#3: the end-of-turn check sees a +2000 that lasts 'during this turn'", () => {
    const { game, rested } = sugarEndOfTurn("faq-op10-003-3", true);
    expect(game.state.players.p1.restedDon).toHaveLength(rested - 1);
  });

  it("OP10-003#3 (control): without the +2000 nothing is set active", () => {
    const { game, rested } = sugarEndOfTurn("faq-op10-003-3-control", false);
    expect(game.state.players.p1.restedDon).toHaveLength(rested);
  });
});

describe("OP10-008 Scotch and OP10-017 Rock", () => {
  /**
   * Rock lands as the fifth Character, plays Scotch over itself, and Scotch --
   * with no Rock left on the field -- plays the second Rock.
   */
  const swap = (seed: string) => {
    const game = table(seed)
      .withBoard("p1", [
        character("a", "FIX-001"),
        character("b", "FIX-001"),
        character("c", "FIX-001"),
        character("d", "FIX-001"),
      ])
      .withHand("p1", [
        instance("rock", "OP10-017"),
        instance("scotch", "OP10-008"),
        instance("rock-2", "OP10-017"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP10-017" });
    game.play({ type: "resolve-effect", optionId: "scotch" });
    // The field is full, so Rock is trashed to make room for Scotch.
    game.play({ type: "resolve-effect", optionId: "rock" });
    expect(effectOptions(game)).toContain("rock-2");
    game.play({ type: "resolve-effect", optionId: "rock-2" });
    game.play({ type: "resolve-effect", optionId: "a" });
    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.board)).toEqual([
      "b",
      "c",
      "d",
      "scotch",
      "rock-2",
    ]);
    expect(ids(game.state.players.p1.trash)).toEqual(["rock", "a"]);
  };

  it("OP10-008#1: Scotch played over a trashed Rock plays another Rock", () => {
    swap("faq-op10-008-1");
  });

  it("OP10-017#1: Rock trashed to play Scotch lets Scotch play another Rock", () => {
    swap("faq-op10-017-1");
  });
});

it("OP10-010#1: Brownbeard at 6000 only through DON!! is still the one 6000 Character", () => {
  const game = table("faq-op10-010-1")
    .withBoard("p1", [
      character("brownbeard", "OP10-010"),
      character("other", "FIX-002"),
    ])
    .withGivenDon("p1", "brownbeard", 1)
    .withLife("p2", copies(2, "FIX-001", "p2-life"))
    .build();
  expect(currentPower(game.state, "p1", "brownbeard")).toBe(6000);

  game.play({
    type: "attack",
    attackerInstanceId: "brownbeard",
    targetInstanceId: "p2-leader",
  });
  settle(game);

  expect(currentPower(game.state, "p1", "brownbeard")).toBe(7000);
});

describe("OP10-016 Monet", () => {
  it("OP10-016#1: with no rested DON!! to give, the −1000 still lands", () => {
    const game = table("faq-op10-016-1")
      .withBoard("p1", [character("monet", "OP10-016")])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();
    expect(game.state.players.p1.restedDon).toEqual([]);

    game.play({ type: "activate-main", optionId: "mechanic-main:monet" });
    answer(game, "apply", "target");

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(currentPower(game.state, "p2", "target")).toBe(3000);
  });

  it("OP10-016#2: with no opposing Character to debuff, the DON!! are still given", () => {
    const game = table("faq-op10-016-2")
      .withBoard("p1", [character("monet", "OP10-016")])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:monet" });
    answer(game, "apply", "p1-leader");

    expect(game.state.players.p1.restedDon).toEqual([]);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(2);
  });
});

describe("OP10-022 Trafalgar Law", () => {
  const lawTable = (seed: string, board: ReturnType<typeof character>[]) =>
    table(seed)
      .withLeader("p1", "OP10-022")
      .withBoard("p1", board)
      .withGivenDon("p1", "p1-leader", 1)
      .withLife("p1", [
        instance("life-top", "FIX-001"),
        instance("life-2", "FIX-001"),
      ])
      .build();

  it("OP10-022#1: Characters totalling 4 cost cannot pay to return one", () => {
    const game = lawTable("faq-op10-022-1", [
      character("a", "FIX-002"),
      character("b", "FIX-002"),
    ]);
    expect(activations(game, "p1-leader")).toEqual([]);
  });

  it("OP10-022#1 (control): at 5 total cost the activation is offered", () => {
    const game = lawTable("faq-op10-022-1-control", [
      character("a", "FIX-002"),
      character("b", "FIX-002"),
      character("c", "FIX-001"),
    ]);
    expect(activations(game, "p1-leader")).not.toEqual([]);
  });

  it("OP10-022#2: a revealed Life card that is not a cheap {Supernovas} goes back on top face-down", () => {
    const game = lawTable("faq-op10-022-2", [
      character("a", "FIX-002"),
      character("b", "FIX-002"),
      character("c", "FIX-001"),
    ]);
    game.play({
      type: "activate-main",
      optionId: activations(game, "p1-leader")[0],
    });
    answer(game, "apply", "c");

    expect(ids(game.state.players.p1.hand)).toEqual(["c"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-top", "life-2"]);
    expect(game.state.players.p1.life[0]?.faceUp).not.toBe(true);
  });
});

describe("OP10-026 and OP10-027 Kin'emon", () => {
  /** `onBoard` pays with itself; the trash holds two of the other printing. */
  const kinemon = (seed: string, onBoard: string, inTrash: string) => {
    const game = table(seed)
      .withBoard("p1", [character("kinemon", onBoard)])
      .withTrash("p1", [
        instance("trash-1", inTrash),
        instance("trash-2", inTrash),
      ])
      .withHand("p1", [instance("big", "OP12-025")])
      .build();
    game.play({ type: "activate-main", optionId: "mechanic-main:kinemon" });
    // One Kin'emon from the trash, never two: the second is this Character.
    expect(effectOptions(game)).toEqual(["trash-1", "trash-2"]);
    game.play({ type: "resolve-effect", optionId: "trash-1" });
    answer(game, "big");

    expect(ids(game.state.players.p1.trash)).toEqual(["trash-2"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["kinemon", "trash-1"]);
    expect(ids(game.state.players.p1.board)).toEqual(["big"]);
  };

  it("OP10-026#1: the cost is this Character and one 0-power Kin'emon, not two from the trash", () => {
    kinemon("faq-op10-026-1", "OP10-026", "OP10-027");
  });

  it("OP10-027#1: the cost is this Character and one 1000-power Kin'emon, not two from the trash", () => {
    kinemon("faq-op10-027-1", "OP10-027", "OP10-026");
  });
});

describe("OP10-030 Smoker", () => {
  it("OP10-030#1: the ban is on Character effects, so the Smoker Leader still sets 2 DON!! active", () => {
    const game = table("faq-op10-030-1")
      .withLeader("p1", "OP10-001")
      .withBoard("p1", [character("smoker", "OP10-030")])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:smoker" });
    settle(game);
    expect(game.state.players.p1.restedDon).toHaveLength(3);

    game.play({
      type: "activate-main",
      optionId: activations(game, "p1-leader")[0],
    });
    settle(game);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("OP10-030#2: OP07-021 Urouge cannot set a DON!! active at the end of that turn", () => {
    const game = table("faq-op10-030-2")
      .withBoard("p1", [
        character("smoker", "OP10-030"),
        character("urouge", "OP07-021"),
      ])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:smoker" });
    settle(game);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    game.pass();
    settle(game);

    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("OP10-030#2 (control): without Smoker's ban Urouge sets one active", () => {
    const game = table("faq-op10-030-2-control")
      .withBoard("p1", [character("urouge", "OP07-021")])
      .withDon("p1", { rested: 3 })
      .build();
    game.pass();
    settle(game);

    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });
});

describe("OP10-032 Tashigi", () => {
  /** p2's EB03-036 Baby 5 K.O.s up to 2 Characters with base cost 3 or less. */
  const babyFive = (seed: string, tashigiRested: boolean) =>
    theirTurn(seed)
      .withBoard("p1", [
        character("tashigi", "OP10-032", { rested: tashigiRested }),
        character("bellamy", "OP05-035"),
      ])
      .withHand("p2", [instance("baby5", "EB03-036")])
      .build();

  const koBoth = (game: Game, first: string, second: string): void => {
    game.play({ type: "play-card", cardNumber: "EB03-036" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
    game.play({ type: "resolve-effect", optionId: first });
    game.play({ type: "resolve-effect", optionId: second });
  };

  it("OP10-032#1: a rested Tashigi cannot rest to save a green Character", () => {
    const game = babyFive("faq-op10-032-1", true);
    game.play({ type: "play-card", cardNumber: "EB03-036" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
    game.play({ type: "resolve-effect", optionId: "bellamy" });
    game.play({ type: "resolve-effect", optionId: "done" });

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.trash)).toEqual(["bellamy"]);
  });

  it("OP10-032#2: K.O.'d alongside a green Character, an active Tashigi rests to save it and is still K.O.'d", () => {
    // Tashigi is picked first: K.O.ing the targets one at a time in that
    // order would remove it before the other target was asked about.
    const game = babyFive("faq-op10-032-2", false);
    koBoth(game, "tashigi", "bellamy");
    expect(game.player).toBe("p1");
    expect(effectOptions(game, "p1")).toContain("replace:tashigi");
    game.play({ type: "resolve-effect", optionId: "replace:tashigi" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["bellamy"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["tashigi"]);
  });
});

it("OP10-041#1: Radio Knife can rest a cost-5 Character and then K.O. that same one", () => {
  const game = table("faq-op10-041-1")
    .withHand("p1", [instance("knife", "OP10-041")])
    .withBoard("p2", [character("sengoku", "OP10-031")])
    .build();

  game.play({ type: "activate-main", sourceCardNumber: "OP10-041" });
  game.play({ type: "resolve-effect", optionId: "sengoku" });
  expect(effectOptions(game)).toContain("sengoku");
  game.play({ type: "resolve-effect", optionId: "sengoku" });

  expect(game.state.players.p2.board).toEqual([]);
  expect(ids(game.state.players.p2.trash)).toEqual(["sengoku"]);
});

describe("OP10-042 Usopp", () => {
  /**
   * p2 swings at p1's rested OP10-090 Franky, which loses the fight; its
   * [On K.O.] plays OP10-044 Cub from the trash, whose [On Play] can bounce
   * p2's 1-cost Character.
   */
  const frankyFalls = (seed: string) => {
    const game = theirTurn(seed)
      .withLeader("p1", "OP10-042")
      .withBoard("p1", [character("franky", "OP10-090", { rested: true })])
      .withTrash("p1", [instance("cub", "OP10-044")])
      .withDeckTop("p1", [instance("drawn", "FIX-001")])
      .withBoard("p2", [
        character("attacker", "FIX-002"),
        character("small", "FIX-001"),
      ])
      .withGivenDon("p2", "attacker", 2)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "franky",
    });
    noDefence(game);
    return game;
  };

  it.fails(
    "OP10-042#1: the Leader's draw and a K.O.'d Character's [On K.O.] resolve in the order their controller picks",
    () => {
      // Engine: no ordering decision is offered. Franky's [On K.O.] opens
      // straight away and the Leader's reaction rule draws only after it --
      // and everything it caused -- has settled.
      const game = frankyFalls("faq-op10-042-1");
      expect(ids(game.state.players.p1.trash)).toContain("franky");
      expect(effectOptions(game, "p1")).not.toContain("cub");
    },
  );

  it("OP10-042#2: a {Dressrosa} Character K.O.'d by the opponent's attack draws a card", () => {
    const game = theirTurn("faq-op10-042-2")
      .withLeader("p1", "OP10-042")
      .withBoard("p1", [character("gilly", "OP10-054", { rested: true })])
      .withDeckTop("p1", [instance("drawn", "FIX-001")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withGivenDon("p2", "attacker", 2)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "gilly",
    });
    noDefence(game);
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["gilly"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  it.fails(
    "OP10-042#3: the Leader's draw resolves before the [On Play] of a Character an [On K.O.] played",
    () => {
      // Engine: the draw waits for the whole [On K.O.] chain. Cub's [On Play]
      // is offered while the hand is still empty, and the card is drawn only
      // once Cub has resolved.
      const game = frankyFalls("faq-op10-042-3");
      game.play({ type: "resolve-effect", optionId: "cub" });
      expect(ids(game.state.players.p1.board)).toEqual(["cub"]);
      expect(effectOptions(game, "p1")).toContain("apply");
      expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    },
  );

  /** p1's base-cost-3 Blue Gilly, 4 under p1's Usopp, on p2's turn. */
  const gillyTable = (seed: string) =>
    theirTurn(seed)
      .withLeader("p1", "OP10-042")
      .withBoard("p1", [character("gilly", "OP10-054")]);

  const gillyCost = (game: Game): number =>
    effectiveCost(game.state, "p1", game.state.players.p1.board[0]!);

  it("OP10-042#4: −2 cost from an opponent's effect takes a raised 4 to 2", () => {
    // The ruling's OP02-106 Tsuru is outside the pool; OP10-083 Kouzuki
    // Momonosuke gives the same −2 cost for the turn from an activated effect.
    const game = gillyTable("faq-op10-042-4")
      .withLeader("p2", "OP10-042")
      .withBoard("p2", [character("momo", "OP10-083")])
      .build();
    expect(gillyCost(game)).toBe(4);

    game.play({ type: "activate-main", optionId: "mechanic-main:momo" });
    answer(game, "apply", "p2-leader", "gilly");

    expect(gillyCost(game)).toBe(2);
  });

  it("OP10-042#5: −3 cost takes it to 1, which loses the Leader's +1, so 0", () => {
    const game = gillyTable("faq-op10-042-5")
      .withHand("p2", [instance("kaku", "OP07-080")])
      .withTrash("p2", copies(2, "OP07-089", "cp"))
      .build();
    expect(gillyCost(game)).toBe(4);

    game.play({ type: "play-card", cardNumber: "OP07-080" });
    answer(game, "apply", "cp-1", "cp-2", "gilly");

    expect(gillyCost(game)).toBe(0);
  });

  it("OP10-042#6: the turn player's −3 cost aura applies first, so the Leader's +1 never does", () => {
    // OP03-078 Issho is outside the pool; P-032 Sengoku (−2) and OP07-081
    // Kalifa (−1) are the same [DON!! x1] [Your Turn] continuous effect.
    const game = gillyTable("faq-op10-042-6")
      .withBoard("p2", [
        character("sengoku", "P-032"),
        character("kalifa", "OP07-081"),
      ])
      .withGivenDon("p2", "sengoku", 1)
      .withGivenDon("p2", "kalifa", 1)
      .build();

    expect(gillyCost(game)).toBe(0);
  });
});

it("OP10-049#1: K.O.'d alongside another Character, Sabo returns to hand to save it", () => {
  // p2's OP08-077 Conquest of the Sea K.O.s up to 2 Characters of cost 6 or
  // less behind an {Animal Kingdom Pirates} Leader (OP08-079 Kaido). Sabo is
  // picked first: K.O.ing the targets one at a time in that order would
  // remove it before the other target was asked about.
  const game = theirTurn("faq-op10-049-1")
    .withBoard("p1", [
      character("sabo", "OP10-049"),
      character("gilly", "OP10-054"),
    ])
    .withLeader("p2", "OP08-079")
    .withHand("p2", [instance("conquest", "OP08-077")])
    .build();

  game.play({ type: "activate-main", sourceCardNumber: "OP08-077" });
  game.play({ type: "resolve-effect", optionId: "return-don:active" });
  game.play({ type: "resolve-effect", optionId: "return-don:active" });
  game.play({ type: "resolve-effect", optionId: "sabo" });
  game.play({ type: "resolve-effect", optionId: "gilly" });

  expect(game.player).toBe("p1");
  expect(effectOptions(game, "p1")).toContain("replace:sabo");
  game.play({ type: "resolve-effect", optionId: "replace:sabo" });
  settle(game);

  expect(ids(game.state.players.p1.board)).toEqual(["gilly"]);
  expect(ids(game.state.players.p1.hand)).toEqual(["sabo"]);
  expect(game.state.players.p1.trash).toEqual([]);
});

describe("OP10-057 Leo", () => {
  it("OP10-057#1: with no {Dressrosa} card found, a card is still trashed from hand", () => {
    const game = table("faq-op10-057-1")
      .withLeader("p1", "OP10-042")
      .withHand("p1", [
        instance("leo", "OP10-057"),
        instance("keep", "FIX-002"),
      ])
      .withDeckTop("p1", copies(5, "FIX-001", "top"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-057" });
    answer(game, "apply", "p1-leader", "done", "keep");

    expect(ids(game.state.players.p1.hand)).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(["keep"]);
    expect(game.state.players.p1.deck).toHaveLength(5);
  });
});

describe("OP10-058 Rebecca", () => {
  /** p2's OP12-082 Issho is the cost-8 Character Rebecca's draw asks for. */
  const rebecca = (
    seed: string,
    board: ReturnType<typeof character>[],
    hand: ReturnType<typeof instance>[],
  ) =>
    table(seed)
      .withLeader("p1", "OP10-042")
      .withBoard("p1", board)
      .withHand("p1", [instance("rebecca", "OP10-058"), ...hand])
      .withDeckTop("p1", [instance("drawn", "FIX-001")])
      .withBoard("p2", [
        character("issho", "OP12-082"),
        character("small", "FIX-001"),
      ])
      .build();

  it("OP10-058#1: a single revealed cost-4 Character is played active", () => {
    const game = rebecca(
      "faq-op10-058-1",
      [],
      [instance("franky", "OP10-090")],
    );
    game.play({ type: "play-card", cardNumber: "OP10-058" });
    answer(game, "franky", "done");

    const franky = game.state.players.p1.board.find(
      (card) => card.instanceId === "franky",
    );
    expect(franky?.rested).toBe(false);
  });

  it.fails(
    "OP10-058#2: the two played Characters' [On Play]s resolve in the order their controller picks",
    () => {
      // Engine: each Character's [On Play] resolves the moment it is played,
      // inside Rebecca's effect, so the active one always goes first and the
      // rested one is not even on the field yet when it does.
      const game = rebecca(
        "faq-op10-058-2",
        [],
        [instance("cub", "OP10-044"), instance("moocy", "OP10-043")],
      );
      game.play({ type: "play-card", cardNumber: "OP10-058" });
      game.play({ type: "resolve-effect", optionId: "cub" });
      game.play({ type: "resolve-effect", optionId: "moocy" });
      game.play({ type: "resolve-effect", optionId: "done" });
      game.play({ type: "resolve-effect", optionId: "cub" });

      expect(ids(game.state.players.p1.board)).toEqual([
        "rebecca",
        "cub",
        "moocy",
      ]);
    },
  );

  it.fails(
    "OP10-058#3: a Character trashed to make room for the second play does not get its [On Play]",
    () => {
      // Engine: Cub's [On Play] is offered as soon as Cub is played, before
      // Moocy is played and Cub is trashed to make room for it.
      const game = rebecca(
        "faq-op10-058-3",
        [
          character("a", "FIX-001"),
          character("b", "FIX-001"),
          character("c", "FIX-001"),
        ],
        [instance("cub", "OP10-044"), instance("moocy", "OP10-043")],
      );
      game.play({ type: "play-card", cardNumber: "OP10-058" });
      game.play({ type: "resolve-effect", optionId: "cub" });
      game.play({ type: "resolve-effect", optionId: "moocy" });
      game.play({ type: "resolve-effect", optionId: "done" });
      game.play({ type: "resolve-effect", optionId: "cub" });

      expect(effectOptions(game)).toContain("cub");
      expect(effectOptions(game)).not.toContain("apply");
    },
  );
});

it("OP10-067#1: with no Event recovered, a DON!! is still set active", () => {
  const game = table("faq-op10-067-1")
    .withHand("p1", [instance("pink", "OP10-067")])
    .build();

  game.play({ type: "play-card", cardNumber: "OP10-067" });
  // Five DON!! rested to play Senor Pink.
  expect(game.state.players.p1.restedDon).toHaveLength(5);
  answer(game, "apply", "return-don:rested");

  expect(game.state.players.p1.hand).toEqual([]);
  expect(game.state.players.p1.donDeck).toHaveLength(1);
  expect(fieldDonCount(game.state, "p1")).toBe(9);
  expect(game.state.players.p1.restedDon).toHaveLength(3);
});

it("OP10-069#1: returning the one given DON!! for the DON!! −1 leaves nothing to K.O. with", () => {
  const game = table("faq-op10-069-1")
    .withBoard("p1", [character("fish", "OP10-069")])
    .withGivenDon("p1", "fish", 1)
    .withDonDeck("p1", 9)
    .withBoard("p2", [character("small", "FIX-001")])
    .withLife("p2", copies(2, "FIX-001", "p2-life"))
    .build();
  expect(fieldDonCount(game.state, "p1")).toBe(1);

  game.play({
    type: "attack",
    attackerInstanceId: "fish",
    targetInstanceId: "p2-leader",
  });
  game.play({ type: "resolve-effect", optionId: "apply" });
  settle(game);

  expect(fieldDonCount(game.state, "p1")).toBe(0);
  expect(ids(game.state.players.p2.board)).toEqual(["small"]);
});

describe("OP10-070 Trebol", () => {
  /**
   * p1's EB01-061 Mr.2.Bon.Kurei (1000 base power) copies p2's 5000-power
   * Character as it attacks; p2 answers with OP10-040, whose [Counter] K.O.s
   * a rested Character of cost 7 or less.
   */
  const bonKureiAttacks = (seed: string, trebol: boolean) => {
    const game = table(seed)
      .withBoard("p1", [character("bon", "EB01-061")])
      .withHand("p1", [instance("trebol", "OP10-070")])
      .withBoard("p2", [character("big", "OP10-054")])
      .withHand("p2", [instance("weak", "OP10-040")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    if (trebol) {
      game.play({ type: "play-card", cardNumber: "OP10-070" });
      settle(game);
    }
    game.play({
      type: "attack",
      attackerInstanceId: "bon",
      targetInstanceId: "p2-leader",
    });
    answer(game, "big");
    expect(currentPower(game.state, "p1", "bon")).toBe(5000);
    game.pass();
    game.play({ type: "activate-counter-event" });
    if (effectOptions(game).includes("bon")) {
      game.play({ type: "resolve-effect", optionId: "bon" });
    }
    settle(game);
    return game;
  };

  it("OP10-070#1: a protected Character whose base power is raised that turn still cannot be K.O.'d by the opponent", () => {
    const game = bonKureiAttacks("faq-op10-070-1", true);
    expect(ids(game.state.players.p1.board)).toContain("bon");
  });

  it("OP10-070#1 (control): without Trebol the [Counter] K.O.s it", () => {
    const game = bonKureiAttacks("faq-op10-070-1-control", false);
    expect(ids(game.state.players.p1.trash)).toContain("bon");
  });
});

it("OP10-071#1: two Doflamingos each rest a DON!! to add one, the second paying with the first's", () => {
  const game = theirTurn("faq-op10-071-1")
    .withBoard("p1", [
      character("doffy-1", "OP10-071"),
      character("doffy-2", "OP10-071"),
    ])
    .withDon("p1", { rested: 7 })
    .withDonDeck("p1", 2)
    .withBoard("p2", [character("attacker", "FIX-002")])
    .build();
  expect(game.state.players.p1.activeDon).toHaveLength(1);

  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  // Each copy's [Once Per Turn] is its own, so both answer the one attack.
  answer(game, "apply");

  expect(game.state.players.p1.donDeck).toEqual([]);
  expect(fieldDonCount(game.state, "p1")).toBe(10);
});

describe("OP10-087 Chopper, OP10-091 Brook and OP10-095 Zoro", () => {
  /** p1 behind the {Dressrosa} Usopp Leader, two cards on top of its deck. */
  const dressrosa = (seed: string) =>
    table(seed)
      .withLeader("p1", "OP10-042")
      .withDeckTop("p1", [
        instance("top-1", "FIX-001"),
        instance("top-2", "FIX-001"),
      ]);

  it("OP10-087#1: against a hand of 4 the deck is not trashed either", () => {
    const game = dressrosa("faq-op10-087-1")
      .withBoard("p1", [character("chopper", "OP10-087")])
      .withHand("p2", copies(4, "FIX-001", "p2-hand"))
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:chopper" });
    answer(game, "apply", "p1-leader");

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(ids(game.state.players.p1.deck)).toEqual(["top-1", "top-2"]);
    expect(game.state.players.p1.trash).toEqual([]);
  });

  it("OP10-087#1 (control): against a hand of 5 one is trashed and so are 2 from the deck", () => {
    const game = dressrosa("faq-op10-087-1-control")
      .withBoard("p1", [character("chopper", "OP10-087")])
      .withHand("p2", copies(5, "FIX-001", "p2-hand"))
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:chopper" });
    answer(game, "apply", "p1-leader", "p2-hand-1");

    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(ids(game.state.players.p1.trash)).toEqual(["top-1", "top-2"]);
  });

  it("OP10-091#1: Brook trashes 2 from the deck with no K.O.", () => {
    const game = dressrosa("faq-op10-091-1")
      .withBoard("p1", [character("brook", "OP10-091")])
      .withBoard("p2", [character("small", "FIX-001")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:brook" });
    answer(game, "apply", "p1-leader", "done");

    expect(ids(game.state.players.p2.board)).toEqual(["small"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["top-1", "top-2"]);
  });

  it("OP10-095#1: Zoro trashes 2 from the deck with no K.O.", () => {
    const game = dressrosa("faq-op10-095-1")
      .withHand("p1", [instance("zoro", "OP10-095")])
      .withBoard("p2", [character("small", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-095" });
    answer(game, "apply", "p1-leader", "done");

    expect(ids(game.state.players.p2.board)).toEqual(["small"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["top-1", "top-2"]);
  });
});

it("OP10-097#1: with 9 cards in the trash, the Event itself makes the tenth and [Banish] is gained", () => {
  const game = table("faq-op10-097-1")
    .withBoard("p1", [character("gilly", "OP10-054")])
    .withHand("p1", [instance("rhino", "OP10-097")])
    .withTrash("p1", copies(9, "FIX-001", "trash"))
    .build();

  game.play({ type: "activate-main", sourceCardNumber: "OP10-097" });
  answer(game, "gilly");

  expect(game.state.players.p1.trash).toHaveLength(10);
  expect(currentPower(game.state, "p1", "gilly")).toBe(7000);
  expect(hasKeyword(game.state, "p1", "gilly", "Banish")).toBe(true);
});

describe("OP10-098 Liberation", () => {
  /**
   * p2 swings at p1's Leader with `attacker`; the Life card it takes is
   * Liberation, whose [Trigger] negates up to 1 Leader and 1 Character.
   */
  const liberationTrigger = (
    seed: string,
    board: ReturnType<typeof character>[],
    hand: ReturnType<typeof instance>[] = [],
  ) =>
    theirTurn(seed)
      .withLife("p1", [
        instance("liberation", "OP10-098"),
        instance("p1-life-2", "FIX-001"),
      ])
      .withHand("p1", [instance("weak", "OP10-040")])
      .withBoard("p2", board)
      .withHand("p2", hand)
      .withDeckTop("p2", [instance("p2-top", "FIX-001")])
      .build();

  const triggerOn = (game: Game, attacker: string, negate: string): void => {
    game.play({
      type: "attack",
      attackerInstanceId: attacker,
      targetInstanceId: "p1-leader",
    });
    noDefence(game);
    expect(game.state.phase).toBe("trigger");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    answer(game, "done-leader", negate, "done");
  };

  it("OP10-098#3: a negated Character K.O.'d that turn does not get its [On K.O.]", () => {
    // OP10-005 Sanji draws on [On K.O.]; p1 K.O.s it with OP10-040's [Counter].
    const game = liberationTrigger("faq-op10-098-3", [
      character("sanji", "OP10-005"),
    ]);
    triggerOn(game, "sanji", "sanji");
    // Negated, so its [Your Turn] +3000 is gone too.
    expect(currentPower(game.state, "p2", "sanji")).toBe(3000);

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["sanji"]);
    expect(game.state.players.p2.hand).toEqual([]);
    expect(ids(game.state.players.p2.deck)).toEqual(["p2-top"]);
  });

  it("OP10-098#4: negating a Character leaves the +2000 another card gave it", () => {
    // p2's own OP05-020 gives its 4000 Character +2000 for the turn first.
    const game = liberationTrigger(
      "faq-op10-098-4",
      [character("captain", "FIX-002")],
      [instance("fist", "OP05-020")],
    );
    game.play({ type: "activate-main", sourceCardNumber: "OP05-020" });
    answer(game, "captain", "done");
    expect(currentPower(game.state, "p2", "captain")).toBe(6000);

    triggerOn(game, "captain", "captain");

    expect(currentPower(game.state, "p2", "captain")).toBe(6000);
  });

  /**
   * p1 plays OP07-080 Kaku for −3 cost on `shrunk`, then holds Liberation with
   * one Character against p2's three.
   */
  const shrunk = (seed: string, target: string) => {
    const game = table(seed)
      .withHand("p1", [
        instance("kaku", "OP07-080"),
        instance("liberation", "OP10-098"),
      ])
      .withTrash("p1", copies(2, "OP07-089", "cp"))
      .withBoard("p2", [
        character("shrunk", target),
        character("captain", "FIX-002"),
        character("deckhand", "FIX-001"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP07-080" });
    answer(game, "apply", "cp-1", "cp-2", "shrunk");
    game.play({ type: "activate-main", sourceCardNumber: "OP10-098" });
    return game;
  };

  it("OP10-098#5: a base-cost-7 Character lowered to 4 is not in reach of the base-cost-6 K.O.", () => {
    // OP10-050 Hajrudin, base cost 7.
    const game = shrunk("faq-op10-098-5", "OP10-050");
    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(4);

    expect(effectOptions(game)).not.toContain("shrunk");
    expect(effectOptions(game)).toContain("captain");
  });

  it("OP10-098#6: a base-cost-5 Character lowered to 2 is not in reach of the base-cost-4 K.O.", () => {
    // OP10-031 Sengoku, base cost 5: inside the first K.O.'s reach, outside
    // the second's.
    const game = shrunk("faq-op10-098-6", "OP10-031");
    expect(effectOptions(game)).toContain("shrunk");
    game.play({ type: "resolve-effect", optionId: "captain" });

    expect(effectOptions(game)).not.toContain("shrunk");
    expect(effectOptions(game)).toContain("deckhand");
  });
});

it("OP10-099#1: an already active {Supernovas} Character still gains [Blocker]", () => {
  const game = table("faq-op10-099-1")
    .withLeader("p1", "OP10-099")
    .withBoard("p1", [character("urouge", "OP10-101")])
    .withLife("p1", copies(2, "FIX-001", "p1-life"))
    .build();

  game.pass();
  expect(effectOptions(game)).toContain("urouge");
  game.play({ type: "resolve-effect", optionId: "urouge" });
  settle(game);
  expect(game.state.turnPlayerId).toBe("p2");

  expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
  expect(hasKeyword(game.state, "p1", "urouge", "Blocker")).toBe(true);
});

describe("Life-count [Trigger]s exclude the card itself", () => {
  /** p2 swings at p1's Leader and turns over `trigger` from three Life cards. */
  const lifeTrigger = (
    seed: string,
    leader: string,
    trigger: string,
    opponentLife: number,
  ) => {
    const game = theirTurn(seed)
      .withLeader("p1", leader)
      .withLife("p1", [
        instance("trigger", trigger),
        instance("p1-life-2", "FIX-001"),
        instance("p1-life-3", "FIX-001"),
      ])
      .withLife("p2", copies(opponentLife, "FIX-001", "p2-life"))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    noDefence(game);
    expect(game.state.phase).toBe("trigger");
    return game;
  };

  it("OP10-100#1: Inazuma plays at 2 + 3 Life left, with itself out of the count", () => {
    // OP07-001 Monkey.D.Dragon is a {Revolutionary Army} Leader.
    const game = lifeTrigger("faq-op10-100-1", "OP07-001", "OP10-100", 3);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["trigger"]);
  });

  it("OP10-110#1: Heat & Wire plays at 2 Life left, with itself out of the count", () => {
    const game = lifeTrigger("faq-op10-110-1", "FIX-LEADER-R", "OP10-110", 3);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["trigger"]);
  });
});

it("OP10-102#1: with no Life cards Ivankov's +1000 still lands", () => {
  const game = table("faq-op10-102-1")
    .withBoard("p1", [
      character("ivankov", "OP10-102"),
      character("hack", "OP05-012"),
    ])
    .build();
  expect(game.state.players.p1.life).toEqual([]);

  game.play({ type: "activate-main", optionId: "mechanic-main:ivankov" });
  answer(game, "hack", "done");

  expect(currentPower(game.state, "p1", "hack")).toBe(6000);
});

describe("OP10-116 Damned Punk", () => {
  it("OP10-116#1: with no Life cards to look at, the K.O. still happens", () => {
    const game = table("faq-op10-116-1")
      .withHand("p1", [instance("punk", "OP10-116")])
      .withBoard("p2", [character("sengoku", "OP10-031")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP10-116" });
    answer(game, "own-life", "sengoku");

    expect(ids(game.state.players.p2.trash)).toEqual(["sengoku"]);
  });

  it("OP10-116#2: a face-up Life card looked at stays face-up, and the K.O. still happens", () => {
    const game = table("faq-op10-116-2")
      .withHand("p1", [instance("punk", "OP10-116")])
      .withLife("p1", [
        instance("face-up", "FIX-001", { faceUp: true }),
        instance("p1-life-2", "FIX-001"),
      ])
      .withBoard("p2", [character("sengoku", "OP10-031")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP10-116" });
    answer(game, "own-life", "bottom", "sengoku");

    expect(ids(game.state.players.p1.life)).toEqual(["p1-life-2", "face-up"]);
    expect(game.state.players.p1.life[1]?.faceUp).toBe(true);
    expect(ids(game.state.players.p2.trash)).toEqual(["sengoku"]);
  });
});

describe("OP10-118 Monkey.D.Luffy", () => {
  it("OP10-118#1: the first K.O. by an opponent's effect is prevented with no choice to allow it", () => {
    // p2's OP08-077 Conquest of the Sea, behind the OP08-079 Kaido Leader.
    const game = theirTurn("faq-op10-118-1")
      .withBoard("p1", [character("luffy", "OP10-118")])
      .withLeader("p2", "OP08-079")
      .withHand("p2", [instance("conquest", "OP08-077")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP08-077" });
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
    game.play({ type: "resolve-effect", optionId: "luffy" });
    expect(game.player).toBe("p1");
    expect(effectOptions(game, "p1")).toEqual(["replace:luffy"]);
    game.play({ type: "resolve-effect", optionId: "replace:luffy" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["luffy"]);
  });

  it("OP10-118#2: against a hand of 4, the 3 cards still go to the bottom of the deck and nothing else happens", () => {
    const game = table("faq-op10-118-2")
      .withBoard("p1", [character("luffy", "OP10-118")])
      .withTrash("p1", copies(3, "FIX-001", "trash"))
      .withHand("p2", copies(4, "FIX-001", "p2-hand"))
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    answer(game, "apply", "trash-1", "trash-2", "trash-3");

    expect(game.state.players.p1.trash).toEqual([]);
    expect(ids(game.state.players.p1.deck)).toEqual([
      "trash-1",
      "trash-2",
      "trash-3",
    ]);
    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(game.state.players.p2.trash).toEqual([]);
  });
});

it("OP10-119#1: behind a non-{Supernovas} Leader a {Supernovas} card still goes to Life", () => {
  const game = table("faq-op10-119-1")
    .withHand("p1", [
      instance("law", "OP10-119"),
      instance("urouge", "OP10-101"),
    ])
    .withLife("p1", [instance("p1-life-1", "FIX-001")])
    .build();

  game.play({ type: "play-card", cardNumber: "OP10-119" });
  answer(game, "urouge");

  expect(ids(game.state.players.p1.life)).toEqual(["urouge", "p1-life-1"]);
  expect(game.state.players.p1.life[0]?.faceUp).not.toBe(true);
  expect(game.state.players.p1.leaderAttachedDon).toEqual([]);
});
