import { describe, expect, it } from "vitest";
import { currentPower } from "@one-piece-sim/engine-core";

import { character, instance, scenario, type Game } from "./support/index.js";

/**
 * Bandai's official Q&A for the ST-29 and ST-30 starter decks, one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order the PDF prints them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. A ruling the engine disagrees with is an `it.fails`
 * that says what the engine does instead.
 *
 * Source PDFs: https://en.onepiece-cardgame.com/pdf/qa_st-29.pdf and
 * https://en.onepiece-cardgame.com/pdf/qa_st-30.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 * Empty while every ST-29/ST-30 ruling has one.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";
const DOFFY = "(Purple) Donquixote Doflamingo - Official Feature Deck";

/** p1 acting in its own Main Phase, with ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(ST31, ST32).seed(seed).atTurn(11, { active: "p1" });

/** p2 acting, for the clauses that only open on the opponent's turn. */
const defending = (seed: string) =>
  scenario().decks(ST31, ST32).seed(seed).atTurn(12, { active: "p2" });

/** p1 attacking into OP14-060 Donquixote Doflamingo's redirect. */
const intoDoflamingo = (seed: string) =>
  scenario()
    .decks(ST31, DOFFY)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p2", "OP14-060");

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function settle(game: Game): void {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

const applyOptional = (game: Game) => {
  if (effectOptions(game).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

const handIds = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].hand.map((card) => card.instanceId);

const canAttackWith = (game: Game, attackerInstanceId: string) =>
  game
    .legalActions("p1")
    .some(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === attackerInstanceId,
    );

/** Takes OP14-060's redirect for p2 and points the attack at `target`. */
const doflamingoRedirects = (game: Game, target: string) => {
  game.play({ type: "resolve-effect", optionId: "apply" });
  if (effectOptions(game).includes("return-don:active")) {
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
  }
  game.play({ type: "resolve-effect", optionId: target });
  settle(game);
};

/** A 5000-power Character with no text: under every "6000" in ST-30. */
const FIVE_THOUSAND = "OP05-012";
/** A 6000-power Character with no text: one of ST-30's own wall. */
const SIX_THOUSAND = "ST30-005";

describe("FAQ ST-29", () => {
  it("ST29-007#1: at 0 Life the [On K.O.] cannot bank a hand card without paying a Life card first", () => {
    const game = table("faq-st29-007-1")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("chopper", "ST29-007")])
      .withHand("p2", [instance("spare", "FIX-001")])
      .withLife("p2", [])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "chopper" });
    expect(effectOptions(game, "p2")).not.toContain("spare");
    settle(game);

    expect(boardCard(game, "p2", "chopper")).toBeUndefined();
    expect(game.state.players.p2.life).toHaveLength(0);
    expect(handIds(game, "p2")).toEqual(["spare"]);
  });

  it("ST29-008#1: with the top Life card already face-up, Nami cannot replace the K.O.", () => {
    // Only the top card is the payment, so a face-down card under a face-up
    // one does not open the replacement.
    const game = table("faq-st29-008-1")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [
        character("nami", "ST29-008"),
        character("victim", "ST29-010"),
      ])
      .withLife("p2", [
        { ...instance("shown", "FIX-001"), faceUp: true },
        instance("hidden", "FIX-001"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(effectOptions(game, "p2")).not.toContain("replace:nami");
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
    expect(
      game.state.players.p2.life.map((card) => Boolean(card.faceUp)),
    ).toEqual([true, false]);
  });

  it("ST29-013#1: Rob Lucci's [Trigger] counts both Life totals without itself", () => {
    // p1 on 3 and p2 on 2 including Lucci: the ceiling is 3 + 1 = 4.
    const game = table("faq-st29-013-1")
      .withLife("p1", 3)
      .withLife("p2", [
        instance("lucci", "ST29-013"),
        instance("under", "FIX-001"),
      ])
      .withBoard("p1", [
        character("four", "ST29-003"),
        character("five", "OP09-031"),
      ])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });

    expect(effectOptions(game, "p2")).toContain("four");
    expect(effectOptions(game, "p2")).not.toContain("five");
  });

  it("ST29-014#1: [Rush: Character] reaches only rested Characters on the turn it lands", () => {
    // Pinned also by test/st29.test.ts "attacks a Character the turn it lands".
    const game = table("faq-st29-014-1")
      .withHand("p1", [instance("zoro", "ST29-014")])
      .withBoard("p2", [
        character("awake", "FIX-002"),
        { ...character("down", "FIX-002"), rested: true },
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST29-014" });
    settle(game);

    const zoro = game.state.players.p1.board.at(-1)!;
    const targets = game
      .legalActions("p1")
      .flatMap((action) =>
        action.type === "attack" &&
        action.attackerInstanceId === zoro.instanceId
          ? [action.targetInstanceId]
          : [],
      );
    expect(targets).toEqual(["down"]);
  });

  it("ST29-014#2: OP14-060 can move a [Rush: Character] attack onto its Leader", () => {
    const game = intoDoflamingo("faq-st29-014-2")
      .withHand("p1", [instance("zoro", "ST29-014")])
      .withBoard("p2", [{ ...character("down", "FIX-002"), rested: true }])
      .build();

    game.play({ type: "play-card", cardNumber: "ST29-014" });
    settle(game);
    const zoro = game.state.players.p1.board.at(-1)!;
    game.play({
      type: "attack",
      attackerInstanceId: zoro.instanceId,
      targetInstanceId: "down",
    });
    doflamingoRedirects(game, "p2-leader");

    expect(game.state.activeAttack?.targetInstanceId).toBe("p2-leader");
  });

  describe("ST29-016 Kizaru!!", () => {
    /** p1's Luffy Leader made [Unblockable] by ST29-016, swinging at `down`. */
    const unblockableSwing = (game: Game) => {
      game.play({ type: "activate-main", sourceCardNumber: "ST29-016" });
      settle(game);
      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "down",
      });
    };

    it("ST29-016#1: OP14-060 can move an [Unblockable] attack onto its Leader", () => {
      const game = intoDoflamingo("faq-st29-016-1")
        .withLeader("p1", "ST29-001")
        .withHand("p1", [instance("kizaru", "ST29-016")])
        .withBoard("p2", [{ ...character("down", "FIX-002"), rested: true }])
        .build();

      unblockableSwing(game);
      doflamingoRedirects(game, "p2-leader");

      expect(game.state.activeAttack?.targetInstanceId).toBe("p2-leader");
    });

    it("ST29-016#2: OP14-060 can move an [Unblockable] attack onto a [Blocker] Character", () => {
      const game = intoDoflamingo("faq-st29-016-2-doffy")
        .withLeader("p1", "ST29-001")
        .withHand("p1", [instance("kizaru", "ST29-016")])
        .withBoard("p2", [
          { ...character("down", "FIX-002"), rested: true },
          character("kuween", "OP05-024"),
        ])
        .build();

      unblockableSwing(game);
      doflamingoRedirects(game, "kuween");

      expect(game.state.activeAttack?.targetInstanceId).toBe("kuween");
      // A redirect is not a block: the new target stays active.
      expect(boardCard(game, "p2", "kuween")?.rested).toBe(false);
    });

    it("ST29-016#2: EB01-038 can move an [Unblockable] attack onto a [Blocker] Character", () => {
      const game = intoDoflamingo("faq-st29-016-2-eb01")
        .withLeader("p1", "ST29-001")
        .withLeader("p2", "OP14-079")
        .withHand("p1", [instance("kizaru", "ST29-016")])
        .withHand("p2", [instance("event", "EB01-038")])
        .withBoard("p2", [
          { ...character("down", "FIX-002"), rested: true },
          character("kuween", "OP05-024"),
        ])
        .build();

      unblockableSwing(game);
      // [Unblockable]: kuween is never offered as a blocker.
      expect(
        game.legalActions("p2").some((action) => action.type === "block"),
      ).toBe(false);
      while (game.state.phase === "block") game.pass();
      game.play({ type: "activate-counter-event", cardNumber: "EB01-038" });
      game.play({ type: "resolve-effect", optionId: "return-don:active" });
      game.play({ type: "resolve-effect", optionId: "kuween" });
      settle(game);

      expect(game.state.activeAttack?.targetInstanceId).toBe("kuween");
    });
  });
});

