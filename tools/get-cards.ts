/**
 * The asset downloader as a script the player's browser runs on Bandai's own
 * card list page, started from a bookmarklet.
 *
 * Running there is the point: the list pages and the card images are on the
 * same origin as the page, so the browser lets the script read them, where a
 * script on the hosted app's origin could not (Bandai sends no CORS headers).
 * Nothing is installed and nothing needs signing, and the text and art still go
 * straight from Bandai to the player's machine.
 *
 * It writes what `tools/download-assets.ts` writes -- `printed-text.json` and
 * `art/<card number>.png` -- into a zip it saves, which the app loads.
 *
 * Built by `tools/build-get-cards.ts` into `dist/get-cards.js`, which the
 * hosted site serves next to the app. The bookmarklet only fetches and runs
 * that file (`packages/web/src/get-cards-bookmarklet.ts`), so a fix reaches
 * every player without them touching the bookmark.
 */
import { Zip, ZipPassThrough } from "fflate";
import { parseOfficialCards } from "./audit-cards/src/parse-cardlist.js";
import {
  officialImageUrls,
  pageImageUrls,
  type ArtUrl,
} from "./fetch-reference/src/card-images.js";
import {
  forEachConcurrently,
  PoliteFetcher,
} from "./fetch-reference/src/polite-fetcher.js";
import {
  BANDAI,
  CARDLIST_SERIES,
  cardlistUrl,
} from "./fetch-reference/src/sources.js";

/** Every card number the engine knows, sorted; injected by the build. */
declare const __WANTED_CARDS__: string[];

type PrintedCard = { name: string; effect: string; trigger: string };

/**
 * The most requests in flight; injected by the build. Twice the Node
 * downloader's ceiling: a browser multiplexes them over one HTTP/2
 * connection, and each request spends about a second waiting for its first
 * byte, so it is waiting, not bandwidth, that more of them overlap. The
 * fetcher only climbs this high while every request succeeds.
 */
declare const __MAX_IN_FLIGHT__: number;

const PANEL_ID = "open-optcg-get-cards";

/** The pack as a zip assembled in memory, saved as a download at the end. */
interface ZipWriter {
  write(path: string, data: Uint8Array): void;
  finish(): Promise<void>;
}

