import { describe, expect, it } from "vitest";
import { hasCardName } from "@one-piece-sim/cards";
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
  type Game,
} from "./support/index.js";

/**
 * OP-18's Blue Characters and Leader, OP18-041 to OP18-056: the Baroque Works
 * pairs. OP18-043 Banana Gator prints no text and stands in below as a vanilla
 * Baroque Works body; the three Events are in `op18-blue-events.test.ts`.
 *
 * Every position seats two starter decks on a bare table and puts the cards
 * under test in a zone with a `with*` setter, since no shipped list plays
 * them yet. Bodies used for their printed facts alone:
 *  - OP18-043 Banana Gator: vanilla, cost 4, 6000, Baroque Works.
 *  - EB05-044 Ms. Father's Day: cost 2, 2000, Baroque Works, an [On Play] that
 *    asks nothing behind these Leaders.
 *  - OP10-054 Blue Gilly: vanilla {Dressrosa}, cost 3.
 *  - OP10-031 / OP10-089: vanilla cost 5 / cost 6 bodies.
 *  - OP10-050: a vanilla 9000 to attack with.
 *  - FIX-001 / FIX-002: vanilla fixtures with no type the cards read.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase on a bare table, ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 acting, so p1 is the one defending. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Answers each prompt with the first of `preferred` on offer, else the first. */
function settle(game: Game, ...preferred: string[]) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    const options = effectOptions(game.state);
    const pick = preferred.find((id) => options.includes(id));
    game.play(
      pick
        ? { type: "resolve-effect", optionId: pick }
        : { type: "resolve-effect" },
    );
  }
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardIds = (game: Game, player: "p1" | "p2") =>
  ids(game.state.players[player].board);

const playFromHand = (game: Game, cardNumber: string) =>
  game.play({ type: "play-card", cardNumber });

const attack = (game: Game, attacker: string, target: string) =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

/** Declines the Block and Counter steps until the battle resolves. */
function declineDefence(game: Game) {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

/**
 * p2's 9000 swings at `target` on p1's board and p1 lets it through. Only a
 * rested Character can be attacked, so the targets are placed rested.
 */
function koInBattle(game: Game, target: string) {
  attack(game, "attacker", target);
  declineDefence(game);
}

const activateMainOffered = (game: Game, source: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" && action.sourceInstanceId === source,
    );

describe("OP18-041 Ms. All Sunday", () => {
  covers("OP18-041", "static");

  /** p1 behind the Leader, defending against a 9000. */
  const leaderDefends = (seed: string) =>
    defending(seed)
      .withLeader("p1", "OP18-041")
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .withHand("p2", [
        instance("p2-a", "FIX-001"),
        instance("p2-b", "FIX-002"),
      ])
      .withBoard("p2", [character("attacker", "OP10-050")]);

  it("draws, and the opponent discards a card of their choosing, when a 3000+ Baroque Works Character is K.O.'d", () => {
    const game = leaderDefends("op18-041-ko")
      .withBoard("p1", [character("gator", "OP18-043", { rested: true })])
      .build();

    koInBattle(game, "gator");
    expect(game.state.players.p1.trash.map((c) => c.instanceId)).toContain(
      "gator",
    );
    // The discard is the opponent's pick, so it is asked of p2.
    expect(game.state.activePlayer).toBe("p2");
    expect(effectOptions(game.state)).toEqual(["p2-a", "p2-b"]);
    pick(game, "p2-b");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-a"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-b"]);
  });

  it("ignores a Baroque Works Character printed below 3000", () => {
    const game = leaderDefends("op18-041-small")
      .withBoard("p1", [character("fathers-day", "EB05-044", { rested: true })])
      .build();

    koInBattle(game, "fathers-day");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["fathers-day"]);
    expect(game.state.players.p1.hand).toEqual([]);
    expect(game.state.players.p2.hand).toHaveLength(2);
  });

  it("ignores a Character with no Baroque Works type", () => {
    const game = leaderDefends("op18-041-other")
      .withBoard("p1", [character("captain", "FIX-002", { rested: true })])
      .build();

    koInBattle(game, "captain");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["captain"]);
    expect(game.state.players.p1.hand).toEqual([]);
    expect(game.state.players.p2.hand).toHaveLength(2);
  });
});

