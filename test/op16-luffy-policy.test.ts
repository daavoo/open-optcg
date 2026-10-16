import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import {
  policiesForDeck,
  policyContext,
  RegistryRulesAgent,
} from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * OP16-LUFFY-GREENBLUE's rules, posed as boards.
 *
 * Every judgement below is one the deck's earlier policy got wrong in a way
 * that cost real win rate rather than merely reading oddly.
 *
 * Each rule is checked at its own **contribution** -- did this module, on this
 * candidate, say this thing -- and not only at the action finally chosen. That is
 * the discrimination ST33's seventeen tests lacked while its policy lost 22.8pt:
 * the fault was in which branch classified an option, and an outcome assertion
 * cannot see a branch stop firing.
 */

/** What the named modules say about each candidate, with the reason. */
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

/** What the whole registered stack does with the position. */
async function chosen(
  state: Parameters<typeof observe>[0],
  viewer: "p1" | "p2" = "p1",
): Promise<LegalAction> {
  const observation = observe(state, viewer);
  const agent = new RegistryRulesAgent(observation.self.leader.cardNumber);
  const action = await agent.chooseAction(observation);
  const found = observation.legalActions.find(
    (candidate) => candidate.actionId === action.actionId,
  );
  if (!found) throw new Error(`agent chose an action not on offer`);
  return found;
}

/**
 * OP16-LUFFY-GREENBLUE in a posed main phase against OP14-MIHAWK-SLASH.
 *
 * The opponent is a deck this one has no matchup module against -- none exist --
 * chosen because its Leader ability changes none of the arithmetic these rules
 * read. A Character's card number on either board is independent of the deck
 * lists, because the engine resolves card text globally.
 *
 * `bareTable()` empties both decks, so Life is given as explicit cards: a count
 * would be dealt off an empty deck and silently produce 0 Life, which is inside
 * the kill range and would send half of these through a different branch.
 */
function luffyTurn(options: {
  hand?: ReturnType<typeof instance>[];
  selfBoard?: ReturnType<typeof character>[];
  opponentBoard?: ReturnType<typeof character>[];
  don?: { active?: number; rested?: number };
}) {
  const life = (player: "p1" | "p2") => copies(4, "OP16-042", `${player}-life`);
  const scene = scenario()
    .decks(
      "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
      "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
    )
    .seed("op16-luffy-policy")
    .bareTable()
    .atTurn(6, { active: "p1" })
    .withLife("p1", life("p1"))
    .withLife("p2", life("p2"))
    .withBoard("p1", options.selfBoard ?? [])
    .withBoard("p2", options.opponentBoard ?? [])
    .withHand("p1", options.hand ?? []);
  // `bareTable()` leaves all ten DON!! active. The Leader's refund reads the
  // rested pool, so a test about it has to carve one out of that ten.
  const rested = options.don?.rested ?? 0;
  return rested > 0 ? scene.withDon("p1", { rested }) : scene;
}

/** Mr.1: a 2-cost {Impel Down} body, the deck's standard early play. */
const MR_1 = "OP16-054";
/** Prisoner of Impel Down: eight copies, a 2000 Counter, free off Buggy. */
const PRISONER = "OP16-042";
/** Gravity Blade Raging Tiger: bottoms two Characters of *either* board. */
const GRAVITY_BLADE = "OP06-058";

