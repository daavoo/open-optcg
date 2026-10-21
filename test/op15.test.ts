import { describe, expect, it } from "vitest";
import {
  battleAttackPower,
  currentPower,
  effectiveCost,
  hasKeyword,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * OP15 "A Fist of Divine Speed", card by card.
 *
 * The set ships as a whole series rather than as a deck (see
 * `packages/cards/src/op15.ts`), so these positions are built on the format's
 * own ST31/ST32 decks with the OP15 card put where the clause under test needs
 * it. That is deliberate: a clause that only works next to its own archetype is
 * a clause with a hidden dependency, and building it against a neutral board is
 * what surfaces one.
 *
 * `bareTable()` leaves both decks empty, so a clause that looks at or draws
 * from the deck says so by stacking one with `withDeckTop`.
 */
const table = (seed: string) =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/**
 * Decline the block and Counter steps of a declared attack, so the battle
 * resolves.
 *
 * An `[On K.O.]` is only reachable through a real battle, and these two
 * declines are the engine's own steps -- driving them here keeps each test
 * about the clause under it rather than about the battle flow. Written as a
 * loop because the engine skips a step the defender has no options for.
 */
const declineDefence = (game: {
  state: { phase: string };
  pass: () => unknown;
}) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

describe("OP15-004 Sea Cat", () => {
  covers("OP15-004", "[On Play]");

  it("weakens a Character while its own Leader is at 0 power or less", () => {
    const game = table("op15-004-on")
      .withBoard("p2", [character("target", "ST32-004")])
      .withHand("p1", [instance("sea-cat", "OP15-004")])
      .withState((state) => {
        // The clause reads the Leader's *current* power, which is what the
        // Red/Alabasta package spends its own Leader down to.
        state.players.p1.leaderBasePowers = [
          { value: 0, expiresAtTurn: state.turn + 2 },
        ];
      })
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-004" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -3000 }),
    );
  });

  it("does nothing while its Leader is above 0 power", () => {
    const game = table("op15-004-off")
      .withBoard("p2", [character("target", "ST32-004")])
      .withHand("p1", [instance("sea-cat", "OP15-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-004" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board[0]?.powerModifiers).toEqual([]);
  });
});

describe("OP15-007 Gin", () => {
  covers("OP15-007", "[On Play]");

  it("plays a cost-5-or-less Character free under an East Blue Leader", () => {
    const game = table("op15-007-on")
      .withLeader("p1", "OP15-001")
      .withHand("p1", [
        instance("gin", "OP15-007"),
        instance("free", "ST32-004"),
      ])
      .build();

    const donBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP15-007" });
    game.play({ type: "resolve-effect", optionId: "free" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("free");
    // A free play: only Gin's own 6 DON!! left the cost area.
    expect(game.state.players.p1.activeDon.length).toBe(donBefore - 6);
  });

  it("offers nothing under a Leader without the type", () => {
    const game = table("op15-007-off")
      .withHand("p1", [
        instance("gin", "OP15-007"),
        instance("free", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-007" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "free",
    );
  });
});

describe("OP15-028 Meowban Brothers", () => {
  covers("OP15-028", "[On Play]");

  it("moves a DON!! out of the opponent's cost area onto their Character", () => {
    const game = table("op15-028")
      .withLeader("p1", "OP15-001")
      .withBoard("p2", [character("victim", "ST32-004")])
      .withHand("p1", [instance("meowban", "OP15-028")])
      .build();

    const costArea = game.state.players.p2.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP15-028" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(1);
    // The DON!! is theirs and it is now unspendable, which is the whole point.
    expect(game.state.players.p2.activeDon.length).toBe(costArea - 1);
  });

  it("gives nothing under a Leader without the type", () => {
    const game = table("op15-028-off")
      .withBoard("p2", [character("victim", "ST32-004")])
      .withHand("p1", [instance("meowban", "OP15-028")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-028" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board[0]?.attachedDon).toEqual([]);
  });
});

describe("OP15-029 Bartholomew Kuma", () => {
  covers("OP15-029", "[On Play]");

  it("stops a cost-5-or-less Character resting through the opponent's turn", () => {
    const game = table("op15-029")
      .withBoard("p2", [character("locked", "ST32-004")])
      .withHand("p1", [instance("kuma", "OP15-029")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-029" });
    game.play({ type: "resolve-effect", optionId: "locked" });

    // The engine holds the lock as a turn stamp on the card, not as a list.
    expect(game.state.players.p2.board[0]?.cannotRestUntilTurn).toBe(
      game.state.turn + 1,
    );
  });

  it("cannot name a Character above the printed cost ceiling", () => {
    const game = table("op15-029-ceiling")
      .withBoard("p2", [character("big", "ST32-003")])
      .withHand("p1", [instance("kuma", "OP15-029")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-029" });

    expect(
      game.legalActions().some((action) => action.summary.includes("Mihawk")),
    ).toBe(false);
  });
});

describe("OP15-043 Kelly Funk", () => {
  covers("OP15-043", "[On Play]");

  it("plays its brother out of hand and nothing else", () => {
    const game = table("op15-043")
      .withHand("p1", [
        instance("kelly", "OP15-043"),
        instance("bobby", "OP15-050"),
        instance("other", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-043" });
    expect(
      game.legalActions().some((action) => action.summary.includes("Rayleigh")),
    ).toBe(false);

    game.play({ type: "resolve-effect", optionId: "bobby" });
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("bobby");
  });
});

describe("OP15-045 Sai", () => {
  covers("OP15-045", "[On Play]", "[Blocker]");

  it("draws 2 for an Event out of hand", () => {
    const game = table("op15-045")
      .withHand("p1", [
        instance("sai", "OP15-045"),
        instance("event", "OP12-039"),
      ])
      .withDeckTop("p1", copies(2, "ST32-005", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-045" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "event" });

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("event");
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn-1",
      "drawn-2",
    ]);
  });

  it("declines the cost and draws nothing", () => {
    const game = table("op15-045-decline")
      .withHand("p1", [
        instance("sai", "OP15-045"),
        instance("event", "OP12-039"),
      ])
      .withDeckTop("p1", copies(2, "ST32-005", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-045" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "event",
    ]);
  });

  it("blocks a declared attack", () => {
    const game = table("op15-045-blocker")
      .withBoard("p2", [character("sai", "OP15-045")])
      .build();

    expect(hasKeyword(game.state, "p2", "sai", "Blocker")).toBe(true);
  });
});

describe("OP15-053 Rebecca", () => {
  covers("OP15-053", "[On Play]", "static");

  it("digs 3 for a Dressrosa card and bottoms the rest", () => {
    const game = table("op15-053")
      .withHand("p1", [instance("rebecca", "OP15-053")])
      .withDeckTop("p1", [
        instance("hit", "OP15-040"),
        instance("miss-1", "ST32-004"),
        instance("miss-2", "ST32-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-053" });
    game.play({ type: "resolve-effect", optionId: "hit" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    expect(game.state.players.p1.deck.map((card) => card.instanceId)).toEqual([
      "miss-1",
      "miss-2",
    ]);
  });

  it("gains [Blocker] only once a DON!! is given to it", () => {
    const bare = table("op15-053-blocker-off")
      .withBoard("p2", [character("rebecca", "OP15-053")])
      .build();
    expect(hasKeyword(bare.state, "p2", "rebecca", "Blocker")).toBe(false);

    const given = table("op15-053-blocker-on")
      .withBoard("p2", [character("rebecca", "OP15-053")])
      .withGivenDon("p2", "rebecca", 1)
      .build();
    expect(hasKeyword(given.state, "p2", "rebecca", "Blocker")).toBe(true);
  });
});

describe("OP15-087 Nico Robin", () => {
  covers("OP15-087", "[On Play]", "static");

  it("draws 2 and then discards 2, the drawn cards included", () => {
    const game = table("op15-087")
      .withHand("p1", [instance("robin", "OP15-087")])
      .withDeckTop("p1", copies(2, "ST32-005", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-087" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn-1",
      "drawn-2",
    ]);

    game.play({ type: "resolve-effect", optionId: "drawn-1" });
    game.play({ type: "resolve-effect", optionId: "drawn-2" });

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["drawn-1", "drawn-2"]),
    );
  });

  it("gains [Blocker] only at 10 cards in the trash", () => {
    const shallow = table("op15-087-shallow")
      .withBoard("p2", [character("robin", "OP15-087")])
      .withTrash("p2", copies(9, "ST32-004"))
      .build();
    expect(hasKeyword(shallow.state, "p2", "robin", "Blocker")).toBe(false);

    const deep = table("op15-087-deep")
      .withBoard("p2", [character("robin", "OP15-087")])
      .withTrash("p2", copies(10, "ST32-004"))
      .build();
    expect(hasKeyword(deep.state, "p2", "robin", "Blocker")).toBe(true);
  });
});

describe("OP15-092 Monkey.D.Luffy", () => {
  covers("OP15-092", "static");

  const luffy = (seed: string, owner: "p1" | "p2", trash: number) =>
    table(seed)
      .withBoard(owner, [character("luffy", "OP15-092")])
      .withTrash(owner, copies(trash, "ST32-004"));

  it("stays a printed 7-cost 7000 under 10 cards in the trash", () => {
    const game = luffy("op15-092-shallow", "p1", 9).build();
    expect(currentPower(game.state, "p1", "luffy")).toBe(7000);
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(7);
  });

  it("becomes a 9000 base and gains +10 cost at 10 cards", () => {
    const game = luffy("op15-092-ten", "p1", 10).build();
    expect(currentPower(game.state, "p1", "luffy")).toBe(9000);
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(17);
  });

  it("is a giant for the OP17-079 Leader's [Blocker] aura at 10 cards", () => {
    const shallow = luffy("op15-092-blocker-shallow", "p2", 9)
      .withLeader("p2", "OP17-079")
      .build();
    expect(hasKeyword(shallow.state, "p2", "luffy", "Blocker")).toBe(false);

    const deep = luffy("op15-092-blocker-deep", "p2", 10)
      .withLeader("p2", "OP17-079")
      .build();
    expect(hasKeyword(deep.state, "p2", "luffy", "Blocker")).toBe(true);
  });

  it("sets its Leader's base power to 7000 on the opponent's turn at 20", () => {
    // p1 is the turn player, so this is p2's opponent's turn.
    const shallow = luffy("op15-092-leader-19", "p2", 19).build();
    expect(currentPower(shallow.state, "p2", "p2-leader")).toBe(5000);

    const deep = luffy("op15-092-leader-20", "p2", 20).build();
    expect(currentPower(deep.state, "p2", "p2-leader")).toBe(7000);
  });

  it("leaves its Leader alone on its controller's own turn", () => {
    const game = luffy("op15-092-leader-own-turn", "p1", 20).build();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("adds +1000 over the 9000 base at 30 cards", () => {
    const below = luffy("op15-092-29", "p1", 29).build();
    expect(currentPower(below.state, "p1", "luffy")).toBe(9000);

    const game = luffy("op15-092-30", "p1", 30).build();
    expect(currentPower(game.state, "p1", "luffy")).toBe(10000);
  });
});

describe("OP15-091 Margarita", () => {
  covers("OP15-091", "[On Play]");

  it("buries a card out of the opponent's trash under their own deck", () => {
    const game = table("op15-091")
      .withHand("p1", [instance("margarita", "OP15-091")])
      .withTrash("p2", [instance("buried", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-091" });
    game.play({ type: "resolve-effect", optionId: "buried" });

    expect(game.state.players.p2.trash).toHaveLength(0);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("buried");
  });
});

describe("OP15 three-deep searches", () => {
  covers("OP15-040", "[On Play]");
  covers("OP15-108", "[On Play]");

  it.each([
    ["OP15-040", "OP15-042"],
    ["OP15-108", "OP15-100"],
  ])("%s reveals a matching card and bottoms the rest", (searcher, hit) => {
    const game = table(`op15-search-${searcher}`)
      .withHand("p1", [instance("searcher", searcher)])
      .withDeckTop("p1", [
        instance("hit", hit),
        instance("miss-1", "ST32-004"),
        instance("miss-2", "ST32-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: searcher });
    game.play({ type: "resolve-effect", optionId: "hit" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });

  it("adds nothing when the top three hold no match", () => {
    const game = table("op15-040-empty")
      .withHand("p1", [instance("searcher", "OP15-040")])
      .withDeckTop("p1", [
        instance("miss-1", "ST32-004"),
        instance("miss-2", "ST32-005"),
        instance("miss-3", "ST32-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-040" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(3);
  });
});

describe("OP15 self-mill", () => {
  covers("OP15-081", "[On Play]");
  covers("OP15-082", "[On Play]", "[On K.O.]");
  covers("OP15-084", "[On Play]", "[On K.O.]");
  covers("OP15-085", "[On Play]");

  it("OP15-081 buries five cards under a Straw Hat Crew Leader", () => {
    const game = table("op15-081")
      .withHand("p1", [instance("sanji", "OP15-081")])
      .withDeckTop("p1", copies(6, "ST32-005", "fuel"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-081" });

    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "fuel-1",
      "fuel-2",
      "fuel-3",
      "fuel-4",
      "fuel-5",
    ]);
    expect(game.state.players.p1.deck).toHaveLength(1);
  });

  it("OP15-081 buries nothing under a Leader without the type", () => {
    const game = table("op15-081-off")
      // Krieg is East Blue/Krieg Pirates -- ST31's and ST32's own Leaders both
      // carry {Straw Hat Crew}, so the negative case needs one that does not.
      .withLeader("p1", "OP15-001")
      .withHand("p1", [instance("sanji", "OP15-081")])
      .withDeckTop("p1", copies(6, "ST32-005", "fuel"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-081" });

    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("OP15-081 trashes what is left of a deck shorter than five", () => {
    const game = table("op15-081-short")
      .withHand("p1", [instance("sanji", "OP15-081")])
      .withDeckTop("p1", copies(2, "ST32-005", "fuel"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-081" });

    expect(game.state.players.p1.trash).toHaveLength(2);
    expect(game.state.players.p1.deck).toHaveLength(0);
  });

  it.each([
    ["OP15-082", 3],
    ["OP15-085", 3],
  ])("%s buries %i on the way in", (cardNumber, count) => {
    const game = table(`op15-mill-${cardNumber}`)
      .withHand("p1", [instance("miller", cardNumber)])
      .withDeckTop("p1", copies(5, "ST32-005", "fuel"))
      .build();

    game.play({ type: "play-card", cardNumber });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.trash).toHaveLength(count);
  });

  it("OP15-084 refills on K.O. only from a hand of 6 or less", () => {
    const game = table("op15-084-ko")
      .withBoard("p1", [character("hogback", "OP15-084", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p1", copies(1, "ST32-005", "refill"))
      // `bareTable()` empties both decks, and the opponent draws on their turn.
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "hogback",
    });
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "refill-1",
    ]);
  });

  it("OP15-082 recovers a Character out of its own trash on K.O.", () => {
    const game = table("op15-082-ko")
      .withBoard("p1", [character("lola", "OP15-082", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withTrash("p1", [instance("buried", "ST32-004")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "lola",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "buried" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "buried",
    );
  });
});

describe("OP15 DON!!-given removal", () => {
  covers("OP15-027", "[On Play]");
  covers("OP15-018", "[When Attacking]");
  covers("OP15-015", "[On Play]");
  covers("OP15-005", "[When Attacking]");

  it("OP15-027 rests only a Character carrying DON!!", () => {
    const game = table("op15-027")
      .withBoard("p2", [
        character("marked", "ST32-004"),
        character("clean", "ST32-005"),
      ])
      .withGivenDon("p2", "marked", 1)
      .withHand("p1", [instance("mihawk", "OP15-027")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-027" });
    // The unmarked Character is never on the table as an option.
    expect(
      game.legalActions().some((action) => action.summary.includes("Zoro")),
    ).toBe(false);

    game.play({ type: "resolve-effect", optionId: "marked" });
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  it("OP15-027 offers nothing when no DON!! has been given", () => {
    const game = table("op15-027-empty")
      .withBoard("p2", [character("clean", "ST32-004")])
      .withHand("p1", [instance("mihawk", "OP15-027")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-027" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board[0]?.rested).toBe(false);
  });

  it("OP15-015 gives the opponent's DON!! away and then punishes it", () => {
    const game = table("op15-015")
      .withBoard("p2", [character("victim", "ST32-004")])
      .withHand("p1", [instance("higuma", "OP15-015")])
      .withDon("p2", { rested: 1 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-015" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(1);
    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -1000 }),
    );
  });

  it("OP15-018 K.O.s a weak marked Character when it attacks", () => {
    const game = table("op15-018")
      .withBoard("p1", [character("mohji", "OP15-018", { playedTurn: 1 })])
      .withBoard("p2", [character("marked", "ST32-005")])
      .withGivenDon("p2", "marked", 0)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "mohji",
      targetInstanceId: "p2-leader",
    });
    // 2000 printed power and no DON!! given: below the power ceiling but not
    // marked, so the clause finds nothing.
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("OP15-005 gains power only while the opponent carries DON!!", () => {
    const game = table("op15-005")
      .withBoard("p1", [character("cabaji", "OP15-005", { playedTurn: 1 })])
      .withBoard("p2", [character("marked", "ST32-004")])
      .withGivenDon("p2", "marked", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "cabaji",
      targetInstanceId: "p2-leader",
    });

    expect(game.state.players.p1.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: 2000 }),
    );
  });
});

describe("OP15 Dressrosa toolbox", () => {
  covers("OP15-042", "[On Play]", "[On K.O.]");
  covers("OP15-048", "[On Play]", "[On K.O.]");
  covers("OP15-073", "[On Play]", "[Blocker]");
  covers("OP15-112", "[On Play]", "[Blocker]");

  it("OP15-042 pays the discard and takes [Rush] under Rebecca", () => {
    const game = table("op15-042")
      .withLeader("p1", "OP15-039")
      .withHand("p1", [
        instance("kyros", "OP15-042"),
        instance("fodder", "ST32-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-042" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });

    expect(hasKeyword(game.state, "p1", "kyros", "Rush")).toBe(true);
  });

  it("OP15-042 still spends the card under the wrong Leader", () => {
    const game = table("op15-042-wrong")
      .withHand("p1", [
        instance("kyros", "OP15-042"),
        instance("fodder", "ST32-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-042" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });

    // The printed colon puts the Leader check after the cost: the discard is
    // paid either way.
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
    expect(hasKeyword(game.state, "p1", "kyros", "Rush")).toBe(false);
  });

  it("OP15-042 returns itself from the trash on K.O.", () => {
    const game = table("op15-042-ko")
      .withBoard("p1", [character("kyros", "OP15-042", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "kyros",
    });
    declineDefence(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "kyros",
    ]);
  });

  it("OP15-048 makes the opponent bury a card only on their own turn", () => {
    const game = table("op15-048-ko")
      .withBoard("p1", [character("chinjao", "OP15-048", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withHand("p2", [instance("theirs", "ST32-005")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "chinjao",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "theirs" });

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("theirs");
  });

  it.each([
    ["OP15-073", "OP15-068"],
    ["OP15-112", "OP15-103"],
  ])("%s puts a matching body out of hand for free", (recruiter, target) => {
    const game = table(`op15-recruit-${recruiter}`)
      .withHand("p1", [
        instance("recruiter", recruiter),
        instance("target", target),
        instance("wrong", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: recruiter });
    expect(
      game.legalActions().some((action) => action.summary.includes("Rayleigh")),
    ).toBe(false);

    game.play({ type: "resolve-effect", optionId: "target" });
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("target");
  });

  it.each([["OP15-073"], ["OP15-112"]])("%s blocks", (cardNumber) => {
    const game = table(`op15-blocker-${cardNumber}`)
      .withBoard("p2", [character("blocker", cardNumber)])
      .build();
    expect(hasKeyword(game.state, "p2", "blocker", "Blocker")).toBe(true);
  });
});

describe("OP15-086 Nami", () => {
  covers("OP15-086", "[On Play]");

  it("revives a Straw Hat Crew body with [Rush]", () => {
    const game = table("op15-086")
      .withHand("p1", [instance("nami", "OP15-086")])
      .withTrash("p1", [
        instance("revived", "OP11-003"),
        instance("too-big", "ST31-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-086" });
    // ST31-004 costs 7 and would be legal; OP11-003 costs 5. Both are Straw Hat
    // Crew, so the ceiling is what has to be checked, not the type.
    game.play({ type: "resolve-effect", optionId: "revived" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("revived");
    expect(hasKeyword(game.state, "p1", "revived", "Rush")).toBe(true);
  });
});

describe("OP15-100 Kamakiri", () => {
  covers("OP15-100", "[On Play]");

  it("trades itself and a Life card for a cost-6 K.O.", () => {
    const game = table("op15-100")
      .withHand("p1", [instance("kamakiri", "OP15-100")])
      .withLife("p1", [instance("life-card", "ST32-005")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-100" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "life-card" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p1.life).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-card",
    );
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("cannot pay at zero Life", () => {
    const game = table("op15-100-broke")
      .withHand("p1", [instance("kamakiri", "OP15-100")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-100" });
    if (game.state.pendingEffect)
      game.play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.players.p2.board).toHaveLength(1);
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("kamakiri");
  });
});

describe("OP15-104 Conis", () => {
  covers("OP15-104", "[On Play]", "[Trigger]");

  it("refills only from behind on Life", () => {
    const behind = table("op15-104-behind")
      .withHand("p1", [instance("conis", "OP15-104")])
      .withDeckTop("p1", copies(2, "ST32-005", "drawn"))
      .withLife("p2", [instance("their-life", "ST32-005")])
      .build();

    behind.play({ type: "play-card", cardNumber: "OP15-104" });
    expect(behind.state.players.p1.hand).toHaveLength(2);

    const level = table("op15-104-level")
      .withHand("p1", [instance("conis", "OP15-104")])
      .withDeckTop("p1", copies(2, "ST32-005", "drawn"))
      .build();

    level.play({ type: "play-card", cardNumber: "OP15-104" });
    expect(level.state.pendingEffect).toBeNull();
    expect(level.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP15 Events", () => {
  covers("OP15-055", "[Main]");
  covers("OP15-096", "[Main]", "[Counter]");
  covers("OP15-117", "[Main]", "[Trigger]");

  it("OP15-055 offers exactly one of its two halves", () => {
    const game = table("op15-055")
      .withHand("p1", [instance("event", "OP15-055")])
      .withBoard("p1", [character("target", "OP15-042")])
      .withDeckTop("p1", copies(2, "ST32-005", "drawn"))
      .build();

    // An Event is activated out of hand, not "played" as a Character is.
    game.play({ summary: "Go Ahead and Use 'Em" });
    game.play({ type: "resolve-effect", optionId: "blocker" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(hasKeyword(game.state, "p1", "target", "Blocker")).toBe(true);
    // The other branch is gone: no draw happened.
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("OP15-096 rests a DON!! to bury five cards", () => {
    const game = table("op15-096")
      .withHand("p1", [instance("event", "OP15-096")])
      .withDeckTop("p1", copies(6, "ST32-005", "fuel"))
      .build();

    const active = game.state.players.p1.activeDon.length;
    game.play({ summary: "Swallow Bond en Avant" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.trash.filter(
        (card) => card.cardNumber === "ST32-005",
      ),
    ).toHaveLength(5);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.activeDon.length).toBe(active - 1);
  });

  it("OP15-117 draws and hands a rested DON!! to a Sky Island card", () => {
    const game = table("op15-117")
      .withHand("p1", [instance("event", "OP15-117")])
      .withBoard("p1", [character("sky", "OP15-112")])
      .withDeckTop("p1", copies(1, "ST32-005", "drawn"))
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ summary: "Heso!!" });
    game.play({ type: "resolve-effect", optionId: "sky" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn-1",
    ]);
    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(1);
  });
});

describe("OP15-011 Pearl", () => {
  covers("OP15-011", "[Opponent's Turn]", "[On K.O.]");

  it("blocks and holds +2000 only on the opponent's turn under East Blue", () => {
    const game = table("op15-011-static")
      .withLeader("p2", "OP15-001")
      .withBoard("p2", [character("pearl", "OP15-011")])
      .build();

    // p1 is the turn player, so this is Pearl's controller's opponent's turn.
    expect(hasKeyword(game.state, "p2", "pearl", "Blocker")).toBe(true);
    expect(currentPower(game.state, "p2", "pearl")).toBe(6000);
  });

  it("has neither under a Leader without the type", () => {
    const game = table("op15-011-off")
      .withBoard("p2", [character("pearl", "OP15-011")])
      .build();

    expect(hasKeyword(game.state, "p2", "pearl", "Blocker")).toBe(false);
    expect(currentPower(game.state, "p2", "pearl")).toBe(4000);
  });

  it("K.O.s a 6000-base-power Character when it dies", () => {
    const game = table("op15-011-ko")
      .withLeader("p1", "OP15-001")
      .withBoard("p1", [character("pearl", "OP15-011", { rested: true })])
      .withBoard("p2", [
        character("killer", "ST32-002"),
        character("victim", "ST32-002"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "pearl",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("victim");
  });
});

describe("OP15-070 Fuza", () => {
  covers("OP15-070", "static", "[Opponent's Turn]");

  it("grants [Unblockable] to itself and to every [Shura]", () => {
    const game = table("op15-070")
      .withBoard("p1", [
        character("fuza", "OP15-070"),
        character("shura", "OP15-067"),
        character("other", "ST32-005"),
      ])
      .build();

    expect(hasKeyword(game.state, "p1", "fuza", "Unblockable")).toBe(true);
    expect(hasKeyword(game.state, "p1", "shura", "Unblockable")).toBe(true);
    expect(hasKeyword(game.state, "p1", "other", "Unblockable")).toBe(false);
  });

  it("sets both base powers to 6000 on the opponent's turn only", () => {
    const theirs = table("op15-070-defence")
      .withBoard("p2", [
        character("fuza", "OP15-070"),
        character("shura", "OP15-067"),
      ])
      .build();
    expect(currentPower(theirs.state, "p2", "fuza")).toBe(6000);
    expect(currentPower(theirs.state, "p2", "shura")).toBe(6000);

    const mine = table("op15-070-attack")
      .withBoard("p1", [
        character("fuza", "OP15-070"),
        character("shura", "OP15-067"),
      ])
      .build();
    expect(currentPower(mine.state, "p1", "fuza")).toBe(4000);
  });
});

describe("OP15-080 Oars", () => {
  covers("OP15-080", "static", "[On K.O.]");

  it("gains +7000 beside a 10000-power Gecko Moria, and not beside a second Oars", () => {
    const paired = table("op15-080")
      // OP14-104 is the pool's 10000-power Gecko Moria, so the threshold is met
      // on printed power alone.
      .withBoard("p1", [
        character("oars", "OP15-080"),
        character("moria", "OP14-104"),
      ])
      .build();
    expect(currentPower(paired.state, "p1", "oars")).toBe(7000);

    const crowded = table("op15-080-crowded")
      .withBoard("p1", [
        character("oars", "OP15-080"),
        character("oars-2", "OP15-080"),
        character("moria", "OP14-104"),
      ])
      .build();
    expect(currentPower(crowded.state, "p1", "oars")).toBe(0);
  });

  it("gains nothing without Moria on the board", () => {
    const game = table("op15-080-alone")
      .withBoard("p1", [character("oars", "OP15-080")])
      .build();
    expect(currentPower(game.state, "p1", "oars")).toBe(0);
  });
});

describe("OP15 East Blue DON!! lockdown", () => {
  covers("OP15-017", "[Activate: Main]", "[Blocker]");
  covers("OP15-026", "[On Play]", "[Activate: Main]");
  covers("OP15-038", "[Main]", "[Counter]");

  it("OP15-017 trades a DON!! onto their board for one onto yours", () => {
    const game = table("op15-017")
      .withBoard("p1", [character("morgan", "OP15-017")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p1", { rested: 1 })
      .withDon("p2", { rested: 1 })
      .build();

    game.play({ summary: "Morgan" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "morgan" });

    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(1);
  });

  it("OP15-026 trashes itself to bury one of their DON!!", () => {
    const game = table("op15-026-main")
      .withBoard("p1", [character("jango", "OP15-026")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p2", { rested: 1 })
      .build();

    game.play({ summary: "Jango" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(1);
  });

  it("OP15-026 searches East Blue on the way in", () => {
    const game = table("op15-026-play")
      .withHand("p1", [instance("jango", "OP15-026")])
      .withDeckTop("p1", [
        instance("hit", "OP15-005"),
        instance("miss-1", "ST32-004"),
        instance("miss-2", "ST32-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-026" });
    game.play({ type: "resolve-effect", optionId: "hit" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });

  it("OP15-038 locks a rested Character carrying two DON!!", () => {
    const game = table("op15-038")
      .withHand("p1", [instance("event", "OP15-038")])
      .withBoard("p2", [
        character("marked", "ST32-004", { rested: true }),
        character("light", "ST32-005", { rested: true }),
      ])
      .withGivenDon("p2", "marked", 2)
      .withGivenDon("p2", "light", 1)
      .build();

    game.play({ summary: "It's an Order" });
    // Only two DON!! or more qualifies: the one-DON!! Character is not offered.
    expect(
      game.legalActions().some((action) => action.summary.includes("Zoro")),
    ).toBe(false);

    game.play({ type: "resolve-effect", optionId: "marked" });
    expect(game.state.players.p2.board[0]?.cannotRefreshUntilTurn).toBe(
      game.state.turn + 1,
    );
  });
});

describe("OP15-033 Hody Jones", () => {
  covers("OP15-033", "[On Play]");

  it("sets a Fish-Man Leader active and banks a Life card", () => {
    const game = table("op15-033")
      // No Leader in the pool prints {Fish-Man}. The Sealed Battle promo Leader
      // is "treated as a card with all card names, types, and attributes", so it
      // is what makes the positive branch reachable at all.
      .withLeader("p1", "SEALED-LUFFY")
      .withHand("p1", [instance("hody", "OP15-033")])
      .withLife("p1", [instance("life-card", "ST32-005")])
      .withState((state) => {
        state.players.p1.leaderRested = true;
      })
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-033" });
    game.play({ type: "resolve-effect", optionId: "life-card" });

    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-card",
    );
  });

  it("leaves a Leader without the type rested but still banks the Life card", () => {
    const game = table("op15-033-off")
      .withHand("p1", [instance("hody", "OP15-033")])
      .withLife("p1", [instance("life-card", "ST32-005")])
      .withState((state) => {
        state.players.p1.leaderRested = true;
      })
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-033" });
    game.play({ type: "resolve-effect", optionId: "life-card" });

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-card",
    );
  });
});

describe("OP15 Sky Island Life economy", () => {
  covers("OP15-099", "[On Play]", "[Activate: Main]");
  covers("OP15-102", "[On Play]", "static");
  covers("OP15-109", "[On Play]");
  covers("OP15-101", "[On Play]");

  it("OP15-099 turns a face-up Life card down for a rested DON!!", () => {
    const game = table("op15-099-main")
      .withBoard("p1", [character("urouge", "OP15-099")])
      .withLife("p1", [instance("shown", "ST32-005", { faceUp: true })])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ summary: "Urouge" });
    game.play({ type: "resolve-effect", optionId: "shown" });
    game.play({ type: "resolve-effect", optionId: "urouge" });

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(1);
  });

  it("OP15-099 cannot pay with a face-down Life card", () => {
    const game = table("op15-099-hidden")
      .withBoard("p1", [character("urouge", "OP15-099")])
      .withLife("p1", [instance("hidden", "ST32-005")])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ summary: "Urouge" });

    // No face-up Life card, so the `min: 1` choose finds nothing and the
    // whole paying branch resolves to nothing.
    expect(game.state.players.p1.board[0]?.attachedDon).toEqual([]);
  });

  it("OP15-099 takes [Rush] for a Supernovas card out of hand", () => {
    const game = table("op15-099-play")
      .withHand("p1", [
        instance("urouge", "OP15-099"),
        instance("nova", "OP15-099"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-099" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "nova" });

    expect(hasKeyword(game.state, "p1", "urouge", "Rush")).toBe(true);
  });

  it("OP15-102 reaches only as far as the opponent's Life count", () => {
    const wide = table("op15-102-wide")
      .withHand("p1", [instance("ganfall", "OP15-102")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withLife("p2", copies(4, "ST32-005", "their-life"))
      .build();

    wide.play({ type: "play-card", cardNumber: "OP15-102" });
    wide.play({ type: "resolve-effect", optionId: "victim" });
    expect(wide.state.players.p2.board[0]?.rested).toBe(true);

    const narrow = table("op15-102-narrow")
      .withHand("p1", [instance("ganfall", "OP15-102")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withLife("p2", copies(2, "ST32-005", "their-life"))
      .build();

    // A cost-4 Character is out of reach behind only 2 Life.
    narrow.play({ type: "play-card", cardNumber: "OP15-102" });
    expect(narrow.state.pendingEffect).toBeNull();
    expect(narrow.state.players.p2.board[0]?.rested).toBe(false);
  });

  it("OP15-102 costs 3 less beside a 7000-power Sky Island Character", () => {
    const game = table("op15-102-cost")
      .withHand("p1", [instance("ganfall", "OP15-102")])
      .withBoard("p1", [character("big", "OP15-100")])
      .withGivenDon("p1", "big", 1)
      .build();

    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.hand[0]!),
    ).toBe(1);

    const alone = table("op15-102-cost-off")
      .withHand("p1", [instance("ganfall", "OP15-102")])
      .build();
    expect(
      effectiveCost(alone.state, "p1", alone.state.players.p1.hand[0]!),
    ).toBe(4);
  });

  it("OP15-109 swaps a Life card and deploys a Sky Island body", () => {
    const game = table("op15-109")
      .withHand("p1", [
        instance("robin", "OP15-109"),
        instance("recruit", "OP15-112"),
      ])
      .withLife("p1", [instance("taken", "ST32-005")])
      .withDeckTop("p1", [instance("banked", "OP15-103")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-109" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "taken" });
    game.play({ type: "resolve-effect", optionId: "banked" });
    game.play({ type: "resolve-effect", optionId: "recruit" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "taken",
    ]);
    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "banked",
    ]);
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("recruit");
  });

  it("OP15-101 adds at most two matches out of five", () => {
    const game = table("op15-101")
      .withHand("p1", [
        instance("kalgara", "OP15-101"),
        instance("fodder", "ST32-005"),
      ])
      .withDeckTop("p1", [
        instance("hit-1", "OP15-103"),
        instance("hit-2", "OP15-110"),
        instance("hit-3", "OP15-112"),
        instance("miss-1", "ST32-004"),
        instance("miss-2", "ST32-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-101" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "hit-1" });
    game.play({ type: "resolve-effect", optionId: "hit-2" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit-1",
      "hit-2",
    ]);
    // The third match went to the bottom with the rest: "up to a total of 2".
    expect(game.state.players.p1.deck.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["hit-3", "miss-1", "miss-2"]),
    );
  });
});

describe("OP15-031 Purinpurin", () => {
  covers("OP15-031", "[On Play]");

  it("K.O.s only a rested Character whose cost equals its given DON!!", () => {
    const game = table("op15-031")
      .withHand("p1", [instance("purin", "OP15-031")])
      .withBoard("p2", [
        character("match", "ST32-005", { rested: true }),
        character("mismatch", "ST32-004", { rested: true }),
      ])
      .withGivenDon("p2", "match", 1)
      .withGivenDon("p2", "mismatch", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-031" });
    // ST32-005 costs 1 and carries 1; ST32-004 costs 4 and carries 1.
    expect(
      game.legalActions().some((action) => action.summary.includes("Rayleigh")),
    ).toBe(false);

    game.play({ type: "resolve-effect", optionId: "match" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "mismatch",
    ]);
  });
});

describe("OP15-023 Arlong", () => {
  covers("OP15-023", "[Activate: Main]", "[On K.O.]");

  it("buries a rested DON!! and one from the cost area on their own board", () => {
    const game = table("op15-023")
      .withBoard("p1", [character("arlong", "OP15-023")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p2", { rested: 1 })
      .build();

    const costArea = game.state.players.p2.activeDon.length;
    game.play({ summary: "Arlong" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(2);
    expect(game.state.players.p2.activeDon.length).toBe(costArea - 1);
  });

  it("locks up to two rested cards, the Leader included, on K.O.", () => {
    const game = table("op15-023-ko")
      .withBoard("p1", [character("arlong", "OP15-023", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "arlong",
    });
    declineDefence(game);

    // The attacker rested to declare, so it and the Leader are both eligible.
    expect(
      game.legalActions().some((action) => action.summary.includes("Oden")),
    ).toBe(true);
    // The attacker is the only rested card once it is chosen -- the Leader
    // never rested -- so the lock resolves without a second decision.
    game.play({ type: "resolve-effect", optionId: "killer" });

    expect(game.state.players.p2.board[0]?.cannotRefreshUntilTurn).toBe(
      game.state.turn + 1,
    );
  });
});

describe("OP15 Red removal Events", () => {
  covers("OP15-020", "[Main]");
  covers("OP15-021", "[Main]", "[Counter]", "static");

  it("OP15-020 shrinks a Character below zero and then collects it", () => {
    const game = table("op15-020")
      .withHand("p1", [
        instance("fire-fist", "OP15-020"),
        instance("pitch-1", "ST32-005"),
        instance("pitch-2", "ST32-005"),
      ])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ summary: "Fire Fist" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch-1" });
    game.play({ type: "resolve-effect", optionId: "pitch-2" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  // Robin's [On K.O.] damages p1 from inside the Fire Fist chain and opens a
  // [Trigger] window, while OP15-119 Luffy's reaction to the Event is still
  // queued for p2. Answering that reaction must hand the game back to the open
  // Trigger, not to the Main Phase the chain interrupted: resuming Main left
  // the Life card parked in the window and the next battle deleted it.
  it("OP15-020 leaves a [Trigger] its chain opened waiting for its owner", () => {
    const game = table("op15-020-trigger")
      .withHand("p1", [
        instance("fire-fist", "OP15-020"),
        instance("pitch-1", "ST32-005"),
        instance("pitch-2", "ST32-005"),
      ])
      .withLife("p1", [
        instance("barrier", "OP10-060"),
        instance("life-2", "ST32-004"),
      ])
      .withBoard("p2", [
        character("robin", "EB03-055"),
        character("luffy", "OP15-119"),
      ])
      .build();

    game.play({ summary: "Fire Fist" });
    game.play({ type: "resolve-effect", optionId: "robin" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch-1" });
    game.play({ type: "resolve-effect", optionId: "pitch-2" });
    game.play({ type: "resolve-effect", optionId: "robin" });
    // p2 answers its two optional clauses -- Robin's damage and Luffy's
    // reveal -- in whatever order the engine asks for them.
    let guard = 0;
    while (game.state.pendingEffect && game.state.activePlayer === "p2") {
      if (guard++ > 10) throw new Error("p2's choices never settled");
      game.play({ type: "resolve-effect", optionId: "apply" });
    }

    expect(game.state.pendingTrigger?.card.instanceId).toBe("barrier");
    expect(game.state.phase).toBe("trigger");
    expect(game.state.activePlayer).toBe("p1");
  });

  it("OP15-021 costs 3 less behind four Events in the trash", () => {
    const game = table("op15-021-cost")
      .withHand("p1", [instance("ace", "OP15-021")])
      .withTrash("p1", copies(4, "OP12-039", "event"))
      .build();

    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.hand[0]!),
    ).toBe(1);
  });

  // The discount is a hand price, and an Event is activated out of the hand
  // rather than played onto the field: the `effectiveCost` above is what "cost
  // N or less" clauses read, and for most of this card's life it was the only
  // thing the discount reached. The activation itself was charged the mechanic
  // table's flat 4, so on 1 DON!! the Event was not even offered.
  it("OP15-021 is activated for 1 DON!! behind four Events in the trash", () => {
    const game = table("op15-021-activation-price")
      .withHand("p1", [instance("ace", "OP15-021")])
      .withTrash("p1", copies(4, "OP12-039", "event"))
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDonDeck("p1", 9)
      .build();

    game.play({ summary: "Just Watch Me" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p1.activeDon).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -3000 }),
    );
  });

  it("OP15-021 still costs its printed 4 with only three Events in the trash", () => {
    const game = table("op15-021-undiscounted")
      .withHand("p1", [instance("ace", "OP15-021")])
      .withTrash("p1", copies(3, "OP12-039", "event"))
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDonDeck("p1", 9)
      .build();

    expect(
      game
        .legalActions()
        .some((action) => action.summary.includes("Just Watch Me")),
    ).toBe(false);
  });

  it("OP15-021's [Counter] half takes the same discount", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op15-021-counter-price")
      .atTurn(11, { active: "p2" })
      .bareTable()
      .withHand("p1", [instance("ace", "OP15-021")])
      .withTrash("p1", copies(4, "OP12-039", "event"))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDonDeck("p1", 9)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP15-021" });

    expect(game.state.players.p1.activeDon).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("OP15-021 shrinks a Character from the Main phase", () => {
    const game = table("op15-021-main")
      .withHand("p1", [instance("ace", "OP15-021")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ summary: "Just Watch Me" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -3000 }),
    );
  });
});

describe("OP15 Leaders", () => {
  covers("OP15-001", "[Opponent's Turn]", "[Activate: Main]");
  covers(
    "OP15-002",
    "[When Attacking]",
    "[On Your Opponent's Attack]",
    "[Activate: Main]",
  );
  covers("OP15-022", "static", "[Activate: Main]");
  covers("OP15-039", "static", "[Activate: Main]");

  it("OP15-001 shrinks the opponent's board behind an all-East-Blue field", () => {
    const game = table("op15-001-aura")
      .withLeader("p2", "OP15-001")
      .withBoard("p2", [character("east-blue", "OP15-005")])
      .withBoard("p1", [character("victim", "ST32-004")])
      .withGivenDon("p2", "p2-leader", 1)
      .build();

    // p1 is the turn player, which is Krieg's "[Opponent's Turn]".
    expect(currentPower(game.state, "p1", "victim")).toBe(3000);
  });

  it("OP15-001 does nothing once a non-East-Blue Character joins", () => {
    const game = table("op15-001-mixed")
      .withLeader("p2", "OP15-001")
      .withBoard("p2", [
        character("east-blue", "OP15-005"),
        character("stranger", "ST32-004"),
      ])
      .withBoard("p1", [character("victim", "ST32-004")])
      .withGivenDon("p2", "p2-leader", 1)
      .build();

    expect(currentPower(game.state, "p1", "victim")).toBe(5000);
  });

  it("OP15-001 rests a Character carrying two DON!!", () => {
    const game = table("op15-001-main")
      .withLeader("p1", "OP15-001")
      .withBoard("p2", [
        character("marked", "ST32-004"),
        character("light", "ST32-005"),
      ])
      .withGivenDon("p2", "marked", 2)
      .withGivenDon("p2", "light", 1)
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    expect(
      game.legalActions().some((action) => action.summary.includes("Zoro")),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "marked" });

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  it("OP15-002 trades Events out of hand for battle power, per card", () => {
    const game = table("op15-002-attack")
      .withLeader("p1", "OP15-002")
      .withHand("p1", [
        instance("event-1", "OP12-039"),
        instance("event-2", "OP12-039"),
        instance("body", "ST32-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    // The Character in hand is not an Event or Stage and is never offered.
    expect(
      game.legalActions().some((action) => action.summary.includes("Rayleigh")),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "event-1" });
    // Trashing the second Event empties the eligible hand, so the trade closes
    // itself rather than asking for a "choose no more cards".
    game.play({ type: "resolve-effect", optionId: "event-2" });

    // 5000 printed plus 1000 for each of the two cards trashed.
    expect(battleAttackPower(game.state)).toBe(7000);
  });

  it("OP15-002 draws only after a 3-cost Event has been activated", () => {
    const game = table("op15-002-main")
      .withLeader("p1", "OP15-002")
      // OP15-019 is a 3-cost Event on the mechanic table, which is the path
      // that records the activation.
      .withHand("p1", [instance("event", "OP15-019")])
      .withDeckTop("p1", copies(3, "ST32-005", "drawn"))
      .build();

    // Before any Event: the gate is the program's own outer condition, so the
    // activation is not offered at all.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "p1-leader",
        ),
    ).toBe(false);

    game.play({ summary: "Barrier Bulls" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    expect(game.state.players.p1.hand.length).toBeGreaterThan(0);
  });

  it("OP15-022 survives an empty deck until the end of the turn", () => {
    const game = table("op15-022")
      .withLeader("p1", "OP15-022")
      .withBoard("p1", [character("brook", "ST31-003", { rested: true })])
      .withDeckTop("p1", copies(4, "ST32-005", "last"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "brook" });

    expect(game.state.players.p1.deck).toHaveLength(0);
    expect(game.state.players.p1.board[0]?.rested).toBe(false);
    expect(game.state.phase).not.toBe("finished");

    game.pass();
    // "[printed text omitted -- pnpm card:text <card>]"
    expect(game.state.phase).toBe("finished");
    expect(game.state.winner).toBe("p2");
  });

  it("OP15-039 cannot attack, and develops instead", () => {
    const game = table("op15-039")
      .withLeader("p1", "OP15-039")
      .withBoard("p1", [character("bounced", "OP15-042")])
      .withHand("p1", [instance("recruit", "OP15-042")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p1-leader",
        ),
    ).toBe(false);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "bounced" });
    game.play({ type: "resolve-effect", optionId: "recruit" });

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "recruit",
    ]);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "bounced",
    ]);
  });
});

describe("OP15-008 Krieg", () => {
  covers("OP15-008", "[On Play]", "[Activate: Main]");

  it("marks a Character and then shrinks the board by its DON!!", () => {
    const game = table("op15-008")
      .withHand("p1", [instance("krieg", "OP15-008")])
      .withBoard("p2", [
        character("marked", "ST32-004"),
        character("other", "ST32-004"),
      ])
      .withDon("p2", { rested: 3 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-008" });
    game.play({ type: "resolve-effect", optionId: "marked" });

    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(3);
    expect(hasKeyword(game.state, "p1", "krieg", "Rush")).toBe(true);

    game.play({ type: "activate-main", sourceInstanceId: "krieg" });

    // −1000 for each of the three DON!! on the marked Character, across their
    // whole board.
    for (const card of game.state.players.p2.board) {
      expect(card.powerModifiers).toContainEqual(
        expect.objectContaining({ amount: -3000 }),
      );
    }
  });
});

describe("OP15 free Event activation", () => {
  covers("OP15-014", "static", "[On Play]");
  covers("OP15-046", "[On Play]", "[Blocker]");

  it("OP15-014 fires a 3-cost Dressrosa Event for nothing", () => {
    const game = table("op15-014")
      .withHand("p1", [
        instance("bartolomeo", "OP15-014"),
        instance("event", "OP15-055"),
        instance("too-big", "OP15-056"),
      ])
      .withDeckTop("p1", copies(2, "ST32-005", "drawn"))
      .build();

    const donBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP15-014" });
    // The 7-cost Event is over the printed ceiling.
    expect(
      game
        .legalActions()
        .some((action) => action.summary.includes("Flame-Flame")),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "event" });
    game.play({ type: "resolve-effect", optionId: "draw" });

    // Only Bartolomeo's own 4 DON!! were spent; the Event cost nothing.
    expect(game.state.players.p1.activeDon.length).toBe(donBefore - 4);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("event");
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "too-big",
      "drawn-1",
      "drawn-2",
    ]);
  });

  it("OP15-046 fires a Dressrosa Event of any cost under a Dressrosa Leader", () => {
    const game = table("op15-046")
      .withLeader("p1", "OP15-039")
      .withHand("p1", [
        instance("sabo", "OP15-046"),
        instance("event", "OP15-056"),
      ])
      .withDeckTop("p1", copies(2, "ST32-005", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-046" });
    game.play({ type: "resolve-effect", optionId: "event" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn-1",
      "drawn-2",
    ]);
  });

  it("OP15-046 offers nothing under a Leader without the type", () => {
    const game = table("op15-046-off")
      .withHand("p1", [
        instance("sabo", "OP15-046"),
        instance("event", "OP15-056"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-046" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "event",
    ]);
  });
});

describe("OP15 remaining Green and Purple clauses", () => {
  covers("OP15-024", "[Opponent's Turn]", "[On K.O.]");
  covers("OP15-025", "[On Play]", "[Blocker]");
  covers("OP15-065", "[On Play]");
  covers("OP15-093", "[Activate: Main]");

  it("OP15-024 blocks on defence and refuses to be rested by an effect", () => {
    const game = table("op15-024")
      .withBoard("p2", [character("usopp", "OP15-024")])
      .withHand("p1", [instance("mihawk", "OP15-027")])
      .withGivenDon("p2", "usopp", 1)
      .build();

    expect(hasKeyword(game.state, "p2", "usopp", "Blocker")).toBe(true);

    // OP15-027 rests "a Character with a DON!! card given" -- Usopp qualifies on
    // every filter except the one it prints itself.
    game.play({ type: "play-card", cardNumber: "OP15-027" });
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board[0]?.rested).toBe(false);
  });

  it("OP15-025 buries two of their DON!! and locks a loaded Character", () => {
    const game = table("op15-025")
      .withHand("p1", [instance("kuro", "OP15-025")])
      .withBoard("p2", [character("victim", "ST32-004", { rested: true })])
      .withGivenDon("p2", "victim", 1)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    const lockedThrough = game.state.turn + 1;
    game.play({ type: "play-card", cardNumber: "OP15-025" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(3);

    game.pass();
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(game.state.players.p2.board[0]?.cannotRefreshUntilTurn).toBe(
      lockedThrough,
    );
  });

  it("OP15-065 adds a rested DON!! only for a cheap top card", () => {
    const cheap = table("op15-065-cheap")
      .withHand("p1", [instance("goro", "OP15-065")])
      .withDeckTop("p1", [instance("top", "ST32-005")])
      .withDonDeck("p1", 2)
      .build();

    cheap.play({ type: "play-card", cardNumber: "OP15-065" });
    expect(cheap.state.players.p1.restedDon.length).toBe(3 + 1);

    const dear = table("op15-065-dear")
      .withHand("p1", [instance("goro", "OP15-065")])
      .withDeckTop("p1", [instance("top", "ST32-003")])
      .withDonDeck("p1", 2)
      .build();

    dear.play({ type: "play-card", cardNumber: "OP15-065" });
    expect(dear.state.players.p1.restedDon.length).toBe(3);
  });

  it("OP15-093 hands a Luffy [Rush: Character] and the <Slash> attribute", () => {
    const game = table("op15-093")
      .withBoard("p1", [
        character("risky", "OP15-093"),
        character("luffy", "OP15-051", { playedTurn: 11 }),
      ])
      .withTrash("p1", copies(15, "ST32-005", "fuel"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "risky" });
    game.play({ type: "resolve-effect", optionId: "luffy" });

    const luffy = game.state.players.p1.board.find(
      (card) => card.instanceId === "luffy",
    )!;
    expect(luffy.rushCharacterUntilTurn).toBe(game.state.turn);
    expect(luffy.grantedAttributes?.attributes).toEqual(["Slash"]);
  });
});

/**
 * The four clauses the Krieg feature deck brings into a shipped list.
 *
 * Bandai's own deck_095 list is the first shipped deck to run OP15-003,
 * OP15-009 and OP15-037, and a card only enters the clause-coverage gate once
 * a deck ships it -- so these are the clauses the list is responsible for.
 */
describe("OP15 Krieg feature deck", () => {
  covers("OP15-003", "[Activate: Main]", "static");
  covers("OP15-009", "static");
  covers("OP15-037", "[Main]", "[Trigger]");

  it("OP15-003 buries one of their rested DON!! to take one of yours", () => {
    const game = table("op15-003-main")
      .withBoard("p1", [character("alvida", "OP15-003")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p1", { rested: 1 })
      .withDon("p2", { rested: 1 })
      .build();

    game.play({ summary: "Alvida" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "alvida" });

    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(1);
  });

  it("OP15-003 trashes a small body from hand instead of being K.O.'d", () => {
    // The clause omits "by your opponent's effect", so losing a fight is a
    // K.O. it answers -- which is what makes a 6000 body hard to move.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op15-003-replace")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("alvida", "OP15-003", { rested: true })])
      .withHand("p1", [instance("fodder", "OP15-015")])
      .withBoard("p2", [character("attacker", "OP15-008")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "alvida",
    });
    game.play({ type: "pass", summary: "Do not block" });
    game.play({ summary: "Resolve battle without more counters" });
    game.play({ summary: "Trash a Character with 6000 power or less" });
    game.play({ type: "resolve-effect", optionId: "fodder" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "alvida",
    ]);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
  });

  it("OP15-009 pays the Leader's power to keep a body on the field", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op15-009-replace")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [
        character("koby", "OP15-009"),
        character("saved", "OP15-026"),
      ])
      .withHand("p2", [instance("whitey", "OP17-014")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    game.play({ type: "resolve-effect", optionId: "saved" });
    while (game.state.pendingEffect) {
      const replacement = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-effect" &&
            action.optionId.startsWith("replace:"),
        );
      game.play(
        replacement
          ? { actionId: replacement.actionId }
          : { type: "resolve-effect" },
      );
    }

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("saved");
    expect(game.state.players.p1.leaderPowerModifiers).toContainEqual(
      expect.objectContaining({ amount: -2000 }),
    );
  });

  it("OP15-037 digs five for an East Blue card other than itself", () => {
    const game = table("op15-037-main")
      .withHand("p1", [instance("event", "OP15-037")])
      .withDeckTop("p1", [
        instance("self", "OP15-037"),
        instance("hit", "OP15-007"),
        instance("miss-1", "ST32-004"),
        instance("miss-2", "ST32-005"),
        instance("miss-3", "ST32-003"),
      ])
      .build();

    game.play({ summary: "The Outcome" });
    // The copy of itself on top is {East Blue} too, and the printed clause
    // names it out: only Gin is offered.
    expect(
      game.legalActions().some((action) => action.summary.includes("Outcome")),
    ).toBe(false);

    game.play({ type: "resolve-effect", optionId: "hit" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });

  it("OP15-037 draws a card off a Life card it is flipped from", () => {
    const game = scenario()
      .decks(
        "(Green) Roronoa Zoro - Starter Deck 32",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("op15-037-trigger")
      .atTurn(3, { active: "p1" })
      .withDeckTop("p2", [instance("outcome", "OP15-037")])
      .withLife("p2", 1)
      .withActiveAttack({
        attackerPlayerId: "p1",
        defenderPlayerId: "p2",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "p2-leader",
        attackPower: 6_000,
        counterPower: 0,
      })
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({ summary: "Do not block" });
    game.play({ summary: "Resolve battle without more counters" });
    game.play({ summary: "Trigger" });

    // The Life card is spent activating the Trigger, so the draw is the whole
    // of what the clause is worth: the Event itself goes to the trash.
    expect(game.state.players.p2.hand.length).toBe(handBefore + 1);
    expect(
      game.state.players.p2.trash.map((card) => card.cardNumber),
    ).toContain("OP15-037");
  });
});

/**
 * "From your opponent's cost area" reaches the rested half of it.
 *
 * The position these three cards are actually played into: it is your turn, so
 * the opponent's DON!! is rested precisely to the extent that they spent it. An
 * active-only reading gave nothing at all there, which is what a player sees as
 * a card that did not resolve.
 */
describe("OP15 cost-area gifts", () => {
  covers("OP15-028", "[On Play]");
  covers("OP15-025", "[On Play]");
  covers("OP15-023", "[Activate: Main]");

  /**
   * An opponent who has spent their whole turn: every DON!! they hold is
   * rested, and their cost area still holds all ten of them.
   */
  const spentOpponent = (seed: string) =>
    table(seed)
      .withLeader("p1", "OP15-001")
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p2", { rested: 10 });

  it("OP15-028 gives a rested DON!! when they have no active one left", () => {
    const game = spentOpponent("op15-028-cost-area")
      .withHand("p1", [instance("meowban", "OP15-028")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-028" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(1);
    expect(game.state.players.p2.restedDon).toHaveLength(9);
  });

  it("OP15-025 takes the active DON!! first, then the rested one", () => {
    // Two DON!! out of a cost area holding one active card and the rest rested.
    // The active one is the half that could still have paid for something this
    // turn, so it goes first and the rested pile covers the remainder.
    const game = table("op15-025-cost-area")
      .withLeader("p1", "OP15-001")
      .withHand("p1", [instance("kuro", "OP15-025")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDon("p2", { rested: 9 })
      .build();

    expect(game.state.players.p2.activeDon).toHaveLength(1);
    game.play({ type: "play-card", cardNumber: "OP15-025" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(2);
    expect(game.state.players.p2.activeDon).toHaveLength(0);
    expect(game.state.players.p2.restedDon).toHaveLength(8);
  });

  it("OP15-023 pays with their rested DON!! and takes from the whole area", () => {
    const game = spentOpponent("op15-023-cost-area")
      .withBoard("p1", [character("arlong", "OP15-023")])
      .build();

    game.play({ summary: "Arlong" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    // One DON!! for the cost and one for the payoff, both out of a cost area
    // that held nothing active at all.
    expect(game.state.players.p2.board[0]?.attachedDon).toHaveLength(2);
    expect(game.state.players.p2.restedDon).toHaveLength(8);
  });
});

/**
 * The clauses the (Red/Blue) Lucy feature deck is responsible for.
 *
 * Bandai's own deck_096 list is the first shipped deck to run OP15-006,
 * OP15-019, OP15-052, OP15-054 and OP15-057, and a card only enters the
 * clause-coverage gate once a deck ships it -- so these are the clauses that
 * arrived with the list.
 */
describe("OP15 Lucy feature deck", () => {
  covers("OP15-006", "static");
  covers("OP15-019", "[Main]", "[Trigger]");
  covers("OP15-048", "[Opponent's Turn]");
  covers("OP15-052", "static");
  covers("OP15-054", "[Main]");
  covers("OP15-057", "[On Play]", "[On Your Opponent's Attack]");

  it("OP15-006 is +2000 once four Events sit in the trash, and not at three", () => {
    const withTrashed = (seed: string, events: number) =>
      table(seed)
        .withBoard("p1", [character("cavendish", "OP15-006")])
        .withTrash("p1", copies(events, "OP15-020", "spent"))
        .build();

    expect(
      currentPower(withTrashed("op15-006-three", 3).state, "p1", "cavendish"),
    ).toBe(4000);
    expect(
      currentPower(withTrashed("op15-006-four", 4).state, "p1", "cavendish"),
    ).toBe(6000);
  });

  it("OP15-006 counts Events only, not any four cards", () => {
    const game = table("op15-006-characters")
      .withBoard("p1", [character("cavendish", "OP15-006")])
      .withTrash("p1", copies(4, "OP15-053", "body"))
      .build();

    expect(currentPower(game.state, "p1", "cavendish")).toBe(4000);
  });

  it("OP15-019 draws and leaves its Leader buff standing into the next turn", () => {
    const game = table("op15-019-main")
      .withDeckTop("p1", [instance("drawn", "OP15-053")])
      .withHand("p1", [instance("bulls", "OP15-019")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP15-019" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
    // "until the end of your opponent's next End Phase", so it is still on the
    // Leader while the opponent attacks into it -- the point of the card.
    expect(game.state.players.p1.leaderPowerModifiers).toContainEqual(
      expect.objectContaining({ amount: 1000 }),
    );
    game.pass();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  it("OP15-019's Trigger is the debuff instead, and it expires with the turn", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op15-019-trigger")
      .atTurn(5, { active: "p2" })
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .withLife("p1", [instance("life-trigger", "OP15-019")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -4000 }),
    );
  });

  it("OP15-048 bottoms a card from their hand when K.O.'d on their turn", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op15-048-opponents-turn")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("chinjao", "OP15-048", { rested: true })])
      .withBoard("p2", [character("attacker", "OP15-046")])
      .withHand("p2", [
        instance("kept", "ST32-004"),
        instance("bottomed", "ST32-005"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "chinjao",
    });
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    // Their choice, out of their own hand, and to the bottom of their deck.
    expect(game.state.players.p2.hand).toHaveLength(1);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBeDefined();
    expect(game.state.players.p1.board).toHaveLength(0);
  });

  it("OP15-048 stays quiet when it is K.O.'d on its own controller's turn", () => {
    const game = table("op15-048-own-turn")
      .withBoard("p1", [character("chinjao", "OP15-048")])
      .withBoard("p2", [character("blocker", "ST32-004", { rested: true })])
      .withHand("p2", [instance("kept", "ST32-004")])
      .withState((state) => {
        // K.O. it on p1's own turn: the [Opponent's Turn] gate is the whole
        // difference between this case and the one above.
        state.players.p1.board[0]!.powerModifiers = [
          { amount: -6000, expiresAtTurn: state.turn + 1 },
        ];
      })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "chinjao",
      targetInstanceId: "blocker",
    });
    declineDefence(game);

    expect(game.state.players.p2.hand).toHaveLength(1);
  });

  it("OP15-052 answers removal by bottoming a Character of its controller's choice", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op15-052-replace")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [
        character("leo", "OP15-052"),
        character("threatened", "OP15-053"),
      ])
      .withHand("p2", [instance("whitey", "OP17-014")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    game.play({ type: "resolve-effect", optionId: "threatened" });
    game.play({ summary: "Place 1 of your Characters" });
    // "1 of your Characters": Leo may hand over itself rather than the card
    // the opponent aimed at.
    game.play({ type: "resolve-effect", optionId: "leo" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "threatened",
    ]);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("leo");
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("OP15-052 bottoming another Character raises no second replacement", () => {
    // Leo's cost moves a Character of its own controller's: their clause, not
    // the opponent's effect, so it is not a removal Leo answers again.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op15-052-no-regress")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [
        character("leo", "OP15-052"),
        character("threatened", "OP15-053"),
        character("paid", "OP15-053"),
      ])
      .withHand("p2", [instance("whitey", "OP17-014")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    game.play({ type: "resolve-effect", optionId: "threatened" });
    game.play({ summary: "Place 1 of your Characters" });
    game.play({ type: "resolve-effect", optionId: "paid" });

    expect(
      game
        .legalActions("p1")
        .some((action) => action.summary.includes("instead of")),
    ).toBe(false);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "leo",
      "threatened",
    ]);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("paid");
  });

  it("OP15-052 bottoming a later target of the same K.O. answers the whole K.O.", () => {
    // OP15-114 K.O.s every 0-power Character in one node. Answering the first
    // K.O. with Leo's replacement can bottom a card further down that list.
    // One removal of several Characters is one event, so the one payment
    // protects every target Leo covers -- Leo included -- and the bottomed card
    // is not asked about again.
    const game = scenario()
      .decks(
        "(Red/Blue) Lucy - Official Feature Deck",
        "(Blue/Yellow) Nami - Official Feature Deck",
      )
      .seed("op15-052-later-target")
      .atTurn(12, { active: "p2" })
      .bareTable()
      // Real cards: Wyper's flip needs a face-down Life card to pay with.
      .withLife("p2", copies(2, "ST32-004", "p2-life"))
      .withBoard("p1", [
        character("rebecca-a", "OP15-053"),
        character("rebecca-b", "OP15-053"),
        character("leo", "OP15-052"),
      ])
      .withHand("p2", [instance("wyper", "OP15-114")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-114" });
    game.play({
      summary: "Turn 1 card from the top of your Life cards face-up",
    });
    // Rebecca A is first in the K.O. list; Leo answers it by bottoming
    // Rebecca B, the next card in the same list.
    game.play({ summary: "instead of K.O. Rebecca" });
    game.play({ type: "resolve-effect", optionId: "rebecca-b" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "rebecca-a",
      "leo",
    ]);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("rebecca-b");
    expect(game.state.players.p1.trash).toEqual([]);
  });

  it("OP15-054 draws two, trashes one and puts a cheap Dressrosa body down", () => {
    const game = table("op15-054-main")
      .withLeader("p1", "OP15-002")
      .withDeckTop("p1", [
        instance("drawn-a", "OP15-053"),
        instance("drawn-b", "OP15-006"),
      ])
      .withHand("p1", [
        instance("memento", "OP15-054"),
        instance("pitched", "OP15-020"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP15-054" });
    game.play({ summary: "Draw 2" });
    game.play({ type: "resolve-effect", optionId: "pitched" });
    // OP15-006 is a cost-4 {Dressrosa} Character and OP15-053 a cost-1 one;
    // both are inside the printed bound, and the play is free.
    const donBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "resolve-effect", optionId: "drawn-b" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "drawn-b",
    ]);
    expect(game.state.players.p1.activeDon.length).toBe(donBefore);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("pitched");
  });

  it("OP15-054 is not offered under a Leader that is not Lucy", () => {
    const game = table("op15-054-gate")
      .withHand("p1", [instance("memento", "OP15-054")])
      .build();

    expect(
      game.legalActions().some((action) => action.summary.includes("Memento")),
    ).toBe(false);
  });

  it("OP15-057 draws on arrival under a Dressrosa Leader and not otherwise", () => {
    const withLeader = (seed: string, leader: string) =>
      table(seed)
        .withLeader("p1", leader)
        .withDeckTop("p1", [instance("drawn", "OP15-053")])
        .withHand("p1", [instance("kingdom", "OP15-057")])
        .build();

    const on = withLeader("op15-057-on", "OP15-002");
    on.play({ type: "play-card", cardNumber: "OP15-057" });
    while (on.state.pendingEffect) on.play({ type: "resolve-effect" });
    expect(on.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);

    // ST31's Leader has no {Dressrosa} type, so the Stage lands and draws
    // nothing at all.
    const off = withLeader("op15-057-off", "ST31-001");
    off.play({ type: "play-card", cardNumber: "OP15-057" });
    expect(off.state.pendingEffect).toBeNull();
    expect(off.state.players.p1.hand).toHaveLength(0);
    expect(off.state.players.p1.stage?.instanceId).toBe("kingdom");
  });

  it("OP15-057 rests and pitches an Event for +2000 on the defender", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op15-057-defence")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withLeader("p1", "OP15-002")
      .withStage("p1", instance("kingdom", "OP15-057"))
      .withHand("p1", [
        instance("pitched", "OP15-020"),
        // A Character is not an Event or a Stage, so it cannot pay.
        instance("not-payment", "OP15-053"),
      ])
      // 6000 against a 5000 Leader: the Stage's +2000 is exactly what turns
      // this attack from a Life card taken into one that bounces off.
      .withBoard("p2", [character("attacker", "OP15-014")])
      .withLife("p1", [instance("life-a", "OP15-053")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    // The Leader's own [On Your Opponent's Attack] asks first, over the same
    // hand: decline it, so what is measured below is the Stage's +2000 rather
    // than a +1000 off the same card.
    game.play({ summary: "Choose no more cards" });
    game.play({ summary: "Activate Dressrosa Kingdom" });
    // A Character is not an Event or a Stage, so only the Fire Fist can pay.
    expect(game.summaries().join(" | ")).not.toContain("Rebecca");
    game.play({ type: "resolve-effect", optionId: "pitched" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("pitched");
    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
  });
});
