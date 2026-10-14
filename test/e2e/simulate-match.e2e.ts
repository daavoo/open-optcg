/**
 * Watching two agents play, started from the lobby.
 *
 * Every part of this is a surface -- the pilot choice on your own seat, the
 * strip that paces the game, the board with both hands face up -- so it is
 * driven rather than described. The match is a real one: two rules agents on
 * a fixed seed, and the assertions below are about the board they produce.
 */
import { expect, test, type Page } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

/**
 * Set the lobby to pilot both seats and start the match.
 *
 * Paused on arrival rather than left running: every assertion after this is
 * about a board, and a board that is playing itself moves out from under one.
 * Pausing is the control under test doing its job, so nothing is being worked
 * around here.
 */
async function watchASimulation(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
  await page.locator('[data-seat-pilot="p1"][data-pilot="ai"]').click();
  await page.locator("#open-matchup-config").click();
  await page.locator("#seed").fill("simulate-e2e");
  await page.locator("#starting-player").selectOption("p1");
  await page.locator("#matchup-config [data-close-dialog]").last().click();
  await page.getByRole("button", { name: "Watch AI", exact: true }).click();
  await expect(page.locator(".simulate-bar")).toBeVisible();
  await page.locator("#simulate-play").click();
  await expect(page.locator("#simulate-play")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
}

/**
 * Let the paused simulation run until both seats have a hand on the table,
 * then stop it there.
 *
 * The opening two actions are the mulligans, which are taken before either
 * hand is drawn -- so a board asserted on before them is a board with no hands
 * on it, and the assertion would be about the wrong position rather than about
 * what a spectator sees.
 */
async function playUntilTheHandsAreDealt(page: Page): Promise<void> {
  await page.locator("#simulate-play").click();
  await expect(page.locator(".hand-zone .game-card").first()).toBeVisible();
  await page.locator("#simulate-play").click();
  await expect(page.locator("#simulate-play")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
}

test("a seat's heading is the choice of who plays it, and says what that starts", async ({
  page,
}) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();

  // Yours until you say otherwise: the command starts a match you are in.
  // The slash is spaced by the stylesheet rather than by text, so the heading
  // reads "Player one · You / AI" and says "You/AI".
  await expect(page.locator('.deck-column[data-seat="p1"]')).toContainText(
    "Player one · You/AI",
  );
  await expect(
    page.getByRole("button", { name: "Start match", exact: true }),
  ).toBeVisible();

  const asAgent = page.locator('[data-seat-pilot="p1"][data-pilot="ai"]');
  await asAgent.click();
  // Which word is in force is what the heading carries, and the only place it
  // is said -- there is no second control to agree or disagree with it.
  await expect(asAgent).toHaveAttribute("aria-pressed", "true");
  await expect(asAgent).toHaveClass(/picked/);
  await expect(
    page.locator('[data-seat-pilot="p1"][data-pilot="you"]'),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Watch AI", exact: true }),
  ).toBeVisible();

  // And back: the seat is returned along with the word on the cell.
  await page.locator('[data-seat-pilot="p1"][data-pilot="you"]').click();
  await expect(
    page.getByRole("button", { name: "Start match", exact: true }),
  ).toBeVisible();
});

test("a simulated match is watched from one side, with both hands up", async ({
  page,
}) => {
  await watchASimulation(page);
  await playUntilTheHandsAreDealt(page);

  // Both hands face up: nobody at this table is being kept honest.
  await expect(page.locator(".revealed-hand .game-card").first()).toBeVisible();
  await expect(
    page.locator(".opponent-hand-zone .physical-card-back"),
  ).toHaveCount(0);
  // A watcher is asked nothing: the action list is the seat's own control and
  // belongs to the agent sitting in it.
  await expect(page.locator(".dismissable-choice-modal")).toHaveCount(0);
  // What they are told is what just happened, in a panel with nothing to
  // press on it, edged in the colour of the half it stands on, and scrolled
  // rather than cut when a look reveals more rows than it can hold.
  const notice = page.locator(".spectator-notice");
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button")).toHaveCount(0);
  await expect
    .poll(() => notice.evaluate((panel) => getComputedStyle(panel).overflowY))
    .toBe("auto");
  const flags = async (): Promise<[string, string]> =>
    page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [
        style.getPropertyValue("--flag").trim(),
        style.getPropertyValue("--opp-flag").trim(),
      ];
    });
  // The two decks are different colours, so the two flags must be too -- and
  // the panel takes the one belonging to the side whose action it reports.
  const [selfFlag, oppFlag] = await flags();
  expect(selfFlag).not.toBe(oppFlag);
  const edge = await notice.evaluate(
    (panel) => getComputedStyle(panel).borderTopColor,
  );
  const side = (await notice.getAttribute("class")) ?? "";
  const expected = await page.evaluate(
    (colour) => {
      const probe = document.createElement("span");
      probe.style.color = colour;
      document.body.append(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    },
    side.includes("on-opponent") ? oppFlag : selfFlag,
  );
  expect(edge).toBe(expected);

  // A card is still a card to look at, on the board and in either hand: the
  // click opens its face rather than a panel of actions nobody here can take.
  await page.locator(".self-board .mat-leader .game-card").click();
  await expect(page.locator(".card-detail-dialog")).toBeVisible();
  await page.locator(".card-detail-close").click();
  await page.locator(".revealed-hand .game-card").first().click();
  await expect(page.locator(".card-detail-dialog")).toBeVisible();
  await page.locator(".card-detail-close").click();
  await expect(page.locator(".card-detail-dialog")).toHaveCount(0);

  // The side is fixed, and the control is what changes it. Without this the
  // mat would swap every turn, since neither seat is a person's.
  const ownLeader = page.locator(".self-board .mat-leader");
  const theme = async (): Promise<string> =>
    page.evaluate(() => document.documentElement.dataset.theme ?? "");
  const before = await ownLeader.textContent();
  const beforeTheme = await theme();
  await page.locator("#simulate-swap").click();
  await expect(ownLeader).not.toHaveText(before ?? "");
  // The colours go with it: the side being watched is the side whose Leader
  // paints the near half of the table.
  await expect.poll(theme).not.toBe(beforeTheme);
  await page.locator("#simulate-swap").click();
  await expect(ownLeader).toHaveText(before ?? "");
  await expect.poll(theme).toBe(beforeTheme);
});

