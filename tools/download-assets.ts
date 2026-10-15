/**
 * The asset downloader: fetches the printed text and the card art the
 * published app deliberately ships without, from Bandai's own card list, into
 * a folder on the player's disk. It does nothing else.
 *
 *   pnpm assets:download [--output=<dir>]     (default: open-optcg-assets/)
 *   open-optcg-assets                         (double-clicked: asks for a folder)
 *
 * writes `<dir>/printed-text.json` (the text of every card the engine knows)
 * and `<dir>/art/<card number>.png` (one image per card). Then, in the app:
 * home screen, "Load asset folder", pick `<dir>`. `pnpm assets:package` wraps
 * this file as the double-click executable -- see docs/asset-packs.md.
 *
 * Rerunning it into the same folder fetches only what is missing: an image
 * already on disk is never fetched again, and a folder that already holds
 * everything costs no request at all. Images are written under a temporary
 * name and renamed, so an interrupted run never leaves a half image that a
 * later run would mistake for a finished one.
 *
 * The card list is one Apache host with no CDN in front of it, so the fetcher
 * below is what keeps a full run (about 60 list pages and 2,000 images) fast
 * without looking like an attack: a handful of requests in flight, more only
 * while every request succeeds, half as many and a pause for everyone the
 * moment the site pushes back, and `Retry-After` honoured when it is sent.
 */
import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { cardRegistry } from "@one-piece-sim/cards";
import { SEALED_LEADER } from "@one-piece-sim/decks";
import { chooseFolder, showMessage } from "./assets-dialog.js";
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

export { pageImageUrls };

const USER_AGENT =
  "open-optcg-asset-downloader/0.2 (+https://github.com/daavoo/open-optcg)";
/** Requests in flight at the start, and the most it will ever grow to. */
const START_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;
const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;
/** A `Retry-After` longer than this is a block, not a pause; give up instead. */
const MAX_RETRY_AFTER_MS = 5 * 60_000;
/**
 * Statuses that mean "slow down" rather than "this does not exist": rate
 * limits, an overloaded server, and the 403 a web firewall answers with once
 * it has decided a client is too eager.
 */
const THROTTLED = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const IMAGE_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const PARTIAL_SUFFIX = ".part";
const DEFAULT_FOLDER_NAME = "open-optcg-assets";

type PrintedCard = { name: string; effect: string; trigger: string };

const sleep = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, Math.max(0, ms)));

class PermanentError extends Error {}

/**
 * Every request goes through one of these, so the whole run shares one
 * concurrency budget and one view of whether the site is pushing back.
 * Additive increase, multiplicative decrease: one more request in flight
 * after each full window of successes, half as many after any failure.
 */
export class PoliteFetcher {
  private limit = START_CONCURRENCY;
  private active = 0;
  private successesAtLimit = 0;
  private pausedUntil = 0;
  private readonly waiting: (() => void)[] = [];

  get concurrency(): number {
    return this.limit;
  }

  private async acquire(): Promise<void> {
    for (;;) {
      const pause = this.pausedUntil - Date.now();
      if (pause > 0) await sleep(pause);
      else if (this.active < this.limit) {
        this.active += 1;
        return;
      } else await new Promise<void>((wake) => this.waiting.push(wake));
    }
  }

  private release(): void {
    this.active -= 1;
    this.wake();
  }

  private wake(): void {
    const free = Math.max(1, this.limit - this.active);
    for (const wake of this.waiting.splice(0, free)) wake();
  }

  private succeeded(): void {
    this.successesAtLimit += 1;
    if (
      this.successesAtLimit >= this.limit * 2 &&
      this.limit < MAX_CONCURRENCY
    ) {
      this.limit += 1;
      this.successesAtLimit = 0;
      this.wake();
    }
  }

