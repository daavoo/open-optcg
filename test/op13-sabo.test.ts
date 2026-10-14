import { describe, expect, it } from "vitest";
import { requireKnownCard } from "@one-piece-sim/cards";
import { loadDeck, requireSupportedDeck } from "@one-piece-sim/decks";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The OP-17 Red/Black Sabo list in `packages/decks/src/op13-sabo-manifest.ts`.
 *
 * Two of its identities were in the card pool but in no shipped deck, so
 * nothing drove their clauses: OP15-088 Pirates Docking Six and OP15-094
 * Roronoa Zoro. Those are what the per-card blocks below cover. The Leader and
 * the OP17 half are covered in `test/st35.test.ts` and `test/op17.test.ts`;
 * what is deck-scoped, and tested last, is that the two different cost
 * thresholds this list runs on are answered by the same card, and that every
 * slot is one a Red/Black Leader may legally play.
 */
const DECK = "(Red/Black) Sabo - OP17 Elbaph List";

/**
 * A neutral table with the Sabo list on p1, built the way `test/op16.test.ts`
 * builds its own: turn 11 so the DON!! is not the constraint, and `bareTable()`
 * so only the cards a case puts down are on it.
 */
const table = (seed: string) =>
  scenario()
    .decks(DECK, "(Green) Roronoa Zoro - Starter Deck 32")
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

describe("OP15-088 Pirates Docking Six", () => {
  covers("OP15-088", "static", "[On Play]");

  it("sits on the board at 11 cost, six above its printed 5", () => {
    const game = table("op15-088-cost")
      .withBoard("p1", [character("docking", "OP15-088")])
      .build();

    // The static half. It matters here rather than as trivia: this list's other
    // clauses read a Character's *cost*, and a printed 5 that is an 11 on the
    // field is one of the bodies they read.
    expect(requireKnownCard("OP15-088").cost).toBe(5);
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(11);
  });

  it("mills 3 to bring a 2-cost Straw Hat back out of the trash", () => {
    const game = table("op15-088-on-play")
      .withHand("p1", [instance("docking", "OP15-088")])
      .withTrash("p1", [instance("zoro", "OP17-095")])
      .withDeckTop("p1", copies(3, "OP17-086", "milled"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-088" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "zoro" });

    // The cost was paid off the top of the deck, and the 2-drop is on the board.
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["milled-1", "milled-2", "milled-3"]),
    );
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["docking", "zoro"]),
    );
  });

  it("declining the trash-3 cost leaves the deck and the trash alone", () => {
    const game = table("op15-088-decline")
      .withHand("p1", [instance("docking", "OP15-088")])
      .withTrash("p1", [instance("zoro", "OP17-095")])
      .withDeckTop("p1", copies(3, "OP17-086", "kept"))
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    game.play({ type: "play-card", cardNumber: "OP15-088" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.deck).toHaveLength(deckBefore);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "zoro",
    ]);
  });

  it("offers the cost with nothing to bring back, and plays nothing", () => {
    const game = table("op15-088-empty-trash")
      .withHand("p1", [instance("docking", "OP15-088")])
      // Only a 5-cost body in the trash: "cost of 2 or less" excludes it.
      .withTrash("p1", [instance("too-big", "OP15-088")])
      .withDeckTop("p1", copies(3, "OP17-086", "milled"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-088" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    // The mill happened -- it is a cost, not a condition -- and the "up to 1"
    // found no legal target, so only Docking Six is on the board.
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["milled-1", "milled-2", "milled-3"]),
    );
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "docking",
    ]);
  });
});

