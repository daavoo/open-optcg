import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearStoredConfig,
  configFromDraft,
  configPath,
  keyHint,
  mergeSavedKey,
  parseStoredConfig,
  PROVIDERS,
  readStoredConfig,
  resolveLlm,
  validateConfigDraft,
  writeStoredConfig,
} from "../tools/llm-config.js";

async function scratchPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "open-optcg-llm-config-"));
  return join(dir, "llm.json");
}

describe("llm provider catalogue", () => {
  it("gives every provider a label and at least one way to be filled in", () => {
    for (const provider of PROVIDERS) {
      expect(provider.label).not.toBe("");
      // A provider is usable if it either suggests models or takes a custom
      // endpoint whose model ids only its operator can know.
      expect(provider.models.length > 0 || provider.needsBaseUrl).toBe(true);
    }
  });
});

describe("llm config validation", () => {
  const draft = {
    provider: "openai",
    apiKey: "sk-test",
    model: "gpt-5-mini",
  };

  it("accepts a complete draft and normalises it", () => {
    expect(validateConfigDraft(draft)).toBeNull();
    expect(configFromDraft({ ...draft, model: " gpt-5 " })).toEqual({
      version: 1,
      provider: "openai",
      model: "gpt-5",
      apiKey: "sk-test",
    });
  });

  it("refuses an unknown provider, a missing model and a missing key", () => {
    expect(validateConfigDraft({ ...draft, provider: "nope" })).toContain(
      "provider",
    );
    expect(validateConfigDraft({ ...draft, model: "" })).toContain("model");
    expect(validateConfigDraft({ ...draft, apiKey: "" })).toContain("key");
    expect(validateConfigDraft(null)).not.toBeNull();
  });

  it("refuses an endpoint that is not http", () => {
    expect(
      validateConfigDraft({
        ...draft,
        provider: "custom",
        baseUrl: "file:///etc/passwd",
      }),
    ).toContain("http");
  });

  it("needs no key for a provider that runs on this machine", () => {
    expect(
      validateConfigDraft({
        provider: "ollama",
        model: "qwen3:8b",
        apiKey: "",
      }),
    ).toBeNull();
  });
});

describe("llm config storage", () => {
  it("round-trips through a file only its owner can read", async () => {
    const path = await scratchPath();
    expect(await readStoredConfig(path)).toBeNull();
    await writeStoredConfig(path, {
      version: 1,
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "secret-key",
    });
    expect(await readStoredConfig(path)).toEqual({
      version: 1,
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "secret-key",
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await clearStoredConfig(path);
    expect(await readStoredConfig(path)).toBeNull();
    // Clearing a file that is already gone is the normal double-click case.
    await clearStoredConfig(path);
  });

  it("keeps the mode 0600 when overwriting an existing file", async () => {
    const path = await scratchPath();
    const config = {
      version: 1 as const,
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "one",
    };
    await writeStoredConfig(path, config);
    await writeStoredConfig(path, { ...config, apiKey: "two" });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const written = JSON.parse(await readFile(path, "utf8")) as {
      apiKey: string;
    };
    expect(written.apiKey).toBe("two");
  });

  it("treats a corrupt or foreign file as no settings at all", () => {
    expect(parseStoredConfig({ provider: "openai" })).toBeNull();
    expect(parseStoredConfig({ provider: "nope", model: "x" })).toBeNull();
    expect(parseStoredConfig("not an object")).toBeNull();
  });

  it("puts the file where an override says, so a test never touches the real one", () => {
    expect(configPath({ OPEN_OPTCG_CONFIG_DIR: "/tmp/elsewhere" })).toBe(
      "/tmp/elsewhere/llm.json",
    );
    expect(configPath({})).toMatch(/[/\\]\.open-optcg[/\\]llm\.json$/);
  });
});

describe("llm resolution", () => {
  const environment = { model: "gpt-5-mini", apiKey: "env-key" };

  it("falls back to the environment when nothing is saved", () => {
    expect(resolveLlm(null, environment)).toMatchObject({
      model: "gpt-5-mini",
      credential: "env-key",
      provider: null,
      source: "environment",
    });
  });

  it("reports no source at all when neither is configured", () => {
    expect(resolveLlm(null, { model: "gpt-5-mini" }).source).toBeNull();
  });

  it("prefers what the reader saved in the app over the environment", () => {
    const resolved = resolveLlm(
      {
        version: 1,
        provider: "anthropic",
        model: "claude-sonnet-5",
        apiKey: "saved-key",
      },
      environment,
    );
    expect(resolved).toMatchObject({
      model: "claude-sonnet-5",
      credential: "saved-key",
      provider: "anthropic",
      source: "settings",
    });
    expect(resolved.env.LLM_API).toBe("chat");
    expect(resolved.env.LLM_BASE_URL).toContain("api.anthropic.com");
  });

  it("maps each provider onto the environment its transport reads", () => {
    const gemini = resolveLlm(
      {
        version: 1,
        provider: "gemini",
        model: "gemini-2.5-flash",
        apiKey: "g",
      },
      environment,
    );
    expect(gemini.env).toMatchObject({
      LLM_API: "gemini",
      GEMINI_API_KEY: "g",
    });
    const openai = resolveLlm(
      { version: 1, provider: "openai", model: "gpt-5", apiKey: "o" },
      environment,
    );
    expect(openai.env).toEqual({ OPENAI_API_KEY: "o" });
    const custom = resolveLlm(
      {
        version: 1,
        provider: "custom",
        model: "kimi",
        apiKey: "c",
        baseUrl: "https://proxy.example/v1",
      },
      environment,
    );
    expect(custom.env).toMatchObject({
      LLM_API: "chat",
      LLM_BASE_URL: "https://proxy.example/v1",
      OPENAI_API_KEY: "c",
    });
  });

  it("hands a keyless local provider no credential, and still counts as configured", () => {
    const ollama = resolveLlm(
      { version: 1, provider: "ollama", model: "qwen3:8b" },
      environment,
    );
    expect(ollama.credential).toBeUndefined();
    expect(ollama.source).toBe("settings");
    expect(ollama.env.LLM_BASE_URL).toContain("11434");
    // The environment's own key must not leak into a local endpoint.
    expect(ollama.env.OPENAI_API_KEY).toBeUndefined();
  });

  it("never routes a saved provider through a gateway the environment left set", () => {
    const resolved = resolveLlm(
      { version: 1, provider: "openai", model: "gpt-5", apiKey: "o" },
      environment,
    );
    expect(resolved.env.OTARI_AI_TOKEN).toBeUndefined();
    expect(resolved.env.GATEWAY_API_KEY).toBeUndefined();
  });
});

describe("llm key handling", () => {
  it("hints at a key without revealing it", () => {
    expect(keyHint("sk-abcdef1234")).toBe("····1234");
    expect(keyHint("ab")).toBe("····");
    expect(keyHint(undefined)).toBeNull();
  });

  it("keeps the saved key when the page sends only a new model", () => {
    const stored = {
      version: 1 as const,
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "saved",
    };
    expect(
      mergeSavedKey({ provider: "openai", model: "gpt-5" }, stored),
    ).toEqual({ provider: "openai", model: "gpt-5", apiKey: "saved" });
  });

  it("does not carry a key across providers", () => {
    const stored = {
      version: 1 as const,
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "saved",
    };
    expect(
      mergeSavedKey({ provider: "gemini", model: "gemini-2.5-flash" }, stored),
    ).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
  });
});
