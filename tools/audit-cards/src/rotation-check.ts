/**
 * Has Bandai's rotation moved since the committed data was read?
 *
 * Run weekly by `.github/workflows/rotation.yml`. Two different questions, and
 * they need different evidence:
 *
 *  1. **Have the block icons changed?** Fully machine-answerable. Re-read every
 *     cardlist page the reference snapshot recorded and compare the icons to
 *     `packages/cards/src/generated-blocks.ts`. New products, and reprints that
 *     carry a card into a newer block or stamp it `X`, show up here.
 *  2. **Has the Standard floor moved?** Not machine-answerable. Bandai announces
 *     it in prose, and the cardlist pages never state it -- the icons say which
 *     block a printing is in, never which blocks are still legal. So this
 *     reports the two things that *are* evidence -- the floor's own `reviewBy`
 *     deadline, and a block icon higher than any seen before, which is what a
 *     new block looks like arriving -- and asks a human to read the schedule.
 *
 * Deliberately narrow: it re-fetches only the cardlist pages and rewrites only
 * `generated-blocks.ts`. A full `pnpm reference:fetch && pnpm reference:audit`
 * would also re-read every card's printed text and re-hash it, so an unattended
 * run could quietly restate what a card does. Rotation is metadata; this stays
 * metadata.
 *
 * Modes:
 *   (default)   human-readable report, always exit 0
 *   --check     exit 1 if anything needs a human, for the workflow to branch on
 *   --write     rewrite generated-blocks.ts from the live pages
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  blockPrintingSnapshot,
  cardBlockPrintings,
  DEFAULT_FORMAT_REGION,
  STANDARD_FLOORS,
} from "@one-piece-sim/cards";

import {
  diffBlockPrintings,
  diffIsEmpty,
  foldBlockPrintings,
  parseBlockIcons,
  parseBlockUpdates,
  toBlockPrintingMap,
  type BlockPrintingDiff,
} from "./block-icons.js";

const checkOnly = process.argv.includes("--check");
const write = process.argv.includes("--write");
/** Overridable so the workflow and a local run can be compared on one date. */
const today =
  process.argv.find((argument) => /^\d{4}-\d{2}-\d{2}$/.test(argument)) ??
  new Date().toISOString().slice(0, 10);

interface ManifestSource {
  id: string;
  url: string;
}

/**
 * The cardlist URLs, read from the snapshot's own manifest rather than from a
 * second copy of the series list.
 *
 * `tools/fetch-reference` owns which series this repo tracks, and the manifest
 * is what it wrote down. Re-deriving the list here would let the two drift, and
 * a checker watching a different set of pages from the one the data came from
 * is worse than no checker.
 */
async function cardlistSources(): Promise<ManifestSource[]> {
  const manifest = JSON.parse(
    await readFile(
      join(
        process.cwd(),
        "fixtures",
        "reference",
        blockPrintingSnapshot,
        "manifest.json",
      ),
      "utf8",
    ),
  ) as { sources: ManifestSource[] };
  return manifest.sources.filter(
    (source) =>
      source.id.startsWith("bandai-cardlist-") ||
      source.id === "bandai-block-updates",
  );
}