  private pushedBack(pauseMs: number): void {
    this.limit = Math.max(1, Math.floor(this.limit / 2));
    this.successesAtLimit = 0;
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + pauseMs);
  }

  /** The body of `url`, retried until it arrives or plainly never will. */
  async get(
    url: string,
    expectedType: "text/html" | "image/",
  ): Promise<Buffer> {
    let lastError: Error = new Error(url);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const backoff =
        Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1)) + randomInt(1000);
      let pause = backoff;
      await this.acquire();
      try {
        const response = await fetch(url, {
          headers: { "user-agent": USER_AGENT },
          redirect: "follow",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) {
          const type = response.headers.get("content-type") ?? "";
          if (!type.startsWith(expectedType)) {
            await response.body?.cancel();
            throw new PermanentError(`unexpected content type ${type || "?"}`);
          }
          const body = Buffer.from(await response.arrayBuffer());
          this.succeeded();
          return body;
        }
        await response.body?.cancel();
        if (!THROTTLED.has(response.status)) {
          throw new PermanentError(`${response.status} ${response.statusText}`);
        }
        const retryAfter = retryAfterMs(response.headers.get("retry-after"));
        if (retryAfter !== null && retryAfter > MAX_RETRY_AFTER_MS) {
          throw new PermanentError(
            `${response.status}: the site asked to wait ${Math.round(retryAfter / 60_000)} minutes; try again later`,
          );
        }
        pause = Math.max(backoff, retryAfter ?? 0);
        lastError = new Error(`${response.status} ${response.statusText}`);
      } catch (error) {
        if (error instanceof PermanentError) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
      } finally {
        this.release();
      }
      // A timeout or a dropped connection is pushback too: an overloaded
      // server sheds connections before it starts answering 503.
      this.pushedBack(pause);
      if (attempt < MAX_ATTEMPTS) await sleep(pause);
    }
    throw lastError;
  }
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/** Runs `worker` over `items` with every item started as soon as allowed. */
async function forEachConcurrently<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
): Promise<void> {
  // The fetcher does the limiting; this only keeps the number of pending
  // promises (and open file handles while writing) bounded.
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENCY, items.length) },
      async () => {
        while (next < items.length) await worker(items[next++]!);
      },
    ),
  );
}

/**
 * Every card a player can put in a deck, which is what the app can show --
 * less the sealed promo Leader, which Bandai lists nowhere (see
 * `packages/cards/src/sealed-promo.ts`), so its text and art have no Bandai
 * source to come from.
 */
export function wantedCards(): string[] {
  return [...cardRegistry.keys()]
    .filter((number) => !number.startsWith("FIX-") && number !== SEALED_LEADER)
    .sort((left, right) => left.localeCompare(right));
}

interface CardList {
  text: Record<string, PrintedCard>;
  images: Map<string, ArtUrl>;
  failedPages: string[];
}

/** Reads every card list page: the printed text and the art URL of each card. */
async function readCardList(
  fetcher: PoliteFetcher,
  wanted: ReadonlySet<string>,
  log: (line: string) => void,
): Promise<CardList> {
  const pages = new Map<string, string>();
  const failedPages: string[] = [];
  await forEachConcurrently(CARDLIST_SERIES, async ([slug, series]) => {
    try {
      pages.set(
        slug,
        (await fetcher.get(cardlistUrl(series), "text/html")).toString("utf8"),
      );
    } catch (error) {
      failedPages.push(slug);
      log(`  could not read the ${slug} list: ${message(error)}`);
    }
  });
  const text: Record<string, PrintedCard> = {};
  const images = new Map<string, ArtUrl>();
  // Series order, not arrival order: a card printed in more than one series
  // keeps the reading of the earlier page, which is the one its set module
  // was audited from.
  for (const [slug, series] of CARDLIST_SERIES) {
    const html = pages.get(slug);
    if (html === undefined) continue;
    pageImageUrls(html, cardlistUrl(series), images);
    try {
      for (const card of parseOfficialCards(html)) {
        if (!wanted.has(card.cardNumber) || card.cardNumber in text) continue;
        text[card.cardNumber] = {
          name: card.name,
          effect: card.effect,
          trigger: card.trigger,
        };
      }
    } catch (error) {
      log(`  could not read the text on the ${slug} list: ${message(error)}`);
    }
  }
  return { text, images, failedPages };
}

async function readTextPack(
  output: string,
): Promise<Record<string, PrintedCard>> {
  try {
    const pack = JSON.parse(
      await readFile(join(output, "printed-text.json"), "utf8"),
    ) as { cards?: Record<string, PrintedCard> };
    return pack.cards ?? {};
  } catch {
    return {};
  }
}

