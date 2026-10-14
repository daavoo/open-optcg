/**
 * The transport seam, and an in-memory implementation of it.
 *
 * A Durable Object's `WebSocket` and the pair of objects below satisfy the same
 * two-method interface, which is the whole point: the session layer is tested
 * over this file, and the DO adapter adds a network without adding behaviour.
 *
 * Delivery here is synchronous. A test that has to flush a queue to see a frame
 * is a test that can pass for the wrong reason, and nothing in the session layer
 * is allowed to depend on message ordering being anything other than the order
 * it sent them.
 */
import type { ClientMessage, ServerMessage } from "@one-piece-sim/protocol";

/**
 * A message, and the connection it is meant for.
 *
 * The session hands these back rather than writing to sockets, so its caller
 * decides *when* they go out. That matters for one reason: a host that stores
 * the match must store it before anyone is told a move landed, or a failed
 * write leaves two players looking at a position the server has forgotten.
 */
export interface Outbound {
  connection: Connection;
  message: ServerMessage;
  /**
   * Hang up on this connection once the message is out.
   *
   * Carried with the message rather than done by the session, so a refusal is
   * read before the socket it refuses goes away.
   */
  close?: string;
}

/** Send what a session handed back, in the order it produced it. */
export function deliver(outbound: readonly Outbound[]): void {
  for (const { connection, message, close } of outbound) {
    connection.send(message);
    if (close !== undefined) connection.close(close);
  }
}

/** One connected seat, from the server's side. */
export interface Connection {
  send(message: ServerMessage): void;
  /** `code` is a `SessionErrorCode` or a plain reason; it is not the protocol's. */
  close(code: string): void;
}

/** One connected seat, from the client's side. */
export interface ClientSocket {
  send(message: ClientMessage): void;
  /** Every server message this client has received, oldest first. */
  readonly inbox: readonly ServerMessage[];
  readonly closed: string | null;
  /** Drops the connection without telling the server -- what a lost tab looks like. */
  drop(): void;
}

export interface MemoryPair {
  connection: Connection;
  client: ClientSocket;
}

/**
 * A connected pair whose client half records what it receives.
 *
 * `deliver` is how the server side pushes into the client's inbox; `send` on the
 * client half calls back into the session. The session is passed in rather than
 * wired afterwards so a client can never send into a session that has not
 * accepted it yet.
 */
export function createMemoryPair(handlers: {
  onMessage: (raw: unknown, connection: Connection) => void;
  onClose?: (connection: Connection) => void;
}): MemoryPair {
  const inbox: ServerMessage[] = [];
  let closed: string | null = null;
  const connection: Connection = {
    send(message) {
      if (closed) return;
      inbox.push(message);
    },
    close(code) {
      if (closed) return;
      closed = code;
      handlers.onClose?.(connection);
    },
  };
  const client: ClientSocket = {
    send(message) {
      if (closed) throw new Error(`CONNECTION_CLOSED: ${closed}`);
      handlers.onMessage(message, connection);
    },
    get inbox() {
      return inbox;
    },
    get closed() {
      return closed;
    },
    drop() {
      if (closed) return;
      closed = "dropped";
      handlers.onClose?.(connection);
    },
  };
  return { connection, client };
}
