/**
 * Runs one of the simulation tools across several processes.
 *
 * Every instrument in `tools/` plays tens of thousands of independent games in a
 * `for` loop, and the engine is synchronous: `Promise.all` over the games
 * interleaves them on one core and finishes no sooner. So the work is split by
 * process, one per core, and the results are merged.
 *
 * Processes rather than worker threads because a shard shares nothing with its
 * siblings -- the engine RNG is seeded per game and every agent is rebuilt per
 * game -- so there is no state to hand across a thread boundary, and a shard that
 * dies cannot take the run's other cores with it.
 *
 * A shard can itself be split. A sweep too big for one machine runs `--shard
 * i/n` on each of several, and each of those still forks over its own cores;
 * `composeShard` makes the two levels one flat shard of the field, so the
 * machines and their workers between them cover it exactly once.
 *
 * The unit of a shard is a **group**: one matchup for `deck:benchmark`, one
 * opponent for `deck:ab`, one deck for `heuristic:ab`. Sharding by group rather
 * than by game keeps each group's games together in one process, which is what
 * lets the parent merge by group label and recover the exact ordering a
 * single-process run would have produced. Since a game's result is a pure
 * function of (decks, seed, seat), that merge is identity, not approximation:
 * `test/deck-benchmark.test.ts` pins it.
 */
import { fork } from "node:child_process";
import { availableParallelism } from "node:os";

export interface Shard {
  index: number;
  count: number;
}

/** Parses `--shard 2/4`. */
export function parseShard(
  value: string | boolean | undefined,
): Shard | undefined {
  if (value === undefined) return undefined;
  const [rawIndex, rawCount] =
    typeof value === "string" ? value.split("/", 2) : [];
  const index = Number(rawIndex);
  const count = Number(rawCount);
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    count < 1 ||
    index < 0 ||
    index >= count
  )
    throw new Error("--shard must be <index>/<count> with index < count");
  return { index, count };
}

/**
 * The groups this shard owns, striped rather than blocked.
 *
 * Groups are wildly uneven -- a control mirror runs three times the actions of
 * an aggro one -- so striping spreads the long ones across workers instead of
 * landing them all on the last.
 */
export function shardGroups<T>(
  groups: readonly T[],
  shard: Shard | undefined,
): T[] {
  if (!shard) return [...groups];
  return groups.filter((_, index) => index % shard.count === shard.index);
}

/**
 * How many workers to use: the requested count, never more than one per group
 * and never more than the machine has.
 *
 * `groups` is this process's own share -- `shardGroups(all, shard).length` --
 * so a shard does not fork more workers than it has work for.
 *
 * A shard *worker* is always 1. What makes it the worker rather than the shard
 * that matters: a top-level `--shard 1/6` run is one of several machines
 * splitting a sweep, and it should still use all of its own cores, which it does
 * by forking children whose shards compose with its own (see
 * {@link composeShard}). A forked child has a parent to report to, and forking
 * again there would run the same work twice.
 */
export function resolveJobs(
  requested: string | boolean | undefined,
  groups: number,
): number {
  if (isShardWorker()) return 1;
  const parsed =
    requested === undefined || typeof requested !== "string"
      ? availableParallelism()
      : Number(requested);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error("--jobs must be a positive integer");
  return Math.max(1, Math.min(parsed, groups));
}

/**
 * The shard a worker gets when its parent is itself a shard.
 *
 * Striping composes exactly. An outer shard `i/N` owns the groups whose index is
 * `i` mod `N`; splitting those `M` ways by the same rule gives worker `j` every
 * `M`th of them starting at `j`, which is the groups whose original index is
 * `i + jN` mod `NM`. So a nested split is a flat shard of the whole field, and
 * six machines running four workers each cover the field exactly once, with no
 * group run twice and none dropped. Without a parent shard the worker's shard is
 * just `j/M`.
 */
export function composeShard(
  outer: Shard | undefined,
  index: number,
  count: number,
): Shard {
  if (!outer) return { index, count };
  return {
    index: outer.index + index * outer.count,
    count: outer.count * count,
  };
}

/**
 * The env var {@link runShardWorker} stamps on a child it forked.
 *
 * Workerhood is declared rather than inferred. An IPC channel alone does not
 * mean this process is a shard worker -- vitest runs a test file in a forked
 * child that has one -- and a tool that mistakes itself for a worker reports its
 * result into a channel nobody is reading and prints nothing.
 */
