import { expect, test } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

/**
 * The decision modal, on a clause the player did not click.
 *
 * "Resolve Lucy's card effect" over four card faces named the card asking and
 * nothing it wanted, and each face was labelled "Choose <name>" -- the name
 * already printed on the picture beside it. The three things the screen now
 * carries are asserted here rather than only in unit tests, because a label
 * nothing renders is a label nobody checks:
 *
 *   - the clause, or in a build with no text pack like this one its printed
 *     marker, which is what says *when* an ability nobody clicked fired;
 *   - "Trash", the verb the engine reports for where the card is going;
 *   - a way to read a card whose printed text is unreadable at thumbnail size.
 *
 * Turn 4 of a real game, stopped on the opponent's declared attack, which is
 * the timing that raises OP15-002's half of a clause it prints on two.
 */
test("a decision modal says which clause it is resolving, and what each card choice does", async ({
  page,
}) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();

  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Red/Blue) Lucy - Official Feature Deck",
      p2Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "shot-0",
      startingPlayer: "random",
      seedMode: "matchup",
    },
    actions: [
      "r0:mulligan:mulligan",
      "r1:mulligan:keep",
      "r2:activate:mechanic-event:p2-card-47",
      "r3:effect:skip",
      "r4:pass",
      "r5:play:3:p1-card-50",
      "r6:play:0:p1-card-3",
      "r7:effect:p1-card-25",
      "r8:effect:order:0,1",
      "r9:pass",
      "r10:play:0:p2-card-25",
      "r11:attack:p2-leader:p1-leader",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await page.evaluate(() => {
    (window as unknown as { __freezeAi?: boolean }).__freezeAi = true;
  });
  await page.locator("#trace-input").setInputFiles({
    name: "lucy-pitch.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();

  const modal = page.locator(".decision-modal");
  await expect(modal.locator("h2")).toHaveText("Resolve Lucy's card effect");
  // The card prints this clause under two markers at once and an
  // `[Activate: Main]` besides; the one named is the one the battle belongs to.
  await expect(modal.locator(".effect-clause")).toHaveText(
    "[On Your Opponent's Attack]",
  );

  // The label, not the button's accessible name: the card face inside the
  // button contributes its own description to that.
  const pitches = modal.locator(".effect-card-choice");
  await expect(pitches.locator("> b")).toHaveText([
    "Trash",
    "Trash",
    "Trash",
    "Trash",
  ]);

  await modal.locator(".choice-inspect").first().click();
  const detail = page.locator(".card-detail-dialog");
  await expect(detail).toBeVisible();
  await expect(detail.locator(".card-detail-heading")).toContainText(
    "OP15-021",
  );
  await detail.locator(".card-detail-close").click();

  // The button still takes the action its one-word label describes.
  await pitches.first().click();
  await expect(pitches).toHaveCount(3);
});
