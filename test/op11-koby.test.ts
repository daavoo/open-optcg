import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
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
 * The 2nd-place Indonesia Regional Final Koby list, played through its own
 * fifty behind OP11-001.
 *
 * Hibari, both Kujyaku halves of EB03-041, the EB04 Helmeppo and Koby, Smoker &
 * Tashigi, Prince Grus, OP11-092 Helmeppo, Ace & Sabo & Luffy and PRB02-001's
 * [When Attacking] are driven in their own set files. What this file adds is
 * the rest of the list's printed clauses, each behind the Koby Leader, and the
 * Leader's two halves as the deck uses them: a {SWORD} body attacking a
 * Character the turn it lands, and a small {Navy} body surviving the
 * opponent's removal for three trash cards.
 */
const DECK = "(Red/Black) Koby - 2nd Place Indonesia Regional Final";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";
const LEADER = "OP11-001";
/** A Leader with no {Navy} type, for the clauses that ask for one. */
const OTHER_LEADER = "ST32-001";

/** p1 in its own Main Phase, every DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", LEADER);

/** p2's turn, for the clauses that open on the opponent's turn. */
const defending = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withLeader("p1", LEADER);

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Answer every open prompt with the first of `preferred` offered, else the first offer. */
function answer(game: Game, ...preferred: string[]): void {
  while (game.state.pendingEffect) {
    const options = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect");
    const wanted =
      preferred
        .map((id) =>
          options.find(
            (action) => (action as { optionId?: string }).optionId === id,
          ),
        )
        .find(Boolean) ?? options[0]!;
    game.submit(wanted);
  }
}

/** Decline the block and Counter steps, so a declared attack resolves. */
const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const attackTargets = (game: Game, attacker: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === attacker,
    )
    .map((action) => (action as { targetInstanceId: string }).targetInstanceId);

/** p2's Leader swinging at p1's Leader, stopped in the step named. */
const leaderAttack = {
  attackerPlayerId: "p2",
  defenderPlayerId: "p1",
  attackerInstanceId: "p2-leader",
  targetInstanceId: "p1-leader",
  attackPower: 5000,
  counterPower: 0,
} as const;

