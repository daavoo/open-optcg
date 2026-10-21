/**
 * The choices a suspended program offers, and resuming it with the one a
 * player picked.
 */
import {
  type CardDatabase,
  cards as defaultCardDatabase,
} from "@one-piece-sim/cards";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import type { CardInstance, GameState } from "./model.js";
import { effectiveCost } from "./queries.js";
import { activeDonOwner, fieldDonCount } from "./don.js";
import type {
  MechanicPendingChoice,
  MechanicResult,
  MechanicSignal,
} from "./mechanic-dsl.js";
import { replacementRegistry } from "./replacement-eligibility.js";
import { currentPowerOfBoardCard, selectCards } from "./mechanic-conditions.js";
import {
  continueExecution,
  effectPlayableCandidates,
  faceDownOption,
  findCardZone,
  flatten,
  formatOrderOption,
  formatSplitOrderOption,
  opponentOf,
  orderReactionOptions,
  parseFaceDownOption,
  parseOrderOption,
  parseOrderSplit,
  playOntoBoard,
  resolvePlayer,
} from "./mechanics.js";

type GiftChoice = Extract<MechanicPendingChoice, { kind: "give-rested-don" }>;

/** The player whose DON!! a gift to `recipient` comes out of. */
function giftOwner(
  state: GameState,
  pending: GiftChoice,
  recipient: string,
): PlayerId {
  // The recipient's owner pays: under "its owner's" (`eitherOwner`) an
  // opposing card takes one of the opponent's DON!!, never the chooser's.
  const opponent = opponentOf(pending.playerId);
  return pending.eitherOwner &&
    (recipient === `${opponent}-leader` ||
      state.players[opponent].board.some(
        (card) => card.instanceId === recipient,
      ))
    ? opponent
    : pending.playerId;
}

/** The piles a gift drains, in the order it drains them. */
function giftPools(
  state: GameState,
  pending: GiftChoice,
  ownerId: PlayerId,
): string[][] {
  const player = state.players[ownerId];
  // Which pile a "from the cost area" gift drains is the chooser's call
  // (OP15-023 Q2 and Q3). Out of the opponent's area an active DON!! is the
  // one that costs them something; out of the chooser's own, a rested one
  // leaves the active DON!! still able to pay for something.
  return pending.from === "cost-area"
    ? pending.eitherOwner &&
      ownerId === pending.execution.context.sourcePlayerId
      ? [player.restedDon, player.activeDon]
      : [player.activeDon, player.restedDon]
    : pending.from === "active"
      ? [player.activeDon]
      : [player.restedDon];
}

/**
 * How many DON!! a gift to `recipient` can move: the printed "up to N", or
 * what its pile holds when that is fewer.
 */
function giftCeiling(
  state: GameState,
  pending: GiftChoice,
  recipient: string,
): number {
  const held = giftPools(state, pending, giftOwner(state, pending, recipient))
    .map((pool) => pool.length)
    .reduce((sum, size) => sum + size, 0);
  return Math.min(pending.count, held);
}

/** The option giving `count` DON!! to `recipient`, short of the most it could. */
const fewerGiftOption = (recipient: string, count: number): string =>
  `give:${recipient}:${String(count)}`;

/**
 * Reads a `give-rested-don` option: a bare instance id gives as many as the
 * gift can move, and `give:<id>:<n>` gives `n`. Undefined for `skip` and for
 * anything this choice did not offer.
 */
export function parseGiftOption(
  state: GameState,
  pending: GiftChoice,
  optionId: string,
): { recipient: string; count: number } | undefined {
  if (pending.eligibleInstanceIds.includes(optionId)) {
    return {
      recipient: optionId,
      count: giftCeiling(state, pending, optionId),
    };
  }
  const match = /^give:(.+):(\d+)$/.exec(optionId);
  if (!match) return undefined;
  const recipient = match[1]!;
  const count = Number(match[2]);
  if (
    !pending.eligibleInstanceIds.includes(recipient) ||
    count < 1 ||
    count >= giftCeiling(state, pending, recipient)
  ) {
    return undefined;
  }
  return { recipient, count };
}

