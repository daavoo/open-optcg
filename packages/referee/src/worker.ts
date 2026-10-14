/**
 * The Worker in front of the match objects.
 *
 * The routes:
 *
 *   POST /match                  build a private match, a link per seat
 *   GET  /match/:id/ws           sit down at one, over a WebSocket
 *   GET  /rules-stamp            which rules this deploy runs
 *
 * Anything else is the app: static assets are served in front of this Worker
 * (see `wrangler.toml`), so the browser client and the server it talks to are
 * one origin and one deploy.
 *
 * Cloudflare addresses a Durable Object by name, so there is no routing table
 * and no match-to-node mapping to keep: `idFromName(matchId)` is the whole of
 * it, and two people opening the same link reach the same object by
 * construction.
 *
 * Deliberately absent: matchmaking, accounts, rating, and any agent. A match is
 * two seat links handed to whoever should sit at them, so there is nobody to
 * pair and nobody to identify; and the agents package must not follow the
 * engine into a Worker -- a server-side bot belongs in a Worker of its own.
 */
import { rulesStamp } from "@one-piece-sim/engine-core";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { InitRequest } from "./durable-object.js";
import {
  rateLimit,
  type RateLimiter,
  type RateLimitVerdict,
} from "./rate-limit.js";
import { recordEvent, type TelemetryEnv } from "./telemetry.js";

export { MatchObject } from "./durable-object.js";

export interface Env extends TelemetryEnv {
  MATCH: DurableObjectNamespaceLike;
  /**
   * The off switch, and the whole of it.
   *
   * Set to anything and `POST /match` refuses; matches
   * already under way play to their end, because stopping those would be a
   * worse outage than the one being fixed. A variable rather than a stored
   * flag, so turning it on is `wrangler secret put` and there is no endpoint of
   * its own -- and so no endpoint to abuse. Its value is shown to the player, so
   * set it to a sentence; anything that is not one gets a plain default.
   */
  MAINTENANCE?: string;
  /**
   * Cloudflare's rate limiter, when the deploy configures one.
   *
   * Optional on purpose. `POST /match` is public and each match is a Durable
   * Object, so a stranger with a loop can cost real money. That is a deploy's concern rather
   * than the referee's, so the binding is declared in `wrangler.toml` and absent
   * everywhere else: locally, and under Miniflare, there is nothing to abuse and
   * nothing to configure.
   */
  RATE_LIMITER?: RateLimiter;
  /**
   * A looser limiter for a seat's socket upgrades.
   *
   * A reconnect cannot share `RATE_LIMITER`: a phone walking between cells
   * reconnects several times a minute by itself, so a twenty-a-minute allowance
   * meant for creating things would lock a seat out of its own match. It still
   * needs *a* limit, because an upgrade wakes a Durable Object and may replay a
   * whole match.
   *
   * Optional exactly as `RATE_LIMITER` is: absent locally and under Miniflare,
   * where there is nothing to abuse.
   */
  POLL_LIMITER?: RateLimiter;
  /**
   * This deploy binds limiters, so a route that cannot find one must refuse.
   *
   * Every binding here is optional in code, which is what lets a local run and
   * Miniflare configure nothing. The cost of that is a misconfigured deploy --
   * a mistyped `name`, a namespace id in use elsewhere, a block lost in an edit
   * -- looking exactly like a local run: no limits, no error, no log line, and
   * a bill as the first symptom. Declared in `wrangler.toml` beside the
   * `[[ratelimits]]` blocks it is about, so it ships with them or not at all.
   */
  REQUIRE_RATE_LIMIT?: string;
  /**
   * Lets a caller of `POST /match` pin the deal: the seed, and who starts.
   *
   * Off unless set, and that is the point. The deal is a pure function of the
   * seed, the decks and the starting player, so a caller who chooses the seed
   * chooses both opening hands -- they can grind seeds offline and pick one
   * that deals them a keepable hand and the opponent a mulligan, then send the
   * other seat's link. `tools/match-server.ts` sets this so a local run and
   * the tests stay reproducible; a deploy leaves it unset and the server deals.
   */
  ALLOW_FIXED_DEAL?: string;
}

/**
 * The largest `POST /match` body this Worker will read.
 *
 * Two deck ids, an optional seed and a starting player: well under a hundred
 * bytes. 4 KB is far more than that and still small enough that nothing is
 * spent parsing whatever else somebody sends. Checked before the body is read
 * rather than after.
 */
const MAX_MATCH_BODY_BYTES = 4_096;

/** The two methods of the namespace binding this Worker uses. */
interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

