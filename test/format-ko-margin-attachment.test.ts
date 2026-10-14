/**
 * The thousand that puts an armed K.O. past one Counter card.
 *
 * One of the files `format-heuristics.ts` is the map of -- see that file for
 * what lives where. A test belongs beside the rule it drives.
 */
import { describe, expect, it } from "vitest";
import {
  createKoMarginAttachmentModule,
  createKoReachAttachmentModule,
  policyContext,
} from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, scenario } from "./support/index.js";

/**
 * The board this rule is about: one of its own bodies already beats the rested
 * Character opposite, and the other does not.
 *
 * ST34-002 Charlotte Cracker is a 5000 and OP17-109 Charlotte Pudding a 4000.
 * Against OP05-005 Karasu, a rested cost-4 5000, Cracker wins the battle on the
 * tie and Pudding is a thousand short -- so `ko-reach-attachment` has an
 * opinion about Pudding and none about Cracker, and this rule is the other way
 * round. Karasu's clauses are [On Play] and [When Attacking], neither of which
 * pays its controller for being K.O.'d, so `isWorthRemoving` holds.
 */
function marginTurn(options: { activeDon?: number } = {}) {
  const builder = scenario()
    .decks(
      "(Yellow) Charlotte Linlin - Official Feature Deck",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(`ko-margin-${options.activeDon ?? "all"}`)
    .bareTable()
    .atTurn(6, { active: "p1" })
    .withBoard("p1", [
      character("beats-it", "ST34-002"),
      character("short", "OP17-109"),
    ])
    .withBoard("p2", [character("their-body", "OP05-005", { rested: true })]);
  if (options.activeDon !== undefined) {
    builder.withDonDeck("p1", 10 - options.activeDon);
  }
  return builder.build();
}

function scoreOf(
  game: ReturnType<typeof marginTurn>,
  instanceId: string,
  module = createKoMarginAttachmentModule(),
): number | undefined {
  const observation = observe(game.state, "p1");
  const attachment = observation.legalActions.find(
    (action) =>
      action.type === "attach-don" && action.targetInstanceId === instanceId,
  );
  expect(attachment).toBeDefined();
  const contribution = module.rank?.(policyContext(observation), attachment!);
  if (contribution === undefined) return undefined;
  return typeof contribution === "number" ? contribution : contribution.score;
}

describe("DON!! that puts an armed K.O. past one Counter card", () => {
  it("tops up the body that already wins the battle, which ko-reach has gone quiet on", () => {
    const game = marginTurn();

    expect(scoreOf(game, "beats-it")).toBeGreaterThan(0);
    expect(scoreOf(game, "beats-it", createKoReachAttachmentModule())).toBe(
      undefined,
    );
  });

  it("says nothing about a body that does not win the battle yet", () => {
    // Arming that one is `ko-reach-attachment`'s decision, and a K.O. that does
    // not exist yet is worth more than margin on one that does.
    const game = marginTurn();

    expect(scoreOf(game, "short")).toBe(undefined);
    expect(
      scoreOf(game, "short", createKoReachAttachmentModule()),
    ).toBeGreaterThan(0);
  });

  it("scores below every K.O. ko-reach can still complete", () => {
    const game = marginTurn();
    const margin = scoreOf(game, "beats-it") ?? 0;
    const completion =
      scoreOf(game, "short", createKoReachAttachmentModule()) ?? 0;

    expect(margin).toBeLessThan(completion);
  });

  it("leaves the Leader alone", () => {
    const game = marginTurn();

    expect(scoreOf(game, "p1-leader")).toBe(undefined);
  });

  it("does not start a margin the turn cannot finish", () => {
    // The margin is two DON!! wide, because one less leaves the K.O. to a
    // single 2000 Counter. With one DON!! in the cost area there is no margin
    // to buy, and the thousand is worth more on the Leader's swing.
    const game = marginTurn({ activeDon: 1 });

    expect(scoreOf(game, "beats-it")).toBe(undefined);
  });
});
