import { describe, expect, it } from "vitest";
import { currentPower } from "@one-piece-sim/engine-core";
import { character, instance, scenario, type Game } from "./support/index.js";

/**
 * Bandai's card Q&A for EB-05's Red and Green cards (EB05-001 to EB05-020, and
 * EB05-061), one case per ruling, named by the Q&A id (`<card>#<n>`, in the
 * order the Q&A lists them for that card).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, paraphrased.
 *
 * Source: Bandai's Japanese card Q&A for EB-05 (published 2026-10-23, Q1475 to
 * Q1494). The English Q&A PDF for the set had not been published when these
 * were written.
 */

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active });

function effectOptions(game: Game): string[] {
  return game
    .legalActions(game.state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function settle(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const applyOptional = (game: Game) => {
  if (effectOptions(game).includes("apply")) pick(game, "apply");
};

/** Pass the block and Counter steps, stopping at any prompt the battle raises. */
const passDefence = (game: Game) => {
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    !game.state.pendingEffect
  ) {
    game.pass();
  }
};

describe("FAQ EB05-006 Miss Buckingham Stussy", () => {
  it("EB05-006#1: either mode may target any Character -- −4000 on your own, +3000 on the opponent's", () => {
    const own = table("faq-eb05-006-1-own")
      .withBoard("p1", [
        character("stussy", "EB05-006"),
        character("jinbe", "ST31-002"),
      ])
      .build();
    own.play({ type: "activate-main", sourceInstanceId: "stussy" });
    applyOptional(own);
    own.play({ type: "resolve-effect" });
    pick(own, "minus-4000");
    expect(effectOptions(own)).toContain("jinbe");
    pick(own, "jinbe");
    settle(own);
    expect(currentPower(own.state, "p1", "jinbe")).toBe(2000);

    const theirs = table("faq-eb05-006-1-theirs")
      .withBoard("p1", [character("stussy", "EB05-006")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();
    theirs.play({ type: "activate-main", sourceInstanceId: "stussy" });
    applyOptional(theirs);
    theirs.play({ type: "resolve-effect" });
    pick(theirs, "plus-3000");
    expect(effectOptions(theirs)).toContain("jinbe");
    pick(theirs, "jinbe");
    settle(theirs);
    expect(currentPower(theirs.state, "p2", "jinbe")).toBe(9000);
  });

  it("EB05-006#2: the Life card is in hand before the mode is chosen", () => {
    const game = table("faq-eb05-006-2")
      .withBoard("p1", [character("stussy", "EB05-006")])
      .withLife("p1", [
        instance("life-top", "FIX-001"),
        instance("life-2", "FIX-001"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "stussy" });
    applyOptional(game);
    pick(game, "life-top");

    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["plus-3000", "minus-4000"]),
    );
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-top",
    );
  });
});

describe("FAQ EB05-008 Luffy, Now's Your Chance", () => {
  it("EB05-008#1: with no Characters at all, the [Counter] gives the Leader +4000", () => {
    const game = scenario()
      .decks(ST31, ST32)
      .seed("faq-eb05-008-1")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withHand("p1", [instance("event", "EB05-008")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect(game.state.players.p1.board).toHaveLength(0);
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });
});

describe("FAQ EB05-010 Nico Robin", () => {
  it("EB05-010#1: a <Wisdom> [Blocker] whose [Blocker] was switched off still counts as having it, so its K.O. banks nothing", () => {
    const game = table("faq-eb05-010-1", "p2")
      .withLeader("p1", "EB05-010")
      // OP05-052 Maynard is a <Wisdom> [Blocker].
      .withBoard("p1", [character("maynard", "OP05-052", { rested: true })])
      .withBoard("p2", [
        // OP16-063 Kuzan's activation stops a Character activating [Blocker].
        character("kuzan", "OP16-063", { playedTurn: 1 }),
        character("attacker", "ST31-002", { playedTurn: 1 }),
      ])
      .build();
    const lifeBefore = game.state.players.p1.life.length;

    game.play({ type: "activate-main", sourceInstanceId: "kuzan" });
    applyOptional(game);
    pick(game, "maynard");
    settle(game);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "maynard")
        ?.blockerDisabledUntilTurn,
    ).toBeGreaterThanOrEqual(game.state.turn);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "maynard",
    });
    passDefence(game);

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("maynard");
    expect(effectOptions(game)).not.toContain("apply");
    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
  });
});

