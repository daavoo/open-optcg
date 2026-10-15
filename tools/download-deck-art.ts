import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { officialImageUrls } from "./fetch-reference/src/card-images.js";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  deckManifests,
  requireSupportedDeck,
  sealedExpansion,
  sealedSetPrefix,
  SEALED_EXPANSIONS,
  SEALED_LEADER,
  type SealedExpansion,
} from "@one-piece-sim/decks";

const BANDAI_CARD_LIST = "https://en.onepiece-cardgame.com/cardlist/";
/**
 * `SEALED_LEADER` ("Rainbow Luffy") is a single Japanese promo with no Bandai
 * listing at all -- see `packages/cards/src/sealed-promo.ts` for the same
 * provenance gap OP17 has. This is the product photo from one of the two
 * retailer listings cited there; a single fixed URL because there is no
 * per-card gallery pattern for a promo that isn't part of a numbered set.
 */
const SEALED_LEADER_IMAGE_URL =
  "https://cdn11.bigcommerce.com/s-ua4dd/images/stencil/1280x1280/products/257018/341684/518691__35034.1732611797.jpg?c=2";
const SEALED_LEADER_SOURCE_PAGE =
  "https://www.gamenerdz.com/monkey-d-luffy-leader-pack-sealed-battle-2023-vol-1-one-piece-promotion-cards";
const SEALED_LEADER_PSEUDO_DECK = "SEALED";
/**
 * The `BOOSTERS` pseudo-deck: one official pack photo per sealed expansion,
 * from `SEALED_EXPANSIONS[].packImageUrl`.
 *
 * Not cards, but stored exactly like them -- under the pseudo card number
 * `<CODE>-PACK`, in a flat folder `readCardArtDir` walks -- so the sealed lobby
 * reads a pack photo through the same `assetUrl` path a card face comes down,
 * and `--no-art` falls back to the drawn pack in `styles/cards.css`. A real card
 * number always ends in three digits, so the suffix cannot collide.
 */
const BOOSTERS_PSEUDO_DECK = "BOOSTERS";
const ALL_OUTPUT_DIR = "all";
/**
 * The format converted art is stored in. The single-file build inlines every
 * card image as a base64 `data:` URL, so the artifact *is* the art, and the
 * format halves it: the sealed demo went from 40.5 MB to 20.1 MB, the full app
 * from 93.4 MB to 46.1 MB. `build-web.ts` already knew `image/webp`, so storing
 * WebP needed no build change.
 */
const CONVERTED_EXTENSION = ".webp";
/**
 * Quality for the WebP encode. 80 is indistinguishable from the PNG source at
 * the two sizes the app renders a card at (the board thumbnail and the
 * inspector's full-card view), where artefacts would show in the card text
 * before the artwork. Raise it, or fetch with `--raw`, if that stops holding.
 */
const CONVERTED_QUALITY = 80;
/**
 * sharp's default encoder effort is 4; 6 buys about 10% more compression for
 * more CPU. Worth it here because encoding happens once per card, at fetch
 * time, and the converted file is what gets cached.
 */
const CONVERTED_EFFORT = 6;

interface Options {
  deckIds: readonly string[];
  /** `--all`: download every supported card into one flat folder. */
  all: boolean;
  output: string;
  force: boolean;
  /**
   * `--raw`: store the fetched format instead of converting to WebP, for
   * diffing art quality against the source. Pair it with `--output=` -- a raw
   * file lands next to the converted one rather than replacing it, and which of
   * the two a build picks up is then down to readdir order.
   */
  raw: boolean;
}

interface DownloadRecord {
  cardNumber: string;
  pageUrl: string;
  imageUrl: string;
  file: string;
  sha256: string;
  bytes: number;
  /** Size of the fetched source, when it was converted before being written. */
  sourceBytes?: number;
}

export { officialImageUrls };

