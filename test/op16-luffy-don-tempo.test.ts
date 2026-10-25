import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import {
  policiesForDeck,
  policyContext,
  RegistryRulesAgent,
  tactics,
} from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * The two judgements `open-optcg-trace(42).jsonl` turn 7 got wrong, posed as
 * boards.
 *
 * That turn opened with seven active DON!!, three Characters able to attack and
 * five plays affordable. It spent every DON!! on bodies, trashed two of the three
 * attackers to pay for them, and ended having declared two attacks. Both faults
 * are sequencing rather than card valuation, and neither is visible in the
 * chosen action alone -- so each is checked at the rule that now answers it.
 */

/** What one registered module says about each candidate, with its reason. */
function contributions(
  state: Parameters<typeof observe>[0],
  moduleId: string,
  viewer: "p1" | "p2" = "p1",
): { action: LegalAction; score: number }[] {
  const observation = observe(state, viewer);
  const context = policyContext(observation);
  const module = policiesForDeck(observation.self.leader.cardNumber).find(
    (candidate) => candidate.id === moduleId,
  );
  if (!module) throw new Error(`no module ${moduleId}`);
  return observation.legalActions.flatMap((action) => {
    const ranked = module.rank?.(context, action);
    if (ranked === undefined) return [];
    return [
      {
        action,
        score: typeof ranked === "number" ? ranked : ranked.score,
      },
    ];
  });
}

async function chosen(
  state: Parameters<typeof observe>[0],
  viewer: "p1" | "p2" = "p1",
): Promise<LegalAction> {
  const observation = observe(state, viewer);
  const agent = new RegistryRulesAgent(observation.self.leader.cardNumber);
  const action = await agent.chooseAction(observation);
  const found = observation.legalActions.find(
    (candidate) => candidate.actionId === action.actionId,
  );
  if (!found) throw new Error("agent chose an action not on offer");
  return found;
}

/** Mr.1: the deck's cost-2 2000 body, and the one the trace threw away. */
const MR_1 = "OP16-054";
/** Mr.2 Bon Clay: a cost-2 1000 body that draws when it is replayed. */
const MR_2 = "OP16-055";
/** The deck's 0-power body: [DON!! x1] +1000 per distinct Character name. */
const LUFFY = "OP16-034";
/** Crocodile: cost 4, 6000, and the play that forced the replacement choice. */
const CROCODILE = "OP16-045";

function luffyTurn(options: {
  hand?: ReturnType<typeof instance>[];
  selfBoard?: ReturnType<typeof character>[];
  opponentBoard?: ReturnType<typeof character>[];
  active?: number;
}) {
  const life = (player: "p1" | "p2") => copies(4, "OP16-042", `${player}-life`);
  return scenario()
    .decks(
      "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
      "(Green) Roronoa Zoro - OP17 Post-Ban List",
    )
    .seed("op16-luffy-don-tempo")
    .bareTable()
    .atTurn(6, { active: "p1" })
    .withLife("p1", life("p1"))
    .withLife("p2", life("p2"))
    .withBoard("p1", options.selfBoard ?? [])
    .withBoard("p2", options.opponentBoard ?? [])
    .withHand("p1", options.hand ?? []);
}

describe("replacement-tempo", () => {
  it("gives up the body played this turn, not the one holding an attack", async () => {
    // The trace's board, minus the two bodies that never tied for the choice:
    // two Mr.1 copies down since turn 1, and a third played this turn. Priced
    // on power alone the three tie, and first-offered took a live attacker.
    // Three copies of one body, so the deck's own valuation of what a swap
    // gives up (`op16-luffy-board`) has nothing to separate them and the
    // tempo rule is the only voice.
    const game = luffyTurn({
      hand: [instance("croc", CROCODILE)],
      selfBoard: [
        character("mr1-a", MR_1),
        character("mr1-b", MR_1),
        character("mr2", MR_1, { playedTurn: 7 }),
        character("filler-a", CROCODILE),
        character("filler-b", CROCODILE),
      ],
    }).build();
    game.play({ type: "play-card", cardNumber: CROCODILE });

    const opinions = contributions(game.state, "replacement-tempo");
    expect(opinions).not.toHaveLength(0);
    // The branch check: the rule speaks only about the body played this turn.
    // Scoring the live attackers too would make it a whitelist and hide them,
    // which is the failure mode `preferAmong`'s doc comment describes.
    for (const entry of opinions) {
      expect(entry.action.type).toBe("resolve-effect");
      if (entry.action.type !== "resolve-effect")
        throw new Error("unreachable");
      expect(
        entry.action.option.kind === "card" &&
          entry.action.option.card.instanceId,
      ).toBe("mr2");
      expect(entry.score).toBeGreaterThan(0);
    }

    const action = await chosen(game.state);
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option.kind === "card" && action.option.card.instanceId).toBe(
      "mr2",
    );
  });

  it("stays silent when every body on the board can still swing", async () => {
    // Degrades to a no-op rather than to a preference: with nothing to separate
    // the bodies on tempo, the power judgement is left to decide alone.
    const game = luffyTurn({
      hand: [instance("croc", CROCODILE)],
      selfBoard: [
        character("mr1-a", MR_1),
        character("mr1-b", MR_1),
        character("mr2", MR_2),
        character("filler-a", CROCODILE),
        character("filler-b", CROCODILE),
      ],
    }).build();
    game.play({ type: "play-card", cardNumber: CROCODILE });

    expect(contributions(game.state, "replacement-tempo")).toHaveLength(0);
  });
});

