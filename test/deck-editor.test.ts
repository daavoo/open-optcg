import { describe, expect, it } from "vitest";
import { deckManifests } from "@one-piece-sim/decks";
import {
  cardsForLeader,
  deckAnalytics,
  deckFromBase,
  exportDeckList,
  parseDeckList,
  validateDeck,
} from "../packages/web/src/deck-editor.js";

describe("deck editor rules", () => {
  it("shows only cards matching the selected Leader's colors", () => {
    const redCards = cardsForLeader("ST21-001");
    expect(redCards.length).toBeGreaterThan(0);
    expect(redCards.every((card) => card.colors?.includes("Red"))).toBe(true);

    const greenBlueCards = cardsForLeader("OP16-022");
    expect(greenBlueCards.some((card) => card.colors?.includes("Green"))).toBe(
      true,
    );
    expect(greenBlueCards.some((card) => card.colors?.includes("Blue"))).toBe(
      true,
    );
    expect(
      greenBlueCards.every((card) =>
        card.colors?.some((color) => color === "Green" || color === "Blue"),
      ),
    ).toBe(true);
  });

  it("round-trips an official deck list", () => {
    const deck = deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31");
    const imported = parseDeckList(exportDeckList(deck));
    expect(imported).toEqual(deck);
    expect(validateDeck(imported)).toEqual({
      cardCount: 50,
      format: "standard",
      errors: [],
    });
  });

  it("rejects a rotated-out printing in Standard and takes it in Extra", () => {
    // OP01-025 Zoro is block 1 on every printing Bandai's cardlist carries, so
    // it left Standard when block 1 did on 1 April 2026. OP04-016 is the
    // control that keeps this from being a test of the card number: block 1 in
    // PRB-02 and block 4 on its ST-31 printing, so it stays legal.
    const deck = deckFromBase("(Red/Black) Sabo - Starter Deck 35");
    deck.cards["ST35-001"] = 1;
    deck.cards["OP01-025"] = 2;
    deck.cards["OP04-016"] = 1;
    expect(validateDeck(deck).cardCount).toBe(50);
    expect(validateDeck(deck).errors).toEqual([
      expect.stringContaining("OP01-025 is not legal in Standard"),
    ]);
    expect(validateDeck({ ...deck, format: "extra" }).errors).toEqual([]);
  });

  it("holds a deck with no declared format to Standard", () => {
    const deck = deckFromBase("(Red/Black) Sabo - Starter Deck 35");
    delete deck.format;
    expect(validateDeck(deck).format).toBe("standard");
  });

  it("rejects off-color cards and excessive copies", () => {
    const deck = deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31");
    deck.cards["ST31-001"] = 5;
    deck.cards["ST32-001"] = 1;
    expect(validateDeck(deck).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ST31-001 allows at most 4"),
        expect.stringContaining("ST32-001 (Green)"),
      ]),
    );
  });

  it("allows mixing either color printed on a multi-color Leader", () => {
    const multiColorDeck = {
      leader: "OP16-022",
      cards: { "ST32-001": 1, "ST33-001": 1 },
    };
    const singleColorDeck = {
      leader: "ST21-001",
      cards: { "ST32-001": 1 },
    };

    expect(
      validateDeck(multiColorDeck).errors.filter((error) =>
        error.includes("does not match"),
      ),
    ).toEqual([]);
    expect(validateDeck(singleColorDeck).errors).toContain(
      "ST32-001 (Green) does not match the Leader's Red colors.",
    );
  });

  it("enforces the current official banned list and banned pairs", () => {
    const deck = deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31");
    deck.cards["OP06-047"] = 1;
    deck.cards["OP07-115"] = 1;
    deck.cards["EB04-058"] = 1;

    expect(validateDeck(deck).errors).toEqual(
      expect.arrayContaining([
        "OP06-047 is currently banned from official decks.",
        "OP07-115 and EB04-058 cannot be included in the same deck.",
      ]),
    );
  });
});

/** A shipped deck the editor can hold, by any id -- `deckFromBase` is typed to
    the six format starters, and the interesting archetypes are not among
    them. */
function editableDeck(deckId: string) {
  const manifest = deckManifests[deckId]!;
  return { leader: manifest.leader, cards: { ...manifest.cards } };
}

