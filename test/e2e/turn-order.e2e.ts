/**
 * Who goes first is settled as it is at a table: a roll picks who chooses, and
 * the winner picks first or second before the opening hand is shown.
 */
import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

async function startRolled(page: Page, seed: string): Promise<void> {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
  await page.locator("#open-matchup-config").click();
  await page.locator("#seed").fill(seed);
  await expect(page.locator("#starting-player")).toHaveValue("random");
  await page.locator("#matchup-config [data-close-dialog]").last().click();
  await page.getByRole("button", { name: "Start match", exact: true }).click();
}

/** The seat going first decides on its hand first; the board reports it. */
async function acknowledgeOpponentsMulligan(page: Page): Promise<void> {
  await expect(page.getByText("Opponent action")).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
}

test("winning the roll asks first or second before the mulligan", async ({
  page,
}) => {
  // The seed's roll goes to the left seat, which is yours.
  await startRolled(page, "turn-order-a");
  const dialog = page.locator("#turn-order");
  await expect(dialog).toContainText("You won the roll");
  await expect(page.locator(".dismissable-choice-modal")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Go second" }).click();
  await expect(dialog).toHaveCount(0);
  // Going second, the opponent takes its opening-hand decision first, and
  // only then are you shown yours.
  await acknowledgeOpponentsMulligan(page);
  await page.getByRole("button", { name: /Keep these cards/ }).click();
  await expect(page.locator(".game-shell")).toHaveClass(/phase-main/);
});

test("an opponent that wins the roll goes first, and says so", async ({
  page,
}) => {
  await startRolled(page, "turn-order-b");
  const dialog = page.locator("#turn-order");
  await expect(dialog).toContainText("Your opponent won the roll");
  await expect(dialog).toContainText("They chose to go first.");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toHaveCount(0);
  await acknowledgeOpponentsMulligan(page);
  await expect(
    page.getByRole("button", { name: /Keep these cards/ }),
  ).toBeVisible();
});
