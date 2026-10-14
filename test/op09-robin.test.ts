import { describe, expect, it } from "vitest";
import { loadDeck, requireSupportedDeck } from "@one-piece-sim/decks";
import { currentPower, getLegalActions } from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  hasPrintedText,
  instance,
  scenario,
} from "./support/index.js";

/**
 * Purple/Yellow Nico Robin: the list in
 * `packages/decks/src/op09-robin-manifest.ts`.
 *
 * Two halves, and they are tested for different reasons. The OP-09 cards are
 * new to the pool with the set import, so their programs are driven here for
 * the first time. The OP-17 Big Mom package was registered when OP17 came in
 * as a whole series and has never sat in a shipped deck, so every one of those
 * clauses was unreachable from any position the suite could build -- this is
 * the deck that opens them, and half of them are gated on being *this* deck:
 * the Leader's ramp and OP17-109's draw both spend a card with a [Trigger],
 * and OP17-112's aura only reaches a 4000 body that prints one.
 */

const DECK = "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** p1 on the Robin list, in its own Main Phase with ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(DECK, OPPONENT).seed(seed).atTurn(11, { active: "p1" });

/** p1 on the Robin list, defending, for the clauses gated on the other turn. */
const defending = (seed: string) =>
  scenario().decks(DECK, OPPONENT).seed(seed).atTurn(12, { active: "p2" });

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

interface Playable {
  state: GameState;
  pass: () => void;
  legalActions: () => readonly { type: string; summary: string }[];
  play: (matcher: {
    type: "resolve-effect" | "resolve-trigger";
    optionId?: string;
    summary?: string;
  }) => unknown;
}

/** Pass the block step, stopping in the Counter step so a Counter can be played. */
const passToCounter = (game: Playable) => {
  let guard = 0;
  while (game.state.phase === "block") {
    if (guard++ > 20) throw new Error("block step never closed");
    if (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      const decline =
        options.find(
          (optionId) => optionId === "skip" || optionId === "done",
        ) ?? options.at(-1);
      if (!decline) throw new Error("pending effect offered nothing");
      game.play({ type: "resolve-effect", optionId: decline });
      continue;
    }
    game.pass();
  }
};

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: { state: GameState; play: Playable["play"] }) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/**
 * Decline the block and Counter steps, so a declared attack resolves.
 *
 * `trigger: "stop"` hands the Life Trigger decision back to the test, which is
 * what the [Banish] case needs: the point of that clause is that the window
 * never opens at all.
 */
const declineDefence = (
  game: Playable,
  trigger: "decline" | "stop" = "decline",
) => {
  let guard = 0;
  while (game.state.phase === "block" || game.state.phase === "counter") {
    if (guard++ > 40) throw new Error("battle never settled");
    if (
      game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      if (trigger === "stop") return;
      game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
      continue;
    }
    if (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      const decline =
        options.find(
          (optionId) => optionId === "skip" || optionId === "done",
        ) ?? options.at(-1);
      if (!decline) throw new Error("pending effect offered nothing");
      game.play({ type: "resolve-effect", optionId: decline });
      continue;
    }
    game.pass();
  }
};

describe("Purple/Yellow Nico Robin deck list", () => {
  it("loads a 50-card Standard list behind OP09-062", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP09-062");
    expect(manifest.format).toBe("standard");
    expect(loadDeck(DECK)).toHaveLength(50);
  });
});

