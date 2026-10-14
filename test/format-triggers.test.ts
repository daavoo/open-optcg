/**
 * The format rules about [Trigger]s and turn-scoped effects.
 *
 * One of the files `format-heuristics.ts` is the map of -- see that file for
 * what lives where. A test belongs beside the rule it drives.
 */
import { describe, expect, it } from "vitest";
import {
  createDeadBuffTriggerModule,
  createDeadKeywordGrantModule,
  createDeadTriggerModule,
  createInertTriggerModule,
  createTriggerDebuffTargetModule,
  createMainDebuffTargetModule,
  policyContext,
  tactics,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  character,
  instance,
  scenario,
  setTurnPlayer,
} from "./support/index.js";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import { blankState, view } from "./format-support.js";

describe("dead Trigger detection", () => {
  /**
   * OP04-016's Trigger is a pure "during this turn" debuff, so it is worthless
   * once the opponent has nothing left to attack with. The card is put in hand
   * so that `cardFacts` can see it -- the rule reads printed text, and the facts
   * dictionary only carries cards the viewer is entitled to identify.
   */
  function triggerState(options: {
    opponentLeaderRested: boolean;
  }): GameObservation {
    const state = blankState();
    state.players.p1.hand = [
      { instanceId: "p1-trigger", cardNumber: "OP04-016" },
    ];
    state.players.p2.leaderRested = options.opponentLeaderRested;
    return view(state);
  }

  const action = (optionId: string, sourceCardNumber = "OP04-016") =>
    ({
      actionId: `r0:trigger:${optionId}`,
      type: "resolve-trigger",
      optionId,
      sourceCardNumber,
      summary: "test",
    }) as const;

  const vetoOf = (observation: GameObservation, act: LegalAction) =>
    createDeadTriggerModule().veto?.(policyContext(observation), act);

  it("declines a debuff Trigger once the opponent has no attack left", () => {
    const observation = triggerState({ opponentLeaderRested: true });
    expect(tactics(observation).incomingLeaderAttacks).toBe(0);
    expect(vetoOf(observation, action("p2-leader"))).toBeDefined();
  });

  it("keeps the debuff available while an attack could still be blunted", () => {
    const observation = triggerState({ opponentLeaderRested: false });
    expect(tactics(observation).incomingLeaderAttacks).toBe(1);
    expect(vetoOf(observation, action("p2-leader"))).toBeUndefined();
  });

  it("never removes the option to take the card into hand", () => {
    // Vetoing every branch would leave the decision with nothing to choose.
    const observation = triggerState({ opponentLeaderRested: true });
    expect(vetoOf(observation, action("skip"))).toBeUndefined();
  });

  it("leaves a Trigger that also does durable work alone", () => {
    // OP16-119 is the case the exclusion clause exists for: its Trigger reads
    // "[printed text omitted -- pnpm card:text OP16-119]". Every surface marker of a temporary
    // debuff is present, but the K.O. outlives the turn, so a quiet board is no
    // reason to decline it.
    const state = blankState();
    state.players.p1.hand = [
      { instanceId: "p1-trigger", cardNumber: "OP16-119" },
    ];
    state.players.p2.leaderRested = true;
    const observation = view(state);
    const rules = observation.cardFacts["OP16-119"]?.rules;
    expect(rules?.hasTrigger).toBe(true);
    // A debuff for the turn that also does durable work is not dead weight.
    expect(rules?.triggerIsDeadWeightDebuff).toBe(false);
    expect(
      vetoOf(observation, action("p1-trigger", "OP16-119")),
    ).toBeUndefined();
  });

  it("ignores a Trigger it cannot read facts for", () => {
    const observation = triggerState({ opponentLeaderRested: true });
    expect(observation.cardFacts["OP14-104"]).toBeUndefined();
    expect(vetoOf(observation, action("p1-other", "OP14-104"))).toBeUndefined();
  });
});

