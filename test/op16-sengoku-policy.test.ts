import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Purple) Sengoku's two activation rules, posed as boards.
 *
 * One test per judgement `op16-sengoku-policy.ts` measured, plus one for each
 * side of the gate that decides it. Both rules exist because the generic ladder
 * answers the Main phase with "develop the highest-cost legal card" before it
 * looks at activations, so every position below is one where a `play-card` is
 * also on offer -- without that the tests would pass with no rules registered
 * at all and say nothing.
 *
 * The opponent is ST34 Katakuri throughout: no matchup module exists for the
 * pairing, so the deck policy is what answers.
 */

const SENGOKU_LEADER = "OP16-060";
const SENGOKU_DECK = "(Purple) Sengoku - Official Feature Deck";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

/** The three {Admiral} Characters the Leader's activation can play. */
const KUZAN = "OP16-063";
const SAKAZUKI = "OP16-065";
/** OP16-064 Koby: a 1-cost body, so always an affordable play to compete with. */
const CHEAP_BODY = "OP16-064";

const agent = () => new RegistryRulesAgent(SENGOKU_LEADER);

/** A posed Sengoku Main phase, all ten DON!! active unless `donDeck` says otherwise. */
function sengokuTurn(options: {
  hand: ReturnType<typeof instance>[];
  board?: ReturnType<typeof character>[];
  donDeck?: number;
}) {
  const posed = scenario()
    .decks(SENGOKU_DECK, OPPONENT)
    .seed("op16-sengoku-policy")
    .bareTable()
    .atTurn(11, { active: "p1" })
    .withLife("p1", copies(4, CHEAP_BODY, "p1-life"))
    .withLife("p2", copies(4, "ST34-002", "p2-life"))
    .withBoard("p1", options.board ?? [])
    .withBoard("p2", [])
    .withHand("p1", options.hand);
  return options.donDeck === undefined
    ? posed.build()
    : posed.withDonDeck("p1", options.donDeck).build();
}

