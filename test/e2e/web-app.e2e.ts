import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "./fixtures.js";
import { pathToFileURL } from "node:url";
import { strToU8, zipSync } from "fflate";
import { openShelfOf } from "./deck-picker.js";

/**
 * A serialisable rectangle. `DOMRect.toJSON()` is typed `any`, so the browser
 * side builds this explicitly rather than handing an untyped object back.
 */
type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
};
const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;
const seed = "match-f27275158584c9c5";

/**
 * The landing page is the 1v1 lobby, so there is no door to take: this waits
 * for the form -- including after a reload, which lands back on it.
 */
async function enterSetup(page: Page): Promise<void> {
  await expect(page.locator("#setup-form")).toBeVisible();
}

/** The fan of modes is off the page; `#modes` is the one way to it. */
const modesUrl = `${appUrl}#modes`;

async function openSetup(page: Page): Promise<void> {
  await page.goto(appUrl);
  await enterSetup(page);
}

/** A one-pixel PNG: a card face for a pack made up here. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * A pack zip laid out as the Get cards bookmark saves one: the text pack, and
 * `art/` with one image per named card. The words are test data -- the suite
 * must not depend on Bandai's text -- and what is under test is the import
 * path and every surface that reads through it.
 */
async function writePackZip(
  cards: Record<string, { effect: string; trigger?: string }>,
  art: readonly string[] = [],
): Promise<string> {
  const entries: Record<string, Uint8Array> = {
    "printed-text.json": strToU8(JSON.stringify({ version: 1, cards })),
  };
  for (const card of art) entries[`art/${card}.png`] = PIXEL_PNG;
  const path = join(
    await mkdtemp(join(tmpdir(), "open-optcg-pack-")),
    "open-optcg-assets.zip",
  );
  await writeFile(path, zipSync(entries));
  return path;
}

/**
 * Loads a text pack the way a player with one already in loads a newer one:
 * the zip control in the Configure dialog. It is in the DOM whether or not
 * the dialog is open.
 */
async function loadTextPack(
  page: Page,
  cards: Record<string, { effect: string; trigger?: string }>,
): Promise<void> {
  const zip = await writePackZip(cards);
  await page.goto(appUrl);
  await page.locator(".dialog-assets [data-asset-zip]").setInputFiles(zip);
  await expect(
    page.locator(".dialog-assets .home-assets-status"),
  ).toContainText(`printed text for ${Object.keys(cards).length} card`);
}

/**
 * Set a seat's deck the way a player does: open that seat's picker and click
 * the deck's Leader card.
 */
async function pickDeck(
  page: Page,
  seat: "p1" | "p2",
  deckId: string,
): Promise<void> {
  await page.locator(`[data-open-picker="${seat}"]`).click();
  await openShelfOf(page, seat, deckId);
  await page
    .locator(`#${seat}-deck-picker [data-pick-deck][data-deck-id="${deckId}"]`)
    .click();
  await expect(page.locator(`#${seat}-deck-picker`)).toBeHidden();
}

/** Hand both seats to agents and ask the play cell for a run of `games`. */
async function simulateFromTheLobby(page: Page, games: number): Promise<void> {
  await page.locator('[data-seat-pilot="p1"][data-pilot="ai"]').click();
  await page.locator('[data-seat-pilot="p2"][data-pilot="ai"]').click();
  await page.getByRole("button", { name: "AI vs AI", exact: true }).click();
  await page.locator(`[data-simulate-size="${games}"]`).click();
  await page.getByRole("button", { name: `Simulate ${games} games` }).click();
  await expect(
    page.getByRole("heading", { name: "Simulate matchup" }),
  ).toBeVisible();
}

/** Open the matchup dialog, where the pilot, the starting player and the seed
    live. Left open: the caller closes it, or reads from it. */
async function openMatchupConfig(page: Page): Promise<void> {
  await page.locator("#open-matchup-config").click();
  await expect(page.locator("#matchup-config")).toBeVisible();
}

async function closeMatchupConfig(page: Page): Promise<void> {
  await page.locator("#matchup-config [data-close-dialog]").last().click();
  await expect(page.locator("#matchup-config")).toBeHidden();
}

/**
 * Let the test decide when the AI seat stops answering.
 *
 * Several tests need the board held still while it is the opponent's turn --
 * to measure the waiting modal, to read a freshly loaded history, or to see
 * that ending a turn really did hand over priority. They used to click a
 * "Pause AI" toggle, which was removed once the automatic pauses subsumed it.
 *
 * Gating the worker is better than that toggle anyway. The AI is not paused,
 * it is simply never answered, so the state under assertion cannot be raced
 * away by a rules agent that replies in a few milliseconds. Must be installed
 * before the page loads, because it replaces a global the app reads on import.
 */
async function gateAiWorker(page: Page, frozen = false): Promise<void> {
  await page.addInitScript((startFrozen: boolean) => {
    const RealWorker = window.Worker;
    class GatedWorker extends RealWorker {
      override postMessage(message: unknown): void {
        const gate = window as unknown as { __freezeAi?: boolean };
        if (!gate.__freezeAi) super.postMessage(message);
      }
    }
    window.Worker = GatedWorker;
    (window as unknown as { __freezeAi?: boolean }).__freezeAi = startFrozen;
  }, frozen);
}

/** Stop answering the AI from here on. Requires {@link gateAiWorker}. */
async function freezeAi(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __freezeAi?: boolean }).__freezeAi = true;
  });
}

async function openMatch(page: Page): Promise<void> {
  await openSetup(page);
  await openMatchupConfig(page);
  await page.locator("#starting-player").selectOption("p1");
  await page.locator("#seed").fill(seed);
  await closeMatchupConfig(page);
  await page.getByRole("button", { name: /Start match/ }).click();
}

async function enterMainPhase(page: Page): Promise<void> {
  await openMatch(page);
  await expect(page.locator(".decision-modal")).toBeVisible();
  await expect(page.locator(".context-tray")).toHaveCount(0);
  await page.getByRole("button", { name: /Keep these cards/ }).click();
  await expect(page.locator(".game-shell")).toHaveClass(/phase-main/);
  const opponentNotice = page.locator(".opponent-action-modal");
  if (await opponentNotice.isVisible()) {
    await opponentNotice
      .getByRole("button", { name: "OK", exact: true })
      .click();
  }
}

/**
 * The landing page's mode cards are whole paintings, not composed cards, and
 * two failures are worth guarding. A painting shown at anything but its own
 * ratio: the frame is sized by the image, so a regression there crops or
 * squashes it. And a fan that stops overlapping, or overlaps so far it pushes
 * the row past the window -- both of which the negative margins can do once
 * the card size changes.
 */
/**
 * The footer is shared chrome now, not the landing page's own: every menu page
 * prints it, pinned to the foot of the window so a page long enough to scroll
 * still shows it. The board is the exception -- a match in progress is not a
 * page to leave from.
 */
test("every menu page floors on the same footer, pinned in view", async ({
  page,
}) => {
  await page.goto(appUrl);
  const footerInView = async () => {
    const footer = page.locator(".home-footer");
    await expect(footer).toHaveCount(1);
    const box = await footer.boundingBox();
    if (!box) throw new Error("FOOTER_NOT_VISIBLE");
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("NO_VIEWPORT");
    // Pinned: its bottom edge is the window's, whatever the page's length.
    expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(viewport.height);
    expect(box.y + box.height).toBeGreaterThan(viewport.height - 200);
    // Full bleed, not stuck inside the content column.
    expect(Math.round(box.width)).toBe(viewport.width);
    await expect(page.locator("[data-github]")).toBeVisible();
  };
  await footerInView();
  // The fan of modes is the one page the lobby does not lead to; from it the
  // loop below reaches every other menu page, the lobby included. A hash-only
  // navigation does not reload, so the reload is what shows the fan.
  await page.goto(modesUrl);
  await page.reload();
  await footerInView();
  // The lobby has no topbar to leave by -- it is the landing page -- so it is
  // reached last, and the fan is re-opened by URL rather than by a brand.
  for (const mode of [/^Sealed/]) {
    await page.getByRole("button", { name: mode }).click();
    await footerInView();
    await page.locator(".brand-home").click();
  }
  await page.getByRole("button", { name: /1v1 match/ }).click();
  await footerInView();
});

/**
 * Every menu screen's topbar is one centred brand, and it is the way back.
 * Worth a test because the brand is not obviously a control: if the handler
 * comes unbound there is nothing else on these screens to leave by.
 *
 * The lobby is not among them: it is the landing page, and a brand above it
 * would be the app's name printed over its own front door.
 */
test("the brand in a menu topbar goes home from every screen", async ({
  page,
}) => {
  await page.goto(modesUrl);
  for (const mode of [/^Sealed/]) {
    await page.getByRole("button", { name: mode }).click();
    const brand = page.locator("header.setup-topbar .brand-home");
    await expect(brand).toHaveCount(1);
    // The brand replaced the Home button rather than joining it.
    await expect(page.locator(".home-button")).toHaveCount(0);
    await brand.click();
    await expect(page.locator(".home-modes")).toBeVisible();
  }
});

