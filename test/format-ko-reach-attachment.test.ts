/**
 * Where the turn's DON!! goes while a K.O. is one or two DON!! away.
 *
 * One of the files `format-heuristics.ts` is the map of -- see that file for
 * what lives where. A test belongs beside the rule it drives.
 */
import { describe, expect, it } from "vitest";
import {
  createKoReachAttachmentModule,
  policyContext,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, scenario } from "./support/index.js";

/**
 * A Linlin main phase with two bodies of its own at different powers and one
 * rested opposing Character, which is the board the rule is about: the DON!!
 * has to choose between the body that reaches the K.O. and the one that does
 * not, and between either of them and the Leader.
 *
 * ST34-002 Charlotte Cracker is a 5000 and OP17-109 Charlotte Pudding a 4000,
 * so against a 6000 target the two are one and two DON!! short. The opposing
 * bodies are vanilla, which keeps `isWorthRemoving` out of the test: a printed
 * `[On K.O.]` would make the target not worth removing and every score here
 * would be undefined for a second reason.
 */
function attachmentTurn(
  targets: string | readonly string[],
  options: { activeDon?: number } = {},
) {
  const targetCardNumbers = typeof targets === "string" ? [targets] : targets;
  const builder = scenario()
    .decks(
      "(Yellow) Charlotte Linlin - Official Feature Deck",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(
      `ko-reach-${targetCardNumbers.join("-")}-${options.activeDon ?? "all"}`,
    )
    .bareTable()
    .atTurn(6, { active: "p1" })
    .withBoard("p1", [
      character("big", "ST34-002"),
      character("small", "OP17-109"),
    ])
    .withBoard(
      "p2",
      targetCardNumbers.map((cardNumber, index) =>
        character(`their-body-${index}`, cardNumber, { rested: true }),
      ),
    );
  if (options.activeDon !== undefined) {
    builder.withDonDeck("p1", 10 - options.activeDon);
  }
  return builder.build();
}

function scoreOf(
  game: ReturnType<typeof attachmentTurn>,
  instanceId: string,
): number | undefined {
  const observation = observe(game.state, "p1");
  const attachment = observation.legalActions.find(
    (action) =>
      action.type === "attach-don" && action.targetInstanceId === instanceId,
  );
  expect(attachment).toBeDefined();
  const contribution = createKoReachAttachmentModule().rank?.(
    policyContext(observation),
    attachment!,
  );
  if (contribution === undefined) return undefined;
  return typeof contribution === "number" ? contribution : contribution.score;
}

describe("DON!! that completes a K.O.", () => {
  it("prefers the body with the smallest shortfall, over the larger one and the Leader", () => {
    // OP12-052 Fullbody is a cost-4 6000: the 5000 body is one DON!! short of
    // it and the 4000 body two, and the attacker wins the tie.
    const game = attachmentTurn("OP12-052");

    const big = scoreOf(game, "big");
    const small = scoreOf(game, "small");
    expect(big).toBeGreaterThan(small!);
    // The recipient the ladder would otherwise take first-offered, every turn.
    expect(scoreOf(game, "p1-leader")).toBeUndefined();
  });

  it("says nothing about a K.O. wider than the turn should buy", () => {
    // OP12-045 Jango is a cost-6 8000, three and four DON!! away. A reach that
    // wide spends the Leader's swing on a K.O. one Counter card still undoes.
    const game = attachmentTurn("OP12-045");

    expect(scoreOf(game, "big")).toBeUndefined();
    expect(scoreOf(game, "small")).toBeUndefined();
  });

  it("says nothing about a body that already reaches a target", () => {
    // OP17-030 Monkey.D.Luffy is a cost-4 5000, which the 5000 body already
    // K.O.s on the tie. The DON!! buys that attack nothing.
    const game = attachmentTurn("OP17-030");

    expect(scoreOf(game, "big")).toBeUndefined();
    // The 4000 is still one short of it, so the same board keeps a candidate.
    expect(scoreOf(game, "small")).toBeDefined();
  });

  it("arms a second body rather than walking the first up the board", () => {
    // Both targets at once: the 5000 body already K.O.s OP17-030 and is one
    // DON!! from the 6000, and the 4000 body can K.O. nothing yet. Each unit
    // attacks once, so the DON!! that gives the 4000 its first K.O. buys a
    // second K.O. where a DON!! on the 5000 only upgrades the target of the one
    // attack it was always going to make.
    const game = attachmentTurn(["OP17-030", "OP12-052"]);

    expect(scoreOf(game, "big")).toBeUndefined();
    expect(scoreOf(game, "small")).toBeDefined();
  });

  it("does not promise a K.O. the turn cannot pay for", () => {
    // One DON!! left: the 5000 body reaches the 6000 target with it, the 4000
    // body cannot reach anything this turn, and a DON!! under it would expire
    // at the opponent's turn having bought no battle.
    const game = attachmentTurn("OP12-052", { activeDon: 1 });

    expect(scoreOf(game, "big")).toBeDefined();
    expect(scoreOf(game, "small")).toBeUndefined();
  });
});
