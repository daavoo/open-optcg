import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * The OP-17 tournament field's Kaido list, and the rules the Kaido policy
 * gained for the cards it runs that Bandai's feature deck does not.
 */
const LEADER = "OP17-058";
const DECK = "(Purple) Kaido - Open OPTCG";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

const agent = () => new RegistryRulesAgent(LEADER);

function kaidoTurn() {
  return scenario()
    .decks(DECK, OPPONENT)
    .seed("op17-kaido-field")
    .bareTable()
    .atTurn(9, { active: "p1" })
    .withLife("p1", copies(3, "OP17-075", "p1-life"))
    .withLife("p2", copies(3, "ST34-002", "p2-life"));
}

describe("the Open OPTCG Kaido list", () => {
  it("is a fifty under the feature deck's Leader, on the Tournaments shelf", () => {
    expect(loadDeck(DECK)).toHaveLength(50);
    expect(deckManifests[DECK]?.leader).toBe(LEADER);
    expect(deckShelf(DECK)).toBe("tournament");
  });
});

describe("OP08-074 Black Maria's activation", () => {
  /** Black Maria on the board and nothing else to do with the turn. */
  function blackMariaTurn(ownField: number, opponentField: number) {
    return kaidoTurn()
      .withBoard("p1", [character("maria", "OP08-074", { playedTurn: 7 })])
      .withDonDeck("p1", 10 - ownField)
      .withDonDeck("p2", 10 - opponentField)
      .build();
  }

  it("activates from behind, where the end-of-turn return takes nothing back", async () => {
    const game = blackMariaTurn(6, 8);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP08-074",
    });
  });

  it("does not activate from ahead, where the return gives the lead back", async () => {
    // Ten DON!! against six: the five rested DON!! have nowhere to go, and the
    // end of the turn returns four of this deck's own to level the fields.
    const game = blackMariaTurn(10, 6);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).not.toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP08-074",
    });
  });
});

describe("OP15-078 Mamaragan cast in the Main phase", () => {
  /** Mamaragan in hand, a 5000-or-less body across the table to rest. */
  function mamaraganTurn(ownField: number) {
    return kaidoTurn()
      .withHand("p1", [instance("mamaragan", "OP15-078")])
      .withBoard("p2", [character("target", "ST34-002")])
      .withDonDeck("p1", 10 - ownField)
      .build();
  }

  it("is held while two DON!! off the field would leave it under six next turn", async () => {
    // Four DON!! now, two returned, two drawn next turn: four, not six.
    const game = mamaraganTurn(4);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).not.toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP15-078",
    });
  });

  it("is cast from a full field, where the refresh puts the two back", async () => {
    const game = mamaraganTurn(10);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP15-078",
    });
  });
});

describe("OP07-077's search", () => {
  it("takes King over the cost-10 finisher on the turn the curve wants it", async () => {
    // King is what the curve is built on; a cost-10 body is drawn into anyway.
    // Five DON!!, the field a turn-2-or-3 search is cast on -- and one that
    // cannot pay for the cost-10 [Blocker], so `search-blocker` has no castable
    // Blocker to prefer and the deck's own table decides.
    const game = kaidoTurn()
      .withDonDeck("p1", 5)
      .withHand("p1", [instance("search", "OP07-077")])
      .withDeckTop("p1", [
        instance("top-kaido", "OP17-062"),
        instance("top-linlin", "ST34-004"),
        instance("top-king", "EB04-031"),
        instance("top-drake", "OP17-075"),
        instance("top-yamato", "OP17-074"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "search" });

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      option: { kind: "card", card: { instanceId: "top-king" } },
    });
  });
});
