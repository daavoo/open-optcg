/**
 * The match Worker in the real Workers runtime.
 *
 * A smoke test, deliberately: `session-referee.test.ts` covers the rules of the
 * session and `session-durable-object.test.ts` covers hibernation against a
 * fake. What only workerd can tell us is whether the pieces the platform owns
 * actually work -- the WebSocket upgrade, `idFromName` routing two links to one
 * object, hibernatable sockets delivering to the handlers, and the kernel
 * running at all inside a Worker bundle.
 *
 * It bundles the Worker with esbuild first, which is also the check that nothing
 * has dragged a `node:` import in behind the engine.
 */
import { Miniflare, type Response as MiniflareResponse } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rulesStamp } from "@one-piece-sim/engine-core";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type PlayerId,
  type ServerMessage,
} from "@one-piece-sim/protocol";
import { buildMatchWorker } from "../tools/build-match-worker.js";

const P1_DECK = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2_DECK = "(Green) Roronoa Zoro - Starter Deck 32";

let mf: Miniflare;
/** The bundle, kept so a second runtime can be started without rebuilding it. */
let workerScript: string;

interface CreatedMatch {
  matchId: string;
  seats: Record<PlayerId, { token: string; url: string }>;
}

beforeAll(async () => {
  // Handed in as a module rather than a file: workerd resolves a script path
  // relative to its starting directory and refuses one that climbs out of it,
  // which a temp directory always does.
  const contents = await buildMatchWorker();
  workerScript = contents;
  mf = new Miniflare({
    modules: [{ type: "ESModule", path: "match-worker.mjs", contents }],
    compatibilityDate: "2026-08-01",
    durableObjects: {
      MATCH: { className: "MatchObject", useSQLite: true },
    },
    // This instance stands in for a local run, where a reproducible match is
    // the point. A deploy binds nothing and the server deals; the test below
    // holds that line.
    bindings: { ALLOW_FIXED_DEAL: "1" },
  });
  await mf.ready;
  // The bundle is ~1.4 MiB minified. Workers meters it compressed, so this is a
  // floor check on the claim that the kernel fits: if it stops fitting, the test
  // that notices should be this one rather than a failed deploy.
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

async function createMatch(
  body?: Record<string, unknown>,
): Promise<MiniflareResponse> {
  return mf.dispatchFetch("https://match.test/match", {
    method: "POST",
    body: JSON.stringify({
      p1Deck: P1_DECK,
      p2Deck: P2_DECK,
      startingPlayer: "p1",
      ...body,
    }),
    headers: { "content-type": "application/json" },
  });
}

/** One seat's socket, with every message it has received. */
interface Seat {
  send(message: ClientMessage): void;
  inbox: ServerMessage[];
  /** Resolves on the next message matching `type` after this call. */
  next<T extends ServerMessage["type"]>(
    type: T,
  ): Promise<Extract<ServerMessage, { type: T }>>;
  last<T extends ServerMessage["type"]>(
    type: T,
  ): Extract<ServerMessage, { type: T }> | undefined;
}

async function connect(matchId: string): Promise<Seat> {
  const response = await mf.dispatchFetch(
    `https://match.test/match/${matchId}/ws`,
    {
      headers: { Upgrade: "websocket" },
    },
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("No WebSocket on the upgrade response");
  const inbox: ServerMessage[] = [];
  const waiters: Array<(message: ServerMessage) => void> = [];
  socket.addEventListener("message", (event) => {
    // The runtime types `data` as string | ArrayBuffer; everything this server
    // sends is JSON text.
    const data = event.data as string;
    const message = JSON.parse(data) as ServerMessage;
    inbox.push(message);
    for (const waiter of waiters.splice(0)) waiter(message);
  });
  socket.accept();
  return {
    send: (message) => {
      socket.send(JSON.stringify(message));
    },
    inbox,
    next: <T extends ServerMessage["type"]>(type: T) =>
      new Promise<Extract<ServerMessage, { type: T }>>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `No ${type} arrived; inbox: ${inbox.map((m) => m.type).join(",")}`,
            ),
          );
        }, 10_000);
        const check = (message: ServerMessage) => {
          if (message.type !== type) {
            waiters.push(check);
            return;
          }
          clearTimeout(timer);
          resolve(message as Extract<ServerMessage, { type: T }>);
        };
        waiters.push(check);
      }),
    last: <T extends ServerMessage["type"]>(type: T) =>
      inbox
        .filter(
          (message): message is Extract<ServerMessage, { type: T }> =>
            message.type === type,
        )
        .at(-1),
  };
}

async function joinSeat(matchId: string, seat: PlayerId, token: string) {
  const socket = await connect(matchId);
  const frame = socket.next("frame");
  socket.send({
    v: PROTOCOL_VERSION,
    type: "join",
    seat,
    token,
    rulesStamp: rulesStamp(),
  });
  await frame;
  return socket;
}

