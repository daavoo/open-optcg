import { test as base, type BrowserContext } from "@playwright/test";

export { expect } from "@playwright/test";
export type { Browser, Page } from "@playwright/test";

/**
 * Every e2e test starts from a page that already holds an asset pack, because
 * the app is not played without one: until the card art and printed text are
 * in, the asset gate is the whole page (packages/web/src/screens/asset-gate.ts).
 *
 * The pack is a synthetic one -- one card, `TEST-001`, that no deck plays,
 * with a one-pixel image and placeholder text -- written into the browser's
 * asset database before the page's own scripts run, exactly where a pack the
 * player loaded would be. Real cards keep their drawn faces and say their
 * printed text is not loaded, which is what every test here was written
 * against.
 *
 * The write happens inside the database's upgrade transaction, so the page's
 * own open of the same database waits for it: the pack is there before the
 * app reads it, every time. `test.use({ assetPack: false })` starts a test at
 * the gate instead.
 */
export async function seedAssetPack(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const request = indexedDB.open("open-optcg-assets-v1", 1);
    request.addEventListener("upgradeneeded", () => {
      const store = request.result.createObjectStore("images", {
        keyPath: "key",
      });
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        ),
        (character) => character.charCodeAt(0),
      );
      store.put({
        key: "TEST-001",
        name: "TEST-001.png",
        type: "image/png",
        blob: new Blob([png], { type: "image/png" }),
      });
      store.put({
        key: "PRINTED-TEXT",
        name: "printed-text.json",
        type: "application/json",
        blob: new Blob(
          [
            JSON.stringify({
              version: 1,
              cards: {
                "TEST-001": { name: "Test", effect: "Test text.", trigger: "" },
              },
            }),
          ],
          { type: "application/json" },
        ),
      });
    });
    request.addEventListener("success", () => {
      request.result.close();
    });
  });
}

export const test = base.extend<{ assetPack: boolean }>({
  assetPack: [true, { option: true }],
  context: async ({ context, assetPack }, use) => {
    if (assetPack) await seedAssetPack(context);
    await use(context);
  },
});
