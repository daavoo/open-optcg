import { describe, expect, it } from "vitest";
import { hasKeyword } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * The bugs a card-by-card review of OP-18 found before the pre-release, one
 * block each. Most are where a card meets a general rule rather than a
 * misread clause: a "cannot be rested" effect against a cost paid by resting,
 * a `[DON!! xN]` short of its count, a card that leaves the field and comes
 * back, a hidden zone named in an option's label.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1's own Main Phase on a bare table, every DON!! it has active. */
const ownTurn = (seed: string, turn = 11) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(turn, { active: "p1" })
    .bareTable()
    .withLife("p1", copies(3, "OP18-035", "p1-life"))
    .withLife("p2", copies(3, "OP18-035", "p2-life"))
    .withDeckTop("p1", copies(6, "OP18-035", "p1-deck"))
    .withDeckTop("p2", copies(6, "OP18-035", "p2-deck"));

/** p2's Main Phase on a bare table: p1 answers. */
const theirTurn = (seed: string, turn = 12) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(turn, { active: "p2" })
    .bareTable()
    .withLife("p1", copies(3, "OP18-035", "p1-life"))
    .withLife("p2", copies(3, "OP18-035", "p2-life"))
    .withDeckTop("p1", copies(6, "OP18-035", "p1-deck"))
    .withDeckTop("p2", copies(6, "OP18-035", "p2-deck"));

function offers(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId: string }).optionId);
}

function offer(game: Game, optionId: string) {
  const action = game
    .legalActions()
    .find(
      (candidate) =>
        candidate.type === "resolve-effect" &&
        (candidate as { optionId: string }).optionId === optionId,
    );
  if (!action)
    throw new Error(`${optionId} not offered: ${offers(game).join(", ")}`);
  return action as typeof action & {
    summary: string;
    optionCardNumber?: string;
    option?: { kind: string; position?: string };
  };
}

/** Answers with the first of `preferred` on offer, else the first offer. */
function settle(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 30) throw new Error("the effect never settled");
    const optionId = preferred.find((id) => offers(game).includes(id));
    game.play(
      optionId === undefined
        ? { type: "resolve-effect" }
        : { type: "resolve-effect", optionId },
    );
  }
}

function finishBattle(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the battle never ended");
    game.pass();
  }
}

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);
const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

/** p2 plays OP18-027 Zoro & Sogeking and locks `target` against resting. */
function lockAgainstResting(game: Game, target: string): void {
  game.play({ type: "play-card", cardNumber: "OP18-027" });
  settle(game, target);
  expect(boardCard(game, "p1", target)?.cannotRestUntilTurn).toBe(
    game.state.turn + 1,
  );
}

