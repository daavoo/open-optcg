import type { Page } from "@playwright/test";

/**
 * Bring a deck's tile into view in an open picker: the shipped shelves are
 * tabs, and a tile on a tab that is not selected is hidden, so a click on it
 * would wait for a deck the player cannot see. A deck of the player's own sits
 * above the tabs and needs nothing.
 */
export async function openShelfOf(
  page: Page,
  seat: "p1" | "p2",
  deckId: string,
): Promise<void> {
  const panel = await page
    .locator(`#${seat}-deck-picker [data-deck-id="${deckId}"]`)
    .first()
    .evaluate((tile) => tile.closest('[role="tabpanel"]')?.id ?? "");
  if (panel) await page.locator(`[aria-controls="${panel}"]`).click();
}
