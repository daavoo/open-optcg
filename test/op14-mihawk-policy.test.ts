import { describe, expect, it } from "vitest";
import {
  applyAction,
  getLegalActions,
  observe,
} from "@one-piece-sim/engine-core";
import {
  chooseGenericCounter,
  policiesForDeck,
  policyContext,
  RegistryRulesAgent,
} from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * OP14-MIHAWK-SLASH's rules, posed as boards.
 *
 * Each rule is checked at its own **contribution** -- did this module, on this
 * candidate, say this thing -- rather than only at the action finally chosen. The
 * fault this guards is which branch classifies an option, and an outcome
 * assertion cannot see a branch stop firing.
 */

/** What the named module says about each candidate, with the reason. */
function contributions(
  state: Parameters<typeof observe>[0],
  moduleId: string,
): { action: LegalAction; score: number; reason: string | undefined }[] {
  const observation = observe(state, "p1");
  const context = policyContext(observation);
  const module = policiesForDeck(observation.self.leader.cardNumber).find(
    (candidate) => candidate.id === moduleId,
  );
  if (!module) throw new Error(`no module ${moduleId}`);
  return observation.legalActions.flatMap((action) => {
    const ranked = module.rank?.(context, action);
    const vetoed = module.veto?.(context, action);
    if (ranked === undefined && vetoed === undefined) return [];
    const score = typeof ranked === "number" ? ranked : (ranked?.score ?? 0);
    const reason =
      typeof ranked === "object" ? ranked.reason : (vetoed ?? undefined);
    return [{ action, score, reason }];
  });
}

/** True when the module removed this action outright. */
function vetoed(
  state: Parameters<typeof observe>[0],
  match: (action: LegalAction) => boolean,
): string | undefined {
  const observation = observe(state, "p1");
  const context = policyContext(observation);
  const module = policiesForDeck(observation.self.leader.cardNumber).find(
    (candidate) => candidate.id === "op14-mihawk",
  );
  const action = observation.legalActions.find(match);
  if (!action) throw new Error("the action under test is not on offer");
  return module?.veto?.(context, action);
}

/** OP14-MIHAWK-SLASH in a posed main phase against ST32, which has no module. */
function mihawkTurn(options: {
  hand?: ReturnType<typeof instance>[];
  selfBoard?: ReturnType<typeof character>[];
  opponentBoard?: ReturnType<typeof character>[];
  stage?: ReturnType<typeof instance> | null;
  restedDon?: number;
  deckTop?: ReturnType<typeof instance>[];
}) {
  const life = (player: "p1" | "p2") => copies(4, "OP12-034", `${player}-life`);
  const scene = scenario()
    .decks(
      "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed("op14-mihawk-policy")
    .bareTable()
    .atTurn(8, { active: "p1" })
    .withLife("p1", life("p1"))
    .withLife("p2", life("p2"))
    .withBoard("p1", options.selfBoard ?? [])
    .withBoard("p2", options.opponentBoard ?? [])
    .withStage("p1", options.stage ?? null)
    .withHand("p1", options.hand ?? []);
  if (options.deckTop) scene.withDeckTop("p1", options.deckTop);
  // `bareTable()` leaves every DON!! active, and the Leader's restand reads the
  // *rested* pool -- so a test about it has to carve one out.
  const rested = options.restedDon ?? 0;
  return rested > 0 ? scene.withDon("p1", { rested }) : scene;
}

/** OP12-023 Kawamatsu, a cost-5 6000 vanilla: the restand's own gate. */
const COST_FIVE = "OP12-023";
const COFFIN_BOAT = "OP14-039";
/** OP08-036 Electrical Luna: locks every rested cost-7-or-less body down. */
const BOARD_LOCK = "OP08-036";

const isLeaderActivation = (action: LegalAction) =>
  action.type === "activate-main" && action.sourceCardNumber === "OP14-020";

describe("the Leader's restand, and its three preconditions", () => {
  it("refuses to rest a card with no cost-5 Character on either board", () => {
    // Both halves of the payoff -- the DON!! and the play lock -- sit inside
    // the printed `if`, and the cost is paid before it is read.
    const game = mihawkTurn({
      selfBoard: [character("small", "OP12-034")],
      restedDon: 4,
    }).build();

    expect(vetoed(game.state, isLeaderActivation)).toBe(
      "Do not rest a card for the restand without a cost-5 Character on a board.",
    );
  });

  it("refuses to cash the restand with fewer than two rested DON!!", () => {
    // "[printed text omitted -- pnpm card:text <card>]" moves `min(3, rested)`, so at
    // the top of a turn it moves nothing.
    const game = mihawkTurn({
      selfBoard: [character("kawamatsu", COST_FIVE)],
      restedDon: 1,
    }).build();

    expect(vetoed(game.state, isLeaderActivation)).toBe(
      "Do not cash the restand with fewer than 2 rested DON!! to set up.",
    );
  });

  it("refuses to restand while a Character play is still affordable", () => {
    // "[printed text omitted -- pnpm card:text <card>]" Develop first;
    // the refund can buy Events, attachments and attacks but never a body back.
    const game = mihawkTurn({
      hand: [instance("body", COST_FIVE)],
      selfBoard: [character("kawamatsu", COST_FIVE)],
      restedDon: 4,
    }).build();

    expect(vetoed(game.state, isLeaderActivation)).toBe(
      "Develop every Character first; the restand locks Character plays out.",
    );
  });

  it("takes the restand once the board is developed and DON!! are rested", () => {
    const game = mihawkTurn({
      selfBoard: [character("kawamatsu", COST_FIVE)],
      restedDon: 4,
    }).build();

    expect(vetoed(game.state, isLeaderActivation)).toBeUndefined();
  });
});

describe("which of your own cards pays a rest cost", () => {
  it("pays with the Stage and not with a Leader that can still swing", () => {
    // The Leader is the first option the engine offers, and paying with it
    // sells a 6000 attack.
    const game = mihawkTurn({
      selfBoard: [character("kawamatsu", COST_FIVE)],
      stage: instance("boat", COFFIN_BOAT),
      restedDon: 4,
    }).build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });

    const scores = new Map(
      contributions(game.state, "op14-mihawk")
        .filter((entry) => entry.action.type === "resolve-effect")
        .map((entry) => [
          entry.action.type === "resolve-effect"
            ? entry.action.optionId
            : "other",
          entry.score,
        ]),
    );

    // Ordered, not merely non-zero: the Stage costs nothing, the body costs an
    // attack it can spare, and the Leader costs the deck's whole clock.
    expect(scores.get("boat")!).toBeGreaterThan(scores.get("kawamatsu")!);
    expect(scores.get("kawamatsu")!).toBeGreaterThan(scores.get("p1-leader")!);
    // Still above declining the effect entirely: see `leaderRestValue`.
    expect(scores.get("p1-leader")!).toBeGreaterThan(0);
  });
});

