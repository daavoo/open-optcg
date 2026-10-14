/**
 * The format rules about choices that give a card up.
 *
 * One of the files `format-heuristics.ts` is the map of -- see that file for
 * what lives where. A test belongs beside the rule it drives.
 */
import { describe, expect, it } from "vitest";
import {
  createStageReplacementModule,
  policyContext,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { instance, scenario } from "./support/index.js";

describe("playing a Stage over a live copy of itself", () => {
  /**
   * The Teach seat mid-turn, holding a second Fullalead. The trace this came
   * from had the first one already down since turn 1.
   */
  function withStageInPlay(stage: string | null) {
    return scenario()
      .decks(
        "(Black/Yellow) Marshall.D.Teach - Official Feature Deck",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("format-stage-replacement")
      .bareTable()
      .atTurn(6, { active: "p1" })
      .withStage("p1", stage === null ? null : instance("stage-in-play", stage))
      .withHand("p1", [instance("second-copy", "OP09-099")])
      .build();
  }

  const vetoOf = (game: ReturnType<typeof withStageInPlay>) => {
    const observation = observe(game.state, "p1");
    const play = observation.legalActions.find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "second-copy",
    );
    expect(play).toBeDefined();
    return createStageReplacementModule().veto?.(
      policyContext(observation),
      play!,
    );
  };

  it("vetoes the copy that only replaces the Stage already on the field", () => {
    expect(vetoOf(withStageInPlay("OP09-099"))).toContain(
      "already on the field",
    );
  });

  it("leaves the first copy of the turn alone", () => {
    expect(vetoOf(withStageInPlay(null))).toBeUndefined();
  });

  it("leaves a different Stage alone, since that is a judgement about two cards", () => {
    // OP17-057 is the other Fullalead: same name, different card, and whether
    // one is an upgrade on the other is not this rule's question.
    expect(vetoOf(withStageInPlay("OP17-057"))).toBeUndefined();
  });
});
