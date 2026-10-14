/**
 * The format rules about DON!!.
 *
 * One of the files `format-heuristics.ts` is the map of -- see that file for
 * what lives where. A test belongs beside the rule it drives.
 */
import { describe, expect, it } from "vitest";
import {
  createDeadAttachmentModule,
  createPreCombatAttachmentModule,
  createDeadOpeningPlayModule,
  createDonReservationModule,
  createInertActivationModule,
  createDeadRampModule,
  createCappedRampModule,
  createDeadRampTriggerModule,
  policyContext,
  tactics,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import { blankState, view } from "./format-support.js";

describe("DON!! reservation arithmetic", () => {
  it("reports a stranded play when the pool exactly covers the cheapest card", () => {
    const state = blankState();
    state.players.p1.activeDon = ["don-1"];
    state.players.p1.hand = [
      { instanceId: "nami", cardNumber: "OP01-016", faceUp: false },
    ];

    const t = tactics(view(state));

    expect(t.cheapestAffordablePlay).toBe(1);
    expect(t.attachmentBlocksAllDevelopment).toBe(true);
  });

  it("clears once there is slack in the pool", () => {
    const state = blankState();
    state.players.p1.activeDon = ["don-1", "don-2"];
    state.players.p1.hand = [
      { instanceId: "nami", cardNumber: "OP01-016", faceUp: false },
    ];

    const t = tactics(view(state));

    expect(t.don).toBe(2);
    // One DON!! to spare, so an attachment no longer costs the play. This is the
    // case that keeps `[DON!! x1]` Leaders (ST31, ST35) from being starved.
    expect(t.attachmentBlocksAllDevelopment).toBe(false);
  });

  it("reports nothing to strand with an empty hand", () => {
    const state = blankState();
    state.players.p1.activeDon = ["don-1"];

    const t = tactics(view(state));

    expect(t.cheapestAffordablePlay).toBe(0);
    expect(t.attachmentBlocksAllDevelopment).toBe(false);
  });
});

describe("spending DON!! on a Character that cannot use it", () => {
  /**
   * A main phase with one small body of the viewer's own and one opposing
   * Character, so both halves of the rule have a candidate: an attachment that
   * buys no battle, and one that buys a battle it can win.
   */
  function attachmentTurn(selfBoard: ReturnType<typeof character>[]) {
    return scenario()
      .decks(
        "(Purple) Charlotte Katakuri - Starter Deck 34",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("format-dead-attachment")
      .bareTable()
      .atTurn(6, { active: "p1" })
      .withBoard("p1", selfBoard)
      .withBoard("p2", [character("their-body", "ST32-005", { rested: true })])
      .build();
  }

  const vetoOf = (
    game: ReturnType<typeof attachmentTurn>,
    instanceId: string,
  ) => {
    const observation = observe(game.state, "p1");
    const attachment = observation.legalActions.find(
      (action) =>
        action.type === "attach-don" && action.targetInstanceId === instanceId,
    );
    expect(attachment).toBeDefined();
    return createDeadAttachmentModule().veto?.(
      policyContext(observation),
      attachment!,
    );
  };

  it("vetoes the DON!! on a body that loses every attack it is offered", () => {
    // Brulee is a 1-cost 2000. One DON!! makes it 3000, which still bounces off
    // both the 5000 Leader and -- by one point, since the attacker wins ties --
    // is only enough for the 2000 body. Two DON!! went onto exactly this
    // Character in the traced game, and it then ended the turn without
    // attacking.
    const game = attachmentTurn([character("brulee", "ST34-003")]);
    // Posed against a rested 2000 body, +1000 *does* buy that battle, so the
    // rule must leave it alone; the hopeless case is the Leader-only board.
    expect(vetoOf(game, "brulee")).toBeUndefined();

    // Leader-only board: Brulee is 3000 short of the 5000 Leader, so the veto
    // turns on how many DON!! the turn can still put under it. Two leaves it
    // short however they are spent; three reach, and the attacker wins ties.
    const leaderOnly = (activeDon: number) =>
      scenario()
        .decks(
          "(Purple) Charlotte Katakuri - Starter Deck 34",
          "(Green) Roronoa Zoro - Starter Deck 32",
        )
        .seed(`format-dead-attachment-2-${activeDon}`)
        .bareTable()
        .atTurn(6, { active: "p1" })
        .withDonDeck("p1", 10 - activeDon)
        .withBoard("p1", [character("brulee", "ST34-003")])
        .build();

    expect(vetoOf(leaderOnly(2), "brulee")).toContain("buys no battle");
    expect(vetoOf(leaderOnly(3), "brulee")).toBeUndefined();
  });

  it("leaves the DON!! that reaches a winning battle alone", () => {
    // Pudding is a 4000 [Blocker]; one DON!! makes it 5000, which is exactly
    // what a 5000 Leader loses to.
    const game = attachmentTurn([character("pudding", "EB03-035")]);

    expect(vetoOf(game, "pudding")).toBeUndefined();
  });

  it("leaves the Leader alone", () => {
    // A Leader attachment is how a Leader hit is made to cost another Counter
    // card; `don-threshold` prices those.
    const game = attachmentTurn([character("brulee", "ST34-003")]);

    expect(vetoOf(game, "p1-leader")).toBeUndefined();
  });

  it("vetoes the DON!! on a body that is offered no attack at all", () => {
    // Played this turn -- `atTurn(6)` leaves the engine on turn 7 -- so
    // summoning sickness leaves it with no attack to make and the +1000 expires
    // unused.
    const game = scenario()
      .decks(
        "(Purple) Charlotte Katakuri - Starter Deck 34",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("format-dead-attachment-3")
      .bareTable()
      .atTurn(6, { active: "p1" })
      .withBoard("p1", [character("fresh", "EB03-035", { playedTurn: 7 })])
      .build();

    expect(vetoOf(game, "fresh")).toContain("buys no battle");
  });
});

describe("dead opening play", () => {
  /**
   * A Robin opening with one card in hand and the DON!! to cast it, which is
   * the position the trace this rule comes from reached: `chooseGenericRules`
   * develops the highest-cost legal card, and on turn 2 that was OP09-106
   * Nico Olvia, a singleton in the Robin list the trace was recorded on. The
   * card is used here for its text rather than its slot: its `[On Play]` is
   * the shape the rule is about, whichever list it is drawn from.
   */
  function openingHand(turn: number, active: "p1" | "p2", cardNumber: string) {
    return scenario()
      .decks(
        "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("format-dead-opening-play")
      .bareTable()
      .atTurn(turn, { active })
      .withHand(active, [instance("olvia", cardNumber)])
      .build();
  }

  const vetoOf = (
    game: ReturnType<typeof openingHand>,
    viewer: "p1" | "p2",
    instanceId: string,
  ) => {
    const observation = observe(game.state, viewer);
    const play = observation.legalActions.find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === instanceId,
    );
    expect(play).toBeDefined();
    return createDeadOpeningPlayModule().veto?.(
      policyContext(observation),
      play!,
    );
  };

  it("vetoes the turn-2 play whose [On Play] no battle can read", () => {
    // OP09-106 Nico Olvia: 0 power, 2000 Counter, and an [On Play] that is
    // only "+3000 power during this turn" on a [Nico Robin]. Turn 2 offers no
    // attack at all (CR 6-5-6-1), so the boost is spent on nothing and the body
    // left behind loses every battle it is ever put in.
    const game = openingHand(2, "p2", "OP09-106");

    expect(vetoOf(game, "p2", "olvia")).toContain("expires unread");
  });

  it("vetoes it on turn 1 as well", () => {
    const game = openingHand(1, "p1", "OP09-106");

    expect(vetoOf(game, "p1", "olvia")).toContain("expires unread");
  });

  it("leaves the play alone once a battle exists", () => {
    // Turn 3 is the first turn `couldAttackThisTurn` returns true for anything,
    // and from there the +3000 is a Leader hit the defender pays another
    // Counter card for.
    const game = openingHand(3, "p1", "OP09-106");

    expect(vetoOf(game, "p1", "olvia")).toBeUndefined();
  });

  it("leaves a body that can win a battle alone", () => {
    // OP08-051 Buckin prints the same dead [On Play] on 2000 power. The rider
    // goes unread on turn 2 either way, but a 2000-power body is ordinary
    // development and whether to make it is the ladder's call, not this rule's.
    const game = openingHand(2, "p2", "OP08-051");

    expect(vetoOf(game, "p2", "olvia")).toBeUndefined();
  });
});

describe("pre-combat attachment", () => {
  /**
   * An opening turn with a DON!! to spend and nothing worth spending it on,
   * which is the position `chooseGenericRules` answers with "Convert unused
   * DON!! into attack power". `bareTable` is what makes it that position: with
   * a hand the seat would develop instead, and this rule would never be asked.
   */
  function openingTurn(turn: number, active: "p1" | "p2") {
    return scenario()
      .decks(
        "(Purple) Charlotte Katakuri - Starter Deck 34",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("format-pre-combat-attachment")
      .bareTable()
      .atTurn(turn, { active })
      .build();
  }

  const vetoOf = (
    game: ReturnType<typeof openingTurn>,
    viewer: "p1" | "p2",
    instanceId: string,
  ) => {
    const observation = observe(game.state, viewer);
    const attachment = observation.legalActions.find(
      (action) =>
        action.type === "attach-don" && action.targetInstanceId === instanceId,
    );
    expect(attachment).toBeDefined();
    return createPreCombatAttachmentModule().veto?.(
      policyContext(observation),
      attachment!,
    );
  };

  it("vetoes the turn-1 Leader attachment no battle can ever read", () => {
    // The DON!! returns at p1's next Refresh, on turn 3. Between now and then
    // the only turn is p2's turn 2, and neither turn contains a battle, so the
    // +1000 is read by nothing at all.
    const game = openingTurn(1, "p1");

    expect(vetoOf(game, "p1", "p1-leader")).toContain(
      "Neither player can battle",
    );
  });

  it("vetoes it on turn 2 as well", () => {
    // Turn 2 is the half worth pinning, because the DON!! card *is* still under
    // the Leader during turn 3 (CR 6-2-3) and the boost is not (6-5-5-2): the
    // attachment buys no defence and spends the DON!! through the one turn a
    // [Counter] Event would have needed it active.
    const game = openingTurn(2, "p2");

    expect(vetoOf(game, "p2", "p2-leader")).toContain(
      "Neither player can battle",
    );
  });

  it("leaves the Leader alone once a battle exists", () => {
    // Turn 3 is the first turn `couldAttackThisTurn` returns true for anything,
    // and from here a Leader attachment is how a Leader hit is made to cost
    // another Counter card.
    const game = openingTurn(3, "p1");

    expect(vetoOf(game, "p1", "p1-leader")).toBeUndefined();
  });

  it("leaves an opening Character attachment alone", () => {
    // A Character's power is read by the opponent's removal as well as by a
    // battle -- "K.O. one Character with a power of 2000 or less" is checked on
    // their turn -- so the argument that carries the Leader does not reach it.
    const game = scenario()
      .decks(
        "(Purple) Charlotte Katakuri - Starter Deck 34",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("format-pre-combat-attachment-2")
      .bareTable()
      .atTurn(1, { active: "p1" })
      .withBoard("p1", [character("brulee", "ST34-003")])
      .build();

    expect(vetoOf(game, "p1", "brulee")).toBeUndefined();
  });
});

describe("dead ramp", () => {
  /**
   * OP09-062 Robin's Leader: "you may trash 1 card with a [Trigger] from your
   * hand: add 1 rested DON!! from your DON!! deck". Driven through a real
   * attack rather than a forged pending effect, because the fields the rule
   * reads -- `cost` and `ramps` on the acceptance -- are the engine's answer to
   * a question the policy cannot ask for itself.
   */
  function robinAttacks(donDeck: number) {
    const game = scenario()
      .decks(
        "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("format-dead-ramp")
      .bareTable()
      .atTurn(9, { active: "p1" })
      .withDonDeck("p1", donDeck)
      .withHand("p1", [instance("p1-pudding", "OP17-109")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    return game;
  }

  const acceptance = (game: ReturnType<typeof robinAttacks>) =>
    game.action(
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );

  const vetoOf = (game: ReturnType<typeof robinAttacks>) =>
    createDeadRampModule().veto?.(
      policyContext(observe(game.state, game.player)),
      acceptance(game),
    );

  it("reports the cost and the DON!! the acceptance would add", () => {
    const action = acceptance(robinAttacks(0));

    if (action.type !== "resolve-effect") throw new Error("NOT_OFFERED");
    expect(action.cost).toEqual({ trashesFromHand: 1 });
    expect(action.ramps).toEqual({ active: 0, rested: 1 });
  });

  it("vetoes paying a card for DON!! an empty DON!! deck cannot supply", () => {
    // `bareTable()` puts all ten DON!! on the field, so the DON!! deck is empty
    // and the add resolves to nothing. This is `open-optcg-trace(12).jsonl`
    // turn 9, where the seat trashed a 1000-Counter Charlotte Pudding for it.
    expect(vetoOf(robinAttacks(0))).toContain("DON!! deck is empty");
  });

  it("leaves the same clause alone while the DON!! deck still holds one", () => {
    expect(vetoOf(robinAttacks(1))).toBeUndefined();
  });

  it("never vetoes the decline, so a decision is always left", () => {
    const game = robinAttacks(0);
    const skip = game.action(
      (action) =>
        action.type === "resolve-effect" && action.optionId === "skip",
    );

    expect(
      createDeadRampModule().veto?.(
        policyContext(observe(game.state, game.player)),
        skip,
      ),
    ).toBeUndefined();
  });
});

describe("capped ramp", () => {
  /**
   * The same clause `dead ramp` drives, one card earlier in the DON!! deck.
   * Built through a real attack for the same reason: `cost` and `ramps` on the
   * acceptance are the engine's answer, not the policy's.
   */
  function robinAttacks(donDeck: number) {
    const game = scenario()
      .decks(
        "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("format-capped-ramp")
      .bareTable()
      .atTurn(9, { active: "p1" })
      // `bareTable()` deals all ten DON!! to the field, and this puts `donDeck`
      // of them back -- so the field is always the ten minus the deck, which is
      // the invariant the arithmetic in `createCappedRampModule` rests on.
      .withDonDeck("p1", donDeck)
      .withHand("p1", [instance("p1-pudding", "OP17-109")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    return game;
  }

  const vetoOf = (donDeck: number, optionId = "apply") => {
    const game = robinAttacks(donDeck);
    return createCappedRampModule().veto?.(
      policyContext(observe(game.state, game.player)),
      game.action(
        (action) =>
          action.type === "resolve-effect" && action.optionId === optionId,
      ),
    );
  };

  it("vetoes paying a card for the last DON!! in the deck", () => {
    // `open-optcg-trace(9).jsonl` turn 7 exactly: nine DON!! on the field, one
    // in the deck, and the seat trashed a 1000-Counter OP17-114 for a rested
    // DON!! its next DON!! Phase was going to draw anyway.
    expect(vetoOf(1)).toContain("already coming");
  });

  it("vetoes at two, the last deck a single turn's draw empties", () => {
    expect(vetoOf(2)).toContain("already coming");
  });

  it("leaves the clause alone at three, where it buys a turn", () => {
    // Declining reaches nine DON!! next turn and ten the turn after; accepting
    // reaches ten next turn. That is a real turn of acceleration, and it is
    // the whole reason the deck's Leader prints the clause.
    expect(vetoOf(3)).toBeUndefined();
  });

  it("leaves an empty DON!! deck to `dead-ramp`, whose reason is the true one", () => {
    // Both vetoes would steer to the same `skip`, but only one of them can say
    // why: at zero the add does not happen at all.
    expect(vetoOf(0)).toBeUndefined();
    expect(
      createDeadRampModule().veto?.(
        policyContext(observe(robinAttacks(0).state, "p1")),
        robinAttacks(0).action(
          (action) =>
            action.type === "resolve-effect" && action.optionId === "apply",
        ),
      ),
    ).toContain("DON!! deck is empty");
  });

  it("never vetoes the decline, so a decision is always left", () => {
    expect(vetoOf(1, "skip")).toBeUndefined();
  });
});

describe("inert activation detection", () => {
  /**
   * The engine sets `selectsNothing`; these drive it through real legal actions
   * rather than hand-forged ones, because the whole point of the field is that
   * the engine answers a question a policy cannot ask for itself.
   */
  function activationOf(
    observation: GameObservation,
    cardNumber: string,
  ): Extract<LegalAction, { type: "activate-main" }> {
    const action = observation.legalActions.find(
      (candidate) =>
        candidate.type === "activate-main" &&
        candidate.sourceCardNumber === cardNumber,
    );
    if (action?.type !== "activate-main") throw new Error("NOT_OFFERED");
    return action;
  }

  const vetoOf = (observation: GameObservation, act: LegalAction) =>
    createInertActivationModule().veto?.(policyContext(observation), act);

  /** OP17-097: "Give all of your opponent's Characters −1 cost during this turn." */
  function rageTurn(opponentBoard: ReturnType<typeof character>[] = []) {
    return scenario()
      .decks(
        "(Black) Monkey.D.Luffy - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("format-inert-rage")
      .bareTable()
      .atTurn(1, { active: "p1" })
      .withDon("p1", { active: 1 })
      .withHand("p1", [instance("p1-rage", "OP17-097")])
      .withBoard("p2", opponentBoard)
      .build();
  }

  it("flags an activation whose only selection finds nothing", () => {
    const observation = observe(rageTurn().state, "p1");
    expect(observation.opponent.board).toHaveLength(0);
    expect(activationOf(observation, "OP17-097").selectsNothing).toBe(true);
  });

  it("leaves the flag off once the selection can find something", () => {
    const observation = observe(
      rageTurn([character("p2-body", "OP17-012")]).state,
      "p1",
    );
    expect(
      activationOf(observation, "OP17-097").selectsNothing,
    ).toBeUndefined();
  });

  it("vetoes the flagged activation and nothing else", () => {
    const empty = observe(rageTurn().state, "p1");
    expect(vetoOf(empty, activationOf(empty, "OP17-097"))).toBeDefined();
    const occupied = observe(
      rageTurn([character("p2-body", "OP17-012")]).state,
      "p1",
    );
    expect(
      vetoOf(occupied, activationOf(occupied, "OP17-097")),
    ).toBeUndefined();
  });

  /**
   * The case `dead-main-event` cannot reach. OP17-056 returns "[printed text omitted -- pnpm card:text OP17-056]", so a board holding only a 10-cost body
   * is a board the clause cannot touch -- and the text-reading rule declines to
   * fire at all once the opposing board is non-empty.
   */
  function bounceInto(opponentBoard: ReturnType<typeof character>[]) {
    return scenario()
      .decks(
        "(Blue) Rocks.D.Xebec - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("format-inert-bounce")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withDon("p1", { active: 6 })
      .withHand("p1", [instance("p1-bounce", "OP17-056")])
      .withBoard("p2", opponentBoard)
      .build();
  }

  it("flags a clause whose cost bound excludes every body on the board", () => {
    const observation = observe(
      bounceInto([character("p2-giant", "OP17-118")]).state,
      "p1",
    );
    expect(observation.opponent.board).toHaveLength(1);
    expect(activationOf(observation, "OP17-056").selectsNothing).toBe(true);
  });

  it("keeps it when a body is inside the cost bound", () => {
    const observation = observe(
      bounceInto([character("p2-small", "OP17-050")]).state,
      "p1",
    );
    expect(
      activationOf(observation, "OP17-056").selectsNothing,
    ).toBeUndefined();
  });

  /**
   * OP15-115 K.O.s an opposing Character *and* moves one of your own Life cards
   * to hand. Two selections in a sequence, aimed at opposite sides of the table,
   * which is what makes it the sharp test of "every selection".
   */
  function impactDial(options: { life: number }) {
    return (
      scenario()
        .decks(
          "(Black) Monkey.D.Luffy - Official Feature Deck",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
        )
        .seed("format-inert-durable")
        .bareTable()
        .atTurn(1, { active: "p1" })
        .withDon("p1", { active: 2 })
        // Explicit cards, because `bareTable()` empties the deck a count would
        // be dealt from.
        .withLife(
          "p1",
          Array.from({ length: options.life }, (_, index) =>
            instance(`p1-life-${index}`, "OP17-012"),
          ),
        )
        .withHand("p1", [instance("p1-other", "OP15-115")])
        .withBoard("p2", [])
        .build()
    );
  }

  it("leaves a clause alone while its other half still has a target", () => {
    // Inherited from `dead-main-event`, whose behaviour this has to keep: the
    // K.O. half being dead is no reason to decline the half that is not.
    const observation = observe(impactDial({ life: 3 }).state, "p1");
    expect(observation.cardFacts["OP15-115"]?.rules.clauses).toContain(
      "[Main]",
    );
    expect(
      activationOf(observation, "OP15-115").selectsNothing,
    ).toBeUndefined();
  });

  it("flags it once both halves have run out", () => {
    // The half of this `dead-main-event` could never see. It kept the card on
    // the strength of the word "Life" in the printed text; at 0 Life there is no
    // Life card to take and the Event really does resolve for nothing.
    const observation = observe(impactDial({ life: 0 }).state, "p1");
    expect(activationOf(observation, "OP15-115").selectsNothing).toBe(true);
  });

  /**
   * OP17-098 Gum-Gum Kong Gun: "[printed text omitted -- pnpm card:text OP17-098]"
   *
   * The rule that used to live in `op13-sabo-policy.ts`, which this replaces.
   * Six DON!! rested is the whole turn, the gate passes off a giant either
   * player controls, and the K.O. is "up to 2" -- so the activation is offered
   * with nothing in range.
   */
  function kongGun(opponentBoard: ReturnType<typeof character>[]) {
    return scenario()
      .decks(
        "(Red/Black) Sabo - OP17 Elbaph List",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("format-inert-kong")
      .bareTable()
      .atTurn(9, { active: "p1" })
      .withDon("p1", { active: 8 })
      .withHand("p1", [instance("p1-gun", "OP17-098")])
      .withBoard("p1", [character("p1-giant", "OP17-119")])
      .withBoard("p2", opponentBoard)
      .build();
  }

  it("flags the K.O. whose gate passes but whose targets are all too dear", () => {
    // The giant switches the clause on -- so this is not the bare-gate case the
    // engine already withholds -- and the only body opposite costs 10.
    const observation = observe(
      kongGun([character("p2-big", "OP17-118")]).state,
      "p1",
    );
    expect(observation.self.board[0]?.currentCost).toBeGreaterThanOrEqual(12);
    expect(activationOf(observation, "OP17-098").selectsNothing).toBe(true);
  });

  it("keeps the K.O. once a body is in range", () => {
    const observation = observe(
      kongGun([character("p2-small", "OP17-050")]).state,
      "p1",
    );
    expect(
      activationOf(observation, "OP17-098").selectsNothing,
    ).toBeUndefined();
  });

  it("plays something else rather than burning the Event for nothing", async () => {
    // Also inherited: end to end through the registry, because the fault was in
    // the generic fall-through -- "Use an available Main-phase effect." -- and
    // this deck has no policy of its own to intercept it.
    const observation = observe(rageTurn().state, "p1");
    const action = await createRulesAgent(
      "(Black) Monkey.D.Luffy - Official Feature Deck",
    ).chooseAction(observation);
    expect(action.type).not.toBe("activate-main");
  });

  /**
   * The four above are all single-selection programs. These cover the shape
   * printed text actually uses -- "<price>: <payoff>", one `sequence` with the
   * price in front -- which `effectSelectsNothing` could not report at all
   * until `stepIsPriceOnly` existed, because a price step selects nothing by
   * selecting nothing at all. A census of the pool's 196 `[Activate: Main]`
   * programs put 53 in that class.
   *
   * Reported from a real game (`open-optcg-trace(20).jsonl`, turn 3): the Ace
   * seat activated OP13-007 into an empty opposing board, trashing the
   * Character to give a DON!! the same Main phase was offering for free.
   */
  describe("a price in front of the payoff", () => {
    /**
     * OP13-007 Ace & Sabo & Luffy: give 1 active DON!! to one of your cards and
     * trash this Character, to give up to 1 opposing Character -3000.
     *
     * Both front steps are prices. The `give-rested-don` is one only because it
     * moves an *active* DON!!, which `donOffers` already hands out free to
     * every board card in the Main phase -- so the activation buys nothing the
     * seat did not already have.
     */
    function aslTurn(opponentBoard: ReturnType<typeof character>[] = []) {
      return scenario()
        .decks(
          "(Red) Portgas.D.Ace - Official Feature Deck",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
        )
        .seed("format-inert-asl")
        .bareTable()
        .atTurn(1, { active: "p1" })
        .withDon("p1", { active: 1 })
        .withBoard("p1", [character("p1-asl", "OP13-007")])
        .withBoard("p2", opponentBoard)
        .build();
    }

    it("flags the activation when the payoff behind the price finds nothing", () => {
      const observation = observe(aslTurn().state, "p1");
      expect(observation.opponent.board).toHaveLength(0);
      // The free alternative that makes this a pure loss, and the reason the
      // activation is not merely a wash: the same +1000 for no card.
      expect(
        observation.legalActions.some(
          (action) =>
            action.type === "attach-don" &&
            action.targetInstanceId === "p1-leader",
        ),
      ).toBe(true);
      expect(activationOf(observation, "OP13-007").selectsNothing).toBe(true);
    });

    it("leaves the flag off once there is a Character to debuff", () => {
      const observation = observe(
        aslTurn([character("p2-body", "OP17-012")]).state,
        "p1",
      );
      expect(
        activationOf(observation, "OP13-007").selectsNothing,
      ).toBeUndefined();
    });

    it("vetoes the flagged activation", () => {
      const empty = observe(aslTurn().state, "p1");
      expect(vetoOf(empty, activationOf(empty, "OP13-007"))).toBeDefined();
    });

    /**
     * EB03-015 Camie is the same shape with one field different: its
     * `give-rested-don` omits `from`, which defaults to `"rested"`. No free
     * action attaches a *rested* DON!!, so +1000 out of one is real value and
     * the activation is worth taking with nothing to rest. This is the single
     * distinction that keeps the widening from suppressing a live offer, so it
     * is asserted rather than left to the census.
     */
    it("does not flag a price whose neighbour gives a rested DON!!", () => {
      const built = scenario()
        .decks(
          "(Red) Portgas.D.Ace - Official Feature Deck",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
        )
        .seed("format-inert-camie")
        .bareTable()
        .atTurn(1, { active: "p1" })
        .withDon("p1", { rested: 1 })
        .withBoard("p1", [character("p1-camie", "EB03-015")])
        .build();
      const observation = observe(built.state, "p1");
      expect(observation.opponent.board).toHaveLength(0);
      expect(
        activationOf(observation, "EB03-015").selectsNothing,
      ).toBeUndefined();
    });

    /**
     * OP16-056 Mr. 3 trashes itself -- a price -- and then draws 2 *and* offers
     * the selection. The draw is the trap the whole cost/payoff split has to
     * avoid: calling a self-trash a price is only safe while a `draw` beside it
     * still counts as a payoff.
     */
    it("does not flag a price whose neighbour draws", () => {
      const built = scenario()
        .decks(
          "(Red) Portgas.D.Ace - Official Feature Deck",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
        )
        .seed("format-inert-mr3")
        .bareTable()
        .atTurn(1, { active: "p1" })
        .withDon("p1", { active: 1 })
        .withBoard("p1", [character("p1-mr3", "OP16-056")])
        .build();
      const observation = observe(built.state, "p1");
      expect(observation.opponent.board).toHaveLength(0);
      expect(
        activationOf(observation, "OP16-056").selectsNothing,
      ).toBeUndefined();
    });
  });
});

describe("don-reservation: the last payable DON!! and the ability it completes", () => {
  /**
   * The trade the rule prices is "+1000 power for one turn against a permanent
   * body", and for a `[DON!! xN]` Leader that price is simply wrong -- the DON!!
   * buys the printed text. `dead-attachment` and `counter-event-reserve` in the
   * same file already carve this exemption; its absence here deadlocked with
   * `aura-before-bodies` and cost the Leader 2000 power on its attack. See
   * `test/op13-sabo-policy.test.ts` for the end-to-end judgement.
   */
  const lastPayableDon = (leaderAttached: number) =>
    scenario()
      .decks(
        "(Red/Black) Sabo - OP17 Elbaph List",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("don-reservation-aura")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withLife("p1", copies(3, "OP17-086", "life"))
      // `bareTable()` empties both decks, so Life has to be given as cards: the
      // rule is gated on the opponent still being above one Life.
      .withLife("p2", copies(4, "OP17-086", "opp-life"))
      .withBoard("p1", [character("saul", "OP17-089")])
      .withHand("p1", [instance("nami", "OP17-086")])
      .withDonDeck("p1", 9)
      .withDon("p1", { rested: 4, leaderAttached: leaderAttached })
      .build();

  const vetoFor = (
    observation: GameObservation,
    target: string,
  ): string | undefined => {
    const attach = observation.legalActions.find(
      (action) =>
        action.type === "attach-don" && action.targetInstanceId === target,
    );
    expect(attach).toBeDefined();
    return createDonReservationModule().veto?.(
      policyContext(observation),
      attach!,
    );
  };

  it("says nothing about the DON!! that completes the Leader's ability", () => {
    const observation = observe(lastPayableDon(0).state, "p1");
    // The position the rule is otherwise about: one active DON!!, and the
    // cheapest thing in hand costs exactly that.
    expect(observation.self.activeDon).toBe(1);
    expect(tactics(observation).attachmentBlocksAllDevelopment).toBe(true);
    expect(vetoFor(observation, "p1-leader")).toBeUndefined();
  });

  it("still reserves the DON!! a Character would only rest for power", () => {
    const observation = observe(lastPayableDon(0).state, "p1");
    expect(vetoFor(observation, "saul")).toBeDefined();
  });

  it("reserves it for a Leader whose [DON!! xN] buys one unit", () => {
    // The narrowing that keeps this at format scope. ST21-001's `[DON!! x1]`
    // gives rested DON!! to a single Character: same shape of clause, and the
    // "+1000 power for one turn" price the rule prices against is close enough
    // to true. The unnarrowed exemption cost OP-16 Green/Blue Luffy 2.3pt for
    // exactly this reason -- see the comment at the rule.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("don-reservation-single-unit")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withLife("p1", copies(3, "ST31-002", "life"))
      .withLife("p2", copies(4, "ST31-002", "opp-life"))
      .withBoard("p1", [character("body", "ST31-002")])
      // A 1-cost body, so there is a play the last DON!! could pay for -- which
      // is the whole precondition of the rule.
      .withHand("p1", [instance("cheap", "OP17-084")])
      .withDonDeck("p1", 9)
      .withDon("p1", { rested: 4 })
      .build();
    const observation = observe(game.state, "p1");
    expect(observation.self.leader.cardNumber).toBe("ST21-001");
    expect(tactics(observation).needsDonForAbility("p1-leader")).toBe(true);
    expect(tactics(observation).attachmentBlocksAllDevelopment).toBe(true);
    expect(vetoFor(observation, "p1-leader")).toBeDefined();
  });

  it("reserves it again once the ability is already switched on", () => {
    // A second DON!! on this Leader buys the ordinary +1000 and nothing else,
    // so the exemption has to close behind the first one.
    const observation = observe(lastPayableDon(1).state, "p1");
    expect(observation.self.leader.attachedDon).toBe(1);
    expect(vetoFor(observation, "p1-leader")).toBeDefined();
  });
});

describe("dead ramp trigger detection", () => {
  /**
   * Traced from a real game (`open-optcg-trace(11).jsonl`, turn 9): the Enel
   * seat at 1 Life took a Leader hit, flipped OP05-077 Gamma Knife and
   * activated its [Trigger] -- "add 1 DON!! from your DON!! deck, set as
   * active" -- with every DON!! already on the field and the DON!! deck at
   * zero. No `don-added` event followed, and a 2-cost Event that would have
   * been in hand for the turn the seat had left went to the trash instead.
   *
   * The two positions differ only in whether the DON!! deck has a card in it,
   * which is the whole of the rule.
   */
  function gammaKnifeFlip(donDeck: number) {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Purple) Enel - Official Feature Deck",
      )
      .seed("format-dead-ramp-trigger")
      .bareTable()
      .atTurn(9, { active: "p1" })
      .withDon("p2", { rested: 5, leaderAttached: 1 })
      .withDonDeck("p2", donDeck)
      .withBoard("p1", [
        character("p1-attacker", "OP11-003", { playedTurn: 1 }),
      ])
      .withLife("p2", [instance("p2-life-gamma", "OP05-077")])
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
    createDeadRampTriggerModule().veto?.(policyContext(observation), act);

  it("reports what activating the Trigger would add", () => {
    const observation = observe(gammaKnifeFlip(0).state, "p2");
    expect(activationOf(observation).ramps).toEqual({ active: 1, rested: 0 });
  });

  it("vetoes the activation only while the DON!! deck is empty", () => {
    const empty = observe(gammaKnifeFlip(0).state, "p2");
    expect(vetoOf(empty, activationOf(empty))).toBeDefined();
    const stocked = observe(gammaKnifeFlip(1).state, "p2");
    expect(vetoOf(stocked, activationOf(stocked))).toBeUndefined();
  });

  it("never flags the option that keeps the card", () => {
    // Vetoing every flagged action must leave the decision an option, and
    // `skip` is the one this rule steers towards.
    const observation = observe(gammaKnifeFlip(0).state, "p2");
    const skip = observation.legalActions.find(
      (candidate) =>
        candidate.type === "resolve-trigger" && candidate.optionId === "skip",
    );
    expect(skip).toBeDefined();
    expect(skip).not.toHaveProperty("ramps");
    expect(vetoOf(observation, skip!)).toBeUndefined();
  });

  it("takes the Life card into hand instead, through the deck's own agent", async () => {
    // End to end, because the fault was in `chooseGenericTrigger`'s
    // fall-through -- "Resolve the available beneficial Trigger." -- which this
    // deck reaches with no Trigger rule of its own.
    const game = gammaKnifeFlip(0);
    const action = await createRulesAgent(
      "(Purple) Enel - Official Feature Deck",
    ).chooseAction(observe(game.state, "p2"));
    expect(action).toMatchObject({ type: "resolve-trigger", optionId: "skip" });

    game.submit(action);
    expect(game.state.players.p2.hand).toContainEqual(
      expect.objectContaining({ cardNumber: "OP05-077" }),
    );
  });

  it("still activates the Trigger when a DON!! is there to add", async () => {
    const game = gammaKnifeFlip(1);
    const action = await createRulesAgent(
      "(Purple) Enel - Official Feature Deck",
    ).chooseAction(observe(game.state, "p2"));
    expect(action).toMatchObject({
      type: "resolve-trigger",
      optionId: "activate",
    });
  });
});

describe("a [DON!! xN] the turn cannot reach", () => {
  /**
   * Reported from a real game (`open-optcg-trace(22).jsonl`, turn 3): the
   * (Green/Yellow) Yamato seat had one DON!! left after ST28-002 Izo and put it
   * on ST28-005 Yamato -- a 1-cost 0-power body whose only power text is
   * `[DON!! x2]` and `[Your Turn]`. One DON!! leaves it at 1, short of its own
   * gate, so it was a 1000-power body that then made no attack. The Leader
   * attacked at 5000 into the opposing 5000 Leader, ate one 1000 Counter and
   * bounced; the same DON!! on the Leader is 6000 into 6000, the attacker wins
   * ties, and OP06-022 has [Double Attack] with Izo's [Banish] live that turn.
   *
   * Two rules read `needsDonForAbility` and both got it wrong: `dead-attachment`
   * exempted the body from its veto, and `don-threshold` scored it above every
   * Counter threshold -- and because that is a `rank`, the Leader attachment was
   * hidden rather than merely outranked. A given DON!! goes back to the cost
   * area at the next Refresh Phase (CR 6-2-3), so the count has to be reachable
   * inside this main phase or not at all: that is `canCompleteDonAbility`.
   */
  const TURN_THREE_DON = 3;

  /**
   * The traced turn: three DON!! on the field, some of them already rested on
   * the turn's plays, and ST28-005 on the board since turn 1 so it is the
   * engine that decides it may attack.
   */
  function yamatoTurn(activeDon: number) {
    return (
      scenario()
        .decks(
          "(Green/Yellow) Yamato - Official Feature Deck",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
        )
        .seed("don-shortfall-yamato")
        .bareTable()
        .atTurn(3, { active: "p1" })
        .withBoard("p1", [character("yamato", "ST28-005")])
        // Full Life on both sides, as the third turn of the traced game had it.
        // It is the opposing total that matters: the Leader's `[Activate: Main]`
        // gives a Character two rested DON!! only "if your opponent has 3 or less
        // Life cards", and above that the attachment is the turn's live decision
        // rather than a later one.
        .withLife("p1", copies(5, "ST28-005", "life"))
        .withLife("p2", copies(5, "ST31-002", "opp-life"))
        // `bareTable()` leaves all ten active, and `withDon` draws from the DON!!
        // deck rather than off that pile -- so the active count is set by what is
        // put *back*, and the rested DON!! the turn's plays spent comes out of the
        // deck on top of it.
        .withDonDeck("p1", 10 - activeDon)
        .withDon("p1", { rested: TURN_THREE_DON - activeDon })
        .build()
    );
  }

  it("reads the shortfall against what the turn can still spend", () => {
    const short = tactics(observe(yamatoTurn(1).state, "p1"));
    // Still short of its `[DON!! x2]`, which is all the old predicate asked.
    expect(short.needsDonForAbility("yamato")).toBe(true);
    // But one DON!! cannot close a gap of two, and there is no next turn to
    // carry it into: the DON!! detaches at Refresh.
    expect(short.canCompleteDonAbility("yamato")).toBe(false);

    const enough = tactics(observe(yamatoTurn(2).state, "p1"));
    expect(enough.canCompleteDonAbility("yamato")).toBe(true);
  });

  it("vetoes the DON!! that cannot finish the count", () => {
    const observation = observe(yamatoTurn(1).state, "p1");
    const attachment = observation.legalActions.find(
      (action) =>
        action.type === "attach-don" && action.targetInstanceId === "yamato",
    );
    expect(attachment).toBeDefined();
    // 0 power plus the DON!!'s own +1000 loses to a 5000 Leader, so once the
    // ability exemption closes `dead-attachment` prices it like any other body.
    expect(
      createDeadAttachmentModule().veto?.(
        policyContext(observation),
        attachment!,
      ),
    ).toContain("buys no battle");
  });

  it("leaves the DON!! that does finish it alone", () => {
    const observation = observe(yamatoTurn(2).state, "p1");
    const attachment = observation.legalActions.find(
      (action) =>
        action.type === "attach-don" && action.targetInstanceId === "yamato",
    );
    expect(
      createDeadAttachmentModule().veto?.(
        policyContext(observation),
        attachment!,
      ),
    ).toBeUndefined();
  });

  it("puts the last DON!! on the Leader instead, through the deck's own agent", async () => {
    // End to end, because the fault needed both rules and neither alone would
    // have moved the DON!!: `dead-attachment`'s exemption let the candidate
    // through, and `don-threshold` then scored it above the Leader -- which,
    // being a `rank`, hid the Leader rather than merely placing it second.
    const game = yamatoTurn(1);
    const agent = createRulesAgent(
      "(Green/Yellow) Yamato - Official Feature Deck",
    );
    const attachments: string[] = [];
    for (let step = 0; step < 12; step += 1) {
      const observation = observe(game.state, "p1");
      if (observation.turnPlayer !== "p1") break;
      if (observation.legalActions.length === 0) break;
      const action = await agent.chooseAction(observation);
      if (action.type === "attach-don") {
        attachments.push(action.targetInstanceId);
      }
      if (action.type === "pass") break;
      game.submit(action);
    }

    expect(attachments).toEqual(["p1-leader"]);
  });
});
