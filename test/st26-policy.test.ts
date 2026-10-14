import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * ST-26's deck policy.
 *
 * One judgement, and it is the deck's whole plan: how many DON!! a "return 1
 * or more" clause sends back. OP09-061's Leader refunds two DON!! for a return
 * of "2 or more", so returning the printed floor of one pays a card and buys
 * nothing -- and the floor is exactly what an unpiloted seat takes, because it
 * is the first option the engine offers.
 *
 * The test poses the decision and asserts the *chosen action*, not the game it
 * leads to: what is being pinned is that the seat reaches for two, and a
 * win-rate test could go on passing while the branch that picks it stopped
 * firing.
 */

const ST26 = "(Purple/Black) Monkey.D.Luffy - Starter Deck 26";
/** Katakuri, so nothing in the field intercepts ahead of the deck module. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP09-061";

/** ST-26 in its own Main Phase with a "return 1 or more" body in hand. */
const posed = (seed: string, cardNumber: string) =>
  scenario()
    .decks(ST26, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .withHand("p1", [instance("body", cardNumber)])
    .withDonDeck("p1", 4)
    .build();

/** What the deck's own agent picks from the options actually on offer. */
async function chosen(
  game: ReturnType<typeof posed>,
  disable: readonly string[] = [],
) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

describe("ST-26 returns two DON!!, not the printed floor", () => {
  covers("OP09-076", "[On Play]");

  it("takes the count the Leader's refund answers", async () => {
    const game = posed("st26-policy-zoro", "OP09-076");
    game.play({ type: "play-card", cardNumber: "OP09-076" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    const action = await chosen(game);
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option).toEqual({ kind: "don-return-count", count: 2 });
  });

  it("takes the floor once the rule is disabled, which is the bug it fixes", async () => {
    const game = posed("st26-policy-zoro-off", "OP09-076");
    game.play({ type: "play-card", cardNumber: "OP09-076" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    const action = await chosen(game, ["st26-luffy#return-count"]);
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    // The first option offered, and the one count OP09-061 cannot answer.
    expect(action.option).toEqual({ kind: "don-return-count", count: 1 });
  });

  it("prefers two over every larger count, not merely over one", async () => {
    // The rule scores every candidate rather than only the one it likes: a
    // `rankAmong` that scored just `return:2` would leave 3..8 in the running
    // for the generic ladder to take first-offered. Nine DON!! on the field
    // here, so there are plenty of larger counts to be wrong about.
    const game = posed("st26-policy-nami", "OP09-070");
    game.play({ type: "play-card", cardNumber: "OP09-070" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    const action = await chosen(game);
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option).toEqual({ kind: "don-return-count", count: 2 });
  });

  it("steps aside once the Leader's refund has already paid this turn", async () => {
    // The half the observation field was added for. OP09-061 answers "2 or
    // more DON!! returned" once a turn; after it has paid, returning two costs
    // a full extra DON!! for exactly the payoff returning one buys, so the
    // printed floor becomes correct and this rule has to stop asking for two.
    const game = scenario()
      .decks(ST26, OPPONENT)
      .seed("st26-policy-refund-spent")
      .atTurn(11, { active: "p1" })
      .withHand("p1", [
        instance("first", "OP09-076"),
        instance("second", "OP09-070"),
      ])
      .withDonDeck("p1", 6)
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-076" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(observe(game.state, "p1").self.leader.leaderReactionSpent).toBe(
      false,
    );
    game.play({ type: "resolve-effect", optionId: "return:2" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    expect(observe(game.state, "p1").self.leader.leaderReactionSpent).toBe(
      true,
    );

    game.play({ type: "play-card", cardNumber: "OP09-070" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    const action = await chosen(game);
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option).toEqual({ kind: "don-return-count", count: 1 });
  });

  it("still returns two with a body already out, so the rule is not board-gated", async () => {
    const game = scenario()
      .decks(ST26, OPPONENT)
      .seed("st26-policy-board")
      .atTurn(11, { active: "p1" })
      .withHand("p1", [instance("body", "OP09-076")])
      .withBoard("p1", [character("brook", "ST14-010")])
      .withDonDeck("p1", 4)
      .build();
    game.play({ type: "play-card", cardNumber: "OP09-076" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    const action = await chosen(game);
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    expect(action.option).toEqual({ kind: "don-return-count", count: 2 });
  });
});

/**
 * OP05-119, the extra-turn finisher, comes after the board has swung.
 *
 * Its `[On Play]` buries every other Character, so an attack not made before
 * it is cast is lost. The generic ladder develops before it attacks and casts
 * the dearest card first -- the finisher, with the board it buries unspent.
 * ST-26 does not run the card; the maintainer's list on the same Leader does,
 * and the engine resolves its text whoever holds it.
 */
describe("OP09-061 attacks before casting OP05-119", () => {
  const finisherTurn = (seed: string) =>
    scenario()
      .decks(ST26, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .withHand("p1", [instance("finisher", "OP05-119")])
      .withBoard("p1", [character("zoro", "OP09-076")])
      .withDonDeck("p1", 0)
      .build();

  it("swings first while the finisher is castable", async () => {
    const game = finisherTurn("st26-policy-finisher");
    const offered = observe(game.state, "p1").legalActions;
    expect(
      offered.some(
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "finisher",
      ),
    ).toBe(true);

    const action = await chosen(game);
    expect(action.type).toBe("attack");
  });

  it("casts it first once the rule is disabled, which is the bug it fixes", async () => {
    const game = finisherTurn("st26-policy-finisher-off");
    const action = await chosen(game, [
      "st26-luffy#finisher-last",
      "st26-luffy#finisher-last-attack",
    ]);
    expect(action.type).toBe("play-card");
  });

  it("casts it once nothing is left to attack with", async () => {
    const game = scenario()
      .decks(ST26, OPPONENT)
      .seed("st26-policy-finisher-spent")
      .atTurn(11, { active: "p1" })
      .withHand("p1", [instance("finisher", "OP05-119")])
      .withBoard("p1", [character("zoro", "OP09-076", { rested: true })])
      .withRestedLeader("p1")
      .withDonDeck("p1", 0)
      .build();

    const action = await chosen(game);
    expect(action.type).toBe("play-card");
  });
});

describe("OP09-061 keeps an opening hand on Zoro", () => {
  // OP09-076 Roronoa Zoro is the same opening turn as ST26-002 and ST26-003:
  // three DON!!, a return of two the Leader refunds, and a DON!! back. A hand
  // whose one early play is Zoro is a hand with a turn-two play.
  const opening = (third: string) =>
    scenario()
      .decks(ST26, OPPONENT)
      .seed("st26-policy-mulligan")
      .withHand("p1", [
        instance("early", third),
        instance("a", "ST26-005"),
        instance("b", "OP09-077"),
        instance("c", "OP09-078"),
        instance("d", "ST26-004"),
      ])
      .build();
  const decisionOf = (action: { type: string; decision?: string }) =>
    action.type === "mulligan-decision" ? action.decision : action.type;

  it("keeps on Zoro and ships the same hand without it", async () => {
    expect(decisionOf(await chosen(opening("OP09-076")))).toBe("keep");
    expect(decisionOf(await chosen(opening("OP05-065")))).toBe("mulligan");
  });
});

describe("OP09-061 holds Nico Robin as a Counter", () => {
  // ST26-003 and OP09-076 make the same play; only Robin prints a Counter, so
  // the seat ramps with Zoro and keeps Robin's 2000 in hand.
  const robinTurn = (seed: string) =>
    scenario()
      .decks(ST26, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .withHand("p1", [instance("robin", "ST26-003")])
      .withDonDeck("p1", 7)
      .build();
  const playsRobin = (action: { type: string; cardInstanceId?: string }) =>
    action.type === "play-card" && action.cardInstanceId === "robin";

  it("does not cast her", async () => {
    const game = robinTurn("st26-policy-robin");
    expect(
      observe(game.state, "p1").legalActions.some((action) =>
        playsRobin(action),
      ),
    ).toBe(true);
    expect(playsRobin(await chosen(game))).toBe(false);
  });

  it("casts her once the rule is disabled, which is what it changes", async () => {
    const game = robinTurn("st26-policy-robin-off");
    expect(playsRobin(await chosen(game, ["st26-luffy#hold-robin"]))).toBe(
      true,
    );
  });
});
