import { describe, expect, it } from "vitest";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP17's five "instead" replacements, driven through the three removal paths
 * that offer a registered one: the `knock-out` node, the `move` node (a bounce),
 * and battle destruction.
 *
 * The removals are real cards:
 *  - OP09-018 Get Out of Here!: K.O. up to 2 Characters totalling 4000 power --
 *    the one removal here that takes two Characters at the same time.
 *  - OP09-058 Special Muggy Ball: return a cost-6-or-less Character to hand.
 *  - OP17-009 Haruta: [On Play] K.O. a Character with 2000 base power or less.
 *  - OP17-105 Charlotte Chiffon: [On Play] return a Character with a [Trigger].
 *
 * p1 defends throughout; p2 is the turn player.
 */
const table = (seed: string) =>
  scenario().seed(seed).atTurn(3, { active: "p2" }).bareTable();

/** The ids of p1's options at the open decision. */
function offers(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId: string }).optionId);
}

/** p2 casts OP09-018 and picks `targets` off p1's board. */
function getOutOfHere(game: Game, targets: readonly string[]): void {
  game.play({ summary: "Activate Get Out of Here!" });
  for (const target of targets) {
    game.play({ type: "resolve-effect", optionId: target });
  }
  if (game.state.activePlayer === "p2") {
    game.play({ type: "resolve-effect", optionId: "done" });
  }
}

/** p2 casts OP09-058 at `target`. */
function muggyBall(game: Game, target: string): void {
  game.play({ summary: "Activate Special Muggy Ball" });
  game.play({ type: "resolve-effect", optionId: target });
}

/** p2 attacks `target` with `attacker`, and p1 takes the hit undefended. */
function attackUndefended(game: Game, attacker: string, target: string) {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

const boardIds = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].board.map((card) => card.instanceId);
const zoneIds = (game: Game, player: "p1" | "p2", zone: "hand" | "trash") =>
  game.state.players[player][zone].map((card) => card.instanceId);

describe("OP17-015 Marco", () => {
  covers("OP17-015", "static");

  it("is offered for a K.O. by the opponent's effect, and dies in the target's place", () => {
    const game = table("op17-015-ko")
      .withHand("p2", [instance("gooh", "OP09-018")])
      .withBoard("p1", [
        character("fossa", "OP17-010"),
        character("marco", "OP17-015"),
      ])
      .build();

    getOutOfHere(game, ["fossa"]);
    expect(game.state.activePlayer).toBe("p1");
    expect(offers(game)).toEqual(["ko:fossa", "replace:marco"]);
    game.play({ type: "resolve-effect", optionId: "replace:marco" });
    while (game.state.pendingEffect && game.state.activePlayer === "p1") {
      // Marco's own [On K.O.] asks for a Whitebeard Pirates card it cannot pay.
      game.play({ type: "resolve-effect" });
    }

    expect(boardIds(game, "p1")).toEqual(["fossa"]);
    expect(zoneIds(game, "p1", "trash")).toEqual(["marco"]);
  });

  it("answers a bounce of itself by being K.O.'d instead", () => {
    const game = table("op17-015-bounce")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [character("marco", "OP17-015")])
      .build();

    muggyBall(game, "marco");
    expect(offers(game)).toEqual(["remove:marco", "replace:marco"]);
    game.play({ type: "resolve-effect", optionId: "replace:marco" });
    while (game.state.pendingEffect && game.state.activePlayer === "p1") {
      game.play({ type: "resolve-effect" });
    }

    // K.O.'d, not returned: the trash, not the hand.
    expect(zoneIds(game, "p1", "hand")).toEqual([]);
    expect(zoneIds(game, "p1", "trash")).toEqual(["marco"]);
  });

  it("one K.O. of Marco protects both Characters one effect removes together (Q&A Q1)", () => {
    const game = table("op17-015-both")
      .withHand("p2", [instance("gooh", "OP09-018")])
      .withBoard("p1", [
        character("sanji", "OP17-082"),
        character("robin", "OP17-087"),
        character("marco", "OP17-015"),
      ])
      .build();

    getOutOfHere(game, ["sanji", "robin"]);
    game.play({ type: "resolve-effect", optionId: "replace:marco" });
    while (game.state.pendingEffect && game.state.activePlayer === "p1") {
      game.play({ type: "resolve-effect" });
    }

    expect(boardIds(game, "p1")).toEqual(["sanji", "robin"]);
    expect(zoneIds(game, "p1", "trash")).toEqual(["marco"]);
  });

  it("is not offered for a K.O. in battle", () => {
    const game = table("op17-015-battle")
      .withBoard("p1", [
        character("fossa", "OP17-010", { rested: true }),
        character("marco", "OP17-015"),
      ])
      .withBoard("p2", [character("attacker", "OP17-030")])
      .build();

    attackUndefended(game, "attacker", "fossa");
    expect(game.state.pendingEffect).toBeNull();
    expect(boardIds(game, "p1")).toEqual(["marco"]);
  });
});