describe("enabling attachment", () => {
  it("develops first, refunds two DON!!, and still lifts the Character over the Leader", async () => {
    // A 2000 Mr.1 against a 5000 Leader is invisible to `viableAttacks`, so a
    // ladder without `enablingAttachment` sees no attack for it. But the
    // three DON!! that lift it are not in competition with the cost-2 body in
    // hand: paying the body rests two DON!!, and the Leader refunds both, so
    // the turn plays the body *and* buys the battle. Attaching first would
    // rest nothing, refund nothing, and leave the body in hand.
    const game = luffyTurn({
      hand: [instance("mr1-hand", MR_1)],
      selfBoard: [character("mr1-board", MR_1)],
    })
      .withDonDeck("p1", 7)
      .build();

    const first = await chosen(game.state);
    expect(first.type).toBe("play-card");
    if (first.type !== "play-card") throw new Error("unreachable");
    expect(first.cardInstanceId).toBe("mr1-hand");
    game.play({ type: "play-card", cardNumber: MR_1 });

    // Two DON!! are rested now, which is when the refund is worth taking.
    const second = await chosen(game.state);
    expect(second.type).toBe("activate-main");
    if (second.type !== "activate-main") throw new Error("unreachable");
    expect(second.sourceCardNumber).toBe("OP16-022");
    game.play({ type: "activate-main", sourceCardNumber: "OP16-022" });
    expect(observe(game.state, "p1").self.activeDon).toBe(3);

    // And the three active DON!! still convert the body that could not swing.
    const third = await chosen(game.state);
    expect(third.type).toBe("attach-don");
    if (third.type !== "attach-don") throw new Error("unreachable");
    expect(third.targetInstanceId).toBe("mr1-board");
  });

  it("develops instead when no attachment can finish the conversion", async () => {
    // Two DON!! cannot lift a 2000 body over a 5000 Leader and a part-paid
    // threshold buys nothing, so the same two go on the body instead.
    const game = luffyTurn({
      hand: [instance("mr1-hand", MR_1)],
      selfBoard: [character("mr1-board", MR_1)],
    })
      .withDonDeck("p1", 8)
      .build();

    const action = await chosen(game.state);
    expect(action.type).toBe("play-card");
  });
});

