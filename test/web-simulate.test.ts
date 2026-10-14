/**
 * The pure half of watching two agents play: which matches are simulations,
 * what one starts as, and the pace ring the one control cycles.
 */
import { describe, expect, it } from "vitest";
import {
  beginSimulation,
  DEFAULT_SIMULATION_PACE_MS,
  isSimulation,
  nextPaceMs,
  paceLabel,
  SIMULATION_PACES,
} from "../packages/web/src/simulate.js";
import type { MatchConfig } from "../packages/web/src/controller.js";

const base: MatchConfig = {
  p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
  p2Deck: "(Yellow) Eustass Kid - Starter Deck 36",
  p1Controller: "rules",
  p2Controller: "rules",
  seed: "web-simulate-test",
  startingPlayer: "p1",
};

describe("isSimulation", () => {
  it("is a simulation when an agent sits in both seats", () => {
    expect(isSimulation(base)).toBe(true);
    expect(isSimulation({ ...base, p2Controller: "llm" })).toBe(true);
  });

  it("is not a simulation while anyone at the table is playing", () => {
    expect(isSimulation({ ...base, p1Controller: "human" })).toBe(false);
    expect(isSimulation({ ...base, p2Controller: "human" })).toBe(false);
  });

  it("is not a simulation when a seat is a person over the network", () => {
    // The referee's match is somebody's game, whatever this page would rather
    // be doing with the board; pacing it here would pace it for them.
    expect(
      isSimulation({ ...base, p1Controller: "human", p2Controller: "online" }),
    ).toBe(false);
  });
});

describe("beginSimulation", () => {
  it("starts on p1's side, playing, at the slowest beat", () => {
    expect(beginSimulation(base)).toEqual({
      viewer: "p1",
      playing: true,
      paceMs: DEFAULT_SIMULATION_PACE_MS,
    });
    expect(DEFAULT_SIMULATION_PACE_MS).toBe(
      Math.max(...SIMULATION_PACES.map((pace) => pace.ms)),
    );
  });

  it("is nothing at all for a match somebody is playing", () => {
    expect(beginSimulation({ ...base, p1Controller: "human" })).toBeNull();
  });
});

describe("the pace control", () => {
  it("offers no beat so fast the board cannot be read or stopped", () => {
    // Every beat leaves a gap between one action landing and the next being
    // asked for. A zero would repaint the board continuously, which is a board
    // whose cards cannot be read and whose Pause cannot be pressed.
    for (const pace of SIMULATION_PACES) expect(pace.ms).toBeGreaterThan(0);
  });

  it("cycles every beat and comes back to the one it started on", () => {
    const visited = [DEFAULT_SIMULATION_PACE_MS];
    for (let step = 0; step < SIMULATION_PACES.length; step += 1) {
      visited.push(nextPaceMs(visited.at(-1)!));
    }
    expect(new Set(visited.slice(0, -1)).size).toBe(SIMULATION_PACES.length);
    expect(visited.at(-1)).toBe(DEFAULT_SIMULATION_PACE_MS);
  });

  it("labels every beat, and falls back rather than printing nothing", () => {
    for (const pace of SIMULATION_PACES) {
      expect(paceLabel(pace.ms)).toBe(pace.label);
    }
    expect(paceLabel(12345)).toBe(SIMULATION_PACES[0]!.label);
  });
});
