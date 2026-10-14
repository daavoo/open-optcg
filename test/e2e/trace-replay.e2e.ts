/**
 * Watching a trace back.
 *
 * A loaded file can be played on from or watched; this drives the watching
 * half -- the choice, the playback, jumping about in it, and sitting down at a
 * seat -- because every part of it is a surface, and a surface nobody looks at
 * is a surface nobody has checked.
 */
import { expect, test, type Page } from "./fixtures.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

/** Two rules agents, four turns in, as an exported trace records them. */
const savedMatch = {
  version: 1,
  config: {
    p1Deck: "(Green/Yellow) Yamato - Official Feature Deck",
    p2Deck: "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
    p1Controller: "rules",
    p2Controller: "rules",
    seed: "replay-e2e",
    startingPlayer: "p1",
  },
  actions: [
    "r0:mulligan:mulligan",
    "r1:mulligan:mulligan",
    "r2:pass",
    "r3:activate:mechanic-event:p2-card-35",
    "r4:effect:p2-card-45",
    "r5:effect:order:0,1,2,3",
    "r6:activate:mechanic-main:p2-leader",
    "r7:effect:apply",
    "r8:pass",
    "r9:play:1:p1-card-11",
    "r10:activate:mechanic-main:p1-leader",
    "r11:effect:p1-card-11",
    "r12:attach:p1-leader",
    "r13:attack:p1-leader:p2-leader",
    "r14:pass-block",
    "r15:pass-counter",
    "r16:pass",
    "r17:play:7:p2-card-15",
    "r18:activate:mechanic-main:p2-leader",
    "r19:effect:p1-card-11",
    "r20:attach:p2-leader",
    "r21:attach:p2-leader",
    "r22:attach:p2-leader",
    "r23:attack:p2-leader:p1-leader",
    "r24:pass-block",
    "r25:pass-counter",
  ],
  initialEvents: [],
  checkpoints: [],
};

async function watchTheTrace(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
  await page.locator("#trace-input").setInputFiles({
    name: "agents.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });
  await page.locator("#trace-replay").click();
  await expect(page.locator(".replay-bar")).toBeVisible();
}

test("a trace is loaded to be piloted or to be watched", async ({ page }) => {
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
  await page.locator("#trace-input").setInputFiles({
    name: "agents.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedMatch)),
  });

  // The file names itself before either answer is given.
  const dialog = page.locator("#trace-load-choice");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Yamato");
  await expect(dialog).toContainText("26 actions");

  // Piloting resumes the file: the whole of it, and none of the controls for
  // reading it back. This one records two agents, so what it resumes into is a
  // simulation of the rest of their game -- there is no seat in the file that
  // was anybody's to be dropped into -- and a simulation is watched, hands up,
  // from the strip of its own.
  await page.locator("#trace-pilot").click();
  await expect(page.locator(".game-shell")).toBeVisible();
  await expect(page.locator(".replay-bar")).toHaveCount(0);
  await expect(page.locator(".simulate-bar")).toBeVisible();
  await expect(page.locator(".revealed-hand")).toHaveCount(1);
});

test("a watched trace starts before its first action, with both hands up", async ({
  page,
}) => {
  await watchTheTrace(page);

  // The board is the opening position, not the end of the file.
  await expect(page.locator(".replay-position")).toHaveText("0 / 26");
  await expect(page.locator(".turn-status")).toContainText("Turn 1");
  // Their hand is face up, and it is the same hand the count claims.
  const revealed = page.locator(".revealed-hand .game-card");
  await expect(revealed).toHaveCount(5);
  await expect(
    page.locator(".opponent-hand-zone .physical-card-back"),
  ).toHaveCount(0);
  // A spectator is asked nothing: no decision list, no card panel.
  await expect(page.locator(".decision-modal")).toHaveCount(0);
});

test("a watched trace steps, plays and jumps through the file", async ({
  page,
}) => {
  await watchTheTrace(page);
  const position = page.locator(".replay-position");

  await page.locator("#replay-forward").click();
  await expect(position).toHaveText("1 / 26");
  await page.locator("#replay-back").click();
  await expect(position).toHaveText("0 / 26");
  // Nothing to go back to at the start of the file.
  await expect(page.locator("#replay-back")).toBeDisabled();

  // Playing it advances on its own, and pausing stops it where it is.
  await page.locator("#replay-play").click();
  await expect(position).not.toHaveText("0 / 26");
  await page.locator("#replay-play").click();
  const paused = await position.textContent();
  await page.waitForTimeout(1600);
  await expect(position).toHaveText(paused!);

  // A turn is a place in the file, and jumping to one lands on that turn. The
  // options are the turns in order, so the third of them is turn 3.
  await page.locator("#replay-turn").selectOption({ index: 2 });
  await expect(page.locator(".turn-status")).toContainText("Turn 3");
  await page.locator("#replay-turn").selectOption({ index: 1 });
  await expect(page.locator(".turn-status")).toContainText("Turn 2");
  // Backwards and forwards again: the file still holds what was wound past.
  await page.locator("#replay-turn").selectOption({ index: 3 });
  await expect(page.locator(".turn-status")).toContainText("Turn 4");
});

test("a watched trace is jumped about in from the history, not reset", async ({
  page,
}) => {
  await watchTheTrace(page);
  await page.locator("#replay-turn").selectOption({ index: 3 });
  await page.locator("#history-toggle").click();

  // The history button says what it does here: nothing is discarded by it.
  const jumps = page.locator(".history-reset");
  await expect(jumps.first()).toContainText("Jump");
  await jumps.last().click();
  // It acts on the click rather than asking to confirm a reset.
  await expect(page.locator(".rewind-confirm-dialog")).toHaveCount(0);
  await expect(page.locator(".replay-position")).not.toHaveText("26 / 26");
});

test("a seat can be taken over from the position being watched", async ({
  page,
}) => {
  await watchTheTrace(page);
  await page.locator("#replay-turn").selectOption({ index: 2 });
  const position = await page.locator(".replay-position").textContent();
  await page.locator("#replay-takeover").click();

  // The replay is over: the controls go, and the other seat's hand goes back
  // face down, because it is an opponent again.
  await expect(page.locator(".replay-bar")).toHaveCount(0);
  await expect(page.locator(".revealed-hand")).toHaveCount(0);
  await expect(
    page.locator(".opponent-hand-zone .physical-card-back").first(),
  ).toBeVisible();
  // The position is the one that was on screen, and it is a match now: the
  // history offers a reset rather than a jump.
  await page.locator("#history-toggle").click();
  await expect(page.locator(".history-reset").first()).toContainText("Reset");
  expect(position).not.toBeNull();
});
