/**
 * The small scorer on WebGPU, for many decisions at once.
 *
 * `CompactModel.scoreMany` runs its forward pass as four stages of stacked
 * work -- input projections, pointer projections, the transformer blocks, the
 * heads -- and hands each stage here as one request list (`run`): every
 * matrix multiply, layer norm, attention and GELU in it is recorded into one
 * command buffer, with one readback of every output at the end. Attention
 * stays within a decision: each token carries the span of its own decision's
 * tokens. What is left on the CPU is gathers and sums between stages.
 *
 * One decision gains little here -- four round trips cost about what the CPU
 * spends -- but a batch of dozens, which the simulator's concurrent games
 * make, costs barely more than one.
 */
import type { CompactModel, CompactRequest } from "./compact-model.js";
import {
  mapRead,
  type GpuBuffer,
  type GpuCommandEncoder,
  type GpuDevice,
  type GpuPipeline,
} from "./gpu.js";

const STORAGE = 0x80;
const COPY_DST = 0x8;
const COPY_SRC = 0x4;
const UNIFORM = 0x40;
const MAP_READ = 0x1;
/** One workgroup per row in the layer norm, and a dispatch is capped here. */
const MAX_ROWS = 65535;

const HEADER = /* wgsl */ `
struct Dims { m: u32, n: u32, k: u32, a: u32, b: u32, c: u32, f0: f32, f1: f32 };
@group(0) @binding(0) var<uniform> dims: Dims;
`;

// out (m×n) = a (m×k) · w (k×n) + bias, added onto out when dims.a is 1.
const MATMUL = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read> a: array<f32>;
@group(0) @binding(2) var<storage, read> w: array<f32>;
@group(0) @binding(3) var<storage, read> bias: array<f32>;
@group(0) @binding(4) var<storage, read_write> out: array<f32>;
var<workgroup> tileA: array<f32, 256>;
var<workgroup> tileB: array<f32, 256>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
  let row = g.y; let col = g.x;
  var sum = 0.0;
  let tiles = (dims.k + 15u) / 16u;
  for (var t = 0u; t < tiles; t++) {
    let ak = t * 16u + l.x;
    let bk = t * 16u + l.y;
    tileA[l.y * 16u + l.x] = select(0.0, a[row * dims.k + ak], row < dims.m && ak < dims.k);
    tileB[l.y * 16u + l.x] = select(0.0, w[bk * dims.n + col], bk < dims.k && col < dims.n);
    workgroupBarrier();
    for (var i = 0u; i < 16u; i++) { sum += tileA[l.y * 16u + i] * tileB[i * 16u + l.x]; }
    workgroupBarrier();
  }
  if (row < dims.m && col < dims.n) {
    var v = sum + bias[col];
    if (dims.a == 1u) { v += out[row * dims.n + col]; }
    out[row * dims.n + col] = v;
  }
}`;

// One workgroup per row of width dims.n; dims.f0 is epsilon.
const LAYERNORM = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read> x: array<f32>;
@group(0) @binding(2) var<storage, read> gain: array<f32>;
@group(0) @binding(3) var<storage, read> beta: array<f32>;
@group(0) @binding(4) var<storage, read_write> out: array<f32>;
var<workgroup> partial: array<f32, 64>;
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
  let n = dims.n;
  let base = wg.x * n;
  var s = 0.0;
  for (var i = l.x; i < n; i += 64u) { s += x[base + i]; }
  partial[l.x] = s;
  workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride >>= 1u) {
    if (l.x < stride) { partial[l.x] += partial[l.x + stride]; }
    workgroupBarrier();
  }
  let mean = partial[0] / f32(n);
  workgroupBarrier();
  var v = 0.0;
  for (var i = l.x; i < n; i += 64u) { let e = x[base + i] - mean; v += e * e; }
  partial[l.x] = v;
  workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride >>= 1u) {
    if (l.x < stride) { partial[l.x] += partial[l.x + stride]; }
    workgroupBarrier();
  }
  let scale = inverseSqrt(partial[0] / f32(n) + dims.f0);
  for (var i = l.x; i < n; i += 64u) { out[base + i] = (x[base + i] - mean) * scale * gain[i] + beta[i]; }
}`;

