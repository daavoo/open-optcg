import { describe, expect, it } from "vitest";
import { currentPower } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for BOOSTER PACK -AWAKENING OF THE NEW ERA- [OP-05],
 * one case per ruling, named by the Q&A id (`<card>#<n>`, in the order the
 * PDF prints them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. Comments paraphrase the ruling and the cards rather
 * than quoting them: the repository holds none of Bandai's text. A ruling the
 * engine disagrees with is an `it.fails` that says what the engine does
 * instead, so it flips the day the engine is fixed.
 *
 * Several rulings name a card the engine does not register (OP01-094 Kaido,
 * ST02-010 Basil Hawkins, OP03-076 Rob Lucci, OP03-088 Fukurou, OP04-082
 * Kyros, OP03-118 Ikoku Sovereignty, OP01-047 Trafalgar Law). Those positions
 * are built on a registered card that prints the same shape of clause, named
 * beside the case.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op05.pdf
 */

/** Rulings with no engine decision and no observable consequence to assert. */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {
  "OP05-101#1":
    "No [Holly] card is registered, so Ohm's play from hand has no card to " +
    "offer. The program agrees with the ruling as written: the play step " +
    "follows the dig unconditionally (mechanics/op05-on-play.ts).",
  "OP05-107#1":
    "Lieutenant Spacey's clause is [Your Turn], and no registered card makes " +
    "a player check their own Life Trigger on their own turn, so a Trigger " +
    "that adds itself to hand cannot happen while Spacey is listening.",
};

const RED = "FIXTURE-RED";
const BLUE = "FIXTURE-BLUE";

/** p1 to act in its Main Phase, both sides bare, all ten DON!! active. */
const myTurn = (seed: string) =>
  scenario()
    .decks(RED, BLUE)
    .seed(seed)
    .atTurn(3, { active: "p1" })
    .bareTable();

/** p2 to act in its Main Phase, for the clauses p1 answers on p2's turn. */
const theirTurn = (seed: string) =>
  scenario()
    .decks(RED, BLUE)
    .seed(seed)
    .atTurn(4, { active: "p2" })
    .bareTable();

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const onBoard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.some(
    (card) => card.instanceId === instanceId,
  );

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

const offered = (game: Game, type: LegalAction["type"]) =>
  game.legalActions().filter((action) => action.type === type);

function attackers(game: Game): string[] {
  return game
    .legalActions()
    .flatMap((action) =>
      action.type === "attack" ? [action.attackerInstanceId] : [],
    );
}

function blockers(game: Game): string[] {
  return game
    .legalActions()
    .flatMap((action) =>
      action.type === "block" ? [action.blockerInstanceId] : [],
    );
}

const attack = (game: Game, attacker: string, target: string): void => {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
};

/** Picks one card in an open effect choice, by instance id. */
const choose = (game: Game, instanceId: string): void => {
  game.play(
    (action) =>
      action.type === "resolve-effect" &&
      action.option.kind === "card" &&
      action.option.card.instanceId === instanceId,
  );
};

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 60) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Passes the Block and Counter steps while nothing is pending. */
function passDefence(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    !game.state.pendingEffect &&
    !game.legalActions().some((action) => action.type === "resolve-trigger")
  ) {
    if (guard++ > 20) throw new Error("battle never settled");
    game.pass();
  }
}

const useEvent = (game: Game, cardNumber: string): void => {
  game.play({ type: "activate-main", sourceCardNumber: cardNumber });
};

