import { describe, expect, it } from "vitest";
import {
  currentPower,
  hasKeyword,
  observe,
  type BoardCard,
  type CardInstance,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-16, one case per ruling, named by the Q&A id
 * (`<card>#<n>`, in the order the PDF prints them for that card -- OP16-040 and
 * OP16-048 each have a second ruling appended at the end of the PDF, and it is
 * numbered after the first).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op16.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** The sealed-format Leader treated as a card with every name, type and attribute. */
const ALL_NAMES = "SEALED-LUFFY";

/** An empty table on one player's turn, late enough for every DON!! to be out. */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

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

/** Answers "apply" until a prompt offers something other than apply/skip/done. */
function untilChoice(game: Game): void {
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game).every((option) =>
      ["apply", "skip", "done"].includes(option),
    )
  ) {
    if (guard++ > 20) throw new Error("no card choice was offered");
    const options = effectOptions(game);
    game.play({
      type: "resolve-effect",
      optionId: options.includes("apply") ? "apply" : options[0]!,
    });
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

const attack = (game: Game, attacker: string, target: string) =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

/** Declines the Block and Counter steps until the battle resolves. */
function declineDefence(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

/** Passes the Block and Counter steps until the Life Trigger is offered. */
function toTrigger(game: Game): void {
  let guard = 0;
  while (!game.state.pendingTrigger) {
    if (guard++ > 10) throw new Error("no Trigger was offered");
    game.pass();
  }
}

const replacements = (game: Game) =>
  effectOptions(game).filter((option) => option.startsWith("replace:"));

/**
 * A hand holding one Character at 7000, one at exactly 8000 and one at 9000:
 * OP16-008 Squard, OP16-005 Thatch and OP16-035 Roronoa Zoro.
 */
const powerLadder = (): CardInstance[] => [
  instance("seven", "OP16-008"),
  instance("eight", "OP16-005"),
  instance("nine", "OP16-035"),
];

/** Plays `cardNumber` from hand beside the power ladder and walks to its first card choice. */
function playBesideLadder(seed: string, cardNumber: string): Game {
  const game = table(seed)
    .withHand("p1", [instance("played", cardNumber), ...powerLadder()])
    .withBoard("p2", [character("target", "FIX-001")])
    .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
    .build();
  game.play({ type: "play-card", cardNumber });
  untilChoice(game);
  return game;
}

/** p2's 9000-power Zoro beats a rested p1 Character in battle. */
function koInBattle(
  seed: string,
  board: BoardCard[],
  victim: string,
  setup: { hand?: CardInstance[]; leader?: string } = {},
): Game {
  let builder = table(seed, "p2")
    .withBoard("p1", board)
    .withBoard("p2", [character("attacker", "OP16-035")]);
  if (setup.hand) builder = builder.withHand("p1", setup.hand);
  if (setup.leader) builder = builder.withLeader("p1", setup.leader);
  const game = builder.build();
  attack(game, "attacker", victim);
  declineDefence(game);
  return game;
}

/**
 * Each Red Whitebeard card that asks for an 8000-power Character in hand
 * names an exact number, not a floor: Bandai answers the same question for
 * each card that prints it.
 */
describe("FAQ OP-16 Red: 8000 power is exact", () => {
  it("OP16-002#1: Izo's reveal takes only an 8000, not a 7000 or a 9000", () => {
    const game = playBesideLadder("faq-op16-002-1", "OP16-002");
    expect(effectOptions(game)).toContain("eight");
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("nine");
  });

  it("OP16-003#1: Newgate's two revealed cards must both be 8000s", () => {
    const game = table("faq-op16-003-1")
      .withHand("p1", [
        instance("played", "OP16-003"),
        instance("seven", "OP16-008"),
        instance("eight-1", "OP16-005"),
        instance("eight-2", "OP16-004"),
        instance("nine", "OP16-035"),
      ])
      .withBoard("p2", [character("target", "FIX-001")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-003" });
    untilChoice(game);

    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["eight-1", "eight-2"]),
    );
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("nine");
  });

  it("OP16-007#1: Jozu's reveal takes only an 8000", () => {
    const game = playBesideLadder("faq-op16-007-1", "OP16-007");
    expect(effectOptions(game)).toContain("eight");
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("nine");
  });

  it("OP16-009#1: Speed Jil's trash cost takes only an 8000", () => {
    const game = playBesideLadder("faq-op16-009-1", "OP16-009");
    expect(effectOptions(game)).toContain("eight");
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("nine");
  });

  it("OP16-010#1: Namule's reveal takes only an 8000", () => {
    const game = playBesideLadder("faq-op16-010-1", "OP16-010");
    expect(effectOptions(game)).toContain("eight");
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("nine");
  });

  it("OP16-011#1: Vista's reveal takes only an 8000", () => {
    const game = playBesideLadder("faq-op16-011-1", "OP16-011");
    expect(effectOptions(game)).toContain("eight");
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("nine");
  });

  it("OP16-014#1: Marco's [On K.O.] trash cost takes only an 8000", () => {
    const game = koInBattle(
      "faq-op16-014-1",
      [character("marco", "OP16-014", { rested: true })],
      "marco",
      { hand: powerLadder() },
    );
    expect(ids(game.state.players.p1.trash)).toContain("marco");
    untilChoice(game);
    expect(effectOptions(game)).toContain("eight");
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("nine");
  });

  it("OP16-015#1: Luffy's attack-time trash cost takes only an 8000", () => {
    const game = table("faq-op16-015-1", "p2")
      .withBoard("p1", [character("luffy", "OP16-015")])
      .withHand("p1", powerLadder())
      .withBoard("p2", [character("attacker", "OP16-035")])
      .build();
    attack(game, "attacker", "p1-leader");
    expect(game.player).toBe("p1");
    untilChoice(game);
    expect(effectOptions(game)).toContain("eight");
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("nine");
  });

  it("OP16-019#1: Let's Show 'Em plays only Whitebeard 8000s", () => {
    // OP08-047 Jozu (7000) and OP16-003 Newgate (10000) are both Whitebeard
    // Pirates, so power is the only thing keeping them out.
    const game = table("faq-op16-019-1")
      .withHand("p1", [
        instance("event", "OP16-019"),
        instance("seven", "OP08-047"),
        instance("eight", "OP16-005"),
        instance("ten", "OP16-003"),
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP16-019" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("eight");
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("ten");
  });

  it("OP16-020#1: the [Main] reveal takes only an 8000", () => {
    const game = table("faq-op16-020-1")
      .withHand("p1", [instance("event", "OP16-020"), ...powerLadder()])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP16-020" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("eight");
    expect(effectOptions(game)).not.toContain("seven");
    expect(effectOptions(game)).not.toContain("nine");
  });
});

describe("FAQ OP16-001 Portgas.D.Ace", () => {
  it("OP16-001#1: a 7000-power Whitebeard Pirates Character is not given [Rush]", () => {
    const game = table("faq-op16-001-1")
      .withLeader("p1", "OP16-001")
      .withBoard("p1", [character("jozu", "OP08-047", { playedTurn: 11 })])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    settle(game, "whitebeard", "jozu");

    expect(hasKeyword(game.state, "p1", "jozu", "Rush")).toBe(false);
  });
});

describe("FAQ OP16-003 Edward.Newgate", () => {
  it("OP16-003#2: a Leader that already has [Double Attack] keeps it and still gets +2000", () => {
    // OP16-039 Gum-Gum Twin Jet Pistol gives the OP16-022 Luffy Leader
    // [Double Attack] before Newgate arrives.
    const game = table("faq-op16-003-2")
      .withLeader("p1", "OP16-022")
      .withHand("p1", [
        instance("twin-jet", "OP16-039"),
        instance("newgate", "OP16-003"),
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP16-039" });
    settle(game, "p1-leader", "done", "skip");
    expect(hasKeyword(game.state, "p1", "p1-leader", "Double Attack")).toBe(
      true,
    );
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);

    game.play({ type: "play-card", cardNumber: "OP16-003" });
    settle(game, "skip");

    expect(hasKeyword(game.state, "p1", "p1-leader", "Double Attack")).toBe(
      true,
    );
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });
});

describe("FAQ OP16-008 Squard", () => {
  it("OP16-008#1: only a 10000 base power Character pays, not a 9000 or a 12000", () => {
    const game = table("faq-op16-008-1")
      .withHand("p1", [instance("squard", "OP16-008")])
      .withBoard("p1", [
        character("ten", "OP16-003"),
        character("nine", "OP16-035"),
        character("twelve", "OP13-042"),
      ])
      .withBoard("p2", [character("target", "FIX-001")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-008" });
    untilChoice(game);

    expect(effectOptions(game)).toContain("ten");
    expect(effectOptions(game)).not.toContain("nine");
    expect(effectOptions(game)).not.toContain("twelve");
  });
});

describe("FAQ OP16-018 Rockstar", () => {
  it("OP16-018#1: with no 6000+ Character in hand, nothing else may be trashed and the K.O. stands", () => {
    // OP16-012 Benn.Beckman is the {Red-Haired Pirates} Character, and
    // OP16-009 Speed Jil (5000) the only card in hand.
    const game = koInBattle(
      "faq-op16-018-1",
      [
        character("rockstar", "OP16-018"),
        character("beckman", "OP16-012", { rested: true }),
      ],
      "beckman",
      { hand: [instance("small", "OP16-009")] },
    );

    expect(replacements(game)).toEqual([]);
    settle(game);
    expect(ids(game.state.players.p1.trash)).toContain("beckman");
    expect(ids(game.state.players.p1.hand)).toEqual(["small"]);
  });
});

describe("FAQ OP16-022 Monkey.D.Luffy", () => {
  it("OP16-022#1: with no Characters at all, no DON!! is set active", () => {
    const game = table("faq-op16-022-1")
      .withLeader("p1", "OP16-022")
      .withDon("p1", { rested: 2 })
      .build();
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(2);

    // Either answer satisfies the ruling: not offered, or offered and empty.
    const offered = game
      .legalActions()
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "p1-leader",
      );
    if (offered) {
      game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
      settle(game, "apply");
    }

    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });
});

/**
 * OP16-025 Bunkov and OP16-029 Antlerkov each look for the other by name. A
 * Leader treated as having every card name is a card on the field with that
 * name, and Bandai rules the play goes ahead without the partner.
 */
describe("FAQ OP16-025 Bunkov and OP16-029 Antlerkov", () => {
  const pairAttack = (seed: string, cardNumber: string, partner?: string) => {
    const game = (
      partner
        ? table(seed).withBoard("p1", [
            character("attacker", cardNumber),
            character("partner", partner),
          ])
        : table(seed)
            .withLeader("p1", ALL_NAMES)
            .withBoard("p1", [character("attacker", cardNumber)])
    )
      .withHand("p1", [instance("small", "FIX-002")])
      .build();
    attack(game, "attacker", "p2-leader");
    untilChoice(game);
    return game;
  };

  it("OP16-025#1: under an every-name Leader, with no [Antlerkov], the 2-cost play is offered", () => {
    const game = pairAttack("faq-op16-025-1", "OP16-025");
    expect(effectOptions(game, "p1")).toContain("small");
  });

  it("OP16-025#1 (control): with a real [Antlerkov] Character, the play is offered", () => {
    const game = pairAttack("faq-op16-025-1-control", "OP16-025", "OP16-029");
    expect(effectOptions(game, "p1")).toContain("small");
  });

  it("OP16-029#1: under an every-name Leader, with no [Bunkov], the 2-cost play is offered", () => {
    const game = pairAttack("faq-op16-029-1", "OP16-029");
    expect(effectOptions(game, "p1")).toContain("small");
  });
});

describe("FAQ OP16-026 Emporio.Ivankov", () => {
  it("OP16-026#1: adding nothing from the look still offers the 2-cost play", () => {
    const game = table("faq-op16-026-1")
      .withHand("p1", [
        instance("ivankov", "OP16-026"),
        instance("small", "FIX-002"),
      ])
      .withDeckTop("p1", copies(3, "FIX-001", "looked"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-026" });
    const skip = effectOptions(game).find((option) => option.includes("skip"));
    expect(skip).toBeDefined();
    game.play({ type: "resolve-effect", optionId: skip! });

    expect(effectOptions(game)).toContain("small");
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);
    expect(ids(game.state.players.p1.board)).toContain("small");
  });
});

describe("FAQ OP16-033 Morley", () => {
  it("OP16-033#1: an active Morley may rest itself as one of the two cards", () => {
    // p2's OP16-008 Squard trashes its own OP16-003 Newgate (10000 base) to
    // K.O. the active Morley.
    const game = table("faq-op16-033-1", "p2")
      .withBoard("p1", [character("morley", "OP16-033")])
      .withBoard("p2", [character("newgate", "OP16-003")])
      .withHand("p2", [instance("squard", "OP16-008")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-008" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "newgate" });
    game.play({ type: "resolve-effect", optionId: "morley" });

    expect(game.player).toBe("p1");
    expect(replacements(game)).toHaveLength(1);
    game.play({ type: "resolve-effect", optionId: replacements(game)[0]! });
    expect(effectOptions(game, "p1")).toContain("morley");
    game.play({ type: "resolve-effect", optionId: "morley" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["morley"]);
    expect(boardCard(game, "p1", "morley")?.rested).toBe(true);
    expect(game.state.players.p1.leaderRested).toBe(true);
  });
});

/**
 * OP16-034 Monkey.D.Luffy counts Characters by card name: a card that is also
 * treated as other names (EB04-038 Rosinante & Law) is still one card with a
 * name, and two copies of it share that name. Luffy prints 0 power, and the
 * one DON!! given to it is +1000 on its own.
 */
describe("FAQ OP16-034 Monkey.D.Luffy", () => {
  const luffyWith = (seed: string, others: BoardCard[]) =>
    table(seed)
      .withBoard("p1", [character("luffy", "OP16-034"), ...others])
      .withGivenDon("p1", "luffy", 1)
      .build();

  it("OP16-034#1: alone on the field, it still gets +1000 for itself", () => {
    const game = luffyWith("faq-op16-034-1", []);
    expect(currentPower(game.state, "p1", "luffy")).toBe(2000);
  });

  it("OP16-034#2: beside one Rosinante & Law it counts two names, not four", () => {
    const game = luffyWith("faq-op16-034-2", [
      character("rosi-law", "EB04-038"),
    ]);
    expect(currentPower(game.state, "p1", "luffy")).toBe(3000);
  });

  it("OP16-034#3: two Rosinante & Law share one name, so it is still +2000", () => {
    const game = luffyWith("faq-op16-034-3", [
      character("rosi-law-1", "EB04-038"),
      character("rosi-law-2", "EB04-038"),
    ]);
    expect(currentPower(game.state, "p1", "luffy")).toBe(3000);
  });

  it("OP16-034#4: beside a Trafalgar Law and a Rosinante & Law it counts three", () => {
    const game = luffyWith("faq-op16-034-4", [
      character("law", "OP13-031"),
      character("rosi-law", "EB04-038"),
    ]);
    expect(currentPower(game.state, "p1", "luffy")).toBe(4000);
  });
});

describe("FAQ OP16-035 Roronoa Zoro", () => {
  it("OP16-035#1: resting nothing still allows the trash for three DON!! on the Leader", () => {
    const game = table("faq-op16-035-1")
      .withHand("p1", [
        instance("zoro", "OP16-035"),
        instance("spare", "FIX-001"),
      ])
      .withBoard("p2", [character("target", "FIX-001")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-035" });
    // Decline the rest.
    const decline = effectOptions(game).find((option) =>
      ["done", "skip"].includes(option),
    );
    expect(decline).toBeDefined();
    game.play({ type: "resolve-effect", optionId: decline! });
    expect(boardCard(game, "p2", "target")?.rested).toBe(false);

    untilChoice(game);
    expect(effectOptions(game)).toContain("spare");
    game.play({ type: "resolve-effect", optionId: "spare" });
    settle(game, "3", "p1-leader");

    expect(ids(game.state.players.p1.trash)).toEqual(["spare"]);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(3);
  });
});

/**
 * OP16-040 Gum-Gum Hammer Rifle asks for [Monkey.D.Luffy] and [Mr.3(Galdino)]
 * on its controller's side. Checked by letting p2's next Refresh Phase run.
 */
describe("FAQ OP16-040 Gum-Gum Hammer Rifle", () => {
  const rifle = (
    seed: string,
    setup: (game: ReturnType<typeof table>) => ReturnType<typeof table>,
  ) => {
    const game = setup(
      table(seed)
        .withHand("p1", [instance("rifle", "OP16-040")])
        .withDeckTop("p2", copies(3, "FIX-001", "p2-deck")),
    ).build();
    game.play({ type: "activate-main", sourceCardNumber: "OP16-040" });
    settle(game, "target");
    game.pass();
    return game;
  };

  it("OP16-040#1: the opponent's [Mr.3(Galdino)] does not count, so nothing is locked", () => {
    // The ST31 Leader is the [Monkey.D.Luffy]; the Mr.3 is on p2's side.
    const game = rifle("faq-op16-040-1", (builder) =>
      builder.withBoard("p2", [
        character("galdino", "OP16-037"),
        character("target", "FIX-002", { rested: true }),
      ]),
    );
    expect(game.state.turnPlayerId).toBe("p2");
    expect(boardCard(game, "p2", "target")?.rested).toBe(false);
  });

  it("OP16-040#2: an every-name Leader alone is both names, and the lock lands", () => {
    const game = rifle("faq-op16-040-2", (builder) =>
      builder
        .withLeader("p1", ALL_NAMES)
        .withBoard("p2", [character("target", "FIX-002", { rested: true })]),
    );
    expect(game.state.turnPlayerId).toBe("p2");
    expect(boardCard(game, "p2", "target")?.rested).toBe(true);
  });
});

/** Passes the Block step, leaving p1 in the Counter step of p2's attack. */
function toCounterStep(game: Game): void {
  let guard = 0;
  while (game.state.phase === "block" && game.state.pendingEffect === null) {
    if (guard++ > 10) throw new Error("the Counter step never came");
    game.pass();
  }
  expect(game.state.phase).toBe("counter");
}

describe("FAQ OP16-041 Buggy", () => {
  it("OP16-041#1: an {Impel Down} Character trashed to make room for a sixth is not a removal it answers", () => {
    // OP16-044 Emporio.Ivankov is the {Impel Down} Character trashed by the
    // five-Character limit when FIX-002 is played.
    const game = table("faq-op16-041-1")
      .withLeader("p1", "OP16-041")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [
        character("impel", "OP16-044"),
        ...copies(4, "FIX-001", "filler").map((card) =>
          character(card.instanceId, card.cardNumber),
        ),
      ])
      .withHand("p1", [
        instance("newcomer", "FIX-002"),
        instance("prisoner", "OP16-042"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "FIX-002" });
    expect(effectOptions(game)).toContain("impel");
    game.play({ type: "resolve-effect", optionId: "impel" });
    settle(game, "apply", "prisoner");

    expect(ids(game.state.players.p1.trash)).toEqual(["impel"]);
    expect(ids(game.state.players.p1.board)).toContain("newcomer");
    expect(ids(game.state.players.p1.hand)).toEqual(["prisoner"]);
  });

  it("OP16-041#2: its own Slave Arrow returning an {Impel Down} Character lets it play a Prisoner", () => {
    const game = table("faq-op16-041-2", "p2")
      .withLeader("p1", "OP16-041")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [character("olive", "OP16-050")])
      .withHand("p1", [
        instance("arrow", "OP07-056"),
        instance("prisoner", "OP16-042"),
      ])
      .withLife("p1", copies(2, "FIX-001", "life"))
      .withBoard("p2", [character("attacker", "OP16-035")])
      .build();
    attack(game, "attacker", "p1-leader");
    toCounterStep(game);
    game.play({ type: "activate-counter-event", cardNumber: "OP07-056" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("olive");
    game.play({ type: "resolve-effect", optionId: "olive" });
    settle(game, "p1-leader", "apply", "prisoner");

    expect(ids(game.state.players.p1.hand)).toContain("olive");
    expect(ids(game.state.players.p1.board)).toContain("prisoner");
  });
});

describe("FAQ OP16-045 Crocodile", () => {
  it("OP16-045#1: Crocodile may return itself to pay for the 2-cost play", () => {
    // FIX-002 on the board is a second cost-2 Character, so the cost is
    // offered at all; OP16-025 Bunkov is the {Impel Down} 2-cost in hand.
    const game = table("faq-op16-045-1")
      .withBoard("p1", [character("other", "FIX-002")])
      .withHand("p1", [
        instance("croc", "OP16-045"),
        instance("bunkov", "OP16-025"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-045" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("croc");
    game.play({ type: "resolve-effect", optionId: "croc" });
    settle(game, "bunkov");

    expect(ids(game.state.players.p1.hand)).toContain("croc");
    expect(ids(game.state.players.p1.board)).toContain("bunkov");
  });
});

describe("FAQ OP16-047 Donquixote Doflamingo", () => {
  it("OP16-047#1: the opponent picks which of their cards go to the bottom", () => {
    const game = table("faq-op16-047-1")
      .withBoard("p1", [character("doffy", "OP16-047")])
      .withHand("p2", copies(8, "FIX-001", "p2-hand"))
      .withDeckTop("p2", copies(2, "FIX-002", "p2-deck"))
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "doffy" });
    untilChoice(game);

    expect(game.player).toBe("p2");
    expect(effectOptions(game, "p2")).toContain("p2-hand-5");
    game.play({ type: "resolve-effect", optionId: "p2-hand-5" });
    if (effectOptions(game, "p2").includes("p2-hand-2")) {
      game.play({ type: "resolve-effect", optionId: "p2-hand-2" });
    }
    settle(game, "done");

    expect(ids(game.state.players.p2.deck.slice(-2)).sort()).toEqual([
      "p2-hand-2",
      "p2-hand-5",
    ]);
    expect(game.state.players.p2.hand).toHaveLength(6);
  });
});

describe("FAQ OP16-048 Buggy", () => {
  it("OP16-048#1: the attacked Prisoner given [Blocker] may block that same attack", () => {
    // EB04-050 lets p2's {SWORD} OP11-017 X.Drake attack the active Prisoner.
    const game = table("faq-op16-048-1", "p2")
      .withBoard("p1", [
        character("buggy", "OP16-048"),
        character("prisoner", "OP16-042"),
      ])
      .withBoard("p2", [character("drake", "OP11-017")])
      .withHand("p2", [instance("whip", "EB04-050")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "EB04-050" });
    settle(game, "drake");
    attack(game, "drake", "prisoner");

    expect(game.player).toBe("p1");
    expect(effectOptions(game, "p1")).toContain("prisoner");
    game.play({ type: "resolve-effect", optionId: "prisoner" });
    expect(hasKeyword(game.state, "p1", "prisoner", "Blocker")).toBe(true);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "prisoner",
        ),
    ).toBe(true);
  });

  it("OP16-048#2: an every-name Leader can be given the [Blocker]", () => {
    const game = table("faq-op16-048-2", "p2")
      .withLeader("p1", ALL_NAMES)
      .withBoard("p1", [
        character("buggy", "OP16-048"),
        character("vista", "OP16-011", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "OP16-035")])
      .build();
    attack(game, "attacker", "vista");
    expect(effectOptions(game, "p1")).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(hasKeyword(game.state, "p1", "p1-leader", "Blocker")).toBe(true);
  });
});

describe("FAQ OP16-050 Miss Olive", () => {
  it("OP16-050#1: Olive may return itself, then draw 2 and trash 1", () => {
    const game = table("faq-op16-050-1")
      .withHand("p1", [instance("olive", "OP16-050")])
      .withDeckTop("p1", copies(2, "FIX-001", "drawn"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-050" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("olive");
    game.play({ type: "resolve-effect", optionId: "olive" });
    settle(game, "drawn-1");

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "drawn-2",
      "olive",
    ]);
    expect(ids(game.state.players.p1.trash)).toEqual(["drawn-1"]);
  });
});

/**
 * OP16-057 and OP16-058 read [Prisoner of Impel Down] by name, and a Leader
 * treated as having every card name is one.
 */
describe("FAQ OP16-057 Captain Buggy's Our Savior!!", () => {
  const savior = (seed: string, prisoners: number) => {
    // ST31-002 Jinbe at 6000 beats the 5000 Leader by itself; +4000 holds it.
    const game = table(seed, "p2")
      .withLeader("p1", ALL_NAMES)
      .withBoard(
        "p1",
        copies(prisoners, "OP16-042", "prisoner").map((card) =>
          character(card.instanceId, card.cardNumber),
        ),
      )
      .withHand("p1", [instance("savior", "OP16-057")])
      .withLife("p1", copies(2, "FIX-001", "life"))
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();
    attack(game, "attacker", "p1-leader");
    toCounterStep(game);
    game.play({ type: "activate-counter-event", cardNumber: "OP16-057" });
    settle(game, "p1-leader");
    declineDefence(game);
    return game;
  };

  it("OP16-057#1: an every-name Leader and one Prisoner make two, and the +4000 lands", () => {
    const game = savior("faq-op16-057-1", 1);
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("OP16-057#1 (control): with two Prisoner Characters the +4000 lands", () => {
    const game = savior("faq-op16-057-1-control", 2);
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("FAQ OP16-058 The Prisoners Are Rioting!!", () => {
  it("OP16-058#1: an every-name Leader's base power becomes 7000 too", () => {
    const game = table("faq-op16-058-1")
      .withLeader("p1", ALL_NAMES)
      .withBoard("p1", [character("prisoner", "OP16-042")])
      .withHand("p1", [instance("riot", "OP16-058")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP16-058" });
    settle(game);

    expect(currentPower(game.state, "p1", "prisoner")).toBe(7000);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });
});

describe("FAQ OP16-060 Sengoku", () => {
  it("OP16-060#1: one Admiral may be played alone", () => {
    const game = table("faq-op16-060-1")
      .withLeader("p1", "OP16-060")
      .withHand("p1", [
        instance("kuzan", "OP16-063"),
        instance("sakazuki", "OP16-065"),
        instance("borsalino", "OP16-073"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("kuzan");
    game.play({ type: "resolve-effect", optionId: "kuzan" });
    settle(game, "done", "skip");

    expect(ids(game.state.players.p1.board)).toEqual(["kuzan"]);
    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "borsalino",
      "sakazuki",
    ]);
  });
});

describe("FAQ OP16-063 Kuzan", () => {
  it("OP16-063#1: a Character without [Blocker] may be chosen, and a [Blocker] it gains later that turn cannot be used", () => {
    // p2's OP16-048 Buggy gives its Prisoner [Blocker] when p1 attacks.
    const game = table("faq-op16-063-1")
      .withBoard("p1", [character("kuzan", "OP16-063")])
      .withBoard("p2", [
        character("buggy", "OP16-048"),
        character("prisoner", "OP16-042"),
      ])
      .build();
    expect(hasKeyword(game.state, "p2", "prisoner", "Blocker")).toBe(false);
    game.play({ type: "activate-main", sourceInstanceId: "kuzan" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("prisoner");
    game.play({ type: "resolve-effect", optionId: "prisoner" });
    settle(game);

    attack(game, "kuzan", "p2-leader");
    expect(effectOptions(game, "p2")).toContain("prisoner");
    game.play({ type: "resolve-effect", optionId: "prisoner" });
    expect(hasKeyword(game.state, "p2", "prisoner", "Blocker")).toBe(true);

    expect(
      game
        .legalActions("p2")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "prisoner",
        ),
    ).toBe(false);
  });
});

describe("FAQ OP16-067 Tsuru", () => {
  it("OP16-067#1: finding no {Navy} card still trashes a card from hand", () => {
    const game = table("faq-op16-067-1")
      .withHand("p1", [
        instance("tsuru", "OP16-067"),
        instance("spare", "FIX-001"),
      ])
      .withDeckTop("p1", copies(5, "FIX-001", "looked"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-067" });
    settle(game, "skip", "done", "spare");

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toEqual(["spare"]);
  });
});

describe("FAQ OP16-073 Borsalino", () => {
  it("OP16-073#1: an already active Borsalino still gains [Blocker]", () => {
    const game = table("faq-op16-073-1")
      .withBoard("p1", [character("borsalino", "OP16-073")])
      .withDeckTop("p2", copies(3, "FIX-001", "p2-deck"))
      .build();
    game.pass();
    untilChoice(game);
    settle(game, "apply", "borsalino");

    expect(game.state.turnPlayerId).toBe("p2");
    expect(boardCard(game, "p1", "borsalino")?.rested).toBe(false);
    expect(hasKeyword(game.state, "p1", "borsalino", "Blocker")).toBe(true);
  });
});

describe("FAQ OP16-074 Magellan", () => {
  it("OP16-074#1: the opponent chooses which of their DON!! goes back", () => {
    // p2's DON!! split across active, rested and given to its Leader, so
    // which one returns is a real choice.
    const game = table("faq-op16-074-1")
      .withLeader("p1", "OP16-041")
      .withHand("p1", [instance("magellan", "OP16-074")])
      .withDon("p2", { rested: 3, leaderAttached: 2 })
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-074" });

    expect(game.state.pendingEffect).not.toBeNull();
    expect(game.player).toBe("p2");
    settle(game);
    const p2 = game.state.players.p2;
    expect(
      p2.activeDon.length + p2.restedDon.length + p2.leaderAttachedDon.length,
    ).toBe(9);
  });
});

describe('FAQ OP16-077 "Buddha" Sengoku', () => {
  const buddha = (seed: string, looked: CardInstance[]) => {
    const game = table(seed)
      .withHand("p1", [
        instance("buddha", "OP16-077"),
        instance("spare", "FIX-001"),
      ])
      .withDeckTop("p1", looked)
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP16-077" });
    return game;
  };

  it("OP16-077#1: adding one {Navy} card, or none, still trashes a card from hand", () => {
    const none = buddha("faq-op16-077-1-none", copies(5, "FIX-001", "looked"));
    settle(none, "done", "skip", "spare");
    expect(none.state.players.p1.hand).toHaveLength(0);
    expect(ids(none.state.players.p1.trash)).toContain("spare");

    // One OP16-064 Koby among the five.
    const one = buddha("faq-op16-077-1-one", [
      instance("koby", "OP16-064"),
      ...copies(4, "FIX-001", "looked"),
    ]);
    untilChoice(one);
    expect(effectOptions(one)).toContain("koby");
    one.play({ type: "resolve-effect", optionId: "koby" });
    settle(one, "done", "skip", "spare");
    expect(ids(one.state.players.p1.hand)).toEqual(["koby"]);
    expect(ids(one.state.players.p1.trash)).toContain("spare");
  });
});

const YAMATO = "OP16-079";

describe("FAQ OP16-079 Yamato", () => {
  it("OP16-079#1: a {Land of Wano} Character played from the trash keeps its [Rush] after being negated", () => {
    // OP16-098 Yamato trashes itself to play OP16-096 Yamato from the trash;
    // p2's OP16-115 Black Vortex [Trigger] then negates the new arrival.
    const game = table("faq-op16-079-1")
      .withLeader("p1", YAMATO)
      .withBoard("p1", [character("swapper", "OP16-098")])
      .withTrash("p1", [instance("y8", "OP16-096")])
      .withLife("p2", [
        instance("vortex", "OP16-115"),
        instance("p2-life", "FIX-001"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "swapper" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "y8" });
    settle(game);
    expect(ids(game.state.players.p1.board)).toEqual(["y8"]);
    expect(hasKeyword(game.state, "p1", "y8", "Rush")).toBe(true);

    attack(game, "p1-leader", "p2-leader");
    toTrigger(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    untilChoice(game);
    expect(effectOptions(game, "p2")).toContain("y8");
    game.play({ type: "resolve-effect", optionId: "y8" });
    settle(game);
    declineDefence(game);
    expect(game.state.activeAttack).toBeNull();
    expect(game.player).toBe("p1");

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "y8",
        ),
    ).toBe(true);
  });
});

describe("FAQ OP16-081 Otama", () => {
  it("OP16-081#1: an opposing Character at cost 8 or more is enough for the −2000", () => {
    // OP16-003 Newgate is the 8-cost on p2's side; p1 has none.
    const game = table("faq-op16-081-1")
      .withBoard("p1", [character("otama", "OP16-081")])
      .withBoard("p2", [character("big", "OP16-003")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "otama" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("big");
    game.play({ type: "resolve-effect", optionId: "big" });
    settle(game);

    expect(currentPower(game.state, "p2", "big")).toBe(8000);
  });

  it("OP16-081#1 (control): with an 8-cost Character of its own, the −2000 lands", () => {
    const game = table("faq-op16-081-1-control")
      .withBoard("p1", [
        character("otama", "OP16-081"),
        character("own-big", "OP16-003"),
      ])
      .withBoard("p2", [character("big", "OP16-003")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "otama" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "big" });
    settle(game);

    expect(currentPower(game.state, "p2", "big")).toBe(8000);
  });
});

describe("FAQ OP16-084 Kouzuki Momonosuke", () => {
  it("OP16-084#1: below cost 20 it neither trashes itself nor plays the 9-cost", () => {
    const game = table("faq-op16-084-1")
      .withBoard("p1", [character("momo", "OP16-084")])
      .withTrash("p1", [instance("momo9", "OP16-085")])
      .build();
    const offered = game
      .legalActions()
      .some(
        (action) =>
          action.type === "activate-main" && action.sourceInstanceId === "momo",
      );
    if (offered) {
      game.play({ type: "activate-main", sourceInstanceId: "momo" });
      settle(game, "apply", "momo9");
    }

    expect(ids(game.state.players.p1.board)).toEqual(["momo"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["momo9"]);
  });
});

describe("FAQ OP16-087 Shinobu", () => {
  it("OP16-087#1: with no [Kouzuki Momonosuke], Shinobu still trashes itself and draws", () => {
    const game = table("faq-op16-087-1")
      .withLeader("p1", YAMATO)
      .withHand("p1", [instance("shinobu", "OP16-087")])
      .withDeckTop("p1", copies(2, "FIX-001", "drawn"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-087" });
    settle(game, "apply");

    expect(ids(game.state.players.p1.trash)).toEqual(["shinobu"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn-1"]);
  });
});

describe("FAQ OP16-094 Portgas.D.Ace", () => {
  it("OP16-094#1: a Character without {Land of Wano} cannot be given the DON!!", () => {
    // OP16-093 Bartholomew Kuma is not {Land of Wano}; nor is the ST31 Leader.
    const game = table("faq-op16-094-1")
      .withBoard("p1", [
        character("ace", "OP16-094"),
        character("kuma", "OP16-093"),
      ])
      .withDon("p1", { rested: 2 })
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "ace" });
    expect(effectOptions(game)).not.toContain("kuma");
    settle(game, "ace");

    expect(boardCard(game, "p1", "kuma")?.attachedDon ?? []).toHaveLength(0);
  });
});

describe("FAQ OP16-097 Yamato", () => {
  it("OP16-097#1: taking nothing from the trash still offers the 2-cost play", () => {
    const game = table("faq-op16-097-1")
      .withHand("p1", [
        instance("yamato", "OP16-097"),
        instance("small", "FIX-002"),
      ])
      .withTrash("p1", [instance("wano", "OP16-094")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-097" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("wano");
    const decline = effectOptions(game).find((option) =>
      ["done", "skip"].includes(option),
    );
    expect(decline).toBeDefined();
    game.play({ type: "resolve-effect", optionId: decline! });

    untilChoice(game);
    expect(effectOptions(game)).toContain("small");
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);
    expect(ids(game.state.players.p1.board)).toContain("small");
    expect(ids(game.state.players.p1.trash)).toEqual(["wano"]);
  });
});

describe("FAQ OP16-098 Yamato", () => {
  it("OP16-098#1: only a cost-8 Yamato may be played, not a 6 or a 7", () => {
    // OP16-096 (8), another OP16-098 (6) and EB02-006 (7) in the trash.
    const game = table("faq-op16-098-1")
      .withBoard("p1", [character("swapper", "OP16-098")])
      .withTrash("p1", [
        instance("y8", "OP16-096"),
        instance("y6", "OP16-098"),
        instance("y7", "EB02-006"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "swapper" });
    untilChoice(game);

    expect(effectOptions(game)).toContain("y8");
    expect(effectOptions(game)).not.toContain("y6");
    expect(effectOptions(game)).not.toContain("y7");
  });
});

describe("FAQ OP16-100 Hallowed Glacier Slash", () => {
  it("OP16-100#1: an opposing Character K.O.'d by its own side's effect on your turn still counts", () => {
    // p1's OP09-018 Get Out of Here! aims at p2's FIX-001; p2's OP16-014 Marco
    // K.O.s itself instead, by p2's own effect.
    const game = table("faq-op16-100-1")
      .withLeader("p1", YAMATO)
      .withRestedLeader("p1")
      .withHand("p1", [
        instance("get-out", "OP09-018"),
        instance("glacier", "OP16-100"),
      ])
      .withBoard("p2", [
        character("marco", "OP16-014"),
        character("deckhand", "FIX-001"),
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "deckhand" });
    if (effectOptions(game).includes("done")) {
      game.play({ type: "resolve-effect", optionId: "done" });
    }
    expect(game.player).toBe("p2");
    expect(effectOptions(game, "p2")).toContain("replace:marco");
    game.play({ type: "resolve-effect", optionId: "replace:marco" });
    settle(game, "skip");
    expect(ids(game.state.players.p2.board)).toEqual(["deckhand"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["marco"]);
    expect(game.state.players.p1.leaderRested).toBe(true);

    game.play({ type: "activate-main", sourceCardNumber: "OP16-100" });
    settle(game, "apply");

    expect(game.state.players.p1.leaderRested).toBe(false);
  });
});

describe("FAQ OP16-101 Mahoroba", () => {
  it("OP16-101#1: nine in the trash plus Mahoroba itself makes ten, and the K.O. lands", () => {
    const game = table("faq-op16-101-1")
      .withHand("p1", [instance("mahoroba", "OP16-101")])
      .withTrash("p1", copies(9, "FIX-001", "trashed"))
      .withBoard("p2", [character("target", "FIX-002")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP16-101" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("target");
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p1.trash).toHaveLength(10);
    expect(ids(game.state.players.p2.trash)).toEqual(["target"]);
  });
});

describe("FAQ OP16-014 Marco", () => {
  it("OP16-014#2: when Marco and another Character are removed together, K.O.ing Marco alone is allowed", () => {
    // p2's OP16-065 Sakazuki takes Marco to 2000, so p2's OP09-018 Get Out of
    // Here! can K.O. Marco and FIX-001 together (4000 total).
    const game = table("faq-op16-014-2", "p2")
      .withBoard("p1", [
        character("marco", "OP16-014"),
        character("deckhand", "FIX-001"),
      ])
      .withHand("p2", [
        instance("sakazuki", "OP16-065"),
        instance("get-out", "OP09-018"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-065" });
    settle(game, "apply", "return-don:rested", "marco");
    expect(currentPower(game.state, "p1", "marco")).toBe(2000);

    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "marco" });
    game.play({ type: "resolve-effect", optionId: "deckhand" });
    if (game.player === "p2" && effectOptions(game).includes("done")) {
      game.play({ type: "resolve-effect", optionId: "done" });
    }

    expect(game.player).toBe("p1");
    expect(effectOptions(game, "p1")).toContain("replace:marco");
    game.play({ type: "resolve-effect", optionId: "replace:marco" });
    settle(game, "skip");

    expect(ids(game.state.players.p1.board)).toEqual(["deckhand"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["marco"]);
  });
});

describe("FAQ OP16-080 Marshall.D.Teach", () => {
  it("OP16-080#1: a Zoro Leader whose attack was moved onto this Leader cannot set itself active", () => {
    // p2 leads OP12-020 Roronoa Zoro with three DON!! given. p1 pays with
    // OP16-115 Black Vortex, a card with a [Trigger].
    const game = table("faq-op16-080-1", "p2")
      .withLeader("p1", "OP16-080")
      .withBoard("p1", [character("victim", "FIX-001", { rested: true })])
      .withHand("p1", [instance("trigger-card", "OP16-115")])
      .withLife("p1", copies(2, "FIX-001", "life"))
      .withLeader("p2", "OP12-020")
      .withDon("p2", { leaderAttached: 3 })
      .build();
    attack(game, "p2-leader", "victim");
    expect(game.player).toBe("p1");
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "trigger-card" });
    untilChoice(game);
    expect(effectOptions(game, "p1")).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);
    expect(game.state.activeAttack?.targetInstanceId).toBe("p1-leader");
    declineDefence(game);
    settle(game);
    expect(game.state.activeAttack).toBeNull();
    expect(game.player).toBe("p2");
    expect(game.state.players.p2.leaderRested).toBe(true);

    const offered = game
      .legalActions("p2")
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "p2-leader",
      );
    if (offered) {
      game.play({ type: "activate-main", sourceInstanceId: "p2-leader" });
      settle(game, "apply");
    }
    expect(game.state.players.p2.leaderRested).toBe(true);
  });
});

describe("FAQ OP16-103 Van Augur", () => {
  it("OP16-103#1: its [Trigger] on your own turn does not run the [On K.O.]", () => {
    // p1 K.O.s p2's EB03-055 Nico Robin, whose [Opponent's Turn] [On K.O.]
    // deals p1 a damage on p1's own turn, revealing Van Augur.
    const game = table("faq-op16-103-1")
      .withLeader("p1", "OP16-080")
      .withBoard("p1", [character("attacker", "OP16-035")])
      .withLife("p1", [
        instance("augur", "OP16-103"),
        instance("life", "FIX-001"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withBoard("p2", [
        character("robin", "EB03-055", { rested: true }),
        character("target", "FIX-001"),
      ])
      .build();
    attack(game, "attacker", "robin");
    declineDefence(game);
    expect(ids(game.state.players.p2.trash)).toContain("robin");
    settle(game, "apply");
    expect(game.state.pendingTrigger).not.toBeNull();
    expect(game.player).toBe("p1");
    // The engine withholds a Trigger activation that would resolve nothing,
    // so the inert activation may not be on offer at all; if it is, it draws
    // nothing and the card is trashed.
    const activate = game
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "activate",
      );
    if (activate) {
      game.play({ type: "resolve-trigger", optionId: "activate" });
      settle(game, "target");
      expect(ids(game.state.players.p1.hand)).toEqual([]);
      expect(ids(game.state.players.p1.trash)).toContain("augur");
    }
    expect(currentPower(game.state, "p2", "target")).toBe(2000);
    expect(ids(game.state.players.p1.deck).slice(0, 2)).toEqual([
      "p1-deck-1",
      "p1-deck-2",
    ]);
  });
});

/** p2's 9000-power Zoro attacks p1's Leader and passes to the Life Trigger. */
function lifeTrigger(
  seed: string,
  life: CardInstance[],
  hand: CardInstance[] = [],
): Game {
  const game = table(seed, "p2")
    .withLeader("p1", "OP16-080")
    .withLife("p1", life)
    .withHand("p1", hand)
    .withBoard("p2", [character("attacker", "OP16-035")])
    .build();
  attack(game, "attacker", "p1-leader");
  toTrigger(game);
  return game;
}

describe("FAQ OP16-107 Jesus Burgess", () => {
  it("OP16-107#1: with an empty hand its [Trigger] cannot play it", () => {
    const game = lifeTrigger("faq-op16-107-1", [
      instance("burgess", "OP16-107"),
      instance("life", "FIX-001"),
    ]);
    const canActivate = game
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "activate",
      );
    if (canActivate) {
      game.play({ type: "resolve-trigger", optionId: "activate" });
      settle(game, "apply");
    }

    expect(ids(game.state.players.p1.board)).not.toContain("burgess");
  });
});

describe("FAQ OP16-111 Boa Sandersonia", () => {
  it("OP16-111#1: on three Life including itself, its [Trigger] plays it", () => {
    const game = lifeTrigger("faq-op16-111-1", [
      instance("sandersonia", "OP16-111"),
      ...copies(2, "FIX-001", "life"),
    ]);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["sandersonia"]);
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("FAQ OP16-115 Black Vortex", () => {
  it("OP16-115#1: OP09-097 Black Vortex is not a card it can recover", () => {
    const game = table("faq-op16-115-1")
      .withLeader("p1", "OP16-080")
      .withHand("p1", [instance("vortex", "OP16-115")])
      .withTrash("p1", [
        instance("old-vortex", "OP09-097"),
        instance("augur", "OP16-103"),
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP16-115" });
    untilChoice(game);

    expect(effectOptions(game)).toContain("augur");
    expect(effectOptions(game)).not.toContain("old-vortex");
  });
});

describe("FAQ OP16-116 Zehahahahaha!", () => {
  it("OP16-116#1: with the opponent on 0 Life, Teach is still played", () => {
    const game = table("faq-op16-116-1")
      .withHand("p1", [
        instance("zehaha", "OP16-116"),
        instance("teach", "OP16-119"),
      ])
      .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
      .build();
    expect(game.state.players.p2.life).toHaveLength(0);
    game.play({ type: "activate-main", sourceCardNumber: "OP16-116" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("teach");
    game.play({ type: "resolve-effect", optionId: "teach" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["teach"]);
  });
});

describe("FAQ OP16-118 Portgas.D.Ace", () => {
  /** p2's 9000 Zoro attacks p1's Leader; p1 holds OP16-005 Thatch (8000, Counter +1000). */
  const counterOffers = (seed: string, aces: number) => {
    const game = table(seed, "p2")
      .withBoard(
        "p1",
        copies(aces, "OP16-118", "ace").map((card) =>
          character(card.instanceId, card.cardNumber),
        ),
      )
      .withHand("p1", [instance("thatch", "OP16-005")])
      .withLife("p1", copies(2, "FIX-001", "life"))
      .withBoard("p2", [character("attacker", "OP16-035")])
      .build();
    attack(game, "attacker", "p1-leader");
    toCounterStep(game);
    return game
      .legalActions("p1")
      .flatMap((action) =>
        action.type === "counter" && action.cardInstanceId === "thatch"
          ? [action.counterPower]
          : [],
      );
  };

  it("OP16-118#1: the 8000-power card's Counter is +2000, with no +1000 on offer", () => {
    const powers = counterOffers("faq-op16-118-1", 1);
    expect(powers.length).toBeGreaterThan(0);
    expect(new Set(powers)).toEqual(new Set([2000]));
  });

  it("OP16-118#2: two Aces do not stack it to +4000", () => {
    const powers = counterOffers("faq-op16-118-2", 2);
    expect(powers.length).toBeGreaterThan(0);
    expect(new Set(powers)).toEqual(new Set([2000]));
  });
});

describe("FAQ OP16-119 Marshall.D.Teach", () => {
  it("OP16-119#1: the card added to Life is not shown to the opponent", () => {
    const game = table("faq-op16-119-1")
      .withHand("p1", [instance("teach", "OP16-119")])
      .withDeckTop("p1", [
        instance("secret", "OP16-114"),
        ...copies(2, "FIX-001", "looked"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-119" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("secret");
    game.play({ type: "resolve-effect", optionId: "secret" });
    settle(game);

    expect(ids(game.state.players.p1.life)).toEqual(["secret"]);
    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    const seen = observe(game.state, "p2");
    expect(seen.opponent.life).toEqual([{ faceUp: false }]);
    expect(JSON.stringify(seen.publicEvents)).not.toContain("OP16-114");
  });
});
