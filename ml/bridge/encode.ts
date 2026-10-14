/**
 * Numeric encoding of the engine's observation and legal actions, for RL.
 *
 * Everything here runs in Node, on the engine side of the bridge. That is
 * deliberate: a raw `GameObservation` serialises to ~23 KB, and at 4,000
 * actions/sec a Python trainer that received them would spend all its time in
 * `json.loads`. The trainer receives a fixed-width float array and an action
 * mask instead, which is ~2 KB and needs no parsing.
 *
 * Two encodings are produced for every decision, and a trainer picks one:
 *
 *   `mask`    -- a fixed action space, for algorithms that need one (DQN, NFSP,
 *                MaskablePPO). Built from a frozen table, see `action-table.ts`.
 *   `actions` -- per-legal-action feature rows, for a pointer/scoring network
 *                that ranks the variable-length legal list directly.
 *
 * The pointer rows cost almost nothing to emit alongside the mask, and keeping
 * both available is what stops the action-table decision from being load-bearing
 * before there is any evidence about which trains better.
 */
import type {
  CardFacts,
  GameObservation,
  LegalAction,
} from "@one-piece-sim/protocol";
import {
  FORMAT_DECK_IDS,
  requireSupportedDeck,
  sealedSetPrefix,
  SEALED_LEADER,
} from "@one-piece-sim/decks";
import { cardRegistry } from "@one-piece-sim/cards";

/** The sealed expansion the shipped RL checkpoint was trained on. See {@link CARD_VOCAB}. */
const TRAINED_SEALED_PREFIX = sealedSetPrefix("OP17");

/** Largest board either player can hold, measured over ~60k random decisions. */
export const MAX_BOARD = 5;

/**
 * Every card number in the format, sorted, as a stable index.
 *
 * 90 cards over the six format decks (14 unique per deck plus six Leaders),
 * plus the full OP17 set and the sealed wildcard Leader so a sealed pool's
 * cards are individually visible rather than collapsing to an anonymous bag.
 * Sorted rather than insertion-ordered so the index survives a deck being
 * added, reordered, or re-exported; a checkpoint trained against one vocabulary
 * is meaningless read against another.
 *
 * OP17 by name, not `DEFAULT_SEALED_EXPANSION`. Sealed now offers four
 * expansions, but the shipped checkpoint was trained against this vocabulary,
 * and widening it to every expansion would silently reindex every card the
 * weights were fitted to -- the exact "meaningless read against another" case
 * above. Retrain and re-export (`ml/python/export_web_policy.py`) before
 * changing this, and expect the learned sealed opponent to be OP17-only until
 * then.
 */
export const CARD_VOCAB: readonly string[] = (() => {
  const cards = new Set<string>();
  for (const deckId of FORMAT_DECK_IDS) {
    const deck = requireSupportedDeck(deckId);
    cards.add(deck.leader);
    for (const cardNumber of Object.keys(deck.cards)) cards.add(cardNumber);
  }
  cards.add(SEALED_LEADER);
  for (const cardNumber of cardRegistry.keys()) {
    if (cardNumber.startsWith(TRAINED_SEALED_PREFIX)) cards.add(cardNumber);
  }
  return [...cards].sort();
})();

const CARD_INDEX = new Map(CARD_VOCAB.map((card, index) => [card, index]));

const PHASES = [
  "mulligan",
  "main",
  "block",
  "counter",
  "trigger",
  "finished",
] as const;

export const ACTION_TYPES = [
  "mulligan-decision",
  "play-card",
  "resolve-effect",
  "attach-don",
  "activate-main",
  "attack",
  "block",
  "counter",
  "activate-counter-event",
  "resolve-trigger",
  "pass",
] as const;

const ACTION_TYPE_INDEX = new Map(
  ACTION_TYPES.map((type, index) => [type, index]),
);

/* ------------------------------------------------------------------ *
 * Instance -> stable position
 * ------------------------------------------------------------------ */

/**
 * The engine's Leader instance id for one seat.
 *
 * `GameObservation.self.leader` carries no `instanceId` -- a Leader is a fixed
 * seat rather than a card that moves between zones -- but legal actions still
 * address it by id, so a bridge has to reconstruct it. The engine builds these
 * as `` `${playerId}-leader` `` (engine.ts:121), which is stable but private, so
 * this is the one convention the bridge borrows rather than reads.
 */
function leaderInstanceId(
  observation: GameObservation,
  side: "self" | "opponent",
): string {
  const seat =
    side === "self"
      ? observation.viewer
      : observation.viewer === "p1"
        ? "p2"
        : "p1";
  return `${seat}-leader`;
}

