import { describe, expect, it } from "vitest";
import { currentPower, type GameState } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's card Q&A for EB-05, Blue and Purple (EB05-021 to EB05-040), one
 * case per ruling, named `<card>#<n>` in the order the Q&A prints them for
 * that card.
 *
 * Source: Bandai's Japanese card Q&A for EB-05 (Q1482-Q1495, published
 * 2026-10-23). The English PDF had not been published yet; the rulings here
 * are paraphrased from the Japanese answers.
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer.
 */

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** A Leader with no type, name or text any card here reads. */
const PLAIN_LEADER = "FIX-LEADER-B";
const STRAW_HAT_LEADER = "OP05-060";

/** An empty table on p1's turn 11, ten DON!! active on both sides. */
const table = (seed: string) =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", PLAIN_LEADER)
    .withDeckTop("p1", copies(10, "ST31-002", "deck"));

function effectOptions(game: Game, player = game.state.activePlayer): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function settle(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

/** Answer a `DON!! −N` pile prompt, rested first. */
function returnDon(game: Game): void {
  let guard = 0;
  while (effectOptions(game).some((id) => id.startsWith("return-don:"))) {
    if (guard++ > 10) throw new Error("DON!! return never settled");
    pick(
      game,
      effectOptions(game).includes("return-don:rested")
        ? "return-don:rested"
        : "return-don:active",
    );
  }
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const fieldDon = (state: GameState, player: "p1" | "p2"): number => {
  const side = state.players[player];
  return (
    side.activeDon.length +
    side.restedDon.length +
    side.leaderAttachedDon.length +
    side.board.reduce(
      (total, card) => total + (card.attachedDon?.length ?? 0),
      0,
    )
  );
};

describe("EB05-021 Alvida", () => {
  it("EB05-021#1: a Crocodile & Mihawk played by its [On Play] cannot then play another Cross Guild Character", () => {
    const game = table("faq-eb05-021-1")
      .withHand("p1", [
        instance("alvida", "EB05-021"),
        instance("croc", "ST25-003"),
        instance("mr3", "OP09-056"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-021" });
    pick(game, "croc");
    // ST25-003's own [On Play] resolves after Alvida's has finished, so the
    // lock is already up: its draw-and-trash still happens, and its free play
    // has nothing it may play. Trash a drawn card, so the Cross Guild body
    // stays in hand for the play that never comes.
    expect(game.state.pendingEffect?.sourceCardNumber).toBe("ST25-003");
    pick(game, "deck-3");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["alvida", "croc"]);
    expect(ids(game.state.players.p1.hand)).toEqual([
      "mr3",
      "deck-1",
      "deck-2",
      "deck-4",
    ]);

    // The control: played on its own, the same card does reach Mr.3.
    const control = table("faq-eb05-021-1-control")
      .withHand("p1", [
        instance("croc", "ST25-003"),
        instance("mr3", "OP09-056"),
      ])
      .build();
    control.play({ type: "play-card", cardNumber: "ST25-003" });
    pick(control, "deck-1");
    expect(effectOptions(control)).toContain("mr3");
  });
});

describe("EB05-028 Boa Hancock", () => {
  it("EB05-028#1: the opponent picks the four cards from their own hand", () => {
    const game = table("faq-eb05-028-1")
      .withHand("p1", [instance("hancock", "EB05-028")])
      .withHand("p2", copies(9, "ST31-002", "theirs"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-028" });

    // The prompt is p2's, and p1 has nothing to answer.
    expect(effectOptions(game, "p1")).toEqual([]);
    expect(effectOptions(game, "p2")).toContain("theirs-9");
    for (const id of ["theirs-6", "theirs-7", "theirs-8", "theirs-9"]) {
      pick(game, id);
    }
    settle(game);

    expect(ids(game.state.players.p2.trash)).toEqual([
      "theirs-6",
      "theirs-7",
      "theirs-8",
      "theirs-9",
    ]);
    expect(game.state.players.p2.hand).toHaveLength(5);
  });
});

describe("EB05-033 Nico Robin", () => {
  it("EB05-033#1: with the condition failed, no DON!! is added either", () => {
    // Six behind, but the Leader lacks {Straw Hat Crew}.
    const wrongLeader = table("faq-eb05-033-1-leader")
      .withDonDeck("p1", 6)
      .withHand("p1", [instance("robin", "EB05-033")])
      .build();
    wrongLeader.play({ type: "play-card", cardNumber: "EB05-033" });
    settle(wrongLeader);
    expect(fieldDon(wrongLeader.state, "p1")).toBe(4);
    expect(wrongLeader.state.players.p1.donDeck).toHaveLength(6);

    // The right Leader, but only five behind.
    const tooClose = table("faq-eb05-033-1-count")
      .withLeader("p1", STRAW_HAT_LEADER)
      .withDonDeck("p1", 5)
      .withHand("p1", [instance("robin", "EB05-033")])
      .build();
    tooClose.play({ type: "play-card", cardNumber: "EB05-033" });
    settle(tooClose);
    expect(fieldDon(tooClose.state, "p1")).toBe(5);
    expect(tooClose.state.players.p1.donDeck).toHaveLength(5);
  });
});

describe("EB05-034 Sugar", () => {
  it("EB05-034#1: the 7-or-more check is read after DON!! −2, so 7 or 8 before paying gives no −4000", () => {
    for (const before of [8, 7]) {
      const game = table(`faq-eb05-034-1-${before}`)
        .withDonDeck("p1", 10 - before)
        .withHand("p1", [instance("sugar", "EB05-034")])
        .withBoard("p2", [character("jango", "OP12-045")])
        .build();

      expect(fieldDon(game.state, "p1")).toBe(before);
      game.play({ type: "play-card", cardNumber: "EB05-034" });
      if (effectOptions(game).includes("apply")) pick(game, "apply");
      returnDon(game);
      expect(effectOptions(game)).not.toContain("jango");
      settle(game);

      expect(fieldDon(game.state, "p1")).toBe(before - 2);
      expect(currentPower(game.state, "p2", "jango")).toBe(8000);
    }
  });
});
