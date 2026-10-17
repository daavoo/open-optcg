import { describe, expect, it } from "vitest";
import { hasPrintedText } from "./support/printed-text.js";
import { cardFacts } from "@one-piece-sim/cards";
import { type PublicEvent } from "@one-piece-sim/protocol";
import {
  loadDeck,
  requireSupportedDeck,
  resolveDeck,
} from "@one-piece-sim/decks";
import {
  applyAction,
  createGame,
  currentPower,
  effectiveCost,
  fieldDonCount,
  getLegalActions,
  hasKeyword,
  observe,
  type BoardCard,
  type GameState,
} from "@one-piece-sim/engine-core";
import { covers, setTurnPlayer } from "./support/index.js";

const character = (
  instanceId: string,
  cardNumber: string,
  overrides: Partial<BoardCard> = {},
): BoardCard => ({
  instanceId,
  cardNumber,
  rested: false,
  playedTurn: 1,
  attachedDon: [],
  powerModifiers: [],
  ...overrides,
});

function submit(
  state: GameState,
  predicate: (action: ReturnType<typeof getLegalActions>[number]) => boolean,
): GameState {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  expect(action, "no matching legal action").toBeDefined();
  return applyAction(state, { ...action!, revision: state.revision }).state;
}

/**
 * Answers the `DON!! −N` pool choice, taking whichever DON!! the engine offers
 * first -- which is the cheapest, so this reproduces what it used to do
 * automatically before the controller was given the choice.
 */
function placeReturnedDon(state: GameState): GameState {
  let next = state;
  while (next.pendingEffect?.kind === "return-don") {
    next = submit(
      next,
      (action) =>
        action.type === "resolve-effect" && action.option.kind === "don-return",
    );
  }
  return next;
}

function scenario(): GameState {
  const state = createGame({
    gameId: "op16-enel",
    p1: resolveDeck("(Purple) Enel - Official Feature Deck"),
    p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    seed: "op16-enel-seed",
  });
  state.phase = "main";
  state.turn = 6;
  setTurnPlayer(state, "p1");
  for (const playerId of ["p1", "p2"] as const) {
    Object.assign(state.players[playerId], {
      hand: [],
      board: [],
      stage: null,
      activeDon: [],
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
    });
  }
  state.players.p1.life = state.players.p1.deck.splice(0, 4);
  state.players.p2.life = state.players.p2.deck.splice(0, 4);
  return state;
}

describe("OP-16 Purple Enel deck", () => {
  it("loads the published 50-card list", () => {
    const manifest = requireSupportedDeck(
      "(Purple) Enel - Official Feature Deck",
    );
    expect(manifest.leader).toBe("OP15-058");
    expect(loadDeck(manifest.id)).toHaveLength(50);
  });
});

describe("the Leader rewrites the DON!! deck size", () => {
  covers("OP15-058", "static");
  it("reads the size off the Leader's printed text", () => {
    expect(cardFacts("OP15-058").donDeckSize).toBe(6);
    expect(cardFacts("ST21-001").donDeckSize).toBe(10);
  });

  it("deals Enel six DON!! and everyone else ten", () => {
    const enel = createGame({
      gameId: "don-size",
      p1: resolveDeck("(Purple) Enel - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "don-size",
    });
    const total = (state: GameState, playerId: "p1" | "p2") =>
      state.players[playerId].donDeck.length +
      state.players[playerId].activeDon.length;
    expect(total(enel, "p1")).toBe(6);
    expect(total(enel, "p2")).toBe(10);
  });
});

describe("DON!! −N as a cost", () => {
  it("declines the effect rather than giving it away at zero DON!!", () => {
    const state = scenario();
    state.players.p1.activeDon = ["d1"];
    state.players.p1.hand = [{ instanceId: "ohm", cardNumber: "OP15-061" }];
    state.players.p1.donDeck = [];

    // Ohm costs its 1 DON!! to play; that DON!! is rested rather than gone, so
    // the DON!! −1 is still payable and the optional draw is offered. What must
    // not happen is the draw arriving without the cost.
    const played = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "ohm",
    );

    expect(fieldDonCount(played, "p1")).toBe(1);
    const offered = getLegalActions(played, "p1").filter(
      (action) => action.type === "resolve-effect",
    );
    expect(offered.length).toBeGreaterThan(0);
    // Declining leaves the DON!! on the field and draws nothing.
    const declined = submit(
      played,
      (action) =>
        action.type === "resolve-effect" && action.option.kind !== "confirm",
    );
    expect(fieldDonCount(declined, "p1")).toBe(1);
    expect(declined.players.p1.hand).toHaveLength(0);
  });

  it("returns the DON!! to the DON!! deck when the cost is paid", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3"];
    state.players.p1.hand = [{ instanceId: "ohm", cardNumber: "OP15-061" }];
    const donDeckBefore = state.players.p1.donDeck.length;

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "ohm",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId !== "skip",
    );

    // One DON!! left the field for the DON!! deck, and the draw happened.
    expect(state.players.p1.donDeck).toHaveLength(donDeckBefore + 1);
    expect(state.players.p1.hand).toHaveLength(1);
  });
});

