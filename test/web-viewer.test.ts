/**
 * Which seat the board is drawn from -- and therefore which Leader's colours
 * each half of the table wears.
 */
import { describe, expect, it } from "vitest";
import { boardViewer } from "../packages/web/src/viewer.js";
import type { MatchConfig } from "../packages/web/src/controller.js";

const seats = (
  p1Controller: MatchConfig["p1Controller"],
  p2Controller: MatchConfig["p2Controller"],
): Pick<MatchConfig, "p1Controller" | "p2Controller"> => ({
  p1Controller,
  p2Controller,
});

describe("boardViewer", () => {
  it("holds still on the one person's seat, whoever is playing", () => {
    expect(boardViewer(seats("human", "rules"), null, "p2")).toBe("p1");
    expect(boardViewer(seats("rules", "human"), null, "p1")).toBe("p2");
  });

  it("changes hands at the turn when both seats are a person's", () => {
    // Two people at one screen: the board belongs to whoever is playing, and
    // the mat, the hand and the colours under them all go with it.
    expect(boardViewer(seats("human", "human"), null, "p1")).toBe("p1");
    expect(boardViewer(seats("human", "human"), null, "p2")).toBe("p2");
  });

  it("follows the active player when nobody is at the table", () => {
    expect(boardViewer(seats("rules", "rules"), null, "p2")).toBe("p2");
  });

  it("takes a spectator's fixed side over everything else", () => {
    // Held rather than derived: a watched game has no seat of its own, and a
    // side that followed the active player would turn the table round every
    // turn under somebody who is only watching.
    expect(boardViewer(seats("rules", "rules"), "p1", "p2")).toBe("p1");
    expect(boardViewer(seats("human", "rules"), "p2", "p1")).toBe("p2");
  });
});
