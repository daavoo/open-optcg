import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { covers, fabricatedAttack, setTurnPlayer } from "./support/index.js";

import { resolveDeck } from "@one-piece-sim/decks";

const card = (instanceId: string, cardNumber: string, faceUp?: boolean) => ({
  instanceId,
  cardNumber,
  ...(faceUp === undefined ? {} : { faceUp }),
});

const character = (instanceId: string, cardNumber: string, rested = false) => ({
  instanceId,
  cardNumber,
  rested,
  playedTurn: 1,
  attachedDon: [],
  powerModifiers: [],
});

function action(
  state: GameState,
  predicate: (candidate: LegalAction) => boolean,
): LegalAction {
  const found = getLegalActions(state, state.activePlayer).find(predicate);
  if (!found) throw new Error("Missing expected legal action");
  return found;
}

function submit(state: GameState, legalAction: LegalAction): GameState {
  return applyAction(state, {
    ...legalAction,
    revision: state.revision,
  }).state;
}

function scenario(): GameState {
  let state = createGame({
    gameId: "st36-scenario",
    p1: resolveDeck("(Yellow) Eustass Kid - Starter Deck 36"),
    p2: resolveDeck("FIXTURE-RED"),
    seed: "st36-seed",
  });
  state = submit(
    state,
    action(state, (candidate) => candidate.type === "mulligan-decision"),
  );
  state = submit(
    state,
    action(state, (candidate) => candidate.type === "mulligan-decision"),
  );
  state.turn = 3;
  state.phase = "main";
  setTurnPlayer(state, "p1");
  state.pendingEffect = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  state.oncePerTurn = [];
  Object.assign(state.players.p1, {
    leaderCardNumber: "OP10-099",
    hand: [],
    deck: [card("p1-draw", "OP10-101")],
    life: [card("p1-life", "OP10-101", false)],
    board: [],
    trash: [],
    activeDon: Array.from({ length: 10 }, (_, index) => `p1-a-${index}`),
    restedDon: [],
    leaderAttachedDon: [],
    leaderPowerModifiers: [],
    leaderRested: false,
  });
  Object.assign(state.players.p2, {
    hand: [],
    deck: [card("p2-draw", "FIX-001")],
    life: [card("p2-life", "FIX-001", false)],
    board: [],
    trash: [],
    activeDon: Array.from({ length: 10 }, (_, index) => `p2-a-${index}`),
    restedDon: [],
    leaderAttachedDon: [],
    leaderPowerModifiers: [],
    leaderRested: false,
  });
  return state;
}

