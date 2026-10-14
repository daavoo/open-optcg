import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import {
  policiesForDeck,
  policyContext,
  St31RulesAgent,
} from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * The `aggro` and `red-aggro` rules, posed as boards.
 *
 * Two kinds of assertion here, and the second kind is the point. Asserting the
 * chosen action alone is what let ST33's policy pass seventeen tests through a
 * 22.8pt collapse: the fault was in which *branch* classified an option, and
 * every test only watched the outcome. So each rule below is also checked at its
 * own contribution -- did this module, on this candidate, say this thing -- which
 * fails when a rule stops firing rather than when the game happens to change
 * answer for an unrelated reason.
 */

/**
 * What the named rules say about each candidate, with the reason.
 *
 * Named *rules*, not layers: a profile compiles to one module per rule, so a test
 * that asks one rule what it thinks cannot be perturbed by a sibling rule in the
 * same archetype. That is what makes these branch checks rather than outcome
 * checks.
 */
function contributions(
  state: Parameters<typeof observe>[0],
  moduleIds: string | readonly string[],
  viewer: "p1" | "p2" = "p1",
): { action: LegalAction; score: number; reason: string | undefined }[] {
  const wanted = typeof moduleIds === "string" ? [moduleIds] : moduleIds;
  const observation = observe(state, viewer);
  const context = policyContext(observation);
  const leader = observation.self.leader.cardNumber;
  const registered = policiesForDeck(leader);
  const modules = wanted.map((id) => {
    const module = registered.find((candidate) => candidate.id === id);
    if (!module) throw new Error(`no module ${id} for ${leader}`);
    return module;
  });
  return observation.legalActions.flatMap((action) =>
    modules.flatMap((module) => {
      const ranked = module.rank?.(context, action);
      const vetoed = module.veto?.(context, action);
      if (ranked === undefined && vetoed === undefined) return [];
      const score = typeof ranked === "number" ? ranked : (ranked?.score ?? 0);
      const reason =
        typeof ranked === "object" ? ranked.reason : (vetoed ?? undefined);
      return [{ action, score, reason }];
    }),
  );
}

/** Both press rules; the `aggro` one and the wider `red-aggro` override. */
const PRESS_RULES = [
  "strategy:aggro#press-leader",
  "strategy:red-aggro#press-unless-lost",
] as const;

/**
 * ST31 (red aggro) in a posed mid-game main phase, against a control deck.
 *
 * `bareTable()` empties both decks, so Life has to be given as explicit cards --
 * a count would be dealt off a deck with nothing in it and silently produce 0
 * Life, which is inside the kill range and would make half these tests assert
 * the wrong branch. It also leaves all ten DON!! active on both sides, which is
 * why no test here sets a DON!! count: turn 6 with a full pool is the position
 * these rules are written about.
 *
 * The opponent is ST33 so no ST31 matchup module intercepts. A Character's card
 * number on either board is independent of the deck lists, because the engine
 * resolves card text globally.
 */
function st31Turn(options: {
  selfLife?: number;
  opponentLife?: number;
  opponentBoard?: ReturnType<typeof character>[];
  selfBoard?: ReturnType<typeof character>[];
}) {
  const life = (player: "p1" | "p2", count: number) =>
    copies(count, "OP11-003", `${player}-life`);
  return scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Blue) Kuzan - Starter Deck 33",
    )
    .seed("archetype-rules")
    .bareTable()
    .atTurn(6, { active: "p1" })
    .withLife("p1", life("p1", options.selfLife ?? 4))
    .withLife("p2", life("p2", options.opponentLife ?? 4))
    .withBoard("p1", options.selfBoard ?? [])
    .withBoard("p2", options.opponentBoard ?? []);
}

/** A plain [Blocker]; ST31 has none of its own, and text resolves globally. */
const BLOCKER = "OP17-012";

