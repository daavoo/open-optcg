import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * The rules seat for the OP-17 Red/Black Sabo list.
 *
 * The load-bearing case is the first one: OP13-004 fronts two shipped decks and
 * `registerPolicy` keys on the Leader card number, so before
 * `op13-sabo-policy.ts` existed the ST-35 Revolutionary Army policy piloted
 * this list too -- and its mulligan rule keeps a hand only when it holds one of
 * four ST-35 cards, none of which this deck contains. Every opening hand went
 * back. A benchmark cannot tell that apart from a deck that is merely weak,
 * which is why it is pinned here as behaviour.
 */
const ELBAPH = "(Red/Black) Sabo - OP17 Elbaph List";
const ST35 = "(Red/Black) Sabo - Starter Deck 35";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

/** The seat's own agent, asked for its decision on the position as built. */
const decideFor = async (
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
): Promise<string> => {
  const agent = new RegistryRulesAgent("OP13-004");
  const action = await agent.chooseAction(observe(game.state, "p1"));
  return action.actionId;
};

describe("OP13-004 shared between two decks", () => {
  it("keeps an Elbaph opening hand holding a giant", async () => {
    const game = scenario()
      .decks(ELBAPH, OPPONENT)
      .seed("op13-sabo-keep")
      .withHand("p1", [
        instance("saul", "OP17-089"),
        instance("nami", "OP17-086"),
        ...copies(3, "OP17-095", "zoro"),
      ])
      .allowPartialState()
      .build();

    const decided = await decideFor(game);
    const chosen = game
      .legalActions()
      .find((action) => action.actionId === decided);
    expect(chosen?.type).toBe("mulligan-decision");
    expect(chosen).toMatchObject({ decision: "keep" });
  });

  it("mulligans an Elbaph hand of nothing but 2-drops", async () => {
    const game = scenario()
      .decks(ELBAPH, OPPONENT)
      .seed("op13-sabo-mulligan")
      .withHand("p1", [
        ...copies(3, "OP17-095", "zoro"),
        ...copies(2, "OP17-084", "chopper"),
      ])
      .allowPartialState()
      .build();

    const decided = await decideFor(game);
    const chosen = game
      .legalActions()
      .find((action) => action.actionId === decided);
    expect(chosen).toMatchObject({
      type: "mulligan-decision",
      decision: "mulligan",
    });
  });

  it("still applies the ST-35 mulligan rule to the ST-35 list", async () => {
    // The other half of the split: the guard added to `st35-policy.ts` must not
    // stop it piloting its own deck. ST35-004 Koala is one of the four cards its
    // rule keeps for.
    const game = scenario()
      .decks(ST35, OPPONENT)
      .seed("st35-keep")
      .withHand("p1", [
        instance("koala", "ST35-004"),
        ...copies(4, "OP13-005", "inazuma"),
      ])
      .allowPartialState()
      .build();

    const decided = await decideFor(game);
    const chosen = game
      .legalActions()
      .find((action) => action.actionId === decided);
    expect(chosen).toMatchObject({
      type: "mulligan-decision",
      decision: "keep",
    });
  });
});

