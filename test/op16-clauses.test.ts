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
 * OP16 printed clauses no other file claims, one `describe` per card.
 *
 * Built on the format's ST31/ST32 decks on a bare table, with the OP16 card
 * placed where the clause needs it and the Leader swapped in when a clause
 * reads its type. Printed text for any card here is `pnpm card:text <card>`.
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

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

/** Declines the Block and Counter steps so a declared battle resolves. */
const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

/** A vanilla 8000-power attacker for p2 to swing with on its own turn. */
const ATTACKER = "OP06-005";

/**
 * p2's vanilla Character attacks p1's Leader, and p1 blocks with `blocker`.
 * Covers a printed [Blocker] through the Block step itself.
 */
function blocksAnAttack(seed: string, cardNumber: string): void {
  const game = table(seed, "p2")
    .withBoard("p1", [character("blocker", cardNumber)])
    .withBoard("p2", [character("attacker", ATTACKER)])
    .build();

  expect(hasKeyword(game.state, "p1", "blocker", "Blocker")).toBe(true);
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  game.play({ type: "block", blockerInstanceId: "blocker" });

  expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
  expect(boardCard(game, "p1", "blocker")?.rested).toBe(true);
}

describe("OP16-012 Benn.Beckman", () => {
  covers("OP16-012", "[Blocker]", "[On Play]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op16-012-blocker", "OP16-012");
  });

  /** Beckman in hand with OP12-008 Shanks behind it, all ten DON!! out. */
  const beckman = (seed: string, leader?: string) => {
    let builder = table(seed).withHand("p1", [
      instance("beckman", "OP16-012"),
      instance("shanks", "OP12-008"),
    ]);
    if (leader) builder = builder.withLeader("p1", leader);
    return builder;
  };

  it("[On Play] rests a DON!! to play a Shanks free under a Red-Haired Leader at 10 DON!!", () => {
    const game = beckman("op16-012-on-play", "OP09-001").build();

    game.play({ type: "play-card", cardNumber: "OP16-012" });
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });
    game.play({ type: "resolve-effect", optionId: "shanks" });

    expect(ids(game.state.players.p1.board)).toEqual(["beckman", "shanks"]);
    // Five for Beckman, one rested by the cost, none for Shanks.
    expect(game.state.players.p1.restedDon).toHaveLength(6);
    expect(game.state.players.p1.activeDon).toHaveLength(4);
  });

  it("[On Play] rests the DON!! but plays nothing under a Leader without the type", () => {
    const game = beckman("op16-012-wrong-leader").build();

    game.play({ type: "play-card", cardNumber: "OP16-012" });
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(ids(game.state.players.p1.board)).toEqual(["beckman"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["shanks"]);
    expect(game.state.players.p1.restedDon).toHaveLength(6);
  });

  it("[On Play] plays nothing below 10 DON!! on the field", () => {
    const game = beckman("op16-012-nine-don", "OP09-001")
      .withDonDeck("p1", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-012" });
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(ids(game.state.players.p1.hand)).toEqual(["shanks"]);
    expect(fieldDonCount(game.state, "p1")).toBe(9);
  });

  it("[On Play] may be declined, resting nothing", () => {
    const game = beckman("op16-012-decline", "OP09-001").build();

    game.play({ type: "play-card", cardNumber: "OP16-012" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p1.hand)).toEqual(["shanks"]);
    expect(game.state.players.p1.restedDon).toHaveLength(5);
  });
});

describe("OP16-035 Roronoa Zoro", () => {
  covers("OP16-035", "[On Play]");

  it("rests an opposing card, then trashes a card to give 3 rested DON!! to the Leader", () => {
    const game = table("op16-035-on-play")
      .withHand("p1", [
        instance("zoro", "OP16-035"),
        instance("pitch", "OP07-099"),
      ])
      .withBoard("p2", [character("target", "OP05-083")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-035" });
    game.play({ type: "resolve-effect", optionId: "target" });
    expect(boardCard(game, "p2", "target")?.rested).toBe(true);

    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });
    while (game.state.pendingEffect) {
      const options = effectOptions(game);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("pitch") ? "pitch" : options[0]!,
      });
    }

    expect(ids(game.state.players.p1.trash)).toEqual(["pitch"]);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(3);
    // Seven rested to play Zoro, three of them now under the Leader.
    expect(game.state.players.p1.restedDon).toHaveLength(4);
    expect(currentPower(game.state, "p1", "p1-leader", true)).toBe(8000);
  });

  it("the trash is optional: declining it keeps the hand and gives nothing", () => {
    const game = table("op16-035-decline")
      .withHand("p1", [
        instance("zoro", "OP16-035"),
        instance("keep", "OP07-099"),
      ])
      .withBoard("p2", [character("target", "OP05-083")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-035" });
    game.play({ type: "resolve-effect", optionId: "target" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p1.hand)).toEqual(["keep"]);
    expect(game.state.players.p1.leaderAttachedDon).toEqual([]);
    expect(game.state.players.p1.restedDon).toHaveLength(7);
  });
});