export function parseOptions(args: readonly string[]): Options {
  const deckId = args.find((arg) => !arg.startsWith("--"));
  const all = args.includes("--all");
  if ((!deckId && !all) || (deckId && all)) {
    throw new Error(
      `Usage: pnpm art:download (<deck-id> | ${SEALED_EXPANSIONS.map((expansion) => expansion.code).join(" | ")} | ${BOOSTERS_PSEUDO_DECK} | ${SEALED_LEADER_PSEUDO_DECK} | --all) [--output=<directory>] [--force] [--raw]\n\n` +
        "A deck-id downloads that deck's cards into <output>/<deck-id>/. " +
        "A sealed expansion's set code downloads every card of that set (there " +
        "is no deck manifest for one -- they only exist as sealed pools) into " +
        "<output>/<set-code>/. " +
        `${BOOSTERS_PSEUDO_DECK} downloads one official pack photo per sealed ` +
        `expansion into <output>/${BOOSTERS_PSEUDO_DECK}/. ` +
        `${SEALED_LEADER_PSEUDO_DECK} downloads the single sealed-format Leader ` +
        `(${SEALED_LEADER}, "Rainbow Luffy") into <output>/${SEALED_LEADER_PSEUDO_DECK}/, ` +
        "from a retailer product photo since it has no Bandai listing either. " +
        "--all downloads every card in the registry into " +
        "<output>/all/, so custom decks get art without being a registered deck.\n\n" +
        "Art is converted to WebP as it is fetched, and the converted file is what " +
        "gets cached; --raw keeps the source PNG/JPEG instead, for comparing quality.\n\n" +
        "The build never fetches art: `pnpm web:build --with-art` inlines what this " +
        "command has put in local-art/ together with whatever `pnpm assets:download` " +
        "has put in open-optcg-assets/art/, and that second command builds the pack a " +
        "player loads into the published app.",
    );
  }
  const outputArg = args.find((arg) => arg.startsWith("--output="));
  return {
    deckIds: all ? [] : [deckId!],
    all,
    output: resolve(outputArg?.slice("--output=".length) || "local-art"),
    force: args.includes("--force"),
    raw: args.includes("--raw"),
  };
}

/**
 * Every card a player can put in a deck: everything in the registry,
 * excluding the fixture identities. This is the same predicate the deck editor
 * uses for its catalog (`supportedCards` in `packages/web/src/deck-editor.ts`),
 * so `--all` downloads art for exactly the cards a custom deck can contain.
 */