describe("a cost paid by resting cannot be paid under 'cannot be rested'", () => {
  covers("OP18-031", "[Opponent's Turn]");
  covers("OP18-069", "static");
  covers("OP18-028", "[Activate: Main]");

  it("OP18-031 Nico Robin offers no save while she cannot be rested", () => {
    // Her rest would change nothing, so the save came free and she stayed
    // active to pay for every removal that turn.
    const game = theirTurn("review-robin-locked")
      .withHand("p2", [
        instance("zoro", "OP18-027"),
        instance("flambe", "OP18-040"),
      ])
      .withBoard("p1", [
        character("robin", "OP18-031"),
        character("nami", "OP18-030", { rested: true }),
      ])
      .build();
    lockAgainstResting(game, "robin");

    game.play({ type: "activate-main", summary: "[OP18-040]" });
    settle(game, "nami");

    expect(ids(game.state.players.p1.board)).toEqual(["robin"]);
    expect(boardCard(game, "p1", "robin")?.rested).toBe(false);
  });

  it("OP18-069 Sodomu & Gomora offers no save while it cannot be rested", () => {
    const game = theirTurn("review-sodomu-locked")
      .withHand("p2", [
        instance("zoro", "OP18-027"),
        instance("flambe", "OP18-040"),
      ])
      .withBoard("p1", [
        character("sodomu", "OP18-069"),
        character("zambai", "OP18-066", { rested: true }),
      ])
      .build();
    lockAgainstResting(game, "sodomu");

    game.play({ type: "activate-main", summary: "[OP18-040]" });
    game.play({ type: "resolve-effect", optionId: "zambai" });

    expect(offers(game).filter((id) => id.includes("sodomu"))).toHaveLength(0);
    settle(game);
    expect(ids(game.state.players.p1.board)).toEqual(["sodomu"]);
  });

  it("OP18-028 Chimney cannot rest a Gonbe that cannot be rested", () => {
    const game = theirTurn("review-chimney-locked", 4)
      .withDon("p2", { active: 5 })
      .withHand("p2", [instance("zoro", "OP18-027")])
      .withLeader("p1", "OP18-022")
      .withBoard("p1", [
        character("chimney", "OP18-028"),
        character("gonbe", "OP18-025"),
      ])
      .build();
    lockAgainstResting(game, "gonbe");
    game.pass();
    settle(game);
    expect(boardCard(game, "p1", "gonbe")?.cannotRestUntilTurn).toBe(
      game.state.turn,
    );
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    finishBattle(game);
    expect(game.state.players.p1.leaderRested).toBe(true);

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "OP18-028",
        ),
    ).toBe(false);
  });
});

