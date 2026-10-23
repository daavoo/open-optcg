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
 * The EB05 Wisdom Nico Robin list, the first deck behind the EB05-010 Leader.
 *
 * Every card it plays is driven in the EB-05 and per-set card tests already;
 * what this file holds is that the list is the one the shelf and the policy
 * expect: a Standard-legal fifty under EB05-010, on the Tournaments shelf,
 * and kept by `eb05-robin-policy.ts` on a digger or an early <Wisdom> body
 * -- not on the cheap Nico Olvia and Nojiko the generic keep would accept.
 */

const LIST = "(Green/Yellow) Nico Robin - EB05 Wisdom List";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "EB05-010";

describe("the EB05 Wisdom Robin list", () => {
  it("is a Standard-legal 50 under EB05-010, shelved under Tournaments", () => {
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
      .seed("robin-eb05-mulligan")
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

  it("keeps Atlas and ships a hand whose only cheap cards are Olvia and Nojiko", async () => {
    expect(
      await decision([
        "EB05-050",
        "EB05-016",
        "EB05-055",
        "OP17-022",
        "OP13-031",
      ]),
    ).toBe("keep");
    expect(
      await decision([
        "EB05-056",
        "EB05-057",
        "EB05-016",
        "EB05-055",
        "OP17-022",
      ]),
    ).toBe("mulligan");
  });
});