describe("what the draw Event may be paid with", () => {
  /** OP01-055, whose cost is two of your own Characters rested. */
  const REST_DRAW = "OP01-055";
  /** OP14-023 Kikunojo, which sets itself active at the end of your turn. */
  const KIKUNOJO = "OP14-023";

  const isDrawEvent = (action: LegalAction) =>
    action.type === "activate-main" && action.sourceCardNumber === REST_DRAW;

  it("refuses the cast with one Character, however many other cards could rest", () => {
    // The Leader and the Stage are both active and both willing payers of the
    // Leader's own cost, and neither is a Character: the clause cannot be paid.
    const game = mihawkTurn({
      hand: [instance("samurai", REST_DRAW)],
      selfBoard: [character("kawamatsu", COST_FIVE)],
      stage: instance("boat", COFFIN_BOAT),
    }).build();

    expect(vetoed(game.state, isDrawEvent)).toBe(
      "Do not cast the draw Event without two Characters left to rest.",
    );
  });

  it("casts it with two active Characters", () => {
    const game = mihawkTurn({
      hand: [instance("samurai", REST_DRAW)],
      selfBoard: [
        character("kawamatsu", COST_FIVE),
        character("kiku", KIKUNOJO),
      ],
    }).build();

    expect(vetoed(game.state, isDrawEvent)).toBeUndefined();
  });

  it("pays with Kikunojo before a body that stays rested", () => {
    // Kikunojo stands back up at the end of the turn, so it is the cheapest
    // Character on the field to rest; the Stage is not offered at all, because
    // the clause names Characters.
    const game = mihawkTurn({
      hand: [instance("samurai", REST_DRAW)],
      selfBoard: [
        character("kawamatsu", COST_FIVE),
        character("oden", "ST32-002"),
        character("kiku", KIKUNOJO),
      ],
      stage: instance("boat", COFFIN_BOAT),
    }).build();

    game.play({ type: "activate-main", sourceInstanceId: "samurai" });
    // "You may" comes up first as apply-or-skip; the payers are offered after.
    game.play({ type: "resolve-effect", optionId: "apply" });

    const scores = new Map(
      contributions(game.state, "op14-mihawk")
        .filter((entry) => entry.action.type === "resolve-effect")
        .map((entry) => [
          entry.action.type === "resolve-effect"
            ? entry.action.optionId
            : "other",
          entry.score,
        ]),
    );

    expect(scores.has("boat")).toBe(false);
    expect(scores.has("p1-leader")).toBe(false);
    expect(scores.get("kiku")!).toBeGreaterThan(scores.get("kawamatsu")!);
    expect(scores.get("kiku")!).toBeGreaterThan(scores.get("oden")!);
  });
});

describe("Bonney's lock needs something rested to name", () => {
  /** OP07-026 Jewelry Bonney. */
  const BONNEY = "OP07-026";

  const bonneyPlay = (state: Parameters<typeof observe>[0]) =>
    contributions(state, "op14-mihawk").find(
      (entry) =>
        entry.action.type === "play-card" &&
        entry.action.cardInstanceId === "bonney",
    )!;

  it("marks the play down while nothing across the table is rested", () => {
    // The same hand on two boards: one with a body Bonney could hold down,
    // one without. Only the second is marked down, and it says why.
    const standing = mihawkTurn({
      hand: [instance("bonney", BONNEY)],
      opponentBoard: [character("theirs", COST_FIVE)],
    }).build();
    const rested = mihawkTurn({
      hand: [instance("bonney", BONNEY)],
      opponentBoard: [character("theirs", COST_FIVE, { rested: true })],
    }).build();

    const held = bonneyPlay(standing.state);
    expect(held.reason).toContain(
      "Hold Bonney until something across the table is rested.",
    );
    expect(bonneyPlay(rested.state).reason ?? "").not.toContain(
      "Hold Bonney until something across the table is rested.",
    );
    expect(held.score).toBeLessThan(bonneyPlay(rested.state).score);
  });
});

describe("activations that need a target before they need paying for", () => {
  it("holds Electrical Luna while nothing across the table is rested", () => {
    // Both locks read the board for *rested* Characters. Into a board that is
    // standing up they lock nothing and the card is spent for it.
    const game = mihawkTurn({
      hand: [instance("luna", BOARD_LOCK)],
      selfBoard: [character("a", COST_FIVE)],
      opponentBoard: [character("theirs", COST_FIVE)],
    }).build();

    expect(
      vetoed(
        game.state,
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === BOARD_LOCK,
      ),
    ).toBe("Hold Electrical Luna until a rested body would be locked by it.");
  });

  it("casts Electrical Luna once a rested body is there to lock", () => {
    const game = mihawkTurn({
      hand: [instance("luna", BOARD_LOCK)],
      selfBoard: [character("a", COST_FIVE)],
      opponentBoard: [character("theirs", COST_FIVE, { rested: true })],
    }).build();

    expect(
      vetoed(
        game.state,
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === BOARD_LOCK,
      ),
    ).toBeUndefined();
  });
});

describe("attachments", () => {
  it("refuses to give DON!! to a Character it has already rested", () => {
    const game = mihawkTurn({
      selfBoard: [character("spent", COST_FIVE, { rested: true })],
    }).build();

    expect(
      vetoed(
        game.state,
        (action) =>
          action.type === "attach-don" && action.targetInstanceId === "spent",
      ),
    ).toBe("Do not attach DON!! to a card that has already been rested.");
  });
});

