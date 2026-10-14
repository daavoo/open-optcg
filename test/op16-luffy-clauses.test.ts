import { describe, expect, it } from "vitest";
import { currentPower } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The Green/Blue Impel Down Luffy clauses that had no test at all.
 *
 * They had none because the deck is *hand-built*: `tools/clause-coverage.ts`
 * derived its requirements from `deckCardRows`, the deck-provenance table, and
 * only format and community decks have rows there. So a deck that is selectable
 * in the app, has its own rules policy and its own LLM dossier contributed no
 * requirements, and `pnpm coverage:clauses --check` reported zero gaps while
 * every one of its fifty cards was unheld. `coveredIdentities()` now reads
 * `SELECTABLE_DECK_IDS` instead, which is what surfaced these.
 *
 * `test/op16-luffy.test.ts` is built around the deck's engine and already drove
 * most of the list; this file is the remainder, one describe per card.
 *
 * `currentPower(state, player, id, false)` reports the card's power *without*
 * the flat +1000 each attached DON!! adds, so every number below is printed
 * power plus the clause under test and nothing else.
 */

const DECK = "(Green/Blue) Monkey.D.Luffy - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

function luffy() {
  return scenario().decks(DECK, OPPONENT).atTurn(9, { active: "p1" });
}

/** The OP16 deck defending, so its Life Triggers and Counter Events are p2's. */
function defending(seed: string) {
  return scenario()
    .decks(OPPONENT, DECK)
    .seed(seed)
    .atTurn(9, { active: "p1" })
    .bareTable();
}

