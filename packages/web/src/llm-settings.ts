import type { PlayerId } from "@one-piece-sim/protocol";
import { escapeHtml } from "./card-text.js";

/** One provider the local server offers, as it describes itself. The page has
    no catalogue of its own: adding a provider is a server-side change. */
export interface LlmProvider {
  id: string;
  label: string;
  /** What to call the key field, or null when this provider needs no key. */
  keyLabel: string | null;
  needsBaseUrl: boolean;
  models: readonly string[];
  keyUrl?: string;
}

export interface LlmCapability {
  available: boolean;
  configured: boolean;
  credentialSource: "environment" | "settings" | null;
  model: string;
  rawLogging: boolean;
  /** The saved provider id, or null while the environment is in charge. */
  provider?: string | null;
  baseUrl?: string | null;
  /** The last four characters of the saved key -- never the key. */
  keyHint?: string | null;
  /** Whether clearing the saved settings would leave a working setup behind. */
  environmentConfigured?: boolean;
  environmentModel?: string;
  providers?: readonly LlmProvider[];
  /** False for a build with no local server to save settings to. */
  editable?: boolean;
}

export interface LlmDebugRecord {
  timestamp: string;
  turn: number;
  player: PlayerId;
  actionId?: string;
  error?: string;
  reasoning?: string;
  rawExchange?: { request: unknown; response: unknown };
  payloadSource?: "exact" | "normalized";
  /**
   * The 1-based index of the action this call was deciding: the key the match
   * history joins a call onto the step it produced. A failed call carries the
   * index it was asked about, so it is read next to the move that was made
   * instead. Absent only on a trace exported before the two were shown
   * together.
   */
  actionCount?: number;
}

