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
 * stand in for a report: OP16-022 Monkey.D.Luffy stands two rested DON!! back
 * up, and the only thing on screen that changes is the DON!! row. The payoff
 * is `activate-don`, which the board does not narrate, and the panel that
 * exists for exactly this question only ever ran off an `ability-triggered`
 * marker -- which a clause the player activated is deliberately outside.
 *
 * Driven to a real position rather than a constructed one: turn 3 of a game
 * the rules agents played out, stopped on the action before the one the
 * Green/Blue policy chose -- Mr.2 Bon Clay is the only Character on the board,
 * an {Impel Down} body, and it rested the two DON!! that paid for it. Clicked
 * rather than replayed, because the panel is derived from the events of an
 * action this page took.
 *
 * The activation that stops for a cost first (OP14-020's rest) is pinned in
 * `test/battle-ui.test.ts`, where the marker has to survive the suspension.
 */
test("a Leader's activation reports what it did to the player who clicked it", async ({
  page,
}) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();

  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
      p2Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "shot-0",
      startingPlayer: "random",
      seedMode: "matchup",
    },
    actions: [
      "r0:mulligan:keep",
      "r1:mulligan:mulligan",
      "r2:pass",
      "r3:play:1:p2-card-13",
      "r4:pass",
      "r5:play:5:p1-card-10",
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

  const notice = page.locator(".opponent-action-modal");
  // Titled for a clause the player asked for, not "Fired on its own".
  await expect(notice).toContainText("Ability resolved");
  await expect(notice).toContainText("Set 2 DON!! active");
  // One face for the Leader, with its step beside it.
  await expect(notice.locator(".opponent-action-single")).toHaveCount(1);
  await expect(
    notice.locator(".opponent-action-single .single-action"),
  ).toHaveCount(1);
  await page.screenshot({
    path: "test-results/leader-activation-notice.png",
    fullPage: false,
  });
});
