import { describe, expect, it } from "vitest";
import { currentPower, effectiveCost } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for EB-03 and for the OP-01 to OP-04 cards the pool
 * registers, one case per ruling, named by the Q&A id (`<card>#<n>`, in the
 * order the PDF prints that card's questions).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. Comments paraphrase the ruling rather than quote
 * it: the repository holds none of Bandai's text. A ruling the engine does not
 * follow is an `it.fails` that says what the engine does instead -- it turns
 * green, and so red under `it.fails`, the day the engine is fixed, which is
 * the prompt to promote it.
 *
 * Source PDFs:
 *   https://en.onepiece-cardgame.com/pdf/qa_eb03.pdf
 *   https://en.onepiece-cardgame.com/pdf/qa_op01.pdf
 *   https://en.onepiece-cardgame.com/pdf/qa_op02.pdf
 *   https://en.onepiece-cardgame.com/pdf/qa_op03.pdf
 *   https://en.onepiece-cardgame.com/pdf/qa_op04.pdf
 *
 * The positions sit on the fixture decks: FIX-001 (cost 1, 2000, Counter
 * +1000) and FIX-002 (cost 2, 4000) print nothing, so nothing beside the card
 * under test can be the reason a case passes.
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 * Empty while every ruling in this unit has one.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const RED = "FIXTURE-RED";
const BLUE = "FIXTURE-BLUE";

/** p1 to act in its Main Phase, both sides bare, all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(RED, BLUE)
    .seed(seed)
    .atTurn(3, { active: "p1" })
    .bareTable();

/** p2 to act in its Main Phase, for the clauses that open on p1's opponent's turn. */
const theirTurn = (seed: string) =>
  scenario()
    .decks(RED, BLUE)
    .seed(seed)
    .atTurn(4, { active: "p2" })
    .bareTable();

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

/** Takes the apply branch of an `optional` prompt, if one is open. */
function apply(game: Game): void {
  if (effectOptions(game).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
}

/** Passes the defender's Block and Counter windows without doing anything. */
function noDefence(game: Game): void {
  while (
    game.state.activeAttack &&
    (game.state.phase === "block" || game.state.phase === "counter")
  ) {
    game.pass();
  }
}

const attack = (game: Game, attacker: string, target: string): void => {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
};

const attackTargets = (game: Game, attacker: string): string[] =>
  game
    .legalActions()
    .flatMap((action) =>
      action.type === "attack" && action.attackerInstanceId === attacker
        ? [action.targetInstanceId]
        : [],
    );

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const offersMain = (game: Game, cardNumber: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === cardNumber,
    );

describe("FAQ EB-03", () => {
  it("EB03-003#1: Uta under another Leader plays no vanilla body from hand", () => {
    // No -- the play sits behind the [Uta] Leader condition with the draw.
    const game = table("faq-eb03-003-1")
      .withHand("p1", [
        instance("uta", "EB03-003"),
        // EB03-002 Ain: 6000 power and an empty effect box.
        instance("ain", "EB03-002"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-003" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["uta"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["ain"]);
  });

  it("EB03-004#1: a Shuraiya whose base power became 6000 or more switches Carina's buff off", () => {
    // OP06-009 Shuraiya's [When Attacking] makes its base power the opposing
    // Leader's -- 7000 off OP13-003 here, until its controller's next turn.
    // Carina's condition counts base power, so on the opponent's turn that
    // follows she gains nothing.
    const game = table("faq-eb03-004-1")
      // EB03-001 is a multicoloured Leader.
      .withLeader("p1", "EB03-001")
      .withLeader("p2", "OP13-003")
      .withBoard("p1", [
        character("carina", "EB03-004"),
        character("shuraiya", "OP06-009"),
      ])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    attack(game, "shuraiya", "p2-leader");
    settle(game);
    noDefence(game);
    settle(game);
    expect(game.state.phase).toBe("main");
    game.pass();
    expect(game.state.activePlayer).toBe("p2");

    expect(currentPower(game.state, "p1", "shuraiya")).toBe(7000);
    expect(currentPower(game.state, "p1", "carina")).toBe(2000);
  });

  it("EB03-006#1: a Leader already at 0 power can still take the -5000 to draw", () => {
    // Yes -- the cost only asks for an active Leader. The second Nami pays it
    // on a Leader the first one already took to 0.
    const game = table("faq-eb03-006-1")
      .withHand("p1", copies(2, "EB03-006", "nami"))
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-006" });
    apply(game);
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["nami-2", "p1-deck-1"]);

    game.play({ type: "play-card", cardNumber: "EB03-006" });
    apply(game);
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(-5000);
    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1", "p1-deck-2"]);
  });

  it("EB03-008#1: under OP11-001 Koby, Hibari can choose itself and attack an active Character", () => {
    // Yes -- Hibari is {SWORD}, the Koby Leader lets it attack Characters the
    // turn it is played, and its own [On Play] lets it reach an active one.
    const game = table("faq-eb03-008-1")
      .withLeader("p1", "OP11-001")
      .withHand("p1", [instance("hibari", "EB03-008")])
      .withBoard("p2", [character("active", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-008" });
    expect(effectOptions(game)).toContain("hibari");
    game.play({ type: "resolve-effect", optionId: "hibari" });
    settle(game);

    expect(attackTargets(game, "hibari")).toContain("active");
  });

  it("EB03-013#1: Carrot plays [Zou] even when nothing was K.O.'d", () => {
    // Yes -- the K.O. is "up to 1", and the Stage play follows regardless.
    const game = table("faq-eb03-013-1")
      .withHand("p1", [
        instance("carrot", "EB03-013"),
        instance("zou", "FIX-STAGE-ZOU"),
      ])
      // Active, so the K.O. has no legal target.
      .withBoard("p2", [character("active", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-013" });
    settle(game);
    game.play({ type: "activate-main", sourceCardNumber: "EB03-013" });
    expect(effectOptions(game)).toContain("zou");
    game.play({ type: "resolve-effect", optionId: "zou" });
    settle(game);

    expect(game.state.players.p1.stage?.instanceId).toBe("zou");
    expect(ids(game.state.players.p2.board)).toEqual(["active"]);
  });

  it("EB03-017#1: Bonney under a non-{Supernovas} Leader does not freeze a Character", () => {
    // No -- the rest-lock half sits behind the Leader condition too.
    const game = table("faq-eb03-017-1")
      .withHand("p1", [instance("bonney", "EB03-017")])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-017" });

    expect(game.state.pendingEffect).toBeNull();
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "target")
        ?.cannotRestUntilTurn,
    ).toBeUndefined();
  });

  it("EB03-020#1: both +2000s land on the one card the Counter chose", () => {
    // No -- the "additional" +2000 goes to that same card, never a second one.
    const game = theirTurn("faq-eb03-020-1")
      .withHand("p1", [instance("event", "EB03-020")])
      // Two {FILM} Characters switch on the second +2000.
      .withBoard("p1", [
        character("film-1", "EB03-002"),
        character("film-2", "EB03-003"),
      ])
      .withBoard("p2", [character("attacker", "EB03-061")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 8000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(currentPower(game.state, "p1", "film-1")).toBe(6000);
    expect(currentPower(game.state, "p1", "film-2")).toBe(7000);
  });

  it("EB03-021#1: Alvida cannot bottom-deck a base-cost-4 Character discounted to 3", () => {
    // No -- the second target reads base cost. EB01-046 Brook's [On Play]
    // takes OP12-052 Fullbody (base cost 4, 6000 power) to cost 3 first.
    const game = table("faq-eb03-021-1")
      .withHand("p1", [
        instance("brook", "EB01-046"),
        instance("alvida", "EB03-021"),
        instance("fodder", "FIX-001"),
      ])
      .withBoard("p2", [
        character("fullbody", "OP12-052"),
        character("cheap", "FIX-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-046" });
    game.play({ type: "resolve-effect", optionId: "fullbody" });
    settle(game);
    const fullbody = game.state.players.p2.board.find(
      (card) => card.instanceId === "fullbody",
    )!;
    expect(effectiveCost(game.state, "p2", fullbody)).toBe(3);

    game.play({ type: "play-card", cardNumber: "EB03-021" });
    apply(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    // The first target: FIX-002 has 4000 base power, Fullbody 6000.
    expect(effectOptions(game)).not.toContain("fullbody");
    game.play({ type: "resolve-effect", optionId: "cheap" });
    // The second: base cost 3 or less, which Fullbody's discount does not reach.
    expect(effectOptions(game)).not.toContain("fullbody");
  });

  it("EB03-025#1: Hina cannot return a Character with less than 6000 base power", () => {
    // No -- the clause names exactly 6000 base power.
    const game = table("faq-eb03-025-1")
      .withHand("p1", [
        instance("hina", "EB03-025"),
        instance("fodder", "FIX-001"),
      ])
      .withBoard("p2", [
        character("small", "FIX-002"),
        character("exact", "OP12-052"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-025" });
    apply(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });

    const options = effectOptions(game);
    expect(options).toContain("exact");
    expect(options).not.toContain("small");
  });

  it("EB03-026#1: Hancock can bottom-deck herself and still give the two DON!!", () => {
    // Yes -- the cost names any of your Characters, Hancock included.
    const game = table("faq-eb03-026-1")
      .withBoard("p1", [
        character("hancock", "EB03-026"),
        character("ally", "FIX-002"),
      ])
      .withDon("p1", { active: 8, rested: 2 })
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "EB03-026" });
    expect(effectOptions(game)).toContain("hancock");
    game.play({ type: "resolve-effect", optionId: "hancock" });
    if (effectOptions(game).includes("ally")) {
      game.play({ type: "resolve-effect", optionId: "ally" });
    }
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["ally"]);
    expect(ids(game.state.players.p1.deck).at(-1)).toBe("hancock");
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(1);
  });

  it("EB03-027#1: Marguerite cannot return a Character with less than 7000 base power", () => {
    // No -- the clause names exactly 7000 base power.
    const game = table("faq-eb03-027-1")
      .withHand("p1", [instance("marguerite", "EB03-027")])
      .withBoard("p2", [
        character("small", "OP12-052"),
        character("exact", "EB03-013"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-027" });

    const options = effectOptions(game);
    expect(options).toContain("exact");
    expect(options).not.toContain("small");
  });

  // Using an Event's [Main] through Reiju is not activating the Event: the
  // record "an Event was activated this turn" stays empty (OP15-002 Lucy reads
  // it), and an opposing OP15-119 Luffy, which answers every Event its
  // opponent activates, stays silent. The hand-played control shows the same
  // Luffy answering a real activation.
  it("EB03-031#1: activating a trashed Event's [Main] through Reiju is not activating an Event", () => {
    const game = table("faq-eb03-031-1")
      .withLeader("p1", "OP12-041")
      .withHand("p1", [instance("reiju", "EB03-031")])
      // OP05-077 Gamma Knife is a [Main] Event in the pool.
      .withTrash("p1", [instance("spent", "OP05-077")])
      .withBoard("p2", [
        character("target", "FIX-002"),
        character("luffy", "OP15-119"),
      ])
      .withLife("p2", [instance("p2-life", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-031" });
    apply(game);
    if (effectOptions(game).includes("spent")) {
      game.play({ type: "resolve-effect", optionId: "spent" });
    }
    settle(game);
    expect(currentPower(game.state, "p2", "target")).toBeLessThan(4000);

    expect(game.state.eventsActivatedOnTurn?.p1).toBeUndefined();
    expect(currentPower(game.state, "p2", "luffy")).toBe(
      currentPower(game.state, "p2", "luffy", false),
    );
    expect(
      game.events.some(
        (event) => event.type === "card-revealed" && event.playerId === "p2",
      ),
    ).toBe(false);
  });

  it("EB03-031#1 control: the same Event activated from hand wakes OP15-119", () => {
    const game = table("faq-eb03-031-1-control")
      .withHand("p1", [instance("knife", "OP05-077")])
      .withBoard("p2", [
        character("target", "FIX-002"),
        character("luffy", "OP15-119"),
      ])
      .withLife("p2", [instance("p2-life", "FIX-002")])
      .build();
    const before = currentPower(game.state, "p2", "luffy");

    game.play({ type: "activate-main", sourceCardNumber: "OP05-077" });
    settle(game);

    expect(game.state.eventsActivatedOnTurn?.p1).toBeDefined();
    // FIX-002 on top of Life costs 2: +2000 for the turn.
    expect(currentPower(game.state, "p2", "luffy")).toBe(before + 2000);
  });

  describe("EB03-038 Thanks for the Treat", () => {
    it("EB03-038#1: with no Characters at all, the [Main] adds no DON!!", () => {
      // No -- the all-GERMA board condition needs a Character on the field.
      const game = table("faq-eb03-038-1")
        .withHand("p1", [instance("event", "EB03-038")])
        .withDon("p1", { active: 2 })
        .withDon("p2", { active: 5 })
        .withDonDeck("p1", 4)
        .build();
      const donDeck = game.state.players.p1.donDeck.length;

      if (offersMain(game, "EB03-038")) {
        game.play({ type: "activate-main", sourceCardNumber: "EB03-038" });
        apply(game);
        settle(game);
      }

      expect(game.state.players.p1.donDeck).toHaveLength(donDeck);
    });

    it("EB03-038#1 (control): one GERMA Character is enough", () => {
      const game = table("faq-eb03-038-1-control")
        .withHand("p1", [instance("event", "EB03-038")])
        .withBoard("p1", [character("germa", "OP06-060")])
        .withDon("p1", { active: 2 })
        .withDon("p2", { active: 5 })
        .withDonDeck("p1", 4)
        .build();
      const donDeck = game.state.players.p1.donDeck.length;

      game.play({ type: "activate-main", sourceCardNumber: "EB03-038" });
      apply(game);
      settle(game);

      expect(game.state.players.p1.donDeck).toHaveLength(donDeck - 2);
    });
  });

  it("EB03-039#1: Ulti under a non-{Animal Kingdom Pirates} Leader plays nothing from the trash", () => {
    // No -- the play sits behind the Leader condition with the draw.
    const game = table("faq-eb03-039-1")
      .withHand("p1", [instance("ulti", "EB03-039")])
      .withTrash("p1", [instance("ain", "EB03-002")])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-039" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["ulti"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["ain"]);
  });

  describe("EB03-051 Charlotte Smoothie", () => {
    const smoothie = (seed: string, opponentBoard: string[]) =>
      table(seed)
        .withHand("p1", [instance("smoothie", "EB03-051")])
        .withLife("p1", [
          instance("life-up", "FIX-001", { faceUp: true }),
          instance("life-down", "FIX-001"),
        ])
        .withBoard(
          "p2",
          opponentBoard.map((id) => character(id, "FIX-001")),
        )
        .build();

    it("EB03-051#1: declining the K.O. still turns every Life card face-down", () => {
      // Yes, they still turn face-down.
      const game = smoothie("faq-eb03-051-1", ["small"]);
      game.play({ type: "play-card", cardNumber: "EB03-051" });
      const decline = effectOptions(game).find((id) => id !== "small");
      expect(decline).toBeDefined();
      game.play({ type: "resolve-effect", optionId: decline });
      settle(game);

      expect(ids(game.state.players.p2.board)).toEqual(["small"]);
      expect(
        game.state.players.p1.life.map((card) => card.faceUp ?? false),
      ).toEqual([false, false]);
    });

    it("EB03-051#2: with nothing to K.O., every Life card still turns face-down", () => {
      // Yes, they still turn face-down.
      const game = smoothie("faq-eb03-051-2", []);
      game.play({ type: "play-card", cardNumber: "EB03-051" });
      settle(game);

      expect(
        game.state.players.p1.life.map((card) => card.faceUp ?? false),
      ).toEqual([false, false]);
    });
  });

  describe("EB03-055 Nico Robin", () => {
    /**
     * p2 attacks p1's rested Robin with OP06-007 Shanks and K.O.s it in
     * battle; Robin's [On K.O.] then offers p1 the damage.
     */
    const robinFalls = (
      seed: string,
      p2Life: ReturnType<typeof instance>[],
    ) => {
      const game = theirTurn(seed)
        .withBoard("p1", [character("robin", "EB03-055", { rested: true })])
        .withBoard("p2", [character("shanks", "OP06-007")])
        .withHand("p2", copies(2, "FIX-001", "p2-hand"))
        .withLife("p2", p2Life)
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .build();
      attack(game, "shanks", "robin");
      noDefence(game);
      expect(ids(game.state.players.p1.trash)).toContain("robin");
      expect(game.player).toBe("p1");
      game.play({ type: "resolve-effect", optionId: "apply" });
      return game;
    };

    it("EB03-055#1: the damage opens no Block or Counter window", () => {
      // No -- it is effect damage, not an attack.
      const game = robinFalls("faq-eb03-055-1", [
        instance("p2-life-1", "FIX-001"),
        instance("p2-life-2", "FIX-001"),
      ]);

      expect(game.state.activeAttack).toBeNull();
      expect(ids(game.state.players.p2.life)).toEqual(["p2-life-2"]);
      expect(ids(game.state.players.p2.hand)).toContain("p2-life-1");
      expect(game.state.phase).toBe("main");
    });

    it("EB03-055#2: the damaged Life card's [Trigger] can be activated", () => {
      // Yes. EB03-020's [Trigger] sets one of its owner's Characters active.
      const game = robinFalls("faq-eb03-055-2", [
        instance("trigger", "EB03-020"),
        instance("p2-life-2", "FIX-001"),
      ]);

      expect(game.state.phase).toBe("trigger");
      expect(game.player).toBe("p2");
      game.play({ type: "resolve-trigger", optionId: "activate" });
      settle(game);
      expect(ids(game.state.players.p2.trash)).toContain("trigger");
      expect(
        game.state.players.p2.board.find((card) => card.instanceId === "shanks")
          ?.rested,
      ).toBe(false);
    });

    it("EB03-055#3: the damaged Life card goes to hand, not the trash", () => {
      // No -- [Banish] only trashes Life cards lost to an attack's damage. The
      // `deal-damage` node never banishes, so the Life card reaches the hand.
      const game = robinFalls("faq-eb03-055-3", [
        instance("p2-life-1", "FIX-001"),
        instance("p2-life-2", "FIX-001"),
      ]);

      expect(ids(game.state.players.p2.hand)).toContain("p2-life-1");
      expect(ids(game.state.players.p2.trash)).not.toContain("p2-life-1");
    });

    it("EB03-055#4: the [On K.O.] deals exactly 1 damage", () => {
      // No -- [Double Attack] only doubles the damage of an attack; the
      // `deal-damage` node deals one point whatever its source carries.
      const game = robinFalls("faq-eb03-055-4", [
        instance("p2-life-1", "FIX-001"),
        instance("p2-life-2", "FIX-001"),
        instance("p2-life-3", "FIX-001"),
      ]);

      expect(game.state.players.p2.life).toHaveLength(2);
    });

    it("EB03-055#5: damage to an opponent with 0 Life wins the game", () => {
      // Yes, you can.
      const game = robinFalls("faq-eb03-055-5", []);

      expect(game.state.phase).toBe("finished");
      expect(game.state.winner).toBe("p1");
    });
  });

  it("EB03-061#1: with no rested DON!!, Uta can still rest an opponent's Character", () => {
    // Yes -- setting a DON!! active is "up to 1", and the rest follows anyway.
    const game = table("faq-eb03-061-1")
      .withBoard("p1", [character("uta", "EB03-061")])
      .withBoard("p2", [character("small", "FIX-002")])
      .build();
    expect(game.state.players.p1.restedDon).toEqual([]);

    expect(offersMain(game, "EB03-061")).toBe(true);
    game.play({ type: "activate-main", sourceCardNumber: "EB03-061" });
    expect(effectOptions(game)).toContain("small");
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "small")
        ?.rested,
    ).toBe(true);
  });
});

describe("FAQ OP-01", () => {
  describe("OP01-016 Nami", () => {
    const namiLooks = (seed: string, deck: ReturnType<typeof instance>[]) => {
      const game = table(seed)
        .withHand("p1", [instance("nami", "OP01-016")])
        .withDeckTop("p1", deck)
        .build();
      game.play({ type: "play-card", cardNumber: "OP01-016" });
      return game;
    };

    it("OP01-016#1: a non-red {Straw Hat Crew} card can be added", () => {
      // Yes. OP05-066 Jinbe is purple.
      const game = namiLooks("faq-op01-016-1", [
        instance("jinbe", "OP05-066"),
        ...copies(4, "FIX-001", "deck"),
      ]);
      expect(effectOptions(game)).toContain("search-select:jinbe");
      game.play({ type: "resolve-effect", optionId: "search-select:jinbe" });
      settle(game);

      expect(ids(game.state.players.p1.hand)).toEqual(["jinbe"]);
    });

    it("OP01-016#2: with nothing to add, every looked-at card goes to the bottom", () => {
      // Every card looked at goes under the deck, in an order the player picks.
      const game = namiLooks("faq-op01-016-2", [
        ...copies(5, "FIX-001", "deck"),
        instance("sixth", "FIX-002"),
      ]);
      settle(game);

      expect(game.state.players.p1.hand).toEqual([]);
      const deck = ids(game.state.players.p1.deck);
      expect(deck).toHaveLength(6);
      expect(deck[0]).toBe("sixth");
    });

    it("OP01-016#3: with fewer than 5 cards in the deck, all of them are looked at and the game goes on", () => {
      // You look at all of them, and the deck is not treated as empty while
      // you do.
      const game = namiLooks("faq-op01-016-3", [
        ...copies(2, "FIX-001", "deck"),
        instance("jinbe", "OP05-066"),
      ]);
      expect(effectOptions(game)).toContain("search-select:jinbe");
      game.play({ type: "resolve-effect", optionId: "search-select:jinbe" });
      settle(game);

      expect(game.state.phase).toBe("main");
      expect(game.state.winner).toBeNull();
      expect(ids(game.state.players.p1.hand)).toEqual(["jinbe"]);
      expect(game.state.players.p1.deck).toHaveLength(2);
    });

    it("OP01-016#4: another [Nami] cannot be added", () => {
      // No. OP10-013 is a {Straw Hat Crew} [Nami].
      const game = namiLooks("faq-op01-016-4", [
        instance("other-nami", "OP10-013"),
        ...copies(4, "FIX-001", "deck"),
      ]);
      expect(effectOptions(game)).not.toContain("search-select:other-nami");
      settle(game);

      expect(game.state.players.p1.hand).toEqual([]);
    });
  });

  describe("OP01-055 You Can Be My Samurai!!", () => {
    it("OP01-055#1: Characters played this turn can be rested to pay", () => {
      // Yes, you can.
      const game = table("faq-op01-055-1")
        .withHand("p1", [
          instance("event", "OP01-055"),
          ...copies(2, "FIX-001", "fresh"),
        ])
        .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
        .build();
      game.play({ type: "play-card", cardNumber: "FIX-001" });
      game.play({ type: "play-card", cardNumber: "FIX-001" });
      expect(ids(game.state.players.p1.board)).toEqual(["fresh-1", "fresh-2"]);

      game.play({ type: "activate-main", sourceCardNumber: "OP01-055" });
      apply(game);
      for (const id of ["fresh-1", "fresh-2"]) {
        if (effectOptions(game).includes(id)) {
          game.play({ type: "resolve-effect", optionId: id });
        }
      }
      settle(game);

      expect(game.state.players.p1.board.every((card) => card.rested)).toBe(
        true,
      );
      expect(ids(game.state.players.p1.hand)).toEqual([
        "p1-deck-1",
        "p1-deck-2",
      ]);
    });

    it("OP01-055#2: the Event can be activated with the rest declined, and then draws nothing", () => {
      // Yes, but nothing happens.
      const game = table("faq-op01-055-2")
        .withHand("p1", [instance("event", "OP01-055")])
        .withBoard("p1", [
          character("one", "FIX-001"),
          character("two", "FIX-001"),
        ])
        .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
        .build();

      game.play({ type: "activate-main", sourceCardNumber: "OP01-055" });
      expect(effectOptions(game)).toContain("skip");
      game.play({ type: "resolve-effect", optionId: "skip" });
      settle(game);

      expect(ids(game.state.players.p1.trash)).toEqual(["event"]);
      expect(game.state.players.p1.board.some((card) => card.rested)).toBe(
        false,
      );
      expect(game.state.players.p1.hand).toEqual([]);
    });
  });
});

/**
 * p2 swings at p1's Leader with a 6000 Character; p1 holds the Counter Event
 * under test and one other card it could trash for it.
 */
const counterStep = (seed: string, eventNumber: string) =>
  theirTurn(seed)
    .withHand("p1", [
      instance("event", eventNumber),
      instance("spare", "FIX-002"),
    ])
    .withBoard("p2", [character("attacker", "FIX-002")])
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

/**
 * Plays the Counter Event, then takes whatever offer is not one of the hand's
 * cards -- the decline the rulings say exists. Throws when there is none.
 */
function declineTheTrash(game: Game): void {
  game.play({ type: "activate-counter-event", eventInstanceId: "event" });
  const hand = ids(game.state.players.p1.hand);
  const decline = effectOptions(game, "p1").find((id) => !hand.includes(id));
  if (decline === undefined) {
    throw new Error(
      `no decline offered: ${effectOptions(game, "p1").join(", ")}`,
    );
  }
  game.play({ type: "resolve-effect", optionId: decline });
}

// The three trash-a-card-for-+3000 Counter Events below can be played with the
// trash declined, and then nothing gains power. Eleven registered cards print
// the same clause; the family test after OP-04 holds every one of them to it.
describe("FAQ OP-02", () => {
  it("OP02-068#1: the [Trigger] can return its owner's own Character", () => {
    // Yes -- the return reaches any cheap Character, its owner's own included.
    const game = theirTurn("faq-op02-068-1")
      .withBoard("p1", [character("own", "FIX-001")])
      .withBoard("p2", [character("attacker", "OP06-007")])
      .withLife("p1", [
        instance("rain", "OP02-068"),
        instance("p1-life-2", "FIX-001"),
      ])
      .build();

    attack(game, "attacker", "p1-leader");
    noDefence(game);
    expect(game.state.phase).toBe("trigger");
    game.play({ type: "resolve-trigger", optionId: "own" });

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.hand)).toContain("own");
  });

  it("OP02-068#2: the [Counter] can be played with the trash declined, giving no power", () => {
    // Yes -- and then no card gains the +3000.
    const game = counterStep("faq-op02-068-2", "OP02-068");
    declineTheTrash(game);

    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["spare"]);
  });
});

describe("FAQ OP-03", () => {
  it("OP03-072#1: the [Counter] can be played with the trash declined, giving no power", () => {
    // Yes -- and then no card gains the +3000.
    const game = counterStep("faq-op03-072-1", "OP03-072");
    declineTheTrash(game);

    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["spare"]);
  });
});

describe("FAQ OP-04", () => {
  it("OP04-016#1: the [Counter] can be played with the trash declined, giving no power", () => {
    // Yes -- and then no card gains the +3000.
    const game = counterStep("faq-op04-016-1", "OP04-016");
    declineTheTrash(game);

    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["spare"]);
  });

  it("OP04-083#1: a Character played after Sabo's [On Play] can still be K.O.'d by effects", () => {
    // No protection for it -- the clause covers the Characters on the field
    // when it resolves.
    const game = table("faq-op04-083-1")
      .withHand("p1", [
        instance("sabo", "OP04-083"),
        instance("late", "FIX-002"),
      ])
      .withDeckTop("p1", copies(4, "FIX-001", "p1-deck"))
      .withHand("p2", [instance("shanks", "OP06-007")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP04-083" });
    // The trash-2 that follows the draw takes the drawn cards, keeping "late".
    while (game.state.pendingEffect) {
      const pick = effectOptions(game).find((id) => id !== "late");
      game.play({ type: "resolve-effect", optionId: pick });
    }
    game.play({ type: "play-card", cardNumber: "FIX-002" });
    game.pass();
    expect(game.state.activePlayer).toBe("p2");

    // OP06-007 Shanks: its [On Play] K.O.s one opposing Character up to
    // 10000 power, which FIX-002 is well within.
    game.play({ type: "play-card", cardNumber: "OP06-007" });
    game.play({ type: "resolve-effect", optionId: "late" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toContain("late");
    expect(ids(game.state.players.p1.board)).toEqual(["sabo"]);
  });
});

describe("every [Counter] that may trash a hand card for power", () => {
  // The same printed clause on eleven cards, written three ways in the engine:
  // the Bad Manners prompt, `trashForBattlePower`, and hand-written programs.
  // EB04-029 asks for a [Sanji], so it is held to the decline alone.
  const PAY_3000 = [
    "OP02-068",
    "OP03-072",
    "OP04-016",
    "OP05-037",
    "OP06-115",
    "OP13-076",
    "OP15-096",
    "OP16-020",
    "OP17-038",
    "OP17-076",
  ];

  for (const cardNumber of [...PAY_3000, "EB04-029"]) {
    it(`${cardNumber}: declining the trash keeps the card and adds no power`, () => {
      const game = counterStep(
        `faq-counter-family-decline-${cardNumber}`,
        cardNumber,
      );
      declineTheTrash(game);

      expect(game.state.activeAttack?.counterPower).toBe(0);
      expect(ids(game.state.players.p1.hand)).toEqual(["spare"]);
    });
  }

  for (const cardNumber of PAY_3000) {
    it(`${cardNumber}: paying the trash adds +3000`, () => {
      const game = counterStep(
        `faq-counter-family-pay-${cardNumber}`,
        cardNumber,
      );
      game.play({ type: "activate-counter-event", eventInstanceId: "event" });
      while (game.state.pendingEffect) {
        const options = effectOptions(game, "p1");
        game.play({
          type: "resolve-effect",
          optionId: options.includes("spare")
            ? "spare"
            : options.includes("apply")
              ? "apply"
              : options.includes("p1-leader")
                ? "p1-leader"
                : options[0],
        });
      }

      expect(ids(game.state.players.p1.hand)).toEqual([]);
      expect(
        (game.state.activeAttack?.counterPower ?? 0) +
          currentPower(game.state, "p1", "p1-leader", false) -
          5000,
      ).toBe(3000);
    });
  }
});
