import { describe, expect, it } from "vitest";
import type { PublicEvent } from "@one-piece-sim/protocol";
import {
  cardLabel,
  collectCardInstances,
  eventText,
  formatCompactStat,
  seat,
  seatOwns,
  sourceSuffix,
} from "@one-piece-sim/engine-core";

describe("compact stats", () => {
  it("writes thousands the way the cards print them", () => {
    expect(formatCompactStat(5000)).toBe("5k");
    expect(formatCompactStat(1000)).toBe("1k");
    expect(formatCompactStat(-2000)).toBe("-2k");
  });

  it("leaves anything under a thousand alone", () => {
    expect(formatCompactStat(0)).toBe("0");
    expect(formatCompactStat(999)).toBe("999");
  });
});

describe("seats", () => {
  it("writes from the viewer's seat when there is one", () => {
    expect(seat("p1", "p1")).toBe("You");
    expect(seat("p2", "p1")).toBe("Opponent");
    expect(seatOwns("p1", "p1")).toBe("your");
    expect(seatOwns("p2", "p1")).toBe("the opponent's");
  });

  it("stays neutral for a log with no seat", () => {
    expect(seat("p1", undefined)).toBe("P1");
    expect(seatOwns("p2", undefined)).toBe("P2's");
  });
});

describe("card labels", () => {
  it("names a known card and falls back to the number otherwise", () => {
    expect(cardLabel("ST31-001")).not.toBe("ST31-001");
    expect(cardLabel("NOPE-999")).toBe("NOPE-999");
    expect(cardLabel(null)).toBe("a card");
  });

  it("attributes a step to its source card, with the number to disambiguate", () => {
    expect(sourceSuffix("ST31-001")).toContain("[ST31-001]");
    expect(sourceSuffix(undefined)).toBe("");
  });
});

describe("event prose", () => {
  it("reads as second person from a seat and third person without one", () => {
    const drew: PublicEvent = {
      type: "cards-drawn",
      playerId: "p1",
      count: 1,
    };
    expect(eventText(drew, "p1")).toBe("You drew 1 card.");
    expect(eventText(drew, "p2")).toBe("Opponent drew 1 card.");
    expect(eventText(drew)).toBe("P1 drew 1 card.");
  });

  it("pluralises a multi-card draw and attributes its source", () => {
    const drew: PublicEvent = {
      type: "cards-drawn",
      playerId: "p1",
      count: 2,
      sourceCardNumber: "ST31-001",
    };
    const text = eventText(drew, "p1");
    expect(text).toContain("drew 2 cards");
    expect(text).toContain("[ST31-001]");
  });

  it("says whose zone a card moved to, not just that it moved", () => {
    const moved: PublicEvent = {
      type: "card-moved",
      playerId: "p2",
      cardNumber: "ST31-001",
      from: "hand",
      to: "trash",
    } as PublicEvent;
    expect(eventText(moved, "p1")).toContain("the opponent's trash");
    expect(eventText(moved, "p2")).toContain("your trash");
  });

  it("names both ends of a Life move, including the position", () => {
    const toLife: PublicEvent = {
      type: "card-moved",
      playerId: "p1",
      cardNumber: "ST31-001",
      from: "hand",
      to: "life",
      position: "top",
    } as PublicEvent;
    const text = eventText(toLife, "p1");
    expect(text).toContain("top of your Life");
  });

  it("distinguishes the four battle outcomes", () => {
    const outcome = (value: string): string =>
      eventText(
        {
          type: "battle-resolved",
          outcome: value,
          attackPower: 5000,
          defensePower: 3000,
        } as unknown as PublicEvent,
        "p1",
      );
    expect(outcome("defended")).toContain("5k vs 3k");
    expect(outcome("character-ko")).toContain("K.O.'d a Character");
    expect(outcome("game-win")).toContain("final hit");
    expect(outcome("damage")).toContain("1 damage");
  });

  it("says who goes first, agreeing with the seat it is written for", () => {
    const created: PublicEvent = {
      type: "game-created",
      activePlayer: "p1",
    };
    expect(eventText(created, "p1")).toContain("You go first");
    expect(eventText(created)).toContain("P1 goes first");
  });

  it("says what a granted keyword lets the card do, not just its name", () => {
    const granted: PublicEvent = {
      type: "keyword-granted",
      playerId: "p2",
      targetInstanceId: "p2-card-17",
      targetCardNumber: "OP16-015",
      keyword: "Rush",
      expiresAtTurn: 4,
      sourceCardNumber: "OP16-001",
    };
    const text = eventText(granted, "p1");
    // The question this line exists to answer is "how did that attack on the
    // turn it was played?", so the keyword alone is not the answer.
    expect(text).toContain("[Rush]");
    expect(text).toContain("through turn 4");
    expect(text).toContain("attack on the turn it was played");
    expect(text).toContain("Portgas.D.Ace");
    expect(text).toContain("Monkey.D.Luffy");
  });

  it("says which card was let attack active Characters, and by what", () => {
    const granted: PublicEvent = {
      type: "attack-active-granted",
      playerId: "p2",
      targetInstanceId: "p2-leader",
      targetCardNumber: "OP11-001",
      expiresAtTurn: 4,
      sourceCardNumber: "EB03-008",
    };
    const text = eventText(granted, "p1");
    expect(text).toContain("Hibari");
    expect(text).toContain("attack active Characters");
    expect(text).toContain("through turn 4");
  });

  it("does not repeat a Trigger reveal's own number as its source", () => {
    const revealed: PublicEvent = {
      type: "card-revealed",
      playerId: "p1",
      cardNumber: "ST31-001",
      sourceCardNumber: "ST31-001",
    };
    // The card is both the reveal and the source, so "(via X [X])" is noise.
    expect(eventText(revealed, "p1")).not.toContain("via");
  });
});

