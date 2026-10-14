import { describe, expect, it } from "vitest";
import type { LegalAction } from "@one-piece-sim/protocol";

import { character, instance, scenario } from "./support/index.js";

/**
 * `LegalAction.cost`: what accepting an offered action pays beyond its DON!!
 * price, read off the engine's own program rather than off a card number.
 *
 * The engine has always checked these costs before offering the action -- a
 * `DON!! −2` is not offered to a field of one -- and every policy that wanted
 * to refuse one had to name the card. Three shapes carry the field: an Event's
 * printed `DON!! −N`, an `optional` built by `donMinus` (a `return-don` first
 * in a sequence), and an `optional` built by `payFromHand` (a `choose` over the
 * hand whose effect trashes the chosen cards). Each is pinned here on a card
 * from a shipped list, and the `skip` half of each prompt is pinned as free.
 */

const KAIDO_DECK = "(Purple) Kaido - Official Feature Deck";
const ENEL_DECK = "(Purple) Enel - Official Feature Deck";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;

function effectOffers(actions: LegalAction[]): EffectAction[] {
  return actions.filter(
    (action): action is EffectAction => action.type === "resolve-effect",
  );
}

describe("an Event's printed DON!! −N is on its activation", () => {
  it("reports El Thor's DON!! −1 and Mamaragan's DON!! −2", () => {
    const game = scenario()
      .decks(ENEL_DECK, OPPONENT)
      .seed("action-cost-events")
      .bareTable()
      .atTurn(5, { active: "p1" })
      .withDon("p1", { active: 4 })
      .withHand("p1", [
        instance("thor", "OP15-075"),
        instance("mamaragan", "OP15-078"),
      ])
      .withBoard("p2", [character("garp", "OP13-016")])
      .build();

    const activations = game
      .legalActions("p1")
      .filter((action) => action.type === "activate-main");
    const thor = activations.find(
      (action) => action.sourceCardNumber === "OP15-075",
    );
    const mamaragan = activations.find(
      (action) => action.sourceCardNumber === "OP15-078",
    );
    expect(thor?.cost).toEqual({ returnsDon: 1 });
    expect(mamaragan?.cost).toEqual({ returnsDon: 2 });
  });
});

describe("a Character's or Leader's activation reports its cost and its ramp", () => {
  it("prices Queen's activation at two rested DON!! and King's at nothing, and says what each adds", () => {
    const game = scenario()
      .decks(KAIDO_DECK, OPPONENT)
      .seed("action-cost-activations")
      .bareTable()
      .atTurn(7, { active: "p1" })
      .withDon("p1", { active: 6 })
      .withDonDeck("p1", 4)
      .withBoard("p1", [
        character("king", "EB04-031", { playedTurn: 5 }),
        character("queen", "EB04-032", { playedTurn: 5 }),
      ])
      .withHand("p1", [instance("brick", "OP17-062")])
      .build();

    const activations = game
      .legalActions("p1")
      .filter((action) => action.type === "activate-main");
    const king = activations.find(
      (action) => action.sourceInstanceId === "king",
    );
    const queen = activations.find(
      (action) => action.sourceInstanceId === "queen",
    );
    expect(king?.cost).toBeUndefined();
    expect(king?.ramps).toEqual({ active: 1, rested: 1 });
    expect(queen?.cost).toEqual({ restsDon: 2 });
    expect(queen?.ramps).toEqual({ active: 0, rested: 1 });
  });

  it("says the Enel Leader adds one active and four rested DON!! for free", () => {
    const game = scenario()
      .decks(ENEL_DECK, OPPONENT)
      .seed("action-cost-enel-leader")
      .bareTable()
      .atTurn(5, { active: "p1" })
      .withDon("p1", { active: 1 })
      .withDonDeck("p1", 5)
      .withBoard("p1", [character("ohm", "OP15-061", { playedTurn: 3 })])
      .build();

    const leader = game
      .legalActions("p1")
      .find(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "OP15-058",
      );
    expect(
      leader?.type === "activate-main" ? leader.cost : null,
    ).toBeUndefined();
    expect(leader?.type === "activate-main" ? leader.ramps : null).toEqual({
      active: 1,
      rested: 4,
    });
  });
});

