import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
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
 * Bandai's official Q&A for the starter decks ST-15 through ST-28, one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order each PDF prints them
 * for that card).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to.
 *
 * Source PDFs:
 * - https://en.onepiece-cardgame.com/pdf/qa_st-15-20.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-21.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-22.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_st-23-28.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert, or
 * whose position no card in the pool can create.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

/**
 * Cards these PDFs rule on that are not in the engine's card pool at all. Every
 * card the four PDFs rule on is in the pool; the two other cards they name and
 * the pool lacks, OP01-047 Trafalgar Law and OP04-069 Mr.2.Bon.Kurei(Bentham),
 * are only the means to a position, and each case says which pool card stands
 * in for it.
 */
export const NOT_IN_POOL: Readonly<Record<string, string>> = {};

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

const activations = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    );

/** Activates the card if the engine offers it, and settles whatever follows. */
function activateIfOffered(
  game: Game,
  instanceId: string,
  ...preferred: string[]
): boolean {
  if (activations(game, instanceId).length === 0) return false;
  game.play({ type: "activate-main", sourceInstanceId: instanceId });
  settle(game, ...preferred);
  return true;
}

const replacements = (game: Game) =>
  effectOptions(game).filter((option) => option.startsWith("replace:"));

const costOnBoard = (game: Game, player: "p1" | "p2", id: string) =>
  effectiveCost(game.state, player, boardCard(game, player, id)!);

const givenDon = (game: Game, player: "p1" | "p2") => {
  const seat = game.state.players[player];
  return (
    seat.leaderAttachedDon.length +
    seat.board.reduce(
      (total, card) => total + (card.attachedDon?.length ?? 0),
      0,
    )
  );
};

// --- ST-15 ---------------------------------------------------------------------

describe("FAQ ST15-004 Thatch", () => {
  // ST22-001 Ace & Newgate is a Leader whose type includes Whitebeard Pirates.
  it("ST15-004#1: with no Life it can still be played, and the −2000 still lands", () => {
    const game = table("faq-st15-004-1")
      .withLeader("p1", "ST22-001")
      .withHand("p1", [instance("thatch", "ST15-004")])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();
    expect(game.state.players.p1.life).toHaveLength(0);
    game.play({ type: "play-card", cardNumber: "ST15-004" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("target");
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "thatch")).toBeDefined();
    expect(currentPower(game.state, "p2", "target")).toBe(2_000);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("ST15-004#2: skipping the −2000 still takes the top Life card", () => {
    const game = table("faq-st15-004-2")
      .withLeader("p1", "ST22-001")
      .withHand("p1", [instance("thatch", "ST15-004")])
      .withLife("p1", [
        instance("top", "FIX-001"),
        instance("under", "FIX-002"),
      ])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();
    game.play({ type: "play-card", cardNumber: "ST15-004" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("target");
    chooseNothing(game);
    const lifeOffers: string[][] = [];
    while (game.state.pendingEffect) {
      lifeOffers.push(effectOptions(game));
      settle(game, "top");
    }

    expect(lifeOffers.flat()).not.toContain("skip");
    expect(currentPower(game.state, "p2", "target")).toBe(4_000);
    expect(ids(game.state.players.p1.hand)).toEqual(["top"]);
    expect(ids(game.state.players.p1.life)).toEqual(["under"]);
  });
});

// --- ST-16 ---------------------------------------------------------------------

describe("FAQ ST16-002 Gordon", () => {
  it("ST16-002#1: two {Music} cards buy +2000 for one card, not +1000 each for two", () => {
    // ST11-003 and ST11-004 are {Music} Events; OP16-032 Boa Hancock attacks.
    const game = table("faq-st16-002-1", "p2")
      .withBoard("p1", [
        character("gordon", "ST16-002"),
        character("ally", "FIX-002"),
      ])
      .withHand("p1", [
        instance("music-a", "ST11-003"),
        instance("music-b", "ST11-004"),
      ])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("attacker", "OP16-032")])
      .build();
    attack(game, "attacker", "p1-leader");
    untilChoice(game);
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["music-a", "music-b"]),
    );
    game.play({ type: "resolve-effect", optionId: "music-a" });
    game.play({ type: "resolve-effect", optionId: "music-b" });
    const later: string[][] = [];
    while (game.state.pendingEffect) {
      later.push(effectOptions(game));
      settle(game, "done");
    }

    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "music-a",
      "music-b",
    ]);
    // No second recipient is ever asked for.
    expect(later.flat()).not.toContain("ally");
    expect(later.flat()).not.toContain("gordon");
    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(currentPower(game.state, "p1", "ally", false)).toBe(4_000);
    expect(currentPower(game.state, "p1", "gordon", false)).toBe(0);
  });
});

describe("FAQ ST16-003 Charlotte Katakuri", () => {
  // OP06-001 Uta is a {FILM} Leader.
  const katakuri = (seed: string, rested: boolean) =>
    table(seed)
      .withLeader("p1", "OP06-001")
      .withBoard("p1", [character("katakuri", "ST16-003", { rested })])
      .withDon("p1", { rested: 5 })
      .build();

  it("ST16-003#1: Katakuri itself rested is one of the six rested cards", () => {
    const game = katakuri("faq-st16-003-1", true);
    expect(game.state.players.p1.restedDon).toHaveLength(5);
    expect(currentPower(game.state, "p1", "katakuri")).toBe(6_000);
  });

  it("ST16-003#1 (control): with Katakuri active, five rested DON!! are not enough", () => {
    const game = katakuri("faq-st16-003-1-control", false);
    expect(currentPower(game.state, "p1", "katakuri")).toBe(4_000);
  });
});

// --- ST-17 ---------------------------------------------------------------------

