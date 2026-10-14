import { describe, expect, it } from "vitest";
import {
  LlmAgent,
  type LlmChatClient,
  type LlmChatRequest,
  type LlmChatResponse,
} from "@one-piece-sim/agents/llm";
import { observe } from "@one-piece-sim/engine-core";
import type { GameObservation } from "@one-piece-sim/protocol";
import { character, scenario, type Game } from "./support/index.js";

/**
 * The turn plan a seat states for itself, and what the request does with it.
 *
 * From `open-optcg-trace(6).jsonl`, turn 14. The seat wrote "Race for lethal:
 * five Leader attacks", declared the first attack of that race, and at the very
 * next decision -- with nothing new on the board and eight times the reasoning
 * tokens -- recast the same position as a survival turn: "I reject the Leader
 * attack because taking their final Life does not prevent their five incoming
 * attackers from killing us." It spent the one attacker whose Leader swing the
 * defender could not answer on a Character instead, and ended the turn one
 * Leader hit short.
 *
 * One decision is one stateless call, so the frame a turn opened with survived
 * nowhere. What is asserted here is the carrying: the plan the model writes
 * comes back to it verbatim for the rest of that turn, is not cleared by an
 * answer that says nothing about it, is replaced by one that does, and does not
 * appear at all on a turn that is not this seat's.
 */

/**
 * p1 mid-game with DON!! to spend, two bodies, and a hand to develop from.
 *
 * Deliberately not `bareTable()`: one case here plays past the end of p1's turn
 * to check that the plan does not outlive it, and an empty deck decks the
 * opponent out on their Draw Phase, which finishes the game instead.
 */
function ownTurn(): Game {
  return scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Red) Portgas.D.Ace - Official Feature Deck",
    )
    .seed("llm-turn-plan")
    .atTurn(7, { active: "p1" })
    .withBoard("p1", [
      character("zoro", "ST21-015", { playedTurn: 3 }),
      character("sanji", "ST21-014", { playedTurn: 5 }),
    ])
    .withBoard("p2", [character("vista", "OP16-011", { playedTurn: 5 })])
    .withLife("p1", 3)
    .withLife("p2", 3)
    .build();
}

/**
 * Answers with the plan the test hands it, and records what it was shown.
 *
 * `plans` is consumed one per call: `undefined` is an answer that carries no
 * plan at all, which is the case the "only a stated plan replaces one" rule is
 * about.
 */
class PlanningClient implements LlmChatClient {
  readonly requests: LlmChatRequest[] = [];
  #calls = 0;

  constructor(private readonly plans: readonly (string[] | undefined)[]) {}

