import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  catalogMaxCost,
  catalogPoolCategories,
  catalogPoolColors,
  EMPTY_CATALOG_FILTER,
  matchesCatalogFilter,
  type CatalogFilter,
} from "../packages/web/src/catalog.js";
import { cardsForLeader } from "../packages/web/src/deck-editor.js";

/** Every card a Red Leader can build with: the pool the editor's box filters. */
const pool = cardsForLeader("ST21-001");

function filter(overrides: Partial<CatalogFilter> = {}): CatalogFilter {
  return { ...EMPTY_CATALOG_FILTER, ...overrides };
}

/** How many of that pool survive a filter. */
function hits(overrides: Partial<CatalogFilter>): number {
  const applied = filter(overrides);
  return pool.filter((card) => matchesCatalogFilter(card, applied)).length;
}

describe("catalog filters", () => {
  it("finds a bracketed cost that appears on no card's name", () => {
    // The bug the two boxes split: "DON!!" is printed in the effect box of a
    // fifth of the Red pool and in the name of none of it, so a search over
    // names, numbers, colours and types could only ever answer nothing.
    expect(hits({ identity: "don!!" })).toBe(0);
    expect(hits({ text: "don!!" })).toBeGreaterThan(15);
  });

  it("reaches clause markers and keywords with no printed text loaded", () => {
    // These come off `rules`, which is committed with the card. The words are
    // Bandai's and ship as an asset pack, so a build without one still has to
    // answer the questions a builder actually asks.
    expect(hits({ text: "on play" })).toBeGreaterThan(50);
    expect(hits({ text: "blocker" })).toBeGreaterThan(20);
    expect(hits({ text: "trigger" })).toBeGreaterThan(20);
    expect(hits({ text: "once per turn" })).toBeGreaterThan(10);
  });

  it("keeps identity search to what a card is, not what it does", () => {
    expect(hits({ identity: "luffy" })).toBeGreaterThan(0);
    expect(hits({ text: "luffy" })).toBeGreaterThan(0);
    // Both boxes at once is the intersection, which is the point of splitting
    // them: a Luffy that blocks, not every Luffy and every Blocker.
    const both = hits({ identity: "luffy", text: "blocker" });
    expect(both).toBeLessThan(hits({ identity: "luffy" }));
    expect(both).toBeLessThan(hits({ text: "blocker" }));
  });

  it("matches a card number, its colour, its type and its attribute", () => {
    const card = cardRegistry.get("OP04-016")!;
    expect(matchesCatalogFilter(card, filter({ identity: "op04-016" }))).toBe(
      true,
    );
    expect(matchesCatalogFilter(card, filter({ identity: "red" }))).toBe(true);
    const slasher = pool.find((entry) => entry.attribute === "Slash");
    expect(slasher).toBeDefined();
    expect(matchesCatalogFilter(slasher!, filter({ identity: "slash" }))).toBe(
      true,
    );
  });

  it("takes an untouched filter as no filter at all", () => {
    expect(hits({})).toBe(pool.length);
  });

  it("offers the pool's colours, in printed order", () => {
    // A mono-colour Leader has nothing to choose between; a two-colour one
    // builds from both halves, which is what the chips are for.
    expect(catalogPoolColors(pool)).toEqual(["Red"]);
    expect(catalogPoolColors(cardsForLeader("EB01-001"))).toEqual([
      "Red",
      "Green",
    ]);
  });

  it("hides a colour only once every colour a card has is hidden", () => {
    const red = pool.find((card) => (card.colors ?? []).includes("Red"))!;
    expect(matchesCatalogFilter(red, filter({ hiddenColors: ["Green"] }))).toBe(
      true,
    );
    expect(matchesCatalogFilter(red, filter({ hiddenColors: ["Red"] }))).toBe(
      false,
    );
    // No printing is two colours today, and the rule that decides one has to
    // be settled before one arrives: half of it hidden is still buildable with.
    const dual = { ...red, colors: ["Red", "Green"] };
    expect(
      matchesCatalogFilter(dual, filter({ hiddenColors: ["Green"] })),
    ).toBe(true);
    expect(
      matchesCatalogFilter(dual, filter({ hiddenColors: ["Red", "Green"] })),
    ).toBe(false);
    expect(hits({ hiddenColors: ["Red"] })).toBe(0);
  });

  it("hides a card type the same way, and offers the three a pool has", () => {
    expect(catalogPoolCategories(pool)).toEqual([
      "character",
      "event",
      "stage",
    ]);
    const event = pool.find((card) => card.category === "event")!;
    expect(
      matchesCatalogFilter(event, filter({ hiddenCategories: ["stage"] })),
    ).toBe(true);
    expect(
      matchesCatalogFilter(event, filter({ hiddenCategories: ["event"] })),
    ).toBe(false);
    expect(hits({ hiddenCategories: ["event", "stage"] })).toBe(
      pool.filter((card) => card.category === "character").length,
    );
  });

  it("bounds cost inclusively at both ends", () => {
    const max = catalogMaxCost(pool);
    expect(max).toBeGreaterThan(5);
    expect(hits({ minCost: 0, maxCost: max })).toBe(pool.length);
    // A single-cost band is exactly the cards printed at that cost.
    for (const cost of [0, 1, 4]) {
      expect(hits({ minCost: cost, maxCost: cost })).toBe(
        pool.filter((card) => card.cost === cost).length,
      );
    }
    // Bands cut at the bound meet without overlapping.
    expect(hits({ maxCost: 3 }) + hits({ minCost: 4 })).toBe(pool.length);
  });
});
