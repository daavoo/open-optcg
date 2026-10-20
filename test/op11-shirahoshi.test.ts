import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The (Green/Yellow) Shirahoshi feature deck, played through its own list.
 *
 * Topknot Neptunian's activation, Megalo's [Opponent's Turn] buff, Zeus and
 * Smoker's activation were already covered elsewhere. What this file adds is
 * the rest of the fifty's printed clauses, each behind OP11-022, and the loop
 * Bandai's write-up builds the deck around: the Leader turns a Life card
 * face-up to play a {Neptunian}, and the deck's other half turns it back down
 * so the Leader can go again next turn.
 */
const DECK = "(Green/Yellow) Shirahoshi - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

/** Vanilla opposing bodies, one per cost step the removal clauses draw. */
const COST_2 = "ST31-003";
const COST_3 = "OP10-054";
const COST_4 = "ST32-004";
const COST_5 = "ST14-010";
const COST_6 = "OP05-065";
const COST_7 = "OP10-050";

const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP11-022");

/** p2 to move, so p2 can declare an attack into p1. */
const defending = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withLeader("p1", "OP11-022");

type Game = ReturnType<ReturnType<typeof table>["build"]>;

/** The `resolve-effect` option ids open right now. */
const offered = (game: Game) =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId?: string }).optionId);

/** Answer every open prompt with the first of `preferred` offered, else the first offer. */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect && guard++ < 40) {
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

/**
 * Take each named option in turn while it is offered, and stop with the next
 * prompt still open -- so a test can read what that prompt offers. An
 * `optional` prompt is elided where applying and declining are
 * indistinguishable, so a missing "apply" is skipped rather than an error.
 */
function pick(game: Game, ...choices: string[]): void {
  for (const choice of choices) {
    if (offered(game).includes(choice)) {
      game.play({ type: "resolve-effect", optionId: choice });
    }
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

const onBoard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

describe("OP11-022 Shirahoshi (Leader)", () => {
  covers("OP11-022", "static", "[Activate: Main]");

  it("cannot attack", () => {
    const game = table("op11-022-static")
      .withBoard("p2", [character("rested", COST_3, { rested: true })])
      .build();

    const attacks = game
      .legalActions()
      .filter((action) => action.type === "attack")
      .map(
        (action) =>
          (action as { attackerInstanceId?: string }).attackerInstanceId,
      );
    expect(attacks).not.toContain("p1-leader");
  });

  it("rests 1 DON!! and turns a Life card face-up to play a {Neptunian} up to the DON!! count", () => {
    const game = table("op11-022-play")
      .withHand("p1", [
        instance("scaled", "OP11-026"),
        instance("jinbe", "OP11-031"),
        instance("megalo", "OP11-112"),
      ])
      .withLife("p1", [instance("life-1", COST_2), instance("life-2", COST_2)])
      .build();
    const restedBefore = game.state.players.p1.restedDon.length;

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    pick(game, "apply", "life-1");
    // Jinbe is a {Fish-Man}, not a {Neptunian}: the Leader cannot play it.
    expect(offered(game)).toEqual(expect.arrayContaining(["scaled", "megalo"]));
    expect(offered(game)).not.toContain("jinbe");
    answer(game, "scaled");

    expect(onBoard(game, "p1", "scaled")).toBeDefined();
    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore + 1);
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(ids(game.state.players.p1.hand)).toEqual(["jinbe", "megalo"]);
  });

  it("reads its ceiling off the DON!! on the field, not the DON!! left active", () => {
    const game = table("op11-022-ceiling")
      .withDonDeck("p1", 6)
      .withHand("p1", [
        instance("spotted", "OP11-036"),
        instance("longjaw", "OP11-103"),
      ])
      .withLife("p1", [instance("life-1", COST_2)])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    pick(game, "apply", "life-1");
    // Four DON!! on the field: a 4-cost is playable and a 5-cost is not.
    expect(offered(game)).toContain("spotted");
    expect(offered(game)).not.toContain("longjaw");
  });

  // Bandai's OP11-022 Q&A #1: the cost turns a face-down card face-up, so
  // with the top Life card already face-up the ability cannot be activated --
  // and it is not offered, which keeps its [Once Per Turn] for later in the
  // turn, once a {Neptunian} has turned the card back face-down.
  it("is not offered when the top Life card is already face-up", () => {
    const game = table("op11-022-face-up")
      .withHand("p1", [instance("scaled", "OP11-026")])
      .withLife("p1", [instance("life-1", COST_2, { faceUp: true })])
      .build();

    const activation = game
      .legalActions()
      .find(
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "p1-leader",
      );
    expect(activation).toBeUndefined();
  });
});

describe("Bandai's loop: the Leader plays a {Neptunian}, the {Neptunian} turns the Life card back", () => {
  it("plays Long-Jaw off the Leader and Long-Jaw turns the same Life card face-down for a K.O.", () => {
    const game = table("op11-shirahoshi-loop")
      .withHand("p1", [instance("longjaw", "OP11-103")])
      .withLife("p1", [instance("life-1", COST_2)])
      .withBoard("p2", [character("small", COST_3)])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    answer(game, "apply", "life-1", "longjaw");
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);

    game.play({ type: "activate-main", sourceInstanceId: "longjaw" });
    answer(game, "apply", "life-1", "small");

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    expect(onBoard(game, "p2", "small")).toBeUndefined();
  });
});

describe("OP11-030 Shirahoshi", () => {
  covers("OP11-030", "[Activate: Main]");

  it("rests 1 DON!! and itself to find a {Neptunian} or {Fish-Man Island} card", () => {
    const game = table("op11-030")
      .withBoard("p1", [character("shirahoshi", "OP11-030")])
      .withDeckTop("p1", [
        instance("scaled", "OP11-026"),
        instance("brook", COST_2),
        instance("smoker", "OP10-030"),
      ])
      .build();
    const restedBefore = game.state.players.p1.restedDon.length;

    game.play({ type: "activate-main", sourceInstanceId: "shirahoshi" });
    pick(game, "apply");
    expect(offered(game)).toContain("scaled");
    expect(offered(game)).not.toContain("brook");
    expect(offered(game)).not.toContain("smoker");
    answer(game, "scaled");

    expect(ids(game.state.players.p1.hand)).toEqual(["scaled"]);
    expect(onBoard(game, "p1", "shirahoshi")?.rested).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore + 1);
  });
});

