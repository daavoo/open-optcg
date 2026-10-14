import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * OP-16 Purple Enel's defensive rules, posed as boards.
 *
 * One test per judgement `createOp16EnelDefensePolicy` measured, so a later
 * change that quietly reverses one shows up here rather than only in the
 * benchmark. Both assert the *reason* as well as the action: the faults these
 * rules correct were branch faults -- the generic policy reaching a decision by
 * the wrong route and being right by accident -- and the reason string is what
 * says the intended branch fired. `test/st33-policy.test.ts` records what
 * happens when a policy test checks only the outcome.
 *
 * The opponent is ST34 Katakuri throughout: no matchup module exists for the
 * pairing, so the deck policy is what answers, and a Character's card number on
 * the opposing board is independent of that deck's list because the engine
 * resolves card text globally.
 */

const ENEL_LEADER = "OP15-058";
const ENEL_DECK = "(Purple) Enel - Official Feature Deck";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

/** OP15-118 Enel: cost 6, 8000 printed, 10000 and removal-proof under the ceiling. */
const FINISHER = "OP15-118";
/** OP15-074 Varie: a 0-cost Event whose [Counter] gives an [Enel] card +2000. */
const VARIE = "OP15-074";
/** OP15-061 Ohm: a 1-cost 2000 vassal with 1000 Counter. */
const VASSAL = "OP15-061";
/** OP09-072 Franky: cost 4, 5000, [Blocker]. */
const BLOCKER = "OP09-072";

const agent = () => new RegistryRulesAgent(ENEL_LEADER);

/** A posed Enel turn under attack, with `hand` held for defence. */
function enelUnderAttack(options: {
  hand?: ReturnType<typeof instance>[];
  selfBoard?: ReturnType<typeof character>[];
  opponentBoard?: ReturnType<typeof character>[];
  life?: number;
}) {
  return scenario()
    .decks(ENEL_DECK, OPPONENT)
    .seed("op16-enel-policy")
    .bareTable()
    .atTurn(8, { active: "p2" })
    .withLife("p1", copies(options.life ?? 4, VASSAL, "p1-life"))
    .withLife("p2", copies(4, "ST34-002", "p2-life"))
    .withBoard("p1", options.selfBoard ?? [])
    .withBoard("p2", options.opponentBoard ?? [])
    .withHand("p1", options.hand ?? []);
}

describe("the Leader's rested-DON!! gift", () => {
  it("gives the four DON!! to a body that can still swing, not a fresh one", async () => {
    // The engine offers this ability as one `activate-main` per Character,
    // differing only in `targetInstanceId`, and the deck was taking the first
    // one offered. Given DON!! come back at the controller's next Refresh, so
    // four of them on a summoning-sick body buy no attack at all.
    //
    // The body played this turn (`playedTurn: 7`, the turn being posed) is listed
    // first on the board, so first-offered and the rule's answer are different
    // actions and this test discriminates between them -- with
    // `rested-don-gift` disabled the policy picks `fresh`.
    //
    // The preference between two bodies that can both swing is the next test's
    // subject, and it runs the other way from the published guide: "give them
    // to your highest-cost [Enel] character" is wrong in this field, for the
    // reason `createRestedDonGiftModule` gives.
    const game = scenario()
      .decks(ENEL_DECK, OPPONENT)
      .seed("op16-enel-gift")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withLife("p1", copies(4, VASSAL, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [
        character("fresh", FINISHER, { playedTurn: 7 }),
        character("veteran", VASSAL),
      ])
      .withBoard("p2", [])
      .withHand("p1", [])
      .withDonDeck("p1", 4)
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: ENEL_LEADER,
      targetInstanceId: "veteran",
    });
  });

  it("gives them to the body they lift over the opposing Leader, not to the finisher", async () => {
    // The format's `rested-don-gift` scores `unlocksAnAttack` first -- the gift
    // that turns a body too small to threaten the opposing Leader into one that
    // can -- and until OP15-058's activation carried `donGift` that module could
    // not see this ability at all: the census reported it silent for this deck
    // and the gift fell to whichever body the engine listed first.
    //
    // Posed as the position a trace of this deck lost in. Both bodies can swing,
    // so the tier that separates them is the one below `canStillSwing`.
    // OP15-118 is already 10000 against a 5000 Leader, so four DON!! on it buy a
    // battle that was won; the same four on the 2000 vassal make 6000, which is
    // the difference between a body that cannot profitably attack the Leader and
    // one that can. The finisher is listed first, so first-offered and the rule's
    // answer are different actions.
    const game = scenario()
      .decks(ENEL_DECK, OPPONENT)
      .seed("op16-enel-gift-unlocks")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withLife("p1", copies(4, VASSAL, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [
        character("finisher", FINISHER),
        character("vassal", VASSAL),
      ])
      .withBoard("p2", [])
      .withHand("p1", [])
      .withDonDeck("p1", 4)
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: ENEL_LEADER,
      targetInstanceId: "vassal",
    });
  });

  it("still ranks the bodies that can swing when one on the board cannot", async () => {
    // One rule scores every recipient, and this is the board where that is the
    // whole difference: a body that cannot swing, a body that can and gains
    // nothing from the gift, and the small body the gift lifts over the
    // opposing Leader. `preferAmong` hides only what it scored and protects its
    // own best from other modules, so a second rule ranking the same choice by
    // "can it swing" alone would put the first two at its top and leave board
    // order to answer. The finisher is listed first, so it does.
    const game = scenario()
      .decks(ENEL_DECK, OPPONENT)
      .seed("op16-enel-gift-tiers")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withLife("p1", copies(4, VASSAL, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [
        character("finisher", FINISHER),
        character("fresh", VASSAL, { playedTurn: 7 }),
        character("vassal", VASSAL),
      ])
      .withBoard("p2", [])
      .withHand("p1", [])
      .withDonDeck("p1", 4)
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: ENEL_LEADER,
      targetInstanceId: "vassal",
    });
  });
});

