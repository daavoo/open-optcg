import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * STARTER DECK -Shanks- [ST-23].
 *
 * `packages/engine-core/src/mechanics/st23.ts` explains where the records come
 * from: four exclusives are new here (ST23-001/002/003/005), the Leader and
 * the OP-09 slots are driven by `test/op09.test.ts`, and ST23-004 by the
 * format tests it arrived with.
 *
 * Every position seats two format starter decks and puts the card under test
 * in a zone with a `with*` setter. The Red-Haired gates read the Leader, so
 * those cases set OP09-001 Shanks (a {Red-Haired Pirates} Leader) with
 * `withLeader`; the starter's own ST31-001 Luffy is the off-type Leader.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";
const RED_HAIRED_LEADER = "OP09-001";
/** A Leader named Uta, of no {Red-Haired Pirates} type. */
const UTA_LEADER = "OP06-001";

/** p1 acting at 10 DON!!, both boards bare. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 acting, so p1's cards are the ones defending. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

function offered(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/**
 * Answers every pending prompt: the first of `picks` on offer (each used
 * once), else `apply`, else whatever is offered first.
 */
function drive(game: Game, ...picks: string[]) {
  const queue = [...picks];
  for (let guard = 0; guard < 40 && game.state.pendingEffect; guard++) {
    const options = offered(game);
    const index = queue.findIndex((id) => options.includes(id));
    const pick =
      index >= 0
        ? queue.splice(index, 1)[0]!
        : options.includes("apply")
          ? "apply"
          : options[0]!;
    game.play({ type: "resolve-effect", optionId: pick });
  }
}

const handCard = (game: Game, instanceId: string) =>
  game.state.players.p1.hand.find((card) => card.instanceId === instanceId)!;

const boardIds = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].board.map((card) => card.instanceId);

const activation = (game: Game, cardNumber: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === cardNumber,
    );

describe("ST23-001 Uta", () => {
  covers("ST23-001", "static", "[Blocker]");

  it("costs 4 less in hand while you have a 10000-power Character", () => {
    const game = table("st23-uta-discount")
      .withHand("p1", [instance("uta", "ST23-001")])
      .withBoard("p1", [character("shanks", "ST23-002")])
      .build();

    expect(effectiveCost(game.state, "p1", handCard(game, "uta"))).toBe(2);
  });

  it("costs its printed 6 with no Character at 10000", () => {
    const game = table("st23-uta-no-discount")
      .withHand("p1", [instance("uta", "ST23-001")])
      .withBoard("p1", [character("beckman", "ST23-003")])
      .build();

    expect(effectiveCost(game.state, "p1", handCard(game, "uta"))).toBe(6);
  });

  it("counts given DON!! on your own turn: a 5000 body with five reaches 10000", () => {
    const game = table("st23-uta-given-don")
      .withHand("p1", [instance("uta", "ST23-001")])
      .withBoard("p1", [character("beckman", "ST23-003")])
      .withGivenDon("p1", "beckman", 5)
      .build();

    expect(effectiveCost(game.state, "p1", handCard(game, "uta"))).toBe(2);
  });

  it("does not count the opponent's Characters", () => {
    const game = table("st23-uta-opponent-body")
      .withHand("p1", [instance("uta", "ST23-001")])
      .withBoard("p2", [character("their-shanks", "ST23-002")])
      .build();

    expect(effectiveCost(game.state, "p1", handCard(game, "uta"))).toBe(6);
  });

  it("is a Blocker", () => {
    const game = defending("st23-uta-blocker")
      .withBoard("p1", [character("uta", "ST23-001")])
      .build();

    expect(hasKeyword(game.state, "p1", "uta", "Blocker")).toBe(true);
  });
});