describe("OP09-062 Nico Robin (Leader)", () => {
  covers("OP09-062", "[When Attacking]", "[Banish]");

  it("trades a [Trigger] card out of hand for a rested DON!!", () => {
    const game = table("op09-062-ramp")
      .bareTable()
      // `bareTable()` puts all ten DON!! on the field, and "add up to 1 DON!!
      // card from your DON!! deck" adds nothing from an empty one.
      .withDonDeck("p1", 2)
      // OP17-107 Charlotte Daifuku prints a [Trigger]; OP17-113 Streusen does
      // not, and the cost names the clause rather than a card count.
      .withHand("p1", [
        instance("trigger-card", "OP17-107"),
        instance("plain-card", "OP17-113"),
      ])
      .build();

    const donBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Only the card that prints a [Trigger] may pay.
    expect(effectOptions(game.state)).toEqual(["trigger-card"]);
    game.play({ type: "resolve-effect", optionId: "trigger-card" });

    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP17-107",
    ]);
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(donBefore + 1);
    // "and rest it": the DON!! arrives rested, so it pays for nothing this turn.
    expect(game.state.players.p1.restedDon.length).toBeGreaterThan(0);
  });

  it('names the card and the clause on the offer, not just "optional effect"', () => {
    // The regression this is for: an LLM seat declined this ramp -- the deck's
    // whole ramp, described three times over in its own dossier -- reasoning
    // about an effect it had made up, because the two actions in front of it
    // read "Apply optional effect" and "Don't apply optional effect" and named
    // neither the card nor the clause. See `optionalEffectSummary`.
    const game = table("op09-062-offer-label")
      .bareTable()
      .withDonDeck("p1", 2)
      .withHand("p1", [instance("trigger-card", "OP17-107")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });

    const summaries = Object.fromEntries(
      getLegalActions(game.state, "p1")
        .filter((action) => action.type === "resolve-effect")
        .map((action) => [action.optionId, action.summary]),
    );
    expect(summaries.skip).toBe("Don't apply Nico Robin [OP09-062]'s effect");
    if (hasPrintedText()) {
      // Asserted as a prefix, not in full: `clauseTextOf` cuts a clause at the
      // next timing marker without asking `opensClause` whether that marker
      // opens one, so the [Trigger] this cost names mid-sentence truncates the
      // quote to "You may trash 1 card with a". Fixing the boundary changes
      // every card's derived `clauseSummaries` and so needs a pipeline run
      // (`pnpm reference:fetch` + `pnpm reference:audit`), which is why it is
      // not in this change. The shipped build takes the branch below.
      expect(summaries.apply).toMatch(/^Activate Nico Robin \[OP09-062\]: /);
    } else {
      // No printed text ships, so the marker is what is left -- and it is
      // enough to find the clause in a dossier that describes it.
      expect(summaries.apply).toBe(
        "Activate Nico Robin [OP09-062] [When Attacking]",
      );
    }
  });

  it("is not offered when no card in hand prints a [Trigger]", () => {
    const game = table("op09-062-no-trigger")
      .bareTable()
      .withHand("p1", [instance("plain-card", "OP17-113")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
  });

  it("[Banish]: damage it deals trashes the Life card without its Trigger", () => {
    const game = table("op09-062-banish")
      .bareTable()
      .withHand("p1", [])
      // A Life card that prints a [Trigger], so a window would open if the
      // keyword were not read.
      .withLife("p2", [instance("their-life", "OP17-107")])
      .build();

    // The forecast has to say so too: "to their hand" overstates what the
    // defender gets from a [Banish] hit by a card and a Trigger, and this
    // string is what the web UI and the LLM seat price the battle from.
    const declared = game.action({
      type: "attack",
      targetInstanceId: "p2-leader",
    });
    expect(declared.summary).toContain("to their trash");
    expect(declared.summary).not.toContain("to their hand");
    game.submit(declared);
    declineDefence(game, "stop");

    // No Trigger window, and the card is in the trash rather than in hand.
    expect(
      game.legalActions().some((action) => action.type === "resolve-trigger"),
    ).toBe(false);
    expect(game.state.players.p2.life).toHaveLength(0);
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("their-life");
    expect(
      game.state.players.p2.hand.map((card) => card.instanceId),
    ).not.toContain("their-life");
  });
});

