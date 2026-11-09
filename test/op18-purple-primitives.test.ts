import { describe, expect, it } from "vitest";
import { deriveRules } from "@one-piece-sim/cards";

/**
 * The shared changes OP-18's Purple cards needed, tested apart from the cards.
 * The engine-side ones -- a `card-moved` reaction from the trash to the board,
 * and `restsSelf` on a `return-don` replacement cost -- are driven by the
 * OP18-060 and OP18-069 scenarios in `op18-purple.test.ts`.
 */
describe("granted keyword after a power change", () => {
  it("does not read 'gains +N power and [Blocker]' as a printed [Blocker]", () => {
    const rules = deriveRules({
      name: "Fixture",
      category: "character",
      trigger: "",
      effect:
        "[Opponent's Turn] If your Leader is [Fixture], this Character gains +2000 power and [Blocker].",
    });
    expect(rules.keywords).not.toContain("Blocker");
  });

  it("still reads a printed [Blocker] ahead of the same grant", () => {
    const rules = deriveRules({
      name: "Fixture",
      category: "character",
      trigger: "",
      effect:
        "[Blocker] [Opponent's Turn] This Character gains +1000 power and [Rush].",
    });
    expect(rules.keywords).toContain("Blocker");
    expect(rules.keywords).not.toContain("Rush");
  });
});
