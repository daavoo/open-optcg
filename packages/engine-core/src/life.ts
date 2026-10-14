import type {
  CardZoneName,
  PlayerId,
  PublicEvent,
} from "@one-piece-sim/protocol";
import type { CardInstance, GameState } from "./model.js";
import { faceUpLifeBanksToDeck } from "./static-abilities.js";

/**
 * Every mutation of a Life stack, in one place, each one emitting its own step.
 *
 * Life used to be mutated inline wherever an effect needed it -- roughly a
 * dozen `player.life.unshift(...)` / `.shift()` / `.splice(...)` sites spread
 * across `effects.ts`, `mechanics.ts` and `engine.ts`. About half of them
 * emitted a `life-added` event and the rest emitted nothing at all, so a card
 * taken out of Life, or turned face-up in place, changed the board with no
 * trace in the log. That is how EB03-053 Nami could pull the opponent's top
 * Life card into their hand and fire the OP11-041 Leader draw with the UI
 * showing neither step.
 *
 * Routing the mutations through these helpers makes the event a property of the
 * operation rather than something each call site has to remember. If you need a
 * new way to move a card in or out of Life, add it here.
 */

/**
 * Where a Life card taken by *damage* finally lands, and the step that says so.
 *
 * Damage ends in three different places -- the no-Trigger path in `battle.ts`,
 * the declined-Trigger path in `actions/resolve-trigger.ts` and effect damage in
 * `pending.ts` -- and all three used to push the card into the hand themselves
 * with a copy of the same redacted `card-moved`. ST13-003's Leader sends a
 * *face-up* Life card to the bottom of the deck instead, and a rule that has to
 * be true at every one of those three sites is a rule that belongs at one.
 *
 * The redaction is the reason the step is built here too: a face-down Life card
 * was unknown to both players, so landing it in a hand names it to its owner
 * alone. A card going to the bottom of the deck is never named -- and under
 * ST13-003 it is face-up and public already, so there is nothing to redact.
 */
export function bankDamagedLifeCard(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db?: Parameters<typeof faceUpLifeBanksToDeck>[2],
): PublicEvent[] {
  const toDeck =
    card.faceUp === true && faceUpLifeBanksToDeck(state, playerId, db);
  const landed = { instanceId: card.instanceId, cardNumber: card.cardNumber };
  if (toDeck) {
    state.players[playerId].deck.push(landed);
  } else {
    state.players[playerId].hand.push(landed);
  }
  return [
    {
      type: "card-moved",
      playerId,
      cardInstanceId: card.instanceId,
      cardNumber: card.cardNumber,
      from: "life",
      to: toDeck ? "deck" : "hand",
      position: toDeck ? "bottom" : "top",
      ...(card.faceUp !== true && !toDeck
        ? { identityVisibleTo: playerId }
        : {}),
    },
  ];
}

/** Which end of the stack an operation acts on. */
export type LifePosition = "top" | "bottom";

/**
 * Every effect in the format reaches Life from one end or the other, so this
 * only has to tell the top card from the rest.
 */
function lifePositionOf(index: number): LifePosition {
  return index === 0 ? "top" : "bottom";
}

/**
 * Put a card into a Life stack.
 *
 * `from` is where it came from, which the log needs: "added the top card of
 * your deck to Life" and "put a Character from the board into Life" are
 * different steps and read differently.
 */
export function addToLife(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  options: {
    from: CardZoneName;
    position?: LifePosition;
    faceUp?: boolean;
    sourceCardNumber?: string;
  },
): PublicEvent[] {
  const { from, position = "top", faceUp = false, sourceCardNumber } = options;
  // Face-down is the absence of the flag, not `faceUp: false`. Setup deals Life
  // as bare instances and every read tests `faceUp === true`, so writing the
  // flag only when it is true keeps one representation of a face-down card and
  // leaves the state hash of an ordinary game untouched.
  const entry: CardInstance = {
    instanceId: card.instanceId,
    cardNumber: card.cardNumber,
    ...(faceUp ? { faceUp: true } : {}),
  };
  const life = state.players[playerId].life;
  if (position === "top") life.unshift(entry);
  else life.push(entry);
  return [
    {
      type: "card-moved",
      playerId,
      // A card entering Life face-down stops being public knowledge, even for
      // its owner, so only a face-up placement names the card.
      cardInstanceId: faceUp ? entry.instanceId : null,
      cardNumber: faceUp ? entry.cardNumber : null,
      from,
      to: "life",
      position,
      faceUp,
      ...(sourceCardNumber ? { sourceCardNumber } : {}),
    },
  ];
}

/**
 * Take a specific card out of a Life stack and put it somewhere else.
 *
 * Returns the card so the caller can keep using it, plus the step. `to` is
 * applied by the caller -- the destination zones differ enough (hand keeps a
 * bare instance, board needs rested/playedTurn) that doing it here would mean
 * reimplementing half of the mechanics interpreter.
 */
