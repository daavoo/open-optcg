import { describe, expect, it } from "vitest";
import { OtariChatClient } from "@one-piece-sim/agents/otari";
import { createChatClient } from "@one-piece-sim/agents/chat-client";
import { OpenAiChatClient } from "@one-piece-sim/agents/llm";

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function responsePayload(text: string): string {
  return JSON.stringify({
    id: "resp-1",
    object: "response",
    created_at: 0,
    status: "completed",
    model: "openai:gpt-5.6",
    output: [
      {
        id: "rs",
        type: "reasoning",
        summary: [{ type: "summary_text", text: "Counter is cheaper." }],
      },
      {
        id: "m",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    output_text: text,
  });
}

/** A gateway stub that records what was sent and replies with a fixed decision. */
function stubGateway(reply: (attempt: number) => Response): {
  captured: CapturedRequest[];
  fetch: typeof globalThis.fetch;
} {
  const captured: CapturedRequest[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const body = init?.body;
    if (typeof body !== "string") throw new Error("EXPECTED_STRING_BODY");
    captured.push({
      url: input instanceof Request ? input.url : String(input),
      headers: { ...(init?.headers as Record<string, string>) },
      body: JSON.parse(body) as Record<string, unknown>,
    });
    return reply(captured.length);
  };
  return { captured, fetch };
}

const decision = '{"actionIds":["r0:pass"],"reasoning":"Nothing else helps."}';

const okReply = () =>
  new Response(responsePayload(decision), {
    headers: { "content-type": "application/json" },
  });

describe("otari gateway chat client", () => {
  it("sends the Responses contract the engine depends on", async () => {
    const { captured, fetch } = stubGateway(okReply);

    const response = await new OtariChatClient({
      model: "openai:gpt-5.6",
      platformToken: "tk_test",
      sessionLabel: "open-optcg:test",
      fetch,
    }).complete({
      messages: [
        { role: "system", content: "You choose actions." },
        { role: "user", content: '{"request":"choose_action"}' },
      ],
      promptCacheKey: "open-optcg:decision:v1:abc",
      allowedActionIds: ["r0:pass", "r0:attack"],
    });

    expect(captured).toHaveLength(1);
    const sent = captured[0]!;
    expect(sent.url).toBe("https://api.otari.ai/v1/responses");
    expect(sent.headers.Authorization).toBe("Bearer tk_test");

    // The strict schema is what keeps a malformed action ID from coming back,
    // so it has to survive the gateway hop rather than silently degrade to
    // text. It constrains the *shape* rather than listing the legal IDs: the
    // response format is part of the cached prefix, so a per-decision enum
    // made every request uncacheable.
    expect(sent.body.text).toMatchObject({
      format: {
        type: "json_schema",
        name: "legal_action",
        strict: true,
        schema: {
          properties: {
            actionIds: { items: { pattern: "^action-[0-9]+$" } },
          },
          // Plan, reasoning, then the actions: the gateway sends the same
          // body as the direct transport, so a decision made through it is
          // explicable in the same way.
          required: ["turnPlan", "reasoning", "actionIds"],
        },
      },
    });
    expect(
      Object.keys(
        (
          sent.body.text as {
            format: { schema: { properties: Record<string, unknown> } };
          }
        ).format.schema.properties,
      ),
    ).toEqual(["turnPlan", "reasoning", "actionIds"]);
    expect(
      JSON.stringify(sent.body.text),
      "the legal IDs must not reach the schema",
    ).not.toContain("enum");
    expect(sent.body.store).toBe(false);
    expect(sent.body).not.toHaveProperty("reasoning");
    expect(sent.body.prompt_cache_key).toBe("open-optcg:decision:v1:abc");
    expect(sent.body.session_label).toBe("open-optcg:test");

    // `gpt-5.6` opts into explicit caching, and the provider prefix must not
    // hide that: the model string the gateway takes is `openai:gpt-5.6`.
    expect(sent.body.prompt_cache_options).toMatchObject({ mode: "explicit" });
    // Compaction is not requested: the input no longer grows, so there is
    // nothing for the provider to compact.
    expect(sent.body).not.toHaveProperty("context_management");
    const input = sent.body.input as { content?: unknown }[];
    expect(input[0]?.content).toMatchObject([
      { prompt_cache_breakpoint: { mode: "explicit" } },
    ]);

    expect(response.content).toBe(decision);
    expect(response.reasoningSummary).toBe("Counter is cheaper.");
  });

  it("does not send the duplicate camelCase keys the SDK adds", async () => {
    const { captured, fetch } = stubGateway(okReply);

    await new OtariChatClient({
      model: "openai:gpt-5.6",
      platformToken: "tk_test",
      fetch,
    }).complete({
      messages: [{ role: "user", content: "Choose" }],
      promptCacheKey: "open-optcg:decision:v1:abc",
    });

    // The gateway validates with `extra="forbid"`, so one stray alias fails the
    // whole request: "1 validation error for ResponsesParams / promptCacheKey /
    // Extra inputs are not permitted". Verified against a local gateway, where
    // every request 502'd until these were stripped.
    const keys = Object.keys(captured[0]!.body);
    expect(keys).toContain("prompt_cache_key");
    expect(keys).not.toContain("promptCacheKey");
    expect(keys.filter((key) => /[A-Z]/.test(key))).toEqual([]);
  });

  it("retries a gateway 502 and fails a 401 immediately", async () => {
    const upstream = stubGateway((attempt) =>
      attempt === 1
        ? new Response(JSON.stringify({ error: { message: "upstream" } }), {
            status: 502,
            headers: { "content-type": "application/json" },
          })
        : okReply(),
    );
    const recovered = await new OtariChatClient({
      model: "openai:gpt-5.6",
      platformToken: "tk_test",
      maxRetries: 2,
      fetch: upstream.fetch,
    }).complete({ messages: [{ role: "user", content: "Choose" }] });
    expect(upstream.captured).toHaveLength(2);
    expect(recovered.content).toBe(decision);

    const denied = stubGateway(
      () =>
        new Response(JSON.stringify({ error: { message: "bad token" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );
    // The gateway SDK reports every failure as the literal "[object Object]", so
    // the class, the status, and the gateway's own words all have to be recovered
    // here -- a benchmark that dies overnight is diagnosed from this string.
    await expect(
      new OtariChatClient({
        model: "openai:gpt-5.6",
        platformToken: "tk_bad",
        maxRetries: 2,
        fetch: denied.fetch,
      }).complete({ messages: [{ role: "user", content: "Choose" }] }),
    ).rejects.toThrow(
      "OTARI_GATEWAY_ERROR: AuthenticationError 401: bad token",
    );
    expect(denied.captured).toHaveLength(1);
  });

  it("reports a context-length failure distinguishably from a bad token", async () => {
    const { fetch } = stubGateway(
      () =>
        new Response(
          JSON.stringify({
            error: { message: "input exceeds the context window" },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      new OtariChatClient({
        model: "openai:gpt-5.6",
        platformToken: "tk_test",
        maxRetries: 0,
        fetch,
      }).complete({ messages: [{ role: "user", content: "Choose" }] }),
    ).rejects.toThrow(/input exceeds the context window/);
  });

  it("honours an abort signal the gateway SDK cannot take", async () => {
    const controller = new AbortController();
    const client = new OtariChatClient({
      model: "openai:gpt-5.6",
      platformToken: "tk_test",
      maxRetries: 0,
      fetch: async () => {
        controller.abort(new Error("turn timeout"));
        return new Promise<Response>(() => {});
      },
    });
    await expect(
      client.complete({
        messages: [{ role: "user", content: "Choose" }],
        signal: controller.signal,
      }),
    ).rejects.toThrow("LLM_ABORTED");
  });
});

describe("chat client selection", () => {
  it("routes to the gateway on LLM_PROVIDER or gateway-only credentials", () => {
    expect(
      createChatClient({
        model: "openai:gpt-5.6",
        env: { LLM_PROVIDER: "otari", OTARI_AI_TOKEN: "tk_test" },
      }),
    ).toBeInstanceOf(OtariChatClient);
    expect(
      createChatClient({
        model: "openai:gpt-5.6",
        env: { OTARI_AI_TOKEN: "tk_test" },
      }),
    ).toBeInstanceOf(OtariChatClient);
    // A pasted `tk_` lobby key selects the gateway without any env at all.
    expect(
      createChatClient({
        model: "openai:gpt-5.6",
        credential: "tk_test",
        env: {},
      }),
    ).toBeInstanceOf(OtariChatClient);
  });

  it("keeps the direct provider path as the default", () => {
    expect(
      createChatClient({
        model: "gpt-5.6",
        env: { OPENAI_API_KEY: "sk-test" },
      }),
    ).toBeInstanceOf(OpenAiChatClient);
    // An explicit provider key wins over a gateway token left in the shell.
    expect(
      createChatClient({
        model: "gpt-5.6",
        env: { OPENAI_API_KEY: "sk-test", OTARI_AI_TOKEN: "tk_test" },
      }),
    ).toBeInstanceOf(OpenAiChatClient);
  });
});
