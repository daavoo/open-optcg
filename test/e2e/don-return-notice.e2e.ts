import { expect, test } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

/**
 * The order the two panels of a `DON!! −N` come up in.
 *
 * The engine pays the cost before it asks which DON!! paid it: it takes the
 * cheapest off the field, runs the clause, and raises the pool prompt once the
 * action has resolved. OP09-061 Monkey.D.Luffy answers returned DON!! with two
 * of them back, so the "Fired on its own" panel reporting that refund arrived
 * on top of the composer -- the consequence of a payment on screen before the
 * payment had been made. Ordering lives in `absorbAction`, which no unit test
 * can reach, and the panel that was in the way is the one thing a screenshot
 * of this position shows.
 */
test("a DON!! payment is named before the Leader's answer to it is reported", async ({
  page,
}) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();

  // Turn 6 of a real game on the ST-26 Luffy list, stopped on the [On Play] of
  // ST26-003 Nico Robin -- the `DON!! −2` the Leader is watching for.
  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
      p2Deck: "(Green) Roronoa Zoro - Starter Deck 32",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "match-6f62b894748866bd-1",
      startingPlayer: "random",
      seedMode: "matchup",
    },
    actions: [
      "r0:mulligan:keep",
      "r1:mulligan:keep",
      "r2:pass",
      "r3:pass",
      "r4:attach:p2-leader",
      "r5:attach:p2-leader",
      "r6:attach:p2-leader",
      "r7:attack:p2-leader:p1-leader",
      "r8:pass-block",
      "r9:pass-counter",
      "r10:pass",
      "r11:play:6:p1-card-14",
      "r12:attack:p1-leader:p2-leader",
      "r13:pass-block",
      "r14:pass-counter",
      "r15:pass",
      "r16:play:3:p2-card-35",
      "r17:effect:p1-card-14",
      "r18:attack:p2-leader:p1-card-14",
      "r19:pass-block",
      "r20:pass-counter",
      "r21:activate:mechanic-main:p2-leader",
      "r22:attack:p2-leader:p1-leader",
      "r23:pass-block",
      "r24:pass-counter",
      "r25:pass",
      "r26:play:7:p1-card-43",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await page.evaluate(() => {
    (window as unknown as { __freezeAi?: boolean }).__freezeAi = true;
  });
  await page.locator("#trace-input").setInputFiles({
    name: "don-return-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  // Loading asks what the file is for; these drive the piloting half.
  await page.locator("#trace-pilot").click();

  // Clicked rather than replayed: the panel is derived from the events of an
  // action this page took, so a position restored from a trace has none.
  await page.getByRole("button", { name: "[On Play]: DON!! −2" }).click();

  await expect(page.locator(".decision-modal")).toContainText(
    "Return DON!! to your DON!! deck",
  );
  await expect(page.locator(".opponent-action-modal")).toHaveCount(0);

  await page.getByRole("button", { name: "Return 2 DON!!" }).click();
  const notice = page.locator(".opponent-action-modal");
  await expect(notice).toContainText("Fired on its own");

  // The Leader's refund, drawn beside the Leader that paid it. The step that
  // announced the clause is not a row of its own: it draws the same face. Nor
  // are the two DON!! two rows -- one clause acting twice through one card is
  // that card's face once, with both verbs beside it.
  const single = notice.locator(".opponent-action-single");
  await expect(single).toHaveCount(1);
  await expect(single.locator(".single-action")).toContainText([
    "Added 1 active DON!!",
    "Added 1 rested DON!!",
  ]);
  await notice.getByRole("button", { name: "OK", exact: true }).click();
  await expect(notice).toBeHidden();
});
