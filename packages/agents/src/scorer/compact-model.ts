/**
 * The small scorer's forward pass: `CompactScorer` in
 * ml/sys1/compact.py.
 *
 * About 4.5M parameters over ~33 tokens -- one global token, one per visible
 * card, one per offered option (`compact.ts`) -- through four pre-norm
 * transformer layers with no positions, so the order of the cards or options
 * changes nothing. Small enough that plain JavaScript scores a decision in a
 * fraction of a second; `scoreMany` runs a batch of decisions as four stages
 * of stacked work, which `CompactGpu` runs on WebGPU in a few milliseconds.
 *
 * Linear weights arrive transposed to (in, out) as `<name>.w`/`<name>.b`
 * (`sys1/export_compact.py`); embeddings and layer norms keep their names.
 */
import { POOLED_ZONES, type CompactDecision } from "./compact.js";
import { CpuMatmul, type Tensor } from "./model.js";

export interface CompactConfig {
  d: number;
  layers: number;
  heads: number;
  /** Rows in the card table, less the extra row for an unknown card. */
  cards: number;
}

/** Column split of the encoder's rows: indices first, then numbers. */
const CARD_INDEX = 2;
const OPTION_INDEX = 5;
/** An option number that is a card row (a searched card's), not a quantity. */
const OPTION_ROW_COLUMN = 22;
const LAYER_NORM_EPS = 1e-5;

