import {
  blockPrintingSnapshot,
  cardBlockPrintings,
  type GeneratedBlockIcon,
} from "./generated-blocks.js";

/**
 * Bandai's Block Icon System, and the two constructed formats it defines.
 *
 * Rotation changes no rule: the engine, the mechanics DSL and replay never see
 * a block. What it changes is which identities a deck may name, so everything
 * here is card metadata and deck validation.
 */

/** A block icon as it is printed on a card. */
export type BlockIcon = GeneratedBlockIcon;

/**
 * The block icon that never rotates.
 *
 * From April 2026 Bandai stamps `X` on newly released Super Parallel Rares and
 * on same-numbered reprints, and those printings stay Standard-legal for good.
 * It is not a number, which is why {@link BlockIcon} is a string union and the
 * floor comparison below is not a plain `>=` over every icon.
 */
const EVERGREEN_BLOCK: BlockIcon = "X";

export { blockPrintingSnapshot };

/**
 * The two constructed formats.
 *
 * Extra Regulation is every card ever printed; Standard is the blocks that have
 * not rotated. A deck built for Extra is a legitimate deck and stays shippable
 * -- the point of declaring a format is that a list says which one it is for,
 * not that one of them is rejected.
 */
export type DeckFormat = "standard" | "extra";
export const DECK_FORMATS: readonly DeckFormat[] = ["standard", "extra"];

/**
 * Regions run rotation on their own clock, so the floor is per region.
 *
 * Only `en` is stamped here, because Bandai's English cardlist is the only
 * primary source `tools/fetch-reference` reads. It is not an assumption that
 * every region shares it: the OP-17 RB Sabo list that surfaced this
 * (`op13-sabo-manifest.ts`) is scoped `/east/` on gumgum.gg and ran three Block
 * 1 cards, so either that region rotates later or the event was Extra. Adding a
 * region means adding a source for it, not relaxing this one.
 */
export type FormatRegion = "en";

export interface StandardFloor {
  /** The lowest numbered block still legal in Standard. */
  block: number;
  /** The date Bandai's rotation moved the floor to this block. */
  effectiveFrom: string;
  /** The date a human last confirmed this floor against {@link source}. */
  verifiedOn: string;
  /**
   * The date that confirmation goes stale, and the deadline the data is held
   * to.
   *
   * The floor moves roughly once a year, so a hardcoded number goes stale
   * silently. Two things keep it honest, and they are deliberately split by
   * what they can know:
   *
   *  - `test/block-icons.test.ts` fails once {@link blockPrintingSnapshot}
   *    passes this date. That is a comparison between two committed constants,
   *    so it is deterministic -- it fires when somebody refreshes the card data
   *    past the deadline, not on an arbitrary Tuesday.
   *  - `.github/workflows/rotation.yml` runs weekly, reads the wall clock, and
   *    opens a PR when this date is near or past. That is the half that needs
   *    the clock, and a scheduled job is the right place for it: a test that
   *    fails by the calendar breaks builds nobody changed.
   *
   * Set it past the next expected rotation, not on it -- the point is a window
   * to notice in, not a tripwire on the day.
   */
  reviewBy: string;
  /** Where the floor was read from. */
  source: string;
}

/**
 * Block 1 -- OP-01 to OP-04 and the Starter Decks alongside them -- left
 * Standard on 1 April 2026, so the floor is block 2 and Standard is OP-05
 * through OP-17.
 *
 * Not every block-1 *printing* went with it. Bandai's "Overview of Cards
 * Subject to Block Number Updates" re-assigns fifteen block-1 card numbers to
 * block 4 through 31 March 2029 and keeps the Super Parallel Rare identities
 * legal outright; `reference:audit` folds both into `cardBlockPrintings` as
 * one more icon on the identity (`4`, or `X`), so the floor comparison here
 * needs no special case for them.
 */
export const STANDARD_FLOORS: Readonly<Record<FormatRegion, StandardFloor>> = {
  en: {
    block: 2,
    effectiveFrom: "2026-04-01",
    verifiedOn: "2026-08-22",
    // Bandai has retired a block each April. Block 2 is expected to go in
    // April 2027; this leaves two months past that to re-read and re-stamp.
    reviewBy: "2027-06-01",
    source: "https://onepiece.gg/rotation/",
  },
};

export const DEFAULT_FORMAT_REGION: FormatRegion = "en";

