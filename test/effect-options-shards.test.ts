import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { copies, instance, scenario } from "./support/index.js";
import {
  EFFECT_OPTION_SHARDS,
  effectOptionPairs,
  effectOptionShard,
} from "./support/effect-option-sweep.js";

describe("effect-option sweep shards", () => {
  it("has one test file per shard", () => {
    const files = readdirSync(new URL(".", import.meta.url)).filter((name) =>
      /^effect-options-\d+\.test\.ts$/.test(name),
    );
    expect(files.sort()).toEqual(
      Array.from(
        { length: EFFECT_OPTION_SHARDS },
        (_, index) =>
          `effect-options-${String(index).padStart(2, "0")}.test.ts`,
      ),
    );
  });

  it("plays every ordered deck pair exactly once across the shards", () => {
    const played = Array.from({ length: EFFECT_OPTION_SHARDS }, (_, index) =>
      effectOptionShard(index),
    ).flat();
    expect(played.map((pair) => pair.join(" vs ")).sort()).toEqual(
      effectOptionPairs()
        .map((pair) => pair.join(" vs "))
        .sort(),
    );
  });

  // The sweep's shards each assert what they saw, and a "cost" option only
  // turns up in some of them, so the descriptor gets its own position:
  // OP11-079's [Counter] names a cost before revealing.
  it("describes a named cost as a cost option", () => {
    const game = scenario()
      .decks("FIXTURE-RED", "FIXTURE-BLUE")
      .seed("effect-options-cost")
      .atTurn(3, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("guess", "OP11-079")])
      .withDeckTop("p2", copies(1, "FIX-002", "p2-deck"))
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          attackerInstanceId: "p2-leader",
          defenderPlayerId: "p1",
          targetInstanceId: "p1-leader",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "guess" });

    expect(
      game.action({ type: "resolve-effect", optionId: "cost:2" }),
    ).toMatchObject({ option: { kind: "cost", cost: 2 } });
  });
});
