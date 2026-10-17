import { describe, expect, it } from "vitest";
import {
  currentPower,
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
 * OP16 printed clauses no other file claims, one `describe` per card, each
 * driven to its decision through public actions.
 *
 * Built on the format's ST31/ST32 decks on a bare table (all ten DON!! active),
 * with the OP16 card placed where the clause needs it and the Leader swapped in
 * when a clause reads its type. Printed text for any card here is
 * `pnpm card:text <card>`.
 */
const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** `active` in its own Main Phase on a bare table. */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

/** Vanilla bodies, named for what a test needs from them. */
const VANILLA_8000 = "OP06-005"; // Gasparde: cost 6, 8000, no type the cards here read
const VANILLA_10000 = "OP05-044"; // John Giant: cost 8, 10000
const VANILLA_4000 = "OP05-083"; // Sterry: cost 2, 4000
const VANILLA_6000 = "OP11-003"; // Usopp: cost 5, 6000
const FILLER = "OP08-099"; // Kalgara: cost 6, 8000
/** p2's T-Bone: "[On Play] K.O. up to 1 ... cost of 2 or less". */
const T_BONE = "EB01-049";
const PRISONER = "OP16-042";

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

const activations = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    );

/** Takes the accepting branch of an open `optional`. */
const accept = (game: Game) =>
  game.play({
    type: "resolve-effect",
    optionId: effectOptions(game).find((id) => id !== "skip")!,
  });

/** Declines whatever is still open, wherever declining is offered. */
function settle(game: Game) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 60) throw new Error("pending effect never settled");
    const options = effectOptions(game);
    game.play({
      type: "resolve-effect",
      optionId:
        options.find((id) => id === "skip" || id === "done") ?? options[0]!,
    });
  }
}

/** Declines the Block and Counter steps so a declared battle resolves. */
function declineDefence(game: Game) {
  let guard = 0;
  while (game.state.phase === "block" || game.state.phase === "counter") {
    if (guard++ > 40) throw new Error("battle never settled");
    if (game.legalActions().some((a) => a.type === "resolve-trigger")) {
      game.play({ type: "resolve-trigger", optionId: "skip" });
      continue;
    }
    if (game.state.pendingEffect) return;
    game.pass();
  }
}

/** p2 swings `attacker` at `target` and p1 lets the battle resolve. */
function opponentAttacks(game: Game, attacker: string, target: string) {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
  declineDefence(game);
}

/** p2's T-Bone K.O.s `target` with its `[On Play]`. */
function tBoneKoes(game: Game, target: string) {
  game.play({ type: "play-card", cardNumber: T_BONE });
  game.play({ type: "resolve-effect", optionId: target });
}

/** A p2 attack on `target` (p1's), already in p1's Counter step. */
const counterStepOn = (target = "p1-leader") =>
  ({
    attackerPlayerId: "p2",
    defenderPlayerId: "p1",
    attackerInstanceId: "attacker",
    targetInstanceId: target,
    attackPower: 8000,
    counterPower: 0,
  }) as const;

/**
 * p2 swings at p1's Leader whose top Life card is `cardNumber`; returns with
 * the Trigger window open.
 */
function triggerFrom(
  seed: string,
  cardNumber: string,
  extend: (builder: ReturnType<typeof table>) => ReturnType<typeof table> = (
    b,
  ) => b,
  life: string[] = [],
) {
  const game = extend(
    table(seed, "p2")
      .withLife("p1", [
        instance("life-card", cardNumber),
        ...life.map((number, index) => instance(`life-${index}`, number)),
      ])
      .withBoard("p2", [character("attacker", VANILLA_8000)]),
  ).build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  let guard = 0;
  while (!game.legalActions().some((a) => a.type === "resolve-trigger")) {
    if (guard++ > 20) throw new Error("trigger window never opened");
    game.pass();
  }
  return game;
}

/** p2's vanilla attacker swings at p1's Leader, and p1 blocks with `blocker`. */
function blocksAnAttack(seed: string, cardNumber: string): void {
  const game = table(seed, "p2")
    .withBoard("p1", [character("blocker", cardNumber)])
    .withBoard("p2", [character("attacker", VANILLA_8000)])
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

const leaderPower = (game: Game, player: "p1" | "p2" = "p1") =>
  currentPower(game.state, player, `${player}-leader`, true);

describe("OP16-006 Shanks", () => {
  covers("OP16-006", "[On Play]");

  const shanks = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("shanks", "OP16-006")])
      .withBoard("p2", [
        character("small", VANILLA_4000),
        character("big", VANILLA_8000),
      ]);

  it("rests 2 DON!! to K.O. a Character with 4000 power or less", () => {
    const game = shanks("op16-006-ko").build();

    game.play({ type: "play-card", cardNumber: "OP16-006" });
    accept(game);
    expect(effectOptions(game)).toContain("small");
    expect(effectOptions(game)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(ids(game.state.players.p2.trash)).toEqual(["small"]);
    // Four for Shanks, two for the clause.
    expect(game.state.players.p1.restedDon).toHaveLength(6);
  });

  it("may be declined, resting nothing beyond Shanks's cost", () => {
    const game = shanks("op16-006-decline").build();

    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p2.board)).toEqual(["small", "big"]);
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });
});

