import { describe, expect, it } from "vitest";
import {
  cardBlockIcons,
  hasCardType,
  isStandardLegal,
  requireKnownCard,
} from "@one-piece-sim/cards";
import {
  loadDeck,
  requireSupportedDeck,
  resolveDeck,
} from "@one-piece-sim/decks";
import {
  applyAction,
  createGame,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * OP-17 Purple Kaido: the DON!!-ramp list in
 * `packages/decks/src/op17-kaido-manifest.ts`.
 *
 * The set's own {Animal Kingdom Pirates} cards are covered card-by-card in
 * `test/op17.test.ts`. What lives here is the deck's four off-set identities --
 * EB-04's Kaido, King and Queen and OP07-077's search, none of which any other
 * shipped deck plays -- plus the printed keywords the list's OP17 bodies carry
 * and the composition claims the archetype is built on.
 */

const DECK = "(Purple) Kaido - Official Feature Deck";
const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** The Kaido seat, at a turn where every DON!! it needs is already active. */
function kaido(seed: string, turn = 10) {
  return scenario().decks(DECK, ST31).seed(seed).atTurn(turn, { active: "p1" });
}

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/**
 * Walks the defender's own decisions down to nothing, stopping the moment a
 * registered replacement is offered.
 *
 * Needed because the Kaido seat is never a passive defender: OP17-058's
 * `[On Your Opponent's Attack]` opens a target choice before the Block step on
 * every attack, so a test that simply passes through the battle is answering
 * the wrong prompt. Taking `done` declines that choice and leaves the battle
 * where the test wants it.
 */
function declineDefence(game: {
  state: GameState;
  legalActions: () => ReturnType<typeof getLegalActions>;
  submit: (action: never) => GameState;
}): void {
  for (let guard = 0; guard < 20; guard += 1) {
    const actions = game.legalActions();
    const replacement = actions.find(
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId.startsWith("mechanic:"),
    );
    if (replacement) return;
    const decline = actions.find(
      (action) =>
        action.type === "resolve-effect" &&
        (action.optionId === "done" || action.optionId === "skip"),
    );
    if (decline) {
      game.submit(decline as never);
      continue;
    }
    if (game.state.phase !== "block" && game.state.phase !== "counter") return;
    const pass = actions.find((action) => action.type === "pass");
    if (!pass) return;
    game.submit(pass as never);
  }
  throw new Error("defence never settled");
}

/** Resolves whatever is pending, taking the first option each time. */
function settle(game: { state: GameState; play: (m: never) => GameState }) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard > 20) throw new Error("pending effect never settled");
    guard += 1;
    game.play({ type: "resolve-effect" } as never);
  }
}