describe("OP17-021 Crone Oli", () => {
  covers("OP17-021", "static");

  it("rests another Character instead of a declarative K.O. of Oli", () => {
    const game = table("op17-021-ko")
      .withHand("p2", [instance("haruta", "OP17-009")])
      .withBoard("p1", [
        character("oli", "OP17-021"),
        character("fugar", "OP17-026"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-009" });
    game.play({ type: "resolve-effect", optionId: "oli" });
    expect(offers(game)).toEqual(["ko:oli", "replace:oli"]);
    game.play({ type: "resolve-effect", optionId: "replace:oli" });
    // The Character rested is a free choice, Oli herself included.
    expect(offers(game)).toEqual(expect.arrayContaining(["oli", "fugar"]));
    game.play({ type: "resolve-effect", optionId: "fugar" });

    expect(boardIds(game, "p1")).toEqual(["oli", "fugar"]);
    expect(
      game.state.players.p1.board.map((card) => [card.instanceId, card.rested]),
    ).toEqual([
      ["oli", false],
      ["fugar", true],
    ]);
  });

  it("can rest Oli herself to save herself", () => {
    const game = table("op17-021-self")
      .withHand("p2", [instance("haruta", "OP17-009")])
      .withBoard("p1", [character("oli", "OP17-021")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-009" });
    game.play({ type: "resolve-effect", optionId: "oli" });
    game.play({ type: "resolve-effect", optionId: "replace:oli" });
    if (game.state.activePlayer === "p1" && game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "oli" });
    }

    expect(game.state.players.p1.board).toEqual([
      expect.objectContaining({ instanceId: "oli", rested: true }),
    ]);
  });

  it("one rest protects both Red-Haired Pirates Characters one effect removes together (Q&A Q3)", () => {
    const game = table("op17-021-both")
      .withHand("p2", [instance("gooh", "OP09-018")])
      .withBoard("p1", [
        character("oli", "OP17-021"),
        character("fugar", "OP17-026"),
        character("spare", "OP17-006"),
      ])
      .build();

    getOutOfHere(game, ["oli", "fugar"]);
    game.play({ type: "resolve-effect", optionId: "replace:oli" });
    game.play({ type: "resolve-effect", optionId: "spare" });

    expect(game.state.pendingEffect).toBeNull();
    expect(boardIds(game, "p1")).toEqual(["oli", "fugar", "spare"]);
    expect(game.state.players.p1.board.filter((card) => card.rested)).toEqual([
      expect.objectContaining({ instanceId: "spare" }),
    ]);
  });

  it("leaves a Character of an unrelated type unprotected", () => {
    const game = table("op17-021-unrelated")
      .withHand("p2", [instance("gooh", "OP09-018")])
      .withBoard("p1", [
        character("fossa", "OP17-010"), // {Whitebeard Pirates}
        character("oli", "OP17-021"),
      ])
      .build();

    getOutOfHere(game, ["fossa"]);
    expect(game.state.pendingEffect).toBeNull();
    expect(boardIds(game, "p1")).toEqual(["oli"]);
  });

  it("bounces are answered too", () => {
    const game = table("op17-021-bounce")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [
        character("oli", "OP17-021"),
        character("fugar", "OP17-026"),
      ])
      .build();

    muggyBall(game, "fugar");
    expect(offers(game)).toEqual(["remove:fugar", "replace:oli"]);
  });
});

describe("OP17-023 Nami", () => {
  covers("OP17-023", "static");

  it("rests herself instead of a declarative K.O. of Nami", () => {
    const game = table("op17-023-ko")
      .withHand("p2", [instance("haruta", "OP17-009")])
      .withBoard("p1", [character("nami", "OP17-023")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-009" });
    game.play({ type: "resolve-effect", optionId: "nami" });
    expect(offers(game)).toEqual(["ko:nami", "replace:nami"]);
    game.play({ type: "resolve-effect", optionId: "replace:nami" });

    expect(game.state.players.p1.board).toEqual([
      expect.objectContaining({ instanceId: "nami", rested: true }),
    ]);
  });

  it("answers a battle K.O. of a Straw Hat Crew Character", () => {
    const game = table("op17-023-battle")
      .withBoard("p1", [
        character("sanji", "OP17-082", { rested: true }),
        character("nami", "OP17-023"),
      ])
      .withBoard("p2", [character("attacker", "OP17-030")])
      .build();

    attackUndefended(game, "attacker", "sanji");
    expect(game.state.pendingEffect?.kind).toBe("battle-ko-replacement");
    game.play({ type: "resolve-effect", summary: "Rest Nami" });

    expect(boardIds(game, "p1")).toEqual(["sanji", "nami"]);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "nami")
        ?.rested,
    ).toBe(true);
  });

  it("one rest protects both Characters one effect removes together (Q&A Q2)", () => {
    const game = table("op17-023-both")
      .withHand("p2", [instance("gooh", "OP09-018")])
      .withBoard("p1", [
        character("nami", "OP17-023"),
        character("sanji", "OP17-082"),
      ])
      .build();

    getOutOfHere(game, ["nami", "sanji"]);
    game.play({ type: "resolve-effect", optionId: "replace:nami" });

    expect(game.state.pendingEffect).toBeNull();
    expect(boardIds(game, "p1")).toEqual(["nami", "sanji"]);
  });

  it("offers nothing once Nami is rested, and nothing for a bounce", () => {
    const rested = table("op17-023-rested")
      .withHand("p2", [instance("haruta", "OP17-009")])
      .withBoard("p1", [
        character("nami", "OP17-023", { rested: true }),
        character("sanji", "OP17-082"),
      ])
      .build();
    rested.play({ type: "play-card", cardNumber: "OP17-009" });
    rested.play({ type: "resolve-effect", optionId: "sanji" });
    expect(rested.state.pendingEffect).toBeNull();
    expect(boardIds(rested, "p1")).toEqual(["nami"]);

    const bounced = table("op17-023-bounce")
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [character("nami", "OP17-023")])
      .build();
    muggyBall(bounced, "nami");
    expect(bounced.state.pendingEffect).toBeNull();
    expect(zoneIds(bounced, "p1", "hand")).toEqual(["nami"]);
  });
});

describe("OP17-043 Ganzui", () => {
  covers("OP17-043", "static");

  it("trashes 2 cards from hand instead of a battle K.O.", () => {
    const game = table("op17-043-battle")
      .withHand("p1", copies(2, "OP17-010", "fuel"))
      .withBoard("p1", [character("ganzui", "OP17-043", { rested: true })])
      .withBoard("p2", [character("attacker", "OP17-022")]) // 12000
      .build();

    attackUndefended(game, "attacker", "ganzui");
    expect(game.state.pendingEffect?.kind).toBe("battle-ko-replacement");
    game.play({ type: "resolve-effect", summary: "Trash 2 cards" });
    while (game.state.pendingEffect && game.state.activePlayer === "p1") {
      game.play({ type: "resolve-effect" });
    }

    expect(boardIds(game, "p1")).toEqual(["ganzui"]);
    expect(zoneIds(game, "p1", "trash")).toEqual(["fuel-1", "fuel-2"]);
  });

  it("answers a bounce, and guards only itself", () => {
    const game = table("op17-043-bounce")
      .withHand("p1", copies(2, "OP17-010", "fuel"))
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [
        character("ganzui", "OP17-043"),
        character("fossa", "OP17-010"),
      ])
      .build();

    muggyBall(game, "ganzui");
    expect(offers(game)).toEqual(["remove:ganzui", "replace:ganzui"]);

    const other = table("op17-043-other")
      .withHand("p1", copies(2, "OP17-010", "fuel"))
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [
        character("ganzui", "OP17-043"),
        character("fossa", "OP17-010"),
      ])
      .build();
    muggyBall(other, "fossa");
    expect(other.state.pendingEffect).toBeNull();
  });

  it("is not offered with fewer than 2 cards in hand", () => {
    const game = table("op17-043-broke")
      .withHand("p1", [instance("fuel", "OP17-010")])
      .withHand("p2", [instance("muggy", "OP09-058")])
      .withBoard("p1", [character("ganzui", "OP17-043")])
      .build();

    muggyBall(game, "ganzui");
    expect(game.state.pendingEffect).toBeNull();
    expect(zoneIds(game, "p1", "hand")).toEqual(["fuel", "ganzui"]);
  });
});

