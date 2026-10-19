/**
 * The model pack: everything the in-browser scorer needs, in one JSON value.
 *
 * Written by ml/sys1/export_web.py (the text scorer) or
 * export_compact.py (the small scorer, `CompactPack`). Weights travel as one
 * base64 blob of little-endian float16, which is half the size of float32 and
 * decodes in a few milliseconds; each tensor names its offset and shape in it.
 */
import {
  ScorerModel,
  type MatmulBackend,
  type ScorerConfig,
  type Tensor,
} from "./model.js";
import { Tokenizer, type TokenizerTables } from "./tokenizer.js";
import { COMPACT_VERSION, V1_ZONES } from "./compact.js";
import { CompactModel, type CompactConfig } from "./compact-model.js";

export interface ScorerPack {
  version: number;
  /** The checkpoint this was exported from, for display and bug reports. */
  source: string;
  /** Whether the checkpoint read printed card text in training, and so may not be published. */
  trainedOnPrintedText?: boolean;
  config: ScorerConfig;
  cards: string[];
  tokenizer: TokenizerTables;
  tensors: Record<string, { offset: number; shape: number[] }>;
  /** base64 float16, little-endian. */
  data: string;
}

function float16(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The packed float16 tensors, each decoded to float32. */
function decodeTensors(
  data: string,
  entries: Record<string, { offset: number; shape: number[] }>,
): Map<string, Tensor> {
  const bytes = decodeBase64(data);
  const halves = new Uint16Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / 2,
  );
  const table = new Float32Array(65536);
  for (let bits = 0; bits < 65536; bits += 1) table[bits] = float16(bits);
  const tensors = new Map<string, Tensor>();
  for (const [name, { offset, shape }] of Object.entries(entries)) {
    const size = shape.reduce((product, n) => product * n, 1);
    const values = new Float32Array(size);
    for (let i = 0; i < size; i += 1) values[i] = table[halves[offset + i]!]!;
    tensors.set(name, { data: values, shape });
  }
  return tensors;
}

/**
 * The small scorer's pack (`ml/sys1/export_compact.py`): the
 * same float16 blob, a `kind` that tells it from the text scorer's, and no
 * tokenizer -- the compact encoding has no text.
 */
export interface CompactPack {
  kind: "compact";
  version: number;
  /** `COMPACT_VERSION` of the encoding the model was trained on (`compact.ts`). */
  compactVersion: number;
  source: string;
  trainedOnPrintedText?: boolean;
  config: CompactConfig;
  /** Card numbers in row order: `cards.json` sorted by number. */
  cards: string[];
  tensors: Record<string, { offset: number; shape: number[] }>;
  data: string;
}

export function isCompactPack(
  pack: ScorerPack | CompactPack,
): pack is CompactPack {
  return "kind" in pack;
}

/**
 * A deck adapter (`ml/sys1/export_adapter.py`): a low-rank
 * update of a base pack's blocks and heads, trained piloting one deck. Each
 * adapted layer `<layer>` carries `<layer>.a` (in, rank) and `<layer>.b`
 * (rank, out), already scaled, and plays as `<layer>.w + a @ b`.
 *
 * It may also carry its own card-table rows for the cards it pilots
 * (`cardRows`, in the order of its `card.rows` tensor): the low-rank update
 * leaves the table frozen, and a card only its deck plays is barely trained
 * in the base. They replace the base's rows only in the model this adapter
 * makes, so a seat without it reads every card as the base does.
 */
export interface CompactAdapter {
  kind: "compact-adapter";
  version: number;
  /** The list it was trained piloting: its Leader picks the seats it plays (`adapterFor`). */
  deck: { id: string; leader: string; cards: Record<string, number> };
  /** The base pack's `source`: the adapter is meaningless over any other. */
  base: string;
  source: string;
  trainedOnPrintedText?: boolean;
  rank: number;
  /** Card numbers whose rows `card.rows` holds, in order. */
  cardRows?: string[];
  tensors: Record<string, { offset: number; shape: number[] }>;
  data: string;
}

/** Cards two lists share, counting copies. */
function sharedCards(
  left: Record<string, number>,
  right: Record<string, number>,
): number {
  let shared = 0;
  for (const [card, count] of Object.entries(left))
    shared += Math.min(count, right[card] ?? 0);
  return shared;
}

/**
 * The adapter for a seat's deck: any adapter trained under the same Leader.
 * An adapter learns how to play a Leader's engine more than one exact list,
 * and a player's own build of that Leader can differ in many slots, so the
 * Leader alone decides. Where two adapters share it, the one whose list has
 * the most cards in common with the seat's wins.
 */
