/**
 * The three format fundamentals found by auditing a folder of recorded matches
 * of one matchup under three pilots -- human, model and rules agent -- with
 * `pnpm trace:audit` and `pnpm trace:compare`.
 *
 * Each test poses the position the rule is about and asserts the *judgement*,
 * not the outcome of a game: which candidate the rule promotes, which it vetoes,
 * and -- the half that is easy to leave out -- the neighbouring position where it
 * must say nothing at all. Every one of these rules narrows what some other
 * policy chooses between, so a rule that fires one position too wide is a
 * regression no win rate would attribute to it.
 */
import { describe, expect, it } from "vitest";
import {
  createAttackOrderModule,
  createAuraAttachmentModule,
  createCounterOverDyingBlockModule,
  policyContext,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { PolicyModule } from "@one-piece-sim/agents/local";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

import { character, instance, scenario } from "./support/index.js";

/** OP17-089 Jaguar.D.Saul: printed cost 4, on the field at 16. */
const SAUL = "OP17-089";
/** OP17-095 Roronoa Zoro, a 2-drop the giant grows from 2000 to 5000. */
const ELBAPH_ZORO = "OP17-095";
/** P-101 Tony Tony.Chopper: a 5000-power Blocker, used here as the body. */
const CHOPPER = "P-101";
/** OP17-098 Gum-Gum Kong Gun: an [Activate: Main] that costs 1 and rests 6. */
const KONG_GUN = "OP17-098";
/** OP13-120 Sabo, a 7000-power Blocker: one that outlives a 6000 attack. */
const BIG_BLOCKER = "OP13-120";

function scoreOf(
  module: PolicyModule,
  observation: GameObservation,
  action: LegalAction,
): number | undefined {
  const value = module.rankAmong?.(policyContext(observation), action);
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "score" in value) {
    return (value as { score: number }).score;
  }
  return undefined;
}

