import { describe, expect, it } from "vitest";
import {
  currentPower,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { character, instance, scenario, type Game } from "./support/index.js";

/**
 * The OP-16 Marshall.D.Teach seat's one genuinely new decision: the Leader's
 * redirect.
 *
 * Every position here was read off a pair of traces of the same seed -- the
 * rules agent piloting the deck in the browser and an LLM piloting it -- in
 * which the two seats answered the *same* attack differently. The rules seat
 * trashed OP16-110 Vasco Shot to "redirect" a 7000 attack on its Leader onto its
 * Leader, with three 1-cost `[On K.O.]` bodies standing beside it; the LLM
 * pointed the same attack at one of those bodies, drew the card and kept the
 * Life. Two separate causes, and both are asserted below:
 *
 *  1. the browser resolved the rules seat to `GenericRulesAgent`, so this deck's
 *     policy never ran at all (see `packages/web/src/worker.ts`), and
 *  2. the policy's own pay/skip test assumed a redirect always costs a card, so
 *     it declined the redirect that would have refunded itself.
 *
 * These drive the real agent rather than ranking one action in isolation: the
 * module only `rank`s, so what the seat actually plays is a property of the
 * module *and* `chooseGenericRules`, and asserting on the rank alone would pass
 * while the seat still spent the card.
 */
const DECK = "(Black/Yellow) Marshall.D.Teach - Official Feature Deck";

/** The seat under attack: p2 on this deck, p1 swinging into it. */
const defending = (seed: string) =>
  scenario()
    .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/**
 * Play out the defence the way the app does: hand every decision the defender
 * is offered to its own rules agent until the battle resolves.
 */
async function defend(game: Game): Promise<{
  state: GameState;
  chosen: LegalAction[];
}> {
  const agent = new RegistryRulesAgent("OP16-080");
  const chosen: LegalAction[] = [];
  let state = game.state;
  for (let guard = 0; guard < 20; guard += 1) {
    if (state.phase !== "block" && state.phase !== "counter") break;
    const action = await agent.chooseAction(observe(state, "p2"));
    chosen.push(action);
    state = game.submit(action);
  }
  return { state, chosen };
}

const redirectTarget = (chosen: LegalAction[]): string | undefined =>
  chosen
    .filter(
      (action): action is Extract<LegalAction, { type: "resolve-effect" }> =>
        action.type === "resolve-effect",
    )
    .find(
      (action) =>
        action.sourceCardNumber === "OP16-080" &&
        action.option.kind === "card" &&
        action.option.zone !== "hand",
    )?.optionId;

const paidForRedirect = (chosen: LegalAction[]): boolean =>
  chosen.some(
    (action) =>
      action.type === "resolve-effect" &&
      action.sourceCardNumber === "OP16-080" &&
      action.option.kind === "confirm",
  );

describe("OP16-080's redirect, as the rules seat plays it", () => {
  /**
   * The position from the trace, rebuilt: a connecting Leader-sized attack, three
   * payoff bodies on the board, and exactly one [Trigger] card in hand.
   *
   * The attack is declared rather than installed, because the offer is what is
   * under test: `[On Your Opponent's Attack]` reaches the defender through
   * declaration, and a position that sets `activeAttack` directly never asks.
   *
   * One [Trigger] card is the interesting number. The published guides call two
   * the floor -- the ability is once per *attack*, so a turn with two attacks in
   * it wants two cards -- and the seat used to apply that floor to every
   * redirect. But a redirect into a body that draws on `[On K.O.]` hands the card
   * straight back, so it never touches the budget the floor is protecting.
   */
  const traceLikePosition = (seed: string) =>
    defending(seed)
      .withBoard("p2", [
        character("vasco", "OP16-110"),
        character("docq", "OP16-109"),
        character("augur", "OP16-103"),
      ])
      .withBoard("p1", [character("newgate", "OP16-003", { playedTurn: 1 })])
      .withHand("p2", [
        instance("fuel", "OP16-110"),
        instance("finisher", "OP09-093"),
      ])
      .withLife("p2", 4);

  it("points a connecting attack at a payoff body, not at the Leader", async () => {
    const game = traceLikePosition("teach-redirect-payoff").build();
    const life = game.state.players.p2.life.length;
    game.play({
      type: "attack",
      attackerInstanceId: "newgate",
      targetInstanceId: "p2-leader",
    });

    const { state, chosen } = await defend(game);

    expect(paidForRedirect(chosen)).toBe(true);
    // The whole point: never the Leader, which here is also the target the
    // attack already had -- the strictly empty choice the trace made.
    expect(redirectTarget(chosen)).not.toBe("p2-leader");
    expect(["vasco", "docq", "augur"]).toContain(redirectTarget(chosen));
    // The body died, the Life did not, and the [On K.O.] paid the fuel back.
    expect(state.players.p2.board).toHaveLength(2);
    expect(state.players.p2.life).toHaveLength(life);
    expect(state.players.p2.hand.map((card) => card.cardNumber)).toContain(
      "OP09-093",
    );
  });

  it("redirects on a single [Trigger] card, because the payoff body refunds it", async () => {
    // Same position; stated as its own case because the reserve rule is what
    // used to decline it, and a regression here would read as "the seat is being
    // careful with its budget" rather than as a bug.
    const game = traceLikePosition("teach-redirect-refund").build();
    game.play({
      type: "attack",
      attackerInstanceId: "newgate",
      targetInstanceId: "p2-leader",
    });

    expect(paidForRedirect((await defend(game)).chosen)).toBe(true);
  });

  it("leaves an attack alone when it is already killing a payoff body", async () => {
    // Nothing on the board is worth more than where the attack is already going,
    // so a redirect can only move a good outcome to a worse one, for a card.
    const game = defending("teach-redirect-already-good")
      // Rested, because only a rested Character can be attacked. The redirect
      // itself has no such requirement -- it may name an active body, which is
      // why the positions above leave theirs standing.
      .withBoard("p2", [character("vasco", "OP16-110", { rested: true })])
      .withBoard("p1", [character("newgate", "OP16-003", { playedTurn: 1 })])
      .withHand("p2", [
        instance("fuel", "OP16-110"),
        instance("more-fuel", "OP16-109"),
        instance("third", "OP16-103"),
      ])
      .withLife("p2", 4)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "newgate",
      targetInstanceId: "vasco",
    });

    const { chosen } = await defend(game);

    expect(paidForRedirect(chosen)).toBe(false);
    expect(redirectTarget(chosen)).toBeUndefined();
  });

  it("leaves an attack alone when it already fails against its target", async () => {
    // OP09-086 Jesus Burgess at 6000 outsizes a 3000 attacker, so the battle is
    // already won and the [Trigger] card is worth more next turn -- even though
    // a payoff body is standing right there.
    const game = defending("teach-redirect-whiff")
      .withBoard("p2", [
        character("burgess", "OP09-086", { rested: true }),
        character("vasco", "OP16-110"),
      ])
      .withBoard("p1", [character("sanji", "ST31-001", { playedTurn: 1 })])
      .withTrash("p2", [
        instance("t1", "OP16-109"),
        instance("t2", "OP16-109"),
        instance("t3", "OP16-103"),
        instance("t4", "OP16-103"),
      ])
      .withHand("p2", [
        instance("fuel", "OP16-110"),
        instance("more-fuel", "OP16-109"),
      ])
      .withLife("p2", 4)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "sanji",
      targetInstanceId: "burgess",
    });

    expect(paidForRedirect((await defend(game)).chosen)).toBe(false);
  });
});

