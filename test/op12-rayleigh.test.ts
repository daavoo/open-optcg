import { describe, expect, it } from "vitest";
import { deckManifests, validateDeck } from "@one-piece-sim/decks";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * Bandai's (Red) Silvers Rayleigh feature deck, OP12-001: the clauses its
 * fifty brings into the coverage gate. OP12-003, OP12-004 and OP12-016 are
 * driven in `test/op12.test.ts`, OP12-015 and OP12-018 in
 * `test/op17-luffy-ace.test.ts`.
 */

const RAYLEIGH = "(Red) Silvers Rayleigh - Official Feature Deck";
const ZORO = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario()
    .decks(RAYLEIGH, ZORO)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

const defending = (seed: string) =>
  scenario()
    .decks(RAYLEIGH, ZORO)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

type Game = ReturnType<ReturnType<typeof table>["build"]>;

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Answer each pending prompt with `preferred` where it is offered, else the first option. */
function resolveAll(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    const options = effectOptions(game.state);
    const pick = preferred.find((id) => options.includes(id));
    game.play(
      pick
        ? { type: "resolve-effect", optionId: pick }
        : { type: "resolve-effect" },
    );
  }
}

/** Answer the next prompts with `ids` in order, then settle the rest by default. */
function answer(game: Game, ...ids: string[]): void {
  for (const optionId of ids) game.play({ type: "resolve-effect", optionId });
  resolveAll(game);
}

const twoEvents = () => [
  instance("event-1", "OP12-019"),
  instance("event-2", "OP12-018"),
];

const handNumbers = (game: Game) =>
  game.state.players.p1.hand.map((card) => card.cardNumber);

describe("OP12-001 Silvers Rayleigh's deck-construction rule", () => {
  covers("OP12-001", "static");

  it("bars cards with a cost of 5 or more from the deck", () => {
    const manifest = deckManifests[RAYLEIGH]!;
    expect(validateDeck(manifest).errors).toEqual([]);

    // OP12-011 Duval is a red Character costing exactly 5: one copy in place
    // of a Buggy is the one error.
    const barred = {
      ...manifest,
      cards: { ...manifest.cards, "OP12-012": 1, "OP12-011": 1 },
    };
    const errors = validateDeck(barred).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("OP12-011");
    expect(errors[0]).toContain("OP12-001");
  });
});

describe("OP12-001 Silvers Rayleigh's [Activate: Main]", () => {
  covers("OP12-001", "[Activate: Main]");

  it("reveals two Events to give a 4000-or-less Character +2000", () => {
    const game = table("op12-001")
      .withBoard("p1", [
        character("hancock", "OP12-014"),
        character("big", "OP12-002"), // Edward.Newgate, 6000 base power
      ])
      .withHand("p1", twoEvents())
      .build();

    game.play({ type: "activate-main", summary: "Activate Silvers Rayleigh" });
    game.play({ type: "resolve-effect", optionId: "event-1" });
    game.play({ type: "resolve-effect", optionId: "event-2" });
    // The 6000 body is not a legal target; Hancock is.
    expect(effectOptions(game.state)).not.toContain("big");
    resolveAll(game, "hancock");

    expect(currentPower(game.state, "p1", "hancock")).toBe(5_000);
    expect(game.state.players.p1.hand).toHaveLength(2);
    // Once per turn.
    expect(
      game
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.summary.startsWith("Activate Silvers Rayleigh"),
        ),
    ).toEqual([]);
  });

  it("is not offered with one Event in hand", () => {
    const game = table("op12-001-cost")
      .withBoard("p1", [character("hancock", "OP12-014")])
      .withHand("p1", [instance("event-1", "OP12-019")])
      .build();

    expect(
      game
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.summary.startsWith("Activate Silvers Rayleigh"),
        ),
    ).toEqual([]);
  });
});

