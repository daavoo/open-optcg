import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
  observe,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-17, one case per ruling, named by the Q&A id
 * (`<card>#<n>`, in the order the PDF prints them). The OP-17 PDF also carries
 * one new ruling each for OP16-040 and OP16-048, which are indexed here too.
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. Many of these rulings were already pinned by a
 * card test; those cases say where, and stay here as the index entry. A
 * ruling the engine disagrees with is an `it.fails` that says what the engine
 * does instead.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op-17.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 * Empty while every OP-17 ruling has one.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

/** The sealed-format Leader treated as a card with all names and types. */
const ALL_NAMES_LEADER = "SEALED-LUFFY";

/** A bare table on turn 5, `active` to act, every DON!! active. */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario().seed(seed).atTurn(5, { active }).bareTable();

function offers(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

function attack(game: Game, attacker: string, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
}

/** Declines every optional offer of whatever effect is open. */
function settleBySkipping(game: Game): void {
  while (game.state.pendingEffect) {
    game.play({ type: "resolve-effect", optionId: "skip" });
  }
}

/** Passes the Block and Counter steps with no defence. */
function undefended(game: Game): void {
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    game.pass();
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

/** The cost targeting and "cost N or less" read off a card on the board. */
function costOf(game: Game, player: "p1" | "p2", instanceId: string): number {
  const card = game.state.players[player].board.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (!card) throw new Error(`${player} has no board card ${instanceId}`);
  return effectiveCost(game.state, player, card);
}

/** p2 casts OP09-018 Get Out of Here! at `targets` on p1's board. */
function getOutOfHere(game: Game, targets: readonly string[]): void {
  game.play({ summary: "Activate Get Out of Here!" });
  for (const target of targets) {
    game.play({ type: "resolve-effect", optionId: target });
  }
  if (game.player === "p2" && game.state.pendingEffect) {
    game.play({ type: "resolve-effect", optionId: "done" });
  }
}

/** p2 casts OP09-058 Special Muggy Ball, returning `target` to hand. */
function muggyBall(game: Game, target: string): void {
  game.play({ summary: "Activate Special Muggy Ball" });
  game.play({ type: "resolve-effect", optionId: target });
}

describe("FAQ OP-17 red", () => {
  it("OP17-001#1: the Newgate Leader cannot buy +4000 with an empty hand", () => {
    // Trashing a card is the cost; with none to trash the ability is not
    // offered at all. Pinned too by test/op17.test.ts "is not offered with an
    // empty hand" (OP17-072, the same shape).
    const build = (hand: number) =>
      table(`faq-op17-001-1-${hand}`, "p2")
        .withLeader("p1", "OP17-001")
        .withHand("p1", copies(hand, "FIX-001", "p1-hand"))
        .withBoard("p2", [character("attacker", "ST31-002")])
        .build();

    const empty = build(0);
    attack(empty, "attacker", "p1-leader");
    expect(empty.state.pendingEffect).toBeNull();

    const one = build(1);
    attack(one, "attacker", "p1-leader");
    expect(one.state.pendingEffect?.sourceCardNumber).toBe("OP17-001");
  });

  it("OP17-005#1: 'monocolored Leader' is a Leader of exactly one colour", () => {
    // test/op17.test.ts "OP17-005 Edward.Newgate On Play" pins both halves.
    const play = (leader: string) => {
      const game = table(`faq-op17-005-1-${leader}`)
        .withLeader("p1", leader)
        .withHand("p1", [instance("newgate", "OP17-005")])
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-005" });
      settle(game);
      return currentPower(game.state, "p1", "p1-leader");
    };
    expect(play("OP17-001")).toBe(8000); // red only
    expect(play("OP13-004")).toBe(5000); // multicoloured Sabo
  });

  /**
   * p1's EB04-004 Zeff attacks, setting p1's Leader's base power to 7000
   * until the end of p2's next End Phase; the battle is then let through.
   */
  const zeffSetsSeven = (seed: string, leader: string, hand: string) => {
    const game = table(seed)
      .withLeader("p1", leader)
      .withBoard("p1", [character("zeff", "EB04-004")])
      .withHand("p1", [instance("setter", hand)])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();
    attack(game, "zeff", "p2-leader");
    settle(game);
    undefended(game);
    while (game.state.phase === "trigger") game.pass();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
    return game;
  };

  it("OP17-008#1: Jozu over a 7000 base-power setter leaves the Leader at 8000", () => {
    // Two base-power setters compete and the highest applies.
    const game = zeffSetsSeven("faq-op17-008-1", "OP17-001", "OP17-008");
    game.play({ type: "play-card", cardNumber: "OP17-008" });
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8000);
  });

  it("OP17-010#1: Fossa grants nothing under a Leader with every card name", () => {
    // Also pinned by test/op17-qa-names-and-taunt.test.ts.
    const build = (leader?: string) => {
      const setup = table(`faq-op17-010-1-${leader ?? "plain"}`)
        .withBoard("p1", [character("fossa", "OP17-010")])
        .withBoard("p2", [character("big", "OP17-064")]); // 10000 power
      return (leader ? setup.withLeader("p1", leader) : setup).build();
    };
    for (const [leader, granted] of [
      [ALL_NAMES_LEADER, false],
      [undefined, true],
    ] as const) {
      const game = build(leader);
      game.play(
        (action) =>
          action.type === "activate-main" && action.actionId.includes("fossa"),
      );
      settle(game);
      expect(hasKeyword(game.state, "p1", "fossa", "Blocker")).toBe(granted);
      expect(currentPower(game.state, "p1", "fossa")).toBe(
        granted ? 5000 : 3000,
      );
    }
  });

  describe("OP17-015 Marco", () => {
    it("OP17-015#1: K.O.ing Marco in place of a removal that takes Marco and another together saves the other", () => {
      // test/op17-replacements.test.ts covers the same replacement for two
      // other Characters. p2's OP08-077 Conquest of the Sea K.O.s up to 2
      // cost-6-or-less Characters at once under a {Big Mom Pirates} Leader.
      const game = table("faq-op17-015-1", "p2")
        .withLeader("p2", "OP17-099")
        .withHand("p2", [instance("conquest", "OP08-077")])
        .withBoard("p1", [
          character("fossa", "OP17-010"),
          character("marco", "OP17-015"),
        ])
        .build();

      game.play({ type: "activate-main", sourceCardNumber: "OP08-077" });
      while (game.player === "p2" && game.state.pendingEffect) {
        const options = offers(game, "p2");
        game.play({
          type: "resolve-effect",
          optionId:
            ["apply", "fossa", "marco"].find((id) => options.includes(id)) ??
            options[0],
        });
      }
      expect(offers(game)).toContain("replace:marco");
      game.play({ type: "resolve-effect", optionId: "replace:marco" });
      while (game.state.pendingEffect && game.player === "p1") {
        // Marco's own [On K.O.] asks for a card it cannot pay.
        game.play({ type: "resolve-effect" });
      }

      expect(ids(game.state.players.p1.board)).toEqual(["fossa"]);
      expect(ids(game.state.players.p1.trash)).toEqual(["marco"]);
    });

    it("OP17-015#2: Marco answers a bounce, and a bottom-deck, of itself by being K.O.'d", () => {
      const bounced = table("faq-op17-015-2-bounce", "p2")
        .withHand("p2", [instance("muggy", "OP09-058")])
        .withBoard("p1", [character("marco", "OP17-015")])
        .build();
      muggyBall(bounced, "marco");
      expect(offers(bounced)).toContain("replace:marco");
      bounced.play({ type: "resolve-effect", optionId: "replace:marco" });
      while (bounced.state.pendingEffect && bounced.player === "p1") {
        bounced.play({ type: "resolve-effect" });
      }
      expect(ids(bounced.state.players.p1.hand)).toEqual([]);
      expect(ids(bounced.state.players.p1.trash)).toEqual(["marco"]);

      // OP17-046 Gloriosa bottoms a cost-5-or-less Character from either
      // board.
      const bottomed = table("faq-op17-015-2-bottom", "p2")
        .withHand("p2", [instance("gloriosa", "OP17-046")])
        .withBoard("p1", [character("marco", "OP17-015")])
        .build();
      bottomed.play({ type: "play-card", cardNumber: "OP17-046" });
      bottomed.play({
        type: "resolve-effect",
        summary: "Bottom your opponent's cost-5-or-less Character",
      });
      bottomed.play({ type: "resolve-effect", optionId: "marco" });
      expect(offers(bottomed)).toContain("replace:marco");
      bottomed.play({ type: "resolve-effect", optionId: "replace:marco" });
      while (bottomed.state.pendingEffect && bottomed.player === "p1") {
        bottomed.play({ type: "resolve-effect" });
      }
      expect(ids(bottomed.state.players.p1.deck)).toEqual([]);
      expect(ids(bottomed.state.players.p1.trash)).toEqual(["marco"]);
    });
  });
});

describe("FAQ OP-17 green", () => {
  it("OP17-020#1: the Shanks Leader pays by resting a DON!! with an empty hand", () => {
    const game = table("faq-op17-020-1")
      .withLeader("p1", "OP17-020")
      .withBoard("p2", [character("target", "ST31-002", { rested: true })])
      .build();
    expect(game.state.players.p1.hand).toEqual([]);

    game.play(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === "p1-leader",
    );
    game.play({ type: "resolve-effect", optionId: "don" });
    if (offers(game).includes("target")) {
      game.play({ type: "resolve-effect", optionId: "target" });
    }

    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(
      game.state.players.p2.board[0]?.cannotRefreshUntilTurn,
    ).toBeDefined();
  });

  describe("OP17-021 Crone Oli", () => {
    /** p2's OP17-009 Haruta K.O.s `target` on p1's board. */
    const haruta = (seed: string, board: ReturnType<typeof character>[]) => {
      const game = table(seed, "p2")
        .withHand("p2", [instance("haruta", "OP17-009")])
        .withBoard("p1", board)
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-009" });
      return game;
    };

    it("OP17-021#1: Oli's replacement answers a removal of Oli herself", () => {
      // Also pinned by test/op17-replacements.test.ts.
      const game = haruta("faq-op17-021-1", [
        character("oli", "OP17-021"),
        character("fugar", "OP17-026"),
      ]);
      game.play({ type: "resolve-effect", optionId: "oli" });
      expect(offers(game)).toContain("replace:oli");
      game.play({ type: "resolve-effect", optionId: "replace:oli" });
      game.play({ type: "resolve-effect", optionId: "fugar" });
      expect(ids(game.state.players.p1.board)).toEqual(["oli", "fugar"]);
    });

    it("OP17-021#2: Oli may rest herself as the card the replacement rests", () => {
      const game = haruta("faq-op17-021-2", [character("oli", "OP17-021")]);
      game.play({ type: "resolve-effect", optionId: "oli" });
      game.play({ type: "resolve-effect", optionId: "replace:oli" });
      if (game.player === "p1" && game.state.pendingEffect) {
        expect(offers(game)).toContain("oli");
        game.play({ type: "resolve-effect", optionId: "oli" });
      }
      expect(game.state.players.p1.board).toEqual([
        expect.objectContaining({ instanceId: "oli", rested: true }),
      ]);
    });

    it("OP17-021#3: one rest saves two {Red-Haired Pirates} Characters removed together", () => {
      // Also pinned by test/op17-replacements.test.ts (Q&A Q3).
      const game = table("faq-op17-021-3", "p2")
        .withHand("p2", [instance("gooh", "OP09-018")])
        .withBoard("p1", [
          character("oli", "OP17-021"),
          character("fugar", "OP17-026"),
          character("spare", "OP17-006"),
        ])
        .build();
      getOutOfHere(game, ["oli", "fugar"]);
      game.play({ type: "resolve-effect", optionId: "replace:oli" });
      game.play({ type: "resolve-effect", optionId: "spare" });

      expect(game.state.pendingEffect).toBeNull();
      expect(ids(game.state.players.p1.board)).toEqual([
        "oli",
        "fugar",
        "spare",
      ]);
      expect(
        game.state.players.p1.board.filter((card) => card.rested),
      ).toHaveLength(1);
    });
  });

  describe("OP17-023 Nami", () => {
    it("OP17-023#1: Nami rests herself in place of her own K.O.", () => {
      // Also pinned by test/op17-replacements.test.ts.
      const game = table("faq-op17-023-1", "p2")
        .withHand("p2", [instance("haruta", "OP17-009")])
        .withBoard("p1", [character("nami", "OP17-023")])
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-009" });
      game.play({ type: "resolve-effect", optionId: "nami" });
      game.play({ type: "resolve-effect", optionId: "replace:nami" });
      expect(game.state.players.p1.board).toEqual([
        expect.objectContaining({ instanceId: "nami", rested: true }),
      ]);
    });

    it("OP17-023#2: one rest of Nami saves two Characters K.O.'d together", () => {
      // Also pinned by test/op17-replacements.test.ts (Q&A Q2).
      const game = table("faq-op17-023-2", "p2")
        .withHand("p2", [instance("gooh", "OP09-018")])
        .withBoard("p1", [
          character("nami", "OP17-023"),
          character("sanji", "OP17-082"),
        ])
        .build();
      getOutOfHere(game, ["nami", "sanji"]);
      game.play({ type: "resolve-effect", optionId: "replace:nami" });
      expect(game.state.pendingEffect).toBeNull();
      expect(ids(game.state.players.p1.board)).toEqual(["nami", "sanji"]);
    });
  });

  it("OP17-034#1: Rockstar leaves the Leader's base power alone while the opponent's Leader is under 6000", () => {
    // The condition gates the whole effect, so the engine withholds the
    // activation; test/op17.test.ts "is not offered while the opponent's
    // Leader is under 6000 power" pins the same.
    const game = table("faq-op17-034-1")
      .withLeader("p1", "OP17-020")
      .withBoard("p1", [character("rockstar", "OP17-034")])
      .withDon("p1", { rested: 1 })
      .build();
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(5000);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "rockstar",
        ),
    ).toBe(false);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });
});

