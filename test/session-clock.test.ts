import { describe, expect, it } from "vitest";
import {
  chargeAndAdvance,
  chargeExpiry,
  deadlineMs,
  hasExpired,
  matchDeadlineMs,
  nextDeadlineMs,
  outOfDecisions,
  outOfTime,
  startClock,
  type ClockRules,
  type ClockState,
} from "../packages/referee/src/clock.js";

const RULES: ClockRules = {
  bankMs: 60_000,
  delayMs: 10_000,
  expiredDecisionLimit: 3,
  matchMs: 90 * 60_000,
};

describe("match clock", () => {
  it("gives every decision a free delay before the bank is touched", () => {
    const clock = startClock(RULES, 1_000, "p1");
    expect(deadlineMs(clock)).toBe(1_000 + 10_000 + 60_000);

    // Nine seconds of thought, inside the delay: the bank does not move.
    const after = chargeAndAdvance(clock, 10_000, "p2");
    expect(after.bankMs.p1).toBe(60_000);
    expect(after.bankMs.p2).toBe(60_000);
  });

  it("charges only the time past the delay", () => {
    const clock = startClock(RULES, 0, "p1");
    const after = chargeAndAdvance(clock, 25_000, "p2");
    expect(after.bankMs.p1).toBe(60_000 - 15_000);
  });

  it("never charges the seat that was not on the clock", () => {
    let clock = startClock(RULES, 0, "p1");
    clock = chargeAndAdvance(clock, 40_000, "p2");
    clock = chargeAndAdvance(clock, 45_000, "p1");
    expect(clock.bankMs.p1).toBe(60_000 - 30_000);
    // p2's five seconds were inside its own delay.
    expect(clock.bankMs.p2).toBe(60_000);
  });

  it("expires a decision once the delay and the bank are both gone", () => {
    const clock = startClock(RULES, 0, "p1");
    expect(hasExpired(clock, 69_999)).toBe(false);
    expect(hasExpired(clock, 70_000)).toBe(true);
  });

  it("counts consecutive expiries and forgets them after a real decision", () => {
    let clock = startClock(RULES, 0, "p1");
    clock = chargeExpiry(clock, "p2");
    clock = chargeExpiry(clock, "p1");
    expect(clock.expiredDecisions).toBe(2);
    expect(outOfDecisions(clock)).toBe(false);
    expect(clock.bankMs.p1).toBe(0);

    clock = chargeAndAdvance(clock, 85_000, "p2");
    expect(clock.expiredDecisions).toBe(0);
  });

  it("runs out of decisions at the limit", () => {
    let clock = startClock(RULES, 0, "p1");
    for (let expiry = 0; expiry < 3; expiry += 1)
      clock = chargeExpiry(clock, "p1");
    expect(outOfDecisions(clock)).toBe(true);
  });

  it("does not start the match's own limit until the clock runs", () => {
    // The limit is measured from the moment both seats are here, like the
    // banks: a friend match is a link, and the time it takes somebody to open
    // it is not the match's to spend.
    const clock = startClock(RULES, 1_000, "p1");
    expect(clock.startedMs).toBeNull();
    expect(matchDeadlineMs(clock)).toBeNull();
    expect(outOfTime(clock, 10 * 60 * 60_000)).toBe(false);
    // With nothing to compare against, the host's alarm is the decision's.
    expect(nextDeadlineMs(clock)).toBe(deadlineMs(clock));
  });

  it("bounds a match whose seats never touch their banks", () => {
    // The free delay is what makes this necessary. A seat answering every
    // prompt just inside it spends nothing, and this engine stops at every
    // decision, so the banks alone bound nothing: the game runs as long as the
    // two of them like, holding an object and an alarm.
    let clock: ClockState = { ...startClock(RULES, 0, "p1"), startedMs: 0 };
    for (let decision = 0; decision < 500; decision += 1) {
      const free = clock.decisionStartedMs + 9_000;
      clock = chargeAndAdvance(clock, free, decision % 2 ? "p1" : "p2");
    }
    // Four and a half thousand seconds later, and neither bank has moved.
    expect(clock.bankMs).toEqual({ p1: 60_000, p2: 60_000 });
    expect(clock.decisionStartedMs).toBe(4_500_000);

    // The ceiling is what ends it. It is 75 minutes into that stall, and
    // nothing about the two banks says so.
    expect(matchDeadlineMs(clock)).toBe(90 * 60_000);
    expect(outOfTime(clock, 90 * 60_000)).toBe(true);

    // How the host comes to notice is the part worth stating. Its alarm is
    // whichever deadline is sooner, and while a bank is intact that is the
    // decision's -- which every action pushes forward, so the ceiling is not
    // yet what it waits for.
    expect(nextDeadlineMs(clock)).toBe(deadlineMs(clock));

    // Then, one bank's-length before the ceiling, the decision's deadline runs
    // past it and the alarm becomes the ceiling exactly. So it fires on time
    // rather than whenever the next decision happened to lapse.
    const late = { ...clock, decisionStartedMs: 89 * 60_000 };
    expect(nextDeadlineMs(late)).toBe(90 * 60_000);
  });

  it("keeps a spent bank at a delay-only deadline rather than in the past", () => {
    let clock = startClock(RULES, 0, "p1");
    clock = chargeExpiry(clock, "p1");
    // The bank is gone, so each further decision is worth exactly the delay --
    // enough for a returning client to act, not enough to stall on -- and it is
    // dated from the deadline that passed, not from when the host noticed.
    expect(clock.decisionStartedMs).toBe(70_000);
    expect(deadlineMs(clock)).toBe(70_000 + 10_000);
  });
});
