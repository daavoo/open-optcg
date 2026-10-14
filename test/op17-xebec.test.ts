import { describe, expect, it } from "vitest";
import { hasCardType, requireKnownCard } from "@one-piece-sim/cards";
import {
  loadDeck,
  requireSupportedDeck,
  resolveDeck,
} from "@one-piece-sim/decks";
import {
  applyAction,
  createGame,
  getLegalActions,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, instance, scenario } from "./support/index.js";

/**
 * OP-17 Blue Rocks D. Xebec: the draw-engine list in
 * `packages/decks/src/op17-xebec-manifest.ts`.
 *
 * The Leader's reveal, OP17-118's tribal deploy and the rest of the Rocks
 * package are covered card-by-card in `test/op17.test.ts`. What is deck-scoped
 * and only true here is the composition the Leader's hit rate depends on, and
 * the identity Bandai's own list left out for looking tribal without being it.
 */

const DECK = "(Blue) Rocks.D.Xebec - Official Feature Deck";

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

describe("OP-17 Blue Rocks D. Xebec deck list", () => {
  it("loads the 50-card official feature list", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP17-039");
    expect(loadDeck(DECK)).toHaveLength(50);
  });

  it("puts all 50 of its slots on {Rocks Pirates}, which is the Leader's hit rate", () => {
    // OP17-039 draws 2 only when the revealed card's type includes "Rocks
    // Pirates", so the tribal count is not flavour -- it is the probability the
    // Leader's [When Attacking] pays off at all. Bandai's list takes that to
    // its limit: every card under the Leader is on the tribe, so the reveal
    // never misses and the trash-1 is a flat draw-2.
    const manifest = requireSupportedDeck(DECK);
    const tribal = Object.entries(manifest.cards)
      .filter(([cardNumber]) => hasCardType(cardNumber, "Rocks Pirates"))
      .reduce((total, [, quantity]) => total + quantity, 0);
    expect(tribal).toBe(50);
  });

  it("leaves every Character in the list without a printed Counter, which is the deck's real cost", () => {
    // The archetype's stated tension: a large hand is not a safe board. OP17-118
    // prints its own workaround ("[printed text omitted -- pnpm card:text OP17-118]"), which only makes sense
    // because this is true -- and in this list the condition is unconditional,
    // since there is no Character in it that prints a Counter at all.
    const manifest = requireSupportedDeck(DECK);
    const characters = Object.keys(manifest.cards).filter(
      (cardNumber) => requireKnownCard(cardNumber).category === "character",
    );
    expect(characters.length).toBeGreaterThan(0);
    expect(
      characters.filter(
        (cardNumber) => requireKnownCard(cardNumber).counter !== null,
      ),
    ).toEqual([]);
  });
});

describe("OP08-051 Buckin", () => {
  it("is not a {Rocks Pirates} card, despite reading like one", () => {
    // Why Bandai's own list does not run it, and why the pre-release guide list
    // that did was spending three slots on nothing: "Former Rocks Pirates" is
    // its own printed type and `hasCardType` compares whole strings, so Buckin
    // never answers to the Leader's reveal, to OP17-118's tribal deploy, or to
    // any {Rocks Pirates} buff. The card stays in the registry -- it is a real
    // OP-08 Blue identity -- so its clause stays under test here.
    expect(requireKnownCard("OP08-051").types).toEqual([
      "Former Rocks Pirates",
    ]);
    expect(hasCardType("OP08-051", "Rocks Pirates")).toBe(false);
    expect(hasCardType("OP08-051", "Former Rocks Pirates")).toBe(true);
  });

  it("OP08-051:boundary resolves its On Play to nothing with no [Edward Weevil] on the board", () => {
    // The only resolution this clause ever reaches from a Blue Rocks seat: no
    // shipped deck runs an [Edward Weevil], and no such identity is in the card
    // registry at all, so the positive branch is unreachable from this pool
    // rather than untested. What matters is that an "up to 1" over an empty
    // candidate set resolves immediately instead of stalling the turn on a
    // choice with no options.
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op08-051-boundary")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("buckin", "OP08-051")])
      .withBoard("p1", [character("stussy", "OP17-054")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-051" });

    expect(effectOptions(game.state)).toEqual([]);
    expect(game.state.pendingEffect).toBeNull();
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP08-051", "OP17-054"]);
  });
});

describe("the deck plays a full game against the format", () => {
  it("full-game-smoke reaches a result against ST31 without an illegal state", () => {
    let state = createGame({
      gameId: "op17-xebec-smoke",
      p1: resolveDeck(DECK),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "op17-xebec-smoke",
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
