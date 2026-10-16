import {
  cardAttributes,
  cards,
  hasCardName,
  type CardDatabase,
} from "@one-piece-sim/cards";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import { fieldDonCount } from "./don.js";
import type { BoardCard, GameState } from "./model.js";
import { isRemovalImmune, leaderEffectsNegated } from "./static-abilities.js";

/**
 * The one place a Character leaves the field for the trash.
 *
 * Before this existed the same four lines were repeated at the battle site, the
 * Trigger site, the pending-effect site and inside the mechanic DSL, which is
 * how the OP12-113 Trigger came to bypass replacement effects entirely. Any new
 * removal card should call this rather than splicing the board itself.
 */
export function knockOut(
  state: GameState,
  ownerId: PlayerId,
  instanceId: string,
  sourceCardNumber: string,
): { card: BoardCard; events: PublicEvent[] } | undefined {
  const player = state.players[ownerId];
  const index = player.board.findIndex(
    (card) => card.instanceId === instanceId,
  );
  if (index < 0) return undefined;
  const [card] = player.board.splice(index, 1);
  if (!card) return undefined;
  // Attached DON!! always returns rested to its owner's DON!! area.
  player.restedDon.push(...(card.attachedDon ?? []));
  player.trash.push({
    instanceId: card.instanceId,
    cardNumber: card.cardNumber,
  });
  // "[printed text omitted -- pnpm card:text <card>]" -- OP16-100
  // reads this back, and a K.O. is the only thing that writes it.
  state.characterKoedOnTurn = {
    ...state.characterKoedOnTurn,
    [ownerId]: state.turn,
  };
  return {
    card,
    events: [
      {
        type: "character-ko",
        playerId: ownerId,
        cardInstanceId: card.instanceId,
        cardNumber: card.cardNumber,
        sourceCardNumber,
      },
    ],
  };
}

export interface ReplacementOption {
  optionId: string;
  summary: string;
  /** A prevention, not a "you may": the K.O. is not on offer beside it. */
  mandatory?: true;
}

const isSlash = (cardNumber: string, db: CardDatabase): boolean =>
  cardAttributes(db.require(cardNumber)).includes("Slash");

/**
 * Replacement effects that may apply when `sourcePlayerId`'s effect would K.O.
 * `target`, which is controlled by `targetPlayerId`.
 *
 * All three cards in the format read "would be K.O.'d **by your opponent's
 * effect**", so battle destruction and self-inflicted K.O. are correctly
 * excluded by the `sourcePlayerId !== targetPlayerId` check at each call site.
 *
 * `optionPrefix` is the id the caller uses for the plain K.O., so the returned
 * options stay addressable by whatever pending effect is driving the choice.
 */
/**
 * The once-per-turn key a replacement effect books against, so a K.O. offered
 * and declined does not burn the turn's use.
 */
export const replacementKey = (
  state: GameState,
  playerId: PlayerId,
  ownerId: string,
): string => `${state.turn}:${playerId}:${ownerId}:replacement`;

/**
 * OP12-061 Donquixote Rosinante's Leader half: "[printed text omitted -- pnpm card:text OP12-061]"
 *
 * Its own function because it is the only replacement in the pool that is not
 * printed on a Character: `replacementOptionsFor` walks the board, and a Leader
 * is in no zone. It is also the only one with no "by your opponent's effect"
 * clause, so battle destruction counts -- `resolveBattle` consults this
 * directly, which the other four have no way to be.
 *
 * "[Trafalgar Law]" matches EB04-038 Rosinante & Law through its alias clause.
 */
export function rosinanteLifeProtectionAvailable(
  state: GameState,
  targetPlayerId: PlayerId,
  target: BoardCard,
): boolean {
  const player = state.players[targetPlayerId];
  return (
    player.leaderCardNumber === "OP12-061" &&
    !leaderEffectsNegated(state, targetPlayerId) &&
    hasCardName(target.cardNumber, "Trafalgar Law") &&
    player.life.length > 0 &&
    !state.oncePerTurn.includes(
      replacementKey(state, targetPlayerId, "OP12-061"),
    )
  );
}

/**
 * Applies that protection: the top Life card goes to hand and the Character
 * stays.
 *
 * A Life card taken this way is *added to hand*, not damage: no Trigger window
 * opens, which is what separates this from `dealDamage`.
 */