describe("attack-order: lead with the smallest connecting attack", () => {
  /**
   * Two of the seat's own bodies can both beat the opposing Leader, so the only
   * question the position asks is which of them swings first.
   */
  function twoAttackers() {
    return scenario()
      .decks(
        "(Red/Black) Sabo - OP17 Elbaph List",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("attack-order")
      .atTurn(6, { active: "p1" })
      .withBoard("p1", [
        character("small", ELBAPH_ZORO),
        character("big", SAUL),
      ])
      .build();
  }

  it("scores the smaller of two winning Leader attacks above the larger", () => {
    const game = twoAttackers();
    const observation = observe(game.state, "p1");
    const leaderAttacks = observation.legalActions.filter(
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p2-leader",
    );
    // The position is only evidence if it really offered the choice.
    expect(leaderAttacks.length).toBeGreaterThanOrEqual(2);

    const module = createAttackOrderModule();
    const scored = leaderAttacks
      .map((action) => ({
        action,
        score: scoreOf(module, observation, action),
      }))
      .filter(
        (entry): entry is { action: LegalAction; score: number } =>
          entry.score !== undefined,
      );
    expect(scored.length).toBeGreaterThanOrEqual(2);

    const best = scored.reduce((left, right) =>
      right.score > left.score ? right : left,
    );
    const powerOf = (action: LegalAction): number =>
      action.type === "attack" ? (action.attackPower ?? 0) : 0;
    const smallestPower = scored.reduce(
      (least, entry) => Math.min(least, powerOf(entry.action)),
      Number.POSITIVE_INFINITY,
    );
    expect(powerOf(best.action)).toBe(smallestPower);
  });

  it("says nothing about an attack aimed at a Character", () => {
    // The point of `preferAmong` here: scoring only Leader attacks under
    // `prefer` would hide every Character attack in the same action type,
    // including the ones `threat-removal` exists to promote.
    const game = scenario()
      .decks(
        "(Red/Black) Sabo - OP17 Elbaph List",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("attack-order-character")
      .atTurn(6, { active: "p1" })
      .withBoard("p1", [character("small", ELBAPH_ZORO)])
      .withBoard("p2", [{ ...character("rested", CHOPPER), rested: true }])
      .build();
    const observation = observe(game.state, "p1");
    const characterAttacks = observation.legalActions.filter(
      (action) =>
        action.type === "attack" && action.targetInstanceId === "rested",
    );
    expect(characterAttacks.length).toBeGreaterThan(0);

    const module = createAttackOrderModule();
    for (const action of characterAttacks) {
      expect(scoreOf(module, observation, action)).toBeUndefined();
    }
  });

  it("does not apply to the one deck whose own policy does it better", () => {
    // ST32's own policy decides its attacks and beats this rule; see the
    // module comment. Asserted here so the exclusion cannot be dropped silently.
    const game = scenario()
      .decks(
        "(Green) Roronoa Zoro - Starter Deck 32",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("attack-order-st32")
      .atTurn(6, { active: "p1" })
      .build();
    const observation = observe(game.state, "p1");
    expect(
      createAttackOrderModule().applies?.(policyContext(observation)),
    ).toBe(false);
  });
});

describe("counter-over-dying-block: keep a Blocker the hand can replace", () => {
  function blockWindow(options: {
    attackPower: number;
    /** The body in the block window; defaults to the 5000 Chopper. */
    blocker?: string;
    hand: string[];
    /** Defender's Life; defaults to 3. */
    life?: number;
  }) {
    const built = scenario()
      .decks(
        "(Red/Black) Sabo - OP17 Elbaph List",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("dying-block")
      .atTurn(6, { active: "p2" })
      .withLife("p1", options.life ?? 3)
      .withBoard("p1", [character("blocker", options.blocker ?? CHOPPER)])
      .withBoard("p2", [
        character("attacker-a", CHOPPER),
        character("attacker-b", CHOPPER),
      ])
      .withHand(
        "p1",
        options.hand.map((cardNumber, index) =>
          instance(`held-${index}`, cardNumber),
        ),
      )
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "attacker-a",
        targetInstanceId: "p1-leader",
        attackPower: options.attackPower,
        counterPower: 0,
      });
    return built.build();
  }

  it("passes a block that would kill the Blocker when the hand can stop the attack", () => {
    const game = blockWindow({
      // Well above the Blocker's own 5000, so blocking trades the body for the
      // hit -- which is the trade this rule exists to decline. 8000 on a 5000
      // Leader is a 3001 shortfall: two 2000 Counters, inside the budget the
      // Counter step will honour.
      attackPower: 8_000,
      hand: [ELBAPH_ZORO, ELBAPH_ZORO, ELBAPH_ZORO, ELBAPH_ZORO],
    });
    const observation = observe(game.state, "p1");
    expect(
      observation.legalActions.some((action) => action.type === "block"),
    ).toBe(true);

    const decision = createCounterOverDyingBlockModule().decide?.(
      policyContext(observation),
    );
    expect(decision?.action.type).toBe("pass");
    expect(decision?.reasons.join(" ")).toContain("Counter power");
  });

  it("says nothing when a Blocker would survive the attack", () => {
    // `free-block` owns that case, and this rule must never talk it out of one.
    // 6000 clears the Leader's 5000, so the shortfall is real -- and a 7000
    // Blocker absorbs the hit and lives, which is `free-block`'s case.
    const game = blockWindow({
      attackPower: 6_000,
      blocker: BIG_BLOCKER,
      hand: [ELBAPH_ZORO, ELBAPH_ZORO, ELBAPH_ZORO, ELBAPH_ZORO],
    });
    const observation = observe(game.state, "p1");
    expect(
      createCounterOverDyingBlockModule().decide?.(policyContext(observation)),
    ).toBeUndefined();
  });

  it("says nothing when the line the hand holds is over the Counter budget", () => {
    // 9000 on a 5000 Leader is a 4001 shortfall: three 2000 Counters, which
    // `counter-budget` refuses for a non-lethal hit at 3 Life. Promising that
    // line here would pass the block and then pay nothing -- the recorded
    // Robin game, 2 Life, two Blockers standing, Leader hit anyway.
    const game = blockWindow({
      attackPower: 9_000,
      hand: [ELBAPH_ZORO, ELBAPH_ZORO, ELBAPH_ZORO, ELBAPH_ZORO],
    });
    const observation = observe(game.state, "p1");
    expect(
      createCounterOverDyingBlockModule().decide?.(policyContext(observation)),
    ).toBeUndefined();
  });

  it("still promises the line at 1 Life, where the budget stretches to it", () => {
    // Same swing, same hand: at 1 Life `counter-budget` allows three cards, so
    // the promise is one the Counter step will keep.
    const game = blockWindow({
      attackPower: 9_000,
      hand: [ELBAPH_ZORO, ELBAPH_ZORO, ELBAPH_ZORO, ELBAPH_ZORO],
      life: 1,
    });
    const observation = observe(game.state, "p1");
    const decision = createCounterOverDyingBlockModule().decide?.(
      policyContext(observation),
    );
    expect(decision?.action.type).toBe("pass");
  });

  it("says nothing when the hand cannot pay the shortfall", () => {
    // Passing a block with no Counter line is just taking the hit the block was
    // there to stop.
    const game = blockWindow({
      attackPower: 9_000,
      hand: [],
    });
    const observation = observe(game.state, "p1");
    expect(
      createCounterOverDyingBlockModule().decide?.(policyContext(observation)),
    ).toBeUndefined();
  });
});

describe("aura-attachment: switch the board-wide aura on before the body", () => {
  function auraTurn(options: { activeDon: number; boardAura: boolean }) {
    return scenario()
      .decks(
        "(Red/Black) Sabo - OP17 Elbaph List",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("aura-attachment")
      .atTurn(6, { active: "p1" })
      .withBoard(
        "p1",
        options.boardAura
          ? [character("giant", SAUL)]
          : [character("body", ELBAPH_ZORO)],
      )
      .withHand("p1", [instance("held", ELBAPH_ZORO)])
      .withDon("p1", { active: 0 })
      .build();
  }

  const vetoOn = (observation: GameObservation): string | undefined => {
    const module = createAuraAttachmentModule();
    const play = observation.legalActions.find(
      (action) => action.type === "play-card",
    );
    expect(play).toBeDefined();
    return module.veto?.(policyContext(observation), play!);
  };

  it("vetoes the play while the Leader's aura DON!! is still unattached", () => {
    const game = auraTurn({ activeDon: 6, boardAura: true });
    const observation = observe(game.state, "p1");
    // The gate that makes this sequencing rather than a trade: the play must
    // still be affordable after the attachment.
    expect(observation.self.activeDon).toBeGreaterThan(2);
    expect(observation.self.leader.attachedDon).toBe(0);
    expect(vetoOn(observation)).toBeDefined();
  });

  it("says nothing once the DON!! is on the Leader", () => {
    const game = scenario()
      .decks(
        "(Red/Black) Sabo - OP17 Elbaph List",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("aura-attached")
      .atTurn(6, { active: "p1" })
      .withBoard("p1", [character("giant", SAUL)])
      .withHand("p1", [instance("held", ELBAPH_ZORO)])
      .withDon("p1", { leaderAttached: 1 })
      .build();
    const observation = observe(game.state, "p1");
    expect(observation.self.leader.attachedDon).toBe(1);
    expect(vetoOn(observation)).toBeUndefined();
  });

  it("says nothing while an [Activate: Main] can spend the DON!! first", () => {
    // `chooseGenericRules` runs plays, then activations, then attachments, so
    // vetoing the play here does not defer it by one DON!! -- it hands the turn
    // to OP17-098 Gum-Gum Kong Gun, which costs 1 and rests 6, and the aura is
    // never switched on at all.
    const game = scenario()
      .decks(
        "(Red/Black) Sabo - OP17 Elbaph List",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("aura-vs-activation")
      .atTurn(6, { active: "p1" })
      .withBoard("p1", [character("giant", SAUL)])
      .withHand("p1", [
        instance("held", ELBAPH_ZORO),
        instance("gun", KONG_GUN),
      ])
      .withDon("p1", { active: 7 })
      .build();
    const observation = observe(game.state, "p1");
    expect(observation.self.leader.attachedDon).toBe(0);
    expect(
      observation.legalActions.some(
        (action) => action.type === "activate-main",
      ),
    ).toBe(true);
    expect(vetoOn(observation)).toBeUndefined();
  });

  it("says nothing for a Leader whose [DON!! xN] clause buys one unit", () => {
    // ST21-001's `[DON!! x1]` gives rested DON!! to a single Character. Same
    // shape of clause, different claim, and the text gate is what tells them
    // apart.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red/Black) Sabo - OP17 Elbaph List",
      )
      .seed("aura-st31")
      .atTurn(6, { active: "p1" })
      .withBoard("p1", [character("body", CHOPPER)])
      .withHand("p1", [instance("held", CHOPPER)])
      .build();
    const observation = observe(game.state, "p1");
    expect(observation.self.leader.cardNumber).toBe("ST21-001");
    expect(vetoOn(observation)).toBeUndefined();
  });
});
