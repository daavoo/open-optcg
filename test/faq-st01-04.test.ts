import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for the first four starter decks (ST-01 to ST-04), one
 * case per ruling, named by the Q&A id (`<card>#<n>`, in the order the PDF
 * prints them for that card).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to.
 *
 * Of the 66 rulings only five are on cards in the pool: ST01-011 Brook and
 * ST02-007 Jewelry Bonney, the two block-1 starter cards a block-4 reprint
 * keeps Standard-legal. The rest are listed in `NOT_IN_POOL`.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_st-01-st-04.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const notImported = (card: string, set: string, kept: string): string =>
  `${card} is not in packages/cards: ${set} was imported only for ${kept}, the card a block-4 reprint keeps Standard-legal.`;
const neverImported = (card: string, set: string): string =>
  `${card} is not in packages/cards: no ${set} card was ever imported.`;

const st01 = (card: string) => notImported(card, "ST-01", "ST01-011 Brook");
const st02 = (card: string) =>
  notImported(card, "ST-02", "ST02-007 Jewelry Bonney");
const st03 = (card: string) => neverImported(card, "ST-03");
const st04 = (card: string) => neverImported(card, "ST-04");

/**
 * Cards this PDF rules on that are not in the engine's card pool at all.
 */
export const NOT_IN_POOL: Readonly<Record<string, string>> = {
  "ST01-001#1": st01("ST01-001 Monkey.D.Luffy (Leader)"),
  "ST01-001#2": st01("ST01-001 Monkey.D.Luffy (Leader)"),
  "ST01-002#1": st01("ST01-002 Usopp"),
  "ST01-004#1": st01("ST01-004 Sanji"),
  "ST01-005#1": st01("ST01-005 Jinbe"),
  "ST01-007#1": st01("ST01-007 Nami"),
  "ST01-012#1": st01("ST01-012 Monkey.D.Luffy"),
  "ST01-013#1": st01("ST01-013 Roronoa Zoro"),
  "ST01-015#1": st01("ST01-015 Gum-Gum Jet Pistol"),
  "ST01-016#1": st01("ST01-016 Diable Jambe"),
  "ST01-016#2": st01("ST01-016 Diable Jambe"),
  "ST01-017#1": st01("ST01-017 Thousand Sunny"),
  "ST02-001#1": st02('ST02-001 Eustass"Captain"Kid (Leader)'),
  "ST02-003#1": st02("ST02-003 Urouge"),
  "ST02-003#2": st02("ST02-003 Urouge"),
  "ST02-003#3": st02("ST02-003 Urouge"),
  "ST02-008#1": st02("ST02-008 Scratchmen Apoo"),
  "ST02-008#2": st02("ST02-008 Scratchmen Apoo"),
  "ST02-009#1": st02("ST02-009 Trafalgar Law"),
  "ST02-009#2": st02("ST02-009 Trafalgar Law"),
  "ST02-010#1": st02("ST02-010 Basil Hawkins"),
  "ST02-010#2": st02("ST02-010 Basil Hawkins"),
  "ST02-010#3": st02("ST02-010 Basil Hawkins"),
  "ST02-010#4": st02("ST02-010 Basil Hawkins"),
  "ST02-010#5": st02("ST02-010 Basil Hawkins"),
  "ST02-013#1": st02('ST02-013 Eustass"Captain"Kid'),
  "ST02-013#2": st02('ST02-013 Eustass"Captain"Kid'),
  "ST02-014#1": st02("ST02-014 X.Drake"),
  "ST02-015#1": st02("ST02-015 Scalpel"),
  "ST02-015#2": st02("ST02-015 Scalpel"),
  "ST02-016#1": st02("ST02-016 Repel"),
  "ST02-017#1": st02("ST02-017 Straw Sword"),
  "ST02-017#2": st02("ST02-017 Straw Sword"),
  "ST02-017#3": st02("ST02-017 Straw Sword"),
  "ST03-001#1": st03("ST03-001 Crocodile (Leader)"),
  "ST03-003#1": st03("ST03-003 Crocodile"),
  "ST03-003#2": st03("ST03-003 Crocodile"),
  "ST03-004#1": st03("ST03-004 Gecko Moria"),
  "ST03-005#1": st03("ST03-005 Dracule Mihawk"),
  "ST03-007#1": st03("ST03-007 Sentomaru"),
  "ST03-009#1": st03("ST03-009 Donquixote Doflamingo"),
  "ST03-010#1": st03("ST03-010 Bartholomew Kuma"),
  "ST03-010#2": st03("ST03-010 Bartholomew Kuma"),
  "ST03-014#1": st03("ST03-014 Marshall.D.Teach"),
  "ST03-015#1": st03("ST03-015 Sables"),
  "ST03-016#1": st03("ST03-016 Thrust Pad Cannon"),
  "ST03-016#2": st03("ST03-016 Thrust Pad Cannon"),
  "ST03-016#3": st03("ST03-016 Thrust Pad Cannon"),
  "ST03-017#1": st03("ST03-017 Love-Love Mellow"),
  "ST04-001#1": st04("ST04-001 Kaido (Leader)"),
  "ST04-002#1": st04("ST04-002 Ulti"),
  "ST04-003#1": st04("ST04-003 Kaido"),
  "ST04-008#1": st04("ST04-008 Jack"),
  "ST04-008#2": st04("ST04-008 Jack"),
  "ST04-010#1": st04("ST04-010 Who's.Who"),
  "ST04-014#1": st04('ST04-014 Lead Performer "Disaster"'),
  "ST04-014#2": st04('ST04-014 Lead Performer "Disaster"'),
  "ST04-015#1": st04("ST04-015 Brachio Bomber"),
  "ST04-016#1": st04("ST04-016 Blast Breath"),
  "ST04-017#1": st04("ST04-017 Onigashima Island"),
  "ST04-017#2": st04("ST04-017 Onigashima Island"),
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

/** Answers "apply" until a prompt offers something other than apply/skip/done. */
function untilChoice(game: Game): void {
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game).every((option) =>
      ["apply", "skip", "done"].includes(option),
    )
  ) {
    if (guard++ > 20) throw new Error("no card choice was offered");
    const options = effectOptions(game);
    game.play({
      type: "resolve-effect",
      optionId: options.includes("apply") ? "apply" : options[0]!,
    });
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

const activations = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    );

