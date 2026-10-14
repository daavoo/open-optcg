import { loadPrintedText, parsePrintedTextPack } from "@one-piece-sim/cards";
import { unzipSync } from "fflate";

/**
 * Card art and printed text are never bundled: the build ships neither, and
 * the player loads an *asset pack* -- a zip (or folder) of images plus a
 * `printed-text.json` -- from the home screen. Every painted surface in
 * packages/web/src/styles/ reads a CSS custom property first — an "anchor" —
 * and falls back to a drawn, IP-safe placeholder when the anchor is `none`;
 * every place that shows card text asks `printedText()` and says "not loaded"
 * when it has none. See docs/asset-packs.md for where a pack comes from.
 *
 * Files imported here are matched by name: a name in SURFACE_ANCHORS replaces
 * that surface, a `.json` is tried as a text pack, anything else is treated as
 * card art keyed by card number (ST31-001.webp, OP01-016.png, …).
 */
const SURFACE_ANCHORS: Readonly<Record<string, string>> = {
  "MAT-SELF": "--art-mat-self",
  PLAYMAT: "--art-mat-self",
  "MAT-OPPONENT": "--art-mat-opponent",
  "MAT-ST31": "--art-mat-st31",
  "SPRITE-ST31": "--art-sprite-st31",
  "SPRITE-XEBEC": "--art-sprite-xebec",
  "SPRITE-MIHAWK": "--art-sprite-mihawk",
  "PLAYMAT-OPPONENT": "--art-mat-opponent",
  TABLE: "--art-table",
  CHART: "--art-chart",
  "CARD-BACK": "--art-card-back",
  "DON-BACK": "--art-don-back",
  "CARD-FRAME": "--art-card-frame",
  "CARD-SLOT": "--art-card-slot",
  "CHARACTER-AREA": "--art-character-area",
  "HAND-TRAY": "--art-hand-tray",
  DON: "--art-don",
  LIFE: "--art-life",
  BRAND: "--art-brand",
  LOBBY: "--art-lobby",
  HOME: "--art-home",
  "MENU-CARD": "--art-menu-card",
  "MODE-1V1": "--art-mode-1v1",
  "MODE-SEALED": "--art-mode-sealed",
  "END-TURN": "--art-end-turn",
  VS: "--art-vs",
};

const assetUrls = new Map<string, string>();
const surfaceUrls = new Map<string, string>();
const DATABASE_NAME = "open-optcg-assets-v1";
const STORE_NAME = "images";
/** The one non-image record in the store: the text pack, kept as its JSON. */
const TEXT_PACK_KEY = "PRINTED-TEXT";
let textCards = 0;

interface CachedAsset {
  key: string;
  name: string;
  type: string;
  blob: Blob;
}

function assetKey(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .trim()
    .toUpperCase();
}

function isCardNumber(key: string): boolean {
  return /^(?:[A-Z]{1,5}\d{0,2}|P)-\d{3}$/.test(key);
}

/**
 * A booster pack photo, keyed `<SET>-PACK`.
 *
 * Filed with card art rather than as a surface anchor because that is what it
 * is used as: the sealed lobby reads it through `assetUrl`, one image per
 * expansion, the same way a card face is read. See `BOOSTERS_PSEUDO_DECK` in
 * `tools/download-deck-art.ts` for the fetch side. A real card number ends in
 * three digits, so the two can never collide.
 */
function isBoosterPackKey(key: string): boolean {
  return /^[A-Z]{2}\d{1,2}-PACK$/.test(key);
}

export function loadAssetFiles(files: readonly File[]): number {
  let loaded = 0;
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const key = assetKey(file.name);
    if (!key) continue;
    const anchor = SURFACE_ANCHORS[key];
    if (!anchor && !isCardNumber(key) && !isBoosterPackKey(key)) continue;
    const store = anchor ? surfaceUrls : assetUrls;
    const storeKey = anchor ?? key;
    const previous = store.get(storeKey);
    if (previous) URL.revokeObjectURL(previous);
    store.set(storeKey, URL.createObjectURL(file));
    loaded += 1;
  }
  return loaded;
}

function openAssetDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    });
    request.addEventListener("success", () => {
      resolve(request.result);
    });
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("ASSET_CACHE_OPEN_FAILED"));
    });
  });
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => {
      resolve();
    });
    transaction.addEventListener("abort", () => {
      reject(transaction.error ?? new Error("ASSET_CACHE_ABORTED"));
    });
    transaction.addEventListener("error", () => {
      reject(transaction.error ?? new Error("ASSET_CACHE_FAILED"));
    });
  });
}

/**
 * Reads a candidate text pack and registers its text; the number of cards it
 * carried, 0 for a JSON file that is not a pack. A folder can hold other JSON
 * -- a download manifest sits beside every set's art -- so a file that does
 * not parse as a pack is simply not one.
 */
async function loadTextPackFile(file: File): Promise<number> {
  try {
    const pack = parsePrintedTextPack(await file.text());
    const count = loadPrintedText(pack.cards);
    textCards = Math.max(textCards, count);
    return count;
  } catch {
    return 0;
  }
}

function isJson(file: File): boolean {
  return file.type === "application/json" || /\.json$/i.test(file.name);
}

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  avif: "image/avif",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

function isZip(file: File): boolean {
  return (
    /\.zip$/i.test(file.name) ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

/**
 * The files inside an asset pack zip, as if they had been picked one by one.
 *
 * A zip is the one container every phone and tablet can hand a web page: iOS
 * and Android file pickers cannot select a folder, and a pack is a few hundred
 * files. Entries keep only their basename -- the tool writes `art/<n>.webp`,
 * and a hand-made zip may nest differently -- and a zip entry carries no MIME
 * type, so the type comes from the extension. Finder's `__MACOSX` shadow
 * entries and dotfiles are skipped.
 */
export function unpackAssetZip(bytes: Uint8Array): File[] {
  const files: File[] = [];
  for (const [path, data] of Object.entries(unzipSync(bytes))) {
    if (path.endsWith("/")) continue;
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!name || name.startsWith(".") || path.startsWith("__MACOSX/")) continue;
    const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    const type =
      extension === "json" ? "application/json" : IMAGE_TYPES[extension];
    if (!type) continue;
    files.push(new File([data], name, { type }));
  }
  return files;
}

/**
 * A picked file with its type taken from its extension when the browser gave
 * none -- some leave `.webp` and `.avif` untyped in a folder pick, and the
 * type is what decides whether a file is art.
 */
function typedByExtension(file: File): File {
  if (file.type) return file;
  const extension = file.name
    .slice(file.name.lastIndexOf(".") + 1)
    .toLowerCase();
  const type =
    extension === "json" ? "application/json" : IMAGE_TYPES[extension];
  return type ? new File([file], file.name, { type }) : file;
}

/** Expands any zip among the picked files; everything else passes through. */
async function expandZips(files: readonly File[]): Promise<File[]> {
  const expanded: File[] = [];
  for (const file of files) {
    if (isZip(file)) {
      expanded.push(
        ...unpackAssetZip(new Uint8Array(await file.arrayBuffer())),
      );
    } else expanded.push(typedByExtension(file));
  }
  return expanded;
}

/** What a load or restore brought in, for the home screen's status line. */
export interface AssetSummary {
  images: number;
  textCards: number;
}

/**
 * Loads an asset pack the player picked: a zip, a folder, or loose files.
 * Images are matched by name and the first JSON file that parses as a text
 * pack is the text. Everything accepted is also written to the browser's
 * storage so the next visit starts with it.
 */
export async function cacheAssetFiles(
  picked: readonly File[],
): Promise<AssetSummary> {
  const files = await expandZips(picked);
  const images = files.filter((file) => {
    const key = assetKey(file.name);
    return (
      file.type.startsWith("image/") &&
      (key in SURFACE_ANCHORS || isCardNumber(key) || isBoosterPackKey(key))
    );
  });
  const loaded = loadAssetFiles(images);
  let textPack: File | undefined;
  for (const file of files.filter(isJson)) {
    if ((await loadTextPackFile(file)) > 0) {
      textPack = file;
      break;
    }
  }
  const summary = { images: loaded, textCards };
  if ((loaded === 0 && !textPack) || typeof indexedDB === "undefined") {
    return summary;
  }
  try {
    const database = await openAssetDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const file of images) {
      store.put({
        key: assetKey(file.name),
        name: file.name,
        type: file.type,
        blob: file,
      } satisfies CachedAsset);
    }
    if (textPack) {
      store.put({
        key: TEXT_PACK_KEY,
        name: textPack.name,
        type: "application/json",
        blob: textPack,
      } satisfies CachedAsset);
    }
    await completeTransaction(transaction);
    database.close();
  } catch {
    // Runtime assets still work when persistent browser storage is unavailable.
  }
  return summary;
}