describe("match worker in workerd", () => {
  it("builds a match and hands back a link per seat", async () => {
    const response = await createMatch();
    expect(response.status).toBe(200);
    const created = (await response.json()) as CreatedMatch & {
      rulesStamp: unknown;
    };
    expect(created.matchId).toMatch(/^[0-9a-f]{32}$/);
    expect(created.rulesStamp).toEqual(rulesStamp());
    // The token is in the fragment, so it is not in the request line of whatever
    // the link is opened in.
    expect(created.seats.p1.url).toContain(`#m=${created.matchId}&s=p1&t=`);
    expect(created.seats.p1.token).not.toBe(created.seats.p2.token);
  });

  it("refuses to build a match on a deck the server does not accept", async () => {
    const response = await createMatch({ p1Deck: "not-a-real-deck" });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("UNSUPPORTED_DECK");
  });

  it("plays a match over two real WebSockets, each seat seeing only its own hand", async () => {
    const created = (await (
      await createMatch({ seed: "workerd-seed-1" })
    ).json()) as CreatedMatch;
    const p1 = await joinSeat(created.matchId, "p1", created.seats.p1.token);
    const p2 = await joinSeat(created.matchId, "p2", created.seats.p2.token);

    expect(p1.last("welcome")).toMatchObject({
      seat: "p1",
      opening: { deckIds: { p1: P1_DECK, p2: P2_DECK } },
    });
    // And not the seed, over the real wire as well as in the session tests: it
    // is the one field that would let this client deal the match itself.
    expect(p1.last("welcome")!.opening).not.toHaveProperty("seed");
    // Both links reached the same object: same match, same position, two views.
    expect(p1.last("frame")!.observation.stateHash).toBe(
      p2.last("frame")!.observation.stateHash,
    );
    expect(p1.last("frame")!.observation.viewer).toBe("p1");

    const seats = { p1, p2 };
    for (let step = 0; step < 6; step += 1) {
      // `activePlayer` is the same on both frames -- whose decision it is, is
      // not private -- but each seat's own frame is the one carrying its legal
      // actions, so the move is read off the seat that has to make it.
      const onClock = p1.last("frame")!.observation.activePlayer;
      const observation = seats[onClock].last("frame")!.observation;
      // Both seats are awaited, not just the one acting: a broadcast reaches
      // them independently, and a loop that only waited for the mover would
      // read a stale frame on the next pass.
      const settled = Promise.all([p1.next("frame"), p2.next("frame")]);
      seats[onClock].send({
        v: PROTOCOL_VERSION,
        type: "act",
        revision: observation.revision,
        actionId: observation.legalActions[0]!.actionId,
      });
      await settled;
    }

    // Six actions in, so the loop really drove the match rather than falling out
    // of its first iteration.
    expect(p1.last("frame")!.observation.revision).toBe(6);
    for (const seat of [p1, p2]) {
      for (const message of seat.inbox) {
        if (message.type !== "frame") continue;
        expect(Object.keys(message.observation.opponent)).not.toContain("hand");
      }
    }
  });

  it("closes a seat whose rules stamp is not the match's", async () => {
    const created = (await (await createMatch()).json()) as CreatedMatch;
    const socket = await connect(created.matchId);
    const failure = socket.next("error");
    socket.send({
      v: PROTOCOL_VERSION,
      type: "join",
      seat: "p1",
      token: created.seats.p1.token,
      rulesStamp: { ...rulesStamp(), programHash: "0".repeat(64) },
    });
    expect((await failure).code).toBe("VERSION_MISMATCH");
  });

  it("refuses a token that is not the seat's", async () => {
    const created = (await (await createMatch()).json()) as CreatedMatch;
    const socket = await connect(created.matchId);
    const failure = socket.next("error");
    socket.send({
      v: PROTOCOL_VERSION,
      type: "join",
      seat: "p2",
      token: created.seats.p1.token,
      rulesStamp: rulesStamp(),
    });
    expect((await failure).code).toBe("BAD_TOKEN");
  });

  it("puts a returning seat back on the match it left", async () => {
    const created = (await (
      await createMatch({ seed: "workerd-seed-2" })
    ).json()) as CreatedMatch;
    const p1 = await joinSeat(created.matchId, "p1", created.seats.p1.token);
    const p2 = await joinSeat(created.matchId, "p2", created.seats.p2.token);

    const observation = p1.last("frame")!.observation;
    const settled = Promise.all([p1.next("frame"), p2.next("frame")]);
    p1.send({
      v: PROTOCOL_VERSION,
      type: "act",
      revision: observation.revision,
      actionId: observation.legalActions[0]!.actionId,
    });
    const [, after] = await settled;

    // A second socket for the same seat, with the same token: the state it is
    // handed is the state the match is in, not the one the match opened on.
    const returning = await joinSeat(
      created.matchId,
      "p1",
      created.seats.p1.token,
    );
    expect(returning.last("frame")!.observation.revision).toBe(
      after.observation.revision,
    );
    expect(returning.last("frame")!.observation.viewer).toBe("p1");
    expect(returning.last("welcome")).toMatchObject({
      matchId: created.matchId,
      seat: "p1",
    });
  });

  it("serves the deploy's rules stamp so a client can check before it joins", async () => {
    const response = await mf.dispatchFetch("https://match.test/rules-stamp");
    expect(await response.json()).toEqual(rulesStamp());
  });

  it("answers a browser's preflight for an origin it serves, and only those", async () => {
    // It was `*`. That is fine for *reading* a reply -- nothing here is
    // authenticated by a cookie -- and not for making the request: with `*`,
    // any page in the world can drive this API from a visitor's browser,
    // spending their address's allowance, and the reply to a match it builds
    // carries seat tokens to a page they never opened.
    const preflight = async (origin: string) =>
      mf.dispatchFetch("https://match.test/match", {
        method: "OPTIONS",
        headers: { Origin: origin },
      });

    // This deploy's own origin -- where the app is served from -- and a local
    // app pointed at a real server, which is what `?server=` exists for.
    for (const allowed of ["https://match.test", "http://localhost:5173"]) {
      const response = await preflight(allowed);
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(allowed);
      expect(response.headers.get("vary")?.toLowerCase()).toContain("origin");
    }

    // Anyone else gets no CORS headers rather than a refusal: the browser
    // declines to show the reply, which is what a same-origin API always did.
    for (const refused of [
      "https://not-us.example",
      "https://localhost.not-us.example",
      "https://127.0.0.1.not-us.example",
    ]) {
      const response = await preflight(refused);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("404s an unknown route rather than guessing at it", async () => {
    const response = await mf.dispatchFetch("https://match.test/nope");
    expect(response.status).toBe(404);
  });

  it("keeps a slot for each seat, whatever is holding the others", async () => {
    const created = (await (await createMatch()).json()) as CreatedMatch;
    // Two sockets that upgrade and never say anything. An upgrade proves
    // nothing -- the seat token is in the first message, not in the URL -- and
    // the person who reliably knows a match id is the opponent playing in it,
    // so this is what griefing a live match would look like: fill the sockets,
    // wait for the other tab to reload, and win on a clock they can no longer
    // see.
    const idle = [];
    for (let index = 0; index < 2; index += 1) {
      const response = await mf.dispatchFetch(
        `https://match.test/match/${created.matchId}/ws`,
        { headers: { Upgrade: "websocket" } },
      );
      expect(response.status).toBe(101);
      response.webSocket?.accept();
      idle.push(response.webSocket);
    }

    // A third arrival is accepted, and the *oldest* of the idle pair is what
    // goes: at the upgrade a seat coming back and somebody holding the door
    // open look identical, so the budget sides with whoever arrived last rather
    // than with whoever got here first -- which would be the attacker, by
    // construction.
    const arriving = await mf.dispatchFetch(
      `https://match.test/match/${created.matchId}/ws`,
      { headers: { Upgrade: "websocket" } },
    );
    expect(arriving.status).toBe(101);
    arriving.webSocket?.accept();
    idle.push(arriving.webSocket);

    // The seats were never what that budget was about: both still sit down with
    // the idle pair still holding on, which is the whole point of counting them
    // apart.
    for (const seat of ["p1", "p2"] as const) {
      const socket = await connect(created.matchId);
      const welcomed = socket.next("welcome");
      socket.send({
        v: PROTOCOL_VERSION,
        type: "join",
        seat,
        token: created.seats[seat].token,
        rulesStamp: rulesStamp(),
      });
      expect((await welcomed).seat).toBe(seat);
    }
    for (const socket of idle) socket?.close();
  });

  it("refuses a socket opened by a page from somewhere else", async () => {
    // A WebSocket handshake is not subject to CORS -- the browser sends it and
    // hands over the socket -- so the origin check every other route gets from
    // `cors` does not happen here. Without this, a page anywhere could drive
    // this route from a visitor's browser.
    const response = await mf.dispatchFetch(
      "https://match.test/match/whatever/ws",
      { headers: { Upgrade: "websocket", Origin: "https://not-us.example" } },
    );
    expect(response.status).toBe(403);
  });

  it("lets a client with no origin at all connect, because it is not a browser", async () => {
    // Browsers always send one on a handshake; the clients that do not are the
    // ones that are not browsers -- an agent piloting a seat over this wire,
    // `pnpm referee:local --play`, the terminal. Refusing those would refuse
    // every non-browser client to stop an attack only a browser can mount.
    const created = (await (await createMatch()).json()) as CreatedMatch;
    const response = await mf.dispatchFetch(
      `https://match.test/match/${created.matchId}/ws`,
      { headers: { Upgrade: "websocket" } },
    );
    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close();
  });
});

describe("the match worker as a deploy runs it", () => {
  let deployed: Miniflare;

  beforeAll(async () => {
    // No bindings at all: exactly what `wrangler deploy` leaves, so what this
    // exercises is the difference between a local run and a public one.
    deployed = new Miniflare({
      modules: [
        { type: "ESModule", path: "match-worker.mjs", contents: workerScript },
      ],
      compatibilityDate: "2026-08-01",
      durableObjects: {
        MATCH: { className: "MatchObject", useSQLite: true },
      },
    });
    await deployed.ready;
  }, 60_000);

  afterAll(async () => {
    await deployed.dispose();
  });

  const create = (body: Record<string, unknown>) =>
    deployed.dispatchFetch("https://match.test/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ p1Deck: P1_DECK, p2Deck: P2_DECK, ...body }),
    });

  it("will not let a caller pick the deal", async () => {
    // The deal is a pure function of the seed, the decks and who starts, so a
    // caller who chooses the seed chooses both opening hands -- grind seeds
    // offline, keep the one that deals you a hand and them a mulligan, then
    // send the other seat's link. Refused rather than ignored, so a caller
    // that wanted a reproducible match is told it did not get one.
    for (const body of [{ seed: "chosen-by-me" }, { startingPlayer: "p1" }]) {
      const response = await create(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "DEAL_IS_THE_SERVERS" });
    }
  });

  it("deals a match for a caller that asks for nothing", async () => {
    const response = await create({});
    expect(response.status).toBe(200);
    const created = (await response.json()) as CreatedMatch;
    expect(created.seats.p1.token).not.toBe(created.seats.p2.token);
  });

  it("refuses a body too large to be two deck names", async () => {
    const response = await deployed.dispatchFetch("https://match.test/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        p1Deck: P1_DECK,
        p2Deck: P2_DECK,
        padding: "x".repeat(8_192),
      }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "BODY_TOO_LARGE" });
  });
});