test("the landing-page modes fan like a hand, each at its own ratio @art", async ({
  page,
}) => {
  await page.goto(modesUrl);
  const cards = page.locator(".home-mode img");
  await expect(cards).toHaveCount(3);
  for (const image of await cards.all()) {
    const shape = await image.evaluate((element: HTMLImageElement) => ({
      natural: element.naturalWidth / element.naturalHeight,
      shown: element.clientWidth / element.clientHeight,
      loaded: element.complete && element.naturalWidth > 0,
    }));
    expect(shape.loaded).toBe(true);
    // Sub-pixel rounding only: any real fitting would be off by percent.
    expect(shape.shown).toBeCloseTo(shape.natural, 2);
  }
  // Nothing of the composed fallback is on the page: every mode is painted.
  await expect(page.locator(".home-mode[data-composed]")).toHaveCount(0);
  // Fanned like a held hand: each card overlaps the one before it, and the
  // row stays inside the window rather than scrolling sideways.
  const boxes = await Promise.all(
    (await page.locator(".home-mode").all()).map(async (card) => {
      const box = await card.boundingBox();
      if (!box) throw new Error("MODE_CARD_NOT_VISIBLE");
      return box;
    }),
  );
  for (const [index, box] of boxes.entries()) {
    const previous = index > 0 ? boxes[index - 1] : undefined;
    if (!previous) continue;
    expect(box.x).toBeGreaterThan(previous.x);
    expect(box.x).toBeLessThan(previous.x + previous.width);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("opponent thinking stays centered with the close button visible", async ({
  page,
}) => {
  // Frozen from the start, so the opponent's mulligan never comes back and the
  // waiting modal stays up long enough to measure.
  await gateAiWorker(page, true);
  await openMatch(page);
  await page.getByRole("button", { name: /Keep these cards/ }).click();

  const waitingModal = page.locator(".waiting-modal");
  const waiting = waitingModal.locator(".waiting");
  await expect(
    waitingModal.getByRole("button", { name: "Close" }),
  ).toBeVisible();
  await expect(waiting).toBeVisible();
  const waitingBox = await waiting.boundingBox();
  const viewport = page.viewportSize();
  expect(waitingBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(
    Math.abs(waitingBox!.x + waitingBox!.width / 2 - viewport!.width / 2),
  ).toBeLessThanOrEqual(1);
});

test("downloaded trace opens its LLM payloads for inspection", async ({
  page,
}) => {
  await openSetup(page);
  const header = {
    kind: "header",
    version: 2,
    exportedAt: "2026-08-10T00:00:00.000Z",
    config: {
      p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p2Deck: "(Yellow) Eustass Kid - Starter Deck 36",
      p1Controller: "human",
      p2Controller: "human",
      seed: "trace-inspector-test",
      startingPlayer: "p1",
    },
    events: [{ type: "game-created", activePlayer: "p1" }],
    llm: {
      model: "test-model",
      systemPrompt: "Choose one legal action.",
      responseSchema: { type: "object" },
    },
  };
  const decision = {
    kind: "decision",
    revision: 1,
    actionId: "r0:mulligan:keep",
    turn: 1,
    player: "p1",
    stateHash: "trace-inspector",
    events: [{ type: "mulligan-decided", playerId: "p1", decision: "keep" }],
    llm: {
      timestamp: "2026-08-10T00:00:01.000Z",
      model: "test-model",
      observation: {
        request: "choose_action",
        state: { turn: 1, phase: "mulligan" },
        legalActions: [
          {
            actionId: "r0:mulligan:keep",
            type: "mulligan-decision",
            summary: "Keep opening hand",
          },
        ],
      },
      chosen: ["r0:mulligan:keep"],
      reasoning: "Keep the opening hand.",
      plan: ["keep, then curve out", "hold the 2000 Counter"],
      reasoningSummary: "The hand has an early curve.",
      usage: { input_tokens: 42, output_tokens: 8 },
    },
  };
  const latestError = {
    kind: "llm-error",
    timestamp: "2026-08-10T00:00:02.000Z",
    turn: 2,
    player: "p2",
    error: "Provider unavailable",
  };
  const trace = `${JSON.stringify(header)}\n${JSON.stringify(latestError)}\n${JSON.stringify(decision)}\n`;

  await page.locator("#trace-input").setInputFiles({
    name: "open-optcg-trace.jsonl",
    mimeType: "application/jsonl",
    buffer: Buffer.from(trace),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();

  await expect(page.locator(".game-shell")).toBeVisible();
  await expect(page.locator(".history-modal")).toBeVisible();
  await expect(page.locator(".trace-payload-warning")).toContainText(
    "normalized payloads",
  );

  // The calls are in the match history, under the entry they chose: the list
  // runs newest-first, so the decision sits below the move it produced and
  // above the setup step that came before it. The band is the match's opening,
  // which belongs to neither seat -- both mulligan in it.
  await expect(
    page
      .locator(".history-band > *")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("class") ?? ""),
      ),
  ).resolves.toEqual([
    "history-band-head",
    "history-group theirs",
    "history-calls failed",
    "history-group neutral",
  ]);
  const calls = page.locator(".history-band .history-calls");
  await expect(
    page.locator(".history-band .history-group.theirs .history-entry"),
  ).toContainText("chose to keep");
  // What the model did is in view; a failed call says so in the same place.
  await expect(calls).toContainText("r0:mulligan:keep");
  await expect(calls).toContainText("Provider unavailable");

  // Why it did it is one click away, and folded until then.
  const reasons = calls.locator("details.history-call-reasons").first();
  await expect(reasons.locator("summary")).toHaveText("LLM plan and reasoning");
  await expect(reasons.locator("p").first()).toBeHidden();
  await reasons.locator("summary").click();
  // The plan the seat stated for that turn, above the sentence written to serve
  // it -- and this trace carries no exact payloads, so it is also the reload
  // path that has to keep the plan.
  await expect(reasons.locator("ol.history-call-plan li")).toHaveText([
    "keep, then curve out",
    "hold the 2000 Counter",
  ]);
  await expect(reasons).toContainText("Keep the opening hand.");
  await expect(reasons).toContainText("The hand has an early curve.");
});

test("a DON!! payment is composed in one modal, count and source together", async ({
  page,
}) => {
  // The recording stops with OP09-070 Nami on the board and her `[On Play]`
  // waiting: "you may return 1 or more DON!! cards ... " is the next decision.
  // Frozen, so the opponent seat cannot play on past the loaded position.
  await gateAiWorker(page, true);
  await openSetup(page);
  await page
    .locator("#trace-input")
    .setInputFiles(
      resolve(process.cwd(), "fixtures/replay/don-return-composer.jsonl"),
    );
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();
  await expect(page.locator(".game-shell")).toBeVisible();
  const modal = page.locator(".decision-modal");
  // The apply half of the pair, picked as "not the refusal": it is labelled
  // with the clause being offered, and only the skip half says "Don't apply".
  await modal
    .locator("button.action-button.resolve-effect")
    .filter({ hasNotText: "Don't apply" })
    .first()
    .click();

  // One surface for the whole payment, titled for the DON!! deck the cards are
  // going to -- never for a "cost", which is the number printed on the card
  // and was paid to play it.
  await expect(page.locator(".actions-heading h2")).toHaveText(
    "Return DON!! to your DON!! deck",
  );
  await expect(page.locator(".don-pool-list")).toBeVisible();
  // Untouched, it pays what the engine would have taken on its own: the
  // cheapest DON!! first, which is a rested one.
  await expect(page.locator(".don-pool-row.taking")).toHaveCount(1);
  await expect(page.locator(".don-pool-row.taking .don-pool-name")).toHaveText(
    /Rested DON!!/,
  );
  await expect(page.locator("#don-return-confirm")).toHaveText(
    "Return 1 DON!!",
  );

  // The payment's size is the sum of the pools, so raising one raises it: no
  // separate total control to keep in step.
  await page.locator('[data-don-pool-more="active"]').click();
  await expect(page.locator("#don-return-confirm")).toHaveText(
    "Return 2 DON!!",
  );
  // The running total is the half of the trade the board cannot show: DON!!
  // leave the field and land in a pile whose contents are interchangeable.
  await expect(page.locator(".don-return-summary")).toContainText("0 active");
  await expect(page.locator(".don-return-summary")).toContainText(
    "8 in your DON!! deck",
  );
  await page.locator("#don-return-confirm").click();

  // The engine asks which pool each DON!! came out of, one card at a time.
  // Composed here, those prompts are answered from the plan and never reach
  // the screen: the next thing the player sees is what the payment bought.
  await expect(page.locator(".don-pool-list")).toHaveCount(0);
  await expect(page.locator(".actions-heading h2")).toHaveText(
    "Resolve Nami's card effect",
  );
});

test("a printed DON!! -N is composed on the same surface as a variable one", async ({
  page,
}) => {
  // The recording stops with ST26-002 Tony Tony.Chopper's `DON!! −2` paid and
  // the engine asking which pool each of the two came out of. There is no
  // count to choose -- the cost is printed -- so this decision used to miss
  // the composer entirely and draw one modal per DON!!, titled after a cost
  // the player had already paid to play the card.
  await gateAiWorker(page, true);
  await openSetup(page);
  await page
    .locator("#trace-input")
    .setInputFiles(
      resolve(process.cwd(), "fixtures/replay/don-return-fixed-cost.jsonl"),
    );
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();
  await expect(page.locator(".game-shell")).toBeVisible();
  await expect(page.locator(".actions-heading h2")).toHaveText(
    "Return DON!! to your DON!! deck",
  );

  // Both pools are on screen at once, counting what they held before the cost
  // was paid -- the engine has already taken the DON!! out of them, so the
  // board alone can no longer say what there was to choose between. The
  // OP09-061 Leader's answer to the return, an active and a rested DON!! from
  // the deck, is a [Once Per Turn] reaction put to the player after the
  // payment, so it is not on the field yet.
  const rows = page.locator(".don-pool-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Rested DON!!");
  await expect(rows.first()).toContainText("3 there");
  await expect(rows.nth(1)).toContainText("1 there");
  // Untouched, it pays what the engine already took: the two cheapest.
  await expect(page.locator(".don-pool-row.taking")).toHaveCount(1);
  await expect(page.locator("#don-return-confirm")).toHaveText(
    "Return 2 DON!!",
  );
  // And the field it describes is the field as it stands, the DON!! deck
  // included: a printed cost is paid before this is asked, so nothing here is
  // still to be added to the pile.
  await expect(page.locator(".don-return-summary")).toContainText("1 active");
  await expect(page.locator(".don-return-summary")).toContainText(
    "8 in your DON!! deck",
  );

  // The size of a printed cost cannot move, so the steppers move a DON!! from
  // one pool to the other: two is still the payment, but one of them is now an
  // active DON!! and a rested one stays on the field.
  await page.locator('[data-don-pool-less="rested"]').click();
  await expect(page.locator("#don-return-confirm")).toHaveText(
    "Choose 2 DON!!",
  );
  await expect(page.locator("#don-return-confirm")).toBeDisabled();
  await page.locator('[data-don-pool-more="active"]').click();
  await expect(page.locator("#don-return-confirm")).toHaveText(
    "Return 2 DON!!",
  );
  await expect(page.locator(".don-return-summary")).toContainText("0 active");
  await expect(page.locator(".don-return-summary")).toContainText("2 rested");

  // Confirming answers both pool prompts off the plan, as the variable count
  // does: the next question is the Leader's refund, not a second pool modal.
  await page.locator("#don-return-confirm").click();
  await expect(page.locator(".don-pool-list")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Apply Monkey.D.Luffy [OP09-061]'s optional effect",
    })
    .click();
  await expect(page.locator(".actions-heading")).toHaveCount(0);
  // The split it confirmed is the one the cost area ends up with: the active
  // DON!! the player chose to spend is gone, and a rested one stayed.
  await expect(page.locator("#active-don .don-slot.active")).toHaveCount(1);
  await expect(page.locator("#active-don .don-slot.rested")).toHaveCount(3);
});

test("history hides a private search but shows a public reveal", async ({
  page,
}) => {
  // The replay reaches an OP15-118 Enel search, whose text is "Look at 5 cards
  // ... and add up to 1 card to your hand" with no reveal: the added card is
  // private. Nami OP01-016 prints "reveal", so her search stays public.
  // Frozen from the start: the recording's opponent seat is Heuristics, and
  // letting it play on past the loaded position would keep rewriting the very
  // history these assertions read.
  await gateAiWorker(page, true);
  await openSetup(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page
    .locator("#trace-input")
    .setInputFiles(
      resolve(process.cwd(), "fixtures/replay/enel-private-search.jsonl"),
    );
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();
  await expect(page.locator(".game-shell")).toBeVisible();
  await page.getByTitle("Match history").click();
  const history = page.locator(".history-modal .history");
  await expect(history).toBeVisible();
  // The public side of the match is in the log, including the reveal Nami
  // is allowed to show and the fact that the opponent played Enel.
  await expect(history).toContainText("(via Nami [OP01-016])");
  await expect(history).toContainText("played Enel [OP15-118]");
  // The private search names neither its source nor the card it looked at
  // (Varie, OP15-074 in this recording -- which the opponent does later play
  // publicly, so the assertion is on the reveal wording, not the number).
  //
  // Enel is named by the *public* half of the same [On Play] -- the `DON!! −1`
  // it pays, which every seat watches leave the field, and which the log has
  // reported since `don-returned` existed. So the leak to guard is a step that
  // moves or shows a card being attributed to Enel, not the card's name
  // appearing in the log at all: it is face-up on the board, and the assertion
  // above requires the log to say it was played.
  //
  // A step is a headline or a line inside an entry's fold, so both are read
  // here: an attribution that only leaks once the reader opens the entry is
  // still a leak.
  const enelSteps = await history
    .locator(".history-entry p, .history-steps li", {
      hasText: "via Enel [OP15-118]",
    })
    .allTextContents();
  expect(enelSteps).toHaveLength(1);
  expect(enelSteps[0]).toContain("returned 1 DON!!");
  await expect(history).not.toContainText("revealed Varie");
});

test("a turn's failed calls are listed newest first, before any step", async ({
  page,
}) => {
  await openSetup(page);
  const header = {
    kind: "header",
    version: 2,
    exportedAt: "2026-08-10T00:00:00.000Z",
    config: {
      p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p2Deck: "(Yellow) Eustass Kid - Starter Deck 36",
      p1Controller: "human",
      p2Controller: "human",
      seed: "trace-history-test",
      startingPlayer: "p1",
    },
    events: [{ type: "game-created", activePlayer: "p1" }],
  };
  const firstCall = {
    kind: "llm-error",
    timestamp: "2026-08-10T00:00:01.000Z",
    turn: 1,
    player: "p1",
    error: "First call marker",
  };
  const secondCall = {
    kind: "llm-error",
    timestamp: "2026-08-10T00:00:02.000Z",
    turn: 2,
    player: "p1",
    error: "Second call marker",
  };
  const trace = `${JSON.stringify(header)}\n${JSON.stringify(firstCall)}\n${JSON.stringify(secondCall)}\n`;

  await page.locator("#trace-input").setInputFiles({
    name: "open-optcg-trace.jsonl",
    mimeType: "application/jsonl",
    buffer: Buffer.from(trace),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();

  // Neither call reached an action, so both belong to the move still to come:
  // they lead the list, above the setup step that did happen, newest first.
  await expect(page.locator(".history-call > header")).toHaveText([
    /Second call marker/,
    /First call marker/,
  ]);
  await expect(page.locator(".history-list > *").first()).toHaveClass(
    "history-calls failed",
  );
});

test("the standalone artifact offers the in-browser pilots only", async ({
  page,
}) => {
  await openSetup(page);

  // A build without a model pack has one pilot to offer, and no LLM.
  await openMatchupConfig(page);
  await expect(page.locator("#p2-controller")).toHaveValue("rules");
  await expect(page.locator('[data-controller="rules"]')).toHaveClass(/picked/);
  await expect(page.locator('[data-controller="llm"]')).toHaveCount(0);
  await closeMatchupConfig(page);
  const opponentDeckColumn = page.locator('.deck-column[data-seat="p2"]');
  await expect(opponentDeckColumn.locator(".deck-select-preview")).toHaveCount(
    1,
  );
  // The opponent's grid offers every deck, and the player can build one for it.
  await expect(
    page.locator(
      '#p2-deck-picker [data-pick-deck][data-deck-id="(Blue) Kuzan - Starter Deck 33"]',
    ),
  ).toHaveCount(1);
  // The empty slot and one pencil per deck: rules can pilot anything the
  // player builds, so this grid reaches the editor.
  await expect(page.locator("#p2-deck-picker .deck-tile-builder")).toHaveCount(
    1,
  );
  await expect(page.locator("#p2-deck-picker .deck-tile-edit")).not.toHaveCount(
    0,
  );
});

test("the deck picker opens on Community, and each shelf filters on its own", async ({
  page,
}) => {
  await openSetup(page);
  await page.locator('[data-open-picker="p1"]').click();
  const picker = page.locator("#p1-deck-picker");
  await expect(picker.getByRole("tab", { selected: true })).toContainText(
    "Community",
  );
  const starters = picker.locator("#p1-deck-shelf-starter");
  await expect(starters).toBeHidden();
  await picker.getByRole("tab", { name: /Starters/ }).click();
  await expect(starters).toBeVisible();
  await expect(picker.locator("#p1-deck-shelf-meta")).toBeHidden();

  // A colour narrows the shelf to the Leaders of that colour, and a query
  // that matches nothing says so rather than leaving an empty grid.
  const filter = starters.locator("[data-deck-filter-input]");
  await filter.fill("blue kuzan");
  await expect(starters.locator(".deck-tile-wrap:visible")).toHaveCount(1);
  await expect(starters.locator(".deck-tile-wrap:visible")).toContainText(
    "Kuzan",
  );
  await filter.fill("no such deck");
  await expect(starters.locator(".deck-tile-wrap:visible")).toHaveCount(0);
  await expect(starters.locator(".deck-picker-empty")).toBeVisible();

  // The Community shelf kept its own, empty, filter.
  await picker.getByRole("tab", { name: /Community/ }).click();
  await expect(
    picker.locator("#p1-deck-shelf-meta .deck-tile-wrap:visible"),
  ).not.toHaveCount(0);
});

test("the lobby opens on the decks the last visit left", async ({ page }) => {
  await openSetup(page);
  await pickDeck(page, "p1", "(Blue) Kuzan - Starter Deck 33");
  await pickDeck(page, "p2", "(Black) Marshall.D.Teach - Starter Deck 27");
  await page.reload();
  await enterSetup(page);
  await expect(page.locator("#p1-deck")).toHaveValue(
    "(Blue) Kuzan - Starter Deck 33",
  );
  await expect(page.locator("#p2-deck")).toHaveValue(
    "(Black) Marshall.D.Teach - Starter Deck 27",
  );
});

test("exports the match trace, the single save artifact", async ({ page }) => {
  await openMatch(page);
  await page.getByRole("button", { name: /Keep these cards/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#trace").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  // `Readable` async-iterates as `any`, so the element type is stated here
  // rather than letting an untyped chunk flow into string concatenation.
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString("utf8");
  const lines = content.split("\n").filter(Boolean);
  const header = JSON.parse(lines[0]!) as {
    kind: string;
    config: { seed: string };
  };

  expect(download.suggestedFilename()).toBe("open-optcg-trace.jsonl");
  expect(header.kind).toBe("header");
  expect(header.config.seed).toBe(seed);
  // One line per decision; a rules-AI match exports no model lines.
  expect(
    lines
      .slice(1)
      .every(
        (line) => (JSON.parse(line) as { kind: string }).kind === "decision",
      ),
  ).toBe(true);
});

test("mat colors follow deck leaders without a manual picker", async ({
  page,
}) => {
  await openSetup(page);

  await expect(page.getByRole("group", { name: "Table mat" })).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "red");
  await expect(page.locator("html")).toHaveAttribute(
    "data-opp-theme",
    "yellow",
  );

  await pickDeck(
    page,
    "p1",
    "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
  );

  await expect(page.locator("html")).toHaveAttribute("data-theme", "green");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-secondary",
    "blue",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme-dual", "true");

  await page.getByRole("button", { name: /Start match/ }).click();
  await expect(page.getByTitle("Table mat")).toHaveCount(0);
  await expect(page.locator(".self-board")).toHaveCSS(
    "--mat-self-secondary-tint",
    "#2c6ba0",
  );
  expect(
    await page
      .locator(".self-board")
      .evaluate(
        (element) => getComputedStyle(element, "::before").backgroundImage,
      ),
  ).toContain("135deg");
});

test("deck editor validates, exports, and starts a custom deck @art", async ({
  page,
}) => {
  await openSetup(page);
  // A preset's own pencil, not the empty slot: this test needs a full list, and
  // opening a preset is also how one is read.
  await page.locator('[data-open-picker="p1"]').click();
  await openShelfOf(page, "p1", "(Red) Monkey.D.Luffy - Starter Deck 31");
  await page
    .locator(
      '#p1-deck-picker [data-edit-deck="p1"][data-deck-id="(Red) Monkey.D.Luffy - Starter Deck 31"]',
    )
    .click();

  await expect(
    page.getByRole("heading", { name: "Deck editor" }),
  ).toBeVisible();
  await expect(page.locator(".editor-leader-card .catalog-card")).toHaveCount(
    1,
  );
  await expect(page.locator(".deck-card-list .catalog-card")).not.toHaveCount(
    0,
  );
  expect(
    await page
      .locator(".deck-card-list")
      .evaluate((list) => list.scrollHeight <= list.clientHeight + 1),
  ).toBe(true);
  await expect(page.locator(".pool-card-list .catalog-card")).not.toHaveCount(
    0,
  );
  await expect(
    page.locator(".pool-card-list .catalog-card.in-deck"),
  ).toHaveCount(0);
  await expect(page.locator(".catalog-card-face.has-art")).not.toHaveCount(0);
  await expect(
    page.locator('.catalog-card:not([data-colors~="Red"])'),
  ).toHaveCount(0);
  await expect(page.locator(".deck-count")).toContainText("50");
  await expect(page.locator(".deck-rule-status")).toContainText(
    "Ready to play",
  );

  const pickedLeader = await page
    .locator("#leader-picker .deck-tile.picked")
    .getAttribute("data-pick-leader");
  await page.locator("#open-leader-picker").click();
  await expect(page.locator("#leader-picker")).toBeVisible();
  // "· Blue", not "Blue": the tile prints `<number> · <colours joined by "/">`,
  // and the theme follows the *first* colour. `:has-text("Blue")` also matches
  // a Red/Blue Leader, whose theme is correctly red -- which is what OP10-002
  // Caesar Clown, the first Blue-bearing Leader by card number, actually is.
  const blueLeader = page
    .locator('#leader-picker [data-pick-leader]:has-text("· Blue")')
    .first();
  await blueLeader.click();
  await expect(page.locator("#leader-picker")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
  await page.locator("#open-leader-picker").click();
  await page.locator(`[data-pick-leader="${pickedLeader}"]`).click();

  const inspectedCard = await page
    .locator(".deck-card-list [data-inspect-card]")
    .first()
    .getAttribute("data-inspect-card");
  await page.locator(".deck-card-list [data-inspect-card]").first().click();
  await expect(
    page.getByRole("dialog", { name: "Card details" }),
  ).toContainText(inspectedCard!);
  await page.locator(".card-detail-close").click();
  await expect(page.getByRole("dialog", { name: "Card details" })).toHaveCount(
    0,
  );

  const catalog = page.locator(".card-catalog");
  await catalog.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const catalogScrollTop = await catalog.evaluate((element) =>
    Math.round(element.scrollTop),
  );
  await page.locator(".pool-card-list [data-inspect-card]").last().click();
  await page.locator(".card-detail-close").click();
  expect(
    await catalog.evaluate((element) => Math.round(element.scrollTop)),
  ).toBe(catalogScrollTop);

  // The overview restates the list, so it has to be read off the live panel
  // rather than the render: a figure derived once and never redrawn would pass
  // every unit test and be wrong on screen the moment a card moves.
  const curveTotal = async () =>
    (await page.locator(".cost-bar b").allInnerTexts())
      .map((text) => Number(text || 0))
      .reduce((sum, count) => sum + count, 0);
  expect(await curveTotal()).toBe(50);
  await expect(page.locator(".overview-tiles")).toHaveCount(3);

  await page.locator(".catalog-card.in-deck [data-decrease]").first().click();
  await expect(page.locator(".deck-count")).toContainText("49");
  await expect(page.locator(".deck-rule-status")).toContainText(
    "Deck needs attention",
  );
  await expect(page.locator("#save-custom")).toBeDisabled();
  expect(await curveTotal()).toBe(49);

  // Put the copy back: the editor has no reset, so the deck is built by hand.
  await page.locator(".catalog-card.in-deck [data-increase]").first().click();
  await expect(page.locator(".deck-count")).toContainText("50");
  expect(await curveTotal()).toBe(50);

  // Collapsing is the panel's answer to a short screen, and it has to survive
  // the editor's re-render on the next card added.
  await page.locator("#toggle-overview").click();
  await expect(page.locator("#deck-overview-body")).toBeHidden();
  await page.locator(".catalog-card.in-deck [data-decrease]").first().click();
  await expect(page.locator("#deck-overview-body")).toBeHidden();
  await page.locator(".catalog-card.in-deck [data-increase]").first().click();
  await page.locator("#toggle-overview").click();
  await expect(page.locator("#deck-overview-body")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.locator("#export-list").click();
  await expect(download).resolves.toMatchObject({
    _suggestedFilename: "open-optcg-deck.txt",
  });
  await page.locator("#save-custom").click();
  // The name is asked for on save, and it starts empty rather than guessing.
  await expect(page.locator("#deck-name-dialog")).toBeVisible();
  await expect(page.locator("#editor-deck-name")).toHaveValue("");
  await page.locator("#confirm-deck-name").click();
  await expect(page.locator("#deck-name-dialog")).toContainText("name");
  await page.locator("#editor-deck-name").fill("My Red Deck");
  await page.locator("#confirm-deck-name").click();

  await expect(page.locator("#p1-deck")).toHaveValue("CUSTOM-1");
  await expect(page.locator("#p1-deck-label")).toHaveText(/My Red Deck/);
  // A saved deck outlives the session: localStorage restores it next run.
  await page.reload();
  await enterSetup(page);
  await expect(
    page.locator('#p1-deck-picker [data-pick-deck][data-deck-id="CUSTOM-1"]'),
  ).toHaveText(/My Red Deck/);
  await pickDeck(page, "p1", "CUSTOM-1");
  await openMatchupConfig(page);
  await page.locator("#starting-player").selectOption("p1");
  await closeMatchupConfig(page);
  await page.getByRole("button", { name: /Start match/ }).click();
  await expect(page.locator(".decision-modal")).toBeVisible();
});

test("saving an edited deck under a new name keeps both, and a taken name warns first", async ({
  page,
}) => {
  await openSetup(page);
  const saveAs = async (name: string) => {
    await page.locator("#save-custom").click();
    await page.locator("#editor-deck-name").fill(name);
    await page.locator("#confirm-deck-name").click();
  };
  const tile = (deckId: string) =>
    page.locator(`#p1-deck-picker [data-pick-deck][data-deck-id="${deckId}"]`);
  const editSaved = async (deckId: string) => {
    await page.locator('[data-open-picker="p1"]').click();
    await openShelfOf(page, "p1", deckId);
    await page
      .locator(
        `#p1-deck-picker [data-edit-deck="p1"][data-deck-id="${deckId}"]`,
      )
      .click();
    await expect(
      page.getByRole("heading", { name: "Deck editor" }),
    ).toBeVisible();
  };

  await editSaved("(Red) Monkey.D.Luffy - Starter Deck 31");
  await saveAs("Red Rush");
  await expect(page.locator("#p1-deck")).toHaveValue("CUSTOM-1");

  // Editing that deck and saving it under another name is a second deck.
  await editSaved("CUSTOM-1");
  await expect(page.locator("#editor-deck-name")).toHaveValue("Red Rush");
  await saveAs("Red Rush v2");
  await expect(page.locator("#p1-deck")).toHaveValue("CUSTOM-2");
  await page.locator('[data-open-picker="p1"]').click();
  await expect(tile("CUSTOM-1")).toHaveText(/Red Rush/);
  await expect(tile("CUSTOM-2")).toHaveText(/Red Rush v2/);
  await page.keyboard.press("Escape");

  // A name another deck has is warned of, and nothing is written yet.
  await editSaved("CUSTOM-2");
  await saveAs("red rush");
  await expect(page.locator("#deck-name-dialog")).toBeVisible();
  await expect(page.locator("#deck-name-dialog")).toContainText(
    'You already have a deck called "Red Rush"',
  );
  await expect(page.locator("#confirm-deck-name")).toContainText(
    "Replace deck",
  );
  // Saving again under it replaces that deck, and the edited one stays.
  await page.locator("#confirm-deck-name").click();
  await expect(page.locator("#p1-deck")).toHaveValue("CUSTOM-1");
  await page.locator('[data-open-picker="p1"]').click();
  await expect(tile("CUSTOM-1")).toHaveText(/red rush/);
  await expect(tile("CUSTOM-2")).toHaveText(/Red Rush v2/);
});

test("a new deck asks how to start: from a Leader, or from a base deck", async ({
  page,
}) => {
  await openSetup(page);
  await page.locator('[data-open-picker="p1"]').click();
  await page.locator("#p1-deck-picker .deck-tile-builder").click();

  // The choice is the whole page: no catalog and no Leader dialog yet.
  await expect(page.locator(".deck-start-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "New deck" })).toBeVisible();
  await expect(page.locator(".card-catalog")).toHaveCount(0);
  await expect(page.locator("#leader-picker")).toHaveCount(0);

  // The first option leads to the Leader grid, and Back to the choice.
  await page.locator("#start-from-leader").click();
  await expect(
    page.getByRole("heading", { name: "Choose a Leader" }),
  ).toBeVisible();
  await expect(page.locator("[data-pick-leader]").first()).toBeVisible();
  await page.locator("#editor-start-back").click();
  await expect(page.getByRole("heading", { name: "New deck" })).toBeVisible();

  // The second leads to the deck grid; picking one opens the editor on a
  // copy of that deck, with its 50 cards and its Leader in place.
  await page.locator("#start-from-base").click();
  await expect(
    page.getByRole("heading", { name: "Choose a base deck" }),
  ).toBeVisible();
  await page
    .locator('[data-pick-base="(Blue) Kuzan - Starter Deck 33"]')
    .click();
  await expect(
    page.getByRole("heading", { name: "Deck editor" }),
  ).toBeVisible();
  await expect(page.locator(".deck-count b")).toHaveText("50");
  await expect(
    page.locator(".editor-leader-card .leader-summary strong"),
  ).toHaveText("Kuzan");
  // Saving a copy asks for a name, as a new deck of the player's own.
  await page.locator("#save-custom").click();
  await expect(page.locator("#editor-deck-name")).toHaveValue("");
  await page.locator("#cancel-deck-name").click();

  // Back out and take the other door: a Leader picked from the grid opens
  // the editor on an empty list of that Leader's colours.
  await page.locator("#editor-back").click();
  await page.locator('[data-open-picker="p1"]').click();
  await page.locator("#p1-deck-picker .deck-tile-builder").click();
  await page.locator("#start-from-leader").click();
  await page.locator('[data-pick-leader="ST21-001"]').click();
  await expect(
    page.getByRole("heading", { name: "Deck editor" }),
  ).toBeVisible();
  await expect(page.locator(".deck-count b")).toHaveText("0");
  await expect(page.locator("#leader-picker")).toBeHidden();
  await expect(page.locator(".pool-card-list .catalog-card")).not.toHaveCount(
    0,
  );
});

test("deck editor filters narrow the pool and survive their own re-render", async ({
  page,
}) => {
  await openSetup(page);
  // A preset, so there is a pool to search through.
  await page.locator('[data-open-picker="p1"]').click();
  await openShelfOf(page, "p1", "(Red) Monkey.D.Luffy - Starter Deck 31");
  await page
    .locator(
      '#p1-deck-picker [data-edit-deck="p1"][data-deck-id="(Red) Monkey.D.Luffy - Starter Deck 31"]',
    )
    .click();
  await expect(
    page.getByRole("heading", { name: "Deck editor" }),
  ).toBeVisible();

  const poolCards = page.locator(".pool-card-list .catalog-card");
  // Said only while something is filtered, which makes it the signal that a
  // filter has landed: the pool redraws after the typing settles, not on the
  // keystroke.
  const count = page.locator(".catalog-count");
  await expect(count).toHaveCount(0);
  const full = await poolCards.count();

  // The redraw replaces the very input being typed into; the caret has to
  // survive the swap or the letters land back to front.
  const search = page.locator("#card-search");
  await search.pressSequentially("as", { delay: 50 });
  await expect(search).toHaveValue("as");
  await search.press("Backspace");
  await expect(search).toHaveValue("a");
  await expect(count).toHaveCount(1);
  await search.fill("");
  await expect(count).toHaveCount(0);
  await expect(poolCards).toHaveCount(full);

  // The second box asks what a card does, and the first cannot answer it: no
  // Red card is named "Blocker".
  await page.locator("#card-text").fill("Blocker");
  await expect(count).toHaveCount(1);
  expect(await poolCards.count()).toBeLessThan(full);
  await page.locator("#card-text").fill("");
  await expect(count).toHaveCount(0);

  // Cost bounds cut the pool from both ends, and the two bands partition it.
  await page.locator("#card-cost-max").fill("3");
  await expect(count).toHaveCount(1);
  const cheap = await poolCards.count();
  await page.locator("#card-cost-max").fill("");
  await expect(count).toHaveCount(0);
  await page.locator("#card-cost-min").fill("4");
  await expect(count).toHaveCount(1);
  expect(cheap + (await poolCards.count())).toBe(full);
  await expect(count).toHaveText(`${await poolCards.count()} of ${full} cards`);
  await page.locator("#card-cost-min").fill("");
  await expect(count).toHaveCount(0);

  // Card type is a dropdown of its own, resting on "All types", and a Red
  // Leader's pool has all three. Its colours are one, so no colour menu is
  // offered at all.
  await expect(page.locator("#card-colors")).toHaveCount(0);
  const types = page.locator("#card-types");
  await expect(types.locator("summary")).toHaveText("All types");
  await types.locator("summary").click();
  await page.locator("label:has(#card-type-event)").click();
  await expect(count).toHaveCount(1);
  const withoutEvents = await poolCards.count();
  expect(withoutEvents).toBeLessThan(full);
  // The menu survives the redraw its own tick caused, which is what lets two
  // types be turned off in a row.
  await expect(types).toHaveAttribute("open", "");
  await page.locator("label:has(#card-type-stage)").click();
  expect(await poolCards.count()).toBeLessThanOrEqual(withoutEvents);
  await expect(types.locator("summary")).toHaveText("Character");

  // Select all puts every type back, and the menu closes on a click outside.
  await types.getByRole("button", { name: "Select all" }).click();
  await expect(types.locator("summary")).toHaveText("All types");
  await expect(count).toHaveCount(0);
  await expect(poolCards).toHaveCount(full);
  await page.locator(".deck-editor-header h1").click();
  await expect(types).not.toHaveAttribute("open", "");
});

test("persistent End turn control passes priority", async ({ page }) => {
  // Gated but not yet frozen: the opponent still has to answer its own
  // mulligan for the match to reach the main phase at all.
  await gateAiWorker(page);
  await enterMainPhase(page);
  // The seam says the turn and whose it is, and nothing else: the phase and the
  // step were a second sentence in a place with room for one.
  // The dot between the two is drawn by the stylesheet, so the text is the
  // pair -- and, under it, where the match's time limit falls.
  await expect(page.locator(".turn-status")).toHaveText(
    "Turn 1Your turnTime is called at turn 20",
  );
  const endTurn = page.getByRole("button", { name: "End turn", exact: true });
  await expect(endTurn).toHaveClass(/end-turn-available/);
  // The cost area is drawn as the cards in it, so a count is a card count, and
  // the two counts sit beside the label rather than on the cards.
  await expect(page.locator("#active-don .don-slot.active")).toHaveCount(1);
  await expect(page.locator("#active-don .don-slot.rested")).toHaveCount(0);
  await expect(
    page.locator(".self-board .don-deck-zone .don-card"),
  ).toHaveCount(1);
  await expect(page.locator(".self-board .don-deck-zone")).toContainText("9");
  await expect(page.locator("#active-don")).toContainText("Cost area");
  // Which way a DON!! lies is the readout, so the zone prints no figures: the
  // counts live on where a reader that cannot see the cards will find them.
  await expect(page.locator("#active-don")).toHaveAttribute(
    "aria-label",
    "1 active, 0 rested, 9 in DON!! deck",
  );

  await page.locator("#active-don").click();
  await page
    .locator(".card-action-modal")
    .getByRole("button", { name: /Choose recipient/ })
    .click();
  // "Choose recipient" hands the board over: the legal recipients light up and
  // the recipient is clicked there, not out of a list.
  await expect(page.locator(".table.targeting")).toHaveCount(1);
  await expect(page.locator('[data-instance="p1-leader"]')).toHaveClass(
    /valid-target/,
  );
  await page.locator('[data-instance="p1-leader"]').click();
  await expect(endTurn).toHaveClass(/end-turn-ready/);
  // The turn line holds its own two halves and the time limit, nothing else.
  await expect(page.locator(".turn-status")).toHaveText(
    "Turn 1Your turnTime is called at turn 20",
  );

  // Freeze before handing over, so "Opponent thinking" is a state the test can
  // assert on rather than one the AI races past.
  await freezeAi(page);
  await endTurn.click();

  await expect(
    page.getByRole("button", { name: "End turn", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".turn-status")).toContainText("Opponent turn");
  // The cell stays: it is the same hexagon in the same place, saying what the
  // board is doing rather than disappearing until it is yours to end again.
  const waiting = page.locator(".board-hub .hub-waiting");
  await expect(waiting).toHaveText("Waiting");
  await expect(waiting).toBeDisabled();
  await expect(waiting).toHaveAttribute("title", "Waiting for the opponent");
});

test("active DON counter attaches multiple DON to one recipient", async ({
  page,
}) => {
  await enterMainPhase(page);
  await page.getByRole("button", { name: "End turn", exact: true }).click();

  const turnStatus = page.locator(".turn-status");
  const opponentNotice = page.locator(".opponent-action-modal");
  for (let action = 0; action < 20; action += 1) {
    if ((await turnStatus.textContent())?.includes("Your turn")) break;
    await expect(opponentNotice).toBeVisible();
    await opponentNotice
      .getByRole("button", { name: "OK", exact: true })
      .click();
  }
  await expect(turnStatus).toContainText("Your turn");
  await expect(page.locator("#active-don .don-slot.active")).toHaveCount(3);

  await page.locator("#active-don").click();
  const modal = page.locator(".card-action-modal");
  const quantity = modal.getByRole("group", { name: "DON!! to attach" });
  await quantity.getByTitle("Attach one more DON!!").click();
  await quantity.getByTitle("Attach one more DON!!").click();
  await expect(quantity.locator("output")).toHaveText("3");
  await modal.getByRole("button", { name: /Choose recipient/ }).click();

  await expect(
    modal.getByRole("heading", { name: "Choose a recipient" }),
  ).toBeVisible();
  await expect(modal).toHaveClass(/targeting-bar/);
  await expect(modal).toContainText("attach 3 DON!! to");
  // The character area isolates, so a lit Character there cannot rise above the
  // dimming wash on its own the way a Leader elsewhere on the mat does: the row
  // is lifted over the wash for as long as the board is the question.
  await expect(page.locator(".self-board .character-row")).toHaveCSS(
    "z-index",
    "4",
  );
  const recipient = page.locator('[data-instance="p1-leader"]');
  await expect(recipient).toHaveClass(/valid-target/);
  await recipient.click();

  await expect(
    page.locator('[data-instance="p1-leader"] .don-badge'),
  ).toContainText("×3");
  // Nothing left to spend: the cost area draws one dashed outline of the space
  // rather than emptying to bare mat.
  await expect(page.locator("#active-don .don-card.pile-empty")).toHaveCount(1);

  // Selecting the recipient reads its *live* power: the stats column says 8k
  // where the card prints 5k, and the breakdown inside that same power tile
  // says which effect paid the difference.
  await page.locator('[data-instance="p1-leader"]').click();
  const selection = page.locator(".card-action-modal");
  await expect(selection.locator(".card-action-stats")).toContainText(
    "Power 8k",
  );
  const breakdown = selection.locator(
    ".card-action-stats .rule-stats .power-breakdown",
  );
  await expect(breakdown).toContainText("Printed power");
  await expect(breakdown).toContainText("Attached DON!!");
  await expect(breakdown).toContainText("+3k");

  // A card with more to offer than fits -- a Leader with several activations
  // and an attack -- runs out of room inside its own column: the action list
  // scrolls and the modal does not grow, so the card keeps its size.
  await expect(selection.locator(".card-action-text .action-list")).toHaveCSS(
    "overflow-y",
    "auto",
  );
  await expect(selection).toHaveCSS("overflow", "hidden");
  const overflowed = await selection.evaluate(
    (element) => element.scrollHeight > element.clientHeight,
  );
  expect(overflowed).toBe(false);
});

test("both public trash zones can be inspected", async ({ page }) => {
  await enterMainPhase(page);

  await page.getByRole("button", { name: "Inspect your trash" }).click();
  const ownTrash = page.getByRole("dialog", { name: "Your trash" });
  await expect(ownTrash).toBeVisible();
  await expect(ownTrash).toContainText("Public zone");
  await expect(ownTrash).toContainText("No cards in trash.");
  await ownTrash.getByTitle("Close").click();

  await page.getByRole("button", { name: "Inspect opponent's trash" }).click();
  const opponentTrash = page.getByRole("dialog", {
    name: "Opponent's trash",
  });
  await expect(opponentTrash).toBeVisible();
  await expect(opponentTrash).toContainText("Public zone");
});

test("opponent actions pause in one acknowledged modal", async ({ page }) => {
  await enterMainPhase(page);
  await page.getByRole("button", { name: "End turn", exact: true }).click();

  const notice = page.locator(".opponent-action-modal");
  await expect(notice).toBeVisible();
  await expect(
    notice.getByRole("heading", { name: "Opponent action" }),
  ).toBeVisible();
  // Every step is a row of the one list, and each row that has a card draws it.
  await expect(notice.locator(".opponent-action-steps > *")).not.toHaveCount(0);
  await expect(notice.locator(".opponent-action-card").first()).toBeVisible();
  await expect(
    notice.getByRole("img", { name: /card art/ }).first(),
  ).toHaveCount(0);
  await notice
    .getByRole("button", { name: /View .* details/ })
    .first()
    .click();
  const cardDetails = page.getByRole("dialog", { name: "Card details" });
  await expect(cardDetails).toBeVisible();
  await expect(cardDetails.locator(".card-text")).toBeVisible();
  await cardDetails.getByTitle("Close").click();
  await expect(cardDetails).toHaveCount(0);
  await expect(notice).toBeVisible();
  const message = await notice.locator(".opponent-action-steps").textContent();

  await page.waitForTimeout(900);
  await expect(notice.locator(".opponent-action-steps")).toHaveText(
    message ?? "",
  );
  await notice.getByRole("button", { name: "OK", exact: true }).click();
  await expect(notice).toBeHidden();

  let attackPairFound = false;
  let advancedPlayerTurn = false;
  for (let actionCount = 0; actionCount < 24; actionCount += 1) {
    if (await notice.isVisible()) {
      // An attack is drawn as the same cause-and-subject pair every effect is,
      // so what it did is in the pair's middle column, not in the step list.
      const attackPair = notice.locator(".opponent-action-pair", {
        hasText: "Attacked for",
      });
      if ((await attackPair.count()) > 0) {
        await expect(attackPair).toHaveCount(1);
        await expect(attackPair.locator("figcaption span")).toHaveText([
          "Attacker",
          "Target",
        ]);
        await expect(attackPair.locator(".pair-direction")).toContainText(
          /Attacked for \d+k/,
        );
        attackPairFound = true;
        break;
      }
      await notice.getByRole("button", { name: "OK", exact: true }).click();
    } else if (!advancedPlayerTurn) {
      const endTurn = page.getByRole("button", {
        name: "End turn",
        exact: true,
      });
      if (await endTurn.isVisible()) {
        await endTurn.click();
        advancedPlayerTurn = true;
      }
    }
    await page.waitForTimeout(500);
  }
  expect(attackPairFound).toBe(true);
});

/**
 * A restriction is written on the *player*, so there is no card on the board
 * for it to sit on and nothing about the mat changes when it lands. This one
 * used to reach the other seat as the discard that paid for it -- one card
 * going to the trash for no stated reason -- and then as [On Play] effects
 * quietly not happening for two turns.
 *
 * ST-27's Leader (OP09-081 Marshall.D.Teach) is the deck the case was reported
 * against: it trashes a card to switch the opponent's [On Play] effects off
 * until the end of their next turn, and pays for it by never getting one of
 * its own.
 */
test("a restriction on the player is announced, and the cards it silences say so", async ({
  page,
}) => {
  await openSetup(page);
  await openMatchupConfig(page);
  await page.locator("#starting-player").selectOption("p1");
  await page.locator("#seed").fill(seed);
  await closeMatchupConfig(page);
  await page.evaluate(() => {
    const write = (id: string, value: string) => {
      const field = document.querySelector<HTMLInputElement>(`#${id}`);
      if (!field) throw new Error(`no #${id} on the form`);
      field.value = value;
    };
    write("p1-deck", "(Red) Monkey.D.Luffy - Starter Deck 31");
    write("p2-deck", "(Black) Marshall.D.Teach - Starter Deck 27");
  });
  await page.getByRole("button", { name: /Start match/ }).click();
  await expect(page.locator(".decision-modal")).toBeVisible();
  await page.getByRole("button", { name: /Keep these cards/ }).click();

  // Which turn the agent pays for the clause on is its own decision, so the
  // test hands the turn over until it does rather than assuming a turn.
  const notice = page.locator(".opponent-action-modal");
  const announced = notice.getByText(/\[On Play\] effects are negated/);
  const turnStatus = page.locator(".turn-status");
  const endTurn = page.getByRole("button", { name: "End turn", exact: true });
  for (let step = 0; step < 400 && !(await announced.isVisible()); step += 1) {
    if (await notice.isVisible()) {
      await notice.getByRole("button", { name: "OK", exact: true }).click();
      continue;
    }
    if ((await turnStatus.textContent())?.includes("Your turn")) {
      if (await endTurn.isVisible()) await endTurn.click();
      else await page.waitForTimeout(200);
      continue;
    }
    await page.waitForTimeout(200);
  }
  // Drawn against the Leader that did it, beside the discard that bought it.
  await expect(announced).toBeVisible();
  await expect(notice.locator(".opponent-action-single")).toContainText(
    /Your \[On Play\] effects are negated through turn \d+/,
  );
  await notice.getByRole("button", { name: "OK", exact: true }).click();

  // And the hand says which plays it costs. Only the cards that print an
  // [On Play] are marked: the deck's Events are untouched by the clause, and
  // a badge on all five would say nothing about any of them.
  const hand = page.locator(".hand-cards .game-card");
  await expect(hand.locator(".on-play-off-badge")).not.toHaveCount(0);
  await expect(
    hand
      .filter({ hasNot: page.locator(".on-play-off-badge") })
      .filter({ hasText: "Gum-Gum Gatling Gun" }),
  ).not.toHaveCount(0);
  // Both Leaders carry it: the opponent's for good, this side's for the turn.
  await expect(page.locator(".mat-leader .on-play-off-badge")).toHaveCount(2);
});

test("a newer pack loads from the Configure dialog and survives a reload", async ({
  page,
}) => {
  await loadTextPack(page, {
    "OP01-016": { effect: "[On Play] Folder text naming [Nami]." },
    "ST31-001": { effect: "[On Play] Second card." },
  });
  await page.reload();
  await expect(
    page.locator(".dialog-assets .home-assets-status"),
  ).toContainText("printed text for 2 cards");
});

test("the card popup says when the loaded pack has no text for a card", async ({
  page,
}) => {
  await enterMainPhase(page);
  await page.locator(".hand-cards .game-card").first().click();
  const modal = page.locator(".card-action-modal");
  await expect(modal.locator(".card-text-missing")).toContainText(
    "not in the loaded asset pack",
  );
  await expect(modal.locator(".card-keyword-timing")).toHaveCount(0);
});

test.describe("before any asset pack is loaded", () => {
  test.use({ assetPack: false });

  test("the asset gate is the whole app", async ({ page }) => {
    await page.goto(appUrl);
    await expect(
      page.getByRole("heading", { name: "Load the card art and text" }),
    ).toBeVisible();
    await expect(page.locator("#setup-form")).toHaveCount(0);
    // One control, the zip the Get cards bookmark saves.
    await expect(page.locator("[data-asset-zip]")).toHaveCount(1);
    await expect(page.locator("[data-asset-folder]")).toHaveCount(0);
    await expect(page.locator("[data-get-cards]")).toHaveAttribute(
      "href",
      /^javascript:/,
    );
    // And no way round it: the mode fan is behind the gate as well.
    await page.goto(modesUrl);
    await expect(page.locator("[data-home-mode]")).toHaveCount(0);
  });

  test("the bookmark can be copied where it cannot be dragged", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: (text: string) => {
            (window as unknown as { copied: string }).copied = text;
            return Promise.resolve();
          },
        },
      });
    });
    await page.goto(appUrl);
    await page.getByRole("button", { name: "Copy the bookmark" }).click();
    await expect(page.locator("[data-copy-status]")).toHaveText("Copied.");
    expect(
      await page.evaluate(
        () => (window as unknown as { copied: string }).copied,
      ),
    ).toBe(await page.locator("[data-get-cards]").getAttribute("href"));
    await expect(page.locator("[data-bookmarklet-code]")).toBeHidden();
  });

  test("a refused clipboard shows the bookmark's code to copy by hand", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("denied")) },
      });
    });
    await page.goto(appUrl);
    await page.getByRole("button", { name: "Copy the bookmark" }).click();
    const code = page.locator("[data-bookmarklet-code]");
    await expect(code).toBeVisible();
    await expect(code).toHaveValue(/^javascript:/);
  });

  test("text without art is not enough to play", async ({ page }) => {
    await page.goto(appUrl);
    await page
      .locator("[data-asset-zip]")
      .setInputFiles(
        await writePackZip({ "OP01-016": { effect: "[On Play] Text." } }),
      );
    await expect(page.locator(".home-assets-notice")).toContainText(
      "missing the card images",
    );
    await expect(page.locator("#setup-form")).toHaveCount(0);
  });

  test("the zip the bookmark saves opens the lobby, and stays loaded", async ({
    page,
  }) => {
    await page.goto(appUrl);
    await page
      .locator("[data-asset-zip]")
      .setInputFiles(
        await writePackZip({ "OP01-016": { effect: "[On Play] Text." } }, [
          "OP01-016",
        ]),
      );
    await enterSetup(page);
    await page.reload();
    await enterSetup(page);
    await expect(page.locator(".asset-gate")).toHaveCount(0);
  });
});

