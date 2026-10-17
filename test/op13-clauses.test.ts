import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP-13 cards that are registered but that no other file drives: one
 * `describe` per card, one case per printed clause. Run
 * `pnpm card:text <card>` for the wording each case checks against.
 */

const DECKS = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
] as const;

/** p1's main phase on an empty table with all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2's main phase, for the clauses p1 answers on the opponent's turn. */
const defending = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

function effectOptions(state: GameState): string[] {
  const actor = state.pendingEffect?.playerId ?? state.activePlayer;
  return getLegalActions(state, actor)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function resolveAll(game: {
  state: GameState;
  play: (matcher: { type: "resolve-effect"; optionId?: string }) => unknown;
}): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

/** Declares an attack on p1's Leader and passes p1's Blocker step. */
function attackLeader(
  game: ReturnType<ReturnType<typeof defending>["build"]>,
  attacker: string,
): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: "p1-leader",
  });
  if (game.state.phase === "block") game.pass();
}

/** Plays out whatever is left of the current battle with no answers. */
function finishBattle(
  game: ReturnType<ReturnType<typeof defending>["build"]>,
): void {
  let guard = 0;
  while (game.state.activeAttack || game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("battle never settled");
    if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    else game.pass();
  }
}

/** A [Blocker] check shared by the four Blockers below. */
function blocks(cardNumber: string): void {
  const game = defending(`${cardNumber}-blocker`)
    .withBoard("p1", [character("blocker", cardNumber)])
    .withBoard("p2", [character("attacker", "OP11-003")])
    .build();

  expect(hasKeyword(game.state, "p1", "blocker", "Blocker")).toBe(true);
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  game.play({ type: "block", blockerInstanceId: "blocker" });

  expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
  expect(game.state.players.p1.board[0]?.rested).toBe(true);
}