function zipWriter(): ZipWriter {
  // Streamed into chunks rather than one buffer: a full run is a few hundred
  // MB of PNGs, and a Blob made of parts never needs them contiguous.
  const parts: Uint8Array[] = [];
  let done: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const zip = new Zip((error, chunk, final) => {
    if (error) throw error;
    parts.push(chunk);
    if (final) done();
  });
  return {
    write(path, data) {
      // Stored, not deflated: PNGs do not compress, and deflating 400 MB on
      // the page's thread would freeze it.
      const entry = new ZipPassThrough(path);
      zip.add(entry);
      entry.push(data, true);
    },
    async finish() {
      zip.end();
      await finished;
      const url = URL.createObjectURL(
        new Blob(parts as BlobPart[], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "open-optcg-assets.zip";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    },
  };
}

/** The panel on Bandai's page: the choice, then progress, then the result. */
function panel() {
  document.getElementById(PANEL_ID)?.remove();
  const box = document.createElement("div");
  box.id = PANEL_ID;
  box.setAttribute(
    "style",
    "position:fixed;z-index:2147483647;top:16px;right:16px;width:min(360px,calc(100vw - 32px));" +
      "background:#fffaf0;color:#1d1b16;border:2px solid #1d1b16;border-radius:10px;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.25);padding:16px;font:14px/1.45 system-ui,sans-serif",
  );
  document.body.append(box);
  const button = (label: string) =>
    `<button type="button" style="display:block;width:100%;margin-top:8px;padding:8px 12px;` +
    `font:600 14px system-ui,sans-serif;background:#1d1b16;color:#fffaf0;border:0;border-radius:6px;cursor:pointer">${label}</button>`;
  return {
    box,
    show(html: string) {
      box.innerHTML =
        `<strong style="display:block;font-size:15px;margin-bottom:6px">Open OPTCG: get cards</strong>` +
        html;
    },
    button,
  };
}

async function run(say: (line: string) => void): Promise<string> {
  const zip = zipWriter();
  const wanted = __WANTED_CARDS__;
  const wantedSet = new Set(wanted);
  const fetcher = new PoliteFetcher({ max: __MAX_IN_FLIGHT__ });
  const pages = new Map<string, string>();
  let read = 0;
  await forEachConcurrently(
    CARDLIST_SERIES,
    fetcher.max,
    async ([slug, series]) => {
      try {
        pages.set(slug, await fetcher.text(cardlistUrl(series)));
      } catch {
        // Counted below: a missing page shows up as cards with no text.
      }
      read += 1;
      say(`Reading the card list: page ${read} of ${CARDLIST_SERIES.length}…`);
    },
  );

  // Series order, not arrival order, as in the Node downloader: a card printed
  // in more than one series keeps the reading of the earlier page.
  const text: Record<string, PrintedCard> = {};
  const images = new Map<string, ArtUrl>();
  for (const [slug, series] of CARDLIST_SERIES) {
    const html = pages.get(slug);
    if (html === undefined) continue;
    pageImageUrls(html, cardlistUrl(series), images);
    for (const card of parseOfficialCards(html)) {
      if (!wantedSet.has(card.cardNumber) || card.cardNumber in text) continue;
      text[card.cardNumber] = {
        name: card.name,
        effect: card.effect,
        trigger: card.trigger,
      };
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(text).sort(([a], [b]) => a.localeCompare(b)),
  );
  zip.write(
    "printed-text.json",
    new TextEncoder().encode(
      `${JSON.stringify(
        {
          version: 1,
          source: `Bandai card list (${cardlistUrl("<series>")}), fetched ${new Date().toISOString().slice(0, 10)}`,
          cards: sorted,
        },
        null,
        2,
      )}\n`,
    ),
  );

  const failed: string[] = [];
  let done = 0;
  const started = Date.now();
  await forEachConcurrently(wanted, fetcher.max, async (card) => {
    try {
      let url = images.get(card)?.url;
      if (!url) {
        // A promo or reprint no list page carries: Bandai's search finds it.
        const page = new URL("/cardlist/", BANDAI);
        page.searchParams.set("search", "true");
        page.searchParams.set("freewords", card);
        const path = officialImageUrls(await fetcher.text(page.href), card)[0];
        if (!path) throw new Error("not on Bandai's card list");
        url = new URL(path, page).href;
      }
      zip.write(`art/${card}.png`, await fetcher.get(url, "image/"));
    } catch {
      failed.push(card);
    }
    done += 1;
    say(
      `Downloading card images: ${done} of ${wanted.length}` +
        remaining(done, wanted.length, Date.now() - started) +
        ` (${fetcher.concurrency} at a time)…`,
    );
  });
  say("Finishing…");
  await zip.finish();
  return (
    `Printed text for ${Object.keys(sorted).length} of ${wanted.length} cards, ` +
    `${wanted.length - failed.length} images` +
    (failed.length
      ? `, ${failed.length} not found (${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""})`
      : "") +
    "."
  );
}

/** ", about 12 minutes left", once there is enough of a run to judge by. */
function remaining(done: number, total: number, elapsedMs: number): string {
  if (done < 20) return "";
  const minutes = Math.ceil(((total - done) * elapsedMs) / done / 60_000);
  return minutes <= 1
    ? ", about a minute left"
    : `, about ${minutes} minutes left`;
}

function start(): void {
  const ui = panel();
  if (location.origin !== BANDAI) {
    ui.show(
      `<p>This runs on Bandai's card list. Open <a href="${BANDAI}/cardlist/" style="color:inherit">${BANDAI.replace("https://", "")}/cardlist</a>, then click the bookmark again.</p>` +
        ui.button("Close"),
    );
    ui.box.querySelector("button")!.onclick = () => {
      ui.box.remove();
    };
    return;
  }
  ui.show(
    `<p style="margin:0">Downloads the printed text and art of every card Open OPTCG plays, from this site, into one zip. About ${Math.round((__WANTED_CARDS__.length * 0.2) / 10) * 10} MB, a few minutes.</p>` +
      `<p style="margin:8px 0 0">You can switch to other tabs while it runs. Closing this tab, reloading it or leaving this page stops it.</p>` +
      ui.button("Download the cards") +
      `<p style="margin:8px 0 0;font-size:12px;opacity:.75">Then, in Open OPTCG, load the zip.</p>`,
  );
  const close = () => {
    ui.box.querySelector("button")!.onclick = () => {
      ui.box.remove();
    };
  };
  ui.box.querySelector("button")!.onclick = async () => {
    const status = (line: string) => {
      ui.show(`<p style="margin:0" aria-live="polite">${line}</p>`);
    };
    status("Starting…");
    // The run lives in this tab: closing it or leaving the page throws the
    // download away, so the browser asks first while it is running.
    const holdPage = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", holdPage);
    try {
      const summary = await run(status);
      ui.show(
        `<p style="margin:0">Done: <strong>open-optcg-assets.zip</strong> is in your downloads. ${summary}</p>` +
          ui.button("Close"),
      );
    } catch (error) {
      ui.show(
        `<p style="margin:0">Stopped: ${error instanceof Error ? error.message : String(error)}</p>` +
          ui.button("Close"),
      );
    }
    window.removeEventListener("beforeunload", holdPage);
    close();
  };
}

start();
