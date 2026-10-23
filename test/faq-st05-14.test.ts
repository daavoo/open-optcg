import { describe, expect, it } from "vitest";
import { currentPower, effectiveCost } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for the starter decks ST-05 through ST-14, one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order each PDF prints them
 * for that card -- the ST-10 PDF appends a third ST10-001 ruling after the
 * last card, and it is numbered after the first two; the ST-12 PDF prints
 * ST12-011 before ST12-010, and each card is numbered on its own).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to.
 *
 * Source PDFs:
 * - https://en.onepiece-cardgame.com/pdf/qa_st-05.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-06.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-07.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-08.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-09.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-10.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-11.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-12.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-13.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-14.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const NO_ST05 = "ST-05 was never imported: no ST05 card is in packages/cards.";
const NO_ST06 =
  "Of ST-06 only ST06-008 Hina (a community-pass reprint) is in packages/cards; this card is not.";
const NO_ST07 = "ST-07 was never imported: no ST07 card is in packages/cards.";
const NO_ST08 = "ST-08 was never imported: no ST08 card is in packages/cards.";
const NO_ST09 = "ST-09 was never imported: no ST09 card is in packages/cards.";

/**
 * Cards these PDFs rule on that are not in the engine's card pool at all.
 */
export const NOT_IN_POOL: Readonly<Record<string, string>> = {
  "ST05-001#1": NO_ST05,
  "ST05-005#1": NO_ST05,
  "ST05-008#1": NO_ST05,
  "ST05-010#1": NO_ST05,
  "ST05-011#1": NO_ST05,
  "ST05-017#1": NO_ST05,
  "ST06-002#1": NO_ST06,
  "ST06-004#1": NO_ST06,
  "ST06-004#2": `${NO_ST06} The other card the ruling names, OP01-094 Kaido, is not in the pool either.`,
  "ST06-012#1": NO_ST06,
  "ST06-015#1": NO_ST06,
  "ST06-015#2": NO_ST06,
  "ST06-016#1": NO_ST06,
  "ST06-017#1": NO_ST06,
  "ST07-001#1": NO_ST07,
  "ST07-001#2": NO_ST07,
  "ST07-001#3": NO_ST07,
  "ST07-010#1": NO_ST07,
  "ST07-010#2": NO_ST07,
  "ST07-010#3": NO_ST07,
  "ST07-011#1": NO_ST07,
  "ST07-013#1": NO_ST07,
  "ST07-015#1": NO_ST07,
  "ST07-015#2": NO_ST07,
  "ST07-015#3": NO_ST07,
  "ST07-015#4": NO_ST07,
  "ST07-017#1": NO_ST07,
  "ST07-017#2": NO_ST07,
  "ST07-017#3": NO_ST07,
  "ST08-001#1": NO_ST08,
  "ST08-005#1": NO_ST08,
  "ST08-013#1": NO_ST08,
  "ST09-001#1": NO_ST09,
  "ST09-002#1": NO_ST09,
  "ST09-008#1": NO_ST09,
  "ST09-009#1": NO_ST09,
  "ST09-010#1": NO_ST09,
};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** An empty table on one player's turn, late enough for every DON!! to be out. */
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

/** Answers each prompt with the first of `preferred` on offer, else the first option. */
function settle(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    const options = effectOptions(game);
    const pick = preferred.find((id) => options.includes(id));
    game.play(
      pick
        ? { type: "resolve-effect", optionId: pick }
        : { type: "resolve-effect" },
    );
  }
}

/** Answers "apply" and DON!! payments until a prompt offers a real choice. */
function untilChoice(game: Game): void {
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game).every(
      (option) =>
        ["apply", "skip", "done"].includes(option) ||
        option.startsWith("return-don:"),
    )
  ) {
    if (guard++ > 20) throw new Error("no card choice was offered");
    const options = effectOptions(game);
    const pick =
      ["apply", "return-don:active"].find((id) => options.includes(id)) ??
      options[0]!;
    game.play({ type: "resolve-effect", optionId: pick });
  }
}

/** Takes the "choose nothing" answer of an up-to choice. */
function chooseNothing(game: Game): void {
  const options = effectOptions(game);
  const none = ["done", "skip"].find((id) => options.includes(id));
  if (!none)
    throw new Error(`no way to choose nothing in ${options.join(", ")}`);
  game.play({ type: "resolve-effect", optionId: none });
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

const lifeCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].life.find((card) => card.instanceId === id);

const attack = (game: Game, attacker: string, target: string) =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

const canAttack = (game: Game, attacker: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === attacker,
    );

/** Declines the Block and Counter steps until the battle resolves. */
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

/** Declines the Block step so the defender holds the Counter step. */
function toCounterStep(game: Game): void {
  let guard = 0;
  while (game.state.phase === "block" && game.state.pendingEffect === null) {
    if (guard++ > 10) throw new Error("the Counter step never came");
    game.pass();
  }
  expect(game.state.phase).toBe("counter");
}

const activations = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    );

const replacements = (game: Game) =>
  effectOptions(game).filter((option) => option.startsWith("replace:"));

const costOnBoard = (game: Game, player: "p1" | "p2", id: string) =>
  effectiveCost(game.state, player, boardCard(game, player, id)!);