test("card actions and details share one modal without an extra click", async ({
  page,
}) => {
  await loadTextPack(page, {
    "OP01-016": { effect: "[On Play] Test text naming [Nami]." },
  });
  await enterMainPhase(page);
  await expect(
    page.getByRole("button", { name: "End turn", exact: true }),
  ).toBeVisible();
  await expect(page.getByTitle("Rule inspector")).toHaveCount(0);
  await expect(page.getByTitle("All legal actions")).toHaveCount(0);
  const hand = page.locator(".hand-cards .game-card");
  const nami = hand.filter({ hasText: "OP01-016" });

  await expect(nami).toHaveCount(1);
  // The card face carries cost, number and name only. Power and counter used
  // to be printed on every card permanently; they are now the modal's job, and
  // the on-card overlay is reserved for a power that is actually modified --
  // which nothing in hand can be.
  await expect(nami).toContainText("OP01-016");
  await expect(nami).toContainText("Nami");
  await expect(nami.locator(".power-overlay")).toHaveCount(0);
  await nami.click();

  const modal = page.locator(".card-action-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toHaveClass(/dismissable-choice-modal/);
  const modalBox = await modal.boundingBox();
  const viewport = page.viewportSize();
  expect(modalBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(
    Math.abs(modalBox!.x + modalBox!.width / 2 - viewport!.width / 2),
  ).toBeLessThanOrEqual(1);
  await expect(page.locator(".context-tray")).toHaveCount(0);
  await expect(hand).toHaveCount(5);
  await expect(nami).toHaveClass(/selected-source/);
  // The action is named by what it does, not by the card: the card is the
  // subject of the whole modal, printed at full size a column away.
  await expect(
    modal.getByRole("button", { name: "Play card", exact: true }),
  ).toBeVisible();
  // The panel is the card and its offers. The card is drawn big enough to
  // read its own numbers and words, so the tiles, the type line and the
  // printed text are not repeated beside it -- a tile comes back only when
  // the engine's number differs from the printed one, and nothing in hand
  // can be modified.
  const preview = modal.locator(".selection-card-preview .game-card");
  await expect(preview).toHaveCount(1);
  const previewBox = await preview.boundingBox();
  const rem = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  expect(previewBox!.height).toBeGreaterThanOrEqual(14 * rem);
  await expect(modal.locator(".rule-stats")).toBeHidden();
  await expect(modal.locator(".rule-types")).toBeHidden();
  await expect(modal.locator(".card-action-text > .card-text")).toBeHidden();
  await expect(modal).not.toContainText("View details");

  // A selected card is not a choice the game is waiting on, so its X closes for
  // good: no "Review choice" button is left behind to come back to.
  await modal.getByRole("button", { name: "Close" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review choice" })).toHaveCount(
    0,
  );
  await nami.click();
  await expect(
    modal.getByRole("button", { name: "Play card", exact: true }),
  ).toBeVisible();

  await modal.getByRole("button", { name: "Play card", exact: true }).click();
  await expect(hand).toHaveCount(4);
  const decision = page.locator(".decision-modal");
  await expect(decision).toBeVisible();
  await expect(decision.getByRole("heading")).toHaveText(
    "Resolve Nami's card effect",
  );
  // The card's full printed text is not repeated here: the heading names the
  // card, and each option already says what taking it does.
  await expect(decision.locator(".effect-description")).toHaveCount(0);
  await expect(
    decision.getByText("resolve effect", { exact: true }),
  ).toHaveCount(0);
  await expect(decision.locator(".effect-add")).toHaveCount(5);
  await expect(decision.locator(".effect-card-choice")).toHaveCount(5);
  await expect(decision.locator(".effect-card-choice .game-card")).toHaveCount(
    5,
  );
  await expect(
    decision.locator(".effect-card-choice .game-card").first(),
  ).toHaveAttribute("aria-label");
  // A decision the game *is* waiting on can be stashed and come back: its X
  // leaves the "Review choice" button in the corner.
  await decision.getByRole("button", { name: "Close" }).click();
  await expect(decision).toHaveCount(0);
  const reviewChoice = page.getByRole("button", { name: "Review choice" });
  await expect(reviewChoice).toBeVisible();
  await page.locator(".self-board .game-card.leader").click();
  const cardDetails = page.getByRole("dialog", { name: "Card details" });
  await expect(cardDetails).toBeVisible();
  // The popup titles the card the way the in-game modal does: name, then the
  // number that tells two printings apart.
  await expect(cardDetails.getByRole("heading")).toHaveText(
    /^Monkey\.D\.Luffy · \w+-\d+$/,
  );
  await cardDetails.getByTitle("Close").click();
  await reviewChoice.click();
  await expect(decision.locator(".effect-card-choice")).toHaveCount(5);
  const passOption = decision.getByRole("button", { name: /Add no card/ });
  await expect(passOption).toHaveClass(/effect-pass/);
  await expect(passOption).toHaveCSS("grid-column-start", "auto");
  await expect(passOption).toHaveCSS("grid-column-end", "auto");
});

/**
 * The modal's whole job is to offer the card's actions, and it used to open
 * with them below its own fold: the action for the selected card repeated that
 * card's art in a tall button, under a full-width rule block that left half the
 * surface empty. Asserted at the shortest window the board supports, because
 * the surface is capped by the viewport as well as by its own max-height.
 */
test("the card action modal opens with its actions in view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await enterMainPhase(page);
  const hand = page.locator(".hand-cards .game-card");
  await hand.filter({ hasText: "OP01-016" }).click();

  const modal = page.locator(".card-action-modal");
  const play = modal.getByRole("button", { name: "Play card", exact: true });
  await expect(play).toBeVisible();
  // The card is previewed at full size a column away; repeating its art inside
  // its own action button is what cost the height.
  await expect(modal.locator(".context-actions .game-card")).toHaveCount(0);
  await expect(modal.locator(".selection-card-preview .game-card")).toHaveCount(
    1,
  );
  // Nothing is reachable only by scrolling the surface.
  expect(
    await modal.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    ),
  ).toBeLessThanOrEqual(1);
  const modalBox = await modal.boundingBox();
  const playBox = await play.boundingBox();
  expect(modalBox).not.toBeNull();
  expect(playBox).not.toBeNull();
  expect(playBox!.y + playBox!.height).toBeLessThanOrEqual(
    modalBox!.y + modalBox!.height,
  );
});

test("targeted Main actions show their recipient cards", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 595 });
  await openSetup(page);
  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p2Deck: "(Green) Roronoa Zoro - Starter Deck 32",
      p1Controller: "human",
      p2Controller: "human",
      seed: "browser-parity-v1",
      startingPlayer: "p1",
    },
    actions: [
      "r0:mulligan:keep",
      "r1:mulligan:keep",
      "r2:play:2:p1-card-1",
      "r3:effect:p1-card-7",
      "r4:effect:order:0,1,2,3",
      "r5:pass",
      "r6:play:5:p2-card-45",
      "r7:pass",
      "r8:attach:p1-leader",
      "r9:play:1:p1-card-17",
      "r10:effect:search-select:p1-card-22",
      "r11:play:1:p1-card-36",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await page.locator("#trace-input").setInputFiles({
    name: "sunny-targets-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();
  const leaderBox = await page
    .locator(".self-board .game-card.leader")
    .boundingBox();
  const characterBoxes = await page
    .locator(".self-board .character-row .game-card")
    .evaluateAll((cards) =>
      cards.map((card) => {
        const box = card.getBoundingClientRect();
        return { bottom: box.bottom };
      }),
    );
  expect(leaderBox).not.toBeNull();
  expect(
    Math.max(...characterBoxes.map((box) => box.bottom)),
  ).toBeLessThanOrEqual(leaderBox?.y ?? 0);
  await page.locator('.game-card:has-text("ST31-005")').click();

  const modal = page.locator(".card-action-modal");
  await expect(
    modal.getByRole("heading", { name: "Thousand Sunny" }),
  ).toBeVisible();
  // One offer, not one per recipient. Thousand Sunny's clause moved onto the
  // mechanic DSL with the rest of the activation register, and the DSL asks
  // "which card" as its own step -- so the card panel has a single button and
  // no target picker to open. The picker itself is unchanged and still
  // answers every offer that names its target: `attach-don` below, and the
  // Enel Leader's activation.
  await expect(modal.locator(".target-card-choice")).toHaveCount(0);
  await expect(
    modal.locator('[data-open-targets="activate-main"]'),
  ).toHaveCount(0);
  const activate = modal.locator(".action-button.activate-main");
  await expect(activate).toHaveCount(1);
  await expect(activate).toContainText("Activate: Main");

  await activate.click();
  // The recipient is the next decision, and it names the cards it is choosing
  // between -- the Leader and the Character that share the printed
  // [Monkey.D.Luffy] identity the clause asks for.
  const recipients = page.locator(".action-button.resolve-effect");
  await expect(
    recipients.filter({ hasText: "Monkey.D.Luffy" }),
  ).not.toHaveCount(0);
});

test("opponent DON attachments name and show their recipient", async ({
  page,
}) => {
  await openSetup(page);
  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Blue/Yellow) Nami - Official Feature Deck",
      p2Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "1",
      startingPlayer: "random",
    },
    // Through the opponent's turn 2 and p1's turn 3, both passed: the rules
    // agent attaches nothing on a turn nothing can attack, so the DON!! this
    // test watches for is the one its turn 4 gives the Leader before it
    // swings, and the notice is waiting at p1's block step.
    actions: [
      "r0:mulligan:mulligan",
      "r1:mulligan:keep",
      "r2:pass",
      "r3:play:0:p2-card-1",
      "r4:effect:p2-card-23",
      "r5:effect:order:0,1,2,3",
      "r6:activate:mechanic-main:p2-card-1",
      "r7:effect:skip",
      "r8:activate:mechanic-event:p2-card-50",
      "r9:effect:skip",
      "r10:pass",
      "r11:pass",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await page.locator("#trace-input").setInputFiles({
    name: "opponent-don-attachment-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();

  const notice = page.locator(".opponent-action-modal");
  await expect(notice).toBeVisible();
  // The DON!! goes to the card, so the step is drawn on it: the Leader's face,
  // and the mark and the verb beside it. Naming the card in a sentence as well
  // was the same card said twice.
  const donRow = notice.locator(".opponent-action-single", {
    hasText: "Given 1 DON!!",
  });
  await expect(donRow).toHaveCount(1);
  await expect(
    donRow.getByRole("button", { name: "View Monkey.D.Luffy details" }),
  ).toBeVisible();
});

test("an attack picks its target on the board, and can be backed out of", async ({
  page,
}) => {
  await openSetup(page);
  // The same position the power-change test replays, stopped one action before
  // its first attack: p1 is human, in its Main Phase, with a Leader that can
  // swing.
  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Blue/Yellow) Nami - Official Feature Deck",
      p2Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "1",
      startingPlayer: "random",
    },
    actions: [
      "r0:mulligan:mulligan",
      "r1:mulligan:keep",
      "r2:pass",
      "r3:attach:p2-leader",
      "r4:play:0:p2-card-1",
      "r5:effect:p2-card-23",
      "r6:effect:order:0,1,2,3",
      "r7:activate:mechanic-main:p2-card-1",
      "r8:effect:p2-leader",
      "r9:pass",
      "r10:attach:p1-leader",
      "r11:attach:p1-leader",
      "r12:attach:p1-leader",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await freezeAi(page);
  await page.locator("#trace-input").setInputFiles({
    name: "attack-picker-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();

  await page.locator('[data-instance="p1-leader"]').click();
  const modal = page.locator(".card-action-modal");
  const attack = modal.locator('[data-open-targets="attack"]');
  await expect(attack).toContainText("Attack");
  // Step one is the decision to attack at all; nothing on the board is lit
  // until it has been made.
  await expect(page.locator(".table.targeting")).toHaveCount(0);
  await expect(page.locator(".game-card.valid-target")).toHaveCount(0);

  await attack.click();
  // Step two is the board itself: the panel drops to a corner bar, the legal
  // targets light up and everything else dims.
  await expect(modal).toHaveClass(/targeting-bar/);
  await expect(page.locator(".table.targeting")).toHaveCount(1);
  await expect(modal).toContainText("1 legal target lit");
  const target = page.locator('[data-instance="p2-leader"]');
  await expect(page.locator(".game-card.valid-target")).toHaveCount(1);
  await expect(target).toHaveClass(/valid-target/);

  // Backing out costs a click, not a declared attack.
  await modal.getByRole("button", { name: "targeting Cancel attack" }).click();
  await expect(page.locator(".game-card.valid-target")).toHaveCount(0);
  await expect(attack).toBeVisible();

  await attack.click();
  await target.click();
  // The attack is declared off the board, so the card panel is done.
  await expect(modal).toHaveCount(0);
});

test("opponent power changes name the source and target cards", async ({
  page,
}) => {
  await openSetup(page);
  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Blue/Yellow) Nami - Official Feature Deck",
      p2Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "1-53",
      startingPlayer: "random",
    },
    actions: [
      "r0:mulligan:mulligan",
      "r1:mulligan:mulligan",
      "r2:pass",
      "r3:play:1:p2-card-15",
      "r4:effect:search-select:p2-card-32",
      "r5:pass",
      "r6:play:5:p1-card-1",
      "r7:attach:p1-leader",
      "r8:attach:p1-leader",
      "r9:attack:p1-leader:p2-leader",
      "r10:pass-block",
      "r11:pass-counter",
      "r12:trigger:skip",
      "r13:effect:apply",
      "r14:pass",
      "r15:play:3:p2-card-29",
      "r16:attack:p2-leader:p1-leader",
      "r17:effect:p1-card-29",
      "r18:pass-block",
      "r19:pass-counter",
      "r20:pass",
      "r21:play:1:p1-card-35",
      "r22:attack:p1-leader:p2-leader",
      "r23:pass-block",
      "r24:pass-counter",
      "r25:effect:apply",
      "r26:pass",
      "r27:attach:p2-leader",
      "r28:play:7:p2-card-6",
      "r29:effect:p2-card-26",
      "r30:activate:mechanic-main:p2-leader",
      "r31:effect:p2-card-6",
      "r32:attack:p2-card-6:p1-leader",
      "r33:pass-block",
      "r34:pass-counter",
      "r35:trigger:skip",
      "r36:attack:p2-leader:p1-leader",
      "r37:pass-block",
      "r38:pass-counter",
      "r39:trigger:skip",
      "r40:pass",
      "r41:play:1:p1-card-30",
      "r42:effect:apply",
      "r43:play:2:p1-card-10",
      "r44:effect:apply",
      "r45:effect:p1-card-16",
      "r46:effect:p2-card-29",
      "r47:attack:p1-leader:p2-leader",
      "r48:pass-block",
      "r49:counter:p2-card-27",
      "r50:pass-counter",
      "r51:attack:p1-card-35:p2-card-6",
      "r52:pass-block",
      "r53:pass-counter",
      "r54:pass",
      "r55:attach:p2-leader",
      "r56:play:1:p2-card-34",
      "r57:activate:mechanic-main:p2-leader",
      "r58:effect:p2-card-26",
      "r59:attack:p2-leader:p1-leader",
      "r60:effect:p1-card-25",
      "r61:pass-block",
      "r62:pass-counter",
      "r63:attack:p2-card-34:p1-leader",
      "r64:effect:p1-card-35",
      "r65:pass-block",
      "r66:counter:p1-card-4",
      "r67:pass-counter",
      "r68:attack:p2-card-26:p1-card-35",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await page.locator("#trace-input").setInputFiles({
    name: "power-change-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();

  const notice = page.locator(".opponent-action-modal");
  await expect(notice).toBeVisible();
  // A step with a cause and a subject is drawn rather than written: the card
  // whose effect fired on the left, the card it landed on on the right, and the
  // verb between them. Naming both in a sentence left the reader matching names
  // to the faces printed above it.
  const effectPair = notice.locator(".opponent-action-pair");
  await expect(effectPair).toHaveCount(1);
  await expect(effectPair.locator("figcaption span")).toHaveText([
    "Source",
    "Affected",
  ]);
  await expect(effectPair.locator(".pair-direction")).toContainText(
    "−2k power",
  );
  await expect(
    notice.getByRole("button", { name: "View Nico Robin details" }),
  ).toBeVisible();
  await expect(
    notice.getByRole("button", { name: "View Nami details" }),
  ).toBeVisible();
});

/**
 * The opening hand is the one hand a player has to read whole before choosing,
 * and a keep is decided on what the cards do rather than on their faces. A
 * phone drew it as a row of thumbnails, then as three to a row -- twice the
 * height and still no words. It reads as the hand sheet reads now: one card to
 * a row with its printed text beside it, and the modal, not the page, scrolls
 * through the five.
 */
test("a phone reads the opening hand one card to a row, with its text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMatch(page);

  const rem = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  const cards = page.locator(".mulligan-hand-preview .game-card");
  await expect(cards).toHaveCount(5);
  // Every card has its words beside it -- here the note that no pack is
  // loaded, which is what the words are until one is.
  await expect(
    page.locator(".mulligan-hand-entry .mulligan-card-text"),
  ).toHaveCount(5);

  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, height: rect.height, right: rect.right };
    }),
  );
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(8 * rem);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(390);
  }
  // One column: every card starts at the same left edge, and each one below
  // the one before it.
  for (const [index, box] of boxes.entries()) {
    expect(box.x).toBeCloseTo(boxes[0]!.x, 0);
    if (index > 0) expect(box.y).toBeGreaterThan(boxes[index - 1]!.y);
  }

  // The modal, not the page, is what scrolls: the hand is read through it and
  // both answers are at the end of the reading.
  const modal = await page.locator(".decision-modal").boundingBox();
  expect(modal).not.toBeNull();
  expect(modal!.y).toBeGreaterThanOrEqual(0);
  expect(modal!.y + modal!.height).toBeLessThanOrEqual(844);
  const keep = page.getByRole("button", { name: /Keep these cards/ });
  const redraw = page.getByRole("button", { name: /Draw a new hand/ });
  await keep.scrollIntoViewIfNeeded();
  await expect(keep).toBeVisible();
  await expect(redraw).toBeVisible();
});

