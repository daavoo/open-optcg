import { describe, expect, it } from "vitest";
import { getLegalActions } from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP-18's three Blue Events, OP18-057 to OP18-059: each prints a `[Main]`
 * and either a `[Counter]` or a `[Trigger]` that re-runs the `[Main]`.
 *
 * Bodies used for their printed facts alone: OP18-043 Banana Gator (vanilla
 * Baroque Works, cost 4), OP10-089 (vanilla cost 6), and the FIX fixtures,
 * which carry no type the cards read.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase on a bare table, ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 acting, so p1 is the one defending. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function settle(game: Game, ...preferred: string[]) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    const options = effectOptions(game.state);
    const pick = preferred.find((id) => options.includes(id));
    game.play(
      pick
        ? { type: "resolve-effect", optionId: pick }
        : { type: "resolve-effect" },
    );
  }
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardIds = (game: Game, player: "p1" | "p2") =>
  ids(game.state.players[player].board);

const activate = (game: Game, event: string) =>
  game.play({ type: "activate-main", sourceInstanceId: event });

const mainOffered = (game: Game, event: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" && action.sourceInstanceId === event,
    );

/** p1 defending, with p2's attack on `target` open at the Counter step. */
const counterStep = (seed: string, target = "p1-leader") =>
  defending(seed)
    .withBoard("p2", [character("attacker", "FIX-002")])
    .withActiveAttack(
      {
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "attacker",
        targetInstanceId: target,
        attackPower: 6000,
        counterPower: 0,
      },
      "counter",
    );

describe("OP18-057 Atomic Dicer", () => {
  covers("OP18-057", "[Main]", "[Counter]");

  const dicer = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("dicer", "OP18-057")])
      .withBoard("p1", [character("own", "FIX-002")])
      .withBoard("p2", [
        character("gator", "OP18-043"),
        character("six", "OP10-089"),
      ]);

  it("rests three DON!! to return a cost-5-or-less Character of either side", () => {
    const game = dicer("op18-057-main").build();

    activate(game, "dicer");
    const options = effectOptions(game.state);
    expect(options).toEqual(expect.arrayContaining(["gator", "own"]));
    expect(options).not.toContain("six");
    pick(game, "gator");
    settle(game);

    expect(boardIds(game, "p2")).toEqual(["six"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["gator"]);
    // One for the Event, three for the clause.
    expect(game.state.players.p1.activeDon).toHaveLength(6);
  });

  it("is not offered without the three DON!! beyond its cost", () => {
    const game = dicer("op18-057-short").withDonDeck("p1", 7).build();

    expect(mainOffered(game, "dicer")).toBe(false);
  });

  it("gives the Leader +3000 during the battle", () => {
    const game = counterStep("op18-057-counter")
      .withHand("p1", [instance("dicer", "OP18-057")])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "dicer" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });

  it("adds nothing while a Character is the one attacked", () => {
    const game = counterStep("op18-057-counter-character", "own")
      .withBoard("p1", [character("own", "FIX-002", { rested: true })])
      .withHand("p1", [instance("dicer", "OP18-057")])
      .build();

    const offered = game
      .legalActions()
      .some((action) => action.type === "activate-counter-event");
    if (offered) {
      game.play({ type: "activate-counter-event", eventInstanceId: "dicer" });
      settle(game);
    }
    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
  });
});

