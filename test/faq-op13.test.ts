import { describe, expect, it } from "vitest";
import {
  createGame,
  currentPower,
  effectiveCost,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-13 "Carrying On His Will", one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order the PDF prints them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. A ruling the engine disagrees with is an `it.fails`
 * that says what the engine does instead: it turns green -- and so red under
 * `it.fails` -- the day the engine is fixed, which is the prompt to promote it.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op13.pdf
 */

/** Rulings with no engine decision and no observable consequence to assert. */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ZORO = "(Green) Roronoa Zoro - Starter Deck 32";
const LUFFY = "(Red/Green) Monkey.D.Luffy - Open OPTCG";
const ACE = "(Red/Blue) Portgas.D.Ace - Official Feature Deck";
const ROGER = "(Red/Purple) Gol.D.Roger - Official Feature Deck";
const IMU = "(Black) Imu - Official Feature Deck";
const REBECCA = "(Blue) Rebecca - Official Feature Deck";

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Answers each prompt with the first of `preferred` on offer, else the first option. */
function settle(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    const options = effectOptions(game);
    const pick = preferred.find((id) => options.includes(id));
    game.play(
      pick
        ? { type: "resolve-effect", optionId: pick }
        : { type: "resolve-effect" },
    );
  }
}

/** Answers "apply" until a prompt offers something other than apply/skip/done. */
function untilChoice(game: Game): void {
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game).every((option) =>
      ["apply", "skip", "done"].includes(option),
    )
  ) {
    if (guard++ > 20) throw new Error("no card choice was offered");
    const options = effectOptions(game);
    game.play({
      type: "resolve-effect",
      optionId: options.includes("apply") ? "apply" : options[0]!,
    });
  }
}

/** The replacement offer whose summary names `label`, if any. */
const replacement = (game: Game, label: string) =>
  game
    .legalActions()
    .find(
      (action) =>
        action.type === "resolve-effect" && action.summary.includes(label),
    );

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

const attack = (game: Game, attacker: string, target: string) =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

/** Passes the Block and Counter steps until the Life Trigger is offered. */
function toTrigger(game: Game): void {
  let guard = 0;
  while (!game.state.pendingTrigger) {
    if (guard++ > 10) throw new Error("no Trigger was offered");
    game.pass();
  }
}

/** Plays out whatever is left of the battle with no answers. */
function finishBattle(game: Game): void {
  let guard = 0;
  while (
    game.state.activeAttack ||
    game.state.pendingEffect ||
    game.state.pendingTrigger
  ) {
    if (guard++ > 40) throw new Error("battle never settled");
    if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    else if (game.state.pendingTrigger) {
      game.play({ type: "resolve-trigger", optionId: "decline" });
    } else game.pass();
  }
}

const canActivate = (game: Game, sourceInstanceId: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === sourceInstanceId,
    );

const canAttackWith = (game: Game, attacker: string) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === attacker,
    );