test("a portrait phone shows the board rather than a rotate prompt", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMatch(page);

  await expect(page.locator(".rotate-device-notice")).toHaveCount(0);
  await expect(page.locator(".game-shell")).toBeVisible();
});

/**
 * Reading a line of the history must not play the game.
 *
 * The board binds `[data-action]` over the whole document to perform the engine
 * action it names, and a history row once carried that attribute holding the
 * *action count* it resets to. Every click on a line went to `act("6")` and the
 * board raised "Unknown action: 6" in an alert. The row is text; only the Reset
 * button beside it does anything, and only after the confirm.
 */
test("clicking a history line reads it; only Reset winds the match back", async ({
  page,
}) => {
  await enterMainPhase(page);
  const alerts: string[] = [];
  page.on("dialog", (dialog) => {
    alerts.push(dialog.message());
    void dialog.dismiss();
  });
  await page.getByTitle("Match history").click();
  const history = page.locator(".history-modal .history");
  await expect(history).toBeVisible();

  // The line itself, and the number beside it: both inert.
  await history.locator(".history-entry p").first().click();
  await history.locator(".history-ordinal").first().click();
  await expect(page.locator(".rewind-confirm-dialog")).toHaveCount(0);
  expect(alerts).toEqual([]);

  // The button is the control, and it asks before it discards anything.
  const reset = history.locator(".history-reset").first();
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(page.locator(".rewind-confirm-dialog")).toBeVisible();
  expect(alerts).toEqual([]);
  await page.locator("[data-cancel-rewind]").last().click();
  await expect(page.locator(".rewind-confirm-dialog")).toHaveCount(0);
});

