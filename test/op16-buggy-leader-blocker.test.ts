import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { character, copies, covers, scenario } from "./support/index.js";

/**
 * OP16-048 Buggy's [Blocker] grant, aimed at a Leader.
 *
 * The grant names "[Prisoner of Impel Down]", and Bandai's OP16 Q&A rules that
 * a Leader "treated as a card with all card names, types, and attributes" can
 * gain [Blocker] from it. Comprehensive Rules 10-1-4-1 does not restrict
 * [Blocker] to Characters: it is activated "when one of your other cards is
 * being attacked" by resting this card, which then takes the attack. So the
 * sealed promo Leader, granted [Blocker], can rest to take an attack aimed at
 * one of its Characters -- and a lost battle is then Life damage, as it is
 * for any battle against a Leader.
 */

const DECK = "(Green/Blue) Monkey.D.Luffy - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";
/** The Leader printed as every card name at once. */
const WILDCARD = "SEALED-LUFFY";

/** p2 to act, attacking into p1's Buggy board. */
const defending = (seed: string, leader?: string) => {
  const builder = scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withLife("p1", copies(4, "OP16-011", "life"))
    .withBoard("p1", [
      character("buggy", "OP16-048"),
      // Vista: a rested Character, so it can be attacked at all, and not a
      // Prisoner of Impel Down, so the Leader is the only candidate.
      character("vista", "OP16-011", { rested: true }),
    ])
    // ST31-002 at 6000 outpowers the 5000 Leader.
    .withBoard("p2", [character("attacker", "ST31-002")]);
  return leader ? builder.withLeader("p1", leader) : builder;
};

describe("OP16-048 Buggy granting [Blocker] to a Leader", () => {
  covers("OP16-048", "[On Play]");

  it("offers the grant to a Leader with every card name", () => {
    const game = defending("op16-048-leader-offer", WILDCARD).build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "vista",
    });

    expect(game.state.pendingEffect).toMatchObject({
      kind: "grant-prisoner-blocker",
      eligibleInstanceIds: ["p1-leader"],
    });
    expect(game.summaries("p1")).toContain(
      "Give Monkey.D.Luffy Blocker for this turn",
    );
  });

  it("lets that Leader block an attack on a Character and take it to Life", () => {
    const game = defending("op16-048-leader-block", WILDCARD).build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "vista",
    });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    // The grant is public, the same as any other granted keyword.
    expect(observe(game.state, "p1").self.leader.effectiveKeywords).toContain(
      "Blocker",
    );

    game.play({ type: "block", blockerInstanceId: "p1-leader" });
    expect(game.events).toContainEqual({
      type: "attack-blocked",
      playerId: "p1",
      blockerInstanceId: "p1-leader",
    });
    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(game.state.activeAttack?.targetInstanceId).toBe("p1-leader");

    // Decline the Counter step: 6000 beats the 5000 Leader, and the Leader
    // loses a battle the way it always does -- one Life card to hand. The
    // Character it stepped in front of is untouched.
    game.pass();
    expect(game.state.activeAttack).toBeNull();
    expect(game.events).toContainEqual(
      expect.objectContaining({
        type: "battle-resolved",
        targetInstanceId: "p1-leader",
        outcome: "damage",
      }),
    );
    expect(game.state.players.p1.life).toHaveLength(3);
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("vista");
  });

  it("does not let the granted Leader block an attack on itself", () => {
    const game = defending("op16-048-leader-self", WILDCARD).build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    // The grant lasts the turn, so it is still offered; it just cannot move
    // an attack that is already on the Leader.
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("is not offered to a rested Leader", () => {
    const game = defending("op16-048-leader-rested", WILDCARD)
      .withRestedLeader("p1")
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "vista",
    });

    expect(game.state.pendingEffect).toBeNull();
    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("gives an ordinary Leader nothing to block with", () => {
    // The deck's own OP16 Luffy Leader is not a Prisoner of Impel Down and
    // prints no [Blocker], so with no Prisoner on the board there is no grant
    // and no block.
    const game = defending("op16-048-leader-plain").build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "vista",
    });

    expect(game.state.pendingEffect).toBeNull();
    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });
});