describe("OP15-094 Roronoa Zoro", () => {
  covers("OP15-094", "static", "[Blocker]");

  /**
   * A position where p2 is about to K.O. one of p1's Characters with an effect,
   * which is the only window a replacement is offered in.
   *
   * OP16-006 Shanks is the removal: "[printed text omitted -- pnpm card:text OP16-006]"
   */
  const opponentRemoval = (seed: string) =>
    table(seed)
      .withHand("p2", [instance("shanks", "OP16-006")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"));

  it("trashes itself to save another Straw Hat from the opponent's removal", () => {
    const game = opponentRemoval("op15-094-save")
      .withBoard("p1", [
        character("zoro", "OP15-094"),
        character("nami", "OP17-086"),
      ])
      .build();

    game.pass();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "nami" });

    const trade = game
      .legalActions()
      .find((action) => action.summary.includes("Trash Roronoa Zoro"));
    expect(trade, "Zoro's replacement should be offered").toBeDefined();
    game.submit(trade!);

    // Nami survives; Zoro paid, and he is in the trash rather than K.O.'d --
    // the distinction `trash-self` exists for.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "nami",
    ]);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "zoro",
    ]);
  });

  it("is not offered against removal aimed at himself", () => {
    const game = opponentRemoval("op15-094-self")
      .withBoard("p1", [character("zoro", "OP15-094")])
      .build();

    game.pass();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "zoro" });

    // "…other than this Character": trashing himself to save himself is not an
    // answer, so it is never put on the table.
    expect(
      game
        .legalActions()
        .some((action) => action.summary.includes("Trash Roronoa Zoro")),
    ).toBe(false);
    expect(game.state.players.p1.board).toHaveLength(0);
  });

  it("is not offered for a Character outside {Straw Hat Crew}", () => {
    const game = opponentRemoval("op15-094-off-type")
      .withBoard("p1", [
        character("zoro", "OP15-094"),
        // {Land of Wano} {The Akazaya Nine} -- no Straw Hat Crew type, and
        // small enough for the removal to reach, which the deck's own two
        // non-Straw-Hat bodies (6000 and 8000 power) are not.
        character("kinemon", "ST32-001"),
      ])
      .build();

    game.pass();
    game.play({ type: "play-card", cardNumber: "OP16-006" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "kinemon" });

    expect(
      game
        .legalActions()
        .some((action) => action.summary.includes("Trash Roronoa Zoro")),
    ).toBe(false);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "zoro",
    ]);
  });

  it("is not offered against battle destruction, which is no effect at all", () => {
    // "…would be removed from the field **by your opponent's effect**". Losing a
    // battle is the battle's own result, not an effect, so the save does not
    // reach it. `resolveBattle` names the attacker as the source of the removal,
    // and `eligibleReplacements` used to read that alone as "by your opponent"
    // -- so every Straw Hat in this deck, the field's strongest, was quietly
    // surviving one lost fight a turn for a card it never had to spend.
    const game = table("op15-094-battle")
      .atTurn(12, { active: "p2" })
      .withBoard("p1", [
        character("zoro", "OP15-094"),
        character("nami", "OP17-086", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "OP12-023")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "nami",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    expect(
      game
        .legalActions()
        .some((action) => action.summary.includes("Trash Roronoa Zoro")),
    ).toBe(false);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "zoro",
    ]);
  });

  it("blocks, which is the other half of what the singleton is for", () => {
    const game = table("op15-094-blocker")
      .withBoard("p1", [character("zoro", "OP15-094")])
      .build();

    expect(hasKeyword(game.state, "p1", "zoro", "Blocker")).toBe(true);
  });
});

describe("OP-17 Red/Black Sabo deck list", () => {
  it("loads as a legal 50 behind the OP13 Leader", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP13-004");
    expect(loadDeck(DECK)).toHaveLength(50);
  });

  it("is two colours, and every slot is playable under a Red/Black Leader", () => {
    const manifest = requireSupportedDeck(DECK);
    const leaderColors = requireKnownCard(manifest.leader).colors ?? [];
    expect([...leaderColors].sort()).toEqual(["Black", "Red"]);
    for (const cardNumber of Object.keys(manifest.cards)) {
      const colors = requireKnownCard(cardNumber).colors ?? [];
      expect(
        colors.some((color) => leaderColors.includes(color)),
        `${cardNumber} is ${colors.join("/")}`,
      ).toBe(true);
    }
  });

  it("answers both of its cost thresholds with the same giant", () => {
    // The deck-scoped claim. The Leader reads "[printed text omitted -- pnpm card:text <card>]" and the Elbaph shell reads "[printed text omitted -- pnpm card:text <card>]"; a printed 4-cost Saul is 16 on the field, so
    // one card satisfies both at once.
    const game = table("op13-sabo-thresholds")
      .withBoard("p1", [
        character("saul", "OP17-089"), // printed 4, +12 static
        character("robin", "OP17-087"), // 2000, +3000 while a 12-cost is out
      ])
      .withLife("p1", copies(5, "OP17-086", "life"))
      .withDon("p1", { active: 5, leaderAttached: 1 })
      .build();

    const state = game.state;
    expect(
      effectiveCost(state, "p1", state.players.p1.board[0]!),
    ).toBeGreaterThanOrEqual(12);

    // Robin: 2000 printed, +3000 from her own clause, +1000 from the Leader's
    // aura, which the same Saul turned on.
    expect(currentPower(state, "p1", "robin")).toBe(6000);
    // The Leader: 5000 printed, -1000 at 4-or-more Life, +1000 from its own
    // aura, +1000 for the attached DON!! that armed the aura in the first place.
    expect(state.players.p1.life).toHaveLength(5);
    expect(currentPower(state, "p1", "p1-leader")).toBe(6000);
  });

  it("loses the Leader's aura, but not the Elbaph clauses, without a cost-8 body", () => {
    // The asymmetry that decides turns: "there is" scans both boards, "you
    // have" only this one. Here the 12-cost body belongs to the opponent.
    const game = table("op13-sabo-asymmetry")
      .withBoard("p1", [character("robin", "OP17-087")])
      .withBoard("p2", [character("their-saul", "OP17-089")])
      .withLife("p1", copies(5, "OP17-086", "life"))
      .withDon("p1", { active: 5, leaderAttached: 1 })
      .build();

    const state = game.state;
    // Robin's own clause is on -- an opposing giant is still "a Character".
    expect(currentPower(state, "p1", "robin")).toBe(5000);
    // The Leader's aura is off: p1 has no Character of its own at cost 8+. So
    // 5000 printed, -1000 at 4-or-more Life, +1000 for the attached DON!!, and
    // none of the +1000 the case above gets.
    expect(currentPower(state, "p1", "p1-leader")).toBe(5000);
  });
});
