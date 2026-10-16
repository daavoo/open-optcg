import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
  observe,
} from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's general rules Q&A, one `it` per question.
 *
 * Source: https://en.onepiece-cardgame.com/pdf/qa_rules.pdf (the "rules" row
 * of https://en.onepiece-cardgame.com/rules/faq/, revision 2025-02-28). Each
 * test name opens with the category Bandai files the question under and its
 * position in that PDF, so a ruling is found in the source by counting rows.
 * Comments paraphrase the ruling and the cards rather than quoting them: the
 * repository holds none of Bandai's text. A question the engine has no decision for
 * (the deck and the Leader are placed in one `createGame`, a webcam
 * procedure) is listed in `NOT_ENGINE_QUESTIONS` with the reason rather than
 * left silently out.
 *
 * Bandai does not number the questions. "Basic 17" is the 17th question filed
 * under Basic Rules, counting down the PDF -- the categories are interleaved
 * there, so the number is the position within the category, not the row.
 *
 * A ruling the engine does not follow is an `it.fails`, with what the engine
 * does instead beside it, so the disagreement stays visible and the test flips
 * the day the engine is fixed.
 *
 * The positions are built on the fixture decks wherever the ruling is about the
 * rules rather than a card: FIX-001 (cost 1, 2000, Counter +1000) and FIX-002
 * (cost 2, 4000) print nothing, so nothing on the board can be the reason a
 * test passes.
 */

/** p1 to act in its Main Phase, both sides bare, all ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks("FIXTURE-RED", "FIXTURE-BLUE")
    .seed(seed)
    .atTurn(3, { active: "p1" })
    .bareTable();

const lifeCards = (owner: string, count: number) =>
  copies(count, "FIX-001", `${owner}-life`);

const attack = (game: Game, attacker: string, target: string): void => {
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });
};

/** Passes the defender's Block and Counter windows without doing anything. */
const noDefence = (game: Game): void => {
  while (
    game.state.activeAttack &&
    (game.state.phase === "block" || game.state.phase === "counter")
  ) {
    game.pass();
  }
};

/** Picks one card in an open effect choice, by instance id. */
const choose = (game: Game, instanceId: string): void => {
  game.play(
    (action) =>
      action.type === "resolve-effect" &&
      action.option.kind === "card" &&
      action.option.card.instanceId === instanceId,
  );
};

/** Activates an Event's [Main] from the hand. */
const useEvent = (game: Game, cardNumber: string): void => {
  game.play({ type: "activate-main", sourceCardNumber: cardNumber });
};

const offered = (game: Game, type: LegalAction["type"]) =>
  game.legalActions().filter((action) => action.type === type);

