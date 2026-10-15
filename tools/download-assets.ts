/**
 * The asset downloader for a checkout: fetches the printed text and the card
 * art the published app deliberately ships without, from Bandai's own card
 * list, into a folder on disk. Players get the same pack from the "Get cards"
 * bookmark (`tools/get-cards.ts`); this is what the local builds, the tests
 * that quote printed text and the System-1 research read.
 *
 *   pnpm assets:download [--output=<dir>]     (default: open-optcg-assets/)
 *
 * writes `<dir>/printed-text.json` (the text of every card the engine knows)
 * and `<dir>/art/<card number>.png` (one image per card).
 *
 * Rerunning it into the same folder fetches only what is missing: an image
 * already on disk is never fetched again, and a folder that already holds
 * everything costs no request at all. Images are written under a temporary
 * name and renamed, so an interrupted run never leaves a half image that a
 * later run would mistake for a finished one.
 *
 * Every request goes through `PoliteFetcher`
 * (`fetch-reference/src/polite-fetcher.ts`), which keeps a full run (about 50
 * list pages and 2,000 images) fast without looking like an attack.
 */
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
import { join, resolve } from "node:path";
import { cardRegistry } from "@one-piece-sim/cards";
import { SEALED_LEADER } from "@one-piece-sim/decks";
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

export { pageImageUrls, PoliteFetcher };

const USER_AGENT =
  "open-optcg-asset-downloader/0.2 (+https://github.com/daavoo/open-optcg)";
/** The most requests in flight, and so the width of every concurrent loop. */
const MAX_CONCURRENCY = 8;
const IMAGE_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const PARTIAL_SUFFIX = ".part";
const DEFAULT_FOLDER_NAME = "open-optcg-assets";

type PrintedCard = { name: string; effect: string; trigger: string };

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
  await forEachConcurrently(
    CARDLIST_SERIES,
    MAX_CONCURRENCY,
    async ([slug, series]) => {
      try {
        pages.set(slug, await fetcher.text(cardlistUrl(series)));
      } catch (error) {
        failedPages.push(slug);
        log(`  could not read the ${slug} list: ${message(error)}`);
      }
    },
  );
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

  const fetcher = new PoliteFetcher({
    max: MAX_CONCURRENCY,
    headers: { "user-agent": USER_AGENT },
  });
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
  await forEachConcurrently(missingArt, MAX_CONCURRENCY, async (card) => {
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
  const html = await fetcher.text(page.href);
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

export async function main(args: readonly string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage: pnpm assets:download [--output=<dir>]\n\n" +
        "Downloads the printed text and card art the Open OPTCG app ships without,\n" +
        `from Bandai's card list, into <dir> (default ${DEFAULT_FOLDER_NAME}/):\n` +
        "  <dir>/printed-text.json  the printed text of every card the engine knows\n" +
        "  <dir>/art/               one image per card\n\n" +
        "Run again into the same folder to fetch only what is missing.",
    );
    return;
  }
  const outputArg = args.find((arg) => arg.startsWith("--output="));
  const output = resolve(
    outputArg ? outputArg.slice("--output=".length) : DEFAULT_FOLDER_NAME,
  );
  console.log(`Downloading Open OPTCG card text and art into ${output}`);
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
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  /download-assets\.(?:ts|js|cjs)$/.test(process.argv[1]);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(message(error));
    process.exitCode = 1;
  });
}
