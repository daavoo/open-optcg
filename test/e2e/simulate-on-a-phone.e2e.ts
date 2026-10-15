/**
 * The simulation strip on a touch screen.
 *
 * Its controls sit on a board that repaints itself every action, which is why
 * they act on the press rather than on the click. A phone answers a press
 * differently from a mouse -- it synthesises a click afterwards, aimed at
 * whatever is under the finger by then -- so the strip is driven here through
 * a real touch, on a phone-sized board, rather than assumed from the desktop.
 */
import { expect, test, type Page } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** A simulation started from a phone-sized lobby, by tapping. */
async function watchOnAPhone(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
  await page.locator('[data-seat-pilot="p1"][data-pilot="ai"]').tap();
  await page.locator("#open-matchup-config").tap();
  await page.locator("#seed").fill("phone-e2e");
  await page.locator("#starting-player").selectOption("p1");
  await page.locator("#matchup-config [data-close-dialog]").last().tap();
  await page.getByRole("button", { name: "AI vs AI", exact: true }).tap();
  await page.locator("#agents-watch").tap();
  await expect(page.locator(".simulate-bar")).toBeVisible();
}

test("the strip stops and starts the agents from a finger", async ({
  page,
}) => {
  await watchOnAPhone(page);

  const play = page.locator("#simulate-play");
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute("aria-pressed", "true");

  // One tap stops it, and it stays stopped: a tap that both presses and then
  // clicks the button the repaint replaced would toggle twice and read as a
  // control that does nothing.
  await play.tap();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  const position = page.locator(".simulate-bar .replay-position");
  const applied = async (): Promise<number> =>
    Number((await position.textContent())?.replace(/\D/g, "") ?? "0");
  const held = await applied();
  await page.waitForTimeout(1500);
  expect(await applied()).toBe(held);

  // And one tap starts it again.
  await play.tap();
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect.poll(applied, { timeout: 15000 }).toBeGreaterThan(held);
});

test("the strip's other controls answer a finger once each", async ({
  page,
}) => {
  await watchOnAPhone(page);
  await page.locator("#simulate-play").tap();

  // Every control on the strip is bound the same way, so every one of them
  // would have run twice from one tap.
  const pace = page.locator("#simulate-pace");
  await expect(pace).toHaveText("1x");
  await pace.tap();
  await expect(pace).toHaveText("2x");

  const ownLeader = page.locator(".self-board .mat-leader");
  const before = await ownLeader.textContent();
  await page.locator("#simulate-swap").tap();
  await expect(ownLeader).not.toHaveText(before ?? "");
});

test("their hand is face up, and a phone can open it", async ({ page }) => {
  await watchOnAPhone(page);
  await page.locator("#simulate-play").tap();

  // Neither hand is on a phone's board -- the mat takes the whole half -- so
  // both are asked for. Yours is the pill on the seam; theirs is the count on
  // the far edge, which is only a button while the hand behind it is face up.
  await expect(page.locator(".opponent-hand-fan")).toBeHidden();
  const theirs = page.locator("#opponent-hand-toggle");
  await expect(theirs).toBeVisible();
  await theirs.tap();

  const sheet = page.locator(".hand-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Their hand");
  // Their cards, face up and read-only: there is nothing to take on a card in
  // somebody else's hand.
  await expect(sheet.locator(".hand-sheet-entry").first()).toBeVisible();
  await expect(sheet.locator(".hand-sheet-actions")).toHaveCount(0);
  await sheet.locator(".card-detail-close").tap();
  await expect(page.locator(".hand-sheet")).toHaveCount(0);

  // And your own sheet still opens, from its own pill.
  await page.locator("#hand-toggle").tap();
  await expect(page.locator(".hand-sheet")).toContainText("Your hand");
});
