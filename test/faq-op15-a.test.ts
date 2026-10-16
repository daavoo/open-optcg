import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  fieldDonCount,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-15, cards OP15-001 to OP15-059, one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order the PDF prints them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. A ruling the engine disagrees with is an `it.fails`
 * that says what the engine does instead: it turns green -- and so red under
 * `it.fails` -- the day the engine is fixed, which is the prompt to promote it.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/faq_op15-eb04.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** An empty table on p1's turn, late enough for every DON!! to be out. */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const given = (game: Game, player: "p1" | "p2", instanceId: string): number =>
  instanceId === `${player}-leader`
    ? game.state.players[player].leaderAttachedDon.length
    : (game.state.players[player].board.find(
        (card) => card.instanceId === instanceId,
      )?.attachedDon?.length ?? 0);

const activations = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    );

/**
 * The payoff that gives a rested DON!! of either player to that DON!!'s
 * owner's Leader or Character, reached from p1's turn with rested DON!! on
 * both sides.
 */
function ownerGiftTable(seed: string, source: string, cardNumber: string) {
  return table(seed)
    .withBoard("p1", [character(source, cardNumber)])
    .withBoard("p2", [
      character("victim", "ST32-004"),
      character("other", "ST32-005"),
    ])
    .withDon("p1", { rested: 2 })
    .withDon("p2", { rested: 3 })
    .build();
}

/**
 * Asserts that `source`'s `[Activate: Main]` gives none of p1's DON!! away:
 * either it is not offered, or every way through it leaves p1's DON!! where
 * they were.
 */
function expectNoGift(game: Game, source = "source"): void {
  const offered = activations(game, source);
  if (offered.length === 0) return;
  game.submit(offered[0]!);
  while (game.state.pendingEffect) {
    const options = effectOptions(game);
    for (const option of options) {
      expect(["p1-leader", source]).not.toContain(option);
    }
    game.play({ type: "resolve-effect" });
  }
  expect(game.state.players.p1.restedDon).toHaveLength(2);
  expect(fieldDonCount(game.state, "p1")).toBe(10);
}

describe("FAQ OP15-001 Krieg (Leader)", () => {
  /** p2's turn; Krieg holds a DON!! from his own turn. */
  const kriegTable = (seed: string, board: ReturnType<typeof character>[]) =>
    table(seed, "p2")
      .withLeader("p1", "OP15-001")
      .withBoard("p1", board)
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

  it("OP15-001#1: with no Characters at all, the [Opponent's Turn] −2000 does not apply", () => {
    const empty = kriegTable("faq-op15-001-1", []);
    expect(currentPower(empty.state, "p2", "target")).toBe(5000);

    // Control: one {East Blue} Character is enough to switch it on.
    const eastBlue = kriegTable("faq-op15-001-1-control", [
      character("gin", "OP15-007"),
    ]);
    expect(currentPower(eastBlue.state, "p2", "target")).toBe(3000);
  });
});

/**
 * OP15-003 Alvida and OP15-017 Morgan print the same `[Activate: Main]`: a
 * price paid with one of the opponent's rested DON!!, and a gift of a rested
 * DON!! to its owner's own Leader or Character.
 */