describe("OP18-022 Monkey.D.Luffy (Leader) [DON!! x3]", () => {
  covers("OP18-022", "[When Attacking]");

  it("keeps its [Once Per Turn] when it first attacks with fewer than 3 DON!!", () => {
    // The [DON!! x3] is the clause's activation condition: unmet, the clause
    // never activated, so the second attack -- after Chimney sets the Leader
    // active and a third DON!! is given -- still offers the restand.
    const game = ownTurn("review-luffy-donx3", 5)
      .withLeader("p1", "OP18-022")
      .withGivenDon("p1", "p1-leader", 2)
      .withDon("p1", { active: 1 })
      .withBoard("p1", [
        character("chimney", "OP18-028"),
        character("gonbe", "OP18-025"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
    finishBattle(game);
    game.play({ type: "activate-main", summary: "[OP18-028]" });
    settle(game, "gonbe");
    expect(game.state.players.p1.leaderRested).toBe(false);
    game.play(
      (action) =>
        action.type === "attach-don" &&
        (action as { targetInstanceId: string }).targetInstanceId ===
          "p1-leader",
    );
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(3);

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    expect(offers(game)).toContain("apply");
  });
});

describe("OP18-119 Saint Shamrock played back by its own [On K.O.]", () => {
  covers("OP18-119", "[Activate: Main]");

  it("is a new card, with its [Once Per Turn] unspent", () => {
    const game = scenario()
      .decks(P1, P2)
      .seed("review-shamrock-reentry")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", copies(1, "ST32-004", "hand"))
      .withLife("p2", copies(3, "ST32-004", "p2-life"))
      .withBoard("p1", [
        character("hakuba", "OP05-087"),
        character("shamrock", "OP18-119", { playedTurn: 11 }),
      ])
      .withTrash("p1", [
        instance("cerberus", "OP18-085"),
        instance("gunko", "OP18-084"),
      ])
      .withGivenDon("p1", "hakuba", 1)
      .build();
    const shamrockActivation = () =>
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "OP18-119",
        );

    game.play({ type: "activate-main", summary: "[OP18-119]" });
    settle(game, "cerberus");
    expect(shamrockActivation()).toBe(false);

    // OP05-087 Hakuba K.O.s one of its controller's own Characters as it
    // attacks; Shamrock's [On K.O.] trashes a card and plays it back.
    game.play({
      type: "attack",
      attackerInstanceId: "hakuba",
      targetInstanceId: "p2-leader",
    });
    settle(game, "apply", "shamrock", "hand-1");
    finishBattle(game);
    settle(game);

    expect(ids(game.state.players.p1.board)).toContain("shamrock");
    expect(ids(game.state.players.p1.trash)).toContain("hand-1");
    expect(shamrockActivation()).toBe(true);
  });
});

describe("OP18-074 [Trigger] DON!! −1", () => {
  covers("OP18-074", "[Trigger]");

  it("asks nothing more once the Trigger is activated", () => {
    // Activating is the decision to pay: a second apply/skip had a "skip"
    // that trashed the card with nothing resolved.
    const game = theirTurn("review-074-trigger")
      .withLife("p1", [instance("ship", "OP18-074")])
      .withTrash("p1", [instance("sunny", "OP18-075")])
      .withBoard("p2", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    finishBattle(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });

    expect(offers(game)).not.toContain("apply");
    settle(game, "sunny");
    expect(ids(game.state.players.p1.hand)).toEqual(["sunny"]);
    expect(ids(game.state.players.p1.trash)).toContain("ship");
  });
});

describe("hidden zones in option labels", () => {
  covers("OP18-079", "[Activate: Main]");
  covers("OP18-113", "[On Play]");

  it("OP18-079 Spandam names the top card of the deck by its place", () => {
    const game = ownTurn("review-079-deck-top-label")
      .withLeader("p1", "OP18-079")
      .withHand("p1", [instance("hand-0", "OP18-102")])
      .withDeckTop("p1", [instance("deck-top", "OP18-113")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    const pick = offer(game, "deck-top");

    expect(pick.summary).toBe("Choose the top card of your deck");
    expect(pick.optionCardNumber).toBeUndefined();
    expect(pick.option).toEqual({ kind: "position", position: "top" });
  });

  it("OP18-113 Rob Lucci calls the opponent's Life theirs, and hides it", () => {
    const game = ownTurn("review-113-life")
      .withHand("p1", [instance("lucci", "OP18-113")])
      .withLife("p2", [
        instance("opp-life", "OP18-115"),
        instance("opp-life-2", "OP18-035"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP18-113" });
    const pick = offer(game, "opp-life");

    expect(pick.summary).toBe("Choose your opponent's top Life card");
    expect(pick.optionCardNumber).toBeUndefined();
    expect(pick.option).toEqual({ kind: "position", position: "top" });
  });
});

describe("OP18-004 Karoo on the opponent's turn", () => {
  covers("OP18-004", "static");

  it("reads its power without the DON!! given to it", () => {
    // Given DON!! add power on their controller's turn only, so a 4000 Karoo
    // with three of them is still 4000 while the opponent attacks.
    const game = theirTurn("review-004-opponent-turn")
      .withBoard("p1", [character("karoo", "OP18-004")])
      .withGivenDon("p1", "karoo", 3)
      .build();

    for (const keyword of ["Rush", "Banish", "Unblockable"] as const) {
      expect(hasKeyword(game.state, "p1", "karoo", keyword)).toBe(false);
    }
  });
});

describe("[End of Your Turn] clauses of different cards", () => {
  covers("OP18-033", "[End of Your Turn]");
  covers("OP18-025", "[End of Your Turn]");

  it("let their controller choose which resolves first", () => {
    // Gonbe first sets the rested Leader active; Banban first would set Gonbe
    // active and switch Gonbe's "if this Character is rested" off.
    const game = ownTurn("review-end-of-turn-order", 5)
      .withLeader("p1", "OP18-022")
      .withBoard("p1", [
        character("banban", "OP18-033"),
        character("gonbe", "OP18-025", { rested: true }),
      ])
      .withRestedLeader("p1")
      .build();

    game.pass();
    expect(offers(game)).toEqual(
      expect.arrayContaining(["reaction:banban", "reaction:gonbe"]),
    );
    game.play({ type: "resolve-effect", optionId: "reaction:gonbe" });
    settle(game, "skip");

    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(game.state.turnPlayerId).toBe("p2");
  });
});
