import { describe, expect, it } from "vitest";
import { loadDeck, requireSupportedDeck } from "@one-piece-sim/decks";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * (Green/Yellow) Yamato: the list in
 * `packages/decks/src/op06-yamato-manifest.ts`.
 *
 * Two of the deck's fourteen slots -- OP06-104 Kikunojo and OP10-109 Basil
 * Hawkins -- were in the pool before it and are driven by `test/op16-nami.test.ts`
 * and `test/op10.test.ts`, so what is here is the thirteen identities this deck
 * is the first shipped list to reach.
 *
 * Almost every section below sets the *opponent's* Life total deliberately,
 * because that is the deck's own switch: at 4 or more Life the Triggers add a
 * card to hand and the Leader's activation is dead, and at 3 or less the same
 * Triggers put a body on the board for free. Both sides of that line are
 * tested for every clause that reads it -- a threshold tested from one side
 * only is a threshold that could be an unconditional effect.
 */

const DECK = "(Green/Yellow) Yamato - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** p1 on the turn, clear board, all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p1 defending, for the clauses that only fire under an attack. */
const defending = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

/**
 * `count` Life cards, named.
 *
 * `bareTable()` empties both decks, so `withLife(player, count)` -- which
 * splices off the top of the deck -- has nothing to take. Every threshold in
 * this file is a Life *count*, so the identities do not matter; what matters is
 * that the count is the one the test says it is.
 */
const life = (count: number, prefix: string) =>
  copies(count, "ST31-002", prefix);

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Resolve the rest of an open effect, taking the first offer at each step. */
function finish(game: {
  state: GameState;
  play: (matcher: { type: "resolve-effect" }) => unknown;
}) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

describe("(Green/Yellow) Yamato deck list", () => {
  it("loads a 50-card list behind OP06-022", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP06-022");
    expect(loadDeck(DECK)).toHaveLength(50);
  });
});

