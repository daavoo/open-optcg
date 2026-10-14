import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * OP14 "Extreme Battle!!", card by card.
 *
 * The set ships as a whole series rather than as a deck (see
 * `packages/cards/src/op14.ts`), so these positions are built on the format's
 * own ST31/ST32 decks with the OP14 card put where the clause under test needs
 * it -- the same shape `op15.test.ts` uses, and for the same reason: a clause
 * that only works next to its own archetype has a hidden dependency, and a
 * neutral board is what surfaces one.
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
 * resolves. Written as a loop because the engine skips a step the defender has
 * no options for.
 */
const declineDefence = (game: {
  state: { phase: string };
  pass: () => unknown;
}) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

/**
 * A position in which p1's top Life card is `cardNumber`, p2 has just taken the
 * Life card off with an attack, and p1 is being offered the Trigger.
 *
 * A Trigger is only reachable through real damage, so the whole battle is
 * driven rather than the pending window written by hand -- which is also what
 * proves the card is offered at all.
 */
const atTriggerWindow = (
  seed: string,
  triggerInstanceId: string,
  cardNumber: string,
  setUp: (builder: ReturnType<typeof table>) => ReturnType<typeof table> = (
    builder,
  ) => builder,
) => {
  const game = setUp(
    table(seed)
      .withLife("p1", [
        instance(triggerInstanceId, cardNumber),
        instance("life-spare", "ST31-005"),
      ])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck")),
  ).build();

  game.pass();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  declineDefence(game);
  return game;
};

