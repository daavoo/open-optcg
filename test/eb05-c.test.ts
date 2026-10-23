import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { BoardCard, GameState } from "@one-piece-sim/engine-core";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * EXTRA BOOSTER -ONE PIECE Heroines Edition vol.2- [EB-05], Black and Yellow:
 * EB05-041 to EB05-060.
 *
 * `packages/cards/src/eb05.ts` explains where the records come from; this file
 * holds the behaviour of the twenty cards in the two colours. EB05-041 Koala
 * and EB05-058 Bell-mère print no text and have nothing to test.
 *
 * ## The rule the group added
 *
 * EB05-052 Gloriosa's "if you would take damage, you may trash this Character
 * instead" is the first replacement in the pool on a *player's* damage rather
 * than on a Character's removal. It lives in `damage-replacement.ts` and is
 * asked at both places damage is dealt -- `resolveBattle` and the DSL's
 * `deal-damage` node -- so both are driven from the card here.
 *
 * Every position seats two starter decks on a bare table and puts the cards
 * under test in a zone with a `with*` setter, since no shipped list plays them.
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

/** Take the apply branch of an `optional` prompt, if one is open. */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

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

/** Attack p2's Leader with p1's `attacker` and activate the flipped Trigger. */
const flipLifeTrigger = (game: Game) => {
  attack(game, "attacker", "p2-leader");
  declineDefence(game);
  game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
};

const playEvent = (game: Game, cardNumber: string) =>
  game.play({ type: "activate-main", summary: `[${cardNumber}]` });

/** p1 defending with an attack on its Leader open at the Counter step. */
const counterStep = (seed: string, target = "p1-leader") =>
  defending(seed)
    .withBoard("p2", [character("attacker", "ST31-002")])
    .withActiveAttack(
      {
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "attacker",
        targetInstanceId: target,
        attackPower: 6000,
        counterPower: 0,
      },
      "counter",
    );

const counterOffered = (game: Game) =>
  getLegalActions(game.state, "p1").some(
    (action) => action.type === "activate-counter-event",
  );

// --- Black: EB05-042 to EB05-049 --------------------------------------------

describe("EB05-042 Shinobu", () => {
  covers("EB05-042", "[On Play]");

  it("draws two, then trashes exactly two of the hand it made", () => {
    const game = table("eb05-042")
      .withHand("p1", [
        instance("shinobu", "EB05-042"),
        instance("kept", "FIX-001"),
        instance("spent", "FIX-001"),
      ])
      .withDeckTop("p1", [
        instance("drawn-1", "FIX-002"),
        instance("drawn-2", "FIX-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-042" });
    // Mandatory: stopping after one is never offered.
    expect(effectOptions(game.state)).not.toContain("done");
    expect(effectOptions(game.state)).toContain("drawn-1");
    pick(game, "spent");
    expect(effectOptions(game.state)).not.toContain("done");
    pick(game, "drawn-1");
    settle(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(
      ["drawn-2", "kept"].sort(),
    );
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["spent", "drawn-1"]),
    );
  });
});

describe("EB05-043 Perona", () => {
  covers("EB05-043", "[On K.O.]");

  /** p2 swings `attacker` into a rested Perona, which loses the fight. */
  const koPerona = (
    seed: string,
    attacker: string,
    bystanders: BoardCard[] = [],
  ) =>
    defending(seed)
      .withBoard("p1", [character("perona", "EB05-043", { rested: true })])
      .withBoard("p2", [character("attacker", attacker), ...bystanders]);

  it("K.O.s a cost-6 Character when the K.O. branch is chosen", () => {
    // OP12-045 Jango is a printed 6-drop: the ceiling itself.
    const game = koPerona("eb05-043-ko", "OP12-045", [
      // OP08-065 Charlotte Smoothie is a printed 7-drop.
      character("smoothie", "OP08-065"),
    ]).build();

    attack(game, "attacker", "perona");
    declineDefence(game);
    expect(effectOptions(game.state).sort()).toEqual(["ko", "rest"]);
    pick(game, "ko");
    expect(effectOptions(game.state)).toContain("attacker");
    expect(effectOptions(game.state)).not.toContain("smoothie");
    pick(game, "attacker");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["smoothie"]);
    expect(ids(game.state.players.p1.trash)).toContain("perona");
  });

  it("rests an active Character when the rest branch is chosen", () => {
    const game = koPerona("eb05-043-rest", "OP12-045", [
      character("small", "FIX-001"),
    ]).build();

    attack(game, "attacker", "perona");
    declineDefence(game);
    pick(game, "rest");
    // The attacker is already rested from its swing, so only the active body
    // is a target the rest can reach.
    expect(effectOptions(game.state)).toContain("small");
    expect(effectOptions(game.state)).not.toContain("attacker");
    pick(game, "small");
    settle(game);

    expect(boardCard(game, "p2", "small")?.rested).toBe(true);
    expect(ids(game.state.players.p2.board)).toContain("small");
  });

  it("asks nothing when every opposing Character costs 7 or more", () => {
    const game = koPerona("eb05-043-none", "OP08-065").build();

    attack(game, "attacker", "perona");
    declineDefence(game);

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.trash)).toContain("perona");
    expect(ids(game.state.players.p2.board)).toEqual(["attacker"]);
  });
});