/** What the reader is typing into the settings fields. */
export interface LlmConfigDraft {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

/**
 * Whether an LLM opponent can run, what to say when it can't, and the fields
 * that fix it.
 *
 * Shared rather than screen-owned: the constructed lobby and the sealed
 * builder both offer an "LLM" opponent controller and both report its status,
 * so neither can own this.
 *
 * The fields sit inline beside the opponent controller rather than in a dialog
 * of their own: in the lobby that controller already lives inside the
 * "Configure matchup" dialog, and a second modal stacked on the first is a
 * layer the reader has to dismiss twice to get back to what they were doing.
 *
 * The key is set from the page but never kept there. It is POSTed once to the
 * loopback server, which stores it in a 0600 file under the reader's home
 * directory and hands back only its last four characters; nothing is written to
 * `localStorage`, and a build with no local server (the standalone artifact,
 * the hosted page) renders no fields at all. Setting it here spares a reader
 * of `pnpm web:serve` exporting a variable before every run.
 */
export interface LlmSettingsState {
  /** null until the capability probe answers; a build served from `file:`
      starts out already known-unavailable. */
  capability: LlmCapability | null;
  /** null until the fields are first rendered, when it is seeded from the
      capability. */
  draft: LlmConfigDraft | null;
  /** What went wrong with the last save, or what went right. */
  message: string;
  saving: boolean;
}

/** How the panel is hosted: what the surrounding screen already provides. */
export interface LlmPanelOptions {
  /** The host commits the fields itself, so the panel needs no Save button. */
  hostSaves?: boolean;
}

export interface LlmSettingsContext {
  /**
   * Called after the capability answer changes. The host screen re-syncs
   * whatever else depends on it -- the lobby narrows its opponent deck
   * select to dossier decks; the sealed builder has nothing to re-sync.
   */
  onCapabilityChanged(): void;
}

/** Where a build that can't run an LLM opponent itself points people instead. */
export const LLM_DOCS_URL =
  "https://github.com/daavoo/open-optcg/blob/main/docs/llm-opponents.md";

/**
 * Whether this build is known, before any probe, to have no local server
 * behind it: the standalone artifact opened from disk.
 *
 * Answered here rather than left to the probe because the answer decides a
 * default the reader sees immediately. A pending probe reads as "the LLM might
 * work", which is how the (since retired) hosted lobby came to open with the
 * LLM pilot picked and reject it only on Start match -- an error for something
 * the build knew it could not do before it rendered.
 */
function noLocalServer(): boolean {
  return location.protocol === "file:";
}

export function initialState(): LlmSettingsState {
  return {
    capability: noLocalServer()
      ? {
          available: false,
          configured: false,
          credentialSource: null,
          model: "",
          rawLogging: false,
        }
      : null,
    draft: null,
    message: "",
    saving: false,
  };
}

/** True when this build cannot reach the local proxy an LLM opponent needs at
    all: opened as a file (`file:`), served by a static host, or otherwise
    without its capability check ever succeeding. */
export function unreachable(state: LlmSettingsState): boolean {
  return state.capability?.available === false;
}

/** Whether a match can actually start against an LLM right now: the proxy is
    reachable *and* a key is configured, from the page or the environment. */
export function ready(state: LlmSettingsState): boolean {
  return state.capability?.configured === true;
}

/** Whether this build can offer the settings fields. */
export function editable(state: LlmSettingsState): boolean {
  return !unreachable(state) && state.capability?.editable === true;
}

/** Selecting "LLM" when it cannot run opens the setup docs instead of
    starting a match with it. Returns whether it did, so callers can skip
    the rest of their normal controller-change handling. */
export function redirectToDocsIfUnreachable(
  state: LlmSettingsState,
  selectId: string,
  fallback = "rules",
): boolean {
  const select = document.querySelector<HTMLSelectElement>(`#${selectId}`);
  if (!select || select.value !== "llm" || !unreachable(state)) return false;
  select.value = fallback;
  window.open(LLM_DOCS_URL, "_blank", "noopener");
  return true;
}

function providerLabel(capability: LlmCapability): string {
  const provider = capability.providers?.find(
    (candidate) => candidate.id === capability.provider,
  );
  return provider?.label ?? capability.provider ?? "";
}

export function statusText(state: LlmSettingsState): string {
  const capability = state.capability;
  if (capability?.available === false) return "Requires the local web server";
  if (!capability) return "Checking local proxy...";
  if (!capability.configured) return "No API key yet — choose a provider";
  if (capability.credentialSource === "settings") {
    const label = providerLabel(capability);
    const hint = capability.keyHint ? ` · key ${capability.keyHint}` : "";
    return `${capability.model} via ${label || "saved settings"}${hint}`;
  }
  return `${capability.model} via server environment`;
}

/**
 * Which of the three states the status line is in.
 *
 * "probing" is its own tone rather than blocked, because an outstanding probe
 * is not a problem: the warning mark on a line that says "checking..." reads as
 * a failure the reader has to act on, and it is gone in a few milliseconds.
 */
export function statusTone(
  state: LlmSettingsState,
): "ready" | "blocked" | "probing" {
  if (!state.capability) return "probing";
  return unreachable(state) || !ready(state) ? "blocked" : "ready";
}

/** Why a match can't start against an LLM, phrased as what to do about it.
    Both lobbies show this in the same alert. */
export function unavailableMessage(state: LlmSettingsState): string {
  if (state.capability?.available === false) {
    return "The LLM opponent needs the local web server. Start it with pnpm web:serve.";
  }
  return state.capability?.editable === true
    ? "The LLM opponent needs an API key. Pick a provider beside the opponent controller and paste one."
    : "The LLM opponent needs an API key in the server environment. Restart with OPENAI_API_KEY set — see docs/llm-opponents.md.";
}

/**
 * The status line and, where a local server can save them, the fields that
 * change what it reports. Rendered as one block so a host screen can show and
 * hide the whole thing together -- both hosts do, on whether the LLM is the
 * chosen pilot.
 *
 * The line speaks only when something needs attention. A working setup used to
 * announce itself -- "gpt-5-mini via server environment" -- above three fields
 * already showing the provider, the key and that model; the reader was told
 * twice and the second telling was the one that could not be edited. Its text
 * is still written, and still read by a screen reader on the states that
 * matter, but a ready line is hidden.
 */
export function renderStatus(
  state: LlmSettingsState,
  visible: boolean,
  options: LlmPanelOptions = {},
): string {
  const tone = statusTone(state);
  return `<div class="llm-settings-row" id="llm-settings-row" ${visible ? "" : "hidden"}><p class="llm-status-line ${tone}" id="llm-status" ${tone === "ready" ? "hidden" : ""}>${escapeHtml(statusText(state))}</p>${renderPanel(state, options)}</div>`;
}

/**
 * The provider/key/model fields, inline under the status line.
 *
 * Not a `<form>`, and every button `type="button"`: both hosts put this inside
 * markup of their own -- the lobby's matchup dialog, the sealed builder's tool
 * rail -- and a nested form is markup the browser throws away. Enter in a field
 * saves, which is what the form element was providing.
 *
 * Returns nothing where a key cannot be stored, so a read-only build shows its
 * status line alone.
 *
 * With `hostSaves`, the panel draws no Save of its own: the host's own confirm
 * button commits the fields on the way out (the lobby's "Done"), and two
 * buttons a centimetre apart, one of which saved and one of which saved *and*
 * closed, was a choice with no meaning. The sealed builder has no such button,
 * so there the panel keeps its own.
 */
export function renderPanel(
  state: LlmSettingsState,
  options: LlmPanelOptions = {},
): string {
  if (!editable(state)) return "";
  const hostSaves = options.hostSaves === true;
  const capability = state.capability!;
  const providers = capability.providers ?? [];
  const draft = state.draft ?? draftFrom(capability);
  const selected =
    providers.find((provider) => provider.id === draft.provider) ??
    providers[0];
  const keyless = selected?.keyLabel === null;
  const models = selected?.models ?? [];
  return `<div class="llm-panel" id="llm-settings-panel">
      <p class="llm-panel-lede">The key is stored on this computer only, and the app talks to the provider for you.</p>
      <label>Provider
        <select id="llm-provider">
          ${providers.map((provider) => `<option value="${escapeHtml(provider.id)}" ${provider.id === draft.provider ? "selected" : ""}>${escapeHtml(provider.label)}</option>`).join("")}
        </select>
      </label>
      ${selected?.keyUrl && !keyless ? `<p class="llm-panel-hint"><button class="text-button" type="button" id="llm-key-help" data-key-url="${escapeHtml(selected.keyUrl)}">Where to get a key for ${escapeHtml(selected.label)}</button></p>` : ""}
      <label ${keyless ? "hidden" : ""} id="llm-api-key-field">${escapeHtml(selected?.keyLabel ?? "API key")}
        <input id="llm-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="${capability.keyHint ? `saved (${escapeHtml(capability.keyHint)}) — type to replace` : "sk-…"}" value="" />
      </label>
      <label ${selected?.needsBaseUrl ? "" : "hidden"} id="llm-base-url-field">Endpoint URL
        <input id="llm-base-url" type="url" spellcheck="false" placeholder="https://example.com/v1" value="${escapeHtml(draft.baseUrl)}" />
      </label>
      <label>Model
        <input id="llm-model" list="llm-model-options" spellcheck="false" value="${escapeHtml(draft.model)}" />
      </label>
      <datalist id="llm-model-options">${models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("")}</datalist>
      <p class="llm-panel-message" id="llm-settings-message" ${state.message ? "" : "hidden"}>${escapeHtml(state.message)}</p>
      <div class="llm-panel-actions">
        ${hostSaves ? "" : `<button class="secondary" type="button" id="llm-save">Save</button>`}
        ${capability.credentialSource === "settings" ? `<button class="text-button" type="button" id="llm-forget">Forget key</button>` : ""}
      </div>
    </div>`;
}

/** What the fields open with: whatever is configured now. */
export function draftFrom(capability: LlmCapability): LlmConfigDraft {
  const providers = capability.providers ?? [];
  const provider = capability.provider ?? providers[0]?.id ?? "openai";
  // Whatever is configured, wherever it came from: a model set in the server's
  // environment is as much the model in force as one saved from this panel,
  // and the field is now the only place the reader can read it. Only an
  // unconfigured build falls back to suggesting the provider's first model,
  // which is a suggestion to type over rather than a fact.
  const model = capability.configured
    ? capability.model
    : (providers.find((candidate) => candidate.id === provider)?.models[0] ??
      capability.model);
  return {
    provider,
    apiKey: "",
    model,
    baseUrl: capability.baseUrl ?? "",
  };
}

/**
 * Whether the draft can be saved as it stands, or what to tell the reader.
 *
 * The server validates the same things -- it is the one that has to be right --
 * but answering in the page keeps an obvious mistake from costing a round trip
 * and lets the message land next to the field.
 */
export function validateDraft(
  draft: LlmConfigDraft,
  providers: readonly LlmProvider[],
  hasSavedKey: boolean,
): string | null {
  const provider = providers.find(
    (candidate) => candidate.id === draft.provider,
  );
  if (!provider) return "Pick a provider.";
  if (!draft.model.trim()) return "Enter a model id.";
  // An empty key field means "keep the one already saved", which is only an
  // answer when the same provider already has one.
  if (provider.keyLabel && !draft.apiKey.trim() && !hasSavedKey) {
    return `Enter your ${provider.label} key.`;
  }
  if (provider.needsBaseUrl && !draft.baseUrl.trim()) {
    return "Enter the endpoint URL.";
  }
  return null;
}

/**
 * What the LLM choice says when this build cannot reach a proxy at all.
 *
 * Here rather than in the lobby because it is written twice from two places --
 * once when the screen renders and again whenever the capability probe
 * resolves -- and the two must not drift.
 */
export const LLM_UNREACHABLE_HINT = "Not available here — opens the setup docs";

/**
 * Bring the page in line with a capability that just changed: the status line,
 * the pilot choice's note, and the fields under it.
 */
export function syncStatus(
  state: LlmSettingsState,
  ctx: LlmSettingsContext,
): void {
  const status = document.querySelector<HTMLElement>("#llm-status");
  if (status) {
    status.textContent = statusText(state);
    const tone = statusTone(state);
    status.classList.toggle("blocked", tone === "blocked");
    status.classList.toggle("ready", tone === "ready");
    status.classList.toggle("probing", tone === "probing");
    status.hidden = tone === "ready";
  }
  const blocked = unreachable(state);
  const option = document.querySelector<HTMLOptionElement>(
    '#p2-controller option[value="llm"]',
  );
  if (option) {
    option.textContent = blocked
      ? "LLM (You need to run it locally, this opens setup docs)"
      : "LLM";
  }
  // The constructed lobby offers the same choice as two cards rather than a
  // select, so the note that would have gone on the option goes under the LLM
  // card's title instead. Whichever control the screen used, exactly one of
  // these two queries finds anything.
  const hint = document.querySelector<HTMLElement>(
    '[data-controller-hint="llm"]',
  );
  if (hint) hint.textContent = blocked ? LLM_UNREACHABLE_HINT : "";
  // Re-rendered, not just bound: everything the panel shows follows the
  // capability -- the message under the fields, the key hint in the placeholder,
  // whether there is a saved key to forget. Binding alone left a saved setup
  // still reading "Saving...". Only the three capability changes reach here; a
  // host screen's own re-render goes through `bindSettings`, which leaves a
  // half-typed key alone.
  mountPanel(state, ctx);
  ctx.onCapabilityChanged();
}

export async function refreshCapability(
  state: LlmSettingsState,
  ctx: LlmSettingsContext,
): Promise<void> {
  try {
    const response = await fetch("/api/llm/capability");
    if (!response.ok) throw new Error(`LLM_CAPABILITY_${response.status}`);
    state.capability = (await response.json()) as LlmCapability;
  } catch {
    state.capability = {
      available: false,
      configured: false,
      credentialSource: null,
      model: "",
      rawLogging: false,
    };
  }
  syncStatus(state, ctx);
}

/* ---------------------------------------------------------------------------
   The fields' behaviour.

   All of it patches the live DOM rather than re-rendering the host screen: a
   re-render would reset the seed field and the deck selects the reader may
   have already set.
   ------------------------------------------------------------------------ */

function element(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#${id}`);
}

function input(id: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`#${id}`);
}

