import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { character, covers, scenario } from "./support/index.js";

/**
 * `open-optcg-trace(36).jsonl`, turn 6, revision 40. The ST31 pilot swung with
 * its Leader into 8000 of Counter and was held, then attacked with ST21-014
 * Monkey.D.Luffy and gave its `[When Attacking]` rested DON!! to that same
 * Leader -- which was rested and would not attack again. Attached DON!! is
 * +1000 only on its controller's own turn and goes back at the next Refresh, so
 * the gift bought nothing.
 *
 * The rule is `rested-don-gift` in `format-heuristics.ts`, and it is registered
 * for every deck: the claim is about a rule of the game, not about ST31.
 */
describe("a rested DON!! gift goes where it can still be spent", () => {
  covers("ST21-014", "[When Attacking]");

  /** ST21-014 mid-attack, with the Leader already spent for the turn. */
  function afterTheLeaderSwung() {
    return scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red/Black) Sabo - Starter Deck 35",
      )
      .seed("rested-don-gift")
      .atTurn(7, { active: "p1" })
      .withBoard("p1", [character("rush-luffy", "ST21-014", { playedTurn: 5 })])
      .withRestedLeader("p1")
      .withDon("p1", { rested: 2 });
  }

  it("states on the offer that the choice hands over DON!!", () => {
    const game = afterTheLeaderSwung().build();
    game.play({ type: "attack", attackerInstanceId: "rush-luffy" });

    const offers = game
      .legalActions("p1")
      .filter(
        (action) =>
          action.type === "resolve-effect" && action.optionId !== "skip",
      );
    expect(offers.length).toBeGreaterThan(1);
    for (const offer of offers) {
      // `effectKind` reads "mechanic-choice" for every node the DSL raises, so
      // without this the choice is indistinguishable from a search or a K.O.
      expect(
        offer.type === "resolve-effect" ? offer.donGift : undefined,
      ).toEqual({ count: 1, from: "rested" });
    }
  });

  it("keeps it off a Leader that has already attacked", async () => {
    const game = afterTheLeaderSwung().build();
    game.play({ type: "attack", attackerInstanceId: "rush-luffy" });

    const agent = new RegistryRulesAgent("ST21-001");
    const chosen = await agent.chooseAction(observe(game.state, "p1"));

    // The attacker is rested too -- declaring rests it -- but its power is read
    // live when the battle resolves, so the DON!! lands on the declared hit.
    expect("optionId" in chosen ? chosen.optionId : undefined).toBe(
      "rush-luffy",
    );
  });

  it("keeps it off a Character that has already swung this turn", async () => {
    const game = afterTheLeaderSwung()
      .withBoard("p1", [
        character("rush-luffy", "ST21-014", { playedTurn: 5 }),
        // Swung earlier this turn, so it is rested and done. Attached DON!! is
        // +1000 only during its controller's turn (Comprehensive Rules 6-5-5-2)
        // and goes back to the cost area at the next Refresh (6-2-3), so a gift
        // here is worth nothing -- it is not banked for the opponent's turn.
        character("spent", "ST21-015", { rested: true, playedTurn: 5 }),
        character("ready", "OP10-011", { playedTurn: 5 }),
      ])
      .build();
    game.play({ type: "attack", attackerInstanceId: "rush-luffy" });

    const observation = observe(game.state, "p1");
    const agent = new RegistryRulesAgent("ST21-001");
    const chosen = await agent.chooseAction(observation);
    const optionId = "optionId" in chosen ? chosen.optionId : undefined;

    expect(optionId).not.toBe("spent");
    expect(optionId).not.toBe("p1-leader");
    expect(optionId).not.toBe("skip");
  });

  it("prefers the Character the gift turns into a viable attacker", async () => {
    const game = afterTheLeaderSwung()
      .withBoard("p1", [
        character("rush-luffy", "ST21-014", { playedTurn: 5 }),
        // 3000 against the 4000 Leader opposite: it cannot win a Leader attack
        // as it stands, and one DON!! is exactly what puts it level -- the
        // attacker wins ties. That is a whole extra swing, against +1000 on a
        // hit that was already connecting.
        character("sanji", "ST21-003", { playedTurn: 5 }),
      ])
      .build();
    game.play({ type: "attack", attackerInstanceId: "rush-luffy" });

    const observation = observe(game.state, "p1");
    // Stated, because the whole point of the case is the arithmetic around it.
    expect(observation.opponent.leader.currentPower).toBe(4000);

    const agent = new RegistryRulesAgent("ST21-001");
    const chosen = await agent.chooseAction(observation);

    expect("optionId" in chosen ? chosen.optionId : undefined).toBe("sanji");
  });
});