describe("the DON!! ceiling gates five cards", () => {
  covers("OP15-067", "static");
  it("gives Shura [Rush] only at 6 or less DON!! on the field", () => {
    const state = scenario();
    state.players.p1.board = [
      character("shura", "OP15-067", { playedTurn: state.turn }),
    ];
    state.players.p1.activeDon = Array.from(
      { length: 6 },
      (_, index) => `d${index}`,
    );

    const underCeiling = getLegalActions(state, "p1").filter(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "shura",
    );
    expect(underCeiling.length).toBeGreaterThan(0);

    state.players.p1.activeDon.push("d6", "d7");
    expect(
      getLegalActions(state, "p1").filter(
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "shura",
      ),
    ).toHaveLength(0);
  });

  covers("OP15-118", "static");
  it("makes the 6-cost Enel 10000 power under the ceiling", () => {
    const state = scenario();
    state.players.p1.board = [character("enel", "OP15-118")];
    state.players.p1.activeDon = ["d1", "d2"];
    // 8000 printed, +2000 while at 6 or less DON!! on the field.
    expect(currentPower(state, "p1", "enel")).toBe(10_000);
    state.players.p1.activeDon.push("d3", "d4", "d5", "d6", "d7");
    expect(currentPower(state, "p1", "enel")).toBe(8_000);
  });
});

describe("removal immunity", () => {
  it("hides the 6-cost Enel from an opponent's K.O. effect", () => {
    let state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p2.activeDon = ["d1", "d2", "d3", "d4", "d5", "d6"];
    state.players.p1.activeDon = ["e1"];
    state.players.p1.board = [
      character("enel", "OP15-118"),
      character("ohm", "OP15-061"),
    ];
    // ST31-005 Franky's On Play K.O.s; any opponent K.O. effect will do.
    state.players.p2.board = [character("ryuma", "OP15-036")];
    state.players.p1.board[1]!.rested = true;

    state = submit(
      state,
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "ryuma",
    );

    const koOptions = getLegalActions(state, state.activePlayer).filter(
      (action) => action.type === "resolve-effect",
    );
    // Ohm is offered; the immune Enel is not.
    expect(koOptions.some((action) => action.optionId === "ohm")).toBe(true);
    expect(koOptions.some((action) => action.optionId === "enel")).toBe(false);
  });
});

