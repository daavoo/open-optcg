/**
 * The browser's side of an online match.
 *
 * `OnlineMatch` is a stand-in for `BrowserGameController`: the board screen
 * reads the same members off it and calls the same `act`. The difference is
 * that offline the board moves because `act` returned a new state, and online
 * it moves because the server sent a frame. So `act` here only sends, and
 * everything that changes the board arrives through `onChange`.
 *
 * That is not a limitation to work around. The client holds no game state --
 * it could not, since the engine needs the whole state to compute a legal move
 * and the whole state includes the opponent's hand -- so there is nothing to
 * apply optimistically and no way for the two seats to disagree.
 */
import type {
  ClientMessage,
  ClockView,
  GameObservation,
  MatchResult,
  PlayerId,
  PublicEvent,
  ServerMessage,
} from "@one-piece-sim/protocol";
import { rulesStamp, type RulesStamp } from "@one-piece-sim/engine-core";
import type {
  MatchConfig,
  MatchGame,
  MatchTrace,
  TraceCheckpoint,
} from "./controller.js";

const PROTOCOL_VERSION = "1" as const;
const SERVER_KEY = "optcg.online.server";

/**
 * Where the match server is, and whether an override was refused.
 *
 * The build says, because a page cannot work it out: a page served over https
 * from its own origin cannot tell whether a Worker stands behind it. So
 * `__MATCH_SERVER__` is `"self"` for a deploy that serves the app in front of
 * its server, an absolute origin for an app hosted apart from one, and empty
 * for a build that has no server at all -- where this returns `""` and a seat
 * link is left in the address bar rather than opened against nothing.
 *
 * `?server=` overrides it and is remembered, which is how the app talks to a
 * locally running server while being served from somewhere else -- including
 * from a build that has no server of its own.
 *
 * **Only a loopback address, and that is the whole of the check.** The override
 * is where every request goes and where the seat token is sent, so a link
 * carrying `?server=https://not-us.example` -- pasted into a chat, clicked
 * once -- would point somebody's client at a server that then sees their token
 * and can answer with any position it likes. Persisted, so one click lasts
 * until they clear site data. A local server is the only case the override
 * exists for, and a local server is `localhost`; anything else is refused and
 * *not* remembered, which also cleans out a stored override from a link
 * clicked before this check existed.
 *
 * Read twice per page rather than cached: the refusal is shown in the lobby,
 * and computing it in two places would be two answers.
 */
function chooseServer(): { origin: string; refused: string | null } {
  // No page: a test rendering the lobby's markup under Node. There is no
  // override to read and no traffic to send anywhere, which is what an empty
  // origin says -- the storage helpers below take the same view.
  if (typeof window === "undefined") return { origin: "", refused: null };
  const built =
    __MATCH_SERVER__ === "self" ? window.location.origin : __MATCH_SERVER__;
  const fromQuery = new URLSearchParams(window.location.search).get("server");
  const stored = read(SERVER_KEY);
  const candidate = fromQuery ?? stored;
  if (!candidate || candidate === built)
    return { origin: built, refused: null };
  if (!isLocalOrigin(candidate)) {
    // Refused *and* forgotten. A stored one is a link somebody already
    // clicked, and leaving it in place would keep sending them there.
    if (stored) forget(SERVER_KEY);
    return { origin: built, refused: candidate };
  }
  if (fromQuery) remember(SERVER_KEY, fromQuery);
  return { origin: candidate, refused: null };
}

export function serverOrigin(): string {
  return chooseServer().origin;
}

/**
 * Whether this build has a match server to play against at all.
 *
 * A seat link is not followed when it does not: the static site and the deploy
 * ship the same bundle, and opening a seat on the one with no Worker behind it
 * sends the player into a 404 that no message can make sensible. A loopback
 * `?server=` counts, because that is a server -- it is how the hosted page is
 * pointed at a local one.
 */
export function onlineAvailable(): boolean {
  return serverOrigin() !== "";
}

/**
 * The override this page would not use, for the lobby to say so.
 *
 * Shown rather than swallowed: somebody who typed a `?server=` is doing
 * something deliberate, and silently playing against the wrong server is the
 * one outcome worse than refusing.
 */
export function refusedServerOverride(): string | null {
  return chooseServer().refused;
}

