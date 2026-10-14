import { describe, expect, it } from "vitest";

import { printedClauses, type ClauseId } from "@one-piece-sim/cards";

import {
  clauseCoverage,
  clauseCoverageErrors,
} from "../tools/clause-coverage.js";
import { covers } from "./support/index.js";

/**
 * The gate behind the project's rule that a card is not implemented until a
 * scenario test drives the engine to each of its printed clauses.
 *
 * It lives in the suite rather than only in `pnpm coverage:clauses` so that
 * `pnpm verify` fails on a card added without tests, which is the moment the
 * evidence is cheapest to write.
 */
describe("clause coverage", () => {
  const requirements = clauseCoverage();

  it("has a test for every printed clause of every deck card", () => {
    expect(clauseCoverageErrors(requirements)).toEqual([]);
  });

  it("derives a clause requirement for every card in every deck", () => {
    const cards = new Set(requirements.map((row) => row.cardNumber));
    expect(cards.size).toBeGreaterThan(150);
    expect(requirements.length).toBeGreaterThan(cards.size);
  });

  it("fails a claim the card does not print", () => {
    // ST31-003 Brook prints one [Opponent's Turn] clause and nothing else.
    expect(printedClauses("ST31-003")).toEqual(["[Opponent's Turn]"]);
    // Built rather than written literally: the static scanner reads `covers()`
    // string literals off this file too, and would take a spelled-out bad claim
    // as a real one.
    const unprinted: ClauseId = ["[On", "Play]"].join(" ") as ClauseId;
    expect(() => {
      covers("ST31-003", unprinted);
    }).toThrow(/does not print that clause/);
    expect(() => {
      covers("ST31-003");
    }).toThrow(/declares no clause/);
  });

  it("fails a claim that no test covers, and a stale accepted gap", () => {
    const missing = clauseCoverageErrors([
      {
        cardNumber: "ST31-003",
        name: "Brook",
        clause: "[Opponent's Turn]",
        deckIds: ["(Red) Monkey.D.Luffy - Starter Deck 31"],
        coveredBy: [],
      },
    ]);
    expect(missing[0]).toContain("has no covers() annotation");

    const stale = clauseCoverageErrors([
      {
        cardNumber: "ST31-003",
        name: "Brook",
        clause: "[Opponent's Turn]",
        deckIds: ["(Red) Monkey.D.Luffy - Starter Deck 31"],
        coveredBy: ["test/st31.test.ts"],
        acceptedGap: "left untested on purpose",
      },
    ]);
    expect(stale.some((error) => error.includes("stale"))).toBe(true);
  });
});