const table = (p1: string, p2: string, seed: string) =>
  scenario().decks(p1, p2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

const defending = (p1: string, p2: string, seed: string) =>
  scenario().decks(p1, p2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

/**
 * p2 plays OP16-006 Shanks and spends its [On Play] -- rest 2 DON!!, K.O. a
 * Character with 4000 power or less -- on `target`: the opponent's effect a
 * K.O. replacement answers.
 */
function shanksKo(game: Game, target: string): void {
  game.play({ type: "play-card", cardNumber: "OP16-006" });
  game.play({ type: "resolve-effect", optionId: "apply" });
  game.play({ type: "resolve-effect", optionId: target });
}

describe("FAQ OP-13 red", () => {
  it("OP13-001#1: the Leader's [On Your Opponent's Attack] is spent before a [Counter] drops the active DON!! to 5", () => {
    // One DON!! given to the Leader for its [DON!! x1]; six left active.
    const game = defending(LUFFY, ZORO, "faq-op13-001-1")
      .withGivenDon("p1", "p1-leader", 1)
      .withDonDeck("p1", 3)
      // OP13-077's [Counter] costs 1.
      .withHand("p1", [instance("counter", "OP13-077")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(6);

    attack(game, "attacker", "p1-leader");
    expect(effectOptions(game, "p1")).not.toContain("apply");
    game.pass(); // no block
    game.play({ type: "activate-counter-event", eventInstanceId: "counter" });
    settle(game);

    expect(game.state.players.p1.activeDon).toHaveLength(5);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("OP13-002#1 / OP13-002#2: a [Trigger] resolves before the Leader's damage draw, with no choice of order", () => {
    // OP13-109 Jewelry Bonney's [Trigger] draws 2 and trashes 1: if the
    // Leader's draw came first, the trash would choose among three cards.
    const game = defending(ACE, ZORO, "faq-op13-002-1")
      .withGivenDon("p1", "p1-leader", 1)
      .withLife("p1", [instance("bonney", "OP13-109")])
      .withDeckTop("p1", [
        instance("d1", "OP13-045"),
        instance("d2", "OP13-045"),
        instance("d3", "OP13-045"),
      ])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    expect(ids(game.state.players.p1.hand)).toEqual([]);
    game.play({ type: "resolve-trigger", optionId: "activate" });

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["d1", "d2"]);
    expect(effectOptions(game, "p1").sort()).toEqual(["d1", "d2"]);
    game.play({ type: "resolve-effect", optionId: "d1" });
    settle(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["d2", "d3"]);
  });

  it("OP13-003#1: the DON!! placed on the first turn stays in the cost area", () => {
    const game = scenario()
      .decks(ROGER, ZORO)
      .seed("faq-op13-003-1")
      .atTurn(1, { active: "p1" })
      .build();

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(game.state.players.p1.activeDon).toHaveLength(1);
  });

  it("OP13-008#1: Ivankov may trash itself in place of its own K.O., and nothing K.O.-keyed fires", () => {
    const game = defending(ST31, ZORO, "faq-op13-008-1")
      .withBoard("p1", [character("ivankov", "OP13-008")])
      .withHand("p2", [instance("shanks", "OP16-006")])
      .build();

    shanksKo(game, "ivankov");
    const offer = replacement(game, "Trash Emporio.Ivankov");
    expect(offer).toBeDefined();
    game.submit(offer!);
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["ivankov"]);
    expect(
      game.state.events.some((event) => event.type === "character-ko"),
    ).toBe(false);
  });

  it("OP13-012#1: Vivi cannot add an {Alabasta} card with a cost of 1", () => {
    const game = table(ST31, ZORO, "faq-op13-012-1")
      .withHand("p1", [instance("vivi", "OP13-012")])
      .withDeckTop("p1", [
        instance("cheap-vivi", "OP13-012"), // {Alabasta}, cost 1
        instance("koza", "EB01-004"), // {Alabasta}, cost 2
        instance("brook", "OP13-034"), // {Straw Hat Crew}, cost 3
        instance("filler", "OP10-054"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-012" });
    untilChoice(game);
    const options = effectOptions(game);
    expect(options).toContain("koza");
    expect(options).toContain("brook");
    expect(options).not.toContain("cheap-vivi");
  });

  it("OP13-017#1: Dragon may take its -2000 at 2000 power", () => {
    // OP13-020 Meteor Fist takes the 7000 Dragon to 2000 first.
    const game = defending(ST31, ZORO, "faq-op13-017-1")
      .withBoard("p1", [character("dragon", "OP13-017")])
      .withHand("p2", [
        instance("meteor", "OP13-020"),
        instance("shanks", "OP16-006"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP13-020" });
    settle(game, "dragon");
    expect(currentPower(game.state, "p1", "dragon")).toBe(2_000);

    shanksKo(game, "dragon");
    const offer = replacement(game, "Give Monkey.D.Dragon -2000 power");
    expect(offer).toBeDefined();
    game.submit(offer!);
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["dragon"]);
    expect(currentPower(game.state, "p1", "dragon")).toBe(0);
  });
});

describe("FAQ OP-13 green", () => {
  it("OP13-023#1: Uta K.O.'d the turn its [On Play] ran cannot play a cost-5 Character", () => {
    // p2's Life is OP11-018 Honesty Impact, whose [Trigger] K.O.s a Character
    // with 6000 power or less: Uta, on the turn it was played.
    const game = table(ZORO, ST31, "faq-op13-023-1")
      .withHand("p1", [
        instance("uta", "OP13-023"),
        instance("koby", "OP13-025"), // cost 5
        instance("brook", "OP13-034"), // cost 3
      ])
      .withLife("p2", [instance("honesty", "OP11-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-023" });
    settle(game);
    attack(game, "p1-leader", "p2-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "uta" });
    expect(ids(game.state.players.p1.trash)).toContain("uta");

    // The choice still lists Koby; the play itself is what the ban refuses.
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "koby" });
    settle(game);

    expect(ids(game.state.players.p1.board)).not.toContain("koby");
    expect(ids(game.state.players.p1.hand)).toContain("koby");
  });

  it("OP13-028#1: after Shanks, a Character can still be played from hand by an effect", () => {
    // EB03-062 Trafalgar Law trashes a hand card and itself, adds the deck's
    // top card to Life, then plays a [Trafalgar Law] of cost 7 or less from
    // hand.
    const game = table(ZORO, ST31, "faq-op13-028-1")
      .withBoard("p1", [character("eb-law", "EB03-062")])
      .withHand("p1", [
        instance("shanks", "OP13-028"),
        instance("fodder", "OP10-054"),
        instance("law", "OP12-106"),
      ])
      .withDeckTop("p1", [instance("top", "OP10-054")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-028" });
    settle(game);
    expect(
      game.legalActions().filter((action) => action.type === "play-card"),
    ).toEqual([]);

    game.play({ type: "activate-main", sourceInstanceId: "eb-law" });
    settle(game, "apply", "fodder", "law");

    expect(ids(game.state.players.p1.board)).toContain("law");
  });

  it("OP13-031#1: Law may return itself and still play a cost-5-or-less Character rested", () => {
    const game = table(ZORO, ST31, "faq-op13-031-1")
      .withHand("p1", [
        instance("law", "OP13-031"),
        instance("brook", "OP13-034"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-031" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("law");
    game.play({ type: "resolve-effect", optionId: "law" });
    expect(effectOptions(game)).toContain("brook");
    game.play({ type: "resolve-effect", optionId: "brook" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["law"]);
    expect(ids(game.state.players.p1.board)).toEqual(["brook"]);
    expect(boardCard(game, "p1", "brook")?.rested).toBe(true);
  });

  describe("OP13-032 Nico Robin: cannot be rested", () => {
    /** p1 plays Robin and locks `target` on p2's board. */
    const robinLocks = (
      seed: string,
      target: string,
      p2Board: ReturnType<typeof character>[],
      p2Deck = ST31,
    ) => {
      const game = table(ZORO, p2Deck, seed)
        .withHand("p1", [
          instance("robin", "OP13-032"),
          instance("elephant", "OP13-038"),
        ])
        .withBoard("p2", p2Board)
        .withLife("p2", copies(2, "OP10-054", "p2-life"))
        .withDeckTop("p1", copies(2, "OP10-054", "p1-deck"))
        .withDeckTop("p2", copies(2, "OP10-054", "p2-deck"))
        .build();
      game.play({ type: "play-card", cardNumber: "OP13-032" });
      untilChoice(game);
      game.play({ type: "resolve-effect", optionId: target });
      settle(game);
      return game;
    };

    it("OP13-032#1: the locked Character cannot attack", () => {
      const game = robinLocks("faq-op13-032-1", "usopp", [
        character("usopp", "OP11-003"),
        character("gilly", "OP10-054"),
      ]);
      game.pass();

      expect(game.player).toBe("p2");
      expect(canAttackWith(game, "usopp")).toBe(false);
      expect(canAttackWith(game, "gilly")).toBe(true);
    });

    it("OP13-032#2: the locked Character cannot pay a rest-this-Character [Activate: Main]", () => {
      // OP13-015 Makino rests herself to give a [Monkey.D.Luffy] +2000; p2's
      // ST31 Leader is one.
      const game = robinLocks("faq-op13-032-2", "makino", [
        character("makino", "OP13-015"),
      ]);
      game.pass();
      expect(game.player).toBe("p2");
      expect(canActivate(game, "makino")).toBe(false);

      const control = table(ZORO, ST31, "faq-op13-032-2-control")
        .withBoard("p2", [character("makino", "OP13-015")])
        .withDeckTop("p1", copies(2, "OP10-054", "p1-deck"))
        .withDeckTop("p2", copies(2, "OP10-054", "p2-deck"))
        .build();
      control.pass();
      expect(canActivate(control, "makino")).toBe(true);
    });

    it("OP13-032#3: the locked Character cannot [Blocker]", () => {
      // OP13-120 Sabo has [Blocker] and costs 6.
      const game = robinLocks("faq-op13-032-3", "sabo", [
        character("sabo", "OP13-120"),
      ]);
      expect(hasKeyword(game.state, "p2", "sabo", "Blocker")).toBe(true);

      attack(game, "p1-leader", "p2-leader");
      expect(game.player).toBe("p2");
      expect(
        game.legalActions().some((action) => action.type === "block"),
      ).toBe(false);
    });

    it("OP13-032#4: the locked Character cannot be rested by another card's effect", () => {
      // OP13-038 Gum-Gum Elephant Gun rests a Character with a cost of 5 or
      // less; OP11-003 Usopp costs 5.
      const game = robinLocks("faq-op13-032-4", "usopp", [
        character("usopp", "OP11-003"),
      ]);

      game.play({ type: "activate-main", sourceInstanceId: "elephant" });
      settle(game, "usopp");
      expect(boardCard(game, "p2", "usopp")?.rested).toBe(false);

      const control = table(ZORO, ST31, "faq-op13-032-4-control")
        .withHand("p1", [instance("elephant", "OP13-038")])
        .withBoard("p2", [character("usopp", "OP11-003")])
        .build();
      control.play({ type: "activate-main", sourceInstanceId: "elephant" });
      settle(control, "usopp");
      expect(boardCard(control, "p2", "usopp")?.rested).toBe(true);
    });
  });

  it("OP13-033#1: Franky's [On K.O.] reaches the opponent's Stage and DON!! cards", () => {
    // p2's Leader rests to attack, which leaves a Stage and ten active DON!!.
    const game = defending(ZORO, ST31, "faq-op13-033-1")
      .withBoard("p1", [character("franky", "OP13-033", { rested: true })])
      .withStage("p2", instance("village", "OP13-022"))
      .build();

    attack(game, "p2-leader", "franky");
    let guard = 0;
    while (!game.state.pendingEffect) {
      if (guard++ > 10) throw new Error("Franky's [On K.O.] never came");
      game.pass();
    }
    expect(game.player).toBe("p1");
    const options = effectOptions(game, "p1");
    expect(options).toContain("village");
    game.play({ type: "resolve-effect", optionId: "village" });
    const don = effectOptions(game, "p1").find(
      (option) => option !== "done" && option !== "village",
    );
    expect(don).toBeDefined();
    game.play({ type: "resolve-effect", optionId: don! });
    settle(game);

    expect(game.state.players.p2.stage?.rested).toBe(true);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
  });
});

describe("FAQ OP-13 blue", () => {
  describe("OP13-042 Edward.Newgate", () => {
    /** Newgate is played with nine rested DON!! and one more to pay with. */
    const newgate = (seed: string) => {
      const game = table(ST31, ZORO, seed)
        .withHand("p1", [instance("newgate", "OP13-042")])
        .withBoard("p1", [
          character("haruta", "OP13-045"),
          character("teach", "OP13-053"),
        ])
        .withDeckTop("p1", [
          instance("d1", "OP10-054"),
          instance("d2", "OP10-054"),
        ])
        .build();
      game.play({ type: "play-card", cardNumber: "OP13-042" });
      game.play({ type: "resolve-effect", optionId: "d1" });
      return game;
    };

    it("OP13-042#1: 2 rested DON!! to the Leader and 2 to one Character", () => {
      const game = newgate("faq-op13-042-1");
      game.play({ type: "resolve-effect", optionId: "apply" });
      game.play({ type: "resolve-effect", optionId: "haruta" });
      settle(game);

      expect(game.state.players.p1.leaderAttachedDon).toHaveLength(2);
      expect(boardCard(game, "p1", "haruta")?.attachedDon).toHaveLength(2);
    });

    it("OP13-042#2: the Character half reaches one Character, not two", () => {
      const game = newgate("faq-op13-042-2");
      game.play({ type: "resolve-effect", optionId: "skip" });
      game.play({ type: "resolve-effect", optionId: "haruta" });

      expect(game.state.pendingEffect).toBeNull();
      expect(boardCard(game, "p1", "haruta")?.attachedDon).toHaveLength(2);
      expect(boardCard(game, "p1", "teach")?.attachedDon ?? []).toHaveLength(0);
    });
  });

  it("OP13-047#1: Fossa may trash itself in place of its own K.O., and nothing K.O.-keyed fires", () => {
    const game = defending(ST31, ZORO, "faq-op13-047-1")
      .withBoard("p1", [character("fossa", "OP13-047")])
      .withHand("p2", [instance("shanks", "OP16-006")])
      .build();

    shanksKo(game, "fossa");
    const offer = replacement(game, "Trash Fossa");
    expect(offer).toBeDefined();
    game.submit(offer!);
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["fossa"]);
    expect(
      game.state.events.some((event) => event.type === "character-ko"),
    ).toBe(false);
  });

  it("OP13-051#1: Hancock's [On K.O.] draws 2 behind OP07-038 Boa Hancock", () => {
    const game = defending(ST31, ZORO, "faq-op13-051-1")
      .withLeader("p1", "OP07-038")
      .withBoard("p1", [character("hancock", "OP13-051", { rested: true })])
      .withDeckTop("p1", [
        instance("d1", "OP10-054"),
        instance("d2", "OP10-054"),
        instance("d3", "OP10-054"),
      ])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "hancock");
    finishBattle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["hancock"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["d1", "d2"]);
  });

  it("OP13-053#1: Teach may trash itself for its cost, still draws, and its battle ends", () => {
    const game = table(ST31, ZORO, "faq-op13-053-1")
      .withBoard("p1", [character("teach", "OP13-053")])
      .withDeckTop("p1", [instance("drawn", "OP10-054")])
      .withLife("p2", [instance("p2-life", "OP10-054")])
      .build();

    attack(game, "teach", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game)).toContain("teach");
    game.play({ type: "resolve-effect", optionId: "teach" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["teach"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    finishBattle(game);
    expect(ids(game.state.players.p2.life)).toEqual(["p2-life"]);
  });

  it("OP13-054#1: at 4 Life, Yamato gives no DON!! to the Leader either", () => {
    const game = table(ST31, ZORO, "faq-op13-054-1")
      .withHand("p1", [instance("yamato", "OP13-054")])
      .withLife("p1", copies(4, "OP10-054", "life"))
      .withDeckTop("p1", copies(2, "OP10-054", "deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-054" });
    settle(game, "apply");

    expect(game.state.players.p1.restedDon).toHaveLength(5);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("FAQ OP-13 purple", () => {
  it("OP13-060#1: Toki may trash herself in place of her own K.O., and nothing K.O.-keyed fires", () => {
    const game = defending(ROGER, ZORO, "faq-op13-060-1")
      .withBoard("p1", [character("toki", "OP13-060")])
      .withHand("p2", [instance("shanks", "OP16-006")])
      .build();

    shanksKo(game, "toki");
    const offer = replacement(game, "Trash Amatsuki Toki");
    expect(offer).toBeDefined();
    game.submit(offer!);
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["toki"]);
    expect(
      game.state.events.some((event) => event.type === "character-ko"),
    ).toBe(false);
  });

  it("OP13-064#1: Roger's -2000 does not reach a Character played on the opponent's next turn", () => {
    const game = table(ROGER, ZORO, "faq-op13-064-1")
      .withHand("p1", [instance("roger", "OP13-064")])
      .withBoard("p2", [character("hack", "OP05-012")]) // 5000
      .withHand("p2", [instance("gilly", "OP10-054")]) // 5000
      .withDeckTop("p1", copies(2, "OP10-054", "p1-deck"))
      .withDeckTop("p2", copies(2, "OP05-012", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-064" });
    settle(game, "apply");
    expect(currentPower(game.state, "p2", "hack")).toBe(3_000);

    game.pass();
    expect(game.player).toBe("p2");
    expect(currentPower(game.state, "p2", "hack")).toBe(3_000);
    game.play({ type: "play-card", cardNumber: "OP10-054" });
    settle(game);

    expect(currentPower(game.state, "p2", "gilly")).toBe(5_000);
  });

  it("OP13-077#1: a 5000-base Character shrunk to 0 is not a 4000-or-less-base target", () => {
    // OP13-020 Meteor Fist takes OP05-012 Hack (5000 base) to 0 first.
    const game = table(ROGER, ZORO, "faq-op13-077-1")
      .withGivenDon("p1", "p1-leader", 1)
      .withHand("p1", [
        instance("meteor", "OP13-020"),
        instance("top", "OP13-077"),
      ])
      .withBoard("p2", [
        character("hack", "OP05-012"), // 5000
        character("bb", "OP08-035"), // 4000
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "meteor" });
    settle(game, "hack");
    expect(currentPower(game.state, "p2", "hack")).toBe(0);

    game.play({ type: "activate-main", sourceInstanceId: "top" });
    untilChoice(game);
    const options = effectOptions(game);
    expect(options).toContain("bb");
    expect(options).not.toContain("hack");
  });
});

describe("FAQ OP-13 black", () => {
  describe("OP13-079 Imu (Leader)", () => {
    const setupEvents = (startingPlayer?: "p1" | "p2") =>
      createGame({
        gameId: "faq-op13-079",
        p1: resolveDeck(IMU),
        p2: resolveDeck(IMU),
        seed: "faq-op13-079",
        ...(startingPlayer ? { startingPlayer } : {}),
      }).events;

    it("OP13-079#1: the Stage is played after the first player is set and before the opening hand", () => {
      const state = createGame({
        gameId: "faq-op13-079-1",
        p1: resolveDeck(IMU),
        p2: resolveDeck(REBECCA),
        seed: "faq-op13-079-1",
      });
      const imu = state.players.p1;

      expect(imu.stage?.cardNumber).toBe("OP13-099");
      // The first player is fixed by the game's creation, which comes first.
      const order = state.events.map((event) => event.type);
      expect(order.indexOf("game-created")).toBeLessThan(
        order.indexOf("card-played"),
      );
      // Out of the fifty before the hand was dealt: the five in hand came from
      // the other forty-nine.
      expect(imu.hand).toHaveLength(5);
      expect(
        [...imu.hand, ...imu.deck, ...imu.life].map((card) => card.cardNumber),
      ).not.toContain("OP13-099");
      expect(state.phase).toBe("mulligan");
    });

    // p2 goes first here, so p2's Stage is played before p1's.
    it("OP13-079#2: with Imu on both sides, the player going first plays their Stage first", () => {
      for (const first of ["p1", "p2"] as const) {
        const stagePlays = setupEvents(first)
          .filter(
            (event) =>
              event.type === "card-played" && event.cardNumber === "OP13-099",
          )
          .map((event) => (event as { playerId: string }).playerId);
        expect(stagePlays).toEqual(
          first === "p1" ? ["p1", "p2"] : ["p2", "p1"],
        );
      }
    });

    it("OP13-079#3: the Leader's '?' attribute is not <Strike>", () => {
      // OP13-025 Koby sets a DON!! active behind a {FILM} Leader or a <Strike>
      // one; Imu is neither.
      const play = (leader: string, seed: string) => {
        const game = table(IMU, REBECCA, seed)
          .withLeader("p1", leader)
          .withHand("p1", [instance("koby", "OP13-025")])
          .build();
        game.play({ type: "play-card", cardNumber: "OP13-025" });
        settle(game, "apply");
        return game.state.players.p1.restedDon.length;
      };

      expect(play("OP13-079", "faq-op13-079-3")).toBe(5);
      // OP13-001 Monkey.D.Luffy is <Strike>.
      expect(play("OP13-001", "faq-op13-079-3-control")).toBe(4);
    });

    it("OP13-079#4: the [Activate: Main] may trash a hand card that is not {Celestial Dragons}", () => {
      const game = table(IMU, REBECCA, "faq-op13-079-4")
        .withHand("p1", [instance("outsider", "OP10-054")]) // {Dressrosa}
        .withDeckTop("p1", [instance("drawn", "OP13-089")])
        .build();

      game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
      settle(game, "outsider");

      expect(ids(game.state.players.p1.trash)).toEqual(["outsider"]);
      expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    });
  });

  it("OP13-082#1: Five Elders trashes itself along with the rest of the board", () => {
    const game = table(IMU, REBECCA, "faq-op13-082-1")
      .withBoard("p1", [
        character("elders", "OP13-082"),
        character("jalmac", "OP13-085"),
      ])
      .withHand("p1", [instance("fodder", "OP10-054")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "elders" });
    settle(game, "fodder", "done");

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["elders", "jalmac", "fodder"]),
    );
  });

  it("OP13-084#1: Ju Peter sets Five Elders' base power to 7000", () => {
    const game = table(IMU, REBECCA, "faq-op13-084-1")
      .withBoard("p1", [
        character("elders", "OP13-082"), // 12000
        character("jupeter", "OP13-084"),
      ])
      .withTrash("p1", copies(10, "OP10-054", "mill"))
      .build();

    expect(currentPower(game.state, "p1", "elders")).toBe(7_000);
  });

  it("OP13-097#1: with no Characters of its own, the [Main] K.O.s nothing", () => {
    const game = table(IMU, REBECCA, "faq-op13-097-1")
      .withHand("p1", [instance("equilibrium", "OP13-097")])
      .withBoard("p2", [character("gilly", "OP10-054")])
      .build();

    if (canActivate(game, "equilibrium")) {
      game.play({ type: "activate-main", sourceInstanceId: "equilibrium" });
      settle(game, "apply", "gilly");
    }

    expect(ids(game.state.players.p2.board)).toEqual(["gilly"]);
  });

  it("OP13-098#1: the [Main] cannot K.O. a cost-6 Stage", () => {
    // OP06-041 The Ark Noah is a cost-6 Stage.
    const game = table(IMU, REBECCA, "faq-op13-098-1")
      .withHand("p1", [instance("never", "OP13-098")])
      .withStage("p2", instance("ark", "OP06-041"))
      .build();

    if (canActivate(game, "never")) {
      game.play({ type: "activate-main", sourceInstanceId: "never" });
      expect(effectOptions(game)).not.toContain("ark");
      settle(game, "apply");
    }

    expect(game.state.players.p2.stage?.instanceId).toBe("ark");
  });
});

describe("FAQ OP-13 yellow", () => {
  it("OP13-100#1: the Leader may give the 2 rested DON!! to the [Trigger] Character just played", () => {
    const game = table(ST31, ZORO, "faq-op13-100-1")
      .withLeader("p1", "OP13-100")
      .withHand("p1", [instance("bonney", "OP13-109")])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-109" });
    // The Leader's [Once Per Turn] reaction is optional, so it asks first.
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game)).toContain("bonney");
    game.play({ type: "resolve-effect", optionId: "bonney" });
    settle(game);

    expect(boardCard(game, "p1", "bonney")?.attachedDon).toHaveLength(2);
  });

  it("OP13-102#1: with more Life than the opponent, Edison neither draws nor rests", () => {
    const game = table(ST31, ZORO, "faq-op13-102-1")
      .withBoard("p1", [character("edison", "OP13-102")])
      .withLife("p1", copies(3, "OP10-054", "life"))
      .withLife("p2", copies(2, "OP10-054", "p2-life"))
      .withDeckTop("p1", [instance("drawn", "OP10-054")])
      .withBoard("p2", [character("bb", "OP08-035")]) // cost 2
      .build();

    if (canActivate(game, "edison")) {
      game.play({ type: "activate-main", sourceInstanceId: "edison" });
      settle(game, "bb");
    }

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(boardCard(game, "p2", "bb")?.rested).toBe(false);
  });

  it("OP13-106#1: Conney played by its own [Trigger] does not gain [Blocker]", () => {
    const game = defending(ST31, ZORO, "faq-op13-106-1")
      .withLife("p1", [instance("conney", "OP13-106")])
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["conney"]);
    expect(hasKeyword(game.state, "p1", "conney", "Blocker")).toBe(false);
  });

  it("OP13-108#1: behind a Leader without {Egghead}, the opponent adds no Life card to hand", () => {
    const game = table(ST31, ZORO, "faq-op13-108-1")
      .withHand("p1", [instance("bonney", "OP13-108")])
      .withLife("p2", copies(2, "OP10-054", "p2-life"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-108" });
    settle(game);

    expect(game.state.players.p2.life).toHaveLength(2);
    expect(game.state.players.p2.hand).toHaveLength(0);
  });

  it("OP13-109#1: with the top Life card already face-up, Bonney cannot pay her replacement", () => {
    // OP10-060 Barrier-Barrier Pistol puts a Character with 6000 power or less
    // at the bottom of its owner's deck. The second Life card is face-down.
    const game = table(ST31, ZORO, "faq-op13-109-1")
      .withHand("p1", [instance("barrier", "OP10-060")])
      .withBoard("p2", [character("bonney", "OP13-109")])
      .withLife("p2", [
        instance("up", "OP10-054", { faceUp: true }),
        instance("down", "OP10-054"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "barrier" });
    game.play({ type: "resolve-effect", optionId: "bonney" });

    expect(
      effectOptions(game, "p2").some((option) => option.startsWith("replace:")),
    ).toBe(false);
    settle(game);
    expect(game.state.players.p2.board).toEqual([]);
  });

  it("OP13-113#1: Lilith's [Trigger] does not play Lilith", () => {
    const game = defending(ST31, ZORO, "faq-op13-113-1")
      .withLife("p1", [instance("lilith", "OP13-113")])
      .withDeckTop("p1", copies(4, "OP10-054", "deck"))
      .withBoard("p2", [character("attacker", "OP11-003")])
      .build();

    attack(game, "attacker", "p1-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toContain("lilith");
  });

  it("OP13-118#1: behind a mono-green Leader, a cost-6 Character can follow Luffy, and no DON!! is set active", () => {
    // Six DON!! pay for Luffy and four stay active, which is too few to pay
    // for a 5-cost; EB03-062 Trafalgar Law's [Activate: Main] costs no DON!!
    // and plays OP12-106 Trafalgar Law (base cost 6) from hand.
    const game = table(ZORO, ST31, "faq-op13-118-1")
      .withBoard("p1", [character("eb-law", "EB03-062")])
      .withHand("p1", [
        instance("luffy", "OP13-118"),
        instance("fodder", "OP10-054"),
        instance("law", "OP12-106"),
      ])
      .withDeckTop("p1", [instance("top", "OP10-054")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-118" });
    settle(game);
    expect(game.state.players.p1.activeDon).toHaveLength(4);

    game.play({ type: "activate-main", sourceInstanceId: "eb-law" });
    settle(game, "apply", "fodder", "law");
    expect(ids(game.state.players.p1.board)).toContain("law");
  });

  describe("OP13-119 Portgas.D.Ace", () => {
    /** p1 holds Ace with a rested DON!! to give; p2 has a cost-4 body out and a cost-3 one in hand. */
    const aceTable = (seed: string, p2Leader?: string) => {
      let builder = table(ST31, ZORO, seed)
        .withHand("p1", [instance("ace", "OP13-119")])
        .withDon("p1", { rested: 1 })
        .withLife("p1", copies(2, "OP10-054", "p1-life"))
        .withBoard("p2", [character("victim", "OP08-035")]) // cost 2
        .withHand("p2", [instance("theirs", "OP10-054")]); // cost 3
      if (p2Leader) builder = builder.withLeader("p2", p2Leader);
      return builder;
    };

    it("OP13-119#1: the opponent may decline to play a Character", () => {
      const game = aceTable("faq-op13-119-1").build();
      game.play({ type: "play-card", cardNumber: "OP13-119" });
      untilChoice(game);
      game.play({ type: "resolve-effect", optionId: "victim" });

      expect(game.state.pendingEffect?.playerId).toBe("p2");
      expect(effectOptions(game, "p2")).toContain("done");
      game.play({ type: "resolve-effect", optionId: "done" });
      settle(game);

      expect(game.state.players.p2.board).toEqual([]);
      expect(ids(game.state.players.p2.hand).sort()).toEqual([
        "theirs",
        "victim",
      ]);
    });

    it("OP13-119#2: choosing no Character to return gives the opponent no play", () => {
      const game = aceTable("faq-op13-119-2").build();
      game.play({ type: "play-card", cardNumber: "OP13-119" });
      settle(game, "skip", "done");

      expect(ids(game.state.players.p2.board)).toEqual(["victim"]);
      expect(ids(game.state.players.p2.hand)).toEqual(["theirs"]);
    });

    // Bonney's replacement keeps her on the field, so nothing reached the
    // hand and p2 is not offered a Character to play.
    it("OP13-119#2: a return replaced by another effect gives the opponent no play", () => {
      // OP13-109 Jewelry Bonney (cost 5) turns a Life card face-up instead of
      // leaving the field to the opponent's effect.
      const game = table(ST31, ZORO, "faq-op13-119-2-replaced")
        .withHand("p1", [instance("ace", "OP13-119")])
        .withDon("p1", { rested: 1 })
        .withBoard("p2", [character("bonney", "OP13-109")])
        .withLife("p2", [instance("p2-life", "OP10-054")])
        .withHand("p2", [instance("theirs", "OP10-054")])
        .build();

      game.play({ type: "play-card", cardNumber: "OP13-119" });
      untilChoice(game);
      game.play({ type: "resolve-effect", optionId: "bonney" });
      const replace = effectOptions(game, "p2").find((option) =>
        option.startsWith("replace:"),
      );
      expect(replace).toBeDefined();
      game.play({ type: "resolve-effect", optionId: replace! });

      expect(ids(game.state.players.p2.board)).toEqual(["bonney"]);
      let guard = 0;
      while (game.state.pendingEffect) {
        if (guard++ > 10) throw new Error("pending effect never settled");
        expect(effectOptions(game)).not.toContain("theirs");
        game.play({ type: "resolve-effect" });
      }
      expect(ids(game.state.players.p2.board)).toEqual(["bonney"]);
      expect(ids(game.state.players.p2.hand)).toEqual(["theirs"]);
    });

    it("OP13-119#3: with no rested DON!! to give, a return still lets the opponent play", () => {
      const game = table(ST31, ZORO, "faq-op13-119-3")
        .withHand("p1", [instance("ace", "OP13-119")])
        .withBoard("p2", [character("victim", "OP08-035")])
        .withHand("p2", [instance("theirs", "OP10-054")])
        .build();
      // Ace's own cost rests six; give nothing back first.
      game.play({ type: "play-card", cardNumber: "OP13-119" });
      untilChoice(game);
      game.play({ type: "resolve-effect", optionId: "victim" });
      game.play({ type: "resolve-effect", optionId: "theirs" });
      settle(game);

      expect(ids(game.state.players.p2.board)).toEqual(["theirs"]);
    });

    it("OP13-119#4: the opponent's Koala Leader does not answer the Character they played", () => {
      const game = aceTable("faq-op13-119-4", "OP12-081").build();
      game.play({ type: "play-card", cardNumber: "OP13-119" });
      untilChoice(game);
      game.play({ type: "resolve-effect", optionId: "victim" });
      game.play({ type: "resolve-effect", optionId: "theirs" });
      settle(game);

      expect(ids(game.state.players.p2.board)).toEqual(["theirs"]);
      expect(game.state.players.p1.life).toHaveLength(2);
    });
  });
});

describe("FAQ OP-13 black (SEC)", () => {
  it("OP13-120#1: Sabo's +2 cost takes a cost-10 Character to 12", () => {
    const game = table(ST31, ZORO, "faq-op13-120-1")
      .withBoard("p1", [
        character("sabo", "OP13-120"),
        character("shanks", "OP13-028"), // cost 10
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "sabo" });
    settle(game, "shanks");

    const shanks = boardCard(game, "p1", "shanks")!;
    expect(effectiveCost(game.state, "p1", shanks)).toBe(12);
  });
});