describe("Bandai rules Q&A: Basic Rules", () => {
  // Engine disagrees: setup deals `deck.splice(0, n)` straight onto Life
  // (actions/mulligan-decision.ts), so the deck's top card becomes the *top*
  // Life card. Hidden and shuffled either way, but a seeded game draws a
  // different Life card first.
  it.fails(
    "Basic 2: the top card of the deck becomes the bottom Life card",
    () => {
      // The ruling: the deck's top card goes to the bottom of Life.
      const unkept = scenario()
        .decks("FIXTURE-RED", "FIXTURE-BLUE")
        .seed("faq-life-order")
        .build();
      const deckTop = unkept.state.players.p1.deck
        .slice(0, 5)
        .map((card) => card.instanceId);

      const game = scenario()
        .decks("FIXTURE-RED", "FIXTURE-BLUE")
        .seed("faq-life-order")
        .keepBothHands()
        .build();

      const life = game.state.players.p1.life.map((card) => card.instanceId);
      expect(life).toEqual([...deckTop].reverse());
    },
  );

  it("Basic 3: a Character reduced to 0 power or less stays on the field", () => {
    const game = table("faq-zero-power")
      .withBoard("p2", [character("target", "FIX-002")])
      .withHand("p1", copies(1, "OP13-020", "fist"))
      .build();

    useEvent(game, "OP13-020");
    choose(game, "target");

    expect(currentPower(game.state, "p2", "target")).toBe(-1000);
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "target",
    ]);
  });

  it("Basic 4: a DON!! given to a Character cannot be moved to another during the Main Phase", () => {
    const game = table("faq-no-don-transfer")
      .withBoard("p1", [
        character("holder", "FIX-001"),
        character("other", "FIX-002"),
      ])
      .withGivenDon("p1", "holder", 10)
      .build();

    // Every DON!! is on `holder`; nothing on offer moves one off it.
    expect(game.state.players.p1.activeDon).toHaveLength(0);
    expect(offered(game, "attach-don")).toEqual([]);
  });

  it("Basic 5: playing a Stage over a Stage trashes the one already there", () => {
    const game = table("faq-stage-replace")
      .withHand("p1", [instance("onigashima", "FIX-STAGE-ONIGASHIMA")])
      .withState((state) => {
        state.players.p1.stage = {
          instanceId: "zou",
          cardNumber: "FIX-STAGE-ZOU",
          rested: false,
        };
      })
      .build();

    game.play({ type: "play-card", cardNumber: "FIX-STAGE-ONIGASHIMA" });

    expect(game.state.players.p1.stage?.instanceId).toBe("onigashima");
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("zou");
  });

  it("Basic 6: there is no hand-size limit", () => {
    const game = table("faq-hand-limit")
      .withHand("p1", copies(15, "FIX-001", "held"))
      .withDeckTop("p1", copies(5, "FIX-002", "deck"))
      .withDeckTop("p2", copies(5, "FIX-002", "p2deck"))
      .build();

    game.pass();

    expect(game.state.players.p1.hand).toHaveLength(15);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("Basic 7: −10000 on a 6000-power Character leaves it at −4000", () => {
    // Two −5000 Meteor Fists on a 4000 Character: the same arithmetic, and
    // neither application stops at 0.
    const game = table("faq-negative-power")
      .withBoard("p2", [character("target", "FIX-002")])
      .withHand("p1", copies(2, "OP13-020", "fist"))
      .build();

    for (let cast = 0; cast < 2; cast += 1) {
      useEvent(game, "OP13-020");
      choose(game, "target");
    }

    expect(currentPower(game.state, "p2", "target")).toBe(-6000);
  });

  it("Basic 8: giving 1 DON!! to a Character at −4000 power makes it −3000", () => {
    const game = table("faq-negative-plus-don")
      .withBoard("p1", [
        character("weak", "FIX-002", {
          powerModifiers: [{ amount: -8000, expiresAtTurn: 99 }],
        }),
      ])
      .build();

    expect(currentPower(game.state, "p1", "weak")).toBe(-4000);
    game.play({ type: "attach-don", targetInstanceId: "weak" });
    expect(currentPower(game.state, "p1", "weak")).toBe(-3000);
  });

  it("Basic 9: a Character's cost cannot go below 0", () => {
    const game = table("faq-cost-floor")
      .withBoard("p2", [character("cheap", "FIX-001")])
      .withHand("p1", copies(1, "OP05-094", "patch"))
      .build();

    useEvent(game, "OP05-094");
    choose(game, "cheap");

    const cheap = game.state.players.p2.board.find(
      (card) => card.instanceId === "cheap",
    )!;
    expect(
      cheap.costModifiers?.reduce(
        (total, modifier) => total + modifier.amount,
        0,
      ),
    ).toBe(-3);
    expect(effectiveCost(game.state, "p2", cheap)).toBe(0);
  });

  it("Basic 10: a cost reduction does not follow a Character back to its owner's hand", () => {
    // The ruling: a card that changes zone sheds the effects it was under.
    const game = table("faq-cost-leaves-zone")
      .withBoard("p2", [character("bounced", "FIX-002")])
      .withHand("p1", [
        ...copies(1, "OP05-094", "patch"),
        ...copies(1, "OP09-058", "muggy"),
      ])
      .build();

    useEvent(game, "OP05-094");
    choose(game, "bounced");
    while (game.state.pendingEffect)
      game.play((action) => action.type === "resolve-effect");
    useEvent(game, "OP09-058");
    choose(game, "bounced");

    const inHand = game.state.players.p2.hand.find(
      (card) => card.instanceId === "bounced",
    );
    expect(inHand).toBeDefined();
    expect(effectiveCost(game.state, "p2", inHand!)).toBe(2);
  });

  it('Basic 11: a type including "XX" is met by "Former XX"', () => {
    // OP08-049 Speed Jil gains [Rush] when the card it reveals has a type
    // including {Whitebeard Pirates}; PRB02-008 Marco is {Former Whitebeard
    // Pirates}.
    const game = table("faq-type-includes-former")
      .withHand("p1", [instance("jil", "OP08-049")])
      .withDeckTop("p1", [instance("marco", "PRB02-008")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-049" });
    while (game.state.pendingEffect)
      game.play((action) => action.type === "resolve-effect");

    const jil = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP08-049",
    )!;
    expect(jil.rushUntilTurn).toBe(game.state.turn);
  });

  it("Basic 12: a 0-cost card can be used with no DON!! in the cost area", () => {
    // OP15-074 Varie's [Main] costs DON!! −1, which a given DON!! can pay
    // (Keywords 2), and its effect asks for an [Enel] Leader -- OP05-098,
    // which keeps the ten-card DON!! deck. With every DON!! on the Leader the Event's 0 is the
    // whole price of using it and the cost area holds nothing.
    const game = table("faq-zero-cost")
      .withLeader("p1", "OP05-098")
      .withHand("p1", [instance("varie", "OP15-074")])
      .withGivenDon("p1", "p1-leader", 10)
      .build();

    expect(game.state.players.p1.activeDon).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
    useEvent(game, "OP15-074");
    while (game.state.pendingEffect)
      game.play((action) => action.type === "resolve-effect");
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("varie");
  });

  it("Basic 13: every given DON!! returns to the cost area in the Refresh Phase", () => {
    const game = table("faq-refresh-returns")
      .withBoard("p1", [character("holder", "FIX-002")])
      .withGivenDon("p1", "holder", 3)
      .withGivenDon("p1", "p1-leader", 2)
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .withDeckTop("p2", copies(3, "FIX-001", "p2deck"))
      .build();

    game.pass();
    game.pass();

    const p1 = game.state.players.p1;
    expect(p1.board[0]?.attachedDon ?? []).toHaveLength(0);
    expect(p1.leaderAttachedDon).toHaveLength(0);
  });

  it("Basic 15: −2000 attacking −2000 wins the battle and K.O.s the target", () => {
    const debuff = [{ amount: -6000, expiresAtTurn: 99 }];
    const game = table("faq-negative-battle")
      .withBoard("p1", [
        character("attacker", "FIX-002", { powerModifiers: debuff }),
      ])
      .withBoard("p2", [
        character("target", "FIX-002", {
          rested: true,
          powerModifiers: debuff,
        }),
      ])
      .withLife("p2", lifeCards("p2", 2))
      .build();

    attack(game, "attacker", "target");
    noDefence(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("Basic 15: −2000 attacking a −2000 Leader deals 1 damage", () => {
    const game = table("faq-negative-leader")
      .withBoard("p1", [
        character("attacker", "FIX-002", {
          powerModifiers: [{ amount: -6000, expiresAtTurn: 99 }],
        }),
      ])
      .withState((state) => {
        state.players.p2.leaderPowerModifiers = [
          { amount: -7000, expiresAtTurn: 99 },
        ];
      })
      .withLife("p2", lifeCards("p2", 2))
      .build();

    attack(game, "attacker", "p2-leader");
    noDefence(game);

    expect(game.state.players.p2.life).toHaveLength(1);
  });

  it("Basic 16: 0 power attacking 0 power K.O.s the target", () => {
    const game = table("faq-zero-battle")
      .withBoard("p1", [
        character("attacker", "FIX-002", {
          powerModifiers: [{ amount: -4000, expiresAtTurn: 99 }],
        }),
      ])
      .withBoard("p2", [
        character("target", "FIX-002", {
          rested: true,
          powerModifiers: [{ amount: -4000, expiresAtTurn: 99 }],
        }),
      ])
      .build();

    attack(game, "attacker", "target");
    noDefence(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("Bandai rules Q&A: Keywords", () => {
  it("Keywords 3: a Character's Counter can only be used from the hand", () => {
    const game = table("faq-counter-hand-only")
      .withBoard("p1", [character("attacker", "FIX-002", { attachedDon: [] })])
      .withGivenDon("p1", "attacker", 2)
      .withBoard("p2", [character("onboard", "FIX-001")])
      .withLife("p2", lifeCards("p2", 2))
      .build();

    attack(game, "attacker", "p2-leader");
    while (game.state.phase !== "counter") game.pass();

    expect(offered(game, "counter")).toEqual([]);
  });

  // Engine disagrees: a Character card's Counter is added to
  // `activeAttack.counterPower` (actions/counter.ts), i.e. always to the
  // card being attacked, so one `counter` action is offered per card in hand
  // and none names another target.
  it.fails(
    "Keywords 4: a Counter can raise a card that is not being attacked, for the battle",
    () => {
      // The ruling: yes, for the rest of the battle -- a Character card's
      // Counter may go to any of your Leader or Characters, not only the
      // defender.
      const game = table("faq-counter-other-target")
        .withBoard("p1", [character("attacker", "FIX-002")])
        .withGivenDon("p1", "attacker", 2)
        .withBoard("p2", [character("bystander", "FIX-001")])
        .withHand("p2", [instance("counter", "FIX-001")])
        .withLife("p2", lifeCards("p2", 2))
        .build();

      attack(game, "attacker", "p2-leader");
      while (game.state.phase !== "counter") game.pass();

      const counters = offered(game, "counter");
      const targets = new Set(counters.map((action) => action.summary));
      expect(targets.size).toBeGreaterThan(1);
    },
  );

  it("Keywords 5: a Character's Counter costs nothing", () => {
    const game = table("faq-counter-free")
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withGivenDon("p1", "attacker", 2)
      .withHand("p2", [instance("counter", "FIX-001")])
      .withLife("p2", lifeCards("p2", 2))
      .withState((state) => {
        state.players.p2.restedDon.push(
          ...state.players.p2.activeDon.splice(0),
        );
      })
      .build();

    attack(game, "attacker", "p2-leader");
    while (game.state.phase !== "counter") game.pass();

    expect(game.state.players.p2.activeDon).toHaveLength(0);
    game.play({ type: "counter", cardInstanceId: "counter" });
    expect(game.state.activeAttack?.counterPower).toBe(1000);
  });
});

describe("Bandai rules Q&A: Basic Rules, battle", () => {
  it("Basic 14: a battle whose attacker leaves the field during the Counter Step ends without damage", () => {
    // EB01-010 There's No Way You Could Defeat Me!! K.O.s the attacker from
    // the Counter Step; the battle then stops short of the Damage Step.
    const game = table("faq-attacker-leaves")
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withGivenDon("p1", "attacker", 2)
      .withHand("p2", [instance("claw", "EB01-010")])
      .withLife("p2", lifeCards("p2", 2))
      .build();

    attack(game, "attacker", "p2-leader");
    while (game.state.phase !== "counter") game.pass();
    game.play({ type: "activate-counter-event", eventInstanceId: "claw" });
    choose(game, "attacker");
    while (game.state.activeAttack) game.pass();

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p2.life).toHaveLength(2);
  });
});

describe("Bandai rules Q&A: Keywords, DON!!", () => {
  it("Keywords 1: a [DON!! x2] clause still applies with 3 DON!! given", () => {
    // ST28-002 Izo gains [Blocker] at [DON!! x2].
    const game = table("faq-don-x-more")
      .withBoard("p1", [character("izo", "ST28-002")])
      .withGivenDon("p1", "izo", 3)
      .build();

    expect(hasKeyword(game.state, "p1", "izo", "Blocker")).toBe(true);
  });

  it("Keywords 2: DON!! −N can return DON!! given to the Leader", () => {
    // OP15-074 Varie's [Main] costs DON!! −1 and wants an [Enel] Leader.
    const game = table("faq-don-minus-given")
      .withLeader("p1", "OP05-098")
      .withHand("p1", [instance("varie", "OP15-074")])
      .withGivenDon("p1", "p1-leader", 10)
      .build();

    useEvent(game, "OP15-074");
    while (game.state.pendingEffect)
      game.play((action) => action.type === "resolve-effect");

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(9);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("Bandai rules Q&A: Keywords, timing", () => {
  it("Keywords 6: an Event's [Counter] cannot be used in the Main Phase", () => {
    const game = table("faq-counter-not-main")
      .withBoard("p2", [character("target", "FIX-002")])
      .withHand("p1", [instance("claw", "EB01-010")])
      .build();

    expect(
      game
        .legalActions()
        .filter(
          (action) =>
            (action.type === "activate-main" &&
              action.sourceCardNumber === "EB01-010") ||
            action.type === "activate-counter-event",
        ),
    ).toEqual([]);
  });

  it("Keywords 7: trashing a Character to make room for a sixth is not a K.O.", () => {
    // OP05-046 Dalmatian draws on [On K.O.].
    const game = table("faq-overflow-not-ko")
      .withBoard("p1", [
        character("dalmatian", "OP05-046"),
        ...["a", "b", "c", "d"].map((id) => character(id, "FIX-001")),
      ])
      .withHand("p1", [instance("sixth", "FIX-002")])
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "FIX-002" });
    choose(game, "dalmatian");
    const events = game.events;

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("dalmatian");
    expect(events.some((event) => event.type === "character-ko")).toBe(false);
    expect(game.state.players.p1.deck).toHaveLength(3);
  });

  it("Keywords 8: [On K.O.] fires when its own Character is K.O.'d, not when it K.O.s", () => {
    const game = table("faq-on-ko-self")
      .withBoard("p1", [character("dalmatian", "OP05-046")])
      .withGivenDon("p1", "dalmatian", 1)
      .withBoard("p2", [character("victim", "FIX-002", { rested: true })])
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .build();

    attack(game, "dalmatian", "victim");
    noDefence(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.deck).toHaveLength(3);
  });

  it("Keywords 9: same-name cards each use their own [Once Per Turn]", () => {
    // ST23-005 Yasopp's [Activate: Main] is [Once Per Turn] and gives a
    // rested DON!!.
    const game = table("faq-once-per-turn-same-name")
      .withBoard("p1", [
        character("yasopp-1", "ST23-005"),
        character("yasopp-2", "ST23-005"),
      ])
      .withDon("p1", { rested: 4 })
      .build();

    for (const source of ["yasopp-1", "yasopp-2"]) {
      game.play({ type: "activate-main", sourceInstanceId: source });
      while (game.state.pendingEffect) {
        game.play(
          (action) =>
            action.type === "resolve-effect" && action.option.kind === "card",
        );
      }
    }

    const ownDon =
      game.state.players.p1.leaderAttachedDon.length +
      game.state.players.p1.board.reduce(
        (total, card) => total + (card.attachedDon?.length ?? 0),
        0,
      );
    expect(ownDon).toBe(2);
  });

  it("Keywords 10: an [On Play] without a cost always resolves", () => {
    // OP16-055 Mr.2.Bon.Kurei's [On Play] draws with no cost.
    const game = table("faq-on-play-mandatory")
      .withHand("p1", [instance("bon", "OP16-055")])
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-055" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("Keywords 10: an [On Play] with a cost can be played without paying it", () => {
    // ST33-003 Smoker's [On Play] has an optional hand-trash cost.
    const game = table("faq-on-play-optional-cost")
      .withHand("p1", [
        instance("smoker", "ST33-003"),
        instance("keep", "FIX-001"),
      ])
      .withBoard("p2", [character("cheap", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST33-003" });
    while (game.state.pendingEffect) {
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          (action.option.kind === "skip" ||
            (action.option.kind === "confirm" &&
              action.option.choice === "done")),
      );
    }

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "keep",
    ]);
    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("Keywords 11: [When Attacking] fires only for the card that prints it", () => {
    // OP10-045 Cavendish draws and discards on [When Attacking].
    const game = table("faq-when-attacking-own")
      .withBoard("p1", [
        character("cavendish", "OP10-045"),
        character("other", "FIX-002"),
      ])
      .withLife("p2", lifeCards("p2", 3))
      .withDeckTop("p1", copies(5, "FIX-001", "deck"))
      .build();

    attack(game, "other", "p2-leader");
    expect(game.state.pendingEffect).toBeNull();
    noDefence(game);
    expect(game.state.players.p1.deck).toHaveLength(5);

    attack(game, "cavendish", "p2-leader");
    while (game.state.pendingEffect) {
      game.play((action) => action.type === "resolve-effect");
    }
    expect(game.state.players.p1.deck).toHaveLength(3);
  });
});

describe("Bandai rules Q&A: Keyword Effects, [Blocker]", () => {
  // OP04-077 Ideo prints [Blocker] and nothing else.
  const blockers = (seed: string) =>
    table(seed)
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withGivenDon("p1", "attacker", 2)
      .withLife("p2", lifeCards("p2", 3));

  it("Keyword Effects 1: at most one [Blocker] per battle", () => {
    const game = blockers("faq-one-blocker")
      .withBoard("p2", [
        character("ideo-1", "OP04-077"),
        character("ideo-2", "OP04-077"),
      ])
      .build();

    attack(game, "attacker", "p2-leader");
    expect(offered(game, "block")).toHaveLength(2);
    game.play({ type: "block", blockerInstanceId: "ideo-1" });

    expect(game.state.phase).not.toBe("block");
    expect(offered(game, "block")).toEqual([]);
  });

  it("Keyword Effects 2 and 5: neither the attacked Character nor a rested one can block", () => {
    const game = blockers("faq-blocker-not-target")
      .withBoard("p2", [
        character("attacked", "OP04-077", { rested: true }),
        character("resting", "OP04-077", { rested: true }),
        character("ready", "OP04-077"),
      ])
      .build();

    attack(game, "attacker", "attacked");

    expect(
      offered(game, "block").map(
        (action) => action.type === "block" && action.blockerInstanceId,
      ),
    ).toEqual(["ready"]);
  });

  it("Keyword Effects 3: a Counter can raise the Character that blocked", () => {
    const game = blockers("faq-counter-on-blocker")
      .withBoard("p2", [character("ideo", "OP04-077")])
      .withHand("p2", [instance("counter", "FIX-001")])
      .build();

    attack(game, "attacker", "p2-leader");
    game.play({ type: "block", blockerInstanceId: "ideo" });
    game.play({ type: "counter", cardInstanceId: "counter" });
    while (game.state.activeAttack) game.pass();

    // 6000 into Ideo's 2000 + 1000 still K.O.s; the point is the offer.
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("counter");
  });

  it("Keyword Effects 4: [Blocker] is optional", () => {
    const game = blockers("faq-blocker-optional")
      .withBoard("p2", [character("ideo", "OP04-077")])
      .build();

    attack(game, "attacker", "p2-leader");
    expect(offered(game, "block")).toHaveLength(1);
    noDefence(game);

    expect(game.state.players.p2.life).toHaveLength(2);
    expect(game.state.players.p2.board[0]?.rested).toBe(false);
  });
});

describe("Bandai rules Q&A: Keyword Effects, damage", () => {
  it("Keyword Effects 6: [Banish] trashes the Life card with no choice and no [Trigger]", () => {
    // P-045 Roronoa Zoro prints [Banish]; OP09-110 Pierre's [Trigger] would
    // otherwise be offered.
    const game = table("faq-banish")
      .withBoard("p1", [character("zoro", "P-045")])
      .withLife("p2", [instance("pierre", "OP09-110"), ...lifeCards("p2", 1)])
      .build();

    attack(game, "zoro", "p2-leader");
    noDefence(game);

    expect(game.state.pendingTrigger).toBeNull();
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "pierre",
    ]);
    expect(game.state.players.p2.hand).toHaveLength(0);
  });

  it("Keyword Effects 7: [Double Attack] always deals 2", () => {
    // P-028 Portgas.D.Ace prints [Double Attack].
    const game = table("faq-double-attack")
      .withBoard("p1", [character("ace", "P-028")])
      .withLife("p2", lifeCards("p2", 4))
      .build();

    attack(game, "ace", "p2-leader");
    noDefence(game);

    expect(game.state.players.p2.life).toHaveLength(2);
    expect(game.state.players.p2.hand).toHaveLength(2);
  });

  it("Keyword Effects 8: the second [Double Attack] point lands after the attacker leaves to a [Trigger]", () => {
    // OP06-101 O-Nami's [Trigger] K.O.s a cost-5 Character -- the attacker,
    // off the first point.
    const game = table("faq-double-attack-leaves")
      .withBoard("p1", [character("ace", "P-028")])
      .withLife("p2", [instance("o-nami", "OP06-101"), ...lifeCards("p2", 3)])
      .build();

    attack(game, "ace", "p2-leader");
    noDefence(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect) {
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          action.option.kind === "card" &&
          action.option.card.instanceId === "ace",
      );
    }

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p2.life).toHaveLength(2);
  });

  it("Keyword Effects 9: [Double Attack] cannot win from 1 Life", () => {
    const game = table("faq-double-attack-one-life")
      .withBoard("p1", [character("ace", "P-028")])
      .withLife("p2", lifeCards("p2", 1))
      .build();

    attack(game, "ace", "p2-leader");
    noDefence(game);

    expect(game.state.phase).not.toBe("finished");
    expect(game.state.players.p2.life).toHaveLength(0);
  });

  it("Keyword Effects 10: a [Trigger] card can be taken into hand without activating it", () => {
    const game = table("faq-trigger-decline")
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withGivenDon("p1", "attacker", 2)
      .withLife("p2", [instance("pierre", "OP09-110"), ...lifeCards("p2", 1)])
      .build();

    attack(game, "attacker", "p2-leader");
    noDefence(game);
    const decline = game
      .legalActions()
      .find(
        (action) =>
          action.type === "resolve-trigger" && action.optionId !== "activate",
      );
    expect(decline).toBeDefined();
    game.submit(decline!);

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "pierre",
    ]);
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("Keyword Effects 11: a Life card moved by an effect does not offer its [Trigger]", () => {
    // OP06-017 Meteor-Strike of Love's cost moves the top Life card to hand.
    const game = table("faq-trigger-only-on-damage")
      .withHand("p1", [instance("meteor", "OP06-017")])
      .withLife("p1", [instance("pierre", "OP09-110"), ...lifeCards("p1", 1)])
      .build();

    useEvent(game, "OP06-017");
    while (game.state.pendingEffect) {
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          (action.option.kind === "confirm" || action.option.kind === "card"),
      );
    }

    expect(game.state.pendingTrigger).toBeNull();
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "pierre",
    );
  });

  it("Keyword Effects 12: the first [Double Attack] point's [Trigger] resolves before the second point", () => {
    const game = table("faq-double-attack-trigger-order")
      .withBoard("p1", [character("ace", "P-028")])
      .withLife("p2", [instance("pierre", "OP09-110"), ...lifeCards("p2", 3)])
      .build();

    attack(game, "ace", "p2-leader");
    noDefence(game);

    // One Life card is gone and the [Trigger] is open: the second point waits.
    expect(game.state.pendingTrigger).not.toBeNull();
    expect(game.state.players.p2.life).toHaveLength(3);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect)
      game.play((action) => action.type === "resolve-effect");

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "pierre",
    ]);
    expect(game.state.players.p2.life).toHaveLength(2);
  });
});

describe("Bandai rules Q&A: Basic Rules, effects", () => {
  it('Basic 17: "up to" lets the player choose 0 cards', () => {
    const game = table("faq-up-to-zero")
      .withBoard("p2", [character("target", "FIX-002")])
      .withHand("p1", copies(1, "OP13-020", "fist"))
      .build();

    useEvent(game, "OP13-020");
    game.play(
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "confirm" &&
        action.option.choice === "done",
    );

    expect(game.state.pendingEffect).toBeNull();
    expect(currentPower(game.state, "p2", "target")).toBe(4000);
  });

  it("Basic 18: an effect can be used when its target is not there, and does nothing", () => {
    // The ruling: yes, and nothing happens.
    const game = table("faq-no-target")
      .withHand("p1", copies(1, "OP13-020", "fist"))
      .build();

    useEvent(game, "OP13-020");

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP13-020",
    ]);
  });

  it('Basic 19: a "during this turn" effect outlasts the card that made it', () => {
    // OP05-081 One-Legged Toy Soldier trashes itself to give an opposing
    // Character −3 cost for the turn.
    const game = table("faq-during-this-turn")
      .withBoard("p1", [character("soldier", "OP05-081")])
      .withBoard("p2", [character("target", "FIX-002")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "soldier" });
    while (game.state.pendingEffect) {
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          ((action.option.kind === "confirm" &&
            action.option.choice !== "done") ||
            (action.option.kind === "card" &&
              action.option.card.instanceId === "target")),
      );
    }

    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "soldier",
    ]);
    const target = game.state.players.p2.board[0]!;
    expect(
      target.costModifiers?.reduce(
        (total, modifier) => total + modifier.amount,
        0,
      ),
    ).toBe(-3);
  });

  it('Basic 20: an Event\'s [Trigger] is not "activating an Event"', () => {
    // OP10-003 Sugar's Leader adds a DON!! on the opponent's turn when its
    // player activates an Event. ST30-015's [Trigger] is used off the
    // damage, and the Leader must stay silent.
    const game = table("faq-trigger-is-not-activation")
      .withLeader("p2", "OP10-003")
      .withDonDeck("p2", 2)
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withGivenDon("p1", "attacker", 2)
      .withLife("p2", [instance("era", "ST30-015"), ...lifeCards("p2", 2)])
      .build();

    attack(game, "attacker", "p2-leader");
    noDefence(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    while (game.state.pendingEffect && game.state.activePlayer === "p2") {
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          action.option.kind === "card" &&
          action.option.card.instanceId === "attacker",
      );
    }

    expect(game.state.players.p2.donDeck).toHaveLength(2);
  });

  it("Basic 22: a card placed on an empty Life area becomes the Life card, face-down", () => {
    // OP15-113 Roronoa Zoro's [On Play] pays a hand trash to put the top
    // card of the deck on top of Life.
    const game = table("faq-life-from-empty")
      .withHand("p1", [
        instance("zoro", "OP15-113"),
        instance("fuel", "FIX-001"),
      ])
      .withDeckTop("p1", [instance("next", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-113" });
    while (game.state.pendingEffect) {
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          action.option.kind !== "skip" &&
          !(
            action.option.kind === "confirm" && action.option.choice === "done"
          ),
      );
    }

    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "next",
    ]);
    expect(game.state.players.p1.life[0]?.faceUp).not.toBe(true);
  });

  it("Basic 23: a card added from the deck to Life is hidden from both players", () => {
    const game = table("faq-life-hidden")
      .withHand("p1", [
        instance("zoro", "OP15-113"),
        instance("fuel", "FIX-001"),
      ])
      .withDeckTop("p1", [instance("next", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-113" });
    while (game.state.pendingEffect) {
      game.play(
        (action) =>
          action.type === "resolve-effect" &&
          action.option.kind !== "skip" &&
          !(
            action.option.kind === "confirm" && action.option.choice === "done"
          ),
      );
    }

    expect(observe(game.state, "p1").self.life).toEqual([{ faceUp: false }]);
    expect(observe(game.state, "p2").opponent.life).toEqual([
      { faceUp: false },
    ]);
  });

  it("Basic 24: a face-up Life card's [Trigger] can still be activated", () => {
    const game = table("faq-face-up-trigger")
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withGivenDon("p1", "attacker", 2)
      .withLife("p2", [
        instance("pierre", "OP09-110", { faceUp: true }),
        ...lifeCards("p2", 1),
      ])
      .build();

    attack(game, "attacker", "p2-leader");
    noDefence(game);

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-trigger" && action.optionId === "activate",
        ),
    ).toBe(true);
  });

  it("Advanced 1 and 2: a Life card looked at goes back to its owner's Life", () => {
    // OP06-099 Aisa looks at the top card of either player's Life and puts
    // it on the top or bottom.
    const game = table("faq-life-look-owner")
      .withHand("p1", [instance("aisa", "OP06-099")])
      .withLife("p1", lifeCards("p1", 2))
      .withLife("p2", [instance("theirs", "FIX-002"), ...lifeCards("p2", 2)])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-099" });
    game.play(
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "confirm" &&
        action.option.choice === "apply",
    );
    game.play({ type: "resolve-effect", summary: "opponent's Life" });
    // Only the two ends of the looked-at card's own Life stack are offered.
    expect(game.legalActions()).toHaveLength(2);
    game.play({ type: "resolve-effect", summary: "at the bottom" });

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(
      game.state.players.p2.life.map((card) => card.instanceId).at(-1),
    ).toBe("theirs");
  });

  it("Basic 26 and Advanced 7: given DON!! cannot pay a cost that rests DON!! in the cost area", () => {
    // OP05-029 Donquixote Doflamingo's [On Your Opponent's Attack] costs ➀,
    // a DON!! rested in the cost area. Every p2 DON!! is given to its
    // Leader, so ➀ is unpayable.
    const game = table("faq-given-don-cannot-rest")
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withGivenDon("p1", "attacker", 2)
      .withBoard("p2", [character("doffy", "OP05-029")])
      .withGivenDon("p2", "p2-leader", 10)
      .withLife("p2", lifeCards("p2", 2))
      .build();

    attack(game, "attacker", "p2-leader");

    expect(game.state.pendingEffect?.sourceCardNumber).not.toBe("OP05-029");
    expect(game.state.players.p2.leaderAttachedDon).toHaveLength(10);
  });
});