describe("FAQ OP05 Red", () => {
  describe("OP05-001 Sabo (Leader)", () => {
    /**
     * p2's 7000 swings at p1's rested 4000 `small`; p1 leads with Sabo and one
     * DON!! given to it, and holds `extra` as a second rested target.
     */
    const sabo = (seed: string) =>
      theirTurn(seed)
        .withLeader("p1", "OP05-001")
        .withGivenDon("p1", "p1-leader", 1)
        .withBoard("p1", [
          character("small", "FIX-002", { rested: true }),
          character("big", "OP05-012", { rested: true }),
          character("big-2", "OP05-012", { rested: true }),
        ])
        .withHand("p1", [instance("counter", "FIX-001")])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", [
          character("attacker", "FIX-002"),
          character("attacker-2", "FIX-002"),
        ])
        .withGivenDon("p2", "attacker", 3)
        .withGivenDon("p2", "attacker-2", 3)
        .build();

    it("OP05-001#1: a 4000 Countered up to 5000 is saved by the −1000 instead", () => {
      // The 5000 is read when the K.O. would happen, not off the base power.
      const game = sabo("faq-op05-001-1");
      attack(game, "attacker", "small");
      game.pass(); // no block
      game.play({ type: "counter", cardInstanceId: "counter" });
      game.pass();

      expect(effectOptions(game)).toContain("mechanic:small:p1-leader");
      game.play({
        type: "resolve-effect",
        optionId: "mechanic:small:p1-leader",
      });
      settle(game);
      expect(onBoard(game, "p1", "small")).toBe(true);
    });

    it("OP05-001#2: declining the replacement leaves its [Once Per Turn] for a later K.O.", () => {
      const game = sabo("faq-op05-001-2");
      attack(game, "attacker", "big");
      passDefence(game);
      expect(effectOptions(game)).toContain("mechanic:big:p1-leader");
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          !action.optionId.startsWith("mechanic:"),
      );
      settle(game);
      expect(onBoard(game, "p1", "big")).toBe(false);

      attack(game, "attacker-2", "big-2");
      passDefence(game);
      expect(effectOptions(game)).toContain("mechanic:big-2:p1-leader");
    });
  });

  it("OP05-002#1: Belo Betty's [Activate: Main] cannot pick the Leader", () => {
    const game = myTurn("faq-op05-002-1")
      .withLeader("p1", "OP05-002")
      .withBoard("p1", [character("hack", "OP05-012")])
      .withHand("p1", [instance("fodder", "OP05-003")])
      .build();
    game.play({ type: "activate-main", summary: "Belo Betty" });
    choose(game, "fodder");

    const cards = game
      .legalActions()
      .flatMap((action) =>
        action.type === "resolve-effect" && action.option.kind === "card"
          ? [action.option.card.instanceId]
          : [],
      );
    expect(cards).toContain("hack");
    expect(cards).not.toContain("p1-leader");
  });

  describe("OP05-003 Inazuma", () => {
    it("OP05-003#1: losing the other 7000 after the play takes [Rush] away", () => {
      // OP05-027 Trafalgar Law with five DON!! is the 7000; it trashes itself.
      const game = myTurn("faq-op05-003-1")
        .withBoard("p1", [character("law", "OP05-027")])
        .withGivenDon("p1", "law", 5)
        .withHand("p1", [instance("inazuma", "OP05-003")])
        .withBoard("p2", [character("target", "FIX-001")])
        .build();
      game.play({ type: "play-card", cardNumber: "OP05-003" });
      settle(game);
      expect(attackers(game)).toContain("inazuma");

      game.play({ type: "activate-main", summary: "Trafalgar Law" });
      settle(game);
      expect(onBoard(game, "p1", "law")).toBe(false);
      expect(attackers(game)).not.toContain("inazuma");
    });

    it("OP05-003#2: the battle goes on when the other 7000 shrinks mid-attack", () => {
      // p2's OP05-099 Amazon answers the attack; with no Life left p1 takes
      // its −2000, which p2 puts on the 7000.
      const game = myTurn("faq-op05-003-2")
        .withBoard("p1", [character("law", "OP05-027")])
        .withGivenDon("p1", "law", 5)
        .withHand("p1", [instance("inazuma", "OP05-003")])
        .withBoard("p2", [character("amazon", "OP05-099")])
        .withLife("p2", copies(2, "FIX-001", "p2-life"))
        .build();
      game.play({ type: "play-card", cardNumber: "OP05-003" });
      settle(game);
      game.play({ type: "attach-don", targetInstanceId: "inazuma" });
      attack(game, "inazuma", "p2-leader");
      game.play({ type: "resolve-effect", optionId: "apply" });
      choose(game, "law");
      settle(game);
      expect(currentPower(game.state, "p1", "law")).toBe(5_000);

      expect(game.state.activeAttack?.attackerInstanceId).toBe("inazuma");
      passDefence(game);
      expect(game.state.players.p2.life).toHaveLength(1);
    });

    it("OP05-003#3: a 7000 arriving later in the turn gives [Rush] then", () => {
      const game = myTurn("faq-op05-003-3")
        .withBoard("p1", [character("law", "OP05-027")])
        .withGivenDon("p1", "law", 4)
        .withHand("p1", [instance("inazuma", "OP05-003")])
        .build();
      game.play({ type: "play-card", cardNumber: "OP05-003" });
      settle(game);
      expect(attackers(game)).not.toContain("inazuma");

      game.play({ type: "attach-don", targetInstanceId: "law" });
      expect(attackers(game)).toContain("inazuma");
    });
  });

  it("OP05-005#1: Karasu's [When Attacking] needs no Revolutionary Army Leader", () => {
    const game = myTurn("faq-op05-005-1")
      .withBoard("p1", [character("karasu", "OP05-005")])
      .withGivenDon("p1", "karasu", 2)
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    attack(game, "karasu", "p2-leader");
    choose(game, "p2-leader");
    settle(game);
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(4_000);
  });

  describe("OP05-007 Sabo", () => {
    it("OP05-007#1: one 4000 is within the 4000 total", () => {
      const game = myTurn("faq-op05-007-1")
        .withHand("p1", [instance("sabo", "OP05-007")])
        .withBoard("p2", [character("four", "FIX-002")])
        .build();
      game.play({ type: "play-card", cardNumber: "OP05-007" });
      choose(game, "four");
      settle(game);
      expect(onBoard(game, "p2", "four")).toBe(false);
    });

    it("OP05-007#2: a −2000 and a 6000 add up to 4000", () => {
      // OP05-019 Fire Fist at three Life takes `minus` to −2000 and K.O.s
      // nothing; OP05-008 Chaka is the 6000.
      const game = myTurn("faq-op05-007-2")
        .withHand("p1", [
          instance("fist", "OP05-019"),
          instance("sabo", "OP05-007"),
        ])
        .withLife("p1", copies(3, "FIX-001", "p1-life"))
        .withBoard("p2", [
          character("minus", "FIX-001"),
          character("chaka", "OP05-008"),
        ])
        .build();
      useEvent(game, "OP05-019");
      choose(game, "minus");
      settle(game);
      expect(currentPower(game.state, "p2", "minus")).toBe(-2_000);

      game.play({ type: "play-card", cardNumber: "OP05-007" });
      choose(game, "minus");
      choose(game, "chaka");
      settle(game);
      expect(ids(game.state.players.p2.board)).toEqual([]);
    });
  });

  it("OP05-001#3: one use saves two 5000s a single K.O. takes together, −1000 each", () => {
    // OP08-119 Kaido & Linlin's [When Attacking] stands in for OP01-094
    // Kaido's [On Play]: both K.O. every other Character at once.
    const game = theirTurn("faq-op05-001-3")
      .withLeader("p1", "OP05-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p1", [
        character("hack-1", "OP05-012"),
        character("hack-2", "OP05-012"),
      ])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("kaido", "OP08-119")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    attack(game, "kaido", "p1-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (
      game.state.pendingEffect &&
      !effectOptions(game).some((id) => id.startsWith("replace:"))
    ) {
      game.play({ type: "resolve-effect" });
    }
    game.play({ type: "resolve-effect", optionId: "replace:p1-leader" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["hack-1", "hack-2"]);
    expect(currentPower(game.state, "p1", "hack-1")).toBe(4_000);
    expect(currentPower(game.state, "p1", "hack-2")).toBe(4_000);
  });

  it("OP05-008#1: Chaka's two DON!! go to one card, not one each to the Leader and a Character", () => {
    const game = myTurn("faq-op05-008-1")
      .withBoard("p1", [
        character("chaka", "OP05-008"),
        character("other", "FIX-001"),
      ])
      .withGivenDon("p1", "chaka", 1)
      .withDon("p1", { rested: 2 })
      .build();
    game.play({ type: "activate-main", summary: "Chaka" });
    game.play({ type: "resolve-effect", summary: "Leader" });
    settle(game);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(2);
    const other = game.state.players.p1.board.find(
      (c) => c.instanceId === "other",
    );
    expect(other?.attachedDon ?? []).toHaveLength(0);
  });

  it("OP05-019#1: Fire Fist's −4000 and its K.O. may land on different Characters", () => {
    // The first Fire Fist, at three Life, leaves `zero` at −2000 and K.O.s
    // nothing; the second, at two, shrinks `other` and K.O.s `zero`.
    const game = myTurn("faq-op05-019-1")
      .withHand("p1", copies(2, "OP05-019", "fist"))
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [
        character("zero", "FIX-001"),
        character("other", "OP05-008"),
      ])
      .build();
    useEvent(game, "OP05-019");
    choose(game, "zero");
    game.play({ type: "resolve-effect", optionId: "done" });
    settle(game);
    expect(onBoard(game, "p2", "zero")).toBe(true);

    useEvent(game, "OP05-019");
    choose(game, "other");
    choose(game, "zero");
    settle(game);
    expect(onBoard(game, "p2", "zero")).toBe(false);
    expect(onBoard(game, "p2", "other")).toBe(true);
    expect(currentPower(game.state, "p2", "other")).toBe(2_000);
  });
});

