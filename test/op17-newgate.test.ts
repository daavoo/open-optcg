import { describe, expect, it } from "vitest";
import { loadDeck, requireSupportedDeck } from "@one-piece-sim/decks";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  playCostFromHand,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * Red Edward.Newgate: the list in
 * `packages/decks/src/op17-newgate-manifest.ts`.
 *
 * Every clause here was already registered -- OP17 came into the pool as a
 * whole series -- and every one of them was unreachable, because five of the
 * six that matter are gated on a Leader *named* Edward.Newgate and no shipped
 * deck played one. So this file is not "the new cards"; it is the first
 * position from which those gates are open, and each case that fires behind
 * OP17-001 is paired with the same play behind another Leader, where the
 * printed condition says nothing should happen. A clause whose gate is never
 * shown closed is a clause nobody has tested.
 *
 * `test/op16-ace.test.ts` drives OP17-004, OP17-005 and OP17-016, and
 * `test/op16.test.ts` OP16-021 and OP16-118, so they are not repeated here.
 * OP17-006 Kingdew prints no clause at all.
 */

const DECK = "(Red) Edward.Newgate - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** p1 on the Newgate list, in its own Main Phase with ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(DECK, OPPONENT).seed(seed).atTurn(11, { active: "p1" });

/** p1 on the Newgate list, defending, for the clauses gated on the other turn. */
const defending = (seed: string) =>
  scenario().decks(DECK, OPPONENT).seed(seed).atTurn(12, { active: "p2" });

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
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/**
 * Decline the block step and its Leader ability, stopping at the Counter step.
 *
 * A Counter Event has to be played from inside that step, which is why this is
 * not `declineDefence`: that one runs the whole defence out.
 */
const declineLeaderAbility = (game: {
  state: GameState;
  pass: () => void;
  play: (matcher: { type: "resolve-effect"; optionId?: string }) => unknown;
}) => {
  while (game.state.phase === "block") {
    if (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      const decline =
        options.find(
          (optionId) => optionId === "skip" || optionId === "done",
        ) ?? options.at(-1);
      if (!decline) throw new Error("pending effect offered nothing");
      game.play({ type: "resolve-effect", optionId: decline });
      continue;
    }
    game.pass();
  }
};

/**
 * Decline the block and Counter steps, so a declared attack resolves.
 *
 * `trigger` says what to do with the Life Trigger the damage may open:
 * "decline" takes the flipped card to hand, "stop" hands the decision back to
 * the test.
 */
const declineDefence = (
  game: {
    state: GameState;
    pass: () => void;
    legalActions: () => readonly { type: string; summary: string }[];
    play: (matcher: {
      type: "resolve-effect" | "resolve-trigger";
      optionId?: string;
      summary?: string;
    }) => unknown;
  },
  trigger: "decline" | "stop" = "decline",
) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    if (
      game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      if (trigger === "stop") return;
      game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
      continue;
    }
    if (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      const decline =
        options.find(
          (optionId) => optionId === "skip" || optionId === "done",
        ) ?? options.at(-1);
      if (!decline) throw new Error("pending effect offered nothing");
      game.play({ type: "resolve-effect", optionId: decline });
      continue;
    }
    game.pass();
  }
};

describe("Red Edward.Newgate deck list", () => {
  it("loads a 50-card Standard list behind OP17-001", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP17-001");
    expect(manifest.format).toBe("standard");
    expect(loadDeck(DECK)).toHaveLength(50);
  });
});

