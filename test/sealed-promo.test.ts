import { describe, expect, it } from "vitest";
import {
  cardFacts,
  cardRegistry,
  hasCardAttribute,
  hasCardName,
  hasCardType,
  isIdentityWildcard,
  requireKnownCard,
  requirePlayableCard,
} from "@one-piece-sim/cards";
import {
  applyAction,
  createGame,
  effectiveCost,
  getLegalActions,
  type GameState,
} from "@one-piece-sim/engine-core";

import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

const WILDCARD = "SEALED-LUFFY";

function scenario(leaderCardNumber: string): GameState {
  const state = createGame({
    gameId: "sealed-promo-test",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("FIXTURE-BLUE"),
    seed: "sealed-promo",
  });
  state.turn = 3;
  state.phase = "main";
  setTurnPlayer(state, "p1");
  state.pendingEffect = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  state.oncePerTurn = [];
  for (const playerId of ["p1", "p2"] as const) {
    Object.assign(state.players[playerId], {
      hand: [],
      deck: [],
      board: [],
      stage: null,
      trash: [],
      activeDon: Array.from(
        { length: 10 },
        (_, i) => `${playerId}-active-${i}`,
      ),
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
    });
  }
  state.players.p1.leaderCardNumber = leaderCardNumber;
  return state;
}

const character = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
  rested: false,
  playedTurn: 1,
  attachedDon: [] as string[],
  powerModifiers: [],
});

describe("Sealed Battle promo Leader identity", () => {
  it("registers with the stats both retailer sources agree on", () => {
    const card = requirePlayableCard(WILDCARD);
    expect(card.category).toBe("leader");
    // A Leader's `cost` field carries its Life; 4 for this promo.
    expect(card.cost).toBe(4);
    expect(card.power).toBe(5000);
    expect(card.attribute).toBe("Strike");
    expect(card.types).toEqual(["Straw Hat Crew"]);
    expect([...(card.colors ?? [])].sort()).toEqual([
      "Black",
      "Blue",
      "Green",
      "Purple",
      "Red",
      "Yellow",
    ]);
  });

  it("deals 4 Life through the normal setup path", () => {
    expect(cardFacts(WILDCARD).cost).toBe(4);
    // It prints no DON!! text, so it runs the standard ten-card DON!! deck.
    expect(cardFacts(WILDCARD).donDeckSize).toBe(10);
  });
});

describe("identity wildcard resolution", () => {
  it("is derived from printed text, not a card-number list", () => {
    expect(isIdentityWildcard(WILDCARD)).toBe(true);
    expect(isIdentityWildcard("ST21-001")).toBe(false);
    expect(isIdentityWildcard("OP17-001")).toBe(false);
  });

  it("answers to every card name", () => {
    for (const name of [
      "Edward.Newgate",
      "Charlotte Linlin",
      "Shanks",
      "Enel",
    ]) {
      expect(hasCardName(WILDCARD, name)).toBe(true);
    }
    // Its own printed name still works, and other cards are unaffected.
    expect(hasCardName(WILDCARD, "Monkey.D.Luffy")).toBe(true);
    expect(hasCardName("ST21-001", "Edward.Newgate")).toBe(false);
  });

  it("answers to every card type", () => {
    for (const type of [
      "Elbaph",
      "Animal Kingdom Pirates",
      "Red-Haired Pirates",
      "Big Mom Pirates",
      "Rocks Pirates",
    ]) {
      expect(hasCardType(WILDCARD, type)).toBe(true);
    }
    expect(hasCardType("ST21-001", "Elbaph")).toBe(false);
  });

  it("answers to every attribute", () => {
    for (const attribute of [
      "Slash",
      "Strike",
      "Ranged",
      "Special",
      "Wisdom",
    ]) {
      expect(hasCardAttribute(WILDCARD, attribute)).toBe(true);
    }
    expect(hasCardAttribute("ST21-001", "Wisdom")).toBe(false);
  });

  it("is the only wildcard in the registry, and it is a Leader", () => {
    // Character-side `types.includes` calls are deliberately left un-routed
    // because no wildcard card can be on the board. This is that assumption.
    const wildcards = [...cardRegistry.values()].filter((card) =>
      isIdentityWildcard(card.cardNumber),
    );
    expect(wildcards.map((card) => card.cardNumber)).toEqual([WILDCARD]);
    expect(wildcards.every((card) => card.category === "leader")).toBe(true);
  });
});

describe("wildcard Leader in a real game", () => {
  it("satisfies an {Elbaph}-gated static ability", () => {
    // OP17-094 Rodo: "[printed text omitted -- pnpm card:text OP17-094]" Printed cost 1.
    const under = scenario("ST21-001");
    under.players.p1.board = [character("rodo", "OP17-094")];
    expect(effectiveCost(under, "p1", under.players.p1.board[0]!)).toBe(1);

    const wildcard = scenario(WILDCARD);
    wildcard.players.p1.board = [character("rodo", "OP17-094")];
    expect(effectiveCost(wildcard, "p1", wildcard.players.p1.board[0]!)).toBe(
      13,
    );
  });

  it("turns an Elbaph giant on, which switches the whole package on", () => {
    // OP17-081 Gerd is +12 cost only under an {Elbaph} Leader. With the wildcard
    // it becomes the cost-12 body that OP17-082 Sanji's +3000 looks for.
    const state = scenario(WILDCARD);
    state.players.p1.board = [
      character("gerd", "OP17-081"),
      character("sanji", "OP17-082"),
    ];
    expect(effectiveCost(state, "p1", state.players.p1.board[0]!)).toBe(14);
  });

  it("satisfies a Leader-name-gated Event clause", () => {
    // OP15-075 El Thor gates its whole program on "If your Leader is [Enel]".
    const state = scenario(WILDCARD);
    state.players.p1.hand = [{ instanceId: "thor", cardNumber: "OP15-075" }];
    state.players.p2.board = [character("target", "FIX-001")];

    const play = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "activate-main" &&
        action.actionId.endsWith("mechanic-event:thor"),
    );
    expect(play).toBeDefined();
    const next = applyAction(state, {
      ...play!,
      revision: state.revision,
    }).state;
    // The Enel-only clause opened, so the buff choice is on offer.
    expect(
      getLegalActions(next, "p1").filter(
        (action) => action.type === "resolve-effect",
      ).length,
    ).toBeGreaterThan(0);
  });
});

/**
 * Edge decisions the printed text does not settle for a simulator. Each is a
 * choice, pinned here so it is visible rather than accidental.
 */
describe("wildcard edge decisions", () => {
  it("is symmetric: an opponent's effect reads the wildcard's identity too", () => {
    // The clause is a property of the card ("is treated as a card with all card
    // names, types and attributes"), not of who is asking, so a clause the
    // *opponent* controls that names a type also sees it. The alternative --
    // wildcard only for its own controller -- has no support in the text.
    const state = scenario(WILDCARD);
    expect(hasCardType(state.players.p1.leaderCardNumber, "Kid Pirates")).toBe(
      true,
    );
  });

  it("is not excluded by an 'other than [X]' clause", () => {
    // `excludeName` deliberately still reads printed name. Every current user of
    // it targets Characters ("other than [Dr. Hogback]", "[Charlotte Oven]"),
    // and routing it through `hasCardName` would also change how aliased
    // Characters like EB04-038 Rosinante & Law are excluded -- a behaviour change
    // in shipped decks, for a case a Leader-only wildcard cannot reach.
    expect(requireKnownCard(WILDCARD).name).toBe("Monkey.D.Luffy");
  });
});
