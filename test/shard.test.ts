import { describe, expect, it } from "vitest";
import {
  composeShard,
  parseShard,
  resolveJobs,
  shardGroups,
  stripFlags,
} from "../tools/shard.js";

const FIELD = Array.from({ length: 253 }, (_, index) => index);

describe("shard splitting", () => {
  it("stripes a field so no group is run twice or dropped", () => {
    const covered = Array.from({ length: 4 }, (_, index) =>
      shardGroups(FIELD, { index, count: 4 }),
    ).flat();
    expect([...covered].sort((a, b) => a - b)).toEqual(FIELD);
  });

  describe("composeShard", () => {
    // What makes a matrix run safe: each machine takes a shard of the field and
    // then forks over its own cores, so the workers are shards of a shard. If
    // composition were approximate, six machines running four workers would
    // between them play some matchups twice and miss others, and the merged
    // table would be quietly wrong rather than loudly short.
    it("is the shard of a shard", () => {
      const outer = { index: 1, count: 6 };
      const slice = shardGroups(FIELD, outer);
      for (let index = 0; index < 4; index += 1)
        expect(shardGroups(FIELD, composeShard(outer, index, 4))).toEqual(
          shardGroups(slice, { index, count: 4 }),
        );
    });

    it("covers the field exactly once across machines and workers", () => {
      for (const [machines, workers] of [
        [6, 4],
        [3, 1],
        [5, 3],
        [7, 2],
      ]) {
        const covered: number[] = [];
        for (let machine = 0; machine < machines!; machine += 1)
          for (let worker = 0; worker < workers!; worker += 1)
            covered.push(
              ...shardGroups(
                FIELD,
                composeShard(
                  { index: machine, count: machines! },
                  worker,
                  workers!,
                ),
              ),
            );
        expect([...covered].sort((a, b) => a - b)).toEqual(FIELD);
      }
    });

    it("is the worker's own shard when there is no outer one", () => {
      expect(composeShard(undefined, 2, 5)).toEqual({ index: 2, count: 5 });
    });
  });

  describe("resolveJobs", () => {
    it("never forks more workers than there are groups", () => {
      expect(resolveJobs("16", 3)).toBe(3);
    });

    it("takes the requested count when there is work for it", () => {
      expect(resolveJobs("4", 100)).toBe(4);
    });

    it("rejects a count that is not a positive integer", () => {
      expect(() => resolveJobs("0", 10)).toThrow("--jobs");
    });
  });

  describe("parseShard", () => {
    it("reads <index>/<count>", () => {
      expect(parseShard("2/6")).toEqual({ index: 2, count: 6 });
    });

    it("rejects an index outside its count", () => {
      expect(() => parseShard("6/6")).toThrow("--shard");
    });
  });

  it("strips a flag and its detached value from a worker's arguments", () => {
    expect(
      stripFlags(
        ["--seeds", "10", "--jobs", "4", "--check"],
        ["jobs", "check"],
      ),
    ).toEqual(["--seeds", "10"]);
  });
});
