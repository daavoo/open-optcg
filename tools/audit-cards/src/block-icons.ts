import { load, type CheerioAPI } from "cheerio";

/**
 * Reading Bandai's block icons off a cardlist page, and comparing two readings.
 *
 * Shared by `index.ts`, which stamps the icons into `generated-blocks.ts` as
 * part of the reference audit, and by `rotation-check.ts`, which re-reads the
 * live pages on a schedule to see whether they still say the same thing. One
 * parser rather than two: a checker that reads the page differently from the
 * generator would report drift that is only its own disagreement.
 */

export const normalize = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();

export function bodyText($: CheerioAPI, element: unknown): string {
  const clone = $(element as never).clone();
  clone.find("h3").remove();
  clone.find("br").replaceWith("\n");
  return normalize(clone.text());
}

/**
 * The block icons a printing can carry.
 *
 * `1`-`5` are the numbered blocks Bandai rotates; `X` is the icon introduced in
 * April 2026 for Super Parallel Rares and same-numbered reprints, and it never
 * rotates. A printing whose icon reads `-` -- OP15-096 is the only one in the
 * 2026-08-22 snapshot -- carries no icon at all and is recorded as no printing
 * rather than as a block, because "-" cannot be told apart from a field the
 * page failed to render.
 */
export const BLOCK_ICONS = new Set(["1", "2", "3", "4", "5", "X"]);

/**
 * The block icon of every printing on one cardlist page.
 *
 * Deliberately not a field on the audit's `OfficialCard`: the icon travels with
 * the *product*, not with the identity, so two records for one card number can
 * legitimately disagree on it -- OP04-016 is block 1 in PRB-02 and block 4 on
 * its ST-31 printing, and OP05-006's alt art is block 2 where its base print is
 * block 1. The audit's passes reject records for one number that disagree on
 * anything, which is the right rule for printed text and the wrong one here.
 *
 * Throws on an icon outside {@link BLOCK_ICONS}. A sixth block is exactly the
 * event this whole file exists to notice, and noticing it as a crash in a
 * scheduled job beats silently recording an icon nothing knows how to compare.
 */
export function parseBlockIcons(html: string): Array<[string, string]> {
  const $ = load(html);
  return $("dl.modalCol")
    .toArray()
    .flatMap((element): Array<[string, string]> => {
      const cardNumber = normalize(
        $(element).find(".infoCol span").first().text(),
      );
      if (!cardNumber)
        throw new Error("Bandai record is missing a card number");
      const icon = bodyText($, $(element).find(".block").get(0));
      if (!icon || icon === "-") return [];
      if (!BLOCK_ICONS.has(icon))
        throw new Error(`${cardNumber}: unknown block icon ${icon}`);
      return [[cardNumber, icon]];
    });
}

/**
 * The block-number updates Bandai publishes by ruling rather than by printing.
 *
 * `/rules/blockicon-card/` lists card numbers whose Standard legality is not
 * what the icon on any of their printings says. Two of its sections change
 * what a card may be played in, and each is read as one more icon on the
 * identity, so the consumer's "legal if any printing sits in a legal block"
 * rule needs no second code path:
 *
 *  - "Cards Generally Permitted in Standard Regulation" -- the Super Parallel
 *    Rare identities, which "will generally remain legal for use in Standard
 *    Regulation regardless of whether they have been reprinted". That is the
 *    evergreen `X` in all but the letter, so it is recorded as `X`.
 *  - "Cards Eligible for Use Under Block Number ④" -- identities that "will be
 *    treated as belonging to the specified Block Number" whatever they were
 *    printed with, so each is recorded as that block. The circled digit in the
 *    heading is the block.
 *
 * The third section, "Updated Block Number and cards that have been
 * reprinted", is a cross-reference to the two above and to the cardlist pages,
 * and adds nothing they do not already say, so it is skipped. A heading this
 * parser does not recognise stops the run for the same reason an unknown icon
 * does: a fourth category is a ruling nothing downstream knows how to apply.
 */
export function parseBlockUpdates(html: string): Array<[string, string]> {
  const $ = load(html);
  const updates: Array<[string, string]> = [];
  const sections = $("h3").toArray();
  if (sections.length === 0)
    throw new Error("block-update page carried no section headings");
  for (const heading of sections) {
    const title = normalize($(heading).text());
    const icon = blockFromHeading(title);
    // The list sits in the same `.row` as its heading, after the paragraph.
    const cardNumbers = $(heading)
      .closest(".row")
      .find("li")
      .toArray()
      .map(
        (item) => normalize($(item).text()).match(/\b[A-Z]+\d{2}-\d{3}\b/)?.[0],
      )
      .filter((cardNumber): cardNumber is string => cardNumber !== undefined);
    if (icon === null) continue;
    if (cardNumbers.length === 0)
      throw new Error(`block-update section "${title}" listed no card numbers`);
    for (const cardNumber of cardNumbers) updates.push([cardNumber, icon]);
  }
  return updates;
}

