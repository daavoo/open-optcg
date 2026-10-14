import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  nextInt,
  seedRng,
} from "@one-piece-sim/engine-core";
import { deckManifests, resolveDeck } from "@one-piece-sim/decks";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * An `instanceId` as it appears in a state: `p1-leader`, `p2-card-17`.
 *
 * Bookkeeping, not language. It identifies a card to the engine and says nothing
 * to whoever is choosing -- not which card, not whose, not how big. Attacks and
 * blocks have named their targets through `actionCardLabel` for a long time;
 * four other offers interpolated the raw id, and the trigger offers were the
 * worst of them, because the removal triggers target *both* boards and the id
 * was the only thing distinguishing "bounce their 6000" from "bounce mine".
 */
const INSTANCE_ID = /\bp[12]-(?:leader|card-\d+)\b/;

/**
 * The gate: no offer, anywhere, names a card by its id.
 *
 * A random walk rather than a list of positions, because the point is coverage
 * of the offer *generators* -- and a new one that interpolates an id should fail
 * here without anyone having thought to add a case for it. Seeded and stepped
 * with the engine's own RNG, so a failure is reproducible from the seed printed
 * with it.
 */
describe("legal action summaries", () => {
  const deckIds = Object.keys(deckManifests);

  it("never names a card by its instance id", () => {
    const offenders = new Map<string, string>();
    for (const [index, p1Deck] of deckIds.entries()) {
      const p2Deck = deckIds[(index + 1) % deckIds.length]!;
      for (const seed of ["summaries-a", "summaries-b"]) {
        let state = createGame({
          gameId: `summaries-${String(index)}-${seed}`,
          p1: resolveDeck(p1Deck),
          p2: resolveDeck(p2Deck),
          seed,
          startingPlayer: "p1",
        });
        let rng = seedRng(seed);
        for (
          let step = 0;
          step < 300 && state.phase !== "finished";
          step += 1
        ) {
          const legal = getLegalActions(state, state.activePlayer);
          if (legal.length === 0) break;
          for (const action of legal) {
            const leak = INSTANCE_ID.exec(action.summary);
            if (leak) {
              offenders.set(
                `${action.type} ${action.summary}`,
                `${p1Deck} vs ${p2Deck} seed=${seed}`,
              );
            }
          }
          const choice = nextInt(rng, legal.length);
          rng = choice.state;
          state = applyAction(state, {
            ...legal[choice.value]!,
            revision: state.revision,
          }).state;
        }
      }
    }
    expect([...offenders]).toEqual([]);
  });
});

/**
 * The trace this came from: the defender resolved OP04-016's `-3000 during this
 * turn` onto a Character the attacker had played that same turn, while the
 * attacker's Leader had already swung -- so the reduction expired without ever
 * being read, and the option it was chosen over adds a free 0-cost [Counter] to
 * hand.
 *
 * Everything needed was in the observation (`summoningSick`, the rested Leader)
 * and the prompt already states the rule. What was missing was the join, at the
 * one moment it mattered, on the offer itself -- which is where attacks have
 * carried `counterShortfall` and `donToReach` all along.
 */
describe("[Trigger] offers state what the target can still do", () => {
  covers("OP04-016", "[Trigger]");

  /**
   * p1 has swung with its Leader and played a body the same turn; p2's only Life
   * card is the Trigger about to come off it.
   *
   * The Character is placed rather than played so the position is exact, and
   * `playedTurn` is the current turn because that -- not the card -- is what
   * makes it summoning-sick.
   */
  function debuffAfterTheAttack(playedTurn: number, leaderRested: boolean) {
    const game = scenario()
      .decks(
        "(Green) Roronoa Zoro - Starter Deck 32",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("trigger-summary")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [
        character("mihawk", "ST32-003", { playedTurn }),
        character("rayleigh", "ST32-004", { playedTurn: 1 }),
      ])
      .withDeckTop("p2", [instance("kick-course", "OP04-016")])
      .withLife("p2", 1);
    return (leaderRested ? game.withRestedLeader("p1") : game)
      .withActiveAttack({
        attackerPlayerId: "p1",
        defenderPlayerId: "p2",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "p2-leader",
        attackPower: 6_000,
        counterPower: 0,
      })
      .build();
  }

  /** Resolves the fabricated battle, which is what reveals the Trigger. */
  function summariesAtTheTrigger(
    game: ReturnType<typeof debuffAfterTheAttack>,
  ) {
    game.play({ type: "pass", summary: "Do not block" });
    game.play({ type: "pass" });
    expect(game.state.phase).toBe("trigger");
    return game.summaries();
  }

  it("says a summoning-sick target cannot attack, so the reduction expires unread", () => {
    const summaries = summariesAtTheTrigger(debuffAfterTheAttack(3, true));
    const sick = summaries.find((summary) => summary.includes("ST32-003"));
    expect(sick).toBeDefined();
    expect(sick).toContain("the opponent's");
    expect(sick).toContain("Dracule Mihawk");
    expect(sick).toContain("it cannot attack this turn");
    // The fact, and only the fact. This used to append "so only an effect that
    // measures its power before the turn ends will read the change" -- a
    // sentence of rules exposition on every one of four buttons.
    expect(sick).not.toContain("so only an effect");
    // The Leader swung already, so it is the same story -- and it is the option
    // a pilot reaching for "hit the biggest thing" takes first.
    const leader = summaries.find((summary) => summary.includes("Leader"));
    expect(leader).toContain("it cannot attack this turn");
    // The alternative the trace passed over.
    expect(summaries).toContain("Add Life card to hand");
  });

  it("says so of a target that can still attack", () => {
    const summaries = summariesAtTheTrigger(debuffAfterTheAttack(1, false));
    const live = summaries.find((summary) => summary.includes("ST32-003"));
    expect(live).toContain("it can still attack this turn");
    expect(live).not.toContain("cannot attack");
  });

  /**
   * The reduction is worth having when it lands on something that will swing
   * again, and the two offers have to be told apart at the same decision -- a
   * board where one body is sick and another is not is the position where the
   * old summary said `p1-card-2` and `p1-card-3`.
   */
  it("tells two targets on the same board apart", () => {
    const summaries = summariesAtTheTrigger(debuffAfterTheAttack(3, true));
    const sick = summaries.find((summary) => summary.includes("ST32-003"))!;
    const ready = summaries.find((summary) => summary.includes("ST32-004"))!;
    expect(sick).toContain("it cannot attack this turn");
    expect(ready).toContain("it can still attack this turn");
  });
});