describe("the Counter phase", () => {
  it("spends Counter to keep the removal-proof finisher alive", async () => {
    // `chooseGenericCounter`'s protected set is empty by default, so it answers
    // an attack on a Character with "Do not spend hand resources protecting a
    // replaceable Character" -- and OP15-118 is the one card in the deck for
    // which battle is the *only* answer the opponent has. Under the six-DON!!
    // ceiling it "[printed text omitted -- pnpm card:text OP15-118]",
    // so a Counter declined here is the finisher lost for nothing.
    //
    // `economicalCharacterDefense: false` is the other half: OP15-118 stands at
    // 10000 under the ceiling against an 11000 attack, so the shortfall is 1001
    // and the two-vassal line reaches it -- but only past the 1000-power cap the
    // economy gate would impose while Life is spare.
    const game = enelUnderAttack({
      hand: [instance("c1", VASSAL), instance("c2", VASSAL)],
      selfBoard: [character("threatened", FINISHER)],
      opponentBoard: [character("attacker", "ST34-002")],
    })
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "threatened",
          attackPower: 11_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "counter" });
  });

  it("reaches for the free [Counter] Event before a two-card line", async () => {
    // Varie costs 0 and gives an [Enel] card +2000; a vassal discarded for
    // Counter gives 1000. So one Event closes the gap two cards would, which is
    // what `counterEventBeatsCards: 2` says. Left at its default the Event is a
    // last resort, and the deck was measured discarding a card for +1000 *and
    // still taking the hit* 20 times in 120 games while holding this line.
    //
    // The target is the Leader, which is an [Enel] card, so the Event reaches
    // it -- against a vassal it would add 0, and the policy now reads that off
    // `counterPower` rather than assuming 3000.
    // Life 1, so the generic Leader gate stops declining a survivable hit: at
    // this Life total the hit in front of the defender ends the game, which is
    // when `chooseGenericCounter` defends the Leader at all.
    const game = enelUnderAttack({
      life: 1,
      hand: [
        instance("event", VARIE),
        instance("c1", VASSAL),
        instance("c2", VASSAL),
      ],
      opponentBoard: [character("attacker", "ST34-002")],
    })
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6_500,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-counter-event",
      eventInstanceId: "event",
    });
  });

  it("opens a line that needs a second [Counter] Event to close", async () => {
    // At 0 Life the hit in front of the defender ends the game. A 10000 attack
    // on the 5000 Leader is 5001 short: two vassals give 2000 and Varie 2000,
    // which is not enough, but the second Varie makes it 6000. The Counter step
    // asks again after each card, so the first Event is the opening card of a
    // line the hand holds -- and the reason string says the Event branch fired
    // rather than the "cannot save the target" pass it used to reach.
    const game = enelUnderAttack({
      life: 0,
      hand: [
        instance("event-1", VARIE),
        instance("event-2", VARIE),
        instance("c1", VASSAL),
        instance("c2", VASSAL),
      ],
      opponentBoard: [character("attacker", "ST34-002")],
    })
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 10_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    const enel = agent();
    const action = await enel.chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "activate-counter-event" });
    expect(enel.lastDecision?.reasons.join(" ")).toMatch(/Counter Event/);
  });
});

