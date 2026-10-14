/**
 * The format rules about attacking.
 *
 * One of the files `format-heuristics.ts` is the map of -- see that file for
 * what lives where. A test belongs beside the rule it drives.
 */
import { describe, expect, it } from "vitest";
import {
  createPressThroughBlockersModule,
  createLethalCloseModule,
  policyContext,
  St31RulesAgent,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";

/**
 * The turn the opponent has no Life left. Reported from a real game: the seat
 * stood in front of a defenceless Leader and spent the turn playing cards.
 */
describe("lethal close", () => {
  const module = createLethalCloseModule();
  // `bareTable()` empties the deck, so a Life *count* would deal nothing.
  const LIFE_CARDS = [
    instance("p1-life-1", "ST31-003"),
    instance("p1-life-2", "ST31-003"),
    instance("p1-life-3", "ST31-003"),
  ];

  /**
   * ST-31 facing a Leader with no Life and no Blocker, holding one Character
   * that is 1000 short of the Leader's power and one 5-cost body in hand. Two
   * DON!! is the whole budget, which is what makes the two uses of it exclusive:
   * the play spends both, and the attack needs one.
   */
  function defencelessLeader(
    options: { don?: number; blockers?: number } = {},
  ) {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("format-lethal-close")
      .bareTable()
      .atTurn(9, { active: "p1" })
      // 5000 power, so a 3000 Brook is one DON!! short of winning the battle.
      .withLeader("p2", "ST21-001")
      .withBoard("p1", [character("p1-brook", "ST31-003")])
      .withBoard(
        "p2",
        Array.from({ length: options.blockers ?? 0 }, (_, index) =>
          // ST31-002 Jinbe prints [Blocker]; the deck is irrelevant to whether
          // the body can absorb an attack.
          character(`p2-blocker-${index}`, "ST31-002"),
        ),
      )
      // Brook again: a 2-cost body, so the play and the attack want the same
      // two DON!! and only one of them can have it.
      .withHand("p1", [instance("p1-hand-brook", "ST31-003")])
      .withLife("p2", [])
      .withLife("p1", LIFE_CARDS)
      // The Leader has already swung, so the Character is the only attacker and
      // the one DON!! it needs has nowhere else useful to go.
      .withRestedLeader("p1")
      .withDonDeck("p1", 10 - (options.don ?? 2))
      .build();
    return observe(game.state, "p1");
  }

  const actionOf = (
    observation: GameObservation,
    type: LegalAction["type"],
  ) => {
    const action = observation.legalActions.find(
      (candidate) => candidate.type === type,
    );
    if (!action) throw new Error(`NOT_OFFERED: ${type}`);
    return action;
  };

  const vetoOf = (observation: GameObservation, act: LegalAction) =>
    module.veto?.(policyContext(observation), act);

  it("leaves the development plays alone, which was measured rather than argued", () => {
    // The obvious companion rule -- "spend no DON!! on a body while a kill is
    // live" -- is not here, and its absence is a result rather than an
    // oversight. See `createLethalCloseModule` for the two arms that measured
    // it and what each cost.
    const observation = defencelessLeader();
    expect(
      vetoOf(observation, actionOf(observation, "play-card")),
    ).toBeUndefined();
  });

  it("vetoes ending the turn while the attack is still reachable", () => {
    const observation = defencelessLeader();
    expect(vetoOf(observation, actionOf(observation, "pass"))).toContain(
      "still reachable this turn",
    );
  });

  it("expresses no preference between the attachments, only that one be made", () => {
    // Ranking the attachment that closes the attacker's battle lost twelve
    // games and won none; `createLethalCloseModule` records why. The module is
    // subtractive on `pass` alone, and leaves who gets the DON!! to the deck.
    const observation = defencelessLeader();
    const context = policyContext(observation);
    const attachments = observation.legalActions.filter(
      (action) => action.type === "attach-don",
    );
    expect(attachments.length).toBeGreaterThan(0);
    for (const action of attachments) {
      expect(module.rank?.(context, action)).toBeFalsy();
    }
  });

  it("says nothing once a Blocker means the swing is absorbed, not lethal", () => {
    const observation = defencelessLeader({ blockers: 1 });
    expect(
      vetoOf(observation, actionOf(observation, "play-card")),
    ).toBeUndefined();
    expect(vetoOf(observation, actionOf(observation, "pass"))).toBeUndefined();
  });

  it("says nothing when the DON!! on hand cannot close any battle", () => {
    const observation = defencelessLeader({ don: 0 });
    expect(vetoOf(observation, actionOf(observation, "pass"))).toBeUndefined();
  });

  it("leaves the opponent's own turn alone while they still hold Life", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("format-lethal-close-life")
      .bareTable()
      .atTurn(9, { active: "p1" })
      .withLeader("p2", "ST21-001")
      .withBoard("p1", [character("p1-brook", "ST31-003")])
      .withHand("p1", [instance("p1-hand-brook", "ST31-003")])
      .withLife("p2", [instance("p2-life-1", "ST32-002")])
      .withLife("p1", LIFE_CARDS)
      .withRestedLeader("p1")
      .withDonDeck("p1", 8)
      .build();
    const observation = observe(game.state, "p1");
    expect(
      vetoOf(observation, actionOf(observation, "play-card")),
    ).toBeUndefined();
  });

  /**
   * The turn that prompted the rule, driven end to end. Brook is 1000 short of
   * the Leader it faces and the seat holds two DON!!; before this module the
   * ladder attached neither to it and ended the turn.
   */
  it("closes the game rather than ending the turn one DON!! short", async () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("format-lethal-close-turn")
      .bareTable()
      .atTurn(9, { active: "p1" })
      .withLeader("p2", "ST21-001")
      .withBoard("p1", [character("p1-brook", "ST31-003")])
      .withHand("p1", [instance("p1-hand-brook", "ST31-003")])
      .withLife("p2", [])
      .withLife("p1", LIFE_CARDS)
      .withRestedLeader("p1")
      .withDonDeck("p1", 8)
      .build();

    const agent = new St31RulesAgent();
    for (let step = 0; step < 12; step += 1) {
      if (game.state.phase === "finished") break;
      if (game.state.activePlayer !== "p1") break;
      game.submit(await agent.chooseAction(observe(game.state, "p1")));
    }
    expect(game.state.phase).toBe("finished");
    expect(game.state.winner).toBe("p1");
  });
});

