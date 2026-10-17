import { describe, expect, it } from "vitest";
import {
  battleAttackPower,
  currentPower,
  effectiveCost,
  fieldDonCount,
  hasKeyword,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP15 cards that were registered but had no test claiming their printed
 * clauses, one `describe` per card.
 *
 * Built like `test/op15-clauses.test.ts`: the format's ST31/ST32 decks on a
 * bare table, with the OP15 card placed where the clause needs it. Printed text
 * for any card here is `pnpm card:text <card>`.
 */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const activations = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    );

/** Declines the Block and Counter steps so a declared battle resolves. */
const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

const canBlockWith = (game: Game, instanceId: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "block" && action.blockerInstanceId === instanceId,
    );

/** `attacker` swings at `target`. */
const attack = (game: Game, attacker: string, target: string) =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

/**
 * A 5000-power p2 attacker K.O.s a rested p1 Character on p2's turn -- the
 * real battle every `[On K.O.]` here is reached through.
 */
const koInBattle = (game: Game, victim: string) => {
  attack(game, "attacker", victim);
  declineDefence(game);
};

/** p2 casts OP09-058 (return a cost-6-or-less Character) at `target`. */
const muggyBall = (game: Game, target: string) => {
  game.play({ type: "activate-main", sourceCardNumber: "OP09-058" });
  game.play({ type: "resolve-effect", optionId: target });
};

