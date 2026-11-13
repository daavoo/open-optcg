import { describe, expect, it } from "vitest";
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
 * OP-18's Purple cards, OP18-060 to OP18-078.
 *
 * No shipped list plays them, so every position seats two starter decks on a
 * bare table and puts the card under test in a zone with a `with*` setter.
 * The fillers are vanilla: OP18-062 (a 10000 body), OP18-073 (a 7000
 * {Water Seven}) and OP11-003 (a 6000 {Straw Hat Crew}).
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 in its own Main Phase on a bare table, ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 in its own Main Phase, for the clauses that answer the opponent. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

/**
 * Take an `optional` prompt's apply branch if one is open, then answer the
 * DON!! −N payment's "which DON!!" question with a rested one, when asked.
 */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) pick(game, "apply");
  payDon(game);
};

const payDon = (game: Game) => {
  const donOption = (): string | undefined => {
    const options = effectOptions(game.state);
    return (
      options.find((id) => id === "return-don:rested") ??
      options.find((id) => id.startsWith("return-don:"))
    );
  };
  for (let option = donOption(); option; option = donOption()) {
    pick(game, option);
  }
};

const fieldDon = (state: GameState, player: "p1" | "p2" = "p1") => {
  const p = state.players[player];
  return (
    p.activeDon.length +
    p.restedDon.length +
    p.leaderAttachedDon.length +
    p.board.reduce((sum, card) => sum + (card.attachedDon?.length ?? 0), 0)
  );
};

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const activations = (game: Game, cardNumber: string) =>
  game
    .legalActions("p1")
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === cardNumber,
    );

/** Pass the block and Counter steps, stopping at any prompt the battle raises. */
const passDefence = (game: Game) => {
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    !game.state.pendingEffect
  ) {
    game.pass();
  }
};

