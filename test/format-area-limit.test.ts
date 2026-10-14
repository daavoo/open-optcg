import { describe, expect, it } from "vitest";
import {
  createAreaReplacementChoiceModule,
  createBoardReplacementModule,
  createReplacementBlockerModule,
  policyContext,
  tactics,
} from "@one-piece-sim/agents/local";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

import { character, instance, scenario } from "./support/index.js";

/**
 * The two format fundamentals for the Character area limit.
 *
 * The position throughout is `open-optcg-trace.jsonl` turn 4, revision 25: five
 * Characters down and a second Mr.2 in hand with the DON!! to pay for it. The
 * engine offers the play and only *then* asks which body to give up, so the
 * `play-card` summary says nothing about the cost -- which is why a value table
 * with no board term walks into it, and why both halves need their own rule.
 */

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;

const DECK = "(Green/Blue) Monkey.D.Luffy - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** Five Characters down, `handCard` in hand, six active DON!! to pay with. */
function fullBoard(handCard: string) {
  return scenario()
    .decks(DECK, OPPONENT)
    .seed("format-area-limit")
    .atTurn(7, { active: "p1" })
    .bareTable()
    .withBoard("p1", [
      character("mr2", "OP16-055", { playedTurn: 1 }),
      character("luffy", "OP16-034", { playedTurn: 1 }),
      character("luffy-2", "OP16-034", { playedTurn: 1 }),
      character("ivankov", "OP16-026", { playedTurn: 1 }),
      character("mr1", "OP16-054", { playedTurn: 1 }),
    ])
    .withHand("p1", [instance("incoming", handCard)])
    .withDon("p1", { active: 6 })
    .build();
}

const playOf = (observation: GameObservation) =>
  observation.legalActions.find(
    (action) =>
      action.type === "play-card" && action.cardInstanceId === "incoming",
  )!;

const vetoOf = (observation: GameObservation, act: LegalAction) =>
  createBoardReplacementModule().veto?.(policyContext(observation), act);

describe("board-replacement-cost", () => {
  it("vetoes a play whose body is no stronger than the weakest one it replaces", () => {
    // OP16-034 is 0 printed power at cost 1; the weakest body on the board is
    // another OP16-034 at 0 power and cost 1. The swap buys nothing and spends a
    // card and a DON!! doing it.
    const observation = observe(fullBoard("OP16-034").state, "p1");

    expect(observation.self.board).toHaveLength(5);
    expect(vetoOf(observation, playOf(observation))).toBeDefined();
  });

  it("leaves a play that is a real power upgrade alone", () => {
    // OP16-032 Boa Hancock is 9000 power, so the swap is an upgrade whatever it
    // replaces and the judgement stays with the deck policy.
    const observation = observe(fullBoard("OP16-032").state, "p1");

    expect(vetoOf(observation, playOf(observation))).toBeUndefined();
  });

  it("says nothing at all while the board has room", () => {
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("format-area-room")
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("mr2", "OP16-055", { playedTurn: 1 })])
      .withHand("p1", [instance("incoming", "OP16-034")])
      .withDon("p1", { active: 6 })
      .build();
    const observation = observe(game.state, "p1");

    expect(vetoOf(observation, playOf(observation))).toBeUndefined();
  });

  it("stops reserving DON!! for a 'play' that is only a swap", () => {
    // `don-reservation` reads `attachmentBlocksAllDevelopment`, which used to be
    // true in this position -- a play is affordable and one attachment would end
    // that -- so the fundamental vetoed the attachment in favour of the swap. In
    // the trace it reads "this DON!! is the last one that can pay for a play"
    // while the only play left trashed a Mr.2 to replay a Mr.2.
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("format-area-reservation")
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("mr2", "OP16-055", { playedTurn: 1 }),
        character("luffy", "OP16-034", { playedTurn: 1 }),
        character("luffy-2", "OP16-034", { playedTurn: 1 }),
        character("ivankov", "OP16-026", { playedTurn: 1 }),
        character("mr1", "OP16-054", { playedTurn: 1 }),
      ])
      .withHand("p1", [instance("incoming", "OP16-055")])
      .withDon("p1", { active: 2 })
      .build();
    const full = tactics(observe(game.state, "p1"));

    // The play is exactly affordable, which is the arithmetic the trait keys on.
    expect(full.cheapestAffordablePlay).toBe(2);
    expect(full.attachmentBlocksAllDevelopment).toBe(false);
  });
});

