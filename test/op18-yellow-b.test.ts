import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP18's Yellow cards OP18-104 to OP18-117 and the keyword-only Vice
 * Admirals, one `describe` per card. Printed text: `pnpm card:text <card>`.
 * Same table as `op18-yellow.test.ts`.
 */
const SPANDAM = "OP18-079";
const ATTACKER = "OP06-005";
const FILLER = "OP08-099";

const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

function effectOptions(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

/** p2's `attacker` hits p1's Leader with `life` as p1's Life, top first. */
function hitLeader(
  seed: string,
  life: string[],
  setup: {
    leader?: string;
    p1Board?: ReturnType<typeof character>[];
    p2Board?: ReturnType<typeof character>[];
  } = {},
): Game {
  let builder = table(seed, "p2")
    .withLife(
      "p1",
      life.map((cardNumber, index) => instance(`life-${index}`, cardNumber)),
    )
    .withDeckTop("p1", [instance("drawn", FILLER), ...copies(3, FILLER)])
    .withBoard("p1", setup.p1Board ?? [])
    .withBoard("p2", [
      character("attacker", ATTACKER),
      ...(setup.p2Board ?? []),
    ]);
  if (setup.leader) builder = builder.withLeader("p1", setup.leader);
  const game = builder.build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  declineDefence(game);
  return game;
}

/** p2's vanilla Character attacks p1's Leader, and p1 blocks with `cardNumber`. */
function blocksAnAttack(seed: string, cardNumber: string): void {
  const game = table(seed, "p2")
    .withBoard("p1", [character("blocker", cardNumber)])
    .withBoard("p2", [character("attacker", ATTACKER)])
    .build();

  expect(hasKeyword(game.state, "p1", "blocker", "Blocker")).toBe(true);
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  game.play({ type: "block", blockerInstanceId: "blocker" });

  expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
  expect(boardCard(game, "p1", "blocker")?.rested).toBe(true);
}

describe("OP18-098 Onigumo", () => {
  covers("OP18-098", "[Unblockable]");

  it("[Unblockable] leaves the defender no block", () => {
    const game = table("op18-098-unblockable")
      .withBoard("p1", [character("onigumo", "OP18-098")])
      .withBoard("p2", [character("blocker", "OP18-112")])
      .withLife("p2", [instance("theirs", FILLER)])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "onigumo",
      targetInstanceId: "p2-leader",
    });

    expect(
      game.legalActions("p2").some((action) => action.type === "block"),
    ).toBe(false);
  });
});

describe("OP18-104 Strawberry", () => {
  covers("OP18-104", "[Banish]");

  it("[Banish] trashes the Life card it hits without its Trigger", () => {
    const game = table("op18-104-banish")
      .withBoard("p1", [character("strawberry", "OP18-104")])
      .withLife("p2", [instance("blueno", "OP18-110"), instance("x", FILLER)])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "strawberry",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    expect(game.state.pendingTrigger).toBeNull();
    expect(ids(game.state.players.p2.trash)).toEqual(["blueno"]);
    expect(ids(game.state.players.p2.hand)).toEqual([]);
  });
});

