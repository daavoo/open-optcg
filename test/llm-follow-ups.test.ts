import { describe, expect, it } from "vitest";
import {
  getLegalActions,
  observe,
  simulateLine,
  type Plan,
} from "@one-piece-sim/engine-core";
import { LlmAgent, expandFollowUps } from "@one-piece-sim/agents/llm";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { scenario, type Game } from "./support/index.js";

/**
 * One position, two chains worth telling apart.
 *
 * Xebec's Leader prints "[printed text omitted -- pnpm card:text <card>]", so an attack suspends into two
 * choices the seat can already see: whether to pay, and which card pays. The
 * same hand holds Streusen, whose On Play looks into the deck -- the chain
 * folding must refuse.
 *
 * The seed's numeric suffix is the search that found it: the official list runs
 * Streusen 2-of rather than the pre-release list's 4-of, so the opening hand
 * that holds one is a property of this particular shuffle, not of the deck.
 */
function xebecTurn(): Game {
  return scenario()
    .decks(
      "(Blue) Rocks.D.Xebec - Official Feature Deck",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    )
    .seed("xebec-when-attacking-0")
    .keepBothHands()
    .atTurn(3, { active: "p1" })
    .build();
}

/** The planner a runner binds before every decision. */
function plannerFor(game: Game): Plan {
  return (actionId) => simulateLine(game.state, actionId, "p1");
}

function observationFor(game: Game): GameObservation {
  return observe(game.state, "p1");
}

function requireOffer(game: Game, actionId: string) {
  const offer = expandFollowUps(observationFor(game), plannerFor(game)).find(
    (candidate) => candidate.actionId === actionId,
  );
  if (!offer) throw new Error(`no follow-up offer for ${actionId}`);
  return offer;
}

