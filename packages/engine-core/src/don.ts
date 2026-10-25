import { hasCardType } from "@one-piece-sim/cards";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import type { GameState } from "./model.js";

/**
 * DON!! movement, in one place.
 *
 * These used to live in `effects.ts`. The mechanic DSL needs them too -- purple
 * pays `DON!! −N` as a cost on eight cards in the Enel list and gains DON!! back
 * from its Leader -- and `effects.ts` already imports the DSL, so leaving them
 * there would have made the cycle.
 */

const leaderInstanceId = (playerId: PlayerId): string => `${playerId}-leader`;

/**
 * The two pools that hold DON!! not given to a card. Every other pool is named
 * by the instance id of the Leader or Character holding the DON!!, so a pool
 * name is either one of these or something `locate` can find.
 */
export const DON_POOL_ACTIVE = "active";
export const DON_POOL_RESTED = "rested";

/**
 * The DON!! array a pool name refers to, or undefined if nothing holds it.
 *
 * Read-only: a Character that has never been given DON!! keeps `attachedDon`
 * unset rather than gaining an empty array, because this runs on the
 * legal-action path and that path must not touch the state it reports on.
 */
function donPool(
  state: GameState,
  playerId: PlayerId,
  pool: string,
): string[] | undefined {
  const player = state.players[playerId];
  if (pool === DON_POOL_ACTIVE) return player.activeDon;
  if (pool === DON_POOL_RESTED) return player.restedDon;
  if (pool === leaderInstanceId(playerId)) return player.leaderAttachedDon;
  return player.board.find((entry) => entry.instanceId === pool)?.attachedDon;
}

/** The DON!! array a pool name refers to, created if the pool can hold one. */
function writableDonPool(
  state: GameState,
  playerId: PlayerId,
  pool: string,
): string[] | undefined {
  const card = state.players[playerId].board.find(
    (entry) => entry.instanceId === pool,
  );
  if (card) return (card.attachedDon ??= []);
  return donPool(state, playerId, pool);
}

// Nothing here adjusts a battle in progress when DON!! moves on or off its
// attacker. It used to: the attack's power was a scalar frozen at declaration,
// so `returnDonToDeck` and `placeReturnedDon` docked and credited it by hand to
// keep it in step with `attachedDon`. `battleAttackPower` now reads the card, so
// moving the DON!! is the whole of the change.

/** Every DON!! the player controls: active, rested, and given to a card. */
export function fieldDonCount(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  return (
    player.activeDon.length +
    player.restedDon.length +
    player.leaderAttachedDon.length +
    player.board.reduce(
      (total, card) => total + (card.attachedDon?.length ?? 0),
      0,
    )
  );
}

/** Moves DON!! from the DON!! deck onto the field. Returns how many moved. */
export function addDonFromDeck(
  state: GameState,
  playerId: PlayerId,
  count: number,
  posture: "active" | "rested",
): number {
  const player = state.players[playerId];
  const moved = player.donDeck.splice(0, count);
  player[posture === "active" ? "activeDon" : "restedDon"].push(...moved);
  return moved.length;
}

/**
 * Reactions to a DON!! card leaving its controller's own field for the DON!!
 * deck, on the controller's own turn -- the same window ST34-001 Katakuri's
 * inline branch inside `returnDonToDeck` already reacts to.
 *
 * A registry rather than a second bespoke branch, since `[Once Per Turn]`
 * bookkeeping and the `[Your Turn]` gate below are identical for any card
 * with this trigger clause. Katakuri's own consequence ("give 2 DON!! back
 * rested") is left as its pre-existing inline branch rather than folded into
 * this table: migrating it would also mean moving ST34-001 out of
 * `LEGACY_IMPERATIVE_CARDS` in `test/card-support.test.ts` and lowering that
 * file's budget, unrelated churn for a card this change does not otherwise
 * touch.
 *
 * `donReturnedReactionCards`, below, feeds `mechanicProgramCards()` in
 * `card-mechanics.ts` so the coverage ratchet in `test/card-support.test.ts`
 * sees these cards as claimed. The dispatch itself cannot live in
 * `card-mechanics.ts` as an ordinary `MechanicProgram`: that module imports
 * `mechanics.ts`, which imports `returnDonToDeck` from here, so this file
 * importing back from either would be a cycle. Both registered reactions are
 * plain "up to 1" takes with no target choice, so reading them directly off
 * `addDonFromDeck`/`activeDon`/`restedDon` here costs nothing next to running
 * a full mechanic program for them.
 */