describe("aiming a debuff Trigger", () => {
  /**
   * The opposing Leader has already swung and one of its two Characters has
   * too. OP04-016's debuff expires at the end of this turn, so only the body
   * still holding its attack can be made worse by it.
   */
  function debuffTargets(): GameObservation {
    const state = blankState();
    state.players.p1.hand = [
      { instanceId: "p1-trigger", cardNumber: "OP04-016" },
    ];
    state.players.p2.leaderRested = true;
    state.players.p2.board = [
      character("spent", "OP12-023", { rested: true }),
      character("live", "OP12-023"),
    ];
    return view(state);
  }

  const target = (optionId: string) =>
    ({
      actionId: `r0:trigger:${optionId}`,
      type: "resolve-trigger",
      optionId,
      sourceCardNumber: "OP04-016",
      targetInstanceId: optionId,
      summary: "test",
    }) as const;

  const scoreOf = (observation: GameObservation, act: LegalAction) =>
    createTriggerDebuffTargetModule().rankAmong?.(
      policyContext(observation),
      act,
    );

  const numeric = (value: ReturnType<typeof scoreOf>): number | undefined =>
    typeof value === "number" ? value : value?.score;

  it("ranks the body that can still attack above the ones that cannot", () => {
    const observation = debuffTargets();
    const live = numeric(scoreOf(observation, target("live")));
    expect(live).toBeGreaterThan(
      numeric(scoreOf(observation, target("spent"))) ?? 0,
    );
    expect(live).toBeGreaterThan(
      numeric(scoreOf(observation, target("p2-leader"))) ?? 0,
    );
  });

  it("scores the spent targets rather than staying silent about them", () => {
    // `rankAmong` drops a candidate it scored at zero with no reason, which
    // would leave the spent bodies competing on offer order instead of losing
    // to the live one.
    const observation = debuffTargets();
    expect(numeric(scoreOf(observation, target("spent")))).toBeLessThan(0);
    expect(numeric(scoreOf(observation, target("p2-leader")))).toBeLessThan(0);
  });

  it("says nothing about the branch that takes the card into hand", () => {
    const observation = debuffTargets();
    expect(
      scoreOf(observation, {
        actionId: "r0:trigger:skip",
        type: "resolve-trigger",
        optionId: "skip",
        sourceCardNumber: "OP04-016",
        summary: "test",
      }),
    ).toBeUndefined();
  });

  it("leaves a Trigger that does durable work to be aimed by the deck", () => {
    // The same narrowness as `dead-trigger`: a debuff bundled with a K.O. buys
    // something that outlives the turn, so which body carries it is not this
    // rule's call.
    const observation = debuffTargets();
    expect(
      scoreOf(observation, {
        actionId: "r0:trigger:live",
        type: "resolve-trigger",
        optionId: "live",
        sourceCardNumber: "OP16-119",
        targetInstanceId: "live",
        summary: "test",
      }),
    ).toBeUndefined();
  });
});

