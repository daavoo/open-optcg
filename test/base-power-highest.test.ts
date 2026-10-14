import { describe, expect, it } from "vitest";
import { currentPower } from "@one-piece-sim/engine-core";
import type { PublicEvent } from "@one-piece-sim/protocol";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Comprehensive Rules 4-9-2-1: "If there are several effects that set a base
 * power to a certain value, and those effects all affect the same card, if the
 * values differ, apply the effect with the highest value."
 *
 * Bandai's OP17 Q&A rules both directions on the Leader: OP17-008 Jozu's 8000
 * lifts a Leader whose base power another effect already set to 7000, and
 * OP17-043 Ganzui's 6000 leaves that 7000 in place. The 7000 here is EB04-004
 * Zeff's, which sets it on any Leader until the end of the opponent's next End
 * Phase -- the same duration Jozu and Ganzui print.
 *
 * Because the highest *live* setter applies rather than the latest, a lower
 * one that outlasts a higher one takes over when the higher one lapses. The
 * Character case pins that half: every Leader setter in the pool that could
 * sit under a shorter one ends at the same End Phase as it.
 */

const DECK = "(Red) Edward.Newgate - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** p1 on OP17-001 Edward.Newgate (a 5000), in its own Main Phase. */
const table = (seed: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLife("p2", copies(3, "ST31-003", "p2-life"))
    .withDeckTop("p1", copies(3, "ST31-003", "p1-deck"))
    .withDeckTop("p2", copies(3, "ST31-003", "p2-deck"));

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: Game) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Run the defence out: no block, no Counter, the Life card to hand. */
function declineDefence(game: Game) {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
  for (const player of ["p1", "p2"] as const) {
    const offered = game
      .legalActions(player)
      .find(
        (action) =>
          action.type === "resolve-trigger" &&
          action.summary.includes("Add Life card to hand"),
      );
    if (offered) {
      game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
      return;
    }
  }
}

/** Swing EB04-004 Zeff at the opposing Leader: p1's Leader becomes 7000. */
function zeffSetsSeven(game: Game) {
  game.play({
    type: "attack",
    attackerInstanceId: "zeff",
    targetInstanceId: "p2-leader",
  });
  settle(game);
  declineDefence(game);
  expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);
}

function basePowerEvents(
  game: Game,
): Extract<PublicEvent, { type: "base-power-set" }>[] {
  return game.state.events.filter(
    (event): event is Extract<PublicEvent, { type: "base-power-set" }> =>
      event.type === "base-power-set",
  );
}

describe("rule 4-9-2-1: the highest base-power setter applies", () => {
  covers("EB04-004", "[When Attacking]");

  describe("OP17-043 Ganzui", () => {
    covers("OP17-043", "[On Play]");

    it("leaves a Leader another effect set to 7000 at 7000", () => {
      const game = table("base-power-ganzui-under-7000")
        .withBoard("p1", [character("zeff", "EB04-004", { playedTurn: 1 })])
        .withHand("p1", [instance("ganzui", "OP17-043")])
        .build();

      zeffSetsSeven(game);
      game.play({ type: "play-card", cardNumber: "OP17-043" });
      settle(game);

      expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);
      // The event says the 6000 was outranked rather than announcing a base
      // the board is not at.
      expect(basePowerEvents(game).at(-1)).toMatchObject({
        sourceCardNumber: "OP17-043",
        basePower: 6_000,
        outrankedBy: 7_000,
      });

      // Both last until the end of p2's turn, so the 7000 still wins there.
      game.pass();
      expect(game.state.activePlayer).toBe("p2");
      expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);

      // Past both windows, printed power again, with nothing left stored on
      // the Leader.
      game.pass();
      expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
      expect(game.state.players.p1.leaderBasePowers).toBeUndefined();
    });
  });

  describe("OP17-008 Jozu", () => {
    covers("OP17-008", "[On Play]");

    it("lifts a Leader another effect set to 7000 to 8000", () => {
      const game = table("base-power-jozu-over-7000")
        .withBoard("p1", [character("zeff", "EB04-004", { playedTurn: 1 })])
        .withHand("p1", [instance("jozu", "OP17-008")])
        .build();

      zeffSetsSeven(game);
      game.play({ type: "play-card", cardNumber: "OP17-008" });
      settle(game);

      expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);
      const jozu = basePowerEvents(game).at(-1);
      expect(jozu).toMatchObject({
        sourceCardNumber: "OP17-008",
        basePower: 8_000,
      });
      expect(jozu).not.toHaveProperty("outrankedBy");
    });

    it("keeps 8000 when a 7000 resolves after it", () => {
      const game = table("base-power-jozu-then-zeff")
        .withBoard("p1", [character("zeff", "EB04-004", { playedTurn: 1 })])
        .withHand("p1", [instance("jozu", "OP17-008")])
        .build();

      game.play({ type: "play-card", cardNumber: "OP17-008" });
      settle(game);
      expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);

      game.play({
        type: "attack",
        attackerInstanceId: "zeff",
        targetInstanceId: "p2-leader",
      });
      settle(game);
      declineDefence(game);

      expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);
      expect(basePowerEvents(game).at(-1)).toMatchObject({
        sourceCardNumber: "EB04-004",
        basePower: 7_000,
        outrankedBy: 8_000,
      });
      game.pass();
      expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);
    });
  });

  describe("on a Character", () => {
    covers("OP16-106", "[Trigger]");
    covers("OP06-009", "[On Block]");

    it("keeps the higher of two setters, then the lower once it lapses", () => {
      // p2's turn. OP16-106's Trigger sets Shuraiya to 7000 for this turn;
      // Shuraiya's own [On Block] then copies the opposing Leader's 5000
      // through p1's next turn. 7000 is the higher, so it applies now; on p1's
      // turn only the 5000 is left, and it -- not the printed 4000 -- applies.
      const game = scenario()
        .decks(DECK, OPPONENT)
        .seed("base-power-character-setters")
        .atTurn(12, { active: "p2" })
        .bareTable()
        // OP16-106's Trigger asks for a {Blackbeard Pirates} Leader.
        .withLeader("p1", "OP16-080")
        .withBoard("p1", [character("shuraiya", "OP06-009")])
        .withBoard("p2", [
          character("first", "ST31-003", { playedTurn: 1 }),
          character("second", "ST31-003", { playedTurn: 1 }),
        ])
        .withGivenDon("p2", "first", 2)
        .withLife("p1", [
          instance("life-wolf", "OP16-106"), // the top card
          instance("life-under", "ST31-003"),
        ])
        .build();

      game.play({
        type: "attack",
        attackerInstanceId: "first",
        targetInstanceId: "p1-leader",
      });
      while (game.state.phase === "block" || game.state.phase === "counter") {
        game.pass();
      }
      game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
      game.play({ type: "resolve-effect", optionId: "shuraiya" });
      settle(game);
      expect(currentPower(game.state, "p1", "shuraiya")).toBe(7_000);

      game.play({
        type: "attack",
        attackerInstanceId: "second",
        targetInstanceId: "p1-leader",
      });
      game.play({ type: "block", blockerInstanceId: "shuraiya" });
      settle(game);
      declineDefence(game);

      expect(currentPower(game.state, "p1", "shuraiya")).toBe(7_000);

      game.pass();
      expect(game.state.activePlayer).toBe("p1");
      expect(currentPower(game.state, "p1", "shuraiya")).toBe(5_000);
    });
  });
});
