import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The (Green) Jinbe feature deck, played through its own list.
 *
 * Bandai's write-up builds the deck on the Leader's `[End of Your Turn]`: one
 * {Fish-Man} or {Merfolk} body and one DON!! set active, so the deck blocks and
 * pays on the opponent's turn. The DON!! it keeps is what OP11-024 Aladine and
 * OP11-035 Fisher Tiger rest to replace themselves when an opponent's effect
 * K.O.s them, and what a 1-cost Counter Event costs. Each clause is driven
 * behind OP11-021, the {Fish-Man} Leader the gates name.
 */
const DECK = "(Green) Jinbe - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active })
    .bareTable()
    .withLeader("p1", "OP11-021");

type Game = ReturnType<ReturnType<typeof table>["build"]>;

/** The ids of the open decision's options. */
const offers = (game: Game): string[] =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId: string }).optionId);

/**
 * Settle the pending effect, taking the first of `preferred` that is on offer
 * at each step and the engine's first option otherwise.
 */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 20) throw new Error("the effect never settled");
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

/** Decline the block and the Counter step, so a declared attack resolves. */
function undefended(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const onBoard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

/** OP08-117 Burn Blade: the opponent's effect K.O. of a cost 7 or less. */
const burnBlade = (seed: string) =>
  table(seed, "p2")
    .withHand("p2", [instance("burn", "OP08-117")])
    .withLife("p2", [instance("p2-life", "ST32-005")]);

/** Play Burn Blade at `target`, stopping at the K.O.'d player's answer. */
function burn(game: Game, target: string): void {
  game.play({ type: "activate-main", cardNumber: "OP08-117" });
  let guard = 0;
  while (
    game.state.players.p1.board.some((card) => card.instanceId === target)
  ) {
    if (guard++ > 10) throw new Error("the K.O. never landed");
    const options = offers(game);
    game.play({
      type: "resolve-effect",
      optionId:
        [target, "apply", "p2-life"].find((id) => options.includes(id)) ??
        options[0]!,
    });
  }
}

describe("OP11-021 Jinbe (Leader)", () => {
  covers("OP11-021", "[End of Your Turn]");

  it("sets a rested {Fish-Man} or {Merfolk} Character and a DON!! active", () => {
    const game = table("op11-021-end")
      .withDonDeck("p1", 7)
      .withDon("p1", { rested: 3 })
      .withBoard("p1", [character("tiger", "OP11-035", { rested: true })])
      .withHand("p1", [instance("held", "OP11-033")])
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(3);

    game.pass();
    answer(game, "tiger");

    expect(onBoard(game, "p1", "tiger")?.rested).toBe(false);
    expect(game.state.players.p1.activeDon).toHaveLength(4);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("sets nothing active with 7 cards in hand", () => {
    const game = table("op11-021-full-hand")
      .withDonDeck("p1", 7)
      .withDon("p1", { rested: 3 })
      .withBoard("p1", [character("tiger", "OP11-035", { rested: true })])
      .withHand(
        "p1",
        Array.from({ length: 7 }, (_, index) =>
          instance(`held-${index}`, "OP11-033"),
        ),
      )
      .build();

    game.pass();
    answer(game);

    expect(onBoard(game, "p1", "tiger")?.rested).toBe(true);
    expect(game.state.players.p1.activeDon).toHaveLength(3);
  });

  it("does not set a Character of another type active", () => {
    const game = table("op11-021-other-type")
      .withBoard("p1", [
        // OP11-033 Bird Neptunian is a {Neptunian}, neither type the gate names.
        character("bird", "OP11-033", { rested: true }),
      ])
      .build();

    game.pass();
    answer(game, "bird");

    expect(onBoard(game, "p1", "bird")?.rested).toBe(true);
  });
});

describe("OP10-032 Tashigi", () => {
  covers("OP10-032", "static");

  it("rests itself instead of another green Character leaving to the opponent's effect", () => {
    const game = table("op10-032-replace", "p2")
      .withBoard("p1", [
        character("tashigi", "OP10-032"),
        character("bird", "OP11-033"),
      ])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP09-058" });
    game.play({ type: "resolve-effect", optionId: "bird" });
    expect(offers(game)).toContain("replace:tashigi");
    game.play({ type: "resolve-effect", optionId: "replace:tashigi" });
    answer(game);

    expect(onBoard(game, "p1", "bird")).toBeDefined();
    expect(onBoard(game, "p1", "tashigi")?.rested).toBe(true);
    expect(game.state.players.p1.hand).toEqual([]);
  });

  it("does not answer its own removal", () => {
    const game = table("op10-032-self", "p2")
      .withBoard("p1", [character("tashigi", "OP10-032")])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP09-058" });
    game.play({ type: "resolve-effect", optionId: "tashigi" });
    expect(offers(game).some((id) => id.startsWith("replace:"))).toBe(false);
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["tashigi"]);
  });

  it("cannot pay once it is rested", () => {
    const game = table("op10-032-rested", "p2")
      .withBoard("p1", [
        character("tashigi", "OP10-032", { rested: true }),
        character("bird", "OP11-033"),
      ])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP09-058" });
    game.play({ type: "resolve-effect", optionId: "bird" });
    expect(offers(game).some((id) => id.startsWith("replace:"))).toBe(false);
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["bird"]);
  });
});

describe("OP11-024 Aladine", () => {
  covers("OP11-024", "static");

  it("trashes a card and rests a DON!! to play a {Fish-Man} from hand when the opponent's effect K.O.s it", () => {
    const game = burnBlade("op11-024-ko")
      .withBoard("p1", [character("aladine", "OP11-024")])
      .withHand("p1", [
        instance("pitch", "OP11-033"),
        instance("jinbe", "OP11-031"),
      ])
      .build();

    burn(game, "aladine");
    expect(offers(game)).toContain("apply");
    answer(game, "apply", "pitch", "jinbe");

    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["aladine", "pitch"]),
    );
    expect(onBoard(game, "p1", "jinbe")).toBeDefined();
    expect(game.state.players.p1.hand).toEqual([]);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("is not offered without an active DON!!", () => {
    const game = burnBlade("op11-024-no-don")
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 4 })
      .withBoard("p1", [character("aladine", "OP11-024")])
      .withHand("p1", [
        instance("pitch", "OP11-033"),
        instance("jinbe", "OP11-031"),
      ])
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(0);

    burn(game, "aladine");
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["pitch", "jinbe"]);
  });

  it("does nothing when it loses a fight", () => {
    const game = table("op11-024-battle", "p2")
      .withBoard("p1", [character("aladine", "OP11-024", { rested: true })])
      .withHand("p1", [
        instance("pitch", "OP11-033"),
        instance("jinbe", "OP11-031"),
      ])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "aladine",
    });
    undefended(game);
    expect(offers(game)).not.toContain("apply");
    answer(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["aladine"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["pitch", "jinbe"]);
  });
});