/**
 * Whether an origin is a server on this machine.
 *
 * Hostname, not a prefix match on the string: `https://localhost.attacker.example`
 * starts with the right letters and is somebody else's server, and
 * `http://127.0.0.1.attacker.example` is the same trick with digits.
 */
function isLocalOrigin(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "[::1]" ||
    host === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
  );
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A browser with storage blocked still plays; it just forgets the override.
  }
}

function forget(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do, and nothing that depends on it.
  }
}

/**
 * The seat a player is holding, kept so a refresh or a dropped connection can
 * go back to it.
 *
 * A seat is a match id, a side and a token, and the referee already treats a
 * second socket carrying the same token as a reconnect. Without this the
 * browser forgot all three, and closing a laptop lid meant losing a match on a
 * clock that keeps running.
 */
export interface HeldSeat {
  matchId: string;
  seat: PlayerId;
  token: string;
  ownDeckId: string;
  opponentDeckId: string;
}

const SEAT_KEY = "optcg.online.seat";

export function heldSeat(): HeldSeat | null {
  const raw = read(SEAT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HeldSeat;
  } catch {
    return null;
  }
}

/**
 * Storage is a convenience, never a requirement: without it a refresh loses the
 * seat, which is exactly the situation the server's clock already covers.
 */
export function rememberSeat(seat: HeldSeat | null): void {
  if (seat === null) forget(SEAT_KEY);
  else remember(SEAT_KEY, JSON.stringify(seat));
}

/**
 * The 1v1 lobby's online slice: a match opened from a seat link, as the lobby
 * sees it while that match is not on the board.
 */
export interface OnlineState {
  /** What a seated match is doing while it is not yet drawable. */
  connecting: "connecting" | "waiting-for-opponent" | null;
  error: string | null;
  /**
   * Whether this browser is still holding a seat in a match.
   *
   * The lobby offers it back. A dropped socket does not end a match -- the
   * clock keeps running and the referee takes the token again -- so the way
   * back has to be on screen, or a bad network is a loss.
   */
  heldSeat: boolean;
}

export function initialOnlineState(serverOrigin: string): OnlineState {
  const refused = refusedServerOverride();
  return {
    connecting: null,
    error: refused
      ? `Ignoring ?server=${refused}: an override may only point at a server on this machine. Playing against ${serverOrigin} instead.`
      : null,
    heldSeat: heldSeat() !== null,
  };
}

export type OnlineStatus =
  | "connecting"
  | "reconnecting"
  | "waiting-for-opponent"
  | "playing"
  | "finished"
  | "error";

/**
 * How many times a dropped socket tries to sit back down, and how long it waits
 * between tries.
 *
 * Linear backoff up to a ceiling, so the first couple of tries land inside the
 * clock's per-decision delay -- the window where a blip costs the player
 * nothing at all -- and the rest keep going for about a minute.
 *
 * A minute rather than the fifteen seconds this was, because the server is far
 * more patient than the client was: a seat is the token's for as long as the
 * clock runs, and a second socket carrying it is a reconnect. Giving up while
 * the match is still there -- a lid closed, a train tunnel, a Worker deploy
 * dropping every socket at once -- lost a game the server would have handed
 * straight back. Giving up at all is now only the end of *automatic*
 * reconnection: the seat is still held, and re-entering the lobby resumes it.
 */
const MAX_RECONNECTS = 20;
const RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 5_000;

export interface OnlineMatchOptions {
  matchId: string;
  seat: PlayerId;
  token: string;
  ownDeckId: string;
  opponentDeckId: string;
  /** Called whenever anything the board renders has changed. */
  onChange: () => void;
}

