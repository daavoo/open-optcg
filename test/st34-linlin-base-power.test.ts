import { describe, expect, it } from "vitest";
import { currentPower, observe } from "@one-piece-sim/engine-core";
import type { PublicEvent } from "@one-piece-sim/protocol";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * ST34-004 Charlotte Linlin's "up to 1 of your opponent's Characters' base
 * power becomes 0 during this turn" is a base-power setter. A modifier of minus
 * the printed power lands on the same current power for a bare target, so these
 * pin the three places the two part ways: the base the board reports, a higher
 * setter already on the card (rule 4-9-2-1: the highest one applies), and a
 * swap that hands the base on.
 */

const LINLIN_DECK = "(Purple) Charlotte Katakuri - Starter Deck 34";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: Game) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Play Linlin from `p2`'s hand, trash `discard`, and zero `target`. */
function linlinZeroes(game: Game, target: string) {
  game.play({ type: "play-card", cardNumber: "ST34-004" });
  game.play({ type: "resolve-effect", optionId: "discard" });
  game.play({ type: "resolve-effect", optionId: target });
  settle(game);
}

function lastBasePowerSet(
  game: Game,
): Extract<PublicEvent, { type: "base-power-set" }> | undefined {
  return game.state.events
    .filter(
      (event): event is Extract<PublicEvent, { type: "base-power-set" }> =>
        event.type === "base-power-set",
    )
    .at(-1);
}

/** p2 on ST34, in its own Main Phase with all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(OPPONENT, LINLIN_DECK)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withHand("p2", [
      instance("linlin", "ST34-004"),
      instance("discard", "ST34-005"),
    ])
    .withDeckTop("p2", copies(3, "ST34-003", "p2-deck"))
    .withDeckTop("p1", copies(3, "ST31-003", "p1-deck"));

describe("ST34-004 Charlotte Linlin sets base power to 0", () => {
  covers("ST34-004", "[On Play]");

  it("leaves the target at base power 0 and power 0, for this turn only", () => {
    const game = table("st34-004-base-zero")
      .withBoard("p1", [character("target", "ST31-003")])
      .build();
    const printed = currentPower(game.state, "p1", "target");
    expect(printed).toBeGreaterThan(0);

    linlinZeroes(game, "target");

    expect(currentPower(game.state, "p1", "target")).toBe(0);
    const seen = observe(game.state, "p2").opponent.board[0];
    expect(seen?.basePower).toBe(0);
    expect(seen?.powerModifiers).toEqual([]);
    expect(lastBasePowerSet(game)).toMatchObject({
      playerId: "p1",
      targetInstanceId: "target",
      basePower: 0,
      sourceCardNumber: "ST34-004",
    });
    expect(lastBasePowerSet(game)).not.toHaveProperty("outrankedBy");

    game.pass();
    expect(currentPower(game.state, "p1", "target")).toBe(printed);
  });

  it("is outranked by a 7000 OP16-106 Sanjuan.Wolf set earlier this turn", () => {
    covers("OP16-106", "[Trigger]");
    const game = table("st34-004-under-wolf")
      // OP16-106's Trigger asks for a {Blackbeard Pirates} Leader.
      .withLeader("p1", "OP16-080")
      .withBoard("p1", [character("target", "ST31-003")])
      .withLife("p1", [
        instance("life-wolf", "OP16-106"),
        instance("life-under", "ST31-003"),
      ])
      // ST31-004 is a 9000, enough to take a Life from a 5000 Leader without
      // spending the DON!! Linlin needs.
      .withBoard("p2", [character("attacker", "ST31-004", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);
    expect(currentPower(game.state, "p1", "target")).toBe(7000);

    linlinZeroes(game, "target");

    expect(currentPower(game.state, "p1", "target")).toBe(7000);
    expect(lastBasePowerSet(game)).toMatchObject({
      targetInstanceId: "target",
      basePower: 0,
      outrankedBy: 7000,
      sourceCardNumber: "ST34-004",
    });
  });

  it("hands base power 0 on through OP14-009 Trafalgar Law's swap", () => {
    covers("OP14-009", "[On Your Opponent's Attack]");
    // ST31's Leader prints 5000 and OP14-009 prints 10000. Zeroed, Law's base
    // is 0, so the swap leaves the Leader at 0 and Law at 5000.
    const game = table("st34-004-law-swap")
      .withBoard("p1", [character("law", "OP14-009")])
      .withHand("p1", copies(2, "ST31-005", "fodder"))
      .withBoard("p2", [character("attacker", "ST31-004", { playedTurn: 1 })])
      .build();

    linlinZeroes(game, "law");
    expect(currentPower(game.state, "p1", "law")).toBe(0);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder-1" });
    game.play({ type: "resolve-effect", optionId: "fodder-2" });
    game.play({ type: "resolve-effect", optionId: "law" });

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(0);
    expect(currentPower(game.state, "p1", "law")).toBe(5000);
  });
});