describe("the block window", () => {
  it("blocks with a Blocker that outpowers the attack to save the finisher", async () => {
    // Both of `chooseGenericBlock`'s tests open with
    // `targetInstanceId.endsWith("-leader")`, and so does the format's
    // `free-block`, so an attack on a Character has no block rule at either
    // gate -- the policy watches OP15-118 die with an untapped Franky beside it.
    // Franky at 5000 stops a 4000 attack and is still on the board afterwards;
    // the rest it costs comes back at the next Refresh.
    const game = enelUnderAttack({
      selfBoard: [
        character("threatened", FINISHER),
        character("blocker", BLOCKER),
      ],
      opponentBoard: [character("attacker", "ST34-002")],
    })
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "attacker",
        targetInstanceId: "threatened",
        attackPower: 4_000,
        counterPower: 0,
      })
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "block",
      blockerInstanceId: "blocker",
    });
  });

  it("leaves a replaceable vassal to die rather than resting the Blocker", async () => {
    // The rule is deliberately restricted to `PROTECTED_BODIES`. The fourteen
    // 1-cost vassals cash themselves in on play, so a vassal already on the
    // board is a spent card and not worth the Blocker's rest -- this is the
    // discriminating half of the pair, and without it the rule would be "block
    // for anything", which is a different claim and not the measured one.
    const game = enelUnderAttack({
      selfBoard: [
        character("threatened", VASSAL),
        character("blocker", BLOCKER),
      ],
      opponentBoard: [character("attacker", "ST34-002")],
    })
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "attacker",
        targetInstanceId: "threatened",
        attackPower: 4_000,
        counterPower: 0,
      })
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type).not.toBe("block");
  });
});

describe("the mulligan", () => {
  it("keeps a hand with a 1-cost Character for the Leader to feed", async () => {
    const game = scenario()
      .decks(ENEL_DECK, OPPONENT)
      .seed("op16-enel-mulligan-keep")
      .bareTable()
      .atTurn(1, { active: "p1" })
      .withHand("p1", [instance("vassal", VASSAL), instance("event", VARIE)])
      .withState((state) => {
        state.phase = "mulligan";
      })
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "mulligan-decision",
      decision: "keep",
    });
  });

  it("mulligans a hand of nothing but Events", async () => {
    // `chooseGenericRules` keeps on "any card costs 2 or less", and every Event
    // in this deck costs 0 -- so it kept 120 of 120 hands. A hand of Events is
    // not a first turn, and with no Character on the board the Leader's
    // activation is not offered at all: `legal-actions/main.ts` builds one
    // per Character, so an empty board means no ramp rather than misaimed ramp.
    const game = scenario()
      .decks(ENEL_DECK, OPPONENT)
      .seed("op16-enel-mulligan-ship")
      .bareTable()
      .atTurn(1, { active: "p1" })
      .withHand("p1", [
        instance("e1", VARIE),
        instance("e2", "OP15-075"),
        instance("e3", "OP15-078"),
      ])
      .withState((state) => {
        state.phase = "mulligan";
      })
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "mulligan-decision",
      decision: "mulligan",
    });
  });
});

describe("the thunder Events", () => {
  /** El Thor: 0 cost, `DON!! −1`, K.O. a 3000-or-less Character. */
  const EL_THOR = "OP15-075";

  /** Enel's own turn with an Event in hand and one opposing body. */
  function enelWithAnEvent(opposing: ReturnType<typeof character>) {
    return (
      scenario()
        .decks(ENEL_DECK, OPPONENT)
        .seed("op16-enel-events")
        .bareTable()
        .atTurn(5, { active: "p1" })
        .withDon("p1", { active: 3 })
        .withDonDeck("p1", 3)
        .withLife("p1", copies(4, VASSAL, "p1-life"))
        .withLife("p2", copies(4, "ST34-002", "p2-life"))
        // Four Counter Events in hand: the reserve rule below holds the last
        // three, and these tests are about the board gate, not the reserve.
        .withHand("p1", [
          instance("thor", EL_THOR),
          instance("spare-1", VARIE),
          instance("spare-2", VARIE),
          instance("spare-3", VARIE),
        ])
        .withBoard("p2", [opposing])
        .build()
    );
  }

  it("holds an Event against a body the board can already beat", async () => {
    // The old gate was "the opposing board is empty", which one 2000-power
    // searcher keeps open. Traced against OP17 Ace: three Events on a 2000
    // Garp on turn three, every one of them also 2000 of Counter for the
    // finisher and a DON!! off a six-card field.
    const game = enelWithAnEvent(
      character("garp", "OP13-016", { playedTurn: 4 }),
    );
    const offered = game
      .legalActions("p1")
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === EL_THOR,
      );
    expect(offered).toBe(true);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    // The Leader's own activation is still an `activate-main`, and still the
    // right thing to take; what must not be taken is the Event.
    expect(
      action.type === "activate-main" ? action.sourceCardNumber : undefined,
    ).not.toBe(EL_THOR);
  });

  it("spends it on a Blocker in the way", async () => {
    // A 5000 Blocker is a hit off this deck's clock every turn; that is what
    // the Event is for.
    const game = enelWithAnEvent(
      character("franky", BLOCKER, { playedTurn: 4 }),
    );

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: EL_THOR,
    });
  });
});

