import { describe, expect, it } from "vitest";
import { requireKnownCard } from "@one-piece-sim/cards";
import {
  loadDeck,
  requireSupportedDeck,
  resolveDeck,
} from "@one-piece-sim/decks";
import {
  applyAction,
  createGame,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { covers, character, instance, scenario } from "./support/index.js";

/**
 * OP-17 Green Shanks: the rest-lock control list in
 * `packages/decks/src/op17-shanks-manifest.ts`.
 *
 * Per-card test names read `<card>:positive` and `<card>:boundary` so the
 * report says which case failed. The cards tested here are the archetype's
 * spine plus both off-set identities; the rest of the list is covered by
 * `test/op17.test.ts` and by the deck-level smoke at the bottom of this file.
 * What holds every clause of every one of them is `pnpm coverage:clauses
 * --check`, not the naming.
 */

const DECK = "(Green) Shanks - Official Feature Deck";

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

describe("OP-17 Green Shanks deck list", () => {
  it("loads the 50-card guide list", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP17-020");
    expect(loadDeck(DECK)).toHaveLength(50);
  });

  it("runs 44 of its 50 slots on {Red-Haired Pirates} identities", () => {
    // The Leader's freeze is free of the tribe, but every search in the list
    // ("reveal up to 1 card with a type including Red-Haired Pirates") reads it,
    // so the count is the deck's hit rate rather than a theme.
    const manifest = requireSupportedDeck(DECK);
    const tribal = Object.entries(manifest.cards)
      .filter(([cardNumber]) =>
        requireKnownCard(cardNumber).types.some((type) =>
          type.startsWith("Red-Haired Pirates"),
        ),
      )
      .reduce((total, [, quantity]) => total + quantity, 0);
    expect(tribal).toBe(44);
  });
});

describe("ST16-004 Shanks On Play", () => {
  covers("ST16-004", "[On Play]");
  it("ST16-004:positive K.O.s up to 1 of the opponent's rested Characters", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("st16-004-positive")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("shanks", "ST16-004")])
      .withBoard("p2", [
        character("napping", "ST31-002", { rested: true }),
        character("awake", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST16-004" });
    // Only the rested body is offered; "done" is the printed "up to".
    expect(effectOptions(game.state)).toEqual(["napping", "done"]);
    game.play({ type: "resolve-effect", optionId: "napping" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "awake",
    ]);
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("napping");
  });

  it("ST16-004:boundary offers nothing but done when every opposing Character is active", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("st16-004-boundary")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("shanks", "ST16-004")])
      .withBoard("p2", [character("awake", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST16-004" });

    // No eligible target, so the "up to 1" resolves to nothing on the spot: the
    // engine offers no choice at all rather than a lone "done" the player would
    // have to click through.
    expect(effectOptions(game.state)).toEqual([]);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toHaveLength(1);
    expect(game.state.players.p2.trash).toHaveLength(0);
  });
});

describe("OP13-031 Trafalgar Law", () => {
  covers("OP13-031", "[On Play]", "static");
  it("OP13-031:positive pays the bounce and rested-plays a cost-5-or-less Character", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op13-031-positive")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("law", "OP13-031"),
        instance("roux", "OP17-033"), // cost 4, so a legal payoff
      ])
      .withBoard("p1", [character("spent", "OP17-032")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-031" });
    // The optional cost first: taking it is what unlocks the play.
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "spent" });
    game.play({ type: "resolve-effect", optionId: "roux" });

    const board = game.state.players.p1.board;
    expect(board.map((card) => card.cardNumber).sort()).toEqual([
      "OP13-031",
      "OP17-033",
    ]);
    // Played rested, and the paid Character is back in hand rather than trashed.
    expect(board.find((card) => card.instanceId === "roux")?.rested).toBe(true);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "spent",
    );
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("OP13-031:boundary skips the play entirely when the bounce is declined", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op13-031-boundary")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("law", "OP13-031"),
        instance("roux", "OP17-033"),
      ])
      .withBoard("p1", [character("spent", "OP17-032")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-031" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    // Declining the cost is declining the whole clause: no bounce, no play.
    expect(
      game.state.players.p1.board.map((card) => card.instanceId).sort(),
    ).toEqual(["law", "spent"]);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "roux",
    ]);
  });

  it("gains [Blocker] only at 1 or less Life", () => {
    const atOne = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op13-031-blocker-on")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("law", "OP13-031")])
      .withLife("p1", [instance("last", "OP17-032")])
      .build();
    expect(hasKeyword(atOne.state, "p1", "law", "Blocker")).toBe(true);

    const atTwo = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op13-031-blocker-off")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("law", "OP13-031")])
      .withLife("p1", [
        instance("one", "OP17-032"),
        instance("two", "OP17-032"),
      ])
      .build();
    expect(hasKeyword(atTwo.state, "p1", "law", "Blocker")).toBe(false);
  });
});

describe("the deck plays a full game against the format", () => {
  it("full-game-smoke reaches a result against ST31 without an illegal state", () => {
    let state = createGame({
      gameId: "op17-shanks-smoke",
      p1: resolveDeck(DECK),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "op17-shanks-smoke",
    });
    for (let step = 0; step < 4_000 && state.phase !== "finished"; step += 1) {
      const legal = getLegalActions(state, state.activePlayer);
      expect(legal.length, `no legal action in ${state.phase}`).toBeGreaterThan(
        0,
      );
      state = applyAction(state, {
        ...legal[0]!,
        revision: state.revision,
      }).state;
    }
    expect(state.phase).toBe("finished");
  });
});
