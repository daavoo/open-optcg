import { describe, expect, it } from "vitest";
import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * A Character an effect *trashes* was not K.O.'d.
 *
 * Bandai's rules Q&A (Keywords 7) and OP-09 Q&A (OP09-009#1) rule that a
 * Character sent from the field to the trash by an effect that says "trash"
 * fires no [On K.O.]. The same reading binds every clause that watches for a
 * K.O.: EB01-047 Laboon, EB04-044 Koby and the OP13-002 and OP14-041 Leaders
 * all say "is K.O.'d", and a removal that only trashes must not pay them.
 *
 * Each case is run twice against the same victim: once trashed by OP09-009
 * Benn.Beckman's [On Play], once K.O.'d by ST10-016 Gum-Gum Kong Gatling's
 * [Main]. The K.O. arm is what makes the trash arm evidence -- a watcher that
 * never fires at all would pass the first half alone.
 */

type Removal = "trash" | "ko";

/** p1 to act on turn 11, both sides bare, all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks("FIXTURE-RED", "FIXTURE-BLUE")
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withHand("p1", [
      instance("beckman", "OP09-009"),
      instance("gatling", "ST10-016"),
    ])
    .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
    .withDeckTop("p2", copies(3, "FIX-001", "p2-deck"));

/** Answers every open prompt: the victim when it is offered, else apply. */
const settle = (game: Game, victim: string): void => {
  let guard = 0;
  while (game.state.pendingEffect && guard < 20) {
    guard += 1;
    const actions = game.legalActions();
    const pick =
      actions.find(
        (action) =>
          action.type === "resolve-effect" &&
          action.option.kind === "card" &&
          action.option.card.instanceId === victim,
      ) ??
      actions.find(
        (action) =>
          action.type === "resolve-effect" &&
          action.option.kind === "confirm" &&
          action.option.choice !== "done",
      ) ??
      actions[0];
    if (!pick) throw new Error("nothing to answer");
    game.submit(pick);
  }
};

/** Removes p2's `victim` the named way, on p1's turn. */
const remove = (game: Game, how: Removal, victim: string): void => {
  if (how === "trash") {
    game.play({ type: "play-card", cardNumber: "OP09-009" });
  } else {
    game.play({ type: "activate-main", sourceCardNumber: "ST10-016" });
  }
  settle(game, victim);
  expect(
    game.state.players.p2.board.some((card) => card.instanceId === victim),
  ).toBe(false);
  expect(
    game.state.players.p2.trash.some((card) => card.instanceId === victim),
  ).toBe(true);
};

describe("a trashed Character was not K.O.'d", () => {
  for (const [how, fires] of [
    ["trash", false],
    ["ko", true],
  ] as const) {
    it(`[On K.O.] ${fires ? "fires on a K.O." : "stays silent on a trash"} (OP05-046 Dalmatian)`, () => {
      const game = table(`trash-not-ko-on-ko-${how}`)
        .withBoard("p2", [character("dalmatian", "OP05-046")])
        .build();

      remove(game, how, "dalmatian");

      // Dalmatian's [On K.O.] draws for p2 and then puts a card from hand
      // under the deck, so the count is unchanged and the top card says it.
      expect(game.state.players.p2.deck[0]?.instanceId).toBe(
        fires ? "p2-deck-2" : "p2-deck-1",
      );
    });

    it(`EB01-047 Laboon ${fires ? "draws on a K.O." : "ignores a trash"}`, () => {
      const game = table(`trash-not-ko-laboon-${how}`)
        .withBoard("p1", [character("laboon", "EB01-047")])
        .withBoard("p2", [character("victim", "FIX-002")])
        .build();

      remove(game, how, "victim");

      expect(3 - game.state.players.p1.deck.length).toBe(fires ? 1 : 0);
    });

    it(`EB04-044 Koby ${fires ? "draws on a K.O." : "ignores a trash"}`, () => {
      const game = table(`trash-not-ko-koby-${how}`)
        .withBoard("p1", [character("koby", "EB04-044")])
        .withBoard("p2", [character("victim", "FIX-002")])
        .build();

      remove(game, how, "victim");

      expect(3 - game.state.players.p1.deck.length).toBe(fires ? 1 : 0);
    });

    it(`OP13-002 Portgas.D.Ace's Leader ${fires ? "draws on a K.O." : "ignores a trash"}`, () => {
      // OP08-048 Sweetpea: 6000 base power and no text of its own.
      const game = table(`trash-not-ko-ace-${how}`)
        .withLeader("p2", "OP13-002")
        .withGivenDon("p2", "p2-leader", 1)
        .withBoard("p2", [character("victim", "OP08-048")])
        .build();

      remove(game, how, "victim");

      expect(3 - game.state.players.p2.deck.length).toBe(fires ? 1 : 0);
    });

    it(`OP14-041 Boa Hancock's Leader ${fires ? "strips a Life card on a K.O." : "ignores a trash"}`, () => {
      const game = table(`trash-not-ko-hancock-${how}`)
        .withLeader("p2", "OP14-041")
        .withGivenDon("p2", "p2-leader", 1)
        .withBoard("p2", [character("victim", "OP08-048")])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .build();

      remove(game, how, "victim");

      expect(game.state.players.p1.life).toHaveLength(fires ? 1 : 2);
    });
  }
});