describe("OP17-095 Roronoa Zoro", () => {
  covers("OP17-095", "static");

  it("buries 3 from the trash instead of OP17-009 Haruta's K.O.", () => {
    const game = table("op17-095-ko")
      .withHand("p2", [instance("haruta", "OP17-009")])
      .withTrash("p1", copies(6, "OP17-010", "dead"))
      .withBoard("p1", [
        character("zoro", "OP17-095"),
        character("sanji", "OP17-082"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-009" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    expect(offers(game)).toEqual(["ko:sanji", "replace:zoro"]);
    game.play({ type: "resolve-effect", optionId: "replace:zoro" });
    for (const id of ["dead-1", "dead-2", "dead-3"]) {
      game.play({ type: "resolve-effect", optionId: id });
    }

    expect(boardIds(game, "p1")).toEqual(["zoro", "sanji"]);
    expect(zoneIds(game, "p1", "trash")).toEqual([
      "dead-4",
      "dead-5",
      "dead-6",
    ]);
    expect(
      game.state.players.p1.deck.slice(-3).map((card) => card.instanceId),
    ).toEqual(["dead-1", "dead-2", "dead-3"]);
  });

  it("answers OP17-105 Charlotte Chiffon's bounce", () => {
    const game = table("op17-095-bounce")
      .withHand("p2", [
        instance("chiffon", "OP17-105"),
        instance("fuel", "OP17-117"),
      ])
      .withTrash("p1", copies(6, "OP17-010", "dead"))
      .withBoard("p1", [
        character("zoro", "OP17-095"),
        character("whos", "OP17-071"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-105" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fuel" });
    game.play({ type: "resolve-effect", optionId: "whos" });
    expect(offers(game)).toEqual(["remove:whos", "replace:zoro"]);
  });

  it("one bury protects both Characters one effect removes together (Q&A Q2)", () => {
    const game = table("op17-095-both")
      .withHand("p2", [instance("gooh", "OP09-018")])
      .withTrash("p1", copies(6, "OP17-010", "dead"))
      .withBoard("p1", [
        character("zoro", "OP17-095"),
        character("sanji", "OP17-082"),
      ])
      .build();

    getOutOfHere(game, ["zoro", "sanji"]);
    game.play({ type: "resolve-effect", optionId: "replace:zoro" });
    for (const id of ["dead-1", "dead-2", "dead-3"]) {
      game.play({ type: "resolve-effect", optionId: id });
    }

    // One payment: the second Character is not asked about again.
    expect(game.state.pendingEffect).toBeNull();
    expect(boardIds(game, "p1")).toEqual(["zoro", "sanji"]);
    expect(zoneIds(game, "p1", "trash")).toHaveLength(3);
  });

  it("is not offered with fewer than 3 cards in the trash", () => {
    const game = table("op17-095-thin")
      .withHand("p2", [instance("haruta", "OP17-009")])
      .withTrash("p1", copies(2, "OP17-010", "dead"))
      .withBoard("p1", [
        character("zoro", "OP17-095"),
        character("sanji", "OP17-082"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-009" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    expect(game.state.pendingEffect).toBeNull();
    expect(boardIds(game, "p1")).toEqual(["zoro"]);
  });
});
