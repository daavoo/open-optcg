import type { BoardCard, CardInstance } from "@one-piece-sim/engine-core";

/**
 * A Character on the board, with the fields a scenario almost never cares about
 * filled in.
 *
 * Hand-rolled copies of this helper existed in 24 test files, each with a
 * slightly different set of defaults, which made "why does this test see Rush"
 * a question about the helper rather than about the card.
 */
export function character(
  instanceId: string,
  cardNumber: string,
  overrides: Partial<Omit<BoardCard, "instanceId" | "cardNumber">> = {},
): BoardCard {
  return {
    instanceId,
    cardNumber,
    rested: false,
    playedTurn: 1,
    attachedDon: [],
    powerModifiers: [],
    ...overrides,
  };
}

/** A card in a zone that is not the board: hand, deck, trash, Life. */
export function instance(
  instanceId: string,
  cardNumber: string,
  overrides: Partial<Omit<CardInstance, "instanceId" | "cardNumber">> = {},
): CardInstance {
  return { instanceId, cardNumber, ...overrides };
}

/**
 * Several cards of the same card number, ids suffixed `-1`, `-2`, ... -- for
 * "four copies of this Event in hand" without naming each one.
 */
export function copies(
  count: number,
  cardNumber: string,
  prefix = cardNumber.toLowerCase(),
): CardInstance[] {
  return Array.from({ length: count }, (_, index) =>
    instance(`${prefix}-${index + 1}`, cardNumber),
  );
}