describe("ST36 rules", () => {
  covers("OP10-099", "[End of Your Turn]");
  it("turns Life face-up at end of turn and grants temporary Blocker", () => {
    let state = scenario();
    state.players.p1.board = [character("cavendish", "ST36-001", true)];

    state = submit(
      state,
      action(state, (candidate) => candidate.type === "pass"),
    );
    expect(state.pendingEffect?.kind).toBe("kid-leader-end-turn");
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === "cavendish",
      ),
    );

    expect(state.players.p1.life[0]?.faceUp).toBe(true);
    expect(observe(state, "p2").opponent.life[0]).toEqual(
      expect.objectContaining({ cardNumber: "OP10-101", faceUp: true }),
    );
    expect(state.players.p1.board[0]).toMatchObject({
      rested: false,
      blockerUntilTurn: 4,
    });
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "attack" &&
          candidate.targetInstanceId === "p1-leader",
      ),
    );
    expect(
      getLegalActions(state, "p1").some(
        (candidate) =>
          candidate.type === "block" &&
          candidate.blockerInstanceId === "cavendish",
      ),
    ).toBe(true);
  });

  it("ends the turn without offering the Leader effect at zero Life", () => {
    let state = scenario();
    state.players.p1.life = [];
    state.players.p1.board = [character("cavendish", "ST36-001", true)];

    state = submit(
      state,
      action(state, (candidate) => candidate.type === "pass"),
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.activePlayer).toBe("p2");
    expect(state.turn).toBe(4);
  });

  covers("OP10-103", "[On Play]");
  covers("ST36-004", "[On Play]");
  covers("P-085", "[On Play]");
  covers("OP10-111", "[On Play]");
  it("resolves Bege, Bartolomeo, Bonney, and Supernova searches", () => {
    let state = scenario();
    state.players.p1.hand = [card("bege", "OP10-103"), card("law", "P-088")];
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "play-card" && candidate.cardInstanceId === "bege",
      ),
    );
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" && candidate.optionId === "top",
      ),
    );
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" && candidate.optionId === "law",
      ),
    );
    expect(state.players.p1.life[0]).toMatchObject({
      cardNumber: "P-088",
      faceUp: true,
    });

    state = scenario();
    state.players.p1.hand = [card("barto", "ST36-004"), card("law", "P-088")];
    state.players.p1.deck = [
      card("draw-a", "OP10-101"),
      card("draw-b", "OP10-101"),
    ];
    state = submit(
      state,
      action(state, (candidate) => candidate.type === "play-card"),
    );
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" && candidate.optionId === "law",
      ),
    );
    expect(state.players.p1.hand).toHaveLength(2);

    state = scenario();
    state.players.p1.hand = [card("bonney", "P-085")];
    state.players.p2.board = [character("small", "FIX-002")];
    state = submit(
      state,
      action(state, (candidate) => candidate.type === "play-card"),
    );
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === "top:small",
      ),
    );
    expect(state.players.p2.board).toEqual([]);
    expect(state.players.p2.life[0]).toMatchObject({
      cardNumber: "FIX-002",
      faceUp: true,
    });

    state = scenario();
    state.players.p1.hand = [card("searcher", "OP10-111")];
    state.players.p1.deck = [card("hit", "P-088"), card("miss", "FIX-001")];
    state = submit(
      state,
      action(state, (candidate) => candidate.type === "play-card"),
    );
    expect(
      getLegalActions(state, "p1").some(
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === "search-select:hit",
      ),
    ).toBe(true);
  });

  covers("OP10-114", "[Activate: Main]");
  covers("ST36-005", "[Activate: Main]", "[On Your Opponent's Attack]");
  it("uses X.Drake and both 6-cost Kid abilities", () => {
    let state = scenario();
    state.players.p1.board = [character("drake", "OP10-114")];
    state.players.p2.board = [character("target", "FIX-002")];
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "activate-main" &&
          candidate.optionId === "mechanic-main:drake",
      ),
    );
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === "target",
      ),
    );
    expect(state.players.p1.board[0]?.rested).toBe(true);
    expect(state.players.p2.board[0]?.rested).toBe(true);

    state = scenario();
    state.players.p1.board = [character("kid", "ST36-005")];
    state.players.p1.restedDon = ["rested-don"];
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "activate-main" &&
          candidate.optionId === "mechanic-main:kid",
      ),
    );
    // Which Life card the cost turns is the decision: "top or bottom".
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === state.players.p1.life[0]!.instanceId,
      ),
    );
    expect(state.players.p1.life[0]?.faceUp).toBe(true);
    expect(state.players.p1.leaderAttachedDon).toEqual(["rested-don"]);

    setTurnPlayer(state, "p2");
    state.players.p1.board.push(character("attack-target", "ST36-001", true));
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "attack" &&
          candidate.targetInstanceId === "attack-target",
      ),
    );
    // The redirect is an `[On Your Opponent's Attack]` offer now, not a `block`
    // action with a `:redirect:` id: it is not a block, and the ladder that
    // offers a defender's reactions is where it belongs.
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" && candidate.optionId === "apply",
      ),
    );
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === state.players.p1.life[0]!.instanceId,
      ),
    );
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === "p1-leader",
      ),
    );
    expect(state.activeAttack?.targetInstanceId).toBe("p1-leader");
    expect(state.players.p1.life[0]?.faceUp).toBe(false);
    // One clause, one `[Once Per Turn]`, one window. The Blocker window that
    // follows offers blocks and nothing else, so the same Kid cannot turn a
    // second Life card face-down to move the attack again -- and cannot move it
    // back onto the card it was already hitting.
    expect(state.phase).toBe("block");
    expect(
      getLegalActions(state, "p1").every(
        (candidate) => candidate.type === "pass",
      ),
    ).toBe(true);
  });

  covers("ST36-001", "[On K.O.]");
  covers("OP10-109", "[On K.O.]");
  covers("OP12-113", "[On K.O.]");
  it("dispatches Cavendish, Hawkins, and Zoro On K.O. effects", () => {
    let state = scenario();
    state.players.p1.hand = [card("discard", "OP10-101")];
    state.players.p1.deck = [card("new-life", "P-088")];
    state.pendingEffect = {
      kind: "discard-for-life",
      playerId: "p1",
      sourceCardNumber: "ST36-001",
      sourceInstanceId: "cavendish",
      eligibleInstanceIds: ["discard"],
    };
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === "discard",
      ),
    );
    expect(state.players.p1.life[0]?.cardNumber).toBe("P-088");

    state = scenario();
    state.pendingEffect = {
      kind: "trash-opponent-life",
      playerId: "p1",
      targetPlayerId: "p2",
      sourceCardNumber: "OP10-109",
      sourceInstanceId: "hawkins",
    };
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" && candidate.optionId === "apply",
      ),
    );
    expect(state.players.p2.life).toEqual([]);

    state = scenario();
    state.players.p1.hand = [card("law", "P-088")];
    state.pendingEffect = {
      kind: "free-play-rested",
      playerId: "p1",
      sourceCardNumber: "OP12-113",
      sourceInstanceId: "zoro",
      eligibleInstanceIds: ["law"],
    };
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" && candidate.optionId === "law",
      ),
    );
    expect(state.players.p1.board[0]).toMatchObject({
      cardNumber: "P-088",
      rested: true,
    });

    state = scenario();
    state.players.p1.hand = [card("barto", "ST36-004"), card("law", "P-088")];
    state.players.p1.deck = [
      card("draw-a", "OP10-101"),
      card("draw-b", "OP10-101"),
    ];
    state.pendingEffect = {
      kind: "free-play-rested",
      playerId: "p1",
      sourceCardNumber: "OP12-113",
      sourceInstanceId: "zoro",
      eligibleInstanceIds: ["barto"],
      resumePhase: "main",
      resumePlayerId: "p2",
    };
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" && candidate.optionId === "barto",
      ),
    );
    expect(state.pendingEffect?.kind).toBe("discard-supernova-draw-two");
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-effect" && candidate.optionId === "law",
      ),
    );
    expect(state.activePlayer).toBe("p2");
  });

  it("K.O.s the opponent's Character when Zoro's Trigger fires off effect damage", () => {
    // A Trigger raised by an *effect* rather than by battle damage carries a
    // `resume` seat -- EB03-055 Nico Robin deals 1 damage from an [On K.O.]
    // mid-Main-phase -- and that seat is the controller's own. OP12-113 reads
    // "your opponent's Characters" from its controller, but the resolution
    // used to read it from the resume seat, look for the chosen Character on
    // the controller's own board, and throw MISSING_EFFECT_TARGET on a target
    // the offer had just listed. Found by a whole-field rules-agent sweep: ST36
    // Kid vs the Nami feature deck, seed `...-2`, which crashed the whole run.
    let state = scenario();
    state.phase = "trigger";
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p2.board = [character("small", "FIX-001")];
    state.pendingTrigger = {
      playerId: "p1",
      card: card("trigger", "OP12-113"),
      resume: { phase: "main", playerId: "p1" },
    };

    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-trigger" &&
          candidate.optionId === "small",
      ),
    );

    expect(state.players.p2.board).toEqual([]);
    expect(state.players.p1.hand.at(-1)?.cardNumber).toBe("OP12-113");
  });

  covers("ST36-002", "[Trigger]");
  covers("ST36-003", "[Trigger]");
  covers("OP10-109", "[Trigger]");
  covers("P-088", "[Trigger]");
  covers("OP12-113", "[Trigger]");
  covers("OP13-116", "[Trigger]");
  it("resolves Killer, Apoo, Hawkins, Law, Zoro, and Event Triggers", () => {
    const triggered = (cardNumber: string): GameState => {
      const state = scenario();
      state.phase = "trigger";
      // p1 acts -- it is defending -- inside p2's turn, which the
      // fabricated attack below is the rest of. The two are separate facts.
      state.activePlayer = "p1";
      state.turnPlayerId = "p2";
      state.pendingTrigger = {
        playerId: "p1",
        card: card("trigger", cardNumber),
      };
      state.activeAttack = fabricatedAttack(state, {
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "p2-leader",
        targetInstanceId: "p1-leader",
        attackPower: 5000,
        counterPower: 0,
      });
      return state;
    };

    let state = triggered("ST36-002");
    state.players.p2.life = [
      card("a", "FIX-001"),
      card("b", "FIX-001"),
      card("c", "FIX-001"),
    ];
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-trigger" &&
          candidate.optionId === "activate",
      ),
    );
    expect(state.players.p1.board[0]?.cardNumber).toBe("ST36-002");
    expect(state.players.p1.life).toHaveLength(1);

    state = triggered("ST36-003");
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-trigger" &&
          candidate.optionId === "activate",
      ),
    );
    expect(observe(state, "p1").self.leader.currentPower).toBe(7000);

    state = triggered("OP10-109");
    state.players.p1.deck = [card("draw-a", "P-088"), card("draw-b", "P-088")];
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-trigger" &&
          candidate.optionId === "activate",
      ),
    );
    expect(state.pendingEffect?.kind).toBe("draw-trash");

    state = triggered("P-088");
    state.players.p2.life = [];
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-trigger" &&
          candidate.optionId === "activate",
      ),
    );
    expect(state.players.p1.board[0]?.cardNumber).toBe("P-088");

    state = triggered("OP12-113");
    state.players.p2.board = [character("small", "FIX-001")];
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-trigger" &&
          candidate.optionId === "small",
      ),
    );
    expect(state.players.p2.board).toEqual([]);
    expect(state.players.p1.hand[0]?.cardNumber).toBe("OP12-113");

    state = triggered("OP13-116");
    state.players.p1.deck = [card("hit", "P-088")];
    state = submit(
      state,
      action(
        state,
        (candidate) =>
          candidate.type === "resolve-trigger" &&
          candidate.optionId === "activate",
      ),
    );
    expect(state.pendingEffect?.kind).toBe("search-top-five");
  });
});
