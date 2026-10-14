import { describe, expect, it } from "vitest";
import {
  applyAction,
  canAttack,
  canonicalJson,
  createGame,
  EngineError,
  getLegalActions,
  GameService,
  hashState,
  observe,
  type GameTransitionEvent,
  type ResolvedDeck,
} from "@one-piece-sim/engine-core";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  deckManifests,
  resolveDeck,
  FORMAT_DECK_IDS,
} from "@one-piece-sim/decks";
import { GenericRulesAgent } from "@one-piece-sim/agents/local";
import referenceManifest from "../fixtures/reference/2026-08-04/manifest.json" with { type: "json" };
import { setTurnPlayer } from "./support/index.js";

const input = {
  gameId: "test-game",
  p1: resolveDeck("FIXTURE-RED"),
  p2: resolveDeck("FIXTURE-BLUE"),
  seed: "fixed-seed",
};

function completeSetup(initial = createGame(input)) {
  let state = initial;
  for (const decision of ["keep", "keep"] as const) {
    const action = getLegalActions(state, state.activePlayer).find(
      (candidate) =>
        candidate.type === "mulligan-decision" &&
        candidate.decision === decision,
    );
    if (!action || action.type !== "mulligan-decision") {
      throw new Error("Missing mulligan decision");
    }
    state = applyAction(state, { ...action, revision: state.revision }).state;
  }
  return state;
}

