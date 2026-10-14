import { describe, expect, it } from "vitest";
import { itWithText } from "./support/printed-text.js";
import {
  automaticNoticeTitle,
  automaticSteps,
  clauseQuote,
  costOverlay,
  counterEventSummary,
  defenseStopsAttack,
  destinationVerb,
  donPaymentUnsettled,
  lookedAtCards,
  moveInOrder,
  optionalEffectSummary,
  opponentCounterCardsForLatestBattle,
  picturedSummary,
  resolvingClauseMarker,
  allocateDonReturn,
  clampDonReturn,
  donReturnPlan,
  totalDonReturned,
} from "../packages/web/src/battle-ui.js";

describe("automatic steps", () => {
  const marker = {
    type: "ability-triggered",
    playerId: "p1",
    sourceCardNumber: "OP09-061",
    sourceInstanceId: "p1-leader",
  };

  it("reports what a clause that fired on its own went on to do", () => {
    const refund = {
      type: "don-added",
      playerId: "p1",
      count: 1,
      rested: false,
      sourceCardNumber: "OP09-061",
    };
    expect(
      automaticSteps([
        { type: "don-returned", playerId: "p1", sourceCardNumber: "OP09-077" },
        marker,
        refund,
      ]),
      // The marker itself is not a row: the heading says a clause fired, and
      // the step under it draws the same Leader's face again.
    ).toEqual([refund]);
  });

  it("keeps the steps of the action the player asked for out of it", () => {
    // The clause the player played is not news: they clicked the card, and
    // its own steps are drawn on the board they are looking at.
    expect(
      automaticSteps([
        { type: "card-played", playerId: "p1", cardNumber: "OP09-077" },
        { type: "don-returned", playerId: "p1", sourceCardNumber: "OP09-077" },
      ]),
    ).toBe(null);
  });

  it("stops a group at the first step that does not name the same card", () => {
    // Nothing this clause did can be attributed, so all the panel can honestly
    // report is that it fired.
    const later = {
      type: "character-ko",
      playerId: "p2",
      sourceCardNumber: "OP09-077",
    };
    expect(automaticSteps([marker, later])).toEqual([marker]);
  });

  const activation = {
    type: "ability-activated",
    playerId: "p1",
    sourceCardNumber: "OP14-020",
    sourceInstanceId: "p1-leader",
  };

  it("reports what an ability the player activated went on to do", () => {
    // OP14-020 Dracule Mihawk: the rest it asks for is a decision the player
    // made, the three DON!! and the lock-out are not, and a Leader never
    // leaves the board to show for itself that it acted.
    const steps = [
      {
        type: "character-rested",
        playerId: "p1",
        cardInstanceId: "cost",
        cardNumber: "ST32-001",
        sourceCardNumber: "OP14-020",
      },
      {
        type: "don-activated",
        playerId: "p1",
        count: 3,
        sourceCardNumber: "OP14-020",
      },
      {
        type: "player-restricted",
        playerId: "p1",
        restriction: "cannot-play-characters",
        untilTurn: 11,
        sourceCardNumber: "OP14-020",
      },
    ];
    expect(automaticSteps([activation, ...steps])).toEqual(steps);
  });

  it("drops an activation that did nothing, and keeps a bare automatic one", () => {
    // The player clicked the ability, so "it fired" is the one thing they
    // already know. That a clause fired with nobody asking is the opposite:
    // it is the whole of the news.
    expect(automaticSteps([activation])).toBe(null);
    expect(automaticSteps([marker])).toEqual([marker]);
  });

  it("titles the panel for the half the player did not ask for", () => {
    expect(automaticNoticeTitle([activation])).toBe("Ability resolved");
    expect(automaticNoticeTitle([marker])).toBe("Fired on its own");
    // Both in one action -- a clicked ability whose steps woke an automatic
    // one -- is titled for the automatic half, which is the half a heading
    // has to account for.
    expect(automaticNoticeTitle([activation, marker])).toBe("Fired on its own");
  });

  it("waits while the DON!! that paid for the clause is still being named", () => {
    // OP09-061's refund fires off the `DON!! −2` the player just paid, and the
    // engine asks which pool each returned DON!! came out of afterwards: the
    // report has to wait for the question it answers.
    expect(
      donPaymentUnsettled([
        { type: "pass" },
        {
          type: "resolve-effect",
          option: { kind: "don-return" },
        },
      ]),
    ).toBe(true);
    expect(
      donPaymentUnsettled([
        { type: "resolve-effect", option: { kind: "don-return-count" } },
      ]),
    ).toBe(true);
  });

  it("puts the report up once every returned DON!! has a home", () => {
    expect(
      donPaymentUnsettled([
        { type: "pass" },
        { type: "resolve-effect", option: { kind: "target" } },
      ]),
    ).toBe(false);
  });
});

