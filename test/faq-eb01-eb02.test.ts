import { describe, expect, it } from "vitest";
import { currentPower, fieldDonCount } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for EXTRA BOOSTER -MEMORIAL COLLECTION- [EB-01] and
 * EXTRA BOOSTER -ONE PIECE Anime 25th Collection- [EB-02], one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order the PDF prints
 * them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. A ruling the engine disagrees with is an `it.fails`
 * that says what the engine does instead: it turns green -- and so red under
 * `it.fails` -- the day the engine is fixed, which is the prompt to promote it.
 *
 * Three rulings name a card the pool does not carry (OP01-008 Cavendish,
 * OP02-049 Emporio.Ivankov, OP04-082 Kyros). Each case says which card stands
 * in for it and why the stand-in asks the same question.
 *
 * Source PDFs: https://en.onepiece-cardgame.com/pdf/qa_eb01.pdf and
 * https://en.onepiece-cardgame.com/pdf/qa_eb02.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 * Empty while every EB-01 and EB-02 ruling has one.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 in its own Main Phase on an empty table, all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2 in its own Main Phase on an empty table, both sides' DON!! active. */
const defending = (seed: string) =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function attackers(game: Game): string[] {
  return game
    .legalActions()
    .flatMap((action) =>
      action.type === "attack" ? [action.attackerInstanceId] : [],
    );
}

function attackTargets(game: Game, attacker: string): string[] {
  return game
    .legalActions()
    .flatMap((action) =>
      action.type === "attack" && action.attackerInstanceId === attacker
        ? [action.targetInstanceId]
        : [],
    );
}

function blockers(game: Game): string[] {
  return game
    .legalActions()
    .flatMap((action) =>
      action.type === "block" ? [action.blockerInstanceId] : [],
    );
}

const activations = (game: Game, cardNumber: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === cardNumber,
    );

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

