import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * A second sweep of OP-13 cards that are registered but that no other file
 * drives: one `describe` per card, one case per printed clause. Run
 * `pnpm card:text <card>` for the wording each case checks against.
 */

const DECKS = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
] as const;

/** p1's main phase on an empty table with all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2's main phase, for the clauses p1 answers on the opponent's turn. */
const defending = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

type Game = ReturnType<ReturnType<typeof table>["build"]>;

function effectOptions(state: GameState): string[] {
  const actor = state.pendingEffect?.playerId ?? state.activePlayer;
  return getLegalActions(state, actor)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function resolveAll(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Plays out whatever is left of the current battle with no answers. */
function finishBattle(game: Game): void {
  let guard = 0;
  while (
    game.state.activeAttack ||
    game.state.pendingEffect ||
    game.state.pendingTrigger
  ) {
    if (guard++ > 40) throw new Error("battle never settled");
    if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    else if (game.state.pendingTrigger)
      game.play({ type: "resolve-trigger", optionId: "decline" });
    else game.pass();
  }
}

/** Declares an attack and passes the defender's Blocker step. */
function attack(game: Game, attacker: string, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
  if (game.state.phase === "block") game.pass();
}

/** Passes the Counter step until the Life Trigger is offered. */
function toTrigger(game: Game): void {
  while (game.state.phase === "counter") game.pass();
  expect(game.state.pendingTrigger).toBeTruthy();
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

describe("OP13-051 Boa Hancock", () => {
  covers("OP13-051", "[On K.O.]");

  const koHancock = (seed: string, leader?: string) => {
    let builder = defending(seed);
    if (leader) builder = builder.withLeader("p1", leader);
    const game = builder
      .withBoard("p1", [character("hancock", "OP13-051", { rested: true })])
      .withDeckTop("p1", [
        instance("draw-1", "ST31-003"),
        instance("draw-2", "OP05-012"),
        instance("left", "OP05-035"),
      ])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();
    attack(game, "attacker", "hancock");
    finishBattle(game);
    expect(ids(game.state.players.p1.trash)).toEqual(["hancock"]);
    return game;
  };

  it("draws 2 behind a [Boa Hancock] Leader", () => {
    const game = koHancock("op13-051-name", "OP07-038"); // Blue, Boa Hancock
    expect(ids(game.state.players.p1.hand)).toEqual(["draw-1", "draw-2"]);
  });

  it("draws 2 behind a multicolored Leader", () => {
    const game = koHancock("op13-051-multi", "OP13-002"); // Red/Blue Ace
    expect(ids(game.state.players.p1.hand)).toEqual(["draw-1", "draw-2"]);
  });

  it("draws nothing behind a single-colour Leader of another name", () => {
    const game = koHancock("op13-051-mono"); // ST31's Red Luffy
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP13-053 Marshall.D.Teach", () => {
  covers("OP13-053", "[When Attacking]");

  it("trashes a Whitebeard Pirates Character to draw 1 and gain [Banish]", () => {
    const game = table("op13-053")
      .withBoard("p1", [
        character("teach", "OP13-053"),
        character("doma", "EB01-005"), // {Whitebeard Pirates Allies}
        character("hack", "OP05-012"), // not the type
      ])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withLife("p2", [instance("p2-life", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "teach",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    // "Including" reaches {Whitebeard Pirates Allies}; Hack is not the type.
    expect(effectOptions(game.state)).not.toContain("hack");
    expect(effectOptions(game.state)).toContain("doma");
    game.play({ type: "resolve-effect", optionId: "doma" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["doma"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(hasKeyword(game.state, "p1", "teach", "Banish")).toBe(true);

    finishBattle(game);
    // [Banish]: the Life card is trashed rather than added to the hand.
    expect(game.state.players.p2.life).toHaveLength(0);
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-life"]);
    expect(ids(game.state.players.p2.hand)).not.toContain("p2-life");
  });

  it("draws nothing and keeps the Life card going to hand when declined", () => {
    const game = table("op13-053-skip")
      .withBoard("p1", [
        character("teach", "OP13-053"),
        character("doma", "EB01-005"),
      ])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withLife("p2", [instance("p2-life", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "teach",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "skip" });
    resolveAll(game);
    expect(hasKeyword(game.state, "p1", "teach", "Banish")).toBe(false);
    finishBattle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["teach", "doma"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p2.hand)).toContain("p2-life");
  });
});

describe("OP13-055 Rakuyo", () => {
  covers("OP13-055", "[When Attacking]");

  const swing = (seed: string, handSize: number) => {
    const game = table(seed)
      .withBoard("p1", [
        character("rakuyo", "OP13-055"), // 4000
        character("oars", "OP13-056"), // 7000, {Whitebeard Pirates Allies}
        character("hack", "OP05-012"), // 5000, not the type
      ])
      .withHand(
        "p1",
        Array.from({ length: handSize }, (_, index) =>
          instance(`card-${index}`, "ST31-003"),
        ),
      )
      .withBoard("p2", [character("target", "OP05-012", { rested: true })])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "rakuyo",
      targetInstanceId: "target",
    });
    resolveAll(game);
    return game;
  };

  it("gives every Whitebeard Pirates Character +1000 at 4 cards in hand", () => {
    const game = swing("op13-055-four", 4);
    expect(currentPower(game.state, "p1", "rakuyo")).toBe(5_000);
    expect(currentPower(game.state, "p1", "oars")).toBe(8_000);
    expect(currentPower(game.state, "p1", "hack")).toBe(5_000);

    finishBattle(game);
    game.pass();
    expect(currentPower(game.state, "p1", "oars")).toBe(7_000);
  });

  it("gives nothing at 5 cards in hand", () => {
    const game = swing("op13-055-five", 5);
    expect(currentPower(game.state, "p1", "rakuyo")).toBe(4_000);
    expect(currentPower(game.state, "p1", "oars")).toBe(7_000);
  });
});

describe("OP13-056 LittleOars Jr.", () => {
  covers("OP13-056", "[When Attacking]");

  const swing = (seed: string, leader?: string) => {
    let builder = table(seed);
    if (leader) builder = builder.withLeader("p1", leader);
    const game = builder
      .withBoard("p1", [character("oars", "OP13-056")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [character("target", "OP05-012", { rested: true })])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "oars",
      targetInstanceId: "target",
    });
    resolveAll(game);
    return game;
  };

  it("draws 1 behind a Whitebeard Pirates Leader", () => {
    const game = swing("op13-056-wb", "OP13-002");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  it("draws nothing behind a Leader without the type", () => {
    const game = swing("op13-056-other");
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP13-059 Brilliant Punk", () => {
  covers("OP13-059", "[Main]", "[Trigger]");

  it("returns one of your Characters to return a cost-6-or-less Character", () => {
    const game = table("op13-059-main")
      .withHand("p1", [instance("punk", "OP13-059")])
      .withBoard("p1", [character("jozu", "OP09-049")])
      .withBoard("p2", [
        character("six", "OP11-068"), // cost 6
        character("seven", "OP09-067"), // cost 7
      ])
      .build();

    game.play({ type: "activate-main", summary: "Brilliant Punk" });
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game.state)).toEqual(["jozu"]);
    game.play({ type: "resolve-effect", optionId: "jozu" });
    expect(effectOptions(game.state)).not.toContain("seven");
    game.play({ type: "resolve-effect", optionId: "six" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["jozu"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["six"]);
    expect(ids(game.state.players.p2.board)).toEqual(["seven"]);
    expect(game.state.players.p1.activeDon).toHaveLength(6);
  });

  it("returns nothing when the cost is declined", () => {
    const game = table("op13-059-skip")
      .withHand("p1", [instance("punk", "OP13-059")])
      .withBoard("p1", [character("jozu", "OP09-049")])
      .withBoard("p2", [character("six", "OP11-068")])
      .build();

    game.play({ type: "activate-main", summary: "Brilliant Punk" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["jozu"]);
    expect(ids(game.state.players.p2.board)).toEqual(["six"]);
  });

  it("draws 1 off its Life Trigger", () => {
    const game = defending("op13-059-trigger")
      .withLife("p1", [instance("punk", "OP13-059")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["punk"]);
  });
});

describe("OP13-069 Tom", () => {
  covers("OP13-069", "[On Play]");

  it("returns a DON!! to add a cost-3-or-less Stage from the trash", () => {
    const game = table("op13-069")
      .withHand("p1", [instance("tom", "OP13-069")])
      .withTrash("p1", [
        instance("geoise", "OP05-097"), // Stage, cost 1
        instance("birdcage", "OP05-040"), // Stage, cost 5
        instance("hack", "OP05-012"), // a Character
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-069" });
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Which DON!! goes back is the payer's pick; the cost-area total is what
    // the clause prices.
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "geoise"]);
    game.play({ type: "resolve-effect", optionId: "geoise" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["geoise"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "birdcage",
      "hack",
    ]);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("keeps the DON!! and the trash when declined", () => {
    const game = table("op13-069-skip")
      .withHand("p1", [instance("tom", "OP13-069")])
      .withTrash("p1", [instance("geoise", "OP05-097")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-069" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    resolveAll(game);

    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toEqual(["geoise"]);
  });
});

describe("OP13-074 Hera", () => {
  covers("OP13-074", "[On Play]");

  it("plays a {Homies} Character with 3000 power or less from hand for free", () => {
    const game = table("op13-074")
      .withHand("p1", [
        instance("hera", "OP13-074"),
        instance("nitro", "OP08-107"), // {Homies}, 2000
        instance("napoleon", "OP13-070"), // {Homies}, 7000
        instance("usopp", "OP07-099"), // 2000, not the type
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-074" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "nitro"]);
    game.play({ type: "resolve-effect", optionId: "nitro" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["hera", "nitro"]);
    // Only Hera's own 4 was paid.
    expect(game.state.players.p1.activeDon).toHaveLength(6);
  });
});

describe("OP13-077 Go All the Way to the Top!!", () => {
  covers("OP13-077", "[Main]", "[Counter]");

  it("rests 3 DON!! to K.O. a 4000-base and a 3000-base Character while a DON!! is given", () => {
    const game = table("op13-077-main")
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [instance("top", "OP13-077")])
      .withBoard("p2", [
        character("bb", "OP08-035"), // 4000
        character("usopp", "OP07-099"), // 2000
        character("hack", "OP05-012"), // 5000
      ])
      .build();

    game.play({ type: "activate-main", summary: "Go All the Way" });
    resolveUntilChoice(game);
    expect(effectOptions(game.state).sort()).toEqual(["bb", "done", "usopp"]);
    game.play({ type: "resolve-effect", optionId: "bb" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "usopp"]);
    game.play({ type: "resolve-effect", optionId: "usopp" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["hack"]);
    expect(ids(game.state.players.p2.trash).sort()).toEqual(["bb", "usopp"]);
    // One for the Event and three for the clause.
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  it("is not offered with no DON!! given, so nothing is K.O.'d", () => {
    const game = table("op13-077-none")
      .withHand("p1", [instance("top", "OP13-077")])
      .withBoard("p2", [character("usopp", "OP07-099")])
      .build();

    // The gate is the program's outermost condition, and the engine withholds
    // an Event whose gate is false rather than resolve it to nothing.
    expect(
      game.summaries().some((summary) => summary.includes("Go All the Way")),
    ).toBe(false);
    expect(ids(game.state.players.p2.board)).toEqual(["usopp"]);
  });

  it("gives the Leader +3000 for the battle from the Counter step", () => {
    const game = defending("op13-077-counter")
      .withHand("p1", [instance("top", "OP13-077")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    game.play({ type: "activate-counter-event", eventInstanceId: "top" });
    resolveAll(game);
    expect(game.state.activeAttack?.counterPower).toBe(3_000);

    finishBattle(game);
    // At 0 Life a hit would end the game.
    expect(game.state.winner ?? null).toBeNull();
  });
});

describe("OP13-078 Oro Jackson", () => {
  covers("OP13-078", "static");

  const oro = (seed: string) =>
    defending(seed)
      .withStage("p1", instance("oro", "OP13-078"))
      .withDonDeck("p1", 2);

  it("adds a rested DON!! once when the opponent's effect removes Roger Pirates Characters", () => {
    const game = oro("op13-078-effect")
      .withBoard("p1", [
        character("shanks", "OP13-065"), // {Roger Pirates}, 2000
        character("buggy", "OP12-012"), // {Roger Pirates}, 2000
      ])
      .withGivenDon("p2", "p2-leader", 1)
      .withHand("p2", [instance("top", "OP13-077")])
      .build();
    const restedBefore = game.state.players.p1.restedDon.length;

    game.play({ type: "activate-main", summary: "Go All the Way" });
    resolveUntilChoice(game);
    game.play({ type: "resolve-effect", optionId: "shanks" });
    game.play({ type: "resolve-effect", optionId: "buggy" });
    resolveAll(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    // [Once Per Turn]: two removals, one DON!!.
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore + 1);
  });

  it("adds nothing for a K.O. in battle", () => {
    const game = oro("op13-078-battle")
      .withBoard("p1", [character("shanks", "OP13-065", { rested: true })])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "shanks");
    finishBattle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["shanks"]);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("adds nothing when its controller's own effect removes the Character", () => {
    const game = table("op13-078-own")
      .withStage("p1", instance("oro", "OP13-078"))
      .withDonDeck("p1", 2)
      .withBoard("p1", [character("shanks", "OP13-065")])
      .withHand("p1", [instance("punk", "OP13-059")])
      .build();

    game.play({ type: "activate-main", summary: "Brilliant Punk" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "shanks" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["shanks"]);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });
});

describe("OP13-094 York", () => {
  covers("OP13-094", "[On Play]");

  it("gives a {Celestial Dragons} Character +2000 for the turn", () => {
    const game = table("op13-094")
      .withHand("p1", [instance("york", "OP13-094")])
      .withBoard("p1", [
        character("jalmac", "OP13-085"), // {Celestial Dragons}, 4000
        character("hack", "OP05-012"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-094" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "jalmac"]);
    game.play({ type: "resolve-effect", optionId: "jalmac" });
    resolveAll(game);

    expect(currentPower(game.state, "p1", "jalmac")).toBe(6_000);
    game.pass();
    expect(currentPower(game.state, "p1", "jalmac")).toBe(4_000);
  });
});

describe("OP13-102 Edison", () => {
  covers("OP13-102", "[Activate: Main]", "[Trigger]");

  const edison = (seed: string, ownLife: number) =>
    table(seed)
      .withBoard("p1", [character("edison", "OP13-102")])
      .withLife(
        "p1",
        Array.from({ length: ownLife }, (_, index) =>
          instance(`life-${index}`, "ST31-003"),
        ),
      )
      .withLife("p2", [
        instance("p2-life-1", "ST32-002"),
        instance("p2-life-2", "ST32-002"),
      ])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [
        character("bb", "OP08-035"), // cost 2
        character("hack", "OP05-012"), // cost 3
        character("usopp", "OP11-003"), // cost 5
      ])
      .build();

  it("trashes itself to draw 1 at equal Life, then rests a cost-3-or-less Character", () => {
    const game = edison("op13-102-equal", 2);
    game.play({ type: "activate-main", summary: "Edison" });
    // Activating is the "you may": the trash and the draw are already done.
    expect(ids(game.state.players.p1.board)).toHaveLength(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(effectOptions(game.state).sort()).toEqual(["bb", "done", "hack"]);
    game.play({ type: "resolve-effect", optionId: "hack" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["edison"]);
    expect(
      game.state.players.p2.board.find((c) => c.instanceId === "hack")?.rested,
    ).toBe(true);
  });

  it("still rests, without the draw, at more Life than the opponent", () => {
    const game = edison("op13-102-more", 3);
    game.play({ type: "activate-main", summary: "Edison" });
    game.play({ type: "resolve-effect", optionId: "bb" });
    resolveAll(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toEqual(["edison"]);
    expect(
      game.state.players.p2.board.find((c) => c.instanceId === "bb")?.rested,
    ).toBe(true);
  });

  it("draws 1 and rests a cost-3-or-less Character off its Life Trigger", () => {
    const game = defending("op13-102-trigger")
      .withLife("p1", [instance("edison", "OP13-102")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [
        character("attacker", "OP11-003"),
        character("bb", "OP08-035"),
      ])
      .build();

    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(effectOptions(game.state).sort()).toEqual(["bb", "done"]);
    game.play({ type: "resolve-effect", optionId: "bb" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(
      game.state.players.p2.board.find((c) => c.instanceId === "bb")?.rested,
    ).toBe(true);
  });
});

describe("OP13-105 Kouzuki Momonosuke", () => {
  covers("OP13-105", "[On Play]");

  it("looks at every Life card and puts the picked ones back in a new order", () => {
    const game = table("op13-105")
      .withHand("p1", [instance("momo", "OP13-105")])
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "OP05-012"),
        instance("life-3", "OP07-099"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-105" });
    expect(effectOptions(game.state).sort()).toEqual([
      "done",
      "life-1",
      "life-2",
      "life-3",
    ]);
    game.play({ type: "resolve-effect", optionId: "life-1" });
    game.play({ type: "resolve-effect", optionId: "life-2" });
    game.play({ type: "resolve-effect", optionId: "done" });
    resolveAll(game);

    expect(ids(game.state.players.p1.life)).toEqual([
      "life-3",
      "life-1",
      "life-2",
    ]);
  });
});

describe("OP13-112 Vegapunk", () => {
  covers("OP13-112", "static");

  it("blocks with 2 DON!! given across the Leader and a Character", () => {
    const game = defending("op13-112-two")
      .withBoard("p1", [
        character("vegapunk", "OP13-112"),
        character("hack", "OP05-012"),
      ])
      .withGivenDon("p1", "p1-leader", 1)
      .withGivenDon("p1", "hack", 1)
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    expect(hasKeyword(game.state, "p1", "vegapunk", "Blocker")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "vegapunk" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("vegapunk");
  });

  it("cannot block with 1 DON!! given", () => {
    const game = defending("op13-112-one")
      .withBoard("p1", [character("vegapunk", "OP13-112")])
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    expect(hasKeyword(game.state, "p1", "vegapunk", "Blocker")).toBe(false);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(
      getLegalActions(game.state, "p1").some(
        (action) => action.type === "block",
      ),
    ).toBe(false);
  });
});

describe("OP13-114 S-Snake", () => {
  covers("OP13-114", "[On Play]", "[When Attacking]", "[Trigger]");

  it("turns the top Life card face-up on play to give a Character -2000", () => {
    const game = table("op13-114-play")
      .withHand("p1", [instance("snake", "OP13-114")])
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "ST31-003"),
      ])
      .withBoard("p2", [character("hack", "OP05-012")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-114" });
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game.state)).toEqual(["life-1"]);
    game.play({ type: "resolve-effect", optionId: "life-1" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    resolveAll(game);

    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(game.state.players.p1.life[1]?.faceUp).toBeFalsy();
    expect(currentPower(game.state, "p2", "hack")).toBe(3_000);
    game.pass();
    expect(currentPower(game.state, "p2", "hack")).toBe(5_000);
  });

  it("gives nothing when the Life cost is declined", () => {
    const game = table("op13-114-skip")
      .withHand("p1", [instance("snake", "OP13-114")])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .withBoard("p2", [character("hack", "OP05-012")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-114" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    resolveAll(game);

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    expect(currentPower(game.state, "p2", "hack")).toBe(5_000);
  });

  it("runs the same clause when attacking", () => {
    const game = table("op13-114-attack")
      .withBoard("p1", [character("snake", "OP13-114")])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .withBoard("p2", [
        character("hack", "OP05-012"),
        character("target", "OP05-012", { rested: true }),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "snake",
      targetInstanceId: "target",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "life-1" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    resolveAll(game);

    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(currentPower(game.state, "p2", "hack")).toBe(3_000);
  });

  it("trashes a hand card off its Life Trigger to play itself, running its [On Play]", () => {
    const game = defending("op13-114-trigger")
      .withLife("p1", [
        instance("snake", "OP13-114"),
        instance("life-2", "ST31-003"),
      ])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fuel" });
    expect(ids(game.state.players.p1.board)).toEqual(["snake"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);

    // Its own [On Play], off the Life card that is left.
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "life-2" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    resolveAll(game);
    expect(currentPower(game.state, "p2", "attacker")).toBe(4_000);
  });

  it("stays in Life's place in the trash when the Trigger's cost is declined", () => {
    const game = defending("op13-114-trigger-skip")
      .withLife("p1", [instance("snake", "OP13-114")])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    resolveAll(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["fuel"]);
  });
});

describe("OP13-115 Paper Art Afterimage", () => {
  covers("OP13-115", "[Counter]", "[Trigger]");

  const counter = (seed: string, opponentLife: number) => {
    const game = defending(seed)
      .withHand("p1", [instance("afterimage", "OP13-115")])
      .withBoard("p1", [character("hack", "OP05-012")])
      .withLife(
        "p2",
        Array.from({ length: opponentLife }, (_, index) =>
          instance(`p2-life-${index}`, "ST32-002"),
        ),
      )
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();
    attack(game, "attacker", "p1-leader");
    game.play({
      type: "activate-counter-event",
      eventInstanceId: "afterimage",
    });
    return game;
  };

  it("adds +3000 to the battle and, at 2 opponent Life, +1000 for the turn", () => {
    const game = counter("op13-115-two", 2);
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(effectOptions(game.state).sort()).toEqual([
      "done",
      "hack",
      "p1-leader",
    ]);
    game.play({ type: "resolve-effect", optionId: "hack" });
    resolveAll(game);
    expect(currentPower(game.state, "p1", "hack")).toBe(6_000);

    finishBattle(game);
    expect(game.state.winner ?? null).toBeNull();
    // "During this turn": still on after the battle, gone when it ends.
    expect(currentPower(game.state, "p1", "hack")).toBe(6_000);
    game.pass();
    expect(currentPower(game.state, "p1", "hack")).toBe(5_000);
  });

  it("adds only the +3000 at 3 opponent Life", () => {
    const game = counter("op13-115-three", 3);
    expect(effectOptions(game.state)).not.toContain("hack");
    resolveAll(game);
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(currentPower(game.state, "p1", "hack")).toBe(5_000);
  });

  it("draws 1 off its Life Trigger", () => {
    const game = defending("op13-115-trigger")
      .withLife("p1", [instance("afterimage", "OP13-115")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["afterimage"]);
  });
});

describe("OP13-120 Sabo", () => {
  covers("OP13-120", "[Blocker]", "[Activate: Main]");

  it("blocks a declared attack", () => {
    const game = defending("op13-120-blocker")
      .withBoard("p1", [character("sabo", "OP13-120")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "sabo" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("sabo");
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
  });

  it("gives a Character +2 cost through the opponent's next turn, then gives a rested DON!! to the Leader", () => {
    const game = table("op13-120-main")
      .withDon("p1", { rested: 2 })
      .withBoard("p1", [
        character("sabo", "OP13-120"),
        character("hack", "OP05-012"), // cost 3
      ])
      // Something to draw on the two turns the duration is followed through.
      .withDeckTop("p1", [instance("p1-draw", "ST31-003")])
      .withDeckTop("p2", [instance("p2-draw", "ST32-002")])
      .build();
    const hack = () =>
      game.state.players.p1.board.find((card) => card.instanceId === "hack")!;

    game.play({ type: "activate-main", summary: "Sabo" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "hack", "sabo"]);
    game.play({ type: "resolve-effect", optionId: "hack" });
    resolveAll(game);

    expect(effectiveCost(game.state, "p1", hack())).toBe(5);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    // [Once Per Turn].
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "OP13-120",
        ),
    ).toBe(false);

    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    expect(effectiveCost(game.state, "p1", hack())).toBe(5);
    game.pass();
    expect(game.state.activePlayer).toBe("p1");
    expect(effectiveCost(game.state, "p1", hack())).toBe(3);
  });
});

/** Settles the pending effect up to its first card choice. */
function resolveUntilChoice(game: Game): void {
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game.state).every((option) =>
      ["apply", "skip", "done"].includes(option),
    )
  ) {
    if (guard++ > 20) throw new Error("no card choice was offered");
    const options = effectOptions(game.state);
    game.play({
      type: "resolve-effect",
      optionId: options.includes("apply") ? "apply" : options[0]!,
    });
  }
}