export function applyRosinanteLifeProtection(
  state: GameState,
  targetPlayerId: PlayerId,
): PublicEvent[] {
  const player = state.players[targetPlayerId];
  const [life] = player.life.splice(0, 1);
  if (!life) return [];
  player.hand.push({
    instanceId: life.instanceId,
    cardNumber: life.cardNumber,
  });
  state.oncePerTurn.push(replacementKey(state, targetPlayerId, "OP12-061"));
  return [
    {
      type: "card-moved",
      playerId: targetPlayerId,
      cardInstanceId: life.instanceId,
      cardNumber: life.cardNumber,
      identityVisibleTo: targetPlayerId,
      from: "life",
      to: "hand",
      position: "top",
      sourceCardNumber: "OP12-061",
    },
  ];
}

export function replacementOptionsFor(
  state: GameState,
  sourcePlayerId: PlayerId,
  targetPlayerId: PlayerId,
  target: BoardCard,
  optionPrefix: string,
  db: CardDatabase = cards,
): ReplacementOption[] {
  // Every option below reads "by your opponent's effect" on its own card.
  const byOpponent = sourcePlayerId !== targetPlayerId;
  if (!byOpponent) return [];
  // A Character that cannot be removed at all needs no replacement offered.
  if (isRemovalImmune(state, targetPlayerId, target, sourcePlayerId)) return [];
  const board = state.players[targetPlayerId].board;
  const definition = db.require(target.cardNumber);
  const targetName = definition.name;
  const options: ReplacementOption[] = [];

  if (rosinanteLifeProtectionAvailable(state, targetPlayerId, target)) {
    options.push({
      optionId: `rosinante:${optionPrefix}`,
      summary: `Add the top Life card to your hand instead of K.O. ${targetName}`,
    });
  }

  // OP14-061 Vergo: "[printed text omitted -- pnpm card:text OP14-061]"
  //
  // "Removed from the field" also covers bounce and deck-bottom effects, and
  // like OP15-052 Leo above this only sees the K.O. path, because `knockOut` is
  // still the only removal with a replacement hook.
  if (
    definition.types.includes("Donquixote Pirates") &&
    fieldDonCount(state, targetPlayerId) >= 1
  ) {
    options.push(
      ...board
        .filter(
          (card) =>
            card.cardNumber === "OP14-061" &&
            !state.oncePerTurn.includes(
              replacementKey(state, targetPlayerId, card.instanceId),
            ),
        )
        .map((vergo) => ({
          optionId: `vergo:${optionPrefix}:${vergo.instanceId}`,
          summary: `Return 1 DON!! with Vergo instead of K.O. ${targetName}`,
        })),
    );
  }

  // OP12-027 Koushirou: rest this instead, for a Slash Character of cost <= 5.
  if (isSlash(target.cardNumber, db) && (definition.cost ?? 0) <= 5) {
    options.push(
      ...board
        .filter(
          (card) =>
            card.cardNumber === "OP12-027" &&
            !card.rested &&
            card.instanceId !== target.instanceId,
        )
        .map((protector) => ({
          optionId: `protect:${optionPrefix}:${protector.instanceId}`,
          summary: `Rest Koushirou instead of K.O. ${targetName}`,
        })),
    );
  }

  // OP17-045 Kyo: "[printed text omitted -- pnpm card:text OP17-045]"
  //
  // Any Character on the board may be the one protected, gated on Kyo
  // existing and the hand actually holding 2 cards to spend.
  if (state.players[targetPlayerId].hand.length >= 2) {
    options.push(
      ...board
        .filter((card) => card.cardNumber === "OP17-045")
        .map((kyo) => ({
          optionId: `handtrash045:${optionPrefix}:${kyo.instanceId}`,
          summary: `Trash 2 cards from your hand instead of K.O. ${targetName}`,
        })),
    );
  }

  if (definition.types.includes("Revolutionary Army")) {
    // OP13-008 Emporio.Ivankov: trash itself instead.
    options.push(
      ...board
        .filter((card) => card.cardNumber === "OP13-008")
        .map((protector) => ({
          optionId: `ivankov:${optionPrefix}:${protector.instanceId}`,
          summary: `Trash Emporio.Ivankov instead of K.O. ${targetName}`,
        })),
    );
    // OP13-017 Monkey.D.Dragon: take -2000 power instead, once per turn.
    options.push(
      ...board
        .filter(
          (card) =>
            card.cardNumber === "OP13-017" &&
            !state.oncePerTurn.includes(
              `${state.turn}:${targetPlayerId}:${card.instanceId}:replacement`,
            ),
        )
        .map((dragon) => ({
          optionId: `dragon:${optionPrefix}:${dragon.instanceId}`,
          summary: `Give Monkey.D.Dragon -2000 power instead of removing ${targetName}`,
        })),
    );
  }

  return options;
}