export function getMechanicChoiceOptions(
  state: GameState,
  pending: MechanicPendingChoice,
  db: CardDatabase = defaultCardDatabase,
): string[] {
  if (pending.kind === "optional") return ["apply", "skip"];
  if (pending.kind === "choice") {
    return pending.branches.map((branch) => branch.id);
  }
  if (pending.kind === "area-replacement") {
    // Mandatory: the sixth Character only reaches the field by replacing one
    // already on it, which is what the imperative path offers too.
    return state.players[pending.playerId].board.map(
      (character) => character.instanceId,
    );
  }
  if (pending.kind === "order-to-bottom") {
    // No "skip": the cards are going to the bottom either way, and no second
    // option either -- every other order is this one's permutation, and
    // `applyAction` takes it from the caller rather than making the engine
    // list the factorial of it.
    const order = pending.instanceIds.map((_, index) => index);
    if (!pending.alternate) return [formatOrderOption(order)];
    // With two destinations the engine offers both ends -- all to one, all to
    // the other -- because neither is the obvious default the
    // single-destination case has. The cards are never divided between them
    // (Bandai's OP15-066#1); the order within the end is the permutation the
    // caller composes.
    return [
      formatSplitOrderOption(order, 0),
      formatSplitOrderOption(order, order.length),
    ];
  }
  if (pending.kind === "rest-opponent-cards") {
    return [
      ...pending.eligibleInstanceIds,
      ...(state.players[pending.targetPlayerId].activeDon.length > 0
        ? ["don"]
        : []),
      "skip",
    ];
  }
  if (pending.kind === "give-rested-don") {
    // "Up to N" is a count as well as a recipient. Each bare id gives the
    // most the gift can move and keeps its place at the front, so a caller
    // that takes the first offer gives what it always gave; every smaller
    // count follows, largest first, and `skip` is the zero.
    return [
      ...pending.eligibleInstanceIds,
      ...pending.eligibleInstanceIds.flatMap((recipient) => {
        const fewer: string[] = [];
        for (
          let count = giftCeiling(state, pending, recipient) - 1;
          count >= 1;
          count -= 1
        ) {
          fewer.push(fewerGiftOption(recipient, count));
        }
        return fewer;
      }),
      "skip",
    ];
  }
  if (pending.kind === "blind-hand-pick") {
    // Positions, never ids: an instance id in an option is a card the
    // resolver, the UI and `visibleCardNumbers` would all go and look up.
    return pending.instanceIds.map((_, index) => faceDownOption(index));
  }
  if (pending.kind === "order-reactions") {
    return orderReactionOptions(pending.reactions);
  }
  if (pending.kind === "return-don-choice") {
    // Every legal count, smallest first. No "skip": the `optional` wrapping
    // this is where "you may" is answered, and a player who said yes there is
    // paying something.
    const available = fieldDonCount(
      state,
      resolvePlayer(pending.execution.context, pending.player),
    );
    const counts: string[] = [];
    for (let count = pending.min; count <= available; count += 1) {
      counts.push(`return:${String(count)}`);
    }
    return counts;
  }
  const eligible = effectPlayableCandidates(
    state,
    selectCards(
      state,
      pending.execution.context,
      pending.selector,
      pending.execution.bindings,
      db,
    ),
    pending.effect,
    pending.bind,
    db,
  );
  let options = eligible
    .map((card) => card.instanceId)
    .filter((instanceId) => !pending.selected.includes(instanceId));
  // Active DON!! are interchangeable, so one of them stands for the rest: the
  // next pick offers the next one. See `CardSelector.includeActiveDon`.
  const firstDon = options.find(
    (instanceId) => activeDonOwner(state, instanceId) !== undefined,
  );
  options = options.filter(
    (instanceId) =>
      instanceId === firstDon ||
      activeDonOwner(state, instanceId) === undefined,
  );
  if (
    pending.distinctNames ||
    pending.maxTotalCost !== undefined ||
    pending.maxTotalPower !== undefined
  ) {
    const selectedCards = eligible.filter((card) =>
      pending.selected.includes(card.instanceId),
    );
    // An `"either"` selector holds cards from both boards, so each one's cost
    // has to be read against its own controller: a cost layer is controller-
    // scoped, and charging the source player's aura to the opponent's card
    // would let a running total drift from what either player can see.
    const costPlayerOf = (card: CardInstance): PlayerId =>
      pending.selector.player === "either"
        ? (findCardZone(state, card.instanceId)?.playerId ??
          pending.execution.context.sourcePlayerId)
        : resolvePlayer(pending.execution.context, pending.selector.player);
    if (pending.distinctNames) {
      const chosenNames = new Set(
        selectedCards.map((card) => db.require(card.cardNumber).name),
      );
      options = options.filter((instanceId) => {
        const card = eligible.find(
          (candidate) => candidate.instanceId === instanceId,
        );
        return card
          ? !chosenNames.has(db.require(card.cardNumber).name)
          : false;
      });
    }
    if (pending.maxTotalCost !== undefined) {
      const used = selectedCards.reduce(
        (total, card) =>
          total + effectiveCost(state, costPlayerOf(card), card, db),
        0,
      );
      const remaining = pending.maxTotalCost - used;
      options = options.filter((instanceId) => {
        const card = eligible.find(
          (candidate) => candidate.instanceId === instanceId,
        );
        return card
          ? effectiveCost(state, costPlayerOf(card), card, db) <= remaining
          : false;
      });
    }
    if (pending.maxTotalPower !== undefined) {
      // Same shape as the cost budget above, read against current power. A
      // Leader can never be in one of these bindings -- every printed clause
      // with a power budget names Characters -- so the board lookup is enough.
      const powerOf = (card: CardInstance): number =>
        currentPowerOfBoardCard(state, costPlayerOf(card), card.instanceId, db);
      const used = selectedCards.reduce(
        (total, card) => total + powerOf(card),
        0,
      );
      const remaining = pending.maxTotalPower - used;
      options = options.filter((instanceId) => {
        const card = eligible.find(
          (candidate) => candidate.instanceId === instanceId,
        );
        return card ? powerOf(card) <= remaining : false;
      });
    }
  }
  // An `exhaustive` clause is mandatory: while a candidate still fits, stopping
  // is not one of the player's options.
  const mayStop =
    !pending.exhaustive ||
    options.length === 0 ||
    pending.max <= pending.selected.length;
  if (mayStop && pending.selected.length >= pending.min) options.push("done");
  return options;
}

