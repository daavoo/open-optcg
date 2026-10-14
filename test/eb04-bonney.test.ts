import { describe, expect, it } from "vitest";
import { loadDeck, requireSupportedDeck } from "@one-piece-sim/decks";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  observe,
  playCostFromHand,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * EB-04 Red/Yellow Jewelry Bonney: the list in
 * `packages/decks/src/eb04-bonney-manifest.ts`.
 *
 * Almost every clause this deck prints reads its controller's own Life total,
 * so most of what is asserted here is *where* the threshold sits rather than
 * what happens past it. Each case that fires is paired with one a single Life
 * card the other side of the line, because a clause that fires at any Life
 * total is not the card the deck was built around.
 *
 * `bareTable()` is deliberately not used: it empties the deck and the Life
 * area, and every position here needs a real Life count -- which is exactly
 * what `withLife` deals off the deck.
 *
 * EB04-002, EB04-058 and EB03-053 are driven by `test/op17-luffy-ace.test.ts`
 * and `test/op16-nami.test.ts`, which shipped them. What is here is the nine
 * identities in `packages/cards/src/eb04-bonney.ts`, plus OP12-119 and
 * OP13-108, which this deck is the first shipped list to play.
 */

const DECK = "(Red/Yellow) Jewelry Bonney - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** p1 on the Bonney list, in its own Main Phase with ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(DECK, OPPONENT).seed(seed).atTurn(11, { active: "p1" });

/** p1 on the Bonney list, defending, for the clauses gated on the other turn. */
const defending = (seed: string) =>
  scenario().decks(DECK, OPPONENT).seed(seed).atTurn(12, { active: "p2" });

/** p2 on the Bonney list, for the Life Triggers its own cards have to flip. */
const triggering = (seed: string) =>
  scenario().decks(OPPONENT, DECK).seed(seed).atTurn(11, { active: "p1" });

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: {
  state: GameState;
  play: (matcher: { type: "resolve-effect" }) => unknown;
}) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

/** Decline the block and Counter steps, so a declared attack resolves. */
const declineDefence = (game: {
  state: { phase: string };
  pass: () => void;
}) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

/** The attack targets one attacker is offered right now. */
const attackTargets = (
  game: {
    legalActions: (
      player: "p1" | "p2",
    ) => { type: string; attackerInstanceId?: string }[];
  },
  player: "p1" | "p2",
  attackerInstanceId: string,
): (string | undefined)[] =>
  game
    .legalActions(player)
    .filter(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === attackerInstanceId,
    )
    .map(
      (action) => (action as { targetInstanceId?: string }).targetInstanceId,
    );

describe("EB-04 Red/Yellow Jewelry Bonney deck list", () => {
  it("loads a 50-card list behind EB04-001", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("EB04-001");
    expect(loadDeck(DECK)).toHaveLength(50);
  });
});