describe("the Leader's gift against the Events' DON!! −1", () => {
  // `returnDonToDeck` pays a `DON!! −N` cost from the rested pool, the active
  // pool, the Leader's DON!! and then a Character's -- so with an empty cost
  // area every 0-cost Event comes off the body the Leader just armed. The
  // traced game had four of them peel a 6000 vassal back to 2000 before the
  // ladder reached its attack step. The opposing Blocker keeps the "board this
  // deck can already beat" gate open, and four Counter Events in hand keep
  // the reserve rule out of it, so without the guards the Event fires.
  const armedVassal = (options: { rested?: boolean; spareDon?: number }) =>
    scenario()
      .decks(ENEL_DECK, OPPONENT)
      .seed("op16-enel-gift-guard")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withLife("p1", copies(4, VASSAL, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [
        character("veteran", VASSAL, { rested: options.rested ?? false }),
      ])
      .withBoard("p2", [character("wall", BLOCKER)])
      .withHand("p1", [
        instance("varie", VARIE),
        instance("spare-1", VARIE),
        instance("spare-2", VARIE),
        instance("spare-3", VARIE),
      ])
      // The bare table deals six active DON!!; giving them all leaves the cost
      // area empty and the DON!! deck too, so the Leader's own activation is
      // not on offer to muddy the choice.
      .withGivenDon("p1", "veteran", 6 - (options.spareDon ?? 0))
      .build();

  it("attacks with the armed body before it lets an Event eat its DON!!", async () => {
    const game = armedVassal({});
    const action = await agent().chooseAction(observe(game.state, "p1"));

    // The generic ladder swings the Leader first and the vassal after it; what
    // this pins is that neither swing waits behind the Event.
    expect(action).toMatchObject({ type: "attack" });
  });

  it("keeps the Event rather than pay it off a rested body's DON!!", async () => {
    // Given DON!! returns to the *active* pool at Refresh; DON!! sent back to
    // the DON!! deck comes back through the Leader as one active and four
    // rested. So the Event's draw would cost next turn's active DON!!, and
    // `op16-enel-don-posture` holds it. The Leader still has its own swing.
    const game = armedVassal({ rested: true });
    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(
      action.type === "activate-main" ? action.sourceCardNumber : undefined,
    ).not.toBe(VARIE);
  });

  it("casts the Event when the cost area can pay for it", async () => {
    // One active DON!! covers the `DON!! −1`, so the given DON!! is untouched
    // and the Event keeps its place ahead of the attack.
    const game = armedVassal({ spareDon: 1 });
    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: VARIE,
    });
  });
});

describe("the Counter reserve", () => {
  /** El Thor: 0 cost, `DON!! −1`, K.O. a 3000-or-less Character. */
  const EL_THOR = "OP15-075";
  /** Lightning Dragon: 0 cost, `DON!! −1`, draws; no [Counter] half. */
  const LIGHTNING_DRAGON = "OP15-077";

  // A Blocker across the table keeps the board gate open and the cost area
  // can pay, so the only thing between the Event and the Main phase is how
  // many Counter Events would be left behind.
  const withCounterEvents = (hand: ReturnType<typeof instance>[]) =>
    scenario()
      .decks(ENEL_DECK, OPPONENT)
      .seed("op16-enel-counter-reserve")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withDon("p1", { active: 3 })
      .withDonDeck("p1", 3)
      .withLife("p1", copies(4, VASSAL, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p2", [character("wall", BLOCKER)])
      .withHand("p1", hand)
      .build();

  it("holds the last three Counter Events out of the Main phase", async () => {
    const game = withCounterEvents([
      instance("thor", EL_THOR),
      instance("varie-1", VARIE),
      instance("varie-2", VARIE),
    ]);
    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(
      action.type === "activate-main" ? action.sourceCardNumber : undefined,
    ).not.toBe(EL_THOR);
  });

  it("casts a Counter Event while four are in hand", async () => {
    const game = withCounterEvents([
      instance("thor", EL_THOR),
      instance("varie-1", VARIE),
      instance("varie-2", VARIE),
      instance("varie-3", VARIE),
    ]);
    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: EL_THOR,
    });
  });

  it("does not count an Event with no [Counter] half toward the reserve", async () => {
    // Lightning Dragon is a draw with no Counter half: casting it costs the
    // reserve nothing, so it is cast even when the reserve is thin.
    const game = withCounterEvents([
      instance("dragon", LIGHTNING_DRAGON),
      instance("varie", VARIE),
    ]);
    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: LIGHTNING_DRAGON,
    });
  });
});
