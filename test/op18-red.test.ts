import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP-18 "The Dominance of God", the red cards: OP18-001 to OP18-020. OP18-003
 * Sea Cat prints no text and is not here.
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter. Clauses gated on a
 * Leader are run behind a real Leader that carries the type or name --
 * OP18-001 Karoo and EB03-001 Nefeltari Vivi ({Alabasta}), OP16-060 Sengoku
 * ({Navy}) -- and paired with a case behind the starter Leader, which carries
 * none of them.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase, with ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" });

/** p2 acting, for the clauses that open on p1's opponent's turn. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" });

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

/** Resolve the rest of an open effect, declining whatever can be declined. */
function settleDeclining(game: Game) {
  while (game.state.pendingEffect) {
    const options = effectOptions(game.state);
    const decline = ["skip", "done"].find((id) => options.includes(id));
    game.play(
      decline
        ? { type: "resolve-effect", optionId: decline }
        : { type: "resolve-effect" },
    );
  }
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const handIds = (game: Game, player: "p1" | "p2" = "p1") =>
  ids(game.state.players[player].hand);
const boardIds = (game: Game, player: "p1" | "p2" = "p1") =>
  ids(game.state.players[player].board);
const trashIds = (game: Game, player: "p1" | "p2" = "p1") =>
  ids(game.state.players[player].trash);

const power = (game: Game, player: "p1" | "p2", instanceId: string) =>
  currentPower(game.state, player, instanceId);

const keyword = (
  game: Game,
  player: "p1" | "p2",
  instanceId: string,
  name: Parameters<typeof hasKeyword>[3],
) => hasKeyword(game.state, player, instanceId, name);

/** Decline the block and Counter steps, so a declared attack resolves. */
const passDefence = (game: Game) => {
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    !game.state.pendingEffect
  ) {
    game.pass();
  }
};

/** Take the plain Life card if the damage turned a [Trigger] over. */
const declineTrigger = (game: Game) => {
  for (const player of ["p1", "p2"] as const) {
    const offered = game
      .legalActions(player)
      .find(
        (action) =>
          action.type === "resolve-trigger" &&
          action.summary.includes("Add Life card to hand"),
      );
    if (offered) game.submit(offered);
  }
};

const attack = (
  game: Game,
  attackerInstanceId: string,
  targetInstanceId: string,
) => game.play({ type: "attack", attackerInstanceId, targetInstanceId });

const attackOffered = (game: Game, attackerInstanceId: string) =>
  game
    .legalActions("p1")
    .some(
      (action) =>
        action.type === "attack" &&
        (action as { attackerInstanceId?: string }).attackerInstanceId ===
          attackerInstanceId,
    );

/** p1 defending, with p2's 6000 attacker swinging at the p1 Leader. */
const counterStep = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withBoard("p2", [character("attacker", "ST31-002")]);

const openAttack = (builder: ReturnType<typeof counterStep>) =>
  builder.withActiveAttack(
    {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
      attackPower: 6000,
      counterPower: 0,
    },
    "counter",
  );

// --- OP18-001 Karoo (Leader) ------------------------------------------------

describe("OP18-001 Karoo's aura", () => {
  covers("OP18-001", "static");

  it("gives Characters with both {Animal} and {Alabasta} [Rush] and +1000, and nobody else", () => {
    const game = table("op18-001-aura")
      .withLeader("p1", "OP18-001")
      .withBoard("p1", [
        character("karoo", "OP18-004", { playedTurn: 11 }),
        character("igaram", "OP18-002", { playedTurn: 11 }),
        character("deckhand", "FIX-001", { playedTurn: 11 }),
      ])
      .build();

    expect(power(game, "p1", "karoo")).toBe(5000);
    expect(keyword(game, "p1", "karoo", "Rush")).toBe(true);
    expect(attackOffered(game, "karoo")).toBe(true);
    // {Alabasta} alone, and neither type.
    expect(power(game, "p1", "igaram")).toBe(2000);
    expect(keyword(game, "p1", "igaram", "Rush")).toBe(false);
    expect(attackOffered(game, "igaram")).toBe(false);
    expect(power(game, "p1", "deckhand")).toBe(2000);
  });

  it("reaches nothing behind another Leader", () => {
    const game = table("op18-001-other")
      .withBoard("p1", [character("karoo", "OP18-004", { playedTurn: 11 })])
      .build();

    expect(power(game, "p1", "karoo")).toBe(4000);
    expect(keyword(game, "p1", "karoo", "Rush")).toBe(false);
  });
});