describe("what the diggers come back with", () => {
  /** OP07-022 Otama, one of the eight 1-cost diggers. */
  const OTAMA = "OP07-022";
  /**
   * ST32-001 Kin'emon, a cost-1 {Land of Wano} body.
   *
   * Otama's clause names "[printed text omitted -- pnpm card:text ST32-001]", so a dig only ever
   * offers those -- a deck top of anything else poses a choice with one
   * candidate, which any rule passes.
   */
  const CHEAP_WANO = "ST32-001";

  /**
   * The board after Otama's [On Play] has been taken, which is where the deck
   * chooses one of five cards. Posed rather than played to a decision: the
   * choice is what is under test, not how the engine reaches it.
   */
  function digging(
    deckTop: string[],
    selfBoard: ReturnType<typeof character>[] = [],
  ) {
    const game = mihawkTurn({
      hand: [instance("otama", OTAMA)],
      selfBoard,
      deckTop: deckTop.map((cardNumber, index) =>
        instance(`top-${index}`, cardNumber),
      ),
    }).build();
    const play = getLegalActions(game.state, "p1").find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "otama",
    );
    if (!play) throw new Error("Otama is not playable on this board");
    return applyAction(game.state, {
      ...play,
      revision: game.state.revision,
    }).state;
  }

  /** What `op14-mihawk` scored each search candidate, highest first. */
  function ranked(state: Parameters<typeof observe>[0]) {
    const observation = observe(state, "p1");
    const context = policyContext(observation);
    const module = policiesForDeck(observation.self.leader.cardNumber).find(
      (candidate) => candidate.id === "op14-mihawk",
    );
    if (!module) throw new Error("no op14-mihawk module");
    return observation.legalActions
      .flatMap((action) => {
        const scored = module.rankAmong?.(context, action);
        if (scored === undefined) return [];
        const score = typeof scored === "number" ? scored : scored.score;
        return [{ action, score }];
      })
      .sort((left, right) => right.score - left.score);
  }

  it("takes the cost-5 body over a cheaper one while the restand is off", () => {
    // The Leader sets no DON!! active without a Character of cost 5 or more on
    // a board, so on this dig the 5-drop is the only card that switches the
    // deck's engine on. `chooseGenericRules` answers a search with the first
    // non-skip option, which is deck order.
    const state = digging([CHEAP_WANO, COST_FIVE]);
    const best = ranked(state)[0];

    expect(best).toBeDefined();
    expect(best!.action.type).toBe("resolve-effect");
    expect(
      best!.action.type === "resolve-effect"
        ? best!.action.optionCardNumber
        : undefined,
    ).toBe(COST_FIVE);
  });

  it("scores every candidate, so none is left for the ladder to take first", () => {
    // `rankAmong` hides the candidates it scored below the best and leaves
    // unscored ones alone -- so a rule that scored only the cost-5 bodies would
    // leave the rest in the running and the generic ladder would take one by
    // deck order anyway.
    const state = digging([CHEAP_WANO, COST_FIVE]);
    const scores = ranked(state);
    const picks = observe(state, "p1").legalActions.filter(
      (action) =>
        action.type === "resolve-effect" &&
        action.sourceCardNumber === OTAMA &&
        action.option.kind === "card" &&
        action.option.zone === "deck",
    );

    expect(picks.length).toBeGreaterThan(1);
    expect(scores.length).toBe(picks.length);
  });

  it("drops the cost-5 body's premium once the restand is already live", () => {
    // With a 5-drop already down the gate is open, so the next one is worth what
    // its body is worth rather than what the engine is worth.
    const off = ranked(digging([CHEAP_WANO, COST_FIVE]))[0]!.score;
    const on = ranked(
      digging([CHEAP_WANO, COST_FIVE], [character("gate", COST_FIVE)]),
    ).find(
      (entry) =>
        entry.action.type === "resolve-effect" &&
        entry.action.optionCardNumber === COST_FIVE,
    )!.score;

    expect(on).toBeLessThan(off);
  });
});

describe("which cost-5 body a dig comes back with", () => {
  /** OP12-034 Perona, the digger whose clause reaches <Slash> cards. */
  const PERONA = "OP12-034";
  /** ST32-002 Kouzuki Oden, a cost-5 body. */
  const ODEN = "ST32-002";
  /** OP17-022 Shanks, the cost-10 sweeper: also a body that opens the gate. */
  const SHANKS = "OP17-022";

  it("takes the 5-drop over the 10-drop when both switch the restand on", () => {
    // Both are cost-5-or-more and both are worth the premium, so the pick used
    // to fall to deck order -- Shanks first here, on purpose. Oden lands three
    // turns sooner, and every turn before a cost-5 body is down is a turn the
    // Leader's ability does nothing.
    const game = mihawkTurn({
      hand: [instance("perona", PERONA)],
      deckTop: [instance("top-0", SHANKS), instance("top-1", ODEN)],
    }).build();
    game.play({ type: "play-card", cardInstanceId: "perona" });

    const observation = observe(game.state, "p1");
    const context = policyContext(observation);
    const module = policiesForDeck("OP14-020").find(
      (candidate) => candidate.id === "op14-mihawk",
    )!;
    const score = (optionId: string) => {
      const action = observation.legalActions.find(
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === optionId,
      );
      if (!action) throw new Error(`${optionId} is not on offer`);
      const scored = module.rankAmong!(context, action)!;
      return typeof scored === "number" ? scored : scored.score;
    };

    expect(score("top-1")).toBeGreaterThan(score("top-0"));
    // Still both above the Stage's own premium, so the tie-break never demotes a
    // gate-opener below a Coffin Boat.
    expect(score("top-0")).toBeGreaterThan(80);
  });
});

describe("which body Law returns to hand", () => {
  /** OP13-031 Trafalgar Law: bounce one of yours, then play a body rested. */
  const LAW = "OP13-031";

  it("returns the rested body, not the one that can still attack", () => {
    // The replayed Character arrives rested either way, so a rested target
    // costs nothing and an active one costs the turn an attack. `standing` is
    // first on the board, which is the option the ladder would take.
    const game = mihawkTurn({
      hand: [instance("law", LAW)],
      selfBoard: [
        character("standing", COST_FIVE),
        character("spent", COST_FIVE, { rested: true }),
      ],
    }).build();
    game.play({ type: "play-card", cardInstanceId: "law" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    const observation = observe(game.state, "p1");
    const context = policyContext(observation);
    const module = policiesForDeck("OP14-020").find(
      (candidate) => candidate.id === "op14-mihawk",
    )!;
    const score = (optionId: string) => {
      const action = observation.legalActions.find(
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === optionId,
      );
      if (!action) throw new Error(`${optionId} is not on offer`);
      const scored = module.rankAmong!(context, action)!;
      return typeof scored === "number" ? scored : scored.score;
    };

    expect(score("spent")).toBeGreaterThan(score("standing"));
  });
});

/**
 * The decision OP17-099 Charlotte Linlin's [When Attacking] hands to the seat
 * it attacks. Read off two saved games of `rules-benchmark-...Linlin...
 * Mihawk...-2` and `-4`: the rules seat took the branch that heals Linlin at
 * all 50 offers across the twelve recorded losses, because both branches reach
 * the ladder as a beneficial effect with nothing to say which one.
 */
describe("what the Mihawk seat does with Linlin's [When Attacking]", () => {
  const LINLIN = "(Yellow) Charlotte Linlin - Official Feature Deck";
  const MIHAWK = "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1";

  /** Linlin's Leader attack, paid, at the branch choice that belongs to p1. */
  function attacked(hand: ReturnType<typeof instance>[]) {
    const game = scenario()
      .decks(MIHAWK, LINLIN)
      .seed("op14-mihawk-linlin-branch")
      .atTurn(9, { active: "p2" })
      .withStage("p1", instance("boat-down", COFFIN_BOAT))
      .withHand("p1", hand)
      .withHand("p2", [instance("paid", "OP17-113")])
      .build();
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "paid" });
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    return game;
  }

  const agent = () => new RegistryRulesAgent("OP14-020");

  it("makes Linlin take a card from its hand rather than add one to her Life", async () => {
    const game = attacked([instance("cheap", "OP07-022")]);
    const observation = observe(game.state, "p1");
    // The healing branch is the one offered first, so a pass on offer order
    // alone would not discriminate.
    expect(
      observation.legalActions.filter(
        (action) => action.type === "resolve-effect",
      )[0]?.optionId,
    ).toBe("mill-then-life");

    const action = await agent().chooseAction(observation);

    expect(action.type === "resolve-effect" && action.optionId).toBe(
      "opponent-discards",
    );
  });

  it("is not asked which card goes: Linlin's controller takes one at random", () => {
    const game = attacked([
      instance("shanks", "OP17-022"),
      instance("counter", "OP06-038"),
      instance("oden", "ST32-002"),
      instance("boat", COFFIN_BOAT),
    ]);
    game.play({ type: "resolve-effect", optionId: "opponent-discards" });

    expect(game.state.players.p1.hand).toHaveLength(3);
    expect(game.state.players.p1.trash).toHaveLength(1);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-effect" &&
            action.sourceCardNumber === "OP17-099",
        ),
    ).toBe(false);
  });
});