describe("FAQ ST17-001 Crocodile", () => {
  const crocodile = (seed: string, top: string) =>
    table(seed)
      .withHand("p1", [instance("croc", "ST17-001")])
      .withDeckTop("p1", [
        instance("revealed", top),
        instance("second", "FIX-002"),
        instance("third", "FIX-001"),
      ])
      .build();

  it("ST17-001#1: a revealed {The Seven Warlords of the Sea} card is one of the two drawn, then one hand card goes on top", () => {
    // ST17-003 Buggy is a {The Seven Warlords of the Sea} card.
    const game = crocodile("faq-st17-001-1", "ST17-003");
    game.play({ type: "play-card", cardNumber: "ST17-001" });
    untilChoice(game);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "revealed",
      "second",
    ]);
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["revealed", "second"]),
    );
    game.play({ type: "resolve-effect", optionId: "second" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["revealed"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["second", "third"]);
  });

  it("ST17-001#2: a revealed card of another type goes back on top, face-down", () => {
    const game = crocodile("faq-st17-001-2", "FIX-001");
    game.play({ type: "play-card", cardNumber: "ST17-001" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toEqual([
      "revealed",
      "second",
      "third",
    ]);
    expect(game.state.players.p1.deck[0]?.faceUp ?? false).toBe(false);
  });
});

