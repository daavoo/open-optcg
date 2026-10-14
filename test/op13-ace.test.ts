import { describe, expect, it } from "vitest";
import {
  battleAttackPower,
  currentPower,
  type GameState,
} from "@one-piece-sim/engine-core";
import { loadDeck, requireSupportedDeck } from "@one-piece-sim/decks";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The (Red/Blue) Portgas.D.Ace feature deck, played through its own list.
 *
 * Most of the fifty already had a test behind another Leader -- Garp, Yamato,
 * the two Newgates and Marco came in with the OP16 Ace and Nami decks. What
 * this file adds is the clauses no shipped deck had driven, and the lines
 * Bandai's write-up builds the deck around, each behind OP13-002: a DON!! on
 * the Leader turning damage and a lost 6000 body into cards, Marco's [On K.O.]
 * stacking on the Leader's draw, and OP13-057 opening the last attack.
 */
const DECK = "(Red/Blue) Portgas.D.Ace - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

/**
 * `count` Life cards for `player`. `bareTable()` empties the deck, so a Life
 * count has nothing to deal from; these are named cards instead, none of them
 * printing a [Trigger].
 */
const life = (player: "p1" | "p2", count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`${player}-life-${index + 1}`, "OP13-043"),
  );

/** Five cards to draw from, since `bareTable()` leaves the deck empty. */
const library = () =>
  Array.from({ length: 5 }, (_, index) =>
    instance(`draw-${index + 1}`, "OP13-043"),
  );

/** The opponent's turn, with Ace at its printed 3 Life. */
const defending = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p2" })
    .bareTable()
    .withLeader("p1", "OP13-002")
    .withLife("p1", life("p1", 3))
    .withDeckTop("p1", library());

/** Ace's own turn. */
const attacking = (seed: string, lifeCount = 3) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP13-002")
    .withLife("p1", life("p1", lifeCount))
    .withDeckTop("p1", library());

type Game = ReturnType<ReturnType<typeof defending>["build"]>;

const offered = (game: Game, optionId: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "resolve-effect" &&
        (action as { optionId?: string }).optionId === optionId,
    );

/** Answer every pending effect with its first offer. */
function settle(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard > 20) throw new Error("pending effect never settled");
    guard += 1;
    game.play({ type: "resolve-effect" });
  }
}

/**
 * Decline every remaining step of the current battle: the Leader's debuff,
 * the Block and Counter steps, and any [Trigger] on the Life card it takes.
 */
function closeBattle(game: Game): void {
  let guard = 0;
  while (game.state.activeAttack || game.state.pendingEffect) {
    if (guard > 20) throw new Error("battle never closed");
    guard += 1;
    if (offered(game, "skip")) {
      game.play({ type: "resolve-effect", optionId: "skip" });
    } else if (game.state.pendingEffect) {
      game.play({ type: "resolve-effect" });
    } else if (game.summaries().includes("Add Life card to hand")) {
      game.play({ summary: "Add Life card to hand" });
    } else {
      game.play({ type: "pass" });
    }
  }
}

const attack = (game: Game, attacker: string, target = "p1-leader") =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

const handIds = (state: GameState, playerId: "p1" | "p2") =>
  state.players[playerId].hand.map((card) => card.instanceId);

describe("the OP-13 (Red/Blue) Portgas.D.Ace deck list", () => {
  it("loads Bandai's 50-card feature deck behind the OP13-002 Leader", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP13-002");
    expect(loadDeck(DECK)).toHaveLength(50);
  });
});

