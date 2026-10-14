/**
 * The protocol version, in its own module so `session.ts` can read it without
 * importing `index.ts`.
 *
 * `index.ts` re-exports both this and `session.ts`, and an `export ... from` is
 * hoisted: were the version still declared in `index.ts`, evaluating
 * `session.ts` would reach it before its initialiser ran and fail on the
 * temporal dead zone. One line here instead of a duplicated literal there.
 */
export const PROTOCOL_VERSION = "1" as const;
