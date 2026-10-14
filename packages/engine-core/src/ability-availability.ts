/**
 * One reading of whether an `[Activate: Main]` ability is available, and of why
 * it is not.
 *
 * The offer path and the observation ask the same question for opposite
 * reasons. `legal-actions/main/activations.ts` asks so it can withhold an
 * activation that would resolve nothing -- a gate that fails makes the whole
 * clause inert, so not offering it is identical to offering it and having it do
 * nothing. `observe` asks so it can *say* the ability is there and dormant,
 * because a withheld offer is otherwise indistinguishable from an ability the
 * card does not print.
 *
 * A recorded game is the argument for the second half: ST21-001
 * Monkey.D.Luffy's Leader gift is gated on `[DON!! x1]`, its holder ended a
 * turn with 7 rested DON!!, an unspent once-per-turn and a Stage whose whole
 * text is "give 1 rested DON!! to a [Monkey.D.Luffy]" -- the Leader among the
 * two recipients offered. Nothing in the observation named the gate, the Stage
 * DON!! went to a Character, and the Leader gift that would have put a third
 * given DON!! on the field, switching on ST31-004's conditional [Rush] and a
 * 9000-power attack, was never in the plan. 64 of the pool's 245
 * `[Activate: Main]` programs sit behind such a gate.
 *
 * `requires` and the program's own top-level condition are both read here, so
 * the two callers cannot drift -- the same reason `requires` has one reading
 * across the board loop and the Leader block that once had its own.
 */
import { type CardDatabase } from "@one-piece-sim/cards";
import type { PlayerId } from "@one-piece-sim/protocol";
import { getActivateMainProgram } from "./card-mechanics.js";
import {
  conditionFixedForGame,
  describeMechanicCondition,
} from "./condition-text.js";
import { fieldDonCount } from "./don.js";
import { leaderInstanceId } from "./board.js";
import {
  SOURCE_BINDING,
  bareGateCondition,
  conditionMatches,
  selectCards,
  type MechanicCondition,
} from "./mechanics.js";
import type { ActivateMainProgram } from "./mechanics/types.js";
import type { CardInstance, GameState } from "./model.js";

/**
 * A board Character or the Stage carries its own `rested`; a Leader is a bare
 * `CardInstance` and keeps that state on the player as `leaderRested`.
 */
export type ActivationSource = CardInstance & { rested?: boolean };

/** An ability the card prints that is not available right now, and why. */
export interface DormantAbility {
  /** The clause, as the card prints it. */
  clause: string;
  /** What it is waiting for, or that its one use is spent. */
  reason: string;
}

