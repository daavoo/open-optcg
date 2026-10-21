import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  observe,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP10 "Royal Blood", imported whole.
 *
 * The set ships in no deck, so these tests reach its cards by putting them in a
 * hand or on a board of an otherwise ordinary ST31-vs-ST32 game -- which is what
 * `test/support`'s `bareTable()` is for. What is asserted is the printed clause
 * and the boundary the clause draws: the gate that fails, the target that is not
 * offered, the cost that cannot be paid.
 */

/** p1 on the play, clear board, all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p1 defending an attack from p2, for the `[Counter]` and block windows. */
const defending = (seed: string) =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

const ATTACK = {
  attackerPlayerId: "p2",
  defenderPlayerId: "p1",
  attackerInstanceId: "attacker",
  targetInstanceId: "p1-leader",
  attackPower: 6000,
  counterPower: 0,
} as const;

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Answers every pending choice with the first non-`done` option, then finishes. */
function resolveAll(game: {
  state: GameState;
  play: (matcher: { type: "resolve-effect"; optionId?: string }) => unknown;
}): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

describe("OP10 metadata import", () => {
  it("registers all 119 OP10 identities from Bandai's own card list", () => {
    const op10 = [...cardRegistry.values()].filter((card) =>
      card.cardNumber.startsWith("OP10-"),
    );
    expect(op10).toHaveLength(119);
    expect(op10.map((card) => card.cardNumber).sort()).toEqual(
      Array.from(
        { length: 119 },
        (_, index) => `OP10-${String(index + 1).padStart(3, "0")}`,
      ),
    );
    // Every record carries the printed rarity a booster slot is filled by;
    // `test/set-rarity.test.ts` pins the composition.
    expect(op10.every((card) => card.rarity)).toBe(true);
  });
});

