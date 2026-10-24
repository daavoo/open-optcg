import { describe, expect, it } from "vitest";
import {
  currentPower,
  fieldDonCount,
  observe,
  playCostFromHand,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for the starter decks ST-31 through ST-36, one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order each PDF prints them
 * for that card).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to.
 *
 * Source PDFs:
 * - https://en.onepiece-cardgame.com/pdf/qa_st-31.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-32.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-33.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-34.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-35.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-36.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert, or
 * whose position no card in the pool can create. Empty while every ST-31 to
 * ST-36 ruling has one.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";
const ST33 = "(Blue) Kuzan - Starter Deck 33";
const ST34 = "(Purple) Charlotte Katakuri - Starter Deck 34";
const ST35 = "(Red/Black) Sabo - Starter Deck 35";
const ST36 = "(Yellow) Eustass Kid - Starter Deck 36";

/** An empty table on one player's turn, late enough for every DON!! to be out. */
const table = (
  seed: string,
  active: "p1" | "p2" = "p1",
  decks: [string, string] = [ST31, ST32],
) =>
  scenario()
    .decks(...decks)
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

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

const attack = (game: Game, attacker: string, target: string) =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

const canAttack = (game: Game, attacker: string, target?: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === attacker &&
        (target === undefined || action.targetInstanceId === target),
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

const blockers = (game: Game, player: "p1" | "p2") =>
  game
    .legalActions(player)
    .filter((action) => action.type === "block")
    .map((action) => action.blockerInstanceId);

const triggerOptions = (game: Game) =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-trigger")
    .map((action) => action.optionId);

const activations = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    );

const lifeFaces = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].life.map((card) => card.faceUp ?? false);

// --- ST-31 ---------------------------------------------------------------------

