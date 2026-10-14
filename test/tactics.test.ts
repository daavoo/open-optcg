import { describe, expect, it } from "vitest";
import {
  archetypeOf,
  attacksAreLethal,
  incomingLeaderDamages,
  registeredDecks,
  tactics,
  tacticsFor,
} from "@one-piece-sim/agents/local";
import {
  applyAction,
  createGame,
  getLegalActions,
  observe,
  toGameAction,
  type GameState,
} from "@one-piece-sim/engine-core";
import {
  SELECTABLE_DECK_IDS,
  deckManifests,
  resolveDeck,
} from "@one-piece-sim/decks";
import type { GameObservation } from "@one-piece-sim/protocol";

/**
 * Walks a real game and hands every observation to a checker.
 *
 * The derived facts in `Tactics` are only worth having if they hold against
 * states the engine actually produces, so nothing here builds an observation by
 * hand.
 */
function sweep(
  p1Deck: string,
  p2Deck: string,
  seed: string,
  check: (observation: GameObservation) => void,
): number {
  let state: GameState = createGame({
    gameId: `tactics-${p1Deck}-${p2Deck}`,
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed,
  });
  let seen = 0;
  for (let step = 0; step < 400; step += 1) {
    const seat = state.activePlayer;
    const actions = getLegalActions(state, seat);
    if (actions.length === 0) break;
    check(observe(state, seat));
    seen += 1;
    const chosen = actions[0]!;
    if (state.phase === "finished") break;
    state = applyAction(state, toGameAction(chosen, state.revision)).state;
  }
  return seen;
}

describe("archetype coverage", () => {
  it("classifies every deck that registers a policy", () => {
    const decks = registeredDecks();
    expect(decks.length).toBeGreaterThan(5);
    const unknown = decks.filter((leader) => archetypeOf(leader) === "unknown");

    // `opponentArchetype` is how a matchup rule says "against aggro" without
    // naming Leaders. A registered deck missing from the table silently reads as
    // "unknown" to every such rule, so the rule quietly stops applying.
    expect(unknown).toEqual([]);
  });

  it("classifies the Leader of every selectable deck", () => {
    expect(SELECTABLE_DECK_IDS.length).toBeGreaterThan(5);
    const unknown = SELECTABLE_DECK_IDS.filter(
      (deck) => archetypeOf(deckManifests[deck]!.leader) === "unknown",
    );
    expect(unknown).toEqual([]);
  });
});

describe("derived tactics facts", () => {
  // The seed is fixed rather than derived from the deck names, so which real
  // games this sweep covers does not shift the next time a deck id changes.
  const pairs: ReadonlyArray<readonly [string, string, string]> = [
    [
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Purple) Charlotte Katakuri - Starter Deck 34",
      "tactics-ST31",
    ],
    [
      "(Blue) Kuzan - Starter Deck 33",
      "(Yellow) Eustass Kid - Starter Deck 36",
      "tactics-ST33",
    ],
    [
      "(Purple) Enel - Official Feature Deck",
      "(Green) Roronoa Zoro - Starter Deck 32",
      "tactics-OP16-ENEL-SHONEN",
    ],
    [
      "(Blue/Yellow) Nami - Official Feature Deck",
      "(Red/Black) Sabo - Starter Deck 35",
      "tactics-OP16-NAMI-6738",
    ],
  ];

  it("holds its invariants across real games", () => {
    let observations = 0;
    for (const [left, right, seed] of pairs) {
      observations += sweep(left, right, seed, (observation) => {
        const t = tactics(observation);

        // A player owns exactly ten DON!! and everything on the field refreshes,
        // so next turn is never worse than this turn and never above the cap.
        expect(t.donNextTurn).toBeGreaterThanOrEqual(t.donOnField);
        expect(t.donNextTurn).toBeLessThanOrEqual(10);

        // Leader hits are a subset of viable attacks.
        expect(t.maxLeaderHits).toBeLessThanOrEqual(t.viableAttacks.length);
        expect(t.leaderAttacks.length).toBe(t.maxLeaderHits);

        // The threat count cannot exceed the opposing Leader plus their board.
        expect(t.incomingLeaderAttacks).toBeGreaterThanOrEqual(0);
        expect(t.incomingLeaderAttacks).toBeLessThanOrEqual(
          observation.opponent.board.length + 1,
        );
        // Priced in Life and in attacks-left-over, not in swings: a kill needs
        // the attacks that empty the Life stack plus one more to declare. The
        // invariant here used to be `incomingLeaderAttacks > lifeCount`, which
        // is the same number only while no attacker has [Double Attack].
        expect(t.facingLethal).toBe(
          attacksAreLethal(
            incomingLeaderDamages(observation),
            observation.self.lifeCount,
          ),
        );
        // Whatever the pricing, facing lethal needs more attacks than Life to
        // absorb them one at a time -- the weaker law the old assertion was.
        if (t.facingLethal) {
          expect(t.incomingLeaderDamage).toBeGreaterThan(
            observation.self.lifeCount - 1,
          );
        }

        // `lethalInRange` is an upper bound, but it must at least be arithmetically
        // possible: enough hits, Life to take, and nothing on the board to block.
        if (t.lethalInRange) {
          expect(t.maxLeaderHits).toBeGreaterThanOrEqual(t.opponentLife);
          expect(t.opponentLife).toBeGreaterThan(0);
          expect(observation.opponent.board.some((card) => card.blocker)).toBe(
            false,
          );
        }

        expect(t.trash).toHaveLength(observation.self.trash.length);

        // Board power totals the *current* power of the board, which a debuff
        // can push a Character below zero without removing it -- so the total
        // is not bounded below by 0, and what it must hold to is the board.
        const total = (board: GameObservation["self"]["board"]): number =>
          board.reduce((sum, card) => sum + card.currentPower, 0);
        expect(t.selfBoardPower).toBe(total(observation.self.board));
        expect(t.opponentBoardPower).toBe(total(observation.opponent.board));
      });
    }
    expect(observations).toBeGreaterThan(100);
  });
});