describe("own-board removal, format-wide", () => {
  it("refuses to bottom its own Character and leaves the opponent's standing", async () => {
    // The trace this came from: seven DON!! on Gravity Blade, and the policy
    // bottomed its own Mr.1 and Buggy because they were offered first. The
    // effect's text names no side, so the engine offers both boards.
    const game = luffyTurn({
      hand: [instance("gravity", GRAVITY_BLADE)],
      selfBoard: [character("mine", MR_1)],
      opponentBoard: [character("theirs", "OP12-034")],
    }).build();
    game.play({ type: "activate-main", sourceCardNumber: GRAVITY_BLADE });

    const opinions = contributions(game.state, "own-board-removal").filter(
      (entry) => entry.action.type === "resolve-effect",
    );
    const own = opinions.filter(
      (entry) =>
        entry.action.type === "resolve-effect" &&
        entry.action.option.kind === "card" &&
        entry.action.option.owner === "self",
    );
    const theirs = opinions.filter(
      (entry) =>
        entry.action.type === "resolve-effect" &&
        entry.action.option.kind === "card" &&
        entry.action.option.owner === "opponent",
    );

    expect(own).not.toHaveLength(0);
    for (const entry of own)
      expect(entry.reason).toContain("your own Character");
    // The branch check that matters: the rule has to be silent about the
    // opponent's board, or ranking would hide the target the effect is for.
    expect(theirs).toHaveLength(0);

    const action = await chosen(game.state);
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option.kind === "card" && action.option.owner).toBe(
      "opponent",
    );
  });
});

