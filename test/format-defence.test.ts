/**
 * The format rules about defending.
 *
 * One of the files `format-heuristics.ts` is the map of -- see that file for
 * what lives where. A test belongs beside the rule it drives.
 */
import { describe, expect, it } from "vitest";
import { St31RulesAgent, tactics } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, copies, scenario } from "./support/index.js";
import { blankState, view } from "./format-support.js";

describe("Counter threshold arithmetic", () => {
  const t = tactics(view(blankState()));

  it("puts the thresholds where whole Counter cards are added", () => {
    // Against a 5000 Leader: 5000 and 6000 both cost one card, 7000 costs two,
    // 9000 costs three. Those are the numbers the human-test analysis names.
    expect(t.cardsToSurviveLeaderHit(5_000)).toBe(1);
    expect(t.cardsToSurviveLeaderHit(6_000)).toBe(1);
    expect(t.cardsToSurviveLeaderHit(7_000)).toBe(2);
    expect(t.cardsToSurviveLeaderHit(8_000)).toBe(2);
    expect(t.cardsToSurviveLeaderHit(9_000)).toBe(3);
  });

  it("makes the value of one DON!! depend on where it lands", () => {
    const gain = (power: number) =>
      t.cardsToSurviveLeaderHit(power + 1_000) -
      t.cardsToSurviveLeaderHit(power);
    // The whole point: the same DON!! is worth a card on a 6000 body and
    // nothing on a 5000 one. Attack counts cannot express this difference.
    expect(gain(6_000)).toBe(1);
    expect(gain(5_000)).toBe(0);
    expect(gain(8_000)).toBe(1);
    expect(gain(7_000)).toBe(0);
  });

  it("charges nothing for an attack the defender already survives", () => {
    expect(t.cardsToSurviveLeaderHit(4_000)).toBe(0);
  });
});

/**
 * A turn-6 ST31 position with a battle in progress against p1's Leader.
 *
 * ST31 has no Blocker of its own, so the Blockers here are foreign cards; the
 * `[Blocker]` window is decided off `observe()`'s `blocker` flag and printed
 * power, neither of which cares which deck the card came from.
 */
function blockWindow(options: {
  life: number;
  selfBoard: ReturnType<typeof character>[];
  opponentBoard?: ReturnType<typeof character>[];
  attackPower: number;
  /** Whether the attacking Leader has been spent on this attack. */
  leaderSpent?: boolean;
}) {
  const rest = (game: ReturnType<typeof scenario>) =>
    options.leaderSpent ? game.withRestedLeader("p2") : game;
  return rest(
    scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Blue) Kuzan - Starter Deck 33",
      )
      .seed("format-block")
      .bareTable()
      .atTurn(6, { active: "p2" })
      .withLife("p1", copies(options.life, "OP11-003", "p1-life"))
      .withLife("p2", copies(4, "OP11-003", "p2-life"))
      .withBoard("p1", options.selfBoard)
      .withBoard("p2", options.opponentBoard ?? [])
      .withActiveAttack({
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "p2-leader",
        targetInstanceId: "p1-leader",
        attackPower: options.attackPower,
        counterPower: 0,
      }),
  ).build();
}

/**
 * Two plain Blockers, 1000 and 4000. Brulee's printed text is the `[Blocker]`
 * keyword and nothing else, so a test that puts her on the board is posing a
 * power question and no other.
 */
const SMALL_BLOCKER = "OP17-012";

const BIG_BLOCKER = "OP17-108";

describe("choosing which Blocker to spend", () => {
  it("blocks with the Blocker that survives, not the cheapest body", async () => {
    // Life 1 plus a second attacker that can still swing makes the block
    // mandatory, so `chooseGenericBlock` is past deciding *whether* to block
    // and is only choosing *which*. The 4000 outlives the 3000 attack and the
    // 1000 does not, and the old `currentPower` ascending sort took the 1000
    // -- same hit stopped, one fewer Blocker on the board next turn.
    const game = blockWindow({
      life: 1,
      selfBoard: [
        character("small", SMALL_BLOCKER),
        character("big", BIG_BLOCKER),
      ],
      opponentBoard: [character("second-attacker", "OP12-023")],
      attackPower: 3_000,
    });
    const observation = observe(game.state, "p1");
    expect(
      observation.legalActions.filter((action) => action.type === "block"),
    ).toHaveLength(2);

    const action = await new St31RulesAgent().chooseAction(observation);

    expect(action).toMatchObject({ type: "block", blockerInstanceId: "big" });
  });

  it("falls back to the cheapest body when no Blocker survives the hit", async () => {
    // The same forced block against 5000, which both Blockers lose to. With no
    // survivor to prefer, spending the smaller one is still right.
    const game = blockWindow({
      life: 1,
      selfBoard: [
        character("small", SMALL_BLOCKER),
        character("big", BIG_BLOCKER),
      ],
      opponentBoard: [character("second-attacker", "OP12-023")],
      attackPower: 5_000,
    });

    const action = await new St31RulesAgent().chooseAction(
      observe(game.state, "p1"),
    );

    expect(action).toMatchObject({ type: "block", blockerInstanceId: "small" });
  });

  it("takes a free block for a deck outside sealed", async () => {
    // `free-block` used to be registered for `SEALED-LUFFY` alone. Nothing in
    // it is about sealed: the Leader has already swung and nothing else can,
    // so the 4000 Blocker absorbs a 3000 hit, survives, and rests -- which the
    // Refresh Phase gives straight back. ST31 is a constructed deck, so this
    // fails if the rule is ever narrowed back to one registration.
    const game = blockWindow({
      life: 4,
      selfBoard: [character("big", BIG_BLOCKER)],
      attackPower: 3_000,
      leaderSpent: true,
    });
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "block", blockerInstanceId: "big" });
    expect(agent.lastDecision?.moduleId).toBe("free-block");
  });

  it("still preserves a Blocker that would die for a survivable hit", async () => {
    // The gate the free-block rule does not cross: the 1000 cannot survive, so
    // there is nothing free about this block and 4 Life can absorb the hit.
    const game = blockWindow({
      life: 4,
      selfBoard: [character("small", SMALL_BLOCKER)],
      attackPower: 3_000,
      leaderSpent: true,
    });
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(game.state, "p1"));

    expect(action.type).toBe("pass");
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "Preserve Blockers",
    );
  });
});