describe("Events carry the card that sources them", () => {
  it("names the Event on its activate-main action", () => {
    const state = scenario();
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [{ instanceId: "thor", cardNumber: "OP15-075" }];

    const activation = getLegalActions(state, "p1").find(
      (action) => action.type === "activate-main",
    );

    expect(activation).toBeDefined();
    if (activation?.type !== "activate-main") throw new Error("wrong type");
    // Without this a policy could only tell one Event from another by parsing
    // the opaque optionId.
    expect(activation.sourceCardNumber).toBe("OP15-075");
    expect(activation.sourceInstanceId).toBe("thor");
    // The [Main] half only. The [Counter] half is a different action offered in
    // a different phase, and printing both invites spending the card now for a
    // line that belongs to the opponent's turn.
    if (!hasPrintedText()) {
      expect(activation.summary).toBe("Activate El Thor [OP15-075]");
    } else
      expect(activation.summary).toBe(
        "Activate El Thor [OP15-075]: DON!! −1: If your Leader is [Enel], up " +
          "to 1 of your Leader or Character cards gains +1000 power during " +
          "this turn. Then, K.O. up to 1 of your opponent's Characters with " +
          "3000 power or less.",
      );
  });

  it("states the cost and the effect of a board activation", () => {
    const state = scenario();
    state.players.p1.board = [character("enel", "OP15-060")];
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "OP15-075" }];

    const activation = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-060",
    );

    expect(activation).toBeDefined();
    if (activation?.type !== "activate-main") throw new Error("wrong type");
    // "Activate Enel" named the Leader, OP15-060 and OP15-118 alike and priced
    // none of them. An LLM playtest spent a turn defending with two of these as
    // Blockers it had never bought.
    if (!hasPrintedText()) {
      expect(activation.summary).toBe("Activate Enel [OP15-060]");
    } else
      expect(activation.summary).toBe(
        "Activate Enel [OP15-060]: DON!! −1: This Character gains [Blocker] " +
          "until the end of your opponent's next End Phase. Then, trash 1 card " +
          "from your hand.",
      );
  });

  it("pays the Event's DON!! −N and K.O.s a small Character", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [{ instanceId: "thor", cardNumber: "OP15-075" }];
    // El Thor buffs one of your own cards first, then K.O.s; give the buff a
    // target so both halves of the program present a real choice.
    state.players.p1.board = [character("ohm", "OP15-061")];
    state.players.p2.board = [character("nami", "OP01-016")];
    const donDeckBefore = state.players.p1.donDeck.length;

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-075",
    );
    expect(state.players.p1.donDeck).toHaveLength(donDeckBefore + 1);
    // Decline the power buff (a min-0 `choose` offers a confirm/"done" option
    // rather than a skip), then take the K.O.
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.option.kind === "confirm",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "card" &&
        action.option.card.instanceId === "nami",
    );

    expect(state.players.p2.board).toHaveLength(0);
  });

  covers("OP15-075", "[Main]");
  it("offers the Leader for El Thor's Main power boost", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [{ instanceId: "thor", cardNumber: "OP15-075" }];
    const before = currentPower(state, "p1", "p1-leader");

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-075",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "card" &&
        action.option.card.instanceId === "p1-leader",
    );

    expect(currentPower(state, "p1", "p1-leader")).toBe(before + 1_000);
  });

  it("reads a target's power without the DON!! it was given last turn", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [{ instanceId: "thor", cardNumber: "OP15-075" }];
    state.players.p1.board = [character("ohm", "OP15-061")];
    // A 3000-power Sanji the opponent gave 2 DON!! on their own turn. The DON!!
    // stays attached until their next Refresh Phase but grants power only
    // during their turn, so on this turn Sanji is 3000 -- inside El Thor's
    // "3000 power or less". Counting the stale DON!! read it as 5000 and made
    // the K.O. half of the Event resolve against an empty target list.
    state.players.p2.board = [
      character("sanji", "OP10-005", { attachedDon: ["od1", "od2"] }),
    ];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-075",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.option.kind === "confirm",
    );

    const koOptions = getLegalActions(state, "p1").filter(
      (action) => action.type === "resolve-effect",
    );
    const sanji = koOptions.find(
      (action) =>
        action.option.kind === "card" &&
        action.option.card.instanceId === "sanji",
    );
    expect(sanji, "Sanji was not offered as a K.O. target").toBeDefined();
    // The power printed on the option is what an LLM reasons over, so it has to
    // agree with the filter that let the option through.
    if (sanji?.option.kind !== "card") throw new Error("wrong option shape");
    expect(sanji.option.currentPower).toBe(3_000);

    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "card" &&
        action.option.card.instanceId === "sanji",
    );
    expect(state.players.p2.board).toHaveLength(0);
    // The DON!! it was holding goes back to its owner rather than vanishing.
    expect(state.players.p2.restedDon).toContain("od1");
  });

  covers("OP15-077", "[Main]");
  it("reports the Character Lightning Dragon holds down", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [{ instanceId: "dragon", cardNumber: "OP15-077" }];
    state.players.p2.board = [character("nami", "OP01-016", { rested: true })];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-077",
    );
    const choice = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "card" &&
        action.option.card.instanceId === "nami",
    );
    expect(choice, "the rested Character was not offered").toBeDefined();
    const applied = applyAction(state, {
      ...choice!,
      revision: state.revision,
    });

    // Holding a Character down changes nothing anyone can see: it stays rested,
    // keeps its power and its text, and simply fails to stand up a turn later.
    // Without this step the opponent's whole play read as "activated Lightning
    // Dragon, drew a card" and the Character looked ordinarily rested.
    const prevented = applied.events.find(
      (event) => event.type === "refresh-prevented",
    );
    expect(prevented).toEqual({
      type: "refresh-prevented",
      playerId: "p2",
      targetInstanceId: "nami",
      targetCardNumber: "OP01-016",
      expiresAtTurn: state.turn + 1,
      sourceCardNumber: "OP15-077",
    });

    // And the board the other player is shown says why their Character is stuck.
    const held = observe(applied.state, "p2").self.board.find(
      (card) => card.instanceId === "nami",
    );
    expect(held?.cannotRefreshUntilTurn).toBe(state.turn + 1);
  });

  it("still counts DON!! given this turn when the controller is targeting", () => {
    const state = scenario();
    // Same board, but now it is the Sanji player's turn: the given DON!! is
    // live, so a "3000 power or less" clause must not reach it.
    setTurnPlayer(state, "p2");
    state.players.p2.board = [
      character("sanji", "OP10-005", { attachedDon: ["od1", "od2"] }),
    ];

    // 3000 printed + 3000 from its own [Your Turn] clause + 2000 given DON!!.
    expect(currentPower(state, "p2", "sanji")).toBe(8_000);
  });
});