export async function restoreCachedAssets(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const database = await openAssetDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    const records = await new Promise<CachedAsset[]>((resolve, reject) => {
      request.addEventListener("success", () => {
        resolve(request.result as CachedAsset[]);
      });
      request.addEventListener("error", () => {
        reject(request.error ?? new Error("ASSET_CACHE_READ_FAILED"));
      });
    });
    await completeTransaction(transaction);
    database.close();
    const text = records.find((record) => record.key === TEXT_PACK_KEY);
    if (text) {
      await loadTextPackFile(
        new File([text.blob], text.name, { type: text.type }),
      );
    }
    return loadAssetFiles(
      records
        .filter((record) => record.key !== TEXT_PACK_KEY)
        .map(
          (record) =>
            new File([record.blob], record.name, { type: record.type }),
        ),
    );
  } catch {
    return 0;
  }
}

/** Point every anchor with a loaded image at that image. */
export function applyAssetAnchors(): void {
  const root = document.documentElement;
  for (const [property, url] of surfaceUrls) {
    root.style.setProperty(property, `url("${url}")`);
  }
  const styles = getComputedStyle(root);
  root.toggleAttribute(
    "data-custom-mat",
    ["--art-mat-self", "--art-mat-opponent"].some(
      (property) => styles.getPropertyValue(property).trim() !== "none",
    ),
  );
}

export function assetUrl(cardNumber: string): string | null {
  const key = assetKey(cardNumber);
  // `typeof` (not a direct reference) so this stays callable from a plain
  // unit test, where esbuild never substitutes this build-time global.
  const builtIn =
    typeof __BUILT_IN_CARD_ART__ !== "undefined" ? __BUILT_IN_CARD_ART__ : {};
  return assetUrls.get(key) ?? builtIn[key] ?? null;
}

export function assetCount(): number {
  return assetUrls.size + surfaceUrls.size;
}

/**
 * Registers a `--with-text` build's own pack, before anything the player has
 * loaded: a pack imported from the home screen is the later load, so it still
 * wins card for card. Zero for every published build, which carries none.
 *
 * `typeof` (not a direct reference) for the same reason `assetUrl` does it:
 * this stays callable from a unit test, where esbuild never substitutes a
 * build-time global.
 */
export function loadBuiltInPrintedText(): number {
  const builtIn =
    typeof __BUILT_IN_PRINTED_TEXT__ !== "undefined"
      ? __BUILT_IN_PRINTED_TEXT__
      : null;
  if (!builtIn) return 0;
  const count = loadPrintedText(builtIn);
  textCards = Math.max(textCards, count);
  return count;
}

/**
 * What is loaded right now: card and surface images, and cards with text.
 *
 * A `--with-art` / `--with-text` build's own inlined assets count here too.
 * They are on the screen -- the cards have faces and the popups have text --
 * and a status line that called that "nothing loaded yet" was describing the
 * default build rather than the one in front of the player.
 */
export function assetSummary(): AssetSummary {
  const builtInArt =
    typeof __BUILT_IN_CARD_ART__ !== "undefined" ? __BUILT_IN_CARD_ART__ : {};
  return {
    images: assetUrls.size + surfaceUrls.size + Object.keys(builtInArt).length,
    textCards,
  };
}

/**
 * Whether the app may be played: card art and printed text are both in.
 *
 * Card images rather than any image -- a surface such as a playmat is not a
 * card face -- and from either source, a loaded pack or a `--with-art` /
 * `--with-text` build's own. Until both are there the app shows nothing but
 * the screen that loads them (`screens/asset-gate.ts`).
 */
export function assetsReady(): boolean {
  const builtInArt =
    typeof __BUILT_IN_CARD_ART__ !== "undefined" ? __BUILT_IN_CARD_ART__ : {};
  const cardImages = assetUrls.size + Object.keys(builtInArt).length;
  return cardImages > 0 && textCards > 0;
}