function select(id: string): HTMLSelectElement | null {
  return document.querySelector<HTMLSelectElement>(`#${id}`);
}

function showMessage(state: LlmSettingsState, message: string): void {
  state.message = message;
  const line = element("llm-settings-message");
  if (!line) return;
  line.textContent = message;
  line.hidden = !message;
}

/** Show the fields the selected provider actually needs. */
function syncProviderFields(state: LlmSettingsState): void {
  const providers = state.capability?.providers ?? [];
  const chosen = select("llm-provider");
  const provider = providers.find(
    (candidate) => candidate.id === chosen?.value,
  );
  const keyField = element("llm-api-key-field");
  if (keyField) {
    keyField.hidden = provider?.keyLabel === null;
    const label = keyField.childNodes[0];
    if (label && provider?.keyLabel) label.textContent = provider.keyLabel;
  }
  const baseField = element("llm-base-url-field");
  if (baseField) baseField.hidden = !provider?.needsBaseUrl;
  const options = element("llm-model-options");
  if (options) {
    options.innerHTML = (provider?.models ?? [])
      .map((model) => `<option value="${escapeHtml(model)}"></option>`)
      .join("");
  }
  // Switching provider makes the old model id meaningless -- `gpt-5-mini` is
  // not a Gemini model -- so offer that provider's first suggestion instead.
  const model = input("llm-model");
  if (model && provider && !provider.models.includes(model.value)) {
    const known = providers.some((candidate) =>
      candidate.models.includes(model.value),
    );
    if (!model.value || known) model.value = provider.models[0] ?? model.value;
  }
}