describe("the Enel Leader ability", () => {
  /** Legal only for the seat whose own second turn the player-turn count is. */
  const rampLegalOn = (turn: number, seat: "p1" | "p2") => {
    const state = scenario();
    state.turn = turn;
    state.activePlayer = seat;
    state.players[seat].leaderCardNumber = "OP15-058";
    state.players[seat].board = [character("ohm", "OP15-061")];
    state.players[seat].donDeck = ["a", "b", "c", "d", "e"];
    return getLegalActions(state, seat).some(
      (action) =>
        action.type === "activate-main" &&
        action.optionId.startsWith("enel-leader:"),
    );
  };

  it("waits for the controller's own second turn, from either seat", () => {
    // `turn` counts player-turns, so turns 1 and 2 are the two players' first
    // turns and turns 3 and 4 are their seconds. Reading the count as a game
    // turn instead let the player going second ramp a full turn early.
    expect(rampLegalOn(1, "p1")).toBe(false);
    expect(rampLegalOn(2, "p2")).toBe(false);
    expect(rampLegalOn(3, "p1")).toBe(true);
    expect(rampLegalOn(4, "p2")).toBe(true);
  });

  it("prices the gift on the action, and only where a recipient is named", () => {
    // `donGift` is what `rested-don-gift` keys on. Every other gift in the pool
    // is a `give-rested-don` choice and reaches a policy as `resolve-effect`
    // with the field set; this one is hard-coded here, and without the field the
    // format module was silent for the only deck whose Leader prints the clause.
    // The no-Characters variant gives nothing -- the DON!! stay in the cost area
    // -- so it must not claim to.
    const state = scenario();
    state.turn = 5;
    setTurnPlayer(state, "p1");
    state.players.p1.leaderCardNumber = "OP15-058";
    state.players.p1.donDeck = ["a", "b", "c", "d", "e"];
    state.players.p1.board = [
      { ...character("ohm", "OP15-061"), playedTurn: 3 },
    ];

    const targeted = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "activate-main" &&
        action.optionId.startsWith("enel-leader:"),
    );
    expect(targeted).toMatchObject({
      donGift: { count: 4, from: "rested" },
      targetInstanceId: "ohm",
    });

    state.players.p1.board = [];
    const boardless = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "activate-main" && action.optionId === "enel-leader",
    );
    expect(boardless).toBeDefined();
    expect(boardless).not.toHaveProperty("donGift");
  });

  it("reports the DON!! it pulls, with or without a body to give them to", () => {
    // The five DON!! leave the DON!! deck without going through the `add-don`
    // node that usually reports them, so the ramp that is this Leader's whole
    // plan happened between events. With nobody to give the four to there was
    // no `don-attached` either, and the activation emitted nothing at all.
    const activate = (board: ReturnType<typeof character>[]): PublicEvent[] => {
      const state = scenario();
      state.turn = 5;
      setTurnPlayer(state, "p1");
      state.players.p1.leaderCardNumber = "OP15-058";
      state.players.p1.donDeck = ["a", "b", "c", "d", "e"];
      state.players.p1.board = board.map((card) => ({
        ...card,
        playedTurn: 3,
      }));
      const action = getLegalActions(state, "p1").find(
        (candidate) =>
          candidate.type === "activate-main" &&
          candidate.optionId.startsWith("enel-leader"),
      );
      return applyAction(state, { ...action!, revision: state.revision })
        .events;
    };

    expect(activate([character("ohm", "OP15-061")])).toEqual([
      {
        type: "ability-activated",
        playerId: "p1",
        sourceCardNumber: "OP15-058",
        sourceInstanceId: "p1-leader",
      },
      {
        type: "don-added",
        playerId: "p1",
        count: 1,
        rested: false,
        sourceCardNumber: "OP15-058",
      },
      {
        type: "don-added",
        playerId: "p1",
        count: 4,
        rested: true,
        sourceCardNumber: "OP15-058",
      },
      // Named as the Leader's doing, not as a bare attachment: a step naming
      // no source ends the run a reader groups under the card that caused it,
      // and the gift is the half of this clause most worth seeing.
      {
        type: "don-attached",
        playerId: "p1",
        targetInstanceId: "ohm",
        count: 4,
        sourceCardNumber: "OP15-058",
      },
    ]);

    expect(activate([]).map((event) => event.type)).toEqual([
      "ability-activated",
      "don-added",
      "don-added",
    ]);
  });

  it("identifies which gift targets can still attack this turn", () => {
    const state = scenario();
    state.turn = 5;
    setTurnPlayer(state, "p1");
    state.players.p1.leaderCardNumber = "OP15-058";
    state.players.p1.donDeck = ["a", "b", "c", "d", "e"];
    state.players.p1.board = [
      { ...character("ready", "OP15-061"), playedTurn: 3 },
      { ...character("new", "OP15-118"), playedTurn: 5 },
      { ...character("spent", "OP15-066"), playedTurn: 3, rested: true },
    ];

    const summaries = getLegalActions(state, "p1")
      .filter(
        (action) =>
          action.type === "activate-main" &&
          action.optionId.startsWith("enel-leader:"),
      )
      .map((action) => action.summary);

    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Ohm.*can still attack this turn/),
        expect.stringMatching(/Enel.*cannot attack this turn/),
        expect.stringMatching(/Satori.*cannot attack this turn/),
      ]),
    );
    expect(
      summaries.every((summary) =>
        summary.includes("returns at your next Refresh"),
      ),
    ).toBe(true);
  });

  it("activates on an empty DON!! deck to give rested DON!! away", () => {
    // Comprehensive Rules 8-4-4-1: "up to" lets the player choose 0, so an
    // empty DON!! deck adds nothing and the give clause still resolves. Giving
    // to a newly played finisher is legal even though it cannot attack yet.
    let state = scenario();
    state.players.p1.board = [character("enel", "OP15-118")];
    state.players.p1.donDeck = [];
    state.players.p1.activeDon = [];
    state.players.p1.restedDon = ["a", "b", "c", "d", "e", "f"];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId.startsWith("enel-leader:"),
    );

    expect(
      state.players.p1.board.find((card) => card.instanceId === "enel")
        ?.attachedDon,
    ).toHaveLength(4);
    expect(state.players.p1.restedDon).toHaveLength(2);
    // 8000 printed, +2000 under the six-or-less ceiling, +1000 per given DON!!.
    expect(currentPower(state, "p1", "enel")).toBe(14_000);
  });

  it("stays off the list when it could neither add nor give", () => {
    const state = scenario();
    state.players.p1.board = [character("ohm", "OP15-061")];
    state.players.p1.donDeck = [];
    state.players.p1.restedDon = [];

    expect(
      getLegalActions(state, "p1").filter(
        (action) =>
          action.type === "activate-main" &&
          action.optionId.startsWith("enel-leader:"),
      ),
    ).toHaveLength(0);
  });

  covers("OP15-058", "[Activate: Main]");
  it("pulls DON!! out of the deck and gives four to a Character", () => {
    let state = scenario();
    state.players.p1.board = [character("ohm", "OP15-061")];
    // The DON!! deck refills as `DON!! −N` costs are paid; give it five.
    state.players.p1.donDeck = ["a", "b", "c", "d", "e"];
    state.players.p1.activeDon = [];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId.startsWith("enel-leader:"),
    );

    expect(state.players.p1.activeDon).toHaveLength(1);
    expect(
      state.players.p1.board.find((card) => card.instanceId === "ohm")
        ?.attachedDon,
    ).toHaveLength(4);
    expect(state.players.p1.donDeck).toHaveLength(0);
  });

  it("still ramps with an empty board, where there is nobody to give to", () => {
    // "[printed text omitted -- pnpm card:text <card>]" gives zero when
    // there is nobody to give to -- 8-4-4-1, the same "up to" reading that lets
    // the add clauses resolve off an empty DON!! deck -- and the two add clauses
    // above it still resolve. This used to be offered once per Character on the
    // board and so was not offered at all on an empty board, which cost the
    // deck its whole ramp for the turn: the ability is [Once Per Turn], and
    // 23.3% of benchmarked games reached the seat's own turn 2 with no
    // Character out.
    let state = scenario();
    state.players.p1.board = [];
    state.players.p1.donDeck = ["a", "b", "c", "d", "e"];
    state.players.p1.activeDon = [];
    state.players.p1.restedDon = [];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" && action.optionId === "enel-leader",
    );

    // One active from the first clause, four rested from the second, and none
    // given away: the DON!! stay in the cost area and come back active at the
    // next Refresh Phase.
    expect(state.players.p1.activeDon).toHaveLength(1);
    expect(state.players.p1.restedDon).toHaveLength(4);
    expect(state.players.p1.donDeck).toHaveLength(0);
  });

  it("offers nothing on an empty board once the DON!! deck is spent", () => {
    // The other half of the gate: with no Characters *and* an empty DON!! deck
    // there is nothing to add and nobody to give to, so the activation really is
    // inert and stays off the action list.
    const state = scenario();
    state.players.p1.board = [];
    state.players.p1.donDeck = [];
    state.players.p1.restedDon = ["a", "b"];

    expect(
      getLegalActions(state, "p1").filter(
        (action) =>
          action.type === "activate-main" &&
          action.optionId.startsWith("enel-leader"),
      ),
    ).toHaveLength(0);
  });

  it("is once per turn", () => {
    let state = scenario();
    state.players.p1.board = [character("ohm", "OP15-061")];
    state.players.p1.donDeck = ["a", "b", "c", "d", "e"];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId.startsWith("enel-leader:"),
    );

    expect(
      getLegalActions(state, "p1").filter(
        (action) =>
          action.type === "activate-main" &&
          action.optionId.startsWith("enel-leader:"),
      ),
    ).toHaveLength(0);
  });
});