export function takeFromLife(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  options: { to: CardZoneName; sourceCardNumber?: string },
): { card: CardInstance; events: PublicEvent[] } | null {
  const life = state.players[playerId].life;
  const index = life.findIndex((card) => card.instanceId === instanceId);
  if (index < 0) return null;
  const position = lifePositionOf(index);
  const [card] = life.splice(index, 1);
  if (!card) return null;
  return {
    card,
    events: [
      {
        type: "card-moved",
        playerId,
        cardInstanceId: card.instanceId,
        cardNumber: card.cardNumber,
        from: "life",
        to: options.to,
        position,
        ...(options.sourceCardNumber
          ? { sourceCardNumber: options.sourceCardNumber }
          : {}),
        // A face-down Life card is unknown to both players until it moves.
        // Sending it to a hand reveals it to its owner alone; anywhere else
        // (trash, board) is public, and a face-up card was public already.
        ...(card.faceUp !== true && options.to === "hand"
          ? { identityVisibleTo: playerId }
          : {}),
      },
    ],
  };
}

/** Take the card at one end of a Life stack. */
export function takeLifeAt(
  state: GameState,
  playerId: PlayerId,
  position: LifePosition,
  options: { to: CardZoneName; sourceCardNumber?: string },
): { card: CardInstance; events: PublicEvent[] } | null {
  const life = state.players[playerId].life;
  const card = position === "top" ? life[0] : life.at(-1);
  if (!card) return null;
  return takeFromLife(state, playerId, card.instanceId, options);
}

/**
 * Deal 1 damage outside the battle steps.
 *
 * The only source in the format is EB03-055 Nico Robin's `[Opponent's Turn]
 * [On K.O.] You may deal 1 damage to your opponent`, which is why this lives
 * here rather than in `engine.ts`: the mechanics interpreter runs that clause and
 * cannot import the engine, and both need the same three outcomes -- the Life
 * card leaves the stack, a player at zero Life loses, and a damaged card with a
 * `[Trigger]` owes its owner a decision.
 *
 * The damaged card is parked in `state.pendingTrigger` rather than pushed to
 * hand, because whether the Trigger window opens depends on which Triggers the
 * engine can run, which is knowledge only the engine has. `settleEffectDamage`
 * in `engine.ts` finishes the job on the way out of the action; until it does,
 * the card is accounted for by the zone invariants through `pendingTrigger`.
 */
export function dealDamage(
  state: GameState,
  playerId: PlayerId,
  /**
   * Whether the card dealing this damage has [Banish]: the Life card is
   * trashed and no Trigger window opens.
   *
   * Only the second point of [Double Attack] battle damage passes it --
   * `resolveBattle` answers the first point itself, and no *effect* in the pool
   * banishes. See `pendingBattleDamage.banish`.
   */
  banish = false,
): PublicEvent[] {
  // One point of damage per resolution, because the card that is parked here is
  // parked until the engine settles it. Nothing in the format deals two points
  // outside battle; a card that does needs the settle step to run between them,
  // and this says so loudly rather than dropping the first damaged card.
  if (state.pendingTrigger) {
    throw new Error("PENDING_TRIGGER_ALREADY_OPEN");
  }
  const player = state.players[playerId];
  const damaged = player.life.shift();
  if (!damaged) {
    // Damage with no Life left ends the game, exactly as battle damage does.
    const winner: PlayerId = playerId === "p1" ? "p2" : "p1";
    state.phase = "finished";
    state.winner = winner;
    state.resultReason = "life";
    return [{ type: "game-ended", winner, reason: "life" }];
  }
  if (banish) {
    player.trash.push(damaged);
    return [
      { type: "damage-taken", playerId, lifeRemaining: player.life.length },
      {
        type: "card-moved",
        playerId,
        cardInstanceId: damaged.instanceId,
        cardNumber: damaged.cardNumber,
        from: "life",
        to: "trash",
      },
    ];
  }
  state.pendingTrigger = { playerId, card: damaged, fromEffect: true };
  return [
    { type: "damage-taken", playerId, lifeRemaining: player.life.length },
  ];
}

/**
 * Turn a Life card over in place.
 *
 * No-op (and no step) if it is already the requested way up, so a caller that
 * flips defensively does not spam the log.
 */
export function flipLife(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  faceUp: boolean,
  sourceCardNumber?: string,
): PublicEvent[] {
  const life = state.players[playerId].life;
  const index = life.findIndex((card) => card.instanceId === instanceId);
  const card = life[index];
  if (!card || (card.faceUp === true) === faceUp) return [];
  card.faceUp = faceUp;
  return [
    {
      type: "life-flipped",
      playerId,
      cardInstanceId: card.instanceId,
      // Turning a card back face-down un-reveals it: the log should not keep
      // naming a card the players are no longer entitled to see.
      cardNumber: faceUp ? card.cardNumber : null,
      faceUp,
      position: lifePositionOf(index),
      ...(sourceCardNumber ? { sourceCardNumber } : {}),
    },
  ];
}