describe("area-replacement-choice", () => {
  /**
   * Drives the engine to the real replacement decision rather than fabricating
   * the action, so the option descriptors the rule reads are the ones the engine
   * actually produces -- including `currentPower`, which a hand-built option
   * would have to guess.
   */
  function replacementOptions(): {
    observation: GameObservation;
    actions: readonly EffectAction[];
  } {
    const game = fullBoard("OP16-055");
    game.play({ type: "play-card", cardInstanceId: "incoming" });
    const observation = observe(game.state, "p1");
    return {
      observation,
      actions: observation.legalActions.filter(
        (action): action is EffectAction => action.type === "resolve-effect",
      ),
    };
  }

  function scores(): Map<string, number> {
    const { observation, actions } = replacementOptions();
    const module = createAreaReplacementChoiceModule();
    const context = policyContext(observation);
    const byOption = new Map<string, number>();
    for (const action of actions) {
      const contribution = module.rank?.(context, action);
      byOption.set(
        action.optionId,
        typeof contribution === "number"
          ? contribution
          : (contribution?.score ?? 0),
      );
    }
    return byOption;
  }

  it("offers every body on the field once the sixth Character arrives", () => {
    const { actions } = replacementOptions();

    expect(actions.map((action) => action.effectKind)).toEqual(
      Array.from({ length: 5 }, () => "character-area-replacement"),
    );
  });

  it("gives up a 0-power duplicate before a 4000-power engine piece", () => {
    const score = scores();

    expect(score.get("luffy")).toBeGreaterThan(score.get("ivankov")!);
    expect(score.get("luffy")).toBeGreaterThan(score.get("mr1")!);
  });

  it("breaks a power tie towards the duplicated name", () => {
    // OP16-034's power clause counts names rather than bodies, so a second copy
    // of a name is worth strictly less than the first. Both OP16-034s here sit
    // at 0 power, so nothing but the name term separates them from the Mr.2.
    const score = scores();

    expect(score.get("luffy")).toBeGreaterThan(score.get("mr2")!);
  });

  it("does not name the first body offered, which is what the trace did", () => {
    const { actions } = replacementOptions();
    const score = scores();
    const best = [...score.entries()].sort(
      (left, right) => right[1] - left[1],
    )[0];

    // First offered is `mr2`: the oldest body, and a 1000-power attacker. The
    // deck policy's fall-through chose exactly that at revision 26 of the trace,
    // trashing a Mr.2 to make room for a Mr.2.
    expect(actions[0]?.optionId).toBe("mr2");
    expect(best?.[0]).not.toBe("mr2");
  });

  it("says nothing about effect kinds it was not written for", () => {
    // A search result is a `resolve-effect` too. Contributing to those would put
    // this rule above every deck's search priority table.
    const game = fullBoard("OP16-034");
    game.play({ type: "play-card", cardInstanceId: "incoming" });
    const observation = observe(game.state, "p1");
    const module = createAreaReplacementChoiceModule();
    const context = policyContext(observation);
    const other = observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" &&
        action.effectKind !== "character-area-replacement",
    );

    if (other) expect(module.rank?.(context, other)).toBeUndefined();
    // The area replacement in the same position is still ranked, so a passing
    // assertion above cannot be a rule that never fires.
    const replacement = observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" &&
        action.effectKind === "character-area-replacement",
    );
    expect(replacement).toBeDefined();
    expect(module.rank?.(context, replacement!)).toBeDefined();
  });
});

/**
 * The judgement `open-optcg-trace(24).jsonl` turn 7 got wrong, posed as a board.
 *
 * The OP-17 Robin pilot answered a full board by trashing its only [Blocker] --
 * a cost-3 1000 Yamato -- and keeping a bare cost-1 2000 whose [On Play] had
 * been spent six turns earlier. `area-replacement-choice` is right on its own
 * terms: 1000 is the least power on the field. The keyword is the term it cannot
 * see.
 */
