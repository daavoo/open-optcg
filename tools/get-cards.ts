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
 * `art/<card number>.png` -- into a zip. When an Open OPTCG tab opened the
 * card list, the zip goes straight to that tab (see `listenForGetCards`);
 * otherwise it is saved for the player to load.
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
import {
  GET_CARDS_APP_HERE,
  GET_CARDS_HELLO,
  GET_CARDS_PACK,
  GET_CARDS_RECEIVED,
  cardList,
  parseMissingCards,
} from "../packages/web/src/get-cards-bookmarklet.js";

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

/** The pack as a zip assembled in memory, handed over or saved at the end. */
interface ZipWriter {
  write(path: string, data: Uint8Array): void;
  finish(): Promise<Blob>;
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
      return new Blob(parts as BlobPart[], { type: "application/zip" });
    },
  };
}

function saveZip(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** The Open OPTCG tab that opened this page, and the origin it answered from. */
interface AppTab {
  window: Window;
  origin: string;
  /** The cards the app said its pack lacks, or null for the whole pack. */
  missing: string[] | null;
}

/**
 * Says hello to the tab that opened this page and waits briefly for an Open
 * OPTCG page to answer. Null when nothing opened this tab, or what did is not
 * the app. The hello carries nothing, so it may go to any origin; the pack
 * goes only to the one that answered.
 */
function findAppTab(): Promise<AppTab | null> {
  const opener = window.opener as Window | null;
  if (!opener) return Promise.resolve(null);
  return new Promise((resolve) => {
    const finish = (tab: AppTab | null) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(tab);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; missing?: unknown } | null;
      if (event.source === opener && data?.type === GET_CARDS_APP_HERE)
        finish({
          window: opener,
          origin: event.origin,
          missing: cardList(data.missing),
        });
    };
    const timer = setTimeout(() => {
      finish(null);
    }, 1500);
    window.addEventListener("message", onMessage);
    try {
      opener.postMessage({ type: GET_CARDS_HELLO }, "*");
    } catch {
      finish(null);
    }
  });
}

/**
 * Hands the pack to the app tab and waits for it to say whether it loaded.
 * False when the tab has gone, refused it, or never answered.
 */
function sendToApp(app: AppTab, zip: Blob, name: string): Promise<boolean> {
  if (app.window.closed) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(ok);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; ok?: unknown } | null;
      if (event.source === app.window && data?.type === GET_CARDS_RECEIVED)
        finish(data.ok === true);
    };
    // Unpacking a full pack into the app's storage takes a while on a slow
    // machine; this only bounds a tab that will never answer.
    const timer = setTimeout(() => {
      finish(false);
    }, 180_000);
    window.addEventListener("message", onMessage);
    try {
      app.window.postMessage(
        { type: GET_CARDS_PACK, name, zip },
        // A page opened from a file has the opaque origin "null", which a
        // target origin cannot name.
        app.origin === "null" ? "*" : app.origin,
      );
    } catch {
      finish(false);
    }
  });
}

/**
 * Card images kept in this browser between runs, so a run that was closed
 * half way, or one after a new set, fetches only what it does not have yet.
 *
 * IndexedDB rather than `localStorage`, which holds a few MB where a full set
 * of images is a few hundred. It belongs to the page the script runs on --
 * Bandai's card list, in the player's own browser -- like anything else that
 * page stores. An image is kept with the path it came from, so one Bandai
 * moves to a new file is fetched again; the query string is left out of that
 * comparison because the site bumps it for every image at once.
 */
interface ArtCache {
  /** The saved image, if it came from `path`; any saved one when `path` is null. */
  get(card: string, path: string | null): Promise<Uint8Array | null>;
  put(card: string, path: string, bytes: Uint8Array): Promise<void>;
  count(): Promise<number>;
  /** The card numbers saved, whatever path each came from. */
  cards(): Promise<Set<string>>;
  clear(): Promise<void>;
}

