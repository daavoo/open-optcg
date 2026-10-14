import { describe, expect, it } from "vitest";
import { ACTION_HANDLERS } from "../packages/engine-core/src/actions/index.js";

/**
 * The table's completeness is a type error when it is wrong, so this is the
 * cheaper half: that the eleven action types are exactly the ones the engine
 * offers, and that none of them is accidentally left undefined by a bad merge.
 */
const ACTION_TYPES = [
  "mulligan-decision",
  "play-card",
  "resolve-effect",
  "attach-don",
  "activate-main",
  "attack",
  "block",
  "counter",
  "activate-counter-event",
  "resolve-trigger",
  "pass",
] as const;

describe("action dispatch table", () => {
  it("has a handler for every action type and nothing else", () => {
    expect(Object.keys(ACTION_HANDLERS).sort()).toEqual(
      [...ACTION_TYPES].sort(),
    );
    for (const type of ACTION_TYPES) {
      expect(typeof ACTION_HANDLERS[type]).toBe("function");
    }
  });
});
