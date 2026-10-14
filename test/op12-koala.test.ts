import { describe, expect, it } from "vitest";
import { effectiveCost, hasKeyword } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The (Black/Yellow) Koala feature deck, played through its own list.
 *
 * The Leader, Hack, Sabo, Belo Betty, Morley, Kuma and Hair Removal Fist were
 * already covered elsewhere. What this file adds is the rest of the fifty's
 * printed clauses, each behind OP12-081, and the line Bandai's write-up builds
 * the deck around: 4-cost {Revolutionary Army} bodies that count as 8 for the
 * Leader's draw.
 */
const DECK = "(Black/Yellow) Koala - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP12-081");

type Game = ReturnType<ReturnType<typeof table>["build"]>;

/** Answer every open prompt with the first of `preferred` offered, else the first offer. */
function answer(game: Game, ...preferred: string[]): void {
  while (game.state.pendingEffect) {
    const options = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect");
    const wanted =
      preferred
        .map((id) =>
          options.find(
            (action) => (action as { optionId?: string }).optionId === id,
          ),
        )
        .find(Boolean) ?? options[0]!;
    game.submit(wanted);
  }
}

/** The `resolve-effect` option ids open right now. */
const offered = (game: Game) =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId?: string }).optionId);

/**
 * Take the apply branch of an `optional` prompt, if one is open: the engine
 * elides the prompt where applying and declining are indistinguishable.
 */
const applyOptional = (game: Game) => {
  if (offered(game).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/** Decline the block and Counter steps, so a declared attack resolves. */
const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const costOf = (game: Game, id: string) =>
  effectiveCost(
    game.state,
    "p1",
    game.state.players.p1.board.find((card) => card.instanceId === id)!,
  );

const opponentHand = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`their-${index}`, "ST32-004"),
  );