const MIHAWK_LEADER = "OP14-020";

/** True when the named module removed this action outright. */
function vetoedBy(
  state: Parameters<typeof observe>[0],
  moduleId: string,
  match: (action: LegalAction) => boolean,
): string | undefined {
  const observation = observe(state, "p1");
  const context = policyContext(observation);
  const module = policiesForDeck(observation.self.leader.cardNumber).find(
    (candidate) => candidate.id === moduleId,
  );
  const action = observation.legalActions.find(match);
  if (!action) throw new Error("the action under test is not on offer");
  return module?.veto?.(context, action);
}

describe("Electrical Luna waits for a board to lock", () => {
  const LUNA = "OP08-036";
  const isLuna = (action: LegalAction) =>
    action.type === "activate-main" && action.sourceCardNumber === LUNA;

  it("holds it while only one cheap body is rested", () => {
    const game = mihawkTurn({
      hand: [instance("luna", LUNA)],
      opponentBoard: [
        character("sanji", "OP17-082", { rested: true }),
        character("usopp", "OP17-080"),
      ],
    }).build();

    expect(vetoedBy(game.state, "op14-mihawk-luna-hold", isLuna)).toBe(
      "Hold Electrical Luna until it would lock at least two bodies.",
    );
  });

  it("casts it once two bodies it can hold down are rested", () => {
    const game = mihawkTurn({
      hand: [instance("luna", LUNA)],
      opponentBoard: [
        character("sanji", "OP17-082", { rested: true }),
        character("usopp", "OP17-080", { rested: true }),
      ],
    }).build();

    expect(
      vetoedBy(game.state, "op14-mihawk-luna-hold", isLuna),
    ).toBeUndefined();
  });

  it("does not count a rested giant, whose cost the clause cannot reach", () => {
    // "+12 cost" puts Saul and Loki past "a cost of 7 or less", so a board of
    // two rested giants is a board Luna locks nothing on.
    const game = mihawkTurn({
      hand: [instance("luna", LUNA)],
      opponentBoard: [
        character("saul", "OP17-089", { rested: true }),
        character("loki", "OP17-119", { rested: true }),
        character("sanji", "OP17-082", { rested: true }),
      ],
    }).build();

    expect(vetoedBy(game.state, "op14-mihawk-luna-hold", isLuna)).toBe(
      "Hold Electrical Luna until it would lock at least two bodies.",
    );
  });
});

describe("which card Kin'emon's draw-two trashes", () => {
  const KINEMON = "ST32-001";

  it("gives up the blank second Coffin Boat, not the finisher hand order offers first", async () => {
    // The draw resolves before the trash, so the two cards on top of the deck
    // are in hand by the time the choice is raised.
    const game = mihawkTurn({
      hand: [instance("kinemon", KINEMON), instance("shanks", "OP17-022")],
      stage: instance("stage", COFFIN_BOAT),
      deckTop: [instance("boat", COFFIN_BOAT), instance("law", "OP13-031")],
    }).build();

    game.play({ type: "play-card", cardInstanceId: "kinemon" });
    // "You may rest ...": accept, then pay with the Stage-less choice offered.
    const agent = new RegistryRulesAgent(MIHAWK_LEADER);
    let observation = observe(game.state, "p1");
    for (let step = 0; step < 4; step += 1) {
      const trashChoice = observation.legalActions.find(
        (action) =>
          action.type === "resolve-effect" &&
          action.effectKind === "draw-trash",
      );
      if (trashChoice) break;
      const next = await agent.chooseAction(observation);
      if (next.type !== "resolve-effect") throw new Error(next.type);
      game.play({ type: "resolve-effect", optionId: next.optionId });
      observation = observe(game.state, "p1");
    }
    expect(observation.self.hand.map((card) => card.instanceId)).toContain(
      "boat",
    );

    const action = await agent.chooseAction(observation);

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "boat" });
    const without = await new RegistryRulesAgent(MIHAWK_LEADER, {
      disableModules: ["op14-mihawk-hand-cost"],
    }).chooseAction(observation);
    expect(without.type === "resolve-effect" && without.optionId).not.toBe(
      "boat",
    );
  });
});

describe("a cost-5 body under attack", () => {
  /** The opponent's turn, with an attack declared at one of this seat's bodies. */
  function mihawkUnderAttack(options: {
    hand: ReturnType<typeof instance>[];
    target: string;
    attackPower: number;
  }) {
    return scenario()
      .decks(
        "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
        "(Red/Black) Sabo - OP17 Elbaph List",
      )
      .seed("op14-mihawk-body-save")
      .bareTable()
      .atTurn(8, { active: "p2" })
      .withLife("p1", copies(4, "OP12-034", "p1-life"))
      .withLife("p2", copies(4, "OP17-086", "p2-life"))
      .withBoard("p1", [character("oden", "ST32-002")])
      .withBoard("p2", [character("attacker", "OP17-093")])
      .withHand("p1", options.hand)
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: options.target,
          attackPower: options.attackPower,
          counterPower: 0,
        },
        "counter",
      )
      .build();
  }

  it("spends two Counter cards to keep Oden, the Leader's restand gate", async () => {
    // 8000 into a 6000 body is a 2001 shortfall: past the generic 1000 cap,
    // which is what let the only cost-5 body on the board die with two 1000
    // Counter cards in hand and the Leader's ability switched off with it.
    const game = mihawkUnderAttack({
      hand: [
        instance("kinemon", "ST32-001"),
        instance("perona", "OP12-034"),
        instance("decken", "OP06-033"),
      ],
      target: "oden",
      attackPower: 8_000,
    });

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );

    expect(action.type).toBe("counter");
    const without = await new RegistryRulesAgent(MIHAWK_LEADER, {
      disableModules: ["op14-mihawk-body-save"],
    }).chooseAction(observe(game.state, "p1"));
    expect(without.type).not.toBe("counter");
  });

  it("leaves a Leader hit to the defence policy", async () => {
    const game = mihawkUnderAttack({
      hand: [instance("kinemon", "ST32-001"), instance("perona", "OP12-034")],
      target: "p1-leader",
      attackPower: 7_000,
    });
    const observation = observe(game.state, "p1");
    const module = policiesForDeck(MIHAWK_LEADER).find(
      (candidate) => candidate.id === "op14-mihawk-body-save",
    );

    expect(module?.decide?.(policyContext(observation))).toBeUndefined();
  });
});