/**
 * Identities the snapshot carries no block icon for.
 *
 * Three ways that happens, and all three are holes rather than facts: Bandai's
 * English cardlist has no record of the card at all (such a card is also
 * `SECONDARY_SOURCE_ONLY` in `deck-provenance.ts`); the printing exists only
 * on a product page `tools/fetch-reference` does not fetch; or the record is
 * there and its icon field reads `-`. None of them
 * means "rotated out", so an unstamped identity is reported as unknown and a
 * Standard deck may only name one that is listed here.
 *
 * Keep this as short as the facts allow. `test/block-icons.test.ts` fails an
 * entry that Bandai has since stamped, so a stale exemption cannot survive a
 * data refresh.
 */
export const UNSTAMPED_BLOCK_PRINTINGS: readonly string[] = [
  // The sealed-only Leader identity this repo mints for OP-17 sealed play. It
  // is not a Bandai printing at all, so it has no icon to read.
  "SEALED-LUFFY",
  // The one record in the snapshot whose block field reads "-". OP-15 is block
  // 4 and every other OP15- identity on the page is stamped 4, so this is a
  // gap in Bandai's own page rather than a card outside the system. Exempted
  // rather than assumed into block 4: guessing an icon is exactly the move the
  // per-printing data exists to stop.
  "OP15-096",
];

/** Every block icon `cardNumber` has been printed with, across the snapshot. */
export function cardBlockIcons(cardNumber: string): readonly BlockIcon[] {
  return cardBlockPrintings[cardNumber] ?? [];
}

export interface FormatLegality {
  cardNumber: string;
  blocks: readonly BlockIcon[];
  /** Whether the snapshot carries any block icon for this identity at all. */
  stamped: boolean;
  legal: boolean;
  /** Why it is not legal, in one line, or `null` when it is. */
  reason: string | null;
}

/**
 * Whether an identity may be played in `format`, and why.
 *
 * Legality is a property of a *printing*, not of an identity: the icon travels
 * with the product, so a card is Standard-legal when any one of its printings
 * sits in a legal block. Both directions of that matter, and both are in the
 * snapshot -- OP04-016 is block 1 in PRB-02 and block 4 on its ST-31 printing,
 * so it stays; OP01-016 was reprinted into OP-05 and ST-10 and carries block 1
 * on all three, so "reprinted in a newer set" is not the test. Its ST-31
 * printing carries `X`, and that is what keeps it legal.
 */
export function cardFormatLegality(
  cardNumber: string,
  format: DeckFormat,
  region: FormatRegion = DEFAULT_FORMAT_REGION,
): FormatLegality {
  return blockIconLegality(
    cardNumber,
    cardBlockIcons(cardNumber),
    format,
    region,
  );
}

/**
 * The same verdict over a block set held elsewhere.
 *
 * `DeckCardRow` carries its identity's icons so that a caller validating
 * hand-built rows is checked against the rows it passed rather than against
 * whatever the registry happens to say, which is the same reason the row
 * carries its own `officialTextHash`.
 */
export function blockIconLegality(
  cardNumber: string,
  blocks: readonly BlockIcon[],
  format: DeckFormat,
  region: FormatRegion = DEFAULT_FORMAT_REGION,
): FormatLegality {
  const stamped = blocks.length > 0;
  if (format === "extra") {
    return { cardNumber, blocks, stamped, legal: true, reason: null };
  }
  const floor = STANDARD_FLOORS[region];
  if (!stamped) {
    const exempt = UNSTAMPED_BLOCK_PRINTINGS.includes(cardNumber);
    return {
      cardNumber,
      blocks,
      stamped,
      legal: exempt,
      reason: exempt
        ? null
        : `no block icon in the ${blockPrintingSnapshot} reference snapshot`,
    };
  }
  const legal = blocks.some(
    (block) => block === EVERGREEN_BLOCK || Number(block) >= floor.block,
  );
  return {
    cardNumber,
    blocks,
    stamped,
    legal,
    reason: legal
      ? null
      : `block ${blocks.join("/")} rotated out of Standard on ${floor.effectiveFrom} (${region} floor is block ${floor.block})`,
  };
}

/** Shorthand for {@link cardFormatLegality}'s verdict. */
export function isStandardLegal(
  cardNumber: string,
  region: FormatRegion = DEFAULT_FORMAT_REGION,
): boolean {
  return cardFormatLegality(cardNumber, "standard", region).legal;
}
