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
 * The six `P-` promos Bandai lists only beside another product: P-084 Buggy
 * on the ST-25 page, and P-072, P-093, P-152, P-153 and P-154 on the "Other
 * Product Card" page. `test/promo.test.ts` holds the rest of the promo list.
 *
 * Positions seat two starter decks and place the card under test with a
 * `with*` setter. Vanilla EB-05 bodies stand in as plain markers: EB05-003
 * Pasia (cost 1, 3000), EB05-054 Charlotte Brulee (cost 3, 4000; its only
 * text is a [Trigger]), EB05-032 Ulti (cost 4) and EB05-015 Tashigi (cost 5).
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
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

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

/** The instance ids the active player is offered an attack with. */
const attackers = (game: Game): string[] => [
  ...new Set(
    getLegalActions(game.state, game.state.activePlayer).flatMap((action) =>
      action.type === "attack" ? [action.attackerInstanceId] : [],
    ),
  ),
];

describe("P-072 Ryuma", () => {
  it("[On Play] rests an opposing Character of cost 4 or less", () => {
    covers("P-072", "[On Play]");
    const game = table("p072-on-play")
      .withHand("p1", [instance("ryuma", "P-072")])
      .withBoard("p2", [
        character("four", "EB05-032"),
        character("five", "EB05-015"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "P-072" });
    const options = effectOptions(game.state);
    expect(options).toContain("four");
    expect(options).not.toContain("five");
    pick(game, "four");
    settle(game);

    expect(boardCard(game, "p2", "four")?.rested).toBe(true);
    expect(boardCard(game, "p2", "five")?.rested).toBe(false);
  });

  it("[On K.O.] rests an opposing Character of cost 4 or less", () => {
    covers("P-072", "[On K.O.]");
    const game = table("p072-on-ko", "p2")
      .withBoard("p1", [character("ryuma", "P-072", { rested: true })])
      .withBoard("p2", [
        character("attacker", "EB05-015"),
        character("four", "EB05-032"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "ryuma",
    });
    while (
      (game.state.phase === "block" || game.state.phase === "counter") &&
      !game.state.pendingEffect
    ) {
      game.pass();
    }
    expect(ids(game.state.players.p1.trash)).toContain("ryuma");
    expect(effectOptions(game.state)).toContain("four");
    pick(game, "four");
    settle(game);

    expect(boardCard(game, "p2", "four")?.rested).toBe(true);
  });
});

describe("P-084 Buggy", () => {
  it("cannot attack itself", () => {
    covers("P-084", "static");
    const game = table("p084-self")
      .withBoard("p1", [character("buggy", "P-084")])
      .build();

    expect(attackers(game)).not.toContain("buggy");
  });

  it("under a [Buggy] Leader, Characters of cost 3 or 4 cannot attack on either side", () => {
    covers("P-084", "static");
    const game = table("p084-ban-own")
      .withLeader("p1", "OP09-042")
      .withBoard("p1", [
        character("buggy", "P-084"),
        character("three", "EB05-054"),
        character("four", "EB05-032"),
        character("five", "EB05-015"),
      ])
      .build();

    const offered = attackers(game);
    expect(offered).not.toContain("three");
    expect(offered).not.toContain("four");
    expect(offered).toContain("five");
    expect(offered).toContain("p1-leader");
  });

  it("the ban reaches the opponent's Characters too", () => {
    covers("P-084", "static");
    const game = table("p084-ban-opponent", "p2")
      .withLeader("p1", "OP09-042")
      .withBoard("p1", [character("buggy", "P-084")])
      .withBoard("p2", [
        character("four", "EB05-032"),
        character("five", "EB05-015"),
      ])
      .build();

    const offered = attackers(game);
    expect(offered).not.toContain("four");
    expect(offered).toContain("five");
  });

  it("under another Leader, only Buggy himself is barred", () => {
    covers("P-084", "static");
    const game = table("p084-no-buggy-leader")
      .withBoard("p1", [
        character("buggy", "P-084"),
        character("three", "EB05-054"),
        character("four", "EB05-032"),
      ])
      .build();

    const offered = attackers(game);
    expect(offered).toEqual(expect.arrayContaining(["three", "four"]));
    expect(offered).not.toContain("buggy");
  });

  it("[On Play] plays a {Cross Guild} Character of cost 6 or less from hand", () => {
    covers("P-084", "[On Play]");
    const game = table("p084-on-play")
      .withHand("p1", [
        instance("buggy", "P-084"),
        instance("mihawk", "OP09-048"),
        instance("crocodile", "OP09-046"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "P-084" });
    const options = effectOptions(game.state);
    expect(options).toContain("mihawk");
    expect(options).not.toContain("crocodile");
    pick(game, "mihawk");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(
      expect.arrayContaining(["buggy", "mihawk"]),
    );
    expect(ids(game.state.players.p1.board)).not.toContain("crocodile");
  });
});

describe("P-093 Trafalgar Law", () => {
  /** p1 with `own` DON!! on the field, p2 with `theirs`, and DON!! to add. */
  const law = (seed: string, own: number, theirs: number) =>
    scenario()
      .decks(P1, P2)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withDonDeck("p1", 10 - own)
      .withDonDeck("p2", 10 - theirs)
      .withHand("p1", [instance("law", "P-093")])
      .build();

  const fieldDon = (game: Game, player: "p1" | "p2") =>
    game.state.players[player].activeDon.length +
    game.state.players[player].restedDon.length;

  it("[On Play] adds a rested DON!! when its controller has no more DON!! on the field", () => {
    covers("P-093", "[On Play]");
    const game = law("p093-tie", 6, 6);
    const restedBefore = game.state.players.p1.restedDon.length;

    game.play({ type: "play-card", cardNumber: "P-093" });
    settle(game);

    expect(fieldDon(game, "p1")).toBe(7);
    // The four DON!! the play paid, plus the one added rested.
    expect(game.state.players.p1.restedDon.length).toBe(restedBefore + 5);
  });

  it("[On Play] adds nothing while its controller is ahead on DON!!", () => {
    covers("P-093", "[On Play]");
    const game = law("p093-ahead", 7, 6);

    game.play({ type: "play-card", cardNumber: "P-093" });
    settle(game);

    expect(fieldDon(game, "p1")).toBe(7);
  });

  it("prints [Blocker]", () => {
    covers("P-093", "[Blocker]");
    const game = table("p093-blocker", "p2")
      .withBoard("p1", [character("law", "P-093")])
      .withBoard("p2", [character("attacker", "EB05-015")])
      .build();

    expect(hasKeyword(game.state, "p1", "law", "Blocker")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    const blocks = getLegalActions(game.state, "p1").filter(
      (action) => action.type === "block",
    );
    expect(blocks.map((action) => action.blockerInstanceId)).toContain("law");
  });
});

describe("P-152 Edward.Newgate", () => {
  it("[On Play] gives the Leader and every Character +2000, and K.O.s nothing above 3000 power", () => {
    covers("P-152", "[On Play]");
    const game = table("p152-on-play")
      .withHand("p1", [instance("newgate", "P-152")])
      .withBoard("p1", [character("ally", "EB05-032")])
      .withBoard("p2", [
        character("small", "EB05-054"),
        character("big", "EB05-015"),
      ])
      .build();
    const leaderBefore = currentPower(game.state, "p1", "p1-leader");
    const allyBefore = currentPower(game.state, "p1", "ally");

    game.play({ type: "play-card", cardNumber: "P-152" });
    // Brulee (4000) and Tashigi (7000) are both above the ceiling.
    expect(effectOptions(game.state)).not.toContain("small");
    expect(effectOptions(game.state)).not.toContain("big");
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(
      leaderBefore + 2000,
    );
    expect(currentPower(game.state, "p1", "ally")).toBe(allyBefore + 2000);
    expect(ids(game.state.players.p2.board)).toEqual(["small", "big"]);
  });

  it("[On Play] K.O.s an opposing Character of 3000 power or less", () => {
    covers("P-152", "[On Play]");
    const game = table("p152-ko")
      .withHand("p1", [instance("newgate", "P-152")])
      .withBoard("p2", [
        character("pasia", "EB05-003"),
        character("ulti", "EB05-032"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "P-152" });
    const options = effectOptions(game.state);
    expect(options).toContain("pasia");
    expect(options).not.toContain("ulti");
    pick(game, "pasia");
    settle(game);

    expect(ids(game.state.players.p2.trash)).toContain("pasia");
    expect(ids(game.state.players.p2.board)).toEqual(["ulti"]);
  });
});

describe("P-153 Portgas.D.Ace", () => {
  it("[On Play] gives up to two opposing Characters −3000 for the turn", () => {
    covers("P-153", "[On Play]");
    const game = table("p153-on-play")
      .withHand("p1", [instance("ace", "P-153")])
      .withBoard("p2", [
        character("four", "EB05-032"),
        character("five", "EB05-015"),
        character("three", "EB05-054"),
      ])
      .build();
    const before = (id: string) => currentPower(game.state, "p2", id);
    const [four, five, three] = [
      before("four"),
      before("five"),
      before("three"),
    ];

    game.play({ type: "play-card", cardNumber: "P-153" });
    pick(game, "four");
    pick(game, "five");
    settle(game);

    expect(currentPower(game.state, "p2", "four")).toBe(four - 3000);
    expect(currentPower(game.state, "p2", "five")).toBe(five - 3000);
    expect(currentPower(game.state, "p2", "three")).toBe(three);
  });
});

describe("P-154 Monkey.D.Luffy", () => {
  const luffy = (seed: string, leader: string) =>
    table(seed)
      .withLeader("p1", leader)
      .withHand("p1", [
        instance("luffy", "P-154"),
        instance("small-ace", "OP08-052"),
        instance("big-ace", "OP07-119"),
      ])
      .build();

  it("[On Play] rests 3 DON!! to play an 8000-power-or-less [Portgas.D.Ace] under an Ace Leader", () => {
    covers("P-154", "[On Play]");
    const game = luffy("p154-on-play", "OP13-002");
    const activeBefore = game.state.players.p1.activeDon.length;
    const luffyCost = 6;

    game.play({ type: "play-card", cardNumber: "P-154" });
    pick(game, "apply");
    const options = effectOptions(game.state);
    expect(options).toContain("small-ace");
    expect(options).not.toContain("big-ace");
    pick(game, "small-ace");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(
      expect.arrayContaining(["luffy", "small-ace"]),
    );
    expect(game.state.players.p1.activeDon.length).toBe(
      activeBefore - luffyCost - 3,
    );
  });

  it("[On Play] is not offered under another Leader", () => {
    covers("P-154", "[On Play]");
    const game = luffy("p154-other-leader", "OP09-042");
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "play-card", cardNumber: "P-154" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toContain("small-ace");
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 6);
  });
});