  async complete(request: LlmChatRequest): Promise<LlmChatResponse> {
    this.requests.push(structuredClone(request));
    const latest = request.messages.at(-1);
    if (!latest) throw new Error("MISSING_REQUEST");
    const offered = [...latest.content.matchAll(/^- (action-\d+): (.*)$/gm)];
    // Whatever is offered first: the plan, not the choice, is under test.
    const chosen = offered[0]?.[1];
    if (!chosen) throw new Error("MISSING_ACTION_ID");
    const plan = this.plans[this.#calls];
    this.#calls += 1;
    return {
      content: JSON.stringify({
        ...(plan ? { turnPlan: plan } : {}),
        reasoning: "n/a",
        actionIds: [chosen],
      }),
    };
  }

  /** The plan section of request `index`, or undefined when there is none. */
  planSection(index: number): string | undefined {
    const content = this.requests[index]?.messages.at(-1)?.content;
    if (content === undefined) throw new Error(`no request ${index}`);
    if (!content.includes("# YOUR PLAN FOR THIS TURN")) return undefined;
    return content.split("# YOUR PLAN FOR THIS TURN")[1]!.split("\n#")[0]!;
  }
}

/** Take two decisions in the same Main Phase, through the agent. */
async function twoDecisions(game: Game, client: PlanningClient): Promise<void> {
  const agent = new LlmAgent(client);
  const first = await agent.chooseAction(observe(game.state, "p1"));
  game.submit(first);
  await agent.chooseAction(observe(game.state, "p1"));
}

describe("the turn plan the model states for itself", () => {
  it("says outright when this is the first action of the turn", async () => {
    const client = new PlanningClient([["attack op-leader with leader"]]);
    await new LlmAgent(client).chooseAction(observe(ownTurn().state, "p1"));

    const section = client.planSection(0);
    expect(section).toContain("This is your FIRST action of this turn");
    expect(section).toContain("`turnPlan`");
  });

  it("reads the stated plan back at the next decision of the same turn", async () => {
    const client = new PlanningClient([
      ["attach 1 DON!! to board-1", "attack op-leader with board-1"],
      undefined,
    ]);
    await twoDecisions(ownTurn(), client);

    const section = client.planSection(1)!;
    // Verbatim, numbered, and only the steps the model said were left.
    expect(section).toContain("1. attach 1 DON!! to board-1");
    expect(section).toContain("2. attack op-leader with board-1");
    expect(section).not.toContain("This is your FIRST action");
    // What has actually been done is the engine's account, not the model's.
    expect(section).toContain("RECENT EVENTS");
  });

  it("keeps the plan through an answer that says nothing about it", async () => {
    // The failure this rule is for: a plan dropped by the first answer that
    // forgot to restate it would leave exactly the amnesia the plan exists to
    // cure. Only a stated plan replaces a stated plan.
    const client = new PlanningClient([
      ["attack op-leader with leader"],
      undefined,
      undefined,
    ]);
    const game = ownTurn();
    const agent = new LlmAgent(client);
    for (let step = 0; step < 3; step += 1) {
      const action = await agent.chooseAction(observe(game.state, "p1"));
      game.submit(action);
    }

    expect(client.planSection(2)).toContain("1. attack op-leader with leader");
  });

  it("replaces the plan when the answer states a new one", async () => {
    const client = new PlanningClient([
      ["attack op-leader with leader"],
      ["K.O. op-board-1 with board-1", "end turn"],
      undefined,
    ]);
    const game = ownTurn();
    const agent = new LlmAgent(client);
    for (let step = 0; step < 3; step += 1) {
      const action = await agent.chooseAction(observe(game.state, "p1"));
      game.submit(action);
    }

    const section = client.planSection(2)!;
    expect(section).toContain("1. K.O. op-board-1 with board-1");
    expect(section).not.toContain("attack op-leader with leader");
  });

  it("shows no plan section on a decision inside the opponent's turn", async () => {
    // A Block step, a Counter step and a [Trigger] all hand this seat a
    // decision without the turn changing hands, and there is no plan of its own
    // to continue there.
    const game = ownTurn();
    game.play({ type: "attack", attackerInstanceId: "zoro" });
    game.play({ type: "pass" });
    const counterStep: GameObservation = observe(game.state, "p2");
    expect(counterStep.turnPlayer).toBe("p1");
    expect(counterStep.activePlayer).toBe("p2");

    const client = new PlanningClient([undefined]);
    await new LlmAgent(client).chooseAction(counterStep);

    expect(client.planSection(0)).toBeUndefined();
  });

  it("drops the plan when the turn moves on", async () => {
    // A plan is a plan for one turn: the board it was reasoned against is gone
    // once the opponent has had theirs, so the next own-turn decision opens
    // with the first-action message rather than with last turn's steps.
    const client = new PlanningClient([
      ["attack op-leader with leader"],
      undefined,
    ]);
    const game = ownTurn();
    const agent = new LlmAgent(client);
    await agent.chooseAction(observe(game.state, "p1"));
    // Both seats pass out of the engine directly, so the agent sees none of it.
    const startingTurn = game.state.turn;
    while (game.state.turn <= startingTurn + 1) game.pass();
    expect(game.state.activePlayer).toBe("p1");
    expect(game.state.phase).toBe("main");

    await agent.chooseAction(observe(game.state, "p1"));

    expect(client.planSection(1)).toContain("This is your FIRST action");
  });
});