describe("OP12-006 Shakuyaku and OP12-014 Boa Hancock's [On Play] search", () => {
  covers("OP12-006", "[On Play]");
  covers("OP12-014", "[On Play]");

  for (const [cardNumber, name] of [
    ["OP12-006", "Shakuyaku"],
    ["OP12-014", "Boa Hancock"],
  ] as const) {
    it(`${name} adds a red Event from the top 5 and bottoms the rest`, () => {
      const game = table(`${cardNumber}-search`)
        .withHand("p1", [instance("searcher", cardNumber)])
        .withDeckTop("p1", [
          instance("top-1", "ST32-004"), // green, not eligible
          instance("haki", "OP12-017"),
          instance("top-3", "ST32-004"),
          instance("top-4", "ST32-004"),
          instance("top-5", "ST32-004"),
          instance("sixth", "OP12-019"),
        ])
        .build();

      game.play({ type: "play-card", cardNumber });
      resolveAll(game, "haki");

      expect(handNumbers(game)).toEqual(["OP12-017"]);
      // The five looked at are at the bottom: the sixth card is now the top.
      expect(game.state.players.p1.deck[0]?.instanceId).toBe("sixth");
    });
  }

  it("takes a [Monkey.D.Luffy] as well as a red Event", () => {
    const game = table("op12-006-luffy")
      .withHand("p1", [instance("searcher", "OP12-006")])
      .withDeckTop("p1", [instance("luffy", "OP12-015")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-006" });
    resolveAll(game, "luffy");

    expect(handNumbers(game)).toEqual(["OP12-015"]);
  });
});

describe("OP12-007 Shanks's [On Play]", () => {
  covers("OP12-007", "[On Play]");

  it("gives another {Roger Pirates} Character [Rush]", () => {
    const game = table("op12-007")
      .withHand("p1", [instance("shanks", "OP12-007")])
      .withBoard("p1", [
        character("oden", "OP12-004"),
        character("hancock", "OP12-014"), // not Roger Pirates
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-007" });
    expect(effectOptions(game.state)).not.toContain("hancock");
    expect(effectOptions(game.state)).not.toContain("shanks");
    resolveAll(game, "oden");

    expect(hasKeyword(game.state, "p1", "oden", "Rush")).toBe(true);
  });
});

describe("OP12-009 Jinbe's [On Play]", () => {
  covers("OP12-009", "[On Play]");

  it("reveals two Events for [Rush] and +1000 through the opponent's turn", () => {
    const game = table("op12-009")
      .withHand("p1", [instance("jinbe", "OP12-009"), ...twoEvents()])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-009" });
    resolveAll(game, "apply", "event-1", "event-2");

    const jinbe = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP12-009",
    )!;
    expect(hasKeyword(game.state, "p1", jinbe.instanceId, "Rush")).toBe(true);
    expect(currentPower(game.state, "p1", jinbe.instanceId)).toBe(5_000);
    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("does nothing with one Event in hand", () => {
    const game = table("op12-009-short")
      .withHand("p1", [
        instance("jinbe", "OP12-009"),
        instance("event-1", "OP12-019"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-009" });
    resolveAll(game);

    const jinbe = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP12-009",
    )!;
    expect(hasKeyword(game.state, "p1", jinbe.instanceId, "Rush")).toBe(false);
    expect(currentPower(game.state, "p1", jinbe.instanceId)).toBe(4_000);
  });
});

describe("OP12-012 Buggy's [On Play]", () => {
  covers("OP12-012", "[On Play]");

  it("gives another {Roger Pirates} Character [Blocker] into the opponent's turn", () => {
    const game = table("op12-012")
      .withHand("p1", [instance("buggy", "OP12-012")])
      .withBoard("p1", [character("oden", "OP12-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-012" });
    resolveAll(game, "oden");
    expect(hasKeyword(game.state, "p1", "oden", "Blocker")).toBe(true);

    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    expect(hasKeyword(game.state, "p1", "oden", "Blocker")).toBe(true);
  });
});

describe("OP12-013 Hatchan's [Activate: Main]", () => {
  covers("OP12-013", "[Activate: Main]");

  it("rests itself and reveals two Events to give 2 rested DON!!", () => {
    const game = table("op12-013")
      .withDonDeck("p1", 8)
      .withDon("p1", { rested: 2 })
      .withBoard("p1", [character("hatchan", "OP12-013")])
      .withHand("p1", twoEvents())
      .build();

    game.play({ type: "activate-main", summary: "Hatchan" });
    resolveAll(game, "apply", "event-1", "event-2", "p1-leader");

    const p1 = game.state.players.p1;
    expect(p1.board.find((card) => card.instanceId === "hatchan")?.rested).toBe(
      true,
    );
    expect(p1.restedDon).toHaveLength(0);
    expect(p1.leaderAttachedDon).toHaveLength(2);
    expect(p1.hand).toHaveLength(2);
  });
});

describe("OP12-014 Boa Hancock's [Activate: Main]", () => {
  covers("OP12-014", "[Activate: Main]");

  it("trashes itself to give 2 rested DON!!", () => {
    const game = table("op12-014-main")
      .withDonDeck("p1", 8)
      .withDon("p1", { rested: 2 })
      .withBoard("p1", [character("hancock", "OP12-014")])
      .build();

    game.play({ type: "activate-main", summary: "Boa Hancock" });
    resolveAll(game, "apply", "p1-leader");

    const p1 = game.state.players.p1;
    expect(p1.board).toHaveLength(0);
    expect(p1.trash.map((card) => card.cardNumber)).toContain("OP12-014");
    expect(p1.leaderAttachedDon).toHaveLength(2);
  });
});

describe("OP12-017 Color of Observation Haki's [Main]", () => {
  covers("OP12-017", "[Main]");

  it("gives Rayleigh an active DON!! and adds a 3-or-more-cost Character from 4", () => {
    const game = table("op12-017")
      .withHand("p1", [instance("observation", "OP12-017")])
      .withDeckTop("p1", [
        instance("cheap", "OP12-006"), // cost 1: not eligible
        instance("luffy", "OP12-015"),
        instance("top-3", "ST32-004"),
        instance("top-4", "ST32-004"),
      ])
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", cardNumber: "OP12-017" });
    answer(game, "apply", "p1-leader");

    const p1 = game.state.players.p1;
    expect(p1.leaderAttachedDon).toHaveLength(1);
    expect(p1.activeDon).toHaveLength(activeBefore - 1);
    // Shakuyaku costs 1, so Luffy is the only card of the four it may take.
    expect(handNumbers(game)).toEqual(["OP12-015"]);
  });

  it("adds a red Event: the cost floor is the Character half's alone", () => {
    const game = table("op12-017-event")
      .withHand("p1", [instance("observation", "OP12-017")])
      .withDeckTop("p1", [
        instance("cheap", "OP12-006"),
        instance("supreme", "OP12-018"),
        instance("top-3", "ST32-004"),
        instance("top-4", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP12-017" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    // The cost-1 Character is still not on offer; the 0-cost Event is.
    expect(effectOptions(game.state)).not.toContain("cheap");
    resolveAll(game, "supreme");

    expect(handNumbers(game)).toEqual(["OP12-018"]);
  });
});

describe("the [Silvers Rayleigh] Events' active DON!! price", () => {
  covers("OP12-016", "[Main]");
  covers("OP12-017", "[Main]");
  covers("OP12-019", "[Main]");

  const offered = (game: Game) =>
    game
      .legalActions()
      .filter((action) => action.type === "activate-main")
      .map((action) => action.sourceCardNumber)
      .filter((card) => card !== "OP12-001")
      .sort();

  const hand = () => [
    instance("never-doubt", "OP12-016"),
    instance("observation", "OP12-017"),
    instance("arms", "OP12-019"),
  ];

  it("offers none of the three with no active DON!!", () => {
    // The DON!! are all rested: the payoff used to resolve for an attach that
    // moved nothing.
    const game = table("op12-rayleigh-don-price-0")
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 4 })
      .withHand("p1", hand())
      .build();

    expect(game.state.players.p1.activeDon).toHaveLength(0);
    expect(offered(game)).toEqual([]);
  });

  it("offers the one-DON!! Events but not the two-DON!! one with one active", () => {
    const game = table("op12-rayleigh-don-price-1")
      .withDonDeck("p1", 10)
      .withDon("p1", { active: 1 })
      .withHand("p1", hand())
      .build();

    expect(offered(game)).toEqual(["OP12-017", "OP12-019"]);
  });
});

describe("OP12-019 Color of Arms Haki", () => {
  covers("OP12-019", "[Main]", "[Counter]");

  it("[Main] gives Rayleigh an active DON!! and a card +1000", () => {
    const game = table("op12-019")
      .withHand("p1", [instance("arms", "OP12-019")])
      .withBoard("p1", [character("hancock", "OP12-014")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP12-019" });
    answer(game, "apply", "p1-leader", "hancock");

    // The DON!! lands on the Leader's own pile. A bound Leader used to be
    // looked up on the board, so the DON!! went back unspent and the +1000
    // resolved for free.
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(currentPower(game.state, "p1", "hancock")).toBe(4_000);
  });

  it("[Counter] gives +2000 in battle", () => {
    const game = defending("op12-019-counter")
      .withHand("p1", [instance("arms", "OP12-019")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "arms" });
    resolveAll(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
  });
});
