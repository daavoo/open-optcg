import { expect, test, type Page } from "./fixtures.js";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The served app, `pnpm web:serve`: the same page plus the loopback API that
 * keeps an API key on the reader's machine.
 *
 * Driven against `pnpm web:serve` rather than the `file://` artifact the rest of
 * the suite uses, because everything under test here -- the capability probe,
 * the settings dialog, the saved-key file -- exists only when there is a server
 * to answer. The port is fixed and unusual enough not to collide with a dev
 * server someone left running.
 */
// One server for the file, so `beforeAll` runs once: Playwright runs it per
// worker, and with the suite's `fullyParallel` the file's tests would otherwise
// land in three workers, two of which would fail to bind the port and then talk
// to the survivor's server while checking their own config directory.
test.describe.configure({ mode: "serial" });

const port = 4877;
const appUrl = `http://127.0.0.1:${String(port)}/`;
let server: ChildProcess;
let configDir: string;

test.beforeAll(async () => {
  configDir = await mkdtemp(join(tmpdir(), "open-optcg-e2e-config-"));
  server = spawn(
    "node",
    ["--import", "tsx", "tools/serve-web-cli.ts", `--port=${String(port)}`],
    {
      env: {
        ...process.env,
        OPEN_OPTCG_CONFIG_DIR: configDir,
        // Empty rather than absent: `.env` fills in anything unset, and this
        // suite is about the app starting with nothing configured.
        OPENAI_API_KEY: "",
        GEMINI_API_KEY: "",
        OTARI_AI_TOKEN: "",
        LLM_API: "",
        LLM_MODEL: "",
      },
      stdio: "ignore",
    },
  );
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const response = await fetch(`${appUrl}api/llm/capability`);
      if (response.ok) return;
    } catch {
      if (Date.now() > deadline) throw new Error("server did not start");
    }
    await new Promise((wait) => setTimeout(wait, 200));
  }
});

test.afterAll(() => {
  server.kill();
});

async function openLobby(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
}

/**
 * The lobby with its matchup dialog open: who pilots the opponent lives there
 * now, and so do the LLM's status line and its settings fields -- inline, so
 * there is no second dialog to open.
 */
async function openLobbyMatchup(page: Page): Promise<void> {
  await openLobby(page);
  await page.locator("#open-matchup-config").click();
  await expect(page.locator("#matchup-config")).toBeVisible();
}

test("a reader configures an LLM opponent from the page, and the key stays on disk", async ({
  page,
}) => {
  await openLobbyMatchup(page);

  // Nothing is configured, so the lobby says so and offers the way to fix it.
  await expect(page.locator("#llm-status")).toContainText("No API key yet");
  await expect(page.locator("#llm-status")).toHaveClass(/blocked/);
  await expect(page.locator("#llm-provider")).toBeVisible();

  await page.locator("#llm-provider").selectOption("gemini");
  // Switching provider replaces a model id that provider would reject.
  await expect(page.locator("#llm-model")).toHaveValue(/^gemini-/);
  await page.locator("#llm-api-key").fill("AIza-not-a-real-key-4321");
  // Enter in a field saves, the same write the dialog's Done performs.
  await page.locator("#llm-api-key").press("Enter");

  // Nothing to dismiss: the panel stays put and says what happened. A working
  // setup is reported by the fields themselves -- the saved key's last four in
  // the key field, the model in the model field -- so the status line, which
  // speaks only when something needs attention, goes quiet.
  await expect(page.locator("#llm-settings-message")).toContainText("Saved");
  const status = page.locator("#llm-status");
  await expect(status).toBeHidden();
  await expect(page.locator("#llm-api-key")).toHaveAttribute(
    "placeholder",
    /····4321/,
  );
  await expect(page.locator("#llm-model")).toHaveValue(/^gemini-/);

  // The key is on the server's disk, readable only by its owner, and nowhere
  // in the browser -- neither in storage nor in what the page was told.
  const stored = JSON.parse(
    await readFile(join(configDir, "llm.json"), "utf8"),
  ) as { apiKey: string; provider: string };
  expect(stored).toMatchObject({
    provider: "gemini",
    apiKey: "AIza-not-a-real-key-4321",
  });
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain("AIza-not-a-real-key");
  const capability = await (await fetch(`${appUrl}api/llm/capability`)).text();
  expect(capability).not.toContain("AIza-not-a-real-key");

  // A model change alone keeps the key, which the page cannot resend.
  await page.locator("#llm-model").fill("gemini-2.5-pro");
  await page.locator("#llm-model").press("Enter");
  await expect(page.locator("#llm-model")).toHaveValue("gemini-2.5-pro");
  await expect(page.locator("#llm-api-key")).toHaveAttribute(
    "placeholder",
    /····4321/,
  );

  // And forgetting it puts the lobby back where it started.
  await page.locator("#llm-forget").click();
  await expect(status).toContainText("No API key yet");
  await expect(status).toHaveClass(/blocked/);
  await expect(status).toBeVisible();
});

/**
 * The opponent's picker follows its pilot: the LLM plays only decks it has a
 * dossier for and cannot play one the player built, so its grid is narrowed and
 * has no builder tile. Switching back to Heuristics restores both. Served
 * rather than standalone, because only here is the LLM seat selectable at all.
 *
 * The narrowing is shown with a saved deck rather than a shipped one: every
 * deck the app ships now carries a dossier, so a deck the player built is the
 * only thing left that the LLM seat cannot pilot.
 */
/**
 * The dialog has one confirm button and it writes. The panel used to carry a
 * Save of its own beside the dialog's Done, which meant a reader could type a
 * key, press the button that closes the dialog, and lose it.
 */
