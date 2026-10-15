/**
 * A finished matchup run's sample games, downloaded and loaded back.
 *
 * The download is only worth having if the files in it are traces the lobby
 * reads, so this takes one out of the zip and watches it in the replay view.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "./fixtures.js";

const appUrl = pathToFileURL(
  resolve(process.cwd(), "dist/open-optcg.html"),
).href;

test("a finished run downloads its sample games as traces the lobby loads", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(appUrl);
  await expect(page.locator("#setup-form")).toBeVisible();
  await page.getByRole("button", { name: "Simulate matchup" }).click();

  // Nothing to download until a run has finished.
  await expect(page.locator("#sim-sample")).toHaveCount(0);
  await page.locator('[data-run-games="100"]').click();
  await page.locator("#sim-run").click();
  await expect(page.locator(".matchup-verdict")).toBeVisible({
    timeout: 90_000,
  });

  const button = page.locator("#sim-sample");
  await expect(button).toBeEnabled();
  const missing = Number(await button.getAttribute("data-missing"));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    button.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^open-optcg-sample-.*\.zip$/);
  const entries = unzipSync(
    new Uint8Array(await readFile(await download.path())),
  );
  const manifest = JSON.parse(strFromU8(entries["manifest.json"]!)) as {
    games: Array<{ file: string }>;
    missing: unknown[];
  };
  expect(manifest.missing).toHaveLength(missing);
  expect(manifest.games.length + manifest.missing.length).toBe(4);
  const first = manifest.games[0]!.file;

  // Back in the lobby, the file loads like any exported trace.
  await page.locator("#analytics-back").click();
  await expect(page.locator("#setup-form")).toBeVisible();
  await page.locator("#trace-input").setInputFiles({
    name: first,
    mimeType: "application/x-ndjson",
    buffer: Buffer.from(entries[first]!),
  });
  await page.locator("#trace-replay").click();
  await expect(page.locator(".replay-bar")).toBeVisible();
});