interface CreateMatchBody {
  p1Deck: string;
  p2Deck: string;
  /**
   * Only honoured where `ALLOW_FIXED_DEAL` is set -- a local run or a test.
   * Minted here otherwise, and refused if asked for; see `Env`.
   */
  seed?: string;
  startingPlayer?: PlayerId | "random";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // The app is normally served in front of this Worker, so most requests are
    // same-origin and need no CORS at all. A local app pointed at a deployed
    // server is the case that does, so those two origins are reflected and
    // everything else gets no CORS headers -- see `cors`.
    if (request.method === "OPTIONS")
      return cors(new Response(null, { status: 204 }), request);
    // Creating a match is held to the tight allowance. Playing one is not: a
    // player in a match sends a message per decision, and the whole design is
    // that those are cheap.
    if (request.method === "POST" && url.pathname === "/match") {
      if (declaredTooLarge(request, MAX_MATCH_BODY_BYTES))
        return cors(tooBig(), request);
      if (env.MAINTENANCE) return cors(closed(env), request);
      const verdict = await rateLimit(env, request);
      if (verdict !== "allowed") return cors(refusal(verdict, env), request);
      return cors(await createMatch(request, env, url), request);
    }
    const match = /^\/match\/([A-Za-z0-9_-]{1,64})\/ws$/.exec(url.pathname);
    if (match) {
      // Counted per upgrade, not per message: a long game must not be punished
      // for being long, but an upgrade wakes a Durable Object and may replay a
      // whole match, so opening them in a loop is the cheap attack.
      //
      // The poll limiter rather than the creation one, because a reconnect is
      // not a creation. Twenty a minute is an address, not a person: a phone
      // walking between cells reconnects several times a minute by itself, two
      // people in a household share one address, and a seat locked out of its
      // own match auto-passes to a loss while the clock it cannot see runs
      // down. The ceiling is still three orders of magnitude under a loop.
      if (!originMayConnect(request)) return forbidden();
      const verdict = await rateLimit(env, request, "poll");
      if (verdict !== "allowed") return cors(refusal(verdict, env), request);
      const object = env.MATCH.get(env.MATCH.idFromName(match[1]!));
      return object.fetch(request);
    }
    if (url.pathname === "/rules-stamp") {
      // So a client can find out whether it is on the deploy's build before it
      // tries to join a match and gets closed for it.
      return cors(json(rulesStamp()), request);
    }
    return new Response("Not found", { status: 404 });
  },
};

/**
 * A refusal a limiter made, in the two shapes it comes in.
 *
 * `refused` is the client's doing and is a 429. `unconfigured` is ours: this
 * deploy said it binds limiters and one is missing, so the route fails closed
 * rather than serving unlimited object creation to whoever finds it first. That
 * is a 503 -- the server is broken, not the request -- and it is recorded, so
 * `wrangler tail` shows it on the first request after a bad deploy instead of
 * the bill showing it a month later.
 */
function refusal(
  verdict: Exclude<RateLimitVerdict, "allowed">,
  env: Env,
): Response {
  if (verdict === "refused") return json({ error: "RATE_LIMITED" }, 429);
  recordEvent(env, { event: "match.refused", reason: "NO_RATE_LIMITER" });
  return json(
    {
      error: "MISCONFIGURED",
      message:
        "The match server is not accepting matches right now. Try again shortly.",
    },
    503,
  );
}

/**
 * Whether a request *says* it is bigger than we are willing to read.
 *
 * The cheap half of the check, and the only one that can refuse before the body
 * is read at all. It is the client's claim, so it is not the whole answer:
 * a chunked body has no `content-length`, which is why the text is measured
 * again after it arrives.
 */
function declaredTooLarge(request: Request, limit: number): boolean {
  const declared = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(declared) && declared > limit;
}

function tooBig(): Response {
  return json({ error: "BODY_TOO_LARGE" }, 413);
}

/**
 * The server is not starting anything right now, in words a lobby can show.
 *
 * 503 rather than 403: this is temporary and the client should say so rather
 * than tell somebody they are not allowed to play.
 */
function closed(env: Env): Response {
  const reason = (env.MAINTENANCE ?? "").trim();
  const generic = /^(1|true|on|yes)$/i.test(reason) || reason === "";
  return json(
    {
      error: "MAINTENANCE",
      message: generic
        ? "The match server is being updated. New matches are paused; try again in a few minutes."
        : reason,
    },
    503,
  );
}

/**
 * Copy a response, adding the headers a browser needs to read it cross-origin
 * -- but only for an origin this deploy actually serves.
 *
 * It was `*`, on the reasoning that nothing here is authenticated by a cookie
 * so an allowed origin grants nothing. That is true of *reading* a reply and
 * not of making the request: with `*`, any page in the world can drive this API
 * from a visitor's browser, spending their address's rate-limit allowance on
 * matches they never asked for -- and the reply to one of those carries a seat
 * token to a page they did not open.
 *
 * Two origins are reflected instead. This deploy's own, which is where the app
 * is served from and is what a same-origin request already gets; and a loopback
 * address, which is the local-app-against-a-real-server case the client's
 * `?server=` override exists for. Any other origin gets no CORS headers at all
 * rather than a refusal: the browser then declines to show the reply, which is
 * the outcome a same-origin API has always had.
 *
 * `Vary: Origin` because the answer differs by it, and a cache that missed
 * that would hand one origin another's headers.
 */