/**
 * OP16-104 Catarina Devon's `[When Attacking]` target, as the rules seat names
 * it.
 *
 * From the same family of traces: Devon swung into a board holding a 3000 Sanji
 * and a rested 6000 Luffy, named the *Sanji*, and was turned away by a single
 * 1000 Counter. Devon's whole text is "[printed text omitted -- pnpm card:text OP16-104]", so naming the smallest body on the
 * board is the one choice that makes the ability do nothing.
 *
 * The cause was not Devon-specific and neither is the fix: `chooseGenericRules`
 * answered every choose over the opponent's board by taking the first non-skip
 * option in zone order, so the target was whichever Character happened to sit
 * earliest. `chooseStrongestOpponentTarget` now ranks them by current power for
 * every deck, which is what ST31's policy had been doing alone.
 *
 * Driven through the real agent rather than by calling the helper, because what
 * the seat plays is a property of the whole ladder: the Teach module runs ahead
 * of the generic fallback, and asserting on the helper in isolation would pass
 * while the seat still named the 3000.
 */
describe("OP16-104's copy-power target, as the rules seat names it", () => {
  /** p2 pilots the Teach deck and attacks; p1 holds the two candidate bodies. */
  const attacking = (seed: string) =>
    scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed(seed)
      .atTurn(11, { active: "p2" })
      .bareTable();

  /**
   * Answer p2's decisions with its own rules agent until the copy-power choose
   * has been resolved, collecting what it named.
   */
  async function swing(game: Game): Promise<LegalAction[]> {
    const agent = new RegistryRulesAgent("OP16-080");
    const chosen: LegalAction[] = [];
    let state = game.state;
    for (let guard = 0; guard < 20; guard += 1) {
      if (!state.pendingEffect) break;
      const action = await agent.chooseAction(observe(state, "p2"));
      chosen.push(action);
      state = game.submit(action);
    }
    return chosen;
  }

  const namedTarget = (chosen: LegalAction[]): string | undefined =>
    chosen
      .filter(
        (action): action is Extract<LegalAction, { type: "resolve-effect" }> =>
          action.type === "resolve-effect",
      )
      .find((action) => action.sourceCardNumber === "OP16-104")?.optionId;

  it("names the biggest body on the board, not the first one in the zone", async () => {
    // Sanji is placed first so the old first-offered fallback would take it;
    // Luffy is rested exactly as the trace had it, which the choose ignores --
    // it may name an active or a rested Character alike.
    const game = attacking("teach-devon-strongest")
      .withBoard("p2", [character("devon", "OP16-104", { playedTurn: 1 })])
      .withBoard("p1", [
        character("sanji", "OP10-005"),
        character("luffy", "ST21-014", { rested: true }),
      ])
      .build();

    expect(currentPower(game.state, "p2", "devon")).toBe(3000);
    game.play({
      type: "attack",
      attackerInstanceId: "devon",
      targetInstanceId: "p1-leader",
    });

    expect(namedTarget(await swing(game))).toBe("luffy");
    // The point of naming it: a 3000 body that now trades with their best.
    expect(currentPower(game.state, "p2", "devon")).toBe(6000);
  });
});