describe("where the turn's spare DON!! goes", () => {
  /** OP15-088 Pirates Docking Six: 7000, and its "+6 cost" keeps it worth removing. */
  const DOCKING_SIX = "OP15-088";
  /** OP12-023 Kawamatsu, the deck's vanilla 6000. */
  const KAWAMATSU = "OP12-023";

  it("arms the body that reaches a K.O. instead of the Leader", async () => {
    // `chooseGenericRules` attaches to the first recipient the engine offers,
    // which is the Leader every time. One DON!! on Kawamatsu turns an attack
    // that cannot win into a K.O.; the same DON!! on a Leader already past the
    // defender's Counter buys nothing.
    const game = mihawkTurn({
      selfBoard: [
        character("kawamatsu", KAWAMATSU),
        character("perona", "OP12-034"),
      ],
      opponentBoard: [character("docking", DOCKING_SIX, { rested: true })],
    }).build();

    const scored = contributions(game.state, "ko-reach-attachment");

    // Only the body within reach is scored: Perona at 2000 is five DON!! short
    // of the same target, which is past what the rule will buy.
    expect(scored.map((entry) => entry.action)).toEqual([
      expect.objectContaining({
        type: "attach-don",
        targetInstanceId: "kawamatsu",
      }),
    ]);

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );
    expect(action).toMatchObject({
      type: "attach-don",
      targetInstanceId: "kawamatsu",
    });

    // Without it the DON!! goes to the Leader, which is what pins the
    // registration rather than the rule: the module is shared, and this deck
    // opting into it is the claim under test.
    const without = await new RegistryRulesAgent(MIHAWK_LEADER, {
      disableModules: ["ko-reach-attachment"],
    }).chooseAction(observe(game.state, "p1"));
    expect(without).toMatchObject({
      type: "attach-don",
      targetInstanceId: "p1-leader",
    });
  });
});

describe("Kikunojo waits for a rest cost to pay", () => {
  const KIKUNOJO = "OP14-023";
  const OTAMA = "OP07-022";
  const isPlayOf = (instanceId: string) => (action: LegalAction) =>
    action.type === "play-card" && action.cardInstanceId === instanceId;

  /** The opening turn, one DON!!, Kikunojo and a searcher in hand. */
  function opening(turn: number) {
    return scenario()
      .decks(
        "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op14-mihawk-opening")
      .startingPlayer("p1")
      .atTurn(turn, { active: "p1" })
      .withLife("p1", copies(4, "OP12-034", "p1-life"))
      .withLife("p2", copies(4, "OP12-034", "p2-life"))
      .withBoard("p1", [])
      .withBoard("p2", [])
      .withHand("p1", [instance("kiku", KIKUNOJO), instance("otama", OTAMA)])
      .build();
  }

  it("holds Kikunojo on turn 1 and digs with the searcher instead", async () => {
    // No battle exists before turn 3 and no rest cost either, so the 1-cost
    // body buys nothing that turn. Without the veto the deck rule "develop
    // the largest body" outscores "dig with a searcher" and Kikunojo is cast.
    const game = opening(1);

    expect(
      vetoedBy(game.state, "op14-mihawk-opening-hold", isPlayOf("kiku")),
    ).toContain("Hold Kikunojo through the opening");
    expect(
      vetoedBy(game.state, "op14-mihawk-opening-hold", isPlayOf("otama")),
    ).toBeUndefined();

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );
    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "otama",
    });
  });

  it("lets it land from turn 3, when a rest cost can exist", () => {
    const game = opening(3);

    expect(
      vetoedBy(game.state, "op14-mihawk-opening-hold", isPlayOf("kiku")),
    ).toBeUndefined();
  });
});

describe("Vander Decken IX waits for something rested to shoot", () => {
  const DECKEN = "OP06-033";
  /** OP12-023 Kawamatsu, the list's other {Fish-Man}. */
  const KAWAMATSU = "OP12-023";
  const isDecken = (action: LegalAction) =>
    action.type === "play-card" && action.cardInstanceId === "decken";
  const emptyBoard =
    "Hold Vander Decken IX while the opponent has no Character; played into an empty board it is a 2000 body and the removal is gone.";
  const noPayer =
    "Hold Vander Decken IX until a {Fish-Man} is in hand to pay for its shot.";
  const ordering =
    "Hold Vander Decken IX until a rested body and a {Fish-Man} are both there.";
  const deckenPlay = (state: Parameters<typeof observe>[0]) =>
    contributions(state, "op14-mihawk").find((entry) =>
      isDecken(entry.action),
    )!;

  it("refuses the play into an empty board, and does not cast it as the only play", async () => {
    const game = mihawkTurn({
      hand: [instance("decken", DECKEN), instance("kawamatsu", KAWAMATSU)],
    }).build();

    expect(vetoedBy(game.state, "op14-mihawk-dead-removal", isDecken)).toBe(
      emptyBoard,
    );
    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );
    expect(action).not.toMatchObject({
      type: "play-card",
      cardInstanceId: "decken",
    });
  });

  it("only marks it down into a standing board, so it lands as the turn's last body", () => {
    const game = mihawkTurn({
      hand: [instance("decken", DECKEN), instance("kawamatsu", KAWAMATSU)],
      opponentBoard: [character("theirs", COST_FIVE)],
    }).build();

    expect(
      vetoedBy(game.state, "op14-mihawk-dead-removal", isDecken),
    ).toBeUndefined();
    expect(deckenPlay(game.state).reason).toContain(ordering);
  });

  it("refuses it with a rested target but no {Fish-Man} to pay", () => {
    // The card is a {Fish-Man} itself and leaves the hand as it is played, so
    // it cannot be its own cost.
    const game = mihawkTurn({
      hand: [instance("decken", DECKEN), instance("perona", "OP12-034")],
      opponentBoard: [character("theirs", COST_FIVE, { rested: true })],
    }).build();

    expect(vetoedBy(game.state, "op14-mihawk-unpaid-removal", isDecken)).toBe(
      noPayer,
    );
  });

  it("casts it once a rested body and a {Fish-Man} are both there", () => {
    const game = mihawkTurn({
      hand: [instance("decken", DECKEN), instance("kawamatsu", KAWAMATSU)],
      opponentBoard: [character("theirs", COST_FIVE, { rested: true })],
    }).build();

    expect(
      vetoedBy(game.state, "op14-mihawk-dead-removal", isDecken),
    ).toBeUndefined();
    expect(
      vetoedBy(game.state, "op14-mihawk-unpaid-removal", isDecken),
    ).toBeUndefined();
    expect(deckenPlay(game.state).reason ?? "").not.toContain(ordering);
  });
});

