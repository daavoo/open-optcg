/**
 * Lookups over the append-only card index in `card-index.ts`.
 *
 * Two rows are reserved ahead of the real cards: `CARD_PAD` for an empty token
 * slot and `CARD_UNKNOWN` for a card the viewer is not entitled to identify --
 * the opponent's hand, face-down Life. The policy embeds both like any other
 * row, so "a card is here and I do not know which" is a learnable input rather
 * than an absence.
 *
 * Browser-safe on purpose: no filesystem, no hashing library. The table is a
 * TypeScript module so the web build can inline it next to the weights, the
 * same way `encode.ts` travels with the shipped sealed checkpoint.
 */
import { cardRegistry } from "@one-piece-sim/cards";
import { CARD_TABLE_CARDS } from "./card-index.js";

export const CARD_PAD = 0;
export const CARD_UNKNOWN = 1;
const FIRST_CARD_ROW = 2;

const CARD_ROW = new Map(
  CARD_TABLE_CARDS.map((card, index) => [card, index + FIRST_CARD_ROW]),
);

/** Rows in the embedding table, reserved rows included. */
export const CARD_TABLE_SIZE = CARD_TABLE_CARDS.length + FIRST_CARD_ROW;

/**
 * The embedding row for a card number, or `CARD_UNKNOWN` for one the table
 * does not hold. A registered card missing from the table is a stale table,
 * which `missingCardIndexEntries` reports and the server refuses to start on.
 */
export function cardRow(cardNumber: string): number {
  return CARD_ROW.get(cardNumber) ?? CARD_UNKNOWN;
}

/** Registered cards the table has no row for; empty when the table is current. */
export function missingCardIndexEntries(): string[] {
  const missing: string[] = [];
  for (const cardNumber of cardRegistry.keys()) {
    if (!CARD_ROW.has(cardNumber)) missing.push(cardNumber);
  }
  return missing;
}

/**
 * A cheap, dependency-free fingerprint of the table's contents and order.
 *
 * Written into every checkpoint and compared on load: the same cards in a
 * different order would read every embedding row against the wrong card, and
 * nothing downstream could tell. FNV-1a over the joined list is enough to
 * catch that; it is a change detector, not a security hash.
 */
export function cardTableFingerprint(): string {
  let hash = 0x811c9dc5;
  const text = CARD_TABLE_CARDS.join("\n");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a:${hash.toString(16).padStart(8, "0")}:${CARD_TABLE_CARDS.length}`;
}
