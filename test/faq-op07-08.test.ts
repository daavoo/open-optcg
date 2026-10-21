import { describe, expect, it } from "vitest";
import { currentPower, observe } from "@one-piece-sim/engine-core";
import type { LegalAction, PublicEvent } from "@one-piece-sim/protocol";

type PublicEventType = PublicEvent["type"];

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-07 (500 Years in the Future) and OP-08 (Two
 * Legends), one case per ruling, named by the Q&A id (`<card>#<n>`, in the
 * order the PDF prints them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. A ruling the engine disagrees with is an `it.fails`
 * that says what the engine does instead: it turns green -- and so red under
 * `it.fails` -- the day the engine is fixed, which is the prompt to promote it.
 * Comments paraphrase the cards and the rulings; the repository holds none of
 * Bandai's text.
 *
 * Source PDFs: https://en.onepiece-cardgame.com/pdf/qa_op07.pdf and
 * https://en.onepiece-cardgame.com/pdf/qa_op08.pdf
 */

/** Rulings with no engine decision and no observable consequence to assert. */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

/** p1 to act in its Main Phase, both sides bare, all ten DON!! active. */
const table = (seed: string, turn = 5) =>
  scenario()
    .decks("FIXTURE-RED", "FIXTURE-BLUE")
    .seed(seed)
    .atTurn(turn, { active: "p1" })
    .bareTable();

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** The card ids an open effect choice offers. */
function cardOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .flatMap((action) =>
      action.type === "resolve-effect" && action.option.kind === "card"
        ? [action.option.card.instanceId]
        : [],
    );
}

const choose = (game: Game, instanceId: string): void => {
  game.play(
    (action) =>
      action.type === "resolve-effect" &&
      action.option.kind === "card" &&
      action.option.card.instanceId === instanceId,
  );
};

const offered = (game: Game, type: LegalAction["type"], player = game.player) =>
  game.legalActions(player).filter((action) => action.type === type);

const attack = (game: Game, attacker: string, target: string): void => {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
};

/**
 * Whether an effect is open, read through a call so a loop that has just
 * resolved one does not leave the type checker sure there is none.
 */
const pending = (game: Game): boolean => game.state.pendingEffect !== null;

/** The same, for a battle in progress. */
const inBattle = (game: Game): boolean => game.state.activeAttack !== null;

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const power = (game: Game, player: "p1" | "p2", instanceId: string) =>
  currentPower(game.state, player, instanceId, true);

