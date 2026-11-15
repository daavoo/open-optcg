import { expect, test } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

/**
 * The ordering composer on a "top or bottom" placement offers both ends.
 *
 * The engine offers such a placement as two actions, one per end, and the
 * composer drew only the first -- the bottom -- behind a single "Place them in
 * this order" button, so OP18-053 Mr.7 & Miss.Father'sDay, OP15-066 Satori and
 * every other "top or bottom of the deck" clause could never keep the cards on
 * top from the app.
 */
test("a top-or-bottom placement offers both ends, in the composed order", async ({
  page,
}) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();

  // Turn 5 of a rules-vs-rules game, stopped at p1's OP15-066 Satori placing
  // Vinsmoke Reiju and Gamma Knife.
  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "(Purple) Enel - Official Feature Deck",
      p2Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "1",
      startingPlayer: "random",
    },
    actions: [
      "r0:mulligan:keep",
      "r1:mulligan:keep",
      "r2:play:3:p1-card-5",
      "r3:effect:apply",
      "r4:pass",
      "r5:play:0:p2-card-1",
      "r6:effect:p2-card-23",
      "r7:effect:order:0,1,2,3",
      "r8:activate:mechanic-main:p2-card-1",
      "r9:effect:skip",
      "r10:activate:mechanic-event:p2-card-50",
      "r11:effect:skip",
      "r12:effect:p1-card-5",
      "r13:pass",
      "r14:play:4:p1-card-7",
      "r15:effect:apply",
      "r16:effect:return-don:rested",
      "r17:play:4:p1-card-9",
      "r18:effect:apply",
      "r19:activate:enel-leader:p1-card-5",
      "r20:attach:p1-leader",
      "r21:attack:p1-leader:p2-leader",
      "r22:pass-block",
      "r23:pass-counter",
      "r24:attack:p1-card-5:p2-leader",
      "r25:pass-block",
      "r26:pass-counter",
      "r27:pass",
      "r28:attach:p2-leader",
      "r29:play:2:p2-card-25",
      "r30:activate:mechanic-main:p2-card-1",
      "r31:effect:p2-leader",
      "r32:activate:mechanic-main:p2-leader",
      "r33:effect:p2-card-25",
      "r34:attack:p2-leader:p1-leader",
      "r35:pass-block",
      "r36:pass-counter",
      "r37:trigger:activate",
      "r38:effect:apply",
      "r39:pass",
      "r40:play:4:p1-card-24",
      "r41:effect:search-select:p1-card-18",
      "r42:effect:p1-card-16",
      "r43:activate:enel-leader:p1-card-5",
      "r44:attach:p1-leader",
      "r45:attack:p1-leader:p2-leader",
      "r46:pass-block",
      "r47:pass-counter",
      "r48:attack:p1-card-5:p2-leader",
      "r49:effect:p2-card-25",
      "r50:pass-block",
      "r51:counter:p2-card-15",
      "r52:counter:p2-card-35",
      "r53:pass-counter",
      "r54:attack:p1-card-7:p2-leader",
      "r55:effect:p2-card-25",
      "r56:pass-block",
      "r57:pass-counter",
      "r58:attack:p1-card-9:p2-leader",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await page.evaluate(() => {
    (window as unknown as { __freezeAi?: boolean }).__freezeAi = true;
  });
  await page.locator("#trace-input").setInputFiles({
    name: "order-top-or-bottom-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  await page.locator("#trace-pilot").click();

  const modal = page.locator(".decision-modal");
  const top = modal.getByRole("button", {
    name: "Place them at the top of your deck",
  });
  const bottom = modal.getByRole("button", {
    name: "Place them at the bottom of your deck",
  });
  await expect(top).toBeVisible();
  await expect(bottom).toBeVisible();
  await expect(top).toHaveAttribute("data-action", "r59:effect:order:0,1|2");
  await expect(bottom).toHaveAttribute("data-action", "r59:effect:order:0,1|0");

  // Both ends carry the order the arrows compose, not only the first.
  await modal
    .getByRole("button", { name: "Move Vinsmoke Reiju later" })
    .click();
  await expect(top).toHaveAttribute("data-action", "r59:effect:order:1,0|2");
  await expect(bottom).toHaveAttribute("data-action", "r59:effect:order:1,0|0");

  await top.click();
  await expect(top).toBeHidden();
});
