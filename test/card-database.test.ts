import { describe, expect, it } from "vitest";
import {
  cardRegistry,
  createCardDatabase,
  resolveCardRecord,
  type CardDefinition,
} from "@one-piece-sim/cards";

const LEADER: CardDefinition = resolveCardRecord({
  cardNumber: "TEST-LEADER",
  name: "Test Leader",
  category: "leader",
  cost: 5,
  power: 5000,
  counter: null,
  types: ["Test"],
  attribute: "Strike",
  effect: "[Blocker]",
  trigger: "",
});

const CHARACTER: CardDefinition = resolveCardRecord({
  cardNumber: "TEST-001",
  name: "Test Character",
  category: "character",
  cost: 2,
  power: 3000,
  counter: 1000,
  types: ["Test"],
  attribute: "Strike",
  effect: "[Rush]",
  trigger: "",
});

describe("createCardDatabase", () => {
  it("scopes lookups to the given sets, not the shipped pool", () => {
    const db = createCardDatabase([[LEADER, CHARACTER]]);

    expect(db.get("TEST-LEADER")).toEqual(LEADER);
    expect(db.get("OP01-025")).toBeUndefined();
    expect([...db.cards()]).toEqual([LEADER, CHARACTER]);
  });

  it("throws UNKNOWN_CARD for a number outside the scoped pool", () => {
    const db = createCardDatabase([[LEADER]]);
    expect(() => db.require("TEST-001")).toThrow("UNKNOWN_CARD: TEST-001");
  });

  it("derives facts the same way the shipped pool does", () => {
    const db = createCardDatabase([[CHARACTER]]);
    const facts = db.facts("TEST-001");
    expect(facts.keywords).toContain("Rush");
    expect(facts.cost).toBe(2);
  });

  it("names() maps every scoped card number to its printed name", () => {
    const db = createCardDatabase([[LEADER, CHARACTER]]);
    expect(db.names()).toEqual(
      new Map([
        ["TEST-LEADER", "Test Leader"],
        ["TEST-001", "Test Character"],
      ]),
    );
  });

  it("two databases built from the same sets don't share cached facts", () => {
    const a = createCardDatabase([[CHARACTER]]);
    const b = createCardDatabase([[CHARACTER]]);
    expect(a.facts("TEST-001")).toEqual(b.facts("TEST-001"));
    expect(a.facts("TEST-001")).not.toBe(b.facts("TEST-001"));
  });

  it("reconstructing the shipped registry as a database matches every card", () => {
    const db = createCardDatabase([[...cardRegistry.values()]]);
    for (const [cardNumber, definition] of cardRegistry) {
      expect(db.get(cardNumber)).toEqual(definition);
    }
  });
});