describe("OP18-001 Karoo's K.O. draw", () => {
  covers("OP18-001", "static");

  it("draws 1 when an {Alabasta} Character is K.O.'d, once per turn", () => {
    const game = defending("op18-001-draw")
      .withLeader("p1", "OP18-001")
      .withBoard("p1", [
        character("igaram", "OP18-002", { rested: true }),
        character("igaram-2", "OP18-002", { rested: true }),
      ])
      .withBoard("p2", [
        character("attacker", "ST31-002"),
        character("attacker-2", "ST31-002"),
      ])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    attack(game, "attacker", "igaram");
    passDefence(game);
    settle(game);
    expect(trashIds(game)).toContain("igaram");
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);

    attack(game, "attacker-2", "igaram-2");
    passDefence(game);
    settle(game);
    expect(trashIds(game)).toContain("igaram-2");
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });

  it("does not draw for a Character without the {Alabasta} type", () => {
    const game = defending("op18-001-miss")
      .withLeader("p1", "OP18-001")
      .withBoard("p1", [character("deckhand", "FIX-001", { rested: true })])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    attack(game, "attacker", "deckhand");
    passDefence(game);
    settle(game);
    expect(trashIds(game)).toContain("deckhand");
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });
});

// --- OP18-002 Igaram --------------------------------------------------------

describe("OP18-002 Igaram's [On Play]", () => {
  covers("OP18-002", "[On Play]");

  it("trashes an {Alabasta} card from hand to draw 2", () => {
    const game = table("op18-002-pay")
      .withHand("p1", [
        instance("igaram", "OP18-002"),
        instance("event", "OP18-018"),
        instance("deckhand", "FIX-001"),
      ])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "OP18-002" });
    pick(game, "apply");
    const offered = effectOptions(game.state);
    expect(offered).toContain("event");
    expect(offered).not.toContain("deckhand");
    pick(game, "event");
    settle(game);

    expect(trashIds(game)).toContain("event");
    // Igaram left the hand, the Event paid, two came in.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 2 + 2);
  });

  it("draws nothing when declined, or with no {Alabasta} card to pay", () => {
    const declined = table("op18-002-decline")
      .withHand("p1", [
        instance("igaram", "OP18-002"),
        instance("event", "OP18-018"),
      ])
      .build();
    declined.play({ type: "play-card", cardNumber: "OP18-002" });
    settleDeclining(declined);
    expect(handIds(declined)).toEqual(["event"]);

    const unpaid = table("op18-002-unpaid")
      .withHand("p1", [
        instance("igaram", "OP18-002"),
        instance("deckhand", "FIX-001"),
      ])
      .build();
    unpaid.play({ type: "play-card", cardNumber: "OP18-002" });
    settle(unpaid);
    expect(handIds(unpaid)).toEqual(["deckhand"]);
  });
});

// --- OP18-004 Karoo ---------------------------------------------------------

describe("OP18-004 Karoo's power thresholds", () => {
  covers("OP18-004", "static");

  it("gains [Rush] at 5000, [Banish] at 6000 and [Unblockable] at 7000", () => {
    const at = (given: number) => {
      const builder = table(`op18-004-${given}`).withBoard("p1", [
        character("karoo", "OP18-004", { playedTurn: 11 }),
      ]);
      return (
        given > 0 ? builder.withGivenDon("p1", "karoo", given) : builder
      ).build();
    };

    const bare = at(0);
    expect(keyword(bare, "p1", "karoo", "Rush")).toBe(false);
    expect(keyword(bare, "p1", "karoo", "Banish")).toBe(false);
    expect(attackOffered(bare, "karoo")).toBe(false);

    const five = at(1);
    expect(keyword(five, "p1", "karoo", "Rush")).toBe(true);
    expect(keyword(five, "p1", "karoo", "Banish")).toBe(false);
    expect(attackOffered(five, "karoo")).toBe(true);

    const six = at(2);
    expect(keyword(six, "p1", "karoo", "Banish")).toBe(true);
    expect(keyword(six, "p1", "karoo", "Unblockable")).toBe(false);

    const seven = at(3);
    expect(keyword(seven, "p1", "karoo", "Rush")).toBe(true);
    expect(keyword(seven, "p1", "karoo", "Banish")).toBe(true);
    expect(keyword(seven, "p1", "karoo", "Unblockable")).toBe(true);
  });

  it("reads auras too: behind the Karoo Leader with a Vivi out it is a 6000", () => {
    const game = table("op18-004-aura")
      .withLeader("p1", "OP18-001")
      .withBoard("p1", [
        character("karoo", "OP18-004"),
        character("vivi", "OP18-011"),
      ])
      .build();

    expect(power(game, "p1", "karoo")).toBe(6000);
    expect(keyword(game, "p1", "karoo", "Banish")).toBe(true);
    expect(keyword(game, "p1", "karoo", "Unblockable")).toBe(false);
  });
});

