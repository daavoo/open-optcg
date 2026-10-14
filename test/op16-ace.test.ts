import { describe, expect, it } from "vitest";
import { loadDeck, requireSupportedDeck } from "@one-piece-sim/decks";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  observe,
  playCostFromHand,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP-17 Red Ace: the Whitebeard Pirates list in
 * `packages/decks/src/op16-ace-manifest.ts`.
 *
 * The identities this list is the first shipped deck to play: the two in
 * `packages/cards/src/op16-ace.ts`, the six OP16 cards nothing drove before it,
 * and the three OP17 red slots `test/op17.test.ts` had no deck to reach --
 * OP17-004, OP17-005 and OP17-016. Coverage is per clause rather than per file,
 * so those three live here, with the deck that brought them under the gate.
 *
 * The Leader gets a section of its own even though it is not new, because the
 * clause it prints is the one thing every other card in the list feeds, and
 * because the selector reading it was wrong: "a type including
 * "Whitebeard Pirates"" also reaches {Whitebeard Pirates Allies}, so the two
 * Allies bodies at exactly 8000 were silently not Rush targets.
 */

const DECK = "(Red) Portgas.D.Ace - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** p1 on the play with a clear board and all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p1 defending, for the clauses that only fire under an attack. */
const defending = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Resolve the rest of an open effect, taking the first offer at each step. */
function finish(game: {
  state: GameState;
  play: (matcher: { type: "resolve-effect" }) => unknown;
}) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

describe("OP-17 Red Ace deck list", () => {
  it("loads a 50-card list behind OP16-001", () => {
    const manifest = requireSupportedDeck(DECK);
    expect(manifest.leader).toBe("OP16-001");
    expect(loadDeck(DECK)).toHaveLength(50);
  });
});

describe("OP16-001 Portgas.D.Ace (Leader)", () => {
  covers("OP16-001", "[Activate: Main]");

  it("offers every 8000-power Whitebeard Pirate, Allies included", () => {
    const game = table("op16-001-rush")
      .withBoard("p1", [
        // The named half: not a Whitebeard Pirate at all, and under 8000.
        character("luffy", "OP16-015"),
        // {Whitebeard Pirates}, 8000.
        character("vista", "OP16-011"),
        // {Whitebeard Pirates Allies}, 8000 -- but only while an 8-cost
        // Whitebeard Pirate is out, which Thatch supplies.
        character("oars", "OP16-017"),
        character("thatch", "OP16-005"),
        // {Whitebeard Pirates}, but 2000: under the printed floor.
        character("namule", "OP16-010"),
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });
    game.play({ type: "resolve-effect", optionId: "whitebeard" });

    // The three 8000s, and neither the 2000 body nor Luffy, who belongs to the
    // other branch. `oars` is the one an exact type match dropped.
    expect(effectOptions(game.state)).toEqual([
      "vista",
      "oars",
      "thatch",
      "done",
    ]);
    game.play({ type: "resolve-effect", optionId: "oars" });
    finish(game);

    // [Rush]: the Allies body may now attack the turn it was played.
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "oars",
        ),
    ).toBe(true);
  });

  it("grants Rush to a [Monkey.D.Luffy] Character under the power floor", () => {
    const game = table("op16-001-luffy")
      .withBoard("p1", [character("luffy", "OP16-015")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });
    game.play({ type: "resolve-effect", optionId: "luffy" });
    expect(effectOptions(game.state)).toEqual(["luffy", "done"]);
    game.play({ type: "resolve-effect", optionId: "luffy" });
    finish(game);

    // 6000 power, so the {Whitebeard Pirates} branch could never have reached
    // it: the named branch carries no floor.
    expect(currentPower(game.state, "p1", "luffy")).toBe(6000);
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "luffy",
        ),
    ).toBe(true);
  });
});

