import { describe, expect, it } from "vitest";
import { cardNames, hasCardName } from "@one-piece-sim/cards";
import { resolveDeck } from "@one-piece-sim/decks";
import {
  applyAction,
  createGame,
  currentPower,
  fieldDonCount,
  getLegalActions,
  observe,
  type BoardCard,
  type GameState,
} from "@one-piece-sim/engine-core";
import { covers, setTurnPlayer } from "./support/index.js";

const character = (
  instanceId: string,
  cardNumber: string,
  overrides: Partial<BoardCard> = {},
): BoardCard => ({
  instanceId,
  cardNumber,
  rested: false,
  playedTurn: 1,
  attachedDon: [],
  powerModifiers: [],
  ...overrides,
});

const inHand = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
});

function actions(state: GameState) {
  return getLegalActions(state, state.activePlayer);
}

function submit(
  state: GameState,
  predicate: (action: ReturnType<typeof getLegalActions>[number]) => boolean,
  label = "no matching legal action",
): GameState {
  const action = actions(state).find(predicate);
  expect(
    action,
    `${label}: ${actions(state)
      .map((candidate) => candidate.summary)
      .join(" | ")}`,
  ).toBeDefined();
  return applyAction(state, { ...action!, revision: state.revision }).state;
}

/**
 * A cleared board at turn 6, with both seats holding nothing but their Life.
 *
 * No shipped list fronts OP12-061, so the Leader is set over a shipped Purple
 * deck: every card these tests drive is placed by hand, and the fifty behind
 * the Leader only has to be a legal one.
 */
function scenario(donCount = 8): GameState {
  const state = createGame({
    gameId: "op12-rosinante",
    p1: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
    p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    seed: "op12-rosinante-seed",
  });
  state.players.p1.leaderCardNumber = "OP12-061";
  state.phase = "main";
  state.turn = 6;
  setTurnPlayer(state, "p1");
  for (const playerId of ["p1", "p2"] as const) {
    Object.assign(state.players[playerId], {
      hand: [],
      board: [],
      stage: null,
      activeDon: [],
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
    });
    state.players[playerId].life = state.players[playerId].deck.splice(0, 4);
  }
  state.players.p1.activeDon = Array.from(
    { length: donCount },
    (_, index) => `p1-don-${index}`,
  );
  return state;
}

describe("EB04-038 answers to three names", () => {
  covers("EB04-038", "static");
  it("reads the alias clause off the printed text", () => {
    expect(cardNames("EB04-038")).toEqual([
      "Rosinante & Law",
      "Trafalgar Law",
      "Donquixote Rosinante",
    ]);
  });

  it("leaves a card without the clause with only its printed name", () => {
    expect(cardNames("OP12-073")).toEqual(["Trafalgar Law"]);
    expect(hasCardName("OP12-108", "Trafalgar Law")).toBe(false);
  });

  covers("OP12-108", "[On Play]");
  it("is found by OP12-108's search for a [Trafalgar Law]", () => {
    const state = scenario();
    const player = state.players.p1;
    player.hand = [inHand("p1-rosi", "OP12-108")];
    player.deck = [
      inHand("p1-deck-0", "OP05-077"),
      inHand("p1-deck-1", "EB04-038"),
      inHand("p1-deck-2", "OP05-077"),
      inHand("p1-deck-3", "OP05-077"),
      inHand("p1-deck-4", "OP05-077"),
      ...player.deck,
    ];
    const played = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-rosi",
    );
    const added = submit(
      played,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "p1-deck-1",
      "EB04-038 was not offered to the [Trafalgar Law] search",
    );
    expect(added.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "EB04-038",
    );
  });

  it("reveals only the added card to the opponent", () => {
    const state = scenario();
    const player = state.players.p1;
    player.hand = [inHand("p1-rosi", "OP12-108")];
    player.deck = [
      inHand("p1-deck-0", "OP05-077"),
      inHand("p1-deck-1", "EB04-038"),
      inHand("p1-deck-2", "OP05-077"),
      inHand("p1-deck-3", "OP05-077"),
      inHand("p1-deck-4", "OP05-077"),
      ...player.deck,
    ];

    const played = applyAction(state, {
      ...getLegalActions(state, "p1").find(
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "p1-rosi",
      )!,
      revision: state.revision,
    });
    const chosen = applyAction(played.state, {
      ...getLegalActions(played.state, "p1").find(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "p1-deck-1",
      )!,
      revision: played.state.revision,
    });

    // The five looked-at cards stay private steps, one per card.
    const looks = played.events.filter(
      (event) => event.type === "card-revealed",
    );
    expect(looks).toHaveLength(5);
    expect(looks.every((event) => event.visibleTo === "p1")).toBe(true);

    // OP12-108 prints "[printed text omitted -- pnpm card:text OP12-108]": the added card is
    // public, so the move to hand emits a reveal both players see.
    const reveal = chosen.events.find(
      (event) => event.type === "card-revealed",
    );
    expect(reveal).toMatchObject({
      playerId: "p1",
      cardNumber: "EB04-038",
      sourceCardNumber: "OP12-108",
    });
    expect(reveal).not.toHaveProperty("visibleTo");
    // p1 sees both the private look step and the public reveal; the opponent
    // sees only the public reveal.
    expect(
      observe(chosen.state, "p1").publicEvents.filter(
        (event) =>
          event.type === "card-revealed" && event.cardNumber === "EB04-038",
      ),
    ).toHaveLength(2);
    expect(
      observe(chosen.state, "p2").publicEvents.filter(
        (event) =>
          event.type === "card-revealed" && event.cardNumber === "EB04-038",
      ),
    ).toHaveLength(1);
  });
});