describe("replacement-blocker", () => {
  const ROBIN =
    "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1";
  /** OP17-074 Yamato: cost 3, 1000 power, [Blocker]. */
  const YAMATO = "OP17-074";
  /** ST34-003 Charlotte Brulee: cost 1, 2000 power, no keywords. */
  const BRULEE = "ST34-003";
  /** OP17-107 Charlotte Daifuku: cost 3, 4000 power, no keywords. */
  const DAIFUKU = "OP17-107";
  /** OP17-114 Sweet 3 Generals: the cost-6 4000 body that forced the choice. */
  const SWEET_3 = "OP17-114";

  /** The trace's board, with `overrides` applied to the Blocker on it. */
  function robinBoard(
    overrides: Partial<Parameters<typeof character>[2]> = {},
    /** Replaces the second Daifuku, for posing a body of another size. */
    swap?: { big: string },
  ): { observation: GameObservation; actions: readonly EffectAction[] } {
    const game = scenario()
      .decks(ROBIN, OPPONENT)
      .seed("replacement-blocker")
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("brulee", BRULEE),
        character("daifuku", DAIFUKU),
        swap ? character("big", swap.big) : character("daifuku-2", DAIFUKU),
        character("smoothie", "OP17-106"),
        character("yamato", YAMATO, overrides),
      ])
      .withHand("p1", [instance("incoming", SWEET_3)])
      .withDon("p1", { active: 8 })
      .build();
    game.play({ type: "play-card", cardInstanceId: "incoming" });
    const observation = observe(game.state, "p1");
    return {
      observation,
      actions: observation.legalActions.filter(
        (action): action is EffectAction => action.type === "resolve-effect",
      ),
    };
  }

  /** Every module that has an opinion on the choice, summed as the chain does. */
  function scores(
    overrides: Partial<Parameters<typeof character>[2]> = {},
    swap?: { big: string },
  ): Map<string, number> {
    const { observation, actions } = robinBoard(overrides, swap);
    const context = policyContext(observation);
    const modules = [
      createAreaReplacementChoiceModule(),
      createReplacementBlockerModule(),
    ];
    const byOption = new Map<string, number>();
    for (const action of actions) {
      let total = 0;
      for (const module of modules) {
        const contribution = module.rank?.(context, action);
        total +=
          typeof contribution === "number"
            ? contribution
            : (contribution?.score ?? 0);
      }
      byOption.set(action.optionId, total);
    }
    return byOption;
  }

  it("keeps the 1000 Blocker and gives up the bigger bare body", () => {
    const score = scores();

    // The fault, stated as an inequality: on power alone Yamato outscores every
    // body on the field, Brulee included.
    const powerOnly = createAreaReplacementChoiceModule();
    const { observation, actions } = robinBoard();
    const context = policyContext(observation);
    const powerScore = (optionId: string) => {
      const action = actions.find(
        (candidate) => candidate.optionId === optionId,
      )!;
      const contribution = powerOnly.rank?.(context, action);
      return typeof contribution === "number"
        ? contribution
        : (contribution?.score ?? 0);
    };
    expect(powerScore("yamato")).toBeGreaterThan(powerScore("brulee"));

    // And the fix: with the keyword priced, the bare 2000 is the body to spend.
    expect(score.get("brulee")).toBeGreaterThan(score.get("yamato")!);
  });

  it("still gives up a small Blocker rather than the board's biggest body", () => {
    // The credit is a floor, not a shield. A 1000 [Blocker] is priced as 5000 of
    // body, so a 6000 on the same board is still the thing worth keeping --
    // which is what stops this rule from inverting into "trade the board away to
    // keep any block".
    const score = scores({}, { big: "OP17-101" });

    expect(score.get("yamato")).toBeGreaterThan(score.get("big")!);
  });

  it("says nothing about a Blocker that is already rested", () => {
    // Refresh is at the start of this player's *next* turn, so a Blocker rested
    // in their own Main phase cannot block on the turn in between. Without this
    // gate the rule would read as "never trash a Blocker".
    const { observation, actions } = robinBoard({ rested: true });
    const context = policyContext(observation);
    const module = createReplacementBlockerModule();

    for (const action of actions) {
      expect(module.rank?.(context, action)).toBeUndefined();
    }
    // The power judgement is left to decide alone, which is the pre-fix answer.
    expect(scores({ rested: true }).get("yamato")).toBeGreaterThan(
      scores({ rested: true }).get("brulee")!,
    );
  });

  it("says nothing about a Blocker that cannot be rested to block", () => {
    // Resting is the cost of the block, so a rest-locked Character holds the
    // keyword and cannot use it.
    const { observation, actions } = robinBoard({ cannotRestUntilTurn: 8 });
    const context = policyContext(observation);
    const module = createReplacementBlockerModule();

    for (const action of actions) {
      expect(module.rank?.(context, action)).toBeUndefined();
    }
  });
});

/**
 * The swap `open-optcg-trace(1).jsonl` turn 9 made twice, posed as a board.
 *
 * `board-replacement-cost` and the replacement choice have to agree on which
 * body is the weakest, or a play the veto exists to stop walks through the gap
 * between them: the veto reads "a 2000 over a 1000 is an upgrade", and the
 * choice -- crediting the Blocker -- then gives up a 2000 instead.
 */
