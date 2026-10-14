/**
 * The Durable Object adapter, over a fake of the five platform methods it uses.
 *
 * The point of these tests is the one thing the adapter is actually responsible
 * for: hibernation. A revived object has no session in memory and live sockets
 * with no seats on them, and it has to come back holding the same match, the
 * same clock and the same seats. `test/session-miniflare.test.ts` runs the same
 * class in the real runtime; this file is where the eviction is deliberate.
 */
import { describe, expect, it, vi } from "vitest";
import { rulesStamp } from "@one-piece-sim/engine-core";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type PlayerId,
  type ServerMessage,
} from "@one-piece-sim/protocol";
import {
  MatchObject,
  type AnalyticsDataset,
  type InitRequest,
  type MatchRecord,
} from "@one-piece-sim/referee";
import type {
  AlarmStorage,
  HibernatableSocket,
  MatchObjectState,
} from "../packages/referee/src/cloudflare.js";

const P1_DECK = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2_DECK = "(Green) Roronoa Zoro - Starter Deck 32";
const TOKENS: Record<PlayerId, string> = { p1: "token-p1", p2: "token-p2" };
const CLOCK = {
  bankMs: 60_000,
  delayMs: 10_000,
  expiredDecisionLimit: 3,
  matchMs: 90 * 60_000,
};

/** The storage half of the fake: a map, plus the one alarm an object may hold. */
class FakeStorage implements AlarmStorage {
  readonly entries = new Map<string, unknown>();
  alarm: number | null = null;
  /** Armed by a test: the next `put` is refused, the way a full or flaky
   * durable store refuses one. */
  failNextPut = false;
  /** How many reads this storage has served, for the tests about not doing one. */
  reads = 0;

  get<T>(key: string): Promise<T | undefined> {
    this.reads += 1;
    // Structured-cloned on the way out, the way the platform does it: a test
    // that mutated a stored object in place would not notice a missing `put`.
    const value = this.entries.get(key);
    return Promise.resolve(
      value === undefined ? undefined : (structuredClone(value) as T),
    );
  }
  put(key: string, value: unknown): Promise<void> {
    if (this.failNextPut) {
      this.failNextPut = false;
      return Promise.reject(new Error("STORAGE_REFUSED"));
    }
    this.entries.set(key, structuredClone(value));
    return Promise.resolve();
  }
  setAlarm(scheduledTime: number): Promise<void> {
    this.alarm = scheduledTime;
    return Promise.resolve();
  }
  deleteAlarm(): Promise<void> {
    this.alarm = null;
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }
  deleteAll(): Promise<void> {
    this.entries.clear();
    this.alarm = null;
    return Promise.resolve();
  }
  getAlarm(): Promise<number | null> {
    return Promise.resolve(this.alarm);
  }
}

class FakeSocket implements HibernatableSocket {
  readonly sent: ServerMessage[] = [];
  closed: string | null = null;
  #attachment: unknown = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ServerMessage);
  }
  close(_code?: number, reason?: string): void {
    this.closed = reason ?? "closed";
  }
  serializeAttachment(value: unknown): void {
    this.#attachment = structuredClone(value);
  }
  deserializeAttachment(): unknown {
    return this.#attachment;
  }
  last<T extends ServerMessage["type"]>(
    type: T,
  ): Extract<ServerMessage, { type: T }> | undefined {
    return this.sent
      .filter(
        (message): message is Extract<ServerMessage, { type: T }> =>
          message.type === type,
      )
      .at(-1);
  }
}

/**
 * One durable object's world: its storage and its sockets, both of which outlive
 * any instance of the class. Evicting is `revive()` -- a fresh `MatchObject`
 * over the same world, which is exactly what the runtime does after a nap.
 */