const SHARD_WORKER_ENV = "OPTCG_SHARD_WORKER";

/** True when this process is a shard worker, i.e. has a parent to report to. */
export function isShardWorker(): boolean {
  return (
    process.env[SHARD_WORKER_ENV] === "1" && typeof process.send === "function"
  );
}

export type ShardMessage<Result> =
  { type: "progress"; completed: number } | { type: "result"; result: Result };

/** Sends this shard's progress to the parent. Silent outside a worker. */
export function reportShardProgress(completed: number): void {
  process.send?.({ type: "progress", completed } satisfies ShardMessage<never>);
}

/** Sends this shard's result to the parent. Silent outside a worker. */
export function reportShardResult(result: unknown): void {
  process.send?.({ type: "result", result } satisfies ShardMessage<unknown>);
}

/**
 * Removes flags the parent owns from the argument list handed to a worker.
 *
 * A worker re-parses the run's own flags so there is one parser rather than two
 * that can disagree; only the flags describing *how* the run is split, and where
 * its output goes, have to be rewritten.
 */
export function stripFlags(
  arguments_: readonly string[],
  keys: readonly string[],
): string[] {
  const kept: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    const key = argument.startsWith("--")
      ? argument.slice(2).split("=", 1)[0]
      : undefined;
    if (key === undefined || !keys.includes(key)) {
      kept.push(argument);
      continue;
    }
    // Drop a detached value too, the way the tools' own parsers consume one.
    if (
      !argument.includes("=") &&
      arguments_[index + 1] &&
      !arguments_[index + 1]!.startsWith("--")
    )
      index += 1;
  }
  return kept;
}

export interface RunShardsOptions {
  /** The run's own arguments, minus whatever {@link stripFlags} removed. */
  arguments: readonly string[];
  jobs: number;
  /** Total games the whole run will play, for the progress line. */
  totalGames: number;
  /** Label for the progress line, e.g. "games". */
  unit?: string;
  /**
   * This process's own shard, when it is one machine of several. Each worker
   * gets a shard composed with it, so the workers split this shard's groups
   * rather than the whole field's.
   */
  shard?: Shard;
}

/**
 * Forks `jobs` workers over this same entry point and collects their results.
 *
 * Progress is printed by the parent alone: four workers writing four carriage
 * returns to one terminal line is unreadable, so each reports its own count up
 * the IPC channel and the parent prints the sum.
 */
export async function runShards<Result>(
  options: RunShardsOptions,
): Promise<Result[]> {
  const completed = new Array<number>(options.jobs).fill(0);
  let lastPercent = -1;
  const unit = options.unit ?? "games";
  const onProgress = (index: number, count: number): void => {
    completed[index] = count;
    const done = completed.reduce((sum, value) => sum + value, 0);
    const percent = Math.floor((done / Math.max(1, options.totalGames)) * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    process.stderr.write(
      `\r${done}/${options.totalGames} ${unit} (${percent}%), ${options.jobs} workers`,
    );
  };
  const results = await Promise.all(
    Array.from({ length: options.jobs }, (_, index) =>
      runShardWorker<Result>(
        [
          ...options.arguments,
          `--shard=${shardFlag(composeShard(options.shard, index, options.jobs))}`,
        ],
        (count) => {
          onProgress(index, count);
        },
      ),
    ),
  );
  process.stderr.write("\n");
  return results;
}

function shardFlag(shard: Shard): string {
  return `${String(shard.index)}/${String(shard.count)}`;
}

function runShardWorker<Result>(
  arguments_: readonly string[],
  onProgress: (completed: number) => void,
): Promise<Result> {
  return new Promise((fulfil, reject) => {
    // `process.execArgv` carries tsx's loader flags, so the worker runs this
    // TypeScript entry point the same way the parent was started.
    const child = fork(process.argv[1]!, [...arguments_], {
      execArgv: process.execArgv,
      env: { ...process.env, [SHARD_WORKER_ENV]: "1" },
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    let result: { value: Result } | undefined;
    child.on("message", (message: ShardMessage<Result>) => {
      if (message.type === "progress") onProgress(message.completed);
      else result = { value: message.result };
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (result) fulfil(result.value);
      else reject(new Error(`Shard exited with code ${code} and no result`));
    });
  });
}