/**
 * OP16-110 Vasco Shot's `[On K.O.]` rest target.
 *
 * `chooseStrongestOpponentTarget` already fixes this position, and that is the
 * point: this pins it on a code path the Devon case above does not reach. Devon
 * asks its question from a `[When Attacking]` clause during the attacker's own
 * turn; this one arrives from an `[On K.O.]` that fires *mid-battle*, while the
 * seat is defending and `state.pendingEffect` outlives the counter step. The two
 * suspend and resume through different parts of the engine, and only one of them
 * was covered.
 *
 * From a trace of this seat: with a 1-cost Nami pumped to 4000 by two given
 * DON!! standing beside a 3-cost Sanji at 6000 off his own `[Your Turn]` clause,
 * the fallback rested Nami -- the first body in zone order -- and left the 6000
 * free to swing.
 *
 * One open question this does not settle, recorded because the position is a
 * good illustration of it: the fallback ranks *every* opponent-board choose by
 * current power, and a K.O. arguably wants cost instead, since the loss is not
 * undone at the next refresh and a pumped 1-drop is a worse K.O. than a plain
 * 8-drop. Rest and K.O. are indistinguishable to a policy today -- both arrive
 * as a `mechanic-choice` -- so testing that would need the engine to say which
 * question it is asking. Ranking by power is measured; the alternative is not.
 */
describe("OP16-110 Vasco Shot's [On K.O.] rest, as the rules seat plays it", () => {
  /**
   * Play the whole battle through, past `block`/`counter` and into whatever
   * `[On K.O.]` asks -- Vasco Shot's rest target arrives as a `resolve-effect`
   * while `state.pendingEffect` holds, which can outlast the `counter` phase
   * the redirect tests stop at.
   */
  async function playThrough(game: Game): Promise<LegalAction[]> {
    const agent = new RegistryRulesAgent("OP16-080");
    const chosen: LegalAction[] = [];
    let state = game.state;
    for (let guard = 0; guard < 20; guard += 1) {
      const isBattle = state.phase === "block" || state.phase === "counter";
      if (!isBattle && !state.pendingEffect) break;
      const action = await agent.chooseAction(observe(state, "p2"));
      chosen.push(action);
      state = game.submit(action);
    }
    return chosen;
  }

  const restedTarget = (chosen: LegalAction[]): string | undefined =>
    chosen.find(
      (action): action is Extract<LegalAction, { type: "resolve-effect" }> =>
        action.type === "resolve-effect" &&
        action.sourceCardNumber === "OP16-110" &&
        action.option.kind === "card" &&
        action.option.owner === "opponent",
    )?.optionId;

  it("rests the opponent's most powerful Character, not just the first one offered", async () => {
    // Nami is placed before Sanji so a fallback that took the first offered
    // option would name her, exactly as the trace had it. Vasco is rested
    // because only a rested Character can be attacked; the rest he hands out on
    // the way to the trash has no such requirement.
    const game = defending("teach-vasco-rest")
      .withBoard("p2", [character("vasco", "OP16-110", { rested: true })])
      .withBoard("p1", [
        character("newgate", "OP16-003", { playedTurn: 1 }),
        character("nami", "OP01-016", { playedTurn: 1 }),
        character("sanji", "OP10-005", { playedTurn: 1 }),
      ])
      .withGivenDon("p1", "nami", 2)
      .withLife("p2", 4)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "newgate",
      targetInstanceId: "vasco",
    });

    const chosen = await playThrough(game);

    expect(restedTarget(chosen)).toBe("sanji");
  });
});