describe("the catch-up ramp reads both fields", () => {
  covers("EB04-038", "[On Play]");
  it("splits EB04-038 into a conditional draw and an unconditional ramp", () => {
    const state = scenario(8);
    state.players.p2.activeDon = ["p2-don-0", "p2-don-1"];
    state.players.p1.hand = [inHand("p1-eb04", "EB04-038")];
    const hand = state.players.p1.hand.length;
    const donDeck = state.players.p1.donDeck.length;
    const played = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-eb04",
    );
    // Ahead on DON!!, so no draw -- but the DON!! still arrives, active.
    expect(played.players.p1.hand.length).toBe(hand - 1);
    expect(played.players.p1.donDeck.length).toBe(donDeck - 1);
  });
});

describe("OP12-073 buffs a disjunction once", () => {
  covers("OP12-073", "[On Play]");
  it("raises [Donquixote Rosinante] and {Heart Pirates} alike", () => {
    const state = scenario(8);
    state.players.p1.hand = [inHand("p1-law", "OP12-073")];
    state.players.p1.board = [
      // {Heart Pirates}, matched by the type half.
      character("p1-p093", "ST10-010"),
      // Named [Donquixote Rosinante] and typed Navy/Donquixote Pirates, so it is
      // matched by the name half and only by that half.
      character("p1-eb04", "EB04-038"),
      // Neither: {Straw Hat Crew}.
      character("p1-uso", "ST18-001"),
    ];
    const played = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-law",
    );
    expect(currentPower(played, "p1", "p1-p093")).toBe(6_000);
    expect(currentPower(played, "p1", "p1-eb04")).toBe(9_000);
    expect(currentPower(played, "p1", "p1-uso")).toBe(3_000);
  });

  it("buffs itself, because it is on the board when its own clause runs", () => {
    const state = scenario(8);
    state.players.p1.hand = [inHand("p1-law", "OP12-073")];
    const played = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-law",
    );
    const self = played.players.p1.board.find(
      (card) => card.cardNumber === "OP12-073",
    );
    expect(self).toBeDefined();
    expect(currentPower(played, "p1", self!.instanceId)).toBe(9_000);
  });
});

describe("the Leader's cost reduction", () => {
  const withLeaderAndTarget = (): GameState => {
    const state = scenario(8);
    state.players.p1.hand = [inHand("p1-eb04", "EB04-038")];
    return state;
  };

  covers("OP12-061", "[Activate: Main]");
  it("discounts the next [Trafalgar Law] of cost 4 or more by 2", () => {
    const state = withLeaderAndTarget();
    const donDeck = state.players.p1.donDeck.length;
    const activated = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-main:p1-leader",
    );
    // DON!! -1 is permanent: the card goes back to the DON!! deck.
    expect(activated.players.p1.donDeck.length).toBe(donDeck + 1);
    expect(fieldDonCount(activated, "p1")).toBe(7);
    const play = actions(activated).find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-eb04",
    );
    expect(play?.summary).toContain("cost 4 DON!!");
    const played = applyAction(activated, {
      ...play!,
      revision: activated.revision,
    }).state;
    // 7 active, 4 spent, and EB04-038's own [On Play] then adds one back active.
    expect(played.players.p1.activeDon.length).toBe(4);
  });

  it("is spent by the first qualifying play and not the second", () => {
    const state = withLeaderAndTarget();
    state.players.p1.hand.push(inHand("p1-eb04-b", "EB04-038"));
    const activated = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-main:p1-leader",
    );
    const first = submit(
      activated,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-eb04",
    );
    expect(first.players.p1.playDiscount).toBeUndefined();
    const second = actions(first).find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-eb04-b",
    );
    // Only 3 active DON!! remain, and the second copy is back to full price.
    expect(second).toBeUndefined();
  });

  it("is not offered without a qualifying [Trafalgar Law] in hand", () => {
    const state = scenario(8);
    // A 1-cost Trafalgar Law is below the printed floor of 4.
    state.players.p1.hand = [inHand("p1-law", "OP09-069")];
    expect(
      actions(state).some(
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-main:p1-leader",
      ),
    ).toBe(false);
  });

  // The activation was offered by two generators at once -- the generic
  // Leader block reading the mechanic table, and a hardcoded OP12-061 branch --
  // stamping two different once-per-turn keys, so neither offer blocked the
  // other and the DON!! −1 could be paid twice a turn. Counting the offers is
  // what catches a second generator coming back; asserting `false` after one
  // activation would pass with a duplicate still on the table.
  it("is offered once, and is once per turn", () => {
    const state = withLeaderAndTarget();
    const offers = (position: GameState) =>
      actions(position).filter(
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "p1-leader",
      );
    expect(offers(state)).toHaveLength(1);
    const activated = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-main:p1-leader",
    );
    expect(offers(activated)).toHaveLength(0);
  });
});