/**
 * A canonical slot name for a card instance.
 *
 * Board arrays are in play order, so a Character's index shifts every time
 * something to its left is K.O.'d and the same policy input would mean a
 * different card from one turn to the next. Sorting by card number first makes
 * the slot a function of what is on the board rather than of its history.
 */
export function slotOf(
  observation: GameObservation,
  instanceId: string,
): string {
  if (instanceId === leaderInstanceId(observation, "self")) return "L";
  if (instanceId === leaderInstanceId(observation, "opponent")) return "l";
  if (instanceId === observation.self.stage?.instanceId) return "S";
  if (instanceId === observation.opponent.stage?.instanceId) return "s";

  const selfIndex = sortedBoard(observation.self.board).findIndex(
    (card) => card.instanceId === instanceId,
  );
  if (selfIndex >= 0) return `B${selfIndex}`;

  const opponentIndex = sortedBoard(observation.opponent.board).findIndex(
    (card) => card.instanceId === instanceId,
  );
  if (opponentIndex >= 0) return `b${opponentIndex}`;

  return "?";
}

function sortedBoard<T extends { cardNumber: string; instanceId: string }>(
  board: readonly T[],
): T[] {
  return [...board].sort(
    (left, right) =>
      left.cardNumber.localeCompare(right.cardNumber) ||
      left.instanceId.localeCompare(right.instanceId),
  );
}

/** Card number for any instance the viewer can currently identify. */
export function cardNumberOf(
  observation: GameObservation,
  instanceId: string,
): string {
  for (const card of observation.self.hand)
    if (card.instanceId === instanceId) return card.cardNumber;
  for (const card of observation.self.board)
    if (card.instanceId === instanceId) return card.cardNumber;
  for (const card of observation.opponent.board)
    if (card.instanceId === instanceId) return card.cardNumber;
  if (leaderInstanceId(observation, "self") === instanceId)
    return observation.self.leader.cardNumber;
  if (leaderInstanceId(observation, "opponent") === instanceId)
    return observation.opponent.leader.cardNumber;
  if (observation.self.stage?.instanceId === instanceId)
    return observation.self.stage.cardNumber;
  if (observation.opponent.stage?.instanceId === instanceId)
    return observation.opponent.stage.cardNumber;
  return "?";
}

/* ------------------------------------------------------------------ *
 * Canonical action keys
 * ------------------------------------------------------------------ */

/**
 * A stable, game-independent name for a decision.
 *
 * Instance ids are per-game, so they cannot appear in a key that has to mean the
 * same thing across episodes. Each action type is reduced to the fields that
 * actually carry the decision: identity for cards drawn from a deck the policy
 * knows, canonical slot for things on the board.
 *
 * `resolve-effect` keys on the typed `EffectOption` rather than on `optionId`,
 * which the protocol documents as opaque. That typed view is what keeps the
 * effect space finite: keying on the raw option payload instead produced 6,145
 * distinct effect keys against 1,905 for this encoding, because the payload
 * carries instance ids and live power values.
 */
export function actionKey(
  observation: GameObservation,
  action: LegalAction,
): string {
  const card = (instanceId: string) => cardNumberOf(observation, instanceId);
  const slot = (instanceId: string) => slotOf(observation, instanceId);

  switch (action.type) {
    case "mulligan-decision":
      return `mull:${action.decision}`;
    case "pass":
      return "pass";
    case "play-card":
      return `play:${card(action.cardInstanceId)}`;
    case "counter":
      return `ctr:${card(action.cardInstanceId)}`;
    case "activate-counter-event":
      return `ctrev:${card(action.eventInstanceId)}`;
    case "attach-don":
      return `don:${slot(action.targetInstanceId)}`;
    case "attack":
      return `atk:${slot(action.attackerInstanceId)}>${slot(action.targetInstanceId)}`;
    case "block":
      // The trailing slot is the frozen table's per-block flag. The block
      // window offers one kind of block -- rest a [Blocker] -- so it is always
      // 0, and it stays in the key because `action-table.json` is frozen and
      // the policy head is indexed by it.
      return `blk:${slot(action.blockerInstanceId)}:0`;
    case "resolve-trigger":
      return `trg:${action.sourceCardNumber}`;
    case "activate-main":
      return `main:${action.sourceCardNumber}:${
        action.targetInstanceId ? slot(action.targetInstanceId) : "-"
      }:${action.position ?? "-"}`;
    case "resolve-effect":
      return `eff:${action.sourceCardNumber}:${effectOptionKey(action.option)}`;
  }
}

