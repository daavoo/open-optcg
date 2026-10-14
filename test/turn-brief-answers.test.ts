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
 * The defensive half of the race arithmetic: how many of the attacks coming
 * next turn this seat can actually answer.
 *
 * From `traces/myst31-gbluffy`: at 2 Life against `opponentAttackersNextTurn:
 * 5`, the LLM seat wrote "both Chopper Blockers should remain active to
 * defend" and passed the turn twice, then lost to the three attacks two
 * Blockers were never going to reach. The body count was the only forward
 * number in front of it, and a count of threats with no count of answers reads
 * as a reason to hold everything back. So the answers are counted too, and the
 * subtraction is stated beside the figure it belongs to rather than left to be
 * recalled from an instruction three sections up.
 */

/** A board where p1 holds one active Blocker against three p2 attackers. */
function boardWithBlockers(active: "p1" | "p2" = "p1"): Game {
  return scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Red) Portgas.D.Ace - Official Feature Deck",
    )
    .seed("turn-brief-answers")
    .atTurn(7, { active })
    .bareTable()
    .withBoard("p1", [
      character("chopper", "P-101", { playedTurn: 3 }),
      character("zoro", "ST21-015", { playedTurn: 3 }),
      character("sanji", "ST21-014", { playedTurn: 5 }),
    ])
    .withBoard("p2", [
      character("newgate", "OP16-003", { playedTurn: 3 }),
      character("vista", "OP16-011", { playedTurn: 5 }),
    ])
    .withHand("p1", copies(2, "ST31-003", "spare"))
    .withLife("p1", 3)
    .withLife("p2", 3)
    .build();
}

/** The same board with p1's only Blocker already rested. */
function restedChopper(): Game {
  return scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Red) Portgas.D.Ace - Official Feature Deck",
    )
    .seed("turn-brief-answers-rested")
    .atTurn(7, { active: "p1" })
    .bareTable()
    .withBoard("p1", [
      character("chopper", "P-101", { playedTurn: 3, rested: true }),
      character("zoro", "ST21-015", { playedTurn: 3 }),
    ])
    .withBoard("p2", [character("newgate", "OP16-003", { playedTurn: 3 })])
    .withLife("p1", 3)
    .withLife("p2", 3)
    .build();
}

/** Records every request and takes whichever action the test names. */
class ScriptedClient implements LlmChatClient {
  readonly requests: LlmChatRequest[] = [];

  async complete(request: LlmChatRequest): Promise<LlmChatResponse> {
    this.requests.push(structuredClone(request));
    const latest = request.messages.at(-1);
    if (!latest) throw new Error("MISSING_REQUEST");
    const offered = [
      ...latest.content.matchAll(/^- (action-\d+): (.*)$/gm),
    ].map((match) => ({ label: match[1]!, summary: match[2]! }));
    const pass = offered.find((offer) => offer.summary.startsWith("End turn"));
    return {
      content: JSON.stringify({ actionIds: [(pass ?? offered[0]!).label] }),
    };
  }

  /** The whole SITUATION section of request `index`, caveats included. */
  situation(index: number): string {
    const message = this.requests[index]?.messages.at(-1);
    if (!message) throw new Error(`no request ${index}`);
    return (message.content.split("# SITUATION")[1] ?? "").split(
      "# AVAILABLE ACTIONS",
    )[0]!;
  }

  /** The one action line whose summary starts with `prefix`. */
  action(index: number, prefix: string): string {
    const message = this.requests[index]?.messages.at(-1);
    if (!message) throw new Error(`no request ${index}`);
    const line = [...message.content.matchAll(/^- action-\d+: (.*)$/gm)]
      .map((match) => match[1]!)
      .find((summary) => summary.startsWith(prefix));
    if (!line) throw new Error(`no action starting with ${prefix}`);
    return line;
  }
}

