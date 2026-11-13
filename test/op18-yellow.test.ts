import { describe, expect, it } from "vitest";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP18's Yellow CP cards and the OP18-079 Spandam Leader, one `describe` per
 * card. Printed text: `pnpm card:text <card>`.
 *
 * Built on the ST31/ST32 decks on a bare table, with the Spandam Leader swapped
 * in wherever a clause reads a CP Leader; ST31's Luffy is the Leader without
 * the type.
 */
const SPANDAM = "OP18-079";
/** A vanilla 8000-power Character for p2 to attack with. */
const ATTACKER = "OP06-005";
/** A vanilla card with no type including "CP". */
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

/**
 * p2's `attacker` hits p1's Leader with `life` as p1's Life (top first) and
 * the defence declined, leaving the Trigger window open.
 */
function hitLeader(
  seed: string,
  life: string[],
  setup: {
    leader?: string;
    hand?: string[];
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
    .withHand(
      "p1",
      (setup.hand ?? []).map((cardNumber, index) =>
        instance(`hand-${index}`, cardNumber),
      ),
    )
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

/** p2's `attacker` battles p1's rested `target` and the defence is declined. */
function attackCharacter(game: Game, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: target,
  });
  declineDefence(game);
}

describe("OP18-079 Spandam (Leader)", () => {
  covers("OP18-079", "[Activate: Main]");

  const leader = (seed: string, hand: string[]) =>
    table(seed)
      .withLeader("p1", SPANDAM)
      .withHand(
        "p1",
        hand.map((cardNumber, index) => instance(`hand-${index}`, cardNumber)),
      )
      .withDeckTop("p1", [instance("top", FILLER), ...copies(3, FILLER)])
      .withLife("p1", [instance("life-0", FILLER)]);

  it("rests two DON!! and itself and trashes a CP card to add the top card to Life", () => {
    const game = leader("op18-079-pay", ["OP18-102", FILLER]).build();
    const active = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    game.play({ type: "resolve-effect", optionId: "top" });

    const p1 = game.state.players.p1;
    expect(p1.leaderRested).toBe(true);
    expect(p1.activeDon).toHaveLength(active - 2);
    expect(ids(p1.trash)).toEqual(["hand-0"]);
    expect(ids(p1.hand)).toEqual(["hand-1"]);
    expect(ids(p1.life)).toEqual(["top", "life-0"]);
    // The Leader is rested now, so the cost cannot be paid a second time.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });

  it("may add nothing to Life once the cost is paid", () => {
    const game = leader("op18-079-decline", ["OP18-102"]).build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    game.play({ type: "resolve-effect", optionId: "done" });

    expect(ids(game.state.players.p1.life)).toEqual(["life-0"]);
    expect(game.state.players.p1.leaderRested).toBe(true);
  });

  it("is not offered without a CP card in hand", () => {
    const game = leader("op18-079-no-cp", [FILLER]).build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });
});

/** The face-up Life placement OP18-099, OP18-100 and OP18-101 share. */
describe("OP18-099 Kaku", () => {
  covers("OP18-099", "[On Play]", "[Trigger]");

  const kaku = (seed: string) =>
    table(seed)
      .withHand("p1", [
        instance("kaku", "OP18-099"),
        instance("jerry", "OP18-102"),
        instance("filler", FILLER),
      ])
      .withLife("p1", [instance("life-0", FILLER)]);

  it("[On Play] places a CP card from hand at the bottom of Life face-up", () => {
    const game = kaku("op18-099-bottom").build();

    game.play({ type: "play-card", cardNumber: "OP18-099" });
    expect(effectOptions(game)).not.toContain("filler");
    game.play({ type: "resolve-effect", optionId: "jerry" });
    game.play({ type: "resolve-effect", optionId: "life-bottom" });

    const life = game.state.players.p1.life;
    expect(ids(life)).toEqual(["life-0", "jerry"]);
    expect(life[1]?.faceUp).toBe(true);
    expect(life[0]?.faceUp).not.toBe(true);
  });

  it("[On Play] places it on top when asked", () => {
    const game = kaku("op18-099-top").build();

    game.play({ type: "play-card", cardNumber: "OP18-099" });
    game.play({ type: "resolve-effect", optionId: "jerry" });
    game.play({ type: "resolve-effect", optionId: "life-top" });

    expect(ids(game.state.players.p1.life)).toEqual(["jerry", "life-0"]);
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
  });

  it("[On Play] may place nothing", () => {
    const game = kaku("op18-099-decline").build();

    game.play({ type: "play-card", cardNumber: "OP18-099" });
    game.play({ type: "resolve-effect", optionId: "done" });

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.life)).toEqual(["life-0"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["jerry", "filler"]);
  });

  it("[Trigger] draws and sends a cost-8-or-less Character to the bottom of its owner's deck", () => {
    const game = hitLeader("op18-099-trigger", ["OP18-099", FILLER], {
      leader: SPANDAM,
      p2Board: [character("target", "OP18-102")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(ids(game.state.players.p1.hand)).toContain("drawn");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(ids(game.state.players.p2.board)).toEqual(["attacker"]);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("target");
  });

  it("[Trigger] reaches its owner's own Character too", () => {
    const game = hitLeader("op18-099-trigger-own", ["OP18-099", FILLER], {
      leader: SPANDAM,
      p1Board: [character("mine", "OP18-102")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["mine", "attacker"]),
    );
    game.play({ type: "resolve-effect", optionId: "mine" });

    expect(game.state.players.p1.board).toEqual([]);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("mine");
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-099-trigger-off", ["OP18-099", FILLER]);

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-100 Kalifa", () => {
  covers("OP18-100", "[On Play]", "[Trigger]");

  it("[On Play] draws, then may place the drawn CP card face-up in Life", () => {
    const game = table("op18-100-on-play")
      .withHand("p1", [instance("kalifa", "OP18-100")])
      .withDeckTop("p1", [instance("drawn", "OP18-102"), ...copies(3, FILLER)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-100" });
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    game.play({ type: "resolve-effect", optionId: "drawn" });
    game.play({ type: "resolve-effect", optionId: "life-top" });

    expect(ids(game.state.players.p1.life)).toEqual(["drawn"]);
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
  });

  it("[On Play] still draws with no CP card to place", () => {
    const game = table("op18-100-no-cp")
      .withHand("p1", [instance("kalifa", "OP18-100")])
      .withDeckTop("p1", [instance("drawn", FILLER), ...copies(3, FILLER)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-100" });

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(game.state.players.p1.life).toEqual([]);
  });

  it("[Trigger] draws and rests the opponent's Leader", () => {
    const game = hitLeader("op18-100-trigger", ["OP18-100", FILLER], {
      leader: SPANDAM,
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(ids(game.state.players.p1.hand)).toContain("drawn");
    // The attacker is already rested from swinging, so the Leader is the target.
    game.play({ type: "resolve-effect", optionId: "p2-leader" });

    expect(game.state.players.p2.leaderRested).toBe(true);
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-100-trigger-off", ["OP18-100", FILLER]);

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-101 Kumadori", () => {
  covers("OP18-101", "[On K.O.]", "[Trigger]");

  const koKumadori = (seed: string, hand: string[]) => {
    const game = table(seed, "p2")
      .withBoard("p1", [character("kumadori", "OP18-101", { rested: true })])
      .withHand(
        "p1",
        hand.map((cardNumber, index) => instance(`hand-${index}`, cardNumber)),
      )
      .withLife("p1", [instance("life-0", FILLER)])
      .withBoard("p2", [character("attacker", "OP18-113")])
      .build();
    attackCharacter(game, "kumadori");
    return game;
  };

  it("[On K.O.] places a CP card from hand face-up in Life", () => {
    const game = koKumadori("op18-101-on-ko", ["OP18-102", FILLER]);

    expect(ids(game.state.players.p1.trash)).toContain("kumadori");
    expect(effectOptions(game)).not.toContain("hand-1");
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    game.play({ type: "resolve-effect", optionId: "life-bottom" });

    expect(ids(game.state.players.p1.life)).toEqual(["life-0", "hand-0"]);
    expect(game.state.players.p1.life[1]?.faceUp).toBe(true);
  });

  it("[On K.O.] asks nothing without a CP card in hand", () => {
    const game = koKumadori("op18-101-on-ko-empty", [FILLER]);

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.life)).toEqual(["life-0"]);
  });

  const trigger = (seed: string) => {
    const game = hitLeader(seed, ["OP18-101", FILLER], {
      leader: SPANDAM,
      p2Board: [character("small", "OP18-102"), character("big", "OP18-113")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    return game;
  };

  it("[Trigger] K.O.s an opposing Character with a cost of 6 or less", () => {
    const game = trigger("op18-101-trigger-ko");
    expect(effectOptions(game)).toEqual(["ko", "rest"]);
    game.play({ type: "resolve-effect", optionId: "ko" });
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(ids(game.state.players.p2.trash)).toContain("small");
  });

  it("[Trigger] or rests one instead", () => {
    const game = trigger("op18-101-trigger-rest");
    game.play({ type: "resolve-effect", optionId: "rest" });
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    const small = game.state.players.p2.board.find(
      (card) => card.instanceId === "small",
    );
    expect(small?.rested).toBe(true);
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-101-trigger-off", ["OP18-101", FILLER], {
      p2Board: [character("small", "OP18-102")],
    });

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-103 Jabra", () => {
  covers("OP18-103", "[On K.O.]", "[Trigger]");

  const koJabra = (seed: string) => {
    const game = table(seed, "p2")
      .withBoard("p1", [character("jabra", "OP18-103", { rested: true })])
      .withDeckTop("p1", [instance("top", FILLER), ...copies(3, FILLER)])
      .withLife("p1", [instance("mine", FILLER)])
      .withLife("p2", [
        instance("theirs-0", FILLER),
        instance("theirs-1", FILLER),
      ])
      .withBoard("p2", [character("attacker", "OP18-113")])
      .build();
    attackCharacter(game, "jabra");
    return game;
  };

  it("[On K.O.] adds the top card to Life, then trashes the opponent's top Life card", () => {
    const game = koJabra("op18-103-on-ko");

    game.play({ type: "resolve-effect", optionId: "top" });
    game.play({ type: "resolve-effect", optionId: "theirs-0" });

    expect(ids(game.state.players.p1.life)).toEqual(["top", "mine"]);
    expect(ids(game.state.players.p2.life)).toEqual(["theirs-1"]);
    expect(ids(game.state.players.p2.trash)).toContain("theirs-0");
  });

  it("[On K.O.] may decline either half", () => {
    const game = koJabra("op18-103-on-ko-decline");

    game.play({ type: "resolve-effect", optionId: "done" });
    game.play({ type: "resolve-effect", optionId: "done" });

    expect(ids(game.state.players.p1.life)).toEqual(["mine"]);
    expect(ids(game.state.players.p2.life)).toEqual(["theirs-0", "theirs-1"]);
  });

  it("[Trigger] draws and sends a cost-8-or-less Character to the bottom of its owner's deck", () => {
    const game = hitLeader("op18-103-trigger", ["OP18-103", FILLER], {
      leader: SPANDAM,
      p2Board: [character("target", "OP18-113")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(ids(game.state.players.p1.hand)).toContain("drawn");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("target");
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-103-trigger-off", ["OP18-103", FILLER]);

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});

describe("OP18-105 Spandam", () => {
  covers("OP18-105", "[Trigger]");

  it("[Trigger] reveals a CP card in hand and runs that card's [Trigger]", () => {
    const game = hitLeader("op18-105-trigger", ["OP18-105", FILLER], {
      leader: SPANDAM,
      hand: ["OP18-099", FILLER],
      p2Board: [character("target", "OP18-102")],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    // Only the CP card with a [Trigger] is offered; the vanilla filler is not.
    expect(effectOptions(game)).not.toContain("hand-1");
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    expect(
      game.events.some(
        (event) =>
          event.type === "card-revealed" && event.cardNumber === "OP18-099",
      ),
    ).toBe(true);
    // Kaku's own Trigger: a draw, then the bottom-of-deck removal.
    expect(ids(game.state.players.p1.hand)).toContain("drawn");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("target");
    // Revealed, not spent: Kaku stays in hand, Spandam goes to the trash.
    expect(ids(game.state.players.p1.hand)).toContain("hand-0");
    expect(ids(game.state.players.p1.trash)).toContain("life-0");
  });

  it("[Trigger] cannot reveal another Spandam", () => {
    const game = hitLeader("op18-105-trigger-spandam", ["OP18-105", FILLER], {
      leader: SPANDAM,
      hand: ["OP18-105", FILLER],
    });
    // With nothing to reveal, the Trigger would do nothing, so it is not
    // offered as an activation.
    expect(game.summaries()).not.toContain("Activate Trigger");
  });

  it("[Trigger] may reveal nothing", () => {
    const game = hitLeader("op18-105-trigger-decline", ["OP18-105", FILLER], {
      leader: SPANDAM,
      hand: ["OP18-099"],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "done" });

    expect(ids(game.state.players.p1.hand)).toEqual(["hand-0"]);
  });

  it("[Trigger] is not offered under a Leader without a CP type", () => {
    const game = hitLeader("op18-105-trigger-off", ["OP18-105", FILLER], {
      hand: ["OP18-099"],
    });

    expect(game.summaries()).not.toContain("Activate Trigger");
  });
});
