import { expect, test } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

/**
 * Several cards answering one returned DON!! are put to the player in the
 * order they choose.
 *
 * The list is ST-26 with Charlotte Pudding and Eustass"Captain"Kid in place of
 * its two vanillas -- a deck a player builds in the editor, and the one this
 * prompt was asked for. The game is the rules agents playing it until a
 * `DON!! −N` wakes both the Leader and Kid. The pending effect names the first
 * of them as its source, so the title has to say what is being decided rather
 * than crediting that card.
 */
test("simultaneous DON!!-returned clauses ask which resolves first", async ({
  page,
}) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();

  const savedMatch = {
    version: 1,
    config: {
      p1Deck: "custom",
      p2Deck: "(Green) Roronoa Zoro - Starter Deck 32",
      p1CustomDeck: {
        id: "Luffy Pudding Kid",
        leader: "OP09-061",
        cards: {
          "OP05-065": 4,
          "OP05-066": 4,
          "OP05-070": 4,
          "OP09-070": 4,
          "OP09-076": 4,
          "OP09-077": 4,
          "OP09-078": 2,
          "ST26-001": 4,
          "ST26-002": 4,
          "ST26-003": 2,
          "ST26-004": 4,
          "ST26-005": 2,
          "OP08-067": 4,
          "OP05-074": 4,
        },
      },
      p1Controller: "human",
      p2Controller: "rules",
      seed: "order-shot-0",
      startingPlayer: "p1",
    },
    actions: [
      "r0:mulligan:mulligan",
      "r1:mulligan:keep",
      "r2:pass",
      "r3:play:5:p2-card-22",
      "r4:play:2:p2-card-6",
      "r5:effect:skip",
      "r6:pass",
      "r7:play:0:p1-card-33",
      "r8:effect:apply",
      "r9:effect:p2-card-22",
      "r10:effect:apply",
      "r11:attach:p1-leader",
      "r12:attack:p1-leader:p2-leader",
      "r13:pass-block",
      "r14:pass-counter",
      "r15:pass",
      "r16:play:5:p2-card-26",
      "r17:attack:p2-leader:p1-leader",
      "r18:pass-block",
      "r19:pass-counter",
      "r20:pass",
      "r21:play:1:p1-card-47",
      "r22:attack:p1-leader:p2-leader",
      "r23:pass-block",
      "r24:pass-counter",
      "r25:pass",
      "r26:play:5:p2-card-23",
      "r27:attack:p2-leader:p1-leader",
      "r28:pass-block",
      "r29:pass-counter",
      "r30:attack:p2-card-26:p1-leader",
      "r31:block:p1-card-47",
      "r32:pass-counter",
      "r33:attach:p2-leader",
      "r34:attach:p2-leader",
      "r35:pass",
      "r36:attach:p1-leader",
      "r37:play:3:p1-card-50",
      "r38:attach:p1-leader",
      "r39:attack:p1-leader:p2-card-26",
      "r40:pass-block",
      "r41:pass-counter",
      "r42:attack:p1-card-47:p2-leader",
      "r43:pass-block",
      "r44:pass-counter",
      "r45:pass",
      "r46:attach:p2-leader",
      "r47:attach:p2-leader",
      "r48:attach:p2-leader",
      "r49:attack:p2-leader:p1-card-47",
      "r50:pass-block",
      "r51:pass-counter",
      "r52:activate:mechanic-main:p2-leader",
      "r53:attack:p2-leader:p1-leader",
      "r54:pass-block",
      "r55:counter:p1-card-11",
      "r56:counter:p1-card-9",
      "r57:pass-counter",
      "r58:play:1:p2-card-27",
      "r59:play:6:p2-card-4",
      "r60:activate:mechanic-main:p2-card-27",
      "r61:effect:p1-card-33",
      "r62:attack:p2-card-23:p1-leader",
      "r63:block:p1-card-50",
      "r64:pass-counter",
      "r65:pass",
      "r66:play:3:p1-card-40",
      "r67:effect:apply",
      "r68:effect:return-don:rested",
      "r69:effect:return-don:rested",
      "r70:effect:p2-card-23",
      "r71:effect:p2-card-22",
    ],
    initialEvents: [],
    checkpoints: [],
  };

  await page.evaluate(() => {
    (window as unknown as { __freezeAi?: boolean }).__freezeAi = true;
  });
  await page.locator("#trace-input").setInputFiles({
    name: "reaction-order-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  await page.locator("#trace-pilot").click();

  const modal = page.locator(".decision-modal");
  await expect(modal).toContainText("Choose which effect resolves first");
  // One button per card, captioned with the verb alone: the face names it.
  const choices = modal.locator(".effect-card-choice");
  await expect(choices).toHaveCount(2);
  await expect(choices.locator(":scope > b")).toHaveText([
    "Resolve first",
    "Resolve first",
  ]);
  await choices.filter({ hasText: 'Eustass"Captain"Kid' }).click();
  // The Leader is the last one left, so it is not ordered: the question
  // still open is its own apply or skip.
  await expect(modal).not.toContainText("Choose which effect resolves first");
});