describe("the match worker with the off switch on", () => {
  let closed: Miniflare;

  beforeAll(async () => {
    closed = new Miniflare({
      modules: [
        { type: "ESModule", path: "match-worker.mjs", contents: workerScript },
      ],
      compatibilityDate: "2026-08-01",
      durableObjects: {
        MATCH: { className: "MatchObject", useSQLite: true },
      },
      // What `wrangler secret put MAINTENANCE` leaves behind. A variable rather
      // than a stored flag, so there is no endpoint to turn this on with.
      bindings: { MAINTENANCE: "Updating the server; back in five minutes." },
    });
    await closed.ready;
  }, 60_000);

  afterAll(async () => {
    await closed.dispose();
  });

  it("refuses to start anything, in words the lobby can show", async () => {
    const response = await closed.dispatchFetch("https://match.test/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ p1Deck: P1_DECK, p2Deck: P2_DECK }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "MAINTENANCE",
      message: "Updating the server; back in five minutes.",
    });
  });
});

describe("the match worker whose limiters did not bind", () => {
  let broken: Miniflare;

  beforeAll(async () => {
    broken = new Miniflare({
      modules: [
        { type: "ESModule", path: "match-worker.mjs", contents: workerScript },
      ],
      compatibilityDate: "2026-08-01",
      durableObjects: {
        MATCH: { className: "MatchObject", useSQLite: true },
      },
      // What `wrangler.toml` says, without what it declares: a deploy whose
      // `[[ratelimits]]` blocks are there but whose bindings did not arrive --
      // a mistyped `name`, a namespace id already in use, a block lost in an
      // edit. Miniflare cannot bind Cloudflare's limiter at all, which is why
      // every other test here runs unlimited, and why this failure had nothing
      // watching it.
      bindings: { REQUIRE_RATE_LIMIT: "1" },
    });
    await broken.ready;
  }, 60_000);

  afterAll(async () => {
    await broken.dispose();
  });

  it("refuses to create anything rather than create it unlimited", async () => {
    // Fail closed, and loudly. Unlimited is the expensive direction: this
    // makes a Durable Object, and the reason a limit is configured at all is
    // that a stranger with a loop can otherwise spend real money.
    const response = await broken.dispatchFetch("https://match.test/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ p1Deck: P1_DECK, p2Deck: P2_DECK }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "MISCONFIGURED" });
  });

  it("refuses a socket upgrade too, which is the other thing that wakes an object", async () => {
    const response = await broken.dispatchFetch(
      "https://match.test/match/whatever/ws",
      { headers: { Upgrade: "websocket" } },
    );
    expect(response.status).toBe(503);
  });
});
