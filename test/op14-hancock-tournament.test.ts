import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import {
  deckManifests,
  deckShelf,
  loadDeck,
  recommendedDeckFor,
  validateDeck,
} from "@one-piece-sim/decks";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { instance, scenario } from "./support/index.js";

/**
 * The ChinoizeCup #105 Blue/Yellow Boa Hancock list.
 *
 * Every card it plays is driven in the OP-14 and per-set card tests already;
 * what this file holds is that the list is the one the shelf, the picker and
 * the policy expect: a Standard-legal fifty under OP14-041, on the
 * Tournaments shelf, recommended over Bandai's feature deck, and kept on an
 * opening hand whose only early play is ST17-004, a card the feature deck
 * does not run.
 */

const LIST = "(Blue/Yellow) Boa Hancock - 25th Place ChinoizeCup #105";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP14-041";

describe("the ChinoizeCup #105 Hancock list", () => {
  it("is a Standard-legal 50 under OP14-041, shelved under Tournaments", () => {
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

  it("is the list the app offers for its Leader", () => {
    expect(recommendedDeckFor(LEADER)).toBe(LIST);
  });
});

describe("the opening hand", () => {
  async function decision(hand: readonly string[]): Promise<string> {
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("hancock-tournament-mulligan")
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

  it("keeps ST17-004 Boa Hancock as the early play and ships a hand without one", async () => {
    expect(
      await decision([
        "ST17-004",
        "EB04-058",
        "OP14-105",
        "OP14-112",
        "OP06-058",
      ]),
    ).toBe("keep");
    expect(
      await decision([
        "OP07-056",
        "EB04-058",
        "OP14-105",
        "OP14-112",
        "OP06-058",
      ]),
    ).toBe("mulligan");
  });
});