// Exact GELU through Abramowitz & Stegun 7.1.26, as compact-model.ts computes it.
const GELU = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read_write> x: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x + g.y * 65535u * 64u;
  if (i >= dims.m) { return; }
  let v = x[i];
  let z = v / 1.4142135;
  let t = 1.0 / (1.0 + 0.3275911 * abs(z));
  let y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-z * z);
  x[i] = 0.5 * v * (1.0 + sign(z) * y);
}`;

// One thread per (token, head), over the keys of its own decision; qkv's
// columns are [q | k | v], each [head][head dim]. dims: m tokens, n width,
// a heads, b head dim (at most 64), f0 the score scale.
const ATTENTION = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read> qkv: array<f32>;
@group(0) @binding(2) var<storage, read> spans: array<i32>;
@group(0) @binding(3) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let heads = dims.a; let hd = dims.b; let d = dims.n;
  let idx = g.x + g.y * 65535u * 64u;
  if (idx >= dims.m * heads) { return; }
  let t = idx / heads; let h = idx % heads;
  let start = u32(spans[t * 2u]); let end = u32(spans[t * 2u + 1u]);
  var acc: array<f32, 64>;
  for (var e = 0u; e < hd; e++) { acc[e] = 0.0; }
  var top = -3.0e38; var sum = 0.0;
  let qo = t * 3u * d + h * hd;
  for (var j = start; j < end; j++) {
    let ko = j * 3u * d + d + h * hd;
    var dot = 0.0;
    for (var e = 0u; e < hd; e++) { dot += qkv[qo + e] * qkv[ko + e]; }
    dot *= dims.f0;
    let next = max(top, dot);
    let carry = exp(top - next);
    let p = exp(dot - next);
    sum = sum * carry + p;
    let vo = j * 3u * d + 2u * d + h * hd;
    for (var e = 0u; e < hd; e++) { acc[e] = acc[e] * carry + p * qkv[vo + e]; }
    top = next;
  }
  for (var e = 0u; e < hd; e++) { out[t * d + h * hd + e] = acc[e] / sum; }
}`;

interface Scratch {
  rows: number;
  x: GpuBuffer;
  h: GpuBuffer;
  qkv: GpuBuffer;
  att: GpuBuffer;
  ff: GpuBuffer;
  spans: GpuBuffer;
}

export class CompactGpu {
  readonly #device: GpuDevice;
  readonly #model: CompactModel;
  readonly #weights = new Map<string, GpuBuffer>();
  readonly #pipelines: Record<string, GpuPipeline> = {};
  #scratch: Scratch | undefined;
  /** One pass at a time: they share the scratch buffers and the readback. */
  #last: Promise<unknown> = Promise.resolve();