describe("FAQ OP05 Green", () => {
  it("OP05-022#1: a Leader that blocks and loses the battle takes the damage", () => {
    const game = theirTurn("faq-op05-022-1")
      .withLeader("p1", "OP05-022")
      .withBoard("p1", [character("rested", "FIX-001", { rested: true })])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withGivenDon("p2", "attacker", 3)
      .build();
    attack(game, "attacker", "rested");
    game.play({ type: "block", blockerInstanceId: "p1-leader" });
    passDefence(game);

    expect(game.state.players.p1.life).toHaveLength(1);
    expect(onBoard(game, "p1", "rested")).toBe(true);
  });

  describe("OP05-030 Donquixote Rosinante", () => {
    it("OP05-030#1: trashed instead of K.O.'d, it still battled the attacker", () => {
      // OP12-020 Roronoa Zoro's Leader stands in for ST02-010 Basil Hawkins:
      // its [Activate: Main] asks whether it battled a Character this turn.
      const game = theirTurn("faq-op05-030-1")
        .withBoard("p1", [character("rosinante", "OP05-030", { rested: true })])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withLeader("p2", "OP12-020")
        .withGivenDon("p2", "p2-leader", 3)
        .build();
      attack(game, "p2-leader", "rosinante");
      passDefence(game);
      game.play({
        type: "resolve-effect",
        summary: "Trash Donquixote Rosinante",
      });
      settle(game);
      expect(onBoard(game, "p1", "rosinante")).toBe(false);
      expect(ids(game.state.players.p1.trash)).toContain("rosinante");

      expect(game.state.players.p2.leaderRested).toBe(true);
      game.play({ type: "activate-main", summary: "Roronoa Zoro" });
      settle(game);
      expect(game.state.players.p2.leaderRested).toBe(false);
    });

    it("OP05-030#2: one trash saves two rested Characters a single K.O. takes together", () => {
      // OP08-119 Kaido & Linlin's [When Attacking] stands in for OP01-094
      // Kaido's [On Play]: both K.O. every other Character at once,
      // Rosinante included.
      const game = theirTurn("faq-op05-030-2")
        .withBoard("p1", [
          character("rosinante", "OP05-030"),
          character("rested-1", "FIX-001", { rested: true }),
          character("rested-2", "FIX-002", { rested: true }),
        ])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", [character("kaido", "OP08-119")])
        .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
        .build();
      attack(game, "kaido", "p1-leader");
      game.play({ type: "resolve-effect", optionId: "apply" });
      while (
        game.state.pendingEffect &&
        !effectOptions(game).some((id) => id.startsWith("replace:"))
      ) {
        game.play({ type: "resolve-effect" });
      }
      game.play({ type: "resolve-effect", optionId: "replace:rosinante" });
      settle(game);

      expect(ids(game.state.players.p1.board)).toEqual([
        "rested-1",
        "rested-2",
      ]);
      expect(ids(game.state.players.p1.trash)).toContain("rosinante");
    });

    /**
     * p2's OP16-079 Yamato Leader swings at p1's rested `target`; OP16-100
     * Hallowed Glacier Slash then stands that Leader back up only if an
     * opposing Character was K.O.'d this turn. It stands in for OP03-076 Rob
     * Lucci, whose clause watches the same fact.
     */
    const yamato = (seed: string, target: string) => {
      const game = theirTurn(seed)
        .withBoard("p1", [character("target", target, { rested: true })])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withLeader("p2", "OP16-079")
        .withGivenDon("p2", "p2-leader", 2)
        .withHand("p2", [instance("slash", "OP16-100")])
        .build();
      attack(game, "p2-leader", "target");
      passDefence(game);
      return game;
    };
    const slash = (game: Game): void => {
      const offer = game
        .legalActions()
        .find(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "OP16-100",
        );
      if (!offer) return;
      game.submit(offer);
      settle(game);
    };

    it("OP05-030#3: trashed instead of K.O.'d, it is no K.O. for the opponent's clauses", () => {
      const game = yamato("faq-op05-030-3", "OP05-030");
      game.play({
        type: "resolve-effect",
        summary: "Trash Donquixote Rosinante",
      });
      settle(game);
      expect(ids(game.state.players.p1.trash)).toContain("target");

      slash(game);
      expect(game.state.players.p2.leaderRested).toBe(true);
    });

    it("OP05-030#3 (control): a plain K.O. does stand the Leader back up", () => {
      const game = yamato("faq-op05-030-3-control", "FIX-001");
      settle(game);
      expect(ids(game.state.players.p1.trash)).toContain("target");

      slash(game);
      expect(game.state.players.p2.leaderRested).toBe(false);
    });
  });

  it("OP05-031#1: Buffalo's own attack makes it one of the two rested Characters", () => {
    const game = myTurn("faq-op05-031-1")
      .withBoard("p1", [
        character("buffalo", "OP05-031"),
        character("one", "OP05-027", { rested: true }),
      ])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    attack(game, "buffalo", "p2-leader");
    choose(game, "one");
    settle(game);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "one")
        ?.rested,
    ).toBe(false);
  });

  describe("OP05-032 Pica", () => {
    /** OP08-119 Kaido & Linlin K.O.s Pica and OP05-031 Buffalo together. */
    const both = (seed: string, order: "pica-first" | "buffalo-first") => {
      const pica = character("pica", "OP05-032");
      const buffalo = character("buffalo", "OP05-031");
      const game = theirTurn(seed)
        .withBoard(
          "p1",
          order === "pica-first" ? [pica, buffalo] : [buffalo, pica],
        )
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", [character("kaido", "OP08-119")])
        .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
        .build();
      attack(game, "kaido", "p1-leader");
      game.play({ type: "resolve-effect", optionId: "apply" });
      while (
        game.state.pendingEffect &&
        !effectOptions(game).some((id) => id === "replace:pica")
      ) {
        game.play({ type: "resolve-effect" });
      }
      game.play({ type: "resolve-effect", optionId: "replace:pica" });
      game.play({ type: "resolve-effect", summary: "Buffalo" });
      settle(game);
      return game;
    };

    it("OP05-032#1: Pica may rest a Character the same K.O. is taking", () => {
      const game = both("faq-op05-032-1", "pica-first");
      expect(ids(game.state.players.p1.board)).toEqual(["pica"]);
    });

    it("OP05-032#1 (board order): the same when the other Character is listed first", () => {
      const game = both("faq-op05-032-1-order", "buffalo-first");
      expect(ids(game.state.players.p1.board)).toEqual(["pica"]);
    });
  });

  it("OP05-039#1: K.O.ing the attacker in the Counter Step ends the battle with no damage", () => {
    const game = theirTurn("faq-op05-039-1")
      .withHand("p1", [instance("meteora", "OP05-039")])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("attacker", "FIX-001")])
      .withGivenDon("p2", "attacker", 5)
      .build();
    attack(game, "attacker", "p1-leader");
    game.pass(); // no block
    game.play({ type: "activate-counter-event", sourceCardNumber: "OP05-039" });
    while (game.state.pendingEffect) {
      const pick = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-effect" &&
            action.option.kind === "card" &&
            action.option.card.instanceId === "attacker",
        );
      game.submit(pick ?? game.action({ type: "resolve-effect" }));
    }
    expect(onBoard(game, "p2", "attacker")).toBe(false);
    passDefence(game);

    expect(game.state.activeAttack).toBeNull();
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  describe("OP05-040 Birdcage", () => {
    const cage = (seed: string) =>
      myTurn(seed)
        .withStage("p1", instance("cage", "OP05-040"))
        .withBoard("p1", [character("mine", "FIX-002", { rested: true })])
        .withBoard("p2", [
          character("theirs", "FIX-001", { rested: true }),
          character("active", "FIX-001"),
        ])
        .build();

    it("OP05-040#1: the [End of Your Turn] K.O. needs no Doflamingo Leader", () => {
      const game = cage("faq-op05-040-1");
      game.pass();
      settle(game);
      expect(ids(game.state.players.p1.board)).toEqual([]);
      expect(ids(game.state.players.p2.board)).toEqual(["active"]);
      expect(game.state.players.p1.stage).toBeNull();
    });

    it("OP05-040#2: at ten DON!! it is not optional", () => {
      const game = cage("faq-op05-040-2");
      game.pass();
      // Nothing to decline: the turn has already moved on with the K.O. done.
      expect(game.state.pendingEffect).toBeNull();
      expect(game.state.activePlayer).toBe("p2");
      expect(ids(game.state.players.p2.board)).toEqual(["active"]);
    });
  });
});

