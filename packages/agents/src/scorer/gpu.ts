/**
 * The scorer's encoder on WebGPU.
 *
 * The same forward pass as `ScorerModel.score`, with every per-token step --
 * matrix multiplies, layer norms, rotary positions, masked attention, the
 * gated MLP -- recorded into one command buffer, and one readback of the final
 * hidden states per decision. The pooling and the two small output heads stay
 * on the CPU, where they cost microseconds. On the CPU the whole pass takes
 * seconds a decision, nearly all of it matrix multiplies; here it takes
 * milliseconds.
 *
 * Only the handful of WebGPU calls used here are declared, so the package
 * needs no WebGPU type dependency.
 */
import type { PackedDecision, ScorerModel } from "./model.js";

export interface GpuBuffer {
  destroy(): void;
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}
export interface GpuPipeline {
  getBindGroupLayout(index: number): unknown;
}
export interface GpuPass {
  setPipeline(pipeline: GpuPipeline): void;
  setBindGroup(index: number, group: unknown): void;
  dispatchWorkgroups(x: number, y?: number): void;
  end(): void;
}
export interface GpuCommandEncoder {
  beginComputePass(): GpuPass;
  copyBufferToBuffer(
    source: GpuBuffer,
    sourceOffset: number,
    target: GpuBuffer,
    targetOffset: number,
    size: number,
  ): void;
  finish(): unknown;
}
export interface GpuDevice {
  createBuffer(descriptor: {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
  }): GpuBuffer;
  createShaderModule(descriptor: { code: string }): unknown;
  createComputePipeline(descriptor: {
    layout: "auto";
    compute: { module: unknown; entryPoint: string };
  }): GpuPipeline;
  createBindGroup(descriptor: {
    layout: unknown;
    entries: Array<{ binding: number; resource: { buffer: GpuBuffer } }>;
  }): unknown;
  createCommandEncoder(): GpuCommandEncoder;
  queue: {
    writeBuffer(buffer: GpuBuffer, offset: number, data: ArrayBufferView): void;
    submit(commands: unknown[]): void;
  };
}

interface Scratch {
  x: GpuBuffer;
  h: GpuBuffer;
  qkv: GpuBuffer;
  att: GpuBuffer;
  proj: GpuBuffer;
  wi: GpuBuffer;
  gated: GpuBuffer;
  positions: GpuBuffer;
  segments: GpuBuffer;
  read: GpuBuffer;
}

const STORAGE = 0x80;
const COPY_DST = 0x8;
const COPY_SRC = 0x4;
const UNIFORM = 0x40;
const MAP_READ = 0x1;

const MAX_TOKENS = 2048;

const HEADER = /* wgsl */ `
struct Dims { m: u32, n: u32, k: u32, a: u32, b: u32, c: u32, f0: f32, f1: f32 };
@group(0) @binding(0) var<uniform> dims: Dims;
`;

const MATMUL = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read> a: array<f32>;
@group(0) @binding(2) var<storage, read> w: array<f32>;
@group(0) @binding(3) var<storage, read_write> out: array<f32>;
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
  if (row < dims.m && col < dims.n) { out[row * dims.n + col] = sum; }
}`;

// dims.m rows of width dims.n; dims.a = 1 adds the result onto \`out\` instead.
const LAYERNORM = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read> x: array<f32>;
@group(0) @binding(2) var<storage, read> weight: array<f32>;
@group(0) @binding(3) var<storage, read_write> out: array<f32>;
var<workgroup> partial: array<f32, 64>;
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
  let row = wg.x; let width = dims.n; let base = row * width;
  var s = 0.0;
  for (var j = l.x; j < width; j += 64u) { s += x[base + j]; }
  partial[l.x] = s; workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride >>= 1u) {
    if (l.x < stride) { partial[l.x] += partial[l.x + stride]; }
    workgroupBarrier();
  }
  let mean = partial[0] / f32(width); workgroupBarrier();
  var v = 0.0;
  for (var j = l.x; j < width; j += 64u) { let d = x[base + j] - mean; v += d * d; }
  partial[l.x] = v; workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride >>= 1u) {
    if (l.x < stride) { partial[l.x] += partial[l.x + stride]; }
    workgroupBarrier();
  }
  let inv = 1.0 / sqrt(partial[0] / f32(width) + dims.f0);
  for (var j = l.x; j < width; j += 64u) { out[base + j] = (x[base + j] - mean) * inv * weight[j]; }
}`;

