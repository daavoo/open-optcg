/**
 * The System-1 scorer's forward pass, in plain TypeScript.
 *
 * A ModernBERT-style encoder (research/system1/sys1/model.py) reads one packed
 * decision -- `[CLS] state [SEP]` then each legal action's tokens -- and
 * returns a probability per action and a value for the seat to move. Written
 * out rather than run on a tensor library so the single-file app needs no
 * runtime: the model is a handful of matrix multiplies, layer norms and one
 * masked attention per layer.
 *
 * Two structural facts keep it cheap. Each action's tokens attend only to the
 * state and to themselves, and the state attends only to itself, so the state
 * is encoded once however many actions there are; and attention visits only
 * the keys a query may see, rather than masking a full square.
 *
 * Matrix multiplies go through `MatmulBackend`, so a GPU implementation can
 * replace the CPU loop without touching the rest.
 */

export interface ScorerConfig {
  hidden: number;
  layers: number;
  heads: number;
  intermediate: number;
  globalEvery: number;
  window: number;
  ropeTheta: number;
  normEps: number;
  cls: number;
  sep: number;
  cardSlot: number;
  /** The render version the model was trained on (`RENDER_VERSION`); 1 if absent. */
  render?: number;
}

export interface Tensor {
  data: Float32Array;
  shape: number[];
}

export interface MatmulBackend {
  /** out (M×N) = a (M×K) · w (K×N) [+ bias]. `w` is identified by `key`. */
  matmul(
    a: Float32Array,
    m: number,
    key: string,
    w: Tensor,
    bias?: Float32Array,
  ): Float32Array | Promise<Float32Array>;
}

export class CpuMatmul implements MatmulBackend {
  matmul(
    a: Float32Array,
    m: number,
    _key: string,
    w: Tensor,
    bias?: Float32Array,
  ): Float32Array {
    const [k, n] = w.shape as [number, number];
    const b = w.data;
    const out = new Float32Array(m * n);
    for (let i = 0; i < m; i += 1) {
      const row = i * n;
      if (bias) out.set(bias, row);
      const ao = i * k;
      for (let p = 0; p < k; p += 1) {
        const av = a[ao + p]!;
        if (av === 0) continue;
        const bo = p * n;
        for (let j = 0; j < n; j += 1) out[row + j]! += av * b[bo + j]!;
      }
    }
    return out;
  }
}

/** A packed decision, as `data.collate` builds it on the Python side. */
export interface PackedDecision {
  ids: Int32Array;
  positions: Int32Array;
  /** 0 for state tokens, k + 1 for action k's tokens. */
  segments: Int32Array;
  /** Card-table row for each card-slot token, -1 elsewhere. */
  cardRows: Int32Array;
  stateLength: number;
  /** [start, end) token range per action. */
  actions: Array<[number, number]>;
}

