/**
 * `play-card`: Pay a card's cost out of hand and put it on the field, then open its `[On Play]`.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import { playCostFromHand } from "../hand-price.js";
import { createOnPlayEffect, placeCharacter } from "../effects.js";
import { EngineError } from "../errors.js";
import { handOverPendingEffect } from "../pending.js";
import { type ActionContext } from "./context.js";

export function applyPlayCard({
  state,
  events,
  activePlayer,
  offered,
  db,
}: ActionContext<"play-card">): void {
  const player = state.players[activePlayer];
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === offered.cardInstanceId,
  );
  const [card] = player.hand.splice(handIndex, 1);
  if (!card)
    throw new EngineError(
      "ILLEGAL_ACTION",
      "The selected card is no longer in hand.",
    );
  const definition = db.require(card.cardNumber);
  const cost = playCostFromHand(
    state,
    activePlayer,
    card.cardNumber,
    definition.cost ?? 0,
    { spend: true },
    db,
  );
  player.restedDon.push(...player.activeDon.splice(0, cost));
  let onPlay;
  if (definition.category === "stage") {
    if (player.stage) {
      player.trash.push({
        instanceId: player.stage.instanceId,
        cardNumber: player.stage.cardNumber,
      });
    }
    player.stage = { ...card, rested: false };
    events.push({
      type: "stage-played",
      playerId: activePlayer,
      cardInstanceId: card.instanceId,
      cardNumber: card.cardNumber,
    });
    onPlay = createOnPlayEffect(state, activePlayer, card, db);
  } else {
    onPlay = placeCharacter(state, activePlayer, card, false, db);
  }
  state.pendingEffect = onPlay.pending;
  handOverPendingEffect(state);
  events.push(...onPlay.events);
}
