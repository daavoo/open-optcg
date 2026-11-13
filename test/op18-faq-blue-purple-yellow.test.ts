import { describe, expect, it } from "vitest";
import { currentPower, getLegalActions } from "@one-piece-sim/engine-core";
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
 * Bandai's OP-18 card Q&A for the Blue, Purple and Yellow cards, one `it` per
 * ruling, named by its Q number. Rulings an existing card test already pins
 * are not repeated here.
 *
 * Bodies used for their printed facts alone:
 *  - OP18-043 Accelegator: vanilla Baroque Works, cost 4, 6000.
 *  - OP10-050: a vanilla 9000 to attack with.
 *  - OP10-031 / OP10-089: vanilla cost 5 / cost 6 bodies.
 *  - OP11-003: a vanilla {Straw Hat Crew}; OP18-073: a vanilla {Water Seven}.
 *  - FIX-001 / FIX-002: vanilla fixtures with no type the cards read.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase on a bare table, ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 acting, so p1 is the one answering. */
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
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardIds = (game: Game, player: "p1" | "p2") =>
  ids(game.state.players[player].board);

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

describe("OP18-041 Ms. All Sunday (Q1522, Q1523)", () => {
  covers("OP18-041", "static");

  const leaderDefends = (seed: string, p2Hand: string[]) =>
    defending(seed)
      .withLeader("p1", "OP18-041")
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .withHand(
        "p2",
        p2Hand.map((cardNumber, index) => instance(`p2-${index}`, cardNumber)),
      )
      .withBoard("p2", [character("attacker", "OP10-050")])
      .withBoard("p1", [character("gator", "OP18-043", { rested: true })])
      .build();

  it("Q1522: still draws when the opponent's hand is empty, and the opponent does nothing", () => {
    const game = leaderDefends("op18-faq-1522", []);

    attack(game, "attacker", "gator");
    declineDefence(game);

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.trash)).toEqual(["gator"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expect(game.state.players.p2.trash).toEqual([]);
  });

  it("Q1523: the draw and the opponent's trash are not optional", () => {
    const game = leaderDefends("op18-faq-1523", ["FIX-001", "FIX-002"]);

    attack(game, "attacker", "gator");
    declineDefence(game);

    // p1 is never asked: the card is drawn and the discard is already p2's.
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expect(game.state.activePlayer).toBe("p2");
    expect(effectOptions(game.state)).toEqual(["p2-0", "p2-1"]);
    pick(game, "p2-0");

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-0"]);
  });
});

describe("OP18-046 Mr.0 & Ms. All Sunday (Q1525)", () => {
  covers("OP18-046", "[On Play]");

  it("Q1525: chooses 0, 1 or 2 rested DON!! for each card independently", () => {
    const game = table("op18-faq-1525")
      .withHand("p1", [instance("mr0", "OP18-046")])
      .withBoard("p1", [character("a", "FIX-002"), character("b", "FIX-002")])
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-046" });
    const rested = game.state.players.p1.restedDon.length;
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["leader-0", "leader-1", "leader-2"]),
    );
    pick(game, "leader-1");
    // Two each to Character a, one to Character b, none to Mr.0.
    pick(game, "a");
    pick(game, "done");
    expect(effectOptions(game.state)).not.toContain("a");
    pick(game, "b");
    pick(game, "done");

    expect(game.state.pendingEffect).toBeNull();
    const p1 = game.state.players.p1;
    expect(ids(p1.hand)).toEqual(["deck-1", "deck-2"]);
    expect(p1.leaderAttachedDon).toHaveLength(1);
    expect(
      Object.fromEntries(
        p1.board.map((card) => [
          card.instanceId,
          card.attachedDon?.length ?? 0,
        ]),
      ),
    ).toEqual({ a: 2, b: 1, mr0: 0 });
    expect(p1.restedDon).toHaveLength(rested - 4);
  });

  it("Q1525: may give none at all", () => {
    const game = table("op18-faq-1525-none")
      .withHand("p1", [instance("mr0", "OP18-046")])
      .withBoard("p1", [character("a", "FIX-002")])
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-046" });
    const rested = game.state.players.p1.restedDon.length;
    pick(game, "leader-0");
    pick(game, "done");
    pick(game, "done");

    expect(game.state.pendingEffect).toBeNull();
    const p1 = game.state.players.p1;
    expect(p1.leaderAttachedDon).toHaveLength(0);
    for (const card of p1.board) expect(card.attachedDon).toHaveLength(0);
    expect(p1.restedDon).toHaveLength(rested);
  });
});