/**
 * Write the panel's current markup into the status row, replacing any older
 * copy.
 *
 * Re-rendering rather than patching field by field, because the panel's shape
 * follows the capability -- which fields the provider needs, whether there is a
 * saved key to forget. Only the panel is replaced, so the lobby's seed and deck
 * selects, the reason the host screen is never re-rendered, are untouched.
 */
function mountPanel(state: LlmSettingsState, ctx: LlmSettingsContext): void {
  if (!editable(state)) return;
  state.draft ??= draftFrom(state.capability!);
  // Which host this is, read off the page rather than remembered: the panel is
  // re-mounted by the capability probe, long after the screen that rendered it
  // said so.
  const html = renderPanel(state, {
    hostSaves: Boolean(element("llm-settings-row")?.closest("#matchup-config")),
  });
  const existing = element("llm-settings-panel");
  if (existing) existing.outerHTML = html;
  else element("llm-settings-row")?.insertAdjacentHTML("beforeend", html);
  bindPanelFields(state, ctx);
}

function readDraft(): LlmConfigDraft {
  return {
    provider: select("llm-provider")?.value ?? "",
    apiKey: input("llm-api-key")?.value ?? "",
    model: input("llm-model")?.value ?? "",
    baseUrl: input("llm-base-url")?.value ?? "",
  };
}