function effectOptionKey(
  option: Extract<LegalAction, { type: "resolve-effect" }>["option"],
): string {
  switch (option.kind) {
    // Identity, not slot: "which card do I search out" is a decision about what
    // the card is. Slot-keying it collapsed distinct searches onto one action.
    case "card":
      return `card:${option.owner}:${option.zone}:${option.card.cardNumber}`;
    case "don-return":
      return `donret:${option.pool}`;
    case "confirm":
      return `confirm:${option.choice}`;
    case "position":
      return `pos:${option.position}`;
    case "resource":
      return `res:${option.resource}`;
    case "cost":
      return `cost:${Math.min(option.cost, 10)}`;
    case "mode":
      return `mode:${option.mode}`;
    case "skip":
      return "skip";
    default:
      return "other";
  }
}

/* ------------------------------------------------------------------ *
 * Observation feature vector
 * ------------------------------------------------------------------ */

const POWER_SCALE = 10000;

function pushSide(
  out: number[],
  side: GameObservation["self"] | GameObservation["opponent"],
  facts: Record<string, CardFacts>,
) {
  const handCount = "hand" in side ? side.hand.length : side.handCount;
  out.push(
    handCount / 10,
    side.deckCount / 50,
    side.lifeCount / 6,
    side.activeDon / 10,
    side.restedDon / 10,
    side.donDeckCount / 10,
    side.trash.length / 50,
    side.board.length / MAX_BOARD,
    side.stage ? 1 : 0,
  );

  out.push(
    side.leader.power / POWER_SCALE,
    side.leader.currentPower / POWER_SCALE,
    side.leader.rested ? 1 : 0,
    side.leader.attachedDon / 10,
  );

  /*
   * Leader identity, one-hot over the card vocabulary.
   *
   * Without this a policy cannot tell which deck it is piloting, or which it is
   * facing, except indirectly from whichever cards happen to have reached hand
   * or board -- and at turn 1 it has seen almost none of them. The Leader is
   * the one card that is on the field from the first decision to the last, it
   * names the archetype, and three of the six gate an ability behind a
   * `[DON!! xN]` threshold that changes how DON!! should be spent all game.
   *
   * This is what makes a single policy across all six decks coherent rather
   * than an average of six. It is a one-hot rather than a small dense id
   * because a new Leader then extends the vector instead of renumbering it.
   */
  out.push(...bag([side.leader.cardNumber]));

  const board = sortedBoard(side.board);
  for (let slot = 0; slot < MAX_BOARD; slot += 1) {
    const card = board[slot];
    if (!card) {
      out.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
      continue;
    }
    const fact = facts[card.cardNumber];
    out.push(
      1,
      card.cost / 10,
      card.power / POWER_SCALE,
      card.currentPower / POWER_SCALE,
      card.rested ? 1 : 0,
      card.blocker ? 1 : 0,
      card.summoningSick ? 1 : 0,
      card.attachedDon / 10,
      fact?.counter ? fact.counter / 2000 : 0,
    );
  }
}

/** Multi-hot / count vector over the card vocabulary. */
function bag(cardNumbers: readonly string[]): number[] {
  const counts = new Array<number>(CARD_VOCAB.length).fill(0);
  for (const cardNumber of cardNumbers) {
    const index = CARD_INDEX.get(cardNumber);
    if (index !== undefined) counts[index] = (counts[index] ?? 0) + 0.25;
  }
  return counts;
}

/**
 * Fixed-width observation features for the player to move.
 *
 * Every field is drawn from the viewer's own projection, so this inherits the
 * engine's hidden-information guarantee rather than restating it: there is no
 * path here to the opponent's hand or to face-down Life.
 */
export function encodeObservation(observation: GameObservation): number[] {
  const out: number[] = [];

  out.push(Math.min(observation.turn, 40) / 40);
  for (const phase of PHASES) out.push(observation.phase === phase ? 1 : 0);
  out.push(observation.activePlayer === observation.viewer ? 1 : 0);

  pushSide(out, observation.self, observation.cardFacts);
  pushSide(out, observation.opponent, observation.cardFacts);

  out.push(...bag(observation.self.hand.map((card) => card.cardNumber)));
  out.push(...bag(observation.self.board.map((card) => card.cardNumber)));
  out.push(...bag(observation.opponent.board.map((card) => card.cardNumber)));
  out.push(...bag(observation.self.trash.map((card) => card.cardNumber)));
  out.push(...bag(observation.opponent.trash.map((card) => card.cardNumber)));

  // Face-up Life is public and several decks turn Life face-up deliberately.
  out.push(
    ...bag(
      observation.self.life
        .filter((card) => card.faceUp && card.cardNumber)
        .map((card) => card.cardNumber!),
    ),
  );

  const battle = observation.activeBattle;
  out.push(
    battle ? 1 : 0,
    (battle?.attackPower ?? 0) / POWER_SCALE,
    (battle?.targetPower ?? 0) / POWER_SCALE,
    (battle?.counterPower ?? 0) / POWER_SCALE,
    (battle?.counterShortfall ?? 0) / POWER_SCALE,
  );

  return out;
}