describe("OP16-013 McGuy", () => {
  covers("OP16-013", "[On K.O.]");

  it("K.O.s a Character of 8000 base power or less when it is K.O.'d, DON!! on it notwithstanding", () => {
    const game = table("op16-013-on-ko", "p2")
      .withBoard("p1", [character("mcguy", "OP16-013", { rested: true })])
      .withBoard("p2", [
        character("attacker", VANILLA_8000),
        character("giant", VANILLA_10000),
      ])
      .withGivenDon("p2", "attacker", 1)
      .build();

    opponentAttacks(game, "attacker", "mcguy");
    expect(ids(game.state.players.p1.trash)).toEqual(["mcguy"]);
    // 9000 with the given DON!!, 8000 base: still in reach.
    expect(effectOptions(game, "p1")).toContain("attacker");
    expect(effectOptions(game, "p1")).not.toContain("giant");
    game.play({ type: "resolve-effect", optionId: "attacker" });

    expect(ids(game.state.players.p2.trash)).toEqual(["attacker"]);
    expect(ids(game.state.players.p2.board)).toEqual(["giant"]);
  });
});

describe("OP16-019 Let's Show 'Em What We're Made Of!!", () => {
  covers("OP16-019", "[Main]", "[Trigger]");

  it("[Main] plays two 8000-power Characters whose type includes Whitebeard Pirates", () => {
    const game = table("op16-019-main")
      .withHand("p1", [
        instance("event", "OP16-019"),
        // {Whitebeard Pirates Allies}: "a type including" reaches it.
        instance("mcguy", "OP16-013"),
        instance("curiel", "OP16-004"),
        instance("gasparde", VANILLA_8000),
        instance("ace", "OP16-049"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP16-019" });
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["mcguy", "curiel"]),
    );
    expect(effectOptions(game)).not.toContain("gasparde");
    expect(effectOptions(game)).not.toContain("ace");
    game.play({ type: "resolve-effect", optionId: "mcguy" });
    game.play({ type: "resolve-effect", optionId: "curiel" });
    settle(game);

    expect(ids(game.state.players.p1.board).sort()).toEqual([
      "curiel",
      "mcguy",
    ]);
    // Nine for the Event, nothing for the two Characters.
    expect(game.state.players.p1.restedDon).toHaveLength(9);
  });

  it("[Trigger] gives the Leader +1000 during this turn", () => {
    const game = triggerFrom("op16-019-trigger", "OP16-019");
    const before = leaderPower(game);

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(leaderPower(game)).toBe(before + 1000);
  });
});

describe("OP16-020 If You're Coming with Me... Kiss Your Lives Goodbye!!", () => {
  covers("OP16-020", "[Main]", "[Counter]");

  const goodbye = (seed: string, hand: string[]) =>
    table(seed)
      .withHand("p1", [
        instance("event", "OP16-020"),
        ...hand.map((number, index) => instance(`hand-${index}`, number)),
      ])
      .withDeckTop("p1", [instance("drawn", FILLER)])
      .build();

  it("[Main] rests a DON!! and reveals an 8000-power Character to draw 1", () => {
    const game = goodbye("op16-020-main", [VANILLA_8000]);

    game.play({ type: "activate-main", sourceCardNumber: "OP16-020" });
    accept(game);
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    settle(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["drawn", "hand-0"]);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("[Main] declined rests no DON!! and draws nothing", () => {
    const game = goodbye("op16-020-decline", [VANILLA_8000]);

    game.play({ type: "activate-main", sourceCardNumber: "OP16-020" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p1.hand)).toEqual(["hand-0"]);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
  });

  it("[Main] with no 8000-power Character to reveal pays nothing and draws nothing", () => {
    const game = goodbye("op16-020-no-reveal", [VANILLA_10000]);

    game.play({ type: "activate-main", sourceCardNumber: "OP16-020" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["hand-0"]);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
  });

  it("[Counter] trashes a card from hand for +3000 during the battle", () => {
    const game = table("op16-020-counter")
      .withHand("p1", [
        instance("event", "OP16-020"),
        instance("pitch", FILLER),
      ])
      .withBoard("p2", [character("attacker", VANILLA_8000)])
      .withActiveAttack(counterStepOn(), "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    accept(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["event", "pitch"]);
  });
});

describe("OP16-024 Inazuma", () => {
  covers("OP16-024", "static", "[Blocker]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op16-024-blocker", "OP16-024");
  });

  it("rests an opposing Character when the opponent's effect K.O.s it", () => {
    const game = table("op16-024-effect-ko", "p2")
      .withBoard("p1", [character("inazuma", "OP16-024")])
      .withBoard("p2", [character("victim", VANILLA_8000)])
      .withHand("p2", [instance("tbone", T_BONE)])
      .build();

    tBoneKoes(game, "inazuma");
    expect(ids(game.state.players.p1.trash)).toEqual(["inazuma"]);
    expect(game.player).toBe("p1");
    expect(effectOptions(game)).toContain("victim");
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(boardCard(game, "p2", "victim")?.rested).toBe(true);
  });

  it("rests nothing when it is K.O.'d in battle", () => {
    const game = table("op16-024-battle-ko", "p2")
      .withBoard("p1", [character("inazuma", "OP16-024", { rested: true })])
      .withBoard("p2", [
        character("attacker", VANILLA_8000),
        character("victim", VANILLA_8000),
      ])
      .build();

    opponentAttacks(game, "attacker", "inazuma");

    expect(ids(game.state.players.p1.trash)).toEqual(["inazuma"]);
    expect(game.state.pendingEffect).toBeNull();
    expect(boardCard(game, "p2", "victim")?.rested).toBe(false);
  });
});

describe("OP16-031 Buggy", () => {
  covers("OP16-031", "[On K.O.]");

  it("plays a [Prisoner of Impel Down] from hand when it is K.O.'d", () => {
    const game = table("op16-031-on-ko", "p2")
      .withBoard("p1", [character("buggy", "OP16-031", { rested: true })])
      .withHand("p1", [
        instance("prisoner", PRISONER),
        instance("other", VANILLA_4000),
      ])
      .withBoard("p2", [character("attacker", VANILLA_8000)])
      .build();

    opponentAttacks(game, "attacker", "buggy");
    expect(effectOptions(game, "p1")).toContain("prisoner");
    expect(effectOptions(game, "p1")).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "prisoner" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["prisoner"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["other"]);
  });
});

describe("OP16-033 Morley", () => {
  covers("OP16-033", "static", "[Unblockable]");

  it("[Unblockable] cannot be blocked", () => {
    const game = table("op16-033-unblockable")
      .withBoard("p1", [character("morley", "OP16-033")])
      .withBoard("p2", [character("blocker", "OP16-024")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "morley",
      targetInstanceId: "p2-leader",
    });

    expect(
      game.legalActions("p2").some((action) => action.type === "block"),
    ).toBe(false);
  });

  const morley = (seed: string) =>
    table(seed, "p2")
      .withBoard("p1", [
        character("morley", "OP16-033", { rested: true }),
        character("ally", VANILLA_4000),
      ])
      .withBoard("p2", [character("attacker", VANILLA_8000)])
      .build();

  it("rests 2 of its controller's cards instead of being K.O.'d", () => {
    const game = morley("op16-033-replace");

    opponentAttacks(game, "attacker", "morley");
    accept(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "ally" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["morley", "ally"]);
    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(boardCard(game, "p1", "ally")?.rested).toBe(true);
  });

  it("is K.O.'d when the replacement is declined", () => {
    const game = morley("op16-033-decline");

    opponentAttacks(game, "attacker", "morley");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["morley"]);
    expect(boardCard(game, "p1", "ally")?.rested).toBe(false);
  });
});

describe("OP16-043 Usopp", () => {
  covers("OP16-043", "[Blocker]", "[On K.O.]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op16-043-blocker", "OP16-043");
  });

  const usopp = (seed: string, stage?: string) => {
    let builder = table(seed, "p2")
      .withBoard("p1", [character("usopp", "OP16-043")])
      .withBoard("p2", [
        character("cheap", VANILLA_4000),
        character("pricey", VANILLA_8000),
      ])
      .withHand("p2", [instance("tbone", T_BONE)]);
    if (stage) builder = builder.withStage("p1", instance("stage", stage));
    return builder.build();
  };

  it("[On K.O.] rests a {Dressrosa} Stage to return a cost-5-or-less Character", () => {
    const game = usopp("op16-043-on-ko", "OP04-096");

    tBoneKoes(game, "usopp");
    accept(game);
    game.play({ type: "resolve-effect", optionId: "stage" });
    expect(effectOptions(game)).toContain("cheap");
    expect(effectOptions(game)).not.toContain("pricey");
    game.play({ type: "resolve-effect", optionId: "cheap" });

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(ids(game.state.players.p2.hand)).toContain("cheap");
    expect(ids(game.state.players.p2.board)).toEqual(["pricey", "tbone"]);
  });

  it("[On K.O.] returns nothing with no {Dressrosa} Leader or Stage to rest", () => {
    const game = usopp("op16-043-no-dressrosa");

    tBoneKoes(game, "usopp");
    settle(game);

    expect(ids(game.state.players.p2.board).sort()).toEqual([
      "cheap",
      "pricey",
      "tbone",
    ]);
  });
});