describe("the Elbaph rank layer", () => {
  it("plays the giant before the 2-drop that the giant grows", async () => {
    // The deck's whole ordering claim: OP17-095 Zoro is a 2000 body before the
    // giant lands and a 6000 one after, so a turn that spends its DON!! on the
    // 2-drop first has thrown the difference away.
    const game = scenario()
      .decks(ELBAPH, OPPONENT)
      .seed("op13-sabo-order")
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withLife("p1", copies(4, "OP17-086", "life"))
      // `bareTable()` leaves both Life stacks empty, and an opponent on 0 Life
      // is a turn about the kill rather than about the curve: `lethal-close`
      // removes every play while one is live, which is the opposite of the
      // ordering this test is posing.
      .withLife("p2", copies(4, "OP17-086", "opponent-life"))
      .withHand("p1", [
        instance("zoro", "OP17-095"),
        instance("saul", "OP17-089"),
      ])
      .build();

    const decided = await decideFor(game);
    const chosen = game
      .legalActions()
      .find((action) => action.actionId === decided);
    expect(chosen).toMatchObject({
      type: "play-card",
      cardInstanceId: "saul",
    });
  });

  it("does not rest six DON!! for a K.O. with nothing in range", async () => {
    // OP17-098's [Main] is "K.O. up to 2 ... with a cost of 6 or less", gated on
    // a cost-12 body. Against an empty board the engine still offers it, and the
    // six rested DON!! are the whole turn.
    const game = scenario()
      .decks(ELBAPH, OPPONENT)
      .seed("op13-sabo-kong-gun")
      .atTurn(13, { active: "p1" })
      .bareTable()
      .withLife("p1", copies(4, "OP17-086", "life"))
      .withBoard("p1", [character("saul", "OP17-089")])
      .withHand("p1", [instance("kong-gun", "OP17-098")])
      .build();

    // The activation is on the table -- this is a veto, not an absent action.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "OP17-098",
        ),
    ).toBe(true);

    const decided = await decideFor(game);
    const chosen = game
      .legalActions()
      .find((action) => action.actionId === decided);
    expect(chosen?.type).not.toBe("activate-main");
  });

  /**
   * The turn this deck used to end one attack short, from
   * `open-optcg-trace(10).jsonl` p2 turn 5.
   *
   * It needs the whole agent rather than either module alone, because the fault
   * was an interaction: `aura-before-bodies` vetoes the cheap play so the DON!!
   * can switch the aura on, and `don-reservation` vetoed the attachment as "the
   * last one that can pay for a play". With both candidates gone the ladder fell
   * through to `attack` and the Leader swung at 5000 instead of 7000. Asserting
   * either veto in isolation would have passed throughout.
   */
  it("puts the last DON!! on the Leader rather than on a 1-cost body", async () => {
    const game = scenario()
      .decks(ELBAPH, OPPONENT)
      .seed("op13-sabo-aura-last-don")
      // Inside the ramp window, which is where `don-reservation` is active and
      // so where the two vetoes actually collided.
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withLife("p1", copies(3, "OP17-086", "life"))
      // `don-reservation` is gated on the opponent being above one Life, and
      // `bareTable()` empties both decks, so this has to be given as cards.
      .withLife("p2", copies(4, "OP17-086", "opp-life"))
      // Saul sits on the field at cost 16, so the Leader's "cost of 8 or more"
      // condition holds and the DON!! is +1000 on all four cards, not one.
      .withBoard("p1", [
        character("saul", "OP17-089"),
        character("zoro", "OP17-095"),
      ])
      .withHand("p1", [instance("nami", "OP17-086")])
      // `bareTable()` puts all ten DON!! on the field active, so the pool is set
      // by putting nine back and resting four of them: five DON!! on the field
      // with four already spent, which is the turn-5 position the trace records.
      .withDonDeck("p1", 9)
      .withDon("p1", { rested: 4 })
      .build();

    // Both candidates are on the table: this is a choice between them, not an
    // absent action.
    const actions = game.legalActions();
    expect(
      actions.some(
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "nami",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (action) =>
          action.type === "attach-don" &&
          action.targetInstanceId === "p1-leader",
      ),
    ).toBe(true);

    const decided = await decideFor(game);
    expect(actions.find((action) => action.actionId === decided)).toMatchObject(
      { type: "attach-don", targetInstanceId: "p1-leader" },
    );
  });

  /**
   * The other side of that trade, from turn 6 of the same game.
   *
   * The aura is worth +1000 on each card the seat has, which is what makes it
   * beat the 1-cost body above. It does not beat a cost-6 Loki: the DON!!
   * diverted to the Leader is the sixth of six, so Loki is not deferred by a
   * decision, it is gone for the turn -- and its [On Play] K.O.s a Character
   * this seat otherwise has no answer to. The veto prices the play it displaces
   * instead of hiding every play, and this is the position that separates the
   * two.
   */
  it("plays the giant the last DON!! would price out, rather than the aura", async () => {
    const game = scenario()
      .decks(ELBAPH, OPPONENT)
      .seed("op13-sabo-aura-over-giant")
      .atTurn(6, { active: "p1" })
      .bareTable()
      .withLife("p1", copies(3, "OP17-086", "life"))
      .withLife("p2", copies(4, "OP17-086", "opp-life"))
      // One Character out, so the aura is worth +1000 on two cards -- and it is
      // the cost-16 body the Leader's "cost of 8 or more" clause asks for, so
      // the aura is live and the veto's own gate is open.
      .withBoard("p1", [character("saul", "OP17-089")])
      .withHand("p1", [
        instance("loki", "OP17-119"),
        instance("nami", "OP17-086"),
      ])
      // Six on the field, none spent: exactly Loki's cost, so one DON!! on the
      // Leader puts it out of reach.
      .withDonDeck("p1", 4)
      .withDon("p1", { rested: 0 })
      .build();

    const actions = game.legalActions();
    expect(
      actions.some(
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "loki",
      ),
    ).toBe(true);

    const decided = await decideFor(game);
    expect(actions.find((action) => action.actionId === decided)).toMatchObject(
      { type: "play-card", cardInstanceId: "loki" },
    );
  });
});