describe("FAQ OP-07", () => {
  describe("OP07-001 Monkey.D.Dragon", () => {
    const dragon = (seed: string) => table(seed).withLeader("p1", "OP07-001");

    it("OP07-001#1: the two DON!! all land on one Character, never split", () => {
      // The ruling: the moved DON!! cannot be shared out between two
      // Characters. The program binds one recipient.
      const game = dragon("faq-op07-001-1")
        .withBoard("p1", [
          character("holder", "FIX-002"),
          character("a", "FIX-001"),
          character("b", "FIX-001"),
        ])
        .withGivenDon("p1", "holder", 2)
        .build();

      game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
      // One card per option: there is no option naming two recipients.
      const kinds = game
        .legalActions()
        .flatMap((action) =>
          action.type === "resolve-effect" ? [action.option.kind] : [],
        );
      for (const kind of kinds) {
        expect(["card", "skip", "confirm"]).toContain(kind);
      }
      choose(game, "a");
      settle(game);

      const board = game.state.players.p1.board;
      expect(
        board.find((card) => card.instanceId === "a")?.attachedDon,
      ).toHaveLength(2);
      expect(
        board.find((card) => card.instanceId === "b")?.attachedDon ?? [],
      ).toHaveLength(0);
      expect(
        board.find((card) => card.instanceId === "holder")?.attachedDon,
      ).toHaveLength(0);
    });

    it("OP07-001#2: the DON!! cannot be given back to the Character already holding them", () => {
      // The ruling: re-giving the same two DON!! to their current holder is
      // not a legal use. With every given DON!! on one Character, choosing it
      // moves nothing.
      const game = dragon("faq-op07-001-2")
        .withBoard("p1", [
          character("holder", "FIX-002"),
          character("other", "FIX-001"),
        ])
        .withGivenDon("p1", "holder", 2)
        .build();

      game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
      if (cardOptions(game).includes("holder")) {
        choose(game, "holder");
        settle(game);
      }
      const holder = game.state.players.p1.board.find(
        (card) => card.instanceId === "holder",
      );
      expect(holder?.attachedDon).toHaveLength(2);
      expect(
        game.state.players.p1.board.find((card) => card.instanceId === "other")
          ?.attachedDon ?? [],
      ).toHaveLength(0);
    });

    it("OP07-001#3: one DON!! each off two Characters can both move to a third", () => {
      // The ruling: yes.
      const game = dragon("faq-op07-001-3")
        .withBoard("p1", [
          character("a", "FIX-001"),
          character("b", "FIX-001"),
          character("c", "FIX-002"),
        ])
        .withGivenDon("p1", "a", 1)
        .withGivenDon("p1", "b", 1)
        .build();

      game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
      choose(game, "c");
      settle(game);

      const board = game.state.players.p1.board;
      expect(
        board.find((card) => card.instanceId === "c")?.attachedDon,
      ).toHaveLength(2);
      expect(
        board.find((card) => card.instanceId === "a")?.attachedDon,
      ).toHaveLength(0);
      expect(
        board.find((card) => card.instanceId === "b")?.attachedDon,
      ).toHaveLength(0);
    });
  });

  describe("OP07-002 Ain", () => {
    it("OP07-002#1: a Counter given after Ain's set-to-0 adds on top, so the target is 1000", () => {
      // The ruling: during the battle the Character is at 1000.
      const game = table("faq-op07-002-1")
        .withHand("p1", [instance("ain", "OP07-002")])
        .withBoard("p2", [character("target", "FIX-002", { rested: true })])
        .withHand("p2", [instance("p2-counter", "FIX-001")])
        .withLife("p2", copies(2, "FIX-001", "p2-life"))
        .build();

      game.play({ type: "play-card", cardNumber: "OP07-002" });
      choose(game, "target");
      settle(game);
      expect(power(game, "p2", "target")).toBe(0);

      attack(game, "p1-leader", "target");
      game.pass(); // no block
      game.play({ type: "counter", cardInstanceId: "p2-counter" });
      game.pass(); // done countering
      const battle = game.events.find(
        (event) => event.type === "battle-resolved",
      );
      expect(battle).toMatchObject({ defensePower: 1_000 });
    });

    // Engine disagrees: Ain's clause is a `set-base-power` (op07-on-play.ts),
    // and a base-power setter keeps every power modifier on the card, the
    // ones applied *before* it included -- so Hack carrying +2000 from KEEP
    // OUT reads 0 + 2000 = 2000 for the rest of p1's turn instead of 0. The
    // ruling treats setting the power to 0 as overriding what was there and
    // letting only later changes stack on top (#1); modelling that needs a
    // timestamped power layer rather than a base-power override, which would
    // move every set-power card at once.
    it.fails(
      "OP07-002#2: Ain zeroes a Hack carrying KEEP OUT's +2000 this turn; it is back to 7000 on its owner's turn",
      () => {
        const game = scenario()
          .decks("FIXTURE-RED", "FIXTURE-BLUE")
          .seed("faq-op07-002-2")
          .atTurn(5, { active: "p1" })
          .bareTable()
          .withLeader("p2", "OP07-001")
          .withBoard("p1", [character("attacker", "FIX-002")])
          .withHand("p1", [instance("ain", "OP07-002")])
          .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
          .withBoard("p2", [character("hack", "OP05-012", { rested: true })])
          .withHand("p2", [instance("keep-out", "OP07-018")])
          .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
          .withLife("p2", copies(2, "FIX-001", "p2-life"))
          .build();

        // KEEP OUT on Hack during p1's turn: +2000 to the end of p2's turn.
        attack(game, "attacker", "hack");
        game.pass(); // no block
        game.play({
          type: "activate-counter-event",
          sourceCardNumber: "OP07-018",
        });
        choose(game, "hack");
        settle(game);
        while (game.state.activeAttack) game.pass();
        expect(power(game, "p2", "hack")).toBe(7_000);

        game.play({ type: "play-card", cardNumber: "OP07-002" });
        choose(game, "hack");
        settle(game);
        expect(power(game, "p2", "hack")).toBe(0);

        game.pass();
        expect(game.state.turnPlayerId).toBe("p2");
        expect(power(game, "p2", "hack")).toBe(7_000);
      },
    );
  });

  describe("[Your Turn] [On Play] +2000 bodies", () => {
    const buffOnce = (
      seed: string,
      body: string,
      leader: string,
      expected: number,
    ) => {
      const game = table(seed)
        .withLeader("p1", leader)
        .withHand("p1", [instance("body", body)])
        .build();
      game.play({ type: "play-card", cardNumber: body });
      if (cardOptions(game).includes("p1-leader")) choose(game, "p1-leader");
      settle(game);
      // One +2000 on top of the printed 5000: the [Your Turn] marker is a
      // condition on the [On Play], not a second ability.
      expect(power(game, "p1", "p1-leader")).toBe(expected);
    };

    it("OP07-014#1: Moda gives its Ace one +2000, not two", () => {
      // The ruling: no -- a single [On Play] that only works on your turn.
      buffOnce("faq-op07-014-1", "OP07-014", "OP16-001", 7_000);
    });

    it("OP07-043#1: Salome gives its Boa Hancock one +2000, not two", () => {
      buffOnce("faq-op07-043-1", "OP07-043", "OP07-038", 7_000);
    });

    it("OP07-088#1: Hattori gives its Rob Lucci one +2000, not two", () => {
      buffOnce("faq-op07-088-1", "OP07-088", "OP07-079", 7_000);
    });
  });

  it("OP07-017#1: Dragon Breath K.O.s a Character with no Stage on the other side", () => {
    // The ruling: yes -- the two halves are independent "up to"s.
    const game = table("faq-op07-017-1")
      .withHand("p1", [instance("breath", "OP07-017")])
      .withBoard("p2", [character("small", "FIX-001")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP07-017" });
    choose(game, "small");
    settle(game);

    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.trash)).toContain("small");
  });

  describe("OP07-019 Jewelry Bonney", () => {
    it("OP07-019#1: declined on the first attack, the [Once Per Turn] is still there for the second", () => {
      // The ruling: yes.
      const game = scenario()
        .decks("FIXTURE-RED", "FIXTURE-BLUE")
        .seed("faq-op07-019-1")
        .atTurn(6, { active: "p2" })
        .bareTable()
        .withLeader("p1", "OP07-019")
        .withLife("p1", copies(3, "FIX-001", "p1-life"))
        .withBoard("p2", [
          character("first", "FIX-002"),
          character("second", "FIX-002"),
        ])
        .build();

      attack(game, "first", "p1-leader");
      expect(game.player).toBe("p1");
      expect(game.summaries().join(" | ")).toMatch(/Jewelry Bonney|Rest/);
      game.play({ type: "resolve-effect", summary: "Don't apply" });
      while (game.state.activeAttack) game.pass();
      expect(game.state.players.p2.board.map((card) => card.rested)).toEqual([
        true,
        false,
      ]);

      attack(game, "second", "p1-leader");
      expect(game.player).toBe("p1");
      game.play(
        (action) =>
          action.type === "resolve-effect" && action.option.kind !== "skip",
      );
      choose(game, "p2-leader");
      settle(game);
      expect(game.state.players.p2.leaderRested).toBe(true);
      expect(game.state.players.p1.restedDon).toHaveLength(1);
    });

    // Engine disagrees: Kalgara's [When Attacking] plays Raki, and Raki's
    // [On Play] resolves -- putting the second {Shandian Warrior} down --
    // before the defender is offered OP07-019's [On Your Opponent's Attack],
    // so the second body is already on the field when Bonney chooses. The
    // ruling has the defender's reaction answer the attack declaration
    // before the [On Play] that the [When Attacking] raised; that is an
    // ordering change in how battle.ts queues attack reactions against
    // triggers raised inside a [When Attacking], which reaches every such
    // pair rather than one card.
    it.fails(
      "OP07-019#2: a Character played by the attacker's [On Play] after the reaction is past its reach",
      () => {
        // The ruling orders it: the [When Attacking] plays a Character, the
        // defender's [On Your Opponent's Attack] resolves, and only then does the
        // played Character's [On Play] put a second one down -- which is too late
        // to be rested. OP01-060 is not in the pool, so OP08-098 Kalgara's
        // [When Attacking] plays OP15-112 Raki, whose [On Play] plays another
        // {Shandian Warrior}.
        const game = scenario()
          .decks("FIXTURE-RED", "FIXTURE-BLUE")
          .seed("faq-op07-019-2")
          .atTurn(6, { active: "p2" })
          .bareTable()
          .withLeader("p1", "OP07-019")
          .withLife("p1", copies(3, "FIX-001", "p1-life"))
          .withLeader("p2", "OP08-098")
          .withGivenDon("p2", "p2-leader", 1)
          .withLife("p2", copies(3, "FIX-001", "p2-life"))
          .withHand("p2", [
            instance("raki", "OP15-112"),
            instance("second-body", "OP06-105"),
          ])
          .build();

        attack(game, "p2-leader", "p1-leader");
        // Kalgara's [When Attacking]: play Raki.
        expect(game.player).toBe("p2");
        choose(game, "raki");
        // Raki's [On Play] must not have resolved before Bonney is asked.
        const p2Board = () => ids(game.state.players.p2.board);
        while (game.player === "p2" && game.state.pendingEffect) {
          expect(p2Board()).not.toContain("second-body");
          game.play({ type: "resolve-effect" });
        }
        expect(game.player).toBe("p1");
        expect(p2Board()).toEqual(["raki"]);
        expect(cardOptions(game)).not.toContain("second-body");
        // Bonney's answer, then Raki's [On Play] puts the second body down.
        choose(game, "raki");
        settle(game);
        expect(p2Board()).toContain("second-body");
        expect(
          game.state.players.p2.board.find(
            (card) => card.instanceId === "second-body",
          )?.rested,
        ).toBe(false);
      },
    );
  });

  it("OP07-024#1: the Character Koala grants [Blocker] can block the attack that triggered it", () => {
    // The ruling: yes.
    const game = scenario()
      .decks("FIXTURE-RED", "FIXTURE-BLUE")
      .seed("faq-op07-024-1")
      .atTurn(6, { active: "p2" })
      .bareTable()
      .withBoard("p1", [
        character("koala", "OP07-024"),
        character("hack", "OP05-012"),
      ])
      .withLife("p1", copies(3, "FIX-001", "p1-life"))
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();

    attack(game, "attacker", "p1-leader");
    expect(game.player).toBe("p1");
    game.play(
      (action) =>
        action.type === "resolve-effect" && action.option.kind !== "skip",
    );
    if (cardOptions(game).includes("hack")) choose(game, "hack");
    settle(game);

    expect(game.state.phase).toBe("block");
    const blockers = game
      .legalActions()
      .flatMap((action) =>
        action.type === "block" ? [action.blockerInstanceId] : [],
      );
    expect(blockers).toEqual(["hack"]);
    game.play({ type: "block", blockerInstanceId: "hack" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("hack");
  });

  describe("OP07-026 Jewelry Bonney", () => {
    it("OP07-026#1: an active DON!! cannot be held down", () => {
      // The ruling: no -- with only active DON!! on the other side, the
      // DON!! branch has nothing to reach.
      const game = table("faq-op07-026-1")
        .withHand("p1", [instance("bonney", "OP07-026")])
        .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
        .build();

      game.play({ type: "play-card", cardNumber: "OP07-026" });
      // The DON!! branch is offered, but has no DON!! it may reach.
      game.play({ type: "resolve-effect", summary: "rested DON!!" });
      settle(game);
      game.pass();
      expect(game.state.turnPlayerId).toBe("p2");
      expect(game.state.players.p2.restedDon).toEqual([]);
    });

    it("OP07-026#2: a DON!! given to a Character cannot be held down", () => {
      // The ruling: no -- the only rested-looking DON!! sits under a
      // Character, and it comes back active in the Refresh Phase.
      const game = table("faq-op07-026-2")
        .withHand("p1", [instance("bonney", "OP07-026")])
        .withBoard("p2", [character("holder", "FIX-002")])
        .withGivenDon("p2", "holder", 2)
        .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
        .build();

      game.play({ type: "play-card", cardNumber: "OP07-026" });
      // The DON!! branch is offered, but has no DON!! it may reach.
      game.play({ type: "resolve-effect", summary: "rested DON!!" });
      settle(game);
      game.pass();
      expect(game.state.turnPlayerId).toBe("p2");
      expect(game.state.players.p2.restedDon).toEqual([]);
      expect(game.state.players.p2.activeDon).toHaveLength(10);
    });
  });

  describe("OP07-029 Basil Hawkins", () => {
    /** p2 bounces p1's Hawkins with OP09-058 Special Muggy Ball. */
    const bounceHawkins = (game: Game): void => {
      game.play({ type: "activate-main", sourceCardNumber: "OP09-058" });
      choose(game, "hawkins");
    };

    it("OP07-029#1: with no active Character on the other side the replacement is not offered", () => {
      // The ruling: no.
      const game = scenario()
        .decks("FIXTURE-RED", "FIXTURE-BLUE")
        .seed("faq-op07-029-1")
        .atTurn(6, { active: "p2" })
        .bareTable()
        .withBoard("p1", [character("hawkins", "OP07-029")])
        .withBoard("p2", [character("rested", "FIX-002", { rested: true })])
        .withHand("p2", [instance("muggy", "OP09-058")])
        .build();

      bounceHawkins(game);
      expect(game.summaries(game.player).join(" | ")).not.toMatch(/Rest 1/);
      settle(game);
      expect(ids(game.state.players.p1.hand)).toEqual(["hawkins"]);
    });

    it("OP07-029#2: a Character that cannot be rested cannot pay the replacement", () => {
      // The ruling: no -- p1's OP15-029 Bartholomew Kuma has made p2's only
      // active Character unrestable through p2's turn.
      const game = scenario()
        .decks("FIXTURE-RED", "FIXTURE-BLUE")
        .seed("faq-op07-029-2")
        .atTurn(5, { active: "p1" })
        .bareTable()
        .withBoard("p1", [character("hawkins", "OP07-029")])
        .withHand("p1", [instance("kuma", "OP15-029")])
        .withBoard("p2", [character("guarded", "FIX-002")])
        .withHand("p2", [instance("muggy", "OP09-058")])
        .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
        .build();

      game.play({ type: "play-card", cardNumber: "OP15-029" });
      choose(game, "guarded");
      settle(game);
      game.pass();
      expect(game.state.turnPlayerId).toBe("p2");

      bounceHawkins(game);
      expect(game.summaries(game.player).join(" | ")).not.toMatch(/Rest 1/);
      settle(game);
      expect(ids(game.state.players.p1.hand)).toEqual(["hawkins"]);
      expect(game.state.players.p2.board[0]?.rested).toBe(false);
    });
  });

  it("OP07-031#1: resting its own Character to pay an [Activate: Main] fires Bartolomeo", () => {
    // The ruling: yes -- EB01-048 Laboon rests itself as its cost.
    const game = table("faq-op07-031-1")
      .withBoard("p1", [
        character("bartolomeo", "OP07-031"),
        character("laboon", "EB01-048"),
      ])
      .withHand("p1", [instance("in-hand", "FIX-001")])
      .withDeckTop("p1", [instance("drawn", "FIX-002")])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "laboon" });
    while (game.state.pendingEffect) {
      if (cardOptions(game).includes("target")) choose(game, "target");
      else if (cardOptions(game).includes("in-hand")) choose(game, "in-hand");
      else game.play({ type: "resolve-effect" });
    }

    expect(game.state.players.p1.board[1]?.rested).toBe(true);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["in-hand"]);
  });

  // The draw is optional, and passing on it keeps the [Once Per Turn].
  it("OP07-038#1: Hancock's draw passed on the first removal is still there for the second", () => {
    const game = table("faq-op07-038-1")
      .withLeader("p1", "OP07-038")
      .withHand("p1", copies(2, "OP09-058", "muggy"))
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withBoard("p2", [character("x", "FIX-002"), character("y", "FIX-002")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "muggy-1" });
    choose(game, "x");
    // The decline the ruling allows.
    game.play({ type: "resolve-effect", summary: "Don't apply" });
    settle(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["muggy-2"]);

    game.play({ type: "activate-main", sourceInstanceId: "muggy-2" });
    choose(game, "y");
    game.play(
      (action) =>
        action.type === "resolve-effect" && action.option.kind !== "skip",
    );
    settle(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
  });

  it("OP07-042#1: a lone Moria has no other Character to bottom, so it is not saved", () => {
    // The ruling: no.
    const game = scenario()
      .decks("FIXTURE-RED", "FIXTURE-BLUE")
      .seed("faq-op07-042-1")
      .atTurn(6, { active: "p2" })
      .bareTable()
      .withLeader("p1", "OP07-038")
      .withBoard("p1", [character("moria", "OP07-042")])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-058" });
    choose(game, "moria");
    expect(game.summaries(game.player).join(" | ")).not.toMatch(/bottom/);
    settle(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["moria"]);
  });

  describe("OP07-059 Foxy", () => {
    const foxyAttacks = (seed: string, leaderRested: boolean) => {
      let builder = table(seed)
        .withLeader("p1", "OP07-059")
        .withBoard(
          "p1",
          copies(3, "OP07-069", "pickles").map((card) =>
            character(card.instanceId, card.cardNumber),
          ),
        )
        .withBoard("p2", [
          character("rested-1", "FIX-002", { rested: true }),
          character("rested-2", "FIX-001", { rested: true }),
        ])
        .withLife("p2", copies(3, "FIX-001", "p2-life"));
      if (leaderRested) builder = builder.withRestedLeader("p2");
      const game = builder.build();
      attack(game, "p1-leader", "rested-1");
      game.play(
        (action) =>
          action.type === "resolve-effect" && action.option.kind !== "skip",
      );
      return game;
    };

    it("OP07-059#1: the rested Leader and one rested Character are both held down", () => {
      // The ruling: yes.
      const game = foxyAttacks("faq-op07-059-1", true);
      while (game.state.pendingEffect && game.player === "p1") {
        if (cardOptions(game).includes("rested-2")) choose(game, "rested-2");
        else game.play({ type: "resolve-effect" });
      }
      while (game.state.activeAttack) game.pass();
      game.pass();
      expect(game.state.turnPlayerId).toBe("p2");
      expect(game.state.players.p2.leaderRested).toBe(true);
      const board = game.state.players.p2.board;
      expect(board.find((card) => card.instanceId === "rested-2")?.rested).toBe(
        true,
      );
    });

    it("OP07-059#2: with the Leader active, a rested Character is still held down", () => {
      // The ruling: yes.
      const game = foxyAttacks("faq-op07-059-2", false);
      expect(cardOptions(game)).toContain("rested-2");
      choose(game, "rested-2");
      settle(game);
      while (game.state.activeAttack) game.pass();
      game.pass();
      expect(game.state.turnPlayerId).toBe("p2");
      const board = game.state.players.p2.board;
      expect(board.find((card) => card.instanceId === "rested-2")?.rested).toBe(
        true,
      );
    });
  });

  it("OP07-064#1: ST10-001 Law's activation can play Sanji at its discounted hand cost", () => {
    // The ruling: yes -- Law's DON!! −3 puts p1 three behind, Sanji costs 3 in
    // hand, and Law plays cost 4 or less.
    const game = table("faq-op07-064-1")
      .withLeader("p1", "ST10-001")
      .withDonDeck("p1", 4)
      .withHand("p1", [instance("sanji", "OP07-064")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    while (game.state.pendingEffect && !cardOptions(game).includes("sanji")) {
      game.play({ type: "resolve-effect" });
    }
    choose(game, "sanji");
    settle(game);
    expect(ids(game.state.players.p1.board)).toEqual(["sanji"]);
  });

  it("OP07-085#1: a Stussy played onto an empty board can trash itself to pay", () => {
    // The ruling: yes.
    const game = table("faq-op07-085-1")
      .withHand("p1", [instance("stussy", "OP07-085")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-085" });
    while (game.state.pendingEffect) {
      if (cardOptions(game).includes("stussy")) choose(game, "stussy");
      else if (cardOptions(game).includes("victim")) choose(game, "victim");
      else
        game.play(
          (action) =>
            action.type === "resolve-effect" && action.option.kind !== "skip",
        );
    }
    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(["stussy"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["victim"]);
  });

  it("OP07-090#1: the card drawn after the reveal stays hidden", () => {
    // The ruling: no -- the drawn card is the only
    // OP05-012 in the hand, so a reveal of it would name that card number.
    const game = table("faq-op07-090-1")
      .withHand("p1", [instance("morgans", "OP07-090")])
      .withHand("p2", [
        instance("kept", "FIX-001"),
        instance("binned", "FIX-002"),
      ])
      .withDeckTop("p2", [instance("drawn", "OP05-012")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-090" });
    expect(game.player).toBe("p2");
    choose(game, "binned");
    settle(game);

    const revealed = game.events.flatMap((event) =>
      event.type === "card-revealed" ? [event.cardNumber] : [],
    );
    expect(revealed).toEqual(["FIX-001"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["kept", "drawn"]);
    expect(JSON.stringify(observe(game.state, "p1").opponent)).not.toContain(
      "OP05-012",
    );
  });

  it("OP07-091#1: five Characters placed under the deck is one completed three, so +1000", () => {
    // The ruling: +1000 -- the bonus counts whole groups of three.
    const game = table("faq-op07-091-1")
      .withBoard("p1", [character("luffy", "OP07-091")])
      .withTrash("p1", copies(5, "OP07-091", "big"))
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();

    attack(game, "luffy", "p2-leader");
    for (let index = 1; index <= 5; index += 1) choose(game, `big-${index}`);
    while (game.state.pendingEffect && game.player === "p1") {
      game.play(
        (action) =>
          action.type === "resolve-effect" && !(action.option.kind === "skip"),
      );
    }
    expect(game.state.players.p1.trash).toEqual([]);
    expect(power(game, "p1", "luffy")).toBe(7_000);
  });

  it("OP07-093#1: Rob Lucci's controller picks the card bottomed from the opponent's trash", () => {
    // The ruling: Lucci's controller chooses, and the card goes under its
    // owner's deck.
    const game = table("faq-op07-093-1")
      .withHand("p1", [instance("lucci", "OP07-093")])
      .withTrash("p1", copies(3, "FIX-001", "p1-trash"))
      .withHand("p2", [instance("p2-hand", "FIX-001")])
      .withTrash("p2", [
        instance("p2-trash-a", "FIX-001"),
        instance("p2-trash-b", "FIX-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-093" });
    // Pay with the three trash cards, then the opponent discards.
    while (
      game.state.pendingEffect &&
      !cardOptions(game).includes("p2-trash-b")
    ) {
      const options = cardOptions(game);
      const pick = options.find((id) => id.startsWith("p1-trash"));
      if (pick) choose(game, pick);
      else if (options.includes("p2-hand")) choose(game, "p2-hand");
      else
        game.play(
          (action) =>
            action.type === "resolve-effect" && action.option.kind !== "skip",
        );
    }
    expect(game.player).toBe("p1");
    choose(game, "p2-trash-b");
    settle(game);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("p2-trash-b");
    expect(ids(game.state.players.p2.trash)).not.toContain("p2-trash-b");
  });

  describe("CP9 Events past nine cards in the trash", () => {
    /** p2 swings at p1's Leader; p1 holds the Event and a nine-card trash. */
    const defending = (seed: string, event: string) =>
      scenario()
        .decks("FIXTURE-RED", "FIXTURE-BLUE")
        .seed(seed)
        .atTurn(6, { active: "p2" })
        .bareTable()
        .withBoard("p1", [character("cp", "OP07-093")])
        .withHand("p1", [instance("event", event)])
        .withTrash("p1", copies(9, "FIX-001", "p1-trash"))
        .withLife("p1", copies(3, "FIX-001", "p1-life"))
        .withBoard("p2", [character("attacker", "FIX-002")])
        .withGivenDon("p2", "attacker", 4)
        .build();

    it("OP07-094#1: Shave cast from nine in the trash returns a CP Character", () => {
      // The ruling: yes -- Shave is the tenth card by the time it is read.
      const game = defending("faq-op07-094-1", "OP07-094");
      attack(game, "attacker", "p1-leader");
      game.pass(); // no block
      game.play({
        type: "activate-counter-event",
        sourceCardNumber: "OP07-094",
      });
      while (game.state.pendingEffect && !cardOptions(game).includes("cp")) {
        if (cardOptions(game).includes("p1-leader")) choose(game, "p1-leader");
        else game.play({ type: "resolve-effect" });
      }
      choose(game, "cp");
      settle(game);
      expect(ids(game.state.players.p1.hand)).toEqual(["cp"]);
    });

    it("OP07-095#1: Iron Body cast from nine in the trash gives +6000", () => {
      // The ruling: yes.
      const game = defending("faq-op07-095-1", "OP07-095");
      attack(game, "attacker", "p1-leader");
      game.pass(); // no block
      game.play({
        type: "activate-counter-event",
        sourceCardNumber: "OP07-095",
      });
      while (game.state.pendingEffect) {
        if (cardOptions(game).includes("p1-leader")) choose(game, "p1-leader");
        else game.play({ type: "resolve-effect" });
      }
      game.pass(); // done countering
      const battle = game.events.find(
        (event) => event.type === "battle-resolved",
      );
      expect(battle).toMatchObject({ defensePower: 11_000 });
    });
  });

  it("OP07-096#1: Tempest Kick cast from nine in the trash gives −3 cost", () => {
    // The ruling: yes.
    const game = table("faq-op07-096-1")
      .withHand("p1", [instance("kick", "OP07-096")])
      .withTrash("p1", copies(9, "FIX-001", "p1-trash"))
      .withDeckTop("p1", [instance("drawn", "FIX-001")])
      .withBoard("p2", [character("target", "OP07-093")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP07-096" });
    choose(game, "target");
    settle(game);
    const target = observe(game.state, "p1").opponent.board.find(
      (card) => card.instanceId === "target",
    );
    expect(target?.currentCost).toBe(2);
  });

  it("OP07-097#1: Vegapunk cannot play or activate an {Egghead} Event", () => {
    // The ruling: no -- OP07-114 is an {Egghead} Event at cost 1. The
    // engine still offers the "play it" branch for it, but the `play` node
    // leaves an Event where it is (mechanics.ts `eventPlay`), so taking it
    // neither puts the Event on the field nor activates it.
    const game = table("faq-op07-097-1")
      .withLeader("p1", "OP07-097")
      .withHand("p1", [instance("event", "OP07-114")])
      .withDeckTop("p1", copies(5, "FIX-001", "p1-deck"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    choose(game, "event");
    const events = [...game.events];
    game.play({ type: "resolve-effect", summary: "Play it" });
    events.push(...game.events);
    settle(game);
    events.push(...game.events);

    expect(ids(game.state.players.p1.hand)).toEqual(["event"]);
    expect(game.state.players.p1.board).toEqual([]);
    expect(game.state.players.p1.trash).toEqual([]);
    expect(game.state.players.p1.deck).toHaveLength(5);
    expect(events.some((event) => event.type === "event-activated")).toBe(
      false,
    );
  });

  it("OP07-107#1: Franky's [Trigger] from three Life draws and trashes Franky", () => {
    // The ruling: yes.
    const game = scenario()
      .decks("FIXTURE-RED", "FIXTURE-BLUE")
      .seed("faq-op07-107-1")
      .atTurn(6, { active: "p2" })
      .bareTable()
      .withLife("p1", [
        instance("franky", "OP07-107"),
        instance("p1-life-1", "FIX-001"),
        instance("p1-life-2", "FIX-001"),
      ])
      .withDeckTop("p1", [instance("drawn", "FIX-001")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withGivenDon("p2", "attacker", 2)
      .build();

    attack(game, "attacker", "p1-leader");
    while (
      game.state.activeAttack &&
      !offered(game, "resolve-trigger").length
    ) {
      game.pass();
    }
    game.play(
      (action) =>
        action.type === "resolve-trigger" &&
        action.summary.includes("Activate"),
    );
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["franky"]);
    expect(game.state.players.p1.board).toEqual([]);
  });

  it("OP07-111#1: Lilith reveals the {Egghead} card she adds", () => {
    // The ruling: yes.
    const game = table("faq-op07-111-1")
      .withHand("p1", [instance("lilith", "OP07-111")])
      .withDeckTop("p1", [
        instance("egghead", "OP07-107"),
        ...copies(4, "FIX-001", "p1-deck"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-111" });
    choose(game, "egghead");
    const revealed: string[] = [];
    const collect = () => {
      for (const event of game.events) {
        if (event.type === "card-revealed") revealed.push(event.cardNumber);
      }
    };
    collect();
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect" });
      collect();
    }
    expect(ids(game.state.players.p1.hand)).toEqual(["egghead"]);
    expect(revealed).toContain("OP07-107");
  });

  it("OP07-119#1: Ace declining the Life add still gains [Rush] from two Life", () => {
    // The ruling: yes.
    const game = table("faq-op07-119-1")
      .withHand("p1", [instance("ace", "OP07-119")])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-119" });
    while (game.state.pendingEffect) {
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          (action.option.kind === "skip" ||
            action.summary.includes("Don't") ||
            action.summary.includes("no more")),
      );
    }
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(
      offered(game, "attack").some(
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "ace",
      ),
    ).toBe(true);
  });
});

describe("FAQ OP-08", () => {
  it("OP08-001#1: Chopper's activation gives one Character one DON!!, never more", () => {
    // The ruling: no -- the PDF asks about more than two; each chosen
    // Character takes one rested DON!!, and a Character can be chosen once.
    const game = table("faq-op08-001-1")
      .withLeader("p1", "OP08-001")
      .withDon("p1", { rested: 3 })
      .withBoard("p1", [character("animal", "OP07-043")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    choose(game, "animal");
    expect(cardOptions(game)).not.toContain("animal");
    settle(game);
    expect(game.state.players.p1.board[0]?.attachedDon).toHaveLength(1);
  });

  it("OP08-006#1: another Chessmarimo in the trash is neither Kuromarimo nor Chess", () => {
    // The ruling: no.
    const build = (seed: string, trash: ReturnType<typeof instance>[]) =>
      table(seed)
        .withBoard("p1", [character("chessmarimo", "OP08-006")])
        .withTrash("p1", trash)
        .build();
    const alone = build("faq-op08-006-1", [instance("other", "OP08-006")]);
    expect(power(alone, "p1", "chessmarimo")).toBe(6_000);
    const pair = build("faq-op08-006-1-pair", [
      instance("kuromarimo", "OP08-004"),
      instance("chess", "OP08-005"),
    ]);
    expect(power(pair, "p1", "chessmarimo")).toBe(8_000);
  });

  it("OP08-014#1: Wapol gains +2000 with nothing on the other side to debuff", () => {
    // The ruling: yes.
    const game = table("faq-op08-014-1")
      .withBoard("p1", [character("wapol", "OP08-014")])
      .withGivenDon("p1", "wapol", 1)
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();

    attack(game, "wapol", "p2-leader");
    while (game.state.pendingEffect && game.player === "p1") {
      game.play(
        (action) =>
          action.type === "resolve-effect" && action.option.kind !== "skip",
      );
    }
    expect(power(game, "p1", "wapol")).toBe(9_000);
  });

  it("OP08-019#1: Munch-Munch Mutation buffs with no opposing Character", () => {
    // The ruling: yes.
    const game = table("faq-op08-019-1")
      .withHand("p1", [instance("event", "OP08-019")])
      .withBoard("p1", [character("mine", "FIX-002")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP08-019" });
    choose(game, "mine");
    settle(game);
    expect(power(game, "p1", "mine")).toBe(7_000);
  });

  it("OP08-036#1: a Character rested after Electrical Luna resolves still refreshes", () => {
    // The ruling: no -- the lock reaches only the Characters
    // rested when it resolves. OP05-025 Gladius rests the target afterwards.
    const game = table("faq-op08-036-1")
      .withHand("p1", [instance("luna", "OP08-036")])
      .withBoard("p1", [character("gladius", "OP05-025")])
      .withBoard("p2", [character("target", "FIX-002")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP08-036" });
    settle(game);
    game.play({ type: "activate-main", sourceInstanceId: "gladius" });
    while (game.state.pendingEffect) {
      if (cardOptions(game).includes("target")) choose(game, "target");
      else
        game.play(
          (action) =>
            action.type === "resolve-effect" && action.option.kind !== "skip",
        );
    }
    expect(game.state.players.p2.board[0]?.rested).toBe(true);

    game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.state.players.p2.board[0]?.rested).toBe(false);
  });

  it("OP08-038#1: a Character played after the Event resolves can still be K.O.'d", () => {
    // The ruling: no.
    const game = table("faq-op08-038-1")
      .withHand("p1", [
        instance("event", "OP08-038"),
        instance("late", "FIX-001"),
      ])
      .withBoard("p1", [character("a", "FIX-002"), character("b", "FIX-002")])
      .withHand("p2", [
        instance("breath-1", "OP07-017"),
        instance("breath-2", "OP07-017"),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP08-038" });
    while (game.state.pendingEffect) {
      const options = cardOptions(game);
      if (options.includes("a")) choose(game, "a");
      else if (options.includes("b")) choose(game, "b");
      else
        game.play(
          (action) =>
            action.type === "resolve-effect" && action.option.kind !== "skip",
        );
    }
    game.play({ type: "play-card", cardNumber: "FIX-001" });
    settle(game);
    game.pass();
    expect(game.state.turnPlayerId).toBe("p2");

    game.play({ type: "activate-main", sourceInstanceId: "breath-1" });
    expect(cardOptions(game)).not.toContain("a");
    choose(game, "late");
    settle(game);
    expect(ids(game.state.players.p1.board)).toEqual(["a", "b"]);
    expect(ids(game.state.players.p1.trash)).toContain("late");
  });

  it("OP08-039#1: Zou's [End of Your Turn] stands a {Minks} Character up behind any Leader", () => {
    // The ruling: yes.
    const game = table("faq-op08-039-1")
      .withStage("p1", instance("zou", "OP08-039"))
      .withBoard("p1", [character("mink", "OP08-035", { rested: true })])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.pass();
    while (game.state.turnPlayerId === "p1") {
      if (!pending(game)) game.pass();
      else if (cardOptions(game).includes("mink")) choose(game, "mink");
      else
        game.play(
          (action) =>
            action.type === "resolve-effect" && action.option.kind !== "skip",
        );
    }
    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.state.players.p1.board[0]?.rested).toBe(false);
  });

  describe("reveal two {Whitebeard Pirates} cards from hand", () => {
    /** The two revealed cards are shown, then stay in the hand. */
    const revealedAndKept = (game: Game, revealed: string[]) => {
      const hand = ids(game.state.players.p1.hand);
      expect(hand).toEqual(expect.arrayContaining(["wb-1", "wb-2"]));
      expect(revealed.filter((number) => number === "OP08-045")).toHaveLength(
        2,
      );
    };
    const collectReveals = (game: Game, into: string[]) => {
      for (const event of game.events) {
        if (event.type === "card-revealed") into.push(event.cardNumber);
      }
    };
    const payReveal = (game: Game, into: string[]) => {
      while (game.state.pendingEffect) {
        const options = cardOptions(game);
        if (options.includes("wb-1")) choose(game, "wb-1");
        else if (options.includes("wb-2")) choose(game, "wb-2");
        else if (options.includes("target")) choose(game, "target");
        else
          game.play(
            (action) =>
              action.type === "resolve-effect" && action.option.kind !== "skip",
          );
        collectReveals(game, into);
      }
    };
    const whitebeardHand = (seed: string, card: string) =>
      table(seed)
        .withLeader("p1", "OP08-002")
        .withHand("p1", [
          instance("card", card),
          instance("wb-1", "OP08-045"),
          instance("wb-2", "OP08-045"),
        ])
        .withBoard("p2", [character("target", "FIX-002")]);

    it("OP08-040#1: Atmos shows the two cards and they go back to the hand", () => {
      const game = whitebeardHand("faq-op08-040-1", "OP08-040").build();
      const revealed: string[] = [];
      game.play({ type: "play-card", cardNumber: "OP08-040" });
      payReveal(game, revealed);
      revealedAndKept(game, revealed);
      expect(ids(game.state.players.p2.hand)).toEqual(["target"]);
    });

    it("OP08-044#1: Kingdew shows the two cards and they go back to the hand", () => {
      const game = whitebeardHand("faq-op08-044-1", "FIX-001")
        .withBoard("p1", [character("kingdew", "OP08-044")])
        .build();
      const revealed: string[] = [];
      game.play({ type: "activate-main", sourceInstanceId: "kingdew" });
      payReveal(game, revealed);
      revealedAndKept(game, revealed);
      expect(power(game, "p1", "kingdew")).toBe(6_000);
    });

    it("OP08-055#1: Phoenix Brand shows the two cards and they go back to the hand", () => {
      const game = whitebeardHand("faq-op08-055-1", "OP08-055").build();
      const revealed: string[] = [];
      game.play({ type: "activate-main", sourceCardNumber: "OP08-055" });
      payReveal(game, revealed);
      revealedAndKept(game, revealed);
      expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("target");
    });
  });

  describe("OP08-043 Edward.Newgate", () => {
    it("OP08-043#1: a [Rush] Character played on the next turn attacks without the hand tax", () => {
      // The ruling: yes.
      const game = table("faq-op08-043-1")
        .withLeader("p1", "OP08-002")
        .withHand("p1", [instance("newgate", "OP08-043")])
        .withLife("p1", copies(2, "FIX-001", "p1-life"))
        .withBoard("p2", [character("taxed", "FIX-002")])
        .withHand("p2", [
          instance("rusher", "OP07-015"),
          ...copies(2, "FIX-001", "p2-hand"),
        ])
        .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
        .build();

      game.play({ type: "play-card", cardNumber: "OP08-043" });
      settle(game);
      game.pass();
      expect(game.state.turnPlayerId).toBe("p2");

      game.play({ type: "play-card", cardNumber: "OP07-015" });
      settle(game);
      const handBefore = game.state.players.p2.hand.length;
      attack(game, "rusher", "p1-leader");
      expect(game.state.players.p2.hand).toHaveLength(handBefore);
      expect(game.state.activeAttack?.attackerInstanceId).toBe("rusher");
    });

    it("OP08-043#2: from three Life the [On Play] selects nothing, even once Life drops to two", () => {
      // The ruling: no tax applies. The Life gate is read when the [On Play]
      // resolves.
      const game = table("faq-op08-043-2")
        .withLeader("p1", "OP08-002")
        .withHand("p1", [instance("newgate", "OP08-043")])
        .withLife("p1", copies(3, "FIX-001", "p1-life"))
        .withBoard("p2", [character("attacker", "FIX-002")])
        .withHand("p2", copies(2, "FIX-001", "p2-hand"))
        .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
        .build();

      game.play({ type: "play-card", cardNumber: "OP08-043" });
      settle(game);
      game.pass();
      expect(game.state.turnPlayerId).toBe("p2");

      // The Leader's hit takes p1 to two Life.
      attack(game, "p2-leader", "p1-leader");
      while (game.state.activeAttack) game.pass();
      expect(game.state.players.p1.life).toHaveLength(2);
      const handBefore = game.state.players.p2.hand.length;
      attack(game, "attacker", "p1-leader");
      expect(game.state.players.p2.hand).toHaveLength(handBefore);
      expect(game.events).toContainEqual(
        expect.objectContaining({
          type: "attack-declared",
          attackerInstanceId: "attacker",
        }),
      );
    });
  });

  it("OP08-045#1: Thatch trashed instead of K.O.'d does not fire a K.O. watcher", () => {
    // The ruling: no -- p2's EB01-047 Laboon draws when a Character is
    // K.O.'d; Thatch losing a battle goes to the trash instead.
    const game = scenario()
      .decks("FIXTURE-RED", "FIXTURE-BLUE")
      .seed("faq-op08-045-1")
      .atTurn(6, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("thatch", "OP08-045", { rested: true })])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withBoard("p2", [
        character("attacker", "FIX-002"),
        character("laboon", "EB01-047"),
      ])
      .withGivenDon("p2", "attacker", 2)
      .withHand("p2", [instance("p2-hand", "FIX-001")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    attack(game, "attacker", "thatch");
    while (game.state.activeAttack || game.state.pendingEffect) {
      if (game.state.pendingEffect) {
        game.play(
          (action) =>
            action.type === "resolve-effect" && action.option.kind !== "skip",
        );
      } else game.pass();
    }
    expect(ids(game.state.players.p1.trash)).toEqual(["thatch"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-hand"]);
  });

  it("OP08-046#1: an already-rested Shakuyaku still makes the opponent bottom a card", () => {
    // The ruling: yes.
    const game = table("faq-op08-046-1")
      .withBoard("p1", [character("shakuyaku", "OP08-046", { rested: true })])
      .withHand("p1", [instance("muggy", "OP09-058")])
      .withBoard("p2", [character("target", "FIX-002")])
      .withHand("p2", copies(5, "FIX-001", "p2-hand"))
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-058" });
    choose(game, "target");
    while (game.state.pendingEffect) {
      const pick = cardOptions(game).find((id) => id.startsWith("p2-hand"));
      if (pick) choose(game, pick);
      else game.play({ type: "resolve-effect" });
    }
    // Five in hand, the bounced Character back, one under the deck.
    expect(game.state.players.p2.hand).toHaveLength(5);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toMatch(/^p2-hand/);
  });

  it("OP08-058#1: with a face-up card among the top two, Pudding's cost cannot be paid", () => {
    // The ruling: no.
    const game = table("faq-op08-058-1")
      .withLeader("p1", "OP08-058")
      .withDonDeck("p1", 2)
      .withLife("p1", [
        instance("up", "FIX-001", { faceUp: true }),
        instance("down", "FIX-001"),
        instance("third", "FIX-001"),
      ])
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();

    attack(game, "p1-leader", "p2-leader");
    while (game.state.pendingEffect && game.player === "p1") {
      game.play(
        (action) =>
          action.type === "resolve-effect" && action.option.kind !== "skip",
      );
    }
    expect(game.state.players.p1.donDeck).toHaveLength(2);
    expect(
      game.state.players.p1.life.map((card) => card.faceUp ?? false),
    ).toEqual([true, false, false]);
  });

  it("OP08-060#1: King keeps [Rush] after the opponent's DON!! falls to four", () => {
    // The ruling: yes -- p2 pays OP07-076's DON!! −1 during p1's turn.
    const game = table("faq-op08-060-1")
      .withHand("p1", [instance("king", "OP08-060")])
      .withDonDeck("p2", 5)
      .withHand("p2", [instance("beam", "OP07-076")])
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-060" });
    while (game.state.pendingEffect) {
      game.play(
        (action) =>
          action.type === "resolve-effect" && action.option.kind !== "skip",
      );
    }
    attack(game, "p1-leader", "p2-leader");
    game.pass(); // no block
    game.play({ type: "activate-counter-event", sourceCardNumber: "OP07-076" });
    while (pending(game)) {
      // The Event's rest half is declined: King has to stay up to swing.
      const restsKing = cardOptions(game).includes("king");
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          (restsKing
            ? action.option.kind !== "card"
            : action.option.kind !== "skip"),
      );
    }
    while (inBattle(game) && !pending(game)) game.pass();
    settle(game);
    const p2 = game.state.players.p2;
    expect(
      p2.activeDon.length + p2.restedDon.length + p2.leaderAttachedDon.length,
    ).toBe(4);
    expect(
      offered(game, "attack").some(
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "king",
      ),
    ).toBe(true);
  });

  it("OP08-063#1: with the top Life card face-down, Katakuri's cost cannot be paid", () => {
    // The ruling: no.
    const game = table("faq-op08-063-1")
      .withHand("p1", [instance("katakuri", "OP08-063")])
      .withDonDeck("p1", 1)
      .withLife("p1", [
        instance("down", "FIX-001"),
        instance("up", "FIX-001", { faceUp: true }),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-063" });
    while (game.state.pendingEffect) {
      game.play(
        (action) =>
          action.type === "resolve-effect" && action.option.kind !== "skip",
      );
    }
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(
      game.state.players.p1.life.map((card) => card.faceUp ?? false),
    ).toEqual([false, true]);
  });

  describe("OP08-074 Black Maria", () => {
    const mariaTable = (seed: string) =>
      table(seed)
        .withDonDeck("p1", 5)
        .withDonDeck("p2", 4)
        .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"));

    it("OP08-074#1: the end-of-turn return fires a returned-DON!! watcher", () => {
      // The ruling: yes -- OP08-067 Charlotte Pudding adds a DON!! when one is
      // returned on its controller's turn.
      const game = mariaTable("faq-op08-074-1")
        .withBoard("p1", [
          character("maria", "OP08-074"),
          character("pudding", "OP08-067"),
        ])
        .build();

      game.play({ type: "activate-main", sourceInstanceId: "maria" });
      settle(game);
      expect(game.state.players.p1.donDeck).toHaveLength(0);
      const events: string[] = [];
      game.pass();
      while (game.state.turnPlayerId === "p1") {
        for (const event of game.events) events.push(event.type);
        if (pending(game)) game.play({ type: "resolve-effect" });
        else game.pass();
      }
      for (const event of game.events) events.push(event.type);
      const returned = events.indexOf("don-returned");
      expect(returned).toBeGreaterThanOrEqual(0);
      expect(events.slice(returned)).toContain("don-added");
    });

    it("OP08-074#2: the return still happens once Black Maria has left the field", () => {
      // The ruling: yes -- p1's own OP09-030 Trafalgar Law returns her to hand.
      const game = mariaTable("faq-op08-074-2")
        .withBoard("p1", [character("maria", "OP08-074")])
        .withHand("p1", [instance("law", "OP09-030")])
        .build();

      game.play({ type: "activate-main", sourceInstanceId: "maria" });
      settle(game);
      game.play({ type: "play-card", cardNumber: "OP09-030" });
      while (game.state.pendingEffect) {
        if (cardOptions(game).includes("maria")) choose(game, "maria");
        else if (effectOptions(game).includes("apply"))
          game.play({ type: "resolve-effect", optionId: "apply" });
        else game.play({ type: "resolve-effect" });
      }
      expect(ids(game.state.players.p1.hand)).toContain("maria");

      const events: PublicEventType[] = [];
      game.pass();
      while (game.state.turnPlayerId === "p1") {
        for (const event of game.events) events.push(event.type);
        if (pending(game)) game.play({ type: "resolve-effect" });
        else game.pass();
      }
      for (const event of game.events) events.push(event.type);
      // Ten on p1's field against p2's six: four go back.
      expect(events).toContain("don-returned");
      expect(game.state.players.p1.donDeck).toHaveLength(4);
    });
  });

  it("OP08-079#1: on a later turn Kaido's activation trashes a card and does nothing else", () => {
    // The ruling: yes.
    const game = table("faq-op08-079-1")
      .withBoard("p1", [character("kaido", "OP08-079")])
      .withHand("p1", [instance("fodder", "FIX-001")])
      .withBoard("p2", [character("target", "FIX-002")])
      .withHand("p2", [instance("p2-hand", "FIX-001")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "kaido" });
    while (game.state.pendingEffect) {
      if (cardOptions(game).includes("fodder")) choose(game, "fodder");
      else
        game.play(
          (action) =>
            action.type === "resolve-effect" && action.option.kind !== "skip",
        );
    }
    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
    expect(ids(game.state.players.p2.board)).toEqual(["target"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-hand"]);
  });

  it("OP08-082#1: Sasaki's DON!! rest is paid with an active DON!! from the cost area", () => {
    // The ruling: yes.
    const spent = table("faq-op08-082-1")
      .withBoard("p1", [character("sasaki", "OP08-082")])
      .withDonDeck("p1", 9)
      .withBoard("p2", [character("target", "FIX-002")])
      .build();
    spent.play({ type: "activate-main", sourceInstanceId: "sasaki" });
    expect(spent.state.players.p1.activeDon).toHaveLength(0);
    expect(spent.state.players.p1.restedDon).toHaveLength(1);

    const none = table("faq-op08-082-1-none")
      .withBoard("p1", [character("sasaki", "OP08-082")])
      .withDonDeck("p1", 10)
      .withBoard("p2", [character("target", "FIX-002")])
      .build();
    expect(
      offered(none, "activate-main").some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "sasaki",
      ),
    ).toBe(false);
  });

  it("OP08-084#1: Jack costs 7 in hand; the +4 applies on the field", () => {
    // The ruling: no.
    const game = table("faq-op08-084-1")
      .withHand("p1", [instance("jack", "OP08-084")])
      .build();
    const inHand = observe(game.state, "p1").self.hand.find(
      (card) => card.instanceId === "jack",
    );
    expect(inHand?.currentCost).toBe(7);
    game.play({ type: "play-card", cardNumber: "OP08-084" });
    settle(game);
    expect(game.state.players.p1.activeDon).toHaveLength(3);
    const onField = observe(game.state, "p1").self.board.find(
      (card) => card.instanceId === "jack",
    );
    expect(onField?.currentCost).toBe(11);
  });

  it("OP08-098#1: Kalgara plays a {Shandian Warrior} from 0 Life", () => {
    // The ruling: yes.
    const game = table("faq-op08-098-1")
      .withLeader("p1", "OP08-098")
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [instance("genbo", "OP06-105")])
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();

    attack(game, "p1-leader", "p2-leader");
    choose(game, "genbo");
    settle(game);
    expect(ids(game.state.players.p1.board)).toEqual(["genbo"]);
    expect(game.state.players.p1.life).toEqual([]);
  });

  describe("OP08-105 Jewelry Bonney", () => {
    /** p1's Bonney holds a DON!!; the Leader swings at p2's Leader. */
    const bonneyTable = (seed: string) =>
      table(seed)
        .withBoard("p1", [character("bonney", "OP08-105")])
        .withGivenDon("p1", "bonney", 1)
        .withDeckTop("p1", copies(3, "FIX-002", "p1-deck"));

    /** Runs the battle out, taking the first offer at every p1 choice. */
    const finishBattle = (game: Game) => {
      while (game.state.activeAttack || game.state.pendingEffect) {
        if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
        else game.pass();
      }
    };

    /** p2 answers the attack with a [Counter] Event onto its own Leader. */
    const counterWith = (game: Game, event: string) => {
      attack(game, "p1-leader", "p2-leader");
      game.pass(); // no block
      game.play({ type: "activate-counter-event", sourceCardNumber: event });
      while (game.state.pendingEffect && game.player === "p2") {
        const options = cardOptions(game);
        if (options.includes("p2-leader")) choose(game, "p2-leader");
        else if (options.includes("genbo")) choose(game, "genbo");
        else
          game.play(
            (action) =>
              action.type === "resolve-effect" && action.option.kind !== "skip",
          );
      }
    };

    it("OP08-105#1: a Life card the opponent's own effect moves to hand fires the draw", () => {
      // The ruling: yes -- p2 pays OP06-017's cost with its top Life card.
      const game = bonneyTable("faq-op08-105-1")
        .withHand("p2", [instance("meteor", "OP06-017")])
        .withLife("p2", copies(3, "FIX-001", "p2-life"))
        .build();

      counterWith(game, "OP06-017");
      finishBattle(game);
      expect(game.state.players.p2.life).toHaveLength(2);
      // Two drawn, one trashed.
      expect(game.state.players.p1.hand).toHaveLength(1);
      expect(game.state.players.p1.trash).toHaveLength(1);
    });

    it("OP08-105#2: the opponent looking at and reordering their Life fires nothing", () => {
      // The ruling: no -- ST13-017 looks at and reorders p2's Life, and
      // its +4000 stops the attack connecting.
      const game = bonneyTable("faq-op08-105-2")
        .withHand("p2", [instance("flame", "ST13-017")])
        .withLife("p2", copies(3, "FIX-001", "p2-life"))
        .build();

      counterWith(game, "ST13-017");
      finishBattle(game);
      expect(game.state.players.p2.life).toHaveLength(3);
      expect(game.state.players.p1.hand).toEqual([]);
      expect(game.state.players.p1.deck).toHaveLength(3);
    });

    it("OP08-105#3: a Life card taken and another put back still fires the draw", () => {
      // The ruling: yes -- OP08-116 Burn Bazooka takes a Life card to hand and
      // then puts a {Shandian Warrior} from hand on top of Life.
      const game = bonneyTable("faq-op08-105-3")
        .withHand("p2", [
          instance("bazooka", "OP08-116"),
          instance("genbo", "OP06-105"),
        ])
        .withLife("p2", copies(3, "FIX-001", "p2-life"))
        .build();

      counterWith(game, "OP08-116");
      finishBattle(game);
      expect(game.state.players.p2.life).toHaveLength(3);
      expect(game.state.players.p2.life[0]?.instanceId).toBe("genbo");
      expect(game.state.players.p1.hand).toHaveLength(1);
      expect(game.state.players.p1.trash).toHaveLength(1);
    });

    // The Life watcher waits for the Damage Step, so the [Trigger] resolves
    // first and Bonney, K.O.'d by it, is not there to draw (#51).
    it("OP08-105#4: a [Trigger] that K.O.s Bonney resolves first, so she draws nothing", () => {
      // The ruling: the [Trigger] resolves before the draw, and the draw needs
      // Bonney still on the field. p2's top Life card is OP07-096 Tempest
      // Kick, whose [Trigger] K.O.s a cost-3 Character.
      const game = bonneyTable("faq-op08-105-4")
        .withLife("p2", [
          instance("kick", "OP07-096"),
          ...copies(2, "FIX-001", "p2-life"),
        ])
        .build();

      attack(game, "bonney", "p2-leader");
      while (
        game.state.activeAttack &&
        !offered(game, "resolve-trigger").length
      ) {
        if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
        else game.pass();
      }
      expect(game.player).toBe("p2");
      game.play(
        (action) =>
          action.type === "resolve-trigger" &&
          action.summary.includes("Activate"),
      );
      while (game.state.pendingEffect && game.player === "p2") {
        if (cardOptions(game).includes("bonney")) choose(game, "bonney");
        else game.play({ type: "resolve-effect" });
      }
      finishBattle(game);
      expect(ids(game.state.players.p1.trash)).toContain("bonney");
      expect(game.state.players.p1.hand).toEqual([]);
      expect(game.state.players.p1.deck).toHaveLength(3);
    });
  });

  it("OP08-114#1: behind on Life, S-Hawk has +2000 outside any battle", () => {
    // The ruling: yes.
    const game = table("faq-op08-114-1")
      .withBoard("p1", [character("hawk", "OP08-114")])
      .withGivenDon("p1", "hawk", 1)
      .withLife("p1", copies(1, "FIX-001", "p1-life"))
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();

    // 5000 printed, 1000 from the DON!!, 2000 from the clause.
    expect(power(game, "p1", "hawk")).toBe(8_000);
  });

  it("OP08-118#1: the −3000, the −2000 and the K.O. can go to three different Characters", () => {
    // The ruling: yes.
    const game = table("faq-op08-118-1")
      .withHand("p1", [instance("rayleigh", "OP08-118")])
      .withBoard("p2", [
        character("big", "FIX-002"),
        character("mid", "FIX-002"),
        character("small", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-118" });
    choose(game, "big");
    choose(game, "mid");
    choose(game, "small");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["big", "mid"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
    expect(power(game, "p2", "big")).toBe(1_000);
    expect(power(game, "p2", "mid")).toBe(2_000);
  });
});
