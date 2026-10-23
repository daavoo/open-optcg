/**
 * The imperative `[On Play]` handlers: cards whose clause predates the DSL or
 * says something no DSL node can yet. Every card here is on
 * `LEGACY_IMPERATIVE_CARDS` in `test/card-support.test.ts`, and migrating one
 * is a per-card change -- delete its entry here, add a program to its set's
 * `mechanics/<set>-on-play.ts`.
 */
import {
  cardAttributes,
  type CardDatabase,
  cards as defaultCardDatabase,
  hasCardAttribute,
  hasCardType,
} from "@one-piece-sim/cards";
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import type { CardInstance, GameState, PlayerState } from "./model.js";
import { addDonFromDeck, fieldDonCount, returnDonToDeck } from "./don.js";
import { effectiveCost } from "./queries.js";
import {
  applyAfterRest,
  createEnelSearch,
  createPuddingSearch,
  createSupernovaSearch,
  drawCards,
  fieldStrawHatCount,
  isSlash,
  leaderInstanceId,
  type OnPlayResult,
  opponentOf,
  restEffect,
  searchBigMomTopThree,
  searchImpelDownTopThree,
  searchTopFive,
} from "./effects.js";

/**
 * A card's own `[On Play]`, for the clauses still written as engine code.
 *
 * Two implementations of the same rule live side by side: a clause expressed in
 * the mechanic DSL is a program in `mechanics/<set>.ts`, and the ones that
 * predate it -- or that no DSL node can say yet, like OP10-103's Life swap or
 * P-105's Life cost -- are the handlers below. What matters is that both are
 * reachable through *one* lookup. They were not: the DSL's `play` node resolved
 * a `card-played` signal against the program table alone, so ST21-015 Zoro's
 * `[On K.O.]` could put ST31-001 Sanji on the field with his `[On Play]`
 * silently dropped, while the same Sanji played from hand drew his card. An
 * `if (source.cardNumber === ...)` chain cannot be asked "do you know this
 * card?"; a registry can, which is the whole reason this is a `Map`.
 *
 * Migrating an entry to a DSL program is a per-card change now: delete it here,
 * add it there, and every play path keeps agreeing.
 */
interface OnPlayHandlerContext {
  state: GameState;
  player: PlayerState;
  playerId: PlayerId;
  source: CardInstance;
  db: CardDatabase;
}

type OnPlayHandler = (context: OnPlayHandlerContext) => OnPlayResult;

/** Fresh each call: a caller is free to push onto the events it is handed. */
export const noOnPlay = (): OnPlayResult => ({ pending: null, events: [] });

const searchImpelDownOnPlay: OnPlayHandler = ({
  state,
  playerId,
  source,
  db,
}) => {
  return {
    pending: searchImpelDownTopThree(state, playerId, source, db),
    events: [],
  };
};

