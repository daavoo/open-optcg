/**
 * The Counter window: add Counter power from hand, play a [Counter] Event, or let the attack resolve.
 *
 * One of the per-phase offer generators `getLegalActions` dispatches to.
 */
import { getCounterEventProgram } from "../card-mechanics.js";
import { fieldDonCount } from "../don.js";
import {
  activationSummary,
  battleForecast,
  battleStake,
  counterEventForecastPower,
  counterShortfall,
} from "../board.js";
import { type GameState } from "../model.js";
import { battleAttackPower, currentPower, effectiveCost } from "../queries.js";
import { handCounterPower } from "../static-abilities.js";
import { eventActivationCost } from "../hand-price.js";
import {
  counterClauseParts,
  cards as defaultCardDatabase,
  type CardDatabase,
} from "@one-piece-sim/cards";
import { type LegalAction, type PlayerId } from "@one-piece-sim/protocol";

export function counterActions(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): LegalAction[] {
  const player = state.players[playerId];
  const targetInstanceId = state.activeAttack?.targetInstanceId;
  const attackPower = battleAttackPower(state, db);
  const currentDefense = targetInstanceId
    ? currentPower(state, playerId, targetInstanceId, false, db) +
      (state.activeAttack?.counterPower ?? 0)
    : 0;
  // Once the defense already exceeds the attack, an ordinary Counter card
  // adds nothing: it spends a hand card for zero benefit. The engine stops
  // offering them so no agent -- rules, learned, or LLM -- can over-counter.
  // A Counter Event past the threshold is filtered the same way below, on
  // whether its clause does anything but add power; `pass-counter` always
  // remains.
  const alreadySafe = counterShortfall(attackPower, currentDefense) === 0;
  const counterCards = alreadySafe
    ? []
    : player.hand.filter(
        (card) =>
          (db.require(card.cardNumber).counter ?? 0) > 0 ||
          handCounterPower(state, playerId, card.cardNumber, db) > 0,
      );
  const legacyCounterEvents = targetInstanceId
    ? player.hand.filter(
        (eventCard) =>
          (eventCard.cardNumber === "OP04-016" ||
            eventCard.cardNumber === "OP02-068" ||
            (eventCard.cardNumber === "OP12-057" &&
              player.activeDon.length >= 1) ||
            (eventCard.cardNumber === "OP11-079" &&
              player.activeDon.length >= 1) ||
            (eventCard.cardNumber === "OP12-098" &&
              player.activeDon.length >= 1) ||
            (eventCard.cardNumber === "OP07-056" &&
              player.activeDon.length >= 1 &&
              player.board.some(
                (card) => effectiveCost(state, playerId, card, db) >= 2,
              )) ||
            // OP-15 purple thunder Events cost 0, so their [Counter] half
            // is always payable; OP13-076 pays by trashing a card instead.
            ["OP15-074", "OP15-075", "OP15-076", "OP15-078"].includes(
              eventCard.cardNumber,
            ) ||
            (eventCard.cardNumber === "OP13-076" &&
              player.hand.some(
                (discard) => discard.instanceId !== eventCard.instanceId,
              ))) &&
          (eventCard.cardNumber === "OP11-079" ||
            [
              "OP12-098",
              "OP07-056",
              "OP15-074",
              "OP15-075",
              "OP15-076",
              "OP15-078",
            ].includes(eventCard.cardNumber) ||
            player.hand.some(
              (discard) => discard.instanceId !== eventCard.instanceId,
            )),
      )
    : [];
  // Counter Events with an entry in the mechanic table. One branch covers
  // all of them, the way `eventMainPrograms` already does for the [Main]
  // half; the allow-list above stays for the cards that predate the table.
  const programCounterEvents = targetInstanceId
    ? player.hand.filter((eventCard) => {
        const program = getCounterEventProgram(eventCard.cardNumber);
        return (
          program !== undefined &&
          // `eventActivationCost`, not `program.cost`, for the reason the
          // [Main] half gives: OP15-021 prices itself in the hand, and the
          // payment in `actions/activate-counter-event.ts` reads the same
          // function.
          player.activeDon.length >=
            eventActivationCost(
              state,
              playerId,
              eventCard.cardNumber,
              program.cost,
              db,
            ) &&
          // The printed costs past the DON!! the Event itself costs. Without
          // these two an Event whose payout is conditional on paying them is
          // offered to a defender who cannot, and the Counter power lands for
          // free -- the same gate `legal-actions/main.ts` puts on the [Main]
          // half.
          fieldDonCount(state, playerId) >= (program.donMinus ?? 0) &&
          player.hand.length - 1 >= (program.trashFromHand ?? 0)
        );
      })
    : [];
  // Past the threshold an Event that only grants battle power is in the same
  // position an ordinary Counter card is: it spends a card to raise a defense
  // that already holds. The ones kept are those whose printed clause does
  // something else as well (OP12-115 recursion, OP17-017 debuff), which is
  // worth playing on its own -- `rest` is exactly that half of the clause.
  // An Event whose only clause is power computes to 0 either past the
  // threshold, or (regardless of threshold) when its own target restriction
  // -- Leader-only, a named card, a type -- doesn't match this battle: either
  // way the hand cannot spend it for any benefit, so it's never offered.
  const counterEvents = [
    ...legacyCounterEvents,
    ...programCounterEvents,
  ].filter((eventCard) => {
    if (counterClauseParts(eventCard.cardNumber)?.hasOtherEffect === true) {
      return true;
    }
    const power = counterEventForecastPower(
      state,
      playerId,
      eventCard.cardNumber,
      db,
    );
    return power === undefined ? !alreadySafe : power > 0 && !alreadySafe;
  });
  /**
   * Every Counter the hand holds, cards and Events alike, so a card that
   * cannot win alone can still say whether the rest of the hand closes the
   * gap. Summarising each one only against the *current* defense reads as
   * "nothing works" on a hand that stops the attack in two or three cards,
   * which is the opposite of true -- and leaving the Events out of the sum
   * said "the hand cannot reach it" about hands holding the answer.
   */
  const availableCounter =
    counterCards.reduce(
      (total, card) =>
        total +
        (db.require(card.cardNumber).counter ?? 0) +
        handCounterPower(state, playerId, card.cardNumber, db),
      0,
    ) +
    counterEvents.reduce(
      (total, card) =>
        total +
        (counterEventForecastPower(state, playerId, card.cardNumber, db) ?? 0),
      0,
    );
  /** The arithmetic both halves of the Counter step are summarised with. */
  const counterOutcome = (added: number): string => {
    const projectedDefense = currentDefense + added;
    const remaining = counterShortfall(attackPower, projectedDefense);
    const result =
      remaining === 0
        ? "attack is stopped"
        : availableCounter - added >= remaining
          ? `still hit; ${remaining} more Counter power from other cards in hand stops it`
          : `still hit; ${remaining} more Counter power needed and the hand cannot reach it`;
    return `defense becomes ${projectedDefense} vs ${attackPower} attack: ${result}`;
  };
  const counterValue = (card: { cardNumber: string }): number =>
    (db.require(card.cardNumber).counter ?? 0) +
    handCounterPower(state, playerId, card.cardNumber, db);
  /**
   * The same Counter played onto one of the defender's other cards, which the
   * rules allow (Bandai rules Q&A, Keywords #4) and which leaves this battle's
   * defense where it is. Every Counter card in hand qualifies, the ones
   * `alreadySafe` holds back too: the boost is for that card, not for this
   * defense.
   *
   * Listed after every offer above, the pass included, so each of those keeps
   * its place and its id; and nothing a shipped agent reads changes, since
   * `withoutAsideCounters` takes these out before any of them decides.
   */
  const asideTargets = targetInstanceId
    ? [
        {
          instanceId: `${playerId}-leader`,
          label: `your Leader ${db.require(player.leaderCardNumber).name}`,
        },
        ...player.board.map((card) => ({
          instanceId: card.instanceId,
          label: `${db.require(card.cardNumber).name} [${card.cardNumber}]`,
        })),
      ].filter((target) => target.instanceId !== targetInstanceId)
    : [];
  const asideCounters = player.hand
    .filter((card) => counterValue(card) > 0)
    .flatMap((card) => {
      const definition = db.require(card.cardNumber);
      const counter = counterValue(card);
      return asideTargets.map((target) => ({
        actionId: `r${state.revision}:counter:${card.instanceId}:${target.instanceId}`,
        type: "counter" as const,
        cardInstanceId: card.instanceId,
        counterPower: counter,
        targetInstanceId: target.instanceId,
        summary: `Counter with ${definition.name} [${definition.cardNumber}] onto ${target.label}, not the card being attacked (+${counter} to it for this battle; ${counterOutcome(0)})`,
      }));
    });
  return [
    ...counterCards.map((card) => {
      const definition = db.require(card.cardNumber);
      const counter =
        (definition.counter ?? 0) +
        handCounterPower(state, playerId, card.cardNumber, db);
      return {
        actionId: `r${state.revision}:counter:${card.instanceId}`,
        type: "counter" as const,
        cardInstanceId: card.instanceId,
        counterPower: counter,
        summary: `Counter with ${definition.name} [${definition.cardNumber}] (+${counter}; ${counterOutcome(counter)})`,
      };
    }),
    ...counterEvents.map((eventCard) => {
      const power = counterEventForecastPower(
        state,
        playerId,
        eventCard.cardNumber,
        db,
      );
      const arithmetic =
        power === undefined
          ? "its Counter power is decided as it resolves"
          : power === 0
            ? `adds nothing to this battle, whose target it cannot reach; ${counterOutcome(0)}`
            : `+${power}; ${counterOutcome(power)}`;
      return {
        actionId: `r${state.revision}:counter-event:${eventCard.instanceId}`,
        type: "activate-counter-event" as const,
        eventInstanceId: eventCard.instanceId,
        sourceCardNumber: eventCard.cardNumber,
        ...(power === undefined ? {} : { counterPower: power }),
        summary: `${activationSummary(eventCard.cardNumber, "[Counter]")} (${arithmetic})`,
      };
    }),
    {
      actionId: `r${state.revision}:pass-counter`,
      type: "pass",
      summary: `Resolve battle without more counters (${battleForecast(
        attackPower,
        currentDefense,
        targetInstanceId
          ? battleStake(
              state,
              playerId,
              targetInstanceId,
              state.activeAttack
                ? {
                    playerId: state.activeAttack.attackerPlayerId,
                    instanceId: state.activeAttack.attackerInstanceId,
                  }
                : undefined,
              db,
            )
          : undefined,
      )})`,
    },
    ...asideCounters,
  ];
}
