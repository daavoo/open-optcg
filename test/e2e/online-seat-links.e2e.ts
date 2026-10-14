/**
 * Two browser windows, two seat links, one match.
 *
 * The other e2e specs open the app as a file and play locally. This one runs
 * the real match server -- the Worker bundle in the real Workers runtime -- and
 * serves the app from the same origin, so what it exercises is what a deploy
 * does: two people open their halves of one match and see their own side of it.
 */
import {
  expect,
  seedAssetPack,
  test,
  type Browser,
  type Page,
} from "./fixtures.js";
import {
  serveMatchWorker,
  type LocalServer,
} from "../../tools/match-server.js";
import { join } from "node:path";
import { existsSync } from "node:fs";

const P1_DECK = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2_DECK = "(Green) Roronoa Zoro - Starter Deck 32";

/**
 * Every test here loads the whole app twice -- two players, two browser contexts
 * -- against a server it also starts. With card art inlined that is a ~7 MB
 * document per window, and the default 30-second budget is not enough for two of
 * them plus a match. Stated once here rather than as a number sprinkled over
 * each test.
 */
test.describe.configure({ timeout: 120_000 });

let server: LocalServer;

test.beforeAll(async () => {
  const appDirectory = join(process.cwd(), "dist/pages");
  // The suite builds the app before running (see `pnpm web:e2e`), and this spec
  // needs the hosted build rather than the single file the others open.
  test.skip(
    !existsSync(join(appDirectory, "index.html")),
    "no dist/pages build; run pnpm web:build:server",
  );
  server = await serveMatchWorker({ port: 0, appDirectory });
});

test.afterAll(async () => {
  await server.stop();
});

/**
 * Open a seat link in a browser context of its own.
 *
 * A context each, not two tabs: the held seat lives in localStorage, and two
 * players sharing one would be one player.
 */