/** The figures the agent puts in front of the model, parsed out of Markdown. */
function figures(section: string): Record<string, number> {
  return Object.fromEntries(
    [...section.matchAll(/^- (\w+): (-?\d+)/gm)].map((match) => [
      match[1]!,
      Number(match[2]),
    ]),
  );
}

async function requestFor(observation: GameObservation) {
  const client = new ScriptedClient();
  await new LlmAgent(client).chooseAction(observation);
  return client;
}

describe("the answers half of the turn brief", () => {
  it("counts only the Blockers that are still standing", async () => {
    const game = boardWithBlockers();
    const before = figures(
      (await requestFor(observe(game.state, "p1"))).situation(0),
    );
    expect(before.blockersYouHold).toBe(1);

    // A rested Blocker cannot block on the opponent's turn -- it stands up at
    // its controller's Refresh, which is after that turn is over. That is the
    // whole reason the count is of active bodies rather than of keywords, and
    // resting is what declaring an attack with it does.
    const rested = restedChopper();
    const after = figures(
      (await requestFor(observe(rested.state, "p1"))).situation(0),
    );
    expect(after.blockersYouHold).toBe(0);
  });

  it("prices the opponent's Blockers for the attacking seat too", async () => {
    // The same board from the other side of the table: p2 is the turn player,
    // so p2 gets the offensive brief and p1's Chopper is the figure it needs.
    const game = boardWithBlockers("p2");
    const brief = figures(
      (await requestFor(observe(game.state, "p2"))).situation(0),
    );

    // One connecting attack p1 can turn away before any Counter card is paid.
    expect(brief.opponentBlockersActive).toBe(1);
    expect(brief.blockersYouHold).toBe(0);
  });

  it("states the attacks the Blockers cannot reach, beside the body count", async () => {
    const game = boardWithBlockers();
    const section = (await requestFor(observe(game.state, "p1"))).situation(0);
    const brief = figures(section);

    // p2's two Characters and their Leader, against p1's single Blocker.
    expect(brief.opponentAttackersNextTurn).toBe(3);
    expect(section).toContain(
      "your 1 active Blocker answers at most 1 of them, so 2 reach your Leader",
    );
  });

  it("says nothing about a subtraction there is no Blocker for", async () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Portgas.D.Ace - Official Feature Deck",
      )
      .seed("turn-brief-answers-blockerless")
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("zoro", "ST21-015", { playedTurn: 3 })])
      .withBoard("p2", [character("newgate", "OP16-003", { playedTurn: 3 })])
      .withLife("p1", 3)
      .withLife("p2", 3)
      .build();
    const section = (await requestFor(observe(game.state, "p1"))).situation(0);

    // Without a Blocker the caveat would only read the figure back, on every
    // decision of every game including the mulligan. A qualification that
    // fires everywhere is read nowhere.
    expect(figures(section).blockersYouHold).toBe(0);
    expect(section).not.toContain("reach your Leader");
  });

  it("says nothing when the Blockers cover every projected attacker", async () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Portgas.D.Ace - Official Feature Deck",
      )
      .seed("turn-brief-answers-covered")
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("chopper", "P-101", { playedTurn: 3 })])
      .withLife("p1", 3)
      .withLife("p2", 3)
      .build();
    const section = (await requestFor(observe(game.state, "p1"))).situation(0);

    // Only their Leader can declare, and one Blocker answers it: a caveat here
    // would be noise, and every figure that carries one has to earn it.
    expect(figures(section).opponentAttackersNextTurn).toBe(1);
    expect(section).not.toContain("reach your Leader");
  });

  it("separates the attacks that connect from the attacks that merely exist", async () => {
    const game = boardWithBlockers();
    const client = await requestFor(observe(game.state, "p1"));

    // Three declarable attacks: Chopper at 5000 and the Leader at 5000 fail
    // against the 6000 and 7000 bodies but reach the 5000 Leader, while Zoro
    // and Sanji reach everything. A seat that reads only "4 attacks
    // declarable" cannot tell an ending turn from a wasted one.
    expect(client.action(0, "End turn")).toContain("of which beat");
  });
});
