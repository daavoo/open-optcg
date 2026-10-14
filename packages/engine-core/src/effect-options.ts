import {
  cards as defaultCardDatabase,
  type CardDatabase,
} from "@one-piece-sim/cards";
import type {
  CardZoneName,
  EffectOption,
  KnownCardRef,
  PlayerId,
} from "@one-piece-sim/protocol";
import type { CardInstance, GameState } from "./model.js";
import { pendingEffectChain } from "./model.js";
import {
  describeMoveDestination,
  parseFaceDownOption,
  parseOrderOption,
} from "./mechanics.js";
import { donPoolSize } from "./don.js";
import { currentPower, donPowerApplies } from "./queries.js";

function cardRef(card: CardInstance, db: CardDatabase): KnownCardRef {
  const definition = db.require(card.cardNumber);
  return {
    instanceId: card.instanceId,
    cardNumber: card.cardNumber,
    name: definition.name,
    category: definition.category,
    cost: definition.cost,
    power: definition.power,
    counter: definition.counter,
  };
}

interface LocatedCard {
  card: CardInstance;
  ownerId: PlayerId;
  zone: CardZoneName;
}

function locate(state: GameState, instanceId: string): LocatedCard | undefined {
  for (const ownerId of ["p1", "p2"] as const) {
    const player = state.players[ownerId];
    if (instanceId === `${ownerId}-leader`) {
      return {
        card: { instanceId, cardNumber: player.leaderCardNumber },
        ownerId,
        zone: "leader",
      };
    }
    for (const zone of ["hand", "board", "trash", "deck", "life"] as const) {
      const card = player[zone].find(
        (candidate) => candidate.instanceId === instanceId,
      );
      if (card) return { card, ownerId, zone };
    }
    if (player.stage?.instanceId === instanceId) {
      return { card: player.stage, ownerId, zone: "stage" };
    }
  }
  // Search effects lift cards out of the deck into the pending effect while the
  // choice is open, so they are findable nowhere else.
  for (const pending of pendingEffectChain(state.pendingEffect)) {
    if (!("revealed" in pending)) continue;
    const card = pending.revealed.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (card) return { card, ownerId: pending.playerId, zone: "revealed" };
  }
  return undefined;
}

function describeCard(
  state: GameState,
  decidingPlayerId: PlayerId,
  located: LocatedCard,
  extras: { via?: string; amount?: number },
  db: CardDatabase,
): EffectOption {
  const viaLocated = extras.via ? locate(state, extras.via) : undefined;
  return {
    kind: "card",
    owner: located.ownerId === decidingPlayerId ? "self" : "opponent",
    zone: located.zone,
    card: cardRef(located.card, db),
    ...(located.zone === "board" || located.zone === "stage"
      ? { rested: Boolean((located.card as { rested?: boolean }).rested) }
      : {}),
    ...(located.zone === "board" || located.zone === "leader"
      ? {
          currentPower: currentPower(
            state,
            located.ownerId,
            located.card.instanceId,
            donPowerApplies(state, located.ownerId),
            db,
          ),
        }
      : {}),
    ...(viaLocated ? { via: cardRef(viaLocated.card, db) } : {}),
    ...(extras.amount === undefined ? {} : { amount: extras.amount }),
  };
}

/**
 * Turns an opaque effect `optionId` into a typed {@link EffectOption}.
 *
 * The engine keeps option ids free-form on purpose, so this is deliberately a
 * best-effort resolver: anything it cannot classify becomes `{kind: "other"}`
 * and the caller still has the raw `optionId`. It never throws.
 */
