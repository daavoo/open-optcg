import { describe, expect, it } from "vitest";
import { assertGameStateInvariants } from "@one-piece-sim/engine-core";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * The support layer is scaffolding for every other test, so it gets its own
 * tests: a builder that silently produced an unreachable position would weaken
 * every scenario written on top of it.
 */
describe("test/support scenario builder", () => {
  it("starts in mulligan and keeps both hands through legal actions", () => {
    const raw = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("support")
      .build();
    expect(raw.state.phase).toBe("mulligan");

    const kept = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("support")
      .keepBothHands()
      .build();
    expect(kept.state.phase).toBe("main");
    expect(kept.state.turn).toBe(1);
    expect(kept.state.players.p1.life.length).toBeGreaterThan(0);
  });

  it("reaches a later turn by passing, so DON!! matches real play", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("support-turn")
      .atTurn(3, { active: "p1" })
      .build();

    expect(game.state.turn).toBe(3);
    expect(game.state.activePlayer).toBe("p1");
    const p1 = game.state.players.p1;
    expect(p1.activeDon.length + p1.restedDon.length).toBe(3);
    assertGameStateInvariants(game.state);
  });

  it("keeps the ten-DON!! total when a scenario places DON!! on the field", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("support-don")
      .keepBothHands()
      .withDon("p1", { active: 3, leaderAttached: 1 })
      .build();

    const p1 = game.state.players.p1;
    expect(p1.leaderAttachedDon).toHaveLength(1);
    expect(
      p1.donDeck.length +
        p1.activeDon.length +
        p1.restedDon.length +
        p1.leaderAttachedDon.length,
    ).toBe(10);
  });

  it("rejects a position the engine could never produce", () => {
    expect(() =>
      scenario()
        .decks(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Green) Roronoa Zoro - Starter Deck 32",
        )
        .seed("support-invalid")
        .keepBothHands()
        // Six Characters: the board holds five.
        .withBoard(
          "p1",
          copies(6, "ST31-004").map((card) =>
            character(card.instanceId, card.cardNumber),
          ),
        )
        .build(),
    ).toThrow(/board exceeds five cards/);
  });

  it("matches play-card by printed card number", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("support-play")
      .atTurn(3, { active: "p1" })
      .withHand("p1", [instance("target", "ST31-003")])
      .build();

    const action = game.action({ type: "play-card", cardNumber: "ST31-003" });
    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "target",
    });
    game.submit(action);
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("ST31-003");
  });

  it("names the offered actions when nothing matches", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("support-miss")
      .keepBothHands()
      .build();

    expect(() => game.action({ type: "attack" })).toThrow(/was offered:/);
  });
});
