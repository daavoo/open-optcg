import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP-12 cards that were registered with no test declaring them: one
 * `describe` per card, one case per printed clause. Run
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
  return getLegalActions(state, state.activePlayer)
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

/** Passes every window until the battle is over, taking default effect choices. */
function finishBattle(game: Game): void {
  let guard = 0;
  while (game.state.activeAttack || game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("battle never settled");
    if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    else game.pass();
  }
}

function attack(game: Game, attacker: string, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

/** The cards whose `[Activate: Main]` is on offer right now. */
const activations = (game: Game): string[] =>
  game
    .legalActions()
    .flatMap((action) =>
      action.type === "activate-main" && action.sourceCardNumber
        ? [action.sourceCardNumber]
        : [],
    );

const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

describe("OP12-021 Ipponmatsu", () => {
  covers("OP12-021", "static", "[Blocker]");

  /**
   * p2's OP12-024 Gyukimaru swings with three given DON!!, so its
   * [When Attacking] rests one of p1's Characters of base cost 6 or less.
   */
  const gyukimaruSwing = (
    seed: string,
    leader: string,
    restedDon: number,
  ): Game =>
    defending(seed)
      .withLeader("p1", leader)
      .withDon("p1", { rested: restedDon })
      .withBoard("p1", [
        character("ipponmatsu", "OP12-021"),
        character("brook", "ST31-003"),
      ])
      .withBoard("p2", [character("gyukimaru", "OP12-024")])
      .withGivenDon("p2", "gyukimaru", 3)
      .build();

  it("cannot be rested by the opponent's effect behind a <Slash> Leader with 6 rested DON!!", () => {
    const game = gyukimaruSwing("op12-021-immune", "OP12-020", 6);
    attack(game, "gyukimaru", "p1-leader");

    expect(game.state.pendingEffect?.playerId).toBe("p2");
    expect(effectOptions(game.state).sort()).toEqual(["brook", "done"]);
    game.play({ type: "resolve-effect", optionId: "brook" });
    expect(boardCard(game, "p1", "ipponmatsu")?.rested).toBe(false);
    expect(boardCard(game, "p1", "brook")?.rested).toBe(true);
  });

  it("can be rested with only 5 rested DON!!, or behind a Leader that is not <Slash>", () => {
    const fiveDon = gyukimaruSwing("op12-021-five-don", "OP12-020", 5);
    attack(fiveDon, "gyukimaru", "p1-leader");
    expect(effectOptions(fiveDon.state)).toContain("ipponmatsu");
    fiveDon.play({ type: "resolve-effect", optionId: "ipponmatsu" });
    expect(boardCard(fiveDon, "p1", "ipponmatsu")?.rested).toBe(true);

    // OP12-040 Kuzan is <Special>.
    const special = gyukimaruSwing("op12-021-special", "OP12-040", 6);
    attack(special, "gyukimaru", "p1-leader");
    expect(effectOptions(special.state)).toContain("ipponmatsu");
  });

  it("is not held by an opponent's multi-rest Event either", () => {
    // OP12-037 Demon Aura Nine Sword Style Asura rests 2 of the opponent's
    // cards through `rest-opponent-cards`, a different path from a selector.
    const game = table("op12-021-asura")
      .withHand("p1", [instance("asura", "OP12-037")])
      .withLeader("p2", "OP12-020")
      .withDon("p2", { rested: 6 })
      .withBoard("p2", [
        character("ipponmatsu", "OP12-021"),
        character("brook", "ST31-003"),
      ])
      .build();
    game.play({ type: "activate-main", summary: "OP12-037" });
    expect(effectOptions(game.state)).not.toContain("ipponmatsu");
    expect(effectOptions(game.state)).toContain("brook");
  });

  it("is not a target for an opponent's imperative On Play rest", () => {
    // OP12-031 Tashigi's [On Play] rest is a `rest-character` pending effect.
    const game = table("op12-021-tashigi")
      .withHand("p1", [instance("tashigi", "OP12-031")])
      .withLeader("p2", "OP12-020")
      .withDon("p2", { rested: 6 })
      .withBoard("p2", [
        character("ipponmatsu", "OP12-021"),
        character("brook", "ST31-003"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP12-031" });
    expect(effectOptions(game.state)).not.toContain("ipponmatsu");
    expect(effectOptions(game.state)).toContain("brook");
  });

  it("blocks a declared attack", () => {
    const game = defending("op12-021-blocker")
      .withBoard("p1", [character("ipponmatsu", "OP12-021")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    expect(hasKeyword(game.state, "p1", "ipponmatsu", "Blocker")).toBe(true);
    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "ipponmatsu" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("ipponmatsu");
  });
});

describe("OP12-022 Inuarashi", () => {
  covers("OP12-022", "[Activate: Main]");

  it("rests itself to keep a rested cost-5-or-less Character down through the next Refresh", () => {
    const game = table("op12-022")
      .withBoard("p1", [character("inuarashi", "OP12-022")])
      .withBoard("p2", [
        character("locked", "OP11-003", { rested: true }), // cost 5
        character("free", "OP05-012", { rested: true }), // cost 3
        character("big", "OP05-065", { rested: true }), // cost 6
      ])
      .withDeckTop("p2", [instance("p2-draw", "ST31-003")])
      .build();

    game.play({ type: "activate-main", summary: "Inuarashi" });
    // The cost-6 body is out of range; both rested 5-or-less bodies are in.
    expect(effectOptions(game.state).sort()).toEqual([
      "done",
      "free",
      "locked",
    ]);
    game.play({ type: "resolve-effect", optionId: "locked" });
    resolveAll(game);
    expect(boardCard(game, "p1", "inuarashi")?.rested).toBe(true);

    game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
    expect(game.state.winner ?? null).toBeNull();
    expect(boardCard(game, "p2", "locked")?.rested).toBe(true);
    expect(boardCard(game, "p2", "free")?.rested).toBe(false);
    expect(boardCard(game, "p2", "big")?.rested).toBe(false);
  });

  it("is not offered once Inuarashi is rested", () => {
    const rested = table("op12-022-rested")
      .withBoard("p1", [character("inuarashi", "OP12-022", { rested: true })])
      .withBoard("p2", [character("locked", "OP11-003", { rested: true })])
      .build();
    expect(activations(rested)).not.toContain("OP12-022");
  });
});

describe("OP12-024 Gyukimaru", () => {
  covers("OP12-024", "static", "[When Attacking]");

  it("cannot be K.O.'d by the opponent's effect while active, and can be once rested", () => {
    const active = defending("op12-024-immune")
      .withBoard("p1", [
        character("gyukimaru", "OP12-024"),
        character("brook", "ST31-003"),
      ])
      .withHand("p2", [instance("gatling", "ST10-016")])
      .build();
    active.play({ type: "activate-main", summary: "Gum-Gum Kong Gatling" });
    active.play({ type: "resolve-effect", optionId: "gyukimaru" });
    resolveAll(active);
    expect(ids(active.state.players.p1.board)).toEqual(["gyukimaru", "brook"]);
    expect(active.state.players.p1.trash).toHaveLength(0);

    const rested = defending("op12-024-rested")
      .withBoard("p1", [character("gyukimaru", "OP12-024", { rested: true })])
      .withHand("p2", [instance("gatling", "ST10-016")])
      .build();
    rested.play({ type: "activate-main", summary: "Gum-Gum Kong Gatling" });
    rested.play({ type: "resolve-effect", optionId: "gyukimaru" });
    resolveAll(rested);
    expect(rested.state.players.p1.board).toHaveLength(0);
    expect(ids(rested.state.players.p1.trash)).toEqual(["gyukimaru"]);
  });

  it("rests a base-cost-6-or-less Character with 3 given DON!! in total", () => {
    const game = table("op12-024-attack")
      .withBoard("p1", [character("gyukimaru", "OP12-024")])
      .withGivenDon("p1", "p1-leader", 2)
      .withGivenDon("p1", "gyukimaru", 1)
      .withBoard("p2", [
        character("six", "OP05-065"), // cost 6
        character("seven", "ST31-004"), // cost 7
      ])
      .build();

    attack(game, "gyukimaru", "p2-leader");
    expect(effectOptions(game.state).sort()).toEqual(["done", "six"]);
    game.play({ type: "resolve-effect", optionId: "six" });
    expect(boardCard(game, "p2", "six")?.rested).toBe(true);
    expect(boardCard(game, "p2", "seven")?.rested).toBe(false);
  });

  it("does nothing with only 2 given DON!!", () => {
    const game = table("op12-024-short")
      .withBoard("p1", [character("gyukimaru", "OP12-024")])
      .withGivenDon("p1", "gyukimaru", 2)
      .withBoard("p2", [character("six", "OP05-065")])
      .build();

    attack(game, "gyukimaru", "p2-leader");
    expect(effectOptions(game.state)).not.toContain("six");
    finishBattle(game);
    expect(boardCard(game, "p2", "six")?.rested).toBe(false);
  });
});

describe("OP12-033 Helmeppo", () => {
  covers("OP12-033", "[Blocker]", "[On Block]");

  it("blocks, then rests a cost-5-or-less Character of the attacker's", () => {
    const game = defending("op12-033")
      .withBoard("p1", [character("helmeppo", "OP12-033")])
      .withBoard("p2", [
        character("attacker", "OP11-003"),
        character("five", "OP11-003"), // cost 5
        character("six", "OP05-065"), // cost 6
      ])
      .build();

    expect(hasKeyword(game.state, "p1", "helmeppo", "Blocker")).toBe(true);
    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "helmeppo" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("helmeppo");
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    // The attacker is already rested, and the cost-6 body is out of range.
    expect(effectOptions(game.state).sort()).toEqual(["done", "five"]);
    game.play({ type: "resolve-effect", optionId: "five" });
    expect(boardCard(game, "p2", "five")?.rested).toBe(true);
    expect(boardCard(game, "p2", "six")?.rested).toBe(false);
  });
});

describe("OP12-038 Two-Sword Style Rashomon", () => {
  covers("OP12-038", "[Main]", "[Counter]");

  it("rests 2 DON!! to K.O. up to 2 rested base-cost-4-or-less Characters", () => {
    const game = table("op12-038-main")
      .withHand("p1", [instance("rashomon", "OP12-038")])
      .withBoard("p2", [
        character("four", "OP12-052", { rested: true }), // cost 4
        character("three", "OP05-012", { rested: true }), // cost 3
        character("five", "OP11-003", { rested: true }), // cost 5
        character("active", "OP05-083"), // cost 2, active
      ])
      .build();

    game.play({ type: "activate-main", summary: "Two-Sword Style Rashomon" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "four", "three"]);
    game.play({ type: "resolve-effect", optionId: "four" });
    game.play({ type: "resolve-effect", optionId: "three" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["five", "active"]);
    expect(ids(game.state.players.p2.trash).sort()).toEqual(["four", "three"]);
    // 1 for the Event and 2 for the clause's own DON!! rest.
    expect(game.state.players.p1.restedDon).toHaveLength(3);
  });

  it("is not offered without the 2 DON!! the clause rests", () => {
    const game = table("op12-038-short")
      .withHand("p1", [instance("rashomon", "OP12-038")])
      .withDon("p1", { rested: 8 })
      .withBoard("p2", [character("four", "OP12-052", { rested: true })])
      .build();
    expect(
      game.legalActions().some((action) => action.type === "activate-main"),
    ).toBe(false);
  });

  it("gives the Leader +3000 for the battle as a Counter", () => {
    const game = defending("op12-038-counter")
      .withHand("p1", [instance("rashomon", "OP12-038")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    game.pass(); // no block
    game.play({ type: "activate-counter-event" });
    resolveAll(game);
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(ids(game.state.players.p1.trash)).toEqual(["rashomon"]);
  });
});

describe("OP12-042 Alvida", () => {
  covers("OP12-042", "static", "[On Play]");

  it("gains +1 cost with 2 Characters of base cost 5 or more", () => {
    const game = table("op12-042-cost")
      .withBoard("p1", [
        character("alvida", "OP12-042"),
        character("five", "OP11-003"),
        character("six", "OP05-065"),
      ])
      .build();
    expect(
      effectiveCost(game.state, "p1", boardCard(game, "p1", "alvida")!),
    ).toBe(5);

    const one = table("op12-042-cost-off")
      .withBoard("p1", [
        character("alvida", "OP12-042"),
        character("five", "OP11-003"),
      ])
      .build();
    expect(
      effectiveCost(one.state, "p1", boardCard(one, "p1", "alvida")!),
    ).toBe(4);
  });

  it("places an opposing base-cost-1-or-less Character at the bottom of its owner's deck", () => {
    const game = table("op12-042-play")
      .withHand("p1", [instance("alvida", "OP12-042")])
      .withBoard("p2", [
        character("one", "OP07-067"), // cost 1
        character("two", "OP05-083"), // cost 2
      ])
      .withDeckTop("p2", [instance("deck-top", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-042" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "one"]);
    game.play({ type: "resolve-effect", optionId: "one" });
    resolveAll(game);

    expect(ids(game.state.players.p2.board)).toEqual(["two"]);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("one");
    expect(game.state.players.p2.trash).toHaveLength(0);
  });
});

describe("OP12-048 Donquixote Rosinante", () => {
  covers("OP12-048", "[Opponent's Turn]");

  it("rests itself and trashes a hand card instead of a blue {Navy} Character leaving the field", () => {
    const game = defending("op12-048")
      .withLeader("p1", "OP05-041") // {Navy}, nothing that reads a trash
      .withBoard("p1", [
        character("rosinante", "OP12-048"),
        character("fullbody", "OP12-052"), // blue {Navy}
      ])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withHand("p2", [instance("gatling", "ST10-016")])
      .build();

    game.play({ type: "activate-main", summary: "Gum-Gum Kong Gatling" });
    game.play({ type: "resolve-effect", optionId: "fullbody" });
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    const replace = effectOptions(game.state).find((option) =>
      option.includes("rosinante"),
    );
    expect(replace).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replace! });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["rosinante", "fullbody"]);
    expect(boardCard(game, "p1", "rosinante")?.rested).toBe(true);
    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
  });

  it("does not answer for a Character that is not blue", () => {
    const game = defending("op12-048-green")
      .withLeader("p1", "OP05-041")
      .withBoard("p1", [
        character("rosinante", "OP12-048"),
        character("tashigi", "OP12-031", { rested: true }), // green {Navy}
      ])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withHand("p2", [instance("gatling", "ST10-016")])
      .build();

    game.play({ type: "activate-main", summary: "Gum-Gum Kong Gatling" });
    game.play({ type: "resolve-effect", optionId: "tashigi" });
    resolveAll(game);
    expect(ids(game.state.players.p1.board)).toEqual(["rosinante"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["tashigi"]);
  });

  it("does not answer on its controller's own turn", () => {
    // The opponent's OP12-104 Sentomaru Trigger K.O.s on p1's turn.
    const game = table("op12-048-own-turn")
      .withLeader("p1", "OP05-041")
      .withBoard("p1", [
        character("rosinante", "OP12-048"),
        character("fullbody", "OP12-052"),
        character("attacker", "OP11-003"),
      ])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withLife("p2", [instance("sentomaru", "OP12-104")])
      .build();

    attack(game, "attacker", "p2-leader");
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "fullbody" });
    expect(
      effectOptions(game.state).some((option) => option.includes("rosinante")),
    ).toBe(false);
    resolveAll(game);
    expect(ids(game.state.players.p1.trash)).toEqual(["fullbody"]);
    expect(boardCard(game, "p1", "rosinante")?.rested).toBe(false);
  });
});

describe("OP12-054 Marshall.D.Teach", () => {
  covers("OP12-054", "[On Play]");

  it("returns a cost-1-or-less Character from either board, never itself", () => {
    const game = table("op12-054")
      .withLeader("p1", "OP06-080") // {The Seven Warlords of the Sea}
      .withHand("p1", [instance("teach", "OP12-054")])
      .withBoard("p1", [character("own-one", "OP07-067")])
      .withBoard("p2", [
        character("their-one", "OP07-067"),
        character("their-two", "OP05-083"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-054" });
    expect(effectOptions(game.state).sort()).toEqual([
      "done",
      "own-one",
      "their-one",
    ]);
    game.play({ type: "resolve-effect", optionId: "their-one" });
    resolveAll(game);
    expect(ids(game.state.players.p2.board)).toEqual(["their-two"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["their-one"]);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("op12-054-off")
      .withHand("p1", [instance("teach", "OP12-054")])
      .withBoard("p2", [character("their-one", "OP07-067")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-054" });
    expect(effectOptions(game.state)).not.toContain("their-one");
    resolveAll(game);
    expect(ids(game.state.players.p2.board)).toEqual(["their-one"]);
  });
});

describe("OP12-069 Crocodile", () => {
  covers("OP12-069", "[On Your Opponent's Attack]");

  it("pays DON!! -1 for +2000 on the attacked card behind a Baroque Works Leader, once per turn", () => {
    const game = defending("op12-069")
      .withLeader("p1", "OP14-079") // {Baroque Works}
      .withBoard("p1", [character("crocodile", "OP12-069")])
      .withBoard("p2", [
        character("attacker", "OP11-003"),
        character("second", "OP11-003"),
      ])
      .build();

    attack(game, "attacker", "p1-leader");
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    const fieldDon = (): number =>
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    expect(fieldDon()).toBe(10);
    game.play({ type: "resolve-effect", optionId: "apply" });
    resolveAll(game);
    expect(fieldDon()).toBe(9);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.activeAttack?.counterPower).toBe(2_000);

    finishBattle(game);
    attack(game, "second", "p1-leader");
    expect(game.state.pendingEffect).toBeNull();
  });

  it("is not offered behind a Leader whose type does not include Baroque Works", () => {
    const game = defending("op12-069-off")
      .withLeader("p1", "OP06-080")
      .withBoard("p1", [character("crocodile", "OP12-069")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("can be declined, keeping the DON!!", () => {
    const game = defending("op12-069-decline")
      .withLeader("p1", "OP14-079")
      .withBoard("p1", [character("crocodile", "OP12-069")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    game.play({ type: "resolve-effect", optionId: "skip" });
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(game.state.activeAttack?.counterPower).toBe(0);
  });
});

describe("OP12-084 Emporio.Ivankov", () => {
  covers("OP12-084", "[Blocker]", "[On Play]");

  it("trashes the top 3 of the deck behind a {Revolutionary Army} Leader", () => {
    const game = table("op12-084")
      .withLeader("p1", "OP05-002") // {Revolutionary Army}
      .withHand("p1", [instance("ivankov", "OP12-084")])
      .withDeckTop("p1", [
        instance("a", "ST31-003"),
        instance("b", "ST31-003"),
        instance("c", "ST31-003"),
        instance("d", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-084" });
    resolveAll(game);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["a", "b", "c"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["d"]);
  });

  it("trashes nothing behind another Leader", () => {
    const game = table("op12-084-off")
      .withHand("p1", [instance("ivankov", "OP12-084")])
      .withDeckTop("p1", [instance("a", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-084" });
    resolveAll(game);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("blocks a declared attack", () => {
    const game = defending("op12-084-blocker")
      .withBoard("p1", [character("ivankov", "OP12-084")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    expect(hasKeyword(game.state, "p1", "ivankov", "Blocker")).toBe(true);
    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "ivankov" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("ivankov");
  });
});

describe("OP12-091 Poker", () => {
  covers("OP12-091", "[Activate: Main]");

  it("buries 3 trash cards to give up to 2 {SMILE} Characters +2000, once per turn", () => {
    const game = table("op12-091")
      .withBoard("p1", [
        character("poker", "OP12-091"), // {SMILE}
        character("sheepshead", "OP08-083"), // {SMILE}
        character("brook", "ST31-003"), // not {SMILE}
      ])
      .withTrash("p1", [
        instance("t1", "ST31-003"),
        instance("t2", "ST31-003"),
        instance("t3", "ST31-003"),
        instance("t4", "ST31-003"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "Poker" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    for (const id of ["t1", "t2", "t3"]) {
      game.play({ type: "resolve-effect", optionId: id });
    }
    expect(effectOptions(game.state)).not.toContain("brook");
    game.play({ type: "resolve-effect", optionId: "poker" });
    game.play({ type: "resolve-effect", optionId: "sheepshead" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["t4"]);
    expect(ids(game.state.players.p1.deck).sort()).toEqual(["t1", "t2", "t3"]);
    expect(currentPower(game.state, "p1", "poker")).toBe(6_000);
    expect(currentPower(game.state, "p1", "sheepshead")).toBe(5_000);
    expect(currentPower(game.state, "p1", "brook")).toBe(3_000);
    expect(activations(game)).not.toContain("OP12-091");
  });

  it("is not offered with fewer than 3 cards in the trash", () => {
    const game = table("op12-091-short")
      .withBoard("p1", [character("poker", "OP12-091")])
      .withTrash("p1", [instance("t1", "ST31-003"), instance("t2", "ST31-003")])
      .build();
    expect(activations(game)).not.toContain("OP12-091");
  });
});

describe("OP12-101 Jewelry Bonney", () => {
  covers("OP12-101", "[Activate: Main]", "[Trigger]");

  it("rests itself to give a {Supernovas} Leader +1000 through the opponent's next turn", () => {
    const game = table("op12-101")
      .withLeader("p1", "OP12-020") // {Supernovas}
      .withBoard("p1", [character("bonney", "OP12-101")])
      // Both players draw on the way to p1's next turn.
      .withDeckTop("p1", [instance("p1-draw", "ST31-003")])
      .withDeckTop("p2", [instance("p2-draw", "ST31-003")])
      .build();

    game.play({ type: "activate-main", summary: "Jewelry Bonney" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    resolveAll(game);
    expect(boardCard(game, "p1", "bonney")?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);

    game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
    game.pass();
    expect(game.state.turnPlayerId).toBe("p1");
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
  });

  it("is not offered behind a Leader without the type, nor once rested", () => {
    const off = table("op12-101-off")
      .withLeader("p1", "OP12-040")
      .withBoard("p1", [character("bonney", "OP12-101")])
      .build();
    expect(activations(off)).not.toContain("OP12-101");

    const rested = table("op12-101-rested")
      .withLeader("p1", "OP12-020")
      .withBoard("p1", [character("bonney", "OP12-101", { rested: true })])
      .build();
    expect(activations(rested)).not.toContain("OP12-101");
  });

  const lifeTrigger = (seed: string, leader: string): Game => {
    const game = defending(seed)
      .withLeader("p1", leader)
      .withLife("p1", [instance("bonney", "OP12-101")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();
    attack(game, "attacker", "p1-leader");
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    return game;
  };

  it("plays itself off a Life Trigger behind a {Supernovas} Leader", () => {
    const game = lifeTrigger("op12-101-trigger", "OP12-020");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    resolveAll(game);
    expect(ids(game.state.players.p1.board)).toEqual(["bonney"]);
  });

  it("offers no Trigger behind another Leader, so the card goes to hand", () => {
    const game = lifeTrigger("op12-101-trigger-off", "OP12-040");
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-trigger" && action.optionId === "activate",
        ),
    ).toBe(false);
    game.play({ type: "resolve-trigger" });
    resolveAll(game);
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["bonney"]);
  });
});

describe("OP12-104 Sentomaru", () => {
  covers("OP12-104", "[Trigger]");

  it("K.O.s a cost-4-or-less Character off a Life Trigger", () => {
    const game = table("op12-104")
      .withBoard("p1", [
        character("attacker", "OP11-003"), // cost 5
        character("four", "OP12-052"), // cost 4
      ])
      .withLife("p2", [instance("sentomaru", "OP12-104")])
      .build();

    attack(game, "attacker", "p2-leader");
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "four"]);
    game.play({ type: "resolve-effect", optionId: "four" });
    resolveAll(game);
    expect(ids(game.state.players.p1.board)).toEqual(["attacker"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["four"]);
  });
});

describe("OP12-105 Trafalgar Lammy", () => {
  covers("OP12-105", "[Your Turn]", "[On Play]");

  it("gives a [Trafalgar Law] card +2000 for the turn", () => {
    const game = table("op12-105")
      .withLeader("p1", "OP10-022") // [Trafalgar Law]
      .withHand("p1", [instance("lammy", "OP12-105")])
      .withBoard("p1", [
        character("law", "OP05-069"),
        character("brook", "ST31-003"),
      ])
      .withDeckTop("p2", [instance("p2-draw", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-105" });
    expect(effectOptions(game.state).sort()).toEqual([
      "done",
      "law",
      "p1-leader",
    ]);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    resolveAll(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);

    game.pass();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
  });
  it("does nothing when played on the opponent's turn", () => {
    // OP15-106 Octoballoon's Life Trigger draws, then plays a yellow
    // Character of cost 2 or less from hand -- Lammy, on p2's turn.
    const game = defending("op12-105-their-turn")
      .withLeader("p1", "OP10-022")
      .withHand("p1", [instance("lammy", "OP12-105")])
      .withLife("p1", [instance("octoballoon", "OP15-106")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "lammy" });
    expect(effectOptions(game.state)).not.toContain("p1-leader");
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["lammy"]);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
  });
});

describe("OP12-107 Donquixote Doflamingo", () => {
  covers("OP12-107", "static", "[Opponent's Turn]", "[On K.O.]");

  it("has [Rush] with 2 or fewer Life cards, and not with 3", () => {
    const low = table("op12-107-rush")
      .withLife("p1", [instance("l1", "ST31-003"), instance("l2", "ST31-003")])
      .withHand("p1", [instance("doflamingo", "OP12-107")])
      .build();
    low.play({ type: "play-card", cardNumber: "OP12-107" });
    resolveAll(low);
    expect(hasKeyword(low.state, "p1", "doflamingo", "Rush")).toBe(true);
    expect(
      low.action({
        type: "attack",
        attackerInstanceId: "doflamingo",
        targetInstanceId: "p2-leader",
      }),
    ).toBeDefined();

    const high = table("op12-107-no-rush")
      .withLife("p1", [
        instance("l1", "ST31-003"),
        instance("l2", "ST31-003"),
        instance("l3", "ST31-003"),
      ])
      .withHand("p1", [instance("doflamingo", "OP12-107")])
      .build();
    high.play({ type: "play-card", cardNumber: "OP12-107" });
    resolveAll(high);
    expect(hasKeyword(high.state, "p1", "doflamingo", "Rush")).toBe(false);
  });

  it("adds the top card of the deck to Life when K.O.'d on the opponent's turn", () => {
    const game = defending("op12-107-ko")
      .withLife("p1", [instance("l1", "ST31-003")])
      .withBoard("p1", [character("doflamingo", "OP12-107", { rested: true })])
      .withDeckTop("p1", [instance("next", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP05-065")]) // 8000
      .build();

    attack(game, "attacker", "doflamingo");
    finishBattle(game);
    expect(ids(game.state.players.p1.trash)).toEqual(["doflamingo"]);
    expect(game.state.players.p1.life[0]?.instanceId).toBe("next");
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("adds no Life when K.O.'d on its controller's own turn", () => {
    // OP05-087 Hakuba's [When Attacking] K.O.s one of its own controller's
    // Characters as its cost.
    const game = table("op12-107-own-turn")
      .withLife("p1", [instance("l1", "ST31-003")])
      .withBoard("p1", [
        character("hakuba", "OP05-087"),
        character("doflamingo", "OP12-107"),
      ])
      .withGivenDon("p1", "hakuba", 1)
      .withDeckTop("p1", [instance("next", "ST31-003")])
      .build();

    attack(game, "hakuba", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "doflamingo" });
    resolveAll(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["doflamingo"]);
    expect(ids(game.state.players.p1.life)).toEqual(["l1"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("next");
  });
});

describe("OP12-109 Pacifista", () => {
  covers("OP12-109", "[Trigger]");

  it("K.O.s a cost-1-or-less Character and goes to hand off a Life Trigger", () => {
    const game = table("op12-109")
      .withBoard("p1", [
        character("attacker", "OP11-003"),
        character("one", "OP07-067"), // cost 1
        character("two", "OP05-083"), // cost 2
      ])
      .withLife("p2", [instance("pacifista", "OP12-109")])
      .build();

    attack(game, "attacker", "p2-leader");
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(effectOptions(game.state).sort()).toEqual(["done", "one"]);
    game.play({ type: "resolve-effect", optionId: "one" });
    resolveAll(game);
    expect(ids(game.state.players.p1.trash)).toEqual(["one"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["pacifista"]);
    expect(game.state.players.p2.trash).toHaveLength(0);
  });
});

describe("OP12-116 We'll Ring the Bell Waiting for You!!", () => {
  covers("OP12-116", "[Main]", "[Trigger]");

  it("adds up to 2 {Shandian Warrior} Characters or [Mont Blanc Noland] from the top 5 and bottoms the rest", () => {
    const game = table("op12-116")
      .withHand("p1", [instance("bell", "OP12-116")])
      .withDeckTop("p1", [
        instance("raki", "OP06-113"), // {Shandian Warrior}
        instance("noland", "OP08-109"), // [Mont Blanc Noland]
        instance("genbo", "OP06-105"), // {Shandian Warrior}
        instance("brook", "ST31-003"),
        instance("bell-2", "OP12-116"), // {Shandian Warrior}, but an Event
        instance("sixth", "ST31-003"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP12-116" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["raki", "noland", "genbo"]),
    );
    expect(effectOptions(game.state)).not.toContain("brook");
    expect(effectOptions(game.state)).not.toContain("bell-2");
    game.play({ type: "resolve-effect", optionId: "raki" });
    game.play({ type: "resolve-effect", optionId: "noland" });
    resolveAll(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["noland", "raki"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("sixth");
    expect(ids(game.state.players.p1.deck.slice(1)).sort()).toEqual([
      "bell-2",
      "brook",
      "genbo",
    ]);
  });

  it("draws 1 off its Life Trigger", () => {
    const game = defending("op12-116-trigger")
      .withLife("p1", [instance("bell", "OP12-116")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    resolveAll(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["bell"]);
  });
});

describe("OP12-117 Slam Gibson", () => {
  covers("OP12-117", "[Main]", "[Counter]");

  it("rests 5 DON!! to add a cost-9-or-less Character to its owner's Life face-down", () => {
    const game = table("op12-117")
      .withLeader("p1", "OP12-020") // {Supernovas}
      .withHand("p1", [instance("gibson", "OP12-117")])
      .withLife("p2", [instance("life", "ST31-003")])
      .withBoard("p2", [character("luffy", "ST31-004")]) // cost 7
      .build();

    game.play({ type: "activate-main", summary: "Slam Gibson" });
    game.play({ type: "resolve-effect", optionId: "luffy" });
    game.play({ type: "resolve-effect", optionId: "bottom" });
    resolveAll(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(ids(game.state.players.p2.life)).toEqual(["life", "luffy"]);
    expect(game.state.players.p2.life[1]?.faceUp ?? false).toBe(false);
    // 1 for the Event and 5 for the clause.
    expect(game.state.players.p1.restedDon).toHaveLength(6);
  });

  it("is not offered behind a Leader without the {Supernovas} type", () => {
    const game = table("op12-117-off")
      .withLeader("p1", "OP12-040")
      .withHand("p1", [instance("gibson", "OP12-117")])
      .withBoard("p2", [character("luffy", "ST31-004")])
      .build();

    expect(
      game.legalActions().some((action) => action.type === "activate-main"),
    ).toBe(false);
  });

  it("is not offered without the 5 DON!! the clause rests", () => {
    const game = table("op12-117-short")
      .withLeader("p1", "OP12-020")
      .withDon("p1", { rested: 5 })
      .withHand("p1", [instance("gibson", "OP12-117")])
      .withBoard("p2", [character("luffy", "ST31-004")])
      .build();

    expect(
      game.legalActions().some((action) => action.type === "activate-main"),
    ).toBe(false);
  });

  it("gives the Leader +3000 for the battle as a Counter", () => {
    const game = defending("op12-117-counter")
      .withHand("p1", [instance("gibson", "OP12-117")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    game.pass();
    game.play({ type: "activate-counter-event" });
    resolveAll(game);
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
  });
});

describe("OP12-040 Kuzan's Leader and a {Navy} replacement's hand trash", () => {
  covers("OP12-040", "static");
  covers("OP12-053", "static");

  it("draws when OP12-053 Borsalino trashes a hand card instead of leaving the field", () => {
    const game = defending("op12-040-borsalino")
      .withLeader("p1", "OP12-040")
      .withBoard("p1", [character("borsalino", "OP12-053")])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withDeckTop("p1", [instance("drawn", "ST31-004")])
      .withHand("p2", [instance("gatling", "ST10-016")])
      .build();

    game.play({ type: "activate-main", summary: "Gum-Gum Kong Gatling" });
    game.play({ type: "resolve-effect", optionId: "borsalino" });
    const replace = effectOptions(game.state).find((option) =>
      option.startsWith("replace:"),
    );
    expect(replace).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replace! });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["borsalino"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  it("draws when the replacement answers an imperative K.O. as well", () => {
    // OP15-036 Ryuma's [On Play] K.O. is a `ko-character` pending effect,
    // which pays a hand-trash replacement through its own step.
    const game = defending("op12-040-ryuma")
      .withLeader("p1", "OP12-040")
      .withBoard("p1", [character("borsalino", "OP12-053", { rested: true })])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withDeckTop("p1", [instance("drawn", "ST31-004")])
      .withHand("p2", [instance("ryuma", "OP15-036")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-036" });
    game.play({ type: "resolve-effect", optionId: "borsalino" });
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    const replace = effectOptions(game.state).find(
      (option) => option !== "skip" && option.includes("borsalino"),
    );
    expect(replace).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replace! });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["borsalino"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  it("draws when OP12-048 Donquixote Rosinante trashes a hand card instead", () => {
    const game = defending("op12-040-rosinante")
      .withLeader("p1", "OP12-040")
      .withBoard("p1", [
        character("rosinante", "OP12-048"),
        character("fullbody", "OP12-052"),
      ])
      .withHand("p1", [instance("fuel", "ST31-003")])
      .withDeckTop("p1", [instance("drawn", "ST31-004")])
      .withHand("p2", [instance("gatling", "ST10-016")])
      .build();

    game.play({ type: "activate-main", summary: "Gum-Gum Kong Gatling" });
    game.play({ type: "resolve-effect", optionId: "fullbody" });
    const replace = effectOptions(game.state).find((option) =>
      option.includes("rosinante"),
    );
    expect(replace).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replace! });
    resolveAll(game);

    expect(ids(game.state.players.p1.board)).toEqual(["rosinante", "fullbody"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["fuel"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });
});
