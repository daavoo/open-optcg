import { describe, expect, it } from "vitest";
import { deckManifests, validateDeck } from "@one-piece-sim/decks";
import { currentPower, observe } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-12 "Legacy of the Master", one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order the PDF prints them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. A ruling the engine disagrees with is an `it.fails`
 * that says what the engine does instead: it turns green -- and so red under
 * `it.fails` -- the day the engine is fixed, which is the prompt to promote it.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op12.pdf
 */

/** Rulings with no engine decision and no observable consequence to assert. */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const RAYLEIGH = "(Red) Silvers Rayleigh - Official Feature Deck";
const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ZORO = "(Green) Roronoa Zoro - Starter Deck 32";
const KUZAN = "(Blue) Kuzan - Starter Deck 33";
const SANJI = "(Blue/Purple) Sanji - Official Feature Deck";
const KOALA = "(Black/Yellow) Koala - Official Feature Deck";
const KATAKURI_DECK = "(Purple) Charlotte Katakuri - Starter Deck 34";
const NEWGATE = "(Red) Edward.Newgate - Official Feature Deck";

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

function mainActivations(game: Game, needle: string): string[] {
  return game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" && action.summary.includes(needle),
    )
    .map((action) => action.summary);
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const table = (p1: string, p2: string, seed: string) =>
  scenario().decks(p1, p2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

const defending = (p1: string, p2: string, seed: string) =>
  scenario().decks(p1, p2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

/** Two copies of OP12-019 Color of Arms Haki: one card number, two Events. */
const twinEvents = () => copies(2, "OP12-019", "twin");

describe("FAQ OP-12 red", () => {
  it("OP12-001#1: a card whose cost can drop to 4 is still barred by its printed cost", () => {
    const manifest = deckManifests[RAYLEIGH]!;
    expect(validateDeck(manifest).errors).toEqual([]);

    // ST23-001 Uta prints cost 6 and can discount itself in hand.
    const withUta = {
      ...manifest,
      cards: { ...manifest.cards, "OP12-012": 1, "ST23-001": 1 },
    };
    const errors = validateDeck(withUta).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ST23-001");
  });

  it("OP12-003#1: Crocus's [On K.O.] reveal may show two copies of one Event", () => {
    const game = defending(RAYLEIGH, ZORO, "faq-op12-003-1")
      .withBoard("p1", [character("crocus", "OP12-003", { rested: true })])
      .withHand("p1", [...twinEvents(), instance("hatchan", "OP12-013")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "crocus",
    });
    game.pass();
    game.pass();
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    settle(game, "apply", "twin-1", "twin-2", "hatchan");

    expect(ids(game.state.players.p1.board)).toEqual(["hatchan"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["twin-1", "twin-2"]);
  });

  it("OP12-004#1: Oden's reveal may show two copies of one Event", () => {
    const game = table(RAYLEIGH, ZORO, "faq-op12-004-1")
      .withBoard("p1", [character("oden", "OP12-004")])
      .withHand("p1", twinEvents())
      .build();

    game.play({ type: "activate-main", summary: "Kouzuki Oden" });
    settle(game, "apply", "twin-1", "twin-2");

    expect(currentPower(game.state, "p1", "oden")).toBe(5_000);
  });

  describe("[Monkey.D.Luffy] searches take any colour", () => {
    for (const [cardNumber, name] of [
      ["OP12-006", "Shakuyaku"],
      ["OP12-014", "Boa Hancock"],
    ] as const) {
      const id = cardNumber === "OP12-006" ? "OP12-006#1" : "OP12-014#1";
      it(`${id}: ${name}'s [On Play] adds a yellow [Monkey.D.Luffy]`, () => {
        const game = table(RAYLEIGH, ZORO, `faq-${id}`)
          .withHand("p1", [instance("searcher", cardNumber)])
          // OP10-111 Monkey.D.Luffy is yellow.
          .withDeckTop("p1", [
            instance("yellow-luffy", "OP10-111"),
            ...copies(4, "ST32-004", "filler"),
          ])
          .build();

        game.play({ type: "play-card", cardNumber });
        expect(effectOptions(game)).toContain("yellow-luffy");
        settle(game, "yellow-luffy");

        expect(ids(game.state.players.p1.hand)).toEqual(["yellow-luffy"]);
      });
    }
  });

  it("OP12-009#1: Jinbe's reveal may show two copies of one Event", () => {
    const game = table(RAYLEIGH, ZORO, "faq-op12-009-1")
      .withHand("p1", [instance("jinbe", "OP12-009"), ...twinEvents()])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-009" });
    settle(game, "apply", "twin-1", "twin-2");

    expect(currentPower(game.state, "p1", "jinbe")).toBe(5_000);
  });

  it("OP12-013#1: Hatchan's reveal may show two copies of one Event", () => {
    const game = table(RAYLEIGH, ZORO, "faq-op12-013-1")
      .withDonDeck("p1", 8)
      .withDon("p1", { rested: 2 })
      .withBoard("p1", [character("hatchan", "OP12-013")])
      .withHand("p1", twinEvents())
      .build();

    game.play({ type: "activate-main", summary: "Hatchan" });
    settle(game, "apply", "twin-1", "twin-2", "p1-leader");

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(2);
  });

  it("OP12-014#2: Hancock's [Activate: Main] may give the DON!! that were on Hancock", () => {
    // Every DON!! on the field is active except the two given to Hancock;
    // trashing her rests those two, and they are the ones given on.
    const game = table(RAYLEIGH, ZORO, "faq-op12-014-2")
      .withBoard("p1", [character("hancock", "OP12-014")])
      .withGivenDon("p1", "hancock", 2)
      .build();
    expect(game.state.players.p1.restedDon).toHaveLength(0);

    game.play({ type: "activate-main", summary: "Boa Hancock" });
    settle(game, "apply", "p1-leader");

    expect(ids(game.state.players.p1.trash)).toEqual(["hancock"]);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(2);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
  });

  it("OP12-015#1: Luffy's +2000 counts one DON!! on the Leader and one on another Character", () => {
    const game = table(RAYLEIGH, ZORO, "faq-op12-015-1")
      .withBoard("p1", [
        character("luffy", "OP12-015"),
        character("oden", "OP12-004"),
      ])
      .withGivenDon("p1", "p1-leader", 1)
      .build();
    expect(currentPower(game.state, "p1", "luffy")).toBe(4_000);

    game.play({ type: "attach-don", targetInstanceId: "oden" });
    expect(currentPower(game.state, "p1", "luffy")).toBe(6_000);
  });

  it("OP12-015#2: Luffy's [On Play] reveal may show two copies of one Event", () => {
    const game = table(RAYLEIGH, ZORO, "faq-op12-015-2")
      .withHand("p1", [
        instance("luffy", "OP12-015"),
        instance("hatchan", "OP12-013"),
        ...twinEvents(),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-015" });
    settle(game, "apply", "twin-1", "twin-2", "hatchan");

    expect(ids(game.state.players.p1.board)).toContain("hatchan");
  });
});

describe("FAQ OP-12 [Silvers Rayleigh] Events", () => {
  /** The Events' [Main] offers, by card number. */
  const mainOffers = (game: Game): string[] =>
    game
      .legalActions()
      .filter((action) => action.type === "activate-main")
      .map((action) => action.sourceCardNumber)
      .filter((card) => card !== "OP12-001")
      .sort();

  const rayleighEvents = () => [
    instance("never-doubt", "OP12-016"),
    instance("observation", "OP12-017"),
    instance("arms", "OP12-019"),
  ];

  it("OP12-016#1: To Never Doubt is not activatable with one active DON!!", () => {
    const game = table(RAYLEIGH, ZORO, "faq-op12-016-1")
      .withDonDeck("p1", 10)
      .withDon("p1", { active: 1, rested: 3 })
      .withHand("p1", [instance("never-doubt", "OP12-016")])
      .build();

    expect(mainOffers(game)).toEqual([]);
  });

  it("OP12-017#1: the one-DON!! Events are not activatable with no active DON!!", () => {
    const game = table(RAYLEIGH, ZORO, "faq-op12-017-1")
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 4 })
      .withHand("p1", rayleighEvents())
      .build();

    expect(mainOffers(game)).toEqual([]);
  });

  it("OP12-019#1: Color of Arms Haki is not activatable with no active DON!!", () => {
    const game = table(RAYLEIGH, ZORO, "faq-op12-019-1")
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 4 })
      .withHand("p1", [instance("arms", "OP12-019")])
      .build();

    expect(mainOffers(game)).toEqual([]);
  });

  it("OP12-016#2 / OP12-017#2 / OP12-019#2: no [Silvers Rayleigh] on the field, no [Main]", () => {
    // ST31's Leader is Monkey.D.Luffy and the board is empty.
    const game = table(ST31, ZORO, "faq-op12-016-2")
      .withHand("p1", rayleighEvents())
      .build();

    expect(mainOffers(game)).toEqual([]);
  });

  describe("a [Silvers Rayleigh] Character takes the DON!!", () => {
    /** Behind a Luffy Leader, so the ST32-004 Silvers Rayleigh Character is the only Rayleigh. */
    const rayleighCharacter = (seed: string, cardNumber: string) =>
      table(ST31, ZORO, seed)
        .withHand("p1", [instance("event", cardNumber)])
        .withBoard("p1", [character("rayleigh", "ST32-004")])
        .withDeckTop("p1", copies(4, "OP12-018", "deck"))
        .build();

    it("OP12-016#2 / OP12-016#3: To Never Doubt gives 2 DON!! to the Rayleigh Character", () => {
      const game = rayleighCharacter("faq-op12-016-3", "OP12-016");
      game.play({ type: "activate-main", sourceCardNumber: "OP12-016" });
      settle(game, "apply", "rayleigh");

      expect(
        game.state.players.p1.board.find(
          (card) => card.instanceId === "rayleigh",
        )?.attachedDon,
      ).toHaveLength(2);
    });

    it("OP12-017#2 / OP12-017#3: Color of Observation gives 1 DON!! to the Rayleigh Character", () => {
      const game = rayleighCharacter("faq-op12-017-3", "OP12-017");
      game.play({ type: "activate-main", sourceCardNumber: "OP12-017" });
      settle(game, "apply", "rayleigh");

      expect(
        game.state.players.p1.board.find(
          (card) => card.instanceId === "rayleigh",
        )?.attachedDon,
      ).toHaveLength(1);
    });

    it("OP12-019#2 / OP12-019#3: Color of Arms gives 1 DON!! to the Rayleigh Character", () => {
      const game = rayleighCharacter("faq-op12-019-3", "OP12-019");
      game.play({ type: "activate-main", sourceCardNumber: "OP12-019" });
      settle(game, "apply", "rayleigh");

      expect(
        game.state.players.p1.board.find(
          (card) => card.instanceId === "rayleigh",
        )?.attachedDon,
      ).toHaveLength(1);
    });
  });

  it("OP12-017#4: Color of Observation cannot add a green Character of cost 3 or more", () => {
    const game = table(RAYLEIGH, ZORO, "faq-op12-017-4")
      .withHand("p1", [instance("observation", "OP12-017")])
      .withDeckTop("p1", [
        instance("green", "ST32-004"), // green, cost 4
        instance("red", "OP12-015"), // red, cost 4
        instance("event", "OP12-018"), // red Event
        instance("cheap", "OP12-006"), // red, cost 1
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP12-017" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    const options = effectOptions(game);
    expect(options).toContain("red");
    expect(options).toContain("event");
    expect(options).not.toContain("green");
    expect(options).not.toContain("cheap");
  });

  it("OP12-018#1: Supreme King Haki's [Counter] still gives +2000 with no active DON!!, and no −1000", () => {
    const game = defending(RAYLEIGH, ZORO, "faq-op12-018-1")
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 4 })
      .withHand("p1", [instance("supreme", "OP12-018")])
      .withBoard("p2", [character("attacker", "ST32-005")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "supreme" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(5_000);
    expect(currentPower(game.state, "p2", "attacker")).toBe(2_000);
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });
});

describe("FAQ OP-12 green", () => {
  describe("OP12-020 Roronoa Zoro (Leader)", () => {
    /** p1's Zoro Leader holds `don` given DON!!; p2 has a rested Character and a [Blocker]. */
    const zoroTable = (seed: string, don: number, p2Leader?: string) => {
      let builder = table(ZORO, ST31, seed)
        .withGivenDon("p1", "p1-leader", don)
        .withBoard("p2", [
          character("target", "ST31-003", { rested: true }),
          character("bonney", "OP12-118"), // [Blocker]
        ])
        .withLife("p2", copies(3, "ST31-003", "p2-life"))
        .withHand("p2", [instance("snake-dance", "OP07-055")]);
      if (p2Leader) builder = builder.withLeader("p2", p2Leader);
      return builder.build();
    };

    /** Passes the Block and Counter steps (and any Trigger) back to p1's Main Phase. */
    const finishBattle = (game: Game) => {
      let guard = 0;
      while (game.state.phase !== "main" || game.player !== "p1") {
        if (guard++ > 10) throw new Error("battle never finished");
        if (game.state.pendingEffect) settle(game);
        else if (game.state.phase === "trigger") {
          game.play({ type: "resolve-trigger" });
        } else game.pass();
      }
    };

    const zoroActivations = (game: Game) =>
      mainActivations(game, "Roronoa Zoro");

    it("OP12-020#1: a Leader attack blocked by a Character still counts as battling a Character", () => {
      const game = zoroTable("faq-op12-020-1", 3);
      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "p2-leader",
      });
      game.play({ type: "block", blockerInstanceId: "bonney" });
      finishBattle(game);
      expect(game.state.players.p1.leaderRested).toBe(true);

      game.play({ type: "activate-main", summary: "Roronoa Zoro" });
      settle(game);
      expect(game.state.players.p1.leaderRested).toBe(false);
    });

    it("OP12-020#2: a Leader attack blocked by a [Blocker] Leader is not a battle with a Character", () => {
      // OP05-022 Donquixote Rosinante is a Leader with [Blocker].
      const game = zoroTable("faq-op12-020-2", 3, "OP05-022");
      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "target",
      });
      game.play({ type: "block", blockerInstanceId: "p2-leader" });
      finishBattle(game);

      expect(game.state.players.p1.leaderRested).toBe(true);
      expect(zoroActivations(game)).toEqual([]);
    });

    it("OP12-020#3: a third DON!! given after the battle meets [DON!! x3]", () => {
      const game = zoroTable("faq-op12-020-3", 2);
      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "target",
      });
      finishBattle(game);
      expect(ids(game.state.players.p2.trash)).toContain("target");
      expect(zoroActivations(game)).toEqual([]);

      game.play({ type: "attach-don", targetInstanceId: "p1-leader" });
      game.play({ type: "activate-main", summary: "Roronoa Zoro" });
      settle(game);
      expect(game.state.players.p1.leaderRested).toBe(false);
    });

    it("OP12-020#4: a target removed before the battle leaves nothing to set active", () => {
      // p2's OP07-055 Snake Dance [Counter] returns its own attacked Character
      // to hand, so the attack ends with no battle.
      const game = zoroTable("faq-op12-020-4", 3);
      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "target",
      });
      game.pass(); // no block
      game.play({
        type: "activate-counter-event",
        eventInstanceId: "snake-dance",
      });
      settle(game, "target");
      expect(ids(game.state.players.p2.hand)).toContain("target");
      finishBattle(game);

      expect(game.state.players.p1.leaderRested).toBe(true);
      expect(zoroActivations(game)).toEqual([]);
    });
  });

  it("OP12-024#1: Gyukimaru's 3 given DON!! may be spread over several cards", () => {
    const game = table(ZORO, ST31, "faq-op12-024-1")
      .withBoard("p1", [
        character("gyukimaru", "OP12-024"),
        character("zoro", "ST32-005"),
      ])
      .withGivenDon("p1", "gyukimaru", 1)
      .withGivenDon("p1", "zoro", 1)
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p2", [character("brook", "ST31-003")])
      .withLife("p2", copies(3, "ST31-003", "p2-life"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "gyukimaru",
      targetInstanceId: "p2-leader",
    });
    settle(game, "brook");

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "brook")
        ?.rested,
    ).toBe(true);
  });

  it("OP12-027#1: two active Koushirou each rest to save the other from one K.O.", () => {
    // OP09-018 Get Out of Here! K.O.s up to 2 Characters totalling 4000 power
    // or less; both 1000-power Koushirou are taken at once.
    const game = defending(ZORO, RAYLEIGH, "faq-op12-027-1")
      .withBoard("p1", [
        character("koushirou-1", "OP12-027"),
        character("koushirou-2", "OP12-027"),
      ])
      .withHand("p2", [instance("get-out", "OP09-018")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "koushirou-1" });
    game.play({ type: "resolve-effect", optionId: "koushirou-2" });
    let saves = 0;
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 10) throw new Error("never settled");
      expect(game.player).toBe("p1");
      game.play({ type: "resolve-effect", summary: "Rest Koushirou instead" });
      saves += 1;
    }

    expect(saves).toBe(2);
    expect(ids(game.state.players.p1.board).sort()).toEqual([
      "koushirou-1",
      "koushirou-2",
    ]);
    expect(game.state.players.p1.board.every((card) => card.rested)).toBe(true);
  });

  describe("<Slash> searches take any colour", () => {
    it("OP12-028#1: Hiyori adds a red <Slash> Character", () => {
      const game = table(ZORO, ST31, "faq-op12-028-1")
        .withBoard("p1", [character("hiyori", "OP12-028")])
        .withDeckTop("p1", [
          instance("red-zoro", "OP01-025"), // red, <Slash>
          ...copies(4, "ST31-003", "filler"),
        ])
        .build();

      game.play({ type: "activate-main", summary: "Kouzuki Hiyori" });
      settle(game, "apply", "red-zoro");

      expect(ids(game.state.players.p1.hand)).toEqual(["red-zoro"]);
    });

    it("OP12-034#1: Perona adds a red <Slash> Character", () => {
      const game = table(ZORO, ST31, "faq-op12-034-1")
        .withHand("p1", [instance("perona", "OP12-034")])
        .withDeckTop("p1", [
          instance("red-zoro", "OP01-025"),
          ...copies(4, "ST31-003", "filler"),
        ])
        .build();

      game.play({ type: "play-card", cardNumber: "OP12-034" });
      settle(game, "red-zoro");

      expect(ids(game.state.players.p1.hand)).toEqual(["red-zoro"]);
    });
  });

  // ST12-003 Mihawk's [On Play] offers every other cost-4 <Slash> Character
  // in hand, but not OP12-036, whose own text bars effects from playing it.
  it("OP12-036#1: Zoro cannot be played from hand by an effect, only by paying its cost", () => {
    // ST12-003 Dracule Mihawk's [On Play] plays a <Slash> Character of cost 4
    // or less from hand; OP12-036 qualifies on paper.
    const game = table(ZORO, ST31, "faq-op12-036-1")
      .withHand("p1", [
        instance("mihawk", "ST12-003"),
        instance("zoro", "OP12-036"),
        instance("small-zoro", "ST32-005"),
      ])
      .build();
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "play-card" && action.cardInstanceId === "zoro",
        ),
    ).toBe(true);

    game.play({ type: "play-card", cardNumber: "ST12-003" });
    const options = effectOptions(game);
    expect(options).toContain("small-zoro");
    expect(options).not.toContain("zoro");
  });
});