const ON_DON_RETURNED_REACTIONS: readonly {
  cardNumber: string;
  /**
   * Which turn the printed clause names. OP17-062 Kaido prints `[Your Turn]`
   * and OP14-068 Trebol prints `[Opponent's Turn]`, so the gate cannot stay
   * hardcoded around the loop the way it was while Kaido was the only entry.
   */
  turn: "own" | "opponent";
  /** A further printed gate, e.g. OP14-068's Leader type. */
  when?: (state: GameState, playerId: PlayerId) => boolean;
  apply: (state: GameState, playerId: PlayerId, events: PublicEvent[]) => void;
}[] = [
  {
    // OP17-062 Kaido: "[printed text omitted -- pnpm card:text OP17-062]" [Blocker] is a plain static keyword handled elsewhere.
    //
    // Both halves are "up to 1", and `add-don`/`activate-don` in
    // `mechanics.ts` already treat every "up to N" DON!! clause as "take what
    // is there" rather than a real 0-vs-N choice -- there is nothing to
    // decline, since taking DON!! as active is strictly better than not. This
    // reaction matches that convention rather than introducing a choice
    // nothing else in the DON!! DSL offers.
    //
    // Neither half can itself return a DON!! to the deck -- both only move
    // DON!! onto the field -- so there is no risk of this reaction
    // re-entering `returnDonToDeck` and firing itself again.
    cardNumber: "OP17-062",
    turn: "own",
    apply: (state, playerId, events) => {
      const added = addDonFromDeck(state, playerId, 1, "active");
      if (added > 0) {
        events.push({
          type: "don-added",
          playerId,
          count: added,
          rested: false,
          sourceCardNumber: "OP17-062",
        });
      }
      const player = state.players[playerId];
      const activated = player.restedDon.splice(0, 1);
      player.activeDon.push(...activated);
      if (activated.length > 0) {
        events.push({
          type: "don-activated",
          playerId,
          count: activated.length,
          sourceCardNumber: "OP17-062",
        });
      }
    },
  },
  {
    // OP14-068 Trebol: "[printed text omitted -- pnpm card:text OP14-068]"
    //
    // The DON!! comes back rested rather than active, so this refills the
    // *count* on the field without refilling what can be spent -- which is
    // exactly what the colour's own `DON!! −N` costs and OP14-070 Buffalo read.
    // `[Opponent's Turn]` is what makes it a defensive engine: Purple pays
    // `DON!! −N` on the other player's turn through OP14-060's redirect,
    // OP14-078's Counter and OP14-070's own stand-up.
    cardNumber: "OP14-068",
    turn: "opponent",
    when: (state, playerId) =>
      hasCardType(
        state.players[playerId].leaderCardNumber,
        "Donquixote Pirates",
      ),
    apply: (state, playerId, events) => {
      const added = addDonFromDeck(state, playerId, 1, "rested");
      if (added > 0) {
        events.push({
          type: "don-added",
          playerId,
          count: added,
          rested: true,
          sourceCardNumber: "OP14-068",
        });
      }
    },
  },
];

/** Cards claimed by `ON_DON_RETURNED_REACTIONS`, for coverage bookkeeping. */
export function donReturnedReactionCards(): readonly string[] {
  return ON_DON_RETURNED_REACTIONS.map((reaction) => reaction.cardNumber);
}

/**
 * Pays `DON!! −N` by returning DON!! from the field to the DON!! deck.
 *
 * Takes rested DON!! first, then active, then DON!! given to the Leader, then
 * DON!! given to Characters, because that order costs the controller least. An
 * attack in progress loses the power a returned DON!! was providing.
 *
 * The printed cost is "[printed text omitted -- pnpm card:text <card>]", which is the controller's choice, not the engine's. Rather than make
 * every caller stop mid-resolution to ask -- there are nine, several of them
 * inside effect bodies that go on to read the result -- this takes the cheapest
 * DON!! immediately and records where each one came from in `state.donReturn`.
 * `offerDonReturnChoice` then lets the controller re-home them once the action
 * has finished resolving, before anyone can act again. Totals are therefore
 * correct the moment the cost is paid, which is what the "[printed text omitted -- pnpm card:text <card>]" checks all over the Enel list actually read.
 */