/**
 * Brings `targetId` on p2's board to cost 0 with EB05-049 Special Hollow's
 * `[Main]`, paid by p1's `lola` (OP06-094, a vanilla {Thriller Bark Pirates}).
 */
const zeroCost = (game: Game, targetId: string) => {
  playEvent(game, "EB05-049");
  applyOptional(game);
  pick(game, "lola");
  pick(game, targetId);
  settle(game);
};

describe("EB05-044 Ms. Father's Day", () => {
  covers("EB05-044", "[On Play]");

  /** A Baroque Works Leader, a Thriller Bark body to pay Special Hollow with. */
  const crocodile = (seed: string) =>
    table(seed)
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [character("lola", "OP06-094")])
      .withHand("p1", [
        instance("hollow", "EB05-049"),
        instance("father", "EB05-044"),
      ])
      .withBoard("p2", [character("small", "FIX-002")]);

  it("gives the opposing Leader −1000 for the turn against a cost-0 Character", () => {
    const game = crocodile("eb05-044-hit")
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    zeroCost(game, "small");
    expect(
      effectiveCost(game.state, "p2", boardCard(game, "p2", "small")!),
    ).toBe(0);
    game.play({ type: "play-card", cardNumber: "EB05-044" });
    settle(game);

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(4000);
    game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(5000);
  });

  it("does nothing while no opposing Character costs 0", () => {
    const game = crocodile("eb05-044-no-zero").build();

    game.play({ type: "play-card", cardNumber: "EB05-044" });
    settle(game);

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(5000);
  });

  it("does nothing behind a Leader without the Baroque Works type", () => {
    const game = crocodile("eb05-044-leader")
      .withLeader("p1", "FIX-LEADER-PERONA")
      .build();

    zeroCost(game, "small");
    game.play({ type: "play-card", cardNumber: "EB05-044" });
    settle(game);

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(5000);
  });
});