describe.each([
  ["OP15-003", "Alvida"],
  ["OP15-017", "Morgan"],
])("FAQ %s %s", (cardNumber) => {
  const prefix = cardNumber.toLowerCase();
  /** Activates the clause and pays its price with `victim`. */
  const payPrice = (seed: string) => {
    const game = ownerGiftTable(seed, "source", cardNumber);
    game.play({ type: "activate-main", sourceInstanceId: "source" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(given(game, "p2", "victim")).toBe(1);
    return game;
  };

  it(`${cardNumber}#1: the gift may go to either player's side, each DON!! to its owner`, () => {
    const game = payPrice(`faq-${prefix}-1`);
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining([
        "p1-leader",
        "source",
        "p2-leader",
        "victim",
        "other",
      ]),
    );

    // One of the opponent's rested DON!! onto one of their Characters.
    game.play({ type: "resolve-effect", optionId: "other" });
    expect(given(game, "p2", "other")).toBe(1);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it(`${cardNumber}#1 (own side): one of your rested DON!! onto your own Leader`, () => {
    const game = payPrice(`faq-${prefix}-1-own`);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    expect(given(game, "p1", "p1-leader")).toBe(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it(`${cardNumber}#2: the activating player chooses the opponent's DON!! that is given`, () => {
    const game = payPrice(`faq-${prefix}-2`);
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    expect(given(game, "p2", "p2-leader")).toBe(1);
  });

  it(`${cardNumber}#3: a DON!! never crosses to the other player's cards`, () => {
    const game = payPrice(`faq-${prefix}-3`);
    // Choosing an opposing card takes the DON!! from the opponent's pile,
    // never from the activating player's.
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
    expect(given(game, "p2", "victim")).toBe(2);
  });

  it(`${cardNumber}#4: no gift of your own DON!! without an opposing Character or an opposing rested DON!!`, () => {
    // The price cannot be paid, so the gift it buys never happens: either
    // the activation is not offered, or taking it moves no DON!! at all.
    const noCharacters = table(`faq-${prefix}-4-board`)
      .withBoard("p1", [character("source", cardNumber)])
      .withDon("p1", { rested: 2 })
      .withDon("p2", { rested: 3 })
      .build();
    expectNoGift(noCharacters);

    const noRestedDon = table(`faq-${prefix}-4-don`)
      .withBoard("p1", [character("source", cardNumber)])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p1", { rested: 2 })
      .build();
    expectNoGift(noRestedDon);
  });
});

describe("FAQ OP15-008 Krieg", () => {
  const kriegTable = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("krieg", "OP15-008")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p2", { rested: 3 })
      .build();

  it("OP15-008#1: Krieg gains [Rush] even when no DON!! is given", () => {
    const game = kriegTable("faq-op15-008-1");
    game.play({ type: "play-card", cardNumber: "OP15-008" });
    game.play({ type: "resolve-effect", optionId: "done" });
    settle(game);

    expect(given(game, "p2", "victim")).toBe(0);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "krieg",
        ),
    ).toBe(true);
  });

  it("OP15-008#2: Krieg's controller chooses the opponent's DON!! that are given", () => {
    const game = kriegTable("faq-op15-008-2");
    game.play({ type: "play-card", cardNumber: "OP15-008" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);
    expect(given(game, "p2", "victim")).toBe(3);
    expect(game.state.players.p2.restedDon).toHaveLength(0);
  });
});

describe("FAQ OP15-009 Koby", () => {
  it("OP15-009#1: Koby's replacement also covers Koby itself", () => {
    const game = table("faq-op15-009-1", "p2")
      .withBoard("p1", [character("koby", "OP15-009")])
      .withHand("p2", [instance("whitey", "OP17-014")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    game.play({ type: "resolve-effect", optionId: "koby" });
    expect(game.player).toBe("p1");
    expect(effectOptions(game)).toContain("replace:koby");
    game.play({ type: "resolve-effect", optionId: "replace:koby" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["koby"]);
    expect(game.state.players.p1.leaderPowerModifiers).toContainEqual(
      expect.objectContaining({ amount: -2000 }),
    );
  });

  it("OP15-009#2: one −2000 keeps both Characters one effect removes together", () => {
    // OP09-018 Get Out of Here! K.O.s two Characters totalling 4000 power.
    const game = table("faq-op15-009-2", "p2")
      .withBoard("p1", [
        character("koby", "OP15-009"),
        character("nezumi", "OP15-010"),
      ])
      .withHand("p2", [instance("gooh", "OP09-018")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "koby" });
    game.play({ type: "resolve-effect", optionId: "nezumi" });
    if (game.player === "p2") {
      game.play({ type: "resolve-effect", optionId: "done" });
    }
    expect(game.player).toBe("p1");
    // One payment is all that is offered: there is no "pay twice" option.
    expect(
      effectOptions(game).filter((option) => option.startsWith("replace:")),
    ).toHaveLength(1);
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((option) =>
        option.startsWith("replace:"),
      )!,
    });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["koby", "nezumi"]);
    expect(
      game.state.players.p1.leaderPowerModifiers.filter(
        (modifier) => modifier.amount === -2000,
      ),
    ).toHaveLength(1);
  });

  it("OP15-009#2 (decline): letting both go is the other choice", () => {
    const game = table("faq-op15-009-2-decline", "p2")
      .withBoard("p1", [
        character("koby", "OP15-009"),
        character("nezumi", "OP15-010"),
      ])
      .withHand("p2", [instance("gooh", "OP09-018")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "koby" });
    game.play({ type: "resolve-effect", optionId: "nezumi" });
    if (game.player === "p2") {
      game.play({ type: "resolve-effect", optionId: "done" });
    }
    while (game.state.pendingEffect && game.player === "p1") {
      const decline = effectOptions(game).find(
        (option) => !option.startsWith("replace:"),
      );
      game.play({ type: "resolve-effect", optionId: decline! });
    }
    settle(game);
    expect(ids(game.state.players.p1.board)).toEqual([]);
  });
});

describe("FAQ OP15-010 Nezumi", () => {
  it("OP15-010#1: the gift may go to either player's side, each DON!! to its owner", () => {
    const game = ownerGiftTable("faq-op15-010-1", "nezumi", "OP15-010");
    game.play({ type: "activate-main", sourceInstanceId: "nezumi" });
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["p1-leader", "nezumi", "p2-leader", "victim"]),
    );
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(given(game, "p2", "victim")).toBe(1);
    expect(game.state.players.p2.restedDon).toHaveLength(2);
  });

  it("OP15-010#2: the activating player chooses the opponent's DON!! that is given", () => {
    const game = ownerGiftTable("faq-op15-010-2", "nezumi", "OP15-010");
    game.play({ type: "activate-main", sourceInstanceId: "nezumi" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    expect(given(game, "p2", "p2-leader")).toBe(1);
  });

  it("OP15-010#3: a DON!! never crosses to the other player's cards", () => {
    const game = ownerGiftTable("faq-op15-010-3", "nezumi", "OP15-010");
    game.play({ type: "activate-main", sourceInstanceId: "nezumi" });
    game.play({ type: "resolve-effect", optionId: "nezumi" });
    // Nezumi's DON!! came from p1's own pile; p2's is untouched.
    expect(given(game, "p1", "nezumi")).toBe(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p2.restedDon).toHaveLength(3);
  });
});

describe("FAQ OP15-012 Buggy", () => {
  /** p1's Buggy swings at p2's Leader with rested DON!! on both sides. */
  const buggySwings = (
    seed: string,
    p2Board: ReturnType<typeof character>[] = [character("victim", "ST32-004")],
    p2Leader?: string,
  ) => {
    let builder = table(seed)
      .withBoard("p1", [character("buggy", "OP15-012")])
      .withBoard("p2", p2Board)
      .withHand("p2", [instance("p2-card", "FIX-001")])
      .withDon("p1", { rested: 2 })
      .withDon("p2", { rested: 3 });
    if (p2Leader) builder = builder.withLeader("p2", p2Leader);
    const game = builder.build();
    game.play({
      type: "attack",
      attackerInstanceId: "buggy",
      targetInstanceId: "p2-leader",
    });
    return game;
  };

  it("OP15-012#1: the gift may go to either player's side, each DON!! to its owner", () => {
    const game = buggySwings("faq-op15-012-1");
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["p1-leader", "buggy", "p2-leader", "victim"]),
    );
    game.play({ type: "resolve-effect", optionId: "buggy" });
    expect(given(game, "p1", "buggy")).toBe(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("OP15-012#2: a DON!! given to an opposing [DON!! x1] card switches its ability on for them", () => {
    // OP01-078 Boa Hancock is not in the card pool; OP15-053 Rebecca gains
    // [Blocker] at [DON!! x1], which is the same question -- whether a DON!!
    // Buggy hands the opponent counts toward their own card's [DON!! xN].
    const game = buggySwings("faq-op15-012-2", [
      character("rebecca", "OP15-053"),
    ]);
    game.play({ type: "resolve-effect", optionId: "rebecca" });
    settle(game);
    expect(given(game, "p2", "rebecca")).toBe(1);
    expect(game.player).toBe("p2");
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "rebecca",
        ),
    ).toBe(true);
  });

  it("OP15-012#3: the attacking player chooses the opponent's DON!! that is given", () => {
    const game = buggySwings("faq-op15-012-3");
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(given(game, "p2", "victim")).toBe(1);
    expect(game.state.players.p2.restedDon).toHaveLength(2);
  });

  it("OP15-012#4: a DON!! never crosses to the other player's cards", () => {
    const game = buggySwings("faq-op15-012-4");
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    expect(given(game, "p2", "p2-leader")).toBe(1);
    expect(game.state.players.p2.restedDon).toHaveLength(2);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("OP15-012#5: a DON!! given during [When Attacking] does not switch on OP11-041 Nami's [On Your Opponent's Attack]", () => {
    const game = buggySwings("faq-op15-012-5", [], "OP11-041");
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    expect(given(game, "p2", "p2-leader")).toBe(1);
    expect(game.state.pendingEffect?.kind).not.toBe("nami-leader");
  });
});

describe("FAQ OP15-015 Higuma", () => {
  it("OP15-015#1: Higuma's controller chooses the opponent's DON!! that is given", () => {
    const game = table("faq-op15-015-1")
      .withHand("p1", [instance("higuma", "OP15-015")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p2", { rested: 2 })
      .build();
    game.play({ type: "play-card", cardNumber: "OP15-015" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(given(game, "p2", "victim")).toBe(1);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
  });

  it("OP15-015#2: the −1000 still resolves when the opponent has no rested DON!!", () => {
    const game = table("faq-op15-015-2")
      .withHand("p1", [instance("higuma", "OP15-015")])
      .withBoard("p2", [character("carrier", "ST32-004")])
      .withGivenDon("p2", "carrier", 1)
      .build();
    expect(game.state.players.p2.restedDon).toHaveLength(0);
    game.play({ type: "play-card", cardNumber: "OP15-015" });
    // The give, with nothing to give: no DON!! is chosen.
    game.play({ type: "resolve-effect", optionId: "done" });
    expect(given(game, "p2", "carrier")).toBe(1);
    game.play({ type: "resolve-effect", optionId: "carrier" });
    settle(game);
    expect(currentPower(game.state, "p2", "carrier", false)).toBe(4000);
  });
});

describe("FAQ OP15-023 Arlong", () => {
  /** bareTable() leaves every other DON!! active. */
  const arlongTable = (seed: string, don: { p1Rested?: number }) =>
    table(seed)
      .withBoard("p1", [character("arlong", "OP15-023")])
      .withBoard("p2", [
        character("victim", "ST32-004"),
        character("other", "ST32-005"),
      ])
      .withDon("p1", { rested: don.p1Rested ?? 0 })
      .withDon("p2", { rested: 1 })
      .build();

  /** Activates Arlong and pays its price with `victim`. */
  const payPrice = (game: Game) => {
    game.play({ type: "activate-main", sourceInstanceId: "arlong" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(given(game, "p2", "victim")).toBe(1);
  };

  it("OP15-023#1: the gift may go to either player's side, each DON!! to its owner", () => {
    const game = arlongTable("faq-op15-023-1", { p1Rested: 2 });
    payPrice(game);
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["p2-leader", "victim", "other", "p1-leader"]),
    );
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    expect(given(game, "p1", "p1-leader")).toBe(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("OP15-023#2: an active DON!! may be given", () => {
    // p2's one rested DON!! went on the price; only active ones are left.
    const game = arlongTable("faq-op15-023-2", {});
    payPrice(game);
    expect(game.state.players.p2.restedDon).toHaveLength(0);
    const active = game.state.players.p2.activeDon.length;
    game.play({ type: "resolve-effect", optionId: "other" });
    expect(given(game, "p2", "other")).toBe(1);
    expect(game.state.players.p2.activeDon).toHaveLength(active - 1);
  });

  it("OP15-023#3: Arlong's controller chooses the opponent's DON!! that is given", () => {
    const game = arlongTable("faq-op15-023-3", {});
    payPrice(game);
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    expect(given(game, "p2", "p2-leader")).toBe(1);
  });

  it("OP15-023#4: a DON!! never crosses to the other player's cards", () => {
    const game = arlongTable("faq-op15-023-4", { p1Rested: 2 });
    payPrice(game);
    game.play({ type: "resolve-effect", optionId: "other" });
    expect(given(game, "p2", "other")).toBe(1);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
  });

  it("OP15-023#5: no gift of your own DON!! without an opposing Character or an opposing rested DON!!", () => {
    const noCharacters = table("faq-op15-023-5-board")
      .withBoard("p1", [character("source", "OP15-023")])
      .withDon("p1", { rested: 2 })
      .withDon("p2", { rested: 3 })
      .build();
    expectNoGift(noCharacters);

    const noRestedDon = table("faq-op15-023-5-don")
      .withBoard("p1", [character("source", "OP15-023")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p1", { rested: 2 })
      .build();
    expectNoGift(noRestedDon);
  });
});

describe("FAQ OP15-025 Kuro", () => {
  it("OP15-025#1: Kuro's controller chooses the opponent's DON!! that are given", () => {
    const game = table("faq-op15-025-1")
      .withHand("p1", [instance("kuro", "OP15-025")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p2", { rested: 2 })
      .build();
    game.play({ type: "play-card", cardNumber: "OP15-025" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);
    expect(given(game, "p2", "victim")).toBe(2);
  });
});

describe("FAQ OP15-026 Jango", () => {
  it("OP15-026#1: Jango's controller chooses the opponent's DON!! that is given", () => {
    const game = table("faq-op15-026-1")
      .withBoard("p1", [character("jango", "OP15-026")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p2", { rested: 2 })
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "jango" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(given(game, "p2", "victim")).toBe(1);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
  });
});

describe("FAQ OP15-028 Meowban Brothers", () => {
  const meowbanTable = (seed: string) =>
    table(seed)
      .withLeader("p1", "OP15-001")
      .withHand("p1", [instance("meowban", "OP15-028")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

  it("OP15-028#1: an active DON!! of the opponent's may be given", () => {
    // bareTable() leaves every DON!! active.
    const game = meowbanTable("faq-op15-028-1");
    expect(game.state.players.p2.restedDon).toHaveLength(0);
    game.play({ type: "play-card", cardNumber: "OP15-028" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(given(game, "p2", "victim")).toBe(1);
    expect(game.state.players.p2.activeDon).toHaveLength(9);
  });

  it("OP15-028#2: the Meowban Brothers' controller chooses the DON!! that is given", () => {
    const game = meowbanTable("faq-op15-028-2");
    game.play({ type: "play-card", cardNumber: "OP15-028" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(given(game, "p2", "victim")).toBe(1);
  });
});

/** Declines the block and Counter steps until the battle resolves. */
function declineDefence(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

describe("FAQ OP15-002 Lucy (Leader)", () => {
  it("OP15-002#1: an Event activated by its [Trigger] does not count for the draw", () => {
    // The only way to take damage on your own turn: p2's EB03-055 Nico Robin
    // deals 1 damage from its [Opponent's Turn] [On K.O.], and p1's Life card
    // is OP13-020 Meteor Fist, a 3-cost Event whose [Trigger] activates it.
    const game = table("faq-op15-002-1")
      .withLeader("p1", "OP15-002")
      .withBoard("p1", [character("sabo", "OP15-046")])
      .withLife("p1", [instance("fist", "OP13-020")])
      .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
      .withBoard("p2", [
        character("robin", "EB03-055", { rested: true }),
        character("bystander", "FIX-002"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "sabo",
      targetInstanceId: "robin",
    });
    declineDefence(game);
    // Robin's optional damage to p1, then p1's Trigger.
    let guard = 0;
    while (game.state.pendingEffect || game.state.pendingTrigger) {
      if (guard++ > 20) throw new Error("the K.O. never settled");
      const apply = game
        .legalActions()
        .find(
          (action) =>
            (action.type === "resolve-effect" && action.optionId === "apply") ||
            (action.type === "resolve-trigger" &&
              action.optionId !== "decline" &&
              !action.summary.toLowerCase().includes("add")),
        );
      game.submit(apply ?? game.legalActions()[0]!);
    }
    // The Trigger did activate the Event: its −5000 landed.
    expect(ids(game.state.players.p1.trash)).toContain("fist");
    expect(currentPower(game.state, "p2", "bystander")).toBe(-1000);
    expect(game.player).toBe("p1");

    const hand = game.state.players.p1.hand.length;
    const lucy = activations(game, "p1-leader");
    if (lucy.length > 0) {
      game.submit(lucy[0]!);
      settle(game);
    }
    expect(game.state.players.p1.hand.length).toBe(hand);
  });
});

describe("FAQ OP15-020 Fire Fist", () => {
  // Fire Fist trashes as much as it can: the one card goes, the K.O. does not.
  it("OP15-020#1: with one card in hand, one may be trashed but nothing is K.O.'d", () => {
    const game = table("faq-op15-020-1")
      .withHand("p1", [
        instance("fire-fist", "OP15-020"),
        instance("last", "ST32-005"),
      ])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP15-020" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    // The −8000 put the victim at 0 or less; the K.O. is what is at stake.
    expect(currentPower(game.state, "p2", "victim")).toBeLessThanOrEqual(0);
    expect(effectOptions(game)).toContain("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "last" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toContain("last");
    expect(ids(game.state.players.p2.board)).toEqual(["victim"]);
  });
});

describe("FAQ OP15-021 Just Watch Me, Ace!!!", () => {
  it("OP15-021#1: three cards in the trash do not discount it", () => {
    const game = table("faq-op15-021-1")
      .withHand("p1", [instance("ace", "OP15-021")])
      .withTrash("p1", copies(3, "OP12-039", "event"))
      .build();
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.hand[0]!),
    ).toBe(4);
  });
});

describe("FAQ OP15-022 Brook (Leader)", () => {
  it("OP15-022#1: a deck refilled after reaching 0 still loses at the end of the turn", () => {
    // OP15-041 Orlumbus's price puts a Character back under the deck after
    // Brook has milled it to 0.
    const game = table("faq-op15-022-1")
      .withLeader("p1", "OP15-022")
      .withBoard("p1", [
        character("orlumbus", "OP15-041"),
        character("fodder", "FIX-001"),
      ])
      .withDeckTop("p1", copies(4, "ST32-005", "last"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    settle(game);
    expect(game.state.players.p1.deck).toHaveLength(0);

    game.play({ type: "activate-main", sourceInstanceId: "orlumbus" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);
    expect(ids(game.state.players.p1.deck)).toEqual(["fodder"]);

    game.pass();
    expect(game.state.phase).toBe("finished");
    expect(game.state.winner).toBe("p2");
  });

  it("OP15-022#2: usable on 3 cards; trashes them all and still sets a Character active", () => {
    const game = table("faq-op15-022-2")
      .withLeader("p1", "OP15-022")
      .withBoard("p1", [character("tired", "FIX-002", { rested: true })])
      .withDeckTop("p1", copies(3, "ST32-005", "last"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "tired" });
    settle(game);

    expect(game.state.players.p1.deck).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(3);
    expect(game.state.players.p1.board[0]?.rested).toBe(false);
  });
});

describe("FAQ OP15-033 Hody Jones", () => {
  it("OP15-033#1: sets the {Fish-Man} Leader active on 0 Life", () => {
    const game = table("faq-op15-033-1")
      .withLeader("p1", "OP06-020")
      .withRestedLeader("p1")
      .withHand("p1", [instance("hody", "OP15-033")])
      .build();
    expect(game.state.players.p1.life).toHaveLength(0);

    game.play({ type: "play-card", cardNumber: "OP15-033" });
    settle(game);

    expect(game.state.players.p1.leaderRested).toBe(false);
  });
});

describe("FAQ OP15-035 Laboon", () => {
  it("OP15-035#1: Laboon's replacement also covers Laboon itself", () => {
    const game = table("faq-op15-035-1", "p2")
      .withBoard("p1", [character("laboon", "OP15-035")])
      .withHand("p2", [instance("whitey", "OP17-014")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    game.play({ type: "resolve-effect", optionId: "laboon" });
    expect(effectOptions(game)).toContain("replace:laboon");
    game.play({ type: "resolve-effect", optionId: "replace:laboon" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["laboon"]);
  });

  it("OP15-035#2: resting 2 cards once keeps both Characters one effect removes together", () => {
    const game = table("faq-op15-035-2", "p2")
      .withBoard("p1", [
        character("laboon", "OP15-035"),
        character("nezumi", "OP15-010"),
      ])
      .withHand("p2", [instance("gooh", "OP09-018")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "laboon" });
    game.play({ type: "resolve-effect", optionId: "nezumi" });
    if (game.player === "p2") {
      game.play({ type: "resolve-effect", optionId: "done" });
    }
    expect(
      effectOptions(game).filter((option) => option.startsWith("replace:")),
    ).toEqual(["replace:laboon"]);
    game.play({ type: "resolve-effect", optionId: "replace:laboon" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["laboon", "nezumi"]);
    const rested =
      (game.state.players.p1.leaderRested ? 1 : 0) +
      game.state.players.p1.board.filter((card) => card.rested).length;
    expect(rested).toBe(2);
  });
});

describe("FAQ OP15-038 It's an Order! Do Not Defy Me!!!", () => {
  it("OP15-038#1: the lock holds once chosen, whatever happens to the DON!! after", () => {
    const game = table("faq-op15-038-1")
      .withHand("p1", [instance("order", "OP15-038")])
      .withBoard("p2", [character("marked", "ST32-004", { rested: true })])
      .withGivenDon("p2", "marked", 2)
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP15-038" });
    game.play({ type: "resolve-effect", optionId: "marked" });
    game.pass();

    // p2's Refresh Phase returned the two DON!! -- the Character now has
    // fewer than 2 -- and it stayed rested anyway.
    expect(game.state.turnPlayerId).toBe("p2");
    expect(given(game, "p2", "marked")).toBe(0);
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });
});

describe("FAQ OP15-039 Rebecca (Leader)", () => {
  it("OP15-039#1: the returned cost-3 {Dressrosa} Character may be the one played", () => {
    const game = table("faq-op15-039-1")
      .withLeader("p1", "OP15-039")
      .withBoard("p1", [character("kyros", "OP15-042")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "kyros" });
    expect(effectOptions(game)).toContain("kyros");
    game.play({ type: "resolve-effect", optionId: "kyros" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["kyros"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("FAQ OP15-041 Orlumbus", () => {
  it("OP15-041#1: Orlumbus may pay with itself, and then gains nothing", () => {
    const game = table("faq-op15-041-1")
      .withBoard("p1", [character("orlumbus", "OP15-041")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "orlumbus" });
    game.play({ type: "resolve-effect", optionId: "orlumbus" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual([]);
    expect(ids(game.state.players.p1.deck)).toEqual(["orlumbus"]);
  });
});

describe("FAQ OP15-046 Sabo", () => {
  const saboTable = (seed: string) =>
    table(seed)
      .withLeader("p1", "OP15-039")
      .withHand("p1", [
        instance("sabo", "OP15-046"),
        instance("bulls", "OP15-019"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withHand("p2", [instance("counter", "OP15-021")])
      .build();

  it("OP15-046#1: the Event it activates goes to the trash afterwards", () => {
    const game = saboTable("faq-op15-046-1");
    game.play({ type: "play-card", cardNumber: "OP15-046" });
    game.play({ type: "resolve-effect", optionId: "bulls" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["bulls"]);
  });

  it("OP15-046#2: no [Counter] Event can be activated in response", () => {
    const game = saboTable("faq-op15-046-2");
    game.play({ type: "play-card", cardNumber: "OP15-046" });
    expect(game.state.pendingEffect).not.toBeNull();
    for (const player of ["p1", "p2"] as const) {
      expect(
        game
          .legalActions(player)
          .filter((action) => action.type === "activate-counter-event"),
      ).toEqual([]);
    }
  });
});

describe("FAQ OP15-052 Leo", () => {
  it("OP15-052#1: Leo's replacement also covers Leo itself", () => {
    const game = table("faq-op15-052-1", "p2")
      .withBoard("p1", [
        character("leo", "OP15-052"),
        character("fodder", "FIX-002"),
      ])
      .withHand("p2", [instance("whitey", "OP17-014")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    game.play({ type: "resolve-effect", optionId: "leo" });
    expect(effectOptions(game)).toContain("replace:leo");
    game.play({ type: "resolve-effect", optionId: "replace:leo" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["leo"]);
  });

  it("OP15-052#2: one Character bottomed keeps both Characters one effect removes together", () => {
    const game = table("faq-op15-052-2", "p2")
      .withBoard("p1", [
        character("leo", "OP15-052"),
        character("nezumi", "OP15-010"),
        character("fodder", "FIX-002"),
      ])
      .withHand("p2", [instance("gooh", "OP09-018")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "leo" });
    game.play({ type: "resolve-effect", optionId: "nezumi" });
    if (game.player === "p2") {
      game.play({ type: "resolve-effect", optionId: "done" });
    }
    expect(
      effectOptions(game).filter((option) => option.startsWith("replace:")),
    ).toEqual(["replace:leo"]);
    game.play({ type: "resolve-effect", optionId: "replace:leo" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["leo", "nezumi"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["fodder"]);
  });
});

describe("FAQ OP15-056 Would You Let Me Eat the Flame-Flame Fruit?", () => {
  it("OP15-056#1: under a Leader other than [Lucy] it still draws 2", () => {
    const game = table("faq-op15-056-1")
      .withHand("p1", [instance("fruit", "OP15-056")])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP15-056" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1", "p1-deck-2"]);
  });
});

describe("FAQ OP15-058 Enel (Leader)", () => {
  const ENEL = "(Purple) Enel - Official Feature Deck";
  const totalDon = (game: Game) =>
    fieldDonCount(game.state, "p1") + game.state.players.p1.donDeck.length;

  it("OP15-058#1: negating the Leader leaves the DON!! deck at six", () => {
    // OP13-064 Gol.D.Roger negates its own controller's Leader.
    const game = scenario()
      .decks(ENEL, ST31)
      .seed("faq-op15-058-1")
      .atTurn(7, { active: "p1" })
      .withBoard("p1", [character("roger", "OP13-064")])
      .build();
    expect(totalDon(game)).toBe(6);
    game.pass();
    game.pass();
    expect(totalDon(game)).toBe(6);
    expect(activations(game, "p1-leader")).toEqual([]);
  });

  it("OP15-058#2: on the first turn it adds and gives nothing; from the second turn it ramps", () => {
    const first = scenario()
      .decks(ENEL, ST31)
      .seed("faq-op15-058-2")
      .atTurn(1, { active: "p1" })
      .build();
    expect(activations(first, "p1-leader")).toEqual([]);

    const second = scenario()
      .decks(ENEL, ST31)
      .seed("faq-op15-058-2-second")
      .atTurn(3, { active: "p1" })
      .build();
    const before = fieldDonCount(second.state, "p1");
    second.submit(activations(second, "p1-leader")[0]!);
    settle(second);
    expect(fieldDonCount(second.state, "p1")).toBeGreaterThan(before);
  });

  it("OP15-058#3: Enel plays with six DON!!", () => {
    const game = scenario()
      .decks(ENEL, ST31)
      .seed("faq-op15-058-3")
      .atTurn(1, { active: "p1" })
      .build();
    expect(totalDon(game)).toBe(6);
  });
});

describe("FAQ OP15-059 Amazon", () => {
  it("OP15-059#1: with no active DON!! to return, the −2000 lands", () => {
    const game = table("faq-op15-059-1", "p2")
      .withBoard("p1", [character("amazon", "OP15-059")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDon("p2", { rested: 10 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", summary: "Amazon" });
    while (
      game.state.pendingEffect &&
      !effectOptions(game).includes("attacker")
    ) {
      game.play({ type: "resolve-effect" });
    }
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);

    expect(game.state.players.p2.donDeck).toHaveLength(0);
    expect(currentPower(game.state, "p2", "attacker", false)).toBe(3000);
  });
});