/** Takes the apply branch of an optional prompt, if the engine asks. */
function applyOptional(game: Game): void {
  if (effectOptions(game).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
}

/** Declines the Block and Counter steps, so a declared attack resolves. */
function declineDefence(game: Game): void {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
}

/** Declines the Block and Counter steps until the engine asks something. */
function declineUntilAsked(game: Game): void {
  while (
    !game.state.pendingEffect &&
    (game.state.phase === "block" || game.state.phase === "counter")
  ) {
    game.pass();
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

describe("FAQ EB-01", () => {
  it("EB01-001#1: Oden's +1000 outlasts the {Land of Wano} Character that enabled it", () => {
    // The condition is read when the [When Attacking] resolves; the +1000
    // then lasts until the start of p1's next turn on its own.
    const game = table("faq-eb01-001-1")
      .withLeader("p1", "EB01-001")
      .withBoard("p1", [character("kinemon", "OP12-025")])
      .withGivenDon("p1", "p1-leader", 1)
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .withHand("p2", [instance("removal", "EB01-059")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    declineDefence(game);
    settle(game);
    // 5000 printed, +1000 for the given DON!!, +1000 from the clause.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);

    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "activate-main", sourceCardNumber: "EB01-059" });
    game.play({ type: "resolve-effect", optionId: "kinemon" });
    settle(game);
    expect(game.state.players.p1.board).toEqual([]);

    // A given DON!! adds nothing on p2's turn (CR 6-5-5-2), so read the power
    // without it: the clause's +1000 is what is left.
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(6000);
  });

  it("EB01-003#1: Kid & Killer keeps +2000 after the opponent's Life climbs back to 3", () => {
    const game = table("faq-eb01-003-1")
      .withBoard("p1", [character("kid", "EB01-003")])
      .withHand("p1", [instance("gastino", "EB01-053")])
      .withBoard("p2", [
        character("victim", "FIX-001", { rested: true }),
        character("banked", "FIX-002"),
      ])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "kid",
      targetInstanceId: "victim",
    });
    settle(game);
    expect(currentPower(game.state, "p1", "kid")).toBe(7000);
    declineDefence(game);
    settle(game);

    // EB01-053 Gastino puts a p2 Character on top of p2's Life: 3 cards.
    game.play({ type: "play-card", cardNumber: "EB01-053" });
    game.play({ type: "resolve-effect", optionId: "banked" });
    settle(game);
    expect(game.state.players.p2.life).toHaveLength(3);

    expect(currentPower(game.state, "p1", "kid")).toBe(7000);
  });

  describe("EB01-008 LittleOars Jr.", () => {
    const littleOarsTargeted = (seed: string, hand: string) => {
      const game = table(seed)
        .withHand("p1", [instance("removal", "EB01-059")])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", [character("oars", "EB01-008")])
        .withHand("p2", [instance("held", hand)])
        .build();
      game.play({ type: "activate-main", sourceCardNumber: "EB01-059" });
      game.play({ type: "resolve-effect", optionId: "oars" });
      return game;
    };

    it("EB01-008#1: with no Event or Stage in hand the K.O. is not replaced", () => {
      const game = littleOarsTargeted("faq-eb01-008-1", "FIX-001");
      settle(game);
      expect(ids(game.state.players.p2.trash)).toContain("oars");
      expect(ids(game.state.players.p2.hand)).toEqual(["held"]);
    });

    it("EB01-008#1 (control): an Event in hand pays for the replacement", () => {
      const game = littleOarsTargeted("faq-eb01-008-1-control", "EB01-029");
      expect(game.player).toBe("p2");
      expect(effectOptions(game, "p2").length).toBeGreaterThan(0);
    });
  });

  it("EB01-011#1: Mini-Merry buries a 1000-base-power Character that DON!! has pumped to 2000", () => {
    const game = table("faq-eb01-011-1")
      .withStage("p1", { instanceId: "merry", cardNumber: "EB01-011" })
      .withBoard("p1", [character("sugar", "OP10-065")])
      .withGivenDon("p1", "sugar", 1)
      .withDeckTop("p1", [instance("drawn", "FIX-001")])
      .build();
    expect(currentPower(game.state, "p1", "sugar")).toBe(2000);

    game.play({ type: "activate-main", sourceCardNumber: "EB01-011" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "sugar" });
    settle(game);

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.deck)).toContain("sugar");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  describe("EB01-012 Cavendish", () => {
    // OP01-008 Cavendish is not in the pool; OP10-105 Cavendish is another
    // card named [Cavendish], which is all the ruling turns on.
    const cavendishLands = (
      seed: string,
      board: ReturnType<typeof character>[],
    ) => {
      const game = table(seed)
        .withLeader("p1", "OP12-020")
        .withBoard("p1", board)
        .withHand("p1", [instance("cavendish", "EB01-012")])
        .build();
      game.play({ type: "play-card", cardNumber: "EB01-012" });
      settle(game);
      return game;
    };

    it("EB01-012#1: another [Cavendish] with a different card number switches the ramp off", () => {
      const game = cavendishLands("faq-eb01-012-1", [
        character("other", "OP10-105"),
      ]);
      // Ten DON!! less the five the play rested, and none set active again.
      expect(game.state.players.p1.activeDon).toHaveLength(5);
    });

    it("EB01-012#1 (control): alone, the ramp sets 2 DON!! active", () => {
      const game = cavendishLands("faq-eb01-012-1-control", []);
      expect(game.state.players.p1.activeDon).toHaveLength(7);
    });
  });

  it("EB01-020#1: Chambres with no Character to return plays nothing", () => {
    const game = table("faq-eb01-020-1")
      .withLeader("p1", "OP12-020")
      .withHand("p1", [
        instance("chambres", "EB01-020"),
        instance("cheap", "FIX-002"),
      ])
      .build();

    const event = game
      .legalActions()
      .find(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "EB01-020",
      );
    if (event) {
      game.submit(event);
      settle(game);
    }

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.hand)).toContain("cheap");
  });

  it("EB01-021#1: Hannyabal returns the Character with an empty DON!! deck", () => {
    const game = table("faq-eb01-021-1")
      .withLeader("p1", "EB01-021")
      .withBoard("p1", [character("saldeath", "OP11-064")])
      .build();
    expect(game.state.players.p1.donDeck).toEqual([]);

    game.pass();
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "apply" });
    if (effectOptions(game).includes("saldeath")) {
      game.play({ type: "resolve-effect", optionId: "saldeath" });
    }
    settle(game);

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.hand)).toEqual(["saldeath"]);
  });

  it("EB01-022#1: Inazuma reads the hand as it resolves, after an earlier end-of-turn draw", () => {
    // OP02-049 Emporio.Ivankov is not in the pool. A second Inazuma is the
    // same question: an [End of Your Turn] draw of 2 resolves first, and this
    // one checks the hand afterwards.
    const game = table("faq-eb01-022-1")
      .withBoard("p1", [
        character("inazuma-1", "EB01-022"),
        character("inazuma-2", "EB01-022"),
      ])
      .withDeckTop("p1", copies(6, "FIX-001", "p1-deck"))
      .build();

    game.pass();
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(4);
  });

  describe("EB01-024 Hamlet", () => {
    const hamletTable = (seed: string, hand: number) =>
      table(seed)
        .withBoard("p1", [
          character("hamlet", "EB01-024"),
          character("fourtricks", "EB01-025"),
        ])
        .withHand("p1", copies(hand, "FIX-001", "p1-hand"))
        .build();

    it("EB01-024#1: with 4 cards in hand the {SMILE} Characters gain +1000", () => {
      const game = hamletTable("faq-eb01-024-1", 4);
      expect(currentPower(game.state, "p1", "hamlet")).toBe(5000);
      expect(currentPower(game.state, "p1", "fourtricks")).toBe(6000);
    });

    it("EB01-024#1 (control): with 5 cards in hand nothing is added", () => {
      const game = hamletTable("faq-eb01-024-1-control", 5);
      expect(currentPower(game.state, "p1", "hamlet")).toBe(4000);
      expect(currentPower(game.state, "p1", "fourtricks")).toBe(5000);
    });
  });

  describe("EB01-028 Gum-Gum Champion Rifle", () => {
    /** p2 swings at p1's Leader; p1 holds the Counter, then declines blocks. */
    const rifleTable = (seed: string, leader: string) => {
      const game = defending(seed)
        .withLeader("p1", leader)
        .withHand("p1", [instance("rifle", "EB01-028")])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", [
          character("attacker", "FIX-002"),
          character("home-1", "FIX-001"),
          character("home-2", "FIX-002"),
        ])
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "attacker",
        targetInstanceId: "p1-leader",
      });
      while (game.state.phase === "block") game.pass();
      return game;
    };

    it("EB01-028#1: the attacking player picks which active Character goes back", () => {
      const game = rifleTable("faq-eb01-028-1", "EB01-021");
      game.play({
        type: "activate-counter-event",
        sourceCardNumber: "EB01-028",
      });
      while (game.player === "p1" && game.state.pendingEffect) {
        game.play({ type: "resolve-effect" });
      }

      expect(game.player).toBe("p2");
      expect(effectOptions(game, "p2").sort()).toEqual(["home-1", "home-2"]);
      game.play({ type: "resolve-effect", optionId: "home-2" });
      expect(ids(game.state.players.p2.hand)).toEqual(["home-2"]);
      // The Counter step goes back to the defender.
      expect(game.state.phase).toBe("counter");
      expect(game.player).toBe("p1");
    });

    it("EB01-028#2: without an {Impel Down} Leader nothing is returned", () => {
      const game = rifleTable("faq-eb01-028-2", "FIX-LEADER-B");
      const counter = game
        .legalActions()
        .find(
          (action) =>
            action.type === "activate-counter-event" &&
            action.sourceCardNumber === "EB01-028",
        );
      if (counter) {
        game.submit(counter);
        while (game.state.pendingEffect && game.player === "p1") {
          game.play({ type: "resolve-effect" });
        }
      }

      expect(game.state.pendingEffect).toBeNull();
      expect(ids(game.state.players.p2.board)).toEqual([
        "attacker",
        "home-1",
        "home-2",
      ]);
    });
  });

  it("EB01-029#1: a revealed card of cost 3 or less goes back on top of the deck", () => {
    const game = defending("faq-eb01-029-1")
      .withHand("p1", [instance("goner", "EB01-029")])
      .withBoard("p1", [character("stuck", "FIX-002")])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withDeckTop("p1", [
        instance("cheap", "FIX-001"),
        instance("second", "FIX-002"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", sourceCardNumber: "EB01-029" });
    settle(game);

    expect(ids(game.state.players.p1.deck)).toEqual(["cheap", "second"]);
    expect(game.state.players.p1.deck[0]?.faceUp).not.toBe(true);
    expect(ids(game.state.players.p1.board)).toEqual(["stuck"]);
  });

  describe("EB01-038 Oh Come My Way", () => {
    const redirect = (seed: string, shield: ReturnType<typeof character>) => {
      const game = defending(seed)
        .withLeader("p1", "OP14-079")
        .withHand("p1", [instance("event", "EB01-038")])
        .withBoard("p1", [shield])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", [character("attacker", "FIX-002")])
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "attacker",
        targetInstanceId: "p1-leader",
      });
      while (game.state.phase === "block") game.pass();
      game.play({
        type: "activate-counter-event",
        sourceCardNumber: "EB01-038",
      });
      game.play({ type: "resolve-effect", optionId: "return-don:active" });
      game.play({ type: "resolve-effect", optionId: shield.instanceId });
      settle(game);
      return game;
    };

    it("EB01-038#1: the new target may be an active Character", () => {
      const game = redirect("faq-eb01-038-1", character("shield", "FIX-002"));
      expect(game.state.players.p1.board[0]?.rested).not.toBe(true);
      expect(game.state.activeAttack?.targetInstanceId).toBe("shield");
    });

    it("EB01-038#2: a [Blocker] made the target cannot then use [Blocker]", () => {
      // The Counter step comes after the Block step, so the window is gone.
      // EB01-017 Blueno is a vanilla [Blocker].
      const game = redirect("faq-eb01-038-2", character("blueno", "EB01-017"));
      expect(game.state.activeAttack?.targetInstanceId).toBe("blueno");
      expect(blockers(game)).toEqual([]);
      declineDefence(game);
      settle(game);
      expect(game.state.players.p1.board[0]?.rested).not.toBe(true);
    });
  });

  describe("EB01-040 Kyros", () => {
    // Nothing in the pool is printed at cost 0, so EB01-046 Brook's −1
    // makes one, as `test/eb01.test.ts` does.
    const kyrosTable = (seed: string, topFaceUp: boolean) => {
      const game = table(seed)
        .withLeader("p1", "EB01-040")
        .withHand("p1", [instance("setup", "EB01-046")])
        .withBoard("p2", [character("cheap", "EB02-017")])
        .withLife("p1", [
          instance("life-top", "FIX-001", { faceUp: topFaceUp }),
          instance("life-2", "FIX-001"),
        ])
        .build();
      game.play({ type: "play-card", cardNumber: "EB01-046" });
      game.play({ type: "resolve-effect", optionId: "cheap" });
      game.play({ type: "resolve-effect", optionId: "done" });
      settle(game);
      return game;
    };

    it("EB01-040#1: a face-up top Life card cannot pay, so nothing is K.O.'d", () => {
      const game = kyrosTable("faq-eb01-040-1", true);
      const offer = activations(game, "EB01-040")[0];
      if (offer) {
        game.submit(offer);
        applyOptional(game);
        settle(game);
      }
      expect(ids(game.state.players.p2.board)).toEqual(["cheap"]);
      expect(game.state.players.p1.life[1]?.faceUp).not.toBe(true);
    });

    it("EB01-040#1 (control): a face-down top Life card pays", () => {
      const game = kyrosTable("faq-eb01-040-1-control", false);
      game.play({ type: "activate-main", sourceCardNumber: "EB01-040" });
      applyOptional(game);
      settle(game);
      expect(game.state.players.p2.board).toEqual([]);
    });
  });

  it("EB01-042#1: the played Character's [On Play] sees Scarlet's −2 cost", () => {
    // OP04-082 Kyros is not in the pool. OP10-044 Cub is a cost-1 {Dressrosa}
    // Character whose [On Play] bounces a cost-1-or-less Character, so it
    // asks the same thing: its [On Play] resolves after Scarlet's whole
    // effect, the −2 included. EB01-040 Kyros is the {Dressrosa} Leader Cub
    // rests to pay.
    const game = table("faq-eb01-042-1")
      .withLeader("p1", "EB01-040")
      .withBoard("p1", [character("scarlet", "EB01-042")])
      .withHand("p1", [instance("cub", "OP10-044")])
      .withBoard("p2", [character("fourtricks", "EB01-025")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "EB01-042" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cub" });
    game.play({ type: "resolve-effect", optionId: "fourtricks" });
    applyOptional(game);
    if (effectOptions(game).includes("p1-leader")) {
      game.play({ type: "resolve-effect", optionId: "p1-leader" });
    }
    if (effectOptions(game).includes("fourtricks")) {
      game.play({ type: "resolve-effect", optionId: "fourtricks" });
    }
    settle(game);

    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.hand)).toEqual(["fourtricks"]);
  });

  it("EB01-045#1: Brook's [Rush] stays after the cost-0 Character is gone", () => {
    // EB01-046 Brook makes the cost-0 Character, and EB01-040 Kyros's
    // Leader K.O.s it once EB01-045 Brook has landed.
    const game = table("faq-eb01-045-1")
      .withLeader("p1", "EB01-040")
      .withHand("p1", [
        instance("setup", "EB01-046"),
        instance("brook", "EB01-045"),
      ])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("cheap", "EB02-017")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-046" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    game.play({ type: "resolve-effect", optionId: "done" });
    settle(game);
    game.play({ type: "play-card", cardNumber: "EB01-045" });
    settle(game);
    expect(attackers(game)).toContain("brook");

    game.play({ type: "activate-main", sourceCardNumber: "EB01-040" });
    applyOptional(game);
    settle(game);
    expect(game.state.players.p2.board).toEqual([]);

    expect(attackers(game)).toContain("brook");
  });

  it("EB01-047#1: Laboon answers its own K.O.", () => {
    const game = table("faq-eb01-047-1")
      .withBoard("p2", [character("laboon", "EB01-047", { rested: true })])
      .withHand("p2", [instance("p2-held", "FIX-002")])
      .withDeckTop("p2", [instance("p2-top", "FIX-001")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "laboon",
    });
    declineDefence(game);
    while (game.state.pendingEffect) {
      game.play({
        type: "resolve-effect",
        optionId: effectOptions(game).includes("p2-held")
          ? "p2-held"
          : effectOptions(game)[0],
      });
    }

    expect(ids(game.state.players.p2.trash)).toEqual(
      expect.arrayContaining(["laboon", "p2-held"]),
    );
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-top"]);
  });

  it("EB01-051#1: with 1 card in the deck Finger Pistol cannot pay, so it K.O.s nothing", () => {
    const game = table("faq-eb01-051-1")
      .withHand("p1", [instance("pistol", "EB01-051")])
      .withDeckTop("p1", [instance("last", "FIX-001")])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

    const event = activations(game, "EB01-051")[0];
    if (event) {
      game.submit(event);
      applyOptional(game);
      if (effectOptions(game).includes("target")) {
        game.play({ type: "resolve-effect", optionId: "target" });
      }
      settle(game);
    }

    expect(ids(game.state.players.p2.board)).toEqual(["target"]);
  });

  describe("EB01-052 Viola", () => {
    it("EB01-052#1: the opponent's Life goes back with each card's face unchanged", () => {
      const game = table("faq-eb01-052-1")
        .withHand("p1", [instance("viola", "EB01-052")])
        .withLife("p2", [
          instance("up", "FIX-001", { faceUp: true }),
          instance("down", "FIX-002"),
        ])
        .build();

      game.play({ type: "play-card", cardNumber: "EB01-052" });
      game.play({ type: "resolve-effect", optionId: "look" });
      settle(game);

      const life = game.state.players.p2.life;
      expect(life.find((card) => card.instanceId === "up")?.faceUp).toBe(true);
      expect(life.find((card) => card.instanceId === "down")?.faceUp).not.toBe(
        true,
      );
    });

    it("EB01-052#2: turning p1's Life face-down keeps its order", () => {
      const game = table("faq-eb01-052-2")
        .withHand("p1", [instance("viola", "EB01-052")])
        .withLife("p1", [
          instance("a", "FIX-001", { faceUp: true }),
          instance("b", "FIX-002"),
          instance("c", "FIX-001", { faceUp: true }),
        ])
        .build();

      game.play({ type: "play-card", cardNumber: "EB01-052" });
      game.play({ type: "resolve-effect", optionId: "hide" });
      settle(game);

      expect(ids(game.state.players.p1.life)).toEqual(["a", "b", "c"]);
      expect(game.state.players.p1.life.some((card) => card.faceUp)).toBe(
        false,
      );
    });
  });

  describe("EB01-059 Kingdom Come", () => {
    it("EB01-059#1: on 1 or 0 Life the [Main] leaves the Life count alone", () => {
      for (const life of [0, 1]) {
        const game = table(`faq-eb01-059-1-${life}`)
          .withHand("p1", [instance("kingdom", "EB01-059")])
          .withLife("p1", copies(life, "FIX-001", "p1-life"))
          .build();
        game.play({ type: "activate-main", sourceCardNumber: "EB01-059" });
        settle(game);
        expect(game.state.players.p1.life).toHaveLength(life);
      }
    });

    it("EB01-059#2: the [Trigger] counts Life after the damaged card has left", () => {
      // 2 + 2 Life before the hit; the Trigger card itself has left p1's
      // Life by the time it resolves, so the ceiling is 1 + 2 = 3.
      const game = defending("faq-eb01-059-2")
        .withLife("p1", [
          instance("kingdom", "EB01-059"),
          instance("p1-life-2", "FIX-001"),
        ])
        .withLife("p2", copies(2, "FIX-001", "p2-life"))
        .withBoard("p2", [
          character("cost-3", "EB01-025"),
          character("cost-4", "EB01-003"),
        ])
        .build();

      game.play({
        type: "attack",
        attackerInstanceId: "p2-leader",
        targetInstanceId: "p1-leader",
      });
      declineDefence(game);
      expect(game.state.phase).toBe("trigger");
      game.play({ type: "resolve-trigger", optionId: "activate" });

      expect(effectOptions(game)).toContain("cost-3");
      expect(effectOptions(game)).not.toContain("cost-4");
    });
  });

  it("EB01-060#1: on 1 or 0 Life the [Main] leaves the Life count alone", () => {
    for (const life of [0, 1]) {
      const game = table(`faq-eb01-060-1-${life}`)
        .withHand("p1", [instance("kami", "EB01-060")])
        .withLife("p1", copies(life, "FIX-001", "p1-life"))
        .build();
      game.play({ type: "activate-main", sourceCardNumber: "EB01-060" });
      settle(game);
      expect(game.state.players.p1.life).toHaveLength(life);
    }
  });

  it("EB01-061#1: Bentham copying a 5000 Character with 1 DON!! given is 6000", () => {
    const game = table("faq-eb01-061-1")
      .withBoard("p1", [character("bentham", "EB01-061")])
      .withGivenDon("p1", "bentham", 1)
      .withBoard("p2", [character("five", "EB01-003", { rested: true })])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "bentham",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "five" });
    settle(game);

    expect(currentPower(game.state, "p1", "bentham")).toBe(6000);
  });
});