describe("OP18-060 Saint Gunko (Leader) trash-play watcher", () => {
  covers("OP18-060", "static");

  const leaderTable = (seed: string) =>
    table(seed)
      .withLeader("p1", "OP18-060")
      .withDeckTop("p1", copies(4, "OP11-003", "drawn"))
      .withTrash("p1", [instance("killingham", "OP18-064")]);

  it("draws 2 and trashes 1 when a Character is played from the trash", () => {
    const game = leaderTable("op18-060-watch")
      .withHand("p1", [instance("gunko", "OP18-065")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-065" });
    applyOptional(game);
    pick(game, "killingham");
    // Killingham's own [On Play] (it is p1's turn) and the Leader's draw both
    // follow; decline the DON!! −1 and pay the trash with a drawn card.
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      if (options.includes("skip")) pick(game, "skip");
      else if (options.includes("drawn-1")) pick(game, "drawn-1");
      else game.play({ type: "resolve-effect" });
    }

    expect(ids(game.state.players.p1.board)).toContain("killingham");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn-2"]);
    expect(ids(game.state.players.p1.trash)).toContain("drawn-1");
  });

  it("answers only once per turn", () => {
    // Two Killinghams K.O.'d on p2's turn, each paying its own [On K.O.] to
    // come back: two plays from the trash, one draw.
    const game = defending("op18-060-once")
      .withLeader("p1", "OP18-060")
      .withDeckTop("p1", copies(4, "OP11-003", "drawn"))
      .withBoard("p1", [
        character("killingham", "OP18-064", { rested: true }),
        character("killingham-2", "OP18-064", { rested: true }),
      ])
      .withBoard("p2", [
        character("attacker", "OP18-062", { playedTurn: 1 }),
        character("attacker-2", "OP18-062", { playedTurn: 1 }),
      ])
      .build();

    for (const [attacker, target] of [
      ["attacker", "killingham"],
      ["attacker-2", "killingham-2"],
    ] as const) {
      game.play({
        type: "attack",
        attackerInstanceId: attacker,
        targetInstanceId: target,
      });
      passDefence(game);
      applyOptional(game);
      settle(game);
    }

    expect(ids(game.state.players.p1.board).sort()).toEqual([
      "killingham",
      "killingham-2",
    ]);
    expect(game.state.players.p1.deck).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("does not answer a Character played from hand", () => {
    const game = leaderTable("op18-060-hand")
      .withHand("p1", [instance("usopp", "OP11-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-003" });
    settle(game);

    expect(game.state.players.p1.deck).toHaveLength(4);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP18-060 Saint Gunko (Leader) DON!! activation", () => {
  covers("OP18-060", "[Activate: Main]");

  it("trashes a card for one active DON!! with an 8000-base-power Character out", () => {
    const game = table("op18-060-activate")
      .withLeader("p1", "OP18-060")
      .withBoard("p1", [character("oimo", "OP18-062")])
      .withHand("p1", [instance("fuel", "OP11-003")])
      .withDonDeck("p1", 2)
      .build();
    const active = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", sourceCardNumber: "OP18-060" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
    expect(game.state.players.p1.activeDon).toHaveLength(active + 1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    // [Once Per Turn].
    expect(activations(game, "OP18-060")).toHaveLength(0);
  });

  it("is not offered without a Character of 8000 base power", () => {
    const game = table("op18-060-no-body")
      .withLeader("p1", "OP18-060")
      .withBoard("p1", [character("tbone", "OP18-073")])
      .withHand("p1", [instance("fuel", "OP11-003")])
      .withDonDeck("p1", 2)
      .build();

    expect(activations(game, "OP18-060")).toHaveLength(0);
  });

  it("is not offered with an empty hand", () => {
    const game = table("op18-060-no-hand")
      .withLeader("p1", "OP18-060")
      .withBoard("p1", [character("oimo", "OP18-062")])
      .withDonDeck("p1", 2)
      .build();

    expect(activations(game, "OP18-060")).toHaveLength(0);
  });
});

describe("OP18-061 Iceburg", () => {
  covers("OP18-061", "[On Play]");

  it("keeps up to two Stage or {Water Seven} cards of the top five", () => {
    const game = table("op18-061")
      .withHand("p1", [instance("iceburg", "OP18-061")])
      .withDeckTop("p1", [
        instance("sunny", "OP18-075"),
        instance("tbone", "OP18-073"),
        instance("usopp", "OP11-003"),
        instance("merry", "OP18-078"),
        instance("oimo", "OP18-062"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-061" });
    const offered = effectOptions(game.state);
    expect(offered).toEqual(
      expect.arrayContaining(["sunny", "tbone", "merry"]),
    );
    expect(offered).not.toContain("usopp");
    expect(offered).not.toContain("oimo");
    pick(game, "sunny");
    pick(game, "tbone");
    settle(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["sunny", "tbone"]);
    expect(game.state.players.p1.deck).toHaveLength(3);
  });
});

describe("OP18-063 Kiwi & Mozu", () => {
  covers("OP18-063", "[On Play]");

  it("K.O.s a cost-5 Stage for one rested DON!!", () => {
    const game = table("op18-063")
      .withStage("p1", instance("sunny", "OP18-075"))
      .withHand("p1", [instance("kiwi", "OP18-063")])
      .withDonDeck("p1", 2)
      .build();
    const rested = game.state.players.p1.restedDon.length;

    game.play({ type: "play-card", cardNumber: "OP18-063" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.stage).toBeNull();
    expect(ids(game.state.players.p1.trash)).toContain("sunny");
    // Three DON!! paid for the play, one more added rested.
    expect(game.state.players.p1.restedDon).toHaveLength(rested + 3 + 1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("keeps the Stage when declined", () => {
    const game = table("op18-063-decline")
      .withStage("p1", instance("sunny", "OP18-075"))
      .withHand("p1", [instance("kiwi", "OP18-063")])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-063" });
    pick(game, "skip");

    expect(game.state.players.p1.stage?.instanceId).toBe("sunny");
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("asks nothing without a Stage", () => {
    const game = table("op18-063-none")
      .withHand("p1", [instance("kiwi", "OP18-063")])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-063" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });
});

describe("OP18-064 Saint Killingham On Play", () => {
  covers("OP18-064", "[Your Turn]", "[On Play]");

  it("locks one 7000-base and one 5000-base opposing Character out of attacking", () => {
    const game = table("op18-064")
      .withHand("p1", [instance("killingham", "OP18-064")])
      .withBoard("p2", [
        character("tbone", "OP18-073"),
        character("kin", "ST32-001"),
        character("oimo", "OP18-062"),
      ])
      // p2 draws on the turn the lock is read; a bare table has no deck.
      .withDeckTop("p2", copies(2, "OP11-003", "p2-drawn"))
      .build();
    const don = fieldDon(game.state);

    game.play({ type: "play-card", cardNumber: "OP18-064" });
    applyOptional(game);
    const big = effectOptions(game.state);
    expect(big).toEqual(expect.arrayContaining(["tbone", "kin"]));
    expect(big).not.toContain("oimo");
    pick(game, "tbone");
    const small = effectOptions(game.state);
    expect(small).toContain("kin");
    expect(small).not.toContain("tbone");
    pick(game, "kin");
    settle(game);

    expect(fieldDon(game.state)).toBe(don - 1);
    game.pass();
    const attackers = game
      .legalActions("p2")
      .flatMap((action) =>
        action.type === "attack" ? [action.attackerInstanceId] : [],
      );
    expect(attackers).not.toContain("tbone");
    expect(attackers).not.toContain("kin");
    expect(attackers).toContain("oimo");
  });

  it("does nothing when played on the opponent's turn", () => {
    // Played back from the trash by its own [On K.O.], on p2's turn.
    const game = defending("op18-064-opp-turn")
      .withBoard("p1", [character("killingham", "OP18-064", { rested: true })])
      .withBoard("p2", [
        character("attacker", "OP18-062", { playedTurn: 1 }),
        character("tbone", "OP18-073"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "killingham",
    });
    passDefence(game);
    applyOptional(game);
    settle(game);

    expect(ids(game.state.players.p1.board)).toContain("killingham");
    expect(game.state.pendingEffect).toBeNull();
    const tbone = game.state.players.p2.board.find(
      (card) => card.instanceId === "tbone",
    );
    expect(tbone?.cannotAttackUntilTurn).toBeUndefined();
  });
});

describe("OP18-064 Saint Killingham On K.O.", () => {
  covers("OP18-064", "[On K.O.]");

  const koed = (seed: string) =>
    defending(seed)
      .withBoard("p1", [character("killingham", "OP18-064", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-062", { playedTurn: 1 })])
      .build();

  it("pays DON!! −1 to play itself back from the trash", () => {
    const game = koed("op18-064-ko");
    const don = fieldDon(game.state);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "killingham",
    });
    passDefence(game);
    applyOptional(game);
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["killingham"]);
    expect(fieldDon(game.state)).toBe(don - 1);
  });

  it("stays in the trash when declined", () => {
    const game = koed("op18-064-ko-decline");

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "killingham",
    });
    passDefence(game);
    pick(game, "skip");

    expect(ids(game.state.players.p1.trash)).toContain("killingham");
    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP18-065 Saint Gunko", () => {
  covers("OP18-065", "[On Play]");

  it("pays DON!! −1 to play a 6000-or-less {Celestial Dragons} Character from the trash", () => {
    const game = table("op18-065")
      .withHand("p1", [instance("gunko", "OP18-065")])
      .withTrash("p1", [
        instance("killingham", "OP18-064"),
        instance("usopp", "OP11-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-065" });
    applyOptional(game);
    expect(effectOptions(game.state)).not.toContain("usopp");
    pick(game, "killingham");
    // Killingham's own [On Play] follows; decline it.
    if (effectOptions(game.state).includes("skip")) pick(game, "skip");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["gunko", "killingham"]);
  });

  it("returns no DON!! when declined", () => {
    const game = table("op18-065-decline")
      .withHand("p1", [instance("gunko", "OP18-065")])
      .withTrash("p1", [instance("killingham", "OP18-064")])
      .build();
    const don = fieldDon(game.state);

    game.play({ type: "play-card", cardNumber: "OP18-065" });
    pick(game, "skip");

    expect(fieldDon(game.state)).toBe(don);
    expect(ids(game.state.players.p1.trash)).toEqual(["killingham"]);
  });
});

describe("OP18-065 Saint Gunko Blocker", () => {
  covers("OP18-065", "[Blocker]");

  it("blocks a declared attack", () => {
    const game = defending("op18-065-blocker")
      .withBoard("p1", [character("gunko", "OP18-065")])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "gunko" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("gunko");
  });
});

describe("OP18-066 Zambai", () => {
  covers("OP18-066", "[Activate: Main]");

  it("K.O.s a Stage to gain [Rush] this turn", () => {
    const game = table("op18-066")
      .withHand("p1", [instance("zambai", "OP18-066")])
      .withStage("p1", instance("merry", "OP18-078"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-066" });
    expect(hasKeyword(game.state, "p1", "zambai", "Rush")).toBe(false);
    game.play({ type: "activate-main", sourceCardNumber: "OP18-066" });
    settle(game);

    expect(game.state.players.p1.stage).toBeNull();
    expect(hasKeyword(game.state, "p1", "zambai", "Rush")).toBe(true);
    expect(
      game.action({
        type: "attack",
        attackerInstanceId: "zambai",
        targetInstanceId: "p2-leader",
      }),
    ).toBeDefined();
  });

  it("is not offered without a Stage of cost 5 or less", () => {
    const game = table("op18-066-none")
      .withBoard("p1", [character("zambai", "OP18-066")])
      .build();

    expect(activations(game, "OP18-066")).toHaveLength(0);
  });
});

describe("OP18-067 Charlotte Smoothie", () => {
  covers("OP18-067", "[On Play]");

  it("trashes a {Big Mom Pirates} card from hand to draw 2", () => {
    const game = table("op18-067")
      .withHand("p1", [
        instance("smoothie", "OP18-067"),
        instance("fuel", "OP18-067"),
        instance("usopp", "OP11-003"),
      ])
      .withDeckTop("p1", copies(2, "OP11-003", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-067" });
    applyOptional(game);
    expect(effectOptions(game.state)).not.toContain("usopp");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "drawn-1",
      "drawn-2",
      "usopp",
    ]);
  });

  it("asks nothing without a {Big Mom Pirates} card to pay with", () => {
    const game = table("op18-067-none")
      .withHand("p1", [
        instance("smoothie", "OP18-067"),
        instance("usopp", "OP11-003"),
      ])
      .withDeckTop("p1", copies(2, "OP11-003", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-067" });

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.hand)).toEqual(["usopp"]);
  });
});

describe("OP18-068 Senor Pink On Play", () => {
  covers("OP18-068", "[On Play]");

  it("pays DON!! −1 so an opposing cost-7 Character cannot be rested", () => {
    const game = table("op18-068")
      .withHand("p1", [instance("pink", "OP18-068")])
      .withBoard("p2", [
        character("kyros", "OP10-046"),
        character("oimo", "OP18-062"),
      ])
      .build();
    const don = fieldDon(game.state);

    game.play({ type: "play-card", cardNumber: "OP18-068" });
    applyOptional(game);
    expect(effectOptions(game.state)).not.toContain("oimo");
    pick(game, "kyros");
    settle(game);

    expect(fieldDon(game.state)).toBe(don - 1);
    const kyros = game.state.players.p2.board.find(
      (card) => card.instanceId === "kyros",
    );
    expect(kyros?.cannotRestUntilTurn).toBeGreaterThan(game.state.turn);
  });
});

describe("OP18-068 Senor Pink K.O. replacement", () => {
  covers("OP18-068", "static");

  const attacked = (seed: string) => {
    const game = defending(seed)
      .withBoard("p1", [character("pink", "OP18-068", { rested: true })])
      .withBoard("p2", [
        character("attacker", "OP18-062", { playedTurn: 1 }),
        character("attacker-2", "OP18-062", { playedTurn: 1 }),
      ])
      .build();
    return game;
  };

  it("returns 1 DON!! instead of being K.O.'d, once per turn", () => {
    const game = attacked("op18-068-replace");
    const don = fieldDon(game.state);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "pink",
    });
    passDefence(game);
    expect(effectOptions(game.state).some((id) => id.endsWith(":pink"))).toBe(
      true,
    );
    pick(game, "mechanic:pink:pink");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["pink"]);
    expect(fieldDon(game.state)).toBe(don - 1);

    // A second K.O. the same turn finds the use spent.
    game.play({
      type: "attack",
      attackerInstanceId: "attacker-2",
      targetInstanceId: "pink",
    });
    passDefence(game);
    settle(game);
    expect(ids(game.state.players.p1.trash)).toContain("pink");
  });
});

describe("OP18-069 Sodomu & Gomora", () => {
  covers("OP18-069", "static");

  const attacked = (seed: string, rested = false) =>
    defending(seed)
      .withBoard("p1", [
        character("sodomu", "OP18-069", { rested }),
        character("zambai", "OP18-066", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "OP18-062", { playedTurn: 1 })])
      .build();

  it("returns 1 DON!! and rests itself to save a {The Franky Family} Character", () => {
    const game = attacked("op18-069");
    const don = fieldDon(game.state);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "zambai",
    });
    passDefence(game);
    pick(game, "mechanic:zambai:sodomu");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["sodomu", "zambai"]);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(fieldDon(game.state)).toBe(don - 1);
  });

  it("cannot pay while already rested", () => {
    const game = attacked("op18-069-rested", true);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "zambai",
    });
    passDefence(game);
    expect(effectOptions(game.state).some((id) => id.endsWith(":sodomu"))).toBe(
      false,
    );
    settle(game);
    expect(ids(game.state.players.p1.trash)).toContain("zambai");
  });
});

describe("OP18-070 Tom", () => {
  covers("OP18-070", "[On Play]");

  it("pays DON!! −1 and a card for up to two Stages from the trash", () => {
    const game = table("op18-070")
      .withHand("p1", [
        instance("tom", "OP18-070"),
        instance("fuel", "OP11-003"),
      ])
      .withTrash("p1", [
        instance("sunny", "OP18-075"),
        instance("merry", "OP18-078"),
        instance("tbone", "OP18-073"),
      ])
      .build();
    const don = fieldDon(game.state);

    game.play({ type: "play-card", cardNumber: "OP18-070" });
    applyOptional(game);
    pick(game, "fuel");
    expect(effectOptions(game.state)).not.toContain("tbone");
    pick(game, "sunny");
    pick(game, "merry");
    settle(game);

    expect(fieldDon(game.state)).toBe(don - 1);
    expect(ids(game.state.players.p1.hand).sort()).toEqual(["merry", "sunny"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["fuel", "tbone"]);
  });

  it("asks nothing with an empty hand to pay from", () => {
    const game = table("op18-070-no-hand")
      .withHand("p1", [instance("tom", "OP18-070")])
      .withTrash("p1", [instance("sunny", "OP18-075")])
      .build();
    const don = fieldDon(game.state);

    game.play({ type: "play-card", cardNumber: "OP18-070" });

    expect(game.state.pendingEffect).toBeNull();
    expect(fieldDon(game.state)).toBe(don);
  });
});

describe("OP18-071 Trebol removal replacement", () => {
  covers("OP18-071", "static");

  it("returns 1 DON!! instead of a {Donquixote Pirates} Character leaving to the opponent's effect", () => {
    const game = defending("op18-071")
      .withBoard("p1", [
        character("trebol", "OP18-071"),
        character("trebol-2", "OP18-071"),
      ])
      .withHand("p2", [instance("kyros", "OP10-046")])
      .build();
    const don = fieldDon(game.state);

    game.play({ type: "play-card", cardNumber: "OP10-046" });
    pick(game, "trebol-2");
    expect(effectOptions(game.state)).toContain("replace:trebol");
    pick(game, "replace:trebol");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["trebol", "trebol-2"]);
    expect(fieldDon(game.state)).toBe(don - 1);
  });

  it("answers once per turn", () => {
    // Two On Play K.O.s at two cost-2 {Donquixote Pirates} bodies.
    const game = defending("op18-071-once")
      .withBoard("p1", [
        character("trebol", "OP18-071"),
        character("baby", "OP12-111"),
        character("baby-2", "OP12-111"),
      ])
      .withHand("p2", copies(2, "EB01-049", "remover"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-049" });
    pick(game, "baby");
    pick(game, "replace:trebol");
    settle(game);
    game.play({ type: "play-card", cardNumber: "EB01-049" });
    pick(game, "baby-2");
    expect(
      effectOptions(game.state).some((id) => id.startsWith("replace:")),
    ).toBe(false);
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["trebol", "baby"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["baby-2"]);
  });

  it("does not answer a K.O. in battle", () => {
    const game = defending("op18-071-battle")
      .withBoard("p1", [character("trebol", "OP18-071", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-062", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "trebol",
    });
    passDefence(game);
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["trebol"]);
  });

  it("does not answer a Character of another type", () => {
    const game = defending("op18-071-off-type")
      .withBoard("p1", [
        character("trebol", "OP18-071"),
        character("zambai", "OP18-066"),
      ])
      .withHand("p2", [instance("kyros", "OP10-046")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-046" });
    pick(game, "zambai");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["zambai"]);
  });
});

describe("OP18-071 Trebol behind a Sugar Leader", () => {
  covers("OP18-071", "[Opponent's Turn]");

  it("gains +2000 and blocks on the opponent's turn behind [Sugar]", () => {
    const game = defending("op18-071-sugar")
      .withLeader("p1", "OP10-003")
      .withBoard("p1", [character("trebol", "OP18-071")])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .build();

    expect(currentPower(game.state, "p1", "trebol", false)).toBe(8000);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "trebol" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("trebol");
  });

  it("gains nothing on its own turn, or behind another Leader", () => {
    const own = table("op18-071-own")
      .withLeader("p1", "OP10-003")
      .withBoard("p1", [character("trebol", "OP18-071")])
      .build();
    expect(currentPower(own.state, "p1", "trebol", false)).toBe(6000);

    const other = defending("op18-071-other")
      .withBoard("p1", [character("trebol", "OP18-071")])
      .build();
    expect(currentPower(other.state, "p1", "trebol", false)).toBe(6000);
  });

  it("cannot block behind another Leader", () => {
    const game = defending("op18-071-no-block")
      .withBoard("p1", [character("trebol", "OP18-071")])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      false,
    );
  });
});

describe("OP18-072 The Franky Family", () => {
  covers("OP18-072", "[Activate: Main]");

  it("K.O.s a Stage for −3000 on the turn it was played", () => {
    const game = table("op18-072")
      .withHand("p1", [instance("franky", "OP18-072")])
      .withStage("p1", instance("merry", "OP18-078"))
      .withBoard("p2", [character("tbone", "OP18-073")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-072" });
    game.play({ type: "activate-main", sourceCardNumber: "OP18-072" });
    settle(game);

    expect(game.state.players.p1.stage).toBeNull();
    expect(currentPower(game.state, "p2", "tbone", false)).toBe(4000);
    // [Once Per Turn].
    expect(activations(game, "OP18-072")).toHaveLength(0);
  });

  it("is not offered on a later turn", () => {
    const game = table("op18-072-later")
      .withBoard("p1", [character("franky", "OP18-072")])
      .withStage("p1", instance("merry", "OP18-078"))
      .build();

    expect(activations(game, "OP18-072")).toHaveLength(0);
  });
});

describe("OP18-072 The Franky Family Blocker", () => {
  covers("OP18-072", "[Blocker]");

  it("blocks a declared attack", () => {
    const game = defending("op18-072-blocker")
      .withBoard("p1", [character("franky", "OP18-072")])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "franky" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("franky");
  });
});

describe("OP18-074 Counter", () => {
  covers("OP18-074", "[Counter]");

  const underAttack = (seed: string, withStage: boolean) => {
    const builder = defending(seed)
      .withHand("p1", [instance("ship", "OP18-074")])
      .withBoard("p2", [character("attacker", "OP18-062", { playedTurn: 1 })]);
    return (
      withStage
        ? builder.withStage("p1", instance("sunny", "OP18-075"))
        : builder
    ).build();
  };

  const toCounterStep = (game: Game) => {
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    return game;
  };

  it("adds +4000 with a cost-5 Stage out", () => {
    const game = toCounterStep(underAttack("op18-074-stage", true));
    game.play({ summary: "Can You Please Sail" });
    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("is not offered without one, since its only clause would add nothing", () => {
    const game = toCounterStep(underAttack("op18-074-none", false));
    expect(
      game
        .legalActions("p1")
        .filter((action) => action.type === "activate-counter-event"),
    ).toHaveLength(0);
  });
});

describe("OP18-074 Trigger", () => {
  covers("OP18-074", "[Trigger]");

  it("pays DON!! −1 for up to two Stages from the trash", () => {
    const game = defending("op18-074-trigger")
      .withLife("p1", [instance("ship", "OP18-074")])
      .withTrash("p1", [
        instance("sunny", "OP18-075"),
        instance("merry", "OP18-078"),
      ])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .build();
    const don = fieldDon(game.state);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passDefence(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    applyOptional(game);
    pick(game, "sunny");
    pick(game, "merry");
    settle(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["merry", "sunny"]);
    expect(fieldDon(game.state)).toBe(don - 1);
  });
});

describe("OP-18 Purple Stages On Play", () => {
  covers("OP18-075", "[On Play]");
  covers("OP18-076", "[On Play]");
  covers("OP18-077", "[On Play]");
  covers("OP18-078", "[On Play]");

  it.each(["OP18-075", "OP18-076", "OP18-077", "OP18-078"])(
    "%s draws 1 and adds one rested DON!!",
    (cardNumber) => {
      const game = table(`op18-stage-${cardNumber}`)
        .withHand("p1", [instance("stage", cardNumber)])
        .withDeckTop("p1", [instance("drawn", "OP11-003")])
        .withDonDeck("p1", 1)
        .build();
      const rested = game.state.players.p1.restedDon.length;

      game.play({ type: "play-card", cardNumber });
      settle(game);

      expect(game.state.players.p1.stage?.instanceId).toBe("stage");
      expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
      expect(game.state.players.p1.restedDon).toHaveLength(rested + 5 + 1);
      expect(game.state.players.p1.donDeck).toHaveLength(0);
    },
  );
});

describe("OP18-075 Thousand Sunny activation", () => {
  covers("OP18-075", "[Activate: Main]");

  it("pays DON!! −2 and rests itself to stand a rested {Straw Hat Crew} Character", () => {
    const game = table("op18-075")
      .withStage("p1", instance("sunny", "OP18-075"))
      .withBoard("p1", [
        character("usopp", "OP11-003", { rested: true }),
        character("tbone", "OP18-073", { rested: true }),
      ])
      .build();
    const don = fieldDon(game.state);

    game.play({ type: "activate-main", sourceCardNumber: "OP18-075" });
    expect(effectOptions(game.state)).not.toContain("tbone");
    pick(game, "usopp");
    settle(game);

    expect(fieldDon(game.state)).toBe(don - 2);
    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.board[0]?.rested).toBe(false);
    expect(activations(game, "OP18-075")).toHaveLength(0);
  });
});

describe("OP18-076 Shark Submerge 3", () => {
  covers("OP18-076", "[On Your Opponent's Attack]");

  it("rests itself for +1000 on a 5000 Leader and two Characters", () => {
    const game = defending("op18-076")
      .withStage("p1", instance("shark", "OP18-076"))
      .withBoard("p1", [
        character("usopp", "OP11-003"),
        character("tbone", "OP18-073"),
      ])
      .withBoard("p2", [character("attacker", "OP18-062", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    pick(game, "usopp");
    pick(game, "tbone");
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(6000);
    expect(currentPower(game.state, "p1", "usopp", false)).toBe(7000);
    expect(currentPower(game.state, "p1", "tbone", false)).toBe(8000);
  });

  it("leaves a Leader above 5000 power unbuffed", () => {
    // OP13-003 is a 7000 Leader on a full DON!! field.
    const game = defending("op18-076-big-leader")
      .withLeader("p1", "OP13-003")
      .withStage("p1", instance("shark", "OP18-076"))
      .withBoard("p1", [character("usopp", "OP11-003")])
      .withBoard("p2", [character("attacker", "OP18-062", { playedTurn: 1 })])
      .build();
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(7000);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    pick(game, "usopp");
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(7000);
    expect(currentPower(game.state, "p1", "usopp", false)).toBe(7000);
  });

  it("is not offered while the Stage is rested", () => {
    const game = defending("op18-076-rested")
      .withStage("p1", { ...instance("shark", "OP18-076"), rested: true })
      .withBoard("p2", [character("attacker", "OP18-062", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP18-077 White Hobby Horse", () => {
  covers("OP18-077", "[Activate: Main]");

  it("rests itself to give a {Straw Hat Crew} Character [Rush: Character]", () => {
    const game = table("op18-077")
      .withStage("p1", instance("horse", "OP18-077"))
      .withHand("p1", [instance("usopp", "OP11-003")])
      .withBoard("p2", [character("target", "OP18-073", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-003" });
    game.play({ type: "activate-main", sourceCardNumber: "OP18-077" });
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    const targets = game
      .legalActions()
      .flatMap((action) =>
        action.type === "attack" && action.attackerInstanceId === "usopp"
          ? [action.targetInstanceId]
          : [],
      );
    expect(targets).toEqual(["target"]);
  });

  it("is not offered while the Stage is rested", () => {
    const game = table("op18-077-rested")
      .withStage("p1", { ...instance("horse", "OP18-077"), rested: true })
      .withBoard("p1", [character("usopp", "OP11-003")])
      .build();

    expect(activations(game, "OP18-077")).toHaveLength(0);
  });
});

describe("OP18-078 Mini-Merry", () => {
  covers("OP18-078", "[Activate: Main]");

  it("rests itself to give the Leader and Characters 1 rested DON!! each", () => {
    const game = table("op18-078")
      .withStage("p1", instance("merry", "OP18-078"))
      .withBoard("p1", [
        character("usopp", "OP11-003"),
        character("tbone", "OP18-073"),
      ])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP18-078" });
    pick(game, "p1-leader");
    pick(game, "usopp");
    pick(game, "tbone");
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(
      game.state.players.p1.board.map((c) => c.attachedDon?.length),
    ).toEqual([1, 1]);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("is not offered with no rested DON!!", () => {
    const game = table("op18-078-none")
      .withStage("p1", instance("merry", "OP18-078"))
      .build();

    expect(activations(game, "OP18-078")).toHaveLength(0);
  });
});
