import { describe, expect, it } from "vitest";
import { loadDeck, requireSupportedDeck } from "@one-piece-sim/decks";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The Red/Green Straw Hat rush package around ST30-001: the Leader, the
 * [Monkey.D.Luffy] bodies its +3000 clause is for, and the Events that name
 * them. The identities come in with their own sets (ST-21, ST-30, OP-12,
 * OP-14, EB-02, EB-04 and the promo page); what is here is the cards no other
 * test drives.
 *
 * The Leader gets the first section because its two clauses are the deck: the
 * −2000 penalty is the *reason* nothing in the list is printed above 6000, and
 * the +3000 on the opponent's turn is what those 6000s are for.
 */

/**
 * The cards below are placed by hand, so the deck only has to be a legal fifty
 * behind ST30-001: the ST-30 starter, which shares the Leader.
 */
const DECK = "(Red/Green) Luffy & Ace - Starter Deck 30";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";
/** The Straw Hat rush list under the same Leader, which plays ST21-003. */
const OPEN_LIST = "(Red/Green) Luffy & Ace - Open OPTCG";

/** p1 on the play with a clear board and all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p1 defending, for the clauses that only fire under an attack. */
const defending = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Resolve the rest of an open effect, taking the first offer at each step. */
function finish(game: {
  state: GameState;
  play: (matcher: { type: "resolve-effect" }) => unknown;
}) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

/**
 * Decline the block and Counter steps of a declared attack, so the battle
 * resolves. A loop because the engine skips a step the defender cannot act in.
 */
const declineDefence = (game: {
  state: { phase: string };
  pass: () => void;
}) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

describe("OP-17 Red/Green Luffy & Ace deck list", () => {
  it("loads a 50-card list behind ST30-001", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("ST30-001");
    expect(loadDeck(DECK)).toHaveLength(50);
  });
});

describe("(Red/Green) Luffy & Ace - Open OPTCG", () => {
  it("loads a 50-card list behind ST30-001", () => {
    const manifest = requireSupportedDeck(OPEN_LIST);
    expect(manifest.leader).toBe("ST30-001");
    expect(loadDeck(OPEN_LIST)).toHaveLength(50);
  });
});

