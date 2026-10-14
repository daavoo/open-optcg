import type { GameObservation } from "@one-piece-sim/protocol";

/**
 * The race, in one place: how fast each side wins, and therefore who is the
 * aggressor.
 *
 * This is the quantity every deck policy in the package was missing. `Tactics`
 * describes the *position* -- Life, DON!!, Counter in hand, blockers, pressure --
 * and `combat.ts` prices a single battle. Neither says how many turns the game
 * has left, so no rule could ever ask the question that decides whether to press
 * or to stabilise, and the agents never changed gear. They pressed into a lost
 * race and hoarded Counter through a won one.
 *
 * The question is the standard role-assignment one -- who is the beatdown? -- and
 * it matters more here than in most card games, because Life *is* card advantage.
 * A Leader hit taken moves a Life card into hand, so absorbing is close to
 * card-neutral and defending is not. Whether that trade is good is a fact about
 * the clock, not about the board: it is right to take the hit at 4 Life when the
 * opponent needs three more turns, and wrong at 4 Life when they need one.
 *
 * ## What this is not
 *
 * It is a **bound, not a forecast**, on the same principle as
 * {@link import("./combat.js").incomingLeaderAttacks}. It prices only what is on
 * the field now: no development either side will do, no restands, no Counter
 * cards, no DON!! not yet attached, no Rush bodies still in hand. A real game
 * ends sooner than both clocks say, usually for both players at once.
 *
 * The bound is useful anyway because it is used *comparatively*. Both sides are
 * measured the same optimistic way, so the difference between them -- which is
 * all {@link Race.role} reads -- is far more stable than either number. A rule
 * should gate on `role`, `tempoMargin` or `mustStabilise`, and should treat
 * `ownClock` as "roughly how long I have" rather than as a count of turns.
 *
 * Deliberately a leaf module, importing nothing from the policy layer, so
 * `tactics.ts` can expose it without a cycle and a test can drive it directly.
 */

/** Which side of the race a seat is on. */
export type Role = "beatdown" | "control";

export interface Race {
  /**
   * Turns the viewer needs, at current speed, to land the killing hit.
   *
   * `Number.POSITIVE_INFINITY` when the viewer has no attack that beats the
   * defending Leader at all, which is a real state and not an error: a board of
   * 2000-power bodies against a 5000 Leader has no clock.
   */
  readonly ownClock: number;
  /** The same for the opponent, computed identically. */
  readonly opponentClock: number;
  /**
   * `opponentClock - ownClock`. Positive means the viewer wins the race.
   *
   * Zero -- both sides on the same clock -- counts as being ahead, because the
   * viewer is the active player when they read this and therefore gets there
   * first.
   */
  readonly tempoMargin: number;
  /**
   * `"beatdown"` when the viewer wins the race at current speed.
   *
   * The one rule that flips it: whoever is faster is the beatdown, and the other
   * seat has to stop trading and start answering.
   */
  readonly role: Role;
  /**
   * True when the opponent lands the killing hit strictly first, by more than
   * `abandonMargin` turns.
   *
   * The gear change. A racing deck that reads this and keeps racing is dead; the
   * margin exists because the clocks are bounds, so a one-turn deficit is inside
   * the noise and is not yet evidence the race is lost.
   */
  readonly mustStabilise: boolean;
  /** Leader hits the viewer's current field can land per turn. */
  readonly ownHitsPerTurn: number;
  /** Leader hits the opponent's current field can land per turn. */
  readonly opponentHitsPerTurn: number;
}

/**
 * Life that has to be removed before the game ends.
 *
 * `+ 1` because reaching 0 Life is not losing: a player at 0 Life is alive until
 * a Leader attack connects. So killing a 3-Life opponent takes four connected
 * hits, not three. This is the same off-by-one that
 * `mustPreventCurrentLeaderHit` handles by testing `>=` rather than `>`.
 */
function hitsToKill(lifeCount: number): number {
  return Math.max(0, lifeCount) + 1;
}

/**
 * Leader hits one field can land per turn against the other's Leader.
 *
 * Counts the Leader plus every Character whose current power already beats the
 * defending Leader -- the attacker wins ties, so `>=` is correct -- and then
 * subtracts the defender's Blockers, because a Blocker genuinely absorbs one
 * attack per turn and so genuinely removes a hit from the clock.
 *
 * Blockers are the only correction applied. Everything else that would change
 * the number (development, restands, DON!! not yet attached, Counter cards,
 * Rush bodies in hand) is either hidden information or a forecast, and this
 * module's whole value is that it never forecasts. Summoning sickness is
 * likewise ignored: a Character that cannot attack this turn can attack next
 * turn, and the clock is measured in turns.
 */
function hitsPerTurn(
  attacker: GameObservation["self"] | GameObservation["opponent"],
  defender: GameObservation["self"] | GameObservation["opponent"],
): number {
  const defence = defender.leader.currentPower;
  const characters = attacker.board.filter(
    (card) => card.currentPower >= defence,
  ).length;
  const blockers = defender.board.filter((card) => card.blocker).length;
  return Math.max(0, 1 + characters - blockers);
}

function clock(hitsNeeded: number, perTurn: number): number {
  if (perTurn <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(hitsNeeded / perTurn);
}

/**
 * Turns before the deficit is treated as fatal rather than as noise.
 *
 * One, not zero, because both clocks are optimistic bounds computed from the
 * current field: a single turn of difference is regularly erased by one card.
 * Overridable so a profile can say how much it trusts its own race -- a deck
 * whose whole plan is the race should abandon it later than a deck that has
 * another way to win.
 */
export const DEFAULT_ABANDON_MARGIN = 1;

export function race(
  observation: GameObservation,
  abandonMargin: number = DEFAULT_ABANDON_MARGIN,
): Race {
  const ownHitsPerTurn = hitsPerTurn(observation.self, observation.opponent);
  const opponentHitsPerTurn = hitsPerTurn(
    observation.opponent,
    observation.self,
  );
  const ownClock = clock(
    hitsToKill(observation.opponent.lifeCount),
    ownHitsPerTurn,
  );
  const opponentClock = clock(
    hitsToKill(observation.self.lifeCount),
    opponentHitsPerTurn,
  );
  // Two infinite clocks are a stalemate on the current field, not a race either
  // side is winning, so the margin is zero rather than NaN.
  const tempoMargin = ownClock === opponentClock ? 0 : opponentClock - ownClock;
  return {
    ownClock,
    opponentClock,
    tempoMargin,
    role: tempoMargin >= 0 ? "beatdown" : "control",
    mustStabilise: tempoMargin < -abandonMargin,
    ownHitsPerTurn,
    opponentHitsPerTurn,
  };
}
