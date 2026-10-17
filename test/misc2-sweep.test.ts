import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";

import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Clause tests for registered cards that no other file drives: one per printed
 * clause, each taken to the decision through public actions. Printed text is
 * `pnpm card:text <card>`.
 *
 * Every position seats the two Red/Green starters and states the card under
 * test with a `with*` setter; where a clause is gated on a Leader, that Leader
 * is stated too.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 acting in its own Main Phase, for attacks aimed at p1. */
const opponentTurn = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

/** Decline the rest of an open effect wherever declining is offered. */
function settleDeclining(game: Game) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 60) throw new Error("pending effect never settled");
    const options = effectOptions(game.state);
    const decline =
      options.find((optionId) => optionId === "skip" || optionId === "done") ??
      options[0]!;
    game.play({ type: "resolve-effect", optionId: decline });
  }
}

/** Take the apply branch of an `optional` prompt, if one is open. */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/**
 * Accept a `DON!! -N` cost and answer the "which DON!! goes back" prompt it
 * opens.
 */
const payDonMinus = (game: Game) => {
  applyOptional(game);
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game.state).some((id) => id.startsWith("return-don:"))
  ) {
    if (guard++ > 20) throw new Error("DON!! cost never settled");
    game.play({ type: "resolve-effect" });
  }
};

/** Pick each of `targets` in turn, then close the choice if it stays open. */
const pick = (game: Game, ...targets: string[]) => {
  for (const target of targets) {
    game.play({ type: "resolve-effect", optionId: target });
  }
  if (effectOptions(game.state).includes("done")) {
    game.play({ type: "resolve-effect", optionId: "done" });
  }
};

/** Decline the block and Counter steps, so a declared attack resolves. */
const declineDefence = (game: Game) => {
  let guard = 0;
  while (game.state.phase === "block" || game.state.phase === "counter") {
    if (guard++ > 40) throw new Error("battle never settled");
    if (
      game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      game.play({ type: "resolve-trigger", optionId: "skip" });
      continue;
    }
    if (game.state.pendingEffect) {
      settleDeclining(game);
      continue;
    }
    game.pass();
  }
};

/** A p2 attack on p1's Leader, already in p1's Counter step. */
const counterStep = {
  attackerPlayerId: "p2",
  defenderPlayerId: "p1",
  attackerInstanceId: "attacker",
  targetInstanceId: "p1-leader",
  attackPower: 6000,
  counterPower: 0,
} as const;

/**
 * p2 swings at p1's Leader and p1's only Life card is `cardNumber`; returns
 * with the Trigger window open.
 */
const triggerFrom = (
  seed: string,
  cardNumber: string,
  options: { hand?: string[]; opponentBoard?: [string, string][] } = {},
) => {
  let built = opponentTurn(seed)
    .withLife("p1", [instance("life-card", cardNumber)])
    .withDeckTop("p1", [
      instance("deck-a", "ST31-003"),
      instance("deck-b", "ST31-002"),
    ])
    .withBoard("p2", [
      character("attacker", "ST32-004"),
      ...(options.opponentBoard ?? []).map(([id, number]) =>
        character(id, number),
      ),
    ]);
  if (options.hand) {
    built = built.withHand(
      "p1",
      options.hand.map((number, index) => instance(`hand-${index}`, number)),
    );
  }
  const game = built.build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  let guard = 0;
  while (
    game.state.phase === "block" ||
    (game.state.phase === "counter" &&
      !game.legalActions().some((action) => action.type === "resolve-trigger"))
  ) {
    if (guard++ > 20) throw new Error("trigger window never opened");
    game.pass();
  }
  return game;
};

const attackLeader = (game: Game, attacker: string, defender = "p2") =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: `${defender}-leader`,
  });