/**
 * Takes the picks an `exhaustive` clause leaves the player no say in, so a
 * mandatory clause does not ask a question whose answer cannot change the game:
 * a single remaining candidate, and a field of candidates that all fit
 * alongside each other -- OP12-046's "trash 2" against a hand of two trashes
 * the hand, and only the order of naming was ever on offer.
 *
 * Both tests are asked of `getMechanicChoiceOptions` rather than recomputed
 * here, on a copy of the pending choice, so the budget and the name exclusion
 * keep their single definition.
 */
export function takeForcedChoices(
  state: GameState,
  pending: MechanicPendingChoice,
  db: CardDatabase,
): void {
  if (pending.kind !== "cards" || !pending.exhaustive) return;
  const candidates = (choice: MechanicPendingChoice): string[] =>
    getMechanicChoiceOptions(state, choice, db).filter(
      (option) => option !== "done",
    );
  while (pending.selected.length < pending.max) {
    const options = candidates(pending);
    if (options.length === 0) return;
    if (options.length === 1) {
      pending.selected.push(options[0] as string);
      continue;
    }
    if (pending.selected.length + options.length > pending.max) return;
    const probe: MechanicPendingChoice = {
      ...pending,
      selected: [...pending.selected],
    };
    for (const option of options) {
      probe.selected.push(option);
      const left = candidates(probe);
      const crowdedOut = options.some(
        (other) => !probe.selected.includes(other) && !left.includes(other),
      );
      if (crowdedOut) return;
    }
    pending.selected.push(...options);
    return;
  }
}

