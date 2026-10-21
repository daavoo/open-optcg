import { describe, expect, it } from "vitest";
import {
  getLegalActions,
  hasKeyword,
  reorderAction,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * Clause-by-clause tests for OP11 cards no other file claims.
 *
 * The same shape as `test/op11.test.ts`: an ordinary ST31 vs ST32 game on a
 * bare table, with the OP11 card put into a hand, onto a board or into Life,
 * and each printed clause driven through the engine's own actions.
 */

const DECKS = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
] as const;

/** p1's Main Phase. */
const table = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2's Main Phase, for the clauses that answer p2's attacks. */
const defending = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

const ATTACK = {
  attackerPlayerId: "p2",
  defenderPlayerId: "p1",
  attackerInstanceId: "attacker",
  targetInstanceId: "p1-leader",
  attackPower: 5000,
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

/**
 * Answers a top-or-bottom placement with a caller-composed order: `atTop` is
 * every card (all on top) or 0 (all underneath) -- the cards all go to one end
 * (Bandai's OP15-066#1).
 */
function placeInOrder(
  game: {
    action: (matcher: { type: "resolve-effect" }) => LegalAction;
    submit: (action: LegalAction) => unknown;
  },
  order: readonly number[],
  atTop: number,
): void {
  game.submit(
    reorderAction(game.action({ type: "resolve-effect" }), order, atTop),
  );
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

/** p2 swings `attacker` into p1's Leader and lets every step pass to damage. */
function swingIntoLife(game: {
  state: GameState;
  play: (matcher: Record<string, unknown>) => unknown;
  pass: () => unknown;
}): void {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
}

describe("OP11-037 Ancient Weapon Poseidon", () => {
  covers("OP11-037", "[Main]", "[Trigger]");

  it("adds a {Neptunian} or {Fish-Man Island} Character and bottoms the rest", () => {
    const game = table("op11-037-main")
      .withHand("p1", [instance("poseidon", "OP11-037")])
      .withDeckTop("p1", [
        instance("neptunian", "OP11-026"), // {Neptunian} Character
        instance("fishman", "OP11-024"), // {Fish-Man Island} Character
        instance("event", "OP11-039"), // {Fish-Man Island}, but an Event
        instance("other", "ST32-004"),
        instance("fifth", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-037" });
    // Four looked at, so the fifth card is not on offer; the Event shares the
    // type but is not a Character.
    expect(effectOptions(game.state).sort()).toEqual(
      ["done", "fishman", "neptunian"].sort(),
    );
    game.play({ type: "resolve-effect", optionId: "neptunian" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["neptunian"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("fifth");
    expect(ids(game.state.players.p1.deck.slice(-3)).sort()).toEqual(
      ["event", "fishman", "other"].sort(),
    );
    expect(ids(game.state.players.p1.trash)).toEqual(["poseidon"]);
  });

  it("draws 1 card as its [Trigger]", () => {
    const game = defending("op11-037-trigger")
      .withLife("p1", [instance("life-poseidon", "OP11-037")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    swingIntoLife(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["life-poseidon"]);
  });
});

describe('OP11-060 "Let\'s Crash This Wedding!!!"', () => {
  covers("OP11-060", "[Main]", "[Trigger]");

  const wedding = () => [
    instance("other-wedding", "OP11-060"), // {Straw Hat Crew}, but its own name
    instance("brook", "ST31-003"), // {Straw Hat Crew}
    instance("rayleigh", "ST32-004"),
    instance("filler-a", "ST32-004"),
    instance("filler-b", "ST32-004"),
    instance("sixth", "ST31-003"),
  ];

  it("searches 5 for a {Straw Hat Crew} card other than itself behind a multicolored Leader", () => {
    const game = table("op11-060-main")
      .withLeader("p1", "OP11-040") // Blue/Purple
      .withHand("p1", [instance("wedding", "OP11-060")])
      .withDeckTop("p1", wedding())
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-060" });
    expect(effectOptions(game.state).sort()).toEqual(["brook", "done"]);
    game.play({ type: "resolve-effect", optionId: "brook" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["brook"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("sixth");
    expect(ids(game.state.players.p1.deck.slice(-4)).sort()).toEqual(
      ["filler-a", "filler-b", "other-wedding", "rayleigh"].sort(),
    );
  });

  it("is not offered behind a single-colour Leader, where it would do nothing", () => {
    const game = table("op11-060-mono")
      .withHand("p1", [instance("wedding", "OP11-060")])
      .withDeckTop("p1", wedding())
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("Wedding"),
        ),
    ).toBe(false);
  });

  it("runs the same search as its [Trigger]", () => {
    const game = defending("op11-060-trigger")
      .withLeader("p1", "OP11-040")
      .withLife("p1", [instance("life-wedding", "OP11-060")])
      .withDeckTop("p1", wedding())
      .withBoard("p2", [character("attacker", "ST32-004")])
      // 6000 into OP11-040's 6000, so the hit lands.
      .withGivenDon("p2", "attacker", 1)
      .build();

    swingIntoLife(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toContain("brook");
    game.play({ type: "resolve-effect", optionId: "brook" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["brook"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("sixth");
  });
});

describe("OP11-083 Caribou", () => {
  covers("OP11-083", "[On Play]", "[Blocker]");

  it("trashes 2 cards from hand when played", () => {
    const game = table("op11-083-on-play")
      .withHand("p1", [
        instance("caribou", "OP11-083"),
        instance("a", "ST31-003"),
        instance("b", "ST32-004"),
        instance("c", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-083" });
    // Mandatory: no way to decline the cost.
    expect(effectOptions(game.state)).not.toContain("done");
    expect(effectOptions(game.state)).not.toContain("skip");
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash).sort()).toEqual(["a", "b"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["c"]);
    expect(ids(game.state.players.p1.board)).toEqual(["caribou"]);
  });

  it("blocks an attack on its Leader", () => {
    const game = defending("op11-083-blocker")
      .withBoard("p1", [character("caribou", "OP11-083")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "block")
      .build();

    game.play({ type: "block", blockerInstanceId: "caribou" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("caribou");
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
  });
});

describe("OP11-054 Nami", () => {
  covers("OP11-054", "[On Play]", "[Blocker]");

  it("draws 3 and puts 2 cards from hand back behind a multicolored Leader", () => {
    const game = table("op11-054-on-play")
      .withLeader("p1", "OP11-040")
      .withHand("p1", [instance("nami", "OP11-054")])
      .withDeckTop("p1", [
        instance("d1", "ST31-003"),
        instance("d2", "ST32-004"),
        instance("d3", "OP11-026"),
        instance("rest", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-054" });
    expect(ids(game.state.players.p1.hand).sort()).toEqual(["d1", "d2", "d3"]);
    // Exactly 2: the cost is not "up to".
    expect(effectOptions(game.state)).not.toContain("done");
    game.play({ type: "resolve-effect", optionId: "d1" });
    game.play({ type: "resolve-effect", optionId: "d3" });
    // Both go to the same end; here, underneath.
    placeInOrder(game, [1, 0], 0);

    expect(ids(game.state.players.p1.hand)).toEqual(["d2"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("rest");
    expect(ids(game.state.players.p1.deck.slice(-2)).sort()).toEqual([
      "d1",
      "d3",
    ]);
  });

  it("can put both cards on top, in the order the player picks", () => {
    const game = table("op11-054-top")
      .withLeader("p1", "OP11-040")
      .withHand("p1", [instance("nami", "OP11-054")])
      .withDeckTop("p1", [
        instance("d1", "ST31-003"),
        instance("d2", "ST32-004"),
        instance("d3", "OP11-026"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-054" });
    game.play({ type: "resolve-effect", optionId: "d1" });
    game.play({ type: "resolve-effect", optionId: "d3" });
    placeInOrder(game, [0, 1], 2);
    const first = ids(game.state.players.p1.deck.slice(0, 2));

    const reversed = table("op11-054-top")
      .withLeader("p1", "OP11-040")
      .withHand("p1", [instance("nami", "OP11-054")])
      .withDeckTop("p1", [
        instance("d1", "ST31-003"),
        instance("d2", "ST32-004"),
        instance("d3", "OP11-026"),
      ])
      .build();
    reversed.play({ type: "play-card", cardNumber: "OP11-054" });
    reversed.play({ type: "resolve-effect", optionId: "d1" });
    reversed.play({ type: "resolve-effect", optionId: "d3" });
    placeInOrder(reversed, [1, 0], 2);

    expect(first.sort()).toEqual(["d1", "d3"]);
    expect(ids(reversed.state.players.p1.deck.slice(0, 2))).toEqual(
      [...ids(game.state.players.p1.deck.slice(0, 2))].reverse(),
    );
  });

  it("draws nothing behind a single-colour Leader", () => {
    const game = table("op11-054-mono")
      .withHand("p1", [instance("nami", "OP11-054")])
      .withDeckTop("p1", [instance("d1", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-054" });
    resolveAll(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("d1");
  });

  it("blocks an attack on its Leader", () => {
    const game = defending("op11-054-blocker")
      .withBoard("p1", [character("nami", "OP11-054")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "block")
      .build();

    game.play({ type: "block", blockerInstanceId: "nami" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("nami");
  });
});

describe("OP11-049 Carrot", () => {
  covers("OP11-049", "[On Play]", "[On Your Opponent's Attack]");

  it("looks at 3 and places them at the top or bottom", () => {
    const game = table("op11-049-on-play")
      .withHand("p1", [instance("carrot", "OP11-049")])
      .withDeckTop("p1", [
        instance("a", "ST31-003"),
        instance("b", "ST32-004"),
        instance("c", "OP11-026"),
        instance("fourth", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-049" });
    // Nothing is added to hand: the only decision is where each card goes.
    expect(
      effectOptions(game.state).every((id) => id.startsWith("order:")),
    ).toBe(true);
    // The three go to one end: a split point past the last card names no
    // placement, and one between them divides the cards.
    const offer = game.action({ type: "resolve-effect" });
    expect(() => reorderAction(offer, [0, 1, 2], 4)).toThrow(/INVALID_SPLIT/);
    expect(() => reorderAction(offer, [0, 1, 2], 1)).toThrow(/INVALID_SPLIT/);
    for (const split of ["|4", "|1"]) {
      expect(() =>
        game.submit({
          ...offer,
          actionId: offer.actionId.replace(/\|\d+$/, split),
        }),
      ).toThrow();
    }
    // All three underneath, "c" first.
    placeInOrder(game, [2, 0, 1], 0);

    const deck = ids(game.state.players.p1.deck);
    expect(deck[0]).toBe("fourth");
    expect(deck.slice(-3).sort()).toEqual(["a", "b", "c"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("trashes itself for +1000 on its Leader during the battle", () => {
    const game = defending("op11-049-attack")
      .withBoard("p1", [character("carrot", "OP11-049")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    resolveAll(game);

    expect(game.state.activeAttack?.counterPower).toBe(1_000);
    expect(ids(game.state.players.p1.board)).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(["carrot"]);
  });

  it("stays on the field when the offer is declined", () => {
    const game = defending("op11-049-decline")
      .withBoard("p1", [character("carrot", "OP11-049")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(ids(game.state.players.p1.board)).toEqual(["carrot"]);
  });

  it("is not offered when a Character is the one attacked", () => {
    const game = defending("op11-049-character")
      .withBoard("p1", [
        character("carrot", "OP11-049"),
        character("target", "ST31-003", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "target",
    });

    expect(effectOptions(game.state)).not.toContain("apply");
    expect(ids(game.state.players.p1.board)).toContain("carrot");
  });
});

describe("OP11-073 Charlotte Linlin", () => {
  covers("OP11-073", "static", "[On Your Opponent's Attack]");

  it("has [Rush] behind a {Big Mom Pirates} Leader and not behind another", () => {
    const bigMom = table("op11-073-rush")
      .withLeader("p1", "OP11-062") // Charlotte Katakuri, {Big Mom Pirates}
      .withBoard("p1", [character("linlin", "OP11-073", { playedTurn: 11 })])
      .withBoard("p2", [character("target", "ST32-004", { rested: true })])
      .build();
    expect(hasKeyword(bigMom.state, "p1", "linlin", "Rush")).toBe(true);
    expect(
      bigMom
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "linlin",
        ),
    ).toBe(true);

    const other = table("op11-073-no-rush")
      .withBoard("p1", [character("linlin", "OP11-073", { playedTurn: 11 })])
      .build();
    expect(hasKeyword(other.state, "p1", "linlin", "Rush")).toBe(false);
    expect(
      other
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "linlin",
        ),
    ).toBe(false);
  });

  const attacked = (seed: string) => {
    const game = defending(seed)
      .withBoard("p1", [character("linlin", "OP11-073")])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("second", "ST32-004"),
      ])
      // ST32-004 Silvers Rayleigh costs 4.
      .withDeckTop("p2", [instance("their-top", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    return game;
  };

  it("pays DON!! -5 and gives the Leader +2000 for the turn on a correct guess", () => {
    const game = attacked("op11-073-hit");
    const donBefore = game.state.players.p1.donDeck.length;

    expect(effectOptions(game.state)).toContain("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "cost-4" });
    resolveAll(game);

    expect(game.state.players.p1.donDeck.length).toBe(donBefore + 5);
    expect(
      game.state.players.p1.leaderPowerModifiers.map((m) => m.amount),
    ).toEqual([2_000]);
    // Revealed, not drawn: the card stays on top of p2's deck.
    expect(game.state.players.p2.deck[0]?.instanceId).toBe("their-top");
  });

  it("spends the DON!! and gives nothing on a wrong guess", () => {
    const game = attacked("op11-073-miss");
    const donBefore = game.state.players.p1.donDeck.length;

    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "cost-5" });
    resolveAll(game);

    expect(game.state.players.p1.donDeck.length).toBe(donBefore + 5);
    expect(game.state.players.p1.leaderPowerModifiers).toHaveLength(0);
  });

  it("is offered once per turn", () => {
    const game = attacked("op11-073-once");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "cost-4" });
    resolveAll(game);
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    game.play({
      type: "attack",
      attackerInstanceId: "second",
      targetInstanceId: "p1-leader",
    });
    expect(effectOptions(game.state)).not.toContain("apply");
  });

  it("is not offered with fewer than 5 DON!! on the field", () => {
    const game = defending("op11-073-short")
      .withBoard("p1", [character("linlin", "OP11-073")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDonDeck("p1", 6)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(effectOptions(game.state)).not.toContain("apply");
  });
});

describe("OP11-080 Gear Two", () => {
  covers("OP11-080", "[Main]", "[Counter]");

  it("rests 2 DON!! to add a rested DON!! behind a blue Leader", () => {
    const game = table("op11-080-main")
      .withLeader("p1", "OP11-040") // Blue/Purple
      .withHand("p1", [instance("gear", "OP11-080")])
      .withDonDeck("p1", 2)
      .build();
    const before = {
      active: game.state.players.p1.activeDon.length,
      rested: game.state.players.p1.restedDon.length,
      deck: game.state.players.p1.donDeck.length,
    };

    const offer = game.action({
      type: "activate-main",
      cardNumber: "OP11-080",
    });
    expect(offer.summary).toContain("Gear Two");
    game.submit(offer);
    resolveAll(game);

    // 1 for the Event, 2 rested as the cost, 1 added rested.
    expect(game.state.players.p1.activeDon.length).toBe(before.active - 3);
    expect(game.state.players.p1.restedDon.length).toBe(before.rested + 4);
    expect(game.state.players.p1.donDeck.length).toBe(before.deck - 1);
  });

  it("is not offered behind a Leader without blue, where it would add nothing", () => {
    const game = table("op11-080-red")
      .withHand("p1", [instance("gear", "OP11-080")])
      .withDonDeck("p1", 2)
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("Gear Two"),
        ),
    ).toBe(false);
  });

  it("gives its Leader +3000 for the battle as a [Counter]", () => {
    const game = defending("op11-080-counter")
      .withHand("p1", [instance("gear", "OP11-080")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event" });
    resolveAll(game);

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(ids(game.state.players.p1.trash)).toEqual(["gear"]);
  });
});

describe("OP11-114 Gum-Gum Fire-Fist Pistol Red Hawk", () => {
  covers("OP11-114", "[Main]", "[Counter]");

  const withLife = (seed: string, mine: number, theirs: number) =>
    table(seed)
      .withHand("p1", [instance("hawk", "OP11-114")])
      .withLife(
        "p1",
        Array.from({ length: mine }, (_, i) =>
          instance(`p1-life-${i}`, "ST31-003"),
        ),
      )
      .withLife(
        "p2",
        Array.from({ length: theirs }, (_, i) =>
          instance(`p2-life-${i}`, "ST32-004"),
        ),
      )
      .withBoard("p2", [
        character("five", "OP10-101"), // base cost 5
        character("six", "OP11-055"), // base cost 6
      ]);

  it("rests 3 DON!! to K.O. a base-cost-5 Character at 5 combined Life", () => {
    const game = withLife("op11-114-main", 2, 3).build();
    const activeBefore = game.state.players.p1.activeDon.length;

    const offer = game.action({
      type: "activate-main",
      cardNumber: "OP11-114",
    });
    expect(offer.summary).toContain("Red Hawk");
    game.submit(offer);
    expect(effectOptions(game.state)).toContain("five");
    expect(effectOptions(game.state)).not.toContain("six");
    game.play({ type: "resolve-effect", optionId: "five" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["six"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["five"]);
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 4);
  });

  it("is not offered at 4 combined Life, where it would K.O. nothing", () => {
    const game = withLife("op11-114-low", 2, 2).build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("Red Hawk"),
        ),
    ).toBe(false);
  });

  it("gives its Leader +3000 for the battle as a [Counter]", () => {
    const game = defending("op11-114-counter")
      .withHand("p1", [instance("hawk", "OP11-114")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event" });
    resolveAll(game);

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
  });
});

describe('OP11-101 Capone"Gang"Bege', () => {
  covers("OP11-101", "[Blocker]", "static");

  /** p1 holds Bege and a {Supernovas} body; p2 aims OP11-114's K.O. at one. */
  const hawked = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("hawk", "OP11-114")])
      .withLife("p1", [
        instance("p1-life-1", "ST31-003"),
        instance("p1-life-2", "ST31-003"),
        instance("p1-life-3", "ST31-003"),
      ])
      .withLife("p2", [
        instance("p2-life-1", "ST32-004"),
        instance("p2-life-2", "ST32-004"),
      ])
      .withBoard("p2", [
        character("bege", "OP11-101"),
        character("urouge", "OP10-101"), // {Supernovas}, cost 5
        character("rayleigh", "ST32-004"), // no {Supernovas}
      ]);

  const replaceOption = (game: { state: GameState }) =>
    effectOptions(game.state).find((option) => option.startsWith("replace:"));

  it("puts a {Supernovas} Character on top of its Life face-down instead of being K.O.'d", () => {
    const game = hawked("op11-101-redirect").build();

    game.play({ type: "activate-main", cardNumber: "OP11-114" });
    game.play({ type: "resolve-effect", optionId: "urouge" });
    // The replacement is p2's to take: "you may".
    expect(game.state.activePlayer).toBe("p2");
    const replace = replaceOption(game);
    expect(replace).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replace! });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["bege", "rayleigh"]);
    expect(game.state.players.p2.trash).toHaveLength(0);
    expect(game.state.players.p2.life[0]).toMatchObject({
      instanceId: "urouge",
    });
    expect(game.state.players.p2.life[0]?.faceUp).toBeFalsy();
    expect(game.state.players.p2.life).toHaveLength(3);
  });

  it("answers once per turn", () => {
    const game = table("op11-101-once")
      .withHand("p1", [
        instance("hawk-1", "OP11-114"),
        instance("hawk-2", "OP11-114"),
      ])
      .withLife("p1", [
        instance("p1-life-1", "ST31-003"),
        instance("p1-life-2", "ST31-003"),
        instance("p1-life-3", "ST31-003"),
      ])
      .withLife("p2", [
        instance("p2-life-1", "ST32-004"),
        instance("p2-life-2", "ST32-004"),
      ])
      .withBoard("p2", [
        character("bege", "OP11-101"),
        character("urouge", "OP10-101"),
        character("apoo", "OP14-008"), // {Supernovas}, cost 3
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-114" });
    game.play({ type: "resolve-effect", optionId: "urouge" });
    game.play({ type: "resolve-effect", optionId: replaceOption(game)! });
    resolveAll(game);
    expect(game.state.players.p2.life[0]?.instanceId).toBe("urouge");

    game.play({ type: "activate-main", cardNumber: "OP11-114" });
    game.play({ type: "resolve-effect", optionId: "apoo" });
    expect(replaceOption(game)).toBeUndefined();
    resolveAll(game);
    expect(ids(game.state.players.p2.trash)).toEqual(["apoo"]);
  });

  it("lets the K.O. through when declined", () => {
    const game = hawked("op11-101-decline").build();

    game.play({ type: "activate-main", cardNumber: "OP11-114" });
    game.play({ type: "resolve-effect", optionId: "urouge" });
    const knockOut = effectOptions(game.state).find(
      (option) => !option.startsWith("replace:"),
    );
    game.play({ type: "resolve-effect", optionId: knockOut! });
    resolveAll(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["urouge"]);
    expect(game.state.players.p2.life).toHaveLength(2);
  });

  it("does not protect Bege itself, nor a Character without {Supernovas}", () => {
    for (const target of ["bege", "rayleigh"]) {
      const game = hawked(`op11-101-${target}`).build();
      game.play({ type: "activate-main", cardNumber: "OP11-114" });
      game.play({ type: "resolve-effect", optionId: target });

      expect(replaceOption(game)).toBeUndefined();
      resolveAll(game);
      expect(ids(game.state.players.p2.trash)).toEqual([target]);
    }
  });

  it("does not answer a K.O. in battle", () => {
    const game = table("op11-101-battle")
      .withBoard("p1", [character("attacker", "OP11-055")]) // 7000
      .withBoard("p2", [
        character("bege", "OP11-101"),
        character("urouge", "OP10-101", { rested: true }), // 7000
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "urouge",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      expect(replaceOption(game)).toBeUndefined();
      game.pass();
    }
    expect(replaceOption(game)).toBeUndefined();
    resolveAll(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["urouge"]);
  });

  it("blocks an attack on its Leader", () => {
    const game = defending("op11-101-blocker")
      .withBoard("p1", [character("bege", "OP11-101")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "block")
      .build();

    game.play({ type: "block", blockerInstanceId: "bege" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("bege");
  });
});

describe("OP11-118 Monkey.D.Luffy", () => {
  covers("OP11-118", "[Rush]", "[When Attacking]");

  const swinging = (seed: string, hand = [instance("fodder", "ST31-003")]) =>
    table(seed)
      .withBoard("p1", [
        // Played this turn: only [Rush] lets it attack.
        character("luffy", "OP11-118", { playedTurn: 11 }),
        character("own-small", "ST31-003"), // cost 2, p1's own
      ])
      .withHand("p1", hand)
      .withBoard("p2", [
        character("small", "ST32-004"), // cost 4
        character("big", "OP11-055"), // cost 6
      ])
      .withDon("p1", { rested: 2 })
      .build();

  it("attacks the turn it is played", () => {
    const game = swinging("op11-118-rush");

    expect(hasKeyword(game.state, "p1", "luffy", "Rush")).toBe(true);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "luffy",
        ),
    ).toBe(true);
  });

  it("trashes 1 card to return a cost-4 Character, then gives a rested DON!!", () => {
    const game = swinging("op11-118-attack");
    const restedBefore = game.state.players.p1.restedDon.length;

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    // Either side's Characters at cost 4 or less; Luffy itself is cost 8.
    expect(effectOptions(game.state).sort()).toEqual(
      ["done", "own-small", "small"].sort(),
    );
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["small"]);
    expect(ids(game.state.players.p2.board)).toEqual(["big"]);
    expect(game.state.players.p1.restedDon.length).toBe(restedBefore - 1);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("still gives the DON!! when no Character is returned", () => {
    const game = swinging("op11-118-no-return");

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "done" });
    game.play({ type: "resolve-effect", optionId: "luffy" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["small", "big"]);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "luffy")
        ?.attachedDon,
    ).toHaveLength(1);
  });

  it("does nothing when the cost is declined", () => {
    const game = swinging("op11-118-decline");

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p1.hand)).toEqual(["fodder"]);
    expect(ids(game.state.players.p2.board)).toEqual(["small", "big"]);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
  });
});

describe("OP11-040 Monkey.D.Luffy", () => {
  covers("OP11-040", "static");

  const deckTop = () => [
    instance("hit", "ST31-003"), // {Straw Hat Crew}
    instance("miss-a", "ST32-004"),
    instance("miss-b", "OP11-026"),
    instance("miss-c", "ST32-004"),
    instance("miss-d", "OP11-026"),
    instance("sixth", "ST32-004"),
  ];

  /** p1 ends turn 11 and p2 ends turn 12, so p1's turn 13 is starting. */
  const nextTurn = (seed: string, fieldDon = 10) => {
    const game = table(seed)
      .withLeader("p1", "OP11-040")
      .withDeckTop("p1", deckTop())
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .withDonDeck("p1", 10 - fieldDon)
      .build();
    game.pass();
    game.pass();
    return game;
  };

  it("searches 5 for a {Straw Hat Crew} card at the start of the turn, before the draw", () => {
    const game = nextTurn("op11-040-search");

    expect(game.state.turn).toBe(13);
    expect(game.state.activePlayer).toBe("p1");
    // Asked before the Refresh Phase: nothing has been drawn yet.
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });

    // Five looked at, and only the {Straw Hat Crew} one can be added.
    expect(effectOptions(game.state).sort()).toEqual(["done", "hit"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    // The four misses all go underneath, in the order picked.
    placeInOrder(game, [2, 0, 1, 3], 0);

    expect(game.state.pendingEffect).toBeNull();
    // Then the turn goes on: the draw takes "sixth" off the top.
    expect(ids(game.state.players.p1.hand)).toEqual(["hit", "sixth"]);
    expect(ids(game.state.players.p1.deck.slice(-4)).sort()).toEqual([
      "miss-a",
      "miss-b",
      "miss-c",
      "miss-d",
    ]);
    expect(game.state.phase).toBe("main");
    expect(game.legalActions().some((action) => action.type === "pass")).toBe(
      true,
    );
  });

  it("may be declined, and the turn starts as usual", () => {
    const game = nextTurn("op11-040-decline");

    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.hand)).toEqual(["hit"]);
    expect(ids(game.state.players.p1.deck.slice(0, 5))).toEqual(
      ids(deckTop()).slice(1),
    );
  });

  it("asks nothing with 7 DON!! on the field", () => {
    const game = nextTurn("op11-040-seven", 7);

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.hand)).toEqual(["hit"]);
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(9);
  });

  it("is asked at 8 DON!! on the field", () => {
    const game = nextTurn("op11-040-eight", 8);

    expect(effectOptions(game.state)).toContain("apply");
  });

  it("is not asked at the start of the opponent's turn", () => {
    const game = table("op11-040-opponent")
      .withLeader("p1", "OP11-040")
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.pass();

    expect(game.state.turn).toBe(12);
    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-draw"]);
  });
});
