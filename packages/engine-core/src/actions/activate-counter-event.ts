/**
 * `activate-counter-event`: Play a `[Counter]` Event from hand during the Counter step.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import {
  dispatchMechanicInvocations,
  getCounterEventProgram,
} from "../card-mechanics.js";
import { fieldDonCount, returnDonToDeck } from "../don.js";
import { drawCards, mechanicPendingEffect } from "../effects.js";
import { counterEventPower, opponentOf } from "../board.js";
import { handOverPendingEffect } from "../pending.js";
import { effectiveCost } from "../queries.js";
import { eventActivationCost } from "../hand-price.js";
import { type ActionContext } from "./context.js";

export function applyActivateCounterEvent({
  state,
  events,
  activePlayer,
  offered,
  db,
}: ActionContext<"activate-counter-event">): void {
  const player = state.players[activePlayer];
  const eventIndex = player.hand.findIndex(
    (card) => card.instanceId === offered.eventInstanceId,
  );
  const [eventCard] = player.hand.splice(eventIndex, 1);
  if (!eventCard || !state.activeAttack) {
    throw new Error("INVALID_COUNTER_EVENT");
  }
  player.trash.push(eventCard);
  events.push({
    type: "event-activated",
    playerId: activePlayer,
    cardNumber: eventCard.cardNumber,
  });
  if (eventCard.cardNumber === "OP12-057") {
    player.restedDon.push(...player.activeDon.splice(0, 1));
    state.activeAttack.counterPower += 4000;
    state.pendingEffect = {
      kind: "navy-discard",
      playerId: activePlayer,
      sourceCardNumber: eventCard.cardNumber,
      sourceInstanceId: eventCard.instanceId,
      eligibleInstanceIds: player.hand.map((card) => card.instanceId),
      remaining: 1,
      optional: false,
      after: { kind: "none" },
      resumePhase: "counter",
      resumePlayerId: activePlayer,
    };
  } else if (eventCard.cardNumber === "OP12-098") {
    player.restedDon.push(...player.activeDon.splice(0, 1));
    const power = counterEventPower(state, activePlayer, eventCard.cardNumber)!;
    state.activeAttack.counterPower += power;
    events.push({
      type: "counter-used",
      playerId: activePlayer,
      cardNumber: eventCard.cardNumber,
      power,
    });
  } else if (
    ["OP15-074", "OP15-075", "OP15-076", "OP15-078"].includes(
      eventCard.cardNumber,
    )
  ) {
    // El Thor, Kiten and Varie give +2000 to "1 of your [Enel] cards";
    // Mamaragan gives +1000 to any of your Leader or Character cards.
    //
    // The engine models Counter power as a single number added to the battle's
    // target, so a buff aimed anywhere else would have no effect on the battle
    // and expires with it. What does matter is whether the target is a legal
    // one: blocking with a Character that is not named Enel puts El Thor,
    // Kiten and Varie out of range entirely, and adding their power anyway
    // would be wrong rather than merely imprecise. `counterEventPower` reads
    // that same restriction, so the offer and the resolution agree on 0.
    const power = counterEventPower(state, activePlayer, eventCard.cardNumber)!;
    if (power > 0) {
      state.activeAttack.counterPower += power;
      events.push({
        type: "counter-used",
        playerId: activePlayer,
        cardNumber: eventCard.cardNumber,
        power,
      });
    }
    if (
      eventCard.cardNumber === "OP15-078" &&
      fieldDonCount(state, activePlayer) <= 6
    ) {
      events.push(...drawCards(state, activePlayer, 1, eventCard.cardNumber));
    }
  } else if (eventCard.cardNumber === "OP07-056") {
    player.restedDon.push(...player.activeDon.splice(0, 1));
    state.pendingEffect = {
      kind: "slave-arrow-cost",
      playerId: activePlayer,
      sourceCardNumber: eventCard.cardNumber,
      sourceInstanceId: eventCard.instanceId,
      step: "cost",
      eligibleInstanceIds: player.board
        .filter((card) => effectiveCost(state, activePlayer, card) >= 2)
        .map((card) => card.instanceId),
      power: 4000,
      resumePhase: "counter",
      resumePlayerId: activePlayer,
    };
  } else if (eventCard.cardNumber === "OP11-079") {
    player.restedDon.push(...player.activeDon.splice(0, 1));
    state.pendingEffect = {
      kind: "st34-guess-cost",
      playerId: activePlayer,
      targetPlayerId: opponentOf(activePlayer),
      sourceCardNumber: eventCard.cardNumber,
      sourceInstanceId: eventCard.instanceId,
      outcome: "counter-event",
      resumePhase: "counter",
      resumePlayerId: activePlayer,
    };
  } else if (getCounterEventProgram(eventCard.cardNumber)) {
    const program = getCounterEventProgram(eventCard.cardNumber)!;
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
    // `DON!! −N` printed past the Event's own cost, paid the moment it is
    // played -- the same order the [Main] half pays it in. The offer is gated
    // on it in `legal-actions/counter.ts`.
    if (program.donMinus) {
      returnDonToDeck(state, activePlayer, program.donMinus, eventCard, events);
    }
    // Through `counterEventPower` rather than `program.power`, so a Counter
    // whose buff cannot reach the card being attacked adds nothing here
    // either. The offer already reads that predicate; adding the printed
    // number anyway would hand the defender power the summary told them they
    // would not get, and in the other direction an [Enel]-style restriction
    // would be enforced only in the forecast.
    const power = counterEventPower(state, activePlayer, eventCard.cardNumber)!;
    if (power > 0) {
      state.activeAttack.counterPower += power;
      events.push({
        type: "counter-used",
        playerId: activePlayer,
        cardNumber: eventCard.cardNumber,
        power,
      });
    }
    if (program.program) {
      const dispatched = dispatchMechanicInvocations(state, [
        {
          context: { sourcePlayerId: activePlayer, source: eventCard },
          program: program.program,
        },
      ]);
      events.push(...dispatched.events);
      if (dispatched.pending && dispatched.invocation) {
        // The rest of the text can ask a question -- OP12-115 offers a
        // [Trafalgar Law] out of the trash -- and the Counter step has to be
        // waiting when the answer comes back, or the defender loses the rest
        // of their Counter window to a card they played inside it.
        state.pendingEffectResume = {
          phase: "counter",
          playerId: activePlayer,
        };
        state.pendingEffect = mechanicPendingEffect(
          dispatched.invocation,
          dispatched.pending,
          dispatched.continuations,
        );
        // A step the text gives to the attacker -- EB01-028's "your opponent
        // returns 1 of their active Characters", which Bandai's Q&A
        // (EB01-028#1) says the attacker chooses -- is answered by that seat,
        // not by the defender who played the Event. The resume above is what
        // brings the decision back to the defender afterwards.
        handOverPendingEffect(state);
      }
    }
  } else {
    // OP02-068, OP04-016 and OP13-076: "you may trash 1 card from your hand:
    // +3000". The power is bought by the trash, inside the prompt, and the
    // prompt can decline it.
    state.pendingEffect = {
      kind: "bad-manners-counter",
      playerId: activePlayer,
      sourceCardNumber: eventCard.cardNumber,
      sourceInstanceId: eventCard.instanceId,
      eligibleInstanceIds: player.hand.map((card) => card.instanceId),
    };
  }
}