describe("EB05-045 Ms. Monday", () => {
  covers("EB05-045", "[On Play]", "[On K.O.]");

  it("K.O.s one of your Baroque Works Characters, and no other", () => {
    const game = table("eb05-045-on-play")
      .withHand("p1", [instance("monday", "EB05-045")])
      .withBoard("p1", [
        // OP14-095 Mr.9 is {Baroque Works}; FIX-001 is not.
        character("mr9", "OP14-095"),
        character("deckhand", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-045" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["mr9", "monday"]),
    );
    expect(effectOptions(game.state)).not.toContain("deckhand");
    pick(game, "mr9");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toContain("mr9");
    expect(ids(game.state.players.p1.board).sort()).toEqual(
      ["deckhand", "monday"].sort(),
    );
  });

  it("on K.O., adds a card whose type includes Baroque Works and trashes the rest", () => {
    const game = table("eb05-045-on-ko")
      .withHand("p1", [instance("monday", "EB05-045")])
      .withDeckTop("p1", [
        instance("filler-1", "FIX-001"),
        // OP09-055 Mr.1 is {Former Baroque Works}: the substring reaches it.
        instance("mr1", "OP09-055"),
        instance("filler-2", "FIX-002"),
        instance("fourth", "OP14-095"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-045" });
    pick(game, "monday");
    expect(effectOptions(game.state)).toContain("mr1");
    expect(effectOptions(game.state)).not.toContain("fourth");
    pick(game, "mr1");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["mr1"]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["monday", "filler-1", "filler-2"]),
    );
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("fourth");
  });

  it("on K.O. with no match, trashes all three", () => {
    const game = table("eb05-045-on-ko-miss")
      .withHand("p1", [instance("monday", "EB05-045")])
      .withDeckTop("p1", copies(3, "FIX-001", "filler"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-045" });
    pick(game, "monday");
    settle(game);

    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["filler-1", "filler-2", "filler-3"]),
    );
  });
});

describe("EB05-046 Yamato", () => {
  covers("EB05-046", "static", "[On Your Opponent's Attack]");

  it("gains [Blocker] and +3000 while the opponent has an 8000-base Character", () => {
    const game = table("eb05-046-static")
      .withBoard("p1", [character("yamato", "EB05-046")])
      // OP05-065 San-Gorou is a vanilla 8000.
      .withBoard("p2", [character("big", "OP05-065")])
      .build();

    expect(hasKeyword(game.state, "p1", "yamato", "Blocker")).toBe(true);
    expect(currentPower(game.state, "p1", "yamato")).toBe(8000);
  });

  it("reads base power: a 7000 carrying DON!! does not switch it on", () => {
    const game = table("eb05-046-static-base")
      .withBoard("p1", [character("yamato", "EB05-046")])
      // ST14-010 Brook is a vanilla 7000; one DON!! makes it an 8000 now.
      .withBoard("p2", [character("brook", "ST14-010")])
      .withGivenDon("p2", "brook", 1)
      .build();

    expect(hasKeyword(game.state, "p1", "yamato", "Blocker")).toBe(false);
    expect(currentPower(game.state, "p1", "yamato")).toBe(5000);
  });

  /** p2 attacks p1's Leader with Yamato on p1's board. */
  const yamatoDefends = (seed: string, trash: number) =>
    defending(seed)
      .withBoard("p1", [character("yamato", "EB05-046")])
      .withHand("p1", [instance("fodder", "FIX-001")])
      .withTrash("p1", copies(trash, "FIX-002", "trashed"))
      .withBoard("p2", [character("attacker", "ST31-002")]);

  it("trashes a card to make the Leader's base power 7000 with ten in the trash", () => {
    const game = yamatoDefends("eb05-046-reaction", 10).build();

    attack(game, "attacker", "p1-leader");
    applyOptional(game);
    pick(game, "fodder");
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });

  it("spends the card for nothing with fewer than ten after paying", () => {
    const game = yamatoDefends("eb05-046-short", 8).build();

    attack(game, "attacker", "p1-leader");
    applyOptional(game);
    pick(game, "fodder");
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
    expect(ids(game.state.players.p1.trash)).toContain("fodder");
  });

  it("can be declined, keeping the card", () => {
    const game = yamatoDefends("eb05-046-decline", 10).build();

    attack(game, "attacker", "p1-leader");
    pick(game, "skip");

    expect(ids(game.state.players.p1.hand)).toEqual(["fodder"]);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("is not offered with an empty hand", () => {
    const game = yamatoDefends("eb05-046-empty", 10).withHand("p1", []).build();

    attack(game, "attacker", "p1-leader");

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("EB05-047 Ripley", () => {
  covers("EB05-047", "static", "[On Play]");

  it("costs 12 more on the field", () => {
    const game = table("eb05-047-cost")
      .withBoard("p1", [character("ripley", "EB05-047")])
      .build();

    expect(
      effectiveCost(game.state, "p1", boardCard(game, "p1", "ripley")!),
    ).toBe(16);
  });

  it("trashes a card to play a cost-2 Character from the trash", () => {
    const game = table("eb05-047-play")
      .withHand("p1", [
        instance("ripley", "EB05-047"),
        instance("fodder", "FIX-001"),
      ])
      .withTrash("p1", [
        instance("two", "FIX-002"),
        // ST31-002 Jinbe is a printed 5-drop.
        instance("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-047" });
    applyOptional(game);
    pick(game, "fodder");
    expect(effectOptions(game.state)).toContain("two");
    expect(effectOptions(game.state)).toContain("fodder");
    expect(effectOptions(game.state)).not.toContain("jinbe");
    pick(game, "two");
    settle(game);

    expect(ids(game.state.players.p1.board).sort()).toEqual(
      ["ripley", "two"].sort(),
    );
  });

  it("can be declined, keeping the hand card and the trash as they were", () => {
    const game = table("eb05-047-decline")
      .withHand("p1", [
        instance("ripley", "EB05-047"),
        instance("fodder", "FIX-001"),
      ])
      .withTrash("p1", [instance("two", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-047" });
    pick(game, "skip");

    expect(ids(game.state.players.p1.hand)).toEqual(["fodder"]);
    expect(ids(game.state.players.p1.board)).toEqual(["ripley"]);
  });
});

describe("EB05-048 Hedgehog Stinger", () => {
  covers("EB05-048", "[Main]");

  /**
   * p1 with a Baroque Works body to K.O. and a Thriller Bark body to pay
   * Special Hollow with; p2 with two 2-cost [Blocker]s (OP04-077 Ideo).
   */
  const stinger = (seed: string) =>
    table(seed)
      .withBoard("p1", [
        character("attacker", "ST31-002"),
        character("mr9", "OP14-095"),
        character("lola", "OP06-094"),
      ])
      .withHand("p1", [
        instance("hollow", "EB05-049"),
        instance("stinger", "EB05-048"),
      ])
      .withBoard("p2", [
        character("zeroed", "OP04-077"),
        character("costly", "OP04-077"),
      ]);

  const blockers = (game: Game): string[] =>
    getLegalActions(game.state, "p2")
      .filter((action) => action.type === "block")
      .map(
        (action) => (action as { blockerInstanceId: string }).blockerInstanceId,
      );

  it("rests a DON!! and K.O.s a Baroque Works body to stop cost-0 [Blocker]s", () => {
    const game = stinger("eb05-048-main").build();

    zeroCost(game, "zeroed");
    const activeBefore = game.state.players.p1.activeDon.length;
    playEvent(game, "EB05-048");
    applyOptional(game);
    pick(game, "mr9");
    settle(game);

    // One DON!! for the Event and one rested as its printed cost.
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 2);
    expect(ids(game.state.players.p1.trash)).toContain("mr9");

    attack(game, "attacker", "p2-leader");
    expect(blockers(game)).toEqual(["costly"]);
  });

  it("buys nothing without a Baroque Works Character to K.O.", () => {
    const game = stinger("eb05-048-unpaid")
      .withBoard("p1", [
        character("attacker", "ST31-002"),
        character("lola", "OP06-094"),
      ])
      .build();

    zeroCost(game, "zeroed");
    playEvent(game, "EB05-048");
    settle(game);

    attack(game, "attacker", "p2-leader");
    expect(blockers(game).sort()).toEqual(["costly", "zeroed"]);
  });

  it("can be declined", () => {
    const game = stinger("eb05-048-decline").build();

    zeroCost(game, "zeroed");
    playEvent(game, "EB05-048");
    pick(game, "skip");

    expect(ids(game.state.players.p1.board)).toContain("mr9");
    attack(game, "attacker", "p2-leader");
    expect(blockers(game).sort()).toEqual(["costly", "zeroed"]);
  });
});

describe("EB05-048 Hedgehog Stinger's Counter", () => {
  covers("EB05-048", "[Counter]");

  it("gives the Leader +3000 during this battle", () => {
    const game = counterStep("eb05-048-counter")
      .withHand("p1", [instance("stinger", "EB05-048")])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "stinger" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });

  it("is not offered while a Character is the one being attacked", () => {
    const game = counterStep("eb05-048-counter-blocked", "body")
      .withHand("p1", [instance("stinger", "EB05-048")])
      .withBoard("p1", [character("body", "FIX-002", { rested: true })])
      .build();

    expect(counterOffered(game)).toBe(false);
  });
});

describe("EB05-049 Special Hollow", () => {
  covers("EB05-049", "[Main]");

  const hollow = (seed: string) =>
    table(seed)
      .withBoard("p1", [character("lola", "OP06-094")])
      .withHand("p1", [instance("hollow", "EB05-049")])
      .withBoard("p2", [character("jinbe", "ST31-002")]);

  it("K.O.s a Thriller Bark body to give a Character −3 cost for the turn", () => {
    const game = hollow("eb05-049-main")
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    playEvent(game, "EB05-049");
    applyOptional(game);
    pick(game, "lola");
    pick(game, "jinbe");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toContain("lola");
    expect(
      effectiveCost(game.state, "p2", boardCard(game, "p2", "jinbe")!),
    ).toBe(2);
    game.pass();
    expect(
      effectiveCost(game.state, "p2", boardCard(game, "p2", "jinbe")!),
    ).toBe(5);
  });

  it("buys nothing without a Thriller Bark Character to pay with", () => {
    const game = hollow("eb05-049-unpaid")
      .withBoard("p1", [character("deckhand", "FIX-001")])
      .build();

    playEvent(game, "EB05-049");
    settle(game);

    expect(
      effectiveCost(game.state, "p2", boardCard(game, "p2", "jinbe")!),
    ).toBe(5);
    expect(ids(game.state.players.p1.board)).toEqual(["deckhand"]);
  });

  it("a paid K.O. fires the paid Character's own [On K.O.]", () => {
    // EB05-043 Perona is {Thriller Bark Pirates}: paying with her is the deck's
    // way of buying two effects with one card.
    const game = hollow("eb05-049-perona")
      .withBoard("p1", [character("perona", "EB05-043")])
      .build();

    playEvent(game, "EB05-049");
    applyOptional(game);
    pick(game, "perona");
    pick(game, "jinbe");
    // Perona's [On K.O.] resolves before the payoff continues.
    settle(game, "rest", "jinbe");

    expect(boardCard(game, "p2", "jinbe")?.rested).toBe(true);
  });
});

describe("EB05-049 Special Hollow's Counter", () => {
  covers("EB05-049", "[Counter]");

  it("K.O.s a Thriller Bark body for +4000 during this battle", () => {
    const game = counterStep("eb05-049-counter")
      .withBoard("p1", [character("lola", "OP06-094")])
      .withHand("p1", [instance("hollow", "EB05-049")])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "hollow" });
    applyOptional(game);
    pick(game, "lola");
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(ids(game.state.players.p1.trash)).toContain("lola");
  });

  it("adds nothing without a Thriller Bark Character", () => {
    const game = counterStep("eb05-049-counter-unpaid")
      .withBoard("p1", [character("deckhand", "FIX-001")])
      .withHand("p1", [instance("hollow", "EB05-049")])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "hollow" });
    settle(game);

    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
    expect(ids(game.state.players.p1.board)).toEqual(["deckhand"]);
  });
});

// --- Yellow: EB05-050 to EB05-060 -------------------------------------------

/** p2 holds the card under test as a Life card; p1 attacks into it. */
const triggering = (seed: string) =>
  table(seed).withBoard("p1", [character("attacker", "ST31-002")]);

describe("EB05-050 Atlas", () => {
  covers("EB05-050", "[On Play]", "[Trigger]");

  it("adds a <Wisdom> card from the top four and bottoms the rest", () => {
    const game = table("eb05-050-on-play")
      .withHand("p1", [instance("atlas", "EB05-050")])
      .withDeckTop("p1", [
        instance("filler-1", "FIX-001"),
        instance("filler-2", "FIX-002"),
        // OP05-083 Sterry is a vanilla <Wisdom>.
        instance("sterry", "OP05-083"),
        instance("filler-3", "FIX-001"),
        instance("fifth", "OP05-083"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-050" });
    expect(effectOptions(game.state)).toContain("sterry");
    expect(effectOptions(game.state)).not.toContain("filler-1");
    expect(effectOptions(game.state)).not.toContain("fifth");
    pick(game, "sterry");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["sterry"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("fifth");
    expect(game.state.players.p1.deck).toHaveLength(4);
  });

  it("runs the same search as its [Trigger]", () => {
    const game = triggering("eb05-050-trigger")
      .withLife("p2", [instance("life-atlas", "EB05-050")])
      .withDeckTop("p2", [
        instance("sterry", "OP05-083"),
        ...copies(3, "FIX-001", "filler"),
      ])
      .build();

    flipLifeTrigger(game);
    pick(game, "sterry");
    settle(game);

    expect(ids(game.state.players.p2.hand)).toContain("sterry");
    // The Trigger activates the [On Play] effect; it does not play the card.
    expect(ids(game.state.players.p2.board)).toEqual([]);
  });
});

describe("EB05-051 Ahiru", () => {
  covers("EB05-051", "[On Play]", "[Trigger]");

  it("rests a Character costing no more than the two Life totals together", () => {
    const game = table("eb05-051-on-play")
      .withHand("p1", [instance("ahiru", "EB05-051")])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .withBoard("p2", [
        // OP06-094 Lola is a printed 4-drop, OP14-095 Mr.9 a 5-drop.
        character("four", "OP06-094"),
        character("five", "OP14-095"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-051" });
    expect(effectOptions(game.state)).toContain("four");
    expect(effectOptions(game.state)).not.toContain("five");
    pick(game, "four");
    settle(game);

    expect(boardCard(game, "p2", "four")?.rested).toBe(true);
    expect(boardCard(game, "p2", "five")?.rested).toBe(false);
  });

  it("plays itself as its [Trigger], and its [On Play] follows", () => {
    const game = triggering("eb05-051-trigger")
      .withLife("p2", [
        instance("life-ahiru", "EB05-051"),
        ...copies(3, "FIX-001", "p2-life"),
      ])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p1", [
        character("attacker", "ST31-002"),
        character("four", "OP06-094"),
      ])
      .build();

    flipLifeTrigger(game);
    // Three Life left for p2 and two for p1: a cost-4 body is in range.
    pick(game, "four");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["life-ahiru"]);
    expect(boardCard(game, "p1", "four")?.rested).toBe(true);
  });
});

describe("EB05-052 Gloriosa", () => {
  covers("EB05-052", "static", "[Trigger]");

  const gloriosa = (seed: string) =>
    defending(seed)
      .withBoard("p1", [character("gloriosa", "EB05-052")])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("attacker", "ST31-002")]);

  it("may be trashed instead of the Leader taking battle damage", () => {
    const game = gloriosa("eb05-052-battle").build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    expect(effectOptions(game.state).sort()).toEqual(
      ["replace:gloriosa", "skip"].sort(),
    );
    pick(game, "replace:gloriosa");

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(ids(game.state.players.p1.trash)).toContain("gloriosa");
    expect(game.state.activeAttack).toBeNull();
    expect(game.state.phase).toBe("main");
    expect(game.state.activePlayer).toBe("p2");
  });

  it("is not a K.O.: the trash raises no character-ko event", () => {
    const game = gloriosa("eb05-052-not-ko").build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    pick(game, "replace:gloriosa");

    expect(game.events.some((event) => event.type === "character-ko")).toBe(
      false,
    );
    expect(
      game.events.some(
        (event) =>
          event.type === "card-moved" &&
          event.cardInstanceId === "gloriosa" &&
          event.to === "trash",
      ),
    ).toBe(true);
  });

  it("can be declined, and the damage lands as usual", () => {
    const game = gloriosa("eb05-052-decline").build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    pick(game, "skip");
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(1);
    expect(ids(game.state.players.p1.board)).toEqual(["gloriosa"]);
  });

  it("is not offered when the attack is defended", () => {
    const game = gloriosa("eb05-052-defended")
      .withLeader("p1", "FIX-LEADER-VEGAPUNK")
      .withHand("p1", [instance("stinger", "EB05-048")])
      .build();

    attack(game, "attacker", "p1-leader");
    game.pass(); // no block
    game.play({ type: "activate-counter-event", eventInstanceId: "stinger" });
    settle(game);
    declineDefence(game);

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("draws two and trashes one as its [Trigger]", () => {
    const game = triggering("eb05-052-trigger")
      .withLife("p2", [instance("life-gloriosa", "EB05-052")])
      .withDeckTop("p2", [
        instance("drawn-1", "FIX-001"),
        instance("drawn-2", "FIX-002"),
      ])
      .build();

    flipLifeTrigger(game);
    expect(effectOptions(game.state)).not.toContain("done");
    pick(game, "drawn-1");
    settle(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["drawn-2"]);
    expect(ids(game.state.players.p2.trash)).toContain("drawn-1");
  });
});

describe("EB05-053 Charlotte Praline", () => {
  covers("EB05-053", "[When Attacking]", "[Trigger]");

  const praline = (seed: string, opponentHand: number) =>
    table(seed)
      .withBoard("p1", [character("praline", "EB05-053")])
      .withHand("p1", [instance("banked", "FIX-001")])
      .withLife("p1", [instance("p1-life", "FIX-002")])
      .withHand("p2", copies(opponentHand, "FIX-001", "p2-hand"));

  it("adds a hand card to the top of Life against a hand of nine", () => {
    const game = praline("eb05-053-attack", 9).build();

    attack(game, "praline", "p2-leader");
    pick(game, "banked");
    settle(game);

    expect(ids(game.state.players.p1.life)).toEqual(["banked", "p1-life"]);
    expect(game.state.players.p1.life[0]?.faceUp).not.toBe(true);
  });

  it("does nothing against a hand of eight", () => {
    const game = praline("eb05-053-attack-short", 8).build();

    attack(game, "praline", "p2-leader");

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.life)).toEqual(["p1-life"]);
  });

  it("may add nothing", () => {
    const game = praline("eb05-053-attack-decline", 9).build();

    attack(game, "praline", "p2-leader");
    pick(game, "done");

    expect(ids(game.state.players.p1.hand)).toEqual(["banked"]);
  });

  it("trashes a card to play itself at 2 Life or less as its [Trigger]", () => {
    const game = triggering("eb05-053-trigger")
      .withLife("p2", [
        instance("life-praline", "EB05-053"),
        ...copies(2, "FIX-001", "p2-life"),
      ])
      .withHand("p2", [instance("fodder", "FIX-002")])
      .build();

    flipLifeTrigger(game);
    applyOptional(game);
    pick(game, "fodder");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["life-praline"]);
  });

  it("pays for nothing at 3 Life", () => {
    const game = triggering("eb05-053-trigger-high")
      .withLife("p2", [
        instance("life-praline", "EB05-053"),
        ...copies(3, "FIX-001", "p2-life"),
      ])
      .withHand("p2", [instance("fodder", "FIX-002")])
      .build();

    flipLifeTrigger(game);
    applyOptional(game);
    pick(game, "fodder");
    settle(game);

    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.trash)).toContain("fodder");
  });
});

describe("EB05-054 Charlotte Brulee", () => {
  covers("EB05-054", "[Trigger]");

  it("plays up to two 4000-power Big Mom Pirates Characters from hand", () => {
    const game = triggering("eb05-054-trigger")
      .withLife("p2", [instance("life-brulee", "EB05-054")])
      .withHand("p2", [
        // OP17-104 Cracker and OP11-069 Brulee are {Big Mom Pirates} 4000s.
        instance("cracker", "OP17-104"),
        instance("brulee", "OP11-069"),
        // OP08-065 Smoothie is a 9000; FIX-002 is a 4000 of no such type.
        instance("smoothie", "OP08-065"),
        instance("stranger", "FIX-002"),
      ])
      .build();

    flipLifeTrigger(game);
    expect(effectOptions(game.state)).not.toContain("smoothie");
    expect(effectOptions(game.state)).not.toContain("stranger");
    pick(game, "cracker");
    pick(game, "brulee");
    settle(game, "done", "skip");

    expect(ids(game.state.players.p2.board).sort()).toEqual(
      ["brulee", "cracker"].sort(),
    );
  });
});

describe("EB05-055 Nami", () => {
  covers("EB05-055", "[Your Turn]", "[On Play]", "[Trigger]");

  it("banks the top card of the deck behind a <Wisdom> Leader on your turn", () => {
    const game = table("eb05-055-on-play")
      .withLeader("p1", "FIX-LEADER-VEGAPUNK")
      .withHand("p1", [instance("nami", "EB05-055")])
      .withDeckTop("p1", [instance("top", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-055" });
    pick(game, "top");
    settle(game);

    expect(ids(game.state.players.p1.life)).toEqual(["top"]);
  });

  it("banks nothing behind a Leader without <Wisdom>", () => {
    const game = table("eb05-055-leader")
      .withLeader("p1", "FIX-LEADER-ODEN")
      .withHand("p1", [instance("nami", "EB05-055")])
      .withDeckTop("p1", [instance("top", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-055" });
    settle(game);

    expect(game.state.players.p1.life).toEqual([]);
  });

  it("plays itself as its [Trigger], and the [Your Turn] [On Play] stays silent", () => {
    const game = triggering("eb05-055-trigger")
      .withLeader("p2", "FIX-LEADER-VEGAPUNK")
      .withLife("p2", [
        instance("life-nami", "EB05-055"),
        instance("p2-life", "FIX-001"),
      ])
      .withHand("p2", [instance("fodder", "FIX-002")])
      .withDeckTop("p2", [instance("top", "FIX-001")])
      .build();

    flipLifeTrigger(game);
    applyOptional(game);
    pick(game, "fodder");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["life-nami"]);
    expect(ids(game.state.players.p2.life)).toEqual(["p2-life"]);
  });
});

describe("EB05-056 Nico Olvia", () => {
  covers("EB05-056", "[On Play]", "[Trigger]");

  const olvia = (seed: string, leader: string) =>
    table(seed)
      .withLeader("p1", leader)
      .withHand("p1", [
        instance("olvia", "EB05-056"),
        // OP07-107 Franky prints a [Trigger]; FIX-001 does not.
        instance("franky", "OP07-107"),
        instance("blank", "FIX-001"),
      ])
      .withDeckTop("p1", copies(2, "FIX-002", "drawn"));

  it("trashes a [Trigger] card to draw two behind a [Nico Robin] Leader", () => {
    const game = olvia("eb05-056-on-play", "EB05-010").build();

    game.play({ type: "play-card", cardNumber: "EB05-056" });
    applyOptional(game);
    expect(effectOptions(game.state)).toContain("franky");
    expect(effectOptions(game.state)).not.toContain("blank");
    pick(game, "franky");
    settle(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(
      ["blank", "drawn-1", "drawn-2"].sort(),
    );
  });

  it("spends the card and draws nothing behind another Leader", () => {
    const game = olvia("eb05-056-leader", "FIX-LEADER-VEGAPUNK").build();

    game.play({ type: "play-card", cardNumber: "EB05-056" });
    applyOptional(game);
    pick(game, "franky");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["blank"]);
  });

  it("plays itself as its [Trigger]", () => {
    const game = triggering("eb05-056-trigger")
      .withLife("p2", [instance("life-olvia", "EB05-056")])
      .build();

    flipLifeTrigger(game);
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["life-olvia"]);
  });
});

describe("EB05-057 Nojiko", () => {
  covers("EB05-057", "[Activate: Main]");

  const nojiko = (seed: string) =>
    table(seed)
      .withLeader("p1", "FIX-LEADER-ODEN")
      .withBoard("p1", [
        character("nojiko", "EB05-057"),
        // OP05-083 Sterry is <Wisdom>, FIX-001 <Strike>.
        character("sterry", "OP05-083"),
        character("deckhand", "FIX-001"),
      ])
      .withDon("p1", { rested: 2 });

  const activateOffered = (game: Game) =>
    game
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "activate-main" &&
          (action as { sourceInstanceId?: string }).sourceInstanceId ===
            "nojiko",
      );

  it("gives a rested DON!! to a <Special> or <Wisdom> card, once per turn", () => {
    const game = nojiko("eb05-057-gift").build();

    game.play({ type: "activate-main", sourceInstanceId: "nojiko" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["nojiko", "sterry"]),
    );
    expect(effectOptions(game.state)).not.toContain("deckhand");
    // The Leader is <Slash>.
    expect(effectOptions(game.state)).not.toContain("p1-leader");
    pick(game, "sterry");
    settle(game);

    expect(boardCard(game, "p1", "sterry")?.attachedDon).toHaveLength(1);
    expect(activateOffered(game)).toBe(false);
  });

  it("is not offered with no rested DON!!", () => {
    const game = table("eb05-057-none")
      .withBoard("p1", [character("nojiko", "EB05-057")])
      .build();

    expect(activateOffered(game)).toBe(false);
  });
});

describe("EB05-057 Nojiko's Trigger", () => {
  covers("EB05-057", "[Trigger]");

  it("plays a [Trigger] Character of 6000 power or less at 2 Life or less", () => {
    const game = triggering("eb05-057-trigger")
      .withLife("p2", [
        instance("life-nojiko", "EB05-057"),
        instance("p2-life", "FIX-001"),
      ])
      .withHand("p2", [
        // OP07-107 Franky is a 5000 with a [Trigger]; FIX-002 has none.
        instance("franky", "OP07-107"),
        instance("blank", "FIX-002"),
      ])
      .build();

    flipLifeTrigger(game);
    expect(effectOptions(game.state)).not.toContain("blank");
    pick(game, "franky");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["franky"]);
  });

  it("plays nothing at 3 Life", () => {
    const game = triggering("eb05-057-trigger-high")
      .withLife("p2", [
        instance("life-nojiko", "EB05-057"),
        ...copies(3, "FIX-001", "p2-life"),
      ])
      .withHand("p2", [instance("franky", "OP07-107")])
      .build();

    attack(game, "attacker", "p2-leader");
    declineDefence(game);
    // The Trigger would do nothing, so it is withheld rather than offered.
    expect(
      game.legalActions("p2").map((action) => action.summary),
    ).not.toContain("Activate Trigger");
  });
});

describe("EB05-059 Charlotte Pudding!!", () => {
  covers("EB05-059", "[Main]", "[Trigger]");

  it("draws, and protects 4000-base Big Mom Pirates from battle K.O. through the opponent's turn", () => {
    const game = table("eb05-059-main")
      .withHand("p1", [instance("pudding", "EB05-059")])
      .withDeckTop("p1", [instance("drawn", "FIX-001")])
      .withBoard("p1", [
        character("cracker", "OP17-104", { rested: true }),
        // FIX-002 is a 4000 of no type, so it is not protected.
        character("stranger", "FIX-002", { rested: true }),
      ])
      .withBoard("p2", [
        character("big", "OP05-065"),
        character("bigger", "OP12-045"),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    playEvent(game, "EB05-059");
    settle(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);

    game.pass();
    attack(game, "big", "cracker");
    declineDefence(game);
    attack(game, "bigger", "stranger");
    declineDefence(game);

    expect(ids(game.state.players.p1.board)).toEqual(["cracker"]);
  });

  it("plays a 4000-power [Trigger] Character after the draw as its [Trigger]", () => {
    const game = triggering("eb05-059-trigger")
      .withLife("p2", [instance("life-pudding", "EB05-059")])
      .withDeckTop("p2", [instance("daifuku", "OP17-107")])
      .withHand("p2", [instance("blank", "FIX-002")])
      .build();

    flipLifeTrigger(game);
    // The drawn OP17-107 Charlotte Daifuku is a 4000 with a [Trigger];
    // FIX-002 is a 4000 without one.
    expect(effectOptions(game.state)).not.toContain("blank");
    pick(game, "daifuku");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["daifuku"]);
  });
});

describe("EB05-060 Take Care of Lilith!!!", () => {
  covers("EB05-060", "[Main]");

  const lilith = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("lilith", "EB05-060")])
      .withBoard("p1", [
        // ST29-010 Franky is a vanilla 5-cost {Egghead}; OP07-108 Vega Force
        // 01 a vanilla 4-cost one.
        character("franky", "ST29-010"),
        character("vega", "OP07-108"),
      ])
      .withDeckTop("p1", [instance("top", "FIX-001")]);

  it("trashes a cost-5 Egghead Character to bank the top card of the deck", () => {
    const game = lilith("eb05-060-main").build();

    playEvent(game, "EB05-060");
    applyOptional(game);
    expect(effectOptions(game.state)).toContain("franky");
    expect(effectOptions(game.state)).not.toContain("vega");
    pick(game, "franky");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toContain("franky");
    expect(ids(game.state.players.p1.life)).toEqual(["top"]);
  });

  it("can be declined", () => {
    const game = lilith("eb05-060-decline").build();

    playEvent(game, "EB05-060");
    pick(game, "skip");

    expect(ids(game.state.players.p1.board)).toContain("franky");
    expect(game.state.players.p1.life).toEqual([]);
  });
});

describe("EB05-060 Take Care of Lilith!!!'s Counter", () => {
  covers("EB05-060", "[Counter]");

  it("turns the top Life card face-up for +4000 during this battle", () => {
    const game = counterStep("eb05-060-counter")
      .withHand("p1", [instance("lilith", "EB05-060")])
      .withLife("p1", [instance("top-life", "FIX-001")])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "lilith" });
    applyOptional(game);
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
  });

  it("cannot pay with a top Life card already face-up", () => {
    const game = counterStep("eb05-060-counter-face-up")
      .withHand("p1", [instance("lilith", "EB05-060")])
      .withLife("p1", [instance("top-life", "FIX-001", { faceUp: true })])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "lilith" });
    applyOptional(game);
    settle(game);

    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
  });
});
