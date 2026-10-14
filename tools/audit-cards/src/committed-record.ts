import { createHash } from "node:crypto";
import { deriveRules, type PrintedText } from "@one-piece-sim/cards";

/**
 * What the audit commits for a card, and what it keeps out.
 *
 * A parsed reference record carries the card's printed text. The repository
 * does not: `toCommittedRecord` replaces `effect` and `trigger` with the rules
 * derived from them and a hash of the words, and `textPackEntry` is where the
 * words go instead -- the gitignored `packages/cards/printed-text.json`, which
 * tests and tools read and a player loads into the app as an asset pack.
 *
 * Both halves come from the same parsed record in the same pass, so the hash
 * committed beside the rules is the hash of the text in the cache.
 */
export interface ParsedCardRecord extends PrintedText {
  cardNumber: string;
  name: string;
  category: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  colors: readonly string[];
  types: readonly string[];
  attribute: string | null;
  rarity?: string;
  sourceMatch: boolean;
}

export function textHash(text: PrintedText): string {
  return createHash("sha256")
    .update(JSON.stringify({ effect: text.effect, trigger: text.trigger }))
    .digest("hex");
}

export function toCommittedRecord(record: ParsedCardRecord) {
  const { effect, trigger, ...rest } = record;
  return {
    ...rest,
    rules: deriveRules({
      name: record.name,
      category: record.category,
      effect,
      trigger,
    }),
    officialTextHash: textHash({ effect, trigger }),
  };
}

export function textPackEntry(record: ParsedCardRecord) {
  return {
    name: record.name,
    effect: record.effect,
    trigger: record.trigger,
  };
}

/** The file the audit writes the text to; see `packages/cards/src/node.ts`. */
export function textPackFile(
  source: string,
  cards: Readonly<Record<string, ReturnType<typeof textPackEntry>>>,
): string {
  const sorted = Object.fromEntries(
    Object.entries(cards).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify({ version: 1, source, cards: sorted }, null, 2)}\n`;
}
