/**
 * The Durable Object adapter: one match, hosted.
 *
 * Thin by design. Everything about the game is in `Referee` and everything
 * about who may say what is in `MatchSession`; this file does three things the
 * platform makes it do -- accept sockets, survive eviction, and wake on an
 * alarm -- and nothing else. If a rule about play or authority appears here, it
 * is in the wrong file.
 *
 * The one genuinely platform-shaped decision is hibernation. `acceptWebSocket`
 * lets the object be evicted between moves with its connections intact, which
 * is why this game is nearly free to host: the engine advances only on input,
 * so a match costs the millisecond `applyAction` takes rather than the forty
 * seconds a player spends thinking. The price is that in-memory state is not
 * state. Every handler therefore starts by rebuilding the session from storage,
 * and every handler that changes anything writes it back.
 */
import {
  PROTOCOL_VERSION,
  type MatchResult,
  type PlayerId,
} from "@one-piece-sim/protocol";
import type { ClockRules, ClockState } from "./clock.js";
import { DEFAULT_CLOCK, nextDeadlineMs } from "./clock.js";
import {
  Referee,
  RefereeError,
  type MatchSnapshot,
  type SeatConfig,
} from "./referee.js";
import { MatchSession } from "./session.js";
import { recordEvent, type TelemetryEnv } from "./telemetry.js";
import { deliver, type Connection, type Outbound } from "./transport.js";
import type { HibernatableSocket, MatchObjectState } from "./cloudflare.js";

const RECORD_KEY = "match";

/**
 * How long a dealt match waits for both seats before giving up.
 *
 * Long enough for a slow page load and a distracted person, short enough that
 * whoever did turn up is not left staring at a spinner. The clock does not
 * start until both are here, so without this nothing would ever end such a
 * match.
 */
const JOIN_DEADLINE_MS = 90_000;

/**
 * How long a finished match stays readable before its record is dropped.
 *
 * A client disconnected at the end still deserves to be told how it ended, and
 * a person who refreshes wants to see the result. After that the object has
 * nothing worth keeping: archiving finished matches is a separate concern (R2,
 * step 4 of the design), and this storage is per match.
 */
const KEEP_FINISHED_MS = 10 * 60_000;

/**
 * How many *seated* sockets one match will hold.
 *
 * A seat has at most one live socket and a reconnect supersedes the one it
 * replaces, so two is the working number and four is slack for a reconnect
 * racing the close of the tab it replaces. Anything past that is not a game:
 * every socket wakes this object, and every wake may replay the match.
 *
 * Seated, because a socket that has not joined has shown no token and is
 * counted separately; see `MAX_UNJOINED_SOCKETS`. Only a valid token can spend
 * this budget, so an upgrade refused by it is a client with a real seat opening
 * tabs, not a stranger.
 */
const MAX_SOCKETS = 4;

/**
 * How many sockets that have not sat down are kept beside those.
 *
 * An upgrade proves nothing -- the seat token arrives in the first message, not
 * in the URL -- so a socket that never sends `join` is not a player and must
 * not be able to take a player's place. Every socket was one pool before, and
 * the person who reliably knows a match id is the opponent playing in it: three
 * idle sockets against a live match, wait for the other tab to reload, and the
 * reconnect is refused while a clock it can no longer see runs down to three
 * auto-passes and a loss.
 *
 * Two, and the *newest* two: an arrival is never the socket dropped, because at
 * the upgrade a seat coming back is indistinguishable from somebody holding the
 * door open, and a budget that refused the newcomer would side with whoever got
 * there first -- which is the attacker, by construction.
 */
const MAX_UNJOINED_SOCKETS = 2;

/**
 * How long a socket may sit there without joining before it is in the way.
 *
 * Longer than a page load and a `join` round trip, shorter than anything a
 * person would call a wait. Enforced when a new upgrade arrives rather than on
 * a timer of its own: a slot only matters while somebody wants it, and that is
 * the moment somebody does.
 */
const UNJOINED_GRACE_MS = 15_000;

/**
 * The largest message this object will read.
 *
 * A client message is a join, an action id or a resign -- hundreds of bytes.
 * 64 KB is far more than any of them and far less than what the platform would
 * otherwise let a seated player push through `JSON.parse` and into a match
 * rebuild.
 */
const MAX_MESSAGE_BYTES = 64 * 1024;

