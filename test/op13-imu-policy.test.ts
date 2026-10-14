import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Black) Imu's rules: the Stage first, the Leader's payment, OP13-082's
 * board reset, and the opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const IMU = "(Black) Imu - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP13-079";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

function describeAction(action: LegalAction): string {
  if (action.type === "resolve-effect") return action.optionId;
  if (action.type === "activate-main")
    return `activate:${action.sourceInstanceId}`;
  if (action.type === "play-card") return `play:${action.cardInstanceId}`;
  return action.type;
}

const table = (seed: string) =>
  scenario()
    .decks(IMU, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withStage("p1", instance("throne", "OP13-099"));

describe("the Stage first", () => {
  it("plays the Elder through the Stage rather than paying for it", async () => {
    // Seven DON!!: Mars costs 6, so the ladder would pay six for it.
    const game = table("imu-throne-first")
      .withHand("p1", [instance("mars", "OP13-091")])
      .withDonDeck("p1", 3)
      .build();

    expect(describeAction(await chosen(game))).toBe("activate:throne");
    expect(describeAction(await chosen(game, ["op13-imu-throne"]))).toBe(
      "play:mars",
    );
  });

  it("does not spend the three DON!! the Stage needs on another card", async () => {
    // Five DON!!: Sabo costs 6 (the trash is empty), Shalria 1 -- playing
    // Shalria leaves four, still enough for the Stage, but the 4-cost Saturn
    // would leave one.
    const game = table("imu-throne-reserve")
      .withHand("p1", [
        instance("mars", "OP13-091"),
        instance("saturn", "OP13-083"),
      ])
      .withDonDeck("p1", 4)
      .build();

    const decision = describeAction(await chosen(game));
    expect(decision).not.toBe("play:saturn");
    expect(decision).not.toBe("play:mars");
  });

  it("plays the dearest Elder the Stage can reach", async () => {
    const game = table("imu-throne-pick")
      .withHand("p1", [
        instance("saturn", "OP13-083"),
        instance("mars", "OP13-091"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "throne" });
    if (
      game.state.pendingEffect &&
      describeAction(await chosen(game)) === "apply"
    ) {
      game.play({ type: "resolve-effect", optionId: "apply" });
    }

    expect(describeAction(await chosen(game))).toBe("mars");
  });
});

describe("the Stage in the mid game", () => {
  it("plays Mars over the dearer Ju Peter while Mars has a target", async () => {
    const game = table("imu-throne-mars")
      .withHand("p1", [
        instance("jupeter", "OP13-084"),
        instance("mars", "OP13-091"),
      ])
      .withBoard("p2", [character("target", "OP10-054")])
      .withDonDeck("p1", 3)
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "throne" });

    expect(describeAction(await chosen(game))).toBe("mars");
    expect(describeAction(await chosen(game, ["op13-imu-throne-mars"]))).toBe(
      "jupeter",
    );
  });

  it("plays Ju Peter when Mars has nothing to K.O.", async () => {
    const game = table("imu-throne-no-target")
      .withHand("p1", [
        instance("jupeter", "OP13-084"),
        instance("mars", "OP13-091"),
      ])
      .withBoard("p2", [character("big", "OP15-046")])
      .withDonDeck("p1", 3)
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "throne" });

    expect(describeAction(await chosen(game))).toBe("jupeter");
  });
});

describe("the Leader's draw", () => {
  it("pays with a spent Shalria, not the Elder beside it", async () => {
    const game = table("imu-leader-payment")
      .withBoard("p1", [
        character("mars", "OP13-091"),
        character("shalria", "OP13-086"),
      ])
      .withHand("p1", [instance("elders", "OP13-082")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });

    expect(describeAction(await chosen(game))).toBe("shalria");
    expect(describeAction(await chosen(game, ["op13-imu-leader"]))).toBe(
      "mars",
    );
  });

  it("is not taken when the only payments are an Elder and the finisher", async () => {
    const game = table("imu-leader-gate")
      .withBoard("p1", [character("mars", "OP13-091")])
      .withHand("p1", [instance("elders", "OP13-082")])
      // No active DON!!, so the activation is the ladder's first rung.
      .withDonDeck("p1", 10)
      .build();

    expect(describeAction(await chosen(game))).not.toBe("activate:p1-leader");
    expect(describeAction(await chosen(game, ["op13-imu-leader"]))).toBe(
      "activate:p1-leader",
    );
  });
});