describe("inert trigger detection", () => {
  /**
   * Traced from a real game: p2 at 2 Life took a Leader hit, flipped OP14-110
   * Dr. Hogback and activated it. The Trigger plays a {Thriller Bark Pirates}
   * Character of cost 4 or less from the trash, and that trash held Newgate,
   * Kikunojo, Hiyori and Borsalino -- no Thriller Bark body at all. Hogback
   * went to the trash resolving nothing, and the reveal activation performs
   * named the Life card to the attacker for free.
   *
   * The Trigger stays on offer: `test/op16-nami.test.ts` pins that, and OP13-106
   * Conney reads the activation itself. The fix is the report, not a withheld
   * action.
   */
  function hogbackFlip(trash: ReturnType<typeof instance>[]) {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Blue/Yellow) Nami - Official Feature Deck",
      )
      .seed("format-inert-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [
        character("p1-attacker", "OP11-003", { playedTurn: 1 }),
      ])
      .withLife("p2", [instance("p2-life-hogback", "OP14-110")])
      .withTrash("p2", trash)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "p1-attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.pass();
    expect(game.state.phase).toBe("trigger");
    return game;
  }

  /** The trash the trace recorded, none of it Thriller Bark. */
  const TRACED_TRASH = [
    instance("p2-newgate", "OP13-042"),
    instance("p2-kikunojo", "OP06-104"),
    instance("p2-hiyori", "OP06-106"),
    instance("p2-borsalino", "EB04-058"),
  ];

  const activationOf = (observation: GameObservation) => {
    const action = observation.legalActions.find(
      (candidate) =>
        candidate.type === "resolve-trigger" &&
        candidate.optionId === "activate",
    );
    if (action?.type !== "resolve-trigger") throw new Error("NOT_OFFERED");
    return action;
  };

  const vetoOf = (observation: GameObservation, act: LegalAction) =>
    createInertTriggerModule().veto?.(policyContext(observation), act);

  it("flags the Trigger whose trash holds nothing it can play", () => {
    const observation = observe(hogbackFlip(TRACED_TRASH).state, "p2");
    expect(activationOf(observation).selectsNothing).toBe(true);
  });

  it("leaves the flag off once a Thriller Bark body is in the trash", () => {
    const observation = observe(
      hogbackFlip([...TRACED_TRASH, instance("p2-kumacy", "OP14-102")]).state,
      "p2",
    );
    expect(activationOf(observation).selectsNothing).toBeUndefined();
  });

  it("never flags the option that keeps the card", () => {
    // Vetoing every flagged action must leave the decision an option, and
    // `skip` is the one this rule steers towards.
    const observation = observe(hogbackFlip(TRACED_TRASH).state, "p2");
    const skip = observation.legalActions.find(
      (candidate) =>
        candidate.type === "resolve-trigger" && candidate.optionId === "skip",
    );
    expect(skip).toBeDefined();
    expect(vetoOf(observation, skip!)).toBeUndefined();
  });

  it("vetoes the flagged activation and nothing else", () => {
    const dead = observe(hogbackFlip(TRACED_TRASH).state, "p2");
    expect(vetoOf(dead, activationOf(dead))).toBeDefined();
    const live = observe(
      hogbackFlip([...TRACED_TRASH, instance("p2-kumacy", "OP14-102")]).state,
      "p2",
    );
    expect(vetoOf(live, activationOf(live))).toBeUndefined();
  });

  it("takes the Life card into hand instead, through the deck's own agent", async () => {
    // End to end, because the fault was in `chooseGenericTrigger`'s
    // fall-through -- "Resolve the available beneficial Trigger." -- which this
    // deck reaches with no Trigger rule of its own.
    const game = hogbackFlip(TRACED_TRASH);
    const observation = observe(game.state, "p2");
    const action = await createRulesAgent(
      "(Blue/Yellow) Nami - Official Feature Deck",
    ).chooseAction(observation);
    expect(action).toMatchObject({ type: "resolve-trigger", optionId: "skip" });

    game.submit(action);
    expect(game.state.players.p2.hand).toContainEqual(
      expect.objectContaining({ cardNumber: "OP14-110" }),
    );
  });
});