async function writeTextPack(
  output: string,
  cards: Record<string, PrintedCard>,
): Promise<void> {
  const sorted = Object.fromEntries(
    Object.entries(cards).sort(([left], [right]) => left.localeCompare(right)),
  );
  await writeAtomically(
    join(output, "printed-text.json"),
    `${JSON.stringify(
      {
        version: 1,
        source: `Bandai card list (${cardlistUrl("<series>")}), fetched ${new Date().toISOString().slice(0, 10)}`,
        cards: sorted,
      },
      null,
      2,
    )}\n`,
  );
}

async function writeAtomically(
  path: string,
  data: string | Uint8Array,
): Promise<void> {
  const partial = `${path}${PARTIAL_SUFFIX}`;
  try {
    await writeFile(partial, data);
    await rename(partial, path);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/** Card numbers that already have a non-empty image in `<output>/art`. */
async function existingArt(output: string): Promise<Set<string>> {
  const have = new Set<string>();
  const dir = join(output, "art");
  if (!existsSync(dir)) return have;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !IMAGE_EXTENSIONS.test(entry.name)) continue;
    if ((await stat(join(dir, entry.name))).size === 0) continue;
    have.add(entry.name.replace(/\.[^.]+$/, "").toUpperCase());
  }
  return have;
}

export interface DownloadReport {
  output: string;
  textCards: number;
  downloaded: number;
  alreadyThere: number;
  failed: string[];
}

/** Fills `output` with the text pack and every card's art that is missing. */
export async function downloadAssets(
  output: string,
  log: (line: string) => void = console.log,
): Promise<DownloadReport> {
  const wanted = wantedCards();
  await mkdir(join(output, "art"), { recursive: true });
  const text = await readTextPack(output);
  const have = await existingArt(output);
  const missingArt = wanted.filter((card) => !have.has(card));
  const missingText = wanted.filter((card) => !(card in text));
  const report: DownloadReport = {
    output,
    textCards: Object.keys(text).length,
    downloaded: 0,
    alreadyThere: wanted.length - missingArt.length,
    failed: [],
  };
  if (missingArt.length === 0 && missingText.length === 0) {
    log(`Everything is already in ${output}; nothing to download.`);
    return report;
  }

  const fetcher = new PoliteFetcher();
  log(`Reading Bandai's card list (${CARDLIST_SERIES.length} pages)…`);
  const list = await readCardList(fetcher, new Set(wanted), log);
  Object.assign(text, list.text);
  await writeTextPack(output, text);
  report.textCards = Object.keys(text).length;
  log(`  printed text for ${report.textCards} of ${wanted.length} cards`);

  log(
    `Downloading ${missingArt.length} card images` +
      (report.alreadyThere > 0
        ? ` (${report.alreadyThere} already there, skipped)`
        : "") +
      "…",
  );
  const progress = progressLine(missingArt.length, () => fetcher.concurrency);
  await forEachConcurrently(missingArt, async (card) => {
    try {
      const url =
        list.images.get(card)?.url ?? (await searchImageUrl(fetcher, card));
      const bytes = await fetcher.get(url, "image/");
      await writeAtomically(join(output, "art", `${card}.png`), bytes);
      report.downloaded += 1;
    } catch (error) {
      report.failed.push(card);
      progress.note(`  ${card}: ${message(error)}`);
    }
    progress.tick();
  });
  progress.done();
  report.failed.sort();
  return report;
}

/**
 * The art URL of a card no list page carries -- a promo or a reprint only
 * Bandai's search finds -- from the search page for its number.
 */
async function searchImageUrl(
  fetcher: PoliteFetcher,
  card: string,
): Promise<string> {
  const page = new URL("/cardlist/", BANDAI);
  page.searchParams.set("search", "true");
  page.searchParams.set("freewords", card);
  const html = (await fetcher.get(page.href, "text/html")).toString("utf8");
  const path = officialImageUrls(html, card)[0];
  if (!path) throw new Error("not on Bandai's card list");
  return new URL(path, page).href;
}