const fieldDon = (game: Game, player: "p1" | "p2") => {
  const seat = game.state.players[player];
  return (
    seat.activeDon.length +
    seat.restedDon.length +
    seat.leaderAttachedDon.length +
    seat.board.reduce(
      (total, card) => total + (card.attachedDon?.length ?? 0),
      0,
    )
  );
};

// --- ST-05 to ST-09 ------------------------------------------------------------
// Every ruling in these five PDFs is on a card outside the card pool: see
// NOT_IN_POOL.

// --- ST-10 ---------------------------------------------------------------------

describe("FAQ ST10-001 Trafalgar Law (Leader)", () => {
  it("ST10-001#1: with no opposing 3000-power Character it still plays a 4-cost-or-less body from hand", () => {
    const game = table("faq-st10-001-1")
      .withLeader("p1", "ST10-001")
      .withHand("p1", [instance("body", "FIX-002")])
      .build();
    expect(game.state.players.p2.board).toHaveLength(0);
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("body");
    game.play({ type: "resolve-effect", optionId: "body" });
    settle(game);

    expect(boardCard(game, "p1", "body")).toBeDefined();
  });

  it("ST10-001#2: it may bury the opposing Character and play nothing from hand", () => {
    const game = table("faq-st10-001-2")
      .withLeader("p1", "ST10-001")
      .withHand("p1", [instance("body", "FIX-002")])
      .withBoard("p2", [character("small", "FIX-001")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "small" });
    untilChoice(game);
    if (game.state.pendingEffect) {
      expect(effectOptions(game)).toContain("body");
      chooseNothing(game);
    }
    settle(game);

    expect(boardCard(game, "p2", "small")).toBeUndefined();
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("small");
    expect(ids(game.state.players.p1.hand)).toEqual(["body"]);
  });

  it("ST10-001#3: an Enel chosen before any Luffy is on the field may take its Life-card replacement", () => {
    // OP13-020 Meteor Fist takes Enel from 7000 to 2000 first; ST13-014 is a
    // 2-cost [Monkey.D.Luffy] for the play half.
    const game = table("faq-st10-001-3")
      .withLeader("p1", "ST10-001")
      .withHand("p1", [
        instance("meteor", "OP13-020"),
        instance("luffy", "ST13-014"),
      ])
      .withBoard("p2", [character("enel", "OP05-100")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP13-020" });
    settle(game, "enel");
    expect(currentPower(game.state, "p2", "enel")).toBe(2_000);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "enel" });

    expect(game.player).toBe("p2");
    const offered = replacements(game);
    expect(offered).toHaveLength(1);
    game.play({ type: "resolve-effect", optionId: offered[0]! });
    settle(game, "luffy");

    expect(boardCard(game, "p2", "enel")).toBeDefined();
    expect(game.state.players.p2.life).toHaveLength(1);
    expect(boardCard(game, "p1", "luffy")).toBeDefined();
  });
});

describe("FAQ ST10-002 Monkey.D.Luffy (Leader)", () => {
  it("ST10-002#1: the first Main Phase never has an empty field, so it cannot ramp there", () => {
    const game = scenario()
      .decks(ST31, ST32)
      .seed("faq-st10-002-1")
      .startingPlayer("p1")
      .keepBothHands()
      .withLeader("p1", "ST10-002")
      .build();
    expect(game.state.turn).toBe(1);
    expect(game.player).toBe("p1");
    expect(fieldDon(game, "p1")).toBeGreaterThan(0);
    expect(fieldDon(game, "p1")).toBeLessThan(8);

    expect(activations(game, "p1-leader")).toHaveLength(0);
  });

  it("ST10-002#2: a DON!! given to the Leader is on the field, so an empty cost area is not 0", () => {
    const game = table("faq-st10-002-2")
      .withLeader("p1", "ST10-002")
      .withDonDeck("p1", 10)
      .withDon("p1", { leaderAttached: 1 })
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
    if (activations(game, "p1-leader").length > 0) {
      game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
      settle(game, "apply");
    }

    expect(fieldDon(game, "p1")).toBe(1);
  });

  it("ST10-002#2 (control): with no DON!! anywhere on the field it ramps one", () => {
    const game = table("faq-st10-002-2-control")
      .withLeader("p1", "ST10-002")
      .withDonDeck("p1", 10)
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    settle(game, "apply");

    expect(game.state.players.p1.activeDon).toHaveLength(1);
  });
});

describe("FAQ ST10-004 Sanji", () => {
  it("ST10-004#1: [Rush] stays after the opponent's 5000-power Character is gone", () => {
    // ST10-008 Shachi & Penguin is the rested 5000 the Leader attacks and K.O.s.
    const game = table("faq-st10-004-1")
      .withHand("p1", [instance("sanji", "ST10-004")])
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p2", [character("big", "ST10-008", { rested: true })])
      .build();
    game.play({ type: "play-card", cardNumber: "ST10-004" });
    settle(game);
    expect(canAttack(game, "sanji")).toBe(true);

    attack(game, "p1-leader", "big");
    declineDefence(game);
    settle(game);
    expect(boardCard(game, "p2", "big")).toBeUndefined();

    expect(canAttack(game, "sanji")).toBe(true);
  });
});

