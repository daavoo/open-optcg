import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SEALED_LEADER } from "@one-piece-sim/decks";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadAssets,
  pageImageUrls,
  PoliteFetcher,
} from "../tools/download-assets.js";
import { supportedCardNumbers } from "../tools/download-deck-art.js";

const PAGE = "https://en.onepiece-cardgame.com/cardlist/?series=569035";

function respond(
  status: number,
  type: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(status === 200 ? "body" : null, {
    status,
    headers: { "content-type": type, ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("asset downloader", () => {
  it("takes each card's base printing over its parallel and reprint art", () => {
    const images = pageImageUrls(
      `
      <img data-src="#OP12-090_r1">
      <img data-src="../images/cardlist/card/OP12-090_r1.png?260929">
      <img data-src="../images/cardlist/card/OP12-090.png?260929">
      <img data-src="../images/cardlist/card/ST35-001_p1.png?260929">
      <img data-src="../images/cardlist/card/ST35-001_p2.png?260929">
      <img data-src="../images/cardlist/card/P-001.png?1">
      `,
      PAGE,
    );
    expect(images.get("OP12-090")?.url).toBe(
      "https://en.onepiece-cardgame.com/images/cardlist/card/OP12-090.png?260929",
    );
    expect(images.get("ST35-001")?.url).toContain("ST35-001_p1.png");
    expect(images.get("ST35-001")?.base).toBe(false);
    expect(images.has("P-001")).toBe(true);
    expect(images.size).toBe(3);
  });

  it("retries a request the site pushed back on, and slows down", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(503, "text/html", { "retry-after": "0" }))
      .mockResolvedValueOnce(respond(200, "image/png"));
    vi.stubGlobal("fetch", fetch);
    const fetcher = new PoliteFetcher();
    const before = fetcher.concurrency;
    const body = await fetcher.get("https://example.test/a.png", "image/");
    expect(body.toString()).toBe("body");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetcher.concurrency).toBeLessThan(before);
  });

  it("does not retry what plainly does not exist", async () => {
    const fetch = vi.fn().mockResolvedValue(respond(404, "text/html"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      new PoliteFetcher().get("https://example.test/a.png", "image/"),
    ).rejects.toThrow("404");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up rather than wait out a long block", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(respond(429, "text/html", { "retry-after": "3600" }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      new PoliteFetcher().get("https://example.test/a.png", "image/"),
    ).rejects.toThrow("try again later");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe("into a folder that already holds a pack", () => {
    const wanted = supportedCardNumbers().filter(
      (card) => card !== SEALED_LEADER,
    );
    let output: string;

    async function fillPack(skip: string | null): Promise<void> {
      output = await mkdtemp(join(tmpdir(), "open-optcg-assets-"));
      await mkdir(join(output, "art"));
      const cards = Object.fromEntries(
        wanted.map((card) => [card, { name: card, effect: "-", trigger: "" }]),
      );
      await writeFile(
        join(output, "printed-text.json"),
        JSON.stringify({ version: 1, cards }),
      );
      for (const card of wanted) {
        if (card !== skip)
          await writeFile(join(output, "art", `${card}.png`), "x");
      }
    }

    afterEach(async () => {
      await rm(output, { recursive: true, force: true });
    });

    it("sends no request when nothing is missing", async () => {
      await fillPack(null);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const report = await downloadAssets(output, () => {});
      expect(fetch).not.toHaveBeenCalled();
      expect(report.downloaded).toBe(0);
      expect(report.alreadyThere).toBe(wanted.length);
    });

    it("fetches only the image that is missing, and keeps the text", async () => {
      const missing = wanted[0]!;
      await fillPack(missing);
      const imageUrl = `https://en.onepiece-cardgame.com/images/cardlist/card/${missing}.png`;
      const fetch = vi.fn((url: string) =>
        Promise.resolve(
          url === imageUrl
            ? new Response("art", { headers: { "content-type": "image/png" } })
            : new Response(
                `<img data-src="../images/cardlist/card/${missing}.png">`,
                { headers: { "content-type": "text/html" } },
              ),
        ),
      );
      vi.stubGlobal("fetch", fetch);
      const report = await downloadAssets(output, () => {});
      expect(report).toMatchObject({ downloaded: 1, failed: [] });
      const imageRequests = fetch.mock.calls.filter(([url]) =>
        url.includes("/images/"),
      );
      expect(imageRequests).toEqual([[imageUrl, expect.anything()]]);
      expect(
        await readFile(join(output, "art", `${missing}.png`), "utf8"),
      ).toBe("art");
      expect((await readdir(join(output, "art"))).length).toBe(wanted.length);
      const pack = JSON.parse(
        await readFile(join(output, "printed-text.json"), "utf8"),
      ) as { cards: Record<string, unknown> };
      expect(Object.keys(pack.cards)).toHaveLength(wanted.length);
    });
  });
});