describe("OP16-047 Donquixote Doflamingo", () => {
  covers("OP16-047", "[Activate: Main]");

  const doffy = (seed: string, opponentHand: number) =>
    table(seed)
      .withBoard("p1", [character("doffy", "OP16-047")])
      .withHand("p2", copies(opponentHand, FILLER, "p2-card"))
      .build();

  it("rests itself to make an 8-card hand put 2 on the bottom of the deck", () => {
    const game = doffy("op16-047-bury", 8);

    game.play({ type: "activate-main", sourceInstanceId: "doffy" });
    expect(boardCard(game, "p1", "doffy")?.rested).toBe(true);
    // The cards leave p2's hand, so p2 picks them.
    expect(game.player).toBe("p2");
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(6);
    expect(game.state.players.p2.deck).toHaveLength(2);
  });

  it("rests itself but buries nothing from a 7-card hand", () => {
    const game = doffy("op16-047-seven", 7);

    game.play({ type: "activate-main", sourceInstanceId: "doffy" });
    settle(game);

    expect(boardCard(game, "p1", "doffy")?.rested).toBe(true);
    expect(game.state.players.p2.hand).toHaveLength(7);
  });
});

describe("OP16-049 Portgas.D.Ace", () => {
  covers("OP16-049", "[Activate: Main]");

  it("rests itself to draw 1, and is not offered again while rested", () => {
    const game = table("op16-049-draw")
      .withBoard("p1", [character("ace", "OP16-049")])
      .withDeckTop("p1", [instance("drawn", FILLER)])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "ace" });

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(boardCard(game, "p1", "ace")?.rested).toBe(true);
    expect(activations(game, "ace")).toHaveLength(0);
  });
});