describe("OP18-042 Hack", () => {
  covers("OP18-042", "[On K.O.]", "[Activate: Main]");

  it("draws a card when K.O.'d", () => {
    const game = defending("op18-042-ko")
      .withDeckTop("p1", copies(2, "FIX-001", "deck"))
      .withBoard("p1", [character("hack", "OP18-042", { rested: true })])
      .withBoard("p2", [character("attacker", "OP10-050")])
      .build();

    koInBattle(game, "hack");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["hack"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
  });

  const hackTable = (seed: string) =>
    table(seed)
      .withBoard("p1", [
        character("hack", "OP18-042"),
        character("gilly", "OP10-054"),
        character("captain", "FIX-002"),
      ])
      .withDon("p1", { rested: 2 });

  it("gives a rested DON!! to a {Dressrosa} Character, once a turn", () => {
    const game = hackTable("op18-042-gift").build();

    game.play({ type: "activate-main", sourceInstanceId: "hack" });
    const options = effectOptions(game.state);
    expect(options).toEqual(expect.arrayContaining(["hack", "gilly"]));
    expect(options).not.toContain("captain");
    expect(options).not.toContain("p1-leader");
    pick(game, "gilly");
    settle(game);

    const gilly = game.state.players.p1.board.find(
      (card) => card.instanceId === "gilly",
    );
    expect(gilly?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(activateMainOffered(game, "hack")).toBe(false);
  });

  it("is not offered with no rested DON!! to give", () => {
    const game = table("op18-042-none")
      .withBoard("p1", [character("hack", "OP18-042")])
      .build();

    expect(activateMainOffered(game, "hack")).toBe(false);
  });
});

/** The `[DON!! x1]` +1000 the Baroque Works pairs print on themselves. */
describe.each([
  ["OP18-044", 4000],
  ["OP18-051", 3000],
  ["OP18-052", 4000],
  ["OP18-053", 3000],
  ["OP18-054", 3000],
  ["OP18-055", 4000],
  ["OP18-056", 3000],
])("%s's [DON!! x1]", (cardNumber, printed) => {
  covers(cardNumber, "static");

  it("is 1000 bigger with a DON!! given, on the opponent's turn too", () => {
    const bare = defending(`${cardNumber}-bare`)
      .withBoard("p1", [character("pair", cardNumber)])
      .build();
    expect(currentPower(bare.state, "p1", "pair")).toBe(printed);

    // Read without the given DON!!'s own +1000, so the difference is the
    // clause alone.
    const given = defending(`${cardNumber}-given`)
      .withBoard("p1", [character("pair", cardNumber)])
      .withGivenDon("p1", "pair", 1)
      .build();
    expect(currentPower(given.state, "p1", "pair", false)).toBe(printed + 1000);
  });
});

describe("OP18-044 Mr.Beans & Miss.Katherina", () => {
  covers("OP18-044", "[On Play]");

  it("draws a card, then trashes one from hand", () => {
    const game = table("op18-044-play")
      .withHand("p1", [
        instance("beans", "OP18-044"),
        instance("filler", "FIX-001"),
      ])
      .withDeckTop("p1", copies(2, "FIX-002", "deck"))
      .build();

    playFromHand(game, "OP18-044");
    expect(effectOptions(game.state)).toEqual(["filler", "deck-1"]);
    pick(game, "filler");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["filler"]);
  });
});

describe("OP18-045 Mr. Prince", () => {
  covers("OP18-045", "static");

  const withEvents = (seed: string, events: number, others = 0) =>
    table(seed)
      .withBoard("p1", [character("prince", "OP18-045")])
      .withTrash("p1", [
        ...copies(events, "OP09-058", "event"),
        ...copies(others, "FIX-001", "body"),
      ])
      .build();

  it("gains 1000 for every five Events in the trash", () => {
    expect(
      currentPower(withEvents("op18-045-4", 4).state, "p1", "prince"),
    ).toBe(4000);
    expect(
      currentPower(withEvents("op18-045-5", 5).state, "p1", "prince"),
    ).toBe(5000);
    expect(
      currentPower(withEvents("op18-045-10", 10).state, "p1", "prince"),
    ).toBe(6000);
  });

  it("counts only Events", () => {
    expect(
      currentPower(withEvents("op18-045-mixed", 4, 6).state, "p1", "prince"),
    ).toBe(4000);
  });

  it("is also named [Sanji]", () => {
    expect(hasCardName("OP18-045", "Sanji")).toBe(true);
    expect(hasCardName("OP18-045", "Mr. Prince")).toBe(true);
  });
});

describe("OP18-046 Mr.0 & Ms. All Sunday", () => {
  covers("OP18-046", "[On Play]", "[On Your Opponent's Attack]");

  it("draws two and gives two rested DON!! to the Leader and every Character", () => {
    const game = table("op18-046-play")
      .withHand("p1", [instance("mr0", "OP18-046")])
      .withBoard("p1", [character("captain", "FIX-002")])
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .build();

    // Paying 9 rests nine of the ten DON!! -- the pile the gift draws on.
    playFromHand(game, "OP18-046");
    settle(game);

    const p1 = game.state.players.p1;
    expect(ids(p1.hand)).toEqual(["deck-1", "deck-2"]);
    expect(p1.leaderAttachedDon).toHaveLength(2);
    for (const card of p1.board) expect(card.attachedDon).toHaveLength(2);
    expect(p1.restedDon).toHaveLength(9 - 6);
  });

  it("runs the rested pile out in board order when it is short", () => {
    const game = table("op18-046-short")
      .withHand("p1", [instance("mr0", "OP18-046")])
      .withBoard("p1", [
        character("a", "FIX-002"),
        character("b", "FIX-002"),
        character("c", "FIX-002"),
        character("d", "FIX-002"),
      ])
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .build();

    playFromHand(game, "OP18-046");
    settle(game);

    const p1 = game.state.players.p1;
    expect(p1.leaderAttachedDon).toHaveLength(2);
    expect(p1.board.map((card) => card.attachedDon?.length ?? 0)).toEqual([
      2, 2, 2, 1, 0,
    ]);
    expect(p1.restedDon).toHaveLength(0);
  });

  const mr0Defends = (seed: string, leader?: string) => {
    const builder = defending(seed)
      .withBoard("p1", [character("mr0", "OP18-046")])
      .withHand("p1", [instance("fodder", "FIX-001")])
      .withBoard("p2", [character("attacker", "OP10-050")]);
    return leader ? builder.withLeader("p1", leader) : builder;
  };

  it("trashes a card to set a Baroque Works Leader's base power to 7000", () => {
    const game = mr0Defends("op18-046-reaction", "OP18-041").build();

    attack(game, "attacker", "p1-leader");
    pick(game, "apply");
    pick(game, "fodder");
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
  });

  it("can be declined, keeping the card", () => {
    const game = mr0Defends("op18-046-decline", "OP18-041").build();

    attack(game, "attacker", "p1-leader");
    pick(game, "skip");

    expect(ids(game.state.players.p1.hand)).toEqual(["fodder"]);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("is not offered behind a Leader with no Baroque Works type", () => {
    const game = mr0Defends("op18-046-other-leader").build();

    attack(game, "attacker", "p1-leader");

    expect(game.state.pendingEffect).toBeNull();
  });

  it("is not offered with an empty hand", () => {
    const game = mr0Defends("op18-046-empty", "OP18-041")
      .withHand("p1", [])
      .build();

    attack(game, "attacker", "p1-leader");

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP18-047 Mr.1 (Daz.Bonez)", () => {
  covers("OP18-047", "[On Play]");

  const played = (seed: string, leader?: string) => {
    const builder = table(seed).withHand("p1", [instance("mr1", "OP18-047")]);
    const game = (leader ? builder.withLeader("p1", leader) : builder).build();
    playFromHand(game, "OP18-047");
    settle(game);
    return game;
  };

  it("makes a Baroque Works Leader [Unblockable] for the turn", () => {
    const game = played("op18-047-bw", "OP18-041");
    expect(hasKeyword(game.state, "p1", "p1-leader", "Unblockable")).toBe(true);
    game.pass();
    expect(hasKeyword(game.state, "p1", "p1-leader", "Unblockable")).toBe(
      false,
    );
  });

  it("makes a {Cross Guild} Leader [Unblockable] too", () => {
    const game = played("op18-047-cg", "OP09-042");
    expect(hasKeyword(game.state, "p1", "p1-leader", "Unblockable")).toBe(true);
  });

  it("does nothing behind any other Leader", () => {
    const game = played("op18-047-other");
    expect(hasKeyword(game.state, "p1", "p1-leader", "Unblockable")).toBe(
      false,
    );
  });
});

describe("OP18-048 Mr.1 & Miss Doublefinger", () => {
  covers("OP18-048", "[On Play]", "[Rush]");

  it("plays a Baroque Works Character of cost 5 or less from hand, and can attack at once", () => {
    const game = table("op18-048-play")
      .withHand("p1", [
        instance("doublefinger", "OP18-048"),
        instance("gator", "OP18-043"),
        instance("captain", "FIX-002"),
        instance("mr0", "OP18-046"),
      ])
      .build();

    playFromHand(game, "OP18-048");
    const options = effectOptions(game.state);
    expect(options).toContain("gator");
    expect(options).not.toContain("captain");
    expect(options).not.toContain("mr0");
    pick(game, "gator");
    settle(game);

    expect(boardIds(game, "p1")).toEqual(["doublefinger", "gator"]);
    // [Rush]: the turn it was played.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "doublefinger",
        ),
    ).toBe(true);
  });
});

describe("OP18-049 Mr.2.Bon.Kurei (Bentham)", () => {
  covers("OP18-049", "[On Play]");

  it("adds a Baroque Works card from the top five, then gives a rested DON!!", () => {
    const game = table("op18-049-play")
      .withHand("p1", [instance("bonkurei", "OP18-049")])
      .withDeckTop("p1", [
        instance("captain", "FIX-002"),
        instance("gator", "OP18-043"),
        instance("deckhand", "FIX-001"),
        instance("mr1", "OP18-047"),
        instance("deep", "FIX-002"),
        instance("sixth", "OP18-043"),
      ])
      .build();

    playFromHand(game, "OP18-049");
    const options = effectOptions(game.state);
    // {Former Baroque Works} answers "a type including".
    expect(options).toEqual(expect.arrayContaining(["gator", "mr1"]));
    expect(options).not.toContain("captain");
    expect(options).not.toContain("sixth");
    pick(game, "gator");
    // The rest go to the bottom; then the gift, to the Leader.
    settle(game, "p1-leader");

    const p1 = game.state.players.p1;
    expect(ids(p1.hand)).toEqual(["gator"]);
    expect(ids(p1.deck)[0]).toBe("sixth");
    expect(p1.leaderAttachedDon).toHaveLength(1);
  });
});

describe("OP18-050 Mr.3 & Miss.Goldenweek", () => {
  covers("OP18-050", "[On Play]", "[Blocker]");

  it("is a [Blocker]", () => {
    const game = table("op18-050-blocker")
      .withBoard("p1", [character("mr3", "OP18-050")])
      .build();
    expect(hasKeyword(game.state, "p1", "mr3", "Blocker")).toBe(true);
  });

  it("stops a cost-7-or-less Character attacking through the opponent's next turn", () => {
    const game = table("op18-050-lock")
      .withLeader("p1", "OP18-041")
      .withHand("p1", [instance("mr3", "OP18-050")])
      .withBoard("p2", [
        character("small", "OP10-089"),
        character("big", "OP05-044"),
      ])
      // p2 draws on the turn the lock is read on.
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    playFromHand(game, "OP18-050");
    expect(effectOptions(game.state)).toContain("small");
    expect(effectOptions(game.state)).not.toContain("big");
    pick(game, "small");
    settle(game);
    game.pass();

    const attackers = game
      .legalActions()
      .filter((action) => action.type === "attack")
      .map((action) => action.attackerInstanceId);
    expect(attackers).not.toContain("small");
    expect(attackers).toContain("big");
  });

  it("asks nothing behind a Leader with no Baroque Works type", () => {
    const game = table("op18-050-other")
      .withHand("p1", [instance("mr3", "OP18-050")])
      .withBoard("p2", [character("small", "OP10-089")])
      .build();

    playFromHand(game, "OP18-050");

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP18-051 Mr.4 & Miss.MerryChristmas", () => {
  covers("OP18-051", "[On Play]");

  const board = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("mr4", "OP18-051")])
      .withBoard("p1", [character("own", "FIX-002")])
      .withBoard("p2", [
        character("six", "OP10-089"),
        character("five", "OP10-031"),
        character("big", "OP10-050"),
      ]);

  it("rests five DON!! to put a cost-6 and a cost-5 Character under their owner's deck", () => {
    const game = board("op18-051-bury").build();

    playFromHand(game, "OP18-051");
    pick(game, "apply");
    const first = effectOptions(game.state);
    // Either side's Characters are in reach.
    expect(first).toEqual(expect.arrayContaining(["six", "five", "own"]));
    expect(first).not.toContain("big");
    pick(game, "six");
    const second = effectOptions(game.state);
    expect(second).toContain("five");
    expect(second).not.toContain("six");
    pick(game, "five");
    settle(game);

    expect(boardIds(game, "p2")).toEqual(["big"]);
    expect(ids(game.state.players.p2.deck).slice(-2).sort()).toEqual([
      "five",
      "six",
    ]);
    // Ten active, two paid for the card, five rested for the clause.
    expect(game.state.players.p1.activeDon).toHaveLength(3);
  });

  it("can be declined, resting nothing", () => {
    const game = board("op18-051-decline").build();

    playFromHand(game, "OP18-051");
    pick(game, "skip");

    expect(boardIds(game, "p2")).toEqual(["six", "five", "big"]);
    expect(game.state.players.p1.activeDon).toHaveLength(8);
  });

  it("asks nothing with fewer than five active DON!! left", () => {
    const game = board("op18-051-short").withDonDeck("p1", 4).build();

    playFromHand(game, "OP18-051");

    expect(game.state.pendingEffect).toBeNull();
    expect(boardIds(game, "p2")).toEqual(["six", "five", "big"]);
  });
});

describe("OP18-052 Mr.5 & Miss.Valentine", () => {
  covers("OP18-052", "[On Play]");

  it("plays a Baroque Works Character of cost 3 or less from hand", () => {
    const game = table("op18-052-play")
      .withHand("p1", [
        instance("mr5", "OP18-052"),
        instance("fathers-day", "EB05-044"),
        instance("gator", "OP18-043"),
        instance("deckhand", "FIX-001"),
      ])
      .build();

    playFromHand(game, "OP18-052");
    const options = effectOptions(game.state);
    expect(options).toContain("fathers-day");
    expect(options).not.toContain("gator");
    expect(options).not.toContain("deckhand");
    pick(game, "fathers-day");
    settle(game);

    expect(boardIds(game, "p1")).toEqual(["mr5", "fathers-day"]);
  });
});

describe("OP18-053 Mr.7 & Miss.Fathersday", () => {
  covers("OP18-053", "[On Play]");

  const mr7 = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("mr7", "OP18-053")])
      .withDeckTop("p1", [
        instance("a", "FIX-001"),
        instance("b", "FIX-002"),
        instance("c", "OP18-043"),
        instance("d", "FIX-001"),
      ])
      .build();

  it("looks at the top three and may put them all on the bottom", () => {
    const game = mr7("op18-053-bottom");

    playFromHand(game, "OP18-053");
    game.play({
      type: "resolve-effect",
      summary: "at the bottom of your deck",
    });
    settle(game);

    const deck = ids(game.state.players.p1.deck);
    expect(deck[0]).toBe("d");
    expect(deck.slice(-3)).toEqual(["a", "b", "c"]);
  });

  it("may keep them on top instead", () => {
    const game = mr7("op18-053-top");

    playFromHand(game, "OP18-053");
    game.play({ type: "resolve-effect", summary: "at the top of your deck" });
    settle(game);

    const deck = ids(game.state.players.p1.deck);
    expect(deck.slice(0, 3).sort()).toEqual(["a", "b", "c"]);
    expect(deck[3]).toBe("d");
  });
});

describe("OP18-054 Mr.8 & Miss.Monday", () => {
  covers("OP18-054", "[Opponent's Turn]");

  /** p2 holds two OP09-058 Special Muggy Balls: cost-6-or-less bounces. */
  const monday = (seed: string) =>
    defending(seed)
      .withBoard("p1", [
        character("mr8", "OP18-054"),
        character("gator", "OP18-043"),
        character("captain", "FIX-002"),
      ])
      .withHand("p1", [
        instance("fodder-1", "FIX-001"),
        instance("fodder-2", "FIX-001"),
      ])
      .withHand("p2", copies(2, "OP09-058", "muggy"));

  const muggyBall = (game: Game, target: string) => {
    game.play({ summary: "Activate Special Muggy Ball" });
    pick(game, target);
  };

  it("trashes a card instead of a Baroque Works Character leaving, once a turn", () => {
    const game = monday("op18-054-save").build();

    muggyBall(game, "gator");
    expect(game.state.activePlayer).toBe("p1");
    expect(effectOptions(game.state)).toContain("replace:mr8");
    pick(game, "replace:mr8");
    settle(game);

    expect(boardIds(game, "p1")).toContain("gator");
    expect(game.state.players.p1.trash).toHaveLength(1);

    // The turn's one use is spent: the second bounce goes through.
    muggyBall(game, "gator");
    settle(game);
    expect(boardIds(game, "p1")).not.toContain("gator");
    expect(ids(game.state.players.p1.hand)).toContain("gator");
  });

  it("does not protect a Character with no Baroque Works type", () => {
    const game = monday("op18-054-other").build();

    muggyBall(game, "captain");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toContain("captain");
    expect(game.state.players.p1.trash).toEqual([]);
  });

  it("is not offered on its controller's own turn", () => {
    // OP09-058's [Trigger] is the opponent's effect resolving on p1's turn:
    // it returns a cost-3-or-less Character, here the Baroque Works one.
    const game = table("op18-054-own-turn")
      .withBoard("p1", [
        character("mr8", "OP18-054"),
        character("fathers-day", "EB05-044"),
        character("gator", "OP18-043"),
      ])
      .withHand("p1", [instance("fodder", "FIX-001")])
      .withLife("p2", [instance("muggy", "OP09-058")])
      .build();

    attack(game, "gator", "p2-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    pick(game, "fathers-day");
    expect(effectOptions(game.state)).not.toContain("replace:mr8");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["fodder", "fathers-day"]);
  });
});

describe("OP18-055 Mr.9 & Ms. Wednesday", () => {
  covers("OP18-055", "[On Play]");

  it("returns an opposing Character of cost 2 or less to hand", () => {
    const game = table("op18-055-play")
      .withHand("p1", [instance("mr9", "OP18-055")])
      .withBoard("p1", [character("own", "FIX-001")])
      .withBoard("p2", [
        character("captain", "FIX-002"),
        character("gator", "OP18-043"),
      ])
      .build();

    playFromHand(game, "OP18-055");
    const options = effectOptions(game.state);
    expect(options).toContain("captain");
    expect(options).not.toContain("gator");
    expect(options).not.toContain("own");
    pick(game, "captain");
    settle(game);

    expect(boardIds(game, "p2")).toEqual(["gator"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["captain"]);
  });
});

describe("OP18-056 Mr.13 & Ms.Friday", () => {
  covers("OP18-056", "[On Play]");

  const friday = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("mr13", "OP18-056")])
      .withBoard("p1", [
        character("gator", "OP18-043"),
        character("captain", "FIX-002"),
      ])
      .withHand("p2", [
        instance("p2-a", "FIX-001"),
        instance("p2-b", "FIX-002"),
      ]);

  it("puts another Baroque Works Character under the deck to make the opponent discard", () => {
    const game = friday("op18-056-play").build();

    playFromHand(game, "OP18-056");
    pick(game, "apply");
    expect(effectOptions(game.state)).toEqual(["gator"]);
    pick(game, "gator");
    expect(game.state.activePlayer).toBe("p2");
    pick(game, "p2-a");
    settle(game);

    expect(boardIds(game, "p1")).toEqual(["captain", "mr13"]);
    expect(ids(game.state.players.p1.deck).at(-1)).toBe("gator");
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-a"]);
  });

  it("can be declined", () => {
    const game = friday("op18-056-decline").build();

    playFromHand(game, "OP18-056");
    pick(game, "skip");

    expect(boardIds(game, "p1")).toEqual(["gator", "captain", "mr13"]);
    expect(game.state.players.p2.hand).toHaveLength(2);
  });

  it("asks nothing with no other Baroque Works Character to pay with", () => {
    const game = friday("op18-056-none")
      .withBoard("p1", [character("captain", "FIX-002")])
      .build();

    playFromHand(game, "OP18-056");

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.hand).toHaveLength(2);
  });
});
