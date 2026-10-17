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
 * Bandai's official Q&A for OP-14 "Extreme Battle!!" and the EB-04 extra
 * booster, one case per ruling, named by the Q&A id (`<card>#<n>`, in the order
 * the PDF prints the card's rulings).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. A ruling the engine disagrees with is an `it.fails`
 * that says what the engine does instead: it turns green -- and so red under
 * `it.fails` -- the day the engine is fixed, which is the prompt to promote it.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op14_eb04.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {
  "EB04-038#1":
    "The PDF prints the EB04-038 Rosinante & Law heading with no question or " +
    "answer under it (the text extraction goes straight on to EB04-040), so " +
    "there is no ruling to assert.",
};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 to act on turn 11 with all ten DON!! active and an empty table. */
const table = (seed: string) =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

type Builder = ReturnType<typeof table>;

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function attackers(game: Game): string[] {
  return game
    .legalActions()
    .flatMap((action) =>
      action.type === "attack" ? [action.attackerInstanceId] : [],
    );
}

function attackTargets(game: Game, attackerInstanceId: string): string[] {
  return game
    .legalActions()
    .flatMap((action) =>
      action.type === "attack" &&
      action.attackerInstanceId === attackerInstanceId
        ? [action.targetInstanceId]
        : [],
    );
}

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

/** Declines the Block and Counter steps so the battle resolves. */
function declineDefence(game: Game): void {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const board = (game: Game, player: "p1" | "p2") =>
  ids(game.state.players[player].board);
const hand = (game: Game, player: "p1" | "p2") =>
  ids(game.state.players[player].hand);
const trash = (game: Game, player: "p1" | "p2") =>
  ids(game.state.players[player].trash);

/** p1 ends turn 11; p2 draws from the deck it is given and is to act. */
function toP2(game: Game): void {
  game.pass();
  expect(game.player).toBe("p2");
}

const attack = (game: Game, attackerInstanceId: string, target: string) =>
  game.play({ type: "attack", attackerInstanceId, targetInstanceId: target });

describe("FAQ OP-14 Red", () => {
  it("OP14-001#1: the Leader swap selects only its own controller's Characters", () => {
    const game = table("faq-op14-001-1")
      .withLeader("p1", "OP14-001")
      .withBoard("p1", [
        character("urouge", "OP14-002"),
        character("luffy", "OP14-013"),
      ])
      .withBoard("p2", [
        character("bege", "OP14-003"),
        character("their-urouge", "OP14-002"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    const options = effectOptions(game);
    expect(options).toEqual(expect.arrayContaining(["urouge", "luffy"]));
    expect(options).not.toContain("bege");
    expect(options).not.toContain("their-urouge");
  });

  it("OP14-001#2: a swapped Character keeps its swapped power after its partner leaves", () => {
    const game = table("faq-op14-001-2")
      .withLeader("p1", "OP14-001")
      .withBoard("p1", [
        character("urouge", "OP14-002"),
        character("law", "OP14-009"),
      ])
      // OP14-049 Jinbe's [On Play] returns a Character of either side.
      .withHand("p1", [instance("jinbe", "OP14-049")])
      .withDeckTop("p1", copies(2, "ST31-003", "p1-deck"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "urouge" });
    game.play({ type: "resolve-effect", optionId: "law" });
    expect(currentPower(game.state, "p1", "law")).toBe(2000);

    game.play({ type: "play-card", cardNumber: "OP14-049" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "own" });
    game.play({ type: "resolve-effect", optionId: "urouge" });
    settle(game);

    expect(hand(game, "p1")).toContain("urouge");
    expect(currentPower(game.state, "p1", "law")).toBe(2000);
  });

  it("OP14-001#3: PRB02-002 Law at −2000 swapped with a 0-power Luffy sits at −2000", () => {
    const game = table("faq-op14-001-3")
      .withLeader("p1", "OP14-001")
      .withBoard("p1", [
        character("law", "PRB02-002"),
        character("luffy", "OP14-013"),
      ])
      // OP05-096's [Trigger] K.O.s a cost-6 Character: PRB02-002 Law answers
      // it with its own −2000.
      .withLife("p2", [
        instance("bid", "OP05-096"),
        instance("p2-life", "ST32-005"),
      ])
      .build();

    attack(game, "p1-leader", "p2-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.player === "p2" && game.state.pendingEffect) {
      const law = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-effect" &&
            (action.optionId === "law" || /K\.O\./.test(action.summary)),
        );
      game.submit(law ?? game.action({ type: "resolve-effect" }));
    }
    game.play({ type: "resolve-effect", summary: "instead" });
    settle(game);
    expect(board(game, "p1")).toContain("law");
    expect(currentPower(game.state, "p1", "law")).toBe(5000);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "law" });
    game.play({ type: "resolve-effect", optionId: "luffy" });

    expect(currentPower(game.state, "p1", "luffy")).toBe(7000);
    expect(currentPower(game.state, "p1", "law")).toBe(-2000);
  });

  it("OP14-002#1: Urouge under 5000 power neither draws nor K.O.s", () => {
    const game = table("faq-op14-002-1")
      .withBoard("p1", [character("urouge", "OP14-002")])
      .withBoard("p2", [character("small", "ST32-005", { rested: true })])
      .withDeckTop("p1", [instance("p1-top", "ST31-003")])
      .build();

    attack(game, "urouge", "p2-leader");

    expect(game.state.pendingEffect).toBeNull();
    expect(hand(game, "p1")).toEqual([]);
    expect(board(game, "p2")).toEqual(["small"]);
  });

  it("OP14-003#1: Bege can be K.O.'d by OP13-091 Marcus Mars whose base power OP13-084 raised to 7000", () => {
    const game = table("faq-op14-003-1")
      .withBoard("p1", [character("ju-peter", "OP13-084")])
      .withTrash("p1", copies(10, "ST31-003", "p1-trash"))
      .withHand("p1", [
        instance("mars", "OP13-091"),
        instance("fodder", "ST31-003"),
      ])
      .withBoard("p2", [character("bege", "OP14-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-091" });
    expect(currentPower(game.state, "p1", "mars")).toBe(7000);
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "bege" });
    settle(game);

    expect(board(game, "p2")).toEqual([]);
    expect(trash(game, "p2")).toContain("bege");
  });

  it("OP14-009#1: Law's defensive swap cannot pair the Leader with an opponent's Character", () => {
    const game = table("faq-op14-009-1")
      .withBoard("p1", [character("law", "OP14-009")])
      .withHand("p1", copies(2, "ST31-003", "p1-hand"))
      .withBoard("p2", [
        character("attacker", "ST32-002"),
        character("bystander", "ST32-005"),
      ])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    attack(game, "attacker", "p1-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "p1-hand-1" });
    game.play({ type: "resolve-effect", optionId: "p1-hand-2" });

    const options = effectOptions(game);
    expect(options).toContain("law");
    expect(options).not.toContain("attacker");
    expect(options).not.toContain("bystander");
  });

  it("OP14-017#1: a Character Chambres swapped keeps its swapped power after its partner is K.O.'d", () => {
    const game = table("faq-op14-017-1")
      .withHand("p1", [instance("chambres", "OP14-017")])
      .withBoard("p2", [
        character("big", "OP14-015", { rested: true }),
        character("small", "ST32-005"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP14-017" });
    game.play({ type: "resolve-effect", optionId: "big" });
    game.play({ type: "resolve-effect", optionId: "small" });
    expect(currentPower(game.state, "p2", "big")).toBe(2000);
    expect(currentPower(game.state, "p2", "small")).toBe(8000);

    attack(game, "p1-leader", "big");
    declineDefence(game);

    expect(board(game, "p2")).toEqual(["small"]);
    expect(currentPower(game.state, "p2", "small")).toBe(8000);
  });
});

describe("FAQ OP-14 Green", () => {
  it("OP14-020#1: after the Leader sets DON!! active, an effect cannot play a Character either", () => {
    const game = table("faq-op14-020-1")
      .withLeader("p1", "OP14-020")
      .withDon("p1", { rested: 3 })
      .withBoard("p1", [
        character("issho", "OP14-021"),
        // OP05-033 Baby 5 plays a Donquixote Pirates Character from hand.
        character("baby5", "OP05-033"),
      ])
      .withHand("p1", [instance("buffalo", "OP14-070")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "issho" });
    settle(game);
    expect(game.state.players.p1.restedDon).toHaveLength(0);

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "play-card" && action.cardInstanceId === "buffalo",
        ),
    ).toBe(false);
    const baby5 = game
      .legalActions()
      .find(
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "baby5",
      );
    if (baby5) {
      game.submit(baby5);
      settle(game);
    }
    expect(board(game, "p1")).not.toContain("buffalo");
  });

  // "Your cards" includes an active DON!! (`restableCards`), so with the
  // Leader rested and no Character a DON!! pays.
  it("OP14-020#2: the Leader's rest cost can be paid by resting a DON!! card", () => {
    const game = table("faq-op14-020-2")
      .withLeader("p1", "OP14-020")
      .withRestedLeader("p1")
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    settle(game);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("OP14-020#3: with no cost-5 Character the Leader still rests a card, and no lock follows", () => {
    const game = table("faq-op14-020-3")
      .withLeader("p1", "OP14-020")
      .withDon("p1", { rested: 3 })
      .withBoard("p1", [character("small", "ST32-005")])
      .withHand("p1", [instance("kinemon", "ST32-001")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(3);
    game.play({ type: "play-card", cardNumber: "ST32-001" });
    expect(board(game, "p1")).toContain("kinemon");
  });

  /** p1 attacks with `attacker`; p2 holds `targets`. */
  const whenRestedTable = (
    seed: string,
    attacker: string,
    targets: ReturnType<typeof character>[],
  ) =>
    table(seed)
      .withBoard("p1", [character("attacker", attacker)])
      .withBoard("p2", targets)
      .withLife("p1", copies(2, "ST31-003", "p1-life"))
      .withLife("p2", copies(2, "ST32-005", "p2-life"))
      .build();

  it("OP14-021#1: Issho's when-rested clause fires on its attack", () => {
    const game = whenRestedTable("faq-op14-021-1", "OP14-021", [
      character("rested", "ST32-002", { rested: true }),
    ]);
    attack(game, "attacker", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    settle(game);

    expect(hand(game, "p1")).toEqual(["p1-life-1"]);
    expect(
      game.state.players.p2.board[0]?.cannotRefreshUntilTurn,
    ).toBeDefined();
  });

  it("OP14-024#1 (Characters): Kin'emon's [On K.O.] rests an opponent's active card", () => {
    const game = table("faq-op14-024-1")
      .withBoard("p1", [character("ally", "ST31-003")])
      .withBoard("p2", [character("kinemon", "OP14-024", { rested: true })])
      .build();

    attack(game, "p1-leader", "kinemon");
    declineDefence(game);
    expect(game.player).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "ally" });

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
  });

  // "Your opponent's cards" includes their active DON!!: with the Leader
  // rested by its attack, a DON!! is still a target.
  it("OP14-024#1: Kin'emon's [On K.O.] can rest an opponent's active DON!! card", () => {
    const game = table("faq-op14-024-1-don")
      .withBoard("p2", [character("kinemon", "OP14-024", { rested: true })])
      .build();

    attack(game, "p1-leader", "kinemon");
    declineDefence(game);
    expect(game.player).toBe("p2");
    settle(game);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("OP14-027#1: Shanks' when-rested clause fires on its attack", () => {
    const game = whenRestedTable("faq-op14-027-1", "OP14-027", [
      character("target", "ST32-002"),
    ]);
    attack(game, "attacker", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  it("OP14-028#1: Johnny's when-rested clause fires on its attack", () => {
    const game = whenRestedTable("faq-op14-028-1", "OP14-028", [
      character("target", "ST32-005", { rested: true }),
    ]);
    attack(game, "attacker", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(trash(game, "p2")).toContain("target");
  });

  // An active DON!! pays, as for OP14-020#2.
  it("OP14-029#1: Tashigi's rest-2 cost can be paid with DON!! cards", () => {
    const game = table("faq-op14-029-1")
      .withRestedLeader("p1")
      .withBoard("p1", [character("tashigi", "OP14-029")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "tashigi" });
    settle(game);
    expect(currentPower(game.state, "p1", "tashigi")).toBe(8000);
    expect(game.state.players.p1.restedDon.length).toBeGreaterThan(0);
  });

  it("OP14-029#2: Tashigi can rest itself to pay its [Activate: Main]", () => {
    const game = table("faq-op14-029-2")
      .withBoard("p1", [character("tashigi", "OP14-029")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "tashigi" });
    expect(effectOptions(game)).toContain("tashigi");
    game.play({ type: "resolve-effect", optionId: "tashigi" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "tashigi")).toBe(8000);
  });

  it("OP14-029#2 ([Opponent's Turn]): Tashigi can rest itself instead of being removed", () => {
    const game = table("faq-op14-029-2-replace")
      .withBoard("p1", [character("tashigi", "OP14-029")])
      .withHand("p2", [instance("pistol", "EB01-051")])
      .withDeckTop("p2", copies(4, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    game.play({ type: "activate-main", sourceCardNumber: "EB01-051" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "tashigi" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", summary: "instead" });
    expect(effectOptions(game)).toContain("tashigi");
    game.play({ type: "resolve-effect", optionId: "tashigi" });
    settle(game);

    expect(board(game, "p1")).toEqual(["tashigi"]);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
  });

  it("OP14-031#1: Nami's DON!! come back at the end of the turn, up to 5", () => {
    const game = table("faq-op14-031-1")
      .withDon("p1", { rested: 2 })
      .withHand("p1", [instance("nami", "OP14-031")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-031" });
    settle(game);
    // Six rested now: two from before and four paid for Nami.
    expect(game.state.players.p1.restedDon).toHaveLength(6);

    toP2(game);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(9);
  });

  it("OP14-032#1: Humandrill's when-rested clause fires on its attack", () => {
    const game = whenRestedTable("faq-op14-032-1", "OP14-032", [
      character("target", "ST32-005"),
    ]);
    attack(game, "attacker", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  it("OP14-033#1: Perona's [On K.O.] cannot be paid by resting Perona itself", () => {
    const game = table("faq-op14-033-1")
      .withBoard("p1", [
        character("perona", "OP14-033", { rested: true }),
        character("ally", "ST32-005"),
      ])
      .withHand("p1", [instance("green", "ST32-001")])
      .withBoard("p2", [character("attacker", "OP05-044")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    attack(game, "attacker", "perona");
    declineDefence(game);
    expect(trash(game, "p1")).toContain("perona");
    game.play({ type: "resolve-effect", optionId: "apply" });

    const options = effectOptions(game);
    expect(options).toContain("ally");
    expect(options).not.toContain("perona");
  });

  it("OP14-034#1: Luffy's replacement can rest the Character about to be K.O.'d", () => {
    const game = table("faq-op14-034-1")
      .withBoard("p1", [
        character("luffy", "OP14-034"),
        character("zoro", "ST32-005"),
      ])
      .withHand("p2", [instance("pistol", "EB01-051")])
      .withDeckTop("p2", copies(4, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    game.play({ type: "activate-main", sourceCardNumber: "EB01-051" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "zoro" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", summary: "instead" });
    expect(effectOptions(game)).toContain("zoro");
    game.play({ type: "resolve-effect", optionId: "zoro" });
    settle(game);

    expect(board(game, "p1")).toEqual(["luffy", "zoro"]);
    expect(game.state.players.p1.board[1]?.rested).toBe(true);
  });

  it("OP14-035#1: Yosaku's when-rested clause fires on its attack", () => {
    const game = whenRestedTable("faq-op14-035-1", "OP14-035", [
      character("target", "ST32-005", { rested: true }),
    ]);
    attack(game, "attacker", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(
      game.state.players.p2.board[0]?.cannotRefreshUntilTurn,
    ).toBeDefined();
  });

  it("OP14-119#1: Mihawk's when-rested clause fires on its attack", () => {
    const game = whenRestedTable("faq-op14-119-1", "OP14-119", [
      character("target", "ST32-002"),
    ]);
    attack(game, "attacker", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p2.board[0]?.cannotRestUntilTurn).toBeDefined();
  });
});

describe("FAQ OP-14 Blue", () => {
  it("OP14-040#1: the Jinbe Leader activates twice with 4 rested DON!! and 2 cards", () => {
    const game = table("faq-op14-040-1")
      .withLeader("p1", "OP14-040")
      .withDon("p1", { rested: 4 })
      .withHand("p1", copies(2, "ST31-003", "p1-hand"))
      .build();

    for (const card of ["p1-hand-1", "p1-hand-2"]) {
      game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
      game.play({ type: "resolve-effect", optionId: card });
      settle(game);
    }

    expect(hand(game, "p1")).toEqual([]);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(4);
  });

  /** p2 attacks p1's Hancock Leader; p1 holds `hand` and `life`. */
  const hancockDefends = (seed: string, setUp: (b: Builder) => Builder) => {
    const game = setUp(
      table(seed)
        .withLeader("p1", "OP14-041")
        .withBoard("p2", [character("attacker", "OP05-044")])
        .withDeckTop("p2", copies(2, "ST32-005", "p2-deck")),
    ).build();
    toP2(game);
    attack(game, "attacker", "p1-leader");
    return game;
  };

  it("OP14-041#1: the Hancock Leader's draw is not optional", () => {
    const game = hancockDefends("faq-op14-041-1", (b) =>
      b
        .withHand("p1", [
          instance("salamander", "OP14-116"),
          instance("salome", "OP14-106"),
        ])
        .withLife("p1", copies(2, "ST31-003", "p1-life"))
        .withDeckTop("p1", [instance("p1-top", "ST31-003")]),
    );
    game.pass();
    game.play({
      type: "activate-counter-event",
      eventInstanceId: "salamander",
    });
    game.play({ type: "resolve-effect", optionId: "salome" });

    expect(board(game, "p1")).toContain("salome");
    expect(hand(game, "p1")).toContain("p1-top");
  });

  it("OP14-041#2: three Characters played at once by OP16-105 Moria draw three", () => {
    const game = hancockDefends("faq-op14-041-2", (b) =>
      b
        .withLife("p1", [instance("moria", "OP16-105")])
        .withTrash("p1", [
          instance("absalom", "OP14-100"),
          instance("hogback", "OP14-110"),
          instance("perona", "OP14-111"),
        ])
        .withDeckTop("p1", copies(3, "ST31-003", "p1-deck")),
    );
    declineDefence(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    for (const card of ["absalom", "hogback", "perona"]) {
      if (effectOptions(game, "p1").includes(card)) {
        game.play({ type: "resolve-effect", optionId: card });
      }
    }
    while (game.state.pendingEffect && game.player === "p1") {
      game.play({ type: "resolve-effect" });
    }

    expect(board(game, "p1")).toEqual(
      expect.arrayContaining(["absalom", "hogback", "perona"]),
    );
    expect(hand(game, "p1")).toEqual(
      expect.arrayContaining(["p1-deck-1", "p1-deck-2", "p1-deck-3"]),
    );
  });

  it("OP14-044#1: a Whitebeard Pirates reveal draws 2, the revealed card among them", () => {
    const game = table("faq-op14-044-1")
      .withHand("p1", [instance("newgate", "OP14-044")])
      .withDeckTop("p1", [
        instance("vista", "OP14-053"),
        instance("second", "ST31-003"),
        instance("third", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-044" });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "second" });
    }

    expect(hand(game, "p1")).toEqual(["vista"]);
    expect(trash(game, "p1")).toEqual(["second"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["third"]);
  });

  /**
   * p1 swings into p2's OP09-111 Brook Life card behind an Egghead Leader, and
   * Brook's [Trigger] makes p1, holding 7 cards, trash 2 of them.
   */
  const brookTrashes = (seed: string, rusher: string) => {
    const game = table(seed)
      .withHand("p1", [
        instance("rusher", rusher),
        ...copies(7, "ST31-003", "p1-hand"),
      ])
      .withLeader("p2", "FIX-LEADER-VEGAPUNK")
      .withLife("p2", [
        instance("brook", "OP09-111"),
        instance("p2-life", "ST32-005"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: rusher });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "skip" });
    }
    expect(attackers(game)).not.toContain("rusher");
    attack(game, "p1-leader", "p2-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "p1-hand-1" });
    game.play({ type: "resolve-effect", optionId: "p1-hand-2" });
    settle(game);
    expect(trash(game, "p1")).toEqual(["p1-hand-1", "p1-hand-2"]);
    return game;
  };

  it("OP14-045#1: a hand trash by the opponent's OP09-111 Brook [Trigger] gives Kuroobi [Rush]", () => {
    const game = brookTrashes("faq-op14-045-1", "OP14-045");
    expect(attackers(game)).toContain("rusher");
  });

  it("OP14-048#1: Shiryu trashes the whole hand even when it returns nothing", () => {
    const game = table("faq-op14-048-1")
      .withHand("p1", [
        instance("shiryu", "OP14-048"),
        ...copies(2, "ST31-003", "p1-hand"),
      ])
      .withBoard("p2", [character("target", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-048" });
    game.play({ type: "resolve-effect", summary: "no more" });
    settle(game);

    expect(board(game, "p2")).toEqual(["target"]);
    expect(hand(game, "p1")).toEqual([]);
    expect(trash(game, "p1")).toEqual(["p1-hand-1", "p1-hand-2"]);
  });

  it("OP14-048#2: Shiryu played from a one-card hand still returns a Character", () => {
    const game = table("faq-op14-048-2")
      .withHand("p1", [instance("shiryu", "OP14-048")])
      .withBoard("p2", [character("target", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-048" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(board(game, "p2")).toEqual([]);
    expect(hand(game, "p2")).toContain("target");
  });

  it("OP14-049#1: a hand trash by the opponent's OP09-111 Brook [Trigger] gives Jinbe [Rush]", () => {
    const game = brookTrashes("faq-op14-049-1", "OP14-049");
    expect(attackers(game)).toContain("rusher");
  });

  it("OP14-053#1: Vista K.O.'d at its 6000 Leader-copied base power draws off OP13-002 Ace's [DON!! x1]", () => {
    const game = table("faq-op14-053-1")
      .withLeader("p1", "OP13-002")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [character("vista", "OP14-053", { rested: true })])
      .withDeckTop("p1", [instance("p1-top", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP05-044")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    expect(currentPower(game.state, "p1", "vista")).toBe(6000);
    attack(game, "attacker", "vista");
    declineDefence(game);
    settle(game);

    expect(trash(game, "p1")).toContain("vista");
    expect(hand(game, "p1")).toContain("p1-top");
  });

  it("OP14-054#1: Fisher Tiger's end-of-turn trash does nothing at 5 cards", () => {
    const game = table("faq-op14-054-1")
      .withBoard("p1", [character("tiger", "OP14-054")])
      .withHand("p1", copies(5, "ST31-003", "p1-hand"))
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    expect(hand(game, "p1")).toHaveLength(5);
    expect(trash(game, "p1")).toEqual([]);
  });

  it("OP14-056#1: a hand trash negates only Wadatsumi's own text, not power it was given", () => {
    const game = table("faq-op14-056-1")
      .withLeader("p1", "OP14-040")
      .withBoard("p1", [character("wadatsumi", "OP14-056")])
      .withHand("p1", [
        instance("event", "OP14-057"),
        instance("fodder", "ST31-003"),
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP14-057" });
    settle(game);
    expect(currentPower(game.state, "p1", "wadatsumi")).toBe(6000);
    expect(attackers(game)).not.toContain("wadatsumi");

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "p1-leader" });
    }

    expect(attackers(game)).toContain("wadatsumi");
    expect(currentPower(game.state, "p1", "wadatsumi")).toBe(6000);
  });

  it("OP14-057#1: a Fish-Man played after the Event does not gain its +1000", () => {
    const game = table("faq-op14-057-1")
      .withLeader("p1", "OP14-040")
      .withHand("p1", [
        instance("event", "OP14-057"),
        instance("kuroobi", "OP14-045"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP14-057" });
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
    game.play({ type: "play-card", cardNumber: "OP14-045" });
    settle(game);

    expect(currentPower(game.state, "p1", "kuroobi")).toBe(3000);
  });

  it("OP14-059#1: activated from a 3-card hand, the Event sees 2 and draws 2", () => {
    const game = table("faq-op14-059-1")
      .withLeader("p1", "OP14-040")
      .withHand("p1", [
        instance("event", "OP14-059"),
        ...copies(2, "ST31-003", "p1-hand"),
      ])
      .withDeckTop("p1", copies(2, "ST31-003", "p1-deck"))
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP14-059" });
    settle(game);

    expect(hand(game, "p1")).toEqual(
      expect.arrayContaining(["p1-deck-1", "p1-deck-2"]),
    );
    expect(hand(game, "p1")).toHaveLength(4);
  });
});

describe("FAQ OP-14 Purple", () => {
  it("OP14-060#1: the Doflamingo Leader cannot redirect onto an opponent's Character", () => {
    const game = table("faq-op14-060-1")
      .withLeader("p1", "OP14-060")
      .withBoard("p1", [character("buffalo", "OP14-070")])
      .withBoard("p2", [
        character("attacker", "OP05-044"),
        character("bystander", "ST32-005"),
      ])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    attack(game, "attacker", "p1-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    const options = effectOptions(game);
    expect(options).toContain("buffalo");
    expect(options).not.toContain("attacker");
    expect(options).not.toContain("bystander");
  });

  it("OP14-069#1: the lock half works under a non-Donquixote Leader", () => {
    const game = table("faq-op14-069-1")
      .withHand("p1", [instance("doffy", "OP14-069")])
      .withBoard("p2", [character("target", "ST32-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-069" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "lock" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p2.board[0]?.cannotRestUntilTurn).toBeDefined();
  });

  it("OP14-070#1: resting Buffalo for [Blocker] does not trigger its stand-up", () => {
    const game = table("faq-op14-070-1")
      .withBoard("p1", [character("buffalo", "OP14-070")])
      .withBoard("p2", [character("attacker", "OP05-044")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "buffalo" });

    expect(game.state.pendingEffect).toBeNull();
    expect(
      game.legalActions().some((action) => action.summary.includes("DON!!")),
    ).toBe(false);
  });

  it("OP14-078#1: without a Donquixote Pirates Leader, Bullet String adds no power", () => {
    const game = table("faq-op14-078-1")
      .withHand("p1", [instance("bullet", "OP14-078")])
      .withBoard("p2", [character("attacker", "OP05-044")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    attack(game, "attacker", "p1-leader");
    game.pass();
    const counter = game
      .legalActions()
      .find((action) => action.type === "activate-counter-event");
    if (counter) {
      game.submit(counter);
      settle(game);
    }

    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
    expect(game.state.players.p1.leaderPowerModifiers).toEqual([]);
  });
});

describe("FAQ OP-14 Black", () => {
  it("OP14-079#1: under the Crocodile Leader, EB01-051's cost is paid but its K.O. does nothing", () => {
    const game = table("faq-op14-079-1")
      .withLeader("p1", "OP14-079")
      .withHand("p1", [instance("pistol", "EB01-051")])
      .withDeckTop("p1", copies(3, "ST31-003", "p1-deck"))
      .withBoard("p2", [character("target", "ST32-005")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "EB01-051" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    if (effectOptions(game).includes("target")) {
      game.play({ type: "resolve-effect", optionId: "target" });
    }
    settle(game);

    expect(trash(game, "p1")).toEqual(
      expect.arrayContaining(["p1-deck-1", "p1-deck-2"]),
    );
    expect(board(game, "p2")).toEqual(["target"]);
  });

  it("OP14-079#2: the Leader's own effect resolves before the K.O.'d Character's [On K.O.]", () => {
    const game = table("faq-op14-079-2")
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [character("goldenweek", "OP14-085")])
      .withDeckTop("p1", copies(4, "ST31-003", "p1-deck"))
      .withBoard("p2", [character("target", "ST32-005")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "goldenweek" });
    // The −10 cost comes next, before Goldenweek's draw.
    expect(effectOptions(game)).toContain("target");
    expect(hand(game, "p1")).toEqual([]);
    game.play({ type: "resolve-effect", optionId: "target" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    // The Leader's mill took the top two; only then does Goldenweek's
    // [On K.O.] draw, so it draws the next two.
    expect(trash(game, "p1")).toEqual(
      expect.arrayContaining(["goldenweek", "p1-deck-1", "p1-deck-2"]),
    );
    expect(hand(game, "p1")).toEqual(["p1-deck-3", "p1-deck-4"]);
  });

  it("OP14-080#1: the Leader's +1000 lands before the K.O.'d Character's [On K.O.]", () => {
    const game = table("faq-op14-080-1")
      .withLeader("p1", "OP14-080")
      .withBoard("p1", [
        character("absalom", "OP14-100"),
        character("kumacy", "OP14-102"),
      ])
      .withDeckTop("p1", copies(3, "OP14-109", "p1-deck"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "absalom" });

    // Absalom's [On K.O.] search is now open, and the buff is already on.
    expect(game.state.pendingEffect).not.toBeNull();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
    expect(currentPower(game.state, "p1", "kumacy")).toBe(3000);
  });

  it("OP14-080#2: a Character played after the Leader's buff does not gain +1000", () => {
    const game = table("faq-op14-080-2")
      .withLeader("p1", "OP14-080")
      .withBoard("p1", [character("kumacy", "OP14-102")])
      .withHand("p1", [instance("cindry", "OP14-109")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "kumacy" });
    settle(game);
    game.play({ type: "play-card", cardNumber: "OP14-109" });
    settle(game);

    expect(currentPower(game.state, "p1", "cindry")).toBe(1000);
  });

  it("OP14-082#1: a Thriller Bark Character played after Oinkchuck's [On K.O.] does not gain +4 cost", () => {
    const game = table("faq-op14-082-1")
      .withLeader("p1", "OP14-080")
      .withBoard("p1", [
        character("oinkchuck", "OP14-082"),
        character("kumacy", "OP14-102"),
      ])
      .withHand("p1", [instance("cindry", "OP14-109")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "oinkchuck" });
    settle(game);
    const kumacy = game.state.players.p1.board.find(
      (card) => card.instanceId === "kumacy",
    )!;
    expect(effectiveCost(game.state, "p1", kumacy)).toBe(5);

    game.play({ type: "play-card", cardNumber: "OP14-109" });
    settle(game);
    const cindry = game.state.players.p1.board.find(
      (card) => card.instanceId === "cindry",
    )!;
    expect(effectiveCost(game.state, "p1", cindry)).toBe(3);
  });

  it("OP14-096#1: with 9 in the trash, Ground Death itself makes 10 and adds +4000", () => {
    const game = table("faq-op14-096-1")
      .withTrash("p1", copies(9, "ST31-003", "p1-trash"))
      .withHand("p1", [instance("ground", "OP14-096")])
      .withBoard("p2", [character("attacker", "OP05-044")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    attack(game, "attacker", "p1-leader");
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "ground" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("OP14-098#1: a Baroque Works Character played after Crescent Cutlass does not gain +3 cost", () => {
    const game = table("faq-op14-098-1")
      .withBoard("p1", [character("croc", "OP14-120")])
      .withHand("p1", [
        instance("cutlass", "OP14-098"),
        instance("mr4", "OP14-093"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP14-098" });
    settle(game);
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(11);
    game.play({ type: "play-card", cardNumber: "OP14-093" });
    settle(game);

    const mr4 = game.state.players.p1.board.find(
      (card) => card.instanceId === "mr4",
    )!;
    expect(effectiveCost(game.state, "p1", mr4)).toBe(4);
  });

  it("OP14-120#1: an opponent's cost-10 Character alone is enough for the draw", () => {
    const game = table("faq-op14-120-1")
      .withHand("p1", [instance("croc", "OP14-120")])
      .withBoard("p2", [character("doffy", "OP14-069")])
      .withDeckTop("p1", [instance("p1-top", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-120" });
    settle(game);

    expect(hand(game, "p1")).toEqual(["p1-top"]);
  });
});

describe("FAQ OP-14 Thriller Bark [Trigger]: the card is not in the trash while it resolves", () => {
  /** p2 swings into `cardNumber` on top of p1's Life, with `other` in p1's trash. */
  const triggerFrom = (seed: string, cardNumber: string) => {
    const game = table(seed)
      .withLife("p1", [
        instance("trigger", cardNumber),
        instance("p1-life", "ST31-003"),
      ])
      .withTrash("p1", [instance("other", "OP14-102")])
      .withBoard("p2", [character("attacker", "OP05-044")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();
    toP2(game);
    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    return game;
  };

  for (const [id, cardNumber] of [
    ["OP14-082#2", "OP14-082"],
    ["OP14-089#1", "OP14-089"],
    ["OP14-100#1", "OP14-100"],
    ["OP14-102#1", "OP14-102"],
    ["OP14-109#1", "OP14-109"],
    ["OP14-110#1", "OP14-110"],
    ["OP14-111#1", "OP14-111"],
  ] as const) {
    it(`${id}: ${cardNumber}'s [Trigger] cannot play ${cardNumber} itself`, () => {
      const game = triggerFrom(
        `faq-${cardNumber.toLowerCase()}-trigger`,
        cardNumber,
      );
      const options = effectOptions(game, "p1");
      expect(options).toContain("other");
      expect(options).not.toContain("trigger");
    });
  }
});

describe("FAQ OP-14 Yellow", () => {
  it("OP14-112#1: without a Seven Warlords Leader, Hancock takes no Life card", () => {
    const game = table("faq-op14-112-1")
      .withHand("p1", [instance("hancock", "OP14-112")])
      .withDeckTop("p1", [instance("p1-top", "ST31-003")])
      .withLife("p2", copies(3, "ST32-005", "p2-life"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-112" });
    settle(game);

    expect(game.state.players.p2.life).toHaveLength(3);
    expect(hand(game, "p2")).toEqual([]);
    expect(game.state.players.p1.life).toHaveLength(0);
  });

  it("OP14-115#1: Rindo's damage is taken even when no card is added to Life", () => {
    const game = table("faq-op14-115-1")
      .withBoard("p1", [character("rindo", "OP14-115", { rested: true })])
      .withLife("p1", copies(2, "ST31-003", "p1-life"))
      .withDeckTop("p1", [instance("p1-top", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP05-044")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    attack(game, "attacker", "rindo");
    declineDefence(game);
    expect(trash(game, "p1")).toContain("rindo");
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    expect(ids(game.state.players.p1.deck)[0]).toBe("p1-top");
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(hand(game, "p1")).toContain("p1-life-1");
  });

  // Rindo's add is the same fragment OP14-072, OP14-080 and OP14-112 print,
  // and "up to 1" means each of them may decline it too.
  it("OP14-115#1, shared: OP14-112 Boa Hancock's Life add can be declined", () => {
    const game = table("faq-op14-112-decline")
      .withLeader("p1", "OP14-041")
      .withHand("p1", [instance("hancock", "OP14-112")])
      .withLife("p1", copies(2, "ST31-003", "p1-life"))
      .withDeckTop("p1", [instance("p1-top", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-112" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    expect(ids(game.state.players.p1.deck)[0]).toBe("p1-top");
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("FAQ EB-04", () => {
  it("EB04-011#1: the only Neptunian draws 1, then trashes 1", () => {
    const game = table("faq-eb04-011-1")
      .withHand("p1", [
        instance("scaled", "EB04-011"),
        instance("kept", "ST31-003"),
      ])
      .withDeckTop("p1", copies(2, "ST31-003", "p1-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-011" });
    game.play({ type: "resolve-effect", optionId: "kept" });
    settle(game);

    expect(hand(game, "p1")).toEqual(["p1-deck-1"]);
    expect(trash(game, "p1")).toEqual(["kept"]);
  });

  it("EB04-011#2: [Rush: Character] attacks only rested Characters on the turn it is played", () => {
    const game = table("faq-eb04-011-2")
      .withHand("p1", [instance("scaled", "EB04-011")])
      .withDeckTop("p1", copies(2, "ST31-003", "p1-deck"))
      .withBoard("p2", [
        character("active", "ST32-005"),
        character("rested", "ST32-002", { rested: true }),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-011" });
    settle(game);

    expect(attackTargets(game, "scaled")).toEqual(["rested"]);
  });

  it("EB04-015#1: Jinbe's [On K.O.] cannot be paid by resting Jinbe itself", () => {
    const game = table("faq-eb04-015-1")
      .withLeader("p1", "OP14-040")
      .withBoard("p1", [
        character("jinbe", "EB04-015", { rested: true }),
        character("ally", "ST32-005"),
      ])
      .withHand("p1", [instance("green", "ST32-001")])
      .withBoard("p2", [character("attacker", "OP05-044")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    attack(game, "attacker", "jinbe");
    declineDefence(game);
    expect(trash(game, "p1")).toContain("jinbe");
    game.play({ type: "resolve-effect", optionId: "apply" });

    const options = effectOptions(game);
    expect(options).toContain("ally");
    expect(options).not.toContain("jinbe");
  });

  it("EB04-016#1: after Bird Neptunian's [Activate: Main], OP07-021 Urouge sets no DON!! active at end of turn", () => {
    const game = table("faq-eb04-016-1")
      .withDon("p1", { rested: 3 })
      .withBoard("p1", [
        character("bird", "EB04-016"),
        character("urouge", "OP07-021"),
      ])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "bird" });
    settle(game);
    expect(game.state.players.p1.restedDon).toHaveLength(2);

    game.pass();
    while (game.state.pendingEffect && game.player === "p1") {
      game.play({ type: "resolve-effect" });
    }
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("EB04-018#1: Megalo played rested cannot pay its rest cost, so it K.O.s nothing", () => {
    const game = table("faq-eb04-018-1")
      .withBoard("p1", [character("ally", "ST32-005")])
      // OP13-031 Law returns a Character to play one from hand rested.
      .withHand("p1", [
        instance("law", "OP13-031"),
        instance("megalo", "EB04-018"),
      ])
      .withBoard("p2", [character("target", "ST32-005", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-031" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "ally" });
    game.play({ type: "resolve-effect", optionId: "megalo" });
    const megalo = game.state.players.p1.board.find(
      (card) => card.instanceId === "megalo",
    );
    expect(megalo?.rested).toBe(true);
    while (game.state.pendingEffect) {
      const target = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-effect" &&
            (action.optionId === "apply" || action.optionId === "target"),
        );
      game.submit(target ?? game.action({ type: "resolve-effect" }));
    }

    expect(board(game, "p2")).toEqual(["target"]);
  });

  it("EB04-022#1: Issho's cost can be paid against a 5-card hand, which then loses nothing", () => {
    const game = table("faq-eb04-022-1")
      .withHand("p1", [
        instance("issho", "EB04-022"),
        ...copies(2, "ST31-003", "p1-hand"),
      ])
      .withHand("p2", copies(5, "ST32-005", "p2-hand"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-022" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "p1-hand-1" });
    game.play({ type: "resolve-effect", optionId: "p1-hand-2" });
    settle(game);

    expect(trash(game, "p1")).toEqual(["p1-hand-1", "p1-hand-2"]);
    expect(hand(game, "p2")).toHaveLength(5);
  });

  it("EB04-034#1: the Event Pudding trashes as its cost counts toward the 4", () => {
    const game = table("faq-eb04-034-1")
      .withBoard("p1", [character("pudding", "EB04-034")])
      .withTrash("p1", copies(3, "OP14-096", "p1-trash"))
      .withHand("p1", [instance("event", "OP14-096")])
      .withBoard("p2", [character("attacker", "OP05-044")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    toP2(game);
    attack(game, "attacker", "p1-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "event" });
    settle(game);

    expect(trash(game, "p1")).toHaveLength(4);
    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });

  it("EB04-040#1: with no Kaido, Flame Dragon Torch still rests 6 DON!! and a Character", () => {
    const game = table("faq-eb04-040-1")
      .withHand("p1", [instance("torch", "EB04-040")])
      .withBoard("p2", [character("target", "ST32-002")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "EB04-040" });
    while (game.state.pendingEffect) {
      const target = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-effect" &&
            (action.optionId === "apply" || action.optionId === "target"),
        );
      game.submit(target ?? game.action({ type: "resolve-effect" }));
    }

    expect(game.state.players.p1.restedDon).toHaveLength(7);
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });
});