describe("OP16 Green/Blue Luffy deck rules", () => {
  it("attacks a Character when the format rules have hidden every Leader hit", async () => {
    // The deck's whole problem, and an interaction rather than a plain bug. Both
    // of the policy's attack branches name the opposing Leader, and
    // `threat-removal` -- a format-wide `rank` module -- prefers an attack on a
    // rested opposing engine, which hides the Leader-target attacks because
    // `applyRanking` keeps only the best candidate in each action type. Before
    // the fallback the policy found nothing and ended the turn: measured at
    // 16.2% shipped against 21.2% with the fundamental switched off.
    //
    // OP16-056 is a cost-4, 5000-power body: rested and cost >= 4 is
    // `threat-removal`'s target filter, and 5000 keeps Buggy's 6000 attack
    // viable, which the rule also requires. A Character's card number on the
    // opposing board is independent of that deck's list.
    const game = luffyTurn({
      selfBoard: [character("buggy", "OP16-048")],
      opponentBoard: [character("engine", "OP16-056", { rested: true })],
    }).build();

    const hidden = contributions(game.state, "threat-removal").filter(
      (entry) =>
        entry.action.type === "attack" &&
        entry.action.targetInstanceId === "engine",
    );
    expect(hidden).not.toHaveLength(0);
    for (const entry of hidden) expect(entry.score).toBeGreaterThan(0);

    // So the turn has to end in an attack on that Character, not in `pass`.
    const action = await chosen(game.state);
    expect(action.type).toBe("attack");
    if (action.type !== "attack") throw new Error("unreachable");
    expect(action.targetInstanceId).toBe("engine");
  });

  it("declines Crocodile's return cost when the only body on the board is dear", async () => {
    // The trace: Crocodile returned Buggy -- the one Character that could still
    // attack -- to free-play a cost-1, 0-power body, and the deck then paid five
    // DON!! to replay Buggy summoning-sick. Both halves of the ability are
    // optional, and the deck policy's first-non-skip fallback never declines.
    const game = luffyTurn({
      hand: [instance("croc", "OP16-045"), instance("mr1", MR_1)],
      selfBoard: [character("buggy", "OP16-048")],
    }).build();
    game.play({ type: "play-card", cardNumber: "OP16-045" });

    const opinions = contributions(game.state, "op16-luffy-crocodile");
    const dear = opinions.filter(
      (entry) =>
        entry.action.type === "resolve-effect" &&
        entry.action.option.kind === "card" &&
        (entry.action.option.card.cost ?? 0) > 2,
    );
    expect(dear).not.toHaveLength(0);
    for (const entry of dear) expect(entry.score).toBeLessThan(0);

    // `skip` scores zero, so with only dear bodies on offer it is the best
    // candidate in the group and the ability is simply declined.
    const action = await chosen(game.state);
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option.kind).toBe("skip");
  });

  it("pays Crocodile's return cost with a body no dearer than the one it buys", async () => {
    // Mr.2 costs 2, which is the ceiling the ability plays for free, and draws on
    // `[On Play]` when it is replayed -- so bouncing it is the line the trade is
    // actually for.
    const game = luffyTurn({
      hand: [instance("croc", "OP16-045"), instance("mr1", MR_1)],
      selfBoard: [character("mr2", "OP16-055")],
    }).build();
    game.play({ type: "play-card", cardNumber: "OP16-045" });

    const action = await chosen(game.state);
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option.kind === "card" && action.option.card.cardNumber).toBe(
      "OP16-055",
    );
  });

  it("holds Prisoner of Impel Down rather than paying six DON!! for it", async () => {
    // Eight copies at cost 6 for 6000 power, the worst rate in the deck, and
    // Buggy's [On Play] puts one on the board for free. The old priority table
    // ranked it above Boa Hancock and hard-cast them.
    const game = luffyTurn({
      hand: [instance("prisoner", PRISONER), instance("hancock", "OP16-032")],
    }).build();

    const prisoner = contributions(game.state, "op16-luffy-prisoner").filter(
      (entry) =>
        entry.action.type === "play-card" &&
        entry.action.cardInstanceId === "prisoner",
    );
    expect(prisoner).not.toHaveLength(0);
    for (const entry of prisoner) {
      expect(entry.score).toBeLessThan(0);
      expect(entry.reason).toContain("Buggy's free body");
    }

    const action = await chosen(game.state);
    expect(action.type).toBe("play-card");
    if (action.type !== "play-card") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("hancock");
  });
  it("switches on a [DON!! x1] attacker before the attack step", async () => {
    // The trace this came from (turn 3 against ST31): OP16-034 sat on the board
    // at 0 power, the deck attacked once with a bare Leader, and only then gave
    // it the turn's last DON!! -- below the attack step, where it could no
    // longer swing. Both branches of the old ladder that could fire here name an
    // attack, so this position is the discrimination: an attachment has to win
    // it, not the viable Leader hit.
    const game = luffyTurn({
      selfBoard: [character("luffy", "OP16-034")],
    }).build();

    // The branch check: `dead-attachment` is a format-wide `never` on
    // attachments that buy no battle, and a 0-power OP16-034 given 1000 loses to
    // every 5000 Leader in the field. It has to stay silent here, and does, via
    // `needsDonForAbility` -- the DON!! is buying text, not power. If that
    // exemption ever stops applying this rule is dead, and no assertion on the
    // chosen action would say so.
    const vetoes = contributions(game.state, "dead-attachment").filter(
      (entry) =>
        entry.action.type === "attach-don" &&
        entry.action.targetInstanceId === "luffy",
    );
    expect(vetoes).toHaveLength(0);

    const action = await chosen(game.state);
    expect(action.type).toBe("attach-don");
    if (action.type !== "attach-don") throw new Error("unreachable");
    expect(action.targetInstanceId).toBe("luffy");
  });

  it("develops before it switches on, because its plays draw cards", async () => {
    // The measured half of the ordering question, and the counter-intuitive one:
    // one DON!! is the whole price of every power source in the deck, so moving
    // the switch-on *above* `play` looks like a free upgrade. It is not.
    // OP16-054, OP16-055, OP16-045, OP16-026 and OP16-048 all draw or search on
    // play, so a DON!! moved from a play to an attachment costs a card:
    // a large loss in every matchup. This test is what pins that ordering.
    //
    // Three DON!! deliberately, where this position used to leave all ten. A
    // 0-power OP16-034 reads "[printed text omitted -- pnpm card:text OP16-034]", so alone on the board it
    // needs four DON!! to clear a 5000 Leader -- the first switches the clause
    // on for 1000 and each of the rest adds its own -- and that is out of reach
    // here, which is what keeps this a question about the switch-on rather than
    // about `enablingAttachment`, whose own cases live in
    // `op16-luffy-don-tempo.test.ts`. Four, not five: this used to leave four
    // DON!! on the theory that the conversion cost five, which was the deficit
    // divided by 1000 rather than a price any attachment could pay. Three
    // still affords the cost-2 play, so the choice the test is about is intact.
    // At ten DON!! the conversion *is*
    // affordable and the enabling attachment fires, which is correct and
    // pinned: gating that step on "the turn cannot also afford a play" is a
    // loss against every aggressive deck in the field. Develop-before-you-
    // power-up is the rule for DON!! spent on power for its own sake; it is not
    // the rule for DON!! that buys a battle.
    const game = luffyTurn({
      hand: [instance("mr1", MR_1)],
      selfBoard: [character("luffy", "OP16-034")],
    })
      .withDonDeck("p1", 7)
      .build();

    const action = await chosen(game.state);
    expect(action.type).toBe("play-card");
    if (action.type !== "play-card") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("mr1");
  });

  it("switches on the body that can attack, not the one played this turn", async () => {
    // One DON!! is the whole price of every power source in the deck, so the
    // question is only ever which body gets it. A DON!! on a Character played
    // this turn buys nothing and is returned in the next Refresh Phase.
    // `atTurn(6, ...)` lands on turn 7, because making p1 active advances one
    // turn; summoning sickness is `playedTurn >= turn`.
    const game = luffyTurn({
      selfBoard: [
        character("sick", MR_1, { playedTurn: 7 }),
        character("luffy", "OP16-034"),
      ],
    }).build();

    const action = await chosen(game.state);
    expect(action.type).toBe("attach-don");
    if (action.type !== "attach-don") throw new Error("unreachable");
    expect(action.targetInstanceId).toBe("luffy");
  });

  it("spreads DON!! one per body rather than stacking a second on the same one", async () => {
    // `[DON!! x1]` is satisfied at one. A second DON!! on OP16-034 buys +1000;
    // the first on OP16-055 makes its base power the opposing Leader's, the
    // largest single-DON!! swing in the deck.
    const game = luffyTurn({
      selfBoard: [
        character("luffy", "OP16-034"),
        character("bentham", "OP16-055"),
      ],
    })
      .withGivenDon("p1", "luffy", 1)
      .build();

    const action = await chosen(game.state);
    expect(action.type).toBe("attach-don");
    if (action.type !== "attach-don") throw new Error("unreachable");
    expect(action.targetInstanceId).toBe("bentham");
  });
});

