import { describe, expect, it } from "vitest";
import {
  createGame,
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { deckManifests, resolveDeck, validateDeck } from "@one-piece-sim/decks";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Black) Imu feature deck: the clauses its fifty brings into the coverage
 * gate, and the two Leader rules that are not activations -- the Stage it
 * starts the game with and the Event cost it bars from the deck.
 *
 * Built on the Imu deck against the Rebecca deck, with `bareTable()` emptying
 * both, so each position holds only the cards its clause needs.
 */
const IMU = "(Black) Imu - Official Feature Deck";
const REBECCA = "(Blue) Rebecca - Official Feature Deck";

const table = (seed: string) =>
  scenario().decks(IMU, REBECCA).seed(seed).atTurn(11, { active: "p1" });

const bare = (seed: string) => table(seed).bareTable();

/** The opponent's turn, for the [Counter] and [Blocker] windows. */
const defending = (seed: string) =>
  scenario()
    .decks(IMU, REBECCA)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

/** Filler for the trash thresholds: vanilla bodies, so nothing else reads them. */
const mill = (count: number) => copies(count, "OP10-054", "mill");

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer).flatMap((action) =>
    action.type === "resolve-effect" && action.optionId
      ? [action.optionId]
      : [],
  );
}

const offersActivation = (state: GameState, sourceInstanceId: string) =>
  getLegalActions(state, state.activePlayer).some(
    (action) =>
      action.type === "activate-main" &&
      action.sourceInstanceId === sourceInstanceId,
  );

function settle(game: {
  state: GameState;
  play: (matcher: { type: "resolve-effect" }) => unknown;
}): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

const opponentAttack = (target: string, attackPower = 6_000) =>
  ({
    attackerPlayerId: "p2",
    defenderPlayerId: "p1",
    attackerInstanceId: "attacker",
    targetInstanceId: target,
    attackPower,
    counterPower: 0,
  }) as const;

describe("OP13-079 Imu's setup rules", () => {
  covers("OP13-079", "static");

  it("starts the game with its {Mary Geoise} Stage in play, out of the deck", () => {
    const state = createGame({
      gameId: "imu-setup",
      p1: resolveDeck(IMU),
      p2: resolveDeck(REBECCA),
      seed: "imu-setup",
    });
    const imu = state.players.p1;

    expect(imu.stage).toMatchObject({ cardNumber: "OP13-099", rested: false });
    // The fifty's one Stage went to the field before the hand was drawn, so the
    // hand is still five and the deck holds the other forty-four.
    expect(imu.hand).toHaveLength(5);
    expect(imu.deck).toHaveLength(44);
    const everywhere = [...imu.hand, ...imu.deck].map(
      (card) => card.cardNumber,
    );
    expect(everywhere).not.toContain("OP13-099");
    expect(state.events).toContainEqual({
      type: "card-played",
      playerId: "p1",
      cardInstanceId: imu.stage!.instanceId,
      cardNumber: "OP13-099",
    });
    // A Leader without the clause starts with no Stage.
    expect(state.players.p2.stage).toBeNull();
  });

  it("keeps the Stage through a mulligan, which redraws from the other 49", () => {
    const game = scenario().decks(IMU, REBECCA).seed("imu-mulligan").build();
    const stage = game.state.players.p1.stage;
    while (game.state.phase === "mulligan") {
      game.play({ type: "mulligan-decision", decision: "mulligan" });
    }
    expect(game.state.players.p1.stage).toEqual(stage);
    expect(
      game.state.players.p1.hand.map((card) => card.cardNumber),
    ).not.toContain("OP13-099");
  });

  it("bars Events with a cost of 2 or more from the deck", () => {
    const manifest = deckManifests[IMU]!;
    expect(validateDeck(manifest).errors).toEqual([]);

    // OP13-097 costs 1 and is in the fifty; OP16-101 Mahoroba is a Black
    // Event costing exactly 2, so swapping one copy for it is the one error.
    const barred = {
      ...manifest,
      cards: { ...manifest.cards, "OP13-097": 3, "OP16-101": 1 },
    };
    const errors = validateDeck(barred).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("OP16-101");
    expect(errors[0]).toContain("OP13-079");
  });
});

