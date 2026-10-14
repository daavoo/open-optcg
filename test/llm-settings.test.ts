import { afterEach, describe, expect, it, vi } from "vitest";
import {
  draftFrom,
  editable,
  initialState,
  ready,
  renderPanel,
  renderStatus,
  statusText,
  statusTone,
  unavailableMessage,
  unreachable,
  validateDraft,
  type LlmCapability,
  type LlmProvider,
  type LlmSettingsState,
} from "../packages/web/src/llm-settings.js";

function state(capability: LlmCapability | null): LlmSettingsState {
  return {
    capability,
    draft: null,
    message: "",
    saving: false,
  };
}

const providers: readonly LlmProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    keyLabel: "API key",
    needsBaseUrl: false,
    models: ["gpt-5-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    keyLabel: "API key",
    needsBaseUrl: false,
    models: ["gemini-2.5-flash"],
  },
  {
    id: "ollama",
    label: "Ollama (on this machine)",
    keyLabel: null,
    needsBaseUrl: false,
    models: ["qwen3:8b"],
  },
  {
    id: "custom",
    label: "Other OpenAI-compatible endpoint",
    keyLabel: "API key",
    needsBaseUrl: true,
    models: [],
  },
];

const configured: LlmCapability = {
  available: true,
  configured: true,
  credentialSource: "environment",
  model: "gpt-5-mini",
  rawLogging: false,
  provider: null,
  providers,
  editable: true,
};
const keyless: LlmCapability = {
  ...configured,
  configured: false,
  credentialSource: null,
  model: "gpt-5-mini",
};
const offline: LlmCapability = { ...keyless, available: false, model: "" };
const saved: LlmCapability = {
  ...configured,
  credentialSource: "settings",
  provider: "gemini",
  model: "gemini-2.5-flash",
  keyHint: "····9f2c",
};
/** A build served without a local proxy that can store settings. */
const readOnly: LlmCapability = { ...keyless, editable: false };

describe("llm availability", () => {
  it("is unreachable once the probe reports no local proxy", () => {
    expect(unreachable(state(offline))).toBe(true);
  });

  it("is not yet unreachable while the probe is still outstanding", () => {
    expect(unreachable(state(null))).toBe(false);
  });

  it("is only ready when a key is configured somewhere", () => {
    expect(ready(state(configured))).toBe(true);
    expect(ready(state(saved))).toBe(true);
    expect(ready(state(keyless))).toBe(false);
    expect(ready(state(null))).toBe(false);
  });

  it("is only editable where a local server can store the settings", () => {
    expect(editable(state(keyless))).toBe(true);
    expect(editable(state(readOnly))).toBe(false);
    expect(editable(state(offline))).toBe(false);
  });
});

describe("llm status reporting", () => {
  it("names the model and that it came from the environment", () => {
    expect(statusText(state(configured))).toBe(
      "gpt-5-mini via server environment",
    );
  });

  it("names the provider and a key hint for settings saved from the app", () => {
    expect(statusText(state(saved))).toBe(
      "gemini-2.5-flash via Google Gemini · key ····9f2c",
    );
  });

  it("distinguishes no-proxy, still-probing, and no-key", () => {
    expect(statusText(state(offline))).toBe("Requires the local web server");
    expect(statusText(state(null))).toBe("Checking local proxy...");
    expect(statusText(state(keyless))).toBe(
      "No API key yet — choose a provider",
    );
  });

  it("points a configurable build at the dialog and a read-only one at the environment", () => {
    expect(unavailableMessage(state(keyless))).toContain("Pick a provider");
    expect(unavailableMessage(state(readOnly))).toContain("OPENAI_API_KEY");
  });

  it("points an unreachable build at the local server", () => {
    expect(unavailableMessage(state(offline))).toContain("pnpm web:serve");
  });

  it("treats an outstanding probe as neither ready nor a warning", () => {
    // The blocked mark is a ⚠, and a line that says "checking..." with a
    // warning on it reads as a failure the reader has to do something about.
    expect(statusTone(state(null))).toBe("probing");
    expect(statusTone(state(configured))).toBe("ready");
    expect(statusTone(state(keyless))).toBe("blocked");
    expect(statusTone(state(offline))).toBe("blocked");
    expect(renderStatus(state(null), true)).toContain("probing");
  });

  it("marks the status line ready or blocked, and honours visibility", () => {
    expect(renderStatus(state(configured), true)).toContain("ready");
    expect(renderStatus(state(keyless), true)).toContain("blocked");
    expect(renderStatus(state(configured), false)).toContain("hidden");
  });

  it("carries the settings fields only where the settings can be saved", () => {
    // No second modal to open: the row the host screen already shows and hides
    // with the pilot choice is where the fields live.
    expect(renderStatus(state(keyless), true)).toContain(
      'id="llm-settings-panel"',
    );
    expect(renderStatus(state(readOnly), true)).not.toContain(
      "llm-settings-panel",
    );
    expect(renderStatus(state(offline), true)).not.toContain(
      "llm-settings-panel",
    );
  });
});