/**
 * A battle in progress against one of p1's own Characters, with a hand that can
 * pay for it.
 *
 * The two bounds under test are `chooseGenericCounter`'s, and they are
 * independent: `protectedCards` decides *whether* a body is worth saving at all,
 * and `characterDefensePower` caps *how much* the save may cost. A position has
 * to name both to tell which one refused.
 */
function characterUnderAttack(options: {
  body: string;
  attackPower: number;
  bodyPower: number;
}) {
  return (
    scenario()
      .decks(
        "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
        "(Blue/Yellow) Nami - Official Feature Deck",
      )
      .seed(`op16-luffy-save-${options.body}-${options.attackPower}`)
      .bareTable()
      .atTurn(8, { active: "p2" })
      .withLife("p1", copies(4, "OP11-003", "p1-life"))
      .withLife("p2", copies(4, "OP11-003", "p2-life"))
      .withBoard("p1", [character("body", options.body)])
      // Two 2000-Counter cards, so a 1001 and a 2000 shortfall are both payable
      // and the refusal under test is never merely "the hand cannot".
      .withHand("p1", copies(2, "OP16-042", "p1-counter"))
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "p2-leader",
        targetInstanceId: "body",
        attackPower: options.attackPower,
        counterPower: 0,
      })
      .build()
  );
}

/**
 * That battle at its Counter step. `withActiveAttack` opens at the *Block*
 * step, and a policy asked there answers a different question entirely.
 */
