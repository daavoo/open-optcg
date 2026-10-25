import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP12 "Legacy of the Master", imported whole.
 *
 * Twenty-four of the set's identities predate the import (the
 * `OP12-ROSINANTE-AYASHIZO` list, covered by `test/op12-rosinante.test.ts`) and
 * twelve more are on the imperative path with their own tests. What is here is
 * the rest of the series, driven through public actions.
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

describe("OP12 metadata import", () => {
  it("registers all 119 OP12 identities with their printed rarity", () => {
    const op12 = [...cardRegistry.values()].filter((card) =>
      card.cardNumber.startsWith("OP12-"),
    );
    expect(op12).toHaveLength(119);
    expect(op12.every((card) => card.rarity)).toBe(true);
  });
});

describe("OP12's reveal-two-Events cost", () => {
  covers("OP12-004", "[Activate: Main]");
  covers("OP12-003", "[On K.O.]");

  it("spends nothing but shows two Events, and buys +2000", () => {
    const game = table("op12-004")
      .withBoard("p1", [character("oden", "OP12-004")])
      .withHand("p1", [
        instance("event-1", "OP12-019"),
        instance("event-2", "OP12-016"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP12-004" });
    game.play({ type: "resolve-effect", optionId: "event-1" });
    game.play({ type: "resolve-effect", optionId: "event-2" });
    resolveAll(game);

    expect(currentPower(game.state, "p1", "oden")).toBe(5_000);
    // A reveal spends nothing: both Events are still in hand.
    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("is not offered with only one Event in hand", () => {
    const game = table("op12-004-cost")
      .withBoard("p1", [character("oden", "OP12-004")])
      .withHand("p1", [instance("event-1", "OP12-019")])
      .build();

    // `requires.handCardsMatching` is what keeps a once-per-turn use from being
    // spent on a cost that cannot be paid.
    expect(
      game
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("Kouzuki Oden"),
        ),
    ).toEqual([]);
  });
});

describe("OP12-016 To Never Doubt--That Is Power!", () => {
  covers("OP12-016", "[Main]", "[Counter]");

  it("gives two active DON!! to a Rayleigh and makes it unblockable", () => {
    const game = table("op12-016")
      .withLeader("p1", "OP12-001")
      .withHand("p1", [instance("never-doubt", "OP12-016")])
      .withBoard("p1", [character("rayleigh", "ST32-004")]) // Silvers Rayleigh
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ summary: "To Never Doubt" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    resolveAll(game);

    // The DON!! is *given*, not spent: it leaves the cost area for the card and
    // stays on the field as power.
    const rayleigh = game.state.players.p1.board.find(
      (card) => card.instanceId === "rayleigh",
    );
    expect(rayleigh?.attachedDon).toHaveLength(2);
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 2);
    expect(hasKeyword(game.state, "p1", "rayleigh", "Unblockable")).toBe(true);
  });

  it("buffs a Character in a battle behind any Leader", () => {
    const game = defending("op12-016-counter")
      .withHand("p1", [instance("never-doubt", "OP12-016")])
      .withBoard("p1", [character("body", "ST31-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack({ ...ATTACK, targetInstanceId: "body" }, "counter")
      .build();

    expect(game.action({ type: "activate-counter-event" }).summary).toContain(
      "+2000",
    );
  });

  it("is not offered behind a Leader that is not Rayleigh", () => {
    const game = defending("op12-016-leader")
      .withHand("p1", [instance("never-doubt", "OP12-016")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    // "[printed text omitted -- pnpm card:text ST32-004]": the Leader qualifies
    // only by name, and this one is Monkey.D.Luffy, so the hand cannot spend
    // it for any benefit.
    expect(
      game
        .legalActions()
        .find((action) => action.type === "activate-counter-event"),
    ).toBeUndefined();
  });
});

describe("OP12-030 Dracule Mihawk", () => {
  covers("OP12-030", "[On Play]");

  it("refunds four DON!! and bars only the expensive plays", () => {
    const game = table("op12-030")
      .withHand("p1", [
        instance("mihawk", "OP12-030"),
        instance("cheap", "ST31-003"), // cost 2
        instance("dear", "ST31-004"), // cost 7
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-030" });
    resolveAll(game);

    expect(game.state.players.p1.cannotPlayCharactersMinCost).toBe(7);
    const plays = game
      .legalActions()
      .filter((action) => action.type === "play-card")
      .map((action) => action.summary)
      .join(" ");
    expect(plays).toContain("Brook");
    expect(plays).not.toContain("Monkey.D.Luffy [ST31-004]");
  });
});

describe("OP12-075 Ms. All Sunday", () => {
  covers("OP12-075", "[On Play]", "[Trigger]");

  it("K.O.s a body and hands the compensation to the opponent to decline", () => {
    const game = table("op12-075")
      .withHand("p1", [instance("sunday", "OP12-075")])
      .withBoard("p2", [character("victim", "ST32-005")])
      .withDonDeck("p2", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-075" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    // The decision is the *opponent's*: they may take a DON!! or decline it.
    expect(game.state.pendingEffect?.playerId).toBe("p2");
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "skip" });
    resolveAll(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    // Declined, so the DON!! deck is untouched.
    expect(game.state.players.p2.donDeck).toHaveLength(2);
  });
});

describe("OP12-080 Baratie", () => {
  covers("OP12-080", "[Activate: Main]", "[Trigger]");

  it("plays itself back as a Stage off a Trigger", () => {
    const game = defending("op12-080")
      .withLife("p1", [instance("baratie", "OP12-080")])
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    // The Trigger window opens on the damaged Life card.
    game.play({ type: "resolve-trigger" });
    resolveAll(game);

    // A Stage goes to the Stage area, not the board.
    expect(game.state.players.p1.stage?.instanceId).toBe("baratie");
    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP12-096 Ursa Shock", () => {
  covers("OP12-096", "[Main]", "[Trigger]");

  it("reaches a 6-cost body only behind a Character of cost 8 or more", () => {
    const wide = table("op12-096")
      .withHand("p1", [instance("ursa", "OP12-096")])
      .withBoard("p1", [character("giant", "OP12-030")]) // cost 8
      .withBoard("p2", [character("victim", "OP12-069")]) // cost 6
      .build();

    wide.play({ summary: "Ursa Shock" });
    expect(effectOptions(wide.state)).toContain("victim");

    const narrow = table("op12-096-narrow")
      .withHand("p1", [instance("ursa", "OP12-096")])
      .withBoard("p2", [character("victim", "OP12-069")])
      .build();

    // Nothing within the 4-cost ceiling, so the Event is not offered at all: an
    // Event whose whole program would resolve to nothing is not put on the table.
    expect(
      narrow
        .legalActions()
        .filter((action) => action.summary.includes("Ursa Shock")),
    ).toEqual([]);
  });
});

describe("OP12-102 Shirahoshi", () => {
  covers("OP12-102", "[Opponent's Turn]", "static");

  it("turns a Life card face-up to keep another of your Characters on the field", () => {
    // The replacement watches every Character of base cost 6 or less its
    // controller has, not only Shirahoshi: here p2's OP12-075 Ms. All Sunday
    // K.O.s the cost-2 ST31-003 Brook beside it.
    const game = scenario()
      .decks(
        "(Black/Yellow) Koala - Official Feature Deck",
        "(Purple) Charlotte Katakuri - Starter Deck 34",
      )
      .seed("op12-102-static")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [
        character("shirahoshi", "OP12-102"),
        character("brook", "ST31-003"),
      ])
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "ST31-003"),
      ])
      .withHand("p2", [instance("sunday", "OP12-075")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-075" });
    game.play({ type: "resolve-effect", optionId: "brook" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", summary: "Turn 1 card" });
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 40) throw new Error("pending effect never settled");
      const skip = game
        .legalActions()
        .find(
          (action) =>
            action.type === "resolve-effect" && action.optionId === "skip",
        );
      game.play(
        skip
          ? { type: "resolve-effect", optionId: "skip" }
          : { type: "resolve-effect" },
      );
    }

    expect(
      game.state.players.p1.board.map((card) => card.instanceId).sort(),
    ).toEqual(["brook", "shirahoshi"]);
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
  });

  it("buffs its {Neptunian} teammates until a second copy of itself lands", () => {
    const alone = defending("op12-102")
      .withBoard("p1", [
        character("shirahoshi", "OP12-102"),
        character("neptunian", "OP11-107"), // {Neptunian}
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "block")
      .build();
    expect(currentPower(alone.state, "p1", "neptunian")).toBe(8_000);

    const doubled = defending("op12-102-doubled")
      .withBoard("p1", [
        character("shirahoshi", "OP12-102"),
        character("shirahoshi-2", "OP12-102"),
        character("neptunian", "OP11-107"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "block")
      .build();
    // "[printed text omitted -- pnpm card:text ST32-004]": each copy sees
    // the other, so neither aura is live.
    expect(currentPower(doubled.state, "p1", "neptunian")).toBe(6_000);
  });
});

describe("OP12-099 Kalgara", () => {
  covers("OP12-099", "[Your Turn]");

  it("draws when a Life card moves, and then locks its own draws", () => {
    const game = table("op12-099")
      .withBoard("p1", [character("kalgara", "OP12-099")])
      .withHand("p1", [
        instance("fodder", "ST31-003"),
        instance("sabo", "OP12-100"),
        instance("lindbergh", "OP12-095"),
      ])
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "ST31-003"),
      ])
      .withDeckTop("p1", [
        instance("draw-1", "ST31-002"),
        instance("draw-2", "ST31-002"),
        instance("draw-3", "ST31-002"),
        instance("draw-4", "ST31-002"),
      ])
      .build();

    // OP12-100 Sabo's own [On Play] takes a Life card into hand, which is the
    // move Kalgara watches. The reaction resolves after the clause that raised
    // it -- signals are dispatched as continuations -- so Sabo's own draw is
    // unaffected and the lock lands after it.
    game.play({ type: "play-card", cardNumber: "OP12-100" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    resolveAll(game);

    expect(game.state.players.p1.cannotDrawByEffectUntilTurn).toBe(
      game.state.turn,
    );

    // The next effect that would draw gets nothing: OP12-095 Lindbergh's "[printed text omitted -- pnpm card:text OP12-095]" still trashes, and draws nothing.
    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "OP12-095" });
    resolveAll(game);

    // One card left the hand to be played and one more was trashed, with nothing
    // drawn to replace it.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 2);
  });
});

describe("OP12-081 Koala", () => {
  covers("OP12-081", "static");

  it("taxes the opponent's 8-cost play a Life card", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op12-081")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withLeader("p1", "OP12-081")
      .withHand("p2", [instance("giant", "OP12-030")]) // cost 8
      .withLife("p2", [instance("their-life", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-030" });
    resolveAll(game);

    // Their own Life card joins their hand: a card gained and a Life lost.
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "their-life",
    );
    expect(game.state.players.p2.life).toHaveLength(0);
  });

  it("draws when it swings at a Leader behind two 8-cost bodies", () => {
    const game = table("op12-081-attack")
      .withLeader("p1", "OP12-081")
      .withBoard("p1", [
        character("giant-1", "OP12-030"),
        character("giant-2", "OP12-030"),
      ])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .build();

    game.play({ summary: "Attack Roronoa Zoro" });
    resolveAll(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
  });
});

describe("OP12's Leader-gated cost layers", () => {
  covers("OP12-089", "static", "[On K.O.]");
  covers("OP12-100", "static", "[On Play]");

  it("raises Hack out of cost-based removal behind its own Leader", () => {
    const behind = table("op12-089")
      .withLeader("p1", "OP12-081") // {Revolutionary Army}
      .withBoard("p1", [character("hack", "OP12-089")])
      .build();
    const hack = behind.state.players.p1.board[0]!;
    expect(effectiveCost(behind.state, "p1", hack)).toBe(8);
    expect(hasKeyword(behind.state, "p1", "hack", "Blocker")).toBe(true);

    const other = table("op12-089-other")
      .withBoard("p1", [character("hack", "OP12-089")])
      .build();
    expect(
      effectiveCost(other.state, "p1", other.state.players.p1.board[0]!),
    ).toBe(4);
    expect(hasKeyword(other.state, "p1", "hack", "Blocker")).toBe(false);
  });

  it("switches Sabo on at 3 or less Life", () => {
    const low = table("op12-100")
      .withBoard("p1", [character("sabo", "OP12-100")])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .build();
    expect(hasKeyword(low.state, "p1", "sabo", "Blocker")).toBe(true);

    const high = table("op12-100-high")
      .withBoard("p1", [character("sabo", "OP12-100")])
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "ST31-003"),
        instance("life-3", "ST31-003"),
        instance("life-4", "ST31-003"),
      ])
      .build();
    expect(hasKeyword(high.state, "p1", "sabo", "Blocker")).toBe(false);
  });
});
