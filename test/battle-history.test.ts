import { describe, expect, it } from "vitest";
import type { PublicEvent } from "@one-piece-sim/protocol";
import { collectCardInstances } from "@one-piece-sim/engine-core";
import {
  renderHistoryHeader,
  renderHistoryList,
  type HistoryModel,
  type HistoryStep,
} from "../packages/web/src/battle-history.js";
import type { LlmDebugRecord } from "../packages/web/src/llm-settings.js";

function step(event: PublicEvent, actionCount: number): HistoryStep {
  return { event, actionCount };
}

function call(overrides: Partial<LlmDebugRecord> = {}): LlmDebugRecord {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    turn: 1,
    player: "p2",
    ...overrides,
  };
}

function model(overrides: Partial<HistoryModel> = {}): HistoryModel {
  return {
    steps: [],
    records: [],
    viewer: "p1",
    canRewind: true,
    ...overrides,
  };
}

const drew: PublicEvent = { type: "cards-drawn", playerId: "p2", count: 1 };
const ended: PublicEvent = {
  type: "turn-ended",
  playerId: "p2",
  nextPlayerId: "p1",
};

const played: PublicEvent = {
  type: "card-played",
  playerId: "p2",
  cardInstanceId: "p2-card-9",
  cardNumber: "OP17-080",
};
const revealed = (cardNumber: string): PublicEvent => ({
  type: "card-revealed",
  playerId: "p2",
  cardNumber,
  sourceCardNumber: "OP17-080",
});
const trashed = (cardNumber: string): PublicEvent => ({
  type: "card-moved",
  playerId: "p2",
  cardInstanceId: `p2-${cardNumber}`,
  cardNumber,
  from: "deck",
  to: "trash",
  sourceCardNumber: "OP17-080",
});

