import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

/**
 * OP-17 Blue Rocks D. Xebec's deck policy.
 *
 * Each test pins one judgement the deck had no policy for: the census reported
 * 0.0% of its decisions shaped by a rule of its own and 79.0% by no rule at
 * all, so every one of these fell through to `chooseGenericRules`.
 *
 * The opponent is ST34 so no matchup module can intercept, and because a
 * Character's card number on the opposing board is independent of that deck's
 * list -- the engine resolves printed text globally.
 */

const XEBEC_LEADER = "OP17-039";

const card = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
});

const character = (
  instanceId: string,
  cardNumber: string,
  options: { rested?: boolean; playedTurn?: number } = {},
) => ({
  instanceId,
  cardNumber,
  rested: options.rested ?? false,
  playedTurn: options.playedTurn ?? 1,
  attachedDon: [],
  powerModifiers: [],
});

function requireAction(
  state: GameState,
  predicate: (action: LegalAction) => boolean,
): LegalAction {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  if (!action) throw new Error("MISSING_ACTION");
  return action;
}

function submit(state: GameState, action: LegalAction): GameState {
  return applyAction(state, { ...action, revision: state.revision }).state;
}

/** Turn 6, Xebec to act, both boards cleared and ready to be posed. */
function xebecState(): GameState {
  let state = createGame({
    gameId: "op17-xebec-policy",
    p1: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
    p2: resolveDeck("(Blue) Rocks.D.Xebec - Official Feature Deck"),
    seed: "op17-xebec-policy-seed",
  });
  for (let seat = 0; seat < 2; seat += 1) {
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "mulligan-decision" && action.decision === "keep",
      ),
    );
  }
  state.turn = 6;
  state.phase = "main";
  setTurnPlayer(state, "p2");
  state.pendingEffect = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  state.oncePerTurn = [];
  for (const playerId of ["p1", "p2"] as const) {
    Object.assign(state.players[playerId], {
      hand: [],
      board: [],
      stage: null,
      trash: [],
      activeDon: [],
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
      activateDonAtEndOfTurn: 0,
    });
  }
  return state;
}

const don = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

const xebecAgent = () => new RegistryRulesAgent(XEBEC_LEADER);

describe("OP17 Rocks D. Xebec deck policy", () => {
  it("swings the Leader into a bigger Leader rather than ending the turn", async () => {
    // The whole deck is the Leader's `[When Attacking]`, which
    // `actions/attack.ts` dispatches *before* the Block window -- so the
    // trash-reveal-draw is paid whether or not the battle is won. A Leader can
    // never block and is a legal target rested or active, so declaring costs
    // nothing. `chooseGenericRules` only declares a *viable* attack, and this
    // 5000 Leader is never viable into ST34's 6000, so it passed the turn with
    // the engine untapped.
    const state = xebecState();
    state.players.p2.hand = [card("fodder", "OP17-050")];
    const agent = xebecAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({ type: "attack", attackerIsLeader: true });
  });

  it("still develops and attaches DON!! before that swing", async () => {
    // The rule substitutes for `pass`, never for the rest of the turn.
    // Leading the turn with the swing is worse: almost every Leader attack is
    // then declared with 0 DON!! attached, and attacks that win their battle
    // fall.
    const state = xebecState();
    state.players.p2.hand = [card("body", "OP17-040")];
    state.players.p2.activeDon = don("p2-don", 6);
    const agent = xebecAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "body",
    });
  });

  it("spends a [Counter] Event to save a Character, not only to survive", async () => {
    // Every {Rocks Pirates} Character prints `counter: null`, so the deck's
    // whole Counter supply is the two 0-cost Events. `chooseGenericCounter`'s
    // default protected set is empty, so it declined every Character save: 8.07
    // Counter windows a game against OP14-020 Mihawk, 1.20 of them answered.
    // Captain John is worth an Event -- rested under this Leader it is the only
    // card the opponent may attack at all.
    const state = xebecState();
    // John rested is the taunt: "[printed text omitted -- pnpm card:text OP14-020]", so it is also the only legal target.
    // The attacker is a 6000 body and the attacker wins ties, so the shortfall
    // is 1 -- one Event covers it.
    state.players.p2.board = [character("john", "OP17-044", { rested: true })];
    state.players.p2.hand = [card("event", "OP17-055")];
    state.players.p1.board = [character("attacker", "OP17-042")];
    state.players.p1.activeDon = don("p1-don", 4);
    state.turn = 7;
    setTurnPlayer(state, "p1");

    let next = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "attacker" &&
          action.targetInstanceId === "john",
      ),
    );
    // Step past the Block window; nothing on this board can block.
    while (next.phase === "block") {
      next = submit(
        next,
        requireAction(next, (action) => action.type === "pass"),
      );
    }
    expect(next.phase).toBe("counter");

    const action = await xebecAgent().chooseAction(observe(next, "p2"));

    expect(action.type).toBe("activate-counter-event");
  });
});