export class OnlineMatch implements MatchGame {
  readonly viewer: PlayerId;
  readonly #options: OnlineMatchOptions;
  #socket: WebSocket | null = null;
  #observation: GameObservation | null = null;
  #clock: ClockView | null = null;
  #config: MatchConfig;
  #status: OnlineStatus = "connecting";
  #error: string | null = null;
  #result: MatchResult | null = null;
  #latestEvents: readonly PublicEvent[] = [];
  #seenEvents = 0;
  /**
   * One entry per frame that carried new events, so the match-history panel
   * works online too.
   *
   * This is not the trace the offline board can export: a seat only ever knew
   * its own half of the action list, and the events are its own projection. It
   * is the same history the player watched, which is what the panel shows.
   */
  #checkpoints: TraceCheckpoint[] = [];
  #initialEvents: readonly PublicEvent[] = [];
  /**
   * The whole action list, which arrives with the result and not before.
   *
   * Until then a seat knows only its own half, which is why `capabilities.trace`
   * is false while the match is on: a trace that cannot be replayed should not
   * be offered as one.
   */
  #actions: readonly string[] | null = null;
  #rules: RulesStamp | null = null;
  /** True between sending an action and the frame that answers it. */
  #pending = false;
  #lastActionActor: PlayerId | null = null;
  /** A refused action, waiting to be reported. Not fatal; see `#receive`. */
  #refused: string | null = null;
  #reconnects = 0;
  /** Set by `close`, so a deliberate hang-up is not treated as a drop. */
  #closing = false;
  /**
   * Whether the seat itself is gone, as opposed to the connection to it.
   *
   * The two failures look the same on screen and are not the same thing. A
   * refused token, a rules mismatch or a match the server no longer has are
   * final: there is nothing to come back to. A dropped socket is not, however
   * many times it drops -- the referee holds the seat for the token as long as
   * the clock runs -- so the lobby must keep it and offer it back. Without this
   * distinction the client threw the seat away after fifteen seconds of a bad
   * network and the player watched their clock run out in the lobby.
   */
  #seatLost = false;
  /**
   * The last position this seat sent an action for.
   *
   * The server re-sends a frame when the opponent sits down, and a reconnect is
   * answered with the current one, so the same position can arrive twice. What
   * must not happen is that such a frame clears `pending` for an action the
   * server has not answered yet.
   */
  #answered = -1;