describe("EB04-001 Jewelry Bonney (Leader)", () => {
  covers("EB04-001", "[Opponent's Turn]");

  it("defends at 7000 once its own Life is down to one", () => {
    const game = defending("eb04-001-low").withLife("p1", 1).build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });

  it("stays 5000 one Life card above the line", () => {
    // Two Life cards: the [Activate: Main] half is still trading and this one
    // has not switched on. The deck is never doing both at once.
    const game = defending("eb04-001-high").withLife("p1", 2).build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("gains nothing on its controller's own turn", () => {
    const game = table("eb04-001-own-turn").withLife("p1", 1).build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });
});

describe("EB04-001 Jewelry Bonney's activation", () => {
  covers("EB04-001", "[Activate: Main]");

  it("debuffs a Character and trades a Life card for a card in hand", () => {
    const game = table("eb04-001-activate")
      .withLife("p1", 2)
      .withBoard("p2", [character("target", "ST31-002")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    const lifeCard = game.state.players.p1.life[0]!.instanceId;
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    // ST31-002 Jinbe is a printed 6000.
    expect(currentPower(game.state, "p2", "target")).toBe(5000);
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      lifeCard,
    );
  });

  it("stops trading Life at one card, and still lands the debuff", () => {
    // The gate that stops the Leader digging itself to zero: at 1 Life the
    // second sentence is dead and only the −1000 resolves.
    const game = table("eb04-001-no-trade")
      .withLife("p1", 1)
      .withBoard("p2", [character("target", "ST31-002")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(5000);
    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("is offered once a turn", () => {
    const game = table("eb04-001-once").withLife("p1", 2).build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });
});

describe("EB04-007 Roronoa Zoro", () => {
  covers("EB04-007", "[On Play]");

  it("hands the Leader +2000 that is still up on the opponent's turn", () => {
    const game = table("eb04-007-on-play")
      .withLife("p1", 2)
      .withHand("p1", [instance("zoro", "EB04-007")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-007" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
    game.pass();
    // "[printed text omitted -- pnpm card:text EB04-007]": the buff is defence,
    // which is the whole reason a 7-cost body is worth playing on this Leader.
    // Two Life cards here, so the Leader's own low-Life +2000 is not also up.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });
});

describe("EB04-007 Roronoa Zoro's activation", () => {
  covers("EB04-007", "[Activate: Main]");

  it("buys [Rush: Character] against an 8000 and swings the turn it lands", () => {
    const game = table("eb04-007-rush")
      .withHand("p1", [instance("zoro", "EB04-007")])
      // OP16-011 Vista, a printed 8000: not a card this list plays, which is
      // the point -- the clause reads the opponent's board, not its own.
      .withBoard("p2", [character("vista", "OP16-011", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-007" });
    settle(game);
    // Played this turn and without the keyword yet, so nothing is on offer.
    expect(attackTargets(game, "p1", "zoro")).toEqual([]);

    game.play({ type: "activate-main", sourceInstanceId: "zoro" });
    settle(game);

    // [Rush: Character], not [Rush]: the Leader is out of reach, so the only
    // offer is the 8000 that turned the clause on.
    expect(attackTargets(game, "p1", "zoro")).toEqual(["vista"]);
  });

  it("reports the granted [Rush: Character] to every observer of the board", () => {
    // The grant used to be legal-but-invisible: `canAttack` reads it through
    // `hasRushCharacter`, and `hasKeyword` -- which `effectiveKeywords` is
    // built out of -- had no branch for it. So a board a caller could see
    // said `keywords: none` about the one body on it that could attack only
    // Characters, and a trace has an LLM counting this Zoro among the
    // attackers that could reach the opposing Leader.
    const game = table("eb04-007-rush-observed")
      .withHand("p1", [instance("zoro", "EB04-007")])
      .withBoard("p2", [character("vista", "OP16-011", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-007" });
    settle(game);
    game.play({ type: "activate-main", sourceInstanceId: "zoro" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "zoro", "Rush: Character")).toBe(true);
    const board = observe(game.state, "p1").self.board;
    const zoro = board.find((card) => card.instanceId === "zoro")!;
    expect(zoro.effectiveKeywords).toContain("Rush: Character");
    // Not [Rush]: the two are a different offer, and the observation is where
    // a caller tells them apart.
    expect(zoro.effectiveKeywords).not.toContain("Rush");
  });

  it("is not offered when the opponent's biggest body is under 8000", () => {
    const game = table("eb04-007-no-target")
      .withBoard("p1", [character("zoro", "EB04-007", { playedTurn: 1 })])
      // ST31-002 Jinbe is a 6000.
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "zoro",
        ),
    ).toBe(false);
  });

  it("reads current power, so the Leader's own −1000 switches it off", () => {
    // "8000 power or more" is read after modifiers, not off the printed card.
    // The deck can turn its own clause off with its own Leader, which is the
    // clearest evidence that this is `minCurrentPower` rather than `minPower`.
    const game = table("eb04-007-current-power")
      .withBoard("p1", [character("zoro", "EB04-007", { playedTurn: 1 })])
      .withBoard("p2", [character("vista", "OP16-011", { rested: true })])
      .build();

    const zoroOffered = () =>
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "zoro",
        );

    expect(currentPower(game.state, "p2", "vista")).toBe(8000);
    expect(zoroOffered()).toBe(true);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "vista" });
    settle(game);

    expect(currentPower(game.state, "p2", "vista")).toBe(7000);
    expect(zoroOffered()).toBe(false);
  });
});

describe("EB04-052 Sanji", () => {
  covers("EB04-052", "[When Attacking]");

  it("attacks as whatever the opponent's Leader currently is", () => {
    const game = table("eb04-052-attacking")
      .withBoard("p1", [character("sanji", "EB04-052", { playedTurn: 1 })])
      .build();

    expect(currentPower(game.state, "p1", "sanji")).toBe(4000);
    game.play({ type: "attack", attackerInstanceId: "sanji" });
    settle(game);

    // ST21-001 Monkey.D.Luffy, the ST-31 Leader, is a 5000.
    expect(currentPower(game.state, "p1", "sanji")).toBe(
      currentPower(game.state, "p2", "p2-leader"),
    );
    expect(currentPower(game.state, "p1", "sanji")).toBe(5000);
  });

  it("copies 5000 from a Leader holding DON!! it was given last turn", () => {
    const game = table("eb04-052-defender-don")
      .withBoard("p1", [character("sanji", "EB04-052", { playedTurn: 1 })])
      .withGivenDon("p2", "p2-leader", 2)
      .build();

    game.play({ type: "attack", attackerInstanceId: "sanji" });
    settle(game);

    // The two DON!! cards sit under p2's Leader until p2's next Refresh, but
    // grant their +1000 during p2's turn only (CR 6-5-5-2). It is p1's turn, so
    // the Leader is a 5000 and that is what "becomes the same as" copies.
    expect(currentPower(game.state, "p1", "sanji")).toBe(5000);
  });

  it("copies base power, so DON!! given to Sanji stacks on top", () => {
    const game = table("eb04-052-base")
      .withBoard("p1", [character("sanji", "EB04-052", { playedTurn: 1 })])
      .withGivenDon("p1", "sanji", 2)
      .build();

    game.play({ type: "attack", attackerInstanceId: "sanji" });
    settle(game);

    // 5000 copied as the base, plus the two DON!! she is carrying.
    expect(currentPower(game.state, "p1", "sanji")).toBe(7000);
  });
});

describe("EB04-052 Sanji's On K.O.", () => {
  covers("EB04-052", "[On K.O.]");

  it("replaces itself with a yellow 6000-or-less body out of hand", () => {
    const game = defending("eb04-052-on-ko")
      .withLife("p1", 2)
      .withBoard("p1", [
        character("sanji", "EB04-052", { rested: true, playedTurn: 1 }),
      ])
      .withHand("p1", [
        // ST29-010 Franky, yellow and a printed 6000: exactly on the line.
        instance("franky", "ST29-010"),
        // EB04-007 Zoro is red, so outside the printed colour filter however
        // small the deck's red half is.
        instance("zoro", "EB04-007"),
      ])
      // ST31-002 Jinbe at 6000 beats a 4000 Sanji.
      .withBoard("p2", [character("jinbe", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "sanji",
    });
    declineDefence(game);

    expect(effectOptions(game.state)).toEqual(["franky", "done"]);
    game.play({ type: "resolve-effect", optionId: "franky" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("franky");
  });

  it("offers nothing while its controller still holds three Life cards", () => {
    const game = defending("eb04-052-high-life")
      .withLife("p1", 3)
      .withBoard("p1", [
        character("sanji", "EB04-052", { rested: true, playedTurn: 1 }),
      ])
      .withHand("p1", [instance("franky", "ST29-010")])
      .withBoard("p2", [character("jinbe", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "sanji",
    });
    declineDefence(game);
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("franky");
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "franky",
    );
  });
});

describe("EB04-054 Bartholomew Kuma", () => {
  covers("EB04-054", "[On Play]");

  it("banks the top card of the deck on Life at two Life cards", () => {
    const game = table("eb04-054-on-play")
      .withLife("p1", 2)
      .withHand("p1", [instance("kuma", "EB04-054")])
      .withDeckTop("p1", [instance("banked", "ST29-010")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-054" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(3);
    expect(game.state.players.p1.life[0]?.instanceId).toBe("banked");
    // Face-down: a card added off the deck has never been seen, so its
    // [Trigger] is not something the opponent can plan around.
    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
  });

  it("banks nothing at three Life cards", () => {
    const game = table("eb04-054-high-life")
      .withLife("p1", 3)
      .withHand("p1", [instance("kuma", "EB04-054")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-054" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(3);
  });
});

describe("EB04-054 Bartholomew Kuma's On K.O.", () => {
  covers("EB04-054", "[On K.O.]");

  it("moves a card off the opponent's Life into their hand, at any Life total", () => {
    // Unconditional, unlike its [On Play]: p1 is on its opening four here.
    const game = defending("eb04-054-on-ko")
      .withBoard("p1", [
        character("kuma", "EB04-054", { rested: true, playedTurn: 1 }),
      ])
      // OP16-011 Vista at 8000 beats a 7000 Kuma.
      .withBoard("p2", [character("vista", "OP16-011", { playedTurn: 1 })])
      .build();

    const opposingLife = game.state.players.p2.life.length;
    const topLife = game.state.players.p2.life[0]!.instanceId;
    game.play({
      type: "attack",
      attackerInstanceId: "vista",
      targetInstanceId: "kuma",
    });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p2.life).toHaveLength(opposingLife - 1);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      topLife,
    );
  });
});

describe("EB04-056 Pacifista", () => {
  covers("EB04-056", "static");

  it("blocks once its controller is out of Life under a [Jewelry Bonney]", () => {
    const game = defending("eb04-056-blocker")
      .withLife("p1", 0)
      .withBoard("p1", [character("pacifista", "EB04-056")])
      .withBoard("p2", [character("jinbe", "ST31-002", { playedTurn: 1 })])
      .build();

    expect(hasKeyword(game.state, "p1", "pacifista", "Blocker")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "pacifista" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("pacifista");
  });

  it("does not block with one Life card left", () => {
    // The last-ditch wall, not a general one: at 1 Life the Leader's own +2000
    // is what is holding the game up, and these are still 1000-power bodies.
    const game = defending("eb04-056-one-life")
      .withLife("p1", 1)
      .withBoard("p1", [character("pacifista", "EB04-056")])
      .build();

    expect(hasKeyword(game.state, "p1", "pacifista", "Blocker")).toBe(false);
  });

  it("does not block under a Leader that is not a [Jewelry Bonney]", () => {
    const game = scenario()
      .decks(OPPONENT, OPPONENT)
      .seed("eb04-056-wrong-leader")
      .atTurn(12, { active: "p2" })
      .withLife("p1", 0)
      .withBoard("p1", [character("pacifista", "EB04-056")])
      .build();

    expect(hasKeyword(game.state, "p1", "pacifista", "Blocker")).toBe(false);
  });
});

describe("EB04-061 Monkey.D.Luffy", () => {
  covers("EB04-061", "static");

  it("costs nine from hand with one Life card left and ten above it", () => {
    const discounted = table("eb04-061-discount")
      .withLife("p1", 1)
      .withHand("p1", [instance("luffy", "EB04-061")])
      .build();
    const full = table("eb04-061-full")
      .withLife("p1", 2)
      .withHand("p1", [instance("luffy", "EB04-061")])
      .build();

    // `playCostFromHand` and not `effectiveCost`: the clause prices the card
    // "in your hand", and the hand price is the only figure `play-card`
    // legality and payment read.
    expect(playCostFromHand(discounted.state, "p1", "EB04-061", 10)).toBe(9);
    expect(playCostFromHand(full.state, "p1", "EB04-061", 10)).toBe(10);
  });

  it("is still a ten on the board at one Life", () => {
    // The other half of "in your hand": the discount must not follow the body
    // onto the field, where it would answer removal printed to miss a 10-cost.
    const game = table("eb04-061-board-cost")
      .withLife("p1", 1)
      .withBoard("p1", [character("luffy", "EB04-061")])
      .build();

    expect(
      effectiveCost(game.state, "p1", {
        instanceId: "luffy",
        cardNumber: "EB04-061",
      }),
    ).toBe(10);
  });
});

describe("EB04-061 Monkey.D.Luffy's On Play", () => {
  covers("EB04-061", "[On Play]");

  it("trashes a card for +2000 on the Leader and [Blocker] on itself", () => {
    const game = table("eb04-061-on-play")
      .withLife("p1", 1)
      .withHand("p1", [
        instance("luffy", "EB04-061"),
        instance("fodder", "ST29-010"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-061" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
    // 5000 printed, +2000 from the clause; the Leader's own low-Life +2000 is
    // an [Opponent's Turn] layer and is not up on its controller's own turn.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
    expect(hasKeyword(game.state, "p1", "luffy", "Blocker")).toBe(true);

    game.pass();
    // Both halves last "[printed text omitted -- pnpm card:text <card>]", so
    // the 12000 wall is still standing when the attacks come in -- in front of
    // a Leader now carrying its own low-Life +2000 on top of this one.
    expect(hasKeyword(game.state, "p1", "luffy", "Blocker")).toBe(true);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(9000);
  });

  it("gives neither half to a hand it has emptied", () => {
    const game = table("eb04-061-no-cost")
      .withHand("p1", [instance("luffy", "EB04-061")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-061" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
    expect(hasKeyword(game.state, "p1", "luffy", "Blocker")).toBe(false);
  });
});

describe("OP07-107 Franky", () => {
  covers("OP07-107", "[Trigger]");

  it("draws and then plays itself off the second-to-last Life card", () => {
    const game = triggering("op07-107-trigger")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [
        instance("life-franky", "OP07-107"),
        instance("spare", "ST29-010"),
      ])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    // Draw 1, and then the flipped card onto the board rather than into hand.
    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).toContain("life-franky");
  });

  it("only draws while two Life cards are still behind the flipped one", () => {
    const game = triggering("op07-107-high-life")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [
        instance("life-franky", "OP07-107"),
        instance("spare", "ST29-010"),
        instance("spare-2", "ST29-010"),
      ])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP07-114 He Possesses the World's Most Brilliant Mind", () => {
  covers("OP07-114", "[Main]");

  it("digs five deep for an {Egghead} card that is not itself", () => {
    const game = table("op07-114-main")
      .withHand("p1", [instance("search", "OP07-114")])
      .withDeckTop("p1", [
        // {Egghead}, and named the same as the Event: excluded by name.
        instance("self-copy", "OP07-114"),
        // {Straw Hat Crew} only -- ST31-001 Sanji carries no {Egghead}.
        instance("off-type", "ST31-001"),
        instance("found", "ST29-010"),
        instance("off-type-2", "ST31-001"),
        instance("off-type-3", "ST31-001"),
        instance("deep", "EB04-056"),
      ])
      .build();

    // An Event with a `[Main]` program is offered as an activation, not as a
    // plain `play-card`.
    game.play({ type: "activate-main", sourceInstanceId: "search" });
    expect(effectOptions(game.state)).toEqual(["found", "done"]);
    game.play({ type: "resolve-effect", optionId: "found" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "found",
    ]);
    // The other four go to the bottom, leaving the sixth card on top.
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("deep");
  });
});

describe("OP07-114's Life Trigger", () => {
  covers("OP07-114", "[Trigger]");

  it("draws one card", () => {
    const game = triggering("op07-114-trigger")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [
        instance("life-event", "OP07-114"),
        instance("spare", "ST29-010"),
      ])
      .withDeckTop("p2", [instance("drawn", "ST29-010")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
  });
});

describe("OP12-119 Bartholomew Kuma", () => {
  covers("OP12-119", "[On Play]");

  it("trades a card from hand for a Life card and two turns of protection", () => {
    const game = table("op12-119-on-play")
      .withHand("p1", [
        instance("kuma", "OP12-119"),
        instance("fodder", "ST29-010"),
      ])
      .withDeckTop("p1", [instance("banked", "ST29-010")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "play-card", cardNumber: "OP12-119" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(lifeBefore + 1);
    expect(game.state.players.p1.life[0]?.instanceId).toBe("banked");
    // "[printed text omitted -- pnpm card:text OP12-119]": a 6-drop that
    // answers cost-6 removal as an 8.
    const onBoard = game.state.players.p1.board.find(
      (card) => card.instanceId === "kuma",
    )!;
    expect(effectiveCost(game.state, "p1", onBoard)).toBe(8);
  });

  it("gives nothing to a hand that cannot pay", () => {
    const game = table("op12-119-no-cost")
      .withHand("p1", [instance("kuma", "OP12-119")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "play-card", cardNumber: "OP12-119" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
  });
});

describe("OP12-119 Bartholomew Kuma's On K.O.", () => {
  covers("OP12-119", "[Opponent's Turn]", "[On K.O.]");

  it("buys a Life card back when it dies on the opponent's turn", () => {
    // The `[Opponent's Turn]` gate is asserted from this side only: nothing in
    // the format lets the controller's own turn K.O. a 7000 body it owns, so
    // the negative case is a position the engine cannot be driven to.
    const game = defending("op12-119-on-ko")
      .withBoard("p1", [
        character("kuma", "OP12-119", { rested: true, playedTurn: 1 }),
      ])
      .withDeckTop("p1", [instance("banked", "ST29-010")])
      .withBoard("p2", [character("vista", "OP16-011", { playedTurn: 1 })])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({
      type: "attack",
      attackerInstanceId: "vista",
      targetInstanceId: "kuma",
    });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(lifeBefore + 1);
    expect(game.state.players.p1.life[0]?.instanceId).toBe("banked");
  });
});

describe("OP13-108 Jewelry Bonney", () => {
  covers("OP13-108", "[On Play]");

  it("rushes under an {Egghead} Leader and hands a Life card back", () => {
    const game = table("op13-108-on-play")
      .withHand("p1", [instance("bonney", "OP13-108")])
      .build();

    const opposingLife = game.state.players.p2.life.length;
    const topLife = game.state.players.p2.life[0]!.instanceId;
    game.play({ type: "play-card", cardNumber: "OP13-108" });
    settle(game);

    // EB04-001 carries {Egghead}, so the 10000 body can swing immediately.
    expect(hasKeyword(game.state, "p1", "bonney", "Rush")).toBe(true);
    // The compensation is a separate sentence and is not conditional on it.
    expect(game.state.players.p2.life).toHaveLength(opposingLife - 1);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      topLife,
    );
  });

  it("hands the Life card back even without the {Egghead} Leader", () => {
    const game = scenario()
      .decks(OPPONENT, OPPONENT)
      .seed("op13-108-wrong-leader")
      .atTurn(11, { active: "p1" })
      .withHand("p1", [instance("bonney", "OP13-108")])
      .build();

    const opposingLife = game.state.players.p2.life.length;
    game.play({ type: "play-card", cardNumber: "OP13-108" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "bonney", "Rush")).toBe(false);
    expect(game.state.players.p2.life).toHaveLength(opposingLife - 1);
  });
});

describe("OP13-108 Jewelry Bonney's Life Trigger", () => {
  covers("OP13-108", "[Trigger]");

  it("rests a cost-7-or-less Character off the second-to-last Life card", () => {
    const game = triggering("op13-108-trigger")
      .withBoard("p1", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        // ST31-001 Sanji is a 5-cost, inside "a cost of 7 or less".
        character("in-range", "ST31-001", { playedTurn: 1 }),
      ])
      .withLife("p2", [
        instance("life-bonney", "OP13-108"),
        instance("spare", "ST29-010"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "in-range" });
    settle(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "in-range")
        ?.rested,
    ).toBe(true);
  });
});