async function readLiveBlockPrintings(): Promise<Record<string, string[]>> {
  const sources = await cardlistSources();
  const pages: Array<Array<[string, string]>> = [];
  for (const source of sources) {
    const response = await fetch(source.url, { redirect: "follow" });
    if (!response.ok)
      throw new Error(
        `${source.id}: ${response.status} ${response.statusText}`,
      );
    const html = await response.text();
    const page =
      source.id === "bandai-block-updates"
        ? parseBlockUpdates(html)
        : parseBlockIcons(html);
    // A page that renders but carries no records is the failure mode that
    // would otherwise read as "every card on it lost its icon".
    if (page.length === 0)
      throw new Error(`${source.id}: page carried no card records`);
    pages.push(page);
  }
  return toBlockPrintingMap(foldBlockPrintings(pages));
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** How close the floor is to its own review deadline, in one line. */
function floorStatus(): { due: boolean; line: string } {
  const floor = STANDARD_FLOORS[DEFAULT_FORMAT_REGION];
  const remaining = daysBetween(today, floor.reviewBy);
  const due = remaining <= 60;
  return {
    due,
    line:
      remaining < 0
        ? `Standard floor review is ${-remaining} days OVERDUE (block ${floor.block}, verified ${floor.verifiedOn}, due ${floor.reviewBy})`
        : `Standard floor review due in ${remaining} days (block ${floor.block}, verified ${floor.verifiedOn}, due ${floor.reviewBy})`,
  };
}

function describe(diff: BlockPrintingDiff): string[] {
  const lines: string[] = [];
  if (diff.newBlocks.length > 0) {
    lines.push(
      `NEW BLOCK ICON: ${diff.newBlocks.join(", ")} -- a block this repo has never seen. Re-read the rotation schedule; the floor may have moved.`,
    );
  }
  if (diff.lost.length > 0) {
    lines.push(
      `LOST PRINTINGS (${diff.lost.length}) -- a printing does not stop existing, so treat this as a page that failed to render, not as data:`,
    );
    for (const entry of diff.lost.slice(0, 20)) {
      lines.push(
        `  ${entry.cardNumber}: ${entry.before.join("/")} -> ${entry.after.join("/") || "(gone)"}`,
      );
    }
  }
  if (diff.gained.length > 0) {
    lines.push(`Reprinted into another block (${diff.gained.length}):`);
    for (const entry of diff.gained.slice(0, 40)) {
      lines.push(
        `  ${entry.cardNumber}: ${entry.before.join("/")} -> ${entry.after.join("/")}`,
      );
    }
    if (diff.gained.length > 40)
      lines.push(`  ... and ${diff.gained.length - 40} more`);
  }
  if (diff.added.length > 0) {
    const blocks = [...new Set(diff.added.flatMap((entry) => entry.blocks))]
      .sort()
      .join(", ");
    lines.push(
      `New identities (${diff.added.length}), in block ${blocks}: ${diff.added
        .slice(0, 12)
        .map((entry) => entry.cardNumber)
        .join(", ")}${diff.added.length > 12 ? ", ..." : ""}`,
    );
  }
  return lines;
}

const live = await readLiveBlockPrintings();
const diff = diffBlockPrintings(cardBlockPrintings, live);
const floor = floorStatus();
/**
 * `lost` is excluded on purpose. It cannot be a real change, so it must not be
 * able to rewrite the committed data unattended -- a Bandai outage that served
 * empty pages would otherwise delete the block icons for the whole pool.
 */
const writable = diff.added.length > 0 || diff.gained.length > 0;
const needsHuman = !diffIsEmpty(diff) || floor.due;

if (write) {
  if (diff.lost.length > 0) {
    process.stderr.write(
      `Refusing to write: ${diff.lost.length} identities lost printings, which cannot be a real change.\n`,
    );
    process.exitCode = 1;
  } else if (!writable) {
    process.stdout.write("No block-icon changes to write.\n");
  } else {
    const path = join(
      process.cwd(),
      "packages",
      "cards",
      "src",
      "generated-blocks.ts",
    );
    const source = await readFile(path, "utf8");
    await writeFile(
      path,
      source
        .replace(
          /export const blockPrintingSnapshot = "[^"]+";/,
          `export const blockPrintingSnapshot = ${JSON.stringify(today)};`,
        )
        .replace(
          /export const cardBlockPrintings: Readonly<[\s\S]*$/,
          `export const cardBlockPrintings: Readonly<Record<string, readonly GeneratedBlockIcon[]>> = ${JSON.stringify(live, null, 2)};\n`,
        ),
    );
    process.stdout.write(
      `Wrote ${Object.keys(live).length} identities to generated-blocks.ts, stamped ${today}.\n`,
    );
  }
} else {
  const lines = [
    `Rotation check against ${blockPrintingSnapshot} data, read ${today}.`,
    floor.line,
    ...(diffIsEmpty(diff) ? ["Block icons unchanged."] : describe(diff)),
  ];
  const report = `${lines.join("\n")}\n`;
  if (checkOnly && needsHuman) process.stderr.write(report);
  else process.stdout.write(report);
  if (checkOnly && needsHuman) process.exitCode = 1;
}