describe("battle UI", () => {
  it("swaps a card with its neighbour in a bottom-of-deck order", () => {
    expect(moveInOrder([0, 1, 2, 3], 2, -1)).toEqual([0, 2, 1, 3]);
    expect(moveInOrder([0, 2, 1, 3], 0, 1)).toEqual([2, 0, 1, 3]);
  });

  it("leaves an order alone when the move would run off either end", () => {
    // The arrow that would make the move is disabled, so this is the panel
    // redrawing unchanged rather than an error anyone has to see.
    expect(moveInOrder([0, 1, 2], 0, -1)).toEqual([0, 1, 2]);
    expect(moveInOrder([0, 1, 2], 2, 1)).toEqual([0, 1, 2]);
  });

  it("overlays a cost only where the engine and the printed number disagree", () => {
    // ST33-004 Borsalino: printed 6, played for 3 the turn an effect trashed a
    // card from its controller's hand. Three DON!! were enough and the face
    // still said 6.
    expect(costOverlay(6, 3)).toEqual({
      cost: 3,
      direction: "lowered",
      title: "Cost lowered from 6 to 3 by an effect",
    });
    // OP15-088 Pirates Docking Six, the other direction: a printed 5 that every
    // "cost 5 or less" effect on the board measures as an 11.
    expect(costOverlay(5, 11)).toEqual({
      cost: 11,
      direction: "raised",
      title: "Cost raised from 5 to 11 by an effect",
    });
    // Nothing to say: the art already prints it.
    expect(costOverlay(6, 6)).toBeNull();
    // A face with no observation behind it -- a catalog preview, a trash top --
    // and a Leader, which has no cost at all.
    expect(costOverlay(6, undefined)).toBeNull();
    expect(costOverlay(undefined, 3)).toBeNull();
  });

  it("requires defense to be strictly greater than attack", () => {
    expect(defenseStopsAttack(5_000, 6_000)).toBe(true);
    expect(defenseStopsAttack(5_000, 5_000)).toBe(false);
    expect(defenseStopsAttack(6_000, 5_000)).toBe(false);
  });

  it("returns opponent counter cards from the latest battle in play order", () => {
    expect(
      opponentCounterCardsForLatestBattle(
        [
          {
            type: "counter-used",
            playerId: "p2",
            cardNumber: "OLD",
            power: 1_000,
          },
          { type: "attack-declared" },
          {
            type: "counter-used",
            playerId: "p2",
            cardNumber: "COUNTER-A",
            power: 2_000,
          },
          {
            type: "counter-used",
            playerId: "p1",
            cardNumber: "SELF",
            power: 1_000,
          },
          { type: "event-activated", playerId: "p2", cardNumber: "COUNTER-B" },
          {
            type: "counter-used",
            playerId: "p2",
            cardNumber: "COUNTER-A",
            power: 2_000,
          },
          { type: "battle-resolved" },
        ],
        "p1",
      ),
    ).toEqual([
      { cardNumber: "COUNTER-A", power: 2_000 },
      { cardNumber: "COUNTER-B" },
      { cardNumber: "COUNTER-A", power: 2_000 },
    ]);
  });

  it("keeps the verb when the only other words are the pictured card", () => {
    // Kuina's activation: the reader selected Kuina, and Brook is the face on
    // the button, so the cost and the target description are both redundant --
    // but "Brook" alone would not say what the button does to it.
    expect(
      picturedSummary(
        "Rest Kuina and the opponent's Brook [ST31-003] (Character, 7000 power, active)",
        "Brook",
        "Kuina",
      ),
    ).toBe("Rest Brook");
    expect(picturedSummary("Rest X.Drake and Brook", "Brook", "X.Drake")).toBe(
      "Rest Brook",
    );
  });

  it("says a Counter Event's cost and number instead of its printed clause", () => {
    // OP04-016 Bad Manners Kick Course: "[printed text omitted -- pnpm card:text OP04-016]"
    expect(counterEventSummary("OP04-016", 3_000)).toBe(
      "Trash 1 · Counter +3k",
    );
    // OP17-077 Kundali Dragon Swarm pays DON!! instead, and OP12-037 pays
    // nothing at all.
    expect(counterEventSummary("OP17-077", 4_000)).toBe(
      "DON!! −1 · Counter +4k",
    );
    expect(counterEventSummary("OP12-037", 3_000)).toBe("Counter +3k");
  });

  itWithText(
    "keeps the half of a Counter Event that is not battle power",
    () => {
      // OP17-017 Ga Ha Ha Ha!!: the debuff outlives the battle, so it is the
      // reason to play the Event even when the defense already holds.
      expect(counterEventSummary("OP17-017", 2_000)).toBe(
        "Counter +2k · Give up to 1 of your opponent's Leader or Characters −2000 power during this turn.",
      );
      // OP15-074 Varie reaches nothing but its own [Enel], and only its second
      // half -- there is none -- could still be worth the card.
      expect(counterEventSummary("OP15-074", 0)).toBe("No counter power");
    },
  );

  it("offers the printed power when the engine will not promise one", () => {
    // OP17-038: "You may trash 1 card from your hand: ... gains +3000 power
    // during this battle." The player has yet to choose to pay, so the engine
    // forecasts no number and the printed one is the ceiling.
    expect(counterEventSummary("OP17-038", undefined)).toBe(
      "Trash 1 · Counter up to +3k",
    );
  });

  itWithText(
    "says an [On Your Opponent's Attack] cost and number, not its clause",
    () => {
      // OP17-049 Charlotte Linlin: "[printed text omitted -- pnpm card:text OP17-049]" The modal heading
      // already names the card, so the button says only what it costs and pays.
      expect(
        optionalEffectSummary(
          "Activate Charlotte Linlin [OP17-049]: [Once Per Turn] You may trash 1 card from your hand: Up to 1 of your Leader or Characters gains +1000 power during this battle.",
          "OP17-049",
        ),
      ).toBe("Trash 1 · +1k power");
      // OP17-057 Fullalead pays with two things, and OP17-058 Kaido pays DON!!
      // for a debuff that is not battle power at all.
      expect(
        optionalEffectSummary("Activate Fullalead [OP17-057]: ...", "OP17-057"),
      ).toBe("Rest this Stage and trash 1 · +1k power");
      expect(
        optionalEffectSummary("Activate Kaido [OP17-058]: ...", "OP17-058"),
      ).toBe(
        "DON!! −1 · Give up to 1 of your opponent's Characters −2000 power during this turn.",
      );
    },
  );

  it("keeps the engine's summary where there is no card named to drop", () => {
    // A resolve-effect summary that names no card is not an optional-effect
    // offer, and there is nothing in it the modal heading already says.
    expect(
      optionalEffectSummary("Add the top deck card to Life", "OP04-016"),
    ).toBe("Add the top deck card to Life");
  });

  it("drops the card the modal heading already names", () => {
    // Every optional effect is offered as "Activate <name> [<number>]", not
    // only the [On Your Opponent's Attack] pair, and the heading above the
    // buttons is "Resolve <name>'s card effect" in all of them.
    expect(
      optionalEffectSummary(
        "Activate Bad Manners Kick Course [OP04-016]: x",
        "OP04-016",
      ),
    ).toBe("x");
    // The shipped build holds no printed text, so the engine falls back to the
    // marker -- which still tells a reader which printed clause is asking.
    expect(
      optionalEffectSummary(
        "Activate Nico Robin [OP09-062] [When Attacking]",
        "OP09-062",
      ),
    ).toBe("Apply [When Attacking]");
    // Its counterpart keeps only the verb: the heading says whose effect it is.
    expect(
      optionalEffectSummary(
        "Don't apply Nico Robin [OP09-062]'s effect",
        "OP09-062",
      ),
    ).toBe("Don't apply");
  });

  it("names a later step of a paid clause by what it does, not by its cost", () => {
    // OP08-119 Kaido & Linlin asks about its two "up to 1" Life steps after
    // the DON!! −10 is paid. Each button says its step; the clause and its
    // cost are the heading's, and repeating them read as paying again.
    expect(
      optionalEffectSummary(
        "Continue Kaido & Linlin [OP08-119] [When Attacking]: add the top card of your deck to the top of your Life cards",
        "OP08-119",
      ),
    ).toBe("Add the top card of your deck to the top of your Life cards");
    expect(
      optionalEffectSummary(
        "Skip this step of Kaido & Linlin [OP08-119]'s effect",
        "OP08-119",
      ),
    ).toBe("Skip this step");
  });

  it("drops the cost and the pictured card from a summary that says more", () => {
    expect(
      picturedSummary(
        "Rest Thousand Sunny and give 1 rested DON!! to Jinbe [ST31-004] (Character, 5000 power, active)",
        "Jinbe",
        "Thousand Sunny",
      ),
    ).toBe("Give 1 rested DON!!");
    expect(
      picturedSummary(
        "Rest Kikunojo and give Brook -1000 power",
        "Brook",
        "Kikunojo",
      ),
    ).toBe("Give Brook -1000 power");
  });

  it("drops the identifiers the pictured face already prints, mid-sentence", () => {
    // OP04-016's [Trigger] offer, on the button that prints Sabo's face: the
    // number and the parenthesised role and power are all on the picture, and
    // whose card it is is not.
    expect(
      picturedSummary(
        "Activate Trigger targeting the opponent's Sabo [OP13-004] (Leader, 8000 power); it cannot attack this turn",
        "Sabo",
      ),
    ).toBe(
      "Activate Trigger targeting the opponent's Sabo; it cannot attack this turn",
    );
    expect(
      picturedSummary(
        "Activate Trigger targeting your Sabo [P-105] (Character, 7000 power, active); it can still attack this turn",
        "Sabo",
      ),
    ).toBe(
      "Activate Trigger targeting your Sabo; it can still attack this turn",
    );
  });

  it("collects a private look's faces, and ignores a public reveal", () => {
    expect(
      lookedAtCards(
        [
          {
            type: "card-revealed",
            cardNumber: "PUBLIC",
            sourceCardNumber: "OP07-022",
          },
          {
            type: "card-revealed",
            cardNumber: "OP06-038",
            sourceCardNumber: "OP07-022",
            visibleTo: "p1",
          },
          {
            type: "card-revealed",
            cardNumber: "ST32-003",
            sourceCardNumber: "OP07-022",
            visibleTo: "p1",
          },
          {
            type: "card-revealed",
            cardNumber: "THEIRS",
            sourceCardNumber: "OP12-034",
            visibleTo: "p2",
          },
        ],
        "p1",
      ),
    ).toEqual({
      sourceCardNumber: "OP07-022",
      cardNumbers: ["OP06-038", "ST32-003"],
    });
  });

  it("keeps only the last look when one action searches twice", () => {
    expect(
      lookedAtCards(
        [
          {
            type: "card-revealed",
            cardNumber: "FIRST",
            sourceCardNumber: "OP07-022",
            visibleTo: "p1",
          },
          {
            type: "card-revealed",
            cardNumber: "SECOND",
            sourceCardNumber: "OP12-034",
            visibleTo: "p1",
          },
        ],
        "p1",
      ),
    ).toEqual({ sourceCardNumber: "OP12-034", cardNumbers: ["SECOND"] });
  });

  it("reports no look when the action revealed nothing privately", () => {
    expect(lookedAtCards([{ type: "cards-drawn" }], "p1")).toBeNull();
  });
});