describe("OP13-024 Gordon", () => {
  covers("OP13-024", "[On Play]");

  it("reveals a {FILM} card to set 2 DON!! active at the end of the turn", () => {
    const game = table("op13-024")
      .withDon("p1", { rested: 4 })
      .withHand("p1", [
        instance("gordon", "OP13-024"),
        instance("film", "OP06-008"), // {FILM}
        instance("other", "OP05-012"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-024" });
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game.state)).toEqual(["film"]);
    game.play({ type: "resolve-effect", optionId: "film" });
    expect(
      game.events.some(
        (event) =>
          event.type === "card-revealed" && event.cardNumber === "OP06-008",
      ),
    ).toBe(true);
    resolveAll(game);

    // A reveal, not a payment: the card stays in hand. And nothing comes
    // back yet -- the DON!! return when the turn ends.
    expect(ids(game.state.players.p1.hand).sort()).toEqual(["film", "other"]);
    expect(game.state.players.p1.restedDon).toHaveLength(5);

    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    expect(game.state.players.p1.restedDon).toHaveLength(3);
  });

  it("asks nothing without a {Music} or {FILM} card in hand", () => {
    const game = table("op13-024-none")
      .withHand("p1", [
        instance("gordon", "OP13-024"),
        instance("other", "OP05-012"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-024" });
    expect(effectOptions(game.state)).not.toContain("other");
    resolveAll(game);
    game.pass();
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe("OP13-039 Gum-Gum Snake Shot", () => {
  covers("OP13-039", "[Counter]", "[Trigger]");

  it("K.O.s the rested cost-4-or-less attacker from the Counter step", () => {
    const game = defending("op13-039-counter")
      .withHand("p1", [instance("snake", "OP13-039")])
      .withBoard("p2", [
        character("attacker", "OP05-012"), // cost 3
        character("big", "OP11-003", { rested: true }), // cost 5
      ])
      .build();

    attackLeader(game, "attacker");
    game.play({ type: "activate-counter-event", eventInstanceId: "snake" });
    // The cost-5 body is rested too, but over the ceiling.
    expect(effectOptions(game.state).sort()).toEqual(["attacker", "done"]);
    game.play({ type: "resolve-effect", optionId: "attacker" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["big"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["attacker"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["snake"]);
  });

  it("activates the same K.O. off a Life Trigger", () => {
    const game = defending("op13-039-trigger")
      .withLife("p1", [instance("snake", "OP13-039")])
      .withBoard("p2", [character("attacker", "OP05-012")])
      .build();

    attackLeader(game, "attacker");
    while (game.state.phase === "counter") game.pass();
    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(effectOptions(game.state).sort()).toEqual(["attacker", "done"]);
    game.play({ type: "resolve-effect", optionId: "attacker" });
    resolveAll(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(ids(game.state.players.p2.trash)).toEqual(["attacker"]);
  });
});

describe("OP13-058 Phoenix Pyreapple", () => {
  covers("OP13-058", "[Main]", "[Counter]");

  it("rests a DON!! to put a 3000-power-or-less Character on the bottom of its owner's deck", () => {
    const game = table("op13-058-main")
      .withHand("p1", [instance("pyreapple", "OP13-058")])
      .withBoard("p2", [
        character("small", "OP08-035"), // 4000
        character("tiny", "OP07-099"), // 2000
      ])
      .withDeckTop("p2", [instance("p2-top", "ST31-003")])
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", summary: "Phoenix Pyreapple" });
    // One DON!! for the cost and one rested by the clause.
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 2);
    // The 4000-power body is over the line.
    expect(effectOptions(game.state).sort()).toEqual(["done", "tiny"]);
    game.play({ type: "resolve-effect", optionId: "tiny" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["small"]);
    expect(ids(game.state.players.p2.deck)).toEqual(["p2-top", "tiny"]);
  });

  it("gives the Leader +3000 for the battle from the Counter step", () => {
    const game = defending("op13-058-counter")
      .withHand("p1", [instance("pyreapple", "OP13-058")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attackLeader(game, "attacker");
    game.play({ type: "activate-counter-event", eventInstanceId: "pyreapple" });
    resolveAll(game);
    // Battle power rides on the battle, not on the Leader's own modifiers.
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(game.state.players.p1.restedDon).toHaveLength(1);

    finishBattle(game);
    // At 0 Life a hit would end the game: 5000 + 3000 held off the 6000
    // attacker, and the boost went with the battle.
    expect(game.state.winner ?? null).toBeNull();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
  });
});

describe("OP13-092 Saint Mjosgard", () => {
  covers("OP13-092", "[On Play]");

  it("plays a cost-1 {Mary Geoise} Stage from the trash at 3 Life or less", () => {
    const game = table("op13-092")
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "ST31-003"),
        instance("life-3", "ST31-003"),
      ])
      .withHand("p1", [instance("mjosgard", "OP13-092")])
      .withTrash("p1", [
        instance("geoise", "OP05-097"), // {Mary Geoise}, cost 1
        instance("throne", "OP13-099"), // {Mary Geoise}, cost 7
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-092" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "geoise"]);
    game.play({ type: "resolve-effect", optionId: "geoise" });
    resolveAll(game);

    expect(game.state.players.p1.stage?.instanceId).toBe("geoise");
    expect(ids(game.state.players.p1.trash)).toEqual(["throne"]);
    expect(ids(game.state.players.p1.board)).toEqual(["mjosgard"]);
  });

  it("does nothing at 4 Life", () => {
    const game = table("op13-092-four")
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "ST31-003"),
        instance("life-3", "ST31-003"),
        instance("life-4", "ST31-003"),
      ])
      .withHand("p1", [instance("mjosgard", "OP13-092")])
      .withTrash("p1", [instance("geoise", "OP05-097")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-092" });
    expect(effectOptions(game.state)).not.toContain("geoise");
    resolveAll(game);

    expect(game.state.players.p1.stage).toBeNull();
    expect(ids(game.state.players.p1.trash)).toEqual(["geoise"]);
  });
});

describe("OP13-093 Morgans", () => {
  covers("OP13-093", "[Blocker]", "[On Play]");

  it("blocks a declared attack", () => {
    blocks("OP13-093");
  });

  it("draws 2 and then trashes 2", () => {
    const game = table("op13-093")
      .withHand("p1", [
        instance("morgans", "OP13-093"),
        instance("kept", "ST31-003"),
      ])
      .withDeckTop("p1", [
        instance("draw-1", "OP05-083"),
        instance("draw-2", "OP05-012"),
        instance("left", "OP05-035"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-093" });
    expect(effectOptions(game.state).sort()).toEqual([
      "draw-1",
      "draw-2",
      "kept",
    ]);
    game.play({ type: "resolve-effect", optionId: "kept" });
    game.play({ type: "resolve-effect", optionId: "draw-1" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["draw-2"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["draw-1", "kept"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["left"]);
  });
});

describe("OP13-104 Kouzuki Hiyori", () => {
  covers("OP13-104", "[Blocker]", "[On K.O.]");

  it("blocks a declared attack", () => {
    blocks("OP13-104");
  });

  const koHiyori = (seed: string, leader: string) => {
    const game = defending(seed)
      .withLeader("p1", leader)
      .withBoard("p1", [character("hiyori", "OP13-104", { rested: true })])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .withDeckTop("p1", [instance("top", "OP05-012")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "hiyori",
    });
    while (!game.state.pendingEffect && game.state.activeAttack) game.pass();
    return game;
  };

  it("trashes a hand card to add the deck's top card to Life behind a multicolored Leader", () => {
    const game = koHiyori("op13-104-multi", "OP06-022"); // Green/Yellow
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fuel" });
    resolveAll(game);
    finishBattle(game);

    expect(ids(game.state.players.p1.trash).sort()).toEqual(["fuel", "hiyori"]);
    expect(ids(game.state.players.p1.life)).toEqual(["top", "life-1"]);
  });

  it("pays the cost for nothing behind a single-colour Leader", () => {
    const game = koHiyori("op13-104-mono", "OP12-020"); // Green
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fuel" });
    resolveAll(game);
    finishBattle(game);

    expect(ids(game.state.players.p1.trash).sort()).toEqual(["fuel", "hiyori"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-1"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["top"]);
  });
});

describe("OP13-110 Stussy", () => {
  covers("OP13-110", "[Blocker]", "[On Play]");

  it("blocks a declared attack", () => {
    blocks("OP13-110");
  });

  it("plays a cost-5-or-less Character with a [Trigger] from hand behind an {Egghead} Leader", () => {
    const game = table("op13-110")
      .withLeader("p1", "EB04-001") // {Egghead}
      .withHand("p1", [
        instance("stussy", "OP13-110"),
        instance("franky", "OP07-107"), // cost 4, [Trigger]
        instance("sabo", "OP09-104"), // cost 7, [Trigger]
        instance("plain", "OP05-012"), // cost 3, no [Trigger]
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-110" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "franky"]);
    game.play({ type: "resolve-effect", optionId: "franky" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["stussy", "franky"]);
    // A free play: only Stussy's own 7 was paid.
    expect(game.state.players.p1.activeDon).toHaveLength(3);
  });

  it("plays nothing behind a Leader without the type", () => {
    const game = table("op13-110-leader")
      .withLeader("p1", "OP12-020")
      .withHand("p1", [
        instance("stussy", "OP13-110"),
        instance("franky", "OP07-107"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-110" });
    expect(effectOptions(game.state)).not.toContain("franky");
    resolveAll(game);
    expect(ids(game.state.players.p1.board)).toEqual(["stussy"]);
  });
});

describe("OP13-117 Gum-Gum Dawn Stamp", () => {
  covers("OP13-117", "[Main]", "[Trigger]");

  it("turns the top Life card face-up to K.O. a base-cost-6-or-less Character", () => {
    const game = table("op13-117-main")
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "ST31-003"),
      ])
      .withHand("p1", [instance("stamp", "OP13-117")])
      .withBoard("p2", [
        character("six", "OP11-068"), // base cost 6
        character("seven", "OP09-067"), // base cost 7
      ])
      .build();

    game.play({ type: "activate-main", summary: "Gum-Gum Dawn Stamp" });
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Only the top card is the cost.
    expect(effectOptions(game.state)).toEqual(["life-1"]);
    game.play({ type: "resolve-effect", optionId: "life-1" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "six"]);
    game.play({ type: "resolve-effect", optionId: "six" });
    resolveAll(game);

    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(game.state.players.p1.life[1]?.faceUp).toBeFalsy();
    expect(ids(game.state.players.p2.board)).toEqual(["seven"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["six"]);
  });

  it("K.O.s nothing when the cost is declined", () => {
    const game = table("op13-117-skip")
      .withLife("p1", [instance("life-1", "ST31-003")])
      .withHand("p1", [instance("stamp", "OP13-117")])
      .withBoard("p2", [character("six", "OP11-068")])
      .build();

    game.play({ type: "activate-main", summary: "Gum-Gum Dawn Stamp" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    resolveAll(game);

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    expect(ids(game.state.players.p2.board)).toEqual(["six"]);
  });

  it("draws 1 off its Life Trigger", () => {
    const game = defending("op13-117-trigger")
      .withLife("p1", [instance("stamp", "OP13-117")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attackLeader(game, "attacker");
    while (game.state.phase === "counter") game.pass();
    game.play({ type: "resolve-trigger", optionId: "activate" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["stamp"]);
  });
});