describe("Kin'emon is cast while a DON!! can still pay for its draw", () => {
  const KINEMON = "ST32-001";
  const reason =
    "Cast Kin'emon first, while a DON!! is still active to pay for its draw.";
  const playOf = (state: Parameters<typeof observe>[0], instanceId: string) =>
    contributions(state, "op14-mihawk-kinemon-first").find(
      (entry) =>
        entry.action.type === "play-card" &&
        entry.action.cardInstanceId === instanceId,
    );

  it("puts Kin'emon ahead of the cost-5 body when both still fit", async () => {
    // Ten DON!!: Kin'emon and its rested DON!! take two, and the 5-drop still
    // fits in the eight left. The ladder alone plays the 5-drop first and
    // reaches Kin'emon with the last DON!!, when only the Leader can pay.
    const game = mihawkTurn({
      hand: [instance("kawamatsu", COST_FIVE), instance("kinemon", KINEMON)],
    }).build();

    expect(playOf(game.state, "kinemon")?.reason).toBe(reason);
    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );
    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "kinemon",
    });
  });

  it("holds Kin'emon rather than cast it with the turn's last DON!!", () => {
    // One active DON!!: the cost would be the Leader or nothing, and the
    // Leader still has its attack. In hand the card is the same draw next turn.
    const game = mihawkTurn({
      hand: [instance("kinemon", KINEMON)],
      restedDon: 9,
    }).build();

    expect(
      vetoedBy(
        game.state,
        "op14-mihawk-kinemon-first",
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "kinemon",
      ),
    ).toBe(
      "Do not cast Kin'emon with the turn's last DON!!; its draw needs one more to rest.",
    );
  });

  it("says nothing when Kin'emon first would price the 5-drop out", () => {
    // Five active DON!!: Kin'emon's two would leave three, and the 5-drop is
    // the turn's development. The rule holds its tongue and the ladder decides.
    const game = mihawkTurn({
      hand: [instance("kawamatsu", COST_FIVE), instance("kinemon", KINEMON)],
      restedDon: 5,
    }).build();

    expect(playOf(game.state, "kinemon")).toBeUndefined();
  });
});

describe("the Leader keeps its attack rather than paying a rest cost", () => {
  const KINEMON = "ST32-001";
  const reason =
    "Do not rest the Leader for a cost while it still has its attack; the Leader is the deck's clock.";
  const restsLeader = (action: LegalAction) =>
    action.type === "resolve-effect" &&
    ((action.option.kind === "resource" &&
      action.option.resource === "leader") ||
      (action.option.kind === "card" && action.option.zone === "leader"));
  const restsDon = (action: LegalAction) =>
    action.type === "resolve-effect" &&
    action.option.kind === "resource" &&
    action.option.resource === "don";

  it("refuses Kin'emon's Leader branch while the Leader could still attack", () => {
    // Kin'emon cast with the turn's last DON!! offers the Leader or nothing,
    // and `restCostValue`'s price of 2 still beats declining -- so two cards
    // were bought with the deck's only clock.
    const game = mihawkTurn({
      hand: [instance("kinemon", KINEMON)],
      selfBoard: [character("kawamatsu", COST_FIVE)],
    }).build();
    game.play({ type: "play-card", cardInstanceId: "kinemon" });

    expect(vetoedBy(game.state, "op14-mihawk-leader-swing", restsLeader)).toBe(
      reason,
    );
    expect(
      vetoedBy(game.state, "op14-mihawk-leader-swing", restsDon),
    ).toBeUndefined();
  });

  it("refuses the Leader as the restand's own rest cost too", () => {
    const game = mihawkTurn({
      selfBoard: [character("kawamatsu", COST_FIVE)],
      restedDon: 4,
    }).build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });

    expect(vetoedBy(game.state, "op14-mihawk-leader-swing", restsLeader)).toBe(
      reason,
    );
  });

  it("lets the Leader pay on a turn it could not attack anyway", () => {
    const game = scenario()
      .decks(
        "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op14-mihawk-kinemon-opening")
      .startingPlayer("p1")
      .atTurn(1, { active: "p1" })
      .withLife("p1", copies(4, "OP12-034", "p1-life"))
      .withLife("p2", copies(4, "OP12-034", "p2-life"))
      .withBoard("p1", [])
      .withBoard("p2", [])
      .withHand("p1", [instance("kinemon", KINEMON)])
      .build();
    game.play({ type: "play-card", cardInstanceId: "kinemon" });

    expect(
      vetoedBy(game.state, "op14-mihawk-leader-swing", restsLeader),
    ).toBeUndefined();
  });
});

describe("Coffin Boat lands before the restand", () => {
  it("plays the Stage first, so it is the free rest target and its DON!! joins the refund", async () => {
    // The ladder develops before it activates, and this pins that order for
    // the one play the restand's own clause does not forbid afterwards: a
    // Stage cast after the restand pays its DON!! into a pool that has already
    // been refunded, and the rest cost has to fall on a Character instead.
    const game = mihawkTurn({
      hand: [instance("boat", COFFIN_BOAT)],
      selfBoard: [character("kawamatsu", COST_FIVE)],
      restedDon: 4,
    }).build();

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );
    expect(action).toMatchObject({ type: "play-card", cardInstanceId: "boat" });
  });
});

describe("Electrical Luna does not lock a board twice", () => {
  const LUNA = "OP08-036";
  const isLuna = (action: LegalAction) =>
    action.type === "activate-main" && action.sourceCardNumber === LUNA;

  it("holds the second copy when the rested bodies are already held down", () => {
    // The first cast set both bodies' refresh lock; a second copy in the same
    // turn locks nothing the first did not, and costs three DON!!.
    const game = mihawkTurn({
      hand: [instance("luna", LUNA)],
      opponentBoard: [
        character("sanji", "OP17-082", {
          rested: true,
          cannotRefreshUntilTurn: 12,
        }),
        character("usopp", "OP17-080", {
          rested: true,
          cannotRefreshUntilTurn: 12,
        }),
      ],
    }).build();

    expect(vetoedBy(game.state, "op14-mihawk-luna-hold", isLuna)).toBe(
      "Hold Electrical Luna until it would lock at least two bodies.",
    );
    expect(vetoedBy(game.state, "op14-mihawk", isLuna)).toBe(
      "Hold Electrical Luna until a rested body would be locked by it.",
    );
  });

  it("casts it when two rested bodies are still free to refresh", () => {
    const game = mihawkTurn({
      hand: [instance("luna", LUNA)],
      opponentBoard: [
        character("sanji", "OP17-082", {
          rested: true,
          cannotRefreshUntilTurn: 12,
        }),
        character("usopp", "OP17-080", { rested: true }),
        character("nami", "OP17-084", { rested: true }),
      ],
    }).build();

    expect(
      vetoedBy(game.state, "op14-mihawk-luna-hold", isLuna),
    ).toBeUndefined();
  });
});