describe("an optional DON!! −N is on the option that accepts it", () => {
  it("prices X.Drake's [On Play] at two DON!! off the field, and the decline at nothing", () => {
    const game = scenario()
      .decks(KAIDO_DECK, OPPONENT)
      .seed("action-cost-drake")
      .bareTable()
      .atTurn(5, { active: "p1" })
      .withDon("p1", { active: 4 })
      .withHand("p1", [instance("drake", "OP17-075")])
      .withHand("p2", [instance("theirs", "ST34-002")])
      .build();
    game.play({ type: "play-card", cardInstanceId: "drake" });

    const offers = effectOffers(game.legalActions("p1"));
    const apply = offers.find((action) => action.option.kind === "confirm");
    const skip = offers.find((action) => action.option.kind === "skip");
    expect(apply?.sourceCardNumber).toBe("OP17-075");
    expect(apply?.cost).toEqual({ returnsDon: 2 });
    expect(skip?.cost).toBeUndefined();
  });
});

describe("an optional hand cost is on the option that accepts it", () => {
  it("prices Sasaki's [When Attacking] at two cards from hand", () => {
    const game = scenario()
      .decks(KAIDO_DECK, OPPONENT)
      .seed("action-cost-sasaki")
      .bareTable()
      .atTurn(5, { active: "p1" })
      .withDon("p1", { active: 6 })
      .withDonDeck("p1", 4)
      .withBoard("p1", [character("sasaki", "OP17-068", { playedTurn: 3 })])
      .withHand("p1", [
        instance("spare-1", "OP17-062"),
        instance("spare-2", "OP17-062"),
        instance("spare-3", "OP17-062"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "sasaki",
      targetInstanceId: "p2-leader",
    });

    const offers = effectOffers(game.legalActions("p1"));
    const apply = offers.find((action) => action.option.kind === "confirm");
    expect(apply?.sourceCardNumber).toBe("OP17-068");
    expect(apply?.cost).toEqual({ trashesFromHand: 2 });
  });
});

describe("what an accepted optional buys is on the option that accepts it", () => {
  it("says EB02-061 Luffy's DON!! −2 sets it active and adds a Life card to hand", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("action-payoff-luffy")
      .atTurn(11, { active: "p1" })
      .withLeader("p1", "ST30-001")
      .withBoard("p1", [character("luffy", "EB02-061", { playedTurn: 1 })])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });

    const offers = effectOffers(game.legalActions("p1"));
    const apply = offers.find((action) => action.option.kind === "confirm");
    const skip = offers.find((action) => action.option.kind === "skip");
    expect(apply?.sourceCardNumber).toBe("EB02-061");
    expect(apply?.cost).toEqual({ returnsDon: 2 });
    expect(apply?.payoff).toEqual(["set-active", "to-hand"]);
    expect(skip?.payoff).toBeUndefined();
  });

  it("names what follows a hand cost, not the trash that pays it", () => {
    const game = scenario()
      .decks(KAIDO_DECK, OPPONENT)
      .seed("action-payoff-sasaki")
      .bareTable()
      .atTurn(5, { active: "p1" })
      .withDon("p1", { active: 6 })
      .withDonDeck("p1", 4)
      .withBoard("p1", [character("sasaki", "OP17-068", { playedTurn: 3 })])
      .withHand("p1", [
        instance("spare-1", "OP17-062"),
        instance("spare-2", "OP17-062"),
        instance("spare-3", "OP17-062"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "sasaki",
      targetInstanceId: "p2-leader",
    });

    const apply = effectOffers(game.legalActions("p1")).find(
      (action) => action.option.kind === "confirm",
    );
    expect(apply?.cost).toEqual({ trashesFromHand: 2 });
    expect(apply?.payoff).toEqual(["don"]);
  });
});