describe("OP17 Rocks D. Xebec on-defence triggers", () => {
  /**
   * Poses an attack on the Xebec Leader with Fullalead on the Stage, stepped to
   * the point where its `[On Your Opponent's Attack]` is the open decision.
   *
   * Both sides' power is set with attached DON!! so each case states its own
   * gap, rather than inheriting one from whichever body the opposing list
   * happens to hold.
   */
  function fullaleadUnderAttack(options: {
    attacker: string;
    attackerDon?: number;
    leaderDon?: number;
    hand?: string[];
  }): GameState {
    const state = xebecState();
    state.players.p2.stage = {
      instanceId: "fullalead",
      cardNumber: "OP17-057",
      rested: false,
    };
    state.players.p2.hand = (options.hand ?? ["OP17-050"]).map(
      (cardNumber, index) => card(`held-${index}`, cardNumber),
    );
    state.players.p2.leaderAttachedDon = don(
      "p2-attached",
      options.leaderDon ?? 0,
    );
    state.players.p1.board = [
      character("attacker", options.attacker, { playedTurn: 1 }),
    ];
    state.players.p1.board[0]!.attachedDon = don(
      "p1-attached",
      options.attackerDon ?? 0,
    );
    state.players.p1.activeDon = don("p1-don", 4);
    state.turn = 7;
    setTurnPlayer(state, "p1");
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "attacker" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
  }

  it("declines a pump into an attack that already fails", async () => {
    // A 4000 Kyo into the 5000 Leader: the attacker has to *exceed* the
    // defender, so this attack is already going nowhere and the +1000 buys
    // nothing but the loss of the card that pays for it. The Leader's own
    // attached DON!! cannot be used to pose this -- it adds power only on its
    // controller's turn, and this is the opponent's.
    const state = fullaleadUnderAttack({ attacker: "OP17-045" });

    const action = await xebecAgent().chooseAction(observe(state, "p2"));

    expect(action.summary).toMatch(/Don't apply/i);
  });

  it("declines a pump the deck could never make big enough on its own", async () => {
    // Six DON!! puts Kaido at 12000 into a 5000 Leader. Fullalead is +1000
    // against a gap of 7001, and a battle that needs the rest of the hand
    // behind it costs more cards than the one Life it saves. Before this rule
    // the generic resolver took the first non-skip option and paid every time.
    const state = fullaleadUnderAttack({
      attacker: "OP17-042",
      attackerDon: 6,
      hand: ["OP17-055", "OP17-056"],
    });

    const action = await xebecAgent().chooseAction(observe(state, "p2"));

    expect(action.summary).toMatch(/Don't apply/i);
  });

  it("pays for a pump that decides the battle by itself", async () => {
    // 5000 into 5000 is a hit, because the attacker wins ties -- so the gap is
    // 1 and Fullalead's +1000 covers it alone. Declining here would be the rule
    // firing too widely, and this is the case that catches it.
    const state = fullaleadUnderAttack({ attacker: "OP17-052" });

    const action = await xebecAgent().chooseAction(observe(state, "p2"));

    expect(action.summary).not.toMatch(/Don't apply/i);
  });
});

describe("OP17 Rocks D. Xebec trash costs", () => {
  /** The Leader's `[When Attacking]`, stepped to the choice of which card pays. */
  async function cardFedToTheLeader(hand: string[]): Promise<string> {
    const state = xebecState();
    state.players.p2.hand = hand.map((cardNumber, index) =>
      card(`held-${index}`, cardNumber),
    );
    state.players.p2.activeDon = don("p2-don", 2);
    let next = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerIsLeader === true,
      ),
    );
    next = submit(
      next,
      requireAction(
        next,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    const action = await xebecAgent().chooseAction(observe(next, "p2"));
    const chosen = getLegalActions(next, "p2").find(
      (candidate) => candidate.actionId === action.actionId,
    );
    if (chosen?.type !== "resolve-effect" || chosen.option.kind !== "card") {
      throw new Error("EXPECTED_HAND_CARD_CHOICE");
    }
    return chosen.option.card.cardNumber;
  }

  it("feeds the engine a body rather than one of the deck's two Counter Events", async () => {
    // The deck's entire hand defence is OP17-055, OP17-056 and an unplayed
    // Fullalead, because no Character in the list prints a Counter. The generic
    // resolver took whatever was first in hand: a probe watched it feed the
    // Leader 42 Counter Events over 48 games.
    expect(await cardFedToTheLeader(["OP17-055", "OP17-042"])).toBe("OP17-042");
    expect(await cardFedToTheLeader(["OP17-056", "OP17-040"])).toBe("OP17-040");
  });

  it("spends a spare OP17-118 as fuel even though it reads as a third Counter", async () => {
    // OP17-118's "[printed text omitted -- pnpm card:text OP17-118]" is unconditional in this list, so the
    // obvious ranking holds it back with the Events, and that is a wash;
    // spending the spare copies freely is what pays. At 10
    // cost it is the card the deck is least often able to cast, and the Leader
    // asks for fuel every turn.
    expect(await cardFedToTheLeader(["OP17-118", "OP17-118", "OP17-055"])).toBe(
      "OP17-118",
    );
  });

  it("keeps the last OP17-118 and pays with a body instead", async () => {
    // The tier above is about the copies being spent; this is about the one
    // left. It is the only card in the fifty that puts a board back after the
    // opponent clears one, and the deck reaches the 10 DON!! it costs in nine
    // long games out of ten -- so with one copy in hand the Event is no longer
    // the more expensive card to lose, and a body is cheaper than either.
    expect(await cardFedToTheLeader(["OP17-118", "OP17-052"])).toBe("OP17-052");
    // Still spent when it is the only thing that can pay: the veto only
    // applies where something else survives it.
    expect(await cardFedToTheLeader(["OP17-118"])).toBe("OP17-118");
  });

  it("throws away a second Fullalead while one is already on the Stage", async () => {
    // The one strictly dead card the list can hold: a player has one Stage, so
    // the second copy replaces the first and buys nothing.
    const state = xebecState();
    state.players.p2.stage = {
      instanceId: "fullalead",
      cardNumber: "OP17-057",
      rested: false,
    };
    state.players.p2.hand = [
      card("spare-stage", "OP17-057"),
      card("body", "OP17-049"),
    ];
    state.players.p2.activeDon = don("p2-don", 2);
    let next = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerIsLeader === true,
      ),
    );
    next = submit(
      next,
      requireAction(
        next,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );

    const action = await xebecAgent().chooseAction(observe(next, "p2"));
    const chosen = getLegalActions(next, "p2").find(
      (candidate) => candidate.actionId === action.actionId,
    );

    expect(chosen).toMatchObject({ type: "resolve-effect" });
    expect(
      chosen?.type === "resolve-effect" && chosen.option.kind === "card"
        ? chosen.option.card.cardNumber
        : undefined,
    ).toBe("OP17-057");
  });

  it("bottoms the opponent's Zoro with Gloriosa, not its own body", async () => {
    // `open-optcg-trace(59).jsonl` turn 5: Gloriosa's `[On Play]` asks whose
    // board before it asks which card, and the deck answered "mine" -- it
    // bottomed its own cost-3 Don Marlon while a cost-4 Zoro stood on the other
    // side. The rule that stops it (`gloriosa-bottom-opponent`) shipped as a
    // sealed-only module; this deck runs the same card and reached the same
    // fork, which is why it now applies to every deck.
    const state = xebecState();
    state.players.p2.hand = [card("gloriosa", "OP17-046")];
    state.players.p2.board = [character("marlon", "OP17-052")];
    state.players.p1.board = [character("zoro", "ST21-015")];
    state.players.p2.activeDon = don("p2-don", 4);
    const agent = xebecAgent();

    let next = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "gloriosa",
      ),
    );

    // The side, then the card, each taken from the agent rather than posed.
    const branch = await agent.chooseAction(observe(next, "p2"));
    const branchAction = getLegalActions(next, "p2").find(
      (candidate) => candidate.actionId === branch.actionId,
    );
    expect(
      branchAction?.type === "resolve-effect" &&
        branchAction.option.kind === "mode"
        ? branchAction.option.mode
        : undefined,
    ).toBe("opponent");

    next = submit(next, branchAction!);
    const target = await agent.chooseAction(observe(next, "p2"));
    const targetAction = getLegalActions(next, "p2").find(
      (candidate) => candidate.actionId === target.actionId,
    );
    expect(
      targetAction?.type === "resolve-effect" &&
        targetAction.option.kind === "card"
        ? targetAction.option.card.cardNumber
        : undefined,
    ).toBe("ST21-015");

    next = submit(next, targetAction!);
    expect(next.players.p1.board).toHaveLength(0);
    expect(next.players.p2.board.map((body) => body.cardNumber)).toContain(
      "OP17-052",
    );
  });

  it("keeps its own body when the opponent has nothing in range", async () => {
    // "Up to 1" makes the opponent's branch legal with nothing to select, so
    // there is no position where the rule falls back to the self branch. Taking
    // the empty branch resolves as a skip and keeps the body, which is the
    // point: bottoming your own Character buys nothing either way.
    const state = xebecState();
    state.players.p2.hand = [card("gloriosa", "OP17-046")];
    state.players.p2.board = [character("marlon", "OP17-052")];
    state.players.p2.activeDon = don("p2-don", 4);
    const agent = xebecAgent();

    let next = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "gloriosa",
      ),
    );
    const branch = await agent.chooseAction(observe(next, "p2"));
    const branchAction = getLegalActions(next, "p2").find(
      (candidate) => candidate.actionId === branch.actionId,
    );
    expect(
      branchAction?.type === "resolve-effect" &&
        branchAction.option.kind === "mode"
        ? branchAction.option.mode
        : undefined,
    ).toBe("opponent");

    next = submit(next, branchAction!);
    // Nothing to name on that side, so the effect is finished -- and the body it
    // would otherwise have eaten is still standing.
    expect(next.pendingEffect).toBeNull();
    expect(next.players.p2.board.map((body) => body.cardNumber)).toContain(
      "OP17-052",
    );
  });

  it("buys Captain John's taunt ahead of the biggest body when facing lethal", async () => {
    // Rested under a {Rocks Pirates} Leader, Captain John is the *only* legal
    // attack target the opponent has -- `legal-actions/main/attacks.ts` drops
    // the Leader too -- and it rests itself through its own `[Activate: Main]`.
    // At 8 DON!! the generic ladder develops the highest-cost card it can
    // afford, which buys a 7-cost body and no turn; the same DON!! buys the
    // taunt and the attack lock. The gate is the one state where the turn is
    // worth more than the body: the opponent's board already ends the game.
    const state = xebecState();
    state.players.p2.hand = [
      card("shiki", "OP17-048"),
      card("john", "OP17-044"),
      card("stussy", "OP17-054"),
    ];
    state.players.p2.activeDon = don("p2-don", 8);
    state.players.p2.life = [];
    // Three bodies that all out-power a 5000 Leader, so the swings still aimed
    // at it finish the game and `facingLethal` holds.
    state.players.p1.board = [
      character("big-1", "OP17-048"),
      character("big-2", "OP17-048"),
      character("big-3", "OP17-048"),
    ];
    const agent = xebecAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "john",
    });
  });

  it("pays a defensive pump the board can finish, rather than declining each alone", async () => {
    // The four `[On Your Opponent's Attack]` clauses are offered one at a time,
    // each as its own apply-or-skip, and each costs a card out of hand. Priced
    // in isolation none of them closes a 3000-and-up gap, so all of them are
    // declined -- and they stack across the same battle. Against a board whose
    // remaining swings end the game there is no later battle to hold the cards
    // for, so the rule pays whenever what is still standing adds up to enough.
    const state = xebecState();
    // Newgate's +3000 and Shiki's -3000 between them cover far more than the
    // 3000 shortfall this attack opens.
    state.players.p2.board = [
      character("newgate", "OP17-040"),
      character("shiki", "OP17-048"),
    ];
    state.players.p2.hand = [
      card("fuel-1", "OP17-052"),
      card("fuel-2", "OP17-052"),
    ];
    state.players.p2.life = [];
    state.players.p1.board = [
      character("attacker", "OP17-048"),
      character("second", "OP17-048"),
    ];
    state.players.p1.activeDon = don("p1-don", 4);
    state.turn = 7;
    setTurnPlayer(state, "p1");

    const next = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "attacker" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    const agent = xebecAgent();

    const action = await agent.chooseAction(observe(next, "p2"));

    expect(action).toMatchObject({ type: "resolve-effect" });
    expect(agent.lastDecision?.reasons[0]).toContain("Pay the pump");
  });

  it("deploys the best pair OP17-118's shared budget reaches, not the biggest body", async () => {
    // The 9 is spent across both cards, so leading with OP17-048 at 7 leaves
    // room for a 2-drop. OP17-049 at 5 beside OP17-042 at 4 is the same power
    // and a [Blocker] with it.
    const state = xebecState();
    state.players.p2.hand = [
      card("payoff", "OP17-118"),
      card("shiki", "OP17-048"),
      card("kyo", "OP17-045"),
      card("linlin", "OP17-049"),
      card("kaido", "OP17-042"),
    ];
    state.players.p2.activeDon = don("p2-don", 10);

    // Cast it for real: the draw resolves first, then the engine asks for the
    // two bodies as one `choose` with the cost budget on it.
    const next = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "payoff",
      ),
    );
    const agent = xebecAgent();
    const action = await agent.chooseAction(observe(next, "p2"));

    expect(
      action.type === "resolve-effect" && action.option.kind === "card"
        ? action.option.card.cardNumber
        : undefined,
    ).toBe("OP17-049");
  });
});

// The [Unblockable] Event tests that lived here moved to
// `test/format-heuristics.test.ts` with the rule itself, which is now the
// format-wide `dead-keyword-grant`. They still drive this deck's OP17-055,
// because it is the card the fault was traced on.
