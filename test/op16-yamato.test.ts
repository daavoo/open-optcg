import { describe, expect, it } from "vitest";
import { hasKeyword, type GameState } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Black) Yamato feature deck, played through its own list.
 *
 * OP16-079's only clause is what the fifty are built around -- a {Land of
 * Wano} Character played out of the trash attacks the turn it lands -- so the
 * Leader's tests drive each of the deck's trash plays into it. The rest pin
 * the printed clauses `test/op16.test.ts` leaves out, one test each.
 */
const DECK = "(Black) Yamato - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

type Game = ReturnType<ReturnType<typeof table>["build"]>;

function effectOptions(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId?: string }).optionId ?? "");
}

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

describe("OP16-079 Yamato: a Land of Wano Character played from the trash gains [Rush]", () => {
  covers("OP16-079", "static");
  covers("OP16-098", "[Activate: Main]");

  it("OP16-098 trashes itself after attacking and the 8-cost it plays swings the same turn", () => {
    // Rested: the 6-cost has already attacked this turn.
    const game = table("op16-yamato-swap")
      .withBoard("p1", [character("six", "OP16-098", { rested: true })])
      .withTrash("p1", [
        instance("unblockable", "OP16-096"),
        instance("recover", "OP16-097"),
      ])
      .build();

    expect(canAttackWith(game, "six")).toBe(false);
    // Trashing itself is the whole cost, so the rested 6-cost still pays it.
    game.play({ type: "activate-main", sourceInstanceId: "six" });
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["unblockable", "recover"]),
    );
    answer(game, "apply", "unblockable");

    expect(boardIds(game.state, "p1")).toEqual(["unblockable"]);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["six", "recover"]),
    );
    expect(hasKeyword(game.state, "p1", "unblockable", "Rush")).toBe(true);
    expect(canAttackWith(game, "unblockable")).toBe(true);
  });

  it("OP16-099 plays a body out of the trash with [Rush] behind this Leader", () => {
    const game = table("op16-yamato-chains")
      .withHand("p1", [instance("chains", "OP16-099")])
      .withTrash("p1", [instance("kinemon", "OP16-082")])
      .withDeckTop("p1", copies(5, "OP16-088", "milled"))
      .build();

    game.play({ type: "activate-main", cardNumber: "OP16-099" });
    answer(game, "apply", "kinemon");

    expect(boardIds(game.state, "p1")).toEqual(["kinemon"]);
    expect(hasKeyword(game.state, "p1", "kinemon", "Rush")).toBe(true);
    expect(canAttackWith(game, "kinemon")).toBe(true);
  });

  it("gives no [Rush] to the same play behind another Leader", () => {
    const game = table("op16-yamato-chains-no-leader")
      .withLeader("p1", "ST31-001")
      .withHand("p1", [instance("chains", "OP16-099")])
      .withTrash("p1", [instance("kinemon", "OP16-082")])
      .withDeckTop("p1", copies(5, "OP16-088", "milled"))
      .build();

    game.play({ type: "activate-main", cardNumber: "OP16-099" });
    answer(game, "apply", "kinemon");

    expect(boardIds(game.state, "p1")).toEqual(["kinemon"]);
    expect(hasKeyword(game.state, "p1", "kinemon", "Rush")).toBe(false);
    expect(canAttackWith(game, "kinemon")).toBe(false);
  });

  it("gives no [Rush] to a Land of Wano Character played from hand", () => {
    const game = table("op16-yamato-from-hand")
      .withHand("p1", [instance("kinemon", "OP16-082")])
      .withDeckTop("p1", copies(5, "OP16-088", "dug"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-082" });
    answer(game, "done");

    expect(boardIds(game.state, "p1")).toEqual(["kinemon"]);
    expect(hasKeyword(game.state, "p1", "kinemon", "Rush")).toBe(false);
    expect(canAttackWith(game, "kinemon")).toBe(false);
  });

  it("OP16-084 swaps for the 9-cost Momonosuke, and both trash plays attack", () => {
    const game = table("op16-yamato-momo")
      .withHand("p1", [instance("shinobu", "OP16-087")])
      .withBoard("p1", [character("momo", "OP16-084", { rested: true })])
      .withTrash("p1", [
        instance("big-momo", "OP16-085"),
        instance("six", "OP16-098"),
      ])
      .withDeckTop("p1", copies(3, "OP16-088", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-087" });
    answer(game, "apply", "momo");

    // Rested, and still able to pay a cost that is only "trash this".
    game.play({ type: "activate-main", sourceInstanceId: "momo" });
    answer(game, "apply", "big-momo", "six");

    expect(boardIds(game.state, "p1")).toEqual(
      expect.arrayContaining(["big-momo", "six"]),
    );
    expect(canAttackWith(game, "big-momo")).toBe(true);
    expect(canAttackWith(game, "six")).toBe(true);
  });
});

describe("OP16-088 Shimotsuki Ushimaru", () => {
  covers("OP16-088", "[Blocker]");

  it("blocks a declared attack and rests doing it", () => {
    const game = scenario()
      .decks(OPPONENT, DECK)
      .seed("op16-088-blocker")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "ST32-005")])
      .withBoard("p2", [character("blocker", "OP16-088")])
      .build();

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

describe("OP16-091 Nami", () => {
  covers("OP16-091", "[On Play]");

  it("adds a Land of Wano card other than Nami from the top 4 and trashes the rest", () => {
    const game = table("op16-091")
      .withHand("p1", [instance("nami", "OP16-091")])
      .withDeckTop("p1", [
        instance("kinemon", "OP16-082"),
        instance("nami-2", "OP16-091"),
        ...copies(2, "ST32-005", "miss"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-091" });
    expect(effectOptions(game)).toContain("kinemon");
    expect(effectOptions(game)).not.toContain("nami-2");
    answer(game, "kinemon");

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "kinemon",
    ]);
    expect(game.state.players.p1.trash).toHaveLength(3);
  });
});

describe("OP16-092 Nico Robin", () => {
  covers("OP16-092", "[On Play]");

  it("trashes an 8-cost Character from hand to draw 2", () => {
    const game = table("op16-092")
      .withHand("p1", [
        instance("robin", "OP16-092"),
        instance("eight", "OP16-096"),
        instance("small", "OP16-088"),
      ])
      .withDeckTop("p1", copies(2, "ST32-005", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-092" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Only the 8-cost pays; the 2-cost Ushimaru is not offered.
    expect(effectOptions(game)).toEqual(["eight"]);
    answer(game, "eight");

    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "eight",
    ]);
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId).sort(),
    ).toEqual(["drawn-1", "drawn-2", "small"]);
  });
});

describe("OP16-094 Portgas.D.Ace", () => {
  covers("OP16-094", "[On K.O.]", "[Activate: Main]");

  it("[On K.O.] makes the opponent trash 2 cards from hand", () => {
    const game = scenario()
      .decks(OPPONENT, DECK)
      .seed("op16-094-ko")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "OP16-096")])
      .withBoard("p2", [character("ace", "OP16-094", { rested: true })])
      .withHand("p1", copies(3, "ST32-005", "held"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "ace",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    answer(game);

    expect(boardIds(game.state, "p2")).toEqual([]);
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.trash).toHaveLength(2);
  });

  it("[Activate: Main] gives a rested DON!! to a Land of Wano Leader", () => {
    const game = table("op16-094-main")
      .withBoard("p1", [character("ace", "OP16-094")])
      .withDonDeck("p1", 2)
      .withDon("p1", { rested: 1 })
      .build();

    expect(game.state.players.p1.restedDon).toHaveLength(1);
    game.play({ type: "activate-main", sourceInstanceId: "ace" });
    answer(game, "p1-leader");

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
  });
});

