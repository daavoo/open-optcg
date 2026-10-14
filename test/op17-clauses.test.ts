import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import { requireKnownCard } from "@one-piece-sim/cards";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The OP-17 clauses `test/op17.test.ts` leaves untested.
 *
 * That file is organised per card and per timed clause, so what is missing here
 * is mostly the other kind of printed text: the keywords, the untimed cost and
 * Counter layers, and the handful of Events whose halves nothing drives. Each
 * keyword is tested by the thing it changes -- blocking, or attacking the turn
 * the card is played -- rather than by `hasKeyword` alone, because the keyword
 * being visible and the keyword being usable have come apart before.
 */

const SHANKS = "(Green) Shanks - Official Feature Deck";
const XEBEC = "(Blue) Rocks.D.Xebec - Official Feature Deck";
const ELBAPH = "(Black) Monkey.D.Luffy - Official Feature Deck";

describe("OP17 printed Blockers", () => {
  covers("OP17-029", "[Blocker]");
  covers("OP17-042", "[Blocker]");
  covers("OP17-046", "[Blocker]");

  it.each([
    ["OP17-029", SHANKS],
    ["OP17-042", XEBEC],
    ["OP17-046", XEBEC],
  ])("%s blocks a declared attack and rests doing it", (cardNumber, deck) => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", deck)
      .seed(`op17-blocker-${cardNumber}`)
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withBoard("p2", [character("blocker", cardNumber)])
      .build();

    expect(hasKeyword(game.state, "p2", "blocker", "Blocker")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "blocker" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });
});

describe("OP17-022 Shanks Rush", () => {
  covers("OP17-022", "[Rush]");

  it("attacks the Leader on the turn it is played", () => {
    const game = scenario()
      .decks(SHANKS, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-022-rush")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("shanks", "OP17-022")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-022" });
    // Its own [On Play] resolves first: 2 DON!! active, then rest everything.
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect" });
    }
    const attack = game.action({
      type: "attack",
      attackerInstanceId: "shanks",
      targetInstanceId: "p2-leader",
    });
    expect(attack).toBeDefined();
  });
});

describe("OP17 printed Rush: Character", () => {
  covers("OP17-027", "[Rush: Character]");
  covers("OP17-048", "[Rush: Character]");

  it.each([
    ["OP17-027", SHANKS],
    ["OP17-048", XEBEC],
  ])(
    "%s attacks a rested Character, but not the Leader, on the turn it is played",
    (cardNumber, deck) => {
      const game = scenario()
        .decks(deck, "(Red) Monkey.D.Luffy - Starter Deck 31")
        .seed(`op17-rush-character-${cardNumber}`)
        .atTurn(9, { active: "p1" })
        .bareTable()
        .withHand("p1", [instance("body", cardNumber)])
        .withBoard("p2", [character("target", "ST31-002", { rested: true })])
        .build();

      game.play({ type: "play-card", cardNumber });
      // Decline every part of the [On Play] that follows; this case is about
      // the keyword, and each card words its "no thanks" differently.
      while (game.state.pendingEffect) {
        const options = game
          .legalActions()
          .filter((action) => action.type === "resolve-effect");
        game.submit(options[options.length - 1]!);
      }

      const targets = game
        .legalActions()
        .flatMap((action) =>
          action.type === "attack" && action.attackerInstanceId === "body"
            ? [action.targetInstanceId]
            : [],
        );
      expect(targets).toEqual(["target"]);
    },
  );
});

describe("OP17-026 Fugar On K.O.", () => {
  covers("OP17-026", "[On K.O.]");

  it("draws 1 card when it is K.O.'d in battle", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", SHANKS)
      .seed("op17-026-on-ko")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withBoard("p2", [character("fugar", "OP17-026", { rested: true })])
      .withDeckTop("p2", [instance("drawn", "OP17-032")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "fugar",
    });
    game.pass();
    game.pass();

    expect(game.state.players.p2.board).toEqual([]);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
  });
});

