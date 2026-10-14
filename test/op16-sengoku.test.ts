import { describe, expect, it } from "vitest";
import { loadDeck, requireSupportedDeck } from "@one-piece-sim/decks";
import {
  currentPower,
  fieldDonCount,
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
} from "./support/index.js";

/**
 * (Purple) Sengoku: the list in
 * `packages/decks/src/op16-sengoku-manifest.ts`.
 *
 * Four of the deck's thirteen slots -- OP16-060's Leader ability and the
 * `[On Play]`/`[Activate: Main]` halves of Kuzan, Sakazuki and Garp -- came
 * into the pool with the set and are driven by `test/op16.test.ts`; Mamaragan
 * arrived with the Enel list and is driven by `test/op16-enel.test.ts`. What is
 * here is the nine identities this deck is the first shipped list to reach.
 *
 * Every DON!! clause below asserts the *whole* movement, not just the addition:
 * where the card prints a rest cost the rested count is checked too, and where
 * it prints a Leader condition the position is built twice, once behind
 * OP16-060 and once behind a Leader without the {Navy} type. A ramp clause
 * tested only for the DON!! it adds is a clause that could be ignoring both its
 * cost and its condition.
 */

const DECK = "(Purple) Sengoku - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** p1 on the turn behind OP16-060, clear board, all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/**
 * The same position behind a Leader without the {Navy} type.
 *
 * Half the deck's clauses read "If your Leader has the {Navy} type", and the
 * only way to show the check is live is to fail it -- `withLeader` swaps in
 * ST31's Red Luffy, whose types share nothing with the Navy shell.
 */
const offType = (seed: string) => table(seed).withLeader("p1", "ST31-001");

/** p1 defending, for the clauses that only fire under an attack. */
const defending = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

function options(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/**
 * p1 defending a 6000-power attack on their Leader, at the Counter step.
 *
 * The Counter clause is only offered against an attack that would otherwise
 * connect, so the attacker carries given DON!! -- a bare ST31 body reads as
 * 3000 against a 5000 Leader and the engine correctly never asks.
 */
function counterBattle(seed: string, board: ReturnType<typeof character>[]) {
  const game = defending(seed)
    .withBoard("p1", board)
    .withBoard("p2", [character("attacker", "ST31-003", { playedTurn: 1 })])
    .withGivenDon("p2", "attacker", 3)
    .withHand("p1", [instance("event", "OP16-076")])
    .withLife("p1", copies(1, "OP16-062", "life"))
    .build();

  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  game.pass();
  return game;
}

/** Resolve the rest of an open effect, taking the first offer at each step. */
function finish(game: {
  state: GameState;
  play: (matcher: { type: "resolve-effect" }) => unknown;
}) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

describe("(Purple) Sengoku deck list", () => {
  it("loads a 50-card list behind OP16-060", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP16-060");
    expect(loadDeck(DECK)).toHaveLength(50);
  });

  it("runs the 7-cost Admirals its DON!! deck can actually reach", () => {
    // The mirror of `test/op16-enel.test.ts`'s Borsalino case: there the
    // Leader prints a six-card DON!! deck and a 7-cost is uncastable, here the
    // Leader prints ten and the whole list is built to fill it.
    const game = table("op16-sengoku-seven-cost")
      .withHand("p1", [instance("borsalino", "OP16-073")])
      .build();

    expect(fieldDonCount(game.state, "p1")).toBe(10);
    expect(
      game.action({ type: "play-card", cardNumber: "OP16-073" }),
    ).toBeDefined();
  });
});

