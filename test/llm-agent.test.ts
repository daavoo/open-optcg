import { describe, expect, it } from "vitest";
import { hasPrintedText } from "./support/printed-text.js";
import {
  clearPrintedText,
  loadPrintedText,
  loadedPrintedTextPack,
  UNIMPLEMENTED_CLAUSES,
} from "@one-piece-sim/cards";
import { GameService, observe } from "@one-piece-sim/engine-core";
import {
  deckStrategyDossier,
  llmMatchContext,
} from "@one-piece-sim/agents/llm-dossiers";
import { deckManifests, resolveDeck } from "@one-piece-sim/decks";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";
import {
  LlmAgent,
  OpenAiChatClient,
  type LlmChatClient,
  type LlmChatRequest,
  type LlmChatResponse,
} from "@one-piece-sim/agents/llm";

/** The label of the first offered action whose line matches, as the model reads it. */
function labelMatching(content: string, needle: string): string | undefined {
  for (const line of content.split("\n")) {
    const match = /^- (action-\d+): (.*)$/.exec(line);
    if (match && match[2]!.toLowerCase().includes(needle.toLowerCase())) {
      return match[1];
    }
  }
  return undefined;
}

class RecordingClient implements LlmChatClient {
  readonly requests: LlmChatRequest[] = [];

  async complete(request: LlmChatRequest): Promise<LlmChatResponse> {
    this.requests.push(structuredClone(request));
    const latest = request.messages.at(-1);
    if (!latest || latest.role !== "user") throw new Error("MISSING_REQUEST");
    if (!latest.content.includes("# AVAILABLE ACTIONS")) {
      throw new Error("MISSING_LEGAL_ACTIONS");
    }
    const first = request.allowedActionIds?.[0];
    if (!first) throw new Error("MISSING_ACTION_ID");
    return {
      content: JSON.stringify({
        actionIds: [first],
        reasoning: "This is the visible decision reasoning.",
      }),
      reasoningSummary: "This is the provider's reasoning summary.",
    };
  }
}