function erf(x: number): number {
  // Abramowitz and Stegun 7.1.26, |error| < 1.5e-7: well inside float16 weights.
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

function geluInPlace(x: Float32Array): Float32Array {
  for (let i = 0; i < x.length; i += 1) {
    const v = x[i]!;
    x[i] = 0.5 * v * (1 + erf(v / Math.SQRT2));
  }
  return x;
}

const halfBuffer = new DataView(new ArrayBuffer(4));

/**
 * `x` rounded to the nearest float16, as the training corpus stored every
 * input number, so the app reads the values training read.
 */
export function roundHalf(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  halfBuffer.setFloat32(0, x);
  const bits = halfBuffer.getUint32(0);
  const sign = bits >>> 31;
  const exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  let mantissa = bits & 0x7fffff;
  if (exponent >= 31) return sign ? -65504 : 65504;
  if (exponent <= 0) {
    // Subnormal half: the value is a multiple of 2^-24.
    const step = 2 ** -24;
    return Math.round(x / step) * step;
  }
  // Round the 23-bit mantissa to 10 bits, half to even.
  const dropped = mantissa & 0x1fff;
  mantissa >>>= 13;
  if (dropped > 0x1000 || (dropped === 0x1000 && mantissa & 1)) mantissa += 1;
  const value = (1 + mantissa / 1024) * 2 ** (exponent - 15);
  return sign ? -value : value;
}

export interface CompactScore {
  probs: number[];
  value: number;
}

/** One step of a row-wise chain: a linear layer by name, or GELU. */
export type CompactOp = { linear: string } | "gelu";

/**
 * Work a forward pass hands its backend: `rows` stacked rows of `x` through a
 * chain of row-wise ops, or the transformer blocks over stacked decisions'
 * tokens, `spans` giving each token its decision's [start, end) rows.
 */
export type CompactRequest =
  | { x: Float32Array; rows: number; ops: CompactOp[] }
  | { blocks: true; x: Float32Array; spans: Int32Array };

/** Runs one stage's requests, returning one output per request, in order. */
export type CompactRunner = (
  stage: CompactRequest[],
) => Float32Array[] | Promise<Float32Array[]>;

const mlpOps = (name: string): CompactOp[] => [
  { linear: `${name}.layers.0` },
  "gelu",
  { linear: `${name}.layers.2` },
];

export class CompactModel {
  readonly config: CompactConfig;
  readonly #tensors: Map<string, Tensor>;
  readonly #rows: Map<string, number>;
  readonly #cpu = new CpuMatmul();

  /** Card tokens in a zone at or past this are dropped before scoring: the
      zones a model trained on an earlier encoding never saw, read off its own
      zone table. */
  readonly #zones: number;

  /** A version-1 model, which wrote "no searched card" as row 0, not -1. */
  readonly #v1: boolean;

  /** Global numbers past this are dropped before scoring: the ones a model
      trained on an earlier encoding never saw, read off its own input layer. */
  readonly #globals: number;

  /** Option numbers past this are dropped before scoring, read off the
      option input layer the same way. */
  readonly #options: number;

  constructor(
    config: CompactConfig,
    tensors: Map<string, Tensor>,
    cards: string[],
    /** Set only for a version-1 model: its 16 zones, and the old "no
        searched card" row. Later versions are read off the tensors. */
    zones?: number,
  ) {
    this.config = config;
    this.#tensors = tensors;
    this.#rows = new Map(cards.map((number, row) => [number, row]));
    this.#zones = zones ?? this.#t("zone.weight").shape[0]!;
    this.#v1 = zones !== undefined;
    this.#globals = this.#t("glob.layers.0.w").shape[0]!;
    this.#options = this.#t("option_num.layers.0.w").shape[0]!;
  }

  /** Card number to its row, as the encoder (`compactDecision`) needs it. */
  get rows(): Map<string, number> {
    return this.#rows;
  }

  /** A weight by name, for a backend that keeps its own copy (`CompactGpu`). */
  tensor(name: string): Tensor {
    return this.#t(name);
  }

  #t(name: string): Tensor {
    const tensor = this.#tensors.get(name);
    if (!tensor) throw new Error(`COMPACT_TENSOR_MISSING: ${name}`);
    return tensor;
  }

  #linear(name: string, x: Float32Array, rows: number): Float32Array {
    return this.#cpu.matmul(
      x,
      rows,
      name,
      this.#t(`${name}.w`),
      this.#t(`${name}.b`).data,
    );
  }

  #layerNorm(name: string, x: Float32Array, rows: number): Float32Array {
    const d = this.config.d;
    const gain = this.#t(`${name}.weight`).data;
    const bias = this.#t(`${name}.bias`).data;
    const out = new Float32Array(x.length);
    for (let r = 0; r < rows; r += 1) {
      const o = r * d;
      let mean = 0;
      for (let i = 0; i < d; i += 1) mean += x[o + i]!;
      mean /= d;
      let variance = 0;
      for (let i = 0; i < d; i += 1) variance += (x[o + i]! - mean) ** 2;
      const scale = 1 / Math.sqrt(variance / d + LAYER_NORM_EPS);
      for (let i = 0; i < d; i += 1)
        out[o + i] = (x[o + i]! - mean) * scale * gain[i]! + bias[i]!;
    }
    return out;
  }

  /** Row `row` of embedding table `name` added into `into` at `offset`. */
  #embed(name: string, row: number, into: Float32Array, offset: number): void {
    const { data, shape } = this.#t(`${name}.weight`);
    const d = shape[1]!;
    for (let i = 0; i < d; i += 1) into[offset + i]! += data[row * d + i]!;
  }

  #cardRow(row: number): number {
    return row < 0 ? this.config.cards : row;
  }

  /** The legal options' probabilities, in the decision's option order, and the value for the seat to move. */
  score(input: CompactDecision): CompactScore {
    const pass = this.#forward([input]);
    let step = pass.next();
    while (!step.done) step = pass.next(this.runOnCpu(step.value));
    return step.value[0]!;
  }

  /**
   * Many decisions at once, every stage's work over all of them in one
   * request: on a GPU (`CompactGpu.run`) a batch costs about what one
   * decision does. Each decision's tokens attend only to its own.
   */
  async scoreMany(
    inputs: readonly CompactDecision[],
    run: CompactRunner,
  ): Promise<CompactScore[]> {
    const pass = this.#forward(inputs);
    let step = pass.next();
    while (!step.done) step = pass.next(await run(step.value));
    return step.value;
  }

  /** A stage's requests on the CPU. */
  runOnCpu(stage: CompactRequest[]): Float32Array[] {
    const d = this.config.d;
    return stage.map((request) => {
      if ("blocks" in request) {
        const { x, spans } = request;
        const out = new Float32Array(x.length);
        for (let t = 0; t < spans.length / 2;) {
          const [start, end] = [spans[t * 2]!, spans[t * 2 + 1]!];
          out.set(
            this.blocks(x.subarray(start * d, end * d), end - start),
            start * d,
          );
          t = end;
        }
        return out;
      }
      let x = request.x;
      for (const op of request.ops)
        x =
          op === "gelu"
            ? geluInPlace(new Float32Array(x))
            : this.#linear(op.linear, x, request.rows);
      return x;
    });
  }

  /**
   * Older models read a newer decision with what they never saw dropped.
   * Each version appends: zones after every earlier token, so dropping them
   * leaves every option's card pointer where it was, (version 3) global
   * numbers after every earlier one, and (version 4) option numbers after
   * every earlier one.
   */
  #known(input: CompactDecision): CompactDecision {
    if (input.global.length > this.#globals)
      input = { ...input, global: input.global.slice(0, this.#globals) };
    const optionRow = OPTION_INDEX + this.#options;
    if (input.options.some((row) => row.length > optionRow))
      input = {
        ...input,
        options: input.options.map((row) => row.slice(0, optionRow)),
      };
    const zones = this.#zones;
    if (input.cards.some((row) => row[1]! >= zones))
      input = { ...input, cards: input.cards.filter((row) => row[1]! < zones) };
    if (!this.#v1) return input;
    return {
      ...input,
      // Before version 2 "no searched card" was row 0, not -1.
      options: input.options.map((row) =>
        row[OPTION_INDEX + OPTION_ROW_COLUMN]! < 0
          ? row.map((v, i) => (i === OPTION_INDEX + OPTION_ROW_COLUMN ? 0 : v))
          : row,
      ),
    };
  }

  /**
   * The forward pass over a batch, as four stages of stacked work -- the
   * input projections, the projections of what they point at, the blocks,
   * the heads -- with the gathers and sums between them done here. A stage
   * is yielded to the runner and its outputs come back in request order.
   */
  *#forward(
    inputs: readonly CompactDecision[],
  ): Generator<CompactRequest[], CompactScore[], Float32Array[]> {
    const d = this.config.d;
    const decisions = inputs.map((input) => this.#known(input));
    const B = decisions.length;
    const cardStart: number[] = [];
    const optionStart: number[] = [];
    let C = 0;
    let K = 0;
    for (const decision of decisions) {
      cardStart.push(C);
      optionStart.push(K);
      C += decision.cards.length;
      K += decision.options.length;
    }

    // 1. The numbers each card, option and position carries, projected.
    const sample = decisions.find((decision) => decision.cards.length > 0);
    const cardWidth = (sample?.cards[0]?.length ?? CARD_INDEX) - CARD_INDEX;
    const optionWidth = decisions[0]!.options[0]!.length - OPTION_INDEX;
    const cardNumbers = new Float32Array(C * cardWidth);
    const optionNumbers = new Float32Array(K * optionWidth);
    const globalWidth = decisions[0]!.global.length;
    const globals = new Float32Array(B * globalWidth);
    decisions.forEach((decision, b) => {
      decision.cards.forEach((row, c) => {
        const o = (cardStart[b]! + c) * cardWidth;
        for (let i = 0; i < cardWidth; i += 1)
          cardNumbers[o + i] = roundHalf(row[CARD_INDEX + i]!);
      });
      decision.options.forEach((row, k) => {
        const o = (optionStart[b]! + k) * optionWidth;
        for (let i = 0; i < optionWidth; i += 1)
          optionNumbers[o + i] =
            i === OPTION_ROW_COLUMN ? 0 : roundHalf(row[OPTION_INDEX + i]!);
      });
      decision.global.forEach((v, i) => {
        globals[b * globalWidth + i] = roundHalf(v);
      });
    });
    const first: CompactRequest[] = [
      { x: optionNumbers, rows: K, ops: mlpOps("option_num") },
      { x: globals, rows: B, ops: mlpOps("glob") },
    ];
    if (C > 0) first.push({ x: cardNumbers, rows: C, ops: mlpOps("card_num") });
    const [options, glob, projected] = yield first;
    const cards = projected ?? new Float32Array(0);
    decisions.forEach((decision, b) => {
      decision.cards.forEach((row, c) => {
        const o = (cardStart[b]! + c) * d;
        this.#embed("card", this.#cardRow(row[0]!), cards, o);
        this.#embed("zone", Math.max(row[1]!, 0), cards, o);
      });
    });

    // 2. What each option points at and names, and each pooled zone's sum.
    // A pointer at nothing projects zeros, which still adds the bias.
    const pointed = (column: number) => {
      const gathered = new Float32Array(K * d);
      decisions.forEach((decision, b) => {
        decision.options.forEach((row, k) => {
          const ptr = row[column]!;
          if (ptr < 0) return;
          const from = (cardStart[b]! + ptr) * d;
          gathered.set(
            cards.subarray(from, from + d),
            (optionStart[b]! + k) * d,
          );
        });
      });
      return gathered;
    };
    const named = (rowOf: (row: number[]) => number) => {
      const table = new Float32Array(K * d);
      decisions.forEach((decision, b) => {
        decision.options.forEach((row, k) => {
          this.#embed(
            "card",
            this.#cardRow(rowOf(row)),
            table,
            (optionStart[b]! + k) * d,
          );
        });
      });
      return table;
    };
    // A pooled zone's cards leave the sequence as one token, their sum
    // projected (sys1/compact.py's `pool`). Nothing points at them: they come
    // after every pointer target.
    const pooled = this.#tensors.has("pool.w");
    const pools: Array<{ decision: number; row: number }> = [];
    const sums: number[] = [];
    decisions.forEach((decision, b) => {
      for (const zone of pooled ? POOLED_ZONES : []) {
        const sum = new Float32Array(d);
        let members = 0;
        decision.cards.forEach((row, c) => {
          if (row[1] !== zone) return;
          members += 1;
          const o = (cardStart[b]! + c) * d;
          for (let i = 0; i < d; i += 1) sum[i]! += cards[o + i]!;
        });
        if (members === 0) continue;
        pools.push({ decision: b, row: pools.length });
        sums.push(...sum);
      }
    });
    const second: CompactRequest[] = [
      { x: pointed(2), rows: K, ops: [{ linear: "ptr1" }] },
      { x: pointed(3), rows: K, ops: [{ linear: "ptr2" }] },
      { x: named((row) => row[4]!), rows: K, ops: [{ linear: "option_card" }] },
      {
        x: named((row) => row[OPTION_INDEX + OPTION_ROW_COLUMN]!),
        rows: K,
        ops: [{ linear: "searched_card" }],
      },
    ];
    if (pools.length > 0)
      second.push({
        x: Float32Array.from(sums),
        rows: pools.length,
        ops: [{ linear: "pool" }],
      });
    const [p1, p2, optionCard, searched, poolOut] = yield second;

    // 3. Each decision's sequence -- its global token, the cards that stay,
    // its pooled tokens, then its options -- stacked, through the blocks.
    const length: number[] = [];
    const before: number[] = [];
    decisions.forEach((decision, b) => {
      const kept = pooled
        ? decision.cards.filter((row) => !POOLED_ZONES.includes(row[1]!)).length
        : decision.cards.length;
      const own = pools.filter((pool) => pool.decision === b).length;
      before.push(1 + kept + own);
      length.push(1 + kept + own + decision.options.length);
    });
    const total = length.reduce((a, b) => a + b, 0);
    const x = new Float32Array(total * d);
    const spans = new Int32Array(total * 2);
    const tokenStart: number[] = [];
    let at = 0;
    decisions.forEach((decision, b) => {
      tokenStart.push(at);
      for (let t = 0; t < length[b]!; t += 1) {
        spans[(at + t) * 2] = at;
        spans[(at + t) * 2 + 1] = at + length[b]!;
      }
      let t = at;
      x.set(glob!.subarray(b * d, b * d + d), t * d);
      t += 1;
      decision.cards.forEach((row, c) => {
        if (pooled && POOLED_ZONES.includes(row[1]!)) return;
        const o = (cardStart[b]! + c) * d;
        x.set(cards.subarray(o, o + d), t * d);
        t += 1;
      });
      for (const pool of pools)
        if (pool.decision === b) {
          x.set(poolOut!.subarray(pool.row * d, pool.row * d + d), t * d);
          t += 1;
        }
      decision.options.forEach((row, k) => {
        const from = (optionStart[b]! + k) * d;
        const to = t * d;
        this.#embed("type", Math.max(row[0]!, 0), x, to);
        this.#embed("kind", Math.max(row[1]!, 0), x, to);
        // A named card's projection counts only where the option names one.
        const hasCard = row[4]! >= 0;
        const hasSearched = row[OPTION_INDEX + OPTION_ROW_COLUMN]! >= 0;
        for (let i = 0; i < d; i += 1)
          x[to + i]! +=
            options![from + i]! +
            p1![from + i]! +
            p2![from + i]! +
            (hasCard ? optionCard![from + i]! : 0) +
            (hasSearched ? searched![from + i]! : 0);
        t += 1;
      });
      at += length[b]!;
    });
    const [encoded] = yield [{ blocks: true, x, spans }];

    // 4. The heads: the options' tokens for the policy, the global token for
    // the value.
    const optionRows = new Float32Array(K * d);
    const globalRows = new Float32Array(B * d);
    decisions.forEach((decision, b) => {
      const s = tokenStart[b]!;
      globalRows.set(encoded!.subarray(s * d, s * d + d), b * d);
      const o = (s + before[b]!) * d;
      optionRows.set(
        encoded!.subarray(o, o + decision.options.length * d),
        optionStart[b]! * d,
      );
    });
    const [logits, values] = yield [
      {
        x: optionRows,
        rows: K,
        ops: [...mlpOps("policy"), { linear: "policy_out" }],
      },
      {
        x: globalRows,
        rows: B,
        ops: [...mlpOps("value"), { linear: "value_out" }],
      },
    ];
    return decisions.map((decision, b) => {
      const own = logits!.subarray(
        optionStart[b],
        optionStart[b]! + decision.options.length,
      );
      let max = -Infinity;
      for (const v of own) if (v > max) max = v;
      const exps = Array.from(own, (v) => Math.exp(v - max));
      const sum = exps.reduce((a, c) => a + c, 0);
      return { probs: exps.map((e) => e / sum), value: Math.tanh(values![b]!) };
    });
  }

  /** The transformer blocks and the final norm over one decision's tokens. */
  blocks(input: Float32Array, T: number): Float32Array {
    const { d, heads, layers } = this.config;
    const x = new Float32Array(input);
    const hd = d / heads;
    const scale = 1 / Math.sqrt(hd);
    for (let l = 0; l < layers; l += 1) {
      const p = `blocks.${l}`;
      const qkv = this.#linear(
        `${p}.qkv`,
        this.#layerNorm(`${p}.norm1`, x, T),
        T,
      );
      // qkv's columns are [q | k | v], each [head][head dim].
      const attended = new Float32Array(T * d);
      const weights = new Float32Array(T);
      for (let h = 0; h < heads; h += 1) {
        const qo = h * hd;
        const ko = d + h * hd;
        const vo = 2 * d + h * hd;
        for (let i = 0; i < T; i += 1) {
          let max = -Infinity;
          for (let j = 0; j < T; j += 1) {
            let dot = 0;
            for (let e = 0; e < hd; e += 1)
              dot += qkv[i * 3 * d + qo + e]! * qkv[j * 3 * d + ko + e]!;
            weights[j] = dot * scale;
            if (weights[j]! > max) max = weights[j]!;
          }
          let sum = 0;
          for (let j = 0; j < T; j += 1) {
            weights[j] = Math.exp(weights[j]! - max);
            sum += weights[j]!;
          }
          for (let j = 0; j < T; j += 1) {
            const w = weights[j]! / sum;
            for (let e = 0; e < hd; e += 1)
              attended[i * d + h * hd + e]! += w * qkv[j * 3 * d + vo + e]!;
          }
        }
      }
      const out = this.#linear(`${p}.out`, attended, T);
      for (let i = 0; i < x.length; i += 1) x[i]! += out[i]!;
      const ff = this.#linear(
        `${p}.ff.layers.2`,
        geluInPlace(
          this.#linear(
            `${p}.ff.layers.0`,
            this.#layerNorm(`${p}.norm2`, x, T),
            T,
          ),
        ),
        T,
      );
      for (let i = 0; i < x.length; i += 1) x[i]! += ff[i]!;
    }
    return this.#layerNorm("norm", x, T);
  }
}