export function adapterFor(
  adapters: readonly CompactAdapter[],
  deck: { leader: string; cards: Record<string, number> },
): CompactAdapter | undefined {
  let best: CompactAdapter | undefined;
  let bestShared = -1;
  for (const adapter of adapters) {
    if (adapter.deck.leader !== deck.leader) continue;
    const shared = sharedCards(adapter.deck.cards, deck.cards);
    if (shared > bestShared) [best, bestShared] = [adapter, shared];
  }
  return best;
}

function applyAdapter(
  tensors: Map<string, Tensor>,
  adapter: CompactAdapter,
  cards: readonly string[],
): void {
  const factors = decodeTensors(adapter.data, adapter.tensors);
  if (adapter.cardRows?.length) {
    const rows = factors.get("card.rows");
    const table = tensors.get("card.weight");
    if (!rows || !table) throw new Error("ADAPTER_TENSOR_MISSING: card.rows");
    const d = table.shape[1]!;
    if (rows.shape[0] !== adapter.cardRows.length || rows.shape[1] !== d)
      throw new Error("ADAPTER_SHAPE_MISMATCH: card.rows");
    const out = new Float32Array(table.data);
    adapter.cardRows.forEach((card, i) => {
      const at = cards.indexOf(card);
      if (at < 0) throw new Error(`ADAPTER_UNKNOWN_CARD: ${card}`);
      out.set(rows.data.subarray(i * d, (i + 1) * d), at * d);
    });
    tensors.set("card.weight", { data: out, shape: table.shape });
  }
  for (const [name, a] of factors) {
    if (!name.endsWith(".a")) continue;
    const layer = name.slice(0, -2);
    const b = factors.get(`${layer}.b`);
    const w = tensors.get(`${layer}.w`);
    if (!b || !w) throw new Error(`ADAPTER_TENSOR_MISSING: ${layer}`);
    const [inputs, rank] = a.shape as [number, number];
    const outputs = b.shape[1]!;
    if (w.shape[0] !== inputs || w.shape[1] !== outputs || b.shape[0] !== rank)
      throw new Error(`ADAPTER_SHAPE_MISMATCH: ${layer}`);
    const out = new Float32Array(w.data);
    for (let i = 0; i < inputs; i += 1)
      for (let k = 0; k < rank; k += 1) {
        const scale = a.data[i * rank + k]!;
        const row = i * outputs;
        const from = k * outputs;
        for (let j = 0; j < outputs; j += 1)
          out[row + j]! += scale * b.data[from + j]!;
      }
    tensors.set(`${layer}.w`, { data: out, shape: w.shape });
  }
}

/** The pack's model, with `adapter`'s update applied when one is given. */
export function loadCompact(
  pack: CompactPack,
  adapter?: CompactAdapter,
): CompactModel {
  if (pack.version !== 1) throw new Error("COMPACT_PACK_VERSION");
  // Every version since 1 only appends -- zones in 2, zones and global numbers
  // in 3, option numbers in 4, card numbers in 5 -- so an older model reads a
  // newer decision with those dropped (`CompactModel`'s `#known`).
  if (
    !Number.isInteger(pack.compactVersion) ||
    pack.compactVersion < 1 ||
    pack.compactVersion > COMPACT_VERSION
  )
    throw new Error(
      `COMPACT_ENCODING_MISMATCH: the model reads compact version ${pack.compactVersion}, this build writes ${COMPACT_VERSION}`,
    );
  const tensors = decodeTensors(pack.data, pack.tensors);
  if (adapter) {
    if (adapter.version !== 1) throw new Error("COMPACT_ADAPTER_VERSION");
    if (adapter.base !== pack.source)
      throw new Error(
        `ADAPTER_BASE_MISMATCH: the ${adapter.deck.id} adapter was trained over ${adapter.base}, not ${pack.source}`,
      );
    applyAdapter(tensors, adapter, pack.cards);
  }
  return new CompactModel(
    pack.config,
    tensors,
    pack.cards,
    pack.compactVersion === 1 ? V1_ZONES : undefined,
  );
}

export function loadScorer(
  pack: ScorerPack,
  backend?: MatmulBackend,
): { model: ScorerModel; tokenizer: Tokenizer } {
  if (pack.version !== 1) throw new Error("SCORER_PACK_VERSION");
  const tensors = decodeTensors(pack.data, pack.tensors);
  return {
    model: new ScorerModel(pack.config, tensors, pack.cards, backend),
    tokenizer: new Tokenizer(pack.tokenizer),
  };
}