describe("named steps", () => {
  const luffy = "ST31-001";
  const ace = "OP16-001";
  const played: PublicEvent = {
    type: "card-played",
    playerId: "p2",
    cardInstanceId: "p2-card-7",
    cardNumber: ace,
  };
  const names = collectCardInstances([played], [["p1-leader", luffy]]);

  it("says who attacked whom, with what", () => {
    const attacked: PublicEvent = {
      type: "attack-declared",
      playerId: "p2",
      attackerInstanceId: "p2-card-7",
      targetInstanceId: "p1-leader",
      power: 6000,
    };
    // Without an index the line is the one it always was: correct, and silent
    // about the Character that swung. A Leader is named from its instance id
    // alone, which is why it survives the missing index.
    expect(eventText(attacked, "p1")).toBe(
      "Opponent attacked your Leader for 6k.",
    );
    expect(eventText(attacked, "p1", names)).toBe(
      "Opponent attacked your Sanji (Leader) with the opponent's Portgas.D.Ace for 6k.",
    );
  });

  it("names the blocker that took the hit", () => {
    const blocked: PublicEvent = {
      type: "attack-blocked",
      playerId: "p2",
      blockerInstanceId: "p2-card-7",
    };
    expect(eventText(blocked, "p1", names)).toContain(
      "with the opponent's Portgas.D.Ace",
    );
  });

  it("names the Character an attack K.O.'d", () => {
    const resolved: PublicEvent = {
      type: "battle-resolved",
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      targetInstanceId: "p2-card-7",
      attackPower: 6000,
      defensePower: 5000,
      outcome: "character-ko",
    };
    expect(eventText(resolved, "p1", names)).toBe(
      "Attack K.O.'d the opponent's Portgas.D.Ace.",
    );
  });

  it("names the card a DON!! went on", () => {
    const attached: PublicEvent = {
      type: "don-attached",
      playerId: "p2",
      targetInstanceId: "p2-card-7",
      count: 2,
    };
    expect(eventText(attached, "p1", names)).toBe(
      "Opponent attached 2 DON!! to the opponent's Portgas.D.Ace.",
    );
  });

  it("says which card gave which card power, and for how long", () => {
    const buffed: PublicEvent = {
      type: "power-changed",
      playerId: "p2",
      targetInstanceId: "p2-card-7",
      amount: 2000,
      expiresAtTurn: 5,
      sourceCardNumber: luffy,
    };
    // "Power changed by 2k" said neither whose Character grew nor what did it.
    expect(eventText(buffed, "p1", names)).toBe(
      "Sanji [ST31-001] gave the opponent's Portgas.D.Ace +2k power through turn 5.",
    );
  });

  it("says a base power was replaced, not raised", () => {
    const set: PublicEvent = {
      type: "base-power-set",
      playerId: "p2",
      targetInstanceId: "p2-card-7",
      basePower: 7000,
      expiresAtTurn: 5,
      sourceCardNumber: luffy,
    };
    // "+2k power" would be a different claim, and a wrong one: a base that
    // becomes 7000 does not care what the card was printed at.
    expect(eventText(set, "p1", names)).toBe(
      "Sanji [ST31-001] made the opponent's Portgas.D.Ace's base power 7k through turn 5.",
    );
  });

  it("says what K.O.'d a Character, and whose it was", () => {
    const koed: PublicEvent = {
      type: "character-ko",
      playerId: "p2",
      cardInstanceId: "p2-card-7",
      cardNumber: ace,
      sourceCardNumber: luffy,
    };
    expect(eventText(koed, "p1")).toBe(
      "The opponent's Portgas.D.Ace was K.O.'d (via Sanji [ST31-001]).",
    );
  });

  it("names a Leader from the seat that owns it, even with no index", () => {
    const attacked: PublicEvent = {
      type: "attack-declared",
      playerId: "p1",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
      power: 5000,
    };
    expect(eventText(attacked, "p1", new Map())).toBe(
      "You attacked the opponent's Leader with your Leader for 5k.",
    );
  });

  it("indexes a card by every id an event pairs with a number", () => {
    const granted: PublicEvent = {
      type: "keyword-granted",
      playerId: "p2",
      targetInstanceId: "p2-card-3",
      targetCardNumber: "OP16-015",
      keyword: "Rush",
      expiresAtTurn: 4,
      sourceCardNumber: ace,
    };
    expect(collectCardInstances([granted]).get("p2-card-3")).toBe("OP16-015");
  });
});