describe("the Leader's eight-DON!! activation", () => {
  it("cashes it ahead of developing, with two Admiral names in hand", async () => {
    // The whole finding: this activation was offered 308 times in 220 games of
    // the unpiloted seat and taken zero, because a 1-cost Koby in hand is a
    // `play-card` and the ladder develops first. The Koby is what makes this a
    // discriminating position -- with `op16-sengoku` disabled the agent plays
    // it and the eight DON!! stay unspent.
    const game = sengokuTurn({
      hand: [
        instance("kuzan", KUZAN),
        instance("sakazuki", SAKAZUKI),
        instance("koby", CHEAP_BODY),
      ],
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: SENGOKU_LEADER,
    });
  });

  it("develops instead with only one Admiral name in hand", async () => {
    // The other side of the gate. One name is one 8000 body for eight active
    // DON!!, which is worse than the turn the deck would have had. At a
    // threshold of 1 the rule flips a great many games and decides none of
    // them, so this gate is the difference between a play and churn.
    //
    // Unlike the other three cases this one also passes with `op16-sengoku`
    // unregistered, since the unpiloted ladder never takes the activation
    // either. It is here to catch a future *loosening* of the gate rather than
    // to demonstrate the rule, and it is the only test in this file that is
    // not discriminating on its own.
    const game = sengokuTurn({
      hand: [
        instance("kuzan", KUZAN),
        instance("kuzan-2", KUZAN),
        instance("koby", CHEAP_BODY),
      ],
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).not.toMatchObject({
      type: "activate-main",
      sourceCardNumber: SENGOKU_LEADER,
    });
  });
});

describe("Sakazuki's ramp", () => {
  it("takes the net DON!! before spending DON!! on a body", async () => {
    // Rest 1 DON!! and, under a {Navy} Leader, add 2 active ones: net +1 active
    // DON!! for this turn's plays. Taken after them -- which is what the ladder
    // does -- the DON!! arrives with nothing left to spend it on.
    //
    // Two DON!! are left in the DON!! deck for the clause to draw, and the hand
    // holds one Admiral name so the Leader's rules stay out of this.
    const game = sengokuTurn({
      hand: [instance("koby", CHEAP_BODY), instance("kuzan", KUZAN)],
      board: [character("sakazuki", SAKAZUKI)],
      donDeck: 2,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: SAKAZUKI,
    });
  });

  it("yields to the Leader's activation on the payoff turn", async () => {
    // Both activations are on offer and both rules fire; `sakazuki-ramp-order`
    // is gated off while the payoff is live so the two never compete for the
    // ladder's first `activate-main`.
    const game = sengokuTurn({
      hand: [instance("kuzan", KUZAN), instance("sakazuki-hand", SAKAZUKI)],
      board: [character("sakazuki", SAKAZUKI)],
      donDeck: 2,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: SENGOKU_LEADER,
    });
  });
});

const BORSALINO = "OP16-073";
const SENGOKU_BODY = "OP16-066";
const TSURU = "OP16-067";
const MAMARAGAN = "OP15-078";
const THREE_ADMIRALS = "OP16-076";
const MARINEFORD = "OP16-078";
/** OP16-062 Younger Brother Marine: a body with no text, so a neutral draw. */
const VANILLA = "OP16-062";
/** OP16-075 Monkey.D.Garp: the same 5-cost 6000, plus two DON!! on play. */
const GARP = "OP16-075";

/** The same posed turn, with the top of the deck and the Stage also stated. */
function sengokuTurnWith(options: {
  hand: ReturnType<typeof instance>[];
  board?: ReturnType<typeof character>[];
  donDeck?: number;
  deckTop?: ReturnType<typeof instance>[];
  stage?: ReturnType<typeof instance>;
  opponentBoard?: ReturnType<typeof character>[];
}) {
  const posed = scenario()
    .decks(SENGOKU_DECK, OPPONENT)
    .seed("op16-sengoku-policy")
    .bareTable()
    .atTurn(11, { active: "p1" })
    .withLife("p1", copies(4, CHEAP_BODY, "p1-life"))
    .withLife("p2", copies(4, "ST34-002", "p2-life"))
    .withBoard("p1", options.board ?? [])
    .withBoard("p2", options.opponentBoard ?? [])
    .withHand("p1", options.hand);
  if (options.deckTop) posed.withDeckTop("p1", options.deckTop);
  if (options.stage) posed.withStage("p1", options.stage);
  if (options.donDeck !== undefined) posed.withDonDeck("p1", options.donDeck);
  return posed.build();
}

describe("searches", () => {
  it("takes the Admiral name the hand is missing over the Event beside it", async () => {
    // Koby digs 5 for {Navy}. The unpiloted seat took the first option the
    // engine offered, which in the traced game was The Three Admirals!! with
    // Sakazuki sitting next to it.
    const game = sengokuTurnWith({
      hand: [instance("koby", CHEAP_BODY), instance("kuzan", KUZAN)],
      deckTop: [
        instance("top-event", THREE_ADMIRALS),
        instance("top-sakazuki", SAKAZUKI),
        instance("top-kuzan", KUZAN),
        instance("top-vanilla-1", VANILLA),
        instance("top-vanilla-2", VANILLA),
      ],
    });
    game.play({ type: "play-card", cardInstanceId: "koby" });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionCardNumber: SAKAZUKI,
    });
  });
});

/** Plays OP16-066 Sengoku, whose draw-2 lands two vanillas, and stops at the trash. */
function afterSengokuDraws(hand: ReturnType<typeof instance>[]) {
  const game = sengokuTurnWith({
    hand: [instance("sengoku-body", SENGOKU_BODY), ...hand],
    deckTop: [instance("drawn-1", VANILLA), instance("drawn-2", VANILLA)],
    // Two DON!! back in the DON!! deck so the printed ramp has something to add.
    donDeck: 2,
  });
  game.play({ type: "play-card", cardInstanceId: "sengoku-body" });
  return game;
}

describe("hand costs", () => {
  it("does not pitch the only copy of an Admiral name", async () => {
    const game = afterSengokuDraws([instance("kuzan", KUZAN)]);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).toBe("resolve-effect");
    expect(action).not.toMatchObject({ optionCardNumber: KUZAN });
  });

  it("pitches The Three Admirals!! first while no Admiral is on the board", async () => {
    const game = afterSengokuDraws([
      instance("kuzan", KUZAN),
      instance("event", THREE_ADMIRALS),
    ]);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionCardNumber: THREE_ADMIRALS,
    });
  });
});

