/**
 * Run the match server locally, and optionally play a whole match over it.
 *
 * The unit tests prove the session layer's rules and the Miniflare test proves
 * the platform pieces work, but neither is something a person can watch. This
 * is: it boots the real Worker bundle in the real Workers runtime on a real
 * port, builds a match, and drives one or both seats over real WebSockets with
 * the same rules agents the offline game uses.
 *
 *   pnpm referee:local --app            serve the browser app and the API together
 *   pnpm referee:local                  serve, print a link per seat, stay up
 *   pnpm referee:local --play           pilot both seats with agents, print the match
 *   pnpm referee:local --play --me p1   play p1 yourself, in this terminal
 *   pnpm referee:local --play --open p1 pilot p2 only, leaving p1's link unused
 *
 * Miniflare rather than `wrangler dev` because `miniflare` is already the test
 * dependency and this needs no account, no login and no network. `wrangler dev`
 * works too, against `packages/referee/wrangler.toml`, for anyone who has it.
 *
 * Deliberately outside the Worker: the agents live in this process, not in the
 * bundle. A server-side bot belongs behind a queue-triggered Worker of its own,
 * and nothing here should make the deploy carry an LLM client.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Agent } from "@one-piece-sim/agents/local";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type GameObservation,
  type PlayerId,
  type ServerMessage,
} from "@one-piece-sim/protocol";
import { rulesStamp } from "@one-piece-sim/engine-core";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import {
  chooseHumanAction,
  type Prompt,
} from "../packages/cli/src/human-seat.js";
import {
  serveMatchWorker,
  type CreatedMatch,
  type LocalServer,
} from "./match-server.js";

// Re-exported so a caller that wants both a server and an agent to sit at it
// has one import. The server itself lives in `match-server.ts`; see there.
export { serveMatchWorker, type CreatedMatch, type LocalServer };

/**
 * A person, behind the same one-method interface an agent is behind.
 *
 * The seat does not know which it is talking to, which is the point: what a
 * human is shown online is `observe()`'s output and the legal actions that came
 * with it, exactly what the offline client shows, and exactly what an agent
 * gets. A seat that could see more would be a different game.
 */
export function humanPilot(
  labels: Record<PlayerId, string>,
  prompt: Prompt,
): Agent {
  return {
    async chooseAction(observation) {
      let chosen;
      try {
        chosen = await chooseHumanAction(observation, prompt, labels);
      } catch (error) {
        // A closed input -- Ctrl-D, or a pipe that ran out -- is a person
        // leaving, not a crash. Offline that ends the process and nothing is at
        // stake; online there is an opponent and a running clock, so it has to
        // become a decision, and the only honest one is to resign.
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ERR_USE_AFTER_CLOSE"
        ) {
          throw new QuitSeat();
        }
        throw error;
      }
      // `null` is the client's "I am done" -- the offline loop quits on it. Over
      // a network the honest equivalent is resigning, so say so rather than
      // silently stalling on a clock that is running.
      if (!chosen) throw new QuitSeat();
      return chosen;
    },
  };
}

