/**
 * What a stranger with a loop can cost, and the one thing that says no.
 *
 * `POST /match` creates something -- a match is a Durable Object -- and it is
 * public. That makes a limit a requirement rather than a nicety, but the limit
 * itself is Cloudflare's: this file is only the decision to consult it, kept
 * out of `worker.ts` so it can be tested without the Worker entry.
 */

/** The one method of Cloudflare's rate-limiting binding this uses. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * What a deploy says about its own limits, and what it has.
 *
 * `REQUIRE_RATE_LIMIT` is declared in `wrangler.toml`, in the same file and a
 * few lines below the `[[ratelimits]]` blocks it is about. That adjacency is
 * the point: the two cannot drift apart, because deploying with that config is
 * what ships both.
 */
export interface RateLimitEnv {
  RATE_LIMITER?: RateLimiter;
  POLL_LIMITER?: RateLimiter;
  /** Set by any deploy that binds limiters; absent locally and under Miniflare. */
  REQUIRE_RATE_LIMIT?: string;
}

/**
 * Allowed, refused, or refused because this deploy cannot tell.
 *
 * Three answers rather than two because the third is not the second: a limiter
 * that is missing is a broken deploy, and the caller should say so with a
 * different status than it uses for a client that asked too often.
 */
export type RateLimitVerdict = "allowed" | "refused" | "unconfigured";

/**
 * Whether this request may create something.
 *
 * Keyed by IP, which is what Cloudflare puts in `cf-connecting-ip` and the only
 * handle an anonymous request has.
 *
 * Allowed when no limiter is configured *and* none was promised. That is
 * deliberate: the bindings are declared in `wrangler.toml` and absent locally
 * and under Miniflare, where there is nothing to abuse -- and refusing every
 * request because a local run has no limiter would make it useless while
 * protecting nobody.
 *
 * Refused when one was promised and is not there, which is the case this
 * function exists for. Every one of these bindings is optional in code, so a
 * mistyped `name` in `wrangler.toml`, a namespace id already used by another
 * Worker, or a `[[ratelimits]]` block lost in an edit does not fail a deploy or
 * log a line -- it silently removes every limit from the public route that
 * creates Durable Objects, and the first sign of it is a bill. Nothing else in
 * the design can notice: the tests exercise the unlimited path because that is
 * the local path, so the limiter is the one control here that is never run
 * before it is depended on.
 */
export async function rateLimit(
  env: RateLimitEnv,
  request: Request,
  /**
   * Which allowance this route is held to.
   *
   * Named rather than passed as `env.POLL_LIMITER`, because a binding that is
   * absent is `undefined`, and an argument that is `undefined` takes a
   * parameter's default -- so a deploy that bound the creation limiter and
   * missed the poll one would have quietly held reconnects to twenty a minute
   * and locked a seat on a flaky connection out of its own match. A name
   * cannot go missing that way.
   */
  which: "create" | "poll" = "create",
): Promise<RateLimitVerdict> {
  const limiter = which === "poll" ? env.POLL_LIMITER : env.RATE_LIMITER;
  if (!limiter) return env.REQUIRE_RATE_LIMIT ? "unconfigured" : "allowed";
  const key = request.headers.get("cf-connecting-ip") ?? "anonymous";
  const { success } = await limiter.limit({ key });
  return success ? "allowed" : "refused";
}