describe("OP09-078 Gum-Gum Giant", () => {
  covers("OP09-078", "[Counter]");

  it("pays two DON!! and a card for +4000 in the battle and two cards back", () => {
    const game = defending("op09-078-counter")
      .bareTable()
      .withHand("p1", [
        instance("giant", "OP09-078"),
        instance("pitch", "OP17-113"),
      ])
      .withDeckTop("p1", [
        instance("draw-a", "OP17-113"),
        instance("draw-b", "OP17-113"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP09-078]" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    // One Event played, one card trashed to its cost, two drawn.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 2 + 2);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP17-113");
  });
});

describe("OP09-106 Nico Olvia", () => {
  covers("OP09-106", "[On Play]", "[Trigger]");

  it("pushes the [Nico Robin] Leader to 8000 for the turn", () => {
    const game = table("op09-106-on-play")
      .bareTable()
      .withHand("p1", [instance("olvia", "OP09-106")])
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
    game.play({ type: "play-card", cardNumber: "OP09-106" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);
  });
});

/**
 * p1 takes one hit with `cardNumber` as its only Life card, and stops with the
 * Trigger window open.
 *
 * Five of the deck's Characters print "[Trigger] Play this card", so the same
 * position drives all of them; what differs is what the board looks like after.
 */
const triggerFrom = (seed: string, cardNumber: string) => {
  const game = defending(seed)
    .bareTable()
    .withLife("p1", [instance("life-card", cardNumber)])
    .withBoard("p2", [character("attacker", "ST32-004")])
    .build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  declineDefence(game, "stop");
  return game;
};

describe("OP09-106 Nico Olvia's Trigger", () => {
  covers("OP09-106", "[Trigger]");

  it("draws three and trashes two behind the [Nico Robin] Leader", () => {
    const game = defending("op09-106-trigger")
      .bareTable()
      .withLife("p1", [instance("life-card", "OP09-106")])
      .withDeckTop("p1", [
        instance("draw-a", "OP17-113"),
        instance("draw-b", "OP17-113"),
        instance("draw-c", "OP17-113"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game, "stop");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    // Three drawn, two of them trashed again: a net +1 card and two cards in
    // the trash the deck's recursion can read.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(
      game.state.players.p1.trash.filter(
        (card) => card.cardNumber === "OP17-113",
      ),
    ).toHaveLength(2);
  });
});

describe("OP17-107 Charlotte Daifuku", () => {
  covers("OP17-107", "[Trigger]");

  it("plays itself off the Life card it was hit for", () => {
    const game = triggerFrom("op17-107-trigger", "OP17-107");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-107",
    ]);
  });
});

describe("OP17-102 Charlotte Oven", () => {
  covers("OP17-102", "[On K.O.]", "[Trigger]");

  it("plays itself off a Life card", () => {
    const game = triggerFrom("op17-102-trigger", "OP17-102");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-102",
    ]);
  });

  it("replaces itself out of the trash when it dies", () => {
    const game = defending("op17-102-on-ko")
      .bareTable()
      .withBoard("p1", [character("oven", "OP17-102", { rested: true })])
      // 4000 power or less, and not another Oven: the printed target.
      .withTrash("p1", [
        instance("small", "OP17-107"),
        instance("another-oven", "OP17-102"),
        instance("big", "OP17-112"),
      ])
      .withBoard("p2", [character("attacker", "OP17-112")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "oven",
    });
    declineDefence(game, "stop");

    // Only the 4000 body that is not another Oven may come back.
    expect(effectOptions(game.state)).toEqual(["small", "done"]);
    game.play({ type: "resolve-effect", optionId: "small" });
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-107",
    ]);
  });
});

