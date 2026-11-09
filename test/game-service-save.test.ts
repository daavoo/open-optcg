import { describe, expect, it } from "vitest";
import { resolveDeck, STARTER_DECK_IDS } from "@one-piece-sim/decks";
import {
  EngineError,
  GameService,
  type SavedGame,
} from "@one-piece-sim/engine-core";

/**
 * A host that checkpoints games -- to survive a restart or move a game to
 * another server -- stores `save`'s value as JSON and hands it to `restore`.
 * The resumed game must be the same game, move for move.
 */
function startedGame(seed: string, moves: number) {
  const service = new GameService();
  let view = service.create({
    p1: resolveDeck(STARTER_DECK_IDS[0]),
    p2: resolveDeck(STARTER_DECK_IDS[1]),
    seed,
  });
  for (let step = 0; step < moves; step++) {
    view = service.act(
      view.gameId,
      view.revision,
      view.legalActions[0]!.actionId,
    );
  }
  return { service, view };
}

const throughJson = (saved: SavedGame): SavedGame =>
  JSON.parse(JSON.stringify(saved)) as SavedGame;

describe("GameService save and restore", () => {
  it("resumes a game from JSON exactly where it stood", () => {
    const { service, view: before } = startedGame("save-resume", 40);
    const resumed = new GameService();
    let copy = resumed.restore(throughJson(service.save(before.gameId)));
    let original = before;
    expect(copy.stateHash).toBe(original.stateHash);

    // Both copies take the same choices to the end: every view must agree.
    for (let step = 0; original.phase !== "finished" && step < 5000; step++) {
      const choice = original.legalActions.at(-1)!.actionId;
      original = service.act(original.gameId, original.revision, choice);
      copy = resumed.act(copy.gameId, copy.revision, choice);
      expect(copy.stateHash).toBe(original.stateHash);
    }
    expect(original.phase).toBe("finished");
    expect(copy.winner).toBe(original.winner);
  });

  it("refuses a save made under different card data", () => {
    const { service, view } = startedGame("save-stale", 10);
    const saved = throughJson(service.save(view.gameId));
    saved.rules.cardDataHash = "0".repeat(64);
    const restore = () => new GameService().restore(saved);
    expect(restore).toThrow(EngineError);
    expect(restore).toThrow(/different card data/);
  });

  it("will not run one game twice, nor reuse a restored game's id", () => {
    const { service, view } = startedGame("save-ids", 5);
    const saved = throughJson(service.save(view.gameId));
    const host = new GameService();
    host.restore(saved);
    expect(() => host.restore(saved)).toThrow(/already running/);
    const next = host.create({
      p1: resolveDeck(STARTER_DECK_IDS[0]),
      p2: resolveDeck(STARTER_DECK_IDS[1]),
      seed: "after-restore",
    });
    expect(next.gameId).not.toBe(view.gameId);
  });
});