describe("the Leader's K.O. protection", () => {
  covers("OP12-061", "static");
  it("offers a Life card instead when a [Trafalgar Law] loses a battle", () => {
    const state = scenario(4);
    state.turn = 7;
    setTurnPlayer(state, "p2");
    // The attacker is p2's Leader with 2 DON!! given: 7000 against ST10-010's
    // 5000, and no printed effect of its own to interleave with the battle.
    state.players.p2.leaderAttachedDon = ["p2-don-0", "p2-don-1"];
    state.players.p1.board = [
      character("p1-p093", "ST10-010", { rested: true }),
    ];
    const declared = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.targetInstanceId === "p1-p093" &&
        action.attackerInstanceId === "p2-leader",
    );
    // Attacker, then defender's Block and Counter steps, then the replacement.
    let resolved = declared;
    while (
      resolved.pendingEffect?.kind !== "battle-ko-replacement" &&
      resolved.phase !== "main"
    ) {
      resolved = submit(resolved, (action) => action.type === "pass");
    }
    expect(resolved.pendingEffect?.kind).toBe("battle-ko-replacement");
    expect(resolved.activePlayer).toBe("p1");
    const life = resolved.players.p1.life.length;
    const saved = submit(
      resolved,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );
    expect(saved.players.p1.life.length).toBe(life - 1);
    expect(saved.players.p1.hand.length).toBe(1);
    expect(
      saved.players.p1.board.some((card) => card.instanceId === "p1-p093"),
    ).toBe(true);
    expect(saved.players.p1.trash).toHaveLength(0);
  });

  it("K.O.s the Character when the protection is declined", () => {
    const state = scenario(4);
    state.turn = 7;
    setTurnPlayer(state, "p2");
    // The attacker is p2's Leader with 2 DON!! given: 7000 against ST10-010's
    // 5000, and no printed effect of its own to interleave with the battle.
    state.players.p2.leaderAttachedDon = ["p2-don-0", "p2-don-1"];
    state.players.p1.board = [
      character("p1-p093", "ST10-010", { rested: true }),
    ];
    let resolved = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.targetInstanceId === "p1-p093" &&
        action.attackerInstanceId === "p2-leader",
    );
    while (
      resolved.pendingEffect?.kind !== "battle-ko-replacement" &&
      resolved.phase !== "main"
    ) {
      resolved = submit(resolved, (action) => action.type === "pass");
    }
    const lost = submit(
      resolved,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "skip",
    );
    expect(
      lost.players.p1.board.some((card) => card.instanceId === "p1-p093"),
    ).toBe(false);
    expect(lost.players.p1.trash.map((card) => card.cardNumber)).toContain(
      "ST10-010",
    );
    // Declining does not spend the once-per-turn use.
    expect(lost.oncePerTurn).not.toContain(
      `${lost.turn}:p1:OP12-061:replacement`,
    );
  });

  it("is not offered for a Character that is not a [Trafalgar Law]", () => {
    const state = scenario(4);
    state.turn = 7;
    setTurnPlayer(state, "p2");
    // 5000 Leader against a 3000 body; no DON!! needed.
    state.players.p1.board = [
      character("p1-uso", "ST18-001", { rested: true }),
    ];
    let resolved = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.targetInstanceId === "p1-uso" &&
        action.attackerInstanceId === "p2-leader",
    );
    while (resolved.phase !== "main" && resolved.pendingEffect === null) {
      resolved = submit(resolved, (action) => action.type === "pass");
    }
    expect(resolved.pendingEffect?.kind).not.toBe("battle-ko-replacement");
    expect(
      resolved.players.p1.board.some((card) => card.instanceId === "p1-uso"),
    ).toBe(false);
  });

  it("is not offered at zero Life, because the replacement cannot be paid", () => {
    const state = scenario(4);
    state.turn = 7;
    setTurnPlayer(state, "p2");
    state.players.p1.life = [];
    // The attacker is p2's Leader with 2 DON!! given: 7000 against ST10-010's
    // 5000, and no printed effect of its own to interleave with the battle.
    state.players.p2.leaderAttachedDon = ["p2-don-0", "p2-don-1"];
    state.players.p1.board = [
      character("p1-p093", "ST10-010", { rested: true }),
    ];
    let resolved = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.targetInstanceId === "p1-p093" &&
        action.attackerInstanceId === "p2-leader",
    );
    while (resolved.phase !== "main" && resolved.pendingEffect === null) {
      resolved = submit(resolved, (action) => action.type === "pass");
    }
    expect(resolved.pendingEffect?.kind).not.toBe("battle-ko-replacement");
  });
});