describe("llm settings fields", () => {
  it("renders nothing at all where a key cannot be stored", () => {
    expect(renderPanel(state(readOnly))).toBe("");
    expect(renderPanel(state(offline))).toBe("");
  });

  it("is inline markup, not a modal stacked on the host screen's own", () => {
    // The lobby's pilot choice already lives inside the "Configure matchup"
    // dialog, and a nested <form> is markup the browser throws away.
    const html = renderPanel(state(keyless));
    expect(html).not.toContain("backdrop");
    expect(html).not.toContain("aria-modal");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="submit"');
  });

  it("offers every provider the server reported, and no others", () => {
    const html = renderPanel(state(keyless));
    for (const provider of providers) {
      expect(html).toContain(`value="${provider.id}"`);
    }
    expect(html).toContain('id="llm-api-key"');
    expect(html).toContain('id="llm-model"');
  });

  it("never puts the key itself in the page, only its hint", () => {
    const html = renderPanel(state(saved));
    expect(html).toContain("····9f2c");
    expect(html).toContain('type="password"');
    expect(html).toContain('id="llm-api-key" type="password"');
    expect(html).toContain('value=""');
  });

  it("offers to forget a saved key, but not an environment one", () => {
    expect(renderPanel(state(saved))).toContain('id="llm-forget"');
    expect(renderPanel(state(configured))).not.toContain("llm-forget");
  });

  it("hides the fields the selected provider does not need", () => {
    const ollama = renderPanel({
      ...state(keyless),
      draft: draftFrom({ ...keyless, provider: "ollama" }),
    });
    expect(ollama).toMatch(/id="llm-api-key-field"[^>]*/);
    expect(ollama).toContain('hidden id="llm-api-key-field"');
    const custom = renderPanel({
      ...state(keyless),
      draft: draftFrom({ ...keyless, provider: "custom" }),
    });
    expect(custom).toContain('id="llm-base-url-field"');
    expect(custom).not.toContain('hidden id="llm-base-url-field"');
  });

  it("opens on what is configured, suggesting a model when nothing is", () => {
    expect(draftFrom(saved)).toEqual({
      provider: "gemini",
      apiKey: "",
      model: "gemini-2.5-flash",
      baseUrl: "",
    });
    // With the environment in charge there is no saved provider, so the first
    // one is offered with its own first model rather than `LLM_MODEL`.
    expect(draftFrom({ ...keyless, model: "some-proxy-model" })).toEqual({
      provider: "openai",
      apiKey: "",
      model: "gpt-5-mini",
      baseUrl: "",
    });
  });
});

describe("llm settings validation", () => {
  const draft = {
    provider: "openai",
    apiKey: "sk-test",
    model: "gpt-5-mini",
    baseUrl: "",
  };

  it("accepts a complete draft", () => {
    expect(validateDraft(draft, providers, false)).toBeNull();
  });

  it("asks for a key, a model and a provider it knows", () => {
    expect(
      validateDraft({ ...draft, apiKey: " " }, providers, false),
    ).toContain("OpenAI key");
    expect(validateDraft({ ...draft, model: "" }, providers, false)).toContain(
      "model id",
    );
    expect(
      validateDraft({ ...draft, provider: "nope" }, providers, false),
    ).toContain("provider");
  });

  it("treats an empty key field as keeping the one already saved", () => {
    expect(validateDraft({ ...draft, apiKey: "" }, providers, true)).toBeNull();
  });

  it("needs no key for a provider that runs on this machine", () => {
    expect(
      validateDraft(
        { ...draft, provider: "ollama", apiKey: "", model: "qwen3:8b" },
        providers,
        false,
      ),
    ).toBeNull();
  });

  it("needs an endpoint for a custom provider", () => {
    expect(
      validateDraft({ ...draft, provider: "custom" }, providers, false),
    ).toContain("endpoint");
    expect(
      validateDraft(
        { ...draft, provider: "custom", baseUrl: "https://example.com/v1" },
        providers,
        false,
      ),
    ).toBeNull();
  });
});

describe("the capability a build starts with", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers the standalone artifact opened from disk before any probe, so no screen defaults to the LLM", () => {
    // A build with no local server used to start with a pending capability,
    // which reads as "the LLM might work": the lobby opened with the LLM pilot
    // picked and only rejected it on Start match.
    vi.stubGlobal("location", { protocol: "file:" });
    expect(unreachable(initialState())).toBe(true);
  });

  it("leaves a build that could have a local server behind it pending", () => {
    vi.stubGlobal("location", { protocol: "http:" });
    expect(initialState().capability).toBeNull();
  });
});