const ON_PLAY_HANDLERS = new Map<string, OnPlayHandler>([
  [
    "OP12-071",
    ({ state, playerId, source, db }) => {
      return {
        pending: createPuddingSearch(state, playerId, source, db),
        events: [],
      };
    },
  ],
  // OP15-118 Enel: the search is gated behind an optional `DON!! −1`, and this
  // path pays it only when the DON!! is there to pay with.
  [
    "OP15-118",
    ({ state, playerId, source }) => {
      if (fieldDonCount(state, playerId) < 1)
        return { pending: null, events: [] };
      const events: PublicEvent[] = [];
      returnDonToDeck(state, playerId, 1, source, events);
      return { pending: createEnelSearch(state, playerId, source), events };
    },
  ],
  ["OP16-034", searchImpelDownOnPlay],
  ["OP16-026", searchImpelDownOnPlay],
  [
    "OP16-048",
    ({ state, player, playerId, source }) => {
      const events = hasCardType(player.leaderCardNumber, "Impel Down")
        ? drawCards(state, playerId, 1, source.cardNumber)
        : [];
      const eligibleInstanceIds = player.hand
        .filter((card) => card.cardNumber === "OP16-042")
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "free-play",
                playerId,
                sourceCardNumber: "OP16-048",
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events,
      };
    },
  ],
  [
    "OP16-045",
    ({ player, playerId, source, db }) => {
      // Crocodile itself is one of "your Characters" and may pay (Bandai's
      // OP16-045#1).
      const eligibleInstanceIds = player.board
        .filter((card) => (db.require(card.cardNumber).cost ?? 0) >= 2)
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "return-own-for-free-play",
                playerId,
                sourceCardNumber: "OP16-045",
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "EB03-032",
    ({ state, player, playerId, source, db }) => {
      const eligibleInstanceIds = [
        ...(db.require(player.leaderCardNumber).name === "Charlotte Katakuri"
          ? [leaderInstanceId(playerId)]
          : []),
        ...player.board
          .filter(
            (card) => db.require(card.cardNumber).name === "Charlotte Katakuri",
          )
          .map((card) => card.instanceId),
      ];
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "st34-power-boost",
                playerId,
                sourceCardNumber: "EB03-032",
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
                amount: 2000,
                expiresAtTurn: state.turn,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "EB03-035",
    ({ state, playerId }) => {
      if (
        fieldDonCount(state, playerId) <=
        fieldDonCount(state, opponentOf(playerId))
      ) {
        addDonFromDeck(state, playerId, 1, "rested");
      }
      return { pending: null, events: [] };
    },
  ],
  [
    "ST34-002",
    ({ state, player, playerId, source }) => {
      const targetPlayerId = opponentOf(playerId);
      if (hasCardType(player.leaderCardNumber, "Big Mom Pirates")) {
        addDonFromDeck(state, playerId, 1, "rested");
      }
      const eligibleInstanceIds = state.players[targetPlayerId].board
        .filter((card) => effectiveCost(state, targetPlayerId, card) <= 2)
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "ko-character",
                playerId,
                targetPlayerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "ST34-003",
    ({ state, playerId, source, db }) => {
      return {
        pending: searchBigMomTopThree(state, playerId, source, db),
        events: [],
      };
    },
  ],
  [
    "ST34-004",
    ({ state, player, playerId, source }) => {
      const targetPlayerId = opponentOf(playerId);
      return {
        pending:
          fieldDonCount(state, playerId) >= 4 && player.hand.length > 0
            ? {
                kind: "st34-discard",
                playerId,
                targetPlayerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds: player.hand.map((card) => card.instanceId),
                after: "linlin",
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "ST33-001",
    ({ player, playerId, source }) => {
      if (player.hand.length === 0) return noOnPlay();
      return {
        pending: {
          kind: "navy-discard",
          playerId,
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
          eligibleInstanceIds: player.hand.map((card) => card.instanceId),
          remaining: 1,
          optional: true,
          after: { kind: "draw", count: 1 },
        },
        events: [],
      };
    },
  ],
  [
    "ST33-003",
    ({ state, player, playerId, source }) => {
      if (player.hand.length === 0) return noOnPlay();
      const targetPlayerId = opponentOf(playerId);
      const eligibleInstanceIds = state.players[targetPlayerId].board
        .filter((card) => effectiveCost(state, targetPlayerId, card) <= 2)
        .map((card) => card.instanceId);
      return {
        pending: {
          kind: "navy-discard",
          playerId,
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
          eligibleInstanceIds: player.hand.map((card) => card.instanceId),
          remaining: 1,
          optional: true,
          after: {
            kind: "bottom-deck",
            targetPlayerId,
            eligibleInstanceIds,
            remaining: 2,
          },
        },
        events: [],
      };
    },
  ],
  [
    "ST33-005",
    ({ player, playerId, source, db }) => {
      const eligibleInstanceIds = player.hand
        .filter((card) => {
          const definition = db.require(card.cardNumber);
          return (
            definition.category === "character" &&
            definition.types.includes("Navy") &&
            definition.name !== "Monkey.D.Garp" &&
            (definition.power ?? 99_999) <= 8000
          );
        })
        .map((card) => card.instanceId);
      return {
        pending:
          hasCardType(player.leaderCardNumber, "Navy") &&
          eligibleInstanceIds.length > 0
            ? {
                kind: "free-play",
                playerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "OP12-043",
    ({ state, player, playerId, source }) => {
      if (player.hand.length === 0) return noOnPlay();
      const targetPlayerId = opponentOf(playerId);
      const eligibleInstanceIds = state.players[targetPlayerId].board.map(
        (card) => card.instanceId,
      );
      return {
        pending: {
          kind: "navy-discard",
          playerId,
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
          eligibleInstanceIds: player.hand.map((card) => card.instanceId),
          remaining: 1,
          optional: true,
          after: {
            kind: "prevent-attack",
            targetPlayerId,
            eligibleInstanceIds,
            expiresAtTurn: state.turn + 1,
            remaining: 1,
          },
        },
        events: [],
      };
    },
  ],
  [
    "OP12-047",
    ({ player, playerId, source }) => {
      if (player.hand.length === 0) return noOnPlay();
      return {
        pending: {
          kind: "navy-discard",
          playerId,
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
          eligibleInstanceIds: player.hand.map((card) => card.instanceId),
          remaining: 1,
          optional: true,
          after: { kind: "none" },
        },
        events: [],
      };
    },
  ],
  [
    "OP10-103",
    ({ player, playerId, source }) => {
      return {
        pending:
          player.life.length > 0
            ? {
                kind: "bege-life-swap",
                playerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                stage: "take-life",
                eligibleInstanceIds: player.life.map((card) => card.instanceId),
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "OP10-111",
    ({ state, playerId, source, db }) => {
      return {
        pending: createSupernovaSearch(state, playerId, source, false, db),
        events: [],
      };
    },
  ],
  [
    "P-085",
    ({ state, player, playerId, source }) => {
      const targetPlayerId = opponentOf(playerId);
      const eligibleInstanceIds = state.players[targetPlayerId].board
        .filter((card) => effectiveCost(state, targetPlayerId, card) <= 4)
        .map((card) => card.instanceId);
      return {
        pending:
          hasCardType(player.leaderCardNumber, "Supernovas") &&
          player.life.length <= state.players[targetPlayerId].life.length &&
          eligibleInstanceIds.length > 0
            ? {
                kind: "move-character-to-life",
                playerId,
                targetPlayerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "ST36-004",
    ({ player, playerId, source, db }) => {
      const eligibleInstanceIds = player.hand
        .filter((card) =>
          db.require(card.cardNumber).types.includes("Supernovas"),
        )
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "discard-supernova-draw-two",
                playerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "OP01-016",
    ({ state, playerId, source, db }) => {
      return {
        pending: searchTopFive(state, playerId, source, "Nami", db),
        events: [],
      };
    },
  ],
  [
    "ST31-001",
    ({ state, player, playerId, source, db }) => {
      const events = drawCards(state, playerId, 1, source.cardNumber);
      const eligibleInstanceIds = player.hand
        .filter((card) => {
          const definition = db.require(card.cardNumber);
          return (
            definition.category === "character" &&
            definition.name !== "Sanji" &&
            definition.types.includes("Straw Hat Crew") &&
            definition.cost !== null &&
            definition.cost <= 5
          );
        })
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "free-play",
                playerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events,
      };
    },
  ],
  [
    "ST31-002",
    ({ state, player, playerId, source, db }) => {
      const events = drawCards(state, playerId, 1, source.cardNumber);
      // "[printed text omitted -- pnpm card:text ST31-002]": exactly 1, not
      // "1 or less" -- ST31-001 Sanji beside it is the deck's "or less" wording and
      // reads `<= 5`. No cost-0 {Straw Hat Crew} card is printed yet, so the two
      // bounds pick the same cards today; the printed one is what should be here
      // when one is. "card" rather than "Character" is why Stages pass the filter
      // and only Events are excluded -- ST31-005 Thousand Sunny is a legal target.
      const eligibleInstanceIds = player.hand
        .filter((card) => {
          const definition = db.require(card.cardNumber);
          return (
            definition.category !== "event" &&
            definition.types.includes("Straw Hat Crew") &&
            definition.cost === 1
          );
        })
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "free-play",
                playerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events,
      };
    },
  ],
  [
    "ST31-004",
    ({ state, playerId, source, db }) => {
      const remaining = fieldStrawHatCount(state, playerId, db);
      const targetPlayerId = playerId === "p1" ? "p2" : "p1";
      return {
        pending:
          remaining > 0 && state.players[targetPlayerId].board.length > 0
            ? {
                kind: "reduce-power",
                playerId,
                targetPlayerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                amount: -1000,
                expiresAtTurn: state.turn,
                remaining,
                applyAllAtOnce: true,
                resumePhase: "main",
                resumePlayerId: playerId,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "P-101",
    ({ player, playerId, source }) => {
      return {
        pending:
          player.restedDon.length > 0
            ? {
                kind: "give-rested-don",
                playerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds: [leaderInstanceId(playerId)],
                maxCount: 1,
                resumePhase: "main",
                resumePlayerId: playerId,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "ST32-001",
    ({ player, playerId, source, db }) => {
      return {
        pending:
          isSlash(player.leaderCardNumber, db) &&
          (player.activeDon.length > 0 || !player.leaderRested)
            ? {
                kind: "kinemon-cost",
                playerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "ST32-002",
    ({ state, playerId, source, db }) => {
      const events = drawCards(state, playerId, 1, source.cardNumber);
      const targetPlayerId = opponentOf(playerId);
      // "base cost", so the printed number: a cost-raising aura like Elbaph's
      // must not lift a Character out of this lock the way it lifts one out of
      // "cost 6 or less" removal.
      const eligibleInstanceIds = state.players[targetPlayerId].board
        .filter((card) => (db.require(card.cardNumber).cost ?? 0) <= 6)
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "prevent-rest",
                playerId,
                targetPlayerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
                expiresAtTurn: state.turn + 1,
              }
            : null,
        events,
      };
    },
  ],
  [
    "ST32-003",
    ({ player, playerId, source, db }) => {
      if (!isSlash(player.leaderCardNumber, db))
        return { pending: null, events: [] };
      const eligibleInstanceIds = player.hand
        .filter((card) => {
          const definition = db.require(card.cardNumber);
          return (
            definition.category === "character" &&
            definition.cost !== null &&
            definition.cost <= 5 &&
            (definition.name === "Perona" ||
              cardAttributes(definition).includes("Slash"))
          );
        })
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "free-play",
                playerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "ST32-004",
    ({ state, playerId, source }) => {
      return {
        pending: restEffect(state, playerId, source, 2, 2),
        events: [],
      };
    },
  ],
  [
    "ST32-005",
    ({ state, player, playerId, source, db }) => {
      if (!hasCardAttribute(player.leaderCardNumber, "Slash")) {
        return { pending: null, events: [] };
      }
      const targetPlayerId = playerId === "p1" ? "p2" : "p1";
      const eligibleInstanceIds = state.players[targetPlayerId].board
        .filter((card) => {
          const definition = db.require(card.cardNumber);
          return (
            !card.rested &&
            (card.cannotRestUntilTurn ?? -1) < state.turn &&
            (definition.cost ?? 0) <= 2
          );
        })
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length === 0
            ? null
            : {
                kind: "rest-character",
                playerId,
                targetPlayerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              },
        events: [],
      };
    },
  ],
  [
    "OP12-031",
    ({ state, playerId, source }) => {
      const pending = restEffect(
        state,
        playerId,
        source,
        6,
        1,
        "give-three-don-to-leader",
      );
      return {
        pending,
        events: pending
          ? []
          : applyAfterRest(state, playerId, "give-three-don-to-leader"),
      };
    },
  ],
  [
    "ST24-005",
    ({ state, playerId, source }) => {
      const pending = restEffect(
        state,
        playerId,
        source,
        5,
        1,
        "schedule-active-don",
      );
      return {
        pending,
        events: pending
          ? []
          : applyAfterRest(state, playerId, "schedule-active-don"),
      };
    },
  ],
  [
    "OP15-036",
    ({ state, playerId, source }) => {
      const targetPlayerId = opponentOf(playerId);
      const eligibleInstanceIds = state.players[targetPlayerId].board
        .filter(
          (card) =>
            card.rested && effectiveCost(state, targetPlayerId, card) <= 4,
        )
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "ko-character",
                playerId,
                targetPlayerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              }
            : null,
        events: [],
      };
    },
  ],
  [
    "ST35-001",
    ({ state, playerId, source, db }) => {
      const targetPlayerId = playerId === "p1" ? "p2" : "p1";
      const eligibleInstanceIds = state.players[targetPlayerId].board
        .filter((card) => (db.require(card.cardNumber).power ?? 0) <= 2000)
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length === 0
            ? null
            : {
                kind: "ko-character",
                playerId,
                targetPlayerId,
                sourceCardNumber: source.cardNumber,
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds,
              },
        events: [],
      };
    },
  ],
  [
    "P-105",
    ({ player, playerId, source }) => {
      const eligibleInstanceIds = [player.life[0], player.life.at(-1)]
        .filter((card): card is CardInstance => Boolean(card))
        .map((card) => card.instanceId);
      return {
        pending:
          eligibleInstanceIds.length > 0
            ? {
                kind: "p105-life-cost",
                playerId,
                sourceCardNumber: "P-105",
                sourceInstanceId: source.instanceId,
                eligibleInstanceIds: [...new Set(eligibleInstanceIds)],
              }
            : null,
        events: [],
      };
    },
  ],
  /**
   * ST36-002 Killer's `[On Play]` is the one clause here that reads the turn:
   * "[On Play] If your Leader has the {Kid Pirates} type, and it is your turn,
   * add the top card of your deck to the top of your Life."
   */
  [
    "ST36-002",
    ({ state, player, playerId, source }) => {
      if (
        state.turnPlayerId !== playerId ||
        !hasCardType(player.leaderCardNumber, "Kid Pirates") ||
        player.deck.length === 0
      ) {
        return noOnPlay();
      }
      return {
        pending: {
          kind: "add-top-deck-to-life",
          playerId,
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
        },
        events: [],
      };
    },
  ],
]);

/**
 * Every card whose `[On Play]` is an imperative handler.
 *
 * Exists for `test/on-play-dispatch.test.ts`, which walks it to check that each
 * one is reachable from a `card-played` signal -- the lookup the DSL's `play`
 * node depends on. A card migrated to a DSL program leaves this list, and the
 * test follows it there.
 */
export const onPlayHandlerCards = (): string[] => [...ON_PLAY_HANDLERS.keys()];

/** Whether `cardNumber`'s `[On Play]` is one of the imperative handlers. */
export const hasOnPlayHandler = (cardNumber: string): boolean =>
  ON_PLAY_HANDLERS.has(cardNumber);

/**
 * Run whatever `[On Play]` a card has, without the watchers.
 *
 * The half of `createOnPlayEffect` that is about the played card itself, split
 * out so `dispatchMechanicInvocations` can reach a handler for a card the DSL
 * put on the field. The watcher half stays with the caller, which is the only
 * one that knows what else is already queued behind this clause.
 */
export function runOnPlayHandler(
  state: GameState,
  playerId: PlayerId,
  source: CardInstance,
  db: CardDatabase = defaultCardDatabase,
): OnPlayResult {
  const handler = ON_PLAY_HANDLERS.get(source.cardNumber);
  if (!handler) return noOnPlay();
  return handler({
    state,
    player: state.players[playerId],
    playerId,
    source,
    db,
  });
}