describe("aggro archetype rules", () => {
  it("presses the Leader over a marginal board attack while ahead on the clock", () => {
    // OP11-003 Usopp is a 2-cost body; nothing here is a Blocker and nothing is
    // rested, so `threat-removal` has no jurisdiction and the archetype rule is
    // the only opinion on the table.
    const game = st31Turn({
      selfBoard: [character("zoro", "OP14-015")],
      opponentBoard: [character("chip", "OP11-003")],
    }).build();

    const opinions = contributions(
      game.state,
      "strategy:aggro#press-leader",
    ).filter((entry) => entry.action.type === "attack");
    const leaderHits = opinions.filter(
      (entry) =>
        entry.action.type === "attack" &&
        entry.action.targetInstanceId === "p2-leader",
    );
    const boardHits = opinions.filter(
      (entry) =>
        entry.action.type === "attack" &&
        entry.action.targetInstanceId === "chip",
    );
    expect(leaderHits.length).toBeGreaterThan(0);
    for (const hit of leaderHits) {
      expect(hit.score).toBeGreaterThan(0);
      expect(hit.reason).toContain("Life is the win condition");
    }
    // The marginal body gets no support, so ranking hides it.
    for (const hit of boardHits) expect(hit.score).toBe(0);
  });

  it("stays out of the way where the measured threat-removal rule has jurisdiction", () => {
    // A *rested* cost-4-or-more Character is exactly `threat-removal`'s target,
    // and that rule is measured while the archetype claim is not. The archetype
    // layer must therefore have no opinion about attacks at all here -- this is
    // the branch check, not an outcome check.
    const game = st31Turn({
      selfBoard: [character("zoro", "OP14-015")],
      opponentBoard: [character("engine", "OP12-023", { rested: true })],
    }).build();

    const attacks = contributions(game.state, PRESS_RULES).filter(
      (entry) => entry.action.type === "attack" && entry.score > 0,
    );
    expect(attacks).toEqual([]);
  });

  it("refuses to end the turn while a winning attack is unused", () => {
    // The additive rule. `mustAct` removes `pass`, which nothing else in the
    // package could do, so the reason string is the assertion.
    const game = st31Turn({
      selfBoard: [character("zoro", "OP14-015")],
    }).build();

    const passOpinion = contributions(
      game.state,
      "strategy:aggro#keep-attacking",
    ).find((entry) => entry.action.type === "pass");
    expect(passOpinion?.reason).toContain("turn given back");
  });

  it("lets the turn end once no winning attack is left", () => {
    // Same rule, opposite branch: every attacker rested, so `pass` is untouched
    // and the veto degrades to nothing.
    const game = st31Turn({
      selfBoard: [character("zoro", "OP14-015", { rested: true })],
    })
      .withState((state) => {
        state.players.p1.leaderRested = true;
      })
      .build();

    const passOpinion = contributions(
      game.state,
      "strategy:aggro#keep-attacking",
    ).find((entry) => entry.action.type === "pass");
    expect(passOpinion).toBeUndefined();
  });
});

describe("red-aggro archetype rules", () => {
  it("stops developing non-Rush bodies inside the kill range", () => {
    // The opponent is one hit from dead and ST31 has a viable Leader attack, so
    // a body played now has summoning sickness and never attacks. Every non-Rush
    // play is vetoed; the decision that survives has to be one that deals damage.
    const game = st31Turn({ opponentLife: 0, selfBoard: [] })
      .withHand("p1", [
        instance("usopp", "OP11-003"),
        instance("franky", "OP11-012"),
      ])
      .build();

    const plays = contributions(
      game.state,
      "strategy:red-aggro#no-late-development",
    ).filter((entry) => entry.action.type === "play-card");
    expect(plays.length).toBeGreaterThan(0);
    for (const play of plays) {
      expect(play.reason).toContain("never attacks");
    }
  });

  it("keeps developing outside the kill range", () => {
    // Same hand, an opponent with Life to spare: the veto must not fire, or the
    // deck simply stops playing cards from turn four onward.
    const game = st31Turn({ opponentLife: 4 })
      .withHand("p1", [
        instance("usopp", "OP11-003"),
        instance("franky", "OP11-012"),
      ])
      .build();

    const plays = contributions(
      game.state,
      "strategy:red-aggro#no-late-development",
    ).filter(
      (entry) =>
        entry.action.type === "play-card" &&
        entry.reason?.includes("never attacks") === true,
    );
    expect(plays).toEqual([]);
  });

  it("prefers a [Rush] body over an equal-cost body without it", () => {
    // OP14-015 Zoro has [Rush]; ST31-003 Brook does not. Both are affordable.
    const game = st31Turn({})
      .withHand("p1", [
        instance("brook", "ST31-003"),
        instance("zoro", "OP14-015"),
      ])
      .build();

    const plays = contributions(
      game.state,
      "strategy:red-aggro#prefer-rush",
    ).filter((entry) => entry.action.type === "play-card");
    const rush = plays.find(
      (entry) =>
        entry.action.type === "play-card" &&
        entry.action.cardInstanceId === "zoro",
    );
    expect(rush?.score).toBeGreaterThan(0);
    expect(rush?.reason).toContain("[Rush]");
  });
});