describe("OP17-001 Edward.Newgate (Leader)", () => {
  covers("OP17-001", "[On Your Opponent's Attack]");

  it("trashes a card to put +4000 into the battle, on the Leader itself", () => {
    const game = defending("op17-001-leader")
      .bareTable()
      .withHand("p1", [instance("pitch", "OP17-006")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    // The offer belongs to the defender, inside the block step.
    expect(game.state.activePlayer).toBe("p1");
    expect(game.state.phase).toBe("block");
    expect(effectOptions(game.state).sort()).toEqual(["apply", "skip"]);

    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch" });

    // "During this battle": the battle's counter power, not a turn-scoped
    // modifier on the Leader.
    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    expect(game.state.players.p1.leaderPowerModifiers).toEqual([]);
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP17-006",
    ]);
  });

  it("may spend the +4000 on a Character instead, and only once a turn", () => {
    const game = defending("op17-001-character")
      .bareTable()
      .withHand("p1", [
        instance("pitch-a", "OP17-006"),
        instance("pitch-b", "OP17-006"),
      ])
      .withBoard("p1", [character("kingdew", "OP17-006", { rested: true })])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("second", "ST32-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "kingdew",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "pitch-a" });
    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    declineDefence(game);

    // Second attack, same turn, second card still in hand: `[Once Per Turn]`
    // means the ability is not offered again.
    game.play({
      type: "attack",
      attackerInstanceId: "second",
      targetInstanceId: "p1-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("is not offered, or forecast, on an empty hand", () => {
    const game = defending("op17-001-empty")
      .bareTable()
      .withHand("p1", [])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    const attack = game.action({
      type: "attack",
      targetInstanceId: "p1-leader",
    });
    if (attack.type !== "attack") throw new Error("EXPECTED_ATTACK");
    // The forecast reads the same program the resolution does, so with no card
    // to trash it must not promise the defender 4000 it cannot have.
    expect(attack.effectiveTargetPower).toBe(attack.targetPower);

    game.submit(attack);
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP17-002 Atmos", () => {
  covers("OP17-002", "[Opponent's Turn]");

  it("defends at 9000 and attacks at 6000", () => {
    const theirs = defending("op17-002-defending")
      .bareTable()
      .withBoard("p1", [character("atmos", "OP17-002")])
      .build();
    expect(currentPower(theirs.state, "p1", "atmos")).toBe(9_000);

    const mine = table("op17-002-attacking")
      .bareTable()
      .withBoard("p1", [character("atmos", "OP17-002")])
      .build();
    expect(currentPower(mine.state, "p1", "atmos")).toBe(6_000);
  });
});

describe("OP17-003 Izo", () => {
  covers("OP17-003", "[On Play]", "[Rush: Character]");

  it("takes 6000 off a rested Character behind its own Leader, and nothing behind another", () => {
    const game = table("op17-003-on-play")
      .bareTable()
      .withHand("p1", [instance("izo", "OP17-003")])
      .withBoard("p2", [
        character("rested", "OP17-006", { rested: true }),
        character("active", "OP17-006"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-003" });
    // Only the rested body is eligible: "rested" is part of the printed target.
    expect(effectOptions(game.state)).toEqual(["rested", "done"]);
    game.play({ type: "resolve-effect", optionId: "rested" });
    settle(game);

    expect(currentPower(game.state, "p2", "rested")).toBe(2_000);
    expect(currentPower(game.state, "p2", "active")).toBe(8_000);

    // The other branch is a {Land of Wano} Leader. OP16-001 Portgas.D.Ace --
    // the Leader of `op16-ace-manifest.ts`, the other Whitebeard Pirates deck
    // in the catalog -- is neither that nor named Edward.Newgate, so the
    // clause finds nothing to do.
    const elsewhere = table("op17-003-other-leader")
      .bareTable()
      .withLeader("p1", "OP16-001")
      .withHand("p1", [instance("izo", "OP17-003")])
      .withBoard("p2", [character("rested", "OP17-006", { rested: true })])
      .build();

    elsewhere.play({ type: "play-card", cardNumber: "OP17-003" });
    settle(elsewhere);
    expect(currentPower(elsewhere.state, "p2", "rested")).toBe(8_000);
  });

  it("can attack a Character the turn it lands", () => {
    const game = table("op17-003-rush")
      .bareTable()
      .withBoard("p1", [character("izo", "OP17-003", { playedTurn: 11 })])
      .build();

    expect(hasKeyword(game.state, "p1", "izo", "Rush: Character")).toBe(true);
    expect(hasKeyword(game.state, "p1", "izo", "Rush")).toBe(false);
  });
});

describe("OP17-007 Kouzuki Oden", () => {
  covers("OP17-007", "[On Play]");

  it("deploys one 6000-or-less body of either type out of hand", () => {
    const game = table("op17-007-on-play")
      .bareTable()
      .withHand("p1", [
        instance("oden", "OP17-007"),
        instance("izo", "OP17-003"), // {Land of Wano}, 6000: eligible
        instance("atmos", "OP17-002"), // {Whitebeard Pirates}, 6000: eligible
        instance("jozu", "OP17-008"), // {Whitebeard Pirates}, 8000: too big
        instance("event", "OP17-019"), // not a Character at all
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-007" });
    expect(effectOptions(game.state)).toEqual(["izo", "atmos", "done"]);
    game.play({ type: "resolve-effect", optionId: "izo" });
    settle(game);

    // Two bodies for one play, and Izo's own [On Play] chained off it.
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-007",
      "OP17-003",
    ]);
  });

  it("deploys nothing behind a Leader that is neither named nor {Land of Wano}", () => {
    const game = table("op17-007-other-leader")
      .bareTable()
      .withLeader("p1", "OP16-001")
      .withHand("p1", [
        instance("oden", "OP17-007"),
        instance("atmos", "OP17-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-007" });
    settle(game);
    expect(game.state.players.p1.board).toHaveLength(1);
    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "OP17-002",
    );
  });
});

describe("OP17-008 Jozu", () => {
  covers("OP17-008", "[On Play]");

  it("makes the Leader's base power 8000 into the opponent's turn", () => {
    const game = table("op17-008-on-play")
      .bareTable()
      .withHand("p1", [instance("jozu", "OP17-008")])
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
    game.play({ type: "play-card", cardNumber: "OP17-008" });
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);

    // A new *base*, not a turn-scoped buff: it is still 8000 on the turn the
    // opponent attacks into it, which is the only turn it matters.
    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);
  });

  it("leaves another Leader's power alone", () => {
    const game = table("op17-008-other-leader")
      .bareTable()
      .withLeader("p1", "OP16-001")
      .withHand("p1", [instance("jozu", "OP17-008")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-008" });
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
  });
});

describe("OP17-009 Haruta", () => {
  covers("OP17-009", "[On Play]", "[Opponent's Turn]");

  it("K.O.s a printed 2000 and stops one thousand short of a 3000", () => {
    const game = table("op17-009-on-play")
      .bareTable()
      .withHand("p1", [instance("haruta", "OP17-009")])
      .withBoard("p2", [
        character("small", "OP17-016"), // printed 2000: exactly on the bound
        character("big", "ST31-003"), // printed 3000: one thousand over it
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-009" });
    expect(effectOptions(game.state)).toEqual(["small", "done"]);
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
  });

  it("defends at 8000 and attacks at 5000", () => {
    const theirs = defending("op17-009-defending")
      .bareTable()
      .withBoard("p1", [character("haruta", "OP17-009")])
      .build();
    expect(currentPower(theirs.state, "p1", "haruta")).toBe(8_000);

    const mine = table("op17-009-attacking")
      .bareTable()
      .withBoard("p1", [character("haruta", "OP17-009")])
      .build();
    expect(currentPower(mine.state, "p1", "haruta")).toBe(5_000);
  });
});

describe("OP17-013 Portgas.D.Ace", () => {
  covers("OP17-013", "[On Play]", "static");

  it("takes 6000 off a rested Character behind its own Leader", () => {
    const game = table("op17-013-on-play")
      .bareTable()
      .withHand("p1", [instance("ace", "OP17-013")])
      .withBoard("p2", [
        character("rested", "OP17-006", { rested: true }),
        character("active", "OP17-006"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-013" });
    expect(effectOptions(game.state)).toEqual(["rested", "done"]);
    game.play({ type: "resolve-effect", optionId: "rested" });
    settle(game);

    expect(currentPower(game.state, "p2", "rested")).toBe(2_000);
    expect(currentPower(game.state, "p2", "active")).toBe(8_000);
  });

  it("has no clause at all behind another Leader", () => {
    const game = table("op17-013-other-leader")
      .bareTable()
      .withLeader("p1", "OP16-001")
      .withHand("p1", [instance("ace", "OP17-013")])
      .withBoard("p2", [character("rested", "OP17-006", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-013" });
    settle(game);
    expect(currentPower(game.state, "p2", "rested")).toBe(8_000);
  });

  it("costs 2 less while the opponent holds a printed 10000", () => {
    const plain = table("op17-013-cost")
      .bareTable()
      .withHand("p1", [instance("ace", "OP17-013")])
      .build();
    expect(playCostFromHand(plain.state, "p1", "OP17-013", 6)).toBe(6);

    // The threshold is printed power, and it is the *opponent's* board.
    const discounted = table("op17-013-cost-discounted")
      .bareTable()
      .withHand("p1", [instance("ace", "OP17-013")])
      .withBoard("p2", [character("big", "OP17-005")]) // printed 12000
      .build();
    expect(playCostFromHand(discounted.state, "p1", "OP17-013", 6)).toBe(4);

    const ownSide = table("op17-013-cost-own-side")
      .bareTable()
      .withHand("p1", [instance("ace", "OP17-013")])
      .withBoard("p1", [character("big", "OP17-005")])
      .build();
    expect(playCostFromHand(ownSide.state, "p1", "OP17-013", 6)).toBe(6);
  });
});

describe("OP17-015 Marco", () => {
  covers("OP17-015", "[On K.O.]");

  it("comes back from the trash when it dies, for a Whitebeard Pirate in hand", () => {
    const game = defending("op17-015-on-ko")
      .bareTable()
      .withHand("p1", [instance("fuel", "OP17-002")])
      .withBoard("p1", [character("marco", "OP17-015", { rested: true })])
      .withBoard("p2", [character("attacker", "OP17-005")]) // 12000, so 6000 dies
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "marco",
    });
    declineDefence(game);
    settle(game);

    // The card that paid is in the trash; Marco is back on the board.
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP17-002",
    ]);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-015",
    ]);
  });

  it("stays dead with no Whitebeard Pirate in hand to trash", () => {
    const game = defending("op17-015-no-fuel")
      .bareTable()
      .withHand("p1", [])
      .withBoard("p1", [character("marco", "OP17-015", { rested: true })])
      .withBoard("p2", [character("attacker", "OP17-005")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "marco",
    });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP17-015",
    ]);
  });
});

describe("OP17-017 Ga Ha Ha Ha!!", () => {
  covers("OP17-017", "[Counter]");

  it("buys 2000 for a Whitebeard Pirate and takes 2000 off the attacker", () => {
    const game = defending("op17-017-counter")
      .bareTable()
      .withHand("p1", [instance("gura", "OP17-017")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineLeaderAbility(game);
    expect(game.state.phase).toBe("counter");

    game.play({ type: "activate-counter-event" });
    // The debuff half is a free choice over the opponent's whole side.
    expect(effectOptions(game.state)).toContain("attacker");
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);

    // The Leader is a {Whitebeard Pirates} card, so the rider applies.
    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(currentPower(game.state, "p2", "attacker")).toBe(3_000);
  });

  it("drops the rider when what is being attacked is not a Whitebeard Pirate", () => {
    const game = defending("op17-017-off-type")
      .bareTable()
      .withHand("p1", [instance("gura", "OP17-017")])
      .withBoard("p1", [character("outsider", "ST31-003", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "outsider",
    });
    declineLeaderAbility(game);
    game.play({ type: "activate-counter-event" });
    settle(game);

    // No +2000, but the debuff still lands: it is not conditional on the buff.
    expect(game.state.activeAttack?.counterPower).toBe(0);
  });
});

describe("OP17-019 I Don't Have Time to Chat with Snot-Nosed Brats", () => {
  covers("OP17-019", "[Main]", "[Trigger]");

  it("looks five deep and takes a Whitebeard Pirate", () => {
    const game = table("op17-019-main")
      .bareTable()
      .withHand("p1", [instance("event", "OP17-019")])
      .withDeckTop("p1", [
        instance("d1", "ST31-003"),
        instance("d2", "ST31-003"),
        instance("wanted", "OP17-002"),
        instance("d4", "ST31-003"),
        instance("d5", "ST31-003"),
        instance("d6", "OP17-002"), // sixth: out of reach
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-event:event" });
    // Five deep: the sixth Whitebeard Pirate is not among the options.
    expect(effectOptions(game.state)).toEqual(["wanted", "done"]);
    game.play({ type: "resolve-effect", optionId: "wanted" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "wanted",
    );
  });

  it("raises the Leader by 1000 as a Life Trigger", () => {
    const game = defending("op17-019-trigger")
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      // First is the top of the Life pile, which is the card damage takes.
      .withLife("p1", [
        instance("life-event", "OP17-019"),
        instance("spare", "ST31-003"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game, "stop");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(
      game.state.players.p1.leaderPowerModifiers.map(
        (modifier) => modifier.amount,
      ),
    ).toContain(1_000);
  });
});
