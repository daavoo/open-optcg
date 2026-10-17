import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * One scenario per printed clause of the Red, Green and Blue OP10 cards that
 * were registered with no test claiming them. Each case drives the engine to
 * the decision the clause opens, through public actions, and asserts on what
 * it moved; the printed wording is `pnpm card:text <card>`.
 */

const DECKS = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
] as const;

/** p1's turn, clear board, all ten DON!! active on both sides. */
const table = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2's turn, clear board: p1 is the defending seat. */
const theirTurn = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

type Game = ReturnType<ReturnType<typeof table>["build"]>;

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const onBoard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Settles the pending effect, taking each of `preferred` when it is offered. */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("the effect never settled");
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

/** Passes the Block and Counter steps so a declared attack resolves. */
function undefended(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

/** p2 declares an attack on p1's Leader with `attacker`. */
function attackLeader(game: Game, attacker = "attacker"): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: "p1-leader",
  });
}

/** p1 declares an attack on p2's Leader with `attacker`. */
function swing(game: Game, attacker: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: "p2-leader",
  });
}

const activation = (game: Game, source: string) =>
  game
    .legalActions()
    .find(
      (action) =>
        action.type === "activate-main" &&
        (action as { sourceInstanceId?: string }).sourceInstanceId === source,
    );

