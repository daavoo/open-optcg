import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for OP-09 (EMPERORS IN THE NEW WORLD), one case per
 * ruling, named by the Q&A id (`<card>#<n>`, in the order the PDF prints them).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to. A ruling the engine disagrees with is an `it.fails`
 * that says what the engine does instead. Comments paraphrase the rulings; the
 * repository holds none of Bandai's text.
 *
 * Source PDF: https://en.onepiece-cardgame.com/pdf/qa_op09.pdf
 *
 * The positions sit on the fixture decks: FIX-001 (cost 1, 2000, Counter
 * +1000) and FIX-002 (cost 2, 4000) print nothing, so nothing on the board but
 * the card under test can be the reason a case passes.
 */

/**
 * Rulings with no engine decision and no observable consequence to assert, or
 * whose position needs a card the pool does not hold.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {
  "OP09-093#1":
    "Deck construction: negating a card's any-number-of-copies text in a game changes nothing in that game, and the engine checks deck legality before the game, not during it.",
  "OP09-093#2":
    "Needs OP03-040 Nami (Leader), which is not in the card pool; with no Leader text the deck-out loss is the ordinary rule.",
  "OP09-097#1":
    "Deck construction: negating a card's any-number-of-copies text in a game changes nothing in that game.",
  "OP09-097#2": "Needs OP03-040 Nami (Leader), which is not in the card pool.",
  "OP09-098#1":
    "Deck construction: negating a card's any-number-of-copies text in a game changes nothing in that game.",
  "OP09-098#2": "Needs OP03-040 Nami (Leader), which is not in the card pool.",
  "OP09-081#5":
    "Needs PRB01-001 Sanji (Leader), which is not in the card pool.",
};

const FIX = (seed: string) =>
  scenario().decks("FIXTURE-RED", "FIXTURE-BLUE").seed(seed);

/** p1 to act in its Main Phase, both sides bare, all ten DON!! active. */
const table = (seed: string) =>
  FIX(seed).atTurn(3, { active: "p1" }).bareTable();

/** p2 to act in its Main Phase: p1 is the side that defends. */
const defending = (seed: string) =>
  FIX(seed).atTurn(4, { active: "p2" }).bareTable();

const REVOLUTIONARY_LEADER = "OP13-004";
const BLACKBEARD_LEADER = "OP09-081";