describe("full-game smoke", () => {
  it("completes against every deck it will be trialled against", async () => {
    const { GameService } = await import("@one-piece-sim/engine-core");
    const { createRulesAgent } =
      await import("../packages/cli/src/agent-factory.js");
    for (const opponent of [
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Purple) Charlotte Katakuri - Starter Deck 34",
      "(Blue/Yellow) Nami - Official Feature Deck",
    ]) {
      for (const [p1, p2] of [
        ["(Purple) Enel - Official Feature Deck", opponent],
        [opponent, "(Purple) Enel - Official Feature Deck"],
      ] as const) {
        const service = new GameService();
        let observation = service.create({
          p1: resolveDeck(p1),
          p2: resolveDeck(p2),
          seed: `enel-smoke-${p1}-${p2}`,
        });
        const agents = {
          p1: createRulesAgent(p1),
          p2: createRulesAgent(p2),
        } as const;
        let actions = 0;
        while (observation.phase !== "finished" && actions < 800) {
          const action =
            await agents[observation.activePlayer].chooseAction(observation);
          observation = service.act(
            observation.gameId,
            observation.revision,
            action.actionId,
          );
          actions += 1;
        }
        expect(observation.winner, `${p1} vs ${p2}`).not.toBeNull();
      }
    }
  });
});