describe("dead self-buff trigger detection", () => {
  /**
   * Traced from a real game (`open-optcg-trace(4).jsonl`, turn 8): the OP-17
   * Newgate seat took the attacker's third and final attack, fell to 0 Life,
   * and flipped OP17-019, whose [Trigger] is +1000 to its own Leader until end
   * of turn. Nothing was left to attack into it, so the boost expired unread
   * and a card that declining would have banked went to the trash.
   *
   * The two positions differ only in whether the attacking Leader has already
   * swung, which is the whole of the rule.
   */
  function newgateFlip(options: { attackerHasMoreAttacks: boolean }) {
    let builder = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Edward.Newgate - Official Feature Deck",
      )
      .seed("format-dead-buff-trigger")
      .bareTable()
      .atTurn(8, { active: "p1" })
      .withBoard("p1", [
        character("p1-attacker", "OP11-003", { playedTurn: 6 }),
      ])
      .withLife("p2", [instance("p2-life-newgate", "OP17-019")]);
    if (!options.attackerHasMoreAttacks)
      builder = builder.withRestedLeader("p1");
    const game = builder.build();
    game.play({
      type: "attack",
      attackerInstanceId: "p1-attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.pass();
    expect(game.state.phase).toBe("trigger");
    return game;
  }

  const activationOf = (observation: GameObservation) => {
    const action = observation.legalActions.find(
      (candidate) =>
        candidate.type === "resolve-trigger" &&
        candidate.optionId === "activate",
    );
    if (action?.type !== "resolve-trigger") throw new Error("NOT_OFFERED");
    return action;
  };

  const vetoOf = (observation: GameObservation, act: LegalAction) =>
    createDeadBuffTriggerModule().veto?.(policyContext(observation), act);

  it("reports a Trigger whose whole effect is a boost on the resolver's own side", () => {
    const observation = observe(
      newgateFlip({ attackerHasMoreAttacks: false }).state,
      "p2",
    );
    expect(activationOf(observation).selfPowerForTheTurn).toBe(true);
  });

  it("vetoes the boost once the attacker has nothing left to swing", () => {
    const observation = observe(
      newgateFlip({ attackerHasMoreAttacks: false }).state,
      "p2",
    );
    expect(vetoOf(observation, activationOf(observation))).toBeDefined();
  });

  it("leaves it alone while an attack is still coming", () => {
    // The fact on the action is unchanged -- it is a property of the card --
    // and it is the board reading that differs.
    const observation = observe(
      newgateFlip({ attackerHasMoreAttacks: true }).state,
      "p2",
    );
    expect(activationOf(observation).selfPowerForTheTurn).toBe(true);
    expect(vetoOf(observation, activationOf(observation))).toBeUndefined();
  });

  it("never vetoes the option that keeps the card", () => {
    const observation = observe(
      newgateFlip({ attackerHasMoreAttacks: false }).state,
      "p2",
    );
    const skip = observation.legalActions.find(
      (candidate) =>
        candidate.type === "resolve-trigger" && candidate.optionId === "skip",
    );
    expect(skip).toBeDefined();
    expect(vetoOf(observation, skip!)).toBeUndefined();
  });

  it("banks the Life card instead, through the deck's own agent", async () => {
    // End to end, because the fault was `chooseGenericTrigger`'s fall-through
    // -- "Resolve the available beneficial Trigger." -- which takes the first
    // non-skip option whatever it does.
    const game = newgateFlip({ attackerHasMoreAttacks: false });
    const action = await createRulesAgent(
      "(Red) Edward.Newgate - Official Feature Deck",
    ).chooseAction(observe(game.state, "p2"));
    expect(action).toMatchObject({ type: "resolve-trigger", optionId: "skip" });

    game.submit(action);
    expect(game.state.players.p2.hand).toContainEqual(
      expect.objectContaining({ cardNumber: "OP17-019" }),
    );
  });
});

describe("dead keyword grant detection", () => {
  /**
   * OP17-055: "[printed text omitted -- pnpm card:text OP17-055]" Traced against ST31
   * cast on turn 1 as the starting player, into an empty board.
   */
  function xebecHolding(
    opponentBoard: ReturnType<typeof character>[],
    options: { leaderRested?: boolean } = {},
  ) {
    const game = scenario()
      .decks(
        "(Blue) Rocks.D.Xebec - Official Feature Deck",
        "(Purple) Charlotte Katakuri - Starter Deck 34",
      )
      .seed("format-dead-grant")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withDon("p1", { active: 2 })
      .withHand("p1", [instance("p1-event", "OP17-055")])
      .withBoard("p2", opponentBoard)
      .build();
    if (options.leaderRested) game.state.players.p1.leaderRested = true;
    return game;
  }

  const activationOf = (observation: GameObservation) => {
    const action = observation.legalActions.find(
      (candidate) =>
        candidate.type === "activate-main" &&
        candidate.sourceCardNumber === "OP17-055",
    );
    if (action?.type !== "activate-main") throw new Error("NOT_OFFERED");
    return action;
  };

  const vetoOf = (observation: GameObservation, act: LegalAction) =>
    createDeadKeywordGrantModule().veto?.(policyContext(observation), act);

  it("reports what the activation grants, and that it expires", () => {
    const observation = observe(xebecHolding([]).state, "p1");
    expect(activationOf(observation).grants).toEqual({
      keyword: "Unblockable",
      expiresThisTurn: true,
    });
  });

  it("declines the grant when nothing could block it", () => {
    const observation = observe(xebecHolding([]).state, "p1");
    expect(vetoOf(observation, activationOf(observation))).toBeDefined();
  });

  it("declines the grant when no attack this turn can read it", () => {
    // The other half, and the one that catches the traced turn-1 cast: the
    // opponent does have a Blocker, so the Blocker test alone would allow it.
    const observation = observe(
      xebecHolding([character("p2-blocker", "OP17-042")], {
        leaderRested: true,
      }).state,
      "p1",
    );
    expect(
      observation.legalActions.some((action) => action.type === "attack"),
    ).toBe(false);
    expect(vetoOf(observation, activationOf(observation))).toBeDefined();
  });

  it("keeps the grant when a Blocker stands between an attacker and the hit", () => {
    const observation = observe(
      xebecHolding([character("p2-blocker", "OP17-042")]).state,
      "p1",
    );
    expect(vetoOf(observation, activationOf(observation))).toBeUndefined();
  });

  it("ignores a rested Blocker, which could not have blocked anyway", () => {
    const observation = observe(
      xebecHolding([character("p2-blocker", "OP17-042", { rested: true })])
        .state,
      "p1",
    );
    expect(vetoOf(observation, activationOf(observation))).toBeDefined();
  });

  it("plays something else rather than burning the Event for nothing", async () => {
    // End to end through the registry, since the fault was in the generic
    // fall-through -- "Use an available Main-phase effect."
    const observation = observe(xebecHolding([]).state, "p1");
    const action = await createRulesAgent(
      "(Blue) Rocks.D.Xebec - Official Feature Deck",
    ).chooseAction(observation);
    expect(action.type).not.toBe("activate-main");
  });
});

describe("aiming a Main-phase debuff", () => {
  /**
   * The position from the reported game, with the powers kept the way round
   * that makes the mistake: the active body is the *bigger* one, so the
   * generic "strongest target" answer picks the target the debuff cannot
   * reach.
   */
  function mainDebuffTargets(): GameObservation {
    const state = blankState();
    state.players.p2.board = [
      character("spent", "OP12-023", { rested: true }),
      character("active", "OP12-005"),
      character("blocker", "OP12-027"),
    ];
    return view(state);
  }

  const target = (instanceId: string, expiresThisTurn = true) =>
    ({
      actionId: `r0:effect:${instanceId}`,
      type: "resolve-effect",
      optionId: instanceId,
      effectKind: "mechanic-choice",
      sourceCardNumber: "OP13-021",
      option: {
        kind: "card",
        owner: "opponent",
        zone: "board",
        card: { instanceId, cardNumber: "OP12-023" },
      },
      modifiesPower: { amount: -2000, expiresThisTurn },
      summary: "test",
    }) as unknown as LegalAction;

  const scoreOf = (observation: GameObservation, act: LegalAction) =>
    createMainDebuffTargetModule().rankAmong?.(policyContext(observation), act);

  const numeric = (value: ReturnType<typeof scoreOf>): number | undefined =>
    typeof value === "number" ? value : value?.score;

  it("ranks a rested body above a larger active one", () => {
    const observation = mainDebuffTargets();
    expect(numeric(scoreOf(observation, target("spent")))).toBeGreaterThan(
      numeric(scoreOf(observation, target("active"))) ?? 0,
    );
  });

  it("ranks an active [Blocker] with the bodies an attack can reach", () => {
    const observation = mainDebuffTargets();
    expect(
      observation.opponent.board.find((card) => card.instanceId === "blocker")
        ?.blocker,
    ).toBe(true);
    expect(numeric(scoreOf(observation, target("blocker")))).toBeGreaterThan(
      numeric(scoreOf(observation, target("active"))) ?? 0,
    );
  });

  it("scores the unreachable body rather than staying silent about it", () => {
    // `rankAmong` drops a candidate it scored at zero, which would leave the
    // active body competing on offer order instead of losing to the rested one.
    const observation = mainDebuffTargets();
    expect(numeric(scoreOf(observation, target("active")))).toBeLessThan(0);
  });

  it("says nothing about a debuff that outlives the turn", () => {
    // A debuff still on the board when the opponent attacks is read by their
    // battles too, so which body carries it is not this rule's call.
    const observation = mainDebuffTargets();
    expect(scoreOf(observation, target("active", false))).toBeUndefined();
  });

  it("says nothing on the opponent's turn", () => {
    const state = blankState();
    setTurnPlayer(state, "p2");
    state.players.p2.board = [character("active", "OP12-005")];
    expect(scoreOf(view(state), target("active"))).toBeUndefined();
  });

  it("leaves a debuff raised inside a battle to the rule that owns it", () => {
    // `chooseBattleDebuffTarget` aims that one at the card in the battle, and
    // narrowing ahead of it would hide exactly that card.
    const state = blankState();
    state.players.p2.board = [
      character("spent", "OP12-023", { rested: true }),
      character("active", "OP12-005"),
    ];
    const observation = {
      ...view(state),
      activeBattle: {
        attackerInstanceId: "p1-leader",
        targetInstanceId: "active",
      },
    } as unknown as GameObservation;
    expect(scoreOf(observation, target("active"))).toBeUndefined();
  });
});
