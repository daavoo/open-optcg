import { cardRegistry } from "@one-piece-sim/cards";
import type { EditableDeck } from "./legality.js";

/**
 * A plain-text deck list -- one `4x OP01-016` line per card, the Leader among
 * them -- as every deck builder exports it. Blank lines and `#`/`//` comments
 * are skipped; anything after the card number on a line is ignored, so a list
 * that carries card names still reads.
 */
export function parseDeckList(value: string): EditableDeck {
  const parsed: EditableDeck = { leader: "", cards: {}, format: "standard" };
  for (const [index, rawLine] of value.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const match =
      line.match(/^(\d+)\s*x?\s+?([A-Z0-9]+-[A-Z0-9]+)(?:\s+.*)?$/i) ??
      line.match(/^(\d+)x([A-Z0-9]+-[A-Z0-9]+)(?:\s+.*)?$/i);
    if (!match)
      throw new Error(`Line ${index + 1} is not a quantity and card number.`);
    const quantity = Number(match[1]);
    const cardNumber = match[2]!.toUpperCase();
    const card = cardRegistry.get(cardNumber);
    if (card?.category === "leader") {
      if (quantity !== 1 || parsed.leader)
        throw new Error("A list must contain exactly one Leader.");
      parsed.leader = cardNumber;
    } else {
      parsed.cards[cardNumber] = (parsed.cards[cardNumber] ?? 0) + quantity;
    }
  }
  return parsed;
}

export function exportDeckList(deck: EditableDeck): string {
  const lines = [`1x ${deck.leader}`];
  for (const [cardNumber, quantity] of Object.entries(deck.cards).sort()) {
    lines.push(`${quantity}x ${cardNumber}`);
  }
  return `${lines.join("\n")}\n`;
}