  constructor(options: OnlineMatchOptions) {
    this.#options = options;
    this.viewer = options.seat;
    // Filled in properly from `welcome`, which carries the seed and both deck
    // ids. Until then this is enough for the board to know which seat is the
    // player's and that nothing here is an AI.
    this.#config = {
      p1Deck:
        options.seat === "p1" ? options.ownDeckId : options.opponentDeckId,
      p2Deck:
        options.seat === "p2" ? options.ownDeckId : options.opponentDeckId,
      p1Controller: options.seat === "p1" ? "human" : "online",
      p2Controller: options.seat === "p2" ? "human" : "online",
      seed: "",
      startingPlayer: "random",
    };
  }

  get config(): MatchConfig {
    return this.#config;
  }

  get status(): OnlineStatus {
    return this.#status;
  }

  get error(): string | null {
    return this.#error;
  }

  /**
   * True when this match cannot be rejoined: the seat is gone, not just the
   * socket. The lobby reads it to decide whether to keep the held seat.
   */
  get seatLost(): boolean {
    return this.#seatLost;
  }

  get result(): MatchResult | null {
    return this.#result;
  }

  get clock(): ClockView | null {
    return this.#clock;
  }

  get pending(): boolean {
    return this.#pending;
  }

  /** Who took the action the current `latestActionEvents` belong to. */
  get lastActionActor(): PlayerId | null {
    return this.#lastActionActor;
  }

  /**
   * What the offline controller offers and this cannot.
   *
   * Undo and rewind are not "unimplemented" -- they cannot exist against an
   * opponent, and the board has to hide them rather than call them and fail.
   * `trace` is the one that changes during the match: a seat only ever knew its
   * own half of the action list, so there is nothing to export until the server
   * hands the whole list over with the result.
   */
  get capabilities() {
    return {
      undo: false,
      rewind: false,
      trace: this.#actions !== null,
      ai: false,
      appliesImmediately: false,
    };
  }

  get canUndo(): boolean {
    return false;
  }

  /**
   * Whether a position has arrived.
   *
   * The board cannot be drawn before the first frame, and a seated match spends
   * a moment connecting -- and possibly much longer waiting for the opponent to
   * open their side. The lobby stays on screen until this is true.
   */
  get ready(): boolean {
    return this.#observation !== null;
  }

  get activeObservation(): GameObservation {
    if (!this.#observation)
      throw new Error("The match has not sent a position yet");
    return this.#observation;
  }

  /** Only ever this seat's view; there is no other one to give. */
  observe(playerId: PlayerId): GameObservation {
    if (playerId !== this.viewer) {
      throw new Error(`This seat cannot see ${playerId}'s side`);
    }
    return this.activeObservation;
  }

  get latestActionEvents(): readonly PublicEvent[] {
    return this.#latestEvents;
  }

  /**
   * The history this seat watched, and -- once the match is over -- the action
   * list that reproduces it.
   *
   * While the match is on, `actions` is empty and `capabilities.trace` is false:
   * a seat knows only the ids it clicked itself, and an opponent's move arrives
   * as its consequences. The server sends the whole list with the result, and
   * from that moment this is a real trace: seed, both decks, the starting
   * player and every action, which is exactly what the loader replays.
   */
  trace(): MatchTrace {
    return {
      version: 1,
      config: this.#config,
      actions: this.#actions ?? [],
      ...(this.#rules ? { rules: this.#rules } : {}),
      initialEvents: this.#initialEvents,
      checkpoints: this.#checkpoints,
    };
  }

  /** Cannot happen online; the board never offers it (`capabilities.rewind`). */
  rewindTo(): void {
    // Deliberately nothing. An opponent's game is not ours to rewind, and
    // throwing here would turn a stray click into a broken board.
  }

  connect(): void {
    const url = `${serverOrigin().replace(/^http/, "ws")}/match/${this.#options.matchId}/ws`;
    const socket = new WebSocket(url);
    this.#socket = socket;
    socket.addEventListener("open", () => {
      this.#send({
        v: PROTOCOL_VERSION,
        type: "join",
        seat: this.#options.seat,
        token: this.#options.token,
        rulesStamp: rulesStamp(),
      });
    });
    socket.addEventListener("message", (event: MessageEvent<string>) => {
      this.#receive(JSON.parse(event.data) as ServerMessage);
    });
    socket.addEventListener("close", (event: CloseEvent) => {
      // A finished match closes its own sockets, which is not a failure.
      if (this.#status === "finished" || this.#closing) return;
      // The match is gone -- finished long enough ago that its record was
      // dropped, or never dealt. Retrying cannot bring it back.
      if (event.reason === "NO_MATCH") {
        this.#status = "error";
        this.#seatLost = true;
        this.#error = "That match is over.";
        this.#options.onChange();
        return;
      }
      // Otherwise: sit back down. The server treats a second socket carrying
      // this token as the same seat, and the clock has been running the whole
      // time -- so reconnecting quietly is the only behaviour that does not cost
      // the player a game for a flaky network.
      if (this.#reconnects < MAX_RECONNECTS) {
        this.#reconnects += 1;
        this.#status = "reconnecting";
        this.#options.onChange();
        window.setTimeout(
          () => {
            this.connect();
          },
          Math.min(
            RECONNECT_DELAY_MS * this.#reconnects,
            MAX_RECONNECT_DELAY_MS,
          ),
        );
        return;
      }
      this.#status = "error";
      // Recoverable, and said so: the seat is still this client's, so the
      // lobby offers it back rather than dropping the player from the match.
      this.#error =
        this.#error ??
        "The connection to the match was lost. Your seat is still held -- rejoin to carry on.";
      this.#options.onChange();
    });
    socket.addEventListener("error", () => {
      this.#status = "error";
      this.#error = this.#error ?? "Could not reach the match server.";
      this.#options.onChange();
    });
  }

  act(actionId: string): void {
    if (!this.#observation) return;
    this.#answered = this.#observation.revision;
    this.#pending = true;
    this.#send({
      v: PROTOCOL_VERSION,
      type: "act",
      revision: this.#observation.revision,
      actionId,
    });
  }

  resign(): void {
    this.#send({ v: PROTOCOL_VERSION, type: "resign" });
  }

  close(): void {
    this.#closing = true;
    this.#socket?.close();
    this.#socket = null;
  }

  #receive(message: ServerMessage): void {
    if (message.type === "welcome") {
      // The decks and the rules build, and deliberately not the seed: it would
      // let this client deal the match locally and read the opponent's hand.
      // It arrives with the result, which is when a trace is owed.
      this.#config = {
        ...this.#config,
        p1Deck: message.opening.deckIds.p1,
        p2Deck: message.opening.deckIds.p2,
      };
      this.#rules = message.opening.rulesStamp;
      this.#options.onChange();
      return;
    }
    if (message.type === "frame") {
      this.#reconnects = 0;
      // Whoever was on the clock before this frame is who moved to produce it.
      // Only when the position actually advanced: the server re-sends the
      // current frame when the opponent sits down and after a reconnect, and
      // neither is an action anybody took.
      const previous = this.#observation;
      // A revision that went backwards is proof the server lost a write: it
      // only ever increases in a healthy match. Take the server's word and drop
      // everything this seat believed past it -- a pending action it will never
      // hear about, and the history it drew for moves that did not happen.
      if (previous && message.observation.revision < previous.revision) {
        this.#resyncTo(message.observation);
      }
      if (previous && message.observation.revision > previous.revision) {
        this.#lastActionActor = previous.activePlayer;
      } else if (!previous) {
        this.#lastActionActor = null;
      }
      this.#observation = message.observation;
      this.#clock = message.clock;
      if (message.observation.revision > this.#answered) this.#pending = false;
      // The same delta the offline controller takes: `publicEvents` is this
      // seat's whole log, so what is new is whatever it has not shown yet.
      const log = message.observation.publicEvents;
      this.#latestEvents = log.slice(this.#seenEvents);
      if (this.#seenEvents === 0) this.#initialEvents = this.#latestEvents;
      else if (this.#latestEvents.length > 0) {
        this.#checkpoints = [
          ...this.#checkpoints,
          {
            revision: message.observation.revision,
            // Unknown by construction: an opponent's move arrives as its
            // consequences, never as the id they clicked.
            actionId: "",
            turn: message.observation.turn,
            player: message.observation.activePlayer,
            stateHash: message.observation.stateHash,
            events: this.#latestEvents,
          },
        ];
      }
      this.#seenEvents = log.length;
      // A clock with no deadline means the match is still short a player.
      this.#status =
        this.#status === "finished"
          ? "finished"
          : message.clock.deadlineMs === null &&
              message.observation.revision === 0
            ? "waiting-for-opponent"
            : "playing";
      this.#options.onChange();
      return;
    }
    if (message.type === "finished") {
      this.#seatLost = true;
      this.#result = message.result;
      this.#actions = message.actions;
      // The deal, held back until the match was over. With the action list it
      // is a trace; before it, it was the opponent's hand.
      this.#config = {
        ...this.#config,
        seed: message.deal.seed,
        startingPlayer: message.deal.startingPlayer,
      };
      this.#status = "finished";
      this.#options.onChange();
      return;
    }
    // An error is about this seat's own last message, and most of them are not
    // the end of the match.
    //
    // A stale action needs no telling at all: the frame that made it stale is
    // already here or on its way. An illegal or mistimed one is a click the
    // server was right to refuse -- a double-click, a button from a position
    // that has moved -- and the match is untouched, so ejecting the player to
    // the lobby over it would turn a harmless misclick into a lost game. Only
    // the two that make playing impossible are fatal.
    if (message.code === "STALE_ACTION") {
      this.#pending = false;
      this.#options.onChange();
      return;
    }
    this.#pending = false;
    if (message.code === "VERSION_MISMATCH") {
      this.#seatLost = true;
      this.#error =
        "This page is running different card rules than the server. Reload to get the current build.";
      this.#status = "error";
      this.#options.onChange();
      return;
    }
    if (message.code === "BAD_TOKEN" || message.code === "NOT_CONNECTED") {
      this.#seatLost = true;
      this.#error = message.message;
      this.#status = "error";
      this.#options.onChange();
      return;
    }
    this.#refused = message.message;
    this.#options.onChange();
  }

  /**
   * Roll this seat back onto the position the server actually holds.
   *
   * The board itself needs no repair -- the frame carries the whole position --
   * so this is about everything the client kept alongside it: the action it is
   * waiting on, and the log and checkpoints it built past this revision. The
   * player is told, because a board that jumps backwards with no explanation is
   * worse than one that says why.
   */
  #resyncTo(observation: GameObservation): void {
    this.#pending = false;
    this.#answered = -1;
    this.#lastActionActor = null;
    this.#checkpoints = this.#checkpoints.filter(
      (checkpoint) => checkpoint.revision <= observation.revision,
    );
    // `publicEvents` is cumulative, so the server's copy is the truth about how
    // much of the log this seat has legitimately seen.
    this.#seenEvents = observation.publicEvents.length;
    this.#refused =
      "The server did not record the last move. The board is back to the position it holds.";
  }

  /**
   * The last refusal, taken once.
   *
   * Read-and-clear because it is a thing to say to the player now, not state to
   * render forever: the board it belongs to is already correct.
   */
  takeRefusal(): string | null {
    const refused = this.#refused;
    this.#refused = null;
    return refused;
  }

  #send(message: ClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN)
      this.#socket.send(JSON.stringify(message));
  }
}