describe("OP16-095 Monkey.D.Luffy", () => {
  covers("OP16-095", "[On Play]");

  it("gives a black Land of Wano Character [Unblockable] for the turn", () => {
    const game = table("op16-095")
      .withHand("p1", [instance("luffy", "OP16-095")])
      .withBoard("p1", [character("six", "OP16-098")])
      .build();

    expect(hasKeyword(game.state, "p1", "six", "Unblockable")).toBe(false);
    game.play({ type: "play-card", cardNumber: "OP16-095" });
    answer(game, "six");

    expect(hasKeyword(game.state, "p1", "six", "Unblockable")).toBe(true);
  });
});

describe("OP16-096 Yamato", () => {
  covers("OP16-096", "[Unblockable]", "[On K.O.]");

  it("[Unblockable] leaves the defender's Blocker unoffered", () => {
    const game = table("op16-096-unblockable")
      .withBoard("p1", [character("yamato", "OP16-096")])
      .withBoard("p2", [character("blocker", "OP16-088")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "yamato",
      targetInstanceId: "p2-leader",
    });

    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      false,
    );
  });

  it("[On K.O.] plays a Yamato of cost 6 or less from the trash", () => {
    const game = scenario()
      .decks(OPPONENT, DECK)
      .seed("op16-096-ko")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "OP16-097")])
      .withBoard("p2", [character("yamato", "OP16-096", { rested: true })])
      .withTrash("p2", [
        instance("six", "OP16-098"),
        instance("eight", "OP16-097"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "yamato",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    // The 8-cost in the trash is out of reach; only the 6-cost is offered.
    expect(effectOptions(game)).toContain("six");
    expect(effectOptions(game)).not.toContain("eight");
    answer(game, "six");

    expect(boardIds(game.state, "p2")).toEqual(["six"]);
  });
});