describe("FAQ OP-12 blue", () => {
  /**
   * p2's OP12-060 Boeuf Burst (behind the multicoloured Sanji Leader) returns
   * one of p1's Characters of cost 4 or less to hand: an opponent's effect
   * removing it from the field.
   */
  const boeufBounce = (game: Game, target: string) => {
    game.play({ type: "activate-main", sourceCardNumber: "OP12-060" });
    game.play({ type: "resolve-effect", summary: "Return" });
    game.play({ type: "resolve-effect", optionId: target });
  };

  const navyDefends = (seed: string) =>
    defending(KUZAN, SANJI, seed).withHand("p2", [
      instance("boeuf", "OP12-060"),
    ]);

  // The replacement's hand trash is credited to Borsalino, the protector,
  // so the Kuzan Leader's {Navy}-source watcher answers it.
  it("OP12-040#1 / OP12-053#1: Borsalino's hand-trash replacement draws off the Kuzan Leader", () => {
    const game = navyDefends("faq-op12-040-1")
      .withBoard("p1", [character("borsalino", "OP12-053")])
      .withHand("p1", [instance("fodder", "OP12-052")])
      .withDeckTop("p1", [instance("drawn", "OP12-045")])
      .build();

    boeufBounce(game, "borsalino");
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", summary: "Trash 1 card" });
    settle(game, "fodder");

    expect(ids(game.state.players.p1.board)).toEqual(["borsalino"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  describe("OP12-041 Sanji (Leader)", () => {
    const sanjiTable = (seed: string, hand: ReturnType<typeof instance>[]) =>
      table(SANJI, ST31, seed)
        .withHand("p1", hand)
        .withBoard("p2", [character("brook", "ST31-003")])
        .build();

    it("OP12-041#1 / OP12-041#2: the Event goes to the trash, and only the DON!! −1 is paid", () => {
      // OP06-019 Blue Dragon Seal Water Stream prints cost 3; K.O.s 5000 or less.
      const game = sanjiTable("faq-op12-041-1", [
        instance("water-stream", "OP06-019"),
      ]);
      game.play({ type: "activate-main", summary: "Sanji" });
      settle(game, "apply", "water-stream", "brook");

      expect(ids(game.state.players.p1.trash)).toEqual(["water-stream"]);
      expect(ids(game.state.players.p2.trash)).toEqual(["brook"]);
      expect(game.state.players.p1.donDeck).toHaveLength(1);
      expect(game.state.players.p1.activeDon).toHaveLength(9);
      expect(game.state.players.p1.restedDon).toHaveLength(0);
    });

    it("OP12-041#3: Gum-Gum Lightning's own DON!! −2 is still paid", () => {
      const game = sanjiTable("faq-op12-041-3", [
        instance("lightning", "OP09-077"),
      ]);
      game.play({ type: "activate-main", summary: "Sanji" });
      settle(game, "apply", "lightning", "brook");

      expect(ids(game.state.players.p2.trash)).toEqual(["brook"]);
      expect(game.state.players.p1.donDeck).toHaveLength(3);
    });

    it("OP12-041#4: an Event activated this way is an Event activation", () => {
      // No "when you activate an Event" card on p1's own turn is registered,
      // so the ruling is pinned on the event every such watcher reads.
      const game = sanjiTable("faq-op12-041-4", [
        instance("water-stream", "OP06-019"),
      ]);
      game.play({ type: "activate-main", summary: "Sanji" });
      game.play({ type: "resolve-effect", optionId: "water-stream" });

      expect(game.events).toContainEqual(
        expect.objectContaining({
          type: "event-activated",
          playerId: "p1",
          cardNumber: "OP06-019",
        }),
      );
    });

    it("OP12-041#5: a {Straw Hat Crew} Event with only a [Counter] cannot be activated", () => {
      // OP11-059 Gum-Gum King Cobra prints a [Counter] and a [Trigger], no [Main].
      const game = sanjiTable("faq-op12-041-5", [
        instance("king-cobra", "OP11-059"),
      ]);

      expect(mainActivations(game, "Sanji")).toEqual([]);
    });
  });

  it("OP12-046#1: Zephyr's [On Play] trashes the one card left in hand", () => {
    const game = table(KUZAN, ST31, "faq-op12-046-1")
      .withHand("p1", [
        instance("zephyr", "OP12-046"),
        instance("last", "OP12-052"),
      ])
      .withDeckTop("p1", copies(2, "OP12-045", "deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-046" });
    settle(game, "last");

    expect(ids(game.state.players.p1.trash)).toEqual(["last"]);
  });

  describe("OP12-048 Donquixote Rosinante", () => {
    it("OP12-048#1: a rested Rosinante cannot pay its replacement", () => {
      const game = navyDefends("faq-op12-048-1")
        .withBoard("p1", [
          character("rosinante", "OP12-048", { rested: true }),
          character("fullbody", "OP12-052"),
        ])
        .withHand("p1", [instance("fodder", "OP12-045")])
        .build();

      boeufBounce(game, "fullbody");

      expect(game.state.pendingEffect).toBeNull();
      expect(ids(game.state.players.p1.hand)).toContain("fullbody");
    });

    it("OP12-048#2: with no cards in hand Rosinante cannot pay its replacement", () => {
      const game = navyDefends("faq-op12-048-2")
        .withBoard("p1", [
          character("rosinante", "OP12-048"),
          character("fullbody", "OP12-052"),
        ])
        .build();

      boeufBounce(game, "fullbody");

      expect(game.state.pendingEffect).toBeNull();
      expect(ids(game.state.players.p1.hand)).toEqual(["fullbody"]);
    });

    it("OP12-048#3: Rosinante may rest and trash to save itself", () => {
      const game = navyDefends("faq-op12-048-3")
        .withBoard("p1", [character("rosinante", "OP12-048")])
        .withHand("p1", [instance("fodder", "OP12-045")])
        .build();

      boeufBounce(game, "rosinante");
      expect(game.player).toBe("p1");
      game.play({
        type: "resolve-effect",
        summary: "Rest Donquixote Rosinante",
      });
      settle(game, "fodder");

      expect(game.state.players.p1.board).toEqual([
        expect.objectContaining({ instanceId: "rosinante", rested: true }),
      ]);
      expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
    });
  });

  it("OP12-056#1: the Kuzan Leader's draw comes after Garp's play, so the drawn card cannot be played", () => {
    // The PDF names the Leader "OP12-043 Kuzan"; OP12-043 is a Character, and
    // the Leader whose draw the ruling describes is OP12-040.
    const game = table(KUZAN, ST31, "faq-op12-056-1")
      .withHand("p1", [
        instance("garp", "OP12-056"),
        instance("fodder", "OP12-045"),
      ])
      .withDeckTop("p1", [instance("fullbody", "OP12-052")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-056" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    expect(effectOptions(game)).not.toContain("fullbody");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["garp"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["fullbody"]);
  });

  it("OP12-057#1: Ice Block Pheasant Peck may be activated as the only card in hand", () => {
    const game = defending(KUZAN, ST31, "faq-op12-057-1")
      .withHand("p1", [instance("ice-block", "OP12-057")])
      .withBoard("p2", [character("attacker", "ST31-004")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 7000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "ice-block" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    expect(ids(game.state.players.p1.trash)).toEqual(["ice-block"]);
  });

  it("OP12-058#1: a revealed card that is not played goes back on top of the deck", () => {
    // OP07-053 Portgas.D.Ace is a cost-5 {Whitebeard Pirates} Character.
    const game = table(NEWGATE, ST31, "faq-op12-058-1")
      .withHand("p1", [instance("king", "OP12-058")])
      .withDeckTop("p1", [
        instance("ace", "OP07-053"),
        instance("second", "ST31-003"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP12-058" });
    settle(game, "done");

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.deck)).toEqual(["ace", "second"]);
  });

  it("OP12-059#1: Concasser counts 3 other Events plus itself for its [Counter]", () => {
    const game = defending(SANJI, ST31, "faq-op12-059-1")
      .withHand("p1", [instance("concasser", "OP12-059")])
      .withTrash("p1", copies(3, "OP06-019", "spent"))
      .withBoard("p2", [character("attacker", "ST31-004")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 7000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "concasser" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
  });

  it("OP12-060#1: Boeuf Burst counts the hand after it has left it, so 7 cards still draws 2", () => {
    const game = table(SANJI, ST31, "faq-op12-060-1")
      .withHand("p1", [
        instance("boeuf", "OP12-060"),
        ...copies(6, "OP06-019", "hand"),
      ])
      .withDeckTop("p1", copies(2, "OP06-019", "deck"))
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP12-060" });
    game.play({ type: "resolve-effect", summary: "Draw 2" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(8);
  });
});

describe("FAQ OP-12 purple", () => {
  describe("OP12-061 Donquixote Rosinante (Leader)", () => {
    /** The Rosinante Leader over a shipped Purple deck; no shipped list fronts it. */
    const rosinanteTable = (seed: string) =>
      table(KATAKURI_DECK, ST31, seed).withLeader("p1", "OP12-061");

    const lawPlay = (game: Game, instanceId: string) =>
      game
        .legalActions()
        .find(
          (action) =>
            action.type === "play-card" && action.cardInstanceId === instanceId,
        )?.summary;

    it("OP12-061#1: with no Life cards a [Trafalgar Law] cannot be saved", () => {
      const game = scenario()
        .decks(KATAKURI_DECK, ST31)
        .seed("faq-op12-061-1")
        .atTurn(12, { active: "p2" })
        .bareTable()
        .withLeader("p1", "OP12-061")
        .withBoard("p1", [character("law", "OP12-106", { rested: true })])
        .withBoard("p2", [character("attacker", "ST31-004")])
        .build();
      expect(game.state.players.p1.life).toEqual([]);

      game.play({
        type: "attack",
        attackerInstanceId: "attacker",
        targetInstanceId: "law",
      });
      game.pass();
      game.pass();

      expect(game.state.pendingEffect).toBeNull();
      expect(ids(game.state.players.p1.trash)).toEqual(["law"]);
    });

    it("OP12-061#2: playing a Character that is not [Trafalgar Law] keeps the discount", () => {
      const game = rosinanteTable("faq-op12-061-2")
        .withHand("p1", [
          instance("other", "ST34-005"),
          instance("big-law", "OP12-073"),
        ])
        .build();

      game.play({ type: "activate-main", summary: "Donquixote Rosinante" });
      settle(game);
      game.play({ type: "play-card", cardNumber: "ST34-005" });
      settle(game);

      expect(lawPlay(game, "big-law")).toContain("cost 5 DON!!");
    });

    it("OP12-061#3: playing a [Trafalgar Law] of cost 3 or less keeps the discount", () => {
      const game = rosinanteTable("faq-op12-061-3")
        .withHand("p1", [
          instance("small-law", "OP09-069"),
          instance("big-law", "OP12-073"),
        ])
        .withDeckTop("p1", copies(4, "ST34-005", "deck"))
        .build();

      game.play({ type: "activate-main", summary: "Donquixote Rosinante" });
      settle(game);
      expect(lawPlay(game, "small-law")).toContain("cost 1 DON!!");
      game.play({ type: "play-card", cardNumber: "OP09-069" });
      settle(game);

      expect(lawPlay(game, "big-law")).toContain("cost 5 DON!!");
    });

    it("OP12-061#4: a [Trafalgar Law] played free by an effect does not use up the discount", () => {
      // EB03-062 Trafalgar Law trashes a hand card and itself to play a
      // [Trafalgar Law] of cost 7 or less from hand without paying its cost.
      const game = rosinanteTable("faq-op12-061-4")
        .withBoard("p1", [character("eb-law", "EB03-062")])
        .withHand("p1", [
          instance("fodder", "ST34-005"),
          instance("free-law", "OP12-106"),
          instance("big-law", "OP12-073"),
        ])
        .withDeckTop("p1", copies(2, "ST34-005", "deck"))
        .build();

      game.play({ type: "activate-main", summary: "Donquixote Rosinante" });
      settle(game);
      game.play({ type: "activate-main", summary: "Trafalgar Law" });
      settle(game, "apply", "fodder", "free-law");
      expect(ids(game.state.players.p1.board)).toContain("free-law");

      expect(lawPlay(game, "big-law")).toContain("cost 5 DON!!");
    });
  });

  it("OP12-073#1: with more DON!! than the opponent, Law's +1000 does not happen either", () => {
    const game = table(KATAKURI_DECK, ST31, "faq-op12-073-1")
      .withDonDeck("p2", 5)
      .withHand("p1", [instance("law", "OP12-073")])
      .withBoard("p1", [character("heart", "OP09-069")]) // {Heart Pirates}
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-073" });
    settle(game);

    expect(currentPower(game.state, "p1", "heart")).toBe(2_000);
    expect(currentPower(game.state, "p1", "law")).toBe(8_000);
  });

  it("OP12-075#1: the opponent decides whether to add the DON!!", () => {
    // The same decision `test/op12.test.ts` pins.
    const game = table(KATAKURI_DECK, ST31, "faq-op12-075-1")
      .withHand("p1", [instance("sunday", "OP12-075")])
      .withBoard("p2", [character("victim", "ST31-003")])
      .withDonDeck("p2", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-075" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.pendingEffect?.playerId).toBe("p2");
    expect(effectOptions(game, "p2").sort()).toEqual(["apply", "skip"]);
    expect(effectOptions(game, "p1")).toEqual([]);
  });

  it("OP12-078#1: with more DON!! than the opponent, Brochette Blow's −3000 does not happen either", () => {
    const game = table(SANJI, ST31, "faq-op12-078-1")
      .withDonDeck("p2", 5)
      .withHand("p1", [instance("brochette", "OP12-078")])
      .withBoard("p2", [character("brook", "ST31-003")])
      .withDeckTop("p1", [instance("top", "OP06-019")])
      .build();

    // Nothing the Event would do is on: it is not offered at all.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "OP12-078",
        ),
    ).toBe(false);
    expect(currentPower(game.state, "p2", "brook")).toBe(3_000);
  });

  it("OP12-078#1 (control): level on DON!!, it draws and gives −3000", () => {
    const game = table(SANJI, ST31, "faq-op12-078-1-control")
      .withHand("p1", [instance("brochette", "OP12-078")])
      .withBoard("p2", [character("brook", "ST31-003")])
      .withDeckTop("p1", [instance("top", "OP06-019")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP12-078" });
    settle(game, "brook");

    expect(ids(game.state.players.p1.hand)).toEqual(["top"]);
    expect(currentPower(game.state, "p2", "brook")).toBe(0);
  });

  it("OP12-079#1: the card added to hand is not revealed to the opponent", () => {
    const game = table(SANJI, ST31, "faq-op12-079-1")
      .withHand("p1", [instance("king", "OP12-079")])
      .withDeckTop("p1", [
        instance("pick", "OP06-019"),
        instance("rest-1", "OP09-077"),
        instance("rest-2", "OP09-077"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP12-079" });
    settle(game, "pick");
    expect(ids(game.state.players.p1.hand)).toEqual(["pick"]);

    expect(
      observe(game.state, "p2").publicEvents.filter(
        (event) =>
          event.type === "card-revealed" && event.cardNumber === "OP06-019",
      ),
    ).toEqual([]);
  });
});

describe("FAQ OP-12 black and yellow", () => {
  describe("OP12-081 Koala (Leader)", () => {
    it("OP12-081#1: a Character played by its own [Trigger] is not played by a Character's effect", () => {
      // OP12-075 Ms. All Sunday's [Trigger] plays itself (cost 4).
      const game = table(KOALA, "FIXTURE-RED", "faq-op12-081-1")
        .withLife("p2", [
          instance("sunday", "OP12-075"),
          instance("p2-life-2", "ST34-005"),
        ])
        .build();

      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "p2-leader",
      });
      game.pass();
      game.pass();
      expect(game.state.phase).toBe("trigger");
      game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
      settle(game, "apply", "skip");

      expect(ids(game.state.players.p2.board)).toEqual(["sunday"]);
      expect(ids(game.state.players.p2.life)).toEqual(["p2-life-2"]);
    });

    it("OP12-081#2: a cost-8 Character played by a Character's effect takes only 1 Life card", () => {
      // EB04-025 Nefeltari Vivi (cost 7) plays EB04-023 Chaka & Pell (cost 8)
      // from hand: both of Koala's conditions at once.
      const game = defending(KOALA, ST31, "faq-op12-081-2")
        .withHand("p2", [
          instance("vivi", "EB04-025"),
          instance("chaka", "EB04-023"),
          instance("bottom", "ST31-003"),
        ])
        .withLife("p2", copies(3, "ST31-003", "p2-life"))
        .build();

      game.play({ type: "play-card", cardNumber: "EB04-025" });
      // Chaka & Pell's own [On Play] is declined; Koala's is applied.
      game.play({ type: "resolve-effect", optionId: "chaka" });
      game.play({ type: "resolve-effect", optionId: "skip" });
      game.play({ type: "resolve-effect", optionId: "apply" });
      settle(game, "skip", "bottom");

      expect(ids(game.state.players.p2.board).sort()).toEqual([
        "chaka",
        "vivi",
      ]);
      expect(game.state.players.p2.life).toHaveLength(2);
    });

    // Koala passes on Sanji (nothing to take at 0 Life) and keeps its use.
    it("OP12-081#3: Koala can wait past Sanji and answer the Linlin it plays, after Linlin's Life gain", () => {
      // p2 sits on 0 Life. OP06-119 Sanji (cost 9) plays OP08-069 Charlotte
      // Linlin off the top of the deck, whose [On Play] adds a Life card.
      const game = defending(KOALA, ST31, "faq-op12-081-3")
        .withHand("p2", [
          instance("sanji", "OP06-119"),
          instance("fodder", "ST31-003"),
        ])
        .withDeckTop("p2", [
          instance("linlin", "OP08-069"),
          instance("new-life", "ST31-003"),
        ])
        .build();
      expect(game.state.players.p2.life).toEqual([]);

      game.play({ type: "play-card", cardNumber: "OP06-119" });
      settle(game, "linlin", "apply", "fodder");

      expect(ids(game.state.players.p2.board).sort()).toEqual([
        "linlin",
        "sanji",
      ]);
      expect(game.state.players.p2.life).toEqual([]);
      expect(ids(game.state.players.p2.hand)).toContain("new-life");
    });
  });

  describe("OP12-099 Kalgara", () => {
    const kalgaraAttacks = (seed: string, kalgaras: number) => {
      const game = table(KOALA, ST31, seed)
        .withBoard(
          "p1",
          copies(kalgaras, "OP12-099", "kalgara").map((card) =>
            character(card.instanceId, card.cardNumber),
          ),
        )
        .withDeckTop("p1", copies(3, "ST31-003", "p1-deck"))
        .withLife("p2", copies(2, "FIX-001", "p2-life"))
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "p2-leader",
      });
      game.pass();
      game.pass();
      settle(game);
      return game;
    };

    it("OP12-099#1: the opponent's Life card leaving draws a card", () => {
      const game = kalgaraAttacks("faq-op12-099-1", 1);

      expect(game.state.players.p2.life).toHaveLength(1);
      expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
    });

    it("OP12-099#2: a second Kalgara draws nothing once the first has locked draws", () => {
      const game = kalgaraAttacks("faq-op12-099-2", 2);

      expect(ids(game.state.players.p1.hand)).toEqual(["p1-deck-1"]);
    });
  });

  it("OP12-102#1: Shirahoshi may turn a Life card face-up to save itself", () => {
    // p2's OP12-075 Ms. All Sunday K.O.s a Character of cost 3 or less.
    const game = defending(KOALA, KATAKURI_DECK, "faq-op12-102-1")
      .withBoard("p1", [character("shirahoshi", "OP12-102")])
      .withLife("p1", copies(2, "ST31-003", "p1-life"))
      .withHand("p2", [instance("sunday", "OP12-075")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-075" });
    game.play({ type: "resolve-effect", optionId: "shirahoshi" });
    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", summary: "Turn 1 card" });
    settle(game, "skip");

    expect(ids(game.state.players.p1.board)).toEqual(["shirahoshi"]);
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
  });

  describe("OP12-118 Jewelry Bonney", () => {
    /** `rested` DON!! before Bonney's 5 are paid. */
    const bonneyTable = (seed: string, rested: number) =>
      table(ZORO, ST31, seed)
        .withDon("p1", { rested })
        .withHand("p1", [instance("bonney", "OP12-118")])
        .withDeckTop("p1", copies(2, "ST32-005", "deck"))
        .build();

    it("OP12-118#1: with 7 rested cards no DON!! is set active", () => {
      const game = bonneyTable("faq-op12-118-1", 2);
      game.play({ type: "play-card", cardNumber: "OP12-118" });
      settle(game);

      expect(game.state.players.p1.restedDon).toHaveLength(7);
      expect(game.state.players.p1.hand).toEqual([]);
    });

    it("OP12-118#1 (control): with 8 rested cards it draws and sets a DON!! active", () => {
      const game = bonneyTable("faq-op12-118-1-control", 3);
      game.play({ type: "play-card", cardNumber: "OP12-118" });
      settle(game);

      expect(game.state.players.p1.restedDon).toHaveLength(7);
      expect(game.state.players.p1.hand).toHaveLength(1);
    });
  });
});
