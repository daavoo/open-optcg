import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";

import { character, instance, scenario } from "./support/index.js";

/**
 * `LegalAction.destination`: where a chosen card is about to go.
 *
 * The field exists to tell a search apart from its opposite. "[printed text omitted -- pnpm card:text <card>]" and "trash 2 cards
 * from your hand" both arrive as a `mechanic-choice` naming cards, and the right
 * ranking for one is the inverse of the right ranking for the other -- so both
 * tests below are driven through the engine to the real decision, and both
 * assert the destination rather than the summary text a caller would otherwise
 * have had to read.
 */

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;

const DECK = "(Red/Green) Luffy & Ace - Starter Deck 30";
const SABO = "(Red/Black) Sabo - OP17 Elbaph List";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const BONNEY = "(Red/Yellow) Jewelry Bonney - Official Feature Deck";
const LUCY = "(Red/Blue) Lucy - Official Feature Deck";

/** Three {Straw Hat Crew} Characters on top of the deck, for the look to find. */
const DECK_TOP = [
  instance("sunny", "ST31-005"),
  instance("luffy4", "OP12-015"),
  instance("luffy5", "ST21-014"),
];

/**
 * A five-deep search resolved from `searcher`'s `[On Play]`.
 *
 * Both cards used below print the same clause -- "look at 5, reveal up to 1
 * {Straw Hat Crew} card other than [Nami], add it to your hand" -- one through
 * the imperative `search-top-five` pending effect and one through the mechanic
 * DSL, which is the pair the field has to describe identically.
 */
function search(searcher: string) {
  const game = scenario()
    .decks(DECK, OPPONENT)
    .seed("effect-destination")
    .atTurn(9, { active: "p1" })
    .bareTable()
    .withHand("p1", [instance("searcher", searcher)])
    .withDeckTop("p1", DECK_TOP)
    .build();
  game.play({ type: "play-card", cardInstanceId: "searcher" });
  return observe(game.state, "p1").legalActions.filter(
    (action): action is EffectAction => action.type === "resolve-effect",
  );
}

describe("resolve-effect destination", () => {
  it("reports the hand for an imperative search, and nothing for declining it", () => {
    const actions = search("OP01-016");

    expect(actions.map((action) => action.effectKind)).toEqual(
      Array.from({ length: 4 }, () => "search-top-five"),
    );
    const byOption = new Map(
      actions.map((action) => [action.optionId, action.destination]),
    );
    expect(byOption.get("search-select:luffy5")).toEqual({
      zone: "hand",
      player: "self",
    });
    // "Add no card" moves nothing. A destination here would read as an option
    // that puts a card in the hand, which is the one thing it does not do.
    expect(byOption.get("search-select:skip")).toBeUndefined();
  });

  it("reports the hand for the same clause written in the mechanic DSL", () => {
    // EB02-017 Nami is OP01-016's clause as `look-at` then `choose`, so it
    // arrives as `mechanic-choice` and the cards are still in the deck: without
    // this field nothing on the action separated it from a discard.
    const actions = search("EB02-017");

    const named = actions.filter((action) => action.option.kind === "card");
    expect(named.length).toBeGreaterThan(1);
    for (const action of named) {
      expect(action.effectKind).toBe("mechanic-choice");
      expect(action.option.kind === "card" && action.option.zone).toBe("deck");
      expect(action.destination).toEqual({ zone: "hand", player: "self" });
    }
  });

  it("reports the trash for the same choice shape pointed the other way", () => {
    // OP17-082 Sanji's `[On Play]`: draw 2, then trash 2 from hand. A `cards`
    // choice naming cards, exactly as the DSL search above is, and the card a
    // pilot wants here is the *worst* one it holds.
    const game = scenario()
      .decks(SABO, OPPONENT)
      .seed("effect-destination-discard")
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("sanji", "OP17-082"),
        instance("cheap", "OP17-086"),
        instance("dear", "OP17-081"),
      ])
      .withDraw("p1", 2)
      .build();
    game.play({ type: "play-card", cardInstanceId: "sanji" });
    const discards = observe(game.state, "p1").legalActions.filter(
      (action): action is EffectAction => action.type === "resolve-effect",
    );

    expect(discards.length).toBeGreaterThan(1);
    for (const action of discards) {
      expect(action.effectKind).toBe("mechanic-choice");
      expect(action.destination).toEqual({ zone: "trash", player: "self" });
    }
  });

  it("names the trash for the card that pays a hand cost", () => {
    // `payFromHand` is a `choose` over the hand whose effect is
    // `sequence[move -> trash, payoff]`, so the move is not the whole effect.
    // The choice is nonetheless only about the move, because the payoff is the
    // same whichever card pays -- and 92 cards in the pool are built this way,
    // which until now reached a policy as a bare "Choose <name>".
    const game = scenario()
      .decks(BONNEY, OPPONENT)
      .seed("effect-destination-hand-cost")
      .atTurn(13, { active: "p1" })
      .withLife("p1", 1)
      .withHand("p1", [
        instance("kuma", "OP12-119"),
        instance("fatty", "EB04-061"),
        instance("counter", "OP07-107"),
      ])
      .build();
    game.play({ type: "play-card", cardInstanceId: "kuma" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    const payers = observe(game.state, "p1").legalActions.filter(
      (action): action is EffectAction => action.type === "resolve-effect",
    );

    expect(payers.length).toBeGreaterThan(1);
    for (const action of payers) {
      expect(action.destination).toEqual({ zone: "trash", player: "self" });
    }
  });

  it("names the trash when the payoff counts the cards rather than reading them", () => {
    // OP15-002 Lucy: "trash any number of Event or Stage cards from your hand.
    // This Leader gains +1000 power during this battle for every card
    // trashed." The `battle-power` behind the move names the binding to size
    // itself, which is not the same as reading which card paid -- the payoff
    // is identical whichever Event goes -- so the destination is reported and
    // the modal can label the button "Trash" instead of "Choose <name>".
    const game = scenario()
      .decks(LUCY, OPPONENT)
      .seed("effect-destination-per-card")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("event-1", "OP12-039"),
        instance("event-2", "OP12-039"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    const pitches = observe(game.state, "p1").legalActions.filter(
      (action): action is EffectAction =>
        action.type === "resolve-effect" && action.option.kind === "card",
    );

    expect(pitches.length).toBe(2);
    for (const action of pitches) {
      expect(action.destination).toEqual({ zone: "trash", player: "self" });
    }
  });

  it("says nothing about a choice that is about more than the move", () => {
    // The containment `grants` documents, for this field: a `move` buried in a
    // longer program is a choice about the rest of the program too, and naming
    // only the destination would be a half-truth a policy would then rank on.
    // A `character-area-replacement` is the plainest case -- it trashes the
    // named body *and* resolves the play that displaced it.
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("effect-destination-replacement")
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("a", "OP01-016", { playedTurn: 1 }),
        character("b", "EB02-017", { playedTurn: 1 }),
        character("c", "EB04-002", { playedTurn: 1 }),
        character("d", "ST31-001", { playedTurn: 1 }),
        character("e", "P-135", { playedTurn: 1 }),
      ])
      .withHand("p1", [instance("incoming", "OP12-015")])
      .build();
    game.play({ type: "play-card", cardInstanceId: "incoming" });
    const actions = observe(game.state, "p1").legalActions.filter(
      (action): action is EffectAction => action.type === "resolve-effect",
    );

    expect(actions.map((action) => action.effectKind)).toEqual(
      Array.from({ length: 5 }, () => "character-area-replacement"),
    );
    for (const action of actions) {
      expect(action.destination).toBeUndefined();
    }
  });
});
