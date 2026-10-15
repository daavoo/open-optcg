/**
 * The Get cards bookmarklet, run against a stand-in for Bandai's card list.
 *
 * Every request to Bandai's origin is answered here -- list pages that link
 * one image per card, and a one-pixel PNG for each image -- so the run is
 * offline, quick, and touches nothing of Bandai's, while the script still sees
 * the origin it checks for. What is under test is what a player sees between
 * runs: a tab closed half way carries on from the images already saved, and a
 * run after a finished one fetches none.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import {
  bookmarklet,
  GET_CARDS_SCRIPT_URL,
} from "../../packages/web/src/get-cards-bookmarklet.js";

const BANDAI = "https://en.onepiece-cardgame.com";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** The card numbers the built script asks for, read back out of it. */
function wantedCards(script: string): string[] {
  const numbers = script.match(/"(?:[A-Z]{1,5}\d{0,2}|P)-\d{3}"/g) ?? [];
  return [...new Set(numbers.map((n) => n.slice(1, -1)))];
}

/** Serves the script and a stand-in Bandai; counts the images fetched. */
async function standInBandai(context: BrowserContext, script: string) {
  const imageRequests = { count: 0 };
  const listPage =
    "<!doctype html><html><body>" +
    wantedCards(script)
      .map((n) => `<img data-src="../images/cardlist/card/${n}.png?1">`)
      .join("") +
    "</body></html>";
  await context.route(`${GET_CARDS_SCRIPT_URL}*`, (route) =>
    route.fulfill({ body: script, contentType: "text/javascript" }),
  );
  await context.route(`${BANDAI}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/images/cardlist/card/")) {
      imageRequests.count += 1;
      return route.fulfill({ body: PIXEL_PNG, contentType: "image/png" });
    }
    return route.fulfill({ body: listPage, contentType: "text/html" });
  });
  return imageRequests;
}

/** Opens the card list and clicks the bookmark, as a player does. */
async function clickBookmark(page: Page): Promise<void> {
  await page.goto(`${BANDAI}/cardlist/`);
  await page.evaluate(bookmarklet().slice("javascript:".length));
}

async function artInZip(page: Page): Promise<number> {
  const download = await page.waitForEvent("download", { timeout: 120_000 });
  const entries = unzipSync(
    new Uint8Array(await readFile(await download.path())),
  );
  return Object.keys(entries).filter((name) => name.startsWith("art/")).length;
}

test("a closed run carries on from the images it saved, and a finished one fetches none", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const script = await readFile(resolve("dist/get-cards.js"), "utf8");
  const total = wantedCards(script).length;
  const context = await browser.newContext({ acceptDownloads: true });
  const images = await standInBandai(context, script);

  // A first run, its tab closed once a few hundred images are in.
  let page = await context.newPage();
  await clickBookmark(page);
  await page.getByRole("button", { name: "Download the cards" }).click();
  await expect
    .poll(() => images.count, { timeout: 60_000 })
    .toBeGreaterThan(300);
  await page.close();
  const firstRun = images.count;

  // Run again: it says what it has, fetches only the rest, and the zip is whole.
  page = await context.newPage();
  await clickBookmark(page);
  await expect(page.locator("#open-optcg-get-cards")).toContainText(
    /\d+ card images are already saved in this browser/,
  );
  await page.getByRole("button", { name: "Download the cards" }).click();
  expect(await artInZip(page)).toBe(total);
  // The images that were still in flight when the tab closed are fetched
  // again; everything that had arrived is not.
  expect(images.count - firstRun).toBeLessThan(total - firstRun + 32);
  expect(images.count - firstRun).toBeLessThan(total - 250);
  await expect(page.locator("#open-optcg-get-cards")).toContainText(
    "saved from an earlier run",
  );

  // And once more after a finished run: nothing to fetch.
  const beforeThird = images.count;
  await clickBookmark(page);
  await page.getByRole("button", { name: "Download the cards" }).click();
  expect(await artInZip(page)).toBe(total);
  expect(images.count).toBe(beforeThird);

  // Forgetting them starts over.
  await clickBookmark(page);
  await page.getByRole("button", { name: "Forget the saved images" }).click();
  await expect(
    page.getByRole("button", { name: "Forget the saved images" }),
  ).toHaveCount(0);
  await expect(page.locator("#open-optcg-get-cards")).not.toContainText(
    "card images are already saved",
  );
  await context.close();
});
