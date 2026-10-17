import { describe, expect, it } from "vitest";
import {
  currentPower,
  fieldDonCount,
  hasKeyword,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP15 printed clauses no other file claims, one `describe` per card.
 *
 * Built like `test/op15.test.ts`: the format's ST31/ST32 decks on a bare
 * table, with the OP15 card placed where the clause needs it. Printed text for
 * any card here is `pnpm card:text <card>`.
 */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

const activations = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    );

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

/** Declines the Block and Counter steps so a declared battle resolves. */
const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

/** Answers every `DON!! −N` placement with the first DON!! offered. */
const placeReturnedDon = (game: Game) => {
  while (game.state.pendingEffect?.kind === "return-don") {
    game.play({ type: "resolve-effect" });
  }
};

describe("OP15-010 Nezumi", () => {
  covers("OP15-010", "[Activate: Main]");

  it("gives one of its controller's rested DON!! to their Character, once per turn", () => {
    const game = table("op15-010-give")
      .withBoard("p1", [
        character("nezumi", "OP15-010"),
        character("sterry", "OP05-083"),
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "nezumi" });
    game.play({ type: "resolve-effect", optionId: "sterry" });

    expect(game.state.players.p1.board[1]?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(currentPower(game.state, "p1", "sterry", true)).toBe(5000);
    // [Once Per Turn]: a rested DON!! is still there, but no second gift.
    expect(activations(game, "nezumi")).toHaveLength(0);
  });

  it("is withheld while neither cost area holds a rested DON!!", () => {
    const game = table("op15-010-none")
      .withBoard("p1", [character("nezumi", "OP15-010")])
      .build();

    expect(activations(game, "nezumi")).toHaveLength(0);
  });
});

describe("OP15-060 Enel", () => {
  covers("OP15-060", "static", "[Activate: Main]");

  it("gains +2000 power at 6 or less DON!! on the field, and not at 7", () => {
    const under = table("op15-060-power-under")
      .withBoard("p1", [character("enel", "OP15-060")])
      .withDonDeck("p1", 4)
      .build();
    expect(fieldDonCount(under.state, "p1")).toBe(6);
    expect(currentPower(under.state, "p1", "enel", false)).toBe(10_000);

    const over = table("op15-060-power-over")
      .withBoard("p1", [character("enel", "OP15-060")])
      .withDonDeck("p1", 3)
      .build();
    expect(fieldDonCount(over.state, "p1")).toBe(7);
    expect(currentPower(over.state, "p1", "enel", false)).toBe(8_000);
  });

  it("cannot be returned to hand by the opponent's effect under the ceiling", () => {
    // OP09-058 Special Muggy Ball returns a cost-6-or-less Character.
    const game = table("op15-060-immune", "p2")
      .withBoard("p1", [character("enel", "OP15-060")])
      .withDonDeck("p1", 4)
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-058" });
    expect(effectOptions(game, "p2")).not.toContain("enel");
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(ids(game.state.players.p1.board)).toEqual(["enel"]);
  });

  it("is returned like any Character above the ceiling", () => {
    const game = table("op15-060-not-immune", "p2")
      .withBoard("p1", [character("enel", "OP15-060")])
      .withDonDeck("p1", 3)
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-058" });
    game.play({ type: "resolve-effect", optionId: "enel" });

    expect(ids(game.state.players.p1.board)).toEqual([]);
    expect(ids(game.state.players.p1.hand)).toEqual(["enel"]);
  });

  it("buys [Blocker] through the opponent's next turn for DON!! −1, then trashes a card", () => {
    const game = table("op15-060-blocker")
      .withBoard("p1", [character("enel", "OP15-060")])
      .withHand("p1", [
        instance("pitch", "OP07-099"),
        instance("keep", "OP05-083"),
      ])
      .withBoard("p2", [character("attacker", "OP06-005")])
      // Decks to draw from, so both seats survive the turn changes.
      .withDeckTop("p1", copies(3, "OP07-099", "p1-deck"))
      .withDeckTop("p2", copies(3, "OP07-099", "p2-deck"))
      .build();

    expect(hasKeyword(game.state, "p1", "enel", "Blocker")).toBe(false);
    game.play({ type: "activate-main", sourceInstanceId: "enel" });
    placeReturnedDon(game);
    expect(fieldDonCount(game.state, "p1")).toBe(9);
    game.play({ type: "resolve-effect", optionId: "pitch" });

    expect(ids(game.state.players.p1.hand)).toEqual(["keep"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["pitch"]);
    expect(hasKeyword(game.state, "p1", "enel", "Blocker")).toBe(true);

    // Still a Blocker on the opponent's turn, where it is used.
    game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "enel" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("enel");
    declineDefence(game);

    // Gone once that turn has ended.
    while (game.state.turnPlayerId === "p2") game.pass();
    expect(hasKeyword(game.state, "p1", "enel", "Blocker")).toBe(false);
  });

  it("still grants [Blocker] from an empty hand, with nothing to trash", () => {
    const game = table("op15-060-empty-hand")
      .withBoard("p1", [character("enel", "OP15-060")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "enel" });
    placeReturnedDon(game);

    expect(game.state.pendingEffect).toBeNull();
    expect(fieldDonCount(game.state, "p1")).toBe(9);
    expect(hasKeyword(game.state, "p1", "enel", "Blocker")).toBe(true);
  });
});

describe("OP15-063 Gedatsu", () => {
  covers("OP15-063", "[On Play]", "[On K.O.]");

  it("[On Play] pays DON!! −1 to draw a card", () => {
    const game = table("op15-063-on-play")
      .withHand("p1", [instance("gedatsu", "OP15-063")])
      .withDeckTop("p1", [instance("drawn", "OP07-099")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-063" });
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });
    placeReturnedDon(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    // One DON!! paid for the card, one returned for the draw.
    expect(fieldDonCount(game.state, "p1")).toBe(9);
  });

  it("[On Play] may be declined, keeping the DON!! and drawing nothing", () => {
    const game = table("op15-063-on-play-decline")
      .withHand("p1", [instance("gedatsu", "OP15-063")])
      .withDeckTop("p1", [instance("drawn", "OP07-099")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-063" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.hand).toEqual([]);
    expect(fieldDonCount(game.state, "p1")).toBe(10);
  });

  /** p2 K.O.s Gedatsu with OP06-019 (5000 power or less) on p2's turn. */
  const koGedatsu = (seed: string, p1FieldDon: number) => {
    const game = table(seed, "p2")
      .withBoard("p1", [character("gedatsu", "OP15-063")])
      .withDonDeck("p1", 10 - p1FieldDon)
      .withBoard("p2", [
        character("small", "OP07-099"),
        character("big", "OP05-083"),
      ])
      .withHand("p2", [instance("seal", "OP06-019")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP06-019" });
    game.play({ type: "resolve-effect", optionId: "gedatsu" });
    return game;
  };

  it("[On K.O.] K.O.s a 2000-power Character at 6 or less DON!!", () => {
    const game = koGedatsu("op15-063-on-ko", 6);

    expect(game.player).toBe("p1");
    const options = effectOptions(game);
    expect(options).toContain("small");
    // 4000 power is out of range.
    expect(options).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(ids(game.state.players.p2.board)).toEqual(["big"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["gedatsu"]);
  });

  it("[On K.O.] does nothing at 7 DON!! on the field", () => {
    const game = koGedatsu("op15-063-on-ko-over", 7);

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p2.board)).toEqual(["small", "big"]);
  });
});

describe("OP15-083 Spoil", () => {
  covers("OP15-083", "[On Play]", "[Activate: Main]");

  it("[On Play] trashes the top 3 cards of its deck", () => {
    const game = table("op15-083-on-play")
      .withHand("p1", [instance("spoil", "OP15-083")])
      .withDeckTop("p1", [
        instance("a", "OP07-099"),
        instance("b", "OP07-099"),
        instance("c", "OP07-099"),
        instance("d", "OP07-099"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-083" });

    expect(ids(game.state.players.p1.trash).sort()).toEqual(["a", "b", "c"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["d"]);
  });

  it("[Activate: Main] trashes itself and, at 15 in the trash, gives a rested DON!!", () => {
    // 14 in the trash plus Spoil itself is 15.
    const game = table("op15-083-activate")
      .withBoard("p1", [
        character("spoil", "OP15-083"),
        character("sterry", "OP05-083"),
      ])
      .withTrash("p1", copies(14, "OP07-099"))
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "spoil" });
    while (game.state.pendingEffect) {
      const options = effectOptions(game);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("sterry")
          ? "sterry"
          : options.find((id) => id !== "skip")!,
      });
    }

    expect(ids(game.state.players.p1.board)).toEqual(["sterry"]);
    expect(game.state.players.p1.trash).toHaveLength(15);
    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
  });

  it("[Activate: Main] still trashes itself below 15, but gives nothing", () => {
    const game = table("op15-083-activate-short")
      .withBoard("p1", [
        character("spoil", "OP15-083"),
        character("sterry", "OP05-083"),
      ])
      .withTrash("p1", copies(13, "OP07-099"))
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "spoil" });
    while (game.state.pendingEffect) {
      game.play({
        type: "resolve-effect",
        optionId: effectOptions(game).find((id) => id !== "skip")!,
      });
    }

    expect(ids(game.state.players.p1.board)).toEqual(["sterry"]);
    expect(game.state.players.p1.trash).toHaveLength(14);
    expect(game.state.players.p1.board[0]?.attachedDon).toEqual([]);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe("OP15-105 Jewelry Bonney", () => {
  covers("OP15-105", "static");

  /** p2 casts OP09-058 (return a cost-6-or-less Character) at `target`. */
  const bounce = (seed: string, target: string) => {
    const game = table(seed, "p2")
      .withBoard("p1", [
        character("bonney", "OP15-105"),
        character("sterry", "OP05-083"),
        character("gasparde", "OP06-005"),
      ])
      .withLife("p1", [
        instance("life-top", "OP07-099"),
        instance("life-2", "OP07-099"),
      ])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP09-058" });
    game.play({ type: "resolve-effect", optionId: target });
    return game;
  };

  it("keeps a 7000-or-less Character on the field for the top Life card", () => {
    const game = bounce("op15-105-save", "sterry");

    expect(game.player).toBe("p1");
    expect(effectOptions(game)).toContain("replace:bonney");
    game.play({ type: "resolve-effect", optionId: "replace:bonney" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(ids(game.state.players.p1.board)).toContain("sterry");
    expect(ids(game.state.players.p1.hand)).toEqual(["life-top"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-2"]);
  });

  it("protects Bonney herself", () => {
    const game = bounce("op15-105-self", "bonney");

    game.play({ type: "resolve-effect", optionId: "replace:bonney" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(ids(game.state.players.p1.board)).toContain("bonney");
    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("may be declined, and the Character leaves", () => {
    const game = bounce("op15-105-decline", "sterry");

    const decline = effectOptions(game).find(
      (id) => !id.startsWith("replace:"),
    );
    game.play({ type: "resolve-effect", optionId: decline! });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(ids(game.state.players.p1.board)).not.toContain("sterry");
    expect(ids(game.state.players.p1.hand)).toEqual(["sterry"]);
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("does not cover a Character above 7000 base power", () => {
    const game = bounce("op15-105-big", "gasparde");

    expect(
      effectOptions(game, "p1").filter((id) => id.startsWith("replace:")),
    ).toEqual([]);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    expect(ids(game.state.players.p1.hand)).toEqual(["gasparde"]);
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("OP15-111 Mont Blanc Noland", () => {
  covers("OP15-111", "[When Attacking]");

  /** Noland and a Kalgara played this turn, Noland given `given` DON!!. */
  const noland = (seed: string, given: number) => {
    let builder = table(seed)
      .withBoard("p1", [
        character("noland", "OP15-111"),
        character("kalgara", "OP08-099", { playedTurn: 11 }),
      ])
      .withBoard("p2", [character("target", "OP07-099", { rested: true })])
      // Life to take, so the first hit does not end the game.
      .withLife("p2", copies(2, "OP08-099", "p2-life"));
    if (given > 0) builder = builder.withGivenDon("p1", "noland", given);
    return builder.build();
  };

  const kalgaraCanAttack = (game: Game) =>
    game
      .legalActions()
      .some(
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "kalgara",
      );

  it("[DON!! x1] gives a Kalgara played this turn [Rush]", () => {
    const game = noland("op15-111-rush", 1);
    expect(game.state.turn).toBe(11);
    expect(kalgaraCanAttack(game)).toBe(false);

    game.play({
      type: "attack",
      attackerInstanceId: "noland",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "kalgara" });
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(hasKeyword(game.state, "p1", "kalgara", "Rush")).toBe(true);
    expect(kalgaraCanAttack(game)).toBe(true);
  });

  it("does nothing without a DON!! given", () => {
    const game = noland("op15-111-no-don", 0);

    game.play({
      type: "attack",
      attackerInstanceId: "noland",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game, "p1")).not.toContain("kalgara");
    declineDefence(game);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(hasKeyword(game.state, "p1", "kalgara", "Rush")).toBe(false);
    expect(kalgaraCanAttack(game)).toBe(false);
  });
});