describe("pressing the Leader through the Blockers", () => {
  /**
   * The traced turn 10, at the decision after the first swing was blocked.
   *
   * p2 holds three bodies that each out-power the 5000 opposing Leader and a
   * Leader of its own at 8000, against one Blocker that can still block -- the
   * Jinbe rested itself blocking, which is what made it a `threat-removal`
   * target and what makes the K.O. a detour. Every DON!! is already on the
   * Leader, so the next decision is the attack rather than an attachment.
   */
  const pressTurn = (life: number) =>
    scenario()
      .decks(
        "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
        "(Red) Edward.Newgate - Official Feature Deck",
      )
      .seed("format-press-through")
      .atTurn(10, { active: "p2" })
      .bareTable()
      // Explicit cards: `bareTable()` empties the deck a Life count would be
      // dealt from.
      .withLife(
        "p1",
        Array.from({ length: life }, (_, index) =>
          instance(`life-${index}`, "ST26-002"),
        ),
      )
      .withBoard("p1", [
        // Blocked already this turn, so it cannot block again (CR 6-2-3).
        character("jinbe", "OP05-066", { rested: true }),
        character("blocker", "ST26-002"),
      ])
      .withBoard("p2", [
        character("ace", "OP16-118"),
        character("atmos", "OP17-002"),
        character("oden", "OP17-007"),
      ])
      .withDon("p2", { leaderAttached: 3 })
      .withDonDeck("p2", 7)
      .build();

  const attacksOn = (observation: GameObservation, target: string) =>
    observation.legalActions.filter(
      (action) =>
        action.type === "attack" && action.targetInstanceId === target,
    );

  it("offers both the removal and the press", () => {
    const observation = observe(pressTurn(2).state, "p2");
    expect(attacksOn(observation, "jinbe").length).toBeGreaterThan(0);
    expect(attacksOn(observation, "p1-leader").length).toBeGreaterThan(0);
  });

  it("vetoes the K.O. by an attacker that could hit the Leader instead", () => {
    const observation = observe(pressTurn(2).state, "p2");
    const module = createPressThroughBlockersModule();
    const context = policyContext(observation);
    const onJinbe = attacksOn(observation, "jinbe").find(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "p2-leader",
    )!;
    expect(module.veto?.(context, onJinbe)).toBeDefined();
    for (const press of attacksOn(observation, "p1-leader")) {
      expect(module.veto?.(context, press)).toBeUndefined();
    }
  });

  it("presses the Leader instead of K.O.ing the rested Blocker", async () => {
    const observation = observe(pressTurn(2).state, "p2");
    const action = await createRulesAgent(
      "(Red) Edward.Newgate - Official Feature Deck",
    ).chooseAction(observation);
    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "p1-leader",
    });
  });

  it("leaves the K.O. alone once the press no longer empties the Life", () => {
    // Four swings, one of which the standing Blocker absorbs, against 4 Life:
    // the press stops finishing the stack and the removal is a trade again.
    const observation = observe(pressTurn(4).state, "p2");
    const onJinbe = attacksOn(observation, "jinbe")[0]!;
    expect(
      createPressThroughBlockersModule().veto?.(
        policyContext(observation),
        onJinbe,
      ),
    ).toBeUndefined();
  });
});