describe("attacksAreLethal", () => {
  // A battle wins in exactly one way: an attack is *declared* against a player
  // already on 0 Life. So a kill is "empty the Life stack, and have an attack
  // left over" -- which is neither `damage >= life` nor `damage > life` once a
  // [Double Attack] swing is in the list, because each of its two points checks
  // a Life card and a point with none to check does nothing.
  it("needs one attack more than it takes to empty the Life stack", () => {
    expect(attacksAreLethal([1, 1], 2)).toBe(false);
    expect(attacksAreLethal([1, 1, 1], 2)).toBe(true);
  });

  it("does not let a [Double Attack] swing win from 1 Life", () => {
    // Bandai's rules Q&A: "If my opponent has 1 Life card, can I win the game
    // by using a [Double Attack] to deal 2 damage? -- No, you cannot."
    expect(attacksAreLethal([2], 1)).toBe(false);
    // Nor from 2, where it empties the stack and stops.
    expect(attacksAreLethal([2], 2)).toBe(false);
    // With something left to declare, it is the game.
    expect(attacksAreLethal([2, 1], 2)).toBe(true);
    expect(attacksAreLethal([2, 1], 1)).toBe(true);
  });

  it("reads the same whichever order the attacks are given in", () => {
    // The order decides which attacks are *spent* emptying the stack, and
    // biggest-first spends the fewest -- so whether an attack is left over does
    // not depend on the caller's ordering.
    expect(attacksAreLethal([1, 1, 2], 3)).toBe(true);
    expect(attacksAreLethal([2, 1, 1], 3)).toBe(true);
    // Three attacks worth 4 against 4 Life empty it exactly, with none left.
    expect(attacksAreLethal([2, 1, 1], 4)).toBe(false);
  });

  it("wins from 0 Life with any attack at all, and never with none", () => {
    expect(attacksAreLethal([1], 0)).toBe(true);
    expect(attacksAreLethal([], 0)).toBe(false);
    expect(attacksAreLethal([], 3)).toBe(false);
  });
});

describe("hand, board and activation vocabulary", () => {
  it("counts copies and offered activations off the observation", () => {
    let checked = 0;
    sweep(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Blue) Kuzan - Starter Deck 33",
      "tactics-vocabulary-1",
      (observation) => {
        const t = tactics(observation);
        for (const card of observation.self.hand) {
          expect(t.copiesInHand(card.cardNumber)).toBe(
            observation.self.hand.filter(
              (held) => held.cardNumber === card.cardNumber,
            ).length,
          );
        }
        for (const card of observation.self.board) {
          expect(t.copiesOnBoard(card.cardNumber)).toBe(
            observation.self.board.filter(
              (body) => body.cardNumber === card.cardNumber,
            ).length,
          );
        }
        expect(t.copiesInHand("no-such-card")).toBe(0);
        expect(t.copiesOnBoard("no-such-card")).toBe(0);
        const offered = observation.legalActions.filter(
          (action) => action.type === "activate-main",
        );
        expect(t.activations).toEqual(offered);
        for (const action of t.activations) {
          expect(t.activationOffered(action.sourceCardNumber)).toBe(true);
          checked += 1;
        }
        expect(t.activationOffered("no-such-card")).toBe(false);
      },
    );
    // The sweep has to have met at least one activation for the positive
    // half of the check to have run.
    expect(checked).toBeGreaterThan(0);
  });

  it("derives Tactics once per observation object", () => {
    sweep(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Blue) Kuzan - Starter Deck 33",
      "tactics-vocabulary-2",
      (observation) => {
        expect(tacticsFor(observation)).toBe(tacticsFor(observation));
        // A copy is a different position as far as the cache is concerned:
        // `resolveWithModules` hands a policy a narrowed copy on purpose.
        expect(tacticsFor({ ...observation })).not.toBe(
          tacticsFor(observation),
        );
      },
    );
  });
});