describe("FAQ OP-17 blue", () => {
  describe("OP17-039 Rocks.D.Xebec", () => {
    const xebec = (seed: string, top: string) => {
      const game = table(seed)
        .withLeader("p1", "OP17-039")
        .withHand("p1", [instance("pitch", "FIX-001")])
        .withDeckTop("p1", [
          instance("revealed", top),
          instance("second", "FIX-002"),
          instance("third", "FIX-002"),
        ])
        .build();
      attack(game, "p1-leader", "p2-leader");
      game.play({ type: "resolve-effect", optionId: "apply" });
      game.play({ type: "resolve-effect", optionId: "pitch" });
      settle(game);
      return game;
    };

    it("OP17-039#1: a {Rocks Pirates} reveal is drawn as one of the 2 cards", () => {
      const game = xebec("faq-op17-039-1-rocks", "OP17-045");
      expect(ids(game.state.players.p1.hand)).toEqual(["revealed", "second"]);
      expect(ids(game.state.players.p1.deck)).toEqual(["third"]);
    });

    it("OP17-039#1: any other reveal goes back on top of the deck", () => {
      const game = xebec("faq-op17-039-1-other", "FIX-001");
      expect(game.state.players.p1.hand).toEqual([]);
      expect(ids(game.state.players.p1.deck)).toEqual([
        "revealed",
        "second",
        "third",
      ]);
    });
  });

  it("OP17-040#1: Newgate's 'when attacked' is offered before [Blocker] and Counter", () => {
    const game = table("faq-op17-040-1", "p2")
      .withLeader("p1", "OP17-039")
      .withBoard("p1", [
        character("newgate", "OP17-040"),
        character("blocker", "OP17-041"), // [Blocker]
      ])
      .withHand("p1", [instance("pitch", "FIX-001")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();
    attack(game, "attacker", "p1-leader");

    expect(game.player).toBe("p1");
    expect(game.state.phase).toBe("block");
    expect(game.state.pendingEffect?.sourceInstanceId).toBe("newgate");
    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      false,
    );
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch" });
    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      true,
    );
  });

  it("OP17-043#1: Ganzui's 6000 loses to a 7000 base-power setter already applied", () => {
    const game = zeffSetsSevenForGanzui();
    game.play({ type: "play-card", cardNumber: "OP17-043" });
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });

  describe("OP17-044 Captain John", () => {
    // P-067 Eustass"Captain"Kid is not in the card pool, so the ruling's
    // two-taunt board is posed with two rested Captain Johns: each copy's
    // restriction names a [Captain John], so each copy is a legal target.
    // Also pinned by test/op17-qa-names-and-taunt.test.ts.
    for (const leader of ["OP17-039", ALL_NAMES_LEADER]) {
      it(`OP17-044#1: under ${leader}, the opponent may attack either rested taunt`, () => {
        const game = table(`faq-op17-044-1-${leader}`, "p2")
          .withLeader("p1", leader)
          .withBoard("p1", [
            character("john-a", "OP17-044", { rested: true }),
            character("john-b", "OP17-044", { rested: true }),
            character("other", "ST31-002", { rested: true }),
          ])
          .build();
        const targets = new Set(
          game
            .legalActions()
            .flatMap((action) =>
              action.type === "attack" ? [action.targetInstanceId] : [],
            ),
        );
        expect([...targets].sort()).toEqual(["john-a", "john-b"]);
      });
    }
  });

  it("OP17-045#1: Kyo's replacement is not offered on a hand of 0 or 1 card", () => {
    for (const hand of [0, 1]) {
      const game = table(`faq-op17-045-1-${hand}`, "p2")
        .withHand("p2", [instance("haruta", "OP17-009")])
        .withHand("p1", copies(hand, "FIX-001", "p1-hand"))
        .withBoard("p1", [
          character("kyo", "OP17-045"),
          character("sanji", "OP17-082"),
        ])
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-009" });
      game.play({ type: "resolve-effect", optionId: "sanji" });
      expect(game.state.pendingEffect).toBeNull();
      expect(ids(game.state.players.p1.board)).toEqual(["kyo"]);
    }
  });

  it("OP17-047#1: the opponent picks which of their own cards Shiki bottoms", () => {
    const game = table("faq-op17-047-1")
      .withBoard("p1", [character("shiki", "OP17-047")])
      .withHand("p2", copies(3, "FIX-001", "p2-hand"))
      .withDeckTop("p2", copies(2, "FIX-002", "p2-deck"))
      .build();
    game.pass();
    expect(game.player).toBe("p2");
    expect(game.state.pendingEffect?.playerId).toBe("p2");
    expect(offers(game, "p1")).toEqual([]);
    expect(offers(game, "p2").sort()).toEqual([
      "p2-hand-1",
      "p2-hand-2",
      "p2-hand-3",
    ]);
    game.play({ type: "resolve-effect", optionId: "p2-hand-2" });
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("p2-hand-2");
    // The turn then passes to p2 as usual.
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.player).toBe("p2");
  });

  describe("OP17-049 Charlotte Linlin", () => {
    const linlin = (seed: string, opponentHand: number) => {
      const game = table(seed)
        .withHand("p1", [instance("linlin", "OP17-049")])
        .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
        .withHand("p2", copies(opponentHand, "FIX-001", "p2-hand"))
        .withDeckTop("p2", copies(2, "FIX-002", "p2-deck"))
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-049" });
      expect(game.player).toBe("p2");
      return game;
    };

    it("OP17-049#1: the draw branch draws for Linlin's controller", () => {
      const game = linlin("faq-op17-049-1", 3);
      game.play({ type: "resolve-effect", optionId: "draw" });
      expect(ids(game.state.players.p1.hand)).toEqual([
        "p1-deck-1",
        "p1-deck-2",
      ]);
      expect(game.state.players.p2.hand).toHaveLength(3);
    });

    it("OP17-049#2: the discard branch has the opponent pick 2 of their own cards", () => {
      const game = linlin("faq-op17-049-2", 3);
      game.play({ type: "resolve-effect", optionId: "opponent-discards" });
      expect(game.player).toBe("p2");
      expect(offers(game, "p2").sort()).toEqual([
        "p2-hand-1",
        "p2-hand-2",
        "p2-hand-3",
      ]);
      game.play({ type: "resolve-effect", optionId: "p2-hand-3" });
      game.play({ type: "resolve-effect", optionId: "p2-hand-1" });
      expect(ids(game.state.players.p2.trash).sort()).toEqual([
        "p2-hand-1",
        "p2-hand-3",
      ]);
    });

    it("OP17-049#3: the discard branch can be chosen on 1 or 0 cards, trashing what there is", () => {
      // test/op17.test.ts pins the one-card half.
      const one = linlin("faq-op17-049-3-one", 1);
      one.play({ type: "resolve-effect", optionId: "opponent-discards" });
      expect(one.state.pendingEffect).toBeNull();
      expect(ids(one.state.players.p2.trash)).toEqual(["p2-hand-1"]);

      const none = linlin("faq-op17-049-3-none", 0);
      expect(offers(none, "p2")).toContain("opponent-discards");
      none.play({ type: "resolve-effect", optionId: "opponent-discards" });
      expect(none.state.pendingEffect).toBeNull();
      expect(none.state.players.p2.trash).toEqual([]);
      expect(none.state.players.p1.hand).toEqual([]);
    });
  });

  it("OP17-050#1: Streusen sends both cards to the same end of the deck", () => {
    // test/op17.test.ts "asks for one end for both cards" pins the same.
    const game = table("faq-op17-050-1")
      .withHand("p1", [instance("streusen", "OP17-050")])
      .withDeckTop("p1", [
        instance("a", "FIX-001"),
        instance("b", "FIX-002"),
        instance("c", "FIX-001"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-050" });
    // Every offer places both cards: none splits them between the ends.
    const summaries = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.summary);
    expect(summaries.length).toBeGreaterThan(0);
    settle(game);
    const deck = ids(game.state.players.p1.deck);
    const hand = ids(game.state.players.p1.hand);
    // Either both went on top (one is then drawn, one stays on top) or both
    // went under "c" (which is drawn).
    if (hand[0] === "c") {
      expect(deck.slice(-2).sort()).toEqual(["a", "b"]);
    } else {
      expect(["a", "b"]).toContain(hand[0]);
      expect(deck.at(-1)).toBe("c");
    }
  });

  it("OP17-053#1: the opponent picks which 2 of their own cards Barbell bottoms", () => {
    // test/op17.test.ts "makes the opponent bury 2 cards from their own hand".
    const game = table("faq-op17-053-1", "p2")
      .withBoard("p1", [character("barbell", "OP17-053", { rested: true })])
      .withHand("p2", copies(3, "FIX-001", "p2-hand"))
      .withBoard("p2", [character("attacker", "OP17-022")]) // 12000
      .build();
    attack(game, "attacker", "barbell");
    undefended(game);
    expect(game.state.pendingEffect?.playerId).toBe("p2");
    expect(offers(game, "p2").sort()).toEqual([
      "p2-hand-1",
      "p2-hand-2",
      "p2-hand-3",
    ]);
    expect(offers(game, "p1")).toEqual([]);
    game.play({ type: "resolve-effect", optionId: "p2-hand-3" });
    settle(game);
    expect(ids(game.state.players.p2.hand)).toHaveLength(1);
    expect(ids(game.state.players.p2.deck)).toContain("p2-hand-3");
  });
});

/** As `zeffSetsSeven`, for OP17-043 Ganzui under a {Rocks Pirates} Leader. */
function zeffSetsSevenForGanzui(): Game {
  const game = table("faq-op17-043-1")
    .withLeader("p1", "OP17-039")
    .withBoard("p1", [character("zeff", "EB04-004")])
    .withHand("p1", [instance("ganzui", "OP17-043")])
    .withLife("p2", copies(2, "FIX-001", "p2-life"))
    .build();
  attack(game, "zeff", "p2-leader");
  settle(game);
  undefended(game);
  while (game.state.phase === "trigger") game.pass();
  expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  return game;
}

describe("FAQ OP-17 purple", () => {
  /**
   * p2 attacks p1's Kaido Leader twice, with OP17-072 Black Maria on p1's
   * board; `offered` says whether the ability under test is the open offer.
   * Every [On Your Opponent's Attack] offer is declined on the first attack.
   */
  function declineThenAgain(seed: string, offered: (game: Game) => boolean) {
    const game = table(seed, "p2")
      .withLeader("p1", "OP17-058")
      .withBoard("p1", [character("maria", "OP17-072")])
      .withHand("p1", copies(2, "FIX-001", "p1-hand"))
      .withLife("p1", copies(3, "FIX-001", "p1-life"))
      .withBoard("p2", [
        character("first", "ST31-002"),
        character("second", "ST31-002"),
      ])
      .build();
    const skipUntilOffered = (): boolean => {
      while (game.state.pendingEffect && !offered(game)) {
        game.play({ type: "resolve-effect", optionId: "skip" });
      }
      return offered(game);
    };

    attack(game, "first", "p1-leader");
    expect(skipUntilOffered()).toBe(true);
    settleBySkipping(game);
    undefended(game);
    expect(game.state.players.p1.life).toHaveLength(2);

    attack(game, "second", "p1-leader");
    return skipUntilOffered();
  }

  it("OP17-058#1: the Kaido Leader declined on one attack is offered on the next", () => {
    expect(
      declineThenAgain(
        "faq-op17-058-1",
        (game) => game.state.pendingEffect?.sourceInstanceId === "p1-leader",
      ),
    ).toBe(true);
  });

  it("OP17-063#1: with OP16-118 Ace beside Kaido, an 8000+ no-Counter Character in hand counts +2000", () => {
    // Pinned in `handCounterPower` (static-abilities.ts) by the same ruling.
    const game = table("faq-op17-063-1")
      .withBoard("p1", [
        character("kaido", "OP17-063"),
        character("ace", "OP16-118"),
      ])
      .withHand("p1", [
        instance("big", "OP17-005"), // 12000, no Counter
        instance("small", "OP17-045"), // 4000, no Counter
      ])
      .build();
    const hand = observe(game.state, "p1").self.hand;
    const counter = (id: string) =>
      hand.find((card) => card.instanceId === id)?.currentCounter;
    expect(counter("big")).toBe(2000);
    expect(counter("small")).toBe(1000);
  });

  it("OP17-072#1: Black Maria declined on one attack is offered on the next", () => {
    expect(
      declineThenAgain(
        "faq-op17-072-1",
        (game) => game.state.pendingEffect?.sourceInstanceId === "maria",
      ),
    ).toBe(true);
  });

  it("OP17-075#1: X.Drake's controller picks the card out of the opponent's hand, face-down", () => {
    // test/op17.test.ts "lets X.Drake's controller pick the DON!! −2 discard
    // face-down" pins the same.
    const game = table("faq-op17-075-1")
      .withHand("p1", [instance("drake", "OP17-075")])
      .withHand("p2", copies(3, "FIX-001", "p2-hand"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-075" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Which DON!! go back is asked first, when both piles hold some.
    while (offers(game, "p1").some((id) => id.startsWith("return-don"))) {
      game.play({ type: "resolve-effect" });
    }
    expect(game.player).toBe("p1");
    expect(offers(game, "p2")).toEqual([]);
    const picks = offers(game, "p1");
    expect(picks).toHaveLength(3);
    game.play({ type: "resolve-effect", optionId: picks[1] });
    settle(game);
    expect(game.state.players.p2.hand).toHaveLength(2);
    expect(game.state.players.p2.trash).toHaveLength(1);
  });
});

describe("FAQ OP-17 black", () => {
  /** p2's P-100 Teach attacks p1's Leader, negating p1's Leader and board. */
  const teachAttacks = (
    seed: string,
    board: ReturnType<typeof character>[],
  ) => {
    const game = table(seed, "p2")
      .withLeader("p1", "OP17-079")
      .withBoard("p1", board)
      .withBoard("p2", [character("teach", "P-100")])
      .build();
    attack(game, "teach", "p1-leader");
    settle(game);
    return game;
  };

  it("OP17-079#1: with the Luffy Leader negated, cost-12 Characters lose [Blocker]", () => {
    // OP17-119 Loki's +12 is its own text; P-100 negates it too, so the
    // Character keeping the cost has to get it elsewhere -- OP17-089 Saul
    // prints the same, so the control is a board P-100 does not reach.
    const control = table("faq-op17-079-1-control")
      .withLeader("p1", "OP17-079")
      .withBoard("p1", [character("loki", "OP17-119")])
      .build();
    expect(hasKeyword(control.state, "p1", "loki", "Blocker")).toBe(true);

    const game = teachAttacks("faq-op17-079-1", [
      character("loki", "OP17-119"),
    ]);
    expect(hasKeyword(game.state, "p1", "loki", "Blocker")).toBe(false);
    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("OP17-079#2: a Character whose own +12 cost is negated drops under 12 and loses [Blocker]", () => {
    // p2's OP09-097 Black Vortex [Trigger] negates one of p1's cards for the
    // turn; aimed at Saul it negates the +12 alone, the Leader still grants.
    const game = table("faq-op17-079-2")
      .withLeader("p1", "OP17-079")
      .withBoard("p1", [
        character("saul", "OP17-089"),
        character("attacker", "ST31-002"),
      ])
      .withLife("p2", [instance("vortex", "OP09-097")])
      .build();
    expect(costOf(game, "p1", "saul")).toBe(16);
    expect(hasKeyword(game.state, "p1", "saul", "Blocker")).toBe(true);

    attack(game, "attacker", "p2-leader");
    undefended(game);
    expect(game.state.phase).toBe("trigger");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "saul" });
    settle(game);

    expect(costOf(game, "p1", "saul")).toBe(4);
    expect(hasKeyword(game.state, "p1", "saul", "Blocker")).toBe(false);
  });

  /** The card's cost in hand, and on the field under an {Elbaph} Leader. */
  const handAndField = (seed: string, cardNumber: string) => {
    const game = table(seed)
      .withLeader("p1", "OP17-079")
      .withHand("p1", [instance("in-hand", cardNumber)])
      .withBoard("p1", [character("on-field", cardNumber)])
      .withTrash("p1", [instance("in-trash", cardNumber)])
      .build();
    const inHand = observe(game.state, "p1").self.hand.find(
      (card) => card.instanceId === "in-hand",
    );
    return {
      hand: inHand?.currentCost,
      field: costOf(game, "p1", "on-field"),
    };
  };

  for (const [qa, cardNumber, printed] of [
    ["OP17-085#1", "OP17-085", 5],
    ["OP17-089#1", "OP17-089", 4],
    ["OP17-092#1", "OP17-092", 5],
    ["OP17-094#1", "OP17-094", 1],
    ["OP17-119#3", "OP17-119", 6],
  ] as const) {
    it(`${qa}: the +12 cost applies on the field only, not in hand`, () => {
      expect(handAndField(`faq-${qa}`, cardNumber)).toEqual({
        hand: printed,
        field: printed + 12,
      });
    });
  }

  it("OP17-091#1: the opponent picks which of their own cards Brook trashes", () => {
    // test/op17.test.ts "lets the opponent pick which of their own cards is
    // trashed" pins the same.
    const game = table("faq-op17-091-1")
      .withLeader("p1", "OP17-079")
      .withBoard("p1", [character("loki", "OP17-119")])
      .withHand("p1", [instance("brook", "OP17-091")])
      .withHand("p2", copies(3, "FIX-001", "p2-hand"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-091" });
    expect(game.player).toBe("p2");
    expect(offers(game, "p2").sort()).toEqual([
      "p2-hand-1",
      "p2-hand-2",
      "p2-hand-3",
    ]);
    game.play({ type: "resolve-effect", optionId: "p2-hand-2" });
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-hand-2"]);
  });

  describe("OP17-095 Roronoa Zoro", () => {
    it("OP17-095#1: Zoro's replacement answers a removal of Zoro himself", () => {
      const game = table("faq-op17-095-1", "p2")
        .withHand("p2", [instance("haruta", "OP17-009")])
        .withTrash("p1", copies(3, "FIX-001", "dead"))
        .withBoard("p1", [character("zoro", "OP17-095")])
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-009" });
      game.play({ type: "resolve-effect", optionId: "zoro" });
      expect(offers(game)).toContain("replace:zoro");
      game.play({ type: "resolve-effect", optionId: "replace:zoro" });
      for (const id of ["dead-1", "dead-2", "dead-3"]) {
        if (game.state.pendingEffect) {
          game.play({ type: "resolve-effect", optionId: id });
        }
      }
      expect(ids(game.state.players.p1.board)).toEqual(["zoro"]);
      expect(game.state.players.p1.trash).toEqual([]);
    });

    it("OP17-095#2: one bury of 3 saves two Characters removed together", () => {
      // Also pinned by test/op17-replacements.test.ts (Q&A Q2).
      const game = table("faq-op17-095-2", "p2")
        .withHand("p2", [instance("gooh", "OP09-018")])
        .withTrash("p1", copies(6, "FIX-001", "dead"))
        .withBoard("p1", [
          character("zoro", "OP17-095"),
          character("sanji", "OP17-082"),
        ])
        .build();
      getOutOfHere(game, ["zoro", "sanji"]);
      game.play({ type: "resolve-effect", optionId: "replace:zoro" });
      for (const id of ["dead-1", "dead-2", "dead-3"]) {
        game.play({ type: "resolve-effect", optionId: id });
      }
      expect(game.state.pendingEffect).toBeNull();
      expect(ids(game.state.players.p1.board)).toEqual(["zoro", "sanji"]);
      expect(game.state.players.p1.trash).toHaveLength(3);
    });
  });

  it("OP17-097#1: the −1 cost does not reach a Character the opponent plays later that turn", () => {
    // p2's OP17-107 Daifuku plays itself from Life after the Event resolved.
    const game = table("faq-op17-097-1")
      .withHand("p1", [instance("rage", "OP17-097")])
      .withBoard("p1", [character("attacker", "ST31-002")])
      .withBoard("p2", [character("early", "OP17-108")])
      .withLife("p2", [instance("daifuku", "OP17-107")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP17-097" });
    settle(game);
    expect(costOf(game, "p2", "early")).toBe(2);

    attack(game, "attacker", "p2-leader");
    undefended(game);
    expect(game.state.phase).toBe("trigger");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(ids(game.state.players.p2.board)).toContain("daifuku");
    expect(costOf(game, "p2", "daifuku")).toBe(3);
    expect(costOf(game, "p2", "early")).toBe(2);
  });
});

describe("FAQ OP-17 yellow", () => {
  describe("OP17-099 Charlotte Linlin", () => {
    const linlinAttacks = (
      seed: string,
      hand: ReturnType<typeof instance>[],
      opponentHand = 3,
    ) => {
      const game = table(seed)
        .withLeader("p1", "OP17-099")
        .withHand("p1", hand)
        .withDeckTop("p1", [instance("banked", "FIX-002")])
        .withHand("p2", copies(opponentHand, "FIX-001", "p2-hand"))
        .build();
      attack(game, "p1-leader", "p2-leader");
      game.play({ type: "resolve-effect", optionId: "apply" });
      game.play({ type: "resolve-effect", optionId: "pitch" });
      expect(game.state.pendingEffect?.playerId).toBe("p2");
      return game;
    };

    it("OP17-099#1: the mill-and-Life branch trashes and banks for Linlin's controller", () => {
      const game = linlinAttacks("faq-op17-099-1", [
        instance("pitch", "FIX-001"),
        instance("milled", "FIX-002"),
      ]);
      game.play({ type: "resolve-effect", optionId: "mill-then-life" });
      while (game.state.pendingEffect) {
        expect(game.state.pendingEffect.playerId).toBe("p1");
        const options = offers(game, "p1");
        game.play({
          type: "resolve-effect",
          optionId: options.includes("milled")
            ? "milled"
            : options.includes("banked")
              ? "banked"
              : options[0],
        });
      }
      expect(ids(game.state.players.p1.trash).sort()).toEqual([
        "milled",
        "pitch",
      ]);
      expect(ids(game.state.players.p1.life)).toEqual(["banked"]);
      expect(game.state.players.p2.hand).toHaveLength(3);
    });

    it("OP17-099#2: with nothing left to mill the branch still banks the Life card", () => {
      const game = linlinAttacks("faq-op17-099-2", [
        instance("pitch", "FIX-001"),
      ]);
      expect(offers(game, "p2")).toContain("mill-then-life");
      game.play({ type: "resolve-effect", optionId: "mill-then-life" });
      while (game.state.pendingEffect) {
        const options = offers(game, "p1");
        game.play({
          type: "resolve-effect",
          optionId: options.includes("banked") ? "banked" : options[0],
        });
      }
      expect(ids(game.state.players.p1.trash)).toEqual(["pitch"]);
      expect(ids(game.state.players.p1.life)).toEqual(["banked"]);
    });

    it("OP17-099#3: the opponent-discard branch takes a card at random, asking no one", () => {
      // test/op17-linlin.test.ts pins the RNG pick in detail.
      const game = linlinAttacks("faq-op17-099-3", [
        instance("pitch", "FIX-001"),
      ]);
      game.play({ type: "resolve-effect", optionId: "opponent-discards" });
      expect(game.state.pendingEffect).toBeNull();
      expect(game.state.players.p2.hand).toHaveLength(2);
      expect(game.state.players.p2.trash).toHaveLength(1);
    });
  });

  /** p2 attacks p1's Leader; p1's top Life card is `lifeCard`, Triggered. */
  const playedFromTrigger = (
    seed: string,
    lifeCard: string,
    leader = "OP17-099",
  ) => {
    const game = table(seed, "p2")
      .withLeader("p1", leader)
      .withLife("p1", [instance("from-life", lifeCard)])
      .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
      .withHand("p1", copies(3, "FIX-001", "p1-hand"))
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withHand("p2", copies(2, "FIX-001", "p2-hand"))
      .build();
    attack(game, "attacker", "p1-leader");
    undefended(game);
    expect(game.state.phase).toBe("trigger");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    return game;
  };

  /** The On Play of a [Your Turn] card played from Life does nothing. */
  const yourTurnOnly = (qa: string, cardNumber: string): void => {
    it(`${qa}: played by its [Trigger] on the opponent's turn, its [Your Turn] [On Play] does not activate`, () => {
      const game = playedFromTrigger(`faq-${qa}`, cardNumber);
      expect(ids(game.state.players.p1.board)).toContain("from-life");
      expect(game.state.pendingEffect).toBeNull();
      expect(game.state.players.p1.life).toEqual([]);
      expect(game.state.players.p1.hand).toHaveLength(3);
      expect(game.state.players.p1.restedDon).toEqual([]);
      expect(game.state.players.p2.hand).toHaveLength(2);
    });
  };

  describe("OP17-103 Charlotte Katakuri", () => {
    it("OP17-103#1: banks the Life card with no opponent Character to debuff", () => {
      const game = table("faq-op17-103-1")
        .withLeader("p1", "OP17-099")
        .withHand("p1", [instance("katakuri", "OP17-103")])
        .withDeckTop("p1", [instance("banked", "FIX-002")])
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-103" });
      if (offers(game).includes("banked")) {
        game.play({ type: "resolve-effect", optionId: "banked" });
      }
      settle(game);
      expect(ids(game.state.players.p1.life)).toEqual(["banked"]);
    });

    yourTurnOnly("OP17-103#2", "OP17-103");
  });

  yourTurnOnly("OP17-104#1", "OP17-104");

  it("OP17-105#1: Chiffon cannot return a Character that only mentions [Trigger]", () => {
    const game = table("faq-op17-105-1")
      .withHand("p1", [
        instance("chiffon", "OP17-105"),
        instance("fuel", "OP17-107"),
      ])
      .withBoard("p2", [
        character("mentions", "OP17-112"), // text names [Trigger], has none
        character("has", "OP17-107"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-105" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fuel" });
    expect(offers(game)).toContain("has");
    expect(offers(game)).not.toContain("mentions");
  });

  describe("OP17-106 Charlotte Smoothie", () => {
    it("OP17-106#1: the opponent picks which of their own cards is trashed", () => {
      const game = table("faq-op17-106-1")
        .withHand("p1", [instance("smoothie", "OP17-106")])
        .withDeckTop("p1", [instance("banked", "FIX-002")])
        .withHand("p2", copies(3, "FIX-001", "p2-hand"))
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-106" });
      game.play({ type: "resolve-effect", optionId: "apply" });
      while (game.state.pendingEffect && game.player === "p1") {
        const options = offers(game, "p1");
        game.play({
          type: "resolve-effect",
          optionId: options.includes("banked") ? "banked" : options[0],
        });
      }
      expect(game.player).toBe("p2");
      expect(offers(game, "p2").sort()).toEqual([
        "p2-hand-1",
        "p2-hand-2",
        "p2-hand-3",
      ]);
      game.play({ type: "resolve-effect", optionId: "p2-hand-3" });
      expect(ids(game.state.players.p2.trash)).toEqual(["p2-hand-3"]);
    });

    yourTurnOnly("OP17-106#2", "OP17-106");
  });

  describe("OP17-110 Charlotte Perospero", () => {
    it("OP17-110#1: Perospero itself gains [Rush], not the Character it plays", () => {
      const game = table("faq-op17-110-1")
        .withLeader("p1", "OP17-099")
        .withHand("p1", [
          instance("perospero", "OP17-110"),
          instance("daifuku", "OP17-107"),
        ])
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-110" });
      game.play({ type: "resolve-effect", optionId: "daifuku" });
      settle(game);
      expect(ids(game.state.players.p1.board)).toEqual([
        "perospero",
        "daifuku",
      ]);
      expect(hasKeyword(game.state, "p1", "perospero", "Rush")).toBe(true);
      expect(hasKeyword(game.state, "p1", "daifuku", "Rush")).toBe(false);
    });

    yourTurnOnly("OP17-110#2", "OP17-110");
  });

  describe("OP17-112 Charlotte Linlin", () => {
    it("OP17-112#1: Linlin's controller chooses the mode", () => {
      const game = table("faq-op17-112-1")
        .withHand("p1", [instance("linlin", "OP17-112")])
        .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
        .withLife("p2", copies(1, "FIX-001", "p2-life"))
        .build();
      game.play({ type: "play-card", cardNumber: "OP17-112" });
      expect(game.player).toBe("p1");
      expect(offers(game, "p1")).toEqual(
        expect.arrayContaining(["life", "steal"]),
      );
      expect(offers(game, "p2")).toEqual([]);
    });

    it("OP17-112#2: a 4000 [Trigger] Character raised to 8000 is no longer a 4000 base-power Character", () => {
      // test/op17.test.ts "takes a 4000 [Trigger] body out of a 4000-or-less
      // filter" pins the same. OP12-001 Silvers Rayleigh's activation asks
      // for a Character with 4000 base power or less.
      const options = (board: ReturnType<typeof character>[]) => {
        const game = table(`faq-op17-112-2-${board.length}`)
          .withLeader("p1", "OP12-001")
          .withHand("p1", copies(2, "OP12-019", "event"))
          .withBoard("p1", board)
          .build();
        game.play({ summary: "Activate Silvers Rayleigh [OP12-001]" });
        game.play({ type: "resolve-effect", optionId: "event-1" });
        game.play({ type: "resolve-effect", optionId: "event-2" });
        return offers(game);
      };
      const bodies = [
        character("sweet", "OP17-114"), // 4000 printed, [Trigger]
        character("hongo", "OP17-029"), // 4000 printed, no [Trigger]
      ];
      expect(options(bodies)).toEqual(
        expect.arrayContaining(["sweet", "hongo"]),
      );
      const withLinlin = options([character("linlin", "OP17-112"), ...bodies]);
      expect(withLinlin).toContain("hongo");
      expect(withLinlin).not.toContain("sweet");
    });
  });

  yourTurnOnly("OP17-114#1", "OP17-114");

  it("OP17-117#1: the opponent decides whether to trash 3; if not, Maser Saber's owner K.O.s", () => {
    // test/op17.test.ts "OP17-117 Maser Saber" pins both branches.
    const game = table("faq-op17-117-1")
      .withBoard("p1", [
        character("attacker", "ST31-002"),
        character("victim", "OP17-045"),
      ])
      .withHand("p1", copies(4, "FIX-001", "p1-hand"))
      .withLife("p2", [instance("saber", "OP17-117")])
      .build();
    attack(game, "attacker", "p2-leader");
    undefended(game);
    expect(game.state.phase).toBe("trigger");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    // p1 -- the Trigger's opponent -- is asked about its own hand.
    expect(game.player).toBe("p1");
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    expect(offers(game, "p2")).toEqual([]);
    game.play({ type: "resolve-effect", summary: "Do not trash" });
    // Declined: p2, who activated the Trigger, may K.O. p1's Character.
    expect(game.player).toBe("p2");
    expect(offers(game, "p2")).toContain("victim");
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);
    expect(ids(game.state.players.p1.board)).toEqual(["attacker"]);
    expect(game.state.players.p1.hand).toHaveLength(4);
  });
});

describe("FAQ OP-17 Rocks.D.Xebec and Loki", () => {
  it("OP17-118#1: with no Characters at all, Xebec in hand has no +2000 Counter", () => {
    const counter = (board: ReturnType<typeof character>[]) => {
      const game = table(`faq-op17-118-1-${board.length}`)
        .withBoard("p1", board)
        .withHand("p1", [instance("xebec", "OP17-118")])
        .build();
      return observe(game.state, "p1").self.hand.find(
        (card) => card.instanceId === "xebec",
      )?.currentCounter;
    };
    expect(counter([])).toBe(0);
    expect(counter([character("kyo", "OP17-045")])).toBe(2000);
  });

  it("OP17-118#2: Xebec's [On Play] may play just 1 {Rocks Pirates} card", () => {
    const game = table("faq-op17-118-2")
      .withHand("p1", [
        instance("xebec", "OP17-118"),
        instance("gloriosa", "OP17-046"),
        instance("barbell", "OP17-053"),
      ])
      .withDeckTop("p1", [instance("drawn", "FIX-002")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-118" });
    // OP17-053 Barbell prints no [On Play], so nothing nests under the pick.
    game.play({ type: "resolve-effect", optionId: "barbell" });
    expect(offers(game)).toContain("done");
    game.play({ type: "resolve-effect", optionId: "done" });
    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.board).sort()).toEqual([
      "barbell",
      "xebec",
    ]);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "drawn",
      "gloriosa",
    ]);
  });

  it("OP17-119#1: Loki can K.O. a Character whose cost was reduced to 0", () => {
    // OP17-097 gives every opposing Character −1 cost for the turn first.
    const game = table("faq-op17-119-1")
      .withHand("p1", [
        instance("rage", "OP17-097"),
        instance("loki", "OP17-119"),
      ])
      .withBoard("p2", [
        character("zero", "OP17-010"), // cost 1, 0 after the Event
        character("costly", "OP17-042"), // cost 4, 3 after the Event
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP17-097" });
    settle(game);
    expect(costOf(game, "p2", "zero")).toBe(0);

    game.play({ type: "play-card", cardNumber: "OP17-119" });
    expect(offers(game)).toEqual(expect.arrayContaining(["zero", "costly"]));
    game.play({ type: "resolve-effect", optionId: "zero" });
    // 0 of the 4 is spent, so the 3-cost Character still fits.
    expect(offers(game)).toContain("costly");
    game.play({ type: "resolve-effect", optionId: "costly" });
    settle(game);
    expect(game.state.players.p2.board).toEqual([]);
  });

  it("OP17-119#2: Loki can K.O. 2 or more Characters within the total of 4", () => {
    // test/op17.test.ts "OP17-119 Loki On Play" pins the budget in detail.
    const game = table("faq-op17-119-2")
      .withHand("p1", [instance("loki", "OP17-119")])
      .withBoard("p2", [
        character("a", "OP17-010"), // 1
        character("b", "OP17-010"), // 1
        character("c", "OP17-045"), // 2
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-119" });
    for (const id of ["a", "b", "c"]) {
      game.play({ type: "resolve-effect", optionId: id });
    }
    settle(game);
    expect(game.state.players.p2.board).toEqual([]);
  });
});

describe("FAQ OP-17 rulings on OP-16 cards", () => {
  it("OP16-040#3: Gum-Gum Hammer Rifle's name check is met by a Leader with every name", () => {
    // Also pinned by test/op17-qa-names-and-taunt.test.ts.
    const game = table("faq-op16-040-3")
      .withLeader("p1", ALL_NAMES_LEADER)
      .withHand("p1", [instance("rifle", "OP16-040")])
      .withBoard("p2", [character("target", "ST31-002", { rested: true })])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP16-040" });
    if (offers(game).includes("target")) {
      game.play({ type: "resolve-effect", optionId: "target" });
    }
    expect(
      game.state.players.p2.board[0]?.cannotRefreshUntilTurn,
    ).toBeDefined();
  });

  it("OP16-048#3: Buggy can give [Blocker] to a Leader with every name", () => {
    // Also pinned by test/op16-buggy-leader-blocker.test.ts.
    const game = table("faq-op16-048-3", "p2")
      .withLeader("p1", ALL_NAMES_LEADER)
      .withBoard("p1", [
        character("buggy", "OP16-048"),
        character("vista", "OP16-011", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();
    attack(game, "attacker", "vista");
    expect(offers(game, "p1")).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    expect(observe(game.state, "p1").self.leader.effectiveKeywords).toContain(
      "Blocker",
    );
  });
});