// --- OP18-005 Koza ----------------------------------------------------------

describe("OP18-005 Koza", () => {
  covers("OP18-005", "static");

  it("gains [Rush] and +1000 with a [Nefeltari Vivi] on the field", () => {
    const game = table("op18-005-vivi")
      .withBoard("p1", [
        character("koza", "OP18-005", { playedTurn: 11 }),
        character("vivi", "OP18-011"),
      ])
      .build();
    expect(power(game, "p1", "koza")).toBe(5000);
    expect(keyword(game, "p1", "koza", "Rush")).toBe(true);
  });

  it("counts a [Nefeltari Vivi] Leader", () => {
    const game = table("op18-005-leader")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("koza", "OP18-005")])
      .build();
    expect(power(game, "p1", "koza")).toBe(5000);
  });

  it("is a plain 4000 without one", () => {
    const game = table("op18-005-none")
      .withBoard("p1", [character("koza", "OP18-005", { playedTurn: 11 })])
      .build();
    expect(power(game, "p1", "koza")).toBe(4000);
    expect(keyword(game, "p1", "koza", "Rush")).toBe(false);
  });
});

// --- OP18-006 Kung Fu Jugon -------------------------------------------------

describe("OP18-006 Kung Fu Jugon", () => {
  covers("OP18-006", "[Your Turn]");

  it("gains +1000 per copy on its controller's board, itself included", () => {
    const one = table("op18-006-one")
      .withBoard("p1", [character("jugon", "OP18-006")])
      .build();
    expect(power(one, "p1", "jugon")).toBe(1000);

    const three = table("op18-006-three")
      .withBoard("p1", [
        character("jugon", "OP18-006"),
        character("jugon-2", "OP18-006"),
        character("jugon-3", "OP18-006"),
      ])
      .build();
    expect(power(three, "p1", "jugon")).toBe(3000);
    expect(power(three, "p1", "jugon-3")).toBe(3000);
  });

  it("gains nothing on the opponent's turn", () => {
    const game = defending("op18-006-theirs")
      .withBoard("p1", [
        character("jugon", "OP18-006"),
        character("jugon-2", "OP18-006"),
      ])
      .build();
    expect(power(game, "p1", "jugon")).toBe(0);
  });
});

// --- OP18-007 Smoker --------------------------------------------------------

describe("OP18-007 Smoker", () => {
  covers("OP18-007", "static");

  it("gains [Banish] and +1000 behind a {Navy} Leader", () => {
    const game = table("op18-007-navy")
      .withLeader("p1", "OP16-060")
      .withBoard("p1", [character("smoker", "OP18-007")])
      .build();
    expect(power(game, "p1", "smoker")).toBe(6000);
    expect(keyword(game, "p1", "smoker", "Banish")).toBe(true);
  });

  it("is a plain 5000 behind any other Leader", () => {
    const game = table("op18-007-other")
      .withBoard("p1", [character("smoker", "OP18-007")])
      .build();
    expect(power(game, "p1", "smoker")).toBe(5000);
    expect(keyword(game, "p1", "smoker", "Banish")).toBe(false);
  });
});

// --- OP18-008 Chaka ---------------------------------------------------------

describe("OP18-008 Chaka's [Rush]", () => {
  covers("OP18-008", "static");

  it("has [Rush] behind an {Alabasta} Leader only", () => {
    const alabasta = table("op18-008-rush")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("chaka", "OP18-008", { playedTurn: 11 })])
      .build();
    expect(keyword(alabasta, "p1", "chaka", "Rush")).toBe(true);
    expect(attackOffered(alabasta, "chaka")).toBe(true);

    const other = table("op18-008-no-rush")
      .withBoard("p1", [character("chaka", "OP18-008", { playedTurn: 11 })])
      .build();
    expect(keyword(other, "p1", "chaka", "Rush")).toBe(false);
  });
});