describe("OP15-118 Enel's search is a private look", () => {
  covers("OP15-118", "[On Play]");
  it("shows the added card only to the player who searched", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];
    state.players.p1.hand = [{ instanceId: "enel", cardNumber: "OP15-118" }];
    const deckTop = state.players.p1.deck[0]!;

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "enel",
    );
    // Six of the seven DON!! paid the cost, so the `DON!! −1` on top of it can
    // come from either pool and the controller is asked which.
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === "return-don:rested",
    );
    const search = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === `search-select:${deckTop.instanceId}`,
    );
    expect(search).toBeDefined();
    if (!search) throw new Error("no search-select option");
    const applied = applyAction(state, {
      ...search,
      revision: state.revision,
    });
    state = applied.state;

    const reveal = applied.events.find(
      (event) => event.type === "card-revealed",
    );
    expect(reveal).toMatchObject({
      type: "card-revealed",
      playerId: "p1",
      cardNumber: deckTop.cardNumber,
      sourceCardNumber: "OP15-118",
      visibleTo: "p1",
    });
    // The card went to the searcher's hand, and only their observation names it.
    expect(state.players.p1.hand.map((card) => card.instanceId)).toContain(
      deckTop.instanceId,
    );
    expect(observe(state, "p1").publicEvents).toContainEqual(reveal);
    expect(observe(state, "p2").publicEvents).not.toContainEqual(reveal);
  });

  it("keeps reveal-style searches public", () => {
    let state = scenario();
    // ST31-005 Thousand Sunny prints "[printed text omitted -- pnpm card:text ST31-005]": the
    // added card is public knowledge, so no visibleTo marks it private. Seed
    // the deck top with a Straw Hat Crew card so the search has something to
    // take from a deck that otherwise contains none.
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [{ instanceId: "sunny", cardNumber: "ST31-005" }];
    state.players.p1.deck.unshift({
      instanceId: "sunny-top",
      cardNumber: "ST31-003",
    });
    const deckTop = state.players.p1.deck[0]!;

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "sunny",
    );
    const search = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === deckTop.instanceId,
    );
    expect(search).toBeDefined();
    if (!search) throw new Error("no search-select option");
    const applied = applyAction(state, {
      ...search,
      revision: state.revision,
    });

    const reveal = applied.events.find(
      (event) => event.type === "card-revealed",
    );
    expect(reveal).toMatchObject({
      type: "card-revealed",
      playerId: "p1",
      cardNumber: deckTop.cardNumber,
      sourceCardNumber: "ST31-005",
    });
    expect(reveal).not.toHaveProperty("visibleTo");
  });
});

