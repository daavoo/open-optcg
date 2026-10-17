import { describe, expect, it } from "vitest";
import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * "Rest N of your cards" and "rest up to N of your opponent's cards" reach the
 * active DON!! as well as the Leader, Characters and Stage.
 *
 * Bandai's OP-14 Q&A rules it for OP14-020 Mihawk, OP14-024 Kin'emon and
 * OP14-029 Tashigi (`test/faq-op14-eb04.test.ts`); the cards here print the
 * same words in other sets. Every position leaves a DON!! as the only active
 * card on the side in question, so the clause either reaches it or does
 * nothing.
 */

/** p1 to act, both sides bare, every DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks("FIXTURE-RED", "FIXTURE-BLUE")
    .seed(seed)
    .atTurn(3, { active: "p1" })
    .bareTable();

/** Takes the first offer of every open prompt that is not a decline. */
const settle = (game: Game): void => {
  let guard = 0;
  while (game.state.pendingEffect && guard < 20) {
    guard += 1;
    const actions = game.legalActions();
    const pick =
      actions.find(
        (action) =>
          action.type === "resolve-effect" &&
          action.option.kind !== "skip" &&
          !(
            action.option.kind === "confirm" && action.option.choice === "done"
          ),
      ) ?? actions[0];
    if (!pick) throw new Error("nothing to answer");
    game.submit(pick);
  }
};

describe("an opponent's active DON!! is one of their cards", () => {
  for (const cardNumber of ["OP15-032", "OP16-035"]) {
    it(`${cardNumber}'s [On Play] rests an opposing DON!! when nothing else is active`, () => {
      const game = table(`rest-your-cards-${cardNumber}`)
        .withRestedLeader("p2")
        .withHand("p1", [
          instance("source", cardNumber),
          ...copies(1, "FIX-001", "fodder"),
        ])
        .build();

      game.play({ type: "play-card", cardNumber });
      expect(
        game
          .legalActions()
          .some(
            (action) =>
              action.type === "resolve-effect" &&
              action.option.kind === "resource" &&
              action.option.resource === "don",
          ),
      ).toBe(true);
      settle(game);

      expect(game.state.players.p2.restedDon).toHaveLength(1);
    });
  }

  it("OP15-032 Brook can rest the opposing Leader: a Leader is one of their cards too", () => {
    const game = table("rest-your-cards-brook-leader")
      .withHand("p1", [instance("brook", "OP15-032")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-032" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });

    expect(game.state.players.p2.leaderRested).toBe(true);
  });

  it("offers one DON!! however many are active: they are interchangeable", () => {
    const game = table("rest-your-cards-one-don-option")
      .withRestedLeader("p2")
      .withHand("p1", [instance("brook", "OP15-032")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-032" });

    expect(game.state.players.p2.activeDon.length).toBeGreaterThan(1);
    expect(
      game
        .legalActions()
        .filter(
          (action) =>
            action.type === "resolve-effect" &&
            action.option.kind === "resource",
        ),
    ).toHaveLength(1);
  });
});

describe("a player's own active DON!! is one of their cards", () => {
  it("OP17-021 Crone Oli's replacement can be paid by resting a DON!!", () => {
    // p2's ST10-016 Gum-Gum Kong Gatling K.O.s Oli; p1's Leader is rested and
    // Oli is its only Character, so a DON!! is all that can pay.
    const game = scenario()
      .decks("FIXTURE-RED", "FIXTURE-BLUE")
      .seed("rest-your-cards-crone-oli")
      .atTurn(3, { active: "p2" })
      .bareTable()
      .withRestedLeader("p1")
      .withBoard("p1", [character("oli", "OP17-021", { rested: true })])
      .withHand("p2", [instance("gatling", "ST10-016")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "oli" });
    const replace = game
      .legalActions("p1")
      .find(
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId.startsWith("replace:"),
      );
    expect(replace).toBeDefined();
    game.submit(replace!);
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "oli",
    ]);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});