describe("role reversal", () => {
  it("blocks a survivable hit once the race is lost", async () => {
    // `chooseGenericBlock` preserves Blockers against any hit the Leader can
    // absorb, which is right for a deck with time and fatal for one without it.
    // Two 9000-power attackers against 1 Life is two clocks behind, so the
    // `mustStabilise` rule removes `pass` and the block happens.
    const game = st31Turn({
      selfLife: 1,
      selfBoard: [character("blocker", BLOCKER)],
      opponentBoard: [
        character("big-a", "OP12-023"),
        character("big-b", "OP12-023"),
      ],
    })
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "big-a",
        targetInstanceId: "p1-leader",
        attackPower: 6_000,
        counterPower: 0,
      })
      .build();

    const observation = observe(game.state, "p1");
    // Only meaningful if a block was actually on offer and declining also was.
    expect(
      observation.legalActions.some((action) => action.type === "block"),
    ).toBe(true);
    expect(
      observation.legalActions.some((action) => action.type === "pass"),
    ).toBe(true);

    const passOpinion = contributions(
      game.state,
      "strategy:aggro#stabilise",
    ).find((entry) => entry.action.type === "pass");
    expect(passOpinion?.reason).toContain("The race is lost");

    const action = await new St31RulesAgent().chooseAction(observation);
    expect(action.type).toBe("block");
  });

  it("preserves the Blocker while the race is still winnable", async () => {
    // The same hit, with Life to absorb it and no runaway opposing board. The
    // gear change must not fire, or the archetype loses its Blocker every turn.
    const game = st31Turn({
      selfLife: 4,
      selfBoard: [character("blocker", BLOCKER)],
      opponentBoard: [character("big-a", "OP12-023")],
    })
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "big-a",
        targetInstanceId: "p1-leader",
        attackPower: 6_000,
        counterPower: 0,
      })
      .build();

    const passOpinion = contributions(
      game.state,
      "strategy:aggro#stabilise",
    ).find((entry) => entry.action.type === "pass");
    // The rule not firing at all is the assertion: `mustAct` is the only thing
    // in the package that can veto `pass`, so no opinion means `pass` survives.
    expect(passOpinion).toBeUndefined();

    const action = await new St31RulesAgent().chooseAction(
      observe(game.state, "p1"),
    );
    expect(action.type).toBe("pass");
  });
});

/**
 * ST33 to ST36 in a posed mid-game main phase.
 *
 * The same shape as {@link st31Turn} and for the same reasons -- `bareTable()`
 * for explicit Life, turn 6 with a full DON!! pool -- generalised over the seat,
 * because the four decks added in this pass are two archetypes rather than one.
 * The opposing deck matters in exactly one place: `midrange`'s two shape rules
 * are gated on `opponentArchetype`, so a test for either has to name an opponent
 * that reads as the right pattern.
 */
function posedTurn(
  self:
    | "(Blue) Kuzan - Starter Deck 33"
    | "(Purple) Charlotte Katakuri - Starter Deck 34"
    | "(Red/Black) Sabo - Starter Deck 35"
    | "(Yellow) Eustass Kid - Starter Deck 36",
  opponent:
    "(Red) Monkey.D.Luffy - Starter Deck 31" | "(Blue) Kuzan - Starter Deck 33",
  options: {
    selfLife?: number;
    opponentLife?: number;
    selfBoard?: ReturnType<typeof character>[];
    opponentBoard?: ReturnType<typeof character>[];
    hand?: ReturnType<typeof instance>[];
    activeDon?: number;
  } = {},
) {
  const life = (player: "p1" | "p2", count: number) =>
    copies(count, "OP11-003", `${player}-life`);
  let posed = scenario()
    .decks(self, opponent)
    .seed(`archetype-rules-${self}`)
    .bareTable()
    .atTurn(6, { active: "p1" })
    .withLife("p1", life("p1", options.selfLife ?? 4))
    .withLife("p2", life("p2", options.opponentLife ?? 4))
    .withBoard("p1", options.selfBoard ?? [])
    .withBoard("p2", options.opponentBoard ?? [])
    .withHand("p1", options.hand ?? []);
  if (options.activeDon !== undefined) {
    // `bareTable()` leaves all ten DON!! active, so a scenario that needs a
    // smaller pool rests the difference rather than deleting it -- the DON!!
    // total is an invariant `build()` checks.
    posed = posed.withDon("p1", { rested: 10 - options.activeDon });
  }
  return posed;
}