describe("OP16-097 Yamato", () => {
  covers("OP16-097", "[On Play]");

  it("recovers a Land of Wano body from the trash, then plays a 2-cost from hand", () => {
    const game = table("op16-097")
      .withHand("p1", [
        instance("yamato", "OP16-097"),
        instance("luffy", "OP16-095"),
      ])
      .withTrash("p1", [instance("kinemon", "OP16-082")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-097" });
    game.play({ type: "resolve-effect", optionId: "kinemon" });
    // Kin'emon is in hand now, and at cost 4 it is not a cost-2 play.
    expect(effectOptions(game)).toContain("luffy");
    expect(effectOptions(game)).not.toContain("kinemon");
    answer(game, "luffy");

    expect(boardIds(game.state, "p1")).toEqual(
      expect.arrayContaining(["yamato", "luffy"]),
    );
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "kinemon",
    ]);
  });
});

describe("OP16-098 Yamato", () => {
  covers("OP16-098", "[On Play]");

  it("draws 1 and then trashes 1 from hand", () => {
    const game = table("op16-098")
      .withHand("p1", [
        instance("yamato", "OP16-098"),
        instance("eight", "OP16-096"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP16-088")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-098" });
    // The drawn card is already in hand when the trash is chosen.
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["eight", "drawn"]),
    );
    answer(game, "eight");

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "eight",
    ]);
  });
});

describe("OP16-099 I've Come Here... To Cut Those Chains!!!", () => {
  covers("OP16-099", "[Main]", "[Counter]");

  it("[Main] rests 6 DON!!, trashes the top 5 and plays a 6-or-less body from the trash", () => {
    const game = table("op16-099-main")
      .withHand("p1", [instance("chains", "OP16-099")])
      .withDeckTop("p1", [
        instance("milled-six", "OP16-098"),
        ...copies(4, "ST32-005", "milled"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP16-099" });
    // A card milled by the Event itself is already a legal target.
    answer(game, "apply", "milled-six");

    expect(boardIds(game.state, "p1")).toEqual(["milled-six"]);
    // One DON!! for the Event's cost and six more for its own price.
    expect(game.state.players.p1.activeDon).toHaveLength(3);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["chains", "milled-1", "milled-4"]),
    );
  });

  it("[Counter] gives the Leader +3000 during the battle", () => {
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("op16-099-counter")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("chains", "OP16-099")])
      .withBoard("p2", [character("attacker", "ST32-005")])
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

    game.play({ type: "activate-counter-event", eventInstanceId: "chains" });
    answer(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});
