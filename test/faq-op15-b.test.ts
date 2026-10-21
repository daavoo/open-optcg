import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  fieldDonCount,
  hasKeyword,
  type BoardCard,
  type CardInstance,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-15, cards OP15-060 to OP15-119, one case per
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
const ENEL = "(Purple) Enel - Official Feature Deck";

/** The sealed-format Leader treated as a card with every name, type and attribute. */
const ALL_NAMES = "SEALED-LUFFY";

/** An empty table on one player's turn, late enough for every DON!! to be out. */
const table = (seed: string, active: "p1" | "p2" = "p1", p1Deck = ST31) =>
  scenario()
    .decks(p1Deck, ST32)
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

const attack = (game: Game, attacker: string, target: string) =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

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

/** Passes the Block and Counter steps until the Life Trigger is offered. */
function toTrigger(game: Game): void {
  let guard = 0;
  while (!game.state.pendingTrigger) {
    if (guard++ > 10) throw new Error("no Trigger was offered");
    game.pass();
  }
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

/** Every DON!! p1 has given to its Leader or a Character. */
const givenDon = (game: Game) =>
  game.state.players.p1.leaderAttachedDon.length +
  game.state.players.p1.board.reduce(
    (total, card) => total + (card.attachedDon?.length ?? 0),
    0,
  );

/**
 * p2 plays OP09-018 Get Out of Here! at two of p1's 2000-power Characters at
 * once -- one effect removing two Characters together.
 */
function removeTwo(
  seed: string,
  board: BoardCard[],
  [first, second]: [string, string],
  setup: {
    hand?: CardInstance[];
    life?: CardInstance[];
    leader?: string;
  } = {},
): Game {
  let builder = table(seed, "p2")
    .withBoard("p1", board)
    .withHand("p2", [instance("get-out", "OP09-018")]);
  if (setup.hand) builder = builder.withHand("p1", setup.hand);
  if (setup.life) builder = builder.withLife("p1", setup.life);
  if (setup.leader) builder = builder.withLeader("p1", setup.leader);
  const game = builder.build();
  game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
  game.play({ type: "resolve-effect", optionId: first });
  game.play({ type: "resolve-effect", optionId: second });
  if (game.player === "p2" && effectOptions(game).includes("done")) {
    game.play({ type: "resolve-effect", optionId: "done" });
  }
  return game;
}

/** p2 plays OP17-014 Whitey Bay at one of p1's 2000-base-power Characters. */
function removeOne(
  seed: string,
  board: BoardCard[],
  target: string,
  setup: { hand?: CardInstance[]; life?: CardInstance[] } = {},
): Game {
  let builder = table(seed, "p2")
    .withBoard("p1", board)
    .withHand("p2", [instance("whitey", "OP17-014")]);
  if (setup.hand) builder = builder.withHand("p1", setup.hand);
  if (setup.life) builder = builder.withLife("p1", setup.life);
  const game = builder.build();
  game.play({ type: "play-card", cardNumber: "OP17-014" });
  game.play({ type: "resolve-effect", optionId: target });
  return game;
}

describe("FAQ OP15-060 Enel", () => {
  it("OP15-060#1: the [Blocker] is gained with an empty hand", () => {
    const game = table("faq-op15-060-1")
      .withBoard("p1", [character("enel", "OP15-060")])
      .build();
    expect(game.state.players.p1.hand).toHaveLength(0);

    game.play({ type: "activate-main", sourceInstanceId: "enel" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "enel", "Blocker")).toBe(true);
    expect(fieldDonCount(game.state, "p1")).toBe(9);
  });
});

/**
 * OP15-064 Kotori and OP15-072 Hotori each ask for the other two of the trio
 * by name; a Leader that answers to every name is not one of them on the
 * board, and Bandai rules the effect resolves anyway.
 */
describe("FAQ OP15-064 Kotori", () => {
  it("OP15-064#1: under an every-name Leader, with no [Satori] or [Hotori], the rest still lands", () => {
    const game = table("faq-op15-064-1")
      .withLeader("p1", ALL_NAMES)
      .withBoard("p1", [character("kotori", "OP15-064")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "kotori" });
    untilChoice(game);
    // The costs were paid: two DON!! returned and the Character rested.
    expect(fieldDonCount(game.state, "p1")).toBe(8);
    expect(boardCard(game, "p1", "kotori")?.rested).toBe(true);
    expect(effectOptions(game)).toContain("target");
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")?.rested).toBe(true);
  });
});

describe("FAQ OP15-066 Satori", () => {
  it("OP15-066#1: the two cards looked at go to the same end of the deck", () => {
    const game = table("faq-op15-066-1")
      .withBoard("p1", [character("satori", "OP15-066")])
      // 6 DON!! on the field turns the [When Attacking] on.
      .withDonDeck("p1", 4)
      .withDeckTop("p1", [
        instance("first", "FIX-001"),
        instance("second", "FIX-002"),
        ...copies(3, "ST32-005", "rest"),
      ])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    expect(fieldDonCount(game.state, "p1")).toBe(6);

    attack(game, "satori", "p2-leader");
    untilChoice(game);
    // Try to split them: one to the bottom, the other left on top.
    if (effectOptions(game).includes("first")) {
      game.play({ type: "resolve-effect", optionId: "first" });
    }
    settle(game, "done");

    const deck = ids(game.state.players.p1.deck);
    const atTop = ["first", "second"].filter((id) =>
      deck.slice(0, 2).includes(id),
    );
    const atBottom = ["first", "second"].filter((id) =>
      deck.slice(-2).includes(id),
    );
    expect(atTop.length === 2 || atBottom.length === 2).toBe(true);
  });
});

describe("FAQ OP15-069 Nola", () => {
  it("OP15-069#1: Nola's replacement also covers Nola itself", () => {
    const game = removeOne(
      "faq-op15-069-1",
      [character("nola", "OP15-069")],
      "nola",
    );
    expect(game.player).toBe("p1");
    expect(effectOptions(game)).toContain("replace:nola");
    game.play({ type: "resolve-effect", optionId: "replace:nola" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["nola"]);
    expect(fieldDonCount(game.state, "p1")).toBe(9);
  });

  it("OP15-069#2: one DON!! returned keeps both Characters one effect removes together", () => {
    const game = removeTwo(
      "faq-op15-069-2",
      [character("nola", "OP15-069"), character("deckhand", "FIX-001")],
      ["nola", "deckhand"],
    );
    expect(game.player).toBe("p1");
    // One payment is all that is offered: there is no "return two" option.
    expect(replacements(game)).toHaveLength(1);
    game.play({ type: "resolve-effect", optionId: replacements(game)[0]! });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["nola", "deckhand"]);
    expect(fieldDonCount(game.state, "p1")).toBe(9);
  });
});

/**
 * OP15-070 Fuza and OP15-071 Holly reach every card of theirs bearing a name,
 * and a Leader that answers to every name is one of those cards.
 */
describe("FAQ OP15-070 Fuza", () => {
  it("OP15-070#1: an every-name Leader gains [Unblockable] and is a 6000 on the opponent's turn", () => {
    const own = table("faq-op15-070-1")
      .withLeader("p1", ALL_NAMES)
      .withBoard("p1", [character("fuza", "OP15-070")])
      .build();
    expect(hasKeyword(own.state, "p1", "p1-leader", "Unblockable")).toBe(true);

    const theirs = table("faq-op15-070-1-theirs", "p2")
      .withLeader("p1", ALL_NAMES)
      .withBoard("p1", [character("fuza", "OP15-070")])
      .build();
    expect(currentPower(theirs.state, "p1", "p1-leader")).toBe(6000);
  });
});

describe("FAQ OP15-071 Holly", () => {
  it("OP15-071#1: an every-name Leader gains [Double Attack] and is a 6000 on the opponent's turn", () => {
    const own = table("faq-op15-071-1")
      .withLeader("p1", ALL_NAMES)
      .withBoard("p1", [character("holly", "OP15-071")])
      .build();
    expect(hasKeyword(own.state, "p1", "p1-leader", "Double Attack")).toBe(
      true,
    );

    const theirs = table("faq-op15-071-1-theirs", "p2")
      .withLeader("p1", ALL_NAMES)
      .withBoard("p1", [character("holly", "OP15-071")])
      .build();
    expect(currentPower(theirs.state, "p1", "p1-leader")).toBe(6000);
  });
});

describe("FAQ OP15-072 Hotori", () => {
  it("OP15-072#1: under an every-name Leader, with no [Kotori] or [Satori], the −3000 still lands", () => {
    const game = table("faq-op15-072-1")
      .withLeader("p1", ALL_NAMES)
      .withBoard("p1", [character("hotori", "OP15-072")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "hotori" });
    untilChoice(game);
    // The costs were paid: two DON!! returned and the Character rested.
    expect(fieldDonCount(game.state, "p1")).toBe(8);
    expect(boardCard(game, "p1", "hotori")?.rested).toBe(true);
    expect(effectOptions(game)).toContain("target");
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(2000);
  });
});

describe("FAQ OP15-073 Yama", () => {
  it("OP15-073#1: a {Vassals} Character costing 2 is not offered", () => {
    // No [Heavenly Warriors] in the pool costs more than 1; OP05-106 Shura is
    // a 2-cost {Vassals}, and OP15-067 Shura the 1-cost control.
    const game = table("faq-op15-073-1")
      .withHand("p1", [
        instance("yama", "OP15-073"),
        instance("two-cost", "OP05-106"),
        instance("one-cost", "OP15-067"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-073" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("one-cost");
    expect(effectOptions(game)).not.toContain("two-cost");
  });
});

/**
 * OP15-074 to OP15-078: each `[Main]` is a DON!! −N Event whose later half
 * finds nothing to choose. Bandai rules the DON!! is paid and the draw or buff
 * before it still happens. Played under the Enel Leader, on its six DON!!.
 */
describe("FAQ OP15-074 to OP15-078, the Enel Events", () => {
  const enelTable = (seed: string, event: string) =>
    table(seed, "p1", ENEL)
      .withHand("p1", [instance("event", event)])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();

  it("OP15-074#1: Varie draws with no Character of your own", () => {
    const game = enelTable("faq-op15-074-1", "OP15-074");
    const don = fieldDonCount(game.state, "p1");
    expect(game.state.players.p1.board).toHaveLength(0);
    game.play({ type: "activate-main", sourceCardNumber: "OP15-074" });
    settle(game, "apply");

    expect(fieldDonCount(game.state, "p1")).toBe(don - 1);
    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
  });

  it("OP15-075#1: El Thor gives +1000 with no opposing Character", () => {
    const game = enelTable("faq-op15-075-1", "OP15-075");
    const don = fieldDonCount(game.state, "p1");
    game.play({ type: "activate-main", sourceCardNumber: "OP15-075" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(fieldDonCount(game.state, "p1")).toBe(don - 1);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  it("OP15-076#1: Lightning Beast Kiten draws with no opposing Character", () => {
    const game = enelTable("faq-op15-076-1", "OP15-076");
    const don = fieldDonCount(game.state, "p1");
    game.play({ type: "activate-main", sourceCardNumber: "OP15-076" });
    settle(game, "apply");

    expect(fieldDonCount(game.state, "p1")).toBe(don - 1);
    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
  });

  it("OP15-077#1: Lightning Dragon draws with no rested opposing Character to lock", () => {
    const game = enelTable("faq-op15-077-1", "OP15-077");
    const don = fieldDonCount(game.state, "p1");
    game.play({ type: "activate-main", sourceCardNumber: "OP15-077" });
    settle(game, "apply");

    expect(fieldDonCount(game.state, "p1")).toBe(don - 1);
    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
  });

  it("OP15-078#1: Mamaragan draws with no opposing Character to rest", () => {
    const game = enelTable("faq-op15-078-1", "OP15-078");
    const don = fieldDonCount(game.state, "p1");
    game.play({ type: "activate-main", sourceCardNumber: "OP15-078" });
    settle(game, "apply");

    expect(fieldDonCount(game.state, "p1")).toBe(don - 2);
    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
  });
});

/** p2's 5000-power Rayleigh beats a rested p1 Character in battle. */
function koInBattle(
  seed: string,
  victim: BoardCard,
  trash: CardInstance[] = [],
): Game {
  const game = table(seed, "p2")
    .withBoard("p1", [victim])
    .withTrash("p1", trash)
    .withBoard("p2", [character("attacker", "ST32-004")])
    .build();
  attack(game, "attacker", victim.instanceId);
  declineDefence(game);
  return game;
}

describe("FAQ OP15-079 Absalom", () => {
  it("OP15-079#1: the [On K.O.] may return Absalom itself", () => {
    const game = koInBattle(
      "faq-op15-079-1",
      character("absalom", "OP15-079", { rested: true }),
    );
    untilChoice(game);
    expect(effectOptions(game)).toContain("absalom");
    game.play({ type: "resolve-effect", optionId: "absalom" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["absalom"]);
  });

  it("OP15-079#2: the [Trigger] cannot return Absalom itself", () => {
    const game = table("faq-op15-079-2", "p2")
      .withLife("p1", [instance("absalom", "OP15-079")])
      .withTrash("p1", [instance("perona", "OP15-090")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    untilChoice(game);

    expect(effectOptions(game)).toContain("perona");
    expect(effectOptions(game)).not.toContain("absalom");
    game.play({ type: "resolve-effect", optionId: "perona" });
    settle(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["perona"]);
  });
});

describe("FAQ OP15-080 Oars", () => {
  it("OP15-080#1: Oars may be one of the three cards, and then is not played", () => {
    const game = koInBattle(
      "faq-op15-080-1",
      character("oars", "OP15-080", { rested: true }),
      copies(2, "FIX-001", "trashed"),
    );
    untilChoice(game);
    expect(effectOptions(game)).toContain("oars");
    game.play({ type: "resolve-effect", optionId: "oars" });
    game.play({ type: "resolve-effect", optionId: "trashed-1" });
    game.play({ type: "resolve-effect", optionId: "trashed-2" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual([]);
    expect(ids(game.state.players.p1.deck)).toContain("oars");
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("OP15-080#2: an every-name Leader at 10000 power does not switch on the +7000", () => {
    const game = table("faq-op15-080-2")
      .withLeader("p1", ALL_NAMES)
      .withBoard("p1", [character("oars", "OP15-080")])
      .withDon("p1", { leaderAttached: 5 })
      .build();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(10_000);
    expect(currentPower(game.state, "p1", "oars")).toBe(0);

    // Control: a 10000-power OP14-104 Gecko Moria Character does.
    const control = table("faq-op15-080-2-control")
      .withBoard("p1", [
        character("oars", "OP15-080"),
        character("moria", "OP14-104"),
      ])
      .build();
    expect(currentPower(control.state, "p1", "oars")).toBe(7000);
  });
});

describe("FAQ OP15-082 Charlotte Lola", () => {
  it("OP15-082#1: the [On K.O.] may return Lola itself", () => {
    const game = koInBattle(
      "faq-op15-082-1",
      character("lola", "OP15-082", { rested: true }),
    );
    untilChoice(game);
    expect(effectOptions(game)).toContain("lola");
    game.play({ type: "resolve-effect", optionId: "lola" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["lola"]);
  });
});

describe("FAQ OP15-083 Spoil", () => {
  it("OP15-083#1: on 14 trash cards, Spoil trashing itself makes 15 and the DON!! is given", () => {
    const game = table("faq-op15-083-1")
      .withBoard("p1", [character("spoil", "OP15-083")])
      .withTrash("p1", copies(14, "FIX-001", "trashed"))
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "spoil" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.trash).toHaveLength(15);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });
});

describe("FAQ OP15-088 Pirates Docking Six", () => {
  it("OP15-088#1: a {Straw Hat Crew} 2-cost among the three trashed cards may be played", () => {
    const game = table("faq-op15-088-1")
      .withHand("p1", [instance("docking", "OP15-088")])
      .withDeckTop("p1", [
        instance("zoro", "ST32-005"),
        ...copies(2, "FIX-001", "milled"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-088" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("zoro");
    game.play({ type: "resolve-effect", optionId: "zoro" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["docking", "zoro"]);
  });
});

describe("FAQ OP15-090 Perona", () => {
  it("OP15-090#1: Perona's replacement also covers Perona itself", () => {
    const game = removeOne(
      "faq-op15-090-1",
      [character("perona", "OP15-090")],
      "perona",
      { hand: [instance("spare", "FIX-001")] },
    );
    expect(effectOptions(game)).toContain("replace:perona");
    game.play({ type: "resolve-effect", optionId: "replace:perona" });
    settle(game, "spare");

    expect(ids(game.state.players.p1.board)).toEqual(["perona"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["spare"]);
  });

  it("OP15-090#2: one card trashed keeps both Characters one effect removes together", () => {
    const game = removeTwo(
      "faq-op15-090-2",
      [character("perona", "OP15-090"), character("deckhand", "FIX-001")],
      ["perona", "deckhand"],
      { hand: copies(2, "FIX-001", "spare") },
    );
    expect(game.player).toBe("p1");
    expect(replacements(game)).toHaveLength(1);
    game.play({ type: "resolve-effect", optionId: replacements(game)[0]! });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["perona", "deckhand"]);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("FAQ OP15-092 Monkey.D.Luffy", () => {
  it("OP15-092#1: on 30 trash cards all three tiers apply together", () => {
    const own = table("faq-op15-092-1")
      .withBoard("p1", [character("luffy", "OP15-092")])
      .withTrash("p1", copies(30, "FIX-001", "trashed"))
      .build();
    // 9000 base from the first tier, +1000 from the third.
    expect(currentPower(own.state, "p1", "luffy")).toBe(10_000);
    expect(effectiveCost(own.state, "p1", own.state.players.p1.board[0]!)).toBe(
      17,
    );

    // The second tier, read on the opponent's turn.
    const theirs = table("faq-op15-092-1-theirs", "p2")
      .withBoard("p1", [character("luffy", "OP15-092")])
      .withTrash("p1", copies(30, "FIX-001", "trashed"))
      .build();
    expect(currentPower(theirs.state, "p1", "p1-leader")).toBe(7000);
    expect(currentPower(theirs.state, "p1", "luffy")).toBe(10_000);
  });
});

describe("FAQ OP15-093 The Risky Brothers", () => {
  it("OP15-093#1: on 14 trash cards, trashing itself makes 15 and the grant lands", () => {
    const game = table("faq-op15-093-1")
      .withBoard("p1", [
        character("risky", "OP15-093"),
        character("luffy", "OP15-092"),
      ])
      .withTrash("p1", copies(14, "FIX-001", "trashed"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "risky" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("luffy");
    game.play({ type: "resolve-effect", optionId: "luffy" });
    settle(game);

    expect(game.state.players.p1.trash).toHaveLength(15);
    expect(hasKeyword(game.state, "p1", "luffy", "Rush: Character")).toBe(true);
    expect(
      boardCard(game, "p1", "luffy")?.grantedAttributes?.attributes,
    ).toContain("Slash");
  });
});

describe("FAQ OP15-094 Roronoa Zoro", () => {
  it("OP15-094#1: trashing Zoro once saves two {Straw Hat Crew} Characters removed together", () => {
    const game = removeTwo(
      "faq-op15-094-1",
      [
        character("zoro", "OP15-094"),
        character("hat-a", "ST32-005"),
        character("hat-b", "ST32-005"),
      ],
      ["hat-a", "hat-b"],
    );
    expect(game.player).toBe("p1");
    expect(replacements(game)).toEqual(["replace:zoro"]);
    game.play({ type: "resolve-effect", optionId: "replace:zoro" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["hat-a", "hat-b"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["zoro"]);
  });
});

describe("FAQ OP15-095 Gum-Gum Storm", () => {
  it("OP15-095#1 ([Main]): on 14 trash cards the Event itself makes 15, and the +3000 lands", () => {
    const game = table("faq-op15-095-1-main")
      .withLeader("p1", "OP15-098")
      .withHand("p1", [instance("storm", "OP15-095")])
      .withTrash("p1", copies(14, "FIX-001", "trashed"))
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP15-095" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.trash).toHaveLength(15);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8000);
  });

  it("OP15-095#1 ([Counter]): on 14 trash cards the Event itself makes 15, and the +4000 lands", () => {
    const game = table("faq-op15-095-1-counter", "p2")
      .withHand("p1", [instance("storm", "OP15-095")])
      .withTrash("p1", copies(14, "FIX-001", "trashed"))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 5000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", cardNumber: "OP15-095" });
    settle(game, "p1-leader");

    expect(game.state.players.p1.trash).toHaveLength(15);
    expect(game.state.activeAttack?.counterPower ?? 0).toBe(4000);
  });
});

describe("FAQ OP15-097 I Find It Embarrassing as a Human Being", () => {
  it("OP15-097#1: on 9 trash cards the [Main] locks from hand, and the [Trigger] does nothing", () => {
    const fromHand = table("faq-op15-097-1-main")
      .withHand("p1", [instance("event", "OP15-097")])
      .withTrash("p1", copies(9, "FIX-001", "trashed"))
      .withBoard("p2", [character("target", "ST32-004")])
      .build();
    fromHand.play({ type: "activate-main", sourceCardNumber: "OP15-097" });
    untilChoice(fromHand);
    expect(effectOptions(fromHand)).toContain("target");
    fromHand.play({ type: "resolve-effect", optionId: "target" });
    settle(fromHand);
    expect(
      boardCard(fromHand, "p2", "target")?.cannotAttackUntilTurn,
    ).toBeDefined();

    const fromLife = table("faq-op15-097-1-trigger", "p2")
      .withLife("p1", [instance("event", "OP15-097")])
      .withTrash("p1", copies(9, "FIX-001", "trashed"))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    attack(fromLife, "attacker", "p1-leader");
    toTrigger(fromLife);
    // The engine withholds a Trigger activation that would resolve nothing,
    // so the inert activation may not be on offer at all; either way the
    // lock must not land.
    const activate = fromLife
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "activate",
      );
    fromLife.play({
      type: "resolve-trigger",
      optionId: activate ? "activate" : "skip",
    });
    expect(effectOptions(fromLife, "p1")).not.toContain("attacker");
    settle(fromLife, "skip", "done");
    expect(
      boardCard(fromLife, "p2", "attacker")?.cannotAttackUntilTurn,
    ).toBeUndefined();
  });
});

describe("FAQ OP15-098 Monkey.D.Luffy (Leader)", () => {
  it("OP15-098#1: one Life card keeps two {Sky Island} 6000s an opposing effect removes together", () => {
    // OP08-119 Kaido & Linlin K.O.s every other Character at once.
    const game = table("faq-op15-098-1", "p2")
      .withLeader("p1", "OP15-098")
      .withBoard("p1", [
        character("zoro", "OP15-113"),
        character("wyper", "OP15-114"),
      ])
      .withLife("p1", [
        instance("life-top", "FIX-001"),
        instance("life-next", "FIX-002"),
      ])
      .withBoard("p2", [character("kaido", "OP08-119")])
      .build();

    attack(game, "kaido", "p1-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    let guard = 0;
    while (game.state.pendingEffect && replacements(game).length === 0) {
      if (guard++ > 10) throw new Error("no replacement was offered");
      game.play({ type: "resolve-effect" });
    }
    expect(game.player).toBe("p1");
    expect(replacements(game)).toHaveLength(1);
    game.play({ type: "resolve-effect", optionId: replacements(game)[0]! });

    expect(ids(game.state.players.p1.board)).toEqual(["zoro", "wyper"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["life-top"]);
  });

  it("OP15-098#2: on 0 Life nothing keeps the {Sky Island} Character", () => {
    const game = table("faq-op15-098-2", "p2")
      .withLeader("p1", "OP15-098")
      .withBoard("p1", [character("wyper", "OP15-114")])
      .withHand("p2", [instance("thread", "OP10-079")])
      .build();
    expect(game.state.players.p1.life).toHaveLength(0);

    game.play({ type: "activate-main", sourceCardNumber: "OP10-079" });
    game.play({ type: "resolve-effect", optionId: "wyper" });
    expect(
      effectOptions(game, "p1").some((id) => id.startsWith("replace:")),
    ).toBe(false);
    settle(game);
    expect(ids(game.state.players.p1.board)).toEqual([]);
  });
});

describe("FAQ OP15-099 Urouge", () => {
  /** Activates Urouge if it is offered at all, and answers every prompt. */
  const tryUrouge = (game: Game) => {
    const offered = activations(game, "urouge");
    if (offered.length === 0) return;
    game.submit(offered[0]!);
    settle(game, "urouge", "p1-leader");
  };

  it("OP15-099#1: no DON!! is given with a face-down top Life card, or with no Life", () => {
    const faceDown = table("faq-op15-099-1-down")
      .withBoard("p1", [character("urouge", "OP15-099")])
      .withLife("p1", [instance("hidden", "FIX-001")])
      .withDon("p1", { rested: 1 })
      .build();
    tryUrouge(faceDown);
    expect(givenDon(faceDown)).toBe(0);
    expect(faceDown.state.players.p1.restedDon).toHaveLength(1);

    const noLife = table("faq-op15-099-1-empty")
      .withBoard("p1", [character("urouge", "OP15-099")])
      .withDon("p1", { rested: 1 })
      .build();
    tryUrouge(noLife);
    expect(givenDon(noLife)).toBe(0);
    expect(noLife.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe("FAQ OP15-100 Kamakiri", () => {
  it("OP15-100#1: declining to trash Kamakiri takes no Life and K.O.s nothing", () => {
    const game = table("faq-op15-100-1")
      .withHand("p1", [instance("kamakiri", "OP15-100")])
      .withLife("p1", [instance("life-top", "FIX-001")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-100" });
    expect(effectOptions(game)).toContain("skip");
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["kamakiri"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-top"]);
    expect(ids(game.state.players.p2.board)).toEqual(["target"]);
  });

  it("OP15-100#2: on 0 Life the K.O. cannot be bought", () => {
    const game = table("faq-op15-100-2")
      .withHand("p1", [instance("kamakiri", "OP15-100")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-100" });
    settle(game, "apply", "target");

    expect(ids(game.state.players.p2.board)).toEqual(["target"]);
  });
});

describe("FAQ OP15-103 Genbo", () => {
  it("OP15-103#1: on 3 Life counting Genbo itself, its [Trigger] plays it", () => {
    const game = table("faq-op15-103-1", "p2")
      .withLife("p1", [
        instance("genbo", "OP15-103"),
        instance("life-2", "FIX-001"),
        instance("life-3", "FIX-001"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["genbo"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-2", "life-3"]);
  });
});

describe("FAQ OP15-105 Jewelry Bonney", () => {
  it("OP15-105#1: one Life card keeps both Characters one effect removes together", () => {
    const game = removeTwo(
      "faq-op15-105-1",
      [character("bonney", "OP15-105"), character("deckhand", "FIX-001")],
      ["bonney", "deckhand"],
      {
        life: [
          instance("life-top", "FIX-001"),
          instance("life-next", "FIX-002"),
        ],
      },
    );
    expect(game.player).toBe("p1");
    expect(replacements(game)).toHaveLength(1);
    game.play({ type: "resolve-effect", optionId: replacements(game)[0]! });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["bonney", "deckhand"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["life-top"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-next"]);
  });
});

/**
 * The PDF files this ruling under OP15-106, but the card it asks about --
 * Jewelry Bonney's replacement that keeps a Character on the field -- is OP15-105;
 * OP15-106 is Octoballoon, which prints no replacement.
 */
describe("FAQ OP15-106 (Jewelry Bonney, OP15-105)", () => {
  it("OP15-106#1: Bonney's replacement also covers Bonney itself", () => {
    const game = removeOne(
      "faq-op15-106-1",
      [character("bonney", "OP15-105")],
      "bonney",
      { life: [instance("life-top", "FIX-001")] },
    );
    expect(effectOptions(game)).toContain("replace:bonney");
    game.play({ type: "resolve-effect", optionId: "replace:bonney" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["bonney"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["life-top"]);
  });
});

describe("FAQ OP15-109 Nico Robin", () => {
  it("OP15-109#1: on 0 Life nothing is banked and nothing is played", () => {
    const game = table("faq-op15-109-1")
      .withLeader("p1", "OP15-098")
      .withHand("p1", [
        instance("robin", "OP15-109"),
        instance("recruit", "OP15-113"),
      ])
      .withDeckTop("p1", [instance("banked", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-109" });
    settle(game, "apply", "banked", "recruit");

    expect(game.state.players.p1.life).toHaveLength(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["recruit"]);
    expect(ids(game.state.players.p1.board)).toEqual(["robin"]);
  });
});

describe("FAQ OP15-113 Roronoa Zoro", () => {
  it("OP15-113#1: with an empty hand no Life card is added", () => {
    const game = table("faq-op15-113-1")
      .withHand("p1", [instance("zoro", "OP15-113")])
      .withLife("p1", [instance("life-top", "FIX-001")])
      .withDeckTop("p1", [instance("banked", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-113" });
    settle(game, "apply", "banked");

    expect(ids(game.state.players.p1.life)).toEqual(["life-top"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["banked"]);
  });
});

describe("FAQ OP15-114 Wyper", () => {
  const wyperTable = (seed: string, life: CardInstance[]) =>
    table(seed)
      .withHand("p1", [instance("wyper", "OP15-114")])
      .withLife("p1", life)
      .withBoard("p2", [character("small", "FIX-001")])
      .build();

  it("OP15-114#1: an already face-up top Life card, or no Life, buys nothing", () => {
    const faceUp = wyperTable("faq-op15-114-1-up", [
      instance("shown", "FIX-001", { faceUp: true }),
    ]);
    faceUp.play({ type: "play-card", cardNumber: "OP15-114" });
    settle(faceUp, "apply", "shown");
    expect(ids(faceUp.state.players.p2.board)).toEqual(["small"]);
    expect(currentPower(faceUp.state, "p2", "small")).toBe(2000);

    const noLife = wyperTable("faq-op15-114-1-empty", []);
    noLife.play({ type: "play-card", cardNumber: "OP15-114" });
    settle(noLife, "apply");
    expect(ids(noLife.state.players.p2.board)).toEqual(["small"]);
    expect(currentPower(noLife.state, "p2", "small")).toBe(2000);
  });
});

describe("FAQ OP15-116 Gum-Gum Golden Rifle", () => {
  it("OP15-116#1: on 0 Life, or with no other card in hand, the deck's top card is still banked", () => {
    const noLife = table("faq-op15-116-1-life")
      .withLeader("p1", "OP15-098")
      .withHand("p1", [
        instance("rifle", "OP15-116"),
        instance("spare", "FIX-001"),
      ])
      .withDeckTop("p1", [instance("banked", "FIX-002")])
      .build();
    noLife.play({ type: "activate-main", sourceCardNumber: "OP15-116" });
    settle(noLife, "banked", "spare");
    expect(ids(noLife.state.players.p1.life)).toEqual(["banked"]);

    const noHand = table("faq-op15-116-1-hand")
      .withLeader("p1", "OP15-098")
      .withHand("p1", [instance("rifle", "OP15-116")])
      .withLife("p1", [instance("life-top", "FIX-001")])
      .withDeckTop("p1", [instance("banked", "FIX-002")])
      .build();
    noHand.play({ type: "activate-main", sourceCardNumber: "OP15-116" });
    settle(noHand, "banked");
    expect(ids(noHand.state.players.p1.life)).toEqual(["banked"]);
  });

  it("OP15-116#2: under a Leader outside {Straw Hat Crew} nothing is banked or trashed", () => {
    // OP15-001 Krieg is an {East Blue} Leader.
    const game = table("faq-op15-116-2")
      .withLeader("p1", "OP15-001")
      .withHand("p1", [
        instance("rifle", "OP15-116"),
        instance("spare", "FIX-001"),
      ])
      .withLife("p1", [instance("life-top", "FIX-001")])
      .withDeckTop("p1", [instance("banked", "FIX-002")])
      .build();
    // The engine may withhold an activation that resolves nothing; if it is
    // offered, it must change nothing.
    const offered = game
      .legalActions()
      .filter(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "OP15-116",
      );
    if (offered.length > 0) {
      game.submit(offered[0]!);
      settle(game, "banked", "spare");
    }

    expect(ids(game.state.players.p1.life)).toEqual(["life-top"]);
    expect(ids(game.state.players.p1.hand)).toContain("spare");
    expect(ids(game.state.players.p1.deck)).toEqual(["banked"]);
  });
});

describe("FAQ OP15-119 Monkey.D.Luffy", () => {
  /** p1's Luffy on 7000 printed power, with `life` as its Life. */
  const luffyBoard = [character("luffy", "OP15-119")];

  it("OP15-119#1: a face-up top Life card is revealed all the same, for its cost", () => {
    const game = table("faq-op15-119-1")
      .withBoard("p1", luffyBoard)
      // A 7-cost on top of Life, already face-up: +7000.
      .withLife("p1", [instance("shown", "OP15-109", { faceUp: true })])
      .withBoard("p2", [character("blocker", "OP06-032")])
      .build();

    attack(game, "luffy", "p2-leader");
    game.play({ type: "block", blockerInstanceId: "blocker" });
    settle(game, "apply", "shown");

    expect(currentPower(game.state, "p1", "luffy")).toBe(14_000);
  });

  it("OP15-119#2: an Event OP15-046 Sabo's [On Play] activates counts", () => {
    const game = table("faq-op15-119-2", "p2")
      .withBoard("p1", luffyBoard)
      .withLife("p1", [instance("life-top", "OP15-109")])
      .withLeader("p2", "OP15-039")
      .withHand("p2", [
        instance("sabo", "OP15-046"),
        instance("bulls", "OP15-019"),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-046" });
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 20) throw new Error("pending effect never settled");
      const options = effectOptions(game);
      const pick = ["bulls", "apply", "life-top"].find((id) =>
        options.includes(id),
      );
      game.play(
        pick
          ? { type: "resolve-effect", optionId: pick }
          : { type: "resolve-effect" },
      );
    }

    expect(ids(game.state.players.p2.trash)).toContain("bulls");
    expect(currentPower(game.state, "p1", "luffy")).toBe(14_000);
  });

  it("OP15-119#3: an Event's [Main] resolved from the trash by EB03-031 Vinsmoke Reiju does not count", () => {
    const game = table("faq-op15-119-3", "p2")
      .withBoard("p1", luffyBoard)
      .withLife("p1", [instance("life-top", "OP15-109")])
      .withLeader("p2", "OP12-041")
      .withHand("p2", [instance("reiju", "EB03-031")])
      .withTrash("p2", [instance("bulls", "OP15-019")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-031" });
    settle(game, "apply", "bulls", "life-top");

    // The Event's [Main] did resolve: its draw landed.
    expect(ids(game.state.players.p2.hand)).toContain("p2-deck-1");
    expect(currentPower(game.state, "p1", "luffy")).toBe(7000);
  });

  /** p1's Luffy hits p2's Leader, whose top Life card is `trigger`. */
  const triggerOnHit = (
    seed: string,
    trigger: string,
    setup: (builder: ReturnType<typeof table>) => ReturnType<typeof table>,
  ) => {
    const game = setup(
      table(seed)
        .withBoard("p1", luffyBoard)
        .withLife("p1", [instance("life-top", "OP15-109")])
        .withLife("p2", [instance("trigger", trigger)]),
    ).build();
    attack(game, "luffy", "p2-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game, "apply", "life-top", "luffy");
    return game;
  };

  it("OP15-119#4: an Event activating its own [Trigger] does not count", () => {
    // OP10-079 God Thread's [Trigger] adds a DON!! and touches no Character;
    // two DON!! left in p2's DON!! deck give it one to add.
    const game = triggerOnHit("faq-op15-119-4", "OP10-079", (builder) =>
      builder.withDonDeck("p2", 2),
    );
    expect(ids(game.state.players.p2.trash)).toContain("trigger");
    expect(game.state.players.p2.donDeck).toHaveLength(1);
    expect(currentPower(game.state, "p1", "luffy")).toBe(7000);
  });

  it("OP15-119#5: a [Trigger] that activates the Event's [Main] does not count", () => {
    // OP15-097's [Trigger] activates its own [Main]; on 10 trash cards it
    // locks Luffy, a base-cost-5 Character, which moves no power.
    const game = triggerOnHit("faq-op15-119-5", "OP15-097", (builder) =>
      builder.withTrash("p2", copies(10, "FIX-001", "p2-trashed")),
    );
    expect(ids(game.state.players.p2.trash)).toContain("trigger");
    expect(boardCard(game, "p1", "luffy")?.cannotAttackUntilTurn).toBeDefined();
    expect(currentPower(game.state, "p1", "luffy")).toBe(7000);
  });

  it("OP15-119#6: on 0 Life the opponent's [Blocker] grows nothing", () => {
    const game = table("faq-op15-119-6")
      .withBoard("p1", luffyBoard)
      .withBoard("p2", [character("blocker", "OP06-032")])
      .build();
    expect(game.state.players.p1.life).toHaveLength(0);

    attack(game, "luffy", "p2-leader");
    game.play({ type: "block", blockerInstanceId: "blocker" });
    settle(game, "apply");

    expect(currentPower(game.state, "p1", "luffy")).toBe(7000);
  });
});