describe("printed Blockers", () => {
  covers("OP17-028", "[Blocker]");
  covers("OP17-059", "[Blocker]");
  covers("OP17-064", "[Blocker]");
  covers("OP17-072", "[Blocker]");
  covers("EB01-034", "[Blocker]");

  it.each(["OP17-028", "OP17-059", "OP17-064", "OP17-072", "EB01-034"])(
    "%s blocks a declared attack and rests doing it",
    (cardNumber) => {
      const game = opponentTurn(`misc2-blocker-${cardNumber}`)
        .withBoard("p2", [character("attacker", "OP11-003")])
        .withBoard("p1", [character("blocker", cardNumber)])
        .withHand("p1", [])
        .build();

      expect(hasKeyword(game.state, "p1", "blocker", "Blocker")).toBe(true);
      attackLeader(game, "attacker", "p1");
      // King, Black Maria and Ms. Wednesday answer the attack first; this case
      // is about the block, so their reaction is declined.
      settleDeclining(game);
      game.play({ type: "block", blockerInstanceId: "blocker" });

      expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
      expect(game.state.players.p1.board[0]?.rested).toBe(true);
    },
  );
});

describe("OP17-011 Blamenco", () => {
  covers("OP17-011", "[When Attacking]");

  it("gives an opposing Character -4000 with 2 DON!! given", () => {
    const game = table("op17-011-debuff")
      .withBoard("p1", [character("blamenco", "OP17-011")])
      .withGivenDon("p1", "blamenco", 2)
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .build();

    attackLeader(game, "blamenco");
    expect(effectOptions(game.state)).toContain("rayleigh");
    pick(game, "rayleigh");

    expect(currentPower(game.state, "p2", "rayleigh")).toBe(1000);
  });

  it("does nothing with only 1 DON!! given", () => {
    const game = table("op17-011-one-don")
      .withBoard("p1", [character("blamenco", "OP17-011")])
      .withGivenDon("p1", "blamenco", 1)
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .build();

    attackLeader(game, "blamenco");
    expect(effectOptions(game.state)).not.toContain("rayleigh");
    settleDeclining(game);
    expect(currentPower(game.state, "p2", "rayleigh")).toBe(5000);
  });
});

