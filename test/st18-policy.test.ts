import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { instance, scenario } from "./support/index.js";

/**
 * ST-18's deck policy.
 *
 * One judgement, and it is the one that decides whether the deck is alive to
 * play its own game: whether to pay OP05-060's activation with the last Life
 * card. The trade is a profit at every other Life total -- a card in hand and
 * an active DON!! for one Life -- and at 1 Life it buys the opponent the game,
 * because a battle wins by being declared against a player already on 0.
 *
 * The tests pose the decision and assert the *chosen action*, not the game it
 * leads to: what is pinned is that the seat declines at 1 Life and takes it at
 * 2, and a win-rate test could go on passing while the branch stopped firing.
 */

const ST18 = "(Purple) Monkey.D.Luffy - Starter Deck 18";
/** Katakuri, so nothing in the field intercepts ahead of the deck module. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP05-060";

/** ST-18 in its own Main Phase on `life` Life, with the activation offered. */
const posed = (seed: string, life: number, hand: string[] = ["OP05-068"]) =>
  scenario()
    .decks(ST18, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    // Explicit Life cards rather than a count: a count splices off the deck,
    // and what this poses is the Life total, not which cards are under it.
    .withLife(
      "p1",
      Array.from({ length: life }, (_, index) =>
        instance(`life-${index}`, "P-041"),
      ),
    )
    .withDonDeck("p1", 3)
    // The hand is what makes "ramp or develop" a live choice, so the Life-floor
    // cases below pose an empty one -- with a castable body there, a declined
    // activation could be the ordering rule rather than the Life floor.
    .withHand(
      "p1",
      hand.map((cardNumber, index) => instance(`hand-${index}`, cardNumber)),
    )
    .build();

/** What the deck's own agent picks from the options actually on offer. */
async function chosen(
  game: ReturnType<typeof posed>,
  disable: readonly string[] = [],
) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

describe("ST-18 keeps its last Life card", () => {
  it("declines the Leader's Life-for-DON!! trade at 1 Life", async () => {
    const game = posed("st18-policy-last-life", 1, []);
    // The engine is still offering it -- the rule removes it from the policy's
    // view, it is not an illegality.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === LEADER,
        ),
    ).toBe(true);

    // Whatever the ladder does instead -- here it attaches DON!! -- the point
    // is that the activation is no longer one of its options.
    const action = await chosen(game);
    expect(action.type).not.toBe("activate-main");
  });

  it("takes it at 1 Life once the rule is disabled, which is the bug it fixes", async () => {
    const game = posed("st18-policy-last-life-off", 1, []);

    const action = await chosen(game, ["st18-luffy#last-life-card"]);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(action.sourceCardNumber).toBe(LEADER);
  });

  it("still takes the trade at 2 Life, where it is a profit", async () => {
    const game = posed("st18-policy-two-life", 2, []);

    const action = await chosen(game);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(action.sourceCardNumber).toBe(LEADER);
  });
});

describe("ST-18 ramps before it develops", () => {
  it("takes the Leader's DON!! ahead of a play it could already afford", async () => {
    const game = posed("st18-policy-ramp-order", 4);

    const action = await chosen(game);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(action.sourceCardNumber).toBe(LEADER);
  });

  it("develops first once the rule is disabled, which is the bug it fixes", async () => {
    const game = posed("st18-policy-ramp-order-off", 4);

    const action = await chosen(game, ["st18-luffy#ramp-before-the-play"]);
    expect(action.type).toBe("play-card");
  });

  it("keeps developing at 1 Life, where the ramp is gone", async () => {
    // Both rules are live here. The Life floor has removed the activation, so
    // the sequencing rule must stand down or the turn would have no play and
    // no ramp left to take.
    const game = posed("st18-policy-ramp-order-last-life", 1);

    const action = await chosen(game);
    expect(action.type).not.toBe("activate-main");
    expect(
      game.legalActions().some((offer) => offer.type === "play-card"),
    ).toBe(true);
  });
});
