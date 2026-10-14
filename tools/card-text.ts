/**
 * Prints a card's text from the printed-text cache:
 *
 *   pnpm card:text OP17-042 [OP17-043 ...]
 *
 * The repository commits no printed text -- see docs/asset-packs.md -- so a
 * mechanic's comment names the card and its clause and this is how a reader
 * sees the words it implements. Needs the cache `pnpm reference:audit` writes;
 * says so when it is missing.
 */
import { requireKnownCard } from "@one-piece-sim/cards";
import {
  loadPrintedTextCache,
  PRINTED_TEXT_CACHE,
} from "@one-piece-sim/cards/node";
import { printedText } from "@one-piece-sim/cards";

const numbers = process.argv.slice(2);
if (numbers.length === 0) {
  console.error("Usage: pnpm card:text <card-number> [<card-number> ...]");
  process.exit(2);
}
if (loadPrintedTextCache() === 0) {
  console.error(
    `No printed-text cache at ${PRINTED_TEXT_CACHE}. Run \`pnpm reference:fetch\` then \`pnpm reference:audit\` to write it.`,
  );
  process.exit(1);
}
for (const number of numbers) {
  const card = requireKnownCard(number);
  const text = printedText(number);
  console.log(`${number} ${card.name} (${card.category})`);
  if (!text) {
    console.log("  (no text in the cache for this card)");
    continue;
  }
  console.log(`  ${text.effect || "-"}`);
  if (text.trigger) console.log(`  ${text.trigger}`);
  console.log();
}