describe("OP16-064 Koby", () => {
  covers("OP16-064", "[On Play]");

  it("digs 5 for a {Navy} card and buries the rest", () => {
    const game = table("op16-064-dig")
      .withHand("p1", [instance("koby", "OP16-064")])
      .withDeckTop("p1", [
        ...copies(4, "ST32-004", "chaff"),
        instance("tsuru", "OP16-067"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-064" });
    game.play({ type: "resolve-effect", optionId: "tsuru" });
    finish(game);

    expect(game.state.players.p1.hand).toEqual([
      expect.objectContaining({ instanceId: "tsuru" }),
    ]);
    // The four it did not take are at the bottom, not in the trash.
    expect(game.state.players.p1.trash).toEqual([]);
    expect(game.state.players.p1.deck.slice(-4)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardNumber: "ST32-004" }),
      ]),
    );
  });

  it("cannot find a second copy of itself", () => {
    const game = table("op16-064-exclude")
      .withHand("p1", [instance("koby", "OP16-064")])
      .withDeckTop("p1", [
        ...copies(4, "ST32-004", "chaff"),
        instance("koby-2", "OP16-064"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-064" });

    // {Navy} and in the five, and still not on offer -- "other than [Koby]".
    expect(options(game.state)).not.toContain("koby-2");
  });
});

describe("OP16-067 Tsuru", () => {
  covers("OP16-067", "[On Play]");

  it("digs 5 for a {Navy} card and then trashes one, mandatorily", () => {
    const game = table("op16-067-dig")
      .withHand("p1", [
        instance("tsuru", "OP16-067"),
        instance("spare", "OP16-062"),
      ])
      .withDeckTop("p1", [
        ...copies(4, "ST32-004", "chaff"),
        instance("garp", "OP16-075"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-067" });
    game.play({ type: "resolve-effect", optionId: "garp" });
    finish(game);

    // The discard is not optional, so the hand nets zero: one found, one gone.
    expect(game.state.players.p1.trash).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("may pitch the card it just found", () => {
    const game = table("op16-067-pitch-find")
      .withHand("p1", [instance("tsuru", "OP16-067")])
      .withDeckTop("p1", [
        ...copies(4, "ST32-004", "chaff"),
        instance("garp", "OP16-075"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-067" });
    game.play({ type: "resolve-effect", optionId: "garp" });

    // The search resolved before the discard chose, so Garp is in hand and
    // eligible -- which is the only reason an empty hand is not a stuck effect.
    expect(options(game.state)).toContain("garp");
  });
});

describe("OP16-066 Sengoku", () => {
  covers("OP16-066", "[On Play]");

  it("ramps two rested DON!! and churns two cards behind a {Navy} Leader", () => {
    const game = table("op16-066-navy")
      .withHand("p1", [
        instance("sengoku", "OP16-066"),
        instance("keep", "OP16-062"),
      ])
      .withDonDeck("p1", 3)
      .withDeckTop("p1", copies(2, "ST32-004", "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-066" });
    finish(game);

    // Five of the seven on the field pay for it, and two more arrive rested.
    expect(game.state.players.p1.restedDon).toHaveLength(7);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    // Drew two and trashed two, so the one card it was held with survives.
    expect(game.state.players.p1.trash).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("is a plain body behind a Leader without the {Navy} type", () => {
    const game = offType("op16-066-off-type")
      .withHand("p1", [instance("sengoku", "OP16-066")])
      .withDonDeck("p1", 3)
      .withDeckTop("p1", copies(2, "ST32-004", "undrawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-066" });
    finish(game);

    // The printed "Then" continues the conditional, so the draw and the
    // discard go with the DON!!: none of it happens.
    expect(game.state.players.p1.donDeck).toHaveLength(3);
    expect(game.state.players.p1.hand).toEqual([]);
    expect(game.state.players.p1.trash).toEqual([]);
  });
});

describe("OP16-070 Donquixote Rosinante", () => {
  covers("OP16-070", "[On Play]", "[Blocker]");

  it("rests two DON!! to add one, netting a card on the field", () => {
    const game = table("op16-070-ramp")
      .withHand("p1", [instance("rosinante", "OP16-070")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-070" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    finish(game);

    // Two of the seven pay for the body, two more rest as the cost, and one
    // arrives rested: no active DON!! this turn, one more card on the field.
    expect(game.state.players.p1.activeDon).toHaveLength(3);
    expect(game.state.players.p1.restedDon).toHaveLength(5);
    expect(fieldDonCount(game.state, "p1")).toBe(8);
  });

  it("may decline the rest cost", () => {
    const game = table("op16-070-decline")
      .withHand("p1", [instance("rosinante", "OP16-070")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-070" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    finish(game);

    expect(fieldDonCount(game.state, "p1")).toBe(7);
    expect(game.state.players.p1.activeDon).toHaveLength(5);
  });

  it("pays the cost but adds nothing behind a Leader without the {Navy} type", () => {
    const game = offType("op16-070-off-type")
      .withHand("p1", [instance("rosinante", "OP16-070")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-070" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    finish(game);

    // The Leader check sits after the colon, so the DON!! rests either way --
    // this is the one clause in the deck a wrong Leader makes strictly worse
    // than declining.
    expect(game.state.players.p1.donDeck).toHaveLength(3);
    expect(game.state.players.p1.activeDon).toHaveLength(3);
  });

  it("blocks", () => {
    const game = defending("op16-070-blocker")
      .withBoard("p1", [character("rosinante", "OP16-070")])
      .build();

    expect(hasKeyword(game.state, "p1", "rosinante", "Blocker")).toBe(true);
  });
});

describe("OP16-073 Borsalino", () => {
  covers("OP16-073", "[On Play]", "[End of Your Turn]");

  it("adds one active DON!! and one rested one", () => {
    const game = table("op16-073-ramp")
      .withHand("p1", [instance("borsalino", "OP16-073")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-073" });
    finish(game);

    // All seven on the field pay for it; one comes back active, one rested.
    expect(game.state.players.p1.activeDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(8);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("stands itself back up at end of turn and gains [Blocker]", () => {
    const game = table("op16-073-end-of-turn")
      .withBoard("p1", [
        character("borsalino", "OP16-073", { rested: true, playedTurn: 1 }),
      ])
      .build();

    game.pass();
    game.play({ type: "resolve-effect", optionId: "borsalino" });
    finish(game);

    const borsalino = game.state.players.p1.board[0];
    expect(borsalino?.rested).toBe(false);
    // The keyword outlasts the opponent's turn, which is what makes the
    // clause a defence rather than a refresh.
    expect(hasKeyword(game.state, "p1", "borsalino", "Blocker")).toBe(true);
    expect(borsalino?.attachedDon).toEqual([]);
  });

  it("is not offered at end of turn without the two DON!! to pay", () => {
    const game = table("op16-073-cannot-pay")
      .withBoard("p1", [
        character("borsalino", "OP16-073", { rested: true, playedTurn: 1 }),
      ])
      .withDonDeck("p1", 9)
      .build();

    game.pass();

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe('OP16-076 "The Three Admirals!!"', () => {
  covers("OP16-076", "[Main]", "[Counter]");

  it("rests three DON!! to give three Admirals +2000 each", () => {
    const game = table("op16-076-main")
      .withHand("p1", [instance("event", "OP16-076")])
      .withBoard("p1", [
        character("kuzan", "OP16-063"),
        character("sakazuki", "OP16-065"),
        character("borsalino", "OP16-073"),
      ])
      .build();

    game.play({ summary: "Activate The Three Admirals!!" });
    game.play({ type: "resolve-effect", optionId: "kuzan" });
    game.play({ type: "resolve-effect", optionId: "sakazuki" });
    game.play({ type: "resolve-effect", optionId: "borsalino" });
    finish(game);

    for (const id of ["kuzan", "sakazuki", "borsalino"]) {
      expect(currentPower(game.state, "p1", id)).toBe(10000);
    }
    // One DON!! for the Event and three more rested as its cost.
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  it("adds +4000 in the Counter step while an Admiral is on the board", () => {
    const game = counterBattle("op16-076-counter", [
      character("kuzan", "OP16-063"),
    ]);

    game.play({ summary: "The Three Admirals!!" });
    finish(game);
    game.play({ summary: "Resolve battle" });

    // 6000 of attack against a 5000 Leader plus 4000: the attack fails and the
    // Life card stays where it is.
    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("is not offered in the Counter step with no Admiral on the board", () => {
    const game = counterBattle("op16-076-counter-empty", []);

    // The clause is conditional, and adds nothing without an Admiral out, so
    // the hand cannot spend it for any benefit here.
    const counter = game
      .legalActions()
      .find((action) => action.type === "activate-counter-event");
    expect(counter).toBeUndefined();
  });
});

describe('OP16-077 "Buddha" Sengoku', () => {
  covers("OP16-077", "[Main]");

  it("digs 5 for two {Navy} cards and then trashes one", () => {
    const game = table("op16-077-dig")
      .withHand("p1", [instance("event", "OP16-077")])
      .withDeckTop("p1", [
        ...copies(3, "ST32-004", "chaff"),
        instance("garp", "OP16-075"),
        instance("tsuru", "OP16-067"),
      ])
      .build();

    game.play({ summary: 'Activate "Buddha" Sengoku' });
    game.play({ type: "resolve-effect", optionId: "garp" });
    game.play({ type: "resolve-effect", optionId: "tsuru" });
    finish(game);

    // Two found, one pitched: the Event replaces itself and then some.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP16-077");
  });
});

describe("OP16-078 Marineford", () => {
  covers("OP16-078", "[On Play]", "[Activate: Main]");

  it("digs 5 for a {Navy} card as it lands", () => {
    const game = table("op16-078-on-play")
      .withHand("p1", [instance("marineford", "OP16-078")])
      .withDeckTop("p1", [
        ...copies(4, "ST32-004", "chaff"),
        instance("koby", "OP16-064"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-078" });
    game.play({ type: "resolve-effect", optionId: "koby" });
    finish(game);

    expect(game.state.players.p1.hand).toEqual([
      expect.objectContaining({ instanceId: "koby" }),
    ]);
    expect(game.state.players.p1.stage?.cardNumber).toBe("OP16-078");
  });

  it("rests itself and spends a DON!! to churn a card", () => {
    const game = table("op16-078-activate")
      .withStage("p1", character("marineford", "OP16-078"))
      .withHand("p1", [instance("pitch", "OP16-062")])
      .withDeckTop("p1", copies(1, "ST32-004", "drawn"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "marineford" });
    finish(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(fieldDonCount(game.state, "p1")).toBe(9);
    expect(game.state.players.p1.trash).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("cannot be activated twice in a turn -- it rests itself to do it", () => {
    const game = table("op16-078-once")
      .withStage("p1", character("marineford", "OP16-078"))
      .withHand("p1", [instance("pitch", "OP16-062")])
      .withDeckTop("p1", copies(2, "ST32-004", "drawn"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "marineford" });
    finish(game);

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "marineford",
        ),
    ).toBe(false);
  });
});
