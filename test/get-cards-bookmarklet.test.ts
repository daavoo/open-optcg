import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";
import { SEALED_LEADER } from "@one-piece-sim/decks";
import {
  bookmarklet,
  GET_CARDS_SCRIPT_URL,
  missingCardsUrl,
  parseMissingCards,
} from "../packages/web/src/get-cards-bookmarklet.js";

/** Runs the bookmarklet's body against stand-ins for the page's globals. */
async function click(response: { ok: boolean; status: number; body: string }) {
  const fetched: string[] = [];
  const appended: { textContent?: string }[] = [];
  const alerts: string[] = [];
  const page = {
    fetch: async (url: string) => {
      fetched.push(url);
      return {
        ok: response.ok,
        status: response.status,
        text: async () => response.body,
      };
    },
    document: {
      createElement: () => ({}) as { textContent?: string },
      body: { append: (node: { textContent?: string }) => appended.push(node) },
    },
    alert: (text: string) => alerts.push(text),
  };
  const body = bookmarklet().slice("javascript:".length);
  // A bookmarklet is a string of code by definition; this is the one place
  // it is run outside a browser.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function("fetch", "document", "alert", body) as (
    ...globals: unknown[]
  ) => void;
  run(page.fetch, page.document, page.alert);
  await new Promise((done) => setTimeout(done, 0));
  return { fetched, appended, alerts };
}

describe("Get cards bookmarklet", () => {
  it("fetches the hosted script, cache-busted, and runs it as an inline script", async () => {
    const { fetched, appended, alerts } = await click({
      ok: true,
      status: 200,
      body: "/* the downloader */",
    });
    expect(fetched).toHaveLength(1);
    expect(fetched[0]!.startsWith(`${GET_CARDS_SCRIPT_URL}?`)).toBe(true);
    expect(appended).toEqual([{ textContent: "/* the downloader */" }]);
    expect(alerts).toEqual([]);
  });

  it("says so, and runs nothing, when the script cannot be fetched", async () => {
    const { appended, alerts } = await click({
      ok: false,
      status: 404,
      body: "Not found",
    });
    expect(appended).toEqual([]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("404");
  });
});

describe("missing-cards link", () => {
  const CARDLIST = "https://en.onepiece-cardgame.com/cardlist/";

  it("carries the card numbers in the fragment, which the downloader reads back", () => {
    const url = missingCardsUrl(CARDLIST, ["EB05-001", "P-118", "PRB02-004"]);
    expect(url.startsWith(`${CARDLIST}#`)).toBe(true);
    expect(parseMissingCards(new URL(url).hash)).toEqual([
      "EB05-001",
      "P-118",
      "PRB02-004",
    ]);
  });

  it("reads every card number a pack carries", () => {
    // The pack's own predicate: `wantedCards` in tools/download-assets.ts.
    const cards = [...cardRegistry.keys()].filter(
      (card) => !card.startsWith("FIX-") && card !== SEALED_LEADER,
    );
    expect(
      parseMissingCards(new URL(missingCardsUrl(CARDLIST, cards)).hash),
    ).toEqual(cards);
  });

  it("asks for nothing without the fragment, and drops what is not a card number", () => {
    expect(parseMissingCards("")).toBeNull();
    expect(parseMissingCards("#top")).toBeNull();
    expect(parseMissingCards("#open-optcg-missing=")).toBeNull();
    expect(
      parseMissingCards(
        "#open-optcg-missing=op01-016,<script>,OP01-016,%20EB05-002",
      ),
    ).toEqual(["OP01-016", "EB05-002"]);
  });
});
