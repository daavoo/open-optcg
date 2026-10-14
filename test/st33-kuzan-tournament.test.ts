import { describe, expect, it } from "vitest";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The 1st-place Blue Kuzan list from Bandai Hiroshima.
 *
 * The cards it shares with the ST-33 precon are driven in `test/st33.test.ts`.
 * What this file holds is that the list is the one the shelf and the policy
 * expect, and the clauses of the OP-12 cards it is the first shipped deck to
 * play: OP12-044 Sakazuki, OP12-051 Hina and OP12-056 Monkey.D.Garp.
 */

const LIST = "(Blue) Kuzan - 1st Place Bandai Hiroshima";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

const table = (seed: string) =>
  scenario()
    .decks(LIST, OPPONENT)
    .seed(seed)
    .atTurn(6, { active: "p1" })
    .bareTable()
    .withDeckTop("p1", [
      instance("top-1", "OP06-050"),
      instance("top-2", "ST33-001"),
      instance("top-3", "OP12-047"),
    ]);

const handNumbers = (cards: readonly { cardNumber: string }[]) =>
  cards.map((card) => card.cardNumber);

describe("the Bandai Hiroshima Kuzan list", () => {
  it("is a legal 50 under the OP12-040 Leader, shelved under Tournaments", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP12-040");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});

describe("OP12-044 Sakazuki", () => {
  covers("OP12-044", "[On Play]");
  it("draws two on entry under the {Navy} Leader", () => {
    const game = table("kuzan-tournament-sakazuki-play")
      .withHand("p1", [instance("sakazuki", "OP12-044")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-044" });

    expect(handNumbers(game.state.players.p1.hand)).toEqual([
      "OP06-050",
      "ST33-001",
    ]);
  });

  covers("OP12-044", "[Activate: Main]");
  it("trashes a card to give a rested DON!!, and the Leader draws it back", () => {
    const game = table("kuzan-tournament-sakazuki-activate")
      .withBoard("p1", [character("sakazuki", "OP12-044")])
      .withHand("p1", [instance("fodder", "OP12-057")])
      .withDon("p1", { active: 0, rested: 2 })
      .build();
    const attached = () =>
      game.state.players.p1.leaderAttachedDon.length +
      game.state.players.p1.board.reduce(
        (sum, card) => sum + (card.attachedDon?.length ?? 0),
        0,
      );
    const attachedBefore = attached();

    game.play({ type: "activate-main", sourceInstanceId: "sakazuki" });
    while (game.legalActions().some((a) => a.type === "resolve-effect")) {
      const effect = game
        .legalActions()
        .find(
          (a) =>
            a.type === "resolve-effect" &&
            a.optionId !== "skip" &&
            a.optionId !== "done",
        );
      game.submit(
        effect ??
          game.action(
            (a) => a.type === "resolve-effect" && a.optionId === "done",
          ),
      );
    }

    const p1 = game.state.players.p1;
    expect(handNumbers(p1.trash)).toContain("OP12-057");
    expect(handNumbers(p1.hand)).toEqual(["OP06-050"]);
    expect(p1.restedDon).toHaveLength(1);
    expect(attached()).toBe(attachedBefore + 1);
  });
});

describe("OP12-051 Hina", () => {
  covers("OP12-051", "[Activate: Main]");
  it("rests and trashes a card to switch off a cost-4-or-less [Blocker]", () => {
    const game = table("kuzan-tournament-hina")
      .withBoard("p1", [character("hina", "OP12-051")])
      .withBoard("p2", [character("blocker", "ST33-001")])
      .withHand("p1", [instance("fodder", "OP12-057")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "hina" });
    while (game.legalActions().some((a) => a.type === "resolve-effect")) {
      const effect = game
        .legalActions()
        .find(
          (a) =>
            a.type === "resolve-effect" &&
            a.optionId !== "skip" &&
            a.optionId !== "done",
        );
      game.submit(
        effect ??
          game.action(
            (a) => a.type === "resolve-effect" && a.optionId === "done",
          ),
      );
    }

    const p1 = game.state.players.p1;
    expect(p1.board.find((card) => card.instanceId === "hina")?.rested).toBe(
      true,
    );
    expect(handNumbers(p1.trash)).toContain("OP12-057");
    expect(
      game.state.players.p2.board[0]?.blockerDisabledUntilTurn,
    ).toBeDefined();
  });
});

describe("OP12-056 Monkey.D.Garp", () => {
  covers("OP12-056", "[On Play]");
  it("trashes a card to play a blue {Navy} 8000 from hand beside it", () => {
    const game = table("kuzan-tournament-garp")
      .withHand("p1", [
        instance("garp", "OP12-056"),
        instance("kuzan", "OP12-043"),
        instance("fodder", "OP12-057"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-056" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play(
      (a) => a.type === "resolve-effect" && a.summary.includes("Ice Block"),
    );
    game.play(
      (a) => a.type === "resolve-effect" && a.summary.includes("Kuzan"),
    );

    const p1 = game.state.players.p1;
    expect(handNumbers(p1.board)).toEqual(["OP12-056", "OP12-043"]);
    expect(handNumbers(p1.trash)).toContain("OP12-057");
  });
});
