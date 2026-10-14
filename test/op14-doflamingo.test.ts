import { describe, expect, it } from "vitest";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Purple) Donquixote Doflamingo feature deck, played through its own
 * list.
 *
 * Every other slot of the fifty is claimed by `test/op14.test.ts` and
 * `test/op12-rosinante-clauses.test.ts`; these are the clauses the list
 * brought into the coverage gate that no file drove: OP10-071's two halves
 * and OP10-078's search on both of its timings.
 */
const DECK = "(Purple) Donquixote Doflamingo - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

type Game = ReturnType<ReturnType<typeof table>["build"]>;

const effectOptions = (game: Game): string[] =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId?: string }).optionId ?? "");

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

/** p2 swings at p1's Leader with a 5000 body. */
const opponentAttacks = (game: Game) => {
  game.pass();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
};

describe("OP10-071 Donquixote Doflamingo", () => {
  covers("OP10-071", "[On Play]");

  it("returns a DON!! to play a 5-or-less Donquixote Pirates Character from hand", () => {
    const game = table("op10-071-on-play")
      .withHand("p1", [
        instance("doflamingo", "OP10-071"),
        instance("dellinger", "OP14-067"),
        // A {Donquixote Pirates} 6-cost: over the printed cap.
        instance("machvise", "OP14-073"),
      ])
      .build();
    const donDeckBefore = game.state.players.p1.donDeck.length;

    game.play({ type: "play-card", cardNumber: "OP10-071" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "return-don:rested" });

    expect(game.state.players.p1.donDeck).toHaveLength(donDeckBefore + 1);
    expect(effectOptions(game)).toContain("dellinger");
    expect(effectOptions(game)).not.toContain("machvise");
    game.play({ type: "resolve-effect", optionId: "dellinger" });

    expect(ids(game.state.players.p1.board)).toEqual([
      "doflamingo",
      "dellinger",
    ]);
    expect(ids(game.state.players.p1.hand)).toEqual(["machvise"]);
  });

  it("keeps its DON!! when the cost is declined", () => {
    const game = table("op10-071-on-play-skip")
      .withHand("p1", [
        instance("doflamingo", "OP10-071"),
        instance("dellinger", "OP14-067"),
      ])
      .build();
    const donDeckBefore = game.state.players.p1.donDeck.length;

    game.play({ type: "play-card", cardNumber: "OP10-071" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.donDeck).toHaveLength(donDeckBefore);
    expect(ids(game.state.players.p1.board)).toEqual(["doflamingo"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["dellinger"]);
  });
});

describe("OP10-071 Donquixote Doflamingo on the opponent's attack", () => {
  covers("OP10-071", "[On Your Opponent's Attack]");

  // Behind a Leader with no attack window of its own, so the Character's is
  // the only prompt the attack raises.
  const position = (seed: string) =>
    table(seed)
      .withLeader("p1", "ST31-001")
      .withBoard("p1", [character("doflamingo", "OP10-071")])
      .withBoard("p2", [
        character("attacker", "ST32-002"),
        character("second", "ST32-002"),
      ])
      .withDonDeck("p1", 2)
      // Vanilla Life, so the first hit reveals no [Trigger].
      .withLife("p1", copies(2, "OP14-073", "life"))
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"));

  it("rests a DON!! to add an active one from the DON!! deck", () => {
    const game = position("op10-071-attack").build();
    opponentAttacks(game);
    const before = game.state.players.p1;
    const active = before.activeDon.length;
    const rested = before.restedDon.length;
    const deck = before.donDeck.length;

    game.play({ type: "resolve-effect", optionId: "apply" });

    const after = game.state.players.p1;
    expect(after.restedDon).toHaveLength(rested + 1);
    // One rested for the cost, one added active: the count stands.
    expect(after.activeDon).toHaveLength(active);
    expect(after.donDeck).toHaveLength(deck - 1);
  });

  it("is once per turn", () => {
    const game = position("op10-071-attack-once").build();
    opponentAttacks(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    expect(game.state.phase).toBe("main");

    game.play({
      type: "attack",
      attackerInstanceId: "second",
      targetInstanceId: "p1-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
  });

  it("can be declined, and nothing moves", () => {
    const game = position("op10-071-attack-skip").build();
    opponentAttacks(game);
    const before = game.state.players.p1;
    const active = before.activeDon.length;
    const deck = before.donDeck.length;

    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.activeDon).toHaveLength(active);
    expect(game.state.players.p1.donDeck).toHaveLength(deck);
  });
});

describe("OP10-078 I Do Not Forgive Those Who Laugh at My Family!!!", () => {
  covers("OP10-078", "[Main]", "[Counter]");

  const topThree = [
    // Another copy is {Donquixote Pirates} too, and the only card the search
    // may not take.
    instance("copy", "OP10-078"),
    instance("dellinger", "OP14-067"),
    instance("outsider", "ST32-005"),
    instance("fourth", "OP14-073"),
  ];

  it("[Main] adds a Donquixote Pirates card from the top three, not another copy", () => {
    const game = table("op10-078-main")
      .withHand("p1", [instance("event", "OP10-078")])
      .withDeckTop("p1", topThree)
      .build();

    game.play({ type: "activate-main", cardNumber: "OP10-078" });
    const offered = effectOptions(game);
    expect(offered).toContain("dellinger");
    expect(offered).not.toContain("copy");
    expect(offered).not.toContain("outsider");
    // The fourth card is not in the look.
    expect(offered).not.toContain("fourth");
    game.play({ type: "resolve-effect", optionId: "dellinger" });
    while (game.state.pendingEffect) {
      game.submit(
        game.legalActions().find((action) => action.type === "resolve-effect")!,
      );
    }

    expect(ids(game.state.players.p1.hand)).toEqual(["dellinger"]);
    const deck = ids(game.state.players.p1.deck);
    expect(deck[0]).toBe("fourth");
    expect(deck.slice(-2).sort()).toEqual(["copy", "outsider"]);
  });

  it("[Counter] runs the same search mid-battle", () => {
    const game = table("op10-078-counter")
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withHand("p1", [instance("event", "OP10-078")])
      .withDeckTop("p1", topThree)
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();

    opponentAttacks(game);
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    expect(effectOptions(game)).not.toContain("copy");
    game.play({ type: "resolve-effect", optionId: "dellinger" });
    while (game.state.pendingEffect) {
      game.submit(
        game.legalActions().find((action) => action.type === "resolve-effect")!,
      );
    }

    expect(ids(game.state.players.p1.hand)).toEqual(["dellinger"]);
    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
    expect(ids(game.state.players.p1.trash)).toContain("event");
  });
});

describe("OP14-060's redirect with OP14-068 Trebol on the board", () => {
  covers("OP14-060", "[On Your Opponent's Attack]");
  covers("OP14-068", "[Opponent's Turn]");

  // The deck's defensive loop: the redirect's DON!! -1 is a DON!! returned on
  // the opponent's turn, which is what Trebol answers.
  const position = (seed: string) =>
    table(seed)
      .withBoard("p1", [character("trebol", "OP14-068")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"));

  it("gets the DON!! the redirect returned back, rested", () => {
    const game = position("op14-060-trebol").build();
    opponentAttacks(game);
    const active = game.state.players.p1.activeDon.length;
    const rested = game.state.players.p1.restedDon.length;
    const deck = game.state.players.p1.donDeck.length;

    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.events).toContainEqual(
      expect.objectContaining({
        type: "don-added",
        rested: true,
        sourceCardNumber: "OP14-068",
      }),
    );
    game.play({ type: "resolve-effect", optionId: "trebol" });

    const after = game.state.players.p1;
    expect(game.state.activeAttack?.targetInstanceId).toBe("trebol");
    expect(after.activeDon).toHaveLength(active - 1);
    expect(after.restedDon).toHaveLength(rested + 1);
    expect(after.donDeck).toHaveLength(deck);
  });

  it("does not let the DON!! Trebol added be the one that paid", () => {
    // Every DON!! was active when the cost was paid. The rested one Trebol
    // hands back arrived because of the payment, so the controller has no
    // choice of pile to make -- re-homing the return onto it would make the
    // redirect free.
    const game = position("op14-060-trebol-rehome").build();
    opponentAttacks(game);

    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(effectOptions(game)).not.toContain("return-don:rested");
    expect(effectOptions(game)).toContain("trebol");
  });
});