describe("OP13-016 Monkey.D.Garp", () => {
  covers("OP13-016", "[On Play]");

  const withFiveOnTop = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("garp", "OP13-016")])
      .withDeckTop("p1", [
        instance("vista", "OP16-011"), // cost 6
        instance("asl", "OP13-007"), // cost 1 -- under the floor
        instance("newgate", "OP17-005"), // cost 10
        instance("moby", "OP16-021"), // cost 1 -- under the floor
        instance("rakuyo", "OP17-016"), // cost 3, exactly the floor
      ]);

  it("digs four deep and reveals only a card costing 3 or more", () => {
    const game = withFiveOnTop("op13-016-search").build();

    game.play({ type: "play-card", cardNumber: "OP13-016" });

    // Four cards looked at, not five: Rakuyo is the fifth and is never seen,
    // even though it satisfies the filter exactly.
    expect(effectOptions(game.state)).toEqual(["vista", "newgate", "done"]);
    game.play({ type: "resolve-effect", optionId: "newgate" });
    finish(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "newgate",
    );
    // "[printed text omitted -- pnpm card:text <card>]": the three that were
    // not taken, in the order they were looked at, and Rakuyo still on top.
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("rakuyo");
    expect(
      game.state.players.p1.deck.slice(-3).map((card) => card.instanceId),
    ).toEqual(["vista", "asl", "moby"]);
  });

  it("does nothing behind a Leader that is none of the three names", () => {
    // ST31-001 Monkey.D.Luffy would pass -- the clause names
    // [Monkey.D.Luffy] -- so the negative case needs a fourth Leader. ST32-004
    // Roronoa Zoro is none of the three, and the whole clause, the look
    // included, never happens.
    const game = withFiveOnTop("op13-016-gate")
      .withLeader("p1", "ST32-004")
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-016" });

    expect(game.state.pendingEffect).toBeNull();
    expect(effectOptions(game.state)).toEqual([]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("vista");
  });
});

describe("OP13-007 Ace & Sabo & Luffy", () => {
  covers("OP13-007", "[Activate: Main]");

  it("pays an active DON!! and itself to take 3000 off a Character", () => {
    const game = table("op13-007-debuff")
      .withBoard("p1", [character("asl", "OP13-007")])
      .withBoard("p2", [character("target", "ST31-002")])
      .build();

    const donBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", optionId: "mechanic-main:asl" });
    // "give 1 of your **active** DON!! cards", so the offer says active: the
    // given card stays active and buys power for the rest of the turn.
    expect(
      game
        .legalActions("p1")
        .find(
          (action) =>
            action.type === "resolve-effect" && action.optionId === "p1-leader",
        )?.summary,
    ).toContain("active DON!!");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "target" });
    finish(game);

    expect(game.state.players.p1.activeDon.length).toBe(donBefore - 1);
    expect(game.state.players.p1.leaderAttachedDon.length).toBe(1);
    // 5000 printed Leader plus the +1000 the given DON!! is worth.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
    // "and trash this Character": the body is gone, and it was *trashed* rather
    // than K.O.'d, so nothing keying on a K.O. fired.
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP13-007");
    // ST31-002 Jinbe is 6000 printed.
    expect(currentPower(game.state, "p2", "target")).toBe(3000);
  });

  it("is not offered with no active DON!! to pay with", () => {
    const game = table("op13-007-broke")
      .withBoard("p1", [character("asl", "OP13-007")])
      // `bareTable` leaves all ten active; this moves every one of them to the
      // rested pool, so the printed cost has nothing to pay it.
      .withDon("p1", { rested: 10 })
      .build();

    expect(game.state.players.p1.activeDon).toHaveLength(0);
    // Matched on the option id rather than the type: the Leader's own
    // `[Activate: Main]` costs nothing and is offered either way.
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.optionId === "mechanic-main:asl",
        ),
    ).toBe(false);
  });
});

