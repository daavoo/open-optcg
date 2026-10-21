import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  reorderAction,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * Clause-by-clause tests for the OP11 Purple, Black and Yellow cards no other
 * file claims.
 *
 * The same shape as `test/op11-clauses.test.ts`: an ordinary ST31 vs ST32 game
 * on a bare table, with the OP11 card put into a hand, onto a board or into
 * Life, and each printed clause driven through the engine's own actions.
 */

const DECKS = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
] as const;

/** Vanilla bodies, one per cost step the clauses below draw a line at. */
const COST_2 = "ST31-003";
const COST_3 = "OP10-054";
const COST_4 = "ST32-004";
const COST_5 = "ST14-010";
const COST_7 = "OP10-050";

/** Leaders that carry the type or name a clause asks about. */
const IMPEL_DOWN_LEADER = "OP16-041"; // Buggy, {Impel Down}
const BIG_MOM_LEADER = "OP11-062"; // Charlotte Katakuri, {Big Mom Pirates}
const ROBIN_LEADER = "OP09-062"; // Nico Robin
const NAVY_LEADER = "OP12-040"; // Kuzan, {Navy}
const SHIRAHOSHI_LEADER = "OP11-022";

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

type Game = ReturnType<ReturnType<typeof table>["build"]>;

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

function resolveAll(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Takes `optionId` when it is on offer; an elided `optional` is skipped. */
function take(game: Game, ...optionIds: string[]): void {
  for (const optionId of optionIds) {
    if (effectOptions(game.state).includes(optionId)) {
      game.play({ type: "resolve-effect", optionId });
    }
  }
}

/**
 * Answers a top-or-bottom placement: `order` names the cards first to last,
 * and `atTop` is every card (all on top) or 0 (all underneath) -- the cards
 * all go to one end (Bandai's OP15-066#1).
 */
function placeInOrder(
  game: Game,
  order: readonly string[],
  atTop: number,
): void {
  const offer = game.action({ type: "resolve-effect" });
  if (offer.type !== "resolve-effect" || offer.option.kind !== "order") {
    throw new Error(`not a placement: ${offer.summary}`);
  }
  expect(offer.option.alternate).toBeDefined();
  const offered = offer.option.cards.map((card) => card.instanceId);
  expect([...offered].sort()).toEqual([...order].sort());
  game.submit(
    reorderAction(
      offer,
      order.map((id) => offered.indexOf(id)),
      atTop,
    ),
  );
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const hasActivation = (game: Game, name: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" && action.summary.includes(name),
    );

/** p2 swings `attacker` into p1's Leader and lets every step pass to damage. */
function swingIntoLife(game: Game): void {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
}

/** p1 swings `attacker` into p2's Leader and lets every step pass to damage. */
function hitTheirLife(game: Game, attacker = "attacker"): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: "p2-leader",
  });
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
}