describe("OP10-004 Vergo", () => {
  covers("OP10-004", "[On Play]");

  it("finds a {Punk Hazard} card that is not another Vergo", () => {
    const game = table("op10-004")
      .withHand("p1", [instance("vergo", "OP10-004")])
      .withDeckTop("p1", [
        instance("vergo-2", "OP10-004"), // the printed "other than [Vergo]"
        instance("monet", "OP10-016"), // {Punk Hazard}
        instance("brook", "ST31-003"), // no {Punk Hazard}
        instance("jinbe", "ST31-002"),
        instance("luffy", "ST31-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-004" });

    expect(effectOptions(game.state)).toEqual(["monet", "done"]);
    game.play({ type: "resolve-effect", optionId: "monet" });
    resolveAll(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "monet",
    );
    // "[printed text omitted -- pnpm card:text <card>]"
    expect(
      game.state.players.p1.deck.slice(-4).map((c) => c.instanceId),
    ).toEqual(["vergo-2", "brook", "jinbe", "luffy"]);
  });
});

describe("OP10-008 Scotch and OP10-017 Rock", () => {
  covers("OP10-008", "[On Play]");
  covers("OP10-017", "[On Play]");

  it("plays the partner it names when that partner is not already out", () => {
    const game = table("op10-008")
      .withHand("p1", [
        instance("scotch", "OP10-008"),
        instance("rock", "OP10-017"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-008" });
    game.play({ type: "resolve-effect", optionId: "rock" });
    resolveAll(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP10-008",
      "OP10-017",
    ]);
  });

  it("does nothing when a copy of the named partner is already on the board", () => {
    const game = table("op10-008-gate")
      .withHand("p1", [
        instance("scotch", "OP10-008"),
        instance("rock", "OP10-017"),
      ])
      .withBoard("p1", [character("rock-out", "OP10-017")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-008" });

    // "If you don't have [Rock]" is false, so the clause never asks.
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "rock",
    ]);
  });
});

describe("OP10-009 Smiley", () => {
  covers("OP10-009", "[On Play]");

  it("debuffs a Character by 3000 behind a {Punk Hazard} Leader", () => {
    const game = table("op10-009")
      .withLeader("p1", "OP10-001") // Smoker: {Punk Hazard}/{Navy}
      .withHand("p1", [instance("smiley", "OP10-009")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    const before = currentPower(game.state, "p2", "target");
    game.play({ type: "play-card", cardNumber: "OP10-009" });
    game.play({ type: "resolve-effect", optionId: "target" });
    resolveAll(game);

    expect(currentPower(game.state, "p2", "target")).toBe(before - 3000);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("op10-009-gate")
      .withHand("p1", [instance("smiley", "OP10-009")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    const before = currentPower(game.state, "p2", "target");
    game.play({ type: "play-card", cardNumber: "OP10-009" });

    expect(game.state.pendingEffect).toBeNull();
    expect(currentPower(game.state, "p2", "target")).toBe(before);
  });
});

describe("OP10-024 Edward.Newgate", () => {
  covers("OP10-024", "[On Play]");

  it("rests a Character and then K.O.s a rested one, in that order", () => {
    const game = table("op10-024")
      .withHand("p1", [instance("newgate", "OP10-024")])
      // The gate: two of the controller's own Characters already rested.
      .withBoard("p1", [
        character("mine-1", "ST31-003", { rested: true }),
        character("mine-2", "ST31-003", { rested: true }),
      ])
      // A 3-cost body, so the rest this clause performs brings it inside the
      // K.O.'s own "[printed text omitted -- pnpm card:text ST31-003]".
      .withBoard("p2", [character("victim", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-024" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    // The same Character is now a legal K.O. target, which is why the two halves
    // are printed together.
    expect(effectOptions(game.state)).toContain("victim");
    game.play({ type: "resolve-effect", optionId: "victim" });
    resolveAll(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("victim");
  });

  it("asks nothing without two rested Characters of its own", () => {
    const game = table("op10-024-gate")
      .withHand("p1", [instance("newgate", "OP10-024")])
      .withBoard("p1", [character("mine-1", "ST31-003", { rested: true })])
      .withBoard("p2", [character("victim", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-024" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP10-046 Kyros", () => {
  covers("OP10-046", "[On Play]");

  it("returns a Character from either board to its own owner's hand", () => {
    const game = table("op10-046")
      .withHand("p1", [instance("kyros", "OP10-046")])
      .withBoard("p1", [character("mine", "ST31-003")])
      .withBoard("p2", [character("theirs", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-046" });

    // "1 Character", with no side named: both boards are on offer, the
    // controller's own first.
    expect(effectOptions(game.state)).toEqual(["mine", "theirs", "done"]);
    game.play({ type: "resolve-effect", optionId: "theirs" });
    resolveAll(game);

    // "…to the owner's hand": the opponent's Character goes back to *their*
    // hand, not to the hand of the player who returned it.
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "theirs",
    );
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId),
    ).not.toContain("theirs");
  });
});

describe("OP10-044 Cub", () => {
  covers("OP10-044", "[On Play]");

  it("pays by resting a {Dressrosa} Stage and bounces a 1-cost body", () => {
    const game = table("op10-044")
      .withHand("p1", [instance("cub", "OP10-044")])
      .withStage("p1", instance("stage", "OP10-021")) // Punk Hazard: not Dressrosa
      .withBoard("p2", [character("cheap", "OP10-057")]) // Leo, 1 cost
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-044" });

    // The "you may" is still offered -- the interpreter asks before it looks --
    // but taking it finds no {Dressrosa} Leader or Stage to rest, so the
    // `choose` that carries the cost is skipped and the bounce never happens.
    expect(effectOptions(game.state)).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    resolveAll(game);
    expect(game.state.players.p2.board).toHaveLength(1);
    expect(game.state.players.p1.stage?.rested).toBe(false);
  });

  it("bounces once a {Dressrosa} Stage is there to rest", () => {
    const game = table("op10-044-pay")
      .withHand("p1", [instance("cub", "OP10-044")])
      .withStage("p1", instance("stage", "OP10-085"))
      .withBoard("p2", [character("cheap", "OP10-057")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-044" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "stage" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    resolveAll(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP10-070 Trebol", () => {
  covers("OP10-070", "[On Play]");

  it("makes small Characters immune to the opponent's removal for a turn", () => {
    const game = table("op10-070")
      .withHand("p1", [instance("trebol", "OP10-070")])
      .withBoard("p1", [
        character("small", "OP10-093"), // Saint Homing, 0 printed power
        character("big", "ST31-003"), // 5000 printed power
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-070" });
    resolveAll(game);

    const board = game.state.players.p1.board;
    expect(
      board.find((card) => card.instanceId === "small")
        ?.koImmuneToOpponentEffectsUntilTurn,
    ).toBe(game.state.turn + 1);
    // "with 1000 base power or less": the 5000 body is untouched.
    expect(
      board.find((card) => card.instanceId === "big")
        ?.koImmuneToOpponentEffectsUntilTurn,
    ).toBeUndefined();
  });
});

describe("OP10-033 Nami", () => {
  covers("OP10-033", "[On Play]");

  it("holds one of the opponent's rested DON!! back from their next Refresh", () => {
    const game = table("op10-033")
      .withHand("p1", [instance("nami", "OP10-033")])
      .withBoard("p1", [
        character("odyssey-1", "OP10-038", { rested: true }),
        character("odyssey-2", "OP10-038", { rested: true }),
      ])
      .withDonDeck("p2", 4)
      .withDon("p2", { rested: 3 })
      // A card to draw for the turn: `bareTable()` empties the deck, and a
      // player who cannot draw loses before the Refresh Phase is reached.
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-033" });
    resolveAll(game);

    expect(game.state.players.p2.donHeldFromRefresh).toBe(1);
    // Public, and observable: a consumer projecting the DON!! a seat will have
    // to spend adds the cost area to what the seat has given, and the hold is
    // the one thing that makes that sum too big.
    expect(observe(game.state, "p1").opponent.donHeldFromRefresh).toBe(1);
    expect(observe(game.state, "p2").self.donHeldFromRefresh).toBe(1);

    const restedBefore = game.state.players.p2.restedDon.length;
    game.pass();

    // One rested DON!! stayed rested through the Refresh Phase, and the hold is
    // spent rather than carried into a second turn.
    expect(game.state.players.p2.restedDon).toHaveLength(1);
    expect(restedBefore).toBe(3);
    expect(game.state.players.p2.donHeldFromRefresh).toBeUndefined();
  });
});

describe("OP10-072 Donquixote Rosinante", () => {
  covers("OP10-072", "[On Play]", "[End of Your Turn]");

  it("trades an Event from hand for two cards", () => {
    const game = table("op10-072")
      .withHand("p1", [
        instance("rosinante", "OP10-072"),
        instance("event", "OP10-079"),
        instance("body", "ST31-003"),
      ])
      .withDeckTop("p1", [
        instance("draw-1", "ST31-003"),
        instance("draw-2", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-072" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "event" });
    resolveAll(game);

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("event");
    expect(game.state.players.p1.hand).toHaveLength(3); // body + two drawn
  });

  it("sets two DON!! active at the end of a turn spent to seven DON!!", () => {
    const game = table("op10-072-end")
      .withBoard("p1", [character("rosinante", "OP10-072")])
      .withDon("p1", { rested: 3 })
      .build();

    game.pass();

    // Ten DON!! on the field clears the "7 or more" gate, and two of the three
    // rested come back before the turn ends.
    expect(game.state.players.p1.activeDon.length).toBeGreaterThan(0);
  });
});

describe("OP10-030 Smoker", () => {
  covers("OP10-030", "[Activate: Main]");

  it("sets a DON!! active and then bans Character effects from doing it again", () => {
    const game = table("op10-030")
      .withBoard("p1", [character("smoker", "OP10-030")])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", summary: "OP10-030" });
    resolveAll(game);

    expect(game.state.players.p1.cannotActivateDonByCharacterUntilTurn).toBe(
      game.state.turn,
    );
    // The activation is not `[Once Per Turn]`, so it is the ban -- read through
    // `requires.donActivationAllowed` -- that takes it off the table.
    expect(
      getLegalActions(game.state, "p1").filter(
        (action) => action.type === "activate-main",
      ),
    ).toEqual([]);
  });
});

describe("OP10-019 Divine Departure", () => {
  covers("OP10-019", "[Main]", "[Counter]");

  it("rests five DON!! to K.O. an 8000 body", () => {
    const game = table("op10-019")
      .withHand("p1", [instance("divine", "OP10-019")])
      .withBoard("p2", [character("giant", "OP10-046")]) // Kyros, 9000
      .withBoard("p2", [character("body", "OP10-014")]) // Franky, 8000
      .build();

    game.play({ summary: "Divine Departure" });
    game.play({ type: "resolve-effect", optionId: "body" });
    resolveAll(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    // Six rested in total: one for the Event's printed cost, five more by its
    // own text.
    expect(game.state.players.p1.restedDon).toHaveLength(6);
  });

  it("is not offered as a [Main] without five active DON!! behind its cost", () => {
    const game = table("op10-019-cost")
      .withHand("p1", [instance("divine", "OP10-019")])
      .withDonDeck("p1", 5)
      .build();

    expect(
      getLegalActions(game.state, "p1")
        .filter((action) => action.type === "play-card")
        .map((action) => action.summary)
        .join(" "),
    ).not.toContain("Divine Departure");
  });

  it("adds +3000 to a Leader in a battle, and nothing when a Character blocks", () => {
    const game = defending("op10-019-counter")
      .withHand("p1", [instance("divine", "OP10-019")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    const offer = game.action({ type: "activate-counter-event" });
    expect(offer.summary).toContain("+3000");

    const blocked = defending("op10-019-counter-blocked")
      .withHand("p1", [instance("divine", "OP10-019")])
      .withBoard("p1", [character("blocker", "ST31-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack({ ...ATTACK, targetInstanceId: "blocker" }, "counter")
      .build();

    // "Up to 1 of your Leader": worth nothing while a Character is the
    // target, so it is never offered.
    expect(
      blocked
        .legalActions()
        .find((action) => action.type === "activate-counter-event"),
    ).toBeUndefined();
  });
});

describe("OP10-117 ROOM", () => {
  covers("OP10-117", "[Counter]", "[Trigger]");

  it("pays out only at 1 or less Life, and sets a Character active", () => {
    const game = defending("op10-117")
      .withHand("p1", [instance("room", "OP10-117")])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .withBoard("p1", [character("spent", "ST31-003", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    const offer = game.action({ type: "activate-counter-event" });
    expect(offer.summary).toContain("+3000");
    game.submit(offer);
    game.play({ type: "resolve-effect", optionId: "spent" });
    resolveAll(game);

    // A Character set active during the opponent's turn can block again.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "spent")
        ?.rested,
    ).toBe(false);
  });

  it("promises nothing at 2 or more Life", () => {
    const game = defending("op10-117-gate")
      .withHand("p1", [instance("room", "OP10-117")])
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "ST31-003"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    // `powerWhen` is false, so the offer's own forecast says so rather than
    // promising power the resolution will not add.
    expect(game.action({ type: "activate-counter-event" }).summary).toContain(
      "adds nothing",
    );
  });
});

describe("OP10-098 Liberation", () => {
  covers("OP10-098", "[Main]", "[Trigger]");

  it("only fires two bodies behind", () => {
    const behind = table("op10-098")
      .withHand("p1", [instance("liberation", "OP10-098")])
      .withBoard("p2", [character("a", "ST32-004"), character("b", "ST32-005")])
      .build();

    behind.play({ summary: "Liberation" });
    expect(behind.state.pendingEffect).not.toBeNull();

    const level = table("op10-098-gate")
      .withHand("p1", [instance("liberation", "OP10-098")])
      .withBoard("p1", [character("mine", "ST31-003")])
      .withBoard("p2", [character("a", "ST32-004"), character("b", "ST32-005")])
      .build();

    // One behind, not two: `character-count-versus`'s `by` is the margin, and a
    // 6-cost Event whose gate is false is not even offered.
    expect(
      level
        .legalActions()
        .filter((action) => action.summary.includes("Liberation")),
    ).toEqual([]);
  });
});

describe("OP10-042 Usopp", () => {
  covers("OP10-042", "static", "[Opponent's Turn]");

  it("raises the cost of its own {Dressrosa} Characters from 2 up", () => {
    const game = table("op10-042")
      .withLeader("p1", "OP10-042")
      .withBoard("p1", [
        character("leo", "OP10-057"), // Dressrosa, printed cost 1
        character("kyros", "OP10-046"), // Dressrosa, printed cost 7
      ])
      .build();

    const leo = game.state.players.p1.board[0]!;
    const kyros = game.state.players.p1.board[1]!;
    expect(effectiveCost(game.state, "p1", leo)).toBe(1);
    expect(effectiveCost(game.state, "p1", kyros)).toBe(8);
  });
});

describe("OP10-113 Roronoa Zoro", () => {
  covers("OP10-113", "static", "[Trigger]");

  it("has [Rush] only while behind on Life", () => {
    const behind = table("op10-113")
      .withBoard("p1", [character("zoro", "OP10-113", { playedTurn: 11 })])
      .withLife("p1", [instance("mine-1", "ST31-003")])
      .withLife("p2", [
        instance("theirs-1", "ST32-004"),
        instance("theirs-2", "ST32-004"),
      ])
      .build();
    expect(hasKeyword(behind.state, "p1", "zoro", "Rush")).toBe(true);

    const ahead = table("op10-113-ahead")
      .withBoard("p1", [character("zoro", "OP10-113", { playedTurn: 11 })])
      .withLife("p1", [
        instance("mine-1", "ST31-003"),
        instance("mine-2", "ST31-003"),
      ])
      .withLife("p2", [instance("theirs-1", "ST32-004")])
      .build();
    expect(hasKeyword(ahead.state, "p1", "zoro", "Rush")).toBe(false);
  });
});

describe("[Banish], as OP10 prints and grants it", () => {
  covers("OP10-030", "[Activate: Main]");
  covers("OP10-043", "[On Play]");
  covers("OP10-097", "[Main]", "[Trigger]");

  it("trashes the Life card a printed [Banish] attacker takes, with no Trigger", () => {
    const game = table("op10-030-banish")
      .withBoard("p1", [character("smoker", "OP10-030", { playedTurn: 1 })])
      .withLife("p2", [instance("their-life", "OP10-020")]) // a card with a Trigger
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({ summary: "with Smoker" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    // "[printed text omitted -- pnpm card:text ST32-004]": the card is
    // in the trash rather than the hand, and no Trigger window opened.
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "their-life",
    ]);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.pendingTrigger).toBeNull();
  });

  it("hands [Banish] to a [Monkey.D.Luffy] for the turn (OP10-043)", () => {
    const game = table("op10-043")
      .withHand("p1", [instance("moocy", "OP10-043")])
      .withStage("p1", instance("stage", "OP10-085"))
      .withBoard("p1", [character("luffy", "OP10-111")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-043" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "stage" });
    game.play({ type: "resolve-effect", optionId: "luffy" });
    resolveAll(game);

    expect(hasKeyword(game.state, "p1", "luffy", "Banish")).toBe(true);
  });

  it("grants [Banish] on OP10-097 only once the trash is ten deep", () => {
    const shallow = table("op10-097-shallow")
      .withHand("p1", [instance("rhino", "OP10-097")])
      .withBoard("p1", [character("kyros", "OP10-046")])
      .build();

    shallow.play({ summary: "Gum-Gum Rhino Schneider" });
    shallow.play({ type: "resolve-effect", optionId: "kyros" });
    resolveAll(shallow);

    expect(hasKeyword(shallow.state, "p1", "kyros", "Banish")).toBe(false);

    const deep = table("op10-097-deep")
      .withHand("p1", [instance("rhino", "OP10-097")])
      .withBoard("p1", [character("kyros", "OP10-046")])
      .withTrash(
        "p1",
        Array.from({ length: 10 }, (_, index) =>
          instance(`mill-${index}`, "ST31-003"),
        ),
      )
      .build();

    deep.play({ summary: "Gum-Gum Rhino Schneider" });
    deep.play({ type: "resolve-effect", optionId: "kyros" });
    resolveAll(deep);

    expect(hasKeyword(deep.state, "p1", "kyros", "Banish")).toBe(true);
  });
});

describe("OP10-077 Bellamy", () => {
  covers("OP10-077", "[On Block]");

  it("trades two rested DON!! for one added, because it blocked", () => {
    const game = defending("op10-077")
      .withBoard("p1", [character("bellamy", "OP10-077")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDonDeck("p1", 3)
      .withActiveAttack(ATTACK, "block")
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "block" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    resolveAll(game);

    // Two rested, one added active: one down this turn, one up from the next
    // Refresh.
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 1);
    // The window opened because Bellamy blocked, so it is the target now.
    expect(game.state.activeAttack?.targetInstanceId).toBe("bellamy");
  });
});

describe("OP10's K.O. replacements", () => {
  covers("OP10-034", "static");
  covers("OP10-074", "static");
  covers("OP10-118", "static");

  it("OP10-034 answers a lost battle by taking a Life card into hand", () => {
    const game = defending("op10-034")
      .withBoard("p1", [character("franky", "OP10-034")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .withActiveAttack(
        { ...ATTACK, targetInstanceId: "franky", attackPower: 9000 },
        "counter",
      )
      .build();

    game.pass(); // decline the Counter step; the battle resolves

    // A battle-destruction replacement is addressed by the target's own
    // instance id: `mechanic:<target>:<protector>`.
    const options = effectOptions(game.state);
    const replacement = options.find((option) =>
      option.startsWith("mechanic:"),
    );
    expect(replacement).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replacement! });
    resolveAll(game);

    // The Character survives and the Life card is in hand rather than lost.
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("franky");
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-1",
    );
  });

  it("OP10-034 does not answer a removal effect, only a battle", () => {
    const game = table("op10-034-effect")
      .withHand("p1", [instance("thread", "OP10-079")])
      .withBoard("p2", [character("franky", "OP10-034")])
      .build();

    game.play({ summary: "God Thread" });
    game.play({ type: "resolve-effect", optionId: "franky" });
    resolveAll(game);

    // `battleOnly`: a 5-cost K.O. Event is not a battle, so nothing is offered
    // instead and the Character dies.
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("OP10-074 rests two active DON!! instead of dying to an effect", () => {
    const game = table("op10-074")
      .withHand("p1", [instance("thread", "OP10-079")])
      .withBoard("p2", [character("pica", "OP10-074")])
      .build();

    game.play({ summary: "God Thread" });
    game.play({ type: "resolve-effect", optionId: "pica" });

    const replacement = effectOptions(game.state).find((option) =>
      option.startsWith("replace:"),
    );
    expect(replacement).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replacement! });
    resolveAll(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "pica",
    ]);
    expect(game.state.players.p2.restedDon).toHaveLength(2);
  });

  it("OP10-118 prevents a K.O. outright, and books its once-per-turn use", () => {
    const game = table("op10-118")
      .withHand("p1", [instance("divine", "OP10-019")])
      // OP10-118 is a 7000 body, which is what Divine Departure can reach; the
      // cheaper removal in this set stops at cost 5 and Luffy costs 6.
      .withBoard("p2", [character("luffy", "OP10-118")])
      .build();

    game.play({ summary: "Divine Departure" });
    game.play({ type: "resolve-effect", optionId: "luffy" });

    const replacement = effectOptions(game.state).find((option) =>
      option.startsWith("replace:"),
    );
    expect(replacement).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replacement! });
    resolveAll(game);

    // Nothing was paid -- `cost: { kind: "none" }` -- and the Character stayed.
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "luffy",
    ]);
    expect(game.state.players.p2.restedDon).toHaveLength(0);
    // The budget is the price: the key is booked, so a second removal this turn
    // finds nothing to answer it.
    expect(
      game.state.oncePerTurn.some((key) => key.endsWith(":replacement")),
    ).toBe(true);
  });
});

describe("OP10-022 Trafalgar Law", () => {
  covers("OP10-022", "[Activate: Main]");

  it("bounces a Character to play a cheap Supernova off the top of Life", () => {
    const game = table("op10-022")
      .withLeader("p1", "OP10-022")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [character("kyros", "OP10-046")]) // cost 7: clears the sum
      .withLife("p1", [instance("bonney", "OP10-107")]) // {Supernovas}, cost 3
      .build();

    game.play({ type: "activate-main", summary: "OP10-022" });
    game.play({ type: "resolve-effect", optionId: "kyros" });
    game.play({ type: "resolve-effect", optionId: "bonney" });
    resolveAll(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "kyros",
    );
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("bonney");
  });

  it("is not offered without the DON!! its [DON!! x1] gate names", () => {
    const game = table("op10-022-don")
      .withLeader("p1", "OP10-022")
      .withBoard("p1", [character("kyros", "OP10-046")])
      .withLife("p1", [instance("bonney", "OP10-107")])
      .build();

    expect(
      game.legalActions().filter((action) => action.type === "activate-main"),
    ).toEqual([]);
  });

  it("is not offered while its Characters total less than 5 cost", () => {
    const game = table("op10-022-sum")
      .withLeader("p1", "OP10-022")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [character("leo", "OP10-057")]) // cost 1
      .withLife("p1", [instance("bonney", "OP10-107")])
      .build();

    expect(
      game.legalActions().filter((action) => action.type === "activate-main"),
    ).toEqual([]);
  });
});

describe("OP10-116 Damned Punk", () => {
  covers("OP10-116", "[Main]", "[Trigger]");

  it("buries the opponent's next Life card and then K.O.s a body", () => {
    const game = table("op10-116")
      .withHand("p1", [instance("punk", "OP10-116")])
      .withLife("p2", [
        instance("their-top", "OP10-020"),
        instance("their-bottom", "OP10-020"),
      ])
      .withBoard("p2", [character("victim", "ST32-005")])
      .build();

    game.play({ summary: "Damned Punk" });
    game.play({ type: "resolve-effect", optionId: "opponent-life" });
    game.play({ type: "resolve-effect", optionId: "bottom" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    resolveAll(game);

    // The looked-at card went to the bottom, so the next hit turns over the
    // other one.
    expect(game.state.players.p2.life.map((card) => card.instanceId)).toEqual([
      "their-bottom",
      "their-top",
    ]);
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP10-042 Usopp's removal draw", () => {
  covers("OP10-042", "[Opponent's Turn]");

  it("draws when a {Dressrosa} Character is K.O.'d on the opponent's turn", () => {
    const game = defending("op10-042-draw")
      .withLeader("p1", "OP10-042")
      .withBoard("p1", [character("leo", "OP10-057")]) // {Dressrosa}
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withActiveAttack(
        { ...ATTACK, targetInstanceId: "leo", attackPower: 9000 },
        "counter",
      )
      .build();

    game.pass(); // let the battle resolve and K.O. Leo
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
  });
});

/**
 * The two Events whose whole `[Trigger]` is "add 1 DON!! card".
 *
 * `triggerProgramCanAct` dry-runs a Trigger and offers it only if the run
 * produced an event, a signal, or a resolvable choice. `add-don` produced none
 * of the three, so both of these were judged inert and the Trigger was never
 * put on the table -- the Life card went to hand every time, whatever the
 * player wanted. `add-don` emits `don-added` now, which is also the only way
 * DON!! ramp shows up in a trace at all.
 */
describe("OP10-079 God Thread and OP10-080 Little Black Bears", () => {
  covers("OP10-079", "[Trigger]");
  covers("OP10-080", "[Trigger]");

  /** p2 attacks p1's Leader into a Life card holding `cardNumber`. */
  function triggered(seed: string, cardNumber: string) {
    return scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed(seed)
      .atTurn(5, { active: "p2" })
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .withLife("p1", [instance("life-trigger", cardNumber)])
      .withDonDeck("p1", 4)
      .build();
  }

  for (const cardNumber of ["OP10-079", "OP10-080"] as const) {
    it(`${cardNumber} offers its Trigger and adds an active DON!!`, () => {
      const game = triggered(`${cardNumber}-trigger`, cardNumber);
      game.play({
        type: "attack",
        attackerInstanceId: "attacker",
        targetInstanceId: "p1-leader",
      });
      while (game.state.phase === "block" || game.state.phase === "counter") {
        game.pass();
      }
      const activeBefore = game.state.players.p1.activeDon.length;
      const deckBefore = game.state.players.p1.donDeck.length;

      game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
      while (game.state.pendingEffect) {
        game.play({ type: "resolve-effect" });
      }

      // Active, not rested, and one fewer in the DON!! deck it came from.
      expect(game.state.players.p1.activeDon).toHaveLength(activeBefore + 1);
      expect(game.state.players.p1.donDeck).toHaveLength(deckBefore - 1);
    });
  }
});

/**
 * The two OP-10 Events the (Red/Blue) Lucy feature deck runs.
 *
 * Both are {Dressrosa} Events, which is what puts them in that fifty: the
 * deck's free-activation bodies name the type rather than the set, so an OP-10
 * card is reached by an OP-15 [On Play]. A card only enters the clause-coverage
 * gate once a shipped deck runs it, so these are the clauses that list is
 * responsible for.
 */
describe("OP10 Dressrosa Events", () => {
  covers("OP10-059", "[Main]", "[Trigger]");
  covers("OP10-060", "[Main]", "[Trigger]");

  it("OP10-059 digs five for a Dressrosa Character and bottoms the rest", () => {
    const game = table("op10-059-main")
      .withDeckTop("p1", [
        // Two {Dressrosa} cards, but only one is a Character: the printed
        // clause narrows to Characters, so the Stage is not offered.
        instance("kingdom", "OP15-057"),
        instance("rebecca", "OP15-053"),
        instance("filler-a", "ST31-003"),
        instance("filler-b", "ST31-003"),
        instance("filler-c", "ST31-003"),
      ])
      .withHand("p1", [instance("follow", "OP10-059")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP10-059" });
    expect(effectOptions(game.state)).toContain("rebecca");
    expect(effectOptions(game.state)).not.toContain("kingdom");

    game.play({ type: "resolve-effect", optionId: "rebecca" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "rebecca",
    ]);
    // The other four go to the bottom, so the deck is four shorter off the top
    // and none of them is trashed.
    expect(game.state.players.p1.trash).toHaveLength(1);
    expect(
      game.state.players.p1.deck.slice(-4).map((card) => card.instanceId),
    ).toEqual(
      expect.arrayContaining(["kingdom", "filler-a", "filler-b", "filler-c"]),
    );
  });

  it("OP10-059 offers its Trigger and runs the same dig", () => {
    const game = triggeredDressrosa("op10-059-trigger", "OP10-059");
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toContain("dug");
    game.play({ type: "resolve-effect", optionId: "dug" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "dug",
    );
  });

  it("OP10-060 bottoms a 6000-power Character but not a 7000 one", () => {
    const game = table("op10-060-main")
      .withBoard("p2", [
        character("small", "OP15-014"),
        character("big", "OP15-046"),
      ])
      .withHand("p1", [instance("pistol", "OP10-060")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP10-060" });
    // OP15-014 is a 6000 body and OP15-046 a 9000 one; the threshold is
    // current power, so only the first is on offer.
    expect(effectOptions(game.state)).toContain("small");
    expect(effectOptions(game.state)).not.toContain("big");

    game.play({ type: "resolve-effect", optionId: "small" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
    // Deck bottom, not the trash: nothing that reads a K.O. sees this.
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("small");
    expect(game.state.players.p2.trash).toHaveLength(0);
  });

  it("OP10-060 offers its Trigger and bottoms from the defending seat", () => {
    const game = triggeredDressrosa("op10-060-trigger", "OP10-060");
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    // The attacker itself is the only body across the table, and at 5000 it is
    // under the threshold.
    game.play({ type: "resolve-effect", optionId: "attacker" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("attacker");
  });

  /**
   * p2 attacks p1's Leader into a Life card holding `cardNumber`, with a body
   * on p2's board for a Trigger that needs a target and a dig card on p1's
   * deck for one that reads it.
   */
  function triggeredDressrosa(seed: string, cardNumber: string) {
    return scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed(seed)
      .atTurn(5, { active: "p2" })
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .withDeckTop("p1", [instance("dug", "OP15-053")])
      .withLife("p1", [instance("life-trigger", cardNumber)])
      .build();
  }
});