describe("FAQ EB05-011 Otohime", () => {
  it("EB05-011#1: with the top Life card already face-down, the cost cannot be paid and nothing is rested", () => {
    const game = table("faq-eb05-011-1")
      .withLeader("p1", "OP11-022")
      .withLife("p1", [
        instance("life-top", "FIX-001"),
        instance("life-2", "FIX-001", { faceUp: true }),
      ])
      .withHand("p1", [instance("otohime", "EB05-011")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-011" });
    expect(effectOptions(game)).not.toContain("apply");
    settle(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "jinbe")
        ?.rested,
    ).toBe(false);
    expect(game.state.players.p1.life[1]?.faceUp).toBe(true);
  });
});

describe("FAQ EB05-014 Shirahoshi", () => {
  it("EB05-014#1: two [Megalo], or two {Neptunian}, may be the two cards added", () => {
    const megalos = table("faq-eb05-014-1-megalo")
      .withHand("p1", [instance("shirahoshi", "EB05-014")])
      .withDeckTop("p1", [
        instance("megalo-1", "EB04-018"),
        instance("megalo-2", "OP11-112"),
        instance("filler-1", "FIX-001"),
        instance("filler-2", "FIX-001"),
        instance("filler-3", "FIX-001"),
      ])
      .build();
    megalos.play({ type: "play-card", cardNumber: "EB05-014" });
    pick(megalos, "megalo-1");
    pick(megalos, "megalo-2");
    settle(megalos);
    expect(
      megalos.state.players.p1.hand.map((card) => card.instanceId),
    ).toEqual(expect.arrayContaining(["megalo-1", "megalo-2"]));

    const neptunians = table("faq-eb05-014-1-neptunian")
      .withHand("p1", [instance("shirahoshi", "EB05-014")])
      .withDeckTop("p1", [
        instance("spotted", "OP11-036"),
        instance("bird", "OP11-033"),
        instance("filler-1", "FIX-001"),
        instance("filler-2", "FIX-001"),
        instance("filler-3", "FIX-001"),
      ])
      .build();
    neptunians.play({ type: "play-card", cardNumber: "EB05-014" });
    pick(neptunians, "spotted");
    pick(neptunians, "bird");
    settle(neptunians);
    expect(
      neptunians.state.players.p1.hand.map((card) => card.instanceId),
    ).toEqual(expect.arrayContaining(["spotted", "bird"]));
  });
});

describe("FAQ EB05-020 My name is Shirahoshi!!", () => {
  it("EB05-020#1: it may be played on the first turn, resting the Leader to draw 2", () => {
    const game = scenario()
      .decks(ST31, ST32)
      .seed("faq-eb05-020-1")
      .keepBothHands()
      .withLeader("p1", "OP11-022")
      .withHand("p1", [instance("event", "EB05-020")])
      .build();
    expect(game.state.turn).toBe(1);
    expect(game.state.activePlayer).toBe("p1");
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "activate-main", sourceInstanceId: "event" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1 + 2);
  });
});

describe("FAQ EB05-061 Nami", () => {
  it("EB05-061#1: Nami's own replacement answers Nami leaving the field because of the opponent", () => {
    const game = table("faq-eb05-061-1", "p2")
      .withBoard("p1", [character("nami", "EB05-061", { rested: true })])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();
    const lifeBefore = game.state.players.p1.life.length;

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "nami",
    });
    passDefence(game);
    expect(effectOptions(game)).toContain("mechanic:nami:nami");
    pick(game, "mechanic:nami:nami");
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("nami");
    expect(game.state.players.p1.life).toHaveLength(lifeBefore - 1);
  });

  it("EB05-061#2: with no Life cards the replacement cannot be used", () => {
    const game = table("faq-eb05-061-2", "p2")
      .withLife("p1", [])
      .withBoard("p1", [character("nami", "EB05-061", { rested: true })])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "nami",
    });
    passDefence(game);
    expect(
      effectOptions(game).some((optionId) => optionId.endsWith(":nami")),
    ).toBe(false);
    settle(game);

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("nami");
  });
});