describe("ST30-001 Luffy & Ace (Leader)", () => {
  covers("ST30-001", "static", "[Opponent's Turn]");

  it("stays 6000 while every Character is printed at 6000 or less", () => {
    // The shipped list, exactly: ST30-012 is the biggest body it plays.
    const game = table("st30-001-clean")
      .withBoard("p1", [character("luffy", "ST30-012")])
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  it("drops to 4000 next to a 7000-base-power Character", () => {
    // Not a card this list plays -- that is the point. OP16-011 Vista is an
    // 8000, and the penalty is what the deck is built to never turn on.
    const game = table("st30-001-penalty")
      .withBoard("p1", [character("vista", "OP16-011")])
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(4000);
  });

  it("reads the opponent's board, not its own, for the penalty", () => {
    // "If *you* have a Character": an opposing 8000 does nothing.
    const game = table("st30-001-their-body")
      .withBoard("p2", [character("vista", "OP16-011")])
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  it("gives every [Monkey.D.Luffy] +3000 on the opponent's turn", () => {
    const game = defending("st30-001-defence")
      .withBoard("p1", [
        // 6000 printed, and named [Monkey.D.Luffy]: the deck's wall.
        character("rush-luffy", "ST21-014"),
        // Named [Nami], so outside the clause however green it is.
        character("nami", "EB02-017"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "rush-luffy")).toBe(9000);
    expect(currentPower(game.state, "p1", "nami")).toBe(2000);
    // The Leader is named "Luffy & Ace" and so is not one of "your
    // [Monkey.D.Luffy] cards" -- it does not buff itself.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  it("gives nothing on its controller's own turn", () => {
    const game = table("st30-001-own-turn")
      .withBoard("p1", [character("rush-luffy", "ST21-014")])
      .build();

    expect(currentPower(game.state, "p1", "rush-luffy")).toBe(6000);
  });
});

describe("ST21-014 Monkey.D.Luffy", () => {
  covers("ST21-014", "[Rush]", "[When Attacking]");

  it("attacks the turn it is played and banks a rested DON!!", () => {
    const game = table("st21-014-rush")
      .withHand("p1", [instance("luffy", "ST21-014")])
      // One DON!! already rested, so the [When Attacking] has one to give.
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "play-card", cardNumber: "ST21-014" });
    // [Rush]: legal to attack on the turn it arrived.
    game.play({ type: "attack", attackerInstanceId: "luffy" });

    // [When Attacking]: the rested DON!! moves onto a card of the player's
    // choosing. Taking the first offer is the Leader.
    finish(game);
    declineDefence(game);

    expect(game.state.players.p1.leaderAttachedDon.length).toBe(1);
  });
});

describe("ST30-012 Monkey.D.Luffy", () => {
  covers("ST30-012", "[On Play]", "[When Attacking]");

  it("buys [Rush] for one rested DON!!", () => {
    const game = table("st30-012-rush")
      .withHand("p1", [instance("luffy", "ST30-012")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-012" });
    // "You may": the offer is an apply/skip prompt, and applying rests the DON!!.
    game.play({ type: "resolve-effect", optionId: "apply" });
    finish(game);

    // Four rested to pay the printed cost, and a fifth for the clause.
    expect(game.state.players.p1.restedDon).toHaveLength(5);
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "luffy",
        ),
    ).toBe(true);
  });

  it("declining the cost leaves it unable to attack", () => {
    const game = table("st30-012-no-rush")
      .withHand("p1", [instance("luffy", "ST30-012")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-012" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    finish(game);

    // Only the four the printed cost rested.
    expect(game.state.players.p1.restedDon).toHaveLength(4);
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "luffy",
        ),
    ).toBe(false);
  });

  it("offers only the opponent's [Blocker] Characters when it attacks", () => {
    const game = table("st30-012-blocker")
      .withBoard("p1", [character("luffy", "ST30-012")])
      .withBoard("p2", [
        // ST31-002 Jinbe prints [Blocker].
        character("jinbe", "ST31-002"),
        // ST31-001 Sanji does not: a 5-cost body that is in the way of nothing.
        character("sanji", "ST31-001"),
      ])
      .build();

    game.play({ type: "attack", attackerInstanceId: "luffy" });

    // The [Blocker] and the decline, and not the Character without the keyword.
    expect(effectOptions(game.state)).toEqual(["jinbe", "done"]);
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    finish(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "jinbe")
        ?.rested,
    ).toBe(true);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "sanji")
        ?.rested,
    ).toBe(false);
  });

  it("names [Blocker] as its target, and is not one itself", () => {
    // The only [Blocker] in the text is the opponent's: reading it as printed
    // let this Luffy block attacks aimed at its Leader.
    const game = defending("st30-012-not-blocker")
      .withBoard("p1", [character("luffy", "ST30-012")])
      .build();

    expect(hasKeyword(game.state, "p1", "luffy", "Blocker")).toBe(false);
    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("offers nothing when the opponent has no [Blocker] to rest", () => {
    const game = table("st30-012-no-blocker")
      .withBoard("p1", [character("luffy", "ST30-012")])
      .withBoard("p2", [character("sanji", "ST31-001")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "luffy" });
    finish(game);
    declineDefence(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "sanji")
        ?.rested,
    ).toBe(false);
  });
});

describe("ST21-003 Sanji", () => {
  covers("ST21-003", "[On Play]");

  const sanjiTable = (seed: string) =>
    scenario()
      .decks(OPEN_LIST, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable();

  it("takes [Blocker] away from the chosen 6000's attack", () => {
    const game = sanjiTable("st21-003-silence")
      .withHand("p1", [instance("sanji", "ST21-003")])
      .withBoard("p1", [
        // ST21-014 is a 6000 {Straw Hat Crew}; ST31-001 Sanji is a 3000.
        character("luffy", "ST21-014"),
        character("small", "ST31-001"),
      ])
      // ST31-002 Jinbe prints [Blocker].
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST21-003" });
    // Only the 6000-or-more body is offered, and the decline.
    expect(effectOptions(game.state)).toEqual(["luffy", "done"]);
    game.play({ type: "resolve-effect", optionId: "luffy" });
    finish(game);

    game.play({ type: "attack", attackerInstanceId: "luffy" });
    finish(game);
    expect(
      game.legalActions("p2").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("leaves [Blocker] live against a Character it did not choose", () => {
    const game = sanjiTable("st21-003-unchosen")
      .withHand("p1", [instance("sanji", "ST21-003")])
      .withBoard("p1", [
        character("luffy", "ST21-014"),
        character("other", "ST30-012"),
      ])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST21-003" });
    game.play({ type: "resolve-effect", optionId: "luffy" });
    finish(game);

    game.play({ type: "attack", attackerInstanceId: "other" });
    // ST30-012's own [When Attacking] would rest the Blocker; decline it so
    // the block step is what is being read.
    if (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "done" });
    }
    finish(game);
    expect(
      game
        .legalActions("p2")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "jinbe",
        ),
    ).toBe(true);
  });
});

describe("OP12-015 Monkey.D.Luffy", () => {
  covers("OP12-015", "static", "[On Play]");

  it("gains +2000 once two DON!! are given anywhere on the field", () => {
    // "a total of ... given DON!! cards": the Leader's two count, even though
    // none of them is on this Character.
    const game = table("op12-015-buff")
      .withBoard("p1", [character("luffy", "OP12-015")])
      .withDon("p1", { leaderAttached: 2 })
      .build();

    expect(currentPower(game.state, "p1", "luffy")).toBe(6000);
  });

  it("stays 4000 one given DON!! short", () => {
    const game = table("op12-015-short")
      .withBoard("p1", [character("luffy", "OP12-015")])
      .withDon("p1", { leaderAttached: 1 })
      .build();

    expect(currentPower(game.state, "p1", "luffy")).toBe(4000);
  });

  it("reveals two Events to play a small red body and bank a DON!!", () => {
    const game = table("op12-015-on-play")
      .withHand("p1", [
        instance("luffy", "OP12-015"),
        instance("kick", "OP04-016"),
        instance("haki", "OP12-018"),
        // Red, 2000 printed: inside "3000 power or less".
        instance("nami", "OP01-016"),
      ])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-015" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    finish(game);

    // The two Events are still in hand -- a reveal spends nothing, which is
    // what makes this affordable in a list running eleven of them.
    const hand = game.state.players.p1.hand.map((card) => card.instanceId);
    expect(hand).toContain("kick");
    expect(hand).toContain("haki");
    expect(hand).not.toContain("nami");
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("nami");
    // "[printed text omitted -- pnpm card:text <card>]": one of the rested DON!! moves onto
    // a card rather than staying in the cost area.
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("is not offered on a hand holding one Event", () => {
    const game = table("op12-015-one-event")
      .withHand("p1", [
        instance("luffy", "OP12-015"),
        instance("kick", "OP04-016"),
        instance("nami", "OP01-016"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-015" });
    finish(game);

    // The cost cannot be paid, so the body arrives with nothing attached to it.
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("nami");
  });
});

describe("EB02-017 Nami", () => {
  covers("EB02-017", "[On Play]");

  it("digs five deep for a {Straw Hat Crew} card that is not a [Nami]", () => {
    const game = table("eb02-017-search")
      .withHand("p1", [instance("nami", "EB02-017")])
      .withDeckTop("p1", [
        // Named [Nami], so excluded however {Straw Hat Crew} she is.
        instance("other-nami", "OP01-016"),
        instance("sanji", "ST31-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-017" });

    expect(effectOptions(game.state)).toContain("sanji");
    expect(effectOptions(game.state)).not.toContain("other-nami");
    game.play({ type: "resolve-effect", optionId: "sanji" });
    finish(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "sanji",
    );
    // "Place the rest at the bottom of your deck": the five looked at are five
    // fewer cards on top, not five fewer cards.
    expect(game.state.players.p1.deck.map((card) => card.instanceId)).toContain(
      "other-nami",
    );
  });
});

describe("EB04-002 Jewelry Bonney", () => {
  covers("EB04-002", "[On Play]");

  it("digs four deep across {Egghead} and {Straw Hat Crew}", () => {
    const game = table("eb04-002-search")
      .withHand("p1", [instance("bonney", "EB04-002")])
      .withDeckTop("p1", [
        instance("sanji", "ST31-001"),
        // A {Bonney Pirates} body that is neither type, and is a [Jewelry
        // Bonney] besides.
        instance("other-bonney", "EB04-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-002" });

    expect(effectOptions(game.state)).toContain("sanji");
    expect(effectOptions(game.state)).not.toContain("other-bonney");
    game.play({ type: "resolve-effect", optionId: "sanji" });
    finish(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "sanji",
    );
  });
});

describe("P-135 Monkey.D.Luffy", () => {
  covers("P-135", "[On Play]", "[Blocker]");

  it("rests a cost-5-or-less Character on the way in", () => {
    const game = table("p-135-rest")
      .withHand("p1", [instance("luffy", "P-135")])
      .withBoard("p2", [
        // ST31-001 Sanji costs exactly 5: on the boundary, and inside it.
        character("sanji", "ST31-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "P-135" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    finish(game);

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  it("offers nothing above the printed cost ceiling", () => {
    const game = table("p-135-too-big")
      .withHand("p1", [instance("luffy", "P-135")])
      // OP16-005 Thatch costs 8.
      .withBoard("p2", [character("thatch", "OP16-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-135" });
    finish(game);

    expect(game.state.players.p2.board[0]?.rested).toBe(false);
  });

  it("is offered as a [Blocker] when the Leader is attacked", () => {
    const game = defending("p-135-blocker")
      .withBoard("p1", [character("luffy", "P-135")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "attacker" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "luffy",
        ),
    ).toBe(true);
  });
});

describe("ST21-017 Gum-Gum Mole Pistol", () => {
  covers("ST21-017", "[Main]", "[Trigger]");

  it("shrinks a body into range and then K.O.s it", () => {
    const game = table("st21-017-combo")
      // The gate: "[printed text omitted -- pnpm card:text ST21-017]" of your own.
      .withBoard("p1", [character("luffy", "ST30-012")])
      // 7000 printed is 2000 after the −5000, which is the whole card.
      .withBoard("p2", [character("target", "OP12-031")])
      .withHand("p1", [instance("pistol", "ST21-017")])
      .build();

    game.play({ summary: "Activate Gum-Gum Mole Pistol" });
    game.play({ type: "resolve-effect", optionId: "target" });
    game.play({ type: "resolve-effect", optionId: "target" });
    finish(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("still debuffs when the 6000-power gate is not met", () => {
    const game = table("st21-017-no-gate")
      // A 2000-power body: the gate fails, so only the first half runs.
      .withBoard("p1", [character("nami", "EB02-017")])
      .withBoard("p2", [character("target", "OP12-031")])
      .withHand("p1", [instance("pistol", "ST21-017")])
      .build();

    game.play({ summary: "Activate Gum-Gum Mole Pistol" });
    game.play({ type: "resolve-effect", optionId: "target" });
    finish(game);

    expect(game.state.players.p2.board).toHaveLength(1);
    expect(currentPower(game.state, "p2", "target")).toBe(2000);
  });

  it("runs the same program off a Life card", () => {
    const game = defending("st21-017-trigger")
      .withBoard("p1", [character("luffy", "ST30-012")])
      .withBoard("p2", [
        // 8000, so the attack beats a 6000 Leader and takes the Life card.
        character("attacker", "OP16-011"),
        character("target", "OP12-031"),
      ])
      .withLife("p1", [instance("pistol", "ST21-017")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "attacker" });
    declineDefence(game);
    // The Life card flips face-up and its [Trigger] is offered.
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "target" });
    game.play({ type: "resolve-effect", optionId: "target" });
    finish(game);

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("target");
  });
});

describe("OP12-018 Color of the Supreme King Haki", () => {
  covers("OP12-018", "[Counter]");

  const ATTACK = {
    attackerPlayerId: "p2",
    defenderPlayerId: "p1",
    attackerInstanceId: "attacker",
    targetInstanceId: "wall",
    attackPower: 6000,
    counterPower: 0,
  } as const;

  const underAttack = (seed: string) =>
    defending(seed)
      .withHand("p1", [instance("haki", "OP12-018")])
      .withBoard("p1", [character("wall", "ST21-014")])
      .withBoard("p2", [
        character("attacker", "ST31-002"),
        character("bystander", "ST31-001"),
      ])
      .withActiveAttack(ATTACK, "counter")
      .build();

  it("adds +2000 to the Character being attacked", () => {
    const game = underAttack("op12-018-counter");

    game.play({ type: "activate-counter-event", eventInstanceId: "haki" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    finish(game);

    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });

  it("rests a DON!! to shrink the opponent's whole side for the turn", () => {
    const game = underAttack("op12-018-sweep");
    const restedBefore = game.state.players.p1.restedDon.length;

    game.play({ type: "activate-counter-event", eventInstanceId: "haki" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    finish(game);

    expect(game.state.players.p1.restedDon.length).toBe(restedBefore + 1);
    // "Your opponent's Leader and *all* of their Characters", including the one
    // that is not in this battle.
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(4000);
    expect(currentPower(game.state, "p2", "bystander")).toBe(2000);
  });
});