async function openSeat(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext();
  await seedAssetPack(context);
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

/**
 * Build a match and open both of its seat links, one window each.
 *
 * Who starts is left to the seed, so nothing downstream assumes which window is
 * on the clock.
 */
async function seatTwoWindows(
  browser: Browser,
): Promise<{ first: Page; second: Page }> {
  const built = await server.createMatch({ p1Deck: P1_DECK, p2Deck: P2_DECK });
  const first = await openSeat(browser, built.seats.p1.url);
  const second = await openSeat(browser, built.seats.p2.url);
  for (const page of [first, second]) {
    await expect(page.locator(".turn-status")).toBeVisible({ timeout: 20_000 });
  }
  return { first, second };
}

/**
 * Get past the opening. Which window is asked to mulligan first depends on who
 * starts, so this clicks whichever one is being asked rather than assuming an
 * order. Until both have kept, the decision modal covers the board and its
 * topbar, so anything that clicks the board needs this first.
 */
async function keepBothHands(first: Page, second: Page): Promise<void> {
  for (let decision = 0; decision < 2; decision += 1) {
    await expect
      .poll(
        async () => {
          for (const page of [first, second]) {
            const keep = page.locator(".mulligan-keep");
            if (await keep.isVisible()) {
              await keep.click();
              return true;
            }
          }
          return false;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  }
}

test("two windows open their seat links and play the same match", async ({
  browser,
}) => {
  // Both boards come up. The turn banner is the board's, so seeing it means the
  // server dealt, both seats joined, and each got a frame.
  const { first, second } = await seatTwoWindows(browser);

  // Neither window offers to export a trace: an online match has no whole
  // action list to export, and the board hides the button rather than failing
  // on a click.
  for (const page of [first, second]) {
    await expect(page.locator("#trace")).toHaveCount(0);
  }

  await keepBothHands(first, second);

  // Now the board is uncovered: each window sees its own hand as cards and the
  // opponent's as backs. That is `observe()` reaching the screen -- the other
  // hand is a count, so there is nothing to draw but backs.
  for (const page of [first, second]) {
    await expect(page.locator(".hand-cards .game-card").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator(".opponent-hand-fan .physical-card-back").first(),
    ).toBeVisible();
  }

  // Exactly one of them is on the clock; the other is told to wait.
  const banners = await Promise.all(
    [first, second].map((page) => page.locator(".turn-status b").innerText()),
  );
  expect(banners.filter((text) => /Your turn/i.test(text))).toHaveLength(1);

  // And the move one window makes reaches the other one, through the server.
  const active = /Your turn/i.test(banners[0]!) ? first : second;
  const idle = active === first ? second : first;
  const before = await idle.locator(".turn-status").innerText();
  await active.locator(".end-turn-button").click();
  await expect
    .poll(() => idle.locator(".turn-status").innerText(), { timeout: 20_000 })
    .not.toBe(before);
  await expect(idle.locator(".turn-status b")).toHaveText(/Your turn/i);

  // Both windows show a clock, because the server is running one. A time limit
  // the player cannot see is a rule they cannot play to.
  for (const page of [first, second]) {
    await expect(page.locator(".match-clock")).toBeVisible();
    await expect(page.locator(".match-clock .clock-you b")).toHaveText(
      /^\d+:\d\d$/,
    );
  }

  await first.context().close();
  await second.context().close();
});

test("a seat link seats the person who opens it", async ({ browser }) => {
  // "Play a friend from a link": one person builds the match, the other opens
  // their half. No lobby -- the link is the whole invitation.
  const built = await server.createMatch({
    p1Deck: P1_DECK,
    p2Deck: P2_DECK,
    startingPlayer: "p1",
  });
  const pages = await Promise.all(
    (["p1", "p2"] as const).map(async (seat) => {
      const context = await browser.newContext();
      await seedAssetPack(context);
      const page = await context.newPage();
      await page.goto(built.seats[seat].url);
      return page;
    }),
  );

  for (const page of pages) {
    await expect(page.locator(".turn-status")).toBeVisible({ timeout: 20_000 });
  }
  // Same match, each seat its own view.
  expect(await pages[0]!.locator(".hand-cards").count()).toBeGreaterThan(0);
  const viewers = await Promise.all(
    pages.map((page) =>
      page.evaluate(
        () => document.querySelectorAll(".opponent-hand-fan").length,
      ),
    ),
  );
  expect(viewers).toEqual([1, 1]);
  // And the token is out of the address bar, so a screenshot of the tab does
  // not hand the seat to whoever sees it.
  for (const page of pages) {
    expect(page.url()).not.toContain("t=");
  }

  for (const page of pages) await page.context().close();
});

test("the opponent's move is shown, not just applied", async ({ browser }) => {
  // The board's account of what just happened -- the acknowledged modal -- used
  // to be derived only where the player clicked. Online the opponent's actions arrive as frames with no
  // click behind them, so the board redrew to a changed position and said
  // nothing about how it got there.
  const { first, second } = await seatTwoWindows(browser);
  await keepBothHands(first, second);

  const onClock = async (): Promise<Page> =>
    /Your turn/i.test(await first.locator(".turn-status b").innerText())
      ? first
      : second;

  /**
   * Put a card down, the way a player does: pick it up from hand, then choose
   * Play from the card's own menu. Returns false when nothing in hand can be
   * afforded yet, which is every early turn.
   */
  const tryToPlay = async (page: Page): Promise<boolean> => {
    const cards = page.locator(".hand-cards .game-card");
    for (let index = 0; index < (await cards.count()); index += 1) {
      await cards.nth(index).click();
      const play = page.locator('[data-action*=":play:"]').first();
      if (await play.isVisible()) {
        await play.click();
        return true;
      }
      // Not this card: close its menu and try the next.
      const back = page.locator("#clear-selection, .picker-back").first();
      if (await back.isVisible()) await back.click();
    }
    return false;
  };

  // Play on until the seat on the clock can afford something. Turn one has a
  // single DON!!, and ending a turn is the *other* case this test covers.
  let active = await onClock();
  let played = await tryToPlay(active);
  for (let turn = 0; turn < 8 && !played; turn += 1) {
    await active.locator(".end-turn-button").click();
    await expect
      .poll(async () => (await onClock()) !== active, { timeout: 20_000 })
      .toBe(true);
    active = await onClock();
    const pending = active.locator(".opponent-action-modal");
    if (await pending.isVisible()) {
      await pending.getByRole("button", { name: "OK", exact: true }).click();
    }
    played = await tryToPlay(active);
  }
  expect(played).toBe(true);

  // A play leaves its player on the clock, so the other window is being told
  // about something rather than handed the game.
  const idle = active === first ? second : first;
  const notice = idle.locator(".opponent-action-modal");
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText(/opponent action/i);

  // A notice, not a wall: acknowledging it gives the board back.
  //
  // `exact`, because the accessible name match is a substring one and every
  // card in the notice is a button: whenever the step happened to draw
  // ST31-003 Brook, "View Brook details" matched "OK" too and the click failed
  // on two elements instead of pressing either.
  await notice.getByRole("button", { name: "OK", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(idle.locator(".turn-status b")).toHaveText(/Opponent turn/i);

  // The card that was affordable might have asked a question -- Kin'emon's
  // [On Play] does -- and its modal covers the board it was played on. Which
  // card the loop above could afford depends on the deal, so answering a
  // question that may not be there is part of playing a turn, not a special
  // case: without this the test hangs on whichever deal deals that card.
  const pendingChoice = active.locator(".decision-modal [data-action]").last();
  if (await pendingChoice.isVisible()) await pendingChoice.click();

  // And when their action *does* hand the decision over, no modal is raised --
  // one over your own options would charge you clock to close.
  await active.locator(".end-turn-button").click();
  await expect
    .poll(() => idle.locator(".turn-status b").innerText(), { timeout: 20_000 })
    .toMatch(/Your turn/i);
  await expect(idle.locator(".opponent-action-modal")).toHaveCount(0);

  await first.context().close();
  await second.context().close();
});

test("a reload puts a player back in the match they were in", async ({
  browser,
}) => {
  const { first, second } = await seatTwoWindows(browser);

  // A refresh lands on the landing page, and the token is gone from the
  // address bar -- so the lobby has to notice the held seat and put the player
  // straight back at it.
  await first.reload();
  await expect(first.locator(".turn-status")).toBeVisible({ timeout: 20_000 });
  // And it is the same match: both windows are on the same turn.
  const turnOf = async (page: Page): Promise<string> => {
    const text = await page.locator(".turn-status").innerText();
    return /turn (\d+)/i.exec(text)?.[1] ?? "";
  };
  expect(await turnOf(first)).toBe(await turnOf(second));
  expect(await turnOf(first)).not.toBe("");

  await first.context().close();
  await second.context().close();
});

test("resigning ends the match for both players", async ({ browser }) => {
  const { first, second } = await seatTwoWindows(browser);
  // Past the opening, so the decision modal is not covering the topbar the
  // Resign button lives in.
  await keepBothHands(first, second);

  first.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await first.locator("#resign").click();

  // The engine has no concede, so this is the session's: the position is
  // untouched and still looks playable, and the result modal is what says
  // otherwise. Both windows get it, with opposite outcomes.
  await expect(first.locator(".match-over-modal h2")).toHaveText("You lose", {
    timeout: 20_000,
  });
  await expect(second.locator(".match-over-modal h2")).toHaveText("You win", {
    timeout: 20_000,
  });
  await expect(second.locator(".match-over-modal")).toContainText(
    /opponent resigned/i,
  );
  // The action list comes with the result, so the end of the match is where a
  // seat can finally save a replayable record of it. The server keeps none.
  await expect(second.locator("#match-over-trace")).toBeVisible();

  // And the way out is a button, not a dead end.
  await second.locator("#match-over-exit").click();
  await expect(second.locator("#setup-form")).toBeVisible();

  await first.context().close();
  await second.context().close();
});