describe("OP16-044 Emporio.Ivankov", () => {
  covers("OP16-044", "[Blocker]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op16-044-blocker", "OP16-044");
  });
});

describe("OP16-050 Miss Olive", () => {
  covers("OP16-050", "[Blocker]", "[On Play]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op16-050-blocker", "OP16-050");
  });

  it("[On Play] returns a cost-2-or-more Character to draw 2 and trash 1", () => {
    const game = table("op16-050-on-play")
      .withHand("p1", [instance("olive", "OP16-050")])
      .withBoard("p1", [
        character("cheap", "OP07-099"),
        character("sterry", "OP05-083"),
      ])
      .withDeckTop("p1", [
        instance("draw-1", "OP08-099"),
        instance("draw-2", "OP06-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-050" });
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });
    // A cost-1 Character does not pay.
    expect(effectOptions(game)).not.toContain("cheap");
    game.play({ type: "resolve-effect", optionId: "sterry" });
    game.play({ type: "resolve-effect", optionId: "draw-1" });

    expect(ids(game.state.players.p1.board)).toEqual(["cheap", "olive"]);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "draw-2",
      "sterry",
    ]);
    expect(ids(game.state.players.p1.trash)).toEqual(["draw-1"]);
  });

  it("[On Play] may be declined, drawing nothing", () => {
    const game = table("op16-050-decline")
      .withHand("p1", [instance("olive", "OP16-050")])
      .withBoard("p1", [character("sterry", "OP05-083")])
      .withDeckTop("p1", copies(2, "OP08-099"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-050" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p1.board)).toEqual(["sterry", "olive"]);
    expect(game.state.players.p1.hand).toEqual([]);
  });
});

describe("OP16-052 Monkey.D.Luffy", () => {
  covers("OP16-052", "[Activate: Main]");

  it("gives one rested DON!! to a Character, once per turn", () => {
    const game = table("op16-052-give")
      .withBoard("p1", [
        character("luffy", "OP16-052"),
        character("sterry", "OP05-083"),
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "luffy" });
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["p1-leader", "luffy", "sterry"]),
    );
    game.play({ type: "resolve-effect", optionId: "sterry" });

    expect(boardCard(game, "p1", "sterry")?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(activations(game, "luffy")).toHaveLength(0);
  });

  it("gives to the Leader too", () => {
    const game = table("op16-052-leader")
      .withBoard("p1", [character("luffy", "OP16-052")])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "luffy" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toEqual([]);
  });
});

