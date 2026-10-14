/**
 * The Cloudflare surface, declared structurally.
 *
 * These are the handful of methods the adapter in `durable-object.ts` actually
 * uses, written out rather than imported from `@cloudflare/workers-types`. Two
 * reasons: the session layer's test suite is not allowed to depend on
 * Cloudflare, and a hand-written list of what we use is a readable statement of
 * how much of the platform this design is standing on -- five methods and an
 * alarm. A fake in a test satisfies these types; so does the real runtime.
 */

/** A hibernatable WebSocket, as `DurableObjectState.acceptWebSocket` returns it. */
export interface HibernatableSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  /**
   * Which seat this socket belongs to, surviving eviction.
   *
   * The attachment is the only thing that does. A revived object gets its live
   * sockets back from `getWebSockets()` with no idea who is on them, so the seat
   * is written here at join time rather than kept in a map that hibernation
   * throws away.
   */
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

export interface AlarmStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
  getAlarm(): Promise<number | null>;
  /** Drops everything this object stored. Used when a finished match ages out. */
  deleteAll(): Promise<void>;
}

export interface MatchObjectState {
  storage: AlarmStorage;
  acceptWebSocket(socket: HibernatableSocket): void;
  getWebSockets(): HibernatableSocket[];
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}
