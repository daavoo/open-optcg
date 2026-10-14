import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { instance, scenario } from "./support/index.js";

/**
 * (Yellow) Charlotte Linlin's two Leader rules.
 *
 * Both answer one clause -- OP17-099's "[When Attacking] You may
 * trash 1 card from your hand" -- which `pnpm census` reads as 20.2 of the
 * deck's 32.6 `main:resolve-effect` decisions a game. Each case is pinned
 * twice where the default differs: once as the decision the seat makes, and
 * once with the module disabled, so the test states what the generic ladder
 * would have done as well as what the rule does. The deck's opening hand is
 * not here because it has no rule: OP17-099 is on the generic keep, which
 * `test/mulligan.test.ts` holds.
 */

const LINLIN = "(Yellow) Charlotte Linlin - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP17-099";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(game: Game, disable: readonly string[] = []) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

/** Which half of the Leader's optional trash the seat takes. */
async function taken(
  game: Game,
  disable: readonly string[] = [],
): Promise<"apply" | "skip" | "other"> {
  const action = await chosen(game, disable);
  if (action.type !== "resolve-effect") return "other";
  if (action.option.kind === "skip") return "skip";
  return action.option.kind === "confirm" && action.option.choice === "apply"
    ? "apply"
    : "other";
}

/**
 * The Linlin seat mid-attack, stopped at the Leader's optional trash.
 *
 * `hand` and `life` are the two game states the rules read, so both are named
 * per position rather than left to the deal.
 */
function atTheLeaderClause(
  seed: string,
  hand: readonly string[],
  life: number,
): Game {
  const game = scenario()
    .decks(LINLIN, OPPONENT)
    .seed(seed)
    .atTurn(9, { active: "p1" })
    .withHand(
      "p1",
      hand.map((cardNumber, index) => instance(`hand-${index}`, cardNumber)),
    )
    .withLife("p1", life)
    .build();
  game.play({ type: "attack", targetInstanceId: "p2-leader" });
  return game;
}

describe("the Leader's [When Attacking] is a trade, not a free action", () => {
  it("declines it on a hand of three, where the generic ladder pays", async () => {
    const game = atTheLeaderClause(
      "linlin-floor",
      ["OP17-107", "OP17-113", "ST20-003"],
      3,
    );

    expect(await taken(game)).toBe("skip");
    expect(await taken(game, ["op17-linlin#leader-hand-floor"])).toBe("apply");
  });

  it("pays it on a hand the clause can afford", async () => {
    const game = atTheLeaderClause(
      "linlin-afford",
      ["OP17-107", "OP17-113", "ST20-003", "OP17-104", "OP17-102"],
      3,
    );

    expect(await taken(game)).toBe("apply");
  });
});

describe("which card pays the Leader's cost", () => {
  it("pays with the body whose whole text is its [Trigger], not the 10-cost aura", async () => {
    const game = atTheLeaderClause(
      "linlin-pitch",
      ["OP17-112", "OP17-115", "OP17-107", "OP17-113", "OP17-109"],
      3,
    );
    // Accept the optional trash; the next decision is which card pays it.
    game.submit(await chosen(game));

    const paying = await chosen(game);

    expect(paying.type).toBe("resolve-effect");
    expect(paying.summary).toContain("Daifuku");
  });
});