export function describeEffectOption(
  state: GameState,
  decidingPlayerId: PlayerId,
  optionId: string,
  db: CardDatabase = defaultCardDatabase,
): EffectOption {
  if (optionId === "skip" || optionId === "none") return { kind: "skip" };
  if (optionId === "apply" || optionId === "done" || optionId === "activate") {
    return { kind: "confirm", choice: optionId };
  }
  if (optionId === "top" || optionId === "bottom") {
    return { kind: "position", position: optionId };
  }
  if (optionId === "leader" || optionId === "don") {
    return { kind: "resource", resource: optionId };
  }
  // A branch id from a `choice` node names one of the alternatives the printed
  // text offers. Read off the live pending rather than an allowlist, so a card
  // that adds a branch classifies without registering the id anywhere.
  const pendingChoice = state.pendingEffect;
  if (
    pendingChoice?.kind === "mechanic-choice" &&
    pendingChoice.choice.kind === "choice" &&
    pendingChoice.choice.branches.some((branch) => branch.id === optionId)
  ) {
    return { kind: "mode", mode: optionId };
  }

  // A face-down pick names a position, never a card: `locate` must not be
  // reached with it, or the option would carry the very card it hides.
  if (
    pendingChoice?.kind === "mechanic-choice" &&
    pendingChoice.choice.kind === "blind-hand-pick"
  ) {
    const { instanceIds, targetPlayerId } = pendingChoice.choice;
    const position = parseFaceDownOption(optionId, instanceIds.length);
    if (position === undefined) return { kind: "other" };
    return {
      kind: "face-down",
      owner: targetPlayerId === decidingPlayerId ? "self" : "opponent",
      zone: "hand",
      position,
      of: instanceIds.length,
    };
  }

  // An `order-to-bottom` option is a list of indices, so `locate` has nothing
  // to look up -- and leaving it as `{kind: "other"}` would strip the cards
  // out of the UI and the LLM prompt, which for this choice is all of it.
  if (
    pendingChoice?.kind === "mechanic-choice" &&
    pendingChoice.choice.kind === "order-to-bottom"
  ) {
    const { instanceIds } = pendingChoice.choice;
    const order = parseOrderOption(optionId, instanceIds.length);
    if (order) {
      const cards = order.flatMap((index) => {
        const located = locate(state, instanceIds[index]!);
        return located ? [cardRef(located.card, db)] : [];
      });
      if (cards.length === order.length) {
        // The deck's bottom is where almost every ordering clause places, and
        // the summary says so without being told. ST-13 puts Life cards back
        // in the Life area, so the destination travels on the option: a caller
        // reordering the offer re-words the sentence from it.
        const { to } = pendingChoice.choice;
        const destination =
          to.zone === "deck" && to.position === "bottom"
            ? undefined
            : describeMoveDestination(to);
        return {
          kind: "order",
          cards,
          ...(destination === undefined ? {} : { destination }),
        };
      }
    }
  }

  // `DON!! −N` names a pool, not a card, so it cannot go through `locate`: two
  // of the three pool names are not instance ids at all.
  const pending = state.pendingEffect;
  if (pending?.kind === "return-don" && optionId.startsWith("return-don:")) {
    const pool = optionId.slice("return-don:".length);
    const origins = pending.origins.filter((origin) => origin === pool).length;
    const available =
      donPoolSize(state, pending.playerId, pool, pending.onFieldAtPayment) +
      origins;
    if (pool === "active" || pool === "rested") {
      return {
        kind: "don-return",
        pool,
        available,
        remaining: pending.origins.length,
      };
    }
    const attached = locate(state, pool);
    if (attached) {
      return {
        kind: "don-return",
        pool: "attached",
        card: cardRef(attached.card, db),
        available,
        remaining: pending.origins.length,
      };
    }
  }

  // "Return 1 or more DON!!": the option names a count, not a card or a pool,
  // so like `return-don:` above it cannot go through `locate`.
  if (
    pendingChoice?.kind === "mechanic-choice" &&
    pendingChoice.choice.kind === "return-don-choice" &&
    optionId.startsWith("return:")
  ) {
    const count = Number(optionId.slice("return:".length));
    if (Number.isInteger(count)) return { kind: "don-return-count", count };
  }

  const direct = locate(state, optionId);
  if (direct) return describeCard(state, decidingPlayerId, direct, {}, db);

  const segments = optionId.split(":");
  if (segments.length < 2) return { kind: "other" };
  const [prefix, ...rest] = segments as [string, ...string[]];

  if (prefix === "cost") {
    const cost = Number(rest[0]);
    return Number.isInteger(cost) ? { kind: "cost", cost } : { kind: "other" };
  }
  if (rest[0] === "skip" || rest[0] === "none") return { kind: "skip" };

  // Whatever the prefix is, the segment after it is the instance being chosen.
  // There used to be an allowlist of ~24 known prefixes here, hand-synced with
  // the 37 places that build these ids across three files. It was redundant --
  // `locate` already fails for any segment that is not a live instance -- and it
  // failed *silently*: an unlisted prefix degraded to `{kind: "other"}`, which
  // strips the card from the UI and the LLM prompt rather than erroring. Trying
  // the lookup unconditionally means a newly added option id describes itself
  // without anyone remembering to register it.
  const located = locate(state, rest[0]!);
  if (!located) return { kind: "other" };
  const tail = rest[1];
  const amount = tail === undefined ? Number.NaN : Number(tail);
  return describeCard(
    state,
    decidingPlayerId,
    located,
    {
      ...(tail !== undefined && Number.isNaN(amount) ? { via: tail } : {}),
      ...(Number.isInteger(amount) ? { amount } : {}),
    },
    db,
  );
}