/**
 * Send the draft to the local server, which is the only place a key is kept.
 *
 * An empty key field with the same provider already saved means "leave the key
 * alone", so the server is asked to keep it by being sent no key at all -- it
 * merges an omitted key with what it has.
 */
async function save(
  state: LlmSettingsState,
  ctx: LlmSettingsContext,
): Promise<void> {
  const capability = state.capability;
  if (!capability || state.saving) return;
  const draft = readDraft();
  state.draft = draft;
  const providers = capability.providers ?? [];
  const sameProvider =
    capability.credentialSource === "settings" &&
    capability.provider === draft.provider;
  const complaint = validateDraft(
    draft,
    providers,
    sameProvider && Boolean(capability.keyHint),
  );
  if (complaint) {
    showMessage(state, complaint);
    return;
  }
  state.saving = true;
  showMessage(state, "Saving...");
  try {
    const response = await fetch("/api/llm/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: draft.provider,
        model: draft.model.trim(),
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
        ...(draft.baseUrl.trim() ? { baseUrl: draft.baseUrl.trim() } : {}),
      }),
    });
    const body = (await response.json()) as LlmCapability & {
      message?: string;
    };
    if (!response.ok) {
      showMessage(state, body.message ?? "Could not save those settings.");
      return;
    }
    state.capability = body;
    // Nothing closes on a save now, so the panel has to say it worked itself.
    // Set before the re-render so the fresh markup carries it.
    state.message = "Saved.";
    state.draft = draftFrom(body);
    syncStatus(state, ctx);
  } catch {
    showMessage(state, "The local app is not answering. Is it still running?");
  } finally {
    state.saving = false;
  }
}