describe("Bandai rules Q&A: Keyword Effects, attack timing", () => {
  it("Keyword Effects 15: [On Your Opponent's Attack] is offered whichever card is attacked", () => {
    const game = table("faq-oyoa-any-target")
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withGivenDon("p1", "attacker", 2)
      .withBoard("p2", [
        character("doffy", "OP05-029"),
        character("other", "FIX-001", { rested: true }),
      ])
      .withLife("p2", lifeCards("p2", 2))
      .build();

    attack(game, "attacker", "other");

    expect(game.state.activePlayer).toBe("p2");
    expect(game.state.pendingEffect?.sourceCardNumber).toBe("OP05-029");
  });

  it("Keyword Effects 14: the attacker's [When Attacking] resolves before [On Your Opponent's Attack]", () => {
    // OP10-045 Cavendish draws on [When Attacking]; OP05-029 answers.
    const game = table("faq-when-attacking-first")
      .withBoard("p1", [character("cavendish", "OP10-045")])
      .withDeckTop("p1", copies(5, "FIX-001", "deck"))
      .withBoard("p2", [character("doffy", "OP05-029")])
      .withLife("p2", lifeCards("p2", 2))
      .build();

    attack(game, "cavendish", "p2-leader");

    expect(game.state.pendingEffect?.sourceCardNumber).toBe("OP10-045");
    while (game.state.pendingEffect?.sourceCardNumber === "OP10-045") {
      game.play((action) => action.type === "resolve-effect");
    }
    expect(game.state.players.p1.deck).toHaveLength(3);
    expect(game.state.pendingEffect?.sourceCardNumber).toBe("OP05-029");
  });
});