describe("OP17-014 Whitey Bay", () => {
  covers("OP17-014", "[On Play]");

  it("K.O.s an opposing Character with 2000 base power or less", () => {
    const game = table("op17-014-on-play")
      .withHand("p1", [instance("whitey", "OP17-014")])
      .withBoard("p2", [
        character("maria", "OP17-072"),
        character("brook", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    const options = effectOptions(game.state);
    expect(options).toContain("maria");
    expect(options).not.toContain("brook");
    pick(game, "maria");

    expect(ids(game.state.players.p2.board)).toEqual(["brook"]);
    expect(ids(game.state.players.p2.trash)).toContain("maria");
  });

  it("is up to 1: the K.O. can be declined with a target on the board", () => {
    const game = table("op17-014-decline")
      .withHand("p1", [instance("whitey", "OP17-014")])
      .withBoard("p2", [character("maria", "OP17-072")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["maria"]),
    );
    expect(
      effectOptions(game.state).some((id) => id === "done" || id === "skip"),
    ).toBe(true);
    settleDeclining(game);

    expect(ids(game.state.players.p2.board)).toEqual(["maria"]);
  });
});

describe("OP17-014 Whitey Bay on the opponent's attack", () => {
  covers("OP17-014", "[On Your Opponent's Attack]");

  it("trashes itself for +1000 on the Leader during this battle", () => {
    const game = opponentTurn("op17-014-defence")
      .withBoard("p1", [character("whitey", "OP17-014")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    attackLeader(game, "attacker", "p1");
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    settleDeclining(game);

    expect(game.state.activeAttack?.counterPower).toBe(1000);
    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(["whitey"]);
  });

  it("keeps the body when declined", () => {
    const game = opponentTurn("op17-014-defence-decline")
      .withBoard("p1", [character("whitey", "OP17-014")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    attackLeader(game, "attacker", "p1");
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(ids(game.state.players.p1.board)).toEqual(["whitey"]);
  });
});

describe("OP17-018 The Power to Destroy the World", () => {
  covers("OP17-018", "[Main]");

  it("rests 2 DON!! to K.O. an opposing Stage", () => {
    const game = table("op17-018-main")
      .withHand("p1", [instance("event", "OP17-018")])
      .withStage("p2", instance("fullalead", "OP17-057"))
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", summary: "[OP17-018]" });
    applyOptional(game);
    pick(game, "fullalead");
    settleDeclining(game);

    expect(game.state.players.p2.stage).toBeNull();
    expect(ids(game.state.players.p2.trash)).toContain("fullalead");
    // The Event's cost of 1, then the 2 DON!! the clause rests.
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 3);
    expect(ids(game.state.players.p1.trash)).toContain("event");
  });
});

describe("OP17-018 The Power to Destroy the World Counter", () => {
  covers("OP17-018", "[Counter]");

  it("adds +4000 with two Characters of 8000 base power", () => {
    const game = table("op17-018-counter")
      .withHand("p1", [instance("event", "OP17-018")])
      .withBoard("p1", [
        character("kingdew", "OP17-006"),
        character("oden", "OP17-007"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(counterStep, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settleDeclining(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("is not offered with only one such Character", () => {
    const game = table("op17-018-counter-one")
      .withHand("p1", [instance("event", "OP17-018")])
      .withBoard("p1", [
        character("kingdew", "OP17-006"),
        character("jinbe", "ST31-002"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(counterStep, "counter")
      .build();

    expect(
      game
        .legalActions()
        .some((action) => action.type === "activate-counter-event"),
    ).toBe(false);
  });
});

describe("OP17-028 Bonk Punch & Monster", () => {
  covers("OP17-028", "[On Play]");

  it("K.O.s a rested opposing Character whose current cost is 6 or less", () => {
    // Kuma prints cost 5 and reads 8 on the field: "a cost of 6 or less" is
    // the cost it has now, so Kuma is out of reach.
    const game = table("op17-028-on-play")
      .withHand("p1", [instance("bonk", "OP17-028")])
      .withBoard("p2", [
        character("jinbe", "ST31-002", { rested: true }),
        character("kuma", "ST35-005", { rested: true }),
        character("brook", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-028" });
    const options = effectOptions(game.state);
    expect(options).toContain("jinbe");
    expect(options).not.toContain("kuma");
    expect(options).not.toContain("brook");
    pick(game, "jinbe");

    expect(ids(game.state.players.p2.trash)).toContain("jinbe");
    expect(ids(game.state.players.p2.board)).toEqual(["kuma", "brook"]);
  });
});

describe("OP17-030 Monkey.D.Luffy", () => {
  covers("OP17-030", "[On Play]");

  it("rests a DON!! to gain [Rush] and attack the turn it is played", () => {
    const game = table("op17-030-on-play")
      .withHand("p1", [instance("luffy", "OP17-030")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-030" });
    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({ type: "resolve-effect", optionId: "apply" });
    settleDeclining(game);

    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore + 1);
    expect(hasKeyword(game.state, "p1", "luffy", "Rush")).toBe(true);
    expect(
      game.action({
        type: "attack",
        attackerInstanceId: "luffy",
        targetInstanceId: "p2-leader",
      }),
    ).toBeDefined();
  });

  it("stays without [Rush] when declined", () => {
    const game = table("op17-030-decline")
      .withHand("p1", [instance("luffy", "OP17-030")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-030" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(hasKeyword(game.state, "p1", "luffy", "Rush")).toBe(false);
  });
});

describe("OP17-030 Monkey.D.Luffy activation", () => {
  covers("OP17-030", "[Activate: Main]");

  it("sets a rested DON!! active with 5 or less cards in hand, once a turn", () => {
    const game = table("op17-030-activate")
      .withBoard("p1", [character("luffy", "OP17-030")])
      .withDon("p1", { rested: 2 })
      .withHand("p1", [instance("card", "ST31-003")])
      .build();

    const active = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", summary: "[OP17-030]" });
    settleDeclining(game);

    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(active + 1);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" && action.summary.includes("OP17"),
        ),
    ).toBe(false);
  });

  it("sets nothing active with 6 cards in hand", () => {
    const game = table("op17-030-full-hand")
      .withBoard("p1", [character("luffy", "OP17-030")])
      .withDon("p1", { rested: 2 })
      .withHand("p1", [
        instance("h1", "ST31-003"),
        instance("h2", "ST31-003"),
        instance("h3", "ST31-003"),
        instance("h4", "ST31-003"),
        instance("h5", "ST31-003"),
        instance("h6", "ST31-003"),
      ])
      .build();

    const offered = game
      .legalActions()
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.summary.includes("[OP17-030]"),
      );
    if (offered) {
      game.play({ type: "activate-main", summary: "[OP17-030]" });
      settleDeclining(game);
    }
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });
});

describe("OP17-047 Shiki", () => {
  covers("OP17-047", "[End of Your Turn]");

  const shikiTable = (seed: string, ownHand: number) =>
    table(seed)
      .withBoard("p1", [character("shiki", "OP17-047")])
      .withHand(
        "p1",
        Array.from({ length: ownHand }, (_, index) =>
          instance(`own-${index}`, "ST31-003"),
        ),
      )
      .withHand("p2", [
        instance("p2-a", "ST32-004"),
        instance("p2-b", "ST31-002"),
      ])
      .withDeckTop("p2", [
        instance("p2-deck-1", "OP11-003"),
        instance("p2-deck-2", "OP11-003"),
      ])
      .build();

  it("has the opponent bury a card of their choice from hand", () => {
    const game = shikiTable("op17-047-end", 2);

    game.pass();
    // The opponent's card, so the opponent chooses it.
    expect(game.state.pendingEffect).not.toBeNull();
    expect(game.state.activePlayer).toBe("p2");
    expect(effectOptions(game.state).sort()).toEqual(["p2-a", "p2-b"]);
    game.play({ type: "resolve-effect", optionId: "p2-b" });
    settleDeclining(game);

    const p2 = game.state.players.p2;
    expect(ids(p2.deck)).toContain("p2-b");
    expect(p2.deck.at(-1)?.instanceId).toBe("p2-b");
    expect(ids(p2.hand)).not.toContain("p2-b");
    expect(ids(p2.hand)).toContain("p2-a");
  });

  it("does nothing with 3 cards in its controller's hand", () => {
    const game = shikiTable("op17-047-full-hand", 3);

    game.pass();
    settleDeclining(game);

    expect(ids(game.state.players.p2.hand)).toEqual(
      expect.arrayContaining(["p2-a", "p2-b"]),
    );
  });
});

describe("OP17-059 Aramaki", () => {
  covers("OP17-059", "[On Play]");

  it("returns a DON!!, draws 1 and K.O.s up to 2 cost-2 Characters", () => {
    const game = table("op17-059-on-play")
      .withHand("p1", [instance("aramaki", "OP17-059")])
      .withDeckTop("p1", [instance("drawn", "ST31-003")])
      .withBoard("p2", [
        character("maria", "OP17-072"),
        character("tonjit", "OP07-067"),
        character("jinbe", "ST31-002"),
      ])
      .build();

    const fieldDon = () =>
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    const before = fieldDon();
    game.play({ type: "play-card", cardNumber: "OP17-059" });
    payDonMinus(game);
    expect(effectOptions(game.state)).not.toContain("jinbe");
    pick(game, "maria", "tonjit");
    settleDeclining(game);

    expect(fieldDon()).toBe(before - 1);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p2.board)).toEqual(["jinbe"]);
  });
});

describe("OP17-064 King and OP17-072 Black Maria", () => {
  covers("OP17-064", "[On Your Opponent's Attack]");
  covers("OP17-072", "[On Your Opponent's Attack]");

  it.each([
    ["OP17-064", 2000],
    ["OP17-072", 1000],
  ])(
    "%s trashes a card from hand for +%i during the battle, once a turn",
    (cardNumber, amount) => {
      const game = opponentTurn(`misc2-reaction-${cardNumber}`)
        .withBoard("p1", [character("reactor", cardNumber)])
        .withHand("p1", [
          instance("fuel-a", "ST31-003"),
          instance("fuel-b", "ST31-003"),
        ])
        .withBoard("p2", [
          character("attacker", "ST32-004"),
          character("second", "ST32-004"),
        ])
        .withLife("p1", [
          instance("life-a", "ST31-003"),
          instance("life-b", "ST31-003"),
        ])
        .build();

      attackLeader(game, "attacker", "p1");
      game.play({ type: "resolve-effect", optionId: "apply" });
      game.play({ type: "resolve-effect", optionId: "fuel-a" });
      settleDeclining(game);

      expect(game.state.activeAttack?.counterPower).toBe(amount);
      expect(ids(game.state.players.p1.trash)).toEqual(["fuel-a"]);
      declineDefence(game);

      attackLeader(game, "second", "p1");
      expect(game.state.pendingEffect).toBeNull();
    },
  );
});

describe("OP17-066 Kurozumi Orochi", () => {
  covers("OP17-066", "[On Play]");

  it("draws 2 and trashes 1 beside a cost-10 Character", () => {
    const game = table("op17-066-on-play")
      .withBoard("p1", [character("luffy", "P-041")])
      .withHand("p1", [instance("orochi", "OP17-066")])
      .withDeckTop("p1", [
        instance("draw-a", "ST31-003"),
        instance("draw-b", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-066" });
    payDonMinus(game);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "draw-a",
      "draw-b",
    ]);
    game.play({ type: "resolve-effect", optionId: "draw-a" });
    settleDeclining(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["draw-b"]);
    expect(ids(game.state.players.p1.trash)).toContain("draw-a");
  });

  it("draws nothing without a cost-10 Character", () => {
    const game = table("op17-066-no-body")
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withHand("p1", [instance("orochi", "OP17-066")])
      .withDeckTop("p1", [instance("draw-a", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-066" });
    payDonMinus(game);
    settleDeclining(game);

    expect(game.state.players.p1.hand).toEqual([]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("draw-a");
  });
});

describe("OP17-071 Who's.Who", () => {
  covers("OP17-071", "[On Play]");

  it("returns a DON!! to K.O. up to 2 cost-2 Characters", () => {
    const game = table("op17-071-on-play")
      .withHand("p1", [instance("whoswho", "OP17-071")])
      .withBoard("p2", [
        character("maria", "OP17-072"),
        character("tonjit", "OP07-067"),
        character("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-071" });
    payDonMinus(game);
    expect(effectOptions(game.state)).not.toContain("jinbe");
    pick(game, "maria", "tonjit");
    settleDeclining(game);

    expect(ids(game.state.players.p2.board)).toEqual(["jinbe"]);
    expect(ids(game.state.players.p2.trash).sort()).toEqual([
      "maria",
      "tonjit",
    ]);
  });
});

describe("OP17-071 Who's.Who Trigger", () => {
  covers("OP17-071", "[Trigger]");

  it("plays itself from Life", () => {
    const game = triggerFrom("op17-071-trigger", "OP17-071");

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(ids(game.state.players.p1.board)).toEqual(["life-card"]);
  });
});

describe("OP17-090 Franky", () => {
  covers("OP17-090", "static");

  it("gains +3000 while any Character costs 12 or more, either side's", () => {
    const own = table("op17-090-own-giant")
      .withBoard("p1", [
        character("franky", "OP17-090"),
        character("saul", "OP17-089"),
      ])
      .build();
    expect(currentPower(own.state, "p1", "franky")).toBe(5000);

    const theirs = table("op17-090-their-giant")
      .withBoard("p1", [character("franky", "OP17-090")])
      .withBoard("p2", [character("saul", "OP17-089")])
      .build();
    expect(currentPower(theirs.state, "p1", "franky")).toBe(5000);

    const none = table("op17-090-no-giant")
      .withBoard("p1", [character("franky", "OP17-090")])
      .build();
    expect(currentPower(none.state, "p1", "franky")).toBe(2000);
  });
});

describe("OP17-090 Franky On Play", () => {
  covers("OP17-090", "[On Play]");

  it("K.O.s a cost-2 Character while a cost-12 Character is out", () => {
    const game = table("op17-090-on-play")
      .withBoard("p1", [character("saul", "OP17-089")])
      .withHand("p1", [instance("franky", "OP17-090")])
      .withBoard("p2", [
        character("maria", "OP17-072"),
        character("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-090" });
    expect(effectOptions(game.state)).not.toContain("jinbe");
    pick(game, "maria");

    expect(ids(game.state.players.p2.board)).toEqual(["jinbe"]);
  });

  it("K.O.s nothing without one", () => {
    const game = table("op17-090-on-play-flat")
      .withHand("p1", [instance("franky", "OP17-090")])
      .withBoard("p2", [character("maria", "OP17-072")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-090" });
    expect(effectOptions(game.state)).not.toContain("maria");
    settleDeclining(game);

    expect(ids(game.state.players.p2.board)).toEqual(["maria"]);
  });
});

describe("OP17-101 Caribou", () => {
  covers("OP17-101", "[Activate: Main]");

  it("takes the top Life card into hand for -3000 on an opposing Character", () => {
    const game = table("op17-101-activate")
      .withBoard("p1", [character("caribou", "OP17-101")])
      .withLife("p1", [
        instance("life-top", "ST31-003"),
        instance("life-bottom", "ST31-002"),
      ])
      .withBoard("p2", [character("rayleigh", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "[OP17-101]" });
    applyOptional(game);
    // "From the top of your Life cards": the bottom card cannot pay.
    expect(effectOptions(game.state)).toEqual(["life-top"]);
    game.play({ type: "resolve-effect", optionId: "life-top" });
    pick(game, "rayleigh");
    settleDeclining(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["life-top"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-bottom"]);
    expect(currentPower(game.state, "p2", "rayleigh")).toBe(2000);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("[OP17-101]"),
        ),
    ).toBe(false);
  });
});

describe("OP17-101 Caribou Trigger", () => {
  covers("OP17-101", "[Trigger]");

  it("trashes a card from hand to K.O. a cost-5 Character", () => {
    const game = triggerFrom("op17-101-trigger", "OP17-101", {
      hand: ["ST31-003"],
      opponentBoard: [["usopp", "OP11-003"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    // The attacker (cost 4) and Usopp (cost 5) are both in reach.
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["attacker", "usopp"]),
    );
    pick(game, "usopp");
    settleDeclining(game);

    expect(ids(game.state.players.p1.trash)).toContain("hand-0");
    expect(ids(game.state.players.p2.trash)).toContain("usopp");
  });

  it("K.O.s nothing when the trash is declined", () => {
    const game = triggerFrom("op17-101-trigger-decline", "OP17-101", {
      hand: ["ST31-003"],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(ids(game.state.players.p1.hand)).toContain("hand-0");
    expect(ids(game.state.players.p2.board)).toContain("attacker");
  });
});

describe("OP17-105 Charlotte Chiffon", () => {
  covers("OP17-105", "[On Play]");

  it("trashes a Trigger card to return an opposing Trigger Character", () => {
    const game = table("op17-105-on-play")
      .withHand("p1", [
        instance("chiffon", "OP17-105"),
        instance("trigger-card", "OP17-071"),
        instance("plain-card", "ST31-003"),
      ])
      .withBoard("p2", [
        character("whoswho", "OP17-071"),
        character("tonjit", "OP07-067"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-105" });
    applyOptional(game);
    const cost = effectOptions(game.state);
    expect(cost).toContain("trigger-card");
    expect(cost).not.toContain("plain-card");
    game.play({ type: "resolve-effect", optionId: "trigger-card" });
    const targets = effectOptions(game.state);
    expect(targets).toContain("whoswho");
    expect(targets).not.toContain("tonjit");
    pick(game, "whoswho");

    expect(ids(game.state.players.p1.trash)).toContain("trigger-card");
    expect(ids(game.state.players.p2.hand)).toContain("whoswho");
    expect(ids(game.state.players.p2.board)).toEqual(["tonjit"]);
  });
});

describe("EB01-024 Hamlet", () => {
  covers("EB01-024", "static");

  const hamletTable = (seed: string, handSize: number) =>
    table(seed)
      .withBoard("p1", [
        character("hamlet", "EB01-024"),
        character("fourtricks", "EB01-025"),
        character("jinbe", "ST31-002"),
      ])
      .withHand(
        "p1",
        Array.from({ length: handSize }, (_, index) =>
          instance(`hand-${index}`, "ST31-003"),
        ),
      )
      .build();

  it("gives every {SMILE} Character, itself included, +1000 with 4 cards in hand", () => {
    const game = hamletTable("eb01-024-four", 4);

    expect(currentPower(game.state, "p1", "hamlet")).toBe(5000);
    expect(currentPower(game.state, "p1", "fourtricks")).toBe(6000);
    expect(currentPower(game.state, "p1", "jinbe")).toBe(6000);
  });

  it("gives nothing with 5 cards in hand", () => {
    const game = hamletTable("eb01-024-five", 5);

    expect(currentPower(game.state, "p1", "hamlet")).toBe(4000);
    expect(currentPower(game.state, "p1", "fourtricks")).toBe(5000);
  });

  it("reaches only its own side", () => {
    const game = table("eb01-024-opponent")
      .withBoard("p1", [character("hamlet", "EB01-024")])
      .withBoard("p2", [character("fourtricks", "EB01-025")])
      .build();

    expect(currentPower(game.state, "p2", "fourtricks")).toBe(5000);
  });
});

describe("EB01-026 Prince Bellett", () => {
  covers("EB01-026", "[When Attacking]");

  it("returns a cost-3 Character, either side's, with 1 or less cards in hand", () => {
    // Every DON!! not given to Bellett is rested: [DON!! x1] asks about the
    // one on the card, not about DON!! left to spend.
    const game = table("eb01-026-bounce")
      .withBoard("p1", [
        character("bellett", "EB01-026"),
        character("own-brook", "ST31-003"),
      ])
      .withGivenDon("p1", "bellett", 1)
      .withDon("p1", { rested: 9 })
      .withHand("p1", [instance("card", "ST31-003")])
      .withBoard("p2", [
        character("maria", "OP17-072"),
        character("jinbe", "ST31-002"),
      ])
      .build();

    attackLeader(game, "bellett");
    const options = effectOptions(game.state);
    // "Up to 1 Character" names no side.
    expect(options).toEqual(expect.arrayContaining(["maria", "own-brook"]));
    expect(options).not.toContain("jinbe");
    pick(game, "maria");

    expect(ids(game.state.players.p2.hand)).toContain("maria");
    expect(ids(game.state.players.p2.board)).toEqual(["jinbe"]);
  });

  it("returns nothing with 2 cards in hand", () => {
    const game = table("eb01-026-full-hand")
      .withBoard("p1", [character("bellett", "EB01-026")])
      .withGivenDon("p1", "bellett", 1)
      .withHand("p1", [
        instance("card-a", "ST31-003"),
        instance("card-b", "ST31-003"),
      ])
      .withBoard("p2", [character("maria", "OP17-072")])
      .build();

    attackLeader(game, "bellett");
    expect(effectOptions(game.state)).not.toContain("maria");
    settleDeclining(game);
    expect(ids(game.state.players.p2.board)).toEqual(["maria"]);
  });

  it("returns nothing without a DON!! given", () => {
    const game = table("eb01-026-no-don")
      .withBoard("p1", [character("bellett", "EB01-026")])
      .withBoard("p2", [character("maria", "OP17-072")])
      .build();

    attackLeader(game, "bellett");
    expect(effectOptions(game.state)).not.toContain("maria");
    settleDeclining(game);
    expect(ids(game.state.players.p2.board)).toEqual(["maria"]);
  });
});

describe("EB01-034 Ms. Wednesday", () => {
  covers("EB01-034", "[On Your Opponent's Attack]");

  const wednesdayTable = (seed: string, leader: string) =>
    opponentTurn(seed)
      .withLeader("p1", leader)
      .withBoard("p1", [character("wednesday", "EB01-034")])
      .withDon("p1", { rested: 9 })
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

  it("returns a DON!! and adds one active behind a Baroque Works Leader", () => {
    const game = wednesdayTable("eb01-034-bw", "OP14-079");
    const p1 = () => game.state.players.p1;
    expect(p1().activeDon).toHaveLength(1);

    attackLeader(game, "attacker", "p1");
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "return-don:rested" });
    settleDeclining(game);

    // A spent DON!! went back and a fresh one came out active, inside the
    // opponent's attack where it can pay for a Counter.
    expect(p1().restedDon).toHaveLength(8);
    expect(p1().activeDon).toHaveLength(2);
    expect(p1().donDeck).toHaveLength(0);
  });

  it("adds nothing behind any other Leader", () => {
    const game = wednesdayTable("eb01-034-other", "ST31-001");
    const p1 = () => game.state.players.p1;

    attackLeader(game, "attacker", "p1");
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "return-don:rested" });
    settleDeclining(game);

    expect(p1().restedDon).toHaveLength(8);
    expect(p1().activeDon).toHaveLength(1);
    expect(p1().donDeck).toHaveLength(1);
  });
});

describe("EB01-037 Mr. 9", () => {
  covers("EB01-037", "[On Your Opponent's Attack]");

  it("returns a DON!! to K.O. a cost-2 Character, once a turn", () => {
    const game = opponentTurn("eb01-037-ko")
      .withBoard("p1", [character("mr9", "EB01-037")])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("second", "ST32-004"),
        character("maria", "OP17-072"),
      ])
      .withLife("p1", [
        instance("life-a", "ST31-003"),
        instance("life-b", "ST31-003"),
      ])
      .build();

    attackLeader(game, "attacker", "p1");
    payDonMinus(game);
    expect(effectOptions(game.state)).not.toContain("attacker");
    pick(game, "maria");
    settleDeclining(game);

    expect(ids(game.state.players.p2.trash)).toContain("maria");
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    declineDefence(game);

    attackLeader(game, "second", "p1");
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe('P-003 Eustass"Captain"Kid', () => {
  covers("P-003", "static");

  it.each([
    [2, 0],
    [1, 1],
  ])("with %i DON!! given leaves the Leader at %i Life", (don, lifeAfter) => {
    const game = table(`p-003-${don}`)
      .withBoard("p1", [character("kid", "P-003")])
      .withGivenDon("p1", "kid", don)
      .withLife("p2", [
        instance("life-a", "ST32-004"),
        instance("life-b", "ST32-004"),
      ])
      .build();

    expect(hasKeyword(game.state, "p1", "kid", "Double Attack")).toBe(don >= 2);
    attackLeader(game, "kid");
    declineDefence(game);

    expect(game.state.players.p2.life).toHaveLength(lifeAfter);
  });
});

describe("P-049 Usopp", () => {
  covers("P-049", "[On Play]");

  const usoppTable = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("usopp", "P-049")])
      .withDeckTop("p1", [
        instance("a", "ST31-003"),
        instance("b", "ST31-002"),
        instance("c", "OP11-003"),
        instance("d", "OP07-067"),
        instance("e", "ST32-004"),
        instance("under", "OP17-072"),
      ])
      .build();

  it("may keep all five on top of the deck", () => {
    const game = usoppTable("p-049-top");

    game.play({ type: "play-card", cardNumber: "P-049" });
    const options = effectOptions(game.state);
    expect(options).toHaveLength(2);
    game.play({ type: "resolve-effect", optionId: options[1]! });
    settleDeclining(game);

    expect(ids(game.state.players.p1.deck.slice(0, 5)).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(game.state.players.p1.deck[5]?.instanceId).toBe("under");
  });

  it("may send all five to the bottom", () => {
    const game = usoppTable("p-049-bottom");

    game.play({ type: "play-card", cardNumber: "P-049" });
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game.state)[0]!,
    });
    settleDeclining(game);

    expect(game.state.players.p1.deck[0]?.instanceId).toBe("under");
    expect(ids(game.state.players.p1.deck.slice(-5)).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

describe("OP07-056 Slave Arrow's +4000 target", () => {
  covers("OP07-056", "[Counter]");

  // p2's Rayleigh swings at p1's Leader; p1 holds Slave Arrow with Brook to
  // return and Jinbe on the board beside it.
  const slaveArrow = (seed: string) => {
    const game = opponentTurn(seed)
      .withHand("p1", [instance("arrow", "OP07-056")])
      .withBoard("p1", [
        character("brook", "ST31-003"),
        character("jinbe", "ST31-002"),
      ])
      .withLife("p1", [instance("life-a", "ST31-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    attackLeader(game, "attacker", "p1");
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "arrow" });
    game.play({ type: "resolve-effect", optionId: "brook" });
    return game;
  };

  it("offers every Leader and Character, the attacked card first", () => {
    const game = slaveArrow("op07-056-targets");

    expect(effectOptions(game.state)).toEqual(["p1-leader", "jinbe"]);
  });

  it("puts the +4000 on the card being attacked", () => {
    const game = slaveArrow("op07-056-attacked");

    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(game.state.phase).toBe("counter");
    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(ids(game.state.players.p1.hand)).toEqual(["brook"]);
    expect(currentPower(game.state, "p1", "jinbe")).toBe(6000);
  });

  it("puts the +4000 on a Character that is not being attacked, for this battle", () => {
    const game = slaveArrow("op07-056-aside");

    game.play({ type: "resolve-effect", optionId: "jinbe" });

    expect(game.state.phase).toBe("counter");
    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(currentPower(game.state, "p1", "jinbe")).toBe(10000);
    declineDefence(game);

    // The Leader took the hit, and "during this battle" ended with it.
    expect(game.state.players.p1.life).toHaveLength(0);
    expect(currentPower(game.state, "p1", "jinbe")).toBe(6000);
  });
});