describe("OP09-072 Franky", () => {
  covers("OP09-072", "[On Play]");
  it("pays DON!! −2 and a card from hand to draw 2", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5", "d6"];
    state.players.p1.hand = [
      { instanceId: "franky", cardNumber: "OP09-072" },
      { instanceId: "spare", cardNumber: "OP15-075" },
    ];
    const donDeckBefore = state.players.p1.donDeck.length;

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "franky",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId !== "skip",
    );
    state = placeReturnedDon(state);
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "card" &&
        action.option.card.instanceId === "spare",
    );

    expect(state.players.p1.donDeck).toHaveLength(donDeckBefore + 2);
    expect(state.players.p1.trash.map((card) => card.instanceId)).toContain(
      "spare",
    );
    // Played Franky and trashed the spare out of a hand of two, then drew two.
    expect(state.players.p1.hand).toHaveLength(2);
  });

  it("keeps [Blocker] off its own program, from the printed text", () => {
    const state = scenario();
    state.players.p1.board = [character("franky", "OP09-072")];
    expect(hasKeyword(state, "p1", "franky", "Blocker")).toBe(true);
  });

  it("keeps the DON!! and draws nothing when the effect is declined", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5", "d6"];
    state.players.p1.hand = [
      { instanceId: "franky", cardNumber: "OP09-072" },
      { instanceId: "spare", cardNumber: "OP15-075" },
    ];
    const donDeckBefore = state.players.p1.donDeck.length;

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "franky",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "skip",
    );

    // Playing Franky rests its 4 DON!! but leaves them on the field; declining
    // returns none of them and trashes nothing.
    expect(state.players.p1.donDeck).toHaveLength(donDeckBefore);
    expect(fieldDonCount(state, "p1")).toBe(6);
    expect(state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "spare",
    ]);
  });

  it("does not offer a DON!! −2 it cannot complete on an empty hand", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5", "d6"];
    state.players.p1.hand = [{ instanceId: "franky", cardNumber: "OP09-072" }];
    const donDeckBefore = state.players.p1.donDeck.length;

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "franky",
    );

    // The trash is half the cost, so with nothing to trash the effect is not
    // on the table at all -- paying the DON!! for no draw is not a choice the
    // controller should be offered.
    expect(
      getLegalActions(state, "p1").filter(
        (action) => action.type === "resolve-effect",
      ),
    ).toHaveLength(0);
    expect(state.players.p1.donDeck).toHaveLength(donDeckBefore);
    expect(state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP15-060 Enel, the second 6-cost finisher", () => {
  it("shares OP15-118's power and removal immunity under the ceiling", () => {
    const state = scenario();
    state.players.p1.board = [character("enel", "OP15-060")];
    state.players.p1.activeDon = ["d1", "d2"];
    expect(currentPower(state, "p1", "enel")).toBe(10_000);
    state.players.p1.activeDon.push("d3", "d4", "d5", "d6", "d7");
    expect(currentPower(state, "p1", "enel")).toBe(8_000);
  });

  it("buys [Blocker] for a DON!! card and a card from hand", () => {
    let state = scenario();
    state.players.p1.board = [character("enel", "OP15-060")];
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [
      { instanceId: "pitch", cardNumber: "OP15-075" },
      { instanceId: "keep", cardNumber: "OP15-118" },
    ];
    const donDeckBefore = state.players.p1.donDeck.length;

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-060",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "pitch",
    );

    expect(state.players.p1.board[0]?.blockerUntilTurn).toBe(state.turn + 1);
    // DON!! −1 returns a card to the DON!! deck, and the discard is paid.
    expect(state.players.p1.donDeck).toHaveLength(donDeckBefore + 1);
    expect(state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "keep",
    ]);
    expect(hasKeyword(state, "p1", "enel", "Blocker")).toBe(true);
  });

  it("cannot block until that ability is paid for", () => {
    let state = scenario();
    state.players.p1.board = [character("enel", "OP15-060")];

    // The [Blocker] is printed inside the [Activate: Main] clause that sells
    // it, so an untouched Enel has no keyword to offer. A playtest match let it
    // block a 6000-power attack on the turn after it was played, with no
    // activation anywhere in the trace.
    expect(hasKeyword(state, "p1", "enel", "Blocker")).toBe(false);

    // It is a legal blocker the moment the ability resolves, and not before.
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "OP15-075" }];
    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-060",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "pitch",
    );
    expect(hasKeyword(state, "p1", "enel", "Blocker")).toBe(true);
  });

  it("is offered on the DON!! −1 alone, since the hand trash is not a cost", () => {
    const state = scenario();
    state.players.p1.board = [character("enel", "OP15-060")];
    const activation = (candidate: GameState) =>
      getLegalActions(candidate, "p1").filter(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "OP15-060",
      );

    // No DON!! on the field: the DON!! −1 cannot be paid.
    state.players.p1.activeDon = [];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "OP15-075" }];
    expect(activation(state)).toHaveLength(0);

    // "Then, trash 1 card from your hand" follows the colon, so an empty hand
    // does not withhold the [Blocker].
    state.players.p1.activeDon = ["d1"];
    state.players.p1.hand = [];
    expect(activation(state).length).toBeGreaterThan(0);
  });
});

describe("OP15-063 Gedatsu", () => {
  it("K.O.s a 2000-power Character on its own K.O. under the ceiling", () => {
    let state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.activeDon = ["d1"];
    state.players.p1.board = [
      character("gedatsu", "OP15-063", { rested: true }),
    ];
    state.players.p2.activeDon = ["e1", "e2", "e3", "e4", "e5", "e6"];
    state.players.p2.board = [
      character("attacker", "OP15-036"),
      character("small", "OP15-061"),
    ];

    // Battle destruction is a K.O. like any other, so Gedatsu's [On K.O.]
    // answers the attack that killed it.
    state = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "attacker" &&
        action.targetInstanceId === "gedatsu",
    );
    while (
      getLegalActions(state, state.activePlayer).some(
        (action) => action.type === "pass",
      ) &&
      !state.pendingEffect
    ) {
      state = submit(state, (action) => action.type === "pass");
    }
    while (
      state.pendingEffect &&
      getLegalActions(state, state.activePlayer).some(
        (action) => action.type === "resolve-effect",
      )
    ) {
      state = submit(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId !== "skip",
      );
    }

    expect(
      state.players.p1.board.some((card) => card.instanceId === "gedatsu"),
    ).toBe(false);
    expect(
      state.players.p2.board.some((card) => card.instanceId === "small"),
    ).toBe(false);
  });
});