describe("OP13-002 Portgas.D.Ace: trash a card to weaken the attacker", () => {
  covers("OP13-002", "[On Your Opponent's Attack]");

  it("takes 2000 off the attacker for the battle, and only the battle", () => {
    const game = defending("op13-002-debuff")
      .withHand("p1", [instance("pitch", "OP13-014")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .build();

    attack(game, "attacker");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch" });

    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "pitch",
    ]);
    // 6000 into the 6000 Leader would connect; 4000 does not.
    expect(battleAttackPower(game.state)).toBe(4000);

    closeBattle(game);
    expect(game.state.players.p1.life).toHaveLength(3);
    // "During this battle": the Character is back at its printed power for
    // whatever the rest of the turn brings.
    expect(currentPower(game.state, "p2", "attacker")).toBe(6000);
  });

  it("is spent once a turn", () => {
    const game = defending("op13-002-once")
      .withHand("p1", [
        instance("pitch-1", "OP13-014"),
        instance("pitch-2", "OP13-014"),
      ])
      .withBoard("p2", [
        character("first", "ST32-002"),
        character("second", "ST32-002"),
      ])
      .build();

    attack(game, "first");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch-1" });
    closeBattle(game);

    attack(game, "second");
    // Nothing to answer the second attack with: the clause is spent.
    expect(offered(game, "apply")).toBe(false);
    expect(handIds(game.state, "p1")).toContain("pitch-2");
  });

  it("lets the defender keep the card", () => {
    const game = defending("op13-002-decline")
      .withHand("p1", [instance("pitch", "OP13-014")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .build();

    attack(game, "attacker");
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(handIds(game.state, "p1")).toContain("pitch");
    expect(battleAttackPower(game.state)).toBe(6000);
  });

  it("is not offered with an empty hand to pay from", () => {
    const game = defending("op13-002-empty-hand")
      .withHand("p1", [])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .build();

    attack(game, "attacker");

    expect(game.state.pendingEffect).toBeNull();
    expect(offered(game, "apply")).toBe(false);
  });
});

describe("OP13-002 Portgas.D.Ace: [DON!! x1] draws on damage and on a lost 6000 body", () => {
  covers("PRB02-008", "[Blocker]", "[On K.O.]");

  it("draws a card for the damage it takes with a DON!! given to it", () => {
    const game = defending("op13-002-damage")
      .withHand("p1", [])
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p2", [character("attacker", "ST32-002")])
      .build();

    attack(game, "attacker");
    closeBattle(game);

    // One Life card to hand, and the Leader's draw on top of it.
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(handIds(game.state, "p1").sort()).toEqual(["draw-1", "p1-life-1"]);
  });

  it("draws nothing for the damage without a DON!! on the Leader", () => {
    const game = defending("op13-002-no-don")
      .withHand("p1", [])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .build();

    attack(game, "attacker");
    closeBattle(game);

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(handIds(game.state, "p1")).toEqual(["p1-life-1"]);
  });

  it("draws three when Marco blocks and is K.O.'d: his two, and the Leader's one", () => {
    const game = defending("op13-002-marco")
      .withHand("p1", [])
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p1", [character("marco", "PRB02-008")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .build();

    attack(game, "attacker");
    game.play({ type: "block", blockerInstanceId: "marco" });
    closeBattle(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.life).toHaveLength(3);
    expect(game.state.players.p1.hand).toHaveLength(3);
  });

  it("does not draw for a K.O.'d Character under 6000 base power", () => {
    const game = defending("op13-002-small-ko")
      .withHand("p1", [])
      .withGivenDon("p1", "p1-leader", 1)
      // OP13-043 Otama: a body below the Leader's 6000 floor.
      .withBoard("p1", [character("otama", "OP13-043", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .build();

    attack(game, "attacker", "otama");
    closeBattle(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("draws once a turn, however many times the trigger comes", () => {
    const game = defending("op13-002-once-draw")
      .withHand("p1", [])
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p2", [
        character("first", "ST32-002"),
        character("second", "ST32-002"),
      ])
      .build();

    attack(game, "first");
    closeBattle(game);
    attack(game, "second");
    closeBattle(game);

    // Two Life cards to hand, one draw.
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(3);
  });
});

describe("OP13-014 Portgas.D.Rouge", () => {
  covers("OP13-014", "[Trigger]");

  it("gives the Ace Leader +3000 off a Life card", () => {
    const game = defending("op13-014-trigger")
      .withHand("p1", [])
      .withLife("p1", [instance("rouge", "OP13-014"), ...life("p1", 2)])
      .withBoard("p2", [
        character("first", "ST32-002"),
        character("second", "ST32-002"),
      ])
      .build();

    attack(game, "first");
    game.play({ type: "pass" });
    game.play({ type: "pass" });
    game.play({ summary: "Activate Trigger" });
    settle(game);
    closeBattle(game);

    // The top Life card was Rouge, and its [Trigger] reached the Leader for
    // the rest of the turn -- so the second 6000 attacker no longer connects.
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(9000);
    attack(game, "second");
    closeBattle(game);
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("OP13-043 Otama", () => {
  covers("OP13-043", "[On Play]");

  it("draws two and trashes one at 3 Life", () => {
    const game = attacking("op13-043-draw", 3)
      .withHand("p1", [instance("otama", "OP13-043")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-043" });
    settle(game);

    // Otama left the hand, two came in, one of them went to the trash.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.trash).toHaveLength(1);
  });

  it("does nothing at 4 Life", () => {
    const game = attacking("op13-043-four-life", 4)
      .withHand("p1", [instance("otama", "OP13-043")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-043" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });
});

describe("OP13-046 Vista", () => {
  covers("OP13-046", "[Double Attack]");

  it("takes two Life cards with one attack", () => {
    const game = attacking("op13-046-double")
      .withBoard("p1", [character("vista", "OP13-046")])
      .withLife("p2", life("p2", 3))
      .build();

    attack(game, "vista", "p2-leader");
    closeBattle(game);

    expect(game.state.players.p2.life).toHaveLength(1);
  });
});

describe("OP13-057 If I Bowed Down to Power, What's the Point in Living?", () => {
  covers("OP13-057", "[Main]", "[Counter]");

  it("[Main] at 1 Life: the Leader's attack cannot be blocked", () => {
    const game = attacking("op13-057-main", 1)
      .withHand("p1", [instance("bowed", "OP13-057")])
      .withBoard("p2", [character("blocker", "PRB02-008")])
      .build();

    game.play({ summary: "Activate If I Bowed Down" });
    settle(game);
    // The printed cost: one DON!! rested on top of the Event's own one.
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    attack(game, "p1-leader", "p2-leader");

    expect(
      game.legalActions("p2").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("[Main] is not offered above 1 Life, where it would do nothing", () => {
    const game = attacking("op13-057-main-two-life", 2)
      .withHand("p1", [instance("bowed", "OP13-057")])
      .build();

    expect(game.summaries().some((summary) => summary.includes("Bowed"))).toBe(
      false,
    );
  });

  it("[Counter] gives the Leader +3000 for the battle", () => {
    const game = defending("op13-057-counter")
      .withHand("p1", [instance("bowed", "OP13-057")])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withGivenDon("p2", "attacker", 2)
      .build();

    attack(game, "attacker");
    game.play({ type: "resolve-effect", optionId: "skip" });
    game.play({ type: "pass" });
    game.play({ summary: "Activate If I Bowed Down" });
    closeBattle(game);

    // 8000 into 6000 + 3000: no damage.
    expect(game.state.players.p1.life).toHaveLength(3);
  });
});

describe("PRB02-002 Trafalgar Law", () => {
  covers("PRB02-002", "static");

  it("takes −2000 instead of leaving the field to the opponent's bounce", () => {
    const game = defending("prb02-002-replace")
      .withBoard("p1", [character("law", "PRB02-002")])
      // OP09-058 returns a cost-6-or-less Character to its owner's hand.
      .withHand("p2", [instance("bounce", "OP09-058")])
      .build();

    game.play({ summary: "Activate Special Muggy Ball" });
    game.play({ type: "resolve-effect", optionId: "law" });
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    const replacement = game
      .legalActions("p1")
      .find(
        (action) =>
          action.type === "resolve-effect" &&
          (action as { optionId?: string }).optionId?.startsWith("replace:"),
      );
    expect(replacement).toBeDefined();
    game.submit(replacement!);
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "law",
    ]);
    expect(currentPower(game.state, "p1", "law")).toBe(5000);
  });
});
