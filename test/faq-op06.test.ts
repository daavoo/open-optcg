import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword, observe } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for BOOSTER PACK -WINGS OF THE CAPTAIN- [OP-06], one
 * case per ruling, named by the Q&A id (`<card>#<n>`, in the order the PDF
 * prints the questions for that card).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. Names and comments paraphrase the ruling; the
 * repository holds none of Bandai's text. A ruling the engine disagrees with is
 * an `it.fails` that says what the engine does instead: it turns green -- and
 * so red under `it.fails` -- the day the engine is fixed.
 *
 * Where a ruling names a card the pool does not hold (ST03-017, ST03-003,
 * OP01-006, OP02-004, OP02-114, OP04-083, OP01-041), the position uses a card
 * the pool does hold that does the same thing, and says which.
 *
 * Positions are built on the fixture decks: FIX-001 (cost 1, 2000, Counter
 * +1000) and FIX-002 (cost 2, 4000) print nothing, so nothing else on the board
 * can be the reason a case passes.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op06.pdf
 */

/**
 * Rulings with no position the pool can drive the engine to, with the reason.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {
  "OP06-054#1":
    "Borsalino's hand would have to grow by a net card after it blocks, and " +
    "every effect in the pool that adds to the defender's hand mid-battle is " +
    "a Counter Event that spends itself first. The engine reads [Blocker] " +
    "only when the block is declared, so the redirected attack keeps its " +
    "target either way.",
  "OP06-074#7":
    "Every card in the pool that reads 'no base effect' reads it on its own " +
    "controller's Characters, and Zephyr negates the opponent's for p1's " +
    "turn only, so nothing can ask the question. The same reading is pinned " +
    "on a self-negated OP06-083 Oars in OP06-083#4.",
};

/** p1 to act in its Main Phase, both sides bare, all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks("FIXTURE-RED", "FIXTURE-BLUE")
    .seed(seed)
    .atTurn(3, { active: "p1" })
    .bareTable();

/** p2 to act in its Main Phase, for the clauses read on p1's defence. */
const defending = (seed: string) =>
  scenario()
    .decks("FIXTURE-RED", "FIXTURE-BLUE")
    .seed(seed)
    .atTurn(4, { active: "p2" })
    .bareTable();

const lifeCards = (owner: string, count: number) =>
  copies(count, "FIX-001", `${owner}-life`);

/** Cards for a deck a draw or a turn change will read. */
const deckCards = (owner: string, count: number) =>
  copies(count, "FIX-002", `${owner}-deck`);

const attack = (game: Game, attacker: string, target: string): void => {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
};

function effectOptions(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Picks one card in an open effect choice, by instance id. */
const choose = (game: Game, instanceId: string): void => {
  game.play(
    (action) =>
      action.type === "resolve-effect" &&
      action.option.kind === "card" &&
      action.option.card.instanceId === instanceId,
  );
};

/** Takes the apply branch of an `optional` prompt, if one is open. */
const apply = (game: Game): void => {
  if (effectOptions(game).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 60) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Declines the rest of an open effect wherever declining is offered. */
function decline(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 60) throw new Error("pending effect never settled");
    const options = effectOptions(game);
    const skip =
      options.find((optionId) => optionId === "skip" || optionId === "done") ??
      options[0]!;
    game.play({ type: "resolve-effect", optionId: skip });
  }
}