function atCounterStep(game: ReturnType<typeof characterUnderAttack>) {
  game.play({ type: "pass" });
  return game;
}

describe("what a Character is worth saving for", () => {
  it("pays past the one-card budget for a body the deck is built around", async () => {
    // Crocodile is 6000 and already named in `protectedCards`; a 7001 attack
    // leaves a 1002 shortfall, one point past the 1000 the generic budget
    // allows, and the deck took the K.O. rather than spend a second card.
    const game = characterUnderAttack({
      body: "OP16-045",
      bodyPower: 6_000,
      attackPower: 7_001,
    });
    atCounterStep(game);
    const action = await new RegistryRulesAgent("OP16-022").chooseAction(
      observe(game.state, "p1"),
    );

    expect(action.type).toBe("counter");
  });

  it("saves the Blocker wall, which the protected set never named", async () => {
    // Prisoner of Impel Down is the deck's [Blocker], and is not in
    // `protectedCards` at all -- so whatever the shortfall, the generic policy
    // called it a replaceable Character and let it die.
    const game = characterUnderAttack({
      body: "OP16-042",
      bodyPower: 6_000,
      attackPower: 7_000,
    });
    atCounterStep(game);
    const action = await new RegistryRulesAgent("OP16-022").chooseAction(
      observe(game.state, "p1"),
    );

    expect(action.type).toBe("counter");
  });
});

/**
 * The same posed main phase, with the opponent's Life given explicitly so a
 * position can be one hit from the kill.
 */
function luffyTurnAgainstLife(
  opponentLife: number,
  options: Parameters<typeof luffyTurn>[0],
) {
  return scenario()
    .decks(
      "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
      "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
    )
    .seed("op16-luffy-policy-lethal")
    .bareTable()
    .atTurn(6, { active: "p1" })
    .withLife("p1", copies(4, "OP16-042", "p1-life"))
    .withLife("p2", copies(opponentLife, "OP16-042", "p2-life"))
    .withBoard("p1", options.selfBoard ?? [])
    .withBoard("p2", options.opponentBoard ?? [])
    .withHand("p1", options.hand ?? []);
}

/** Mr.2: one DON!! makes its attack the opposing Leader's power. */
const MR_2 = "OP16-055";
/** The deck's Leader, for looking its registered modules up. */
const LEADER_ID = "OP16-022";
/** Emporio.Ivankov: the cost-4 search-and-free-play engine piece. */
const IVANKOV = "OP16-026";
/** Gum-Gum Jet Culverin: three DON!! to bottom a Character of cost 4 or less. */
const CULVERIN = "OP11-061";
/** Mr.3(Galdino), the cost-4 print: trash to draw two and lock an attacker. */
const MR_3 = "OP16-056";

