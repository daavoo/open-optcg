import { describe, expect, it } from "vitest";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The (Yellow) Vegapunk Store Battle list, played through its own fifty.
 *
 * Every other clause in the list was covered by its set's tests already. What
 * this file adds is OP10-112 Kid, the one card the list takes from outside the
 * {Egghead} core, and the line the deck is built around: the Leader banks an
 * {Egghead} body face-up on Life, and the hit that turns it over plays it.
 */
const DECK = "(Yellow) Vegapunk - 1st Place Store Battle 2026-06-19";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP07-097");

type Game = ReturnType<ReturnType<typeof table>["build"]>;

/** The `resolve-effect` option ids open right now. */
const offered = (game: Game) =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId?: string }).optionId);

/** Answer every open prompt with the first of `preferred` offered, else the first offer. */
function answer(game: Game, ...preferred: string[]): void {
  while (game.state.pendingEffect) {
    const options = offered(game);
    const wanted = preferred.find((id) => options.includes(id)) ?? options[0]!;
    game.play({ type: "resolve-effect", optionId: wanted });
  }
}

/** Decline the block and Counter steps, so a declared attack resolves. */
const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const theirLife = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`their-life-${index}`, "ST32-004"),
  );

describe('OP10-112 Eustass"Captain"Kid', () => {
  covers("OP10-112", "[On Play]", "[End of Your Turn]");

  it("rests itself to trash the top of the opponent's Life", () => {
    const game = table("op10-112-play")
      .withHand("p1", [instance("kid", "OP10-112")])
      .withLife("p2", theirLife(3))
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-112" });
    expect(offered(game)).toEqual(expect.arrayContaining(["apply", "skip"]));
    game.play({ type: "resolve-effect", optionId: "apply" });
    answer(game);

    const kid = game.state.players.p1.board.find(
      (card) => card.instanceId === "kid",
    );
    expect(kid?.rested).toBe(true);
    expect(ids(game.state.players.p2.life)).toEqual([
      "their-life-1",
      "their-life-2",
    ]);
    expect(ids(game.state.players.p2.trash)).toEqual(["their-life-0"]);
    expect(game.state.players.p2.hand).toHaveLength(0);
  });

  it("stays active and leaves the Life alone when declined", () => {
    const game = table("op10-112-skip")
      .withHand("p1", [instance("kid", "OP10-112")])
      .withLife("p2", theirLife(3))
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-112" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    const kid = game.state.players.p1.board.find(
      (card) => card.instanceId === "kid",
    );
    expect(kid?.rested).toBe(false);
    expect(game.state.players.p2.life).toHaveLength(3);
    expect(game.state.players.p2.trash).toHaveLength(0);
  });

  it("draws 1 and trashes 1 at the end of the turn while the opponent is at 2 Life", () => {
    const game = table("op10-112-end")
      .withBoard("p1", [character("kid", "OP10-112")])
      .withHand("p1", [instance("held", "OP07-101")])
      .withDeckTop("p1", [instance("drawn", "OP07-111")])
      .withLife("p2", theirLife(2))
      .build();

    game.pass();
    expect(offered(game)).toEqual(expect.arrayContaining(["held", "drawn"]));
    game.play({ type: "resolve-effect", optionId: "held" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["held"]);
    expect(game.state.activePlayer).toBe("p2");
  });

  it("does nothing at the end of the turn while the opponent holds 3 Life", () => {
    const game = table("op10-112-end-short")
      .withBoard("p1", [character("kid", "OP10-112")])
      .withHand("p1", [instance("held", "OP07-101")])
      .withDeckTop("p1", [instance("drawn", "OP07-111")])
      .withLife("p2", theirLife(3))
      .build();

    game.pass();
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["held"]);
    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toContain("drawn");
  });
});

describe("OP07-097 Vegapunk: Life is a second hand", () => {
  it("banks Shaka face-up on Life, and the hit that turns it over plays it", () => {
    const game = table("op07-097-bank")
      .withHand("p1", [instance("shaka", "OP07-101")])
      // p2 draws to start its turn, and bareTable() left its deck empty.
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP07-097" });
    game.play({ type: "resolve-effect", optionId: "shaka" });
    game.play({ type: "resolve-effect", optionId: "life" });
    answer(game);

    expect(game.state.players.p1.life[0]?.instanceId).toBe("shaka");
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    // The Leader rests DON!!, not itself: it cannot attack anyway.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p1-leader",
        ),
    ).toBe(false);

    game.pass();
    answer(game);
    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toContain("shaka");
    expect(ids(game.state.players.p1.hand)).not.toContain("shaka");
  });
});

describe("OP07-097 Vegapunk: an {Egghead} Event", () => {
  it("is never played as a Character, and can still be banked on Life", () => {
    const play = table("op07-097-event-play")
      .withHand("p1", [instance("helllp", "OP07-115")])
      .build();

    play.play({ type: "activate-main", summary: "OP07-097" });
    play.play({ type: "resolve-effect", optionId: "helllp" });
    play.play({ type: "resolve-effect", optionId: "play" });
    answer(play);

    expect(ids(play.state.players.p1.board)).not.toContain("helllp");
    expect(ids(play.state.players.p1.hand)).toContain("helllp");

    const bank = table("op07-097-event-life")
      .withHand("p1", [instance("helllp", "OP07-115")])
      .build();

    bank.play({ type: "activate-main", summary: "OP07-097" });
    bank.play({ type: "resolve-effect", optionId: "helllp" });
    bank.play({ type: "resolve-effect", optionId: "life" });
    answer(bank);

    expect(bank.state.players.p1.life[0]?.instanceId).toBe("helllp");
    expect(bank.state.players.p1.life[0]?.faceUp).toBe(true);
  });
});
