import { describe, expect, it } from "vitest";
import {
  createGame,
  createOnKoResult,
  hasOnPlayHandler,
  onPlayHandlerCards,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";

import { getMechanicSignalInvocations } from "../packages/engine-core/src/card-mechanics.js";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * `[On Play]` fires however the card reached the field.
 *
 * The bug this pins: a card played by the mechanic DSL's `play` node raised a
 * `card-played` signal that was only ever resolved against the DSL's own
 * `[On Play]` programs, so a card whose clause is one of the imperative
 * handlers -- ST31-001 Sanji among 38 others -- landed on the board with its
 * clause silently dropped. Played from hand, the same Sanji drew his card,
 * which is why it took a trace to see.
 */
describe("[On Play] across play paths", () => {
  covers("ST21-015", "[On K.O.]");

  it("fires an imperative clause for a card an effect put on the field", () => {
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("on-play-dispatch")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("zoro", "ST21-015")])
      .withHand("p1", [instance("sanji", "ST31-001")])
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    // ST21-015 Zoro: "[printed text omitted -- pnpm card:text ST21-015]" Sanji is red, 3000.
    const koResult = createOnKoResult(
      game.state,
      "p1",
      { instanceId: "zoro", cardNumber: "ST21-015" },
      "p1",
    );
    game.state.pendingEffect = koResult.pending;
    game.play({ type: "resolve-effect", optionId: "sanji" });

    expect(
      game.state.players.p1.board.map((entry) => entry.cardNumber),
    ).toContain("ST31-001");
    // ST31-001 Sanji: "[printed text omitted -- pnpm card:text ST31-001]" The draw is the half that needs no target to be observable.
    expect(game.state.players.p1.deck.length).toBe(deckBefore - 1);
  });

  it("reaches every imperative clause from a card-played signal", () => {
    // The ratchet. One lookup has to answer for both halves of `[On Play]`, so
    // a handler the signal cannot see is the bug this file exists for -- and it
    // was invisible per-card, because each of these cards has a passing test
    // that plays it from hand.
    const state = createGame({
      gameId: "on-play-dispatch-registry",
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "registry",
    });
    const unreachable = onPlayHandlerCards().filter((cardNumber) => {
      const invocations = getMechanicSignalInvocations(state, [
        {
          kind: "card-played",
          card: { instanceId: `probe-${cardNumber}`, cardNumber },
          playerId: "p1",
        },
      ]);
      return !invocations.some((invocation) => !("program" in invocation));
    });

    expect(unreachable).toEqual([]);
    expect(onPlayHandlerCards().every(hasOnPlayHandler)).toBe(true);
  });

  it("keeps the nested [On Play] with the player whose card it is", () => {
    // The trace: p2's attack K.O.s p1's Zoro, p1 answers the [On K.O.] with
    // Sanji, and Sanji's own "play up to 1" is then a choice that belongs to
    // p1 -- in the middle of p2's turn. An imperative clause reached this way
    // is parked in `pendingContinuations` and only takes the pending slot at
    // the very end of the action, which is after the point that restores the
    // interrupted turn: the decision landed with `activePlayer` back on p2,
    // and p2's controller answered a prompt out of p1's hand.
    const game = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Red) Monkey.D.Luffy - Starter Deck 31",
      )
      .seed("nested-on-play-chooser")
      .atTurn(4, { active: "p2" })
      .withBoard("p1", [character("zoro", "ST21-015")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withHand("p1", [
        instance("sanji", "ST31-001"),
        instance("jinbe", "ST31-002"),
        instance("brook", "ST31-003"),
      ])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "zoro",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "pass" });
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    expect(game.state.activePlayer).toBe("p1");

    game.play({ type: "resolve-effect", optionId: "sanji" });

    // Sanji is on the field and his clause is waiting on p1, not resolved by
    // whoever happens to be holding the turn.
    expect(game.state.pendingEffect?.kind).toBe("free-play");
    expect(game.state.pendingEffect?.playerId).toBe("p1");
    expect(game.state.activePlayer).toBe("p1");
    expect(game.summaries("p1")).toContain("Play Jinbe for free");
    expect(game.legalActions("p2")).toEqual([]);

    // And the turn goes back to p2 once p1 has answered it.
    game.play({ type: "resolve-effect", optionId: "brook" });
    expect(game.state.activePlayer).toBe("p2");
    expect(game.state.phase).toBe("main");
  });
});
