import type { CardDatabase } from "@one-piece-sim/cards";
import type { PublicEvent } from "@one-piece-sim/protocol";
import type { GameState, PendingEffect } from "../model.js";

/**
 * What every effect resolver is given: the state to mutate, the pending effect
 * narrowed to its kind, and the option the player picked.
 *
 * `optionId` is opaque by contract to callers, but each resolver knows the shape
 * its own kind produces -- `"skip"`, an instance id, or a prefixed form like
 * `"ivankov:target:ivankov"` -- and validates it, throwing
 * `INVALID_EFFECT_OPTION` rather than resolving something the player did not
 * choose.
 */
export interface EffectContext<
  K extends PendingEffect["kind"] = PendingEffect["kind"],
> {
  state: GameState;
  effect: Extract<PendingEffect, { kind: K }>;
  optionId: string;
  db: CardDatabase;
}

export type EffectResolver<K extends PendingEffect["kind"]> = (
  ctx: EffectContext<K>,
) => PublicEvent[];

/**
 * The dispatch table's type: mapped over every `PendingEffect` kind, so a new
 * kind without a resolver fails to compile.
 */
export type EffectResolvers = {
  [K in PendingEffect["kind"]]: EffectResolver<K>;
};
