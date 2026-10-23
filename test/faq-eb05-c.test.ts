import { describe, expect, it } from "vitest";
import { currentPower, getLegalActions } from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's Q&A for the EB-05 extra booster's Black and Yellow cards (EB05-041
 * to EB05-060), one case per ruling, named by the Q&A id (`<card>#<n>`, in the
 * order the Q&A prints that card's rulings).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to.
 *
 * Source: Bandai's Japanese card Q&A for EB-05, published 2026-10-23
 * (Q1485-Q1492). The English Q&A PDF for the set had not been published when
 * these were written; the cases paraphrase the Japanese rulings.
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** An empty table on one player's turn, late enough for every DON!! to be out. */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Answers each prompt with the first of `preferred` on offer, else the first. */
function settle(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    const options = effectOptions(game.state);
    const pick = preferred.find((id) => options.includes(id));
    game.play(
      pick
        ? { type: "resolve-effect", optionId: pick }
        : { type: "resolve-effect" },
    );
  }
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

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

describe("EB05-045 Ms. Monday", () => {
  it("EB05-045#1: the [On Play] may K.O. Ms. Monday herself", () => {
    const game = table("faq-eb05-045-1")
      .withHand("p1", [instance("monday", "EB05-045")])
      .withDeckTop("p1", copies(3, "FIX-001", "filler"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-045" });
    expect(effectOptions(game.state)).toContain("monday");
    pick(game, "monday");
    settle(game);

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toContain("monday");
  });

  it("EB05-045#2: the [On Play] may K.O. nothing", () => {
    const game = table("faq-eb05-045-2")
      .withHand("p1", [instance("monday", "EB05-045")])
      .withBoard("p1", [character("mr9", "OP14-095")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-045" });
    expect(effectOptions(game.state)).toContain("done");
    pick(game, "done");

    expect(ids(game.state.players.p1.board).sort()).toEqual(
      ["monday", "mr9"].sort(),
    );
  });
});

describe("EB05-046 Yamato", () => {
  it("EB05-046#1: with 9 cards in the trash, the card paid as the cost makes 10 and the Leader becomes 7000", () => {
    const game = table("faq-eb05-046-1", "p2")
      .withBoard("p1", [character("yamato", "EB05-046")])
      .withHand("p1", [instance("fodder", "FIX-001")])
      .withTrash("p1", copies(9, "FIX-002", "trashed"))
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    attack(game, "attacker", "p1-leader");
    pick(game, "apply");
    pick(game, "fodder");
    settle(game);

    expect(game.state.players.p1.trash).toHaveLength(10);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });
});

describe("EB05-052 Gloriosa", () => {
  const gloriosa = (seed: string, attacker = "ST31-002") =>
    table(seed, "p2")
      .withBoard("p1", [character("gloriosa", "EB05-052")])
      .withBoard("p2", [character("attacker", attacker)]);

  it("EB05-052#1: at 0 Life, a lost battle on the Leader is replaced and the game goes on", () => {
    const game = gloriosa("faq-eb05-052-1").withLife("p1", []).build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    pick(game, "replace:gloriosa");

    expect(game.state.phase).not.toBe("finished");
    expect(game.state.winner ?? null).toBeNull();
    expect(ids(game.state.players.p1.trash)).toContain("gloriosa");
  });

  it("EB05-052#2: trashing her replaces both points of a [Double Attack]", () => {
    // P-028 Portgas.D.Ace is a vanilla [Double Attack].
    const game = gloriosa("faq-eb05-052-2", "P-028")
      .withLife("p1", copies(3, "FIX-001", "p1-life"))
      .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
      .build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    pick(game, "replace:gloriosa");
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(3);
    expect(game.state.pendingBattleDamage).toBeUndefined();
  });

  it("EB05-052#2, contrast: declining takes both points", () => {
    const game = gloriosa("faq-eb05-052-2-contrast", "P-028")
      .withLife("p1", copies(3, "FIX-001", "p1-life"))
      .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
      .build();

    attack(game, "attacker", "p1-leader");
    declineDefence(game);
    pick(game, "skip");
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(1);
    expect(ids(game.state.players.p1.board)).toEqual(["gloriosa"]);
  });

  it("EB05-052#3: damage dealt by an effect -- EB03-055 Nico Robin's [On K.O.] -- can be replaced too", () => {
    const game = table("faq-eb05-052-3")
      .withBoard("p1", [
        character("attacker", "OP05-065"),
        character("gloriosa", "EB05-052"),
      ])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("robin", "EB03-055", { rested: true })])
      .build();

    attack(game, "attacker", "robin");
    declineDefence(game);
    // Robin's controller takes the "you may deal 1 damage", on their
    // opponent's turn; the damaged player then answers the replacement.
    pick(game, "apply");
    expect(game.state.activePlayer).toBe("p1");
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["replace:gloriosa", "take-damage"]),
    );
    pick(game, "replace:gloriosa");
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(ids(game.state.players.p1.trash)).toContain("gloriosa");
  });
});

describe("EB05-057 Nojiko", () => {
  it("EB05-057#1: a card with several attributes, one of them <Wisdom>, is a legal recipient", () => {
    const game = table("faq-eb05-057-1")
      .withLeader("p1", "FIX-LEADER-ODEN")
      .withBoard("p1", [
        character("nojiko", "EB05-057"),
        // OP12-055 Mohji & Cabaji prints <Slash> and <Wisdom>.
        character("mohji", "OP12-055"),
      ])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "nojiko" });
    expect(effectOptions(game.state)).toContain("mohji");
    pick(game, "mohji");
    settle(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "mohji")
        ?.attachedDon,
    ).toHaveLength(1);
  });
});

describe("EB05-059 Charlotte Pudding!!", () => {
  /**
   * p1 with OP17-107 Charlotte Daifuku rested, and optionally OP17-112
   * Charlotte Linlin, whose `[Your Turn]` aura makes a 4000-base Character
   * with a [Trigger] an 8000-base one; p2 with an 8000 to attack it with.
   */
  const pudding = (seed: string, withLinlin: boolean) =>
    table(seed)
      .withHand("p1", [instance("pudding", "EB05-059")])
      .withDeckTop("p1", [instance("drawn", "FIX-001")])
      .withBoard("p1", [
        character("daifuku", "OP17-107", { rested: true }),
        ...(withLinlin ? [character("linlin", "OP17-112")] : []),
      ])
      .withBoard("p2", [character("big", "OP05-065")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"));

  it("EB05-059#1: on your turn with Charlotte Linlin out, Charlotte Daifuku is not protected", () => {
    const game = pudding("faq-eb05-059-1", true).build();

    game.play({ type: "activate-main", summary: "[EB05-059]" });
    settle(game);
    game.pass();
    attack(game, "big", "daifuku");
    declineDefence(game);

    expect(ids(game.state.players.p1.trash)).toContain("daifuku");
  });

  it("EB05-059#1, contrast: without Charlotte Linlin, the same Daifuku survives", () => {
    const game = pudding("faq-eb05-059-1-contrast", false).build();

    game.play({ type: "activate-main", summary: "[EB05-059]" });
    settle(game);
    game.pass();
    attack(game, "big", "daifuku");
    declineDefence(game);

    expect(ids(game.state.players.p1.board)).toContain("daifuku");
  });
});