/** Length of `encodeObservation`, computed once so Python never hardcodes it. */
export const OBSERVATION_SIZE = (() => {
  const perSide = 9 + 4 + CARD_VOCAB.length + MAX_BOARD * 9;
  return 1 + PHASES.length + 1 + perSide * 2 + CARD_VOCAB.length * 6 + 5;
})();

/* ------------------------------------------------------------------ *
 * Per-action feature rows, for a pointer network
 * ------------------------------------------------------------------ */

/**
 * Features for one legal action.
 *
 * The engine already computes the combat arithmetic a policy would otherwise
 * have to re-derive -- `attackPower`, `effectiveTargetPower`, `counterShortfall`,
 * `counterPower` -- and the protocol documents each as load-bearing for exactly
 * this reason. Passing them straight through means a network never has to learn
 * arithmetic the engine can state.
 */
export function encodeAction(
  observation: GameObservation,
  action: LegalAction,
): number[] {
  const out = new Array<number>(ACTION_TYPES.length).fill(0);
  out[ACTION_TYPE_INDEX.get(action.type) ?? 0] = 1;

  const cardIndex = new Array<number>(CARD_VOCAB.length).fill(0);
  const markCard = (cardNumber: string) => {
    const index = CARD_INDEX.get(cardNumber);
    if (index !== undefined) cardIndex[index] = 1;
  };

  let attackPower = 0;
  let targetPower = 0;
  let effectiveTargetPower = 0;
  let counterShortfall = 0;
  let unspentActiveDon = 0;
  let attackerIsBlocker = 0;
  let attackerIsLeader = 0;
  let counterPower = 0;
  let cost = 0;
  let power = 0;

  switch (action.type) {
    case "attack":
      markCard(cardNumberOf(observation, action.attackerInstanceId));
      markCard(cardNumberOf(observation, action.targetInstanceId));
      attackPower = action.attackPower ?? 0;
      targetPower = action.targetPower ?? 0;
      effectiveTargetPower = action.effectiveTargetPower ?? 0;
      counterShortfall = action.counterShortfall ?? 0;
      unspentActiveDon = action.unspentActiveDon ?? 0;
      attackerIsBlocker = action.attackerIsBlocker ? 1 : 0;
      attackerIsLeader = action.attackerIsLeader ? 1 : 0;
      break;
    case "counter":
      markCard(cardNumberOf(observation, action.cardInstanceId));
      counterPower = action.counterPower ?? 0;
      break;
    case "activate-counter-event":
      markCard(cardNumberOf(observation, action.eventInstanceId));
      counterPower = action.counterPower ?? 0;
      break;
    case "play-card": {
      const cardNumber = cardNumberOf(observation, action.cardInstanceId);
      markCard(cardNumber);
      const fact = observation.cardFacts[cardNumber];
      cost = fact?.cost ?? 0;
      power = fact?.power ?? 0;
      break;
    }
    case "attach-don":
      markCard(cardNumberOf(observation, action.targetInstanceId));
      break;
    case "block":
      markCard(cardNumberOf(observation, action.blockerInstanceId));
      break;
    case "activate-main":
      markCard(action.sourceCardNumber);
      if (action.targetInstanceId)
        markCard(cardNumberOf(observation, action.targetInstanceId));
      break;
    case "resolve-trigger":
      markCard(action.sourceCardNumber);
      break;
    case "resolve-effect":
      markCard(action.sourceCardNumber);
      if (action.option.kind === "card")
        markCard(action.option.card.cardNumber);
      break;
    case "pass":
      unspentActiveDon = action.unspentActiveDon ?? 0;
      break;
    default:
      break;
  }

  out.push(
    attackPower / POWER_SCALE,
    targetPower / POWER_SCALE,
    effectiveTargetPower / POWER_SCALE,
    counterShortfall / POWER_SCALE,
    unspentActiveDon / 10,
    attackerIsBlocker,
    attackerIsLeader,
    counterPower / 2000,
    cost / 10,
    power / POWER_SCALE,
  );
  out.push(...cardIndex);
  return out;
}

export const ACTION_FEATURE_SIZE = ACTION_TYPES.length + 10 + CARD_VOCAB.length;
