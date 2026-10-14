import { describe, expect, it } from "vitest";
import { BrowserGameController } from "../packages/web/src/controller.js";
import {
  forgetMatch,
  MATCH_IN_PROGRESS_KEY,
  rememberMatch,
  resumableMatch,
  type StorageLike,
} from "../packages/web/src/match-resume.js";

const config = {
  p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
  p2Deck: "(Yellow) Eustass Kid - Starter Deck 36",
  p1Controller: "human",
  p2Controller: "rules",
  seed: "match-resume-test",
  startingPlayer: "p1",
} as const;

/** `localStorage` without a browser: a map, plus a way to make it throw. */
function memoryStorage(
  broken = false,
): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const fail = (): never => {
    throw new Error("QuotaExceededError");
  };
  return {
    data,
    getItem: (key) => (broken ? fail() : (data.get(key) ?? null)),
    setItem: (key, value) => {
      if (broken) fail();
      data.set(key, value);
    },
    removeItem: (key) => {
      if (broken) fail();
      data.delete(key);
    },
  };
}

/** Play the opening: both keep, and the first player takes a few Main actions. */
function playedIntoTurnOne(): BrowserGameController {
  const game = new BrowserGameController(config);
  for (let step = 0; step < 6; step += 1) {
    const active = game.activeObservation;
    if (active.phase !== "mulligan" && active.phase !== "main") break;
    const keep = active.legalActions.find((action) =>
      action.actionId.endsWith(":keep"),
    );
    const play = active.legalActions.find(
      (action) => action.type === "play-card",
    );
    const next = keep ?? play;
    if (!next) break;
    game.act(next.actionId);
  }
  return game;
}

describe("the match in progress", () => {
  it("is remembered as a save that replays to the same position", () => {
    const storage = memoryStorage();
    const game = playedIntoTurnOne();
    rememberMatch(storage, game);

    const remembered = resumableMatch(storage);
    expect(remembered).not.toBeNull();
    expect(remembered!.turn).toBe(game.activeObservation.turn);
    expect(remembered!.save.actions.length).toBeGreaterThan(0);

    const resumed = BrowserGameController.load(remembered!.save);
    expect(resumed.activeObservation.stateHash).toBe(
      game.activeObservation.stateHash,
    );
    expect(resumed.activeObservation.self.hand).toEqual(
      game.activeObservation.self.hand,
    );
  });

  it("is written from the mulligan on, so even a freshly dealt game comes back", () => {
    const storage = memoryStorage();
    rememberMatch(storage, new BrowserGameController(config));
    const remembered = resumableMatch(storage);
    expect(remembered?.save.actions).toEqual([]);
    expect(remembered?.turn).toBe(1);
  });

  it("is forgotten on request, and absent when nothing was kept", () => {
    const storage = memoryStorage();
    expect(resumableMatch(storage)).toBeNull();
    rememberMatch(storage, new BrowserGameController(config));
    expect(resumableMatch(storage)).not.toBeNull();
    forgetMatch(storage);
    expect(resumableMatch(storage)).toBeNull();
    expect(storage.data.has(MATCH_IN_PROGRESS_KEY)).toBe(false);
  });

  it("treats anything it does not recognise as absent rather than throwing", () => {
    const storage = memoryStorage();
    for (const junk of [
      "not json",
      "null",
      "[]",
      JSON.stringify({ version: 2, save: {}, turn: 1 }),
      JSON.stringify({
        version: 1,
        turn: 1,
        save: { version: 1, actions: [] },
      }),
      JSON.stringify({
        version: 1,
        turn: "1",
        save: { version: 1, actions: [], config },
      }),
    ]) {
      storage.data.set(MATCH_IN_PROGRESS_KEY, junk);
      expect(resumableMatch(storage), junk).toBeNull();
    }
  });

  it("drops a puzzle attempt saved by a build that had puzzle mode", () => {
    // Its actions were taken from a constructed position this build cannot
    // set up, so offering it would replay them into an ordinary deal.
    const storage = memoryStorage();
    storage.data.set(
      MATCH_IN_PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        turn: 1,
        save: {
          version: 1,
          actions: [],
          config: { ...config, puzzleId: "rest-it-do-not-remove-it" },
        },
      }),
    );
    expect(resumableMatch(storage)).toBeNull();
  });

  it("refuses to replay a puzzle attempt rather than dealing a different game", () => {
    expect(
      () =>
        new BrowserGameController({
          ...config,
          puzzleId: "rest-it-do-not-remove-it",
        } as typeof config),
    ).toThrow(/UNKNOWN_PUZZLE/);
  });

  it("survives a storage that throws, in both directions", () => {
    const storage = memoryStorage(true);
    expect(() => {
      rememberMatch(storage, new BrowserGameController(config));
    }).not.toThrow();
    expect(() => {
      forgetMatch(storage);
    }).not.toThrow();
    expect(resumableMatch(storage)).toBeNull();
  });
});
