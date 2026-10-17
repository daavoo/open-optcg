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
      "r10:attach:p1-leader",
      "r11:attack:p1-leader:p2-leader",
      "r12:pass-block",
      "r13:pass-counter",
      "r14:pass",
      "r15:play:5:p2-card-26",
      "r16:attack:p2-leader:p1-leader",
      "r17:pass-block",
      "r18:pass-counter",
      "r19:pass",
      "r20:play:1:p1-card-47",
      "r21:attack:p1-leader:p2-leader",
      "r22:pass-block",
      "r23:pass-counter",
      "r24:pass",
      "r25:play:5:p2-card-23",
      "r26:attack:p2-leader:p1-leader",
      "r27:pass-block",
      "r28:pass-counter",
      "r29:attack:p2-card-26:p1-leader",
      "r30:block:p1-card-47",
      "r31:pass-counter",
      "r32:attach:p2-leader",
      "r33:attach:p2-leader",
      "r34:pass",
      "r35:attach:p1-leader",
      "r36:play:3:p1-card-50",
      "r37:attach:p1-leader",
      "r38:attack:p1-leader:p2-card-26",
      "r39:pass-block",
      "r40:pass-counter",
      "r41:attack:p1-card-47:p2-leader",
      "r42:pass-block",
      "r43:pass-counter",
      "r44:pass",
      "r45:attach:p2-leader",
      "r46:attach:p2-leader",
      "r47:attach:p2-leader",
      "r48:attack:p2-leader:p1-card-47",
      "r49:pass-block",
      "r50:pass-counter",
      "r51:activate:mechanic-main:p2-leader",
      "r52:attack:p2-leader:p1-leader",
      "r53:pass-block",
      "r54:counter:p1-card-11",
      "r55:counter:p1-card-9",
      "r56:pass-counter",
      "r57:play:1:p2-card-27",
      "r58:play:6:p2-card-4",
      "r59:activate:mechanic-main:p2-card-27",
      "r60:effect:p1-card-33",
      "r61:attack:p2-card-23:p1-leader",
      "r62:block:p1-card-50",
      "r63:pass-counter",
      "r64:pass",
      "r65:play:3:p1-card-40",
      "r66:effect:apply",
      "r67:effect:return-don:rested",
      "r68:effect:return-don:rested",
      "r69:effect:p2-card-23",
      "r70:effect:p2-card-22",
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
  // The Leader is the last one left, so it resolves without a question.
  await expect(modal).not.toContainText("Choose which effect resolves first");
});