describe("FAQ ST10-006 Monkey.D.Luffy", () => {
  // ST10-014 Wire is the opposing [Blocker].
  const blocked = (seed: string) => {
    const game = table(seed)
      .withBoard("p1", [character("luffy", "ST10-006")])
      .withBoard("p2", [
        character("blocker", "ST10-014"),
        character("victim", "FIX-002"),
      ])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    attack(game, "luffy", "p2-leader");
    game.play({ type: "block", blockerInstanceId: "blocker" });
    untilChoice(game);
    return game;
  };

  it("ST10-006#1: the K.O. may land on a Character other than the blocker", () => {
    const game = blocked("faq-st10-006-1");
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["blocker", "victim"]),
    );
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toContain("victim");
  });

  it("ST10-006#2: K.O.ing the blocker ends the battle before the Counter Step", () => {
    const game = blocked("faq-st10-006-2");
    game.play({ type: "resolve-effect", optionId: "blocker" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toContain("blocker");
    expect(game.state.phase).not.toBe("counter");
    expect(game.state.activeAttack).toBeNull();
    expect(game.state.players.p2.life).toHaveLength(2);
    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });
});

/**
 * p1's Leader attacks a rested OP14-065 Senor Pink, whose [On K.O.] makes p1
 * return a DON!! to the DON!! deck: an opponent's effect, on p1's own turn.
 */
const pinkKnockedOut = (seed: string, watcher: string, watcherId: string) =>
  table(seed)
    .withBoard("p1", [character(watcherId, watcher)])
    .withGivenDon("p1", "p1-leader", 1)
    .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
    .withHand("p1", [instance("spare", "FIX-002")])
    .withBoard("p2", [
      character("pink", "OP14-065", { rested: true }),
      character("small", "FIX-001", { rested: true }),
    ])
    .build();

describe("FAQ ST10-007 Killer", () => {
  it("ST10-007#1: a DON!! returned by the opponent's effect fires it", () => {
    const game = pinkKnockedOut("faq-st10-007-1", "ST10-007", "killer");
    attack(game, "p1-leader", "pink");
    declineDefence(game);
    settle(game, "return-don:active", "apply", "small");

    expect(ids(game.state.players.p2.trash)).toContain("pink");
    expect(fieldDon(game, "p1")).toBe(9);
    expect(ids(game.state.players.p2.trash)).toContain("small");
  });
});

