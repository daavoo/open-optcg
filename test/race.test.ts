import { describe, expect, it } from "vitest";
import type { GameObservation } from "@one-piece-sim/protocol";
import { race } from "@one-piece-sim/agents/local";

/**
 * `race()` reads a handful of fields off the observation and nothing else, so it
 * is tested directly rather than through a game. Every rule in the strategy layer
 * gates on it, which makes these the cheapest tests in the package and the ones
 * most worth having: an arithmetic slip here is a silent gear-change failure in
 * every archetype at once.
 */

type Side = GameObservation["self"];

function side(options: {
  life: number;
  leaderPower?: number;
  board?: { power: number; blocker?: boolean }[];
}): Side {
  return {
    leader: { currentPower: options.leaderPower ?? 5_000 },
    lifeCount: options.life,
    board: (options.board ?? []).map((card, index) => ({
      instanceId: `c${index}`,
      currentPower: card.power,
      blocker: card.blocker ?? false,
    })),
  } as unknown as Side;
}

function observation(self: Side, opponent: Side): GameObservation {
  return { self, opponent } as unknown as GameObservation;
}

describe("race", () => {
  it("needs one more hit than the opponent has Life", () => {
    // 0 Life is not a loss; a hit *at* 0 Life is. So a 3-Life opponent needs
    // four connected hits, and a Leader alone takes four turns to do it.
    const result = race(observation(side({ life: 3 }), side({ life: 3 })));
    expect(result.ownClock).toBe(4);
    expect(result.opponentClock).toBe(4);
  });

  it("counts only Characters that already out-power the defending Leader", () => {
    const result = race(
      observation(
        side({
          life: 5,
          board: [{ power: 5_000 }, { power: 4_000 }, { power: 6_000 }],
        }),
        side({ life: 5, leaderPower: 5_000 }),
      ),
    );
    // The 5000 and the 6000 count -- the attacker wins ties -- and the 4000 does
    // not. Leader plus two is three hits a turn against six needed.
    expect(result.ownHitsPerTurn).toBe(3);
    expect(result.ownClock).toBe(2);
  });

  it("subtracts the defender's Blockers, because a Blocker absorbs a hit", () => {
    const withoutBlocker = race(
      observation(
        side({ life: 5, board: [{ power: 6_000 }] }),
        side({ life: 5 }),
      ),
    );
    const withBlocker = race(
      observation(
        side({ life: 5, board: [{ power: 6_000 }] }),
        side({ life: 5, board: [{ power: 1_000, blocker: true }] }),
      ),
    );
    expect(withoutBlocker.ownHitsPerTurn).toBe(2);
    expect(withBlocker.ownHitsPerTurn).toBe(1);
  });

  it("reports an infinite clock when nothing can beat the defending Leader", () => {
    // A real state, not an error: a board of small bodies against a big Leader
    // has no clock at all. Note the Leader itself is always counted as able to
    // attack, so this needs the defender's Blockers to cancel it out.
    const result = race(
      observation(
        side({ life: 5, board: [{ power: 2_000 }] }),
        side({
          life: 5,
          leaderPower: 6_000,
          board: [{ power: 1_000, blocker: true }],
        }),
      ),
    );
    expect(result.ownHitsPerTurn).toBe(0);
    expect(result.ownClock).toBe(Number.POSITIVE_INFINITY);
  });

  it("treats an equal clock as being the beatdown", () => {
    // The viewer is the active player when a main-phase rule reads this, so on an
    // equal clock they get there first. The boundary is load-bearing: it decides
    // whether a deck presses or stabilises in the most common position there is.
    const result = race(observation(side({ life: 4 }), side({ life: 4 })));
    expect(result.tempoMargin).toBe(0);
    expect(result.role).toBe("beatdown");
    expect(result.mustStabilise).toBe(false);
  });

  it("flips role to control once the opponent is strictly faster", () => {
    const result = race(
      observation(
        side({ life: 2 }),
        side({ life: 5, board: [{ power: 7_000 }, { power: 7_000 }] }),
      ),
    );
    expect(result.role).toBe("control");
    expect(result.tempoMargin).toBeLessThan(0);
  });

  it("holds off abandoning the race until past the margin", () => {
    // Own clock 6 (5 Life + 1, one hit a turn), opponent clock 5. One turn behind
    // is inside the noise of two optimistic bounds, so the race is not yet lost.
    const oneBehind = observation(side({ life: 4 }), side({ life: 5 }));
    expect(race(oneBehind).tempoMargin).toBe(-1);
    expect(race(oneBehind).mustStabilise).toBe(false);
    // With a margin of 0 the same position abandons, which is what a profile
    // overriding `raceAbandonMargin` is asking for.
    expect(race(oneBehind, 0).mustStabilise).toBe(true);
  });

  it("abandons the race two clocks behind", () => {
    const result = race(
      observation(
        side({ life: 1 }),
        side({ life: 5, board: [{ power: 8_000 }] }),
      ),
    );
    expect(result.mustStabilise).toBe(true);
  });
});