describe("deck overview analytics", () => {
  it("counts a shipped deck's curve, types, Counters and abilities", () => {
    const analytics = deckAnalytics(
      deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31"),
    );

    expect(analytics.total).toBe(50);
    expect(analytics.curve.map((bucket) => bucket.count)).toEqual([
      4, 14, 4, 4, 8, 10, 0, 6,
    ]);
    expect(analytics.peak).toBe(14);
    expect(analytics.averageCost).toBeCloseTo(3.16, 2);
    expect(analytics.categories).toEqual({
      character: 40,
      event: 8,
      stage: 2,
    });
    expect(analytics.counters).toEqual({ plus1000: 26, plus2000: 8 });
    // Every card in the pool printing a [Counter] clause is an Event, which is
    // why the panel names them Counter events rather than a third Counter
    // value: these four are OP04-016 Bad Manners Kick Course.
    expect(analytics.counterEvents).toBe(4);
    // The Events count toward the total too. OP04-016 grants 3000, which the
    // corner Counter values know nothing about -- a deck whose defence is
    // written in its Events would otherwise be under-reported.
    expect(analytics.counterPower).toBe(26 * 1000 + 8 * 2000 + 4 * 3000);
    expect(analytics.blockers).toBeGreaterThan(0);
    expect(analytics.triggers).toBeGreaterThan(0);
    expect(analytics.counterEvents).toBeGreaterThan(0);
  });

  it("splits every card into exactly one cost bucket and one category", () => {
    for (const deckId of [
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Red/Black) Sabo - Starter Deck 35",
      "(Yellow) Eustass Kid - Starter Deck 36",
    ] as const) {
      const analytics = deckAnalytics(deckFromBase(deckId));
      const { plus1000, plus2000 } = analytics.counters;
      expect(plus1000 + plus2000).toBeLessThanOrEqual(analytics.total);
      expect(
        analytics.curve.reduce((sum, bucket) => sum + bucket.count, 0),
      ).toBe(analytics.total);
      const { character, event, stage } = analytics.categories;
      expect(character + event + stage).toBe(analytics.total);
    }
  });

  it("buckets everything at or above the curve's cap together", () => {
    const deck = deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31");
    // OP13-042 Edward.Newgate costs 10, well past the bucket's floor of 7.
    const analytics = deckAnalytics({ ...deck, cards: { "OP13-042": 3 } });
    const last = analytics.curve.at(-1)!;
    expect(last.label).toBe("7+");
    expect(last.count).toBe(3);
  });

  it("separates a deck built on the Leader's types from a pile of good cards", () => {
    // ST-31 is every card a {Straw Hat Crew} / {The Four Emperors} Leader
    // wants; the OP17 Elbaph Sabo list shares its Leader's types with nothing
    // and is held together by colour and effects instead. The whole point of
    // the figure is telling those two apart at a glance.
    const tribal = deckAnalytics(
      deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31"),
    );
    expect(tribal.leaderTypes).toContain("Straw Hat Crew");
    expect(tribal.sharedType).toBe(50);

    const pile = deckAnalytics(
      editableDeck("(Red/Black) Sabo - OP17 Elbaph List"),
    );
    expect(pile.sharedType).toBe(0);
  });

  it("counts a name link to the Leader from either end", () => {
    // Ace's Leader names [Monkey.D.Luffy]; Newgate's Characters name their
    // own Leader instead. One figure, because a player asking "is this deck
    // about my Leader" does not care which way Bandai wrote the sentence.
    expect(
      deckAnalytics(editableDeck("(Red) Portgas.D.Ace - Official Feature Deck"))
        .named,
    ).toBeGreaterThan(0);
    expect(
      deckAnalytics(
        editableDeck("(Red) Edward.Newgate - Official Feature Deck"),
      ).named,
    ).toBeGreaterThan(0);
  });

  it("splits a two-coloured deck by its Leader's colours, and a mono deck not at all", () => {
    const dual = deckAnalytics(
      deckFromBase("(Red/Black) Sabo - Starter Deck 35"),
    );
    expect(dual.colors.map(({ color }) => color)).toEqual(["Red", "Black"]);
    expect(dual.colors.reduce((sum, { count }) => sum + count, 0)).toBe(50);

    const mono = deckAnalytics(
      deckFromBase("(Red) Monkey.D.Luffy - Starter Deck 31"),
    );
    expect(mono.colors).toHaveLength(1);
  });

  it("adds a Counter Event's granted power, and nothing for one that grants none", () => {
    const deck = { leader: "ST21-001", cards: { "OP04-016": 2 } };
    // Two Events, no printed Counter values between them, 3000 apiece.
    expect(deckAnalytics(deck).counters).toEqual({ plus1000: 0, plus2000: 0 });
    expect(deckAnalytics(deck).counterEvents).toBe(2);
    expect(deckAnalytics(deck).counterPower).toBe(6000);

    // OP09-039 is a [Counter] Event that does something other than grant power,
    // so it is one of the deck's Counter plays and none of its Counter power.
    const noPower = { leader: "ST21-001", cards: { "OP09-039": 2 } };
    expect(deckAnalytics(noPower).counterEvents).toBe(2);
    expect(deckAnalytics(noPower).counterPower).toBe(0);
  });

  it("reads an empty list without dividing by its size", () => {
    const analytics = deckAnalytics({ leader: "ST21-001", cards: {} });
    expect(analytics.total).toBe(0);
    expect(analytics.peak).toBe(0);
    expect(analytics.averageCost).toBe(0);
    expect(analytics.counterPower).toBe(0);
  });
});