// Rotary positions on the q and k thirds of qkv, in place. dims: m tokens,
// n = hidden, a = heads, b = head dim, f0 = theta.
const ROPE = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read> positions: array<i32>;
@group(0) @binding(2) var<storage, read_write> qkv: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let half = dims.b / 2u;
  let per_token = 2u * dims.a * half;
  let index = g.x;
  if (index >= dims.m * per_token) { return; }
  let t = index / per_token;
  let rest = index % per_token;
  let part = rest / (dims.a * half);
  let head = (rest / half) % dims.a;
  let i = rest % half;
  let angle = f32(positions[t]) / pow(dims.f0, f32(2u * i) / f32(dims.b));
  let o = t * 3u * dims.n + part * dims.n + head * dims.b;
  let x1 = qkv[o + i]; let x2 = qkv[o + i + half];
  qkv[o + i] = x1 * cos(angle) - x2 * sin(angle);
  qkv[o + i + half] = x2 * cos(angle) + x1 * sin(angle);
}`;

// One invocation per (token, head): an online softmax over the keys this
// token may see. dims: m tokens, n hidden, a heads, b head dim (<= 64),
// c = 1 on a global layer, f0 = window, f1 = scale.
const ATTENTION = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read> qkv: array<f32>;
@group(0) @binding(2) var<storage, read> positions: array<i32>;
@group(0) @binding(3) var<storage, read> segments: array<i32>;
@group(0) @binding(4) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let index = g.x;
  if (index >= dims.m * dims.a) { return; }
  let t = index / dims.a; let head = index % dims.a;
  let D = dims.b; let H = dims.n;
  let qo = t * 3u * H + head * D;
  let seg = segments[t]; let pos = positions[t];
  var acc: array<f32, 64>;
  for (var d = 0u; d < 64u; d++) { acc[d] = 0.0; }
  var maxv = -1e30; var total = 0.0;
  for (var j = 0u; j < dims.m; j++) {
    let sj = segments[j];
    if (!(sj == seg || (sj == 0 && seg > 0))) { continue; }
    if (dims.c == 0u && f32(abs(positions[j] - pos)) > dims.f0) { continue; }
    let ko = j * 3u * H + H + head * D;
    var dot = 0.0;
    for (var d = 0u; d < D; d++) { dot += qkv[qo + d] * qkv[ko + d]; }
    dot *= dims.f1;
    let newmax = max(maxv, dot);
    let correction = exp(maxv - newmax);
    let e = exp(dot - newmax);
    total = total * correction + e;
    let vo = j * 3u * H + 2u * H + head * D;
    for (var d = 0u; d < D; d++) { acc[d] = acc[d] * correction + e * qkv[vo + d]; }
    maxv = newmax;
  }
  let o = t * H + head * D;
  for (var d = 0u; d < D; d++) { out[o + d] = acc[d] / total; }
}`;

