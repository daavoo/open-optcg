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
 * The ChinoizeCup #125 Red Trafalgar Law list, the first EB-05 Law build
 * shipped.
 *
 * Every card it plays is driven in the per-set card tests already; what this
 * file holds is that the list is the one the shelf and the policy expect: a
 * Standard-legal fifty under OP14-001, on the Tournaments shelf, and kept by
 * `op14-law-policy.ts` on a cheap swap partner, which this list plays as the
 * feature deck does.
 */

const LIST = "(Red) Trafalgar Law - 9th Place ChinoizeCup #125";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP14-001";

describe("the ChinoizeCup #125 Law list", () => {
  it("is a Standard-legal 50 under OP14-001, shelved under Tournaments", () => {
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
      .seed("law-tournament-mulligan")
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

  it("keeps a cheap Supernovas body and ships a hand without one", async () => {
    expect(
      await decision([
        "OP14-010",
        "EB05-001",
        "OP14-019",
        "OP17-005",
        "OP14-009",
      ]),
    ).toBe("keep");
    expect(
      await decision([
        "PRB02-003",
        "EB05-001",
        "OP14-019",
        "OP17-005",
        "OP14-009",
      ]),
    ).toBe("mulligan");
  });
});
