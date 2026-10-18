import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP13 "Carrying On His Will", imported whole -- the one set in the pool that is
 * 120 cards with a third Secret rather than a seventh Leader.
 */

const table = (seed: string) =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

const defending = (seed: string) =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function resolveAll(game: {
  state: GameState;
  play: (matcher: { type: "resolve-effect"; optionId?: string }) => unknown;
}): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

describe("OP13 metadata import", () => {
  it("registers all 120 OP13 identities with their printed rarity", () => {
    const op13 = [...cardRegistry.values()].filter((card) =>
      card.cardNumber.startsWith("OP13-"),
    );
    expect(op13).toHaveLength(120);
    expect(op13.every((card) => card.rarity)).toBe(true);
  });
});

describe("OP13-028 Shanks", () => {
  covers("OP13-028", "[On Play]");

  it("sets every DON!! active and then bars the hand outright", () => {
    const game = table("op13-028")
      .withHand("p1", [
        instance("shanks", "OP13-028"),
        instance("body", "ST31-003"),
        instance("event", "OP13-020"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-028" });
    resolveAll(game);

    // "[printed text omitted -- pnpm card:text OP13-028]": ten on the field, none rested.
    expect(game.state.players.p1.restedDon).toHaveLength(0);
    // "You cannot play cards from your hand": the Event is barred too, which is
    // what separates this from the Character-only bans.
    expect(
      game.legalActions().filter((action) => action.type === "play-card"),
    ).toEqual([]);
  });
});

describe("OP13-035 Bepo", () => {
  covers("OP13-035", "[End of Your Turn]");

  it("chooses between coming back itself and a DON!! coming back", () => {
    const game = table("op13-035")
      .withBoard("p1", [character("bepo", "OP13-035", { rested: true })])
      .withDon("p1", { rested: 2 })
      .withDeckTop("p1", [instance("draw-1", "ST31-003")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.pass();
    // The end-of-turn choice is offered before the turn changes hands.
    expect(effectOptions(game.state).sort()).toEqual(["don", "self"]);
    game.play({ type: "resolve-effect", optionId: "self" });
    resolveAll(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "bepo")
        ?.rested,
    ).toBe(false);
    // The other branch was not taken, so the DON!! stayed rested.
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });
});

describe("OP13-066 Silvers Rayleigh", () => {
  covers("OP13-066", "[On Play]");

  it("books a DON!! for the end of the turn rather than paying it now", () => {
    const game = table("op13-066")
      .withHand("p1", [instance("rayleigh", "OP13-066")])
      .withBoard("p1", [character("giver", "ST31-003")])
      .withGivenDon("p1", "giver", 1)
      .withDonDeck("p1", 1)
      .withBoard("p2", [character("victim", "ST32-004")])
      .withDeckTop("p1", [instance("draw-1", "ST31-003")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-066" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    resolveAll(game);

    expect(game.state.players.p1.addDonAtEndOfTurn).toBe(1);
    const donDeckBefore = game.state.players.p1.donDeck.length;

    game.pass();

    // Paid at the end of the turn, so it is there for the *next* one.
    expect(game.state.players.p1.donDeck.length).toBe(donDeckBefore - 1);
    expect(game.state.players.p1.addDonAtEndOfTurn).toBeUndefined();
  });

  it("does nothing at all with no DON!! given", () => {
    const game = table("op13-066-gate")
      .withHand("p1", [instance("rayleigh", "OP13-066")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-066" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.addDonAtEndOfTurn).toBeUndefined();
  });
});

describe("OP13-064 Gol.D.Roger", () => {
  covers("OP13-064", "static", "[On Play]");

  it("switches off its own side's off-type text, Leader included", () => {
    const game = table("op13-064")
      .withBoard("p1", [
        character("roger", "OP13-064"),
        character("offtype", "OP12-107"), // {Donquixote Pirates}: no Roger Pirates
        character("ontype", "OP13-065"), // {Roger Pirates}
      ])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .build();

    // OP12-107's own behind-only [Rush] is its printed text, and Roger negates
    // it; the {Roger Pirates} body keeps everything.
    expect(hasKeyword(game.state, "p1", "offtype", "Rush")).toBe(false);
    expect(hasKeyword(game.state, "p1", "ontype", "Rush")).toBe(false);

    const without = table("op13-064-without")
      .withBoard("p1", [character("offtype", "OP12-107")])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .build();
    // Without Roger out, the same body at the same Life has [Rush].
    expect(hasKeyword(without.state, "p1", "offtype", "Rush")).toBe(true);
  });
});

describe("OP13's Five Elders", () => {
  covers("OP13-084", "static", "[Your Turn]");
  covers("OP13-089", "static", "[On K.O.]");

  const withTrash = (seed: string, count: number) =>
    table(seed)
      .withBoard("p1", [
        character("warcury", "OP13-089"),
        character("jupeter", "OP13-084"),
      ])
      .withTrash(
        "p1",
        Array.from({ length: count }, (_, index) =>
          instance(`mill-${index}`, "ST31-003"),
        ),
      )
      // A card for p2 to draw when the turn passes: `bareTable()` empties both
      // decks, and a player who cannot draw loses before they can act.
      .withDeckTop("p2", [instance("their-draw", "ST32-004")]);

  it("cannot be removed by an opponent's effect at seven cards in the trash", () => {
    // Probed through a real removal rather than through the query: OP10-079 God
    // Thread K.O.s a Character with a cost of 5 or less, and OP13-089 Warcury
    // costs 4.
    const deep = withTrash("op13-elders-deep", 7)
      .withHand("p2", [instance("thread", "OP10-079")])
      .build();
    deep.pass();
    deep.play({ summary: "God Thread" });
    // The selector still offers the card -- immunity is read when the K.O.
    // resolves, not when the target is picked, which is how the engine treats
    // every printed immunity -- and the K.O. then does nothing.
    deep.play({ type: "resolve-effect", optionId: "warcury" });
    resolveAll(deep);
    expect(
      deep.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("warcury");
    expect(hasKeyword(deep.state, "p1", "warcury", "Blocker")).toBe(true);

    const shallow = withTrash("op13-elders-shallow", 6)
      .withHand("p2", [instance("thread", "OP10-079")])
      .build();
    shallow.pass();
    shallow.play({ summary: "God Thread" });
    expect(effectOptions(shallow.state)).toContain("warcury");
    shallow.play({ type: "resolve-effect", optionId: "warcury" });
    resolveAll(shallow);
    // One card short of the gate, so the same K.O. lands.
    expect(
      shallow.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("warcury");
  });

  it("sets the whole type to 7000 on its controller's turn at ten cards", () => {
    const game = withTrash("op13-084", 10).build();
    // Both bodies print 5000, and the aura replaces the printed number rather
    // than adding to it.
    expect(currentPower(game.state, "p1", "warcury")).toBe(7_000);
    expect(currentPower(game.state, "p1", "jupeter")).toBe(7_000);

    const shallow = withTrash("op13-084-shallow", 9).build();
    expect(currentPower(shallow.state, "p1", "warcury")).toBe(5_000);
  });
});

describe("OP13-119 Portgas.D.Ace", () => {
  covers("OP13-119", "static", "[On Play]");

  it("returns a Character and lets its owner play a cheaper one back", () => {
    const game = table("op13-119")
      .withHand("p1", [instance("ace", "OP13-119")])
      .withDon("p1", { rested: 1 })
      .withBoard("p2", [character("victim", "ST32-004")]) // cost 4
      .withHand("p2", [instance("theirs", "ST32-005")]) // cost 1
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-119" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    // The replay is the opponent's decision, off their own hand.
    expect(game.state.pendingEffect?.playerId).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "theirs" });
    resolveAll(game);

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "victim",
    );
    // Their card, on their board.
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "theirs",
    ]);
  });
});

describe('OP13\'s "removed from the field" replacements', () => {
  covers("OP13-109", "static", "[Trigger]");
  covers("OP13-046", "static");

  it("answers a bounce, not only a K.O.", () => {
    const game = table("op13-109")
      // OP10-060 Barrier-Barrier Pistol places a Character with 6000 power or
      // less at the bottom of its owner's deck -- a removal that is not a K.O.,
      // which is exactly what the wider printed reading covers.
      .withHand("p1", [instance("barrier", "OP10-060")])
      .withBoard("p2", [character("bonney", "OP13-109")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .build();

    game.play({ summary: "Barrier-Barrier Pistol" });
    game.play({ type: "resolve-effect", optionId: "bonney" });

    // The offer goes to the threatened card's controller.
    expect(game.state.pendingEffect?.playerId).toBe("p2");
    const replacement = effectOptions(game.state).find((option) =>
      option.startsWith("replace:"),
    );
    expect(replacement).toBeDefined();
    game.play({ type: "resolve-effect", optionId: replacement! });
    resolveAll(game);

    // The Character stayed, and the price was a Life card turned face-up.
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "bonney",
    ]);
    expect(game.state.players.p2.life[0]?.faceUp).toBe(true);
  });

  it("is not payable once every Life card is already face-up", () => {
    const game = table("op13-109-cost")
      .withHand("p1", [instance("barrier", "OP10-060")])
      .withBoard("p2", [character("bonney", "OP13-109")])
      .withLife("p2", [instance("their-life", "ST32-004", { faceUp: true })])
      .build();

    game.play({ summary: "Barrier-Barrier Pistol" });
    game.play({ type: "resolve-effect", optionId: "bonney" });
    resolveAll(game);

    // No offer, so the bounce went through.
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP13-106 Conney", () => {
  covers("OP13-106", "[Opponent's Turn]", "[Trigger]");

  it("gains [Blocker] when a Trigger activates on the opponent's turn", () => {
    const game = defending("op13-106")
      .withBoard("p1", [character("conney", "OP13-106")])
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      // A Life card with a Trigger, so the window opens when the attack lands.
      .withLife("p1", [instance("life-1", "OP13-115")])
      .withDeckTop("p1", [instance("draw-1", "ST31-003")])
      .build();

    expect(hasKeyword(game.state, "p1", "conney", "Blocker")).toBe(false);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });
    resolveAll(game);

    expect(hasKeyword(game.state, "p1", "conney", "Blocker")).toBe(true);
  });
});

describe("OP13-100 Jewelry Bonney", () => {
  covers("OP13-100", "[Your Turn]");

  it("ramps when a Character with a [Trigger] is played", () => {
    const game = table("op13-100")
      .withLeader("p1", "OP13-100")
      .withHand("p1", [
        instance("triggered", "OP13-109"), // a Character with a [Trigger]
        instance("plain", "OP13-041"), // a Character without one
      ])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-109" });
    // The Leader's own clause: two rested DON!! given to a card.
    game.play({ type: "resolve-effect" });
    resolveAll(game);

    const given =
      game.state.players.p1.leaderAttachedDon.length +
      game.state.players.p1.board.reduce(
        (total, card) => total + (card.attachedDon?.length ?? 0),
        0,
      );
    expect(given).toBe(2);
  });

  it("does not fire on a Character without a [Trigger]", () => {
    const game = table("op13-100-plain")
      .withLeader("p1", "OP13-100")
      .withHand("p1", [instance("plain", "OP13-041")])
      .withDon("p1", { rested: 3 })
      .withDeckTop("p1", [
        instance("draw-1", "ST31-003"),
        instance("draw-2", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-041" });
    resolveAll(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
  });
});

describe("OP13-082 Five Elders", () => {
  covers("OP13-082", "[Activate: Main]");

  it("trashes its own board to bring five different Elders back", () => {
    const game = table("op13-082")
      .withLeader("p1", "OP13-079")
      .withBoard("p1", [character("elders", "OP13-082")])
      .withHand("p1", [instance("fodder", "ST31-003")])
      .withTrash("p1", [
        instance("warcury", "OP13-089"), // 5000
        instance("mars", "OP13-091"), // 5000
        instance("saturn", "OP13-083"), // 5000
        instance("warcury-2", "OP13-089"), // a duplicate name
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP13-082" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    // "Different card names": the second Warcury is not offered once the first
    // has been taken.
    game.play({ type: "resolve-effect", optionId: "warcury" });
    expect(effectOptions(game.state)).not.toContain("warcury-2");
    game.play({ type: "resolve-effect", optionId: "mars" });
    game.play({ type: "resolve-effect", optionId: "saturn" });
    resolveAll(game);

    // The 12000 body went to the trash with the rest of the board, and three
    // 5000 bodies came back in its place.
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP13-083", "OP13-089", "OP13-091"]);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("elders");
  });
});

describe("OP13-006 Woop Slap", () => {
  covers("OP13-006", "[On Play]");

  it("gives 2 rested DON!! to a [Monkey.D.Luffy] Leader", () => {
    const game = table("op13-006")
      .withDonDeck("p1", 8)
      .withDon("p1", { rested: 2 })
      .withHand("p1", [instance("woop", "OP13-006")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-006" });
    expect(effectOptions(game.state)).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    // The Leader is bound by its instance id, and its DON!! is a pile of its
    // own: the board lookup alone put both DON!! back in the cost area.
    const p1 = game.state.players.p1;
    expect(p1.leaderAttachedDon).toHaveLength(2);
    // What is left rested is the DON!! that paid for Woop Slap itself.
    expect(p1.restedDon).toHaveLength(1);
  });
});