/**
 * How many messages a second one socket may send before it is hung up on.
 *
 * A flood limit, not a pacing rule, and the number is high on purpose. A person
 * makes one decision at a time -- but a *client* need not be a person: an agent
 * piloting a seat over this same wire answers every frame the instant it
 * arrives, and `pnpm referee:local --play` legitimately runs at a hundred and
 * more a second. What that traffic has in common is that each message waits for
 * the frame answering the last one, so it is bounded by the server's own
 * throughput. A flood is not, and is orders of magnitude past this.
 *
 * Set too low, this stops honest fast play; the first draft was thirty, and the
 * whole-match test found it in one run.
 */
const MAX_MESSAGES_PER_SECOND = 200;

export interface MatchRecord {
  version: 1;
  /**
   * When both seats must have arrived by, and when a finished match may be
   * dropped. Absolute times, so they survive eviction the way the clock does.
   */
  joinDeadlineMs: number;
  discardAfterMs?: number;
  config: {
    matchId: string;
    seed: string;
    seats: Record<PlayerId, SeatConfig>;
    startingPlayer: PlayerId | "random";
    tokens: Record<PlayerId, string>;
    clock: ClockRules;
  };
  /** Null only in the window between `init` and the deal, which is one call. */
  snapshot: MatchSnapshot | null;
  clock: (ClockState & { running: boolean }) | null;
}

export interface InitRequest {
  matchId: string;
  seed: string;
  seats: Record<PlayerId, SeatConfig>;
  tokens: Record<PlayerId, string>;
  startingPlayer?: PlayerId | "random";
  clock?: ClockRules;
}

export type MatchEnv = TelemetryEnv;

/**
 * A socket attachment.
 *
 * The seat once there is one, written on the way out of `welcome` so it is a
 * fact about what the server accepted rather than about what the client
 * claimed. Until then, when the socket was accepted -- the only way a revived
 * object can tell a socket still opening from one that has been sitting there
 * since before it was evicted.
 */
interface SocketAttachment {
  seat?: PlayerId;
  acceptedMs?: number;
}

export class MatchObject {
  readonly #state: MatchObjectState;
  readonly #env: MatchEnv;
  #session: MatchSession | null = null;
  /** Set once this object has voided its match; see `#supersede`. */
  #superseded = false;
  /**
   * What the last rebuild from storage cost, in milliseconds.
   *
   * Reported with the match's ending, which is the only place it can be paired
   * with how long the match was. That pairing is the whole question behind
   * whether this design ever needs a state checkpoint beside its action list --
   * and it should be answered against real matches rather than one benchmark.
   */
  #lastHydrateMs: number | null = null;
  readonly #connections = new WeakMap<HibernatableSocket, Connection>();
  /**
   * Messages seen per socket in the current second.
   *
   * In memory, and deliberately: hibernation throws it away, but a flood is
   * exactly the traffic that keeps this object awake, so the counter is alive
   * whenever the thing it defends against is happening. An attachment would
   * make every ordinary message pay for the rare one.
   */
  readonly #rate = new WeakMap<
    HibernatableSocket,
    { startedMs: number; count: number }
  >();

  constructor(state: MatchObjectState, env?: MatchEnv) {
    this.#state = state;
    // The runtime constructs a Durable Object with `(state, env)`; a test that
    // is not measuring telemetry passes only the first.
    this.#env = env ?? {};
  }

