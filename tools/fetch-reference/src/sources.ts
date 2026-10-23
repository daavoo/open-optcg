/**
 * The card list pages the reference snapshot reads, by series id.
 *
 * Shared between the snapshot fetch (`pnpm reference:fetch`), which stores the
 * pages for the audit, and the asset downloaders (`pnpm assets:download` and
 * the Get cards bookmark's `tools/get-cards.ts`), which read the same pages
 * straight into a text pack. One list, so a set added for one is added for the other.
 */
export const BANDAI = "https://en.onepiece-cardgame.com";

export const CARDLIST_SERIES = [
  // ST-01 for ST01-011 Brook alone: a block-1 starter, but that card was
  // reprinted in block 4 and current Sabo lists run it.
  ["st01", "569001"],
  ["st10", "569010"],
  // ST-11 through ST-20, added for the seven starters whose identities were in
  // the pool only as the block icon a *reprint* elsewhere carries. Bandai
  // numbers a starter's series page 5690NN for ST-NN, which is what makes the
  // whole run addable at once.
  //
  // ST-13's page is fetched here but read by no `setSeries` entry yet: its
  // cards are built on an economy of face-up Life cards the mechanic DSL has
  // nothing for, so the product is its own piece of work rather than part of a
  // card import. Fetching it now means that work needs no second network run,
  // and the snapshot already carries the page.
  ["st11", "569011"],
  ["st12", "569012"],
  ["st13", "569013"],
  ["st14", "569014"],
  ["st15", "569015"],
  ["st16", "569016"],
  ["st17", "569017"],
  ["st18", "569018"],
  ["st19", "569019"],
  ["st20", "569020"],
  ["st21", "569021"],
  ["st22", "569022"],
  ["st23", "569023"],
  ["st24", "569024"],
  ["st25", "569025"],
  ["st26", "569026"],
  ["st27", "569027"],
  ["st28", "569028"],
  ["st29", "569029"],
  ["st30", "569030"],
  ["st31", "569031"],
  ["st32", "569032"],
  ["st33", "569033"],
  ["st34", "569034"],
  ["st35", "569035"],
  ["st36", "569036"],
  ["op01", "569101"],
  ["op02", "569102"],
  // OP-04 is block 1 and rotated, but three of its cards stay Standard-legal
  // (two re-blocked to 4, one Super Parallel `X`) and the OP-10 Usopp feature
  // deck plays all three. Only those identities are audited, through the
  // community pass; the page is fetched whole because Bandai serves it whole.
  ["op04", "569104"],
  ["op05", "569105"],
  ["op06", "569106"],
  ["op07", "569107"],
  ["op08", "569108"],
  ["op09", "569109"],
  ["op10", "569110"],
  ["op11", "569111"],
  ["op12", "569112"],
  ["op13", "569113"],
  ["op14-eb04", "569114"],
  ["op15-eb04", "569115"],
  ["op16", "569116"],
  ["op17", "569117"],
  ["eb01", "569201"],
  ["eb02", "569202"],
  ["eb03", "569203"],
  ["eb05", "569205"],
  ["prb02", "569302"],
  ["promo", "569901"],
  // "Other Product Card": promos Bandai printed in products outside the
  // promotion list, P-093 Trafalgar Law among them.
  ["other", "569801"],
] as const;

export function cardlistUrl(series: string): string {
  return `${BANDAI}/cardlist/?series=${series}`;
}
