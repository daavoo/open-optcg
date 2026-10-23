import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import {
  deckManifests,
  deckShelf,
  loadDeck,
  validateDeck,
} from "@one-piece-sim/decks";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { instance, scenario } from "./support/index.js";

/**
 * The ChinoizeCup #124 Blue Buggy list, the first EB-05 Buggy build shipped.
 *
 * Every card it plays is driven in the per-set card tests already; what this
 * file holds is that the list is the one the shelf and the policy expect: a
 * Standard-legal fifty under OP09-042, on the Tournaments shelf, and kept by
 * `op09-buggy-policy.ts` on an ST-25 4-cost body, which this list plays as the
 * feature deck does.
 */

const LIST = "(Blue) Buggy - 33rd Place ChinoizeCup #124";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP09-042";

describe("the ChinoizeCup #124 Buggy list", () => {
  it("is a Standard-legal 50 under OP09-042, shelved under Tournaments", () => {
    const manifest = deckManifests[LIST]!;
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(manifest.leader).toBe(LEADER);
    expect(validateDeck(manifest)).toEqual({
      cardCount: 50,
      format: "standard",
      errors: [],
    });
    expect(deckShelf(LIST)).toBe("tournament");
  });
});

describe("the opening hand", () => {
  async function decision(hand: readonly string[]): Promise<string> {
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("buggy-tournament-mulligan")
      .withHand(
        "p1",
        hand.map((cardNumber, index) => instance(`card-${index}`, cardNumber)),
      )
      .build();
    const agent = new RegistryRulesAgent(LEADER);
    const action: LegalAction = await agent.chooseAction(
      observe(game.state, "p1"),
    );
    return action.type === "mulligan-decision" ? action.decision : action.type;
  }

  it("keeps an ST-25 4-cost body and ships a hand of searchers and big Characters", async () => {
    expect(
      await decision([
        "ST25-001",
        "OP09-057",
        "EB05-021",
        "OP09-051",
        "OP06-058",
      ]),
    ).toBe("keep");
    expect(
      await decision([
        "OP09-056",
        "OP09-057",
        "EB05-021",
        "OP09-051",
        "OP06-058",
      ]),
    ).toBe("mulligan");
  });
});