describe("OP16-005 Thatch", () => {
  covers("OP16-005", "static", "[Blocker]");

  it("prices itself at 5 once an 8000-power Whitebeard Pirate is out", () => {
    const bare = table("op16-005-full")
      .withHand("p1", [instance("thatch", "OP16-005")])
      .build();
    // Printed 8, and nothing on the board to discount it.
    expect(playCostFromHand(bare.state, "p1", "OP16-005", 8)).toBe(8);

    const withAlly = table("op16-005-cheap")
      .withHand("p1", [instance("thatch", "OP16-005")])
      // {Whitebeard Pirates Allies} at 8000, held up by an 8-cost Whitebeard
      // Pirate so its own penalty is off. "a type including" reaches it, so an
      // exact-match reading of the clause would have charged 8 here.
      .withBoard("p1", [
        character("oars", "OP16-017"),
        character("newgate", "OP16-003"),
      ])
      .build();
    expect(playCostFromHand(withAlly.state, "p1", "OP16-005", 8)).toBe(5);

    // A Whitebeard Pirate under the power floor is not enough on its own.
    const tooSmall = table("op16-005-small")
      .withHand("p1", [instance("thatch", "OP16-005")])
      .withBoard("p1", [character("namule", "OP16-010")])
      .build();
    expect(playCostFromHand(tooSmall.state, "p1", "OP16-005", 8)).toBe(8);

    // The floor is the power the board shows, not the power the card prints.
    // LittleOars Jr. alone is a 4000-power body -- its own -4000 is live until
    // an 8-cost Whitebeard Pirate joins it -- so it does not price this at 5,
    // even though its printed 8000 would. A trace had Thatch offered for 5 off
    // exactly this board, and playing it switched the -4000 off in hindsight.
    const debuffed = table("op16-005-debuffed")
      .withHand("p1", [instance("thatch", "OP16-005")])
      .withBoard("p1", [character("oars", "OP16-017")])
      .build();
    expect(currentPower(debuffed.state, "p1", "oars")).toBe(4000);
    expect(playCostFromHand(debuffed.state, "p1", "OP16-005", 8)).toBe(8);

    // The clause prices the card *in hand*: the body on the board still costs
    // 8, which is what keeps it out of reach of "cost 5 or less" removal.
    const played = table("op16-005-board")
      .withBoard("p1", [
        character("thatch", "OP16-005"),
        character("newgate", "OP16-003"),
      ])
      .build();
    const board = played.state.players.p1.board[0];
    expect(board?.cardNumber).toBe("OP16-005");
    expect(effectiveCost(played.state, "p1", board!)).toBe(8);
  });

  it("blocks an attack aimed at the Leader", () => {
    const game = defending("op16-005-block")
      .withBoard("p1", [character("thatch", "OP16-005")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "thatch",
        ),
    ).toBe(true);
  });
});

describe("OP16-017 LittleOars Jr.", () => {
  covers("OP16-017", "static", "[Blocker]");

  it("is 4000 without an 8-cost Whitebeard Pirate and 8000 with one", () => {
    const alone = table("op16-017-alone")
      .withBoard("p1", [character("oars", "OP16-017")])
      .build();
    // Printed 8000 minus the printed 4000 penalty. Its own cost is 4, so it can
    // never satisfy its own condition.
    expect(currentPower(alone.state, "p1", "oars")).toBe(4000);

    const withGiant = table("op16-017-giant")
      .withBoard("p1", [
        character("oars", "OP16-017"),
        // OP16-003 Edward.Newgate, cost 8 and {Whitebeard Pirates}.
        character("newgate", "OP16-003"),
      ])
      .build();
    expect(currentPower(withGiant.state, "p1", "oars")).toBe(8000);

    // A 7-cost Whitebeard Pirate is one short of the printed floor.
    const withSeven = table("op16-017-seven")
      .withBoard("p1", [
        character("oars", "OP16-017"),
        character("kingdew", "OP17-006"),
      ])
      .build();
    expect(currentPower(withSeven.state, "p1", "oars")).toBe(4000);

    // OP17-005 Edward.Newgate is cost 10 printed, and its own "-4 cost" clause
    // is a *hand* price -- so the body on the board still reads 10 here and
    // holds the penalty off.
    const withNewgate = table("op16-017-op17")
      .withBoard("p1", [
        character("oars", "OP16-017"),
        character("newgate", "OP17-005"),
      ])
      .build();
    expect(currentPower(withNewgate.state, "p1", "oars")).toBe(8000);
  });

  it("blocks even while the penalty is live", () => {
    const game = defending("op16-017-block")
      .withBoard("p1", [character("oars", "OP16-017")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();
    expect(currentPower(game.state, "p1", "oars")).toBe(4000);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "oars",
        ),
    ).toBe(true);
  });
});