function world(env?: { ANALYTICS?: AnalyticsDataset }) {
  const storage = new FakeStorage();
  const sockets: HibernatableSocket[] = [];
  const state: MatchObjectState = {
    storage,
    acceptWebSocket: (socket) => {
      sockets.push(socket);
    },
    getWebSockets: () => [...sockets],
    blockConcurrencyWhile: (callback) => callback(),
  };
  return {
    storage,
    sockets,
    state,
    // The runtime hands a Durable Object `(state, env)`; most of these tests
    // are not about telemetry and pass no env at all.
    revive: () => new MatchObject(state, env),
    accept: (socket: HibernatableSocket) => {
      sockets.push(socket);
      // What the real upgrade writes, and the tests need it for the same
      // reason the runtime does: a socket with no accepted time is one that
      // has been sitting here unjoined since before this object was last
      // evicted, and the next upgrade drops it to reclaim the slot.
      socket.serializeAttachment({ acceptedMs: Date.now() });
      return socket;
    },
  };
}

/**
 * The runtime's `WebSocketPair`, which Node does not have.
 *
 * Only the tests that follow an upgrade past the point of *accepting* it need
 * this -- `session-miniflare.test.ts` holds the ones that need a real socket.
 * What is being asserted here is which sockets the object keeps, and for that
 * the pair only has to be two objects with the right shape.
 */
function stubWebSocketPair(): void {
  vi.stubGlobal(
    "WebSocketPair",
    class {
      readonly 0 = new FakeSocket();
      readonly 1 = new FakeSocket();
    },
  );
}

/**
 * Ask for a socket, for the sake of what the ask does to the ones already here.
 *
 * The reply is thrown away, and it has to be: an accepted upgrade answers 101,
 * which Node's `Response` refuses to construct -- the same platform gap that
 * puts every other accepted-socket assertion in `session-miniflare.test.ts`.
 * What these tests are about happens before the reply is built, when the object
 * decides which sockets are still worth a slot.
 */
async function upgrade(object: MatchObject): Promise<void> {
  await object
    .fetch(
      new Request("https://match.test/match/m-do-1/ws", {
        headers: { Upgrade: "websocket" },
      }),
    )
    .catch(() => undefined);
}

function initBody(overrides?: Partial<InitRequest>): InitRequest {
  return {
    matchId: "m-do-1",
    seed: "do-seed-1",
    seats: { p1: { deckId: P1_DECK }, p2: { deckId: P2_DECK } },
    tokens: TOKENS,
    startingPlayer: "p1",
    clock: CLOCK,
    ...overrides,
  };
}