describe("DON!! return allocation", () => {
  /** Cheapest-first, the order the engine takes DON!! in when nobody chooses. */
  const pools = [
    { key: "rested", available: 3 },
    { key: "active", available: 1 },
    { key: "p1-leader", available: 2 },
  ];

  it("pays what the engine would have paid when nobody chooses", () => {
    expect(allocateDonReturn(pools, 2, {})).toEqual({ rested: 2 });
  });

  it("spills into the next pool once the cheapest runs out", () => {
    expect(allocateDonReturn(pools, 5, {})).toEqual({
      rested: 3,
      active: 1,
      "p1-leader": 1,
    });
  });

  it("honours a pool the player asked for and fills the rest cheaply", () => {
    expect(allocateDonReturn(pools, 3, { "p1-leader": 1 })).toEqual({
      rested: 2,
      "p1-leader": 1,
    });
  });

  it("will not take more from a pool than it holds", () => {
    expect(allocateDonReturn(pools, 2, { active: 4 })).toEqual({
      active: 1,
      rested: 1,
    });
  });

  it("trims a split the player has since lowered the count under", () => {
    // Both were asked for by hand; the count then dropped to 2, so the pool
    // spoken for last gives the DON!! back.
    expect(allocateDonReturn(pools, 2, { rested: 2, "p1-leader": 2 })).toEqual({
      rested: 2,
    });
  });

  it("keeps the first-named pool whole when trimming cannot spare it", () => {
    expect(allocateDonReturn(pools, 1, { rested: 2, active: 1 })).toEqual({
      rested: 1,
    });
  });

  it("asks nothing of a pool that has emptied since the modal opened", () => {
    expect(
      allocateDonReturn([{ key: "rested", available: 0 }], 2, { rested: 2 }),
    ).toEqual({});
  });

  it("leaves an edited split exactly as the player built it", () => {
    // No filling in: the size of the payment is the split, so a pool emptied
    // by hand stays empty rather than being topped up from the next along.
    expect(clampDonReturn(pools, { rested: 0, active: 1 }, 5)).toEqual({
      active: 1,
    });
  });

  it("holds an edited split to what each pool actually has", () => {
    expect(clampDonReturn(pools, { active: 4 }, 5)).toEqual({ active: 1 });
  });

  it("gives back the most recently spoken-for DON!! at the ceiling", () => {
    expect(
      clampDonReturn(pools, { rested: 3, active: 1, "p1-leader": 2 }, 4),
    ).toEqual({ rested: 3, active: 1 });
  });

  it("adds a split up to the payment it makes", () => {
    expect(totalDonReturned({ rested: 2, "p1-leader": 1 })).toBe(3);
    expect(totalDonReturned({})).toBe(0);
  });

  it("queues one answer per DON!!, cheapest pool first", () => {
    expect(donReturnPlan(pools, { rested: 2, "p1-leader": 1 })).toEqual([
      "rested",
      "rested",
      "p1-leader",
    ]);
  });
});

