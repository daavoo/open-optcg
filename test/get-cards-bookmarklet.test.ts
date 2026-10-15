import { describe, expect, it } from "vitest";
import {
  bookmarklet,
  GET_CARDS_SCRIPT_URL,
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