describe("ST23-002 Shanks", () => {
  covers("ST23-002", "static", "[On Play]");

  it("costs 3 less in hand while the opponent has an 8000 base-power Character", () => {
    const game = table("st23-shanks-discount")
      .withHand("p1", [instance("shanks", "ST23-002")])
      .withBoard("p2", [character("their-shanks", "ST23-002")])
      .build();

    expect(effectiveCost(game.state, "p1", handCard(game, "shanks"))).toBe(6);
  });

  it("reads base power: an opposing 5000 body does not open the discount", () => {
    const game = table("st23-shanks-base-power")
      .withHand("p1", [instance("shanks", "ST23-002")])
      .withBoard("p2", [character("their-beckman", "ST23-003")])
      .build();

    expect(effectiveCost(game.state, "p1", handCard(game, "shanks"))).toBe(9);
  });

  it("gives a Red-Haired Leader +2000 through the opponent's next turn", () => {
    const game = table("st23-shanks-buff")
      .withLeader("p1", RED_HAIRED_LEADER)
      .withHand("p1", [instance("shanks", "ST23-002")])
      .build();
    const before = currentPower(game.state, "p1", "p1-leader");

    game.play({ type: "play-card", cardNumber: "ST23-002" });
    drive(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 2000);

    // Still there while the opponent attacks into it, and set to lapse at
    // the end of that turn: turn 12 is theirs, the first after this one.
    while (game.state.turn === 11) game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(
      before + 2000,
    );
    expect(
      game.state.players.p1.leaderPowerModifiers.filter(
        (modifier) => modifier.amount === 2000,
      ),
    ).toEqual([expect.objectContaining({ expiresAtTurn: 12 })]);
  });

  it("gives a Leader named Uta +2000 too", () => {
    const game = table("st23-shanks-uta-leader")
      .withLeader("p1", UTA_LEADER)
      .withHand("p1", [instance("shanks", "ST23-002")])
      .build();
    const before = currentPower(game.state, "p1", "p1-leader");

    game.play({ type: "play-card", cardNumber: "ST23-002" });
    drive(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 2000);
  });

  it("gives an off-type Leader nothing", () => {
    const game = table("st23-shanks-off-type")
      .withHand("p1", [instance("shanks", "ST23-002")])
      .build();
    const before = currentPower(game.state, "p1", "p1-leader");

    game.play({ type: "play-card", cardNumber: "ST23-002" });
    drive(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before);
  });
});

describe("ST23-003 Benn.Beckman", () => {
  covers("ST23-003", "[On Play]");

  it("trashes a hand card to K.O. an opposing 4000 base-power Character", () => {
    const game = table("st23-beckman-ko")
      .withLeader("p1", RED_HAIRED_LEADER)
      .withHand("p1", [
        instance("beckman", "ST23-003"),
        instance("fodder", "OP01-016"),
      ])
      .withBoard("p2", [
        character("small", "ST23-001"),
        character("big", "ST23-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST23-003" });
    // 5000 is out of reach, so only the 4000 body is offered.
    drive(game, "fodder", "small");

    expect(boardIds(game, "p2")).toEqual(["big"]);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
  });

  it("offers nothing above 4000 base power", () => {
    const game = table("st23-beckman-out-of-reach")
      .withLeader("p1", RED_HAIRED_LEADER)
      .withHand("p1", [
        instance("beckman", "ST23-003"),
        instance("fodder", "OP01-016"),
      ])
      .withBoard("p2", [character("big", "ST23-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST23-003" });
    drive(game, "fodder");

    expect(boardIds(game, "p2")).toEqual(["big"]);
  });

  it("pays the card but K.O.s nothing behind an off-type Leader", () => {
    const game = table("st23-beckman-off-type")
      .withHand("p1", [
        instance("beckman", "ST23-003"),
        instance("fodder", "OP01-016"),
      ])
      .withBoard("p2", [character("small", "ST23-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST23-003" });
    drive(game, "fodder");

    expect(boardIds(game, "p2")).toEqual(["small"]);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
  });

  it("keeps the hand card when the cost is declined", () => {
    const game = table("st23-beckman-decline")
      .withLeader("p1", RED_HAIRED_LEADER)
      .withHand("p1", [
        instance("beckman", "ST23-003"),
        instance("fodder", "OP01-016"),
      ])
      .withBoard("p2", [character("small", "ST23-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST23-003" });
    if (offered(game).includes("skip"))
      game.play({ type: "resolve-effect", optionId: "skip" });
    drive(game);

    expect(boardIds(game, "p2")).toEqual(["small"]);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "fodder",
    );
  });
});

describe("ST23-005 Yasopp", () => {
  covers("ST23-005", "[Activate: Main]");

  it("gives one rested DON!! to the Leader, once a turn", () => {
    const game = table("st23-yasopp-give")
      .withBoard("p1", [character("yasopp", "ST23-005")])
      .withDon("p1", { active: 6, rested: 2 })
      .build();
    const rested = game.state.players.p1.restedDon.length;
    const attached = game.state.players.p1.leaderAttachedDon.length;

    expect(activation(game, "ST23-005")).toHaveLength(1);
    game.play(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "ST23-005",
    );
    drive(game, "p1-leader");

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(attached + 1);
    expect(game.state.players.p1.restedDon).toHaveLength(rested - 1);
    expect(activation(game, "ST23-005")).toHaveLength(0);
  });

  it("is not offered with no rested DON!!", () => {
    const game = table("st23-yasopp-none-rested")
      .withBoard("p1", [character("yasopp", "ST23-005")])
      .withDon("p1", { active: 8, rested: 0 })
      .build();

    expect(activation(game, "ST23-005")).toHaveLength(0);
  });
});
