import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * One scenario per printed clause of the OP10 cards that shipped with mechanics
 * but no test claiming them. Each case drives the engine to the decision the
 * clause opens, through public actions, and asserts on what it moved; the
 * printed wording is `pnpm card:text <card>`.
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

const leaderActivation = (action: { type: string }): boolean =>
  action.type === "activate-main" &&
  (action as { sourceInstanceId?: string }).sourceInstanceId === "p1-leader";

/** p2 declares an attack on p1's Leader with `attacker`. */
function attackLeader(game: Game, attacker = "attacker"): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: "p1-leader",
  });
}

describe("OP10-001 Smoker (Leader)", () => {
  covers("OP10-001", "[Opponent's Turn]", "[Activate: Main]");

  it("gives {Navy} and {Punk Hazard} Characters +1000 on the opponent's turn only", () => {
    const build = (seed: string, turn: typeof table) =>
      turn(seed)
        .withLeader("p1", "OP10-001")
        .withBoard("p1", [
          character("nami", "OP10-013"), // {Punk Hazard}, 7000
          character("sengoku", "OP10-031"), // {Navy}, 7000
          character("urouge", "OP10-101"), // neither, 7000
        ])
        .build();

    const theirs = build("op10-001-aura", theirTurn);
    expect(currentPower(theirs.state, "p1", "nami")).toBe(8000);
    expect(currentPower(theirs.state, "p1", "sengoku")).toBe(8000);
    expect(currentPower(theirs.state, "p1", "urouge")).toBe(7000);
    // The Leader is not one of "your Characters".
    expect(currentPower(theirs.state, "p1", "p1-leader")).toBe(5000);

    const mine = build("op10-001-aura-own", table);
    expect(currentPower(mine.state, "p1", "nami")).toBe(7000);
  });

  it("sets two rested DON!! active once, with a 7000-power Character out", () => {
    const game = table("op10-001-main")
      .withLeader("p1", "OP10-001")
      .withBoard("p1", [character("nami", "OP10-013")])
      .withDonDeck("p1", 10)
      .withDon("p1", { active: 2, rested: 3 })
      .build();

    game.play({
      type: "activate-main",
      sourceInstanceId: "p1-leader",
    });
    answer(game);

    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(4);
    // [Once Per Turn]: the Leader is not offered a second time.
    expect(game.legalActions().filter(leaderActivation)).toEqual([]);
  });

  it("sets nothing active without a Character at 7000 power", () => {
    const game = table("op10-001-main-gate")
      .withLeader("p1", "OP10-001")
      .withBoard("p1", [character("killer", "OP10-106")]) // 5000
      .withDonDeck("p1", 10)
      .withDon("p1", { active: 2, rested: 3 })
      .build();

    const offered = game.legalActions().find(leaderActivation);
    // Either withheld or a no-op; what it may not do is set DON!! active.
    if (offered) {
      game.submit(offered);
      answer(game);
    }
    expect(game.state.players.p1.restedDon).toHaveLength(3);
  });
});

describe("OP10-018 Ten-Layer Igloo", () => {
  covers("OP10-018", "[Counter]", "[Trigger]");

  it("adds 3000 to the battle, then takes 2000 off one of the opponent's cards", () => {
    const game = theirTurn("op10-018-counter")
      .withHand("p1", [instance("igloo", "OP10-018")])
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();
    attackLeader(game);
    while (game.state.phase === "block") game.pass();

    game.play({ type: "activate-counter-event" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["attacker", "p2-leader", "done"]),
    );
    game.play({ type: "resolve-effect", optionId: "attacker" });
    answer(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    // Turn-scoped, on the card: the attacker swings for 5000 - 2000.
    expect(currentPower(game.state, "p2", "attacker")).toBe(3000);
    expect(ids(game.state.players.p1.trash)).toEqual(["igloo"]);
  });

  it("gives one of its own cards +1000 for the turn off a Life card", () => {
    const game = theirTurn("op10-018-trigger")
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .withBoard("p1", [character("mine", "OP10-101")])
      .withLife("p1", [instance("life-igloo", "OP10-018")])
      .build();
    attackLeader(game);
    undefended(game);

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "mine" });
    answer(game);

    expect(currentPower(game.state, "p1", "mine")).toBe(8000);
    game.pass();
    // "during this turn": gone once p2's turn ends.
    expect(currentPower(game.state, "p1", "mine")).toBe(7000);
  });
});

