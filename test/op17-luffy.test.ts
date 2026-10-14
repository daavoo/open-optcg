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
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import { character, scenario } from "./support/index.js";

/**
 * OP-17 Black Monkey D. Luffy: the Elbaph giants list in
 * `packages/decks/src/op17-luffy-manifest.ts`.
 *
 * The individual clauses -- the `+12 cost` layers, OP17-079's [Blocker] aura,
 * OP17-083's conditional half-sentence -- are covered in `test/op17.test.ts`.
 * What is deck-scoped is that they compose: one cheap giant is supposed to
 * switch the whole curve on at once, and that is the claim worth testing
 * against this actual 50.
 */

const DECK = "(Black) Monkey.D.Luffy - Official Feature Deck";

describe("OP-17 Black Luffy deck list", () => {
  it("loads the 50-card guide list behind the playtest gate", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP17-079");
    expect(loadDeck(DECK)).toHaveLength(50);
  });

  it("is pure OP17, so every identity comes from the generated set data", () => {
    const manifest = requireSupportedDeck(DECK);
    for (const cardNumber of [
      manifest.leader,
      ...Object.keys(manifest.cards),
    ]) {
      expect(cardNumber.startsWith("OP17-"), cardNumber).toBe(true);
    }
  });

  it("pays for its cost-12 enablers at a printed 1 to 6", () => {
    // The whole point of the shell: nothing in it actually costs 12. The giants
    // reach the threshold through a static layer, so the deck's printed curve and
    // its effective one are different documents.
    const manifest = requireSupportedDeck(DECK);
    for (const cardNumber of ["OP17-089", "OP17-085", "OP17-092", "OP17-119"]) {
      expect(manifest.cards[cardNumber], cardNumber).toBeGreaterThan(0);
      expect(requireKnownCard(cardNumber).cost, cardNumber).toBeLessThanOrEqual(
        6,
      );
    }
  });
});

describe("one giant switches the curve on", () => {
  it("turns a 4-cost Saul into a 16-cost body that buffs the 2-drops and blocks", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-luffy-curve")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("saul", "OP17-089"), // printed cost 4, +12 static
        character("sanji", "OP17-082"), // 2000, +3000 while a 12-cost is out
        character("zoro", "OP17-095"), // 2000, same clause
      ])
      .build();

    const state = game.state;
    const saul = state.players.p1.board[0]!;

    // Printed 4, on the field at 16 -- which is what makes the clause below true.
    expect(requireKnownCard("OP17-089").cost).toBe(4);
    expect(effectiveCost(state, "p1", saul)).toBe(16);

    // Both 2-drops read "[printed text omitted -- pnpm card:text OP17-089]".
    expect(currentPower(state, "p1", "sanji")).toBe(5000);
    expect(currentPower(state, "p1", "zoro")).toBe(5000);

    // And the Leader's aura makes the enabler the wall as well.
    expect(hasKeyword(state, "p1", "saul", "Blocker")).toBe(true);
    // The 2-drops are not at 12, so the aura does not reach them.
    expect(hasKeyword(state, "p1", "sanji", "Blocker")).toBe(false);
  });

  it("leaves the same board flat with no giant on it", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-luffy-flat")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("sanji", "OP17-082"),
        character("zoro", "OP17-095"),
      ])
      .build();

    const state = game.state;
    expect(currentPower(state, "p1", "sanji")).toBe(2000);
    expect(currentPower(state, "p1", "zoro")).toBe(2000);
    expect(hasKeyword(state, "p1", "sanji", "Blocker")).toBe(false);
  });
});

describe("OP17-094 Rodo's conditional cost layer", () => {
  it("OP17-094:positive reaches 13 cost under this deck's {Elbaph} Leader", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op17-094-positive")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("rodo", "OP17-094")])
      .build();

    // Printed 1 plus the layer's 12: over the threshold on its own, which is why
    // a 1-cost body is an enabler in this list.
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(13);
  });

  it("OP17-094:boundary stays at its printed 1 under a Leader without {Elbaph}", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op17-094-boundary")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("rodo", "OP17-094")])
      .build();

    expect(requireKnownCard("ST21-001").types).not.toContain("Elbaph");
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(1);
  });
});

describe("the deck plays a full game against the format", () => {
  it("full-game-smoke reaches a result against ST31 without an illegal state", () => {
    let state = createGame({
      gameId: "op17-luffy-smoke",
      p1: resolveDeck(DECK),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "op17-luffy-smoke",
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