describe("ST10-010 trashes the opponent's own choice of cards", () => {
  const scene = (opponentHand: number): GameState => {
    const state = scenario(8);
    state.players.p1.hand = [inHand("p1-law", "ST10-010")];
    state.players.p2.hand = Array.from({ length: opponentHand }, (_, index) =>
      inHand(`p2-hand-${index}`, "ST31-001"),
    );
    return state;
  };

  covers("ST10-010", "[On Play]");
  it("hands the choice to the opponent and takes two cards", () => {
    const state = scene(7);
    const donDeck = state.players.p1.donDeck.length;
    const played = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-law",
    );
    const paid = submit(
      played,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );
    expect(paid.players.p1.donDeck.length).toBe(donDeck + 1);
    // The `DON!! −1` is answered by the player who paid it before the discard
    // choice this effect queued for the opponent is handed over.
    expect(paid.activePlayer).toBe("p1");
    expect(paid.pendingEffect?.kind).toBe("return-don");
    const placed = submit(
      paid,
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === "return-don:rested",
    );
    expect(placed.activePlayer).toBe("p2");
    const first = submit(
      placed,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "p2-hand-0",
    );
    expect(first.activePlayer).toBe("p2");
    const second = submit(
      first,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "p2-hand-1",
    );
    expect(second.players.p2.hand).toHaveLength(5);
    expect(second.players.p2.trash).toHaveLength(2);
    // Control comes back to the player whose turn it is.
    expect(second.activePlayer).toBe("p1");
    expect(second.phase).toBe("main");
  });

  it("does not offer the DON!! cost against a hand under seven", () => {
    const state = scene(6);
    const played = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "p1-law",
    );
    expect(played.pendingEffect).toBeNull();
    expect(played.activePlayer).toBe("p1");
  });
});

describe("OP12-115 I Love You!! as a Counter Event", () => {
  const underAttack = (life: number): GameState => {
    const state = scenario(4);
    state.turn = 7;
    setTurnPlayer(state, "p2");
    state.players.p1.life = state.players.p1.life.slice(0, life);
    state.players.p1.hand = [inHand("p1-love", "OP12-115")];
    state.players.p1.activeDon = ["p1-don-0", "p1-don-1"];
    state.players.p1.trash = [inHand("p1-trash-law", "ST10-010")];
    state.players.p2.leaderAttachedDon = ["p2-don-0"];
    return submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.targetInstanceId === "p1-leader" &&
        action.attackerInstanceId === "p2-leader",
    );
  };

  covers("OP12-115", "[Counter]");
  it("adds its power and recovers a [Trafalgar Law] at 2 or less Life", () => {
    let state = underAttack(2);
    while (state.phase !== "counter") {
      state = submit(state, (action) => action.type === "pass");
    }
    const countered = submit(
      state,
      (action) =>
        action.type === "activate-counter-event" &&
        action.eventInstanceId === "p1-love",
    );
    expect(countered.activeAttack?.counterPower).toBe(2_000);
    const recovered = submit(
      countered,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "p1-trash-law",
      "the trash [Trafalgar Law] was not offered",
    );
    expect(recovered.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "ST10-010",
    );
    // The Counter step is still open once the recursion resolves.
    expect(recovered.phase).toBe("counter");
    expect(recovered.activePlayer).toBe("p1");
  });

  it("adds only its power above 2 Life", () => {
    let state = underAttack(4);
    while (state.phase !== "counter") {
      state = submit(state, (action) => action.type === "pass");
    }
    const countered = submit(
      state,
      (action) =>
        action.type === "activate-counter-event" &&
        action.eventInstanceId === "p1-love",
    );
    expect(countered.activeAttack?.counterPower).toBe(2_000);
    expect(countered.pendingEffect).toBeNull();
    expect(countered.players.p1.trash.map((card) => card.cardNumber)).toContain(
      "OP12-115",
    );
  });
});