describe("sequencing the Leader's refund", () => {
  it("pays a second cost before refunding, rather than refunding one DON!!", async () => {
    // The refund node takes what is rested, up to two, and the once-per-turn
    // is spent either way. One rested DON!! and a cost-2 body in hand: the
    // body rests two more, and then the activation refunds two.
    const game = luffyTurn({
      hand: [instance("mr1", MR_1)],
      don: { rested: 1 },
    }).build();

    const action = await chosen(game.state);
    expect(action.type).toBe("play-card");
    if (action.type !== "play-card") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("mr1");
  });

  it("refunds the moment two DON!! are rested, before the next play", async () => {
    const game = luffyTurn({
      // The refund needs an {Impel Down} body on the board to be offered.
      selfBoard: [character("prisoner", "OP16-042", { rested: true })],
      hand: [instance("mr1", MR_1)],
      don: { rested: 2 },
    }).build();

    const action = await chosen(game.state);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(action.sourceCardNumber).toBe("OP16-022");
  });

  it("takes a single refund once nothing else this turn will pay a cost", async () => {
    // One rested DON!!, an empty hand and a body waiting for its switch-on:
    // the refund cannot grow, so it is taken and becomes the attachment.
    const game = luffyTurn({
      selfBoard: [character("bentham", MR_2)],
      don: { rested: 1 },
    }).build();

    const action = await chosen(game.state);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(action.sourceCardNumber).toBe("OP16-022");
  });

  it("develops before it lifts a body that could already swing next turn", async () => {
    // Four active DON!! and Ivankov in hand against a Mr.2 that one DON!!
    // would send at the Leader. The play searches, free-plays a second body
    // and rests four DON!! for the refund to pay back; the attachment does
    // none of that, and the DON!! it would spend is still there afterwards.
    const game = luffyTurn({
      hand: [instance("ivankov", IVANKOV)],
      selfBoard: [character("bentham", MR_2)],
    })
      .withDonDeck("p1", 6)
      .build();

    const action = await chosen(game.state);
    expect(action.type).toBe("play-card");
    if (action.type !== "play-card") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("ivankov");
  });

  it("converts before developing when the DON!! on hand buys the last hits", async () => {
    // Opponent at 1 Life with no Blocker: the Leader's own swing empties the
    // stack and one DON!! on Mr.2 declares the attack that wins. A body
    // developed now attacks next turn, and there is no next turn.
    const game = luffyTurnAgainstLife(1, {
      hand: [instance("ivankov", IVANKOV)],
      selfBoard: [character("bentham", MR_2)],
    }).build();

    const action = await chosen(game.state);
    expect(action.type).toBe("attach-don");
    if (action.type !== "attach-don") throw new Error("unreachable");
    expect(action.targetInstanceId).toBe("bentham");
  });
});

describe("what the leftover DON!! buys", () => {
  it("switches on Mr.2 ahead of a Mr.1 whose clause a short hand cannot meet", async () => {
    // Mr.1's `[DON!! x1]` +3000 also asks for five cards in hand; with an
    // empty hand the DON!! on it buys 1000 and no battle, while the same DON!!
    // on Mr.2 buys an attack that beats the Leader.
    const game = luffyTurn({
      selfBoard: [character("mr1", MR_1), character("bentham", MR_2)],
    })
      .withDonDeck("p1", 9)
      .build();

    const action = await chosen(game.state);
    expect(action.type).toBe("attach-don");
    if (action.type !== "attach-don") throw new Error("unreachable");
    expect(action.targetInstanceId).toBe("bentham");
  });

  it("attacks with a bare Leader rather than switching on a Mr.1 that stays short", async () => {
    // Mr.1 alone, one DON!!, no hand: the switch-on buys nothing this turn, so
    // the Leader's viable swing comes first and the DON!! is not thrown at a
    // 3000 body that beats nothing.
    const game = luffyTurn({
      selfBoard: [character("mr1", MR_1)],
    })
      .withDonDeck("p1", 9)
      .build();

    const action = await chosen(game.state);
    expect(action.type).toBe("attack");
    if (action.type !== "attack") throw new Error("unreachable");
    expect(action.attackerInstanceId).toBe("p1-leader");
  });
});