describe("which card Law's replay brings back", () => {
  /** OP13-031 Trafalgar Law: bounce one of yours, then play a body rested. */
  const LAW = "OP13-031";
  /** OP12-023 Kawamatsu: a cost-5 6000 vanilla with a 2000 Counter. */
  const VANILLA = "OP12-023";
  /** ST32-002 Kouzuki Oden: the same cost, with an [On Play]. */
  const ON_PLAY = "ST32-002";

  it("replays the body with an [On Play] over the vanilla hand order offers first", async () => {
    // Law's whole job in this list is to re-buy an [On Play]; the replayed
    // body arrives rested, so it neither attacks nor blocks this turn and its
    // power decides nothing until the turn after.
    const game = mihawkTurn({
      hand: [
        instance("law", LAW),
        instance("vanilla", VANILLA),
        instance("onplay", ON_PLAY),
      ],
      selfBoard: [character("spent", COST_FIVE, { rested: true })],
    }).build();
    game.play({ type: "play-card", cardInstanceId: "law" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "spent" });

    const observation = observe(game.state, "p1");
    const context = policyContext(observation);
    const module = policiesForDeck(MIHAWK_LEADER).find(
      (candidate) => candidate.id === "op14-mihawk-replay-pick",
    )!;
    const score = (optionId: string) => {
      const action = observation.legalActions.find(
        (candidate) =>
          candidate.type === "resolve-effect" &&
          candidate.optionId === optionId,
      );
      if (!action) throw new Error(`${optionId} is not on offer`);
      const scored = module.rankAmong!(context, action);
      if (scored === undefined) throw new Error(`${optionId} went unscored`);
      return typeof scored === "number" ? scored : scored.score;
    };

    // Both are scored, not just the winner: `rankAmong` hides only what it
    // scored, so an unscored vanilla would stay in the running for the
    // generic ladder to take first-offered.
    expect(score("onplay")).toBeGreaterThan(score("vanilla"));

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observation,
    );
    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "onplay",
    });
  });

  it("breaks the [On Play] tie toward the body that replaces the card", async () => {
    // Three of this deck's cost-5 bodies print an [On Play], so "has a clause,
    // costs five" is a tie and the pick went back to hand order among exactly
    // the cards the rule exists to choose between. Oden draws; Bonney's lock
    // does not, and it only reaches a body that is already rested.
    /** OP07-026 Jewelry Bonney: the same cost and clause, no card back. */
    const LOCK = "OP07-026";
    const game = mihawkTurn({
      hand: [
        instance("law", LAW),
        instance("lock", LOCK),
        instance("draws", ON_PLAY),
      ],
      selfBoard: [character("spent", COST_FIVE, { rested: true })],
    }).build();
    game.play({ type: "play-card", cardInstanceId: "law" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "spent" });

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "draws",
    });
  });
});

describe("a live [Blocker] stays home when the board opposite refreshes into lethal", () => {
  /** OP13-031 Trafalgar Law, a [Blocker] while its controller has 1 Life or less. */
  const LAW = "OP13-031";
  /** OP12-023 Kawamatsu, a cost-5 6000 with no keyword. */
  const PLAIN = "OP12-023";
  const reason =
    "Keep the [Blocker] home: the board opposite stands back up into more attacks than this Leader has Life, and a Blocker that attacked cannot block.";

  /** One Life, and a board across the table that stands back up into more. */
  function lastLife(life: number) {
    return (
      scenario()
        .decks(
          "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
          "(Green) Roronoa Zoro - Starter Deck 32",
        )
        .seed("op14-mihawk-blocker-home")
        .bareTable()
        .atTurn(8, { active: "p1" })
        .withLife("p1", copies(life, "OP12-034", "p1-life"))
        .withLife("p2", copies(4, "OP12-034", "p2-life"))
        .withBoard("p1", [character("law", LAW), character("plain", PLAIN)])
        // Rested, which is the whole point: they stand up in the Refresh Phase,
        // and the count that only sees active bodies reads none of them.
        .withBoard("p2", [
          character("a", PLAIN, { rested: true }),
          character("b", PLAIN, { rested: true }),
          character("c", PLAIN, { rested: true }),
        ])
        .build()
    );
  }

  const vetoOf = (state: Parameters<typeof observe>[0], attacker: string) => {
    const observation = observe(state, "p1");
    const context = policyContext(observation);
    const module = policiesForDeck(MIHAWK_LEADER).find(
      (candidate) => candidate.id === "op14-mihawk-blocker-home",
    );
    const action = observation.legalActions.find(
      (candidate) =>
        candidate.type === "attack" &&
        candidate.attackerInstanceId === attacker,
    );
    if (!action) throw new Error(`${attacker} has no attack on offer`);
    return module?.veto?.(context, action);
  };

  it("refuses the Blocker's attack and leaves the other body free to swing", async () => {
    const game = lastLife(1);

    expect(vetoOf(game.state, "law")).toBe(reason);
    expect(vetoOf(game.state, "plain")).toBeUndefined();

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );
    expect(action).not.toMatchObject({
      type: "attack",
      attackerInstanceId: "law",
    });
  });

  it("says nothing once the [Blocker] is switched off", () => {
    // Law's [Blocker] is printed behind "1 Life or less", so at 4 Life it is
    // an ordinary body and the rule has no block to protect.
    const game = lastLife(4);

    expect(vetoOf(game.state, "law")).toBeUndefined();
  });
});

describe("which body a removal attack takes, and which attacker pays", () => {
  /** OP12-023 Kawamatsu, the deck's vanilla 6000. */
  const SIX = "OP12-023";
  /** OP17-022 Shanks, the list's 12000. */
  const TWELVE = "OP17-022";
  /** OP15-088 Pirates Docking Six, a 7000 worth removing. */
  const SEVEN = "OP15-088";

  const scored = (state: Parameters<typeof observe>[0]) => {
    const observation = observe(state, "p1");
    const context = policyContext(observation);
    const module = policiesForDeck(MIHAWK_LEADER).find(
      (candidate) => candidate.id === "op14-mihawk-removal-pairing",
    )!;
    return observation.legalActions.flatMap((action) => {
      const value = module.rankAmong?.(context, action);
      if (value === undefined || action.type !== "attack") return [];
      return [
        {
          attacker: action.attackerInstanceId,
          target: action.targetInstanceId,
          score: typeof value === "number" ? value : value.score,
        },
      ];
    });
  };

  it("sends the big body at the big target and leaves the small one its own", () => {
    // Both own bodies beat the 6000; only the 12000 beats the 7000. Scoring
    // the target alone would let the 12000 take either, and offer order would
    // decide -- which is how a Leader carrying three DON!! ends up swinging
    // into the smallest body on the board.
    const game = mihawkTurn({
      selfBoard: [character("big", TWELVE), character("small", SIX)],
      opponentBoard: [
        character("seven", SEVEN, { rested: true }),
        character("six", SIX, { rested: true }),
      ],
    }).build();

    const rows = scored(game.state);
    const best = rows.reduce((top, row) => (row.score > top.score ? row : top));
    expect(best).toMatchObject({ attacker: "big", target: "seven" });

    // And the pairing is the point, not just the target: taking the 6000 is
    // worth more from the small body than from the big one.
    const bigOnSix = rows.find(
      (row) => row.attacker === "big" && row.target === "six",
    )!;
    const smallOnSix = rows.find(
      (row) => row.attacker === "small" && row.target === "six",
    )!;
    expect(smallOnSix.score).toBeGreaterThan(bigOnSix.score);
  });

  it("scores no attack its attacker would lose", () => {
    // The smallest attacker pointed at the largest body scores highest on
    // target power alone, and loses the battle. Only viable attacks are ranked.
    const game = mihawkTurn({
      selfBoard: [character("small", SIX)],
      opponentBoard: [character("seven", SEVEN, { rested: true })],
    }).build();

    expect(scored(game.state).some((row) => row.target === "seven")).toBe(
      false,
    );
  });
});