describe("FAQ OP05 Blue", () => {
  describe("OP05-047 Basil Hawkins", () => {
    /** p2 swings at p1's Leader; p1 holds Hawkins and `hand` cards. */
    const hawkins = (seed: string, hand: number) =>
      theirTurn(seed)
        .withBoard("p1", [character("hawkins", "OP05-047")])
        .withHand("p1", copies(hand, "FIX-001", "p1-hand"))
        .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", [character("attacker", "FIX-002")])
        .withGivenDon("p2", "attacker", 3)
        .build();

    it("OP05-047#1: at four cards in hand the [On Block] neither draws nor adds 1000", () => {
      const game = hawkins("faq-op05-047-1", 4);
      attack(game, "attacker", "p1-leader");
      game.play({ type: "block", blockerInstanceId: "hawkins" });
      settle(game);

      expect(game.state.players.p1.hand).toHaveLength(4);
      expect(game.state.activeAttack?.counterPower).toBe(0);
    });

    it("OP05-047#2: a hand that drops to three in the Counter Step does not reopen it", () => {
      const game = hawkins("faq-op05-047-2", 4);
      attack(game, "attacker", "p1-leader");
      game.play({ type: "block", blockerInstanceId: "hawkins" });
      settle(game);
      game.play({ type: "counter", cardInstanceId: "p1-hand-1" });

      expect(game.state.players.p1.hand).toHaveLength(3);
      expect(game.state.pendingEffect).toBeNull();
      expect(game.state.activeAttack?.counterPower).toBe(1_000);
    });
  });

  describe("OP05-058 It's a Waste of Human Life!!", () => {
    const waste = (seed: string) =>
      myTurn(seed)
        .withHand("p1", [
          instance("waste", "OP05-058"),
          ...copies(6, "FIX-002", "p1-hand"),
        ])
        .withHand("p2", copies(7, "FIX-002", "p2-hand"))
        .withBoard("p1", [
          character("mine-1", "FIX-001"),
          character("mine-2", "FIX-002"),
        ])
        .withBoard("p2", [
          character("theirs-1", "FIX-001"),
          character("theirs-2", "FIX-002"),
        ])
        .build();

    it("OP05-058#1: the turn player trims their hand first, then the opponent", () => {
      const game = waste("faq-op05-058-1");
      useEvent(game, "OP05-058");
      const order: string[] = [];
      while (game.state.pendingEffect) {
        order.push(game.player);
        game.play({ type: "resolve-effect" });
      }
      expect(order[0]).toBe("p1");
      expect(order.at(-1)).toBe("p2");
      expect(order.lastIndexOf("p1")).toBeLessThan(order.indexOf("p2"));
      expect(game.state.players.p1.hand).toHaveLength(5);
      expect(game.state.players.p2.hand).toHaveLength(5);
    });

    // Engine disagrees: the bury is a `select` of "all" that moves the cards
    // in board order (mechanics/op05-main.ts), so neither player is asked how
    // to order their own Characters under their deck. The first decision the
    // Event asks for is p1's hand trim. Offering the order is a new decision
    // for every "place at the bottom in any order" clause, not a fix to this
    // card.
    it.fails(
      "OP05-058#2: each owner orders their own Characters under their deck, turn player first",
      () => {
        const game = waste("faq-op05-058-2");
        useEvent(game, "OP05-058");
        // The first decision the Event asks for is p1 ordering its two bodies.
        expect(game.player).toBe("p1");
        const cards = game
          .legalActions()
          .flatMap((action) =>
            action.type === "resolve-effect" && action.option.kind === "card"
              ? [action.option.card.instanceId]
              : [],
          );
        expect(cards).toEqual(expect.arrayContaining(["mine-1", "mine-2"]));
      },
    );
  });
});

