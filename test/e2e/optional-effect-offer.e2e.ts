import { expect, test } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

/**
 * The apply/skip pair of an optional effect, on the screen that draws it.
 *
 * Both buttons used to read "Apply optional effect" and "Don't apply optional
 * effect" -- the same two strings for every ability in the pool. A recorded
 * game has an LLM seat declining OP09-062 Nico Robin's ramp, the deck's whole
 * ramp, having invented an effect to decline: those two strings were all it
 * was given. The heading names the card, so the buttons name what is being
 * decided -- the clause, or, in a build with no text pack like this one, its
 * printed marker.
 *
 * Asserted here rather than only in `test/op09-robin.test.ts` because the
 * shortening that takes the card's name back off the button is the web's, and
 * a label nothing renders is a label nobody checks.
 */
test("an optional effect's buttons say which clause is being decided", async ({
  page,
}) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();

  // Turn 3 of a real game on the OP-17 Robin list, stopped one action before
  // the Leader swing that raises OP09-062's [When Attacking] ramp.
  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1",
      p2Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "1",
      startingPlayer: "random",
    },
    actions: [
      "r0:mulligan:keep",
      "r1:mulligan:keep",
      "r2:play:2:p1-card-42",
      "r3:effect:search-select:p1-card-7",
      "r4:pass",
      "r5:play:0:p2-card-1",
      "r6:effect:p2-card-23",
      "r7:effect:order:0,1,2,3",
      "r8:activate:mechanic-event:p2-card-50",
      "r9:effect:p2-leader",
      "r10:effect:p1-card-42",
      "r11:activate:mechanic-main:p2-card-1",
      "r12:effect:p2-leader",
      "r13:pass",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await page.evaluate(() => {
    (window as unknown as { __freezeAi?: boolean }).__freezeAi = true;
  });
  await page.locator("#trace-input").setInputFiles({
    name: "optional-effect-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();

  await page.locator('[data-instance="p1-leader"]').click();
  const modal = page.locator(".card-action-modal");
  await modal.locator('[data-open-targets="attack"]').click();
  await page.locator('[data-instance="p2-leader"]').click();

  const offer = page.getByRole("button", { name: "Apply [When Attacking]" });
  await expect(offer).toBeVisible();
  await expect(page.getByRole("button", { name: "Don't apply" })).toBeVisible();
});