const CACHE_DB = "open-optcg-get-cards";
const CACHE_STORE = "art";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("IndexedDB request failed"));
    };
  });
}

/** The cache, or null where the browser keeps no storage (a private window). */
async function openArtCache(): Promise<ArtCache | null> {
  let db: IDBDatabase;
  try {
    const open = indexedDB.open(CACHE_DB, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore(CACHE_STORE, { keyPath: "card" });
    };
    db = await request(open);
  } catch {
    return null;
  }
  const store = (mode: IDBTransactionMode) =>
    db.transaction(CACHE_STORE, mode).objectStore(CACHE_STORE);
  // A full disk or a refused quota turns the cache off for the rest of the
  // run rather than failing it: the zip is what matters.
  let writable = true;
  return {
    async get(card, path) {
      try {
        const row = (await request(store("readonly").get(card))) as
          { path: string; bytes: Uint8Array } | undefined;
        if (!row) return null;
        return path === null || row.path === path ? row.bytes : null;
      } catch {
        return null;
      }
    },
    async put(card, path, bytes) {
      if (!writable) return;
      try {
        await request(store("readwrite").put({ card, path, bytes }));
      } catch {
        writable = false;
      }
    },
    async count() {
      try {
        return await request(store("readonly").count());
      } catch {
        return 0;
      }
    },
    async cards() {
      try {
        const keys = await request(store("readonly").getAllKeys());
        return new Set(keys.map(String));
      } catch {
        return new Set();
      }
    },
    async clear() {
      try {
        await request(store("readwrite").clear());
      } catch {
        // Nothing to forget.
      }
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

/**
 * The list pages that carry `cards`: a card number names its set, and a set's
 * page is named for it (OP18-001 is on `op18`, EB04-001 on `op14-eb04` and
 * `op15-eb04`, P-001 on `promo`).
 */
function seriesOf(
  cards: readonly string[],
): (typeof CARDLIST_SERIES)[number][] {
  const sets = new Set(
    cards.map((card) => {
      const set = card.slice(0, card.indexOf("-")).toLowerCase();
      return set === "p" ? "promo" : set;
    }),
  );
  return CARDLIST_SERIES.filter(([slug]) =>
    slug.split("-").some((part) => sets.has(part)),
  );
}

/**
 * One run: the images and printed text of `only`, or of every card when it is
 * null. The app lays each text pack it loads over the one it has, as it adds
 * images to the ones it has, so a run for some cards reads only their sets'
 * pages -- and every other page only for a card none of those carried.
 */
async function run(
  cache: ArtCache | null,
  say: (line: string) => void,
  only: readonly string[] | null,
): Promise<{ summary: string; zip: Blob }> {
  const zip = zipWriter();
  const wantedSet = new Set(__WANTED_CARDS__);
  const wanted = only ?? __WANTED_CARDS__;
  const fetcher = new PoliteFetcher({ max: __MAX_IN_FLIGHT__ });
  const onlySet = only ? new Set(only) : null;
  const pages = new Map<string, string>();
  const readPages = async (series: readonly (readonly [string, string])[]) => {
    let read = 0;
    await forEachConcurrently(series, fetcher.max, async ([slug, id]) => {
      try {
        pages.set(slug, await fetcher.text(cardlistUrl(id)));
      } catch {
        // Counted below: a missing page shows up as cards with no text.
      }
      read += 1;
      say(`Reading the card list: page ${read} of ${series.length}…`);
    });
  };

  // Series order, not arrival order, as in the Node downloader: a card printed
  // in more than one series keeps the reading of the earlier page.
  const text: Record<string, PrintedCard> = {};
  const images = new Map<string, ArtUrl>();
  const readCards = () => {
    for (const [slug, series] of CARDLIST_SERIES) {
      const html = pages.get(slug);
      if (html === undefined) continue;
      pageImageUrls(html, cardlistUrl(series), images);
      for (const card of parseOfficialCards(html)) {
        if (!wantedSet.has(card.cardNumber) || card.cardNumber in text) {
          continue;
        }
        if (onlySet && !onlySet.has(card.cardNumber)) continue;
        text[card.cardNumber] = {
          name: card.name,
          effect: card.effect,
          trigger: card.trigger,
        };
      }
    }
  };
  await readPages(only ? seriesOf(only) : CARDLIST_SERIES);
  readCards();
  if (only?.some((card) => !(card in text))) {
    await readPages(CARDLIST_SERIES.filter(([slug]) => !pages.has(slug)));
    readCards();
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
  let saved = 0;
  const started = Date.now();
  await forEachConcurrently(wanted, fetcher.max, async (card) => {
    try {
      const listed = images.get(card)?.url;
      // A card no list page carries is found through Bandai's search, a
      // request of its own; a saved copy of it is taken without asking.
      const kept = await cache?.get(
        card,
        listed ? new URL(listed).pathname : null,
      );
      if (kept) {
        saved += 1;
        zip.write(`art/${card}.png`, kept);
      } else {
        const url = listed ?? (await searchImageUrl(fetcher, card));
        const bytes = await fetcher.get(url, "image/");
        zip.write(`art/${card}.png`, bytes);
        await cache?.put(card, new URL(url).pathname, bytes);
      }
    } catch {
      failed.push(card);
    }
    done += 1;
    say(
      `Card images: ${done} of ${wanted.length}` +
        (saved ? ` (${saved} already saved in this browser)` : "") +
        remaining(done - saved, wanted.length - done, Date.now() - started) +
        `, ${fetcher.concurrency} at a time…`,
    );
  });
  say("Finishing…");
  const blob = await zip.finish();
  const summary =
    `${wanted.length - failed.length} cards` +
    (saved ? ` (${saved} already saved)` : "") +
    (failed.length
      ? `, ${failed.length} not found (${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""})`
      : "") +
    ".";
  return { summary, zip: blob };
}

/** The art URL of a promo or reprint no list page carries, from Bandai's search. */
async function searchImageUrl(
  fetcher: PoliteFetcher,
  card: string,
): Promise<string> {
  const page = new URL("/cardlist/", BANDAI);
  page.searchParams.set("search", "true");
  page.searchParams.set("freewords", card);
  const path = officialImageUrls(await fetcher.text(page.href), card)[0];
  if (!path) throw new Error("not on Bandai's card list");
  return new URL(path, page).href;
}

/**
 * ", about 12 minutes left", once enough images have been fetched to judge the
 * rate by. Images taken from the cache cost nothing and are left out.
 */
function remaining(fetched: number, left: number, elapsedMs: number): string {
  if (fetched < 20) return "";
  const minutes = Math.ceil((left * elapsedMs) / fetched / 60_000);
  return minutes <= 1
    ? ", about a minute left"
    : `, about ${minutes} minutes left`;
}

async function start(): Promise<void> {
  const ui = panel();
  if (location.origin !== BANDAI) {
    ui.show(
      `<p>Run this on <a href="${BANDAI}/cardlist/" style="color:inherit">Bandai's card list</a>.</p>` +
        ui.button("Close"),
    );
    ui.box.querySelector("button")!.onclick = () => {
      ui.box.remove();
    };
    return;
  }
  const [cache, app] = await Promise.all([openArtCache(), findAppTab()]);
  const kept = (await cache?.count()) ?? 0;
  // The cards the app said it has no art for, when it opened this page.
  const asked = parseMissingCards(location.hash) ?? app?.missing ?? null;
  // Otherwise, after an earlier run, the cards that run did not save: the
  // new set since then, offered as an update beside the whole pack.
  const saved = kept && !asked ? await cache!.cards() : new Set<string>();
  const unsaved = __WANTED_CARDS__.filter((card) => !saved.has(card));
  const offerUnsaved =
    kept > 0 && unsaved.length > 0 && unsaved.length < __WANTED_CARDS__.length;
  const small = "margin:8px 0 0;font-size:12px;opacity:.75";
  const linkButton = (attribute: string, label: string) =>
    `<button type="button" ${attribute} style="${small};display:block;background:none;border:0;padding:0;text-decoration:underline;cursor:pointer;color:inherit;text-align:left">${label}</button>`;
  const cards = (count: number) => `${count} card${count === 1 ? "" : "s"}`;
  const then = app
    ? `<p style="${small}">They load straight into Open OPTCG.</p>`
    : `<p style="${small}">Then load the zip in Open OPTCG.</p>`;
  const keepGoing = `<p style="${small}">If this tab closes, run the bookmark again to carry on.</p>`;
  ui.show(
    asked
      ? `<p style="margin:0">Open OPTCG is missing ${cards(asked.length)}.</p>` +
          ui.button(`Download ${cards(asked.length)}`) +
          then +
          keepGoing +
          linkButton("data-run-all", "Download every card instead")
      : `<p style="margin:0">Every card: about ${Math.round((__WANTED_CARDS__.length * 0.2) / 10) * 10} MB, a few minutes.` +
          (kept ? ` ${kept} already saved here.` : "") +
          `</p>` +
          ui.button("Download the cards") +
          then +
          keepGoing +
          (offerUnsaved
            ? linkButton(
                "data-run-unsaved",
                `Only the ${cards(unsaved.length)} not saved here yet`,
              )
            : "") +
          (kept ? linkButton("data-forget", "Forget the saved images") : ""),
  );
  ui.box
    .querySelector<HTMLButtonElement>("[data-forget]")
    ?.addEventListener("click", () => {
      void cache?.clear().then(() => start());
    });
  const close = () => {
    ui.box.querySelector("button")!.onclick = () => {
      ui.box.remove();
    };
  };
  const begin = async (only: readonly string[] | null) => {
    const status = (line: string) => {
      ui.show(`<p style="margin:0" aria-live="polite">${line}</p>`);
    };
    status("Starting…");
    // The run lives in this tab: closing it or leaving the page stops it (the
    // images saved so far are kept), so the browser asks first while it runs.
    const holdPage = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", holdPage);
    try {
      const { summary, zip } = await run(cache, status, only);
      const name = only
        ? "open-optcg-assets-update.zip"
        : "open-optcg-assets.zip";
      let sent = false;
      if (app) {
        status("Handing the cards to Open OPTCG…");
        sent = await sendToApp(app, zip, name);
      }
      if (!sent) saveZip(zip, name);
      ui.show(
        (sent
          ? `<p style="margin:0">Done. Switch back to Open OPTCG.</p>`
          : `<p style="margin:0">Done. Load <strong>${name}</strong> in Open OPTCG.</p>`) +
          `<p style="${small}">${summary}</p>` +
          ui.button("Close") +
          (sent
            ? linkButton("data-save-zip", "Save a zip too, for another device")
            : ""),
      );
      ui.box
        .querySelector<HTMLButtonElement>("[data-save-zip]")
        ?.addEventListener("click", () => {
          saveZip(zip, name);
        });
    } catch (error) {
      ui.show(
        `<p style="margin:0">Stopped: ${error instanceof Error ? error.message : String(error)}</p>` +
          ui.button("Close"),
      );
    }
    window.removeEventListener("beforeunload", holdPage);
    close();
  };
  ui.box.querySelector("button")!.onclick = () => {
    void begin(asked);
  };
  ui.box
    .querySelector<HTMLButtonElement>("[data-run-all]")
    ?.addEventListener("click", () => {
      void begin(null);
    });
  ui.box
    .querySelector<HTMLButtonElement>("[data-run-unsaved]")
    ?.addEventListener("click", () => {
      void begin(unsaved);
    });
}

void start();
