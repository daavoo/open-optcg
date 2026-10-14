/**
 * The session layer's own gate.
 *
 * The repo's "every rules-behaviour change gets a test" rule does not reach any
 * of this -- none of it is rules behaviour -- so this file is the deterministic
 * two-client harness the design called for: a whole match played over the
 * in-memory transport, with timeout, reconnect, version mismatch and the
 * hidden-information boundary each driven end to end. Nothing here waits on a
 * real clock; time is an argument.
 */
import { describe, expect, it } from "vitest";
import {
  createGame,
  rulesStamp,
  type RulesStamp,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type GameObservation,
  type PlayerId,
  type ServerMessage,
} from "@one-piece-sim/protocol";
import {
  MatchSession,
  Referee,
  RefereeError,
  createMemoryPair,
  deliver,
  type ClientSocket,
  type Connection,
} from "@one-piece-sim/referee";
import type { ClockRules } from "../packages/referee/src/clock.js";

const P1_DECK = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2_DECK = "(Green) Roronoa Zoro - Starter Deck 32";
const TOKENS: Record<PlayerId, string> = { p1: "token-p1", p2: "token-p2" };
const CLOCK: ClockRules = {
  bankMs: 60_000,
  delayMs: 10_000,
  expiredDecisionLimit: 3,
  matchMs: 90 * 60_000,
};

interface Harness {
  session: MatchSession;
  referee: Referee;
  seat: (seat: PlayerId) => Seat;
  /** Connects both seats and returns them, opening frames already in the inbox. */
  join: () => { p1: Seat; p2: Seat };
}

interface Seat {
  client: ClientSocket;
  connection: Connection;
  send(message: ClientMessage, atMs?: number): void;
  join(options?: {
    token?: string;
    rulesStamp?: RulesStamp;
    atMs?: number;
  }): void;
  /** The most recent frame this seat received. */
  frame(): Extract<ServerMessage, { type: "frame" }>;
  errors(): Extract<ServerMessage, { type: "error" }>[];
  finished(): Extract<ServerMessage, { type: "finished" }> | undefined;
}

function harness(options?: {
  seed?: string;
  clock?: ClockRules;
  startAt?: number;
  startingPlayer?: PlayerId;
}): Harness {
  const referee = new Referee({
    matchId: "m-1",
    seed: options?.seed ?? "pvp-seed-1",
    seats: { p1: { deckId: P1_DECK }, p2: { deckId: P2_DECK } },
    startingPlayer: options?.startingPlayer ?? "p1",
    clock: options?.clock ?? CLOCK,
  });
  referee.start(options?.startAt ?? 0);
  const session = new MatchSession(referee, { tokens: TOKENS });

  // Arrow properties, not methods: every test destructures `seat` and `join`
  // off the harness, and a method separated from its object is a lint error
  // waiting to become a `this` bug.
  const seat = (id: PlayerId): Seat => {
    const pair = createMemoryPair({
      onMessage: (raw, connection) => {
        // The session hands its messages back rather than sending them; here
        // that is one line, because there is nothing to store first. In the
        // Durable Object it is the difference between a durable move and a
        // client that is ahead of the server.
        deliver(session.receive(raw, connection, currentMs));
      },
      onClose: (connection) => {
        session.disconnect(connection);
      },
    });
    let currentMs = options?.startAt ?? 0;
    const of = <T extends ServerMessage["type"]>(type: T) =>
      pair.client.inbox.filter(
        (message): message is Extract<ServerMessage, { type: T }> =>
          message.type === type,
      );
    return {
      client: pair.client,
      connection: pair.connection,
      send(message, atMs = currentMs) {
        currentMs = atMs;
        pair.client.send(message);
      },
      join(joinOptions) {
        this.send(
          {
            v: PROTOCOL_VERSION,
            type: "join",
            seat: id,
            token: joinOptions?.token ?? TOKENS[id],
            rulesStamp: joinOptions?.rulesStamp ?? rulesStamp(),
          },
          joinOptions?.atMs ?? currentMs,
        );
      },
      frame() {
        const frames = of("frame");
        const last = frames.at(-1);
        if (!last) throw new Error(`${id} has received no frame`);
        return last;
      },
      errors: () => of("error"),
      finished: () => of("finished").at(-1),
    };
  };

  return {
    session,
    referee,
    seat,
    join: () => {
      const p1 = seat("p1");
      const p2 = seat("p2");
      p1.join();
      p2.join();
      return { p1, p2 };
    },
  };
}

