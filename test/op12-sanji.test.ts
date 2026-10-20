import { describe, expect, it } from "vitest";
import {
  currentPower,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Blue/Purple) Sanji feature deck, played through its own list.
 *
 * Bandai's write-up builds the deck on the Leader turning one returned DON!! a
 * turn into a free {Straw Hat Crew} Event, and on Characters that read the
 * number of Events in the trash. Each clause is driven behind OP12-041, the
 * Leader the [Sanji] gates name.
 */
const DECK = "(Blue/Purple) Sanji - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active })
    .bareTable()
    .withLeader("p1", "OP12-041");

type Game = ReturnType<ReturnType<typeof table>["build"]>;

/** Answer the pending effect with `optionId`, or its first offer if absent. */
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

/** The ids of the open decision's options. */
const offers = (game: Game): string[] =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId: string }).optionId);

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const fieldDon = (state: GameState, player: "p1" | "p2") =>
  state.players[player].activeDon.length +
  state.players[player].restedDon.length +
  state.players[player].leaderAttachedDon.length +
  state.players[player].board.reduce(
    (total, card) => total + (card.attachedDon?.length ?? 0),
    0,
  );

/** Events for the trash, which is what half the deck counts. */
const events = (count: number, prefix = "event") =>
  copies(count, "OP12-079", prefix);

