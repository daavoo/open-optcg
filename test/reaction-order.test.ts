import { describe, expect, it } from "vitest";
import { getLegalActions } from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import type { PublicEvent } from "@one-piece-sim/protocol";
import { character, instance, scenario, type Game } from "./support/index.js";

/**
 * Several automatic clauses answering one event resolve in the order their
 * controller picks.
 *
 * The position is the one that makes the order matter: OP09-061 Monkey.D.Luffy
 * (the ST-26 Leader) and OP08-067 Charlotte Pudding both answer the two DON!!
 * that OP09-077 Gum-Gum Lightning's `DON!! −2` sends back, and with those two
 * the only DON!! in the deck, whichever resolves first takes what the other
 * would have. The Leader first refunds both, one of them active; Pudding first
 * rests one and leaves the Leader one to set active.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Lightning cast and paid for, up to the point the watchers answer. */
function payTwo(seed: string, board = [character("pudding", "OP08-067")]) {
  const game = scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP09-061")
    .withBoard("p1", board)
    .withHand("p1", [instance("lightning", "OP09-077")])
    .withBoard("p2", [character("victim", "ST32-004")])
    .build();
  const seen: PublicEvent[] = [];
  const play = (action: Parameters<Game["play"]>[0]) => {
    game.play(action);
    seen.push(...game.events);
  };
  play({ summary: "[OP09-077]" });
  if (effectOptions(game.state).includes("apply")) {
    play({ type: "resolve-effect", optionId: "apply" });
  }
  // `DON!! −2` asks which DON!! go back, a card at a time; the pools are
  // interchangeable here.
  while (effectOptions(game.state).some((id) => id.startsWith("return-don:"))) {
    play({ type: "resolve-effect" });
  }
  play({ type: "resolve-effect", optionId: "victim" });
  return { game, seen, play };
}

const added = (seen: readonly PublicEvent[]) =>
  seen.flatMap((event) =>
    event.type === "don-added"
      ? [
          {
            source: event.sourceCardNumber,
            count: event.count,
            rested: event.rested,
          },
        ]
      : [],
  );

describe("ordering simultaneous automatic clauses", () => {
  it("asks which DON!!-returned clause resolves first, naming both", () => {
    const { game } = payTwo("order-offer");

    expect(game.state.players.p1.donDeck).toHaveLength(2);
    const offers = getLegalActions(game.state, "p1").filter(
      (action) => action.type === "resolve-effect",
    );
    expect(offers.map((action) => action.optionId)).toEqual([
      "reaction:p1-leader",
      "reaction:pudding",
    ]);
    expect(offers.map((action) => action.summary)).toEqual([
      "Resolve Monkey.D.Luffy [OP09-061]'s effect first",
      "Resolve Charlotte Pudding [OP08-067]'s effect first",
    ]);
    // Nothing has resolved while the question is open.
    expect(added(game.events)).toEqual([]);
  });

  it("resolves Pudding first when picked, leaving the Leader one DON!!", () => {
    const { game, seen, play } = payTwo("order-pudding");
    const rested = game.state.players.p1.restedDon.length;
    const active = game.state.players.p1.activeDon.length;

    play({ type: "resolve-effect", optionId: "reaction:pudding" });
    play({ type: "resolve-effect", optionId: "apply" });
    // The last clause left needs no order question, only its own.
    expect(effectOptions(game.state)).toEqual(["apply", "skip"]);
    expect(game.state.pendingEffect?.sourceCardNumber).toBe("OP09-061");
    play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.pendingEffect).toBeNull();
    expect(added(seen)).toEqual([
      { source: "OP08-067", count: 1, rested: true },
      { source: "OP09-061", count: 1, rested: false },
    ]);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(rested + 1);
    expect(game.state.players.p1.activeDon).toHaveLength(active + 1);
  });

  it("resolves the Leader first when picked, and passes over Pudding with nothing left to add", () => {
    const { game, seen, play } = payTwo("order-leader");
    const active = game.state.players.p1.activeDon.length;

    play({ type: "resolve-effect", optionId: "reaction:p1-leader" });
    play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.pendingEffect).toBeNull();
    expect(added(seen)).toEqual([
      { source: "OP09-061", count: 1, rested: false },
      { source: "OP09-061", count: 1, rested: true },
    ]);
    expect(game.state.players.p1.activeDon).toHaveLength(active + 1);
    // Pudding is not activated for nothing: no line for it, and its
    // [Once Per Turn] use is kept.
    expect(
      seen.some(
        (event) =>
          event.type === "ability-triggered" &&
          event.sourceCardNumber === "OP08-067",
      ),
    ).toBe(false);
    expect(
      game.state.oncePerTurn.some((key) => key.includes(":OP08-067:")),
    ).toBe(false);
  });

  it("does not ask for an order when only one card answers", () => {
    const { game, seen, play } = payTwo("order-alone", [
      character("bystander", "ST32-004"),
    ]);

    // The Leader's own apply-or-skip question, and no order question.
    expect(effectOptions(game.state)).toEqual(["apply", "skip"]);
    expect(game.state.pendingEffect?.sourceCardNumber).toBe("OP09-061");
    play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.pendingEffect).toBeNull();
    expect(added(seen).map((entry) => entry.source)).toEqual([
      "OP09-061",
      "OP09-061",
    ]);
  });

  it("refuses a card that is not among the reactions", () => {
    const { game } = payTwo("order-invalid");
    expect(() =>
      game.play({ type: "resolve-effect", optionId: "reaction:victim" }),
    ).toThrow();
  });
});

describe("the Leader, Pudding and Kid on one returned pair", () => {
  it("asks for the order twice, then passes over the last one with nothing left to add", () => {
    const { game, seen, play } = payTwo("order-three", [
      character("pudding", "OP08-067"),
      character("kid", "OP05-074"),
    ]);

    expect(effectOptions(game.state)).toEqual([
      "reaction:p1-leader",
      "reaction:pudding",
      "reaction:kid",
    ]);
    play({ type: "resolve-effect", optionId: "reaction:kid" });
    play({ type: "resolve-effect", optionId: "apply" });
    // The pick resolved; the other two are asked about again.
    expect(effectOptions(game.state)).toEqual([
      "reaction:p1-leader",
      "reaction:pudding",
    ]);
    play({ type: "resolve-effect", optionId: "reaction:pudding" });
    play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.pendingEffect).toBeNull();
    expect(added(seen)).toEqual([
      { source: "OP05-074", count: 1, rested: false },
      { source: "OP08-067", count: 1, rested: true },
    ]);
    // The DON!! deck held only the two that went back, so the Leader, last,
    // would add nothing: it is not asked, not announced, and keeps its use.
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(
      seen.some(
        (event) =>
          event.type === "ability-triggered" &&
          event.sourceCardNumber === "OP09-061",
      ),
    ).toBe(false);
    expect(
      game.state.oncePerTurn.some((key) => key.includes(":OP09-061:")),
    ).toBe(false);
  });
});