/**
 * `open-optcg-trace(15).jsonl`, turn 6, revision 35. The ST31 pilot activated
 * its Leader's "[Activate: Main] [Once Per Turn] Give up to 2 rested DON!!
 * cards to 1 of your Characters" and handed both to ST21-015 Roronoa Zoro,
 * which ST32-002 Kouzuki Oden had barred from resting -- and attacking rests
 * the attacker, so Zoro had no attack that turn at all. Brook, the turn's one
 * real attacker, went unfed and then did not attack.
 *
 * The rule is `chooseDonGiftTarget` in `st31-policy.ts`. Its sibling
 * `chooseRushFeed` reads the `attack` actions straight out of `legalActions`,
 * which is exact; this one runs one decision later, inside the `choose` the
 * activation opens, where the attacks are no longer offered -- and the stand-in
 * it used, "not rested", is true of three kinds of body that cannot attack.
 */
describe("the ST31 Leader's gift goes to a Character that can still attack", () => {
  covers("ST21-001", "[Activate: Main]");

  /** The Leader's ability live, one locked body and one free one. */
  function withOneLockedAttacker() {
    return (
      scenario()
        .decks(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Green) Shanks - Official Feature Deck",
        )
        .seed("st31-gift-locked")
        .atTurn(7, { active: "p1" })
        .withBoard("p1", [
          // 3000 power, and the only body with an attack this turn.
          character("brook", "ST31-003", { playedTurn: 2 }),
          // 5000 power, so the two DON!! would carry it past the opposing
          // Leader -- the reason the old ranking preferred it. ST32-002
          // Kouzuki Oden's [On Play] is what sets `cannotRestUntilTurn`
          // ("cannot be rested until the end of your opponent's next End
          // Phase"), and the engine will not offer it an attack.
          character("zoro", "ST21-015", {
            playedTurn: 4,
            cannotRestUntilTurn: 7,
          }),
        ])
        // The Leader's clause is gated `[DON!! x1]`, and one DON!! on it also
        // takes the "give the Leader its first DON!!" rung above out of play.
        .withGivenDon("p1", "p1-leader", 1)
        .withDon("p1", { rested: 2 })
    );
  }

  it("skips the Character an effect has barred from resting", async () => {
    const game = withOneLockedAttacker().build();
    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });

    const observation = observe(game.state, "p1");
    // Stated, because the case is the arithmetic that used to win: Zoro clears
    // this Leader with the gift and Brook does not. The turn number is stated
    // too, since both `cannotRestUntilTurn` above and the lock's expiry are
    // read against it.
    expect(observation.turn).toBe(7);
    expect(observation.opponent.leader.currentPower).toBe(5000);
    expect(
      observation.legalActions.some(
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "zoro",
      ),
    ).toBe(false);

    const agent = new RegistryRulesAgent("ST21-001");
    const chosen = await agent.chooseAction(observation);

    expect("optionId" in chosen ? chosen.optionId : undefined).toBe("brook");
  });

  it("still feeds a Character whose own [DON!! xN] Rush the gift switches on", async () => {
    const game = withOneLockedAttacker()
      .withBoard("p1", [
        character("brook", "ST31-003", { playedTurn: 2 }),
        // Summoning sick, but ST21-015 prints "[DON!! x2] This Character gains
        // [Rush]" -- and the Leader hands over exactly two. The bar the gift
        // itself lifts is the one case where a body with no attack right now is
        // still the right recipient.
        character("rush-zoro", "ST21-015", { playedTurn: 7 }),
      ])
      .build();
    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });

    const observation = observe(game.state, "p1");
    expect(
      observation.self.board.find((card) => card.instanceId === "rush-zoro")
        ?.summoningSick,
    ).toBe(true);

    const agent = new RegistryRulesAgent("ST21-001");
    const chosen = await agent.chooseAction(observation);

    expect("optionId" in chosen ? chosen.optionId : undefined).toBe(
      "rush-zoro",
    );
  });
});