describe("board-replacement-cost prices the body the choice will give up", () => {
  const ROBIN =
    "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1";
  const YAMATO = "OP17-074";
  const BRULEE = "ST34-003";
  const LINLIN = "OP17-112";
  const PEROSPERO = "OP17-110";
  const TEACH = "OP16-119";

  /** The trace's board at revision 95, with `yamato` adjustable. */
  function robinBoard(
    incoming: string,
    yamato: Partial<Parameters<typeof character>[2]> = {},
  ): GameObservation {
    const game = scenario()
      .decks(ROBIN, OPPONENT)
      .seed("board-replacement-blocker")
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("yamato", YAMATO, yamato),
        character("linlin", LINLIN),
        character("perospero", PEROSPERO),
        character("teach", TEACH),
        character("brulee", BRULEE, { playedTurn: 9 }),
      ])
      .withHand("p1", [instance("incoming", incoming)])
      .withDon("p1", { active: 3 })
      .build();
    return observe(game.state, "p1");
  }

  it("vetoes a second 2000 whose only cheaper body by power is a Blocker", () => {
    const observation = robinBoard(BRULEE);
    // The position the old veto misread: by raw power the weakest body is the
    // 1000 Yamato, so a 2000 looked like an upgrade -- but the choice keeps a
    // Blocker ahead of a bare 2000, so what the swap actually trashes is the
    // Brulee already standing there, for a Brulee.
    const weakestByPower = [...observation.self.board].sort(
      (left, right) => left.currentPower - right.currentPower,
    )[0]!;
    expect(weakestByPower.cardNumber).toBe(YAMATO);
    expect(weakestByPower.blocker).toBe(true);

    expect(vetoOf(observation, playOf(observation))).toBeDefined();
  });

  it("lets the same play through once the Blocker is rested", () => {
    // Rested, the Yamato cannot block on the opponent's turn, so it is worth
    // its 1000 and the 2000 is the upgrade the old arithmetic said it was.
    const observation = robinBoard(BRULEE, { rested: true });

    expect(vetoOf(observation, playOf(observation))).toBeUndefined();
  });

  it("credits an incoming Blocker with its block as well", () => {
    // A 1000 Yamato over a board whose weakest body is a bare 2000: by power a
    // downgrade, but the block it brings is what the board is short of.
    const observation = robinBoard(YAMATO, { rested: true });

    expect(vetoOf(observation, playOf(observation))).toBeUndefined();
  });
});

/**
 * The trash `open-optcg-trace(2).jsonl` turn 10 made, posed as a board.
 *
 * OP17-110 Perospero's `[On Play]` plays a Big Mom Pirates Character from hand.
 * Onto a full board that raises the same replacement choice a played card does,
 * through the mechanic DSL -- and the action used to report it as a bare
 * `mechanic-choice`, which none of the three replacement rules recognise. First
 * offered won: the 12000 Linlin, trashed for a 4000 Oven.
 */
describe("a replacement raised by a card program", () => {
  const ROBIN =
    "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1";

  function afterPerospero(): {
    observation: GameObservation;
    actions: readonly EffectAction[];
  } {
    const game = scenario()
      .decks(ROBIN, OPPONENT)
      .seed("program-replacement")
      .atTurn(10, { active: "p1" })
      .bareTable()
      .withBoard("p1", [
        character("linlin", "OP17-112"),
        character("daifuku", "OP17-107"),
        character("daifuku-2", "OP17-107"),
        character("pudding", "OP17-109"),
      ])
      .withHand("p1", [
        instance("perospero", "OP17-110"),
        instance("oven", "OP17-102"),
      ])
      .withDon("p1", { active: 10 })
      .build();
    game.play({ type: "play-card", cardInstanceId: "perospero" });
    game.play({ type: "resolve-effect", optionId: "oven" });
    const observation = observe(game.state, "p1");
    return {
      observation,
      actions: observation.legalActions.filter(
        (action): action is EffectAction => action.type === "resolve-effect",
      ),
    };
  }

  it("reports the choice as an area replacement, not a bare mechanic choice", () => {
    const { actions } = afterPerospero();

    expect(actions.map((action) => action.summary)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("to make room for Charlotte Oven"),
      ]),
    );
    expect(actions.map((action) => action.effectKind)).toEqual(
      Array.from({ length: 5 }, () => "area-replacement"),
    );
  });

  it("is ranked by the replacement choice, which keeps the 12000", () => {
    const { observation, actions } = afterPerospero();
    const module = createAreaReplacementChoiceModule();
    const context = policyContext(observation);
    const score = (optionId: string): number => {
      const contribution = module.rank?.(
        context,
        actions.find((action) => action.optionId === optionId)!,
      );
      return typeof contribution === "number"
        ? contribution
        : (contribution?.score ?? Number.NaN);
    };

    // First offered is the Linlin -- the oldest body, and the biggest.
    expect(actions[0]?.optionId).toBe("linlin");
    expect(score("linlin")).toBeLessThan(score("pudding"));
  });

  it("is answered by the Robin pilot with anything but the Linlin", async () => {
    const { observation } = afterPerospero();
    const chosen = await new RegistryRulesAgent("OP09-062").chooseAction(
      observation,
    );

    expect(chosen.type).toBe("resolve-effect");
    expect(chosen).not.toMatchObject({ optionId: "linlin" });
  });
});