/** Thrown by a human seat that chose to quit rather than to move. */
export class QuitSeat extends Error {
  constructor() {
    super("SEAT_QUIT");
    this.name = "QuitSeat";
  }
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const DEFAULT_P2 = "(Green) Roronoa Zoro - Starter Deck 32";

export interface SeatTranscript {
  turn: number;
  seat: PlayerId;
  actionId: string;
  summary: string;
}

export interface PlayedMatch {
  transcript: SeatTranscript[];
  result: { winner: PlayerId | null; reason: string } | null;
  /**
   * The whole action list, as the server hands it over with the result.
   *
   * Not the same thing as `transcript`, which is what these agents chose: this
   * includes the passes the clock played for an absent seat, and it is what a
   * client actually receives -- so a test can replay a finished online match
   * from exactly what a player was given.
   */
  actions: readonly string[];
  /**
   * Everything needed to replay the match, as a client is given it.
   *
   * Two messages' worth, because the server splits it deliberately: `welcome`
   * names the decks and the rules build while the match is live, and the seed
   * and starting player arrive with `finished` -- delivered any earlier they
   * would be the opponent's hand. Assembled here so a caller sees what a
   * client ends up holding.
   */
  opening:
    | (Extract<ServerMessage, { type: "welcome" }>["opening"] &
        Extract<ServerMessage, { type: "finished" }>["deal"])
    | null;
  /** The state hash of the last position either seat was shown. */
  finalStateHash: string | null;
}

/**
 * Sit an agent at each named seat and play until the match ends.
 *
 * One socket per seat, exactly as two browsers would be, so what this exercises
 * is the wire and not a shortcut through it: the agent is handed the frame the
 * server sent, which is `observe()`'s output and nothing more.
 */
export async function playMatch(
  server: LocalServer,
  match: CreatedMatch,
  options: {
    agents: Partial<Record<PlayerId, Agent>>;
    onAction?: (entry: SeatTranscript) => void;
    /** A stop so a wedged match fails instead of hanging a CI job. */
    maxActions?: number;
  },
): Promise<PlayedMatch> {
  const transcript: SeatTranscript[] = [];
  const maxActions = options.maxActions ?? 2_000;
  const seats = Object.keys(options.agents) as PlayerId[];

  return new Promise<PlayedMatch>((resolve, reject) => {
    const sockets = new Map<PlayerId, WebSocket>();
    /**
     * The last position each seat has answered.
     *
     * A seat can be sent the same position twice -- the server re-sends a frame
     * when the other seat sits down, so the player who arrived first learns the
     * match is live. Answering it twice sends the same action twice, and the
     * second one arrives after the decision has moved on. Any client needs this
     * guard; a person has it for free, because their board just redraws.
     */
    const answered = new Map<PlayerId, number>();
    let settled = false;
    let welcomed:
      Extract<ServerMessage, { type: "welcome" }>["opening"] | null = null;
    let opening: PlayedMatch["opening"] = null;
    let finalStateHash: string | null = null;
    const finish = (
      result: PlayedMatch["result"],
      actions: readonly string[] = [],
    ) => {
      if (settled) return;
      settled = true;
      for (const socket of sockets.values()) socket.close();
      resolve({ transcript, result, actions, opening, finalStateHash });
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      for (const socket of sockets.values()) socket.close();
      reject(error);
    };

    for (const seat of seats) {
      const socket = new WebSocket(
        `${server.origin.replace(/^http/, "ws")}/match/${match.matchId}/ws`,
      );
      sockets.set(seat, socket);
      socket.addEventListener("open", () => {
        send(socket, {
          v: PROTOCOL_VERSION,
          type: "join",
          seat,
          token: match.seats[seat].token,
          rulesStamp: rulesStamp(),
        });
      });
      socket.addEventListener("error", () => {
        fail(new Error(`SOCKET_ERROR: ${seat}`));
      });
      socket.addEventListener("message", (event: MessageEvent) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === "welcome") {
          welcomed = message.opening;
          return;
        }
        if (message.type === "finished") {
          // The deal completes what `welcome` started; only now is there a
          // trace to hand back.
          if (welcomed) opening = { ...welcomed, ...message.deal };
          finish(message.result, message.actions);
          return;
        }
        if (message.type === "error") {
          fail(new Error(`${message.code}: ${message.message}`));
          return;
        }
        // Everything else the server sends is a frame.
        const observation = message.observation;
        finalStateHash = observation.stateHash;
        // Every seat is sent every frame; only the one being asked to decide
        // answers. `activePlayer` is whose decision it is, not whose turn.
        if (observation.activePlayer !== seat) return;
        if ((answered.get(seat) ?? -1) >= observation.revision) return;
        // The last frame of a match still names an active player, and the
        // `finished` message that explains it comes after -- a broadcast sends
        // both seats their frame first. Any client that answered this frame
        // would be asking an agent to choose from nothing.
        if (
          observation.phase === "finished" ||
          observation.legalActions.length === 0
        )
          return;
        if (transcript.length >= maxActions) {
          fail(new Error(`MATCH_DID_NOT_END within ${maxActions} actions`));
          return;
        }
        void decide(options.agents[seat]!, observation)
          .then((entry) => {
            if (settled) return;
            transcript.push(entry);
            answered.set(seat, observation.revision);
            options.onAction?.(entry);
            send(socket, {
              v: PROTOCOL_VERSION,
              type: "act",
              revision: observation.revision,
              actionId: entry.actionId,
            });
          })
          .catch((error: unknown) => {
            if (error instanceof QuitSeat) {
              send(socket, { v: PROTOCOL_VERSION, type: "resign" });
              return;
            }
            fail(error instanceof Error ? error : new Error(String(error)));
          });
      });
    }
  });
}