/**
 * `open-optcg-trace(15).jsonl`, turn 2, revision 7. The OP-16 Ace pilot
 * activated OP16-021 Moby Dick on the game's second turn -- trashing the deck's
 * 1-cost "look at 3, add 1" Stage -- for one rested DON!! on its Leader, and
 * then passed. Comprehensive Rules 6-5-6-1 bars a battle on *either* player's
 * first turn, so there was no attack for the DON!! to be read by, and 6-5-5-2
 * gives power for given DON!! only during its controller's turn: the gift was
 * worth exactly zero and the Stage was gone.
 *
 * Two things had to change for the rule to be expressible. The activation said
 * nothing about what it bought -- `programRestedDonGift` is what puts `donGift`
 * on the offer -- and the recipient choice it opens comes one decision too
 * late, since the program trashes the Stage before it asks. The pilot's
 * "could this body still swing" reading was the other half: spelled out from
 * the observation it stopped at `rested`, which is true of every card on turn
 * 2, so `couldAttack` now reads the engine's own `couldAttackThisTurn`.
 */
describe("a Stage is not trashed for DON!! no attack can read", () => {
  covers("OP16-021", "[Activate: Main]");

  /** Moby Dick in play, on a turn whose owner may or may not battle. */
  function mobyDickInPlay(turn: number) {
    return (
      scenario()
        .decks(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          "(Red) Portgas.D.Ace - Official Feature Deck",
        )
        .seed("moby-dick-gift")
        // The Ace seat is p2, which is the seat whose turns are the even ones --
        // and turn 2, the second of the two on which no battle is legal, is the
        // position the rule is about.
        .atTurn(turn, { active: "p2" })
        .withStage("p2", { instanceId: "moby", cardNumber: "OP16-021" })
        .withDon("p2", { rested: 2 })
    );
  }

  it("states on the activation that the rested DON!! is all it buys", () => {
    const game = mobyDickInPlay(2).build();

    const activation = game.action({
      type: "activate-main",
      optionId: "mechanic-main:moby",
    });

    expect(
      activation.type === "activate-main" ? activation.donGift : undefined,
      // `priced`, because the program pays with the Stage: that is what makes
      // declining strictly better than a gift nothing can read, where a free
      // one would be the same nothing either way.
    ).toEqual({ count: 1, from: "rested", priced: true });
    // No recipient: the `give-rested-don` node picks one when it resolves, and
    // that is what separates this from OP15-058's targeted gift.
    expect(
      activation.type === "activate-main"
        ? activation.targetInstanceId
        : undefined,
    ).toBeUndefined();
  });

  it("keeps the Stage on a turn neither player may battle", async () => {
    const game = mobyDickInPlay(2).build();

    const observation = observe(game.state, "p2");
    // Stated, because it is the whole case: the engine offers no attack at all
    // on turn 2, so nothing can convert the gift into power.
    expect(observation.turn).toBe(2);
    expect(observation.self.leader.couldAttack).toBe(false);
    expect(
      observation.legalActions.some((action) => action.type === "attack"),
    ).toBe(false);

    // Played out rather than asked once: the pilot reached the activation in
    // the trace only after its plays, so a single decision proves nothing.
    const agent = new RegistryRulesAgent("OP16-001");
    for (let step = 0; step < 40; step += 1) {
      const chosen = await agent.chooseAction(observe(game.state, "p2"));
      const applied = game.submit(
        game.action((action) => action.actionId === chosen.actionId),
      );
      if (applied.activePlayer !== "p2") break;
    }

    expect(game.state.players.p2.stage?.cardNumber).toBe("OP16-021");
  });

  it("still cashes it in when a body can spend the DON!!", async () => {
    const game = mobyDickInPlay(6)
      .withBoard("p2", [character("thatch", "OP16-011", { playedTurn: 3 })])
      .build();

    const observation = observe(game.state, "p2");
    expect(observation.self.leader.couldAttack).toBe(true);

    const agent = new RegistryRulesAgent("OP16-001");
    const activation = observation.legalActions.find(
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-main:moby",
    );

    // The rule only forbids; which of the turn's actions the ladder takes first
    // is not its business, so this asserts the offer survives the veto.
    expect(activation).toBeDefined();
    const vetoed = await agent
      .chooseAction(observation)
      .then(() => false)
      .catch(() => true);
    expect(vetoed).toBe(false);
  });
});