describe("follow-up sequences", () => {
  it("offers an attack's effect choices with the IDs the engine will use", () => {
    const game = xebecTurn();
    const attack = game.action({ type: "attack" });
    const offer = requireOffer(game, attack.actionId);

    expect(offer.then.map((step) => step.choose)).toEqual([
      "mechanic-choice of OP17-039",
      "mechanic-choice of OP17-039",
    ]);

    // The point of simulating rather than guessing: the offered IDs are the
    // ones the engine hands out, not lookalikes to be matched heuristically.
    game.submit(attack);
    expect(getLegalActions(game.state, "p1").map((a) => a.actionId)).toEqual(
      offer.then[0]!.options.map((option) => option.actionId),
    );
    game.submit(game.action({ summary: "Activate Rocks.D.Xebec [OP17-039]" }));
    expect(getLegalActions(game.state, "p1").map((a) => a.actionId)).toEqual(
      offer.then[1]!.options.map((option) => option.actionId),
    );
  });

  it("leaves out a chain that would reveal a card from the deck", () => {
    const game = xebecTurn();
    const play = game.action({ cardNumber: "OP17-050" });

    // The chain exists and it is a real decision -- it is excluded because of
    // what it saw, not because there was nothing to fold. Streusen's first
    // question names no card -- which end of the deck both go to -- but it is
    // asked after a private look at them, and folding it would commit blind.
    const line = plannerFor(game)(play.actionId)!;
    const options = line.observation.legalActions;
    expect(
      options
        .filter((option) => option.type === "resolve-effect")
        .map((option) => option.optionId),
    ).toEqual(["top", "bottom"]);
    expect(
      line.observation.publicEvents
        .slice(observationFor(game).publicEvents.length)
        .some(
          (event) => event.type === "card-revealed" && event.visibleTo === "p1",
        ),
    ).toBe(true);

    const offers = expandFollowUps(observationFor(game), plannerFor(game));
    expect(offers.map((offer) => offer.actionId)).not.toContain(play.actionId);
  });

  it("answers an attack and both its effect choices in one provider call", async () => {
    const game = xebecTurn();
    const attack = game.action({ type: "attack" });
    const offer = requireOffer(game, attack.actionId);
    // The apply/skip pair, picked as "not the skip": the apply half is
    // labelled with the card and its clause, and only the skip half is
    // phrased as a refusal.
    const apply = offer.then[0]!.options.find(
      (option) => !option.summary.startsWith("Don't"),
    )!;
    const trash = offer.then[1]!.options[0]!;

    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        return {
          content: JSON.stringify({
            actionIds: [attack.actionId, apply.actionId, trash.actionId],
            reasoning: "Swing, pay the cost, and trash the spare Streusen.",
          }),
        };
      },
    });

    const taken: LegalAction[] = [];
    for (let step = 0; step < 3; step += 1) {
      agent.usePlanner(plannerFor(game));
      const action = await agent.chooseAction(observationFor(game));
      taken.push(action);
      game.submit(action);
    }

    expect(taken.map((action) => action.actionId)).toEqual([
      attack.actionId,
      apply.actionId,
      trash.actionId,
    ]);
    expect(calls).toBe(1);
  });

  it("asks again when a step the sequence named is no longer offered", async () => {
    const game = xebecTurn();
    const attack = game.action({ type: "attack" });
    const offer = requireOffer(game, attack.actionId);
    // The apply/skip pair, picked as "not the skip": the apply half is
    // labelled with the card and its clause, and only the skip half is
    // phrased as a refusal.
    const apply = offer.then[0]!.options.find(
      (option) => !option.summary.startsWith("Don't"),
    )!;
    const [firstTrash, secondTrash] = offer.then[1]!.options;

    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        return {
          content: JSON.stringify({
            actionIds:
              calls === 1
                ? [attack.actionId, apply.actionId, firstTrash!.actionId]
                : [secondTrash!.actionId],
            reasoning: "Answer the step that is actually on offer.",
          }),
        };
      },
    });

    agent.usePlanner(plannerFor(game));
    expect((await agent.chooseAction(observationFor(game))).actionId).toBe(
      attack.actionId,
    );
    game.submit(attack);
    agent.usePlanner(plannerFor(game));
    expect((await agent.chooseAction(observationFor(game))).actionId).toBe(
      apply.actionId,
    );
    game.submit(game.action({ summary: "Activate Rocks.D.Xebec [OP17-039]" }));

    // The board the sequence was answered against is gone: this decision no
    // longer offers the step that was queued, so the rest of the plan goes with
    // it rather than being replayed into a choice nobody made.
    const diverged = observationFor(game);
    const withoutFirstTrash = {
      ...diverged,
      legalActions: diverged.legalActions.filter(
        (action) => action.actionId !== firstTrash!.actionId,
      ),
    };
    agent.usePlanner(plannerFor(game));
    const chosen = await agent.chooseAction(withoutFirstTrash);

    expect(chosen.actionId).toBe(secondTrash!.actionId);
    expect(calls).toBe(2);
  });

  it("rejects a step the chain does not offer and spends one correction round", async () => {
    const game = xebecTurn();
    const attack = game.action({ type: "attack" });

    let calls = 0;
    const errors: string[] = [];
    const agent = new LlmAgent({
      async complete(request) {
        calls += 1;
        const latest = request.messages.at(-1)!;
        if (calls > 1) errors.push(latest.content);
        return {
          content: JSON.stringify({
            actionIds:
              calls === 1
                ? [attack.actionId, "r5:effect:invented"]
                : [attack.actionId],
            reasoning: "Attack.",
          }),
        };
      },
    });

    agent.usePlanner(plannerFor(game));
    const action = await agent.chooseAction(observationFor(game));

    expect(action.actionId).toBe(attack.actionId);
    expect(calls).toBe(2);
    expect(errors[0]).toContain("LLM_INVALID_FOLLOW_UP");
    expect(errors[0]).toContain("r5:effect:apply");
  });

  it("truncates at a step the answer's own earlier pick closed, without a correction round", async () => {
    const game = xebecTurn();
    const attack = game.action({ type: "attack" });
    const offer = requireOffer(game, attack.actionId);
    const skip = "r5:effect:skip";
    const cardOnTheOtherBranch = offer.then[1]!.options[0]!.actionId;

    // Step 2 exists only after step 1 is answered `apply`, so this answer names
    // a card for a step its own previous pick closed. The ID is not invented --
    // the offer listed it for that step -- which is the case the instructions
    // promise stops the sequence and hands the decision back.
    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        return {
          content: JSON.stringify({
            actionIds: [attack.actionId, skip, cardOnTheOtherBranch],
            reasoning: "Attack, decline the reveal.",
          }),
        };
      },
    });

    agent.usePlanner(plannerFor(game));
    const action = await agent.chooseAction(observationFor(game));

    // The attack is taken and the steps up to the divergence are kept; nothing
    // is replayed past it, and no round is spent telling the model so.
    expect(action.actionId).toBe(attack.actionId);
    expect(calls).toBe(1);

    game.submit(action);
    const next = await agent.chooseAction(observationFor(game));
    expect(next.actionId).toBe(skip);
  });

  it("says nothing about follow-ups when the seat has no planner", async () => {
    const game = xebecTurn();
    const attack = game.action({ type: "attack" });
    const requests: string[] = [];
    const agent = new LlmAgent({
      async complete(request) {
        requests.push(request.messages.at(-1)!.content);
        return {
          content: JSON.stringify({
            actionIds: [attack.actionId],
            reasoning: "Attack.",
          }),
        };
      },
    });

    await agent.chooseAction(observationFor(game));

    expect(requests[0]).not.toContain("followUps");
  });
});
