/**
 * Everything legal in the Main phase.
 *
 * The largest of the offer generators by a distance, because the Main phase is
 * where every optional ability, cost and target lives. It was one 1,100-line
 * function in which the five kinds of offer it makes were separated by nothing
 * but blank lines; each kind is a module now, and this is the composition.
 *
 * The order below is part of the contract, not a detail. An `actionId` is
 * opaque, but a recorded trace replays an action list, so moving a kind of
 * offer past another changes what a stored actionId resolves to. There used to
 * be a second block of activation offers *after* the DON!! offers -- the
 * hand-written per-card ones -- and merely concatenating the two halves
 * re-recorded the replay fixture into a different game, with a different action
 * at revision 13 and a different winner. Those cards are all in
 * `mechanicActivationOffers` now, so the fixture moved once, deliberately, when
 * they migrated.
 *
 * See `../index.ts` for how the phases fit together.
 */
import {
  cards as defaultCardDatabase,
  type CardDatabase,
} from "@one-piece-sim/cards";
import { type LegalAction, type PlayerId } from "@one-piece-sim/protocol";

import { type GameState } from "../../model.js";
import { effectsNegated } from "../../static-abilities.js";
import { mechanicActivationOffers } from "./activations.js";
import { attackOffers } from "./attacks.js";
import { donOffers } from "./don.js";
import { handOffers } from "./hand.js";
import { passOffer } from "./pass.js";

export function mainActions(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): LegalAction[] {
  const actions = [
    ...handOffers(state, playerId, db),
    ...mechanicActivationOffers(state, playerId, db),
    ...donOffers(state, playerId, db),
    ...attackOffers(state, playerId, db),
  ];
  actions.push(passOffer(state, playerId, actions));
  // A Character whose effects are negated offers no abilities. Filtering the
  // finished list is deliberate: the activations above are built by a dozen
  // separate branches, and a check in each is a check the next card added will
  // be missing. Attacking is not an ability, so `attack` actions are untouched.
  return actions.filter(
    (action) =>
      !("sourceInstanceId" in action) ||
      !effectsNegated(state, action.sourceInstanceId),
  );
}
