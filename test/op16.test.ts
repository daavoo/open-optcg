import { describe, expect, it } from "vitest";
import {
  battleAttackPower,
  currentPower,
  effectiveCost,
  hasKeyword,
  observe,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * OP16 "Uta's Song", card by card.
 *
 * Built the same way `test/op15.test.ts` is: the set ships as a whole series
 * rather than as a deck, so each position is a neutral ST31/ST32 table with the
 * OP16 card put where the clause under test needs it. A clause that only works
 * beside its own archetype is a clause with a hidden dependency, and a neutral
 * board is what surfaces one.
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

/** Decline the block and Counter steps so a declared attack resolves. */
const declineDefence = (game: {
  state: { phase: string };
  pass: () => unknown;
}) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

describe("OP16 Whitebeard reveal shell", () => {
  covers("OP16-002", "[On Play]");
  covers("OP16-007", "[On Play]", "[Blocker]");
  covers("OP16-010", "[On Play]");
  covers("OP16-011", "[On Play]", "[When Attacking]");

  it("OP16-002 shows an 8000-power Character without spending it", () => {
    const game = table("op16-002")
      .withHand("p1", [
        instance("izo", "OP16-002"),
        instance("proof", "OP16-011"),
      ])
      .withDeckTop("p1", copies(1, "ST32-005", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-002" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "proof" });

    // The revealed card is still in hand: a reveal costs nothing but privacy.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["proof", "drawn-1"]),
    );
  });

  it("OP16-002 has nothing to reveal without an 8000-power Character", () => {
    const game = table("op16-002-empty")
      .withHand("p1", [
        instance("izo", "OP16-002"),
        instance("wrong", "ST32-004"),
      ])
      .withDeckTop("p1", copies(1, "ST32-005", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-002" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    // ST32-004 is 5000 power, so the `min: 1` choose finds nothing and the
    // paying branch resolves to nothing.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "wrong",
    ]);
  });

  it("OP16-010 K.O.s a 2000-base-power Character for the same reveal", () => {
    const game = table("op16-010")
      .withHand("p1", [
        instance("namule", "OP16-010"),
        instance("proof", "OP16-011"),
      ])
      .withBoard("p2", [
        character("small", "ST32-005"),
        character("big", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-010" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "proof" });
    // Only the 2000-power body is reachable.
    expect(
      game.legalActions().some((action) => action.summary.includes("Rayleigh")),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
  });

  it("OP16-007 blocks, and shrinks a Character for the reveal", () => {
    const game = table("op16-007")
      .withHand("p1", [
        instance("jozu", "OP16-007"),
        instance("proof", "OP16-011"),
      ])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-007" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "proof" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(hasKeyword(game.state, "p1", "jozu", "Blocker")).toBe(true);
    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -1000 }),
    );
  });

  it("OP16-011 sweeps two small bodies only with a DON!! given", () => {
    const bare = table("op16-011-bare")
      .withBoard("p1", [character("vista", "OP16-011", { playedTurn: 1 })])
      .withBoard("p2", [character("small", "ST32-005")])
      .build();

    bare.play({
      type: "attack",
      attackerInstanceId: "vista",
      targetInstanceId: "p2-leader",
    });
    expect(bare.state.pendingEffect).toBeNull();

    const donned = table("op16-011-don")
      .withBoard("p1", [character("vista", "OP16-011", { playedTurn: 1 })])
      .withBoard("p2", [
        character("small-1", "ST32-005"),
        character("small-2", "ST32-005"),
      ])
      .withGivenDon("p1", "vista", 1)
      .build();

    donned.play({
      type: "attack",
      attackerInstanceId: "vista",
      targetInstanceId: "p2-leader",
    });
    donned.play({ type: "resolve-effect", optionId: "small-1" });
    donned.play({ type: "resolve-effect", optionId: "small-2" });

    expect(donned.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP16-008 Squard", () => {
  covers("OP16-008", "[On Play]");

  it("trades a 10000-base-power body for an 8000-power K.O.", () => {
    const game = table("op16-008")
      .withHand("p1", [instance("squard", "OP16-008")])
      .withBoard("p1", [character("newgate", "OP16-003")])
      .withBoard("p2", [character("victim", "OP16-013")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-008" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "newgate" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("newgate");
    // OP16-013's own [On K.O.] then fires: it may K.O. something back.
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP16-009 Speed Jil", () => {
  covers("OP16-009", "[On Play]");

  it("spends an 8000-power Character for [Rush] and a lasting +2000", () => {
    const game = table("op16-009")
      .withHand("p1", [
        instance("jil", "OP16-009"),
        instance("fuel", "OP16-011"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-009" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fuel" });

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fuel");
    expect(hasKeyword(game.state, "p1", "jil", "Rush")).toBe(true);
    expect(currentPower(game.state, "p1", "jil")).toBe(7000);
  });
});

describe("OP16 Double Attack", () => {
  covers("OP16-003", "[Your Turn]", "[On Play]");
  covers("OP16-039", "[Main]", "[Trigger]");

  it("OP16-003 makes its controller's Leader hit for two Life", () => {
    const game = table("op16-003")
      .withBoard("p1", [character("newgate", "OP16-003")])
      .withLife("p2", copies(3, "ST32-005", "their-life"))
      .withDeckTop("p2", copies(3, "ST32-004", "p2-deck"))
      .build();

    expect(hasKeyword(game.state, "p1", "p1-leader", "Double Attack")).toBe(
      true,
    );
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    // Two points, not one: the second is paid by the settle step once the
    // first has finished landing.
    expect(game.state.players.p2.life).toHaveLength(1);
  });

  it("OP16-003 grants nothing on the opponent's turn", () => {
    const game = table("op16-003-defence")
      .withBoard("p2", [character("newgate", "OP16-003")])
      .build();

    expect(hasKeyword(game.state, "p2", "p2-leader", "Double Attack")).toBe(
      false,
    );
  });

  it("OP16-039 hands [Double Attack] to a Luffy and rests two small bodies", () => {
    const game = table("op16-039")
      .withLeader("p1", "OP16-022")
      .withHand("p1", [instance("event", "OP16-039")])
      .withBoard("p1", [character("luffy", "OP16-095")])
      .withBoard("p2", [
        character("small-1", "ST32-005"),
        character("small-2", "ST32-005"),
      ])
      .build();

    game.play({ summary: "Gum-Gum Twin Jet Pistol" });
    game.play({ type: "resolve-effect", optionId: "luffy" });
    game.play({ type: "resolve-effect", optionId: "small-1" });
    game.play({ type: "resolve-effect", optionId: "small-2" });

    expect(hasKeyword(game.state, "p1", "luffy", "Double Attack")).toBe(true);
    expect(game.state.players.p2.board.every((card) => card.rested)).toBe(true);
  });
});

describe("OP16 Impel Down tempo", () => {
  covers("OP16-025", "[When Attacking]");
  covers("OP16-029", "[When Attacking]");
  covers("OP16-036", "[On Play]", "[When Attacking]");
  covers("OP16-037", "[On Play]");

  it.each([
    ["OP16-025", "OP16-029"],
    ["OP16-029", "OP16-025"],
  ])("%s deploys a cheap body only beside %s", (attacker, partner) => {
    const alone = table(`op16-pair-${attacker}-alone`)
      .withBoard("p1", [character("attacker", attacker, { playedTurn: 1 })])
      .withHand("p1", [instance("cheap", "ST32-005")])
      .build();

    alone.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    expect(alone.state.pendingEffect).toBeNull();

    const paired = table(`op16-pair-${attacker}`)
      .withBoard("p1", [
        character("attacker", attacker, { playedTurn: 1 }),
        character("partner", partner),
      ])
      .withHand("p1", [instance("cheap", "ST32-005")])
      .build();

    paired.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    paired.play({ type: "resolve-effect", optionId: "cheap" });

    expect(
      paired.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("cheap");
  });

  it("OP16-036 attacks for the opponent Leader's power", () => {
    const game = table("op16-036-attack")
      .withBoard("p1", [character("bentham", "OP16-036", { playedTurn: 1 })])
      .build();

    // 1000 printed, and the opposing Leader is 5000.
    expect(currentPower(game.state, "p1", "bentham")).toBe(1000);
    game.play({
      type: "attack",
      attackerInstanceId: "bentham",
      targetInstanceId: "p2-leader",
    });
    expect(battleAttackPower(game.state)).toBe(5000);
  });

  it.each([
    ["OP16-036", 0, 7000],
    ["OP16-055", 1, 8000],
  ])(
    "%s copies the power the opposing Leader is actually defending with",
    (cardNumber, givenDon, expected) => {
      // EB04-001 Jewelry Bonney is printed at 5000 and gains +2000 on the
      // opponent's turn at 1 Life or less, so she defends at 7000 -- the clause
      // copies "your opponent's Leader's power", and only its left-hand side
      // says base power. Pinned from a real game: a 4-DON!! attack read 6000
      // into a 7000 Leader and bounced.
      let game = table(`op16-copy-buffed-${cardNumber}`)
        .withLeader("p2", "EB04-001")
        .withLife("p2", 1)
        .withBoard("p1", [character("bentham", cardNumber, { playedTurn: 1 })]);
      if (givenDon > 0) game = game.withGivenDon("p1", "bentham", givenDon);
      const built = game.build();

      expect(currentPower(built.state, "p2", "p2-leader")).toBe(7000);

      built.play({
        type: "attack",
        attackerInstanceId: "bentham",
        targetInstanceId: "p2-leader",
      });
      expect(battleAttackPower(built.state)).toBe(expected);
    },
  );

  it("OP16-037 rests only under an Impel Down Leader", () => {
    const off = table("op16-037-off")
      .withHand("p1", [instance("galdino", "OP16-037")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    off.play({ type: "play-card", cardNumber: "OP16-037" });
    expect(off.state.pendingEffect).toBeNull();

    const on = table("op16-037-on")
      .withLeader("p1", "OP16-022")
      .withHand("p1", [instance("galdino", "OP16-037")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    on.play({ type: "play-card", cardNumber: "OP16-037" });
    on.play({ type: "resolve-effect", optionId: "victim" });
    expect(on.state.players.p2.board[0]?.rested).toBe(true);
  });
});

describe("OP16-030 Trafalgar Law", () => {
  covers("OP16-030", "[On Play]", "[End of Your Turn]");

  it("locks a rested Character and refreshes its own cheap green board", () => {
    const game = table("op16-030")
      .withHand("p1", [instance("law", "OP16-030")])
      .withBoard("p1", [
        character("green", "OP16-037", { rested: true }),
        // Green too, but cost 6 -- outside the printed ceiling.
        character("other", "ST32-003", { rested: true }),
      ])
      .withBoard("p2", [character("locked", "ST32-004", { rested: true })])
      .withDeckTop("p1", copies(3, "ST32-005", "p1-deck"))
      // `bareTable()` empties both decks, and the opponent draws on their turn.
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    const lockedThrough = game.state.turn + 1;
    game.play({ type: "play-card", cardNumber: "OP16-030" });
    game.play({ type: "resolve-effect", optionId: "locked" });
    expect(game.state.players.p2.board[0]?.cannotRefreshUntilTurn).toBe(
      lockedThrough,
    );

    game.pass();
    // The green cost-2 body woke up; the green cost-6 one did not.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "green")
        ?.rested,
    ).toBe(false);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "other")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP16 Navy ramp", () => {
  covers("OP16-063", "[On Play]", "[Activate: Main]");
  covers("OP16-065", "[On Play]", "[Activate: Main]");
  covers("OP16-075", "[On Play]");
  covers("OP16-060", "[Activate: Main]");

  it("OP16-063 adds two rested DON!! and can silence a Blocker", () => {
    const game = table("op16-063")
      .withHand("p1", [instance("kuzan", "OP16-063")])
      .withBoard("p2", [character("blocker", "OP16-007")])
      .withDonDeck("p1", 3)
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({ type: "play-card", cardNumber: "OP16-063" });
    // Its 7-cost payment rests seven, and the clause adds two more on top.
    expect(game.state.players.p1.restedDon.length).toBe(restedBefore + 7 + 2);
    expect(game.state.players.p1.donDeck).toHaveLength(1);

    game.play({ type: "activate-main", sourceInstanceId: "kuzan" });
    game.play({ type: "resolve-effect", optionId: "blocker" });

    expect(game.state.players.p2.board[0]?.blockerDisabledUntilTurn).toBe(
      game.state.turn,
    );
    // The keyword is untouched -- only the ability is switched off.
    expect(hasKeyword(game.state, "p2", "blocker", "Blocker")).toBe(true);
  });

  it("OP16-065 nets an active DON!! under a Navy Leader", () => {
    const game = table("op16-065")
      .withLeader("p1", "OP16-060")
      .withBoard("p1", [character("sakazuki", "OP16-065")])
      .withDonDeck("p1", 3)
      .build();

    const active = game.state.players.p1.activeDon.length;
    game.play({ summary: "Sakazuki" });

    expect(game.state.players.p1.activeDon.length).toBe(active + 1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("OP16-075 adds one active and one rested DON!! under a Navy Leader", () => {
    const game = table("op16-075")
      .withLeader("p1", "OP16-060")
      .withHand("p1", [instance("garp", "OP16-075")])
      .withDonDeck("p1", 3)
      .build();

    const active = game.state.players.p1.activeDon.length;
    const rested = game.state.players.p1.restedDon.length;
    game.play({ type: "play-card", cardNumber: "OP16-075" });

    // Five active DON!! pay for Garp, then one comes back active and one rested.
    expect(game.state.players.p1.activeDon.length).toBe(active - 5 + 1);
    expect(game.state.players.p1.restedDon.length).toBe(rested + 5 + 1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("OP16-060 spends 8 DON!! for three differently-named Admirals", () => {
    const game = table("op16-060")
      .withLeader("p1", "OP16-060")
      .withHand("p1", [
        instance("kuzan", "OP16-063"),
        instance("sakazuki", "OP16-065"),
        instance("kuzan-2", "OP16-063"),
      ])
      .build();

    game.play({ summary: "Sengoku" });
    game.play({ type: "resolve-effect", optionId: "kuzan" });
    // The second Kuzan shares a name and is no longer on offer.
    expect(
      game
        .legalActions()
        .some((action) => action.summary.includes("Choose Kuzan")),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "sakazuki" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["kuzan", "sakazuki"]),
    );
  });
});

describe("OP16 Blackbeard recursion", () => {
  covers("OP16-110", "[On K.O.]", "[Trigger]");
  covers("OP16-114", "[On K.O.]", "[Trigger]");
  covers("OP16-107", "[On K.O.]", "[Trigger]");

  it("OP16-110 draws and rests when it dies", () => {
    const game = table("op16-110")
      .withBoard("p1", [character("vasco", "OP16-110", { rested: true })])
      .withBoard("p2", [
        character("killer", "ST32-002"),
        character("victim", "ST32-004"),
      ])
      .withDeckTop("p1", copies(1, "ST32-005", "drawn"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "vasco",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn-1",
    ]);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")
        ?.rested,
    ).toBe(true);
  });

  it("OP16-114 K.O.s a cost-4 Character when it dies", () => {
    const game = table("op16-114")
      .withBoard("p1", [character("laffitte", "OP16-114", { rested: true })])
      .withBoard("p2", [
        character("killer", "ST32-002"),
        character("victim", "ST32-004"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "laffitte",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "killer",
    ]);
  });

  it("OP16-107 hands the opponent their own top Life card", () => {
    const game = table("op16-107")
      .withBoard("p1", [character("burgess", "OP16-107", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withLife("p2", [instance("their-life", "ST32-005")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "burgess",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "their-life" });

    expect(game.state.players.p2.life).toHaveLength(0);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "their-life",
    );
  });
});

describe("OP16 K.O. replacements", () => {
  covers("OP16-014", "static", "[On K.O.]");
  covers("OP16-018", "static");

  /**
   * A position where the opponent is about to K.O. one of p1's Characters with
   * an effect, which is the only window a replacement is offered in.
   *
   * OP16-006 Shanks is the removal: "[printed text omitted -- pnpm card:text OP16-006]"
   */
  const opponentRemoval = (seed: string) =>
    table(seed)
      .withHand("p2", [instance("shanks", "OP16-006")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"));

  it("OP16-018 Rockstar trades a big Character out of hand for the K.O.", () => {
    const game = opponentRemoval("op16-018")
      .withBoard("p1", [character("rockstar", "OP16-018")])
      .withHand("p1", [instance("fuel", "OP16-013")])
      .build();

    game.pass();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "rockstar" });

    const trade = game
      .legalActions()
      .find((action) => action.summary.includes("6000 power or more"));
    expect(trade, "Rockstar's replacement should be offered").toBeDefined();
    game.submit(trade!);
    game.play({ type: "resolve-effect", optionId: "fuel" });

    // Rockstar survives; the 8000-power Character in hand paid for it.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "rockstar",
    ]);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "fuel",
    ]);
  });

  it("OP16-018 offers nothing without a 6000-power Character in hand", () => {
    const game = opponentRemoval("op16-018-broke")
      .withBoard("p1", [character("rockstar", "OP16-018")])
      .withHand("p1", [instance("small", "ST32-005")])
      .build();

    game.pass();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "rockstar" });

    // An unpayable cost is never put on the table.
    expect(
      game
        .legalActions()
        .some((action) => action.summary.includes("6000 power or more")),
    ).toBe(false);
    expect(game.state.players.p1.board).toHaveLength(0);
  });

  it("OP16-014 Marco dies in another Character's place, then plays itself back", () => {
    const game = opponentRemoval("op16-014")
      .withBoard("p1", [
        character("marco", "OP16-014"),
        character("saved", "ST32-005"),
      ])
      .withHand("p1", [instance("fuel", "OP16-011")])
      .build();

    game.pass();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "saved" });

    const trade = game
      .legalActions()
      .find((action) => action.summary.includes("K.O. Marco"));
    expect(trade, "Marco's replacement should be offered").toBeDefined();
    game.submit(trade!);

    // Marco's own [On K.O.] fires from the trash and offers to buy itself back.
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fuel" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["marco", "saved"]),
    );
  });
});

describe("OP16 Land of Wano trash engine", () => {
  covers("OP16-082", "static", "[On Play]");
  covers("OP16-084", "[Activate: Main]");
  covers("OP16-087", "[On Play]");
  covers("OP16-085", "[On Play]", "[Blocker]");

  it("OP16-082 costs 7 and trashes what it digs past", () => {
    const game = table("op16-082")
      .withLeader("p1", "OP16-079")
      .withHand("p1", [instance("kinemon", "OP16-082")])
      .withDeckTop("p1", [
        instance("hit", "OP16-083"),
        ...copies(4, "ST32-005", "miss"),
      ])
      .build();

    // "This Character" is the card on the field: in hand it is still a 4.
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.hand[0]!),
    ).toBe(4);

    game.play({ type: "play-card", cardNumber: "OP16-082" });
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(7);
    game.play({ type: "resolve-effect", optionId: "hit" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    expect(game.state.players.p1.trash).toHaveLength(4);
  });

  it("OP16-087 hands a Momonosuke +20 cost, which OP16-084 then spends", () => {
    const game = table("op16-084")
      .withLeader("p1", "OP16-079")
      .withHand("p1", [instance("shinobu", "OP16-087")])
      .withBoard("p1", [character("momo", "OP16-084")])
      .withTrash("p1", [instance("big-momo", "OP16-085")])
      .withDeckTop("p1", copies(1, "ST32-005", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-087" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "momo" });

    const momo = game.state.players.p1.board.find(
      (card) => card.instanceId === "momo",
    )!;
    expect(effectiveCost(game.state, "p1", momo)).toBe(25);

    game.play({ type: "activate-main", sourceInstanceId: "momo" });
    game.play({ type: "resolve-effect", optionId: "big-momo" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "big-momo",
    ]);
  });

  it("OP16-084 offers nothing while its own cost is below 20", () => {
    const game = table("op16-084-cheap")
      .withBoard("p1", [character("momo", "OP16-084")])
      .withTrash("p1", [instance("big-momo", "OP16-085")])
      .build();

    // The `source-cost` gate is the program's outermost condition, which the
    // offer reads: below 20 the activation is never put on the table at all.
    expect(
      game.legalActions().some((action) => action.type === "activate-main"),
    ).toBe(false);
  });
});

describe("OP16 Yellow Events", () => {
  covers("OP16-115", "[Main]", "[Trigger]");
  covers("OP16-117", "[Main]", "[Trigger]");
  covers("OP16-116", "[Main]", "[Trigger]");

  it("OP16-115 recovers a Trigger card but never itself", () => {
    const game = table("op16-115")
      .withLeader("p1", "OP16-080")
      .withHand("p1", [instance("vortex", "OP16-115")])
      .withTrash("p1", [
        instance("trigger-card", "OP16-110"),
        instance("other-vortex", "OP16-115"),
        instance("plain", "ST32-004"),
      ])
      .build();

    game.play({ summary: "Black Vortex" });
    const summaries = game.summaries().join(" | ");
    expect(summaries).not.toContain("Black Vortex");
    expect(summaries).not.toContain("Silvers Rayleigh");

    game.play({ type: "resolve-effect", optionId: "trigger-card" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "trigger-card",
    ]);
  });

  it("OP16-117 spends a Trigger card to negate a Character", () => {
    const game = table("op16-117")
      .withHand("p1", [
        instance("black-hole", "OP16-117"),
        instance("fuel", "OP16-110"),
        instance("plain", "ST32-004"),
      ])
      .withBoard("p2", [character("victim", "OP16-007")])
      .build();

    game.play({ summary: "Black Hole" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Only the card with a printed Trigger may pay.
    expect(game.summaries().join(" | ")).not.toContain("Silvers Rayleigh");
    game.play({ type: "resolve-effect", optionId: "fuel" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    // A negated Blocker cannot block.
    expect(hasKeyword(game.state, "p2", "victim", "Blocker")).toBe(false);
  });

  it("OP16-116 strips a Life card even below 10 DON!!", () => {
    const game = table("op16-116")
      .withHand("p1", [instance("zehaha", "OP16-116")])
      .withLife("p2", [instance("their-life", "ST32-005")])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ summary: "Zehahahahaha!" });
    game.play({ type: "resolve-effect", optionId: "their-life" });

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "their-life",
    );
  });
});

describe("OP16-104 Catarina Devon", () => {
  covers("OP16-104", "[When Attacking]", "[Trigger]");

  it("copies the power of the Character it names", () => {
    const game = table("op16-104")
      .withBoard("p1", [character("devon", "OP16-104", { playedTurn: 1 })])
      .withBoard("p2", [character("big", "OP16-003")])
      .build();

    expect(currentPower(game.state, "p1", "devon")).toBe(3000);
    game.play({
      type: "attack",
      attackerInstanceId: "devon",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "big" });

    expect(currentPower(game.state, "p1", "devon")).toBe(10_000);
  });

  it("stays at its printed power when it names nobody", () => {
    const game = table("op16-104-decline")
      .withBoard("p1", [character("devon", "OP16-104", { playedTurn: 1 })])
      .withBoard("p2", [character("big", "OP16-003")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "devon",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "done" });

    expect(currentPower(game.state, "p1", "devon")).toBe(3000);
  });
});

describe("OP16 Leaders", () => {
  covers("OP16-001", "[Activate: Main]");
  covers("OP16-041", "static");
  covers("OP16-080", "[Opponent's Turn]", "[On Your Opponent's Attack]");
  covers("OP16-100", "[Main]", "[Counter]");

  it("OP16-001 gives [Rush] by name or by type-and-power, never both", () => {
    const game = table("op16-001")
      .withLeader("p1", "OP16-001")
      .withBoard("p1", [
        character("luffy", "OP16-095"),
        character("big", "OP16-003"),
        character("small", "OP16-002"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "whitebeard" });
    // OP16-002 is Whitebeard Pirates but only 2000 power.
    expect(
      game.legalActions().some((action) => action.summary.includes("Izo")),
    ).toBe(false);
    const state = game.play({ type: "resolve-effect", optionId: "big" });

    expect(hasKeyword(game.state, "p1", "big", "Rush")).toBe(true);
    expect(hasKeyword(game.state, "p1", "luffy", "Rush")).toBe(false);
    // A grant used to leave no trace at all: the Leader activated, no event was
    // emitted, and from the other seat a Character simply attacked on the turn
    // it was played. Both seats can see the keyword and who handed it over.
    expect(state.events.at(-1)).toEqual({
      type: "keyword-granted",
      playerId: "p1",
      targetInstanceId: "big",
      targetCardNumber: "OP16-003",
      keyword: "Rush",
      expiresAtTurn: state.turn,
      sourceCardNumber: "OP16-001",
    });
    const granted = (instanceId: string, viewer: "p1" | "p2") =>
      observe(state, viewer)[viewer === "p1" ? "self" : "opponent"].board.find(
        (card) => card.instanceId === instanceId,
      )?.grantedKeywords;
    expect(granted("big", "p1")).toEqual([
      { keyword: "Rush", expiresAtTurn: state.turn },
    ]);
    expect(granted("big", "p2")).toEqual([
      { keyword: "Rush", expiresAtTurn: state.turn },
    ]);
    expect(granted("luffy", "p1")).toBeUndefined();
  });

  it("OP16-041 replays a Prisoner when an Impel Down Character leaves the field", () => {
    const game = table("op16-041")
      .withLeader("p2", "OP16-041")
      .withBoard("p2", [character("prisoner", "OP16-037", { rested: true })])
      .withHand("p2", [instance("replacement", "OP16-042")])
      .withGivenDon("p2", "p2-leader", 1)
      .withBoard("p1", [character("killer", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "prisoner",
    });
    declineDefence(game);

    // The removal signal reaches the Leader, which offers the replay.
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "replacement" });

    expect(game.state.players.p2.board.map((card) => card.cardNumber)).toEqual([
      "OP16-042",
    ]);
  });

  it("OP16-080 raises its own Characters' cost on the opponent's turn", () => {
    const game = table("op16-080-aura")
      .withLeader("p2", "OP16-080")
      .withBoard("p2", [character("body", "ST32-004")])
      .build();

    // p1 is the turn player, which is Teach's "[Opponent's Turn]".
    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(5);
  });

  it("OP16-080 redirects an attack onto its Leader for a Trigger card", () => {
    const game = table("op16-080-redirect")
      .withLeader("p2", "OP16-080")
      .withHand("p2", [
        instance("trigger-card", "OP16-110"),
        instance("plain", "ST32-004"),
      ])
      .withBoard("p2", [character("target", "ST32-005", { rested: true })])
      .withBoard("p1", [character("attacker", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "target",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Only the card with a printed Trigger may pay.
    expect(game.summaries().join(" | ")).not.toContain("Silvers Rayleigh");
    game.play({ type: "resolve-effect", optionId: "trigger-card" });
    const state = game.play({ type: "resolve-effect", optionId: "p2-leader" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("p2-leader");
    // A redirect is not a block: nothing rested, and the card now under attack
    // is a Leader, which no [Blocker] could ever be. Reporting it as
    // `attack-blocked` told the log a blocker had intercepted.
    expect(state.events.at(-1)).toEqual({
      type: "attack-redirected",
      playerId: "p2",
      targetInstanceId: "p2-leader",
      sourceCardNumber: "OP16-080",
    });
    expect(state.events.some((event) => event.type === "attack-blocked")).toBe(
      false,
    );
  });

  it("OP16-080 is not offered when the only card it could name is already under attack", () => {
    const game = table("op16-080-no-op-redirect")
      .withLeader("p2", "OP16-080")
      .withHand("p2", [instance("trigger-card", "OP16-110")])
      // Nothing on the board answers to {Blackbeard Pirates}, so the Leader is
      // the whole of the selector -- and the Leader is what is being attacked.
      .withBoard("p2", [character("bystander", "ST32-004")])
      .withBoard("p1", [character("attacker", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });

    // Redirecting the attack onto the card it is already hitting costs a
    // Trigger card from hand and buys nothing, so the prompt never appears.
    expect(
      game.legalActions().some((action) => action.type === "resolve-effect"),
    ).toBe(false);
    expect(game.state.players.p2.hand).toHaveLength(1);
  });

  it("OP16-100 sets a rested Yamato Leader active after a K.O.", () => {
    const game = table("op16-100")
      .withLeader("p1", "OP16-079")
      .withHand("p1", [instance("event", "OP16-100")])
      .withBoard("p1", [character("mcguy", "OP16-013", { rested: true })])
      .withBoard("p2", [character("victim", "ST32-005")])
      .withState((state) => {
        state.players.p1.leaderRested = true;
      })
      .build();

    // Nothing has been K.O.'d yet, and the condition is the program's outermost
    // gate -- so the Event is not offered at all.
    expect(
      game.summaries().some((summary) => summary.includes("Hallowed Glacier")),
    ).toBe(false);

    // McGuy's own [On K.O.] is not what matters here; any K.O. of one of their
    // Characters is. Drive one with OP16-090's removal.
    const after = table("op16-100-after")
      .withLeader("p1", "OP16-079")
      .withHand("p1", [
        instance("event", "OP16-100"),
        instance("chopper", "OP16-090"),
      ])
      .withBoard("p2", [character("victim", "ST32-005")])
      .withDeckTop("p1", copies(4, "ST32-005", "p1-deck"))
      .withState((state) => {
        state.players.p1.leaderRested = true;
      })
      .build();

    after.play({ type: "play-card", cardNumber: "OP16-090" });
    while (after.state.pendingEffect) {
      const ko = after
        .legalActions()
        .find((action) => action.summary.includes("Choose Roronoa Zoro"));
      after.submit(ko ?? after.action({ type: "resolve-effect" }));
    }
    expect(after.state.players.p2.board).toHaveLength(0);

    after.play({ summary: "Hallowed Glacier Slash" });
    expect(after.state.players.p1.leaderRested).toBe(false);
  });
});
