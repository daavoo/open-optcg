import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
  playCostFromHand,
} from "@one-piece-sim/engine-core";
import { validateDeck } from "@one-piece-sim/decks";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP-18's Black cards, OP18-080 to OP18-097 and OP18-119 Saint Shamrock.
 *
 * No shipped list plays them, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter. Where a clause is
 * gated on a Leader, the position states that Leader and pairs the play with
 * one behind a Leader that does not satisfy the gate.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** A {Blackbeard Pirates} Leader named [Marshall.D.Teach]. */
const TEACH = "OP09-081";
/** The one {Celestial Dragons} Leader in the pool. */
const CELESTIAL_LEADER = "OP18-060";

/** p1 in its own Main Phase, ten DON!! active, both sides empty. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 acting, so p1's Characters can be K.O.'d in battle. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

const offers = (game: Game): string[] =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId: string }).optionId);

/** Resolve the open effect, taking a preferred option wherever one is offered. */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("the effect never settled");
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

/** Pass the block and Counter steps, answering any effect with its first offer. */
function declineDefence(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.phase === "block" || game.state.phase === "counter") {
    if (guard++ > 40) throw new Error("battle never settled");
    if (game.state.pendingEffect) {
      answer(game, ...preferred);
      continue;
    }
    game.pass();
  }
  answer(game, ...preferred);
}

/** p2's `attacker` swings at p1's `target`, and p1 lets the battle resolve. */
function koInBattle(game: Game, target: string, ...preferred: string[]) {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: target,
  });
  declineDefence(game, ...preferred);
}

/** Take one named option of the open effect. */
function pick(game: Game, optionId: string): void {
  game.play({ type: "resolve-effect", optionId });
}

/** A board Character's cost with every layer folded. */
const costOn = (game: Game, instanceId: string): number => {
  const card = game.state.players.p1.board.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (!card) throw new Error(`${instanceId} is not on p1's board`);
  return effectiveCost(game.state, "p1", card);
};

/** What p1 pays to play `cardNumber` from hand right now. */
const handPrice = (game: Game, cardNumber: string, printed: number): number =>
  playCostFromHand(game.state, "p1", cardNumber, printed);

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const filler = (prefix: string, count: number) =>
  copies(count, "ST32-004", prefix);

const activated = (game: Game, cardNumber: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" && action.summary.includes(cardNumber),
    );

