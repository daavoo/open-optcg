/**
 * The declarative half of replacement effects.
 *
 * `removal.ts` owns the hand-written replacements the format shipped with, and
 * deliberately depends on nothing from the mechanic DSL: `mechanics.ts`
 * imports `knockOut` from it, so a dependency the other way would close a cycle
 * through every set module. This module sits on the DSL side of that edge and
 * holds the registry walk, and the two places that offer a replacement --
 * `resolve-effect/removal.ts` and `actions/resolve-trigger.ts` -- concatenate
 * the two lists.
 */
import { cards, type CardDatabase } from "@one-piece-sim/cards";
import type { PlayerId } from "@one-piece-sim/protocol";
import {
  eligibleReplacements,
  selectCards,
  type CardSelector,
  type RemovalCause,
} from "./mechanics.js";
import type { BoardCard, GameState } from "./model.js";
import { type ReplacementOption } from "./removal.js";
import { isRemovalImmune } from "./static-abilities.js";

/**
 * The protector a `mechanic:<threatened>:<protector>` option names, as the
 * offer paths that resolve one need it.
 *
 * A board Character, or the Leader pseudo-card: EB03-001 Nefeltari Vivi and
 * OP05-001 Sabo are Leaders printing a replacement, and `eligibleReplacements`
 * offers them under `${playerId}-leader` -- an id no walk over `board` finds.
 * The pseudo-card is the same shape `eligibleReplacements` itself builds.
 */
export function replacementProtector(
  state: GameState,
  playerId: PlayerId,
  protectorId: string,
): BoardCard | undefined {
  if (protectorId === `${playerId}-leader`) {
    return {
      instanceId: protectorId,
      cardNumber: state.players[playerId].leaderCardNumber,
    } as BoardCard;
  }
  // A replacement the player *installed* for a window rather than one printed
  // on a card on the field -- EB02-030, offered by `eligibleReplacements` under
  // `${playerId}-installed-<card>`, an id no walk over `board` finds either.
  // The booking's own expiry is not re-checked here: the offer that named it
  // was built from the live list a moment ago, and a turn cannot end between
  // an offer and the answer to it.
  const installed = `${playerId}-installed-`;
  if (protectorId.startsWith(installed)) {
    const cardNumber = protectorId.slice(installed.length);
    return (state.players[playerId].installedReplacements ?? []).some(
      (entry) => entry.cardNumber === cardNumber,
    )
      ? ({ instanceId: protectorId, cardNumber } as BoardCard)
      : undefined;
  }
  return state.players[playerId].board.find(
    (card) => card.instanceId === protectorId,
  );
}

/** The cards in hand that may pay a registered replacement's trash cost. */
export function replacementHandPayers(
  state: GameState,
  playerId: PlayerId,
  protector: BoardCard,
  match: Omit<CardSelector, "player" | "zone"> | undefined,
  db: CardDatabase = cards,
): readonly { instanceId: string }[] {
  return selectCards(
    state,
    { sourcePlayerId: playerId, source: protector },
    { ...(match ?? {}), player: "self", zone: "hand" },
    {},
    db,
  );
}

/**
 * Replacement options from the `replacement` registry, for a K.O. of `target`.
 *
 * The registry counterpart of `replacementOptionsFor`, with the same signature
 * and the same `optionPrefix` contract.
 */
export function registeredReplacementOptions(
  state: GameState,
  sourcePlayerId: PlayerId,
  targetPlayerId: PlayerId,
  target: BoardCard,
  optionPrefix: string,
  db: CardDatabase = cards,
  cause: RemovalCause = "effect",
): ReplacementOption[] {
  if (
    isRemovalImmune(
      state,
      targetPlayerId,
      target,
      sourcePlayerId,
      undefined,
      db,
    )
  )
    return [];
  const targetName = db.require(target.cardNumber).name;
  return eligibleReplacements(
    state,
    sourcePlayerId,
    targetPlayerId,
    target,
    db,
    cause,
  ).map(({ protector, entry }) => ({
    optionId: `mechanic:${optionPrefix}:${protector.instanceId}`,
    summary: `${entry.label} instead of K.O. ${targetName}`,
    ...(entry.mandatory ? { mandatory: true as const } : {}),
  }));
}
