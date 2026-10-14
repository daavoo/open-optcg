/**
 * Both seats a person's: one screen, passed between two players.
 *
 * Nothing in the engine or the board is new here -- a seat is a person's when
 * its controller says `human`, and the board has always drawn whichever seat
 * is active. What the lobby adds is the second heading that can say "You", so
 * this drives the case it opens: the mat changing hands at the turn, each
 * player's own cards in front of them, and the other hand still face down,
 * because the two of them are sharing a screen and not a hand.
 */
import { expect, test } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

test("two people at one screen take the board in turns", async ({ page }) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
  await page.locator('[data-seat-pilot="p2"][data-pilot="you"]').click();
  await page.locator("#open-matchup-config").click();
  await page.locator("#seed").fill("two-seats-e2e");
  await page.locator("#starting-player").selectOption("p1");
  await page.locator("#matchup-config [data-close-dialog]").last().click();
  await page.getByRole("button", { name: "Start match", exact: true }).click();

  // Each seat is asked its own mulligan, in turn, on the same screen.
  const choice = page.locator(".dismissable-choice-modal");
  await expect(choice).toBeVisible();
  await page.getByRole("button", { name: /Keep these cards/ }).click();
  await expect(choice).toBeVisible();
  await page.getByRole("button", { name: /Keep these cards/ }).click();
  await expect(page.locator(".game-shell")).toHaveClass(/phase-main/);

  // Player one's board, with player one's hand on it and nobody else's: two
  // people at one screen still cannot see each other's cards.
  const turn = page.locator(".turn-status");
  await expect(turn).toContainText("Your turn");
  await expect(page.locator(".revealed-hand")).toHaveCount(0);
  await expect(
    page.locator(".opponent-hand-zone .physical-card-back").first(),
  ).toBeVisible();
  const firstSeatLeader = await page
    .locator(".self-board .mat-leader")
    .textContent();
  // The colours the two halves of the table are painted in, which are the two
  // Leaders' and have to change hands with the board: a red deck's player
  // taking their turn on the yellow deck's mat is the whole of this bug.
  const colours = async (): Promise<[string, string]> =>
    page.evaluate(() => [
      document.documentElement.dataset.theme ?? "",
      document.documentElement.dataset.oppTheme ?? "",
    ]);
  const [firstSelf, firstOpponent] = await colours();
  expect(firstSelf).not.toBe(firstOpponent);

  // Handing over is ending the turn: the mat, the hand, "Your turn" and the
  // colours all change sides, because the person at the screen has changed.
  await page.getByRole("button", { name: "End turn" }).click();
  await expect(page.locator(".self-board .mat-leader")).not.toHaveText(
    firstSeatLeader ?? "",
  );
  await expect(turn).toContainText("Your turn");
  await expect(page.locator(".revealed-hand")).toHaveCount(0);
  await expect.poll(colours).toEqual([firstOpponent, firstSelf]);
});
