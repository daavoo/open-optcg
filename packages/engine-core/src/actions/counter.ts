/**
 * `counter`: Add a card's Counter power to the open battle.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import { addPowerModifier } from "../pending.js";
import { handCounterPower } from "../static-abilities.js";
import { type ActionContext } from "./context.js";

export function applyCounter({
  state,
  events,
  activePlayer,
  offered,
  db,
}: ActionContext<"counter">): void {
  const player = state.players[activePlayer];
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === offered.cardInstanceId,
  );
  const [card] = player.hand.splice(handIndex, 1);
  if (!card || !state.activeAttack) throw new Error("INVALID_COUNTER");
  // Read before the card leaves the hand: `handCounterPower`'s OP17-118 gate
  // asks the player's board, not the card just removed from their hand, but
  // OP17-063's aura reads the *player's own* board too, so nothing here
  // needs the card to still be in hand -- computed before the splice purely
  // to keep the two reads adjacent in one place.
  const power =
    (db.require(card.cardNumber).counter ?? 0) +
    handCounterPower(state, activePlayer, card.cardNumber, db);
  const aside = offered.targetInstanceId;
  if (aside === undefined) {
    state.activeAttack.counterPower += power;
  } else {
    // A card the attack is not pointed at: the battle's pool defends only the
    // target, so the boost sits on the card itself until the battle ends.
    addPowerModifier(state, activePlayer, aside, power, state.turn, card, true);
  }
  player.trash.push(card);
  events.push({
    type: "counter-used",
    playerId: activePlayer,
    cardNumber: card.cardNumber,
    power,
    ...(aside === undefined ? {} : { targetInstanceId: aside }),
  });
}