const CIRCLED_DIGITS = "①②③④⑤";

/**
 * Which icon a block-update heading assigns, `null` for the cross-reference
 * section, and a thrown error for a heading this file has never seen.
 */
function blockFromHeading(title: string): string | null {
  if (/^Cards Generally Permitted in Standard Regulation$/i.test(title))
    return "X";
  const eligible = /^Cards Eligible for Use Under Block Number (.)$/i.exec(
    title,
  );
  if (eligible) {
    const digit = CIRCLED_DIGITS.indexOf(eligible[1]!) + 1;
    const icon = digit > 0 ? String(digit) : eligible[1]!;
    if (!BLOCK_ICONS.has(icon))
      throw new Error(
        `block-update heading names unknown block ${eligible[1]}`,
      );
    return icon;
  }
  if (/^Updated Block Number and cards that have been reprinted$/i.test(title))
    return null;
  throw new Error(`unrecognised block-update section: "${title}"`);
}

/** Every block icon each card number carries, folded across many pages. */
export function foldBlockPrintings(
  pages: Iterable<Array<[string, string]>>,
): Map<string, Set<string>> {
  const printings = new Map<string, Set<string>>();
  for (const page of pages) {
    for (const [cardNumber, icon] of page) {
      let icons = printings.get(cardNumber);
      if (!icons) printings.set(cardNumber, (icons = new Set()));
      icons.add(icon);
    }
  }
  return printings;
}

/** The committed shape: card number to its sorted icons. */
export type BlockPrintingMap = Readonly<Record<string, readonly string[]>>;

export function toBlockPrintingMap(
  printings: Map<string, Set<string>>,
): Record<string, string[]> {
  return Object.fromEntries(
    [...printings.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cardNumber, icons]) => [cardNumber, [...icons].sort()]),
  );
}

export interface BlockPrintingDiff {
  /** Identities the live pages carry that the committed data does not. */
  added: ReadonlyArray<{ cardNumber: string; blocks: readonly string[] }>;
  /** Identities that gained an icon -- a reprint into another block. */
  gained: ReadonlyArray<{
    cardNumber: string;
    before: readonly string[];
    after: readonly string[];
  }>;
  /**
   * Identities that *lost* an icon, or vanished from the pages entirely.
   *
   * Should never happen: a printing that exists does not stop existing. When it
   * does, the likely cause is a page that failed to render rather than a real
   * change, which is why this is reported separately and never written.
   */
  lost: ReadonlyArray<{
    cardNumber: string;
    before: readonly string[];
    after: readonly string[];
  }>;
  /** Block icons in the live data that the committed data has never seen. */
  newBlocks: readonly string[];
}

/**
 * What changed between the committed block data and a fresh reading.
 *
 * Pure, so `test/rotation-check.test.ts` can drive it without the network. The
 * asymmetry between `gained` and `lost` is the point: gaining an icon is
 * routine and can only ever make a card *more* legal, so it is safe to write
 * unattended. Losing one cannot happen for a real reason, so it stops the run.
 */
export function diffBlockPrintings(
  committed: BlockPrintingMap,
  live: BlockPrintingMap,
): BlockPrintingDiff {
  const added: BlockPrintingDiff["added"][number][] = [];
  const gained: BlockPrintingDiff["gained"][number][] = [];
  const lost: BlockPrintingDiff["lost"][number][] = [];
  const knownBlocks = new Set(Object.values(committed).flat());
  const newBlocks = new Set<string>();

  for (const [cardNumber, blocks] of Object.entries(live).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const block of blocks) {
      if (!knownBlocks.has(block)) newBlocks.add(block);
    }
    const before = committed[cardNumber];
    if (!before) {
      added.push({ cardNumber, blocks });
      continue;
    }
    const missing = before.filter((block) => !blocks.includes(block));
    const extra = blocks.filter((block) => !before.includes(block));
    if (missing.length > 0) lost.push({ cardNumber, before, after: blocks });
    else if (extra.length > 0)
      gained.push({ cardNumber, before, after: blocks });
  }

  for (const [cardNumber, before] of Object.entries(committed).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    if (!live[cardNumber]) lost.push({ cardNumber, before, after: [] });
  }

  return {
    added,
    gained,
    lost: lost.sort((left, right) =>
      left.cardNumber.localeCompare(right.cardNumber),
    ),
    newBlocks: [...newBlocks].sort(),
  };
}

/** Whether a diff carries anything at all. */
export function diffIsEmpty(diff: BlockPrintingDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.gained.length === 0 &&
    diff.lost.length === 0 &&
    diff.newBlocks.length === 0
  );
}