/** Score for one play candidate under one rule, or `undefined` if it abstained. */
function playScore(
  state: Parameters<typeof observe>[0],
  moduleId: string,
  cardInstanceId: string,
): { score: number; reason: string | undefined } | undefined {
  return contributions(state, moduleId).find(
    (entry) =>
      entry.action.type === "play-card" &&
      entry.action.cardInstanceId === cardInstanceId,
  );
}

describe("midrange archetype rules", () => {
  it("plays the biggest body the curve allows against a deck that is not control", () => {
    // ST31 reads as aggro, which is the branch that wants a bigger, harder-to-
    // remove body rather than two small ones.
    const game = posedTurn(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        hand: [instance("small", "ST36-004"), instance("big", "OP10-101")],
      },
    ).build();

    const big = playScore(game.state, "strategy:midrange#play-on-curve", "big");
    const small = playScore(
      game.state,
      "strategy:midrange#play-on-curve",
      "small",
    );
    expect(big?.reason).toContain("Play on curve");
    expect(big?.score ?? 0).toBeGreaterThan(small?.score ?? 0);
  });

  it("says nothing against a control deck, where going wide was measured worse", () => {
    // The curve rule has to be *silent* in the control matchup rather than
    // press the opposite claim: a `go-wide` rule there is a loss, because a
    // `rank` preferring the cheap play hides the expensive one and so means
    // "never go tall" rather than "go wide".
    const game = posedTurn(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Blue) Kuzan - Starter Deck 33",
      {
        hand: [instance("small", "ST36-004"), instance("big", "OP10-101")],
      },
    ).build();

    expect(
      contributions(game.state, "strategy:midrange#play-on-curve"),
    ).toEqual([]);
  });

  it("refuses to spend DON!! on power while the board is still being built", () => {
    const game = posedTurn(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        hand: [instance("body", "OP10-101")],
      },
    ).build();

    const attachments = contributions(
      game.state,
      "strategy:midrange#develop-before-power",
    ).filter((entry) => entry.action.type === "attach-don");
    expect(attachments.length).toBeGreaterThan(0);
    for (const attachment of attachments) {
      expect(attachment.reason).toContain("another body beats +1000 power");
    }
  });

  it("exempts a unit still waiting on its own [DON!! xN] condition", () => {
    // ST35's Leader gates a team-wide +1000 aura on one attached DON!!, so that
    // attachment is buying an ability rather than power. A rule that priced it as
    // power would starve the Leader permanently -- the failure
    // `needsDonForAbility` exists for.
    const game = posedTurn(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        hand: [instance("body", "ST35-002")],
      },
    ).build();

    const leaderAttachment = contributions(
      game.state,
      "strategy:midrange#develop-before-power",
    ).find(
      (entry) =>
        entry.action.type === "attach-don" &&
        entry.action.targetInstanceId === "p1-leader",
    );
    expect(leaderAttachment).toBeUndefined();
  });

  it("converts the board into Life once it is built and the clock is won", () => {
    const game = posedTurn(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfBoard: [
          character("a", "OP10-101"),
          character("b", "OP12-113"),
          character("c", "P-088"),
          character("d", "P-085"),
        ],
        opponentBoard: [character("chip", "OP11-003")],
      },
    ).build();

    const attacks = contributions(
      game.state,
      "strategy:midrange#convert-the-board",
    ).filter((entry) => entry.action.type === "attack" && entry.score > 0);
    expect(attacks.length).toBeGreaterThan(0);
    for (const attack of attacks) {
      expect(attack.action).toMatchObject({ targetInstanceId: "p2-leader" });
      expect(attack.reason).toContain("convert it into Life");
    }
  });

  it("has no opinion about attacks before the board is built", () => {
    // The gate that separates this rule from `aggro`'s `press-leader`: the
    // archetype presses only once its own plan has been carried out.
    const game = posedTurn(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfBoard: [character("a", "OP10-101")],
        opponentBoard: [character("chip", "OP11-003")],
      },
    ).build();

    expect(
      contributions(game.state, "strategy:midrange#convert-the-board").filter(
        (entry) => entry.score > 0,
      ),
    ).toEqual([]);
  });
});

