import { describe, expect, it } from "vitest";
import { currentPower } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * The card bugs OPTCGSim's 1.42a-1.44a patch notes (Aug-Oct 2026) say they
 * fixed, held against this engine: one case per note, named by the patch that
 * carried it. Each case drives the engine to the position the note describes
 * and asserts what the printed text says should happen there. A note whose
 * behaviour another file already pins is not repeated here.
 */

/** A bare table on turn 11, `active` to act, every DON!! active. */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

function offers(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function attack(game: Game, attacker: string, target: string): void {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
}

/** Passes the Block and Counter steps with no defence. */
function undefended(game: Game): void {
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    game.pass();
  }
}

function activations(game: Game, instanceId: string): number {
  return game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    ).length;
}

describe("OPTCGSim patch notes 1.42a-1.44a", () => {
  covers("OP17-063", "[Activate: Main]");
  it("OPTCGSim 1.43a: OP17-063 Kaido pays DON!! −1 once per turn, not every time", () => {
    const game = table("optcgsim-op17-063")
      .withBoard("p1", [character("kaido", "OP17-063", { playedTurn: 11 })])
      .withBoard("p2", [
        character("first", "FIX-002"),
        character("second", "FIX-002"),
      ])
      .build();

    expect(activations(game, "kaido")).toBe(1);
    game.play({ type: "activate-main", sourceInstanceId: "kaido" });
    game.play({ type: "resolve-effect", optionId: "first" });
    expect(ids(game.state.players.p2.board)).toEqual(["second"]);
    expect(game.state.players.p1.donDeck).toHaveLength(1);

    expect(activations(game, "kaido")).toBe(0);
  });

  covers("OP17-112", "[Your Turn]");
  it("OPTCGSim 1.43a: OP17-112 Charlotte Linlin still sets a negated 4000 [Trigger] Character to 8000", () => {
    // OP17-114 prints 4000 and a [Trigger]. Negation strips that Character's
    // own text; Linlin's clause is hers, so it still reaches the body.
    const game = table("optcgsim-op17-112")
      .withBoard("p1", [
        character("linlin", "OP17-112"),
        character("sweet", "OP17-114"),
      ])
      .withNegated("sweet")
      .build();
    expect(currentPower(game.state, "p1", "sweet")).toBe(8000);

    const silenced = table("optcgsim-op17-112-source")
      .withBoard("p1", [
        character("linlin", "OP17-112"),
        character("sweet", "OP17-114"),
      ])
      .withNegated("linlin")
      .build();
    expect(currentPower(silenced.state, "p1", "sweet")).toBe(4000);
  });

  covers("OP17-034", "[Activate: Main]");
  it("OPTCGSim 1.43a: OP17-034 Rockstar does not count DON!! given to the opponent's Leader on its own turn", () => {
    // DON!! given to a card adds power only on its owner's turn, so on
    // Rockstar's turn a 5000 Leader carrying one is still a 5000 Leader.
    const game = table("optcgsim-op17-034")
      .withLeader("p1", "OP17-020")
      .withBoard("p1", [character("rockstar", "OP17-034")])
      .withDon("p1", { rested: 1 })
      .withGivenDon("p2", "p2-leader", 1)
      .build();
    expect(game.state.players.p2.leaderAttachedDon).toHaveLength(1);
    expect(activations(game, "rockstar")).toBe(0);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  covers("OP17-049", "[On Your Opponent's Attack]");
  it("OPTCGSim 1.43a: OP17-049 Charlotte Linlin pays with the last card in hand", () => {
    const game = table("optcgsim-op17-049", "p2")
      .withBoard("p1", [character("linlin", "OP17-049")])
      .withHand("p1", [instance("last", "FIX-001")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();

    attack(game, "attacker", "p1-leader");
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "apply" });
    if (offers(game, "p1").includes("last")) {
      game.play({ type: "resolve-effect", optionId: "last" });
    }
    if (offers(game, "p1").includes("p1-leader")) {
      game.play({ type: "resolve-effect", optionId: "p1-leader" });
    }

    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(["last"]);
    expect(game.state.activeAttack?.counterPower).toBe(1000);
  });

  covers("OP17-038", "[Main]");
  it("OPTCGSim 1.43a: OP17-038 rests the Leader and Characters as its cost, not only DON!!", () => {
    const game = table("optcgsim-op17-038")
      .withHand("p1", [instance("future", "OP17-038")])
      .withBoard("p1", [
        character("a", "FIX-001"),
        character("b", "FIX-001"),
        character("c", "FIX-001"),
      ])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

    game.play({ summary: "Activate I Think He's Seen an Ugly Future" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    const costOptions = offers(game, "p1");
    expect(costOptions).toEqual(
      expect.arrayContaining(["p1-leader", "a", "b", "c"]),
    );
    for (const pick of ["p1-leader", "a", "b", "c"]) {
      game.play({ type: "resolve-effect", optionId: pick });
    }
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(game.state.players.p1.board.every((card) => card.rested)).toBe(true);
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  covers("OP17-018", "[Counter]");
  it("OPTCGSim 1.44a: OP17-018 counts Characters of more than 8000 base power too", () => {
    // OP06-007 Shanks prints 12000 and OP07-044 Mihawk 10000: neither is
    // exactly 8000, and both are "8000 base power or more".
    const game = table("optcgsim-op17-018", "p2")
      .withHand("p1", [instance("event", "OP17-018")])
      .withBoard("p1", [
        character("shanks", "OP06-007"),
        character("mihawk", "OP07-044"),
      ])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withGivenDon("p2", "attacker", 3)
      .build();

    attack(game, "attacker", "p1-leader");
    game.pass();
    expect(game.state.phase).toBe("counter");
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "skip" });
    }
    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  covers("EB02-030", "[Counter]");
  it("OPTCGSim 1.43a: EB02-030's hand trash does not draw for the OP12-040 Kuzan Leader", () => {
    // Kuzan draws for a hand card trashed by a {Navy} card's effect. The card
    // saved here is {Navy}, but the effect paying for it is EB02-030's, and
    // EB02-030 is not {Navy}.
    const game = table("optcgsim-eb02-030-kuzan", "p2")
      .withLeader("p1", "OP12-040")
      .withHand("p1", [
        instance("event", "EB02-030"),
        instance("fodder", "FIX-001"),
      ])
      .withDeckTop("p1", copies(2, "FIX-001", "p1-deck"))
      .withBoard("p1", [character("hina", "OP05-050")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "hina",
          attackPower: 9000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    game.pass();
    game.play({
      type: "resolve-effect",
      optionId: "mechanic:hina:p1-installed-EB02-030",
    });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(ids(game.state.players.p1.board)).toEqual(["hina"]);
    expect(game.state.players.p1.hand).toEqual([]);
    expect(game.state.players.p1.deck).toHaveLength(2);
  });

  covers("EB04-022", "[When Attacking]");
  it("OPTCGSim 1.43a: EB04-022 Issho's [When Attacking] trash draws for the OP12-040 Kuzan Leader", () => {
    const game = table("optcgsim-eb04-022-kuzan")
      .withLeader("p1", "OP12-040")
      .withBoard("p1", [character("issho", "EB04-022")])
      .withGivenDon("p1", "issho", 1)
      .withHand("p1", [instance("fodder", "FIX-001")])
      .withDeckTop("p1", [instance("drawn", "FIX-001")])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

    attack(game, "issho", "p2-leader");
    game.play({ type: "resolve-effect", optionId: "apply" });
    if (offers(game, "p1").includes("fodder")) {
      game.play({ type: "resolve-effect", optionId: "fodder" });
    }
    if (offers(game, "p1").includes("target")) {
      game.play({ type: "resolve-effect", optionId: "target" });
    }

    expect(ids(game.state.players.p1.trash)).toEqual(["fodder"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(currentPower(game.state, "p2", "target")).toBe(2000);
  });

  covers("OP06-043", "[Activate: Main]");
  it("OPTCGSim 1.42a: OP06-043 Aramaki is not offered with no cost-2-or-less Character to place", () => {
    const game = table("optcgsim-op06-043")
      .withBoard("p1", [character("aramaki", "OP06-043")])
      .withHand("p1", [instance("fodder", "FIX-001")])
      .withBoard("p2", [character("big", "OP05-050")])
      .build();
    expect(activations(game, "aramaki")).toBe(0);
    expect(game.state.oncePerTurn).toEqual([]);
  });

  covers("OP08-057", "[Activate: Main]");
  it("OPTCGSim 1.43a: OP08-057 King returns DON!! only once activated, and declining to activate costs nothing", () => {
    // Declining is not activating: the DON!! −2 is paid by the activation
    // itself, so a player who backs out simply never takes the action.
    const game = table("optcgsim-op08-057")
      .withLeader("p1", "OP08-057")
      .withBoard("p2", [character("target", "FIX-002")])
      .build();
    expect(activations(game, "p1-leader")).toBe(1);
    expect(game.state.players.p1.donDeck).toHaveLength(0);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    expect(game.state.players.p1.donDeck).toHaveLength(2);
    expect(offers(game, "p1")).toEqual(["draw", "cost"]);
  });

  covers("EB03-038", "[Main]");
  it("OPTCGSim 1.43a: EB03-038 checks the DON!! counts before ramping", () => {
    // p1 has 8 DON!! on the field to p2's 5: "equal to or less" fails.
    const game = table("optcgsim-eb03-038")
      .withHand("p1", [instance("event", "EB03-038")])
      .withBoard("p1", [character("germa", "OP10-063")])
      .withDonDeck("p1", 2)
      .withDonDeck("p2", 5)
      .build();

    const ramps = game
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "EB03-038",
      );
    expect(ramps).toBe(false);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  covers("OP13-118", "[On Play]");
  it("OPTCGSim 1.43a: OP13-118 Luffy's lock leaves a cost-5 Stage playable", () => {
    // OP12-081 Koala is a Black/Yellow Leader; OP05-040 is a cost-5 Stage.
    const game = table("optcgsim-op13-118")
      .withLeader("p1", "OP12-081")
      .withHand("p1", [
        instance("luffy", "OP13-118"),
        instance("stage", "OP05-040"),
        instance("big", "OP05-050"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-118" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    const plays = game
      .legalActions()
      .filter((action) => action.type === "play-card")
      .map((action) => action.cardInstanceId);
    expect(plays).toContain("stage");
    // OP05-050 Hina is base cost 3, under the lock's 5.
    expect(plays).toContain("big");
    game.play({ type: "play-card", cardNumber: "OP05-040" });
    expect(game.state.players.p1.stage?.instanceId).toBe("stage");
  });

  covers("OP17-015", "[On K.O.]");
  covers("OP12-081", "static");
  it("OPTCGSim 1.42a: OP17-015 Marco playing himself from the trash answers the OP12-081 Koala Leader", () => {
    // Marco's [On K.O.] is a Character's effect playing a Character, which is
    // the second of the two plays Koala's clause watches for.
    const game = table("optcgsim-op17-015-koala", "p2")
      .withLeader("p2", "OP12-081")
      .withBoard("p1", [character("marco", "OP17-015", { rested: true })])
      .withHand("p1", [instance("fuel", "OP17-010")])
      .withLife("p1", [
        instance("life-1", "FIX-001"),
        instance("life-2", "FIX-001"),
      ])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withGivenDon("p2", "attacker", 3)
      .build();

    attack(game, "attacker", "marco");
    undefended(game);
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 20) throw new Error("pending effect never settled");
      const options = offers(game);
      game.play({
        type: "resolve-effect",
        optionId:
          ["apply", "fuel", "life-1"].find((id) => options.includes(id)) ??
          options[0],
      });
    }

    expect(ids(game.state.players.p1.board)).toEqual(["marco"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-2"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["life-1"]);
  });

  covers("OP15-070", "[Opponent's Turn]");
  it("OPTCGSim 1.44a: OP15-070 Fuza reaches a Leader named [Shura]", () => {
    // SEALED-LUFFY answers to every card name, so it is a [Shura] Leader --
    // the only one in the pool. "All of your [Shura] cards" includes it.
    const game = table("optcgsim-op15-070", "p2")
      .withLeader("p1", "SEALED-LUFFY")
      .withBoard("p1", [character("fuza", "OP15-070")])
      .build();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  covers("OP05-099", "[On Your Opponent's Attack]");
  it("OPTCGSim 1.43a: OP05-099 Amazon is not offered once she is already rested", () => {
    const game = table("optcgsim-op05-099", "p2")
      .withBoard("p1", [character("amazon", "OP05-099", { rested: true })])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();

    attack(game, "attacker", "p1-leader");
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.phase).toBe("block");
  });

  it("OPTCGSim 1.42a: a negated printed [Blocker] cannot block", () => {
    const control = table("optcgsim-blocker-control", "p2")
      .withBoard("p1", [character("blueno", "EB01-017")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();
    attack(control, "attacker", "p1-leader");
    expect(
      control.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(true);

    const game = table("optcgsim-blocker-negated", "p2")
      .withBoard("p1", [character("blueno", "EB01-017")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withNegated("blueno")
      .build();
    attack(game, "attacker", "p1-leader");
    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });

  covers("OP17-023", "static");
  it("OPTCGSim 1.44a: two negated OP17-023 Namis cannot save a Character between them", () => {
    // p2's OP09-018 Get Out of Here! K.O.s Sanji, a {Straw Hat Crew}
    // Character each Nami would otherwise rest herself to save.
    const game = table("optcgsim-negated-savers", "p2")
      .withHand("p2", [instance("gooh", "OP09-018")])
      .withBoard("p1", [
        character("nami-1", "OP17-023"),
        character("nami-2", "OP17-023"),
        character("sanji", "OP17-082"),
      ])
      .withNegated("nami-1")
      .withNegated("nami-2")
      .build();

    game.play({ summary: "Activate Get Out of Here!" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    if (game.player === "p2" && game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "done" });
    }

    expect(
      offers(game, "p1").filter((id) => id.startsWith("replace:")),
    ).toEqual([]);
    expect(ids(game.state.players.p1.board)).toEqual(["nami-1", "nami-2"]);
  });

  covers("EB04-028", "[Main]");
  it("OPTCGSim 1.43a: EB04-028 Ice Time locks nothing without a {Navy} Leader", () => {
    const game = table("optcgsim-eb04-028")
      .withHand("p1", [
        instance("ice", "EB04-028"),
        instance("fodder", "FIX-001"),
      ])
      .withBoard("p2", [character("a", "FIX-002"), character("b", "FIX-002")])
      .build();
    const before = structuredClone(game.state.players.p2.board);

    const offered = game
      .legalActions("p1")
      .find(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "EB04-028",
      );
    if (offered) {
      game.submit(offered);
      while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    }
    expect(game.state.players.p2.board).toEqual(before);
    expect(
      game.state.players.p2.board.map((card) => card.cannotAttackUntilTurn),
    ).toEqual([undefined, undefined]);
  });

  covers("OP13-119", "[On Play]");
  it("OPTCGSim 1.43a: OP13-119 Ace never leaves the opponent with more than 5 Characters", () => {
    const game = table("optcgsim-op13-119")
      .withHand("p1", [instance("ace", "OP13-119")])
      .withBoard(
        "p2",
        copies(5, "FIX-001", "p2-body").map((card) =>
          character(card.instanceId, card.cardNumber),
        ),
      )
      .withHand("p2", [instance("arrival", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-119" });
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 20) throw new Error("pending effect never settled");
      const options = offers(game);
      game.play({
        type: "resolve-effect",
        optionId:
          ["apply", "arrival", "p2-body-1"].find((id) =>
            options.includes(id),
          ) ?? options[0],
      });
    }

    expect(game.state.players.p2.board).toHaveLength(5);
    expect(ids(game.state.players.p2.board)).toContain("arrival");
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-body-1"]);
  });
});