describe("OP18-051 Mr.4 & Miss.MerryChristmas (Q1526)", () => {
  covers("OP18-051", "[On Play]");

  it("Q1526: buries one of its own Characters and one of the opponent's, each under its owner's deck", () => {
    const game = table("op18-faq-1526")
      .withHand("p1", [instance("mr4", "OP18-051")])
      .withBoard("p1", [character("own", "OP10-089")])
      .withBoard("p2", [character("five", "OP10-031")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-051" });
    pick(game, "apply");
    pick(game, "own");
    pick(game, "five");
    settle(game);

    expect(boardIds(game, "p1")).toEqual(["mr4"]);
    expect(boardIds(game, "p2")).toEqual([]);
    expect(ids(game.state.players.p1.deck).at(-1)).toBe("own");
    expect(ids(game.state.players.p2.deck).at(-1)).toBe("five");
  });
});

describe("OP18-054 Mr.8 & Ms. Monday (Q1527)", () => {
  covers("OP18-054", "[Opponent's Turn]");

  it("Q1527: saves itself from the opponent's effect by trashing a card", () => {
    // OP09-058 Special Muggy Ball: a cost-6-or-less bounce.
    const game = defending("op18-faq-1527")
      .withBoard("p1", [character("mr8", "OP18-054")])
      .withHand("p1", [instance("fodder", "FIX-001")])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ summary: "Activate Special Muggy Ball" });
    pick(game, "mr8");
    expect(game.state.activePlayer).toBe("p1");
    expect(effectOptions(game.state)).toContain("replace:mr8");
    pick(game, "replace:mr8");
    settle(game);

    expect(boardIds(game, "p1")).toEqual(["mr8"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
  });
});

describe("OP18-056 Mr.13 & Ms.Friday (Q1528)", () => {
  covers("OP18-056", "[On Play]");

  it("Q1528: may pay with another copy of itself already on the field, never the one just played", () => {
    const game = table("op18-faq-1528")
      .withHand("p1", [instance("mr13", "OP18-056")])
      .withBoard("p1", [character("mr13-old", "OP18-056")])
      .withHand("p2", [instance("p2-a", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-056" });
    pick(game, "apply");
    expect(effectOptions(game.state)).toEqual(["mr13-old"]);
    pick(game, "mr13-old");
    expect(game.state.activePlayer).toBe("p2");
    pick(game, "p2-a");
    settle(game);

    expect(boardIds(game, "p1")).toEqual(["mr13"]);
    expect(ids(game.state.players.p1.deck).at(-1)).toBe("mr13-old");
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-a"]);
  });
});

describe("OP18-071 Trebol (Q1530)", () => {
  covers("OP18-071", "static");

  it("Q1530: returns 1 DON!! instead of itself leaving to the opponent's effect", () => {
    // OP10-046 Kyros: an [On Play] K.O.
    const game = defending("op18-faq-1530")
      .withBoard("p1", [character("trebol", "OP18-071")])
      .withHand("p2", [instance("kyros", "OP10-046")])
      .build();
    const don = (state: GameState) => {
      const p = state.players.p1;
      return (
        p.activeDon.length +
        p.restedDon.length +
        p.leaderAttachedDon.length +
        p.board.reduce((sum, card) => sum + (card.attachedDon?.length ?? 0), 0)
      );
    };
    const before = don(game.state);

    game.play({ type: "play-card", cardNumber: "OP10-046" });
    pick(game, "trebol");
    expect(effectOptions(game.state)).toContain("replace:trebol");
    pick(game, "replace:trebol");
    while (game.state.pendingEffect) {
      const option = effectOptions(game.state).find((id) =>
        id.startsWith("return-don:"),
      );
      game.play(
        option
          ? { type: "resolve-effect", optionId: option }
          : { type: "resolve-effect" },
      );
    }

    expect(boardIds(game, "p1")).toEqual(["trebol"]);
    expect(don(game.state)).toBe(before - 1);
  });
});

describe("OP18-076 Shark Submerge 3 (Q1531)", () => {
  covers("OP18-076", "[On Your Opponent's Attack]");

  it("Q1531: a 6000 Leader brought down to 5000 by an effect qualifies", () => {
    // OP13-002 is a 6000 Leader; EB05-001 Jewelry Bonney's [Activate: Main]
    // gives it −1000 before p2 attacks.
    const game = defending("op18-faq-1531")
      .withLeader("p1", "OP13-002")
      .withStage("p1", instance("shark", "OP18-076"))
      .withBoard("p2", [
        character("bonney", "EB05-001", { playedTurn: 1 }),
        character("attacker", "OP10-050", { playedTurn: 1 }),
      ])
      .build();
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(6000);

    game.play({ type: "activate-main", sourceCardNumber: "EB05-001" });
    pick(game, "p1-leader");
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(5000);

    attack(game, "attacker", "p1-leader");
    pick(game, "apply");
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "p1-leader", false)).toBe(6000);
  });
});

describe("OP18-078 Mini-Merry (Q1532)", () => {
  covers("OP18-078", "[Activate: Main]");

  it("Q1532: gives to at most 4 cards in total across the Leader and Characters", () => {
    const game = table("op18-faq-1532")
      .withStage("p1", instance("merry", "OP18-078"))
      .withBoard("p1", [
        character("a", "OP11-003"),
        character("b", "OP11-003"),
        character("c", "OP18-073"),
        character("d", "OP18-073"),
      ])
      .withDon("p1", { rested: 6 })
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP18-078" });
    pick(game, "p1-leader");
    pick(game, "a");
    pick(game, "b");
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["c", "d"]),
    );
    pick(game, "c");
    // The fourth pick closes the choice: Character d is never a fifth.
    expect(game.state.pendingEffect).toBeNull();

    const p1 = game.state.players.p1;
    expect(p1.leaderAttachedDon).toHaveLength(1);
    expect(
      Object.fromEntries(
        p1.board.map((card) => [
          card.instanceId,
          card.attachedDon?.length ?? 0,
        ]),
      ),
    ).toEqual({ a: 1, b: 1, c: 1, d: 0 });
    expect(p1.restedDon).toHaveLength(2);
  });
});

describe("OP18-117 Buster Call (Q1539)", () => {
  covers("OP18-117", "[Main]");

  it("Q1539: with no Life cards it resolves to nothing, so it is not offered", () => {
    const game = table("op18-faq-1539")
      .withLeader("p1", "OP18-079")
      .withLife("p1", [])
      .withHand("p1", [instance("buster", "OP18-117")])
      .withBoard("p1", [character("mine", "OP18-102")])
      .withDeckTop("p1", [instance("onigumo", "OP18-098")])
      .withTrash("p1", [instance("momonga", "OP18-111")])
      .withBoard("p2", [character("theirs", "OP18-113")])
      .build();

    // Bandai lets the Event be cast for nothing; the engine withholds an Event
    // whose only outcome is spending its cost, so the ruling's "nothing
    // happens" is the absence of the offer. The board, the deck and the trash
    // are untouched either way -- no wipe, no Vice Admirals.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "OP18-117",
        ),
    ).toBe(false);
    expect(boardIds(game, "p1")).toEqual(["mine"]);
    expect(boardIds(game, "p2")).toEqual(["theirs"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["momonga"]);
  });

  it("Q1539: is offered while there is Life to trash", () => {
    const game = table("op18-faq-1539-life")
      .withLeader("p1", "OP18-079")
      .withLife("p1", [instance("life-0", "FIX-001")])
      .withHand("p1", [instance("buster", "OP18-117")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP18-117" });
    expect(effectOptions(game.state)).toContain("skip");
  });
});