  /**
   * Two routes: `POST /init` to create the match, `GET /ws` to sit down at it.
   *
   * Returning `Response` and reading `Request` keeps this a plain Worker
   * handler. The `WebSocketPair` global is the platform's, and the only global
   * this package touches.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/init")) {
      return this.#init((await request.json()) as InitRequest);
    }
    if (url.pathname.endsWith("/ws")) {
      return this.#openSocket(request);
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(
    socket: HibernatableSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    // Everything that can refuse a message without knowing anything about the
    // match happens first, and none of it rebuilds one. That order is the
    // point: reading a flood used to cost a hydrate per message.
    if (sizeOf(message) > MAX_MESSAGE_BYTES) {
      // Dropped unread. Answered rather than silently discarded so a client
      // with a genuine bug is told which of its messages went nowhere.
      this.#refuse(socket, "Message too large");
      return;
    }
    if (!this.#withinRate(socket)) {
      socket.close(1008, "TOO_FAST");
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message),
      );
    } catch {
      // Not JSON at all: the session's schema never sees it, so answer here in
      // the same shape it would have.
      this.#refuse(socket, "Not JSON");
      return;
    }
    const session = await this.#hydrate();
    if (!session) {
      // A superseded match has just told this socket how it ended, which is a
      // result rather than a failure; anything else here is a match that is not
      // in this object at all.
      if (!this.#superseded) socket.close(1011, "NO_MATCH");
      return;
    }
    await this.#commit(
      session,
      session.receive(payload, this.#connectionFor(socket), Date.now()),
    );
  }

  /** A refusal this object can make without waking the match. */
  #refuse(socket: HibernatableSocket, message: string): void {
    socket.send(
      JSON.stringify({
        v: "1",
        type: "error",
        code: "BAD_MESSAGE",
        message,
      }),
    );
  }

  /** Whether this socket is still inside its messages-per-second allowance. */
  #withinRate(socket: HibernatableSocket): boolean {
    const now = Date.now();
    const window = this.#rate.get(socket);
    if (!window || now - window.startedMs >= 1_000) {
      this.#rate.set(socket, { startedMs: now, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= MAX_MESSAGES_PER_SECOND;
  }

  async webSocketClose(socket: HibernatableSocket): Promise<void> {
    // A socket that never sat down has no seat to free and no clock to
    // reschedule, and rebuilding the match to discover that is the expensive
    // way to do nothing: `#hydrate` replays the action list, and closing is the
    // one handler a client can reach without ever sending a message. Open and
    // close in a loop and every iteration was a full replay and a write.
    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.seat) return;
    const session = await this.#hydrate();
    if (!session) return;
    session.disconnect(this.#connectionFor(socket));
    // Nothing about the game changed, but the clock keeps running, so the alarm
    // that will time this seat out has to still be scheduled.
    await this.#commit(session, []);
  }

  async webSocketError(socket: HibernatableSocket): Promise<void> {
    await this.webSocketClose(socket);
  }

  /**
   * The clock, and the only thing in this design that happens without a player
   * doing something.
   */
  async alarm(): Promise<void> {
    const record = await this.#state.storage.get<MatchRecord>(RECORD_KEY);
    if (!record) return;
    const now = Date.now();
    // A finished match that has been readable long enough: drop it. This object
    // is not the archive, and a record kept forever is a per-match leak.
    if (record.discardAfterMs !== undefined && now >= record.discardAfterMs) {
      await this.#state.storage.deleteAll();
      this.#session = null;
      return;
    }
    const session = await this.#hydrate();
    if (!session) return;
    const outbound =
      !session.referee.clockRunning && now >= record.joinDeadlineMs
        ? // Nobody, or only one of them, ever sat down.
          session.abandonIfUnjoined()
        : session.tick(now);
    await this.#commit(session, outbound);
  }

  async #init(body: InitRequest): Promise<Response> {
    const existing = await this.#state.storage.get<MatchRecord>(RECORD_KEY);
    if (existing) return json({ error: "ALREADY_INITIALISED" }, 409);
    const config: MatchRecord["config"] = {
      matchId: body.matchId,
      seed: body.seed,
      seats: body.seats,
      startingPlayer: body.startingPlayer ?? "random",
      tokens: body.tokens,
      clock: body.clock ?? DEFAULT_CLOCK,
    };
    const referee = new Referee({
      matchId: config.matchId,
      seed: config.seed,
      seats: config.seats,
      startingPlayer: config.startingPlayer,
      clock: config.clock,
    });
    try {
      // Deals here rather than on first join, so an illegal deck fails the one
      // request that can still report it to whoever built the match. The clock
      // does not start until both seats are connected.
      referee.start(Date.now());
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "BAD_MATCH" },
        400,
      );
    }
    const record: MatchRecord = {
      version: 1,
      config,
      joinDeadlineMs: Date.now() + JOIN_DEADLINE_MS,
      snapshot: referee.snapshot(),
      clock: referee.clockState(),
    };
    await this.#state.storage.put(RECORD_KEY, record);
    this.#session = new MatchSession(referee, { tokens: config.tokens });
    // The first alarm is the join deadline. Until both seats arrive there is no
    // clock, so it is the only thing that can end this match.
    await this.#state.storage.setAlarm(record.joinDeadlineMs);
    recordEvent(this.#env, { event: "match.dealt", matchId: config.matchId });
    return json({ matchId: config.matchId, rulesStamp: referee.rulesStamp });
  }

  #openSocket(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    const now = Date.now();
    const unjoined: Array<{ socket: HibernatableSocket; acceptedMs: number }> =
      [];
    let joined = 0;
    for (const socket of this.#state.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.seat) {
        joined += 1;
        continue;
      }
      // Connected and never sat down. A socket with no accepted time at all is
      // one this build did not accept, which is the same answer: it is not a
      // seat, and it has been here longer than the one arriving now.
      unjoined.push({ socket, acceptedMs: attachment?.acceptedMs ?? 0 });
    }
    // Only seated sockets can fill this. Reaching it takes two valid tokens and
    // a reconnect racing the close of the tab it replaces, which is what the
    // slack is for.
    if (joined >= MAX_SOCKETS) {
      return new Response("Too many connections", { status: 429 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1] as HibernatableSocket];
    // Hibernation: the runtime holds the socket while this object sleeps, and
    // delivers the next message by calling `webSocketMessage` on a fresh
    // instance. A socket kept in a field here instead would not survive.
    this.#state.acceptWebSocket(server);
    // Dated at the upgrade, which is what makes the eviction below an order
    // rather than a guess. In the attachment because that is the only thing
    // about a socket that survives hibernation.
    server.serializeAttachment({ acceptedMs: now } satisfies SocketAttachment);
    // Oldest first, and the socket just accepted is the newest, so an arrival
    // is never the one dropped. That direction is the whole point: an upgrade
    // proves nothing -- the seat token is in the first message, not in the URL
    // -- so at this moment a seat coming back and somebody holding the door
    // open look identical, and refusing the newcomer would side with whoever
    // got here first. The person who reliably knows a match id is the opponent
    // playing in it; the other way round, they could fill the sockets, wait for
    // the other tab to reload, and win on a clock it could no longer see.
    unjoined.sort((left, right) => left.acceptedMs - right.acceptedMs);
    const surplus = unjoined.length + 1 - MAX_UNJOINED_SOCKETS;
    for (const stale of unjoined.slice(0, Math.max(surplus, 0))) {
      stale.socket.close(1008, "NEVER_JOINED");
    }
    // Anything left that has been sitting here past the grace period goes too:
    // a slot only matters while somebody wants it, and somebody just did.
    for (const idle of unjoined.slice(Math.max(surplus, 0))) {
      if (now - idle.acceptedMs >= UNJOINED_GRACE_MS)
        idle.socket.close(1008, "NEVER_JOINED");
    }
    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit);
  }

  /**
   * Rebuild the session from storage, and put the live sockets back on their
   * seats.
   *
   * This is the whole cost of hibernation, and it is bounded: `Referee.restore`
   * replays the action list, which for a match of a few hundred actions is
   * milliseconds, and the stored clock goes back exactly as it was because its
   * timestamps are absolute.
   */
  async #hydrate(): Promise<MatchSession | null> {
    if (this.#session) return this.#session;
    const startedMs = Date.now();
    const stored = await this.#state.storage.get<MatchRecord>(RECORD_KEY);
    if (!stored?.snapshot) return null;
    let referee: Referee;
    try {
      referee = Referee.restore(stored.snapshot, startedMs, {
        clock: stored.config.clock,
        seats: stored.config.seats,
        ...(stored.clock ? { clockState: stored.clock } : {}),
      });
    } catch (error) {
      // The build changed under a match in progress. `restore` is right to
      // refuse -- the legal lines of a game must not move while it is being
      // played -- but the refusal has to end the match rather than leave both
      // seats watching a board that will never move again.
      if (error instanceof RefereeError && error.code === "VERSION_MISMATCH") {
        await this.#supersede(stored);
        return null;
      }
      throw error;
    }
    this.#lastHydrateMs = Date.now() - startedMs;
    const session = new MatchSession(referee, { tokens: stored.config.tokens });
    for (const socket of this.#state.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      // A socket with no attachment has connected but not joined yet: it has no
      // seat to be put back on, and its own `join` will give it one.
      if (attachment?.seat)
        session.attach(attachment.seat, this.#connectionFor(socket));
    }
    this.#session = session;
    return session;
  }

  /**
   * Void a match this build cannot finish, and say so to whoever is here.
   *
   * A result rather than an error, because the client already knows how to show
   * a result: a version error sends a player back to the lobby wondering what
   * they did. Nobody is awarded the win -- the server cannot know who was
   * winning, and it stopped the game itself. The record keeps its snapshot and
   * discards on the usual timer, so a seat that reconnects in the next ten
   * minutes is told the same thing rather than finding nothing.
   */
  async #supersede(record: MatchRecord): Promise<void> {
    this.#superseded = true;
    const result: MatchResult = { winner: null, reason: "superseded" };
    const snapshot = record.snapshot;
    const discardAfterMs =
      record.discardAfterMs ?? Date.now() + KEEP_FINISHED_MS;
    await this.#state.storage.put(RECORD_KEY, {
      ...record,
      discardAfterMs,
      ...(snapshot ? { snapshot: { ...snapshot, result } } : {}),
    } satisfies MatchRecord);
    await this.#state.storage.setAlarm(discardAfterMs);
    recordEvent(this.#env, {
      event: "match.finished",
      matchId: record.config.matchId,
      reason: result.reason,
      actions: snapshot?.actions.length ?? 0,
    });
    for (const socket of this.#state.getWebSockets()) {
      this.#connectionFor(socket).send({
        v: PROTOCOL_VERSION,
        type: "finished",
        result,
        actions: snapshot?.actions ?? [],
        // A voided match is still a match somebody played, and the trace of it
        // is the only thing this ending leaves behind.
        deal: {
          seed: record.config.seed,
          startingPlayer: record.config.startingPlayer,
        },
      });
    }
  }

  /**
   * Store the match, then tell the seats.
   *
   * This order is the whole point: a client told a move landed on a write that
   * did not is a client ahead of the server, and nothing afterwards notices --
   * the next frame simply describes an earlier position. So a failed write
   * sends nothing, throws away the session it was serving, and re-sends the
   * position storage actually holds. That frame's revision is lower than the
   * one the seats are looking at, which is what a client reads as a resync.
   */
  async #commit(
    session: MatchSession,
    outbound: readonly Outbound[],
  ): Promise<void> {
    try {
      await this.#persist(session);
    } catch {
      this.#session = null;
      const stored = await this.#hydrate();
      if (stored) deliver(stored.resync());
      return;
    }
    deliver(outbound);
  }

  async #persist(session: MatchSession): Promise<void> {
    const record = await this.#state.storage.get<MatchRecord>(RECORD_KEY);
    if (!record) return;
    const referee = session.referee;
    // The first write that carries a result is the end of this match, and the
    // only moment that happens exactly once. Null on every other write.
    const ended = record.discardAfterMs === undefined ? referee.result : null;
    const snapshot = referee.snapshot();
    const next: MatchRecord = {
      ...record,
      snapshot,
      clock: referee.clockState(),
      // Set once, when the match ends, so a later message cannot keep pushing
      // the record's life out.
      ...(ended ? { discardAfterMs: Date.now() + KEEP_FINISHED_MS } : {}),
    };
    await this.#state.storage.put(RECORD_KEY, next);
    await this.#scheduleAlarm(referee, next);
    if (ended) {
      recordEvent(this.#env, {
        event: "match.finished",
        matchId: record.config.matchId,
        reason: ended.reason,
        actions: snapshot.actions.length,
        ...(this.#lastHydrateMs === null
          ? {}
          : { lastHydrateMs: this.#lastHydrateMs }),
      });
    }
  }

  /**
   * One alarm, at whatever this match is next waiting for.
   *
   * Three things, in the order a match meets them: the join deadline, then
   * whichever comes first of the current decision's deadline and the match's
   * own ceiling once the clock runs, then the time the finished record may be
   * dropped. Rescheduled after every message, because every message can move
   * it -- and the ceiling is in there because a match nobody is timing out of
   * still has to end.
   */
  async #scheduleAlarm(referee: Referee, record: MatchRecord): Promise<void> {
    const clock = referee.clockState();
    const next = referee.result
      ? (record.discardAfterMs ?? null)
      : clock?.running
        ? nextDeadlineMs(clock)
        : record.joinDeadlineMs;
    if (next === null) {
      await this.#state.storage.deleteAlarm();
      return;
    }
    const current = await this.#state.storage.getAlarm();
    if (current !== next) await this.#state.storage.setAlarm(next);
  }

  /**
   * A `Connection` over one hibernatable socket.
   *
   * Built fresh per call rather than cached, because a cache would not survive
   * eviction either and two `Connection` objects over the same socket would
   * then look like two different seats to the session. Identity comes from the
   * socket, so the session is handed the same socket wrapped the same way.
   */
  #connectionFor(socket: HibernatableSocket): Connection {
    const connections = this.#connections;
    const existing = connections.get(socket);
    if (existing) return existing;
    const connection: Connection = {
      send: (message) => {
        socket.send(JSON.stringify(message));
        // The seat is written on the way out of `welcome`, which is the first
        // message a joined socket ever gets and the only one that names its
        // seat. That keeps the attachment a fact about what the server accepted
        // rather than about what the client claimed.
        if (message.type === "welcome")
          socket.serializeAttachment({ seat: message.seat });
      },
      close: (code) => {
        socket.close(1008, code);
      },
    };
    connections.set(socket, connection);
    return connection;
  }
}

/** How many bytes a client actually sent, text or binary. */
function sizeOf(message: string | ArrayBuffer): number {
  // A JSON message is overwhelmingly ASCII, so the character count is the byte
  // count in every case that matters and an undercount by at most 3x in the
  // rest -- which a 64 KB ceiling absorbs.
  return typeof message === "string" ? message.length : message.byteLength;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The platform's, declared here because this package has no Cloudflare types. */
declare const WebSocketPair: {
  new (): { 0: unknown; 1: unknown };
};