function cors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.append("vary", "origin");
  const origin = request.headers.get("origin");
  if (origin && isAllowedOrigin(origin, request)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("access-control-max-age", "600");
  }
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Whether a browser at this origin may open a socket here.
 *
 * A WebSocket handshake is not subject to CORS: the browser sends it and
 * delivers the socket, so the check `cors` performs on every other route does
 * not happen on this one. A page anywhere could therefore drive them from a
 * visitor's browser -- spending that address's allowance and holding sockets on
 * objects it has no business waking.
 *
 * A missing `Origin` is allowed, and has to be: browsers always send one on a
 * handshake, and the clients that do not are the ones that are not browsers --
 * `pnpm referee:local --play`, an agent piloting a seat, anything speaking this
 * protocol from a terminal. Refusing those would be refusing every non-browser
 * client to stop an attack that only a browser can mount.
 */
function originMayConnect(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === null || isAllowedOrigin(origin, request);
}

function forbidden(): Response {
  return new Response("Forbidden origin", { status: 403 });
}

/**
 * Whether a browser at this origin may read our answers.
 *
 * Hostname rather than a prefix: `https://localhost.somebody.example` starts
 * with the right letters and belongs to somebody else.
 */
function isAllowedOrigin(origin: string, request: Request): boolean {
  if (origin === new URL(request.url).origin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "[::1]" ||
    host === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
  );
}

async function createMatch(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  let body: CreateMatchBody;
  // Measured as text before it is parsed: a declared `content-length` is the
  // client's claim, and a chunked body has none.
  const text = await request.text();
  if (text.length > MAX_MATCH_BODY_BYTES) return tooBig();
  try {
    body = JSON.parse(text) as CreateMatchBody;
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  if (typeof body.p1Deck !== "string" || typeof body.p2Deck !== "string") {
    return json({ error: "MISSING_DECK" }, 400);
  }
  // A pinned deal is a local-run and test affordance, not a public one; see
  // `Env.ALLOW_FIXED_DEAL`. Refused rather than ignored, so a caller that
  // asked for a reproducible match is told it did not get one.
  const fixedDeal = env.ALLOW_FIXED_DEAL !== undefined;
  if (!fixedDeal && (body.seed !== undefined || body.startingPlayer)) {
    return json({ error: "DEAL_IS_THE_SERVERS" }, 400);
  }
  // Read as `unknown` because it is: the body is parsed JSON, and the field's
  // declared type is what a *caller* is supposed to send, not what arrived.
  const declaredStart: unknown = body.startingPlayer;
  if (
    declaredStart !== undefined &&
    declaredStart !== "p1" &&
    declaredStart !== "p2" &&
    declaredStart !== "random"
  ) {
    return json({ error: "BAD_STARTING_PLAYER" }, 400);
  }
  const matchId = randomToken(16);
  const tokens: Record<PlayerId, string> = {
    p1: randomToken(24),
    p2: randomToken(24),
  };
  const init: InitRequest = {
    matchId,
    // The seed is the server's, except where a deploy has explicitly said
    // otherwise. A caller that chose it would choose both opening hands, which
    // is the whole reason the referee is server-side.
    seed: (fixedDeal ? body.seed : undefined) ?? randomToken(16),
    seats: { p1: { deckId: body.p1Deck }, p2: { deckId: body.p2Deck } },
    tokens,
    ...(fixedDeal && body.startingPlayer
      ? { startingPlayer: body.startingPlayer }
      : {}),
  };
  const object = env.MATCH.get(env.MATCH.idFromName(matchId));
  const created = await object.fetch(
    new Request(`${url.origin}/match/${matchId}/init`, {
      method: "POST",
      body: JSON.stringify(init),
      headers: { "content-type": "application/json" },
    }),
  );
  if (!created.ok) return created;
  return json({
    matchId,
    rulesStamp: rulesStamp(),
    seats: {
      p1: { token: tokens.p1, url: seatUrl(url, matchId, "p1", tokens.p1) },
      p2: { token: tokens.p2, url: seatUrl(url, matchId, "p2", tokens.p2) },
    },
  });
}

/**
 * A seat's link. The token is in the fragment rather than the query so it stays
 * out of request logs and Referer headers -- it is the seat's only credential.
 */
function seatUrl(
  url: URL,
  matchId: string,
  seat: PlayerId,
  token: string,
): string {
  return `${url.origin}/play#m=${matchId}&s=${seat}&t=${token}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // Nothing this Worker answers is worth caching, and one answer is a seat
      // token.
      "cache-control": "no-store",
    },
  });
}

function randomToken(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