describe("a protected card with a spare copy in hand", () => {
  /** ST32-002 Kouzuki Oden: a protected cost-5 body with a 1000 Counter. */
  const PROTECTED = "ST32-002";
  /** OP07-022 Otama: a 1-cost searcher, unprotected, with a 2000 Counter. */
  const CHEAP = "OP07-022";

  /** A 1-power shortfall on the Leader, which either card closes alone. */
  function shortfall(hand: ReturnType<typeof instance>[]) {
    return scenario()
      .decks(
        "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
        "(Red/Black) Sabo - OP17 Elbaph List",
      )
      .seed("op14-mihawk-duplicate-counter")
      .bareTable()
      .atTurn(8, { active: "p2" })
      .withLife("p1", copies(2, "OP12-034", "p1-life"))
      .withLife("p2", copies(4, "OP17-086", "p2-life"))
      .withBoard("p1", [])
      .withBoard("p2", [character("attacker", "OP17-093")])
      .withHand("p1", hand)
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 5_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();
  }

  const spend = (
    game: ReturnType<typeof shortfall>,
    duplicateCopiesAreSpendable: boolean,
  ) => {
    const observation = observe(game.state, "p1");
    const action = chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: new Set([PROTECTED]),
      duplicateCopiesAreSpendable,
    }).action;
    if (action.type !== "counter") throw new Error(`passed: ${action.type}`);
    return action.cardInstanceId;
  };

  it("spends the spare copy rather than the cheap body it cannot replace", () => {
    // Two Oden in hand: the deck needs one cost-5 body live, so the second is
    // a Counter card and nothing else, while Otama is a play the turn wants.
    const game = shortfall([
      instance("oden-one", PROTECTED),
      instance("oden-two", PROTECTED),
      instance("otama", CHEAP),
    ]);

    expect(spend(game, true)).toMatch(/^oden-/);
  });

  it("keeps a single copy, because there is no spare", () => {
    const game = shortfall([
      instance("oden-one", PROTECTED),
      instance("otama", CHEAP),
    ]);

    expect(spend(game, true)).toBe("otama");
  });

  it("is off by default, which is the behaviour it changes", () => {
    const game = shortfall([
      instance("oden-one", PROTECTED),
      instance("oden-two", PROTECTED),
      instance("otama", CHEAP),
    ]);

    expect(spend(game, false)).toBe("otama");
  });
});

describe("one Counter card for one Life, against a deck that is racing", () => {
  /**
   * The opponent's turn with a non-lethal hit on the Leader, so the only
   * reason to Counter is the trade itself. `opponent` picks the archetype the
   * rule is gated on.
   */
  function leaderHit(options: {
    opponent: string;
    hand: ReturnType<typeof instance>[];
    attackPower: number;
  }) {
    return scenario()
      .decks(
        "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
        options.opponent,
      )
      .seed("one-card-life-save")
      .bareTable()
      .atTurn(8, { active: "p2" })
      .withLife("p1", copies(5, "OP12-034", "p1-life"))
      .withLife("p2", copies(5, "OP17-086", "p2-life"))
      .withBoard("p1", [])
      .withBoard("p2", [character("attacker", "OP17-093")])
      .withHand("p1", options.hand)
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: options.attackPower,
          counterPower: 0,
        },
        "counter",
      )
      .build();
  }

  const AGGRO = "(Green/Yellow) Yamato - Official Feature Deck";
  const CONTROL = "(Black/Yellow) Marshall.D.Teach - Official Feature Deck";

  it("spends the uncastable card the hit costs one of", async () => {
    // 6000 into the 5000 Leader is a 1001 shortfall, which Kawamatsu's 2000
    // closes on its own; at 5 Life the hit is survivable and nothing else in
    // the agent has a reason to stop it, so the trade is the whole decision.
    // Ten DON!! reach one of the four cards in hand -- Law, the dearest -- so
    // Kawamatsu is surplus and the Counter is the only thing it is for.
    const game = leaderHit({
      opponent: AGGRO,
      hand: [
        instance("law", "OP13-031"),
        instance("kawamatsu", "OP12-023"),
        instance("oden", "ST32-002"),
        instance("yasopp", "OP17-031"),
      ],
      attackPower: 6_000,
    });
    const observation = observe(game.state, "p1");

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observation,
    );
    expect(action.type).toBe("counter");

    const without = await new RegistryRulesAgent(MIHAWK_LEADER, {
      disableModules: ["one-card-life-save"],
    }).chooseAction(observation);
    expect(without.type).not.toBe("counter");
  });

  it("holds the card the next turn is going to cast", async () => {
    // Otama counters for the same 2000, but it costs 1: after Law takes six of
    // the ten DON!!, Otama still fits, so the turn ahead plays it and spending
    // it here buys a Life with a development.
    const game = leaderHit({
      opponent: AGGRO,
      hand: [
        instance("law", "OP13-031"),
        instance("law-two", "OP13-031"),
        instance("otama", "OP07-022"),
      ],
      attackPower: 6_000,
    });

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );
    expect(action.type).not.toBe("counter");
  });

  it("takes the Life against a deck that is not racing", async () => {
    // The same board and the same card. A control seat is not going to run the
    // Leader out of Life, so the card is worth more than the Life it saves.
    const game = leaderHit({
      opponent: CONTROL,
      hand: [
        instance("law", "OP13-031"),
        instance("kawamatsu", "OP12-023"),
        instance("oden", "ST32-002"),
        instance("yasopp", "OP17-031"),
      ],
      attackPower: 6_000,
    });

    const action = await new RegistryRulesAgent(MIHAWK_LEADER).chooseAction(
      observe(game.state, "p1"),
    );
    expect(action.type).not.toBe("counter");
  });
});