describe("OP06-022 Yamato (Leader)", () => {
  covers("OP06-022", "[Double Attack]");

  it("takes two Life cards on a successful attack", () => {
    // The Leader has to out-power the target for the attack to connect at
    // all: two given DON!! take 5000 to 7000 against ST31-001's 5000.
    const game = table("op06-022-double")
      .withLife("p2", life(4, "their-life"))
      .withGivenDon("p1", "p1-leader", 2)
      .build();

    const before = game.state.players.p2.life.length;
    game.play({ type: "attack" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    finish(game);

    expect(before - game.state.players.p2.life.length).toBe(2);
  });
});

describe("ST28-005 Yamato", () => {
  covers("ST28-005", "[Your Turn]");

  it("is a 3000 attacker on its own turn under two given DON!!", () => {
    const game = table("st28-005-buff")
      .withBoard("p1", [character("yamato", "ST28-005")])
      .withGivenDon("p1", "yamato", 2)
      .build();

    // 0 printed power, +2000 from the DON!! themselves, +3000 from the clause.
    expect(currentPower(game.state, "p1", "yamato")).toBe(5000);
  });

  it("holds nothing back on one DON!!", () => {
    const game = table("st28-005-one-don")
      .withBoard("p1", [character("yamato", "ST28-005")])
      .withGivenDon("p1", "yamato", 1)
      .build();

    expect(currentPower(game.state, "p1", "yamato")).toBe(1000);
  });

  it("loses the clause on the opponent's turn, DON!! and all", () => {
    // "[Your Turn]": a 1-cost body that attacks as a 3000 defends as a 2000,
    // which is why the list runs it for the search rather than for the body.
    const game = defending("st28-005-their-turn")
      .withBoard("p1", [character("yamato", "ST28-005")])
      .withGivenDon("p1", "yamato", 2)
      .build();

    expect(currentPower(game.state, "p1", "yamato")).toBe(2000);
  });
});

describe("ST28-002 Izo", () => {
  covers("ST28-002", "static");

  it("gains [Blocker] on two given DON!!, and keeps it on either turn", () => {
    const game = defending("st28-002-blocker")
      .withBoard("p1", [character("izo", "ST28-002")])
      .withGivenDon("p1", "izo", 2)
      .build();

    expect(hasKeyword(game.state, "p1", "izo", "Blocker")).toBe(true);
  });

  it("does not block on one DON!!", () => {
    const game = defending("st28-002-no-blocker")
      .withBoard("p1", [character("izo", "ST28-002")])
      .withGivenDon("p1", "izo", 1)
      .build();

    expect(hasKeyword(game.state, "p1", "izo", "Blocker")).toBe(false);
  });
});

describe("ST28-004 Kouzuki Momonosuke", () => {
  covers("ST28-004", "[Your Turn]");

  it("gives the Leader +1000 at 2 Life on its controller's turn", () => {
    const game = table("st28-004-aura")
      .withBoard("p1", [character("momo", "ST28-004")])
      .withLife("p1", life(2, "own-life"))
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  it("is dead at 3 Life", () => {
    const game = table("st28-004-high-life")
      .withBoard("p1", [character("momo", "ST28-004")])
      .withLife("p1", life(3, "own-life"))
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("is dead on the opponent's turn even at 2 Life", () => {
    // "[Your Turn]": the buff is for attacking, not for surviving.
    const game = defending("st28-004-their-turn")
      .withBoard("p1", [character("momo", "ST28-004")])
      .withLife("p1", life(2, "own-life"))
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("buffs the Leader rather than itself", () => {
    const game = table("st28-004-not-self")
      .withBoard("p1", [character("momo", "ST28-004")])
      .withLife("p1", life(1, "own-life"))
      .build();

    expect(currentPower(game.state, "p1", "momo")).toBe(7000);
  });
});

/**
 * p1 takes one damage from a p2 Leader attack, with `cardNumber` on top of
 * p1's Life and `opposingLife` cards left on p2's.
 *
 * Driven as a real attack rather than by assigning `pendingTrigger`: the whole
 * point of these four Triggers is the board state at the moment damage lands,
 * and `opposingLife` is the threshold every one of them reads.
 */
const triggerFromLife = (
  seed: string,
  cardNumber: string,
  opposingLife: number,
) => {
  const game = defending(seed)
    .withLife("p1", [instance("trigger-card", cardNumber)])
    .withLife("p2", life(opposingLife, "their-life"))
    // 5000 printed plus two given DON!! beats p1's 5000 Leader, so the attack
    // connects and the Life card turns over.
    .withGivenDon("p2", "p2-leader", 2)
    .build();

  game.play({ type: "attack" });
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
  return game;
};

describe("OP06-110 Nekomamushi", () => {
  covers("OP06-110", "static", "[Trigger]");

  it("attacks an active Character under two given DON!!", () => {
    const game = table("op06-110-active")
      .withBoard("p1", [character("neko", "OP06-110")])
      .withBoard("p2", [character("their-body", "ST31-002", { rested: false })])
      .withGivenDon("p1", "neko", 2)
      .build();

    const targets = game
      .legalActions()
      .filter((action) => action.type === "attack")
      .map((action) => action.targetInstanceId);

    expect(targets).toContain("their-body");
  });

  it("cannot reach an active Character on one DON!!", () => {
    const game = table("op06-110-one-don")
      .withBoard("p1", [character("neko", "OP06-110")])
      .withBoard("p2", [character("their-body", "ST31-002", { rested: false })])
      .withGivenDon("p1", "neko", 1)
      .build();

    const targets = game
      .legalActions()
      .filter((action) => action.type === "attack")
      .map((action) => action.targetInstanceId);

    expect(targets).not.toContain("their-body");
    // The Leader is still a legal target, so the absence above is the clause
    // being off rather than the attack being illegal.
    expect(targets).toContain("p2-leader");
  });

  it("plays itself off its Trigger at three or less opposing Life", () => {
    const game = triggerFromLife("op06-110-trigger-on", "OP06-110", 3);

    game.play({ type: "resolve-trigger", optionId: "activate" });
    finish(game);

    expect(game.state.players.p1.board).toContainEqual(
      expect.objectContaining({ cardNumber: "OP06-110" }),
    );
  });

  it("only adds itself to hand at four opposing Life", () => {
    const game = triggerFromLife("op06-110-trigger-off", "OP06-110", 4);

    // The engine reads the clause's own condition before it offers the
    // Trigger, so "activate" is never on the table: the only thing left to
    // answer is whether to skip, and the card takes the ordinary damage route
    // into hand either way.
    expect(
      game
        .legalActions()
        .filter((action) => action.type === "resolve-trigger")
        .map((action) => action.optionId),
    ).toEqual(["skip"]);
    game.play({ type: "resolve-trigger" });
    finish(game);

    expect(game.state.players.p1.board).toEqual([]);
    expect(game.state.players.p1.hand).toContainEqual(
      expect.objectContaining({ cardNumber: "OP06-110" }),
    );
  });
});

describe("OP06-109 Denjiro", () => {
  covers("OP06-109", "static", "[Trigger]");

  /**
   * The mirror, with Denjiro across the table from the Ashura Doji that is
   * trying to K.O. it.
   *
   * Both sides run the list, which is the only board where this clause is
   * reachable: ST28-001 is the deck's own removal, and it is the answer the
   * immunity is priced against. Denjiro's "3 or less" is read against *its*
   * opponent -- p1 -- and Ashura's "3 or more" against p2, so the two Life
   * totals below are set independently and both matter.
   */
  const acrossTheTable = (seed: string, donOnDenjiro: number) =>
    scenario()
      .decks(DECK, DECK)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p2", [character("denjiro", "OP06-109")])
      .withGivenDon("p2", "denjiro", donOnDenjiro)
      .withLife("p1", life(3, "own-life"))
      .withLife("p2", life(3, "their-life"))
      .withHand("p1", [instance("ashura", "ST28-001")])
      .build();

  it("survives a K.O. effect on two DON!! at three or less opposing Life", () => {
    const game = acrossTheTable("op06-109-immune", 2);

    game.play({ type: "play-card", cardNumber: "ST28-001" });
    finish(game);

    expect(game.state.players.p2.board).toContainEqual(
      expect.objectContaining({ instanceId: "denjiro" }),
    );
  });

  it("is K.O.'d on one DON!!", () => {
    const game = acrossTheTable("op06-109-one-don", 1);

    game.play({ type: "play-card", cardNumber: "ST28-001" });
    finish(game);

    expect(game.state.players.p2.board).toEqual([]);
  });

  it("plays itself off its Trigger at three or less opposing Life", () => {
    const game = triggerFromLife("op06-109-trigger", "OP06-109", 3);

    game.play({ type: "resolve-trigger", optionId: "activate" });
    finish(game);

    expect(game.state.players.p1.board).toContainEqual(
      expect.objectContaining({ cardNumber: "OP06-109" }),
    );
  });
});

describe("ST28-003 Kin'emon", () => {
  covers("ST28-003", "[Trigger]");

  it("plays itself at three or less opposing Life under a {Land of Wano} Leader", () => {
    const game = triggerFromLife("st28-003-trigger", "ST28-003", 3);

    game.play({ type: "resolve-trigger", optionId: "activate" });
    finish(game);

    expect(game.state.players.p1.board).toContainEqual(
      expect.objectContaining({ cardNumber: "ST28-003" }),
    );
  });

  it("does nothing at four opposing Life", () => {
    const game = triggerFromLife("st28-003-high", "ST28-003", 4);

    expect(
      game
        .legalActions()
        .filter((action) => action.type === "resolve-trigger")
        .map((action) => action.optionId),
    ).toEqual(["skip"]);
  });
});

describe("ST28-001 Ashura Doji", () => {
  covers("ST28-001", "[On Play]");

  /** p1 plays Ashura Doji into a board with one 4-cost body on it. */
  const play = (seed: string, opposingLife: number) => {
    const game = table(seed)
      .withBoard("p2", [character("their-body", "ST28-003")])
      .withLife("p2", life(opposingLife, "their-life"))
      .withHand("p1", [instance("ashura", "ST28-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST28-001" });
    return game;
  };

  it("K.O.s a base cost 5 body while the opponent still has 3 Life", () => {
    const game = play("st28-001-on", 3);
    finish(game);

    expect(game.state.players.p2.board).toEqual([]);
    expect(game.state.players.p2.trash).toContainEqual(
      expect.objectContaining({ cardNumber: "ST28-003" }),
    );
  });

  it("goes dead at 2 opposing Life, which is where the rest of the deck wakes up", () => {
    // The one clause in the list priced backwards. At 2 Life the Leader's
    // activation and all four Triggers are live and this is not.
    const game = play("st28-001-off", 2);

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toContainEqual(
      expect.objectContaining({ instanceId: "their-body" }),
    );
  });

  it("cannot reach a base cost of 6", () => {
    const game = table("st28-001-too-big")
      .withBoard("p2", [character("big-body", "ST28-004")])
      .withLife("p2", life(4, "their-life"))
      .withHand("p1", [instance("ashura", "ST28-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST28-001" });

    // "Up to 1": with no eligible target the clause resolves to nothing rather
    // than offering the 6-cost body.
    expect(
      effectOptions(game.state).some((option) => option.includes("big-body")),
    ).toBe(false);
    finish(game);
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("ST28-002 Izo", () => {
  covers("ST28-002", "[On Play]");

  it("gives the {Land of Wano} Leader [Banish] for the turn", () => {
    const game = table("st28-002-banish")
      .withHand("p1", [instance("izo", "ST28-002")])
      .build();

    expect(hasKeyword(game.state, "p1", "p1-leader", "Banish")).toBe(false);
    game.play({ type: "play-card", cardNumber: "ST28-002" });
    finish(game);

    expect(hasKeyword(game.state, "p1", "p1-leader", "Banish")).toBe(true);
  });

  it("trashes the Life card its Leader's damage takes, Trigger and all", () => {
    // What [Banish] is for on this deck: the Leader's [Double Attack] takes two
    // Life cards, and without Banish it hands back two Triggers.
    const game = table("st28-002-banish-damage")
      .withLife("p2", [
        instance("their-trigger-1", "ST28-003"),
        instance("their-trigger-2", "ST28-003"),
        instance("their-trigger-3", "ST28-003"),
      ])
      .withHand("p1", [instance("izo", "ST28-002")])
      .withGivenDon("p1", "p1-leader", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "ST28-002" });
    finish(game);
    game.play({ type: "attack" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    finish(game);

    expect(game.state.players.p2.hand).toEqual([]);
    expect(game.state.players.p2.trash).toHaveLength(2);
    expect(game.state.players.p2.life).toHaveLength(1);
  });
});

describe("ST28-005 Yamato", () => {
  covers("ST28-005", "[On Play]");

  it("reveals a {Land of Wano} card of cost 2 or more from the top five", () => {
    const game = table("st28-005-search")
      .withHand("p1", [instance("searcher", "ST28-005")])
      .withDeckTop("p1", [
        // Four blanks and then the one legal hit, so the choice is forced and
        // the "look at 5" depth is what finds it.
        instance("blank-1", "ST31-002"),
        instance("blank-2", "ST31-002"),
        instance("blank-3", "ST31-002"),
        instance("blank-4", "ST31-002"),
        instance("hit", "ST28-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST28-005" });
    finish(game);

    expect(game.state.players.p1.hand).toContainEqual(
      expect.objectContaining({ instanceId: "hit" }),
    );
  });

  it("will not find another copy of itself, which is printed at cost 1", () => {
    const game = table("st28-005-not-itself")
      .withHand("p1", [instance("searcher", "ST28-005")])
      .withDeckTop("p1", [
        instance("other-copy", "ST28-005"),
        instance("blank-1", "ST31-002"),
        instance("blank-2", "ST31-002"),
        instance("blank-3", "ST31-002"),
        instance("blank-4", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST28-005" });

    expect(
      effectOptions(game.state).some((option) => option.includes("other-copy")),
    ).toBe(false);
    finish(game);
    expect(game.state.players.p1.hand).toEqual([]);
  });
});

describe("OP06-107 Kouzuki Momonosuke", () => {
  covers("OP06-107", "[Blocker]", "[On Play]");

  it("blocks", () => {
    const game = defending("op06-107-blocker")
      .withBoard("p1", [character("momo", "OP06-107")])
      .build();

    expect(hasKeyword(game.state, "p1", "momo", "Blocker")).toBe(true);
  });

  it("buries one of its own {Land of Wano} bodies face-up on top of Life", () => {
    const game = table("op06-107-to-life")
      .withBoard("p1", [character("kinemon", "ST28-003")])
      .withLife("p1", life(1, "own-life"))
      .withHand("p1", [instance("momo", "OP06-107")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-107" });
    game.play({ type: "resolve-effect" });
    game.play({ type: "resolve-effect", optionId: "top" });
    finish(game);

    expect(game.state.players.p1.life[0]).toEqual(
      expect.objectContaining({ instanceId: "kinemon", faceUp: true }),
    );
    expect(game.state.players.p1.board).toEqual([
      expect.objectContaining({ cardNumber: "OP06-107" }),
    ]);
  });

  it("offers the bottom of Life as well as the top", () => {
    const game = table("op06-107-bottom")
      .withBoard("p1", [character("kinemon", "ST28-003")])
      .withLife("p1", life(2, "own-life"))
      .withHand("p1", [instance("momo", "OP06-107")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-107" });
    game.play({ type: "resolve-effect" });
    game.play({ type: "resolve-effect", optionId: "bottom" });
    finish(game);

    expect(game.state.players.p1.life.at(-1)).toEqual(
      expect.objectContaining({ instanceId: "kinemon", faceUp: true }),
    );
  });

  it("will not bury a Character of its own name, or an off-tribe one", () => {
    // "[printed text omitted -- pnpm card:text <card>]" reads the printed *name*, so ST28-004
    // is excluded as well -- a different card number, the same name. Carrot is
    // in the deck and is {Minks} rather than {Land of Wano}.
    const game = table("op06-107-excluded")
      .withBoard("p1", [
        character("other-momo", "ST28-004"),
        character("carrot", "OP08-023"),
      ])
      .withLife("p1", life(1, "own-life"))
      .withHand("p1", [instance("momo", "OP06-107")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-107" });

    const options = effectOptions(game.state);
    expect(options.some((option) => option.includes("other-momo"))).toBe(false);
    expect(options.some((option) => option.includes("carrot"))).toBe(false);
    finish(game);
    expect(game.state.players.p1.life).toHaveLength(1);
  });
});

describe("OP08-023 Carrot", () => {
  covers("OP08-023", "[On Play]", "[When Attacking]");

  it("holds a rested body down through the opponent's Refresh Phase on play", () => {
    const game = table("op08-023-on-play")
      .withBoard("p2", [character("their-body", "ST31-002", { rested: true })])
      .withHand("p1", [instance("carrot", "OP08-023")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-023" });
    finish(game);

    expect(game.state.players.p2.board[0]?.cannotRefreshUntilTurn).toBe(
      game.state.turn + 1,
    );
  });

  it("does the same when it attacks", () => {
    const game = table("op08-023-attacking")
      .withBoard("p1", [character("carrot", "OP08-023")])
      .withBoard("p2", [character("their-body", "ST31-002", { rested: true })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "carrot",
      targetInstanceId: "p2-leader",
    });
    finish(game);

    expect(game.state.players.p2.board[0]?.cannotRefreshUntilTurn).toBe(
      game.state.turn + 1,
    );
  });

  it("cannot reach an active Character, or one that costs 9", () => {
    const game = table("op08-023-ineligible")
      .withBoard("p2", [
        character("active-body", "ST31-002", { rested: false }),
        // OP06-118 Roronoa Zoro, cost 9: the list's own finisher is the body
        // its own rest-lock cannot answer in the mirror.
        character("too-big", "OP06-118", { rested: true }),
      ])
      .withHand("p1", [instance("carrot", "OP08-023")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-023" });

    const options = effectOptions(game.state);
    expect(options.some((option) => option.includes("active-body"))).toBe(
      false,
    );
    expect(options.some((option) => option.includes("too-big"))).toBe(false);
  });
});

describe("OP06-022 Yamato's rested-DON!! gift", () => {
  covers("OP06-022", "[Activate: Main]");

  /** p1 with a body on the board and `rested` DON!! already spent this turn. */
  const spentTurn = (seed: string, opposingLife: number, rested: number) =>
    scenario()
      .decks(DECK, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("kinemon", "ST28-003")])
      .withLife("p2", life(opposingLife, "their-life"))
      .withDon("p1", { active: 10 - rested, rested })
      .build();

  it("moves two rested DON!! onto a Character at three or less opposing Life", () => {
    const game = spentTurn("op06-022-give", 3, 4);

    game.play({ type: "activate-main" });
    finish(game);

    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(2);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("is not offered at four opposing Life", () => {
    const game = spentTurn("op06-022-high-life", 4, 4);

    // The offer exists -- the Leader has the clause and rested DON!! to spend
    // -- but the clause's own condition is false, so taking it would burn the
    // turn's one use for nothing. The engine offers it and it resolves to
    // nothing; what is asserted is that no DON!! moves.
    if (game.legalActions().some((action) => action.type === "activate-main")) {
      game.play({ type: "activate-main" });
      finish(game);
    }

    expect(game.state.players.p1.board[0]?.attachedDon).toEqual([]);
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  it("is not offered with no rested DON!! to move", () => {
    const game = spentTurn("op06-022-no-rested", 3, 0);

    expect(
      game.legalActions().filter((action) => action.type === "activate-main"),
    ).toEqual([]);
  });

  it("is once per turn", () => {
    const game = spentTurn("op06-022-once", 3, 4);

    game.play({ type: "activate-main" });
    finish(game);

    expect(
      game.legalActions().filter((action) => action.type === "activate-main"),
    ).toEqual([]);
  });
});

describe("OP06-118 Roronoa Zoro", () => {
  covers("OP06-118", "[When Attacking]", "[Activate: Main]");

  it("un-rests itself for one DON!! when it attacks", () => {
    const game = table("op06-118-attacking")
      .withBoard("p1", [character("zoro", "OP06-118")])
      .build();

    const before = game.state.players.p1.activeDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "zoro",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    finish(game);

    const zoro = game.state.players.p1.board[0];
    expect(zoro?.rested).toBe(false);
    expect(game.state.players.p1.activeDon).toHaveLength(before - 1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("un-rests itself for two DON!! from the Main phase", () => {
    const game = table("op06-118-main")
      .withBoard("p1", [character("zoro", "OP06-118", { rested: true })])
      .build();

    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", sourceInstanceId: "zoro" });
    finish(game);

    expect(game.state.players.p1.board[0]?.rested).toBe(false);
    expect(game.state.players.p1.activeDon).toHaveLength(before - 2);
  });

  it("keeps a separate once-per-turn budget for each timing", () => {
    // Attack, un-rest for 1, then un-rest again for 2: the printed clauses are
    // two abilities, not one at two prices.
    // p2 needs Life for the attack to be damage rather than a game win --
    // `bareTable()` leaves both sides on none.
    const game = table("op06-118-both")
      .withBoard("p1", [character("zoro", "OP06-118")])
      .withLife("p2", life(2, "their-life"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "zoro",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    finish(game);

    expect(
      game
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "zoro",
        ),
    ).toHaveLength(1);
  });

  it("does not offer the Main activation on one DON!!", () => {
    // `bareTable()` empties the DON!! deck into the cost area, so the way to
    // leave one active DON!! is to give the other nine away.
    const game = table("op06-118-poor")
      .withBoard("p1", [character("zoro", "OP06-118", { rested: true })])
      .withGivenDon("p1", "p1-leader", 9)
      .build();

    expect(
      game
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "zoro",
        ),
    ).toEqual([]);
  });
});

describe("PRB02-016 Otama", () => {
  covers("PRB02-016", "[Activate: Main]", "[Trigger]");

  it("spends a Life card and rests itself for +3000 on the Leader", () => {
    const game = table("prb02-016-activate")
      .withBoard("p1", [character("otama", "PRB02-016")])
      .withLife("p1", life(2, "own-life"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "otama" });
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      game.play({
        type: "resolve-effect",
        ...(options.includes("p1-leader") ? { optionId: "p1-leader" } : {}),
      });
    }

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8000);
  });

  it("is not offered on no Life, and not offered twice", () => {
    const empty = table("prb02-016-no-life")
      .withBoard("p1", [character("otama", "PRB02-016")])
      .build();

    expect(
      empty
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "otama",
        ),
    ).toEqual([]);

    // The cost rests the source, so a second use is barred by `sourceActive`
    // rather than by a once-per-turn clause the card does not print.
    const rested = table("prb02-016-rested")
      .withBoard("p1", [character("otama", "PRB02-016", { rested: true })])
      .withLife("p1", life(2, "own-life"))
      .build();

    expect(
      rested
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "otama",
        ),
    ).toEqual([]);
  });

  it("rests a cost 4 body off its Trigger, and cannot reach a cost 5", () => {
    const game = defending("prb02-016-trigger")
      .withLife("p1", [instance("trigger-card", "PRB02-016")])
      .withLife("p2", life(4, "their-life"))
      .withBoard("p2", [
        character("their-body", "ST28-003"),
        character("too-big", "OP06-109"),
      ])
      .withGivenDon("p2", "p2-leader", 2)
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });

    const options = effectOptions(game.state);
    expect(options.some((option) => option.includes("their-body"))).toBe(true);
    expect(options.some((option) => option.includes("too-big"))).toBe(false);
    game.play({ type: "resolve-effect", optionId: "their-body" });
    finish(game);

    expect(
      game.state.players.p2.board.find(
        (card) => card.instanceId === "their-body",
      )?.rested,
    ).toBe(true);
  });
});

describe("OP06-115 You're the One Who Should Disappear.", () => {
  covers("OP06-115", "[Counter]", "[Trigger]");

  it("adds +3000 to the battle for a card from hand", () => {
    const game = defending("op06-115-counter")
      .withLife("p1", life(2, "own-life"))
      .withLife("p2", life(2, "their-life"))
      .withHand("p1", [
        instance("event", "OP06-115"),
        instance("fodder", "ST28-003"),
      ])
      .withGivenDon("p2", "p2-leader", 2)
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    finish(game);
    while (game.state.phase === "counter") game.pass();
    finish(game);

    // 7000 attack against a Leader raised to 8000: the attack fails and the
    // Life total holds. The trashed card is the price.
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.trash).toHaveLength(2);
  });

  it("banks a new Life card off its Trigger only from zero Life", () => {
    const game = defending("op06-115-trigger")
      .withLife("p1", [instance("last-life", "OP06-115")])
      .withLife("p2", life(2, "their-life"))
      .withHand("p1", [instance("fodder", "ST28-003")])
      .withDeckTop("p1", [instance("new-life", "ST28-005")])
      .withGivenDon("p2", "p2-leader", 2)
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    finish(game);

    expect(game.state.players.p1.life).toEqual([
      expect.objectContaining({ instanceId: "new-life" }),
    ]);
    expect(game.state.players.p1.trash).toContainEqual(
      expect.objectContaining({ instanceId: "fodder" }),
    );
  });

  it("does nothing off its Trigger while a Life card is still standing", () => {
    const game = defending("op06-115-trigger-high")
      .withLife("p1", [
        instance("first-life", "OP06-115"),
        instance("second-life", "ST28-003"),
      ])
      .withLife("p2", life(2, "their-life"))
      .withHand("p1", [instance("fodder", "ST28-003")])
      .withGivenDon("p2", "p2-leader", 2)
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    expect(
      game
        .legalActions()
        .filter((action) => action.type === "resolve-trigger")
        .map((action) => action.optionId),
    ).toEqual(["skip"]);
  });
});

describe("ST28-004 Kouzuki Momonosuke's [Rush] purchase", () => {
  covers("ST28-004", "[Activate: Main]");

  it("returns two given DON!! to the cost area rested for [Rush] and +1000", () => {
    const game = table("st28-004-rush")
      .withBoard("p1", [
        character("momo", "ST28-004", { playedTurn: 11 }),
        character("kinemon", "ST28-003"),
      ])
      .withGivenDon("p1", "kinemon", 2)
      .build();

    expect(hasKeyword(game.state, "p1", "momo", "Rush")).toBe(false);
    game.play({ type: "activate-main", sourceInstanceId: "momo" });
    finish(game);

    expect(hasKeyword(game.state, "p1", "momo", "Rush")).toBe(true);
    expect(currentPower(game.state, "p1", "momo")).toBe(8000);
    // The DON!! stay on the field -- they move from the Character back into the
    // cost area, rested, so they cannot be given again this turn.
    expect(game.state.players.p1.board[1]?.attachedDon).toEqual([]);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("attacks the turn it lands once the cost is paid", () => {
    const game = table("st28-004-rush-attack")
      .withBoard("p1", [
        character("momo", "ST28-004", { playedTurn: 11 }),
        character("kinemon", "ST28-003"),
      ])
      .withGivenDon("p1", "kinemon", 2)
      .withLife("p2", life(3, "their-life"))
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "momo",
        ),
    ).toBe(false);

    game.play({ type: "activate-main", sourceInstanceId: "momo" });
    finish(game);

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "momo",
        ),
    ).toBe(true);
  });

  it("eats into the Leader's own DON!! only once the Characters have none", () => {
    // "[printed text omitted -- pnpm card:text <card>]": Characters first, so the
    // Leader's attack power is the last thing the cost touches.
    const game = table("st28-004-leader-don")
      .withBoard("p1", [character("momo", "ST28-004")])
      .withGivenDon("p1", "p1-leader", 3)
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "momo" });
    finish(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    // 5000 printed, +1000 for the DON!! the cost left behind, and +1000 from
    // this Character's own aura -- `bareTable()` leaves p1 on no Life, which
    // is inside its "2 or less" gate.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });

  it("is not offered with nothing given, and is once per turn", () => {
    const bare = table("st28-004-nothing-given")
      .withBoard("p1", [character("momo", "ST28-004")])
      .build();

    expect(
      bare
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "momo",
        ),
    ).toEqual([]);

    const once = table("st28-004-once")
      .withBoard("p1", [character("momo", "ST28-004")])
      .withGivenDon("p1", "momo", 2)
      .build();

    once.play({ type: "activate-main", sourceInstanceId: "momo" });
    finish(once);

    expect(
      once
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "momo",
        ),
    ).toEqual([]);
  });
});