describe("DON!! sentences in the history", () => {
  it("names the card a DON!! payment was made for", () => {
    expect(
      eventText(
        {
          type: "don-returned",
          playerId: "p1",
          count: 2,
          sourceCardNumber: "OP09-070",
        },
        "p1",
      ),
    ).toBe("You returned 2 DON!! to your DON!! deck (via Nami [OP09-070]).");
  });

  it("names the card behind a clause that fired on its own", () => {
    // The steps under it say what it did; this line is the one that says
    // nobody asked for them.
    const fired: PublicEvent = {
      type: "ability-triggered",
      playerId: "p1",
      sourceCardNumber: "OP09-061",
      sourceInstanceId: "p1-leader",
    };
    expect(eventText(fired, "p1")).toBe(
      "Your Monkey.D.Luffy [OP09-061] fired on its own.",
    );
    expect(eventText(fired, "p2")).toBe(
      "The opponent's Monkey.D.Luffy [OP09-061] fired on its own.",
    );
  });

  it("says when a once-per-turn clause fired with nothing to do", () => {
    // No steps follow it, so the line itself has to say the use is spent.
    const fizzled: PublicEvent = {
      type: "ability-triggered",
      playerId: "p1",
      sourceCardNumber: "OP08-067",
      sourceInstanceId: "p1-card-50",
      noEffect: true,
    };
    expect(eventText(fizzled, "p1")).toBe(
      "Your Charlotte Pudding [OP08-067] fired on its own but had nothing to do; it is spent for this turn.",
    );
  });

  it("names the card behind an ability the player activated", () => {
    // The mirror of the line above. A Leader never leaves the board, so
    // without this line its activation is a set of steps with no cause.
    const activated: PublicEvent = {
      type: "ability-activated",
      playerId: "p1",
      sourceCardNumber: "OP14-020",
      sourceInstanceId: "p1-leader",
    };
    expect(eventText(activated, "p1")).toBe(
      "You activated Dracule Mihawk [OP14-020].",
    );
    expect(eventText(activated, "p2")).toBe(
      "Opponent activated Dracule Mihawk [OP14-020].",
    );
  });

  it("writes the same payment from the other seat", () => {
    expect(
      eventText(
        {
          type: "don-returned",
          playerId: "p2",
          count: 1,
          sourceCardNumber: "OP09-070",
        },
        "p1",
      ),
    ).toBe(
      "Opponent returned 1 DON!! to the opponent's DON!! deck (via Nami [OP09-070]).",
    );
  });
  it("says what a restriction on a player stops them doing, from either seat", () => {
    const negated: PublicEvent = {
      type: "player-restricted",
      playerId: "p2",
      restriction: "on-play-negated",
      untilTurn: 8,
      sourceCardNumber: "OP09-081",
    };
    expect(eventText(negated, "p1")).toBe(
      "The opponent's [On Play] effects are negated through turn 8 (via Marshall.D.Teach [OP09-081]).",
    );
    expect(eventText(negated, "p2")).toBe(
      "Your [On Play] effects are negated through turn 8 (via Marshall.D.Teach [OP09-081]).",
    );
    expect(eventText(negated)).toBe(
      "P2's [On Play] effects are negated through turn 8 (via Marshall.D.Teach [OP09-081]).",
    );
  });

  it("keeps a restriction's cost bound, which is most of what it says", () => {
    // "You cannot play Characters" and "You cannot play Characters with a
    // cost of 5 or more" are different games, and OP12-030 prints the second.
    expect(
      eventText(
        {
          type: "player-restricted",
          playerId: "p1",
          restriction: "cannot-play-characters",
          untilTurn: 4,
          minBaseCost: 5,
          sourceCardNumber: "OP12-030",
        },
        "p1",
      ),
    ).toBe(
      "You cannot play Characters with a cost of 5 or more through turn 4 (via Dracule Mihawk [OP12-030]).",
    );
    expect(
      eventText(
        {
          type: "player-restricted",
          playerId: "p1",
          restriction: "leader-cannot-attack-characters",
          untilTurn: 4,
          maxBaseCost: 7,
          sourceCardNumber: "OP12-020",
        },
        "p1",
      ),
    ).toBe(
      "Your Leader cannot attack Characters with a base cost of 7 or less through turn 4 (via Roronoa Zoro [OP12-020]).",
    );
  });
});