describe("OP18-080 Van Augur", () => {
  covers("OP18-080", "[Your Turn]");

  const teachTable = (seed: string) =>
    table(seed)
      .withLeader("p1", TEACH)
      .withHand("p1", filler("hand", 2))
      .withDeckTop("p1", [
        instance("drawn-1", "ST32-004"),
        instance("drawn-2", "ST32-004"),
      ]);

  it("draws when the Teach Leader's activation trashes a card from hand, once a turn", () => {
    const game = teachTable("op18-080-teach")
      .withBoard("p1", [character("augur", "OP18-080")])
      .build();

    game.play({ type: "activate-main", cardNumber: TEACH });
    answer(game, "apply", "hand-1");
    expect(ids(game.state.players.p1.trash)).toEqual(["hand-1"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["hand-2", "drawn-1"]);

    // [Once Per Turn]: a second trash the same turn draws nothing.
    game.play({ type: "activate-main", cardNumber: TEACH });
    answer(game, "apply", "hand-2");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn-1"]);
  });

  it("draws nothing beside another [Van Augur]", () => {
    const game = teachTable("op18-080-pair")
      .withBoard("p1", [
        character("augur", "OP18-080"),
        character("augur-2", "OP18-080"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: TEACH });
    answer(game, "apply", "hand-1");
    expect(ids(game.state.players.p1.hand)).toEqual(["hand-2"]);
  });

  it("ignores a hand trash paid to a Character's effect", () => {
    // OP16-080's Teach negates nothing, so Dorry's [On Play] runs; OP09-081
    // would switch it off.
    const game = teachTable("op18-080-character")
      .withLeader("p1", "OP16-080")
      .withBoard("p1", [character("augur", "OP18-080")])
      .withHand("p1", [instance("dorry", "OP18-089"), ...filler("hand", 2)])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withHand("p2", [instance("their-card", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-089" });
    answer(game, "apply", "hand-1", "their-card");
    expect(ids(game.state.players.p1.trash)).toEqual(["hand-1"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["hand-2"]);
  });

  covers("OP18-080", "[On K.O.]");

  it("draws 1 when it is K.O.'d", () => {
    const game = defending("op18-080-ko")
      .withBoard("p1", [character("augur", "OP18-080", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-090")])
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .build();

    koInBattle(game, "augur");
    expect(ids(game.state.players.p1.trash)).toEqual(["augur"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });
});

describe("OP18-081 Oars", () => {
  covers("OP18-081", "static");

  it("has [Double Attack] and [Blocker] only beside a [Gecko Moria] Character", () => {
    const withMoria = table("op18-081-moria")
      .withBoard("p1", [
        character("oars", "OP18-081"),
        character("moria", "OP07-083"),
      ])
      .build();
    expect(hasKeyword(withMoria.state, "p1", "oars", "Double Attack")).toBe(
      true,
    );
    expect(hasKeyword(withMoria.state, "p1", "oars", "Blocker")).toBe(true);

    const alone = table("op18-081-alone")
      .withBoard("p1", [character("oars", "OP18-081")])
      .build();
    expect(hasKeyword(alone.state, "p1", "oars", "Double Attack")).toBe(false);
    expect(hasKeyword(alone.state, "p1", "oars", "Blocker")).toBe(false);
  });

  covers("OP18-081", "[Trigger]");

  it("plays a cost-4-or-less {Thriller Bark Pirates} Character from the trash rested", () => {
    const game = defending("op18-081-trigger")
      .withLife("p1", [instance("oars", "OP18-081")])
      .withTrash("p1", [instance("kumacy", "OP14-102")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    let guard = 0;
    while (
      !game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      if (guard++ > 20) throw new Error("trigger window never opened");
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    answer(game, "kumacy");

    const kumacy = game.state.players.p1.board.find(
      (card) => card.instanceId === "kumacy",
    );
    expect(kumacy?.rested).toBe(true);
  });
});

describe("OP18-082 Catarina Devon", () => {
  covers("OP18-082", "[When Attacking]");

  it("attacks at the opponent Leader's power", () => {
    const game = table("op18-082-attack")
      .withBoard("p1", [character("devon", "OP18-082")])
      .build();
    const leaderPower = currentPower(game.state, "p2", "p2-leader");
    expect(currentPower(game.state, "p1", "devon")).toBe(3000);

    game.play({
      type: "attack",
      attackerInstanceId: "devon",
      targetInstanceId: "p2-leader",
    });
    answer(game);
    expect(currentPower(game.state, "p1", "devon")).toBe(leaderPower);
  });

  covers("OP18-082", "[On K.O.]");

  it("comes back rested for a card from hand behind a {Blackbeard Pirates} Leader", () => {
    const game = defending("op18-082-ko")
      .withLeader("p1", TEACH)
      .withHand("p1", filler("hand", 1))
      .withBoard("p1", [character("devon", "OP18-082", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-090")])
      .build();

    koInBattle(game, "devon", "apply", "hand-1");
    expect(ids(game.state.players.p1.trash)).toEqual(["hand-1"]);
    const devon = game.state.players.p1.board.find(
      (card) => card.instanceId === "devon",
    );
    expect(devon?.rested).toBe(true);
  });

  it("spends the card and stays in the trash behind another Leader", () => {
    const game = defending("op18-082-ko-wrong-leader")
      .withHand("p1", filler("hand", 1))
      .withBoard("p1", [character("devon", "OP18-082", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-090")])
      .build();

    koInBattle(game, "devon", "apply", "hand-1");
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "devon",
      "hand-1",
    ]);
    expect(game.state.players.p1.board).toEqual([]);
  });

  it("may be declined, keeping the hand", () => {
    const game = defending("op18-082-ko-decline")
      .withLeader("p1", TEACH)
      .withHand("p1", filler("hand", 1))
      .withBoard("p1", [character("devon", "OP18-082", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-090")])
      .build();

    koInBattle(game, "devon", "skip");
    expect(ids(game.state.players.p1.hand)).toEqual(["hand-1"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["devon"]);
  });
});

describe("OP18-083 Saint Killingham", () => {
  covers("OP18-083", "[Your Turn]", "[On Play]");

  it("plays a [Sleeptids] from the trash on its controller's turn", () => {
    const game = table("op18-083-play")
      .withHand("p1", [instance("killingham", "OP18-083")])
      .withTrash("p1", [
        instance("sleeptids", "OP18-093"),
        instance("brook", "OP18-090"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-083" });
    expect(offers(game)).toEqual(["sleeptids", "done"]);
    answer(game, "sleeptids");
    expect(ids(game.state.players.p1.board)).toEqual([
      "killingham",
      "sleeptids",
    ]);
  });

  covers("OP18-083", "[On K.O.]");

  it("comes back from the trash for 2 cards from hand", () => {
    const game = defending("op18-083-ko")
      .withHand("p1", filler("hand", 2))
      .withBoard("p1", [character("killingham", "OP18-083", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-090")])
      .build();

    koInBattle(game, "killingham", "apply", "hand-1", "hand-2");
    expect(ids(game.state.players.p1.board)).toEqual(["killingham"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "hand-1",
      "hand-2",
    ]);
  });

  it("is not offered with only 1 card in hand", () => {
    const game = defending("op18-083-ko-short")
      .withHand("p1", filler("hand", 1))
      .withBoard("p1", [character("killingham", "OP18-083", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-090")])
      .build();

    koInBattle(game, "killingham");
    expect(ids(game.state.players.p1.hand)).toEqual(["hand-1"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["killingham"]);
  });
});

describe("OP18-084 Saint Gunko", () => {
  covers("OP18-084", "[On Play]");

  it("keeps a {Holy Knights of God} card of the top 4 and trashes the rest", () => {
    const game = table("op18-084-look")
      .withHand("p1", [instance("gunko", "OP18-084")])
      .withDeckTop("p1", [
        instance("sommers", "OP18-088"),
        instance("brook", "OP18-090"),
        instance("filler-1", "ST32-004"),
        instance("filler-2", "ST32-004"),
        instance("fifth", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-084" });
    answer(game, "sommers");
    expect(ids(game.state.players.p1.hand)).toEqual(["sommers"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "brook",
      "filler-1",
      "filler-2",
    ]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("fifth");
  });

  covers("OP18-084", "[Activate: Main]");

  it("rests 4 DON!! to play a cost-6-or-less Holy Knight from the trash", () => {
    const game = table("op18-084-activate")
      .withBoard("p1", [character("gunko", "OP18-084")])
      .withTrash("p1", [
        instance("sommers", "OP18-088"),
        instance("shamrock", "OP18-119"),
      ])
      .build();
    const active = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", cardNumber: "OP18-084" });
    // Shamrock is cost 8: only Sommers is offered.
    expect(offers(game)).toEqual(["sommers", "done"]);
    answer(game, "sommers");
    expect(ids(game.state.players.p1.board)).toEqual(["gunko", "sommers"]);
    expect(game.state.players.p1.activeDon).toHaveLength(active - 4);
  });

  it("is not offered with fewer than 4 active DON!!", () => {
    const game = table("op18-084-activate-short")
      .withBoard("p1", [character("gunko", "OP18-084")])
      .withTrash("p1", [instance("sommers", "OP18-088")])
      .withDon("p1", { rested: 7 })
      .build();
    expect(game.state.players.p1.activeDon.length).toBeLessThan(4);
    expect(activated(game, "OP18-084")).toBe(false);
  });
});

describe("OP18-085 Cerberus", () => {
  covers("OP18-085", "[Activate: Main]");

  it("returns to hand and gives a [Saint Shamrock] the keyword its player picks", () => {
    const game = table("op18-085-banish")
      .withBoard("p1", [
        character("cerberus", "OP18-085"),
        character("shamrock", "OP18-119"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP18-085" });
    pick(game, "shamrock");
    expect(offers(game)).toEqual(["rush", "banish", "unblockable"]);
    pick(game, "banish");

    expect(ids(game.state.players.p1.hand)).toEqual(["cerberus"]);
    expect(hasKeyword(game.state, "p1", "shamrock", "Banish")).toBe(true);
    expect(hasKeyword(game.state, "p1", "shamrock", "Rush")).toBe(false);
  });

  it("still returns to hand with no [Saint Shamrock] out", () => {
    const game = table("op18-085-alone")
      .withBoard("p1", [character("cerberus", "OP18-085")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP18-085" });
    answer(game, "apply");
    expect(ids(game.state.players.p1.hand)).toEqual(["cerberus"]);
  });
});

describe("OP18-086 Goldberg", () => {
  covers("OP18-086", "static");

  it("is a 15 on the field and a 3 in hand", () => {
    const game = table("op18-086-cost")
      .withBoard("p1", [character("goldberg", "OP18-086")])
      .withHand("p1", [instance("held", "OP18-086")])
      .build();
    expect(costOn(game, "goldberg")).toBe(15);
    expect(handPrice(game, "OP18-086", 3)).toBe(3);
  });

  covers("OP18-086", "[On K.O.]");

  it("K.O.s an opposing cost-4-or-less Character when it falls", () => {
    const game = defending("op18-086-ko")
      .withBoard("p1", [character("goldberg", "OP18-086", { rested: true })])
      .withBoard("p2", [
        character("attacker", "OP18-090"),
        character("small", "ST32-004"),
      ])
      .build();

    koInBattle(game, "goldberg", "small");
    expect(ids(game.state.players.p2.board)).toEqual(["attacker"]);
  });
});

describe("OP18-087 Stansen", () => {
  covers("OP18-087", "static");

  it("is +12 cost, and +2000 power only while every Character beside it is 12 or more", () => {
    const giants = table("op18-087-giants")
      .withBoard("p1", [
        character("stansen", "OP18-087"),
        character("goldberg", "OP18-086"),
      ])
      .build();
    expect(costOn(giants, "stansen")).toBe(15);
    expect(currentPower(giants.state, "p1", "stansen")).toBe(6000);

    const mixed = table("op18-087-mixed")
      .withBoard("p1", [
        character("stansen", "OP18-087"),
        character("brook", "OP18-090"),
      ])
      .build();
    expect(currentPower(mixed.state, "p1", "stansen")).toBe(4000);
  });
});

describe("OP18-088 Saint Sommers", () => {
  covers("OP18-088", "[Your Turn]", "[On Play]");

  it("K.O.s a base-cost-4-or-less Character with 6 DON!! on the field", () => {
    const game = table("op18-088-ko")
      .withHand("p1", [instance("sommers", "OP18-088")])
      .withBoard("p2", [
        character("small", "ST32-004"),
        character("brook", "OP18-090"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-088" });
    expect(offers(game)).toEqual(["small", "done"]);
    answer(game, "small");
    expect(ids(game.state.players.p2.board)).toEqual(["brook"]);
  });

  // A 6-cost Character played from hand always leaves 6 DON!! on the field,
  // so the short case is a play out of the trash, through OP18-084 Saint
  // Gunko's activation.
  it("does nothing with 5 DON!! on the field", () => {
    const game = table("op18-088-short")
      .withDonDeck("p1", 5)
      .withBoard("p1", [character("gunko", "OP18-084")])
      .withTrash("p1", [instance("sommers", "OP18-088")])
      .withBoard("p2", [character("small", "ST32-004")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP18-084" });
    pick(game, "sommers");
    expect(game.state.pendingEffect).toBeFalsy();
    expect(ids(game.state.players.p1.board)).toEqual(["gunko", "sommers"]);
    expect(ids(game.state.players.p2.board)).toEqual(["small"]);
  });

  covers("OP18-088", "[On K.O.]");

  it("comes back from the trash for 2 cards from hand", () => {
    const game = defending("op18-088-replay")
      .withHand("p1", filler("hand", 2))
      .withBoard("p1", [character("sommers", "OP18-088", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-090")])
      .build();

    koInBattle(game, "sommers", "apply", "hand-1", "hand-2");
    expect(ids(game.state.players.p1.board)).toEqual(["sommers"]);
    expect(game.state.players.p1.hand).toEqual([]);
  });
});

describe("OP18-089 Dorry", () => {
  covers("OP18-089", "static");

  it("is +12 cost on the field", () => {
    const game = table("op18-089-cost")
      .withBoard("p1", [character("dorry", "OP18-089")])
      .build();
    expect(costOn(game, "dorry")).toBe(16);
  });

  covers("OP18-089", "[On Play]");

  it("trades a card from hand for one the opponent chooses from theirs", () => {
    const game = table("op18-089-play")
      .withHand("p1", [instance("dorry", "OP18-089"), ...filler("hand", 1)])
      .withHand("p2", [
        instance("theirs-1", "ST32-004"),
        instance("theirs-2", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-089" });
    pick(game, "apply");
    pick(game, "hand-1");
    // The opponent picks.
    expect(game.state.activePlayer).toBe("p2");
    pick(game, "theirs-2");
    expect(ids(game.state.players.p1.trash)).toEqual(["hand-1"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["theirs-2"]);
  });

  it("asks nothing with an empty hand", () => {
    const game = table("op18-089-empty")
      .withHand("p1", [instance("dorry", "OP18-089")])
      .withHand("p2", [instance("theirs", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-089" });
    expect(game.state.pendingEffect).toBeFalsy();
    expect(ids(game.state.players.p2.hand)).toEqual(["theirs"]);
  });
});

describe("OP18-091 Brogy", () => {
  covers("OP18-091", "static");

  it("is +12 cost on the field", () => {
    const game = table("op18-091-cost")
      .withBoard("p1", [character("brogy", "OP18-091")])
      .build();
    expect(costOn(game, "brogy")).toBe(16);
  });

  covers("OP18-091", "[When Attacking]");

  it("buys back a cost-2-or-less Character from the trash as it attacks", () => {
    const game = table("op18-091-attack")
      .withBoard("p1", [character("brogy", "OP18-091")])
      .withHand("p1", filler("hand", 1))
      .withTrash("p1", [
        instance("gunko", "OP18-084"),
        instance("brook", "OP18-090"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "brogy",
      targetInstanceId: "p2-leader",
    });
    pick(game, "apply");
    pick(game, "hand-1");
    expect(offers(game)).toEqual(["gunko", "done"]);
    pick(game, "gunko");
    expect(ids(game.state.players.p1.hand)).toEqual(["gunko"]);
  });

  it("asks nothing with an empty hand", () => {
    const game = table("op18-091-empty")
      .withBoard("p1", [character("brogy", "OP18-091")])
      .withTrash("p1", [instance("gunko", "OP18-084")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "brogy",
      targetInstanceId: "p2-leader",
    });
    expect(ids(game.state.players.p1.hand)).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(["gunko"]);
  });

  it("does nothing when played", () => {
    const game = table("op18-091-play")
      .withHand("p1", [instance("brogy", "OP18-091"), ...filler("hand", 1)])
      .withTrash("p1", [instance("gunko", "OP18-084")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-091" });
    expect(game.state.pendingEffect).toBeFalsy();
    expect(ids(game.state.players.p1.trash)).toEqual(["gunko"]);
  });
});

describe("OP18-092 Roronoa Zoro", () => {
  covers("OP18-092", "static");

  it("gains +3000 while either side has a cost-12 Character", () => {
    const theirs = table("op18-092-power")
      .withBoard("p1", [character("zoro", "OP18-092")])
      .withBoard("p2", [character("goldberg", "OP18-086")])
      .build();
    expect(currentPower(theirs.state, "p1", "zoro")).toBe(5000);

    const none = table("op18-092-none")
      .withBoard("p1", [character("zoro", "OP18-092")])
      .build();
    expect(currentPower(none.state, "p1", "zoro")).toBe(2000);
  });

  it("attacks the turn it is played with 10 cards in the trash", () => {
    const deep = table("op18-092-rush")
      .withHand("p1", [instance("zoro", "OP18-092")])
      .withTrash("p1", filler("trash", 10))
      .build();
    deep.play({ type: "play-card", cardNumber: "OP18-092" });
    expect(
      deep
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "zoro",
        ),
    ).toBe(true);

    const shallow = table("op18-092-no-rush")
      .withHand("p1", [instance("zoro", "OP18-092")])
      .withTrash("p1", filler("trash", 9))
      .build();
    shallow.play({ type: "play-card", cardNumber: "OP18-092" });
    expect(hasKeyword(shallow.state, "p1", "zoro", "Rush")).toBe(false);
  });
});

describe("OP18-093 Sleeptids", () => {
  covers("OP18-093", "static", "[Blocker]");

  it("may be run at any number of copies", () => {
    const result = validateDeck({
      leader: "OP16-080",
      cards: { "OP18-093": 50 },
      // OP-18 carries no block icon yet, so Standard rejects it for that.
      format: "extra",
    });
    expect(result.errors.filter((error) => error.includes("OP18-093"))).toEqual(
      [],
    );
  });

  it("blocks", () => {
    const game = defending("op18-093-block")
      .withBoard("p1", [character("sleeptids", "OP18-093")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "sleeptids" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("sleeptids");
  });
});

describe("OP18-094 Hee Hee Hee!! I Smell Adventure!!", () => {
  covers("OP18-094", "[Main]");

  it("adds an {Elbaph} card of the top 5 and puts the rest on the bottom", () => {
    const game = table("op18-094-main")
      .withHand("p1", [instance("event", "OP18-094")])
      .withDeckTop("p1", [
        instance("goldberg", "OP18-086"),
        ...filler("top", 4),
        instance("sixth", "OP18-090"),
      ])
      .build();
    const deckSize = game.state.players.p1.deck.length;

    game.play({ type: "activate-main", cardNumber: "OP18-094" });
    answer(game, "goldberg");
    expect(ids(game.state.players.p1.hand)).toEqual(["goldberg"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("sixth");
    expect(game.state.players.p1.deck).toHaveLength(deckSize - 1);
  });

  covers("OP18-094", "[Trigger]");

  it("draws 1 from Life", () => {
    const game = defending("op18-094-trigger")
      .withLife("p1", [instance("event", "OP18-094")])
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    let guard = 0;
    while (
      !game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      if (guard++ > 20) throw new Error("trigger window never opened");
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    answer(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });
});

describe("OP18-095 I'm Late, I'm Very Late!!", () => {
  covers("OP18-095", "[Main]");

  it("adds a [Sleeptids] of the top 5 behind a {Celestial Dragons} Leader", () => {
    const game = table("op18-095-main")
      .withLeader("p1", CELESTIAL_LEADER)
      .withHand("p1", [instance("event", "OP18-095")])
      .withDeckTop("p1", [
        ...filler("top", 3),
        instance("sleeptids", "OP18-093"),
        instance("sommers", "OP18-088"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP18-095" });
    expect(offers(game)).toEqual(["sleeptids", "sommers", "done"]);
    answer(game, "sleeptids");
    expect(ids(game.state.players.p1.hand)).toEqual(["sleeptids"]);
  });

  it("is not offered behind another Leader, where it would do nothing", () => {
    const game = table("op18-095-wrong-leader")
      .withHand("p1", [instance("event", "OP18-095")])
      .withDeckTop("p1", [instance("sleeptids", "OP18-093")])
      .build();

    expect(activated(game, "OP18-095")).toBe(false);
  });

  covers("OP18-095", "[Trigger]");

  it("runs the same search from Life", () => {
    const game = defending("op18-095-trigger")
      .withLeader("p1", CELESTIAL_LEADER)
      .withLife("p1", [instance("event", "OP18-095")])
      .withDeckTop("p1", [instance("gunko", "OP18-084"), ...filler("top", 4)])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    let guard = 0;
    while (
      !game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      if (guard++ > 20) throw new Error("trigger window never opened");
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    answer(game, "gunko");
    expect(ids(game.state.players.p1.hand)).toEqual(["gunko"]);
  });
});

describe("OP18-096 I'll Make the Call", () => {
  covers("OP18-096", "[Main]");

  it("rests 3 DON!! to play a Holy Knight from the trash", () => {
    const game = table("op18-096-main")
      .withHand("p1", [instance("event", "OP18-096")])
      .withTrash("p1", [instance("killingham", "OP18-083")])
      .build();
    const active = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", cardNumber: "OP18-096" });
    answer(game, "killingham");
    // Killingham's own [On Play] finds no [Sleeptids] and asks nothing.
    answer(game);
    expect(ids(game.state.players.p1.board)).toEqual(["killingham"]);
    // 1 for the Event, 3 for its text.
    expect(game.state.players.p1.activeDon).toHaveLength(active - 4);
  });

  covers("OP18-096", "[Counter]");

  const counterAgainst = (seed: string, trash: number) => {
    const game = defending(seed)
      .withHand("p1", [instance("event", "OP18-096")])
      .withTrash("p1", filler("trash", trash))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    answer(game, "p1-leader");
    return game;
  };

  it("adds +4000 with 10 cards in the trash, the Event among them", () => {
    expect(
      counterAgainst("op18-096-counter", 9).state.activeAttack?.counterPower,
    ).toBe(4000);
  });

  it("is not offered with fewer, where it would add nothing", () => {
    const game = defending("op18-096-counter-short")
      .withHand("p1", [instance("event", "OP18-096")])
      .withTrash("p1", filler("trash", 8))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    expect(
      game
        .legalActions()
        .some((action) => action.type === "activate-counter-event"),
    ).toBe(false);
  });
});

describe("OP18-097 Abyss Pentagram", () => {
  covers("OP18-097", "static");

  it("takes 1 off a Holy Knight played from hand behind a {Celestial Dragons} Leader", () => {
    const game = table("op18-097-discount")
      .withLeader("p1", CELESTIAL_LEADER)
      .withStage("p1", instance("abyss", "OP18-097"))
      .withHand("p1", [
        instance("killingham", "OP18-083"),
        instance("cerberus", "OP18-085"),
        instance("brook", "OP18-090"),
      ])
      .build();

    expect(handPrice(game, "OP18-083", 5)).toBe(4);
    // Cost 1, below the printed floor of 2; and a card of neither type.
    expect(handPrice(game, "OP18-085", 1)).toBe(1);
    expect(handPrice(game, "OP18-090", 7)).toBe(7);
  });

  it("takes nothing off behind another Leader", () => {
    const game = table("op18-097-wrong-leader")
      .withStage("p1", instance("abyss", "OP18-097"))
      .withHand("p1", [instance("killingham", "OP18-083")])
      .build();
    expect(handPrice(game, "OP18-083", 5)).toBe(5);
  });

  covers("OP18-097", "[On Play]");

  it("draws 1, then trashes the top 2", () => {
    const game = table("op18-097-play")
      .withHand("p1", [instance("abyss", "OP18-097")])
      .withDeckTop("p1", [
        instance("drawn", "ST32-004"),
        instance("milled-1", "ST32-004"),
        instance("milled-2", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-097" });
    answer(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["milled-1", "milled-2"]);
  });
});

describe("OP18-119 Saint Shamrock", () => {
  covers("OP18-119", "[On K.O.]");

  it("comes back from the trash for a card from hand", () => {
    const game = defending("op18-119-ko")
      .withHand("p1", filler("hand", 1))
      .withBoard("p1", [character("shamrock", "OP18-119", { rested: true })])
      .withBoard("p2", [character("attacker", "OP18-090")])
      .build();

    koInBattle(game, "shamrock", "apply", "hand-1");
    expect(ids(game.state.players.p1.board)).toEqual(["shamrock"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["hand-1"]);
  });

  covers("OP18-119", "[Activate: Main]");

  it("plays a Holy Knight from the trash the turn it is played, once", () => {
    const game = table("op18-119-activate")
      .withHand("p1", [instance("shamrock", "OP18-119")])
      .withTrash("p1", [
        instance("cerberus", "OP18-085"),
        instance("gunko", "OP18-084"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-119" });
    game.play({ type: "activate-main", cardNumber: "OP18-119" });
    answer(game, "cerberus");
    expect(ids(game.state.players.p1.board)).toEqual(["shamrock", "cerberus"]);
    expect(activated(game, "OP18-119")).toBe(false);
  });

  it("does nothing on a later turn", () => {
    const game = table("op18-119-later")
      .withBoard("p1", [character("shamrock", "OP18-119")])
      .withTrash("p1", [instance("cerberus", "OP18-085")])
      .build();

    if (activated(game, "OP18-119")) {
      game.play({ type: "activate-main", cardNumber: "OP18-119" });
      answer(game);
    }
    expect(ids(game.state.players.p1.board)).toEqual(["shamrock"]);
  });
});