describe("OP17-113 Streusen", () => {
  covers("OP17-113", "[On Play]");

  it("digs three deep for a {Big Mom Pirates} card", () => {
    const game = table("op17-113-on-play")
      .bareTable()
      .withHand("p1", [instance("streusen", "OP17-113")])
      .withDeckTop("p1", [
        instance("miss", "OP09-078"),
        instance("hit", "OP17-107"),
        instance("miss-2", "OP09-078"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-113" });
    // Only the {Big Mom Pirates} card among the three is offered.
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    // "The rest at the bottom": the two misses are still in the deck, behind
    // everything else in it.
    expect(game.state.players.p1.deck).toHaveLength(2);
  });
});

describe("OP17-106 Charlotte Smoothie", () => {
  covers("OP17-106", "[Your Turn]", "[On Play]", "[Trigger]");

  it("rests two DON!! to bank a Life card and strip a card from hand", () => {
    const game = table("op17-106-on-play")
      .bareTable()
      .withHand("p1", [instance("smoothie", "OP17-106")])
      .withHand("p2", [instance("theirs", "ST32-004")])
      .withDeckTop("p1", [instance("banked", "OP17-107")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-106" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    settle(game);

    // The top of the deck is now the top of Life, face down.
    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "banked",
    ]);
    expect(game.state.players.p1.deck).toHaveLength(0);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "theirs",
    ]);
    // Five DON!! rested paying the 5-cost body, two more rested by the clause
    // itself -- rested rather than spent, so all seven are still on the field.
    expect(game.state.players.p1.restedDon).toHaveLength(7);
    expect(game.state.players.p1.activeDon).toHaveLength(3);
  });

  it("plays itself off a Life card", () => {
    const game = triggerFrom("op17-106-trigger", "OP17-106");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-106",
    ]);
  });
});