describe("the OP-17 Purple Kaido deck list", () => {
  it("loads Bandai's 50-card feature deck behind the OP17-058 Leader", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP17-058");
    expect(loadDeck(DECK)).toHaveLength(50);
  });

  it("is Standard-legal on every slot, and reaches back only as far as EB-04", () => {
    // Bandai's list is OP-17 plus the two EB-04 ramp engines, so unlike the
    // guide list it replaced there is no block-2 printing in it to rotate
    // first. Every slot is block 3 or above.
    const manifest = requireSupportedDeck(DECK);
    for (const cardNumber of [
      manifest.leader,
      ...Object.keys(manifest.cards),
    ]) {
      expect(isStandardLegal(cardNumber), cardNumber).toBe(true);
      expect(cardBlockIcons(cardNumber), cardNumber).not.toContain("2");
    }
    expect(
      Object.keys(manifest.cards).filter(
        (cardNumber) => !cardNumber.startsWith("OP17-"),
      ),
    ).toEqual(["EB04-032", "EB04-031"]);
  });

  it("spends 18 of its 50 slots on bodies costing 9 or more", () => {
    // The archetype's whole plan and its whole weakness: the deck is built to
    // reach a turn where these are castable, and until it does they are cards
    // it cannot play. `EB04-032` Queen's [On Play] and OP17-063's static
    // Counter are both printed answers to the same fact. Bandai's list carries
    // three more of them than the guide list did -- OP17-062 and OP17-063 both
    // go to four -- which is what the extra ramp is for.
    const manifest = requireSupportedDeck(DECK);
    const fatties = Object.entries(manifest.cards)
      .filter(([cardNumber]) => (requireKnownCard(cardNumber).cost ?? 0) >= 9)
      .reduce((total, [, quantity]) => total + quantity, 0);
    expect(fatties).toBe(18);
  });

  it("keeps OP17-074 Yamato as its one body outside {Animal Kingdom Pirates}", () => {
    // The trap `op17-xebec-manifest.ts` flags for OP08-051 Buckin, surviving
    // into Bandai's own list: Yamato is printed {Land of Wano} and answers to
    // none of the deck's tribal clauses -- not OP17-061's deploy, not the
    // Leader-type gates on King, Queen, Sasaki, OP17-060 or OP17-078. It earns
    // its four slots anyway because its own [On Play] ramp reads no type at
    // all, and it is the only one of them on a [Blocker]. Anything else
    // arriving off-tribe is a slot to question, which is what this asserts.
    const manifest = requireSupportedDeck(DECK);
    const offTribe = Object.keys(manifest.cards).filter(
      (cardNumber) =>
        requireKnownCard(cardNumber).category === "character" &&
        !hasCardType(cardNumber, "Animal Kingdom Pirates"),
    );
    expect(offTribe).toEqual(["OP17-074"]);
    expect(requireKnownCard("OP17-074").types).toEqual(["Land of Wano"]);
    expect(hasCardType("OP17-073", "Animal Kingdom Pirates")).toBe(true);
  });
});

describe("EB04-032 Queen", () => {
  covers("EB04-032", "[On Play]", "[Activate: Main]");

  it("trades an {Animal Kingdom Pirates} card from hand for two cards", () => {
    const game = kaido("eb04-032-on-play", 3)
      .bareTable()
      .withHand("p1", [
        instance("queen", "EB04-032"),
        // A cost-10 Kaido: the brick the clause exists to convert.
        instance("brick", "OP17-062"),
      ])
      .withDeckTop("p1", copies(2, "OP17-076", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-032" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "brick" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn-1",
      "drawn-2",
    ]);
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP17-062",
    ]);
  });

  it("EB04-032:boundary offers no trade with no tribal card in hand", () => {
    // Without the printed-type gate this would prompt for a cost the hand
    // cannot pay, and `optional` would have nothing behind its prompt.
    const game = kaido("eb04-032-boundary", 3)
      .bareTable()
      .withHand("p1", [
        instance("queen", "EB04-032"),
        // ST18-001 Uso-Hachi is the deck's own non-tribal body.
        instance("offtribe", "ST18-001"),
      ])
      .withDeckTop("p1", copies(2, "OP17-076", "undrawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-032" });

    expect(effectOptions(game.state)).toEqual([]);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "offtribe",
    ]);
  });

  it("turns two active DON!! into a rested one from the DON!! deck", () => {
    const game = kaido("eb04-032-activate", 4)
      .bareTable()
      .withBoard("p1", [character("queen", "EB04-032")])
      .withDonDeck("p1", 3)
      .build();

    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", sourceInstanceId: "queen" });

    expect(game.state.players.p1.activeDon).toHaveLength(before - 2);
    // The two rested by the cost, plus the one added rested from the deck.
    expect(game.state.players.p1.restedDon).toHaveLength(3);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });
});