describe("control archetype rules", () => {
  it("no longer narrows development to [Blocker]s while losing the race", () => {
    // `prefer-blocker` used to fire here and score the Blocker alone. It was
    // removed on measurement -- pooled 46.6% across four control decks, z =
    // -3.16 -- because `applyRanking` keeps the per-action-type maximum, so a
    // rule that abstains on every non-Blocker play hides them: "prefer a
    // Blocker" became "develop nothing else". This asserts the absence, because
    // the failure it guards against is a plausible rule being reinstated, not a
    // regression in the code that replaced it.
    const game = posedTurn(
      "(Blue) Kuzan - Starter Deck 33",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        opponentBoard: [
          character("big-a", "OP12-045"),
          character("big-b", "OP12-045"),
        ],
        hand: [instance("blocker", "OP12-050"), instance("body", "OP12-045")],
      },
    ).build();

    const modules = policiesForDeck(
      observe(game.state, "p1").self.leader.cardNumber,
    );
    expect(modules.map((module) => module.id)).not.toContain(
      "strategy:control#prefer-blocker",
    );
    // And nothing that replaced it scores the Blocker over the plain body: the
    // two plays are indistinguishable to the archetype layer now.
    //
    // Scoped to `strategy:` modules, which is the layer this test is about. The
    // deck's own rules may well rank these two cards -- ST-33's ladder always
    // did, from a twelve-entry card-number order, and #170 moved that ordering
    // into `st33#develop-by-value` where a module-level assertion can see it.
    // Summing every layer here would make this test fail on any deck-level
    // preference, which is not the claim.
    const scoreOf = (instanceId: string) =>
      modules
        .filter((module) => module.id.startsWith("strategy:"))
        .flatMap((module) =>
          contributions(game.state, module.id).filter(
            (entry) =>
              entry.action.type === "play-card" &&
              entry.action.cardInstanceId === instanceId,
          ),
        )
        .reduce((total, entry) => total + entry.score, 0);
    expect(scoreOf("blocker")).toBe(scoreOf("body"));
  });

  it("blocks a survivable hit at its Life floor rather than absorbing it", () => {
    // `chooseGenericBlock` answers any survivable hit with `pass`, which is
    // right for a deck spending Life on purpose and wrong for the one archetype
    // that is not. Three Life is this profile's floor.
    const game = posedTurn(
      "(Blue) Kuzan - Starter Deck 33",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfLife: 3,
        selfBoard: [character("blocker", "OP12-050")],
        opponentBoard: [character("big-a", "OP12-045")],
      },
    )
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "big-a",
        targetInstanceId: "p1-leader",
        attackPower: 6_000,
        counterPower: 0,
      })
      .build();

    const passOpinion = contributions(
      game.state,
      "strategy:control#preserve-life",
    ).find((entry) => entry.action.type === "pass");
    expect(passOpinion?.reason).toContain("Life is not a resource");
  });

  it("leaves the Blocker alone once the hit has already been stopped", () => {
    // The other gate, and the one a reported Xebec game walked into. The
    // `[On Your Opponent's Attack]` ladder resolves before the Block step, so
    // the defender may already have paid a card out of hand to put this hit out
    // of reach -- OP17-040 Edward.Newgate's +3000 on the Leader is the clause
    // that did it there. Forcing a block on top of that spends a Blocker to
    // save Life that was no longer on offer, and throws away the card that
    // bought the save as well: two cards for nothing, at the Life total where
    // the profile can least afford either.
    const game = posedTurn(
      "(Blue) Kuzan - Starter Deck 33",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfLife: 3,
        selfBoard: [character("blocker", "OP12-050")],
        opponentBoard: [character("big-a", "OP12-045")],
      },
    )
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "big-a",
        targetInstanceId: "p1-leader",
        attackPower: 6_000,
        // A 5000 Leader plus 2000 already on the battle: 7000 against 6000.
        counterPower: 2_000,
      })
      .build();

    expect(
      contributions(game.state, "strategy:control#preserve-life").find(
        (entry) => entry.action.type === "pass",
      ),
    ).toBeUndefined();
  });

  it("leaves a Character-targeted attack alone at the Life floor", () => {
    // The gate this pins. `mustAct(...).insteadOfPass` removes `pass` from a
    // decision point, and the Block step offers `pass` for an attack on a
    // *Character* too -- where there is no Life to absorb and blocking only
    // redirects the hit onto a second body. Traced on ST34: one attack on a
    // Character cost it two more Characters, blocked at 1000 and 4000 into a
    // 7000 and 8000 hit, and the original target died anyway.
    const game = posedTurn(
      "(Blue) Kuzan - Starter Deck 33",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfLife: 3,
        selfBoard: [
          character("blocker", "OP12-050"),
          character("victim", "OP12-045"),
        ],
        opponentBoard: [character("big-a", "OP12-045")],
      },
    )
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "big-a",
        targetInstanceId: "victim",
        attackPower: 9_000,
        counterPower: 0,
      })
      .build();

    expect(
      contributions(game.state, "strategy:control#preserve-life").find(
        (entry) => entry.action.type === "pass",
      ),
    ).toBeUndefined();
  });

  it("leaves the Blocker alone above the Life floor", () => {
    const game = posedTurn(
      "(Blue) Kuzan - Starter Deck 33",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfLife: 4,
        selfBoard: [character("blocker", "OP12-050")],
        opponentBoard: [character("big-a", "OP12-045")],
      },
    )
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "big-a",
        targetInstanceId: "p1-leader",
        attackPower: 6_000,
        counterPower: 0,
      })
      .build();

    expect(
      contributions(game.state, "strategy:control#preserve-life").find(
        (entry) => entry.action.type === "pass",
      ),
    ).toBeUndefined();
  });
});

