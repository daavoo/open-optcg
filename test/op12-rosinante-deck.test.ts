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
 * The TCG Match Making EB05 Donquixote Rosinante list, the Community list
 * behind the OP12-061 Leader.
 *
 * Every card it plays is driven in its set's card tests already; what this
 * file holds is that the list is the one the shelf and the policy expect: a
 * Standard-legal fifty under OP12-061, on the Tournaments shelf, and kept by
 * `op12-rosinante-policy.ts` on a searcher or a 4-cost Law -- not on the
 * Counter Events or the 2-cost Gum-Gum Lightning the generic keep would
 * accept. FlyestRaven's ChinoizeCup #125 list, a training list now, is piloted
 * by the same rule.
 */

const LIST =
  "(Purple/Yellow) Donquixote Rosinante - TCG Match Making EB05 2026-11-12 #9";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP12-061";

describe("the TCG Match Making EB05 Rosinante list", () => {
  it("is a Standard-legal 50 under OP12-061, shelved under Tournaments", () => {
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
      .seed("rosinante-op12-mulligan")
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

  it("keeps a searcher or a 4-cost Law", async () => {
    expect(
      await decision([
        "OP12-108",
        "OP16-065",
        "EB04-038",
        "EB04-058",
        "OP12-115",
      ]),
    ).toBe("keep");
    expect(
      await decision(["P-093", "OP16-065", "EB04-038", "EB04-058", "OP12-115"]),
    ).toBe("keep");
  });

  it("ships a hand whose only cheap cards are Counter Events and Gum-Gum Lightning", async () => {
    expect(
      await decision([
        "OP12-115",
        "OP15-078",
        "OP09-077",
        "OP16-065",
        "EB04-038",
      ]),
    ).toBe("mulligan");
  });

  it("keeps FlyestRaven's list's own searcher, OP10-065 Sugar", async () => {
    expect(
      await decision([
        "OP10-065",
        "OP16-065",
        "EB04-038",
        "EB04-058",
        "OP12-115",
      ]),
    ).toBe("keep");
  });
});
