import { describe, expect, it } from "vitest";
import {
  ChatCompletionsChatClient,
  chatCompletionsBody,
} from "@one-piece-sim/agents/chat-completions";
import { createChatClient } from "@one-piece-sim/agents/chat-client";

const ok = (content: string) =>
  new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
    { headers: { "content-type": "application/json" } },
  );

describe("chat completions transport", () => {
  it("sends the strict schema and the reasoning effort", () => {
    const body = chatCompletionsBody(
      "deepseek-v4-flash",
      {},
      {
        messages: [
          { role: "system", content: "rules" },
          { role: "user", content: "state 2" },
        ],
        reasoningEffort: "low",
        allowedActionIds: ["r0:pass"],
      },
    ) as {
      messages: unknown;
      reasoning_effort?: unknown;
      response_format: {
        json_schema: {
          strict: boolean;
          schema: {
            properties: { actionIds: { items: { pattern: string } } };
            required: string[];
          };
        };
      };
    };

    expect(body.messages).toEqual([
      { role: "system", content: "rules" },
      { role: "user", content: "state 2" },
    ]);
    expect(body.reasoning_effort).toBe("low");
    expect(body.response_format.json_schema.strict).toBe(true);
    // Plan, reasoning, then the actions: an endpoint that returns no
    // `reasoning_content` of its own still produces an explicable decision,
    // and the order is the order the decision is made in.
    expect(body.response_format.json_schema.schema.required).toEqual([
      "turnPlan",
      "reasoning",
      "actionIds",
    ]);
    expect(
      Object.keys(body.response_format.json_schema.schema.properties),
    ).toEqual(["turnPlan", "reasoning", "actionIds"]);
    expect(
      body.response_format.json_schema.schema.properties.actionIds.items
        .pattern,
    ).toBe("^action-[0-9]+$");
    // Responses-only fields must not leak onto this contract.
    expect(body).not.toHaveProperty("prompt_cache_key");
    expect(body).not.toHaveProperty("context_management");
    expect(body).not.toHaveProperty("input");
    // The legal IDs stay out of the schema, so the prefix is identical between
    // decisions and a caching proxy can reuse it.
    expect(JSON.stringify(body.response_format)).not.toContain("r0:pass");
  });

  it("posts to the endpoint's chat/completions path with a bearer token", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = new ChatCompletionsChatClient({
      model: "deepseek-v4-flash",
      baseURL: "https://opencode.ai/zen/go/v1/",
      apiKey: "zen-key",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return ok('{"actionIds":["r0:pass"],"reasoning":"Pass."}');
      }) as unknown as typeof globalThis.fetch,
    });

    const response = await client.complete({
      messages: [{ role: "user", content: "state" }],
    });

    expect(calls[0]?.url).toBe(
      "https://opencode.ai/zen/go/v1/chat/completions",
    );
    expect(
      (calls[0]?.init.headers as Record<string, string>).authorization,
    ).toBe("Bearer zen-key");
    expect(response.content).toContain("r0:pass");
  });

  it("reports the status and body when the endpoint rejects the request", async () => {
    const client = new ChatCompletionsChatClient({
      model: "deepseek-v4-flash",
      baseURL: "https://opencode.ai/zen/go/v1",
      maxRetries: 0,
      fetch: async () => new Response("model not found", { status: 404 }),
    });
    await expect(
      client.complete({ messages: [{ role: "user", content: "state" }] }),
    ).rejects.toThrow(/CHAT_COMPLETIONS_404: model not found/);
  });

  it("is selected by LLM_API=chat", () => {
    const client = createChatClient({
      model: "deepseek-v4-flash",
      env: {
        LLM_API: "chat",
        LLM_BASE_URL: "https://opencode.ai/zen/go/v1",
        OPENAI_API_KEY: "zen-key",
      },
    });
    expect(client).toBeInstanceOf(ChatCompletionsChatClient);
  });

  it("omits the schema when the endpoint cannot honour it", () => {
    const body = chatCompletionsBody(
      "some-model",
      { structuredOutputs: "off" },
      { messages: [{ role: "user", content: "state" }] },
    );
    expect(body).not.toHaveProperty("response_format");
  });

  it("steps down to JSON mode when the endpoint refuses the schema", async () => {
    // The failure OpenCode Zen returns for DeepSeek: a 400 naming the format.
    const sent: Record<string, unknown>[] = [];
    const client = new ChatCompletionsChatClient({
      model: "deepseek-v4-flash",
      baseURL: "https://opencode.ai/zen/go/v1",
      fetch: (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        sent.push(body);
        const format = (body.response_format as { type?: string } | undefined)
          ?.type;
        if (format === "json_schema") {
          return new Response(
            JSON.stringify({
              error: {
                type: "invalid_request_error",
                message: "This response_format type is unavailable now",
              },
            }),
            { status: 400 },
          );
        }
        return ok('{"actionIds":["r0:pass"],"reasoning":"Pass."}');
      }) as unknown as typeof globalThis.fetch,
    });

    const first = await client.complete({
      messages: [{ role: "user", content: "state" }],
    });
    expect(first.content).toContain("r0:pass");
    expect(
      sent.map(
        (body) => (body.response_format as { type?: string } | undefined)?.type,
      ),
    ).toEqual(["json_schema", "json_object"]);
    expect(client.structuredOutputMode).toBe("json_object");

    // The discovery is paid once: the next call starts where it left off.
    await client.complete({ messages: [{ role: "user", content: "again" }] });
    expect(sent).toHaveLength(3);
    expect((sent[2]?.response_format as { type?: string }).type).toBe(
      "json_object",
    );
  });

  it("says json in the prompt when JSON mode needs the word", () => {
    // DeepSeek: "Prompt must contain the word 'json' in some form to use
    // 'response_format' of type 'json_object'."
    const body = chatCompletionsBody(
      "deepseek-v4-flash",
      { structuredOutputs: "json_object" },
      { messages: [{ role: "user", content: "Choose an action." }] },
    ) as { messages: { content: string }[] };
    expect(body.messages.at(-1)?.content).toMatch(/json/i);

    // A prompt that already says it is left alone.
    const untouched = chatCompletionsBody(
      "deepseek-v4-flash",
      { structuredOutputs: "json_object" },
      { messages: [{ role: "user", content: "Respond with JSON only." }] },
    ) as { messages: { content: string }[] };
    expect(untouched.messages.at(-1)?.content).toBe("Respond with JSON only.");
  });

  it("keeps JSON mode when the 400 is about the prompt, not the format", async () => {
    let calls = 0;
    const client = new ChatCompletionsChatClient({
      model: "deepseek-v4-flash",
      baseURL: "https://opencode.ai/zen/go/v1",
      structuredOutputs: "json_object",
      maxRetries: 0,
      fetch: async () => {
        calls += 1;
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'.",
            },
          }),
          { status: 400 },
        );
      },
    });
    await expect(
      client.complete({ messages: [{ role: "user", content: "state" }] }),
    ).rejects.toThrow(/must contain the word/);
    expect(calls).toBe(1);
    expect(client.structuredOutputMode).toBe("json_object");
  });

  it("does not step down for a 400 that is not about the format", async () => {
    const client = new ChatCompletionsChatClient({
      model: "deepseek-v4-flash",
      baseURL: "https://opencode.ai/zen/go/v1",
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: "unknown model" } }), {
          status: 400,
        }),
    });
    await expect(
      client.complete({ messages: [{ role: "user", content: "state" }] }),
    ).rejects.toThrow(/unknown model/);
    expect(client.structuredOutputMode).toBe("json_schema");
  });
});
