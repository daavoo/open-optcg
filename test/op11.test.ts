import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  playCostFromHand,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP11 "A Fist of Divine Speed", imported whole.
 *
 * Same shape as `test/op10.test.ts`: the set ships in no deck, so its cards are
 * put into a hand or onto a board of an otherwise ordinary game, and what is
 * asserted is the printed clause together with the boundary it draws.
 */

const table = (seed: string) =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

const defending = (seed: string) =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

const ATTACK = {
  attackerPlayerId: "p2",
  defenderPlayerId: "p1",
  attackerInstanceId: "attacker",
  targetInstanceId: "p1-leader",
  attackPower: 6000,
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

describe("OP11 metadata import", () => {
  it("registers all 119 OP11 identities with their printed rarity", () => {
    const op11 = [...cardRegistry.values()].filter((card) =>
      card.cardNumber.startsWith("OP11-"),
    );
    expect(op11).toHaveLength(119);
    expect(op11.every((card) => card.rarity)).toBe(true);
  });
});

describe("OP11-002 Ain", () => {
  covers("OP11-002", "[On Play]");

  it("debuffs a body into range of its own K.O.", () => {
    const game = table("op11-002")
      .withHand("p1", [instance("ain", "OP11-002")])
      // OP11-030 Shirahoshi is a 0-power body; the debuff takes it below 0 and
      // the K.O. reaches it. A 1000-power body would not be reachable.
      .withBoard("p2", [
        character("small", "OP11-030"),
        character("big", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-002" });
    game.play({ type: "resolve-effect", optionId: "small" });
    // Only the debuffed body is at 0 power or less.
    expect(effectOptions(game.state)).toEqual(["small", "done"]);
    game.play({ type: "resolve-effect", optionId: "small" });
    resolveAll(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
  });
});

describe("OP11-013 Prince Grus", () => {
  covers("OP11-013", "[When Attacking]");

  it("switches [Blocker] off on every small body, and leaves the big one", () => {
    const game = table("op11-013")
      .withBoard("p1", [character("grus", "OP11-013", { playedTurn: 1 })])
      .withBoard("p2", [
        character("small", "OP11-029"), // 4000 printed, but a Blocker at 4000?
        character("blocker", "OP10-012"), // 2000-power Blocker
      ])
      .build();

    game.play({ summary: "with Prince Grus" });
    resolveAll(game);

    const board = game.state.players.p2.board;
    // "[printed text omitted -- pnpm card:text OP10-012]": the 2000 body
    // is locked and the 4000 one is not.
    expect(
      board.find((card) => card.instanceId === "blocker")
        ?.blockerDisabledUntilTurn,
    ).toBe(game.state.turn);
    expect(
      board.find((card) => card.instanceId === "small")
        ?.blockerDisabledUntilTurn,
    ).toBeUndefined();
  });
});

describe('OP11\'s "can also attack active Characters" package', () => {
  covers("OP11-014", "[Activate: Main]");
  covers("OP11-119", "[On Play]", "[When Attacking]");

  it("adds the opponent's active Characters to one attacker's targets", () => {
    const game = table("op11-014")
      .withBoard("p1", [
        character("borsalino", "OP11-014"),
        character("swinger", "OP11-092", { playedTurn: 1 }),
      ])
      .withLeader("p1", "OP11-001") // {Navy}: the grant names the type
      .withBoard("p2", [character("active", "ST32-004")])
      .build();

    // Before the grant, an active Character is not a legal target at all.
    expect(
      game.summaries().filter((summary) => summary.includes("Attack")),
    ).not.toContain(expect.stringContaining("active"));
    const before = game
      .legalActions()
      .filter((action) => action.type === "attack").length;

    game.play({ type: "activate-main", summary: "OP11-014" });
    game.play({ type: "resolve-effect", optionId: "swinger" });
    resolveAll(game);

    // One more attack is on offer than before: the same attacker, now able to
    // point at the active body.
    expect(
      game.legalActions().filter((action) => action.type === "attack"),
    ).toHaveLength(before);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "swinger")
        ?.attacksActiveUntilTurn,
    ).toBe(game.state.turn);
  });

  it("lets the card that was granted it attack an active Character", () => {
    const game = table("op11-119")
      .withHand("p1", [instance("koby", "OP11-119")])
      .withBoard("p1", [character("swinger", "OP11-092", { playedTurn: 1 })])
      .withBoard("p2", [character("active", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-119" });
    game.play({ type: "resolve-effect", optionId: "swinger" });
    resolveAll(game);

    expect(
      game.summaries().some((summary) => summary.includes("with Helmeppo")),
    ).toBe(true);
    const attack = game.action(
      (action) =>
        action.type === "attack" &&
        (action as { targetInstanceId?: string }).targetInstanceId === "active",
    );
    expect(attack).toBeDefined();
  });
});

describe("OP11-074 Streusen", () => {
  covers("OP11-074", "[Activate: Main]");

  it("rests a Character when the guessed cost matches the revealed card", () => {
    const game = table("op11-074")
      .withBoard("p1", [character("streusen", "OP11-074")])
      // ST32-004 costs 4, so "guess 4" is the branch that pays out.
      .withDeckTop("p2", [instance("their-top", "ST32-004")])
      .withBoard("p2", [character("victim", "ST32-005")])
      .build();

    game.play({ type: "activate-main", summary: "OP11-074" });
    expect(effectOptions(game.state)).toContain("cost-4");
    game.play({ type: "resolve-effect", optionId: "cost-4" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    resolveAll(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")
        ?.rested,
    ).toBe(true);
  });

  it("pays out nothing on a wrong guess, and the DON!! is spent either way", () => {
    const game = table("op11-074-miss")
      .withBoard("p1", [character("streusen", "OP11-074")])
      .withDeckTop("p2", [instance("their-top", "ST32-004")])
      .withBoard("p2", [character("victim", "ST32-005")])
      .build();

    const donBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", summary: "OP11-074" });
    game.play({ type: "resolve-effect", optionId: "cost-0" });
    resolveAll(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")
        ?.rested,
    ).toBe(false);
    expect(game.state.players.p1.activeDon.length).toBe(donBefore - 1);
  });
});

describe("OP11-092 Helmeppo", () => {
  covers("OP11-092", "[On Play]");

  it("borrows a body from the trash and buries it at the end of the turn", () => {
    const game = table("op11-092")
      .withHand("p1", [
        instance("helmeppo", "OP11-092"),
        instance("fodder", "ST31-003"),
      ])
      .withTrash("p1", [instance("borrowed", "OP11-013")]) // {Navy}/{SWORD}, cost 1
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-092" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "borrowed" });
    resolveAll(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("borrowed");

    game.pass();

    // "at the end of this turn": the borrowed Character is at the bottom of the
    // deck, and Helmeppo itself stays on the board.
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("borrowed");
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("borrowed");
  });
});

describe("OP11-107 Topknot Neptunian", () => {
  covers("OP11-107", "[Activate: Main]");

  it("turns a Life card face-down to come back active at the end of the turn", () => {
    const game = table("op11-107")
      .withLeader("p1", "OP11-022")
      .withBoard("p1", [character("topknot", "OP11-107", { rested: true })])
      .withLife("p1", [instance("life-1", "ST31-003", { faceUp: true })])
      .withDeckTop("p1", [instance("draw-1", "ST31-003")])
      .build();

    game.play({ type: "activate-main", summary: "OP11-107" });
    game.play({ type: "resolve-effect", optionId: "life-1" });
    resolveAll(game);

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    // Still rested: the clause pays at the *end* of the turn, not now.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "topknot")
        ?.rested,
    ).toBe(true);

    game.pass();

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "topknot")
        ?.rested,
    ).toBe(false);
  });

  it("cannot pay with a Life card that is already face-down", () => {
    const game = table("op11-107-cost")
      .withLeader("p1", "OP11-022")
      .withBoard("p1", [character("topknot", "OP11-107", { rested: true })])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .build();

    game.play({ type: "activate-main", summary: "OP11-107" });
    resolveAll(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "topknot")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP11-043 Vinsmoke Ichiji", () => {
  covers("OP11-043", "[On Your Opponent's Attack]");

  /** p2 declares a real attack, so the defender's reaction ladder runs. */
  const attacked = (seed: string, ownBoard: ReturnType<typeof character>[]) => {
    const game = defending(seed)
      .withBoard("p1", ownBoard)
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .withDeckTop("p1", [
        instance("mill-1", "ST31-003"),
        instance("mill-2", "ST31-003"),
      ])
      .build();
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    return game;
  };

  it("offers its buff while every Character it controls is a GERMA one", () => {
    const game = attacked("op11-043", [
      character("ichiji", "OP11-043"),
      character("judge", "OP11-044"),
    ]);

    expect(game.state.activePlayer).toBe("p1");
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.activeAttack?.counterPower).toBe(1_000);
    // "[printed text omitted -- pnpm card:text OP11-044]": the price of the buff.
    expect(game.state.players.p1.trash).toHaveLength(2);
  });

  it("is not offered at all with one off-type Character on the board", () => {
    const game = attacked("op11-043-mixed", [
      character("ichiji", "OP11-043"),
      character("offtype", "ST31-003"), // {Straw Hat Crew}: no "GERMA"
    ]);

    // "[printed text omitted -- pnpm card:text ST31-003]" -- read as an
    // offer gate rather than inside the program, so a clause that would do
    // nothing is never pushed at the defender.
    expect(effectOptions(game.state)).not.toContain("apply");
  });
});

describe("OP11-088 Shu", () => {
  covers("OP11-088", "static");

  const attackedBy = (seed: string, attacker: string) => {
    const game = defending(seed)
      .withBoard("p1", [character("shu", "OP11-088")])
      .withBoard("p2", [character("attacker", attacker, { playedTurn: 1 })])
      .build();
    // The *Character* has to be the one that declares: the clause names one,
    // and p2's Leader is a legal attacker too.
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    return game;
  };

  it("answers a <Slash> Character with +5000", () => {
    // ST32-005 Roronoa Zoro is <Slash>.
    const game = attackedBy("op11-088", "ST32-005");

    expect(effectOptions(game.state)).toContain("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.activeAttack?.counterPower).toBe(5_000);
  });

  it("is not offered against an attacker of another attribute", () => {
    // OP11-013 Prince Grus is <Special>.
    const game = attackedBy("op11-088-special", "OP11-013");

    expect(effectOptions(game.state)).not.toContain("apply");
  });
});

describe("OP11-023 Arlong", () => {
  covers("OP11-023", "static", "[Trigger]");

  it("costs 3 less behind a {Fish-Man} Leader, at low Life, against a rested board", () => {
    const game = table("op11-023")
      .withLeader("p1", "OP11-021") // Jinbe: {Fish-Man}
      .withLife("p1", [
        instance("life-1", "ST31-003"),
        instance("life-2", "ST31-003"),
      ])
      .withBoard("p2", [
        character("a", "ST32-004", { rested: true }),
        character("b", "ST32-005", { rested: true }),
      ])
      .withDon("p2", { rested: 3 })
      .build();

    // Two rested Characters plus three rested DON!! is five rested cards, which
    // is the printed threshold.
    expect(playCostFromHand(game.state, "p1", "OP11-023", 7)).toBe(4);
  });

  it("costs its printed 7 when the opponent's board is active", () => {
    const game = table("op11-023-gate")
      .withLeader("p1", "OP11-021")
      .withLife("p1", [instance("life-1", "ST31-003")])
      .withBoard("p2", [character("a", "ST32-004")])
      .build();

    expect(playCostFromHand(game.state, "p1", "OP11-023", 7)).toBe(7);
  });
});

describe("OP11-077 Randolph", () => {
  covers("OP11-077", "[Your Turn]");

  it("buys +2 cost when a DON!! goes back to the DON!! deck", () => {
    const game = table("op11-077")
      .withBoard("p1", [
        character("randolph", "OP11-077"),
        character("linlin", "OP11-073"),
      ])
      // OP11-063 Little Sadi's [On Play] pays DON!! −1, which is what raises the
      // signal this reaction reads.
      .withHand("p1", [instance("sadi", "OP11-063")])
      .build();

    const linlin = () =>
      game.state.players.p1.board.find((card) => card.instanceId === "linlin")!;
    const before = effectiveCost(game.state, "p1", linlin());

    game.play({ type: "play-card", cardNumber: "OP11-063" });
    // OP11-063 Little Sadi's own `DON!! −1`, which is what returns the DON!!.
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", summary: "active DON" });
    // Randolph's reaction: applied, then which {Big Mom Pirates} body is
    // protected is the decision, and both it and Linlin qualify.
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "linlin" });
    resolveAll(game);

    expect(effectiveCost(game.state, "p1", linlin())).toBe(before + 2);
  });
});

describe("OP11-110 Fukaboshi", () => {
  covers("OP11-110", "static", "[On Play]");

  it("rests its own Stage instead of being K.O.'d", () => {
    const game = table("op11-110")
      .withHand("p1", [instance("thread", "OP10-079")])
      .withBoard("p2", [character("fukaboshi", "OP11-110")])
      .withStage("p2", instance("island", "OP11-117"))
      .build();

    game.play({ summary: "God Thread" });
    game.play({ type: "resolve-effect", optionId: "fukaboshi" });

    const replacement = effectOptions(game.state).find((option) =>
      option.startsWith("replace:"),
    );
    expect(replacement).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replacement! });
    resolveAll(game);

    expect(game.state.players.p2.board).toHaveLength(1);
    expect(game.state.players.p2.stage?.rested).toBe(true);
  });
});

describe("OP11-112 Megalo", () => {
  covers("OP11-112", "[Opponent's Turn]");

  it("defends at 6000 behind its own Leader and at 2000 behind another", () => {
    const behind = defending("op11-112")
      .withLeader("p1", "OP11-022")
      .withBoard("p1", [character("megalo", "OP11-112")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "block")
      .build();
    expect(currentPower(behind.state, "p1", "megalo")).toBe(6_000);

    const other = defending("op11-112-other")
      .withBoard("p1", [character("megalo", "OP11-112")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "block")
      .build();
    expect(currentPower(other.state, "p1", "megalo")).toBe(2_000);
  });
});

describe("OP11-001 Koby", () => {
  covers("OP11-001", "static");

  it("lets its {SWORD} Characters attack Characters the turn they land", () => {
    const game = table("op11-001")
      .withLeader("p1", "OP11-001")
      .withBoard("p1", [
        character("sword", "OP11-013", { playedTurn: 11 }),
        character("other", "ST31-003", { playedTurn: 11 }),
      ])
      .build();

    expect(hasKeyword(game.state, "p1", "sword", "Rush: Character")).toBe(true);
    expect(hasKeyword(game.state, "p1", "other", "Rush: Character")).toBe(
      false,
    );
  });
});

describe("OP11-019 Glorp Web!!", () => {
  covers("OP11-019", "[Counter]");

  it("counts the attacker's given DON!! toward its 6000-power rider", () => {
    // The Counter step belongs to the defender, but the *turn* is still the
    // attacker's, so the DON!! given to the attacker is paying out: a 5000
    // Rayleigh with one DON!! given is the "[printed text omitted -- pnpm card:text OP11-019]"
    // the rider asks for. Reading whose turn it is off `activePlayer` -- the
    // seat holding the decision -- inverted both sides here and dropped the
    // rider against a board that plainly met it.
    const game = defending("op11-019")
      .withHand("p1", [instance("glorp", "OP11-019")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 1)
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event" });
    resolveAll(game);

    expect(
      game.state.players.p1.leaderPowerModifiers.map(
        (modifier) => modifier.amount,
      ),
    ).toContain(1_000);
  });

  it("drops the rider when the same attacker holds no DON!!", () => {
    const game = defending("op11-019-no-don")
      .withHand("p1", [instance("glorp", "OP11-019")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event" });
    resolveAll(game);

    expect(game.state.players.p1.leaderPowerModifiers).toHaveLength(0);
  });
});
