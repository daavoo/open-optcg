import { describe, expect, it } from "vitest";

import { character, copies, scenario } from "./support/index.js";

/**
 * Defence bought during a battle belongs to the card it was bought for.
 *
 * The engine holds the defending side's battle-scoped power as one number on
 * the attack, `counterPower`, which is right for the Counter step: every point
 * of it is spent on whatever the attack is already pointed at. The Block step
 * comes earlier, and so does the `[On Your Opponent's Attack]` ladder that
 * feeds the same number -- OP17-040 Edward.Newgate gives "your Leader" +3000
 * from the bench before the defender has been asked about blocking at all. Left
 * in the pool, that Leader's +3000 was inherited by whichever Character blocked
 * afterwards, so a 1000-power Gloriosa defended at 4000.
 *
 * The position is the one a reported game reached: the Xebec seat paid a card
 * for +3000 on its Leader, then put a Blocker in front of the same attack.
 */
const XEBEC = "(Blue) Rocks.D.Xebec - Official Feature Deck";
const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";

/**
 * ST31's Leader swings at 7000 into the Xebec Leader's 5000, with Newgate and a
 * Blocker watching from the Xebec bench and one card in hand to pay with.
 */
function leaderSwingsIntoNewgate() {
  const game = scenario()
    .decks(XEBEC, ST31)
    .seed("battle-defence-target")
    .bareTable()
    .atTurn(6, { active: "p2" })
    .withLife("p1", copies(3, "OP17-042", "p1-life"))
    .withLife("p2", copies(3, "ST31-001", "p2-life"))
    .withBoard("p1", [
      character("newgate", "OP17-040", { playedTurn: 4 }),
      character("gloriosa", "OP17-046", { playedTurn: 4 }),
    ])
    .withHand("p1", copies(1, "OP17-056", "p1-fuel"))
    .withDon("p2", { leaderAttached: 2 })
    .build();
  game.play({
    type: "attack",
    attackerInstanceId: "p2-leader",
    targetInstanceId: "p1-leader",
  });
  // Newgate's watcher clause: trash 1 card from hand for +3000 on the Leader.
  game.play({ type: "resolve-effect", optionId: "apply" });
  game.play({ type: "resolve-effect", optionId: "p1-fuel-1" });
  return game;
}

describe("a battle buff stays on the card it was given to", () => {
  it("adds the Leader's +3000 to the Leader's own defence", () => {
    const game = leaderSwingsIntoNewgate();
    expect(game.state.activeAttack?.targetInstanceId).toBe("p1-leader");
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
  });

  it("does not hand that +3000 to a Character that blocks afterwards", () => {
    const game = leaderSwingsIntoNewgate();
    game.play({ type: "block", blockerInstanceId: "gloriosa" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("gloriosa");
    // Gloriosa was never given anything: the clause named the Leader, and the
    // Leader is no longer in this battle.
    expect(game.state.activeAttack?.counterPower).toBe(0);
  });

  it("resolves the blocked battle at the Blocker's own power", () => {
    const game = leaderSwingsIntoNewgate();
    game.play({ type: "block", blockerInstanceId: "gloriosa" });
    game.play({ type: "pass" });

    const resolved = game.events.find(
      (event) => event.type === "battle-resolved",
    );
    expect(resolved).toMatchObject({
      targetInstanceId: "gloriosa",
      attackPower: 7_000,
      defensePower: 1_000,
      outcome: "character-ko",
    });
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "newgate",
    ]);
    // The Life the block was spent to save is still there, and so is the Life
    // the Leader's +3000 would have saved on its own: paying for both is what
    // the position costs.
    expect(game.state.players.p1.life).toHaveLength(3);
  });
});