describe("EB04-031 King", () => {
  covers("EB04-031", "[Activate: Main]", "static");

  it("adds one active and one rested DON!! once per turn", () => {
    const game = kaido("eb04-031-ramp", 6)
      .bareTable()
      .withBoard("p1", [character("king", "EB04-031")])
      .withDonDeck("p1", 4)
      .build();

    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", sourceInstanceId: "king" });
    settle(game);

    expect(game.state.players.p1.activeDon).toHaveLength(before + 1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
    // `[Once Per Turn]`: the second activation is not on offer.
    expect(
      game
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "king",
        ),
    ).toEqual([]);
  });

  it("EB04-031:boundary adds nothing while a second [King] is on the board", () => {
    // "[printed text omitted -- pnpm card:text EB04-031]" -- two copies make neither usable,
    // which is why the list runs four to see one rather than to stack them.
    const game = kaido("eb04-031-pair", 6)
      .bareTable()
      .withBoard("p1", [
        character("king-a", "EB04-031"),
        character("king-b", "EB04-031"),
      ])
      .withDonDeck("p1", 4)
      .build();

    // The offer itself is withheld: `bareGateCondition` reads the program's
    // top-level `if` and a clause that would resolve to nothing is not put on
    // the table, which is what stops a rules agent from spending the
    // `[Once Per Turn]` on it.
    expect(
      game
        .legalActions()
        .filter((action) => action.type === "activate-main")
        .map((action) => action.sourceInstanceId),
    ).not.toContain("king-a");
    expect(game.state.players.p1.donDeck).toHaveLength(4);
  });

  it("returns a DON!! to the DON!! deck instead of dying in battle", () => {
    const game = scenario()
      .decks(DECK, ST31)
      .seed("eb04-031-replacement")
      .atTurn(11, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("king", "EB04-031", { rested: true })])
      // ST31-002 is a 5-cost 6000: enough to beat King's 7000 with DON!! on it,
      // so the DON!! given here is what makes the battle lethal.
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withGivenDon("p2", "attacker", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "king",
    });
    declineDefence(game);
    const replacement = game
      .legalActions()
      .find(
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId.startsWith("mechanic:"),
      );
    expect(replacement).toBeDefined();
    const donBefore = game.state.players.p1.donDeck.length;
    game.play({ actionId: replacement!.actionId });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("king");
    expect(game.state.players.p1.donDeck).toHaveLength(donBefore + 1);
  });

  it("EB04-031:boundary is not offered with no DON!! on the field to pay with", () => {
    const game = scenario()
      .decks(DECK, ST31)
      .seed("eb04-031-broke")
      .atTurn(11, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("king", "EB04-031", { rested: true })])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withGivenDon("p2", "attacker", 2)
      // Every DON!! p1 owns goes back to the DON!! deck, so the cost is
      // unpayable and the offer must be withheld rather than made for free.
      .withDonDeck("p1", 10)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "king",
    });
    declineDefence(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("king");
  });
});

describe("EB04-030 Kaido", () => {
  covers("EB04-030", "[On Play]", "static");

  it("gains [Rush] and rests a cost-7-or-less Character for DON!! −2", () => {
    const game = kaido("eb04-030-on-play", 9)
      .bareTable()
      .withHand("p1", [instance("kaido", "EB04-030")])
      .withBoard("p2", [character("blocker", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-030" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "kaido", "Rush")).toBe(true);
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
    // [Rush] is the point of the clause: the body attacks the turn it lands.
    expect(
      game.action({
        type: "attack",
        attackerInstanceId: "kaido",
        targetInstanceId: "p2-leader",
      }),
    ).toBeDefined();
  });

  it("survives battle destruction for one DON!! from the field", () => {
    const game = scenario()
      .decks(DECK, ST31)
      .seed("eb04-030-replacement")
      .atTurn(11, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("kaido", "EB04-030", { rested: true })])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withGivenDon("p2", "attacker", 4)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "kaido",
    });
    declineDefence(game);
    const replacement = game
      .legalActions()
      .find(
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId.startsWith("mechanic:"),
      );
    expect(replacement).toBeDefined();
    game.play({ actionId: replacement!.actionId });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("kaido");
  });
});

