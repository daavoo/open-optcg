import { describe, expect, it } from "vitest";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * "If you have [Name]" reads every card the player has on the field: Leader,
 * Characters and Stage. A Leader treated as having every card name therefore
 * answers for the named partner on its own (Bandai's OP15-064#1, OP16-025#1,
 * OP16-057#1). Each case pairs the every-name position with a control whose
 * Leader does not carry the name, so the Leader is shown to be what turns the
 * clause on.
 */

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** The sealed-format Leader treated as a card with every name, type and attribute. */
const ALL_NAMES = "SEALED-LUFFY";

/** An empty table on p1's turn, late enough for every DON!! to be out. */
const table = (seed: string, leader: string | null) => {
  const builder = scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();
  return leader ? builder.withLeader("p1", leader) : builder;
};

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Answers each prompt with the first of `preferred` on offer, else the first option. */
function settle(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    const options = effectOptions(game);
    const pick = preferred.find((id) => options.includes(id));
    game.play(
      pick
        ? { type: "resolve-effect", optionId: pick }
        : { type: "resolve-effect" },
    );
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const onBoard = (game: Game, player: "p1" | "p2", id: string): boolean =>
  game.state.players[player].board.some((card) => card.instanceId === id);

describe("OP05-103 Kotori with an every-name Leader", () => {
  // ST32-004 costs 4, so four opponent Life cards put it in reach.
  const kotori = (seed: string, leader: string | null) => {
    const game = table(seed, leader)
      .withHand("p1", [instance("kotori", "OP05-103")])
      .withBoard("p2", [character("target", "ST32-004")])
      .withLife("p2", copies(4, "FIX-001", "life"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-103" });
    return game;
  };

  it("K.O.s with no [Hotori] Character: the Leader carries the name", () => {
    const game = kotori("have-named-kotori", ALL_NAMES);
    expect(effectOptions(game)).toContain("target");
    settle(game, "target");

    expect(onBoard(game, "p2", "target")).toBe(false);
    expect(ids(game.state.players.p2.trash)).toContain("target");
  });

  it("(control) offers no K.O. under a Leader without the name", () => {
    const game = kotori("have-named-kotori-control", null);
    expect(effectOptions(game)).not.toContain("target");
    settle(game);

    expect(onBoard(game, "p2", "target")).toBe(true);
  });
});

describe("OP08-004 Kuromarimo with an every-name Leader", () => {
  // OP05-103 is a 3000-power body, inside the 3000-or-less ceiling.
  const kuromarimo = (seed: string, leader: string | null) => {
    const game = table(seed, leader)
      .withHand("p1", [instance("kuromarimo", "OP08-004")])
      .withBoard("p2", [character("target", "OP05-103")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP08-004" });
    return game;
  };

  it("K.O.s with no [Chess] Character: the Leader carries the name", () => {
    const game = kuromarimo("have-named-kuromarimo", ALL_NAMES);
    expect(effectOptions(game)).toContain("target");
    settle(game, "target");

    expect(onBoard(game, "p2", "target")).toBe(false);
    expect(ids(game.state.players.p2.trash)).toContain("target");
  });

  it("(control) offers no K.O. under a Leader without the name", () => {
    const game = kuromarimo("have-named-kuromarimo-control", null);
    expect(effectOptions(game)).not.toContain("target");
    settle(game);

    expect(onBoard(game, "p2", "target")).toBe(true);
  });
});

describe("OP11-109 Pappag with an every-name Leader", () => {
  const pappag = (seed: string, leader: string | null) => {
    const game = table(seed, leader)
      .withHand("p1", [instance("pappag", "OP11-109")])
      .withDeckTop("p1", copies(2, "FIX-001", "drawn"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP11-109" });
    return game;
  };

  it("draws 2 and trashes 2 with no [Camie] Character: the Leader carries the name", () => {
    const game = pappag("have-named-pappag", ALL_NAMES);
    settle(game, "drawn-1", "drawn-2");

    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "drawn-1",
      "drawn-2",
    ]);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("(control) neither draws nor trashes under a Leader without the name", () => {
    const game = pappag("have-named-pappag-control", null);
    settle(game);

    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck).slice(0, 2)).toEqual([
      "drawn-1",
      "drawn-2",
    ]);
  });
});