describe("FAQ EB-02", () => {
  describe("EB02-006 Yamato", () => {
    const yamatoLands = (seed: string, leader: string) => {
      const game = table(seed)
        .withLeader("p1", leader)
        .withHand("p1", [instance("yamato", "EB02-006")])
        .build();
      game.play({ type: "play-card", cardNumber: "EB02-006" });
      settle(game);
      return game;
    };

    it("EB02-006#1: under a Leader that is neither {Land of Wano} nor [Portgas.D.Ace], no [Rush]", () => {
      const game = yamatoLands("faq-eb02-006-1", "FIX-LEADER-R");
      const offer = activations(game, "EB02-006")[0];
      if (offer) {
        game.submit(offer);
        settle(game);
      }
      expect(attackers(game)).not.toContain("yamato");
    });

    it("EB02-006#1 (control): under a {Land of Wano} Leader it gains [Rush]", () => {
      const game = yamatoLands("faq-eb02-006-1-control", "FIX-LEADER-ODEN");
      game.play({ type: "activate-main", sourceCardNumber: "EB02-006" });
      settle(game);
      expect(attackers(game)).toContain("yamato");
    });
  });

  it("EB02-010#1: with no Characters the DON!! −2 is paid and nothing else happens", () => {
    const game = table("faq-eb02-010-1")
      .withLeader("p1", "EB02-010")
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "EB02-010" });
    applyOptional(game);
    settle(game);

    expect(fieldDonCount(game.state, "p1")).toBe(8);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
    // No DON!! set active beyond the six that already were, and no +1000.
    expect(game.state.players.p1.activeDon.length).toBeLessThanOrEqual(6);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("EB02-010#1 (control): with only {Straw Hat Crew} Characters both halves resolve", () => {
    const game = table("faq-eb02-010-1-control")
      .withLeader("p1", "EB02-010")
      .withBoard("p1", [character("nami", "EB02-017")])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "EB02-010" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.activeDon.length).toBeGreaterThan(6);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  describe("EB02-011 Arlong", () => {
    /** p1 plays Arlong under `leader` and locks p2's `lock`. */
    const arlongLocks = (
      seed: string,
      leader: string,
      p2Board: ReturnType<typeof character>[],
      lock: string,
    ) => {
      const game = table(seed)
        .withLeader("p1", leader)
        .withHand("p1", [
          instance("arlong", "EB02-011"),
          instance("apoo", "EB01-015"),
        ])
        .withBoard("p1", [character("p1-rested", "FIX-001", { rested: true })])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", p2Board)
        .withLife("p2", copies(2, "FIX-001", "p2-life"))
        .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
        .build();
      game.play({ type: "play-card", cardNumber: "EB02-011" });
      while (game.state.pendingEffect) {
        const options = effectOptions(game);
        game.play({
          type: "resolve-effect",
          optionId: options.includes(lock) ? lock : options[0],
        });
      }
      return game;
    };

    it("EB02-011#1: a Character that cannot be rested cannot attack", () => {
      const game = arlongLocks(
        "faq-eb02-011-1",
        "OP06-020",
        [character("locked", "FIX-002")],
        "locked",
      );
      game.pass();
      expect(game.state.activePlayer).toBe("p2");
      expect(attackers(game)).not.toContain("locked");
    });

    it("EB02-011#2: it cannot use an [Activate: Main] that rests it", () => {
      // EB01-016 Bingoh's [Activate: Main] rests itself as its cost.
      const game = arlongLocks(
        "faq-eb02-011-2",
        "OP06-020",
        [character("bingoh", "EB01-016")],
        "bingoh",
      );
      game.pass();
      expect(game.state.activePlayer).toBe("p2");
      expect(activations(game, "EB01-016")).toEqual([]);
    });

    it("EB02-011#2 (control): an unlocked Bingoh is offered", () => {
      const game = arlongLocks(
        "faq-eb02-011-2-control",
        "OP06-020",
        [character("bingoh", "EB01-016"), character("other", "FIX-002")],
        "other",
      );
      game.pass();
      expect(activations(game, "EB01-016")).not.toEqual([]);
    });

    it("EB02-011#3: it cannot use [Blocker]", () => {
      const game = arlongLocks(
        "faq-eb02-011-3",
        "OP06-020",
        [character("blueno", "EB01-017")],
        "blueno",
      );
      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "p2-leader",
      });
      settle(game);
      expect(game.state.phase).toBe("block");
      expect(blockers(game)).toEqual([]);
    });

    it("EB02-011#4: an effect cannot rest it either", () => {
      const game = arlongLocks(
        "faq-eb02-011-4",
        "OP06-020",
        [character("locked", "FIX-001")],
        "locked",
      );
      game.play({ type: "play-card", cardNumber: "EB01-015" });
      if (effectOptions(game).includes("locked")) {
        game.play({ type: "resolve-effect", optionId: "locked" });
      }
      settle(game);
      expect(game.state.players.p2.board[0]?.rested).not.toBe(true);
    });

    it("EB02-011#5: under a Leader with neither type, nothing is locked", () => {
      const game = arlongLocks(
        "faq-eb02-011-5",
        "FIX-LEADER-R",
        [character("free", "FIX-002")],
        "free",
      );
      game.pass();
      expect(game.state.activePlayer).toBe("p2");
      expect(attackers(game)).toContain("free");
    });
  });

  describe("an all-names Leader satisfies a named-card condition", () => {
    // SEALED-LUFFY is the pool's one Leader treated as having every card
    // name; see `packages/cards/src/sealed-promo.ts`.
    const blockersUnder = (seed: string, leader: string, body: string) => {
      const game = table(seed)
        .withLeader("p2", leader)
        .withBoard("p2", [character("body", body)])
        .withLife("p2", copies(2, "FIX-001", "p2-life"))
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "p2-leader",
      });
      settle(game);
      return blockers(game);
    };

    it("EB02-012#1: Gaimon gains [Blocker] from a Leader with every card name", () => {
      expect(
        blockersUnder("faq-eb02-012-1", "SEALED-LUFFY", "EB02-012"),
      ).toEqual(["body"]);
    });

    it("EB02-033#1: Klabautermann gains [Blocker] from a Leader with every card name", () => {
      expect(
        blockersUnder("faq-eb02-033-1", "SEALED-LUFFY", "EB02-033"),
      ).toEqual(["body"]);
    });

    it("EB02-012#1 / EB02-033#1 (control): an ordinary Leader grants nothing", () => {
      expect(
        blockersUnder("faq-eb02-012-c", "FIX-LEADER-B", "EB02-012"),
      ).toEqual([]);
      expect(
        blockersUnder("faq-eb02-033-c", "FIX-LEADER-B", "EB02-033"),
      ).toEqual([]);
    });
  });

  describe("the 3-DON!! gate covers the play from hand", () => {
    /** p2 plays `card` with `field` DON!! on its field. */
    const digTable = (seed: string, card: string, field: number) => {
      const game = defending(seed)
        .withDonDeck("p2", 10 - field)
        .withHand("p2", [
          instance("digger", card),
          instance("zou", "FIX-STAGE-ZOU"),
        ])
        .withDeckTop("p2", copies(7, "FIX-001", "p2-deck"))
        .build();
      game.play({ type: "play-card", cardNumber: card });
      while (game.state.pendingEffect) {
        const options = effectOptions(game);
        game.play({
          type: "resolve-effect",
          optionId: options.includes("zou") ? "zou" : options[0],
        });
      }
      return game;
    };

    it("EB02-013#1: Carrot with 2 DON!! on the field cannot play [Zou] from hand", () => {
      const game = digTable("faq-eb02-013-1", "EB02-013", 2);
      expect(game.state.players.p2.stage).toBeNull();
      expect(ids(game.state.players.p2.hand)).toEqual(["zou"]);
    });

    it("EB02-013#1 (control): with 3 DON!! it plays [Zou] from hand", () => {
      const game = digTable("faq-eb02-013-1-control", "EB02-013", 3);
      expect(game.state.players.p2.stage?.instanceId).toBe("zou");
    });

    it("EB02-032#1: Iceburg with 2 DON!! on the field resolves nothing", () => {
      // No [Galley-La Company] card is in the pool, so the play itself cannot
      // be offered either way; what the ruling pins is that the gate covers
      // the whole clause, so with 2 DON!! not even the look happens.
      const game = digTable("faq-eb02-032-1", "EB02-032", 2);
      expect(game.state.players.p2.deck).toHaveLength(7);
      expect(ids(game.state.players.p2.deck)[0]).toBe("p2-deck-1");
      expect(ids(game.state.players.p2.hand)).toEqual(["zou"]);
    });
  });

  it("EB02-015#1: the end-of-turn DON!! is set active after Bonney has left the field", () => {
    // EB01-020 Chambres, under a {Supernovas} Leader, returns Bonney to hand.
    const game = table("faq-eb02-015-1")
      .withLeader("p1", "OP12-020")
      .withHand("p1", [
        instance("bonney", "EB02-015"),
        instance("chambres", "EB01-020"),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-015" });
    settle(game);
    game.play({ type: "activate-main", sourceCardNumber: "EB01-020" });
    while (game.state.pendingEffect) {
      const options = effectOptions(game);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("bonney") ? "bonney" : options[0],
      });
    }
    expect(game.state.players.p1.board).toEqual([]);
    expect(game.state.players.p1.activeDon).toHaveLength(2);

    game.pass();
    settle(game);
    expect(game.state.players.p1.activeDon).toHaveLength(3);
  });

  it("EB02-019#1: Zoro loses the turn-one attack on Characters when the opponent drops to 1", () => {
    const game = table("faq-eb02-019-1")
      .withHand("p1", [
        instance("zoro", "EB02-019"),
        instance("tbone", "EB01-049"),
      ])
      .withBoard("p2", [
        character("small", "FIX-001", { rested: true }),
        character("other", "FIX-002", { rested: true }),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-019" });
    settle(game);
    expect(attackTargets(game, "zoro")).toEqual(
      expect.arrayContaining(["small", "other"]),
    );

    game.play({ type: "play-card", cardNumber: "EB01-049" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);
    expect(ids(game.state.players.p2.board)).toEqual(["other"]);

    expect(attackTargets(game, "zoro")).toEqual([]);
  });

  describe("EB02-022 Usopp", () => {
    const usoppLands = (
      seed: string,
      board: ReturnType<typeof character>[],
      p2Board: ReturnType<typeof character>[] = [],
    ) => {
      const game = table(seed)
        .withBoard("p1", board)
        .withHand("p1", [
          instance("usopp", "EB02-022"),
          instance("vanilla", "FIX-002"),
        ])
        .withBoard("p2", p2Board)
        .build();
      game.play({ type: "play-card", cardNumber: "EB02-022" });
      while (game.state.pendingEffect) {
        const options = effectOptions(game);
        game.play({
          type: "resolve-effect",
          optionId: options.includes("vanilla") ? "vanilla" : options[0],
        });
      }
      return game;
    };

    it("EB02-022#1: Usopp counts itself among the 5000-power Characters", () => {
      const game = usoppLands("faq-eb02-022-1", [
        character("big-1", "OP12-025"),
        character("big-2", "OP12-025"),
      ]);
      expect(ids(game.state.players.p1.hand)).toEqual(["vanilla"]);
    });

    it("EB02-022#1 (control): with one other 5000-power Character it plays the body", () => {
      const game = usoppLands("faq-eb02-022-1-control", [
        character("big-1", "OP12-025"),
      ]);
      expect(ids(game.state.players.p1.board)).toContain("vanilla");
    });

    it("EB02-022#2: under OP09-004 Shanks Usopp is 4000 and does not count", () => {
      const game = usoppLands(
        "faq-eb02-022-2",
        [character("big-1", "OP12-025"), character("big-2", "OP12-025")],
        [character("shanks", "OP09-004")],
      );
      expect(ids(game.state.players.p1.board)).toContain("vanilla");
    });
  });

  it("EB02-028#1: without a Whitebeard Pirates Leader Ace plays nothing from hand", () => {
    const game = table("faq-eb02-028-1")
      .withLeader("p1", "FIX-LEADER-R")
      .withHand("p1", [instance("ace", "EB02-028"), instance("two", "FIX-002")])
      .withDeckTop("p1", copies(5, "FIX-002", "p1-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-028" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["ace"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["two"]);
  });

  describe("EB02-030 And That's When Somebody Makes Fun of Their Friend's Dream!!!!", () => {
    /**
     * p2 swings at p1's Leader and p1 answers with the Counter. EB02-055
     * Jinbe then arrives off p1's Life, EB02-019 Zoro rests it, and p2's
     * Kin'emon attacks `target`.
     */
    const dreamTable = (seed: string, target: string) => {
      const game = defending(seed)
        .withLeader("p1", "OP06-020")
        .withHand("p1", [
          instance("dream", "EB02-030"),
          instance("fodder", "FIX-001"),
        ])
        .withBoard("p1", [character("old", "FIX-002", { rested: true })])
        .withLife("p1", [
          instance("jinbe", "EB02-055"),
          instance("p1-life-2", "FIX-001"),
        ])
        .withLeader("p2", "EB02-010")
        .withBoard("p2", [character("kinemon", "OP12-025")])
        .withHand("p2", [instance("zoro", "EB02-019")])
        .withLife("p2", copies(2, "FIX-001", "p2-life"))
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "p2-leader",
        targetInstanceId: "p1-leader",
      });
      while (game.state.phase === "block") game.pass();
      game.play({
        type: "activate-counter-event",
        sourceCardNumber: "EB02-030",
      });
      settle(game);
      game.pass();
      expect(game.state.phase).toBe("trigger");
      game.play({ type: "resolve-trigger", optionId: "activate" });
      settle(game);
      expect(ids(game.state.players.p1.board)).toContain("jinbe");

      game.play({ type: "play-card", cardNumber: "EB02-019" });
      if (effectOptions(game).includes("jinbe")) {
        game.play({ type: "resolve-effect", optionId: "jinbe" });
      }
      settle(game);
      game.play({
        type: "attack",
        attackerInstanceId: "kinemon",
        targetInstanceId: target,
      });
      declineUntilAsked(game);
      return game;
    };

    it("EB02-030#1: a Character played after the Counter is not protected", () => {
      const game = dreamTable("faq-eb02-030-1", "jinbe");
      expect(
        game.summaries("p1").some((text) => text.includes("instead")),
      ).toBe(false);
      settle(game);
      expect(ids(game.state.players.p1.trash)).toContain("jinbe");
      expect(ids(game.state.players.p1.hand)).toEqual(["fodder"]);
    });

    it("EB02-030#1 (control): a Character already on the field is", () => {
      const game = dreamTable("faq-eb02-030-1-control", "old");
      expect(game.player).toBe("p1");
      expect(
        game.summaries("p1").some((text) => text.includes("instead")),
      ).toBe(true);
    });
  });

  describe("EB02-035 Sanji & Pudding", () => {
    it("EB02-035#1: two separate DON!! −1 payments do not add a DON!!", () => {
      // OP15-077 Lightning Dragon is a cost-0 [Main] with DON!! −1.
      const game = table("faq-eb02-035-1")
        .withBoard("p1", [character("pudding", "EB02-035")])
        .withHand("p1", copies(2, "OP15-077", "dragon"))
        .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
        .build();

      for (const id of ["dragon-1", "dragon-2"]) {
        const event = game
          .legalActions()
          .find(
            (action) =>
              action.type === "activate-main" &&
              action.sourceCardNumber === "OP15-077" &&
              action.summary.length > 0,
          );
        expect(event, id).toBeDefined();
        game.submit(event!);
        applyOptional(game);
        settle(game);
      }

      expect(fieldDonCount(game.state, "p1")).toBe(8);
      expect(game.state.players.p1.donDeck).toHaveLength(2);
    });

    it("EB02-035#2: played by ST18-005 Luffy-Tarou after its DON!! −1, the parity check sees 6 v 6 and draws", () => {
      const game = table("faq-eb02-035-2")
        .withDonDeck("p1", 3)
        .withDonDeck("p2", 4)
        .withHand("p1", [
          instance("tarou", "ST18-005"),
          instance("pudding", "EB02-035"),
        ])
        .withDeckTop("p1", [instance("drawn", "FIX-001")])
        .build();
      expect(fieldDonCount(game.state, "p1")).toBe(7);
      expect(fieldDonCount(game.state, "p2")).toBe(6);

      game.play({ type: "play-card", cardNumber: "ST18-005" });
      applyOptional(game);
      while (game.state.pendingEffect) {
        const options = effectOptions(game);
        game.play({
          type: "resolve-effect",
          optionId: options.includes("pudding") ? "pudding" : options[0],
        });
      }

      expect(ids(game.state.players.p1.board)).toContain("pudding");
      expect(fieldDonCount(game.state, "p1")).toBe(6);
      expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    });
  });

  it("EB02-047#1: Blueno can play the CP Character it trashed from hand as the cost", () => {
    // EB01-044 Funkfreed is a cost-1 {CP9} Character.
    const game = table("faq-eb02-047-1")
      .withBoard("p1", [character("blueno", "EB02-047")])
      .withHand("p1", [instance("funkfreed", "EB01-044")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "EB02-047" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "funkfreed" });
    expect(effectOptions(game)).toContain("funkfreed");
    game.play({ type: "resolve-effect", optionId: "funkfreed" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["funkfreed"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["blueno"]);
  });

  describe("EB02-052 Enel", () => {
    const enelAttacks = (seed: string, life: number) => {
      const game = table(seed)
        .withBoard("p1", [character("enel", "EB02-052")])
        .withHand("p1", [instance("fodder", "FIX-001")])
        .withLife("p1", copies(life, "FIX-001", "p1-life"))
        .withDeckTop("p1", [instance("banked", "FIX-002")])
        .withLife("p2", copies(2, "FIX-001", "p2-life"))
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "enel",
        targetInstanceId: "p2-leader",
      });
      applyOptional(game);
      if (effectOptions(game).includes("fodder")) {
        game.play({ type: "resolve-effect", optionId: "fodder" });
      }
      settle(game);
      return game;
    };

    it("EB02-052#1: on 2 Life the hand cost buys no +1000", () => {
      const game = enelAttacks("faq-eb02-052-1", 2);
      expect(game.state.players.p1.life).toHaveLength(2);
      expect(currentPower(game.state, "p1", "enel")).toBe(11000);
    });

    it("EB02-052#1 (control): on 1 Life it banks a Life card and gains +1000", () => {
      const game = enelAttacks("faq-eb02-052-1-control", 1);
      expect(game.state.players.p1.life).toHaveLength(2);
      expect(currentPower(game.state, "p1", "enel")).toBe(12000);
    });
  });

  describe("EB02-055 Jinbe", () => {
    const jinbeRevealed = (seed: string, below: number) => {
      const game = defending(seed)
        .withLeader("p1", "OP06-020")
        .withLife("p1", [
          instance("jinbe", "EB02-055"),
          ...copies(below, "FIX-001", "p1-life"),
        ])
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "p2-leader",
        targetInstanceId: "p1-leader",
      });
      declineDefence(game);
      expect(game.state.phase).toBe("trigger");
      const activate = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-trigger" && action.optionId === "activate",
        );
      if (activate) game.submit(activate);
      settle(game);
      return game;
    };

    it("EB02-055#1: from 3 Life (2 once Jinbe has left) the [Trigger] plays it", () => {
      const game = jinbeRevealed("faq-eb02-055-1", 2);
      expect(ids(game.state.players.p1.board)).toEqual(["jinbe"]);
    });

    it("EB02-055#1 (control): from 4 Life (3 once Jinbe has left) it does not", () => {
      const game = jinbeRevealed("faq-eb02-055-1-control", 3);
      expect(game.state.players.p1.board).toEqual([]);
    });
  });

  it("EB02-059#1: only a yellow [Sanji] of cost 5 or less can be played", () => {
    const game = defending("faq-eb02-059-1")
      .withHand("p1", [
        instance("help", "EB02-059"),
        // Purple, cost 6.
        instance("sanji-6", "OP07-064"),
        // Red, cost 2.
        instance("sanji-red", "ST21-003"),
        // Yellow, cost 5: the one the clause can play.
        instance("sanji-yellow", "EB02-054"),
      ])
      .withLife("p1", [instance("p1-life", "FIX-001")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", sourceCardNumber: "EB02-059" });
    while (
      game.state.pendingEffect &&
      !effectOptions(game).includes("sanji-yellow")
    ) {
      game.play({ type: "resolve-effect" });
    }

    const options = effectOptions(game);
    expect(options).toContain("sanji-yellow");
    expect(options).not.toContain("sanji-6");
    expect(options).not.toContain("sanji-red");
  });

  it("EB02-061#1: Luffy loses [Rush] once the opponent's DON!! drop to 4", () => {
    // p2's EB01-034 Ms. Wednesday pays DON!! −1 when p1's Leader attacks, and
    // p2's Leader is not {Baroque Works}, so nothing comes back.
    const game = table("faq-eb02-061-1")
      .withLeader("p1", "EB02-010")
      .withHand("p1", [instance("luffy", "EB02-061")])
      .withDonDeck("p2", 5)
      .withBoard("p2", [character("wednesday", "EB01-034")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-061" });
    settle(game);
    expect(attackers(game)).toContain("luffy");

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    if (game.player === "p2" && effectOptions(game, "p2").length > 0) {
      game.play({ type: "resolve-effect", summary: "Activate" });
      settle(game);
    }
    declineDefence(game);
    settle(game);
    expect(fieldDonCount(game.state, "p2")).toBe(4);

    expect(game.player).toBe("p1");
    expect(attackers(game)).not.toContain("luffy");
  });
});