describe("OP07-077 We're Going to Claim the One Piece!!!", () => {
  covers("OP07-077", "[Main]", "[Trigger]");

  it("digs five deep for a tribal card under the {Animal Kingdom Pirates} Leader", () => {
    const game = kaido("op07-077-main", 4)
      .bareTable()
      .withHand("p1", [instance("search", "OP07-077")])
      .withDeckTop("p1", [
        instance("off-1", "ST18-001"),
        instance("off-2", "ST18-001"),
        instance("king", "EB04-031"),
        instance("off-3", "ST18-001"),
        instance("off-4", "ST18-001"),
        instance("deep", "OP17-062"),
      ])
      .build();

    // An Event with a `[Main]` program is offered as an activation, not as a
    // plain `play-card`.
    game.play({ type: "activate-main", sourceInstanceId: "search" });
    // Only the tribal card among the five is offered; the sixth is out of reach.
    expect(effectOptions(game.state)).toEqual(["king", "done"]);
    game.play({ type: "resolve-effect", optionId: "king" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "king",
    ]);
    // The other four go to the bottom, leaving the sixth card on top.
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("deep");
  });

  it("runs the same search off its Life Trigger", () => {
    const game = scenario()
      .decks(ST31, DECK)
      .seed("op07-077-trigger")
      .atTurn(5, { active: "p1" })
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [instance("life-trigger", "OP07-077")])
      .withDeckTop("p2", [instance("found", "EB04-031")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "found" });
    settle(game);

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });
});

describe("OP17-076 Wo Ro Ro Ro Ro... I Think I've Sobered Up", () => {
  covers("OP17-076", "[Trigger]");

  it("draws 2 off its Life Trigger for DON!! −1", () => {
    const game = scenario()
      .decks(ST31, DECK)
      .seed("op17-076-trigger")
      .atTurn(6, { active: "p1" })
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [instance("life-trigger", "OP17-076")])
      .withDeckTop("p2", copies(2, "OP17-073", "drawn"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    // Measured here rather than before the attack: declining the Leader's own
    // reaction is itself a decision that can move DON!!, and the number this
    // asserts on is the Trigger's own `DON!! −1`.
    const donBefore = game.state.players.p2.donDeck.length;
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["drawn-1", "drawn-2"]),
    );
    expect(game.state.players.p2.donDeck.length).toBe(donBefore + 1);
  });
});

describe("the deck's printed keywords", () => {
  covers("OP17-062", "[Blocker]");
  covers("OP17-074", "[Blocker]");

  it.each(["OP17-062", "OP17-074"])(
    "%s blocks a declared attack and rests doing it",
    (cardNumber) => {
      const game = scenario()
        // ST31 on both sides: the cards under test are the two [Blocker]
        // bodies placed on the board, and the Kaido Leader's own
        // `[On Your Opponent's Attack]` would open a choice before the Block
        // step that has nothing to do with either of them.
        .decks(ST31, "(Green) Roronoa Zoro - Starter Deck 32")
        .seed(`kaido-blocker-${cardNumber}`)
        .atTurn(5, { active: "p1" })
        .bareTable()
        .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
        .withBoard("p2", [character("blocker", cardNumber)])
        .build();

      expect(hasKeyword(game.state, "p2", "blocker", "Blocker")).toBe(true);
      game.play({
        type: "attack",
        attackerInstanceId: "attacker",
        targetInstanceId: "p2-leader",
      });
      game.play({ type: "block", blockerInstanceId: "blocker" });

      expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
      expect(game.state.players.p2.board[0]?.rested).toBe(true);
    },
  );
});

describe("OP17-065 Queen's [Banish]", () => {
  covers("OP17-065", "[Banish]");

  it("trashes the damaged Life card without opening its Trigger window", () => {
    const game = kaido("op17-065-banish", 10)
      .bareTable()
      .withBoard("p1", [character("queen", "OP17-065", { playedTurn: 1 })])
      // A Life card that prints a Trigger, so the "[printed text omitted -- pnpm card:text OP17-065]" half of the keyword is what the assertions separate.
      .withLife("p2", [instance("banished", "OP17-076")])
      .build();

    expect(requireKnownCard("OP17-076").trigger).not.toBe("");
    game.play({
      type: "attack",
      attackerInstanceId: "queen",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    expect(game.state.phase).not.toBe("trigger");
    expect(game.state.pendingTrigger).toBeNull();
    expect(game.state.players.p2.life).toHaveLength(0);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "banished",
    ]);
  });
});

