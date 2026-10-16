/**
 * Ettin's tokenizer, exactly, for Node: byte-level BPE with the real merges.
 *
 * The training corpus is tokenised by the reference implementation
 * (`tokenizers`, from Python), so tokens produced here for live games must be
 * the same ids for the same text -- `bpe-parity.ts` checks that over the
 * corpus. Unlike the browser seat's table-driven tokenizer
 * (`packages/agents/src/scorer/tokenizer.ts`), nothing falls back: every word
 * goes through the merges, as the reference does.
 *
 * The pipeline, as the reference runs it: added tokens (runs of spaces and a
 * few placeholders) are split out of the text first; each remaining piece is
 * NFC-normalised, split by the GPT-2 pattern, mapped byte-to-unicode, and
 * merged by rank.
 */
import { readFileSync } from "node:fs";

const SPLIT =
  /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

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

interface TokenizerJson {
  model: { vocab: Record<string, number>; merges: string[] };
  added_tokens: Array<{ id: number; content: string; special: boolean }>;
}

export class BpeTokenizer {
  readonly #vocab: Map<string, number>;
  readonly #ranks: Map<string, number>;
  readonly #added: RegExp | undefined;
  readonly #addedIds: Map<string, number>;
  readonly #cache = new Map<string, number[]>();
  readonly #byteChar = byteToUnicode();
  readonly #encoder = new TextEncoder();

  constructor(path: string) {
    const json = JSON.parse(readFileSync(path, "utf8")) as TokenizerJson;
    this.#vocab = new Map(Object.entries(json.model.vocab));
    this.#ranks = new Map(
      json.model.merges.map((merge, rank) => [merge, rank]),
    );
    // Non-special added tokens are matched in the raw text, longest first.
    const added = json.added_tokens.filter((token) => !token.special);
    this.#addedIds = new Map(added.map((token) => [token.content, token.id]));
    const escaped = added
      .map((token) => token.content)
      .sort((a, b) => b.length - a.length)
      .map((content) => content.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    this.#added =
      escaped.length > 0 ? new RegExp(escaped.join("|"), "g") : undefined;
  }

  #bpe(word: string): number[] {
    const cached = this.#cache.get(word);
    if (cached) return cached;
    let parts = Array.from(word);
    for (;;) {
      let best = -1;
      let bestRank = Infinity;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const rank = this.#ranks.get(`${parts[i]} ${parts[i + 1]}`);
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          best = i;
        }
      }
      if (best < 0) break;
      const left = parts[best]!;
      const right = parts[best + 1]!;
      const merged: string[] = [];
      for (let i = 0; i < parts.length; i += 1) {
        if (
          i < parts.length - 1 &&
          parts[i] === left &&
          parts[i + 1] === right
        ) {
          merged.push(left + right);
          i += 1;
        } else {
          merged.push(parts[i]!);
        }
      }
      parts = merged;
    }
    const ids = parts.map((part) => {
      const id = this.#vocab.get(part);
      if (id === undefined) throw new Error(`BPE_UNKNOWN_TOKEN: ${part}`);
      return id;
    });
    this.#cache.set(word, ids);
    return ids;
  }

  #plain(text: string, out: number[]): void {
    for (const match of text.normalize("NFC").matchAll(SPLIT)) {
      let mapped = "";
      for (const byte of this.#encoder.encode(match[0]))
        mapped += this.#byteChar[byte] ?? "";
      out.push(...this.#bpe(mapped));
    }
  }

  /** Token ids for `text`, with no special tokens added. */
  encode(text: string): number[] {
    const out: number[] = [];
    if (!this.#added) {
      this.#plain(text, out);
      return out;
    }
    let cursor = 0;
    for (const match of text.matchAll(this.#added)) {
      if (match.index > cursor)
        this.#plain(text.slice(cursor, match.index), out);
      out.push(this.#addedIds.get(match[0])!);
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) this.#plain(text.slice(cursor), out);
    return out;
  }
}