describe("OP11-059 Gum-Gum King Cobra", () => {
  covers("OP11-059", "[Counter]", "[Trigger]");

  const countered = (seed: string, otherCards: number) => {
    const game = defending(seed)
      .withHand("p1", [
        instance("cobra", "OP11-059"),
        ...Array.from({ length: otherCards }, (_, index) =>
          instance(`h${index}`, COST_4),
        ),
      ])
      .withBoard("p2", [character("attacker", COST_4)])
      .withActiveAttack(ATTACK, "counter")
      .build();
    game.play({ type: "activate-counter-event", eventInstanceId: "cobra" });
    resolveAll(game);
    return game;
  };

  it("gives +4000 for the battle with 4 cards left in hand", () => {
    const game = countered("op11-059-four", 4);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    expect(ids(game.state.players.p1.trash)).toEqual(["cobra"]);
  });

  it("gives only +2000 with 5 cards left in hand", () => {
    const game = countered("op11-059-five", 5);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
  });

  it("returns a 2-cost Character to its owner's hand as its [Trigger]", () => {
    const game = defending("op11-059-trigger")
      .withLife("p1", [instance("life-cobra", "OP11-059")])
      .withBoard("p2", [
        character("attacker", COST_4),
        character("two", COST_2),
        character("three", COST_3),
      ])
      .build();

    swingIntoLife(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toContain("two");
    expect(effectOptions(game.state)).not.toContain("three");
    expect(effectOptions(game.state)).not.toContain("attacker");
    game.play({ type: "resolve-effect", optionId: "two" });
    resolveAll(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["two"]);
    expect(ids(game.state.players.p2.board).sort()).toEqual([
      "attacker",
      "three",
    ]);
  });
});

describe("OP11-063 Little Sadi", () => {
  covers("OP11-063", "[On Play]");

  it("pays DON!! -1 to rest a 3-cost Character behind an {Impel Down} Leader", () => {
    const game = table("op11-063")
      .withLeader("p1", IMPEL_DOWN_LEADER)
      .withHand("p1", [instance("sadi", "OP11-063")])
      .withBoard("p2", [character("three", COST_3), character("four", COST_4)])
      .build();
    const donDeckBefore = game.state.players.p1.donDeck.length;

    game.play({ type: "play-card", cardNumber: "OP11-063" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", summary: "active DON" });
    expect(effectOptions(game.state)).toContain("three");
    expect(effectOptions(game.state)).not.toContain("four");
    game.play({ type: "resolve-effect", optionId: "three" });
    resolveAll(game);

    expect(game.state.players.p1.donDeck.length).toBe(donDeckBefore + 1);
    const board = game.state.players.p2.board;
    expect(board.find((card) => card.instanceId === "three")?.rested).toBe(
      true,
    );
    expect(board.find((card) => card.instanceId === "four")?.rested).toBe(
      false,
    );
  });

  it("rests nothing behind a Leader without the type", () => {
    const game = table("op11-063-other")
      .withHand("p1", [instance("sadi", "OP11-063")])
      .withBoard("p2", [character("three", COST_3)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-063" });
    take(game, "apply");
    resolveAll(game);

    expect(game.state.players.p2.board[0]?.rested).toBe(false);
  });
});

describe("OP11-069 Charlotte Brulee", () => {
  covers("OP11-069", "[On Play]");

  it("adds a Life card to hand for an active DON!! behind a {Big Mom Pirates} Leader", () => {
    const game = table("op11-069")
      .withLeader("p1", BIG_MOM_LEADER)
      .withHand("p1", [instance("brulee", "OP11-069")])
      .withLife("p1", [instance("top", COST_2), instance("under", COST_4)])
      .withDonDeck("p1", 2)
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "play-card", cardNumber: "OP11-069" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["top"]);
    expect(ids(game.state.players.p1.life)).toEqual(["under"]);
    // 3 rested for Brulee, 1 added active.
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 3 + 1);
    expect(game.state.players.p1.donDeck.length).toBe(1);
  });

  it("can be declined, keeping the Life card", () => {
    const game = table("op11-069-decline")
      .withLeader("p1", BIG_MOM_LEADER)
      .withHand("p1", [instance("brulee", "OP11-069")])
      .withLife("p1", [instance("top", COST_2)])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-069" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p1.life)).toEqual(["top"]);
    expect(game.state.players.p1.donDeck.length).toBe(2);
  });

  it("adds no DON!! behind a Leader without the type", () => {
    const game = table("op11-069-other")
      .withHand("p1", [instance("brulee", "OP11-069")])
      .withLife("p1", [instance("top", COST_2)])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-069" });
    take(game, "apply");
    resolveAll(game);

    expect(game.state.players.p1.donDeck.length).toBe(2);
  });
});

describe("OP11-070 Charlotte Pudding", () => {
  covers("OP11-070", "[On Play]", "[Activate: Main]");

  it("adds a 2-cost or more {Big Mom Pirates} card from the top 5", () => {
    const game = table("op11-070-on-play")
      .withHand("p1", [instance("pudding", "OP11-070")])
      .withDeckTop("p1", [
        instance("brulee", "OP11-069"), // {Big Mom Pirates}, cost 3
        instance("another-pudding", "OP11-070"), // {Big Mom Pirates}, cost 1
        instance("brook", COST_2),
        instance("a", COST_4),
        instance("b", COST_4),
        instance("sixth", COST_4),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-070" });
    expect(effectOptions(game.state)).toContain("brulee");
    expect(effectOptions(game.state)).not.toContain("another-pudding");
    expect(effectOptions(game.state)).not.toContain("sixth");
    game.play({ type: "resolve-effect", optionId: "brulee" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["brulee"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("sixth");
    expect(ids(game.state.players.p1.deck.slice(-4)).sort()).toEqual(
      ["a", "another-pudding", "b", "brook"].sort(),
    );
  });

  it("pays DON!! -1 and rests itself to look at the top of p2's deck", () => {
    const game = table("op11-070-activate")
      .withBoard("p1", [character("pudding", "OP11-070")])
      .withDeckTop("p2", [instance("their-top", COST_4)])
      .build();
    const donDeckBefore = game.state.players.p1.donDeck.length;

    game.play({ type: "activate-main", sourceInstanceId: "pudding" });
    take(game, "apply");
    resolveAll(game);

    expect(game.state.players.p1.donDeck.length).toBe(donDeckBefore + 1);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    // Looked at, not moved.
    expect(game.state.players.p2.deck[0]?.instanceId).toBe("their-top");
    // Not once per turn, but the rest is a cost a rested Pudding cannot pay.
    expect(hasActivation(game, "Pudding")).toBe(false);
  });
});

describe("OP11-072 Charlotte Mont-d'or", () => {
  covers("OP11-072", "[Activate: Main]");

  it("has p2 bury 2 trash cards, then adds a Life card to hand", () => {
    const game = table("op11-072")
      .withBoard("p1", [character("montdor", "OP11-072")])
      .withLife("p1", [instance("top", COST_2), instance("under", COST_4)])
      .withTrash("p2", [
        instance("t1", COST_2),
        instance("t2", COST_3),
        instance("t3", COST_4),
      ])
      .build();
    const donDeckBefore = game.state.players.p1.donDeck.length;

    game.play({ type: "activate-main", sourceInstanceId: "montdor" });
    take(game, "apply");
    // p2 picks which two, and the order they go under in.
    expect(game.state.pendingEffect?.playerId).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "t3" });
    game.play({ type: "resolve-effect", optionId: "t1" });
    resolveAll(game);

    expect(game.state.players.p1.donDeck.length).toBe(donDeckBefore + 1);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(ids(game.state.players.p2.trash)).toEqual(["t2"]);
    expect(ids(game.state.players.p2.deck.slice(-2)).sort()).toEqual([
      "t1",
      "t3",
    ]);
    expect(ids(game.state.players.p1.hand)).toEqual(["top"]);
    expect(ids(game.state.players.p1.life)).toEqual(["under"]);
  });

  it("buries the one card p2 has and still adds the Life card", () => {
    const game = table("op11-072-one")
      .withBoard("p1", [character("montdor", "OP11-072")])
      .withLife("p1", [instance("top", COST_2)])
      .withTrash("p2", [instance("t1", COST_2)])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "montdor" });
    take(game, "apply");
    resolveAll(game);

    expect(game.state.players.p2.trash).toHaveLength(0);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("t1");
    expect(ids(game.state.players.p1.hand)).toEqual(["top"]);
  });

  it("is offered once per turn", () => {
    const game = table("op11-072-once")
      .withBoard("p1", [character("montdor", "OP11-072")])
      .withLife("p1", [instance("top", COST_2)])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "montdor" });
    take(game, "apply");
    resolveAll(game);

    expect(hasActivation(game, "Mont")).toBe(false);
  });
});

describe("OP11-075 Jaguar.D.Saul", () => {
  covers("OP11-075", "[On Play]", "[Trigger]");

  const deck = () => [instance("d1", COST_2), instance("d2", COST_4)];

  it("draws 2 behind [Nico Robin] with 7 DON!! on the field", () => {
    const game = table("op11-075")
      .withLeader("p1", ROBIN_LEADER)
      .withHand("p1", [instance("saul", "OP11-075")])
      .withDeckTop("p1", deck())
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-075" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["d1", "d2"]);
  });

  it("draws nothing with 6 DON!! on the field", () => {
    const game = table("op11-075-six")
      .withLeader("p1", ROBIN_LEADER)
      .withHand("p1", [instance("saul", "OP11-075")])
      .withDeckTop("p1", deck())
      .withDonDeck("p1", 4)
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-075" });
    resolveAll(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("draws nothing behind another Leader", () => {
    const game = table("op11-075-other")
      .withHand("p1", [instance("saul", "OP11-075")])
      .withDeckTop("p1", deck())
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-075" });
    resolveAll(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("runs the same clause as its [Trigger]", () => {
    const game = defending("op11-075-trigger")
      .withLeader("p1", ROBIN_LEADER)
      .withLife("p1", [instance("life-saul", "OP11-075")])
      .withDeckTop("p1", deck())
      .withBoard("p2", [character("attacker", COST_4)])
      .build();

    swingIntoLife(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["d1", "d2"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["life-saul"]);
  });
});

describe("OP11-076 Hannyabal", () => {
  covers("OP11-076", "[Blocker]", "[On Play]");

  it("plays a 3-cost or less {Impel Down} Character from hand behind an {Impel Down} Leader", () => {
    const game = table("op11-076")
      .withLeader("p1", IMPEL_DOWN_LEADER)
      .withHand("p1", [
        instance("hannyabal", "OP11-076"),
        instance("galdino", "ST30-014"), // {Impel Down}, cost 2
        instance("big", "OP16-056"), // {Impel Down}, cost 4
        instance("brook", COST_2), // cost 2, not {Impel Down}
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-076" });
    expect(effectOptions(game.state)).toContain("galdino");
    expect(effectOptions(game.state)).not.toContain("big");
    expect(effectOptions(game.state)).not.toContain("brook");
    game.play({ type: "resolve-effect", optionId: "galdino" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board).sort()).toEqual([
      "galdino",
      "hannyabal",
    ]);
  });

  it("plays nothing behind a Leader without the type", () => {
    const game = table("op11-076-other")
      .withHand("p1", [
        instance("hannyabal", "OP11-076"),
        instance("galdino", "ST30-014"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-076" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["hannyabal"]);
  });

  it("blocks an attack on its Leader", () => {
    const game = defending("op11-076-blocker")
      .withBoard("p1", [character("hannyabal", "OP11-076")])
      .withBoard("p2", [character("attacker", COST_4)])
      .withActiveAttack(ATTACK, "block")
      .build();

    expect(hasKeyword(game.state, "p1", "hannyabal", "Blocker")).toBe(true);
    game.play({ type: "block", blockerInstanceId: "hannyabal" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("hannyabal");
  });
});

describe("OP11-084 Kuzan", () => {
  covers("OP11-084", "[On Play]", "[When Attacking]");

  it("trashes the top 3 cards of the deck when played", () => {
    const game = table("op11-084-on-play")
      .withHand("p1", [instance("kuzan", "OP11-084")])
      .withDeckTop("p1", [
        instance("a", COST_2),
        instance("b", COST_3),
        instance("c", COST_4),
        instance("fourth", COST_4),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-084" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash).sort()).toEqual(["a", "b", "c"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("fourth");
  });

  it("lets its {Navy} Leader attack an active Character this turn", () => {
    const game = table("op11-084-attack")
      .withLeader("p1", NAVY_LEADER)
      .withBoard("p1", [character("kuzan", "OP11-084")])
      .withBoard("p2", [
        character("active", COST_2),
        character("blocker-free", COST_3, { rested: true }),
      ])
      .withLife("p2", [instance("their-life", COST_4)])
      .build();

    const leaderTargetsActive = () =>
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p1-leader" &&
            action.targetInstanceId === "active",
        );
    expect(leaderTargetsActive()).toBe(false);

    game.play({
      type: "attack",
      attackerInstanceId: "kuzan",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game.state)).toContain("p1-leader");
    // Not a {Navy} card on p2's side.
    expect(effectOptions(game.state)).not.toContain("active");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    resolveAll(game);
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    resolveAll(game);

    expect(leaderTargetsActive()).toBe(true);
  });
});

describe("OP11-085 Kurozumi Orochi", () => {
  covers("OP11-085", "[On Play]");

  it("adds a 5-cost or less {SMILE} card from the trash to hand", () => {
    const game = table("op11-085")
      .withHand("p1", [instance("orochi", "OP11-085")])
      .withTrash("p1", [
        instance("sarahebi", "OP11-087"), // {SMILE}, cost 5
        instance("mizerka", "OP12-092"), // {SMILE}, cost 6
        instance("brook", COST_2),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-085" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "sarahebi"]);
    game.play({ type: "resolve-effect", optionId: "sarahebi" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["sarahebi"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "brook",
      "mizerka",
    ]);
  });
});

describe("OP11-086 Coribou", () => {
  covers("OP11-086", "[On Play]", "[Activate: Main]");

  it("trashes 1 card from hand when played", () => {
    const game = table("op11-086-on-play")
      .withHand("p1", [
        instance("coribou", "OP11-086"),
        instance("a", COST_2),
        instance("b", COST_4),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-086" });
    // Mandatory: no way to decline.
    expect(effectOptions(game.state).sort()).toEqual(["a", "b"]);
    game.play({ type: "resolve-effect", optionId: "b" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["b"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["a"]);
  });

  it("trashes itself to play a 4-cost or less [Caribou] from the trash", () => {
    const game = table("op11-086-activate")
      .withBoard("p1", [character("coribou", "OP11-086")])
      .withTrash("p1", [
        instance("caribou-4", "OP07-023"), // [Caribou], cost 4
        instance("caribou-5", "OP17-101"), // [Caribou], cost 5
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "coribou" });
    take(game, "apply");
    expect(effectOptions(game.state)).toContain("caribou-4");
    expect(effectOptions(game.state)).not.toContain("caribou-5");
    game.play({ type: "resolve-effect", optionId: "caribou-4" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["caribou-4"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "caribou-5",
      "coribou",
    ]);
  });
});

describe("OP11-091 Berry Good", () => {
  covers("OP11-091", "[On Play]");

  it("has p2 place 3 Events from their trash at the bottom of their deck", () => {
    const game = table("op11-091")
      .withHand("p1", [instance("berry", "OP11-091")])
      .withTrash("p2", [
        instance("e1", "OP11-059"),
        instance("e2", "OP11-098"),
        instance("e3", "OP11-116"),
        instance("e4", "OP11-059"),
        instance("body", COST_4),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-091" });
    expect(game.state.pendingEffect?.playerId).toBe("p2");
    expect(effectOptions(game.state)).not.toContain("body");
    for (const id of ["e2", "e4", "e1"]) {
      game.play({ type: "resolve-effect", optionId: id });
    }
    resolveAll(game);

    expect(ids(game.state.players.p2.trash).sort()).toEqual(["body", "e3"]);
    expect(ids(game.state.players.p2.deck.slice(-3)).sort()).toEqual([
      "e1",
      "e2",
      "e4",
    ]);
  });

  it("places what there is when p2 has fewer than 3 Events", () => {
    const game = table("op11-091-two")
      .withHand("p1", [instance("berry", "OP11-091")])
      .withTrash("p2", [
        instance("e1", "OP11-059"),
        instance("e2", "OP11-098"),
        instance("body", COST_4),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-091" });
    // As many as possible (rule 8-4-4-1), and still p2's pick of the order.
    expect(game.state.pendingEffect?.playerId).toBe("p2");
    expect(effectOptions(game.state).sort()).toEqual(["e1", "e2"]);
    game.play({ type: "resolve-effect", optionId: "e2" });
    game.play({ type: "resolve-effect", optionId: "e1" });
    resolveAll(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["body"]);
    expect(ids(game.state.players.p2.deck.slice(-2)).sort()).toEqual([
      "e1",
      "e2",
    ]);
  });
});

describe("OP11-095 Monkey.D.Garp", () => {
  covers("OP11-095", "[On Play]");

  const garp = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("garp", "OP11-095")])
      .withTrash("p1", [
        instance("n1", "ST33-001"), // {Navy}
        instance("n2", "ST33-003"), // {Navy}
        instance("n3", "OP12-047"), // {Navy}
        instance("brook", COST_2),
      ])
      .withBoard("p2", [character("seven", COST_7), character("five", COST_5)]);

  it("buries 3 {Navy} cards, gives the Leader a rested DON!!, and K.O.s with a 9-cost Character out", () => {
    const game = garp("op11-095")
      .withBoard("p1", [character("zoro", "OP06-118")]) // cost 9
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-095" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    for (const id of ["n1", "n2", "n3"]) {
      game.play({ type: "resolve-effect", optionId: id });
    }
    expect(effectOptions(game.state)).toContain("seven");
    game.play({ type: "resolve-effect", optionId: "seven" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["brook"]);
    expect(ids(game.state.players.p1.deck.slice(-3)).sort()).toEqual([
      "n1",
      "n2",
      "n3",
    ]);
    // 8 rested to play Garp, one of them given to the Leader.
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(7);
    expect(ids(game.state.players.p2.board)).toEqual(["five"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["seven"]);
  });

  it("gives the DON!! but K.O.s nothing without a 9-cost Character", () => {
    const game = garp("op11-095-no-giant").build();

    game.play({ type: "play-card", cardNumber: "OP11-095" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    for (const id of ["n1", "n2", "n3"]) {
      game.play({ type: "resolve-effect", optionId: id });
    }
    resolveAll(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(ids(game.state.players.p2.board).sort()).toEqual(["five", "seven"]);
  });

  it("does nothing when declined", () => {
    const game = garp("op11-095-decline")
      .withBoard("p1", [character("zoro", "OP06-118")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-095" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    resolveAll(game);

    expect(game.state.players.p1.trash).toHaveLength(4);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(game.state.players.p2.board).toHaveLength(2);
  });
});

describe("OP11-098 Blue Hole", () => {
  covers("OP11-098", "[Main]", "[Trigger]");

  it("trashes the top 3 of the deck to K.O. a 2-cost or less Character", () => {
    const game = table("op11-098-main")
      .withHand("p1", [instance("hole", "OP11-098")])
      .withDeckTop("p1", [
        instance("a", COST_2),
        instance("b", COST_3),
        instance("c", COST_4),
        instance("fourth", COST_4),
      ])
      .withBoard("p2", [character("two", COST_2), character("three", COST_3)])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-098" });
    take(game, "apply");
    expect(effectOptions(game.state)).toContain("two");
    expect(effectOptions(game.state)).not.toContain("three");
    game.play({ type: "resolve-effect", optionId: "two" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "a",
      "b",
      "c",
      "hole",
    ]);
    expect(ids(game.state.players.p2.board)).toEqual(["three"]);
  });

  it("gives +1000 for the turn as its [Trigger]", () => {
    const game = defending("op11-098-trigger")
      .withLife("p1", [instance("life-hole", "OP11-098")])
      .withBoard("p1", [character("brook", COST_2)])
      .withBoard("p2", [character("attacker", COST_4)])
      .build();

    swingIntoLife(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "brook" });
    resolveAll(game);

    expect(currentPower(game.state, "p1", "brook")).toBe(4_000);
  });
});

describe("OP11-102 Camie", () => {
  covers("OP11-102", "[Your Turn]");

  const raid = (seed: string, theirLife: number) =>
    table(seed)
      .withBoard("p1", [
        character("camie", "OP11-102"),
        character("attacker", COST_5),
      ])
      .withLife("p1", [instance("mine-1", COST_2), instance("mine-2", COST_2)])
      .withLife(
        "p2",
        Array.from({ length: theirLife }, (_, index) =>
          instance(`theirs-${index}`, COST_4),
        ),
      );

  it("trashes the top Life card on each side when p2 activates a Counter Event", () => {
    const game = raid("op11-102-event", 3)
      .withHand("p2", [instance("cobra", "OP11-059")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "cobra" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["mine-1"]);
    expect(ids(game.state.players.p2.trash).sort()).toEqual([
      "cobra",
      "theirs-0",
    ]);
  });

  it("trashes the top Life card on each side when p2 activates a [Trigger]", () => {
    const game = raid("op11-102-trigger", 0)
      .withLife("p2", [
        instance("trigger", "OP11-098"), // Blue Hole, [Trigger]
        instance("theirs-1", COST_4),
        instance("theirs-2", COST_4),
      ])
      .build();

    hitTheirLife(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["mine-1"]);
    expect(ids(game.state.players.p2.trash).sort()).toEqual([
      "theirs-1",
      "trigger",
    ]);
    expect(ids(game.state.players.p2.life)).toEqual(["theirs-2"]);
  });

  it("does not answer an Event p2 activates on p2's own turn", () => {
    const game = defending("op11-102-their-turn")
      .withBoard("p1", [character("camie", "OP11-102")])
      .withLife("p1", [instance("mine-1", COST_2), instance("mine-2", COST_2)])
      .withLife("p2", [
        instance("theirs-1", COST_4),
        instance("theirs-2", COST_4),
      ])
      .withHand("p2", [instance("hole", "OP11-098")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-098" });
    take(game, "skip");
    resolveAll(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["hole"]);
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p2.life).toHaveLength(2);
  });

  it("does nothing when p2 has 1 Life card", () => {
    const game = raid("op11-102-one", 1)
      .withHand("p2", [instance("cobra", "OP11-059")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "cobra" });
    resolveAll(game);

    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(ids(game.state.players.p2.life)).toEqual(["theirs-0"]);
  });
});

describe("OP11-104 Shirley", () => {
  covers("OP11-104", "[Blocker]", "[On Play]");

  const shirley = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("shirley", "OP11-104")])
      .withLife("p1", [instance("life-1", COST_2, { faceUp: true })])
      .withDeckTop("p1", [
        instance("camie", "OP11-102"), // {Fish-Man Island}
        instance("brook", COST_2),
        instance("rayleigh", COST_4),
        instance("fourth", COST_4),
      ]);

  it("turns a Life card face-down, adds a {Fish-Man Island} card and buries the rest", () => {
    const game = shirley("op11-104").build();

    game.play({ type: "play-card", cardNumber: "OP11-104" });
    take(game, "apply");
    take(game, "life-1");
    expect(effectOptions(game.state)).toContain("camie");
    expect(effectOptions(game.state)).not.toContain("brook");
    game.play({ type: "resolve-effect", optionId: "camie" });
    // The rest all go to one end (Bandai's OP15-066#1); here, underneath.
    placeInOrder(game, ["rayleigh", "brook"], 0);

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    expect(ids(game.state.players.p1.hand)).toEqual(["camie"]);
    expect(ids(game.state.players.p1.deck.slice(0, 1))).toEqual(["fourth"]);
    expect(ids(game.state.players.p1.deck.slice(-2)).sort()).toEqual([
      "brook",
      "rayleigh",
    ]);
  });

  it("can keep both on top, in the order the player picks", () => {
    const bothOnTop = (order: string[]) => {
      const game = shirley("op11-104-top").build();
      game.play({ type: "play-card", cardNumber: "OP11-104" });
      take(game, "apply");
      take(game, "life-1");
      game.play({ type: "resolve-effect", optionId: "camie" });
      placeInOrder(game, order, 2);
      return ids(game.state.players.p1.deck.slice(0, 3));
    };

    const first = bothOnTop(["rayleigh", "brook"]);
    const second = bothOnTop(["brook", "rayleigh"]);
    expect(first.slice(0, 2).sort()).toEqual(["brook", "rayleigh"]);
    expect(first[2]).toBe("fourth");
    expect(second.slice(0, 2)).toEqual([...first.slice(0, 2)].reverse());
  });

  it("looks at nothing with no face-up Life card to turn", () => {
    const game = table("op11-104-face-down")
      .withHand("p1", [instance("shirley", "OP11-104")])
      .withLife("p1", [instance("life-1", COST_2)])
      .withDeckTop("p1", [instance("camie", "OP11-102")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-104" });
    resolveAll(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("camie");
  });

  it("blocks an attack on its Leader", () => {
    const game = defending("op11-104-blocker")
      .withBoard("p1", [character("shirley", "OP11-104")])
      .withBoard("p2", [character("attacker", COST_4)])
      .withActiveAttack(ATTACK, "block")
      .build();

    game.play({ type: "block", blockerInstanceId: "shirley" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("shirley");
  });
});

describe("OP11-109 Pappag", () => {
  covers("OP11-109", "[On Play]");

  it("draws 2 and trashes 2 with [Camie] on the field", () => {
    const game = table("op11-109")
      .withBoard("p1", [character("camie", "OP11-102")])
      .withHand("p1", [
        instance("pappag", "OP11-109"),
        instance("kept", COST_4),
      ])
      .withDeckTop("p1", [instance("d1", COST_2), instance("d2", COST_3)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-109" });
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "d1",
      "d2",
      "kept",
    ]);
    expect(effectOptions(game.state)).not.toContain("done");
    game.play({ type: "resolve-effect", optionId: "kept" });
    game.play({ type: "resolve-effect", optionId: "d1" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["d2"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["d1", "kept"]);
  });

  it("does nothing without [Camie]", () => {
    const game = table("op11-109-alone")
      .withHand("p1", [
        instance("pappag", "OP11-109"),
        instance("kept", COST_4),
      ])
      .withDeckTop("p1", [instance("d1", COST_2)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-109" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["kept"]);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });
});

describe("OP11-116 Merman Combat Ultramarine", () => {
  covers("OP11-116", "[Main]", "[Trigger]");

  it("adds a 6-cost or less Character to the top of its owner's Life face-up", () => {
    const game = table("op11-116-main")
      .withHand("p1", [instance("ultramarine", "OP11-116")])
      .withLife("p2", [instance("their-life", COST_4)])
      .withBoard("p2", [character("five", COST_5), character("seven", COST_7)])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-116" });
    expect(effectOptions(game.state)).toContain("five");
    expect(effectOptions(game.state)).not.toContain("seven");
    game.play({ type: "resolve-effect", optionId: "five" });
    game.play({ type: "resolve-effect", optionId: "top" });
    resolveAll(game);

    expect(ids(game.state.players.p2.life)).toEqual(["five", "their-life"]);
    expect(game.state.players.p2.life[0]?.faceUp).toBe(true);
    expect(ids(game.state.players.p2.board)).toEqual(["seven"]);
  });

  it("can add its controller's own Character to the bottom of their Life", () => {
    const game = table("op11-116-own")
      .withHand("p1", [instance("ultramarine", "OP11-116")])
      .withLife("p1", [instance("my-life", COST_4)])
      .withBoard("p1", [character("mine", COST_2)])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-116" });
    game.play({ type: "resolve-effect", optionId: "mine" });
    game.play({ type: "resolve-effect", optionId: "bottom" });
    resolveAll(game);

    expect(ids(game.state.players.p1.life)).toEqual(["my-life", "mine"]);
    expect(game.state.players.p1.life[1]?.faceUp).toBe(true);
  });

  it("adds a 4-cost or less opposing Character to their Life as its [Trigger]", () => {
    const game = defending("op11-116-trigger")
      .withLife("p1", [instance("life-ultramarine", "OP11-116")])
      .withBoard("p1", [character("mine", COST_2)])
      .withBoard("p2", [
        character("attacker", COST_4),
        character("five", COST_5),
      ])
      .build();

    swingIntoLife(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toContain("attacker");
    expect(effectOptions(game.state)).not.toContain("five");
    expect(effectOptions(game.state)).not.toContain("mine");
    game.play({ type: "resolve-effect", optionId: "attacker" });
    game.play({ type: "resolve-effect", optionId: "bottom" });
    resolveAll(game);

    expect(game.state.players.p2.life.at(-1)?.instanceId).toBe("attacker");
    expect(game.state.players.p2.life.at(-1)?.faceUp).toBe(true);
    expect(ids(game.state.players.p2.board)).toEqual(["five"]);
  });
});

describe("OP11-117 Fish-Man Island", () => {
  covers("OP11-117", "[Activate: Main]");

  const island = (seed: string) =>
    table(seed)
      .withLeader("p1", SHIRAHOSHI_LEADER)
      .withStage("p1", instance("island", "OP11-117"))
      .withLife("p1", [instance("life-1", COST_2), instance("life-2", COST_2)])
      .withBoard("p1", [
        character("neptunian", "OP11-027"), // {Neptunian}
        character("camie", "OP11-102"), // {Merfolk}
        character("surume", "OP11-032"), // {Animal}/{Fish-Man Island} only
      ]);

  it("turns a Life card face-up for +1000 on a {Neptunian}, {Fish-Man} or {Merfolk} Character", () => {
    const game = island("op11-117").build();

    game.play({ type: "activate-main", sourceInstanceId: "island" });
    take(game, "apply");
    take(game, "life-1");
    expect(effectOptions(game.state)).toContain("neptunian");
    expect(effectOptions(game.state)).toContain("camie");
    expect(effectOptions(game.state)).not.toContain("surume");
    game.play({ type: "resolve-effect", optionId: "neptunian" });
    resolveAll(game);

    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(currentPower(game.state, "p1", "neptunian")).toBe(7_000);
    expect(hasActivation(game, "Fish-Man Island")).toBe(false);
  });

  it("is not usable behind another Leader", () => {
    const game = table("op11-117-other")
      .withStage("p1", instance("island", "OP11-117"))
      .withLife("p1", [instance("life-1", COST_2)])
      .withBoard("p1", [character("neptunian", "OP11-027")])
      .build();

    if (hasActivation(game, "Fish-Man Island")) {
      game.play({ type: "activate-main", sourceInstanceId: "island" });
      take(game, "apply");
      resolveAll(game);
    }

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    expect(currentPower(game.state, "p1", "neptunian")).toBe(6_000);
  });
});