describe("OP17-069 Jack", () => {
  covers("OP17-069", "[On Play]");

  it("debuffs an opposing Character by 2000 for DON!! −1", () => {
    const game = kaido("op17-069-on-play", 10)
      .bareTable()
      .withHand("p1", [instance("jack", "OP17-069")])
      .withBoard("p2", [character("target", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-069" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    settle(game);

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -2000 }),
    );
  });
});

/**
 * The two `DON!! −N` clauses this deck reaches for while tapped out.
 *
 * `returnDonToDeck` pays the cost from rested DON!! first, so "[printed text omitted -- pnpm card:text <card>]" is payable with an empty cost area -- and both of these
 * clauses only ever come up with an empty cost area. Their gate used to read
 * `requires: { activeDon: 1 }`, which asked for a resource the cost does not
 * spend and switched both abilities off in the position they are printed for.
 */
describe("the deck's DON!! −N clauses, paid from rested DON!!", () => {
  covers("OP17-058", "[On Your Opponent's Attack]");
  covers("OP17-063", "[Activate: Main]");

  it("OP17-058:boundary debuffs on defence after a turn that spent every DON!!", () => {
    const game = scenario()
      .decks(DECK, ST31)
      .seed("op17-058-rested-don")
      .atTurn(11, { active: "p2" })
      .bareTable()
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withGivenDon("p2", "attacker", 2)
      // The normal state of a ramp deck between turns: everything it added is
      // on the field and rested, and nothing is left in the cost area. This is
      // when [On Your Opponent's Attack] is the Leader's whole contribution.
      .withDon("p1", { rested: 10 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    const offer = game
      .legalActions()
      .find(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      );
    expect(offer, "the Leader was never offered its debuff").toBeDefined();
    game.play({ actionId: offer!.actionId });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -2000 }),
    );
    // Paid out of the rested pile, not the empty active one.
    expect(game.state.players.p1.restedDon).toHaveLength(9);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("OP17-058:boundary lets the ramp deck decline the DON!! rather than pay it", () => {
    // "[printed text omitted -- pnpm card:text OP17-058]" Both of this Leader's windows open on their own, on
    // every attack either player declares, so a cost it could not refuse would
    // hand a DON!! back every turn -- which halves the growth rate of a deck
    // whose whole plan is the DON!! count.
    const game = scenario()
      .decks(DECK, ST31)
      .seed("op17-058-declined")
      .atTurn(11, { active: "p2" })
      .bareTable()
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withGivenDon("p2", "attacker", 2)
      .withDon("p1", { rested: 10 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.restedDon).toHaveLength(10);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(game.state.players.p2.board[0]?.powerModifiers).toEqual([]);
  });

  it("OP17-063:boundary K.O.s on the turn the cost-10 body emptied the cost area", () => {
    const game = kaido("op17-063-tapped-out", 12)
      .bareTable()
      .withHand("p1", [instance("kaido", "OP17-063")])
      .withBoard("p2", [character("victim", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-063" });
    settle(game);
    // "[printed text omitted -- pnpm card:text OP17-063]" is the only turn the K.O.
    // can fire, and paying 10 for the body is what makes that turn tapped out.
    expect(game.state.players.p1.activeDon).toHaveLength(0);

    game.play({ type: "activate-main", sourceInstanceId: "kaido" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(9);
  });
});

describe("the deck plays a full game against the format", () => {
  it("full-game-smoke reaches a result against ST31 without an illegal state", () => {
    let state = createGame({
      gameId: "op17-kaido-smoke",
      p1: resolveDeck(DECK),
      p2: resolveDeck(ST31),
      seed: "op17-kaido-smoke",
    });
    for (let step = 0; step < 4_000 && state.phase !== "finished"; step += 1) {
      const legal = getLegalActions(state, state.activePlayer);
      expect(legal.length, `no legal action in ${state.phase}`).toBeGreaterThan(
        0,
      );
      state = applyAction(state, {
        ...legal[0]!,
        revision: state.revision,
      }).state;
    }
    expect(state.phase).toBe("finished");
  });
});
