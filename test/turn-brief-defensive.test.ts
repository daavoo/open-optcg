import { describe, expect, it } from "vitest";
import {
  LlmAgent,
  type LlmChatClient,
  type LlmChatRequest,
  type LlmChatResponse,
} from "@one-piece-sim/agents/llm";
import { observe } from "@one-piece-sim/engine-core";
import type { GameObservation } from "@one-piece-sim/protocol";
import { character, copies, scenario, type Game } from "./support/index.js";

/**
 * Which turn `turnBrief` describes, measured at a decision that reaches the
 * viewer on someone else's turn.
 *
 * From `open-optcg-trace(15).jsonl`: a [Trigger] on the opponent's turn was
 * served `attacksReachingLeaderNow: 0` and `opponentAttackersNextTurn: 2`. The
 * first counted the viewer's own attacks, every one of them dead until their
 * turn comes round, and read as "no threat" while an attack was resolving; the
 * second counted `turn + 1`, which on the opponent's turn is the viewer's own
 * turn, so it reported the viewer's offence as incoming pressure. It was the
 * only forward-looking number in front of the model, and the 2 was read as a
 * reason to spend the trigger.
 */

/** A Counter step: p1 is the turn player, p2 is being asked. */
function defensiveDecision(): Game {
  return (
    scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Portgas.D.Ace - Official Feature Deck",
      )
      .seed("turn-brief-defence")
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("zoro", "ST21-015", { playedTurn: 3 }),
        character("sanji", "ST21-014", { playedTurn: 5 }),
      ])
      .withBoard("p2", [
        character("newgate", "OP16-003", { playedTurn: 3 }),
        character("vista", "OP16-011", { playedTurn: 5 }),
      ])
      // A hand that can answer, so the Counter step is a real decision rather
      // than a single forced pass the agent takes without asking the model.
      .withHand("p2", copies(3, "OP16-005", "counter"))
      .withLife("p1", 3)
      .withLife("p2", 3)
      .build()
  );
}

/**
 * The recorded shape of the bug: p1 swings, p2 declines the block, and the
 * Counter step hands p2 a decision without the turn changing hands.
 */
function counterStepAgainstP2(game: Game): GameObservation {
  game.play({ type: "attack", attackerInstanceId: "zoro" });
  game.play({ type: "pass" });
  return observe(game.state, "p2");
}

/** Records every request and plays whichever action the test names. */
class ScriptedClient implements LlmChatClient {
  readonly requests: LlmChatRequest[] = [];

  constructor(
    private readonly pick: (offered: { label: string; summary: string }[]) => {
      label: string;
      summary: string;
    },
  ) {}

  async complete(request: LlmChatRequest): Promise<LlmChatResponse> {
    this.requests.push(structuredClone(request));
    const latest = request.messages.at(-1);
    if (!latest) throw new Error("MISSING_REQUEST");
    const offered = [
      ...latest.content.matchAll(/^- (action-\d+): (.*)$/gm),
    ].map((match) => ({ label: match[1]!, summary: match[2]! }));
    const chosen = this.pick(offered);
    return {
      content: JSON.stringify({ actionIds: [chosen.label] }),
    };
  }

  /** The SITUATION figures of request `index`, read out of the Markdown. */
  brief(index: number): Record<string, number> {
    const message = this.requests[index]?.messages.at(-1);
    if (!message) throw new Error(`no request ${index}`);
    const section = (message.content.split("# SITUATION")[1] ?? "").split(
      "# AVAILABLE ACTIONS",
    )[0]!;
    return Object.fromEntries(
      [...section.matchAll(/^- (\w+): (-?\d+)(?: \(.*\))?$/gm)].map((match) => [
        match[1]!,
        Number(match[2]),
      ]),
    );
  }
}

/** Declines the defence; the brief, not the choice, is what is under test. */
const declineTheDefence = (
  offered: { label: string; summary: string }[],
): { label: string; summary: string } => {
  const pass = offered.find((offer) =>
    offer.summary.startsWith("Resolve battle without more counters"),
  );
  return pass ?? offered[0]!;
};

/** The brief the agent puts in front of the model for this observation. */
async function briefFor(
  observation: GameObservation,
): Promise<Record<string, number>> {
  const client = new ScriptedClient(declineTheDefence);
  await new LlmAgent(client).chooseAction(observation);
  return client.brief(0);
}

describe("turnBrief on a decision taken on the opponent's turn", () => {
  it("describes the turn in progress, not the viewer's dead offence", async () => {
    const game = defensiveDecision();
    const observation = counterStepAgainstP2(game);
    expect(observation.turnPlayer).toBe("p1");
    expect(observation.activePlayer).toBe("p2");

    const brief = await briefFor(observation);

    // The turn-relative offensive figure is gone rather than silently
    // repurposed: it answers "what can I do on my turn", and this is not the
    // viewer's turn. (The two "reaching" counts it used to sit beside are gone
    // from every decision now; see `turnBrief`.)
    expect(brief).not.toHaveProperty("opponentAttackersNextTurn");
    expect(brief).not.toHaveProperty("attacksReachingLeaderNow");
  });

  it("counts the attacks the turn player can still declare, not counting the one resolving", async () => {
    const game = defensiveDecision();
    const brief = await briefFor(counterStepAgainstP2(game));

    // Zoro declared, which rested it, so what is left is Sanji and the Leader.
    // `activeBattle` is the authority on the attack in front of the defender;
    // this number is what comes after it.
    expect(brief.incomingAttacksLeftThisTurn).toBe(2);
    // Both of them reach p2's 5000 Leader, and neither has [Double Attack],
    // so the rest of this turn costs two Life if it goes unanswered.
    expect(brief.incomingLifeDamageLeftThisTurn).toBe(2);
  });

  it("counts the viewer's own bodies for the turn that is actually next", async () => {
    const game = defensiveDecision();
    const brief = await briefFor(counterStepAgainstP2(game));

    // p2's two Characters plus their Leader, all of which stand up and can
    // declare when the turn passes. The old field reported the same board from
    // the wrong side and called it incoming pressure.
    expect(brief.yourAttackersNextTurn).toBe(3);
  });

  it("still serves the offensive figures on the viewer's own turn", async () => {
    const game = defensiveDecision();
    const brief = await briefFor(observe(game.state, "p1"));

    expect(brief).toHaveProperty("opponentAttackersNextTurn");
    expect(brief).toHaveProperty("blockersYouHold");
    expect(brief).not.toHaveProperty("incomingAttacksLeftThisTurn");
    expect(brief).not.toHaveProperty("yourAttackersNextTurn");
  });

  it("names both halves in the prompt, so neither set of fields is a surprise", async () => {
    const game = defensiveDecision();
    const client = new ScriptedClient(declineTheDefence);
    await new LlmAgent(client).chooseAction(counterStepAgainstP2(game));
    const system = client.requests[0]?.messages[0]?.content ?? "";

    expect(system).toContain("incomingAttacksLeftThisTurn");
    expect(system).toContain("incomingLifeDamageLeftThisTurn");
    expect(system).toContain("yourAttackersNextTurn");
    expect(system).toContain("never read an absent one as a zero");
  });
});