export function supportedCardNumbers(): string[] {
  return [...cardRegistry.values()]
    .filter((card) => !card.cardNumber.startsWith("FIX-"))
    .map((card) => card.cardNumber)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Every supported card of one sealed expansion, for the per-expansion
 * pseudo-decks -- `pnpm art -- OP16` and the sealed-only web build.
 */
export function expansionCardNumbers(expansion: string): string[] {
  const prefix = sealedSetPrefix(expansion);
  return supportedCardNumbers().filter((cardNumber) =>
    cardNumber.startsWith(prefix),
  );
}

async function fetchBytes(url: string, expectedType: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "user-agent": "open-optcg-local-art-importer/0.1" },
    redirect: "follow",
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(expectedType)) {
    throw new Error(`Unexpected content type ${contentType || "unknown"}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function existingRecord(
  cardNumber: string,
  destination: string,
  file: string,
): Promise<DownloadRecord | null> {
  try {
    const bytes = await readFile(destination);
    return {
      cardNumber,
      pageUrl: "existing file",
      imageUrl: "existing file",
      file,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    };
  } catch {
    return null;
  }
}

/**
 * Shared decks (for example two lists on the same Leader) contain the same
 * card numbers, so `--all` would fetch one card several times. The first deck
 * that needs a card registers its destination; later decks get that path back
 * and copy it instead of downloading again.
 */
export function dedupeAcrossDecks(
  reused: Map<string, string>,
  cardNumber: string,
  destination: string,
): string | null {
  const source = reused.get(cardNumber);
  if (source) return source;
  reused.set(cardNumber, destination);
  return null;
}

type DeckDownloadOptions = Omit<Options, "deckIds" | "all"> & {
  deckId: string;
};

const DEFAULT_CONCURRENCY = 5;

function effectiveConcurrency(): number {
  const raw = process.env.ART_DOWNLOAD_CONCURRENCY;
  if (!raw) return DEFAULT_CONCURRENCY;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_CONCURRENCY;
}

/**
 * Runs `worker` over `items` with at most `limit` workers in flight, while
 * preserving the input order in the returned results.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]!, index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

/**
 * The file extension a card's art is saved under: WebP for a converted fetch,
 * otherwise the source format -- Bandai's cardlist serves PNG, and only the
 * sealed Leader's retailer photo is a JPEG. Every reader of `local-art/`
 * (`buildLocalCardArt` in `build-web.ts`) keys off the filename's card number
 * and reads its actual extension, so all three coexist in the same flat
 * folder without collision.
 */
export function artExtension(cardNumber: string, raw = false): string {
  if (!raw) return CONVERTED_EXTENSION;
  return cardNumber === SEALED_LEADER ? ".jpg" : ".png";
}

/**
 * Re-encode fetched art as WebP. Done at fetch time, with the converted file
 * cached in place of the original, so a rebuild pays nothing: the fetch
 * already skips whatever `local-art/` holds.
 */
// Imported on first use rather than at the top: sharp is a native module, and
// the standalone asset downloader (`pnpm assets:package`) ships without it and
// stores the fetched format instead (`raw`), so a build that never converts
// must never load it.
async function sharp(bytes: Buffer) {
  const { default: sharpModule } = await import("sharp");
  return sharpModule(bytes);
}

export async function convertArt(bytes: Buffer): Promise<Buffer> {
  return (await sharp(bytes))
    .webp({ quality: CONVERTED_QUALITY, effort: CONVERTED_EFFORT })
    .toBuffer();
}

/**
 * Re-encode a booster pack photo, trimming the transparent margin first.
 *
 * Bandai centres the pack on a near-square canvas, so a `contain` fit in the
 * lobby would letterbox it to about half the width it is given. Trimmed, the
 * stored image is the pack and nothing else, and every expansion's comes out at
 * the same ~3:5 -- which is the aspect ratio `.booster-pack` is declared at.
 *
 * The threshold is what makes that ratio hold across expansions rather than
 * just within one: OP17's photo carries a soft drop shadow the older sets'
 * don't, and trimming only fully-transparent pixels leaves it in, landing that
 * pack at 0.65 against everyone else's 0.60 -- visibly smaller in the picker's
 * grid, since a wider image fits its box by width. 40 clears the shadow without
 * reaching the pack: measured, the older three are byte-identical at every
 * threshold from 0 to 40.
 */
export async function convertBoosterPackArt(bytes: Buffer): Promise<Buffer> {
  return (await sharp(bytes))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 40 })
    .webp({ quality: CONVERTED_QUALITY, effort: CONVERTED_EFFORT })
    .toBuffer();
}

/**
 * Two format switches have happened: OP17 art came from a JPEG gallery before
 * Bandai listed the set, and every card was stored as PNG/JPEG before the
 * WebP conversion. A working copy (or a restored CI art cache) from either era
 * still holds the old file next to the new one, and `readCardArtDir` would key
 * both to the same card number -- with which one wins decided by readdir
 * order. Drop the superseded files once the new one is in place; removable
 * once no working copy predates the WebP switch.
 */
async function removeSupersededArt(destination: string): Promise<void> {
  const superseded = destination.endsWith(CONVERTED_EXTENSION)
    ? [".png", ".jpg"]
    : destination.endsWith(".png")
      ? [".jpg"]
      : [];
  const stem = destination.slice(0, destination.lastIndexOf("."));
  for (const extension of superseded) {
    await rm(`${stem}${extension}`, { force: true });
  }
}

async function fetchCardImage(
  cardNumber: string,
): Promise<{ pageUrl: string; imageUrl: string; bytes: Buffer }> {
  if (cardNumber === SEALED_LEADER) {
    const bytes = await fetchBytes(SEALED_LEADER_IMAGE_URL, "image/jpeg");
    return {
      pageUrl: SEALED_LEADER_SOURCE_PAGE,
      imageUrl: SEALED_LEADER_IMAGE_URL,
      bytes,
    };
  }
  const pageUrl = new URL(BANDAI_CARD_LIST);
  pageUrl.searchParams.set("search", "true");
  pageUrl.searchParams.set("freewords", cardNumber);
  const html = (await fetchBytes(pageUrl.href, "text/html")).toString("utf8");
  const imagePath = officialImageUrls(html, cardNumber)[0];
  if (!imagePath) throw new Error(`ART_NOT_FOUND: ${cardNumber}`);
  const imageUrl = new URL(imagePath, pageUrl).href;
  const bytes = await fetchBytes(imageUrl, "image/png");
  return { pageUrl: pageUrl.href, imageUrl, bytes };
}

async function downloadCard(
  options: DeckDownloadOptions,
  reused: Map<string, string>,
  cardNumber: string,
): Promise<DownloadRecord> {
  const extension = artExtension(cardNumber, options.raw);
  const file = `${cardNumber}${extension}`;
  const destination = join(options.output, file);
  if (!options.force) {
    const existing = await existingRecord(cardNumber, destination, file);
    if (existing) {
      console.log(`Kept ${file}`);
      reused.set(cardNumber, destination);
      return existing;
    }
  }

  const reuseSource = dedupeAcrossDecks(reused, cardNumber, destination);
  if (reuseSource) {
    await copyFile(reuseSource, destination);
    const record = await existingRecord(cardNumber, destination, file);
    console.log(`Reused ${file} (from ${reuseSource})`);
    return { ...record!, pageUrl: reuseSource, imageUrl: reuseSource };
  }

  const { pageUrl, imageUrl, bytes } = await fetchCardImage(cardNumber);
  const stored = options.raw ? bytes : await convertArt(bytes);
  const temporary = `${destination}.tmp`;
  try {
    await writeFile(temporary, stored);
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  await removeSupersededArt(destination);
  console.log(`Downloaded ${file}`);
  reused.set(cardNumber, destination);
  return {
    cardNumber,
    pageUrl,
    imageUrl,
    file,
    sha256: createHash("sha256").update(stored).digest("hex"),
    bytes: stored.length,
    ...(options.raw ? {} : { sourceBytes: bytes.length }),
  };
}

interface DownloadManifest {
  deckId: string;
  fetchedAt: string;
  source: string;
  notice: string;
  downloads: DownloadRecord[];
  /** Card numbers that could not be downloaded, when the run tolerated gaps. */
  failed?: readonly string[];
}

async function writeDownloadManifest(
  output: string,
  manifest: DownloadManifest,
): Promise<void> {
  await writeFile(
    join(output, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export async function downloadDeckArt(
  options: DeckDownloadOptions,
  reused: Map<string, string> = new Map(),
): Promise<void> {
  const deck = requireSupportedDeck(options.deckId);
  if (options.deckId.startsWith("FIXTURE-")) {
    throw new Error(`NO_OFFICIAL_ART: ${options.deckId}`);
  }
  const cardNumbers = [...new Set([deck.leader, ...Object.keys(deck.cards)])];
  await mkdir(options.output, { recursive: true });

  // Cards within a deck are independent (two network fetches each), so fetch
  // them concurrently. Decks stay sequential so the `reused` map keeps
  // working: cards shared with an earlier deck are copied from disk, not
  // re-downloaded. Tune in-flight requests with ART_DOWNLOAD_CONCURRENCY.
  const downloads = await mapWithConcurrency(
    cardNumbers,
    effectiveConcurrency(),
    (cardNumber) => downloadCard(options, reused, cardNumber),
  );

  await writeDownloadManifest(options.output, {
    deckId: options.deckId,
    fetchedAt: new Date().toISOString(),
    source: BANDAI_CARD_LIST,
    notice:
      "Bandai states that website images may not be reproduced without permission.",
    downloads,
  });
  console.log(
    `Ready to import ${downloads.length} images from ${options.output}`,
  );
}

/**
 * `--all`: download every supported card into one flat folder.
 *
 * A deck folder only ever contains its own cards, so a custom deck built from
 * the editor's full catalog (`supportedCards`) had no art for anything outside
 * the registered manifests. The flat folder is keyed by card number instead,
 * which is exactly how `buildLocalCardArt` (build-web.ts) and the runtime
 * asset loader read it.
 *
 * Best-effort per card: a promo or identity Bandai's English cardlist does not
 * carry is skipped with a warning and listed in the manifest rather than
 * aborting the whole run -- the deck mode still throws, because a deck needs
 * every one of its cards.
 */
async function downloadAllSupportedCards(
  options: Options,
  reused: Map<string, string>,
): Promise<void> {
  const output = join(options.output, ALL_OUTPUT_DIR);
  const cardNumbers = supportedCardNumbers();
  await mkdir(output, { recursive: true });

  const downloads: DownloadRecord[] = [];
  const failed: string[] = [];
  await mapWithConcurrency(
    cardNumbers,
    effectiveConcurrency(),
    async (cardNumber) => {
      try {
        downloads.push(
          await downloadCard(
            {
              deckId: ALL_OUTPUT_DIR,
              output,
              force: options.force,
              raw: options.raw,
            },
            reused,
            cardNumber,
          ),
        );
      } catch (error) {
        failed.push(cardNumber);
        console.warn(
          `Skipped ${cardNumber} (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    },
  );
  downloads.sort((left, right) =>
    left.cardNumber.localeCompare(right.cardNumber),
  );

  await writeDownloadManifest(output, {
    deckId: ALL_OUTPUT_DIR,
    fetchedAt: new Date().toISOString(),
    source: BANDAI_CARD_LIST,
    notice:
      "Bandai states that website images may not be reproduced without permission.",
    downloads,
    ...(failed.length > 0 ? { failed } : {}),
  });
  console.log(
    `Ready to import ${downloads.length} images from ${output}` +
      (failed.length > 0
        ? ` (${failed.length} skipped: ${failed.join(", ")})`
        : ""),
  );
}