describe("OP13-079 Imu's [Activate: Main]", () => {
  covers("OP13-079", "[Activate: Main]");

  it("trashes a {Celestial Dragons} Character to draw, once a turn", () => {
    const game = bare("imu-leader-body")
      .withBoard("p1", [
        character("shalria", "OP13-086"),
        character("outsider", "OP10-054"),
      ])
      .withHand("p1", [instance("kept", "OP13-097")])
      .withDeckTop("p1", [instance("drawn", "OP13-089")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    // Either payment is offered -- the {Celestial Dragons} body or any card in
    // hand -- but never a Character of another type.
    const options = effectOptions(game.state);
    expect(options).toEqual(expect.arrayContaining(["shalria", "kept"]));
    expect(options).not.toContain("outsider");
    game.play({ type: "resolve-effect", optionId: "shalria" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["shalria"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["kept", "drawn"]);
    expect(offersActivation(game.state, "p1-leader")).toBe(false);
  });

  it("pays with a card from hand instead", () => {
    const game = bare("imu-leader-hand")
      .withHand("p1", [instance("spent", "OP13-097")])
      .withDeckTop("p1", [instance("drawn", "OP13-089")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "spent" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["spent"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });
});

describe("The Five Elders' trash-count statics", () => {
  covers("OP13-080", "static");
  covers("OP13-083", "static");
  covers("OP13-091", "static");

  it("OP13-080 Nusjuro gains [Rush] at seven cards in the trash", () => {
    const deep = bare("nusjuro-rush")
      .withBoard("p1", [character("nusjuro", "OP13-080", { playedTurn: 11 })])
      .withTrash("p1", mill(7))
      .build();
    expect(hasKeyword(deep.state, "p1", "nusjuro", "Rush")).toBe(true);
    expect(
      deep
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "nusjuro",
        ),
    ).toBe(true);

    const shallow = bare("nusjuro-no-rush")
      .withBoard("p1", [character("nusjuro", "OP13-080", { playedTurn: 11 })])
      .withTrash("p1", mill(6))
      .build();
    expect(hasKeyword(shallow.state, "p1", "nusjuro", "Rush")).toBe(false);
  });

  it("OP13-091 Mars gains [Blocker] at seven cards in the trash", () => {
    const deep = bare("mars-blocker")
      .withBoard("p1", [character("mars", "OP13-091")])
      .withTrash("p1", mill(7))
      .build();
    expect(hasKeyword(deep.state, "p1", "mars", "Blocker")).toBe(true);

    const shallow = bare("mars-no-blocker")
      .withBoard("p1", [character("mars", "OP13-091")])
      .withTrash("p1", mill(6))
      .build();
    expect(hasKeyword(shallow.state, "p1", "mars", "Blocker")).toBe(false);
  });

  it.each([
    ["OP13-080", "nusjuro"],
    ["OP13-083", "saturn"],
    ["OP13-091", "mars"],
  ])(
    "%s cannot be K.O.'d by an opponent's effect at seven cards, and can at six",
    (cardNumber, id) => {
      // OP10-079 God Thread K.O.s a Character costing 5 or less -- Saturn at 4
      // is in range as printed, and the two 6-costs are brought into range by
      // nothing, so they are probed against OP13-097's own base-cost-6 K.O.
      // from the other seat instead.
      const removal = cardNumber === "OP13-083" ? "OP10-079" : "OP13-097";
      const probe = (trash: number) => {
        const game = scenario()
          .decks(REBECCA, IMU)
          .seed(`elders-immunity-${cardNumber}-${trash}`)
          .atTurn(11, { active: "p1" })
          .bareTable()
          .withLeader("p1", "OP13-079")
          // OP13-097 needs a {Celestial Dragons} Character of its own.
          .withBoard("p1", [character("jalmac", "OP13-085")])
          .withBoard("p2", [character(id, cardNumber)])
          .withTrash("p2", mill(trash))
          .withHand("p1", [instance("removal", removal)])
          .build();
        game.play({ type: "activate-main", sourceInstanceId: "removal" });
        if (effectOptions(game.state).includes("apply")) {
          game.play({ type: "resolve-effect", optionId: "apply" });
        }
        game.play({ type: "resolve-effect", optionId: id });
        settle(game);
        return ids(game.state.players.p2.board);
      };
      expect(probe(7)).toContain(id);
      expect(probe(6)).not.toContain(id);
    },
  );
});

describe("OP13-080 St. Ethanbaron V. Nusjuro [When Attacking]", () => {
  covers("OP13-080", "[When Attacking]");

  const swing = (seed: string, trash: number) => {
    const game = bare(seed)
      .withBoard("p1", [character("nusjuro", "OP13-080")])
      .withBoard("p2", [character("target", "OP10-054")])
      .withTrash("p1", mill(trash))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "nusjuro",
      targetInstanceId: "p2-leader",
    });
    if (effectOptions(game.state).includes("target")) {
      game.play({ type: "resolve-effect", optionId: "target" });
    }
    settle(game);
    return game;
  };

  it("gives an opponent's Character −2000 at ten cards in the trash", () => {
    const game = swing("nusjuro-attack-deep", 10);
    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
  });

  it("does nothing at nine", () => {
    const game = swing("nusjuro-attack-shallow", 9);
    expect(currentPower(game.state, "p2", "target")).toBe(5_000);
  });
});

describe("OP13-083 St. Jaygarcia Saturn [On Play]", () => {
  covers("OP13-083", "[On Play]");

  it("adds a {Five Elders} card from the top five and bottoms the rest", () => {
    const game = bare("saturn-on-play")
      .withHand("p1", [instance("saturn", "OP13-083")])
      .withDeckTop("p1", [
        instance("vanilla-1", "OP10-054"),
        instance("elders", "OP13-082"),
        instance("shalria", "OP13-086"),
        instance("vanilla-2", "OP10-054"),
        instance("vanilla-3", "OP10-054"),
        instance("sixth", "OP13-089"),
      ])
      .build();

    game.play({ type: "play-card", cardInstanceId: "saturn" });
    // Shalria is {Celestial Dragons} but not {Five Elders}, so it is not
    // offered; the sixth card is outside the look.
    const options = effectOptions(game.state);
    expect(options).toContain("elders");
    expect(options).not.toContain("shalria");
    expect(options).not.toContain("sixth");
    game.play({ type: "resolve-effect", optionId: "elders" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["elders"]);
    const deck = ids(game.state.players.p1.deck);
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(1).sort()).toEqual(
      ["shalria", "vanilla-1", "vanilla-2", "vanilla-3"].sort(),
    );
  });
});

describe("OP13-086 Saint Shalria [On Play]", () => {
  covers("OP13-086", "[On Play]");

  it("adds a {Celestial Dragons} card, trashes the rest and a card from hand", () => {
    const game = bare("shalria-on-play")
      .withHand("p1", [
        instance("shalria", "OP13-086"),
        instance("discard", "OP13-097"),
      ])
      .withDeckTop("p1", [
        instance("other-shalria", "OP13-086"),
        instance("warcury", "OP13-089"),
        instance("vanilla", "OP10-054"),
        instance("fourth", "OP13-091"),
      ])
      .build();

    game.play({ type: "play-card", cardInstanceId: "shalria" });
    // "Other than [Saint Shalria]": the second copy is not offered.
    const options = effectOptions(game.state);
    expect(options).toContain("warcury");
    expect(options).not.toContain("other-shalria");
    game.play({ type: "resolve-effect", optionId: "warcury" });
    if (effectOptions(game.state).includes("discard")) {
      game.play({ type: "resolve-effect", optionId: "discard" });
    }
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["warcury"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(
      ["discard", "other-shalria", "vanilla"].sort(),
    );
    expect(ids(game.state.players.p1.deck)[0]).toBe("fourth");
  });
});

describe("OP13-087 Saint Charlos", () => {
  covers("OP13-087", "[On Play]", "[Blocker]");

  it("[On Play] trashes the top card of the deck", () => {
    const game = bare("charlos-on-play")
      .withHand("p1", [instance("charlos", "OP13-087")])
      .withDeckTop("p1", [
        instance("milled", "OP13-089"),
        instance("second", "OP10-054"),
      ])
      .build();

    game.play({ type: "play-card", cardInstanceId: "charlos" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["milled"]);
    expect(ids(game.state.players.p1.deck)[0]).toBe("second");
  });

  it("[Blocker] takes an attack aimed at the Leader", () => {
    const game = defending("charlos-blocker")
      .withBoard("p1", [character("charlos", "OP13-087")])
      .withBoard("p2", [character("attacker", "OP10-054")])
      .withActiveAttack(opponentAttack("p1-leader"))
      .build();

    game.play({ type: "block", blockerInstanceId: "charlos" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("charlos");
  });
});

describe("OP13-091 St. Marcus Mars [On Play]", () => {
  covers("OP13-091", "[On Play]");

  it("trashes a card from hand to K.O. a base cost of 5 or less", () => {
    const game = bare("mars-on-play")
      .withHand("p1", [
        instance("mars", "OP13-091"),
        instance("discard", "OP13-097"),
      ])
      .withBoard("p2", [
        character("five", "OP15-046", { playedTurn: 1 }),
        character("three", "OP10-054"),
      ])
      .build();

    game.play({ type: "play-card", cardInstanceId: "mars" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "discard" });
    // OP15-046 Sabo costs 7: out of range.
    const options = effectOptions(game.state);
    expect(options).toContain("three");
    expect(options).not.toContain("five");
    game.play({ type: "resolve-effect", optionId: "three" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["discard"]);
    expect(ids(game.state.players.p2.board)).toEqual(["five"]);
  });

  it("K.O.s nothing when the trash cost is declined", () => {
    const game = bare("mars-declined")
      .withHand("p1", [
        instance("mars", "OP13-091"),
        instance("kept", "OP13-097"),
      ])
      .withBoard("p2", [character("three", "OP10-054")])
      .build();

    game.play({ type: "play-card", cardInstanceId: "mars" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["kept"]);
    expect(ids(game.state.players.p2.board)).toEqual(["three"]);
  });
});

describe("OP13-095 Saint Rosward [On Play]", () => {
  covers("OP13-095", "[On Play]");

  const rosward = (seed: string, ownBoard: ReturnType<typeof character>[]) =>
    bare(seed)
      .withHand("p1", [
        instance("rosward", "OP13-095"),
        instance("discard", "OP13-097"),
      ])
      .withBoard("p1", ownBoard)
      .withBoard("p2", [
        character("one", "OP15-053"),
        character("three", "OP10-054"),
        character("seven", "OP15-046"),
      ])
      .build();

  it("K.O.s up to two base cost 3 or less with only {Celestial Dragons} out", () => {
    const game = rosward("rosward-ko", [character("charlos", "OP13-087")]);
    game.play({ type: "play-card", cardInstanceId: "rosward" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "discard" });
    const options = effectOptions(game.state);
    expect(options).not.toContain("seven");
    game.play({ type: "resolve-effect", optionId: "one" });
    game.play({ type: "resolve-effect", optionId: "three" });
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["seven"]);
  });

  it("skips a second target that a replacement for the first moved off the field", () => {
    // OP15-052 Leo answers the K.O. of Blue Gilly by placing a Character at
    // the bottom of the deck instead, and Sanji -- Rosward's second target --
    // is the one placed. The K.O. still queued for Sanji then finds it in the
    // deck, which used to throw mid-resolution.
    const game = bare("rosward-leo")
      .withHand("p1", [
        instance("rosward", "OP13-095"),
        instance("discard", "OP13-097"),
      ])
      .withBoard("p2", [
        character("leo", "OP15-052"),
        character("gilly", "OP10-054"),
        character("sanji", "OP15-047"),
      ])
      .build();

    game.play({ type: "play-card", cardInstanceId: "rosward" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "discard" });
    game.play({ type: "resolve-effect", optionId: "gilly" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    game.play({ type: "resolve-effect", optionId: "replace:leo" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    // Moving Sanji is itself a removal Leo could answer; let it go.
    if (effectOptions(game.state).includes("remove:sanji")) {
      game.play({ type: "resolve-effect", optionId: "remove:sanji" });
    }
    settle(game);

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p2.board).sort()).toEqual(["gilly", "leo"]);
    expect(ids(game.state.players.p2.deck)).toContain("sanji");
  });

  it("pays but K.O.s nothing beside a Character of another type", () => {
    const game = rosward("rosward-mixed", [character("outsider", "OP10-054")]);
    game.play({ type: "play-card", cardInstanceId: "rosward" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "discard" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["discard"]);
    expect(ids(game.state.players.p2.board)).toHaveLength(3);
  });
});

describe("OP13-096 The Five Elders Are at Your Service!!!", () => {
  covers("OP13-096", "[Main]", "[Trigger]");

  it("[Main] adds a {Celestial Dragons} card from the top three and trashes the rest", () => {
    const game = bare("service-main")
      .withHand("p1", [instance("service", "OP13-096")])
      .withDeckTop("p1", [
        instance("other-service", "OP13-096"),
        instance("saturn", "OP13-083"),
        instance("vanilla", "OP10-054"),
        instance("fourth", "OP13-091"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "service" });
    const options = effectOptions(game.state);
    expect(options).toContain("saturn");
    expect(options).not.toContain("other-service");
    game.play({ type: "resolve-effect", optionId: "saturn" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["saturn"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(
      ["other-service", "service", "vanilla"].sort(),
    );
    expect(ids(game.state.players.p1.deck)[0]).toBe("fourth");
  });

  it("[Trigger] runs the same search from Life", () => {
    const game = scenario()
      .decks(REBECCA, IMU)
      .seed("service-trigger")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "OP10-054")])
      .withLife("p2", [instance("life", "OP13-096")])
      .withDeckTop("p2", [
        instance("warcury", "OP13-089"),
        instance("vanilla-1", "OP10-054"),
        instance("vanilla-2", "OP10-054"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "warcury" });
    settle(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["warcury"]);
    expect(ids(game.state.players.p2.trash).sort()).toEqual(
      ["life", "vanilla-1", "vanilla-2"].sort(),
    );
  });
});

describe("OP13-097 The World's Equilibrium Cannot Be Maintained Forever", () => {
  covers("OP13-097", "[Main]", "[Counter]");

  const equilibrium = (
    seed: string,
    ownBoard: ReturnType<typeof character>[],
  ) =>
    bare(seed)
      .withHand("p1", [instance("equilibrium", "OP13-097")])
      .withBoard("p1", ownBoard)
      .withBoard("p2", [
        character("six", "OP10-014"),
        character("seven", "OP15-046"),
      ])
      .build();

  it("[Main] rests five DON!! to K.O. a base cost of 6 or less", () => {
    const game = equilibrium("equilibrium-main", [
      character("warcury", "OP13-089"),
    ]);
    game.play({ type: "activate-main", sourceInstanceId: "equilibrium" });
    if (effectOptions(game.state).includes("apply")) {
      game.play({ type: "resolve-effect", optionId: "apply" });
    }
    const options = effectOptions(game.state);
    expect(options).toContain("six");
    expect(options).not.toContain("seven");
    game.play({ type: "resolve-effect", optionId: "six" });
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["seven"]);
    // Ten DON!! on the field: one pays the Event, five are rested by it.
    expect(game.state.players.p1.restedDon).toHaveLength(6);
  });

  it("[Main] is not offered beside a Character of another type", () => {
    // The condition cannot hold, so the Event would rest five DON!! for
    // nothing; the engine does not offer an activation that does nothing.
    const game = equilibrium("equilibrium-mixed", [
      character("outsider", "OP10-054"),
    ]);
    expect(offersActivation(game.state, "equilibrium")).toBe(false);
  });

  it("[Counter] gives the Leader +3000 for the battle", () => {
    const game = defending("equilibrium-counter")
      .withHand("p1", [instance("equilibrium", "OP13-097")])
      .withBoard("p2", [character("attacker", "OP10-054")])
      .withActiveAttack(opponentAttack("p1-leader"), "counter")
      .build();

    game.play({
      type: "activate-counter-event",
      eventInstanceId: "equilibrium",
    });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
  });
});

describe("OP13-098 Never Existed... in the First Place...", () => {
  covers("OP13-098", "[Main]", "[Counter]");

  it("[Main] rests a DON!! to K.O. an opponent's cost-7 Stage", () => {
    const game = bare("never-existed-main")
      .withHand("p1", [instance("never", "OP13-098")])
      .withStage("p2", instance("throne", "OP13-099"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "never" });
    if (effectOptions(game.state).includes("apply")) {
      game.play({ type: "resolve-effect", optionId: "apply" });
    }
    game.play({ type: "resolve-effect", optionId: "throne" });
    settle(game);

    expect(game.state.players.p2.stage).toBeNull();
    expect(ids(game.state.players.p2.trash)).toContain("throne");
  });

  it("[Main] cannot reach a Stage of another cost", () => {
    const game = bare("never-existed-cheap")
      .withHand("p1", [instance("never", "OP13-098")])
      .withStage("p2", instance("mary", "OP05-097"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "never" });
    settle(game);

    expect(game.state.players.p2.stage?.instanceId).toBe("mary");
  });

  it("[Counter] gives +4000 for the battle under an Imu Leader", () => {
    const game = defending("never-existed-counter")
      .withHand("p1", [instance("never", "OP13-098")])
      .withBoard("p1", [character("warcury", "OP13-089")])
      .withBoard("p2", [character("attacker", "OP10-054")])
      .withActiveAttack(opponentAttack("warcury"), "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "never" });
    if (effectOptions(game.state).includes("warcury")) {
      game.play({ type: "resolve-effect", optionId: "warcury" });
    }
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
  });
});

describe("OP13-099 The Empty Throne", () => {
  covers("OP13-099", "[Activate: Main]", "[Your Turn]");

  it("[Activate: Main] rests itself and three DON!! to play an Elder costing up to the field's DON!!", () => {
    const game = bare("throne-activate")
      .withStage("p1", instance("throne", "OP13-099"))
      .withHand("p1", [
        instance("elders", "OP13-082"),
        instance("mars", "OP13-091"),
        instance("shalria", "OP13-086"),
      ])
      .withDonDeck("p1", 3)
      .build();
    // Seven DON!! on the field: the 10-cost Five Elders is over the ceiling,
    // and Shalria is {Celestial Dragons} but not {Five Elders}.
    game.play({ type: "activate-main", sourceInstanceId: "throne" });
    if (effectOptions(game.state).includes("apply")) {
      game.play({ type: "resolve-effect", optionId: "apply" });
    }
    const options = effectOptions(game.state);
    expect(options).toContain("mars");
    expect(options).not.toContain("elders");
    expect(options).not.toContain("shalria");
    game.play({ type: "resolve-effect", optionId: "mars" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toContain("mars");
    expect(game.state.players.p1.stage?.rested).toBe(true);
    // Three DON!! rested for the Stage, and the 6-cost played for nothing.
    expect(game.state.players.p1.restedDon).toHaveLength(3);
    expect(offersActivation(game.state, "throne")).toBe(false);
  });

  it("[Activate: Main] reaches the 10-cost at ten DON!!", () => {
    const game = bare("throne-ten")
      .withStage("p1", instance("throne", "OP13-099"))
      .withHand("p1", [instance("elders", "OP13-082")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "throne" });
    if (effectOptions(game.state).includes("apply")) {
      game.play({ type: "resolve-effect", optionId: "apply" });
    }
    game.play({ type: "resolve-effect", optionId: "elders" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["elders"]);
  });

  it("[Your Turn] gives the Leader +1000 at 19 cards in the trash", () => {
    const deep = bare("throne-aura")
      .withStage("p1", instance("throne", "OP13-099"))
      .withTrash("p1", mill(19))
      .build();
    expect(currentPower(deep.state, "p1", "p1-leader")).toBe(6_000);

    const shallow = bare("throne-aura-shallow")
      .withStage("p1", instance("throne", "OP13-099"))
      .withTrash("p1", mill(18))
      .build();
    expect(currentPower(shallow.state, "p1", "p1-leader")).toBe(5_000);

    // Only on its controller's turn.
    const theirs = defending("throne-aura-theirs")
      .withStage("p1", instance("throne", "OP13-099"))
      .withTrash("p1", mill(19))
      .build();
    expect(currentPower(theirs.state, "p1", "p1-leader")).toBe(5_000);
  });
});

describe("A Trigger raised while another effect is still resolving", () => {
  // OP13-082's reset plays Mars and Saturn together. Mars's [On Play] K.O.s
  // OP14-115 Rindo, whose [On K.O.] banks the top of its controller's deck as
  // Life and then damages that player -- OP14-113 comes off the Life with a
  // [Trigger] while Saturn's search is still waiting on Imu. The window used
  // to open at once: the Hancock seat answered Imu's search, and the phase the
  // search had saved was restored over the Trigger, which was never offered
  // and was later deleted by the next battle.
  covers("OP13-082", "[Activate: Main]");

  it("waits for the search, then offers the Trigger to its own player", () => {
    const game = scenario()
      .decks(IMU, "(Blue/Yellow) Boa Hancock - Official Feature Deck")
      .seed("imu-deferred-trigger")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("elders", "OP13-082")])
      .withHand("p1", [
        instance("reset-cost", "OP13-087"),
        instance("mars-cost", "OP13-087"),
      ])
      .withTrash("p1", [
        instance("mars", "OP13-091"),
        instance("saturn", "OP13-083"),
      ])
      .withDeckTop("p1", copies(5, "OP13-089", "saturn-look"))
      .withBoard("p2", [character("rindo", "OP14-115")])
      .withLife("p2", [instance("life", "OP10-054")])
      // Rindo banks the top card as Life, so OP14-113 goes on last.
      .withDeckTop("p2", copies(5, "OP10-054", "p2-deck"))
      .withDeckTop("p2", [instance("kuja", "OP14-113")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "elders" });
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 40) throw new Error("pending effect never settled");
      // Every effect choice goes to the player whose effect it is.
      expect(game.state.activePlayer).toBe(game.state.pendingEffect.playerId);
      const options = effectOptions(game.state);
      const pick = [
        "apply",
        "reset-cost",
        "mars-cost",
        "mars",
        "saturn",
        "rindo",
      ].find((option) => options.includes(option));
      game.play(
        pick
          ? { type: "resolve-effect", optionId: pick }
          : { type: "resolve-effect" },
      );
    }

    expect(ids(game.state.players.p2.board)).not.toContain("rindo");
    expect(game.state.phase).toBe("trigger");
    expect(game.state.activePlayer).toBe("p2");
    expect(game.state.pendingTrigger?.card.instanceId).toBe("kuja");

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(ids(game.state.players.p2.board)).toContain("kuja");
    // And the turn is Imu's again.
    expect(game.state.activePlayer).toBe("p1");
  });
});