describe("FAQ ST-30", () => {
  it("ST30-001#1: Luffy & Ace takes no −2000 with no Characters at all", () => {
    const leader = (seed: string) =>
      table(seed).bareTable().withLeader("p1", "ST30-001");
    const empty = leader("faq-st30-001-1").build();
    expect(currentPower(empty.state, "p1", "p1-leader")).toBe(6_000);

    // The penalty is real once a 7000 base body is on the board.
    const heavy = leader("faq-st30-001-1-heavy")
      .withBoard("p1", [character("stussy", "ST29-006")])
      .build();
    expect(currentPower(heavy.state, "p1", "p1-leader")).toBe(4_000);
  });

  it("ST30-001#2: Luffy & Ace's [Opponent's Turn] buff does not reach the Leader itself", () => {
    const game = defending("faq-st30-001-2")
      .bareTable()
      .withLeader("p1", "ST30-001")
      .withBoard("p1", [character("ace", "ST30-007")])
      .build();

    expect(currentPower(game.state, "p1", "ace")).toBe(9_000);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
  });

  it("ST30-002#1: Inazuma's search takes exactly 6000, not a 5000", () => {
    const game = table("faq-st30-002-1")
      .withHand("p1", [instance("inazuma", "ST30-002")])
      .withDeckTop("p1", [
        instance("five", FIVE_THOUSAND),
        instance("six", SIX_THOUSAND),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-002" });

    expect(effectOptions(game)).toContain("six");
    expect(effectOptions(game)).not.toContain("five");
  });

  it("ST30-003#1: Edward.Newgate buffs exactly 6000 base power, not a 5000", () => {
    // A 5000 given a DON!! is 6000 on its controller's turn but still a 5000
    // base body, so it stays outside the aura.
    const game = table("faq-st30-003-1")
      .bareTable()
      .withBoard("p1", [
        character("newgate", "ST30-003"),
        character("six", SIX_THOUSAND),
        character("five", FIVE_THOUSAND),
        character("lifted", FIVE_THOUSAND),
      ])
      .withGivenDon("p1", "lifted", 1)
      .build();

    expect(currentPower(game.state, "p1", "six")).toBe(7_000);
    expect(currentPower(game.state, "p1", "five")).toBe(5_000);
    expect(currentPower(game.state, "p1", "lifted")).toBe(6_000);
  });

  it("ST30-004#1: Emporio.Ivankov reveals only cards of exactly 6000", () => {
    const game = table("faq-st30-004-1")
      .withHand("p1", [
        instance("ivankov", "ST30-004"),
        instance("six", SIX_THOUSAND),
        instance("five", FIVE_THOUSAND),
      ])
      .build();

    // One 6000 and one 5000 cannot pay a cost of two 6000s.
    game.play({ type: "play-card", cardNumber: "ST30-004" });
    applyOptional(game);
    expect(effectOptions(game)).not.toContain("five");
    settle(game);

    expect(handIds(game, "p1").sort()).toEqual(["five", "six"]);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("ST30-006#1: Jinbe's cost takes exactly 6000, not a 5000", () => {
    const game = table("faq-st30-006-1")
      .withHand("p1", [
        instance("jinbe", "ST30-006"),
        instance("five", FIVE_THOUSAND),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST30-006" });
    applyOptional(game);
    expect(effectOptions(game)).not.toContain("five");
    settle(game);

    expect(handIds(game, "p1")).toEqual(["five"]);
  });

  describe("paying the whole active pool for a [Rush] body", () => {
    /** Exactly four active DON!!, all spent playing the 4-cost body. */
    const fourDon = (seed: string, cardNumber: string) =>
      table(seed)
        .bareTable()
        .withDonDeck("p1", 6)
        .withHand("p1", [instance("body", cardNumber)])
        .build();

    for (const [id, cardNumber] of [
      ["ST30-007#1", "ST30-007"],
      ["ST30-012#1", "ST30-012"],
    ] as const) {
      it(`${id}: no active DON!! left after paying, so no [Rush]`, () => {
        const game = fourDon(`faq-${id}`, cardNumber);

        game.play({ type: "play-card", cardNumber });
        expect(game.state.players.p1.activeDon).toHaveLength(0);
        expect(effectOptions(game)).not.toContain("apply");
        settle(game);

        expect(canAttackWith(game, "body")).toBe(false);
      });
    }
  });

  it("ST30-008#1: Marco's [On K.O.] cost takes exactly 6000, not a 5000", () => {
    const game = table("faq-st30-008-1")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("marco", "ST30-008")])
      .withHand("p2", [instance("five", FIVE_THOUSAND)])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "marco" });
    expect(effectOptions(game, "p2")).not.toContain("five");
    settle(game);

    expect(boardCard(game, "p2", "marco")).toBeUndefined();
    expect(handIds(game, "p2")).toEqual(["five"]);
  });

  for (const [id, cardNumber, protector] of [
    ["ST30-009#1", "ST30-009", "oars"],
    ["ST30-011#1", "ST30-011", "buggy"],
  ] as const) {
    it(`${id}: the replacement protects exactly 6000 base power, not a 5000`, () => {
      // test/st30.test.ts pins the same for a 4000 body.
      const game = table(`faq-${id}`)
        .withHand("p1", [instance("gatling", "ST10-016")])
        .withBoard("p2", [
          character(protector, cardNumber),
          character("five", FIVE_THOUSAND),
        ])
        .build();

      game.play({ type: "activate-main", cardNumber: "ST10-016" });
      game.play({ type: "resolve-effect", optionId: "five" });
      expect(effectOptions(game, "p2")).not.toContain(`replace:${protector}`);
      settle(game);

      expect(boardCard(game, "p2", "five")).toBeUndefined();
      expect(boardCard(game, "p2", protector)?.rested).toBe(false);
    });
  }

  it("ST30-014#1: Mr.3 gives DON!! only to Characters of exactly 6000 base power", () => {
    const game = table("faq-st30-014-1")
      .bareTable()
      .withDon("p1", { rested: 4 })
      .withBoard("p1", [
        character("mr3", "ST30-014"),
        character("six", SIX_THOUSAND),
        character("five", FIVE_THOUSAND),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "ST30-014" });
    applyOptional(game);

    expect(effectOptions(game)).toContain("six");
    expect(effectOptions(game)).not.toContain("five");
  });

  it("ST30-015#1: the [Counter] needs two Characters of exactly 6000 base power", () => {
    const game = defending("faq-st30-015-1")
      .withBoard("p1", [
        character("six", SIX_THOUSAND),
        character("five", FIVE_THOUSAND),
      ])
      .withHand("p1", [instance("era", "ST30-015")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-counter-event" &&
            action.sourceCardNumber === "ST30-015",
        ),
    ).toBe(false);
  });

  it("ST30-016#1: +3000 regardless, but the draw needs both names at exactly 6000 base", () => {
    // ST29-012 is a [Monkey.D.Luffy] Character printed below 6000.
    const game = defending("faq-st30-016-1")
      .withBoard("p1", [
        character("ace", "ST30-007"),
        character("small-luffy", "ST29-012"),
      ])
      .withHand("p1", [instance("fight", "ST30-016")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST30-016" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });

  it("ST30-017#1: the [Main] search takes exactly 6000, not a 5000", () => {
    const game = table("faq-st30-017-1")
      .withHand("p1", [instance("trouble", "ST30-017")])
      .withDeckTop("p1", [
        instance("five", FIVE_THOUSAND),
        instance("six", SIX_THOUSAND),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "ST30-017" });

    expect(effectOptions(game)).toContain("six");
    expect(effectOptions(game)).not.toContain("five");
  });
});
