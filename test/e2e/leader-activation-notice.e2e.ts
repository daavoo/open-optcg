import { expect, test } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

/**
 * A Leader's `[Activate: Main]`, reported to the player who clicked it.
 *
 * A Leader never leaves the board, so its activation has no card movement to
 * stand in for a report: OP14-020 Dracule Mihawk stood three DON!! back up and
 * took the turn's plays away, and the only thing on screen that had changed
 * was the DON!! row. Both halves of the payoff are `activate-don` and
 * `restrict-player`, neither of which the board narrates, and the panel that
 * exists for exactly this question only ever ran off an `ability-triggered`
 * marker -- which a clause the player activated is deliberately outside.
 *
 * Driven to a real position rather than a constructed one: turn 5 of a game
 * the rules agents played out, stopped on the action before the one the Green
 * policy chose. Clicked rather than replayed, because the panel is derived
 * from the events of an action this page took.
 */
test("a Leader's activation reports what it did to the player who clicked it", async ({
  page,
}) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();

  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
      p2Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "shot-0",
      startingPlayer: "random",
      seedMode: "matchup",
    },
    actions: [
      "r0:mulligan:mulligan",
      "r1:mulligan:mulligan",
      "r2:play:4:p1-card-47",
      "r3:pass",
      "r4:play:0:p2-card-11",
      "r5:pass",
      "r6:play:3:p1-card-12",
      "r7:effect:don",
      "r8:effect:p1-card-25",
      "r9:play:0:p1-card-13",
      "r10:attack:p1-leader:p2-leader",
      "r11:pass-block",
      "r12:pass-counter",
      "r13:pass",
      "r14:attach:p2-leader",
      "r15:play:6:p2-card-12",
      "r16:play:2:p2-card-18",
      "r17:effect:search-select:p2-card-5",
      "r18:activate:mechanic-main:p2-leader",
      "r19:effect:p2-card-11",
      "r20:attack:p2-card-11:p1-leader",
      "r21:pass-block",
      "r22:pass-counter",
      "r23:attack:p2-leader:p1-leader",
      "r24:pass-block",
      "r25:pass-counter",
      "r26:pass",
      "r27:play:4:p1-card-24",
      "r28:effect:p2-card-11",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await page.evaluate(() => {
    (window as unknown as { __freezeAi?: boolean }).__freezeAi = true;
  });
  await page.locator("#trace-input").setInputFiles({
    name: "leader-activation-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();

  // Nothing yet: the position was restored, not played into.
  await expect(page.locator(".opponent-action-modal")).toHaveCount(0);

  // `.last()` is this player's side of the mat; `.first()` is the opponent's.
  await page
    .locator(".mat-leader")
    .last()
    .locator(".game-card")
    .first()
    .click();
  await page.getByRole("button", { name: /Activate: Main/ }).click();

  // The cost comes up as a decision, and used to be the whole of what the
  // player saw: this prompt, then a board that had quietly changed.
  const choice = page.locator(".decision-modal");
  await expect(choice).toContainText("Resolve Dracule Mihawk's card effect");
  await expect(page.locator(".opponent-action-modal")).toHaveCount(0);
  await page.getByRole("button", { name: "Kin'emon Choose Kin'emon" }).click();

  const notice = page.locator(".opponent-action-modal");
  // Titled for a clause the player asked for, not "Fired on its own".
  await expect(notice).toContainText("Ability resolved");
  await expect(notice).toContainText("Rested");
  await expect(notice).toContainText("Set 3 DON!! active");
  await expect(notice).toContainText(/cannot play Characters/i);
  // One face for the Leader, not one per step. Drawn a card apiece, these two
  // steps plus the rest above them are the same Leader printed three times
  // down a panel capped at `46rem`, which put the restriction under the fold.
  await expect(notice.locator(".opponent-action-single")).toHaveCount(1);
  await expect(
    notice.locator(".opponent-action-single .single-action"),
  ).toHaveCount(2);
  await page.screenshot({
    path: "test-results/leader-activation-notice.png",
    fullPage: false,
  });
});
