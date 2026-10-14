import { describe, expect, it } from "vitest";
import {
  GeminiChatClient,
  toGeminiRequest,
} from "@one-piece-sim/agents/gemini";
import {
  createChatClient,
  environmentApiKey,
} from "@one-piece-sim/agents/chat-client";

const answer = (text: string) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { headers: { "content-type": "application/json" } },
  );
const cache = (name: string) =>
  new Response(JSON.stringify({ name }), {
    headers: { "content-type": "application/json" },
  });
const DECISION = '{"actionIds":["r0:pass"],"reasoning":"Pass."}';

describe("gemini transport", () => {
  it("splits the system prompt out and maps assistant turns to model", () => {
    const { systemInstruction, contents } = toGeminiRequest({
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "state 1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "state 2" },
      ],
    });
    expect(systemInstruction).toEqual({ parts: [{ text: "rules" }] });
    expect(contents).toEqual([
      { role: "user", parts: [{ text: "state 1" }] },
      { role: "model", parts: [{ text: "a1" }] },
      { role: "user", parts: [{ text: "state 2" }] },
    ]);
  });

  it("forwards the decision's reasoning effort as a thinking level", async () => {
    const sent: Record<string, unknown>[] = [];
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      apiKey: "gem-key",
      reasoningSummary: null,
      fetch: (async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(init.body as string) as Record<string, unknown>);
        return answer(DECISION);
      }) as unknown as typeof globalThis.fetch,
    });
    for (const effort of ["none", "low", "medium", "max"] as const) {
      await client.complete({
        messages: [{ role: "user", content: "state" }],
        reasoningEffort: effort,
      });
    }
    expect(
      sent.map(
        (body) =>
          (
            (body["generationConfig"] as Record<string, unknown>)[
              "thinkingConfig"
            ] as Record<string, unknown>
          )["thinkingLevel"],
      ),
      // `none` has no spelling on this model, so it asks for the least the API
      // offers rather than falling back to the default, which is the most.
    ).toEqual(["low", "low", "medium", "high"]);
  });

  it("leaves the model's default when the decision names no effort", async () => {
    let sent: Record<string, unknown> | undefined;
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      apiKey: "gem-key",
      reasoningSummary: null,
      fetch: (async (_url: string, init: RequestInit) => {
        sent = JSON.parse(init.body as string) as Record<string, unknown>;
        return answer(DECISION);
      }) as unknown as typeof globalThis.fetch,
    });
    await client.complete({ messages: [{ role: "user", content: "state" }] });
    // An empty `thinkingConfig` is not the same as an absent one to the API.
    expect(
      (sent!["generationConfig"] as Record<string, unknown>)["thinkingConfig"],
    ).toBeUndefined();
  });

  it("lets a hand-set thinking budget beat the request's level", async () => {
    let sent: Record<string, unknown> | undefined;
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      apiKey: "gem-key",
      reasoningSummary: null,
      thinkingBudget: 512,
      fetch: (async (_url: string, init: RequestInit) => {
        sent = JSON.parse(init.body as string) as Record<string, unknown>;
        return answer(DECISION);
      }) as unknown as typeof globalThis.fetch,
    });
    await client.complete({
      messages: [{ role: "user", content: "state" }],
      reasoningEffort: "max",
    });
    expect(
      (sent!["generationConfig"] as Record<string, unknown>)["thinkingConfig"],
    ).toEqual({ thinkingLevel: "high", thinkingBudget: 512 });
  });

  it("asks for thoughts and keeps them out of the answer", async () => {
    let sent: Record<string, unknown> | undefined;
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      apiKey: "gem-key",
      reasoningSummary: "auto",
      fetch: (async (_url: string, init: RequestInit) => {
        sent = JSON.parse(init.body as string) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: "Nothing develops here.", thought: true },
                    { text: DECISION },
                  ],
                },
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof globalThis.fetch,
    });

    const response = await client.complete({
      messages: [{ role: "user", content: "state 1" }],
    });

    expect(
      (sent?.["generationConfig"] as { thinkingConfig?: unknown })
        .thinkingConfig,
    ).toEqual({ includeThoughts: true });
    // Joining every part would paste the thinking in front of the JSON.
    expect(response.content).toBe(DECISION);
    expect(response.reasoningSummary).toBe("Nothing develops here.");
  });

  it("omits thoughts, and thinkingConfig entirely, unless one is asked for", async () => {
    let sent: Record<string, unknown> | undefined;
    // `null` is the explicit spelling of the default: the answer's own
    // `reasoning` field is what the trace shows, so thoughts are opt-in.
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      apiKey: "gem-key",
      reasoningSummary: null,
      fetch: (async (_url: string, init: RequestInit) => {
        sent = JSON.parse(init.body as string) as Record<string, unknown>;
        return answer(DECISION);
      }) as unknown as typeof globalThis.fetch,
    });

    const response = await client.complete({
      messages: [{ role: "user", content: "state 1" }],
    });

    expect(sent?.["generationConfig"]).not.toHaveProperty("thinkingConfig");
    expect(response.reasoningSummary).toBeUndefined();
  });

  it("leaves the instruction inline unless a named cache is asked for", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      apiKey: "gem-key",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({
          url,
          body: JSON.parse(init.body as string) as Record<string, unknown>,
        });
        return url.endsWith("/cachedContents")
          ? cache("cachedContents/abc")
          : answer(DECISION);
      }) as unknown as typeof globalThis.fetch,
    });

    await client.complete({
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "state 1" },
      ],
    });

    // Naming a cache pins the cached token count to that cache and forfeits
    // implicit caching of the conversation, which is the larger half of a
    // mid-game request. The default has to leave it alone.
    expect(calls.filter((c) => c.url.endsWith("/cachedContents"))).toEqual([]);
    expect(calls[0]?.body.systemInstruction).toEqual({
      parts: [{ text: "rules" }],
    });
    expect(calls[0]?.body).not.toHaveProperty("cachedContent");
    expect(client.cacheName).toBeUndefined();
  });

  it("uploads the system instruction once and references it by name", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      apiKey: "gem-key",
      explicitCache: true,
      fetch: (async (url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        calls.push({ url, body });
        return url.endsWith("/cachedContents")
          ? cache("cachedContents/abc")
          : answer(DECISION);
      }) as unknown as typeof globalThis.fetch,
    });

    const first = await client.complete({
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "state 1" },
      ],
    });
    expect(first.content).toBe(DECISION);
    await client.complete({
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "state 2" },
      ],
    });

    // One cache creation, then every call points at it.
    expect(calls.filter((c) => c.url.endsWith("/cachedContents"))).toHaveLength(
      1,
    );
    expect(calls[0]?.body).toMatchObject({
      model: "models/gemini-3.7-flash",
      systemInstruction: { parts: [{ text: "rules" }] },
      ttl: "1800s",
    });
    const generate = calls.filter((c) => c.url.includes(":generateContent"));
    expect(generate).toHaveLength(2);
    for (const call of generate) {
      expect(call.body.cachedContent).toBe("cachedContents/abc");
      // Sending both is an API error; the cache holds it now.
      expect(call.body).not.toHaveProperty("systemInstruction");
    }
    expect(client.cacheName).toBe("cachedContents/abc");
  });

  it("falls back to an inline system instruction when caching is refused", async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      explicitCache: true,
      fetch: (async (url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        if (url.endsWith("/cachedContents")) {
          return new Response("cached content is too small", { status: 400 });
        }
        bodies.push(body);
        return answer(DECISION);
      }) as unknown as typeof globalThis.fetch,
    });

    await client.complete({
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "state" },
      ],
    });
    await client.complete({
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "state 2" },
      ],
    });

    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.systemInstruction).toEqual({ parts: [{ text: "rules" }] });
      expect(body).not.toHaveProperty("cachedContent");
    }
    expect(client.cacheName).toBeUndefined();
  });

  it("asks for JSON without listing the legal IDs in the schema", async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      explicitCache: false,
      thinkingBudget: 512,
      fetch: (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        return answer(DECISION);
      }) as unknown as typeof globalThis.fetch,
    });
    await client.complete({
      messages: [{ role: "user", content: "state" }],
      allowedActionIds: ["r0:pass", "r0:attack:a"],
    });
    const config = bodies[0]?.generationConfig as Record<string, unknown>;
    expect(config.responseMimeType).toBe("application/json");
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 512 });
    // A per-decision enum would change the request every call, which is what
    // made the OpenAI path uncacheable.
    expect(JSON.stringify(config.responseSchema)).not.toContain("r0:pass");
    // Plan, reasoning, then the actions, the same as every other transport.
    expect(config.responseSchema).toMatchObject({
      required: ["turnPlan", "reasoning", "actionIds"],
    });
    expect(
      Object.keys(
        (config.responseSchema as { properties: Record<string, unknown> })
          .properties,
      ),
    ).toEqual(["turnPlan", "reasoning", "actionIds"]);
  });

  it("surfaces the status and body when the API rejects a call", async () => {
    const client = new GeminiChatClient({
      model: "gemini-3.7-flash",
      explicitCache: false,
      maxRetries: 0,
      fetch: async () => new Response("model not found", { status: 404 }),
    });
    await expect(
      client.complete({ messages: [{ role: "user", content: "state" }] }),
    ).rejects.toThrow(/GEMINI_404: model not found/);
  });

  it("caches explicitly only when LLM_EXPLICIT_CACHE opts in", async () => {
    // The factory decides the flag and the transport acts on it, so the pair is
    // checked through the one seam a built client exposes: `explicitCache` off
    // creates no cache, and the environment has to say `true` to get one.
    const created = async (explicitCache: boolean | undefined) => {
      const urls: string[] = [];
      const client = new GeminiChatClient({
        model: "gemini-3.7-flash",
        ...(explicitCache === undefined ? {} : { explicitCache }),
        fetch: (async (url: string) => {
          urls.push(url);
          return url.endsWith("/cachedContents")
            ? cache("cachedContents/abc")
            : answer(DECISION);
        }) as unknown as typeof globalThis.fetch,
      });
      await client.complete({
        messages: [
          { role: "system", content: "rules" },
          { role: "user", content: "state" },
        ],
      });
      return urls.filter((url) => url.endsWith("/cachedContents")).length;
    };
    expect(await created(undefined)).toBe(0);
    expect(await created(false)).toBe(0);
    expect(await created(true)).toBe(1);

    const geminiEnv = { LLM_API: "gemini", GEMINI_API_KEY: "goog" };
    expect(
      createChatClient({ model: "gemini-3.7-flash", env: geminiEnv }),
    ).toBeInstanceOf(GeminiChatClient);
    expect(
      createChatClient({
        model: "gemini-3.7-flash",
        env: { ...geminiEnv, LLM_EXPLICIT_CACHE: "true" },
      }),
    ).toBeInstanceOf(GeminiChatClient);
  });

  it("is selected by LLM_API=gemini", () => {
    const client = createChatClient({
      model: "gemini-3.7-flash",
      env: { LLM_API: "gemini", OPENAI_API_KEY: "gem-key" },
    });
    expect(client).toBeInstanceOf(GeminiChatClient);
  });

  it("reads GEMINI_API_KEY for the gemini transport", () => {
    expect(
      environmentApiKey({ LLM_API: "gemini", GEMINI_API_KEY: "goog" }),
    ).toBe("goog");
    // A key pasted under the generic name still works, so an existing .env
    // does not break when LLM_API is switched.
    expect(
      environmentApiKey({ LLM_API: "gemini", OPENAI_API_KEY: "generic" }),
    ).toBe("generic");
    expect(
      environmentApiKey({
        LLM_API: "gemini",
        GEMINI_API_KEY: "goog",
        OPENAI_API_KEY: "generic",
      }),
    ).toBe("goog");
    // Every other transport keeps the generic name, including a proxy that
    // fronts Gemini models under its own key.
    expect(
      environmentApiKey({
        LLM_API: "chat",
        GEMINI_API_KEY: "goog",
        OPENAI_API_KEY: "generic",
      }),
    ).toBe("generic");
    expect(environmentApiKey({ OPENAI_API_KEY: "generic" })).toBe("generic");
  });

  it("hands the Gemini key to the client it builds", async () => {
    const headers: Record<string, string>[] = [];
    const client = createChatClient({
      model: "gemini-3.7-flash",
      env: {
        LLM_API: "gemini",
        GEMINI_API_KEY: "goog",
      },
    }) as GeminiChatClient;
    // Reach the transport by swapping in a fetch through a fresh instance with
    // the same resolution rule.
    const probe = new GeminiChatClient({
      model: "gemini-3.7-flash",
      apiKey: environmentApiKey({ LLM_API: "gemini", GEMINI_API_KEY: "goog" })!,
      explicitCache: false,
      fetch: (async (_url: string, init: RequestInit) => {
        headers.push(init.headers as Record<string, string>);
        return answer(DECISION);
      }) as unknown as typeof globalThis.fetch,
    });
    await probe.complete({ messages: [{ role: "user", content: "state" }] });
    expect(headers[0]?.["x-goog-api-key"]).toBe("goog");
    expect(client).toBeInstanceOf(GeminiChatClient);
  });
});
