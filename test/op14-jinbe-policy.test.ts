import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Blue) Jinbe's rules: when the Leader trades a card for its gift, which card
 * pays, whose Character the bounce returns, and the opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const JINBE = "(Blue) Jinbe - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP14-040";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

function describeAction(action: LegalAction): string {
  if (action.type === "resolve-effect") {
    return action.option.kind === "mode" ? action.option.mode : action.optionId;
  }
  if (action.type === "activate-main")
    return `activate:${action.sourceInstanceId}`;
  return action.type;
}

const table = (seed: string, turn = 11) =>
  scenario()
    .decks(JINBE, OPPONENT)
    .seed(seed)
    .atTurn(turn, { active: "p1" })
    .bareTable();

const leaderActivation = (action: LegalAction) =>
  action.type === "activate-main" && action.sourceInstanceId === "p1-leader";

describe("the Leader's gift", () => {
  it("keeps the card when there is no rested DON!! to give", async () => {
    const game = table("jinbe-no-rested")
      .withBoard("p1", [character("arlong", "OP14-042", { playedTurn: 1 })])
      .withHand("p1", [instance("chew", "OP14-050")])
      // No active DON!!, so nothing in hand competes with the activation.
      .withDonDeck("p1", 10)
      .build();

    expect(game.legalActions().some(leaderActivation)).toBe(true);
    expect(leaderActivation(await chosen(game))).toBe(false);
    expect(leaderActivation(await chosen(game, ["op14-jinbe-leader"]))).toBe(
      true,
    );
  });

  it("trades a card for the gift while a Fish-Man can still attack below the opposing Leader", async () => {
    // Two rested DON!! and no active ones, so nothing competes with the gift.
    const game = table("jinbe-gift")
      .withBoard("p1", [character("arlong", "OP14-042", { playedTurn: 1 })])
      .withHand("p1", [instance("chew", "OP14-050")])
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 2 })
      .build();

    expect(leaderActivation(await chosen(game))).toBe(true);
  });

  it("stops once every attacker is past the opposing Leader", async () => {
    // The Leader's own swing is spent, so only the 7000 Fisher Tiger is left
    // to receive the gift, and it is already past 5000 + 2000.
    const game = table("jinbe-gift-done")
      .withRestedLeader("p1")
      .withBoard("p1", [character("tiger", "OP14-054", { playedTurn: 1 })])
      .withHand("p1", [instance("chew", "OP14-050")])
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 4 })
      .build();

    expect(game.legalActions().some(leaderActivation)).toBe(true);
    expect(leaderActivation(await chosen(game))).toBe(false);
    expect(leaderActivation(await chosen(game, ["op14-jinbe-leader"]))).toBe(
      true,
    );
  });

  it("keeps a short hand for Counters rather than lift a Leader that already connects", async () => {
    // The Leader at 5000 already hits the opposing 5000, so the gift is only a
    // margin, and with five cards in hand that margin is not worth one.
    const short = (count: number) =>
      table(`jinbe-floor-${String(count)}`)
        .withHand(
          "p1",
          Array.from({ length: count }, (_, index) =>
            instance(`card-${String(index)}`, "OP14-055"),
          ),
        )
        .withDonDeck("p1", 10)
        .withDon("p1", { rested: 2 })
        .build();

    expect(leaderActivation(await chosen(short(5)))).toBe(false);
    expect(leaderActivation(await chosen(short(6)))).toBe(true);
  });

  it("pays with the 1-cost rather than Fisher Tiger", async () => {
    const game = table("jinbe-pitch")
      .withBoard("p1", [character("arlong", "OP14-042", { playedTurn: 1 })])
      .withHand("p1", [
        instance("tiger", "OP14-054"),
        instance("chew", "OP14-050"),
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });

    expect(describeAction(await chosen(game))).toBe("chew");
    // First offered is hand order, which puts the refill first.
    expect(describeAction(await chosen(game, ["op14-jinbe-pitch"]))).toBe(
      "tiger",
    );
  });
});

describe("OP14-049 Jinbe's bounce", () => {
  it("returns the opposing Character, not one of its own", async () => {
    const game = table("jinbe-bounce")
      .withBoard("p1", [character("gang", "OP14-055", { playedTurn: 1 })])
      .withBoard("p2", [character("target", "ST34-005")])
      .withHand("p1", [instance("jinbe", "OP14-049")])
      .withDeckTop("p1", [
        instance("draw-a", "OP14-050"),
        instance("draw-b", "OP14-050"),
      ])
      .withDon("p1", { active: 10 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-049" });
    game.play(
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "confirm" &&
        action.option.choice === "apply",
    );

    const modes = game
      .legalActions()
      .map((action) => describeAction(action))
      .filter((mode) => ["own", "theirs"].includes(mode));
    expect(modes).toEqual(["own", "theirs"]);
    expect(describeAction(await chosen(game))).toBe("theirs");
    expect(describeAction(await chosen(game, ["op14-jinbe-bounce"]))).toBe(
      "own",
    );
  });
});

describe("the opening hand", () => {
  it("keeps a 1-cost Fish-Man beside a 3- or 4-cost body, and ships a hand without one", async () => {
    const keep = scenario()
      .decks(JINBE, OPPONENT)
      .seed("jinbe-mulligan")
      .withHand("p1", [
        instance("chew", "OP14-050"),
        instance("kuroobi", "OP14-045"),
        instance("a", "OP14-049"),
        instance("b", "OP14-049"),
        instance("c", "OP14-058"),
      ])
      .build();
    const ship = scenario()
      .decks(JINBE, OPPONENT)
      .seed("jinbe-mulligan")
      .withHand("p1", [
        instance("kuroobi", "OP14-045"),
        instance("aladine", "OP14-043"),
        instance("a", "OP14-049"),
        instance("b", "OP14-049"),
        instance("c", "OP14-058"),
      ])
      .build();

    const decisionOf = (action: LegalAction) =>
      action.type === "mulligan-decision" ? action.decision : action.type;
    expect(decisionOf(await chosen(keep))).toBe("keep");
    expect(decisionOf(await chosen(ship))).toBe("mulligan");
  });
});
