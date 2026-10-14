/**
 * The format rules about format rules read together, where one rule's veto meets another's.
 *
 * One of the files `format-heuristics.ts` is the map of -- see that file for
 * what lives where. A test belongs beside the rule it drives.
 */
import { describe, expect, it } from "vitest";
import {
  createDonReservationModule,
  createStageReplacementModule,
  resolveWithModules,
  tactics,
  type PolicyModule,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { copies, instance, scenario } from "./support/index.js";

describe("a play veto and a development veto in the same turn", () => {
  /**
   * The deadlock from `open-optcg-trace(19).jsonl`, p2 turn 5, with the two
   * real rules that produced it.
   *
   * The seat held a second Fullalead with a Fullalead already on the field and
   * one active DON!!. `stage-replacement` vetoed the play as a copy of itself;
   * `don-reservation` reserved that DON!! for the play, since
   * `attachmentBlocksAllDevelopment` counts plays the engine offered. Both
   * candidates gone, the ladder fell through to `attack` and the Leader swung
   * at 5000 into a 5000 Leader, which one 1000 Counter then held off. The
   * attachment was taken after the battle, where +1000 buys nothing.
   *
   * Turn 5 and 3 opposing Life keep `don-reservation`'s own gate open, so the
   * rule is genuinely willing to fire here -- what stops it is that the play it
   * would reserve for is gone.
   */
  function deadlockedTurn() {
    return (
      scenario()
        .decks(
          "(Black/Yellow) Marshall.D.Teach - Official Feature Deck",
          "(Red) Monkey.D.Luffy - Starter Deck 31",
        )
        .seed("format-veto-deadlock")
        .bareTable()
        .atTurn(4, { active: "p1" })
        .withStage("p1", instance("stage-in-play", "OP09-099"))
        .withHand("p1", [instance("second-copy", "OP09-099")])
        .withLife("p2", copies(3, "ST21-003", "p2-life"))
        // `bareTable()` puts all ten DON!! on the field, so the pool is set by
        // putting nine back rather than by asking for one.
        .withDonDeck("p1", 9)
        .build()
    );
  }

  const modules = [
    createStageReplacementModule(),
    createDonReservationModule(),
  ];

  /** What the deciding policy is left choosing between. */
  const spy = (() => {
    let types: string[] = [];
    return {
      seen: () => types,
      module: {
        id: "spy",
        decide: (context) => {
          types = context.actions.map((action) => action.type);
          return undefined;
        },
      } satisfies PolicyModule,
    };
  })();

  it("still refuses the copy that replaces the Stage with itself", () => {
    const observation = observe(deadlockedTurn().state, "p1");
    const decision = resolveWithModules(observation, modules);

    expect(decision.action.type).not.toBe("play-card");
    expect(decision.narrowedBy).toContain("stage-replacement");
  });

  it("stops reserving the turn's last DON!! for a play nothing will make", () => {
    const observation = observe(deadlockedTurn().state, "p1");
    // The gate `don-reservation` reads is open on the engine's own offer: the
    // play is affordable and one attachment would end it.
    expect(tactics(observation).attachmentBlocksAllDevelopment).toBe(true);

    const decision = resolveWithModules(observation, [...modules, spy.module]);

    expect(decision.narrowedBy).not.toContain("don-reservation");
    // Asserted on the candidate set rather than on the decision, because the
    // ladder has its own order and takes the Stage's ability first. What this
    // rule cost was the attachment being on the table at all.
    expect(spy.seen()).toContain("attach-don");
  });

  it("keeps reserving it while the play is one the seat would actually make", () => {
    // The same position with nothing on the Stage slot, so the play stands and
    // the fundamental's argument holds.
    const game = scenario()
      .decks(
        "(Black/Yellow) Marshall.D.Teach - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("format-veto-deadlock-open")
      .bareTable()
      .atTurn(4, { active: "p1" })
      .withHand("p1", [instance("first-copy", "OP09-099")])
      .withLife("p2", copies(3, "ST21-003", "p2-life"))
      .withDonDeck("p1", 9)
      .build();
    const decision = resolveWithModules(observe(game.state, "p1"), [
      ...modules,
      spy.module,
    ]);

    expect(decision.narrowedBy).toContain("don-reservation");
    expect(spy.seen()).not.toContain("attach-don");
  });
});
