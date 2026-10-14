import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BANDAI, CARDLIST_SERIES, cardlistUrl } from "./sources.js";

interface Source {
  id: string;
  url: string;
  path: string;
  authority: "primary" | "secondary";
  contentType: string;
}

/** One row of `manifest.json`: a source plus what the fetch of it produced. */
interface ManifestEntry extends Source {
  resolvedUrl: string;
  fetchedAt: string;
  sha256: string;
  bytes: number;
}

const snapshot = process.argv[2];
if (!snapshot || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) {
  throw new Error(
    "Usage: pnpm reference:fetch <YYYY-MM-DD> [--only <source id>[,<source id>...]]",
  );
}
/**
 * `--only` fetches the named sources into an existing snapshot and merges
 * their entries into its manifest, leaving every other entry as it was.
 *
 * A snapshot is one reading of Bandai's site, and a full refetch re-reads
 * every page: the printed text moves with Bandai's errata, so the audit's
 * `officialTextHash` stamps move with it, and a one-page addition would carry
 * a whole pool's worth of unrelated churn. Adding a source this way keeps the
 * snapshot date honest -- each manifest entry carries its own `fetchedAt` --
 * and keeps the diff to the page that was added.
 */
const onlyFlag = process.argv.indexOf("--only");
const only =
  onlyFlag === -1
    ? null
    : new Set((process.argv[onlyFlag + 1] ?? "").split(",").filter(Boolean));
if (only && only.size === 0) {
  throw new Error("--only needs at least one source id");
}

const bandai = BANDAI;
const sources: Source[] = [
  {
    id: "bandai-rules-hub",
    url: `${bandai}/rules/`,
    path: "bandai/rules.html",
    authority: "primary",
    contentType: "text/html",
  },
  {
    id: "bandai-event",
    url: `${bandai}/events/beginners-deck-party2026.html`,
    path: "bandai/beginners-deck-party2026.html",
    authority: "primary",
    contentType: "text/html",
  },
  {
    id: "bandai-comprehensive-rules",
    url: `${bandai}/pdf/rule_comprehensive.pdf?20260116`,
    path: "bandai/rule-comprehensive.pdf",
    authority: "primary",
    contentType: "application/pdf",
  },
  {
    id: "bandai-rule-manual",
    url: `${bandai}/pdf/rule_manual.pdf?20230623`,
    path: "bandai/rule-manual.pdf",
    authority: "primary",
    contentType: "application/pdf",
  },
  ...Array.from({ length: 6 }, (_, index): Source => {
    const number = 31 + index;
    return {
      id: `bandai-faq-st${number}`,
      url: `${bandai}/pdf/qa_st-${number}.pdf?20260717`,
      path: `bandai/qa-st${number}.pdf`,
      authority: "primary",
      contentType: "application/pdf",
    };
  }),
  // Every card list page: the ST31-36 structure decks the format is built on,
  // and the booster/extra-booster/premium/promo series carrying identities
  // used by decks outside it. Bandai's page lists every card in the series,
  // not just one deck's worth. The list is shared with `pnpm assets:download`.
  ...CARDLIST_SERIES.map(([slug, series]): Source => ({
    id: `bandai-cardlist-${slug}`,
    url: cardlistUrl(series),
    path: `bandai/cardlist-${slug}.html`,
    authority: "primary",
    contentType: "text/html",
  })),
  // Bandai's list of card numbers whose block number has been updated by
  // ruling rather than by a printing: the Super Parallel Rare identities that
  // stay Standard-legal regardless of their icon, and the fifteen block-1
  // cards re-assigned to block 4 through March 2029. `reference:audit` folds
  // it into `generated-blocks.ts` beside the icons read off the cardlist
  // pages, because a legality read off the printed icon alone is wrong for
  // every card on it.
  {
    id: "bandai-block-updates",
    url: `${bandai}/rules/blockicon-card/`,
    path: "bandai/blockicon-card.html",
    authority: "primary",
    contentType: "text/html",
  },
  {
    id: "egman-cards",
    url: "https://deckbuilder.egmanevents.com/api/cards/optcg",
    path: "egman/cards.json",
    authority: "secondary",
    contentType: "application/json",
  },
  {
    id: "egman-game-data",
    url: "https://deckbuilder.egmanevents.com/api/gamedata/optcg",
    path: "egman/gamedata.json",
    authority: "secondary",
    contentType: "application/json",
  },
];

const root = join(process.cwd(), "fixtures", "reference", snapshot);
await mkdir(root, { recursive: true });
const fetchedAt = new Date().toISOString();
const manifestPath = join(root, "manifest.json");
const manifest: ManifestEntry[] = [];
const selected = only
  ? sources.filter((source) => only.has(source.id))
  : sources;
if (only) {
  const unknown = [...only].filter(
    (id) => !sources.some((source) => source.id === id),
  );
  if (unknown.length > 0)
    throw new Error(
      `--only names sources this tool does not know: ${unknown.join(", ")}`,
    );
}

for (const source of selected) {
  const destination = join(root, source.path);
  const temporary = `${destination}.tmp`;
  await mkdir(join(destination, ".."), { recursive: true });
  try {
    const response = await fetch(source.url, { redirect: "follow" });
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);
    const actualType = response.headers.get("content-type") ?? "";
    if (!actualType.includes(source.contentType)) {
      throw new Error(`Unexpected content type ${actualType}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(temporary, bytes);
    await rename(temporary, destination);
    manifest.push({
      id: source.id,
      url: source.url,
      resolvedUrl: response.url,
      path: source.path,
      fetchedAt,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      authority: source.authority,
      contentType: actualType.split(";")[0] ?? actualType,
      bytes: bytes.length,
    });
  } catch (error) {
    await rm(temporary, { force: true });
    throw new Error(
      `Failed to fetch ${source.id}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

let written = manifest;
if (only) {
  // Merge into the manifest already on disk: replace the entries for the
  // sources fetched this run, keep the rest in their existing order, and
  // append anything new. A snapshot with no manifest yet has nothing to merge.
  const existing = await readFile(manifestPath, "utf8")
    .then((text) => (JSON.parse(text) as { sources: ManifestEntry[] }).sources)
    .catch(() => [] as ManifestEntry[]);
  const fetched = new Map(manifest.map((entry) => [entry.id, entry]));
  written = [
    ...existing.map((entry) => fetched.get(entry.id) ?? entry),
    ...manifest.filter((entry) => !existing.some((e) => e.id === entry.id)),
  ];
}
await writeFile(
  manifestPath,
  `${JSON.stringify({ snapshot, sources: written }, null, 2)}\n`,
);
console.log(
  `Fetched ${manifest.length} sources into ${root}${only ? ` (manifest now lists ${written.length})` : ""}`,
);
