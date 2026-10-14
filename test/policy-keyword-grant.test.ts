import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import {
  RegistryRulesAgent,
  chooseKeywordGrantTarget,
} from "@one-piece-sim/agents/local";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;
type Grants = NonNullable<EffectAction["grants"]>;
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP17-084 Chopper's `[On Play]` offers `[Unblockable]` to any of your
 * Characters. The generic fallback took the first non-skip option, and the first
 * one was the rested 12-cost giant that is on the board to switch Chopper's own
 * condition on. The keyword expired unused, in a position where giving it to
 * Sanji wins the game past two Blockers.
 */
describe("a turn-scoped keyword grant goes where it can be used", () => {
  covers("OP17-084", "[On Play]");

  /**
   * A giant that will not attack again, and one Character that will.
   */
  function chopperOnPlay() {
    return scenario()
      .decks(
        "(Black) Monkey.D.Luffy - Official Feature Deck",
        "(Blue) Rocks.D.Xebec - Official Feature Deck",
      )
      .seed("keyword-grant")
      .atTurn(7, { active: "p1" })
      .withBoard("p1", [
        // Rested, so it cannot attack again this turn -- and it is offered
        // first, which is the whole of how this went wrong.
        character("rodo", "OP17-094", { rested: true, playedTurn: 5 }),
        character("sanji", "OP17-082", { playedTurn: 5 }),
      ])
      .withHand("p1", [instance("chopper", "OP17-084")])
      .withDon("p1", { active: 5 })
      .build();
  }

  it("gives [Unblockable] to the Character that can still attack", async () => {
    const game = chopperOnPlay();
    game.play({ type: "play-card", cardNumber: "OP17-084" });

    const agent = new RegistryRulesAgent("OP17-079");
    const chosen = await agent.chooseAction(observe(game.state, "p1"));

    expect(chosen.type).toBe("resolve-effect");
    expect("optionId" in chosen ? chosen.optionId : undefined).toBe("sanji");
  });

  /**
   * The offer has to carry what the choice buys, or no policy can reason about
   * it: `option` said which card, and nothing said the card was about to be
   * handed a keyword that expires with the turn.
   */
  it("states the keyword and its scope on the offer", () => {
    const game = chopperOnPlay();
    game.play({ type: "play-card", cardNumber: "OP17-084" });

    const offers = game
      .legalActions("p1")
      .filter((action) => action.type === "resolve-effect");
    expect(offers.length).toBeGreaterThan(1);
    for (const offer of offers) {
      expect(offer.grants).toEqual({
        keyword: "Unblockable",
        expiresThisTurn: true,
      });
    }
  });
});

/**
 * The rule in isolation, for the cases no shipped card reaches from a scenario
 * as cheaply: [Rush] inverts the preference, and three kinds of grant are none
 * of this rule's business.
 */
describe("chooseKeywordGrantTarget", () => {
  function boardCard(
    instanceId: string,
    overrides: Partial<GameObservation["self"]["board"][number]> = {},
  ): GameObservation["self"]["board"][number] {
    return {
      instanceId,
      cardNumber: "OP17-082",
      name: "Sanji",
      cost: 2,
      currentCost: 2,
      power: 2000,
      rested: false,
      blocker: false,
      couldAttack: true,
      playedTurn: 1,
      attachedDon: 0,
      currentPower: 5000,
      powerModifiers: [],
      staticPowerModifiers: [],
      // Nothing here holds a keyword unless a case says so; a grant target is
      // chosen from what the card *lacks*.
      effectiveKeywords: [],
      ...overrides,
    };
  }

  function observation(
    board: GameObservation["self"]["board"],
  ): GameObservation {
    return {
      turn: 7,
      self: { board },
    } as unknown as GameObservation;
  }

  /** The chosen option's id, without asserting which action variant it is. */
  function chosen(decision: { action: LegalAction } | undefined) {
    const action = decision?.action;
    return action && "optionId" in action ? action.optionId : undefined;
  }

  function offer(
    instanceId: string,
    currentPower: number,
    grants: Grants,
  ): EffectAction {
    return {
      actionId: `r1:effect:${instanceId}`,
      type: "resolve-effect" as const,
      optionId: instanceId,
      effectKind: "mechanic-choice",
      sourceCardNumber: "OP17-084",
      option: {
        kind: "card" as const,
        owner: "self" as const,
        zone: "board" as const,
        card: {
          instanceId,
          cardNumber: "OP17-082",
          name: "Sanji",
          category: "character" as const,
          cost: 2,
          power: 2000,
          counter: 1000,
        },
        rested: false,
        currentPower,
      },
      grants,
      summary: `Choose ${instanceId}`,
    };
  }

  const unblockable: Grants = {
    keyword: "Unblockable",
    expiresThisTurn: true,
  };

  it("prefers the strongest target that can attack", () => {
    const decision = chooseKeywordGrantTarget(
      observation([
        boardCard("small", { currentPower: 5000 }),
        boardCard("big", { currentPower: 9000 }),
      ]),
      [offer("small", 5000, unblockable), offer("big", 9000, unblockable)],
    );
    expect(chosen(decision)).toBe("big");
  });

  it("skips a rested target and a summoning-sick one", () => {
    const decision = chooseKeywordGrantTarget(
      observation([
        boardCard("rested-giant", { currentPower: 12_000, rested: true }),
        boardCard("fresh", { currentPower: 9000, summoningSick: true }),
        boardCard("ready", { currentPower: 5000 }),
      ]),
      [
        offer("rested-giant", 12_000, unblockable),
        offer("fresh", 9000, unblockable),
        offer("ready", 5000, unblockable),
      ],
    );
    expect(chosen(decision)).toBe("ready");
  });

  /** [Rush] is read by a Character that *is* summoning-sick: that is the point. */
  it("inverts for [Rush], which is what cures summoning sickness", () => {
    const rush: Grants = { keyword: "Rush", expiresThisTurn: true };
    const decision = chooseKeywordGrantTarget(
      observation([
        boardCard("could-already-attack", { currentPower: 9000 }),
        boardCard("fresh", { currentPower: 7000, summoningSick: true }),
      ]),
      [offer("could-already-attack", 9000, rush), offer("fresh", 7000, rush)],
    );
    expect(chosen(decision)).toBe("fresh");
  });

  it("has no opinion when nothing can use the keyword", () => {
    expect(
      chooseKeywordGrantTarget(
        observation([boardCard("rested-only", { rested: true })]),
        [offer("rested-only", 5000, unblockable)],
      ),
    ).toBeUndefined();
  });

  /**
   * [Blocker] is read on the opponent's turn, so whether a turn-scoped grant of
   * it is live depends on whose turn it is -- which this rule does not know
   * enough to say. A grant that outlives the turn is likewise not its business:
   * the mistake it exists to stop is the unrecoverable one.
   */
  it("declines to have an opinion about [Blocker], or a lasting grant", () => {
    expect(
      chooseKeywordGrantTarget(observation([boardCard("ready")]), [
        offer("ready", 5000, { keyword: "Blocker", expiresThisTurn: true }),
      ]),
    ).toBeUndefined();
    expect(
      chooseKeywordGrantTarget(observation([boardCard("ready")]), [
        offer("ready", 5000, {
          keyword: "Unblockable",
          expiresThisTurn: false,
        }),
      ]),
    ).toBeUndefined();
  });
});
