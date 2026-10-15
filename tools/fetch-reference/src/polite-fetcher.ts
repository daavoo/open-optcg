/**
 * The fetcher both asset downloaders go through: the Node one
 * (`tools/download-assets.ts`) and the in-browser one (`tools/get-cards.ts`).
 * Web APIs only, so it runs in either.
 *
 * Bandai's card list is one Apache host with no CDN in front of it, and each
 * request spends about a second before its first byte, so how many are in
 * flight decides how long a run takes. This keeps that number up without
 * looking like an attack: a handful of requests at first, one more only after
 * a full window of successes, half as many and a pause for everyone the moment
 * the site pushes back, and `Retry-After` honoured when it is sent.
 */

const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;
/** A `Retry-After` longer than this is a block, not a pause; give up instead. */
const MAX_RETRY_AFTER_MS = 5 * 60_000;
/**
 * Statuses that mean "slow down" rather than "this does not exist": rate
 * limits, an overloaded server, and the 403 a web firewall answers with once
 * it has decided a client is too eager.
 */
const THROTTLED = new Set([403, 408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, Math.max(0, ms)));

/** Up to a second of jitter, so retries from many requests do not line up. */
const jitter = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 1000;

export class PermanentError extends Error {}

export interface PoliteFetcherOptions {
  /** Requests in flight at the start. */
  start?: number;
  /** The most it will ever grow to. */
  max?: number;
  /** Sent with every request; a browser ignores the ones it owns. */
  headers?: Record<string, string>;
}

/**
 * Every request goes through one of these, so the whole run shares one
 * concurrency budget and one view of whether the site is pushing back.
 * Additive increase, multiplicative decrease: one more request in flight
 * after each full window of successes, half as many after any failure.
 */
export class PoliteFetcher {
  readonly max: number;
  private limit: number;
  private active = 0;
  private successesAtLimit = 0;
  private pausedUntil = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly headers: Record<string, string>;

  constructor({ start = 4, max = 8, headers = {} }: PoliteFetcherOptions = {}) {
    this.limit = Math.min(start, max);
    this.max = max;
    this.headers = headers;
  }

  get concurrency(): number {
    return this.limit;
  }

  private async acquire(): Promise<void> {
    for (;;) {
      const pause = this.pausedUntil - Date.now();
      if (pause > 0) await sleep(pause);
      else if (this.active < this.limit) {
        this.active += 1;
        return;
      } else await new Promise<void>((wake) => this.waiting.push(wake));
    }
  }

  private release(): void {
    this.active -= 1;
    this.wake();
  }

  private wake(): void {
    const free = Math.max(1, this.limit - this.active);
    for (const wake of this.waiting.splice(0, free)) wake();
  }

  private succeeded(): void {
    this.successesAtLimit += 1;
    if (this.successesAtLimit >= this.limit * 2 && this.limit < this.max) {
      this.limit += 1;
      this.successesAtLimit = 0;
      this.wake();
    }
  }

  private pushedBack(pauseMs: number): void {
    this.limit = Math.max(1, Math.floor(this.limit / 2));
    this.successesAtLimit = 0;
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + pauseMs);
  }

  /** The body of `url`, retried until it arrives or plainly never will. */
  async get(
    url: string,
    expectedType: "text/html" | "image/",
  ): Promise<Uint8Array> {
    let lastError: Error = new Error(url);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const backoff =
        Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1)) + jitter();
      let pause = backoff;
      await this.acquire();
      try {
        const response = await fetch(url, {
          headers: this.headers,
          redirect: "follow",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) {
          const type = response.headers.get("content-type") ?? "";
          if (!type.startsWith(expectedType)) {
            await response.body?.cancel();
            throw new PermanentError(`unexpected content type ${type || "?"}`);
          }
          const body = new Uint8Array(await response.arrayBuffer());
          this.succeeded();
          return body;
        }
        await response.body?.cancel();
        if (!THROTTLED.has(response.status)) {
          throw new PermanentError(`${response.status} ${response.statusText}`);
        }
        const retryAfter = retryAfterMs(response.headers.get("retry-after"));
        if (retryAfter !== null && retryAfter > MAX_RETRY_AFTER_MS) {
          throw new PermanentError(
            `${response.status}: the site asked to wait ${Math.round(retryAfter / 60_000)} minutes; try again later`,
          );
        }
        pause = Math.max(backoff, retryAfter ?? 0);
        lastError = new Error(`${response.status} ${response.statusText}`);
      } catch (error) {
        if (error instanceof PermanentError) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
      } finally {
        this.release();
      }
      // A timeout or a dropped connection is pushback too: an overloaded
      // server sheds connections before it starts answering 503.
      this.pushedBack(pause);
      if (attempt < MAX_ATTEMPTS) await sleep(pause);
    }
    throw lastError;
  }

  /** `get` as text, for the list and search pages. */
  async text(url: string): Promise<string> {
    return new TextDecoder().decode(await this.get(url, "text/html"));
  }
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/**
 * Runs `worker` over `items`, every item started as soon as a slot is free.
 * The fetcher does the limiting; `width` only keeps the number of pending
 * promises (and, in Node, open file handles) bounded, so it is the fetcher's
 * `max`.
 */
export async function forEachConcurrently<T>(
  items: readonly T[],
  width: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]!);
    }),
  );
}
