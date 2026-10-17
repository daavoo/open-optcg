import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import type { MechanicProgram } from "../packages/engine-core/src/mechanics.js";
import { onStartOfYourTurnPrograms } from "../packages/engine-core/src/mechanics/index.js";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Clause-by-clause tests for OP11 cards no other file claimed.
 *
 * The same shape as `test/op11-clauses.test.ts`: an ordinary ST31 vs ST32
 * game on a bare table, with the OP11 card put into a hand, onto a board or
 * into Life, and each printed clause driven through the engine's own actions.
 * `pnpm card:text <card>` prints the text each block drives.
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

/** p2's Main Phase, for the clauses that answer p2's attacks and effects. */
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

type Driven = {
  state: GameState;
  play: (matcher: Record<string, unknown>) => unknown;
  pass: () => unknown;
  legalActions: () => LegalAction[];
};

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function resolveAll(game: Driven): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const canAttackWith = (game: Driven, attacker: string, target?: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === attacker &&
        (target === undefined || action.targetInstanceId === target),
    );

const blockers = (game: Driven): string[] =>
  game
    .legalActions()
    .flatMap((action) =>
      action.type === "block" ? [action.blockerInstanceId] : [],
    );

/** `attacker` swings into `target`; the declaration's own prompts are left open. */
function declare(game: Driven, attacker: string, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
}

/** Passes the Block and Counter steps, so the battle resolves. */
function passBattle(game: Driven): void {
  let guard = 0;
  while (game.state.phase === "block" || game.state.phase === "counter") {
    if (guard++ > 10) throw new Error("battle never resolved");
    game.pass();
  }
}