/** Passes the defender's Block and Counter windows and any Trigger. */
function noDefence(game: Game): void {
  let guard = 0;
  while (
    game.state.activeAttack &&
    (game.state.phase === "block" || game.state.phase === "counter")
  ) {
    if (guard++ > 40) throw new Error("battle never settled");
    if (
      game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      game.play({ type: "resolve-trigger", optionId: "skip" });
      continue;
    }
    if (game.state.pendingEffect) {
      decline(game);
      continue;
    }
    game.pass();
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const attackers = (game: Game): string[] =>
  game
    .legalActions()
    .flatMap((action) =>
      action.type === "attack" ? [action.attackerInstanceId] : [],
    );

const activationOffered = (game: Game, cardNumber: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" && action.summary.includes(cardNumber),
    );

describe("FAQ OP-06: Red", () => {
  it("OP06-002#1: Inazuma counted down below 7000 by a Counter Event deals its damage without [Banish]", () => {
    // OP08-019 Munch-Munch Mutation stands in for "an Event's [Counter] that
    // lowers the attacker". Four DON!! make Inazuma a 9000 with [Banish]; the
    // Counter takes it to 6000, which still beats the 5000 Leader, so the
    // damage is dealt and the question is only what it does to the Life card.
    const game = table("faq-op06-002-1")
      .withBoard("p1", [character("inazuma", "OP06-002")])
      .withGivenDon("p1", "inazuma", 4)
      .withLife("p2", [instance("p2-life", "FIX-001")])
      .withHand("p2", [instance("mutation", "OP08-019")])
      .build();
    expect(hasKeyword(game.state, "p1", "inazuma", "Banish")).toBe(true);

    attack(game, "inazuma", "p2-leader");
    game.pass(); // no block
    game.play({ type: "activate-counter-event", cardNumber: "OP08-019" });
    choose(game, "inazuma");
    decline(game);
    expect(currentPower(game.state, "p1", "inazuma")).toBe(6_000);
    expect(hasKeyword(game.state, "p1", "inazuma", "Banish")).toBe(false);
    noDefence(game);

    // Without [Banish] the Life card goes to the hand, not the trash.
    expect(ids(game.state.players.p2.hand)).toContain("p2-life");
    expect(ids(game.state.players.p2.trash)).not.toContain("p2-life");
  });

  // The engine names the {FILM} Character that pays when the [When Attacking]
  // resolves, not when the turn ends (`at-end-of-turn` in mechanic-dsl.ts). A
  // player who named Saga itself and then lost Saga pays nothing at the end of
  // the turn; the ruling makes them trash another {FILM} Character then.
  it.fails(
    "OP06-006#1: Saga leaving the field after its [When Attacking] still costs another {FILM} Character at the end of the turn",
    () => {
      const game = table("faq-op06-006-1")
        .withBoard("p1", [
          character("saga", "OP06-006"),
          character("film", "OP06-008"),
          character("filler-1", "FIX-001"),
          character("filler-2", "FIX-001"),
          character("filler-3", "FIX-001"),
        ])
        .withGivenDon("p1", "saga", 1)
        .withHand("p1", [instance("newcomer", "FIX-002")])
        .withLife("p2", lifeCards("p2", 3))
        .withDeckTop("p2", deckCards("p2", 2))
        .build();

      attack(game, "saga", "p2-leader");
      choose(game, "saga");
      decline(game);
      noDefence(game);

      // A sixth Character needs room: Saga is the one that goes.
      game.play({ type: "play-card", cardNumber: "FIX-002" });
      choose(game, "saga");
      decline(game);
      expect(ids(game.state.players.p1.board)).not.toContain("saga");

      game.pass();
      expect(ids(game.state.players.p1.board)).not.toContain("film");
    },
  );

  describe("OP06-009 Shuraiya", () => {
    it("OP06-009#1: with 1 DON!! given, the copied 5000 base attacks at 6000", () => {
      const game = table("faq-op06-009-1")
        .withBoard("p1", [character("shuraiya", "OP06-009")])
        .withGivenDon("p1", "shuraiya", 1)
        .withLife("p2", lifeCards("p2", 3))
        .build();

      attack(game, "shuraiya", "p2-leader");
      settle(game);

      expect(currentPower(game.state, "p1", "shuraiya")).toBe(6_000);
    });

    it("OP06-009#2: a Counter still raises Shuraiya after its [On Block] copy", () => {
      const game = defending("faq-op06-009-2")
        .withBoard("p1", [character("shuraiya", "OP06-009")])
        .withHand("p1", [instance("counter", "FIX-001")])
        .withBoard("p2", [character("attacker", "FIX-002")])
        .withGivenDon("p2", "p2-leader", 3)
        .withLife("p1", lifeCards("p1", 3))
        .build();

      attack(game, "p2-leader", "p1-leader");
      game.play({ type: "block", blockerInstanceId: "shuraiya" });
      settle(game);
      // The copy is of base power: 5000, not the attacking 8000.
      expect(currentPower(game.state, "p1", "shuraiya")).toBe(5_000);

      game.play({ type: "counter", cardInstanceId: "counter" });
      expect(game.state.activeAttack?.counterPower).toBe(1_000);
    });

    it("OP06-009#3: a Counter on the opposing Leader after the copy does not raise Shuraiya", () => {
      const game = table("faq-op06-009-3")
        .withBoard("p1", [character("shuraiya", "OP06-009")])
        .withHand("p2", [instance("counter", "FIX-001")])
        .withLife("p2", lifeCards("p2", 3))
        .build();

      attack(game, "shuraiya", "p2-leader");
      settle(game);
      expect(currentPower(game.state, "p1", "shuraiya")).toBe(5_000);

      game.pass(); // no block
      game.play({ type: "counter", cardInstanceId: "counter" });
      expect(currentPower(game.state, "p1", "shuraiya")).toBe(5_000);
    });
  });

  it("OP06-013#1: Luffy's [Trigger] runs the [On Play] dig without playing the card", () => {
    const game = defending("faq-op06-013-1")
      .withLife("p1", [instance("luffy", "OP06-013")])
      .withDeckTop("p1", [instance("film", "OP06-008"), ...deckCards("p1", 3)])
      .build();

    attack(game, "p2-leader", "p1-leader");
    game.pass(); // no block
    game.pass(); // no Counter
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(ids(game.state.players.p1.board)).not.toContain("luffy");
    expect(ids(game.state.players.p1.hand)).toContain("film");
  });

  it("OP06-014#1: Ratchet's power goes to one card, not 1000 each to two", () => {
    const game = defending("faq-op06-014-1")
      .withBoard("p1", [
        character("ratchet", "OP06-014"),
        character("ally", "OP06-008"),
      ])
      .withHand("p1", [
        instance("film-1", "OP06-008"),
        instance("film-2", "OP06-008"),
      ])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    attack(game, "attacker", "p1-leader");
    apply(game);
    choose(game, "film-1");
    choose(game, "film-2");
    settle(game);

    // Both cards paid into one battle: +2000 on the card being attacked, and
    // no choice to split it.
    expect(ids(game.state.players.p1.trash)).toEqual(["film-1", "film-2"]);
    expect(game.state.activeAttack?.counterPower).toBe(2_000);
  });

  it("OP06-018#1: Gatling's +3000 and +1000 can go to different cards", () => {
    const game = table("faq-op06-018-1")
      .withBoard("p1", [
        character("first", "FIX-002"),
        character("second", "FIX-001"),
      ])
      // OP06-083 Oars prints 7000, so the second sentence is live.
      .withBoard("p2", [character("big", "OP06-083")])
      .withHand("p1", [instance("gatling", "OP06-018")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP06-018" });
    choose(game, "first");
    choose(game, "second");
    settle(game);

    expect(currentPower(game.state, "p1", "first")).toBe(7_000);
    expect(currentPower(game.state, "p1", "second")).toBe(3_000);
  });
});

describe("FAQ OP-06: Green", () => {
  it("OP06-023#1: the Leader Arlong locks comes back active at its Refresh and still cannot attack", () => {
    // Also pinned by test/op06.test.ts, "OP06-023 Arlong".
    const game = table("faq-op06-023-1")
      .withHand("p1", [
        instance("arlong", "OP06-023"),
        instance("fodder", "FIX-001"),
      ])
      .withRestedLeader("p2")
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .withDeckTop("p2", deckCards("p2", 2))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-023" });
    apply(game);
    choose(game, "fodder");
    choose(game, "p2-leader");
    decline(game);
    game.pass();

    expect(game.state.players.p2.leaderRested).toBe(false);
    expect(attackers(game)).not.toContain("p2-leader");
  });

  describe("OP06-024 Ikaros Much", () => {
    /** p1 behind OP06-020 Hody Jones, Ikaros and `extra` in hand. */
    const ikaros = (seed: string, extra: string) =>
      table(seed)
        .withLeader("p1", "OP06-020")
        .withHand("p1", [
          instance("ikaros", "OP06-024"),
          instance("extra", extra),
        ])
        .withLife("p1", lifeCards("p1", 3))
        .build();

    // The pool's OP06-034 record still carries the printed {Fish-Man} type;
    // Bandai's errata (2024-12-06) made Hyouzou {Merfolk}, which is what puts
    // him outside this clause. The record is generated by `pnpm
    // reference:fetch`, so the fix is a refetch, not an edit here.
    it.fails("OP06-024#1: Ikaros cannot play OP06-034 Hyouzou", () => {
      const game = ikaros("faq-op06-024-1", "OP06-034");
      game.play({ type: "play-card", cardNumber: "OP06-024" });
      expect(effectOptions(game)).not.toContain("extra");
    });

    it("OP06-024#2: behind a {New Fish-Man Pirates} Leader, playing nothing still costs the Life card", () => {
      const game = ikaros("faq-op06-024-2", "OP06-032");
      game.play({ type: "play-card", cardNumber: "OP06-024" });
      expect(effectOptions(game)).toContain("extra");
      decline(game);

      expect(ids(game.state.players.p1.board)).toEqual(["ikaros"]);
      expect(game.state.players.p1.life).toHaveLength(2);
      expect(game.state.players.p1.hand).toHaveLength(2);
    });
  });

  describe("OP06-026 Koushirou", () => {
    it("OP06-026#1: after the [On Play], no other attacker may target the Leader that turn", () => {
      // Also pinned by test/op06.test.ts, "OP06-026 Koushirou".
      const game = table("faq-op06-026-1")
        .withHand("p1", [instance("koushirou", "OP06-026")])
        .withBoard("p1", [
          character("slash", "OP06-036", { rested: true }),
          character("other", "FIX-002"),
        ])
        .withBoard("p2", [character("body", "FIX-001", { rested: true })])
        .withLife("p2", lifeCards("p2", 3))
        .build();

      game.play({ type: "play-card", cardNumber: "OP06-026" });
      choose(game, "slash");
      decline(game);

      const targets = game
        .legalActions()
        .flatMap((action) =>
          action.type === "attack"
            ? [[action.attackerInstanceId, action.targetInstanceId]]
            : [],
        );
      expect(targets.map(([from]) => from)).toEqual(
        expect.arrayContaining(["p1-leader", "other", "slash"]),
      );
      expect(targets.every(([, to]) => to !== "p2-leader")).toBe(true);
    });

    it("OP06-026#2: the [On Play] still resolves after the Leader was already attacked", () => {
      const game = table("faq-op06-026-2")
        .withHand("p1", [instance("koushirou", "OP06-026")])
        .withBoard("p1", [character("slash", "OP06-036")])
        .withLife("p2", lifeCards("p2", 3))
        .build();

      attack(game, "slash", "p2-leader");
      noDefence(game);
      expect(game.state.players.p2.life).toHaveLength(2);

      game.play({ type: "play-card", cardNumber: "OP06-026" });
      choose(game, "slash");
      decline(game);

      expect(
        game.state.players.p1.board.find((card) => card.instanceId === "slash")
          ?.rested,
      ).toBe(false);
    });
  });

  it("OP06-028#1: Zeo with no DON!! set active still costs the Life card", () => {
    // Every DON!! is already active, so there is none to set active.
    const game = table("faq-op06-028-1")
      .withLeader("p1", "OP06-020")
      .withBoard("p1", [character("zeo", "OP06-028")])
      .withGivenDon("p1", "zeo", 1)
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .build();
    expect(game.state.players.p1.restedDon).toHaveLength(0);

    attack(game, "zeo", "p2-leader");
    decline(game);

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("OP06-035#1: Hody Jones resting nothing still costs the Life card", () => {
    const game = table("faq-op06-035-1")
      .withHand("p1", [instance("hody", "OP06-035")])
      .withBoard("p2", [character("body", "FIX-001")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-035" });
    decline(game);

    expect(game.state.players.p2.board[0]?.rested).toBe(false);
    expect(game.state.players.p2.restedDon).toHaveLength(0);
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  describe("OP06-038 The Billion-fold World Trichiliocosm", () => {
    /** p2's Leader swings at p1's; p1 holds the Counter Event. */
    const counterTable = (seed: string) =>
      defending(seed)
        .withHand("p1", [instance("trichiliocosm", "OP06-038")])
        .withLife("p1", lifeCards("p1", 3));

    const counterWith = (game: Game) => {
      attack(game, "p2-leader", "p1-leader");
      game.pass(); // no block
      game.play({
        type: "activate-counter-event",
        cardNumber: "OP06-038",
      });
      settle(game);
    };

    it("OP06-038#1: the DON!! rested to pay for it is the eighth rested card", () => {
      const game = counterTable("faq-op06-038-1")
        .withDon("p1", { rested: 7 })
        .build();
      counterWith(game);
      expect(game.state.players.p1.restedDon).toHaveLength(8);
      expect(game.state.activeAttack?.counterPower).toBe(4_000);
    });

    it("OP06-038#2: DON!! given to the Leader are not rested cards", () => {
      // After paying: 4 rested DON!!, the rested Leader and one rested
      // Character make 6; the 3 DON!! given to the Leader would make 9.
      const game = counterTable("faq-op06-038-2")
        .withDon("p1", { rested: 3 })
        .withRestedLeader("p1")
        .withBoard("p1", [character("tired", "FIX-001", { rested: true })])
        .withGivenDon("p1", "p1-leader", 3)
        .build();
      counterWith(game);
      expect(game.state.activeAttack?.counterPower).toBe(2_000);
    });
  });
});

describe("FAQ OP-06: Blue", () => {
  describe("OP06-042 Vinsmoke Reiju (Leader)", () => {
    it("OP06-042#1: a DON!! the opponent's effect returns on your turn still draws", () => {
      // OP14-065 Senor Pink's [On K.O.] makes its K.O.er return a DON!!.
      const game = table("faq-op06-042-1")
        .withLeader("p1", "OP06-042")
        .withBoard("p1", [character("attacker", "FIX-002")])
        .withGivenDon("p1", "attacker", 2)
        .withBoard("p2", [character("pink", "OP14-065", { rested: true })])
        .withDeckTop("p1", deckCards("p1", 2))
        .build();

      attack(game, "attacker", "pink");
      noDefence(game);
      settle(game);

      expect(ids(game.state.players.p2.trash)).toContain("pink");
      expect(game.state.players.p1.donDeck).toHaveLength(1);
      expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
    });

    it("OP06-042#2: OP06-069 draws 2 off a hand of 5 first, then the Leader draws to 8", () => {
      const game = table("faq-op06-042-2")
        .withLeader("p1", "OP06-042")
        .withBoard("p1", [character("small-reiju", "OP06-068")])
        .withTrash("p1", [instance("big-reiju", "OP06-069")])
        .withHand("p1", copies(5, "FIX-001", "p1-hand"))
        .withDeckTop("p1", deckCards("p1", 4))
        .build();

      game.play({ type: "activate-main", summary: "OP06-068" });
      apply(game);
      // Pay DON!! −1 and trash OP06-068, then pick the trash copy.
      let guard = 0;
      while (game.state.pendingEffect) {
        if (guard++ > 20) throw new Error("activation never settled");
        if (effectOptions(game).includes("big-reiju")) {
          choose(game, "big-reiju");
        } else {
          game.play({ type: "resolve-effect" });
        }
      }

      expect(ids(game.state.players.p1.board)).toEqual(["big-reiju"]);
      expect(game.state.players.p1.hand).toHaveLength(8);
    });
  });

  it("OP06-043#1: Aramaki's [Activate: Main] is not offered with no cost-2-or-less Character on either field", () => {
    const game = table("faq-op06-043-1")
      .withBoard("p1", [character("aramaki", "OP06-043")])
      .withBoard("p2", [character("big", "FIX-002", { rested: true })])
      .withHand("p1", [instance("fodder", "FIX-001")])
      .build();
    // FIX-002 is cost 2: with it on the field the activation is there...
    expect(activationOffered(game, "OP06-043")).toBe(true);

    const bare = table("faq-op06-043-1-none")
      .withBoard("p1", [character("aramaki", "OP06-043")])
      .withHand("p1", [instance("fodder", "FIX-001")])
      .build();
    // ...and with nothing to bury it is not.
    expect(activationOffered(bare, "OP06-043")).toBe(false);
  });

  it("OP06-044#1: Gion's [Your Turn] resolves after the Event's own draw", () => {
    // OP06-059 White Snake stands in for ST03-017: a Counter Event that draws.
    // p2 holds only the Event, so the card Gion takes is the one it drew.
    const game = table("faq-op06-044-1")
      .withBoard("p1", [character("gion", "OP06-044")])
      .withGivenDon("p1", "gion", 1)
      .withHand("p2", [instance("snake", "OP06-059")])
      .withDeckTop("p2", [instance("drawn", "FIX-001"), ...deckCards("p2", 2)])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    attack(game, "gion", "p2-leader");
    game.pass(); // no block
    game.play({ type: "activate-counter-event", cardNumber: "OP06-059" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("drawn");
  });

  describe("OP06-048 Zeff", () => {
    /** p1 behind OP15-001 Krieg ({East Blue}), Zeff on the board. */
    const zeffTable = (seed: string) =>
      table(seed)
        .withLeader("p1", "OP15-001")
        .withBoard("p1", [
          character("zeff", "OP06-048"),
          character("attacker", "FIX-002"),
        ])
        .withGivenDon("p1", "attacker", 1)
        .withDeckTop("p1", deckCards("p1", 8));

    it("OP06-048#1: an Event's [Trigger] on your turn does not open Zeff", () => {
      // OP06-116 Reject's [Trigger] draws a card for p2.
      const game = zeffTable("faq-op06-048-1")
        .withLife("p2", [instance("reject", "OP06-116")])
        .withDeckTop("p2", deckCards("p2", 2))
        .build();

      attack(game, "attacker", "p2-leader");
      game.pass(); // no block
      game.pass(); // no Counter
      game.play({ type: "resolve-trigger", optionId: "activate" });
      settle(game);

      expect(game.state.players.p2.hand).toHaveLength(1);
      expect(game.state.players.p1.trash).toHaveLength(0);
      expect(game.state.players.p1.deck).toHaveLength(8);
    });

    it("OP06-048#2: Zeff's mill on a [Blocker] resolves before that Blocker's [On Block]", () => {
      // OP05-036 Monet stands in for ST03-003 Crocodile: a [Blocker] whose
      // [On Block] reaches Zeff (it rests a cost-4-or-less Character).
      const game = zeffTable("faq-op06-048-2")
        .withBoard("p2", [character("monet", "OP05-036")])
        .withLife("p2", lifeCards("p2", 3))
        .build();

      attack(game, "attacker", "p2-leader");
      game.play({ type: "block", blockerInstanceId: "monet" });
      // Zeff's optional mill is p1's to answer first.
      expect(game.player).toBe("p1");
      apply(game);
      settle(game);
      expect(game.state.players.p1.trash).toHaveLength(4);
      // Then Monet's [On Block] still lands on Zeff.
      settle(game);
      expect(
        game.state.players.p1.board.find((card) => card.instanceId === "zeff")
          ?.rested,
      ).toBe(true);
    });
  });

  it("OP06-051#1: the opponent picks the Character Tsuru returns", () => {
    // Also pinned by test/op06.test.ts, "OP06-051 Tsuru".
    const game = table("faq-op06-051-1")
      .withHand("p1", [
        instance("tsuru", "OP06-051"),
        ...copies(2, "FIX-001", "cost"),
      ])
      .withBoard("p2", [
        character("theirs-a", "FIX-001"),
        character("theirs-b", "FIX-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-051" });
    apply(game);
    choose(game, "cost-2");
    choose(game, "cost-1");

    expect(game.player).toBe("p2");
    choose(game, "theirs-b");
    decline(game);
    expect(ids(game.state.players.p2.hand)).toEqual(["theirs-b"]);
  });

  describe("OP06-056 Ama no Murakumo Sword", () => {
    const swordTable = (seed: string) =>
      table(seed)
        .withHand("p1", [instance("sword", "OP06-056")])
        .withBoard("p2", [
          character("two", "FIX-002"),
          character("one", "FIX-001"),
        ])
        .build();

    // The engine moves each Character under the deck as p1 picks it, so the
    // order is p1's pick order and p2 is never asked. An `order-to-bottom`
    // with a chooser is what would hand the decision to the owner.
    it.fails(
      "OP06-056#1: the owner orders the two Characters going under their deck",
      () => {
        const game = swordTable("faq-op06-056-1");
        game.play({ type: "activate-main", sourceCardNumber: "OP06-056" });
        choose(game, "two");
        choose(game, "one");
        expect(game.state.pendingEffect).not.toBeNull();
        expect(game.player).toBe("p2");
      },
    );

    it("OP06-056#2: the activating player is not shown the owner's deck order", () => {
      const game = swordTable("faq-op06-056-2");
      game.play({ type: "activate-main", sourceCardNumber: "OP06-056" });
      choose(game, "two");
      choose(game, "one");
      decline(game);

      expect(game.state.players.p2.deck).toHaveLength(2);
      const view = observe(game.state, "p1").opponent;
      expect(view.deckCount).toBe(2);
      expect(Object.keys(view)).not.toContain("deck");
    });
  });

  describe("OP06-058 Gravity Blade Raging Tiger", () => {
    const tigerTable = (seed: string) =>
      table(seed)
        .withHand("p1", [instance("tiger", "OP06-058")])
        .withBoard("p2", [
          character("first", "FIX-002"),
          character("second", "FIX-001"),
        ])
        .build();

    // As OP06-056: one `choose` moves both cards in p1's pick order, and the
    // owner is never asked.
    it.fails(
      "OP06-058#1: the owner orders the two Characters going under their deck",
      () => {
        const game = tigerTable("faq-op06-058-1");
        game.play({ type: "activate-main", sourceCardNumber: "OP06-058" });
        choose(game, "first");
        choose(game, "second");
        if (effectOptions(game).includes("done")) {
          game.play({ type: "resolve-effect", optionId: "done" });
        }
        expect(game.state.pendingEffect).not.toBeNull();
        expect(game.player).toBe("p2");
      },
    );

    it("OP06-058#2: the activating player is not shown the owner's deck order", () => {
      const game = tigerTable("faq-op06-058-2");
      game.play({ type: "activate-main", sourceCardNumber: "OP06-058" });
      choose(game, "first");
      choose(game, "second");
      decline(game);

      expect(game.state.players.p2.deck).toHaveLength(2);
      const view = observe(game.state, "p1").opponent;
      expect(view.deckCount).toBe(2);
      expect(Object.keys(view)).not.toContain("deck");
    });
  });
});

/** Answers a `DON!! −N` cost's "which DON!! goes back" prompts. */
function payDonMinus(game: Game): void {
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game).some((id) => id.startsWith("return-don:"))
  ) {
    if (guard++ > 20) throw new Error("DON!! cost never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Plays OP06-074 Zephyr from p1's hand, pays DON!! −1 and names `target`. */
function zephyr(game: Game, target: string): void {
  game.play({ type: "play-card", cardNumber: "OP06-074" });
  apply(game);
  payDonMinus(game);
  choose(game, target);
  decline(game);
}

describe("FAQ OP-06: Purple", () => {
  it("OP06-061#1: Ichiji's debuff and [Rush] stay after the DON!! count stops qualifying", () => {
    // 9 DON!! each: level, so the clause resolves. OP07-066 Tony Tony.Chopper
    // then adds one to p1's field, which puts p1 ahead.
    const game = table("faq-op06-061-1")
      .withDonDeck("p1", 1)
      .withDonDeck("p2", 1)
      .withHand("p1", [
        instance("ichiji", "OP06-061"),
        instance("chopper", "OP07-066"),
      ])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-061" });
    choose(game, "target");
    decline(game);
    game.play({ type: "play-card", cardNumber: "OP07-066" });
    settle(game);
    expect(game.state.players.p1.donDeck).toHaveLength(0);

    expect(currentPower(game.state, "p2", "target")).toBe(2_000);
    expect(hasKeyword(game.state, "p1", "ichiji", "Rush")).toBe(true);
    expect(attackers(game)).toContain("ichiji");
  });

  it("OP06-065#1: Niji's return branch can take a cost-2 Character", () => {
    const game = table("faq-op06-065-1")
      .withHand("p1", [instance("niji", "OP06-065")])
      .withBoard("p2", [character("cheap", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-065" });
    game.play({ type: "resolve-effect", optionId: "bounce" });
    choose(game, "cheap");
    decline(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["cheap"]);
  });

  it("OP06-072#1: Cosette cannot block once the attacker's [When Attacking] narrows the DON!! gap", () => {
    // p1 holds 8 DON!! to p2's 10: two behind, so Cosette is a [Blocker].
    // ST10-013 Eustass"Captain"Kid pays DON!! −1 when it attacks.
    const game = defending("faq-op06-072-1")
      .withLeader("p1", "OP06-042")
      .withBoard("p1", [character("cosette", "OP06-072")])
      .withDonDeck("p1", 2)
      .withBoard("p2", [character("kid", "ST10-013")])
      .withLife("p1", lifeCards("p1", 3))
      .build();
    expect(hasKeyword(game.state, "p1", "cosette", "Blocker")).toBe(true);

    attack(game, "kid", "p1-leader");
    apply(game);
    payDonMinus(game);
    settle(game);

    expect(game.state.phase).toBe("block");
    expect(game.player).toBe("p1");
    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      false,
    );
  });

  describe("OP06-074 Zephyr (Navy)", () => {
    it("OP06-074#1: negation leaves a +1000 from another card in place", () => {
      // p2's OP06-006 Saga gave itself +1000 until p2's next turn, which holds
      // it at 6000 -- above the K.O. ceiling -- through p1's turn.
      const game = defending("faq-op06-074-1")
        .withBoard("p2", [
          character("saga", "OP06-006"),
          character("schneider", "OP06-008"),
        ])
        .withGivenDon("p2", "saga", 1)
        .withLife("p1", lifeCards("p1", 3))
        .withHand("p1", [instance("zephyr", "OP06-074")])
        .withDeckTop("p1", deckCards("p1", 2))
        .withDeckTop("p2", deckCards("p2", 2))
        .build();

      attack(game, "saga", "p1-leader");
      choose(game, "schneider");
      decline(game);
      noDefence(game);
      game.pass();
      expect(game.state.activePlayer).toBe("p1");
      // The DON!! still on Saga adds nothing on p1's turn.
      expect(currentPower(game.state, "p2", "saga", false)).toBe(6_000);

      zephyr(game, "saga");

      expect(ids(game.state.players.p2.board)).toEqual(["saga"]);
      expect(currentPower(game.state, "p2", "saga", false)).toBe(6_000);
    });

    it("OP06-074#2: a Character negated and K.O.'d does not run its [On K.O.]", () => {
      // OP14-065 Senor Pink's [On K.O.] would send one of p1's DON!! back.
      const game = table("faq-op06-074-2")
        .withHand("p1", [instance("zephyr", "OP06-074")])
        .withBoard("p2", [character("pink", "OP14-065")])
        .build();

      zephyr(game, "pink");

      expect(ids(game.state.players.p2.trash)).toContain("pink");
      // The one DON!! Zephyr paid is the only one back in the DON!! deck.
      expect(game.state.players.p1.donDeck).toHaveLength(1);
    });

    it("OP06-074#3: a 7000 base shrunk to 5000 or less by another card is K.O.'d", () => {
      // OP08-019 Munch-Munch Mutation's [Main] stands in for OP01-006 Otama;
      // OP06-083 Oars is the 7000 base.
      const game = table("faq-op06-074-3")
        .withHand("p1", [
          instance("mutation", "OP08-019"),
          instance("zephyr", "OP06-074"),
        ])
        .withBoard("p2", [character("oars", "OP06-083")])
        .build();

      game.play({ type: "activate-main", sourceCardNumber: "OP08-019" });
      choose(game, "oars");
      decline(game);
      expect(currentPower(game.state, "p2", "oars")).toBe(4_000);

      zephyr(game, "oars");
      expect(ids(game.state.players.p2.trash)).toContain("oars");
    });

    it("OP06-074#4: a Character another card protects from K.O. by effects is negated but not K.O.'d", () => {
      // OP10-070 Trebol's [On Play] stands in for OP04-083 Sabo: p2's
      // Characters with 1000 base power or less cannot be K.O.'d by p1's
      // effects through p1's turn.
      const game = defending("faq-op06-074-4")
        .withHand("p2", [instance("trebol", "OP10-070")])
        .withBoard("p2", [character("ratchet", "OP06-014")])
        .withHand("p1", [instance("zephyr", "OP06-074")])
        .withDeckTop("p1", deckCards("p1", 2))
        .withDeckTop("p2", deckCards("p2", 2))
        .build();

      game.play({ type: "play-card", cardNumber: "OP10-070" });
      settle(game);
      game.pass();

      zephyr(game, "ratchet");
      expect(ids(game.state.players.p2.board)).toContain("ratchet");
    });

    it("OP06-074#5: negating the Character does not take back the +2000 its [On Play] gave the Leader", () => {
      // EB04-007 Roronoa Zoro stands in for OP02-004 Edward.Newgate: +2000 on
      // its Leader through p1's turn.
      const game = defending("faq-op06-074-5")
        .withHand("p2", [instance("zoro", "EB04-007")])
        .withHand("p1", [instance("zephyr", "OP06-074")])
        .withDeckTop("p1", deckCards("p1", 2))
        .withDeckTop("p2", deckCards("p2", 2))
        .build();

      game.play({ type: "play-card", cardNumber: "EB04-007" });
      settle(game);
      game.pass();
      expect(currentPower(game.state, "p2", "p2-leader")).toBe(7_000);

      zephyr(game, "zoro");
      expect(ids(game.state.players.p2.board)).toEqual(["zoro"]);
      expect(currentPower(game.state, "p2", "p2-leader")).toBe(7_000);
    });

    it("OP06-074#6: a negated Character can still be targeted by another effect that turn", () => {
      const game = table("faq-op06-074-6")
        .withHand("p1", [
          instance("zephyr", "OP06-074"),
          instance("mutation", "OP08-019"),
        ])
        .withBoard("p2", [character("oars", "OP06-083")])
        .build();

      zephyr(game, "oars");
      expect(ids(game.state.players.p2.board)).toEqual(["oars"]);

      game.play({ type: "activate-main", sourceCardNumber: "OP08-019" });
      expect(effectOptions(game)).toContain("oars");
      choose(game, "oars");
      decline(game);
      expect(currentPower(game.state, "p2", "oars")).toBe(4_000);
    });
  });
});

/** Activates OP06-083 Oars, paying with the {Thriller Bark Pirates} `fodder`. */
function negateOars(game: Game, fodder: string): void {
  game.play({ type: "activate-main", summary: "OP06-083" });
  apply(game);
  choose(game, fodder);
  decline(game);
}

describe("FAQ OP-06: Black", () => {
  it("OP06-080#1: OP06-094 Lola trashed from hand to pay the Leader's cost can be the card it plays", () => {
    const game = table("faq-op06-080-1")
      .withLeader("p1", "OP06-080")
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [instance("lola", "OP06-094")])
      .withDeckTop("p1", deckCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .build();

    attack(game, "p1-leader", "p2-leader");
    apply(game);
    choose(game, "lola");
    expect(effectOptions(game)).toContain("lola");
    choose(game, "lola");
    decline(game);

    expect(ids(game.state.players.p1.board)).toEqual(["lola"]);
  });

  describe("OP06-083 Oars", () => {
    it("OP06-083#1: negating Oars keeps a +1000 it already has", () => {
      const game = table("faq-op06-083-1")
        .withBoard("p1", [
          character("oars", "OP06-083"),
          character("fodder", "OP06-087"),
        ])
        .withGivenDon("p1", "oars", 1)
        .build();
      expect(currentPower(game.state, "p1", "oars")).toBe(8_000);

      negateOars(game, "fodder");
      expect(currentPower(game.state, "p1", "oars")).toBe(8_000);
    });

    it("OP06-083#2: [Banish] from OP06-101 O-Nami survives Oars negating itself", () => {
      const game = table("faq-op06-083-2")
        .withBoard("p1", [
          character("oars", "OP06-083"),
          character("fodder", "OP06-087"),
        ])
        .withHand("p1", [instance("nami", "OP06-101")])
        .withLife("p2", [instance("p2-life", "OP06-116")])
        .build();

      game.play({ type: "play-card", cardNumber: "OP06-101" });
      choose(game, "oars");
      decline(game);
      negateOars(game, "fodder");
      expect(hasKeyword(game.state, "p1", "oars", "Banish")).toBe(true);

      attack(game, "oars", "p2-leader");
      game.pass(); // no block
      expect(
        game.legalActions().some((action) => action.type === "resolve-trigger"),
      ).toBe(false);
      noDefence(game);

      // No Trigger, and the Life card is trashed rather than taken.
      expect(ids(game.state.players.p2.trash)).toContain("p2-life");
      expect(game.state.players.p2.hand).toHaveLength(0);
    });

    it("OP06-083#3: a negated Oars can still be targeted by another effect that turn", () => {
      const game = table("faq-op06-083-3")
        .withBoard("p1", [
          character("oars", "OP06-083"),
          character("fodder", "OP06-087"),
        ])
        .withHand("p1", [instance("nami", "OP06-101")])
        .build();

      negateOars(game, "fodder");
      game.play({ type: "play-card", cardNumber: "OP06-101" });
      expect(effectOptions(game)).toContain("oars");
      choose(game, "oars");
      decline(game);
      expect(hasKeyword(game.state, "p1", "oars", "Banish")).toBe(true);
    });

    it("OP06-083#4: a negated Oars is not a Character with no base effect", () => {
      // EB03-009 Makino buffs a Character with no base effect; FIX-001 prints
      // none, so the activation has a target and is offered.
      const game = table("faq-op06-083-4")
        .withBoard("p1", [
          character("oars", "OP06-083"),
          character("fodder", "OP06-087"),
          character("makino", "EB03-009"),
          character("vanilla", "FIX-001"),
        ])
        .build();

      negateOars(game, "fodder");
      game.play({ type: "activate-main", summary: "EB03-009" });
      apply(game);
      expect(effectOptions(game)).toContain("vanilla");
      expect(effectOptions(game)).not.toContain("oars");
    });

    it("OP06-083#5: Oars negated on the turn it is played still cannot attack", () => {
      const game = table("faq-op06-083-5")
        .withHand("p1", [instance("oars", "OP06-083")])
        .withBoard("p1", [character("fodder", "OP06-087")])
        .withLife("p2", lifeCards("p2", 3))
        .build();

      game.play({ type: "play-card", cardNumber: "OP06-083" });
      decline(game);
      negateOars(game, "fodder");
      expect(attackers(game)).not.toContain("oars");
    });
  });

  describe("OP06-086 Gecko Moria", () => {
    it("OP06-086#1: a single Character found is played active", () => {
      const game = table("faq-op06-086-1")
        .withHand("p1", [instance("moria", "OP06-086")])
        .withTrash("p1", [instance("only", "OP06-089")])
        .withDeckTop("p1", deckCards("p1", 3))
        .build();

      game.play({ type: "play-card", cardNumber: "OP06-086" });
      choose(game, "only");
      // No question about which card comes in rested: there is no other card.
      expect(
        effectOptions(game).some(
          (id) => id === "rest-small" || id === "rest-big",
        ),
      ).toBe(false);
      settle(game);

      const only = game.state.players.p1.board.find(
        (card) => card.instanceId === "only",
      );
      expect(only?.rested).toBe(false);
    });

    // The engine queues the two `[On Play]`s in the order the cards were
    // played and runs them in that order; the player is not asked.
    it.fails(
      "OP06-086#2: the player orders the [On Play]s of the two Characters",
      () => {
        const game = table("faq-op06-086-2")
          .withHand("p1", [instance("moria", "OP06-086")])
          .withTrash("p1", [
            instance("ryuma", "OP06-036"),
            instance("taralan", "OP06-089"),
          ])
          .withBoard("p2", [character("victim", "FIX-001", { rested: true })])
          .withDeckTop("p1", deckCards("p1", 3))
          .build();

        game.play({ type: "play-card", cardNumber: "OP06-086" });
        choose(game, "ryuma");
        choose(game, "taralan");
        game.play({ type: "resolve-effect", optionId: "rest-small" });

        expect(
          game.state.pendingEffect?.kind === "mechanic-choice" &&
            game.state.pendingEffect.choice.kind === "order-reactions",
        ).toBe(true);
      },
    );

    it("OP06-086#3: a Character trashed to make room for the second one never runs its [On Play]", () => {
      const game = table("faq-op06-086-3")
        .withHand("p1", [instance("moria", "OP06-086")])
        .withBoard("p1", [
          character("mine-1", "FIX-001"),
          character("mine-2", "FIX-001"),
          character("mine-3", "FIX-001"),
        ])
        .withTrash("p1", [
          instance("ryuma", "OP06-036"),
          instance("taralan", "OP06-089"),
        ])
        .withBoard("p2", [character("victim", "FIX-001", { rested: true })])
        .withDeckTop("p1", deckCards("p1", 3))
        .build();

      game.play({ type: "play-card", cardNumber: "OP06-086" });
      choose(game, "ryuma");
      choose(game, "taralan");
      game.play({ type: "resolve-effect", optionId: "rest-small" });
      game.play({ type: "resolve-effect", summary: "Trash Ryuma" });
      settle(game);

      expect(ids(game.state.players.p1.trash)).toContain("ryuma");
      // Ryuma's [On Play] would have K.O.'d the rested victim.
      expect(ids(game.state.players.p2.board)).toEqual(["victim"]);
      // Taralan's still ran: three cards milled.
      expect(game.state.players.p1.trash).toHaveLength(4);
    });
  });

  it("OP06-091#1: Victoria Cindry mills only its own deck", () => {
    const game = table("faq-op06-091-1")
      .withLeader("p1", "OP06-080")
      .withHand("p1", [instance("cindry", "OP06-091")])
      .withDeckTop("p1", deckCards("p1", 6))
      .withDeckTop("p2", deckCards("p2", 6))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-091" });
    expect(game.state.pendingEffect).toBeNull();

    expect(game.state.players.p1.trash).toHaveLength(5);
    expect(game.state.players.p2.deck).toHaveLength(6);
    expect(game.state.players.p2.trash).toHaveLength(0);
  });

  describe("OP06-092 Brook", () => {
    it("OP06-092#1: a Character trashed by Brook does not run its [On K.O.]", () => {
      // OP14-065 Senor Pink's [On K.O.] would send one of p1's DON!! back.
      const game = table("faq-op06-092-1")
        .withHand("p1", [instance("brook", "OP06-092")])
        .withBoard("p2", [character("pink", "OP14-065")])
        .build();

      game.play({ type: "play-card", cardNumber: "OP06-092" });
      game.play({ type: "resolve-effect", optionId: "trash" });
      choose(game, "pink");
      decline(game);

      expect(ids(game.state.players.p2.trash)).toEqual(["pink"]);
      expect(game.state.players.p1.donDeck).toHaveLength(0);
    });

    it("OP06-092#2: Brook can trash a Character that cannot be K.O.'d by effects", () => {
      // OP09-086 Jesus Burgess stands in for OP02-114 Borsalino.
      const game = table("faq-op06-092-2")
        .withHand("p1", [instance("brook", "OP06-092")])
        .withBoard("p2", [character("burgess", "OP09-086")])
        .build();

      game.play({ type: "play-card", cardNumber: "OP06-092" });
      game.play({ type: "resolve-effect", optionId: "trash" });
      choose(game, "burgess");
      decline(game);

      expect(ids(game.state.players.p2.trash)).toEqual(["burgess"]);
    });

    it("OP06-092#3: with 2 cards in the opponent's trash, the bury branch takes both", () => {
      const game = table("faq-op06-092-3")
        .withHand("p1", [instance("brook", "OP06-092")])
        .withTrash("p2", copies(2, "FIX-001", "their-trash"))
        .build();

      game.play({ type: "play-card", cardNumber: "OP06-092" });
      expect(effectOptions(game)).toContain("bury-trash");
      game.play({ type: "resolve-effect", optionId: "bury-trash" });
      decline(game);

      expect(game.state.players.p2.trash).toHaveLength(0);
      expect(ids(game.state.players.p2.deck)).toEqual(
        expect.arrayContaining(["their-trash-1", "their-trash-2"]),
      );
    });
  });
});

describe("FAQ OP-06: Yellow", () => {
  /** p1 holds `cardNumber` on the board and p2 a cost-1 Stage. */
  const stageTable = (seed: string, cardNumber: string) =>
    table(seed)
      .withBoard("p1", [character("payer", cardNumber)])
      .withStage("p2", instance("their-stage", "FIX-STAGE-ZOU"));

  it("OP06-102#1: Kamakiri can pay with the opponent's cost-1 Stage", () => {
    const game = stageTable("faq-op06-102-1", "OP06-102")
      .withBoard("p2", [character("cheap", "FIX-002")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-102" });
    apply(game);
    choose(game, "their-stage");
    choose(game, "cheap");
    decline(game);

    expect(game.state.players.p2.stage).toBeNull();
    expect(ids(game.state.players.p2.deck)).toContain("their-stage");
    expect(ids(game.state.players.p2.trash)).toContain("cheap");
  });

  it("OP06-103#1: a Character pushed below 0 power is not one with 0 power", () => {
    // p2's OP11-009 Nico Robin leaves p1's 0-power OP06-014 Ratchet at −2000
    // through p1's next turn. OP06-072 Cosette, also printed at 0, is the
    // eligible control.
    const game = defending("faq-op06-103-1")
      .withBoard("p2", [character("robin", "OP11-009")])
      .withGivenDon("p2", "robin", 2)
      .withBoard("p1", [
        character("kawamatsu", "OP06-103"),
        character("ratchet", "OP06-014"),
        character("cosette", "OP06-072"),
      ])
      .withHand("p1", copies(2, "FIX-001", "p1-hand"))
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .withDeckTop("p1", deckCards("p1", 2))
      .withDeckTop("p2", deckCards("p2", 2))
      .build();

    attack(game, "robin", "p1-leader");
    choose(game, "ratchet");
    decline(game);
    noDefence(game);
    game.pass();
    expect(game.state.activePlayer).toBe("p1");

    attack(game, "kawamatsu", "p2-leader");
    apply(game);
    choose(game, "p1-hand-1");
    choose(game, "p1-hand-2");
    expect(effectOptions(game)).toContain("cosette");
    expect(effectOptions(game)).not.toContain("ratchet");
  });

  it("OP06-106#1: the card Hiyori puts on Life goes face-down, unseen by the opponent", () => {
    const game = table("faq-op06-106-1")
      .withHand("p1", [
        instance("hiyori", "OP06-106"),
        instance("secret", "FIX-002"),
      ])
      .withLife("p1", lifeCards("p1", 2))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-106" });
    apply(game);
    choose(game, game.state.players.p1.life[0]!.instanceId);
    choose(game, "secret");
    decline(game);

    const life = game.state.players.p1.life;
    expect(life.map((card) => card.instanceId)).toContain("secret");
    expect(life.find((card) => card.instanceId === "secret")?.faceUp).not.toBe(
      true,
    );
    expect(game.events.some((event) => event.type === "card-revealed")).toBe(
      false,
    );
    expect(JSON.stringify(observe(game.state, "p2").opponent)).not.toContain(
      "secret",
    );
  });

  it("OP06-107#1: Momonosuke cannot add another card named Kouzuki Momonosuke", () => {
    // ST28-004 stands in for OP01-041: a {Land of Wano} Kouzuki Momonosuke
    // with another card number. OP06-104 Kikunojo is the eligible control.
    const game = table("faq-op06-107-1")
      .withHand("p1", [instance("momo", "OP06-107")])
      .withBoard("p1", [
        character("other-momo", "ST28-004"),
        character("kikunojo", "OP06-104"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-107" });
    expect(effectOptions(game)).toContain("kikunojo");
    expect(effectOptions(game)).not.toContain("other-momo");
  });

  it("OP06-111#1: Braham can pay with the opponent's cost-1 Stage", () => {
    const game = stageTable("faq-op06-111-1", "OP06-111")
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-111" });
    apply(game);
    choose(game, "their-stage");
    choose(game, "target");
    decline(game);

    expect(game.state.players.p2.stage).toBeNull();
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  it("OP06-114#1: Wyper can pay with the opponent's cost-1 Stage", () => {
    const game = table("faq-op06-114-1")
      .withHand("p1", [instance("wyper", "OP06-114")])
      .withStage("p2", instance("their-stage", "FIX-STAGE-ZOU"))
      .withDeckTop("p1", [instance("genbo", "OP06-105"), ...deckCards("p1", 4)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-114" });
    apply(game);
    choose(game, "their-stage");
    choose(game, "genbo");
    decline(game);

    expect(game.state.players.p2.stage).toBeNull();
    expect(ids(game.state.players.p1.hand)).toEqual(["genbo"]);
  });

  it("OP06-115#1: on 0 Life with an empty hand, the [Trigger] still adds the deck's top card to Life", () => {
    const game = defending("faq-op06-115-1")
      .withLife("p1", [instance("disappear", "OP06-115")])
      .withDeckTop("p1", [
        instance("new-life", "FIX-001"),
        ...deckCards("p1", 2),
      ])
      .build();
    expect(game.state.players.p1.hand).toHaveLength(0);

    attack(game, "p2-leader", "p1-leader");
    game.pass(); // no block
    game.pass(); // no Counter
    game.play({ type: "resolve-trigger", optionId: "activate" });
    apply(game);
    settle(game);

    expect(ids(game.state.players.p1.life)).toEqual(["new-life"]);
  });

  it("OP06-116#1: Reject's damage branch adds no Life card when the opponent is not on 1 Life", () => {
    const game = table("faq-op06-116-1")
      .withHand("p1", [instance("reject", "OP06-116")])
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 2))
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP06-116" });
    game.play({ type: "resolve-effect", optionId: "damage" });
    settle(game);

    expect(game.state.players.p2.life).toHaveLength(2);
    expect(game.state.players.p1.life).toHaveLength(3);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("OP06-118#1: a Zoro that skipped its [When Attacking] can use it on its next attack", () => {
    const game = table("faq-op06-118-1")
      .withBoard("p1", [character("zoro", "OP06-118")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    attack(game, "zoro", "p2-leader");
    expect(effectOptions(game)).toContain("skip");
    game.play({ type: "resolve-effect", optionId: "skip" });
    noDefence(game);

    game.play({ type: "activate-main", summary: "OP06-118" });
    apply(game);
    settle(game);
    expect(attackers(game)).toContain("zoro");

    attack(game, "zoro", "p2-leader");
    expect(effectOptions(game)).toContain("apply");
  });
});
