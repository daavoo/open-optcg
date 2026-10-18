import { describe, expect, it } from "vitest";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Positions the System-1 trainer's self-play reached and the engine could not
 * finish, reduced to the cards that cause them. Each test names the error the
 * training run logged in `failed-games.jsonl`.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const pendingSource = (game: Game) =>
  game.state.pendingEffect && "sourceCardNumber" in game.state.pendingEffect
    ? game.state.pendingEffect.sourceCardNumber
    : undefined;

describe("effect damage from several queued [On K.O.]s", () => {
  // Nami Feature vs mon: OP08-119 Kaido & Linlin's DON!! −10 K.O.d three
  // EB03-055 Nico Robin at once. The first Robin's damage parked the Life card
  // for its Trigger check, the second Robin's [On K.O.] opened before that
  // check, and its damage threw PENDING_TRIGGER_ALREADY_OPEN.
  it("answers each damage's [Trigger] before the next Robin resolves", () => {
    const game = scenario()
      .decks(P1, P2)
      .seed("training-robin-damage")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("pair", "OP08-119")])
      .withBoard("p2", [
        character("robin-a", "EB03-055", { rested: true }),
        character("robin-b", "EB03-055", { rested: true }),
      ])
      // Kaido & Linlin banks this card as p1's top Life, so it is the card the
      // first Robin's damage reveals.
      .withDeckTop("p1", [instance("trigger-a", "EB03-020")])
      .withLife("p1", [instance("trigger-b", "EB03-020")])
      .withLife("p2", copies(3, "FIX-001", "p2-life"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "pair",
      targetInstanceId: "p2-leader",
    });
    let guard = 0;
    while (pendingSource(game) === "OP08-119") {
      if (guard++ > 30) throw new Error("Kaido & Linlin never settled");
      game.play({ type: "resolve-effect" });
    }
    expect(ids(game.state.players.p2.trash)).toEqual(
      expect.arrayContaining(["robin-a", "robin-b"]),
    );

    // The first Robin: p2 deals the damage, and p1 is asked about its Trigger
    // before anything else happens.
    expect(pendingSource(game)).toBe("EB03-055");
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.phase).toBe("trigger");
    expect(game.player).toBe("p1");
    expect(game.state.pendingEffect).toBeNull();
    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (pendingSource(game) === "EB03-020") {
      game.play({ type: "resolve-effect" });
    }
    expect(ids(game.state.players.p1.trash)).toContain("trigger-a");

    // Then the second Robin, and its own Trigger check.
    expect(pendingSource(game)).toBe("EB03-055");
    expect(game.player).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(game.state.phase).toBe("trigger");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (pendingSource(game) === "EB03-020") {
      game.play({ type: "resolve-effect" });
    }
    expect(ids(game.state.players.p1.trash)).toContain("trigger-b");
    expect(game.state.players.p1.life).toHaveLength(0);
    expect(game.state.pendingTrigger).toBeNull();
  });
});

describe("an [Activate: Main] whose only question is its own cost", () => {
  // The trainer's games that hit the 1,500-action cap: a pilot activated
  // OP11-070 Charlotte Pudding (or EB03-016 Kouzuki Hiyori), declined the
  // "You may" cost at the apply/skip prompt that followed, which changed
  // nothing, and was offered the same activation again, hundreds of times in
  // one turn. Activating is the choice to pay, so no such prompt is raised.
  const activations = (game: Game) =>
    game
      .legalActions()
      .filter((action) => action.type === "activate-main")
      .map((action) => action.sourceInstanceId);

  it("OP11-070 Charlotte Pudding pays on activation and is not offered again", () => {
    const game = scenario()
      .decks(P1, P2)
      .seed("training-pudding-loop")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("pudding-a", "OP11-070"),
        character("pudding-b", "OP11-070"),
      ])
      .build();
    const fieldDon = () =>
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    const fieldBefore = fieldDon();
    expect(activations(game)).toEqual(["pudding-a", "pudding-b"]);

    game.play({ type: "activate-main", sourceInstanceId: "pudding-a" });
    // No apply/skip for the cost: only "which DON!! goes back", if anything.
    expect(
      game
        .legalActions()
        .filter((action) => action.type === "resolve-effect")
        .map((action) => action.optionId),
    ).not.toContain("skip");
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(fieldDon()).toBe(fieldBefore - 1);
    expect(
      game.state.players.p1.board.find(
        (card) => card.instanceId === "pudding-a",
      )?.rested,
    ).toBe(true);
    // The rested Pudding is spent; the other one is still there to use.
    expect(activations(game)).toEqual(["pudding-b"]);
  });

  it("EB03-016 Kouzuki Hiyori trashes itself on activation", () => {
    const game = scenario()
      .decks(P1, P2)
      .seed("training-hiyori-loop")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withLeader("p1", "OP16-079")
      .withBoard("p1", [character("hiyori", "EB03-016")])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "hiyori" });
    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p1.trash)).toContain("hiyori");
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(activations(game)).toEqual([]);
  });
});