/**
 * A phone used to carry its own history surface: a bottom tab bar, and a drawer
 * that sat open over the board for the whole Main phase -- half the screen
 * spent on the log, and a second "Rules" tab for an inspector the card modal
 * had already replaced. The history is one modal at every width now, opened
 * from the top bar, so the board keeps the screen until it is asked for.
 */
test("a phone opens the history from the top bar, not a standing drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterMainPhase(page);

  await expect(page.locator(".mobile-tabs")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rules" })).toHaveCount(0);
  await expect(page.locator(".mobile-drawer")).toHaveCount(0);
  await expect(page.locator(".history")).toHaveCount(0);

  const toggle = page.getByTitle("Match history");
  await expect(toggle).toBeVisible();
  await toggle.click();

  const history = page.locator(".history-modal .history");
  const viewport = page.viewportSize();
  await expect(history).toBeVisible();
  const box = await page.locator(".history-modal").boundingBox();
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);

  await page.locator(".history-modal .card-detail-close").click();
  await expect(page.locator(".history-modal")).toHaveCount(0);
});

/**
 * The cluster crosses to the left edge on a phone, and its cells kept standing
 * on the faces they take for a desktop -- the mark's *left* ones. Pushed out
 * that way from the left edge they walked off the screen, and End turn, a full
 * cell-width sideways, walked off it completely: a phone had no way to end its
 * turn at all. The turn line went the same way, hung at 175% of the shell,
 * which is a screen and three quarters below the top of a phone.
 */