describe('Bandai rules Q&A: Advanced Rules, "cannot be rested"', () => {
  /**
   * OP13-032 Nico Robin's [On Play] bars an opposing Character from being
   * rested through the opponent's next turn. Played on p1's turn against
   * p2's `locked`.
   */
  const lockedBy = (seed: string, locked: ReturnType<typeof character>) => {
    const game = table(seed)
      .withHand("p1", [
        instance("robin", "OP13-032"),
        instance("kouzaburou", "OP12-029"),
      ])
      .withBoard("p1", [character("attacker", "FIX-002")])
      .withBoard("p2", [locked])
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .withDeckTop("p1", copies(3, "FIX-001", "deck"))
      .withDeckTop("p2", copies(3, "FIX-001", "p2deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP13-032" });
    choose(game, locked.instanceId);
    return game;
  };

  it("Advanced 10: a Character that cannot be rested cannot activate [Blocker]", () => {
    const game = lockedBy(
      "faq-unrestable-block",
      character("ideo", "OP04-077"),
    );

    attack(game, "attacker", "p2-leader");

    expect(offered(game, "block")).toEqual([]);
  });

  it("Advanced 11: a Character that cannot be rested cannot be rested by other effects", () => {
    const game = lockedBy(
      "faq-unrestable-effects",
      character("ideo", "OP04-077"),
    );

    // OP12-029 Shimotsuki Kouzaburou's [On Play] rests a cheap opposing
    // Character.
    game.play({ type: "play-card", cardNumber: "OP12-029" });
    while (game.state.pendingEffect) {
      game.play((action) => action.type === "resolve-effect");
    }

    expect(game.state.players.p2.board[0]?.rested).toBe(false);
  });

  it("Advanced 8: a Character that cannot be rested cannot attack", () => {
    const game = lockedBy(
      "faq-unrestable-attack",
      character("locked", "FIX-002"),
    );

    game.pass();
    while (game.state.activePlayer !== "p2" || game.state.phase !== "main")
      game.pass();

    expect(
      offered(game, "attack").filter(
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "locked",
      ),
    ).toEqual([]);
  });

  it('Advanced 9: a Character that cannot be rested cannot pay "You may rest this Character"', () => {
    // OP11-034 Hatchan's [Activate: Main] costs resting itself.
    const game = lockedBy(
      "faq-unrestable-activate",
      character("hatchan", "OP11-034"),
    );

    game.pass();
    while (game.state.activePlayer !== "p2" || game.state.phase !== "main")
      game.pass();
    const hatchan = game.state.players.p2.board.find(
      (card) => card.instanceId === "hatchan",
    )!;
    expect(hatchan.cannotRestUntilTurn).toBeGreaterThanOrEqual(game.state.turn);

    expect(
      game
        .legalActions()
        .filter(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "hatchan",
        ),
    ).toEqual([]);
  });
});

export const NOT_ENGINE_QUESTIONS = {
  "Basic 1":
    "Deck placement before the Leader reveal is one createGame call; there is no decision between them.",
  "Basic 25":
    "The webcam procedure for online events changes no rule the engine plays.",
  "Basic 21":
    'Defines "the top or bottom card" of Life; Advanced 1 and 2 and Basic 22 assert the positions.',
  "Keyword Effects 13": "OP03-074 Top Knot is not in the card registry.",
  "Advanced 3-6":
    'No registered card prints "treated as a card with all card names, types, and attributes", and OP04-005 Kung Fu Jugon is not in the registry.',
} as const;