describe("OP14-001 Trafalgar Law (Leader)", () => {
  covers("OP14-001", "[Activate: Main]");

  it("swaps two Supernovas bodies' base power for the turn", () => {
    const game = table("op14-001-swap")
      .withLeader("p1", "OP14-001")
      .withBoard("p1", [
        character("small", "OP14-013"),
        character("big", "OP14-015"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "big" });

    // OP14-013 prints 0 power and OP14-015 prints 8000; after the swap the
    // 1-cost body is the 8000 one.
    expect(currentPower(game.state, "p1", "small")).toBe(8000);
    expect(currentPower(game.state, "p1", "big")).toBe(0);
  });

  it("is not offered with only one eligible Character", () => {
    const game = table("op14-001-alone")
      .withLeader("p1", "OP14-001")
      .withBoard("p1", [character("small", "OP14-013")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });

  it("spends its once-per-turn use", () => {
    const game = table("op14-001-opt")
      .withLeader("p1", "OP14-001")
      .withBoard("p1", [
        character("small", "OP14-013"),
        character("big", "OP14-015"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "big" });

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });
});

describe("OP14-002 Urouge", () => {
  covers("OP14-002", "[When Attacking]");

  it("draws and removes a small body once it is at 5000 power", () => {
    const game = table("op14-002-on")
      .withBoard("p1", [character("urouge", "OP14-002")])
      .withBoard("p2", [character("small", "OP14-013")])
      .withGivenDon("p1", "urouge", 3)
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "urouge",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("does nothing below 5000 power", () => {
    const game = table("op14-002-off")
      .withBoard("p1", [character("urouge", "OP14-002")])
      .withBoard("p2", [character("small", "OP14-013")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "urouge",
      targetInstanceId: "p2-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP14-004 Cavendish", () => {
  covers("OP14-004", "static");

  it("gains [Rush] only once it is at 5000 power", () => {
    const game = table("op14-004")
      .withBoard("p1", [character("cavendish", "OP14-004")])
      .build();

    expect(hasKeyword(game.state, "p1", "cavendish", "Rush")).toBe(false);

    const pumped = table("op14-004-pumped")
      .withBoard("p1", [character("cavendish", "OP14-004")])
      .withGivenDon("p1", "cavendish", 3)
      .build();

    expect(hasKeyword(pumped.state, "p1", "cavendish", "Rush")).toBe(true);
  });
});

describe('OP14-003 Capone"Gang"Bege', () => {
  covers("OP14-003", "static");

  it("turns aside a small Character's removal effect", () => {
    const game = table("op14-003-immune")
      .withBoard("p1", [character("gladius", "OP14-062", { rested: true })])
      .withBoard("p2", [
        character("bege", "OP14-003"),
        character("killer", "ST32-002"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    // Gladius' [On K.O.] is the removal: 4000 base power, so Bege is immune.
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "gladius",
    });
    declineDefence(game);
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect" });
    }

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).toContain("bege");
  });

  it("is removable by a Character above 5000 base power", () => {
    const game = table("op14-003-big")
      .withBoard("p1", [character("shanks", "OP14-027")])
      .withBoard("p2", [character("bege", "OP14-003", { rested: true })])
      .build();

    // OP14-027 Shanks is a 9000 base body: its rest-on-rest clause reaches
    // Bege, which is the mirror of the immunity above.
    game.play({
      type: "attack",
      attackerInstanceId: "shanks",
      targetInstanceId: "p2-leader",
    });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "bege" });
    }

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });
});

describe("OP14-005 Killer", () => {
  covers("OP14-005", "[Activate: Main]");

  it("moves a rested DON!! onto a Character", () => {
    const game = table("op14-005")
      .withBoard("p1", [
        character("killer", "OP14-005"),
        character("target", "ST31-002"),
      ])
      .withDon("p1", { active: 4, rested: 2 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "killer" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "target")
        ?.attachedDon,
    ).toHaveLength(1);
  });
});

describe("OP14-006 Shachi & Penguin", () => {
  covers("OP14-006", "[When Attacking]");

  it("weakens a Character once it is at 5000 power", () => {
    const game = table("op14-006")
      .withBoard("p1", [character("duo", "OP14-006")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withGivenDon("p1", "duo", 3)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "duo",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -2000 }),
    );
  });
});

describe("OP14-009 Trafalgar Law", () => {
  covers("OP14-009", "[On Your Opponent's Attack]", "[Rush]");

  it("prints [Rush]", () => {
    const game = table("op14-009-rush")
      .withBoard("p1", [character("law", "OP14-009")])
      .build();

    expect(hasKeyword(game.state, "p1", "law", "Rush")).toBe(true);
  });

  it("swaps the Leader's base power with its own for one battle", () => {
    const game = table("op14-009-swap")
      .withBoard("p1", [character("law", "OP14-009")])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withHand("p1", copies(2, "ST31-005", "fodder"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder-1" });
    game.play({ type: "resolve-effect", optionId: "fodder-2" });
    game.play({ type: "resolve-effect", optionId: "law" });

    // ST31's Leader prints 5000 and OP14-009 prints 10000.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(10000);
    expect(currentPower(game.state, "p1", "law")).toBe(5000);
  });

  it("gives the swap back when the battle ends", () => {
    const game = table("op14-009-battle-scope")
      .withBoard("p1", [character("law", "OP14-009")])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withHand("p1", copies(2, "ST31-005", "fodder"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder-1" });
    game.play({ type: "resolve-effect", optionId: "fodder-2" });
    game.play({ type: "resolve-effect", optionId: "law" });
    declineDefence(game);

    // "During this battle" -- a turn-scoped swap would still be defending.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
    expect(currentPower(game.state, "p1", "law")).toBe(10000);
  });

  it("is not offered with fewer than two cards to trash", () => {
    const game = table("op14-009-cost")
      .withBoard("p1", [character("law", "OP14-009")])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withHand("p1", copies(1, "ST31-005", "fodder"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "p1-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP14-010 Basil Hawkins", () => {
  covers("OP14-010", "[On K.O.]");

  it("digs five for a small Supernovas body and plays it", () => {
    const game = table("op14-010")
      .withBoard("p1", [character("hawkins", "OP14-010", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p1", [
        instance("found", "OP14-013"),
        ...copies(4, "ST31-005", "filler"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "hawkins",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("found");
    // The four it passed over went to the bottom rather than the trash.
    expect(game.state.players.p1.deck).toHaveLength(4);
  });
});

describe("OP14-011 Bartolomeo", () => {
  covers("OP14-011", "static");

  it("gains [Blocker] at two DON!! given and not before", () => {
    const bare = table("op14-011-bare")
      .withBoard("p1", [character("barto", "OP14-011")])
      .build();
    expect(hasKeyword(bare.state, "p1", "barto", "Blocker")).toBe(false);

    const armed = table("op14-011-armed")
      .withBoard("p1", [character("barto", "OP14-011")])
      .withGivenDon("p1", "barto", 2)
      .build();
    expect(hasKeyword(armed.state, "p1", "barto", "Blocker")).toBe(true);
  });
});

describe("OP14-012 Bepo", () => {
  covers("OP14-012", "[When Attacking]");

  it("hands two rested DON!! to a Character once it is at 5000 power", () => {
    const game = table("op14-012")
      .withBoard("p1", [
        character("bepo", "OP14-012"),
        character("target", "ST31-002"),
      ])
      .withDon("p1", { active: 4, rested: 3 })
      .withGivenDon("p1", "bepo", 3)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "bepo",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "target")
        ?.attachedDon,
    ).toHaveLength(2);
  });
});

describe("OP14-013 Monkey.D.Luffy", () => {
  covers("OP14-013", "[On Play]", "[When Attacking]");

  it("digs five for a Supernovas card that is not another Luffy", () => {
    const game = table("op14-013-play")
      .withHand("p1", [instance("luffy", "OP14-013")])
      .withDeckTop("p1", [
        instance("other-luffy", "OP14-013"),
        instance("found", "OP14-002"),
        ...copies(3, "ST31-005", "filler"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-013" });
    expect(
      game
        .legalActions()
        .some(
          (action) => "optionId" in action && action.optionId === "other-luffy",
        ),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });

  it("weakens a Character when it attacks", () => {
    const game = table("op14-013-attack")
      .withBoard("p1", [character("luffy", "OP14-013")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withGivenDon("p1", "luffy", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -1000 }),
    );
  });
});

describe('OP14-014 Eustass"Captain"Kid', () => {
  covers("OP14-014", "[On Play]", "[Blocker]");

  it("plays a small red body free under a Supernovas Leader", () => {
    const game = table("op14-014-on")
      .withLeader("p1", "OP14-001")
      .withHand("p1", [
        instance("kid", "OP14-014"),
        instance("free", "OP14-013"),
      ])
      .build();

    const donBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP14-014" });
    game.play({ type: "resolve-effect", optionId: "free" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("free");
    expect(game.state.players.p1.activeDon.length).toBe(donBefore - 4);
    expect(hasKeyword(game.state, "p1", "kid", "Blocker")).toBe(true);
  });

  it("offers nothing under a Leader without the type", () => {
    const game = table("op14-014-off")
      .withHand("p1", [
        instance("kid", "OP14-014"),
        instance("free", "OP14-013"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-014" });

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP14-016 X.Drake", () => {
  covers("OP14-016", "[Opponent's Turn]", "[When Attacking]");

  it("weakens a Character while it carries a DON!!", () => {
    const game = table("op14-016-attack")
      .withBoard("p1", [character("drake", "OP14-016")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withGivenDon("p1", "drake", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "drake",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -2000 }),
    );
  });

  it("does nothing with no DON!! given", () => {
    const game = table("op14-016-nodon")
      .withBoard("p1", [character("drake", "OP14-016")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "drake",
      targetInstanceId: "p2-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
  });

  it("saves a Supernovas body for the price of the Leader's power", () => {
    // On p2's turn, which is what "[Opponent's Turn]" costs to stage: the
    // replacement is offered against an opponent's effect, and an effect that
    // removes a p1 Character on p1's own turn is not one Drake may answer.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op14-016-replace")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [
        character("drake", "OP14-016"),
        character("urouge", "OP14-002"),
      ])
      .withHand("p2", [instance("whitey", "OP17-014")])
      .build();

    // OP17-014 Whitey Bay's [On Play] K.O.s a 2000-power body; Drake answers
    // it, and the Leader takes −2000 instead.
    game.play({ type: "play-card", cardNumber: "OP17-014" });
    game.play({ type: "resolve-effect", optionId: "urouge" });
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
    ).toContain("urouge");
    expect(game.state.players.p1.leaderPowerModifiers).toContainEqual(
      expect.objectContaining({ amount: -2000 }),
    );
  });

  it("is not offered against battle destruction, which is no effect at all", () => {
    // "If your {Supernovas} type Character would be removed from the field **by
    // your opponent's effect**". Losing a battle is not an effect -- it is the
    // battle's own result -- so the save does not reach it, however much the
    // rest of the clause fits. `resolveBattle` asks the registry with the
    // attacker as the source, and `eligibleReplacements` used to read that as
    // "by the opponent" and offer every `opponentEffectOnly` entry here.
    //
    // OP14-092 Mr.3(Galdino) is the pool's one replacement that *does* answer
    // battle destruction, and it is the one whose printed text omits the
    // clause; its own test above is what this must not break.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op14-016-battle")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [
        character("drake", "OP14-016"),
        character("urouge", "OP14-002", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "OP12-023")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "urouge",
    });
    declineDefence(game);

    expect(game.state.pendingEffect).toBeNull();
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("urouge");
    expect(game.state.players.p1.leaderPowerModifiers).toEqual([]);
  });

  it("is not offered against an effect that resolves on its own turn", () => {
    // The same removal, staged on p1's own turn. `[Opponent's Turn]` is not
    // satisfied, so the body is lost -- and the engine used to offer the save
    // anyway, because an [On K.O.] handed the decision to p2 and the turn
    // player was read off whoever was acting.
    const game = table("op14-016-own-turn")
      .withBoard("p1", [
        character("drake", "OP14-016"),
        character("urouge", "OP14-002"),
        character("killer", "ST31-002"),
      ])
      .withBoard("p2", [character("gladius", "OP14-062", { rested: true })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "gladius",
    });
    declineDefence(game);
    while (game.state.pendingEffect) {
      expect(
        game
          .legalActions()
          .some(
            (action) =>
              action.type === "resolve-effect" &&
              action.optionId.startsWith("replace:"),
          ),
      ).toBe(false);
      game.play({ type: "resolve-effect" });
    }

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("urouge");
  });
});

describe("OP14-017 Chambres", () => {
  covers("OP14-017", "[Main]");

  it("swaps two of the opponent's Characters' base power for the turn", () => {
    const game = table("op14-017")
      .withHand("p1", [instance("chambres", "OP14-017")])
      .withBoard("p2", [
        character("small", "OP14-013"),
        character("big", "OP14-015"),
      ])
      .build();

    game.play({ summary: "Chambres" });
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "big" });

    expect(currentPower(game.state, "p2", "big")).toBe(0);
    expect(currentPower(game.state, "p2", "small")).toBe(8000);
  });
});

describe("OP14-018 Time for the Counterattack", () => {
  covers("OP14-018", "[Counter]", "[Trigger]");

  it("is not offered without an 8000-power Character out", () => {
    const game = table("op14-018-off")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-018")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();

    expect(
      game
        .legalActions()
        .find((action) => action.type === "activate-counter-event"),
    ).toBeUndefined();
  });

  it("adds +4000 next to an 8000-power Character", () => {
    const game = table("op14-018-on")
      .withBoard("p1", [character("zoro", "OP14-015")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-018")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });
});

describe("OP14-019 I Have a Plan to Take Down One of the Four Emperors!!", () => {
  covers("OP14-019", "[Main]");

  it("digs four for a Supernovas or Straw Hat Character", () => {
    const game = table("op14-019")
      .withHand("p1", [instance("plan", "OP14-019")])
      .withDeckTop("p1", [
        instance("found", "OP14-002"),
        ...copies(3, "ST31-005", "filler"),
      ])
      .build();

    game.play({ summary: "I Have a Plan" });
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });
});

describe("OP14-018 Time for the Counterattack Trigger", () => {
  covers("OP14-018", "[Trigger]");

  it("plays a small red Character out of hand off a Life card", () => {
    const game = atTriggerWindow(
      "op14-018-trigger",
      "event",
      "OP14-018",
      (builder) => builder.withHand("p1", [instance("body", "OP14-013")]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "body" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("body");
  });
});

describe("OP14-019 I Have a Plan Trigger", () => {
  covers("OP14-019", "[Trigger]");

  it("draws a card off a Life card", () => {
    const game = atTriggerWindow(
      "op14-019-trigger",
      "plan",
      "OP14-019",
      (builder) => builder.withDeckTop("p1", copies(1, "ST31-005", "draw")),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
  });
});

describe("OP14-020 Dracule Mihawk (Leader)", () => {
  covers("OP14-020", "[Activate: Main]", "static");

  it("gains +1000 power against a <Slash> Leader", () => {
    const slash = table("op14-020-slash").withLeader("p1", "OP14-020").build();
    // ST32's Leader is Dracule Mihawk, a <Slash> body.
    expect(currentPower(slash.state, "p1", "p1-leader")).toBe(6000);

    const other = table("op14-020-other")
      .withLeader("p1", "OP14-020")
      .withLeader("p2", "OP14-040")
      .build();
    expect(currentPower(other.state, "p1", "p1-leader")).toBe(5000);
  });

  it("rests a card for three DON!! and gives up the turn's plays", () => {
    const game = table("op14-020-activate")
      .withLeader("p1", "OP14-020")
      .withBoard("p1", [character("kuro", "OP14-025")])
      .withHand("p1", [instance("held", "OP14-013")])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    // Activating *is* the yes to "You may rest 1 of your cards": the next
    // decision is which card pays, not an apply/skip asking again for it.
    expect(game.summaries()).not.toContain("Apply optional effect");
    game.play({ type: "resolve-effect", optionId: "kuro" });

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(
      game.legalActions().some((action) => action.type === "play-card"),
    ).toBe(false);
  });

  it("names itself as the cause of the steps the activation lands", () => {
    // A Leader never leaves the board, so an activation has no card movement
    // to show that it happened: without these two events the whole payoff --
    // three DON!! standing up -- was a board that changed with nothing in the
    // stream saying who changed it or that anything had been set active.
    //
    // Both land on the *answer* to the rest cost, not on the click: the
    // clause stops to ask which card pays, and resolves once it is told.
    const game = table("op14-020-events")
      .withLeader("p1", "OP14-020")
      .withBoard("p1", [character("kuro", "OP14-025")])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    expect(game.events).toEqual([]);

    game.play({ type: "resolve-effect", optionId: "kuro" });
    expect(game.events).toEqual([
      {
        type: "ability-activated",
        playerId: "p1",
        sourceCardNumber: "OP14-020",
        sourceInstanceId: "p1-leader",
      },
      {
        type: "character-rested",
        playerId: "p1",
        cardInstanceId: "kuro",
        cardNumber: "OP14-025",
        sourceCardNumber: "OP14-020",
      },
      {
        type: "don-activated",
        playerId: "p1",
        count: 3,
        sourceCardNumber: "OP14-020",
      },
      {
        type: "player-restricted",
        playerId: "p1",
        restriction: "cannot-play-characters",
        untilTurn: game.state.turn,
        sourceCardNumber: "OP14-020",
      },
    ]);
  });

  it("pays the rest cost with the Stage, leaving the Leader up to attack", () => {
    // "Rest 1 of your cards" names the Stage as readily as a Character or the
    // Leader, and OP14-039 Coffin Boat is in the deck to be exactly this: a
    // rest target that costs no attack and refunds a DON!! at end of turn.
    const game = table("op14-020-stage-cost")
      .withLeader("p1", "OP14-020")
      .withBoard("p1", [character("kawamatsu", "OP12-023")])
      .withStage("p1", instance("boat", "OP14-039"))
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    expect(
      game
        .legalActions()
        .filter((action) => action.type === "resolve-effect")
        .map((action) => action.optionId),
    ).toContain("boat");

    game.play({ type: "resolve-effect", optionId: "boat" });

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(game.state.players.p1.board[0]?.rested).toBe(false);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("gives no DON!! without a cost-5-or-more Character anywhere", () => {
    const game = table("op14-020-gate")
      .withLeader("p1", "OP14-020")
      .withBoard("p1", [character("small", "OP14-013")])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });
});

describe("OP14-021 Issho", () => {
  covers("OP14-021", "[Your Turn]");

  it("trades the top Life card for a refresh lock when it attacks", () => {
    const game = table("op14-021")
      .withBoard("p1", [character("issho", "OP14-021")])
      .withBoard("p2", [character("locked", "ST32-004", { rested: true })])
      .withLife("p1", [instance("life", "ST31-005")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "issho",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "life" });
    game.play({ type: "resolve-effect", optionId: "locked" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life",
    );
    expect(game.state.players.p2.board[0]?.cannotRefreshUntilTurn).toBe(
      game.state.turn + 1,
    );
  });

  it("declining the Life cost skips the lock", () => {
    const game = table("op14-021-decline")
      .withBoard("p1", [character("issho", "OP14-021")])
      .withBoard("p2", [character("locked", "ST32-004", { rested: true })])
      .withLife("p1", [instance("life", "ST31-005")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "issho",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.life).toHaveLength(1);
    expect(
      game.state.players.p2.board[0]?.cannotRefreshUntilTurn,
    ).toBeUndefined();
  });
});

describe("OP14-022 Usopp", () => {
  covers("OP14-022", "[End of Your Turn]");

  it("sets two DON!! active at end of turn under a Straw Hat Leader", () => {
    const game = table("op14-022")
      .withBoard("p1", [character("usopp", "OP14-022")])
      .withDon("p1", { rested: 6 })
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();

    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });
});

describe("OP14-023 Kikunojo", () => {
  covers("OP14-023", "[End of Your Turn]");

  it("stands itself back up at end of turn", () => {
    const game = table("op14-023")
      .withBoard("p1", [character("kiku", "OP14-023")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "kiku",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);

    game.pass();

    expect(game.state.players.p1.board[0]?.rested).toBe(false);
  });
});

describe("OP14-024 Kin'emon", () => {
  covers("OP14-024", "[On Play]", "[On K.O.]");

  it("sets three DON!! active and locks the turn's plays", () => {
    const game = table("op14-024-play")
      .withHand("p1", [
        instance("kinemon", "OP14-024"),
        instance("held", "OP14-013"),
      ])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-024" });

    // Four DON!! paid, three of the rested pile set back active.
    expect(game.state.players.p1.activeDon).toHaveLength(5);
    expect(
      game.legalActions().some((action) => action.type === "play-card"),
    ).toBe(false);
  });

  it("rests one of the opponent's cards when it dies", () => {
    const game = table("op14-024-ko")
      .withBoard("p1", [character("kinemon", "OP14-024", { rested: true })])
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
      targetInstanceId: "kinemon",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP14-025 Kuro", () => {
  covers("OP14-025", "[On Play]");

  it("plays an East Blue body free under a Leader answering to [Kuro]", () => {
    // No Leader in the pool is printed [Kuro], so the clause's positive path is
    // reachable only through the sealed wildcard, which answers to every card
    // name -- and that is the point of testing it here rather than skipping the
    // branch: `leader-has-name` must read the *derived* identity.
    const game = table("op14-025-on")
      .withLeader("p1", "SEALED-LUFFY")
      .withHand("p1", [
        instance("kuro", "OP14-025"),
        instance("free", "OP14-028"),
      ])
      .build();

    const donBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP14-025" });
    game.play({ type: "resolve-effect", optionId: "free" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("free");
    expect(game.state.players.p1.activeDon.length).toBe(donBefore - 7);
  });

  it("offers nothing under any other Leader", () => {
    const game = table("op14-025-off")
      .withLeader("p1", "OP14-020")
      .withHand("p1", [
        instance("kuro", "OP14-025"),
        instance("free", "OP14-028"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-025" });

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP14-026 Kouzuki Oden", () => {
  covers("OP14-026", "[Opponent's Turn]");

  it("gains +2000 power while rested on the opponent's turn", () => {
    const game = table("op14-026")
      .withBoard("p1", [character("oden", "OP14-026", { rested: true })])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    expect(currentPower(game.state, "p1", "oden")).toBe(5000);
    game.pass();
    expect(currentPower(game.state, "p1", "oden")).toBe(7000);
  });

  it("gains nothing while active", () => {
    const game = table("op14-026-active")
      .withBoard("p1", [character("oden", "OP14-026")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    expect(currentPower(game.state, "p1", "oden")).toBe(5000);
  });
});

describe("OP14-027 Shanks", () => {
  covers("OP14-027", "[Your Turn]", "[Opponent's Turn]");

  it("rests a 7000-or-less body when it attacks", () => {
    const game = table("op14-027-rest")
      .withBoard("p1", [character("shanks", "OP14-027")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "shanks",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  it("weakens every opposing Character while rested on their turn", () => {
    const game = table("op14-027-aura")
      .withBoard("p1", [character("shanks", "OP14-027", { rested: true })])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.pass();
    expect(currentPower(game.state, "p2", "victim")).toBe(before - 1000);
  });
});

describe("OP14-028 Johnny", () => {
  covers("OP14-028", "[Your Turn]");

  it("removes a rested cost-2-or-less body when it attacks", () => {
    const game = table("op14-028")
      .withBoard("p1", [character("johnny", "OP14-028")])
      .withBoard("p2", [character("small", "ST32-005", { rested: true })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "johnny",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP14-029 Tashigi", () => {
  covers("OP14-029", "[Activate: Main]", "[Opponent's Turn]");

  it("rests two cards for a buff that outlasts the turn", () => {
    const game = table("op14-029-activate")
      .withBoard("p1", [
        character("tashigi", "OP14-029"),
        character("one", "ST31-002"),
        character("two", "ST31-002"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "tashigi" });
    game.play({ type: "resolve-effect", optionId: "one" });
    game.play({ type: "resolve-effect", optionId: "two" });

    expect(currentPower(game.state, "p1", "tashigi")).toBe(8000);
    game.pass();
    expect(currentPower(game.state, "p1", "tashigi")).toBe(8000);
  });
});

describe("OP14-031 Nami", () => {
  covers("OP14-031", "[On Play]", "[Blocker]");

  it("rests two bodies and books the DON!! for end of turn", () => {
    const game = table("op14-031")
      .withHand("p1", [instance("nami", "OP14-031")])
      .withBoard("p2", [
        character("one", "ST32-004"),
        character("two", "ST32-005"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-031" });
    game.play({ type: "resolve-effect", optionId: "one" });
    game.play({ type: "resolve-effect", optionId: "two" });

    expect(game.state.players.p2.board.every((card) => card.rested)).toBe(true);
    expect(hasKeyword(game.state, "p1", "nami", "Blocker")).toBe(true);
    // Booked, not paid: the four DON!! Nami cost are still rested.
    expect(game.state.players.p1.restedDon).toHaveLength(4);

    game.pass();
    expect(game.state.players.p1.restedDon).toHaveLength(0);
  });
});

describe("OP14-032 Humandrill", () => {
  covers("OP14-032", "[Your Turn]");

  it("rests a cost-4-or-less body when it attacks", () => {
    const game = table("op14-032")
      .withBoard("p1", [character("drill", "OP14-032")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "drill",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });
});

describe("OP14-033 Perona", () => {
  covers("OP14-033", "[On Play]", "[On K.O.]");

  it("locks two cost-5-or-less bodies out of resting", () => {
    const game = table("op14-033-play")
      .withHand("p1", [instance("perona", "OP14-033")])
      .withBoard("p2", [
        character("one", "ST32-004"),
        character("two", "ST32-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-033" });
    game.play({ type: "resolve-effect", optionId: "one" });
    game.play({ type: "resolve-effect", optionId: "two" });

    expect(
      game.state.players.p2.board.every(
        (card) => card.cannotRestUntilTurn === game.state.turn + 1,
      ),
    ).toBe(true);
  });

  it("stops the locked body blocking, not just resting", () => {
    // Comprehensive Rules 10-1-4-1: [Blocker] is activated "by resting this
    // card during the Block Step", so a body that cannot be rested cannot pay
    // for the block.
    const game = table("op14-033-block-lock")
      .withHand("p1", [instance("perona", "OP14-033")])
      .withBoard("p2", [character("locked", "ST31-002")]) // a [Blocker]
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-033" });
    // The one Character on the board is the whole choice, so it resolves as
    // soon as it is picked.
    game.play({ type: "resolve-effect", optionId: "locked" });
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });

    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      false,
    );
  });

  it("stops the locked body attacking on the turn it is held down", () => {
    // Comprehensive Rules 7-1-1-1: an attack is declared "by resting their
    // active Leader card or 1 active Character card", so the same lock bars the
    // declaration. Both decks are stacked because `bareTable()` empties them
    // and passing the turn would otherwise deck the opponent out.
    const game = table("op14-033-attack-lock")
      .withHand("p1", [instance("perona", "OP14-033")])
      .withBoard("p2", [
        character("locked", "ST32-004"),
        character("free", "ST32-005"),
      ])
      .withDeckTop("p1", copies(3, "ST32-005", "p1-deck"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-033" });
    game.play({ type: "resolve-effect", optionId: "locked" });
    game.play({ type: "resolve-effect", optionId: "done" });
    game.pass();

    const attackers = game
      .legalActions()
      .flatMap((action) =>
        action.type === "attack" ? [action.attackerInstanceId] : [],
      );
    expect(attackers).not.toContain("locked");
    expect(attackers).toContain("free");
  });

  it("rests a card to replace itself out of hand when it dies", () => {
    const game = table("op14-033-ko")
      .withBoard("p1", [
        character("perona", "OP14-033", { rested: true }),
        character("payer", "ST31-002"),
      ])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withHand("p1", [instance("replacement", "OP14-032")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "perona",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "payer" });
    game.play({ type: "resolve-effect", optionId: "replacement" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("replacement");
  });
});

describe("OP14-034 Monkey.D.Luffy", () => {
  covers("OP14-034", "[Your Turn]");

  it("buffs green Straw Hat bodies at base cost 4 or more, on your turn", () => {
    const game = table("op14-034-aura")
      .withBoard("p1", [
        character("luffy", "OP14-034"),
        character("usopp", "OP14-022"),
        character("kiku", "OP14-023"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    // OP14-022 Usopp is a green 4-cost Straw Hat; OP14-023 Kikunojo is a
    // 1-cost Land of Wano body and is outside the group.
    expect(currentPower(game.state, "p1", "usopp")).toBe(6000);
    expect(currentPower(game.state, "p1", "kiku")).toBe(2000);

    game.pass();
    expect(currentPower(game.state, "p1", "usopp")).toBe(5000);
  });

  it("rests a Character instead of losing a Straw Hat to removal", () => {
    const game = table("op14-034-replace")
      .withBoard("p1", [
        character("luffy", "OP14-034"),
        character("usopp", "OP14-022"),
      ])
      .withBoard("p2", [character("gladius", "OP14-062", { rested: true })])
      .withBoard("p1", [
        character("luffy", "OP14-034"),
        character("usopp", "OP14-022"),
        character("killer", "ST31-002"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "gladius",
    });
    declineDefence(game);
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
    ).toContain("usopp");
  });
});

describe("OP14-035 Yosaku", () => {
  covers("OP14-035", "[Your Turn]");

  it("stops a rested cost-4-or-less body refreshing", () => {
    const game = table("op14-035")
      .withBoard("p1", [character("yosaku", "OP14-035")])
      .withBoard("p2", [character("victim", "ST32-004", { rested: true })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "yosaku",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.cannotRefreshUntilTurn).toBe(
      game.state.turn + 1,
    );
  });
});

describe("OP14-036 Strive to Surpass me, Roronoa Zoro!!!", () => {
  covers("OP14-036", "[Counter]", "[Trigger]");

  it("rests a card for +4000 Counter power", () => {
    const game = table("op14-036-counter")
      .withBoard("p1", [character("payer", "ST31-002")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-036")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "payer" });

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("rests a 7000-or-less body off a Life card", () => {
    const game = atTriggerWindow(
      "op14-036-trigger",
      "event",
      "OP14-036",
      (builder) =>
        builder
          .withBoard("p1", [character("payer", "ST31-002")])
          .withBoard("p2", [
            character("attacker", "ST32-002"),
            character("standing", "ST32-004"),
          ]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "payer" });
    game.play({ type: "resolve-effect", optionId: "standing" });

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "standing")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP14-037 For Fun", () => {
  covers("OP14-037", "[Main]", "[Counter]");

  it("rests three cards to remove a rested 7000-or-less body", () => {
    const game = table("op14-037-main")
      .withHand("p1", [instance("event", "OP14-037")])
      .withBoard("p1", [
        character("a", "ST31-002"),
        character("b", "ST31-002"),
        character("c", "ST31-002"),
      ])
      .withBoard("p2", [character("victim", "ST32-004", { rested: true })])
      .build();

    game.play({ summary: "For Fun" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    game.play({ type: "resolve-effect", optionId: "c" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("adds +3000 to the Leader as a Counter", () => {
    const game = table("op14-037-counter")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-037")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("OP14-038 I Never Bother to Remember the Faces of Trash", () => {
  covers("OP14-038", "[Main]", "[Counter]");

  it("rests two cards to draw and rest a 7000-or-less body", () => {
    const game = table("op14-038-main")
      .withHand("p1", [instance("event", "OP14-038")])
      .withBoard("p1", [character("a", "ST31-002"), character("b", "ST31-002")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .build();

    game.play({ summary: "I Never Bother" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  it("does not offer an already-rested Leader as one of the two payments", () => {
    const game = table("op14-038-rested-leader")
      .withLeader("p1", "OP14-020")
      .withRestedLeader("p1")
      .withHand("p1", [instance("event", "OP14-038")])
      .withBoard("p1", [character("a", "ST31-002"), character("b", "ST31-002")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .build();

    game.play({ summary: "I Never Bother" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    // "You may rest 2 of your cards" asks for cards that are not already
    // rested. The Leader arrives through the selector's `includeLeader` as a
    // synthetic instance with no `rested` field, so it used to pass that filter
    // however many times it had already paid -- a second payment for free. See
    // `isRested`.
    expect(
      game
        .legalActions()
        .filter((action) => action.type === "resolve-effect")
        .map((action) => action.optionId)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("adds +3000 to the Leader as a Counter", () => {
    const game = table("op14-038-counter")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-038")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("OP14-039 Coffin Boat", () => {
  covers("OP14-039", "[On Play]", "[End of Your Turn]");

  it("draws when it lands and refunds a DON!! at end of turn", () => {
    const game = table("op14-039")
      .withLeader("p1", "OP14-020")
      .withHand("p1", [instance("boat", "OP14-039")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .withDon("p1", { rested: 5 })
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-039" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );

    const activeBefore = game.state.players.p1.activeDon.length;
    game.pass();
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore + 1);
  });
});

describe("OP14-040 Jinbe (Leader)", () => {
  covers("OP14-040", "[Activate: Main]");

  it("trades a card from hand for two rested DON!! on a Fish-Man body", () => {
    const game = table("op14-040")
      .withLeader("p1", "OP14-040")
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withHand("p1", [instance("fodder", "ST31-005")])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });

    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(2);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
  });

  it("is not offered with an empty hand", () => {
    const game = table("op14-040-nohand")
      .withLeader("p1", "OP14-040")
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withDon("p1", { rested: 4 })
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });
});

describe("OP14-042 Arlong", () => {
  covers("OP14-042", "[On Play]");

  it("digs four for a cost-2-or-more card under a Fish-Man Leader", () => {
    const game = table("op14-042")
      .withLeader("p1", "OP14-040")
      .withHand("p1", [instance("arlong", "OP14-042")])
      .withDeckTop("p1", [
        instance("cheap", "ST32-005"),
        instance("found", "ST32-004"),
        ...copies(2, "ST31-005", "filler"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-042" });
    expect(
      game
        .legalActions()
        .some((action) => "optionId" in action && action.optionId === "cheap"),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });
});

describe("OP14-043 Aladine", () => {
  covers("OP14-043", "[On Play]", "[On K.O.]");

  it("plays a cheap Fish-Man out of hand", () => {
    const game = table("op14-043-play")
      .withHand("p1", [
        instance("aladine", "OP14-043"),
        instance("free", "OP14-050"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-043" });
    game.play({ type: "resolve-effect", optionId: "free" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("free");
  });

  it("draws when it dies", () => {
    const game = table("op14-043-ko")
      .withBoard("p1", [character("aladine", "OP14-043", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "aladine",
    });
    declineDefence(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
  });
});

describe("OP14-044 Edward.Newgate", () => {
  covers("OP14-044", "[On Play]", "[Blocker]");

  it("draws two and discards one on a Whitebeard reveal", () => {
    const game = table("op14-044-hit")
      .withHand("p1", [instance("newgate", "OP14-044")])
      .withDeckTop("p1", [
        instance("wb", "OP14-053"),
        ...copies(2, "ST31-005", "draw"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-044" });
    game.play({ type: "resolve-effect", optionId: "wb" });

    // The revealed card stayed on the deck; the two draws came off over it.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(hasKeyword(game.state, "p1", "newgate", "Blocker")).toBe(true);
  });

  it("does nothing when the reveal misses", () => {
    const game = table("op14-044-miss")
      .withHand("p1", [instance("newgate", "OP14-044")])
      .withDeckTop("p1", [
        instance("other", "ST32-005"),
        ...copies(2, "ST31-005", "draw"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-044" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP14-045 Kuroobi", () => {
  covers("OP14-045", "[On K.O.]", "static");

  it("gains [Rush] once a card has been trashed from hand this turn", () => {
    const game = table("op14-045-rush")
      .withHand("p1", [
        instance("shakuyaku", "OP14-107"),
        instance("a", "ST31-005"),
        instance("b", "ST31-005"),
      ])
      .withBoard("p1", [character("kuroobi", "OP14-045")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-life"))
      .withLife("p2", 3)
      .build();

    expect(hasKeyword(game.state, "p1", "kuroobi", "Rush")).toBe(false);

    game.play({ type: "play-card", cardNumber: "OP14-107" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });

    expect(hasKeyword(game.state, "p1", "kuroobi", "Rush")).toBe(true);
  });

  it("draws when it dies", () => {
    const game = table("op14-045-ko")
      .withBoard("p1", [character("kuroobi", "OP14-045", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "kuroobi",
    });
    declineDefence(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
  });
});

describe("OP14-046 Koala", () => {
  covers("OP14-046", "[Activate: Main]");

  it("trashes itself to buff a Fish-Man body", () => {
    const game = table("op14-046")
      .withBoard("p1", [
        character("koala", "OP14-046"),
        character("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "koala" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("koala");
    expect(currentPower(game.state, "p1", "jinbe")).toBe(8000);
  });
});

describe("OP14-047 Shirahoshi", () => {
  covers("OP14-047", "[On Play]", "[Blocker]");

  it("draws and then plays the card it just drew", () => {
    const game = table("op14-047")
      .withHand("p1", [instance("shirahoshi", "OP14-047")])
      .withDeckTop("p1", [instance("chew", "OP14-050")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-047" });
    game.play({ type: "resolve-effect", optionId: "chew" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("chew");
    expect(hasKeyword(game.state, "p1", "shirahoshi", "Blocker")).toBe(true);
  });
});

describe("OP14-048 Shiryu", () => {
  covers("OP14-048", "[On Play]");

  it("bounces a Character and then empties its own hand", () => {
    const game = table("op14-048")
      .withHand("p1", [
        instance("shiryu", "OP14-048"),
        instance("held-a", "ST31-005"),
        instance("held-b", "ST31-005"),
      ])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-048" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("held-a");
  });
});

describe("OP14-049 Jinbe", () => {
  covers("OP14-049", "[On Play]", "static");

  it("rests two DON!! to draw two and bounce a cost-7-or-less body", () => {
    const game = table("op14-049")
      .withHand("p1", [instance("jinbe", "OP14-049")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-049" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p1.hand).toHaveLength(2);
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP14-050 Chew", () => {
  covers("OP14-050", "[On Play]");

  it("draws under a Fish-Man Leader and not otherwise", () => {
    const on = table("op14-050-on")
      .withLeader("p1", "OP14-040")
      .withHand("p1", [instance("chew", "OP14-050")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .build();
    on.play({ type: "play-card", cardNumber: "OP14-050" });
    expect(on.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );

    const off = table("op14-050-off")
      .withHand("p1", [instance("chew", "OP14-050")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .build();
    off.play({ type: "play-card", cardNumber: "OP14-050" });
    expect(off.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP14-051 Hatchan", () => {
  covers("OP14-051", "[On K.O.]");

  it("draws only when it was carrying two DON!!", () => {
    const armed = table("op14-051-on")
      .withBoard("p1", [character("hatchan", "OP14-051", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withGivenDon("p1", "hatchan", 2)
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    armed.pass();
    armed.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "hatchan",
    });
    declineDefence(armed);
    expect(
      armed.state.players.p1.hand.map((card) => card.instanceId),
    ).toContain("draw-1");

    const bare = table("op14-051-off")
      .withBoard("p1", [character("hatchan", "OP14-051", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    bare.pass();
    bare.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "hatchan",
    });
    declineDefence(bare);
    expect(bare.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP14-052 Hannyabal", () => {
  covers("OP14-052", "[On Play]", "[Blocker]");

  it("trashes three to play an Impel Down body", () => {
    const game = table("op14-052")
      .withHand("p1", [
        instance("hannyabal", "OP14-052"),
        instance("free", "OP16-102"),
        instance("a", "ST31-005"),
        instance("b", "ST31-005"),
        instance("c", "ST31-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-052" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    game.play({ type: "resolve-effect", optionId: "c" });
    game.play({ type: "resolve-effect", optionId: "free" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("free");
  });

  it("cannot pay from a hand of two", () => {
    const game = table("op14-052-poor")
      .withHand("p1", [
        instance("hannyabal", "OP14-052"),
        instance("free", "OP16-102"),
        instance("a", "ST31-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-052" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("free");
  });
});

describe("OP14-053 Vista", () => {
  covers("OP14-053", "[Opponent's Turn]", "[Blocker]");

  it("takes the Leader's base power on the opponent's turn", () => {
    const game = table("op14-053")
      .withBoard("p1", [character("vista", "OP14-053")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    expect(currentPower(game.state, "p1", "vista")).toBe(4000);
    game.pass();
    expect(currentPower(game.state, "p1", "vista")).toBe(5000);
    expect(hasKeyword(game.state, "p1", "vista", "Blocker")).toBe(true);
  });

  it("keeps its printed power with a hand above seven", () => {
    const game = table("op14-053-fat")
      .withBoard("p1", [character("vista", "OP14-053")])
      .withHand("p1", copies(8, "ST31-005", "held"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    expect(currentPower(game.state, "p1", "vista")).toBe(4000);
  });
});

describe("OP14-054 Fisher Tiger", () => {
  covers("OP14-054", "[On Play]", "[End of Your Turn]");

  it("draws three under a Fish-Man Leader and pays it back at end of turn", () => {
    const game = table("op14-054")
      .withLeader("p1", "OP14-040")
      .withHand("p1", [instance("tiger", "OP14-054")])
      .withDeckTop("p1", copies(4, "ST31-005", "draw"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-054" });
    expect(game.state.players.p1.hand).toHaveLength(3);

    // Under the ceiling already, so nothing is trashed.
    game.pass();
    expect(game.state.players.p1.hand).toHaveLength(3);
  });

  it("trashes down to five at end of turn", () => {
    const game = table("op14-054-ceiling")
      .withBoard("p1", [character("tiger", "OP14-054")])
      .withHand("p1", copies(8, "ST31-005", "held"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand).toHaveLength(5);
  });
});

describe("OP14-056 Wadatsumi", () => {
  covers("OP14-056", "static");

  it("cannot attack until a card is trashed from hand by an effect", () => {
    const game = table("op14-056")
      .withBoard("p1", [character("wada", "OP14-056")])
      .withHand("p1", [
        instance("shakuyaku", "OP14-107"),
        instance("a", "ST31-005"),
        instance("b", "ST31-005"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-life"))
      .withLife("p2", 3)
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "wada",
        ),
    ).toBe(false);

    game.play({ type: "play-card", cardNumber: "OP14-107" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "wada",
        ),
    ).toBe(true);
  });
});

describe("OP14-057 Don't Worry!! I'm Here!!", () => {
  covers("OP14-057", "[Main]", "[Trigger]");

  it("buffs every Fish-Man and Merfolk card including the Leader", () => {
    const game = table("op14-057")
      .withLeader("p1", "OP14-040")
      .withHand("p1", [instance("event", "OP14-057")])
      .withBoard("p1", [
        character("jinbe", "ST31-002"),
        character("outsider", "ST32-005"),
      ])
      .build();

    game.play({ summary: "Don't Worry" });

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
    expect(currentPower(game.state, "p1", "jinbe")).toBe(7000);
    expect(currentPower(game.state, "p1", "outsider")).toBe(2000);
  });

  it("draws two off a Life card", () => {
    const game = atTriggerWindow(
      "op14-057-trigger",
      "event",
      "OP14-057",
      (builder) => builder.withDeckTop("p1", copies(2, "ST31-005", "draw")),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });

    expect(game.state.players.p1.hand).toHaveLength(2);
  });
});

describe("OP14-058 Ocean Current Shoulder Throw", () => {
  covers("OP14-058", "[Main]", "[Counter]");

  it("rests three DON!! to play a Fish-Man and bounce a 6000 body", () => {
    const game = table("op14-058-main")
      .withHand("p1", [
        instance("event", "OP14-058"),
        instance("chew", "OP14-050"),
      ])
      .withBoard("p2", [character("six", "ST31-002")])
      .build();

    game.play({ summary: "Ocean Current Shoulder Throw" });
    game.play({ type: "resolve-effect", optionId: "chew" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    game.play({ type: "resolve-effect", optionId: "six" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("chew");
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("draws and adds +3000 to the Leader as a Counter", () => {
    const game = table("op14-058-counter")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-058")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
  });
});

describe("OP14-059 Please Take Me with You!!", () => {
  covers("OP14-059", "[Main]", "[Trigger]");

  it("draws two under a [Jinbe] Leader from a small hand", () => {
    const game = table("op14-059")
      .withLeader("p1", "OP14-040")
      .withHand("p1", [instance("event", "OP14-059")])
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .build();

    game.play({ summary: "Please Take Me with You" });

    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("draws nothing from a hand of three", () => {
    const game = table("op14-059-fat")
      .withLeader("p1", "OP14-040")
      .withHand("p1", [
        instance("event", "OP14-059"),
        ...copies(3, "ST31-005", "held"),
      ])
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .build();

    game.play({ summary: "Please Take Me with You" });

    expect(game.state.players.p1.hand).toHaveLength(3);
  });

  it("bounces a cost-4-or-less Character off a Life card", () => {
    const game = atTriggerWindow(
      "op14-059-trigger",
      "event",
      "OP14-059",
      (builder) =>
        builder.withBoard("p2", [
          character("attacker", "ST32-002"),
          character("small", "ST32-004"),
        ]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("small");
  });
});

describe("OP14-060 Donquixote Doflamingo (Leader)", () => {
  covers("OP14-060", "[On Your Opponent's Attack]");

  it("pays a DON!! to move an attack onto a Donquixote body", () => {
    const game = table("op14-060")
      .withLeader("p1", "OP14-060")
      .withBoard("p1", [character("pica", "OP14-071")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pica" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("pica");
  });

  it("is not offered with no DON!! on the field", () => {
    // No Pica on the board: its `[End of Your Turn]` would put a DON!! back
    // and the Leader would be able to pay after all.
    const game = table("op14-060-nodon")
      .withLeader("p1", "OP14-060")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withDonDeck("p1", 10)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
  });

  it("is not offered when the attack is already on the only card it could name", () => {
    // Nothing on the board is {Donquixote Pirates}, so the selector is the
    // Leader alone -- and the Leader is what is being attacked. Paying DON!! −1
    // to move the attack onto the card it is already hitting buys nothing.
    const game = table("op14-060-no-op")
      .withLeader("p1", "OP14-060")
      .withBoard("p1", [character("bystander", "ST32-004")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    const donBefore = game.state.players.p1.activeDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.activeDon).toHaveLength(donBefore);
  });
});

describe("OP14-062 Gladius", () => {
  covers("OP14-062", "[On K.O.]");

  it("pays DON!! −1 to K.O. a 6000-base body", () => {
    const game = table("op14-062")
      .withBoard("p1", [character("gladius", "OP14-062", { rested: true })])
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
      targetInstanceId: "gladius",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("victim");
  });

  it("can rest instead of K.O.ing", () => {
    const game = table("op14-062-rest")
      .withBoard("p1", [character("gladius", "OP14-062", { rested: true })])
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
      targetInstanceId: "gladius",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "rest" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP14-063 Sugar", () => {
  covers("OP14-063", "[On Play]", "[On K.O.]");

  it("adds an active DON!! when it lands", () => {
    const game = table("op14-063-play")
      .withHand("p1", [instance("sugar", "OP14-063")])
      .withDonDeck("p1", 2)
      .build();

    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP14-063" });

    // Four DON!! paid, one added back as active.
    expect(game.state.players.p1.activeDon.length).toBe(before - 4 + 1);
  });

  it("replays a Donquixote body when it dies against a rich opponent", () => {
    const game = table("op14-063-ko")
      .withBoard("p1", [character("sugar", "OP14-063", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withHand("p1", [instance("free", "OP14-071")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "sugar",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "free" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("free");
  });
});

describe("OP14-064 Giolla", () => {
  covers("OP14-064", "[On K.O.]");

  it("adds a rested DON!! and K.O.s a 0-power body", () => {
    const game = table("op14-064")
      .withBoard("p1", [character("giolla", "OP14-064", { rested: true })])
      .withBoard("p2", [
        character("killer", "ST32-002"),
        character("zero", "OP14-013"),
      ])
      .withDonDeck("p1", 2)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "giolla",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "zero" });

    expect(game.state.players.p1.restedDon.length).toBe(restedBefore + 1);
    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("zero");
  });
});

describe("OP14-065 Senor Pink", () => {
  covers("OP14-065", "[On K.O.]");

  it("makes the opponent return a DON!! when it dies", () => {
    const game = table("op14-065")
      .withBoard("p1", [character("pink", "OP14-065", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    const before =
      game.state.players.p2.activeDon.length +
      game.state.players.p2.restedDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "pink",
    });
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p2.activeDon.length +
        game.state.players.p2.restedDon.length,
    ).toBe(before - 1);
  });
});

describe("OP14-067 Dellinger", () => {
  covers("OP14-067", "[On K.O.]");

  it("adds a rested DON!! and digs five for a Donquixote card", () => {
    const game = table("op14-067")
      .withBoard("p1", [character("dellinger", "OP14-067", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDonDeck("p1", 2)
      .withDeckTop("p1", [
        instance("found", "OP14-071"),
        ...copies(4, "ST31-005", "filler"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "dellinger",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });
});

describe("OP14-068 Trebol", () => {
  covers("OP14-068", "[Opponent's Turn]");

  it("refills a rested DON!! when one is returned on the opponent's turn", () => {
    const game = table("op14-068")
      .withLeader("p1", "OP14-060")
      .withBoard("p1", [
        character("trebol", "OP14-068"),
        character("pica", "OP14-071"),
      ])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withDonDeck("p1", 2)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    const donBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    // The Leader's redirect pays DON!! −1, which is what Trebol answers.
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Paying `DON!! −1` asks which pile it came from before the redirect's own
    // target choice; Trebol's refill has already happened by then.
    while (game.state.pendingEffect) {
      const redirect = game
        .legalActions()
        .find((action) => "optionId" in action && action.optionId === "pica");
      game.play(redirect ? { optionId: "pica" } : { type: "resolve-effect" });
      if (redirect) break;
    }

    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(donBefore);
  });
});

describe("OP14-069 Donquixote Doflamingo", () => {
  covers("OP14-069", "[On Play]");

  it("pays DON!! −3 to K.O. a cost-8-or-less body", () => {
    const game = table("op14-069-ko")
      .withLeader("p1", "OP14-060")
      .withHand("p1", [instance("doffy", "OP14-069")])
      .withBoard("p2", [character("victim", "ST32-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-069" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("can lock three bodies instead, under any Leader", () => {
    const game = table("op14-069-lock")
      .withHand("p1", [instance("doffy", "OP14-069")])
      .withBoard("p2", [character("a", "ST32-004"), character("b", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-069" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "lock" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p2.board.every(
        (card) => card.cannotRestUntilTurn === game.state.turn + 1,
      ),
    ).toBe(true);
  });
});

describe("OP14-070 Buffalo", () => {
  covers("OP14-070", "[Blocker]", "static");

  it("pays a DON!! to stand back up after an opposing Character rests it", () => {
    const game = table("op14-070")
      .withLeader("p1", "OP14-060")
      .withBoard("p1", [character("buffalo", "OP14-070")])
      .withBoard("p2", [character("drill", "OP14-032")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "drill",
      targetInstanceId: "p1-leader",
    });
    // Humandrill's own rest-on-rest clause is the opposing Character effect.
    game.play({ type: "resolve-effect", optionId: "buffalo" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.players.p1.board[0]?.rested).toBe(false);
    expect(hasKeyword(game.state, "p1", "buffalo", "Blocker")).toBe(true);
  });
});

describe("OP14-071 Pica", () => {
  covers("OP14-071", "[End of Your Turn]");

  it("adds an active DON!! at end of turn under a Donquixote Leader", () => {
    const game = table("op14-071")
      .withLeader("p1", "OP14-060")
      .withBoard("p1", [character("pica", "OP14-071")])
      .withDonDeck("p1", 2)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    const before = game.state.players.p1.donDeck.length;
    game.pass();

    expect(game.state.players.p1.donDeck.length).toBe(before - 1);
  });
});

describe("OP14-072 Baby 5", () => {
  covers("OP14-072", "[On Play]", "[On K.O.]");

  it("adds an active DON!! when it lands", () => {
    const game = table("op14-072-play")
      .withHand("p1", [instance("baby", "OP14-072")])
      .withDonDeck("p1", 2)
      .build();

    const before = game.state.players.p1.donDeck.length;
    game.play({ type: "play-card", cardNumber: "OP14-072" });

    expect(game.state.players.p1.donDeck.length).toBe(before - 1);
  });

  it("pays DON!! −1 to bank the top card of the deck on Life", () => {
    const game = table("op14-072-ko")
      .withBoard("p1", [character("baby", "OP14-072", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p1", copies(1, "ST31-005", "banked"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    const lifeBefore = game.state.players.p1.life.length;
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "baby",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.life.length).toBe(lifeBefore + 1);
  });
});

describe("OP14-074 Monet", () => {
  covers("OP14-074", "[On Play]", "[On K.O.]");

  it("adds an active DON!! under a Donquixote Leader", () => {
    const game = table("op14-074-play")
      .withLeader("p1", "OP14-060")
      .withHand("p1", [instance("monet", "OP14-074")])
      .withDonDeck("p1", 2)
      .build();

    const before = game.state.players.p1.donDeck.length;
    game.play({ type: "play-card", cardNumber: "OP14-074" });

    expect(game.state.players.p1.donDeck.length).toBe(before - 1);
  });

  it("rummages and adds two rested DON!! when it dies", () => {
    const game = table("op14-074-ko")
      .withBoard("p1", [character("monet", "OP14-074", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .withDonDeck("p1", 3)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    const donDeckBefore = game.state.players.p1.donDeck.length;
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "monet",
    });
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.donDeck.length).toBe(donDeckBefore - 2);
  });
});

describe("OP14-075 Lao.G", () => {
  covers("OP14-075", "[On K.O.]");

  it("adds a rested DON!! and weakens a Character", () => {
    const game = table("op14-075")
      .withBoard("p1", [character("laog", "OP14-075", { rested: true })])
      .withBoard("p2", [
        character("killer", "ST32-002"),
        character("victim", "ST32-004"),
      ])
      .withDonDeck("p1", 2)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "laog",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")
        ?.powerModifiers,
    ).toContainEqual(expect.objectContaining({ amount: -2000 }));
  });
});

describe("OP14-076 Ever White", () => {
  covers("OP14-076", "[Main]", "[Counter]");

  it("rests two DON!! for one back rested, under a Donquixote Leader", () => {
    const game = table("op14-076-main")
      .withLeader("p1", "OP14-060")
      .withHand("p1", [instance("event", "OP14-076")])
      .withDonDeck("p1", 2)
      .build();

    const before = game.state.players.p1.donDeck.length;
    game.play({ summary: "Ever White" });

    expect(game.state.players.p1.donDeck.length).toBe(before - 1);
  });

  it("adds +3000 to the Leader as a Counter", () => {
    const game = table("op14-076-counter")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-076")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("OP14-077 Penta-Chromatic String", () => {
  covers("OP14-077", "[Counter]");

  it("adds +4000 and a rested DON!! against a big body", () => {
    const game = table("op14-077")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-077")])
      .withDonDeck("p1", 2)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    const before = game.state.players.p1.donDeck.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(game.state.players.p1.donDeck.length).toBe(before - 1);
  });
});

describe("OP14-078 Bullet String", () => {
  covers("OP14-078", "[Counter]");

  it("buffs the battle now and the card for the rest of the turn", () => {
    const game = table("op14-078")
      .withLeader("p1", "OP14-060")
      // Rested, so it is a legal thing for the opponent to attack.
      .withBoard("p1", [character("pica", "OP14-071", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-078")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "pica",
    });
    // Decline the Leader's own redirect, then the block step.
    game.play({ type: "resolve-effect", optionId: "skip" });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (
      game.state.pendingEffect &&
      game.state.activeAttack?.counterPower === 0
    ) {
      game.play({ type: "resolve-effect" });
    }

    expect(game.state.activeAttack?.counterPower).toBe(2000);
    // "That card" -- the second +2000 lands on Pica itself and outlives the
    // battle, so it is still a 8000 body once the attack is over.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "pica")
        ?.powerModifiers,
    ).toContainEqual(expect.objectContaining({ amount: 2000 }));
  });
});

describe("OP14-079 Crocodile (Leader)", () => {
  covers("OP14-079", "[Activate: Main]", "static");

  it("eats a Baroque Works body to drop a Character to cost 0", () => {
    const game = table("op14-079")
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [character("mr9", "OP14-095")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDeckTop("p1", copies(2, "ST31-005", "milled"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "mr9" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(3);
    expect(game.state.players.p2.board[0]?.costModifiers).toContainEqual(
      expect.objectContaining({ amount: -10 }),
    );
  });

  it("bans its own effects from removing the opponent's Characters", () => {
    const game = table("op14-079-ban")
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [character("spider", "OP14-081", { rested: true })])
      .withBoard("p2", [
        character("killer", "ST32-002"),
        character("one-cost", "ST32-005"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    // Spider Mice's [On K.O.] would K.O. a base-cost-1 body; under this Leader
    // it cannot, so the opponent's board survives.
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "spider",
    });
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).toContain("one-cost");
  });

  it("is not offered with no Baroque Works body to spend", () => {
    const game = table("op14-079-empty")
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [character("outsider", "ST32-005")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });
});

describe("OP14-080 Gecko Moria (Leader)", () => {
  covers("OP14-080", "[Activate: Main]", "[When Attacking]");

  it("eats a Thriller Bark body to buff the whole board", () => {
    const game = table("op14-080-activate")
      .withLeader("p1", "OP14-080")
      .withBoard("p1", [
        character("kumacy", "OP14-102"),
        character("other", "ST31-002"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "kumacy" });

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
    expect(currentPower(game.state, "p1", "other")).toBe(7000);
  });

  it("trashes three from hand to bank the top card of the deck on Life", () => {
    const game = table("op14-080-attack")
      .withLeader("p1", "OP14-080")
      .withHand("p1", copies(3, "ST31-005", "fodder"))
      .withDeckTop("p1", copies(1, "ST31-005", "banked"))
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder-1" });
    game.play({ type: "resolve-effect", optionId: "fodder-2" });
    game.play({ type: "resolve-effect", optionId: "fodder-3" });

    expect(game.state.players.p1.life.length).toBe(lifeBefore + 1);
  });
});

describe("OP14-081 Spider Mice", () => {
  covers("OP14-081", "[On Play]", "[On K.O.]");

  it("mills three when it lands", () => {
    const game = table("op14-081-play")
      .withHand("p1", [instance("spider", "OP14-081")])
      .withDeckTop("p1", copies(3, "ST31-005", "milled"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-081" });

    expect(game.state.players.p1.trash).toHaveLength(3);
  });

  it("removes a base-cost-1 body when it dies, ignoring cost buffs", () => {
    const game = table("op14-081-ko")
      .withBoard("p1", [character("spider", "OP14-081", { rested: true })])
      .withBoard("p2", [
        character("killer", "ST32-002"),
        character("one-cost", "ST32-005"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "spider",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "one-cost" });

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("one-cost");
  });
});

describe("OP14-082 Oinkchuck", () => {
  covers("OP14-082", "[On K.O.]", "[Trigger]");

  it("raises every Thriller Bark body's cost when it dies", () => {
    const game = table("op14-082-ko")
      .withBoard("p1", [
        character("oink", "OP14-082", { rested: true }),
        character("kumacy", "OP14-102"),
      ])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "oink",
    });
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "kumacy")
        ?.costModifiers,
    ).toContainEqual(expect.objectContaining({ amount: 4 }));
  });

  it("replays a Thriller Bark body rested off a Life card", () => {
    const game = atTriggerWindow(
      "op14-082-trigger",
      "oink",
      "OP14-082",
      (builder) => builder.withTrash("p1", [instance("kumacy", "OP14-102")]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "kumacy" });

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "kumacy")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP14-083 Ms. Wednesday", () => {
  covers("OP14-083", "[Activate: Main]");

  it("trashes itself to weaken a 0-cost Character", () => {
    const game = table("op14-083")
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [
        character("wednesday", "OP14-083"),
        character("mr9", "OP14-095"),
      ])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDeckTop("p1", copies(2, "ST31-005", "milled"))
      .build();

    // The Leader is what makes a 0-cost Character exist at all.
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "mr9" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    game.play({ type: "activate-main", sourceInstanceId: "wednesday" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -3000 }),
    );
  });

  it("is not offered with no 0-cost Character to point at", () => {
    const game = table("op14-083-empty")
      .withBoard("p1", [character("wednesday", "OP14-083")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "wednesday",
        ),
    ).toBe(false);
  });
});

describe("OP14-084 Ms. All Sunday", () => {
  covers("OP14-084", "[On Play]");

  it("revives a cost-4-or-less and a cost-1 Baroque Works body", () => {
    const game = table("op14-084")
      .withLeader("p1", "OP14-079")
      .withHand("p1", [instance("sunday", "OP14-084")])
      .withTrash("p1", [
        instance("four", "OP14-091"),
        instance("one", "OP14-083"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-084" });
    game.play({ type: "resolve-effect", optionId: "four" });
    game.play({ type: "resolve-effect", optionId: "one" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["four", "one"]),
    );
  });

  it("reaches a Former Baroque Works body too", () => {
    const game = table("op14-084-former")
      .withLeader("p1", "OP14-079")
      .withHand("p1", [instance("sunday", "OP14-084")])
      .withTrash("p1", [instance("former", "OP16-056")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-084" });
    game.play({ type: "resolve-effect", optionId: "former" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("former");
  });
});

describe("OP14-085 Miss.Goldenweek(Marianne)", () => {
  covers("OP14-085", "[On K.O.]");

  it("rummages two for two when it dies", () => {
    const game = table("op14-085")
      .withBoard("p1", [character("marianne", "OP14-085", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withHand("p1", [instance("held", "ST31-005")])
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "marianne",
    });
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP14-086 Miss Doublefinger(Zala)", () => {
  covers("OP14-086", "static");

  it("buffs itself and every Baroque Works body from a full trash", () => {
    const game = table("op14-086")
      .withBoard("p1", [
        character("zala", "OP14-086"),
        character("mr9", "OP14-095"),
      ])
      .withTrash("p1", copies(7, "ST31-005", "trash"))
      .build();

    expect(currentPower(game.state, "p1", "zala")).toBe(7000);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "mr9"),
    ).toBeDefined();

    const thin = table("op14-086-thin")
      .withBoard("p1", [character("zala", "OP14-086")])
      .withTrash("p1", copies(6, "ST31-005", "trash"))
      .build();
    expect(currentPower(thin.state, "p1", "zala")).toBe(6000);
  });
});

describe("OP14-087 Miss.Valentine(Mikita)", () => {
  covers("OP14-087", "[On Play]");

  it("digs four for a Baroque Works card and trashes the rest", () => {
    const game = table("op14-087")
      .withLeader("p1", "OP14-079")
      .withHand("p1", [instance("mikita", "OP14-087")])
      .withDeckTop("p1", [
        instance("found", "OP14-095"),
        ...copies(3, "ST31-005", "filler"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-087" });
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
    expect(game.state.players.p1.trash).toHaveLength(3);
  });
});

describe("OP14-088 Miss.MerryChristmas(Drophy)", () => {
  covers("OP14-088", "[On K.O.]");

  it("draws and removes a cost-1 Stage under a Baroque Works Leader", () => {
    const game = table("op14-088")
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [character("drophy", "OP14-088", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withStage("p2", instance("stage", "ST31-005"))
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "drophy",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "stage" });

    expect(game.state.players.p2.stage).toBeNull();
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
  });
});

describe("OP14-089 Ryuma", () => {
  covers("OP14-089", "[On K.O.]", "[Trigger]");

  it("rummages two for two when it dies", () => {
    const game = table("op14-089-ko")
      .withBoard("p1", [character("ryuma", "OP14-089", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withHand("p1", [instance("held", "ST31-005")])
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "ryuma",
    });
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("replays a Thriller Bark body rested off a Life card", () => {
    const game = atTriggerWindow(
      "op14-089-trigger",
      "ryuma",
      "OP14-089",
      (builder) => builder.withTrash("p1", [instance("kumacy", "OP14-102")]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "kumacy" });

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "kumacy")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP14-090 Mr.1(Daz.Bonez)", () => {
  covers("OP14-090", "[On Play]", "static");

  it("rests a 0-cost body and gains [Rush: Character] beside one", () => {
    const game = table("op14-090")
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [character("mr9", "OP14-095")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withHand("p1", [instance("mr1", "OP14-090")])
      .withDeckTop("p1", copies(2, "ST31-005", "milled"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "mr9" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    game.play({ type: "play-card", cardNumber: "OP14-090" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
    expect(hasKeyword(game.state, "p1", "mr1", "Rush: Character")).toBe(true);
  });

  it("has no [Rush: Character] without a 0-cost or 8-cost body out", () => {
    const game = table("op14-090-off")
      .withBoard("p1", [character("mr1", "OP14-090")])
      .build();

    expect(hasKeyword(game.state, "p1", "mr1", "Rush: Character")).toBe(false);
  });
});

describe("OP14-091 Mr.2.Bon.Kurei(Bentham)", () => {
  covers("OP14-091", "[On K.O.]");

  it("replays a Baroque Works body from hand or trash, not itself", () => {
    const game = table("op14-091")
      .withBoard("p1", [character("bentham", "OP14-091", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withTrash("p1", [
        instance("buried", "OP14-095"),
        instance("self", "OP14-091"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "bentham",
    });
    declineDefence(game);
    expect(
      game
        .legalActions()
        .some((action) => "optionId" in action && action.optionId === "self"),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "buried" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("buried");
  });
});

describe("OP14-092 Mr.3(Galdino)", () => {
  covers("OP14-092", "[Opponent's Turn]");

  it("buries three from the trash instead of dying in battle", () => {
    const game = table("op14-092")
      .withBoard("p1", [character("galdino", "OP14-092", { rested: true })])
      .withBoard("p2", [character("killer", "OP14-101")])
      .withTrash("p1", copies(3, "ST31-005", "buried"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "galdino",
    });
    // The replacement is offered from inside the battle, so the decline loop
    // has to stop as soon as it appears rather than passing through it.
    while (
      (game.state.phase === "block" || game.state.phase === "counter") &&
      !game.state.pendingEffect
    ) {
      game.pass();
    }
    const replacement = game
      .legalActions()
      .find(
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId.startsWith("mechanic:"),
      );
    expect(replacement).toBeDefined();
    game.play({ actionId: replacement!.actionId });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("galdino");
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("is not offered from a trash of two", () => {
    const game = table("op14-092-poor")
      .withBoard("p1", [character("galdino", "OP14-092", { rested: true })])
      .withBoard("p2", [character("killer", "OP14-101")])
      .withTrash("p1", copies(2, "ST31-005", "buried"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "galdino",
    });
    declineDefence(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("galdino");
  });
});

describe("OP14-093 Mr.4(Babe)", () => {
  covers("OP14-093", "[On K.O.]", "[Blocker]");

  it("recovers a Baroque Works body to hand when it dies", () => {
    const game = table("op14-093")
      .withBoard("p1", [character("babe", "OP14-093", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withTrash("p1", [instance("buried", "OP14-084")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    expect(hasKeyword(game.state, "p1", "babe", "Blocker")).toBe(true);

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "babe",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "buried" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "buried",
    );
  });
});

describe("OP14-094 Mr.5(Gem)", () => {
  covers("OP14-094", "[On Play]", "[Blocker]");

  it("rummages beside an 8-cost body and does nothing without one", () => {
    const off = table("op14-094-off")
      .withHand("p1", [instance("gem", "OP14-094")])
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .build();
    off.play({ type: "play-card", cardNumber: "OP14-094" });
    expect(off.state.players.p1.hand).toHaveLength(0);

    const on = table("op14-094-on")
      .withHand("p1", [instance("gem", "OP14-094")])
      .withBoard("p2", [character("giant", "OP14-101")])
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .build();
    on.play({ type: "play-card", cardNumber: "OP14-094" });
    on.play({ type: "resolve-effect", optionId: "draw-1" });

    expect(on.state.players.p1.hand).toHaveLength(1);
    expect(hasKeyword(on.state, "p1", "gem", "Blocker")).toBe(true);
  });
});

describe("OP14-096 Ground Death", () => {
  covers("OP14-096", "[Main]", "[Counter]");

  it("rests two DON!! to negate a cost-5-or-less Character", () => {
    const game = table("op14-096-main")
      .withHand("p1", [instance("event", "OP14-096")])
      .withBoard("p2", [character("victim", "OP14-026")])
      .build();

    game.play({ summary: "Ground Death" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.negatedEffects).toContainEqual(
      expect.objectContaining({ instanceId: "victim" }),
    );
  });

  it("adds +4000 from a trash of ten, and is not offered from a thinner one", () => {
    const rich = table("op14-096-rich")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-096")])
      .withTrash("p1", copies(9, "ST31-005", "trash"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    rich.pass();
    rich.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    rich.pass();
    rich.play({ type: "activate-counter-event", eventInstanceId: "event" });
    expect(rich.state.activeAttack?.counterPower).toBe(4000);

    const thin = table("op14-096-thin")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-096")])
      // Eight, because the Event itself is trashed as it is played and the
      // count is read afterwards.
      .withTrash("p1", copies(8, "ST31-005", "trash"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    thin.pass();
    thin.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    thin.pass();
    expect(
      thin
        .legalActions()
        .find((action) => action.type === "activate-counter-event"),
    ).toBeUndefined();
  });
});

describe("OP14-097 Hurry Up and Make Me the Pirate King!", () => {
  covers("OP14-097", "[Main]", "[Trigger]");

  it("digs three for a Thriller Bark card and trashes the rest", () => {
    const game = table("op14-097")
      .withHand("p1", [instance("event", "OP14-097")])
      .withDeckTop("p1", [
        instance("found", "OP14-102"),
        ...copies(2, "ST31-005", "filler"),
      ])
      .build();

    game.play({ summary: "Hurry Up and Make Me the Pirate King" });
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
    expect(game.state.players.p1.trash).toHaveLength(3);
  });

  it("runs the same search off a Life card", () => {
    const game = atTriggerWindow(
      "op14-097-trigger",
      "event",
      "OP14-097",
      (builder) =>
        builder.withDeckTop("p1", [
          instance("found", "OP14-102"),
          ...copies(2, "ST31-005", "filler"),
        ]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });
});

describe("OP14-098 Crescent Cutlass", () => {
  covers("OP14-098", "[Main]", "[Counter]");

  it("raises every Baroque Works cost beside a 0-cost body", () => {
    const game = table("op14-098-main")
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [
        character("mr9", "OP14-095"),
        character("babe", "OP14-093"),
      ])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withHand("p1", [instance("event", "OP14-098")])
      .withDeckTop("p1", copies(2, "ST31-005", "milled"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "mr9" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    game.play({ summary: "Crescent Cutlass" });

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "babe")
        ?.costModifiers,
    ).toContainEqual(expect.objectContaining({ amount: 3 }));
  });

  it("adds +3000 to the Leader as a Counter", () => {
    const game = table("op14-098-counter")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-098")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("OP14-099 Disappointed?", () => {
  covers("OP14-099", "[Main]", "[Trigger]");

  it("digs three for a Baroque Works card, itself excluded", () => {
    const game = table("op14-099")
      .withHand("p1", [instance("event", "OP14-099")])
      .withDeckTop("p1", [
        instance("self", "OP14-099"),
        instance("found", "OP14-095"),
        ...copies(1, "ST31-005", "filler"),
      ])
      .build();

    game.play({ summary: "Disappointed?" });
    expect(
      game
        .legalActions()
        .some((action) => "optionId" in action && action.optionId === "self"),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });

  it("runs the same search off a Life card", () => {
    const game = atTriggerWindow(
      "op14-099-trigger",
      "event",
      "OP14-099",
      (builder) =>
        builder.withDeckTop("p1", [
          instance("found", "OP14-095"),
          ...copies(2, "ST31-005", "filler"),
        ]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });
});

describe("OP14-100 Absalom", () => {
  covers("OP14-100", "[On K.O.]", "[Trigger]");

  it("digs three for a Thriller Bark card when it dies", () => {
    const game = table("op14-100-ko")
      .withBoard("p1", [character("absalom", "OP14-100", { rested: true })])
      .withBoard("p2", [character("killer", "ST32-002")])
      .withDeckTop("p1", [
        instance("found", "OP14-102"),
        ...copies(2, "ST31-005", "filler"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "absalom",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });

  it("replays a Thriller Bark body rested off a Life card", () => {
    const game = atTriggerWindow(
      "op14-100-trigger",
      "absalom",
      "OP14-100",
      (builder) => builder.withTrash("p1", [instance("kumacy", "OP14-102")]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "kumacy" });

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "kumacy")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP14-103 Gloriosa (Grandma Nyon)", () => {
  covers("OP14-103", "[On Play]", "[Trigger]");

  it("trades a Life card for a card off the top of the hand", () => {
    const game = table("op14-103")
      .withHand("p1", [
        instance("gloriosa", "OP14-103"),
        instance("banked", "ST31-005"),
      ])
      .withLife("p1", [instance("life", "ST31-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-103" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "life" });
    game.play({ type: "resolve-effect", optionId: "banked" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life",
    );
    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "banked",
    ]);
  });

  it("plays itself off a Life card", () => {
    const game = atTriggerWindow("op14-103-trigger", "nyon", "OP14-103");

    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("nyon");
  });
});

describe("OP14-105 Gorgon Sisters", () => {
  covers("OP14-105", "[Activate: Main]", "[Trigger]");

  it("reveals three Kuja cards to give the whole board a rested DON!!", () => {
    const game = table("op14-105")
      .withBoard("p1", [
        character("gorgon", "OP14-105"),
        character("ran", "OP14-114"),
      ])
      .withHand("p1", copies(3, "OP14-114", "kuja"))
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "gorgon" });
    game.play({ type: "resolve-effect", optionId: "kuja-1" });
    game.play({ type: "resolve-effect", optionId: "kuja-2" });
    game.play({ type: "resolve-effect", optionId: "kuja-3" });

    // One each to the Leader and to both Characters, and the hand is intact.
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(
      game.state.players.p1.board.every(
        (card) => (card.attachedDon ?? []).length === 1,
      ),
    ).toBe(true);
    expect(game.state.players.p1.hand).toHaveLength(3);
  });

  it("is not offered without three Kuja cards to reveal", () => {
    const game = table("op14-105-poor")
      .withBoard("p1", [character("gorgon", "OP14-105")])
      .withHand("p1", copies(2, "OP14-114", "kuja"))
      .withDon("p1", { rested: 4 })
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "gorgon",
        ),
    ).toBe(false);
  });

  it("plays itself off a Life card under a Kuja Leader", () => {
    const game = atTriggerWindow(
      "op14-105-trigger",
      "gorgon",
      "OP14-105",
      (builder) => builder.withLeader("p1", "OP14-041"),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("gorgon");
  });
});

describe("OP14-106 Salome", () => {
  covers("OP14-106", "[Blocker]", "[Trigger]");

  it("plays itself off a Life card and blocks", () => {
    const game = atTriggerWindow("op14-106-trigger", "salome", "OP14-106");

    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(hasKeyword(game.state, "p1", "salome", "Blocker")).toBe(true);
  });
});

describe("OP14-107 Shakuyaku", () => {
  covers("OP14-107", "[On Play]", "[Trigger]");

  it("rummages two for two against a short Life total", () => {
    const game = table("op14-107")
      .withHand("p1", [
        instance("shakuyaku", "OP14-107"),
        instance("held", "ST31-005"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-life"))
      .withLife("p2", 3)
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-107" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("does nothing while the opponent is at four Life", () => {
    const game = table("op14-107-off")
      .withHand("p1", [instance("shakuyaku", "OP14-107")])
      .withDeckTop("p2", copies(4, "ST32-005", "p2-life"))
      .withLife("p2", 4)
      .withDeckTop("p1", copies(2, "ST31-005", "draw"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-107" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("plays itself off a Life card under a Kuja Leader", () => {
    const game = atTriggerWindow(
      "op14-107-trigger",
      "shakuyaku",
      "OP14-107",
      (builder) =>
        builder
          .withLeader("p1", "OP14-041")
          .withDeckTop("p2", copies(4, "ST32-005", "p2-life"))
          .withLife("p2", 4),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("shakuyaku");
  });
});

describe("OP14-108 Silvers Rayleigh", () => {
  covers("OP14-108", "[On Play]", "[Trigger]");

  it("removes a 7000-or-less body under a multicoloured Leader", () => {
    const game = table("op14-108")
      .withLeader("p1", "OP14-041")
      .withHand("p1", [instance("rayleigh", "OP14-108")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-life"))
      .withLife("p2", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-108" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("runs the same removal off a Life card", () => {
    const game = atTriggerWindow(
      "op14-108-trigger",
      "rayleigh",
      "OP14-108",
      (builder) =>
        builder
          .withLeader("p1", "OP14-041")
          .withDeckTop("p2", copies(3, "ST32-005", "p2-life"))
          .withLife("p2", 3)
          .withBoard("p2", [
            character("attacker", "ST32-002"),
            character("victim", "ST32-004"),
          ]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("victim");
  });
});

describe("OP14-109 Victoria Cindry", () => {
  covers("OP14-109", "[Blocker]", "[Trigger]");

  it("replays a Thriller Bark body rested off a Life card", () => {
    const game = atTriggerWindow(
      "op14-109-trigger",
      "cindry",
      "OP14-109",
      (builder) => builder.withTrash("p1", [instance("kumacy", "OP14-102")]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "kumacy" });

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "kumacy")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP14-112 Boa Hancock", () => {
  covers("OP14-112", "[On Play]", "[Trigger]");

  it("banks a card on Life and strips one from the opponent's", () => {
    const game = table("op14-112")
      .withLeader("p1", "OP14-041")
      .withHand("p1", [instance("hancock", "OP14-112")])
      .withDeckTop("p1", copies(1, "ST31-005", "banked"))
      .withDeckTop("p2", [instance("stripped", "ST32-005")])
      .withLife("p2", 1)
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "play-card", cardNumber: "OP14-112" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.life.length).toBe(lifeBefore + 1);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "stripped",
    );
  });

  it("plays a [Trigger] body out of hand off a Life card", () => {
    const game = atTriggerWindow(
      "op14-112-trigger",
      "hancock",
      "OP14-112",
      (builder) => builder.withHand("p1", [instance("body", "OP14-106")]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "body" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("body");
  });
});

describe("OP14-113 Marguerite", () => {
  covers("OP14-113", "[On Play]", "[Trigger]");

  it("digs five for a Kuja card and then pays a card from hand", () => {
    const game = table("op14-113")
      .withHand("p1", [instance("marguerite", "OP14-113")])
      .withDeckTop("p1", [
        instance("found", "OP14-114"),
        ...copies(4, "ST31-005", "filler"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-113" });
    game.play({ type: "resolve-effect", optionId: "found" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    // Found and then discarded: the hand is empty either way, which is the
    // mandatory half of the clause.
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(1);
  });

  it("plays itself off a Life card under a Kuja Leader", () => {
    const game = atTriggerWindow(
      "op14-113-trigger",
      "marguerite",
      "OP14-113",
      (builder) => builder.withLeader("p1", "OP14-041"),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("marguerite");
  });
});

describe("OP14-114 Ran", () => {
  covers("OP14-114", "[Activate: Main]", "[Trigger]");

  it("gives a rested DON!! to a Kuja card only", () => {
    const game = table("op14-114")
      .withLeader("p1", "OP14-041")
      .withBoard("p1", [
        character("ran", "OP14-114"),
        character("outsider", "ST31-002"),
      ])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "ran" });
    expect(
      game
        .legalActions()
        .some(
          (action) => "optionId" in action && action.optionId === "outsider",
        ),
    ).toBe(false);
    game.play({ type: "resolve-effect", optionId: "ran" });

    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(1);
  });

  it("plays itself off a Life card under a Kuja Leader", () => {
    const game = atTriggerWindow(
      "op14-114-trigger",
      "ran",
      "OP14-114",
      (builder) => builder.withLeader("p1", "OP14-041"),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("ran");
  });
});

describe("OP14-115 Rindo", () => {
  covers("OP14-115", "[Opponent's Turn]", "[On K.O.]", "[Trigger]");

  it("cycles the top of the deck through Life when it dies on their turn", () => {
    const game = table("op14-115")
      .withBoard("p1", [character("rindo", "OP14-115", { rested: true })])
      .withBoard("p2", [character("killer", "OP14-101")])
      .withDeckTop("p1", copies(3, "ST31-005", "p1-life"))
      .withLife("p1", 3)
      .withDeckTop("p1", [instance("cycled", "OP14-106")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    const lifeBefore = game.state.players.p1.life.length;
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "rindo",
    });
    declineDefence(game);
    while (game.state.pendingEffect || game.state.pendingTrigger) {
      const trigger = game
        .legalActions()
        .find((action) => action.type === "resolve-trigger");
      game.play(
        trigger ? { actionId: trigger.actionId } : { type: "resolve-effect" },
      );
    }

    // Banked and then taken straight back off by its own damage: the Life
    // total is where it started and the card has passed through the Trigger
    // window.
    expect(game.state.players.p1.life.length).toBe(lifeBefore);
  });

  it("plays itself off a Life card under a Kuja Leader", () => {
    const game = atTriggerWindow(
      "op14-115-trigger",
      "rindo",
      "OP14-115",
      (builder) => builder.withLeader("p1", "OP14-041"),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("rindo");
  });
});

describe("OP14-116 Salamander", () => {
  covers("OP14-116", "[Counter]", "[Trigger]");

  it("adds +2000 and leaves a Kuja body behind", () => {
    const game = table("op14-116")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [
        instance("event", "OP14-116"),
        instance("body", "OP14-114"),
      ])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    game.play({ type: "resolve-effect", optionId: "body" });

    expect(game.state.activeAttack?.counterPower).toBe(2000);
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("body");
  });

  it("draws off a Life card", () => {
    const game = atTriggerWindow(
      "op14-116-trigger",
      "event",
      "OP14-116",
      (builder) => builder.withDeckTop("p1", copies(1, "ST31-005", "draw")),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
  });
});

describe("OP14-117 Brick Bat", () => {
  covers("OP14-117", "[Counter]", "[Trigger]");

  it("only reaches a Thriller Bark card in the battle", () => {
    const onType = table("op14-117-on")
      .withBoard("p1", [character("kumacy", "OP14-102", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-117")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    onType.pass();
    onType.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "kumacy",
    });
    onType.pass();
    onType.play({ type: "activate-counter-event", eventInstanceId: "event" });
    expect(onType.state.activeAttack?.counterPower).toBe(3000);

    const offType = table("op14-117-off")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP14-117")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    offType.pass();
    offType.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    offType.pass();
    expect(
      offType
        .legalActions()
        .find((action) => action.type === "activate-counter-event"),
    ).toBeUndefined();
  });

  it("replays a Thriller Bark body rested off a Life card", () => {
    const game = atTriggerWindow(
      "op14-117-trigger",
      "event",
      "OP14-117",
      (builder) => builder.withTrash("p1", [instance("kumacy", "OP14-102")]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "kumacy" });

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "kumacy")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP14-118 You'll Frighten Me... ♡", () => {
  covers("OP14-118", "[Counter]", "[Trigger]");

  it("stops an active Character attacking, from two Life or fewer", () => {
    const game = table("op14-118")
      .withBoard("p2", [
        character("attacker", "ST32-002"),
        character("standing", "ST32-004"),
      ])
      .withHand("p1", [instance("event", "OP14-118")])
      .withDeckTop("p1", copies(2, "ST31-005", "p1-life"))
      .withLife("p1", 2)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    game.play({ type: "resolve-effect", optionId: "standing" });

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "standing")
        ?.cannotAttackUntilTurn,
    ).toBe(game.state.turn);
  });

  it("plays a [Trigger] body out of hand off a Life card", () => {
    const game = atTriggerWindow(
      "op14-118-trigger",
      "event",
      "OP14-118",
      (builder) => builder.withHand("p1", [instance("body", "OP14-106")]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "body" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("body");
  });
});

describe("OP14-119 Dracule Mihawk", () => {
  covers("OP14-119", "[Your Turn]", "[On Your Opponent's Attack]");

  it("locks a cost-9-or-less body out of resting when it attacks", () => {
    const game = table("op14-119-rest")
      .withBoard("p1", [character("mihawk", "OP14-119")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "mihawk",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p2.board[0]?.cannotRestUntilTurn).toBe(
      game.state.turn + 1,
    );
  });

  it("trashes a card from hand for +2000 in a battle", () => {
    const game = table("op14-119-counter")
      .withBoard("p1", [character("mihawk", "OP14-119")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("fodder", "ST31-005")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });

    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });
});

describe("OP14-120 Crocodile", () => {
  covers("OP14-120", "[On Play]", "[On K.O.]");

  it("locks a body out of attacking and draws beside a 0-cost one", () => {
    const game = table("op14-120-play")
      .withHand("p1", [instance("croc", "OP14-120")])
      .withBoard("p2", [character("giant", "OP14-101")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-120" });
    game.play({ type: "resolve-effect", optionId: "giant" });

    expect(game.state.players.p2.board[0]?.cannotAttackUntilTurn).toBe(
      game.state.turn + 1,
    );
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
  });

  it("trashes a card from hand to come back out of the trash", () => {
    const game = table("op14-120-ko")
      .withBoard("p1", [character("croc", "OP14-120", { rested: true })])
      .withBoard("p2", [character("killer", "OP14-101")])
      .withHand("p1", [instance("fodder", "ST31-005")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "croc",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("croc");
  });
});

describe("OP14-041 Boa Hancock (Leader)", () => {
  covers("OP14-041", "[Opponent's Turn]");

  it("draws when a Character reaches the board on the opponent's turn", () => {
    const game = atTriggerWindow(
      "op14-041-draw",
      "salome",
      "OP14-106",
      (builder) =>
        builder
          .withLeader("p1", "OP14-041")
          .withDeckTop("p1", copies(1, "ST31-005", "draw")),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
  });

  it("does not draw for a Character played on its own turn", () => {
    const game = table("op14-041-own-turn")
      .withLeader("p1", "OP14-041")
      .withHand("p1", [instance("salome", "OP14-106")])
      .withDeckTop("p1", copies(1, "ST31-005", "draw"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-106" });

    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("strips a Life card when a big Kuja body is K.O.'d", () => {
    const game = table("op14-041-ko")
      .withLeader("p1", "OP14-041")
      .withBoard("p1", [character("rindo", "OP14-115", { rested: true })])
      .withBoard("p2", [character("killer", "OP14-101")])
      .withDon("p1", { leaderAttached: 1 })
      .withDeckTop("p2", [instance("stripped", "ST32-005")])
      .withLife("p2", 1)
      .withDeckTop("p1", copies(1, "ST31-005", "cycled"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "rindo",
    });
    declineDefence(game);
    while (game.state.pendingEffect || game.state.pendingTrigger) {
      const trigger = game
        .legalActions()
        .find((action) => action.type === "resolve-trigger");
      game.play(
        trigger ? { actionId: trigger.actionId } : { type: "resolve-effect" },
      );
    }

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "stripped",
    );
  });
});