describe("FAQ OP05 Purple", () => {
  /**
   * p2 swings at p1's Leader. p1 holds O-Nami and OP05-075 Mr.1 on ten DON!!,
   * with a second Mr.1 in hand for the first to play.
   */
  const mrOne = (seed: string) => {
    const game = theirTurn(seed)
      .withBoard("p1", [
        character("onami", "OP05-062"),
        character("mr1", "OP05-075"),
      ])
      .withHand("p1", [instance("mr1-hand", "OP05-075")])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();
    attack(game, "attacker", "p1-leader");
    return game;
  };

  it("OP05-062#1: O-Nami loses [Blocker] once the field drops to nine DON!!", () => {
    const game = mrOne("faq-op05-062-1");
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (game.state.pendingEffect) {
      const pick = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-effect" &&
            action.option.kind === "card" &&
            action.option.card.instanceId === "mr1-hand",
        );
      game.submit(pick ?? game.action({ type: "resolve-effect" }));
    }
    expect(onBoard(game, "p1", "mr1-hand")).toBe(true);
    expect(game.state.phase).toBe("block");
    expect(blockers(game)).not.toContain("onami");
  });

  it("OP05-062#1 (control): at ten DON!! O-Nami blocks", () => {
    const game = mrOne("faq-op05-062-1-control");
    game.play({ type: "resolve-effect", summary: "Don't apply" });
    expect(game.state.phase).toBe("block");
    expect(blockers(game)).toContain("onami");
  });

  it("OP05-062#2: O-Nami is not named [Nami]", () => {
    // OP01-016 Nami's search takes a Straw Hat Crew card "other than" a
    // [Nami]; O-Nami is one it may take.
    const game = myTurn("faq-op05-062-2")
      .withHand("p1", [instance("nami", "OP01-016")])
      .withDeckTop("p1", [
        instance("onami", "OP05-062"),
        ...copies(4, "FIX-001", "p1-deck"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP01-016" });
    choose(game, "onami");
    settle(game);
    expect(ids(game.state.players.p1.hand)).toContain("onami");
  });

  it("OP05-075#1: a Mr.1 played mid-attack cannot answer the same attack", () => {
    const game = mrOne("faq-op05-075-1");
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (game.state.pendingEffect) {
      const pick = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-effect" &&
            action.option.kind === "card" &&
            action.option.card.instanceId === "mr1-hand",
        );
      game.submit(pick ?? game.action({ type: "resolve-effect" }));
    }
    expect(onBoard(game, "p1", "mr1-hand")).toBe(true);
    // Straight on to the Block Step: no second [On Your Opponent's Attack].
    expect(game.state.phase).toBe("block");
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("FAQ OP05 Black", () => {
  it("OP05-079#1: the opponent picks which trash cards Viola sends under their deck", () => {
    const game = myTurn("faq-op05-079-1")
      .withHand("p1", [instance("viola", "OP05-079")])
      .withTrash("p2", copies(4, "FIX-001", "p2-trash"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-079" });
    expect(game.state.pendingEffect).not.toBeNull();
    expect(game.player).toBe("p2");
    settle(game);
    expect(game.state.players.p2.trash).toHaveLength(1);
  });

  it("OP05-082#1: Shirahoshi's cost can be paid against a five-card hand, which then trashes nothing", () => {
    const game = myTurn("faq-op05-082-1")
      .withBoard("p1", [character("shirahoshi", "OP05-082")])
      .withTrash("p1", copies(2, "FIX-001", "p1-trash"))
      .withHand("p2", copies(5, "FIX-001", "p2-hand"))
      .build();
    game.play({ type: "activate-main", summary: "Shirahoshi" });
    settle(game);
    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(game.state.players.p2.hand).toHaveLength(5);
  });

  describe("Saint Charlos and Saint Rosward", () => {
    /**
     * p1's Saint stands alone, so p2's `target` is cheap -- until EB01-049
     * T-Bone (no {Celestial Dragons} type) arrives with its cost-2 K.O.
     */
    const saint = (seed: string, saintNumber: string, target: string) => {
      const game = myTurn(seed)
        .withBoard("p1", [character("saint", saintNumber)])
        .withHand("p1", [instance("tbone", "EB01-049")])
        .withBoard("p2", [character("target", target)])
        .build();
      game.play({ type: "play-card", cardNumber: "EB01-049" });
      return game;
    };

    it("OP05-084#1: Charlos's −4 is gone by the time the new Character's [On Play] resolves", () => {
      const game = saint("faq-op05-084-1", "OP05-084", "OP05-008");
      expect(effectOptions(game)).not.toContain("target");
      settle(game);
      expect(onBoard(game, "p2", "target")).toBe(true);
    });

    it("OP05-092#1: Rosward's −6 is gone by the time the new Character's [On Play] resolves", () => {
      const game = saint("faq-op05-092-1", "OP05-092", "OP05-007");
      expect(effectOptions(game)).not.toContain("target");
      settle(game);
      expect(onBoard(game, "p2", "target")).toBe(true);
    });
  });

  it("OP05-086#1: Vivi loses [Blocker] once the trash drops under ten", () => {
    // p2's OP05-079 Viola sends three of p1's ten trash cards under p1's deck.
    const game = theirTurn("faq-op05-086-1")
      .withBoard("p1", [character("vivi", "OP05-086")])
      .withTrash("p1", copies(10, "FIX-001", "p1-trash"))
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withHand("p2", [instance("viola", "OP05-079")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();
    attack(game, "attacker", "p1-leader");
    expect(blockers(game)).toContain("vivi");
    game.pass();
    passDefence(game);
    settle(game);

    game.play({ type: "play-card", cardNumber: "OP05-079" });
    settle(game);
    expect(game.state.players.p1.trash).toHaveLength(7);
    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    const next = game.legalActions().find((action) => action.type === "attack");
    expect(next).toBeDefined();
  });

  describe("OP05-087 Hakuba", () => {
    it("OP05-087#1: a Character the K.O. cannot touch buys no −5 cost", () => {
      // OP06-109 Denjiro (two DON!!, opponent at three Life or less) stands in
      // for OP03-088 Fukurou: neither can be K.O.'d by effects.
      const game = myTurn("faq-op05-087-1")
        .withBoard("p1", [
          character("hakuba", "OP05-087"),
          character("denjiro", "OP06-109"),
        ])
        .withGivenDon("p1", "hakuba", 1)
        .withGivenDon("p1", "denjiro", 2)
        .withLife("p2", copies(3, "FIX-001", "p2-life"))
        .withBoard("p2", [character("target", "OP05-008")])
        .build();
      attack(game, "hakuba", "p2-leader");
      game.play({ type: "resolve-effect", optionId: "apply" });
      if (effectOptions(game).includes("denjiro")) {
        choose(game, "denjiro");
      }
      settle(game);
      expect(onBoard(game, "p1", "denjiro")).toBe(true);
      expect(game.state.players.p2.board[0]?.costModifiers ?? []).toEqual([]);
    });

    it("OP05-087#2: a K.O. replaced by another cost buys no −5 cost", () => {
      // OP05-032 Pica stands in for OP04-082 Kyros: it rests another
      // Character instead of being K.O.'d.
      const game = myTurn("faq-op05-087-2")
        .withBoard("p1", [
          character("hakuba", "OP05-087"),
          character("pica", "OP05-032"),
          character("buffalo", "OP05-031"),
        ])
        .withGivenDon("p1", "hakuba", 1)
        .withLife("p2", copies(2, "FIX-001", "p2-life"))
        .withBoard("p2", [character("target", "OP05-008")])
        .build();
      attack(game, "hakuba", "p2-leader");
      game.play({ type: "resolve-effect", optionId: "apply" });
      choose(game, "pica");
      game.play({ type: "resolve-effect", optionId: "replace:pica" });
      settle(game);

      expect(onBoard(game, "p1", "pica")).toBe(true);
      expect(game.state.players.p2.board[0]?.costModifiers ?? []).toEqual([]);
    });
  });

  it("OP05-091#1: Rebecca can add a cost-3 black Character and then play it rested", () => {
    const game = myTurn("faq-op05-091-1")
      .withHand("p1", [instance("rebecca", "OP05-091")])
      .withTrash("p1", [instance("charlos", "OP05-084")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-091" });
    choose(game, "charlos");
    choose(game, "charlos");
    settle(game);
    const played = game.state.players.p1.board.find(
      (card) => card.instanceId === "charlos",
    );
    expect(played?.rested).toBe(true);
  });

  it("OP05-095#1: Dragon Claw itself makes the fifteenth trash card", () => {
    const game = theirTurn("faq-op05-095-1")
      .withHand("p1", [instance("claw", "OP05-095")])
      .withTrash("p1", copies(14, "FIX-001", "p1-trash"))
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [
        character("attacker", "FIX-002"),
        character("target", "FIX-002"),
      ])
      .build();
    attack(game, "attacker", "p1-leader");
    game.pass();
    game.play({ type: "activate-counter-event", sourceCardNumber: "OP05-095" });
    while (game.state.pendingEffect) {
      const pick = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-effect" &&
            action.option.kind === "card" &&
            action.option.card.instanceId === "target",
        );
      game.submit(pick ?? game.action({ type: "resolve-effect" }));
    }
    expect(onBoard(game, "p2", "target")).toBe(false);
  });
});

describe("FAQ OP05 Yellow", () => {
  describe("OP05-098 Enel (Leader)", () => {
    /** p2 swings at p1's Enel Leader with `lifeCard` as p1's last Life. */
    const enel = (
      seed: string,
      lifeCard: string,
      attacker = character("attacker", "FIX-002"),
    ) =>
      theirTurn(seed)
        .withLeader("p1", "OP05-098")
        .withLife("p1", [instance("last", lifeCard)])
        .withHand("p1", copies(2, "FIX-001", "p1-hand"))
        .withDeckTop("p1", copies(4, "FIX-002", "p1-deck"))
        .withBoard("p2", [attacker])
        .withGivenDon("p2", attacker.instanceId, 2)
        .build();

    // All four rulings come down to one timing: the Leader's clause is decided
    // as the Life card leaves, and resolves once the Damage Step is over --
    // after the Trigger and after a [Double Attack]'s second point. See
    // `pendingDamageReactions`.
    //
    // #1: the Trigger is offered with Life still at 0, and Enel answers after.
    it("OP05-098#1: the Trigger is decided first, and the Leader's clause follows it", () => {
      // OP06-116 Reject's Trigger draws a card.
      const game = enel("faq-op05-098-1", "OP06-116");
      attack(game, "attacker", "p1-leader");
      passDefence(game);
      expect(offered(game, "resolve-trigger").length).toBeGreaterThan(0);
      expect(game.state.players.p1.life).toHaveLength(0);
      expect(game.state.players.p1.deck).toHaveLength(4);

      game.play({ type: "resolve-trigger", summary: "Activate" });
      settle(game);
      expect(ids(game.state.players.p1.hand)).toContain("p1-deck-1");
      expect(ids(game.state.players.p1.life)).toEqual(["p1-deck-2"]);
    });

    // #2: the Trigger refills Life from 0 first, and Enel still adds one.
    it("OP05-098#2: a Trigger that refills Life from 0 does not stop the Leader's clause", () => {
      // OP06-115's Trigger stands in for OP03-118 Ikoku Sovereignty: at 0
      // Life it adds the top of the deck to Life.
      const game = enel("faq-op05-098-2", "OP06-115");
      attack(game, "attacker", "p1-leader");
      passDefence(game);
      game.play({ type: "resolve-trigger", summary: "Activate" });
      settle(game);
      expect(game.state.players.p1.life).toHaveLength(2);
    });

    // #3: Shura's [On Play] and Enel's clause wait together, so p1 orders them.
    it("OP05-098#3: Shura's [On Play] and the Leader's clause go in the order the player picks", () => {
      const game = enel("faq-op05-098-3", "OP05-106");
      attack(game, "attacker", "p1-leader");
      passDefence(game);
      game.play({ type: "resolve-trigger", summary: "Activate" });
      expect(game.player).toBe("p1");
      expect(game.summaries("p1").some((s) => s.includes("Enel"))).toBe(true);
      expect(game.summaries("p1").some((s) => s.includes("Shura"))).toBe(true);
    });

    // #4: the second point finds no Life and does nothing; Enel then adds one.
    it("OP05-098#4: both Double Attack damage land before the Leader adds a Life card", () => {
      const game = enel(
        "faq-op05-098-4",
        "FIX-001",
        character("oden", "OP09-047"),
      );
      attack(game, "oden", "p1-leader");
      passDefence(game);
      while (
        game.state.pendingEffect ||
        offered(game, "resolve-trigger").length
      ) {
        if (offered(game, "resolve-trigger").length)
          game.play({ type: "resolve-trigger" });
        else game.play({ type: "resolve-effect" });
      }
      expect(game.state.phase).not.toBe("finished");
      expect(game.state.players.p1.life).toHaveLength(1);
    });
  });

  describe("OP05-100 Enel", () => {
    it("OP05-100#1: its controller's own effect leaving it off the field can be replaced", () => {
      // OP07-055 Snake Dance returns one of its controller's own Characters.
      const game = theirTurn("faq-op05-100-1")
        .withBoard("p1", [character("enel", "OP05-100")])
        .withHand("p1", [instance("dance", "OP07-055")])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", [character("attacker", "FIX-002")])
        .build();
      attack(game, "attacker", "p1-leader");
      game.pass();
      game.play({
        type: "activate-counter-event",
        sourceCardNumber: "OP07-055",
      });
      while (
        game.state.pendingEffect &&
        !effectOptions(game).some((id) => id.startsWith("replace:"))
      ) {
        const pick = game
          .legalActions()
          .find(
            (action) =>
              action.type === "resolve-effect" &&
              action.option.kind === "card" &&
              action.option.card.instanceId === "enel",
          );
        game.submit(pick ?? game.action({ type: "resolve-effect" }));
      }
      game.play({ type: "resolve-effect", optionId: "replace:enel" });
      settle(game);
      expect(onBoard(game, "p1", "enel")).toBe(true);
      expect(game.state.players.p1.life).toHaveLength(1);
    });

    it("OP05-100#2: a cost it was chosen for and replaced is not paid, so nothing follows", () => {
      // OP05-056 X.Barrels stands in for OP01-047 Trafalgar Law: a Character
      // of its controller's leaves the field to pay for what comes next.
      const game = myTurn("faq-op05-100-2")
        .withBoard("p1", [character("enel", "OP05-100")])
        .withHand("p1", [instance("barrels", "OP05-056")])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
        .build();
      game.play({ type: "play-card", cardNumber: "OP05-056" });
      game.play({ type: "resolve-effect", optionId: "apply" });
      choose(game, "enel");
      game.play({ type: "resolve-effect", optionId: "replace:enel" });
      settle(game);
      expect(onBoard(game, "p1", "enel")).toBe(true);
      expect(game.state.players.p1.hand).toHaveLength(0);
    });

    it("OP05-100#3: a [Monkey.D.Luffy] Character does not negate its [Rush]", () => {
      const game = myTurn("faq-op05-100-3")
        .withBoard("p1", [character("luffy", "ST31-004")])
        .withHand("p1", [instance("enel", "OP05-100")])
        .build();
      game.play({ type: "play-card", cardNumber: "OP05-100" });
      settle(game);
      expect(attackers(game)).toContain("enel");
    });
  });

  it("OP05-109#1: Pagaya answers the opponent's Trigger too", () => {
    const game = myTurn("faq-op05-109-1")
      .withBoard("p1", [character("pagaya", "OP05-109")])
      .withGivenDon("p1", "pagaya", 4)
      .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
      .withLife("p2", [instance("reject", "OP06-116")])
      .withDeckTop("p2", copies(2, "FIX-002", "p2-deck"))
      .build();
    attack(game, "pagaya", "p2-leader");
    passDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate" });
    settle(game);
    expect(game.state.players.p1.trash).toHaveLength(2);
  });
});