describe("OP15-074 Varie", () => {
  covers("OP15-074", "[Main]");
  it("lifts a Character out of range of cost-based removal for a turn", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.board = [character("enel", "OP15-118")];
    state.players.p1.hand = [{ instanceId: "varie", cardNumber: "OP15-074" }];
    expect(effectiveCost(state, "p1", state.players.p1.board[0]!)).toBe(6);

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-074",
    );
    while (
      state.pendingEffect &&
      getLegalActions(state, state.activePlayer).some(
        (action) => action.type === "resolve-effect",
      )
    ) {
      state = submit(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId !== "skip",
      );
    }

    expect(effectiveCost(state, "p1", state.players.p1.board[0]!)).toBe(8);
    expect(state.players.p1.board[0]?.costModifiers?.[0]?.expiresAtTurn).toBe(
      state.turn + 1,
    );
  });
});

describe("OP16-073 Borsalino cannot be cast behind this Leader", () => {
  it("costs more than the six-card DON!! deck can ever put on the field", () => {
    // The guide recommends 1-2 copies as a DON!! extender. It is not a weak
    // card here, it is an unplayable one: the Leader rewrites the DON!! deck to
    // 6 cards, and every DON!! on the field comes from that deck.
    expect(cardFacts("OP15-058").donDeckSize).toBe(6);
    expect(cardFacts("OP16-073").cost).toBe(7);

    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "borsalino", cardNumber: "OP16-073" },
    ];
    state.players.p1.activeDon = Array.from(
      { length: 6 },
      (_, index) => `d${index}`,
    );
    state.players.p1.donDeck = [];

    expect(
      getLegalActions(state, "p1").filter(
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "borsalino",
      ),
    ).toHaveLength(0);
    expect(
      requireSupportedDeck("(Purple) Enel - Official Feature Deck").cards[
        "OP16-073"
      ],
    ).toBe(undefined);
  });
});

describe("the Counter step prices what it is defending", () => {
  /** The trace-4 endgame: an 8000 Leader attack into a 1-Life Enel Leader. */
  function battle(hand: readonly { instanceId: string; cardNumber: string }[]) {
    let state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p2.leaderAttachedDon = ["a", "b", "c"];
    state.players.p1.life = state.players.p1.deck.splice(0, 1);
    state.players.p1.hand = [...hand];
    state = submit(
      state,
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p1-leader",
    );
    return applyAction(state, {
      ...getLegalActions(state, "p1").find((action) =>
        action.actionId.endsWith("pass-block"),
      )!,
      revision: state.revision,
    }).state;
  }

  covers("OP15-076", "[Counter]");
  covers("OP15-078", "[Counter]");
  it("prices each Counter Event against the battle, not just its card text", () => {
    const state = battle([
      { instanceId: "mamaragan", cardNumber: "OP15-078" },
      { instanceId: "kiten", cardNumber: "OP15-076" },
    ]);
    const summaries = getLegalActions(state, "p1")
      .filter((action) => action.type === "activate-counter-event")
      .map((action) => action.summary);

    // 1000 + 2000 against a 3001 shortfall. An LLM spent both, reading "+2000"
    // against "2001" as enough, and lost the Life card with an empty hand. The
    // arithmetic Counter *cards* already carried says so outright.
    expect(summaries).toHaveLength(2);
    for (const summary of summaries) {
      expect(summary).toContain("the hand cannot reach it");
    }
    expect(
      summaries.some((s) => s.includes("+1000; defense becomes 6000")),
    ).toBe(true);
    expect(
      summaries.some((s) => s.includes("+2000; defense becomes 7000")),
    ).toBe(true);
  });

  it("says a hit costs the last Life card, not the game", () => {
    const state = battle([]);
    const pass = getLegalActions(state, "p1").find((action) =>
      action.actionId.endsWith("pass-counter"),
    );

    // At 1 Life a successful attack takes the Life card into hand; only a hit
    // at 0 Life ends the game. The model called this one "otherwise lethal".
    expect(pass?.summary).toContain(
      "the defender loses 1 of their 1 Life card to their hand",
    );

    state.players.p1.life = [];
    const atZero = getLegalActions(state, "p1").find((action) =>
      action.actionId.endsWith("pass-counter"),
    );
    expect(atZero?.summary).toContain("the attacker wins the game");
  });

  it("reports a name-restricted Event as worth nothing out of range", () => {
    let state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p2.board = [character("shura", "OP15-067")];
    state.players.p1.board = [
      character("vassal", "OP15-061", { rested: true }),
    ];
    state.players.p1.hand = [{ instanceId: "kiten", cardNumber: "OP15-076" }];
    state = submit(
      state,
      (action) =>
        action.type === "attack" && action.targetInstanceId === "vassal",
    );
    const passBlock = getLegalActions(state, "p1").find((action) =>
      action.actionId.endsWith("pass-block"),
    );
    if (passBlock) {
      state = applyAction(state, {
        ...passBlock,
        revision: state.revision,
      }).state;
    }

    // Kiten raises "1 of your [Enel] cards", and Ohm is not one, so it adds
    // nothing at all -- the hand cannot spend it for any benefit, and it is
    // not offered.
    const kiten = getLegalActions(state, "p1").find(
      (action) => action.type === "activate-counter-event",
    );
    expect(kiten).toBeUndefined();
  });
});