describe("the board-control Events", () => {
  it("holds Culverin when its only target is a one-cost body", async () => {
    // Three DON!! to bottom a body the opponent paid one for is a loss, and
    // this Event used to be cast the moment anything of cost 4 or less stood
    // on the other side.
    const game = luffyTurn({
      hand: [instance("culverin", CULVERIN)],
      opponentBoard: [character("nami", "OP01-016")],
    }).build();

    const action = await chosen(game.state);
    expect(
      action.type === "activate-main" && action.sourceCardNumber === CULVERIN,
    ).toBe(false);
  });

  it("casts Culverin on a Blocker", async () => {
    // A cost-4 Blocker is the body that turns a Leader hit into a battle with
    // itself; bottoming it for three DON!! is the trade the card is for.
    const game = luffyTurn({
      hand: [instance("culverin", CULVERIN)],
      opponentBoard: [character("croc", "OP16-045")],
    }).build();

    const action = await chosen(game.state);
    expect(action.type).toBe("activate-main");
    if (action.type !== "activate-main") throw new Error("unreachable");
    expect(action.sourceCardNumber).toBe(CULVERIN);
  });

  it("swings with Mr.3 before trashing it for the draw and the lock", async () => {
    // The `[Activate: Main]` does not need the body active, so the 5000 swing
    // is free: trashing first gave up an attack every turn it fired. An
    // active 6000 body on the other side is the attacker the lock is for.
    const game = luffyTurn({
      selfBoard: [character("mr3", MR_3)],
      opponentBoard: [character("buggy", "OP16-048")],
    }).build();

    const action = await chosen(game.state);
    expect(action.type).toBe("attack");
  });

  it("aims Mr.3's lock at the biggest opposing attacker, not the first offered", async () => {
    const game = luffyTurn({
      selfBoard: [character("mr3", MR_3, { rested: true })],
      opponentBoard: [character("small", MR_1), character("big", "OP16-048")],
    }).build();
    game.play({ type: "activate-main", sourceCardNumber: MR_3 });

    // The program opens with an optional "you may", then draws, then offers
    // the "up to 1" choice; the policy answers each step in turn.
    let action = await chosen(game.state);
    while (action.type === "resolve-effect" && action.option.kind !== "card") {
      game.play({ type: "resolve-effect", optionId: action.optionId });
      action = await chosen(game.state);
    }
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option.kind === "card" && action.option.card.instanceId).toBe(
      "big",
    );
  });
});

describe("what a full board gives up", () => {
  it("refuses a Mr.1 that would replace the Mr.2 swinging at the Leader", async () => {
    // Five bodies, Mr.2 among them at a printed 1000. The format prices the
    // swap on printed power and lets a 2000 replace it; priced at what Mr.2
    // attacks for once it holds a DON!!, the swap trades down and is vetoed.
    const game = luffyTurn({
      hand: [instance("mr1-hand", MR_1)],
      selfBoard: [
        character("bentham", MR_2),
        character("croc-a", "OP16-045"),
        character("croc-b", "OP16-045"),
        character("buggy-a", "OP16-048"),
        character("buggy-b", "OP16-048"),
      ],
    }).build();

    const observation = observe(game.state, "p1");
    const context = policyContext(observation);
    const module = policiesForDeck(LEADER_ID).find(
      (candidate) => candidate.id === "op16-luffy-board",
    );
    if (!module) throw new Error("no op16-luffy-board module");
    const play = observation.legalActions.find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "mr1-hand",
    );
    expect(play).toBeDefined();
    expect(module.veto?.(context, play!)).toContain("swings for no more");

    const action = await chosen(game.state);
    expect(action.type).not.toBe("play-card");
  });

  it("gives up a Mr.1 rather than the Mr.2 when a swap does go through", async () => {
    // Buggy is a real upgrade over the board's weakest body, so the play is
    // allowed; the question is which body pays for it. Printed power alone
    // names Mr.2; its switched-on worth names the Mr.1 beside it.
    const game = luffyTurn({
      hand: [instance("buggy", "OP16-048")],
      selfBoard: [
        character("bentham", MR_2),
        character("mr1", MR_1),
        character("croc-a", "OP16-045"),
        character("croc-b", "OP16-045"),
        character("ivankov", IVANKOV),
      ],
    }).build();
    game.play({ type: "play-card", cardNumber: "OP16-048" });

    const kept = contributions(game.state, "op16-luffy-board").filter(
      (entry) =>
        entry.action.type === "resolve-effect" &&
        entry.action.option.kind === "card" &&
        entry.action.option.card.instanceId === "bentham",
    );
    expect(kept).not.toHaveLength(0);
    for (const entry of kept) expect(entry.score).toBeLessThan(0);

    const action = await chosen(game.state);
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option.kind === "card" && action.option.card.instanceId).toBe(
      "mr1",
    );
  });
});
