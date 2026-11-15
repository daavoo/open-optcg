import { describe, expect, it } from "vitest";
import type { MatchConfig } from "../packages/web/src/controller.js";
import {
  settleTurnOrder,
  startingPlayerFor,
  turnOrderChooser,
} from "../packages/web/src/turn-order.js";

function config(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
    p2Deck: "(Yellow) Eustass Kid - Starter Deck 36",
    p1Controller: "rules",
    p2Controller: "rules",
    seed: "turn-order-a",
    startingPlayer: "random",
    ...overrides,
  };
}

describe("turn order", () => {
  it("rolls the chooser from the seed, and either seat can win it", () => {
    expect(turnOrderChooser("turn-order-a")).toBe("p1");
    expect(turnOrderChooser("turn-order-b")).toBe("p2");
    expect(turnOrderChooser("turn-order-a")).toBe("p1");
  });

  it("puts the chooser first or the other seat first", () => {
    expect(startingPlayerFor("p1", "first")).toBe("p1");
    expect(startingPlayerFor("p1", "second")).toBe("p2");
    expect(startingPlayerFor("p2", "first")).toBe("p2");
    expect(startingPlayerFor("p2", "second")).toBe("p1");
  });

  it("leaves a pinned starting seat alone", async () => {
    const pinned = config({ startingPlayer: "p2", p1Controller: "human" });
    expect(await settleTurnOrder(pinned)).toBe(pinned);
  });

  it("records the seat an agent's roll produced, so a replay is not rolled again", async () => {
    expect((await settleTurnOrder(config())).startingPlayer).toBe("p1");
    expect(
      (await settleTurnOrder(config({ seed: "turn-order-b" }))).startingPlayer,
    ).toBe("p2");
  });
});