export function returnDonToDeck(
  state: GameState,
  playerId: PlayerId,
  count: number,
  source: { cardNumber: string; instanceId: string },
  events: PublicEvent[],
  /**
   * Which pile the DON!! may come out of. Absent, the whole field in the order
   * below -- the cheapest DON!! first.
   *
   * `"active"` is EB02-061 Monkey.D.Luffy's "return 2 of your **active** DON!!
   * cards", the only printed return in the pool that names a pile. The default
   * order cannot stand in for it: it takes rested DON!! first, and a rested
   * DON!! on a `[When Attacking]` has already been spent, so the cheapest
   * reading hands the restand over for nothing. Named here rather than left to
   * the caller because it also keeps these DON!! out of `state.donReturn`: the
   * re-homing offer spans every pile, and a cost that names one leaves the
   * controller nothing to choose -- active DON!! are interchangeable.
   */
  from?: "active",
): number {
  const player = state.players[playerId];
  const returned: string[] = [];
  const origins: string[] = [];
  const take = (zone: string[], pool: string) => {
    const moved = zone.splice(
      0,
      Math.min(count - returned.length, zone.length),
    );
    returned.push(...moved);
    origins.push(...moved.map(() => pool));
  };
  if (from === "active") {
    take(player.activeDon, DON_POOL_ACTIVE);
  } else {
    take(player.restedDon, DON_POOL_RESTED);
    take(player.activeDon, DON_POOL_ACTIVE);
    take(player.leaderAttachedDon, leaderInstanceId(playerId));
    for (const card of player.board) {
      if (returned.length >= count) break;
      take(card.attachedDon ?? [], card.instanceId);
    }
  }
  player.donDeck.push(...returned);
  if (returned.length > 0) {
    events.push({
      type: "don-returned",
      playerId,
      count: returned.length,
      sourceCardNumber: source.cardNumber,
    });
  }
  if (origins.length > 0 && from === undefined) {
    // Two returns inside one action -- an effect that pays a cost and then
    // forces the same player to return more -- are re-homed as one choice.
    const existing =
      state.donReturn?.playerId === playerId ? state.donReturn : undefined;
    state.donReturn = {
      playerId,
      sourceCardNumber: source.cardNumber,
      sourceInstanceId: source.instanceId,
      origins: [...(existing?.origins ?? []), ...origins],
      // The first payment's snapshot holds for the merged choice: a DON!! that
      // arrived between the two was not there to pay the first.
      onFieldAtPayment:
        existing?.onFieldAtPayment ?? fieldDonIds(state, playerId),
    };
  }

  if (returned.length > 0) {
    if (state.turnPlayerId === playerId) {
      // ST34-001 Katakuri: once per turn, returning DON!! gives two back
      // rested behind a {Big Mom Pirates} Leader. The trigger is mandatory, so
      // it spends its use even when the Leader check or an empty DON!! deck
      // leaves it nothing to add (Bandai's ST34-001#1).
      const bigMomLeader = hasCardType(
        player.leaderCardNumber,
        "Big Mom Pirates",
      );
      for (const katakuri of player.board.filter(
        (card) => card.cardNumber === "ST34-001",
      )) {
        const key = `${state.turn}:${playerId}:${katakuri.instanceId}:don-return`;
        if (state.oncePerTurn.includes(key)) continue;
        state.oncePerTurn.push(key);
        if (!bigMomLeader) continue;
        const given = addDonFromDeck(state, playerId, 2, "rested");
        if (given > 0) {
          events.push({
            type: "don-added",
            playerId,
            count: given,
            rested: true,
            sourceCardNumber: katakuri.cardNumber,
          });
        }
      }
    }
    for (const reaction of ON_DON_RETURNED_REACTIONS) {
      const onOwnTurn = state.turnPlayerId === playerId;
      if (reaction.turn === "own" ? !onOwnTurn : onOwnTurn) continue;
      if (reaction.when && !reaction.when(state, playerId)) continue;
      for (const card of player.board.filter(
        (entry) => entry.cardNumber === reaction.cardNumber,
      )) {
        const key = `${state.turn}:${playerId}:${card.instanceId}:don-returned-reaction`;
        if (state.oncePerTurn.includes(key)) continue;
        state.oncePerTurn.push(key);
        reaction.apply(state, playerId, events);
      }
    }
  }
  return returned.length;
}

/**
 * Pools that could supply one more of the DON!! still waiting to be placed.
 *
 * A pool qualifies either because it still holds a DON!! that could be sent
 * back instead, or because the automatic pick already took one from it and that
 * choice has yet to be confirmed.
 */
export function donReturnPools(
  state: GameState,
  playerId: PlayerId,
  unplacedOrigins: readonly string[],
  onFieldAtPayment?: readonly string[],
): string[] {
  const player = state.players[playerId];
  // Cheapest first, in the same order the automatic pick uses. Policies that
  // take the first option they are offered therefore keep paying this cost the
  // way they did before the choice existed.
  const candidates = [
    DON_POOL_RESTED,
    DON_POOL_ACTIVE,
    leaderInstanceId(playerId),
    ...player.board.map((card) => card.instanceId),
  ];
  return candidates.filter(
    (pool) =>
      donPoolSize(state, playerId, pool, onFieldAtPayment) > 0 ||
      unplacedOrigins.includes(pool),
  );
}