describe("OP11-001 Koby: {SWORD} bodies attack Characters the turn they land", () => {
  it("sends a just-played Prince Grus into a rested Character, and not a just-played Ripper", () => {
    const game = table("op11-koby-leader-rush")
      .withHand("p1", [
        instance("grus", "OP11-013"),
        instance("ripper", "OP11-096"),
      ])
      .withBoard("p2", [character("rayleigh", "ST32-004", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-013" });
    game.play({ type: "play-card", cardNumber: "OP11-096" });

    // Ripper is {Navy} but not {SWORD}: the Leader's aura passes it by.
    expect(attackTargets(game, "grus")).toEqual(["rayleigh"]);
    expect(attackTargets(game, "ripper")).toEqual([]);

    game.play({
      type: "attack",
      attackerInstanceId: "grus",
      targetInstanceId: "rayleigh",
    });
    answer(game);
    declineDefence(game);

    expect(
      game.state.players.p1.board.find((c) => c.instanceId === "grus")?.rested,
    ).toBe(true);
  });
});

describe("OP11-001 Koby: the removal replacement", () => {
  /** p2 plays EB04-018 Megalo at p1's rested `body`, with `trashed` in p1's trash. */
  const atMegalo = (seed: string, body: string, trashed: number) => {
    const game = defending(seed)
      .withBoard("p1", [
        character("body", body, { rested: true, playedTurn: 1 }),
      ])
      .withTrash("p1", copies(trashed, "OP11-099", "trashed"))
      .withHand("p2", [instance("megalo", "EB04-018")])
      .build();
    game.play({ type: "play-card", cardNumber: "EB04-018" });
    if (effectOptions(game.state).includes("apply")) {
      game.play({ type: "resolve-effect", optionId: "apply" });
    }
    game.play({ type: "resolve-effect", optionId: "body" });
    return game;
  };

  it("buries three trash cards to keep a 1000-power Ripper on the field", () => {
    const game = atMegalo("op11-koby-leader-replace", "OP11-096", 3);

    expect(effectOptions(game.state)).toContain("replace:p1-leader");
    game.play({ type: "resolve-effect", optionId: "replace:p1-leader" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["body"]);
    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(ids(game.state.players.p1.deck.slice(-3)).sort()).toEqual(
      ["trashed-1", "trashed-2", "trashed-3"].sort(),
    );
  });

  it("does not reach an 8000-base Smoker & Tashigi", () => {
    const game = atMegalo("op11-koby-leader-replace-big", "EB04-003", 3);

    expect(effectOptions(game.state)).not.toContain("replace:p1-leader");
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual([]);
    expect(game.state.players.p1.trash.length).toBe(4);
  });
});

describe("OP11-004 Kujyaku", () => {
  covers("OP11-004", "[On Play]");

  it("finds a {Navy} card other than Kujyaku and puts the rest under the deck", () => {
    const game = table("op11-004-play")
      .withHand("p1", [instance("kujyaku", "OP11-004")])
      .withDeckTop("p1", [
        instance("other-kujyaku", "OP11-004"),
        instance("doll", "OP11-008"),
        instance("asl", "OP13-007"),
        instance("ripper", "OP11-096"),
        instance("fist", "OP13-020"),
        instance("sixth", "OP11-097"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-004" });

    const offered = effectOptions(game.state);
    expect(offered).toEqual(expect.arrayContaining(["doll", "ripper", "fist"]));
    expect(offered).not.toContain("other-kujyaku");
    // Ace & Sabo & Luffy is {Goa Kingdom}, not {Navy}.
    expect(offered).not.toContain("asl");

    answer(game, "doll");

    expect(ids(game.state.players.p1.hand)).toEqual(["doll"]);
    // The sixth card was never looked at, so it is the new top.
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("sixth");
    expect(ids(game.state.players.p1.deck.slice(-4)).sort()).toEqual(
      ["other-kujyaku", "asl", "ripper", "fist"].sort(),
    );
  });

  covers("OP11-004", "[Activate: Main]");

  it("trashes itself to give another Character +1000 for the turn", () => {
    const game = table("op11-004-activate")
      .withBoard("p1", [
        character("kujyaku", "OP11-004", { playedTurn: 1 }),
        character("hibari", "EB03-008", { playedTurn: 1 }),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "kujyaku" });
    answer(game, "apply", "hibari");

    expect(ids(game.state.players.p1.board)).toEqual(["hibari"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["kujyaku"]);
    expect(currentPower(game.state, "p1", "hibari")).toBe(6000);
  });

  // The trash is the price, so Kujyaku is gone before the +1000 picks its
  // target: alone on the board it was reported live because it counted itself.
  it("reports the activation as selecting nothing when it is alone", () => {
    const game = table("op11-004-activate-alone")
      .withBoard("p1", [character("kujyaku", "OP11-004", { playedTurn: 1 })])
      .build();

    const offer = getLegalActions(game.state, "p1").find(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP11-004",
    );
    expect(offer).toMatchObject({ selectsNothing: true });
  });

  it("reports the activation as live beside another Character", () => {
    const game = table("op11-004-activate-partner")
      .withBoard("p1", [
        character("kujyaku", "OP11-004", { playedTurn: 1 }),
        character("hibari", "EB03-008", { playedTurn: 1 }),
      ])
      .build();

    const offer = getLegalActions(game.state, "p1").find(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP11-004",
    );
    expect(offer).toBeDefined();
    expect(offer).not.toHaveProperty("selectsNothing");
  });
});

describe("OP11-008 Doll", () => {
  covers("OP11-008", "[On Play]");

  it("trashes a card from hand to give an opposing Character −6000", () => {
    const game = table("op11-008-play")
      .withHand("p1", [
        instance("doll", "OP11-008"),
        instance("fodder", "OP11-099"),
      ])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-008" });
    answer(game, "apply", "fodder", "rayleigh");

    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
    // 5000 printed, less 6000: the engine reads the deficit, not a floor.
    expect(currentPower(game.state, "p2", "rayleigh")).toBe(-1000);
  });

  it("pays the card for nothing behind a Leader with no {Navy} type", () => {
    const game = table("op11-008-play-other")
      .withLeader("p1", OTHER_LEADER)
      .withHand("p1", [
        instance("doll", "OP11-008"),
        instance("fodder", "OP11-099"),
      ])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-008" });
    answer(game, "apply", "fodder", "rayleigh");

    expect(currentPower(game.state, "p2", "rayleigh")).toBe(5000);
  });

  covers("OP11-008", "[Blocker]");

  it("blocks an attack on the Leader", () => {
    const game = defending("op11-008-blocker")
      .withBoard("p1", [character("doll", "OP11-008", { playedTurn: 1 })])
      .withActiveAttack(leaderAttack, "block")
      .build();

    expect(hasKeyword(game.state, "p1", "doll", "Blocker")).toBe(true);
    game.play({ type: "block", blockerInstanceId: "doll" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("doll");
  });
});

describe("OP11-082 Aramaki", () => {
  covers("OP11-082", "[Activate: Main]");

  it("trashes itself so a {Navy} body can attack an active Character, then mills two", () => {
    const game = table("op11-082")
      .withBoard("p1", [
        character("aramaki", "OP11-082", { playedTurn: 1 }),
        character("ripper", "OP11-096", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .withDeckTop("p1", [
        instance("milled-1", "OP11-097"),
        instance("milled-2", "OP13-020"),
        instance("kept", "OP11-099"),
      ])
      .build();

    expect(attackTargets(game, "ripper")).not.toContain("rayleigh");

    game.play({ type: "activate-main", sourceInstanceId: "aramaki" });
    answer(game, "apply", "ripper");

    expect(ids(game.state.players.p1.board)).toEqual(["ripper"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(
      ["aramaki", "milled-1", "milled-2"].sort(),
    );
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("kept");
    expect(attackTargets(game, "ripper")).toContain("rayleigh");
  });
});

describe("OP11-096 Ripper", () => {
  covers("OP11-096", "static");

  it("is a [Blocker] beside a black {Navy} Aramaki, and not beside a red {Navy} Doll", () => {
    const beside = table("op11-096-black")
      .withBoard("p1", [
        character("ripper", "OP11-096"),
        character("aramaki", "OP11-082"),
      ])
      .build();
    expect(hasKeyword(beside.state, "p1", "ripper", "Blocker")).toBe(true);

    const red = table("op11-096-red")
      .withBoard("p1", [
        character("ripper", "OP11-096"),
        character("doll", "OP11-008"),
      ])
      .build();
    expect(hasKeyword(red.state, "p1", "ripper", "Blocker")).toBe(false);

    const alone = table("op11-096-alone")
      .withBoard("p1", [character("ripper", "OP11-096")])
      .build();
    expect(hasKeyword(alone.state, "p1", "ripper", "Blocker")).toBe(false);
  });

  it("is a second Ripper short of [Blocker]: the other body is named Ripper too", () => {
    const game = table("op11-096-pair")
      .withBoard("p1", [
        character("ripper", "OP11-096"),
        character("ripper-2", "OP11-096"),
      ])
      .build();
    expect(hasKeyword(game.state, "p1", "ripper", "Blocker")).toBe(false);
  });
});

describe("OP11-097 After All These Years I'm Losing My Edge!!!", () => {
  covers("OP11-097", "[Counter]");

  /** The Counter Event in hand against p2's Leader, with `fill` filler plus Helmeppo in the trash. */
  const atCounter = (seed: string, fill: number) =>
    defending(seed)
      .withHand("p1", [instance("edge", "OP11-097")])
      .withTrash("p1", [
        instance("helmeppo", "EB04-047"),
        instance("doll", "OP11-008"),
        ...copies(fill, "OP11-099", "filler"),
      ])
      .withActiveAttack(leaderAttack, "counter")
      .build();

  // The Event counts itself. Comprehensive rules 2-7-3, 7-1-3-2-2 and 8-4-2
  // trash an Event to activate it, so it is in the trash before its effect
  // reads the count: nine cards there beforehand make ten.
  it("gives the Leader +1000 and returns a black 3-cost when nine cards and the Event make ten", () => {
    const game = atCounter("op11-097-full", 7);

    game.play({ type: "activate-counter-event" });
    const options: string[][] = [];
    while (game.state.pendingEffect) {
      options.push(effectOptions(game.state));
      answer(game, "p1-leader", "helmeppo");
    }

    // Doll is red and a 4-cost; Helmeppo is the only card the clause reaches.
    expect(options.flat()).not.toContain("doll");
    expect(ids(game.state.players.p1.hand)).toEqual(["helmeppo"]);
    expect(ids(game.state.players.p1.trash)).toContain("edge");
    expect(game.state.activeAttack?.counterPower).toBe(1000);
  });

  it("returns nothing when eight cards and the Event make nine", () => {
    const game = atCounter("op11-097-short", 6);

    game.play({ type: "activate-counter-event" });
    while (game.state.pendingEffect) answer(game, "p1-leader", "helmeppo");

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toContain("helmeppo");
    expect(game.state.activeAttack?.counterPower).toBe(1000);
  });
});

describe("OP11-099 I'm Gonna Be a Navy Officer!!!", () => {
  covers("OP11-099", "[Main]", "[Trigger]");

  const top = [
    instance("other-officer", "OP11-099"),
    instance("doll", "OP11-008"),
    instance("asl", "OP13-007"),
  ];

  it("finds a {Navy} card other than itself and trashes the rest", () => {
    const game = table("op11-099-main")
      .withHand("p1", [instance("officer", "OP11-099")])
      .withDeckTop("p1", top)
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-event:officer" });
    expect(effectOptions(game.state)).toContain("doll");
    expect(effectOptions(game.state)).not.toContain("other-officer");
    expect(effectOptions(game.state)).not.toContain("asl");
    answer(game, "doll");

    expect(ids(game.state.players.p1.hand)).toEqual(["doll"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(
      ["officer", "other-officer", "asl"].sort(),
    );
  });

  it("runs the same look off a Life card", () => {
    const game = defending("op11-099-trigger")
      .withLife("p1", [instance("life-officer", "OP11-099")])
      .withDeckTop("p1", top)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game, "doll");

    expect(ids(game.state.players.p1.hand)).toEqual(["doll"]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["other-officer", "asl"]),
    );
  });
});

describe("OP13-020 Meteor Fist", () => {
  covers("OP13-020", "[Main]", "[Trigger]");

  it("gives an opposing Character −5000 for the turn", () => {
    const game = table("op13-020-main")
      .withHand("p1", [instance("fist", "OP13-020")])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-event:fist" });
    answer(game, "rayleigh");

    expect(currentPower(game.state, "p2", "rayleigh")).toBe(0);
    expect(ids(game.state.players.p1.trash)).toEqual(["fist"]);
  });

  it("shrinks the attacker's side off a Life card", () => {
    const game = defending("op13-020-trigger")
      .withLife("p1", [instance("life-fist", "OP13-020")])
      .withBoard("p2", [character("rayleigh", "ST32-004", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game, "rayleigh");

    expect(currentPower(game.state, "p2", "rayleigh")).toBe(0);
  });
});

describe("PRB02-001 Koby", () => {
  covers("PRB02-001", "[Opponent's Turn]");

  it("defends at 6000 behind the {Navy} Leader, and at 5000 on its own turn", () => {
    const theirs = defending("prb02-001-theirs")
      .withBoard("p1", [character("koby", "PRB02-001", { playedTurn: 1 })])
      .build();
    expect(currentPower(theirs.state, "p1", "koby")).toBe(6000);

    const ours = table("prb02-001-ours")
      .withBoard("p1", [character("koby", "PRB02-001", { playedTurn: 1 })])
      .build();
    expect(currentPower(ours.state, "p1", "koby")).toBe(5000);
  });

  it("stays at 5000 on the opponent's turn behind a Leader with no {Navy} type", () => {
    const game = defending("prb02-001-other")
      .withLeader("p1", OTHER_LEADER)
      .withBoard("p1", [character("koby", "PRB02-001", { playedTurn: 1 })])
      .build();
    expect(currentPower(game.state, "p1", "koby")).toBe(5000);
  });
});