test("a phone keeps the whole cluster, and the turn, on the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterMainPhase(page);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  for (const selector of [
    ".hub-brand",
    ".hub-history",
    ".hub-trace",
    ".hub-command",
    ".turn-status",
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box!.x, selector).toBeGreaterThanOrEqual(0);
    expect(box!.y, selector).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, selector).toBeLessThanOrEqual(viewport!.width);
    expect(box!.y + box!.height, selector).toBeLessThanOrEqual(
      viewport!.height,
    );
  }
  /* On the screen and reachable: the cell is a button, and the words in it are
     what a player looks for. */
  await expect(page.getByRole("button", { name: "End turn" })).toBeVisible();
  await expect(page.locator(".turn-status")).toContainText("Turn 1");
});

/**
 * The cluster is chrome, and chrome does not print over a question. At its old
 * level it drew three hexagons across the words of an open decision -- and took
 * the taps meant for them.
 */
test("a phone draws an open decision over the cluster, not under it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMatch(page);

  const modal = page.locator(".decision-modal");
  await expect(modal).toBeVisible();
  const modalBox = await modal.boundingBox();
  const hubBox = await page.locator(".hub-brand").boundingBox();
  expect(modalBox).not.toBeNull();
  expect(hubBox).not.toBeNull();
  /* The assertion below only means something where the two actually meet. */
  const overlaps =
    hubBox!.x < modalBox!.x + modalBox!.width &&
    modalBox!.x < hubBox!.x + hubBox!.width &&
    hubBox!.y < modalBox!.y + modalBox!.height &&
    modalBox!.y < hubBox!.y + hubBox!.height;
  expect(overlaps).toBe(true);

  const onTop = await page.evaluate(() => {
    const hub = document.querySelector(".hub-brand")!.getBoundingClientRect();
    const hit = document.elementFromPoint(
      hub.x + hub.width / 2,
      hub.y + hub.height / 2,
    );
    return {
      inHub: Boolean(hit?.closest(".board-hub")),
      inModal: Boolean(hit?.closest(".decision-modal")),
    };
  });
  expect(onTop).toEqual({ inHub: false, inModal: true });
});

/**
 * A phone has no room for a mat and a hand in one half, and it used to hold
 * both: the mat's cards came out a thumbnail tall and the hand a row of
 * slivers under them. The hand is off the table there now -- the mat has the
 * whole half, laid out five columns wide so the freed height becomes card
 * size -- and it comes up as a sheet from the button on the near edge. A tap
 * on a card in the sheet is a tap on the card: the sheet closes and the card's
 * own panel opens, exactly as a click on the fan does at a desktop width.
 *
 * The floors are the stylesheet's own: the sheet's card is two fifths of a
 * row, so a third of the width at least, and the phone mat's card comes out of `min(30cqh, 25.8cqw)` of a mat as wide
 * as a 390px screen -- comfortably past the 63px the six-column mat gave it,
 * which is what the 5rem floor is there to hold.
 */