describe("OP17 Elbaph +12 cost layer", () => {
  covers("OP17-081", "static");
  covers("OP17-085", "static");
  covers("OP17-092", "static");

  const boardCost = (
    cardNumber: string,
    p1Deck: string,
    seed: string,
  ): number => {
    const game = scenario()
      .decks(p1Deck, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed(seed)
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("body", cardNumber)])
      .build();
    return effectiveCost(game.state, "p1", game.state.players.p1.board[0]!);
  };

  it.each(["OP17-085", "OP17-092"])(
    "%s gains +12 cost unconditionally, as its own sentence prints it",
    (cardNumber) => {
      const printed = requireKnownCard(cardNumber).cost ?? 0;
      expect(boardCost(cardNumber, ELBAPH, `op17-cost-${cardNumber}`)).toBe(
        printed + 12,
      );
      // No Leader condition on this half, so a Red Leader changes nothing.
      expect(
        boardCost(
          cardNumber,
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          `op17-cost-red-${cardNumber}`,
        ),
      ).toBe(printed + 12);
    },
  );

  it("OP17-081 Gerd gains its +12 cost only under an {Elbaph} Leader", () => {
    const printed = requireKnownCard("OP17-081").cost ?? 0;
    expect(boardCost("OP17-081", ELBAPH, "op17-081-elbaph")).toBe(printed + 12);
    expect(
      boardCost(
        "OP17-081",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "op17-081-red",
      ),
    ).toBe(printed);
  });
});