describe("OP16-051 Mohji & Cabaji", () => {
  covers("OP16-051", "[On Play]");

  const mohji = (seed: string, handAfterPlay: number) =>
    table(seed)
      .withHand("p1", [
        instance("mohji", "OP16-051"),
        ...copies(handAfterPlay, FILLER, "held"),
      ])
      .withDeckTop("p1", copies(2, VANILLA_4000, "deck"))
      .build();

  it("draws 2 with 5 cards left in hand", () => {
    const game = mohji("op16-051-draw", 5);

    game.play({ type: "play-card", cardNumber: "OP16-051" });

    expect(game.state.players.p1.hand).toHaveLength(7);
    expect(game.state.players.p1.deck).toHaveLength(0);
  });

  it("draws nothing with 6 cards left in hand", () => {
    const game = mohji("op16-051-six", 6);

    game.play({ type: "play-card", cardNumber: "OP16-051" });

    expect(game.state.players.p1.hand).toHaveLength(6);
    expect(game.state.players.p1.deck).toHaveLength(2);
  });
});

describe("OP16-053 Roronoa Zoro", () => {
  covers("OP16-053", "[When Attacking]");

  const zoro = (seed: string, hand: number) =>
    table(seed)
      .withBoard("p1", [character("zoro", "OP16-053")])
      .withHand("p1", copies(hand, FILLER, "held"))
      .withDeckTop("p1", [instance("drawn", VANILLA_4000)])
      .build();

  const swing = (game: Game) =>
    game.play({
      type: "attack",
      attackerInstanceId: "zoro",
      targetInstanceId: "p2-leader",
    });

  it("draws 1 with 6 cards in hand", () => {
    const game = zoro("op16-053-draw", 6);
    swing(game);
    expect(ids(game.state.players.p1.hand)).toContain("drawn");
    expect(game.state.players.p1.hand).toHaveLength(7);
  });

  it("draws nothing with 7 cards in hand", () => {
    const game = zoro("op16-053-seven", 7);
    swing(game);
    expect(game.state.players.p1.hand).toHaveLength(7);
    expect(game.state.players.p1.deck).toHaveLength(1);
  });
});