describe("FAQ ST10-010 Trafalgar Law", () => {
  it("ST10-010#1: the player who played Law picks the two cards from the opposing hand, face-down", () => {
    const game = table("faq-st10-010-1")
      .withHand("p1", [instance("law", "ST10-010")])
      .withHand("p2", copies(7, "FIX-001", "p2-hand"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST10-010" });
    let guard = 0;
    while (
      game.state.pendingEffect &&
      !effectOptions(game, game.player).some((id) =>
        id.startsWith("face-down:"),
      )
    ) {
      if (guard++ > 10) break;
      const options = effectOptions(game);
      const pick =
        ["apply", "return-don:active"].find((id) => options.includes(id)) ??
        options[0]!;
      game.play({ type: "resolve-effect", optionId: pick });
    }
    // Two picks, each by Law's controller and each by position only: no
    // option names a card in the opposing hand.
    for (const left of [7, 6]) {
      expect(game.player).toBe("p1");
      const picks = effectOptions(game, "p1");
      expect(picks).toHaveLength(left);
      expect(picks.every((id) => id.startsWith("face-down:"))).toBe(true);
      game.play({ type: "resolve-effect", optionId: picks[0]! });
    }
    expect(game.state.players.p2.hand).toHaveLength(5);
    expect(game.state.players.p2.trash).toHaveLength(2);
  });
});

describe("FAQ ST10-011 Heat", () => {
  it("ST10-011#1: a DON!! returned by the opponent's effect fires it", () => {
    const game = pinkKnockedOut("faq-st10-011-1", "ST10-011", "heat");
    expect(currentPower(game.state, "p1", "heat")).toBe(4_000);
    attack(game, "p1-leader", "pink");
    declineDefence(game);
    settle(game, "return-don:active", "apply");

    expect(ids(game.state.players.p2.trash)).toContain("pink");
    expect(currentPower(game.state, "p1", "heat")).toBe(6_000);
  });
});

describe("FAQ ST10-014 Wire", () => {
  it("ST10-014#1: a DON!! returned by the opponent's effect fires it", () => {
    const game = pinkKnockedOut("faq-st10-014-1", "ST10-014", "wire");
    attack(game, "p1-leader", "pink");
    declineDefence(game);
    settle(game, "return-don:active", "apply", "spare");

    expect(ids(game.state.players.p2.trash)).toContain("pink");
    expect(ids(game.state.players.p1.deck)).toEqual(["p1-deck-2"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["spare"]);
  });

  it("ST10-014#2: the draw and the trash cannot be declined", () => {
    const game = pinkKnockedOut("faq-st10-014-2", "ST10-014", "wire");
    attack(game, "p1-leader", "pink");
    declineDefence(game);
    const wireOffers: string[][] = [];
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 20) throw new Error("pending effect never settled");
      const options = effectOptions(game);
      if (game.state.pendingEffect.sourceCardNumber === "ST10-014") {
        wireOffers.push(options);
      }
      const pick =
        ["return-don:active", "apply", "spare"].find((id) =>
          options.includes(id),
        ) ?? options[0]!;
      game.play({ type: "resolve-effect", optionId: pick });
    }
    expect(wireOffers.length).toBeGreaterThan(0);

    expect(wireOffers.flat()).not.toContain("skip");
    expect(ids(game.state.players.p1.trash)).toHaveLength(1);
  });
});

describe("FAQ ST10-016 Gum-Gum Kong Gatling", () => {
  it("ST10-016#1: the [Trigger] +1000 lasts through its owner's next turn and ends with it", () => {
    // ST10-001 is a Leader with no continuous power text, so 5000 is its base.
    const game = table("faq-st10-016-1")
      .withLeader("p2", "ST10-001")
      .withLife("p2", [
        instance("gatling", "ST10-016"),
        instance("under", "FIX-001"),
      ])
      .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
      .withDeckTop("p2", copies(3, "FIX-001", "p2-deck"))
      .build();
    attack(game, "p1-leader", "p2-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game, "p2-leader");
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(6_000);

    game.pass();
    settle(game);
    expect(game.player).toBe("p2");
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(6_000);

    game.pass();
    settle(game);
    expect(game.player).toBe("p1");
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(5_000);
  });
});

// --- ST-11 ---------------------------------------------------------------------

describe("FAQ ST11-001 Uta (Leader)", () => {
  it("ST11-001#1: once the revealed {FILM} card is added to hand, nothing goes to the bottom", () => {
    const game = table("faq-st11-001-1")
      .withLeader("p1", "ST11-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withDeckTop("p1", [
        instance("film", "ST11-002"),
        instance("second", "FIX-001"),
        instance("third", "FIX-002"),
      ])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    attack(game, "p1-leader", "p2-leader");
    untilChoice(game);
    expect(effectOptions(game)).toContain("film");
    game.play({ type: "resolve-effect", optionId: "film" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["film"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["second", "third"]);
  });
});

describe("FAQ ST11-004 New Genesis", () => {
  it("ST11-004#1: adding no {FILM} card still sets a DON!! active", () => {
    const game = table("faq-st11-004-1")
      .withLeader("p1", "ST11-001")
      .withDon("p1", { rested: 2 })
      .withHand("p1", [instance("genesis", "ST11-004")])
      .withDeckTop("p1", [
        instance("film", "ST11-002"),
        ...copies(2, "FIX-001", "p1-deck"),
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "ST11-004" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("film");
    chooseNothing(game);
    settle(game, "apply");

    expect(ids(game.state.players.p1.hand)).not.toContain("film");
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(game.state.players.p1.activeDon).toHaveLength(8);
  });
});

// --- ST-12 ---------------------------------------------------------------------

describe("FAQ ST12-001 Roronoa Zoro & Sanji (Leader)", () => {
  // ST13-004 Edward.Newgate is printed at 7000; ST12-015 Patty & Carne is the
  // 2-cost body returned to pay.
  const refreshOffers = (seed: string, donOnNewgate: boolean) => {
    let builder = table(seed)
      .withLeader("p1", "ST12-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p1", [
        character("newgate", "ST13-004", { rested: true }),
        character("patty", "ST12-015"),
      ])
      .withLife("p2", copies(2, "FIX-001", "p2-life"));
    if (donOnNewgate) builder = builder.withGivenDon("p1", "newgate", 1);
    const game = builder.build();
    expect(currentPower(game.state, "p1", "newgate")).toBe(
      donOnNewgate ? 8_000 : 7_000,
    );
    attack(game, "p1-leader", "p2-leader");
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "patty" });
    return game.state.pendingEffect ? effectOptions(game) : [];
  };

  it("ST12-001#1: a 7000 Character raised to 8000 by a DON!! cannot be set active", () => {
    expect(refreshOffers("faq-st12-001-1", true)).not.toContain("newgate");
  });

  it("ST12-001#1 (control): the same Character at 7000 can", () => {
    expect(refreshOffers("faq-st12-001-1-control", false)).toContain("newgate");
  });
});

describe("FAQ ST12-003 Dracule Mihawk", () => {
  const mihawkOffers = (seed: string, others: number) => {
    const game = table(seed)
      .withBoard(
        "p1",
        copies(others, "FIX-001", "ally").map((card) =>
          character(card.instanceId, card.cardNumber),
        ),
      )
      .withHand("p1", [
        instance("mihawk", "ST12-003"),
        instance("slash", "FIX-002"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "ST12-003" });
    const offered = game.state.pendingEffect ? effectOptions(game) : [];
    settle(game, "skip", "done");
    return { game, offered };
  };

  it("ST12-003#1: Mihawk makes a third Character, so it plays nothing", () => {
    const { game, offered } = mihawkOffers("faq-st12-003-1", 2);
    expect(offered).not.toContain("slash");
    expect(ids(game.state.players.p1.hand)).toEqual(["slash"]);
  });

  it("ST12-003#1 (control): beside one other Character it offers the play", () => {
    const { offered } = mihawkOffers("faq-st12-003-1-control", 1);
    expect(offered).toContain("slash");
  });
});

describe("FAQ ST12-011 Sanji", () => {
  it("ST12-011#1: the +2000 holds after the hand grows past 5", () => {
    const game = table("faq-st12-011-1")
      .withBoard("p1", [character("sanji", "ST12-011")])
      .withGivenDon("p1", "sanji", 1)
      .withHand("p1", copies(5, "FIX-001", "p1-hand"))
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
      .withBoard("p2", [character("attacker", "OP16-032")])
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .withDeckTop("p2", copies(3, "FIX-001", "p2-deck"))
      .build();
    attack(game, "sanji", "p2-leader");
    settle(game, "apply");
    declineDefence(game);
    settle(game);
    expect(currentPower(game.state, "p1", "sanji")).toBe(6_000);
    game.pass();
    settle(game);

    expect(game.player).toBe("p2");
    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    settle(game);
    expect(game.state.players.p1.hand.length).toBeGreaterThanOrEqual(6);

    // 3000 printed, +2000; the given DON!! adds nothing on the opponent's turn.
    expect(currentPower(game.state, "p1", "sanji", false)).toBe(5_000);
  });

  it("ST12-011#2: two attacks in a turn give +4000", () => {
    // The ST12-001 Leader's [When Attacking] returns ST12-015 Patty & Carne to
    // set Sanji active between the two attacks.
    const game = table("faq-st12-011-2")
      .withLeader("p1", "ST12-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p1", [
        character("sanji", "ST12-011"),
        character("patty", "ST12-015"),
      ])
      .withGivenDon("p1", "sanji", 1)
      .withLife("p2", copies(4, "FIX-001", "p2-life"))
      .build();
    attack(game, "sanji", "p2-leader");
    settle(game, "apply");
    declineDefence(game);
    settle(game);
    expect(currentPower(game.state, "p1", "sanji")).toBe(6_000);

    attack(game, "p1-leader", "p2-leader");
    settle(game, "apply", "patty", "sanji");
    declineDefence(game);
    settle(game);
    expect(boardCard(game, "p1", "sanji")?.rested).toBe(false);

    attack(game, "sanji", "p2-leader");
    settle(game, "apply");

    expect(currentPower(game.state, "p1", "sanji")).toBe(8_000);
  });
});

describe("FAQ ST12-010 Emporio.Ivankov", () => {
  const ivankov = (seed: string, top: string) => {
    const game = table(seed)
      .withHand("p1", [
        instance("ivankov", "ST12-010"),
        instance("hand-two", "FIX-002"),
      ])
      .withDeckTop("p1", [
        instance("top", top),
        ...copies(2, "FIX-001", "p1-deck"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "ST12-010" });
    untilChoice(game);
    const offered = game.state.pendingEffect ? effectOptions(game) : [];
    return { game, offered };
  };

  it("ST12-010#1: a 2-cost Character in hand is not a legal play, only the revealed card", () => {
    const { game, offered } = ivankov("faq-st12-010-1", "FIX-001");
    expect(offered).not.toContain("hand-two");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["hand-two"]);
    expect(boardCard(game, "p1", "hand-two")).toBeUndefined();
  });

  it("ST12-010#1 (control): a revealed 2-cost Character is offered", () => {
    const { offered } = ivankov("faq-st12-010-1-control", "FIX-002");
    expect(offered).toContain("top");
  });

  it("ST12-010#2: what goes to the top or bottom is the revealed card, never the hand", () => {
    const { game } = ivankov("faq-st12-010-2", "FIX-001");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["hand-two"]);
    const deck = ids(game.state.players.p1.deck);
    expect(deck).toHaveLength(3);
    expect([deck[0], deck.at(-1)]).toContain("top");
  });
});

// --- ST-13 ---------------------------------------------------------------------

describe("FAQ ST13-001 Sabo (Leader)", () => {
  it("ST13-001#1: a 6000 Character raised to 7000 by a DON!! may be banked", () => {
    // ST13-008 Sabo: cost 5, printed at 6000.
    const game = table("faq-st13-001-1")
      .withLeader("p1", "ST13-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p1", [character("sabo", "ST13-008")])
      .withGivenDon("p1", "sabo", 1)
      .build();
    expect(currentPower(game.state, "p1", "sabo")).toBe(7_000);
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("sabo");
    game.play({ type: "resolve-effect", optionId: "sabo" });
    settle(game);

    expect(game.state.players.p1.life[0]?.instanceId).toBe("sabo");
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
  });
});

describe("FAQ ST13-002 Portgas.D.Ace (Leader)", () => {
  it("ST13-002#1: a Life card turned face-up by another card's effect is trashed at the end of the turn", () => {
    // ST20-001 Charlotte Katakuri turns the top Life card face-up.
    const game = table("faq-st13-002-1")
      .withLeader("p1", "ST13-002")
      .withBoard("p1", [character("katakuri", "ST20-001")])
      .withLife("p1", [
        instance("top", "FIX-001"),
        instance("under", "FIX-002"),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "katakuri" });
    settle(game, "apply", "top");
    expect(lifeCard(game, "p1", "top")?.faceUp).toBe(true);

    game.pass();
    settle(game);

    expect(ids(game.state.players.p1.life)).toEqual(["under"]);
    expect(ids(game.state.players.p1.trash)).toContain("top");
  });
});

describe("FAQ ST13-003 Monkey.D.Luffy (Leader)", () => {
  // ST13-017 Flame Dragon King carries a [Trigger]; OP16-032 Boa Hancock (9000)
  // is the attacker.
  const hitFaceUp = (seed: string, faceUp: boolean) => {
    const game = table(seed, "p2")
      .withLeader("p1", "ST13-003")
      .withLife("p1", [
        instance("flame", "ST13-017", faceUp ? { faceUp: true } : {}),
        instance("under", "FIX-001"),
      ])
      .withBoard("p2", [character("attacker", "OP16-032")])
      .build();
    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    return game;
  };

  const triggerOffered = (game: Game) =>
    game
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "resolve-trigger" &&
          action.summary.includes("Activate"),
      );

  it("ST13-003#1: a face-up Life card's [Trigger] cannot be activated", () => {
    const game = hitFaceUp("faq-st13-003-1", true);
    const offered = triggerOffered(game);
    if (game.state.pendingTrigger) {
      game.play({ type: "resolve-trigger", summary: "Add Life card" });
    }
    settle(game);

    expect(offered).toBe(false);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("flame");
  });

  it("ST13-003#1 (control): the same card face-down offers its [Trigger]", () => {
    const game = hitFaceUp("faq-st13-003-1-control", false);
    expect(triggerOffered(game)).toBe(true);
  });

  it("ST13-003#2: a face-up Life card paid to Makino goes under the deck, and Makino does nothing", () => {
    const game = table("faq-st13-003-2")
      .withLeader("p1", "ST13-003")
      .withHand("p1", [instance("makino", "ST13-012")])
      .withLife("p1", [
        instance("shown", "FIX-002", { faceUp: true }),
        // Two different cards, so a re-order would have to ask.
        instance("a", "FIX-001"),
        instance("b", "ST31-002"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "ST13-012" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("shown");
    game.play({ type: "resolve-effect", optionId: "shown" });
    // With the cost unpaid there is no re-order to answer: the pick was the
    // last question.
    const reorderOffered = game.state.pendingEffect !== null;
    settle(game);

    expect(ids(game.state.players.p1.hand)).not.toContain("shown");
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("shown");
    expect(reorderOffered).toBe(false);
  });

  it("ST13-003#3: Reject's damage lands, then the face-up Life card it takes goes under the deck", () => {
    const game = table("faq-st13-003-3")
      .withLeader("p1", "ST13-003")
      .withHand("p1", [instance("reject", "OP06-116")])
      .withLife("p1", [instance("shown", "FIX-002", { faceUp: true })])
      .withLife("p2", [instance("theirs", "FIX-001")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP06-116" });
    settle(game, "damage");

    expect(game.state.players.p2.life).toHaveLength(0);
    expect(ids(game.state.players.p2.hand)).toContain("theirs");
    expect(game.state.players.p1.life).toHaveLength(0);
    expect(ids(game.state.players.p1.hand)).not.toContain("shown");
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("shown");
  });

  it("ST13-003#4: one 5-cost from hand and one from trash may both go onto Life face-up", () => {
    const game = table("faq-st13-003-4")
      .withLeader("p1", "ST13-003")
      .withGivenDon("p1", "p1-leader", 2)
      .withHand("p1", [
        instance("cost", "FIX-001"),
        instance("brother", "ST13-008"),
      ])
      .withTrash("p1", [instance("dead", "ST13-011")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["brother", "dead"]),
    );
    game.play({ type: "resolve-effect", optionId: "brother" });
    game.play({ type: "resolve-effect", optionId: "dead" });
    settle(game, "done");

    expect(ids(game.state.players.p1.life).sort()).toEqual(["brother", "dead"]);
    expect(game.state.players.p1.life.every((card) => card.faceUp)).toBe(true);
  });
});

/** Life with a face-up card on top of a face-down one. */
const mixedLife = () => [
  instance("shown", "FIX-002", { faceUp: true }),
  instance("hidden", "FIX-001"),
];

describe("FAQ ST13-004 Edward.Newgate", () => {
  const newgate = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("newgate", "ST13-004")])
      .withLife("p1", mixedLife())
      .withDeckTop("p1", [
        instance("fresh", "FIX-001"),
        ...copies(2, "FIX-001", "p1-deck"),
      ])
      .build();

  it("ST13-004#1: a face-up Life card put back stays face-up", () => {
    const game = newgate("faq-st13-004-1");
    game.play({ type: "play-card", cardNumber: "ST13-004" });
    settle(game, "hidden");

    expect(lifeCard(game, "p1", "shown")?.faceUp).toBe(true);
    expect(lifeCard(game, "p1", "fresh")?.faceUp ?? false).toBe(false);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("hidden");
  });

  it("ST13-004#2: a face-up Life card put on top of the deck goes face-down", () => {
    const game = newgate("faq-st13-004-2");
    game.play({ type: "play-card", cardNumber: "ST13-004" });
    settle(game, "shown");

    expect(game.state.players.p1.deck[0]?.instanceId).toBe("shown");
    expect(game.state.players.p1.deck[0]?.faceUp ?? false).toBe(false);
  });
});

describe("FAQ ST13-009 Shanks", () => {
  it("ST13-009#1: a face-up Life card anywhere in the stack may be turned face-down", () => {
    const game = table("faq-st13-009-1")
      .withHand("p1", [instance("shanks", "ST13-009")])
      .withLife("p1", [
        instance("top", "FIX-001"),
        instance("middle", "FIX-002", { faceUp: true }),
        instance("bottom", "FIX-001"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "ST13-009" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("middle");
    game.play({ type: "resolve-effect", optionId: "middle" });
    settle(game);

    expect(lifeCard(game, "p1", "middle")?.faceUp ?? false).toBe(false);
  });
});

describe("FAQ ST13-011 Portgas.D.Ace", () => {
  it("ST13-011#1: played at 2 Life, it keeps [Rush] after Life goes back to 3", () => {
    // The ST13-002 Leader banks ST13-008 Sabo off the deck after Ace lands.
    const game = table("faq-st13-011-1")
      .withLeader("p1", "ST13-002")
      .withGivenDon("p1", "p1-leader", 2)
      .withHand("p1", [instance("ace", "ST13-011")])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withDeckTop("p1", [
        instance("prize", "ST13-008"),
        ...copies(4, "FIX-001", "p1-deck"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "ST13-011" });
    settle(game);
    expect(canAttack(game, "ace")).toBe(true);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    settle(game, "prize");
    expect(game.state.players.p1.life).toHaveLength(3);

    expect(canAttack(game, "ace")).toBe(true);
  });
});

describe("FAQ ST13-012 Makino", () => {
  it("ST13-012#1: re-ordered Life keeps each card's face", () => {
    const game = table("faq-st13-012-1")
      .withHand("p1", [instance("makino", "ST13-012")])
      .withLife("p1", [...mixedLife(), instance("taken", "FIX-001")])
      .build();
    game.play({ type: "play-card", cardNumber: "ST13-012" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "taken" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["taken"]);
    expect(lifeCard(game, "p1", "shown")?.faceUp).toBe(true);
    expect(lifeCard(game, "p1", "hidden")?.faceUp ?? false).toBe(false);
  });
});

describe("FAQ ST13-016 Yamato", () => {
  it("ST13-016#1: a face-up Life card put back stays face-up", () => {
    const game = table("faq-st13-016-1")
      .withHand("p1", [instance("yamato", "ST13-016")])
      .withLife("p1", [...mixedLife(), instance("third", "FIX-001")])
      .build();
    game.play({ type: "play-card", cardNumber: "ST13-016" });
    settle(game, "third");

    expect(game.state.players.p1.deck[0]?.instanceId).toBe("third");
    expect(lifeCard(game, "p1", "shown")?.faceUp).toBe(true);
    expect(lifeCard(game, "p1", "hidden")?.faceUp ?? false).toBe(false);
  });
});

describe("FAQ ST13-017 Flame Dragon King", () => {
  it("ST13-017#1: re-ordered Life keeps each card's face", () => {
    const game = table("faq-st13-017-1", "p2")
      .withHand("p1", [instance("flame", "ST13-017")])
      .withLife("p1", mixedLife())
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();
    attack(game, "attacker", "p1-leader");
    toCounterStep(game);
    game.play({ type: "activate-counter-event", cardNumber: "ST13-017" });
    settle(game, "p1-leader");

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(lifeCard(game, "p1", "shown")?.faceUp).toBe(true);
    expect(lifeCard(game, "p1", "hidden")?.faceUp ?? false).toBe(false);
  });
});

// --- ST-14 ---------------------------------------------------------------------

const playable = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === instanceId,
    );

describe("FAQ ST14-001 Monkey.D.Luffy (Leader)", () => {
  it("ST14-001#1: the +1 cost reaches the field only, not a Character card in hand", () => {
    // ST14-007 Nico Robin, a 6-cost, against exactly 6 active DON!!.
    const game = table("faq-st14-001-1")
      .withLeader("p1", "ST14-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withDonDeck("p1", 3)
      .withHand("p1", [instance("robin", "ST14-007")])
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(6);
    expect(playable(game, "robin")).toBe(true);
    game.play({ type: "play-card", cardNumber: "ST14-007" });
    settle(game);

    expect(costOnBoard(game, "p1", "robin")).toBe(7);
  });

  it("ST14-001#2: once the 8-cost Character leaves on the opponent's turn, the Leader is back to 5000", () => {
    // ST13-009 Shanks is a 7 the Leader lifts to 8; OP16-032 Boa Hancock
    // (9000) attacks it.
    const game = table("faq-st14-001-2", "p2")
      .withLeader("p1", "ST14-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p1", [character("shanks", "ST13-009", { rested: true })])
      .withBoard("p2", [character("hancock", "OP16-032")])
      .build();
    expect(costOnBoard(game, "p1", "shanks")).toBe(8);
    // A given DON!! adds power only on its owner's turn.
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(6_000);
    attack(game, "hancock", "shanks");
    declineDefence(game);
    settle(game);
    expect(boardCard(game, "p1", "shanks")).toBeUndefined();

    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(5_000);
  });
});

describe("FAQ ST14-002 Usopp", () => {
  it("ST14-002#1: Usopp raised to 8 cost satisfies its own condition", () => {
    // ST14-004 Jinbe (+2) and ST14-016 I Have My Crew!! (+3) take the printed
    // 3 to 8.
    const game = table("faq-st14-002-1")
      .withBoard("p1", [
        character("usopp", "ST14-002"),
        character("jinbe", "ST14-004"),
      ])
      .withGivenDon("p1", "usopp", 1)
      .withHand("p1", [instance("crew", "ST14-016")])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withBoard("p2", [character("target", "FIX-002")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "jinbe" });
    settle(game, "usopp");
    game.play({ type: "activate-main", sourceCardNumber: "ST14-016" });
    settle(game, "usopp");
    expect(costOnBoard(game, "p1", "usopp")).toBe(8);
    expect(costOnBoard(game, "p1", "jinbe")).toBeLessThan(8);

    attack(game, "usopp", "p2-leader");
    untilChoice(game);
    expect(effectOptions(game)).toContain("target");
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toContain("target");
  });
});

describe("FAQ ST14-003 Sanji", () => {
  // ST13-008 Sabo is a 5-cost target.
  const playSanji = (seed: string, lift: "stage" | "leader") => {
    let builder = table(seed)
      .withHand("p1", [instance("sanji", "ST14-003")])
      .withBoard("p2", [character("target", "ST13-008")]);
    builder =
      lift === "stage"
        ? builder.withStage("p1", instance("sunny", "ST14-017"))
        : builder
            .withLeader("p1", "ST14-001")
            .withGivenDon("p1", "p1-leader", 1);
    const game = builder.build();
    expect(game.state.players.p1.board).toHaveLength(0);
    game.play({ type: "play-card", cardNumber: "ST14-003" });
    expect(costOnBoard(game, "p1", "sanji")).toBe(6);
    untilChoice(game);
    expect(effectOptions(game)).toContain("target");
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);
    return game;
  };

  it("ST14-003#1: Sanji raised to 6 cost satisfies its own condition", () => {
    const game = playSanji("faq-st14-003-1", "stage");
    expect(ids(game.state.players.p2.trash)).toContain("target");
  });

  it("ST14-003#2: under the ST14-001 Leader with a DON!!, Sanji alone is the 6-cost it needs", () => {
    const game = playSanji("faq-st14-003-2", "leader");
    expect(ids(game.state.players.p2.trash)).toContain("target");
  });
});

describe("FAQ ST14-007 Nico Robin", () => {
  it("ST14-007#1: Robin raised to 8 cost satisfies its own condition", () => {
    // ST13-009 Shanks is a 7-cost target.
    const game = table("faq-st14-007-1")
      .withLeader("p1", "ST14-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withStage("p1", instance("sunny", "ST14-017"))
      .withHand("p1", [instance("robin", "ST14-007")])
      .withBoard("p2", [character("target", "ST13-009")])
      .build();
    game.play({ type: "play-card", cardNumber: "ST14-007" });
    expect(costOnBoard(game, "p1", "robin")).toBe(8);
    untilChoice(game);
    expect(effectOptions(game)).toContain("target");
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(costOnBoard(game, "p2", "target")).toBe(2);
  });
});

describe("FAQ ST14-009 Franky", () => {
  // EB01-039 Ragnaraku is the opposing K.O. that reaches cost 8.
  const ragnaraku = (seed: string, leaderDon: boolean) => {
    let builder = table(seed, "p2")
      .withLeader("p1", "ST14-001")
      .withBoard("p1", [character("franky", "ST14-009")])
      .withGivenDon("p1", "franky", 1)
      .withHand("p2", [instance("ragnaraku", "EB01-039")]);
    if (leaderDon) builder = builder.withGivenDon("p1", "p1-leader", 1);
    const game = builder.build();
    // A given DON!! adds power only on its owner's turn.
    const power = currentPower(game.state, "p1", "franky", false);
    game.play({ type: "activate-main", sourceCardNumber: "EB01-039" });
    settle(game, "apply", "return-don:active", "franky");
    return { game, power };
  };

  it("ST14-009#1: raised to 6 cost by itself, it gains +2000 and survives the opponent's K.O.", () => {
    const { game, power } = ragnaraku("faq-st14-009-1", true);
    expect(power).toBe(8_000);
    expect(boardCard(game, "p1", "franky")).toBeDefined();
  });

  it("ST14-009#1 (control): at its printed 5 the same K.O. removes it", () => {
    const { game, power } = ragnaraku("faq-st14-009-1-control", false);
    expect(power).toBe(6_000);
    expect(ids(game.state.players.p1.trash)).toContain("franky");
  });
});

describe("FAQ ST14-012 Monkey.D.Luffy", () => {
  it("ST14-012#1: raised to 10 cost by itself, it has [Rush]", () => {
    const game = table("faq-st14-012-1")
      .withLeader("p1", "ST14-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withStage("p1", instance("sunny", "ST14-017"))
      .withHand("p1", [instance("luffy", "ST14-012")])
      .build();
    game.play({ type: "play-card", cardNumber: "ST14-012" });
    settle(game);
    expect(costOnBoard(game, "p1", "luffy")).toBe(10);

    expect(canAttack(game, "luffy")).toBe(true);
  });
});

describe("FAQ ST14-017 Thousand Sunny", () => {
  it("ST14-017#1: the +1 cost reaches the field only, not a Character card in hand", () => {
    const game = table("faq-st14-017-1")
      .withStage("p1", instance("sunny", "ST14-017"))
      .withDonDeck("p1", 4)
      .withHand("p1", [instance("robin", "ST14-007")])
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(6);
    expect(playable(game, "robin")).toBe(true);
    game.play({ type: "play-card", cardNumber: "ST14-007" });
    settle(game);

    expect(costOnBoard(game, "p1", "robin")).toBe(7);
  });
});