/** Submits the pending `order-to-bottom` offer with `order` in place of the default. */
function orderToBottom(game: Game, order: string): string[] {
  const offer = game
    .legalActions()
    .find(
      (action) =>
        action.type === "resolve-effect" && action.option.kind === "order",
    );
  if (offer?.type !== "resolve-effect" || offer.option.kind !== "order") {
    throw new Error("no order to choose");
  }
  const cards = offer.option.cards.map((card) => card.instanceId);
  game.submit({
    ...offer,
    actionId: offer.actionId.replace(/order:[\d,]+$/, order),
    optionId: order,
  });
  return cards;
}

describe("FAQ ST-01 to ST-04: cards outside the pool", () => {
  it("every NOT_IN_POOL card really is missing from the card registry", () => {
    for (const ruling of Object.keys(NOT_IN_POOL)) {
      const cardNumber = ruling.split("#")[0]!;
      expect(cardRegistry.has(cardNumber), cardNumber).toBe(false);
    }
  });
});

// --- ST-01 -------------------------------------------------------------------

describe("FAQ ST01-011 Brook", () => {
  /** Brook in hand, a Character beside the Leader, and two rested DON!!. */
  const playBrook = (seed: string) => {
    const game = table(seed)
      .withHand("p1", [instance("brook", "ST01-011")])
      .withBoard("p1", [character("ally", "FIX-001")])
      .withDon("p1", { rested: 2 })
      .build();
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    game.play({ type: "play-card", cardNumber: "ST01-011" });
    untilChoice(game);
    return game;
  };

  it("ST01-011#1: up to two means one is a legal amount to give", () => {
    const game = playBrook("faq-st01-011-1");
    const rested = game.state.players.p1.restedDon.length;
    expect(effectOptions(game)).toContain("give:ally:1");
    game.play({ type: "resolve-effect", optionId: "give:ally:1" });
    settle(game);

    expect(boardCard(game, "p1", "ally")?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(rested - 1);
  });

  it("ST01-011#2: both DON!! go to one recipient; they cannot be split between two", () => {
    const game = playBrook("faq-st01-011-2");
    // Every offer names a single recipient: there is no option pairing the
    // Leader with a Character, or two Characters.
    for (const option of effectOptions(game)) {
      expect(["p1-leader", "ally", "brook", "skip"]).toContain(
        option.replace(/^give:(.+):\d+$/, "$1"),
      );
    }
    // Giving one to the Leader ends the effect: no second recipient is asked.
    game.play({ type: "resolve-effect", optionId: "give:p1-leader:1" });
    expect(game.state.pendingEffect).toBeNull();

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(boardCard(game, "p1", "ally")?.attachedDon).toHaveLength(0);
    expect(boardCard(game, "p1", "brook")?.attachedDon).toHaveLength(0);
  });
});

// --- ST-02 -------------------------------------------------------------------

describe("FAQ ST02-007 Jewelry Bonney", () => {
  it("ST02-007#1: a {Supernovas} card that is not green can be added", () => {
    // OP10-101 Urouge is a yellow {Supernovas} Character.
    const game = table("faq-st02-007-1")
      .withBoard("p1", [character("bonney", "ST02-007")])
      .withDeckTop("p1", [
        instance("urouge", "OP10-101"),
        ...copies(4, "FIX-001", "filler"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "bonney" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("urouge");
    game.play({ type: "resolve-effect", optionId: "urouge" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["urouge"]);
  });

  /**
   * Bonney digs five cards with no {Supernovas} among them, distinct so the
   * order under the deck is a real choice, and the rest go under in `order`.
   */
  const digNothing = (seed: string, order?: string) => {
    const game = table(seed)
      .withBoard("p1", [character("bonney", "ST02-007")])
      .withDeckTop("p1", [
        instance("looked-1", "FIX-001"),
        instance("looked-2", "FIX-002"),
        instance("looked-3", "OP16-004"),
        instance("looked-4", "OP16-005"),
        instance("looked-5", "OP16-008"),
        ...copies(2, "FIX-001", "below"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "bonney" });
    let guard = 0;
    while (
      game.state.pendingEffect &&
      !game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-effect" && action.option.kind === "order",
        )
    ) {
      if (guard++ > 10) throw new Error("the cards were never ordered");
      // Nothing qualifies, so no looked-at card may be taken.
      expect(
        effectOptions(game).filter((option) => option.startsWith("looked")),
      ).toEqual([]);
      game.play({
        type: "resolve-effect",
        optionId: effectOptions(game).includes("apply")
          ? "apply"
          : effectOptions(game)[0]!,
      });
    }
    if (order) orderToBottom(game, order);
    settle(game);
    return game;
  };

  it("ST02-007#2: with no {Supernovas} among the five, all five go to the bottom in the order chosen", () => {
    const standard = digNothing("faq-st02-007-2");
    const reordered = digNothing("faq-st02-007-2", "order:4,3,2,1,0");

    for (const game of [standard, reordered]) {
      expect(game.state.players.p1.hand).toHaveLength(0);
      const deck = ids(game.state.players.p1.deck);
      expect(deck.slice(0, 2)).toEqual(["below-1", "below-2"]);
      expect([...deck.slice(2)].sort()).toEqual([
        "looked-1",
        "looked-2",
        "looked-3",
        "looked-4",
        "looked-5",
      ]);
    }
    expect(ids(reordered.state.players.p1.deck).slice(2)).toEqual(
      ids(standard.state.players.p1.deck).slice(2).reverse(),
    );
  });

  it("ST02-007#3: it can rest itself to activate on the turn it is played", () => {
    const game = table("faq-st02-007-3")
      .withHand("p1", [instance("bonney", "ST02-007")])
      .withDeckTop("p1", [
        instance("urouge", "OP10-101"),
        ...copies(4, "FIX-001", "filler"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "ST02-007" });
    settle(game);
    expect(boardCard(game, "p1", "bonney")).toBeDefined();
    expect(activations(game, "bonney")).toHaveLength(1);

    game.play({ type: "activate-main", sourceInstanceId: "bonney" });
    settle(game, "urouge");

    expect(boardCard(game, "p1", "bonney")?.rested).toBe(true);
    expect(ids(game.state.players.p1.hand)).toEqual(["urouge"]);
  });
});