describe("OP11-036 Spotted Neptunian", () => {
  covers("OP11-036", "[On Play]");

  it("finds a {Neptunian} or a [Shirahoshi] behind its own Leader", () => {
    const game = table("op11-036")
      .withHand("p1", [instance("spotted", "OP11-036")])
      .withDeckTop("p1", [
        instance("topknot", "OP11-107"),
        instance("shirahoshi", "OP11-030"),
        instance("neptune", "OP11-108"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-036" });
    expect(offered(game)).toEqual(
      expect.arrayContaining(["topknot", "shirahoshi"]),
    );
    // Neptune is a {Merfolk}, not a {Neptunian}.
    expect(offered(game)).not.toContain("neptune");
    answer(game, "shirahoshi");

    expect(ids(game.state.players.p1.hand)).toEqual(["shirahoshi"]);
  });

  it("looks at nothing behind another Leader", () => {
    const game = table("op11-036-other")
      .withLeader("p1", "OP11-021")
      .withHand("p1", [instance("spotted", "OP11-036")])
      .withDeckTop("p1", [instance("topknot", "OP11-107")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-036" });
    answer(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP11-100 Otohime", () => {
  covers("OP11-100", "[On Play]");

  it("turns a face-up Life card face-down to draw", () => {
    const game = table("op11-100")
      .withHand("p1", [instance("otohime", "OP11-100")])
      .withLife("p1", [instance("life-1", COST_2, { faceUp: true })])
      .withDeckTop("p1", [instance("drawn", COST_2)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-100" });
    answer(game, "apply", "life-1");

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  it("draws nothing when every Life card is already face-down", () => {
    const game = table("op11-100-down")
      .withHand("p1", [instance("otohime", "OP11-100")])
      .withLife("p1", [instance("life-1", COST_2)])
      .withDeckTop("p1", [instance("drawn", COST_2)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-100" });
    answer(game, "apply", "life-1");

    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP11-108 Neptune", () => {
  covers("OP11-108", "[On Play]");

  it("turns a face-up Life card face-down to draw 2 and trash 1", () => {
    const game = table("op11-108")
      .withHand("p1", [instance("neptune", "OP11-108")])
      .withLife("p1", [instance("life-1", COST_2, { faceUp: true })])
      .withDeckTop("p1", [
        instance("draw-1", COST_2),
        instance("draw-2", COST_3),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-108" });
    answer(game, "apply", "life-1", "draw-1");

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    expect(ids(game.state.players.p1.hand)).toEqual(["draw-2"]);
    expect(ids(game.state.players.p1.trash)).toContain("draw-1");
  });
});

describe("OP11-103 Long-Jaw Neptunian", () => {
  covers("OP11-103", "[Activate: Main]");

  it("rests itself and turns a Life card face-down to K.O. a 3-cost or less", () => {
    const game = table("op11-103")
      .withBoard("p1", [character("longjaw", "OP11-103")])
      .withLife("p1", [instance("life-1", COST_2, { faceUp: true })])
      .withBoard("p2", [character("small", COST_3), character("big", COST_4)])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "longjaw" });
    pick(game, "apply", "life-1");
    expect(offered(game)).toContain("small");
    expect(offered(game)).not.toContain("big");
    answer(game, "small");

    expect(onBoard(game, "p2", "small")).toBeUndefined();
    expect(onBoard(game, "p2", "big")).toBeDefined();
    expect(onBoard(game, "p1", "longjaw")?.rested).toBe(true);
    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
  });
});

describe("OP11-028 Lord of the Coast", () => {
  covers("OP11-028", "[On Play]", "[Trigger]");

  it("keeps a rested Character rested through its owner's next Refresh Phase", () => {
    const game = table("op11-028-on-play")
      .withHand("p1", [instance("lord", "OP11-028")])
      .withBoard("p2", [character("held", COST_7, { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-028" });
    answer(game, "held");
    game.pass();

    expect(game.state.activePlayer).toBe("p2");
    expect(onBoard(game, "p2", "held")?.rested).toBe(true);
  });

  it("K.O.s a rested 3-cost or less off a Life card", () => {
    const game = defending("op11-028-trigger")
      .withLife("p1", [instance("life-lord", "OP11-028")])
      .withBoard("p2", [
        character("small", COST_3, { rested: true }),
        character("big", COST_4, { rested: true }),
        character("awake", COST_2),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(offered(game)).toContain("small");
    expect(offered(game)).not.toContain("big");
    expect(offered(game)).not.toContain("awake");
    answer(game, "small");

    expect(onBoard(game, "p2", "small")).toBeUndefined();
  });
});

describe("OP11-031 Jinbe", () => {
  covers("OP11-031", "[On Play]", "[Activate: Main]");

  it("rests a 5-cost or less behind a {Merfolk} Leader", () => {
    const game = table("op11-031-on-play")
      .withHand("p1", [instance("jinbe", "OP11-031")])
      .withBoard("p2", [character("five", COST_5), character("six", COST_6)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-031" });
    expect(offered(game)).toContain("five");
    expect(offered(game)).not.toContain("six");
    answer(game, "five");

    expect(onBoard(game, "p2", "five")?.rested).toBe(true);
    expect(onBoard(game, "p2", "six")?.rested).toBeFalsy();
  });

  it("lets a {Fish-Man} or {Merfolk} Character attack a Character the turn it lands", () => {
    const game = table("op11-031-main")
      .withHand("p1", [instance("jinbe", "OP11-031")])
      .withBoard("p2", [character("target", COST_3, { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-031" });
    answer(game);
    expect(hasKeyword(game.state, "p1", "jinbe", "Rush: Character")).toBe(
      false,
    );

    game.play({ type: "activate-main", sourceInstanceId: "jinbe" });
    answer(game, "jinbe");

    expect(hasKeyword(game.state, "p1", "jinbe", "Rush: Character")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "target",
    });
    expect(game.state.activeAttack?.attackerInstanceId).toBe("jinbe");
  });
});

describe("The deck's two [Blocker]s", () => {
  covers("OP11-112", "[Blocker]");
  covers("OP11-107", "[Blocker]");

  for (const [name, cardNumber] of [
    ["Megalo", "OP11-112"],
    ["Topknot Neptunian", "OP11-107"],
  ] as const) {
    it(`${name} takes an attack aimed at the Leader`, () => {
      const game = defending(`blocker-${cardNumber}`)
        .withBoard("p1", [character("blocker", cardNumber)])
        .withLife("p1", [instance("life-1", COST_2)])
        .build();

      game.play({
        type: "attack",
        attackerInstanceId: "p2-leader",
        targetInstanceId: "p1-leader",
      });
      game.play({ type: "block", blockerInstanceId: "blocker" });

      expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
      expect(onBoard(game, "p1", "blocker")?.rested).toBe(true);
    });
  }

  it("Megalo blocks at 6000 behind Shirahoshi", () => {
    const game = defending("blocker-megalo-power")
      .withBoard("p1", [character("megalo", "OP11-112")])
      .withLife("p1", [instance("life-1", COST_2)])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "megalo" });

    expect(currentPower(game.state, "p1", "megalo")).toBe(6_000);
  });
});

describe("OP11-115 You're Just Not My Type!", () => {
  covers("OP11-115", "[Counter]", "[Trigger]");

  it("[Counter] gives +4000 for the battle behind Shirahoshi", () => {
    const game = defending("op11-115-counter")
      .withHand("p1", [instance("not-my-type", "OP11-115")])
      .withLife("p1", [instance("life-1", COST_2)])
      .withDon("p1", { active: 1 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP11-115" });
    answer(game, "p1-leader");

    expect(game.state.activeAttack?.counterPower ?? 0).toBe(4_000);
  });

  it("[Trigger] K.O.s a 2-cost or less", () => {
    const game = defending("op11-115-trigger")
      .withLife("p1", [instance("life-type", "OP11-115")])
      .withBoard("p2", [character("two", COST_2), character("three", COST_3)])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(offered(game)).toContain("two");
    expect(offered(game)).not.toContain("three");
    answer(game, "two");

    expect(onBoard(game, "p2", "two")).toBeUndefined();
  });
});

describe("OP10-030 Smoker's [Banish]", () => {
  covers("OP10-030", "[Banish]");

  it("trashes the damaged Life card without opening its Trigger window", () => {
    const game = table("op10-030-banish")
      .withBoard("p1", [character("smoker", "OP10-030", { playedTurn: 1 })])
      .withLife("p2", [instance("banished", "OP11-115")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "smoker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    expect(game.state.pendingTrigger).toBeNull();
    expect(game.state.players.p2.life).toHaveLength(0);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(ids(game.state.players.p2.trash)).toEqual(["banished"]);
  });
});