describe("LLM agent", () => {
  it("retries transient provider failures", async () => {
    let attempts = 0;
    const fetch = async () => {
      attempts += 1;
      if (attempts === 1) return new Response(null, { status: 520 });
      return new Response(
        JSON.stringify({
          id: "response-after-retry",
          object: "response",
          created_at: 0,
          status: "completed",
          model: "test-model",
          output: [
            {
              id: "message",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: '{"actionIds":["r0:pass"],"reasoning":"Pass."}',
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    };

    const response = await new OpenAiChatClient({
      model: "test-model",
      apiKey: "test",
      maxRetries: 1,
      fetch,
    }).complete({ messages: [{ role: "user", content: "Choose" }] });

    expect(attempts).toBe(2);
    expect(response.content).toBe(
      '{"actionIds":["r0:pass"],"reasoning":"Pass."}',
    );
  });

  it("retries a socket closing while the response body is read", async () => {
    let attempts = 0;
    const fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"id":"partial"'));
            controller.error(
              Object.assign(new TypeError("terminated"), {
                cause: Object.assign(new Error("other side closed"), {
                  code: "UND_ERR_SOCKET",
                }),
              }),
            );
          },
        });
        return new Response(body, {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          id: "response-after-socket-close",
          object: "response",
          created_at: 0,
          status: "completed",
          model: "test-model",
          output: [
            {
              id: "message",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: '{"actionIds":["r0:pass"],"reasoning":"Pass."}',
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    };

    const response = await new OpenAiChatClient({
      model: "test-model",
      apiKey: "test",
      maxRetries: 1,
      fetch,
    }).complete({ messages: [{ role: "user", content: "Choose" }] });

    expect(attempts).toBe(2);
    expect(response.content).toBe(
      '{"actionIds":["r0:pass"],"reasoning":"Pass."}',
    );
  });

  it("omits temperature by default and sends an explicit override", async () => {
    const bodies: unknown[] = [];
    const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body !== "string") {
        throw new Error("MISSING_REQUEST_BODY");
      }
      bodies.push(JSON.parse(init.body) as unknown);
      return new Response(
        JSON.stringify({
          id: "response",
          object: "response",
          created_at: 0,
          status: "completed",
          model: "test-model",
          output: [
            {
              id: "reasoning",
              type: "reasoning",
              summary: [
                {
                  type: "summary_text",
                  text: "The provider evaluated the legal actions.",
                },
              ],
            },
            {
              id: "message",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: '{"actionIds":["r0:pass"],"reasoning":"Preserve resources."}',
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    const request = {
      messages: [{ role: "user", content: "Choose" }] as const,
    };

    const defaultResponse = await new OpenAiChatClient({
      model: "test-model",
      apiKey: "test",
      fetch,
    }).complete(request);
    await new OpenAiChatClient({
      model: "test-model",
      apiKey: "test",
      temperature: 0.5,
      fetch,
    }).complete(request);

    expect(bodies[0]).not.toHaveProperty("temperature");
    expect(bodies[0]).toMatchObject({ store: false });
    // No provider summary is asked for: the answer's own `reasoning` field is
    // what the trace and the match history show.
    expect(bodies[0]).not.toHaveProperty("reasoning");
    expect(bodies[1]).toMatchObject({ temperature: 0.5 });
    expect(bodies[1]).not.toHaveProperty("previous_response_id");
    expect((bodies[1] as { input: unknown[] }).input).toHaveLength(
      request.messages.length,
    );
    expect(defaultResponse).toMatchObject({
      content: '{"actionIds":["r0:pass"],"reasoning":"Preserve resources."}',
      reasoningSummary: "The provider evaluated the legal actions.",
      rawExchange: { request: bodies[0] },
    });

    await new OpenAiChatClient({
      model: "gpt-5.6",
      apiKey: "test",
      fetch,
    }).complete({
      messages: [
        { role: "system", content: "Stable deck context" },
        ...request.messages,
      ],
      promptCacheKey: "stable-decks",
    });
    expect(bodies[2]).toMatchObject({
      prompt_cache_key: "stable-decks",
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
      store: false,
    });
    expect(
      (bodies[2] as { input: [{ content: unknown }, { content: unknown }] })
        .input[0].content,
    ).toMatchObject([{ prompt_cache_breakpoint: { mode: "explicit" } }]);
    // ...and the user message does not. It is fresh on every call, so a marker
    // there would write an entry no later request could ever read.
    expect(
      (bodies[2] as { input: [{ content: unknown }, { content: unknown }] })
        .input[1].content,
    ).not.toMatchObject([{ prompt_cache_breakpoint: { mode: "explicit" } }]);
  });

  it("sends one bounded request per decision and retains only the latest exchange", async () => {
    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-history",
    });
    const client = new RecordingClient();
    const agent = new LlmAgent(client);

    const first = await agent.chooseAction(observation);
    observation = service.act(
      observation.gameId,
      observation.revision,
      first.actionId,
    );
    await agent.chooseAction(observation);

    expect(client.requests).toHaveLength(2);
    expect(client.requests[0]?.messages.map((message) => message.role)).toEqual(
      ["system", "user"],
    );
    expect(client.requests[0]?.messages[0]?.content).toContain(
      "think the whole turn through before acting and write it out in the `turnPlan` field",
    );
    expect(client.requests[0]?.messages[0]?.content).not.toContain(
      "submitted list or hidden game information",
    );
    expect(client.requests[0]?.messages[0]?.content).toContain(
      "Conditions and continuous abilities are reevaluated after every action",
    );
    expect(client.requests[0]?.messages[0]?.content).toContain(
      "If it gains Rush later that turn, it becomes eligible to attack",
    );
    expect(client.requests[0]?.messages[0]?.content).toContain(
      "A revision has to be earned by something that changed since you wrote the plan",
    );
    expect(client.requests[0]?.messages[0]?.content).toContain(
      "Rush: Character allows that immediate attack only against Characters",
    );
    expect(client.requests[0]?.messages[0]?.content).toContain(
      "Banish trashes a Life card instead of adding it to hand",
    );
    expect(client.requests[0]?.messages[0]?.content).not.toContain(
      "Roronoa Zoro [OP12-020]",
    );
    // Every request is the same two messages: nothing accumulates between them.
    expect(client.requests[1]?.messages.map((message) => message.role)).toEqual(
      ["system", "user"],
    );
    expect(agent.history).toHaveLength(3);
    // The answer's own reasoning is the why; the provider's summary stays
    // beside it rather than standing in for it.
    expect(agent.lastReasoning).toBe("This is the visible decision reasoning.");
    expect(agent.lastReasoningSummary).toBe(
      "This is the provider's reasoning summary.",
    );

    const latest = client.requests[1]!.messages.at(-1)!.content;
    // The position as Markdown: one section per zone, one line per card.
    expect(latest).toContain("# YOUR STATE");
    expect(latest).toContain("# OPPONENT'S STATE");
    expect(latest).toContain("# RECENT EVENTS");
    expect(latest).toContain("# AVAILABLE ACTIONS");
    expect(latest).toContain(`- leader: ${observation.self.leader.cardNumber}`);
    expect(latest).toContain(`${observation.self.leader.currentPower} power`);
    expect(latest).toContain(
      `- ${observation.self.lifeCount} life cards left.`,
    );
    expect(latest).toContain(
      `- hand-1: ${observation.self.hand[0]!.cardNumber}`,
    );

    // The Race Arithmetic numbers, computed rather than asked for.
    // `counterPowerInHand` is the one that cannot be recovered from the board:
    // the hand is listed by card number, and the printed Counter lives in the
    // card text rather than beside each hand entry.
    //
    // This decision is p2's mulligan on p1's turn, so the turn-relative half is
    // the defensive one: the offensive pair would be describing a turn that has
    // not started. Nothing can attack on turn 1 either way.
    const counterPowerInHand = observation.self.hand.reduce(
      (sum, card) => sum + card.counter,
      0,
    );
    expect(latest).toContain(`- ownLife: ${observation.self.lifeCount}`);
    expect(latest).toContain(
      `- opponentLife: ${observation.opponent.lifeCount}`,
    );
    expect(latest).toContain(`- counterPowerInHand: ${counterPowerInHand}`);
    expect(latest).toContain("- incomingAttacksLeftThisTurn: 0");
    // Your Leader always declares, so this never reads 0.
    expect(latest).toContain(
      `- yourAttackersNextTurn: ${1 + observation.self.board.length}`,
    );

    // Every legal action is offered, labelled by position, with the engine's
    // own summary as the line.
    observation.legalActions.forEach((action, index) => {
      expect(latest).toContain(`- action-${index + 1}: ${action.summary}`);
    });
    // ...and the engine IDs are not shown at all: the labels are the interface.
    expect(latest).not.toContain(observation.legalActions[0]!.actionId);

    // No match context was given to this agent, so no card text is in the
    // system prompt and every visible card arrives in the request instead.
    const firstRequest = client.requests[0]!.messages.at(-1)!.content;
    expect(firstRequest).toContain("# CARD TEXT NOT IN MATCH CONTEXT");
    expect(firstRequest).toContain(
      `- ${observation.self.leader.cardNumber}: {`,
    );
    expect(firstRequest).toContain(observation.self.leader.name);
  });

  it("formats the automatically loaded dossier as concise Markdown and XML", async () => {
    const observation = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-dossier-format",
    });
    const context = llmMatchContext(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
      "(Green) Roronoa Zoro - Starter Deck 32",
      deckManifests["(Green) Roronoa Zoro - Starter Deck 32"]!,
    );
    const client = new RecordingClient();
    const agent = new LlmAgent(client, context);

    await agent.chooseAction(observation);

    const prompt = client.requests[0]!.messages[0]!.content;
    const matchContext = prompt.slice(prompt.indexOf("# Match Context"));
    expect(matchContext).toContain("<own_deck>");
    expect(matchContext).toContain("## Opponent Scouting");
    expect(matchContext).toContain('<card number="ST31-001" name="Sanji"');
    expect(matchContext).toContain('count="2"');
    expect(matchContext).toContain("Sanji can free-play Chopper");
    expect(matchContext).toContain("not the opponent's submitted deck list");
    expect(matchContext).not.toContain('"selfDeck"');
    expect(matchContext).not.toContain("officialTextHash");
    expect(matchContext).not.toContain("retrievedAt");
    expect(matchContext.length).toBeLessThan(JSON.stringify(context).length);
  });

  it("sends the engine's text for an own-deck card the dossier named without it", async () => {
    // The browser's shape: the dossier is built in a worker that holds no text
    // pack, so the seat's own deck list is names and stats, while the engine --
    // on the thread that does hold the pack -- puts the words in `cardFacts`.
    // Deduping on the card number alone dropped exactly those, which is how a
    // seat came to read its opponent's cards and not its own.
    const restore = loadedPrintedTextPack();
    clearPrintedText();
    try {
      const service = new GameService();
      const created = service.create({
        p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
        p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
        seed: "llm-own-deck-text",
      });
      // Rendered while the process holds no text, the way the worker does it.
      const context = llmMatchContext(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
        "(Green) Roronoa Zoro - Starter Deck 32",
        deckManifests["(Green) Roronoa Zoro - Starter Deck 32"]!,
      );
      const client = new RecordingClient();
      const agent = new LlmAgent(client, context);
      // A card of the seat's own deck that the position makes visible, so the
      // engine has an opinion about it and the deck list names it.
      const own = Object.keys(created.cardFacts).find(
        (cardNumber) =>
          deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!.cards[
            cardNumber
          ] !== undefined,
      );
      expect(own).toBeDefined();
      loadPrintedText({
        [own!]: { effect: "[On Play] SENTINEL CLAUSE", trigger: "" },
      });

      // Re-observed, so the facts are the ones a process holding the pack
      // produces -- which is what the browser's engine thread always had.
      await agent.chooseAction(service.observe(created.gameId, "p1"));

      const prompt = client.requests[0]!.messages[0]!.content;
      const request = client.requests[0]!.messages[1]!.content;
      expect(prompt).toContain(`<card number="${own!}"`);
      expect(prompt).not.toContain("SENTINEL CLAUSE");
      expect(request).toContain("# CARD TEXT NOT IN MATCH CONTEXT");
      expect(request).toContain("SENTINEL CLAUSE");
    } finally {
      clearPrintedText();
      loadPrintedText(restore);
    }
  });

  it("does not repeat text the dossier already carries", async () => {
    const restore = loadedPrintedTextPack();
    clearPrintedText();
    try {
      const service = new GameService();
      const created = service.create({
        p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
        p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
        seed: "llm-own-deck-text",
      });
      const own = Object.keys(created.cardFacts).find(
        (cardNumber) =>
          deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!.cards[
            cardNumber
          ] !== undefined,
      )!;
      // Loaded *before* the dossier renders, which is what the fixed browser
      // does: the deck list itself carries the words, so nothing resends them.
      loadPrintedText({
        [own]: { effect: "[On Play] SENTINEL CLAUSE", trigger: "" },
      });
      const client = new RecordingClient();
      const agent = new LlmAgent(
        client,
        llmMatchContext(
          "(Red) Monkey.D.Luffy - Starter Deck 31",
          deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
          "(Green) Roronoa Zoro - Starter Deck 32",
          deckManifests["(Green) Roronoa Zoro - Starter Deck 32"]!,
        ),
      );

      await agent.chooseAction(service.observe(created.gameId, "p1"));

      const prompt = client.requests[0]!.messages[0]!.content;
      const request = client.requests[0]!.messages[1]!.content;
      expect(prompt).toContain("SENTINEL CLAUSE");
      expect(request).not.toContain("SENTINEL CLAUSE");
    } finally {
      clearPrintedText();
      loadPrintedText(restore);
    }
  });

  it("has no printed clause left to mark as unresolved", async () => {
    const observation = new GameService().create({
      p1: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "llm-unimplemented-clause",
    });
    const context = llmMatchContext(
      "(Blue/Yellow) Nami - Official Feature Deck",
      deckManifests["(Blue/Yellow) Nami - Official Feature Deck"]!,
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
    );
    const client = new RecordingClient();
    const agent = new LlmAgent(client, context);

    await agent.chooseAction(observation);

    // A dossier that prints an [On Play] the engine drops invites the agent to
    // build a turn around it. One match was lost to exactly that: eight DON!!
    // spent on OP16-119 at 1 Life for a Life gain that never happened. Both of
    // that card's clauses now resolve, so the note it used to carry is gone --
    // `promptCard` still renders one for anything `UNIMPLEMENTED_CLAUSES` lists,
    // and the register is empty.
    const prompt = client.requests[0]!.messages[0]!.content;
    expect(UNIMPLEMENTED_CLAUSES).toEqual([]);
    expect(prompt).toContain('number="OP16-119"');
    expect(prompt).not.toContain("<unimplemented>");
    // The prompt carries the printed text only where the process holds it.
    if (hasPrintedText()) {
      const teach = prompt.slice(prompt.indexOf('number="OP16-119"'));
      const card = teach.slice(0, teach.indexOf("</card>"));
      expect(card).toContain("add up to 1 card to the top of your Life cards");
    }
  });

  it("provides ST32-specific Zoro sequencing and defense guidance", () => {
    const dossier = deckStrategyDossier(
      "(Green) Roronoa Zoro - Starter Deck 32",
    );

    expect(dossier.archetype).toContain("rested-DON!! engine");
    expect(dossier.gamePlan.join(" ")).toContain(
      "Develop first when spending DON!! enables Kuina or Tashigi",
    );
    expect(dossier.priorities.join(" ")).toContain(
      "Treat Life as a resource, not free damage",
    );
    expect(dossier.sources).toHaveLength(3);
  });

  it("plans multiple hand counters and the final pass in one provider call", async () => {
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-counter-bundle",
    });
    const firstCardId = base.self.hand[0]!.instanceId;
    const secondCardId = base.self.hand[1]!.instanceId;
    const counterActions = (revision: number) => [
      {
        actionId: `r${revision}:counter:${firstCardId}`,
        type: "counter" as const,
        cardInstanceId: firstCardId,
        summary: "Counter with first card (+1000)",
      },
      {
        actionId: `r${revision}:counter:${secondCardId}`,
        type: "counter" as const,
        cardInstanceId: secondCardId,
        summary: "Counter with second card (+1000)",
      },
      {
        actionId: `r${revision}:pass-counter`,
        type: "pass" as const,
        summary: "Resolve battle",
      },
    ];
    const observation = {
      ...base,
      phase: "counter" as const,
      legalActions: counterActions(0),
    };
    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        return {
          content: JSON.stringify({
            actionIds: observation.legalActions.map(
              (action) => action.actionId,
            ),
            reasoning: "Commit two counters, then resolve the defended attack.",
          }),
        };
      },
    });

    const first = await agent.chooseAction(observation);
    const second = await agent.chooseAction({
      ...observation,
      revision: 1,
      legalActions: counterActions(1).slice(1),
    });
    const pass = await agent.chooseAction({
      ...observation,
      revision: 2,
      legalActions: counterActions(2).slice(2),
    });

    expect([first.type, second.type, pass.type]).toEqual([
      "counter",
      "counter",
      "pass",
    ]);
    expect(calls).toBe(1);
    expect(agent.lastRawExchange).toBeUndefined();
  });

  it("plans multiple DON!! attachments to the same target in one provider call", async () => {
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-don-bundle",
    });
    const targetInstanceId = "leader-p1";
    const attachActions = (revision: number) => [
      {
        actionId: `r${revision}:attach:${targetInstanceId}`,
        type: "attach-don" as const,
        targetInstanceId,
        summary: "Attach 1 DON!! to Leader (+1000 power this turn)",
      },
      {
        actionId: `r${revision}:pass`,
        type: "pass" as const,
        summary: "End the turn",
      },
    ];
    const observation = {
      ...base,
      phase: "main" as const,
      legalActions: attachActions(0),
    };
    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        const attachActionId = observation.legalActions[0]!.actionId;
        return {
          content: JSON.stringify({
            actionIds: [attachActionId, attachActionId, attachActionId],
            reasoning: "Give three DON!! to the Leader before attacking.",
          }),
        };
      },
    });

    const first = await agent.chooseAction(observation);
    const second = await agent.chooseAction({
      ...observation,
      revision: 1,
      legalActions: attachActions(1),
    });
    const third = await agent.chooseAction({
      ...observation,
      revision: 2,
      legalActions: attachActions(2),
    });

    for (const action of [first, second, third]) {
      expect(action.type).toBe("attach-don");
      expect(action.type === "attach-don" && action.targetInstanceId).toBe(
        targetInstanceId,
      );
    }
    expect(calls).toBe(1);
  });

  it("declares the attack a DON!! plan ends with, without asking again", async () => {
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-don-then-attack",
    });
    const targetInstanceId = "leader-p1";
    const attackerInstanceId = "leader-p1";
    const defenderInstanceId = "leader-p2";
    const mainActions = (revision: number) => [
      {
        actionId: `r${revision}:attach:${targetInstanceId}`,
        type: "attach-don" as const,
        targetInstanceId,
        summary: "Attach 1 DON!! to Leader (+1000 power this turn)",
      },
      {
        actionId: `r${revision}:attack:${attackerInstanceId}`,
        type: "attack" as const,
        attackerInstanceId,
        targetInstanceId: defenderInstanceId,
        summary: "Attack the opposing Leader",
      },
    ];
    const observation = {
      ...base,
      phase: "main" as const,
      legalActions: mainActions(0),
    };
    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        const [attach, attack] = observation.legalActions;
        return {
          content: JSON.stringify({
            actionIds: [attach!.actionId, attach!.actionId, attack!.actionId],
            reasoning: "Two DON!! on the Leader, then swing with it.",
          }),
        };
      },
    });

    const steps = [
      await agent.chooseAction(observation),
      await agent.chooseAction({
        ...observation,
        revision: 1,
        legalActions: mainActions(1),
      }),
      await agent.chooseAction({
        ...observation,
        revision: 2,
        legalActions: mainActions(2),
      }),
    ];

    expect(steps.map((step) => step.type)).toEqual([
      "attach-don",
      "attach-don",
      "attack",
    ]);
    // The attack is matched by its attacker and target, not by the ID the model
    // saw: that ID named revision 0 and the attack is declared at revision 2.
    const attack = steps[2]!;
    expect(attack.type === "attack" && attack.attackerInstanceId).toBe(
      attackerInstanceId,
    );
    expect(attack.actionId).toBe(`r2:attack:${attackerInstanceId}`);
    expect(calls).toBe(1);
  });

  it("drops a DON!! plan whose attack the board no longer offers", async () => {
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-don-attack-stale",
    });
    const targetInstanceId = "leader-p1";
    const attach = (revision: number) => ({
      actionId: `r${revision}:attach:${targetInstanceId}`,
      type: "attach-don" as const,
      targetInstanceId,
      summary: "Attach 1 DON!! to Leader (+1000 power this turn)",
    });
    const attack = (revision: number) => ({
      actionId: `r${revision}:attack:${targetInstanceId}`,
      type: "attack" as const,
      attackerInstanceId: targetInstanceId,
      targetInstanceId: "character-p2",
      summary: "Attack the Character",
    });
    const observation = {
      ...base,
      phase: "main" as const,
      legalActions: [attach(0), attack(0)],
    };
    let calls = 0;
    const agent = new LlmAgent({
      // Answer with the plan built from whatever this request offered, so a
      // second call is a real second decision rather than a stale replay.
      async complete(request) {
        calls += 1;
        const content = request.messages.at(-1)?.content ?? "";
        const offered = [...content.matchAll(/^- (action-\d+): (.*)$/gm)];
        const ids = offered
          .filter((match) => !match[2]!.startsWith("Attack") || calls === 1)
          .map((match) => match[1]!);
        return {
          content: JSON.stringify({
            actionIds: ids,
            reasoning: "Pump, then kill the Character.",
          }),
        };
      },
    });

    expect((await agent.chooseAction(observation)).type).toBe("attach-don");
    // The Character the plan aimed at is gone, so the attack step matches
    // nothing. The decision has to come back to the model rather than landing
    // on whatever attack is left.
    const next = await agent.chooseAction({
      ...observation,
      revision: 1,
      legalActions: [
        attach(1),
        { ...attack(1), targetInstanceId: "leader-p2" },
      ],
    });
    expect(next.type).toBe("attach-don");
    expect(calls).toBe(2);
  });

  it("rejects an attack named before the DON!! it would be raised by", async () => {
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-attack-first",
    });
    const targetInstanceId = "leader-p1";
    const legalActions = [
      {
        actionId: "r0:attach:leader-p1",
        type: "attach-don" as const,
        targetInstanceId,
        summary: "Attach 1 DON!! to Leader (+1000 power this turn)",
      },
      {
        actionId: "r0:attack:leader-p1",
        type: "attack" as const,
        attackerInstanceId: targetInstanceId,
        targetInstanceId: "leader-p2",
        summary: "Attack the opposing Leader",
      },
    ];
    const observation = { ...base, phase: "main" as const, legalActions };
    const corrections: string[] = [];
    let calls = 0;
    const agent = new LlmAgent({
      async complete(request) {
        calls += 1;
        if (calls === 1) {
          return {
            content: JSON.stringify({
              actionIds: ["r0:attack:leader-p1", "r0:attach:leader-p1"],
              reasoning: "Swing, then pump.",
            }),
          };
        }
        corrections.push(request.messages.at(-1)?.content ?? "");
        return {
          content: JSON.stringify({
            actionIds: ["r0:attach:leader-p1"],
            reasoning: "Pump first.",
          }),
        };
      },
    });

    const action = await agent.chooseAction(observation);
    expect(action.type).toBe("attach-don");
    expect(calls).toBe(2);
    expect(corrections[0]).toContain("attack must be last");
  });

  it("spreads one DON!! plan across several targets", async () => {
    // The grammar used to insist every DON!! in a plan go to the same target,
    // which cost a recorded game: three DON!! went onto a Rush Character the
    // defender's whole hand could not Counter while two other attackers sat a
    // Counter point short of connecting, because "one each" was not sayable.
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-don-spread",
    });
    const legalActions: LegalAction[] = [
      {
        actionId: "r5:attach:leader-p1",
        type: "attach-don",
        targetInstanceId: "leader-p1",
        summary: "Attach 1 DON!! to Leader (+1000 power this turn)",
      },
      {
        actionId: "r5:attach:p1-card-1",
        type: "attach-don",
        targetInstanceId: "p1-card-1",
        summary: "Attach 1 DON!! to Character (+1000 power this turn)",
      },
      { actionId: "r5:pass", type: "pass", summary: "End the turn" },
    ];
    const observation = { ...base, phase: "main" as const, legalActions };
    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        return {
          content: JSON.stringify({
            actionIds: ["r5:attach:leader-p1", "r5:attach:p1-card-1"],
            reasoning: "Give one DON!! to each.",
          }),
        };
      },
    });

    const first = await agent.chooseAction(observation);
    expect(first.actionId).toBe("r5:attach:leader-p1");
    // The second target is taken from the plan, off the same model call: the
    // IDs are renumbered by the attachment, so the step is matched by the
    // instance it named rather than by the ID it was written as.
    const second = await agent.chooseAction({
      ...observation,
      revision: 6,
      legalActions: [
        {
          actionId: "r6:attach:p1-card-1",
          type: "attach-don",
          targetInstanceId: "p1-card-1",
          summary: "Attach 1 DON!! to Character (+1000 power this turn)",
        },
        { actionId: "r6:pass", type: "pass", summary: "End the turn" },
      ],
    });
    expect(second.actionId).toBe("r6:attach:p1-card-1");
    expect(calls).toBe(1);
  });

  it("rejects repeated action IDs outside a DON!! attachment plan and retries", async () => {
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-don-bundle-invalid",
    });
    const legalActions: LegalAction[] = [
      {
        actionId: "r5:attach:leader-p1",
        type: "attach-don",
        targetInstanceId: "leader-p1",
        summary: "Attach 1 DON!! to Leader (+1000 power this turn)",
      },
      {
        actionId: "r5:play:1:p1-card-1",
        type: "play-card",
        cardInstanceId: "p1-card-1",
        summary: "Play a Character (cost 1 DON!!)",
      },
      { actionId: "r5:pass", type: "pass", summary: "End the turn" },
    ];
    const observation = { ...base, phase: "main" as const, legalActions };
    const corrections: string[] = [];
    let calls = 0;
    const agent = new LlmAgent({
      async complete(request) {
        calls += 1;
        if (calls === 1) {
          return {
            content: JSON.stringify({
              // Playing a card is not an attachment, so it cannot ride along in
              // a DON!! plan however many IDs are named.
              actionIds: ["r5:attach:leader-p1", "r5:play:1:p1-card-1"],
              reasoning: "Pump, then develop.",
            }),
          };
        }
        corrections.push(request.messages.at(-1)?.content ?? "");
        return {
          content: JSON.stringify({
            actionIds: ["r5:attach:leader-p1"],
            reasoning: "Give the Leader one DON!! instead.",
          }),
        };
      },
    });

    const action = await agent.chooseAction(observation);

    expect(action.actionId).toBe("r5:attach:leader-p1");
    expect(calls).toBe(2);
    expect(corrections[0]).toContain("must be an attach-don");
  });

  it("completes a hand-counter plan when the model omits the final pass", async () => {
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-counter-pass-omission",
    });
    const cardInstanceId = base.self.hand[0]!.instanceId;
    const counterActions = (revision: number) => [
      {
        actionId: `r${revision}:counter:${cardInstanceId}`,
        type: "counter" as const,
        cardInstanceId,
        summary: "Counter with card (+1000)",
      },
      {
        actionId: `r${revision}:pass-counter`,
        type: "pass" as const,
        summary: "Resolve battle",
      },
    ];
    const observation = {
      ...base,
      phase: "counter" as const,
      legalActions: counterActions(0),
    };
    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        return {
          content: JSON.stringify({
            actionIds: [observation.legalActions[0]!.actionId],
            reasoning: "Use one hand counter.",
          }),
        };
      },
    });

    const counter = await agent.chooseAction(observation);
    const pass = await agent.chooseAction({
      ...observation,
      revision: 1,
      legalActions: counterActions(1).slice(1),
    });

    expect([counter.type, pass.type]).toEqual(["counter", "pass"]);
    expect(calls).toBe(1);
  });

  it("rejects a counter plan that falls short of the shortfall and retries", async () => {
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-counter-shortfall",
    });
    const usoppId = base.self.hand[0]!.instanceId;
    const jinbeId = base.self.hand[1]!.instanceId;
    const legalActions: LegalAction[] = [
      {
        actionId: "r97:counter:p2-card-26",
        type: "counter",
        cardInstanceId: usoppId,
        counterPower: 2000,
        summary: "Counter with Usopp [OP11-003] (+2000; still hit)",
      },
      {
        actionId: "r97:counter:p2-card-13",
        type: "counter",
        cardInstanceId: jinbeId,
        counterPower: 1000,
        summary: "Counter with Jinbe [ST31-002] (+1000; still hit)",
      },
      {
        actionId: "r97:pass-counter",
        type: "pass",
        summary: "Resolve battle without more counters (still hit)",
      },
    ];
    const observation = {
      ...base,
      phase: "counter" as const,
      legalActions,
      activeBattle: {
        attackerInstanceId: "p1-card-7",
        targetInstanceId: "p2-card-39",
        attackPower: 6000,
        targetPower: 3000,
        counterPower: 0,
        counterShortfall: 3001,
        // A Character target, so a hit takes no Life at all.
        lifeCost: 0,
      },
    };
    let calls = 0;
    const agent = new LlmAgent({
      async complete(request) {
        calls += 1;
        if (calls === 1) {
          return {
            content: JSON.stringify({
              actionIds: legalActions.map((action) => action.actionId),
              reasoning:
                "Spend the two Character counters without the Counter Event.",
            }),
          };
        }
        const latest = request.messages.at(-1)!;
        expect(latest.content).toContain("LLM_INSUFFICIENT_COUNTER_PLAN");
        expect(latest.content).toContain("3000");
        expect(latest.content).toContain("3001");
        return {
          content: JSON.stringify({
            actionIds: ["r97:pass-counter"],
            reasoning:
              "Neither counter closes the gap; keep both cards instead.",
          }),
        };
      },
    });

    const action = await agent.chooseAction(observation);

    expect(action.actionId).toBe("r97:pass-counter");
    expect(calls).toBe(2);
  });

  it("keeps reasoning continuation without serializing a turn plan", async () => {
    const service = new GameService();
    const observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-plan-carry",
    });
    const payloads: string[] = [];
    const agent = new LlmAgent({
      async complete(request) {
        payloads.push(request.messages.at(-1)!.content);
        return {
          content: JSON.stringify({
            actionIds: [request.allowedActionIds![0]],
            reasoning: "Develop before attacking.",
          }),
          conversationDelta: [
            { type: "message", role: "user" },
            { type: "reasoning", id: `reasoning-${payloads.length}` },
          ],
        };
      },
    });

    await agent.chooseAction(observation);
    expect(payloads[0]).not.toContain("previousPlan");

    // No advisory natural-language plan is duplicated into the next
    // observation; the request describes the position, not the last answer.
    await agent.chooseAction({
      ...observation,
      revision: 1,
      legalActions: observation.legalActions.map((action) => ({
        ...action,
        actionId: action.actionId.replace(/^r0:/, "r1:"),
      })),
    });
    expect(payloads[1]).not.toContain("previousPlan");

    await agent.chooseAction({
      ...observation,
      turn: observation.turn + 1,
      revision: 2,
      legalActions: observation.legalActions.map((action) => ({
        ...action,
        actionId: action.actionId.replace(/^r0:/, "r2:"),
      })),
    });
    expect(payloads[2]).not.toContain("previousPlan");
  });

  it("treats a counter-event effect choice as a normal single action", async () => {
    const base = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-counter-effect-choice",
    });
    const effectAction = (
      instanceId: string,
      cardNumber: string,
      name: string,
    ): LegalAction => ({
      actionId: `r76:effect:${instanceId}`,
      type: "resolve-effect",
      optionId: instanceId,
      optionCardNumber: cardNumber,
      effectKind: "bad-manners-counter",
      sourceCardNumber: "OP04-016",
      option: {
        kind: "card",
        owner: "self",
        zone: "hand",
        card: {
          instanceId,
          cardNumber,
          name,
          category: cardNumber === "OP04-016" ? "event" : "character",
          cost: cardNumber === "OP04-016" ? 0 : 4,
          power: cardNumber === "OP04-016" ? 0 : 5000,
          counter: cardNumber === "OP04-016" ? 0 : 1000,
        },
      },
      summary: `Trash ${name} [${cardNumber}]`,
    });
    const selected = effectAction(
      "p2-card-45",
      "OP04-016",
      "Bad Manners Kick Course",
    );
    const observation = {
      ...base,
      revision: 76,
      phase: "counter" as const,
      legalActions: [
        effectAction("p2-card-40", "P-101", "Tony Tony.Chopper"),
        selected,
      ],
    };
    let requestPayload = "";
    const agent = new LlmAgent({
      async complete(request) {
        requestPayload = request.messages.at(-1)!.content;
        return {
          content: JSON.stringify({
            actionIds: [selected.actionId],
            reasoning: "Trash the expendable event.",
          }),
        };
      },
    });

    await expect(agent.chooseAction(observation)).resolves.toEqual(selected);
    // A single choice, not a counter plan: the answer shape asks for one id.
    expect(requestPayload).toContain("Then reply with: one action id");
  });

  it("keeps response continuation when the previous action is still legal", async () => {
    const observation = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-repeated-observation",
    });
    const client = new RecordingClient();
    const agent = new LlmAgent(client);

    const first = await agent.chooseAction(observation);
    await agent.chooseAction(observation);

    expect(client.requests[1]?.messages.map((message) => message.role)).toEqual(
      ["system", "user"],
    );
    // No history to read it off any more, so the action this seat took last is
    // named explicitly on every request.
    expect(client.requests[1]!.messages[1]!.content).toContain(
      `Your last action: ${first.summary}`,
    );
  });

  it("names the reason it gave for the action it took last", async () => {
    // A decision sequence has no other memory. The recorded discard that
    // prompted this trashed its own 10-cost finisher one decision after
    // writing "retain Linlin", because the second half of a two-card discard
    // was shown what it had done and not why -- and on the opponent's turn,
    // which is where such sequences mostly arrive, no turn plan is shown or
    // kept to carry it.
    const observation = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-previous-reasoning",
    });
    const client = new RecordingClient();
    const agent = new LlmAgent(client);

    await agent.chooseAction(observation);
    await agent.chooseAction(observation);

    expect(client.requests[1]!.messages[1]!.content).toContain(
      "Why you chose it: This is the visible decision reasoning.",
    );
    // Nothing to report at the first decision of a game, so the line is absent
    // rather than empty.
    expect(client.requests[0]!.messages[1]!.content).not.toContain(
      "Why you chose it:",
    );
  });

  it("counts given DON!! into what each seat can spend next turn", async () => {
    // The cost area is not the seat's DON!! total: what it has given is still
    // its own and comes back at its Refresh. A recorded seat read the cost-area
    // line as the total, called a 10-cost card in hand uncastable on five, and
    // trashed it to a discard cost the turn before its Refresh would have
    // handed it ten.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("llm-don-next-turn")
      .atTurn(8, { active: "p2" })
      .withBoard("p2", [character("zoro", "ST32-004")])
      .withGivenDon("p2", "zoro", 3)
      .build();
    const client = new RecordingClient();
    const agent = new LlmAgent(client);

    await agent.chooseAction(observe(game.state, "p2"));

    const content = client.requests[0]!.messages[1]!.content;
    // Five left in the cost area, three on the board, and the DON!! Phase adds
    // the last two: the whole DON!! deck, which is the point -- the cost-area
    // line alone reads five.
    expect(content).toContain(
      "- DON!! next turn: 10 (5 in the cost area, 3 given and returning at your Refresh, 2 added from the DON!! deck).",
    );
    // The same sum for the other seat, off its own numbers and its own Refresh
    // -- which is the next turn, not the one after.
    expect(content).toMatch(
      /- DON!! next turn: \d+ \(\d+ in the cost area, \d+ given and returning at their Refresh, \d+ added from the DON!! deck\)\./,
    );
  });

  it("subtracts DON!! an effect holds back from the seat's next Refresh", async () => {
    // OP10-033 Nami, the one card in the pool that makes "cost area plus given"
    // the wrong answer: the held DON!! stays rested through the Refresh instead
    // of coming back with the rest, so a projection that does not subtract it
    // credits the opponent with DON!! they will not have.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("llm-don-held")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("nami", "OP10-033")])
      .withBoard("p1", [
        character("odyssey-1", "OP10-038", { rested: true }),
        character("odyssey-2", "OP10-038", { rested: true }),
      ])
      .withDonDeck("p2", 4)
      .withDon("p2", { rested: 3 })
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP10-033" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    const client = new RecordingClient();
    const agent = new LlmAgent(client);

    await agent.chooseAction(observe(game.state, "p1"));

    // Six active and three rested, less the one held down, and one DON!! left
    // in their deck for the DON!! Phase.
    expect(client.requests[0]!.messages[1]!.content).toContain(
      "- DON!! next turn: 9 (8 in the cost area, 0 given and returning at their Refresh, 1 added from the DON!! deck).",
    );
  });

  it("uses the answer's reasoning when the provider summarises nothing", async () => {
    const observation = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-reasoning-fallback",
    });
    const action = observation.legalActions[0]!;
    const agent = new LlmAgent({
      async complete() {
        return {
          content: JSON.stringify({
            actionIds: [action.actionId],
            reasoning:
              "Taking Life preserves counters for later lethal attacks.",
          }),
        };
      },
    });

    await agent.chooseAction(observation);

    expect(agent.lastReasoning).toBe(
      "Taking Life preserves counters for later lethal attacks.",
    );
    expect(agent.lastReasoningSummary).toBeUndefined();
  });

  it("still reads the reasoning a conversation wrote as a rationale", async () => {
    // The field was `rationale`, beside a separate `turnPlan`, until they were
    // folded into one. A conversation replayed from a trace of that shape still
    // has to yield its reasoning rather than dropping it.
    const service = new GameService();
    const observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-legacy-rationale",
    });
    const action = observation.legalActions[0]!;
    const agent = new LlmAgent({
      async complete() {
        return {
          content: JSON.stringify({
            actionIds: [action.actionId],
            rationale: "Keep the opening hand.",
          }),
        };
      },
    });

    await agent.chooseAction(observation);

    expect(agent.lastReasoning).toBe("Keep the opening hand.");
  });

  it("rejects an invented action after spending one correction round", async () => {
    const service = new GameService();
    const observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-invalid-action",
    });
    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        return {
          content: '{"actionIds":["invented"]}',
          rawExchange: {
            request: { model: "test" },
            response: { output_text: '{"actionIds":["invented"]}' },
          },
        };
      },
    });

    await expect(agent.chooseAction(observation)).rejects.toThrow(
      "LLM_ILLEGAL_ACTION: invented",
    );
    expect(calls).toBe(2);
    expect(agent.history).toHaveLength(3);
  });

  it("names the legal action IDs in the correction request", async () => {
    const service = new GameService();
    const observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-invalid-action",
    });
    const requests: LlmChatRequest[] = [];
    const agent = new LlmAgent({
      async complete(request) {
        requests.push(request);
        return {
          content:
            requests.length === 1
              ? '{"actionIds":["invented"]}'
              : JSON.stringify({
                  actionIds: [observation.legalActions[0]!.actionId],
                }),
        };
      },
    });

    const action = await agent.chooseAction(observation);

    expect(action.actionId).toBe(observation.legalActions[0]!.actionId);
    // The model answers with labels, so those are what it is offered and what
    // the correction names.
    expect(requests[0]?.allowedActionIds).toEqual(
      observation.legalActions.map((_legal, index) => `action-${index + 1}`),
    );
    expect(requests[1]?.messages.at(-1)?.content).toContain("# CORRECTION");
    expect(requests[1]?.messages.at(-1)?.content).toContain("action-1");
  });

  it("accepts a legal action ID punctuated with the wrong separator", async () => {
    const service = new GameService();
    const observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-invalid-action",
    });
    // The failure that ended a benchmark run: `r77-pass-counter` for
    // `r77:pass-counter`. The right decision, punctuated wrong.
    const wanted = observation.legalActions[0]!.actionId;
    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        return {
          content: JSON.stringify({ actionIds: [wanted.replace(":", "-")] }),
        };
      },
    });

    const action = await agent.chooseAction(observation);

    expect(action.actionId).toBe(wanted);
    expect(calls).toBe(1);
  });

  it("returns a forced action without calling the client", async () => {
    let calls = 0;
    const agent = new LlmAgent({
      async complete() {
        calls += 1;
        throw new Error("UNEXPECTED_LLM_CALL");
      },
    });
    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-forced-action",
    });
    observation = {
      ...observation,
      legalActions: [observation.legalActions[0]!],
    };

    const action = await agent.chooseAction(observation);

    expect(action).toBe(observation.legalActions[0]);
    expect(calls).toBe(0);
    expect(agent.lastReasoning).toBeUndefined();
    expect(agent.history).toHaveLength(1);
  });

  it("sends the same two messages however long the game runs", async () => {
    // The whole point of the stateless call: nothing accumulates. A game that
    // used to reach 46 requests with 135 replayed conversation items now
    // reaches 46 requests that each carry a system message and one position.
    const observation = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-stateless-length",
    });
    const client = new RecordingClient();
    const agent = new LlmAgent(client);

    await agent.chooseAction(observation);
    for (let revision = 1; revision <= 45; revision += 1) {
      await agent.chooseAction({
        ...observation,
        revision,
        legalActions: observation.legalActions.map((action) => ({
          ...action,
          actionId: action.actionId.replace(/^r0:/, `r${revision}:`),
        })),
      });
    }

    expect(client.requests).toHaveLength(46);
    for (const request of client.requests) {
      expect(request.messages.map((message) => message.role)).toEqual([
        "system",
        "user",
      ]);
    }
    // The system message is identical every time, which is what makes it the
    // cacheable prefix now that it is the only stable part of the request.
    const systems = new Set(
      client.requests.map((request) => request.messages[0]!.content),
    );
    expect(systems.size).toBe(1);
  });

  it("leaves out card text the system prompt already carries", async () => {
    // Card text is the largest thing in an observation and the match context
    // already holds most of it. Sending it again would pay for it twice, since
    // only the system message is cached.
    const observation = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-card-facts-dedupe",
    });
    const client = new RecordingClient();
    const agent = new LlmAgent(
      client,
      llmMatchContext(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
        "(Green) Roronoa Zoro - Starter Deck 32",
        deckManifests["(Green) Roronoa Zoro - Starter Deck 32"]!,
      ),
    );
    await agent.chooseAction(observation);

    const system = client.requests[0]!.messages[0]!.content;
    const user = client.requests[0]!.messages[1]!.content;
    const section = user.split("# CARD TEXT NOT IN MATCH CONTEXT")[1] ?? "";
    const unlistedNumbers = [...section.matchAll(/^- ([A-Z0-9-]+): \{/gm)].map(
      (match) => match[1]!,
    );
    // Nothing the system prompt describes is described again.
    for (const cardNumber of unlistedNumbers) {
      expect(system).not.toContain(`<card number="${cardNumber}"`);
    }
    // ...and every card in play is described by one of the two, so no card can
    // be named in the state with its text nowhere.
    for (const cardNumber of Object.keys(observation.cardFacts)) {
      const described =
        system.includes(`<card number="${cardNumber}"`) ||
        unlistedNumbers.includes(cardNumber);
      expect(described).toBe(true);
    }
  });

  it("recounts events the way the history modal writes them", async () => {
    // The same `eventText` a person reads in the app, from this seat. Two
    // phrasings of one event log is two things to keep true as events change,
    // and the app's is the one that gets looked at -- so the model gets that
    // one, and no engine instance ID survives into the sentences.
    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-event-prose",
      startingPlayer: "p1",
    });
    const requests: LlmChatRequest[] = [];
    const agent = new LlmAgent({
      async complete(request) {
        requests.push(structuredClone(request));
        const content = request.messages.at(-1)!.content;
        const chosen =
          labelMatching(content, "without more counters") ??
          labelMatching(content, "End turn") ??
          request.allowedActionIds![0]!;
        return {
          content: JSON.stringify({ actionIds: [chosen], reasoning: "n/a" }),
        };
      },
    });
    for (let step = 0; step < 30; step += 1) {
      if (observation.phase === "finished") break;
      const action = await agent.chooseAction(observation);
      observation = service.act(
        observation.gameId,
        observation.revision,
        action.actionId,
      );
    }

    const withEvents = requests
      .map((request) => request.messages[1]!.content)
      .map(
        (content) =>
          (content.split("# RECENT EVENTS")[1] ?? "").split("# SITUATION")[0] ??
          "",
      )
      .filter((events) => events.includes("- "));
    expect(withEvents.length).toBeGreaterThan(0);
    for (const events of withEvents) {
      // Sentences, not flattened records: no `type=value` pairs and no raw
      // engine instance IDs.
      expect(events).not.toMatch(/p[12]-(?:card-\d+|leader)/);
      expect(events).not.toContain("cardInstanceId=");
    }
    // ...and at least one line reads as the app would write it.
    expect(withEvents.join("\n")).toMatch(/- (?:You|Opponent|The opponent's) /);
  });

  it("sends no derived count of the attacks that reach the Leader", async () => {
    // Both figures were removed rather than corrected. They re-decided, outside
    // the engine, which bodies may attack a Leader, and a recorded game was
    // told `attacksReachingLeaderNow: 4` with three such attacks on offer --
    // the fourth body held [Rush: Character] and could not attack a Leader at
    // all. The engine's own list of attacks is the number, and it cannot drift
    // from legality the way a second reading of the board can.
    const service = new GameService();
    const observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-brief-caveat",
      startingPlayer: "p1",
    });
    const requests: LlmChatRequest[] = [];
    const agent = new LlmAgent({
      async complete(request) {
        requests.push(structuredClone(request));
        return {
          content: JSON.stringify({
            actionIds: [request.allowedActionIds![0]!],
            reasoning: "n/a",
          }),
        };
      },
    });
    await agent.chooseAction(observation);

    const content = requests[0]!.messages[1]!.content;
    const situation = (content.split("# SITUATION")[1] ?? "").split("\n#")[0]!;
    expect(situation).not.toContain("attacksReachingLeaderNow");
    expect(situation).not.toContain("lifeDamageReachingLeaderNow");
    // The standing figures stay, in their bare form: they are counts of the
    // position, not a second opinion on what the engine will offer.
    expect(situation).toMatch(/^- ownLife: \d+$/m);
    expect(situation).toMatch(/^- opponentLife: \d+$/m);
    // ...and the instructions send the reader to the action list instead.
    expect(requests[0]!.messages[0]!.content).toContain(
      "it is the AVAILABLE ACTIONS list, which is the engine's own answer and cannot be wrong",
    );
  });

  it("says outright that a Character played this turn cannot attack", async () => {
    // The board printed `played turn 3` under `Turn 3.` and left the reader to
    // join the two. A recorded game shows the join not being made: a defender
    // spent Kaido's once-per-turn DON!! -1 shrinking a Sanji played that very
    // turn, calling it "the opponent's only remaining attacker", on a body that
    // could not swing. `summoningSick` was in the observation the whole time.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("llm-summoning-sick")
      .atTurn(3, { active: "p1" })
      .withHand("p1", [instance("fresh", "ST31-003")])
      .withBoard("p1", [character("veteran", "ST31-003", { playedTurn: 1 })])
      .build();
    game.play({ type: "play-card", cardNumber: "ST31-003" });
    game.play({ type: "attack" });
    game.play({ summary: "Do not block" });

    const client = new RecordingClient();
    const agent = new LlmAgent(client);
    // The defender's seat, mid-battle: the freshly played Character is on the
    // opponent's board, exactly as the recorded game showed it.
    await agent.chooseAction(observe(game.state, "p2"));

    const board = (
      client.requests[0]!.messages[1]!.content.split(
        "## OPPONENT'S BOARD",
      )[1] ?? ""
    ).split("## OPPONENT'S TRASH")[0]!;
    expect(board).toContain(
      "cannot attack this turn: played turn 3 and has no [Rush]",
    );
    // And only there. A body that has been down since turn 1 is an attacker,
    // and a line on every Character would be read on none of them.
    expect(board.split("cannot attack this turn")).toHaveLength(2);
    expect(board).toContain("played turn 1");
  });

  it("names an ability the board holds and cannot use, and the keyword it would switch on", async () => {
    // The turn a recorded game threw away. All seven DON!! went on ST31-004
    // Monkey.D.Luffy, so they sit rested; the body is summoning-sick, the
    // Leader gift is behind `[DON!! x1]` with nothing attached, and Thousand
    // Sunny is active with a rested DON!! for either of them. The prompt showed
    // `keywords: none`, "has no [Rush]" and no sign the Leader had an ability
    // at all, so the Stage DON!! went to the Character, the Leader gift was
    // never activated, and the third given DON!! that switches on ST31-004's
    // [Rush] -- a 9000-power attack into a 7000 Leader on 3 Life -- never
    // happened.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("llm-dormant-leader-gift")
      .atTurn(7, { active: "p1" })
      .withBoard("p1", [character("luffy", "ST31-004", { playedTurn: 7 })])
      .withStage("p1", { instanceId: "sunny", cardNumber: "ST31-005" })
      .withDon("p1", { rested: 7 })
      .build();

    const client = new RecordingClient();
    const agent = new LlmAgent(client);
    await agent.chooseAction(observe(game.state, "p1"));
    const content = client.requests[0]!.messages[1]!.content;

    const leader = (content.split("## YOUR LEADER")[1] ?? "").split("##")[0]!;
    expect(leader).toContain(
      "[Activate: Main] not available right now: needs 1 or more DON!! attached to this card",
    );
    const board = (content.split("## YOUR BOARD")[1] ?? "").split("##")[0]!;
    expect(board).toContain(
      "its own text can switch on [Rush] this turn -- meet that condition and it attacks",
    );
    // The Stage's own activation is available, so it is in the action list and
    // says nothing here -- a line under every ability would be read under none.
    expect(board).not.toContain("[Activate: Main] not available");
  });

  it("says outright that a [Rush: Character] body cannot reach the Leader", async () => {
    // The half-permission, and the one that decided a recorded game. Two
    // EB04-007 Zoros, both 9000 and both active: the one played this turn holds
    // the granted keyword and may attack Characters only. Its board line said
    // `keywords: none` -- `hasKeyword` had no branch for the grant -- and the
    // SITUATION section counted it among the attacks reaching the Leader, so
    // the seat believed it had a Leader swing to spare and spent the one it
    // actually had on a Character.
    const game = scenario()
      .decks(
        "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("llm-rush-character")
      .atTurn(11, { active: "p1" })
      .withHand("p1", [instance("fresh", "EB04-007")])
      .withBoard("p1", [character("veteran", "EB04-007", { playedTurn: 9 })])
      // A printed 8000, which is what turns EB04-007's activation on.
      .withBoard("p2", [character("vista", "OP16-011", { rested: true })])
      .build();
    game.play({ type: "play-card", cardNumber: "EB04-007" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    // The activation grants the keyword and opens no choice of its own.
    game.play({ type: "activate-main", sourceInstanceId: "fresh" });

    const client = new RecordingClient();
    await new LlmAgent(client).chooseAction(observe(game.state, "p1"));
    const content = client.requests[0]!.messages[1]!.content;
    const board = (content.split("## YOUR BOARD")[1] ?? "").split(
      "- stage:",
    )[0]!;

    // The keyword itself, now that the observation reports the grant.
    expect(board).toContain("keywords: Rush: Character");
    expect(board).toContain("can attack Characters ONLY this turn");
    // And the restriction is stated once, about the body it applies to: the
    // same card played two turns ago attacks whatever it likes.
    expect(board.split("can attack Characters ONLY")).toHaveLength(2);

    // The offers are the count the prompt now sends the model to. The freshly
    // played Zoro is labelled `board-2`, and no line pairs it with op-leader.
    const offers = (content.split("# AVAILABLE ACTIONS")[1] ?? "").split("\n");
    const leaderSwings = offers.filter((line) =>
      line.includes("target op-leader"),
    );
    expect(leaderSwings.length).toBeGreaterThan(0);
    for (const swing of leaderSwings) {
      expect(swing).not.toContain("attacker board-2");
    }
    // ...while it is offered against the Character, so it is an attacker, just
    // not one that can take Life.
    expect(
      offers.some(
        (line) =>
          line.includes("attacker board-2") &&
          line.includes("target op-board-1"),
      ),
    ).toBe(true);
  });

  it("recounts two turns of events, not the whole game", async () => {
    // With no conversation to read back through, the event log is the only
    // place the recent past is recounted -- and both obvious bounds are wrong.
    // The whole log is the growth statelessness exists to stop paying for;
    // "since this seat last decided" assumes an earlier message that no longer
    // exists, so a seat that countered mid-turn would resume mid-turn with no
    // account of how the board got there.
    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-event-window",
      startingPlayer: "p1",
    });
    const requests: LlmChatRequest[] = [];
    const agent = new LlmAgent({
      async complete(request) {
        requests.push(structuredClone(request));
        // Declining wherever declining is offered: a Counter step answered with
        // one arbitrary card is a plan the engine rejects outright, and this
        // test is about the event window rather than about play.
        const content = request.messages.at(-1)!.content;
        const chosen =
          labelMatching(content, "without more counters") ??
          labelMatching(content, "End the turn") ??
          request.allowedActionIds![0]!;
        return {
          content: JSON.stringify({ actionIds: [chosen], reasoning: "n/a" }),
        };
      },
    });
    for (let step = 0; step < 120; step += 1) {
      if (observation.phase === "finished") break;
      const action = await agent.chooseAction(observation);
      observation = service.act(
        observation.gameId,
        observation.revision,
        action.actionId,
      );
    }

    const contents = requests.map((request) => request.messages[1]!.content);
    const late = contents.filter((content) => {
      const turn = /^Turn (\d+)\./m.exec(content);
      return turn ? Number(turn[1]) > 4 : false;
    });
    expect(late.length).toBeGreaterThan(0);
    for (const content of late) {
      const events = (content.split("# RECENT EVENTS")[1] ?? "").split(
        "# SITUATION",
      )[0]!;
      expect(events).not.toContain("game-created");
      // Two turn boundaries inside the window, whoever's turn it is: reaching
      // back further during the opponent's turn would send three turns.
      expect(events.split("turn-ended").length - 1).toBeLessThanOrEqual(2);
    }
  });

  it("sends the reasoning effort the phase is configured for", async () => {
    const observation = new GameService().create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "llm-effort",
    });
    const client = new RecordingClient();
    const agent = new LlmAgent(client, undefined, {
      reasoningEffort: { default: "high", byPhase: { mulligan: "low" } },
    });
    const plain = new RecordingClient();

    await agent.chooseAction(observation);
    await new LlmAgent(plain).chooseAction(observation);

    expect(observation.phase).toBe("mulligan");
    expect(client.requests[0]?.reasoningEffort).toBe("low");
    expect(plain.requests[0]).not.toHaveProperty("reasoningEffort");
  });
});

