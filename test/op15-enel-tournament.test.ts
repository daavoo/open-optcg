import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword, observe } from "@one-piece-sim/engine-core";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Purple) Enel Community list, the 2026-04-11 Store Battle build.
 *
 * The feature deck already drives every card the two lists share; this file
 * covers OP15-071 Holly, which the feature deck does not run, whose two clauses are both continuous: a [Double
 * Attack] grant to every [Ohm] and to itself, and a base power that becomes
 * 6000 on the opponent's turn. Both are rows in `static-abilities.ts`, so the
 * test reads them off the engine's queries rather than off an event.
 *
 * The second half poses the two decisions the list changes for the Enel
 * policy, which pilots both lists under this Leader: where the gift goes once
 * a body has [Double Attack], and a Blocker this list runs defended like one
 * the feature deck runs.
 * Each asserts the action a board without the rule would not take, so a later
 * change that reverses one shows up here rather than only in the benchmark.
 */

const LIST = "(Purple) Enel - 1st Place Store Battle 2026-04-11";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

const board = (active: "p1" | "p2") =>
  scenario()
    .decks(LIST, OPPONENT)
    .seed("op16-enel-eu-final")
    .bareTable()
    .atTurn(6, { active })
    .withBoard("p1", [
      character("holly", "OP15-071"),
      character("ohm", "OP15-061"),
      character("shura", "OP15-067"),
    ])
    .build();

describe("the Community Enel list", () => {
  it("is a legal 50 shelved under Tournaments", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP15-058");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});

describe("OP15-071 Holly", () => {
  covers("OP15-071", "static", "[Opponent's Turn]");

  it("grants [Double Attack] to every [Ohm] and to itself, and to nothing else", () => {
    const game = board("p1");
    expect(hasKeyword(game.state, "p1", "holly", "Double Attack")).toBe(true);
    expect(hasKeyword(game.state, "p1", "ohm", "Double Attack")).toBe(true);
    // Shura is a Sky Island vassal like Ohm, but not an [Ohm]: the grant is
    // by name, not by type.
    expect(hasKeyword(game.state, "p1", "shura", "Double Attack")).toBe(false);
  });

  it("makes its own and every [Ohm]'s base power 6000 on the opponent's turn only", () => {
    const own = board("p1");
    expect(currentPower(own.state, "p1", "holly")).toBe(4000);
    expect(currentPower(own.state, "p1", "ohm")).toBe(2000);

    const theirs = board("p2");
    expect(currentPower(theirs.state, "p1", "holly")).toBe(6000);
    expect(currentPower(theirs.state, "p1", "ohm")).toBe(6000);
    expect(currentPower(theirs.state, "p1", "shura")).toBe(2000);
  });
});

const ENEL_LEADER = "OP15-058";
const agent = () => new RegistryRulesAgent(ENEL_LEADER);
/** OP15-061 Ohm: 1 cost, 2000, and the body Holly gives [Double Attack]. */
const OHM = "OP15-061";
/** OP15-067 Shura: the same 1-cost 2000 vassal, not an [Ohm]. */
const SHURA = "OP15-067";
const HOLLY = "OP15-071";
/** ST10-010 Trafalgar Law: cost 4, 5000, [Blocker]. */
const LAW = "ST10-010";

describe("the Leader's gift once Holly is on the board", () => {
  it("gives the rested DON!! to the Ohm rather than the Shura listed before it", async () => {
    // Both vassals are 2000 and both reach 6000 with the gift, so the format's
    // `rested-don-gift` ties them and the engine's board order -- Shura first
    // here -- would decide. Holly makes the Ohm's 6000 two Life rather than
    // one. Holly itself is the turn's play, so it cannot swing and is not the
    // answer either way.
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("op16-enel-eu-final-gift")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withLife("p1", copies(4, OHM, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [
        character("holly", HOLLY, { playedTurn: 7 }),
        character("shura", SHURA),
        character("ohm", OHM),
      ])
      .withBoard("p2", [])
      .withHand("p1", [])
      .withDonDeck("p1", 4)
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: ENEL_LEADER,
      targetInstanceId: "ohm",
    });
  });
});

describe("the Counter phase for this list's Blockers", () => {
  it("spends a card to keep Law alive", async () => {
    // The protected set is read off the printed [Blocker] keyword, so Law is
    // defended here the way Franky is in the feature deck. Against a
    // replaceable body `chooseGenericCounter` passes; against a Blocker the
    // 1000 shortfall is one vassal from hand.
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("op16-enel-eu-final-counter")
      .bareTable()
      .atTurn(8, { active: "p2" })
      .withLife("p1", copies(4, OHM, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [character("law", LAW)])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withHand("p1", [instance("c1", OHM), instance("c2", OHM)])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "law",
          attackPower: 6_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "counter" });
  });

  it("pitches a vassal rather than Holly when either would stop the hit", async () => {
    // Holly is printed at 1000 Counter like the vassals, so nothing in the
    // hand's Counter arithmetic tells it apart; the protected set does. The
    // vassal is listed first in hand so first-offered and the rule's answer
    // are different cards.
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("op16-enel-eu-final-holly-counter")
      .bareTable()
      .atTurn(8, { active: "p2" })
      .withLife("p1", copies(4, OHM, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [character("law", LAW)])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withHand("p1", [instance("holly", HOLLY), instance("c1", OHM)])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "law",
          attackPower: 6_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "counter", cardInstanceId: "c1" });
  });
});

describe("the turn's active DON!! once Holly is on the board", () => {
  it("goes to the Ohm it lifts into the opposing Leader rather than onto the Leader", async () => {
    // Nothing in the format has an opinion between the Leader and a Character
    // here, so the ladder's first-offered attachment is the Leader's. With
    // three active DON!! the Ohm reaches 5000 and connects for two Life; the
    // Leader at 5000 connects on the tie with none.
    const game = scenario()
      .decks(LIST, OPPONENT)
      .seed("op16-enel-eu-final-attach")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withDon("p1", { active: 3 })
      .withDonDeck("p1", 0)
      .withLife("p1", copies(4, OHM, "p1-life"))
      .withLife("p2", copies(4, "ST34-002", "p2-life"))
      .withBoard("p1", [character("holly", HOLLY), character("ohm", OHM)])
      .withBoard("p2", [])
      .withHand("p1", [])
      .build();

    // Step through whatever the ladder takes first -- the Leader's activation
    // is still on offer -- until it reaches an attachment.
    const pilot = agent();
    for (let step = 0; step < 4; step += 1) {
      const action = await pilot.chooseAction(observe(game.state, "p1"));
      if (action.type === "attach-don") {
        expect(action.targetInstanceId).not.toBe("p1-leader");
        return;
      }
      game.submit(action);
    }
    throw new Error("no attachment was chosen");
  });
});