test("a phone lifts the hand off the table and reads it as a sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterMainPhase(page);

  const rem = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );

  // Off the table on both sides: our fan is not drawn, and theirs is a count.
  await expect(page.locator(".self-board .hand-zone")).toBeHidden();
  await expect(page.locator(".opponent-hand-count")).toBeVisible();
  await expect(page.locator(".opponent-hand-count")).toContainText("5");

  // The mat's cards took the room the hand left.
  const leader = await page
    .locator(".self-board .mat-leader .game-card")
    .boundingBox();
  expect(leader).not.toBeNull();
  expect(leader!.height).toBeGreaterThanOrEqual(5 * rem);

  const toggle = page.locator("#hand-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText("5");
  await toggle.click();

  const cards = page.locator(".hand-sheet .game-card");
  await expect(cards).toHaveCount(5);
  // One row per card, the face beside its printed text; the sheet, not the
  // page, scrolls, so the later cards may start below the fold.
  const sheet = await page.locator(".hand-sheet").boundingBox();
  expect(sheet).not.toBeNull();
  expect(sheet!.y).toBeGreaterThanOrEqual(0);
  expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(844);
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        x: rect.x,
        right: rect.right,
      };
    }),
  );
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(0.33 * 390);
    expect(box.height).toBeGreaterThanOrEqual(11 * rem);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(390);
  }
  // Every card has its words beside it -- here the note that no pack is
  // loaded, which is what the words are until one is.
  await expect(page.locator(".hand-sheet-entry .hand-sheet-text")).toHaveCount(
    5,
  );

  // Picking a card is what the sheet is for, so the pick closes it.
  await cards.first().click();
  await expect(page.locator(".hand-sheet")).toHaveCount(0);
  await expect(page.locator(".card-action-modal")).toBeVisible();
});

/**
 * Playing a card is decided out of its text -- what it costs against what it
 * does -- and on a phone the text is only in the sheet. The offer sits under
 * the sentence it is read from, so the answer is where the question is, rather
 * than back on the table behind the card's own panel.
 */
test("a phone plays a card from the hand sheet, under its printed text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterMainPhase(page);

  // Turn 1 is one DON!!, and the opening hand costs more than that. The button
  // lights when the hand has a move, so the test hands the turn over until it
  // does rather than assuming which turn that is.
  const toggle = page.locator("#hand-toggle");
  const turnStatus = page.locator(".turn-status");
  const opponentNotice = page.locator(".opponent-action-modal");
  for (let turn = 0; turn < 4; turn += 1) {
    if (
      await toggle.evaluate((node) => node.classList.contains("hand-playable"))
    )
      break;
    await page.getByRole("button", { name: "End turn", exact: true }).click();
    for (let action = 0; action < 30; action += 1) {
      if ((await turnStatus.textContent())?.includes("Your turn")) break;
      if (await opponentNotice.isVisible())
        await opponentNotice
          .getByRole("button", { name: "OK", exact: true })
          .click();
      else await page.waitForTimeout(200);
    }
    await expect(turnStatus).toContainText("Your turn");
  }
  await expect(toggle).toHaveClass(/hand-playable/);

  await toggle.click();
  const entry = page
    .locator(".hand-sheet-entry")
    .filter({
      has: page.locator(".hand-sheet-actions .action-button.play-card"),
    })
    .first();
  const play = entry.locator(".action-button.play-card").first();
  await play.scrollIntoViewIfNeeded();
  await expect(play).toBeVisible();

  // Under the words, not beside them: the offer starts below the text it was
  // read out of.
  const text = await entry.locator(".hand-sheet-text").boundingBox();
  const offer = await play.boundingBox();
  expect(text).not.toBeNull();
  expect(offer).not.toBeNull();
  expect(offer!.y).toBeGreaterThanOrEqual(text!.y + text!.height - 1);

  const before = await page.locator(".hand-sheet .game-card").count();
  await play.click();
  // The card is played from the sheet itself: the sheet closes and the hand is
  // one card shorter. Whatever the card asks for next -- here an [On Play]
  // choice -- is asked on the board, which is why the count is read off the
  // button rather than by opening the sheet again.
  await expect(page.locator(".hand-sheet")).toHaveCount(0);
  await expect(page.locator("#hand-toggle")).toHaveAttribute(
    "aria-label",
    new RegExp(`Show hand, ${before - 1} cards`),
  );
});

/**
 * A desktop keeps the hand on the table, so neither the button nor the count
 * is drawn there -- the markup is, hidden, which is what lets one render serve
 * both widths.
 */
test("a desktop keeps the hand on the table and shows no hand button", async ({
  page,
}) => {
  await enterMainPhase(page);
  await expect(page.locator(".self-board .hand-row .game-card")).toHaveCount(5);
  await expect(page.locator("#hand-toggle")).toBeHidden();
  await expect(page.locator(".opponent-hand-count")).toBeHidden();
});

/**
 * A phone browser discards a background tab whenever it wants the memory, and
 * a match that lived only in the page's variables went with it: switch apps,
 * come back, start over. The match is remembered after every action now, as
 * the same seed-and-actions record a trace carries, and the landing page a
 * reload comes back to offers it. Resuming replays it to the same position:
 * same turn, same hand.
 */
test("a match survives the page being reloaded", async ({ page }) => {
  await enterMainPhase(page);
  const hand = page.locator(".self-board .hand-row .game-card");
  await expect(hand).toHaveCount(5);
  const held = await hand.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.instance),
  );

  await page.reload();
  // The offer is a modal now: the turn is on it, and Resume is its button.
  await expect(page.locator("#resume-dialog")).toContainText("Turn 1");
  const resume = page.locator("[data-home-resume]");
  await expect(resume).toBeVisible();
  await resume.click();

  await expect(page.locator(".game-shell")).toHaveClass(/phase-main/);
  await expect(page.locator(".turn-status")).toContainText("Turn 1");
  await expect(hand).toHaveCount(5);
  expect(
    await hand.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.instance),
    ),
  ).toEqual(held);

  // Walking back to the menu keeps the offer; only a new match or a result
  // replaces it.
  await page.locator("#new-game").click();
  await expect(page.locator("[data-home-resume]")).toBeVisible();
});

/**
 * A deck's own art hangs in a corner of its half, which on a phone is where the
 * pieces are rather than beside them. The half keeps its wash and its ruling
 * either way -- what a phone drops is the painting.
 */
test("a phone drops the deck art a desktop lays on the mat", async ({
  page,
}) => {
  const spriteDisplay = (): Promise<string | null> =>
    page.evaluate(() => {
      const half = document.querySelector(".self-board");
      if (!document.documentElement.dataset.selfMat) return "NO_MAT_ART";
      return half ? getComputedStyle(half, "::after").display : null;
    });

  await page.setViewportSize({ width: 1600, height: 950 });
  await enterMainPhase(page);
  expect(await spriteDisplay()).toBe("block");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await spriteDisplay()).toBe("none");
});

/** The mat's zones, and the hand that stands beside rather than on it -- or
    nowhere on the table at all, on a phone, where it is a sheet instead. */
async function matBoxes(
  page: Page,
  seat: "self" | "opponent",
): Promise<{
  mat: Box;
  chars: Box;
  costArea: Box;
  donDeck: Box;
  trash: Box;
  deck: Box;
  life: Box;
  hand: Box | null;
}> {
  const read = async (selector: string): Promise<Box> => {
    const box = await page.locator(`.${seat}-board ${selector}`).boundingBox();
    if (!box) throw new Error(`NO_BOX:${selector}`);
    return { ...box, right: box.x + box.width };
  };
  const hand = await page.locator(`.${seat}-board .hand-zone`).boundingBox();
  return {
    mat: await read(".player-mat"),
    chars: await read(".character-row"),
    costArea: await read(".cost-area"),
    donDeck: await read(".don-deck-zone"),
    trash: await read(".trash-zone-button"),
    deck: await read(".deck-pile"),
    life: await read(".life-zone"),
    hand: hand ? { ...hand, right: hand.x + hand.width } : null,
  };
}

/**
 * The mat is one rectangle of a fixed shape, and every zone the printed mat
 * names lives inside it: nothing may be drawn over the edge of the screen, and
 * nothing may spill out of the mat. Every screen shape that broke the row-based
 * board this replaced is checked here, and both seats on each -- the far seat is
 * the same markup without the button around its cost area, and it is the one
 * nobody looks at while playing.
 *
 * A portrait phone has a mat of its own shape (responsive.css): five columns
 * rather than six, nearer square than the printed 1.85, and with the DON!! deck
 * standing beside the Life stack above the cost area rather than at the end
 * of its row. The zones are the same; only where they stand differs.
 */
for (const [shape, size] of Object.entries({
  "a desktop": { width: 1600, height: 950 },
  "a portrait phone": { width: 390, height: 844 },
  "a portrait tablet": { width: 768, height: 1024 },
  "a landscape phone": { width: 844, height: 390 },
})) {
  test(`the mat holds every zone inside it on ${shape}`, async ({ page }) => {
    await page.setViewportSize(size);
    await enterMainPhase(page);

    for (const seat of ["self", "opponent"] as const) {
      const zones = await matBoxes(page, seat);
      const { mat, chars, costArea, donDeck, trash, deck, life } = zones;

      // The mat keeps its printed shape, and keeps inside the screen.
      const phoneMat = size.width <= 760;
      expect(mat.width / mat.height).toBeGreaterThan(phoneMat ? 1.1 : 1.7);
      expect(mat.width / mat.height).toBeLessThan(phoneMat ? 1.3 : 2);
      expect(mat.x).toBeGreaterThanOrEqual(0);
      expect(Math.round(mat.right)).toBeLessThanOrEqual(size.width);

      // Every zone the mat names is drawn inside the mat.
      for (const [name, zone] of Object.entries({
        chars,
        costArea,
        donDeck,
        trash,
        deck,
        life,
      })) {
        expect(
          Math.round(zone.x),
          `${name} starts inside the mat`,
        ).toBeGreaterThanOrEqual(Math.round(mat.x) - 1);
        expect(
          Math.round(zone.right),
          `${name} ends inside the mat`,
        ).toBeLessThanOrEqual(Math.round(mat.right) + 1);
      }

      // And the zones that share a row of the mat stay out of each other:
      // life · … · deck across the middle, DON!! deck · cost area · trash along
      // the near edge -- or, on the phone mat, life · DON!! deck across the
      // middle with the cost area under the DON!! deck, clear of the life
      // stack running down beside it.
      expect(Math.round(deck.x)).toBeGreaterThanOrEqual(Math.round(life.right));
      if (phoneMat) {
        expect(Math.round(donDeck.x)).toBeGreaterThanOrEqual(
          Math.round(life.right),
        );
        expect(Math.round(costArea.x)).toBeGreaterThanOrEqual(
          Math.round(life.right),
        );
        if (seat === "self")
          expect(Math.round(costArea.y)).toBeGreaterThanOrEqual(
            Math.round(donDeck.y + donDeck.height),
          );
        else
          expect(Math.round(donDeck.y)).toBeGreaterThanOrEqual(
            Math.round(costArea.y + costArea.height),
          );
      } else {
        expect(Math.round(costArea.x)).toBeGreaterThanOrEqual(
          Math.round(donDeck.right),
        );
      }
      expect(Math.round(trash.x)).toBeGreaterThanOrEqual(
        Math.round(costArea.right),
      );
    }
  });
}

/**
 * The mat reads as columns. Its six columns are the life strip and the five
 * Character slots, and every zone below stands in one of them: the deck and the
 * trash under the rightmost slot, the stage under the fourth, the cost area
 * from the first to the fourth, and the Leader on the mat's own centre line --
 * which, with six even columns, is the gap between the second and third slots.
 * A zone that lines up with nothing above it reads as a zone that was put
 * wherever it fitted, so the alignment is measured rather than eyeballed.
 */
test("every zone on the mat stands in a Character column", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await enterMainPhase(page);

  const mat = await page.evaluate(() => {
    const span = (element: Element | null) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: Math.round(box.x),
        right: Math.round(box.right),
        middle: Math.round((box.x + box.right) / 2),
      };
    };
    const one = (selector: string) =>
      span(document.querySelector(`.self-board ${selector}`));
    return {
      rectangle: one(".player-mat"),
      slots: [...document.querySelectorAll(".self-board .character-row > *")]
        .map(span)
        .filter((slot) => slot !== null),
      leader: one(".mat-leader .game-card"),
      stage: one(".mat-stage > *"),
      deck: one(".deck-pile .physical-card-back"),
      trash: one(".trash-pile"),
      costArea: one(".cost-area"),
      life: one(".life-stack"),
      donDeck: one(".don-deck-zone .don-slot"),
    };
  });

  expect(mat.slots).toHaveLength(5);
  const [first, , third, fourth, fifth] = mat.slots;
  // The deck and the trash share the rightmost slot's column, and the stage the
  // fourth's -- same centre and same width, since both are one card wide.
  expect(mat.deck).toEqual(fifth);
  expect(mat.trash).toEqual(fifth);
  expect(mat.stage).toEqual(fourth);
  // The Leader is on the mat's centre line, which falls between slots two and
  // three rather than on the middle slot: the life strip is a column too.
  expect(mat.leader!.middle).toBe(mat.rectangle!.middle);
  expect(mat.leader!.middle).toBeLessThan(third!.middle);
  // The cost area runs the first four slots. Its border sits a pixel outside
  // the cards, which is what a printed box does.
  expect(Math.abs(mat.costArea!.left - first!.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(mat.costArea!.right - fourth!.right)).toBeLessThanOrEqual(2);
  // Life and the DON!! deck share the outer column, one above the other.
  expect(mat.donDeck).toEqual(mat.life);
  expect(mat.life!.right).toBeLessThan(first!.left);
});

/**
 * One card size for the whole mat. A card is a card whichever zone it is in and
 * whichever way up it is: the deck's back, a Life card, a DON!! in the cost
 * area, the DON!! deck's back, the Leader, a Character slot. This is the rule
 * that stops each zone drifting to whatever size its own box suggested, which
 * is what made a DON!! a third the size of the deck card beside it.
 */
test("every card on the mat is the same size", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await enterMainPhase(page);

  const sizes = await page.evaluate(() =>
    [
      ".deck-pile .physical-card-back",
      ".life-stack .physical-card-back",
      ".don-deck-zone .don-card",
      ".cost-dons .don-card",
      ".character-row .empty-slot",
      ".mat-leader .game-card",
      ".trash-pile",
    ].map((selector) => {
      const card = document.querySelector<HTMLElement>(
        `.self-board ${selector}`,
      );
      return card
        ? `${selector}: ${card.offsetWidth}x${card.offsetHeight}`
        : `${selector}: MISSING`;
    }),
  );

  const first = sizes[0]!.split(": ")[1];
  expect(first).toMatch(/^\d+x\d+$/);
  for (const size of sizes)
    expect(size).toBe(`${size.split(": ")[0]}: ${first}`);
});

