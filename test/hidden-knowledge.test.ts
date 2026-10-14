import { describe, expect, it } from "vitest";
import {
  createGame,
  observe,
  recordDeckTopKnowledge,
  searchRevealIsPublic,
  type GameState,
} from "@one-piece-sim/engine-core";

import type { PlayerId } from "@one-piece-sim/protocol";
import { resolveDeck } from "@one-piece-sim/decks";

import { covers, Game, scenario } from "./support/index.js";

/** OP04-016 Bad Manners Kick Course: a Life card with a [Trigger]. */
const TRIGGER = "OP04-016";

function newGame(): GameState {
  return createGame({
    gameId: "knowledge-1",
    p1: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
    p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    seed: "knowledge-seed-1",
  });
}

describe("private deck-top knowledge", () => {
  it("reports the looked-at card only to the player who looked", () => {
    const state = newGame();
    const top = state.players.p2.deck[0]!;
    recordDeckTopKnowledge(state, "p1", "p2");

    const looker = observe(state, "p1");
    const target = observe(state, "p2");

    expect(looker.self.knowledge.opponentDeckTop?.cardNumber).toBe(
      top.cardNumber,
    );
    // p2 must not learn their own next draw just because p1 looked at it.
    expect(target.self.knowledge.ownDeckTop).toBeNull();
    expect(target.self.knowledge.opponentDeckTop).toBeNull();
  });

  it("invalidates the memory once the card is no longer on top", () => {
    const state = newGame();
    recordDeckTopKnowledge(state, "p1", "p2");
    expect(observe(state, "p1").self.knowledge.opponentDeckTop).not.toBeNull();

    state.players.p2.hand.push(state.players.p2.deck.shift()!);

    expect(observe(state, "p1").self.knowledge.opponentDeckTop).toBeNull();
  });

  it("keeps a private card-revealed event out of the other player's log", () => {
    const state = newGame();
    state.events.push({
      type: "card-revealed",
      playerId: "p1",
      cardNumber: state.players.p2.deck[0]!.cardNumber,
      sourceCardNumber: "OP11-062",
      visibleTo: "p1",
    });

    const lookerEvents = observe(state, "p1").publicEvents;
    const targetEvents = observe(state, "p2").publicEvents;

    expect(
      lookerEvents.filter((event) => event.type === "card-revealed"),
    ).toHaveLength(1);
    expect(
      targetEvents.filter((event) => event.type === "card-revealed"),
    ).toHaveLength(0);
  });

  it("leaves a public reveal visible to both players", () => {
    const state = newGame();
    state.events.push({
      type: "card-revealed",
      playerId: "p1",
      cardNumber: state.players.p2.deck[0]!.cardNumber,
      sourceCardNumber: "OP11-066",
    });

    for (const viewer of ["p1", "p2"] as const) {
      expect(
        observe(state, viewer).publicEvents.filter(
          (event) => event.type === "card-revealed",
        ),
      ).toHaveLength(1);
    }
  });
});

describe("search publicity follows the printed text", () => {
  it('reads "reveal" off the card text', () => {
    // "reveal up to 1 X and add it to your hand" is public knowledge.
    expect(searchRevealIsPublic("OP01-016")).toBe(true); // Nami
    expect(searchRevealIsPublic("ST31-005")).toBe(true); // Thousand Sunny
    expect(searchRevealIsPublic("ST34-003")).toBe(true); // Charlotte Brulee
    expect(searchRevealIsPublic("OP10-111")).toBe(true); // Supernova Luffy
    expect(searchRevealIsPublic("OP12-047")).toBe(true); // Sengoku (navy-search)
    expect(searchRevealIsPublic("OP12-108")).toBe(true); // Rosinante (DSL)
    expect(searchRevealIsPublic("OP10-065")).toBe(true); // Sugar (DSL)
    // "Look at N ... and add up to 1 card to your hand" with no reveal is a
    // private look.
    expect(searchRevealIsPublic("OP15-118")).toBe(false); // Enel
    expect(searchRevealIsPublic("OP16-119")).toBe(false); // Teach (to Life)
  });
});