describe("prompt cache breakpoints", () => {
  const respond =
    (bodies: unknown[]) => async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response(
        JSON.stringify({
          id: "response",
          object: "response",
          created_at: 0,
          status: "completed",
          model: "gpt-5.6",
          output: [
            {
              id: "message",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: '{"actionIds":["r0:pass"],"reasoning":"Pass."}',
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
  const markedIndexes = (body: unknown) =>
    (body as { input: { content?: unknown }[] }).input.flatMap((item, index) =>
      Array.isArray(item.content) &&
      item.content.some(
        (block: { prompt_cache_breakpoint?: unknown }) =>
          block.prompt_cache_breakpoint !== undefined,
      )
        ? [index]
        : [],
    );

  it("marks the system message and nothing else", async () => {
    const bodies: unknown[] = [];
    // There is no history to mark any more. A request is the system prompt and
    // one position, so there is exactly one prefix worth writing, and it is in
    // the same place on every call of the game -- which is what makes it
    // readable by all of them. This used to place three markers and strip
    // older ones, because the conversation grew and each call needed the
    // previous call's marker to survive into it.
    await new OpenAiChatClient({
      model: "gpt-5.6",
      apiKey: "test",
      fetch: respond(bodies) as unknown as typeof globalThis.fetch,
    }).complete({
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "turn 4" },
      ],
      promptCacheKey: "stable",
    });

    expect(markedIndexes(bodies[0])).toEqual([0]);
  });

  it("marks nothing on a model without explicit caching", async () => {
    const bodies: unknown[] = [];
    await new OpenAiChatClient({
      model: "gpt-4.1",
      apiKey: "test",
      fetch: respond(bodies) as unknown as typeof globalThis.fetch,
    }).complete({
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "turn 1" },
      ],
    });

    expect(markedIndexes(bodies[0])).toEqual([]);
    expect(
      (bodies[0] as { input: { content: unknown }[] }).input[0]!.content,
    ).toBe("rules");
  });

  it("keeps the response format identical as the legal actions change", async () => {
    // The response format is part of the cached prefix. Listing the legal IDs
    // in it changed the prefix on every decision, so every request rewrote the
    // whole cache and read none of it: measured against the API, a constant
    // schema reads its prefix from the second call on, a per-decision enum
    // never reads at all.
    const bodies: unknown[] = [];
    const fetch = respond(bodies) as unknown as typeof globalThis.fetch;
    const client = new OpenAiChatClient({
      model: "gpt-5.6",
      apiKey: "test",
      fetch,
    });
    await client.complete({
      messages: [{ role: "user", content: "turn 1" }],
      allowedActionIds: ["r0:pass", "r0:attack:a"],
      promptCacheKey: "stable",
    });
    await client.complete({
      messages: [{ role: "user", content: "turn 2" }],
      allowedActionIds: ["r1:play:0:p1-card-3", "r1:pass-counter"],
      promptCacheKey: "stable",
    });

    const format = (body: unknown) => (body as { text: unknown }).text;
    expect(format(bodies[1])).toEqual(format(bodies[0]));
    expect(JSON.stringify(format(bodies[0]))).not.toContain("r0:pass");
    // The shape is still enforced, which is what the enum was there for: the
    // lost run answered `r77-pass-counter`, a hyphen where the ID uses a colon.
    const pattern = new RegExp(
      (
        format(bodies[0]) as {
          format: {
            schema: {
              properties: { actionIds: { items: { pattern: string } } };
            };
          };
        }
      ).format.schema.properties.actionIds.items.pattern,
    );
    // The labels the request offers, and nothing else. The pattern is constant
    // across calls, which is what keeps the schema prefix cacheable -- a
    // per-decision enum of the legal IDs made it change every call.
    expect(pattern.test("action-1")).toBe(true);
    expect(pattern.test("action-12")).toBe(true);
    expect(pattern.test("r77:pass-counter")).toBe(false);
    expect(pattern.test("action-")).toBe(false);
  });

  it("asks for a provider summary only when a run opts into one", async () => {
    const bodies: unknown[] = [];
    const fetch = respond(bodies) as unknown as typeof globalThis.fetch;
    await new OpenAiChatClient({
      model: "gpt-5.6",
      apiKey: "test",
      fetch,
    }).complete({
      messages: [{ role: "user", content: "choose" }],
      reasoningEffort: "low",
    });
    await new OpenAiChatClient({
      model: "gpt-5.6",
      apiKey: "test",
      fetch,
      reasoningSummary: "detailed",
    }).complete({
      messages: [{ role: "user", content: "choose" }],
      reasoningEffort: "low",
    });

    // Effort without a summary sends effort alone -- gpt-5.6 returned an empty
    // summary on most calls even at `detailed`, so paying for one by default
    // bought latency and nothing else.
    expect(bodies[0]).toMatchObject({ reasoning: { effort: "low" } });
    expect((bodies[0] as { reasoning: object }).reasoning).not.toHaveProperty(
      "summary",
    );
    expect(bodies[1]).toMatchObject({
      reasoning: { effort: "low", summary: "detailed" },
    });
  });
});
