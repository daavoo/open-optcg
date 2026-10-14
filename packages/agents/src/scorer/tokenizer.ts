/**
 * The scorer's tokenizer: Ettin's byte-level BPE, reproduced by table.
 *
 * A rendered decision draws its words from a small closed set -- the
 * renderer's own vocabulary, numbers, labels and card names -- so rather than
 * ship fifty thousand merge rules, the model pack carries a table from each
 * pre-tokenised word seen in training to the token ids the real tokenizer gave
 * it. The pre-tokenisation (NFC, the GPT-2 split pattern, the byte-to-unicode
 * map) is reproduced exactly, so a seen word is tokenised exactly as it was in
 * training. An unseen word falls back to one token per byte: still valid
 * input, just not the merge the model learned.
 *
 * Card placeholders (`[[OP01-001]]`) become the pack's card-slot token and
 * are reported alongside, so the model can write that card's vector there.
 */

const PLACEHOLDER = /\[\[([^\]]+)\]\]/g;
const SPLIT =
  /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/** GPT-2's reversible byte -> printable-character map. */
function byteToUnicode(): string[] {
  const bytes: number[] = [];
  for (let b = 33; b <= 126; b += 1) bytes.push(b);
  for (let b = 161; b <= 172; b += 1) bytes.push(b);
  for (let b = 174; b <= 255; b += 1) bytes.push(b);
  const chars = bytes.slice();
  let extra = 0;
  for (let b = 0; b < 256; b += 1) {
    if (!bytes.includes(b)) {
      bytes.push(b);
      chars.push(256 + extra);
      extra += 1;
    }
  }
  const map: string[] = new Array<string>(256);
  bytes.forEach((b, i) => {
    map[b] = String.fromCharCode(chars[i]!);
  });
  return map;
}

const BYTE_CHAR = byteToUnicode();
const ENCODER = new TextEncoder();

export interface TokenizerTables {
  /** Byte-mapped pre-tokenised word -> the pack's token indices. */
  words: Record<string, number[]>;
  /** Byte-mapped single character -> token index, for the fallback. */
  bytes: Record<string, number>;
  cardSlot: number;
}

export interface Tokenized {
  ids: number[];
  /** The card number behind each card-slot token, in order. */
  cards: string[];
}

export class Tokenizer {
  readonly #tables: TokenizerTables;
  unseenWords = 0;

  constructor(tables: TokenizerTables) {
    this.#tables = tables;
  }

  #word(word: string, out: number[]): void {
    let mapped = "";
    for (const byte of ENCODER.encode(word)) mapped += BYTE_CHAR[byte] ?? "";
    const known = this.#tables.words[mapped];
    if (known) {
      out.push(...known);
      return;
    }
    this.unseenWords += 1;
    for (const character of mapped) {
      const id = this.#tables.bytes[character];
      if (id !== undefined) out.push(id);
    }
  }

  #text(text: string, out: number[]): void {
    for (const match of text.normalize("NFC").matchAll(SPLIT))
      this.#word(match[0], out);
  }

  encode(text: string): Tokenized {
    const ids: number[] = [];
    const cards: string[] = [];
    let cursor = 0;
    for (const match of text.matchAll(PLACEHOLDER)) {
      this.#text(text.slice(cursor, match.index), ids);
      ids.push(this.#tables.cardSlot);
      cards.push(match[1]!);
      cursor = match.index + match[0].length;
    }
    this.#text(text.slice(cursor), ids);
    return { ids, cards };
  }
}
