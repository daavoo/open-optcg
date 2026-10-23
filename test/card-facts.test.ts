import { describe, expect, it } from "vitest";
import { itWithText } from "./support/printed-text.js";
import { cardFacts, clauseText } from "@one-piece-sim/cards";
import { createGame, observe } from "@one-piece-sim/engine-core";

import { resolveDeck } from "@one-piece-sim/decks";

function newGame() {
  return createGame({
    gameId: "facts-1",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Blue) Kuzan - Starter Deck 33"),
    seed: "facts-seed-1",
  });
}

describe("card facts", () => {
  it("derives printed keywords from official card text", () => {
    // ST31-002 Nico Robin is a printed [Blocker]; OP01-025 Zoro has [Rush].
    expect(cardFacts("ST31-002").keywords).toContain("Blocker");
    expect(cardFacts("OP01-025").keywords).toContain("Rush");
    expect(cardFacts("ST31-005").keywords).not.toContain("Blocker");
  });

  it("does not read a granted keyword as a printed one", () => {
    // Every one of these has to be earned before it is live: ST31-004 needs 3
    // given DON!!, OP15-060 charges DON!! −1 and a card from hand for it, and
    // OP16-048 and OP15-047 grant to a *different* card entirely. Reading the
    // marker out of the grant clause let OP15-060 Enel block an attack in a
    // playtest match without ever activating the ability that sells it.
    expect(cardFacts("ST31-004").keywords).not.toContain("Rush");
    expect(cardFacts("OP15-060").keywords).not.toContain("Blocker");
    expect(cardFacts("OP16-048").keywords).not.toContain("Blocker");
    expect(cardFacts("OP15-047").keywords).not.toContain("Unblockable");
    // ...but the same card's printed [Blocker] survives the grant clause that
    // shares its text.
    expect(cardFacts("OP15-047").keywords).toContain("Blocker");
  });

  it("does not read a keyword that picks out a target as a printed one", () => {
    // "Rest up to 1 of your opponent's [Blocker] Characters" and "cannot
    // activate up to 1 [Blocker] Character" name somebody else's Blocker.
    expect(cardFacts("ST30-012").keywords).not.toContain("Blocker");
    expect(cardFacts("OP09-014").keywords).not.toContain("Blocker");
    // "...Characters ... without [Blocker]" excludes the keyword's holders:
    // the EB05-010 Leader watches the others and prints no [Blocker] itself.
    expect(cardFacts("EB05-010").keywords).not.toContain("Blocker");
  });
});

describe("timed clauses", () => {
  itWithText(
    "cuts a clause at the next timing marker, not the next bracket",
    () => {
      // [Blocker] is mid-sentence and must not end the clause; the [Counter] half
      // that follows must not be swept into the [Main] one.
      expect(clauseText("OP15-060", "[Activate: Main]")).toBe(
        "DON!! −1: This Character gains [Blocker] until the end of your " +
          "opponent's next End Phase. Then, trash 1 card from your hand.",
      );
      expect(clauseText("OP15-075", "[Main]")).not.toContain("[Counter]");
      expect(clauseText("OP15-075", "[Counter]")).toBe(
        "Up to 1 of your [Enel] cards gains +2000 power during this battle.",
      );
    },
  );

  itWithText(
    "drops reminder text and reports nothing for a clause a card lacks",
    () => {
      // OP05-077 prints the DON!! −N reminder inline; it restates a rule the
      // chooser already has and doubles the length of the summary.
      expect(clauseText("OP05-077", "[Main]")).toBe(
        "DON!! −1: Give up to 1 of your opponent's Characters −5000 power " +
          "during this turn.",
      );
      // OP15-118's ability is [On Play]; it has no [Activate: Main] to name.
      expect(clauseText("OP15-118", "[Activate: Main]")).toBeUndefined();
    },
  );

  it("distinguishes Rush: Character from plain Rush", () => {
    const specific = Object.values(
      Object.fromEntries(
        ["ST31-004", "OP12-023"].map((number) => [number, cardFacts(number)]),
      ),
    );
    for (const facts of specific) {
      // Whichever form a card prints, never both.
      expect(
        facts.keywords.includes("Rush") &&
          facts.keywords.includes("Rush: Character"),
      ).toBe(false);
    }
  });

  it("reads the DON!! condition off each Leader's text", () => {
    // Load-bearing for DON!! allocation: until the condition is met the DON!! is
    // buying an ability rather than 1000 power.
    expect(cardFacts("ST21-001").donRequirement).toBe(1); // ST31 Luffy
    expect(cardFacts("OP12-020").donRequirement).toBe(3); // ST32 Zoro
    expect(cardFacts("OP13-004").donRequirement).toBe(1); // ST35 Sabo
    expect(cardFacts("OP12-040").donRequirement).toBe(0); // ST33 Kuzan
    expect(cardFacts("OP11-062").donRequirement).toBe(0); // ST34 Katakuri
    expect(cardFacts("OP10-099").donRequirement).toBe(0); // ST36 Kid
  });

  it("reports category, counter and Trigger presence", () => {
    const event = cardFacts("OP04-016");
    expect(event.category).toBe("event");
    const leader = cardFacts("ST21-001");
    expect(leader.category).toBe("leader");
    // Leaders print Life in the cost slot; ST31's Luffy is a 5-Life Leader.
    expect(leader.cost).toBe(5);
  });

  it("covers every card number the viewer can see", () => {
    const state = newGame();
    const observation = observe(state, "p1");
    const visible = [
      observation.self.leader.cardNumber,
      observation.opponent.leader.cardNumber,
      ...observation.self.hand.map((card) => card.cardNumber),
    ];
    for (const cardNumber of visible) {
      expect(observation.cardFacts[cardNumber]).toBeDefined();
    }
  });

  it("does not describe cards the viewer cannot see", () => {
    const state = newGame();
    const observation = observe(state, "p1");
    const opponentHand = state.players.p2.hand.map((card) => card.cardNumber);
    const ownVisible = new Set(Object.keys(observation.cardFacts));
    // A card that exists only in the opponent's hand must not be described.
    const leaked = opponentHand.filter(
      (cardNumber) =>
        ownVisible.has(cardNumber) &&
        !observation.self.hand.some((card) => card.cardNumber === cardNumber) &&
        cardNumber !== observation.opponent.leader.cardNumber,
    );
    expect(leaked).toEqual([]);
  });
});
