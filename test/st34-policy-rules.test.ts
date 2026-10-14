import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { policiesForDeck, policyContext } from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * ST-34's play ordering, which issue #170 moved out of `choosePlay`.
 *
 * Asserted at each rule's own contribution rather than at the chosen action,
 * for the reason `archetype-rules.test.ts` sets out: an outcome assertion
 * passes while a branch quietly stops firing, which is how ST33's policy held
 * seventeen green tests through a 22.8pt collapse.
 */
function contribution(
  state: Parameters<typeof observe>[0],
  moduleId: string,
  cardInstanceId: string,
): number | undefined {
  const observation = observe(state, "p1");
  const context = policyContext(observation);
  const module = policiesForDeck(observation.self.leader.cardNumber).find(
    (candidate) => candidate.id === moduleId,
  );
  if (!module) throw new Error(`no module ${moduleId}`);
  return observation.legalActions.flatMap((action: LegalAction) => {
    if (action.type !== "play-card") return [];
    if (action.cardInstanceId !== cardInstanceId) return [];
    const ranked = module.rank?.(context, action);
    if (ranked === undefined) return [];
    return [typeof ranked === "number" ? ranked : ranked.score];
  })[0];
}

function st34Turn(hand: ReturnType<typeof instance>[]) {
  return scenario()
    .decks(
      "(Purple) Charlotte Katakuri - Starter Deck 34",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    )
    .seed("st34-play-rules")
    .bareTable()
    .atTurn(6, { active: "p1" })
    .withLife("p1", copies(4, "OP11-003", "p1-life"))
    .withLife("p2", copies(4, "OP11-003", "p2-life"))
    .withBoard("p2", [character("body", "ST31-002")])
    .withHand("p1", hand)
    .build();
}

describe("ST34 play ordering", () => {
  it("puts the finisher above the ramp bodies, as the old +200 bonus did", () => {
    // ST34-004 Linlin is a 12000 for ten; EB03-035 Pudding is a 4-cost
    // [Blocker] that ramps. The old scorer gave Linlin +200 against Pudding's
    // +80, so a castable Linlin always outranked a ramp body. `linlin-finisher`
    // sits a band above `ramp-bodies` to keep that.
    const posed = st34Turn([
      instance("linlin", "ST34-004"),
      instance("pudding", "EB03-035"),
    ]);

    expect(
      contribution(posed.state, "st34#linlin-finisher", "linlin") ?? 0,
    ).toBeGreaterThan(
      contribution(posed.state, "st34#ramp-bodies", "pudding") ?? 0,
    );
  });

  it("prefers both ramp bodies flat, without gating either on its clause", () => {
    // Pins a refutation. The first version of this file gated Pudding on its
    // printed `if your DON!! count is equal to or less than your opponent's`
    // and Cracker on having a cost-2 body to K.O. -- the shape that carried
    // ST-32 and ST-33. Here the pair is a loss, because both are 4-cost
    // bodies this deck wants on the
    // field whether or not the clause fires, so dropping them to their table
    // value on the shut turns handed the turn to a vanilla.
    //
    // The board here has no cost-2 body and p1 is not behind on DON!!, so both
    // gates would be shut -- and both rules must still score.
    const posed = st34Turn([
      instance("pudding", "EB03-035"),
      instance("cracker", "ST34-002"),
    ]);

    expect(
      contribution(posed.state, "st34#ramp-bodies", "pudding"),
    ).toBeGreaterThan(0);
    expect(
      contribution(posed.state, "st34#ramp-bodies", "cracker"),
    ).toBeGreaterThan(0);
  });

  it("scores every play, so no gated rule can hide the rest", () => {
    // `develop-by-value` is the total-order rule. Without one, a gated `prefer`
    // hides every card it does not name -- the failure `heuristics.ts` records
    // that was catastrophic for OP-17 Kaido.
    const posed = st34Turn([
      instance("daifuku", "OP11-068"),
      instance("anana", "OP11-065"),
    ]);

    expect(
      contribution(posed.state, "st34#develop-by-value", "daifuku"),
    ).toBeGreaterThan(
      contribution(posed.state, "st34#develop-by-value", "anana") ?? 0,
    );
  });
});