describe("OP18-106 Doberman", () => {
  covers("OP18-106", "[Double Attack]");

  it("[Double Attack] takes two Life cards with one hit", () => {
    const game = table("op18-106-double")
      .withBoard("p1", [character("doberman", "OP18-106")])
      .withLife("p2", copies(3, FILLER, "theirs"))
      .build();
    expect(hasKeyword(game.state, "p1", "doberman", "Double Attack")).toBe(
      true,
    );

    game.play({
      type: "attack",
      attackerInstanceId: "doberman",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    expect(ids(game.state.players.p2.life)).toEqual(["theirs-3"]);
  });
});

describe("OP18-107 Nero", () => {
  covers("OP18-107", "[Blocker]", "[Trigger]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op18-107-blocker", "OP18-107");
  });

  it("[Trigger] sends a cost-5-or-less Character to the bottom of its owner's deck", () => {
    const game = hitLeader("op18-107-trigger", ["OP18-107", FILLER], {
      leader: SPANDAM,
      p2Board: [character("small", "OP18-102"), character("big", "OP18-113")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("small");
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-107-trigger-off", ["OP18-107", FILLER], {
      p2Board: [character("small", "OP18-102")],
    });

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-108 Funkfreed", () => {
  covers("OP18-108", "[On Play]", "[Activate: Main]");

  const funkfreed = (seed: string, hand: string[]) =>
    table(seed)
      .withHand("p1", [
        instance("funkfreed", "OP18-108"),
        ...hand.map((cardNumber, index) =>
          instance(`hand-${index}`, cardNumber),
        ),
      ])
      .withDeckTop("p1", copies(4, FILLER, "deck"));

  it("[On Play] trashes a CP card from hand to draw two", () => {
    const game = funkfreed("op18-108-on-play", ["OP18-102", FILLER]).build();

    game.play({ type: "play-card", cardNumber: "OP18-108" });
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });
    expect(effectOptions(game)).not.toContain("hand-1");
    game.play({ type: "resolve-effect", optionId: "hand-0" });

    expect(ids(game.state.players.p1.trash)).toEqual(["hand-0"]);
    expect(ids(game.state.players.p1.hand)).toEqual([
      "hand-1",
      "deck-1",
      "deck-2",
    ]);
  });

  it("[On Play] may be declined", () => {
    const game = funkfreed("op18-108-decline", ["OP18-102"]).build();

    game.play({ type: "play-card", cardNumber: "OP18-108" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p1.hand)).toEqual(["hand-0"]);
    expect(game.state.players.p1.trash).toEqual([]);
  });

  it("[Activate: Main] rests itself to give the Spandam Leader +1000", () => {
    const game = table("op18-108-activate")
      .withLeader("p1", SPANDAM)
      .withBoard("p1", [
        character("funkfreed", "OP18-108"),
        character("jerry", "OP18-102"),
      ])
      .build();
    const before = currentPower(game.state, "p1", "p1-leader", true);

    game.play({ type: "activate-main", sourceInstanceId: "funkfreed" });
    // Only a card named Spandam is a target.
    expect(effectOptions(game)).not.toContain("jerry");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(boardCard(game, "p1", "funkfreed")?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "p1-leader", true)).toBe(
      before + 1000,
    );
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "funkfreed",
        ),
    ).toBe(false);
  });
});