describe("FAQ ST17-002 Trafalgar Law", () => {
  const law = (seed: string, leader?: string) => {
    let builder = table(seed)
      .withHand("p1", [instance("law", "ST17-002")])
      .withBoard("p1", [character("ally", "FIX-001")])
      .withBoard("p2", [character("small", "FIX-001")]);
    if (leader) builder = builder.withLeader("p1", leader);
    const game = builder.build();
    game.play({ type: "play-card", cardNumber: "ST17-002" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("ally");
    game.play({ type: "resolve-effect", optionId: "ally" });
    const offered = game.state.pendingEffect ? effectOptions(game) : [];
    settle(game, "small");
    return { game, offered };
  };

  it("ST17-002#1: without a Warlords Leader the own Character still goes back, and nothing of the opponent's does", () => {
    const { game, offered } = law("faq-st17-002-1");
    expect(ids(game.state.players.p1.hand)).toEqual(["ally"]);
    expect(offered).not.toContain("small");
    expect(boardCard(game, "p2", "small")).toBeDefined();
  });

  it("ST17-002#1 (control): behind a Warlords Leader the bounce is offered", () => {
    // OP14-040 Jinbe is a {The Seven Warlords of the Sea} Leader.
    const { game, offered } = law("faq-st17-002-1-control", "OP14-040");
    expect(offered).toContain("small");
    expect(ids(game.state.players.p2.hand)).toEqual(["small"]);
  });
});

// --- ST-18 ---------------------------------------------------------------------

describe("FAQ ST18-002 O-Nami", () => {
  it("ST18-002#1: with an empty hand and 8 DON!! on the field it still draws two", () => {
    const game = table("faq-st18-002-1")
      .withHand("p1", [instance("nami", "ST18-002")])
      .withDeckTop("p1", [
        instance("one", "FIX-001"),
        instance("two", "FIX-002"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "ST18-002" });
    settle(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["one", "two"]);
  });
});

// --- ST-19 ---------------------------------------------------------------------

describe("FAQ ST19-003 Tashigi", () => {
  // ST27-002 Catarina Devon is a 1-cost whose [On K.O.] draws its owner a card.
  it("ST19-003#1: a Character trashed by the activation does not fire its [On K.O.]", () => {
    // OP10-001 is a [Smoker] Leader, so the [On Play] −4 takes Devon to 0.
    const game = table("faq-st19-003-1")
      .withLeader("p1", "OP10-001")
      .withHand("p1", [instance("tashigi", "ST19-003")])
      .withBoard("p2", [character("devon", "ST27-002")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST19-003" });
    settle(game, "devon");
    expect(costOnBoard(game, "p2", "devon")).toBe(0);
    game.play({ type: "activate-main", sourceInstanceId: "tashigi" });
    settle(game, "devon");

    expect(ids(game.state.players.p2.trash)).toEqual(["devon"]);
    expect(game.state.players.p2.hand).toHaveLength(0);
  });

  it("ST19-003#1 (control): a K.O. of the same Character does fire it", () => {
    // ST27-005 Marshall.D.Teach K.O.s a cost-3-or-less Character.
    const game = table("faq-st19-003-1-control")
      .withBoard("p1", [character("teach", "ST27-005")])
      .withBoard("p2", [character("devon", "ST27-002")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "teach" });
    settle(game, "apply", "devon");

    expect(ids(game.state.players.p2.trash)).toEqual(["devon"]);
    expect(game.state.players.p2.hand).toHaveLength(1);
  });

  it("ST19-003#2: behind a Leader that is not [Smoker] it still trashes a cost-0 Character", () => {
    // ST19-005 Monkey.D.Garp's −1 takes Devon to 0.
    const game = table("faq-st19-003-2")
      .withBoard("p1", [character("garp", "ST19-005")])
      .withTrash("p1", [instance("fuel", "FIX-001")])
      .withHand("p1", [instance("tashigi", "ST19-003")])
      .withBoard("p2", [character("devon", "ST27-002")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "garp" });
    settle(game, "apply", "fuel", "devon");
    expect(costOnBoard(game, "p2", "devon")).toBe(0);
    game.play({ type: "play-card", cardNumber: "ST19-003" });
    settle(game);
    game.play({ type: "activate-main", sourceInstanceId: "tashigi" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("devon");
    game.play({ type: "resolve-effect", optionId: "devon" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["devon"]);
  });
});

describe("FAQ ST19-004 Hina", () => {
  const hina = (seed: string, trash: number) =>
    table(seed)
      .withBoard("p1", [character("hina", "ST19-004")])
      .withTrash("p1", copies(trash, "FIX-001", "p1-trash"))
      .withDon("p1", { rested: 1 })
      .build();

  it("ST19-004#1: with an empty trash it gives no DON!!", () => {
    const game = hina("faq-st19-004-1", 0);
    activateIfOffered(game, "hina", "apply", "p1-leader");

    expect(givenDon(game, "p1")).toBe(0);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("ST19-004#1 (control): with a card in the trash it gives one", () => {
    const game = hina("faq-st19-004-1-control", 1);
    expect(
      activateIfOffered(game, "hina", "apply", "p1-trash-1", "p1-leader"),
    ).toBe(true);

    expect(givenDon(game, "p1")).toBe(1);
  });
});

describe("FAQ ST19-005 Monkey.D.Garp", () => {
  const garp = (seed: string, trash: number) =>
    table(seed)
      .withBoard("p1", [character("garp", "ST19-005")])
      .withTrash("p1", copies(trash, "FIX-001", "p1-trash"))
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

  it("ST19-005#1: with an empty trash it gives no −1 cost", () => {
    const game = garp("faq-st19-005-1", 0);
    activateIfOffered(game, "garp", "apply", "target");

    expect(costOnBoard(game, "p2", "target")).toBe(2);
  });

  it("ST19-005#1 (control): with a card in the trash it does", () => {
    const game = garp("faq-st19-005-1-control", 1);
    expect(
      activateIfOffered(game, "garp", "apply", "p1-trash-1", "target"),
    ).toBe(true);

    expect(costOnBoard(game, "p2", "target")).toBe(1);
  });
});

// --- ST-20 ---------------------------------------------------------------------

describe("FAQ ST20-001 Charlotte Katakuri", () => {
  const katakuri = (seed: string, topFaceUp: boolean) =>
    table(seed)
      .withBoard("p1", [character("katakuri", "ST20-001")])
      .withLife("p1", [
        instance("top", "FIX-001", topFaceUp ? { faceUp: true } : {}),
        instance("under", "FIX-002"),
      ])
      .withDon("p1", { rested: 1 })
      .build();

  it("ST20-001#1: with the top Life card already face-up it gives no DON!!", () => {
    const game = katakuri("faq-st20-001-1", true);
    activateIfOffered(game, "katakuri", "apply", "under", "p1-leader");

    expect(givenDon(game, "p1")).toBe(0);
    expect(game.state.players.p1.life[1]?.faceUp ?? false).toBe(false);
  });

  it("ST20-001#1 (control): with it face-down it does", () => {
    const game = katakuri("faq-st20-001-1-control", false);
    expect(
      activateIfOffered(game, "katakuri", "apply", "top", "p1-leader"),
    ).toBe(true);

    expect(givenDon(game, "p1")).toBe(1);
  });
});

describe("FAQ ST20-002 Charlotte Cracker", () => {
  // p2's ST15-002 Edward.Newgate rests to K.O. a 5000-or-less Character.
  const knockedOut = (seed: string, life: number) => {
    const game = table(seed, "p2")
      .withBoard("p1", [character("cracker", "ST20-002")])
      .withLife("p1", copies(life, "FIX-001", "p1-life"))
      .withBoard("p2", [character("newgate", "ST15-002")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "newgate" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "cracker" });
    return game;
  };

  it("ST20-002#1: with no Life the K.O. cannot be replaced", () => {
    const game = knockedOut("faq-st20-002-1", 0);
    const offered = game.state.pendingEffect ? replacements(game) : [];
    settle(game);

    expect(offered).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toContain("cracker");
  });

  it("ST20-002#1 (control): with a Life card it can", () => {
    const game = knockedOut("faq-st20-002-1-control", 1);
    expect(game.player).toBe("p1");
    expect(replacements(game)).toHaveLength(1);
  });
});

describe("FAQ ST20-005 Charlotte Linlin", () => {
  const linlin = (seed: string, opponentLife: number) => {
    const game = table(seed)
      .withHand("p1", [
        instance("linlin", "ST20-005"),
        instance("fuel", "FIX-001"),
      ])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withHand("p2", [
        instance("a", "FIX-001"),
        instance("b", "FIX-002"),
        instance("c", "ST31-002"),
      ])
      .withLife("p2", copies(opponentLife, "FIX-002", "p2-life"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST20-005" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    expect(game.player).toBe("p2");
    return game;
  };

  it("ST20-005#1: on the hand option the opponent trashes two cards of their own choosing", () => {
    const game = linlin("faq-st20-005-1", 2);
    game.play({ type: "resolve-effect", optionId: "hand" });
    expect(game.player).toBe("p2");
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["a", "b", "c"]),
    );
    game.play({ type: "resolve-effect", optionId: "b" });
    game.play({ type: "resolve-effect", optionId: "c" });
    settle(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["a"]);
    expect(ids(game.state.players.p2.trash).sort()).toEqual(["b", "c"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
  });

  it("ST20-005#2: on the Life option the opponent's top Life card is trashed", () => {
    const game = linlin("faq-st20-005-2", 2);
    game.play({ type: "resolve-effect", optionId: "life" });
    settle(game);

    expect(ids(game.state.players.p2.life)).toEqual(["p2-life-2"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-life-1"]);
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("ST20-005#3: with no Life the opponent may still take the Life option, and nothing happens", () => {
    const game = linlin("faq-st20-005-3", 0);
    expect(effectOptions(game)).toContain("life");
    game.play({ type: "resolve-effect", optionId: "life" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(3);
    expect(game.state.players.p2.trash).toHaveLength(0);
    expect(game.state.players.p2.life).toHaveLength(0);
  });
});

// --- ST-21 ---------------------------------------------------------------------

const blockOffered = (game: Game, blocker: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "block" && action.blockerInstanceId === blocker,
    );

describe("FAQ ST21-003 Sanji", () => {
  it("ST21-003#1: once the selected Character's attack is over, another attacker can be blocked", () => {
    // ST21-014 Monkey.D.Luffy is a 6000 {Straw Hat Crew}; ST10-014 Wire is
    // the opposing [Blocker].
    const game = table("faq-st21-003-1")
      .withHand("p1", [instance("sanji", "ST21-003")])
      .withBoard("p1", [
        character("luffy", "ST21-014"),
        character("other", "FIX-002"),
      ])
      .withBoard("p2", [character("wire", "ST10-014")])
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST21-003" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "luffy" });
    settle(game);

    attack(game, "luffy", "p2-leader");
    settle(game, "done", "skip");
    expect(game.player).toBe("p2");
    expect(blockOffered(game, "wire")).toBe(false);
    declineDefence(game);
    settle(game);

    attack(game, "other", "p2-leader");
    settle(game, "done", "skip");
    expect(game.player).toBe("p2");
    expect(blockOffered(game, "wire")).toBe(true);
  });
});

describe("FAQ ST21-015 Roronoa Zoro", () => {
  /** p2's OP16-032 Boa Hancock (9000) K.O.s a rested Zoro in battle. */
  const zoroKnockedOut = (
    seed: string,
    hand: ReturnType<typeof instance>[],
  ) => {
    const game = table(seed, "p2")
      .withBoard("p1", [character("zoro", "ST21-015", { rested: true })])
      .withHand("p1", hand)
      .withBoard("p2", [character("hancock", "OP16-032")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
      .withDeckTop("p2", copies(3, "FIX-001", "p2-deck"))
      .build();
    attack(game, "hancock", "zoro");
    declineDefence(game);
    expect(ids(game.state.players.p1.trash)).toContain("zoro");
    return game;
  };

  it("ST21-015#1: another [Roronoa Zoro] in hand is not a legal play", () => {
    // OP01-025 is a red 5000 [Roronoa Zoro]; ST21-003 Sanji a red 3000.
    const game = zoroKnockedOut("faq-st21-015-1", [
      instance("other-zoro", "OP01-025"),
      instance("sanji", "ST21-003"),
    ]);
    untilChoice(game);
    const offered = effectOptions(game, "p1");
    settle(game, "done", "skip");

    expect(offered).toContain("sanji");
    expect(offered).not.toContain("other-zoro");
    expect(boardCard(game, "p1", "other-zoro")).toBeUndefined();
  });

  it("ST21-015#2: Yasopp played on the opponent's turn buffs the Leader only until that turn ends", () => {
    const game = zoroKnockedOut("faq-st21-015-2", [
      instance("yasopp", "OP09-013"),
    ]);
    const base = currentPower(game.state, "p1", "p1-leader", false);
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "yasopp" });
    settle(game, "p1-leader");
    expect(boardCard(game, "p1", "yasopp")).toBeDefined();
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(
      base + 1_000,
    );

    game.pass();
    settle(game);
    expect(game.state.turnPlayerId).toBe("p1");
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(base);
  });
});

describe("FAQ ST21-017 Gum-Gum Mole Pistol", () => {
  it("ST21-017#1: the −5000 and the K.O. may land on two different Characters", () => {
    // ST21-014 Monkey.D.Luffy is the 6000 the K.O. half asks for.
    const game = table("faq-st21-017-1")
      .withBoard("p1", [character("luffy", "ST21-014")])
      .withHand("p1", [instance("pistol", "ST21-017")])
      .withBoard("p2", [
        character("big", "ST15-002"),
        character("small", "FIX-001"),
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "ST21-017" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "big" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("small");
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(currentPower(game.state, "p2", "big")).toBe(3_000);
    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
  });
});

// --- ST-22 ---------------------------------------------------------------------

/** p2's OP07-011 Bluejam, given a DON!!, K.O.s a 2000-or-less body as it attacks. */
const bluejamAttack = (seed: string, defender: string, defenderId: string) => {
  const game = table(seed, "p2")
    .withBoard("p1", [character(defenderId, defender)])
    .withHand("p1", [instance("spare", "FIX-001")])
    .withLife("p1", copies(2, "FIX-001", "p1-life"))
    .withDeckTop("p1", copies(3, "FIX-002", "p1-deck"))
    .withBoard("p2", [character("bluejam", "OP07-011")])
    .withGivenDon("p2", "bluejam", 1)
    .withDon("p1", { rested: 10 })
    .build();
  attack(game, "bluejam", "p1-leader");
  return game;
};

/**
 * Plays the battle's opening prompts: Bluejam's K.O. lands on `victim` (or on
 * nothing), and any prompt `watched` raises is recorded and declined.
 */
function openingPrompts(game: Game, victim: string | null, watched: string) {
  const seen: string[][] = [];
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 20) throw new Error("pending effect never settled");
    const options = effectOptions(game);
    if (game.state.pendingEffect.sourceCardNumber === watched) {
      seen.push(options);
      const decline = ["skip", "done"].find((id) => options.includes(id));
      game.play(
        decline
          ? { type: "resolve-effect", optionId: decline }
          : { type: "resolve-effect" },
      );
      continue;
    }
    if (victim && options.includes(victim)) {
      game.play({ type: "resolve-effect", optionId: victim });
      continue;
    }
    const pick = ["apply", "done", "skip"].find((id) => options.includes(id));
    game.play(
      pick
        ? { type: "resolve-effect", optionId: pick }
        : { type: "resolve-effect" },
    );
  }
  return seen;
}

describe("FAQ ST22-002 Izo", () => {
  it("ST22-002#1: K.O.'d by the attacker's [When Attacking], it has no [On Your Opponent's Attack] to use", () => {
    const game = bluejamAttack("faq-st22-002-1", "ST22-002", "izo");
    const seen = openingPrompts(game, "izo", "ST22-002");

    expect(ids(game.state.players.p1.trash)).toContain("izo");
    expect(seen).toHaveLength(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["spare"]);
  });

  it("ST22-002#1 (control): left on the field, it is offered", () => {
    const game = bluejamAttack("faq-st22-002-1-control", "ST22-002", "izo");
    const seen = openingPrompts(game, null, "ST22-002");

    expect(boardCard(game, "p1", "izo")).toBeDefined();
    expect(seen.length).toBeGreaterThan(0);
  });
});

/** ST22-008 Decalvan Brothers' type includes "Whitebeard Pirates". */
const WHITEBEARD_CARD = "ST22-008";

const revealDeck = (hit: boolean) => [
  instance("revealed", hit ? WHITEBEARD_CARD : "FIX-001"),
  instance("second", "FIX-002"),
  instance("third", "FIX-001"),
];

describe("FAQ ST22-003 Edward.Newgate", () => {
  const newgate = (seed: string, hit: boolean) => {
    const game = table(seed)
      .withHand("p1", [instance("newgate", "ST22-003")])
      .withDeckTop("p1", revealDeck(hit))
      .build();
    game.play({ type: "play-card", cardNumber: "ST22-003" });
    settle(game);
    return game;
  };

  it("ST22-003#1: on a hit the revealed card is one of the two drawn", () => {
    const game = newgate("faq-st22-003-1", true);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "revealed",
      "second",
    ]);
    expect(ids(game.state.players.p1.deck)).toEqual(["third"]);
  });

  it("ST22-003#2: on a miss the revealed card goes back on top, face-down", () => {
    const game = newgate("faq-st22-003-2", false);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toEqual([
      "revealed",
      "second",
      "third",
    ]);
    expect(game.state.players.p1.deck[0]?.faceUp ?? false).toBe(false);
  });
});

describe("FAQ ST22-005 Kouzuki Oden", () => {
  /**
   * p2 shrinks Oden with ST21-017 Gum-Gum Mole Pistol, then K.O.s it with
   * ST15-002 Edward.Newgate's activation: an opposing effect removing it.
   */
  const odenRemoved = (seed: string, hand: number) => {
    const game = table(seed, "p2")
      .withBoard("p1", [character("oden", "ST22-005")])
      .withHand("p1", copies(hand, "FIX-001", "p1-hand"))
      .withBoard("p2", [character("newgate", "ST15-002")])
      .withHand("p2", [instance("pistol", "ST21-017")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "ST21-017" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "oden" });
    settle(game, "done", "skip");
    expect(currentPower(game.state, "p1", "oden", false)).toBe(3_000);
    game.play({ type: "activate-main", sourceInstanceId: "newgate" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "oden" });
    return game;
  };

  it("ST22-005#1: with one card in hand it cannot pay two, so it leaves the field", () => {
    const game = odenRemoved("faq-st22-005-1", 1);
    const offered = game.state.pendingEffect ? replacements(game) : [];
    settle(game);

    expect(offered).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toContain("oden");
    expect(ids(game.state.players.p1.hand)).toEqual(["p1-hand-1"]);
  });

  it("ST22-005#1 (control): with two cards in hand the replacement is offered", () => {
    const game = odenRemoved("faq-st22-005-1-control", 2);
    expect(game.player).toBe("p1");
    expect(replacements(game)).toHaveLength(1);
  });
});

describe("FAQ ST22-006 Jozu", () => {
  const jozu = (seed: string, hit: boolean) =>
    table(seed)
      .withHand("p1", [instance("jozu", "ST22-006")])
      .withDeckTop("p1", revealDeck(hit))
      .build();

  it("ST22-006#1: on a hit the revealed card is one of the two drawn, then one card is trashed", () => {
    const game = jozu("faq-st22-006-1", true);
    game.play({ type: "play-card", cardNumber: "ST22-006" });
    untilChoice(game);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "revealed",
      "second",
    ]);
    game.play({ type: "resolve-effect", optionId: "second" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["revealed"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["second"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["third"]);
  });

  it("ST22-006#2: on a miss the revealed card goes back on top, face-down", () => {
    const game = jozu("faq-st22-006-2", false);
    game.play({ type: "play-card", cardNumber: "ST22-006" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toEqual([
      "revealed",
      "second",
      "third",
    ]);
    expect(game.state.players.p1.deck[0]?.faceUp ?? false).toBe(false);
  });
});

describe("FAQ ST22-007 Squard", () => {
  it("ST22-007#1: the revealed card goes back on top, face-down", () => {
    const game = table("faq-st22-007-1")
      .withBoard("p1", [character("squard", "ST22-007")])
      .withDon("p1", { rested: 1 })
      .withDeckTop("p1", revealDeck(true))
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "squard" });
    settle(game, "apply", "p1-leader");

    expect(givenDon(game, "p1")).toBe(1);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toEqual([
      "revealed",
      "second",
      "third",
    ]);
    expect(game.state.players.p1.deck[0]?.faceUp ?? false).toBe(false);
  });
});

describe("FAQ ST22-012 Marco", () => {
  it("ST22-012#1: the revealed card goes back on top, face-down", () => {
    const game = table("faq-st22-012-1")
      .withBoard("p1", [character("marco", "ST22-012")])
      .withDeckTop("p1", revealDeck(true))
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    attack(game, "marco", "p2-leader");
    settle(game, "apply");

    expect(currentPower(game.state, "p1", "marco")).toBe(6_000);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toEqual([
      "revealed",
      "second",
      "third",
    ]);
    expect(game.state.players.p1.deck[0]?.faceUp ?? false).toBe(false);
  });
});

describe("FAQ ST22-016 Take That Back!! Take Back What You Said!!", () => {
  it("ST22-016#1: the revealed card goes back on top, face-down", () => {
    const game = table("faq-st22-016-1", "p2")
      .withHand("p1", [instance("takeback", "ST22-016")])
      .withDeckTop("p1", revealDeck(true))
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("attacker", "OP16-032")])
      .build();
    attack(game, "attacker", "p1-leader");
    while (game.state.phase === "block" && game.state.pendingEffect === null) {
      game.pass();
    }
    expect(game.state.phase).toBe("counter");
    game.play({ type: "activate-counter-event", cardNumber: "ST22-016" });
    settle(game, "p1-leader");

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toEqual([
      "revealed",
      "second",
      "third",
    ]);
    expect(game.state.players.p1.deck[0]?.faceUp ?? false).toBe(false);
  });
});

// --- ST-23 ---------------------------------------------------------------------

/**
 * p2 attacks p1's Leader and the top Life card is OP06-057, whose [Trigger]
 * plays a Character with a cost of exactly 2 from hand -- the pool's stand-in
 * for the OP01-047 Trafalgar Law these rulings name.
 */
const costTwoTrigger = (
  seed: string,
  board: ReturnType<typeof character>[],
  inHand: ReturnType<typeof instance>,
) => {
  const game = table(seed, "p2")
    .withBoard("p1", board)
    .withHand("p1", [inHand])
    .withLife("p1", [
      instance("tears", "OP06-057"),
      instance("under", "FIX-001"),
    ])
    .withBoard("p2", [character("attacker", "OP16-032")])
    .build();
  attack(game, "attacker", "p1-leader");
  declineDefence(game);
  game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
  const offered = game.state.pendingEffect ? effectOptions(game, "p1") : [];
  settle(game, inHand.instanceId);
  return { game, offered };
};

describe("FAQ ST23-001 Uta", () => {
  const utaPrice = (seed: string, given: number) => {
    // ST21-014 Monkey.D.Luffy is printed at 6000.
    const game = table(seed)
      .withBoard("p1", [character("luffy", "ST21-014")])
      .withGivenDon("p1", "luffy", given)
      .withHand("p1", [instance("uta", "ST23-001")])
      .build();
    return {
      power: currentPower(game.state, "p1", "luffy"),
      price: playCostFromHand(game.state, "p1", "ST23-001", 6),
    };
  };

  it("ST23-001#1: a Character raised to 10000 by DON!! turns the −4 on", () => {
    const { power, price } = utaPrice("faq-st23-001-1", 4);
    expect(power).toBe(10_000);
    expect(price).toBe(2);
  });

  it("ST23-001#1 (control): at 9000 it stays off", () => {
    const { power, price } = utaPrice("faq-st23-001-1-control", 3);
    expect(power).toBe(9_000);
    expect(price).toBe(6);
  });

  // ST22-003 Edward.Newgate is printed at 10000, so it counts on either turn.
  it("ST23-001#2: with a 10000 Character out, Uta counts as cost 2 for a cost-2 play effect", () => {
    const { game, offered } = costTwoTrigger(
      "faq-st23-001-2",
      [character("newgate", "ST22-003")],
      instance("uta", "ST23-001"),
    );
    expect(offered).toContain("uta");
    expect(boardCard(game, "p1", "uta")).toBeDefined();
  });

  it("ST23-001#2 (control): without one, Uta is a 6 and is not offered", () => {
    const { offered } = costTwoTrigger(
      "faq-st23-001-2-control",
      [character("small", "FIX-001")],
      instance("uta", "ST23-001"),
    );
    expect(offered).not.toContain("uta");
  });
});

describe("FAQ ST23-002 Shanks", () => {
  /**
   * OP17-005 Edward.Newgate makes p1's monocolored Leader's base power 8000;
   * p2's OP06-009 Shuraiya (printed 4000) then blocks and copies that base
   * power until p2's next turn. OP04-069, the card the ruling names, is not in
   * the pool; this is the same "an effect raised its base power to 8000" on a
   * card that is.
   */
  it("ST23-002#1: an opposing Character whose base power an effect raised to 8000 turns the −3 on", () => {
    const game = table("faq-st23-002-1")
      .withHand("p1", [
        instance("newgate", "OP17-005"),
        instance("shanks", "ST23-002"),
      ])
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withBoard("p2", [character("shuraiya", "OP06-009")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    expect(playCostFromHand(game.state, "p1", "ST23-002", 9)).toBe(9);
    game.play({ type: "play-card", cardNumber: "OP17-005" });
    settle(game);
    attack(game, "attacker", "p2-leader");
    game.play({ type: "block", blockerInstanceId: "shuraiya" });
    settle(game);
    declineDefence(game);
    settle(game);
    expect(game.player).toBe("p1");
    expect(currentPower(game.state, "p2", "shuraiya", false)).toBe(8_000);

    expect(playCostFromHand(game.state, "p1", "ST23-002", 9)).toBe(6);
  });

  it("ST23-002#1 (control): a Character printed at 8000 turns it on", () => {
    // ST15-002 Edward.Newgate is printed at 8000.
    const game = table("faq-st23-002-1-control")
      .withHand("p1", [instance("shanks", "ST23-002")])
      .withBoard("p2", [character("newgate", "ST15-002")])
      .build();
    expect(playCostFromHand(game.state, "p1", "ST23-002", 9)).toBe(6);
  });
});

// --- ST-24 ---------------------------------------------------------------------

describe("FAQ ST24-002 Kid & Killer", () => {
  it("ST24-002#1: the DON!! it sets active can pay for the Bonney Leader's ➀ in the same attack", () => {
    // OP07-019 Jewelry Bonney is p1's Leader; every p1 DON!! is rested.
    const game = table("faq-st24-002-1", "p2")
      .withLeader("p1", "OP07-019")
      .withBoard("p1", [character("kk", "ST24-002")])
      .withDon("p1", { rested: 10 })
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [
        character("attacker", "FIX-002"),
        character("other", "FIX-001"),
      ])
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(0);
    attack(game, "attacker", "p1-leader");
    const sources: string[] = [];
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 20) throw new Error("pending effect never settled");
      sources.push(game.state.pendingEffect.sourceCardNumber);
      const options = effectOptions(game);
      const pick = ["apply", "other"].find((id) => options.includes(id));
      game.play(
        pick
          ? { type: "resolve-effect", optionId: pick }
          : { type: "resolve-effect" },
      );
    }

    expect(ids(game.state.players.p1.trash)).toContain("kk");
    expect(sources).toContain("OP07-019");
    expect(boardCard(game, "p2", "other")?.rested).toBe(true);
    expect(game.state.players.p1.activeDon).toHaveLength(0);
  });

  it("ST24-002#1 (control): with an active DON!! the Bonney Leader's ➀ is offered", () => {
    const game = table("faq-st24-002-1-control", "p2")
      .withLeader("p1", "OP07-019")
      .withDon("p1", { rested: 9 })
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [
        character("attacker", "FIX-002"),
        character("other", "FIX-001"),
      ])
      .build();
    attack(game, "attacker", "p1-leader");
    settle(game, "apply", "other");

    expect(boardCard(game, "p2", "other")?.rested).toBe(true);
  });

  it("ST24-002#2: K.O.'d by the attacker's [When Attacking], it has no [On Your Opponent's Attack] to use", () => {
    const game = bluejamAttack("faq-st24-002-2", "ST24-002", "kk");
    const seen = openingPrompts(game, "kk", "ST24-002");

    expect(ids(game.state.players.p1.trash)).toContain("kk");
    expect(seen).toHaveLength(0);
    expect(game.state.players.p1.activeDon).toHaveLength(0);
  });

  it("ST24-002#2 (control): left on the field, it is offered", () => {
    const game = bluejamAttack("faq-st24-002-2-control", "ST24-002", "kk");
    const seen = openingPrompts(game, null, "ST24-002");

    expect(boardCard(game, "p1", "kk")).toBeDefined();
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe("FAQ ST24-004 Law & Bepo", () => {
  it("ST24-004#1: against two rested Characters the Leader gains +2000 and one of them stays rested through the Refresh", () => {
    const game = table("faq-st24-004-1")
      .withHand("p1", [instance("lawbepo", "ST24-004")])
      .withBoard("p2", [
        character("a", "FIX-001", { rested: true }),
        character("b", "FIX-002", { rested: true }),
      ])
      .withDeckTop("p2", copies(3, "FIX-001", "p2-deck"))
      .build();
    const base = currentPower(game.state, "p1", "p1-leader", false);
    game.play({ type: "play-card", cardNumber: "ST24-004" });
    settle(game, "a", "p1-leader");
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(
      base + 2_000,
    );

    game.pass();
    settle(game);
    expect(game.state.turnPlayerId).toBe("p2");
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(
      base + 2_000,
    );
    const stillRested = game.state.players.p2.board.filter(
      (card) => card.rested,
    );
    expect(stillRested).toHaveLength(1);
  });
});

describe("FAQ ST24-005 X.Drake", () => {
  /**
   * p1 plays Drake with its last active DON!! (or all but `spareDon` of them)
   * beside a rested EB03-018 Tashigi, whose [End of Your Turn] needs an
   * active DON!! to rest.
   */
  const drakeTurnEnd = (seed: string, spareDon: number) => {
    const game = table(seed)
      .withBoard("p1", [character("tashigi", "EB03-018", { rested: true })])
      .withHand("p1", [
        instance("drake", "ST24-005"),
        instance("spare", "FIX-001"),
      ])
      .withDon("p1", { rested: 5 - spareDon })
      .withDeckTop("p2", copies(3, "FIX-001", "p2-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST24-005" });
    settle(game, "done", "skip");
    expect(game.state.players.p1.activeDon).toHaveLength(spareDon);
    game.pass();
    const tashigiOffered =
      game.state.pendingEffect?.sourceCardNumber === "EB03-018";
    settle(game, "skip");
    return { game, tashigiOffered };
  };

  it("ST24-005#1: the DON!! comes back active only after the [End of Your Turn] effects resolve", () => {
    const { game, tashigiOffered } = drakeTurnEnd("faq-st24-005-1", 0);
    expect(tashigiOffered).toBe(false);
    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.state.players.p1.activeDon).toHaveLength(1);
  });

  it("ST24-005#1 (control): an active DON!! at the end of the turn does offer Tashigi", () => {
    const { tashigiOffered } = drakeTurnEnd("faq-st24-005-1-control", 1);
    expect(tashigiOffered).toBe(true);
  });

  it("ST24-005#2: after OP10-030 Smoker's activation, it sets no DON!! active", () => {
    const game = table("faq-st24-005-2")
      .withBoard("p1", [character("smoker", "OP10-030")])
      .withHand("p1", [instance("drake", "ST24-005")])
      .withDon("p1", { rested: 5 })
      .withDeckTop("p2", copies(3, "FIX-001", "p2-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "ST24-005" });
    settle(game, "done", "skip");
    expect(game.state.players.p1.activeDon).toHaveLength(0);
    game.play({ type: "activate-main", sourceInstanceId: "smoker" });
    settle(game, "apply");
    expect(game.state.players.p1.activeDon).toHaveLength(1);

    game.pass();
    settle(game);
    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.state.players.p1.activeDon).toHaveLength(1);
  });
});

// --- ST-25 ---------------------------------------------------------------------

describe("FAQ ST25-003 Crocodile & Mihawk", () => {
  it("ST25-003#1: one card trashed saves it and another {Cross Guild} Character K.O.'d at the same time", () => {
    // p2's ST21-017 Gum-Gum Mole Pistol takes it to 2000; OP05-007 Sabo then
    // K.O.s it and OP09-056 Mr.3(Galdino) (2000) together.
    const game = table("faq-st25-003-1", "p2")
      .withBoard("p1", [
        character("cm", "ST25-003"),
        character("mr3", "OP09-056"),
      ])
      .withHand("p1", [instance("fuel", "FIX-001")])
      .withHand("p2", [
        instance("pistol", "ST21-017"),
        instance("sabo", "OP05-007"),
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "ST21-017" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "cm" });
    settle(game, "done", "skip");
    expect(currentPower(game.state, "p1", "cm", false)).toBe(2_000);

    game.play({ type: "play-card", cardNumber: "OP05-007" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "cm" });
    game.play({ type: "resolve-effect", optionId: "mr3" });
    if (game.state.pendingEffect && game.player === "p2") {
      settle(game, "done");
    }
    expect(game.player).toBe("p1");
    const offered = replacements(game);
    expect(offered).toHaveLength(1);
    game.play({ type: "resolve-effect", optionId: offered[0]! });
    settle(game, "fuel");

    expect(boardCard(game, "p1", "cm")).toBeDefined();
    expect(boardCard(game, "p1", "mr3")).toBeDefined();
    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
  });
});

// --- ST-26 ---------------------------------------------------------------------

describe("FAQ ST26-001 Soba Mask", () => {
  const sobaPrice = (seed: string, board: ReturnType<typeof character>[]) => {
    const game = table(seed)
      .withBoard("p1", board)
      .withHand("p1", [instance("soba", "ST26-001")])
      .build();
    return playCostFromHand(game.state, "p1", "ST26-001", 7);
  };

  it("ST26-001#1: a [Sanji] with 6000 base power does not discount it", () => {
    // OP07-064 Sanji is printed at 6000.
    expect(sobaPrice("faq-st26-001-1", [character("sanji", "OP07-064")])).toBe(
      7,
    );
  });

  it("ST26-001#1 (control): a [Sanji] with 7000 base power does", () => {
    // OP09-065 Sanji is printed at 7000.
    expect(
      sobaPrice("faq-st26-001-1-control", [character("sanji", "OP09-065")]),
    ).toBe(2);
  });

  it("ST26-001#2: a big [San-Gorou] and a big [Sanji] together still give only −5", () => {
    // OP05-065 San-Gorou is printed at 8000.
    expect(
      sobaPrice("faq-st26-001-2", [
        character("sangorou", "OP05-065"),
        character("sanji", "OP09-065"),
      ]),
    ).toBe(2);
  });

  it("ST26-001#3: with a big [San-Gorou] out, Soba Mask counts as cost 2 for a cost-2 play effect", () => {
    const { game, offered } = costTwoTrigger(
      "faq-st26-001-3",
      [character("sangorou", "OP05-065")],
      instance("soba", "ST26-001"),
    );
    expect(offered).toContain("soba");
    expect(boardCard(game, "p1", "soba")).toBeDefined();
  });

  it("ST26-001#3 (control): without one, Soba Mask is a 7 and is not offered", () => {
    const { offered } = costTwoTrigger(
      "faq-st26-001-3-control",
      [character("small", "FIX-001")],
      instance("soba", "ST26-001"),
    );
    expect(offered).not.toContain("soba");
  });
});

describe("FAQ ST26-005 Monkey.D.Luffy", () => {
  it("ST26-005#1: resolved twice in a turn, the Leader's base power is 7000", () => {
    // OP08-001 Tony Tony.Chopper is a multicolored {Straw Hat Crew} Leader.
    const game = table("faq-st26-005-1")
      .withLeader("p1", "OP08-001")
      .withBoard("p1", [character("swinger", "ST26-005")])
      .withHand("p1", [instance("arrival", "ST26-005")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(5_000);
    game.play({ type: "play-card", cardNumber: "ST26-005" });
    settle(game, "apply", "return-don:active");
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(7_000);

    attack(game, "swinger", "p2-leader");
    settle(game, "apply", "return-don:active");
    declineDefence(game);
    settle(game);

    // 6 to play it, and two DON!! −2 paid.
    const seat = game.state.players.p1;
    expect(seat.activeDon.length + seat.restedDon.length).toBe(6);
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(7_000);
  });
});

// --- ST-27 ---------------------------------------------------------------------

describe("FAQ ST27-002 Catarina Devon", () => {
  it("ST27-002#1: trashing itself is not a K.O., so its [On K.O.] does not draw", () => {
    // OP09-081 Marshall.D.Teach is a {Blackbeard Pirates} Leader. That the
    // same [On K.O.] does draw on a real K.O. is ST19-003#1's control.
    const game = table("faq-st27-002-1")
      .withLeader("p1", "OP09-081")
      .withBoard("p1", [character("devon", "ST27-002")])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withBoard("p2", [character("target", "FIX-002")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "devon" });
    settle(game, "apply", "target");

    expect(ids(game.state.players.p1.trash)).toEqual(["devon"]);
    expect(costOnBoard(game, "p2", "target")).toBe(1);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("FAQ ST27-004 Sanjuan.Wolf", () => {
  it("ST27-004#1: 28 cards in the trash take it to 11 cost", () => {
    const game = table("faq-st27-004-1")
      .withLeader("p1", "OP09-081")
      .withBoard("p1", [character("wolf", "ST27-004")])
      .withTrash("p1", copies(28, "FIX-001", "p1-trash"))
      .build();
    expect(costOnBoard(game, "p1", "wolf")).toBe(11);
  });
});

describe("FAQ ST27-005 Marshall.D.Teach", () => {
  it("ST27-005#1: its [On K.O.] may return Teach itself from the trash", () => {
    const game = table("faq-st27-005-1", "p2")
      .withBoard("p1", [character("teach", "ST27-005", { rested: true })])
      .withTrash("p1", [instance("other", "FIX-001")])
      .withBoard("p2", [character("hancock", "OP16-032")])
      .build();
    attack(game, "hancock", "teach");
    declineDefence(game);
    untilChoice(game);
    expect(effectOptions(game, "p1")).toContain("teach");
    game.play({ type: "resolve-effect", optionId: "teach" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["teach"]);
  });

  it("ST27-005#2: the activation may K.O. one of its controller's own Characters", () => {
    const game = table("faq-st27-005-2")
      .withBoard("p1", [
        character("teach", "ST27-005"),
        character("ally", "FIX-001"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "teach" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("ally");
    game.play({ type: "resolve-effect", optionId: "ally" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["ally"]);
  });
});

// --- ST-28 ---------------------------------------------------------------------

describe("FAQ ST28-004 Kouzuki Momonosuke", () => {
  it("ST28-004#1: the two DON!! may be one from a Character and one from the Leader", () => {
    // The Character holds two, so taking one from each is a choice, not the
    // only way to pay.
    const game = table("faq-st28-004-1")
      .withBoard("p1", [
        character("momo", "ST28-004"),
        character("ally", "FIX-002"),
      ])
      .withGivenDon("p1", "ally", 2)
      .withGivenDon("p1", "p1-leader", 1)
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "momo" });
    // One pick per DON!!: the Character first, then the Leader.
    expect(effectOptions(game)).toEqual(["p1-leader", "ally"]);
    game.play({ type: "resolve-effect", optionId: "ally" });
    expect(effectOptions(game)).toEqual(["p1-leader", "ally"]);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    expect(game.state.pendingEffect).toBeNull();

    expect(currentPower(game.state, "p1", "momo")).toBe(8_000);
    expect(boardCard(game, "p1", "ally")?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
  });

  it("ST28-004#1 (two Characters): one DON!! from each of two Characters pays it", () => {
    const game = table("faq-st28-004-1-two")
      .withBoard("p1", [
        character("momo", "ST28-004"),
        character("ally-a", "FIX-001"),
        character("ally-b", "FIX-002"),
      ])
      .withGivenDon("p1", "ally-a", 1)
      .withGivenDon("p1", "ally-b", 1)
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "momo" });
    settle(game, "apply", "ally-a", "ally-b");

    expect(currentPower(game.state, "p1", "momo")).toBe(8_000);
    expect(givenDon(game, "p1")).toBe(0);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });
});
