/**
 * What the hand offers: playing a card, and activating an Event out of it.
 *
 * One of the five kinds of offer the Main phase makes; `index.ts` composes them.
 */
import { getEventMainProgram } from "../../card-mechanics.js";
import { donAddedByProgram } from "../action-costs.js";
import { fieldDonCount } from "../../don.js";
import { eventActivationCost, playCostFromHand } from "../../hand-price.js";
import { activationSummary } from "../../board.js";
import {
  SOURCE_BINDING,
  bareGateCondition,
  conditionMatches,
  programKeywordGrant,
  programSelectsNothing,
} from "../../mechanics.js";
import type { GameState } from "../../model.js";
import type { CardDatabase } from "@one-piece-sim/cards";
import type {
  ActionCost,
  LegalAction,
  PlayerId,
} from "@one-piece-sim/protocol";

export function handOffers(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase,
): LegalAction[] {
  const player = state.players[playerId];
  const actions: LegalAction[] = [];
  for (const [index, instance] of player.hand.entries()) {
    // `require` throws for an identity the card database has never heard of,
    // which is the only sense in which a card in hand can be unsupported.
    const definition = db.require(instance.cardNumber);
    const cost =
      definition.cost === null
        ? null
        : playCostFromHand(
            state,
            playerId,
            instance.cardNumber,
            definition.cost,
          );
    if (
      cost !== null &&
      cost <= player.activeDon.length &&
      (definition.category === "character" ||
        definition.category === "stage") &&
      // OP17-085/092: "[printed text omitted -- pnpm card:text OP17-085]"
      // A Stage stays playable -- only the Character half of the turn is
      // shut off.
      // "[printed text omitted -- pnpm card:text OP17-085]" (OP13-028
      // Shanks) bars every category, which is what separates it from the
      // Character-only ban below.
      (player.cannotPlayFromHandUntilTurn ?? -1) < state.turn &&
      !(
        definition.category === "character" &&
        (player.cannotPlayCharactersUntilTurn ?? -1) >= state.turn &&
        // A cost floor on the ban, where the clause printed one: OP12-030
        // Dracule Mihawk bars only "a base cost of 7 or more", so the cheap
        // half of the hand is still playable.
        (definition.cost ?? 0) >= (player.cannotPlayCharactersMinCost ?? 0)
      )
    ) {
      actions.push({
        actionId: `r${state.revision}:play:${index}:${instance.instanceId}`,
        type: "play-card",
        cardInstanceId: instance.instanceId,
        summary: `Play ${definition.name} [${definition.cardNumber}] (cost ${cost} DON!!)`,
      });
    }
    // Events with a `[Main]` program in the mechanic table. One branch covers
    // all of them, rather than a pair of branches per Event.
    const eventProgram = getEventMainProgram(instance.cardNumber);
    // Through `eventActivationCost`, not `eventProgram.cost`: a card that
    // prices itself in the hand (OP15-021) is payable below its printed cost,
    // and `actions/activate-main.ts` charges the same function.
    const eventCostInDon = eventProgram
      ? eventActivationCost(
          state,
          playerId,
          instance.cardNumber,
          eventProgram.cost,
          db,
        )
      : 0;
    if (
      eventProgram &&
      player.activeDon.length >= eventCostInDon + (eventProgram.restDon ?? 0) &&
      fieldDonCount(state, playerId) >= (eventProgram.donMinus ?? 0) &&
      // The Event itself is on its way out of the hand, so it cannot pay for
      // its own hand cost.
      player.hand.length - 1 >= (eventProgram.trashFromHand ?? 0)
    ) {
      // A program whose whole effect is gated on a condition (a top-level
      // `if` with no `else`) resolves to nothing when that condition fails --
      // the Event is trashed for no effect. Offering it anyway hands a rules
      // agent a "use an available Main-phase effect" action it will take
      // blindly, wasting the card (OP17-038's "rest 4 of your cards" gate is
      // the case that surfaced this: cost 0, so every cost gate passes, but
      // with fewer than 4 restable cards on board the whole clause is
      // unreachable). Gate the offer on the same `bareGateCondition` the
      // `[Activate: Main]` path uses, so a card that would do nothing is not
      // offered at all. This is semantically identical to resolving it -- the
      // condition has no `else`, so a failed gate means the Event does nothing
      // either way -- and it fixes the waste for every controller (rules
      // agent, LLM, human), not just one policy.
      //
      // The gate is read in the position the program resolves in: 8-4-2
      // trashes the Event before its effect, and `actions/activate-main.ts`
      // does the same, so the Event is one of "15 or more cards in your trash"
      // (OP15-095) and no longer one of the cards in hand.
      const eventGate = bareGateCondition(eventProgram.program);
      const eventGateMet =
        !eventGate ||
        conditionMatches(
          {
            ...state,
            players: {
              ...state.players,
              [playerId]: {
                ...player,
                hand: player.hand.filter((card) => card !== instance),
                trash: [...player.trash, instance],
              },
            },
          },
          { sourcePlayerId: playerId, source: instance },
          eventGate,
          { [SOURCE_BINDING]: [instance.instanceId] },
          db,
        );
      if (!eventGateMet) continue;
      const eventGrant = programKeywordGrant(eventProgram.program);
      // The printed costs beyond the DON!! price, so a policy can weigh a
      // `DON!! -N` Event against a body without knowing the card. The same
      // three fields the offer above was already gated on.
      const eventCost: ActionCost = {
        ...(eventProgram.donMinus ? { returnsDon: eventProgram.donMinus } : {}),
        ...(eventProgram.restDon ? { restsDon: eventProgram.restDon } : {}),
        ...(eventProgram.trashFromHand
          ? { trashesFromHand: eventProgram.trashFromHand }
          : {}),
      };
      const eventRamps = donAddedByProgram(eventProgram.program);
      const optionId = `mechanic-event:${instance.instanceId}`;
      actions.push({
        actionId: `r${state.revision}:activate:${optionId}`,
        type: "activate-main",
        optionId,
        sourceCardNumber: instance.cardNumber,
        sourceInstanceId: instance.instanceId,
        ...(programSelectsNothing(
          state,
          { sourcePlayerId: playerId, source: instance },
          eventProgram.program,
          db,
        )
          ? { selectsNothing: true as const }
          : {}),
        ...(eventGrant ? { grants: eventGrant } : {}),
        ...(Object.keys(eventCost).length > 0 ? { cost: eventCost } : {}),
        ...(eventRamps ? { ramps: eventRamps } : {}),
        summary: activationSummary(
          definition.cardNumber,
          "[Main]",
          "[Activate: Main]",
        ),
      });
    }
  }
  return actions;
}