describe("OP18-109 Fukurou", () => {
  covers("OP18-109", "[Blocker]", "[Trigger]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op18-109-blocker", "OP18-109");
  });

  const trigger = (seed: string) => {
    const game = hitLeader(seed, ["OP18-109", FILLER], {
      leader: SPANDAM,
      p2Board: [character("small", "OP18-102"), character("big", "OP18-113")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    return game;
  };

  it("[Trigger] K.O.s a cost-6-or-less opposing Character", () => {
    const game = trigger("op18-109-ko");
    game.play({ type: "resolve-effect", optionId: "ko" });
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(ids(game.state.players.p2.trash)).toContain("small");
  });

  it("[Trigger] or rests one instead", () => {
    const game = trigger("op18-109-rest");
    game.play({ type: "resolve-effect", optionId: "rest" });
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(boardCard(game, "p2", "small")?.rested).toBe(true);
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-109-trigger-off", ["OP18-109", FILLER], {
      p2Board: [character("small", "OP18-102")],
    });

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-110 Blueno", () => {
  covers("OP18-110", "[On Play]", "[Trigger]");

  it("[On Play] adds a CP card other than Blueno from the top four", () => {
    const game = table("op18-110-on-play")
      .withHand("p1", [instance("blueno", "OP18-110")])
      .withDeckTop("p1", [
        instance("other-blueno", "OP18-110"),
        instance("kaku", "OP18-099"),
        instance("filler-1", FILLER),
        instance("filler-2", FILLER),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-110" });
    expect(effectOptions(game)).not.toContain("other-blueno");
    expect(effectOptions(game)).not.toContain("filler-1");
    game.play({ type: "resolve-effect", optionId: "kaku" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(ids(game.state.players.p1.hand)).toEqual(["kaku"]);
    expect(ids(game.state.players.p1.deck.slice(-3)).sort()).toEqual([
      "filler-1",
      "filler-2",
      "other-blueno",
    ]);
  });

  it("[Trigger] draws and K.O.s a cost-2-or-less Character under any Leader", () => {
    const game = hitLeader("op18-110-trigger", ["OP18-110", FILLER], {
      p2Board: [character("tiny", "OP18-108"), character("small", "OP18-102")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(ids(game.state.players.p1.hand)).toContain("drawn");
    expect(effectOptions(game)).not.toContain("small");
    game.play({ type: "resolve-effect", optionId: "tiny" });

    expect(ids(game.state.players.p2.trash)).toContain("tiny");
  });
});

describe("OP18-111 Momonga", () => {
  covers("OP18-111", "[Rush]");

  it("[Rush] attacks on the turn it is played", () => {
    const game = table("op18-111-rush")
      .withHand("p1", [instance("momonga", "OP18-111")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-111" });

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "momonga",
        ),
    ).toBe(true);
  });
});

describe("OP18-112 Yamakaji", () => {
  covers("OP18-112", "[Blocker]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op18-112-blocker", "OP18-112");
  });
});

describe("OP18-113 Rob Lucci", () => {
  covers("OP18-113", "[On Play]", "[On K.O.]", "[Trigger]");

  it("[On Play] trashes the top card of the opponent's Life", () => {
    const game = table("op18-113-on-play")
      .withHand("p1", [instance("lucci", "OP18-113")])
      .withLife("p2", [
        instance("theirs-0", FILLER),
        instance("theirs-1", FILLER),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-113" });
    game.play({ type: "resolve-effect", optionId: "theirs-0" });

    expect(ids(game.state.players.p2.life)).toEqual(["theirs-1"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["theirs-0"]);
  });

  it("[On K.O.] trashes the top card of the opponent's Life", () => {
    const game = table("op18-113-on-ko", "p2")
      .withBoard("p1", [character("lucci", "OP18-113", { rested: true })])
      .withLife("p2", [
        instance("theirs-0", FILLER),
        instance("theirs-1", FILLER),
      ])
      .withBoard("p2", [character("attacker", ATTACKER)])
      .withGivenDon("p2", "attacker", 2)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "lucci",
    });
    declineDefence(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["lucci"]);
    game.play({ type: "resolve-effect", optionId: "theirs-0" });

    expect(ids(game.state.players.p2.life)).toEqual(["theirs-1"]);
  });

  it("[Trigger] draws and sends a cost-8-or-less Character to the bottom of its owner's deck", () => {
    const game = hitLeader("op18-113-trigger", ["OP18-113", FILLER], {
      leader: SPANDAM,
      p2Board: [character("target", "OP18-113")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(ids(game.state.players.p1.hand)).toContain("drawn");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("target");
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-113-trigger-off", ["OP18-113", FILLER]);

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-114 Wanze", () => {
  covers("OP18-114", "[On Play]", "[Trigger]");

  it("[On Play] reorders the whole Life stack and keeps each card's face", () => {
    const game = table("op18-114-on-play")
      .withHand("p1", [instance("wanze", "OP18-114")])
      .withLife("p1", [
        instance("a", FILLER),
        instance("b", "OP18-102", { faceUp: true }),
        instance("c", FILLER),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-114" });
    // The engine offers the stack as it is; any other order is a permutation
    // the caller composes onto that offer.
    const offer = game
      .legalActions()
      .find(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "order:0,1,2",
      );
    if (!offer || offer.type !== "resolve-effect") throw new Error("no order");
    game.submit({
      ...offer,
      actionId: offer.actionId.replace(/order:[\d,]+$/, "order:2,0,1"),
      optionId: "order:2,0,1",
    });

    const life = game.state.players.p1.life;
    expect(ids(life)).toEqual(["c", "a", "b"]);
    expect(life.find((card) => card.instanceId === "b")?.faceUp).toBe(true);
  });

  it("[Trigger] sends a cost-5-or-less Character to the bottom of its owner's deck", () => {
    const game = hitLeader("op18-114-trigger", ["OP18-114", FILLER], {
      leader: SPANDAM,
      p2Board: [character("small", "OP18-102"), character("big", "OP18-113")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("small");
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-114-trigger-off", ["OP18-114", FILLER], {
      p2Board: [character("small", "OP18-102")],
    });

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-115 Ten Finger Pistol", () => {
  covers("OP18-115", "[Main]", "[Trigger]");

  it("[Main] K.O.s an opposing Character with a cost of 5 or less", () => {
    const game = table("op18-115-main")
      .withHand("p1", [instance("pistol", "OP18-115")])
      .withBoard("p2", [
        character("small", "OP18-102"),
        character("big", "OP18-113"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP18-115" });
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["pistol"]);
  });

  it("[Trigger] draws and sends a cost-7-or-less Character to the bottom of its owner's deck", () => {
    const game = hitLeader("op18-115-trigger", ["OP18-115", FILLER], {
      leader: SPANDAM,
      p2Board: [character("mid", "OP18-099"), character("big", "OP18-113")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(ids(game.state.players.p1.hand)).toContain("drawn");
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "mid" });

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("mid");
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-115-trigger-off", ["OP18-115", FILLER], {
      p2Board: [character("mid", "OP18-099")],
    });

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-116 Iron Body Empty Tree", () => {
  covers("OP18-116", "[Counter]", "[Trigger]");

  const counterStep = (seed: string) => {
    const game = table(seed, "p2")
      .withHand("p1", [
        instance("tree", "OP18-116"),
        instance("fodder", FILLER),
      ])
      .withLife("p1", [instance("life-0", FILLER)])
      .withBoard("p2", [character("attacker", ATTACKER)])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    expect(game.state.phase).toBe("counter");
    game.play({ type: "activate-counter-event", eventInstanceId: "tree" });
    return game;
  };

  it("[Counter] trashes a hand card for +3000 during the battle", () => {
    const game = counterStep("op18-116-counter");
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });
    game.play({ type: "resolve-effect", optionId: "fodder" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["fodder", "tree"]);
  });

  it("[Counter] adds nothing when the trash is declined", () => {
    const game = counterStep("op18-116-counter-decline");
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
    expect(ids(game.state.players.p1.hand)).toEqual(["fodder"]);
  });

  it("[Trigger] rests an opposing Character of any cost", () => {
    const game = hitLeader("op18-116-trigger", ["OP18-116", FILLER], {
      leader: SPANDAM,
      p2Board: [character("big", "OP18-113")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "big" });

    expect(boardCard(game, "p2", "big")?.rested).toBe(true);
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-116-trigger-off", ["OP18-116", FILLER], {
      p2Board: [character("big", "OP18-113")],
    });

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-117 Buster Call", () => {
  covers("OP18-117", "[Main]");

  const busterCall = (seed: string, leader?: string) => {
    let builder = table(seed)
      .withHand("p1", [instance("buster", "OP18-117")])
      .withLife("p1", [instance("life-0", FILLER), instance("life-1", FILLER)])
      .withBoard("p1", [character("mine", "OP18-102")])
      .withDeckTop("p1", [
        instance("onigumo", "OP18-098"),
        instance("strawberry", "OP18-104"),
        instance("onigumo-2", "OP18-098"),
        instance("filler", FILLER),
      ])
      .withTrash("p1", [instance("momonga", "OP18-111")])
      .withBoard("p2", [character("theirs", "OP18-113")]);
    if (leader) builder = builder.withLeader("p1", leader);
    return builder.build();
  };

  it("[Main] trashes Life and every Character, then plays differently-named Vice Admirals from deck and trash", () => {
    const game = busterCall("op18-117-main", SPANDAM);

    game.play({ type: "activate-main", sourceCardNumber: "OP18-117" });
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });
    expect(game.state.players.p1.life).toEqual([]);
    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p2.trash)).toEqual(["theirs"]);

    game.play({ type: "resolve-effect", optionId: "onigumo" });
    // One Onigumo is on the board, so the second copy is no longer a choice.
    expect(effectOptions(game)).not.toContain("onigumo-2");
    expect(effectOptions(game)).not.toContain("filler");
    game.play({ type: "resolve-effect", optionId: "momonga" });
    game.play({ type: "resolve-effect", optionId: "strawberry" });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "done" });
    }

    const p1 = game.state.players.p1;
    expect(ids(p1.board).sort()).toEqual(["momonga", "onigumo", "strawberry"]);
    expect(ids(p1.trash).sort()).toEqual([
      "buster",
      "life-0",
      "life-1",
      "mine",
    ]);
    expect(ids(p1.deck)).toEqual(
      expect.arrayContaining(["onigumo-2", "filler"]),
    );
  });

  it("[Main] only trashes the Life under a Leader other than Spandam", () => {
    const game = busterCall("op18-117-other-leader");

    game.play({ type: "activate-main", sourceCardNumber: "OP18-117" });
    game.play({
      type: "resolve-effect",
      optionId: effectOptions(game).find((id) => id !== "skip")!,
    });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.life).toEqual([]);
    expect(ids(game.state.players.p1.board)).toEqual(["mine"]);
    expect(ids(game.state.players.p2.board)).toEqual(["theirs"]);
  });

  it("[Main] does nothing when the Life cost is declined", () => {
    const game = busterCall("op18-117-decline", SPANDAM);

    game.play({ type: "activate-main", sourceCardNumber: "OP18-117" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p1.life)).toEqual(["life-0", "life-1"]);
    expect(ids(game.state.players.p1.board)).toEqual(["mine"]);
    expect(ids(game.state.players.p2.board)).toEqual(["theirs"]);
  });
});
