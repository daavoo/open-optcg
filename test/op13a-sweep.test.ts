import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP-13's Red, Green and Blue commons and uncommons that no other file drove:
 * one `describe` per card, one case per printed clause. Run
 * `pnpm card:text <card>` for the wording each case checks against.
 */

const DECKS = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
] as const;

/** p1's main phase on an empty table with all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2's main phase, for the clauses p1 answers on the opponent's turn. */
const defending = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

type Game = ReturnType<ReturnType<typeof table>["build"]>;

function effectOptions(state: GameState): string[] {
  const actor = state.pendingEffect?.playerId ?? state.activePlayer;
  return getLegalActions(state, actor)
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

/** Plays out whatever is left of the current battle with no answers. */
function finishBattle(game: Game): void {
  let guard = 0;
  while (game.state.activeAttack || game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("battle never settled");
    if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    else game.pass();
  }
}

/** p2 attacks `target` with `attacker` and p1 answers nothing. */
function attackUnanswered(game: Game, attacker: string, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
  while (!game.state.pendingEffect && game.state.activeAttack) game.pass();
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const canPlay = (game: Game, cardNumber: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "play-card" &&
        game.state.players[game.state.activePlayer].hand.find(
          (card) => card.instanceId === action.cardInstanceId,
        )?.cardNumber === cardNumber,
    );

const canAttackWith = (game: Game, attacker: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === attacker,
    );

const canActivate = (game: Game, name: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" && action.summary.includes(name),
    );

describe("OP13-009 Curly.Dadan", () => {
  covers("OP13-009", "static");

  it("has [Double Attack] beside another {Mountain Bandits} Character, and takes 2 Life", () => {
    const game = table("op13-009")
      .withBoard("p1", [
        character("dadan", "OP13-009"),
        character("higuma", "OP13-013"), // {Mountain Bandits}
      ])
      .withLife("p2", [
        instance("life-1", "ST32-005"),
        instance("life-2", "ST32-005"),
        instance("life-3", "ST32-005"),
      ])
      .build();

    expect(hasKeyword(game.state, "p1", "dadan", "Double Attack")).toBe(true);
    // Four DON!! take the 2000 body past the 5000 Leader.
    for (let given = 0; given < 4; given++) {
      game.play({ type: "attach-don", targetInstanceId: "dadan" });
    }
    game.play({
      type: "attack",
      attackerInstanceId: "dadan",
      targetInstanceId: "p2-leader",
    });
    finishBattle(game);
    expect(game.state.players.p2.life).toHaveLength(1);
  });

  it("does not count itself, nor a Character of another type", () => {
    const alone = table("op13-009-alone")
      .withBoard("p1", [
        character("dadan", "OP13-009"),
        character("hack", "OP05-012"),
      ])
      .build();
    expect(hasKeyword(alone.state, "p1", "dadan", "Double Attack")).toBe(false);

    // Two copies switch each other on: "other than this card" is the instance.
    const pair = table("op13-009-pair")
      .withBoard("p1", [
        character("dadan-1", "OP13-009"),
        character("dadan-2", "OP13-009"),
      ])
      .build();
    expect(hasKeyword(pair.state, "p1", "dadan-1", "Double Attack")).toBe(true);
    expect(hasKeyword(pair.state, "p1", "dadan-2", "Double Attack")).toBe(true);
  });
});

describe("OP13-013 Higuma", () => {
  covers("OP13-013", "[On Play]");

  it("K.O.s an opponent's Character at 0 power, and nothing above it", () => {
    const game = table("op13-013")
      .withHand("p1", [instance("higuma", "OP13-013")])
      .withBoard("p2", [
        character("makino", "OP13-015"), // 0 power
        character("hack", "OP05-012"), // 5000
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-013" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "makino"]);
    game.play({ type: "resolve-effect", optionId: "makino" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["hack"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["makino"]);
  });
});

describe("OP13-015 Makino", () => {
  covers("OP13-015", "[Activate: Main]");

  it("rests herself to give a [Monkey.D.Luffy] card +2000 for the turn", () => {
    const game = table("op13-015")
      .withLeader("p1", "OP12-020") // Roronoa Zoro
      .withBoard("p1", [
        character("makino", "OP13-015"),
        character("luffy", "P-022"), // Monkey.D.Luffy, 6000
        character("hack", "OP05-012"),
      ])
      .build();

    expect(canActivate(game, "Makino")).toBe(true);
    game.play({ type: "activate-main", summary: "Makino" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "luffy"]);
    game.play({ type: "resolve-effect", optionId: "luffy" });
    resolveAll(game);

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "luffy")).toBe(8_000);
    // Rested, so it cannot pay a second time.
    expect(canActivate(game, "Makino")).toBe(false);

    game.pass();
    expect(currentPower(game.state, "p1", "luffy")).toBe(6_000);
  });

  it("reaches a [Monkey.D.Luffy] Leader", () => {
    const game = table("op13-015-leader")
      .withBoard("p1", [character("makino", "OP13-015")])
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({ type: "activate-main", summary: "Makino" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "p1-leader"]);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    resolveAll(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 2_000);
  });
});

describe("OP13-022 Windmill Village", () => {
  covers("OP13-022", "[Activate: Main]");

  it("rests itself to give a 2000-base-power Character +1000 for the turn", () => {
    const game = table("op13-022")
      .withStage("p1", instance("village", "OP13-022"))
      .withBoard("p1", [
        character("dadan", "OP13-009"), // 2000 base
        character("higuma", "OP13-013"), // 3000 base
      ])
      .build();

    game.play({ type: "activate-main", summary: "Windmill Village" });
    expect(effectOptions(game.state).sort()).toEqual(["dadan", "done"]);
    game.play({ type: "resolve-effect", optionId: "dadan" });
    resolveAll(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "dadan")).toBe(3_000);
    game.pass();
    expect(currentPower(game.state, "p1", "dadan")).toBe(2_000);
  });

  it("reads base power: a buffed 2000 body still qualifies", () => {
    const game = table("op13-022-base")
      .withStage("p1", instance("village", "OP13-022"))
      .withBoard("p1", [character("dadan", "OP13-009")])
      .build();

    // A given DON!! lifts current power, not base power.
    game.play({ type: "attach-don", targetInstanceId: "dadan" });
    expect(currentPower(game.state, "p1", "dadan")).toBe(3_000);
    game.play({ type: "activate-main", summary: "Windmill Village" });
    expect(effectOptions(game.state)).toContain("dadan");
  });
});

describe("OP13-023 Uta", () => {
  covers("OP13-023", "[On Play]");

  it("sets 2 DON!! active, then bars base-cost-5-or-more Characters for the turn", () => {
    const game = table("op13-023")
      .withHand("p1", [
        instance("uta", "OP13-023"),
        instance("koby", "OP13-025"), // cost 5
        instance("brook", "OP13-034"), // cost 3
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-023" });
    resolveAll(game);

    // Four paid, two of them back.
    expect(game.state.players.p1.activeDon).toHaveLength(8);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(canPlay(game, "OP13-025")).toBe(false);
    expect(canPlay(game, "OP13-034")).toBe(true);
  });

  covers("OP13-023", "[On K.O.]");

  it("plays a cost-5-or-less Character from hand rested when K.O.'d", () => {
    const game = defending("op13-023-ko")
      .withBoard("p1", [character("uta", "OP13-023", { rested: true })])
      .withHand("p1", [
        instance("koby", "OP13-025"), // cost 5
        instance("robin", "OP13-032"), // cost 7
      ])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attackUnanswered(game, "attacker", "uta");
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    expect(effectOptions(game.state).sort()).toEqual(["done", "koby"]);
    game.play({ type: "resolve-effect", optionId: "koby" });
    finishBattle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["koby"]);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(ids(game.state.players.p1.hand)).toEqual(["robin"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["uta"]);
  });
});

/** A [Blocker] check: p1's `cardNumber` takes over a declared attack. */
function blocks(cardNumber: string): void {
  const game = defending(`${cardNumber}-blocker`)
    .withBoard("p1", [character("blocker", cardNumber)])
    .withBoard("p2", [character("attacker", "OP11-003")])
    .build();

  expect(hasKeyword(game.state, "p1", "blocker", "Blocker")).toBe(true);
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  game.play({ type: "block", blockerInstanceId: "blocker" });

  expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
  expect(game.state.players.p1.board[0]?.rested).toBe(true);
}

describe("OP13-025 Koby", () => {
  covers("OP13-025", "[Blocker]");

  it("blocks a declared attack", () => {
    blocks("OP13-025");
  });

  covers("OP13-025", "[On Play]");

  const playKoby = (seed: string, leader: string) => {
    const game = table(seed)
      .withLeader("p1", leader)
      .withHand("p1", [instance("koby", "OP13-025")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP13-025" });
    resolveAll(game);
    return game;
  };

  it("sets 1 DON!! active behind a {FILM} Leader", () => {
    const game = playKoby("op13-025-film", "ST11-001"); // Uta, {FILM}, Special
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  it("sets 1 DON!! active behind a <Strike> Leader", () => {
    const game = playKoby("op13-025-strike", "OP06-022"); // Yamato, Strike
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  it("sets nothing behind a Leader with neither", () => {
    const game = playKoby("op13-025-neither", "OP11-041"); // Nami, Special
    expect(game.state.players.p1.restedDon).toHaveLength(5);
  });
});

describe("OP13-026 Sunny-Kun", () => {
  covers("OP13-026", "[Activate: Main]");

  it("rests a DON!! for +2000 that lasts through the opponent's next turn, once per turn", () => {
    const game = table("op13-026")
      .withBoard("p1", [character("sunny", "OP13-026")])
      .withDeckTop("p1", [instance("p1-draw", "OP05-012")])
      .withDeckTop("p2", [instance("p2-draw", "ST32-005")])
      .build();

    expect(canActivate(game, "Sunny-Kun")).toBe(true);
    game.play({ type: "activate-main", summary: "Sunny-Kun" });
    resolveAll(game);

    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(currentPower(game.state, "p1", "sunny")).toBe(4_000);
    expect(canActivate(game, "Sunny-Kun")).toBe(false);

    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    expect(currentPower(game.state, "p1", "sunny")).toBe(4_000);
    game.pass();
    expect(game.state.activePlayer).toBe("p1");
    expect(currentPower(game.state, "p1", "sunny")).toBe(2_000);
  });
});

describe("OP13-030 Tony Tony.Chopper", () => {
  covers("OP13-030", "[On Play]");

  it("sets 2 DON!! active", () => {
    const game = table("op13-030")
      .withHand("p1", [instance("chopper", "OP13-030")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-030" });
    resolveAll(game);
    // Five paid, two of them back.
    expect(game.state.players.p1.restedDon).toHaveLength(3);
    expect(game.state.players.p1.activeDon).toHaveLength(7);
  });
});

describe("OP13-032 Nico Robin", () => {
  covers("OP13-032", "[On Play]");

  it("stops a cost-8-or-less Character resting through the opponent's next turn", () => {
    const game = table("op13-032")
      .withHand("p1", [instance("robin", "OP13-032")])
      .withBoard("p2", [
        character("shiki", "OP12-005"), // cost 8
        character("luffy", "P-041"), // cost 10
      ])
      .withDeckTop("p1", [instance("p1-draw", "OP05-012")])
      .withDeckTop("p2", [
        instance("p2-draw-1", "ST32-005"),
        instance("p2-draw-2", "ST32-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-032" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "shiki"]);
    game.play({ type: "resolve-effect", optionId: "shiki" });
    resolveAll(game);

    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    // Attacking rests the attacker, so the locked body cannot.
    expect(canAttackWith(game, "shiki")).toBe(false);
    expect(canAttackWith(game, "luffy")).toBe(true);

    game.pass();
    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    expect(canAttackWith(game, "shiki")).toBe(true);
  });
});

describe("OP13-033 Franky", () => {
  covers("OP13-033", "[On K.O.]");

  it("rests up to 2 of the opponent's cards, the Leader among them, when K.O.'d", () => {
    const game = defending("op13-033")
      .withBoard("p1", [character("franky", "OP13-033", { rested: true })])
      .withBoard("p2", [
        character("attacker", "OP11-003"),
        character("hack", "OP05-012"),
      ])
      .build();

    attackUnanswered(game, "attacker", "franky");
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    const options = effectOptions(game.state);
    expect(options).toContain("p2-leader");
    expect(options).toContain("hack");
    // The attacker is already rested.
    expect(options).not.toContain("attacker");
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    finishBattle(game);

    expect(game.state.players.p2.leaderRested).toBe(true);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "hack")
        ?.rested,
    ).toBe(true);
    expect(canAttackWith(game, "p2-leader")).toBe(false);
    expect(canAttackWith(game, "hack")).toBe(false);
  });
});

describe("OP13-034 Brook", () => {
  covers("OP13-034", "[On Play]");

  const playBrook = (seed: string, leader: string) => {
    const game = table(seed)
      .withLeader("p1", leader)
      .withHand("p1", [instance("brook", "OP13-034")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP13-034" });
    resolveAll(game);
    return game;
  };

  it("sets 1 DON!! active behind a {Straw Hat Crew} Leader", () => {
    expect(
      playBrook("op13-034-shc", "OP11-041").state.players.p1.restedDon,
    ).toHaveLength(2);
  });

  it("sets 1 DON!! active behind a {FILM} Leader", () => {
    expect(
      playBrook("op13-034-film", "ST11-001").state.players.p1.restedDon,
    ).toHaveLength(2);
  });

  it("sets nothing behind a Leader with neither type", () => {
    // Yamato is <Strike>, which Koby's gate takes and Brook's does not.
    expect(
      playBrook("op13-034-neither", "OP06-022").state.players.p1.restedDon,
    ).toHaveLength(3);
  });
});

describe("OP13-038 Gum-Gum Elephant Gun", () => {
  covers("OP13-038", "[Main]");

  it("rests a cost-5-or-less Character and sets 2 DON!! active at the end of the turn", () => {
    const game = table("op13-038-main")
      .withHand("p1", [instance("gun", "OP13-038")])
      .withBoard("p2", [
        character("hack", "OP05-012"), // cost 3
        character("shiki", "OP12-005"), // cost 8
      ])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", summary: "Gum-Gum Elephant Gun" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "hack"]);
    game.play({ type: "resolve-effect", optionId: "hack" });
    resolveAll(game);

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
    expect(game.state.players.p2.board[1]?.rested).toBeFalsy();
    // Nothing back yet: 4 already rested plus the 2 paid.
    expect(game.state.players.p1.restedDon).toHaveLength(6);
    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  covers("OP13-038", "[Trigger]");

  it("rests a cost-5-or-less Character off a Life Trigger", () => {
    const game = defending("op13-038-trigger")
      .withLife("p1", [instance("gun", "OP13-038")])
      .withBoard("p2", [
        character("attacker", "OP11-003"),
        character("hack", "OP05-012"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase !== "trigger" && game.state.activeAttack)
      game.pass();
    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "hack"]);
    game.play({ type: "resolve-effect", optionId: "hack" });
    finishBattle(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "hack")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP13-041 Izo", () => {
  covers("OP13-041", "[On Play]");

  it("draws 2 cards", () => {
    const game = table("op13-041")
      .withHand("p1", [instance("izo", "OP13-041")])
      .withDeckTop("p1", [
        instance("draw-1", "OP05-012"),
        instance("draw-2", "OP05-035"),
        instance("left", "OP05-083"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-041" });
    resolveAll(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["draw-1", "draw-2"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["left"]);
  });
});

describe("OP13-044 Curiel", () => {
  covers("OP13-044", "[When Attacking]");

  it("gives a rested DON!! to a Character whose type includes Whitebeard Pirates", () => {
    const game = table("op13-044-attack")
      .withLeader("p1", "OP12-020") // not Whitebeard Pirates
      .withDon("p1", { rested: 2 })
      .withBoard("p1", [
        character("curiel", "OP13-044"),
        character("doma", "EB01-005"), // {Whitebeard Pirates Allies}
        character("hack", "OP05-012"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "curiel",
      targetInstanceId: "p2-leader",
    });
    const options = effectOptions(game.state);
    expect(options).toContain("doma");
    expect(options).toContain("curiel");
    expect(options).not.toContain("hack");
    expect(options).not.toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "doma" });
    resolveAll(game);

    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(currentPower(game.state, "p1", "doma")).toBe(4_000);
  });

  it("reaches a Whitebeard Pirates Leader", () => {
    const game = table("op13-044-leader")
      .withLeader("p1", "OP08-002") // Marco
      .withDon("p1", { rested: 1 })
      .withBoard("p1", [character("curiel", "OP13-044")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "curiel",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game.state)).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    resolveAll(game);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  covers("OP13-044", "[On K.O.]");

  it("draws 1 when K.O.'d", () => {
    const game = defending("op13-044-ko")
      .withBoard("p1", [character("curiel", "OP13-044", { rested: true })])
      .withDeckTop("p1", [instance("drawn", "OP05-012")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attackUnanswered(game, "attacker", "curiel");
    finishBattle(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["curiel"]);
  });
});

describe("OP13-045 Haruta", () => {
  covers("OP13-045", "[When Attacking]");

  const swing = (seed: string, handSize: number) => {
    const game = table(seed)
      .withBoard("p1", [character("haruta", "OP13-045")])
      .withHand(
        "p1",
        Array.from({ length: handSize }, (_, index) =>
          instance(`card-${index}`, "OP05-012"),
        ),
      )
      .withDeckTop("p1", [instance("drawn", "OP05-035")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "haruta",
      targetInstanceId: "p2-leader",
    });
    resolveAll(game);
    return game;
  };

  it("draws 1 with 4 cards in hand", () => {
    const game = swing("op13-045-four", 4);
    expect(game.state.players.p1.hand).toHaveLength(5);
    expect(ids(game.state.players.p1.hand)).toContain("drawn");
  });

  it("draws nothing with 5 cards in hand", () => {
    const game = swing("op13-045-five", 5);
    expect(game.state.players.p1.hand).toHaveLength(5);
    expect(ids(game.state.players.p1.deck)).toContain("drawn");
  });
});

describe("OP13-047 Fossa", () => {
  covers("OP13-047", "static");

  /** p2 about to K.O. a 4000-or-less Character of p1's with OP16-006. */
  const opponentRemoval = (seed: string, target: string) => {
    const game = defending(seed)
      .withBoard("p1", [
        character("fossa", "OP13-047"),
        character("haruta", "OP13-045"), // {Whitebeard Pirates}
        character("doma", "EB01-005"), // {Whitebeard Pirates Allies}
        character("sterry", "OP05-083"), // neither
      ])
      .withHand("p2", [instance("shanks", "OP16-006")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: target });
    return game;
  };

  const trashFossa = (game: Game) =>
    game
      .legalActions()
      .find((action) => action.summary.includes("Trash Fossa"));

  it("trashes himself instead of a Whitebeard Pirates Character the opponent's effect would K.O.", () => {
    const game = opponentRemoval("op13-047-save", "haruta");
    const trade = trashFossa(game);
    expect(trade, "Fossa's replacement should be offered").toBeDefined();
    game.submit(trade!);
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual([
      "haruta",
      "doma",
      "sterry",
    ]);
    expect(ids(game.state.players.p1.trash)).toEqual(["fossa"]);
  });

  it("covers a type that only includes the words", () => {
    expect(
      trashFossa(opponentRemoval("op13-047-allies", "doma")),
    ).toBeDefined();
  });

  it("can be declined, and the K.O. goes through", () => {
    const game = opponentRemoval("op13-047-decline", "haruta");
    const decline = game
      .legalActions()
      .find(
        (action) =>
          action.type === "resolve-effect" &&
          !action.summary.includes("Trash Fossa"),
      );
    game.submit(decline!);
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual([
      "fossa",
      "doma",
      "sterry",
    ]);
    expect(ids(game.state.players.p1.trash)).toEqual(["haruta"]);
  });

  it("does not cover a Character without the type", () => {
    const offType = opponentRemoval("op13-047-offtype", "sterry");
    expect(trashFossa(offType)).toBeUndefined();
    resolveAll(offType);
    expect(ids(offType.state.players.p1.trash)).toEqual(["sterry"]);
  });

  it("covers himself: trashed instead of K.O.'d (Bandai's OP13-047#1)", () => {
    const self = opponentRemoval("op13-047-self", "fossa");
    expect(trashFossa(self)).toBeDefined();
  });

  it("does not answer a K.O. in battle", () => {
    const game = defending("op13-047-battle")
      .withBoard("p1", [
        character("fossa", "OP13-047"),
        character("haruta", "OP13-045", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "haruta",
    });
    let guard = 0;
    while (game.state.activeAttack || game.state.pendingEffect) {
      if (guard++ > 40) throw new Error("battle never settled");
      expect(trashFossa(game)).toBeUndefined();
      if (game.state.phase === "block") game.pass();
      else if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      else game.pass();
    }
    expect(ids(game.state.players.p1.trash)).toEqual(["haruta"]);
  });
});

describe("OP13-050 Boa Sandersonia", () => {
  covers("OP13-050", "[On Play]");

  it("plays a cost-3-or-less [Boa Hancock] from hand behind a [Boa Hancock] Leader", () => {
    const game = table("op13-050")
      .withLeader("p1", "OP07-038") // Boa Hancock
      .withHand("p1", [
        instance("sandersonia", "OP13-050"),
        instance("hancock-3", "OP13-051"), // cost 3
        instance("hancock-6", "OP07-051"), // cost 6
        instance("hack", "OP05-012"), // cost 3, another name
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-050" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "hancock-3"]);
    game.play({ type: "resolve-effect", optionId: "hancock-3" });
    resolveAll(game);

    expect(ids(game.state.players.p1.board).slice(0, 2)).toEqual([
      "sandersonia",
      "hancock-3",
    ]);
    // A free play: only Sandersonia's own 2 was paid.
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("plays nothing behind another Leader", () => {
    const game = table("op13-050-leader")
      .withHand("p1", [
        instance("sandersonia", "OP13-050"),
        instance("hancock-3", "OP13-051"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-050" });
    expect(effectOptions(game.state)).not.toContain("hancock-3");
    resolveAll(game);
    expect(ids(game.state.players.p1.board)).toEqual(["sandersonia"]);
  });
});