/**
 * A sealed expansion's pseudo-deck: every card of one set. Not a real deck
 * manifest -- a booster set only exists as a sealed pool, never a 50-card
 * constructed deck -- so this bypasses `requireSupportedDeck` and downloads by
 * card set instead of by deck.
 * Best-effort per card, matching `downloadAllSupportedCards`: one card
 * missing from the gallery should not abort the other 118.
 */
async function downloadExpansionArt(
  options: DeckDownloadOptions,
): Promise<void> {
  const cardNumbers = expansionCardNumbers(options.deckId);
  await mkdir(options.output, { recursive: true });
  const reused = new Map<string, string>();

  const downloads: DownloadRecord[] = [];
  const failed: string[] = [];
  await mapWithConcurrency(
    cardNumbers,
    effectiveConcurrency(),
    async (cardNumber) => {
      try {
        downloads.push(await downloadCard(options, reused, cardNumber));
      } catch (error) {
        failed.push(cardNumber);
        console.warn(
          `Skipped ${cardNumber} (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    },
  );
  downloads.sort((left, right) =>
    left.cardNumber.localeCompare(right.cardNumber),
  );

  await writeDownloadManifest(options.output, {
    deckId: options.deckId,
    fetchedAt: new Date().toISOString(),
    source: BANDAI_CARD_LIST,
    notice:
      "Bandai states that website images may not be reproduced without permission.",
    downloads,
    ...(failed.length > 0 ? { failed } : {}),
  });
  console.log(
    `Ready to import ${downloads.length} images from ${options.output}` +
      (failed.length > 0
        ? ` (${failed.length} skipped: ${failed.join(", ")})`
        : ""),
  );
}

/**
 * The `BOOSTERS` pseudo-deck: one official English pack photo per sealed
 * expansion -- see {@link BOOSTERS_PSEUDO_DECK} for why they are stored as
 * pseudo card numbers.
 *
 * Best-effort per expansion: Bandai has reorganised these product pages twice
 * already (the OP17 photo sits under the set's own page, the OP16 one under a
 * hashed upload path), so a moved URL should cost that expansion its photo --
 * the lobby draws a pack instead -- rather than fail the whole web build.
 */
async function downloadBoosterPackArt(
  options: DeckDownloadOptions,
): Promise<void> {
  await mkdir(options.output, { recursive: true });
  const downloads: DownloadRecord[] = [];
  const failed: string[] = [];
  await mapWithConcurrency(
    SEALED_EXPANSIONS,
    effectiveConcurrency(),
    async (expansion) => {
      try {
        downloads.push(await downloadBoosterPack(options, expansion));
      } catch (error) {
        failed.push(expansion.code);
        console.warn(
          `Skipped ${expansion.code} pack photo (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    },
  );
  downloads.sort((left, right) =>
    left.cardNumber.localeCompare(right.cardNumber),
  );
  await writeDownloadManifest(options.output, {
    deckId: BOOSTERS_PSEUDO_DECK,
    fetchedAt: new Date().toISOString(),
    source: SEALED_EXPANSIONS.map((expansion) => expansion.productPage).join(
      ", ",
    ),
    notice:
      "Bandai states that website images may not be reproduced without permission.",
    downloads,
    ...(failed.length > 0 ? { failed } : {}),
  });
  console.log(
    `Ready to import ${downloads.length} pack photos from ${options.output}` +
      (failed.length > 0
        ? ` (${failed.length} skipped: ${failed.join(", ")})`
        : ""),
  );
}

/** One expansion's pack photo, under the pseudo card number `<CODE>-PACK`. */
async function downloadBoosterPack(
  options: DeckDownloadOptions,
  expansion: SealedExpansion,
): Promise<DownloadRecord> {
  const key = `${expansion.code}-PACK`;
  // Always WebP: Bandai serves these as WebP already, and re-encoding at the
  // shared quality keeps a pack photo the same size whichever page it came off.
  const file = `${key}${CONVERTED_EXTENSION}`;
  const destination = join(options.output, file);
  if (!options.force) {
    const existing = await existingRecord(key, destination, file);
    if (existing) {
      console.log(`Kept ${file}`);
      return existing;
    }
  }
  const bytes = await fetchBytes(expansion.packImageUrl, "image/webp");
  const stored = await convertBoosterPackArt(bytes);
  const temporary = `${destination}.tmp`;
  try {
    await writeFile(temporary, stored);
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  console.log(`Downloaded ${file}`);
  return {
    cardNumber: key,
    pageUrl: expansion.productPage,
    imageUrl: expansion.packImageUrl,
    file,
    sha256: createHash("sha256").update(stored).digest("hex"),
    bytes: stored.length,
    sourceBytes: bytes.length,
  };
}

/**
 * The `SEALED` pseudo-deck: the single sealed-format Leader card, from a
 * retailer product photo rather than Bandai's cardlist (which does not
 * carry it at all -- see `SEALED_LEADER_IMAGE_URL`).
 */
async function downloadSealedLeaderArt(
  options: DeckDownloadOptions,
): Promise<void> {
  await mkdir(options.output, { recursive: true });
  const download = await downloadCard(options, new Map(), SEALED_LEADER);
  await writeDownloadManifest(options.output, {
    deckId: SEALED_LEADER_PSEUDO_DECK,
    fetchedAt: new Date().toISOString(),
    source: SEALED_LEADER_SOURCE_PAGE,
    notice:
      "Retailer product photo of a promo with no Bandai listing. For local personal use only.",
    downloads: [download],
  });
  console.log(`Ready to import 1 image from ${options.output}`);
}

/**
 * Fetch a set of card art into `local-art/`, skipping every file already
 * there. `pnpm web:build` calls this so a fresh clone builds with art instead
 * of placeholder card faces; the CLI below is the same code for one deck.
 *
 * Best-effort: a card whose source is unreachable is warned about and left
 * out rather than failing the build. Nothing is written outside `output`, and
 * `local-art/` is gitignored, so no art enters the repository.
 */
export async function ensureCardArt(options: {
  /** `"all"`, a deck id, a sealed set code, `"BOOSTERS"`, or `"SEALED"`. */
  readonly sets: readonly string[];
  readonly output?: string;
  readonly force?: boolean;
  /** Keep the fetched format instead of converting to WebP. */
  readonly raw?: boolean;
}): Promise<void> {
  for (const set of options.sets) {
    await runArtDownload({
      deckIds: set === ALL_OUTPUT_DIR ? [] : [set.toUpperCase()],
      all: set === ALL_OUTPUT_DIR,
      output: resolve(options.output ?? "local-art"),
      force: options.force ?? false,
      raw: options.raw ?? false,
    });
  }
}

async function runArtDownload(options: Options): Promise<void> {
  const reused = new Map<string, string>();
  if (options.all) {
    await downloadAllSupportedCards(options, reused);
    return;
  }
  for (const deckId of options.deckIds) {
    if (deckId === BOOSTERS_PSEUDO_DECK) {
      await downloadBoosterPackArt({
        deckId,
        output: join(options.output, deckId),
        force: options.force,
        raw: options.raw,
      });
      continue;
    }
    if (sealedExpansion(deckId)) {
      await downloadExpansionArt({
        deckId,
        output: join(options.output, deckId),
        force: options.force,
        raw: options.raw,
      });
      continue;
    }
    if (deckId === SEALED_LEADER_PSEUDO_DECK) {
      await downloadSealedLeaderArt({
        deckId,
        output: join(options.output, deckId),
        force: options.force,
        raw: options.raw,
      });
      continue;
    }
    if (!(deckId in deckManifests)) {
      throw new Error(`UNKNOWN_DECK: ${deckId}`);
    }
    await downloadDeckArt(
      {
        deckId,
        output: join(options.output, deckId),
        force: options.force,
        raw: options.raw,
      },
      reused,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runArtDownload(parseOptions(process.argv.slice(2))).catch(
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
