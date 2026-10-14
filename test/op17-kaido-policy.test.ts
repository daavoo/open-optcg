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
import { fabricatedAttack, setTurnPlayer } from "./support/index.js";

/**
 * OP-17 Purple Kaido's deck policy.
 *
 * Each test pins one judgement the deck had no policy for: every decision fell
 * through to `chooseGenericRules`, whose Main ladder plays the highest-cost
 * affordable card and only looks at `activate-main` once nothing is affordable
 * -- which is the one ordering a ramp deck cannot survive.
 *
 * The opponent is ST34 so no matchup module can intercept, and because a
 * Character's card number on the opposing board is independent of that deck's
 * list: the engine resolves printed text globally.
 */

const KAIDO_LEADER = "OP17-058";
const KAIDO_DECK = "(Purple) Kaido - Official Feature Deck";

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

/** Turn 6, Kaido to act, both boards cleared and ready to be posed. */
function kaidoState(): GameState {
  let state = createGame({
    gameId: "op17-kaido-policy",
    p1: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
    p2: resolveDeck(KAIDO_DECK),
    seed: "op17-kaido-policy-seed",
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

const kaidoAgent = () => new RegistryRulesAgent(KAIDO_LEADER);

describe("OP17 Kaido deck policy", () => {
  it("takes King's free DON!! before spending DON!! on a body", async () => {
    // The generic ladder plays the dearest affordable card and reaches
    // `activate-main` only when nothing is affordable, so in a traced game the
    // ramp fired zero times over eleven turns. King's activation costs nothing
    // and is once per turn: it can only be lost, never spent early.
    const state = kaidoState();
    state.players.p2.board = [character("king", "EB04-031")];
    state.players.p2.hand = [card("body", "OP17-074")];
    state.players.p2.activeDon = don("p2-don", 6);
    state.players.p2.donDeck = don("p2-deck", 4);
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "EB04-031",
    });
  });

  it("does not convert Queen's DON!! while that costs the turn's play", async () => {
    // Queen's [Activate: Main] rests 2 active DON!! for 1 rested one: a gain
    // next turn, paid for out of this turn's spending power. With exactly the
    // DON!! for the body in hand, taking it is the body given up.
    const state = kaidoState();
    state.players.p2.board = [character("queen", "EB04-032")];
    state.players.p2.hand = [card("body", "OP17-074")];
    state.players.p2.activeDon = don("p2-don", 3);
    state.players.p2.donDeck = don("p2-deck", 4);
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "body",
    });
  });

  it("converts Queen's DON!! once the turn has nothing left to spend it on", async () => {
    // Same board, one DON!! short of the body. The DON!! is spare, so the
    // conversion is free value rather than a play given up.
    const state = kaidoState();
    state.players.p2.board = [character("queen", "EB04-032")];
    state.players.p2.hand = [card("body", "OP17-074")];
    state.players.p2.activeDon = don("p2-don", 2);
    state.players.p2.donDeck = don("p2-deck", 4);
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "EB04-032",
    });
  });

  it("keeps an opening hand of 3-cost ramp bodies", async () => {
    // `chooseGenericRules` keeps a hand only for a card costing 2 or less,
    // which in this list is Queen, X.Drake and nothing else -- so it throws
    // away a hand that ramps on curve. What this deck needs from an opening
    // hand is a way to reach King, not a cheap card.
    let state = createGame({
      gameId: "op17-kaido-mulligan",
      p1: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
      p2: resolveDeck(KAIDO_DECK),
      seed: "op17-kaido-mulligan-seed",
    });
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "mulligan-decision" && action.decision === "keep",
      ),
    );
    state.players.p2.hand = [
      card("ramp-a", "OP17-073"),
      card("ramp-b", "OP17-074"),
      card("king", "EB04-031"),
      card("fatty", "OP17-062"),
      card("counter", "OP17-076"),
    ];
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "mulligan-decision",
      decision: "keep",
    });
  });

  /**
   * The Leader's `DON!! −1` offer, which reaches the seat on every attack
   * either player declares -- so the judgement it needs is "does the 2000
   * decide this battle", not "is this effect beneficial".
   */
  function attackedByCracker(attackerInstanceId: string): GameState {
    const state = kaidoState();
    setTurnPlayer(state, "p1");
    state.players.p1.board = [character("cracker", "ST34-002")]; // 5000
    // Every DON!! rested, which is where a ramp deck's DON!! sits between
    // turns and the position the ability used to be withheld in.
    state.players.p2.restedDon = don("p2-don", 6);
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === attackerInstanceId &&
          action.targetInstanceId === "p2-leader",
      ),
    );
  }

  it("pays the Leader's DON!! when 2000 takes the attack out of range", async () => {
    // Cracker's 5000 beats the 5000 Leader on the tie; at 3000 it does not.
    const state = attackedByCracker("cracker");
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "apply" });
  });

  it("pays the Leader's DON!! when 2000 makes the Counter cheaper", async () => {
    // Jango's 8000 into the 5000 Leader is 3001 short: two 2000 Counter cards.
    // At 6000 it still lands, but 1001 short is one card -- the DON!! buys a
    // card back out of the hand that has to pay for the defence.
    const state = kaidoState();
    setTurnPlayer(state, "p1");
    state.players.p1.board = [character("jango", "OP12-045")]; // 8000
    state.players.p2.restedDon = don("p2-don", 6);
    const attacked = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "jango" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(attacked, "p2"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "apply" });
  });

  it("keeps the DON!! when the attacker is a Leader the debuff cannot touch", async () => {
    // -2000 only ever lands on an opposing *Character*, so a Leader-led attack
    // is unaffected by it -- and paying anyway is a DON!! off a ramp deck's
    // field, every turn, for nothing.
    const state = attackedByCracker("p1-leader");
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "skip" });
    expect(state.players.p2.restedDon).toHaveLength(6);
  });

  it("keeps the DON!! while the ramp still needs it, even to win the battle", async () => {
    // The same battle the test above pays for, with a shallower field: three
    // DON!! is a turn still buying its way to King and the cost-9 band, and the
    // 2000 buys one Life. `DON!! −N` returns to the DON!! deck, so the reading
    // is what next turn stands at -- 2 + 2 = 4, short of the six the rule asks.
    const state = attackedByCracker("cracker");
    state.players.p2.restedDon = don("p2-don", 3);
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "skip" });
  });

  it("pays from a shallow field while OP17-062 refunds the DON!!", async () => {
    // OP17-062 answers a DON!! going back to the deck with an active one from
    // it plus a rested one stood up, so the cost is not a cost and the floor
    // has nothing to protect.
    const state = attackedByCracker("cracker");
    state.players.p2.restedDon = don("p2-don", 3);
    state.players.p2.board = [character("refund", "OP17-062")];
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "apply" });
  });

  it("spends a Counter card to save a cost-10 Kaido", async () => {
    // OP17-062 has no way to save itself, costs 10, and is the deck's late
    // game. The generic Counter policy's protected set is empty, so without
    // this the deck watches it die with Counters in hand.
    const state = kaidoState();
    setTurnPlayer(state, "p1");
    state.players.p2.board = [character("fatty", "OP17-062")];
    state.players.p2.hand = [card("counter", "OP17-073")]; // 2000 Counter
    // Life above the attacks still coming this turn: the generic Counter
    // policy's `economicalCharacterDefense` will not trade a card for a body
    // while the Leader itself is the thing about to die.
    state.players.p2.life = [
      card("life-1", "OP17-076"),
      card("life-2", "OP17-076"),
      card("life-3", "OP17-076"),
    ];
    state.players.p1.board = [character("attacker", "ST34-002")];
    state.phase = "counter";
    state.activePlayer = "p2";
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "attacker",
      targetInstanceId: "fatty",
      attackPower: 12_500,
      counterPower: 0,
    });
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "counter",
      cardInstanceId: "counter",
    });
  });

  /**
   * The Counter horizon: which board a Leader hit is judged against.
   *
   * `op17-kaido-counter-horizon` re-asks the field's own question with this
   * deck's answer to "what is a Life card worth". Both tests pose the same
   * board and differ only in the Life total, because the Life total is the
   * whole rule.
   */
  it("counters a nonlethal Leader hit that the refreshed board would finish", async () => {
    // Nothing the opponent holds can swing again this turn -- their Leader has
    // attacked and the attacker in front rests on resolving -- so the field
    // default reads no further pressure and banks the Life. Next Refresh that
    // same board is a Leader hit plus a 6000 body, which is the rest of three
    // Life. One 2000 Counter stops the hit in front of it now.
    const state = kaidoState();
    setTurnPlayer(state, "p1");
    state.players.p2.hand = [card("counter", "OP17-075")]; // 2000 Counter
    state.players.p2.life = [
      card("life-1", "OP17-076"),
      card("life-2", "OP17-076"),
      card("life-3", "OP17-076"),
    ];
    state.players.p1.leaderRested = true;
    state.players.p1.board = [character("attacker", "ST34-002")];
    state.phase = "counter";
    state.activePlayer = "p2";
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
      attackPower: 6_000,
      counterPower: 0,
    });
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "counter",
      cardInstanceId: "counter",
    });
  });

  it("banks the same hit while the Life above it is still worth selling", async () => {
    // Identical board, five Life. The rule is a horizon and not a licence to
    // spend: above it the deck still trades Life for the card the hit hands
    // back, which is how it reaches the turn its cost-10 bodies cast.
    const state = kaidoState();
    setTurnPlayer(state, "p1");
    state.players.p2.hand = [card("counter", "OP17-075")];
    state.players.p2.life = [
      card("life-1", "OP17-076"),
      card("life-2", "OP17-076"),
      card("life-3", "OP17-076"),
      card("life-4", "OP17-076"),
      card("life-5", "OP17-076"),
    ];
    state.players.p1.leaderRested = true;
    state.players.p1.board = [character("attacker", "ST34-002")];
    state.phase = "counter";
    state.activePlayer = "p2";
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
      attackPower: 6_000,
      counterPower: 0,
    });
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action.type).not.toBe("counter");
  });

  it("does not spend a Counter card on a King that can save itself", async () => {
    // "[printed text omitted -- pnpm card:text <card>]" answers battle destruction too, so a
    // card out of hand buys what a DON!! already buys.
    const state = kaidoState();
    setTurnPlayer(state, "p1");
    state.players.p2.board = [character("king", "EB04-031")];
    state.players.p2.hand = [card("counter", "OP17-073")];
    state.players.p2.life = [card("life-1", "OP17-076")];
    state.players.p2.activeDon = don("p2-don", 2);
    state.players.p1.board = [character("attacker", "ST34-002")];
    state.phase = "counter";
    state.activePlayer = "p2";
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "attacker",
      targetInstanceId: "king",
      attackPower: 7_500,
      counterPower: 0,
    });
    const agent = kaidoAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action.type).not.toBe("counter");
  });
  /**
   * The DON!! and card economy Bandai's list spends where the guide list did
   * not: `op17-kaido-economy`. Every clause below is offered as an
   * apply/skip pair, which `chooseGenericRules` answers by taking `apply` --
   * "resolve a legal beneficial effect" -- because it cannot know what the
   * cost is worth to *this* deck.
   */
  describe("the DON!! and card economy", () => {
    /** X.Drake mid-resolution: the `DON!! −2` offer, with `fieldDon` on the field. */
    function drakeOffer(fieldDon: number, opponentHand: number): GameState {
      const state = kaidoState();
      state.players.p2.hand = [card("drake", "OP17-075")];
      state.players.p2.activeDon = don("p2-don", fieldDon);
      state.players.p2.donDeck = don("p2-deck", 10 - fieldDon);
      state.players.p1.hand = Array.from({ length: opponentHand }, (_, index) =>
        card(`theirs-${index}`, "ST34-002"),
      );
      return submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "play-card" && action.cardInstanceId === "drake",
        ),
      );
    }

    it("declines X.Drake's DON!! −2 while the DON!! is still the plan", async () => {
      // Two DON!! *off the field* -- `DON!! −N` returns them to the DON!! deck
      // rather than resting them -- for one card the opponent picks out of a
      // hand they refill. A probe over 240 games found the generic ladder
      // taking this in 69% of them, roughly one and a half times each.
      const state = drakeOffer(4, 5);
      const action = await kaidoAgent().chooseAction(observe(state, "p2"));

      expect(action).toMatchObject({
        type: "resolve-effect",
        optionId: "skip",
      });
    });

    it("takes it at the DON!! cap, where the ramp has nowhere left to go", async () => {
      // The DON!! deck is ten and the field cannot hold more, so returning two
      // makes room the deck refills for free -- King alone adds two a turn.
      const state = drakeOffer(10, 5);
      const action = await kaidoAgent().chooseAction(observe(state, "p2"));

      expect(action).toMatchObject({
        type: "resolve-effect",
        optionId: "apply",
      });
    });

    it("takes it against a one-card hand, where it is the whole hand", async () => {
      // "[printed text omitted -- pnpm card:text <card>]" is their worst card out of
      // five and their only card out of one. Only the second is worth a turn
      // of ramp.
      const state = drakeOffer(4, 1);
      const action = await kaidoAgent().chooseAction(observe(state, "p2"));

      expect(action).toMatchObject({
        type: "resolve-effect",
        optionId: "apply",
      });
    });

    /** Sasaki attacking, with `hand` spare cards behind him. */
    function sasakiOffer(fieldDon: number, spare: number): GameState {
      const state = kaidoState();
      state.players.p2.board = [character("sasaki", "OP17-068")];
      state.players.p2.hand = Array.from({ length: spare }, (_, index) =>
        card(`spare-${index}`, "OP17-062"),
      );
      state.players.p2.activeDon = don("p2-don", fieldDon);
      state.players.p2.donDeck = don("p2-deck", 10 - fieldDon);
      return submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "sasaki" &&
            action.targetInstanceId === "p1-leader",
        ),
      );
    }

    it("pays Sasaki's two cards while the ramp still has somewhere to go", async () => {
      const state = sasakiOffer(5, 4);
      const action = await kaidoAgent().chooseAction(observe(state, "p2"));

      expect(action).toMatchObject({
        type: "resolve-effect",
        optionId: "apply",
      });
    });

    it("declines Sasaki's two cards at the DON!! cap", async () => {
      // At ten DON!! the two rested ones arrive with nothing to buy, so the
      // trade is two cards -- this deck's whole Counter density -- for nothing.
      const state = sasakiOffer(10, 4);
      const action = await kaidoAgent().chooseAction(observe(state, "p2"));

      expect(action).toMatchObject({
        type: "resolve-effect",
        optionId: "skip",
      });
    });

    it("declines Sasaki's two cards out of a hand that cannot spare them", async () => {
      const state = sasakiOffer(5, 2);
      const action = await kaidoAgent().chooseAction(observe(state, "p2"));

      expect(action).toMatchObject({
        type: "resolve-effect",
        optionId: "skip",
      });
    });

    it("pays with the flex 9-drop rather than the four-of finisher", async () => {
      // Both cards are equally uncastable at three DON!!, so the band that
      // `hand-costs-paid-with-bricks` sorts on cannot separate them and its own
      // cost tiebreak picks the dearest -- the cost-10 Kaido the whole deck is
      // ramping towards. OP17-069 Jack is the 9-drop the published lists run
      // three of and cut first, and it is what a pilot pays with.
      const state = kaidoState();
      state.players.p2.hand = [
        card("hawkins", "OP17-073"),
        card("finisher", "OP17-062"),
        card("flex", "OP17-069"),
      ];
      state.players.p2.activeDon = don("p2-don", 3);
      state.players.p2.donDeck = don("p2-deck", 7);
      const played = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "play-card" && action.cardInstanceId === "hawkins",
        ),
      );
      const taken = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === "apply",
        ),
      );
      const action = await kaidoAgent().chooseAction(observe(taken, "p2"));

      expect(action).toMatchObject({
        type: "resolve-effect",
        optionId: "flex",
      });
    });

    it("pays a hand cost with the brick rather than the Counter", async () => {
      // Basil Hawkins trashes 1 card from hand for an active DON!!, and the
      // generic ladder pays with whichever card the engine offered first. Here
      // that is the 2000-Counter Event; the right answer is the cost-10 Kaido
      // this turn cannot cast.
      const state = kaidoState();
      state.players.p2.hand = [
        card("hawkins", "OP17-073"),
        card("counter", "OP17-076"),
        card("brick", "OP17-062"),
      ];
      state.players.p2.activeDon = don("p2-don", 3);
      state.players.p2.donDeck = don("p2-deck", 7);
      const played = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "play-card" && action.cardInstanceId === "hawkins",
        ),
      );
      // Hawkins' clause is optional, so the offer arrives first and the cost
      // choice second.
      const taken = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === "apply",
        ),
      );
      const action = await kaidoAgent().chooseAction(observe(taken, "p2"));

      expect(action).toMatchObject({
        type: "resolve-effect",
        optionId: "brick",
      });
    });
  });
});