/**
 * What a Counter card is being traded against when the giant is the target.
 *
 * The field prices a protected Character at one Counter card, which is right
 * for a body that can simply be played again. An Elbaph giant is not that: it
 * is the only card in the list that makes other cards bigger, so its removal
 * takes 3000 off every conditional 2-drop at once and the 2-drops have no other
 * way to grow. The deck therefore names its own price, and only for the two
 * enablers.
 */
describe("the price of an Elbaph giant in Counter cards", () => {
  /** Saul under attack for more than one Counter card can answer. */
  function giantUnderAttack(board: ReturnType<typeof character>[]) {
    return (
      scenario()
        .decks(ELBAPH, OPPONENT)
        .seed("op13-sabo-giant-price")
        .atTurn(6, { active: "p2" })
        // Below the Leader's own "4 or more Life" clause, which otherwise vetoes
        // the Counter outright: above three Life this deck spends Life, not cards.
        .withLife("p1", 3)
        .withBoard("p1", board)
        .withBoard("p2", [character("attacker", "OP17-095")])
        .withHand("p1", [
          instance("nami-a", "OP17-086"),
          instance("nami-b", "OP17-086"),
        ])
        // Saul sits at 6000, so 7500 leaves a 1501 shortfall: two 1000-Counter
        // cards answer it and one does not. That is the whole question.
        .withActiveAttack(
          {
            attackerPlayerId: "p2",
            defenderPlayerId: "p1",
            attackerInstanceId: "attacker",
            targetInstanceId: "saul",
            attackPower: 7_500,
            counterPower: 0,
          },
          "counter",
        )
        .build()
    );
  }

  it("spends two Counter cards on the giant holding a 2-drop up", async () => {
    const game = giantUnderAttack([
      character("saul", "OP17-089"),
      character("zoro", "OP17-095"),
    ]);
    const actions = game.legalActions();
    expect(actions.some((action) => action.type === "counter")).toBe(true);

    const decided = await decideFor(game);
    expect(actions.find((action) => action.actionId === decided)).toMatchObject(
      { type: "counter" },
    );
  });

  it("pays the ordinary one-card price for a giant holding nothing up", async () => {
    // The neighbouring position: with no conditional 2-drop on the board the
    // giant is worth its own body and nothing more, so the raised price floors
    // back to the field's and the 1501 shortfall is not worth two cards.
    const game = giantUnderAttack([character("saul", "OP17-089")]);
    const actions = game.legalActions();
    expect(actions.some((action) => action.type === "counter")).toBe(true);

    const decided = await decideFor(game);
    expect(actions.find((action) => action.actionId === decided)).toMatchObject(
      { type: "pass" },
    );
  });
});