describe("match history", () => {
  it("numbers the entries in play order, and lists them newest first", () => {
    const html = renderHistoryList(
      model({
        steps: [
          step({ type: "setup-complete", activePlayer: "p1" }, 0),
          step(drew, 1),
        ],
      }),
    );
    // Opened to answer "what just happened", so the newest line is the first.
    expect(html.indexOf("drew")).toBeLessThan(html.indexOf("Setup complete"));
    // The numbers still count forwards, because they number the match.
    expect(html).toContain('class="history-ordinal">1</span>');
    expect(html).toContain('class="history-ordinal">2</span>');
  });

  it("gives an entry a standing Reset, naming the point and its cost", () => {
    // The row used to be the button, with an icon at zero opacity until the
    // pointer was on it: the one thing a reader could do here was invisible,
    // and reading a line meant risking the match.
    const html = renderHistoryList(
      model({
        steps: [
          step({ type: "setup-complete", activePlayer: "p1" }, 0),
          step(drew, 1),
          step(ended, 2),
        ],
      }),
    );
    expect(html).not.toContain('<button class="history-entry"');
    // The confirm is told which entry it is winding back to, and how many
    // entries that discards -- it covers the list it was clicked in.
    expect(html).toContain('data-history-discards="2"');
    expect(html).toContain('data-history-label="Opponent drew 1 card."');
  });

  it("puts one Reset on an action, not one on each of its entries", () => {
    // The turn handover is one `pass`: it ends the turn and then refreshes and
    // draws for the next one, and those steps sit under the next turn's
    // heading. Two entries, one action, one place to wind back to -- the
    // second button would have been the first button again.
    const html = renderHistoryList(
      model({
        steps: [
          step({ type: "setup-complete", activePlayer: "p2" }, 0),
          step(ended, 1),
          step({ type: "cards-drawn", playerId: "p1", count: 1 }, 1),
          step({ type: "cards-drawn", playerId: "p1", count: 1 }, 2),
        ],
      }),
    );
    expect(html.split('data-history-action="1"')).toHaveLength(2);
    // ...and it is the entry that names the action that carries it.
    const reset = html.indexOf('data-history-action="1"');
    expect(html.lastIndexOf("ended the turn", reset)).toBeGreaterThan(
      html.lastIndexOf("You drew", reset),
    );
    // Both halves of the handover survive that reset, so neither is counted
    // among what it discards.
    expect(html).toContain('data-history-discards="1"');
  });

  it("offers no Reset on the newest action, which would discard nothing", () => {
    const html = renderHistoryList(
      model({ steps: [step(drew, 1), step(ended, 2)] }),
    );
    expect(html).toContain('data-history-action="1"');
    expect(html).not.toContain('data-history-action="2"');
    expect(html).not.toContain('data-history-discards="0"');
  });

  it("carries no `data-action`, which the board binds to performAction", () => {
    // `[data-action]` is bound over the whole document to perform the engine
    // action it names. A history row that carried it turned every click on a
    // line into `act("6")` -- the action *count* read as an action id -- and
    // the board raised "Unknown action: 6". Nothing this file renders may use
    // that attribute name.
    const html = renderHistoryList(
      model({
        steps: [
          step({ type: "setup-complete", activePlayer: "p1" }, 0),
          step(played, 4),
          step(revealed("OP17-041"), 4),
          step(drew, 5),
          step(ended, 6),
        ],
        records: [call({ actionCount: 4, actionId: "play-usopp" })],
      }),
    );
    expect(html).not.toContain("data-action=");
    // The reset target is still there, under a name of this surface's own.
    expect(html).toContain('data-history-action="4"');
    expect(html).toContain('data-history-group="4"');
  });

  it("leaves the steps inside a fold as text, with no reset of their own", () => {
    // A reveal is not a decision anyone can go back to: it is part of the play
    // above it, and that play is the one reset target the action has.
    const html = renderHistoryList(
      model({
        steps: [
          step(played, 4),
          step(revealed("OP17-041"), 4),
          step(trashed("OP17-041"), 4),
          step(drew, 5),
        ],
      }),
    );
    const fold = html.slice(
      html.indexOf("<details"),
      html.indexOf("</details>"),
    );
    expect(fold).toContain("revealed Wang Zhi");
    expect(fold).not.toContain("history-reset");
    expect(fold).not.toContain("<button");
  });

  it("leaves the Reset out of a match that cannot be wound back", () => {
    // A standing button on a list with no rewind is a promise the screen
    // cannot keep, so an online seat gets the reading surface alone.
    const html = renderHistoryList(
      model({ steps: [step(drew, 1)], canRewind: false }),
    );
    expect(html).not.toContain("history-reset");
    expect(html).not.toContain("data-history-action");
  });

  it("draws one action as one entry, with its steps folded under it", () => {
    // OP17-080 Usopp: one play, three reveals, and the cards it moved -- seven
    // rows with seven reset buttons, all of which reset to the same point.
    const html = renderHistoryList(
      model({
        steps: [
          step(played, 4),
          step(revealed("OP17-041"), 4),
          step(revealed("OP17-042"), 4),
          step(trashed("OP17-042"), 4),
        ],
      }),
    );
    expect(html.split('data-history-group="4"')).toHaveLength(2);
    expect(html).toContain("<summary>3 more steps</summary>");
    // The play names the entry; what it caused is one click away, in the order
    // it happened.
    const headline = html.indexOf("played Usopp");
    expect(headline).toBeLessThan(html.indexOf("3 more steps"));
    expect(html.indexOf("revealed Wang Zhi")).toBeLessThan(
      html.indexOf("went from deck to the opponent&#39;s trash"),
    );
  });

  it("indents a row for the other seat, and for nothing else", () => {
    // Rows used to be indented for a second reason -- sharing a card number
    // with the entry before them, read as "this finished what that started".
    // It fired on 15% of entries across a dozen unrelated shapes, and because
    // the list runs backwards it indented a row under something drawn *below*
    // it. The row's own text names the card it came from, which is what the
    // indent was gesturing at.
    const html = renderHistoryList(
      model({
        steps: [
          step({ type: "setup-complete", activePlayer: "p2" }, 0),
          step(played, 4),
          step(revealed("OP17-041"), 4),
          step(trashed("OP17-041"), 5),
        ],
      }),
    );
    expect(html).not.toContain("continues");
    expect(html).toContain("(via Usopp [OP17-080])");
    // Its own action, so its own reset target -- the point a player most wants
    // back, where the choice is offered again.
    expect(html).toContain('data-history-group="5"');
    expect(html).toContain('data-history-action="4"');
  });

  it("starts a section per turn, and says whose it is", () => {
    const html = renderHistoryList(
      model({
        steps: [
          step({ type: "setup-complete", activePlayer: "p2" }, 0),
          step(drew, 1),
          step(ended, 2),
          step({ type: "cards-drawn", playerId: "p1", count: 1 }, 2),
        ],
      }),
    );
    expect(html).toContain("<b>Setup</b>");
    expect(html).toContain("<b>Turn 1</b><span>Opponent</span>");
    expect(html).toContain("<b>Turn 2</b><span>You</span>");
    // The handover is one action, but the steps it opens the next turn with
    // belong under that turn's heading rather than folded into the turn that
    // ended. Two entries of one action -- and so one reset between them.
    expect(html.split('data-history-group="2"')).toHaveLength(3);
    expect(html).not.toContain('data-history-action="2"');
    expect(html.indexOf("Turn 2")).toBeLessThan(html.indexOf("ended the turn"));
  });

  it("colours an entry by the seat that acted", () => {
    const html = renderHistoryList(
      model({
        steps: [
          step({ type: "setup-complete", activePlayer: "p1" }, 0),
          step(drew, 1),
          step(
            {
              type: "ability-triggered",
              playerId: "p2",
              sourceCardNumber: "OP17-119",
              sourceInstanceId: "p2-card-1",
            },
            2,
          ),
        ],
      }),
    );
    // The opponent's ability fired on the viewer's own turn, and is still the
    // opponent's row: the band says whose turn it is, the entry says who moved.
    expect(html).toContain('class="history-band mine"');
    expect(html).toContain('class="history-group theirs"');
  });

  it("draws a battle as one entry, led by the attack that opened it", () => {
    // Declaring, countering and resolving are three actions, and three rows
    // read as three things that happened -- with the defender's Counter, played
    // on the attacker's turn, sat between two of the attacker's rows as though
    // it were a move of its own. They are one exchange.
    const html = renderHistoryList(
      model({
        steps: [
          step({ type: "setup-complete", activePlayer: "p2" }, 0),
          step(
            {
              type: "attack-declared",
              playerId: "p2",
              attackerInstanceId: "p2-leader",
              targetInstanceId: "p1-leader",
              power: 5000,
            },
            1,
          ),
          step(
            {
              type: "counter-used",
              playerId: "p1",
              cardNumber: "OP01-013",
              power: 1000,
            },
            2,
          ),
          step(
            {
              type: "battle-resolved",
              attackerPlayerId: "p2",
              defenderPlayerId: "p1",
              targetInstanceId: "p1-leader",
              attackPower: 5000,
              defensePower: 6000,
              outcome: "defended",
            },
            3,
          ),
          step(drew, 4),
        ],
      }),
    );
    // One row for the exchange, titled by the attack, with the answer and the
    // outcome folded under it.
    expect(html).toContain("Opponent attacked your Leader");
    expect(html).toContain("<summary>2 more steps</summary>");
    const fold = html.slice(
      html.indexOf("<details"),
      html.indexOf("</details>"),
    );
    expect(fold).toContain("countered with");
    expect(fold).toContain("stopped");
    // One reset, and it is the declaration's: wind back there and the Counter
    // is offered again. The two actions inside the exchange offer none.
    expect(html).toContain('data-history-action="1"');
    expect(html).not.toContain('data-history-action="2"');
    expect(html).not.toContain('data-history-action="3"');
  });

  it("gives the end of the game its own entry", () => {
    const html = renderHistoryList(
      model({
        steps: [
          step(
            {
              type: "battle-resolved",
              attackerPlayerId: "p1",
              defenderPlayerId: "p2",
              targetInstanceId: "p2-leader",
              attackPower: 5000,
              defensePower: 5000,
              outcome: "game-win",
            },
            7,
          ),
          step({ type: "game-ended", winner: "p1", reason: "life" }, 7),
        ],
      }),
    );
    // Folded inside the attack that caused it, the one line anyone opens the
    // history for would be the one line nothing shows.
    expect(html).not.toContain("more step");
    expect(html.indexOf("won by life")).toBeLessThan(
      html.indexOf("dealt the final hit"),
    );
  });

  it("keeps an action a reset target, calls or no calls", () => {
    const html = renderHistoryList(
      model({
        steps: [step(drew, 3), step(ended, 4)],
        records: [call({ actionCount: 3, actionId: "pass" })],
      }),
    );
    expect(html).toContain('data-history-action="3"');
    expect(html).toContain("Reset the match to just after this");
  });

  it("puts a decision's calls under the step it produced", () => {
    // The list runs backwards in time, so "under" is where the reasoning that
    // came *before* the step belongs.
    const html = renderHistoryList(
      model({
        steps: [step(drew, 1), step(ended, 2)],
        records: [call({ actionCount: 1, actionId: "draw-a-card" })],
      }),
    );
    const call1 = html.indexOf("draw-a-card");
    expect(html.indexOf("ended the turn")).toBeLessThan(html.indexOf("drew"));
    expect(html.indexOf("drew")).toBeLessThan(call1);
  });

  it("flushes a call block under the first step of its action, not every step", () => {
    const html = renderHistoryList(
      model({
        steps: [step(drew, 1), step(ended, 1)],
        records: [call({ actionCount: 1, actionId: "pass-turn" })],
      }),
    );
    expect(html.split('class="history-calls"')).toHaveLength(2);
    // Both steps of the action are above the one block.
    expect(html.indexOf("drew")).toBeLessThan(html.indexOf("pass-turn"));
  });

  it("keeps a call's reasons behind one fold, and its move out of it", () => {
    const html = renderHistoryList(
      model({
        steps: [step(drew, 1)],
        records: [
          call({
            actionCount: 1,
            actionId: "draw-a-card",
            reasoning: "Need a second cheap play.",
            rawExchange: {
              request: { model: "test", input: [] },
              response: {
                output_text: JSON.stringify({
                  actionIds: ["draw-a-card"],
                  reasoning: "Draw, then curve out.",
                }),
              },
            },
          }),
        ],
      }),
    );
    expect(html).toContain("<summary>LLM reasoning</summary>");
    expect(html.indexOf("draw-a-card")).toBeLessThan(
      html.indexOf("LLM reasoning"),
    );
    expect(html.indexOf("LLM reasoning")).toBeLessThan(
      html.indexOf("Draw, then curve out."),
    );
    expect(html).toContain("Need a second cheap play.");
  });

  it("shows the turn plan above the reasoning, in one fold", () => {
    // The two answer different questions -- the plan is the turn the seat
    // believes it is playing, the sentence is why this step of it is being
    // taken now -- and a turn that fell apart shows it as a plan that changed
    // between consecutive calls with nothing on the board to explain it. That
    // is only readable if both are in the history.
    const html = renderHistoryList(
      model({
        steps: [step(drew, 1)],
        records: [
          call({
            actionCount: 1,
            actionId: "attack-leader",
            rawExchange: {
              request: { model: "test", input: [] },
              response: {
                output_text: JSON.stringify({
                  turnPlan: [
                    "attack op-leader with leader",
                    "attack op-leader with board-1",
                  ],
                  actionIds: ["attack-leader"],
                  reasoning: "Their 1000 Counter cannot stop either swing.",
                }),
              },
            },
          }),
        ],
      }),
    );
    expect(html).toContain("<summary>LLM plan and reasoning</summary>");
    expect(html).toContain("<li>attack op-leader with leader</li>");
    expect(html).toContain("<li>attack op-leader with board-1</li>");
    // Plan first, sentence second, and the plan labelled: a bare list of steps
    // beside a bare sentence says nothing about which is which.
    expect(html.indexOf("Turn plan")).toBeLessThan(
      html.indexOf("attack op-leader with leader"),
    );
    expect(html.indexOf("attack op-leader with board-1")).toBeLessThan(
      html.indexOf("Their 1000 Counter cannot stop either swing."),
    );
  });

  it("titles the fold for the reasoning alone when no plan was stated", () => {
    const html = renderHistoryList(
      model({
        steps: [step(drew, 1)],
        records: [
          call({
            actionCount: 1,
            actionId: "draw-a-card",
            rawExchange: {
              request: { model: "test", input: [] },
              response: {
                output_text: JSON.stringify({
                  // A Counter step: no plan of this seat's to state.
                  turnPlan: [],
                  actionIds: ["draw-a-card"],
                  reasoning: "Nothing reaches.",
                }),
              },
            },
          }),
        ],
      }),
    );
    expect(html).toContain("<summary>LLM reasoning</summary>");
    expect(html).not.toContain("Turn plan");
  });

  it("names the action without labelling it, and says the words once", () => {
    const html = renderHistoryList(
      model({
        steps: [step(drew, 1)],
        records: [
          call({
            actionCount: 1,
            actionId: "draw-a-card",
            // What a provider returning no summary of its own used to leave
            // stamped on the record: the answer's own reasoning.
            reasoning: "Draw, then curve out.",
            rawExchange: {
              request: { model: "test", input: [] },
              response: {
                output_text: JSON.stringify({
                  actionIds: ["draw-a-card"],
                  reasoning: "Draw, then curve out.",
                }),
              },
            },
          }),
        ],
      }),
    );
    expect(html).toContain("<code>draw-a-card</code>");
    expect(html).not.toContain("Model chose");
    expect(html).not.toContain("Provider summary");
    expect(html.split("Draw, then curve out.")).toHaveLength(2);
  });

  it("leaves the provider's reasoning unlabelled when it is the only one", () => {
    const html = renderHistoryList(
      model({
        steps: [step(drew, 1)],
        records: [
          call({
            actionCount: 1,
            actionId: "draw-a-card",
            reasoning: "Nothing else develops this turn.",
          }),
        ],
      }),
    );
    expect(html).toContain("Nothing else develops this turn.");
    expect(html).not.toContain("Provider summary");
  });

  it("gives a call with nothing to explain no fold at all", () => {
    const html = renderHistoryList(
      model({
        steps: [step(drew, 1)],
        records: [call({ actionCount: 1, actionId: "draw-a-card" })],
      }),
    );
    expect(html).toContain("draw-a-card");
    expect(html).not.toContain("LLM reasoning");
  });

  it("leads with a call whose action was never applied", () => {
    const html = renderHistoryList(
      model({
        steps: [step(drew, 1)],
        records: [call({ actionCount: 2, error: "timed out" })],
      }),
    );
    expect(html.indexOf("timed out")).toBeLessThan(html.indexOf("drew"));
    expect(html).toContain('class="history-calls failed"');
  });

  it("still shows a legacy trace's calls, saying they tie to no step", () => {
    const html = renderHistoryList(
      model({ steps: [step(drew, 1)], records: [call({ actionId: "old" })] }),
    );
    expect(html).toContain("could not tie to a step");
    expect(html).toContain("old");
  });

  it("names the cards a step only identified by instance", () => {
    const luffy: PublicEvent = {
      type: "card-played",
      playerId: "p2",
      cardInstanceId: "p2-card-4",
      cardNumber: "OP16-015",
    };
    const attacked: PublicEvent = {
      type: "attack-declared",
      playerId: "p2",
      attackerInstanceId: "p2-card-4",
      targetInstanceId: "p1-leader",
      power: 5000,
    };
    const html = renderHistoryList(
      model({
        steps: [step(luffy, 1), step(attacked, 2)],
        names: collectCardInstances(
          [luffy, attacked],
          [["p1-leader", "ST31-001"]],
        ),
      }),
    );
    expect(html).toContain("Monkey.D.Luffy");
    expect(html).toContain("your");
  });

  it("gives the modal its name and nothing else to read", () => {
    // The step and entry counts, and the line explaining the ordering, were
    // two rows of chrome above a list that says all of it by being the list.
    const html = renderHistoryHeader(
      model({ steps: [step(drew, 1)], records: [call({ actionCount: 1 })] }),
    );
    expect(html).toContain("<h2>Match history</h2>");
    expect(html).not.toContain("step");
    expect(html).not.toContain("entr");
    expect(html).not.toContain("model call");
  });

  it("warns once when the trace carries normalized payloads", () => {
    const html = renderHistoryHeader(
      model({
        records: [
          call({ actionCount: 1, payloadSource: "normalized" }),
          call({ actionCount: 2, payloadSource: "normalized" }),
        ],
      }),
    );
    expect(html.split("older trace")).toHaveLength(2);
  });

  it("says a match with no steps has none, rather than rendering nothing", () => {
    expect(renderHistoryList(model())).toContain("No events yet.");
  });
});
