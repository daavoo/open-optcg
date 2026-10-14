/**
 * A whole match, played by two agents over two real WebSockets against the real
 * Workers runtime.
 *
 * The other session tests each hold something still: the referee tests drive the
 * session directly, and the Miniflare test plays six actions to prove the
 * platform pieces work. This one is the end-to-end -- server on a port, a socket
 * per seat, a rules agent behind each, played to a winner -- and it is the same
 * code path `pnpm referee:local --play` gives a person to watch.
 *
 * It is also the only test that can catch a class of bug the others cannot see:
 * anything that depends on a message *sequence* over a real connection rather
 * than on one call's return value. It found one -- the last frame of a match
 * still names an active player, and arrives before the `finished` that explains
 * it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserGameController } from "../packages/web/src/controller.js";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import type { Prompt } from "../packages/cli/src/human-seat.js";
import {
  humanPilot,
  playMatch,
  serveMatchWorker,
  type LocalServer,
} from "../tools/referee-local.js";

const P1_DECK = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2_DECK = "(Green) Roronoa Zoro - Starter Deck 32";

let server: LocalServer;

beforeAll(async () => {
  // Port 0: the suite must not race a person who happens to be running
  // `pnpm referee:local` on 8787.
  server = await serveMatchWorker({ port: 0 });
}, 120_000);

afterAll(async () => {
  await server.stop();
});

describe("a match played over the local server", () => {
  it("runs from the deal to a winner, with both seats piloted over sockets", async () => {
    const match = await server.createMatch({
      p1Deck: P1_DECK,
      p2Deck: P2_DECK,
      seed: "local-play-1",
      startingPlayer: "p1",
    });

    const played = await playMatch(server, match, {
      agents: { p1: createRulesAgent(P1_DECK), p2: createRulesAgent(P2_DECK) },
    });

    expect(played.result?.winner).not.toBeNull();
    // The engine's own reasons; a timeout here would mean the clock ran during a
    // match nobody was slow in.
    expect(played.result?.reason).toBe("life");
    // A real match, not a handful of passes: both seats made decisions, and the
    // mulligan is the first of them.
    expect(played.transcript.length).toBeGreaterThan(50);
    expect(played.transcript[0]).toMatchObject({ turn: 1, seat: "p1" });
    expect(new Set(played.transcript.map((entry) => entry.seat))).toEqual(
      new Set(["p1", "p2"]),
    );
  }, 60_000);

  it("hands the players a trace of the match they just played", async () => {
    // The server keeps nothing: a finished record is dropped minutes later, so
    // the only copy of an online match is the one the seats are given with the
    // result. This is the whole of that claim -- that what a client receives is
    // enough to replay the game it just played, without the server archiving
    // anything.
    const match = await server.createMatch({
      p1Deck: P1_DECK,
      p2Deck: P2_DECK,
      seed: "local-play-trace",
      startingPlayer: "p1",
    });
    const played = await playMatch(server, match, {
      agents: { p1: createRulesAgent(P1_DECK), p2: createRulesAgent(P2_DECK) },
    });

    // Nobody timed out, so the list the server hands over is exactly what the
    // two seats chose -- no more, and nothing missing.
    expect(played.actions).toEqual(
      played.transcript.map((entry) => entry.actionId),
    );
    const opening = played.opening!;
    // Exactly the trace the browser writes for an online match: the opening
    // from `welcome`, the action list from `finished`, loaded by the same
    // loader that reads a file dropped on the lobby.
    const replayed = BrowserGameController.load({
      version: 1,
      config: {
        p1Deck: opening.deckIds.p1,
        p2Deck: opening.deckIds.p2,
        p1Controller: "human",
        p2Controller: "online",
        seed: opening.seed,
        startingPlayer: opening.startingPlayer,
      },
      actions: played.actions,
      rules: opening.rulesStamp,
    });

    // The same position the players were looking at when it ended.
    expect(replayed.activeObservation.stateHash).toBe(played.finalStateHash);
    expect(replayed.activeObservation.winner).toBe(played.result?.winner);
  }, 60_000);

  it("is reproducible from its seed, and a different seed is a different match", async () => {
    const agents = () => ({
      p1: createRulesAgent(P1_DECK),
      p2: createRulesAgent(P2_DECK),
    });
    const play = async (seed: string) => {
      const match = await server.createMatch({
        p1Deck: P1_DECK,
        p2Deck: P2_DECK,
        seed,
        startingPlayer: "p1",
      });
      return playMatch(server, match, { agents: agents() });
    };

    const [first, second, other] = await Promise.all([
      play("local-play-2"),
      play("local-play-2"),
      play("local-play-3"),
    ]);

    // The seed is the server's and the agents are deterministic, so the same seed
    // is the same game -- which is what makes a reported online match
    // reproducible from `snapshot()` at all.
    expect(second.transcript.map((entry) => entry.actionId)).toEqual(
      first.transcript.map((entry) => entry.actionId),
    );
    expect(second.result).toEqual(first.result);
    expect(other.transcript.map((entry) => entry.actionId)).not.toEqual(
      first.transcript.map((entry) => entry.actionId),
    );
  }, 90_000);

  it("lets a person hold a seat, over the same wire as the agent", async () => {
    // A scripted person: the same `humanPilot` the terminal uses, reading from a
    // prompt that answers "1" -- always the first legal action. It exercises the
    // path a real player takes, with none of the waiting, and it needs no TTY.
    const answers: string[] = [];
    const prompt = {
      question: (query: string) => {
        answers.push(query);
        return Promise.resolve("1");
      },
    } as unknown as Prompt;

    const match = await server.createMatch({
      p1Deck: P1_DECK,
      p2Deck: P2_DECK,
      seed: "local-play-human",
      startingPlayer: "p1",
    });
    const played = await playMatch(server, match, {
      agents: {
        p1: humanPilot({ p1: P1_DECK, p2: P2_DECK }, prompt),
        p2: createRulesAgent(P2_DECK),
      },
    });

    expect(played.result?.winner).not.toBeNull();
    // The person was actually asked, once per decision of theirs.
    expect(answers.length).toBe(
      played.transcript.filter((entry) => entry.seat === "p1").length,
    );
    expect(answers[0]).toContain("Choose an action");
  }, 60_000);

  it("resigns for a seat whose person walks away", async () => {
    // A prompt that has already closed, which is what Ctrl-D or an exhausted
    // pipe looks like. The match must end in a resignation rather than in a
    // stack trace or a seat silently burning its clock.
    const prompt = {
      question: () => {
        const error = new Error("readline was closed") as Error & {
          code: string;
        };
        error.code = "ERR_USE_AFTER_CLOSE";
        return Promise.reject(error);
      },
    } as unknown as Prompt;

    const match = await server.createMatch({
      p1Deck: P1_DECK,
      p2Deck: P2_DECK,
      seed: "local-play-quit",
      startingPlayer: "p1",
    });
    const played = await playMatch(server, match, {
      agents: {
        p1: humanPilot({ p1: P1_DECK, p2: P2_DECK }, prompt),
        p2: createRulesAgent(P2_DECK),
      },
    });

    expect(played.result).toEqual({ winner: "p2", reason: "resign" });
    expect(played.transcript).toEqual([]);
  }, 60_000);
});
