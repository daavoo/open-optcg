/**
 * `activate-main`: Run an `[Activate: Main]` ability, an Event's `[Main]`, or a Leader/Stage ability.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import {
  dispatchMechanicInvocations,
  getActivateMainProgram,
  getEventMainProgram,
  getMechanicSignalInvocations,
} from "../card-mechanics.js";
import { addDonFromDeck, returnDonToDeck } from "../don.js";
import { mechanicPendingEffect } from "../effects.js";
import { leaderInstanceId } from "../board.js";
import { handOverPendingEffect, triggerFranky } from "../pending.js";
import { type CardInstance } from "../model.js";
import { type MechanicEffect, type MechanicProgram } from "../mechanics.js";
import { eventActivationCost } from "../hand-price.js";
import { type ActionContext } from "./context.js";

export function applyActivateMain({
  state,
  events,
  activePlayer,
  offered,
  db,
}: ActionContext<"activate-main">): void {
  const player = state.players[activePlayer];
  const [kind, first] = offered.optionId.split(":");
  if (kind === "mechanic-main" && first) {
    const source: CardInstance | undefined =
      player.board.find((card) => card.instanceId === first) ??
      (player.stage?.instanceId === first ? player.stage : undefined) ??
      (first === leaderInstanceId(activePlayer)
        ? { instanceId: first, cardNumber: player.leaderCardNumber }
        : undefined);
    if (!source) throw new Error(`MISSING_EFFECT_SOURCE: ${first}`);
    const activation = getActivateMainProgram(source.cardNumber);
    if (!activation) throw new Error(`MISSING_MAIN_PROGRAM: ${first}`);
    if (activation.oncePerTurn) {
      state.oncePerTurn.push(
        `${state.turn}:${activePlayer}:${source.instanceId}:activate-main`,
      );
    }
    const dispatched = dispatchMechanicInvocations(
      state,
      [
        {
          context: { sourcePlayerId: activePlayer, source },
          program: alreadyOptedIn(activation.program),
        },
      ],
      db,
    );
    // The marker goes in front of the steps it caused, which is the order the
    // readers group by. Withheld when the clause stopped to ask something: the
    // steps have not happened yet, and the flag on the pending effect carries
    // the activation to the action they land on instead.
    if (!dispatched.pending && dispatched.events.length > 0) {
      events.push({
        type: "ability-activated",
        playerId: activePlayer,
        sourceCardNumber: source.cardNumber,
        sourceInstanceId: source.instanceId,
      });
    }
    events.push(...dispatched.events);
    state.pendingEffect =
      dispatched.pending && dispatched.invocation
        ? mechanicPendingEffect(
            dispatched.invocation,
            dispatched.pending,
            dispatched.continuations,
            false,
            activePlayer,
          )
        : null;
    handOverPendingEffect(state);
  } else if (kind === "enel-leader") {
    // `first` is absent when the board is empty: "[printed text omitted -- pnpm card:text <card>]" gives zero with nobody to give to, and the
    // two add clauses still resolve. `legal-actions/main.ts` explains why that
    // activation is offered rather than withheld.
    const target = first
      ? player.board.find((card) => card.instanceId === first)
      : undefined;
    if (first && !target) throw new Error(`MISSING_EFFECT_TARGET: ${first}`);
    const addedActive = addDonFromDeck(state, activePlayer, 1, "active");
    const addedRested = addDonFromDeck(state, activePlayer, 4, "rested");
    const given = target ? player.restedDon.splice(0, 4) : [];
    if (target) {
      target.attachedDon ??= [];
      target.attachedDon.push(...given);
    }
    state.oncePerTurn.push(`${state.turn}:${activePlayer}:enel-leader`);
    // Five DON!! come out of the DON!! deck here without going through the
    // `add-don` node, which is what usually reports them, so the ramp that is
    // this Leader's whole plan happened between events -- and with an empty
    // board, where there is nobody to give the four to, the activation emitted
    // nothing at all.
    const leader = leaderInstanceId(activePlayer);
    const marker = {
      type: "ability-activated",
      playerId: activePlayer,
      sourceCardNumber: player.leaderCardNumber,
      sourceInstanceId: leader,
    } as const;
    if (addedActive > 0 || addedRested > 0) events.push(marker);
    for (const [count, rested] of [
      [addedActive, false],
      [addedRested, true],
    ] as const) {
      if (count > 0) {
        events.push({
          type: "don-added",
          playerId: activePlayer,
          count,
          rested,
          sourceCardNumber: player.leaderCardNumber,
        });
      }
    }
    if (target && given.length > 0) {
      events.push({
        type: "don-attached",
        playerId: activePlayer,
        targetInstanceId: target.instanceId,
        count: given.length,
        sourceCardNumber: player.leaderCardNumber,
      });
    }
  } else if (kind === "mechanic-event" && first) {
    const eventIndex = player.hand.findIndex(
      (card) => card.instanceId === first,
    );
    const [eventCard] = player.hand.splice(eventIndex, 1);
    if (!eventCard) throw new Error(`MISSING_EFFECT_SOURCE: ${first}`);
    const program = getEventMainProgram(eventCard.cardNumber);
    if (!program) throw new Error(`MISSING_EVENT_PROGRAM: ${first}`);
    player.restedDon.push(
      ...player.activeDon.splice(
        0,
        eventActivationCost(
          state,
          activePlayer,
          eventCard.cardNumber,
          program.cost,
          db,
        ),
      ),
    );
    player.trash.push(eventCard);
    events.push({
      type: "event-activated",
      playerId: activePlayer,
      cardNumber: eventCard.cardNumber,
    });
    triggerFranky(state, activePlayer, events);
    if (program.donMinus) {
      returnDonToDeck(state, activePlayer, program.donMinus, eventCard, events);
    }
    if (program.restDon) {
      player.restedDon.push(...player.activeDon.splice(0, program.restDon));
    }
    // An Event's printed `DON!! −N` is a DON!! going home like any other, and
    // the bench watches for it: OP05-074 Eustass"Captain"Kid and OP11-077
    // Randolph read the same `don-returned` signal the `return-don` node
    // raises. Paid above through `returnDonToDeck`, which raises nothing for
    // the declarative watchers, so the signal is raised here -- after the
    // Event's own program, the order the node keeps.
    const donReactions = program.donMinus
      ? getMechanicSignalInvocations(state, [
          {
            kind: "don-returned",
            playerId: activePlayer,
            count: program.donMinus,
          },
        ])
      : [];
    const dispatched = dispatchMechanicInvocations(
      state,
      [
        {
          context: { sourcePlayerId: activePlayer, source: eventCard },
          program: program.program,
        },
        ...donReactions,
      ],
      db,
    );
    events.push(...dispatched.events);
    state.pendingEffect = dispatched.pending
      ? mechanicPendingEffect(
          {
            context: { sourcePlayerId: activePlayer, source: eventCard },
            program: program.program,
          },
          dispatched.pending,
          dispatched.continuations,
        )
      : null;
    // The same hand-over the `[Activate: Main]` branch above does, for the same
    // reason: an Event whose program names the opponent as chooser -- OP06-097
    // Negative Hollow takes a card from their hand and *they* pick it -- must
    // reach their action list, or the prompt is answered out of the wrong hand.
    // Every `[Main]` Event in the pool before OP-06 chose from its own side, so
    // the missing call was invisible.
    handOverPendingEffect(state);
  } else {
    throw new Error(`INVALID_ACTIVATION: ${offered.optionId}`);
  }
}

/**
 * Drop the `[Activate: Main]` gate the player already answered by activating.
 *
 * A program printed as "You may <cost>: <effect>" is modelled as an `optional`
 * wrapping the whole thing, and running it verbatim asks "Apply optional
 * effect?" the instant the player clicks the activation -- a question with no
 * new information behind it, whose "no" is strictly worse than not clicking,
 * since `oncePerTurn` is already spent by the time it is asked. Clicking the
 * activation *is* the yes, the same reading `onOpponentAttackSummary` names
 * from the other side: that prompt is worth keeping because it arrives unasked.
 *
 * The gate is unwrapped wherever nothing can resolve before it is asked: the
 * whole program, the `then` of an `if` -- `donMinus` writes "DON!! −N, You may
 * ...:" as a field-DON!! check around the `optional`, and a Leader-type check
 * guards EB03-016 Kouzuki Hiyori's the same way -- or the first step of a
 * `sequence`. The `if` is decided at the instant of activation, so it tells the
 * player nothing they did not know when they clicked. Left in place, the "no"
 * also changed nothing on a clause that is not `[Once Per Turn]`, so the same
 * activation was offered again and a pilot could loop on activate-and-decline
 * forever: OP11-070 Charlotte Pudding and EB03-016 were most of the System-1
 * trainer's games that hit the action cap.
 *
 * An `optional` behind an effect that has already resolved is a real decision
 * made with what that effect revealed, and it stays. The cost itself is still
 * declinable where the printed text allows it: what remains is the `choose`
 * that picks what pays, and an unpayable one resolves to nothing rather than
 * trapping the player.
 */
function alreadyOptedIn(program: MechanicProgram): MechanicProgram {
  return { ...program, effect: optedIn(program.effect) };
}

function optedIn(effect: MechanicEffect): MechanicEffect {
  // A named chooser is the opponent answering, not the activating player.
  if (effect.kind === "optional") {
    return (effect.chooser ?? "self") === "self" ? effect.effect : effect;
  }
  if (effect.kind === "if") return { ...effect, then: optedIn(effect.then) };
  if (effect.kind === "sequence" && effect.effects.length > 0) {
    const [first, ...rest] = effect.effects;
    return { ...effect, effects: [optedIn(first!), ...rest] };
  }
  return effect;
}