/**
 * The hand is not on the mat -- it is held beside it, and its column is a fixed
 * five cards wide so that what a player happens to be holding cannot resize the
 * mat. Below 900px there is no width for that column and it goes back under the
 * mat instead, which is the one shape where the two may share a vertical band.
 */
test("the hand stands beside the mat, and never on it", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await enterMainPhase(page);

  for (const seat of ["self", "opponent"] as const) {
    const { mat, hand } = await matBoxes(page, seat);
    expect(hand).not.toBeNull();
    expect(Math.round(hand!.x)).toBeGreaterThanOrEqual(Math.round(mat.right));
    expect(Math.round(hand!.right)).toBeLessThanOrEqual(1600);
  }
  // Both seats' mats are the same rectangle, in the same place.
  const self = await matBoxes(page, "self");
  const opponent = await matBoxes(page, "opponent");
  expect(Math.round(self.mat.x)).toBe(Math.round(opponent.mat.x));
  expect(Math.round(self.mat.width)).toBe(Math.round(opponent.mat.width));
});

/**
 * What a phone gives up in the cost area, and what it keeps. The cards are what
 * a turn is spent against, so a phone keeps drawing every one of them and the
 * printed name is what goes -- which must not regress into "the rested DON!!
 * are simply gone", the state being carried by the cards themselves now.
 */
test("a phone draws every DON!! card, name or no name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterMainPhase(page);

  const rig = page.locator("#active-don");
  await expect(rig.locator(".don-slot")).toHaveCount(1);
  await expect(rig.locator(".cost-area-label")).toBeHidden();
  await expect(rig).toHaveAttribute(
    "aria-label",
    "1 active, 0 rested, 9 in DON!! deck",
  );
});

/** A desktop has the width for the printed label as well as the cards. */
test("a desktop keeps the cost area's label", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await enterMainPhase(page);

  const rig = page.locator("#active-don");
  await expect(rig.locator(".cost-area-label")).toBeVisible();
  await expect(rig.locator(".don-slot.active")).toHaveCount(1);
});

test("opening hand and mandatory decision stay contained on mobile landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openMatch(page);

  const viewport = page.viewportSize();
  const handBox = await page.locator(".self-board .hand-zone").boundingBox();
  const modalBox = await page.locator(".decision-modal").boundingBox();
  const modalHand = page.locator(".decision-modal .mulligan-hand-preview");

  expect(viewport).not.toBeNull();
  expect(handBox).not.toBeNull();
  expect(modalBox).not.toBeNull();
  await expect(page.locator(".decision-modal")).toHaveClass(
    /dismissable-choice-modal/,
  );
  await expect(modalHand.locator(".game-card")).toHaveCount(5);
  await expect(page.getByText("Game preparation")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Keep these cards" }),
  ).toHaveClass(/mulligan-keep/);
  await expect(
    page.getByRole("button", { name: "Draw a new hand" }),
  ).toHaveClass(/mulligan-redraw/);
  expect(handBox!.x).toBeGreaterThanOrEqual(0);
  expect(handBox!.x + handBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(modalBox!.x).toBeGreaterThanOrEqual(0);
  expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(
    Math.abs(modalBox!.x + modalBox!.width / 2 - viewport!.width / 2),
  ).toBeLessThanOrEqual(1);
});

/*
 * A hand past five cards stacks into a second row at the same card size --
 * "more hand", not "smaller hand" -- so the shape that can reach the mat is the
 * stacked one. Measured on the far seat, whose hand grows toward the mat rather
 * than away from it, and whose corner the toolbar also sits in.
 */
test("a stacked hand keeps its size, its column and its distance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 926 });
  await enterMainPhase(page);
  const handFan = page.locator(".opponent-hand-fan");

  // Laid-out height, not the painted box: a fanned card is rotated, and a
  // rotation inflates its bounding box by a couple of per cent.
  const oneRowHeight = await handFan
    .locator(".physical-card-back")
    .first()
    .evaluate((card) => (card as HTMLElement).offsetHeight);

  await handFan.evaluate((fan) => {
    const row = fan.querySelector(".hand-row");
    if (!row) throw new Error("NO_ROW");
    while (row.children.length < 5) {
      const card = document.createElement("span");
      card.className = "physical-card-back";
      row.append(card);
    }
    const second = document.createElement("div");
    second.className = "hand-row";
    for (let card = 0; card < 3; card += 1) {
      const back = document.createElement("span");
      back.className = "physical-card-back";
      second.append(back);
    }
    fan.append(second);
    fan.classList.add("hand-two-rows");
  });

  const cardBoxes = await handFan
    .locator(".physical-card-back")
    .evaluateAll((cards): Box[] =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: (card as HTMLElement).offsetHeight,
          right: rect.right,
        };
      }),
    );
  const matBox = await page
    .locator(".opponent-board .player-mat")
    .boundingBox();

  expect(matBox).not.toBeNull();
  // The same card size in two rows as in one.
  for (const box of cardBoxes)
    expect(Math.round(box.height)).toBe(Math.round(oneRowHeight));
  // Still beside the mat rather than over it, and still on the screen.
  expect(Math.min(...cardBoxes.map((box) => box.x))).toBeGreaterThanOrEqual(
    matBox!.x + matBox!.width,
  );
  expect(Math.max(...cardBoxes.map((box) => box.right))).toBeLessThanOrEqual(
    2048,
  );
});

/* The matchup page opens from the lobby's AI-vs-AI choice, on the two decks
   the lobby has picked, already running and showing nothing until the run has
   finished. */
test("simulating from the lobby opens on the lobby's decks, with nothing shown yet @art", async ({
  page,
}) => {
  await openSetup(page);
  await pickDeck(page, "p1", "(Purple) Charlotte Katakuri - Starter Deck 34");
  await simulateFromTheLobby(page, 100);

  await expect(
    page.getByRole("heading", { name: "Simulate matchup" }),
  ).toBeVisible();
  await expect(page.locator(".matchup-side .deck-leader b")).toHaveText([
    "(Purple) Charlotte Katakuri - Starter Deck 34",
    "(Yellow) Eustass Kid - Starter Deck 36",
  ]);
  await expect(
    page.locator(".matchup-side .deck-select-leader-card.has-art"),
  ).toHaveCount(2);
  // The lobby's decks, not a second pair of pickers.
  await expect(page.locator(".matchup-shell select")).toHaveCount(0);
  await expect(page.locator(".run-progress")).toBeVisible();
  await expect(page.locator(".matchup-verdict")).toHaveCount(0);

  await page.locator("#analytics-back").click();
  await expect(page.locator("#setup-form")).toBeVisible();
});

test("the lobby's AI-vs-AI choice plays the games it was asked for, then shows them", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openSetup(page);
  await pickDeck(page, "p1", "(Purple) Enel - Official Feature Deck");
  await pickDeck(page, "p2", "(Blue/Yellow) Nami - Official Feature Deck");
  await simulateFromTheLobby(page, 100);
  // Only the bar while it runs: a result drawn after one turn order would
  // change once the other came in.
  await expect(page.locator(".run-progress")).toBeVisible();
  await expect(page.locator(".matchup-verdict")).toHaveCount(0);

  await expect(page.locator(".matchup-verdict")).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.locator(".run-progress")).toHaveCount(0);
  await expect(page.locator(".matchup-verdict .eyebrow")).toHaveText(
    "Enel against Nami",
  );
  await expect(page.locator(".verdict-record")).toContainText("in 100 games");
  await expect(page.locator(".turn-figure b")).toHaveCount(2);
  await expect(page.locator(".card-impact")).toHaveCount(2);
  await expect(page.locator(".card-impact li").first()).toContainText(
    /played in|as a Counter in/,
  );
  // Both decks' lists start on the same line, whichever deck name wraps.
  const [left, right] = await page
    .locator(".card-impact")
    .evaluateAll((sections) =>
      sections.map((section) =>
        [...section.querySelectorAll("ul")].map(
          (list) => list.getBoundingClientRect().top,
        ),
      ),
    );
  expect(left![0]).toBe(right![0]);
  if (left!.length === 2 && right!.length === 2)
    expect(left![1]).toBe(right![1]);
  for (const gone of [
    ".matchup-facts",
    ".field-strip",
    ".format-matrix",
    ".sim-bar",
  ]) {
    await expect(page.locator(gone)).toHaveCount(0);
  }

  const impactCard = page.locator(".card-impact .impact-card").first();
  const impactCardNumber = (await impactCard.locator("small").textContent())!;
  await impactCard.click();
  await expect(
    page.getByRole("dialog", { name: "Card details" }),
  ).toContainText(impactCardNumber);
  await page.getByTitle("Close").click();
  await expect(page.getByRole("dialog", { name: "Card details" })).toHaveCount(
    0,
  );
  // The same button runs a fresh hundred.
  await expect(
    page.getByRole("button", { name: "Run 100 games" }),
  ).toBeVisible();
});

test("a DON!! attachment reaches the history, and Life is drawn as cards", async ({
  page,
}) => {
  await enterMainPhase(page);

  // Life is a stack of cards, not a counter: one slot per card, and a
  // face-down slot names nothing, because nobody may read it.
  const selfLife = page.locator(".self-board .life-stack .life-slot");
  await expect(selfLife).toHaveCount(5);
  await expect(page.locator(".self-board .life-stack > b")).toHaveText("5");
  await expect(selfLife.first()).toHaveAttribute(
    "title",
    /Face-down Life card/,
  );
  await expect(page.locator(".life-slot.face-up")).toHaveCount(0);

  await page.locator("#active-don").click();
  await page
    .locator(".card-action-modal")
    .getByRole("button", { name: /Choose recipient/ })
    .click();
  // "Choose recipient" hands the board over: the legal recipients light up and
  // the recipient is clicked there, not out of a list.
  await expect(page.locator(".table.targeting")).toHaveCount(1);
  await expect(page.locator('[data-instance="p1-leader"]')).toHaveClass(
    /valid-target/,
  );
  await page.locator('[data-instance="p1-leader"]').click();

  // The history is where a step is read back now that the lane no longer
  // reports one, and it still names the recipient rather than the count alone:
  // "attached
  // 1 DON!!" left the one thing being decided -- which card got it -- unsaid.
  await page.getByTitle("Match history").click();
  const history = page.locator(".history-modal .history");
  await expect(history).toBeVisible();
  await expect(history).toContainText(
    "You attached 1 DON!! to your Monkey.D.Luffy (Leader).",
  );
  await expect(history).toContainText("Opponent chose to keep.");
});

/**
 * Sealed mode had no end-to-end coverage at all, which made it the riskiest
 * screen to move into `screens/sealed.ts` (docs/proposals/web-screen-modules.md
 * names exactly this hazard: a mis-assigned state field renders fine and then
 * behaves wrongly a few clicks later). This walks the whole flow -- lobby,
 * opening packs, editing the pool, and starting the match -- so the next
 * change to it has something to break.
 */
test("sealed mode opens packs, builds a deck, and starts a match", async ({
  page,
}) => {
  await page.goto(modesUrl);
  await page.getByRole("button", { name: /^Sealed/ }).click();
  await expect(page.locator(".sealed-shell")).toBeVisible();

  // The lobby opens on the newest expansion already chosen, and the picker is
  // the modal grid the 1v1 lobby picks a deck in. Going through it rather than
  // accepting the default is what proves the pick reaches the pool: OP15's
  // packs must not open OP17 cards.
  await page.locator("[data-open-booster-picker]").first().click();
  await page.locator('[data-pick-expansion="OP15"]').click();
  await expect(page.locator(".booster-choice")).toContainText(
    "Adventure on Kami's Island",
  );

  await page.getByRole("button", { name: /Open 6 packs/ }).click();
  await expect(page.locator(".deck-editor-shell")).toBeVisible();

  await expect(page.locator(".deck-editor-header .eyebrow")).toContainText(
    "OP15-EB04 sealed",
  );
  await expect(page.locator(".pool-card-list .card-number").first()).toHaveText(
    /^OP15-/,
  );

  // Quantity controls move a card in and back out of the deck.
  const add = page.locator("[data-sealed-increase]").first();
  const cardNumber = await add.getAttribute("data-sealed-increase");
  await add.click();
  const remove = page.locator(`[data-sealed-decrease="${cardNumber}"]`).first();
  await expect(remove).toBeEnabled();
  await remove.click();

  // The search box survives its own re-render, and sorting keeps the page up.
  const sealedCount = page.locator(".catalog-count");
  const sealedCards = page.locator(".pool-card-list .catalog-card");
  const sealedFull = await sealedCards.count();
  await page.locator("#sealed-search").fill("Luffy");
  await expect(page.locator("#sealed-search")).toHaveValue("Luffy");
  await expect(sealedCount).toHaveCount(1);
  expect(await sealedCards.count()).toBeLessThan(sealedFull);
  await page.locator("#sealed-search").fill("");
  await expect(sealedCount).toHaveCount(0);
  // A sealed pool is every colour the expansion prints, so this is where the
  // colour menu is offered, and where it saves the most room.
  await page.locator("#sealed-colors summary").click();
  const red = page.locator("label:has(#sealed-color-red)");
  await red.click();
  await expect(sealedCount).toHaveCount(1);
  expect(await sealedCards.count()).toBeLessThan(sealedFull);
  await red.click();
  await expect(sealedCount).toHaveCount(0);
  await expect(sealedCards).toHaveCount(sealedFull);
  await page.locator("#sealed-colors summary").click();
  await page.locator("#sealed-sort").selectOption("name");

  // Auto-build reaches a legal 40-card deck, which is what enables Start.
  await page.getByRole("button", { name: /Auto-build/ }).click();
  await expect(page.locator(".deck-count b")).toHaveText("40");
  await expect(page.locator(".deck-rule-status")).toHaveClass(/valid/);

  await page.locator("#p2-controller").selectOption("rules");
  await page.getByRole("button", { name: /Start match/ }).click();
  await expect(page.locator(".game-shell")).toBeVisible();
});