describe("OP12-081 Koala: two 4-cost bodies count as 8 for the Leader's draw", () => {
  it("draws off Morley and Lindbergh, each played at 4 and counted at 8", () => {
    const game = table("op12-koala-line")
      .withBoard("p1", [
        character("morley", "OP12-093"),
        character("lindbergh", "OP12-095"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP12-083")])
      .build();

    expect(costOf(game, "morley")).toBe(8);
    expect(costOf(game, "lindbergh")).toBe(8);

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toContain("drawn");
  });

  it("does not draw with one 8-cost body and a 5-cost Inazuma", () => {
    const game = table("op12-koala-line-short")
      .withBoard("p1", [
        character("morley", "OP12-093"),
        character("inazuma", "OP12-083"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP12-083")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    answer(game);

    expect(ids(game.state.players.p1.hand)).not.toContain("drawn");
  });
});

describe("OP12-085 Karasu", () => {
  covers("OP12-085", "static", "[When Attacking]");

  it("is cost 8 behind a {Revolutionary Army} Leader and 5 behind another", () => {
    const behind = table("op12-085-cost").withBoard("p1", [
      character("karasu", "OP12-085"),
    ]);
    expect(costOf(behind.build(), "karasu")).toBe(8);

    const other = behind.withLeader("p1", "OP14-080").build();
    expect(costOf(other, "karasu")).toBe(5);
  });

  it("makes an opponent holding 5 cards trash 1 when it attacks", () => {
    const game = table("op12-085-attack")
      .withBoard("p1", [character("karasu", "OP12-085")])
      .withHand("p2", opponentHand(5))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "karasu",
      targetInstanceId: "p2-leader",
    });
    answer(game);

    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(game.state.players.p2.trash).toHaveLength(1);
  });

  it("leaves an opponent holding 4 cards alone", () => {
    const game = table("op12-085-attack-short")
      .withBoard("p1", [character("karasu", "OP12-085")])
      .withHand("p2", opponentHand(4))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "karasu",
      targetInstanceId: "p2-leader",
    });
    answer(game);

    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(game.state.players.p2.trash).toHaveLength(0);
  });
});

describe("OP12-086 Koala", () => {
  covers("OP12-086", "[On Play]");

  it("finds a Nico Robin or a {Revolutionary Army} card, never a second Koala, and trashes the rest", () => {
    const game = table("op12-086")
      .withHand("p1", [instance("koala", "OP12-086")])
      .withDeckTop("p1", [
        instance("other-koala", "OP12-086"),
        instance("robin", "OP12-087"),
        instance("morley", "OP12-093"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-086" });

    expect(offered(game)).toEqual(expect.arrayContaining(["robin", "morley"]));
    expect(offered(game)).not.toContain("other-koala");

    answer(game, "robin");

    expect(ids(game.state.players.p1.hand)).toEqual(["robin"]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["other-koala", "morley"]),
    );
  });
});

describe("OP12-087 Nico Robin", () => {
  covers("OP12-087", "static", "[On Play]");

  it("is a cost-9 [Blocker] behind Koala, and a cost-6 non-Blocker behind another Leader", () => {
    const behind = table("op12-087-static").withBoard("p1", [
      character("robin", "OP12-087"),
    ]);
    const game = behind.build();
    expect(costOf(game, "robin")).toBe(9);
    expect(hasKeyword(game.state, "p1", "robin", "Blocker")).toBe(true);

    const other = behind.withLeader("p1", "OP14-080").build();
    expect(costOf(other, "robin")).toBe(6);
    expect(hasKeyword(other.state, "p1", "robin", "Blocker")).toBe(false);
  });

  it("trashes a card from hand to make an opponent holding 5 trash 2", () => {
    const game = table("op12-087-play")
      .withHand("p1", [
        instance("robin", "OP12-087"),
        instance("pitched", "OP12-083"),
      ])
      .withHand("p2", opponentHand(5))
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-087" });
    answer(game, "apply", "pitched");

    expect(ids(game.state.players.p1.trash)).toEqual(["pitched"]);
    expect(game.state.players.p2.hand).toHaveLength(3);
    expect(game.state.players.p2.trash).toHaveLength(2);
  });
});

describe("OP12-094 Monkey.D.Dragon", () => {
  covers("OP12-094", "[On Play]");

  it("puts three {Revolutionary Army} cards from the trash under the deck and plays Kuma back", () => {
    const game = table("op12-094")
      .withHand("p1", [instance("dragon", "OP12-094")])
      .withTrash("p1", [
        instance("ra-a", "OP12-093"),
        instance("ra-b", "OP12-095"),
        instance("ra-c", "OP12-083"),
        instance("kuma", "OP12-119"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-094" });
    applyOptional(game);
    for (const paid of ["ra-a", "ra-b", "ra-c"]) {
      game.play({ type: "resolve-effect", optionId: paid });
    }
    game.play({ type: "resolve-effect", optionId: "kuma" });
    // Kuma's own [On Play] is optional too; leave it unpaid.
    answer(game, "skip");

    expect(ids(game.state.players.p1.board)).toEqual(["dragon", "kuma"]);
    expect(ids(game.state.players.p1.deck.slice(-3))).toEqual(
      expect.arrayContaining(["ra-a", "ra-b", "ra-c"]),
    );
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("cannot pay from a trash holding two {Revolutionary Army} cards", () => {
    const game = table("op12-094-short")
      .withHand("p1", [instance("dragon", "OP12-094")])
      .withTrash("p1", [
        instance("ra-a", "OP12-093"),
        instance("robin", "OP12-087"),
        instance("ra-b", "OP12-095"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-094" });
    answer(game);

    // Robin is not {Revolutionary Army}, so the cost is short and nothing comes back.
    expect(ids(game.state.players.p1.board)).toEqual(["dragon"]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["ra-a", "robin", "ra-b"]),
    );
  });
});

describe("OP12-095 Lindbergh", () => {
  covers("OP12-095", "static", "[On Play]");

  it("is cost 8 behind a {Revolutionary Army} Leader and 4 behind another", () => {
    const behind = table("op12-095-cost").withBoard("p1", [
      character("lindbergh", "OP12-095"),
    ]);
    expect(costOf(behind.build(), "lindbergh")).toBe(8);
    expect(
      costOf(behind.withLeader("p1", "OP14-080").build(), "lindbergh"),
    ).toBe(4);
  });

  it("draws 1 and then trashes 1 from hand", () => {
    const game = table("op12-095-play")
      .withHand("p1", [
        instance("lindbergh", "OP12-095"),
        instance("kept", "OP12-083"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP12-093")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-095" });
    expect(offered(game)).toEqual(expect.arrayContaining(["kept", "drawn"]));
    game.play({ type: "resolve-effect", optionId: "kept" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["kept"]);
  });
});

describe("OP12-097 Captains Assembled", () => {
  covers("OP12-097", "[Main]", "[Trigger]");

  const top = [
    instance("other-captains", "OP12-097"),
    instance("morley", "OP12-093"),
    instance("zoro", "ST32-004"),
  ];

  it("finds a {Revolutionary Army} card other than Captains Assembled and trashes the rest", () => {
    const game = table("op12-097-main")
      .withHand("p1", [instance("captains", "OP12-097")])
      .withDeckTop("p1", top)
      .build();

    game.play({
      type: "activate-main",
      optionId: "mechanic-event:captains",
    });
    expect(offered(game)).toContain("morley");
    expect(offered(game)).not.toContain("other-captains");
    expect(offered(game)).not.toContain("zoro");
    answer(game, "morley");

    expect(ids(game.state.players.p1.hand)).toEqual(["morley"]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["captains", "other-captains", "zoro"]),
    );
  });

  it("runs the same look off a Life card", () => {
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("op12-097-trigger")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withLeader("p1", "OP12-081")
      .withLife("p1", [instance("life-captains", "OP12-097")])
      .withDeckTop("p1", top)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game, "morley");

    expect(ids(game.state.players.p1.hand)).toEqual(["morley"]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["other-captains", "zoro"]),
    );
  });
});
