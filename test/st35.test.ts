import { describe, expect, it } from "vitest";
import {
  createOnPlayEffect,
  createTriggerResult,
  currentPower,
  effectiveCost,
  getEffectOptions,
  hasKeyword,
  resolveEffect,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * Written against `test/support`. Two base positions:
 *
 * - `rules()` is a freshly created game with the ST35 Leader swapped in, for the
 *   continuous rules (power, cost, keywords) that do not need a turn played.
 * - `playable()` passes turns to the ST35 pilot's third turn, so its DON!!,
 *   hand and draws are the ones a real game has there.
 */
function rules(): ReturnType<typeof scenario> {
  return scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed("st35-rules")
    .withLeader("p1", "OP13-004");
}

function playable(): ReturnType<typeof scenario> {
  return scenario()
    .decks(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    )
    .seed("st35-playable")
    .atTurn(3, { active: "p1" });
}

describe("ST35 rules", () => {
  covers("OP13-004", "static");
  it("applies Sabo's Life penalty and DON!! x1 high-cost aura at boundaries", () => {
    const morley = (): ReturnType<typeof rules> =>
      rules().withBoard("p1", [character("morley", "OP12-093")]);

    const fourLife = morley().withLife("p1", 4).build().state;
    expect(currentPower(fourLife, "p1", "p1-leader", false)).toBe(4000);
    expect(currentPower(fourLife, "p1", "morley", false)).toBe(5000);

    const withDon = morley()
      .withLife("p1", 4)
      .withDon("p1", { leaderAttached: 1 })
      .build().state;
    expect(effectiveCost(withDon, "p1", withDon.players.p1.board[0]!)).toBe(8);
    expect(currentPower(withDon, "p1", "p1-leader", false)).toBe(5000);
    expect(currentPower(withDon, "p1", "morley", false)).toBe(6000);

    const threeLife = morley()
      .withLife("p1", 3)
      .withDon("p1", { leaderAttached: 1 })
      .build().state;
    expect(currentPower(threeLife, "p1", "p1-leader", false)).toBe(6000);
  });

  covers("ST35-004", "static");
  covers("ST35-005", "static");
  covers("OP13-081", "static");
  covers("OP12-093", "static");
  covers("P-105", "static");
  covers("ST35-001", "[Blocker]");
  it("centralizes ST35 cost modifiers and conditional Blocker keywords", () => {
    const board = [
      character("koala", "ST35-004"),
      character("kuma", "ST35-005"),
      character("black-koala", "OP13-081"),
      character("morley", "OP12-093"),
      character("sabo", "P-105"),
    ];
    const state = rules().withBoard("p1", board).build().state;

    expect(board.map((card) => effectiveCost(state, "p1", card))).toEqual([
      8, 8, 8, 8, 8,
    ]);
    expect(hasKeyword(state, "p1", "koala", "Blocker")).toBe(true);
    expect(hasKeyword(state, "p1", "sabo", "Blocker")).toBe(true);

    // Hack takes the fifth slot rather than a sixth: the board holds five, and
    // the six-card version of this scenario the builder rejected could never
    // have happened in a game.
    const withHack = rules()
      .withBoard("p1", [...board.slice(0, 4), character("hack", "ST35-001")])
      .build().state;
    expect(hasKeyword(withHack, "p1", "hack", "Blocker")).toBe(true);

    // Under a Leader that is not Sabo, the same five cards cost their printed
    // costs and P-105 loses its conditional Blocker.
    const otherLeader = rules()
      .withLeader("p1", "ST21-001")
      .withBoard("p1", board)
      .build().state;
    expect(effectiveCost(otherLeader, "p1", board[2]!)).toBe(5);
    expect(effectiveCost(otherLeader, "p1", board[3]!)).toBe(4);
    expect(effectiveCost(otherLeader, "p1", board[4]!)).toBe(4);
    expect(hasKeyword(otherLeader, "p1", "sabo", "Blocker")).toBe(false);
  });

  covers("ST35-002", "[On Play]");
  it("reduces an opponent Character by 3000 power with Lindbergh", () => {
    const source = character("lindbergh", "ST35-002");
    const state = rules()
      .withBoard("p1", [source])
      .withBoard("p2", [character("target", "ST32-001")])
      .build().state;
    state.pendingEffect = createOnPlayEffect(state, "p1", source).pending;

    expect(getEffectOptions(state).map((option) => option.optionId)).toEqual([
      "target",
      "done",
    ]);
    resolveEffect(state, "target");

    expect(currentPower(state, "p2", "target", false)).toBe(-1000);
  });

  covers("ST35-004", "[On Play]");
  it("free-plays a Revolutionary Army Character from trash and resolves its On Play", () => {
    const source = character("starter-koala", "ST35-004");
    const state = rules()
      .withBoard("p1", [source])
      .withTrash("p1", [
        { instanceId: "lindbergh", cardNumber: "ST35-002" },
        { instanceId: "wrong-type", cardNumber: "FIX-001" },
      ])
      .withBoard("p2", [character("target", "ST32-001")])
      .withDon("p1", { rested: 2 })
      .build().state;
    state.pendingEffect = createOnPlayEffect(state, "p1", source).pending;

    resolveEffect(state, "apply");
    expect(state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(getEffectOptions(state).map((option) => option.optionId)).toEqual([
      "lindbergh",
      "done",
    ]);
    resolveEffect(state, "lindbergh");
    expect(state.players.p1.board.map((card) => card.instanceId)).toContain(
      "lindbergh",
    );
    expect(state.players.p1.trash.map((card) => card.instanceId)).not.toContain(
      "lindbergh",
    );
    resolveEffect(state, "target");
    expect(currentPower(state, "p2", "target", false)).toBe(-1000);
    expect(state.pendingEffect).toBeNull();
  });

  covers("ST35-003", "[When Attacking]");
  it("resolves Karasu's optional deck cost and opponent discard", () => {
    const game = playable()
      .withBoard("p1", [character("karasu", "ST35-003")])
      .withDraw("p2", 2)
      .build();
    const originalDeckSize = game.state.players.p1.deck.length;

    game.play({ type: "attack", attackerInstanceId: "karasu" });
    expect(game.state.pendingEffect?.kind).toBe("st35-attack-cost");

    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.players.p1.deck).toHaveLength(originalDeckSize - 2);
    expect(game.state.pendingEffect?.kind).toBe("opponent-discard");
    expect(game.state.activePlayer).toBe("p2");
  });

  covers("OP12-090", "[When Attacking]");
  it("applies Belo Betty's temporary cost reduction after paying the deck cost", () => {
    const game = playable()
      .withBoard("p1", [character("betty", "OP12-090")])
      .withBoard("p2", [character("target", "ST31-001")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "betty" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "target" });

    const state = game.state;
    expect(state.players.p2.board[0]?.costModifiers).toEqual([
      { amount: -2, expiresAtTurn: state.turn },
    ]);
    expect(effectiveCost(state, "p2", state.players.p2.board[0]!)).toBe(3);
    expect(state.phase).toBe("block");
    expect(state.activePlayer).toBe("p2");
  });

  covers("P-105", "[On Play]");
  it("takes only top or bottom Life with P-105 before giving rested DON!!", () => {
    const source = character("sabo", "P-105");
    const state = rules()
      .withBoard("p1", [source])
      .withLife("p1", 3)
      .withDon("p1", { rested: 1 })
      .build().state;
    const middleLife = state.players.p1.life[1]!.instanceId;
    state.pendingEffect = createOnPlayEffect(state, "p1", source).pending;

    const options = getEffectOptions(state).map((option) => option.optionId);
    expect(options).not.toContain(middleLife);
    resolveEffect(state, options[0]!);
    expect(state.pendingEffect?.kind).toBe("give-rested-don");
  });

  covers("OP13-081", "[Activate: Main]");
  it("returns a trash card for OP13-081 once per turn and gives rested DON!!", () => {
    const game = playable()
      .withBoard("p1", [character("koala", "OP13-081")])
      .withTrash("p1", [{ instanceId: "cost", cardNumber: "ST35-003" }])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({
      type: "activate-main",
      optionId: "mechanic-main:koala",
    });
    // Two decisions inside the activation: which card the cost spends, then
    // who the DON!! goes to.
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("cost");
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "OP13-081",
        ),
    ).toBe(false);
  });

  it("names the DON!! gift's recipient on the option the chooser answers", () => {
    // OP13-004's `[DON!! x1]` aura reads DON!! on the *Leader* only, so a
    // policy that cannot tell the Leader gift from a Character gift is choosing
    // at random between switching the aura on and not. The register this
    // replaced spelled the recipient into the activation's `optionId` and
    // repeated it on `targetInstanceId`; the recipient is now a `choose` inside
    // the activation, and `describeEffectOption` names the card on each option
    // -- the same guarantee, one decision later.
    const game = playable()
      .withBoard("p1", [
        character("koala", "OP13-081"),
        character("morley", "OP12-093"),
      ])
      .withTrash("p1", [{ instanceId: "cost", cardNumber: "ST35-003" }])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:koala" });
    game.play({ type: "resolve-effect", optionId: "cost" });

    const targets = game
      .legalActions("p1")
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);

    expect(targets).toEqual(["p1-leader", "koala", "morley", "skip"]);
  });

  it("offers Hack as an active Blocker and rests it on redirection", () => {
    const game = playable()
      .withBoard("p1", [character("hack", "ST35-001")])
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "p2-leader",
        targetInstanceId: "p1-leader",
        attackPower: 5000,
        counterPower: 0,
      })
      .build();

    game.play({ type: "block", blockerInstanceId: "hack" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("hack");
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
  });

  covers("OP13-005", "[On Play]");
  it("optionally gives rested DON!! to the Leader with Inazuma", () => {
    const source = character("inazuma", "OP13-005");
    const state = rules()
      .withBoard("p1", [source])
      .withDon("p1", { rested: 1 })
      .build().state;
    state.pendingEffect = createOnPlayEffect(state, "p1", source).pending;

    expect(getEffectOptions(state).map((option) => option.optionId)).toEqual([
      "apply",
      "skip",
    ]);
    resolveEffect(state, "apply");
    expect(state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  covers("OP13-008", "static");
  covers("OP13-017", "static");
  it("offers Ivankov and Dragon replacements for opponent-effect K.O.", () => {
    const state = rules()
      .withBoard("p1", [
        character("target", "ST35-002"),
        character("ivankov", "OP13-008"),
        character("dragon", "OP13-017"),
      ])
      .build().state;
    // A K.O. mid-resolution: the opposing effect that would cause it is the
    // scenario's premise, not what is under test.
    state.pendingEffect = {
      kind: "ko-character",
      playerId: "p2",
      targetPlayerId: "p1",
      sourceCardNumber: "ST35-001",
      sourceInstanceId: "source",
      eligibleInstanceIds: ["target"],
      resumePhase: "main",
      resumePlayerId: "p2",
    };

    // The source picks the target first and sees only targets; the replacement
    // belongs to the target's controller and is asked in a second step.
    expect(getEffectOptions(state).map((option) => option.optionId)).toEqual([
      "target",
      "skip",
    ]);
    resolveEffect(state, "target");

    expect(state.pendingEffect.kind).toBe("replacement-choice");
    expect(state.activePlayer).toBe("p1");
    const options = getEffectOptions(state).map((option) => option.optionId);
    expect(options).toContain("mechanic:target:ivankov");
    expect(options).toContain("mechanic:target:dragon");
    resolveEffect(state, "mechanic:target:dragon");
    expect(state.players.p1.board.map((card) => card.instanceId)).toContain(
      "target",
    );
    expect(currentPower(state, "p1", "dragon", false)).toBe(5000);
    expect(state.oncePerTurn).toContain(`${state.turn}:p1:dragon:replacement`);
  });

  covers("OP12-098", "[Counter]");
  it("uses Hair Removal Fist for +4000 Counter with an 8-cost Revolutionary", () => {
    const game = playable()
      .withBoard("p1", [character("morley", "OP12-093")])
      .withHand("p1", [{ instanceId: "event", cardNumber: "OP12-098" }])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "p2-leader",
          targetInstanceId: "p1-leader",
          attackPower: 9000,
          counterPower: 0,
        },
        "counter",
      )
      .build();
    const restedBefore = game.state.players.p1.restedDon.length;

    game.play({ type: "activate-counter-event" });

    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore + 1);
  });

  covers("OP12-098", "[Trigger]");
  it("draws then trashes the next top card for Hair Removal Fist's Trigger", () => {
    const state = rules().build().state;
    const source = { instanceId: "event", cardNumber: "OP12-098" };
    const drawn = state.players.p1.deck[0]!;
    const trashed = state.players.p1.deck[1]!;

    const result = createTriggerResult(state, "p1", source);

    expect(result.pending).toBeNull();
    expect(state.players.p1.hand).toContainEqual(drawn);
    expect(state.players.p1.trash).toContainEqual(trashed);
  });

  covers("OP13-019", "[Main]");
  it("pays five DON!! for Ace's Main effect, reduces power, then K.O.s", () => {
    const game = playable()
      .withHand("p1", [{ instanceId: "ace-event", cardNumber: "OP13-019" }])
      .withDon("p1", { active: 4 })
      .withBoard("p2", [character("target", "ST31-001")])
      .build();

    game.play({
      type: "activate-main",
      optionId: "mechanic-event:ace-event",
    });
    game.play({ type: "resolve-effect", optionId: "target" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p1.restedDon).toHaveLength(5);
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.trash.at(-1)?.instanceId).toBe("target");
  });

  covers("ST35-001", "[On Play]");
  it("ST35-001:positive K.O.s a 2000-power Character on play", () => {
    const game = playable()
      .withHand("p1", [instance("hack", "ST35-001")])
      .withBoard("p2", [
        character("nami", "OP01-016"),
        character("brook", "ST31-003"),
      ])
      .withDon("p1", { active: 1 })
      .build();

    game.play({ type: "play-card", cardNumber: "ST35-001" });
    // Nami's base power is 2000 and Brook's 3000, so the clause reaches one.
    expect(
      game
        .legalActions()
        .filter((action) => action.type === "resolve-effect")
        .map((action) => action.optionId),
    ).toEqual(["nami", "skip"]);
    game.play({ type: "resolve-effect", optionId: "nami" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "brook",
    ]);
  });

  covers("ST35-005", "[On Play]");
  it("ST35-005:positive gives a rested DON!! then free-plays a 4000-power body", () => {
    const game = scenario()
      .decks(
        "(Red/Black) Sabo - Starter Deck 35",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("st35-005-on-play")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("kuma", "ST35-005"),
        instance("lindbergh", "ST35-002"),
      ])
      .withBoard("p2", [character("target", "ST31-001")])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "ST35-005" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);

    // Lindbergh is the only 4000-power {Revolutionary Army} body in hand, and
    // its own [On Play] follows the free play.
    game.play({ type: "resolve-effect", optionId: "lindbergh" });
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("ST35-002");
    game.play({ type: "resolve-effect", optionId: "target" });
    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -3000 }),
    );
  });

  covers("OP13-019", "[Counter]");
  it("OP13-019:positive gives the Leader +3000 in the battle it is played in", () => {
    const game = scenario()
      .decks(
        "(Red/Black) Sabo - Starter Deck 35",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("st35-ace-counter")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("ace-event", "OP13-019")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({
      type: "activate-counter-event",
      eventInstanceId: "ace-event",
    });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP13-019",
    ]);
  });

  // The power is printed for the Leader alone and the clause does nothing
  // else, so it is worth nothing while a Character is the card being attacked.
  it("OP13-019:positive is not offered while a Character is the target", () => {
    const game = scenario()
      .decks(
        "(Red/Black) Sabo - Starter Deck 35",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("st35-ace-counter-character")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("ace-event", "OP13-019")])
      .withBoard("p1", [character("body", "ST35-002")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "body",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect(
      game
        .legalActions()
        .find((action) => action.type === "activate-counter-event"),
    ).toBeUndefined();
  });
});