describe("OP16-118 Portgas.D.Ace", () => {
  covers("OP16-118", "static", "[On Play]", "[On K.O.]");

  it("makes every 8000-or-more Character in hand a 2000 Counter", () => {
    const game = defending("op16-118-counter")
      .withBoard("p1", [character("ace", "OP16-118")])
      .withHand("p1", [
        instance("vista", "OP16-011"), // 8000, no printed Counter
        instance("oars", "OP16-017"), // 8000, printed 1000
        instance("newgate", "OP16-003"), // 10000, no printed Counter
        instance("garp", "OP13-016"), // 2000, printed 1000: under the floor
      ])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    // Decline the block step: Counters are only offered once past it.
    game.pass();

    const counters = new Map(
      game
        .legalActions("p1")
        .filter((action) => action.type === "counter")
        .map((action) => [action.cardInstanceId, action.summary]),
    );
    // A body with no printed Counter becomes a Counter card at all, and the one
    // printing 1000 is raised rather than left alone: "becomes", not "gains".
    expect(counters.get("vista")).toContain("2000");
    expect(counters.get("oars")).toContain("2000");
    // Bandai's OP-17 Q&A: "8000 power or more and no Counter" is treated as
    // Counter +2000, so the 10000 top end is a Counter card too.
    expect(counters.get("newgate")).toContain("2000");
    // Under the floor the printed Counter stands.
    expect(counters.get("garp")).toContain("1000");
    expect(counters.get("garp")).not.toContain("2000");
  });

  it("gives a 12000 body in hand +2000, not +3000, beside OP17-063 Kaido", () => {
    // The OP-17 Q&A case: Ace on the field, a Character in hand above 8000 with
    // no printed Counter. OP17-063 Kaido's own "+1000 to a card without a
    // Counter" is on the same board, and the ruling's answer is still +2000:
    // the card is treated as having a Counter, so Kaido's clause has nothing
    // to add to.
    const game = defending("op16-118-kaido")
      .withBoard("p1", [
        character("ace", "OP16-118"),
        character("kaido", "OP17-063"),
      ])
      .withHand("p1", [instance("whitebeard", "OP17-005")]) // 12000, no Counter
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();

    game.play({ type: "counter", cardInstanceId: "whitebeard" });
    expect(game.events).toContainEqual(
      expect.objectContaining({
        type: "counter-used",
        cardNumber: "OP17-005",
        power: 2000,
      }),
    );
    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });

  it("stops raising Counters once it leaves the board", () => {
    const game = defending("op16-118-gone")
      .withHand("p1", [instance("vista", "OP16-011")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();

    // Vista prints no Counter, so with no Ace out it is not a Counter card.
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "counter" && action.cardInstanceId === "vista",
        ),
    ).toBe(false);
  });

  it("searches five deep on play for a Luffy or a Whitebeard Pirate", () => {
    const game = table("op16-118-search")
      .withHand("p1", [instance("ace", "OP16-118")])
      .withDeckTop("p1", [
        instance("luffy", "OP16-015"), // the named half
        instance("garp", "OP13-016"), // {Navy}: neither half
        instance("oars", "OP16-017"), // {Whitebeard Pirates Allies}
        instance("moby", "OP16-021"), // a {Whitebeard Pirates} Stage
        instance("kingdew", "OP17-006"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-118" });

    // "up to 1 card", not "Character card": the Stage qualifies. Garp does not,
    // and `oars` is the {Whitebeard Pirates Allies} body an exact type match
    // dropped.
    expect(effectOptions(game.state)).toEqual([
      "luffy",
      "oars",
      "moby",
      "kingdew",
      "done",
    ]);
    game.play({ type: "resolve-effect", optionId: "luffy" });
    finish(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "luffy",
    );
  });

  it("searches again when it is K.O.'d", () => {
    // Ace is 6000 and nothing in the deck K.O.s a body that big, so the K.O.
    // comes from losing a battle: a 10000 attacker into the 6000 body, with p1
    // declining both defence steps. Rested, because only a rested Character is
    // a legal attack target.
    const game = defending("op16-118-ko")
      .withBoard("p1", [character("ace", "OP16-118", { rested: true })])
      .withBoard("p2", [character("big", "OP16-003")])
      .withDeckTop("p1", [instance("vista", "OP16-011")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "big",
      targetInstanceId: "ace",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }

    // 10000 into 6000: Ace dies, and the [On K.O.] half of "[On Play]/[On K.O.]"
    // runs the same search program the [On Play] half does.
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP16-118");
    expect(effectOptions(game.state)).toContain("vista");
    game.play({ type: "resolve-effect", optionId: "vista" });
    finish(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "vista",
    );
  });
});

describe("OP16-015 Monkey.D.Luffy", () => {
  covers("OP16-015", "static", "[On Your Opponent's Attack]");

  it("prices itself at 2 behind an Ace Leader with six DON!! on the field", () => {
    // `bareTable` leaves ten on the field, so the negative case has to take
    // some off: five is under the printed six.
    const early = table("op16-015-early")
      .withHand("p1", [instance("luffy", "OP16-015")])
      .withDonDeck("p1", 5)
      .build();
    expect(playCostFromHand(early.state, "p1", "OP16-015", 4)).toBe(4);

    const late = table("op16-015-late")
      .withHand("p1", [instance("luffy", "OP16-015")])
      .build();
    expect(playCostFromHand(late.state, "p1", "OP16-015", 4)).toBe(2);

    // "[printed text omitted -- pnpm card:text OP16-015]"Ace"" -- so it is the Leader's name,
    // not its type, that gates this.
    const wrongLeader = table("op16-015-leader")
      .withLeader("p1", "ST31-001")
      .withHand("p1", [instance("luffy", "OP16-015")])
      .build();
    expect(playCostFromHand(wrongLeader.state, "p1", "OP16-015", 4)).toBe(4);
  });

  it("does not discount the body once it is on the board", () => {
    // The clause reads "give this card in your hand -2 cost", so a board Luffy
    // still costs 4 -- which is what keeps it out of reach of "K.O. a Character
    // with a cost of 3 or less" removal. It was written as a `self` cost layer
    // in `static-abilities.ts`, which answers for the board and not the hand:
    // exactly backwards, and it left the hand price at 4 as well.
    const game = table("op16-015-board")
      .withBoard("p1", [character("luffy", "OP16-015")])
      .build();

    const board = game.state.players.p1.board[0];
    expect(board?.cardNumber).toBe("OP16-015");
    expect(effectiveCost(game.state, "p1", board!)).toBe(4);
  });

  it("puts the Leader and itself at 7000 for the battle", () => {
    const game = defending("op16-015-defend")
      .withBoard("p1", [character("luffy", "OP16-015")])
      // The printed cost: "[printed text omitted -- pnpm card:text OP16-015]".
      .withHand("p1", [instance("vista", "OP16-011")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "vista" });
    finish(game);

    // "[printed text omitted -- pnpm card:text <card>]": both, and it
    // is a *becomes*, so the 6000 Character goes up and the 5000 Leader with
    // it.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
    expect(currentPower(game.state, "p1", "luffy")).toBe(7000);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("vista");
  });

  it("stays at 7000 when a second attack pays for it again", () => {
    // The clause carries no `[Once Per Turn]`, so a turn with two attacks in it
    // can pay twice -- and "becomes 7000" is the same 7000 the second time.
    // Written as a +1000 on the Character it was not: two payments left an
    // 8000 Luffy, a number the card cannot print.
    const game = defending("op16-015-twice")
      .withBoard("p1", [character("luffy", "OP16-015")])
      .withHand("p1", [
        instance("vista", "OP16-011"),
        instance("marco", "OP16-014"),
      ])
      .withBoard("p2", [
        character("first", "ST31-002"),
        character("second", "ST31-002"),
      ])
      .build();

    for (const [attacker, cost] of [
      ["first", "vista"],
      ["second", "marco"],
    ] as const) {
      game.play({
        type: "attack",
        attackerInstanceId: attacker,
        targetInstanceId: "p1-leader",
      });
      game.play({ type: "resolve-effect", optionId: "apply" });
      game.play({ type: "resolve-effect", optionId: cost });
      finish(game);
      while (game.state.activeAttack) game.pass();
    }

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
    expect(currentPower(game.state, "p1", "luffy")).toBe(7000);
    // Both cards are gone all the same: the engine offers the trade, and this
    // pins what it buys, not whether taking it twice was wise.
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["vista", "marco"]),
    );
  });

  it("says so: both halves of the 7000 reach the event stream", () => {
    // The clause used to resolve in silence. `set-leader-base-power` and
    // `modify-power` both wrote state and emitted nothing, so the only public
    // trace of a Leader that had become 7000 was the `defensePower` figure in
    // the `battle-resolved` event several revisions later -- and the defender's
    // own agent, reading events back, was never told it had paid for this.
    const game = defending("op16-015-events")
      .withBoard("p1", [character("luffy", "OP16-015")])
      .withHand("p1", [instance("vista", "OP16-011")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "vista" });

    // "Becomes" on both sides, so both report the base they wrote rather than
    // a delta -- the Leader through its own override, the Character through
    // the board card's.
    expect(game.events).toContainEqual({
      type: "base-power-set",
      playerId: "p1",
      targetInstanceId: "p1-leader",
      basePower: 7000,
      expiresAtTurn: game.state.turn,
      sourceCardNumber: "OP16-015",
      sourceInstanceId: "luffy",
    });
    expect(game.events).toContainEqual({
      type: "base-power-set",
      playerId: "p1",
      targetInstanceId: "luffy",
      basePower: 7000,
      expiresAtTurn: game.state.turn,
      sourceCardNumber: "OP16-015",
      sourceInstanceId: "luffy",
    });
  });

  it("is not offered with no 8000-power Character in hand to pay with", () => {
    // The cost names a card, so a hand-size floor is the wrong gate: it put the
    // trade on the table with nothing to trade, and taking it spent the
    // defender's decision on a `choose` that found no candidate.
    const game = defending("op16-015-unpayable")
      .withBoard("p1", [character("luffy", "OP16-015")])
      .withHand("p1", [
        instance("newgate", "OP16-003"), // 10000: "with 8000 power" is exact
        instance("moby", "OP16-021"), // a Stage, not a Character
      ])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(effectOptions(game.state)).not.toContain("apply");
  });
});

describe("OP16-021 Moby Dick", () => {
  covers("OP16-021", "[On Play]", "[Activate: Main]");

  it("looks three deep behind a Whitebeard Pirates Leader", () => {
    const game = table("op16-021-look")
      .withHand("p1", [instance("moby", "OP16-021")])
      .withDeckTop("p1", [
        instance("vista", "OP16-011"),
        instance("garp", "OP13-016"),
        instance("thatch", "OP16-005"),
        instance("newgate", "OP16-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-021" });

    // "add up to 1 card" with no filter: all three looked-at cards qualify --
    // {Navy} Garp included -- and the fourth is never seen.
    expect(effectOptions(game.state)).toEqual([
      "vista",
      "garp",
      "thatch",
      "done",
    ]);
    game.play({ type: "resolve-effect", optionId: "thatch" });
    finish(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "thatch",
    );
    expect(game.state.players.p1.stage?.cardNumber).toBe("OP16-021");
  });

  it("trashes itself to give a rested DON!! to a Character", () => {
    const game = table("op16-021-don")
      .withStage("p1", instance("moby", "OP16-021"))
      .withBoard("p1", [character("vista", "OP16-011")])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:moby" });
    game.play({ type: "resolve-effect", optionId: "vista" });
    finish(game);

    // "You may trash this Stage": the Stage field is cleared and the card is in
    // the trash. `removeCard` used to search every zone but this one, so the
    // move threw `MISSING_MECHANIC_CARD` rather than trashing anything.
    expect(game.state.players.p1.stage).toBeNull();
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP16-021");
    // A *rested* DON!! given to the body: attached, so worth +1000 power, and
    // it cannot be spent.
    expect(currentPower(game.state, "p1", "vista")).toBe(9000);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });
});

describe("OP17-016 Rakuyo", () => {
  covers("OP17-016", "[On Play]");

  it("K.O.s two 2000-base-power Characters and nothing bigger", () => {
    const game = table("op17-016-ko")
      .withHand("p1", [instance("rakuyo", "OP17-016")])
      .withBoard("p2", [
        character("small", "OP16-010"), // 2000 base
        character("small-2", "OP13-007"), // 1000 base
        character("tiny", "OP17-004"), // 2000 base
        character("big", "ST31-002"), // 6000 base -- over the ceiling
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-016" });

    expect(effectOptions(game.state)).toEqual([
      "small",
      "small-2",
      "tiny",
      "done",
    ]);
    game.play({ type: "resolve-effect", optionId: "small" });
    // "up to 2": the second choice is offered from the same list, minus the
    // body already taken.
    expect(effectOptions(game.state)).toEqual(["small-2", "tiny", "done"]);
    game.play({ type: "resolve-effect", optionId: "tiny" });
    finish(game);

    expect(
      game.state.players.p2.board.map((card) => card.instanceId).sort(),
    ).toEqual(["big", "small-2"]);
  });

  it("does nothing against a board with nothing small enough", () => {
    const game = table("op17-016-empty")
      .withHand("p1", [instance("rakuyo", "OP17-016")])
      .withBoard("p2", [character("big", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-016" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP17-004 Inuarashi & Nekomamushi", () => {
  covers("OP17-004", "[On Play]");

  it("grants Rush to a Whitebeard Pirate, Allies included", () => {
    const game = table("op17-004-rush")
      .withHand("p1", [instance("minks", "OP17-004")])
      .withBoard("p1", [
        // {Whitebeard Pirates}, and 2000 -- the clause carries no power floor,
        // unlike the Leader's.
        character("namule", "OP16-010"),
        // {Whitebeard Pirates Allies}: "a type including" reaches it, and an
        // exact match did not.
        character("oars", "OP16-017"),
        // {Impel Down}/{Straw Hat Crew}: neither half of the printed "or".
        character("luffy", "OP16-015"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-004" });

    // Its own types are {Minks}/{Land of Wano}/{Whitebeard Pirates}, so it
    // satisfies both halves of its own clause and is a legal target for itself
    // -- which is what makes it a 2000-power [Rush] body in a pinch as well as
    // an enabler for something bigger.
    expect(effectOptions(game.state)).toEqual([
      "namule",
      "oars",
      "minks",
      "done",
    ]);
    game.play({ type: "resolve-effect", optionId: "oars" });
    finish(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "oars",
        ),
    ).toBe(true);
  });
});

describe("OP17-005 Edward.Newgate", () => {
  covers("OP17-005", "static", "[On Play]");

  it("prices itself at 6 while the opponent holds a 10000-power body", () => {
    const bare = table("op17-005-full")
      .withHand("p1", [instance("newgate", "OP17-005")])
      .build();
    expect(playCostFromHand(bare.state, "p1", "OP17-005", 10)).toBe(10);

    const facingBig = table("op17-005-cheap")
      .withHand("p1", [instance("newgate", "OP17-005")])
      // OP16-003 Edward.Newgate, 10000 printed: exactly the printed floor.
      .withBoard("p2", [character("big", "OP16-003")])
      .build();
    expect(playCostFromHand(facingBig.state, "p1", "OP17-005", 10)).toBe(6);

    // The discount reads the *opponent's* board, so the deck's own 10000 does
    // not pay for it.
    const ownBig = table("op17-005-own")
      .withHand("p1", [instance("newgate", "OP17-005")])
      .withBoard("p1", [character("big", "OP16-003")])
      .build();
    expect(playCostFromHand(ownBig.state, "p1", "OP17-005", 10)).toBe(10);
  });

  it("puts a monocolored Leader at 8000 base for a full turn cycle", () => {
    const game = table("op17-005-leader")
      .withHand("p1", [instance("newgate", "OP17-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-005" });
    finish(game);

    // OP16-001 is mono-Red and 5000 printed. "becomes 8000", so it is a base
    // replacement rather than a buff.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8000);

    // "[printed text omitted -- pnpm card:text OP16-001]": still 8000 through the
    // opponent's whole turn.
    game.pass();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8000);
  });

  it("reports the replaced base in the observation, not just the total", () => {
    // The card popup explains a power by listing what moved it, and a
    // replacement is not one of the deltas it lists -- it is the number they
    // are deltas off. Without it on the observation the popup read "printed 5k,
    // +2k Edward.Newgate" beside a Leader the engine was swinging at 10000.
    const game = table("op17-005-observed")
      .withHand("p1", [instance("newgate", "OP17-005")])
      // OP16-003's aura is the +2000 that has to sit on top of the new base.
      .withBoard("p1", [character("aura", "OP16-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-005" });
    finish(game);

    const leader = observe(game.state, "p1").self.leader;
    expect(leader.currentPower).toBe(10000);
    expect(leader.basePower).toBe(8000);
    expect(leader.power).toBe(5000);
  });

  it("omits the base from the observation while nothing has replaced it", () => {
    // Optional and absent is what says "the printed figure is the base": a
    // reader that always found a number here would have to compare it against
    // the card database to learn whether anything happened.
    const game = table("op17-005-unmoved").build();
    expect(observe(game.state, "p1").self.leader.basePower).toBeUndefined();
  });

  it("leaves a multicolored Leader alone", () => {
    // The clause names a *monocolored* Leader, so the Red/Black Sabo Leader --
    // the one two other shipped decks front -- gets nothing.
    const game = table("op17-005-multi")
      .withLeader("p1", "OP13-004")
      .withHand("p1", [instance("newgate", "OP17-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-005" });
    finish(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });
});
