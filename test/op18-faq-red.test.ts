import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's OP-18 Q&A for the red cards, one case per ruling. The cards'
 * ordinary behaviour is in `op18-red.test.ts`; these pin the corner each
 * ruling settles. Q1504 (all three Karoo keywords at 7000) and Q1505 (a lone
 * Kung Fu Jugon counts itself) are pinned there already.
 *
 * SEALED-LUFFY is the pool's one Leader treated as having every card name,
 * type and attribute, which Q1506 and Q1507 are about.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase, with ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" });

/** p2 acting, for the clauses that open on p1's opponent's turn. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" });

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const power = (game: Game, player: "p1" | "p2", instanceId: string) =>
  currentPower(game.state, player, instanceId);

/** p1 defending, with p2's 6000 attacker swinging at the p1 Leader. */
const counterStep = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withBoard("p2", [character("attacker", "ST31-002")]);

const openAttack = (builder: ReturnType<typeof counterStep>) =>
  builder.withActiveAttack(
    {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
      attackPower: 6000,
      counterPower: 0,
    },
    "counter",
  );

describe("OP18-001 Karoo (Leader)", () => {
  covers("OP18-001", "static");

  it("Q1503: two {Alabasta} Characters K.O.'d at once draws only one card", () => {
    const game = defending("faq-q1503")
      .withLeader("p1", "OP18-001")
      .withBoard("p1", [
        character("igaram", "OP18-002"),
        character("igaram-2", "OP18-002"),
      ])
      .withHand("p2", [instance("rakuyo", "OP17-016")])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    // OP17-016 Rakuyo: K.O. up to 2 Characters with 2000 base power or less.
    game.play({ type: "play-card", cardNumber: "OP17-016" });
    pick(game, "igaram");
    pick(game, "igaram-2");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["igaram", "igaram-2"]),
    );
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });
});

describe("OP18-005 Kung Fu Jugon", () => {
  covers("OP18-005", "[Your Turn]");

  it("Q1506: a Leader with every card name counts as a [Kung Fu Jugon]", () => {
    const one = table("faq-q1506-one")
      .withLeader("p1", "SEALED-LUFFY")
      .withBoard("p1", [character("jugon", "OP18-005")])
      .build();
    expect(power(one, "p1", "jugon")).toBe(2000);

    const two = table("faq-q1506-two")
      .withLeader("p1", "SEALED-LUFFY")
      .withBoard("p1", [
        character("jugon", "OP18-005"),
        character("jugon-2", "OP18-005"),
      ])
      .build();
    expect(power(two, "p1", "jugon")).toBe(3000);
  });
});

describe("OP18-006 Koza", () => {
  covers("OP18-006", "static");

  it("Q1507: a Leader with every card name is a [Nefeltari Vivi]: [Rush] and +1000", () => {
    const game = table("faq-q1507")
      .withLeader("p1", "SEALED-LUFFY")
      .withBoard("p1", [character("koza", "OP18-006", { playedTurn: 11 })])
      .build();

    expect(power(game, "p1", "koza")).toBe(5000);
    expect(hasKeyword(game.state, "p1", "koza", "Rush")).toBe(true);
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "koza",
        ),
    ).toBe(true);
  });
});

describe("OP18-015 Eyelashes", () => {
  covers("OP18-015", "[On Your Opponent's Attack]");

  it("Q1508: the −3000 may go to a Character that is not the attacker", () => {
    const game = defending("faq-q1508")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("eyelashes", "OP18-015")])
      .withBoard("p2", [
        character("attacker", "ST31-002"),
        character("bystander", "ST31-002"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    pick(game, "apply");
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["attacker", "bystander", "p2-leader"]),
    );
    pick(game, "bystander");
    settle(game);

    expect(power(game, "p2", "bystander")).toBe(3000);
    expect(power(game, "p2", "attacker")).toBe(6000);
  });
});

describe("OP18-017 Roronoa Zoro", () => {
  covers("OP18-017", "static");

  it("Q1509: guards itself against an opponent's effect", () => {
    const game = defending("faq-q1509")
      .withBoard("p1", [character("zoro", "OP18-017")])
      .withHand("p2", [instance("water-stream", "OP06-019")])
      .build();

    // OP06-019: K.O. up to 1 Character with 5000 power or less.
    game.play({ type: "activate-main", sourceInstanceId: "water-stream" });
    pick(game, "zoro");
    // Zoro is both the Character the K.O. names and the replacement's source.
    expect(effectOptions(game.state)).toEqual(["ko:zoro", "replace:zoro"]);
    pick(game, "replace:zoro");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["zoro"]);
    expect(power(game, "p1", "p1-leader")).toBe(3000);
  });
});

describe("OP18-018 Let's Go, Karoo!!", () => {
  covers("OP18-018", "[Main]");

  it("Q1510: an {Alabasta} Character played after it resolves gets no +1000", () => {
    const game = table("faq-q1510")
      .withBoard("p1", [character("igaram", "OP18-002")])
      .withHand("p1", [
        instance("event", "OP18-018"),
        instance("karoo", "OP18-004"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "event" });
    settle(game);
    game.play({ type: "play-card", cardNumber: "OP18-004" });
    settle(game);

    expect(power(game, "p1", "igaram")).toBe(3000);
    expect(ids(game.state.players.p1.board)).toContain("karoo");
    expect(power(game, "p1", "karoo")).toBe(4000);
  });
});

describe("OP18-019 Quack!!!", () => {
  covers("OP18-019", "[Main]");

  it("Q1511: with no Characters of your own the −3000 still applies", () => {
    const game = table("faq-q1511")
      .withBoard("p1", [])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .withHand("p1", [instance("event", "OP18-019")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "event" });
    pick(game, "jinbe");
    settle(game);
    expect(power(game, "p2", "jinbe")).toBe(3000);
  });
});

describe("OP18-020 Stop Fighting!!!", () => {
  covers("OP18-020", "[Counter]");

  it("Q1512: with 0 Life the cost cannot be paid, so there is no −5000", () => {
    const game = openAttack(
      counterStep("faq-q1512")
        .withLeader("p1", "EB03-001")
        .withLife("p1", 0)
        .withHand("p1", [instance("event", "OP18-020")]),
    ).build();

    const offered = game
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "activate-counter-event" &&
          (action as { eventInstanceId?: string }).eventInstanceId === "event",
      );
    if (offered) {
      game.play({ type: "activate-counter-event", eventInstanceId: "event" });
      expect(effectOptions(game.state)).not.toContain("apply");
      settle(game);
    }

    expect(power(game, "p2", "attacker")).toBe(6000);
    expect(power(game, "p2", "p2-leader")).toBe(5000);
  });
});