describe("OP17-109 Charlotte Pudding", () => {
  covers("OP17-109", "[On Play]", "[Trigger]");

  it("trades a [Trigger] card for three cards, and is not offered without one", () => {
    const game = table("op17-109-on-play")
      .bareTable()
      .withHand("p1", [
        instance("pudding", "OP17-109"),
        instance("fuel", "OP17-107"),
      ])
      .withDeckTop("p1", [
        instance("draw-a", "OP17-113"),
        instance("draw-b", "OP17-113"),
        instance("draw-c", "OP17-113"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-109" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    // The [Trigger] card is the only card that can pay.
    expect(effectOptions(game.state)).toEqual(["fuel"]);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(3);

    const bare = table("op17-109-no-fuel")
      .bareTable()
      .withHand("p1", [instance("pudding", "OP17-109")])
      .build();
    bare.play({ type: "play-card", cardNumber: "OP17-109" });
    // The "you may" prompt is still raised -- an [On Play] is dispatched
    // whatever the hand holds -- but taking it can buy nothing, because the
    // draw is nested inside the cost it cannot pay.
    bare.play({ type: "resolve-effect", optionId: "apply" });
    settle(bare);
    expect(bare.state.players.p1.hand).toHaveLength(0);
  });

  it("searches five deep off a Life card", () => {
    const game = defending("op17-109-trigger")
      .bareTable()
      .withLife("p1", [instance("life-card", "OP17-109")])
      .withDeckTop("p1", [
        instance("miss", "OP09-078"),
        instance("hit", "OP17-110"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game, "stop");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });
});

describe("OP17-110 Charlotte Perospero", () => {
  covers("OP17-110", "[Your Turn]", "[On Play]", "[Trigger]");

  it("deploys a second {Big Mom Pirates} body and attacks the same turn", () => {
    const game = table("op17-110-on-play")
      .bareTable()
      .withHand("p1", [
        instance("perospero", "OP17-110"),
        instance("free", "OP17-106"),
        // 10 cost: outside the printed ceiling of 6.
        instance("too-big", "OP17-112"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-110" });
    expect(effectOptions(game.state)).toEqual(["free", "done"]);
    game.play({ type: "resolve-effect", optionId: "free" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP17-106", "OP17-110"]);
    // [Rush] for the turn: the 7-drop that just arrived can declare an attack.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            "attackerInstanceId" in action &&
            game.state.players.p1.board.some(
              (card) =>
                card.cardNumber === "OP17-110" &&
                card.instanceId === action.attackerInstanceId,
            ),
        ),
    ).toBe(true);
  });

  it("survives being the body given up for the Character it played", () => {
    // Onto a full board the `[On Play]` play suspends on a replacement choice,
    // and Perospero himself is one of the bodies on offer. His program still
    // has the [Rush] grant to run on him afterwards, and it used to throw on
    // the card it could no longer find -- which no pilot had reached, because
    // the choice was reported as a bare `mechanic-choice` and first offered
    // (the oldest body) always won. See `test/format-area-limit.test.ts`.
    const game = table("op17-110-self-replacement")
      .bareTable()
      .withBoard("p1", [
        character("linlin", "OP17-112"),
        character("daifuku", "OP17-107"),
        character("daifuku-2", "OP17-107"),
        character("pudding", "OP17-109"),
      ])
      .withHand("p1", [
        instance("perospero", "OP17-110"),
        instance("oven", "OP17-102"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-110" });
    game.play({ type: "resolve-effect", optionId: "oven" });
    expect(effectOptions(game.state)).toContain("perospero");
    game.play({ type: "resolve-effect", optionId: "perospero" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP17-102", "OP17-107", "OP17-107", "OP17-109", "OP17-112"]);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP17-110");
  });

  it("plays itself off a Life card", () => {
    const game = triggerFrom("op17-110-trigger", "OP17-110");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-110",
    ]);
  });
});

describe("OP17-112 Charlotte Linlin", () => {
  covers("OP17-112", "[Your Turn]", "[On Play]");

  it("makes every 4000-power [Trigger] body an 8000 on its controller's turn", () => {
    const mine = table("op17-112-aura")
      .bareTable()
      .withBoard("p1", [
        character("linlin", "OP17-112"),
        character("daifuku", "OP17-107"),
        // 2000 printed and no [Trigger]: outside the clause on both counts.
        character("streusen", "OP17-113"),
      ])
      .build();
    expect(currentPower(mine.state, "p1", "daifuku")).toBe(8_000);
    expect(currentPower(mine.state, "p1", "streusen")).toBe(2_000);

    const theirs = defending("op17-112-aura-off")
      .bareTable()
      .withBoard("p1", [
        character("linlin", "OP17-112"),
        character("daifuku", "OP17-107"),
      ])
      .build();
    // "[Your Turn]": on the opponent's turn the body is a 4000 again.
    expect(currentPower(theirs.state, "p1", "daifuku")).toBe(4_000);
  });

  it("draws, then either banks a Life card or takes one off the opponent", () => {
    const game = table("op17-112-on-play")
      .bareTable()
      .withHand("p1", [instance("linlin", "OP17-112")])
      .withDeckTop("p1", [
        instance("draw", "OP17-113"),
        instance("banked", "OP17-107"),
      ])
      .withLife("p2", [instance("their-life", "OP17-107")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-112" });
    // Both halves of the printed choice are offered.
    expect(effectOptions(game.state).sort()).toEqual(["life", "steal"]);
    game.play({ type: "resolve-effect", optionId: "steal" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
    // The opponent's top Life card goes to its owner's hand, not to p1's.
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "their-life",
    ]);
  });
});

describe("OP17-114 Sweet 3 Generals", () => {
  covers("OP17-114", "[Your Turn]", "[On Play]", "[Trigger]");

  it("rests two DON!! for a card, a Life card and two debuffs", () => {
    const game = table("op17-114-on-play")
      .bareTable()
      .withHand("p1", [instance("generals", "OP17-114")])
      .withDeckTop("p1", [
        instance("draw", "OP17-113"),
        instance("banked", "OP17-107"),
      ])
      .withBoard("p2", [
        character("first", "ST32-004"),
        character("second", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-114" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    // The draw comes first, then the card banked onto Life, then the debuffs.
    game.play({ type: "resolve-effect", optionId: "banked" });
    game.play({ type: "resolve-effect", optionId: "first" });
    game.play({ type: "resolve-effect", optionId: "second" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "banked",
    ]);
    expect(currentPower(game.state, "p2", "first")).toBe(2_000);
    expect(currentPower(game.state, "p2", "second")).toBe(2_000);
  });

  it("plays itself off a Life card", () => {
    const game = triggerFrom("op17-114-trigger", "OP17-114");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-114",
    ]);
  });
});
