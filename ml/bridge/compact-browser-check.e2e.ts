/**
 * The small scorer playing in the built app: both seats on "Learned model"
 * in a watched match, for long enough to take dozens of decisions.
 *
 *   pnpm web:build    # with the compact pack in packages/web/src/scorer-model.json
 *   pnpm exec playwright test -c ml/bridge/compact-browser-check.config.ts
 *
 * Not part of the suite: it needs a pack, which is never in the repo. It
 * fails on any page or worker error and leaves screenshots under
 * test-results/ to look at.
 */
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

test("the learned model plays both seats of a watched match", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
  // The build carries a pack, so the Learned model is offered and picked.
  await expect(page.locator("#p2-controller")).toHaveValue("scorer");
  await page.locator('[data-seat-pilot="p1"][data-pilot="ai"]').click();
  await page.locator("#open-matchup-config").click();
  await page.locator("#seed").fill("compact-browser-check");
  await page.locator("#matchup-config [data-close-dialog]").last().click();
  await page.screenshot({ path: info.outputPath("lobby.png") });
  await page.getByRole("button", { name: "Watch AI", exact: true }).click();
  await expect(page.locator(".simulate-bar")).toBeVisible();
  // Let it play; the bar's control is a pause toggle.
  await page.waitForTimeout(30_000);
  await page.screenshot({ path: info.outputPath("mid-game.png") });
  await expect(page.locator(".hand-zone .game-card").first()).toBeVisible();
  expect(errors.filter((e) => /SCORER|COMPACT|worker/i.test(e))).toEqual([]);
  expect(errors).toEqual([]);
});
