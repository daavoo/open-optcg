import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { character, instance, scenario } from "./support/index.js";

/**
 * Red Edward.Newgate's deck policy.
 *
 * One decision, and it is the deck's whole game:
 * `pnpm census --deck "(Red) Edward.Newgate - Official Feature Deck"` reads its
 * `block:resolve-effect` at 10.00 per game with 100.0% no rule scoped to the
 * deck, and every one of those is the Leader offering to trash a card for
 * +4000. The generic ladder reaches it as "resolve a legal beneficial effect"
 * and takes it every time.
 *
 * Each case below is a battle where the answer differs from that default, so a
 * regression to the generic ladder fails them rather than merely reading
 * differently.
 */

const DECK = "(Red) Edward.Newgate - Official Feature Deck";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

/**
 * p1 on the Newgate list, defending an attack on its Leader.
 *
 * The opponent is ST34 so no matchup module can intercept, and the attacker's
 * card number is independent of that deck's list -- the engine resolves
 * printed text globally.
 */
function attackedBy(
  seed: string,
  attacker: string,
  hand: ReturnType<typeof instance>[],
) {
  const game = scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withHand("p1", hand)
    .withBoard("p2", [character("attacker", attacker)])
    .build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  return game;
}

const newgateAgent = () => new RegistryRulesAgent("OP17-001");

/** A card with no printed Counter, so the hand adds nothing to the battle. */
const BLANK = "OP17-008"; // Jozu: 6-cost 8000, no Counter

