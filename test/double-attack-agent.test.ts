import { describe, expect, it } from "vitest";
import {
  LlmAgent,
  type LlmChatClient,
  type LlmChatRequest,
  type LlmChatResponse,
} from "@one-piece-sim/agents/llm";
import { observe, type GameState } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario, type Game } from "./support/index.js";

/**
 * What the model is *told* about [Double Attack], measured on the position that
 * exposed the gap.
 *
 * Rebuilt from `open-optcg-trace(18).jsonl`, turn 9, the OP-17 Red Ace seat: an
 * Ace Leader holding [Double Attack] from OP16-003 Edward.Newgate on the board,
 * the opponent at 1 Life, and a legal Leader attack that wins the game outright
 * if it connects. In the recorded game the swing was defended and the model
 * reasoned about it as "its second attack", having reconstructed the keyword
 * from card text: the observation it was handed said nothing about the keyword
 * at all, and the prompt's Lethal section told it that taking an opponent from
 * 1 Life to 0 is never lethal.
 *
 * This file cannot measure whether a model plays better -- that needs
 * `pnpm trace:shadow` and an API key. What it can pin down, deterministically,
 * is the three things the model was denied: the keyword in the observation, the
 * Life the line is worth in `turnBrief`, and a Lethal section that does not
 * contradict both. The last test proves the position is genuinely lethal, so the
 * eval is measuring a real decision rather than a preference.
 */

/** The recorded position: p2 on Ace with Newgate out, p1 at 1 Life. */
function traceEighteenTurnNine(): Game {
  return (
    scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Portgas.D.Ace - Official Feature Deck",
      )
      .seed("trace-18-turn-9")
      .atTurn(9, { active: "p2" })
      .bareTable()
      // p2's board as recorded: Newgate, plus the two bodies that had already
      // swung, plus the Stage. Only Newgate matters to the keyword, and the
      // rested bodies matter to the swing count the brief reports.
      .withBoard("p2", [
        // Recorded as played this turn *with* [Rush] from the Leader's own
        // ability, so it could attack. Placed as an earlier body instead, which
        // reaches the same position without replaying the grant.
        character("newgate", "OP16-003", { playedTurn: 1 }),
        character("luffy", "OP16-015", { rested: true, playedTurn: 5 }),
        character("vista", "OP16-011", { rested: true, playedTurn: 7 }),
      ])
      .withGivenDon("p2", "p2-leader", 1)
      .withLife("p2", [instance("p2-life", "OP16-005")])
      // The recorded seat that decides everything: one Life left.
      .withLife("p1", [instance("p1-life", "OP01-016")])
      .withBoard("p1", [
        character("zoro", "ST21-015", { rested: true, playedTurn: 4 }),
        character("sanji", "ST21-014", { rested: true, playedTurn: 6 }),
      ])
      // Decks, because `bareTable()` empties them and a turn handed back across
      // an empty deck ends the game by deck-out rather than by the choice under
      // test.
      .withDeckTop("p1", [
        instance("p1-deck-a", "OP01-016"),
        instance("p1-deck-b", "OP01-016"),
        instance("p1-deck-c", "OP01-016"),
      ])
      .withDeckTop("p2", [
        instance("p2-deck-a", "OP16-005"),
        instance("p2-deck-b", "OP16-005"),
      ])
      .build()
  );
}

/** The Leader swing that wins the game, as the trace recorded it. */
function leaderAttack(state: GameState): LegalAction {
  const action = observe(state, "p2").legalActions.find(
    (candidate) =>
      candidate.type === "attack" &&
      candidate.attackerInstanceId === "p2-leader" &&
      candidate.targetInstanceId === "p1-leader",
  );
  if (!action) throw new Error("the recorded Leader attack is not legal here");
  return action;
}

/** One offered action, as the request writes it. */
interface Offer {
  label: string;
  summary: string;
}

/** Every `- action-N: ...` line of the request, in order. */
function offers(content: string): Offer[] {
  return [...content.matchAll(/^- (action-\d+): (.*)$/gm)].map((match) => ({
    label: match[1]!,
    summary: match[2]!,
  }));
}

/** Records every request, and plays whichever action the test names. */
class ScriptedClient implements LlmChatClient {
  readonly requests: LlmChatRequest[] = [];

  constructor(private readonly pick: (offered: Offer[]) => Offer) {}

  async complete(request: LlmChatRequest): Promise<LlmChatResponse> {
    this.requests.push(structuredClone(request));
    const latest = request.messages.at(-1);
    if (!latest) throw new Error("MISSING_REQUEST");
    const chosen = this.pick(offers(latest.content));
    return {
      content: JSON.stringify({
        actionIds: [chosen.label],
        rationale: "Scripted for the test.",
      }),
    };
  }

  /** The request `index` as the model received it: Markdown, not JSON. */
  payload(index: number): string {
    const message = this.requests[index]?.messages.at(-1);
    if (!message) throw new Error(`no request ${index}`);
    return message.content;
  }
}