/** Play `actionId` for whoever the referee has on the clock, through the wire. */
function act(
  seats: Record<PlayerId, Seat>,
  referee: Referee,
  atMs: number,
  pick?: (observation: GameObservation) => string,
) {
  const onClock = referee.onClock;
  if (!onClock) throw new Error("Nobody is on the clock");
  const observation = seats[onClock].frame().observation;
  const actionId = pick
    ? pick(observation)
    : observation.legalActions[0]!.actionId;
  seats[onClock].send(
    {
      v: PROTOCOL_VERSION,
      type: "act",
      revision: observation.revision,
      actionId,
    },
    atMs,
  );
  return { seat: onClock, actionId };
}

describe("online match session", () => {
  it("opens both seats on the same match and only tells each seat its own hand", () => {
    const { p1, p2 } = harness().join();

    const welcome = p1.client.inbox[0];
    expect(welcome).toMatchObject({
      type: "welcome",
      seat: "p1",
      opening: { deckIds: { p1: P1_DECK, p2: P2_DECK } },
    });
    expect(p2.client.inbox[0]).toMatchObject({ type: "welcome", seat: "p2" });

    // Same match, same revision, different views.
    expect(p1.frame().observation.viewer).toBe("p1");
    expect(p2.frame().observation.viewer).toBe("p2");
    expect(p1.frame().observation.stateHash).toBe(
      p2.frame().observation.stateHash,
    );
  });

  it("tells a live match's seats nothing they could deal the match with", () => {
    /* The deal is a pure function of the seed, the two decks and the starting
       player. A seat handed all four can run `createGame` itself and read the
       opponent's opening hand and both deck orders -- every card either player
       will draw, before the mulligan. `observe()` withholding the hand is
       decorative if the wire hands over the recipe for it, which is why the
       seed and the starting player are held back until `finished`.

       This asserts the whole of that: not "welcome has no `seed` field", but
       that nothing a live seat receives contains the seed at all. */
    const { referee, join } = harness();
    const seats = join();
    for (let step = 0; step < 6; step += 1) act(seats, referee, 0);

    for (const seat of [seats.p1, seats.p2]) {
      expect(JSON.stringify(seat.client.inbox)).not.toContain("pvp-seed-1");
      expect(seat.client.inbox[0]).not.toHaveProperty("opening.seed");
      expect(seat.client.inbox[0]).not.toHaveProperty("opening.startingPlayer");
    }

    // And then, with the result, it does arrive -- a trace of a game that is
    // over is a thing a player is owed.
    seats.p1.send({ v: PROTOCOL_VERSION, type: "resign" });
    expect(seats.p1.finished()).toMatchObject({
      deal: { seed: "pvp-seed-1", startingPlayer: "p1" },
    });
  });

  it("names the seat the ceiling caught, whichever one it was", () => {
    // For the record only -- nobody loses to the ceiling -- but the record was
    // always p1: the seat was read off the clock one line *after* the clock was
    // cleared, where it is null, and the fallback took over. A match p1 started
    // hid it, which is every other test here.
    const clock: ClockRules = {
      bankMs: 600_000,
      delayMs: 10_000,
      expiredDecisionLimit: 3,
      matchMs: 120_000,
    };
    const { referee, join } = harness({ clock, startingPlayer: "p2" });
    join();

    expect(referee.tick(120_000)).toEqual([
      { seat: "p2", effect: "time-limit" },
    ]);
  });

  it("ends a match that has run for its whole limit, with no winner", () => {
    // A resource ceiling, not a tiebreak. The banks here are ten minutes and
    // the limit is two, so no decision has lapsed when it arrives -- which is
    // the stall the free delay makes possible, and the reason the banks alone
    // bound nothing. Nobody is awarded it: inventing a winner would be
    // inventing a rules verdict that paper OPTCG has a real procedure for, and
    // a ladder will need that procedure. Casual has no rating to protect.
    const clock: ClockRules = {
      bankMs: 600_000,
      delayMs: 10_000,
      expiredDecisionLimit: 3,
      matchMs: 120_000,
    };
    const { referee, session, join } = harness({ clock });
    const seats = join();

    // Inside the limit, with no decision lapsed, a tick does nothing at all.
    deliver(session.tick(119_999));
    expect(referee.result).toBeNull();
    expect(seats.p1.finished()).toBeUndefined();

    deliver(session.tick(120_000));
    expect(referee.result).toEqual({ winner: null, reason: "time-limit" });
    for (const seat of [seats.p1, seats.p2]) {
      expect(seat.finished()?.result).toEqual({
        winner: null,
        reason: "time-limit",
      });
    }
    // Nobody is on the clock afterwards, so nothing further is timed. The
    // outcome still names the seat that was on it -- for the record only, since
    // the ceiling is a resource limit and nobody loses to it -- which means
    // reading that seat before the clock is cleared rather than after, where it
    // is always null and the fallback made every match end on p1.
    expect(referee.onClock).toBeNull();
    expect(referee.tick(600_000)).toEqual([]);
  });

  it("never puts a card the viewer cannot see into a frame", () => {
    // The deal is a pure function of seed and decks, so the same createGame
    // tells the test what p2 is actually holding -- and no frame sent to p1 may
    // contain any of it. This is the test the design asked for: it fails on a
    // frame carrying a field `observe()` withholds.
    const truth = createGame({
      gameId: "shadow",
      p1: resolveDeck(P1_DECK),
      p2: resolveDeck(P2_DECK),
      seed: "pvp-seed-1",
      startingPlayer: "p1",
    });
    const hidden = [
      ...truth.players.p2.hand.map((card) => card.instanceId),
      ...truth.players.p2.deck.map((card) => card.instanceId),
    ];

    const { session, referee, join } = harness();
    const { p1, p2 } = join();
    // The opening frame, before a card can legitimately become public: not one
    // of p2's private instance ids may appear anywhere in it.
    const opening = JSON.stringify(p1.frame());
    expect(hidden.filter((instanceId) => opening.includes(instanceId))).toEqual(
      [],
    );

    const seats = { p1, p2 };
    for (let step = 0; step < 40 && referee.onClock; step += 1) {
      act(seats, referee, step * 1_000);
    }
    expect(session.connectedSeats).toHaveLength(2);

    // And structurally, for every frame of the match: the opponent's hand is a
    // count and never a list. A card p2 played is public and its id is allowed
    // to appear -- that is why this asserts on the shape rather than on ids.
    for (const message of p1.client.inbox) {
      if (message.type !== "frame") continue;
      const opponent = message.observation.opponent as Record<string, unknown>;
      expect(Object.keys(opponent)).not.toContain("hand");
      expect(typeof opponent.handCount).toBe("number");
      expect(message.observation.viewer).toBe("p1");
    }
    expect(p1.frame().observation.opponent.handCount).toBeGreaterThan(0);
  });

  it("plays a full match to a winner and broadcasts the result once", () => {
    const { referee, join } = harness({ seed: "pvp-seed-full" });
    const { p1, p2 } = join();
    const seats = { p1, p2 };
    let steps = 0;
    while (referee.onClock && steps < 4_000) {
      // First legal action every time: this is a session test, not a play-quality
      // one, and a fixed policy over a fixed seed is what makes it deterministic.
      act(seats, referee, steps * 1_000);
      steps += 1;
    }
    const result = referee.result;
    expect(result).not.toBeNull();
    expect(result?.reason).toBe("life");
    expect(p1.finished()).toMatchObject({ result });
    expect(p2.finished()).toMatchObject({ result });
    expect(referee.snapshot().actions).toHaveLength(steps);
  });

  it("refuses an action from the seat that is not on the clock", () => {
    const { referee, join } = harness();
    const { p1, p2 } = join();
    const idle = referee.onClock === "p1" ? p2 : p1;
    const busy = referee.onClock === "p1" ? p1 : p2;

    idle.send({
      v: PROTOCOL_VERSION,
      type: "act",
      revision: idle.frame().observation.revision,
      actionId: busy.frame().observation.legalActions[0]!.actionId,
    });

    expect(idle.errors().at(-1)?.code).toBe("NOT_YOUR_DECISION");
    // And the opponent is not told that they tried.
    expect(busy.errors()).toEqual([]);
    expect(referee.snapshot().actions).toEqual([]);
  });

  it("rejects a stale revision as stale, not as illegal", () => {
    const { referee, join } = harness();
    const { p1, p2 } = join();
    const seats = { p1, p2 };

    // Play on until one seat holds the clock across two decisions -- the seat
    // check runs first, so a stale action from a seat that has since handed the
    // clock over would come back as `NOT_YOUR_DECISION` instead.
    let played = { seat: referee.onClock!, actionId: "", revision: -1 };
    for (let step = 1; step < 40; step += 1) {
      const before = referee.onClock!;
      const revision = seats[before].frame().observation.revision;
      const done = act(seats, referee, step * 1_000);
      if (referee.onClock === before) {
        played = { seat: before, actionId: done.actionId, revision };
        break;
      }
    }
    expect(played.revision).toBeGreaterThanOrEqual(0);

    // The same message again, now one revision behind.
    seats[played.seat].send({
      v: PROTOCOL_VERSION,
      type: "act",
      revision: played.revision,
      actionId: played.actionId,
    });
    expect(seats[played.seat].errors().at(-1)?.code).toBe("STALE_ACTION");
  });

  it("refuses a join carrying another build's rules stamp", () => {
    const { seat } = harness();
    const p1 = seat("p1");
    p1.join({ rulesStamp: { ...rulesStamp(), cardDataHash: "0".repeat(64) } });

    expect(p1.errors().at(-1)?.code).toBe("VERSION_MISMATCH");
    expect(p1.client.closed).toBe("VERSION_MISMATCH");
    // No frame reached a client the match cannot agree with.
    expect(p1.client.inbox.some((message) => message.type === "frame")).toBe(
      false,
    );
  });

  it("refuses a join with the wrong seat token", () => {
    const { seat } = harness();
    const impostor = seat("p2");
    impostor.join({ token: TOKENS.p1 });

    expect(impostor.errors().at(-1)?.code).toBe("BAD_TOKEN");
    expect(impostor.client.closed).toBe("BAD_TOKEN");
  });

  it("refuses a token that is nearly right the same way as one that is not", () => {
    // The comparison does not return on the first wrong character, so how long
    // a refusal takes says nothing about how much of the token was right. A
    // test cannot time this reliably enough to assert on -- what it can hold is
    // that every near miss is refused identically, including the shapes that
    // tempt a shortcut: a prefix, an over-long token, and an empty one.
    const { seat } = harness();
    const right = TOKENS.p1;
    for (const wrong of [
      right.slice(0, -1),
      `${right}0`,
      `0${right.slice(1)}`,
      `${right.slice(0, -1)}0`,
      "x",
    ]) {
      const impostor = seat("p1");
      impostor.join({ token: wrong });
      expect(impostor.errors().at(-1)?.code).toBe("BAD_TOKEN");
      expect(impostor.client.closed).toBe("BAD_TOKEN");
      // And nothing was seated by it.
      expect(impostor.client.inbox.some((m) => m.type === "welcome")).toBe(
        false,
      );
    }

    // An empty token never reaches the comparison at all: the schema requires
    // one, so it is a malformed message rather than a wrong guess.
    const empty = seat("p1");
    empty.join({ token: "" });
    expect(empty.errors().at(-1)?.code).toBe("BAD_MESSAGE");
  });

  it("catches a reconnecting seat up with a full frame and supersedes the old socket", () => {
    const { session, referee, seat } = harness();
    const p1 = seat("p1");
    const p2 = seat("p2");
    p1.join();
    p2.join();
    act({ p1, p2 }, referee, 1_000);

    p1.client.drop();
    expect(session.connectedSeats).toEqual(["p2"]);

    const returning = seat("p1");
    returning.join({ atMs: 2_000 });
    expect(returning.frame().observation.revision).toBe(
      p2.frame().observation.revision,
    );
    expect(returning.frame().observation.viewer).toBe("p1");
    expect(session.connectedSeats).toContain("p1");

    // A third socket claiming the seat takes it, and the previous one is told.
    const third = seat("p1");
    third.join({ atMs: 3_000 });
    expect(returning.client.closed).toBe("SUPERSEDED");
    expect(session.connectedSeats).toContain("p1");
  });

  it("keeps the clock running while a seat is disconnected", () => {
    const { session, referee, seat } = harness();
    const p1 = seat("p1");
    const p2 = seat("p2");
    p1.join();
    p2.join();
    const onClock = referee.onClock!;
    (onClock === "p1" ? p1 : p2).client.drop();

    // Well inside the delay: nothing has happened yet.
    deliver(session.tick(5_000));
    expect(referee.onClock).toBe(onClock);
    // Past delay plus bank: the clock does not wait for a socket to come back.
    deliver(session.tick(80_000));
    expect(
      referee.snapshot().actions.length + (referee.result ? 1 : 0),
    ).toBeGreaterThan(0);
  });

  it("auto-passes an expired decision and only concedes once the mercy runs out", () => {
    const clock: ClockRules = {
      bankMs: 1_000,
      delayMs: 1_000,
      expiredDecisionLimit: 3,
      matchMs: 90 * 60_000,
    };
    const { referee, join } = harness({ clock });
    const { p1, p2 } = join();
    const seats = { p1, p2 };

    // Get past the mulligan, where "pass" is not one of the legal actions.
    let at = 0;
    while (
      referee.onClock &&
      seats[referee.onClock].frame().observation.phase === "mulligan"
    ) {
      at += 100;
      act(seats, referee, at);
    }
    const stalling = referee.onClock!;

    // One expiry: a pass is legal, so the game moves along and nobody loses.
    // Just past the first deadline (delay + bank), and short of the second.
    const before = referee.snapshot().actions.length;
    referee.tick(at + 2_500);
    expect(referee.result).toBeNull();
    expect(referee.snapshot().actions.length).toBeGreaterThan(before);

    // Nobody comes back. Each further expiry is dated from the deadline it
    // missed, so one late tick collapses the whole streak rather than granting
    // a fresh delay per call.
    referee.tick(at + 200_000);
    expect(referee.result?.reason).toBe("timeout");
    // Whoever was on the clock for the last expiry loses; with neither seat
    // answering, the auto-passes alternate, so the test asserts the rule rather
    // than guessing which seat the streak lands on.
    expect(referee.result?.winner).not.toBeNull();
    expect(referee.onClock).toBeNull();
    expect(stalling).toMatch(/^p[12]$/);
    expect(p1.finished()).toBeUndefined(); // referee.tick alone does not broadcast
  });

  it("relays a timeout loss to both seats when the session drives the clock", () => {
    const clock: ClockRules = {
      bankMs: 0,
      delayMs: 1_000,
      expiredDecisionLimit: 1,
      matchMs: 90 * 60_000,
    };
    const { session, referee, join } = harness({ clock });
    const { p1, p2 } = join();

    deliver(session.tick(500_000));
    expect(referee.result?.reason).toBe("timeout");
    expect(p1.finished()).toMatchObject({ result: { reason: "timeout" } });
    expect(p2.finished()).toMatchObject({ result: { reason: "timeout" } });
  });

  it("ends the match on a resignation, with the opponent as the winner", () => {
    const { referee, join } = harness();
    const { p1, p2 } = join();
    p1.send({ v: PROTOCOL_VERSION, type: "resign" });

    expect(referee.result).toEqual({ winner: "p2", reason: "resign" });
    expect(p2.finished()).toMatchObject({
      result: { winner: "p2", reason: "resign" },
    });
    // And a resigned match takes no further actions.
    p2.send({
      v: PROTOCOL_VERSION,
      type: "act",
      revision: p2.frame().observation.revision,
      actionId: p2.frame().observation.legalActions[0]?.actionId ?? "x",
    });
    expect(p2.errors().at(-1)?.code).toBe("MATCH_FINISHED");
  });

  it("answers an unparseable message without touching the match", () => {
    const { session, referee, seat } = harness();
    const p1 = seat("p1");
    // Straight at the session, the way a network delivers it: `act` with no
    // `actionId` never gets past the schema.
    deliver(session.receive({ v: "1", type: "act" }, p1.connection, 0));
    expect(p1.errors().at(-1)?.code).toBe("BAD_MESSAGE");

    // A well-formed message from a socket that never joined is refused too.
    p1.send({ v: PROTOCOL_VERSION, type: "resign" });
    expect(p1.errors().at(-1)?.code).toBe("NOT_CONNECTED");
    expect(referee.result).toBeNull();
  });

  it("restores a match from its snapshot, action for action", () => {
    const { referee, join } = harness({ seed: "pvp-seed-restore" });
    const { p1, p2 } = join();
    const seats = { p1, p2 };
    for (let step = 0; step < 30 && referee.onClock; step += 1)
      act(seats, referee, step * 1_000);

    const snapshot = referee.snapshot();
    const restored = Referee.restore(snapshot, 0, { clock: CLOCK });

    expect(restored.observe("p1").observation.stateHash).toBe(
      referee.observe("p1").observation.stateHash,
    );
    expect(restored.onClock).toBe(referee.onClock);
    expect(restored.snapshot().actions).toEqual(snapshot.actions);
  });

  it("refuses to restore a snapshot recorded under other rules", () => {
    const snapshot = harness().referee.snapshot();
    const stale = {
      ...snapshot,
      rulesStamp: { ...snapshot.rulesStamp, programHash: "0".repeat(64) },
    };
    expect(() => Referee.restore(stale, 0)).toThrow(RefereeError);
    expect(() => Referee.restore(stale, 0)).toThrow(/VERSION|rules/i);
  });

  it("rejects a deck the catalog does not accept, server-side", () => {
    const referee = new Referee({
      matchId: "m-bad",
      seed: "s",
      seats: { p1: { deckId: "not-a-deck" }, p2: { deckId: P2_DECK } },
    });
    expect(() => {
      referee.start(0);
    }).toThrow(/UNSUPPORTED_DECK/);
  });
});