const ADD = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read> y: array<f32>;
@group(0) @binding(2) var<storage, read_write> x: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x < dims.m) { x[g.x] += y[g.x]; }
}`;

// out[t, j] = gelu(wi[t, j]) * wi[t, I + j]; dims: m tokens, n = I.
const GATE = /* wgsl */ `${HEADER}
@group(0) @binding(1) var<storage, read> wi: array<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;
fn erf(x: f32) -> f32 {
  let s = sign(x); let t = 1.0 / (1.0 + 0.3275911 * abs(x));
  let y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return s * y;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= dims.m * dims.n) { return; }
  let t = g.x / dims.n; let j = g.x % dims.n;
  let v = wi[t * 2u * dims.n + j];
  out[g.x] = 0.5 * v * (1.0 + erf(v / 1.4142135)) * wi[t * 2u * dims.n + dims.n + j];
}`;

interface GpuAdapter {
  requestDevice(): Promise<GpuDevice>;
  /** Where the spec first put it, and where an older browser reports it. */
  isFallbackAdapter?: boolean;
  info?: { isFallbackAdapter?: boolean };
}

interface Gpu {
  requestAdapter(options?: {
    powerPreference?: "low-power" | "high-performance";
  }): Promise<GpuAdapter | null>;
}

/**
 * `buffer.mapAsync(MAP_READ)`, with the queue kept moving until it resolves.
 * Firefox settles a pending map only when it next polls the device, which it
 * does on a submit or else on a timer of about 100 ms -- so a readback that
 * Chrome returns in a millisecond takes a tenth of a second there, and a
 * simulator run pays it four times a batch. An empty submit every
 * millisecond makes Firefox poll, and costs other browsers nothing. Remove
 * once Firefox resolves a map when the GPU finishes the work.
 */
export async function mapRead(
  device: GpuDevice,
  buffer: GpuBuffer,
): Promise<void> {
  let pending = true;
  const nudge = () => {
    if (!pending) return;
    device.queue.submit([]);
    setTimeout(nudge, 1);
  };
  setTimeout(nudge, 1);
  try {
    await buffer.mapAsync(MAP_READ);
  } finally {
    pending = false;
  }
}

/**
 * A WebGPU device, or null where the platform has none.
 *
 * A fallback adapter counts as none. It is the browser's software renderer
 * (Chrome's SwiftShader, offered when hardware acceleration is off or the GPU
 * is blocklisted), which runs the shaders on the CPU: every simulator worker
 * would then share the CPU through it, and a run is far slower than the same
 * workers scoring with `CompactModel.score` directly. The high-performance preference picks the
 * discrete GPU on a machine with two.
 */
export async function requestGpuDevice(): Promise<GpuDevice | null> {
  const gpu = (globalThis.navigator as { gpu?: Gpu } | undefined)?.gpu;
  if (!gpu) return null;
  try {
    const adapter = await gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter || isFallback(adapter)) return null;
    return await adapter.requestDevice();
  } catch {
    return null;
  }
}

function isFallback(adapter: GpuAdapter): boolean {
  return (
    (adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter) === true
  );
}

export class GpuEncoder {
  readonly #device: GpuDevice;
  readonly #model: ScorerModel;
  readonly #weights = new Map<string, GpuBuffer>();
  readonly #pipelines: Record<string, GpuPipeline> = {};
  readonly #scratch: Scratch;

  constructor(device: GpuDevice, model: ScorerModel) {
    this.#device = device;
    this.#model = model;
    const c = model.config;
    for (const [name, code] of Object.entries({
      matmul: MATMUL,
      layernorm: LAYERNORM,
      rope: ROPE,
      attention: ATTENTION,
      add: ADD,
      gate: GATE,
    })) {
      this.#pipelines[name] = device.createComputePipeline({
        layout: "auto",
        compute: {
          module: device.createShaderModule({ code }),
          entryPoint: "main",
        },
      });
    }
    const H = c.hidden;
    const rows = (width: number) => this.#buffer(MAX_TOKENS * width * 4);
    this.#scratch = {
      x: rows(H),
      h: rows(H),
      qkv: rows(3 * H),
      att: rows(H),
      proj: rows(H),
      wi: rows(2 * c.intermediate),
      gated: rows(c.intermediate),
      positions: rows(1),
      segments: rows(1),
      read: device.createBuffer({
        size: MAX_TOKENS * H * 4,
        usage: MAP_READ | COPY_DST,
      }),
    };
  }

  #buffer(size: number): GpuBuffer {
    return this.#device.createBuffer({
      size: Math.max(16, size),
      usage: STORAGE | COPY_DST | COPY_SRC,
    });
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

  #uniform(values: number[], floats: number[] = [0, 0]): GpuBuffer {
    const buffer = this.#device.createBuffer({
      size: 32,
      usage: UNIFORM | COPY_DST,
    });
    const data = new ArrayBuffer(32);
    new Uint32Array(data, 0, 6).set([...values, 0, 0, 0, 0, 0, 0].slice(0, 6));
    new Float32Array(data, 24, 2).set(floats);
    this.#device.queue.writeBuffer(buffer, 0, new Uint8Array(data));
    return buffer;
  }

  /** Final hidden states (T × hidden) for a packed decision. */
  async encode(
    decision: PackedDecision,
    embedded: Float32Array,
    debug?: { layers: number; buffer: keyof Scratch; width: number },
  ) {
    const c = this.#model.config;
    const device = this.#device;
    const H = c.hidden;
    const I = c.intermediate;
    const D = H / c.heads;
    const T = decision.ids.length;
    if (T > MAX_TOKENS) throw new Error("SCORER_DECISION_TOO_LONG");
    const s = this.#scratch;
    device.queue.writeBuffer(s.x, 0, embedded);
    device.queue.writeBuffer(s.positions, 0, decision.positions);
    device.queue.writeBuffer(s.segments, 0, decision.segments);

    const encoder = device.createCommandEncoder();
    const transient: GpuBuffer[] = [];
    const run = (
      kernel: string,
      buffers: GpuBuffer[],
      dims: number[],
      floats: number[],
      groups: [number, number?],
    ) => {
      const uniform = this.#uniform(dims, floats);
      transient.push(uniform);
      const pipeline = this.#pipelines[kernel]!;
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [uniform, ...buffers].map((buffer, binding) => ({
          binding,
          resource: { buffer },
        })),
      });
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(groups[0], groups[1] ?? 1);
      pass.end();
    };
    const matmul = (input: GpuBuffer, weight: string, out: GpuBuffer) => {
      const [k, n] = this.#model.tensor(weight).shape as [number, number];
      run(
        "matmul",
        [input, this.#weight(weight), out],
        [T, n, k],
        [0, 0],
        [Math.ceil(n / 16), Math.ceil(T / 16)],
      );
    };
    const norm = (input: GpuBuffer, weight: string, out: GpuBuffer) => {
      run(
        "layernorm",
        [input, this.#weight(weight), out],
        [T, H],
        [c.normEps, 0],
        [T],
      );
    };
    const add = (y: GpuBuffer, x: GpuBuffer, count: number) => {
      run("add", [y, x], [count], [0, 0], [Math.ceil(count / 64)]);
    };

    norm(s.x, "embed_norm", s.h);
    // `x` is the residual stream from here on.
    encoder.copyBufferToBuffer(s.h, 0, s.x, 0, T * H * 4);
    for (let layer = 0; layer < (debug?.layers ?? c.layers); layer += 1) {
      const p = `layers.${layer}`;
      const input = layer === 0 ? s.x : s.h;
      if (layer > 0) norm(s.x, `${p}.attn_norm`, s.h);
      matmul(input, `${p}.wqkv.w`, s.qkv);
      run(
        "rope",
        [s.positions, s.qkv],
        [T, H, 0, c.heads, D],
        [c.ropeTheta, 0],
        [Math.ceil((T * c.heads * D) / 64)],
      );
      run(
        "attention",
        [s.qkv, s.positions, s.segments, s.att],
        [T, H, 0, c.heads, D, layer % c.globalEvery === 0 ? 1 : 0],
        [c.window, 1 / Math.sqrt(D)],
        [Math.ceil((T * c.heads) / 64)],
      );
      matmul(s.att, `${p}.wo.w`, s.proj);
      add(s.proj, s.x, T * H);
      norm(s.x, `${p}.mlp_norm`, s.h);
      matmul(s.h, `${p}.wi.w`, s.wi);
      run("gate", [s.wi, s.gated], [T, I], [0, 0], [Math.ceil((T * I) / 64)]);
      matmul(s.gated, `${p}.wo2.w`, s.proj);
      add(s.proj, s.x, T * H);
    }
    if (debug) {
      encoder.copyBufferToBuffer(
        s[debug.buffer],
        0,
        s.read,
        0,
        T * debug.width * 4,
      );
    } else {
      norm(s.x, "final_norm", s.h);
      encoder.copyBufferToBuffer(s.h, 0, s.read, 0, T * H * 4);
    }
    device.queue.submit([encoder.finish()]);
    await mapRead(this.#device, s.read);
    const hidden = new Float32Array(
      s.read.getMappedRange().slice(0, T * (debug?.width ?? H) * 4),
    );
    s.read.unmap();
    for (const buffer of transient) buffer.destroy();
    return hidden;
  }
}