describe("OP10-002 Caesar Clown (Leader)", () => {
  covers("OP10-002", "[When Attacking]");

  it("returns a {Punk Hazard} cost-2+ Character to K.O. a 4000-power Character", () => {
    const game = table("op10-002")
      .withLeader("p1", "OP10-002")
      .withBoard("p1", [
        character("scotch", "OP10-008"), // {Punk Hazard}, cost 2
        character("vergo", "OP10-004"), // {Punk Hazard}, cost 1
        character("brook", "ST31-003"), // cost 2, not {Punk Hazard}
      ])
      .withBoard("p2", [
        character("rayleigh", "ST32-004"), // 5000
        character("zoro", "ST32-005"), // 2000
      ])
      .withGivenDon("p1", "p1-leader", 2)
      .build();

    swing(game, "p1-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    // The cost: {Punk Hazard} and cost 2 or more.
    expect(effectOptions(game.state)).toEqual(["scotch"]);
    game.play({ type: "resolve-effect", optionId: "scotch" });
    // The payoff: 4000 power or less.
    expect(effectOptions(game.state)).toEqual(["zoro", "done"]);
    game.play({ type: "resolve-effect", optionId: "zoro" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["scotch"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["zoro"]);
    expect(onBoard(game, "p2", "rayleigh")).toBeDefined();
  });

  it("does nothing with only one DON!! given to the Leader", () => {
    const game = table("op10-002-gate")
      .withLeader("p1", "OP10-002")
      .withBoard("p1", [character("scotch", "OP10-008")])
      .withBoard("p2", [character("zoro", "ST32-005")])
      .withGivenDon("p1", "p1-leader", 1)
      .build();

    swing(game, "p1-leader");
    expect(effectOptions(game.state)).not.toContain("apply");
    answer(game);

    expect(onBoard(game, "p1", "scotch")).toBeDefined();
    expect(onBoard(game, "p2", "zoro")).toBeDefined();
  });
});

describe("OP10-003 Sugar (Leader)", () => {
  covers("OP10-003", "[End of Your Turn]", "[Opponent's Turn]");

  it("sets a DON!! active at the end of the turn beside a 6000-power {Donquixote Pirates}", () => {
    const game = table("op10-003-end")
      .withLeader("p1", "OP10-003")
      .withBoard("p1", [character("pink", "OP10-067")]) // 6000
      .withDonDeck("p1", 2)
      .withDon("p1", { rested: 3 })
      .build();
    const restedBefore = game.state.players.p1.restedDon.length;

    game.pass();
    answer(game);

    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore - 1);
  });

  it("sets nothing active without a 6000-power {Donquixote Pirates} Character", () => {
    const game = table("op10-003-end-gate")
      .withLeader("p1", "OP10-003")
      .withBoard("p1", [
        character("monet", "OP10-016"), // {Donquixote Pirates}, 3000
        character("jinbe", "ST31-002"), // 6000, not the type
      ])
      .withDonDeck("p1", 2)
      .withDon("p1", { rested: 3 })
      .build();
    const restedBefore = game.state.players.p1.restedDon.length;

    game.pass();
    answer(game);

    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore);
  });

  it("adds an active DON!! once when it activates an Event on the opponent's turn", () => {
    const game = theirTurn("op10-003-event")
      .withLeader("p1", "OP10-003")
      .withHand("p1", [
        instance("igloo-1", "OP10-018"),
        instance("igloo-2", "OP10-018"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDonDeck("p1", 3)
      .build();
    attackLeader(game);
    while (game.state.phase === "block") game.pass();
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-counter-event", cardNumber: "OP10-018" });
    answer(game, "attacker");

    // Two rested to pay for the Igloo, one added active.
    expect(game.state.players.p1.donDeck).toHaveLength(2);
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 2 + 1);

    // [Once Per Turn]: the second Event this turn adds nothing.
    game.play({ type: "activate-counter-event", cardNumber: "OP10-018" });
    answer(game, "attacker");
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("adds no DON!! for an Event activated on its own turn", () => {
    const game = table("op10-003-own")
      .withLeader("p1", "OP10-003")
      .withHand("p1", [instance("ufo", "OP10-020")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP10-020" });
    answer(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["ufo"]);
    expect(game.state.players.p1.donDeck).toHaveLength(3);
  });
});

describe("OP10-006 Caesar Clown", () => {
  covers("OP10-006", "[On Play]");

  it("adds a [Smiley] from the top 5, then plays it from hand", () => {
    const game = table("op10-006")
      .withHand("p1", [instance("caesar", "OP10-006")])
      .withDeckTop("p1", [
        instance("smiley", "OP10-009"),
        instance("brook", "ST31-003"),
        instance("jinbe", "ST31-002"),
        instance("sanji", "ST31-001"),
        instance("luffy", "ST31-004"),
        instance("under", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-006" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["smiley"]),
    );
    expect(effectOptions(game.state)).not.toContain("brook");
    game.play({ type: "resolve-effect", optionId: "smiley" });
    // The rest go to the bottom before the play is offered.
    answer(game, "smiley");

    expect(onBoard(game, "p1", "smiley")).toBeDefined();
    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p1.deck)[0]).toBe("under");
    expect(ids(game.state.players.p1.deck).slice(1).sort()).toEqual([
      "brook",
      "jinbe",
      "luffy",
      "sanji",
    ]);
  });

  it("plays a [Smiley] already in hand when the search misses", () => {
    const game = table("op10-006-hand")
      .withHand("p1", [
        instance("caesar", "OP10-006"),
        instance("smiley", "OP10-009"),
      ])
      .withDeckTop("p1", [
        instance("brook", "ST31-003"),
        instance("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-006" });
    answer(game, "smiley");

    expect(onBoard(game, "p1", "smiley")).toBeDefined();
    expect(game.state.players.p1.hand).toEqual([]);
  });
});

describe("OP10-007 Ceaser Soldier", () => {
  covers("OP10-007", "[On Play]");

  it("plays a {Punk Hazard} Character of cost 2 or less from hand", () => {
    const game = table("op10-007")
      .withHand("p1", [
        instance("soldier", "OP10-007"),
        instance("scotch", "OP10-008"), // {Punk Hazard}, cost 2
        instance("mocha", "OP10-015"), // {Punk Hazard}, cost 3
        instance("brook", "ST31-003"), // cost 2, not the type
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-007" });
    expect(effectOptions(game.state)).toEqual(["scotch", "done"]);
    game.play({ type: "resolve-effect", optionId: "scotch" });
    answer(game);

    expect(onBoard(game, "p1", "scotch")).toBeDefined();
    expect(ids(game.state.players.p1.hand).sort()).toEqual(["brook", "mocha"]);
  });
});

describe("OP10-010 Chadros.Higelyges (Brownbeard)", () => {
  covers("OP10-010", "[When Attacking]");

  it("gains 1000 for the turn with no other 6000-power Character", () => {
    const game = table("op10-010")
      .withBoard("p1", [
        character("brownbeard", "OP10-010"),
        character("jinbe", "ST31-002"), // 6000: one is still "1 or less"
      ])
      .withLife("p2", [instance("p2-life", "ST32-004")])
      .build();

    swing(game, "brownbeard");
    answer(game);
    expect(currentPower(game.state, "p1", "brownbeard")).toBe(6000);
    undefended(game);
    answer(game);
    game.pass();
    expect(currentPower(game.state, "p1", "brownbeard")).toBe(5000);
  });

  it("gains nothing with two 6000-power Characters", () => {
    const game = table("op10-010-gate")
      .withBoard("p1", [
        character("brownbeard", "OP10-010"),
        character("jinbe", "ST31-002"),
        character("jinbe-2", "ST31-002"),
      ])
      .build();

    swing(game, "brownbeard");
    answer(game);
    expect(currentPower(game.state, "p1", "brownbeard")).toBe(5000);
  });
});

describe("OP10-015 Mocha", () => {
  covers("OP10-015", "[On Play]");

  it("gives one of the opponent's Characters −1000 for the turn", () => {
    const game = table("op10-015")
      .withHand("p1", [instance("mocha", "OP10-015")])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-015" });
    expect(effectOptions(game.state)).toEqual(["rayleigh", "done"]);
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    answer(game);

    expect(currentPower(game.state, "p2", "rayleigh")).toBe(4000);
    game.pass();
    expect(currentPower(game.state, "p2", "rayleigh")).toBe(5000);
  });
});

describe("OP10-016 Monet", () => {
  covers("OP10-016", "[Activate: Main]");

  it("rests itself to give two rested DON!! and take 1000 off a Character", () => {
    const game = table("op10-016")
      .withBoard("p1", [
        character("monet", "OP10-016"),
        character("jinbe", "ST31-002"),
      ])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .withDonDeck("p1", 3)
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "monet" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["p1-leader", "monet", "jinbe"]),
    );
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    answer(game);

    expect(onBoard(game, "p1", "monet")?.rested).toBe(true);
    expect(onBoard(game, "p1", "jinbe")?.attachedDon).toHaveLength(2);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(currentPower(game.state, "p2", "rayleigh")).toBe(4000);
    expect(activation(game, "monet")).toBeUndefined();
  });

  it("still debuffs with no rested DON!! to give", () => {
    const game = table("op10-016-no-don")
      .withBoard("p1", [character("monet", "OP10-016")])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "monet" });
    // Nothing rested to give, so the gift asks nothing; the debuff still does.
    expect(effectOptions(game.state)).toEqual(["rayleigh", "done"]);
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    answer(game);

    expect(currentPower(game.state, "p2", "rayleigh")).toBe(4000);
    expect(game.state.players.p1.leaderAttachedDon).toEqual([]);
  });
});

describe("OP10-020 Gum-Gum UFO", () => {
  covers("OP10-020", "[Main]", "[Trigger]");

  const ufo = (seed: string, life: number) =>
    table(seed)
      .withHand("p1", [instance("ufo", "OP10-020")])
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .withLife(
        "p1",
        Array.from({ length: life }, (_, index) =>
          instance(`life-${index}`, "ST31-003"),
        ),
      )
      .build();

  it("takes 4000 off a Character, and buffs one of its own at 2 Life", () => {
    const game = ufo("op10-020-main", 2);

    game.play({ type: "activate-main", sourceCardNumber: "OP10-020" });
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["p1-leader", "jinbe", "done"]),
    );
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    answer(game);

    expect(currentPower(game.state, "p2", "rayleigh")).toBe(1000);
    expect(currentPower(game.state, "p1", "jinbe")).toBe(7000);
  });

  it("buffs nothing at 3 Life", () => {
    const game = ufo("op10-020-main-gate", 3);

    game.play({ type: "activate-main", sourceCardNumber: "OP10-020" });
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    answer(game, "jinbe");

    expect(currentPower(game.state, "p2", "rayleigh")).toBe(1000);
    expect(currentPower(game.state, "p1", "jinbe")).toBe(6000);
  });

  it("K.O.s a Character at 3000 power or less off a Life card, reading current power", () => {
    const game = theirTurn("op10-020-trigger")
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("small", "ST32-005"), // 2000
        character("pumped", "ST32-005"), // 2000 + 2 given DON!!
      ])
      .withGivenDon("p2", "pumped", 2)
      .withLife("p1", [instance("life-ufo", "OP10-020")])
      .build();
    expect(currentPower(game.state, "p2", "pumped")).toBe(4000);
    attackLeader(game);
    undefended(game);

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toEqual(["small", "done"]);
    game.play({ type: "resolve-effect", optionId: "small" });
    answer(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
  });
});

describe("OP10-021 Punk Hazard", () => {
  covers("OP10-021", "[Activate: Main]");

  it("rests itself to give a rested DON!! behind a [Caesar Clown] Leader", () => {
    const game = table("op10-021")
      .withLeader("p1", "OP10-002")
      .withStage("p1", instance("stage", "OP10-021"))
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withDonDeck("p1", 3)
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "stage" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    answer(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(onBoard(game, "p1", "jinbe")?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(activation(game, "stage")).toBeUndefined();
  });

  it("gives nothing behind another Leader", () => {
    const game = table("op10-021-gate")
      .withLeader("p1", "OP10-001")
      .withStage("p1", instance("stage", "OP10-021"))
      .withDonDeck("p1", 3)
      .withDon("p1", { rested: 2 })
      .build();

    const offered = activation(game, "stage");
    if (offered) {
      game.submit(offered);
      answer(game, "apply");
    }
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(game.state.players.p1.leaderAttachedDon).toEqual([]);
  });
});

describe("OP10-023 Issho", () => {
  covers("OP10-023", "[On Play]");

  it("rests two cost-5-or-less Characters behind a {Navy} Leader", () => {
    const game = table("op10-023")
      .withLeader("p1", "OP10-001")
      .withHand("p1", [instance("issho", "OP10-023")])
      .withBoard("p2", [
        character("oden", "ST32-002"), // cost 5
        character("rayleigh", "ST32-004"), // cost 4
        character("mihawk", "ST32-003"), // cost 6
        character("zoro", "ST32-005", { rested: true }), // already rested
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-023" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["oden", "rayleigh"]),
    );
    expect(effectOptions(game.state)).not.toContain("mihawk");
    expect(effectOptions(game.state)).not.toContain("zoro");
    game.play({ type: "resolve-effect", optionId: "oden" });
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    answer(game);

    expect(onBoard(game, "p2", "oden")?.rested).toBe(true);
    expect(onBoard(game, "p2", "rayleigh")?.rested).toBe(true);
    expect(onBoard(game, "p2", "mihawk")?.rested).toBe(false);
  });

  it("rests nothing behind a Leader without {Navy}", () => {
    const game = table("op10-023-gate")
      .withHand("p1", [instance("issho", "OP10-023")])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-023" });
    answer(game, "rayleigh");

    expect(onBoard(game, "p2", "rayleigh")?.rested).toBe(false);
  });
});

/** The two 2-cost Kin'emon assemble the 6-cost one; each names the other. */
const kinemon = (
  seed: string,
  source: "OP10-026" | "OP10-027",
  inTrash: string,
) =>
  table(seed)
    .withBoard("p1", [character("source", source)])
    .withTrash("p1", [instance("trash-kin", inTrash)])
    .withHand("p1", [instance("big", "OP12-025")]) // Kin'emon, cost 6
    .withDeckTop("p1", [instance("deck-top", "ST32-005")])
    .build();

describe("OP10-026 Kin'emon", () => {
  covers("OP10-026", "[Activate: Main]");

  it("bottoms itself and the 0-power Kin'emon to play the cost-6 Kin'emon", () => {
    const game = kinemon("op10-026", "OP10-026", "OP10-027");

    game.play({ type: "activate-main", sourceInstanceId: "source" });
    game.play({ type: "resolve-effect", optionId: "trash-kin" });
    game.play({ type: "resolve-effect", optionId: "big" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["big"]);
    expect(game.state.players.p1.trash).toEqual([]);
    expect(ids(game.state.players.p1.deck)[0]).toBe("deck-top");
    expect(ids(game.state.players.p1.deck).slice(-2).sort()).toEqual([
      "source",
      "trash-kin",
    ]);
  });

  it("cannot pay with a second 1000-power copy of itself", () => {
    const game = kinemon("op10-026-gate", "OP10-026", "OP10-026");

    const offered = activation(game, "source");
    if (offered) {
      game.submit(offered);
      answer(game, "apply", "trash-kin", "big");
    }
    expect(onBoard(game, "p1", "source")).toBeDefined();
    expect(ids(game.state.players.p1.hand)).toEqual(["big"]);
  });
});

describe("OP10-027 Kin'emon", () => {
  covers("OP10-027", "[Activate: Main]");

  it("bottoms itself and the 1000-power Kin'emon to play the cost-6 Kin'emon", () => {
    const game = kinemon("op10-027", "OP10-027", "OP10-026");

    game.play({ type: "activate-main", sourceInstanceId: "source" });
    game.play({ type: "resolve-effect", optionId: "trash-kin" });
    game.play({ type: "resolve-effect", optionId: "big" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["big"]);
    expect(ids(game.state.players.p1.deck).slice(-2).sort()).toEqual([
      "source",
      "trash-kin",
    ]);
  });

  it("cannot pay with a second 0-power copy of itself", () => {
    const game = kinemon("op10-027-gate", "OP10-027", "OP10-027");

    const offered = activation(game, "source");
    if (offered) {
      game.submit(offered);
      answer(game, "apply", "trash-kin", "big");
    }
    expect(onBoard(game, "p1", "source")).toBeDefined();
    expect(ids(game.state.players.p1.hand)).toEqual(["big"]);
  });
});

describe("OP10-028 Kouzuki Momonosuke", () => {
  covers("OP10-028", "[Activate: Main]");

  it("rests two DON!! and trashes itself to add two {The Akazaya Nine} cards", () => {
    const game = table("op10-028")
      .withBoard("p1", [character("momo", "OP10-028")])
      .withDeckTop("p1", [
        instance("kin", "ST32-001"), // {The Akazaya Nine}
        instance("oden", "ST32-002"), // {Kouzuki Clan}
        instance("kiku", "OP06-104"), // {The Akazaya Nine}
        instance("raizo", "OP06-112"), // {The Akazaya Nine}
        instance("brook", "ST31-003"),
        instance("under", "ST31-002"),
      ])
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", sourceInstanceId: "momo" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["kin", "kiku", "raizo"]),
    );
    expect(effectOptions(game.state)).not.toContain("oden");
    game.play({ type: "resolve-effect", optionId: "kin" });
    game.play({ type: "resolve-effect", optionId: "kiku" });
    answer(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["kiku", "kin"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["momo"]);
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 2);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(ids(game.state.players.p1.deck)[0]).toBe("under");
  });

  it("is not offered with fewer than two active DON!!", () => {
    const game = table("op10-028-gate")
      .withBoard("p1", [character("momo", "OP10-028")])
      .withDonDeck("p1", 9)
      .build();

    const offered = activation(game, "momo");
    if (offered) {
      game.submit(offered);
      answer(game, "apply");
    }
    expect(onBoard(game, "p1", "momo")).toBeDefined();
  });
});

describe("OP10-035 Brook", () => {
  covers("OP10-035", "[On K.O.]");

  it("rests the opponent's Leader when it is K.O.'d", () => {
    const game = theirTurn("op10-035")
      .withBoard("p1", [character("brook", "OP10-035", { rested: true })])
      .withBoard("p2", [
        character("attacker", "ST32-003"), // 7000, cost 6
        character("rayleigh", "ST32-004"), // cost 4
        character("mihawk", "ST32-003"), // cost 6
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "brook",
    });
    undefended(game);

    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["p2-leader", "rayleigh", "done"]),
    );
    expect(effectOptions(game.state)).not.toContain("mihawk");
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    answer(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["brook"]);
    expect(game.state.players.p2.leaderRested).toBe(true);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p2-leader",
        ),
    ).toBe(false);
  });
});

describe("OP10-038 Roronoa Zoro", () => {
  covers("OP10-038", "[Opponent's Turn]");

  const zoro = (seed: string, turn: typeof table, restedPartner: boolean) =>
    turn(seed)
      .withBoard("p1", [
        character("zoro", "OP10-038", { rested: true }),
        character("urouge", "OP10-101", { rested: restedPartner }),
      ])
      .build();

  it("is 8000 on the opponent's turn with two rested Characters", () => {
    expect(
      currentPower(zoro("op10-038", theirTurn, true).state, "p1", "zoro"),
    ).toBe(8000);
  });

  it("is 6000 with one rested Character, or on its own turn", () => {
    expect(
      currentPower(zoro("op10-038-one", theirTurn, false).state, "p1", "zoro"),
    ).toBe(6000);
    expect(
      currentPower(zoro("op10-038-own", table, true).state, "p1", "zoro"),
    ).toBe(6000);
  });
});

describe("OP10-039 Gum-Gum Dragon Fire Pistol Twister Star", () => {
  covers("OP10-039", "[Main]", "[Trigger]");

  it("adds two {ODYSSEY} Characters from the top 5 behind an {ODYSSEY} Leader", () => {
    const game = table("op10-039-main")
      .withLeader("p1", "OP09-022")
      .withHand("p1", [instance("twister", "OP10-039")])
      .withDeckTop("p1", [
        instance("brook", "OP10-035"), // {ODYSSEY} Character
        instance("twister-2", "OP10-039"), // {ODYSSEY} Event
        instance("lucci", "OP09-038"), // {ODYSSEY} Character
        instance("zoro", "OP10-038"), // {ODYSSEY} Character
        instance("jinbe", "ST31-002"),
        instance("under", "ST31-003"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP10-039" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["brook", "lucci", "zoro"]),
    );
    expect(effectOptions(game.state)).not.toContain("twister-2");
    game.play({ type: "resolve-effect", optionId: "brook" });
    game.play({ type: "resolve-effect", optionId: "lucci" });
    answer(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["brook", "lucci"]);
    expect(ids(game.state.players.p1.deck)[0]).toBe("under");
  });

  it("looks at nothing behind a Leader without {ODYSSEY}", () => {
    const game = table("op10-039-gate")
      .withHand("p1", [instance("twister", "OP10-039")])
      .withDeckTop("p1", [instance("brook", "OP10-035")])
      .build();

    const offered = game
      .legalActions()
      .find(
        (action) =>
          action.type === "activate-main" &&
          (action as { sourceCardNumber?: string }).sourceCardNumber ===
            "OP10-039",
      );
    if (offered) {
      game.submit(offered);
      answer(game, "brook");
    }

    expect(ids(game.state.players.p1.hand)).not.toContain("brook");
    expect(ids(game.state.players.p1.deck)).toEqual(["brook"]);
  });

  it("rests a cost-5-or-less Character off a Life card", () => {
    const game = theirTurn("op10-039-trigger")
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("oden", "ST32-002"), // cost 5
        character("mihawk", "ST32-003"), // cost 6
      ])
      .withLife("p1", [instance("life-twister", "OP10-039")])
      .build();
    attackLeader(game);
    undefended(game);

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toEqual(["oden", "done"]);
    game.play({ type: "resolve-effect", optionId: "oden" });
    answer(game);

    expect(onBoard(game, "p2", "oden")?.rested).toBe(true);
  });
});

describe("OP10-040 The Weak Do Not Have the Right to Choose How They Die", () => {
  covers("OP10-040", "[Main]", "[Counter]");

  it("K.O.s a rested Character of cost 7 or less", () => {
    const game = table("op10-040-main")
      .withHand("p1", [instance("weak", "OP10-040")])
      .withBoard("p2", [
        character("mihawk", "ST32-003", { rested: true }), // cost 6
        character("oden", "ST32-002"), // active
        character("teach", "ST27-005", { rested: true }), // cost 7
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP10-040" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["mihawk", "teach", "done"]),
    );
    expect(effectOptions(game.state)).not.toContain("oden");
    game.play({ type: "resolve-effect", optionId: "mihawk" });
    answer(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["mihawk"]);
  });

  it("K.O.s the attacker, rested by its own declaration, as a Counter", () => {
    const game = theirTurn("op10-040-counter")
      .withHand("p1", [instance("weak", "OP10-040")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    attackLeader(game);
    while (game.state.phase === "block") game.pass();

    game.play({ type: "activate-counter-event", cardNumber: "OP10-040" });
    expect(effectOptions(game.state)).toEqual(["attacker", "done"]);
    game.play({ type: "resolve-effect", optionId: "attacker" });
    answer(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["attacker"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["weak"]);
  });
});

describe("OP10-047 Koala", () => {
  covers("OP10-047", "[When Attacking]");

  it("returns a cost-3+ {Revolutionary Army} Character for +3000", () => {
    const game = table("op10-047")
      .withBoard("p1", [
        character("koala", "OP10-047"), // cost 2
        character("sabo", "OP10-049"), // cost 4
        character("karasu", "ST35-003"), // cost 3
        character("ivankov", "OP13-008"), // cost 2
      ])
      .build();

    swing(game, "koala");
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game.state).sort()).toEqual(["karasu", "sabo"]);
    game.play({ type: "resolve-effect", optionId: "karasu" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["karasu"]);
    expect(currentPower(game.state, "p1", "koala")).toBe(6000);
  });

  it("declining keeps the board and the power", () => {
    const game = table("op10-047-decline")
      .withBoard("p1", [
        character("koala", "OP10-047"),
        character("sabo", "OP10-049"),
      ])
      .build();

    swing(game, "koala");
    game.play({ type: "resolve-effect", optionId: "skip" });
    answer(game);

    expect(onBoard(game, "p1", "sabo")).toBeDefined();
    expect(currentPower(game.state, "p1", "koala")).toBe(3000);
  });
});

describe("OP10-048 Sai", () => {
  covers("OP10-048", "[On Play]");

  it("rests a {Dressrosa} Leader to return a cost-1 Character", () => {
    const game = table("op10-048")
      .withLeader("p1", "OP10-042")
      .withHand("p1", [instance("sai", "OP10-048")])
      .withBoard("p2", [
        character("zoro", "ST32-005"), // cost 1
        character("rayleigh", "ST32-004"), // cost 4
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-048" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    expect(effectOptions(game.state)).toEqual(["zoro", "done"]);
    game.play({ type: "resolve-effect", optionId: "zoro" });
    answer(game);

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(ids(game.state.players.p2.hand)).toEqual(["zoro"]);
  });

  it("can pay with a {Dressrosa} Stage instead", () => {
    const game = table("op10-048-stage")
      .withStage("p1", instance("stage", "OP15-057"))
      .withHand("p1", [instance("sai", "OP10-048")])
      .withBoard("p2", [character("zoro", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-048" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    // The Leader here is not {Dressrosa}, so the Stage is the only payment.
    expect(effectOptions(game.state)).toEqual(["stage"]);
    game.play({ type: "resolve-effect", optionId: "stage" });
    game.play({ type: "resolve-effect", optionId: "zoro" });
    answer(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(ids(game.state.players.p2.hand)).toEqual(["zoro"]);
  });
});

describe("OP10-051 Hack", () => {
  covers("OP10-051", "[When Attacking]");

  it("digs 3 for a {Revolutionary Army} Character with a DON!! given", () => {
    const game = table("op10-051")
      .withBoard("p1", [character("hack", "OP10-051")])
      .withGivenDon("p1", "hack", 1)
      .withDeckTop("p1", [
        instance("sabo", "OP10-049"), // {Revolutionary Army} Character
        instance("brook", "ST31-003"),
        instance("karasu", "ST35-003"), // {Revolutionary Army} Character
        instance("under", "ST31-002"),
      ])
      .build();

    swing(game, "hack");
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["sabo", "karasu"]),
    );
    expect(effectOptions(game.state)).not.toContain("brook");
    game.play({ type: "resolve-effect", optionId: "sabo" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["sabo"]);
    expect(ids(game.state.players.p1.deck)[0]).toBe("under");
  });

  it("looks at nothing without a DON!! given", () => {
    const game = table("op10-051-gate")
      .withBoard("p1", [character("hack", "OP10-051")])
      .withDeckTop("p1", [instance("sabo", "OP10-049")])
      .build();

    swing(game, "hack");
    answer(game, "sabo");

    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p1.deck)).toEqual(["sabo"]);
  });
});

describe("OP10-052 Bartolomeo", () => {
  covers("OP10-052", "[Blocker]", "[On Play]");

  it("blocks", () => {
    const game = theirTurn("op10-052-block")
      .withBoard("p1", [character("barto", "OP10-052")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    expect(hasKeyword(game.state, "p1", "barto", "Blocker")).toBe(true);
    attackLeader(game);

    game.play({ type: "block", blockerInstanceId: "barto" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("barto");
  });

  it("puts a cost-1 Character from either side at the bottom of its owner's deck", () => {
    const game = table("op10-052-play")
      .withHand("p1", [instance("barto", "OP10-052")])
      .withBoard("p1", [character("bian", "OP10-053")]) // cost 1
      .withBoard("p2", [
        character("zoro", "ST32-005"), // cost 1
        character("rayleigh", "ST32-004"), // cost 4
      ])
      .withDeckTop("p2", [instance("p2-top", "ST32-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-052" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["bian", "zoro", "done"]),
    );
    expect(effectOptions(game.state)).not.toContain("rayleigh");
    game.play({ type: "resolve-effect", optionId: "zoro" });
    answer(game);

    const deck = ids(game.state.players.p2.deck);
    expect(deck[0]).toBe("p2-top");
    expect(deck.at(-1)).toBe("zoro");
    expect(onBoard(game, "p1", "bian")).toBeDefined();
  });
});