describe("OP12-041 Sanji (Leader)", () => {
  covers("OP12-041", "[Activate: Main]");

  it("pays DON!! −1 to activate a {Straw Hat Crew} Event of base cost 3 or less from hand", () => {
    const game = table("op12-041-activate")
      .withHand("p1", [instance("concasser", "OP12-059")])
      .withDeckTop("p1", [instance("drawn", "OP12-062")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    answer(game, "apply", "concasser");

    // One DON!! back to the deck, and none of the Event's own cost paid.
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(9);
    // Concasser's [Main] ran: a draw behind a [Sanji] Leader.
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["concasser"]);
  });

  it("is not offered with no qualifying Event in hand", () => {
    const game = table("op12-041-no-event")
      // A {Straw Hat Crew} Character, not an Event.
      .withHand("p1", [instance("sanji", "OP12-070")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            (action as { sourceInstanceId?: string }).sourceInstanceId ===
              "p1-leader",
        ),
    ).toBe(false);
  });

  covers("OP12-041", "[When Attacking]");

  it("adds a rested DON!! while its field holds no more DON!! than the opponent's", () => {
    const game = table("op12-041-attack-behind")
      .withDonDeck("p1", 3)
      .withBoard("p2", [character("oden", "ST32-002", { rested: true })])
      .build();
    expect(fieldDon(game.state, "p1")).toBe(7);

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    answer(game);

    expect(fieldDon(game.state, "p1")).toBe(8);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("adds nothing while ahead on DON!!", () => {
    const game = table("op12-041-attack-ahead")
      .withDonDeck("p1", 1)
      .withDonDeck("p2", 4)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    answer(game);

    expect(fieldDon(game.state, "p1")).toBe(9);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP12-072 Zeff", () => {
  covers("OP12-072", "static");

  it("gains [Rush] when the Leader's DON!! −1 returns a DON!!", () => {
    const game = table("op12-072-rush")
      .withHand("p1", [
        instance("zeff", "OP12-072"),
        instance("concasser", "OP12-059"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP12-062")])
      .withBoard("p2", [character("oden", "ST32-002", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-072" });
    answer(game);
    expect(hasKeyword(game.state, "p1", "zeff", "Rush")).toBe(false);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    answer(game, "apply", "concasser");

    expect(hasKeyword(game.state, "p1", "zeff", "Rush")).toBe(true);
    expect(
      game.action({
        type: "attack",
        attackerInstanceId: "zeff",
        targetInstanceId: "p2-leader",
      }),
    ).toBeDefined();
  });

  it("gains nothing behind a Leader other than [Sanji]", () => {
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("op12-072-other-leader")
      .atTurn(11, { active: "p1" })
      .bareTable()
      // OP09-061 Monkey.D.Luffy: a Purple Leader that is not [Sanji].
      .withLeader("p1", "OP09-061")
      .withHand("p1", [
        instance("zeff", "OP12-072"),
        instance("lightning", "OP09-077"),
      ])
      .withBoard("p2", [character("zoro", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-072" });
    answer(game);
    game.play({ type: "activate-main", cardNumber: "OP09-077" });
    answer(game, "apply", "zoro");

    // Lightning's DON!! −2 was paid -- its K.O. landed -- and OP09-061's own
    // Leader put the two back, so the DON!! deck is no witness here.
    expect(game.state.players.p2.board).toEqual([]);
    expect(hasKeyword(game.state, "p1", "zeff", "Rush")).toBe(false);
  });
});

describe("OP12-059 Concasser", () => {
  covers("OP12-059", "[Main]");

  it("draws 1 behind a [Sanji] Leader", () => {
    const game = table("op12-059-main")
      .withHand("p1", [instance("concasser", "OP12-059")])
      .withDeckTop("p1", [instance("drawn", "OP12-062")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP12-059" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  covers("OP12-059", "[Counter]");

  it("gives the Leader +4000 with 4 Events in the trash", () => {
    const game = table("op12-059-counter", "p2")
      .withHand("p1", [instance("concasser", "OP12-059")])
      .withTrash("p1", events(4))
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({
      type: "activate-counter-event",
      eventInstanceId: "concasser",
    });
    answer(game, "p1-leader");

    // A [Counter] Event's boost is battle power, carried on the attack.
    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(ids(game.state.players.p1.trash)).toContain("concasser");
  });

  // Concasser is itself in the trash by the time its [Counter] resolves, so
  // three other Events already make four (Bandai's OP12-059#1 ruling); two
  // are one short.
  it("gives nothing with only 2 other Events in the trash", () => {
    const game = table("op12-059-counter-short", "p2")
      .withHand("p1", [instance("concasser", "OP12-059")])
      .withTrash("p1", events(2))
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    const counter = game
      .legalActions()
      .find((action) => action.type === "activate-counter-event");
    if (counter) {
      game.submit(counter);
      answer(game, "p1-leader");
    }

    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
  });
});

describe("OP12-060 Boeuf Burst", () => {
  covers("OP12-060", "[Main]");

  it("returns a cost-4-or-less Character to its owner's hand", () => {
    const game = table("op12-060-bounce")
      .withHand("p1", [instance("boeuf", "OP12-060")])
      .withBoard("p2", [character("zoro", "ST32-005")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP12-060" });
    answer(game, "bounce", "zoro");

    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.hand)).toContain("zoro");
  });

  it("draws 2 with 6 or fewer cards in hand", () => {
    const game = table("op12-060-draw")
      .withHand("p1", [instance("boeuf", "OP12-060")])
      .withDeckTop("p1", [
        instance("one", "OP12-062"),
        instance("two", "OP12-062"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP12-060" });
    answer(game, "draw");

    expect(ids(game.state.players.p1.hand)).toEqual(["one", "two"]);
  });
});

describe("OP12-062 Vinsmoke Sora", () => {
  covers("OP12-062", "[On Play]");

  it("adds a rested DON!! and draws 1 while level on DON!!", () => {
    const game = table("op12-062-on-play")
      .withDonDeck("p1", 1)
      .withDonDeck("p2", 1)
      .withHand("p1", [instance("sora", "OP12-062")])
      .withDeckTop("p1", [instance("drawn", "OP12-071")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-062" });
    answer(game);

    // Sora costs 1, paid by resting one active DON!!; the added one is the
    // second rested.
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  it("does nothing while ahead on DON!!", () => {
    const game = table("op12-062-ahead")
      .withDonDeck("p1", 1)
      .withDonDeck("p2", 3)
      .withHand("p1", [instance("sora", "OP12-062")])
      .withDeckTop("p1", [instance("drawn", "OP12-071")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-062" });
    answer(game);

    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.players.p1.hand).toEqual([]);
  });
});

describe("OP12-065 Emporio.Ivankov", () => {
  covers("OP12-065", "static");

  it("is a [Blocker] with 4 Events in the trash, and not with 3", () => {
    const four = table("op12-065-blocker")
      .withBoard("p1", [character("ivankov", "OP12-065")])
      .withTrash("p1", events(4))
      .build();
    const three = table("op12-065-no-blocker")
      .withBoard("p1", [character("ivankov", "OP12-065")])
      .withTrash("p1", events(3))
      .build();

    expect(hasKeyword(four.state, "p1", "ivankov", "Blocker")).toBe(true);
    expect(hasKeyword(three.state, "p1", "ivankov", "Blocker")).toBe(false);
  });

  covers("OP12-065", "[On K.O.]");

  it("returns an Event from the trash to hand when K.O.'d", () => {
    const game = table("op12-065-on-ko", "p2")
      .withBoard("p1", [character("ivankov", "OP12-065", { rested: true })])
      .withTrash("p1", [instance("giant", "OP09-078")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .withGivenDon("p2", "oden", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "ivankov",
    });
    let guard = 0;
    while (
      (game.state.phase === "block" || game.state.phase === "counter") &&
      game.state.pendingEffect === null
    ) {
      if (guard++ > 10) throw new Error("the defence never ended");
      game.pass();
    }
    answer(game, "giant");

    expect(ids(game.state.players.p1.hand)).toEqual(["giant"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["ivankov"]);
  });
});

describe("OP12-066 Carne", () => {
  covers("OP12-066", "static");

  it("is a [Blocker] with 4 Events in the trash, and not with 3", () => {
    const four = table("op12-066-blocker")
      .withBoard("p1", [character("carne", "OP12-066")])
      .withTrash("p1", events(4))
      .build();
    const three = table("op12-066-no-blocker")
      .withBoard("p1", [character("carne", "OP12-066")])
      .withTrash("p1", events(3))
      .build();

    expect(hasKeyword(four.state, "p1", "carne", "Blocker")).toBe(true);
    expect(hasKeyword(three.state, "p1", "carne", "Blocker")).toBe(false);
  });
});

describe("OP12-070 Sanji", () => {
  covers("OP12-070", "static");

  it("gains +1000 power for every 5 Events in the trash", () => {
    const power = (count: number) => {
      const game = table(`op12-070-power-${count}`)
        .withBoard("p1", [character("sanji", "OP12-070")])
        .withTrash("p1", [
          ...events(count),
          // A Character in the trash is not an Event.
          instance("body", "OP12-062"),
        ])
        .build();
      return currentPower(game.state, "p1", "sanji");
    };

    expect(power(4)).toBe(5000);
    expect(power(5)).toBe(6000);
    expect(power(14)).toBe(7000);
    expect(power(15)).toBe(8000);
  });

  it("returns a DON!! instead of leaving the field to the opponent's effect", () => {
    const game = table("op12-070-replace", "p2")
      .withBoard("p1", [character("sanji", "OP12-070")])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();

    game.play({ summary: "Activate Special Muggy Ball" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    expect(offers(game)).toEqual(["remove:sanji", "replace:sanji"]);
    game.play({ type: "resolve-effect", optionId: "replace:sanji" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["sanji"]);
    expect(game.state.players.p1.hand).toEqual([]);
    expect(fieldDon(game.state, "p1")).toBe(9);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("is not offered for a K.O. in battle", () => {
    const game = table("op12-070-battle", "p2")
      .withBoard("p1", [character("sanji", "OP12-070", { rested: true })])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oden",
      targetInstanceId: "sanji",
    });
    let guard = 0;
    while (
      (game.state.phase === "block" || game.state.phase === "counter") &&
      game.state.pendingEffect === null
    ) {
      if (guard++ > 10) throw new Error("the defence never ended");
      game.pass();
    }
    expect(offers(game).some((id) => id.startsWith("replace:"))).toBe(false);
    answer(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["sanji"]);
    expect(fieldDon(game.state, "p1")).toBe(10);
  });
});

describe("OP12-074 Patty", () => {
  covers("OP12-074", "[On Play]");

  it("trashes an Event from hand to add an active DON!!", () => {
    const game = table("op12-074-on-play")
      .withDonDeck("p1", 1)
      .withHand("p1", [
        instance("patty", "OP12-074"),
        instance("giant", "OP09-078"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-074" });
    answer(game, "apply", "giant");

    expect(ids(game.state.players.p1.trash)).toEqual(["giant"]);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    // Ten on the field: six active after Patty's 3 rested and the added one.
    expect(fieldDon(game.state, "p1")).toBe(10);
    expect(game.state.players.p1.activeDon).toHaveLength(7);
  });
});

describe("OP12-078 Brochette Blow", () => {
  covers("OP12-078", "[Main]");

  it("draws 1 while level on DON!!, and gives a Character −3000", () => {
    const game = table("op12-078-main")
      .withHand("p1", [instance("brochette", "OP12-078")])
      .withDeckTop("p1", [instance("drawn", "OP12-062")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP12-078" });
    answer(game, "oden");

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(currentPower(game.state, "p2", "oden")).toBe(3000);
  });

  // Ahead on DON!!, neither the draw nor the −3000 happens (Bandai's
  // OP12-078#1 ruling), so the Event has nothing to do and is not offered.
  it("does nothing while ahead on DON!!", () => {
    const game = table("op12-078-ahead")
      .withDonDeck("p2", 4)
      .withHand("p1", [instance("brochette", "OP12-078")])
      .withDeckTop("p1", [instance("drawn", "OP12-062")])
      .withBoard("p2", [character("oden", "ST32-002")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "OP12-078",
        ),
    ).toBe(false);
    expect(currentPower(game.state, "p2", "oden")).toBe(6000);
  });
});

describe("OP12-079 Luffy Is the Man Who Will Be King of the Pirates!!!", () => {
  covers("OP12-079", "[Main]");

  it("looks at 3 and adds any 1 of them to hand, the rest to the bottom", () => {
    const game = table("op12-079-main")
      .withHand("p1", [instance("king", "OP12-079")])
      .withDeckTop("p1", [
        instance("sora", "OP12-062"),
        instance("sanji", "OP12-070"),
        instance("giant", "OP09-078"),
        instance("deep", "OP12-071"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP12-079" });
    answer(game, "sanji");

    expect(ids(game.state.players.p1.hand)).toEqual(["sanji"]);
    expect(ids(game.state.players.p1.deck)[0]).toBe("deep");
    expect(ids(game.state.players.p1.deck)).toHaveLength(3);
  });
});