function effectOptions(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function blockers(game: Game): string[] {
  return game
    .legalActions()
    .flatMap((action) =>
      action.type === "block" ? [action.blockerInstanceId] : [],
    );
}

/** Takes the first offer at each step of whatever effect is open. */
function settle(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Takes the apply branch of an `optional` prompt, if one is open. */
function apply(game: Game): void {
  if (effectOptions(game).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
}

/** Declines whatever prompt is open, if a decline is on offer. */
function decline(game: Game): void {
  const options = effectOptions(game);
  const no = options.find(
    (id) => id === "skip" || id === "done" || id === "decline",
  );
  if (no) game.play({ type: "resolve-effect", optionId: no });
}

const attack = (game: Game, attacker: string, target: string): void => {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
};

/** Passes the Block and Counter windows and any Trigger, so the attack resolves. */
function noDefence(game: Game): void {
  let guard = 0;
  while (game.state.phase === "block" || game.state.phase === "counter") {
    if (guard++ > 40) throw new Error("battle never settled");
    if (
      game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
      continue;
    }
    if (game.state.pendingEffect) {
      const options = effectOptions(game);
      game.play({
        type: "resolve-effect",
        optionId:
          options.find((id) => id === "skip" || id === "done") ??
          options.at(-1)!,
      });
      continue;
    }
    game.pass();
  }
}

/** Passes the Block step only, leaving the Counter step open. */
function toCounter(game: Game): void {
  let guard = 0;
  while (game.state.phase === "block") {
    if (guard++ > 20) throw new Error("block step never closed");
    if (game.state.pendingEffect) {
      decline(game);
      continue;
    }
    game.pass();
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const onBoard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

describe("FAQ OP-09: Red", () => {
  it("OP09-001#1: Shanks may pass on the first attack and take the second", () => {
    const game = defending("faq-op09-001-1")
      .withLeader("p1", "OP09-001")
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [
        character("first", "FIX-002"),
        character("second", "FIX-002"),
      ])
      .build();

    attack(game, "first", "p1-leader");
    expect(game.player).toBe("p1");
    expect(effectOptions(game)).toContain("skip");
    decline(game);
    noDefence(game);
    expect(currentPower(game.state, "p2", "first")).toBe(4000);

    // Declining did not spend the [Once Per Turn].
    attack(game, "second", "p1-leader");
    apply(game);
    game.play({ type: "resolve-effect", optionId: "second" });
    expect(currentPower(game.state, "p2", "second")).toBe(3000);
  });

  it("OP09-001#2: Shanks answers a Leader's attack as well as a Character's", () => {
    const game = defending("faq-op09-001-2")
      .withLeader("p1", "OP09-001")
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .build();

    attack(game, "p2-leader", "p1-leader");
    apply(game);
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(4000);
  });

  it("OP09-009#1: a Character Beckman trashes does not get its [On K.O.]", () => {
    // OP09-083 Van Augur (6000) draws on [On K.O.]; being trashed is not one.
    const game = table("faq-op09-009-1")
      .withHand("p1", [instance("beckman", "OP09-009")])
      .withBoard("p2", [character("augur", "OP09-083")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-009" });
    game.play({ type: "resolve-effect", optionId: "augur" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["augur"]);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.deck).toHaveLength(2);
  });

  it("OP09-014#1: a Blocker Limejuice picked at 4000 stays switched off once it grows to 5000", () => {
    // p2's OP05-047 Basil Hawkins (5000 [Blocker]) sits at 4000 under p1's
    // OP09-004 Shanks aura when Limejuice picks it; OP09-030 Law then returns
    // Shanks to hand, and Hawkins is back to 5000 before the attack.
    const game = table("faq-op09-014-1")
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .withBoard("p1", [character("shanks", "OP09-004")])
      .withHand("p1", [
        instance("limejuice", "OP09-014"),
        instance("law", "OP09-030"),
      ])
      .withBoard("p2", [character("hawkins", "OP05-047")])
      .build();

    expect(currentPower(game.state, "p2", "hawkins")).toBe(4000);
    game.play({ type: "play-card", cardNumber: "OP09-014" });
    game.play({ type: "resolve-effect", optionId: "hawkins" });
    game.play({ type: "play-card", cardNumber: "OP09-030" });
    apply(game);
    game.play({ type: "resolve-effect", optionId: "shanks" });
    settle(game);
    expect(currentPower(game.state, "p2", "hawkins")).toBe(5000);

    attack(game, "p1-leader", "p2-leader");
    expect(game.state.phase).toBe("block");
    expect(blockers(game)).not.toContain("hawkins");
  });

  it("OP09-018#1: Get Out of Here! can K.O. a single 4000", () => {
    const game = table("faq-op09-018-1")
      .withHand("p1", [instance("event", "OP09-018")])
      .withBoard("p2", [character("four", "FIX-002")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "four" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["four"]);
  });

  it("OP09-018#2: a −2000 and a 6000 fit the 4000 total together", () => {
    const game = table("faq-op09-018-2")
      .withHand("p1", [instance("event", "OP09-018")])
      .withBoard("p2", [
        character("negative", "FIX-002", {
          powerModifiers: [{ amount: -6000, expiresAtTurn: 99 }],
        }),
        character("six", "OP09-083"),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    expect(currentPower(game.state, "p2", "negative")).toBe(-2000);

    game.play({ type: "activate-main", sourceCardNumber: "OP09-018" });
    game.play({ type: "resolve-effect", optionId: "negative" });
    game.play({ type: "resolve-effect", optionId: "six" });
    settle(game);

    expect(ids(game.state.players.p2.trash).sort()).toEqual([
      "negative",
      "six",
    ]);
  });
});

describe("FAQ OP-09: Green", () => {
  it("OP09-022#1: a Character played rested under Lim is not rested by an effect", () => {
    // OP07-031 Bartolomeo draws and trashes when a Character is rested by its
    // controller's effect; Lim's play-rested rule is not that.
    const game = table("faq-op09-022-1")
      .withLeader("p1", "OP09-022")
      .withBoard("p1", [character("barto", "OP07-031")])
      .withHand("p1", [instance("body", "FIX-001")])
      .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "FIX-001" });

    expect(onBoard(game, "p1", "body")?.rested).toBe(true);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.deck).toHaveLength(2);
  });

  it("OP09-030#1: Law may return itself and still play an {ODYSSEY} cost 3", () => {
    const game = table("faq-op09-030-1")
      .withHand("p1", [
        instance("law", "OP09-030"),
        instance("rosinante", "OP09-032"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-030" });
    apply(game);
    expect(effectOptions(game)).toContain("law");
    game.play({ type: "resolve-effect", optionId: "law" });
    game.play({ type: "resolve-effect", optionId: "rosinante" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["law"]);
    expect(ids(game.state.players.p1.board)).toEqual(["rosinante"]);
  });

  it("OP09-031#1: two rested Doflamingos and nothing else stand only one back up", () => {
    const game = table("faq-op09-031-1")
      .withBoard("p1", [
        character("dofla-a", "OP09-031", { rested: true }),
        character("dofla-b", "OP09-031", { rested: true }),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.pass();
    settle(game);

    const active = game.state.players.p1.board.filter((card) => !card.rested);
    expect(active).toHaveLength(1);
    expect(game.state.players.p1.board).toHaveLength(2);
  });

  it("OP09-032#1: Rosinante stood up by its own effect can block that attack", () => {
    const game = defending("faq-op09-032-1")
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p1", [character("rosinante", "OP09-032", { rested: true })])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();

    attack(game, "attacker", "p1-leader");
    apply(game);
    expect(onBoard(game, "p1", "rosinante")?.rested).toBe(false);
    expect(game.state.phase).toBe("block");
    expect(blockers(game)).toContain("rosinante");
  });

  it("OP09-032#2: a [When Attacking] that rests Rosinante can be answered by standing it up", () => {
    // p2's ST30-012 Luffy rests a [Blocker] when it attacks; the attacker's
    // effect resolves first, then Rosinante's.
    const game = defending("faq-op09-032-2")
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p1", [character("rosinante", "OP09-032")])
      .withBoard("p2", [character("luffy", "ST30-012")])
      .build();

    attack(game, "luffy", "p1-leader");
    game.play({ type: "resolve-effect", optionId: "rosinante" });
    expect(onBoard(game, "p1", "rosinante")?.rested).toBe(true);
    // Rosinante's own clause is offered after the rest has landed.
    expect(game.player).toBe("p1");
    expect(effectOptions(game)).toContain("apply");
    apply(game);
    settle(game);
    expect(onBoard(game, "p1", "rosinante")?.rested).toBe(false);
    expect(blockers(game)).toContain("rosinante");
  });

  it("OP09-037#1: three rested Lims and nothing else stand only one back up", () => {
    const game = table("faq-op09-037-1")
      .withBoard("p1", [
        character("lim-a", "OP09-037", { rested: true }),
        character("lim-b", "OP09-037", { rested: true }),
        character("lim-c", "OP09-037", { rested: true }),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.pass();
    settle(game);

    const active = game.state.players.p1.board.filter((card) => !card.rested);
    expect(active).toHaveLength(1);
  });

  it("OP09-041#1: a [Blocker] stood up by the [Counter] cannot block that battle", () => {
    const game = defending("faq-op09-041-1")
      .withLeader("p1", "OP09-022")
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p1", [
        character("rosinante", "OP09-032", { rested: true }),
        character("dofla", "OP09-031", { rested: true }),
      ])
      .withHand("p1", [instance("event", "OP09-041")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();

    attack(game, "attacker", "p1-leader");
    // Rosinante's own stand-up is declined, so only the Event stands it.
    decline(game);
    toCounter(game);
    game.play({ summary: "[OP09-041]" });
    game.play({ type: "resolve-effect", optionId: "rosinante" });
    game.play({ type: "resolve-effect", optionId: "dofla" });
    settle(game);

    expect(onBoard(game, "p1", "rosinante")?.rested).toBe(false);
    expect(game.state.phase).toBe("counter");
    expect(blockers(game)).toEqual([]);
  });
});

describe("FAQ OP-09: Blue", () => {
  /** p2 K.O.s p1's Marco with OP09-077 Gum-Gum Lightning on p2's turn. */
  const marcoKo = (seed: string) => {
    const game = defending(seed)
      .withBoard("p1", [character("marco", "OP09-052")])
      .withHand("p1", [instance("pitch", "FIX-001")])
      .withHand("p2", [instance("lightning", "OP09-077")])
      .build();
    game.play({ summary: "[OP09-077]" });
    apply(game);
    while (game.state.pendingEffect && !effectOptions(game).includes("marco")) {
      game.play({ type: "resolve-effect" });
    }
    game.play({ type: "resolve-effect", optionId: "marco" });
    return game;
  };

  it("OP09-052#1: Marco's hand cost is paid when it is K.O.'d, not before", () => {
    const game = marcoKo("faq-op09-052-1");
    // The hand is whole until the K.O. asks for the card.
    expect(ids(game.state.players.p1.hand)).toEqual(["pitch"]);
    expect(game.player).toBe("p1");
    apply(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });
    settle(game);

    expect(onBoard(game, "p1", "marco")?.rested).toBe(true);
    expect(ids(game.state.players.p1.trash)).toEqual(["pitch"]);
  });

  it("OP09-052#2: declining the hand cost leaves Marco in the trash", () => {
    const game = marcoKo("faq-op09-052-2");
    expect(effectOptions(game)).toContain("skip");
    decline(game);
    settle(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(ids(game.state.players.p1.trash)).toEqual(["marco"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["pitch"]);
  });

  it("OP09-058#1: the opponent picks which of their Characters Special Muggy Ball returns", () => {
    const game = table("faq-op09-058-1")
      .withHand("p1", [instance("event", "OP09-058")])
      .withBoard("p2", [
        character("small", "FIX-001"),
        character("big", "FIX-002"),
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP09-058" });
    expect(game.player).toBe("p2");
    // One of them must go back: the opponent cannot decline.
    expect(effectOptions(game).sort()).toEqual(["big", "small"]);
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(ids(game.state.players.p2.hand)).toEqual(["small"]);
    expect(ids(game.state.players.p2.board)).toEqual(["big"]);
  });
});

describe("FAQ OP-09: Purple", () => {
  it("OP09-061#1: two separate DON!! −1 payments do not reach Luffy's 2-or-more refund", () => {
    // OP15-061 Ohm's [On Play] is a DON!! −1 draw; two of them return one
    // DON!! each, never two at once.
    const game = table("faq-op09-061-1")
      .withLeader("p1", "OP09-061")
      .withHand("p1", copies(2, "OP15-061", "ohm"))
      .withDeckTop("p1", copies(3, "FIX-002", "p1-deck"))
      .build();

    for (let played = 0; played < 2; played += 1) {
      game.play({ type: "play-card", cardNumber: "OP15-061" });
      apply(game);
      settle(game);
    }

    // Both returns landed in the DON!! deck and nothing came back out of it.
    expect(game.state.players.p1.donDeck).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("OP09-061#2: Black Maria's end-of-turn return of 2 or more pays Luffy's refund", () => {
    // p1 holds 5 DON!! to p2's 5; Black Maria adds 5 rested, and at the end of
    // the turn sends 5 back to match -- a return of 2 or more at once, still on
    // p1's turn.
    const game = table("faq-op09-061-2")
      .withLeader("p1", "OP09-061")
      .withDonDeck("p1", 5)
      .withDonDeck("p2", 5)
      .withBoard("p1", [character("maria", "OP08-074")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:maria" });
    settle(game);
    const events = [...game.events];
    game.pass();
    events.push(...game.events);
    let guard = 0;
    while (game.state.pendingEffect && guard++ < 20) {
      game.play({ type: "resolve-effect" });
      events.push(...game.events);
    }

    expect(
      events.some(
        (event) =>
          event.type === "don-added" && event.sourceCardNumber === "OP09-061",
      ),
    ).toBe(true);
  });

  it("OP09-068#1: a negate does not take away the [Blocker] Chopper granted itself", () => {
    const game = table("faq-op09-068-1")
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p1", [character("chopper", "OP09-068", { rested: true })])
      .withLeader("p2", BLACKBEARD_LEADER)
      .withHand("p2", [instance("hole", "OP09-098")])
      .withBoard("p2", [character("attacker", "OP09-083")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.pass();
    apply(game);
    settle(game);
    expect(hasKeyword(game.state, "p1", "chopper", "Blocker")).toBe(true);

    // p2's OP09-098 Black Hole negates Chopper (cost 5, so it is not K.O.'d).
    game.play({ type: "activate-main", sourceCardNumber: "OP09-098" });
    game.play({ type: "resolve-effect", optionId: "chopper" });
    settle(game);
    expect(onBoard(game, "p1", "chopper")).toBeDefined();

    attack(game, "attacker", "p1-leader");
    expect(blockers(game)).toContain("chopper");
  });
});

describe("FAQ OP-09: Black", () => {
  // OP09-081#1 is fixed in the Trigger dispatch, for all seven cards whose
  // Trigger runs their own [On Play] (`MechanicProgram.runsOnPlay`).
  it("OP09-081#1: a negated [On Play] can still be chosen as the [Trigger], does nothing, and the card is trashed", () => {
    // p1 negates p2's [On Play] effects, then hits p2's OP08-106 Nami Life
    // card, whose Trigger runs its [On Play].
    const game = table("faq-op09-081-1")
      .withLeader("p1", BLACKBEARD_LEADER)
      .withHand("p1", [instance("pitch", "FIX-001")])
      .withLife("p2", [instance("nami", "OP08-106")])
      .withHand("p2", [instance("trigger-card", "OP09-097")])
      .withBoard("p2", [character("target", "FIX-001")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });
    apply(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });
    attack(game, "p1-leader", "p2-leader");
    while (
      !game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      game.pass();
    }
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toContain("nami");
    expect(onBoard(game, "p2", "target")).toBeDefined();
    expect(ids(game.state.players.p2.hand)).toEqual(["trigger-card"]);
  });

  it("OP09-081#2: an [On Play] Character in a Teach deck is played with its [On Play] negated", () => {
    const game = table("faq-op09-081-2")
      .withLeader("p1", BLACKBEARD_LEADER)
      .withHand("p1", [instance("beckman", "OP09-009")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-009" });

    expect(ids(game.state.players.p1.board)).toEqual(["beckman"]);
    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p2.board)).toEqual(["victim"]);
  });

  /** p1's Teach negates p2's [On Play]s, then hands p2 the turn. */
  const negatedOpponent = (seed: string) => {
    const game = table(seed)
      .withLeader("p1", BLACKBEARD_LEADER)
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withHand("p1", [instance("pitch", "FIX-001")])
      .withBoard("p1", [character("victim", "FIX-002", { rested: true })])
      .withHand("p2", [instance("beckman", "OP09-009")])
      .withBoard("p2", [character("yasopp", "OP09-013", { attachedDon: [] })])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });
    apply(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });
    game.pass();
    settle(game);
    return game;
  };

  it("OP09-081#3: on the next turn the opponent's played [On Play] does nothing", () => {
    const game = negatedOpponent("faq-op09-081-3");
    expect(game.player).toBe("p2");

    game.play({ type: "play-card", cardNumber: "OP09-009" });
    expect(game.state.pendingEffect).toBeNull();
    expect(onBoard(game, "p1", "victim")).toBeDefined();
  });

  it("OP09-081#4: on the next turn the opponent's [When Attacking] still works", () => {
    // OP09-013 Yasopp: [On Play] and, with a DON!! given, a [When Attacking]
    // debuff.
    const game = negatedOpponent("faq-op09-081-4");
    game.play({ type: "attach-don", targetInstanceId: "yasopp" });
    attack(game, "yasopp", "p1-leader");

    expect(effectOptions(game)).toContain("victim");
    game.play({ type: "resolve-effect", optionId: "victim" });
    expect(currentPower(game.state, "p1", "victim")).toBe(3000);
  });

  it("OP09-081#6: a Character with only an [On Play] still has a base effect while it is negated", () => {
    // EB03-009 Makino buffs a Character with no base effect; OP09-009 Beckman
    // prints only an [On Play], negated under p1's own Teach.
    const game = table("faq-op09-081-6")
      .withLeader("p1", BLACKBEARD_LEADER)
      .withBoard("p1", [
        character("makino", "EB03-009"),
        character("beckman", "OP09-009"),
        character("vanilla", "FIX-002"),
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:makino" });
    apply(game);
    const options = effectOptions(game);
    expect(options).toContain("vanilla");
    expect(options).not.toContain("beckman");
  });

  it("OP09-084#1: a negate does not take away the [Blocker] Devon granted itself", () => {
    const game = table("faq-op09-084-1")
      .withLeader("p1", BLACKBEARD_LEADER)
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p1", [character("devon", "OP09-084")])
      .withLeader("p2", BLACKBEARD_LEADER)
      .withHand("p2", [instance("hole", "OP09-098")])
      .withBoard("p2", [character("attacker", "OP09-083")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:devon" });
    game.play({ type: "resolve-effect", optionId: "blocker" });
    game.pass();
    settle(game);

    // p2's OP09-098 Black Hole negates Devon (cost 5, so it is not K.O.'d).
    game.play({ type: "activate-main", sourceCardNumber: "OP09-098" });
    game.play({ type: "resolve-effect", optionId: "devon" });
    settle(game);
    expect(onBoard(game, "p1", "devon")).toBeDefined();

    attack(game, "attacker", "p1-leader");
    expect(blockers(game)).toContain("devon");
  });

  it("OP09-086#1: a Counter trashed while Burgess is attacked counts toward its power", () => {
    const game = defending("faq-op09-086-1")
      .withLeader("p1", BLACKBEARD_LEADER)
      .withBoard("p1", [character("burgess", "OP09-086", { rested: true })])
      .withTrash("p1", copies(7, "FIX-002", "p1-trash"))
      .withHand("p1", [instance("counter", "FIX-001")])
      .withBoard("p2", [character("attacker", "OP09-083")])
      .build();

    // 7 cards: +1000.
    expect(currentPower(game.state, "p1", "burgess")).toBe(6000);
    attack(game, "attacker", "burgess");
    toCounter(game);
    game.play({ type: "counter", cardInstanceId: "counter" });

    // 8 cards: +2000.
    expect(game.state.players.p1.trash).toHaveLength(8);
    expect(currentPower(game.state, "p1", "burgess")).toBe(7000);
    noDefence(game);
    expect(onBoard(game, "p1", "burgess")).toBeDefined();
  });

  it("OP09-089#1: Stronger's draw lands before the cost debuff's target is picked", () => {
    const game = table("faq-op09-089-1")
      .withLeader("p1", BLACKBEARD_LEADER)
      .withBoard("p1", [character("stronger", "OP09-089")])
      .withHand("p1", [instance("pitch", "FIX-001")])
      .withDeckTop("p1", [instance("drawn", "FIX-002")])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:stronger" });
    apply(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });

    // The debuff's choice is open, and the drawn card is already in hand.
    expect(effectOptions(game)).toContain("target");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });

  /** p1's Teach (OP09-093), played this turn, against p2's `target`. */
  const teach = (
    seed: string,
    target: string,
    { rested = false, beside = [] as ReturnType<typeof character>[] } = {},
  ) =>
    table(seed)
      .withLeader("p1", BLACKBEARD_LEADER)
      .withBoard("p1", [
        character("teach", "OP09-093", { playedTurn: 3 }),
        ...beside,
      ])
      .withBoard("p2", [character("target", target, { rested })])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"));

  const teachNegates = (game: Game) => {
    game.play({ type: "activate-main", optionId: "mechanic-main:teach" });
    // Leader half first, then the Character half.
    while (
      game.state.pendingEffect &&
      !effectOptions(game).includes("target")
    ) {
      game.play({ type: "resolve-effect" });
    }
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);
  };

  it("OP09-093#3: a Character Teach negated does not get its [On K.O.]", () => {
    // p2's rested OP09-083 Van Augur draws on [On K.O.]; p1's Leader, given
    // two DON!!, swings 7000 into its 6000.
    const game = teach("faq-op09-093-3", "OP09-083", { rested: true }).build();
    teachNegates(game);
    game.play({ type: "attach-don", targetInstanceId: "p1-leader" });
    game.play({ type: "attach-don", targetInstanceId: "p1-leader" });
    attack(game, "p1-leader", "target");
    noDefence(game);
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["target"]);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.deck).toHaveLength(2);
  });

  it("OP09-093#4: Teach's negate leaves another card's effect on the target in place", () => {
    // p1's OP09-004 Shanks takes 1000 off every Character p2 has; negating
    // p2's Character switches off that Character's own text, not Shanks's.
    const game = teach("faq-op09-093-4", "FIX-002", {
      beside: [character("shanks", "OP09-004")],
    }).build();
    expect(currentPower(game.state, "p2", "target")).toBe(3000);
    teachNegates(game);
    expect(currentPower(game.state, "p2", "target")).toBe(3000);
  });

  it("OP09-093#5: Teach's target cannot attack until the end of the opponent's next turn", () => {
    const game = teach("faq-op09-093-5", "FIX-002").build();
    teachNegates(game);
    game.pass();
    settle(game);

    const canAttack = () =>
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "target",
        );
    expect(game.player).toBe("p2");
    expect(canAttack()).toBe(false);

    // The turn after that, it attacks again.
    game.pass();
    settle(game);
    game.pass();
    settle(game);
    expect(game.player).toBe("p2");
    expect(canAttack()).toBe(true);
  });

  /** p2 attacks p1's Leader; p1 answers in the Counter step. */
  const vortexTable = (seed: string) =>
    defending(seed)
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withHand("p1", [
        instance("vortex", "OP09-097"),
        instance("snake-shot", "OP13-039"),
      ])
      .withBoard("p1", [character("shanks", "OP09-004")])
      .withBoard("p2", [
        character("attacker", "OP09-083"),
        // OP09-090 Doc Q: cost 2, draws on [On K.O.].
        character("docq", "OP09-090", { rested: true }),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"));

  it("OP09-097#3: a Character Black Vortex negated does not get its [On K.O.]", () => {
    // Vortex negates p2's Doc Q, then OP13-039 Gum-Gum Snake Shot K.O.s it
    // in the same Counter step.
    const game = vortexTable("faq-op09-097-3").build();
    attack(game, "attacker", "p1-leader");
    toCounter(game);
    game.play({ summary: "[OP09-097]" });
    game.play({ type: "resolve-effect", optionId: "docq" });
    settle(game);
    game.play({ summary: "[OP13-039]" });
    game.play({ type: "resolve-effect", optionId: "docq" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["docq"]);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.deck).toHaveLength(2);
  });

  it("OP09-097#4: Black Vortex's negate leaves another card's effect on the target in place", () => {
    // p1's OP09-004 Shanks aura keeps taking its 1000 off the attacker.
    const game = vortexTable("faq-op09-097-4").build();
    expect(currentPower(game.state, "p2", "attacker")).toBe(5000);
    attack(game, "attacker", "p1-leader");
    toCounter(game);
    game.play({ summary: "[OP09-097]" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);

    expect(currentPower(game.state, "p2", "attacker")).toBe(6000 - 1000 - 4000);
  });

  /** p1 behind Teach, holding OP09-098 Black Hole. */
  const blackHole = (seed: string) =>
    table(seed)
      .withLeader("p1", BLACKBEARD_LEADER)
      .withHand("p1", [instance("hole", "OP09-098")])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"));

  it("OP09-098#3: a Character Black Hole negated does not get its [On K.O.]", () => {
    // Doc Q is cost 2, so Black Hole negates it and then K.O.s it.
    const game = blackHole("faq-op09-098-3")
      .withBoard("p2", [character("docq", "OP09-090")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP09-098" });
    game.play({ type: "resolve-effect", optionId: "docq" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["docq"]);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.deck).toHaveLength(2);
  });

  it("OP09-098#4: Black Hole's negate leaves another card's effect on the target in place", () => {
    // A cost 5, out of the K.O.'s reach, under p1's OP09-004 Shanks aura.
    const game = blackHole("faq-op09-098-4")
      .withBoard("p1", [character("shanks", "OP09-004")])
      .withBoard("p2", [character("augur", "OP09-083")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "OP09-098" });
    game.play({ type: "resolve-effect", optionId: "augur" });
    settle(game);

    expect(onBoard(game, "p2", "augur")).toBeDefined();
    expect(currentPower(game.state, "p2", "augur")).toBe(5000);
  });

  it("OP09-098#5: Jack at −3 cost from Tempest Kick is K.O.'d once Black Hole negates its +4", () => {
    // OP08-084 Jack: printed 7, +4 from its own text, −3 from OP07-096
    // Tempest Kick. Negated, its own +4 is gone and it is a 4.
    const game = blackHole("faq-op09-098-5")
      .withHand("p1", [
        instance("hole", "OP09-098"),
        instance("kick", "OP07-096"),
      ])
      .withTrash("p1", copies(10, "FIX-002", "p1-trash"))
      .withBoard("p2", [character("jack", "OP08-084")])
      .build();
    const jack = () => onBoard(game, "p2", "jack")!;
    expect(effectiveCost(game.state, "p2", jack())).toBe(11);

    game.play({ type: "activate-main", sourceCardNumber: "OP07-096" });
    while (game.state.pendingEffect && !effectOptions(game).includes("jack")) {
      game.play({ type: "resolve-effect" });
    }
    game.play({ type: "resolve-effect", optionId: "jack" });
    settle(game);
    expect(effectiveCost(game.state, "p2", jack())).toBe(8);

    game.play({ type: "activate-main", sourceCardNumber: "OP09-098" });
    game.play({ type: "resolve-effect", optionId: "jack" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["jack"]);
  });
});

describe("FAQ OP-09: Yellow", () => {
  /**
   * p2 hits p1's Leader; `cardNumber` is p1's top Life card over `under` more.
   * p2's Life stands at `theirs`.
   */
  const lifeTrigger = (
    seed: string,
    cardNumber: string,
    under: number,
    theirs: number,
    leader = REVOLUTIONARY_LEADER,
  ) => {
    const game = defending(seed)
      .withLeader("p1", leader)
      .withLife("p1", [
        instance("life-card", cardNumber),
        ...copies(under, "FIX-001", "p1-life"),
      ])
      .withLife("p2", copies(theirs, "FIX-001", "p2-life"))
      .withDeckTop("p1", copies(3, "FIX-002", "p1-deck"))
      // A 6000 against a 5000 Leader, so the hit lands.
      .withBoard("p2", [character("attacker", "OP09-083")])
      .build();
    attack(game, "attacker", "p1-leader");
    while (
      game.state.phase === "block" ||
      (game.state.phase === "counter" &&
        !game
          .legalActions()
          .some((action) => action.type === "resolve-trigger"))
    ) {
      game.pass();
    }
    return game;
  };

  // 1 + 2 of p1's (the Trigger card plus two under it) and 3 of p2's is 6
  // counting the Trigger card and 5 without it.
  for (const [id, cardNumber, leader] of [
    ["OP09-100#1", "OP09-100", REVOLUTIONARY_LEADER],
    ["OP09-108#1", "OP09-108", REVOLUTIONARY_LEADER],
    ["OP09-112#1", "OP09-112", REVOLUTIONARY_LEADER],
    ["OP09-114#1", "OP09-114", "FIX-LEADER-R"],
  ] as const) {
    it(`${id}: the Trigger's 5-Life total does not count the Trigger card itself`, () => {
      const game = lifeTrigger(`faq-${id}`, cardNumber, 2, 3, leader);
      game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
      settle(game);
      expect(ids(game.state.players.p1.board)).toEqual(["life-card"]);
    });
  }

  it("OP09-101#1: Kuzan's [On Play] does nothing without a cost 3 to place", () => {
    const game = table("faq-op09-101-1")
      .withHand("p1", [instance("kuzan", "OP09-101")])
      .withBoard("p2", [character("big", "OP09-083")])
      .withHand("p2", [instance("kept", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-101" });
    settle(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["kept"]);
    expect(game.state.players.p2.life).toHaveLength(0);
  });

  it("OP09-103#1: Koala draws nothing when no Character is played", () => {
    const game = table("faq-op09-103-1")
      .withLeader("p1", REVOLUTIONARY_LEADER)
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withHand("p1", [
        instance("koala", "OP09-103"),
        instance("karasu", "OP09-100"),
      ])
      .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-103" });
    apply(game);
    // The Life card goes to hand as the cost.
    while (game.state.pendingEffect && !effectOptions(game).includes("done")) {
      game.play({ type: "resolve-effect" });
    }
    game.play({ type: "resolve-effect", optionId: "done" });
    settle(game);

    expect(game.state.players.p1.deck).toHaveLength(2);
    expect(ids(game.state.players.p1.board)).toEqual(["koala"]);
  });

  it("OP09-104#1: Sabo still takes a Life card with nothing added to Life", () => {
    const game = table("faq-op09-104-1")
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withHand("p1", [
        instance("sabo", "OP09-104"),
        instance("karasu", "OP09-100"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-104" });
    game.play({ type: "resolve-effect", optionId: "done" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("OP09-105#1: Sanji's Trigger adds the Life card even with 1 or fewer cards in hand", () => {
    // The Trigger is gated on an {Egghead} Leader; ST29-001 is one.
    const game = lifeTrigger("faq-op09-105-1", "OP09-105", 1, 3, "ST29-001");
    expect(game.state.players.p1.hand).toHaveLength(0);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    // One Life under the Trigger card, plus the deck's top card.
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("FAQ OP-09: Gol.D.Roger", () => {
  it("OP09-118#1: a block against a Character other than Roger wins with either side at 0 Life", () => {
    const game = table("faq-op09-118-1")
      .withBoard("p1", [
        character("roger", "OP09-118"),
        character("attacker", "FIX-002"),
      ])
      .withLife("p2", copies(1, "FIX-001", "p2-life"))
      .withBoard("p2", [character("karasu", "OP09-100")])
      .build();

    attack(game, "attacker", "p2-leader");
    game.play({ type: "block", blockerInstanceId: "karasu" });

    expect(game.state.winner).toBe("p1");
  });

  // The ruling's position needs ST09-007 Shinobu, whose [On Block] costs its
  // own Life after the block; neither it nor any other [On Block] that loses
  // Life is in the pool. What the engine can be held to is the half that
  // decides it: the Life count is read as [Blocker] is used, so a block at
  // 1 Life each does not win.
  it("OP09-118#2: with both sides at 1 Life a block does not win", () => {
    const game = table("faq-op09-118-2")
      .withLife("p1", copies(1, "FIX-001", "p1-life"))
      .withBoard("p1", [character("roger", "OP09-118")])
      .withLife("p2", copies(1, "FIX-001", "p2-life"))
      .withBoard("p2", [character("karasu", "OP09-100")])
      .build();

    attack(game, "roger", "p2-leader");
    game.play({ type: "block", blockerInstanceId: "karasu" });

    expect(game.state.winner).toBeFalsy();
  });
});
