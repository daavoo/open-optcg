import { describe, expect, it } from "vitest";
import { currentPower } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-11 "A Fist of Divine Speed", one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order the PDF prints them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. Comments paraphrase the rulings and the cards: the
 * repository holds none of Bandai's text. A ruling the engine disagrees with is
 * an `it.fails` that says what the engine does instead, so it flips the day the
 * engine is fixed.
 *
 * Where a question names a card the engine does not register (OP01-094 Kaido,
 * OP01-051 Eustass"Captain"Kid, OP01-026 Gum-Gum Fire-Fist Pistol Red Hawk),
 * the case stands a registered card with the same shape in for it and says so.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op11.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 in its own Main Phase, both sides bare, every DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2's Main Phase, for the clauses that answer the opponent's turn. */
const defending = (seed: string) =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Answers every open prompt with the first of `preferred` offered, else the first offer. */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("the effect never settled");
    const options = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect");
    const wanted =
      preferred
        .map((id) => options.find((action) => action.optionId === id))
        .find(Boolean) ?? options[0]!;
    game.submit(wanted);
  }
}

/** Collects every option offered while `answer` settles the open effect. */
function answerAll(game: Game, ...preferred: string[]): string[] {
  const seen: string[] = [];
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("the effect never settled");
    seen.push(...effectOptions(game));
    const options = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect");
    const wanted =
      preferred
        .map((id) => options.find((action) => action.optionId === id))
        .find(Boolean) ?? options[0]!;
    game.submit(wanted);
  }
  return seen;
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