describe("Kuzan's DON!! −1", () => {
  it("is left alone when the opponent has no [Blocker]", async () => {
    const game = sengokuTurnWith({
      hand: [],
      board: [character("kuzan", KUZAN)],
      opponentBoard: [character("big", VANILLA)],
      donDeck: 3,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).not.toMatchObject({
      type: "activate-main",
      sourceCardNumber: KUZAN,
    });
  });

  it("is paid against a [Blocker]", async () => {
    const game = sengokuTurnWith({
      hand: [],
      board: [character("kuzan", KUZAN)],
      opponentBoard: [character("blocker", "OP16-070")],
      donDeck: 3,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: KUZAN,
    });
  });
});

describe("DON!! for a card", () => {
  it("leaves Mamaragan's Main alone below the DON!! cap", async () => {
    // Seven DON!! on the field, three still in the DON!! deck: the `DON!! −2`
    // would be a turn of ramp spent on one card.
    const game = sengokuTurnWith({
      hand: [instance("mamaragan", MAMARAGAN)],
      donDeck: 3,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).not.toMatchObject({
      type: "activate-main",
      sourceCardNumber: MAMARAGAN,
    });
  });

  it("takes Mamaragan's Main at the cap, where the DON!! deck is empty", async () => {
    const game = sengokuTurnWith({
      hand: [instance("mamaragan", MAMARAGAN)],
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: MAMARAGAN,
    });
  });

  it("leaves Marineford's draw alone below the DON!! cap", async () => {
    const game = sengokuTurnWith({
      hand: [],
      stage: instance("marineford", MARINEFORD),
      donDeck: 3,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).not.toMatchObject({
      type: "activate-main",
      sourceCardNumber: MARINEFORD,
    });
  });

  it("takes Marineford's draw at the cap", async () => {
    const game = sengokuTurnWith({
      hand: [],
      stage: instance("marineford", MARINEFORD),
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: MARINEFORD,
    });
  });
});

describe("bodies of equal cost", () => {
  // OP16-075 Garp is a 5-cost 6000 with an `[On Play]` that adds two DON!!;
  // OP16-062 Younger Brother Marine is a 5-cost 6000 with no text at all. The
  // ladder sorts plays by cost and its sort is stable, so a tie is decided by
  // offer order, which is hand order -- the Marine is first in hand in every
  // position below, which is what makes them discriminating.

  it("plays the ramp body over the vanilla one of the same cost", async () => {
    const game = sengokuTurnWith({
      hand: [instance("vanilla", VANILLA), instance("garp", GARP)],
      donDeck: 3,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "garp",
    });
  });

  it("plays Sengoku's 5000 ramp body over the 6000 vanilla of the same cost", async () => {
    // The discriminating case for the veto shape. The format's
    // `equal-cost-play` ranks a band by power and would take the Marine's
    // 6000; a deck ranking that disagreed left both on the table and the
    // Marine, first in hand, was played with Sengoku beside it -- 54 Counter
    // pitches of OP16-066 against 6 casts in one 48-game probe.
    const game = sengokuTurnWith({
      hand: [instance("vanilla", VANILLA), instance("sengoku", SENGOKU_BODY)],
      donDeck: 3,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "sengoku",
    });
  });

  it("lets the format's power order pick Garp over Sengoku when both ramp", async () => {
    // Both add two DON!!, so neither is vetoed, and the surviving tie is the
    // format's to break: Garp's 6000 over Sengoku's 5000, which is also the
    // bridge card the deck's guides name.
    const game = sengokuTurnWith({
      hand: [
        instance("sengoku", SENGOKU_BODY),
        instance("vanilla", VANILLA),
        instance("garp", GARP),
      ],
      donDeck: 3,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "garp",
    });
  });

  it("still develops the dearer Admiral over the ramp body", async () => {
    // The scoping half, and like the one-Admiral test above it passes with
    // `equal-cost-ramp-first` unregistered -- it is here to catch a future
    // widening of the rule, not to demonstrate it.
    //
    // Only plays at `dearestAffordablePlay` are scored, so
    // the rule reorders a tie and never promotes a 5-cost ramp body over the
    // 7-cost 8000 the deck is ramping towards -- the failure that cost
    // `op17-kaido-policy.ts` 20.6pt.
    const game = sengokuTurnWith({
      hand: [
        instance("vanilla", VANILLA),
        instance("garp", GARP),
        instance("kuzan", KUZAN),
      ],
      donDeck: 3,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "kuzan",
    });
  });

  it("is indifferent at the DON!! cap, where the ramp adds nothing", async () => {
    // The gate, also non-discriminating on its own for the same reason.
    //
    // With the field at ten DON!! and the DON!! deck empty, Garp's
    // clause draws from nothing, so there is no reason to reorder the tie --
    // and the seat falls back to first-offered.
    const game = sengokuTurnWith({
      hand: [instance("vanilla", VANILLA), instance("garp", GARP)],
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "vanilla",
    });
  });
});

describe("a full board", () => {
  it("does not trash an 8000 Admiral to play a 2000 searcher", async () => {
    // `board-replacement-cost` lets a *cheaper* body through, which is how the
    // traced seat trashed Sakazuki for a Tsuru.
    const game = sengokuTurnWith({
      hand: [instance("tsuru", TSURU)],
      board: [
        character("kuzan", KUZAN),
        character("sakazuki", SAKAZUKI),
        character("borsalino", BORSALINO),
        character("kuzan-2", KUZAN),
        character("sakazuki-2", SAKAZUKI),
      ],
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).not.toBe("play-card");
  });
});

/**
 * A battle already declared against the Sengoku seat, handed to it at the
 * Counter step. `attackPower` is the whole figure coming in, so a shortfall is
 * posed directly rather than through the attacker's power arithmetic.
 */
function sengokuCountering(options: {
  hand: ReturnType<typeof instance>[];
  board?: ReturnType<typeof character>[];
  targetInstanceId: string;
  attackPower: number;
  life?: number;
  activeDon?: number;
}) {
  return scenario()
    .decks(SENGOKU_DECK, OPPONENT)
    .seed("op16-sengoku-policy")
    .bareTable()
    .atTurn(12, { active: "p2" })
    .withLife("p1", copies(options.life ?? 4, CHEAP_BODY, "p1-life"))
    .withLife("p2", copies(4, "ST34-002", "p2-life"))
    .withBoard("p1", options.board ?? [])
    .withBoard("p2", [character("attacker", "ST34-002")])
    .withHand("p1", options.hand)
    .withDon("p1", { active: options.activeDon ?? 0 })
    .withActiveAttack(
      {
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "attacker",
        targetInstanceId: options.targetInstanceId,
        attackPower: options.attackPower,
        counterPower: 0,
      },
      "counter",
    )
    .build();
}

describe("the Counter step", () => {
  it("spends the vanilla Marine before Sengoku's ramp body", async () => {
    // Both print 2000 Counter, so the generic step sees no difference and takes
    // whichever is earlier in hand -- Sengoku here, deliberately. A 48-game
    // probe had OP16-066 pitched as Counter 54 times and cast 6.
    //
    // The Leader at 1 Life is what makes the hit one the seat must stop, so the
    // only question left is which card pays.
    const game = sengokuCountering({
      hand: [instance("sengoku", SENGOKU_BODY), instance("vanilla", VANILLA)],
      targetInstanceId: "p1-leader",
      attackPower: 6_000,
      life: 1,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "counter",
      cardInstanceId: "vanilla",
    });
  });

  it("pays two cards to keep an Admiral on the board", async () => {
    // 10000 into an 8000 is a 2001 shortfall: two ordinary Counter cards. The
    // generic step defends a Character only up to one card, so without the
    // deck's price on an Admiral this is a pass and the 8000 dies.
    const game = sengokuCountering({
      hand: [instance("vanilla", VANILLA), instance("tsuru", TSURU)],
      board: [character("sakazuki", SAKAZUKI, { rested: true })],
      targetInstanceId: "sakazuki",
      attackPower: 10_000,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).toBe("counter");
  });

  it("lets a searcher die rather than spend the hand on it", async () => {
    // The other side of the price: Koby is a 1-cost 2000 whose clause has
    // already resolved, and a Counter card is worth more than the body.
    const game = sengokuCountering({
      hand: [instance("vanilla", VANILLA)],
      board: [character("koby", CHEAP_BODY, { rested: true })],
      targetInstanceId: "koby",
      attackPower: 3_000,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "pass" });
  });

  it("spends The Three Admirals!! rather than two ordinary Counter cards", async () => {
    // 8000 into the 5000 Leader at 1 Life is a 3001 shortfall: two 2000s, or
    // the Event's +4000 for one card while an Admiral is out. The generic step
    // keeps a Counter Event as a last resort; here it is the cheaper card.
    const game = sengokuCountering({
      hand: [
        instance("vanilla", VANILLA),
        instance("tsuru", TSURU),
        instance("event", THREE_ADMIRALS),
      ],
      board: [character("sakazuki", SAKAZUKI)],
      targetInstanceId: "p1-leader",
      attackPower: 8_000,
      life: 1,
      activeDon: 1,
    });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-counter-event",
      sourceCardNumber: THREE_ADMIRALS,
    });
  });
});