describe("deck profiles for ST33 to ST36", () => {
  it("ST33 stops an attacker rather than trading with it", () => {
    // One 8000-power body opposite a 5000 Leader is two hits a turn, which is
    // the gate: the answers this rule prefers take a body off the clock without
    // taking it off the field, and that is worth nothing against a field that
    // was not attacking anyway.
    const game = posedTurn(
      "(Blue) Kuzan - Starter Deck 33",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        opponentBoard: [character("attacker", "OP12-045")],
        hand: [instance("freeze", "OP12-043"), instance("body", "OP12-045")],
      },
    ).build();

    const freeze = playScore(
      game.state,
      "strategy:control-kuzan-st33#stop-the-attacker",
      "freeze",
    );
    expect(freeze?.reason).toContain("without taking it off the field");
    expect(
      playScore(
        game.state,
        "strategy:control-kuzan-st33#stop-the-attacker",
        "body",
      ),
    ).toBeUndefined();
  });

  it("ST34 buys the DON!! refund before the bigger body", () => {
    // ST34-002 Cracker adds a DON!! back from the DON!! deck; OP11-068 Daifuku
    // is a 7000-power vanilla at cost 6. The Leader pays a DON!! to defend every
    // turn, so the refund is worth more than the body while turns remain.
    const game = posedTurn(
      "(Purple) Charlotte Katakuri - Starter Deck 34",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        hand: [instance("ramp", "ST34-002"), instance("body", "OP11-068")],
      },
    ).build();

    expect(
      playScore(game.state, "strategy:control-katakuri-st34#ramp-first", "ramp")
        ?.reason,
    ).toContain("pays for every turn after it");
    expect(
      playScore(
        game.state,
        "strategy:control-katakuri-st34#ramp-first",
        "body",
      ),
    ).toBeUndefined();
  });

  it("ST35 reaches cost 8 through printed text, not printed cost", () => {
    // ST35-005 Kuma is printed at cost 5 and reads "This Character gains +3
    // cost", so it is the aura's enabler; ST35-002 Lindbergh at cost 4 is not.
    // The observation reports *printed* cost, which is why the rule parses the
    // text rather than reading the number.
    const game = posedTurn(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        hand: [instance("kuma", "ST35-005"), instance("lindbergh", "ST35-002")],
      },
    ).build();

    expect(
      playScore(
        game.state,
        "strategy:midrange-sabo-st35#enable-the-aura",
        "kuma",
      )?.reason,
    ).toContain("Land a cost-8 body");
    expect(
      playScore(
        game.state,
        "strategy:midrange-sabo-st35#enable-the-aura",
        "lindbergh",
      ),
    ).toBeUndefined();
  });

  it("ST35 puts the aura's DON!! on the Leader once the condition is met", () => {
    const game = posedTurn(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfBoard: [character("kuma", "ST35-005")],
      },
    ).build();

    const leaderAttachment = contributions(
      game.state,
      "strategy:midrange-sabo-st35#switch-on-the-aura",
    ).find(
      (entry) =>
        entry.action.type === "attach-don" &&
        entry.action.targetInstanceId === "p1-leader",
    );
    expect(leaderAttachment?.reason).toContain("for the whole board");
    // And it must be silent with no cost-8 body out, or it competes with the
    // format's Counter-threshold rule for nothing.
    const withoutEnabler = posedTurn(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {},
    ).build();
    expect(
      contributions(
        withoutEnabler.state,
        "strategy:midrange-sabo-st35#switch-on-the-aura",
      ),
    ).toEqual([]);
  });

  it("ST35 declines to pay for Life its own Leader is charging it for", () => {
    // At 4 or more Life this Leader gives itself -1000 power, so the hit that
    // takes Life to 3 hands the deck a card *and* 1000 power. Spending a Counter
    // card to prevent it pays twice for the wrong thing.
    // The opponent is at 1 Life so this seat is not `mustStabilise` -- the rule
    // turns itself off there, and with it the whole point of the test.
    const game = posedTurn(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfLife: 4,
        opponentLife: 1,
        opponentBoard: [character("attacker", "OP12-045")],
        hand: [instance("counter", "ST35-002"), instance("spare", "OP13-005")],
      },
    )
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 8_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    const counters = contributions(
      game.state,
      "strategy:midrange-sabo-st35#spend-life-to-four",
    ).filter((entry) => entry.action.type === "counter");
    expect(counters.length).toBeGreaterThan(0);
    for (const counter of counters) {
      expect(counter.reason).toContain("paying 1000 power for the buffer");
    }
  });

  it("ST35 pays again once Life is below the penalty", () => {
    const game = posedTurn(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfLife: 3,
        opponentLife: 1,
        opponentBoard: [character("attacker", "OP12-045")],
        hand: [instance("counter", "ST35-002")],
      },
    )
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 8_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect(
      contributions(
        game.state,
        "strategy:midrange-sabo-st35#spend-life-to-four",
      ).filter((entry) => entry.action.type === "counter"),
    ).toEqual([]);
  });

  it("ST36 keeps a body inside the Leader's restand band", () => {
    // The Leader can only set a {Supernovas} Character of cost 3 to 8 active, so
    // a board of cost-1 bodies switches the deck's only repeatable Blocker off.
    const game = posedTurn(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfBoard: [character("tiny", "ST36-004")],
        hand: [
          instance("in-band", "ST36-002"),
          instance("out-of-band", "ST36-004"),
        ],
      },
    ).build();

    expect(
      playScore(
        game.state,
        "strategy:midrange-kid-st36#keep-a-restand-target",
        "in-band",
      )?.reason,
    ).toContain("end-of-turn restand");
    expect(
      playScore(
        game.state,
        "strategy:midrange-kid-st36#keep-a-restand-target",
        "out-of-band",
      ),
    ).toBeUndefined();
  });

  it("ST36 stops wanting one once the band is occupied", () => {
    const game = posedTurn(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfBoard: [character("in-band", "ST36-002")],
        hand: [instance("another", "P-088")],
      },
    ).build();

    expect(
      contributions(
        game.state,
        "strategy:midrange-kid-st36#keep-a-restand-target",
      ),
    ).toEqual([]);
  });

  it("ST36 absorbs a hit while ahead on Life, because its own cards read parity", () => {
    const game = posedTurn(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfLife: 4,
        opponentLife: 2,
        opponentBoard: [character("attacker", "OP12-045")],
        hand: [instance("counter", "ST36-001"), instance("spare", "P-088")],
      },
    )
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 8_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    const counters = contributions(
      game.state,
      "strategy:midrange-kid-st36#life-parity",
    ).filter((entry) => entry.action.type === "counter");
    expect(counters.length).toBeGreaterThan(0);
    for (const counter of counters) {
      expect(counter.reason).toContain("Life parity");
    }
  });

  it("ST36 defends once Life is level", () => {
    const game = posedTurn(
      "(Yellow) Eustass Kid - Starter Deck 36",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      {
        selfLife: 3,
        opponentLife: 3,
        opponentBoard: [character("attacker", "OP12-045")],
        hand: [instance("counter", "ST36-001")],
      },
    )
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 8_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect(
      contributions(
        game.state,
        "strategy:midrange-kid-st36#life-parity",
      ).filter((entry) => entry.action.type === "counter"),
    ).toEqual([]);
  });
});
