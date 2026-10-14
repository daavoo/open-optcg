import { describe, expect, it } from "vitest";
import {
  autoBuildSealedDeck,
  sealedDeckManifest,
  sealedPoolIsBuildable,
  validateSealedDeck,
  SEALED_LEADER,
  SEALED_PACK_COUNT,
} from "@one-piece-sim/decks";
import { openSealedPool } from "../packages/web/src/sealed-mode.js";
import { BrowserGameController } from "../packages/web/src/controller.js";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import type { PlayerId } from "@one-piece-sim/protocol";

describe("openSealedPool", () => {
  it("is reproducible from its seed", () => {
    const a = openSealedPool("web-sealed-a");
    const b = openSealedPool("web-sealed-a");
    expect(a.pool.cards).toEqual(b.pool.cards);
    expect(a.packsOpened).toBe(b.packsOpened);
  });

  it("never opens fewer packs than the format's default", () => {
    const { packsOpened } = openSealedPool("web-sealed-min");
    expect(packsOpened).toBeGreaterThanOrEqual(SEALED_PACK_COUNT);
  });

  it("always returns a buildable pool", () => {
    for (const seed of ["s1", "s2", "s3"]) {
      const { pool } = openSealedPool(seed);
      expect(sealedPoolIsBuildable(pool).buildable).toBe(true);
    }
  });
});

describe("a sealed match started through the browser controller", () => {
  it("plays from two opened pools to a finished game", async () => {
    const player = openSealedPool("web-sealed-match-p1");
    const opponent = openSealedPool("web-sealed-match-p2");
    const playerDeck = autoBuildSealedDeck(player.pool);
    const opponentDeck = autoBuildSealedDeck(opponent.pool);
    expect(validateSealedDeck(playerDeck, player.pool).errors).toEqual([]);
    expect(validateSealedDeck(opponentDeck, opponent.pool).errors).toEqual([]);

    const p1 = sealedDeckManifest(playerDeck, player.pool);
    const p2 = sealedDeckManifest(opponentDeck, opponent.pool);
    const controller = new BrowserGameController({
      p1Deck: p1.id,
      p2Deck: p2.id,
      p1CustomDeck: p1,
      p2CustomDeck: p2,
      p1Controller: "rules",
      p2Controller: "rules",
      seed: "web-sealed-match",
      startingPlayer: "p1",
    });
    const agents: Record<PlayerId, RegistryRulesAgent> = {
      p1: new RegistryRulesAgent(SEALED_LEADER),
      p2: new RegistryRulesAgent(SEALED_LEADER),
    };
    let observation = controller.activeObservation;
    let actions = 0;
    while (observation.phase !== "finished" && actions < 2000) {
      const agent = agents[observation.activePlayer];
      const action = await agent.chooseAction(observation);
      observation = controller.act(action.actionId);
      actions += 1;
    }
    expect(observation.phase).toBe("finished");
    expect(observation.winner).not.toBeNull();
  });
});