describe("OP15-002 Lucy", () => {
  covers(
    "OP15-002",
    "[When Attacking]",
    "[On Your Opponent's Attack]",
    "[Activate: Main]",
  );

  it("[On Your Opponent's Attack] trashes an Event and a Stage for +2000 during the battle", () => {
    const game = table("op15-002-defend", "p2")
      .withLeader("p1", "OP15-002")
      .withHand("p1", [
        instance("event", "OP15-019"),
        instance("stage", "OP06-098"),
        instance("body", "ST32-004"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    attack(game, "attacker", "p1-leader");
    expect(game.player).toBe("p1");
    // A Character is neither an Event nor a Stage.
    expect(effectOptions(game)).not.toContain("body");
    game.play({ type: "resolve-effect", optionId: "event" });
    game.play({ type: "resolve-effect", optionId: "stage" });

    expect(ids(game.state.players.p1.trash).sort()).toEqual(["event", "stage"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["body"]);
    // 5000 printed, +1000 per card: 7000 holds off a 5000 attacker.
    expect(game.state.activeAttack?.counterPower).toBe(2000);
    declineDefence(game);
    expect(game.state.players.p1.life).toHaveLength(0);
    expect(game.state.phase).not.toBe("finished");
  });

  it("[When Attacking] has no ceiling below the hand: five Events are +5000", () => {
    const game = table("op15-002-five")
      .withLeader("p1", "OP15-002")
      .withHand("p1", [
        ...copies(3, "OP15-019", "bulls"),
        ...copies(2, "OP15-020", "fist"),
      ])
      .build();

    attack(game, "p1-leader", "p2-leader");
    for (const id of ["bulls-1", "bulls-2", "bulls-3", "fist-1", "fist-2"]) {
      game.play({ type: "resolve-effect", optionId: id });
    }

    expect(game.state.players.p1.hand).toEqual([]);
    expect(battleAttackPower(game.state)).toBe(10_000);
  });

  it("[Activate: Main] is not opened by an Event with a base cost under 3, and draws once per turn after one of 3", () => {
    const game = table("op15-002-main-gate")
      .withLeader("p1", "OP15-002")
      .withHand("p1", [
        instance("cheap", "OP15-097"),
        instance("bulls", "OP15-019"),
      ])
      .withTrash("p1", copies(10, "ST32-005", "milled"))
      .withBoard("p2", [character("target", "ST32-004")])
      .withDeckTop("p1", copies(3, "ST32-005", "drawn"))
      .build();

    // OP15-097 is a 1-cost Event: activated, but under the floor.
    game.play({ type: "activate-main", cardNumber: "OP15-097" });
    settle(game);
    expect(ids(game.state.players.p1.trash)).toContain("cheap");
    expect(activations(game, "p1-leader")).toHaveLength(0);

    game.play({ type: "activate-main", cardNumber: "OP15-019" });
    settle(game);
    const before = game.state.players.p1.hand.length;
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    expect(game.state.players.p1.hand.length).toBe(before + 1);
    expect(activations(game, "p1-leader")).toHaveLength(0);
  });
});

describe("OP15-012 Buggy", () => {
  covers("OP15-012", "[When Attacking]", "[On K.O.]");

  it("[When Attacking] gives one of its controller's rested DON!! to their Leader", () => {
    const game = table("op15-012-give")
      .withBoard("p1", [character("buggy", "OP15-012")])
      .withDon("p1", { rested: 2 })
      .build();

    attack(game, "buggy", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("[When Attacking] asks nothing with no rested DON!! on either side", () => {
    const game = table("op15-012-none")
      .withBoard("p1", [character("buggy", "OP15-012")])
      .build();

    attack(game, "buggy", "p2-leader");
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
  });

  it("[On K.O.] draws a card", () => {
    const game = table("op15-012-ko", "p2")
      .withBoard("p1", [character("buggy", "OP15-012", { rested: true })])
      .withDeckTop("p1", [instance("drawn", "ST32-005")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    koInBattle(game, "buggy");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["buggy"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });
});

describe("OP15-013 Pincers", () => {
  covers("OP15-013", "static", "[Blocker]");

  it("costs 2 less in hand once its Leader is at 0 power or less", () => {
    // OP07-006 Sterry's [On Play] gives its own active Leader −5000, which
    // takes the 5000 ST31 Leader to 0.
    const game = table("op15-013-cheap")
      .withHand("p1", [
        instance("sterry", "OP07-006"),
        instance("pincers", "OP15-013"),
      ])
      .withDeckTop("p1", [instance("drawn", "ST32-005")])
      .build();
    const pincers = () =>
      game.state.players.p1.hand.find((card) => card.instanceId === "pincers")!;

    expect(effectiveCost(game.state, "p1", pincers())).toBe(4);
    game.play({ type: "play-card", cardNumber: "OP07-006" });
    game.play({ type: "resolve-effect", summary: "Activate Sterry" });
    while (game.state.pendingEffect) {
      const discard = effectOptions(game).includes("drawn")
        ? "drawn"
        : undefined;
      game.play(
        discard
          ? { type: "resolve-effect", optionId: discard }
          : { type: "resolve-effect" },
      );
    }
    expect(currentPower(game.state, "p1", "p1-leader")).toBeLessThanOrEqual(0);
    expect(effectiveCost(game.state, "p1", pincers())).toBe(2);

    const active = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP15-013" });
    expect(game.state.players.p1.activeDon.length).toBe(active - 2);
  });

  it("pays its printed 4 while the Leader has power", () => {
    const game = table("op15-013-full")
      .withHand("p1", [instance("pincers", "OP15-013")])
      .build();

    const active = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP15-013" });
    expect(game.state.players.p1.activeDon.length).toBe(active - 4);
  });

  it("[Blocker] takes the attack in its controller's place", () => {
    const game = table("op15-013-block", "p2")
      .withBoard("p1", [character("pincers", "OP15-013")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    attack(game, "attacker", "p1-leader");
    expect(canBlockWith(game, "pincers")).toBe(true);
    game.play({ type: "block", blockerInstanceId: "pincers" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("pincers");
  });
});

describe("OP15-034 Yorki", () => {
  covers("OP15-034", "[Your Turn]", "[On Play]");

  it("[On Play] gives a [Brook] +2000 for the turn", () => {
    const game = table("op15-034-play")
      .withBoard("p1", [
        character("brook", "ST31-003"),
        character("other", "ST32-004"),
      ])
      .withHand("p1", [instance("yorki", "OP15-034")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-034" });
    expect(effectOptions(game)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "brook" });

    expect(currentPower(game.state, "p1", "brook")).toBe(5000);
    game.pass();
    expect(currentPower(game.state, "p1", "brook", false)).toBe(3000);
  });

  it("[Your Turn] does nothing when it is played on the opponent's turn", () => {
    // OP13-023 Uta's [On K.O.] plays a cost-5-or-less Character from hand,
    // which K.O.'d in p2's battle puts Yorki on the field on p2's turn.
    const game = table("op15-034-their-turn", "p2")
      .withBoard("p1", [
        character("uta", "OP13-023", { rested: true }),
        character("brook", "ST31-003"),
      ])
      .withHand("p1", [instance("yorki", "OP15-034")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    koInBattle(game, "uta");
    game.play({ type: "resolve-effect", optionId: "yorki" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toContain("yorki");
    expect(currentPower(game.state, "p1", "brook", false)).toBe(3000);
  });
});

describe("OP15-044 Koala", () => {
  covers("OP15-044", "[On K.O.]", "[Blocker]");

  it("[Blocker] takes the attack in its controller's place", () => {
    const game = table("op15-044-block", "p2")
      .withBoard("p1", [character("koala", "OP15-044")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "koala" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("koala");
  });

  it("[On K.O.] adds a {Dressrosa} Event from the top 3, the rest to the bottom", () => {
    const game = table("op15-044-ko", "p2")
      .withBoard("p1", [character("koala", "OP15-044", { rested: true })])
      .withDeckTop("p1", [
        instance("not-dressrosa", "OP09-058"),
        instance("dressrosa-body", "OP15-042"),
        instance("bulls", "OP15-019"),
        instance("fourth", "ST32-005"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    koInBattle(game, "koala");
    expect(game.player).toBe("p1");
    const offered = effectOptions(game);
    expect(offered).toContain("bulls");
    // An Event of another type, and a {Dressrosa} Character, are not offered.
    expect(offered).not.toContain("not-dressrosa");
    expect(offered).not.toContain("dressrosa-body");
    game.play({ type: "resolve-effect", optionId: "bulls" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["bulls"]);
    expect(ids(game.state.players.p1.deck)[0]).toBe("fourth");
    expect(ids(game.state.players.p1.deck).slice(1).sort()).toEqual([
      "dressrosa-body",
      "not-dressrosa",
    ]);
  });
});

describe("OP15-050 Bobby Funk", () => {
  covers("OP15-050", "static");

  it("is +3000 beside a [Kelly Funk], and not alone", () => {
    const alone = table("op15-050-alone")
      .withBoard("p1", [character("bobby", "OP15-050")])
      .build();
    expect(currentPower(alone.state, "p1", "bobby", false)).toBe(3000);

    const brothers = table("op15-050-pair")
      .withBoard("p1", [
        character("bobby", "OP15-050"),
        character("kelly", "OP15-043"),
      ])
      .build();
    expect(currentPower(brothers.state, "p1", "bobby", false)).toBe(6000);
    // The buff is Bobby's own; Kelly is untouched.
    expect(currentPower(brothers.state, "p1", "kelly", false)).toBe(3000);
  });
});

describe("OP15-059 Amazon", () => {
  covers("OP15-059", "[On Your Opponent's Attack]");

  const amazonFires = (seed: string) => {
    const game = table(seed, "p2")
      .withBoard("p1", [character("amazon", "OP15-059")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    attack(game, "attacker", "p1-leader");
    game.play({ type: "resolve-effect", summary: "Amazon" });
    while (
      game.state.pendingEffect &&
      !effectOptions(game).includes("return-don")
    ) {
      game.play({ type: "resolve-effect" });
    }
    return game;
  };

  it("the opponent may return an active DON!! to escape the −2000", () => {
    const game = amazonFires("op15-059-pay");

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.player).toBe("p2");
    const field = fieldDonCount(game.state, "p2");
    game.play({ type: "resolve-effect", optionId: "return-don" });
    settle(game);

    expect(fieldDonCount(game.state, "p2")).toBe(field - 1);
    expect(game.state.players.p2.donDeck).toHaveLength(1);
    expect(currentPower(game.state, "p2", "attacker", false)).toBe(5000);
  });

  it("if they do not, Amazon's controller gives one of their cards −2000", () => {
    const game = amazonFires("op15-059-refuse");

    game.play({ type: "resolve-effect", optionId: "take-debuff" });
    expect(game.player).toBe("p1");
    expect(effectOptions(game)).toContain("p2-leader");
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);

    expect(game.state.players.p2.donDeck).toHaveLength(0);
    expect(currentPower(game.state, "p2", "attacker", false)).toBe(3000);
  });
});

/**
 * The Skypiea priest trio: OP15-064 Kotori and OP15-072 Hotori each check for
 * the other two by name, OP15-066 Satori being the third.
 */
describe("OP15-064 Kotori", () => {
  covers("OP15-064", "[Activate: Main]");

  const priests = (seed: string, withHotori: boolean) =>
    table(seed)
      .withBoard("p1", [
        character("kotori", "OP15-064"),
        character("satori", "OP15-066"),
        ...(withHotori ? [character("hotori", "OP15-072")] : []),
      ])
      .withBoard("p2", [
        character("small", "ST32-004"),
        character("big", "OP06-005"),
      ])
      .build();

  it("returns 2 DON!! and rests itself to rest a 5000-or-less Character", () => {
    const game = priests("op15-064-rest", true);
    const field = fieldDonCount(game.state, "p1");

    game.play({ type: "activate-main", sourceInstanceId: "kotori" });
    while (game.state.pendingEffect && !effectOptions(game).includes("small")) {
      game.play({ type: "resolve-effect" });
    }
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(fieldDonCount(game.state, "p1")).toBe(field - 2);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
    expect(game.state.players.p2.board[1]?.rested).toBe(false);
  });

  it("without [Hotori] the costs are paid and nothing is rested", () => {
    const game = priests("op15-064-pair", false);
    const field = fieldDonCount(game.state, "p1");

    game.play({ type: "activate-main", sourceInstanceId: "kotori" });
    expect(effectOptions(game)).not.toContain("small");
    settle(game);

    expect(fieldDonCount(game.state, "p1")).toBe(field - 2);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p2.board.every((card) => !card.rested)).toBe(
      true,
    );
  });

  it("is not offered with fewer than 2 DON!! on the field", () => {
    const game = table("op15-064-poor")
      .withBoard("p1", [character("kotori", "OP15-064")])
      .withDonDeck("p1", 9)
      .build();
    expect(activations(game, "kotori")).toHaveLength(0);
  });
});

describe("OP15-068 Heavenly Warriors", () => {
  covers("OP15-068", "static");

  it("has [Blocker] at 6 or less DON!! on the field, and not at 7", () => {
    const blocking = (seed: string, donDeck: number) => {
      const game = table(seed, "p2")
        .withBoard("p1", [character("warriors", "OP15-068")])
        .withDonDeck("p1", donDeck)
        .withBoard("p2", [character("attacker", "ST32-004")])
        .build();
      attack(game, "attacker", "p1-leader");
      return game;
    };

    const under = blocking("op15-068-under", 4);
    expect(fieldDonCount(under.state, "p1")).toBe(6);
    expect(hasKeyword(under.state, "p1", "warriors", "Blocker")).toBe(true);
    expect(canBlockWith(under, "warriors")).toBe(true);

    const over = blocking("op15-068-over", 3);
    expect(fieldDonCount(over.state, "p1")).toBe(7);
    expect(hasKeyword(over.state, "p1", "warriors", "Blocker")).toBe(false);
    expect(canBlockWith(over, "warriors")).toBe(false);
  });
});

describe("OP15-069 Nola", () => {
  covers("OP15-069", "static");

  const bounce = (seed: string, target: string) => {
    const game = table(seed, "p2")
      .withBoard("p1", [
        character("nola", "OP15-069"),
        character("sterry", "OP05-083"),
        character("gasparde", "OP06-005"),
      ])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();
    muggyBall(game, target);
    return game;
  };

  it("keeps a 7000-or-less Character on the field for a DON!! returned to the DON!! deck", () => {
    const game = bounce("op15-069-save", "sterry");
    const field = fieldDonCount(game.state, "p1");

    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "replace:nola" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toContain("sterry");
    expect(game.state.players.p1.hand).toEqual([]);
    expect(fieldDonCount(game.state, "p1")).toBe(field - 1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("protects Nola herself", () => {
    const game = bounce("op15-069-self", "nola");

    game.play({ type: "resolve-effect", optionId: "replace:nola" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toContain("nola");
  });

  it("may be declined, and the Character leaves", () => {
    const game = bounce("op15-069-decline", "sterry");

    const decline = effectOptions(game).find(
      (id) => !id.startsWith("replace:"),
    );
    game.play({ type: "resolve-effect", optionId: decline! });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["sterry"]);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("does not cover a Character above 7000 base power", () => {
    const game = bounce("op15-069-big", "gasparde");

    expect(
      effectOptions(game, "p1").filter((id) => id.startsWith("replace:")),
    ).toEqual([]);
    settle(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["gasparde"]);
  });

  it("does not answer a K.O. in battle", () => {
    const game = table("op15-069-battle", "p2")
      .withBoard("p1", [
        character("nola", "OP15-069"),
        character("sterry", "OP05-083", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "OP06-005")])
      .build();

    koInBattle(game, "sterry");
    expect(
      effectOptions(game, "p1").filter((id) => id.startsWith("replace:")),
    ).toEqual([]);
    settle(game);
    expect(ids(game.state.players.p1.trash)).toEqual(["sterry"]);
  });
});

describe("OP15-072 Hotori", () => {
  covers("OP15-072", "[Activate: Main]");

  it("returns 2 DON!! and rests itself to give a Character −3000, at any power", () => {
    const game = table("op15-072-debuff")
      .withBoard("p1", [
        character("hotori", "OP15-072"),
        character("kotori", "OP15-064"),
        character("satori", "OP15-066"),
      ])
      .withBoard("p2", [character("big", "OP06-005")])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();
    const field = fieldDonCount(game.state, "p1");

    game.play({ type: "activate-main", sourceInstanceId: "hotori" });
    while (game.state.pendingEffect && !effectOptions(game).includes("big")) {
      game.play({ type: "resolve-effect" });
    }
    game.play({ type: "resolve-effect", optionId: "big" });

    expect(fieldDonCount(game.state, "p1")).toBe(field - 2);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(currentPower(game.state, "p2", "big", false)).toBe(5000);
    game.pass();
    expect(currentPower(game.state, "p2", "big", false)).toBe(8000);
  });

  it("without [Satori] the costs are paid and nothing is debuffed", () => {
    const game = table("op15-072-pair")
      .withBoard("p1", [
        character("hotori", "OP15-072"),
        character("kotori", "OP15-064"),
      ])
      .withBoard("p2", [character("big", "OP06-005")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "hotori" });
    expect(effectOptions(game)).not.toContain("big");
    settle(game);

    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(currentPower(game.state, "p2", "big", false)).toBe(8000);
  });
});

describe("OP15-079 Absalom", () => {
  covers("OP15-079", "[On K.O.]", "[Trigger]");

  it("[On K.O.] adds a {Thriller Bark Pirates} card from the trash to hand", () => {
    const game = table("op15-079-ko", "p2")
      .withBoard("p1", [character("absalom", "OP15-079", { rested: true })])
      .withTrash("p1", [
        instance("stage", "OP06-098"),
        instance("other", "ST32-005"),
      ])
      .withBoard("p2", [character("attacker", "OP06-005")])
      .build();

    koInBattle(game, "absalom");
    expect(game.player).toBe("p1");
    const offered = effectOptions(game);
    expect(offered).toContain("stage");
    expect(offered).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "stage" });

    expect(ids(game.state.players.p1.hand)).toEqual(["stage"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "absalom",
      "other",
    ]);
  });

  it("[Trigger] runs the same recursion from Life", () => {
    const game = table("op15-079-trigger", "p2")
      .withLife("p1", [
        instance("absalom", "OP15-079"),
        instance("life-2", "ST32-005"),
      ])
      .withTrash("p1", [instance("moria", "OP06-086")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "moria" });

    expect(ids(game.state.players.p1.hand)).toEqual(["moria"]);
  });
});

describe("OP15-090 Perona", () => {
  covers("OP15-090", "static");

  const bounce = (seed: string, target: string, hand = true) => {
    const game = table(seed, "p2")
      .withBoard("p1", [
        character("perona", "OP15-090"),
        character("sterry", "OP05-083"),
        character("gasparde", "OP06-005"),
      ])
      .withHand("p1", hand ? [instance("fodder", "ST32-005")] : [])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .build();
    muggyBall(game, target);
    return game;
  };

  it("keeps a 7000-or-less Character on the field for a card trashed from hand", () => {
    const game = bounce("op15-090-save", "sterry");

    expect(game.player).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "replace:perona" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toContain("sterry");
    expect(ids(game.state.players.p1.hand)).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
  });

  it("protects Perona herself", () => {
    const game = bounce("op15-090-self", "perona");

    game.play({ type: "resolve-effect", optionId: "replace:perona" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toContain("perona");
  });

  it("is not offered with an empty hand", () => {
    const game = bounce("op15-090-empty", "sterry", false);

    expect(
      effectOptions(game, "p1").filter((id) => id.startsWith("replace:")),
    ).toEqual([]);
    settle(game);
    expect(ids(game.state.players.p1.hand)).toEqual(["sterry"]);
  });

  it("does not cover a Character above 7000 base power", () => {
    const game = bounce("op15-090-big", "gasparde");

    expect(
      effectOptions(game, "p1").filter((id) => id.startsWith("replace:")),
    ).toEqual([]);
    settle(game);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "fodder",
      "gasparde",
    ]);
  });
});

describe("OP15-097 I Find It Embarrassing as a Human Being", () => {
  covers("OP15-097", "[Main]", "[Trigger]");

  it("[Main] at 10 in the trash stops a base-cost-5 Character attacking through their next turn", () => {
    // OP15-088 Pirates Docking Six is printed at cost 5 and gains +6 on the
    // field: its *base* cost is what the clause reads.
    const game = table("op15-097-main")
      .withHand("p1", [instance("event", "OP15-097")])
      .withTrash("p1", copies(9, "ST32-005", "milled"))
      .withBoard("p2", [
        character("docking", "OP15-088"),
        character("gasparde", "OP06-005"),
      ])
      .withDeckTop("p2", copies(2, "ST32-005", "p2-deck"))
      .build();

    game.play({ type: "activate-main", cardNumber: "OP15-097" });
    // Gasparde's base cost is 6.
    expect(effectOptions(game)).not.toContain("gasparde");
    game.play({ type: "resolve-effect", optionId: "docking" });
    settle(game);

    game.pass();
    expect(game.player).toBe("p2");
    const attacks = game
      .legalActions()
      .filter((action) => action.type === "attack")
      .map((action) => action.attackerInstanceId);
    expect(attacks).not.toContain("docking");
    expect(attacks).toContain("gasparde");
  });

  it("[Main] is not offered while the trash would stay under 10", () => {
    // Eight, plus the Event itself once activated: Bandai's OP10-097 ruling
    // counts the Event toward its own trash clause, and nine is still short.
    const game = table("op15-097-short")
      .withHand("p1", [instance("event", "OP15-097")])
      .withTrash("p1", copies(8, "ST32-005", "milled"))
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP15-097"),
        ),
    ).toBe(false);
  });

  it("[Trigger] runs the same lock from Life", () => {
    const game = table("op15-097-trigger", "p2")
      .withLife("p1", [
        instance("event", "OP15-097"),
        instance("life-2", "ST32-005"),
      ])
      .withTrash("p1", copies(10, "ST32-005", "milled"))
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("second", "ST32-004"),
      ])
      .build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "second" });
    settle(game);

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "second",
        ),
    ).toBe(false);
  });
});

describe("OP15-103 Genbo", () => {
  covers("OP15-103", "[Trigger]");

  const hit = (seed: string, lifeBelow: number) => {
    const game = table(seed, "p2")
      .withLife("p1", [
        instance("genbo", "OP15-103"),
        ...copies(lifeBelow, "ST32-005", "life"),
      ])
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    return game;
  };

  it("draws, then plays itself at 2 or less Life", () => {
    const game = hit("op15-103-low", 2);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.board)).toEqual(["genbo"]);
  });

  it("draws, and stays off the field at 3 Life", () => {
    const game = hit("op15-103-high", 3);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.board)).toEqual([]);
  });
});

describe("OP15-106 Octoballoon", () => {
  covers("OP15-106", "[Trigger]");

  it("draws, then plays a yellow Character or Stage of cost 2 or less from hand", () => {
    const game = table("op15-106-trigger", "p2")
      .withLife("p1", [
        instance("balloon", "OP15-106"),
        instance("life-2", "ST32-005"),
      ])
      .withHand("p1", [
        instance("usopp", "OP07-099"),
        instance("braham", "OP15-110"),
        instance("red", "OP07-006"),
      ])
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });

    expect(ids(game.state.players.p1.hand)).toContain("drawn");
    const offered = effectOptions(game);
    expect(offered).toContain("usopp");
    // A yellow 3-cost, and a red 1-cost, are not offered.
    expect(offered).not.toContain("braham");
    expect(offered).not.toContain("red");
    game.play({ type: "resolve-effect", optionId: "usopp" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["usopp"]);
  });
});

describe("OP15-110 Braham", () => {
  covers("OP15-110", "[On K.O.]");

  const braham = (seed: string, leader?: string) => {
    let builder = table(seed, "p2")
      .withBoard("p1", [character("braham", "OP15-110", { rested: true })])
      .withDeckTop("p1", [instance("banked", "ST32-005")])
      .withLife("p1", [instance("life-1", "ST32-004")])
      .withBoard("p2", [character("attacker", "OP06-005")]);
    if (leader) builder = builder.withLeader("p1", leader);
    const game = builder.build();
    koInBattle(game, "braham");
    return game;
  };

  it("banks the top card of the deck on Life under a {Shandian Warrior} Leader", () => {
    const game = braham("op15-110-kalgara", "OP08-098");

    game.play({ type: "resolve-effect", optionId: "banked" });
    settle(game);

    expect(ids(game.state.players.p1.life)).toEqual(["banked", "life-1"]);
    expect(game.state.players.p1.deck).toEqual([]);
  });

  it("does nothing under any other Leader", () => {
    const game = braham("op15-110-other");

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.life)).toEqual(["life-1"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["banked"]);
  });
});

describe("OP15-115 Impact Dial", () => {
  covers("OP15-115", "[Main]", "[Trigger]");

  it("[Main] K.O.s a cost-4-or-less Character, then adds the top Life card to hand", () => {
    const game = table("op15-115-main")
      .withHand("p1", [instance("dial", "OP15-115")])
      .withLife("p1", [
        instance("life-top", "ST32-005"),
        instance("life-2", "ST32-005"),
      ])
      .withBoard("p2", [
        character("small", "ST32-004"),
        character("big", "OP06-005"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP15-115" });
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["big"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["life-top"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-2"]);
  });

  it("[Trigger] is the K.O. alone", () => {
    const game = table("op15-115-trigger", "p2")
      .withLife("p1", [
        instance("dial", "OP15-115"),
        instance("life-2", "ST32-005"),
      ])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("small", "ST32-001"),
      ])
      .build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-2"]);
    expect(game.state.players.p1.hand).toEqual([]);
  });
});

/**
 * A `costZone: "hand"` cost layer is the price paid as well as the cost read:
 * OP15-102 Gan.Fall prints the clause the OP15-013 Pincers fix above shares,
 * and ST23-002 Shanks is the same shape from another set.
 */
describe("hand cost layers set the price paid", () => {
  covers("OP15-102", "static");

  const spent = (game: Game, cardNumber: string): number => {
    const active = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber });
    return active - game.state.players.p1.activeDon.length;
  };

  it("OP15-102 is played for 3 less beside a 7000-power Sky Island Character", () => {
    const game = table("op15-102-price")
      .withHand("p1", [instance("ganfall", "OP15-102")])
      .withBoard("p1", [character("big", "OP15-100")])
      .withGivenDon("p1", "big", 1)
      .build();
    expect(spent(game, "OP15-102")).toBe(1);

    const alone = table("op15-102-price-off")
      .withHand("p1", [instance("ganfall", "OP15-102")])
      .build();
    expect(spent(alone, "OP15-102")).toBe(4);
  });

  it("ST23-002 is played for 3 less while the opponent has an 8000 base-power Character", () => {
    const game = table("st23-002-price")
      .withHand("p1", [instance("shanks", "ST23-002")])
      .withBoard("p2", [character("big", "OP06-005")])
      .build();
    expect(spent(game, "ST23-002")).toBe(6);
  });
});