describe("FAQ ST31-002 Jinbe", () => {
  it("ST31-002#1: the [On Play] can put Thousand Sunny on the field", () => {
    const game = table("faq-st31-002-1")
      .withHand("p1", [
        instance("jinbe", "ST31-002"),
        instance("sunny", "ST31-005"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST31-002" });
    expect(effectOptions(game)).toContain("sunny");
    game.play({ type: "resolve-effect", optionId: "sunny" });
    settle(game, "skip", "done");

    expect(game.state.players.p1.stage?.instanceId).toBe("sunny");
    expect(ids(game.state.players.p1.hand)).not.toContain("sunny");
  });
});

describe("FAQ ST31-003 Brook", () => {
  /** p2's turn; p1 holds Brook and a 2000 ally carrying one DON!!. */
  const brook = (seed: string, onLeader: number) =>
    table(seed, "p2", [ST31, ST34])
      .withBoard("p1", [
        character("brook", "ST31-003"),
        character("ally", "FIX-001"),
      ])
      .withGivenDon("p1", "p1-leader", onLeader)
      .withGivenDon("p1", "ally", 1)
      .withLife("p1", copies(2, "FIX-002", "p1-life"))
      .withBoard("p2", [character("baron", "ST34-005")]);

  it("ST31-003#1: DON!! given to the Leader and to other Characters count toward the three", () => {
    const game = brook("faq-st31-003-1", 2).build();
    // Brook carries none himself: two on the Leader and one on the ally.
    expect(boardCard(game, "p1", "brook")?.attachedDon ?? []).toHaveLength(0);
    expect(currentPower(game.state, "p1", "brook")).toBe(6_000);
    attack(game, "baron", "p1-leader");
    // Decline Baron's K.O. so the count stays at three.
    settle(game, "skip");
    expect(blockers(game, "p1")).toContain("brook");
  });

  it("ST31-003#1 (control): with two given DON!! in total Brook is neither a Blocker nor boosted", () => {
    const game = brook("faq-st31-003-1-control", 1).build();
    expect(currentPower(game.state, "p1", "brook")).toBe(3_000);
    attack(game, "baron", "p1-leader");
    settle(game, "skip");
    expect(blockers(game, "p1")).not.toContain("brook");
  });

  it("ST31-003#2: a [When Attacking] that drops the count to two takes the block away for that attack", () => {
    // ST34-005 Baron Tamago & Pekoms K.O.s the 2000 ally as it attacks, and
    // the ally's DON!! goes back to p1's cost area.
    const game = brook("faq-st31-003-2", 2).build();
    attack(game, "baron", "p1-leader");
    expect(effectOptions(game)).toContain("ally");
    game.play({ type: "resolve-effect", optionId: "ally" });
    settle(game, "return-don:active");

    expect(boardCard(game, "p1", "ally")).toBeUndefined();
    expect(game.state.phase).toBe("block");
    expect(blockers(game, "p1")).not.toContain("brook");
    expect(currentPower(game.state, "p1", "brook")).toBe(3_000);
  });
});

describe("FAQ ST31-004 Monkey.D.Luffy", () => {
  /** Luffy played this turn, carrying no DON!! himself. */
  const luffy = (seed: string, onLeader: number) =>
    table(seed)
      .withBoard("p1", [
        character("luffy", "ST31-004", { playedTurn: 11 }),
        character("ally", "FIX-001"),
      ])
      .withGivenDon("p1", "p1-leader", onLeader)
      .withGivenDon("p1", "ally", 1)
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();

  it("ST31-004#1: DON!! given to the Leader and to other Characters count toward the three", () => {
    const game = luffy("faq-st31-004-1", 2);
    expect(game.state.turn).toBe(11);
    expect(canAttack(game, "luffy", "p2-leader")).toBe(true);
  });

  it("ST31-004#1 (control): with two given DON!! in total the fresh Luffy cannot attack", () => {
    const game = luffy("faq-st31-004-1-control", 1);
    expect(canAttack(game, "luffy")).toBe(false);
  });
});

// --- ST-32 ---------------------------------------------------------------------

describe("FAQ ST32-003 Dracule Mihawk", () => {
  it("ST32-003#1: a cost-6 <Slash> Character cannot be played, a cost-5 one can", () => {
    // OP12-020 Roronoa Zoro is a <Slash> Leader; ST32-002 Kouzuki Oden is a
    // cost-5 <Slash> Character and a second Mihawk a cost-6 one.
    const game = table("faq-st32-003-1", "p1", [ST32, ST31])
      .withLeader("p1", "OP12-020")
      .withHand("p1", [
        instance("mihawk", "ST32-003"),
        instance("big", "ST32-003"),
        instance("oden", "ST32-002"),
      ])
      .build();
    game.play({ type: "play-card", cardInstanceId: "mihawk" });
    const offered = effectOptions(game);
    expect(offered).toContain("oden");
    expect(offered).not.toContain("big");
  });
});

describe("FAQ ST32-005 Roronoa Zoro", () => {
  const firstTurns = (seed: string, turn: number) =>
    scenario()
      .decks(ST32, ST31)
      .seed(seed)
      .startingPlayer("p1")
      .atTurn(turn, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("zoro", "ST32-005")])
      .withBoard("p2", [character("rested", "FIX-001", { rested: true })])
      .build();

  it("ST32-005#1: on its controller's first turn it cannot attack a Character", () => {
    const game = firstTurns("faq-st32-005-1", 1);
    expect(game.state.turn).toBe(1);
    game.play({ type: "play-card", cardInstanceId: "zoro" });
    settle(game, "skip", "done");
    expect(boardCard(game, "p1", "zoro")).toBeDefined();
    expect(canAttack(game, "zoro")).toBe(false);
  });

  it("ST32-005#1 (control): on a later turn the freshly played Zoro attacks a rested Character", () => {
    const game = firstTurns("faq-st32-005-1-control", 3);
    game.play({ type: "play-card", cardInstanceId: "zoro" });
    settle(game, "skip", "done");
    expect(canAttack(game, "zoro", "rested")).toBe(true);
  });
});

// --- ST-33 ---------------------------------------------------------------------

describe("FAQ ST33-001 Koby", () => {
  it("ST33-001#1: with no other card in hand there is no draw", () => {
    const game = table("faq-st33-001-1", "p1", [ST33, ST31])
      .withHand("p1", [instance("koby", "ST33-001")])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST33-001" });
    settle(game, "apply");

    expect(boardCard(game, "p1", "koby")).toBeDefined();
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toEqual(["p1-deck-1", "p1-deck-2"]);
  });
});

describe("FAQ ST33-002 Sakazuki", () => {
  /** p1's Sakazuki attacks; p2 holds `opponentHand` cards. */
  const sakazuki = (seed: string, ownHand: number, opponentHand: number) =>
    table(seed, "p1", [ST31, ST31])
      .withBoard("p1", [character("sakazuki", "ST33-002")])
      .withHand("p1", copies(ownHand, "FIX-001", "own"))
      .withHand("p2", copies(opponentHand, "FIX-002", "theirs"))
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();

  it("ST33-002#1: with an empty hand the opponent trashes nothing", () => {
    const game = sakazuki("faq-st33-002-1", 0, 6);
    attack(game, "sakazuki", "p2-leader");
    settle(game, "apply");

    expect(game.state.players.p2.hand).toHaveLength(6);
    expect(game.state.players.p2.trash).toHaveLength(0);
  });

  it("ST33-002#1 (control): with a card to pay, six in the opponent's hand loses them one", () => {
    const game = sakazuki("faq-st33-002-1-control", 1, 6);
    attack(game, "sakazuki", "p2-leader");
    expect(effectOptions(game)).toContain("own-1");
    game.play({ type: "resolve-effect", optionId: "own-1" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(5);
  });

  it("ST33-002#2: against five cards the trash can still be paid, and the opponent keeps all five", () => {
    const game = sakazuki("faq-st33-002-2", 1, 5);
    attack(game, "sakazuki", "p2-leader");
    expect(effectOptions(game)).toContain("own-1");
    game.play({ type: "resolve-effect", optionId: "own-1" });

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.trash)).toEqual(["own-1"]);
    expect(game.state.players.p2.hand).toHaveLength(5);
    expect(game.state.players.p2.trash).toHaveLength(0);
  });
});

describe("FAQ ST33-003 Smoker", () => {
  it("ST33-003#1: with no other card in hand nothing goes to the bottom of the deck", () => {
    const game = table("faq-st33-003-1", "p1", [ST33, ST31])
      .withHand("p1", [instance("smoker", "ST33-003")])
      .withBoard("p2", [
        character("small-a", "FIX-001"),
        character("small-b", "FIX-002"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "ST33-003" });
    settle(game, "apply");

    expect(ids(game.state.players.p2.board)).toEqual(["small-a", "small-b"]);
  });
});

describe("FAQ ST33-004 Borsalino", () => {
  it("ST33-004#1: a hand card trashed by the opponent's effect prices Borsalino 3 lower that turn", () => {
    // p1's ST33-002 Sakazuki makes p2, holding six, trash one of them; p2
    // picks the card and keeps Borsalino.
    const game = table("faq-st33-004-1", "p1", [ST31, ST33])
      .withBoard("p1", [character("sakazuki", "ST33-002")])
      .withHand("p1", [instance("cost", "FIX-001")])
      .withHand("p2", [
        instance("borsalino", "ST33-004"),
        ...copies(5, "FIX-002", "theirs"),
      ])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    expect(playCostFromHand(game.state, "p2", "ST33-004", 6)).toBe(6);

    attack(game, "sakazuki", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "cost" });
    // p2, not p1, makes the choice.
    expect(effectOptions(game, "p1")).toEqual([]);
    expect(effectOptions(game, "p2")).toContain("theirs-1");
    game.play({ type: "resolve-effect", optionId: "theirs-1" });

    expect(ids(game.state.players.p2.trash)).toEqual(["theirs-1"]);
    expect(game.state.turn).toBe(11);
    expect(playCostFromHand(game.state, "p2", "ST33-004", 6)).toBe(3);
    expect(
      observe(game.state, "p2").self.hand.find(
        (card) => card.instanceId === "borsalino",
      )?.currentCost,
    ).toBe(3);
  });

  it("ST33-004#1 (control): a hand card trashed by its controller's own effect does price it at 3", () => {
    // ST33-001 Koby's cost trashes a hand card by p1's own effect.
    const game = table("faq-st33-004-1-control", "p1", [ST31, ST31])
      .withHand("p1", [
        instance("koby", "ST33-001"),
        instance("cost", "FIX-001"),
        instance("borsalino", "ST33-004"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST33-001" });
    game.play({ type: "resolve-effect", optionId: "cost" });
    settle(game);

    expect(playCostFromHand(game.state, "p1", "ST33-004", 6)).toBe(3);
  });
});

// --- ST-34 ---------------------------------------------------------------------

describe("FAQ ST34-001 Charlotte Katakuri", () => {
  it("ST34-001#1: after one Katakuri gives DON!! back, a second return the same turn brings none from the other", () => {
    // OP11-062 Charlotte Katakuri is a {Big Mom Pirates} Leader whose
    // [When Attacking] DON!! −1 is the first return; ST34-005 Baron Tamago &
    // Pekoms' [When Attacking] DON!! −1 is the second.
    const game = table("faq-st34-001-1", "p1", [ST34, ST31])
      .withLeader("p1", "OP11-062")
      .withBoard("p1", [
        character("katakuri-a", "ST34-001"),
        character("katakuri-b", "ST34-001"),
        character("baron", "ST34-005"),
      ])
      .withBoard("p2", [character("small", "FIX-001")])
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .withDeckTop("p2", copies(3, "FIX-002", "p2-deck"))
      .build();
    expect(fieldDonCount(game.state, "p1")).toBe(10);

    attack(game, "p1-leader", "p2-leader");
    settle(game, "apply", "return-don:active");
    // One back to the DON!! deck, one back out of it, rested.
    expect(fieldDonCount(game.state, "p1")).toBe(10);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    declineDefence(game);
    settle(game, "skip");

    attack(game, "baron", "p2-leader");
    expect(effectOptions(game)).toContain("small");
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game, "return-don:active");

    expect(boardCard(game, "p2", "small")).toBeUndefined();
    expect(fieldDonCount(game.state, "p1")).toBe(9);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("ST34-001 (Leader type): behind a Leader without {Big Mom Pirates} a return brings nothing back", () => {
    // Not a ruling: the printed Leader check, which ST34-001#1's position
    // passes. ST31-001 is a {Straw Hat Crew} Leader.
    const game = table("faq-st34-001-leader", "p1", [ST34, ST31])
      .withLeader("p1", "ST31-001")
      .withBoard("p1", [
        character("katakuri", "ST34-001"),
        character("baron", "ST34-005"),
      ])
      .withBoard("p2", [character("small", "FIX-001")])
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();
    expect(fieldDonCount(game.state, "p1")).toBe(10);

    attack(game, "baron", "p2-leader");
    expect(effectOptions(game)).toContain("small");
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game, "return-don:active");

    expect(boardCard(game, "p2", "small")).toBeUndefined();
    expect(fieldDonCount(game.state, "p1")).toBe(9);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("FAQ ST34-002 Charlotte Cracker", () => {
  it("ST34-002#1: with no cost-2-or-less target the DON!! is still added, rested", () => {
    const game = table("faq-st34-002-1", "p1", [ST34, ST31])
      .withLeader("p1", "OP11-062")
      .withDonDeck("p1", 1)
      .withHand("p1", [instance("cracker", "ST34-002")])
      .withBoard("p2", [character("big", "ST31-004")])
      .build();
    expect(fieldDonCount(game.state, "p1")).toBe(9);
    game.play({ type: "play-card", cardNumber: "ST34-002" });
    settle(game, "apply");

    expect(fieldDonCount(game.state, "p1")).toBe(10);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(boardCard(game, "p2", "big")).toBeDefined();
  });

  it("ST34-002#2: with an empty DON!! deck the K.O. still happens", () => {
    const game = table("faq-st34-002-2", "p1", [ST34, ST31])
      .withLeader("p1", "OP11-062")
      .withHand("p1", [instance("cracker", "ST34-002")])
      .withBoard("p2", [character("small", "FIX-002")])
      .build();
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    game.play({ type: "play-card", cardNumber: "ST34-002" });
    settle(game, "apply", "small");

    expect(boardCard(game, "p2", "small")).toBeUndefined();
    expect(ids(game.state.players.p2.trash)).toContain("small");
  });
});

describe("FAQ ST34-004 Charlotte Linlin", () => {
  /** p2 on ST34 in its own Main Phase, ten DON!! active. */
  const linlin = (seed: string) =>
    table(seed, "p2", [ST31, ST34])
      .withHand("p2", [
        instance("linlin", "ST34-004"),
        instance("discard", "ST34-005"),
      ])
      .withDeckTop("p2", copies(3, "ST34-003", "p2-deck"));

  it("ST34-004#1: a later setter to a higher value wins over the 0", () => {
    // OP16-106 Sanjuan.Wolf's [Trigger], under a {Blackbeard Pirates} Leader
    // (OP16-080), sets base power 7000 after Linlin has set 0.
    const game = linlin("faq-st34-004-1")
      .withLeader("p1", "OP16-080")
      .withBoard("p1", [character("target", "ST31-003")])
      .withLife("p1", [
        instance("life-wolf", "OP16-106"),
        instance("life-under", "FIX-001"),
      ])
      .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
      .withBoard("p2", [character("attacker", "ST31-004", { playedTurn: 1 })])
      .build();

    game.play({ type: "play-card", cardNumber: "ST34-004" });
    game.play({ type: "resolve-effect", optionId: "discard" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);
    expect(currentPower(game.state, "p1", "target")).toBe(0);

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game, "target");

    expect(currentPower(game.state, "p1", "target")).toBe(7_000);
    expect(
      observe(game.state, "p2").opponent.board.find(
        (card) => card.instanceId === "target",
      )?.basePower,
    ).toBe(7_000);
  });

  it("ST34-004#2: as the only card in hand there is no DON!! −4, no Life card and no base power 0", () => {
    const game = linlin("faq-st34-004-2")
      .withHand("p2", [instance("linlin", "ST34-004")])
      .withBoard("p1", [character("target", "ST31-003")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST34-004" });
    settle(game, "apply");

    expect(boardCard(game, "p2", "linlin")).toBeDefined();
    expect(fieldDonCount(game.state, "p2")).toBe(10);
    expect(game.state.players.p2.donDeck).toHaveLength(0);
    expect(game.state.players.p2.life).toHaveLength(2);
    expect(currentPower(game.state, "p1", "target")).toBe(3_000);
  });
});

// --- ST-35 ---------------------------------------------------------------------

describe("FAQ ST35-003 Karasu", () => {
  const karasu = (seed: string, opponentHand: number) =>
    table(seed, "p1", [ST35, ST31])
      .withBoard("p1", [character("karasu", "ST35-003")])
      .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
      .withHand("p2", copies(opponentHand, "FIX-002", "theirs"))
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();

  it("ST35-003#1: the opponent picks which of their hand cards is trashed", () => {
    const game = karasu("faq-st35-003-1", 7);
    attack(game, "karasu", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(effectOptions(game, "p1")).toEqual([]);
    expect(effectOptions(game, "p2")).toEqual(
      expect.arrayContaining(ids(game.state.players.p2.hand)),
    );
    game.play({ type: "resolve-effect", optionId: "theirs-4" });
    expect(ids(game.state.players.p2.trash)).toEqual(["theirs-4"]);
    expect(game.state.players.p2.hand).toHaveLength(6);
  });

  it("ST35-003#2: against six cards the deck cost can still be paid, and the opponent keeps all six", () => {
    const game = karasu("faq-st35-003-2", 6);
    attack(game, "karasu", "p2-leader");
    expect(effectOptions(game)).toContain("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.trash)).toEqual([
      "p1-deck-1",
      "p1-deck-2",
    ]);
    expect(game.state.players.p2.hand).toHaveLength(6);
    expect(game.state.players.p2.trash).toHaveLength(0);
  });
});

// --- ST-36 ---------------------------------------------------------------------

describe("FAQ ST36-001 Cavendish", () => {
  /** p2's 4000 attacker K.O.s p1's rested Cavendish in battle. */
  const cavendish = (seed: string, hand: number) => {
    const game = table(seed, "p2", [ST36, ST31])
      .withBoard("p1", [character("cavendish", "ST36-001", { rested: true })])
      .withHand("p1", copies(hand, "FIX-001", "own"))
      .withLife("p1", copies(2, "FIX-002", "p1-life"))
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();
    attack(game, "attacker", "cavendish");
    declineDefence(game);
    return game;
  };

  it("ST36-001#1: with an empty hand no Life card is added", () => {
    const game = cavendish("faq-st36-001-1", 0);
    settle(game, "apply");

    expect(boardCard(game, "p1", "cavendish")).toBeUndefined();
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(ids(game.state.players.p1.deck).slice(0, 2)).toEqual([
      "p1-deck-1",
      "p1-deck-2",
    ]);
  });

  it("ST36-001#1 (control): with a card to trash the Life card is added", () => {
    const game = cavendish("faq-st36-001-1-control", 1);
    settle(game, "apply", "own-1");

    expect(game.state.players.p1.life).toHaveLength(3);
  });
});

describe("FAQ ST36-002 Killer", () => {
  it("ST36-002#1: played by its [Trigger] on the opponent's turn, the [On Play] adds no Life", () => {
    // OP10-099 Eustass"Captain"Kid is a {Kid Pirates} Leader; p2 at 3 Life
    // opens the [Trigger].
    const game = table("faq-st36-002-1", "p2", [ST36, ST31])
      .withLeader("p1", "OP10-099")
      .withLife("p1", [
        instance("killer", "ST36-002"),
        instance("under", "FIX-001"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .withBoard("p2", [character("attacker", "ST31-004")])
      .build();
    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    expect(triggerOptions(game)).toContain("activate");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game, "apply");

    expect(boardCard(game, "p1", "killer")).toBeDefined();
    expect(ids(game.state.players.p1.life)).toEqual(["under"]);
    expect(ids(game.state.players.p1.deck).slice(0, 2)).toEqual([
      "p1-deck-1",
      "p1-deck-2",
    ]);
  });

  it("ST36-002#1 (control): played on its controller's own turn, the [On Play] adds a Life card", () => {
    const game = table("faq-st36-002-1-control", "p1", [ST36, ST31])
      .withLeader("p1", "OP10-099")
      .withHand("p1", [instance("killer", "ST36-002")])
      .withLife("p1", [instance("under", "FIX-001")])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST36-002" });
    settle(game, "apply");

    expect(ids(game.state.players.p1.life)).toEqual(["p1-deck-1", "under"]);
  });
});

describe("FAQ ST36-003 Scratchmen Apoo", () => {
  /** p2 takes p1's top Life card, Apoo, with p1 on `leader`. */
  const apoo = (seed: string, leader: string) => {
    const game = table(seed, "p2", [ST36, ST31])
      .withLeader("p1", leader)
      .withLife("p1", [
        instance("apoo", "ST36-003"),
        instance("under", "FIX-001"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withBoard("p2", [character("attacker", "ST31-004")])
      .build();
    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    return game;
  };

  it("ST36-003#1: under a non-{Supernovas} Leader the [Trigger] still draws, and the Leader's base power stays", () => {
    // ST21-001 Monkey.D.Luffy is not a {Supernovas} Leader.
    const game = apoo("faq-st36-003-1", "ST21-001");
    expect(game.state.pendingTrigger?.card.instanceId).toBe("apoo");
    expect(triggerOptions(game)).toContain("activate");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
    expect(ids(game.state.players.p1.trash)).toContain("apoo");
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(5_000);
  });

  it("ST36-003#1 (control): under a {Supernovas} Leader it draws and the Leader's base power becomes 7000", () => {
    const game = apoo("faq-st36-003-1-control", "OP10-099");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(7_000);
  });
});

describe("FAQ ST36-004 Bartolomeo", () => {
  it("ST36-004#1: with no {Supernovas} card in hand there is no draw", () => {
    const game = table("faq-st36-004-1", "p1", [ST36, ST31])
      .withHand("p1", [
        instance("barto", "ST36-004"),
        instance("other", "FIX-001"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST36-004" });
    settle(game, "apply");

    expect(ids(game.state.players.p1.hand)).toEqual(["other"]);
    expect(ids(game.state.players.p1.deck).slice(0, 2)).toEqual([
      "p1-deck-1",
      "p1-deck-2",
    ]);
  });
});

describe('FAQ ST36-005 Eustass"Captain"Kid', () => {
  it("ST36-005#1: with both edge Life cards face-down the redirect is not offered", () => {
    // The middle card is face-up, but only the top or bottom can pay.
    const game = table("faq-st36-005-1", "p2", [ST36, ST31])
      .withLeader("p1", "OP10-099")
      .withBoard("p1", [
        character("kid", "ST36-005"),
        character("victim", "FIX-001", { rested: true }),
      ])
      .withLife("p1", [
        instance("top", "FIX-001"),
        instance("middle", "FIX-001", { faceUp: true }),
        instance("bottom", "FIX-001"),
      ])
      .withBoard("p2", [character("attacker", "ST31-004")])
      .build();
    attack(game, "attacker", "victim");

    expect(effectOptions(game, "p1")).not.toContain("apply");
    settle(game, "skip");
    expect(game.state.activeAttack?.targetInstanceId).toBe("victim");
    expect(lifeFaces(game, "p1")).toEqual([false, true, false]);
  });

  it("ST36-005#1 (control): with the bottom card face-up the redirect is offered", () => {
    const game = table("faq-st36-005-1-control", "p2", [ST36, ST31])
      .withLeader("p1", "OP10-099")
      .withBoard("p1", [
        character("kid", "ST36-005"),
        character("victim", "FIX-001", { rested: true }),
      ])
      .withLife("p1", [
        instance("top", "FIX-001"),
        instance("bottom", "FIX-001", { faceUp: true }),
      ])
      .withBoard("p2", [character("attacker", "ST31-004")])
      .build();
    attack(game, "attacker", "victim");

    expect(effectOptions(game, "p1")).toContain("apply");
  });

  const kidMain = (seed: string, bottomFaceUp: boolean) =>
    table(seed, "p1", [ST36, ST31])
      .withLeader("p1", "OP10-099")
      .withBoard("p1", [character("kid", "ST36-005")])
      .withDon("p1", { rested: 1 })
      .withLife("p1", [
        instance("top", "FIX-001", { faceUp: true }),
        instance("middle", "FIX-001"),
        instance("bottom", "FIX-001", { faceUp: bottomFaceUp }),
      ])
      .build();

  it("ST36-005#2: with both edge Life cards face-up the [Activate: Main] is not offered", () => {
    const game = kidMain("faq-st36-005-2", true);
    // No face-down edge card to turn, so the activation is not offered: it
    // would spend the turn's use on nothing.
    expect(activations(game, "kid")).toHaveLength(0);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(lifeFaces(game, "p1")).toEqual([true, false, true]);
  });

  it("ST36-005#2 (control): with a face-down edge card the activation gives the DON!!", () => {
    const game = kidMain("faq-st36-005-2-control", false);
    expect(activations(game, "kid").length).toBeGreaterThan(0);
    game.play({ type: "activate-main", sourceInstanceId: "kid" });
    settle(game, "bottom");

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(lifeFaces(game, "p1")).toEqual([true, false, true]);
  });
});
