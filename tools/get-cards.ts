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
 * `art/<card number>.png` -- into a folder the player picks (where the browser
 * can pick one) or a zip it saves; the app loads either.
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
  BANDAI,
  CARDLIST_SERIES,
  cardlistUrl,
} from "./fetch-reference/src/sources.js";

/** Every card number the engine knows, sorted; injected by the build. */
declare const __WANTED_CARDS__: string[];

type PrintedCard = { name: string; effect: string; trigger: string };

const CONCURRENCY = 4;
const MAX_ATTEMPTS = 5;
/** Statuses that mean "slow down", as in the Node downloader. */
const THROTTLED = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const PANEL_ID = "open-optcg-get-cards";

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The body of `url`, retried with a growing pause while the site pushes back. */
async function get(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetch(url, { credentials: "omit" });
    } catch {
      // A dropped connection: retried like a throttle.
    }
    if (response?.ok) return response;
    if (response && !THROTTLED.has(response.status)) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(response ? `${response.status}` : "network error");
    }
    await sleep(1000 * 2 ** (attempt - 1));
  }
}

async function forEachConcurrently<T>(
  items: readonly T[],
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

/** Where the files go: a picked folder, or a zip assembled in memory. */
interface Sink {
  has(path: string): Promise<boolean>;
  write(path: string, data: Uint8Array): Promise<void>;
  finish(): Promise<void>;
}

async function folderSink(): Promise<Sink> {
  const root = await (
    window as unknown as {
      showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker({ id: "open-optcg-assets", mode: "readwrite" });
  const art = await root.getDirectoryHandle("art", { create: true });
  const dirFor = (path: string) =>
    path.startsWith("art/")
      ? { dir: art, name: path.slice(4) }
      : { dir: root, name: path };
  return {
    // A rerun into the same folder fetches only what is missing, as the Node
    // downloader does.
    async has(path) {
      const { dir, name } = dirFor(path);
      try {
        return (await (await dir.getFileHandle(name)).getFile()).size > 0;
      } catch {
        return false;
      }
    },
    async write(path, data) {
      const { dir, name } = dirFor(path);
      const writable = await (
        await dir.getFileHandle(name, { create: true })
      ).createWritable();
      await writable.write(data as Uint8Array<ArrayBuffer>);
      await writable.close();
    },
    async finish() {},
  };
}

function zipSink(): Sink {
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
    async has() {
      return false;
    },
    async write(path, data) {
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

async function run(sink: Sink, say: (line: string) => void): Promise<string> {
  const wanted = __WANTED_CARDS__;
  const wantedSet = new Set(wanted);
  const pages = new Map<string, string>();
  let read = 0;
  await forEachConcurrently(CARDLIST_SERIES, async ([slug, series]) => {
    try {
      pages.set(slug, await (await get(cardlistUrl(series))).text());
    } catch {
      // Counted below: a missing page shows up as cards with no text.
    }
    read += 1;
    say(`Reading the card list: page ${read} of ${CARDLIST_SERIES.length}…`);
  });

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
  await sink.write(
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

  const missing: string[] = [];
  for (const card of wanted) {
    if (!(await sink.has(`art/${card}.png`))) missing.push(card);
  }
  const failed: string[] = [];
  let done = 0;
  await forEachConcurrently(missing, async (card) => {
    try {
      let url = images.get(card)?.url;
      if (!url) {
        // A promo or reprint no list page carries: Bandai's search finds it.
        const page = new URL("/cardlist/", BANDAI);
        page.searchParams.set("search", "true");
        page.searchParams.set("freewords", card);
        const path = officialImageUrls(
          await (await get(page.href)).text(),
          card,
        )[0];
        if (!path) throw new Error("not on Bandai's card list");
        url = new URL(path, page).href;
      }
      const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
      await sink.write(`art/${card}.png`, bytes);
    } catch {
      failed.push(card);
    }
    done += 1;
    say(`Downloading card images: ${done} of ${missing.length}…`);
  });
  say("Finishing…");
  await sink.finish();
  return (
    `Printed text for ${Object.keys(sorted).length} of ${wanted.length} cards, ` +
    `${missing.length - failed.length} images downloaded` +
    (missing.length < wanted.length
      ? ` (${wanted.length - missing.length} already there)`
      : "") +
    (failed.length
      ? `, ${failed.length} not found (${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""})`
      : "") +
    "."
  );
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
  const canPickFolder = "showDirectoryPicker" in window;
  ui.show(
    `<p style="margin:0">Downloads the printed text and art of every card Open OPTCG plays, from this site, onto your computer. About ${Math.round((__WANTED_CARDS__.length * 0.2) / 10) * 10} MB; keep this tab open.</p>` +
      (canPickFolder ? ui.button("Save into a folder") : "") +
      ui.button("Download as a zip") +
      `<p style="margin:8px 0 0;font-size:12px;opacity:.75">Then, in Open OPTCG, load ${canPickFolder ? "the folder or " : ""}the zip.</p>`,
  );
  const [folderButton, zipButton] = canPickFolder
    ? [...ui.box.querySelectorAll("button")]
    : [null, ui.box.querySelector("button")];
  const go = async (makeSink: () => Promise<Sink> | Sink) => {
    let sink: Sink;
    try {
      sink = await makeSink();
    } catch {
      return; // The folder picker was cancelled.
    }
    const status = (line: string) => {
      ui.show(`<p style="margin:0" aria-live="polite">${line}</p>`);
    };
    status("Starting…");
    try {
      const summary = await run(sink, status);
      ui.show(`<p style="margin:0">Done. ${summary}</p>` + ui.button("Close"));
    } catch (error) {
      ui.show(
        `<p style="margin:0">Stopped: ${error instanceof Error ? error.message : String(error)}</p>` +
          ui.button("Close"),
      );
    }
    ui.box.querySelector("button")!.onclick = () => {
      ui.box.remove();
    };
  };
  if (folderButton) folderButton.onclick = () => void go(folderSink);
  zipButton!.onclick = () => void go(zipSink);
}

start();