describe("OP18-058 This Kingdom is Doomed. You Can't Save It!", () => {
  covers("OP18-058", "[Main]", "[Trigger]");

  it("returns one of its own Characters to bury a cost-4-or-less Character", () => {
    const game = table("op18-058-main")
      .withHand("p1", [instance("doomed", "OP18-058")])
      .withBoard("p1", [character("own", "FIX-002")])
      .withBoard("p2", [
        character("gator", "OP18-043"),
        character("six", "OP10-089"),
      ])
      .build();

    activate(game, "doomed");
    pick(game, "apply");
    pick(game, "own");
    const options = effectOptions(game.state);
    expect(options).toContain("gator");
    expect(options).not.toContain("six");
    pick(game, "gator");
    settle(game);

    expect(boardIds(game, "p1")).toEqual([]);
    expect(ids(game.state.players.p1.hand)).toEqual(["own"]);
    expect(boardIds(game, "p2")).toEqual(["six"]);
    expect(ids(game.state.players.p2.deck).at(-1)).toBe("gator");
  });

  it("can decline the cost, burying nothing", () => {
    const game = table("op18-058-decline")
      .withHand("p1", [instance("doomed", "OP18-058")])
      .withBoard("p1", [character("own", "FIX-002")])
      .withBoard("p2", [character("gator", "OP18-043")])
      .build();

    activate(game, "doomed");
    pick(game, "skip");

    expect(boardIds(game, "p1")).toEqual(["own"]);
    expect(boardIds(game, "p2")).toEqual(["gator"]);
  });

  it("is not offered with no Character of its own to return", () => {
    const game = table("op18-058-empty")
      .withHand("p1", [instance("doomed", "OP18-058")])
      .withBoard("p2", [character("gator", "OP18-043")])
      .build();

    expect(mainOffered(game, "doomed")).toBe(false);
  });

  it("runs the [Main] off its [Trigger], cost and all", () => {
    const game = defending("op18-058-trigger")
      .withLife("p1", [instance("doomed", "OP18-058")])
      .withBoard("p1", [character("own", "FIX-002")])
      .withBoard("p2", [
        character("attacker", "OP10-089"),
        character("gator", "OP18-043"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    let guard = 0;
    while (
      (game.state.phase === "block" || game.state.phase === "counter") &&
      game.state.pendingEffect === null
    ) {
      if (guard++ > 10) throw new Error("the defence never ended");
      game.pass();
    }
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    pick(game, "apply");
    pick(game, "own");
    pick(game, "gator");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["own"]);
    expect(ids(game.state.players.p2.deck).at(-1)).toBe("gator");
  });
});

describe("OP18-059 I Pray For Your Success.", () => {
  covers("OP18-059", "[Main]", "[Counter]");

  it("rests a DON!! and trashes a Baroque Works card to draw two", () => {
    const game = table("op18-059-main")
      .withHand("p1", [
        instance("pray", "OP18-059"),
        instance("gator", "OP18-043"),
        instance("captain", "FIX-002"),
      ])
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .build();

    activate(game, "pray");
    expect(effectOptions(game.state)).toEqual(["gator"]);
    pick(game, "gator");
    settle(game);

    const p1 = game.state.players.p1;
    expect(ids(p1.hand)).toEqual(["captain", "deck-1", "deck-2"]);
    expect(ids(p1.trash).sort()).toEqual(["gator", "pray"]);
    expect(p1.activeDon).toHaveLength(9);
  });

  it("is not offered without another Baroque Works card in hand", () => {
    const game = table("op18-059-none")
      .withHand("p1", [
        instance("pray", "OP18-059"),
        instance("captain", "FIX-002"),
      ])
      .build();

    expect(mainOffered(game, "pray")).toBe(false);
  });

  it("trashes a card for +3000 to the card under attack", () => {
    const game = counterStep("op18-059-counter", "own")
      .withBoard("p1", [character("own", "FIX-002", { rested: true })])
      .withHand("p1", [
        instance("pray", "OP18-059"),
        instance("fodder", "FIX-001"),
      ])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "pray" });
    pick(game, "apply");
    pick(game, "fodder");
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["fodder", "pray"]);
  });

  it("adds nothing when the cost is declined", () => {
    const game = counterStep("op18-059-counter-decline")
      .withHand("p1", [
        instance("pray", "OP18-059"),
        instance("fodder", "FIX-001"),
      ])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "pray" });
    pick(game, "skip");
    settle(game);

    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["fodder"]);
  });

  it("is not offered as a Counter with no other card to trash", () => {
    const game = counterStep("op18-059-counter-empty")
      .withHand("p1", [instance("pray", "OP18-059")])
      .build();

    expect(
      game
        .legalActions()
        .some((action) => action.type === "activate-counter-event"),
    ).toBe(false);
  });
});