describe("OP16-081 Otama", () => {
  covers("OP16-081", "[Activate: Main]");

  it("rests itself to give −2000 while a cost-8 Character is in play", () => {
    const game = table("op16-081-debuff")
      .withBoard("p1", [
        character("otama", "OP16-081"),
        character("giant", "OP05-044"),
      ])
      .withBoard("p2", [character("target", "OP05-083")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "otama" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(boardCard(game, "p1", "otama")?.rested).toBe(true);
    expect(currentPower(game.state, "p2", "target", false)).toBe(2000);
    // Resting is the cost, so a rested Otama is not offered again.
    expect(activations(game, "otama")).toHaveLength(0);
  });

  it("still rests, but debuffs nothing, without a cost-8 Character", () => {
    const game = table("op16-081-no-big")
      .withBoard("p1", [character("otama", "OP16-081")])
      .withBoard("p2", [character("target", "OP05-083")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "otama" });

    expect(game.state.pendingEffect).toBeNull();

    expect(boardCard(game, "p1", "otama")?.rested).toBe(true);
    expect(currentPower(game.state, "p2", "target", false)).toBe(4000);
  });
});

describe("OP16-090 Tony Tony.Chopper", () => {
  covers("OP16-090", "[On Play]");

  it("draws 2, trashes 2, then K.O.s a cost-1-or-less Character", () => {
    const game = table("op16-090-on-play")
      .withHand("p1", [
        instance("chopper", "OP16-090"),
        instance("held", "OP05-083"),
      ])
      .withDeckTop("p1", [
        instance("draw-1", "OP08-099"),
        instance("draw-2", "OP06-005"),
      ])
      .withBoard("p2", [
        character("small", "OP07-099"),
        character("sterry", "OP05-083"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-090" });
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "draw-1",
      "draw-2",
      "held",
    ]);
    game.play({ type: "resolve-effect", optionId: "draw-1" });
    game.play({ type: "resolve-effect", optionId: "held" });
    while (game.player === "p1" && !effectOptions(game).includes("small")) {
      game.play({ type: "resolve-effect" });
    }
    // Cost 2 is out of range.
    expect(effectOptions(game)).not.toContain("sterry");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(ids(game.state.players.p1.hand)).toEqual(["draw-2"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["draw-1", "held"]);
    expect(ids(game.state.players.p2.board)).toEqual(["sterry"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
  });
});

describe("OP16-102 Avalo Pizarro", () => {
  covers("OP16-102", "[On K.O.]", "[Trigger]");

  it("[On K.O.] draws a card, then plays Fullalead from the trash", () => {
    // p2 K.O.s Pizarro with OP06-019 (5000 power or less) on its own turn.
    const game = table("op16-102-on-ko", "p2")
      .withBoard("p1", [character("pizarro", "OP16-102")])
      .withTrash("p1", [instance("fullalead", "OP09-099")])
      .withDeckTop("p1", [instance("drawn", "OP08-099")])
      .withHand("p2", [instance("seal", "OP06-019")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP06-019" });
    game.play({ type: "resolve-effect", optionId: "pizarro" });

    expect(game.player).toBe("p1");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    game.play({ type: "resolve-effect", optionId: "fullalead" });

    expect(game.state.players.p1.stage?.instanceId).toBe("fullalead");
    expect(ids(game.state.players.p1.trash)).toEqual(["pizarro"]);
  });

  it("[Trigger] runs the same draw and plays Fullalead from hand", () => {
    const game = table("op16-102-trigger", "p2")
      .withLife("p1", [
        instance("pizarro", "OP16-102"),
        instance("life-2", "OP08-099"),
      ])
      .withHand("p1", [instance("fullalead", "OP09-099")])
      .withDeckTop("p1", [instance("drawn", "OP08-099")])
      .withBoard("p2", [character("attacker", ATTACKER)])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "drawn",
      "fullalead",
    ]);
    game.play({ type: "resolve-effect", optionId: "fullalead" });

    expect(game.state.players.p1.stage?.instanceId).toBe("fullalead");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });
});

/** p2 hits p1's Leader once, with `life` as p1's Life cards (top first). */
function hitLeader(seed: string, life: string[], leader?: string): Game {
  let builder = table(seed, "p2")
    .withLife(
      "p1",
      life.map((cardNumber, index) => instance(`life-${index}`, cardNumber)),
    )
    .withBoard("p2", [character("attacker", ATTACKER)]);
  if (leader) builder = builder.withLeader("p1", leader);
  const game = builder.build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  declineDefence(game);
  return game;
}

describe("OP16-111 Boa Sandersonia", () => {
  covers("OP16-111", "[Blocker]", "[Trigger]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op16-111-blocker", "OP16-111");
  });

  it("[Trigger] plays itself when 2 or less Life remain", () => {
    const game = hitLeader("op16-111-trigger", [
      "OP16-111",
      "OP08-099",
      "OP08-099",
    ]);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    while (game.state.pendingEffect && game.player === "p1") {
      game.play({ type: "resolve-effect" });
    }

    expect(ids(game.state.players.p1.board)).toEqual(["life-0"]);
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("[Trigger] plays nothing with 3 Life left", () => {
    const game = hitLeader("op16-111-trigger-high", [
      "OP16-111",
      "OP08-099",
      "OP08-099",
      "OP08-099",
    ]);
    // The condition fails, so the Trigger is not offered as a way to play it.
    expect(game.summaries()).not.toContain("Activate Trigger");
    game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
    expect(ids(game.state.players.p1.hand)).toEqual(["life-0"]);

    expect(game.state.players.p1.board).toEqual([]);
    expect(game.state.players.p1.life).toHaveLength(3);
  });
});

describe("OP16-113 Boa Marigold", () => {
  covers("OP16-113", "static", "[Trigger]");

  it("has [Blocker] at 2 or less Life, and not at 3", () => {
    const low = table("op16-113-low", "p2")
      .withBoard("p1", [character("marigold", "OP16-113")])
      .withLife("p1", 2)
      .withBoard("p2", [character("attacker", ATTACKER)])
      .withDeckTop("p1", copies(5, "OP08-099"))
      .build();
    expect(hasKeyword(low.state, "p1", "marigold", "Blocker")).toBe(true);
    low.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    low.play({ type: "block", blockerInstanceId: "marigold" });
    expect(low.state.activeAttack?.targetInstanceId).toBe("marigold");

    const high = table("op16-113-high", "p2")
      .withBoard("p1", [character("marigold", "OP16-113")])
      .withDeckTop("p1", copies(5, "OP08-099"))
      .withLife("p1", 3)
      .withBoard("p2", [character("attacker", ATTACKER)])
      .build();
    expect(hasKeyword(high.state, "p1", "marigold", "Blocker")).toBe(false);
    high.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(
      high
        .legalActions()
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "marigold",
        ),
    ).toBe(false);
  });

  it("[Trigger] plays itself under a Kuja Pirates Leader", () => {
    const game = hitLeader(
      "op16-113-trigger",
      ["OP16-113", "OP08-099", "OP08-099", "OP08-099"],
      "OP14-041",
    );
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    while (game.state.pendingEffect && game.player === "p1") {
      game.play({ type: "resolve-effect" });
    }

    expect(ids(game.state.players.p1.board)).toEqual(["life-0"]);
  });

  it("[Trigger] plays nothing under a Leader without the type", () => {
    const game = hitLeader("op16-113-trigger-off", [
      "OP16-113",
      "OP08-099",
      "OP08-099",
    ]);
    // The condition fails, so the Trigger is not offered as a way to play it.
    expect(game.summaries()).not.toContain("Activate Trigger");
    game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
    expect(ids(game.state.players.p1.hand)).toEqual(["life-0"]);

    expect(game.state.players.p1.board).toEqual([]);
  });
});