describe("deterministic rules kernel", () => {
  /**
   * Comprehensive Rules 6-5-6-1: "Neither player can battle on their first
   * turn." Both first turns, which `turn` counts as 1 and 2.
   *
   * Locked down because it reads like an off-by-one against 6-3-1 and 6-4-1,
   * which restrict the skipped draw and the single DON!! to "the player going
   * first" only. That contrast is deliberate, and an audit already once
   * "corrected" this to turn 1 on the strength of it.
   */
  it("bars battling on both players' first turns, not just the first player's", () => {
    const state = completeSetup();
    state.players.p1.board = [
      {
        instanceId: "veteran",
        cardNumber: "FIX-001",
        rested: false,
        playedTurn: 0,
      },
    ];

    for (const turn of [1, 2] as const) {
      state.turn = turn;
      setTurnPlayer(state, "p1");
      state.phase = "main";
      expect(canAttack(state, "p1", "p1-leader")).toBe(false);
      expect(canAttack(state, "p1", "veteran")).toBe(false);
      expect(
        getLegalActions(state, "p1").some((action) => action.type === "attack"),
      ).toBe(false);
    }

    state.turn = 3;
    setTurnPlayer(state, "p1");
    state.phase = "main";
    expect(canAttack(state, "p1", "p1-leader")).toBe(true);
  });

  it("uses the shared attack query to generate attack actions", () => {
    const state = completeSetup();
    state.turn = 3;
    state.players.p1.board = [
      {
        instanceId: "active-character",
        cardNumber: "FIX-001",
        rested: false,
        playedTurn: 2,
      },
      {
        instanceId: "rested-character",
        cardNumber: "FIX-001",
        rested: true,
        playedTurn: 2,
      },
      {
        instanceId: "new-character",
        cardNumber: "FIX-001",
        rested: false,
        playedTurn: 3,
      },
      {
        instanceId: "prevented-character",
        cardNumber: "FIX-001",
        rested: false,
        playedTurn: 2,
        cannotAttackUntilTurn: 3,
      },
    ];

    const attackActions = getLegalActions(state, "p1").filter(
      (action) => action.type === "attack",
    );
    const attackers = new Set(
      attackActions.map((action) => action.attackerInstanceId),
    );
    for (const instanceId of [
      "p1-leader",
      ...state.players.p1.board.map((card) => card.instanceId),
    ]) {
      expect(attackers.has(instanceId)).toBe(
        canAttack(state, "p1", instanceId),
      );
    }
  });

  it("prices a failing attack in DON!! rather than only calling it worthless", () => {
    // The bug this covers: `counterShortfall === 0` told a policy an attack
    // achieves nothing, and nothing told it how close the attack was to
    // achieving something. An LLM run spent its whole DON!! pool on bodies
    // that could not attack yet while a Character sat one DON!! short of the
    // opposing Leader, four turns running, correctly refusing the swing every
    // time.
    const state = completeSetup();
    state.turn = 3;
    setTurnPlayer(state, "p1");
    state.phase = "main";
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.board = [
      {
        instanceId: "small",
        cardNumber: "FIX-001",
        rested: false,
        playedTurn: 2,
      },
    ];
    const attacks = getLegalActions(state, "p1").filter(
      (action) => action.type === "attack",
    );
    const leaderDefence = observe(state, "p1").opponent.leader.currentPower;

    const failing = attacks.find(
      (action) =>
        action.attackerInstanceId === "small" &&
        action.targetInstanceId === "p2-leader",
    );
    expect(failing).toMatchObject({
      attackPower: 2000,
      counterShortfall: 0,
      donToReach: Math.ceil((leaderDefence - 2000) / 1000),
      unspentActiveDon: 2,
    });
    // Out of reach with 2 DON!!, and the summary says so rather than implying
    // the pump is available.
    expect(failing?.summary).toContain(
      "no amount of your 2 active DON!! reaches this target, which needs 3",
    );

    // An attack that already reaches carries no price, because there is
    // nothing to buy: the attacker wins ties, so reaching is hitting.
    const connecting = attacks.find(
      (action) => action.attackerInstanceId === "p1-leader",
    );
    expect(connecting).toMatchObject({ attackPower: leaderDefence });
    expect(connecting).not.toHaveProperty("donToReach");
  });

  it("flags a just-played, Rush-less Character as summoning sick in the observation", () => {
    // The bug this covers: a policy choosing actions from the observation had
    // no field saying a Character couldn't attack merely because it was
    // played this turn -- it had to notice `playedTurn === turn` itself and
    // separately recall from the card's text that it lacks Rush. `blocker`
    // and `negated` already spell out derived facts like this directly; this
    // one silently did not.
    const state = completeSetup();
    state.turn = 3;
    state.players.p1.board = [
      {
        instanceId: "active-character",
        cardNumber: "FIX-001",
        rested: false,
        playedTurn: 2,
      },
      {
        instanceId: "new-character",
        cardNumber: "FIX-001",
        rested: false,
        playedTurn: 3,
      },
    ];

    const observation = observe(state, "p1");
    const veteran = observation.self.board.find(
      (card) => card.instanceId === "active-character",
    );
    const rookie = observation.self.board.find(
      (card) => card.instanceId === "new-character",
    );

    expect(veteran?.summoningSick).toBeUndefined();
    expect(rookie?.summoningSick).toBe(true);
  });

  it("publishes clear damage and defended battle outcomes", () => {
    const resolveLeaderAttack = (defenseBonus: number) => {
      let state = completeSetup();
      state.turn = 3;
      state.players.p2.leaderPowerModifiers = [
        { amount: defenseBonus, expiresAtTurn: 4 },
      ];
      const attack = getLegalActions(state, state.activePlayer).find(
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p2-leader",
      );
      if (!attack) throw new Error("Missing leader attack");
      state = applyAction(state, {
        ...attack,
        revision: state.revision,
      }).state;
      for (const phase of ["block", "counter"] as const) {
        expect(state.phase).toBe(phase);
        const pass = getLegalActions(state, state.activePlayer).find(
          (action) => action.type === "pass",
        );
        if (!pass) throw new Error(`Missing ${phase} pass`);
        state = applyAction(state, {
          ...pass,
          revision: state.revision,
        }).state;
      }
      return state.events.findLast((event) => event.type === "battle-resolved");
    };

    expect(resolveLeaderAttack(0)).toMatchObject({
      type: "battle-resolved",
      outcome: "damage",
      attackPower: 5000,
      defensePower: 5000,
    });
    expect(resolveLeaderAttack(1000)).toMatchObject({
      type: "battle-resolved",
      outcome: "defended",
      attackPower: 5000,
      defensePower: 6000,
    });
  });

  it("ends the match when a Leader attack connects at zero Life", () => {
    let state = completeSetup();
    state.turn = 3;
    state.players.p2.life = [];
    const attack = getLegalActions(state, state.activePlayer).find(
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p2-leader",
    );
    if (!attack) throw new Error("Missing lethal Leader attack");
    state = applyAction(state, { ...attack, revision: state.revision }).state;

    for (const phase of ["block", "counter"] as const) {
      expect(state.phase).toBe(phase);
      const pass = getLegalActions(state, state.activePlayer).find(
        (action) => action.type === "pass",
      );
      if (!pass) throw new Error(`Missing ${phase} pass`);
      state = applyAction(state, { ...pass, revision: state.revision }).state;
    }

    expect(state).toMatchObject({
      phase: "finished",
      winner: "p1",
      resultReason: "life",
      activeAttack: null,
    });
    expect(state.events.slice(-2)).toMatchObject([
      { type: "battle-resolved", outcome: "game-win" },
      { type: "game-ended", winner: "p1", reason: "life" },
    ]);
  });

  it("replays the same seed and actions to the same hashes", () => {
    let left = createGame(input);
    let right = createGame(input);
    for (let step = 0; step < 12; step += 1) {
      const leftAction = getLegalActions(left, left.activePlayer)[0]!;
      const rightAction = getLegalActions(right, right.activePlayer)[0]!;
      expect(leftAction).toEqual(rightAction);
      const leftInput =
        leftAction.type === "play-card"
          ? { ...leftAction, revision: left.revision }
          : { ...leftAction, revision: left.revision };
      const rightInput =
        rightAction.type === "play-card"
          ? { ...rightAction, revision: right.revision }
          : { ...rightAction, revision: right.revision };
      left = applyAction(left, leftInput).state;
      right = applyAction(right, rightInput).state;
      expect(hashState(left)).toBe(hashState(right));
    }
  });

  it("keeps deck setup and starting deck stable when matchup seats swap", () => {
    const original = createGame({
      ...input,
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "1",
      seedMode: "matchup",
      startingPlayer: "random",
    });
    const reversed = createGame({
      ...input,
      p1: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "1",
      seedMode: "matchup",
      startingPlayer: "random",
    });
    const cardNumbers = (player: (typeof original.players)["p1"]) =>
      [...player.hand, ...player.deck].map((card) => card.cardNumber);

    expect(cardNumbers(reversed.players.p2)).toEqual(
      cardNumbers(original.players.p1),
    );
    expect(cardNumbers(reversed.players.p1)).toEqual(
      cardNumbers(original.players.p2),
    );
    expect(reversed.rngState).toEqual(original.rngState);
    expect(
      reversed.activePlayer === "p1"
        ? "(Green) Roronoa Zoro - Starter Deck 32"
        : "(Red) Monkey.D.Luffy - Starter Deck 31",
    ).toBe(
      original.activePlayer === "p1"
        ? "(Red) Monkey.D.Luffy - Starter Deck 31"
        : "(Green) Roronoa Zoro - Starter Deck 32",
    );
  });

  it("rejects stale actions without mutating state or RNG", () => {
    const state = createGame(input);
    const before = canonicalJson(state);
    const action = getLegalActions(state, "p1")[0]!;
    const staleAction =
      action.type === "play-card"
        ? { ...action, revision: -1 }
        : { ...action, revision: -1 };
    expect(() => applyAction(state, staleAction)).toThrow(EngineError);
    expect(canonicalJson(state)).toBe(before);
  });

  it("does not expose opponent hand or life identities", () => {
    const state = createGame(input);
    const observation = observe(state, "p1");
    const serialized = JSON.stringify(observation.opponent);
    for (const hidden of [...state.players.p2.hand, ...state.players.p2.life]) {
      expect(serialized).not.toContain(hidden.instanceId);
      expect(serialized).not.toContain(hidden.cardNumber);
    }
  });

  it("waits for both external mulligan decisions before dealing Life", () => {
    let state = createGame(input);
    expect(state.phase).toBe("mulligan");
    expect(state.activePlayer).toBe("p1");
    expect(state.players.p1.life).toHaveLength(0);
    expect(state.players.p2.life).toHaveLength(0);
    expect(getLegalActions(state, "p1").map((action) => action.type)).toEqual([
      "mulligan-decision",
      "mulligan-decision",
    ]);
    expect(getLegalActions(state, "p2")).toEqual([]);
    const originalHand = state.players.p1.hand.map((card) => card.instanceId);
    const mulligan = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "mulligan-decision" && action.decision === "mulligan",
    );
    if (!mulligan || mulligan.type !== "mulligan-decision") {
      throw new Error("Missing mulligan action");
    }
    state = applyAction(state, {
      ...mulligan,
      revision: state.revision,
    }).state;
    expect(state.activePlayer).toBe("p2");
    expect(state.phase).toBe("mulligan");
    expect(state.players.p1.hand.map((card) => card.instanceId)).not.toEqual(
      originalHand,
    );
    const p2View = observe(state, "p2");
    expect(JSON.stringify(p2View.opponent)).not.toContain(
      state.players.p1.hand[0]?.cardNumber,
    );
    const keep = getLegalActions(state, "p2").find(
      (action) =>
        action.type === "mulligan-decision" && action.decision === "keep",
    );
    if (!keep || keep.type !== "mulligan-decision") {
      throw new Error("Missing keep action");
    }
    const completed = applyAction(state, {
      ...keep,
      revision: state.revision,
    });
    expect(completed.state.phase).toBe("main");
    expect(completed.state.activePlayer).toBe("p1");
    expect(completed.state.players.p1.life).toHaveLength(5);
    expect(completed.state.players.p2.life).toHaveLength(5);
    expect(completed.events).toContainEqual({
      type: "setup-complete",
      activePlayer: "p1",
    });
  });

  it("supports a seeded random starting player through setup", () => {
    const starters = new Set<"p1" | "p2">();
    for (let index = 0; index < 20; index += 1) {
      let state = createGame({
        ...input,
        seed: `random-starter-${index}`,
        startingPlayer: "random",
      });
      const starter = state.activePlayer;
      starters.add(starter);

      for (let decision = 0; decision < 2; decision += 1) {
        const keep = getLegalActions(state, state.activePlayer).find(
          (action) =>
            action.type === "mulligan-decision" && action.decision === "keep",
        );
        if (!keep || keep.type !== "mulligan-decision") {
          throw new Error("Missing keep action");
        }
        state = applyAction(state, {
          ...keep,
          revision: state.revision,
        }).state;
      }

      expect(state.phase).toBe("main");
      expect(state.activePlayer).toBe(starter);
    }
    expect(starters).toEqual(new Set(["p1", "p2"]));
  });

  it("lets a rules-first actor choose from engine-provided actions", async () => {
    const state = createGame(input);
    const observation = observe(state, "p1");
    const expectedDecision = observation.self.hand.some(
      (card) => card.cost <= 2,
    )
      ? "keep"
      : "mulligan";
    const action = await new GenericRulesAgent().chooseAction(observation);
    expect(action.type).toBe("mulligan-decision");
    if (action.type !== "mulligan-decision") {
      throw new Error("Expected mulligan decision");
    }
    expect(action.decision).toBe(expectedDecision);
    const result = applyAction(state, { ...action, revision: state.revision });
    expect(result.state.revision).toBe(1);
    expect(result.state.activePlayer).toBe("p2");
  });

  it("publishes accepted actions to isolated service callbacks", () => {
    const delivered: GameTransitionEvent[] = [];
    const service = new GameService({
      callbacks: [
        {
          handle(event) {
            event.result.state.revision = 999;
            throw new Error("observer failure");
          },
        },
        { handle: (event) => delivered.push(event) },
      ],
    });
    const observation = service.create({
      p1: input.p1,
      p2: input.p2,
      seed: input.seed,
    });
    service.act(observation.gameId, observation.revision, "r0:mulligan:keep");
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.action.type).toBe("mulligan-decision");
    expect(delivered[0]?.legalAction.summary).toBe("Keep opening hand");
    expect(delivered[0]?.previousState.revision).toBe(0);
    expect(delivered[0]?.result.state.revision).toBe(1);
    expect(service.observe(observation.gameId, "p2").revision).toBe(1);
  });

  it("hands a read-only callback the transition itself, and every other one a copy", () => {
    const readers: GameTransitionEvent[] = [];
    const copies: GameTransitionEvent[] = [];
    const service = new GameService({
      callbacks: [
        { readOnly: true, handle: (event) => readers.push(event) },
        { readOnly: true, handle: (event) => readers.push(event) },
        { handle: (event) => copies.push(event) },
        { handle: (event) => copies.push(event) },
      ],
    });
    const observation = service.create({
      p1: input.p1,
      p2: input.p2,
      seed: input.seed,
    });
    service.act(observation.gameId, observation.revision, "r0:mulligan:keep");
    // Two readers see one object; two copies are two objects, each as deep a
    // copy as the event log -- which is the part `structuredClone` copied too.
    expect(readers[0]?.result.state).toBe(readers[1]?.result.state);
    expect(copies[0]?.result.state).not.toBe(copies[1]?.result.state);
    expect(copies[0]?.result.state).toStrictEqual(readers[0]?.result.state);
    expect(copies[0]?.result.state.events).not.toBe(
      readers[0]?.result.state.events,
    );
    expect(copies[0]?.previousState).toStrictEqual(readers[0]?.previousState);
    expect(copies[0]?.previousState.players.p1.hand).not.toBe(
      readers[0]?.previousState.players.p1.hand,
    );
  });

  it("deals every format deck, and the catalog rejects the rest", () => {
    for (const deckId of FORMAT_DECK_IDS) {
      expect(() =>
        createGame({ ...input, p1: resolveDeck(deckId) }),
      ).not.toThrow();
    }
    // Rejecting a deck the repository does not ship is the catalog's job now
    // that the engine is handed an already-resolved decklist.
    expect(() => resolveDeck("NOT-A-DECK")).toThrow(/UNSUPPORTED_DECK/);
  });

  it("deals a deck the catalog has never heard of", () => {
    // The point of taking a resolved deck: this decklist is in no manifest, and
    // the engine neither knows nor cares. Only the card numbers have to be real.
    const homebrew: ResolvedDeck = {
      leader: "FIX-LEADER-R",
      cards: Array.from({ length: 50 }, (_, index) =>
        index % 2 === 0 ? "FIX-001" : "FIX-002",
      ),
    };
    const state = createGame({ ...input, p1: homebrew, p2: homebrew });

    expect(state.players.p1.leaderCardNumber).toBe("FIX-LEADER-R");
    expect(state.players.p1.hand).toHaveLength(5);
    expect(state.players.p1.deck).toHaveLength(45);
    expect(getLegalActions(state, state.activePlayer).length).toBeGreaterThan(
      0,
    );
  });

  it("orders matchup seed slots by deck contents when there is no deck id", () => {
    // `seedMode: "matchup"` normally orders the seats by deck id. A deck with no
    // id falls back to its contents, so the two seatings still agree.
    const red = {
      leader: "FIX-LEADER-R",
      cards: [...resolveDeck("FIXTURE-RED").cards],
    };
    const blue = {
      leader: "FIX-LEADER-B",
      cards: [...resolveDeck("FIXTURE-BLUE").cards],
    };
    const original = createGame({
      ...input,
      p1: red,
      p2: blue,
      seed: "no-seed-key",
      seedMode: "matchup",
    });
    const reversed = createGame({
      ...input,
      p1: blue,
      p2: red,
      seed: "no-seed-key",
      seedMode: "matchup",
    });
    const cardNumbers = (player: (typeof original.players)["p1"]) =>
      [...player.hand, ...player.deck].map((card) => card.cardNumber);

    expect(cardNumbers(reversed.players.p2)).toEqual(
      cardNumbers(original.players.p1),
    );
    expect(cardNumbers(reversed.players.p1)).toEqual(
      cardNumbers(original.players.p2),
    );
  });

  it("imports complete format metadata for every ST31-ST36 deck", () => {
    for (const deckId of FORMAT_DECK_IDS) {
      const deck = deckManifests[deckId];
      expect(deck?.leader).toBeTruthy();
      expect(
        Object.values(deck?.cards ?? {}).reduce(
          (total, quantity) => total + quantity,
          0,
        ),
      ).toBe(50);
    }

    const st35Cards = [
      deckManifests["(Red/Black) Sabo - Starter Deck 35"]?.leader,
      ...Object.keys(
        deckManifests["(Red/Black) Sabo - Starter Deck 35"]?.cards ?? {},
      ),
    ].filter((cardNumber): cardNumber is string => Boolean(cardNumber));
    expect(st35Cards).toHaveLength(15);
    // Every identity a format deck names is in the registry, which is the only
    // support question left: a card is in it once the engine runs its text.
    for (const cardNumber of [
      ...st35Cards,
      "ST21-001",
      ...Object.keys(
        deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]?.cards ?? {},
      ),
      "OP12-020",
      ...Object.keys(
        deckManifests["(Green) Roronoa Zoro - Starter Deck 32"]?.cards ?? {},
      ),
      "OP12-040",
      ...Object.keys(
        deckManifests["(Blue) Kuzan - Starter Deck 33"]?.cards ?? {},
      ),
      "OP10-099",
      ...Object.keys(
        deckManifests["(Yellow) Eustass Kid - Starter Deck 36"]?.cards ?? {},
      ),
      "ST35-001",
      "ST36-002",
    ]) {
      expect(cardRegistry.get(cardNumber), cardNumber).toBeDefined();
    }
  });

  it("resolves ST36-002's optional On Play effect without revealing Life", () => {
    const state = completeSetup();
    const player = state.players.p1;
    player.leaderCardNumber = "OP10-099";
    player.hand.unshift({
      instanceId: "p1-effect-card",
      cardNumber: "ST36-002",
    });
    player.activeDon = ["don-1", "don-2", "don-3", "don-4"];
    const topDeckCard = player.deck[0]!;
    const initialLife = player.life.length;
    const initialDeck = player.deck.length;
    const play = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "play-card" &&
        action.cardInstanceId === "p1-effect-card",
    );
    expect(play?.type).toBe("play-card");
    if (!play || play.type !== "play-card") throw new Error("Missing play");

    const played = applyAction(state, { ...play, revision: state.revision });
    expect(played.state.pendingEffect?.sourceCardNumber).toBe("ST36-002");
    const choices = getLegalActions(played.state, "p1");
    expect(choices.map((action) => action.type)).toEqual([
      "resolve-effect",
      "resolve-effect",
    ]);
    const apply = choices.find(
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );
    if (!apply || apply.type !== "resolve-effect") {
      throw new Error("Missing effect choice");
    }

    const resolved = applyAction(played.state, {
      ...apply,
      revision: played.state.revision,
    });
    expect(resolved.state.pendingEffect).toBeNull();
    expect(resolved.state.players.p1.deck).toHaveLength(initialDeck - 1);
    expect(resolved.state.players.p1.life).toHaveLength(initialLife + 1);
    expect(resolved.state.players.p1.life[0]).toEqual(topDeckCard);
    expect(JSON.stringify(resolved.events)).not.toContain(
      topDeckCard.cardNumber,
    );
    expect(JSON.stringify(resolved.events)).not.toContain(
      topDeckCard.instanceId,
    );
  });

  it("offers only legal ST35-001 K.O. targets and moves one to trash", () => {
    const state = completeSetup();
    const player = state.players.p1;
    const opponent = state.players.p2;
    player.hand.unshift({
      instanceId: "p1-hack",
      cardNumber: "ST35-001",
    });
    player.activeDon = ["don-1", "don-2", "don-3", "don-4"];
    opponent.board = [
      { instanceId: "weak-target", cardNumber: "FIX-001", rested: false },
      { instanceId: "strong-target", cardNumber: "FIX-002", rested: false },
    ];
    const play = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-hack",
    );
    if (!play || play.type !== "play-card") throw new Error("Missing play");

    const played = applyAction(state, { ...play, revision: state.revision });
    const options = getLegalActions(played.state, "p1");
    expect(
      options.map((action) =>
        action.type === "resolve-effect" ? action.optionId : action.type,
      ),
    ).toEqual(["weak-target", "skip"]);
    const target = options.find(
      (action) =>
        action.type === "resolve-effect" && action.optionId === "weak-target",
    );
    if (!target || target.type !== "resolve-effect") {
      throw new Error("Missing target choice");
    }

    const resolved = applyAction(played.state, {
      ...target,
      revision: played.state.revision,
    });
    expect(resolved.state.players.p2.board).toEqual([
      { instanceId: "strong-target", cardNumber: "FIX-002", rested: false },
    ]);
    expect(resolved.state.players.p2.trash).toEqual([
      { instanceId: "weak-target", cardNumber: "FIX-001" },
    ]);
    expect(resolved.events).toContainEqual({
      type: "character-ko",
      playerId: "p2",
      cardInstanceId: "weak-target",
      cardNumber: "FIX-001",
      sourceCardNumber: "ST35-001",
    });
  });

  it("rests only legal ST32-005 targets when the Leader is Slash", () => {
    const state = completeSetup();
    const player = state.players.p1;
    const opponent = state.players.p2;
    player.leaderCardNumber = "OP12-020";
    player.hand.unshift({ instanceId: "p1-zoro", cardNumber: "ST32-005" });
    opponent.board = [
      { instanceId: "legal-target", cardNumber: "FIX-001", rested: false },
      { instanceId: "rested-target", cardNumber: "FIX-001", rested: true },
      {
        instanceId: "expensive-target",
        cardNumber: "ST35-001",
        rested: false,
      },
    ];
    const play = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-zoro",
    );
    if (!play || play.type !== "play-card") throw new Error("Missing play");
    const played = applyAction(state, { ...play, revision: state.revision });
    const options = getLegalActions(played.state, "p1");
    expect(
      options.map((action) =>
        action.type === "resolve-effect" ? action.optionId : action.type,
      ),
    ).toEqual(["legal-target", "skip"]);
    const target = options[0]!;
    if (target.type !== "resolve-effect") throw new Error("Missing target");

    const resolved = applyAction(played.state, {
      ...target,
      revision: played.state.revision,
    });
    expect(resolved.state.players.p2.board[0]?.rested).toBe(true);
    expect(resolved.events).toContainEqual({
      type: "character-rested",
      playerId: "p2",
      cardInstanceId: "legal-target",
      cardNumber: "FIX-001",
      sourceCardNumber: "ST32-005",
    });
  });

  it("refreshes rested Characters at the start of their controller's turn", () => {
    let state = completeSetup();
    state.players.p1.board = [
      { instanceId: "rested-character", cardNumber: "FIX-001", rested: true },
    ];
    const p1Pass = getLegalActions(state, "p1").find(
      (action) => action.type === "pass",
    )!;
    state = applyAction(state, { ...p1Pass, revision: state.revision }).state;
    expect(state.players.p1.board[0]?.rested).toBe(true);
    const p2Pass = getLegalActions(state, "p2").find(
      (action) => action.type === "pass",
    )!;
    const result = applyAction(state, {
      ...p2Pass,
      revision: state.revision,
    });
    expect(result.state.players.p1.board[0]?.rested).toBe(false);
    expect(result.events).toContainEqual({
      type: "characters-refreshed",
      playerId: "p1",
      cardInstanceIds: ["rested-character"],
    });
  });

  it("records a hashed provenance entry for every reference source", () => {
    // 32, plus the ST10 and ST18 cardlists, which are set-series pages of
    // their own.
    expect(referenceManifest.sources).toHaveLength(34);
    for (const source of referenceManifest.sources) {
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(["primary", "secondary"]).toContain(source.authority);
    }
  });
});
