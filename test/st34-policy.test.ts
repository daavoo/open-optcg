import { describe, expect, it } from "vitest";
import {
  applyAction,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { St34RulesAgent } from "@one-piece-sim/agents/local";
import { character, instance, scenario } from "./support/index.js";

/**
 * ST34's Leader is its most reliable attacker, and it used to swing at its
 * printed 5000 in every game.
 *
 * `chooseAttachment` was the only one of the six deck policies to exclude the
 * Leader from DON!! attachment, and it also runs *below* the Leader's attack --
 * by which point the Leader is rested and its own `legalAttackers` filter would
 * drop it regardless. So nothing in the ladder could ever put DON!! on Katakuri,
 * and a 5000 swing into a 5000 Leader is answered by one 1000-Counter card.
 */
describe("ST34 sizes the Leader's swing before taking it", () => {
  /**
   * p1 on its own turn with an empty hand and no board, so `choosePlay` and the
   * activation loop both abstain and the decision is purely between attaching to
   * the Leader and swinging with it.
   */
  const table = (leaderDon: number) => {
    const build = scenario()
      .decks(
        "(Purple) Charlotte Katakuri - Starter Deck 34",
        "(Blue) Kuzan - Starter Deck 33",
      )
      .seed(`st34-leader-don-${leaderDon}`)
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withLife("p2", 2);
    return (
      leaderDon > 0 ? build.withGivenDon("p1", "p1-leader", leaderDon) : build
    ).build();
  };

  it("attaches DON!! to Katakuri while the swing is still one Counter card wide", async () => {
    const game = table(0);

    const action = await new St34RulesAgent().chooseAction(
      observe(game.state, "p1"),
    );

    // 5000 against a 5000 Leader: the ceiling is the opponent's Leader plus 2000,
    // because Counter is spent a whole card at a time.
    expect(action).toMatchObject({
      type: "attach-don",
      targetInstanceId: "p1-leader",
    });
  });

  it("swings once the Leader is 2000 clear of the opposing Leader", async () => {
    const game = table(2);

    const action = await new St34RulesAgent().chooseAction(
      observe(game.state, "p1"),
    );

    expect(action).toMatchObject({
      type: "attack",
      attackerInstanceId: "p1-leader",
    });
  });
});

/**
 * When Katakuri's Leader ability is worth its DON!!.
 *
 * The printed cost is `DON!! -1`, which returns a DON!! to the DON!! deck --
 * from where two are redrawn every turn until the field is back at ten. Paid
 * out of the rested pool it therefore costs a slot in a later draw rather than a
 * play now, and the question is only what the +1000 buys on this battle.
 *
 * The attack is *declared* rather than posed: the ability is
 * `[On Your Opponent's Attack]`, so nothing is pending until the engine has
 * processed the declaration.
 */
describe("ST34 buys the Leader's +1000 when it changes the battle", () => {
  /** p2 mid-swing at `attackerDon` DON!! on its Leader, p1 to answer. */
  function underAttack(attackerDon: number): GameState {
    const build = scenario()
      .decks(
        "(Purple) Charlotte Katakuri - Starter Deck 34",
        "(Blue) Kuzan - Starter Deck 33",
      )
      .seed(`st34-leader-defence-${attackerDon}`)
      .atTurn(6, { active: "p2" })
      .bareTable()
      .withLife("p1", 3);
    const game = (
      attackerDon > 0
        ? build.withGivenDon("p2", "p2-leader", attackerDon)
        : build
    ).build();
    const attack = getLegalActions(game.state, "p2").find(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "p2-leader" &&
        action.targetInstanceId === "p1-leader",
    );
    if (!attack) throw new Error("MISSING_ATTACK");
    return applyAction(game.state, { ...attack, revision: game.state.revision })
      .state;
  }

  it("applies the look on an attack the +1000 turns away", async () => {
    // 5000 into 5000: the attacker wins ties, so +1000 is exactly what flips
    // this battle from a lost Life card to no damage at all.
    const state = underAttack(0);
    const agent = new St34RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "apply" });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("saves the battle");
  });

  it("skips it on an attack the +1000 cannot turn away", async () => {
    // 7000 into 5000: +1000 leaves the hit connecting, so the DON!! would buy a
    // look at the top card and nothing else.
    const state = underAttack(2);
    const agent = new St34RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "skip" });
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "Preserve the DON!! curve",
    );
  });
});

/**
 * The three cost-guessing activations, and the order that makes them a combo.
 *
 * All three name a cost and reveal the top card of the opponent's deck.
 * `resolveSt34GuessCost` records that reveal as knowledge for both players, so
 * the first guess of a turn answers every later one -- and Oven's ramp is the
 * only part of any of them the engine pays out whether the guess lands or not.
 */
describe("ST34 guesses a cost it knows, and ramps when it does not", () => {
  const guessTable = (options: {
    board: readonly string[];
    knowsTop?: boolean;
  }) => {
    const build = scenario()
      .decks(
        "(Purple) Charlotte Katakuri - Starter Deck 34",
        "(Blue) Kuzan - Starter Deck 33",
      )
      .seed(`st34-guess-${options.board.join("-")}-${String(options.knowsTop)}`)
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withBoard(
        "p1",
        options.board.map((cardNumber, index) =>
          character(`guesser-${String(index)}`, cardNumber),
        ),
      )
      // One card in hand, so Perospero's trash cost is payable and the
      // activation is actually offered, and one card on top of the opponent's
      // deck for the guess to be about -- `bareTable()` leaves both decks empty.
      .withHand("p1", [instance("spare", "OP11-079")])
      .withDeckTop("p2", [instance("their-top", "OP12-045")]);
    const game = build.build();
    if (options.knowsTop) {
      // Set after `build()`, because the builder's own setup still draws: the
      // engine only reports the knowledge while the remembered instance is
      // still the card on top.
      const top = game.state.players.p2.deck[0];
      if (!top) throw new Error("MISSING_DECK_TOP");
      game.state.players.p1.knownOpponentDeckTop = top;
    }
    return game;
  };

  it("does not trash a card for a blind Perospero guess", async () => {
    // Perospero trashes the card before the cost is even named, and pays only
    // on a match against eleven possible costs.
    const game = guessTable({ board: ["OP11-071"] });

    const action = await new St34RulesAgent().chooseAction(
      observe(game.state, "p1"),
    );

    expect(action).not.toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP11-071",
    });
  });

  it("cashes the Perospero guess once the top card is known", async () => {
    const game = guessTable({ board: ["OP11-071"], knowsTop: true });
    const agent = new St34RulesAgent();

    const action = await agent.chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP11-071",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("already known");
  });

  it("still opens with Oven blind, because its ramp is unconditional", async () => {
    // `resolveSt34GuessCost` adds Oven's rested DON!! outside the `matched`
    // branch, so the rest is paid for whatever the guess does -- and the reveal
    // is what turns the other two on.
    const game = guessTable({ board: ["OP11-066", "OP11-071"] });
    const agent = new St34RulesAgent();

    const action = await agent.chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP11-066",
    });
  });
});