/** One line that counts up in a terminal, and sparse lines anywhere else. */
function progressLine(total: number, concurrency: () => number) {
  const tty = process.stdout.isTTY;
  let count = 0;
  const render = () =>
    `  ${count}/${total} images (${concurrency()} at a time)`;
  return {
    tick() {
      count += 1;
      if (tty) process.stdout.write(`\r${render()}   `);
      else if (count % 100 === 0 || count === total) console.log(render());
    },
    note(line: string) {
      if (tty) process.stdout.write(`\r${" ".repeat(60)}\r`);
      console.log(line);
    },
    done() {
      if (tty && total > 0) process.stdout.write("\n");
    },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether this process is the packaged, double-clicked executable. */
async function isStandalone(): Promise<boolean> {
  try {
    const sea = (await import("node:sea")) as { isSea?: () => boolean };
    return sea.isSea?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * The folder to fill, given the one the player picked. Their own pick when it
 * is empty or already a pack; otherwise a fresh `open-optcg-assets` inside
 * it, so choosing Downloads does not scatter two thousand images across it.
 */
async function packFolder(picked: string): Promise<string> {
  if (!existsSync(picked)) return picked;
  const entries = (await readdir(picked)).filter(
    (name) => !name.startsWith("."),
  );
  const isPack =
    entries.length === 0 ||
    entries.includes("printed-text.json") ||
    entries.includes("art");
  return isPack ? picked : join(picked, DEFAULT_FOLDER_NAME);
}

async function askForFolder(): Promise<string | null> {
  const downloads = join(homedir(), "Downloads");
  const startIn = existsSync(downloads) ? downloads : homedir();
  const choice = await chooseFolder(
    "Choose the folder to download the One Piece card art and text into",
    startIn,
  );
  if (choice.kind === "chosen") return packFolder(choice.path);
  if (choice.kind === "cancelled") return null;
  const fallback = join(startIn, DEFAULT_FOLDER_NAME);
  if (!process.stdin.isTTY) return fallback;
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = (
    await prompt.question(`Folder to download into [${fallback}]: `)
  ).trim();
  prompt.close();
  return answer ? packFolder(resolve(answer)) : fallback;
}

export async function main(args: readonly string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage: open-optcg-assets [--output=<dir>]\n" +
        "       (from a checkout: pnpm assets:download, same flag)\n\n" +
        "Downloads the printed text and card art the Open OPTCG app ships without,\n" +
        "from Bandai's card list, into <dir>:\n" +
        "  <dir>/printed-text.json  the printed text of every card the engine knows\n" +
        "  <dir>/art/               one image per card\n\n" +
        "Run without --output, the downloaded executable asks for the folder. Run\n" +
        "again into the same folder to fetch only what is missing. Then open the app,\n" +
        'choose "Load asset folder" on the home screen, and pick <dir>.',
    );
    return;
  }
  const outputArg = args.find((arg) => arg.startsWith("--output="));
  const interactive = !outputArg && (await isStandalone());
  const output = outputArg
    ? resolve(outputArg.slice("--output=".length))
    : interactive
      ? await askForFolder()
      : resolve(DEFAULT_FOLDER_NAME);
  if (!output) {
    console.log("No folder chosen; nothing downloaded.");
    return;
  }
  console.log(`Downloading Open OPTCG card text and art into ${output}`);
  try {
    const report = await downloadAssets(output);
    const failed =
      report.failed.length === 0
        ? ""
        : `\n\n${report.failed.length} image${report.failed.length === 1 ? "" : "s"} could not be downloaded (${report.failed.slice(0, 10).join(", ")}${report.failed.length > 10 ? ", …" : ""}). Run this again later to fetch just those.`;
    const summary =
      `Printed text for ${report.textCards} cards; ` +
      `${report.downloaded} image${report.downloaded === 1 ? "" : "s"} downloaded, ${report.alreadyThere} already there.` +
      failed +
      `\n\nIn the app, choose "Load asset folder" and pick:\n${output}`;
    console.log(`\n${summary}`);
    if (report.failed.length > 0) process.exitCode = 1;
    if (interactive) await showMessage("Open OPTCG card assets", summary);
  } catch (error) {
    if (interactive) {
      await showMessage(
        "Open OPTCG card assets",
        `The download stopped: ${message(error)}\n\nRun it again to continue where it left off.`,
        true,
      );
    }
    throw error;
  }
}

// No top-level await: the packaged executable bundles this file as CommonJS.
const invokedDirectly =
  process.argv[1] !== undefined &&
  /download-assets\.(?:ts|js|cjs)$/.test(process.argv[1]);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(message(error));
    process.exitCode = 1;
  });
}