describe("the clause a decision modal is resolving", () => {
  // OP15-002 Lucy, whose pitch clause is printed once under two markers.
  const LUCY =
    "[When Attacking]/[On Your Opponent's Attack] You may trash any number of Event or Stage cards from your hand. This Leader gains +1000 power during this battle for every card trashed. [Activate: Main] [Once Per Turn] If you have activated an Event with a base cost of 3 or more during this turn, draw 1 card.";

  it("quotes a clause printed under two markers from either of them", () => {
    // `clauseTextOf` cuts at the next marker, so the first of a joined pair
    // owns nothing at all; the sentence belongs to both.
    expect(clauseQuote(LUCY, "[When Attacking]")).toBe(
      clauseQuote(LUCY, "[On Your Opponent's Attack]"),
    );
    expect(clauseQuote(LUCY, "[When Attacking]")).toBe(
      "You may trash any number of Event or Stage cards from your hand. This Leader gains +1000 power during this battle for every card trashed.",
    );
  });

  it("stops at the next clause, and says nothing for a marker not printed", () => {
    expect(clauseQuote(LUCY, "[Activate: Main]")).toBe(
      "[Once Per Turn] If you have activated an Event with a base cost of 3 or more during this turn, draw 1 card.",
    );
    expect(clauseQuote(LUCY, "[On Play]")).toBeUndefined();
  });

  it("names the only clause a card prints", () => {
    expect(resolvingClauseMarker(["[On Play]"], null)).toBe("[On Play]");
  });

  it("names the clause the battle the player is in belongs to", () => {
    const clauses = [
      "[When Attacking]",
      "[On Your Opponent's Attack]",
      "[Activate: Main]",
    ];
    expect(resolvingClauseMarker(clauses, "defending")).toBe(
      "[On Your Opponent's Attack]",
    );
    expect(resolvingClauseMarker(clauses, "attacking")).toBe(
      "[When Attacking]",
    );
    // OP17-064 King prints the short spelling of the same marker.
    expect(
      resolvingClauseMarker(
        ["[On Opponent's Attack]", "[Activate: Main]"],
        "defending",
      ),
    ).toBe("[On Opponent's Attack]");
  });

  it("names nothing rather than guessing between clauses", () => {
    // A `[Activate: Main]` quoted over a defender's choice would be worse than
    // quoting nothing, which is the bar `optionalClauseMarker` sets engine-side.
    expect(
      resolvingClauseMarker(["[On Play]", "[Activate: Main]"], null),
    ).toBeUndefined();
    expect(
      resolvingClauseMarker(["[On Play]", "[Activate: Main]"], "attacking"),
    ).toBeUndefined();
    expect(resolvingClauseMarker([], null)).toBeUndefined();
  });
});

describe("the verb over a pictured card choice", () => {
  it("says what the choice does to the card, not that it is a choice", () => {
    expect(destinationVerb({ zone: "trash", player: "self" })).toBe("Trash");
    expect(destinationVerb({ zone: "hand", player: "self" })).toBe(
      "Add to hand",
    );
    expect(destinationVerb({ zone: "hand", player: "owner" })).toBe(
      "Return to hand",
    );
  });

  it("keeps the engine's summary where the zone does not settle the verb", () => {
    // Either end of the deck, and the field does not say which; a card
    // arriving on the board may be played, given or returned.
    expect(destinationVerb({ zone: "deck", player: "self" })).toBeUndefined();
    expect(destinationVerb({ zone: "board", player: "self" })).toBeUndefined();
  });
});