describe("OP16-034 Monkey.D.Luffy", () => {
  covers("OP16-034", "[Your Turn]");

  /**
   * "[printed text omitted -- pnpm card:text OP16-034]"
   *
   * The clause the whole deck plan is built on, and the one that had no test.
   * The official OP-16 Q&A pins down both edges a naive reading gets wrong: a
   * lone copy still counts *itself* for +1000, and two copies of one name are
   * not two different names. `static-abilities.ts` implements it as the size of
   * the `Set` of names on the board, which satisfies both -- asserted here so a
   * future "different from this card's own name" rewrite fails at this file
   * rather than silently changing the deck's arithmetic.
   */
  it("counts itself when it is the only Character", () => {
    const game = luffy()
      .bareTable()
      .withBoard("p1", [character("luffy", "OP16-034")])
      .withGivenDon("p1", "luffy", 1)
      .build();

    // 0 printed power, +1000 for its own name.
    expect(currentPower(game.state, "p1", "luffy", false)).toBe(1000);
  });

  it("counts names, not bodies, so a duplicate adds nothing", () => {
    const distinct = luffy()
      .bareTable()
      .withBoard("p1", [
        character("luffy", "OP16-034"),
        character("mr1", "OP16-054"),
        character("mr2", "OP16-055"),
      ])
      .withGivenDon("p1", "luffy", 1)
      .build();
    const duplicated = luffy()
      .bareTable()
      .withBoard("p1", [
        character("luffy", "OP16-034"),
        character("luffy-2", "OP16-034"),
        character("luffy-3", "OP16-034"),
      ])
      .withGivenDon("p1", "luffy", 1)
      .build();

    // Three bodies, three names: +3000.
    expect(currentPower(distinct.state, "p1", "luffy", false)).toBe(3000);
    // Three bodies, one name: +1000. This is the arithmetic behind the
    // `op16-luffy-duplicate-play` rule recorded as rejected in `registry.ts` --
    // the clause is real; converting it is what the measurement rejected.
    expect(currentPower(duplicated.state, "p1", "luffy", false)).toBe(1000);
  });

  it("stays at printed power with no DON!! attached", () => {
    const game = luffy()
      .bareTable()
      .withBoard("p1", [
        character("luffy", "OP16-034"),
        character("mr1", "OP16-054"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "luffy", false)).toBe(0);
  });

  covers("OP16-034", "[On Play]");

  it("digs 3 and adds one Impel Down card to hand, bottoming the rest", () => {
    const game = luffy()
      .bareTable()
      .withHand("p1", [instance("luffy", "OP16-034")])
      .withDon("p1", { active: 1 })
      .withDeckTop("p1", [
        instance("dug-a", "OP16-055"),
        instance("dug-b", "OP16-042"),
        instance("dug-c", "OP16-054"),
      ])
      .build();

    game.play({ type: "play-card", cardInstanceId: "luffy" });
    game.play({ summary: "Add Prisoner of Impel Down to hand" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "dug-b",
    );
    // The two passed over go to the bottom of the deck, not the trash.
    expect(
      game.state.players.p1.deck.slice(-2).map((card) => card.instanceId),
    ).toEqual(expect.arrayContaining(["dug-a", "dug-c"]));
    expect(game.state.players.p1.trash).toHaveLength(0);
  });
});

describe("OP16-054 Mr.1(Daz.Bonez) and OP16-055 Mr.2.Bon.Kurei(Bentham)", () => {
  covers("OP16-054", "[On Play]");
  covers("OP16-055", "[On Play]");

  // Both read "[On Play] Draw 1 card", and both are what the deck's turn-1 and
  // turn-2 drops are for: a body that replaces itself.
  it.each(["OP16-054", "OP16-055"])("%s draws 1 when it is played", (card) => {
    const game = luffy()
      .bareTable()
      .withHand("p1", [instance("body", card)])
      .withDon("p1", { active: 2 })
      .withDeckTop("p1", [instance("drawn", "OP16-042")])
      .build();

    game.play({ type: "play-card", cardInstanceId: "body" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
  });
});

describe("OP16-027 Jinbe", () => {
  covers("OP16-027", "static");

  // "[printed text omitted -- pnpm card:text OP16-027]" No [Your Turn] gate, unlike
  // OP16-054 Mr.1's +3000 -- so it holds while Jinbe defends, which is the whole
  // reason the deck keeps it as a 2000-Counter body rather than an attacker.
  it("gains +2000 with a DON!! attached, on either player's turn", () => {
    const own = luffy()
      .bareTable()
      .withBoard("p1", [character("jinbe", "OP16-027")])
      .withGivenDon("p1", "jinbe", 1)
      .build();
    const opponents = scenario()
      .decks(DECK, OPPONENT)
      .atTurn(10, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("jinbe", "OP16-027")])
      .withGivenDon("p1", "jinbe", 1)
      .build();

    expect(currentPower(own.state, "p1", "jinbe", false)).toBe(4000);
    expect(currentPower(opponents.state, "p1", "jinbe", false)).toBe(4000);
  });

  it("stays at printed power with no DON!! attached", () => {
    const game = luffy()
      .bareTable()
      .withBoard("p1", [character("jinbe", "OP16-027")])
      .build();

    expect(currentPower(game.state, "p1", "jinbe", false)).toBe(2000);
  });
});

describe("OP02-068 Gum-Gum Rain", () => {
  covers("OP02-068", "[Counter]");

  // "[printed text omitted -- pnpm card:text OP02-068]" The cost is a card
  // from hand, not DON!!, which is what separates it from the deck's other
  // Counter Events: it is castable on a turn that has nothing left active.
  it("trashes a card from hand for +3000 on the defending Leader", () => {
    const game = defending("op02-068-counter")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withHand("p2", [
        instance("rain", "OP02-068"),
        instance("fodder", "OP16-042"),
      ])
      .withDon("p2", { active: 0 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass(); // the Block step
    game.play({ type: "activate-counter-event", eventInstanceId: "rain" });
    // Naming the card to trash is the only choice: with no Characters out, the
    // +3000 has one legal home and the engine puts it on the Leader itself.
    game.play({ type: "resolve-effect", optionId: "fodder" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(game.state.players.p2.trash.map((card) => card.cardNumber)).toEqual(
      expect.arrayContaining(["OP02-068", "OP16-042"]),
    );
  });

  covers("OP02-068", "[Trigger]");

  it("returns a cost-2 Character to hand off its Life Trigger", () => {
    const game = defending("op02-068-trigger")
      .withBoard("p1", [character("target", "OP16-055", { playedTurn: 1 })])
      .withLife("p2", [instance("life-trigger", "OP02-068")])
      .build();

    // The Leader swings 5000 into a 5000 Leader, which hits: the Life card comes
    // off and the Trigger is offered.
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    game.pass(); // Block
    game.pass(); // Counter
    // One eligible Character, so the Trigger resolves onto it without a further
    // choice; the "up to 1" is exercised by the cost bound in OP11-061 below.
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "OP16-055",
    );
  });
});

describe("OP11-061 Gum-Gum Jet Culverin", () => {
  covers("OP11-061", "[Trigger]");

  // The Trigger's ceiling is cost 1 where the [Main] half's is a base cost of 4.
  // `test/op16-luffy.test.ts` drives the [Main] half, so this is the half that
  // could silently inherit the wrong bound.
  it("bottom-decks a cost-1 Character but is not offered a cost-2 one", () => {
    const game = defending("op11-061-trigger")
      .withBoard("p1", [
        character("cheap", "OP16-034", { playedTurn: 1 }),
        // A second cost-1 body, so the choice below is a real one rather than
        // the engine's single-candidate auto-resolve.
        character("cheap-2", "OP16-034", { playedTurn: 1 }),
        character("dear", "OP16-055", { playedTurn: 1 }),
      ])
      .withLife("p2", [instance("life-trigger", "OP11-061")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    game.pass(); // Block
    game.pass(); // Counter

    // The target is named by the `resolve-trigger` action itself rather than by
    // a follow-up effect choice, so the cost bound shows up as which Characters
    // the Trigger step is willing to offer at all.
    //
    // Matched on `optionId` rather than on the summary: the offer names the card
    // rather than the instance, so the two interchangeable copies of OP16-034
    // read identically -- which is the point of naming them, and which leaves the
    // id as the only thing that tells them apart.
    const offered = game
      .legalActions("p2")
      .filter((action) => action.type === "resolve-trigger")
      .map((action) => action.optionId);
    expect(offered).toContain("cheap");
    expect(offered).toContain("cheap-2");
    expect(offered).not.toContain("dear");

    game.play({ type: "resolve-trigger", optionId: "cheap" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "cheap-2",
      "dear",
    ]);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("cheap");
  });
});

describe("OP16-038 Let's Go!! To the Navy Headquarters!!", () => {
  // Its `[Counter]` half is driven in `test/op16-luffy.test.ts`, which declares
  // the clause; this is the other side of the same restriction. "Your Leader
  // gains +3000" reaches nothing while a Character is the card being attacked,
  // and the clause does nothing else.
  it("is not offered as a Counter while a Character is the target", () => {
    const game = defending("op16-038-counter-character")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withBoard("p2", [character("body", "OP16-026")])
      .withHand("p2", [instance("event", "OP16-038")])
      .withActiveAttack(
        {
          attackerPlayerId: "p1",
          defenderPlayerId: "p2",
          attackerInstanceId: "attacker",
          targetInstanceId: "body",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect(
      game
        .legalActions()
        .find((action) => action.type === "activate-counter-event"),
    ).toBeUndefined();
  });
});

describe("OP13-040 I Know You're Strong...", () => {
  covers("OP13-040", "[Counter]");

  // "[printed text omitted -- pnpm card:text OP13-040]" Paid with
  // active DON!!, unlike Gum-Gum Rain's card-from-hand cost above.
  it("pays one DON!! for +3000 on the defending Leader", () => {
    const game = defending("op13-040-counter")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withHand("p2", [instance("event", "OP13-040")])
      .build();
    const activeBefore = game.state.players.p2.activeDon.length;

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass(); // the Block step
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    // The cost is one active DON!!, which becomes rested rather than leaving.
    expect(game.state.players.p2.activeDon).toHaveLength(activeBefore - 1);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
    expect(game.state.players.p2.trash.map((card) => card.cardNumber)).toEqual([
      "OP13-040",
    ]);
  });

  // "Your Leader gains +3000" reaches nothing while a Character is the card
  // being attacked, and the clause does nothing else, so there is no benefit
  // left to spend the Event on.
  it("is not offered while a Character is the card being attacked", () => {
    const game = defending("op13-040-counter-character")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withBoard("p2", [character("body", "OP16-026")])
      .withHand("p2", [instance("event", "OP13-040")])
      .withActiveAttack(
        {
          attackerPlayerId: "p1",
          defenderPlayerId: "p2",
          attackerInstanceId: "attacker",
          targetInstanceId: "body",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect(
      game
        .legalActions()
        .find((action) => action.type === "activate-counter-event"),
    ).toBeUndefined();

    // The same position with the Leader under attack does offer it, so the
    // absence above is the target restriction and not an unpayable cost.
    const atLeader = defending("op13-040-counter-leader")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withBoard("p2", [character("body", "OP16-026")])
      .withHand("p2", [instance("event", "OP13-040")])
      .withActiveAttack(
        {
          attackerPlayerId: "p1",
          defenderPlayerId: "p2",
          attackerInstanceId: "attacker",
          targetInstanceId: "p2-leader",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect(
      atLeader.action({ type: "activate-counter-event" }).summary,
    ).toContain("+3000");
  });
});