describe("OP10-025 Enel", () => {
  covers("OP10-025", "[On Play]");

  it("draws 3 and trashes 2 with two rested Characters", () => {
    const game = table("op10-025")
      .withHand("p1", [
        instance("enel", "OP10-025"),
        instance("kept", "OP10-101"),
      ])
      .withBoard("p1", [
        character("r1", "OP10-013", { rested: true }),
        character("r2", "OP10-013", { rested: true }),
      ])
      .withDeckTop("p1", [
        instance("d1", "ST31-003"),
        instance("d2", "ST31-003"),
        instance("d3", "ST31-003"),
        instance("d4", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-025" });
    // Exactly two, and the three just drawn are among the choices.
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["kept", "d1", "d2", "d3"]),
    );
    expect(effectOptions(game.state)).not.toContain("done");
    game.play({ type: "resolve-effect", optionId: "d1" });
    game.play({ type: "resolve-effect", optionId: "d2" });
    answer(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["d3", "kept"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["d1", "d2"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["d4"]);
  });

  it("does nothing with one rested Character", () => {
    const game = table("op10-025-gate")
      .withHand("p1", [instance("enel", "OP10-025")])
      .withBoard("p1", [
        character("r1", "OP10-013", { rested: true }),
        character("a1", "OP10-013"),
      ])
      .withDeckTop("p1", [instance("d1", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-025" });
    answer(game);

    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p1.deck)).toEqual(["d1"]);
  });
});

describe("OP10-029 Dracule Mihawk", () => {
  covers("OP10-029", "[On Play]");

  it("sets a rested {ODYSSEY} Character of cost 5 or less active", () => {
    const game = table("op10-029")
      .withHand("p1", [instance("mihawk", "OP10-029")])
      .withBoard("p1", [
        character("lucci", "OP09-038", { rested: true }), // ODYSSEY, 4
        character("adio", "OP09-023", { rested: true }), // ODYSSEY, 9
        character("nami", "OP10-013", { rested: true }), // not ODYSSEY
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-029" });
    expect(effectOptions(game.state)).toEqual(["lucci", "done"]);
    game.play({ type: "resolve-effect", optionId: "lucci" });
    answer(game);

    expect(onBoard(game, "p1", "lucci")?.rested).toBe(false);
    expect(onBoard(game, "p1", "adio")?.rested).toBe(true);
  });

  it("asks nothing with fewer than two rested Characters", () => {
    const game = table("op10-029-gate")
      .withHand("p1", [instance("mihawk", "OP10-029")])
      .withBoard("p1", [character("lucci", "OP09-038", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-029" });

    expect(game.state.pendingEffect).toBeNull();
    expect(onBoard(game, "p1", "lucci")?.rested).toBe(true);
  });
});

describe("OP10-037 Lim", () => {
  covers("OP10-037", "static", "[End of Your Turn]");

  it("rests an {ODYSSEY} Character instead of leaving to the opponent's bounce", () => {
    const game = theirTurn("op10-037-replace")
      .withBoard("p1", [
        character("lim", "OP10-037"),
        character("lucci", "OP09-038"),
      ])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP09-058" });
    game.play({ type: "resolve-effect", optionId: "lim" });
    const replace = effectOptions(game.state).find((id) =>
      id.startsWith("replace:"),
    );
    expect(replace).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replace! });
    answer(game, "lucci");

    expect(onBoard(game, "p1", "lim")).toBeDefined();
    expect(onBoard(game, "p1", "lucci")?.rested).toBe(true);
    expect(game.state.players.p1.hand).toEqual([]);
  });

  it("is not offered with no active {ODYSSEY} Character to rest", () => {
    const game = theirTurn("op10-037-no-cost")
      .withBoard("p1", [
        character("lim", "OP10-037", { rested: true }),
        character("nami", "OP10-013"),
      ])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP09-058" });
    game.play({ type: "resolve-effect", optionId: "lim" });
    expect(
      effectOptions(game.state).some((id) => id.startsWith("replace:")),
    ).toBe(false);
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["lim"]);
  });

  it("sets a rested {ODYSSEY} Character active at the end of its controller's turn", () => {
    const game = table("op10-037-end")
      .withBoard("p1", [
        character("lim", "OP10-037"),
        character("lucci", "OP09-038", { rested: true }),
        character("nami", "OP10-013", { rested: true }),
      ])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.pass();
    answer(game, "lucci");

    expect(game.state.turnPlayerId).toBe("p2");
    expect(onBoard(game, "p1", "lucci")?.rested).toBe(false);
    // Only {ODYSSEY}: Nami stays rested through the opponent's turn.
    expect(onBoard(game, "p1", "nami")?.rested).toBe(true);
  });
});

describe("OP10-041 Radio Knife", () => {
  covers("OP10-041", "[Main]", "[Trigger]");

  it("rests a cost-6 Character, then K.O.s a rested cost-5 one", () => {
    const game = table("op10-041-main")
      .withHand("p1", [instance("knife", "OP10-041")])
      .withBoard("p2", [
        character("mihawk", "ST32-003"), // cost 6
        character("oden", "ST32-002", { rested: true }), // cost 5
        character("teach", "ST27-005", { rested: true }), // cost 7
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP10-041" });
    // The rest: cost 6 or less, so the cost-7 body is not on offer.
    expect(effectOptions(game.state)).not.toContain("teach");
    game.play({ type: "resolve-effect", optionId: "mihawk" });
    // The K.O.: rested and cost 5 or less -- Mihawk is rested now but costs 6.
    expect(effectOptions(game.state)).toEqual(["oden", "done"]);
    game.play({ type: "resolve-effect", optionId: "oden" });
    answer(game);

    expect(onBoard(game, "p2", "mihawk")?.rested).toBe(true);
    expect(ids(game.state.players.p2.trash)).toEqual(["oden"]);
  });

  it("rests a cost-4 Character off a Life card", () => {
    const game = theirTurn("op10-041-trigger")
      .withBoard("p2", [
        character("attacker", "ST32-002", { playedTurn: 1 }), // cost 5
        character("rayleigh", "ST32-004"), // cost 4
      ])
      .withLife("p1", [instance("life-knife", "OP10-041")])
      .build();
    attackLeader(game);
    undefended(game);

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toEqual(["rayleigh", "done"]);
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    answer(game);

    expect(onBoard(game, "p2", "rayleigh")?.rested).toBe(true);
  });
});

describe("OP10-055 Marco", () => {
  covers("OP10-055", "[Blocker]", "[On K.O.]");

  it("blocks, and when K.O.'d returns a cost-4 Character to its owner's hand", () => {
    const game = theirTurn("op10-055")
      .withBoard("p1", [character("marco", "OP10-055")])
      .withBoard("p2", [
        character("attacker", "ST32-003", { playedTurn: 1 }), // 7000, cost 6
        character("zoro", "ST32-005"), // cost 1
      ])
      .build();
    attackLeader(game);

    game.play({ type: "block", blockerInstanceId: "marco" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("marco");
    undefended(game);

    // Cost 4 or less: the 6-cost attacker is not offered.
    expect(effectOptions(game.state)).toEqual(["zoro", "done"]);
    game.play({ type: "resolve-effect", optionId: "zoro" });
    answer(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["marco"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["zoro"]);
    expect(ids(game.state.players.p2.board)).toEqual(["attacker"]);
  });
});

describe("OP10-066 Giolla", () => {
  covers("OP10-066", "[On Your Opponent's Attack]");

  it("rests two DON!! to rest a cost-4 Character, once per turn", () => {
    const game = theirTurn("op10-066")
      .withBoard("p1", [character("giolla", "OP10-066")])
      .withLife("p1", [instance("l1", "ST31-003"), instance("l2", "ST31-003")])
      .withBoard("p2", [
        character("attacker", "ST32-004", { playedTurn: 1 }),
        character("second", "ST32-005", { playedTurn: 1 }),
        character("big", "ST32-003"), // cost 6
      ])
      .build();
    attackLeader(game);

    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game.state)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "second" });
    answer(game);

    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(onBoard(game, "p2", "second")?.rested).toBe(true);

    undefended(game);
    answer(game);
    // A second attack this turn: the once-per-turn use is spent.
    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    expect(effectOptions(game.state)).not.toContain("apply");
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("declining keeps both DON!! active", () => {
    const game = theirTurn("op10-066-decline")
      .withBoard("p1", [character("giolla", "OP10-066")])
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();
    attackLeader(game);

    game.play({ type: "resolve-effect", optionId: "skip" });
    answer(game);

    expect(game.state.players.p1.restedDon).toHaveLength(0);
    expect(onBoard(game, "p2", "attacker")?.rested).toBe(true);
  });
});

describe("OP10-076 Baby 5", () => {
  covers("OP10-076", "[On Play]");

  it("trashes a card to add an active DON!! behind a {Donquixote Pirates} Leader", () => {
    const game = table("op10-076")
      .withLeader("p1", "OP10-003")
      .withHand("p1", [
        instance("baby5", "OP10-076"),
        instance("pitch", "ST31-003"),
      ])
      .withDonDeck("p1", 2)
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "play-card", cardNumber: "OP10-076" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch" });
    answer(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["pitch"]);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    // Three rested to play Baby 5, one added active.
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 3 + 1);
  });

  it("adds nothing behind another Leader, though the card is still trashed", () => {
    const game = table("op10-076-gate")
      .withHand("p1", [
        instance("baby5", "OP10-076"),
        instance("pitch", "ST31-003"),
      ])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-076" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    answer(game, "pitch");

    expect(ids(game.state.players.p1.trash)).toEqual(["pitch"]);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("declining keeps the hand", () => {
    const game = table("op10-076-decline")
      .withLeader("p1", "OP10-003")
      .withHand("p1", [
        instance("baby5", "OP10-076"),
        instance("pitch", "ST31-003"),
      ])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-076" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["pitch"]);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });
});

describe("OP10-082 Kuzan", () => {
  covers("OP10-082", "static", "[Activate: Main]");

  it("cannot be returned to hand by the opponent's effect", () => {
    const game = theirTurn("op10-082-static")
      .withBoard("p1", [
        character("kuzan", "OP10-082"),
        character("nami", "OP10-013"),
      ])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP09-058" });
    // Choosing it is legal; the bounce simply cannot move it.
    game.play({ type: "resolve-effect", optionId: "kuzan" });
    answer(game);

    expect(onBoard(game, "p1", "kuzan")).toBeDefined();
    expect(game.state.players.p1.hand).toEqual([]);
  });

  it("trashes itself to draw and play a {Blackbeard Pirates} cost 5 from trash", () => {
    const game = table("op10-082-main")
      .withBoard("p1", [character("kuzan", "OP10-082")])
      .withTrash("p1", [
        instance("kuzan-2", "OP10-082"), // "other than [Kuzan]"
        instance("wolf", "OP10-084"), // cost 5
        instance("teach", "ST27-005"), // cost 7
      ])
      .withDeckTop("p1", [instance("draw", "ST31-003")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "kuzan" });
    expect(effectOptions(game.state)).toEqual(["wolf", "done"]);
    game.play({ type: "resolve-effect", optionId: "wolf" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["draw"]);
    expect(ids(game.state.players.p1.board)).toEqual(["wolf"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "kuzan",
      "kuzan-2",
      "teach",
    ]);
  });
});

describe("OP10-086 Shiryu", () => {
  covers("OP10-086", "[Opponent's Turn]", "[Activate: Main]");

  it("is 7000 on the opponent's turn and 5000 on its own", () => {
    const theirs = theirTurn("op10-086-static")
      .withBoard("p1", [character("shiryu", "OP10-086")])
      .build();
    expect(currentPower(theirs.state, "p1", "shiryu")).toBe(7000);

    const mine = table("op10-086-static-own")
      .withBoard("p1", [character("shiryu", "OP10-086")])
      .build();
    expect(currentPower(mine.state, "p1", "shiryu")).toBe(5000);
  });

  it("K.O.s a base cost 3 the turn it is played, behind a {Blackbeard Pirates} Leader", () => {
    const game = table("op10-086-main")
      .withLeader("p1", "OP09-081")
      .withHand("p1", [instance("shiryu", "OP10-086")])
      .withBoard("p2", [
        character("small", "OP09-007"), // cost 3
        character("big", "ST32-004"), // cost 4
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-086" });
    answer(game);
    game.play({ type: "activate-main", sourceInstanceId: "shiryu" });
    expect(effectOptions(game.state)).toEqual(["small", "done"]);
    game.play({ type: "resolve-effect", optionId: "small" });
    answer(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "shiryu",
        ),
    ).toBe(false);
  });

  it("is not offered when it was played on an earlier turn", () => {
    const game = table("op10-086-gate")
      .withLeader("p1", "OP09-081")
      .withBoard("p1", [character("shiryu", "OP10-086")])
      .withBoard("p2", [character("small", "OP09-007")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "shiryu",
        ),
    ).toBe(false);
  });
});

describe("OP10-106 Killer", () => {
  covers("OP10-106", "[On K.O.]");

  it("digs 3 for a {Supernovas} or {Kid Pirates} card behind a {Supernovas} Leader", () => {
    const game = theirTurn("op10-106")
      .withLeader("p1", "OP10-022")
      .withBoard("p1", [character("killer", "OP10-106", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-003", { playedTurn: 1 })])
      .withDeckTop("p1", [
        instance("heat", "OP09-007"), // {Kid Pirates}
        instance("brook", "ST31-003"), // neither
        instance("urouge", "OP10-101"), // {Supernovas}
        instance("under", "ST31-002"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "killer",
    });
    undefended(game);

    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["heat", "urouge"]),
    );
    expect(effectOptions(game.state)).not.toContain("brook");
    game.play({ type: "resolve-effect", optionId: "heat" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["heat"]);
    // The rest go under the card that was never looked at.
    expect(ids(game.state.players.p1.deck)[0]).toBe("under");
    expect(ids(game.state.players.p1.deck).slice(1).sort()).toEqual([
      "brook",
      "urouge",
    ]);
  });

  it("looks at nothing behind a Leader without {Supernovas}", () => {
    const game = theirTurn("op10-106-gate")
      .withLeader("p1", "OP10-001")
      .withBoard("p1", [character("killer", "OP10-106", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-003", { playedTurn: 1 })])
      .withDeckTop("p1", [instance("heat", "OP09-007")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "killer",
    });
    undefended(game);
    answer(game);

    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p1.deck)).toEqual(["heat"]);
  });
});

describe("OP10-108 Scratchmen Apoo", () => {
  covers("OP10-108", "static");

  const apoo = (seed: string, partner: string | null) =>
    table(seed)
      .withBoard("p1", [
        character("apoo", "OP10-108"),
        ...(partner ? [character("partner", partner)] : []),
      ])
      .build();

  it("has [Blocker] beside another yellow {Supernovas} Character", () => {
    expect(
      hasKeyword(apoo("op10-108", "OP10-101").state, "p1", "apoo", "Blocker"),
    ).toBe(true);
  });

  it("has no [Blocker] alone, beside another Apoo, or beside a green {Supernovas}", () => {
    expect(
      hasKeyword(apoo("op10-108-alone", null).state, "p1", "apoo", "Blocker"),
    ).toBe(false);
    expect(
      hasKeyword(
        apoo("op10-108-twin", "OP10-108").state,
        "p1",
        "apoo",
        "Blocker",
      ),
    ).toBe(false);
    expect(
      hasKeyword(
        apoo("op10-108-green", "OP09-030").state,
        "p1",
        "apoo",
        "Blocker",
      ),
    ).toBe(false);
  });
});

describe("OP10-115 Let's Meet Again in the New World", () => {
  covers("OP10-115", "[Counter]", "[Trigger]");

  const counter = (seed: string, life: number) => {
    const game = theirTurn(seed)
      .withHand("p1", [instance("meet", "OP10-115")])
      .withLife(
        "p1",
        Array.from({ length: life }, (_, index) =>
          instance(`life-${index}`, "ST31-003"),
        ),
      )
      .withDeckTop("p1", [instance("draw", "ST31-002")])
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();
    attackLeader(game);
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event" });
    answer(game);
    return game;
  };

  it("adds 4000 to the battle and draws at 0 Life", () => {
    const game = counter("op10-115-zero", 0);
    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(ids(game.state.players.p1.hand)).toEqual(["draw"]);
  });

  it("adds 4000 and draws nothing with Life left", () => {
    const game = counter("op10-115-one", 1);
    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(game.state.players.p1.hand).toEqual([]);
  });

  it("K.O.s a Character whose cost is within the opponent's Life count", () => {
    const game = theirTurn("op10-115-trigger")
      .withBoard("p2", [
        character("attacker", "ST32-004", { playedTurn: 1 }), // cost 4
        character("oden", "ST32-002"), // cost 5
        character("zoro", "ST32-005"), // cost 1
      ])
      .withLife("p2", [
        instance("t1", "ST32-002"),
        instance("t2", "ST32-002"),
        instance("t3", "ST32-002"),
        instance("t4", "ST32-002"),
      ])
      .withLife("p1", [instance("life-meet", "OP10-115")])
      .build();
    attackLeader(game);
    undefended(game);

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    // Four Life: cost 4 and below.
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["attacker", "zoro"]),
    );
    expect(effectOptions(game.state)).not.toContain("oden");
    game.play({ type: "resolve-effect", optionId: "attacker" });
    answer(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["attacker"]);
  });
});

describe("OP10-119 Trafalgar Law", () => {
  covers("OP10-119", "[On Play]");

  it("banks a {Supernovas} Character face-down and gives the Leader a rested DON!!", () => {
    const game = table("op10-119")
      .withLeader("p1", "OP10-022")
      .withHand("p1", [
        instance("law", "OP10-119"),
        instance("urouge", "OP10-101"), // {Supernovas}
        instance("brook", "ST31-003"), // not
      ])
      .withLife("p1", [instance("old-life", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-119" });
    expect(effectOptions(game.state)).toEqual(["urouge", "done"]);
    game.play({ type: "resolve-effect", optionId: "urouge" });
    answer(game);

    const life = game.state.players.p1.life;
    // Index 0 is the top of the Life area.
    expect(ids(life)).toEqual(["urouge", "old-life"]);
    expect(life[0]?.faceUp).not.toBe(true);
    // Seven rested to pay for Law, one of them now given to the Leader.
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(6);
  });

  it("gives no DON!! to a Leader without {Supernovas}, and may bank nothing", () => {
    const game = table("op10-119-gate")
      .withLeader("p1", "OP10-001")
      .withHand("p1", [
        instance("law", "OP10-119"),
        instance("urouge", "OP10-101"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-119" });
    game.play({ type: "resolve-effect", optionId: "done" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["urouge"]);
    expect(game.state.players.p1.life).toEqual([]);
    expect(game.state.players.p1.leaderAttachedDon).toEqual([]);
  });
});