describe("OP13-082's board reset", () => {
  const trash = (cards: readonly string[]) =>
    cards.map((cardNumber, index) => instance(`dead-${index}`, cardNumber));

  it("waits while the trash holds fewer Elders than the board it wipes", async () => {
    const game = table("imu-reset-thin")
      .withBoard("p1", [
        character("elders", "OP13-082", { rested: true }),
        character("shalria", "OP13-086", { rested: true }),
      ])
      .withRestedLeader("p1")
      .withHand("p1", [instance("fodder", "OP13-087")])
      .withTrash("p1", trash(["OP13-091", "OP13-083"]))
      .withDonDeck("p1", 9)
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "elders",
        ),
    ).toBe(true);
    expect(describeAction(await chosen(game))).not.toBe("activate:elders");
  });

  it("counts an Elder on the board, which the reset trashes before it plays", async () => {
    // Two names in the trash and Warcury on the board: three once the board
    // is trashed, against two bodies wiped.
    const game = table("imu-reset-board-names")
      .withBoard("p1", [
        character("elders", "OP13-082", { rested: true }),
        character("warcury", "OP13-089", { rested: true }),
      ])
      .withRestedLeader("p1")
      .withHand("p1", [instance("fodder", "OP13-087")])
      .withTrash("p1", trash(["OP13-091", "OP13-083"]))
      .withDonDeck("p1", 9)
      .build();

    expect(describeAction(await chosen(game))).toBe("activate:elders");
  });

  it("does not pay for a Character the reset is about to trash", async () => {
    // The Stage is spent, so its own rule does not hold the play first.
    const game = table("imu-reset-hold")
      .withStage("p1", { ...instance("throne", "OP13-099"), rested: true })
      .withBoard("p1", [character("elders", "OP13-082", { rested: true })])
      .withRestedLeader("p1")
      .withHand("p1", [
        instance("warcury", "OP13-089"),
        instance("fodder", "OP13-082"),
      ])
      .withTrash("p1", trash(["OP13-091", "OP13-083", "OP13-080"]))
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "play-card" && action.cardInstanceId === "warcury",
        ),
    ).toBe(true);
    expect(describeAction(await chosen(game))).toBe("activate:elders");
  });
});

describe("the opening hand", () => {
  it("keeps a hand with a digger and mulligans one without an opener", async () => {
    const keep = scenario()
      .decks(IMU, OPPONENT)
      .seed("imu-mulligan-keep")
      .withHand("p1", [
        instance("shalria", "OP13-086"),
        instance("elders-1", "OP13-082"),
        instance("elders-2", "OP13-082"),
        instance("mars", "OP13-091"),
        instance("never", "OP13-098"),
      ])
      .allowPartialState()
      .build();
    const kept = await chosen(keep);
    expect(kept.type === "mulligan-decision" && kept.decision).toBe("keep");

    const toss = scenario()
      .decks(IMU, OPPONENT)
      .seed("imu-mulligan-toss")
      .withHand("p1", [
        instance("elders-1", "OP13-082"),
        instance("elders-2", "OP13-082"),
        instance("mars", "OP13-091"),
        instance("nusjuro", "OP13-080"),
        instance("never", "OP13-098"),
      ])
      .allowPartialState()
      .build();
    const tossed = await chosen(toss);
    expect(tossed.type === "mulligan-decision" && tossed.decision).toBe(
      "mulligan",
    );
  });
});

describe("the hand-trash costs", () => {
  /** Mars paid for from hand, with its [On Play] offer open. */
  const marsPlayed = (seed: string, opponent: string) => {
    const game = table(seed)
      .withHand("p1", [
        instance("mars", "OP13-091"),
        instance("elders", "OP13-082"),
        instance("charlos", "OP13-087"),
      ])
      .withBoard("p2", [character("target", opponent)])
      .withDonDeck("p1", 3)
      .build();
    game.play({ type: "play-card", cardInstanceId: "mars" });
    return game;
  };

  it("pays Mars's K.O. with the spent digger, not the finisher", async () => {
    const game = marsPlayed("imu-discard", "OP10-054");
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(describeAction(await chosen(game))).toBe("charlos");
    expect(describeAction(await chosen(game, ["op13-imu-discard"]))).toBe(
      "elders",
    );
  });

  it("keeps the card when Mars has nothing in reach", async () => {
    const game = marsPlayed("imu-idle-removal", "OP15-046");

    expect(describeAction(await chosen(game))).toBe("skip");
    expect(describeAction(await chosen(game, ["op13-imu-idle-removal"]))).toBe(
      "apply",
    );
  });
});