describe("a Trigger offer is the damaged player's secret", () => {
  /**
   * p1's Leader hits p2 for a point of damage, with a [Trigger] card
   * (OP04-016 Bad Manners Kick Course) on top of p2's Life.
   */
  function damaged(): Game {
    const game = scenario()
      .decks(
        "(Blue) Rocks.D.Xebec - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("trigger-privacy")
      .keepBothHands()
      .atTurn(3, { active: "p1" })
      .withLife("p2", [{ instanceId: "p2-life-trigger", cardNumber: TRIGGER }])
      .withActiveAttack(
        {
          attackerPlayerId: "p1",
          defenderPlayerId: "p2",
          attackerInstanceId: "p1-leader",
          targetInstanceId: "p2-leader",
          attackPower: 7000,
          counterPower: 0,
        },
        "counter",
      )
      .build();
    game.play({ type: "pass" });
    return game;
  }

  const revealed = (state: GameState, viewer: PlayerId): string[] =>
    observe(state, viewer)
      .publicEvents.filter((event) => event.type === "card-revealed")
      .map((event) => event.cardNumber);

  it("does not name the Life card to the attacker while the offer stands", () => {
    const game = damaged();

    expect(game.state.pendingTrigger?.card.cardNumber).toBe(TRIGGER);
    expect(revealed(game.state, "p2")).toContain(TRIGGER);
    // The whole point: p1 sees the damage land, not what it landed on.
    expect(revealed(game.state, "p1")).not.toContain(TRIGGER);
    expect(observe(game.state, "p1").pendingTriggerCardNumber).toBeNull();
    expect(observe(game.state, "p2").pendingTriggerCardNumber).toBe(TRIGGER);
    // Its printed text is an identity too -- a `cardFacts` entry would name it.
    expect(observe(game.state, "p1").cardFacts[TRIGGER]).toBeUndefined();
    expect(observe(game.state, "p2").cardFacts[TRIGGER]).toBeDefined();
  });

  it("keeps a declined Trigger hidden, as ordinary damage", () => {
    const game = damaged();
    game.play({ type: "resolve-trigger", optionId: "skip" });

    expect(
      game.state.players.p2.hand.some((card) => card.cardNumber === TRIGGER),
    ).toBe(true);
    expect(revealed(game.state, "p1")).not.toContain(TRIGGER);
    // The step still shows in p1's log -- a card left Life -- with no name.
    const moved = observe(game.state, "p1").publicEvents.filter(
      (event) => event.type === "card-moved" && event.from === "life",
    );
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ cardNumber: null, to: "hand" });
  });

  it("names the card to both players once the Trigger is activated", () => {
    const game = damaged();
    game.play(
      (action) =>
        action.type === "resolve-trigger" && action.optionId !== "skip",
    );

    for (const viewer of ["p1", "p2"] as const) {
      expect(revealed(game.state, viewer)).toContain(TRIGGER);
    }
  });
});

describe("a face-down pick from the opponent's hand", () => {
  covers("OP17-075", "[On Play]");

  /** p2's hand: three cards nothing else on the table names. */
  const HELD = ["OP04-016", "OP01-016", "ST34-003"] as const;

  /**
   * p1 plays OP17-075 X.Drake and pays its `DON!! −2`, at the pick from p2's
   * hand that Bandai's OP-17 Q&A gives to the activating player.
   */
  function drakePick(seed: string, held: readonly string[] = HELD): Game {
    const game = scenario()
      .seed(seed)
      .atTurn(3, { active: "p1" })
      .bareTable()
      .withHand("p1", [{ instanceId: "drake", cardNumber: "OP17-075" }])
      .withHand(
        "p2",
        held.map((cardNumber, index) => ({
          instanceId: `held-${index}`,
          cardNumber,
        })),
      )
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-075" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Which pool each returned DON!! came out of is bookkeeping, not the pick.
    while (
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-effect" &&
            action.optionId.startsWith("return-don:"),
        )
    ) {
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId.startsWith("return-don:"),
      );
    }
    return game;
  }

  it("offers the picker positions, and nothing that names a card", () => {
    const game = drakePick("drake-blind");
    const view = observe(game.state, "p1");

    expect(view.activePlayer).toBe("p1");
    expect(
      view.legalActions.map((action) =>
        action.type === "resolve-effect" ? action.option : undefined,
      ),
    ).toEqual(
      HELD.map((_, position) => ({
        kind: "face-down",
        owner: "opponent",
        zone: "hand",
        position,
        of: HELD.length,
      })),
    );
    const wire = JSON.stringify(view.legalActions);
    for (const [index, cardNumber] of HELD.entries()) {
      expect(wire).not.toContain(`held-${index}`);
      expect(wire).not.toContain(cardNumber);
      expect(view.cardFacts[cardNumber]).toBeUndefined();
    }
  });

  it("maps positions through a drawn order, not the hand's own", () => {
    // A hand grows in the order cards reach it, so a raw index would let a
    // player who saw a card join it name that card again. Across seeds, the
    // first position lands on more than one card.
    const first = new Set(
      Array.from({ length: 8 }, (_, index) => {
        const game = drakePick(`drake-order-${index}`);
        game.play({ type: "resolve-effect", optionId: "face-down:0" });
        return game.state.players.p2.trash.at(-1)?.instanceId;
      }),
    );
    expect(first.size).toBeGreaterThan(1);
  });

  it("names the card to both players once it is trashed", () => {
    const game = drakePick("drake-blind");
    game.play({ type: "resolve-effect", optionId: "face-down:2" });

    expect(game.state.players.p2.hand).toHaveLength(HELD.length - 1);
    const trashed = game.state.players.p2.trash.at(-1)?.cardNumber;
    expect(HELD).toContain(trashed);
    expect(observe(game.state, "p1").opponent.trash.at(-1)?.cardNumber).toBe(
      trashed,
    );
  });

  it("takes a one-card hand without a prompt", () => {
    const game = drakePick("drake-single", ["OP04-016"]);

    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "held-0",
    ]);
  });
});
