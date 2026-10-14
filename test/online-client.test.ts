/**
 * The browser's side of an online match, driven by messages rather than by a
 * server.
 *
 * `OnlineMatch` holds no game state -- it only ever redraws what a frame told
 * it -- so the two things it can get wrong are what it keeps *alongside* the
 * frames and what it does when the server contradicts one. Both are here: a
 * revision that goes backwards is a lost write and must be taken as the truth,
 * and the action list that arrives with the result must be a trace the loader
 * can replay.
 *
 * The frames are real ones, taken from a local match played by
 * `BrowserGameController`, because a hand-written observation would let this
 * pass against a shape the server never sends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rulesStamp } from "@one-piece-sim/engine-core";
import type {
  ClockView,
  GameObservation,
  ServerMessage,
} from "@one-piece-sim/protocol";
import { BrowserGameController } from "../packages/web/src/controller.js";
import {
  OnlineMatch,
  refusedServerOverride,
  onlineAvailable,
  serverOrigin,
} from "../packages/web/src/online.js";

const P1_DECK = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2_DECK = "(Green) Roronoa Zoro - Starter Deck 32";

const RUNNING: ClockView = {
  running: true,
  bankMs: { p1: 60_000, p2: 60_000 },
  deadlineMs: 60_000,
  expiredDecisions: 0,
};

/** The three globals `OnlineMatch.connect` reaches for, and nothing else. */
class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = FakeSocket.OPEN;
  readonly sent: unknown[] = [];
  readonly #listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), handler]);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    for (const handler of this.#listeners.get("open") ?? []) handler({});
  }
  /** What a lost network looks like: the socket closes, nobody said why. */
  drop(reason = ""): void {
    this.readyState = 3;
    for (const handler of this.#listeners.get("close") ?? [])
      handler({ reason });
  }
  deliver(message: ServerMessage): void {
    for (const handler of this.#listeners.get("message") ?? [])
      handler({ data: JSON.stringify(message) });
  }
}

interface Globals {
  window?: unknown;
  WebSocket?: unknown;
}

/** Reconnection is on a timer, so the tests hold the timer. */
let pending: (() => void)[] = [];

/** Run every reconnect the client has scheduled, and any it schedules doing so. */
function flushTimers(rounds = 64): void {
  for (let round = 0; round < rounds && pending.length > 0; round += 1) {
    const due = pending;
    pending = [];
    for (const run of due) run();
  }
}

/** The page the tests are pretending to be, so a test can change the URL. */
let storage: Map<string, string>;

function pageAt(search: string): void {
  const globals = globalThis as Globals;
  (globals.window as { location: { search: string } }).location.search = search;
}

beforeEach(() => {
  const globals = globalThis as Globals;
  pending = [];
  storage = new Map<string, string>();
  globals.window = {
    location: { search: "", origin: "https://play.test" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    setTimeout: (callback: () => void) => {
      pending.push(callback);
      return pending.length;
    },
  };
  globals.WebSocket = FakeSocket;
  // The deploy `wrangler.toml` describes: the app served in front of its own
  // server. The tests that care about a build without one say so themselves.
  vi.stubGlobal("__MATCH_SERVER__", "self");
});

afterEach(() => {
  const globals = globalThis as Globals;
  delete globals.window;
  delete globals.WebSocket;
  FakeSocket.last = null;
  vi.unstubAllGlobals();
});

/** A seated match, connected, with the socket the test speaks through. */
function seated() {
  let changes = 0;
  const match = new OnlineMatch({
    matchId: "m-online-1",
    seat: "p1",
    token: "token-p1",
    ownDeckId: P1_DECK,
    opponentDeckId: P2_DECK,
    onChange: () => {
      changes += 1;
    },
  });
  match.connect();
  const socket = FakeSocket.last!;
  socket.open();
  socket.deliver({
    v: "1",
    type: "welcome",
    matchId: "m-online-1",
    seat: "p1",
    opening: {
      deckIds: { p1: P1_DECK, p2: P2_DECK },
      rulesStamp: rulesStamp(),
    },
  });
  return { match, socket, changes: () => changes };
}

/** A real local match, to take real frames off. */
function localMatch(seed: string) {
  return new BrowserGameController({
    p1Deck: P1_DECK,
    p2Deck: P2_DECK,
    p1Controller: "human",
    p2Controller: "rules",
    seed,
    startingPlayer: "p1",
  });
}

function frame(observation: GameObservation): ServerMessage {
  return { v: "1", type: "frame", observation, clock: RUNNING };
}

describe("the browser's side of an online match", () => {
  it("takes the server's word when a frame's revision goes backwards", () => {
    const { match, socket } = seated();
    const local = localMatch("online-client-resync");
    const first = local.observe("p1");
    socket.deliver(frame(first));
    for (let i = 0; i < 3; i += 1) {
      local.act(local.activeObservation.legalActions[0]!.actionId);
      socket.deliver(frame(local.observe("p1")));
    }
    const ahead = match.activeObservation.revision;
    expect(ahead).toBeGreaterThan(first.revision);
    match.act(match.activeObservation.legalActions[0]!.actionId);
    expect(match.pending).toBe(true);

    // The server lost the write that produced those frames, so it re-sends the
    // position it actually holds. Only a lower revision can say that: it never
    // goes backwards in a healthy match.
    socket.deliver(frame(first));

    expect(match.activeObservation.revision).toBe(first.revision);
    // The action this seat was waiting on is not coming; the board is not
    // frozen waiting for it.
    expect(match.pending).toBe(false);
    expect(match.takeRefusal()).toContain("did not record");
    // And the history it drew for moves that did not happen is gone with them.
    expect(
      match
        .trace()
        .checkpoints.every((point) => point.revision <= first.revision),
    ).toBe(true);
  });

  it("offers no trace until the result arrives, then one that replays the match", () => {
    const seed = "online-client-trace";
    const { match, socket } = seated();
    const local = localMatch(seed);
    socket.deliver(frame(local.observe("p1")));
    for (let i = 0; i < 8; i += 1) {
      local.act(local.activeObservation.legalActions[0]!.actionId);
      socket.deliver(frame(local.observe("p1")));
    }

    // Mid-match a seat knows only the ids it clicked itself, so there is no
    // trace to offer and the board must not offer one.
    expect(match.capabilities.trace).toBe(false);
    expect(match.trace().actions).toEqual([]);

    const actions = local.trace().actions;
    socket.deliver({
      v: "1",
      type: "finished",
      result: { winner: "p1", reason: "resign" },
      actions,
      deal: { seed, startingPlayer: "p1" },
    });

    expect(match.capabilities.trace).toBe(true);
    // The decks came from `welcome`, and the deal and the actions from
    // `finished`; together they are a file the loader replays to the position
    // the players were looking at.
    const trace = match.trace();
    expect(trace.config.seed).toBe(seed);
    expect(trace.config.startingPlayer).toBe("p1");
    expect(trace.rules).toEqual(rulesStamp());
    expect(BrowserGameController.load(trace).activeObservation.stateHash).toBe(
      match.activeObservation.stateHash,
    );
  });

  it("holds nothing it could deal the match with until the match is over", () => {
    // The deal -- seed, decks, starting player -- reproduces both opening hands
    // and both deck orders. A live seat is given the decks and not the seed, so
    // there is nothing here to deal with; the server sends the rest with the
    // result, which is when a trace is owed. If this ever passes with a seed
    // mid-match, the board can read its opponent's hand.
    const { match, socket } = seated();
    const local = localMatch("online-client-deal");
    socket.deliver(frame(local.observe("p1")));

    expect(match.config.p1Deck).toBe(P1_DECK);
    expect(match.config.p2Deck).toBe(P2_DECK);
    expect(match.config.seed).toBe("");

    socket.deliver({
      v: "1",
      type: "finished",
      result: { winner: "p1", reason: "resign" },
      actions: local.trace().actions,
      deal: { seed: "online-client-deal", startingPlayer: "p1" },
    });
    expect(match.config.seed).toBe("online-client-deal");
  });

  it("keeps a seat a dropped socket cannot reach, and gives up one that is refused", () => {
    const { match, socket } = seated();
    socket.deliver(frame(localMatch("online-client-drop").observe("p1")));

    socket.drop();
    expect(match.status).toBe("reconnecting");
    // Every retry, exhausted. The seat is still this client's: the referee
    // holds it for the token as long as the clock runs, so the lobby has to
    // offer it back rather than let the clock run out on an empty seat.
    // Fifteen seconds of a bad network used to end the match here.
    for (let attempt = 0; attempt < 64 && match.status !== "error"; attempt++) {
      flushTimers(1);
      FakeSocket.last!.drop();
    }
    expect(match.status).toBe("error");
    expect(match.seatLost).toBe(false);
    expect(match.error).toContain("rejoin");

    // A refusal is the other thing, and the seat is gone with it.
    const refused = seated();
    refused.socket.deliver({
      v: "1",
      type: "error",
      code: "BAD_TOKEN",
      message: "Not the token for p1",
    });
    expect(refused.match.seatLost).toBe(true);
  });

  it("stops trying when the match itself is gone", () => {
    const { match, socket } = seated();
    socket.drop("NO_MATCH");
    expect(match.status).toBe("error");
    expect(match.seatLost).toBe(true);
    expect(pending).toHaveLength(0);
  });
});

describe("where the browser sends its match traffic", () => {
  const SERVER_KEY = "optcg.online.server";

  it("takes a ?server= that is a server on this machine, and remembers it", () => {
    // The override exists for one thing: an app served from somewhere else
    // talking to a local server.
    pageAt("?server=http://127.0.0.1:8787");
    expect(serverOrigin()).toBe("http://127.0.0.1:8787");
    expect(refusedServerOverride()).toBeNull();
    expect(storage.get(SERVER_KEY)).toBe("http://127.0.0.1:8787");
  });

  it("refuses a ?server= pointing anywhere else, and says so", () => {
    // This is a link somebody can be sent. The override is where every request
    // goes and where the seat token is sent, so one click would hand a match --
    // and every frame of it -- to whoever wrote the link, and it would persist.
    for (const hostile of [
      "https://not-us.example",
      "https://localhost.not-us.example",
      "http://127.0.0.1.not-us.example",
      "javascript:alert(1)",
      "not-a-url",
    ]) {
      pageAt(`?server=${hostile}`);
      expect(serverOrigin()).toBe("https://play.test");
      expect(refusedServerOverride()).toBe(hostile);
      expect(storage.has(SERVER_KEY)).toBe(false);
    }
  });

  it("forgets an override it would no longer accept", () => {
    // A link clicked before this check existed left one in storage, and every
    // later page load would keep using it. Reading it is where it goes.
    storage.set(SERVER_KEY, "https://not-us.example");
    expect(serverOrigin()).toBe("https://play.test");
    expect(storage.has(SERVER_KEY)).toBe(false);
  });

  it("has no server, and no online play, in a build that was given none", () => {
    // A page served over https from its own origin cannot tell whether a Worker
    // stands behind it, so the build says -- and a build that says nothing
    // follows no seat link, rather than open a socket the static host 404s.
    vi.stubGlobal("__MATCH_SERVER__", "");
    expect(serverOrigin()).toBe("");
    expect(onlineAvailable()).toBe(false);
  });

  it("plays against a local server from a build with none of its own", () => {
    // The other half of the same rule: `?server=` is how a page served from
    // anywhere is pointed at a server on this machine, and that is a server, so
    // online play is available even where the build shipped without one.
    vi.stubGlobal("__MATCH_SERVER__", "");
    pageAt("?server=http://localhost:8787");
    expect(serverOrigin()).toBe("http://localhost:8787");
    expect(onlineAvailable()).toBe(true);
  });

  it("names the origin a build was pointed at, when it is not its own", () => {
    // An app hosted apart from its server: the build carries the origin, and
    // the page's own is not it.
    vi.stubGlobal("__MATCH_SERVER__", "https://match.example");
    expect(serverOrigin()).toBe("https://match.example");
    expect(onlineAvailable()).toBe(true);
  });
});