describe("OP11-035 Fisher Tiger", () => {
  covers("OP11-035", "static");

  it("rests a DON!! to play a {Merfolk} of cost 4 or less when the opponent's effect K.O.s it", () => {
    const game = burnBlade("op11-035-ko")
      .withBoard("p1", [character("tiger", "OP11-035")])
      .withHand("p1", [
        instance("jinbe", "OP11-031"),
        instance("aladine", "OP11-024"),
      ])
      .build();

    burn(game, "tiger");
    expect(offers(game)).toContain("apply");
    answer(game, "apply", "aladine");

    expect(onBoard(game, "p1", "aladine")).toBeDefined();
    // OP11-031 is a 6-cost: past the ceiling.
    expect(ids(game.state.players.p1.hand)).toEqual(["jinbe"]);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  covers("OP11-035", "[On Play]");

  it("rests any one of the opponent's Characters", () => {
    const game = table("op11-035-on-play")
      .withHand("p1", [instance("tiger", "OP11-035")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-035" });
    answer(game, "oden");

    expect(onBoard(game, "p2", "oden")?.rested).toBe(true);
  });
});

describe("OP11-029 Charlotte Praline", () => {
  covers("OP11-029", "[On Play]");

  it("rests an opposing Character of cost 1 or less", () => {
    const game = table("op11-029-on-play")
      .withHand("p1", [instance("praline", "OP11-029")])
      .withBoard("p2", [
        character("zoro", "ST32-005"),
        character("rayleigh", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-029" });
    expect(offers(game)).not.toContain("rayleigh");
    answer(game, "zoro");

    expect(onBoard(game, "p2", "zoro")?.rested).toBe(true);
    expect(onBoard(game, "p2", "rayleigh")?.rested).toBe(false);
  });

  covers("OP11-029", "[Blocker]");

  it("blocks an attack on the Leader", () => {
    const game = table("op11-029-block", "p2")
      .withBoard("p1", [character("praline", "OP11-029")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "praline" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("praline");
    expect(onBoard(game, "p1", "praline")?.rested).toBe(true);
  });
});

describe("OP11-030 Shirahoshi", () => {
  covers("OP11-030", "[Activate: Main]");

  it("rests a DON!! and itself to add a {Neptunian} from the top 5", () => {
    const game = table("op11-030-search")
      .withBoard("p1", [character("shirahoshi", "OP11-030")])
      .withDeckTop("p1", [
        instance("tiger", "OP11-035"),
        instance("bird", "OP11-033"),
        instance("smoker", "OP10-030"),
        instance("tashigi", "OP10-032"),
        instance("camie", "OP06-025"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "shirahoshi" });
    // OP11-035 is {Fish-Man Island}, the other type the search names, so the
    // pick is a real choice rather than the only eligible card.
    answer(game, "apply", "bird");

    expect(ids(game.state.players.p1.hand)).toEqual(["bird"]);
    expect(onBoard(game, "p1", "shirahoshi")?.rested).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe("OP11-031 Jinbe", () => {
  covers("OP11-031", "[On Play]");

  it("rests an opposing Character of cost 5 or less behind a {Fish-Man} Leader", () => {
    const game = table("op11-031-on-play")
      .withHand("p1", [instance("jinbe", "OP11-031")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-031" });
    answer(game, "oden");

    expect(onBoard(game, "p2", "oden")?.rested).toBe(true);
  });

  covers("OP11-031", "[Activate: Main]");

  it("lets a {Fish-Man} played this turn attack a Character", () => {
    const game = table("op11-031-activate")
      .withBoard("p1", [character("jinbe", "OP11-031")])
      .withHand("p1", [instance("tiger", "OP11-035")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-035" });
    // Fisher Tiger's own [On Play] rests the target it is about to attack.
    answer(game, "oden");
    const attacksOden = () =>
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "tiger" &&
            (action as { targetInstanceId?: string }).targetInstanceId ===
              "oden",
        );
    expect(attacksOden()).toBe(false);

    game.play({ type: "activate-main", sourceInstanceId: "jinbe" });
    answer(game, "tiger");

    expect(attacksOden()).toBe(true);
  });
});

describe("OP10-030 Smoker", () => {
  covers("OP10-030", "[Banish]");

  it("trashes the Life card it hits without its [Trigger]", () => {
    const game = table("op10-030-banish")
      .withBoard("p1", [character("smoker", "OP10-030")])
      .withLife("p2", [instance("drill", "OP11-039")])
      .build();

    expect(hasKeyword(game.state, "p1", "smoker", "Banish")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "smoker",
      targetInstanceId: "p2-leader",
    });
    undefended(game);
    answer(game);

    expect(game.state.players.p2.life).toEqual([]);
    expect(ids(game.state.players.p2.trash)).toEqual(["drill"]);
    expect(game.state.players.p2.hand).toEqual([]);
  });
});

describe("OP11-038 Gum-Gum Elephant Gatling", () => {
  covers("OP11-038", "[Main]");

  it("rests a DON!! to rest an opposing Character of cost 5 or less", () => {
    const game = table("op11-038-main")
      .withHand("p1", [instance("gatling", "OP11-038")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP11-038" });
    answer(game, "apply", "oden");

    expect(onBoard(game, "p2", "oden")?.rested).toBe(true);
    // One DON!! for the Event's cost, one for its own.
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  covers("OP11-038", "[Counter]");

  it("gives the Leader +3000 for the battle", () => {
    const game = table("op11-038-counter", "p2")
      .withHand("p1", [instance("gatling", "OP11-038")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "gatling" });
    answer(game, "p1-leader");

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("OP11-039 Vagabond Drill", () => {
  covers("OP11-039", "[Counter]");

  it("gives the {Fish-Man} Leader +3000 and rests an attacker of cost 3 or less", () => {
    const game = table("op11-039-counter", "p2")
      .withHand("p1", [instance("drill", "OP11-039")])
      .withBoard("p2", [
        character("oden", "ST32-002"),
        character("zoro", "ST32-005"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "drill" });
    answer(game, "p1-leader", "zoro");

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(onBoard(game, "p2", "zoro")?.rested).toBe(true);
  });

  covers("OP11-039", "[Trigger]");

  it("rests an opposing Character of cost 4 or less off a Life card", () => {
    const game = table("op11-039-trigger", "p2")
      .withLife("p1", [instance("drill", "OP11-039")])
      .withBoard("p2", [
        character("oden", "ST32-002"),
        character("rayleigh", "ST32-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "p1-leader",
    });
    undefended(game);
    game.play({ summary: "Activate Trigger" });
    answer(game, "rayleigh");

    expect(onBoard(game, "p2", "rayleigh")?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });
});