describe("donToReach", () => {
  /**
   * The price of a lift, asked of the attacker instead of divided out of the
   * deficit.
   *
   * Every body `enablingAttachment` exists to lift has its power gated behind
   * `[DON!! x1]`, so the first DON!! onto one is worth whatever the clause says
   * and not its own 1000. Dividing quoted a price nothing could pay, and the
   * step then declined conversions the turn could afford -- the doc comment on
   * `enablingAttachment` had already noticed the shape of it for OP16-034
   * ("gets *cheaper* to convert with every body played") without the price
   * following.
   */
  it("prices a [DON!! x1] lift by simulating the attachment, not by dividing", () => {
    const game = luffyTurn({
      selfBoard: [
        character("luffy", LUFFY),
        character("mr1", MR_1),
        character("mr2", MR_2),
      ],
    }).build();
    const observation = observe(game.state, "p1");
    const leader = observation.opponent.leader.currentPower;
    const priced = new Map(
      observation.legalActions.flatMap((action) =>
        action.type === "attack" && action.targetInstanceId === "p2-leader"
          ? [[action.attackerInstanceId, action]]
          : [],
      ),
    );

    // Mr.2's base power *becomes* the Leader's once one DON!! is on it, so the
    // whole 4000 deficit is bought by a single DON!! -- where dividing said 4.
    expect(priced.get("mr2")?.attackPower).toBe(1_000);
    expect(priced.get("mr2")?.donToReach).toBe(1);

    // Luffy is a 0-power body whose clause pays 1000 per distinct name; three
    // names on this board make the first DON!! worth 4000, so two finish the
    // job where dividing 5000 by 1000 said five.
    expect(priced.get("luffy")?.attackPower).toBe(0);
    expect(priced.get("luffy")?.donToReach).toBe(2);

    // The control, and the more interesting half of it: Mr.1's +3000 is
    // `[DON!! x1]`-gated *and* conditional on holding 5 or more cards, which
    // this hand does not. Simulating an attachment does not invent the cards,
    // so the clause stays off and the answer is the one dividing would give --
    // 2000 plus three DON!! of 1000. A gate the attachment cannot open is not
    // a discount, and the price says so.
    expect(priced.get("mr1")?.attackPower).toBe(2_000);
    expect(priced.get("mr1")?.donToReach).toBe(3);
    expect(leader).toBe(5_000);
  });

  it("buys the conversion the old price put out of reach", async () => {
    // One active DON!! and a Mr.2 that one DON!! lifts from 1000 to 6000. The
    // old arithmetic called this a 4-DON!! conversion, found it unaffordable,
    // and developed instead.
    const game = luffyTurn({
      hand: [instance("mr1-hand", MR_1)],
      selfBoard: [character("mr2", MR_2)],
    })
      .withDonDeck("p1", 9)
      .build();

    const action = await chosen(game.state);
    expect(action.type).toBe("attach-don");
    if (action.type !== "attach-don") throw new Error("unreachable");
    expect(action.targetInstanceId).toBe("mr2");
  });
});

describe("while-attacking power", () => {
  /**
   * `open-optcg-trace(54).jsonl`, turn 5, revisions 22 and 32.
   *
   * Mr.2's `[DON!! x1] [When Attacking]` clause makes its base power the
   * opposing Leader's, so one given DON!! turns a 1000 body into a 6000 attack
   * on a 5000 Leader -- and the policy attached exactly that DON!! for exactly
   * that reason ("Lift a Character over its target so it can attack at all").
   * Then the attack step priced the body it had just bought at 2000 and ended
   * the turn with the Leader swing alone.
   *
   * The clause is a static layer read only while `state.activeAttack` names the
   * card, so it is absent from `currentPower` by construction and no amount of
   * reading the board recovers it. The engine already simulates the declaration
   * when it prices the offered action; the fix is for `attackerPower` to read
   * that instead of re-deriving a number the board cannot hold.
   */
  it("prices a switched-on Mr.2 at the attack the engine offers, not at its body", async () => {
    const game = luffyTurn({ selfBoard: [character("mr2", MR_2)] })
      .withDonDeck("p1", 8)
      .withGivenDon("p1", "mr2", 1)
      .build();

    const observation = observe(game.state, "p1");
    const mr2Attack = observation.legalActions.find(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "mr2",
    );
    if (mr2Attack?.type !== "attack") throw new Error("no Mr.2 attack offered");
    const { attackPower } = mr2Attack;
    if (attackPower === undefined) throw new Error("unpriced attack");
    // The premise, stated so a regression in the engine's pricing fails here
    // rather than as a puzzling policy change: 6000 off a 1000 printed body.
    // The clause replaces the *base* power, so the given DON!! that switched it
    // on still adds its own 1000 on top of the Leader's 5000 -- which is how a
    // body that reads 2000 on the board wins a battle it is 3000 short of.
    expect(attackPower).toBe(observation.opponent.leader.currentPower + 1_000);
    expect(
      observation.self.board.find((card) => card.instanceId === "mr2")
        ?.currentPower,
    ).toBeLessThan(attackPower);

    expect(
      tactics(observation).viableAttacks.map(
        (action) => action.attackerInstanceId,
      ),
    ).toContain("mr2");
  });

  it("takes that attack once the Leader has swung", async () => {
    // The trace's own sequencing: the Leader presses first, and the question is
    // what the ladder does with the rest of the turn. It used to pass.
    const game = luffyTurn({ selfBoard: [character("mr2", MR_2)] })
      .withDonDeck("p1", 8)
      .withGivenDon("p1", "mr2", 1)
      .build();
    game.play({ type: "attack", attackerInstanceId: "p1-leader" });
    game.play((action) => action.actionId.endsWith(":pass-block"));
    game.play((action) => action.actionId.endsWith(":pass-counter"));

    const action = await chosen(game.state);
    expect(action.type).toBe("attack");
    if (action.type !== "attack") throw new Error("unreachable");
    expect(action.attackerInstanceId).toBe("mr2");
  });
});
