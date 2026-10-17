import { describe, expect, it } from "vitest";
import { currentPower, effectiveCost } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Block-1 identities a later printing keeps Standard-legal, imported so the
 * tournament lists that play them can be built: ST02-007, OP03-008, OP03-048,
 * OP03-097 and ST06-008 reprinted in block 4 on the PRB-02 page, and OP02-013
 * through its Super Parallel `X` printing. No shipped deck runs them.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase, every DON!! active, empty zones. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 acting, so p1 is the defender. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

/**
 * Resolves the pending effect, taking each named option the first time it is
 * offered and otherwise `apply` or the first option.
 */
function drive(game: Game, ...picks: string[]) {
  const queue = [...picks];
  for (let guard = 0; guard < 40 && game.state.pendingEffect; guard++) {
    const options = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    const index = queue.findIndex((id) => options.includes(id));
    const pick =
      index >= 0
        ? queue.splice(index, 1)[0]!
        : options.includes("apply")
          ? "apply"
          : options[0]!;
    game.play({ type: "resolve-effect", optionId: pick });
  }
}

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId).sort();

const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

const canAttackWith = (game: Game, attacker: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === attacker,
    );

describe("OP02-013 Portgas.D.Ace", () => {
  covers("OP02-013", "[On Play]");

  it("gives two Characters −3000 and itself [Rush] under a Whitebeard Pirates Leader", () => {
    const game = table("op02-013-whitebeard")
      .withLeader("p1", "OP16-001")
      .withHand("p1", [instance("ace", "OP02-013")])
      .withBoard("p2", [
        character("first", "ST14-010"),
        character("second", "OP11-068"),
        character("third", "OP05-065"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP02-013" });
    drive(game, "first", "second", "done");

    expect(currentPower(game.state, "p2", "first")).toBe(4_000);
    expect(currentPower(game.state, "p2", "second")).toBe(4_000);
    expect(currentPower(game.state, "p2", "third")).toBe(8_000);
    expect(canAttackWith(game, "ace")).toBe(true);
  });

  it("debuffs but gains no [Rush] under any other Leader", () => {
    const game = table("op02-013-other-leader")
      .withHand("p1", [instance("ace", "OP02-013")])
      .withBoard("p2", [character("first", "ST14-010")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP02-013" });
    drive(game, "first");

    expect(currentPower(game.state, "p2", "first")).toBe(4_000);
    expect(canAttackWith(game, "ace")).toBe(false);
  });

  it("the debuff lasts only this turn", () => {
    const game = table("op02-013-expiry")
      .withHand("p1", [instance("ace", "OP02-013")])
      .withBoard("p2", [character("first", "ST14-010")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP02-013" });
    drive(game, "first");
    game.pass();

    expect(currentPower(game.state, "p2", "first")).toBe(7_000);
  });
});

describe("OP03-008 Buggy", () => {
  covers("OP03-008", "[On Play]", "static");

  it("adds a red Event from the top five and bottoms the rest", () => {
    const game = table("op03-008-search")
      .withHand("p1", [instance("buggy", "OP03-008")])
      .withDeckTop("p1", [
        instance("tonjit-a", "OP07-067"),
        instance("kick", "OP04-016"),
        instance("tonjit-b", "OP07-067"),
        instance("tonjit-c", "OP07-067"),
        instance("tonjit-d", "OP07-067"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP03-008" });
    drive(game, "kick");

    expect(ids(game.state.players.p1.hand)).toEqual(["kick"]);
    expect(game.state.players.p1.deck).toHaveLength(4);
  });

  it("finds nothing when the top five hold no red Event", () => {
    const game = table("op03-008-miss")
      .withHand("p1", [instance("buggy", "OP03-008")])
      .withDeckTop("p1", [
        instance("tonjit-a", "OP07-067"),
        instance("tonjit-b", "OP07-067"),
        instance("tonjit-c", "OP07-067"),
        instance("tonjit-d", "OP07-067"),
        instance("tonjit-e", "OP07-067"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP03-008" });
    drive(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(5);
  });

  const attackBuggy = (seed: string, attacker: string) => {
    const game = defending(seed)
      .withBoard("p1", [character("buggy", "OP03-008", { rested: true })])
      .withBoard("p2", [character("attacker", attacker)])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "buggy",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    drive(game);
    return game;
  };

  it("is not K.O.'d in battle by a <Slash> attacker", () => {
    // ST14-010 Brook: 7000, <Slash>, against Buggy's 3000.
    const game = attackBuggy("op03-008-slash", "ST14-010");

    expect(boardCard(game, "p1", "buggy")).toBeDefined();
  });

  it("is K.O.'d in battle by an attacker of any other attribute", () => {
    // OP05-065 San-Gorou: 8000, <Strike>.
    const game = attackBuggy("op03-008-strike", "OP05-065");

    expect(boardCard(game, "p1", "buggy")).toBeUndefined();
    expect(ids(game.state.players.p1.trash)).toContain("buggy");
  });
});

describe("OP03-048 Nojiko", () => {
  covers("OP03-048", "[On Play]");

  it("returns a cost-5-or-less Character to its owner's hand under a Nami Leader", () => {
    const game = table("op03-048-nami")
      .withLeader("p1", "P-117")
      .withHand("p1", [instance("nojiko", "OP03-048")])
      .withBoard("p2", [
        character("brook", "ST14-010"),
        character("daifuku", "OP11-068"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP03-048" });
    const offered = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    expect(offered).toContain("brook");
    expect(offered).not.toContain("daifuku");
    drive(game, "brook");

    expect(ids(game.state.players.p2.hand)).toEqual(["brook"]);
    expect(ids(game.state.players.p2.board)).toEqual(["daifuku"]);
  });

  it("does nothing under any other Leader", () => {
    const game = table("op03-048-other-leader")
      .withHand("p1", [instance("nojiko", "OP03-048")])
      .withBoard("p2", [character("brook", "ST14-010")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP03-048" });

    expect(game.state.pendingEffect).toBeFalsy();
    expect(ids(game.state.players.p2.board)).toEqual(["brook"]);
    expect(game.state.players.p2.hand).toHaveLength(0);
  });
});

describe("OP03-097 Six King Pistol", () => {
  covers("OP03-097", "[Counter]", "[Trigger]");

  it("trashes a hand card for +3000 in the battle", () => {
    const game = defending("op03-097-counter")
      .withHand("p1", [
        instance("pistol", "OP03-097"),
        instance("filler", "OP07-067"),
      ])
      .withBoard("p2", [character("attacker", "ST14-010")])
      .withLife("p1", [instance("life", "OP07-067")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP03-097" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "filler" });

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toEqual(["filler", "pistol"]);
  });

  it("is not offered with no other card in hand to trash", () => {
    const game = defending("op03-097-bare")
      .withHand("p1", [instance("pistol", "OP03-097")])
      .withBoard("p2", [character("attacker", "ST14-010")])
      .withLife("p1", [instance("life", "OP07-067")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();

    expect(
      game
        .legalActions()
        .some((action) => action.type === "activate-counter-event"),
    ).toBe(false);
  });

  it("draws a card and K.O.s a cost-1-or-less Character off Life", () => {
    const game = defending("op03-097-trigger")
      .withLife("p1", [instance("life-pistol", "OP03-097")])
      .withDeckTop("p1", [instance("drawn", "OP07-067")])
      .withBoard("p2", [
        character("attacker", "ST14-010"),
        character("small", "OP07-067"),
        character("sterry", "OP05-083"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    const offered = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    expect(offered).toContain("small");
    expect(offered).not.toContain("sterry");
    drive(game, "small");

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
    expect(ids(game.state.players.p2.board)).toEqual(["attacker", "sterry"]);
  });
});

describe("ST02-007 Jewelry Bonney", () => {
  covers("ST02-007", "[Activate: Main]");

  const bonneyOffered = (game: Game) =>
    game
      .legalActions()
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "bonney",
      );

  it("rests a DON!! and itself to add a {Supernovas} card from the top five", () => {
    const game = table("st02-007-search")
      .withBoard("p1", [character("bonney", "ST02-007")])
      .withDeckTop("p1", [
        instance("tonjit-a", "OP07-067"),
        instance("urouge", "OP10-101"),
        instance("tonjit-b", "OP07-067"),
        instance("tonjit-c", "OP07-067"),
        instance("tonjit-d", "OP07-067"),
      ])
      .build();
    const active = game.state.players.p1.activeDon.length;
    expect(bonneyOffered(game)).toBe(true);

    game.play({ type: "activate-main", cardNumber: "ST02-007" });
    drive(game, "urouge");

    expect(ids(game.state.players.p1.hand)).toEqual(["urouge"]);
    expect(game.state.players.p1.deck).toHaveLength(4);
    expect(boardCard(game, "p1", "bonney")?.rested).toBe(true);
    expect(game.state.players.p1.activeDon).toHaveLength(active - 1);
  });

  it("is not offered while Bonney is rested", () => {
    const game = table("st02-007-rested")
      .withBoard("p1", [character("bonney", "ST02-007", { rested: true })])
      .build();

    expect(bonneyOffered(game)).toBe(false);
  });

  it("is not offered with no active DON!! to rest", () => {
    const game = table("st02-007-no-don")
      .withBoard("p1", [character("bonney", "ST02-007")])
      .withDon("p1", { active: 0, rested: 10 })
      .build();

    expect(bonneyOffered(game)).toBe(false);
  });
});

describe("ST06-008 Hina", () => {
  covers("ST06-008", "[On Play]");

  it("gives one opposing Character −4 cost for the turn", () => {
    const game = table("st06-008-cost")
      .withHand("p1", [instance("hina", "ST06-008")])
      .withBoard("p2", [character("brook", "ST14-010")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST06-008" });
    drive(game, "brook");

    expect(
      effectiveCost(game.state, "p2", boardCard(game, "p2", "brook")!),
    ).toBe(1);

    game.pass();
    expect(
      effectiveCost(game.state, "p2", boardCard(game, "p2", "brook")!),
    ).toBe(5);
  });
});