// Abramowitz & Stegun 7.1.26: |error| < 1.5e-7, well inside what an exact-
// GELU checkpoint can tell apart.
function erf(x: number): number {
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

function gelu(x: number): number {
  return 0.5 * x * (1 + erf(x / Math.SQRT2));
}

function layerNorm(
  x: Float32Array,
  rows: number,
  width: number,
  weight: Float32Array,
  eps: number,
): Float32Array {
  const out = new Float32Array(x.length);
  for (let r = 0; r < rows; r += 1) {
    const o = r * width;
    let mean = 0;
    for (let j = 0; j < width; j += 1) mean += x[o + j]!;
    mean /= width;
    let variance = 0;
    for (let j = 0; j < width; j += 1) {
      const d = x[o + j]! - mean;
      variance += d * d;
    }
    const inv = 1 / Math.sqrt(variance / width + eps);
    for (let j = 0; j < width; j += 1)
      out[o + j] = (x[o + j]! - mean) * inv * weight[j]!;
  }
  return out;
}

export class ScorerModel {
  readonly config: ScorerConfig;
  readonly #tensors: Map<string, Tensor>;
  readonly #backend: MatmulBackend;
  readonly #cardRows: Map<string, number>;
  #gpu:
    | { encode(d: PackedDecision, x: Float32Array): Promise<Float32Array> }
    | undefined;

  constructor(
    config: ScorerConfig,
    tensors: Map<string, Tensor>,
    cards: readonly string[],
    backend: MatmulBackend = new CpuMatmul(),
  ) {
    this.config = config;
    this.#tensors = tensors;
    this.#backend = backend;
    this.#cardRows = new Map(cards.map((card, row) => [card, row]));
  }

  /** Run the encoder on a GPU backend from now on (see `gpu.ts`). */
  useGpu(encoder: {
    encode(d: PackedDecision, x: Float32Array): Promise<Float32Array>;
  }): void {
    this.#gpu = encoder;
  }

  cardRow(cardNumber: string): number {
    return this.#cardRows.get(cardNumber) ?? -1;
  }

  /** A weight by name, for a backend that uploads the model elsewhere. */
  tensor(name: string): Tensor {
    return this.#t(name);
  }

  #t(name: string): Tensor {
    const tensor = this.#tensors.get(name);
    if (!tensor) throw new Error(`SCORER_TENSOR_MISSING: ${name}`);
    return tensor;
  }

  async #linear(
    x: Float32Array,
    rows: number,
    name: string,
    withBias = false,
  ): Promise<Float32Array> {
    return this.#backend.matmul(
      x,
      rows,
      name,
      this.#t(`${name}.w`),
      withBias ? this.#t(`${name}.b`).data : undefined,
    );
  }

  /** Probabilities over the decision's actions, and the value in [-1, 1]. */
  async score(
    decision: PackedDecision,
  ): Promise<{ probs: number[]; value: number }> {
    const c = this.config;
    const H = c.hidden;
    const T = decision.ids.length;
    const D = H / c.heads;

    const embed = this.#t("embed");
    const cards = this.#t("cards");
    let x: Float32Array = new Float32Array(T * H);
    for (let t = 0; t < T; t += 1) {
      const row = decision.cardRows[t]!;
      const source =
        row >= 0
          ? cards.data.subarray(row * H, row * H + H)
          : embed.data.subarray(decision.ids[t]! * H, decision.ids[t]! * H + H);
      x.set(source, t * H);
    }
    if (this.#gpu) {
      return this.#heads(await this.#gpu.encode(decision, x), decision);
    }
    x = layerNorm(x, T, H, this.#t("embed_norm").data, c.normEps);

    // RoPE tables for each token's own position.
    const half = D / 2;
    const cos = new Float32Array(T * half);
    const sin = new Float32Array(T * half);
    for (let t = 0; t < T; t += 1) {
      for (let i = 0; i < half; i += 1) {
        const angle =
          decision.positions[t]! / Math.pow(c.ropeTheta, (2 * i) / D);
        cos[t * half + i] = Math.cos(angle);
        sin[t * half + i] = Math.sin(angle);
      }
    }

    // Which keys each token may see: the state for everyone, plus its own
    // action's tokens for an action token.
    const S = decision.stateLength;
    const ownRange = (t: number): [number, number] => {
      const segment = decision.segments[t]!;
      return segment === 0 ? [0, 0] : decision.actions[segment - 1]!;
    };

    const scores = new Float32Array(T);
    for (let layer = 0; layer < c.layers; layer += 1) {
      const p = `layers.${layer}`;
      const isGlobal = layer % c.globalEvery === 0;
      const h =
        layer === 0
          ? x
          : layerNorm(x, T, H, this.#t(`${p}.attn_norm`).data, c.normEps);
      const qkv = await this.#linear(h, T, `${p}.wqkv`);
      // Rotate q and k in place.
      for (let t = 0; t < T; t += 1) {
        for (const part of [0, 1]) {
          for (let head = 0; head < c.heads; head += 1) {
            const o = t * 3 * H + part * H + head * D;
            for (let i = 0; i < half; i += 1) {
              const a = qkv[o + i]!;
              const b = qkv[o + i + half]!;
              const cs = cos[t * half + i]!;
              const sn = sin[t * half + i]!;
              qkv[o + i] = a * cs - b * sn;
              qkv[o + i + half] = b * cs + a * sn;
            }
          }
        }
      }
      const attended = new Float32Array(T * H);
      const scale = 1 / Math.sqrt(D);
      // Keys laid out per head, contiguous per token, for the dot products.
      const keysByHead = new Float32Array(c.heads * T * D);
      const valuesByHead = new Float32Array(c.heads * T * D);
      for (let t = 0; t < T; t += 1) {
        for (let head = 0; head < c.heads; head += 1) {
          const source = t * 3 * H + head * D;
          const target = (head * T + t) * D;
          for (let d = 0; d < D; d += 1) {
            keysByHead[target + d] = qkv[source + H + d]!;
            valuesByHead[target + d] = qkv[source + 2 * H + d]!;
          }
        }
      }
      const visible = new Int32Array(T);
      for (let t = 0; t < T; t += 1) {
        // The keys this query may see: the state, then its own action's
        // tokens, less anything outside the window on a local layer.
        const [ownStart, ownEnd] = ownRange(t);
        const pos = decision.positions[t]!;
        let count = 0;
        for (let key = 0; key < S; key += 1)
          if (isGlobal || Math.abs(decision.positions[key]! - pos) <= c.window)
            visible[count++] = key;
        for (let key = ownStart; key < ownEnd; key += 1)
          if (isGlobal || Math.abs(decision.positions[key]! - pos) <= c.window)
            visible[count++] = key;
        for (let head = 0; head < c.heads; head += 1) {
          const qo = t * 3 * H + head * D;
          const base = head * T * D;
          let max = -Infinity;
          for (let i = 0; i < count; i += 1) {
            const ko = base + visible[i]! * D;
            let dot = 0;
            for (let d = 0; d < D; d += 1)
              dot += qkv[qo + d]! * keysByHead[ko + d]!;
            dot *= scale;
            scores[i] = dot;
            if (dot > max) max = dot;
          }
          let total = 0;
          for (let i = 0; i < count; i += 1) {
            const e = Math.exp(scores[i]! - max);
            scores[i] = e;
            total += e;
          }
          const out = t * H + head * D;
          for (let i = 0; i < count; i += 1) {
            const weight = scores[i]! / total;
            const vo = base + visible[i]! * D;
            for (let d = 0; d < D; d += 1)
              attended[out + d]! += weight * valuesByHead[vo + d]!;
          }
        }
      }
      const projected = await this.#linear(attended, T, `${p}.wo`);
      for (let i = 0; i < x.length; i += 1) x[i]! += projected[i]!;

      const m = layerNorm(x, T, H, this.#t(`${p}.mlp_norm`).data, c.normEps);
      const wi = await this.#linear(m, T, `${p}.wi`);
      const I = c.intermediate;
      const gated = new Float32Array(T * I);
      for (let t = 0; t < T; t += 1) {
        for (let j = 0; j < I; j += 1) {
          gated[t * I + j] = gelu(wi[t * 2 * I + j]!) * wi[t * 2 * I + I + j]!;
        }
      }
      const down = await this.#linear(gated, T, `${p}.wo2`);
      for (let i = 0; i < x.length; i += 1) x[i]! += down[i]!;
    }
    x = layerNorm(x, T, H, this.#t("final_norm").data, c.normEps);
    return this.#heads(x, decision);
  }

  /** The pooled policy and value heads over the final hidden states. */
  async #heads(
    x: Float32Array,
    decision: PackedDecision,
  ): Promise<{ probs: number[]; value: number }> {
    const H = this.config.hidden;
    const S = decision.stateLength;
    const pool = (start: number, end: number) => {
      const out = new Float32Array(H);
      for (let t = start; t < end; t += 1)
        for (let j = 0; j < H; j += 1) out[j]! += x[t * H + j]!;
      for (let j = 0; j < H; j += 1) out[j]! /= end - start;
      return out;
    };
    const head = async (input: Float32Array, rows: number, name: string) => {
      const hidden = await this.#linear(input, rows, `${name}.0`, true);
      for (let i = 0; i < hidden.length; i += 1) hidden[i] = gelu(hidden[i]!);
      return this.#linear(hidden, rows, `${name}.2`, true);
    };

    const K = decision.actions.length;
    const options = new Float32Array(K * H);
    decision.actions.forEach(([start, end], k) => {
      options.set(pool(start, end), k * H);
    });
    const logits = await head(options, K, "policy");
    const max = Math.max(...logits);
    const exps = Array.from(logits, (logit) => Math.exp(logit - max));
    const total = exps.reduce((sum, e) => sum + e, 0);
    const value = await head(pool(0, S), 1, "value");
    return { probs: exps.map((e) => e / total), value: Math.tanh(value[0]!) };
  }
}
