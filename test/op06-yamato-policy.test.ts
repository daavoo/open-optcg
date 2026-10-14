import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { character, covers, instance, scenario } from "./support/index.js";

const YAMATO = "(Green/Yellow) Yamato - Official Feature Deck";
/** No matchup module intercepts this pairing, so the deck policy answers. */
const OPPONENT = "(Blue) Kuzan - Starter Deck 33";

/**
 * Turn 7, Yamato on the play, the opponent at 3 Life so the Leader's
 * `[Activate: Main]` is live, and two DON!! already rested by the turn's
 * plays for it to give.
 */
function thresholdOpen() {
  return scenario()
    .decks(YAMATO, OPPONENT)
    .seed("op06-yamato-policy")
    .atTurn(7, { active: "p1" })
    .withLife("p2", 3)
    .withDon("p1", { active: 3, rested: 2 });
}

async function chosenOption(
  game: ReturnType<ReturnType<typeof thresholdOpen>["build"]>,
) {
  game.play({ type: "activate-main", sourceCardNumber: "OP06-022" });
  const agent = new RegistryRulesAgent("OP06-022");
  const chosen = await agent.chooseAction(observe(game.state, "p1"));
  return "optionId" in chosen ? chosen.optionId : undefined;
}

describe("the Leader's rested DON!! go where they buy an attack", () => {
  covers("OP06-022", "[Activate: Main]");

  it("feeds a just-played ST28-004 over a body that can already attack", async () => {
    const game = thresholdOpen()
      .withBoard("p1", [
        // Listed first, so offer order would hand it the gift.
        character("kiku", "OP06-104", { playedTurn: 5 }),
        // Played this turn: no attack yet, and its own activation returns the
        // two DON!! for [Rush] -- a 7000 attack that did not exist.
        character("momo", "ST28-004", { playedTurn: 7 }),
      ])
      .build();
    expect(await chosenOption(game)).toBe("momo");
  });

  it("lifts the body the two DON!! put over the opposing Leader", async () => {
    const game = thresholdOpen()
      .withBoard("p1", [
        // 1000 power: with the gift a 3000 attack into a 5000 Leader, which
        // is no attack at all, and offer order's pick.
        character("izo", "ST28-002", { playedTurn: 5 }),
        // 3000 + 2000 = 5000 against the 5000 Leader; the attacker wins ties.
        character("ashura", "ST28-001", { playedTurn: 5 }),
      ])
      .build();
    expect(observe(game.state, "p1").opponent.leader.currentPower).toBe(5000);
    expect(await chosenOption(game)).toBe("ashura");
  });

  it("counts ST28-005's [DON!! x2] +3000 as part of the lift", async () => {
    const game = thresholdOpen()
      .withBoard("p1", [
        character("izo", "ST28-002", { playedTurn: 5 }),
        // 0 base power, but two DON!! are +2000 and switch on +3000: a 5000
        // attacker, level with the Leader.
        character("searcher", "ST28-005", { playedTurn: 5 }),
      ])
      .build();
    expect(await chosenOption(game)).toBe("searcher");
  });

  it("prefers a [DON!! x2] text that stays on over a spent body", async () => {
    const game = thresholdOpen()
      .withBoard("p1", [
        // Already attacked this turn: the +2000 is gone by the opponent's turn.
        character("ashura", "ST28-001", { rested: true, playedTurn: 5 }),
        // Rested too, but two DON!! make it a [Blocker] through the
        // opponent's whole turn -- given DON!! return at the next Refresh.
        character("izo", "ST28-002", { rested: true, playedTurn: 5 }),
      ])
      .build();
    expect(await chosenOption(game)).toBe("izo");
  });
});