describe("OP17-001 Edward.Newgate's defensive ability", () => {
  it("trashes a card when 4000 is what the battle is short by", async () => {
    // Kingdew's 8000 beats the 5000 Leader; 8000 against 9000 does not, and
    // the attacker wins ties, so the shortfall is 3001.
    const game = attackedBy("newgate-pays", "OP17-006", [
      instance("pitch", BLANK),
    ]);

    const action = await newgateAgent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "apply" });
  });

  it("keeps the card when the attack already fails", async () => {
    // A printed 3000 into a 5000 Leader is turned away by the board as it
    // stands. The engine still offers the ability -- the 4000 does land -- and
    // the generic ladder pays for it, once per turn, for nothing.
    const game = attackedBy("newgate-already-fails", "ST31-003", [
      instance("pitch", BLANK),
    ]);
    // The ability is offered on a failing attack too, and correctly so -- the
    // 4000 does land. `counterShortfall` is what says it buys nothing.
    const battle = observe(game.state, "p1").activeBattle;
    expect(battle?.attackPower).toBe(3_000);
    expect(battle?.counterShortfall).toBe(0);

    const action = await newgateAgent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "skip" });
  });

  it("keeps the card when 4000 and the whole hand still lose the battle", async () => {
    // OP17-005's printed 12000 against a 5000 Leader is a shortfall of 7001.
    // +4000 and a hand with no Counter in it cannot reach that, so paying buys
    // a smaller loss rather than a save.
    const game = attackedBy("newgate-unsalvageable", "OP17-005", [
      instance("pitch", BLANK),
      instance("pitch-b", BLANK),
    ]);

    const action = await newgateAgent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "skip" });
  });

  it("pays into the same battle once the hand can finish it", async () => {
    // The same 7001 shortfall, and a hand of three 2000 Counters behind the
    // 4000: 10000 is enough, so the ability is the first instalment rather
    // than a wasted card. This is the case the Counter reserve is read for.
    const game = attackedBy("newgate-reachable", "OP17-005", [
      instance("ctr-a", "OP17-016"), // 2000 Counter
      instance("ctr-b", "OP17-016"),
      instance("ctr-c", "OP17-004"), // 2000 Counter
    ]);

    const action = await newgateAgent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "apply" });
  });

  it("pays the cost with the smallest body in hand, not the first card offered", async () => {
    // Kingdew's 8000 into the 5000 Leader is a shortfall of 3001, so the
    // ability is worth paying -- and then the engine asks which card pays.
    // Hand order is what the generic ladder answers with, and hand order here
    // starts with the 12000 this deck wins the game by playing.
    const game = attackedBy("newgate-cost-choice", "OP17-006", [
      instance("big", "OP17-005"), // 10-cost 12000, the deck's finisher
      instance("oden", "OP17-007"), // 7-cost 8000
      instance("rakuyo", "OP17-016"), // 3-cost 2000, and a 2000 Counter
    ]);
    const agent = newgateAgent();

    const accept = await agent.chooseAction(observe(game.state, "p1"));
    expect(accept).toMatchObject({ optionId: "apply" });
    game.submit(accept);

    const paid = await agent.chooseAction(observe(game.state, "p1"));

    // The smallest body, even though it is also the only Counter card in the
    // hand: in this list Counter value and card value point opposite ways.
    expect(paid).toMatchObject({ type: "resolve-effect", optionId: "rakuyo" });
  });

  it("counts a Counter the hand was granted rather than the one it prints", async () => {
    // The same 7001 shortfall and the same hand of two printed-blank 8000s
    // that reads as unsalvageable above -- but with OP16-118 Portgas.D.Ace on
    // the board, which makes every 8000-power Character in hand a 2000
    // Counter. 4000 plus 4000 clears 7001, so this is the reachable case and
    // not the hopeless one.
    //
    // The rule read `hand[].counter` and so read this hand as 0 of Counter.
    // `currentCounter` is the figure the engine puts on the offered
    // `CounterAction`, and this is the position that tells the two apart.
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("newgate-granted-counter")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("pitch", BLANK), instance("pitch-b", BLANK)])
      .withBoard("p1", [character("ace", "OP16-118")])
      .withBoard("p2", [character("attacker", "OP17-005")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    const hand = observe(game.state, "p1").self.hand;
    expect(hand.map((card) => card.counter)).toEqual([0, 0]);
    expect(hand.map((card) => card.currentCounter)).toEqual([2_000, 2_000]);

    const action = await newgateAgent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "apply" });
  });
  it("pays for a rested Character, whose only other defence is none", async () => {
    // A Character is only a legal attack target while rested, so this battle
    // is always over a body that has already acted. Paying looks optional --
    // it costs no Life -- but `chooseGenericCounter` answers a battle over a
    // Character with "do not spend hand resources protecting a replaceable
    // Character" unless its `protectedCards` names the card, and this deck
    // registers no Counter policy for that set to be filled from. The +4000 is
    // the only defence the body has, so sufficiency is the whole test.
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("newgate-last-attack")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("pitch", BLANK)])
      .withBoard("p1", [character("izo", "OP17-003", { rested: true })])
      .withBoard("p2", [character("attacker", "OP17-006")])
      .withRestedLeader("p2")
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "izo",
    });

    const action = await newgateAgent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "apply" });
  });

  it("pays on the hit that ends the game, where lifeCost reads 0", async () => {
    // `lifeCost` is capped at the Life the defender actually holds, so a
    // Leader hit against an empty Life stack -- the one hit that loses the
    // game outright -- reports 0 exactly like an attack on a Character. This
    // pins the branch, not the outcome: the rule holds the 4000 back for the
    // Leader by reading `targetInstanceId`, and a rule that read `lifeCost`
    // instead would decline here and lose.
    const game = attackedBy("newgate-lethal", "OP17-006", [
      instance("pitch", BLANK),
    ]);

    const battle = observe(game.state, "p1").activeBattle;
    expect(battle?.targetInstanceId).toBe("p1-leader");
    expect(battle?.lifeCost).toBe(0);
    expect(observe(game.state, "p1").self.life).toHaveLength(0);

    const action = await newgateAgent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "apply" });
  });
  it("spends a Counter card to keep Jozu, which the generic policy lets die", async () => {
    // The Counter step, reached on the second attack of a turn -- the Leader's
    // [Once Per Turn] is spent by then, which is the position a battle over a
    // Character actually arrives in.
    //
    // `chooseGenericCounter` decides a battle over a Character on
    // `protectedCards.has(cardNumber)`, and with the empty default set it
    // answers "do not spend hand resources protecting a replaceable
    // Character" and lets an 8000 die to a 1-power shortfall. OP17-008 Jozu is
    // not replaceable here: it sets the Leader's base power to 8000 through
    // the opponent's next end phase, which is what makes the Leader's own
    // +4000 a 12000 defence next turn.
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("newgate-counter-keeps-jozu")
      .atTurn(12, { active: "p2" })
      .bareTable()
      // `bareTable()` empties the deck, so a Life count has to be handed in
      // as cards; the economical gate wants Life to spare, not a Life stack.
      .withLife("p1", [
        instance("life-a", BLANK),
        instance("life-b", BLANK),
        instance("life-c", BLANK),
      ])
      .withHand("p1", [instance("ctr", "OP17-016")]) // 3-cost 2000, 2000 Counter
      .withBoard("p1", [character("jozu", "OP17-008", { rested: true })])
      .withBoard("p2", [character("attacker", "OP17-006", { rested: true })])
      .withRestedLeader("p2")
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "jozu",
          attackPower: 8_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    // 8000 into an 8000 body: the attacker wins ties, so one Counter card of
    // any size saves it. This is the cheap end the economical gate allows.
    const observation = observe(game.state, "p1");
    expect(observation.activeBattle?.counterShortfall).toBe(1);

    const action = await newgateAgent().chooseAction(observation);

    expect(action).toMatchObject({ type: "counter", cardInstanceId: "ctr" });
  });
});
describe("OP17-007 Kouzuki Oden's free deploy", () => {
  /** p1 on the Newgate list, with the DON!! to cast Oden and a hand to pick from. */
  function odenTurn(seed: string, hand: ReturnType<typeof instance>[]) {
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("oden", "OP17-007"), ...hand])
      .build();
    game.play({ type: "play-card", cardInstanceId: "oden" });
    return game;
  }

  it("deploys the 6000 rather than the 2000 the hand happens to start with", async () => {
    // The defect, from instrumenting the surface: the choice is one
    // `resolve-effect` per eligible card, `chooseGenericRules` takes the first
    // beneficial one, and the first is hand order. Rakuyo is deliberately
    // ahead of Marco in this hand.
    const game = odenTurn("newgate-oden-largest", [
      instance("rakuyo", "OP17-016"), // 3-cost 2000
      instance("marco", "OP17-015"), // 4-cost 6000
    ]);

    const action = await newgateAgent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "marco",
    });
  });

  it("prefers Izo among equals, because the same 6000 is also an attack", async () => {
    // Marco and Izo are both 6000, so power cannot separate them. Izo prints
    // [Rush: Character] and shrinks a rested opposing Character on the way in,
    // and both halves are worth most on the turn Oden lands -- which is the
    // only turn this decision happens.
    const game = odenTurn("newgate-oden-izo", [
      instance("marco", "OP17-015"),
      instance("izo", "OP17-003"),
    ]);

    const action = await newgateAgent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "izo" });
  });
});