const takeTheSwing = (offered: Offer[]): Offer => {
  // The Leader's own swing: the summary names the attacker after "with", and
  // only the Leader is described as one.
  const attack = offered.find((offer) =>
    /^Attack .* with .* \(Leader,/.test(offer.summary),
  );
  if (!attack) throw new Error("no Leader attack on offer");
  return attack;
};

const countHitsAndPass = (offered: Offer[]): Offer => {
  // The line the old prompt argued for: at 1 opposing Life a single hit "only"
  // reaches 0, so the turn is not lethal and the attack is not worth the risk.
  const pass = offered.find((offer) => offer.summary.startsWith("End turn"));
  if (!pass) throw new Error("no pass on offer");
  return pass;
};

describe("what the LLM is told about a [Double Attack] Leader", () => {
  it("names the keyword on the Leader carrying it", async () => {
    const game = traceEighteenTurnNine();
    const client = new ScriptedClient(takeTheSwing);
    await new LlmAgent(client).chooseAction(observe(game.state, "p2"));

    // The field the recorded observation did not have. The +2000 from the same
    // clause was already there, under `staticPowerModifiers`, which is what made
    // the omission so easy to miss.
    expect(client.payload(0)).toContain("keywords: Double Attack");
  });

  it("prices each attack in Life, so lethal is visible without re-reading card text", async () => {
    const game = traceEighteenTurnNine();
    const client = new ScriptedClient(takeTheSwing);
    await new LlmAgent(client).chooseAction(observe(game.state, "p2"));
    const payload = client.payload(0);

    expect(payload).toContain("- opponentLife: 1");
    // The Life each attack takes is on the attack, not in a figure summing the
    // board: the SITUATION section used to carry `lifeDamageReachingLeaderNow`,
    // and a count derived from power against power had to re-decide which
    // bodies may attack a Leader at all -- which it got wrong. Every offer
    // states its own stake, and [Double Attack] is priced inside it, so the
    // sum is the model's to make out of the lines it can actually declare.
    const offers = payload.split("# AVAILABLE ACTIONS")[1]!;
    const leaderSwings = offers
      .split("\n")
      .filter((line) => line.includes("target op-leader"));
    // Two attackers reach the opposing Leader -- this seat's own Leader and
    // Newgate, the other two bodies having already swung -- and each line says
    // what a hit costs the defender.
    expect(leaderSwings).toHaveLength(2);
    for (const swing of leaderSwings) {
      expect(swing).toContain("Life card to their hand");
    }
    // The label is what says the two are different attackers rather than one
    // offered twice; see `actionCardLabels`.
    expect(leaderSwings[0]).toContain("[attacker leader, target op-leader]");
    expect(leaderSwings[1]).toContain("[attacker board-1, target op-leader]");
  });

  it("repeats both the keyword and the card text at every decision", async () => {
    const game = traceEighteenTurnNine();
    const client = new ScriptedClient((offered) => {
      const attach = offered.find((offer) =>
        offer.summary.startsWith("Attach 1 DON!!"),
      );
      return attach ?? takeTheSwing(offered);
    });
    const agent = new LlmAgent(client);

    // Two decisions in one turn. This used to be a history test: printed text
    // was cumulative conversation context sent once, so by the second message
    // `cardFacts` was empty and a model reconstructing [Double Attack] from
    // OP16-003's text was reading a message dozens of decisions back -- the
    // failure mode the trace shows. A stateless call cannot have that failure:
    // no request depends on an earlier one, so the text arrives every time,
    // alongside `effectiveKeywords`, which was always restated as board state.
    const first = await agent.chooseAction(observe(game.state, "p2"));
    game.submit(first);
    await agent.chooseAction(observe(game.state, "p2"));

    for (const index of [0, 1]) {
      expect(client.payload(index)).toContain(
        "# CARD TEXT NOT IN MATCH CONTEXT",
      );
      expect(client.payload(index)).toContain("keywords: Double Attack");
    }
  });

  it("no longer tells the model that hits are what count", async () => {
    const game = traceEighteenTurnNine();
    const client = new ScriptedClient(takeTheSwing);
    await new LlmAgent(client).chooseAction(observe(game.state, "p2"));
    const system = client.requests[0]?.messages[0]?.content ?? "";

    // The sentence that was false for eight cards in the format, and the reading
    // that replaced it.
    expect(system).not.toContain("Count hits, not damage");
    expect(system).toContain("Count damage, not hits");
    // What the section says now, and it is the opposite of what it said when
    // this file was written: Bandai's rules Q&A denies the kill from 1 Life.
    expect(system).toContain("reaches 0 Life from 2 and does NOT win from 1");
    expect(system).toContain(
      "Nothing wins except an attack declared while the opponent is already at 0 Life",
    );
    // The defender's half, which used to tell a defender at 1 Life that a
    // `lifeCost` of 2 was the game.
    expect(system).toContain("Above 0 Life no single hit is the game");
  });
});

describe("what the recreated position is really worth", () => {
  it("empties the Life stack on the Leader swing, and does not win", () => {
    const game = traceEighteenTurnNine();
    game.submit(leaderAttack(game.state));
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    // This file was written believing the swing was the game: "two points of
    // damage against 1 Life, the second lands on a 0-Life Leader". Bandai's
    // rules Q&A says otherwise -- each point checks a Life card and the second
    // has none -- so the swing takes the last card and the opponent survives at
    // 0 Life.
    //
    // The eval above still measures a real decision, and a bigger one than it
    // was measuring before: the swing is worth the whole Life stack and sets up
    // a kill the *next* attack collects, which is exactly the line a model
    // counting hits declines.
    expect(game.state.winner).toBeNull();
    expect(game.state.players.p1.life).toEqual([]);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("hands the turn back when the model counts hits and passes instead", async () => {
    const game = traceEighteenTurnNine();
    const action = await new LlmAgent(
      new ScriptedClient(countHitsAndPass),
    ).chooseAction(observe(game.state, "p2"));
    game.submit(action);

    expect(game.state.winner).toBeNull();
    expect(observe(game.state, "p1").turnPlayer).toBe("p1");
  });
});
