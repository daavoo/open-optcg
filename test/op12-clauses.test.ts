import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP-12 cards that are registered but that no other file drives: one
 * `describe` per card, one case per printed clause. Run
 * `pnpm card:text <card>` for the wording each case checks against.
 */

const DECKS = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
] as const;

/** p1's main phase on an empty table with all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2's main phase, for the clauses p1 answers on the opponent's turn. */
const defending = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

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

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

describe("OP12-008 Shanks", () => {
  covers("OP12-008", "[Blocker]", "[On Your Opponent's Attack]");

  it("blocks a declared attack and rests doing it", () => {
    const game = defending("op12-008-blocker")
      .withBoard("p1", [character("shanks", "OP12-008")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    expect(hasKeyword(game.state, "p1", "shanks", "Blocker")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    resolveAll(game);
    game.play({ type: "block", blockerInstanceId: "shanks" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("shanks");
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
  });

  it("trashes a hand card to give the attacker -2000 for the turn, once per turn", () => {
    const game = defending("op12-008-debuff")
      .withBoard("p1", [character("shanks", "OP12-008")])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withBoard("p2", [
        character("attacker", "OP11-003"),
        character("second", "OP11-003"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fuel" });
    // The Leader is a legal target beside the Characters.
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["p2-leader", "attacker", "second"]),
    );
    game.play({ type: "resolve-effect", optionId: "attacker" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(currentPower(game.state, "p2", "attacker")).toBe(4_000);

    // The debuff is turn-scoped, so it outlasts the battle.
    while (game.state.activeAttack || game.state.pendingEffect) {
      if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      else game.pass();
    }
    expect(currentPower(game.state, "p2", "attacker")).toBe(4_000);

    // [Once Per Turn]: the second attack opens no prompt.
    game.play({
      type: "attack",
      attackerInstanceId: "second",
      targetInstanceId: "p1-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
  });

  it("is not offered with an empty hand", () => {
    const game = defending("op12-008-empty-hand")
      .withBoard("p1", [character("shanks", "OP12-008")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP12-029 Shimotsuki Kouzaburou", () => {
  covers("OP12-029", "[On Play]");

  it("rests a cost-2-or-less Character, then K.O.s a rested base-cost-1 one", () => {
    const game = table("op12-029")
      .withHand("p1", [instance("kouzaburou", "OP12-029")])
      .withBoard("p2", [
        character("one-drop", "OP07-067"), // cost 1
        character("two-drop", "OP05-083"), // cost 2
        character("three-drop", "OP05-012"), // cost 3
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-029" });
    // The cost-3 body is outside the rest's ceiling.
    expect(effectOptions(game.state).sort()).toEqual([
      "done",
      "one-drop",
      "two-drop",
    ]);
    game.play({ type: "resolve-effect", optionId: "one-drop" });
    // The rest feeds the K.O.: the 1-drop it just rested is the only rested
    // Character, and the active 2-drop is no candidate.
    expect(effectOptions(game.state).sort()).toEqual(["done", "one-drop"]);
    game.play({ type: "resolve-effect", optionId: "one-drop" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual([
      "two-drop",
      "three-drop",
    ]);
    expect(ids(game.state.players.p2.trash)).toEqual(["one-drop"]);
  });

  it("K.O.s only by base cost, so a rested 2-drop is safe", () => {
    const game = table("op12-029-base-cost")
      .withHand("p1", [instance("kouzaburou", "OP12-029")])
      .withBoard("p2", [character("two-drop", "OP05-083")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-029" });
    game.play({ type: "resolve-effect", optionId: "two-drop" });
    resolveAll(game);

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
    expect(ids(game.state.players.p2.board)).toEqual(["two-drop"]);
  });
});

describe("OP12-036 Roronoa Zoro", () => {
  covers("OP12-036", "static");

  it("gains +1000 behind a <Slash> Leader and nothing behind another", () => {
    const slash = table("op12-036-power")
      .withLeader("p1", "OP12-020") // <Slash>
      .withBoard("p1", [character("zoro", "OP12-036")])
      .build();
    expect(currentPower(slash.state, "p1", "zoro")).toBe(6_000);

    const special = table("op12-036-power-off")
      .withLeader("p1", "OP12-040") // <Special>
      .withBoard("p1", [character("zoro", "OP12-036")])
      .build();
    expect(currentPower(special.state, "p1", "zoro")).toBe(5_000);
  });

  it("survives losing a fight to a <Slash> attacker behind a <Slash> Leader", () => {
    const game = defending("op12-036-slash-battle")
      .withLeader("p1", "OP12-020")
      .withBoard("p1", [character("zoro", "OP12-036", { rested: true })])
      .withBoard("p2", [character("attacker", "ST14-010")]) // <Slash>, 7000
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "zoro",
    });
    while (game.state.activeAttack || game.state.pendingEffect) {
      if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      else game.pass();
    }

    expect(ids(game.state.players.p1.board)).toEqual(["zoro"]);
  });

  it("is K.O.'d by a <Strike> attacker, and by a <Slash> one behind another Leader", () => {
    const strike = defending("op12-036-strike-battle")
      .withLeader("p1", "OP12-020")
      .withBoard("p1", [character("zoro", "OP12-036", { rested: true })])
      .withBoard("p2", [character("attacker", "OP05-065")]) // <Strike>, 8000
      .build();
    strike.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "zoro",
    });
    while (strike.state.activeAttack || strike.state.pendingEffect) {
      if (strike.state.pendingEffect) strike.play({ type: "resolve-effect" });
      else strike.pass();
    }
    expect(strike.state.players.p1.board).toHaveLength(0);

    const offLeader = defending("op12-036-slash-off")
      .withLeader("p1", "OP12-040")
      .withBoard("p1", [character("zoro", "OP12-036", { rested: true })])
      .withBoard("p2", [character("attacker", "ST14-010")])
      .build();
    offLeader.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "zoro",
    });
    while (offLeader.state.activeAttack || offLeader.state.pendingEffect) {
      if (offLeader.state.pendingEffect) {
        offLeader.play({ type: "resolve-effect" });
      } else offLeader.pass();
    }
    expect(offLeader.state.players.p1.board).toHaveLength(0);
  });

  it("cannot be played from hand by an effect, though it is still played normally", () => {
    // EB03-024 Nefeltari Vivi's [On Play] plays a {Straw Hat Crew} Character
    // of cost 5 or less from hand -- Zoro's type, under its ceiling.
    const game = table("op12-036-effect-play")
      .withHand("p1", [
        instance("vivi", "EB03-024"),
        instance("zoro", "OP12-036"),
        instance("brook", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-024" });
    expect(effectOptions(game.state).sort()).toEqual(["brook", "done"]);
    game.play({ type: "resolve-effect", optionId: "brook" });
    resolveAll(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["zoro"]);
    expect(ids(game.state.players.p1.board)).toEqual(["vivi", "brook"]);

    const alone = table("op12-036-effect-play-alone")
      .withHand("p1", [
        instance("vivi", "EB03-024"),
        instance("zoro", "OP12-036"),
      ])
      .build();
    alone.play({ type: "play-card", cardNumber: "EB03-024" });
    // Zoro is the only body the selector matches, and it is barred, so no
    // choice is asked at all.
    expect(effectOptions(alone.state)).not.toContain("zoro");
    resolveAll(alone);
    expect(ids(alone.state.players.p1.hand)).toEqual(["zoro"]);

    const normal = table("op12-036-normal-play")
      .withHand("p1", [instance("zoro", "OP12-036")])
      .build();
    normal.play({ type: "play-card", cardNumber: "OP12-036" });
    expect(ids(normal.state.players.p1.board)).toEqual(["zoro"]);
  });
});

describe("OP12-053 Borsalino", () => {
  covers("OP12-053", "[Opponent's Turn]", "static");

  it("gains [Blocker] and +1000 on the opponent's turn behind a {Navy} Leader", () => {
    const theirTurn = defending("op12-053-their-turn")
      .withLeader("p1", "OP12-040") // {Navy}
      .withBoard("p1", [character("borsalino", "OP12-053")])
      .build();
    expect(hasKeyword(theirTurn.state, "p1", "borsalino", "Blocker")).toBe(
      true,
    );
    expect(currentPower(theirTurn.state, "p1", "borsalino")).toBe(6_000);

    const ownTurn = table("op12-053-own-turn")
      .withLeader("p1", "OP12-040")
      .withBoard("p1", [character("borsalino", "OP12-053")])
      .build();
    expect(hasKeyword(ownTurn.state, "p1", "borsalino", "Blocker")).toBe(false);
    expect(currentPower(ownTurn.state, "p1", "borsalino")).toBe(5_000);

    const offType = defending("op12-053-off-type")
      .withLeader("p1", "OP12-020") // not {Navy}
      .withBoard("p1", [character("borsalino", "OP12-053")])
      .build();
    expect(hasKeyword(offType.state, "p1", "borsalino", "Blocker")).toBe(false);
    expect(currentPower(offType.state, "p1", "borsalino")).toBe(5_000);
  });

  it("trashes a hand card instead of leaving the field to the opponent's effect, once per turn", () => {
    // ST10-016 Gum-Gum Kong Gatling: p2's own Event, K.O.ing a Character of
    // 7000 power or less -- the opponent's effect the replacement answers.
    const game = defending("op12-053-replacement")
      .withLeader("p1", "OP05-041") // {Navy}, nothing that reads a trash
      .withBoard("p1", [character("borsalino", "OP12-053")])
      .withHand("p1", [
        instance("fuel", "ST31-003"),
        instance("fuel-2", "ST31-003"),
      ])
      .withHand("p2", [
        instance("gatling", "ST10-016"),
        instance("gatling-2", "ST10-016"),
      ])
      .build();

    const gatling = (): void => {
      game.play({ type: "activate-main", summary: "Gum-Gum Kong Gatling" });
      game.play({ type: "resolve-effect", optionId: "borsalino" });
    };

    gatling();
    // The decision is Borsalino's controller's.
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    const replace = effectOptions(game.state).find((option) =>
      option.startsWith("replace:"),
    );
    expect(replace).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replace! });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["borsalino"]);
    expect(game.state.players.p1.trash).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(1);

    // [Once Per Turn]: the second K.O. this turn goes through.
    gatling();
    resolveAll(game);
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toContain("borsalino");
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP12-058 I Will Make Whitebeard the King of the Pirates", () => {
  covers("OP12-058", "[Main]", "[Trigger]");

  it("plays a revealed {Whitebeard Pirates} Character off the top with [Rush]", () => {
    const game = table("op12-058-hit")
      .withLeader("p1", "OP08-002") // {Whitebeard Pirates}
      .withHand("p1", [instance("event", "OP12-058")])
      .withDeckTop("p1", [
        instance("jozu", "OP09-049"), // {Whitebeard Pirates}, cost 4
        instance("next", "ST31-003"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP12-058" });
    expect(
      game.events.some(
        (event) =>
          event.type === "card-revealed" && event.cardNumber === "OP09-049",
      ),
    ).toBe(true);
    expect(effectOptions(game.state).sort()).toEqual(["done", "jozu"]);
    game.play({ type: "resolve-effect", optionId: "jozu" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["jozu"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("next");
    expect(hasKeyword(game.state, "p1", "jozu", "Rush")).toBe(true);
    expect(
      game.action({
        type: "attack",
        attackerInstanceId: "jozu",
        targetInstanceId: "p2-leader",
      }),
    ).toBeDefined();
  });

  it("reveals a miss and leaves it on top", () => {
    const game = table("op12-058-miss")
      .withLeader("p1", "OP08-002")
      .withHand("p1", [instance("event", "OP12-058")])
      .withDeckTop("p1", [instance("brook", "ST31-003")])
      .build();

    game.play({ type: "activate-main", summary: "OP12-058" });
    expect(effectOptions(game.state)).not.toContain("brook");
    resolveAll(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("brook");
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("op12-058-leader")
      .withLeader("p1", "OP12-040")
      .withHand("p1", [instance("event", "OP12-058")])
      .withDeckTop("p1", [instance("jozu", "OP09-049")])
      .build();

    const event = game
      .legalActions()
      .find((action) => action.summary.includes("OP12-058"));
    if (event) {
      game.submit(event);
      resolveAll(game);
    }
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("jozu");
    expect(
      game.events.some((candidate) => candidate.type === "card-revealed"),
    ).toBe(false);
  });

  it("draws 1 off its Life Trigger", () => {
    const game = defending("op12-058-trigger")
      .withLife("p1", [instance("life-trigger", "OP12-058")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["life-trigger"]);
  });
});

describe("OP12-118 Jewelry Bonney", () => {
  covers("OP12-118", "[Blocker]", "[On Play]");

  it("blocks a declared attack", () => {
    const game = defending("op12-118-blocker")
      .withBoard("p1", [character("bonney", "OP12-118")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    expect(hasKeyword(game.state, "p1", "bonney", "Blocker")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "bonney" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("bonney");
  });

  it("with 8 rested cards draws 2, trashes 1 and sets a DON!! active", () => {
    // Three rested DON!! plus the five Bonney's cost rests make eight.
    const game = table("op12-118-on-play")
      .withDon("p1", { rested: 3 })
      .withHand("p1", [
        instance("bonney", "OP12-118"),
        instance("kept", "ST31-003"),
      ])
      .withDeckTop("p1", [
        instance("draw-1", "OP05-083"),
        instance("draw-2", "OP05-012"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-118" });
    expect(game.state.players.p1.restedDon).toHaveLength(8);
    expect(effectOptions(game.state).sort()).toEqual([
      "draw-1",
      "draw-2",
      "kept",
    ]);
    game.play({ type: "resolve-effect", optionId: "draw-1" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["draw-2", "kept"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["draw-1"]);
    expect(game.state.players.p1.restedDon).toHaveLength(7);
    expect(game.state.players.p1.activeDon).toHaveLength(3);
  });

  it("does nothing with 7 rested cards", () => {
    const game = table("op12-118-short")
      .withDon("p1", { rested: 2 })
      .withHand("p1", [instance("bonney", "OP12-118")])
      .withDeckTop("p1", [instance("draw-1", "OP05-083")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-118" });
    resolveAll(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(7);
  });
});