async function forget(
  state: LlmSettingsState,
  ctx: LlmSettingsContext,
): Promise<void> {
  try {
    const response = await fetch("/api/llm/config", { method: "DELETE" });
    if (!response.ok) throw new Error(`LLM_CONFIG_${response.status}`);
    state.capability = (await response.json()) as LlmCapability;
    state.message = "";
    state.draft = draftFrom(state.capability);
    syncStatus(state, ctx);
  } catch {
    showMessage(state, "Could not clear the saved settings.");
  }
}

/**
 * Commit whatever the reader typed, for a host that saves on the way out.
 *
 * Silent when nothing was typed: a Done that POSTs an untouched panel would
 * answer a click that was about the seed or the starting player with "Enter
 * your OpenAI key", and a setup running from the server environment has no key
 * for the page to send in the first place.
 */
export async function saveIfChanged(
  state: LlmSettingsState,
  ctx: LlmSettingsContext,
): Promise<void> {
  if (!element("llm-settings-panel") || !state.capability) return;
  const draft = readDraft();
  const saved = draftFrom(state.capability);
  const changed =
    draft.apiKey.trim() !== "" ||
    draft.provider !== saved.provider ||
    draft.model.trim() !== saved.model.trim() ||
    draft.baseUrl.trim() !== saved.baseUrl.trim();
  if (changed) await save(state, ctx);
}

/** Wire the panel's controls. Its nodes are replaced on every mount, so these
    listeners come fresh with them and never accumulate. */
function bindPanelFields(
  state: LlmSettingsState,
  ctx: LlmSettingsContext,
): void {
  const panel = element("llm-settings-panel");
  if (!panel || panel.dataset.bound) return;
  panel.dataset.bound = "1";
  element("llm-key-help")?.addEventListener("click", (event) => {
    const url = (event.currentTarget as HTMLElement).dataset.keyUrl;
    if (url) window.open(url, "_blank", "noopener");
  });
  element("llm-save")?.addEventListener("click", () => {
    void save(state, ctx);
  });
  element("llm-forget")?.addEventListener("click", () => {
    void forget(state, ctx);
  });
  element("llm-provider")?.addEventListener("change", () => {
    syncProviderFields(state);
    showMessage(state, "");
  });
  // What the form element used to give for free. The host screens both have a
  // submit of their own -- "Start match" -- so Enter must not reach them from
  // here: an unsaved key would otherwise start a match that cannot run.
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void save(state, ctx);
  });
}

/**
 * Bring the page in line with the state: the fields under the status line and
 * the listeners on them.
 *
 * Called by every screen after it renders, and again whenever the capability
 * changes -- a host screen renders before the probe answers, so at first render
 * nothing yet knows whether this build can store a key and the row goes out with
 * its status line alone. Idempotent by construction: a mounted panel is marked
 * bound, and a re-mounted one gets its listeners with its new nodes.
 */
export function bindSettings(
  state: LlmSettingsState,
  ctx: LlmSettingsContext,
): void {
  if (element("llm-settings-panel")) bindPanelFields(state, ctx);
  else mountPanel(state, ctx);
}
