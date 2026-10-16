/**
 * Which WebGPU adapter the learned model takes: a hardware one, never the
 * browser's software renderer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGpuDevice } from "@one-piece-sim/agents/scorer";

const device = { label: "device" };

function stubAdapter(adapter: object | null): { options: unknown[] } {
  const seen = { options: [] as unknown[] };
  vi.stubGlobal("navigator", {
    gpu: {
      requestAdapter: (options?: unknown) => {
        seen.options.push(options);
        return Promise.resolve(
          adapter && {
            requestDevice: () => Promise.resolve(device),
            ...adapter,
          },
        );
      },
    },
  });
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestGpuDevice", () => {
  it("takes a hardware adapter, asking for the high-performance one", async () => {
    const seen = stubAdapter({ info: { isFallbackAdapter: false } });
    expect(await requestGpuDevice()).toBe(device);
    expect(seen.options).toEqual([{ powerPreference: "high-performance" }]);
  });

  it("refuses a software adapter, reported on its info", async () => {
    stubAdapter({ info: { isFallbackAdapter: true } });
    expect(await requestGpuDevice()).toBeNull();
  });

  it("refuses a software adapter, reported on the adapter itself", async () => {
    stubAdapter({ isFallbackAdapter: true });
    expect(await requestGpuDevice()).toBeNull();
  });

  it("is null without WebGPU, or without an adapter", async () => {
    vi.stubGlobal("navigator", {});
    expect(await requestGpuDevice()).toBeNull();
    stubAdapter(null);
    expect(await requestGpuDevice()).toBeNull();
  });
});