  constructor(device: GpuDevice, model: CompactModel) {
    this.#device = device;
    this.#model = model;
    if (model.config.d / model.config.heads > 64)
      throw new Error("COMPACT_GPU_HEAD_TOO_WIDE");
    for (const [name, code] of Object.entries({
      matmul: MATMUL,
      layernorm: LAYERNORM,
      gelu: GELU,
      attention: ATTENTION,
    })) {
      this.#pipelines[name] = device.createComputePipeline({
        layout: "auto",
        compute: {
          module: device.createShaderModule({ code }),
          entryPoint: "main",
        },
      });
    }
  }

  #buffer(size: number, usage = STORAGE | COPY_DST | COPY_SRC): GpuBuffer {
    return this.#device.createBuffer({ size: Math.max(16, size), usage });
  }

  #weight(name: string): GpuBuffer {
    let buffer = this.#weights.get(name);
    if (!buffer) {
      const data = this.#model.tensor(name).data;
      buffer = this.#buffer(data.byteLength);
      this.#device.queue.writeBuffer(buffer, 0, data);
      this.#weights.set(name, buffer);
    }
    return buffer;
  }

  #scratchFor(rows: number): Scratch {
    if (this.#scratch && this.#scratch.rows >= rows) return this.#scratch;
    const old = this.#scratch;
    if (old)
      for (const buffer of [old.x, old.h, old.qkv, old.att, old.ff, old.spans])
        buffer.destroy();
    // Room to grow, so a slightly larger batch does not reallocate.
    const capacity = Math.max(256, Math.ceil(rows * 1.5));
    const d = this.#model.config.d;
    const bytes = (width: number) => capacity * width * 4;
    this.#scratch = {
      rows: capacity,
      x: this.#buffer(bytes(d)),
      h: this.#buffer(bytes(d)),
      qkv: this.#buffer(bytes(3 * d)),
      att: this.#buffer(bytes(d)),
      ff: this.#buffer(bytes(4 * d)),
      spans: this.#buffer(bytes(2)),
    };
    return this.#scratch;
  }

  /** One stage of `CompactModel.scoreMany`'s work, outputs in request order. */
  run(stage: CompactRequest[]): Promise<Float32Array[]> {
    const run = this.#last.then(() => this.#run(stage));
    this.#last = run.catch(() => undefined);
    return run;
  }

  async #run(stage: CompactRequest[]): Promise<Float32Array[]> {
    const device = this.#device;
    const encoder: GpuCommandEncoder = device.createCommandEncoder();
    const uniforms: GpuBuffer[] = [];
    const transient: GpuBuffer[] = [];
    const dispatch = (
      kernel: string,
      buffers: GpuBuffer[],
      dims: number[],
      floats: number[],
      groups: [number, number?],
    ) => {
      const uniform = device.createBuffer({
        size: 32,
        usage: UNIFORM | COPY_DST,
      });
      const data = new ArrayBuffer(32);
      new Uint32Array(data, 0, 6).set([...dims, 0, 0, 0, 0, 0, 0].slice(0, 6));
      new Float32Array(data, 24, 2).set(floats);
      device.queue.writeBuffer(uniform, 0, new Uint8Array(data));
      uniforms.push(uniform);
      const pipeline = this.#pipelines[kernel]!;
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [uniform, ...buffers].map((buffer, binding) => ({
            binding,
            resource: { buffer },
          })),
        }),
      );
      pass.dispatchWorkgroups(groups[0], groups[1] ?? 1);
      pass.end();
    };
    // A 1-D dispatch of `count` threads in workgroups of 64, folded into a
    // second dimension past the per-dimension limit.
    const flat = (count: number): [number, number] => {
      const groups = Math.ceil(count / 64);
      return groups <= 65535 ? [groups, 1] : [65535, Math.ceil(groups / 65535)];
    };
    const linear = (
      from: GpuBuffer,
      rows: number,
      name: string,
      to: GpuBuffer,
      accumulate = false,
    ) => {
      const [k, n] = this.#model.tensor(`${name}.w`).shape as [number, number];
      dispatch(
        "matmul",
        [from, this.#weight(`${name}.w`), this.#weight(`${name}.b`), to],
        [rows, n, k, accumulate ? 1 : 0],
        [0, 0],
        [Math.ceil(n / 16), Math.ceil(rows / 16)],
      );
      return n;
    };
    const outputs: Array<{ buffer: GpuBuffer; floats: number }> = [];
    for (const request of stage) {
      if ("blocks" in request) {
        outputs.push(
          this.#recordBlocks(request.x, request.spans, dispatch, flat, linear),
        );
        continue;
      }
      const { rows } = request;
      if (rows > MAX_ROWS) throw new Error("COMPACT_GPU_BATCH_TOO_LARGE");
      let current = this.#buffer(request.x.byteLength);
      transient.push(current);
      device.queue.writeBuffer(current, 0, request.x);
      let width = request.x.length / Math.max(rows, 1);
      for (const op of request.ops) {
        if (op === "gelu") {
          dispatch(
            "gelu",
            [current],
            [rows * width],
            [0, 0],
            flat(rows * width),
          );
          continue;
        }
        const n = this.#model.tensor(`${op.linear}.w`).shape[1]!;
        const next = this.#buffer(rows * n * 4);
        transient.push(next);
        width = linear(current, rows, op.linear, next);
        current = next;
      }
      outputs.push({ buffer: current, floats: rows * width });
    }
    const total = outputs.reduce((sum, o) => sum + o.floats, 0);
    const read = this.#buffer(total * 4, MAP_READ | COPY_DST);
    let offset = 0;
    for (const o of outputs) {
      encoder.copyBufferToBuffer(o.buffer, 0, read, offset * 4, o.floats * 4);
      offset += o.floats;
    }
    device.queue.submit([encoder.finish()]);
    await mapRead(device, read);
    const all = new Float32Array(read.getMappedRange().slice(0, total * 4));
    read.unmap();
    for (const buffer of [...uniforms, ...transient, read]) buffer.destroy();
    offset = 0;
    return outputs.map((o) => {
      const out = all.subarray(offset, offset + o.floats);
      offset += o.floats;
      return out;
    });
  }

  /** The blocks and the final norm over stacked tokens, into the scratch buffers. */
  #recordBlocks(
    input: Float32Array,
    spans: Int32Array,
    dispatch: (
      kernel: string,
      buffers: GpuBuffer[],
      dims: number[],
      floats: number[],
      groups: [number, number?],
    ) => void,
    flat: (count: number) => [number, number],
    linear: (
      from: GpuBuffer,
      rows: number,
      name: string,
      to: GpuBuffer,
      accumulate?: boolean,
    ) => number,
  ): { buffer: GpuBuffer; floats: number } {
    const { d, heads, layers } = this.#model.config;
    const M = spans.length / 2;
    if (M > MAX_ROWS) throw new Error("COMPACT_GPU_BATCH_TOO_LARGE");
    const s = this.#scratchFor(M);
    this.#device.queue.writeBuffer(s.x, 0, input);
    this.#device.queue.writeBuffer(s.spans, 0, spans);
    const norm = (from: GpuBuffer, name: string, to: GpuBuffer) => {
      dispatch(
        "layernorm",
        [
          from,
          this.#weight(`${name}.weight`),
          this.#weight(`${name}.bias`),
          to,
        ],
        [M, d],
        [1e-5, 0],
        [M],
      );
    };
    const hd = d / heads;
    for (let l = 0; l < layers; l += 1) {
      const p = `blocks.${l}`;
      norm(s.x, `${p}.norm1`, s.h);
      linear(s.h, M, `${p}.qkv`, s.qkv);
      dispatch(
        "attention",
        [s.qkv, s.spans, s.att],
        [M, d, 0, heads, hd],
        [1 / Math.sqrt(hd), 0],
        flat(M * heads),
      );
      linear(s.att, M, `${p}.out`, s.x, true);
      norm(s.x, `${p}.norm2`, s.h);
      linear(s.h, M, `${p}.ff.layers.0`, s.ff);
      dispatch("gelu", [s.ff], [M * 4 * d], [0, 0], flat(M * 4 * d));
      linear(s.ff, M, `${p}.ff.layers.2`, s.x, true);
    }
    norm(s.x, "norm", s.h);
    return { buffer: s.h, floats: M * d };
  }
}