/**
 * Whether re-homing the DON!! still waiting to be placed can change anything.
 *
 * Re-homing swaps a returned DON!! for one still on the field, so there is a
 * choice only while some pool holds a DON!! that could go back instead of one
 * taken from a different pool. A payment that emptied the field -- OP08-119
 * Kaido & Linlin's `DON!! −10` always does -- leaves every pool offered only
 * because a DON!! came from it, and every pick confirms the automatic one.
 */
export function donReturnHasChoice(
  state: GameState,
  playerId: PlayerId,
  unplacedOrigins: readonly string[],
  onFieldAtPayment?: readonly string[],
): boolean {
  return donReturnPools(
    state,
    playerId,
    unplacedOrigins,
    onFieldAtPayment,
  ).some(
    (pool) =>
      donPoolSize(state, playerId, pool, onFieldAtPayment) > 0 &&
      unplacedOrigins.some((origin) => origin !== pool),
  );
}

/**
 * How many DON!! a pool currently holds -- counting, when `onFieldAtPayment`
 * is given, only those that were on the field when the cost was paid.
 */
export function donPoolSize(
  state: GameState,
  playerId: PlayerId,
  pool: string,
  onFieldAtPayment?: readonly string[],
): number {
  const held = donPool(state, playerId, pool) ?? [];
  if (!onFieldAtPayment) return held.length;
  return held.filter((don) => onFieldAtPayment.includes(don)).length;
}

/** The ids of every DON!! on the player's field, in every pool. */
/**
 * The card number a DON!! carries when a card choice offers one.
 *
 * Bandai's OP-14 Q&A (OP14-020#2, OP14-024#1, OP14-029#1): "your cards" and
 * "your opponent's cards" mean every active card on that side of the field --
 * Leader, Characters, Stage *and* DON!!. A DON!! has no card record, so a
 * choice that reaches one (`CardSelector.includeActiveDon`) carries its own
 * id with this in place of a card number, and the few places that name or
 * move a chosen card ask `activeDonOwner` first.
 */
export const DON_CARD_NUMBER = "DON!!";

/** Whose active DON!! `instanceId` is, if it is one. */
export function activeDonOwner(
  state: GameState,
  instanceId: string,
): PlayerId | undefined {
  return (["p1", "p2"] as const).find((playerId) =>
    state.players[playerId].activeDon.includes(instanceId),
  );
}

export function fieldDonIds(state: GameState, playerId: PlayerId): string[] {
  const player = state.players[playerId];
  return [
    ...player.activeDon,
    ...player.restedDon,
    ...player.leaderAttachedDon,
    ...player.board.flatMap((card) => card.attachedDon ?? []),
  ];
}

/**
 * Confirms that one of the returned DON!! came from `pool`, moving it if the
 * automatic pick guessed somewhere else.
 *
 * Returns the origins still awaiting placement. DON!! cards are interchangeable,
 * so re-homing is a swap of equals: the DON!! deck keeps the card it was handed
 * and gives back a different one, which is why the identity invariant holds.
 */
export function placeReturnedDon(
  state: GameState,
  playerId: PlayerId,
  origins: readonly string[],
  pool: string,
  onFieldAtPayment?: readonly string[],
): string[] {
  const remaining = [...origins];
  // Consuming a matching origin first means picking the pool the engine already
  // guessed moves nothing, and no DON!! is shuffled between equivalent pools.
  const matching = remaining.indexOf(pool);
  if (matching >= 0) {
    remaining.splice(matching, 1);
    return remaining;
  }
  const origin = remaining.shift();
  if (origin === undefined) throw new Error("NO_DON_RETURN_PENDING");
  const target = donPool(state, playerId, pool) ?? [];
  const index = target.findLastIndex(
    (don) => !onFieldAtPayment || onFieldAtPayment.includes(don),
  );
  const taken = index >= 0 ? target.splice(index, 1)[0] : undefined;
  if (taken === undefined) throw new Error(`EMPTY_DON_POOL: ${pool}`);
  const player = state.players[playerId];
  player.donDeck.push(taken);
  const givenBack = player.donDeck.shift();
  if (givenBack === undefined) throw new Error("EMPTY_DON_DECK");
  // The guessed origin can be a Character that has left the field since the
  // guess, when the same cost also trashes it (Vinsmoke Ichiji OP06-060:
  // "DON!! −1, You may trash this Character"). Leaving the field rested every
  // DON!! it was given, so that is where the one handed back belongs.
  const source =
    writableDonPool(state, playerId, origin) ??
    state.players[playerId].restedDon;
  source.push(givenBack);
  return remaining;
}
