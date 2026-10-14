import { describe, expect, it } from "vitest";
import { BrowserGameController } from "../packages/web/src/controller.js";
import {
  buildDiagnosticsJsonl,
  decisionFlags,
  inspectExportedMatch,
  parseExportedMatch,
  type DiagnosticsDecision,
  type DiagnosticsHeader,
  type DiagnosticsLine,
  type RawLlmRecord,
} from "../packages/web/src/diagnostics.js";
import { callSummary } from "../packages/web/src/battle-llm-debug.js";

const config = {
  p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
  p2Deck: "(Yellow) Eustass Kid - Starter Deck 36",
  p1Controller: "human",
  p2Controller: "llm",
  seed: "diagnostics-export-test",
  startingPlayer: "p1",
} as const;

function playSome(actionCount: number): BrowserGameController {
  const controller = new BrowserGameController(config);
  for (let index = 0; index < actionCount; index += 1) {
    const next = controller.activeObservation.legalActions[0];
    if (!next) break;
    controller.act(next.actionId);
  }
  return controller;
}

function parseLines(text: string): DiagnosticsLine[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DiagnosticsLine);
}

describe("match diagnostics export", () => {
  it("stores only the events each action added", () => {
    const controller = playSome(12);
    const trace = controller.trace();
    const rebuilt = [
      ...trace.initialEvents,
      ...trace.checkpoints.flatMap((checkpoint) => [...checkpoint.events]),
    ];

    // The whole log, once -- not the log so far, once per action.
    expect(rebuilt).toEqual(controller.activeObservation.publicEvents);
    expect(trace.checkpoints.length).toBeGreaterThan(1);
  });

  it("writes one JSONL line per decision and round-trips through Load", () => {
    const controller = playSome(10);
    const trace = controller.trace();
    const jsonl = buildDiagnosticsJsonl({
      trace,
      llmRecords: [],
      exportedAt: "2026-08-10T00:00:00.000Z",
    });

    const lines = parseLines(jsonl);
    const header = lines[0] as DiagnosticsHeader;
    expect(header.kind).toBe("header");
    expect(header.version).toBe(2);
    expect(header.config).toEqual(trace.config);
    expect(lines).toHaveLength(trace.actions.length + 1);
    expect(
      lines.slice(1).map((line) => (line as DiagnosticsDecision).actionId),
    ).toEqual([...trace.actions]);

    const restored = BrowserGameController.load(parseExportedMatch(jsonl));
    expect(restored.activeObservation.stateHash).toBe(
      controller.activeObservation.stateHash,
    );
  });

  it("joins a model call onto its decision, hoisting the constant payloads", () => {
    const controller = playSome(4);
    const trace = controller.trace();
    const actionId = trace.actions[2]!;
    const cardFacts = { "ST31-001": { name: "Sanji" } };
    const record: RawLlmRecord = {
      timestamp: "2026-08-10T00:00:01.000Z",
      turn: 1,
      player: "p2",
      actionId,
      reasoning: "summary text",
      rawExchange: {
        request: {
          model: "test-model",
          store: false,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: "SYSTEM PROMPT" }],
            },
            {
              role: "user",
              content: JSON.stringify({
                request: "choose_action",
                state: { turn: 1, cardFacts },
                legalActions: [{ actionId, type: "pass" }],
              }),
            },
          ],
          text: { format: { schema: { type: "object" } } },
        },
        response: {
          id: "resp-now",
          output_text: JSON.stringify({
            actionIds: [actionId],
            reasoning: "because",
            turnPlan: ["attack later"],
          }),
          usage: { input_tokens: 10 },
        },
      },
    };

    const jsonl = buildDiagnosticsJsonl({
      trace,
      llmRecords: [record],
      exportedAt: "2026-08-10T00:00:00.000Z",
    });
    const lines = parseLines(jsonl);
    const header = lines[0] as DiagnosticsHeader;
    expect(header.llm?.model).toBe("test-model");
    expect(header.llm?.systemPrompt).toBe("SYSTEM PROMPT");
    expect(header.llm?.cardFacts).toEqual(cardFacts);
    expect(header.llm?.responseSchema).toEqual({ type: "object" });

    const decisions = lines.slice(1) as DiagnosticsDecision[];
    const withCall = decisions.filter((decision) => decision.llm);
    expect(withCall).toHaveLength(1);
    const call = withCall[0]!;
    expect(call.actionId).toBe(actionId);
    expect(call.llm?.chosen).toEqual([actionId]);
    expect(call.llm?.reasoning).toBe("because");
    expect(call.llm?.plan).toEqual(["attack later"]);
    expect(call.llm?.responseId).toBe("resp-now");
    expect(call.llm?.reasoningSummary).toBe("summary text");
    // The observation is an object here, not a JSON string buried in the request.
    const observation = call.llm?.observation as {
      state: Record<string, unknown>;
    };
    expect(observation.state.turn).toBe(1);
    expect(observation.state).not.toHaveProperty("cardFacts");
    expect(call.llm?.rawRequest).toEqual(record.rawExchange?.request);
    expect(call.llm?.rawResponse).toEqual(record.rawExchange?.response);

    const inspected = inspectExportedMatch(jsonl);
    expect(inspected.llmRecords).toHaveLength(1);
    expect(inspected.llmRecords[0]).toMatchObject({
      actionId,
      payloadSource: "exact",
      rawExchange: record.rawExchange,
    });

    delete call.llm?.rawRequest;
    delete call.llm?.rawResponse;
    const legacyJsonl = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
    const legacy = inspectExportedMatch(legacyJsonl);
    expect(legacy.llmRecords[0]?.payloadSource).toBe("normalized");
    expect(
      (
        legacy.llmRecords[0]?.rawExchange?.request as {
          note?: string;
        }
      ).note,
    ).toContain("not the exact provider request");
    // The turn plan survives that reload: the normalized response carries it
    // under the key the answer itself uses, so the history still shows it.
    expect(callSummary(legacy.llmRecords[0]!).plan).toEqual(["attack later"]);
  });

  it("joins a reloaded call onto its own action, not onto its call index", () => {
    // The count used to advance only on decisions that carried a call, so a
    // call's `actionCount` came out as its position among the calls. In any
    // trace with a second seat that is not a model -- a human game, an LLM
    // against a rules agent -- that is a step from much earlier in the match,
    // and the history showed the model explaining somebody else's move. A
    // screenshot of the history is what caught it.
    const controller = playSome(9);
    const trace = controller.trace();
    const lateAction = trace.checkpoints[7]!;
    const jsonl = buildDiagnosticsJsonl({
      trace,
      llmRecords: [
        {
          timestamp: "2026-08-10T00:00:02.000Z",
          turn: lateAction.turn,
          player: lateAction.player,
          actionId: lateAction.actionId,
          actionCount: 8,
          rawExchange: {
            request: { model: "test", input: [] },
            response: {
              output_text: JSON.stringify({
                turnPlan: ["keep going"],
                actionIds: [lateAction.actionId],
                reasoning: "n/a",
              }),
            },
          },
        },
      ],
      exportedAt: "2026-08-10T00:00:00.000Z",
    });

    const reloaded = inspectExportedMatch(jsonl);
    expect(reloaded.llmRecords).toHaveLength(1);
    // The eighth action, because that is the action it chose -- not the first,
    // because it is the first call.
    expect(reloaded.llmRecords[0]?.actionCount).toBe(8);
    expect(reloaded.llmRecords[0]?.actionId).toBe(lateAction.actionId);
  });

  it("emits a failed call as its own line", () => {
    const controller = playSome(3);
    const lines = parseLines(
      buildDiagnosticsJsonl({
        trace: controller.trace(),
        llmRecords: [
          {
            timestamp: "2026-08-10T00:00:02.000Z",
            turn: 1,
            player: "p2",
            error: "LLM_INVALID_RESPONSE: missing message content",
          },
        ],
        exportedAt: "2026-08-10T00:00:00.000Z",
      }),
    );
    const errors = lines.filter((line) => line.kind === "llm-error");
    expect(errors).toHaveLength(1);
  });

  it("flags an attack that cannot reach its target and rests a Blocker", () => {
    const observation = {
      state: { self: { activeDon: 0 } },
      legalActions: [
        {
          actionId: "r74:attack:p2-card-45:p1-leader",
          type: "attack",
          attackPower: 6000,
          targetPower: 7000,
          counterShortfall: 0,
          attackerIsBlocker: true,
        },
      ],
    };
    expect(
      decisionFlags("r74:attack:p2-card-45:p1-leader", observation, [
        {
          type: "attack-declared",
          playerId: "p2",
          attackerInstanceId: "p2-card-45",
          targetInstanceId: "p1-leader",
          power: 6000,
        },
        {
          type: "battle-resolved",
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          targetInstanceId: "p1-leader",
          attackPower: 6000,
          defensePower: 7000,
          outcome: "defended",
        },
      ]),
    ).toEqual([
      "attack-no-shortfall",
      "attacked-with-blocker",
      "attack-failed",
    ]);
  });

  it("loads the v1 diagnostics object and a bare MatchTrace, but not a bare save", () => {
    const controller = playSome(6);
    const saved = controller.save();
    expect(
      parseExportedMatch(
        JSON.stringify({ version: 1, trace: controller.trace(), llmCalls: [] }),
      ).actions,
    ).toEqual([...saved.actions]);
    expect(
      parseExportedMatch(JSON.stringify(controller.trace())).actions,
    ).toEqual([...saved.actions]);
    // Loading a match requires a trace; a bare save carries no event history.
    expect(() => parseExportedMatch(JSON.stringify(saved))).toThrow(
      "UNRECOGNISED_MATCH_FILE",
    );
  });
});