describe("ST28-004 cashes given DON!! for [Rush] only when it needs the attack", () => {
  covers("ST28-004", "[Activate: Main]");

  function withGivenDonOnMomonosuke(playedTurn: number) {
    return (
      scenario()
        .decks(YAMATO, OPPONENT)
        .seed("op06-yamato-rush")
        .atTurn(7, { active: "p1" })
        .withLife("p2", 3)
        .withBoard("p1", [character("momo", "ST28-004", { playedTurn })])
        // Nothing to develop, so the ladder reaches the activation.
        .withHand("p1", [])
        .withDon("p1", { active: 3 })
        .withGivenDon("p1", "momo", 2)
        .build()
    );
  }

  it("takes it the turn Momonosuke lands, when it could not otherwise attack", async () => {
    const game = withGivenDonOnMomonosuke(7);
    const agent = new RegistryRulesAgent("OP06-022");
    const chosen = await agent.chooseAction(observe(game.state, "p1"));
    expect(chosen.type).toBe("activate-main");
    expect(
      "sourceCardNumber" in chosen ? chosen.sourceCardNumber : undefined,
    ).toBe("ST28-004");
  });

  it("declines it once Momonosuke already has its attack", async () => {
    const game = withGivenDonOnMomonosuke(5);
    const offered = game
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "ST28-004",
      );
    expect(offered).toBe(true);
    const agent = new RegistryRulesAgent("OP06-022");
    const chosen = await agent.chooseAction(observe(game.state, "p1"));
    expect(
      chosen.type === "activate-main" ? chosen.sourceCardNumber : undefined,
    ).not.toBe("ST28-004");
  });
});

describe("Otama spends a Life card only once the deck is low", () => {
  covers("PRB02-016", "[Activate: Main]");

  function withOtamaReady(life: number) {
    return (
      scenario()
        .decks(YAMATO, OPPONENT)
        .seed("op06-yamato-otama")
        .atTurn(7, { active: "p1" })
        .withLife("p1", life)
        .withLife("p2", 3)
        .withBoard("p1", [character("otama", "PRB02-016", { playedTurn: 5 })])
        // Nothing to develop, so the ladder reaches the activation.
        .withHand("p1", [])
        .withDon("p1", { active: 3 })
        .build()
    );
  }

  it("declines at 3 Life, where the Life card is still a Trigger in waiting", async () => {
    const game = withOtamaReady(3);
    const offered = game
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "PRB02-016",
      );
    expect(offered).toBe(true);
    const agent = new RegistryRulesAgent("OP06-022");
    const chosen = await agent.chooseAction(observe(game.state, "p1"));
    expect(
      chosen.type === "activate-main" ? chosen.sourceCardNumber : undefined,
    ).not.toBe("PRB02-016");
  });

  it("takes it at 2 Life, where ST28-004 already pays for being low", async () => {
    const game = withOtamaReady(2);
    const agent = new RegistryRulesAgent("OP06-022");
    const chosen = await agent.chooseAction(observe(game.state, "p1"));
    expect(chosen.type).toBe("activate-main");
    expect(
      "sourceCardNumber" in chosen ? chosen.sourceCardNumber : undefined,
    ).toBe("PRB02-016");
  });
});

describe("a wide board ahead on the clock loads the Leader instead of developing", () => {
  covers("OP06-022", "[Double Attack]");

  /**
   * Turn 9, opponent at 3 Life with an empty board, so this seat is the
   * faster one; three Characters already down, and a 4-cost body in hand
   * whose cost is exactly the DON!! that takes the Leader from 5000 to 9000.
   */
  function wideBoardAhead(board: string[]) {
    return scenario()
      .decks(YAMATO, OPPONENT)
      .seed("op06-yamato-load")
      .atTurn(9, { active: "p1" })
      .withLife("p1", 4)
      .withLife("p2", 3)
      .withBoard(
        "p1",
        board.map((cardNumber, index) =>
          character(`body-${index}`, cardNumber, { playedTurn: 5 }),
        ),
      )
      .withHand("p1", [instance("kiku", "OP06-104")])
      .withDon("p1", { active: 4 })
      .build();
  }

  it("refuses the body whose cost is the Leader's Counter threshold", async () => {
    const game = wideBoardAhead(["ST28-005", "ST28-002", "OP06-110"]);
    const agent = new RegistryRulesAgent("OP06-022");
    const chosen = await agent.chooseAction(observe(game.state, "p1"));

    // 5000 + 4 DON!! is 9000, which costs the defender three Counter cards
    // against 5000's one. Playing the 4-cost body spends all of that.
    expect(chosen.type).not.toBe("play-card");
    expect(chosen.type).toBe("attach-don");
  });

  it("develops instead while the board is still narrow", async () => {
    const game = wideBoardAhead(["ST28-005", "ST28-002"]);
    const agent = new RegistryRulesAgent("OP06-022");
    const chosen = await agent.chooseAction(observe(game.state, "p1"));

    expect(chosen.type).toBe("play-card");
  });
});
