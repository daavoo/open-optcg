/**
 * A rendered decision as the token ids and card rows the Python corpus holds.
 *
 * The same split `sys1/data.py:tokenize_texts` makes: each `[[CARD]]`
 * placeholder is one CARD_SLOT token carrying that card's row -- its index in
 * the sorted card table -- and every other piece of text is tokenised exactly
 * (`bpe.ts`). Row 0 marks a token that is not a card.
 */
import { readFileSync } from "node:fs";
import { BpeTokenizer } from "./bpe.js";

const CARD_SLOT = 50300;
const PLACEHOLDER = /\[\[([^\]]+)\]\]/g;

/** ids, then card rows, one entry per token. */
export type TokenizedText = [number[], number[]];

export class DecisionTokenizer {
  readonly #bpe: BpeTokenizer;
  readonly #rows: Map<string, number>;
  readonly #cache = new Map<string, TokenizedText>();

  /** Card number to its row in `cards.json` sorted by number, as `data.py` indexes it. */
  get rows(): Map<string, number> {
    return this.#rows;
  }

  constructor(tokenizerPath: string, cardsPath: string) {
    this.#bpe = new BpeTokenizer(tokenizerPath);
    const numbers = Object.keys(
      JSON.parse(readFileSync(cardsPath, "utf8")) as Record<string, unknown>,
    ).sort();
    this.#rows = new Map(numbers.map((number, row) => [number, row]));
  }

  text(text: string): TokenizedText {
    const cached = this.#cache.get(text);
    if (cached) return cached;
    const ids: number[] = [];
    const rows: number[] = [];
    let cursor = 0;
    const plain = (piece: string) => {
      for (const id of this.#bpe.encode(piece)) {
        ids.push(id);
        rows.push(0);
      }
    };
    for (const match of text.matchAll(PLACEHOLDER)) {
      plain(text.slice(cursor, match.index));
      const row = this.#rows.get(match[1]!);
      if (row === undefined) throw new Error(`UNKNOWN_CARD_ROW: ${match[1]}`);
      ids.push(CARD_SLOT);
      rows.push(row);
      cursor = match.index + match[0].length;
    }
    plain(text.slice(cursor));
    const tokenized: TokenizedText = [ids, rows];
    // Action lines repeat across decisions; states rarely do.
    if (this.#cache.size < 200_000) this.#cache.set(text, tokenized);
    return tokenized;
  }

  decision(state: string, actions: readonly string[]) {
    return {
      state: this.text(state),
      actions: actions.map((a) => this.text(a)),
    };
  }
}