/** Declines the Block and Counter steps, so a declared attack resolves. */
function undefended(game: Game): void {
  let guard = 0;
  while (
    game.state.activeAttack &&
    !game.state.pendingEffect &&
    (game.state.phase === "block" || game.state.phase === "counter")
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

function attack(game: Game, attacker: string, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
}

/** The targets `attacker` may declare an attack on right now. */
const attackTargets = (game: Game, attacker: string): string[] =>
  game
    .legalActions()
    .flatMap((action) =>
      action.type === "attack" && action.attackerInstanceId === attacker
        ? [action.targetInstanceId]
        : [],
    );

const blockers = (game: Game): string[] =>
  game
    .legalActions()
    .flatMap((action) =>
      action.type === "block" ? [action.blockerInstanceId] : [],
    );

const onBoard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

describe("FAQ OP11-001 Koby (Leader)", () => {
  /**
   * p2 plays OP09-018 Get Out of Here! at two of p1's 2000-power {Navy}
   * Prince Grus at once -- one effect removing two Characters together, the
   * shape the question puts to OP01-094 Kaido.
   */
  const twoAtOnce = (seed: string, trashed: number) => {
    const game = defending(seed)
      .withLeader("p1", "OP11-001")
      .withBoard("p1", [
        character("grus-a", "OP11-013"),
        character("grus-b", "OP11-013"),
      ])
      .withTrash("p1", copies(trashed, "ST31-002", "trashed"))
      .withHand("p2", [instance("get-out", "OP09-018")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "grus-a" });
    game.play({ type: "resolve-effect", optionId: "grus-b" });
    if (effectOptions(game, "p2").includes("done")) {
      game.play({ type: "resolve-effect", optionId: "done" });
    }
    return game;
  };

  it("OP11-001#1: one replacement saves both Characters an effect removes together, for 3 trash cards", () => {
    const game = twoAtOnce("faq-op11-001-1", 4);

    expect(effectOptions(game)).toContain("replace:p1-leader");
    answer(game, "replace:p1-leader");

    expect(ids(game.state.players.p1.board)).toEqual(["grus-a", "grus-b"]);
    expect(game.state.players.p1.trash).toHaveLength(1);
  });

  it("OP11-001#2: with 2 cards in the trash the replacement is not offered", () => {
    const game = defending("faq-op11-001-2")
      .withLeader("p1", "OP11-001")
      .withBoard("p1", [character("grus", "OP11-013")])
      .withTrash("p1", copies(2, "ST31-002", "trashed"))
      .withHand("p2", [instance("get-out", "OP09-018")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "grus" });

    const seen = answerAll(game, "replace:p1-leader");

    expect(seen).not.toContain("replace:p1-leader");
    expect(game.state.players.p1.board).toEqual([]);
    expect(game.state.players.p1.trash).toHaveLength(3);
  });

  it("OP11-001#3: the first Character of a simultaneous K.O. does not fill the trash for the second", () => {
    // Two cards in the trash: K.O.ing Grus A would make three, but both are
    // K.O.'d by the same effect, so the replacement is never payable.
    const game = twoAtOnce("faq-op11-001-3", 2);

    const seen = answerAll(game, "replace:p1-leader");

    expect(seen).not.toContain("replace:p1-leader");
    expect(game.state.players.p1.board).toEqual([]);
    expect(game.state.players.p1.trash).toHaveLength(4);
  });
});

describe("FAQ OP11-010 Hibari", () => {
  it("OP11-010#1: a Leader allowed to attack active Characters still answers a taunt", () => {
    // OP17-044 Captain John stands in for OP01-051 Eustass"Captain"Kid: a
    // rested Character that, behind its own Leader, lets the opponent attack
    // nothing but itself. Two copies, so one is still there after Hibari's
    // own attack K.O.s the other.
    const game = table("faq-op11-010-1")
      .withLeader("p1", "OP11-001")
      .withBoard("p1", [character("hibari", "OP11-010")])
      .withLeader("p2", "OP17-039")
      .withBoard("p2", [
        character("john-a", "OP17-044", { rested: true }),
        character("john-b", "OP17-044", { rested: true }),
        character("active", "ST32-004"),
      ])
      .build();

    attack(game, "hibari", "john-a");
    answer(game, "p1-leader");
    undefended(game);
    answer(game);

    expect(game.state.players.p1.leaderAttacksActiveUntilTurn).toBe(
      game.state.turn,
    );
    expect(attackTargets(game, "p1-leader")).toEqual(["john-b"]);
  });
});

describe("FAQ OP11-012 Franky", () => {
  /** p1's Franky beside a 2000-power Prince Grus, p1 to swing at p2's Leader. */
  const frankyTable = (seed: string) =>
    table(seed)
      .withBoard("p1", [
        character("franky", "OP11-012"),
        character("grus", "OP11-013"),
      ])
      .withLife("p2", [instance("p2-life-1", "ST32-004")]);

  it("OP11-012#1: an Event's [Trigger] is not an Event activation", () => {
    // EB02-030's [Trigger] draws a card and touches nothing else.
    const game = frankyTable("faq-op11-012-1")
      .withLife("p2", [
        instance("trigger", "EB02-030"),
        instance("p2-life-2", "ST32-004"),
      ])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    attack(game, "p1-leader", "p2-leader");
    undefended(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game);

    expect(currentPower(game.state, "p1", "franky")).toBe(4000);
    expect(currentPower(game.state, "p1", "grus")).toBe(2000);
  });

  it("OP11-012#2: the Event's effect resolves before Franky's +2000", () => {
    // ST10-015 Gum-Gum Giant Sumo Slap stands in for OP01-026: a [Counter] whose
    // K.O. reads current power. It K.O.s a 2000-power Character, which Franky's
    // +2000 would have lifted out of reach had it resolved first.
    const game = frankyTable("faq-op11-012-2")
      .withHand("p2", [instance("slap", "ST10-015")])
      .build();

    attack(game, "p1-leader", "p2-leader");
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST10-015" });
    answer(game, "p2-leader", "grus");

    expect(onBoard(game, "p1", "grus")).toBeUndefined();
  });

  it("OP11-012#3: a Franky the Event K.O.s does not give the +2000", () => {
    // EB01-010 stands in for OP01-026: its [Counter] K.O.s a Character of
    // 6000 base power or less, Franky included.
    const game = frankyTable("faq-op11-012-3")
      .withHand("p2", [instance("no-way", "EB01-010")])
      .build();

    attack(game, "p1-leader", "p2-leader");
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-010" });
    answer(game, "franky");

    expect(onBoard(game, "p1", "franky")).toBeUndefined();
    expect(currentPower(game.state, "p1", "grus")).toBe(2000);
  });
});

describe("FAQ OP11-013 Prince Grus", () => {
  it("OP11-013#1: a Character the opponent plays after the [When Attacking] can block", () => {
    // OP14-106 Salome, a 1000-power [Blocker], comes out of p2's Life on its
    // own [Trigger] after Grus's clause has resolved.
    const game = table("faq-op11-013-1")
      .withBoard("p1", [character("grus", "OP11-013")])
      .withGivenDon("p1", "grus", 3)
      .withLife("p2", [
        instance("salome", "OP14-106"),
        instance("p2-life-2", "ST32-004"),
      ])
      .build();

    attack(game, "grus", "p2-leader");
    answer(game);
    undefended(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game);
    expect(onBoard(game, "p2", "salome")).toBeDefined();

    attack(game, "p1-leader", "p2-leader");
    expect(blockers(game)).toContain("salome");
  });

  it("OP11-013#2: a Character above 2000 when the clause resolved keeps [Blocker] after a debuff", () => {
    // p2's OP11-014 Borsalino is a 3000-power [Blocker]; Hibari's [On Play]
    // takes it to 1000 after Grus has attacked.
    const game = table("faq-op11-013-2")
      .withBoard("p1", [character("grus", "OP11-013")])
      .withHand("p1", [instance("hibari", "OP11-010")])
      .withBoard("p2", [character("borsalino", "OP11-014")])
      .withLife("p2", [
        instance("p2-life-1", "ST32-004"),
        instance("p2-life-2", "ST32-004"),
      ])
      .build();

    attack(game, "grus", "p2-leader");
    answer(game);
    undefended(game);
    answer(game);
    game.play({ type: "play-card", cardNumber: "OP11-010" });
    answer(game, "borsalino");
    expect(currentPower(game.state, "p2", "borsalino")).toBe(1000);

    attack(game, "p1-leader", "p2-leader");
    expect(blockers(game)).toContain("borsalino");
  });

  it("OP11-013#3: a Character at 2000 when the clause resolved stays unable to block after a buff", () => {
    // p2's OP05-013 Bunny Joe is a 2000-power [Blocker]; OP11-019 Glorp Web!!'s
    // [Trigger] lifts it to 3000 after Grus's clause has resolved.
    const game = table("faq-op11-013-3")
      .withBoard("p1", [character("grus", "OP11-013")])
      .withGivenDon("p1", "grus", 3)
      .withBoard("p2", [character("joe", "OP05-013")])
      .withLife("p2", [
        instance("glorp", "OP11-019"),
        instance("p2-life-2", "ST32-004"),
      ])
      .build();

    attack(game, "grus", "p2-leader");
    answer(game);
    undefended(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game, "joe");
    expect(currentPower(game.state, "p2", "joe")).toBe(3000);

    attack(game, "p1-leader", "p2-leader");
    expect(blockers(game)).not.toContain("joe");
  });
});

/**
 * The four "can also attack active Characters" grants, aimed at a Character
 * played this turn: the grant lands, but a Character cannot declare an attack
 * the turn it is played, so it attacks nothing.
 */
describe("FAQ: attack-active grants on a Character played this turn", () => {
  /** p1 behind the {Navy} Koby Leader, a rested and an active target across the table. */
  const navyTable = (seed: string) =>
    table(seed)
      .withLeader("p1", "OP11-001")
      .withBoard("p2", [
        character("rested", "ST32-004", { rested: true }),
        character("active", "ST32-004"),
      ]);

  const granted = (game: Game, id: string): boolean =>
    (onBoard(game, "p1", id)?.attacksActiveUntilTurn ?? -1) >= game.state.turn;

  it("OP11-014#1: Borsalino's grant gives a just-played Character no attack", () => {
    // OP11-096 Ripper is {Navy} without {SWORD}, so the Leader's own
    // played-this-turn permission does not reach it.
    const game = navyTable("faq-op11-014-1")
      .withBoard("p1", [character("borsalino", "OP11-014")])
      .withHand("p1", [instance("ripper", "OP11-096")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-096" });
    answer(game);
    game.play({ type: "activate-main", sourceInstanceId: "borsalino" });
    answer(game, "apply", "ripper");

    expect(granted(game, "ripper")).toBe(true);
    expect(attackTargets(game, "ripper")).toEqual([]);
  });

  it("OP11-082#1: Aramaki's grant gives a just-played Character no attack", () => {
    const game = navyTable("faq-op11-082-1")
      .withBoard("p1", [character("aramaki", "OP11-082")])
      .withHand("p1", [instance("ripper", "OP11-096")])
      .withDeckTop("p1", copies(2, "ST31-002", "mill"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-096" });
    answer(game);
    game.play({ type: "activate-main", sourceInstanceId: "aramaki" });
    answer(game, "apply", "ripper");

    expect(granted(game, "ripper")).toBe(true);
    expect(attackTargets(game, "ripper")).toEqual([]);
  });

  it("OP11-084#1: Kuzan's [When Attacking] grant gives a just-played Character no attack", () => {
    const game = navyTable("faq-op11-084-1")
      .withBoard("p1", [character("kuzan", "OP11-084")])
      .withHand("p1", [instance("ripper", "OP11-096")])
      .withLife("p2", [
        instance("p2-life-1", "ST32-004"),
        instance("p2-life-2", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-096" });
    answer(game);
    attack(game, "kuzan", "p2-leader");
    answer(game, "ripper");
    undefended(game);
    answer(game);

    expect(granted(game, "ripper")).toBe(true);
    expect(attackTargets(game, "ripper")).toEqual([]);
  });

  it("OP11-119#1: Koby's [On Play] grant on itself gives it no attack", () => {
    const game = table("faq-op11-119-1")
      .withBoard("p2", [
        character("rested", "ST32-004", { rested: true }),
        character("active", "ST32-004"),
      ])
      .withHand("p1", [instance("koby", "OP11-119")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-119" });
    answer(game, "koby");

    expect(granted(game, "koby")).toBe(true);
    expect(attackTargets(game, "koby")).toEqual([]);
  });
});

describe("FAQ OP11-018 Honesty Impact", () => {
  it("OP11-018#1: the −4000 and the K.O. may go to different Characters", () => {
    const game = table("faq-op11-018-1")
      .withHand("p1", [instance("impact", "OP11-018")])
      .withBoard("p2", [
        character("shrunk", "ST32-004"),
        character("killed", "ST31-003"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP11-018" });
    game.play({ type: "resolve-effect", optionId: "shrunk" });
    expect(effectOptions(game)).toContain("killed");
    game.play({ type: "resolve-effect", optionId: "killed" });
    answer(game);

    expect(ids(game.state.players.p2.board)).toEqual(["shrunk"]);
    expect(currentPower(game.state, "p2", "shrunk")).toBe(1000);
  });
});

describe("FAQ OP11-102 Camie", () => {
  /** p1's Camie, p1 to swing at p2's Leader. */
  const camieTable = (seed: string) =>
    table(seed)
      .withBoard("p1", [character("camie", "OP11-102")])
      .withLife("p1", [
        instance("p1-life-1", "ST31-002"),
        instance("p1-life-2", "ST31-002"),
      ]);

  it("OP11-102#1: a Camie the Event K.O.s does not answer it", () => {
    // EB01-010 stands in for OP01-026: its [Counter] K.O.s a Character of
    // 6000 base power or less.
    const game = camieTable("faq-op11-102-1")
      .withLife("p2", [
        instance("p2-life-1", "ST32-004"),
        instance("p2-life-2", "ST32-004"),
      ])
      .withHand("p2", [instance("no-way", "EB01-010")])
      .build();

    attack(game, "p1-leader", "p2-leader");
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-010" });
    answer(game, "camie");

    expect(onBoard(game, "p1", "camie")).toBeUndefined();
    expect(ids(game.state.players.p1.life)).toEqual(["p1-life-1", "p1-life-2"]);
    expect(ids(game.state.players.p2.life)).toEqual(["p2-life-1", "p2-life-2"]);
  });

  it("OP11-102#2: at 2 Life the [Trigger] card has already left, so Camie trashes nothing", () => {
    const game = camieTable("faq-op11-102-2")
      .withLife("p2", [
        instance("trigger", "EB02-030"),
        instance("p2-life-2", "ST32-004"),
      ])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    attack(game, "p1-leader", "p2-leader");
    undefended(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game);

    expect(ids(game.state.players.p2.life)).toEqual(["p2-life-2"]);
    expect(ids(game.state.players.p1.life)).toEqual(["p1-life-1", "p1-life-2"]);
  });

  it("OP11-102#3: a [Trigger] that refills Life to 2 lets Camie trash from both", () => {
    // OP05-115's [Trigger]: trash 2 from hand to put the deck's top card on
    // top of Life.
    const game = camieTable("faq-op11-102-3")
      .withLife("p2", [
        instance("amaru", "OP05-115"),
        instance("p2-life-2", "ST32-004"),
      ])
      .withHand("p2", copies(2, "ST32-004", "p2-hand"))
      .withDeckTop("p2", [instance("p2-refill", "ST32-004")])
      .build();

    attack(game, "p1-leader", "p2-leader");
    undefended(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game, "apply", "p2-hand-1", "p2-hand-2");

    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p2.life).toHaveLength(1);
  });

  // The [Trigger] first, then Camie (the turn player's effect), then Enel.
  it("OP11-102#4: Camie, as the turn player's effect, resolves before the opponent's Enel", () => {
    // p2's OP05-098 Enel Leader refills Life at 0 on p1's turn; p2's last Life
    // card is OP06-115, whose [Trigger] at 0 Life puts one card back first.
    // Camie reads 1 Life and does nothing; Enel then adds a second.
    const game = camieTable("faq-op11-102-4")
      .withLeader("p2", "OP05-098")
      .withLife("p2", [instance("disappear", "OP06-115")])
      .withHand("p2", copies(3, "ST32-004", "p2-hand"))
      .withDeckTop("p2", copies(3, "ST32-004", "p2-deck"))
      .build();

    attack(game, "p1-leader", "p2-leader");
    undefended(game);
    let guard = 0;
    while (game.state.phase !== "main" || game.state.pendingEffect) {
      if (guard++ > 20) throw new Error("the battle never settled");
      if (game.state.pendingEffect) {
        answer(game, "apply");
        continue;
      }
      const offers = game.legalActions();
      game.submit(
        offers.find(
          (action) =>
            action.type === "resolve-trigger" &&
            action.summary.includes("Activate"),
        ) ?? offers[0]!,
      );
    }

    expect(ids(game.state.players.p1.life)).toEqual(["p1-life-1", "p1-life-2"]);
    expect(game.state.players.p2.life).toHaveLength(2);
  });
});

describe("FAQ OP11-022 Shirahoshi (Leader)", () => {
  it("OP11-022#1: with the top Life card already face-up the ability cannot be activated", () => {
    const game = table("faq-op11-022-1")
      .withLeader("p1", "OP11-022")
      .withHand("p1", [instance("scaled", "OP11-026")])
      .withLife("p1", [
        instance("life-1", "ST31-003", { faceUp: true }),
        instance("life-2", "ST31-003"),
      ])
      .build();

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

describe("FAQ OP11-023 Arlong / OP11-024 Aladine", () => {
  /**
   * p2's OP08-117 Burn Blade K.O.s p1's `victim` behind p1's {Fish-Man} Jinbe
   * Leader, with p1 on 3 Life. Paying for Burn Blade rests five of p2's DON!!,
   * which is Arlong's "5 or more rested cards".
   */
  const burned = (
    seed: string,
    victim: string,
    hand: ReturnType<typeof instance>[],
  ) => {
    const game = defending(seed)
      .withLeader("p1", "OP11-021")
      .withBoard("p1", [character("victim", victim)])
      .withHand("p1", hand)
      .withLife("p1", copies(3, "ST31-002", "p1-life"))
      .withHand("p2", [instance("burn", "OP08-117")])
      .withLife("p2", [instance("p2-life", "ST32-004")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP08-117" });
    let guard = 0;
    while (onBoard(game, "p1", "victim")) {
      if (guard++ > 10) throw new Error("the K.O. never landed");
      const options = effectOptions(game, game.player);
      game.play({
        type: "resolve-effect",
        optionId:
          ["victim", "apply", "p2-life"].find((id) => options.includes(id)) ??
          options[0]!,
      });
    }
    return game;
  };

  it("OP11-023#1: an Arlong at −3 cost in hand is a cost-4 Character to OP11-035 Fisher Tiger", () => {
    const game = burned("faq-op11-023-1", "OP11-035", [
      instance("arlong", "OP11-023"),
    ]);

    answer(game, "activate", "apply", "arlong");

    expect(onBoard(game, "p1", "arlong")).toBeDefined();
  });

  it("OP11-024#1: Aladine's two costs are paid together or not at all", () => {
    // Every DON!! p1 has is rested, so the DON!! half cannot be paid: the
    // card in hand is not trashed on its own, and nothing is played.
    const game = scenario()
      .decks(ST31, ST32)
      .seed("faq-op11-024-1")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 4 })
      .withLeader("p1", "OP11-021")
      .withBoard("p1", [character("victim", "OP11-024")])
      .withHand("p1", [
        instance("pitch", "ST31-002"),
        instance("jinbe", "OP11-031"),
      ])
      .withHand("p2", [instance("burn", "OP08-117")])
      .withLife("p2", [instance("p2-life", "ST32-004")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP08-117" });
    answer(game, "apply", "victim");

    expect(onBoard(game, "p1", "victim")).toBeUndefined();
    expect(ids(game.state.players.p1.hand)).toEqual(["pitch", "jinbe"]);
    // test/op11-jinbe.test.ts pins the paid half: both costs, then the play.
  });
});

describe("FAQ OP11-034 Hatchan: a Character that cannot be rested", () => {
  /**
   * p1's Hatchan, behind the {Fish-Man} Jinbe Leader, locks p2's OP11-014
   * Borsalino -- a cost-3 [Blocker] whose own [Activate: Main] rests itself.
   */
  const locked = (seed: string) => {
    const game = table(seed)
      .withLeader("p1", "OP11-021")
      .withBoard("p1", [character("hatchan", "OP11-034")])
      .withHand("p1", [instance("tiger", "OP11-035")])
      .withBoard("p2", [character("borsalino", "OP11-014")])
      .withLife("p2", [instance("p2-life", "ST32-004")])
      .withDeckTop("p2", copies(2, "ST32-004", "p2-deck"))
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "hatchan" });
    answer(game, "apply", "borsalino");
    expect(onBoard(game, "p2", "borsalino")?.cannotRestUntilTurn).toBe(
      game.state.turn + 1,
    );
    return game;
  };

  it("OP11-034#1: it cannot attack", () => {
    const game = locked("faq-op11-034-1");
    game.pass();
    answer(game);

    expect(game.player).toBe("p2");
    expect(attackTargets(game, "borsalino")).toEqual([]);
  });

  it("OP11-034#2: it cannot use an [Activate: Main] that rests it", () => {
    const game = locked("faq-op11-034-2");
    game.pass();
    answer(game);

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "borsalino",
        ),
    ).toBe(false);
  });

  it("OP11-034#3: it cannot activate [Blocker]", () => {
    const game = locked("faq-op11-034-3");
    attack(game, "p1-leader", "p2-leader");

    expect(blockers(game)).not.toContain("borsalino");
  });

  it("OP11-034#4: no effect can rest it", () => {
    // OP11-035 Fisher Tiger's [On Play] rests up to 1 opposing Character.
    const game = locked("faq-op11-034-4");
    game.play({ type: "play-card", cardNumber: "OP11-035" });
    const seen = answerAll(game, "borsalino");

    expect(seen).not.toContain("borsalino");
    expect(onBoard(game, "p2", "borsalino")?.rested).toBe(false);
  });
});

describe("FAQ OP11-040 Monkey.D.Luffy (Leader)", () => {
  /** p2 ends its turn into p1's, with `fieldDon` DON!! on p1's field. */
  const startOfTurn = (seed: string, fieldDon: number) =>
    defending(seed)
      .withLeader("p1", "OP11-040")
      .withDonDeck("p1", 10 - fieldDon)
      .withDeckTop("p1", [
        instance("straw-hat", "ST31-002"),
        ...copies(5, "ST32-004", "p1-deck"),
      ])
      .withLife("p1", copies(2, "ST32-004", "p1-life"))
      .build();

  // The engine runs nothing at the start of the turn for this Leader: its
  // clause carries no timing marker the registries dispatch, so the turn goes
  // straight to the Draw Phase and the look at 5 never happens.
  it("OP11-040#1: the look at 5 resolves before the Draw Phase", () => {
    const game = startOfTurn("faq-op11-040-1", 8);
    game.pass();

    // Stopped at the start of p1's turn, before the draw: the top card is
    // still in the deck and among the five the effect looks at.
    expect(game.state.pendingEffect?.sourceCardNumber).toBe("OP11-040");
    expect(game.state.players.p1.hand).toEqual([]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(effectOptions(game)).toContain("straw-hat");
  });

  it("OP11-040#2: with 7 DON!! on the field nothing happens", () => {
    // No look, and the turn draws its card as usual.
    const game = startOfTurn("faq-op11-040-2", 7);
    game.pass();

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.hand)).toEqual(["straw-hat"]);
  });
});

describe("FAQ OP11-041 Nami (Leader)", () => {
  /** p1 behind Nami, a draw waiting on the deck. */
  const namiTable = (seed: string) =>
    table(seed)
      .withLeader("p1", "OP11-041")
      .withDeckTop("p1", [instance("drawn", "ST31-002")]);

  it("OP11-041#1: a card leaving its controller's own Life draws too", () => {
    // OP11-072 Charlotte Mont-d'or's activation ends by adding p1's own top
    // Life card to p1's hand.
    const game = namiTable("faq-op11-041-1")
      .withBoard("p1", [character("montdor", "OP11-072")])
      .withLife("p1", [
        instance("p1-life-1", "ST31-003"),
        instance("p1-life-2", "ST31-003"),
      ])
      .withTrash("p2", copies(2, "ST32-004", "p2-trash"))
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "montdor" });
    answer(game, "apply");

    expect(ids(game.state.players.p1.hand)).toEqual(["p1-life-1", "drawn"]);
  });

  it("OP11-041#2: OP06-106 Kouzuki Hiyori's Life-to-hand swap draws", () => {
    const game = namiTable("faq-op11-041-2")
      .withHand("p1", [instance("hiyori", "OP06-106")])
      .withLife("p1", [
        instance("p1-life-1", "ST31-003"),
        instance("p1-life-2", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-106" });
    answer(game, "apply", "top", "p1-life-1");

    expect(ids(game.state.players.p1.hand)).toContain("drawn");
  });

  it("OP11-041#3: EB01-052 Viola reordering the opponent's Life does not draw", () => {
    const game = namiTable("faq-op11-041-3")
      .withHand("p1", [instance("viola", "EB01-052")])
      .withLife("p2", [
        instance("p2-life-1", "ST32-004"),
        instance("p2-life-2", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-052" });
    answer(game);

    expect(ids(game.state.players.p2.life).sort()).toEqual([
      "p2-life-1",
      "p2-life-2",
    ]);
    expect(ids(game.state.players.p1.hand)).not.toContain("drawn");
  });
});

/**
 * p2's OP16-011 Vista, holding one DON!!, swings at p1's Leader; its
 * [When Attacking] can K.O. up to 2 of p1's Characters with 2000 base power or
 * less. It stands in for the attacker-side K.O. clause the ruling describes.
 */
const vistaSwings = (seed: string, p1Board: ReturnType<typeof character>[]) =>
  defending(seed)
    .withBoard("p1", p1Board)
    .withBoard("p2", [character("vista", "OP16-011")])
    .withGivenDon("p2", "vista", 1)
    .withDeckTop("p1", copies(2, "ST31-002", "p1-deck"))
    .withLife("p1", copies(2, "ST31-002", "p1-life"))
    .build();

describe("FAQ OP11-043 Vinsmoke Ichiji", () => {
  it("OP11-043#1: a non-GERMA Character K.O.'d by the attacker's [When Attacking] leaves Ichiji's clause live", () => {
    // OP11-013 Prince Grus is a 2000-power {Navy}: the only non-GERMA body.
    const game = vistaSwings("faq-op11-043-1", [
      character("ichiji", "OP11-043"),
      character("grus", "OP11-013"),
    ]);

    attack(game, "vista", "p1-leader");
    const seen = answerAll(game, "grus", "apply");

    expect(onBoard(game, "p1", "grus")).toBeUndefined();
    expect(seen).toContain("apply");
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["p1-deck-1", "p1-deck-2"]),
    );
  });
});

describe("FAQ OP11-049 Carrot", () => {
  it("OP11-049#1: a Carrot the attacker's [When Attacking] K.O.s cannot answer the attack", () => {
    const game = vistaSwings("faq-op11-049-1", [
      character("carrot", "OP11-049"),
    ]);

    attack(game, "vista", "p1-leader");
    answer(game, "carrot");

    expect(onBoard(game, "p1", "carrot")).toBeUndefined();
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
  });
});

describe("FAQ OP11-044 Vinsmoke Judge", () => {
  it("OP11-044#1: a {GERMA 66} Character played after the activation does not gain +1000", () => {
    const game = table("faq-op11-044-1")
      .withBoard("p1", [character("judge", "OP11-044")])
      .withHand("p1", [
        instance("pitch", "ST31-002"),
        instance("ichiji", "OP11-043"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "judge" });
    answer(game, "apply", "pitch");
    expect(currentPower(game.state, "p1", "judge")).toBe(9000);

    game.play({ type: "play-card", cardNumber: "OP11-043" });
    answer(game);

    expect(currentPower(game.state, "p1", "ichiji")).toBe(7000);
  });
});

describe("FAQ OP11-057 Pedro", () => {
  /** p2's Leader swings at p1's Leader, with Pedro on p1's side. */
  const pedroDefends = (seed: string, handSize: number) =>
    defending(seed)
      .withBoard("p1", [character("pedro", "OP11-057")])
      .withHand("p1", copies(handSize, "ST31-002", "p1-hand"))
      .withLife("p1", copies(2, "ST31-002", "p1-life"))
      .build();

  it("OP11-057#1: a block stands after Pedro loses [Blocker] in the Counter Step", () => {
    // Four cards in hand: Pedro is a [Blocker] and blocks.
    const blocked = pedroDefends("faq-op11-057-1", 4);
    attack(blocked, "p2-leader", "p1-leader");
    expect(blockers(blocked)).toEqual(["pedro"]);
    // Five: it is not -- which is what it would lose in the Counter Step.
    const unblocked = pedroDefends("faq-op11-057-1-five", 5);
    attack(unblocked, "p2-leader", "p1-leader");
    expect(blockers(unblocked)).toEqual([]);

    // No card in the pool lifts a hand by one during the Counter Step, so the
    // battle is posed after the block with five cards in hand: the target
    // stays Pedro, which loses the fight, and the Leader takes nothing.
    const game = defending("faq-op11-057-1-counter")
      .withBoard("p1", [character("pedro", "OP11-057", { rested: true })])
      .withHand("p1", copies(5, "ST31-002", "p1-hand"))
      .withLife("p1", copies(2, "ST31-002", "p1-life"))
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "p2-leader",
          targetInstanceId: "pedro",
          attackPower: 5000,
          counterPower: 0,
        },
        "counter",
      )
      .build();
    undefended(game);
    answer(game);

    expect(onBoard(game, "p1", "pedro")).toBeUndefined();
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("FAQ OP11-058 Monkey.D.Luffy", () => {
  it("OP11-058#1: with 6 cards in hand it cannot attack, even by trashing 2 to OP08-043's toll", () => {
    // p2's OP08-043 Edward.Newgate puts the toll on p1's board on p2's turn.
    // The engine bars this card's attack whatever the hand size -- its derived
    // `rules.cannotAttack` reads the printed sentence without its hand-size
    // condition -- so this holds on that flag as much as on the hand.
    const game = defending("faq-op11-058-1")
      .withLeader("p2", "OP08-002")
      .withLife("p2", copies(2, "ST32-004", "p2-life"))
      .withHand("p2", [instance("newgate", "OP08-043")])
      .withBoard("p1", [character("luffy", "OP11-058")])
      .withHand("p1", copies(6, "ST31-002", "p1-hand"))
      .withDeckTop("p1", copies(2, "ST31-002", "p1-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP08-043" });
    answer(game);
    game.pass();
    answer(game);
    expect(game.player).toBe("p1");
    expect(game.state.players.p1.hand.length).toBeGreaterThanOrEqual(6);
    expect(onBoard(game, "p1", "luffy")?.attackTaxUntilTurn).toBe(
      game.state.turn,
    );

    expect(attackTargets(game, "luffy")).toEqual([]);
  });
});

describe("FAQ OP11-059 Gum-Gum King Cobra", () => {
  it("OP11-059#1: from 5 cards with the Event among them, the hand reads 4 and the bonus applies", () => {
    const game = defending("faq-op11-059-1")
      .withHand("p1", [
        instance("cobra", "OP11-059"),
        ...copies(4, "ST31-002", "p1-hand"),
      ])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "p2-leader",
          targetInstanceId: "p1-leader",
          attackPower: 5000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", cardNumber: "OP11-059" });
    answer(game, "p1-leader");

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });
});

describe("FAQ OP11-066 Charlotte Oven", () => {
  it("OP11-066#1: a wrong guess adds no DON!! and K.O.s nothing", () => {
    const game = table("faq-op11-066-1")
      .withDonDeck("p1", 2)
      .withBoard("p1", [character("oven", "OP11-066")])
      .withBoard("p2", [character("small", "ST31-003")])
      .withDeckTop("p2", [instance("revealed", "ST32-004")])
      .build();
    const fieldBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    game.play({ type: "activate-main", sourceInstanceId: "oven" });
    answer(game, "apply", "cost-0", "small");

    expect(onBoard(game, "p2", "small")).toBeDefined();
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(fieldBefore);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });
});

describe("FAQ OP11-072 Charlotte Mont-d'or", () => {
  it("OP11-072#1: with 1 card in the opponent's trash, that 1 card goes to the bottom of their deck", () => {
    const game = table("faq-op11-072-1")
      .withBoard("p1", [character("montdor", "OP11-072")])
      .withLife("p1", copies(2, "ST31-003", "p1-life"))
      .withTrash("p2", [instance("lone", "ST32-004")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "montdor",
        ),
    ).toBe(true);
    game.play({ type: "activate-main", sourceInstanceId: "montdor" });
    answer(game, "apply", "lone");

    expect(game.state.players.p2.trash).toEqual([]);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("lone");
  });
});

describe("FAQ OP11-083 Caribou / OP11-086 Coribou", () => {
  it("OP11-083#1: with 1 card left in hand Caribou is played and trashes that 1 card", () => {
    const game = table("faq-op11-083-1")
      .withHand("p1", [
        instance("caribou", "OP11-083"),
        instance("last", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-083" });
    answer(game, "last");

    expect(onBoard(game, "p1", "caribou")).toBeDefined();
    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(["last"]);
  });

  it("OP11-086#1: with an empty hand otherwise Coribou is still played", () => {
    const game = table("faq-op11-086-1")
      .withHand("p1", [instance("coribou", "OP11-086")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-086" });
    answer(game);

    expect(onBoard(game, "p1", "coribou")).toBeDefined();
    expect(game.state.players.p1.trash).toEqual([]);
  });
});

describe("FAQ OP11-091 Berry Good", () => {
  it("OP11-091#1: with 2 Events in the opponent's trash, both go to the bottom of their deck", () => {
    const game = table("faq-op11-091-1")
      .withHand("p1", [instance("berry", "OP11-091")])
      .withTrash("p2", [
        instance("event-1", "OP11-018"),
        instance("body", "ST32-004"),
        instance("event-2", "OP11-019"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-091" });
    answer(game, "event-1", "event-2");

    expect(ids(game.state.players.p2.trash)).toEqual(["body"]);
    expect(ids(game.state.players.p2.deck.slice(-2)).sort()).toEqual([
      "event-1",
      "event-2",
    ]);
  });
});

describe("FAQ OP11-092 Helmeppo", () => {
  it("OP11-092#1: the {SWORD} Character trashed as the cost can be the one played", () => {
    const game = table("faq-op11-092-1")
      .withHand("p1", [
        instance("helmeppo", "OP11-092"),
        instance("hibari", "OP11-010"),
      ])
      .withDeckTop("p1", [instance("drawn", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-092" });
    answer(game, "apply", "hibari");

    expect(onBoard(game, "p1", "hibari")).toBeDefined();
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });
});

describe("FAQ OP11-097 After All These Years I'm Losing My Edge!!!", () => {
  const edgeCounter = (seed: string, trash: number) =>
    scenario()
      .decks("(Red/Black) Koby - 2nd Place Indonesia Regional Final", ST32)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withLeader("p1", "OP11-001")
      .withTrash("p1", copies(trash, "ST31-002", "filler"))
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "p2-leader",
          targetInstanceId: "p1-leader",
          attackPower: 5000,
          counterPower: 0,
        },
        "counter",
      );

  it("OP11-097#1: the black cost-3-or-less Character just used as a Counter can come back", () => {
    // OP11-082 Aramaki: black, cost 1, Counter +2000. Eight filler, Aramaki and
    // the Event make ten.
    const game = edgeCounter("faq-op11-097-1", 8)
      .withHand("p1", [
        instance("aramaki", "OP11-082"),
        instance("edge", "OP11-097"),
      ])
      .build();

    game.play({ type: "counter", cardInstanceId: "aramaki" });
    game.play({ type: "activate-counter-event", cardNumber: "OP11-097" });
    answer(game, "p1-leader", "aramaki");

    expect(ids(game.state.players.p1.hand)).toEqual(["aramaki"]);
  });

  it("OP11-097#2: from 9 cards in the trash the Event itself makes the tenth", () => {
    // Also pinned by test/op11-koby.test.ts ("nine cards and the Event make ten").
    const game = edgeCounter("faq-op11-097-2", 8)
      .withTrash("p1", [
        ...copies(8, "ST31-002", "filler"),
        instance("aramaki", "OP11-082"),
      ])
      .withHand("p1", [instance("edge", "OP11-097")])
      .build();
    expect(game.state.players.p1.trash).toHaveLength(9);

    game.play({ type: "activate-counter-event", cardNumber: "OP11-097" });
    answer(game, "p1-leader", "aramaki");

    expect(ids(game.state.players.p1.hand)).toEqual(["aramaki"]);
  });
});