function count(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/**
 * The resource the `requires` gate is short of, in words, or `undefined` when
 * the gate is clear.
 *
 * Ordered as the fields are declared, and it reports the first shortfall rather
 * than all of them: `requires` is a cost the ability pays, so a player short of
 * two of its resources is short of the cheaper one first.
 *
 * One reading, shared by the board/Stage loop and the Leader block that offers
 * activations: a Leader is in no zone, so it once had a hand-written branch of
 * its own and the two drifted -- OP12-061 Donquixote Rosinante was offered
 * twice a turn, once with its Trafalgar-Law-in-hand gate and once without.
 */
function unmetRequirement(
  state: GameState,
  playerId: PlayerId,
  source: ActivationSource,
  requires: ActivateMainProgram["requires"],
  db: CardDatabase,
): string | undefined {
  if (!requires) return undefined;
  const player = state.players[playerId];
  if (
    requires.fieldDon !== undefined &&
    fieldDonCount(state, playerId) < requires.fieldDon
  ) {
    return `${count(requires.fieldDon, "DON!! card")} in your cost area and given out`;
  }
  if (
    requires.activeDon !== undefined &&
    player.activeDon.length < requires.activeDon
  ) {
    return count(requires.activeDon, "active DON!! card");
  }
  if (
    requires.handCards !== undefined &&
    player.hand.length < requires.handCards
  ) {
    return `${count(requires.handCards, "card")} in hand`;
  }
  if (
    requires.restedDon !== undefined &&
    player.restedDon.length < requires.restedDon
  ) {
    return count(requires.restedDon, "rested DON!! card");
  }
  if (
    requires.lifeCards !== undefined &&
    player.life.length < requires.lifeCards
  ) {
    return count(requires.lifeCards, "Life card");
  }
  if (
    requires.givenDon !== undefined &&
    player.leaderAttachedDon.length +
      player.board.reduce(
        (total, card) => total + (card.attachedDon?.length ?? 0),
        0,
      ) <
      requires.givenDon
  ) {
    return `${count(requires.givenDon, "given DON!! card")} on your field`;
  }
  if (
    requires.donActivationAllowed &&
    (player.cannotActivateDonByCharacterUntilTurn ?? -1) >= state.turn
  ) {
    return "DON!! to be settable active again, which its own text has barred for this turn";
  }
  if (requires.sourceActive || requires.sourceRested) {
    const rested =
      source.instanceId === leaderInstanceId(playerId)
        ? player.leaderRested
        : source.rested;
    if (requires.sourceActive && rested) return "this card to be active";
    if (requires.sourceRested && !rested) return "this card to be rested";
  }
  if (
    requires.handCardsMatching !== undefined &&
    selectCards(
      state,
      { sourcePlayerId: playerId, source },
      { ...requires.handCardsMatching.match, player: "self", zone: "hand" },
      {},
      db,
    ).length < requires.handCardsMatching.count
  ) {
    return `${count(requires.handCardsMatching.count, "particular card")} in hand, which its text names`;
  }
  return undefined;
}

/**
 * A gate's state: met, unmet, or unmet and unable to change for the rest of the
 * game.
 *
 * `text: null` is an unmet gate this build cannot phrase exactly -- reported as
 * "its printed condition", which still points a reader at text they hold. The
 * alternative, a partial phrasing, would name a condition the engine does not
 * actually check.
 */
type GateState =
  { kind: "met" } | { kind: "never" } | { kind: "unmet"; text: string | null };

function gateState(
  state: GameState,
  playerId: PlayerId,
  source: ActivationSource,
  condition: MechanicCondition,
  db: CardDatabase,
): GateState {
  const met = conditionMatches(
    state,
    { sourcePlayerId: playerId, source },
    condition,
    { [SOURCE_BINDING]: [source.instanceId] },
    db,
  );
  if (met) return { kind: "met" };
  // A combinator reports only the halves that are actually failing: OP12-020
  // Roronoa Zoro's Leader wants 3 DON!! on itself *and* to have battled a
  // Character, and a player holding the second half needs to be told about the
  // first, not about both. One failing half that can never change -- a Leader
  // type this deck does not have -- makes the whole gate unreachable, whatever
  // the other half says.
  if (condition.kind === "all-of" || condition.kind === "any-of") {
    const parts = condition.conditions.map((inner) =>
      gateState(state, playerId, source, inner, db),
    );
    const unmet = parts.filter((part) => part.kind !== "met");
    if (
      condition.kind === "all-of" &&
      unmet.some((part) => part.kind === "never")
    ) {
      return { kind: "never" };
    }
    if (
      condition.kind === "any-of" &&
      unmet.every((part) => part.kind === "never")
    ) {
      return { kind: "never" };
    }
    const texts = unmet
      .filter(
        (part): part is { kind: "unmet"; text: string | null } =>
          part.kind === "unmet",
      )
      .map((part) => part.text);
    if (texts.length === 0 || texts.some((text) => text === null)) {
      return { kind: "unmet", text: null };
    }
    return {
      kind: "unmet",
      text: texts.join(condition.kind === "all-of" ? " and " : " or "),
    };
  }
  // A card the board already holds from an earlier turn cannot come to have
  // been played this turn, so this gate reads as settled the same way a Leader
  // type does -- for this instance rather than for the whole game, which is the
  // same thing to a caller looking at it. OP15-008 and EB03-013 print the shape;
  // reporting it would put a permanent line under a body that has been down
  // since turn 3.
  if (
    condition.kind === "source-played-this-turn" ||
    conditionFixedForGame(condition)
  ) {
    return { kind: "never" };
  }
  return { kind: "unmet", text: describeMechanicCondition(condition) };
}

function oncePerTurnSpent(
  state: GameState,
  playerId: PlayerId,
  source: ActivationSource,
  program: ActivateMainProgram,
): boolean {
  return (
    program.oncePerTurn &&
    state.oncePerTurn.includes(
      `${state.turn}:${playerId}:${source.instanceId}:activate-main`,
    )
  );
}

/**
 * Whether this source's `[Activate: Main]` may be offered right now.
 *
 * The offer path's whole gate, in one call: the once-per-turn budget, the
 * `requires` cost, and the program's own top-level condition.
 */
export function activateMainAvailable(
  state: GameState,
  playerId: PlayerId,
  source: ActivationSource,
  program: ActivateMainProgram,
  db: CardDatabase,
): boolean {
  if (oncePerTurnSpent(state, playerId, source, program)) return false;
  if (unmetRequirement(state, playerId, source, program.requires, db)) {
    return false;
  }
  const gate = bareGateCondition(program.program);
  return (
    gate === null || gateState(state, playerId, source, gate, db).kind === "met"
  );
}

/**
 * The `[Activate: Main]` this source prints and cannot use right now, if any.
 *
 * `undefined` covers three cases that all read the same to a caller: the card
 * prints no such clause, the clause is available and therefore already in
 * `legalActions`, or the gate on it can never change for the rest of this game
 * -- a Leader type or name this deck does not have. The last one is the reason
 * this is not simply "the program exists and is not offered": a permanent line
 * under a card every turn of every game teaches nothing.
 */
export function dormantActivation(
  state: GameState,
  playerId: PlayerId,
  source: ActivationSource,
  db: CardDatabase,
): DormantAbility | undefined {
  const program = getActivateMainProgram(source.cardNumber);
  if (!program) return undefined;
  const clause = "[Activate: Main]";
  if (oncePerTurnSpent(state, playerId, source, program)) {
    return { clause, reason: "its one use this turn is spent" };
  }
  const requirement = unmetRequirement(
    state,
    playerId,
    source,
    program.requires,
    db,
  );
  if (requirement) return { clause, reason: `needs ${requirement}` };
  const gate = bareGateCondition(program.program);
  if (gate === null) return undefined;
  const outcome = gateState(state, playerId, source, gate, db);
  if (outcome.kind === "met" || outcome.kind === "never") return undefined;
  return {
    clause,
    reason:
      outcome.text === null
        ? "needs the condition its printed text states"
        : `needs ${outcome.text}`,
  };
}