describe("OP11-005 Smoker", () => {
  covers("OP11-005", "[Blocker]", "static");

  /** p2's turn, with Smoker on p1's board and `cards` in p2's hand. */
  const threatened = (seed: string, given: number, hand: string) => {
    const builder = defending(seed)
      .withBoard("p1", [character("smoker", "OP11-005")])
      .withHand("p2", [instance("removal", hand)])
      .withBoard("p2", [
        // Two rested bodies switch on OP09-026 Sakazuki's K.O.
        character("rested-a", "ST32-004", { rested: true }),
        character("rested-b", "ST32-004", { rested: true }),
      ]);
    return (given > 0 ? builder.withGivenDon("p1", "smoker", given) : builder)
      .withLife("p1", 1)
      .build();
  };

  it("can block", () => {
    const game = defending("op11-005-block")
      .withBoard("p1", [character("smoker", "OP11-005")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    declare(game, "attacker", "p1-leader");

    expect(blockers(game)).toEqual(["smoker"]);
    game.play({ type: "block", blockerInstanceId: "smoker" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("smoker");
  });

  it("with a DON!! given, survives a K.O. by a Character without <Special>", () => {
    // OP06-007 Shanks is <Slash>.
    const game = threatened("op11-005-slash", 1, "OP06-007");

    game.play({ type: "play-card", cardNumber: "OP06-007" });
    // Offered, as every K.O. target is; the immunity turns the K.O. aside
    // when it lands.
    game.play({ type: "resolve-effect", optionId: "smoker" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["smoker"]);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("without a DON!! given, is K.O.'d by the same Character", () => {
    const game = threatened("op11-005-no-don", 0, "OP06-007");

    game.play({ type: "play-card", cardNumber: "OP06-007" });
    game.play({ type: "resolve-effect", optionId: "smoker" });
    resolveAll(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toEqual(["smoker"]);
  });

  it("with a DON!! given, is still K.O.'d by a <Special> Character", () => {
    // OP09-026 Sakazuki is <Special>.
    const game = threatened("op11-005-special", 1, "OP09-026");

    game.play({ type: "play-card", cardNumber: "OP09-026" });
    game.play({ type: "resolve-effect", optionId: "smoker" });
    resolveAll(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toEqual(["smoker"]);
  });

  it("with a DON!! given, is still K.O.'d by an Event", () => {
    const game = threatened("op11-005-event", 1, "OP11-018");

    game.play({ type: "activate-main", cardNumber: "OP11-018" });
    // No debuff; Smoker is 6000 with its DON!!, inside the K.O.'s reach.
    game.play({ type: "resolve-effect", optionId: "done" });
    game.play({ type: "resolve-effect", optionId: "smoker" });
    resolveAll(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toEqual(["smoker"]);
  });
});

describe("OP11-006 Zephyr", () => {
  covers("OP11-006", "[When Attacking]");

  const swinging = (seed: string, given: number) => {
    const builder = table(seed)
      .withBoard("p1", [character("zephyr", "OP11-006")])
      .withBoard("p2", [
        character("special", "OP09-082"), // <Special>, 6000
        character("slash", "ST32-004"), // <Slash>
      ]);
    return (
      given > 0 ? builder.withGivenDon("p1", "zephyr", given) : builder
    ).build();
  };

  it("with a DON!! given, gives a <Special> Character −5000 for the turn", () => {
    const game = swinging("op11-006-attack", 1);

    declare(game, "zephyr", "p2-leader");
    // Only the <Special> body is on offer.
    expect(effectOptions(game.state).sort()).toEqual(["done", "special"]);
    game.play({ type: "resolve-effect", optionId: "special" });
    resolveAll(game);

    expect(currentPower(game.state, "p2", "special")).toBe(1_000);
    expect(currentPower(game.state, "p2", "slash")).toBe(5_000);
  });

  it("does nothing without a DON!! given", () => {
    const game = swinging("op11-006-no-don", 0);

    declare(game, "zephyr", "p2-leader");
    expect(effectOptions(game.state)).not.toContain("special");
    resolveAll(game);

    expect(currentPower(game.state, "p2", "special")).toBe(6_000);
  });
});

describe("OP11-007 Tashigi", () => {
  covers("OP11-007", "[Activate: Main]");

  const board = () => [
    character("tashigi", "OP11-007"),
    character("navy", "OP12-052"), // {Navy}, 6000
    character("other", "ST31-003"),
  ];

  it("rests itself to give a {Navy} Character +2000 behind a {Navy} Leader", () => {
    const game = table("op11-007-navy")
      .withLeader("p1", "OP11-001") // Koby, {Navy}
      .withBoard("p1", board())
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-007" });
    // Tashigi is {Navy} too; the off-type body is not offered.
    expect(effectOptions(game.state).sort()).toEqual(
      ["done", "navy", "tashigi"].sort(),
    );
    game.play({ type: "resolve-effect", optionId: "navy" });
    resolveAll(game);

    expect(currentPower(game.state, "p1", "navy")).toBe(8_000);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "tashigi")
        ?.rested,
    ).toBe(true);
  });

  it("buffs nothing behind a Leader without {Navy}", () => {
    const game = table("op11-007-other").withBoard("p1", board()).build();

    game.play({ type: "activate-main", cardNumber: "OP11-007" });
    resolveAll(game);

    expect(currentPower(game.state, "p1", "navy")).toBe(6_000);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "tashigi")
        ?.rested,
    ).toBe(true);
  });

  it("is not offered while rested", () => {
    const game = table("op11-007-rested")
      .withLeader("p1", "OP11-001")
      .withBoard("p1", [character("tashigi", "OP11-007", { rested: true })])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("Tashigi"),
        ),
    ).toBe(false);
  });
});

describe("OP11-010 Hibari", () => {
  covers("OP11-010", "[On Play]", "[When Attacking]");

  it("gives an opponent's Character −2000 for the turn on play", () => {
    const game = table("op11-010-play")
      .withHand("p1", [instance("hibari", "OP11-010")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-010" });
    game.play({ type: "resolve-effect", optionId: "target" });
    resolveAll(game);

    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
  });

  it("gains +1000 when attacking and lets the {Navy} Leader attack an active Character", () => {
    const game = table("op11-010-attack")
      .withLeader("p1", "OP11-001") // Koby, {Navy}
      .withBoard("p1", [character("hibari", "OP11-010")])
      .withBoard("p2", [character("active", "ST32-004")])
      .withLife("p2", [instance("life", "ST32-004")])
      .build();

    expect(canAttackWith(game, "p1-leader", "active")).toBe(false);
    declare(game, "hibari", "p2-leader");
    expect(effectOptions(game.state).sort()).toEqual(["done", "p1-leader"]);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    resolveAll(game);
    expect(currentPower(game.state, "p1", "hibari")).toBe(7_000);
    passBattle(game);
    resolveAll(game);

    expect(game.state.phase).toBe("main");
    expect(canAttackWith(game, "p1-leader", "active")).toBe(true);
  });

  it("offers no Leader behind one without {Navy}", () => {
    const game = table("op11-010-other")
      .withBoard("p1", [character("hibari", "OP11-010")])
      .withBoard("p2", [character("active", "ST32-004")])
      .build();

    declare(game, "hibari", "p2-leader");
    expect(effectOptions(game.state)).not.toContain("p1-leader");
    resolveAll(game);
    expect(currentPower(game.state, "p1", "hibari")).toBe(7_000);
  });
});

describe("OP11-016 Roronoa Zoro", () => {
  covers("OP11-016", "[Activate: Main]");

  it("gives a rested DON!! to a Character, once per turn", () => {
    const game = table("op11-016-give")
      .withBoard("p1", [
        character("zoro", "OP11-016"),
        character("friend", "ST31-003"),
      ])
      .withDon("p1", { rested: 2 })
      .build();
    const rested = game.state.players.p1.restedDon.length;
    const active = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", cardNumber: "OP11-016" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["p1-leader", "zoro", "friend"]),
    );
    game.play({ type: "resolve-effect", optionId: "friend" });
    resolveAll(game);

    const friend = game.state.players.p1.board.find(
      (card) => card.instanceId === "friend",
    );
    expect(friend?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(rested - 1);
    expect(game.state.players.p1.activeDon).toHaveLength(active);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("Roronoa Zoro [OP11-016]"),
        ),
    ).toBe(false);
  });

  it("can give it to the Leader", () => {
    const game = table("op11-016-leader")
      .withBoard("p1", [character("zoro", "OP11-016")])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-016" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    resolveAll(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("is not offered with no rested DON!!", () => {
    const game = table("op11-016-none")
      .withBoard("p1", [character("zoro", "OP11-016")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP11-016"),
        ),
    ).toBe(false);
  });
});

describe("OP11-018 Honesty Impact", () => {
  covers("OP11-018", "[Main]", "[Trigger]");

  it("debuffs a 10000 body by 4000 and then K.O.s it at 6000", () => {
    const game = table("op11-018-main")
      .withHand("p1", [instance("impact", "OP11-018")])
      .withBoard("p2", [
        character("giant", "OP05-044"), // 10000
        character("small", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-018" });
    game.play({ type: "resolve-effect", optionId: "giant" });
    // At 6000 now, so the K.O. reaches it.
    expect(effectOptions(game.state)).toContain("giant");
    game.play({ type: "resolve-effect", optionId: "giant" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["small"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["giant"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["impact"]);
  });

  it("K.O.s a Character with 6000 power or less as its [Trigger]", () => {
    const game = defending("op11-018-trigger")
      .withLife("p1", [instance("life-impact", "OP11-018")])
      .withBoard("p2", [
        character("attacker", "OP05-065"), // 8000: out of reach
        character("six", "OP11-003"), // 6000
      ])
      .build();

    declare(game, "attacker", "p1-leader");
    passBattle(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "six"]);
    game.play({ type: "resolve-effect", optionId: "six" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["attacker"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["six"]);
  });
});

describe("OP11-020 X Calibur", () => {
  covers("OP11-020", "[Counter]", "[Trigger]");

  it("gives +2000 for the battle, and +1000 for the turn against a 6000 body", () => {
    const game = defending("op11-020-counter")
      .withHand("p1", [instance("calibur", "OP11-020")])
      .withBoard("p1", [character("friend", "ST31-003")])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("six", "OP11-003"), // 6000
      ])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["p1-leader", "friend"]),
    );
    game.play({ type: "resolve-effect", optionId: "friend" });
    resolveAll(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(currentPower(game.state, "p1", "friend")).toBe(4_000);
    expect(ids(game.state.players.p1.trash)).toEqual(["calibur"]);
  });

  it("gives only the +2000 when the opponent has no 6000 body", () => {
    const game = defending("op11-020-small")
      .withHand("p1", [instance("calibur", "OP11-020")])
      .withBoard("p1", [character("friend", "ST31-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event" });
    expect(effectOptions(game.state)).not.toContain("friend");
    resolveAll(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(currentPower(game.state, "p1", "friend")).toBe(3_000);
  });

  it("gives +1000 for the turn as its [Trigger]", () => {
    const game = defending("op11-020-trigger")
      .withLife("p1", [instance("life-calibur", "OP11-020")])
      .withBoard("p1", [character("friend", "ST31-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    declare(game, "attacker", "p1-leader");
    passBattle(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "friend" });
    resolveAll(game);

    expect(currentPower(game.state, "p1", "friend")).toBe(4_000);
  });
});

describe("OP11-025 Ishilly", () => {
  covers("OP11-025", "[On Your Opponent's Attack]");

  const attacked = (seed: string) => {
    const game = defending(seed)
      .withBoard("p1", [character("ishilly", "OP11-025")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    declare(game, "attacker", "p1-leader");
    return game;
  };

  it("rests a DON!! and itself for +1000 during the battle", () => {
    const game = attacked("op11-025-apply");
    const active = game.state.players.p1.activeDon.length;

    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    resolveAll(game);

    expect(game.state.activeAttack?.counterPower).toBe(1_000);
    expect(game.state.players.p1.activeDon).toHaveLength(active - 1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "ishilly")
        ?.rested,
    ).toBe(true);
  });

  it("may be declined, and pays nothing", () => {
    const game = attacked("op11-025-skip");
    const active = game.state.players.p1.activeDon.length;

    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(game.state.players.p1.activeDon).toHaveLength(active);
    expect(game.state.players.p1.board[0]?.rested).toBe(false);
  });
});

describe("OP11-027 Bulge-Eyed Neptunian", () => {
  covers("OP11-027", "static");

  const justPlayed = (seed: string, leader?: string) => {
    const builder = table(seed)
      .withBoard("p1", [character("neptunian", "OP11-027", { playedTurn: 11 })])
      .withBoard("p2", [character("rested", "ST32-004", { rested: true })]);
    return (leader ? builder.withLeader("p1", leader) : builder).build();
  };

  it("attacks a Character, not the Leader, the turn it is played behind [Shirahoshi]", () => {
    const game = justPlayed("op11-027-shirahoshi", "OP11-022");

    expect(hasKeyword(game.state, "p1", "neptunian", "Rush: Character")).toBe(
      true,
    );
    expect(canAttackWith(game, "neptunian", "rested")).toBe(true);
    expect(canAttackWith(game, "neptunian", "p2-leader")).toBe(false);
  });

  it("waits a turn behind another Leader", () => {
    const game = justPlayed("op11-027-other");

    expect(hasKeyword(game.state, "p1", "neptunian", "Rush: Character")).toBe(
      false,
    );
    expect(canAttackWith(game, "neptunian")).toBe(false);
  });
});

describe("OP11-034 Hatchan", () => {
  covers("OP11-034", "[Activate: Main]");

  it("rests itself to stop a cost-3 Character resting through the opponent's next turn", () => {
    const game = table("op11-034-lock")
      .withLeader("p1", "OP11-022") // Shirahoshi, {Merfolk}
      .withBoard("p1", [character("hatchan", "OP11-034")])
      .withBoard("p2", [
        character("small", "ST32-001"), // cost 1
        character("big", "ST32-004"), // cost 4: out of reach
      ])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-034" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "small"]);
    game.play({ type: "resolve-effect", optionId: "small" });
    resolveAll(game);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "hatchan")
        ?.rested,
    ).toBe(true);

    game.pass();
    // p2's turn: attacking rests the attacker, so the locked body cannot.
    expect(game.state.activePlayer).toBe("p2");
    expect(canAttackWith(game, "small")).toBe(false);
    expect(canAttackWith(game, "big")).toBe(true);
  });

  it("rests itself and locks nothing behind a Leader without the types", () => {
    const game = table("op11-034-other")
      .withBoard("p1", [character("hatchan", "OP11-034")])
      .withBoard("p2", [character("small", "ST32-001")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-034" });
    resolveAll(game);

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p2.board[0]?.cannotRestUntilTurn).toBeUndefined();
  });
});

describe("OP11-042 Vito", () => {
  covers("OP11-042", "[On Play]");

  it("trashes a {Firetank Pirates} card to gain [Rush]", () => {
    const game = table("op11-042-rush")
      .withHand("p1", [
        instance("vito", "OP11-042"),
        instance("gotti", "OP11-050"), // {Firetank Pirates}
        instance("off", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-042" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game.state)).toContain("gotti");
    expect(effectOptions(game.state)).not.toContain("off");
    game.play({ type: "resolve-effect", optionId: "gotti" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["gotti"]);
    expect(hasKeyword(game.state, "p1", "vito", "Rush")).toBe(true);
    expect(canAttackWith(game, "vito", "p2-leader")).toBe(true);
  });

  it("has no [Rush] with only off-type cards to pay with", () => {
    const game = table("op11-042-off")
      .withHand("p1", [
        instance("vito", "OP11-042"),
        instance("off", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-042" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["off"]);
    expect(canAttackWith(game, "vito")).toBe(false);
  });
});

describe("OP11-044 Vinsmoke Judge", () => {
  covers("OP11-044", "[Activate: Main]");

  it("trashes a card to give every {GERMA 66} Character +1000, once per turn", () => {
    const game = table("op11-044-buff")
      .withBoard("p1", [
        character("judge", "OP11-044"), // 8000
        character("niji", "OP11-045"), // {GERMA 66}, 6000
        character("off", "ST31-003"), // 3000
      ])
      .withHand("p1", [instance("fodder", "ST31-003")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-044" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
    expect(currentPower(game.state, "p1", "judge")).toBe(9_000);
    expect(currentPower(game.state, "p1", "niji")).toBe(7_000);
    expect(currentPower(game.state, "p1", "off")).toBe(3_000);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP11-044"),
        ),
    ).toBe(false);
  });

  it("is not offered with an empty hand", () => {
    const game = table("op11-044-empty")
      .withBoard("p1", [character("judge", "OP11-044")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP11-044"),
        ),
    ).toBe(false);
  });
});

describe("OP11-046 Vinsmoke Yonji", () => {
  covers("OP11-046", "[Blocker]", "static");

  const facing = (seed: string, removal: string, offType: boolean) =>
    defending(seed)
      .withLeader("p2", "OP11-021") // Jinbe, {Fish-Man}
      .withBoard("p1", [
        character("yonji", "OP11-046"),
        character("niji", "OP11-045"), // {GERMA 66}
        ...(offType ? [character("off", "ST31-003")] : []),
      ])
      .withHand("p2", [instance("removal", removal)])
      .build();

  it("can block", () => {
    const game = defending("op11-046-block")
      .withBoard("p1", [character("yonji", "OP11-046")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    declare(game, "attacker", "p1-leader");
    expect(blockers(game)).toEqual(["yonji"]);
  });

  it("cannot be K.O.'d by the opponent's effect beside only GERMA Characters", () => {
    const game = facing("op11-046-ko", "OP06-007", false);

    game.play({ type: "play-card", cardNumber: "OP06-007" });
    game.play({ type: "resolve-effect", optionId: "yonji" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toContain("yonji");
  });

  it("is K.O.'d with an off-type Character beside it", () => {
    const game = facing("op11-046-ko-mixed", "OP06-007", true);

    game.play({ type: "play-card", cardNumber: "OP06-007" });
    game.play({ type: "resolve-effect", optionId: "yonji" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).not.toContain("yonji");
    expect(ids(game.state.players.p1.trash)).toEqual(["yonji"]);
  });

  it("cannot be rested by the opponent's effect beside only GERMA Characters", () => {
    // OP11-035 Fisher Tiger rests any opposing Character.
    const game = facing("op11-046-rest", "OP11-035", false);

    game.play({ type: "play-card", cardNumber: "OP11-035" });
    expect(effectOptions(game.state)).toContain("niji");
    expect(effectOptions(game.state)).not.toContain("yonji");
  });

  it("can be rested with an off-type Character beside it", () => {
    const game = facing("op11-046-rest-mixed", "OP11-035", true);

    game.play({ type: "play-card", cardNumber: "OP11-035" });
    game.play({ type: "resolve-effect", optionId: "yonji" });
    resolveAll(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "yonji")
        ?.rested,
    ).toBe(true);
  });
});

describe('OP11-048 Capone"Gang"Bege', () => {
  covers("OP11-048", "[On Play]");

  it("adds a cost-2+ {Firetank Pirates} or {Straw Hat Crew} card from 4 and bottoms the rest", () => {
    const game = table("op11-048-search")
      .withHand("p1", [instance("bege", "OP11-048")])
      .withDeckTop("p1", [
        instance("vito", "OP11-042"), // {Firetank Pirates}, cost 3
        instance("brook", "ST31-003"), // {Straw Hat Crew}, cost 2
        instance("cheap", "OP07-099"), // {Straw Hat Crew}, cost 1
        instance("off", "ST32-004"),
        instance("fifth", "OP11-050"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-048" });
    expect(effectOptions(game.state).sort()).toEqual(
      ["brook", "done", "vito"].sort(),
    );
    game.play({ type: "resolve-effect", optionId: "vito" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["vito"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("fifth");
    expect(ids(game.state.players.p1.deck.slice(-3)).sort()).toEqual(
      ["brook", "cheap", "off"].sort(),
    );
  });
});

describe("OP11-050 Gotti", () => {
  covers("OP11-050", "[When Attacking]");

  const swinging = (seed: string, hand: string) =>
    table(seed)
      .withBoard("p1", [character("gotti", "OP11-050")])
      .withHand("p1", [instance("fodder", hand)])
      .withBoard("p2", [
        character("small", "ST32-001"), // cost 1
        character("big", "ST32-004"), // cost 4
      ])
      .build();

  it("trashes a {Firetank Pirates} card to return a cost-1 Character to hand", () => {
    const game = swinging("op11-050-hand", "OP11-042");

    declare(game, "gotti", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    expect(effectOptions(game.state)).toContain("small");
    expect(effectOptions(game.state)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "hand" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["small"]);
  });

  it("or places it at the bottom of its owner's deck", () => {
    const game = swinging("op11-050-deck", "OP11-042");

    declare(game, "gotti", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "deck" });
    resolveAll(game);

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("small");
    expect(ids(game.state.players.p2.board)).toEqual(["big"]);
  });

  it("cannot pay with an off-type card", () => {
    const game = swinging("op11-050-off", "ST31-003");

    declare(game, "gotti", "p2-leader");
    resolveAll(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["fodder"]);
    expect(ids(game.state.players.p2.board)).toEqual(["small", "big"]);
  });
});

describe("OP11-051 Sanji", () => {
  covers("OP11-051", "[On Play]", "static");

  it("returns a Character with 5000 base power or less to its owner's hand on play", () => {
    const game = table("op11-051-play")
      .withHand("p1", [instance("sanji", "OP11-051")])
      .withBoard("p2", [
        character("five", "ST32-004"), // 5000
        character("six", "OP11-003"), // 6000
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-051" });
    expect(effectOptions(game.state)).toContain("five");
    expect(effectOptions(game.state)).not.toContain("six");
    game.play({ type: "resolve-effect", optionId: "five" });
    resolveAll(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["five"]);
    expect(ids(game.state.players.p2.board)).toEqual(["six"]);
  });

  const deckTop = () => [
    instance("usopp", "OP11-003"), // {Straw Hat Crew}, cost 5
    instance("luffy", "P-041"), // {Straw Hat Crew}, cost 10: too big
    instance("off", "ST32-004"),
    instance("brook", "ST31-003"), // {Straw Hat Crew}, cost 2
    instance("off-2", "ST32-004"),
    instance("sixth", "ST31-003"),
  ];

  it("K.O.'d by the opponent's effect, plays a cost-5 {Straw Hat Crew} Character from 5", () => {
    const game = defending("op11-051-ko")
      .withBoard("p1", [character("sanji", "OP11-051")])
      .withDeckTop("p1", deckTop())
      .withHand("p2", [instance("shanks", "OP06-007")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-007" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    // p1 answers its own clause on p2's turn.
    expect(game.state.activePlayer).toBe("p1");
    expect(effectOptions(game.state).sort()).toEqual(
      ["brook", "done", "usopp"].sort(),
    );
    game.play({ type: "resolve-effect", optionId: "usopp" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["usopp"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["sanji"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("sixth");
    expect(ids(game.state.players.p1.deck.slice(-4)).sort()).toEqual(
      ["brook", "luffy", "off", "off-2"].sort(),
    );
  });

  it("does nothing when K.O.'d in battle", () => {
    const game = defending("op11-051-battle")
      .withBoard("p1", [character("sanji", "OP11-051", { rested: true })])
      .withDeckTop("p1", deckTop())
      .withBoard("p2", [character("attacker", "P-041")]) // 12000
      .build();

    declare(game, "attacker", "sanji");
    passBattle(game);
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["sanji"]);
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.deck.slice(0, 6))).toEqual(ids(deckTop()));
  });
});

describe("OP11-056 Brook", () => {
  covers("OP11-056", "[On Play]", "[Blocker]");

  it("places a Character with a base cost of 1 at the bottom of its owner's deck", () => {
    const game = table("op11-056-play")
      .withHand("p1", [instance("brook", "OP11-056")])
      .withBoard("p2", [
        character("one", "ST32-001"), // cost 1
        character("two", "ST31-003"), // cost 2
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-056" });
    expect(effectOptions(game.state)).toContain("one");
    expect(effectOptions(game.state)).not.toContain("two");
    game.play({ type: "resolve-effect", optionId: "one" });
    resolveAll(game);

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("one");
    expect(ids(game.state.players.p2.board)).toEqual(["two"]);
  });

  it("can block", () => {
    const game = defending("op11-056-block")
      .withBoard("p1", [character("brook", "OP11-056")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    declare(game, "attacker", "p1-leader");
    expect(blockers(game)).toEqual(["brook"]);
  });
});

describe("OP11-057 Pedro", () => {
  covers("OP11-057", "static");

  const attacked = (seed: string, handSize: number) => {
    const game = defending(seed)
      .withBoard("p1", [character("pedro", "OP11-057")])
      .withHand(
        "p1",
        Array.from({ length: handSize }, (_, index) =>
          instance(`card-${index}`, "ST31-003"),
        ),
      )
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    declare(game, "attacker", "p1-leader");
    return game;
  };

  it("is a [Blocker] with 4 cards in hand", () => {
    const game = attacked("op11-057-four", 4);

    expect(hasKeyword(game.state, "p1", "pedro", "Blocker")).toBe(true);
    expect(blockers(game)).toEqual(["pedro"]);
  });

  it("is not a [Blocker] with 5 cards in hand", () => {
    const game = attacked("op11-057-five", 5);

    expect(hasKeyword(game.state, "p1", "pedro", "Blocker")).toBe(false);
    expect(blockers(game)).toEqual([]);
  });
});

describe("OP11-058 Monkey.D.Luffy", () => {
  covers("OP11-058", "[Blocker]", "static");

  const ready = (seed: string, handSize: number) =>
    table(seed)
      .withBoard("p1", [character("luffy", "OP11-058")])
      .withHand(
        "p1",
        Array.from({ length: handSize }, (_, index) =>
          instance(`card-${index}`, "ST31-003"),
        ),
      )
      .build();

  it("attacks with 4 cards in hand", () => {
    expect(canAttackWith(ready("op11-058-four", 4), "luffy", "p2-leader")).toBe(
      true,
    );
  });

  it("cannot attack with 5 cards in hand", () => {
    expect(canAttackWith(ready("op11-058-five", 5), "luffy")).toBe(false);
  });

  it("can block", () => {
    const game = defending("op11-058-block")
      .withBoard("p1", [character("luffy", "OP11-058")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    declare(game, "attacker", "p1-leader");
    expect(blockers(game)).toEqual(["luffy"]);
  });
});

describe("a start-of-turn program's other decisions", () => {
  // OP11-040 is the only start-of-turn program in the pool, and it stops only
  // on its own card and option picks. A start-of-turn program can also stop on
  // a `DON!! −N` return choice or on the opponent's Trigger from damage it
  // deals, so each is driven here through a program registered for the test
  // on ST31's Leader and removed again afterwards.
  const LEADER = "ST21-001";

  /**
   * p1 ends turn 11 and p2 ends turn 12 with `program` registered, so it runs
   * as p1's turn 13 starts. Registered only once the position is built, so the
   * turns the builder plays through do not run it.
   */
  function nextTurn(
    seed: string,
    program: MechanicProgram,
    run: (game: Game) => void,
    life: string[] = [],
  ): void {
    const game = table(seed)
      .withDeckTop("p1", [
        instance("p1-draw", "ST31-003"),
        instance("p1-second", "ST31-003"),
      ])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .withLife(
        "p2",
        life.map((card, index) => instance(`p2-life-${index}`, card)),
      )
      .withDon("p1", { rested: 2 })
      .build();
    expect(game.state.players.p1.leaderCardNumber).toBe(LEADER);
    const registry = onStartOfYourTurnPrograms as Map<string, MechanicProgram>;
    expect(registry.has(LEADER)).toBe(false);
    registry.set(LEADER, program);
    try {
      game.pass();
      game.pass();
      expect(game.state.turn).toBe(13);
      run(game);
    } finally {
      registry.delete(LEADER);
    }
  }

  it("answers a DON!! −1 return choice before the Refresh, Draw and DON!! steps", () => {
    nextTurn(
      "start-of-turn-don-minus",
      {
        effect: {
          kind: "optional",
          effect: { kind: "return-don", player: "self", count: 1 },
        },
      },
      (game) => {
        game.play({ type: "resolve-effect", optionId: "apply" });
        // Asked before the Refresh: the rested DON!! the automatic pick did
        // not take is still rested, and nothing has been drawn.
        expect(game.state.pendingEffect?.kind).toBe("return-don");
        expect(game.state.players.p1.hand).toHaveLength(0);
        expect(game.state.players.p1.restedDon).toHaveLength(1);
        game.play({ type: "resolve-effect" });

        expect(game.state.pendingEffect).toBeNull();
        expect(game.state.startOfTurnSuspended).toBeUndefined();
        expect(ids(game.state.players.p1.hand)).toEqual(["p1-draw"]);
        expect(game.state.players.p1.restedDon).toHaveLength(0);
        expect(game.state.phase).toBe("main");
        expect(game.state.activePlayer).toBe("p1");
      },
    );
  });

  it("waits for the opponent's Trigger off its damage, and the choice that Trigger asks", () => {
    nextTurn(
      "start-of-turn-damage",
      { effect: { kind: "deal-damage", player: "opponent" } },
      (game) => {
        // The damage opened p2's Trigger window before p1 drew.
        expect(game.state.phase).toBe("trigger");
        expect(game.state.activePlayer).toBe("p2");
        expect(game.state.players.p1.hand).toHaveLength(0);
        game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
        expect(game.state.activePlayer).toBe("p2");
        expect(game.state.players.p1.hand).toHaveLength(0);
        game.play({ type: "resolve-effect", optionId: "p2-leader" });

        expect(game.state.pendingEffect).toBeNull();
        expect(game.state.pendingTrigger).toBeNull();
        expect(ids(game.state.players.p1.hand)).toEqual(["p1-draw"]);
        expect(game.state.phase).toBe("main");
        expect(game.state.activePlayer).toBe("p1");
      },
      ["OP11-020"],
    );
  });

  it("resumes the turn in the same action when it asks nothing", () => {
    nextTurn(
      "start-of-turn-silent",
      { effect: { kind: "draw", player: "self", count: 1 } },
      (game) => {
        expect(game.state.pendingEffect).toBeNull();
        expect(game.state.startOfTurnSuspended).toBeUndefined();
        // The program's own draw, then the Draw Phase's.
        expect(ids(game.state.players.p1.hand)).toEqual([
          "p1-draw",
          "p1-second",
        ]);
        expect(game.state.phase).toBe("main");
        expect(game.state.activePlayer).toBe("p1");
      },
    );
  });
});