test("the strip stops the agents and sets the beat they play at", async ({
  page,
}) => {
  await watchASimulation(page);
  const position = page.locator(".simulate-bar .replay-position");
  const applied = async (): Promise<number> =>
    Number((await position.textContent())?.replace(/\D/g, "") ?? "0");

  // Paused, the board holds still: no agent is asked for anything, including
  // the one whose answer was already on its way when the button was pressed.
  const held = await applied();
  await page.waitForTimeout(1500);
  expect(await applied()).toBe(held);

  // The pace control cycles, and playing moves the game on.
  await expect(page.locator("#simulate-pace")).toHaveText("1x");
  await page.locator("#simulate-pace").click();
  await expect(page.locator("#simulate-pace")).toHaveText("2x");
  await page.locator("#simulate-play").click();
  await expect.poll(applied, { timeout: 15000 }).toBeGreaterThan(held + 3);

  // And stops again at the faster beat, where the board is repainting two or
  // three times a second: the strip acts on the press, so a paint landing
  // between the press and the release cannot swallow it.
  await page.locator("#simulate-play").click();
  await expect(page.locator("#simulate-play")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const stopped = await applied();
  await page.waitForTimeout(1500);
  expect(await applied()).toBe(stopped);
});

test("a watcher can sit down in the game being watched", async ({ page }) => {
  await watchASimulation(page);
  await playUntilTheHandsAreDealt(page);
  const played = Number(
    (
      (await page.locator(".simulate-bar .replay-position").textContent()) ?? ""
    ).replace(/\D/g, ""),
  );
  expect(played).toBeGreaterThan(1);

  await page.locator("#simulate-takeover").click();

  // The strip goes with the watching: this is a match now, and its hidden
  // information is hidden again.
  await expect(page.locator(".simulate-bar")).toHaveCount(0);
  await expect(page.locator(".revealed-hand")).toHaveCount(0);
  await expect(page.locator(".spectator-notice")).toHaveCount(0);
  await expect(page.locator(".game-shell")).toBeVisible();

  // From the same position: the actions the agents played are carried into the
  // match being taken over, which is what the history is counting.
  await page.locator("#history-toggle").click();
  await expect
    .poll(() => page.locator(".history-entry").count())
    .toBeGreaterThanOrEqual(played);
});

/**
 * A simulation left to run.
 *
 * Nothing in it waits for anybody. The player's report of an opponent's action
 * is a modal that holds the board until it is acknowledged, and a watched game
 * has nobody to acknowledge one -- so what a watcher gets instead is the small
 * panel on the acting side, which is replaced by the next action rather than
 * dismissed. A waiting modal left in the way stops the game dead behind it,
 * which is what this plays a whole game to rule out.
 */
test("a simulation plays itself to a finish, with nothing thrown over the board", async ({
  page,
}) => {
  // A whole game, watched at the faster of the two beats.
  test.setTimeout(240000);
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
  await page.locator('[data-seat-pilot="p1"][data-pilot="ai"]').click();
  await page.locator("#open-matchup-config").click();
  await page.locator("#seed").fill("match-f27275158584c9c5");
  await page.locator("#starting-player").selectOption("p1");
  await page.locator("#matchup-config [data-close-dialog]").last().click();
  await page.getByRole("button", { name: "Watch AI", exact: true }).click();
  await expect(page.locator(".simulate-bar")).toBeVisible();
  await page.locator("#simulate-pace").click();
  await expect(page.locator("#simulate-pace")).toHaveText("2x");

  // What each seat did is reported as it happens, on the half that did it.
  await expect(page.locator(".spectator-notice")).toBeVisible();

  // Played out by the two agents, with no click of any kind in between, and
  // the board says who won it: the one thing a watched game still has to
  // announce for itself.
  const result = page.locator(".command-surface .result");
  await expect(result).toBeVisible({ timeout: 200000 });
  await expect(result).toContainText("Match complete");
  // Never the player's own report, which is the one that waits to be read.
  await expect(page.locator(".opponent-action-modal")).toHaveCount(0);
  // The strip stops offering what a finished game cannot do.
  await expect(page.locator("#simulate-play")).toBeDisabled();

  // And the account of it is in the history, where it is asked for.
  await page.locator("#history-toggle").click();
  await expect(page.locator(".history-modal")).toContainText("Turn 1");
});
