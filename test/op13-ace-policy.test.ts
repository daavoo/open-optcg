import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Red/Blue) Portgas.D.Ace's rules: whether the Leader's [On Your Opponent's
 * Attack] is worth a card, and which card pays for it.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the rule disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const ACE = "(Red/Blue) Portgas.D.Ace - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP13-002";
const GATE = "op13-ace#op13-ace-debuff-gate";
const PITCH = "op13-ace#op13-ace-pitch";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

const optionIdOf = (action: LegalAction) =>
  action.type === "resolve-effect" ? action.optionId : action.type;

/** The opponent's turn, Ace at 3 Life with a hand to pay from. */
const defending = (seed: string) =>
  scenario()
    .decks(ACE, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p2" })
    .bareTable()
    .withLeader("p1", "OP13-002")
    .withLife("p1", [
      instance("life-1", "OP13-043"),
      instance("life-2", "OP13-043"),
      instance("life-3", "OP13-043"),
    ]);

/** Declare `attacker` into Ace's Leader, leaving the debuff offer pending. */
function attackLeader(game: Game, attacker: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: "p1-leader",
  });
}

describe("the Leader's debuff", () => {
  it("is declined when the attack already fails", async () => {
    // ST34-002 is a 5000 into the 6000 Leader.
    const game = defending("ace-gate-fails")
      .withHand("p1", [instance("pitch", "OP13-007")])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .build();
    attackLeader(game, "attacker");

    expect(game.state.activeAttack).not.toBeNull();
    expect(optionIdOf(await chosen(game))).toBe("skip");
    expect(optionIdOf(await chosen(game, [GATE]))).toBe("apply");
  });

  it("is declined when the attack lands with 2000 taken off it", async () => {
    // Eight DON!! given makes a 13000 attack: −2000 still lands.
    const game = defending("ace-gate-too-big")
      .withHand("p1", [instance("pitch", "OP13-007")])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withGivenDon("p2", "attacker", 8)
      .build();
    attackLeader(game, "attacker");

    expect(optionIdOf(await chosen(game))).toBe("skip");
    expect(optionIdOf(await chosen(game, [GATE]))).toBe("apply");
  });

  it("is taken when −2000 turns the hit away", async () => {
    // 5000 + 2 DON!! = 7000 into 6000: −2000 makes it 5000.
    const game = defending("ace-gate-open")
      .withHand("p1", [instance("pitch", "OP13-007")])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withGivenDon("p2", "attacker", 2)
      .build();
    attackLeader(game, "attacker");

    expect(optionIdOf(await chosen(game))).toBe("apply");
  });
});

describe("the card that pays for it", () => {
  it("is the card worth least held, not the first in hand", async () => {
    const game = defending("ace-pitch")
      .withHand("p1", [
        // A +3000 [Counter] Event first in hand, which is what the ladder pays.
        instance("kick", "OP04-016"),
        // The 10-cost [Blocker] the late game is built on.
        instance("newgate", "OP13-042"),
        // A 1-cost 2000 Counter: the cheapest of the three to lose.
        instance("asl", "OP13-007"),
      ])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withGivenDon("p2", "attacker", 2)
      .build();
    attackLeader(game, "attacker");
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(optionIdOf(await chosen(game))).toBe("asl");
    expect(optionIdOf(await chosen(game, [PITCH]))).toBe("kick");
  });
});