describe("OP16-057 Captain Buggy's Our Savior!!", () => {
  covers("OP16-057", "[Counter]", "[Trigger]");

  const savior = (seed: string, prisoners: number) =>
    table(seed)
      .withHand("p1", [instance("event", "OP16-057")])
      .withBoard(
        "p1",
        copies(prisoners, PRISONER, "prisoner").map((card) =>
          character(card.instanceId, card.cardNumber),
        ),
      )
      .withBoard("p2", [character("attacker", VANILLA_8000)])
      .withActiveAttack(counterStepOn(), "counter")
      .build();

  it("[Counter] gives +4000 with 2 [Prisoner of Impel Down] in play", () => {
    const game = savior("op16-057-counter", 2);

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("[Counter] is not offered with only 1", () => {
    const game = savior("op16-057-one", 1);

    expect(
      game.legalActions().some((a) => a.type === "activate-counter-event"),
    ).toBe(false);
  });

  it("[Trigger] draws 2 and trashes 1", () => {
    const game = triggerFrom("op16-057-trigger", "OP16-057", (builder) =>
      builder.withDeckTop("p1", [
        instance("draw-1", FILLER),
        instance("draw-2", VANILLA_4000),
      ]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "draw-1" });

    expect(ids(game.state.players.p1.hand)).toEqual(["draw-2"]);
    expect(ids(game.state.players.p1.trash)).toContain("draw-1");
  });
});

describe("OP16-058 The Prisoners Are Rioting!!", () => {
  covers("OP16-058", "[Main]", "[Counter]");

  const riot = (seed: string, donDeck = 0) =>
    table(seed)
      .withHand("p1", [instance("event", "OP16-058")])
      .withBoard("p1", [
        character("prisoner", PRISONER),
        character("other", VANILLA_4000),
      ])
      .withDonDeck("p1", donDeck)
      .build();

  it("[Main] sets every Prisoner's base power to 7000 with 10 DON!! on the field", () => {
    const game = riot("op16-058-main");

    game.play({ type: "activate-main", sourceCardNumber: "OP16-058" });
    settle(game);

    expect(currentPower(game.state, "p1", "prisoner", true)).toBe(7000);
    expect(currentPower(game.state, "p1", "other", true)).toBe(4000);
  });

  it("[Main] is not offered with 9 DON!! on the field", () => {
    const game = riot("op16-058-nine", 1);

    expect(fieldDonCount(game.state, "p1")).toBe(9);
    expect(
      game
        .legalActions()
        .some(
          (a) =>
            a.type === "activate-main" && a.sourceCardNumber === "OP16-058",
        ),
    ).toBe(false);
  });

  it("[Counter] gives an attacked [Buggy] +4000", () => {
    const game = table("op16-058-counter")
      .withHand("p1", [instance("event", "OP16-058")])
      .withBoard("p1", [character("buggy", "OP16-031", { rested: true })])
      .withBoard("p2", [character("attacker", VANILLA_8000)])
      .withActiveAttack(counterStepOn("buggy"), "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });
});

describe("OP16-059 We'll Change This Mission from Sneaky to Flashy!", () => {
  covers("OP16-059", "[Main]", "[Counter]");

  it("[Main] rests 7 DON!! to play two {Impel Down} Characters of 6000 power or less from the top 5", () => {
    const game = table("op16-059-main")
      .withHand("p1", [instance("event", "OP16-059")])
      .withDeckTop("p1", [
        instance("prisoner-1", PRISONER),
        instance("magellan", "OP16-074"),
        instance("prisoner-2", PRISONER),
        instance("vanilla", VANILLA_4000),
        instance("filler", FILLER),
        instance("deep", FILLER),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP16-059" });
    expect(effectOptions(game)).not.toContain("magellan");
    expect(effectOptions(game)).not.toContain("vanilla");
    game.play({ type: "resolve-effect", optionId: "prisoner-1" });
    game.play({ type: "resolve-effect", optionId: "prisoner-2" });
    settle(game);

    expect(ids(game.state.players.p1.board).sort()).toEqual([
      "prisoner-1",
      "prisoner-2",
    ]);
    // The rest go under the one card the look did not reach.
    const deck = ids(game.state.players.p1.deck);
    expect(deck[0]).toBe("deep");
    expect(deck.slice(1).sort()).toEqual(["filler", "magellan", "vanilla"]);
    // One for the Event, seven for its cost.
    expect(game.state.players.p1.restedDon).toHaveLength(8);
  });

  it("[Counter] gives the attacked Leader +3000", () => {
    const game = table("op16-059-counter")
      .withHand("p1", [instance("event", "OP16-059")])
      .withBoard("p2", [character("attacker", VANILLA_8000)])
      .withActiveAttack(counterStepOn(), "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("OP16-068 Trafalgar Law", () => {
  covers("OP16-068", "[On Play]", "[When Attacking]");

  it("[On Play] adds 1 active DON!! from the DON!! deck", () => {
    const game = table("op16-068-on-play")
      .withHand("p1", [instance("law", "OP16-068")])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-068" });
    settle(game);

    expect(game.state.players.p1.donDeck).toHaveLength(1);
    // Eight on the field, four rested for Law, then one more active.
    expect(game.state.players.p1.activeDon).toHaveLength(5);
  });

  const swing = (seed: string, leader?: string) => {
    let builder = table(seed).withBoard("p1", [character("law", "OP16-068")]);
    if (leader) builder = builder.withLeader("p1", leader);
    const game = builder.build();
    game.play({
      type: "attack",
      attackerInstanceId: "law",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    return currentPower(game.state, "p1", "law", true);
  };

  it("[When Attacking] gains +3000 under a {Donquixote Pirates} Leader", () => {
    expect(swing("op16-068-attack", "OP14-060")).toBe(6000);
  });

  it("[When Attacking] gains nothing under another Leader", () => {
    expect(swing("op16-068-attack-off")).toBe(3000);
  });
});

describe("OP16-069 Donquixote Doflamingo", () => {
  covers("OP16-069", "[On Play]", "[When Attacking]");

  it("[On Play] adds 1 active DON!! from the DON!! deck", () => {
    const game = table("op16-069-on-play")
      .withHand("p1", [instance("doffy", "OP16-069")])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-069" });
    settle(game);

    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(2);
  });

  it("[When Attacking] adds 1 active DON!! from the DON!! deck", () => {
    const game = table("op16-069-attack")
      .withBoard("p1", [character("doffy", "OP16-069")])
      .withDonDeck("p1", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "doffy",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(9);
  });
});

describe("OP16-071 Benevolent King of the Waves", () => {
  covers("OP16-071", "[On Play]", "[On K.O.]");

  it("[On Play] trashes a card to add 1 rested DON!!", () => {
    const game = table("op16-071-on-play")
      .withHand("p1", [instance("king", "OP16-071"), instance("pitch", FILLER)])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-071" });
    accept(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });

    expect(ids(game.state.players.p1.trash)).toEqual(["pitch"]);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    // Three rested for the King, one added rested.
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  it("[On Play] declined keeps the card and adds nothing", () => {
    const game = table("op16-071-decline")
      .withHand("p1", [instance("king", "OP16-071"), instance("keep", FILLER)])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-071" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(ids(game.state.players.p1.hand)).toEqual(["keep"]);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("[On K.O.] adds 1 rested DON!!", () => {
    const game = table("op16-071-on-ko", "p2")
      .withBoard("p1", [character("king", "OP16-071", { rested: true })])
      .withBoard("p2", [character("attacker", VANILLA_8000)])
      .withDonDeck("p1", 1)
      .build();
    const rested = game.state.players.p1.restedDon.length;

    opponentAttacks(game, "attacker", "king");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["king"]);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(rested + 1);
  });
});

describe("OP16-072 Hannyabal", () => {
  covers("OP16-072", "[On Play]");

  it("adds an {Impel Down} card from the top 5 and bottoms the rest", () => {
    const game = table("op16-072-on-play")
      .withHand("p1", [instance("hannyabal", "OP16-072")])
      .withDeckTop("p1", [
        instance("vanilla", VANILLA_4000),
        instance("prisoner", PRISONER),
        instance("filler-1", FILLER),
        instance("filler-2", FILLER),
        instance("filler-3", FILLER),
        instance("deep", FILLER),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-072" });
    expect(effectOptions(game)).not.toContain("vanilla");
    game.play({ type: "resolve-effect", optionId: "prisoner" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["prisoner"]);
    expect(ids(game.state.players.p1.deck)[0]).toBe("deep");
    expect(game.state.players.p1.deck).toHaveLength(5);
  });
});

describe("OP16-074 Magellan", () => {
  covers("OP16-074", "[On Play]", "[On K.O.]");

  const play = (seed: string, leader?: string) => {
    let builder = table(seed).withHand("p1", [
      instance("magellan", "OP16-074"),
    ]);
    if (leader) builder = builder.withLeader("p1", leader);
    const game = builder.build();
    game.play({ type: "play-card", cardNumber: "OP16-074" });
    settle(game);
    return fieldDonCount(game.state, "p2");
  };

  it("[On Play] returns 1 of the opponent's DON!! under an {Impel Down} Leader", () => {
    expect(play("op16-074-on-play", "EB01-021")).toBe(9);
  });

  it("[On Play] returns nothing under another Leader", () => {
    expect(play("op16-074-on-play-off")).toBe(10);
  });

  it("[On K.O.] returns 4 of the opponent's DON!!", () => {
    const game = table("op16-074-on-ko", "p2")
      .withBoard("p1", [character("magellan", "OP16-074", { rested: true })])
      .withBoard("p2", [character("attacker", VANILLA_10000)])
      .build();

    opponentAttacks(game, "attacker", "magellan");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["magellan"]);
    expect(fieldDonCount(game.state, "p2")).toBe(6);
    expect(game.state.players.p2.donDeck).toHaveLength(4);
  });
});

describe("OP16-083 Kouzuki Oden", () => {
  covers("OP16-083", "[Blocker]", "[On Play]");

  it("[Blocker] redirects a declared attack", () => {
    blocksAnAttack("op16-083-blocker", "OP16-083");
  });

  it("[On Play] trashes a cost-8-or-more Character to draw 2", () => {
    const game = table("op16-083-on-play")
      .withHand("p1", [
        instance("oden", "OP16-083"),
        instance("giant", VANILLA_10000),
        instance("small", VANILLA_4000),
      ])
      .withDeckTop("p1", copies(2, FILLER, "drawn"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-083" });
    accept(game);
    expect(effectOptions(game)).not.toContain("small");
    game.play({ type: "resolve-effect", optionId: "giant" });

    expect(ids(game.state.players.p1.trash)).toEqual(["giant"]);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "drawn-1",
      "drawn-2",
      "small",
    ]);
  });
});

describe("OP16-089 Dracule Mihawk", () => {
  covers("OP16-089", "[Rush: Character]", "[On Play]");

  it("[On Play] draws 2, trashes 2, then gives an opposing Character −4 cost", () => {
    const game = table("op16-089-on-play")
      .withHand("p1", [
        instance("mihawk", "OP16-089"),
        instance("held", FILLER),
      ])
      .withDeckTop("p1", [
        instance("draw-1", VANILLA_4000),
        instance("draw-2", VANILLA_6000),
      ])
      .withBoard("p2", [character("target", VANILLA_8000)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-089" });
    game.play({ type: "resolve-effect", optionId: "held" });
    game.play({ type: "resolve-effect", optionId: "draw-1" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(ids(game.state.players.p1.hand)).toEqual(["draw-2"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["draw-1", "held"]);
    const target = boardCard(game, "p2", "target")!;
    expect(target.costModifiers?.map((m) => m.amount)).toEqual([-4]);
  });

  it("[Rush: Character] attacks a Character, not the Leader, the turn it is played", () => {
    const game = table("op16-089-rush")
      .withHand("p1", [instance("mihawk", "OP16-089")])
      .withDeckTop("p1", copies(2, FILLER, "drawn"))
      .withBoard("p2", [character("rested", VANILLA_4000, { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-089" });
    settle(game);

    const attacks = game
      .legalActions()
      .filter(
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "mihawk",
      );
    expect(
      attacks.map((a) => a.type === "attack" && a.targetInstanceId),
    ).toEqual(["rested"]);
  });
});

describe("OP16-093 Bartholomew Kuma", () => {
  covers("OP16-093", "[On Play]");

  it("draws 2, trashes 2, then gives a rested DON!! to a Character", () => {
    const game = table("op16-093-on-play")
      .withHand("p1", [instance("kuma", "OP16-093"), instance("held", FILLER)])
      .withBoard("p1", [character("ally", VANILLA_4000)])
      .withDeckTop("p1", [
        instance("draw-1", VANILLA_4000),
        instance("draw-2", VANILLA_6000),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-093" });
    game.play({ type: "resolve-effect", optionId: "held" });
    game.play({ type: "resolve-effect", optionId: "draw-1" });
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["p1-leader", "ally", "kuma", "skip"]),
    );
    game.play({ type: "resolve-effect", optionId: "ally" });

    expect(ids(game.state.players.p1.hand)).toEqual(["draw-2"]);
    expect(boardCard(game, "p1", "ally")?.attachedDon).toHaveLength(1);
    // Three rested for Kuma, one of them given away.
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });
});

describe("OP16-101 Mahoroba", () => {
  covers("OP16-101", "[Main]", "[Trigger]");

  const mahoroba = (seed: string, trash: number) =>
    table(seed)
      .withHand("p1", [instance("event", "OP16-101")])
      .withTrash("p1", copies(trash, FILLER, "trashed"))
      .withBoard("p2", [character("cheap", VANILLA_4000)])
      .build();

  it("[Main] gives +3000, then K.O.s a cost-2-or-less Character with 10 cards in the trash", () => {
    const game = mahoroba("op16-101-main", 10);

    game.play({ type: "activate-main", sourceCardNumber: "OP16-101" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "cheap" });

    expect(leaderPower(game)).toBe(8000);
    expect(ids(game.state.players.p2.trash)).toEqual(["cheap"]);
  });

  it("[Main] gives +3000 but K.O.s nothing with 9 cards in the trash", () => {
    const game = mahoroba("op16-101-nine", 9);

    game.play({ type: "activate-main", sourceCardNumber: "OP16-101" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(leaderPower(game)).toBe(8000);
    expect(ids(game.state.players.p2.board)).toEqual(["cheap"]);
  });

  it("[Trigger] adds a [Yamato] from the trash to hand", () => {
    const game = triggerFrom("op16-101-trigger", "OP16-101", (builder) =>
      builder.withTrash("p1", [
        instance("yamato", "ST28-005"),
        instance("other", FILLER),
      ]),
    );

    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(effectOptions(game)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "yamato" });

    expect(ids(game.state.players.p1.hand)).toEqual(["yamato"]);
  });
});

describe("OP16-105 Gecko Moria", () => {
  covers("OP16-105", "[Trigger]");

  const trash = (builder: ReturnType<typeof table>) =>
    builder.withTrash("p1", [
      instance("absalom", "OP06-081"),
      instance("hogback", "OP06-090"),
      instance("perona", "OP06-093"),
      instance("big-perona", "OP14-033"),
    ]);

  it("plays an Absalom, a Dr. Hogback and a Perona of cost 4 or less from the trash at 1 or less Life", () => {
    const game = triggerFrom("op16-105-trigger", "OP16-105", trash);

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "absalom" });
    game.play({ type: "resolve-effect", optionId: "hogback" });
    expect(effectOptions(game)).not.toContain("big-perona");
    game.play({ type: "resolve-effect", optionId: "perona" });
    settle(game);

    expect(ids(game.state.players.p1.board).sort()).toEqual([
      "absalom",
      "hogback",
      "perona",
    ]);
  });

  it("is not offered with 2 Life left", () => {
    const game = triggerFrom("op16-105-two-life", "OP16-105", trash, [
      FILLER,
      FILLER,
    ]);

    const options = game
      .legalActions()
      .flatMap((a) => (a.type === "resolve-trigger" ? [a.optionId] : []));
    expect(options).not.toContain("activate");
  });
});

describe("OP16-035 Roronoa Zoro: the count of an 'up to 3' gift", () => {
  covers("OP16-035", "[On Play]");

  it("gives the Leader fewer than 3 rested DON!! when the player chooses fewer", () => {
    const game = table("op16-035-fewer")
      .withHand("p1", [instance("zoro", "OP16-035"), instance("pitch", FILLER)])
      .withBoard("p1", [character("ally", VANILLA_4000)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-035" });
    // Rest nothing of the opponent's; then take the trash.
    game.play({ type: "resolve-effect", optionId: "done" });
    accept(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });
    // The Leader alone, at every count from 3 down; `skip` is the zero.
    expect(effectOptions(game)).toEqual([
      "p1-leader",
      "give:p1-leader:2",
      "give:p1-leader:1",
      "skip",
    ]);
    game.play({ type: "resolve-effect", optionId: "give:p1-leader:1" });

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    // Seven rested for Zoro, one of them given.
    expect(game.state.players.p1.restedDon).toHaveLength(6);
  });
});

describe("OP10-016 Monet: the count of an 'up to 2' gift", () => {
  covers("OP10-016", "[Activate: Main]");

  it("gives 1 of 2 rested DON!! when the player chooses 1, then debuffs", () => {
    const game = table("op10-016-fewer")
      .withBoard("p1", [
        character("monet", "OP10-016"),
        character("ally", VANILLA_4000),
      ])
      .withDon("p1", { rested: 2 })
      .withBoard("p2", [character("target", VANILLA_8000)])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "monet" });
    if (effectOptions(game).includes("apply")) accept(game);
    expect(effectOptions(game)).toContain("give:ally:1");
    const summary = game
      .legalActions()
      .find(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "give:ally:1",
      );
    expect(summary).toMatchObject({ donGift: { count: 1 } });
    game.play({ type: "resolve-effect", optionId: "give:ally:1" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(boardCard(game, "p1", "ally")?.attachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(currentPower(game.state, "p2", "target", false)).toBe(7000);
  });

  it("still gives both when the player takes the recipient's own option", () => {
    const game = table("op10-016-both")
      .withBoard("p1", [
        character("monet", "OP10-016"),
        character("ally", VANILLA_4000),
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "monet" });
    if (effectOptions(game).includes("apply")) accept(game);
    game.play({ type: "resolve-effect", optionId: "ally" });
    settle(game);

    expect(boardCard(game, "p1", "ally")?.attachedDon).toHaveLength(2);
  });
});

describe("OP16-052 Monkey.D.Luffy: the activation's gate", () => {
  covers("OP16-052", "[Activate: Main]");

  it("is not offered while no DON!! is rested", () => {
    const game = table("op16-052-no-rested")
      .withBoard("p1", [character("luffy", "OP16-052")])
      .build();

    expect(game.state.players.p1.restedDon).toEqual([]);
    expect(activations(game, "luffy")).toHaveLength(0);
  });
});