async function decide(
  agent: Agent,
  observation: GameObservation,
): Promise<SeatTranscript> {
  const chosen = await agent.chooseAction(observation);
  const legal = observation.legalActions.find(
    (action) => action.actionId === chosen.actionId,
  );
  return {
    turn: observation.turn,
    seat: observation.viewer,
    actionId: chosen.actionId,
    summary: legal?.summary ?? chosen.actionId,
  };
}

function send(socket: WebSocket, message: ClientMessage): void {
  socket.send(JSON.stringify(message));
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p1Deck = flag("p1") ?? DEFAULT_P1;
  const p2Deck = flag("p2") ?? DEFAULT_P2;
  const port = Number(flag("port") ?? 8787);
  const open = flag("open") as PlayerId | undefined;
  const me = flag("me") as PlayerId | undefined;
  // `--me` implies playing: nobody asks for a seat and then wants a bare server.
  const shouldPlay = process.argv.includes("--play") || me !== undefined;

  // `--app` serves the browser client from the same origin as the API, which is
  // what the deploy does and what lets the two seat links open in a browser
  // with nothing configured. Built beforehand by `pnpm web:build:server`.
  const withApp = process.argv.includes("--app");
  const appDirectory = join(repoRoot, "dist/pages");
  if (withApp && !existsSync(join(appDirectory, "index.html"))) {
    process.stderr.write(
      `No app build at ${appDirectory}. Run \`pnpm web:build:server\` first.\n`,
    );
    process.exit(1);
  }
  const server = await serveMatchWorker({
    port,
    ...(withApp ? { appDirectory } : {}),
  });

  const match = await server.createMatch({
    p1Deck,
    p2Deck,
    ...(flag("seed") ? { seed: flag("seed")! } : {}),
    startingPlayer: "p1",
  });
  if (withApp) process.stdout.write(`app           ${server.origin}\n`);
  process.stdout.write(`match server  ${server.origin}\n`);
  process.stdout.write(`match id      ${match.matchId}\n`);
  for (const seat of ["p1", "p2"] as const) {
    const deck = seat === "p1" ? p1Deck : p2Deck;
    process.stdout.write(`${seat}  ${deck}\n    ${match.seats[seat].url}\n`);
  }

  if (!shouldPlay) {
    process.stdout.write(
      withApp
        ? `\nOpen the two seat links above in two windows -- the same match, one\n` +
            `seat each, with the decks already chosen.\n\n` +
            `Ctrl-C to stop.\n`
        : `\nNo app is being served (pass --app for that). A seat joins over\n` +
            `ws://…/match/${match.matchId}/ws and sends\n` +
            `{"v":"1","type":"join","seat":"p1","token":"…","rulesStamp":…}.\n` +
            `Ctrl-C to stop.\n`,
    );
  } else {
    // `--me p1` puts a person at that seat; `--open p1` leaves it connected to
    // nothing, so the server can be poked at by hand without playing solitaire.
    const labels: Record<PlayerId, string> = { p1: p1Deck, p2: p2Deck };
    const prompt = me ? createInterface({ input, output }) : undefined;
    const agents = (["p1", "p2"] as const)
      .filter((seat) => seat !== open)
      .reduce<Partial<Record<PlayerId, Agent>>>((all, seat) => {
        all[seat] =
          seat === me && prompt
            ? humanPilot(labels, prompt)
            : createRulesAgent(seat === "p1" ? p1Deck : p2Deck);
        return all;
      }, {});
    process.stdout.write(
      me
        ? `\nYou are ${me}. The other seat is the rules agent; both go over the wire.\n`
        : `\nPiloting ${Object.keys(agents).join(" and ")} with the rules agents.\n\n`,
    );
    const played = await playMatch(server, match, {
      agents,
      onAction: (entry) => {
        // A person is already looking at their own board and menu, so echoing
        // their own choice back at them is noise. The opponent's move is not.
        if (entry.seat === me) return;
        process.stdout.write(
          `t${String(entry.turn).padStart(2)} ${entry.seat}  ${entry.summary}\n`,
        );
      },
    });
    process.stdout.write(
      `\n${played.transcript.length} actions. ` +
        `${played.result?.winner ?? "nobody"} wins (${played.result?.reason ?? "unfinished"}).\n`,
    );
    prompt?.close();
    await server.stop();
  }
}