describe("OP17-119 Loki cost and defensive power", () => {
  covers("OP17-119", "static");

  it("gains +12 cost always and +3000 power only on the opponent's turn", () => {
    const game = scenario()
      .decks(ELBAPH, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-119-static")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("loki", "OP17-119")])
      .build();
    const printed = requireKnownCard("OP17-119");

    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe((printed.cost ?? 0) + 12);
    // The power half is gated on whose turn it is, so it is absent here...
    expect(currentPower(game.state, "p1", "loki", false)).toBe(
      printed.power ?? 0,
    );
    // ...and live once the turn passes to its controller's opponent.
    game.pass();
    expect(currentPower(game.state, "p1", "loki", false)).toBe(
      (printed.power ?? 0) + 3000,
    );
  });
});

describe("OP17-118 Rocks.D.Xebec hand Counter", () => {
  covers("OP17-118", "static");

  it("is usable as a +2000 Counter while your Characters all lack one", () => {
    const counterless = scenario()
      .decks(XEBEC, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-118-counter")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("xebec", "OP17-118")])
      // Gloriosa prints no Counter, so the gate still holds.
      .withBoard("p1", [character("gloriosa", "OP17-046")])
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

    const counter = counterless.action({
      type: "counter",
      cardInstanceId: "xebec",
    });
    counterless.submit(counter);
    expect(counterless.state.activeAttack?.counterPower).toBe(2000);
  });

  it("is not a Counter card once a Character with a printed Counter is out", () => {
    const game = scenario()
      .decks(XEBEC, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-118-gated")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("xebec", "OP17-118")])
      // Fugar prints a 2000 Counter, which switches the clause off.
      .withBoard("p1", [character("fugar", "OP17-026")])
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

describe("OP17-040 Edward.Newgate On Play", () => {
  covers("OP17-040", "[On Play]");

  it("draws 1 card when it is played", () => {
    const game = scenario()
      .decks(XEBEC, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-040-on-play")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("newgate", "OP17-040")])
      .withDeckTop("p1", [instance("drawn", "OP17-042")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-040" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-040",
    ]);
  });
});

describe("OP08-051 Buckin On Play", () => {
  covers("OP08-051", "[On Play]", "[Your Turn]");

  it("resolves to nothing in a list that runs no [Edward Weevil], without stalling", () => {
    const game = scenario()
      .decks(XEBEC, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op08-051-on-play")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("buckin", "OP08-051")])
      .withBoard("p1", [character("kaido", "OP17-042")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-051" });

    // "Up to 1" over an empty candidate set: the clause has to finish on its
    // own rather than wait for a choice that can never be offered.
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-042",
      "OP08-051",
    ]);
    expect(
      game.state.players.p1.board.flatMap((card) => card.powerModifiers ?? []),
    ).toEqual([]);
  });
});

describe("OP17-037 Are You That Afraid of the New Era?!! Main", () => {
  covers("OP17-037", "[Main]");

  it("reveals a Red-Haired Pirates card from the top five and bottoms the rest", () => {
    const game = scenario()
      .decks(SHANKS, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-037-main")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("event", "OP17-037")])
      .withDeckTop("p1", [
        instance("miss-1", "ST32-002"),
        instance("hit", "OP17-029"),
        instance("miss-2", "ST32-002"),
        instance("miss-3", "ST32-002"),
        instance("miss-4", "ST32-002"),
        instance("untouched", "OP17-032"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[OP17-037]" });
    game.play({ type: "resolve-effect", optionId: "hit" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("untouched");
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP17-037",
    ]);
  });
});

describe("OP17-038 I Think He's Seen an Ugly Future... Counter", () => {
  covers("OP17-038", "[Counter]");

  it("trashes a card from hand for +3000 during the battle", () => {
    const game = scenario()
      .decks(SHANKS, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-038-counter")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [
        instance("event", "OP17-038"),
        instance("fodder", "OP17-032"),
      ])
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

    game.play({
      type: "activate-counter-event",
      eventInstanceId: "event",
    });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect" });
    }

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual(
      expect.arrayContaining(["OP17-038", "OP17-032"]),
    );
  });
});

describe("OP17-084 Tony Tony.Chopper On Play", () => {
  covers("OP17-084", "[On Play]");

  it("grants [Unblockable] for the turn while a cost-12 Character is out", () => {
    const game = scenario()
      .decks(ELBAPH, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-084-on-play")
      .atTurn(5, { active: "p1" })
      .bareTable()
      // Dorry's own +12 puts it at 17, which is what the condition reads.
      .withBoard("p1", [character("dorry", "OP17-085", { playedTurn: 1 })])
      .withHand("p1", [instance("chopper", "OP17-084")])
      .withBoard("p2", [character("blocker", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-084" });
    game.play({ type: "resolve-effect", optionId: "dorry" });

    expect(hasKeyword(game.state, "p1", "dorry", "Unblockable")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "dorry",
      targetInstanceId: "p2-leader",
    });
    // The Blocker is on the board and active, and still cannot be offered.
    expect(
      game.legalActions("p2").filter((action) => action.type === "block"),
    ).toEqual([]);
  });

  it("offers nothing without a cost-12 Character on the field", () => {
    const game = scenario()
      .decks(ELBAPH, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-084-boundary")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("gerd", "OP17-081", { playedTurn: 1 })])
      .withLeader("p1", "ST21-001")
      .withHand("p1", [instance("chopper", "OP17-084")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-084" });
    expect(game.state.pendingEffect).toBeNull();
    expect(
      game.state.players.p1.board.flatMap((card) => card.powerModifiers ?? []),
    ).toEqual([]);
  });
});

describe("OP17 Elbaph Leader-power Counter Events", () => {
  covers("OP17-097", "[Counter]");
  covers("OP17-098", "[Counter]");

  it.each(["OP17-097", "OP17-098"])(
    "%s gives the Leader +3000 during the battle",
    (cardNumber) => {
      const game = scenario()
        .decks(ELBAPH, "(Red) Monkey.D.Luffy - Starter Deck 31")
        .seed(`op17-counter-${cardNumber}`)
        .atTurn(4, { active: "p2" })
        .bareTable()
        .withHand("p1", [instance("event", cardNumber)])
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

      game.play({ type: "activate-counter-event", eventInstanceId: "event" });
      while (game.state.pendingEffect) {
        game.play({ type: "resolve-effect" });
      }

      expect(game.state.activeAttack?.counterPower).toBe(3000);
    },
  );
});

describe("OP17-097 I'll Feed on This Rage Main", () => {
  covers("OP17-097", "[Main]");

  it("gives every opponent Character -1 cost for the turn", () => {
    const game = scenario()
      .decks(ELBAPH, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-097-main")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("event", "OP17-097")])
      .withBoard("p2", [
        character("jinbe", "ST31-002"),
        character("brook", "ST31-003"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[OP17-097]" });

    expect(
      game.state.players.p2.board.map((card) =>
        effectiveCost(game.state, "p2", card),
      ),
    ).toEqual([4, 1]);
  });
});

describe("OP17-098 Gum-Gum Kong Gun Main", () => {
  covers("OP17-098", "[Main]");

  it("rests 6 DON!! to K.O. up to 2 cost-6-or-less Characters behind a giant", () => {
    const game = scenario()
      .decks(ELBAPH, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-098-main")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("event", "OP17-098")])
      .withBoard("p1", [character("dorry", "OP17-085", { playedTurn: 1 })])
      .withBoard("p2", [
        character("jinbe", "ST31-002"),
        character("brook", "ST31-003"),
        character("big-luffy", "ST31-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[OP17-098]" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    game.play({ type: "resolve-effect", optionId: "brook" });

    // The 7-cost Luffy is out of reach. Seven DON!! end up rested: the six the
    // clause asks for, plus the one the Event itself costs.
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big-luffy",
    ]);
    expect(game.state.players.p1.restedDon).toHaveLength(7);
  });
});

describe("OP17-085 Dorry / OP17-092 Brogy: the restriction half of the clause", () => {
  covers("OP17-085", "[On Play]");
  covers("OP17-092", "[On Play]");

  /**
   * "[printed text omitted -- pnpm card:text OP17-092]" is the second
   * sentence of the same printed [On Play], which is why the per-clause gate
   * cannot see it on its own: `test/op17.test.ts` covers the first sentence
   * from an empty board with one copy of each giant, where the recursion runs
   * out of targets before the restriction has to hold.
   *
   * The position that broke was a full Character area with copies in hand
   * *and* trash: the nested play routes through the area-replacement offer, the
   * body trashed to make room is a legal target again, and the two giants
   * played each other until the benchmark's action cap stopped the game.
   */
  const giantChain = () =>
    scenario()
      .decks(ELBAPH, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-giant-chain")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("filler-1", "FIX-002"),
        character("filler-2", "FIX-002"),
        character("filler-3", "FIX-002"),
        character("filler-4", "FIX-002"),
        character("filler-5", "FIX-002"),
      ])
      .withHand("p1", [
        instance("dorry", "OP17-085"),
        instance("brogy", "OP17-092"),
      ])
      .withTrash("p1", [
        instance("dorry-2", "OP17-085"),
        instance("brogy-2", "OP17-092"),
      ])
      .build();

  it("stops after the one printed hop with a full board and copies in hand and trash", () => {
    const game = giantChain();
    game.play({ type: "play-card", cardInstanceId: "dorry" });

    // Every decision the chain hands back, taken in the order it is offered --
    // the same fall-through a policy takes. The cap is half the assertion:
    // before the fix each pass round the loop added two more plays.
    let decisions = 0;
    while (game.state.pendingEffect !== null) {
      decisions += 1;
      expect(decisions).toBeLessThanOrEqual(4);
      game.play({ type: "resolve-effect" });
    }

    // Exactly three: room for Dorry, Dorry's [On Play] naming Brogy, room for
    // Brogy. Brogy's own [On Play] is not offered at all -- the restriction is
    // already in force, so an "up to 1" it could not carry out is not a
    // decision anyone has to step through.
    expect(decisions).toBe(3);

    // One hop: Dorry, and the one Brogy its [On Play] plays.
    const board = game.state.players.p1.board.map((card) => card.cardNumber);
    expect(board.filter((cardNumber) => cardNumber === "OP17-085")).toEqual([
      "OP17-085",
    ]);
    expect(board.filter((cardNumber) => cardNumber === "OP17-092")).toEqual([
      "OP17-092",
    ]);
    expect(
      game.legalActions("p1").some((action) => action.type === "play-card"),
    ).toBe(false);
  });
});

describe("OP17-057 Fullalead", () => {
  covers("OP17-057", "[On Your Opponent's Attack]");

  it("rests itself and trashes a card to add +1000 to the battle", () => {
    // The official list's answer to a deck whose Characters print no Counter:
    // a Stage that turns a card in hand into +1000, once a turn, because
    // resting is the cost and a Stage refreshes only on its controller's turn.
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", XEBEC)
      .seed("op17-057-fullalead")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withHand("p2", [instance("fuel", "OP17-056")])
      .withStage("p2", instance("fullalead", "OP17-057"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect" });
    }

    expect(game.state.activeAttack?.counterPower).toBe(1000);
    expect(game.state.players.p2.stage?.rested).toBe(true);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(
      game.state.players.p2.trash.map((card) => card.cardNumber),
    ).toContain("OP17-056");
  });

  it("is not offered with an empty hand, since the trash is a cost", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", XEBEC)
      .seed("op17-057-no-hand")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withHand("p2", [])
      .withStage("p2", instance("fullalead", "OP17-057"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
  });
});