test("the matchup dialog's Done saves what was typed into the panel", async ({
  page,
}) => {
  await openLobbyMatchup(page);
  await expect(page.locator("#llm-save")).toHaveCount(0);

  await page.locator("#llm-provider").selectOption("gemini");
  await page.locator("#llm-api-key").fill("AIza-done-writes-8765");
  await page.locator("#matchup-done").click();
  await expect(page.locator("#matchup-config")).toBeHidden();

  await openLobbyMatchup(page);
  await expect(page.locator("#llm-api-key")).toHaveAttribute(
    "placeholder",
    /8765/,
  );
  const stored = JSON.parse(
    await readFile(join(configDir, "llm.json"), "utf8"),
  ) as { apiKey: string };
  expect(stored.apiKey).toBe("AIza-done-writes-8765");

  // Done on a panel nobody typed into writes nothing, and complains about
  // nothing: the reader was there for the seed or the starting player.
  await page.locator("#llm-forget").click();
  await expect(page.locator("#llm-status")).toContainText("No API key yet");
  await page.locator("#matchup-done").click();
  await expect(page.locator("#matchup-config")).toBeHidden();
  await openLobbyMatchup(page);
  await expect(page.locator("#llm-settings-message")).toBeHidden();
});

test("the opponent's deck grid follows whoever is piloting it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "open-optcg.saved-decks",
      JSON.stringify({
        // A home-brew Kuzan: ST33 is its Leader's shipped deck, so it borrows
        // that dossier and the LLM can pilot it.
        "CUSTOM-1": {
          name: "A deck of my own",
          deck: {
            id: "CUSTOM-1",
            leader: "OP12-040",
            cards: { "OP12-045": 50 },
          },
        },
        // A Leader no shipped deck plays. There is nothing for it to borrow,
        // so it stays out of the grid the way every saved deck used to. If a
        // deck for this Leader ships, pick another one that
        // `dossierDeckIdsForLeader` returns nothing for.
        "CUSTOM-2": {
          name: "A Leader with no plan",
          deck: {
            id: "CUSTOM-2",
            leader: "OP06-020",
            cards: { "OP12-045": 50 },
          },
        },
      }),
    );
  });
  await openLobbyMatchup(page);
  await expect(page.locator("#p2-controller")).toHaveValue("llm");
  // Nothing here reaches the editor: this grid is a fixed list of what the LLM
  // seat can be set to, and a deck built from it might not be on that list.
  await expect(page.locator("#p2-deck-picker .deck-tile-builder")).toHaveCount(
    0,
  );
  await expect(page.locator("#p2-deck-picker .deck-tile-edit")).toHaveCount(0);
  await expect(
    page.locator('#p2-deck-picker [data-pick-deck][data-deck-id="CUSTOM-1"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('#p2-deck-picker [data-pick-deck][data-deck-id="CUSTOM-2"]'),
  ).toHaveCount(0);
  // The shipped decks are all pilotable, including the starters that used to
  // be held back for want of a dossier.
  await expect(
    page.locator(
      '#p2-deck-picker [data-pick-deck][data-deck-id="(Blue) Kuzan - Starter Deck 33"]',
    ),
  ).toHaveCount(1);

  await page.locator('[data-controller="rules"]').click();
  await expect(page.locator("#p2-deck-picker .deck-tile-builder")).toHaveCount(
    1,
  );
  await expect(page.locator("#p2-deck-picker .deck-tile-edit")).not.toHaveCount(
    0,
  );
  const anyDeck = page.locator(
    '#p2-deck-picker [data-pick-deck][data-deck-id="CUSTOM-1"]',
  );
  await expect(anyDeck).toHaveCount(1);

  // The rebuilt grid is live, not just markup: picking from it sets the seat.
  await page.locator('[data-close-dialog="matchup-config"]').last().click();
  await page.locator('[data-open-picker="p2"]').click();

  // And the rebuilt dialog still closes. Its Close button used to be bound
  // once, at bind time, to a node that switching pilots then replaced -- so
  // this button did nothing, and the icon beside it was missing too because
  // the new markup was never re-hydrated.
  const picker = page.locator("#p2-deck-picker");
  await expect(picker).toBeVisible();
  await expect(picker.locator("[data-close-dialog] svg")).toHaveCount(1);

  await picker.locator("[data-close-dialog]").click();
  await expect(picker).toBeHidden();

  await page.locator('[data-open-picker="p2"]').click();
  await anyDeck.click();
  await expect(page.locator("#p2-deck")).toHaveValue("CUSTOM-1");
  await expect(page.locator("#p2-deck-label")).toContainText("Kuzan");
});

test("the panel says what is missing instead of saving half a setup", async ({
  page,
}) => {
  await openLobbyMatchup(page);
  await page.locator("#llm-model").press("Enter");
  await expect(page.locator("#llm-settings-message")).toContainText("key");
  await expect(page.locator("#llm-settings-panel")).toBeVisible();

  // A local provider needs no key at all, and a custom endpoint needs a URL.
  await page.locator("#llm-provider").selectOption("ollama");
  await expect(page.locator("#llm-api-key-field")).toBeHidden();
  await page.locator("#llm-provider").selectOption("custom");
  await expect(page.locator("#llm-base-url-field")).toBeVisible();
  await page.locator("#llm-api-key").fill("key");
  await page.locator("#llm-model").fill("some-model");
  await page.locator("#llm-model").press("Enter");
  await expect(page.locator("#llm-settings-message")).toContainText("endpoint");

  // The matchup dialog is the only layer to close, and closing it does not
  // save a half-filled setup: nothing was written.
  await page.locator('[data-close-dialog="matchup-config"]').last().click();
  await expect(page.locator("#matchup-config")).toBeHidden();
});
