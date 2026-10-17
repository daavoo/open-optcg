import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * One scenario per printed clause of twenty OP10 cards that were registered
 * with no test claiming them. Each case drives the engine to the decision the
 * clause opens, through public actions, and asserts on what it moved; the
 * printed wording is `pnpm card:text <card>`.
 *
 * Fodder is vanilla wherever the clause allows it -- OP12-082 Issho,
 * EB01-005 Doma, OP05-083 Sterry, EB01-025 Fourtricks, EB02-034 Komei,
 * EB01-018 Mountain God, OP06-094 Lola -- so nothing but the card under test
 * has text that could move the result.
 */

const DECKS = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
] as const;

/** p1's turn 11, clear board, all ten DON!! active on both sides. */
const table = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2's turn, clear board: p1 is the defending seat. */
const theirTurn = (seed: string) =>
  scenario()
    .decks(...DECKS)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

type Game = ReturnType<ReturnType<typeof table>["build"]>;

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const onBoard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

const vanillaLife = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`${prefix}-${index + 1}`, "OP12-082"),
  );

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Settles the pending effect, taking each of `preferred` when it is offered. */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("the effect never settled");
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

/** Passes the Block and Counter steps so a declared attack resolves. */
function undefended(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
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

const activation =
  (source: string) =>
  (action: { type: string }): boolean =>
    action.type === "activate-main" &&
    (action as { sourceInstanceId?: string }).sourceInstanceId === source;

const canAttackWith = (game: Game, attacker: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" &&
        (action as { attackerInstanceId?: string }).attackerInstanceId ===
          attacker,
    );

const canBlockWith = (game: Game, blocker: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "block" &&
        (action as { blockerInstanceId?: string }).blockerInstanceId ===
          blocker,
    );

describe("OP10-053 Bian", () => {
  covers("OP10-053", "static");

  const bian = (seed: string, partner: string | null) =>
    theirTurn(seed)
      .withBoard("p1", [
        character("bian", "OP10-053"),
        ...(partner ? [character("partner", partner)] : []),
      ])
      .withBoard("p2", [character("attacker", "EB01-018")])
      .build();

  it("blocks beside another {The Tontattas} Character", () => {
    const game = bian("op10-053", "OP10-044"); // Cub
    expect(hasKeyword(game.state, "p1", "bian", "Blocker")).toBe(true);

    attack(game, "attacker", "p1-leader");
    expect(canBlockWith(game, "bian")).toBe(true);
    game.play({ type: "block", blockerInstanceId: "bian" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("bian");
  });

  it("has no [Blocker] alone, beside another Bian, or beside a non-Tontattas", () => {
    for (const [seed, partner] of [
      ["op10-053-alone", null],
      ["op10-053-twin", "OP10-053"],
      ["op10-053-other", "OP12-082"], // {Dressrosa}, not {The Tontattas}
    ] as const) {
      const game = bian(seed, partner);
      expect(hasKeyword(game.state, "p1", "bian", "Blocker")).toBe(false);
      attack(game, "attacker", "p1-leader");
      expect(canBlockWith(game, "bian")).toBe(false);
    }
  });
});

describe("OP10-056 Mansherry", () => {
  covers("OP10-056", "[On Play]");

  it("rests the {Dressrosa} Leader and returns a 4+ cost {Dressrosa} body to bounce a cost-4", () => {
    const game = table("op10-056")
      .withLeader("p1", "EB01-040") // Kyros, {Dressrosa}
      .withHand("p1", [instance("mansherry", "OP10-056")])
      .withBoard("p1", [character("issho", "OP12-082")]) // {Dressrosa}, 8
      .withBoard("p2", [
        character("komei", "EB02-034"), // cost 4
        character("god", "EB01-018"), // cost 5
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-056" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    // Mansherry herself costs 2, so only Issho pays the return.
    expect(effectOptions(game.state)).toEqual(["issho"]);
    game.play({ type: "resolve-effect", optionId: "issho" });
    expect(effectOptions(game.state)).toEqual(["komei", "done"]);
    game.play({ type: "resolve-effect", optionId: "komei" });
    answer(game);

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(ids(game.state.players.p1.hand)).toEqual(["issho"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["komei"]);
    expect(ids(game.state.players.p2.board)).toEqual(["god"]);
  });

  it("rests nothing and bounces nothing without a 4+ cost {Dressrosa} Character", () => {
    const game = table("op10-056-gate")
      .withLeader("p1", "EB01-040")
      .withHand("p1", [instance("mansherry", "OP10-056")])
      .withBoard("p1", [character("cub", "OP10-044")]) // {Dressrosa}, 1
      .withBoard("p2", [character("komei", "EB02-034")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-056" });
    answer(game, "apply", "p1-leader");

    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(ids(game.state.players.p1.board).sort()).toEqual([
      "cub",
      "mansherry",
    ]);
    expect(ids(game.state.players.p2.board)).toEqual(["komei"]);
  });
});

describe("OP10-061 Special Long-Range Attack!! Bagworm", () => {
  covers("OP10-061", "[Main]", "[Trigger]");

  it("draws 1, then returns one of the opponent's cost-2 Characters", () => {
    const game = table("op10-061-main")
      .withHand("p1", [instance("bagworm", "OP10-061")])
      .withBoard("p1", [character("mine", "EB01-005")]) // cost 1, not theirs
      .withBoard("p2", [
        character("sterry", "OP05-083"), // cost 2
        character("fourtricks", "EB01-025"), // cost 3
      ])
      .withDeckTop("p1", [instance("draw", "OP12-082")])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP10-061" });
    expect(effectOptions(game.state)).toEqual(["sterry", "done"]);
    game.play({ type: "resolve-effect", optionId: "sterry" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["draw"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["sterry"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["bagworm"]);
    expect(game.state.players.p1.restedDon).toHaveLength(3);
  });

  it("returns a cost-2 Character from either side off a Life card", () => {
    const game = theirTurn("op10-061-trigger")
      .withBoard("p1", [character("mine", "EB01-005")]) // cost 1
      .withBoard("p2", [
        character("attacker", "EB01-018"),
        character("sterry", "OP05-083"), // cost 2
        character("fourtricks", "EB01-025"), // cost 3
      ])
      .withLife("p1", [instance("life-bagworm", "OP10-061")])
      .build();
    attack(game, "attacker", "p1-leader");
    undefended(game);

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state).sort()).toEqual(
      ["done", "mine", "sterry"].sort(),
    );
    game.play({ type: "resolve-effect", optionId: "mine" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["mine"]);
    expect(game.state.players.p1.board).toEqual([]);
  });
});

describe("OP10-062 Violet", () => {
  covers("OP10-062", "[Blocker]", "[On K.O.]");

  const violet = (seed: string, leader: string) =>
    theirTurn(seed)
      .withLeader("p1", leader)
      .withBoard("p1", [character("violet", "OP10-062")])
      .withBoard("p2", [character("attacker", "EB01-018")]) // 7000
      .withTrash("p1", [
        instance("knife", "OP05-077"), // purple Event
        instance("yellow", "EB03-060"), // yellow Event
        instance("tonjit", "OP07-067"), // purple Character
      ])
      .build();

  it("blocks, and on K.O. pays DON!! −1 to add a purple Event behind a {Donquixote Pirates} Leader", () => {
    const game = violet("op10-062", "OP10-003"); // Sugar
    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "violet" });
    undefended(game);

    const donBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    game.play({ type: "resolve-effect", optionId: "apply" });
    answer(game, "knife");

    expect(ids(game.state.players.p1.hand)).toEqual(["knife"]);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(donBefore - 1);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "tonjit",
      "violet",
      "yellow",
    ]);
  });

  it("offers only purple Events", () => {
    const game = violet("op10-062-filter", "OP10-003");
    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "violet" });
    undefended(game);
    game.play({ type: "resolve-effect", optionId: "apply" });
    // DON!! −1 may itself ask which DON!! goes back; settle that first.
    let guard = 0;
    while (
      !effectOptions(game.state).includes("knife") &&
      game.state.pendingEffect &&
      guard++ < 5
    ) {
      game.submit(
        game.legalActions().find((a) => a.type === "resolve-effect")!,
      );
    }
    expect(effectOptions(game.state)).toEqual(["knife", "done"]);
  });

  it("adds nothing behind another Leader", () => {
    const game = violet("op10-062-gate", "EB01-040");
    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "violet" });
    undefended(game);
    answer(game, "apply", "knife");

    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toContain("knife");
  });
});

describe("OP10-069 Fighting Fish", () => {
  covers("OP10-069", "[When Attacking]");

  it("with a DON!! given, returns 1 DON!! to K.O. a cost-1 Character", () => {
    const game = table("op10-069")
      .withBoard("p1", [character("fish", "OP10-069")])
      .withGivenDon("p1", "fish", 1)
      .withBoard("p2", [
        character("doma", "EB01-005"), // cost 1
        character("sterry", "OP05-083"), // cost 2
      ])
      .withLife("p2", vanillaLife("p2-life", 2))
      .build();

    attack(game, "fish", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    // DON!! −1 asks where the DON!! comes from: the cost area, or the one
    // given to Fighting Fish.
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["return-don:active", "return-don:fish"]),
    );
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
    expect(effectOptions(game.state)).toEqual(["doma", "done"]);
    game.play({ type: "resolve-effect", optionId: "doma" });
    answer(game);

    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(ids(game.state.players.p2.trash)).toEqual(["doma"]);
    expect(onBoard(game, "p2", "sterry")).toBeDefined();
  });

  it("offers nothing with no DON!! given", () => {
    const game = table("op10-069-gate")
      .withBoard("p1", [character("fish", "OP10-069")])
      .withBoard("p2", [character("doma", "EB01-005")])
      .withLife("p2", vanillaLife("p2-life", 2))
      .build();

    attack(game, "fish", "p2-leader");

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(onBoard(game, "p2", "doma")).toBeDefined();
  });
});

describe("OP10-075 Foxy", () => {
  covers("OP10-075", "[Activate: Main]");

  it("trashes itself to draw 1 when its DON!! do not outnumber the opponent's", () => {
    const game = table("op10-075")
      .withBoard("p1", [character("foxy", "OP10-075")])
      .withDeckTop("p1", [instance("draw", "OP12-082")])
      .build();

    game.play(activation("foxy"));
    answer(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["foxy"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["draw"]);
  });

  it("is still trashed, but draws nothing, with more DON!! than the opponent", () => {
    const game = table("op10-075-gate")
      .withBoard("p1", [character("foxy", "OP10-075")])
      .withDonDeck("p2", 3)
      .withDeckTop("p1", [instance("draw", "OP12-082")])
      .build();

    game.play(activation("foxy"));
    answer(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["foxy"]);
    expect(game.state.players.p1.hand).toEqual([]);
  });
});

describe("OP10-081 Usopp", () => {
  covers("OP10-081", "[On Play]");

  it("rests the {Dressrosa} Leader to K.O. a cost-2, then trashes 2 off the deck", () => {
    const game = table("op10-081")
      .withLeader("p1", "EB01-040")
      .withHand("p1", [instance("usopp", "OP10-081")])
      .withBoard("p2", [
        character("sterry", "OP05-083"), // cost 2
        character("fourtricks", "EB01-025"), // cost 3
      ])
      .withDeckTop("p1", [
        instance("m1", "OP12-082"),
        instance("m2", "OP12-082"),
        instance("kept", "OP12-082"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-081" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    expect(effectOptions(game.state)).toEqual(["sterry", "done"]);
    game.play({ type: "resolve-effect", optionId: "sterry" });
    answer(game);

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(ids(game.state.players.p2.trash)).toEqual(["sterry"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["m1", "m2"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["kept"]);
  });

  it("declining rests nothing and mills nothing", () => {
    const game = table("op10-081-decline")
      .withLeader("p1", "EB01-040")
      .withHand("p1", [instance("usopp", "OP10-081")])
      .withBoard("p2", [character("sterry", "OP05-083")])
      .withDeckTop("p1", [instance("m1", "OP12-082")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-081" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    answer(game);

    expect(game.state.players.p1.leaderRested).toBe(false);
    expect(onBoard(game, "p2", "sterry")).toBeDefined();
    expect(ids(game.state.players.p1.deck)).toEqual(["m1"]);
  });
});

describe("OP10-085 Jesus Burgess", () => {
  covers("OP10-085", "static");

  const burgess = (seed: string, given: number, trash: number) => {
    let setup = table(seed)
      .withBoard("p1", [character("burgess", "OP10-085", { playedTurn: 11 })])
      .withTrash(
        "p1",
        Array.from({ length: trash }, (_, index) =>
          instance(`t${index}`, "OP12-082"),
        ),
      )
      .withLife("p2", vanillaLife("p2-life", 2));
    if (given > 0) setup = setup.withGivenDon("p1", "burgess", given);
    return setup.build();
  };

  it("attacks the turn it is played with a DON!! given and 8 cards in the trash", () => {
    const game = burgess("op10-085", 1, 8);
    expect(game.state.turn).toBe(11);
    expect(hasKeyword(game.state, "p1", "burgess", "Rush")).toBe(true);
    expect(canAttackWith(game, "burgess")).toBe(true);
  });

  it("has no [Rush] with 7 in the trash, or with no DON!! given", () => {
    for (const game of [
      burgess("op10-085-seven", 1, 7),
      burgess("op10-085-no-don", 0, 8),
    ]) {
      expect(hasKeyword(game.state, "p1", "burgess", "Rush")).toBe(false);
      expect(canAttackWith(game, "burgess")).toBe(false);
    }
  });
});

/** The rest-self-and-a-{Dressrosa}-Leader activation OP10-087/-088/-091 share. */
const dressrosaActivation = (
  seed: string,
  cardNumber: string,
  setup: (builder: ReturnType<typeof table>) => ReturnType<typeof table> = (
    builder,
  ) => builder,
) =>
  setup(
    table(seed)
      .withLeader("p1", "EB01-040")
      .withBoard("p1", [character("source", cardNumber)])
      .withDeckTop("p1", [
        instance("m1", "OP12-082"),
        instance("m2", "OP12-082"),
        instance("kept", "OP12-082"),
      ]),
  ).build();

describe("OP10-087 Tony Tony.Chopper", () => {
  covers("OP10-087", "[Activate: Main]");

  const hand = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      instance(`h${index}`, "OP12-082"),
    );

  it("against 5 cards in hand, the opponent trashes 1, then 2 are milled", () => {
    const game = dressrosaActivation("op10-087", "OP10-087", (builder) =>
      builder.withHand("p2", hand(5)),
    );

    game.play(activation("source"));
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    // The card leaves their hand, so they pick it.
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "h3" });
    answer(game);

    expect(onBoard(game, "p1", "source")?.rested).toBe(true);
    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(ids(game.state.players.p2.trash)).toEqual(["h3"]);
    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["m1", "m2"]);
  });

  it("against 4 cards in hand, nothing is trashed on either side", () => {
    const game = dressrosaActivation("op10-087-gate", "OP10-087", (builder) =>
      builder.withHand("p2", hand(4)),
    );

    game.play(activation("source"));
    answer(game, "apply", "p1-leader");

    expect(onBoard(game, "p1", "source")?.rested).toBe(true);
    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(game.state.players.p1.trash).toEqual([]);
  });

  it("is not offered once the Character is rested", () => {
    const game = dressrosaActivation("op10-087-rested", "OP10-087", (builder) =>
      builder.withBoard("p1", [
        character("source", "OP10-087", { rested: true }),
      ]),
    );
    expect(game.legalActions().some(activation("source"))).toBe(false);
  });
});

describe("OP10-088 Nami", () => {
  covers("OP10-088", "[Activate: Main]");

  it("rests itself and the {Dressrosa} Leader to draw 1, then mill 2", () => {
    const game = dressrosaActivation("op10-088", "OP10-088");

    game.play(activation("source"));
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    answer(game);

    expect(onBoard(game, "p1", "source")?.rested).toBe(true);
    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(ids(game.state.players.p1.hand)).toEqual(["m1"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["kept", "m2"]);
  });

  it("is not offered behind a Leader without {Dressrosa} and no Stage", () => {
    const game = table("op10-088-gate")
      .withLeader("p1", "OP07-001") // Dragon, {Revolutionary Army}
      .withBoard("p1", [character("source", "OP10-088")])
      .withDeckTop("p1", [instance("m1", "OP12-082")])
      .build();

    const offered = game.legalActions().find(activation("source"));
    if (offered) {
      game.submit(offered);
      answer(game, "apply");
    }
    expect(onBoard(game, "p1", "source")?.rested).toBe(false);
    expect(game.state.players.p1.hand).toEqual([]);
  });
});

describe("OP10-091 Brook", () => {
  covers("OP10-091", "[Activate: Main]");

  it("rests itself and a {Dressrosa} Stage to K.O. a cost-1, then mill 2", () => {
    const game = table("op10-091")
      .withRestedLeader("p1")
      .withStage("p1", instance("coliseum", "OP04-096")) // {Dressrosa} Stage
      .withBoard("p1", [character("source", "OP10-091")])
      .withBoard("p2", [
        character("doma", "EB01-005"), // cost 1
        character("sterry", "OP05-083"), // cost 2
      ])
      .withDeckTop("p1", [
        instance("m1", "OP12-082"),
        instance("m2", "OP12-082"),
        instance("kept", "OP12-082"),
      ])
      .build();

    game.play(activation("source"));
    // The rested Leader cannot pay; the Stage can.
    expect(effectOptions(game.state)).toEqual(["coliseum"]);
    game.play({ type: "resolve-effect", optionId: "coliseum" });
    expect(effectOptions(game.state)).toEqual(["doma", "done"]);
    game.play({ type: "resolve-effect", optionId: "doma" });
    answer(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(onBoard(game, "p1", "source")?.rested).toBe(true);
    expect(ids(game.state.players.p2.trash)).toEqual(["doma"]);
    expect(ids(game.state.players.p1.trash).sort()).toEqual(["m1", "m2"]);
  });
});

describe("OP10-092 Perona", () => {
  covers("OP10-092", "[Activate: Main]");

  it("puts 2 {Thriller Bark Pirates} cards under the deck for +2000 on another Character, once", () => {
    const game = table("op10-092")
      .withBoard("p1", [
        character("perona", "OP10-092"),
        character("perona-2", "OP10-092"),
        character("issho", "OP12-082"),
      ])
      .withTrash("p1", [
        instance("lola-1", "OP06-094"), // {Thriller Bark Pirates}
        instance("lola-2", "OP06-094"),
        instance("other", "OP12-082"),
      ])
      .withDeckTop("p1", [instance("top", "OP12-082")])
      .build();

    game.play(activation("perona"));
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "lola-1" });
    game.play({ type: "resolve-effect", optionId: "lola-2" });
    // Settle any confirmation of the pair before the buff target.
    let guard = 0;
    while (
      !effectOptions(game.state).includes("issho") &&
      game.state.pendingEffect &&
      guard++ < 5
    ) {
      game.submit(
        game.legalActions().find((a) => a.type === "resolve-effect")!,
      );
    }
    // "Other than [Perona]": neither copy is offered.
    expect(effectOptions(game.state)).toEqual(["issho", "done"]);
    game.play({ type: "resolve-effect", optionId: "issho" });
    answer(game);

    expect(currentPower(game.state, "p1", "issho")).toBe(12000);
    expect(ids(game.state.players.p1.trash)).toEqual(["other"]);
    expect(ids(game.state.players.p1.deck)[0]).toBe("top");
    expect(ids(game.state.players.p1.deck).slice(1).sort()).toEqual([
      "lola-1",
      "lola-2",
    ]);
    // [Once Per Turn].
    expect(game.legalActions().some(activation("perona"))).toBe(false);

    game.pass();
    expect(currentPower(game.state, "p1", "issho")).toBe(10000);
  });

  it("cannot pay with only one {Thriller Bark Pirates} card in the trash", () => {
    const game = table("op10-092-gate")
      .withBoard("p1", [
        character("perona", "OP10-092"),
        character("issho", "OP12-082"),
      ])
      .withTrash("p1", [
        instance("lola-1", "OP06-094"),
        instance("other", "OP12-082"),
      ])
      .build();

    const offered = game.legalActions().find(activation("perona"));
    if (offered) {
      game.submit(offered);
      answer(game, "apply", "lola-1", "issho");
    }
    expect(currentPower(game.state, "p1", "issho")).toBe(10000);
    expect(ids(game.state.players.p1.trash).sort()).toEqual([
      "lola-1",
      "other",
    ]);
  });
});

describe("OP10-093 Saint Homing", () => {
  covers("OP10-093", "[Activate: Main]");

  it("trashes itself to give a black Character +3 cost through the opponent's next turn", () => {
    const game = table("op10-093")
      .withBoard("p1", [
        character("homing", "OP10-093"),
        character("sterry", "OP05-083"), // black, cost 2
        character("doma", "EB01-005"), // red
      ])
      // Something to draw on each of the two turns this plays through.
      .withDeckTop("p1", [instance("p1-draw", "OP12-082")])
      .withDeckTop("p2", [instance("p2-draw", "OP12-082")])
      .build();
    const sterry = () => onBoard(game, "p1", "sterry")!;

    game.play(activation("homing"));
    expect(effectOptions(game.state)).toEqual(["sterry", "done"]);
    game.play({ type: "resolve-effect", optionId: "sterry" });
    answer(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["homing"]);
    expect(effectiveCost(game.state, "p1", sterry())).toBe(5);
    game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
    expect(effectiveCost(game.state, "p1", sterry())).toBe(5);
    game.pass();
    expect(game.state.turnPlayerId).toBe("p1");
    expect(effectiveCost(game.state, "p1", sterry())).toBe(2);
  });
});

describe("OP10-094 Ryuma", () => {
  covers("OP10-094", "static");

  const ryuma = (seed: string, given: number) => {
    let setup = table(seed)
      .withBoard("p1", [character("ryuma", "OP10-094")])
      .withLife("p2", vanillaLife("p2-life", 3));
    if (given > 0) setup = setup.withGivenDon("p1", "ryuma", given);
    const game = setup.build();
    attack(game, "ryuma", "p2-leader");
    undefended(game);
    answer(game);
    return game;
  };

  it("deals 2 damage with a DON!! given", () => {
    expect(ryuma("op10-094", 1).state.players.p2.life).toHaveLength(1);
  });

  it("deals 1 without", () => {
    expect(ryuma("op10-094-none", 0).state.players.p2.life).toHaveLength(2);
  });
});

describe("OP10-096 There's No Longer Any Need for the Seven Warlords of the Sea!!!", () => {
  covers("OP10-096", "[Main]", "[Trigger]");

  it("K.O.s a {The Seven Warlords of the Sea} Character of cost 8 or less", () => {
    const game = table("op10-096-main")
      .withHand("p1", [instance("warlords", "OP10-096")])
      .withBoard("p2", [
        character("mihawk", "OP07-044"), // Warlord, cost 8
        character("big", "OP14-119"), // Warlord, cost 9
        character("lola", "OP06-094"), // not a Warlord, cost 4
      ])
      .build();

    game.play({ type: "activate-main", sourceCardNumber: "OP10-096" });
    expect(effectOptions(game.state)).toEqual(["mihawk", "done"]);
    game.play({ type: "resolve-effect", optionId: "mihawk" });
    answer(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["mihawk"]);
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  it("K.O.s a cost-4 Warlord off a Life card", () => {
    const game = theirTurn("op10-096-trigger")
      .withBoard("p2", [
        character("attacker", "EB01-018"),
        character("moria", "OP07-083"), // Warlord, cost 4
        character("hancock", "EB04-027"), // Warlord, cost 5
      ])
      .withLife("p1", [instance("life-warlords", "OP10-096")])
      .build();
    attack(game, "attacker", "p1-leader");
    undefended(game);

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(effectOptions(game.state)).toEqual(["moria", "done"]);
    game.play({ type: "resolve-effect", optionId: "moria" });
    answer(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["moria"]);
  });
});

describe("OP10-100 Inazuma", () => {
  covers("OP10-100", "[When Attacking]", "[Trigger]");

  it("with a DON!! given, rests a Character up to the combined Life count", () => {
    const game = table("op10-100-attack")
      .withBoard("p1", [character("inazuma", "OP10-100")])
      .withGivenDon("p1", "inazuma", 1)
      .withLife("p1", vanillaLife("p1-life", 2))
      .withLife("p2", vanillaLife("p2-life", 2))
      .withBoard("p2", [
        character("komei", "EB02-034"), // cost 4
        character("god", "EB01-018"), // cost 5
      ])
      .build();

    attack(game, "inazuma", "p2-leader");
    expect(effectOptions(game.state)).toEqual(["komei", "done"]);
    game.play({ type: "resolve-effect", optionId: "komei" });
    answer(game);

    expect(onBoard(game, "p2", "komei")?.rested).toBe(true);
    expect(onBoard(game, "p2", "god")?.rested).toBe(false);
  });

  it("rests nothing with no DON!! given", () => {
    const game = table("op10-100-attack-gate")
      .withBoard("p1", [character("inazuma", "OP10-100")])
      .withLife("p2", vanillaLife("p2-life", 2))
      .withBoard("p2", [character("komei", "EB02-034")])
      .build();

    attack(game, "inazuma", "p2-leader");
    answer(game, "komei");

    expect(onBoard(game, "p2", "komei")?.rested).toBe(false);
  });

  const lifeHit = (seed: string, leader: string, theirLife: number) => {
    const game = theirTurn(seed)
      .withLeader("p1", leader)
      .withBoard("p2", [character("attacker", "EB01-018")])
      .withLife("p1", [
        instance("life-inazuma", "OP10-100"),
        instance("p1-life-2", "OP12-082"),
      ])
      .withLife("p2", vanillaLife("p2-life", theirLife))
      .build();
    attack(game, "attacker", "p1-leader");
    undefended(game);
    return game;
  };

  it("plays itself off a Life card behind a {Revolutionary Army} Leader at 5 Life or less in total", () => {
    // 1 left on p1's side once the Trigger card leaves, plus 4.
    const game = lifeHit("op10-100-trigger", "OP07-001", 4);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game);
    expect(onBoard(game, "p1", "life-inazuma")).toBeDefined();
    expect(game.state.players.p1.hand).toEqual([]);
  });

  it("is not played at 6 Life in total, or behind another Leader", () => {
    for (const game of [
      lifeHit("op10-100-trigger-six", "OP07-001", 5),
      lifeHit("op10-100-trigger-leader", "EB01-040", 2),
    ]) {
      // A Trigger whose condition fails would only trash the card, so the
      // engine offers the card to hand alone.
      expect(
        game
          .legalActions()
          .some(
            (action) =>
              action.type === "resolve-trigger" &&
              action.summary.includes("Activate Trigger"),
          ),
      ).toBe(false);
      answer(game);
      if (game.state.pendingTrigger) game.play({ type: "resolve-trigger" });
      expect(onBoard(game, "p1", "life-inazuma")).toBeUndefined();
      expect(ids(game.state.players.p1.hand)).toEqual(["life-inazuma"]);
    }
  });
});

describe("OP10-102 Emporio.Ivankov", () => {
  covers("OP10-102", "[Activate: Main]");

  it("gives up to 3 {Revolutionary Army} Characters +1000, then adds the top Life card to hand", () => {
    const game = table("op10-102")
      .withBoard("p1", [
        character("ivankov", "OP10-102"),
        character("hack", "OP05-012"), // {Revolutionary Army}
        character("issho", "OP12-082"), // not
      ])
      .withLife("p1", [
        instance("life-top", "OP12-082"),
        instance("life-under", "OP12-082"),
      ])
      .build();

    game.play(activation("ivankov"));
    expect(effectOptions(game.state)).not.toContain("issho");
    game.play({ type: "resolve-effect", optionId: "ivankov" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    answer(game);

    expect(currentPower(game.state, "p1", "ivankov")).toBe(7000);
    expect(currentPower(game.state, "p1", "hack")).toBe(6000);
    expect(currentPower(game.state, "p1", "issho")).toBe(10000);
    expect(ids(game.state.players.p1.hand)).toEqual(["life-top"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-under"]);
    // [Once Per Turn].
    expect(game.legalActions().some(activation("ivankov"))).toBe(false);
  });
});

describe("OP10-104 Caribou", () => {
  covers("OP10-104", "static");

  const caribou = (seed: string, leader: string, theirLife: number) => {
    const game = theirTurn(seed)
      .withLeader("p1", leader)
      .withBoard("p1", [character("caribou", "OP10-104", { rested: true })])
      .withGivenDon("p1", "caribou", 1)
      .withBoard("p2", [character("attacker", "EB02-001")]) // 7000
      .withLife("p2", vanillaLife("p2-life", theirLife))
      .build();
    attack(game, "attacker", "caribou");
    undefended(game);
    answer(game);
    return game;
  };

  it("survives losing a battle behind a {Supernovas} Leader while the opponent has 3 Life", () => {
    const game = caribou("op10-104", "OP12-020", 3);
    expect(onBoard(game, "p1", "caribou")).toBeDefined();
  });

  it("is K.O.'d with the opponent at 2 Life, or behind another Leader", () => {
    for (const game of [
      caribou("op10-104-life", "OP12-020", 2),
      caribou("op10-104-leader", "EB01-040", 3),
    ]) {
      expect(onBoard(game, "p1", "caribou")).toBeUndefined();
      expect(ids(game.state.players.p1.trash)).toContain("caribou");
    }
  });

  it("is K.O.'d with no DON!! given", () => {
    const game = theirTurn("op10-104-no-don")
      .withLeader("p1", "OP12-020")
      .withBoard("p1", [character("caribou", "OP10-104", { rested: true })])
      .withBoard("p2", [character("attacker", "EB02-001")])
      .withLife("p2", vanillaLife("p2-life", 3))
      .build();
    attack(game, "attacker", "caribou");
    undefended(game);
    answer(game);
    expect(onBoard(game, "p1", "caribou")).toBeUndefined();
  });
});

describe("OP10-107 Jewelry Bonney", () => {
  covers("OP10-107", "[Blocker]", "[On Play]");

  it("blocks", () => {
    const game = theirTurn("op10-107-blocker")
      .withBoard("p1", [character("bonney", "OP10-107")])
      .withBoard("p2", [character("attacker", "EB01-018")])
      .build();
    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "bonney" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("bonney");
  });

  it("takes a Life card to hand to bank a cost-5 {Supernovas} Character face-up on top", () => {
    const game = table("op10-107")
      .withHand("p1", [
        instance("bonney", "OP10-107"),
        instance("urouge", "OP10-101"), // {Supernovas}, 5
        instance("kid", "ST36-005"), // {Supernovas}, 6
      ])
      .withLife("p1", [
        instance("life-top", "OP12-082"),
        instance("life-bottom", "EB01-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-107" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "bottom" });
    game.play({ type: "resolve-effect", optionId: "life-bottom" });
    expect(effectOptions(game.state)).toEqual(["urouge", "done"]);
    game.play({ type: "resolve-effect", optionId: "urouge" });
    answer(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual([
      "kid",
      "life-bottom",
    ]);
    expect(ids(game.state.players.p1.life)).toEqual(["urouge", "life-top"]);
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
  });

  it("declining keeps Life and hand as they were", () => {
    const game = table("op10-107-decline")
      .withHand("p1", [
        instance("bonney", "OP10-107"),
        instance("urouge", "OP10-101"),
      ])
      .withLife("p1", [instance("life-top", "OP12-082")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-107" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    answer(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["urouge"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-top"]);
  });
});

describe("OP10-110 Heat & Wire", () => {
  covers("OP10-110", "[On Play]", "[Trigger]");

  it("rests a Character whose cost is within the opponent's Life count", () => {
    const game = table("op10-110")
      .withHand("p1", [instance("heat", "OP10-110")])
      .withLife("p2", vanillaLife("p2-life", 3))
      .withBoard("p2", [
        character("fourtricks", "EB01-025"), // cost 3
        character("komei", "EB02-034"), // cost 4
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-110" });
    expect(effectOptions(game.state)).toEqual(["fourtricks", "done"]);
    game.play({ type: "resolve-effect", optionId: "fourtricks" });
    answer(game);

    expect(onBoard(game, "p2", "fourtricks")?.rested).toBe(true);
    expect(onBoard(game, "p2", "komei")?.rested).toBe(false);
  });

  const lifeHit = (seed: string, life: number) => {
    const game = theirTurn(seed)
      .withBoard("p2", [character("attacker", "EB01-018")])
      .withLife("p1", [
        instance("life-heat", "OP10-110"),
        ...vanillaLife("p1-life", life - 1),
      ])
      .build();
    attack(game, "attacker", "p1-leader");
    undefended(game);
    return game;
  };

  it("plays itself off a Life card at 2 Life or less", () => {
    const game = lifeHit("op10-110-trigger", 3);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    answer(game);
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(onBoard(game, "p1", "life-heat")).toBeDefined();
  });

  it("is not played at 3 Life", () => {
    const game = lifeHit("op10-110-trigger-gate", 4);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-trigger" &&
            action.summary.includes("Activate Trigger"),
        ),
    ).toBe(false);
    game.play({ type: "resolve-trigger" });
    expect(onBoard(game, "p1", "life-heat")).toBeUndefined();
    expect(ids(game.state.players.p1.hand)).toEqual(["life-heat"]);
  });
});