describe("OP18-008 Chaka's [On Play]", () => {
  covers("OP18-008", "[On Play]");

  it("trashes a 5000-or-less Character to draw 2 and gain [Banish] this turn", () => {
    const game = table("op18-008-pay")
      .withHand("p1", [
        instance("chaka", "OP18-008"),
        instance("captain", "FIX-002"),
        instance("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-008" });
    pick(game, "apply");
    const offered = effectOptions(game.state);
    expect(offered).toContain("captain");
    expect(offered).not.toContain("jinbe");
    pick(game, "captain");
    settle(game);

    expect(trashIds(game)).toContain("captain");
    expect(game.state.players.p1.hand).toHaveLength(3);
    expect(keyword(game, "p1", "chaka", "Banish")).toBe(true);
    game.pass();
    expect(keyword(game, "p1", "chaka", "Banish")).toBe(false);
  });

  it("does nothing when declined", () => {
    const game = table("op18-008-decline")
      .withHand("p1", [
        instance("chaka", "OP18-008"),
        instance("captain", "FIX-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-008" });
    settleDeclining(game);
    expect(handIds(game)).toEqual(["captain"]);
    expect(keyword(game, "p1", "chaka", "Banish")).toBe(false);
  });

  it("cannot be paid with only bigger Characters in hand", () => {
    const game = table("op18-008-unpaid")
      .withHand("p1", [
        instance("chaka", "OP18-008"),
        instance("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-008" });
    settle(game);
    expect(handIds(game)).toEqual(["jinbe"]);
    expect(keyword(game, "p1", "chaka", "Banish")).toBe(false);
  });
});

// --- OP18-009 Super Spot-Billed Duck Troops ---------------------------------

describe("OP18-009 Super Spot-Billed Duck Troops", () => {
  covers("OP18-009", "[Rush]");

  it("attacks the turn it is played", () => {
    const game = table("op18-009-rush")
      .withBoard("p1", [character("ducks", "OP18-009", { playedTurn: 11 })])
      .build();
    expect(keyword(game, "p1", "ducks", "Rush")).toBe(true);
    expect(attackOffered(game, "ducks")).toBe(true);
  });
});

describe("OP18-009 Super Spot-Billed Duck Troops' [Activate: Main]", () => {
  covers("OP18-009", "[Activate: Main]");

  it("trashes itself to play a [Karoo] from hand with 9 DON!! on the field", () => {
    const game = table("op18-009-play")
      .withBoard("p1", [character("ducks", "OP18-009")])
      .withHand("p1", [
        instance("karoo", "OP18-004"),
        instance("igaram", "OP18-002"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "ducks" });
    const offered = effectOptions(game.state);
    expect(offered).toContain("karoo");
    expect(offered).not.toContain("igaram");
    pick(game, "karoo");
    settle(game);

    expect(trashIds(game)).toContain("ducks");
    expect(boardIds(game)).toEqual(["karoo"]);
  });

  it("still trashes itself, and plays nothing, under 9 DON!!", () => {
    const game = scenario()
      .decks(P1, P2)
      .seed("op18-009-short")
      .atTurn(7, { active: "p1" })
      .withBoard("p1", [character("ducks", "OP18-009")])
      .withHand("p1", [instance("karoo", "OP18-004")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "ducks" });
    settle(game);

    expect(trashIds(game)).toContain("ducks");
    expect(handIds(game)).toContain("karoo");
    expect(boardIds(game)).toEqual([]);
  });

  it("may play nothing once paid", () => {
    const game = table("op18-009-none")
      .withBoard("p1", [character("ducks", "OP18-009")])
      .withHand("p1", [instance("karoo", "OP18-004")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "ducks" });
    settleDeclining(game);
    expect(trashIds(game)).toContain("ducks");
    expect(handIds(game)).toContain("karoo");
  });
});

// --- OP18-010 Tony Tony.Chopper ---------------------------------------------

describe("OP18-010 Tony Tony.Chopper's [On K.O.]", () => {
  covers("OP18-010", "[On K.O.]");

  it("returns a 4000-or-less Character from the trash to hand", () => {
    const game = defending("op18-010-ko")
      .withBoard("p1", [character("chopper", "OP18-010", { rested: true })])
      .withTrash("p1", [
        instance("captain", "FIX-002"),
        instance("jinbe", "ST31-002"),
        instance("event", "OP18-018"),
      ])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    attack(game, "attacker", "chopper");
    passDefence(game);
    const offered = effectOptions(game.state);
    expect(offered).toContain("captain");
    expect(offered).not.toContain("jinbe");
    expect(offered).not.toContain("event");
    pick(game, "captain");
    settle(game);

    expect(handIds(game)).toContain("captain");
    expect(trashIds(game)).toContain("chopper");
  });

  it("may return nothing", () => {
    const game = defending("op18-010-none")
      .withBoard("p1", [character("chopper", "OP18-010", { rested: true })])
      .withTrash("p1", [instance("captain", "FIX-002")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    attack(game, "attacker", "chopper");
    passDefence(game);
    settleDeclining(game);
    expect(trashIds(game)).toContain("captain");
  });
});

// --- OP18-011 Nefeltari Vivi ------------------------------------------------

describe("OP18-011 Nefeltari Vivi's aura", () => {
  covers("OP18-011", "static");

  it("gives Characters with both {Animal} and {Alabasta} +1000, per copy", () => {
    const game = table("op18-011-aura")
      .withBoard("p1", [
        character("karoo", "OP18-004"),
        character("igaram", "OP18-002"),
        character("vivi", "OP18-011"),
        character("vivi-2", "OP18-011"),
      ])
      .build();
    expect(power(game, "p1", "karoo")).toBe(6000);
    expect(power(game, "p1", "igaram")).toBe(2000);
    expect(power(game, "p1", "vivi")).toBe(0);
  });
});

describe("OP18-011 Nefeltari Vivi's [Opponent's Turn]", () => {
  covers("OP18-011", "[Opponent's Turn]");

  it("is a 6000 [Blocker] on the opponent's turn only", () => {
    const theirs = defending("op18-011-theirs")
      .withBoard("p1", [character("vivi", "OP18-011")])
      .build();
    expect(power(theirs, "p1", "vivi")).toBe(6000);
    expect(keyword(theirs, "p1", "vivi", "Blocker")).toBe(true);

    const ours = table("op18-011-ours")
      .withBoard("p1", [character("vivi", "OP18-011")])
      .build();
    expect(power(ours, "p1", "vivi")).toBe(0);
    expect(keyword(ours, "p1", "vivi", "Blocker")).toBe(false);
  });

  it("blocks", () => {
    const game = defending("op18-011-block")
      .withBoard("p1", [character("vivi", "OP18-011")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    attack(game, "attacker", "p1-leader");
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" &&
            (action as { blockerInstanceId?: string }).blockerInstanceId ===
              "vivi",
        ),
    ).toBe(true);
  });
});

// --- OP18-012 Pincers -------------------------------------------------------

describe("OP18-012 Pincers' [When Attacking]", () => {
  // The fan translation prints the marker as "[When attacking]", which the
  // clause reader does not recognise, so the clause it derives is `static`.
  covers("OP18-012", "static");

  it("gives one {Animal} {Alabasta} Character +1000 this turn", () => {
    const game = table("op18-012-attack")
      .withBoard("p1", [
        character("pincers", "OP18-012"),
        character("karoo", "OP18-004"),
        character("igaram", "OP18-002"),
      ])
      .build();

    attack(game, "pincers", "p2-leader");
    const offered = effectOptions(game.state);
    expect(offered).toContain("karoo");
    expect(offered).toContain("pincers");
    expect(offered).not.toContain("igaram");
    pick(game, "karoo");
    settle(game);

    expect(power(game, "p1", "karoo")).toBe(5000);
    passDefence(game);
    declineTrigger(game);
    game.pass();
    expect(power(game, "p1", "karoo")).toBe(4000);
  });
});

// --- OP18-013 Pell ----------------------------------------------------------

describe("OP18-013 Pell's [Rush]", () => {
  covers("OP18-013", "static");

  it("has [Rush] behind an {Alabasta} Leader only", () => {
    const alabasta = table("op18-013-rush")
      .withLeader("p1", "OP18-001")
      .withBoard("p1", [character("pell", "OP18-013", { playedTurn: 11 })])
      .build();
    expect(keyword(alabasta, "p1", "pell", "Rush")).toBe(true);

    const other = table("op18-013-no-rush")
      .withBoard("p1", [character("pell", "OP18-013", { playedTurn: 11 })])
      .build();
    expect(keyword(other, "p1", "pell", "Rush")).toBe(false);
  });
});

describe("OP18-013 Pell's [On Play]", () => {
  covers("OP18-013", "[On Play]");

  it("pays a 5000-or-less Character to draw 2 and trash a 3000-base-power Character", () => {
    const game = table("op18-013-pay")
      .withHand("p1", [
        instance("pell", "OP18-013"),
        instance("captain", "FIX-002"),
      ])
      .withBoard("p2", [
        character("deckhand", "FIX-001"),
        character("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-013" });
    pick(game, "apply");
    pick(game, "captain");
    expect(game.state.players.p1.hand).toHaveLength(2);
    const offered = effectOptions(game.state);
    expect(offered).toContain("deckhand");
    expect(offered).not.toContain("jinbe");
    pick(game, "deckhand");
    settle(game);

    expect(trashIds(game, "p2")).toContain("deckhand");
    expect(boardIds(game, "p2")).toEqual(["jinbe"]);
  });

  it("draws and trashes nothing when declined", () => {
    const game = table("op18-013-decline")
      .withHand("p1", [
        instance("pell", "OP18-013"),
        instance("captain", "FIX-002"),
      ])
      .withBoard("p2", [character("deckhand", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-013" });
    settleDeclining(game);
    expect(handIds(game)).toEqual(["captain"]);
    expect(boardIds(game, "p2")).toEqual(["deckhand"]);
  });
});

// --- OP18-014 Portgas.D.Ace -------------------------------------------------

describe("OP18-014 Portgas.D.Ace's [When Attacking]", () => {
  // "[When attacking]" in the fan translation: see OP18-012.
  covers("OP18-014", "static");

  it("gives an {Alabasta} Character played this turn [Rush]", () => {
    const game = table("op18-014-attack")
      .withBoard("p1", [
        character("ace", "OP18-014"),
        character("igaram", "OP18-002", { playedTurn: 11 }),
        character("deckhand", "FIX-001", { playedTurn: 11 }),
      ])
      .build();

    attack(game, "ace", "p2-leader");
    const offered = effectOptions(game.state);
    expect(offered).toContain("igaram");
    expect(offered).not.toContain("deckhand");
    pick(game, "igaram");
    settle(game);
    passDefence(game);
    declineTrigger(game);

    expect(keyword(game, "p1", "igaram", "Rush")).toBe(true);
    expect(attackOffered(game, "igaram")).toBe(true);
    expect(attackOffered(game, "deckhand")).toBe(false);
  });
});

// --- OP18-015 Eyelashes -----------------------------------------------------

describe("OP18-015 Eyelashes' [On Your Opponent's Attack]", () => {
  covers("OP18-015", "[On Your Opponent's Attack]");

  it("trashes itself to give the attacker −3000 behind an {Alabasta} Leader", () => {
    const game = defending("op18-015-apply")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("eyelashes", "OP18-015")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    attack(game, "attacker", "p1-leader");
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["apply", "skip"]),
    );
    pick(game, "apply");
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["attacker", "p2-leader"]),
    );
    pick(game, "attacker");
    settle(game);

    expect(trashIds(game)).toContain("eyelashes");
    expect(power(game, "p2", "attacker")).toBe(3000);
  });

  it("keeps the body when declined", () => {
    const game = defending("op18-015-skip")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("eyelashes", "OP18-015")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    attack(game, "attacker", "p1-leader");
    pick(game, "skip");
    expect(boardIds(game)).toEqual(["eyelashes"]);
    expect(power(game, "p2", "attacker")).toBe(6000);
  });

  it("is not offered behind a Leader without the {Alabasta} type", () => {
    const game = defending("op18-015-gate")
      .withBoard("p1", [character("eyelashes", "OP18-015")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    attack(game, "attacker", "p1-leader");
    expect(effectOptions(game.state)).not.toContain("apply");
    expect(boardIds(game)).toEqual(["eyelashes"]);
  });
});

// --- OP18-016 Monkey.D.Luffy ------------------------------------------------

describe("OP18-016 Monkey.D.Luffy's [Banish]", () => {
  covers("OP18-016", "[Banish]");

  it("trashes the Life card it takes", () => {
    const game = table("op18-016-banish")
      .withBoard("p1", [character("luffy", "OP18-016")])
      .build();
    const lifeBefore = game.state.players.p2.life.length;
    const handBefore = game.state.players.p2.hand.length;
    const trashBefore = game.state.players.p2.trash.length;

    expect(keyword(game, "p1", "luffy", "Banish")).toBe(true);
    attack(game, "luffy", "p2-leader");
    passDefence(game);

    expect(game.state.players.p2.life).toHaveLength(lifeBefore - 1);
    expect(game.state.players.p2.hand).toHaveLength(handBefore);
    expect(game.state.players.p2.trash).toHaveLength(trashBefore + 1);
  });
});

describe("OP18-016 Monkey.D.Luffy's [On K.O.]", () => {
  covers("OP18-016", "[On K.O.]");

  it("plays an {Alabasta} Character of 6000 power or less from hand", () => {
    const game = defending("op18-016-ko")
      .withBoard("p1", [character("luffy", "OP18-016", { rested: true })])
      .withHand("p1", [
        instance("chaka", "OP18-008"),
        instance("jinbe", "ST31-002"),
        instance("luffy-2", "OP18-016"),
      ])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withGivenDon("p2", "attacker", 2)
      .build();

    attack(game, "attacker", "luffy");
    passDefence(game);
    const offered = effectOptions(game.state);
    expect(offered).toContain("chaka");
    expect(offered).not.toContain("jinbe");
    expect(offered).not.toContain("luffy-2");
    pick(game, "chaka");
    settle(game);

    expect(boardIds(game)).toEqual(["chaka"]);
  });
});

// --- OP18-017 Roronoa Zoro --------------------------------------------------

const zoroSaveOffered = (game: Game) =>
  effectOptions(game.state).some((optionId) => optionId.endsWith(":zoro"));

describe("OP18-017 Roronoa Zoro's replacement", () => {
  covers("OP18-017", "static");

  it("keeps an {Alabasta} Character on the field for Leader −2000 against an opponent's effect, once per turn", () => {
    const game = defending("op18-017-save")
      .withBoard("p1", [
        character("zoro", "OP18-017"),
        character("igaram", "OP18-002"),
        character("igaram-2", "OP18-002"),
      ])
      .withHand("p2", [
        instance("haruta", "OP17-009"),
        instance("haruta-2", "OP17-009"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-009" });
    pick(game, "igaram");
    expect(zoroSaveOffered(game)).toBe(true);
    const save = effectOptions(game.state).find((id) => id.endsWith(":zoro"));
    pick(game, save!);
    settle(game);

    expect(boardIds(game)).toContain("igaram");
    expect(power(game, "p1", "p1-leader")).toBe(3000);

    game.play({ type: "play-card", cardNumber: "OP17-009" });
    pick(game, "igaram-2");
    expect(zoroSaveOffered(game)).toBe(false);
    settle(game);
    expect(trashIds(game)).toContain("igaram-2");
  });

  it("does not answer a lost battle", () => {
    const game = defending("op18-017-battle")
      .withBoard("p1", [
        character("zoro", "OP18-017"),
        character("igaram", "OP18-002", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    attack(game, "attacker", "igaram");
    passDefence(game);
    expect(zoroSaveOffered(game)).toBe(false);
    settle(game);
    expect(trashIds(game)).toContain("igaram");
  });

  it("does not guard a Character without the {Alabasta} type", () => {
    const game = defending("op18-017-type")
      .withBoard("p1", [
        character("zoro", "OP18-017"),
        character("deckhand", "FIX-001"),
      ])
      .withHand("p2", [instance("haruta", "OP17-009")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-009" });
    pick(game, "deckhand");
    expect(zoroSaveOffered(game)).toBe(false);
    settle(game);
    expect(trashIds(game)).toContain("deckhand");
  });
});

describe("OP18-017 Roronoa Zoro's [When Attacking]", () => {
  covers("OP18-017", "[When Attacking]");

  it("gives an {Alabasta} Character [Rush] this turn", () => {
    const game = table("op18-017-attack")
      .withBoard("p1", [
        character("zoro", "OP18-017"),
        character("igaram", "OP18-002", { playedTurn: 11 }),
      ])
      .build();

    attack(game, "zoro", "p2-leader");
    pick(game, "igaram");
    settle(game);
    passDefence(game);
    declineTrigger(game);

    expect(attackOffered(game, "igaram")).toBe(true);
  });
});

// --- OP18-018 Let's Go, Karoo!! ---------------------------------------------

describe("OP18-018 Let's Go, Karoo!!'s [Main]", () => {
  covers("OP18-018", "[Main]");

  it("gives every {Alabasta} Character +1000 this turn", () => {
    const game = table("op18-018-main")
      .withBoard("p1", [
        character("igaram", "OP18-002"),
        character("karoo", "OP18-004"),
        character("captain", "FIX-002"),
      ])
      .withHand("p1", [instance("event", "OP18-018")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "event" });
    settle(game);

    expect(power(game, "p1", "igaram")).toBe(3000);
    expect(power(game, "p1", "karoo")).toBe(5000);
    expect(power(game, "p1", "captain")).toBe(4000);
    game.pass();
    expect(power(game, "p1", "igaram")).toBe(2000);
  });
});

describe("OP18-018 Let's Go, Karoo!!'s [Trigger]", () => {
  covers("OP18-018", "[Trigger]");

  it("gives the Leader +2000 this turn", () => {
    const game = table("op18-018-trigger")
      .withBoard("p1", [character("attacker", "ST31-002")])
      .withLife("p2", [instance("life-event", "OP18-018")])
      .build();

    attack(game, "attacker", "p2-leader");
    passDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toContain("p2-leader");
    pick(game, "p2-leader");
    settle(game);

    expect(power(game, "p2", "p2-leader")).toBe(7000);
  });
});

// --- OP18-019 Quaaack!! -----------------------------------------------------

describe("OP18-019 Quaaack!!'s [Main]", () => {
  covers("OP18-019", "[Main]");

  it("gives an opposing Character −3000 with no 7000-base-power Character out", () => {
    const game = table("op18-019-main")
      .withBoard("p1", [character("captain", "FIX-002")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .withHand("p1", [instance("event", "OP18-019")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "event" });
    pick(game, "jinbe");
    settle(game);
    expect(power(game, "p2", "jinbe")).toBe(3000);
  });

  it("is not offered with a 7000-base-power Character out", () => {
    const game = table("op18-019-big")
      .withBoard("p1", [character("brook", "ST14-010")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .withHand("p1", [instance("event", "OP18-019")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            (action as { sourceInstanceId?: string }).sourceInstanceId ===
              "event",
        ),
    ).toBe(false);
  });
});

describe("OP18-019 Quaaack!!'s [Counter]", () => {
  covers("OP18-019", "[Counter]");

  it("gives the Leader +3000 for the battle", () => {
    const game = openAttack(
      counterStep("op18-019-counter").withHand("p1", [
        instance("event", "OP18-019"),
      ]),
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);
    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

// --- OP18-020 Stop Fighting!!! ----------------------------------------------

const lifeCards = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`life-${index}`, "FIX-001"),
  );

describe("OP18-020 Stop Fighting!!!'s [Counter]", () => {
  covers("OP18-020", "[Counter]");

  it("takes all Life into hand to give their Leader and Characters −5000 behind a Vivi Leader", () => {
    const game = openAttack(
      counterStep("op18-020-vivi")
        .withLeader("p1", "EB03-001")
        .withLife("p1", lifeCards(3))
        .withHand("p1", [instance("event", "OP18-020")])
        .withBoard("p2", [
          character("attacker", "ST31-002"),
          character("captain", "FIX-002"),
        ]),
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    pick(game, "apply");
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(3);
    expect(power(game, "p2", "attacker")).toBe(1000);
    expect(power(game, "p2", "captain")).toBe(-1000);
    expect(power(game, "p2", "p2-leader")).toBe(0);
  });

  it("still takes the Life behind another Leader, for no debuff", () => {
    const game = openAttack(
      counterStep("op18-020-other")
        .withLife("p1", lifeCards(2))
        .withHand("p1", [instance("event", "OP18-020")]),
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    pick(game, "apply");
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(0);
    expect(power(game, "p2", "attacker")).toBe(6000);
  });

  it("keeps the Life when declined", () => {
    const game = openAttack(
      counterStep("op18-020-decline")
        .withLeader("p1", "EB03-001")
        .withLife("p1", lifeCards(2))
        .withHand("p1", [instance("event", "OP18-020")]),
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    pick(game, "skip");
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(power(game, "p2", "attacker")).toBe(6000);
  });
});
