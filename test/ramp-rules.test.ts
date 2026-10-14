import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * `ramp#free-ramp-first`, the one rule in `strategy/ramp.ts`, posed on OP15
 * Enel -- the deck whose Leader looks like the rule's subject and is only its
 * subject while the DON!! deck can pay for the whole ramp. Kaido already had
 * the same veto by card number (`king-ramp-first`, now retired), so its own
 * test in `op17-kaido-policy.test.ts` is the zero-flip half of this.
 */
const ENEL_LEADER = "OP15-058";
const ENEL_DECK = "(Purple) Enel - Official Feature Deck";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

/** Enel's own turn: a 1-cost body in hand, `board` on the field, five DON!! in the deck. */
function enelTurn(board: ReturnType<typeof character>[]) {
  return scenario()
    .decks(ENEL_DECK, OPPONENT)
    .seed("ramp-rules-enel")
    .bareTable()
    .atTurn(5, { active: "p1" })
    .withDon("p1", { active: 1 })
    .withDonDeck("p1", 5)
    .withLife("p1", copies(4, "OP15-061", "p1-life"))
    .withLife("p2", copies(4, "ST34-002", "p2-life"))
    .withBoard("p1", board)
    .withHand("p1", [instance("ohm", "OP15-061")])
    .build();
}

describe("a free, untargeted activation that adds active DON!! goes before the plays", () => {
  it("activates the Leader first on an empty board, where everything it adds stays in the pool", async () => {
    // One active DON!! on the field, five in the DON!! deck, nobody to give
    // to: the Leader adds one active and four rested to the cost area, and the
    // active one pays for the vassal. `chooseGenericRules` would play first and
    // reach the Leader with nothing left.
    const game = enelTurn([]);
    expect(
      game.legalActions("p1").some((action) => action.type === "play-card"),
    ).toBe(true);

    const action = await new RegistryRulesAgent(ENEL_LEADER).chooseAction(
      observe(game.state, "p1"),
    );

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: ENEL_LEADER,
    });
  });

  it("lets the plays go first when the activation would hand DON!! to a body", async () => {
    // With a Character to give to, the Leader's four rested DON!! come out of
    // the pool -- which only holds rested DON!! after the plays have spent
    // some. That is the deck's own ordering, and the ungated rule reversed it
    // at a real cost.
    const game = enelTurn([character("shura", "OP15-067", { playedTurn: 3 })]);

    const action = await new RegistryRulesAgent(ENEL_LEADER).chooseAction(
      observe(game.state, "p1"),
    );

    expect(action.type).toBe("play-card");
  });
});