async function init(object: MatchObject, body = initBody()): Promise<Response> {
  return object.fetch(
    new Request("https://match.test/match/m-do-1/init", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

function joinMessage(seat: PlayerId): ClientMessage {
  return {
    v: PROTOCOL_VERSION,
    type: "join",
    seat,
    token: TOKENS[seat],
    rulesStamp: rulesStamp(),
  };
}

async function send(
  object: MatchObject,
  socket: HibernatableSocket,
  message: unknown,
) {
  await object.webSocketMessage(socket, JSON.stringify(message));
}

/** Play one action for whichever seat the frames say is on the clock. */
async function playOne(
  object: MatchObject,
  seats: Record<PlayerId, FakeSocket>,
): Promise<PlayerId> {
  const frames = (["p1", "p2"] as const).map((seat) => ({
    seat,
    frame: seats[seat].last("frame"),
  }));
  const onClock = frames.find(
    ({ frame }) =>
      frame && frame.observation.activePlayer === frame.observation.viewer,
  );
  if (!onClock?.frame) throw new Error("No seat is on the clock");
  await send(object, seats[onClock.seat], {
    v: PROTOCOL_VERSION,
    type: "act",
    revision: onClock.frame.observation.revision,
    actionId: onClock.frame.observation.legalActions[0]!.actionId,
  });
  return onClock.seat;
}

describe("match durable object", () => {
  it("deals the match on init and refuses a second one", async () => {
    const host = world();
    const object = host.revive();
    const created = await init(object);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      matchId: "m-do-1",
      rulesStamp: rulesStamp(),
    });

    const record = await host.storage.get<MatchRecord>("match");
    expect(record?.snapshot?.actions).toEqual([]);
    expect(record?.clock?.running).toBe(false);

    const again = await init(object);
    expect(again.status).toBe(409);
  });

  it("reports an unsupported deck to whoever built the match", async () => {
    const object = world().revive();
    const created = await init(
      object,
      initBody({ seats: { p1: { deckId: "nope" }, p2: { deckId: P2_DECK } } }),
    );
    expect(created.status).toBe(400);
    expect(await created.text()).toContain("UNSUPPORTED_DECK");
  });

  it("writes the seat onto the socket so hibernation can put it back", async () => {
    const host = world();
    const object = host.revive();
    await init(object);
    const socket = host.accept(new FakeSocket());
    await send(object, socket, joinMessage("p1"));

    expect(socket.deserializeAttachment()).toEqual({ seat: "p1" });
    expect((socket as FakeSocket).last("welcome")).toMatchObject({
      seat: "p1",
      matchId: "m-do-1",
    });
    expect((socket as FakeSocket).last("frame")?.observation.viewer).toBe("p1");
  });

  it("starts no clock until both seats are there, and waits on the join deadline instead", async () => {
    const host = world();
    const object = host.revive();
    await init(object);
    // Dealt but not started: the only alarm is the deadline for both seats to
    // arrive, which is much further out than any decision.
    const joinDeadline = host.storage.alarm;
    expect(joinDeadline).not.toBeNull();

    const p1 = new FakeSocket();
    host.accept(p1);
    await send(object, p1, joinMessage("p1"));

    expect(host.storage.alarm).toBe(joinDeadline);
    expect(p1.last("frame")?.clock.running).toBe(false);
    expect(p1.last("frame")?.clock.deadlineMs).toBeNull();

    const p2 = new FakeSocket();
    host.accept(p2);
    await send(object, p2, joinMessage("p2"));

    // Now the clock runs, the alarm moves onto this decision, and the seat that
    // was already waiting is told the match is live.
    expect(host.storage.alarm).not.toBe(joinDeadline);
    expect(p2.last("frame")?.clock.deadlineMs).toBe(host.storage.alarm);
    expect(p1.last("frame")?.clock.running).toBe(true);
  });

  it("ends a match nobody else sat down for, in favour of whoever did", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(2_000_000);
      const host = world();
      const object = host.revive();
      await init(object);
      const p1 = new FakeSocket();
      host.accept(p1);
      await send(object, p1, joinMessage("p1"));

      // Before the deadline nothing happens: the opponent may still be loading.
      await object.alarm();
      expect(p1.last("finished")).toBeUndefined();

      vi.setSystemTime(2_000_000 + 120_000);
      await object.alarm();

      expect(p1.last("finished")?.result).toEqual({
        winner: "p1",
        reason: "no-show",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends with no winner when neither seat arrives", async () => {
    vi.useFakeTimers();
    try {
      stubWebSocketPair();
      vi.setSystemTime(3_000_000);
      const host = world();
      const object = host.revive();
      await init(object);
      vi.setSystemTime(3_000_000 + 120_000);
      await object.alarm();

      // No winner, because nobody turned up to be one. Recorded rather than
      // left open, so the object stops waiting.
      const record = await host.storage.get<MatchRecord>("match");
      expect(record?.snapshot?.result).toEqual({
        winner: null,
        reason: "no-show",
      });
      expect(record?.clock?.running).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a finished match's record once it has been readable long enough", async () => {
    vi.useFakeTimers();
    try {
      stubWebSocketPair();
      vi.setSystemTime(4_000_000);
      const host = world();
      const object = host.revive();
      await init(
        object,
        initBody({
          clock: {
            bankMs: 0,
            delayMs: 1_000,
            expiredDecisionLimit: 1,
            matchMs: 90 * 60_000,
          },
        }),
      );
      const p1 = new FakeSocket();
      const p2 = new FakeSocket();
      host.accept(p1);
      host.accept(p2);
      await send(object, p1, joinMessage("p1"));
      await send(object, p2, joinMessage("p2"));

      vi.setSystemTime(4_000_000 + 2_000);
      await object.alarm();
      expect(p1.last("finished")?.result.reason).toBe("timeout");
      // Still readable, so a client that reconnects is told how it ended.
      expect(await host.storage.get<MatchRecord>("match")).toBeDefined();

      vi.setSystemTime(4_000_000 + 60 * 60_000);
      await object.alarm();
      expect(await host.storage.get<MatchRecord>("match")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("comes back from eviction on the same match, clock and seats", async () => {
    const host = world();
    const first = host.revive();
    await init(first);
    const p1 = new FakeSocket();
    const p2 = new FakeSocket();
    host.accept(p1);
    host.accept(p2);
    await send(first, p1, joinMessage("p1"));
    await send(first, p2, joinMessage("p2"));

    const seats = { p1, p2 };
    await playOne(first, seats);
    await playOne(first, seats);
    const before = {
      revision: p1.last("frame")!.observation.revision,
      hash: p1.last("frame")!.observation.stateHash,
      bank: p1.last("frame")!.clock.bankMs,
      actions: (await host.storage.get<MatchRecord>("match"))!.snapshot!
        .actions,
    };

    // The nap. Everything in memory is gone; the sockets and the storage are not.
    const revived = host.revive();
    await playOne(revived, seats);

    const after = p1.last("frame")!;
    expect(after.observation.revision).toBeGreaterThan(before.revision);
    expect(after.observation.stateHash).not.toBe(before.hash);
    // The banks did not refill, and the seats did not have to re-join: both
    // sockets are still receiving their own frames.
    expect(after.clock.bankMs.p1).toBeLessThanOrEqual(before.bank.p1);
    expect(p2.last("frame")?.observation.viewer).toBe("p2");
    expect(
      (await host.storage.get<MatchRecord>("match"))!.snapshot!.actions.length,
    ).toBe(before.actions.length + 1);
    // And the revived object did not re-open the match at either seat.
    expect(
      p1.sent.filter((message) => message.type === "welcome"),
    ).toHaveLength(1);
  });

  it("times a decision out on its alarm, and stops scheduling once the match ends", async () => {
    // The adapter reads `Date.now()` -- it is the host, and the host is where
    // time is allowed to live -- so the clock is moved here rather than waited
    // on. Nothing in the referee or the engine reads one.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const host = world();
      const object = host.revive();
      await init(
        object,
        initBody({
          clock: {
            bankMs: 0,
            delayMs: 5_000,
            expiredDecisionLimit: 1,
            matchMs: 90 * 60_000,
          },
        }),
      );
      const p1 = new FakeSocket();
      const p2 = new FakeSocket();
      host.accept(p1);
      host.accept(p2);
      await send(object, p1, joinMessage("p1"));
      await send(object, p2, joinMessage("p2"));

      // Both seats are in, so the clock is running and the alarm sits on this
      // decision's deadline.
      expect(host.storage.alarm).toBe(1_000_000 + 5_000);
      expect(p1.last("finished")).toBeUndefined();

      vi.setSystemTime(1_005_000);
      await object.alarm();

      expect(p1.last("finished")?.result.reason).toBe("timeout");
      expect(p2.last("finished")?.result.reason).toBe("timeout");
      // The clock is done, so the one alarm left is the one that drops the
      // finished record -- well after the players have read the result.
      const record = await host.storage.get<MatchRecord>("match");
      expect(host.storage.alarm).toBe(record?.discardAfterMs);
      expect(host.storage.alarm).toBeGreaterThan(1_005_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers a payload that is not JSON without waking the session", async () => {
    const host = world();
    const object = host.revive();
    await init(object);
    const socket = new FakeSocket();
    host.accept(socket);
    await object.webSocketMessage(socket, "{not json");

    expect(socket.last("error")).toMatchObject({ code: "BAD_MESSAGE" });
  });

  it("closes a socket that arrives at an object with no match", async () => {
    const host = world();
    const object = host.revive();
    const socket = new FakeSocket();
    host.accept(socket);
    await send(object, socket, joinMessage("p1"));

    expect(socket.closed).toBe("NO_MATCH");
  });

  it("does not rebuild the match for a socket that never sat down", async () => {
    const host = world();
    const object = host.revive();
    await init(object);
    const socket = new FakeSocket();
    host.accept(socket);
    const readsBefore = host.storage.reads;

    await object.webSocketClose(socket);

    // Closing is the one handler a client reaches without ever sending a
    // message, and rebuilding replays the whole action list. There is nothing
    // to free here and nothing to reschedule, so open-and-close in a loop must
    // not be a replay and a write per iteration.
    expect(host.storage.reads).toBe(readsBefore);
  });

  it("keeps the alarm scheduled when a seat's socket goes away", async () => {
    const host = world();
    const object = host.revive();
    await init(object);
    const p1 = new FakeSocket();
    const p2 = new FakeSocket();
    host.accept(p1);
    host.accept(p2);
    await send(object, p1, joinMessage("p1"));
    await send(object, p2, joinMessage("p2"));
    const scheduled = host.storage.alarm;

    await object.webSocketClose(p1);
    // A disconnect does not pause the clock, so the alarm that will time this
    // seat out is still the one on the object.
    expect(host.storage.alarm).toBe(scheduled);
  });

  it("hands each seat only its own view, through the socket", async () => {
    const host = world();
    const object = host.revive();
    await init(object);
    const p1 = new FakeSocket();
    const p2 = new FakeSocket();
    host.accept(p1);
    host.accept(p2);
    await send(object, p1, joinMessage("p1"));
    await send(object, p2, joinMessage("p2"));

    for (const socket of [p1, p2]) {
      for (const message of socket.sent) {
        if (message.type !== "frame") continue;
        expect(Object.keys(message.observation.opponent)).not.toContain("hand");
      }
    }
    expect(p1.last("frame")?.observation.viewer).toBe("p1");
    expect(p2.last("frame")?.observation.viewer).toBe("p2");
  });

  it("drops the oldest socket that never sat down, never the arriving one", async () => {
    vi.useFakeTimers();
    try {
      stubWebSocketPair();
      vi.setSystemTime(5_000_000);
      const host = world();
      const object = host.revive();
      await init(object);
      // An upgrade proves nothing -- the token is in the first message, not in
      // the URL -- so at this moment a seat coming back and somebody holding
      // the door open look identical. Refusing the newcomer would side with
      // whoever got here first, and the person who reliably knows a match id is
      // the opponent playing in it: fill the sockets, wait for the other tab to
      // reload, and win on a clock it can no longer see.
      const first = new FakeSocket();
      host.accept(first);
      vi.setSystemTime(5_000_001);
      const second = new FakeSocket();
      host.accept(second);

      vi.setSystemTime(5_000_002);
      await upgrade(object);

      expect(first.closed).toBe("NEVER_JOINED");
      expect(second.closed).toBeNull();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("refuses an upgrade only once the seats themselves have filled it", async () => {
    const host = world();
    const object = host.revive();
    await init(object);
    // Four seated sockets: two seats, and slack for a reconnect racing the
    // close of the tab it replaces. Reaching this takes valid tokens, so an
    // upgrade refused here is a client with a real seat opening tabs.
    for (let index = 0; index < 4; index += 1) {
      const socket = new FakeSocket();
      host.accept(socket);
      socket.serializeAttachment({ seat: "p1" });
    }

    const refused = await object.fetch(
      new Request("https://match.test/match/m-do-1/ws", {
        headers: { Upgrade: "websocket" },
      }),
    );

    expect(refused.status).toBe(429);
    // Refused rather than accepted: a rejected connection is not a socket this
    // object has to wake for.
    expect(host.sockets).toHaveLength(4);
  });

  it("reclaims a slot from a socket that has sat there without joining", async () => {
    vi.useFakeTimers();
    try {
      stubWebSocketPair();
      vi.setSystemTime(3_000_000);
      const host = world();
      const object = host.revive();
      await init(object);
      const idle = [new FakeSocket(), new FakeSocket()];
      for (const socket of idle) host.accept(socket);

      // Past the grace period they are in the way rather than arriving, and the
      // upgrade that wants the slot is what says so -- there is no timer,
      // because a slot only matters while somebody wants it.
      vi.setSystemTime(3_000_000 + 20_000);
      await upgrade(host.revive());

      for (const socket of idle) expect(socket.closed).toBe("NEVER_JOINED");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("counts a seated socket as the seat's, however long it sits there", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(4_000_000);
      const host = world();
      const object = host.revive();
      await init(object);
      const seated = new FakeSocket();
      host.accept(seated);
      await send(object, seated, joinMessage("p1"));

      // A person thinking is not a socket in the way. The grace period is about
      // sockets that never named a seat, and this one did.
      vi.setSystemTime(4_000_000 + 600_000);
      await upgrade(object);

      expect(seated.closed).toBeNull();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("drops a message too large to be a move, without waking the match", async () => {
    const host = world();
    const object = host.revive();
    // No match in this object at all, which is how the test can tell the
    // difference: anything that hydrates closes this socket with NO_MATCH.
    const socket = new FakeSocket();
    host.accept(socket);
    await object.webSocketMessage(socket, "x".repeat(64 * 1024 + 1));

    expect(socket.last("error")).toMatchObject({ code: "BAD_MESSAGE" });
    expect(socket.last("error")?.message).toContain("too large");
    expect(socket.closed).toBeNull();
  });

  it("hangs up on a socket that floods, and leaves the match alone", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(7_000_000);
      const host = world();
      const object = host.revive();
      await init(object);
      const p1 = new FakeSocket();
      const p2 = new FakeSocket();
      host.accept(p1);
      host.accept(p2);
      await send(object, p1, joinMessage("p1"));
      await send(object, p2, joinMessage("p2"));
      const before = p2.sent.length;

      // Well past what a seat answering frames as fast as they arrive can send,
      // inside one second.
      for (let index = 0; index < 250; index += 1) {
        await object.webSocketMessage(p1, "{}");
      }

      expect(p1.closed).toBe("TOO_FAST");
      // The opponent's game is untouched: a flood is refused, not refereed.
      expect(p2.sent.length).toBe(before);
      expect(
        (await host.storage.get<MatchRecord>("match"))!.snapshot!.actions,
      ).toEqual([]);

      // And the next second is a fresh allowance, so a burst is not a ban.
      vi.setSystemTime(7_001_500);
      const p3 = new FakeSocket();
      host.accept(p3);
      await send(object, p3, joinMessage("p1"));
      expect(p3.last("frame")?.observation.viewer).toBe("p1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts a match dealt and a match ended, and how long the rebuild cost", async () => {
    const points: {
      indexes?: string[];
      blobs?: string[];
      doubles?: number[];
    }[] = [];
    const host = world({
      ANALYTICS: {
        writeDataPoint: (point) => {
          points.push(point);
        },
      },
    });
    const object = host.revive();
    await init(object);
    const p1 = new FakeSocket();
    const p2 = new FakeSocket();
    host.accept(p1);
    host.accept(p2);
    await send(object, p1, joinMessage("p1"));
    await send(object, p2, joinMessage("p2"));
    await playOne(object, { p1, p2 });
    // An eviction, so the ending has a rebuild cost to report -- the number
    // a checkpoint's worth needs before anyone argues about
    // checkpointing.
    const revived = host.revive();
    await send(revived, p1, { v: PROTOCOL_VERSION, type: "resign" });

    expect(points.map((point) => point.indexes?.[0])).toEqual([
      "match.dealt",
      "match.finished",
    ]);
    const finished = points[1]!;
    expect(finished.blobs).toEqual(["m-do-1", "resign"]);
    // One action played, and a hydrate that took some measurable-or-zero time.
    expect(finished.doubles?.[0]).toBe(1);
    expect(finished.doubles?.[1]).toBeGreaterThanOrEqual(0);
    // Ending twice would double-count: the record is only ever ended once.
    await send(revived, p2, { v: PROTOCOL_VERSION, type: "resign" });
    expect(points).toHaveLength(2);
  });

  it("voids a match the deploy left unplayable, rather than hanging on it", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(5_000_000);
      const host = world();
      const object = host.revive();
      await init(object);
      const p1 = new FakeSocket();
      const p2 = new FakeSocket();
      host.accept(p1);
      host.accept(p2);
      await send(object, p1, joinMessage("p1"));
      await send(object, p2, joinMessage("p2"));
      const seats = { p1, p2 };
      await playOne(object, seats);
      await playOne(object, seats);

      // The deploy: the record now names a build that is not this one. Any
      // deploy does this -- the stamp includes the program hash -- so this is
      // what every match in progress meets, not just one across a rules change.
      const record = (await host.storage.get<MatchRecord>("match"))!;
      host.storage.entries.set("match", {
        ...record,
        snapshot: {
          ...record.snapshot!,
          rulesStamp: { ...record.snapshot!.rulesStamp, programHash: "older" },
        },
      });

      // A fresh object, because that is what a deploy leaves behind: no session
      // in memory, live sockets, and a record it cannot replay.
      const revived = host.revive();
      await send(revived, p1, {
        v: PROTOCOL_VERSION,
        type: "act",
        revision: p1.last("frame")!.observation.revision,
        actionId: p1.last("frame")!.observation.legalActions[0]!.actionId,
      });

      // Both seats are told, and nobody is awarded a game the server stopped.
      for (const socket of [p1, p2]) {
        expect(socket.last("finished")?.result).toEqual({
          winner: null,
          reason: "superseded",
        });
      }
      // And the object is still keeping time: the alarm that drops the record
      // is scheduled, and firing it does exactly that rather than throwing.
      const voided = await host.storage.get<MatchRecord>("match");
      expect(host.storage.alarm).toBe(voided?.discardAfterMs);
      vi.setSystemTime(5_000_000 + 60 * 60_000);
      await revived.alarm();
      expect(await host.storage.get<MatchRecord>("match")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells nobody about a move it could not store, and plays on from what it has", async () => {
    const host = world();
    const object = host.revive();
    await init(object);
    const p1 = new FakeSocket();
    const p2 = new FakeSocket();
    host.accept(p1);
    host.accept(p2);
    await send(object, p1, joinMessage("p1"));
    await send(object, p2, joinMessage("p2"));
    const seats = { p1, p2 };
    await playOne(object, seats);
    const stored = (await host.storage.get<MatchRecord>("match"))!.snapshot!;
    const before = p1.last("frame")!.observation.revision;

    host.storage.failNextPut = true;
    await playOne(object, seats);

    // The write did not land, so the match did not move -- and neither seat was
    // told it did.
    expect(
      (await host.storage.get<MatchRecord>("match"))!.snapshot!.actions,
    ).toEqual(stored.actions);
    for (const socket of [p1, p2]) {
      const frames = socket.sent.filter((message) => message.type === "frame");
      expect(
        frames.every((frame) => frame.observation.revision <= before),
      ).toBe(true);
    }
    // Instead both seats were re-sent the position the server actually holds,
    // so neither is left holding a frame the server disagrees with. (A client
    // still guards against that on its own -- see `online-client.test.ts` --
    // because a lower revision is the only evidence of a lost write it can get.)
    expect(p1.last("frame")?.observation.revision).toBe(before);
    expect(p2.last("frame")?.observation.revision).toBe(before);

    // And the seat on the clock can still play, from there.
    await playOne(object, seats);
    expect(
      (await host.storage.get<MatchRecord>("match"))!.snapshot!.actions.length,
    ).toBe(stored.actions.length + 1);
  });
});