export function resolveMechanicChoice(
  state: GameState,
  pending: MechanicPendingChoice,
  optionId: string,
  db: CardDatabase = defaultCardDatabase,
): MechanicResult {
  if (pending.kind === "order-reactions") {
    // Nothing of this program is left to run: the answer reorders the queue
    // the pending effect carries, which only its resolver can see.
    throw new Error("ORDER_REACTIONS_RESOLVED_BY_QUEUE");
  }
  if (pending.kind === "optional") {
    if (optionId !== "apply" && optionId !== "skip") {
      throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
    }
    if (optionId === "apply") flatten(pending.effect, pending.execution.queue);
    return continueExecution(state, pending.execution, db);
  }
  if (pending.kind === "return-don-choice") {
    const count = Number(optionId.slice("return:".length));
    if (
      !optionId.startsWith("return:") ||
      !Number.isInteger(count) ||
      count < pending.min ||
      count >
        fieldDonCount(
          state,
          resolvePlayer(pending.execution.context, pending.player),
        )
    ) {
      throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
    }
    // The payment and the payoff are one step, in that order: the signal the
    // payment raises is what a watcher like OP09-061's Leader answers, and it
    // has to be in the stream before the payoff resolves.
    flatten(
      {
        kind: "sequence",
        effects: [
          { kind: "return-don", player: pending.player, count },
          pending.effect,
        ],
      },
      pending.execution.queue,
    );
    return continueExecution(state, pending.execution, db);
  }
  if (pending.kind === "choice") {
    const branch = pending.branches.find(
      (candidate) => candidate.id === optionId,
    );
    if (!branch) throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
    // A `[Once Per Turn]` replacement books its key when the branch is *taken*,
    // not when it is offered: declining must not spend the turn's use.
    if (optionId.startsWith("replace:") && pending.chooserPlayerId) {
      const protectorId = optionId.slice("replace:".length);
      // The protector can be the Leader (EB03-001), whose instance is in no
      // zone -- so its card number comes off the player rather than off a
      // board scan, exactly as `eligibleReplacements` offered it.
      const protectorCardNumber =
        protectorId === `${pending.chooserPlayerId}-leader`
          ? state.players[pending.chooserPlayerId].leaderCardNumber
          : state.players[pending.chooserPlayerId].board.find(
              (card) => card.instanceId === protectorId,
            )?.cardNumber;
      const entry =
        protectorCardNumber === undefined
          ? undefined
          : replacementRegistry.get(protectorCardNumber);
      if (entry?.oncePerTurn) {
        state.oncePerTurn.push(
          `${state.turn}:${pending.chooserPlayerId}:${protectorId}:replacement`,
        );
      }
    }
    if (branch.effect) flatten(branch.effect, pending.execution.queue);
    return continueExecution(state, pending.execution, db);
  }
  if (pending.kind === "area-replacement") {
    const player = state.players[pending.playerId];
    const boardIndex = player.board.findIndex(
      (character) => character.instanceId === optionId,
    );
    if (boardIndex < 0) throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
    const [trashed] = player.board.splice(boardIndex, 1);
    if (!trashed) throw new Error(`MISSING_MECHANIC_CARD: ${optionId}`);
    player.restedDon.push(...(trashed.attachedDon ?? []));
    player.trash.push({
      instanceId: trashed.instanceId,
      cardNumber: trashed.cardNumber,
    });
    const placement = playOntoBoard(
      state,
      pending.playerId,
      pending.card.instanceId,
      pending.rested,
      pending.execution.context,
    );
    const continued = continueExecution(state, pending.execution, db);
    return {
      pending: continued.pending,
      events: [
        {
          type: "character-trashed",
          playerId: pending.playerId,
          cardInstanceId: trashed.instanceId,
          cardNumber: trashed.cardNumber,
          reason: "character-area-limit",
        },
        ...placement.events,
        ...continued.events,
      ],
      signals: [...placement.signals, ...continued.signals],
    };
  }
  if (pending.kind === "blind-hand-pick") {
    const index = parseFaceDownOption(optionId, pending.instanceIds.length);
    if (index === undefined) {
      throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
    }
    pending.execution.bindings[pending.bind] = [pending.instanceIds[index]!];
    flatten(pending.effect, pending.execution.queue);
    return continueExecution(state, pending.execution, db);
  }
  if (pending.kind === "order-to-bottom") {
    const order = parseOrderOption(optionId, pending.instanceIds.length);
    if (!order) {
      throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
    }
    const execution = pending.execution;
    // The whole placement is one `move`, and `move` inserts a binding's cards
    // in binding order -- so the chosen order is written into the binding and
    // nothing else has to know about it. Still `move` rather than placing the
    // cards here: it is the one node that owns ownership, events and
    // replacement offers.
    const ordered = order.map((index) => pending.instanceIds[index]!);
    const atPrimary = pending.alternate
      ? (parseOrderSplit(optionId, ordered.length) ?? ordered.length)
      : ordered.length;
    // "Place them at the top or bottom" sends every card to the same end
    // (Bandai's OP15-066#1): the end is chosen, the cards are not divided.
    if (atPrimary !== 0 && atPrimary !== ordered.length) {
      throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
    }
    execution.bindings[pending.binding] = ordered.slice(0, atPrimary);
    // Two moves rather than one, so each half lands in its own destination --
    // and the alternate's half goes first, because `move` places a binding's
    // cards in binding order and the queue is a stack.
    if (pending.alternate && atPrimary < ordered.length) {
      const rest = `${pending.binding}-alternate`;
      execution.bindings[rest] = ordered.slice(atPrimary);
      execution.queue.unshift({
        kind: "move",
        binding: rest,
        to: pending.alternate,
      });
    }
    if (atPrimary > 0) {
      execution.queue.unshift({
        kind: "move",
        binding: pending.binding,
        to: pending.to,
      });
    }
    return continueExecution(state, execution, db);
  }
  if (pending.kind === "rest-opponent-cards") {
    const events: PublicEvent[] = [];
    // A Character rested here is rested by an effect exactly as one rested by
    // the `rest` node is, so it raises the same signal. Without it the whole
    // `whenRested` registry and every `card-rested` ReactionRule -- OP07-031
    // Bartolomeo's draw, PRB02-006's "rest 1 of your other Characters
    // instead" -- were blind to the node that rests most of the boards in the
    // format, and read as clauses that simply never fired.
    const restSignals: MechanicSignal[] = [];
    const target = state.players[pending.targetPlayerId];
    let eligibleInstanceIds = pending.eligibleInstanceIds;
    if (optionId === "don") {
      const moved = target.activeDon.splice(0, 1);
      if (moved.length === 0) throw new Error("INVALID_MECHANIC_OPTION: don");
      target.restedDon.push(...moved);
    } else if (optionId !== "skip") {
      if (!eligibleInstanceIds.includes(optionId)) {
        throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
      }
      const card = target.board.find((entry) => entry.instanceId === optionId);
      if (!card) throw new Error(`MISSING_MECHANIC_CARD: ${optionId}`);
      card.rested = true;
      events.push({
        type: "character-rested",
        playerId: pending.targetPlayerId,
        cardInstanceId: card.instanceId,
        cardNumber: card.cardNumber,
        sourceCardNumber: pending.execution.context.source.cardNumber,
      });
      restSignals.push({
        kind: "card-rested",
        card: { instanceId: card.instanceId, cardNumber: card.cardNumber },
        ownerId: pending.targetPlayerId,
        sourcePlayerId: pending.execution.context.sourcePlayerId,
        sourceIsCharacter:
          db.get(pending.execution.context.source.cardNumber)?.category ===
          "character",
      });
      eligibleInstanceIds = eligibleInstanceIds.filter(
        (candidate) => candidate !== optionId,
      );
    }
    // "Skip" ends the whole clause rather than one rest of it: the printed
    // total is "up to", so declining once is declining the rest.
    if (
      optionId !== "skip" &&
      pending.remaining > 1 &&
      (eligibleInstanceIds.length > 0 || target.activeDon.length > 0)
    ) {
      return {
        pending: {
          ...pending,
          eligibleInstanceIds,
          remaining: pending.remaining - 1,
        },
        events,
        signals: restSignals,
      };
    }
    const continued = continueExecution(state, pending.execution, db);
    return {
      ...continued,
      events: [...events, ...continued.events],
      signals: [...restSignals, ...continued.signals],
    };
  }
  if (pending.kind === "give-rested-don") {
    const events: PublicEvent[] = [];
    if (optionId !== "skip") {
      const gift = parseGiftOption(state, pending, optionId);
      if (!gift) throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
      const ownerId = giftOwner(state, pending, gift.recipient);
      const player = state.players[ownerId];
      const moved: string[] = [];
      for (const pool of giftPools(state, pending, ownerId)) {
        if (moved.length >= gift.count) break;
        moved.push(...pool.splice(0, gift.count - moved.length));
      }
      if (gift.recipient === `${ownerId}-leader`) {
        player.leaderAttachedDon.push(...moved);
      } else {
        const target = player.board.find(
          (card) => card.instanceId === gift.recipient,
        );
        if (!target) {
          throw new Error(`MISSING_MECHANIC_CARD: ${gift.recipient}`);
        }
        target.attachedDon ??= [];
        target.attachedDon.push(...moved);
      }
      events.push({
        type: "don-attached",
        playerId: ownerId,
        targetInstanceId: gift.recipient,
        count: moved.length,
      });
    }
    const continued = continueExecution(state, pending.execution, db);
    return {
      ...continued,
      events: [...events, ...continued.events],
    };
  }
  const options = getMechanicChoiceOptions(state, pending, db);
  if (!options.includes(optionId)) {
    throw new Error(`INVALID_MECHANIC_OPTION: ${optionId}`);
  }
  if (optionId !== "done") pending.selected.push(optionId);
  takeForcedChoices(state, pending, db);
  if (
    optionId !== "done" &&
    pending.selected.length < pending.max &&
    // A choice whose only remaining option is "done" is not a choice: every
    // card the selector still allows has been taken, or a cost budget has no
    // room left for any of them. Asking again puts a modal with one button in
    // front of the player and a decision that cannot change the game in the
    // trace.
    getMechanicChoiceOptions(state, pending, db).some(
      (option) => option !== "done",
    )
  ) {
    return { pending, events: [], signals: [] };
  }
  pending.execution.bindings[pending.bind] = [...pending.selected];
  flatten(pending.effect, pending.execution.queue);
  return continueExecution(state, pending.execution, db);
}
